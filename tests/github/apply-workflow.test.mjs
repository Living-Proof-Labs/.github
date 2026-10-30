// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/apply-repository-settings.yml'), 'utf8');
const verification = readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/verify.yml'), 'utf8');

test('settings apply is manually dispatched, main-only, and environment-gated', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: repository-administration/);
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
  assert.match(workflow, /environment: repository-administration/);
});

test('settings apply previews first and requires explicit release-immutability acknowledgement', () => {
  assert.match(workflow, /name: Preview pinned policy[\s\S]*repository-settings\.sh --repo/);
  assert.match(workflow, /include_release_immutability/);
  assert.match(workflow, /if: inputs\.apply && !inputs\.include_release_immutability/);
  assert.match(workflow, /--apply-immutable-releases-when-unknown/);
  assert.match(workflow, /name: Strictly verify every registered repository\n        if: always\(\) && inputs\.apply/);
});
