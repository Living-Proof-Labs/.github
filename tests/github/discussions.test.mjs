// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repositoryDefaults, validateDiscussionExceptions } from '../../tools/github/repository-defaults.mjs';
import { planRepository, validatePolicy } from '../../tools/github/apply-repo-policy.mjs';
import { run, validateConfig } from '../../tools/github/repository-settings.mjs';
import { writeSettings, validateConfiguration } from '../../tools/github/reconcile-inventory.mjs';
const shipped = JSON.parse(readFileSync(new URL('../../config/github/repository-policy.json', import.meta.url)));
const inventory = JSON.parse(readFileSync(new URL('../../config/github/repositories.json', import.meta.url)));
const policy = { schema_version: 1, repository: { has_discussions: false }, discussions_enabled_exceptions: shipped.discussions_enabled_exceptions };

test('shipped policy enables only the organization discussion host; previews never disable it', () => {
  validateConfiguration(inventory, shipped);
  assert.deepEqual(shipped.discussions_enabled_exceptions.map(e => e.repo), ['.github']);
  for (const name of inventory.repositories) {
    const expected = name === '.github';
    assert.equal(repositoryDefaults(shipped, name).has_discussions, expected);
    const observed = { repository: { has_discussions: true } };
    const plan = planRepository(policy, observed, { owner: inventory.owner, name });
    assert.deepEqual(plan.writes.map(w => w.body), expected ? [] : [{ has_discussions: false }]);
    assert.equal(plan.failures.length, 0);
  }
  assert.equal(shipped.repository.has_discussions, false);
});

test('audit and legacy apply use the same repository-specific expectation', () => {
  const values = { '.github': false, example: true };
  const writes = [];
  const api = {
    get(endpoint) { if (endpoint.endsWith('/rulesets')) return []; return { has_discussions: values[endpoint.split('/').at(-1)] }; },
    write(method, endpoint, body) { writes.push({ method, endpoint, body }); values[endpoint.split('/').at(-1)] = body.has_discussions; },
    immutableState() { return 'enabled'; }
  };
  const inv = { schema_version: 1, owner: 'Living-Proof-Labs', repositories: ['.github', 'example'] };
  for (const repository of inv.repositories) {
    run({ policy: { ...policy, main_ruleset: shipped.main_ruleset }, inventory: inv, flags: { repository, apply: true }, api, log() {} });
  }
  assert.deepEqual(writes.map(w => w.body), [{ has_discussions: true }, { has_discussions: false }]);
  const report = run({ policy: { ...policy, main_ruleset: shipped.main_ruleset }, inventory: inv, flags: {}, api, log() {} });
  assert.ok(report.repositories.every(r => r.settings.length === 0));
});

test('protected transport permits only the effective per-repository value', async () => {
  const writes = [];
  const api = { write: (...args) => writes.push(args) };
  for (const name of ['.github', 'livingproof']) {
    const expected = name === '.github';
    const action = value => ({ setting: 'repository', method: 'PATCH', path: `/repos/${inventory.owner}/${name}`, body: { has_discussions: value } });
    await writeSettings(api, inventory, name, policy, action(expected));
    await assert.rejects(writeSettings(api, inventory, name, policy, action(!expected)), /refused/);
  }
  assert.equal(writes.length, 2);
});

test('invalid or unregistered exceptions fail before audit or apply', () => {
  for (const entries of [[], {}, [{ repo: '.github', reason: '' }], [{ repo: 'owner/repo', reason: 'bad' }], [{ repo: '.github', reason: 'ok', has_issues: false }], [{ repo: '.github', reason: 'ok' }, { repo: '.GITHUB', reason: 'duplicate' }]]) {
    const invalid = { ...policy, discussions_enabled_exceptions: entries };
    assert.throws(() => validatePolicy(invalid));
    assert.throws(() => validateConfig(invalid, inventory));
  }
  assert.throws(() => validateDiscussionExceptions({ ...policy, repository: { has_discussions: true } }));
  const unknown = { ...shipped, discussions_enabled_exceptions: [{ repo: 'missing-repo', reason: 'typo' }] };
  assert.throws(() => validateConfiguration(inventory, unknown), /inventoried/);
});
