// SPDX-License-Identifier: Apache-2.0
// Simulate GitHub's job scheduling over the real verify.yml, including how a skipped job anywhere in a job's
// `needs` ancestry skips it unless its `if` names a status function (always(), !cancelled(), ...). Offline.
// Added by Vera (verification) after the first push to main after PR 129 (run 44260358754): the gate succeeded
// but `Publish repository release` was skipped, because `repository-settings` is skipped on every push and an
// `if` with no status function carries an implicit success() over the whole ancestor chain, not just `needs`.
// The earlier model assumed success() looked only at the gate and never saw it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyResults, verificationJobs } from '../../tools/github/verification-gate.mjs';

const verify = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
const jobsText = verify.slice(verify.indexOf('\njobs:') + 6);
const names = [...jobsText.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map(m => m[1]);
function block(job) {
  const start = jobsText.search(new RegExp(`^  ${job}:\\s*$`, 'm'));
  const after = jobsText.indexOf('\n', start) + 1;
  const next = jobsText.slice(after).match(/^  [A-Za-z0-9_-]+:\s*$/m);
  return jobsText.slice(start, next ? after + next.index : jobsText.length);
}
function needsOf(job) {
  const b = block(job);
  const scalar = b.match(/^    needs:[ \t]*(\S.*)$/m)?.[1];
  if (scalar) return scalar.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  const list = b.match(/^    needs:\s*\n((?:      - .*\n?)+)/m)?.[1];
  return list ? [...list.matchAll(/^      - (\S+)/gm)].map(m => m[1]) : [];
}
const ifOf = job => block(job).match(/^    if:[ \t]*(.*)$/m)?.[1].trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '') ?? '';

// Run every job the way GitHub decides: `if` (implicit success() when it names no status function)
// where success() means every job in the whole `needs` ancestry succeeded.
function simulate(event, ref, outcomes = {}) {
  const results = {};
  const ancestry = job => needsOf(job).flatMap(n => [n, ...ancestry(n)]);
  const decide = job => {
    if (results[job]) return results[job];
    for (const n of needsOf(job)) decide(n);
    const expression = ifOf(job);
    const hasStatusFunction = /\b(always|cancelled|failure|success)\(\)/.test(expression);
    const ancestorsSucceeded = ancestry(job).every(a => results[a] === 'success');
    const term = t => {
      t = t.trim();
      if (t === 'always()' || t === '!cancelled()') return true;
      if (t === 'success()') return ancestorsSucceeded;
      let m = t.match(/^github\.(event_name|ref)\s*(==|!=)\s*'([^']*)'$/);
      if (m) return ({ event_name: event, ref }[m[1]] === m[3]) === (m[2] === '==');
      m = t.match(/^needs\.([\w-]+)\.result\s*(==|!=)\s*'([^']*)'$/);
      if (m) { assert.ok(needsOf(job).includes(m[1]), `${job} reads needs.${m[1]} without listing it`); return (results[m[1]] === m[3]) === (m[2] === '=='); }
      assert.fail(`unsupported term in ${job}: ${t}`);
    };
    const condition = expression === '' || expression.split('||').some(g => g.split('&&').every(term));
    const runs = condition && (hasStatusFunction || ancestorsSucceeded);
    if (!runs) return (results[job] = 'skipped');
    if (job === 'verification-gate') {
      const seen = Object.fromEntries(needsOf(job).map(n => [n, { result: results[n] }]));
      try { verifyResults(seen, event); return (results[job] = 'success'); } catch { return (results[job] = 'failure'); }
    }
    return (results[job] = outcomes[job] ?? 'success');
  };
  names.forEach(decide);
  return results;
}
const events = ['pull_request', 'merge_group', 'schedule', 'workflow_dispatch', 'push'];
const refs = ['refs/heads/main', 'refs/heads/topic', 'refs/pull/1/merge', 'refs/heads/gh-readonly-queue/main/pr-1-abc'];

test('the model reproduces the observed runs: a pull request skips the strict audit and the release, a push skips the settings report', () => {
  assert.deepEqual(names.filter(n => simulate('pull_request', 'refs/pull/1/merge')[n] === 'skipped').sort(), ['release', 'trusted-repository-settings']);
  const push = simulate('push', 'refs/heads/main');
  assert.equal(push['repository-settings'], 'skipped', 'the report job is skipped on every push, by design');
  assert.equal(push['verification-gate'], 'success');
});

test('a push to main whose gate passed publishes: the release job runs even though a job in its ancestry was skipped', () => {
  const push = simulate('push', 'refs/heads/main');
  assert.equal(push.release, 'success', `release was ${push.release}; gate ${push['verification-gate']}, skipped by design: ${names.filter(n => push[n] === 'skipped')}`);
});

test('nothing but a push to main can publish, whatever the other jobs do', () => {
  for (const event of events) for (const ref of refs) {
    if (event === 'push' && ref === 'refs/heads/main') continue;
    assert.equal(simulate(event, ref).release, 'skipped', `${event} ${ref}`);
  }
});

test('a failed, cancelled or skipped verification job on a push to main prevents the release', () => {
  const ran = names.filter(n => verificationJobs.includes(n) && simulate('push', 'refs/heads/main')[n] === 'success');
  assert.ok(ran.length >= 4, `verification jobs that run on a push: ${ran}`);
  for (const job of ran) for (const outcome of ['failure', 'cancelled', 'skipped']) {
    const r = simulate('push', 'refs/heads/main', { [job]: outcome });
    assert.equal(r['verification-gate'], 'failure', `${job} ${outcome} must fail the gate`);
    assert.equal(r.release, 'skipped', `${job} ${outcome} must not publish`);
  }
});

test('the release job never runs after a failed gate, even though it names a status function', () => {
  const release = ifOf('release');
  assert.match(release, /needs\.verification-gate\.result == 'success'/, 'a status function in `if` removes the implicit success(), so the gate result must be required explicitly');
  assert.equal(needsOf('release').join(), 'verification-gate');
});
