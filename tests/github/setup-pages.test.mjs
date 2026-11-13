// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { pagesOnlyApi, parseArgs, runPages } from '../../tools/github/setup-pages.mjs';
import { GitHubApiError } from '../../tools/github/apply-repo-policy.mjs';

const inventory = { schema_version: 1, owner: 'Living-Proof-Labs', repositories: ['alpha', 'beta', 'website', 'unitree-foxglove-sdk'] };
const policy = { repository: { has_wiki: false }, immutable_releases: true,
  graphql_repository: { hasSponsorshipsEnabled: true }, main_ruleset: { name: 'main' },
  pages: { build_type: 'workflow', https_enforced: true, https_enforced_exempt: [{ repo: 'website', reason: 'HTTPS terminated at Cloudflare' }] } };
const base = '/repos/Living-Proof-Labs/alpha';
function fixture(site = { build_type: 'legacy', cname: 'docs.example.org', source: { branch: 'main', path: '/docs' }, https_enforced: false }) {
  const state = { repo: { id: 123, full_name: 'Living-Proof-Labs/alpha', default_branch: 'main', visibility: 'public', archived: false, disabled: false, has_pages: Boolean(site) }, site: structuredClone(site), writes: [], reads: [], error: null, hook: null };
  const api = {
    async get(resource) {
      state.reads.push(resource);
      if (state.hook) state.hook(resource);
      if (resource === base) return structuredClone(state.repo);
      assert.equal(resource, `${base}/pages`);
      if (state.error) throw state.error;
      if (!state.site) throw new GitHubApiError(404, 'Not Found', 'GET', resource);
      return structuredClone(state.site);
    },
    async write(method, resource, body) {
      assert.equal(resource, `${base}/pages`);
      state.writes.push({ method, resource, body });
      if (state.writeError) throw state.writeError;
      if (method === 'POST') { state.site = { build_type: 'workflow', cname: null, https_enforced: false }; state.repo.has_pages = true; }
      else Object.assign(state.site, body);
      if (state.afterWrite) state.afterWrite();
    }
  };
  return { state, api, args: { api, inventory, repo: 'alpha', policy } };
}
async function preview(f) { return (await runPages({ ...f.args, dryRun: true })).plan; }
async function apply(f, expectedPlan) { return runPages({ ...f.args, dryRun: false, expectedPlan }); }

test('preview is read-only despite unrelated policy drift; apply preserves domain and is idempotent', async () => {
  const f = fixture();
  const plan = await preview(f);
  assert.equal(f.state.writes.length, 0);
  const result = await apply(f, plan);
  assert.equal(result.verified, true);
  assert.equal(result.after.site.cname, 'docs.example.org');
  assert.deepEqual(f.state.writes.map(w => [w.method, w.body]), [['PUT', { build_type: 'workflow' }], ['PUT', { https_enforced: true }]]);
  assert.deepEqual([...new Set(f.state.reads)], [base, `${base}/pages`]);
  f.state.writes = [];
  await apply(f, await preview(f));
  assert.equal(f.state.writes.length, 0);
});

test('missing site is created only after independently confirmed absence, then HTTPS readback', async () => {
  const f = fixture(null);
  await apply(f, await preview(f));
  assert.deepEqual(f.state.writes.map(w => [w.method, w.body]), [['POST', { build_type: 'workflow' }], ['PUT', { https_enforced: true }]]);
  assert.equal(f.state.site.cname, null);
});

for (const mutation of ['domain', 'source', 'https', 'identity', 'policy', 'inventory', 'plan']) {
  test(`stale ${mutation} rejects all writes`, async () => {
    const f = fixture();
    f.args = structuredClone({ inventory, policy, repo: 'alpha' }); f.args.api = f.api;
    const plan = await preview(f);
    if (mutation === 'domain') f.state.site.cname = 'changed.example.org';
    if (mutation === 'source') f.state.site.source.branch = 'new';
    if (mutation === 'https') f.state.site.https_enforced = true;
    if (mutation === 'identity') f.state.repo.id++;
    if (mutation === 'policy') f.args.policy.immutable_releases = false;
    if (mutation === 'inventory') f.args.inventory.repositories.push('gamma');
    if (mutation === 'plan') plan.setup.body.cname = null;
    await assert.rejects(apply(f, plan), /plan changed/);
    assert.equal(f.state.writes.length, 0);
  });
}

for (const field of ['archived', 'disabled', 'visibility', 'id', 'full_name', 'has_pages']) {
  test(`unreadable or ineligible repository ${field} fails closed`, async () => {
    const f = fixture(); delete f.state.repo[field];
    await assert.rejects(preview(f), /unverified/);
    assert.equal(f.state.writes.length, 0);
  });
}
for (const status of [401, 403, 404, 500]) {
  test(`existing site HTTP ${status} is never treated as absent`, async () => {
    const f = fixture(); f.state.error = new GitHubApiError(status, 'failure', 'GET', `${base}/pages`);
    await assert.rejects(preview(f)); assert.equal(f.state.writes.length, 0);
  });
}
test('incomplete Pages state and absent policy fail closed', async () => {
  for (const field of ['cname', 'build_type', 'https_enforced']) {
    const f = fixture(); delete f.state.site[field]; await assert.rejects(preview(f), /incomplete/);
  }
  const f = fixture(); f.args.policy = {}; await assert.rejects(preview(f), /Pinned policy/);
});
test('apply requires saved plan and an explicit inventoried nonexcluded repository', async () => {
  const f = fixture(); await assert.rejects(apply(f), /saved plan/);
  for (const repo of [undefined, 'all', 'absent', 'unitree-foxglove-sdk', '../alpha']) {
    await assert.rejects(runPages({ ...f.args, repo, dryRun: true }), /Select one/);
  }
  assert.equal(f.state.reads.length, 0);
});
test('state changing between plan check and write fails without writes', async () => {
  const f = fixture(); const plan = await preview(f); let reads = 0;
  f.state.hook = resource => { if (resource === base && ++reads === 2) f.state.site.cname = 'racing.example.org'; };
  await assert.rejects(apply(f, plan), /changed before write/);
  assert.equal(f.state.writes.length, 0);
});
test('setup readback must preserve domain before HTTPS can run', async () => {
  const f = fixture(); const plan = await preview(f);
  f.state.afterWrite = () => { f.state.site.cname = null; };
  await assert.rejects(apply(f, plan), /setup read-back/);
  assert.equal(f.state.writes.length, 1);
});
test('certificate failure reports partial setup and old plan cannot be replayed', async () => {
  const f = fixture(null); const plan = await preview(f);
  f.state.afterWrite = () => { f.state.writeError = new GitHubApiError(422, 'certificate not ready', 'PUT', `${base}/pages`); };
  await assert.rejects(apply(f, plan), /certificate not ready/);
  assert.equal(f.state.site.build_type, 'workflow');
  assert.equal(f.state.site.https_enforced, false);
  const count = f.state.writes.length;
  await assert.rejects(apply(f, plan), /plan changed/); assert.equal(f.state.writes.length, count);
});
test('HTTPS exemption reuses controller without HTTPS writes', async () => {
  const f = fixture(); f.args.policy = { ...policy, pages: { ...policy.pages, https_enforced_exempt: [{ repo: 'alpha', reason: 'external TLS' }] } };
  await apply(f, await preview(f));
  assert.deepEqual(f.state.writes.map(w => w.body), [{ build_type: 'workflow' }]);
});
test('write allowlist refuses methods, fields, paths, mixed payloads and dry-run writes', async () => {
  const f = fixture(); const guard = pagesOnlyApi(f.api, inventory, 'alpha', false);
  const bad = [
    ['PATCH', base, { has_wiki: false }], ['PUT', `${base}/immutable-releases`, undefined],
    ['POST', `${base}/rulesets`, {}], ['POST', '/graphql', { query: 'mutation {}' }],
    ['DELETE', `${base}/pages`, {}], ['PATCH', `${base}/pages`, { build_type: 'workflow' }],
    ['PUT', '/repos/Living-Proof-Labs/beta/pages', { build_type: 'workflow' }],
    ['PUT', `https://api.github.com${base}/pages`, { build_type: 'workflow' }],
    ['PUT', `${base}/pages?x=1`, { build_type: 'workflow' }],
    ...[{ cname: null }, { source: { branch: 'main', path: '/' } }, { https_enforced: false },
      { build_type: 'legacy' }, { build_type: 'workflow', cname: null }, {}, null, []].map(body => ['PUT', `${base}/pages`, body]),
    ['POST', `${base}/pages`, { https_enforced: true }]
  ];
  for (const args of bad) assert.throws(() => guard.write(...args), /write refused/);
  assert.throws(() => pagesOnlyApi(f.api, inventory, 'alpha', true).write('PUT', `${base}/pages`, { https_enforced: true }), /write refused/);
  assert.equal(f.state.writes.length, 0);
  assert.equal(guard.graphql, undefined);
});
test('CLI validates mode, plan files, duplicates and unknown or broad scope options', () => {
  assert.equal(parseArgs(['--help'])['--help'], true);
  for (const args of [[], ['--apply'], ['--repo', 'alpha', '--apply'],
    ['--repo', 'alpha', '--dry-run', '--apply'], ['--repo', 'alpha', '--repo', 'beta'],
    ['--org', 'Other'], ['--policy', 'other.json'], ['--apply-pages'], ['--repo']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['--repo', 'alpha', '--dry-run', '--plan-output', 'preview.json'])['--repo'], 'alpha');
});

test('successful malformed Pages responses never authorize creation', async () => {
  for (const body of [null, false, 0, '', [], 'missing']) {
    const f = fixture(null);
    const originalGet = f.api.get;
    f.api.get = resource => resource.endsWith('/pages') ? Promise.resolve(body) : originalGet(resource);
    await assert.rejects(preview(f), /not an object/);
    assert.equal(f.state.writes.length, 0);
  }
});
