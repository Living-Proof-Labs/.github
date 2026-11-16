// SPDX-License-Identifier: Apache-2.0
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateRequiredChecks, repositoryRuleset, validateMergeQueue } from '../../tools/github/required-checks.mjs';
import { run as legacyRun, readPolicyFile, validatePolicy } from '../../tools/github/apply-repo-policy.mjs';
import { run as legacySync } from '../../tools/github/repository-settings.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const policy = readPolicyFile();
const inventory = JSON.parse(readFileSync(path.join(root, 'config/github/repositories.json'), 'utf8'));
const verification = readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8');
const workflowDir = path.join(root, '.github/workflows');

describe('Merge-queue review contracts', () => {
  test('desired policy enrolls every canonical queue without adding required contexts', () => {
    assert.deepEqual(inventory.repositories, [
      '.github',
      'capability-verifier',
      'collaboration-guidelines',
      'living-proof-labs.github.io',
      'livingproof',
      'livingproof-booster-t1',
      'livingproof-capability-report',
      'livingproof-common',
      'livingproof-evaluator',
      'livingproof-evaluator-run',
      'livingproof-evaluator-scenario',
      'livingproof-sim-gazebo',
      'livingproof-sim-mujoco',
      'livingproof-unitree-g1',
      'livingproof-unitree-go1',
      'livingproof-verification',
      'livingproof-worlds',
      'robot-capability-specs',
      'unitree-foxglove-sdk',
      'website',
    ]);
    assert.equal(inventory.repositories.length, 20);
    validatePolicy(policy);
    validateRequiredChecks(policy, inventory);
    assert.deepEqual(Object.keys(policy.required_checks_by_repository), ['.github']);
    assert.deepEqual(Object.keys(policy.merge_queue_by_repository), inventory.repositories);
    assert.equal(policy.required_checks_by_repository['.github'].strict_required_status_checks_policy, false);
    assert.deepEqual(
      policy.required_checks_by_repository['.github'].required_status_checks,
      [{ context: 'Repository verification gate', integration_id: 15368 }],
    );
    const queue = policy.merge_queue_by_repository['.github'];
    assert.equal(queue.merge_method, 'MERGE');
    assert.equal(queue.grouping_strategy, 'ALLGREEN');
    validateMergeQueue(queue);
    const pullRequest = policy.main_ruleset.rules.find(rule => rule.type === 'pull_request');
    assert.ok(pullRequest.parameters.allowed_merge_methods.includes('merge'));
    assert.ok(!policy.main_ruleset.rules.some(rule => rule.type === 'merge_queue' || rule.type === 'required_status_checks'));
    for (const name of inventory.repositories) {
      const types = repositoryRuleset(policy, name).rules.map(rule => rule.type);
      if (name === '.github') {
        assert.ok(types.includes('required_status_checks'));
        assert.ok(types.includes('merge_queue'));
      } else {
        assert.deepEqual(types, [...policy.main_ruleset.rules.map(rule => rule.type), 'merge_queue']);
        assert.ok(types.includes('merge_queue'));
        assert.ok(!types.includes('required_status_checks'));
      }
    }
  });

  test('the required verification workflow reports the same gate on merge_group', () => {
    assert.match(verification, /^on:\n(?:  .+\n)*  merge_group:\n/m);
    const gate = verification.split('  verification-gate:')[1];
    assert.match(gate, /^    name: Repository verification gate$/m);
    assert.match(gate, /if: always\(\)/);
    assert.match(gate, /VERIFICATION_EVENT: \$\{\{ github\.event_name \}\}/);
    const trusted = verification.split('  trusted-repository-settings:')[1];
    assert.match(trusted, /github\.event_name != 'pull_request' && github\.event_name != 'merge_group' && github\.ref == 'refs\/heads\/main'/);
    const report = verification.split('  repository-settings:')[1];
    assert.match(report, /github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group'/);
  });

  test('privileged workflows are not triggered by merge_group or pull_request', () => {
    const names = readdirSync(workflowDir).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort();
    assert.deepEqual(names, [
      'apply-repository-settings.yml',
      'bootstrap-agent-apps.yml',
      'keel-comment-pilot.yml',
      'verify.yml',
    ]);
    for (const name of names) {
      if (name === 'verify.yml') continue;
      const text = readFileSync(path.join(workflowDir, name), 'utf8');
      assert.doesNotMatch(text, /merge_group:/, name);
      assert.doesNotMatch(text, /pull_request:/, name);
    }
    const apply = readFileSync(path.join(workflowDir, 'apply-repository-settings.yml'), 'utf8');
    assert.match(apply, /workflow_dispatch:/);
    assert.match(apply, /environment: repository-administration/);
  });

  test('unprotected apply paths still refuse to write merge-queue or required-check enrollment', async () => {
    await assert.rejects(
      legacyRun({ policy, org: 'Living-Proof-Labs', repo: '.github', dryRun: true }),
      /Repository-specific checks require task github:settings:reconcile/,
    );
    assert.throws(
      () => legacySync({ policy, inventory, flags: { apply: true } }),
      /Required checks must be applied through the protected inventory reconciliation workflow/,
    );
  });

  test('enrolling any other inventory repository would add a merge queue there, and an unregistered name is rejected', () => {
    const other = inventory.repositories.find(name => name !== '.github');
    const widened = structuredClone(policy);
    widened.merge_queue_by_repository[other] = structuredClone(policy.merge_queue_by_repository['.github']);
    validateRequiredChecks(widened, inventory);
    const types = repositoryRuleset(widened, other).rules.map(rule => rule.type);
    assert.ok(types.includes('merge_queue'));
    const unregistered = structuredClone(policy);
    unregistered.merge_queue_by_repository['not-a-registered-repo'] = structuredClone(policy.merge_queue_by_repository['.github']);
    assert.throws(() => validateRequiredChecks(unregistered, inventory), /not registered/);
  });
});
