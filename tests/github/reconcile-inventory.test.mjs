// SPDX-License-Identifier: Apache-2.0
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { annotateRulesets } from '../../tools/github/audit-rulesets.mjs';
import { decide } from '../../tools/github/audit-status.mjs';
import { runInventory, validateConfiguration, junit, writeSettings, main } from '../../tools/github/reconcile-inventory.mjs';
import { rulesetPlan, applyRuleset } from '../../tools/github/reconcile-ruleset.mjs';
import { GitHubApiError, createGitHubClient } from '../../tools/github/apply-repo-policy.mjs';
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
    ruleset: { id: 1, source_type: 'Repository', source: `${inventory.owner}/${name}`, ...structuredClone(p.main_ruleset) }
  }]));
  const writes = [], reads = [];
  const f = { inventory, policy: p, revision, states, writes, reads, delays: [] };
  f.wait = async ms => { f.delays.push(ms); };
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
      if (suffix.startsWith('/rulesets?')) return state.ruleset ? [{ id: 1, name: p.main_ruleset.name, source_type: state.ruleset.source_type, source: state.ruleset.source }] : [];
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
      else if (['POST','PUT'].includes(method) && ['/rulesets', '/rulesets/1'].includes(suffix)) state.ruleset = { id: 1, source_type: 'Repository', source: state.repo.full_name, ...structuredClone(body) };
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

describe('Inventory reconciliation safety', () => {

test('write-capable preview credential cannot send REST writes or GraphQL mutations', () => {
  let requests = 0;
  const api = createGitHubClient({ token: 'simulated-administration-write-token', allowWrites: false,
    fetchImpl: async () => { requests++; throw new Error('Unexpected transport'); } });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(() => api.write(method, '/repos/Living-Proof-Labs/example/rulesets', {}), /Dry.run|dry.run/i);
  }
  assert.throws(() => api.graphql('mutation { updateRepository(input: {}) { clientMutationId } }'), /Dry.run|dry.run/i);
  assert.equal(requests, 0);
  const controller = readFileSync(new URL('../../tools/github/reconcile-inventory.mjs', import.meta.url), 'utf8');
  assert.match(controller, /createGitHubClient\(\{ token, fetchImpl, allowWrites: !dryRun \}\)/);
});

test('omitted bypass evidence and actual actors have distinct unresolved diagnoses', async () => {
  const missing = fixture(['first']);
  delete missing.states.first.ruleset.bypass_actors;
  const unknown = await missing.preview();
  assert.match(JSON.stringify(unknown.repositories[0].failures), /unreadable, not known to exist/);
  assert.doesNotMatch(JSON.stringify(unknown.repositories[0].failures), /Existing bypass actors require/);
  const actors = fixture(['first']);
  actors.states.first.ruleset.bypass_actors = [{ actor_id: 5, actor_type: 'Team', bypass_mode: 'always' }];
  const present = await actors.preview();
  assert.match(JSON.stringify(present.repositories[0].failures), /Existing bypass actors require/);
  assert.equal(missing.writes.length, 0);
  assert.equal(actors.writes.length, 0);
});


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
for (const staleReads of [1, 3]) test(`immutable readback converges after ${staleReads} stale snapshots without duplicate writes`, async () => {
  const f = fixture(['first']); f.states.first.immutable.enabled = false;
  const plan = (await f.preview()).plan;
  const get = f.api.get; let reads = 0;
  f.api.get = async resource => {
    if (f.writes.length && resource.endsWith('/immutable-releases') && ++reads <= staleReads) return { enabled: false };
    return get(resource);
  };
  const report = await f.apply(plan), evidence = report.repositories[0].settingsReadbacks[0];
  assert.equal(report.failures, 0); assert.equal(f.writes.length, 1);
  assert.equal(evidence.outcome, 'converged'); assert.equal(evidence.attempts.length, staleReads + 1);
  assert.deepEqual(f.delays, [1000, 2000, 4000].slice(0, staleReads));
  assert.equal(evidence.before.immutableReleases.enabled, false); assert.equal(evidence.expected.immutableReleases.enabled, true);
  assert.equal(evidence.attempts[0].observed.immutableReleases.enabled, false);
  assert.equal(evidence.attempts.at(-1).observed.immutableReleases.enabled, true);
  assert.deepEqual(report.repositories[0].after.settings.lines, []);
});
test('converged general readback permits each remaining reviewed setting once', async () => {
  const f = fixture(['first']); f.states.first.repo.has_wiki = true;
  f.states.first.sponsorship.hasSponsorshipsEnabled = true; f.states.first.immutable.enabled = false;
  const plan = (await f.preview()).plan, get = f.api.get; let stale = true;
  f.api.get = async resource => {
    const value = await get(resource);
    if (f.writes.length === 1 && resource.endsWith('/first') && stale) { value.has_wiki = true; stale = false; }
    return value;
  };
  const report = await f.apply(plan);
  assert.equal(report.failures, 0); assert.equal(f.writes.length, 3);
  assert.deepEqual(report.repositories[0].settingsReadbacks.map(r => r.outcome), ['converged', 'matched', 'matched']);
  assert.deepEqual(f.delays, [1000]);
});
test('unchanged unknown pre-write state does not qualify for retry', async () => {
  const f = fixture(['first']); f.states.first.repo.has_wiki = true; f.states.first.immutable = null;
  f.dropWrites = true;
  const report = await f.apply((await f.preview()).plan);
  assert.equal(report.failures, 1); assert.equal(f.writes.length, 1); assert.deepEqual(f.delays, []);
  assert.equal(report.repositories[0].settingsReadbacks[0].outcome, 'unexpected-state');
});
test('persistent mismatch exhausts bounded reads, stops remaining settings and preserves later repositories', async () => {
  const f = fixture(['first','second']);
  f.states.first.repo.has_wiki = true; f.states.first.immutable.enabled = false;
  f.states.second.immutable.enabled = false;
  const plan = (await f.preview()).plan;
  const write = f.api.write;
  f.api.write = async (...args) => { f.dropWrites = args[1].endsWith('/first'); return write(...args); };
  const report = await f.apply(plan), first = report.repositories[0], evidence = first.settingsReadbacks[0];
  assert.equal(report.failures, 1); assert.equal(first.status, 'unresolved');
  assert.equal(evidence.outcome, 'exhausted'); assert.equal(evidence.attempts.length, 4);
  assert.deepEqual(f.delays, [1000, 2000, 4000]);
  assert.deepEqual(first.writes, ['repository']); assert.equal(report.repositories[1].status, 'verified');
  assert.equal(f.writes.length, 2); assert.match(junit(report), /settingsReadbacks/);
  assert.match(junit(report), /exhausted/); assert.match(junit(report), /<failure/);
});
for (const mode of ['unknown immutable', 'missing field', 'unrelated drift', 'read error']) test(`${mode} after write fails immediately with diagnostic evidence`, async () => {
  const f = fixture(['first']); f.states.first.immutable.enabled = false;
  const plan = (await f.preview()).plan; const get = f.api.get;
  f.api.get = async resource => {
    const result = await get(resource);
    if (f.writes.length) {
      if (mode === 'unknown immutable' && resource.endsWith('/immutable-releases')) return {};
      if (resource.endsWith('/first')) {
        if (mode === 'missing field') delete result.has_issues;
        if (mode === 'unrelated drift') result.has_issues = false;
        if (mode === 'read error') throw new GitHubApiError(403, 'denied', 'GET', resource);
      }
    }
    return result;
  };
  const report = await f.apply(plan), evidence = report.repositories[0].settingsReadbacks[0];
  assert.equal(report.failures, 1); assert.equal(f.writes.length, 1); assert.deepEqual(f.delays, []);
  assert.equal(evidence.attempts.length, 1);
  assert.equal(evidence.outcome, mode === 'read error' ? 'read-error' : 'unexpected-state');
  assert.ok(evidence.attempts[0].observed || evidence.attempts[0].error);
});
test('later successful final audit cannot erase exhausted readback failure', async () => {
  const f = fixture(['first']); f.states.first.immutable.enabled = false;
  const plan = (await f.preview()).plan; const get = f.api.get; let reads = 0;
  f.api.get = async resource => f.writes.length && resource.endsWith('/immutable-releases') && ++reads <= 4 ? { enabled: false } : get(resource);
  const report = await f.apply(plan);
  assert.equal(report.failures, 1); assert.equal(f.writes.length, 1);
  assert.deepEqual(report.repositories[0].after.settings.lines, []);
  assert.equal(report.repositories[0].settingsReadbacks[0].outcome, 'exhausted');
});
test('final settings verification still detects regression after convergence', async () => {
  const f = fixture(['first']); f.states.first.immutable.enabled = false;
  const plan = (await f.preview()).plan; const get = f.api.get; let reads = 0;
  f.api.get = async resource => {
    if (f.writes.length && resource.endsWith('/immutable-releases')) return { enabled: ++reads === 2 };
    return get(resource);
  };
  const report = await f.apply(plan);
  assert.equal(report.failures, 1); assert.equal(f.writes.length, 1);
  assert.equal(report.repositories[0].settingsReadbacks[0].outcome, 'converged');
  assert.ok(report.repositories[0].failures.some(f => f.setting === 'readback'));
});
test('uncertain write response is never retried even if state changed', async () => {
  const f = fixture(['first']); f.states.first.immutable.enabled = false;
  const write = f.api.write;
  f.api.write = async (...args) => { await write(...args); throw new Error('connection lost after write'); };
  const report = await f.apply((await f.preview()).plan);
  assert.equal(report.failures, 1); assert.equal(f.writes.length, 1); assert.deepEqual(f.delays, []);
  assert.deepEqual(report.repositories[0].after.settings.lines, []);
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
test('stronger existing rules remain unchanged and missing rulesets are created', async () => {
  const f = fixture(['first','second']); f.states.first.ruleset.rules.find(r => r.type === 'pull_request').parameters.required_approving_review_count = 2; f.states.second.ruleset = null;
  const report = await f.apply((await f.preview()).plan); assert.equal(report.failures, 0, JSON.stringify(report)); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].method, 'POST'); assert.match(f.writes[0].resource, /second\/rulesets$/);
  assert.equal(f.states.first.ruleset.rules.find(r => r.type === 'pull_request').parameters.required_approving_review_count, 2);
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
test('saved migration fixture matches the checked-in policy', async () => {
  const { gitBlobSha } = await import('../../tools/github/apply-repo-policy.mjs');
  assert.equal(gitBlobSha(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url))), gitBlobSha(readFileSync(new URL('../../config/github/repository-policy.json', import.meta.url))));
});

test('newly visible rulesets cannot authorize unreviewed actions but allow reviewed general settings', async () => {
  const f = fixture(['first']); f.states.first.repo.has_wiki = true;
  f.failRead = (_name, suffix) => suffix.startsWith('/rulesets');
  const preview = await f.preview(); assert.equal(preview.failures, 1);
  f.failRead = undefined;
  const report = await f.apply(preview.plan); assert.equal(report.failures, 1); assert.equal(f.writes.length, 1);
  assert.match(JSON.stringify(report.repositories[0].failures), /differs from reviewed preview/);
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
    assert.equal(u.origin, 'https://api.github.com');
    try {
      let value;
      if (u.pathname === '/graphql') { const body = JSON.parse(init.body); value = await f.api.graphql(body.query, body.variables); }
      else if (init.method === 'GET') value = await f.api.get(u.pathname + u.search);
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
  // A fresh mocked plan, then an unrelated readback change containing credentials.
  f.states.livingproof.immutable.enabled = false;
  assert.equal(await main(['--dry-run', '--plan-output', planFile], dependencies), 0);
  const get = f.api.get, count = f.writes.length;
  const secret = 'ghs_' + 'a'.repeat(40);
  f.api.get = async resource => {
    const value = await get(resource);
    if (f.writes.length > count && resource.endsWith('/livingproof')) value.default_branch = `test-token-never-live ${secret}`;
    return value;
  };
  stdout = '';
  assert.equal(await main(['--apply', '--expected-plan', planFile, '--report-output', reportFile, '--junit', xmlFile], dependencies), 1);
  const retained = JSON.parse(readFileSync(reportFile));
  assert.equal(retained.repositories.find(r => r.name === 'livingproof').settingsReadbacks[0].outcome, 'unexpected-state');
  for (const output of [stdout, readFileSync(reportFile, 'utf8'), readFileSync(xmlFile, 'utf8')]) {
    assert.doesNotMatch(output, /test-token-never-live/); assert.equal(output.includes(secret), false);
    assert.match(output, /\[redacted\]/); assert.match(output, /settingsReadbacks/);
  }
});
test('CLI invalid scope and missing plan fail before network requests', async () => {
  for (const argv of [['--apply'], ['--dry-run', '--repo', 'first'], ['--dry-run','--apply'], ['--dry-run','--dry-run']]) {
    let calls = 0;
    assert.equal(await main(argv, { env: {}, fetchImpl: async () => { calls++; throw new Error('unexpected'); }, io: { stdout: { write() {} }, stderr: { write() {} } } }), 1);
    assert.equal(calls, 0);
  }
});

test('ruleset reconciliation strengthens weak fields while preserving stricter reviews, extra rules and covered branches', async () => {
  const f = fixture(['first']); const state = f.states.first.ruleset;
  state.enforcement = 'disabled'; state.conditions.ref_name.include = ['refs/heads/release/*'];
  state.rules = state.rules.filter(r => r.type !== 'non_fast_forward');
  state.rules.push({ type: 'required_signatures' }, { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci', integration_id: 7 }] } });
  const pr = state.rules.find(r => r.type === 'pull_request').parameters;
  pr.required_approving_review_count = 3; pr.require_code_owner_review = true; pr.require_last_push_approval = true; pr.dismiss_stale_reviews_on_push = true; pr.required_review_thread_resolution = true; pr.allowed_merge_methods = ['merge', 'squash']; pr.future_restriction = true;
  const preview = await f.preview(); const proposed = preview.plan.repositories[0].ruleset.write;
  assert.equal(proposed.method, 'PUT'); assert.equal(proposed.body.enforcement, 'active');
  const result = await f.apply(preview.plan); assert.equal(result.failures, 0, JSON.stringify(result));
  const after = f.states.first.ruleset, afterPr = after.rules.find(r => r.type === 'pull_request').parameters;
  assert.equal(afterPr.required_approving_review_count, 3);
  for (const key of ['require_code_owner_review','require_last_push_approval','dismiss_stale_reviews_on_push','required_review_thread_resolution','future_restriction']) assert.equal(afterPr[key], true);
  assert.deepEqual(afterPr.allowed_merge_methods, ['merge']);
  assert.deepEqual(after.conditions.ref_name.include, ['refs/heads/release/*', '~DEFAULT_BRANCH']);
  assert.ok(after.rules.some(r => r.type === 'non_fast_forward')); assert.ok(after.rules.some(r => r.type === 'required_signatures'));
  assert.deepEqual(after.rules.find(r => r.type === 'required_status_checks'), state.rules.find(r => r.type === 'required_status_checks'));
  const count = f.writes.length; assert.equal((await f.apply((await f.preview()).plan)).failures, 0); assert.equal(f.writes.length, count);
});
for (const conflict of ['bypass', 'excluded', 'inherited', 'unknown ownership', 'missing parameters', 'incompatible merges', 'duplicate rules']) test(`ruleset ${conflict} is unresolved without weakening or hiding other repositories`, async () => {
  const f = fixture(['first','second']); const r = f.states.first.ruleset;
  if (conflict === 'bypass') r.bypass_actors = [{ actor_id: 5, actor_type: 'Team', bypass_mode: 'always' }];
  if (conflict === 'excluded') r.conditions.ref_name.exclude = ['refs/heads/special'];
  if (conflict === 'inherited') r.source_type = 'Organization';
  if (conflict === 'unknown ownership') delete r.source;
  if (conflict === 'missing parameters') delete r.rules.find(r => r.type === 'pull_request').parameters.require_code_owner_review;
  if (conflict === 'incompatible merges') r.rules.find(r => r.type === 'pull_request').parameters.allowed_merge_methods = ['squash'];
  if (conflict === 'duplicate rules') r.rules.push({ type: 'deletion' });
  f.states.second.ruleset = null; const before = structuredClone(r);
  const report = await f.apply((await f.preview()).plan); assert.equal(report.failures, 1); assert.deepEqual(f.states.first.ruleset, before);
  assert.equal(report.repositories[1].status, 'verified'); assert.equal(f.writes.length, 1); assert.match(f.writes[0].resource, /second\/rulesets$/);
});
test('tampered or stale ruleset actions never authorize a security-sensitive write', async () => {
  for (const change of ['payload','id','bypass']) {
    const f = fixture(['first']); f.states.first.ruleset.enforcement = 'disabled'; const plan = (await f.preview()).plan;
    if (change === 'payload') plan.repositories[0].ruleset.write.body.rules = [];
    if (change === 'id') plan.repositories[0].ruleset.before.id = 88;
    if (change === 'bypass') f.states.first.ruleset.bypass_actors = [{ actor_id: 1, actor_type: 'Team', bypass_mode: 'always' }];
    assert.equal((await f.apply(plan)).failures, 1); assert.equal(f.writes.length, 0);
  }
});
test('ruleset race before write and failed readback are detected', async () => {
  const f = fixture(['first']); f.states.first.ruleset.enforcement = 'disabled'; const approved = await rulesetPlan(f.api,f.inventory,'first',f.policy);
  let reads = 0; f.onRead = resource => { if (resource.includes('/rulesets?') && ++reads === 2) f.states.first.ruleset.rules.push({ type: 'required_signatures' }); };
  await assert.rejects(applyRuleset(f.api,f.inventory,'first',f.policy,approved), /changed before write/); assert.equal(f.writes.length,0);
  const g = fixture(['first','second']); g.states.first.ruleset.enforcement = 'disabled'; g.dropWrites = true;
  const result = await g.apply((await g.preview()).plan); assert.equal(result.failures,1); assert.match(JSON.stringify(result.repositories[0].failures), /readback failed/); assert.equal(result.repositories[1].status,'verified');
});
test('ruleset inventory follows pagination and rejects duplicate managed names', async () => {
  const f = fixture(['first']); const get = f.api.get;
  f.api.get = async resource => resource.includes('/rulesets?') && resource.includes('page=1&') ? Array.from({length:100},(_,i) => ({id:i+10,name:`unrelated-${i}`})) : get(resource);
  const plan = await rulesetPlan(f.api,f.inventory,'first',f.policy); assert.equal(plan.write,null); assert.ok(f.reads.some(r => r.includes('page=2&')));
  f.api.get = async resource => resource.includes('/rulesets?') ? [{id:1,name:f.policy.main_ruleset.name},{id:2,name:f.policy.main_ruleset.name}] : get(resource);
  await assert.rejects(rulesetPlan(f.api,f.inventory,'first',f.policy), /Multiple rulesets/); assert.equal(f.writes.length,0);
});

for (const mode of ['stronger', 'weaker', 'missing', 'inaccessible']) test(`strict audit and reconciliation agree on ${mode} rulesets and retain manual evidence`, async () => {
  const f = fixture(['first']);
  if (mode === 'stronger') {
    const pr = f.states.first.ruleset.rules.find(r => r.type === 'pull_request').parameters;
    pr.required_approving_review_count = 3; pr.require_code_owner_review = true;
    f.states.first.ruleset.rules.push({ type: 'required_signatures' });
  }
  if (mode === 'weaker') f.states.first.ruleset.enforcement = 'disabled';
  if (mode === 'missing') f.states.first.ruleset = null;
  if (mode === 'inaccessible') f.failRead = (_name, suffix) => suffix.startsWith('/rulesets');
  const preview = await f.preview();
  assert.equal(preview.repositories[0].status, mode === 'stronger' ? 'compliant' : mode === 'inaccessible' ? 'unresolved' : 'planned');
  const legacy = 'Living-Proof-Labs/first\n  repository settings: match\n  sponsorship settings: match\n  immutable releases: enabled\n  main ruleset: different\n  pages: matches\n  pages.https_enforced: matches\n\n1 difference(s) found; 0 error(s).\n';
  const audited = await annotateRulesets(legacy, f.policy, f.inventory, f.api);
  assert.equal(decide(audited, true).status, mode === 'stronger' ? 0 : mode === 'inaccessible' ? 3 : 2);
  assert.equal(decide(audited, false).status, 0);
  if (mode === 'stronger') assert.match(audited, /main ruleset: matches/);
  if (mode === 'inaccessible') assert.match(audited, /main ruleset: unknown/);
  assert.equal(await annotateRulesets(audited, f.policy, f.inventory, f.api), audited);
  assert.equal(f.writes.length, 0);
  const directory = mkdtempSync(path.join(tmpdir(), 'audit-consistency-'));
  const files = ['policy.json','audit.txt','junit.xml','manual.json'].map(file => path.join(directory,file));
  writeFileSync(files[0], JSON.stringify(f.policy)); writeFileSync(files[1],audited);
  writeFileSync(files[3], JSON.stringify({schema_version:1,observations:[{observed_at:'2026-11-13T00:00:00Z',repositories:['Living-Proof-Labs/first'],settings:{include_git_lfs_objects_in_archives:false, auto_close_linked_issues:false}}]}));
  const output = spawnSync(process.execPath,[new URL('../../tools/github/audit-junit.mjs',import.meta.url).pathname,...files],{encoding:'utf8'});
  assert.equal(output.status,0,output.stderr); const xml=readFileSync(files[2],'utf8');
  if (mode === 'stronger') assert.match(xml, /first :: main ruleset"\/>/);
  else if (mode === 'inaccessible') assert.match(xml, /first :: main ruleset"><error message="unverified main protection"/);
  else assert.match(xml, /first :: main ruleset"><failure message="main protection drift"/);
  assert.match(xml,/manual observation/); assert.match(xml,/2026-11-13T00:00:00Z/);
  assert.match(xml,/manual correction required/); assert.match(xml,/unverified manual setting/);
  // Unrelated missing evidence still fails even when stronger protection passes.
  const unknownImmutable = legacy.replace('immutable releases: enabled','immutable releases: unknown').replace('1 difference(s)','2 difference(s)');
  const retained = await annotateRulesets(unknownImmutable,f.policy,f.inventory,f.api);
  assert.equal(decide(retained,true).status,3); assert.match(retained,/immutable releases: unknown/);
});
test('strict audit wrapper applies the shared resolver before exit classification and JUnit', () => {
  const source = readFileSync(new URL('../../tools/github/repository-settings.sh',import.meta.url),'utf8');
  assert.ok(source.indexOf('audit-rulesets.mjs') < source.indexOf('audit-junit.mjs'));
  assert.ok(source.indexOf('audit-rulesets.mjs') < source.indexOf('audit-status.mjs'));
});
test('ruleset audit rejects malformed or incomplete legacy evidence instead of reporting compliance', async () => {
  const f = fixture(['first']);
  for (const text of ['0 difference(s) found; 0 error(s).', 'Living-Proof-Labs/first\n0 difference(s) found; 0 error(s).', 'Living-Proof-Labs/other\n  main ruleset: matches\n0 difference(s) found; 0 error(s).']) await assert.rejects(annotateRulesets(text,f.policy,f.inventory,f.api));
  assert.equal(f.writes.length,0);
});

});
