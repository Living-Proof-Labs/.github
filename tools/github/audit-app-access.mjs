// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

class EvidenceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const errorCode = error => error instanceof EvidenceError ? error.code : Number.isInteger(error.httpStatus) ? 'http-error' : 'read-failed';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const permissionMap = value => object(value) && Object.entries(value).every(([key, level]) => /^[a-z_]+$/.test(key) && ['read', 'write'].includes(level));
export function validateAccess(config) {
  if (config?.schema_version !== 1 || !/^[\w-]+$/.test(config.owner ?? '') || !Array.isArray(config.apps) || !config.apps.length) throw new Error('Invalid access configuration.');
  if (Object.keys(config).some(key => !['schema_version','owner','apps'].includes(key))) throw new Error('Unknown access configuration field.');
  const ids = new Set();
  for (const app of config.apps) {
    if (!object(app) || Object.keys(app).some(key => !['agent','app_id','app_slug','installation_id','manifest','permissions','justifications','repository_selection','repositories','scope_reason'].includes(key))) throw new Error('Unknown App configuration field.');
    if (!/^[a-z0-9-]+$/.test(app.agent ?? '') || !/^[a-z0-9-]+$/.test(app.app_slug ?? '') || !Number.isSafeInteger(app.app_id) || app.app_id < 1 || !Number.isSafeInteger(app.installation_id) || app.installation_id < 1 || ids.has(app.app_id) || ids.has(app.installation_id + ':installation') || ids.has(app.app_slug) || ids.has(app.agent + ':agent')) throw new Error('Invalid or duplicate App identity.');
    ids.add(app.app_id); ids.add(app.installation_id + ':installation'); ids.add(app.app_slug); ids.add(app.agent + ':agent');
    if (!permissionMap(app.permissions) || app.permissions.metadata !== 'read' || !object(app.justifications) || Object.keys(app.permissions).some(key => !app.justifications[key]?.trim())) throw new Error('Every permission needs a level and justification.');
    if (!['all','selected'].includes(app.repository_selection) || !Array.isArray(app.repositories) || app.repositories.some(name => typeof name !== 'string' || !new RegExp(`^${config.owner}/[A-Za-z0-9_.-]+$`).test(name)) || new Set(app.repositories).size !== app.repositories.length || (app.repository_selection === 'all' && app.repositories.length) || (app.repository_selection === 'selected' && !app.repositories.length) || !app.scope_reason?.trim()) throw new Error('Invalid repository scope.');
    if (!/^config\/github\/apps\/[\w.-]+\.manifest\.json$/.test(app.manifest ?? '')) throw new Error('Invalid manifest path.');
  }
  return config;
}

export function comparePermissions(desired, actual) {
  if (!permissionMap(actual)) return { status: 'unverified', reason: 'Permission map absent or invalid.' };
  const changes = [...new Set([...Object.keys(desired), ...Object.keys(actual)])].sort().filter(key => desired[key] !== actual[key]).map(permission => ({permission, before: actual[permission] ?? null, after: desired[permission] ?? null}));
  return {status: changes.length ? 'drift' : 'compliant', changes};
}

// Only registration and authoritative installation objects are compared. Token
// responses are deliberately never accepted as installation-grant evidence.
export function compareApp(config, desired, registration, installation) {
  const sameOwner = owner => typeof owner === 'string' && owner.toLowerCase() === config.owner.toLowerCase();
  const reg = registration?.id === desired.app_id && registration.slug === desired.app_slug && sameOwner(registration.owner?.login)
    ? comparePermissions(desired.permissions, registration.permissions) : {status:'unverified', reason:'Registration identity/owner not verified.'};
  const inst = installation?.id === desired.installation_id && installation.app_id === desired.app_id && sameOwner(installation.account?.login) && installation.target_type === 'Organization' && Object.hasOwn(installation, 'suspended_at') && installation.suspended_at === null
    ? comparePermissions(desired.permissions, installation.permissions) : {status:'unverified', reason:'Installation identity/owner not verified.'};
  let scope = {status:'unverified', reason:'Installation scope unavailable.'};
  if (inst.status !== 'unverified' && ['all','selected'].includes(installation.repository_selection)) {
    scope = installation.repository_selection !== desired.repository_selection
      ? {status:'drift', before:installation.repository_selection, after:desired.repository_selection}
      : desired.repository_selection === 'all'
        ? {status:'compliant', selection:'all'}
        : {status:'unverified', reason:'Selected repository membership requires complete authoritative evidence; token-visible repositories are not proof of installation scope.'};
  }
  const pendingAcceptance = reg.status === 'compliant' && inst.status === 'drift';
  const status = [reg,inst,scope].some(x => x.status === 'unverified') ? 'unverified' : [reg,inst,scope].some(x => x.status === 'drift') ? 'drift' : 'compliant';
  return {agent:desired.agent, status, registration:reg, installation:inst, scope, pending_acceptance_possible:pendingAcceptance,
    desired_scope: { selection: desired.repository_selection, repositories: desired.repositories },
    plan: status === 'compliant' ? [] : status === 'unverified' ? [{operation:'read-only', step:'Obtain complete authoritative registration and installation evidence before planning any access change; no apply is authorized by missing evidence.'}] : [
      {operation:'owner-website', step:'Review registration permission differences in App settings; save only approved changes.', url:`https://github.com/organizations/${config.owner}/settings/apps/${desired.app_slug}/permissions`},
      {operation:'owner-website', step:'Review and accept requested installation permissions and repository selection; do not recreate the App.', url:`https://github.com/organizations/${config.owner}/settings/installations/${desired.installation_id}`},
      {operation:'read-only', step:'Rerun this audit against the reviewed commit. Unverified evidence must be resolved before declaring reconciliation.'}
    ]};
}

export async function githubRead(endpoint, token, fetchImpl = fetch) {
  // Fixed destination and no redirect follow: never forward credentials elsewhere.
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('\\')) throw new Error('Invalid GitHub endpoint.');
  const url = new URL(endpoint, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com' || url.username || url.password) throw new Error('Invalid GitHub origin.');
  const response = await fetchImpl(url.href, {method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'living-proof-labs-access-audit',...(token ? {Authorization:`Bearer ${token}`} : {})}});
  if (!response.ok) { const error = new Error('GitHub read failed.'); error.httpStatus = response.status; throw error; }
  return response.json();
}

export async function collectInstallations(owner, read) {
  const entries = []; let total;
  for (let page = 1; page <= 1000; page++) {
    const data = await read(`/orgs/${owner}/installations?per_page=100&page=${page}`);
    if (!Number.isSafeInteger(data.total_count) || data.total_count < 0 || !Array.isArray(data.installations) || data.installations.length > 100) throw new EvidenceError('invalid-pagination');
    if (total !== undefined && total !== data.total_count) throw new EvidenceError('changing-pagination');
    total = data.total_count; entries.push(...data.installations);
    if (new Set(entries.map(x => x.id)).size !== entries.length || entries.length > total) throw new EvidenceError('inconsistent-pagination');
    if (entries.length === total) return entries;
    if (data.installations.length < 100) throw new EvidenceError('incomplete-pagination');
  }
  throw new EvidenceError('pagination-limit');
}

export async function audit(config, {read,revision,configDigest,now = () => new Date().toISOString()}) {
  validateAccess(config);
  const sources = []; let installations = [];
  try { installations = await collectInstallations(config.owner, read); sources.push({endpoint:`/orgs/${config.owner}/installations`, status:'complete'}); }
  catch (error) { sources.push({endpoint:`/orgs/${config.owner}/installations`,status:'unverified',failure:errorCode(error),http_status: Number.isInteger(error.httpStatus) ? error.httpStatus : null, reason:'Read failed, denied or incomplete; inspect authorization and retry. No response body or credentials logged.'}); }
  const results = [];
  for (const desired of config.apps) {
    let registration;
    const endpoint = `/apps/${desired.app_slug}`;
    try { registration = await read(endpoint); sources.push({endpoint,status:'read'}); }
    catch (error) { sources.push({endpoint,status:'unverified',failure:errorCode(error),http_status:Number.isInteger(error.httpStatus) ? error.httpStatus : null,reason:'Registration unreadable; private App visibility may require separate approved access.'}); }
    results.push(compareApp(config,desired,registration,installations.find(x => x.id === desired.installation_id)));
  }
  return {schema_version:1, observed_at:now(), configuration_revision:revision, configuration_sha256:configDigest, mode:'read-only', sources, results, status:results.every(x=>x.status==='compliant')?'compliant':'incomplete-or-drift'};
}

// Both commands use the same filesystem enrollment; installation policy is
// additional evidence, never a registration allowlist.
export async function auditManifestDirectory(config, options, root = process.cwd()) {
  const { loadManifestDirectory } = await import('./manifest-directory.mjs');
  const { plan } = await import('./bootstrap-apps.mjs');
  const enrolled = loadManifestDirectory(root);
  const report = await audit(config, options);
  report.registrations = await plan(enrolled.config, enrolled.manifests, options.read);
  report.missing_installation_policy = enrolled.config.apps.filter(app => !config.apps.some(policy => policy.manifest === app.manifest)).map(app => app.agent);
  if (report.missing_installation_policy.length || report.registrations.results.some(app => app.status !== 'verified')) report.status = 'incomplete-or-drift';
  return report;
}

export const usage = `Usage: node tools/github/audit-app-access.mjs [--check-config | --help]
Read-only GitHub App registration and installation permission audit.
Enrolls every config/github/apps/*.manifest.json; app-access.json adds installation policy. JSON report on stdout; nonzero on drift
or unavailable evidence. GH_TOKEN (or GITHUB_TOKEN) supplies existing authorized
read access. No credentials are created and no settings are changed.
--check-config validates desired state and manifest agreement without network.
Example: task github:apps:audit > app-access-audit.json`;

async function main() {
  try {
    const args=process.argv.slice(2);
    if (args.length===1 && args[0]==='--help') { console.log(usage); }
    else {
      if(args.length && !(args.length===1 && args[0]==='--check-config')) throw new Error(usage);
      const text=readFileSync('config/github/app-access.json','utf8'); const config=validateAccess(JSON.parse(text));
      for(const app of config.apps) if(comparePermissions(app.permissions,JSON.parse(readFileSync(app.manifest,'utf8')).default_permissions).status!=='compliant') throw new Error('Desired permissions and registration manifest differ.');
      const { loadManifestDirectory } = await import('./manifest-directory.mjs');
      const enrolled = loadManifestDirectory();
      if(args[0]==='--check-config') console.log('App access configuration and manifests agree.');
      else {
        const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
        const dirty=execFileSync('git',['status','--porcelain','--','config/github/app-access.json','config/github/agents.json',...enrolled.config.apps.map(x=>x.manifest)],{encoding:'utf8'}).trim();
        const report=await auditManifestDirectory(config,{read:endpoint=>githubRead(endpoint,process.env.GH_TOKEN||process.env.GITHUB_TOKEN),revision:dirty?`${revision}-dirty`:revision,configDigest:createHash('sha256').update(text).digest('hex')});
        console.log(JSON.stringify(report,null,2)); process.exitCode=report.status==='compliant'?0:1;
      }
    }
  } catch { console.error('App access audit could not complete. Check configuration, Git checkout and --help. No secrets logged.'); process.exitCode=1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
