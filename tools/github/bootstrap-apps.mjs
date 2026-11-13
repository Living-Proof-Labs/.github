// SPDX-License-Identifier: Apache-2.0
import { readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { collectInstallations, comparePermissions, githubRead } from './audit-app-access.mjs';
import { loadManifestDirectory, validateRegistrationManifest } from './manifest-directory.mjs';
import { createState, registrationForm } from './render-app-manifest-form.mjs';

const slug = value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
const id = value => Number.isSafeInteger(value) && value > 0;
const sameOwner = (actual, expected) => typeof actual === 'string' && actual.toLowerCase() === expected.toLowerCase();
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
export function validateConfig(config, manifests) {
  if (!keys(config, ['schema_version', 'owner', 'apps']) || config.schema_version !== 1 || config.owner !== 'Living-Proof-Labs' || !Array.isArray(config.apps) || !config.apps.length) throw new Error('Invalid bootstrap configuration.');
  const seen = new Set();
  for (const app of config.apps) {
    if (!keys(app, ['agent', 'manifest', 'candidate_slugs', 'identity']) || !slug(app.agent) || seen.has(app.agent) || app.manifest !== `config/github/apps/${app.agent}.manifest.json` || !Array.isArray(app.candidate_slugs) || !app.candidate_slugs.length || app.candidate_slugs.some(value => !slug(value)) || new Set(app.candidate_slugs).size !== app.candidate_slugs.length) throw new Error('Invalid configured App.');
    seen.add(app.agent);
    if (app.identity !== null) {
      if (!keys(app.identity, ['app_id', 'app_slug']) || !id(app.identity.app_id) || !slug(app.identity.app_slug) || seen.has(app.identity.app_id) || seen.has(app.identity.app_slug)) throw new Error('Invalid stored identity.');
      seen.add(app.identity.app_id); seen.add(app.identity.app_slug);
    }
    validateRegistrationManifest(app.agent, manifests[app.agent]);
  }
  return config;
}

// A successful installation list proves only what is installed, never what is
// registered. No REST response, including 404, is treated as proof of absence.
export async function plan(config, manifests, read) {
  validateConfig(config, manifests);
  let installations = [], discovery = 'complete';
  try {
    installations = await collectInstallations(config.owner, read);
    if (installations.some(item => !id(item.id) || !id(item.app_id) || !slug(item.app_slug) || item.target_type !== 'Organization' || !sameOwner(item.account?.login, config.owner))) throw new Error('Invalid installation identity.');
  } catch { installations = []; discovery = 'unverified'; }
  const cache = new Map();
  async function registration(appSlug) {
    if (!cache.has(appSlug)) {
      try { cache.set(appSlug, { value: await read(`/apps/${appSlug}`) }); }
      catch { cache.set(appSlug, { unavailable: true }); }
    }
    return cache.get(appSlug);
  }
  const results = [];
  for (const app of config.apps) {
    const manifest = manifests[app.agent];
    const result = { agent: app.agent, status: 'unverified', reason: 'Owner must inspect registered Apps; API discovery cannot prove absence.', manifest_sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
    if (app.identity) {
      const { value: found } = await registration(app.identity.app_slug);
      if (!found || found.id !== app.identity.app_id || found.slug !== app.identity.app_slug || found.owner?.type !== 'Organization' || !sameOwner(found.owner?.login, config.owner)) {
        result.reason = 'Stored identity is inaccessible or mismatched. Resolve it; never create a replacement.';
        results.push(result); continue;
      }
      result.identity = { ...app.identity };
      result.status = 'verified';
      result.reason = 'Stored registration identity verified; no changes.';
      if (found.name !== manifest.name || comparePermissions(manifest.default_permissions, found.permissions).status !== 'compliant' || !Array.isArray(found.events) || found.events.length) {
        result.status = 'drift'; result.reason = 'Review registration name, permissions or events with the owner; no changes applied.';
      }
    } else {
      const candidates = [];
      const slugs = new Set([...app.candidate_slugs, ...installations.map(item => item.app_slug)]);
      let conflict = false;
      for (const candidate of slugs) {
        const { value: found } = await registration(candidate);
        if (!found) continue;
        // Configured slugs belong to this role; a conflicting identity is never
        // ignored just because another candidate looks suitable.
        if (!id(found.id) || found.slug !== candidate || !slug(found.slug)) { conflict = true; continue; }
        if (found.name !== manifest.name || found.owner?.type !== 'Organization' || !sameOwner(found.owner?.login, config.owner)) {
          if (app.candidate_slugs.includes(candidate)) conflict = true;
          continue;
        }
        candidates.push(found);
      }
      if (conflict || candidates.length > 1) {
        result.status = 'ambiguous'; result.reason = 'Conflicting or multiple registrations; owner must resolve identity.';
      } else if (candidates.length === 1) {
        const found = candidates[0];
        result.identity = { app_id: found.id, app_slug: found.slug };
        result.status = 'adopt'; result.reason = 'Existing registration discovered. Review and commit this identity, then rerun; do not create another App.';
        if (comparePermissions(manifest.default_permissions, found.permissions).status !== 'compliant' || !Array.isArray(found.events) || found.events.length) {
          result.status = 'drift'; result.reason = 'Existing registration discovered with scope drift. Preserve its identity and review differences; no changes applied.';
        }
      }
    }
    // Installation access/acceptance is a separate owner action, never implied
    // by a verified registration or by generating a narrow installation token.
    const matches = result.identity ? installations.filter(item => item.app_id === result.identity.app_id) : [];
    result.installation = discovery !== 'complete' ? 'unverified' : matches.length === 0 ? 'not-observed' : matches.length !== 1 ? 'ambiguous' : matches[0].app_slug !== result.identity.app_slug || matches[0].suspended_at !== null || comparePermissions(manifest.default_permissions, matches[0].permissions).status !== 'compliant' ? 'review-required' : 'permissions-verified';
    results.push(result);
  }
  return { schema_version: 1, mode: 'read-only', discovery, results };
}

export const usage = `Usage: node tools/github/bootstrap-apps.mjs [--check-config | --prepare AGENT --directory NEW_DIRECTORY | --help]
Default: read-only plan for the manifest directory; JSON on stdout.
Use existing GH_TOKEN or GITHUB_TOKEN for authorized API reads. Never prints API
bodies or credentials. Exit 1 means adoption, drift or owner evidence is needed.
--prepare AGENT (the manifest filename stem) requires an interactive owner session and a NEW private
local directory outside the checkout. It verifies active organization ownership,
reruns discovery, then asks for a current inspection of ALL owned registrations.
Only exact owner confirmation generates a local manifest form; it does not POST,
create keys, install an App, or accept permissions. No unattended absence proof.
Example: task github:apps:bootstrap
Example: node tools/github/bootstrap-apps.mjs --prepare cody --directory /private/cody-registration
After registration, record the numeric App ID and slug through a PR and rerun.
Never repeat registration after an uncertain browser/conversion outcome; recover
that existing App in organization settings instead. See docs/GITHUB-APPS.md.`;

export async function prepare({ config, manifests, agent, directory, read, confirm, interactive, root = process.cwd() }) {
  validateConfig(config, manifests);
  const app = config.apps.find(item => item.agent === agent);
  if (!interactive || !app || app.identity || !path.isAbsolute(directory)) throw new Error('Preparation requires an interactive owner, unbound App, and absolute directory.');
  const parent = realpathSync(path.dirname(directory));
  const relative = path.relative(realpathSync(root), path.join(parent, path.basename(directory)));
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..') throw new Error('Keep registration files outside the checkout.');
  const membership = await read(`/user/memberships/orgs/${config.owner}`);
  if (membership.state !== 'active' || membership.role !== 'admin' || !sameOwner(membership.organization?.login, config.owner) || !slug(membership.user?.login?.toLowerCase())) throw new Error('Active organization ownership could not be verified.');
  const report = await plan(config, manifests, read);
  const result = report.results.find(item => item.agent === agent);
  // Inaccessible discovery remains unknown, not absent. Only direct, fresh
  // owner inspection can supply the missing authoritative registration evidence.
  if (result.status !== 'unverified' || result.identity) throw new Error('Existing or conflicting identity must be resolved before registration.');
  const phrase = `ABSENT ${config.owner}/${agent} ${result.manifest_sha256}`;
  const answer = await confirm(`Signed in as ${membership.user.login}. Inspect https://github.com/organizations/${config.owner}/settings/apps now, including renamed and uninstalled Apps. Coordinate with other owners. If access is incomplete or an App may already serve this role, STOP. Only if the complete owned registration list confirms absence of ${manifests[agent].name}, type exactly:\n${phrase}\n`);
  if (answer !== phrase) throw new Error('Owner did not confirm absence.');
  // Exclusive mkdir is the local retry guard. A partial write is deliberately
  // not cleaned up: an uncertain attempt requires inspection, never auto-retry.
  mkdirSync(directory, { mode: 0o700 });
  const state = createState();
  writeFileSync(path.join(directory, 'state'), `${state}\n`, { flag: 'wx', mode: 0o600 });
  writeFileSync(path.join(directory, 'registration.html'), registrationForm(manifests[agent], config.owner, state), { flag: 'wx', mode: 0o600 });
  writeFileSync(path.join(directory, 'owner-confirmation.json'), JSON.stringify({ agent, owner: config.owner, confirmed_by: membership.user.login, confirmed_at: new Date().toISOString(), manifest_sha256: result.manifest_sha256, source: 'interactive-owner-registration-inventory-inspection' }, null, 2), { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log(usage);
    else {
      const { config, manifests } = loadManifestDirectory();
      validateConfig(config, manifests);
      const read = endpoint => githubRead(endpoint, process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
      if (args.length === 1 && args[0] === '--check-config') console.log('App bootstrap configuration and manifests are valid.');
      else if (args.length === 4 && args[0] === '--prepare' && args[2] === '--directory') {
        const terminal = createInterface({ input: process.stdin, output: process.stdout });
        try { await prepare({ config, manifests, agent: args[1], directory: path.resolve(args[3]), read, interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI, confirm: question => terminal.question(question) }); }
        finally { terminal.close(); }
        console.log('Owner-confirmed local form prepared. Start the loopback callback receiver before opening registration.html. See docs/GITHUB-APPS.md; never upload these files.');
      } else if (args.length === 0) {
        const report = await plan(config, manifests, read);
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.results.every(item => item.status === 'verified' && item.installation === 'permissions-verified') ? 0 : 1;
      } else throw new Error('Invalid arguments.');
    }
  } catch { console.error('Bootstrap incomplete. Check owner access, configuration and --help. No credentials or API bodies logged.'); process.exitCode = 1; }
}
