// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/apply-repository-settings.yml'), 'utf8');
const previewJob = workflow.match(/  preview:[\s\S]*?(?=  apply:)/)?.[0];
const applyJob = workflow.match(/  apply:[\s\S]*/)?.[0];
const verification = readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/verify.yml'), 'utf8');

describe('Protected workflow contract', () => {

test('settings apply is manually dispatched, main-only, and environment-gated', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.ok(applyJob);
  assert.match(applyJob, /environment: repository-administration/);
  assert.ok(previewJob);
  assert.match(previewJob, /environment: repository-administration/);
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
  assert.match(previewJob, /environment: repository-administration/);
});

test('normal workflow reconciles full inventory through a saved plan with no scope checkboxes', () => {
  assert.doesNotMatch(workflow, /apply_pages|apply_main_ruleset|include_release_immutability|inputs.repository|inputs.mode|https-only/);
  assert.match(previewJob, /--dry-run --plan-output artifacts\/settings-plan.json/);
  assert.match(applyJob, /--apply --expected-plan artifacts\/preview\/settings-plan.json/);
  assert.match(applyJob, /needs: preview/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(previewJob, /permission-administration: write/);
  assert.match(previewJob, /permission-pages: read/);
  assert.doesNotMatch(previewJob, /permission-pages: write|--apply|skip-token-revoke: true/);
  assert.match(previewJob, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(applyJob, /permission-pages: write/);
  assert.match(applyJob, /Strictly verify every registered repository\n        if: always\(\)/);
  assert.match(applyJob, /--dry-run --fail-on-drift/);
  assert.match(workflow, /concurrency:\n  group: repository-settings\n  cancel-in-progress: false/);
});

});
