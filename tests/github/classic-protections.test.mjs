// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectClassicProtections, main } from '../../tools/github/collect-classic-protections.mjs';
import { createGitHubClient } from '../../tools/github/apply-repo-policy.mjs';

const inventory = { schema_version: 1, owner: 'Living-Proof-Labs', repositories: ['one', 'two'] };
const sha = 'a'.repeat(40);
const checks = { strict: true, contexts: ['gate'], checks: [{ context: 'gate', app_id: 15368 }, { context: 'legacy', app_id: null }] };
async function collect(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, redirect: init.redirect });
    assert.equal(init.method, 'GET');
    const name = url.pathname.split('/')[3];
    const root = `/repos/Living-Proof-Labs/${name}`;
    const branch = 'release/next #1';
    let body = url.pathname === root ? { full_name: `Living-Proof-Labs/${name}`, default_branch: branch } :
      url.pathname.endsWith('/protection') ? { required_status_checks: checks } : { name: branch, commit: { sha } };
    let status = 200;
    if (overrides.respond) ({ body, status = 200 } = overrides.respond({ url, body, name, calls }));
    return new Response(JSON.stringify(body), { status });
  };
  const api = createGitHubClient({ token: 'secret-token', fetchImpl, allowWrites: false });
  const report = await collectClassicProtections({ inventory: overrides.inventory ?? inventory, api,
    sourceRevision: sha, inventoryDigest: 'digest', now: () => 'timestamp' });
  return { report, calls, api };
}

test('collects every canonical repository using GET with encoded branch and no redirects', async () => {
  const { report, calls, api } = await collect();
  assert.equal(report.complete, true);
  assert.equal(report.results.length, 2);
  assert.deepEqual(report.results[0].required_status_checks, checks);
  assert.equal(report.source_revision, sha);
  assert.equal(report.inventory_sha256, 'digest');
  assert.ok(calls.some(({ url }) => url.endsWith('/branches/release%2Fnext%20%231/protection')));
  assert.ok(calls.every(({ method, redirect }) => method === 'GET' && redirect === 'error'));
  assert.throws(() => api.write('PUT', '/repos/Living-Proof-Labs/one', {}));
  assert.throws(() => api.graphql('mutation { deleteRepository(input: {}) { clientMutationId } }'));
  assert.equal(calls.length, 6);
});

for (const [status, message, expected] of [[404, 'Branch not protected', 'unprotected'], [404, 'Not Found', 'unverified'], [403, 'secret-token', 'unverified'], [500, 'secret-token', 'unverified']]) {
  test(`${status} ${expected}: retain isolated complete inventory without leaking error text`, async () => {
    const { report } = await collect({ respond: ({ url, body, name }) => name === 'one' && url.pathname.endsWith('/protection') ? { status, body: { message } } : { body } });
    assert.equal(report.results[0].status, expected);
    assert.equal(report.results[1].status, 'protected');
    assert.equal(report.complete, expected === 'unprotected');
    assert.ok(!JSON.stringify(report).includes('secret-token'));
    if (expected === 'unverified') assert.ok(!Object.hasOwn(report.results[0], 'required_status_checks'));
  });
}

for (const value of [undefined, {}, { strict: true, contexts: [], checks: [{}] }, { ...checks, strict: 'true' }, { ...checks, checks: [{ context: 'gate', app_id: '15368' }] }]) {
  test(`malformed check evidence remains incomplete: ${JSON.stringify(value)}`, async () => {
    const { report } = await collect({ respond: ({ url, body }) => ({ body: url.pathname.endsWith('/protection') ? { required_status_checks: value } : body }) });
    assert.equal(report.complete, false);
    assert.ok(report.results.every(({ status }) => status === 'unverified'));
  });
}

test('explicit null records protected branch with no classic required status checks', async () => {
  const { report } = await collect({ respond: ({ url, body }) => ({ body: url.pathname.endsWith('/protection') ? { required_status_checks: null } : body }) });
  assert.equal(report.complete, true);
  assert.equal(report.results[0].status, 'protected');
  assert.equal(report.results[0].required_status_checks, null);
});

test('identity failure prevents absence classification and continues other repositories', async () => {
  const { report, calls } = await collect({ respond: ({ url, body, name }) => name === 'one' && !url.pathname.includes('/branches/') ? { body: { ...body, full_name: 'wrong/repo' } } : { body } });
  assert.equal(report.complete, false);
  assert.equal(report.results[1].status, 'protected');
  assert.equal(calls.filter(({ url }) => url.includes('/one')).length, 1);
});

test('default branch moving during collection invalidates otherwise successful evidence', async () => {
  const { report } = await collect({ respond: ({ body, calls }) => ({ body: calls.length === 3 ? { ...body, default_branch: 'changed' } : body }) });
  assert.equal(report.complete, false);
  assert.equal(report.results[0].error.stage, 'confirm-default-branch');
});

test('invalid inventory rejected before any API access', async () => {
  await assert.rejects(collect({ inventory: { ...inventory, repositories: ['one', 'one'] } }), /unique/);
});

test('collection workflow is protected trusted main only with read-only token and narrow retained artifact', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/collect-classic-protections.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: repository-administration/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /permission-administration: read/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /path: artifacts\/classic-protections\/report.json/);
  assert.match(workflow, /retention-days: 14/);
  assert.doesNotMatch(workflow, /pull_request|write|continue-on-error|--apply|permission-pages/);
});

for (const denied of [false, true]) {
  test(`CLI orchestration retains all canonical entries and returns correct exit code (denied=${denied})`, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'classic-evidence-'));
    const canonical = JSON.parse(readFileSync(new URL('../../config/github/repositories.json', import.meta.url)));
    const methods = [];
    try {
      const code = await main({ token: 'secret-token', outputDirectory: directory, fetchImpl: async (url, init) => {
        methods.push(init.method);
        const repository = url.pathname.slice('/repos/'.length);
        const protection = url.pathname.endsWith('/protection');
        return new Response(JSON.stringify(protection
          ? denied ? { message: 'secret-token' } : { required_status_checks: { strict: false, contexts: ['secret-token'], checks: [{ context: 'secret-token', app_id: null }] } }
          : { full_name: repository, default_branch: 'main' }), { status: protection && denied ? 403 : 200 });
      } });
      assert.equal(code, denied ? 1 : 0);
      const text = readFileSync(path.join(directory, 'report.json'), 'utf8');
      const report = JSON.parse(text);
      assert.equal(report.complete, !denied);
      assert.deepEqual(report.results.map(({ repository }) => repository), canonical.repositories.map((name) => `${canonical.owner}/${name}`));
      assert.match(report.source_revision, /^[0-9a-f]{40}$/);
      assert.match(report.inventory_sha256, /^[0-9a-f]{64}$/);
      assert.ok(methods.every((method) => method === 'GET'));
      assert.ok(!text.includes('secret-token'));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
