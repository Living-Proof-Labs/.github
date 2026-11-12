// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';
import { normalizePrivateKey, signAppJwt } from './app-token.mjs';
import { validateAccess, compareApp, githubRead } from './audit-app-access.mjs';

// No installation tokens are minted. Each App can read its own registration and
// installations with a short-lived, locally signed request; no organization
// Administration permission or shared owner credential is required.
export function appReader(desired, env = process.env, fetchImpl = fetch) {
  const prefix = desired.agent.toUpperCase().replaceAll('-', '_');
  const id = env[`${prefix}_GITHUB_APP_ID`];
  if (id !== String(desired.app_id)) throw new Error('App identity must match reviewed configuration.');
  const key = normalizePrivateKey(env[`${prefix}_GITHUB_APP_PRIVATE_KEY`], `${prefix}_GITHUB_APP_PRIVATE_KEY`);
  return endpoint => {
    if (endpoint !== '/app' && !/^\/app\/installations(?:\?per_page=100&page=[1-9][0-9]*|\/[1-9][0-9]*)$/.test(endpoint)) throw new Error('Unexpected App audit endpoint.');
    const {jwt} = signAppJwt(desired.app_id, key);
    return githubRead(endpoint, jwt, fetchImpl);
  };
}

export async function collectAppInstallations(read, appId) {
  const entries = [];
  for (let page = 1; page <= 1000; page++) {
    const data = await read(`/app/installations?per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length > 100 || data.some(x => !Number.isSafeInteger(x?.id) || x.id < 1 || x.app_id !== appId)) throw new Error('Invalid installation page.');
    entries.push(...data);
    if (new Set(entries.map(x => x.id)).size !== entries.length) throw new Error('Duplicate installation evidence.');
    if (data.length < 100) return entries;
  }
  throw new Error('Installation pagination limit.');
}

export async function auditAsApp(config, agent, {readerFactory = appReader, revision, configDigest, now = () => new Date().toISOString()} = {}) {
  validateAccess(config);
  const desired = config.apps.find(app => app.agent === agent);
  if (!desired) throw new Error('Choose an enrolled App from the reviewed configuration.');
  const sources = [];
  let registration, installation;
  const record = (endpoint, status, extra = {}) => sources.push({endpoint, status, ...extra});
  try {
    const read = readerFactory(desired);
    registration = await read('/app');
    record('/app', 'read');
    // Verify identity before using another endpoint with this credential.
    if (registration?.id !== desired.app_id || registration.slug !== desired.app_slug || registration.owner?.login?.toLowerCase() !== config.owner.toLowerCase()) throw new Error('Registration identity mismatch.');
    const endpoint = `/app/installations/${desired.installation_id}`;
    const direct = await read(endpoint);
    record(endpoint, 'read');
    const installations = await collectAppInstallations(read, desired.app_id);
    record('/app/installations', 'complete', {count: installations.length});
    const listed = installations.find(item => item.id === desired.installation_id);
    // Compare security-relevant fields only: incidental timestamps may differ.
    const evidence = item => item && Object.fromEntries(['id','app_id','account','target_type','suspended_at','permissions','repository_selection'].map(key => [key,item[key]]));
    if (!listed || !isDeepStrictEqual(evidence(direct), evidence(listed))) throw new Error('Installation changed or was absent from complete listing.');
    installation = direct;
  } catch (error) {
    record('app-authenticated-collection', 'unverified', {
      http_status: Number.isInteger(error.httpStatus) ? error.httpStatus : null,
      reason: 'App authentication or complete, consistent evidence unavailable. Check the approved App key, identity and network authentication; no secrets or response bodies logged.'
    });
  }
  const result = compareApp(config, desired, registration, installation);
  return {schema_version:1, observed_at:now(), configuration_revision:revision, configuration_sha256:configDigest,
    mode:'read-only', authentication:'app-signed', audited_agents:[agent],
    excluded_agents:config.apps.filter(app => app.agent !== agent).map(app => app.agent),
    sources, results:[result], status:result.status === 'compliant' ? 'compliant' : 'incomplete-or-drift'};
}
