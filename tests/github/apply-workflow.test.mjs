// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/apply-repository-settings.yml'), 'utf8');
const previewJob = workflow.match(/  preview:[\s\S]*?(?=  apply:)/)?.[0];
const applyJob = workflow.match(/  apply:[\s\S]*/)?.[0];
const verification = readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/verify.yml'), 'utf8');

test('settings apply is manually dispatched, main-only, and environment-gated', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.ok(applyJob);
  assert.match(applyJob, /environment: repository-administration/);
  assert.ok(previewJob);
  assert.doesNotMatch(previewJob, /environment: repository-administration/);
  assert.match(workflow, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /permission-administration: write/);
  assert.doesNotMatch(workflow, /^\s+repositories:/m);
});

test('PR audit stays secret-free while trusted main audit is environment-gated', () => {
  const prAudit = verification.match(/  repository-settings:[\s\S]*?(?=  trusted-repository-settings:)/)?.[0];
  const trustedAudit = verification.match(/  trusted-repository-settings:[\s\S]*/)?.[0];
  assert.ok(prAudit);
  assert.ok(trustedAudit);
  assert.match(prAudit, /name: Repository settings report\n    if: github\.event_name == 'pull_request'/);
  assert.doesNotMatch(prAudit, /create-github-app-token|environment: repository-administration|secrets\./);
  assert.match(trustedAudit, /name: Strict repository settings audit[\s\S]*environment: repository-audit/);
  assert.match(trustedAudit, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(verification, /github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
});

test('daily strict audit is unattended while apply remains reviewer-gated', () => {
  assert.match(verification, /schedule:[\s\S]*cron: '17 16 \* \* \*'/);
  const trustedAudit = verification.match(/  trusted-repository-settings:[\s\S]*/)?.[0];
  assert.ok(trustedAudit);
  assert.match(trustedAudit, /environment: repository-audit/);
  assert.doesNotMatch(trustedAudit, /environment: repository-administration/);
  assert.ok(applyJob);
  assert.match(applyJob, /environment: repository-administration/);
  assert.ok(previewJob);
  assert.doesNotMatch(previewJob, /environment: repository-administration/);
});

test('settings apply previews first and scopes privileged changes to explicit inputs', () => {
  assert.match(workflow, /name: Preview pinned policy[\s\S]*repository-settings\.sh --junit/);
  assert.match(workflow, /--https-only --inventory config\/github\/repositories\.json/);
  assert.match(workflow, /--plan-output artifacts\/https-plan\.json/);
  assert.match(workflow, /--expected-plan artifacts\/preview\/https-plan\.json/);
  assert.match(workflow, /needs: preview/);
  assert.match(workflow, /permission-pages: read/);
  assert.match(workflow, /permission-pages: write/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(applyJob, /node tools\/github\/ordinary-settings\.mjs/);
  assert.match(workflow, /include_release_immutability/);
  assert.match(applyJob, /RULESET: \$\{\{ inputs.apply_main_ruleset \}\}/);
  assert.match(applyJob, /IMMUTABILITY: \$\{\{ inputs.include_release_immutability \}\}/);
  assert.doesNotMatch(workflow, /if: inputs\.apply && !inputs\.include_release_immutability/);
  assert.match(applyJob, /PAGES: \$\{\{ inputs.apply_pages \}\}/);
  assert.match(workflow, /name: Strictly verify every registered repository\n        if: always\(\)/);
});

const validation = workflow.match(/- name: Validate selected operation\n        run: \|\n([\s\S]*?)        env:/)?.[1];
const runValidation = (overrides) => spawnSync('bash', ['-c', validation], {
  env: { ...process.env, MODE: 'ordinary', APPLY: 'true', TARGET_REPOSITORY: '', PAGES: 'false', RULESET: 'false', IMMUTABILITY: 'false', ...overrides },
  encoding: 'utf8',
});

test('ordinary apply rejects inventory-wide selection before token creation', () => {
  assert.ok(validation);
  assert.ok(workflow.indexOf('Validate selected operation') < workflow.indexOf('actions/create-github-app-token'));
  for (const target of ['', 'all']) {
    assert.equal(runValidation({ TARGET_REPOSITORY: target }).status, 64);
    assert.equal(runValidation({ TARGET_REPOSITORY: target, APPLY: 'false' }).status, 0);
    assert.equal(runValidation({ TARGET_REPOSITORY: target, MODE: 'https-only' }).status, 0);
  }
  assert.equal(runValidation({ TARGET_REPOSITORY: 'livingproof-evaluator-scenario', PAGES: 'true' }).status, 0);
});

test('HTTPS-only rejects broader settings options', () => {
  for (const option of ['PAGES', 'RULESET', 'IMMUTABILITY']) {
    assert.equal(runValidation({ MODE: 'https-only', [option]: 'true' }).status, 64);
  }
});

test('settings runs serialize and HTTPS preview uses read authority', () => {
  assert.match(workflow, /concurrency:\n  group: repository-settings\n  cancel-in-progress: false/);
  assert.match(previewJob, /permission-administration: \$\{\{ inputs.mode == 'https-only' && 'read' \|\| 'write' \}\}/);
  assert.match(applyJob, /permission-administration: write/);
});
