// SPDX-License-Identifier: Apache-2.0
// The release job runs only if `verification-gate` succeeds, so the gate step must really fail the job.
// release-workflow.test.mjs checks the gate function and the workflow text; this file runs the gate as
// the workflow does (a process with VERIFICATION_NEEDS and VERIFICATION_EVENT) and checks that nothing in
// the workflow can turn its failure into success. Offline; nothing here publishes.
// Added by Vera (verification) for .github PR 129: a `|| true`, `continue-on-error` or a CLI that
// stopped setting its exit code left the existing suite green while a failed verification could release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { verificationJobs } from '../../tools/github/verification-gate.mjs';

const root = new URL('../../', import.meta.url);
const verify = readFileSync(new URL('.github/workflows/verify.yml', root), 'utf8');
const gateScript = new URL('tools/github/verification-gate.mjs', root).pathname;

function jobBlock(text, job) {
  const start = text.search(new RegExp(`^  ${job}:\\s*$`, 'm'));
  assert.ok(start >= 0, `job ${job} not found`);
  const after = text.indexOf('\n', start) + 1;
  const next = text.slice(after).match(/^  [A-Za-z0-9_-]+:\s*$/m);
  return text.slice(start, next ? after + next.index : text.length);
}
const gate = jobBlock(verify, 'verification-gate');
const release = jobBlock(verify, 'release');

const expectedResult = (job, event) => {
  const prLike = event === 'pull_request' || event === 'merge_group';
  return (job === 'trusted-repository-settings' && prLike) || (job === 'repository-settings' && !prLike) ? 'skipped' : 'success';
};
const needsFor = event => Object.fromEntries(verificationJobs.map(job => [job, { result: expectedResult(job, event) }]));
// Run the real gate step the way the workflow does, with a scrubbed environment.
const runGate = (needs, event) => {
  const env = { PATH: process.env.PATH };
  if (needs !== undefined) env.VERIFICATION_NEEDS = typeof needs === 'string' ? needs : JSON.stringify(needs);
  if (event !== undefined) env.VERIFICATION_EVENT = event;
  return spawnSync(process.execPath, [gateScript], { env, encoding: 'utf8' });
};

test('the gate process exits 0 only for the exact expected results of the event', () => {
  for (const event of ['push', 'pull_request', 'merge_group', 'schedule', 'workflow_dispatch']) {
    const ok = runGate(needsFor(event), event);
    assert.equal(ok.status, 0, `${event}: ${ok.stderr}`);
  }
});

test('the gate process exits non-zero, with a reason, for every failed, cancelled, skipped, missing or extra result', () => {
  const bad = [];
  for (const job of verificationJobs) for (const result of ['failure', 'cancelled', 'skipped', 'neutral', '']) {
    const needs = needsFor('push');
    if (needs[job].result === result) continue;
    needs[job] = { result };
    bad.push([`push ${job} ${result || 'empty'}`, needs, 'push']);
  }
  for (const job of verificationJobs) {
    const needs = needsFor('push'); delete needs[job];
    bad.push([`push missing ${job}`, needs, 'push']);
  }
  bad.push(['push extra job', { ...needsFor('push'), release: { result: 'success' } }, 'push']);
  bad.push(['push strict audit skipped', { ...needsFor('push'), 'trusted-repository-settings': { result: 'skipped' } }, 'push']);
  bad.push(['pull_request strict audit ran', { ...needsFor('pull_request'), 'trusted-repository-settings': { result: 'success' } }, 'pull_request']);
  bad.push(['unsupported event', needsFor('push'), 'issue_comment']);
  bad.push(['no event', needsFor('push'), undefined]);
  bad.push(['no evidence', undefined, 'push']);
  bad.push(['invalid JSON', '{not json', 'push']);
  bad.push(['empty object', {}, 'push']);
  bad.push(['array', [], 'push']);
  for (const [label, needs, event] of bad) {
    const out = runGate(needs, event);
    assert.notEqual(out.status, 0, `${label} must fail the gate`);
    assert.ok(out.stderr.trim().length > 0, `${label} must say why on stderr`);
  }
});

test('nothing in the workflow can turn a failed gate into a successful one', () => {
  const run = gate.match(/^ {6}- name: Require complete successful verification evidence\n {8}run: (.*)$/m)?.[1];
  assert.equal(run, 'node tools/github/verification-gate.mjs', 'the gate step runs the script alone: no `||`, `;`, pipe or redirect');
  for (const [name, block] of [['verification-gate', gate], ['release', release]]) {
    assert.doesNotMatch(block, /continue-on-error/, `${name} must not set continue-on-error`);
    assert.doesNotMatch(block, /^ {4}strategy:/m, `${name} must not use a matrix or fail-fast override`);
  }
  assert.doesNotMatch(gate, /^ {6,8}(- )?if:/m, 'no gate step may be conditional: the check must always run');
  assert.doesNotMatch(gate, /^ {4}timeout-minutes:/m);
  const steps = gate.slice(gate.indexOf('    steps:'));
  const stepUses = [...steps.matchAll(/^ {6}- (?:name: .*\n {8})?(uses|run): (.*)$/gm)].map(m => m[2]);
  assert.equal(stepUses.at(-1), 'node tools/github/verification-gate.mjs', 'the gate script is the last step, so its status is the job status');
});
