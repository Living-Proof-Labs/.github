// SPDX-License-Identifier: Apache-2.0
// Test-only transport. Every unrecognized host, endpoint or write fails closed.
import { readFileSync, appendFileSync } from 'node:fs';
export const policy = JSON.parse(readFileSync(new URL('../../config/github/repository-policy.json', import.meta.url)));
export const inventory = JSON.parse(readFileSync(new URL('../../config/github/repositories.json', import.meta.url)));
export function response(resource, { method = 'GET', body, mode = process.env.SETTINGS_FIXTURE_MODE ?? 'compliant' } = {}) {
  if (process.env.SETTINGS_REQUEST_LOG) appendFileSync(process.env.SETTINGS_REQUEST_LOG, `${method} ${resource}\n`);
  const url = new URL(resource, 'https://api.github.com/');
  if (url.origin !== 'https://api.github.com') throw new Error(`Forbidden host: ${url.origin}`);
  if (url.pathname === '/graphql') {
    if (!/^query\b/.test(body.query.trim())) throw new Error('Mutation forbidden');
    return { data: { repository: { id: `NODE_${body.variables.name ?? body.variables.repository}`, hasSponsorshipsEnabled: mode === 'drift' } } };
  }
  if (method !== 'GET') throw new Error(`Write forbidden: ${method}`);
  if (url.pathname === `/orgs/${inventory.owner}/repos`) return inventory.repositories.map(name => ({ name, archived: false }));
  const match = url.pathname.match(/^\/repos\/Living-Proof-Labs\/([^/]+)(.*)$/);
  if (!match || !inventory.repositories.includes(match[1])) throw new Error(`Unexpected endpoint: ${resource}`);
  const [, name, suffix] = match;
  const repo = { id: inventory.repositories.indexOf(name) + 1, full_name: `${inventory.owner}/${name}`, archived: false, disabled: false, visibility: 'public', default_branch: 'main', has_pages: true, ...policy.repository };
  if (!suffix) return { ...repo, ...(mode === 'drift' ? { has_wiki: true, has_projects: true } : {}) };
  if (suffix === '/immutable-releases') return { enabled: mode !== 'drift' };
  if (suffix === '/pages') return { build_type: mode === 'drift' ? 'legacy' : 'workflow', https_enforced: mode !== 'drift', cname: null, source: null };
  if (suffix === '/rulesets') return mode === 'drift' ? [] : [{ id: 1, name: policy.main_ruleset.name, source_type: 'Repository', source: repo.full_name }];
  if (suffix === '/rulesets/1') return { id: 1, source_type: 'Repository', source: repo.full_name, ...policy.main_ruleset };
  throw new Error(`Unexpected endpoint: ${resource}`);
}
// Loaded with NODE_OPTIONS for subprocess CLI tests, never production.
if (process.env.SETTINGS_MOCK_NETWORK === '1') globalThis.fetch = async (url, init = {}) => new Response(JSON.stringify(response(String(url), { method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined })));
export function fixtureApi(mode) {
  return { get: async p => response(p, { mode }), graphql: async (query, variables) => response('/graphql', { mode, method: 'POST', body: { query, variables } }), write: async () => { throw new Error('No fixture writes'); } };
}
