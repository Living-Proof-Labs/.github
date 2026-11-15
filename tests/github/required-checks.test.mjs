// SPDX-License-Identifier: Apache-2.0
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRequiredChecks, repositoryRuleset, strengthenChecks, strengthenMergeQueue } from '../../tools/github/required-checks.mjs';
import { strengthenRuleset, rulesetPlan, applyRuleset } from '../../tools/github/reconcile-ruleset.mjs';
import { run as legacyRun, validatePolicy } from '../../tools/github/apply-repo-policy.mjs';
import { run as legacySync } from '../../tools/github/repository-settings.mjs';
import { verifyResults, verificationJobs } from '../../tools/github/verification-gate.mjs';
const baseline = JSON.parse(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url)));
const checks = () => ({ required_status_checks: [{ context: 'Repository verification gate', integration_id: 15368 }], strict_required_status_checks_policy: true, do_not_enforce_on_create: false });
const policy = () => ({ ...structuredClone(baseline), required_checks_by_repository: { '.github': checks() } });
const queue = () => ({ check_response_timeout_minutes: 60, grouping_strategy: 'ALLGREEN', max_entries_to_build: 5, max_entries_to_merge: 5, merge_method: 'MERGE', min_entries_to_merge: 0, min_entries_to_merge_wait_minutes: 0 });
const queuedChecks = () => ({ ...checks(), strict_required_status_checks_policy: false });
const queuedPolicy = () => ({ ...structuredClone(baseline), required_checks_by_repository: { '.github': queuedChecks() }, merge_queue_by_repository: { '.github': queue() } });
const inventory = { owner: 'Living-Proof-Labs', repositories: ['.github', 'website'] };
describe('Repository-specific required protection', () => {
  test('legacy paths reject enrolled policy before any reads or writes', async () => {
    const p = policy(); validatePolicy(p);
    const api = new Proxy({}, {get() { throw new Error('API must not be called'); }});
    for (const dryRun of [true,false]) await assert.rejects(legacyRun({policy:p,org:inventory.owner,dryRun,api}), /legacy full-policy/);
    assert.throws(() => legacySync({policy:p,inventory:{schema_version:1,...inventory},flags:{apply:true},api}), /protected inventory/);
  });
  test('only enrolled repository receives named trusted checks; defaults unchanged', () => {
    validateRequiredChecks(policy(), inventory);
    assert.deepEqual(repositoryRuleset(policy(), 'website'), baseline.main_ruleset);
    assert.deepEqual(repositoryRuleset(policy(), '.github').rules.at(-1).parameters, checks());
  });
  test('invalid names, sources, duplicate contexts and unknown fields fail closed', () => {
    for (const mutate of [p => p.required_checks_by_repository.typo = checks(), p => p.required_checks_by_repository['.github'].typo = true,
      p => p.required_checks_by_repository['.github'].required_status_checks[0].integration_id = null,
      p => p.required_checks_by_repository['.github'].required_status_checks[0].integration_id = -1,
      p => p.required_checks_by_repository['.github'].required_status_checks.push({ context: 'Repository verification gate', integration_id: 123 }),
      p => p.required_checks_by_repository['.github'].strict_required_status_checks_policy = false,
      p => p.required_checks_by_repository['.github'].do_not_enforce_on_create = true]) {
      const p = policy(); mutate(p); assert.throws(() => validateRequiredChecks(p, inventory));
    }
  });
  test('union preserves extra checks, strengthens any-source checks, never changes conflicting source', () => {
    const previous = checks(); previous.required_status_checks = [{ context: 'extra', integration_id: 77 }, { context: 'Repository verification gate', integration_id: null }];
    previous.strict_required_status_checks_policy = false; previous.do_not_enforce_on_create = true;
    const next = strengthenChecks(previous, checks());
    assert.deepEqual(next.required_status_checks, [{ context: 'extra', integration_id: 77 }, ...checks().required_status_checks]);
    assert.equal(next.strict_required_status_checks_policy, true); assert.equal(next.do_not_enforce_on_create, false);
    previous.required_status_checks[1].integration_id = 99;
    assert.throws(() => strengthenChecks(previous, checks()), /conflicts/);
    assert.throws(() => strengthenChecks({}, checks()), /incomplete/);
  });
  test('stronger rules and reviews survive and repeated reconciliation is idempotent', () => {
    const desired = repositoryRuleset(policy(), '.github'), existing = structuredClone(baseline.main_ruleset);
    existing.rules.push({ type: 'required_signatures' }); existing.rules[2].parameters.required_approving_review_count = 2;
    const next = strengthenRuleset(existing, desired);
    assert.equal(next.rules[2].parameters.required_approving_review_count, 2);
    assert.ok(next.rules.some(r => r.type === 'required_signatures'));
    assert.deepEqual(strengthenRuleset(next, desired), next);
  });
  test('paginated plan binds exact checks, rejects changed approval and verifies readback without duplicate writes', async () => {
    const p = policy(), repo = { id: 1, full_name: 'Living-Proof-Labs/.github', default_branch: 'main', archived: false, disabled: false, visibility: 'public' };
    let state = { id: 9, source_type: 'Repository', source: repo.full_name, ...structuredClone(baseline.main_ruleset) }; const writes = [], reads = [];
    const api = { async get(path) {
      reads.push(path);
      if (path.endsWith('/.github')) return repo;
      if (path.includes('&page=1&')) return Array.from({ length: 100 }, (_, i) => ({ id: i+100, name: `other${i}` }));
      if (path.includes('&page=2&')) return [{ id: 9, name: state.name, source: repo.full_name, source_type: 'Repository' }];
      if (path.endsWith('/rulesets/9')) return structuredClone(state);
      throw new Error('unexpected read');
    }, async write(method, path, body) { writes.push({method,path,body}); state = {...state, ...structuredClone(body)}; } };
    const approved = await rulesetPlan(api, inventory, '.github', p);
    assert.ok(approved.write.body.rules.some(r => r.type === 'required_status_checks'));
    const changed = policy(); changed.required_checks_by_repository['.github'].required_status_checks[0].context = 'other';
    await assert.rejects(applyRuleset(api, inventory, '.github', changed, approved), /differs/); assert.equal(writes.length, 0);
    await applyRuleset(api, inventory, '.github', p, approved); assert.equal(writes.length, 1);
    const stable = await rulesetPlan(api, inventory, '.github', p); assert.equal(stable.write, null);
    await applyRuleset(api, inventory, '.github', p, stable); assert.equal(writes.length, 1);
    assert.ok(reads.some(path => path.includes('&page=2&')));
    delete state.rules.at(-1).parameters.required_status_checks;
    await assert.rejects(rulesetPlan(api, inventory, '.github', p), /incomplete/);
  });
});

describe('Merge-queue enrollment', () => {
  test('queued required checks drop the up-to-date rule and add a merge queue only for the enrolled repository', () => {
    validateRequiredChecks(queuedPolicy(), inventory);
    assert.deepEqual(repositoryRuleset(queuedPolicy(), 'website'), baseline.main_ruleset);
    const rules = repositoryRuleset(queuedPolicy(), '.github').rules;
    assert.deepEqual(rules.at(-2).parameters, queuedChecks());
    assert.deepEqual(rules.at(-1), { type: 'merge_queue', parameters: queue() });
  });
  test('strict required checks remain required without a queue, and a queue forbids a strict up-to-date pin', () => {
    const missingQueue = queuedPolicy(); delete missingQueue.merge_queue_by_repository;
    assert.throws(() => validateRequiredChecks(missingQueue, inventory));
    const stillStrict = queuedPolicy(); stillStrict.required_checks_by_repository['.github'].strict_required_status_checks_policy = true;
    assert.throws(() => validateRequiredChecks(stillStrict, inventory));
    const squash = queuedPolicy(); squash.merge_queue_by_repository['.github'].merge_method = 'SQUASH';
    assert.throws(() => validateRequiredChecks(squash, inventory));
  });
  test('existing merge-queue settings are strengthened and a method conflict is refused', () => {
    const previous = queue(); previous.check_response_timeout_minutes = 30; previous.grouping_strategy = 'HEADGREEN'; previous.max_entries_to_build = 2;
    const next = strengthenMergeQueue(previous, queue());
    assert.equal(next.check_response_timeout_minutes, 60);
    assert.equal(next.grouping_strategy, 'ALLGREEN');
    assert.equal(next.max_entries_to_build, 5);
    previous.merge_method = 'REBASE';
    assert.throws(() => strengthenMergeQueue(previous, queue()), /method conflicts/);
  });
  test('a queued enrollment relaxes an existing strict pin and keeps extra checks', () => {
    const existing = structuredClone(baseline.main_ruleset);
    existing.rules.push({ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'extra', integration_id: 77 }], strict_required_status_checks_policy: true, do_not_enforce_on_create: false } });
    const next = strengthenRuleset(existing, repositoryRuleset(queuedPolicy(), '.github'));
    const checksRule = next.rules.find(r => r.type === 'required_status_checks');
    assert.equal(checksRule.parameters.strict_required_status_checks_policy, false);
    assert.deepEqual(checksRule.parameters.required_status_checks.map(c => c.context), ['extra', 'Repository verification gate']);
    assert.deepEqual(next.rules.find(r => r.type === 'merge_queue').parameters, queue());
  });
});

describe('Complete verification gate', () => {
  const evidence = event => Object.fromEntries(verificationJobs.map(job => [job, { result: (job === 'trusted-repository-settings' && (event === 'pull_request' || event === 'merge_group')) || (job === 'repository-settings' && event !== 'pull_request' && event !== 'merge_group') ? 'skipped' : 'success' }]));
  for (const event of ['pull_request', 'merge_group', 'push', 'schedule', 'workflow_dispatch']) {
    test(`${event}: only documented event-specific skips pass`, () => verifyResults(evidence(event), event));
    for (const result of ['failure', 'cancelled', 'skipped', 'neutral', undefined]) test(`${event}: ${result ?? 'missing'} applicable evidence fails`, () => {
      for (const job of verificationJobs.filter(j => evidence(event)[j].result === 'success')) {
        const needs = evidence(event); needs[job].result = result; assert.throws(() => verifyResults(needs, event));
      }
    });
  }
  test('missing, extra jobs, unsupported events and invalid JSON-shaped evidence fail', () => {
    const needs = evidence('pull_request'); delete needs.verify; assert.throws(() => verifyResults(needs, 'pull_request'));
    assert.throws(() => verifyResults({...evidence('pull_request'), extra: {result:'success'}}, 'pull_request'));
    for (const needs of [null, [], {}]) assert.throws(() => verifyResults(needs, 'pull_request'));
    assert.throws(() => verifyResults(evidence('push'), 'issue_comment'));
  });
  test('workflow aggregate always runs and consumes every other job', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
    const jobs = [...workflow.matchAll(/^  ([\w-]+):$/gm)].map(m => m[1]).filter(j => j !== 'verification-gate' && !['pull_request','merge_group','push','schedule','workflow_dispatch'].includes(j));
    assert.deepEqual(jobs.sort(), [...verificationJobs].sort());
    const gate = workflow.split('  verification-gate:')[1];
    assert.match(gate, /if: always\(\)/); assert.match(gate, /toJSON\(needs\)/);
    const needs = gate.match(/needs: \[([^\]]+)\]/)[1].split(',').map(s => s.trim());
    assert.deepEqual(needs.sort(), [...verificationJobs].sort());
    assert.match(gate, /run: node tools\/github\/verification-gate.mjs/);
  });
});
