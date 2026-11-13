// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInventory, validateConfiguration, junit, writeSettings, main } from '../../tools/github/reconcile-inventory.mjs';
import { GitHubApiError } from '../../tools/github/apply-repo-policy.mjs';
const canonical = JSON.parse(readFileSync(new URL('../../config/github/repositories.json', import.meta.url)));
const policy = JSON.parse(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url)));
const revision = 'a'.repeat(40);
function fixture(names = canonical.repositories) {
  const inventory = { ...canonical, repositories: names };
  const p = structuredClone(policy);
  if (!names.includes('website')) delete p.pages.https_enforced_exempt;
  const states = Object.fromEntries(names.map((name, i) => [name, {
    repo: { id: i + 1, full_name: `${inventory.owner}/${name}`, archived: false, disabled: false, visibility: 'public', default_branch: 'main', has_pages: true, ...p.repository },
    pages: { build_type: 'workflow', https_enforced: true, cname: null, source: null },
    immutable: { enabled: true }, sponsorship: { id: `NODE_${name}`, hasSponsorshipsEnabled: false },
    ruleset: { id: 1, ...structuredClone(p.main_ruleset) }
  }]));
  const writes = [], reads = [];
  const f = { inventory, policy: p, revision, states, writes, reads };
  f.api = {
    async get(resource) {
      reads.push(resource); if (f.onRead) await f.onRead(resource);
      const match = resource.match(/^\/repos\/Living-Proof-Labs\/([^/]+)(.*)$/);
      assert.ok(match, `Unexpected read: ${resource}`);
      const [, name, suffix] = match, state = states[name]; assert.ok(state);
      if (f.failRead?.(name, suffix)) throw new GitHubApiError(403, 'denied', 'GET', resource);
      if (suffix === '') return structuredClone(state.repo);
      if (suffix === '/pages') {
        if (state.pages === null) throw new GitHubApiError(404, 'missing', 'GET', resource);
        return structuredClone(state.pages);
      }
      if (suffix === '/immutable-releases') {
        if (state.immutable === null) throw new GitHubApiError(404, 'unknown', 'GET', resource);
        return structuredClone(state.immutable);
      }
      if (suffix === '/rulesets') return state.ruleset ? [{ id: 1, name: p.main_ruleset.name }] : [];
      if (suffix === '/rulesets/1') return structuredClone(state.ruleset);
      assert.fail(`Unexpected read: ${resource}`);
    },
    async write(method, resource, body) {
      writes.push({ method, resource, body });
      if (f.onWrite) await f.onWrite(method, resource, body);
      const [, name, suffix] = resource.match(/^\/repos\/Living-Proof-Labs\/([^/]+)(.*)$/), state = states[name];
      if (f.dropWrites) return;
      if (method === 'PATCH' && suffix === '') Object.assign(state.repo, body);
      else if (method === 'PUT' && suffix === '/immutable-releases' && body === undefined) state.immutable = { enabled: true };
      else if (['POST','PUT'].includes(method) && suffix === '/pages') {
        assert.ok(Object.keys(body).every(k => ['build_type','https_enforced'].includes(k)));
        assert.notEqual(body.https_enforced, false);
        if (!state.pages) state.pages = { build_type: 'workflow', cname: null, source: null, https_enforced: false };
        Object.assign(state.pages, body); state.repo.has_pages = true;
      } else assert.fail(`Forbidden write: ${method} ${resource}`);
    },
    async graphql(query, variables) {
      if (query.trim().startsWith('query')) return { data: { repository: structuredClone(states[variables.name].sponsorship) } };
      const name = variables.id.replace('NODE_', ''); assert.ok(states[name]);
      writes.push({ graphql: true, name, variables }); states[name].sponsorship.hasSponsorshipsEnabled = variables.enabled;
      return { data: { updateRepository: { repository: states[name].sponsorship } } };
    }
  };
  f.preview = () => runInventory({ ...f, dryRun: true });
  f.apply = expectedPlan => runInventory({ ...f, dryRun: false, expectedPlan: expectedPlan ? JSON.parse(JSON.stringify(expectedPlan)) : undefined });
  return f;
}

test('complete canonical inventory including Foxglove is assessed, with zero preview/compliant writes', async () => {
  const f = fixture(); const preview = await f.preview();
  assert.deepEqual(preview.repositories.map(r => r.name), canonical.repositories);
  assert.equal(preview.failures, 0); assert.equal(f.writes.length, 0);
  const applied = await f.apply(preview.plan); assert.equal(applied.failures, 0); assert.equal(f.writes.length, 0);
  assert.equal((junit(applied).match(/<testcase /g) ?? []).length, canonical.repositories.length);
});
test('normal reconciliation repairs general, sponsorship, known immutable, Pages source and HTTPS, then is idempotent', async () => {
  const f = fixture(['first', 'second']);
  f.states.first.repo.has_wiki = true; f.states.first.sponsorship.hasSponsorshipsEnabled = true;
  f.states.first.immutable.enabled = false; f.states.first.pages.build_type = 'legacy'; f.states.first.pages.https_enforced = false;
  f.states.first.pages.cname = 'docs.example.com';
  const preview = await f.preview(); assert.equal(f.writes.length, 0);
  const applied = await f.apply(preview.plan); assert.equal(applied.failures, 0, JSON.stringify(applied));
  assert.equal(f.states.first.pages.cname, 'docs.example.com'); assert.equal(f.writes.length, 5);
  const count = f.writes.length; const again = await f.preview(); assert.equal(again.repositories[0].status, 'compliant');
  assert.equal((await f.apply(again.plan)).failures, 0); assert.equal(f.writes.length, count);
});
test('missing required Pages creates workflow site and enforces HTTPS with final readback', async () => {
  const f = fixture(['unitree-foxglove-sdk']); f.states['unitree-foxglove-sdk'].pages = null; f.states['unitree-foxglove-sdk'].repo.has_pages = false;
  const preview = await f.preview(); assert.equal(preview.repositories[0].status, 'planned'); assert.equal(preview.plan.repositories[0].pages.setup.method, 'POST');
  assert.equal((await f.apply(preview.plan)).failures, 0); assert.deepEqual(f.writes.map(w => w.method), ['POST', 'PUT']);
});
test('website HTTPS exemption is unmanaged even when false; general and Pages setup still reconcile', async () => {
  const f = fixture(['website']); f.states.website.pages.https_enforced = false; f.states.website.pages.build_type = 'legacy'; f.states.website.repo.has_wiki = true;
  const preview = await f.preview(); assert.match(preview.plan.repositories[0].pages.https, /Cloudflare/);
  assert.equal((await f.apply(preview.plan)).failures, 0); assert.equal(f.states.website.pages.https_enforced, false);
  assert.ok(f.writes.every(w => !Object.hasOwn(w.body ?? {}, 'https_enforced')));
});
test('unreadable repository does not hide the remaining inventory or authorize writes', async () => {
  const f = fixture(['first','second','third']); f.failRead = name => name === 'first'; f.states.second.repo.has_wiki = true;
  const preview = await f.preview(); const report = await f.apply(preview.plan);
  assert.equal(report.repositories.length, 3); assert.equal(report.repositories[0].status, 'unresolved'); assert.equal(report.repositories[1].status, 'verified');
  assert.equal(f.writes.length, 1); assert.match(f.writes[0].resource, /second$/);
});
test('write failure and certificate-not-ready are reported with readback and do not stop later repositories', async () => {
  const f = fixture(['first','second','third']); for (const state of Object.values(f.states)) state.repo.has_wiki = true;
  f.states.second.pages.https_enforced = false;
  f.onWrite = async (_method, resource) => { if (resource.endsWith('/first')) throw new Error('write denied'); if (resource.endsWith('/second/pages')) throw new GitHubApiError(422, 'certificate not ready', 'PUT', resource); };
  const report = await f.apply((await f.preview()).plan);
  assert.equal(report.failures, 2); assert.match(JSON.stringify(report.repositories[1].failures), /certificate/);
  assert.equal(report.repositories[1].after.pagesAudit.before.site.https_enforced, false);
  assert.equal(report.repositories[2].status, 'verified'); assert.equal(f.states.third.repo.has_wiki, false);
});
test('ambiguous immutable 404 is unresolved and never enables immutability blindly', async () => {
  const f = fixture(['first']); f.states.first.immutable = null; f.states.first.repo.has_wiki = true;
  const report = await f.apply((await f.preview()).plan); assert.equal(report.failures, 1);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].method, 'PATCH'); assert.match(JSON.stringify(report), /unverified/);
});
test('stronger existing rules and missing rulesets are reported and never modified', async () => {
  const f = fixture(['first','second']); f.states.first.ruleset.rules.find(r => r.type === 'pull_request').parameters.required_approving_review_count = 2; f.states.second.ruleset = null;
  const report = await f.apply((await f.preview()).plan); assert.equal(report.failures, 2); assert.equal(f.writes.length, 0);
  assert.match(JSON.stringify(report), /separate review required/);
});
test('stale repository state blocks only that repository and preserves subsequent work', async () => {
  const f = fixture(['first','second']); f.states.first.repo.has_wiki = true; f.states.second.repo.has_wiki = true;
  const preview = await f.preview(); f.states.first.repo.default_branch = 'other';
  const report = await f.apply(preview.plan); assert.equal(report.failures, 1); assert.equal(f.writes.length, 1); assert.match(f.writes[0].resource, /second$/);
});
for (const change of ['revision','inventory','policy','truncated','reordered','tampered']) test(`saved plan rejects ${change} without unintended writes`, async () => {
  const f = fixture(['first','second']); f.states.first.repo.has_wiki = true;
  const plan = (await f.preview()).plan;
  if (['revision','inventory','policy'].includes(change)) plan[change] = 'bad';
  if (change === 'truncated') plan.repositories.pop();
  if (change === 'reordered') plan.repositories.reverse();
  if (change === 'tampered') plan.repositories[0].settings.writes[0].body.has_wiki = true;
  if (change === 'tampered') assert.equal((await f.apply(plan)).failures, 1);
  else await assert.rejects(f.apply(plan), /Saved plan/);
  assert.equal(f.writes.length, 0);
});
test('racing state before a write and successful responses with failed readback stop settings writes', async () => {
  const f = fixture(['first']); f.states.first.repo.has_wiki = true;
  const preview = await f.preview(); let count = 0;
  f.onRead = resource => { if (resource.endsWith('/first') && ++count === 3) f.states.first.repo.has_issues = false; };
  const result = await f.apply(preview.plan); assert.equal(result.failures, 1); assert.equal(f.writes.length, 0);
  const g = fixture(['first']); g.states.first.repo.has_wiki = true; g.states.first.immutable.enabled = false; g.dropWrites = true;
  const failed = await g.apply((await g.preview()).plan); assert.equal(failed.failures, 1); assert.equal(g.writes.length, 1); assert.match(JSON.stringify(failed), /readback failed/);
});
test('unknown/malformed Pages and repository identity never authorize creation', async () => {
  for (const broken of [null, {}, [], 'bad']) {
    const f = fixture(['first']); f.states.first.pages = broken;
    const report = await f.apply((await f.preview()).plan); assert.equal(report.failures, 1); assert.equal(f.writes.length, 0);
  }
  const f = fixture(['first']); f.states.first.repo.id = undefined;
  assert.equal((await f.apply((await f.preview()).plan)).failures, 1); assert.equal(f.writes.length, 0);
});
test('exceptions require known unique repositories and reasons; downgrade policy is rejected before API calls', async () => {
  for (const entries of [[{ repo: 'unknown', reason: 'external HTTPS' }], [{ repo: 'website', reason: '' }], [{ repo: 'website', reason: 'x' }, { repo: 'website', reason: 'y' }]]) {
    const f = fixture(['website']); f.policy.pages.https_enforced_exempt = entries;
    await assert.rejects(f.preview()); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
  const f = fixture(['website']); f.policy.pages.https_enforced = false; assert.throws(() => validateConfiguration(f.inventory, f.policy));
});
test('fresh plan required for apply; no writes without explicit mode and binding', async () => {
  const f = fixture(['first']); await assert.rejects(f.apply()); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});

test('a final Pages audit detects drift after an earlier successful readback', async () => {
  const f = fixture(['first']); const preview = await f.preview(); let pagesReads = 0;
  f.onRead = resource => { if (resource.endsWith('/pages') && ++pagesReads === 5) f.states.first.pages.https_enforced = false; };
  const report = await f.apply(preview.plan);
  assert.equal(report.failures, 1); assert.match(JSON.stringify(report.repositories[0].failures), /drift remains/);
});
test('saved source fixture matches the checked-in released policy blob pin', async () => {
  const { gitBlobSha } = await import('../../tools/github/apply-repo-policy.mjs');
  const pin = JSON.parse(readFileSync(new URL('../../config/github/repository-policy.json', import.meta.url)));
  assert.equal(gitBlobSha(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url))), pin.policy_blob_sha);
});

test('audit-only ruleset visibility changes do not invalidate reviewed settings', async () => {
  const f = fixture(['first']); f.states.first.repo.has_wiki = true;
  f.failRead = (_name, suffix) => suffix.startsWith('/rulesets');
  const preview = await f.preview(); assert.equal(preview.failures, 1);
  f.failRead = undefined;
  const report = await f.apply(preview.plan); assert.equal(report.failures, 0); assert.equal(f.writes.length, 1);
});
test('newly readable writable state does not silently expand approval', async () => {
  const f = fixture(['first']); f.states.first.immutable = null; f.states.first.repo.has_wiki = true;
  const preview = await f.preview(); f.states.first.immutable = { enabled: false };
  assert.equal((await f.apply(preview.plan)).failures, 1); assert.equal(f.writes.length, 0);
});
test('write transport rejects unrelated paths, fields, methods and GraphQL before API calls', async () => {
  const f = fixture(['first']);
  for (const write of [
    { setting: 'repository', method: 'PATCH', path: '/repos/Living-Proof-Labs/other', body: { has_wiki: false } },
    { setting: 'repository', method: 'PATCH', path: '/repos/Living-Proof-Labs/first', body: { private: false } },
    { setting: 'repository', method: 'DELETE', path: '/repos/Living-Proof-Labs/first', body: { has_wiki: false } },
    { setting: 'repository', method: 'PATCH', path: '/repos/Living-Proof-Labs/first', body: { has_wiki: true } },
    { setting: 'main_ruleset', method: 'PUT', path: '/repos/Living-Proof-Labs/first/rulesets/1', body: {} },
    { setting: 'immutable_releases', method: 'DELETE', path: '/repos/Living-Proof-Labs/first/immutable-releases' },
    { setting: 'graphql.hasSponsorshipsEnabled', graphql: { query: 'mutation { deleteRepository }', variables: { id: 'NODE_first', enabled: false } } }
  ]) await assert.rejects(writeSettings(f.api, f.inventory, 'first', f.policy, write), /refused/);
  assert.equal(f.writes.length, 0);
});

test('CLI preview and apply retain parseable complete reports with mocked transport only', async () => {
  const f = fixture(); f.states.livingproof.repo.has_wiki = true;
  const directory = mkdtempSync(path.join(tmpdir(), 'inventory-cli-'));
  const planFile = path.join(directory, 'plan.json'), reportFile = path.join(directory, 'report.json'), xmlFile = path.join(directory, 'result.xml');
  let stdout = '', stderr = ''; const requests = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url); requests.push({ url: String(url), method: init.method ?? 'GET' });
    assert.equal(init.redirect, 'error');
    if (u.hostname === 'raw.githubusercontent.com') return new Response(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url)));
    assert.equal(u.origin, 'https://api.github.com');
    try {
      let value;
      if (u.pathname === '/graphql') { const body = JSON.parse(init.body); value = await f.api.graphql(body.query, body.variables); }
      else if (init.method === 'GET') value = await f.api.get(u.pathname);
      else value = await f.api.write(init.method, u.pathname, init.body ? JSON.parse(init.body) : undefined);
      return new Response(JSON.stringify(value ?? {}));
    } catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: error.status ?? 500 }); }
  };
  const dependencies = { env: { GH_TOKEN: 'test-token-never-live' }, fetchImpl, io: { stdout: { write: s => stdout += s }, stderr: { write: s => stderr += s } } };
  assert.equal(await main(['--dry-run', '--plan-output', planFile, '--report-output', reportFile, '--junit', xmlFile], dependencies), 0, stderr);
  assert.equal(f.writes.length, 0); assert.equal(JSON.parse(readFileSync(planFile)).repositories.length, canonical.repositories.length);
  assert.equal(await main(['--apply', '--expected-plan', planFile, '--report-output', reportFile, '--junit', xmlFile], dependencies), 0, stderr);
  assert.equal(f.writes.length, 1); assert.equal(JSON.parse(readFileSync(reportFile)).failures, 0);
  assert.equal((readFileSync(xmlFile, 'utf8').match(/<testcase /g) ?? []).length, canonical.repositories.length);
  assert.equal(stdout.includes('test-token-never-live'), false); assert.equal(stderr, '');
});
test('CLI invalid scope and missing plan fail before network requests', async () => {
  for (const argv of [['--apply'], ['--dry-run', '--repo', 'first'], ['--dry-run','--apply'], ['--dry-run','--dry-run']]) {
    let calls = 0;
    assert.equal(await main(argv, { env: {}, fetchImpl: async () => { calls++; throw new Error('unexpected'); }, io: { stdout: { write() {} }, stderr: { write() {} } } }), 1);
    assert.equal(calls, 0);
  }
});
