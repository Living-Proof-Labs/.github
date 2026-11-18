// SPDX-License-Identifier: Apache-2.0
// The release job may publish only a push to main whose complete verification passed on that commit.
// These checks read the real workflow and run the real verification gate; nothing here publishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { verifyResults, verificationJobs } from '../../tools/github/verification-gate.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const verify = read('.github/workflows/verify.yml');
const workflowFiles = readdirSync(new URL('../../.github/workflows/', import.meta.url)).filter(f => /\.ya?ml$/.test(f));

function jobBlock(text, job) {
  const start = text.search(new RegExp(`^  ${job}:\\s*$`, 'm'));
  assert.ok(start >= 0, `job ${job} not found`);
  const after = text.indexOf('\n', start) + 1;
  const next = text.slice(after).match(/^  [A-Za-z0-9_-]+:\s*$/m);
  return text.slice(start, next ? after + next.index : text.length);
}
const jobNames = text => [...text.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map(m => m[1])
  .filter(name => text.indexOf(`\n  ${name}:`) > text.indexOf('\njobs:'));
const scalar = (block, key) => block.match(new RegExp(`^    ${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim();
const mapping = (block, key, indent = 4) => {
  const pad = ' '.repeat(indent), inner = ' '.repeat(indent + 2);
  const found = block.match(new RegExp(`^${pad}${key}:\\s*\\n((?:${inner}\\S.*\\n?)*)`, 'm'));
  return Object.fromEntries([...(found?.[1] ?? '').matchAll(new RegExp(`^${inner}([\\w-]+):\\s*(.*)$`, 'gm'))].map(m => [m[1], m[2].trim()]));
};
const release = jobBlock(verify, 'release');
const gate = jobBlock(verify, 'verification-gate');
const stripComments = text => text.replace(/^\s*#.*$/gm, '');

// Evaluates only the expression shape this workflow may use: == and != against string literals, joined by && or ||.
function evaluate(expression, context) {
  const value = term => {
    const m = term.trim().match(/^(github\.[a-z_]+)\s*(==|!=)\s*'([^']*)'$/);
    assert.ok(m, `unsupported condition term: ${term}`);
    const equal = context[m[1].replace('github.', '')] === m[3];
    return m[2] === '==' ? equal : !equal;
  };
  return expression.split('||').some(group => group.split('&&').every(value));
}
const condition = scalar(release, 'if');
const events = ['pull_request', 'merge_group', 'schedule', 'workflow_dispatch', 'push'];
const refs = ['refs/heads/main', 'refs/heads/topic', 'refs/pull/1/merge', 'refs/heads/gh-readonly-queue/main/pr-1-abc'];
const goodNeeds = event => Object.fromEntries(verificationJobs.map(job => {
  const prLike = event === 'pull_request' || event === 'merge_group';
  const skipped = (job === 'trusted-repository-settings' && prLike) || (job === 'repository-settings' && !prLike);
  return [job, { result: skipped ? 'skipped' : 'success' }];
}));
const gatePasses = (needs, event) => { try { verifyResults(needs, event); return true; } catch { return false; } };
// GitHub runs a job only if its condition is true and every needed job succeeded (implicit success() when no status function is used).
const releaseRuns = (event, ref, needs) => evaluate(condition, { event_name: event, ref }) && gatePasses(needs, event);

test('release waits for the verification gate and nothing else', () => {
  assert.match(release, /^    needs: verification-gate\s*$/m);
  assert.equal(scalar(release, 'needs'), 'verification-gate');
});

test('release condition is exactly a push to main with no status function', () => {
  assert.equal(condition, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.doesNotMatch(condition, /always\(|failure\(|cancelled\(|success\(|\bneeds\./, 'a status function would override the implicit success() requirement');
});

test('the gate stays an unconditional aggregate of exactly the verification jobs and is not downstream of release', () => {
  assert.equal(scalar(gate, 'if'), 'always()');
  const needs = scalar(gate, 'needs').match(/^\[(.*)\]$/)?.[1].split(',').map(s => s.trim());
  assert.deepEqual([...needs].sort(), [...verificationJobs].sort());
  assert.ok(!needs.includes('release'));
  assert.match(gate, /run: node tools\/github\/verification-gate\.mjs/);
  assert.match(gate, /VERIFICATION_NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(gate, /VERIFICATION_EVENT: \$\{\{ github\.event_name \}\}/);
});

test('only a push to main with a passing gate runs the release job', () => {
  for (const event of events) for (const ref of refs) {
    const expected = event === 'push' && ref === 'refs/heads/main';
    assert.equal(releaseRuns(event, ref, goodNeeds(event)), expected, `${event} ${ref}`);
  }
});

test('pull requests, merge queue runs, schedules and manual runs never publish', () => {
  for (const event of ['pull_request', 'merge_group', 'schedule', 'workflow_dispatch']) {
    for (const ref of refs) assert.equal(releaseRuns(event, ref, goodNeeds(event)), false, `${event} ${ref}`);
  }
  const on = verify.slice(verify.indexOf('\non:'), verify.indexOf('\npermissions:'));
  assert.doesNotMatch(on, /pull_request_target/);
  assert.match(on, /^  push:\n    branches: \[main\]$/m);
});

test('a failed, cancelled or skipped verification job fails the gate, so the release is skipped', () => {
  for (const job of verificationJobs) for (const result of ['failure', 'cancelled', 'skipped', 'neutral', undefined]) {
    const needs = goodNeeds('push');
    if (result === undefined) delete needs[job]; else needs[job] = { result };
    if (result === 'skipped' && job === 'repository-settings') continue; // expected to be skipped on a push
    assert.equal(releaseRuns('push', 'refs/heads/main', needs), false, `${job}: ${result ?? 'missing'}`);
  }
  assert.equal(releaseRuns('push', 'refs/heads/main', { ...goodNeeds('push'), extra: { result: 'success' } }), false);
  assert.equal(releaseRuns('push', 'refs/heads/main', goodNeeds('push')), true);
  const strict = goodNeeds('push');
  strict['trusted-repository-settings'] = { result: 'skipped' };
  assert.equal(releaseRuns('push', 'refs/heads/main', strict), false, 'the strict settings audit is required on a push');
});

test('release calls the shared workflow at one published tag and passes nothing else', () => {
  const uses = scalar(release, 'uses');
  assert.match(uses, /^Living-Proof-Labs\/collaboration-guidelines\/\.github\/workflows\/semantic-release\.yml@v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  for (const key of ['with', 'secrets', 'environment', 'runs-on', 'steps', 'continue-on-error', 'strategy']) {
    assert.equal(new RegExp(`^    ${key}:`, 'm').test(release), false, `release must not set ${key}`);
  }
  assert.doesNotMatch(release, /inherit/);
  const tag = uses.split('@')[1];
  const preset = JSON.parse(read('renovate.json')).extends.map(e => e.match(/renovate-preset#(.+)$/)?.[1]).filter(Boolean);
  assert.deepEqual(preset, [tag], 'the preset and the workflow call name one guidelines release');
});

test('the release job alone may write contents and the workflow default stays read-only', () => {
  assert.deepEqual(mapping(release, 'permissions'), { contents: 'write' });
  assert.match(verify, /^permissions:\n  contents: read\njobs:/m);
  for (const job of jobNames(verify).filter(name => name !== 'release')) {
    assert.notEqual(mapping(jobBlock(verify, job), 'permissions').contents, 'write', `${job} must not write contents`);
  }
});

test('only the shared engine tags or publishes; no other workflow reacts to a release or a tag', () => {
  for (const file of workflowFiles) {
    const text = stripComments(read(`.github/workflows/${file}`));
    assert.doesNotMatch(text, /\bgit\s+(tag|push)\b|gh\s+release\b|gh\s+api[^\n]*(releases|git\/refs)|softprops|create-release/, `${file} must not tag or publish itself`);
    const on = text.slice(text.indexOf('\non:'), text.indexOf('\njobs:'));
    assert.doesNotMatch(on, /^\s+(release|create):/m, `${file} must not trigger on release or create events`);
    assert.doesNotMatch(on, /^\s+tags(-ignore)?:/m, `${file} must not trigger on tags`);
    if (file !== 'verify.yml') assert.doesNotMatch(text, /semantic-release/, `${file} must not call the release engine`);
  }
});

test('publishing a release cannot reach the settings apply or any approval environment', () => {
  const apply = stripComments(read('.github/workflows/apply-repository-settings.yml'));
  assert.match(apply, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(apply.slice(apply.indexOf('\non:'), apply.indexOf('\npermissions:')), /\n  (push|release|workflow_run|workflow_call|schedule):/);
  assert.doesNotMatch(stripComments(release), /environment|secrets|token/i);
  assert.doesNotMatch(stripComments(verify), /workflow_run|workflow_call:/);
});

test('RELEASING.md states the version identity and that a release applies nothing and approves nothing', () => {
  const doc = read('RELEASING.md');
  for (const heading of ['## What a version identifies', '## What publishing does not do', '## How a release is cut', '### First release', '## Pinning a release from the documentation publisher']) {
    assert.ok(doc.includes(`\n${heading}\n`), heading);
  }
  const identifies = doc.slice(doc.indexOf('## What a version identifies'), doc.indexOf('## What publishing does not do'));
  for (const word of ['Policy', 'Tools', 'Documentation source', 'does **not** identify', 'live state']) assert.ok(identifies.includes(word), word);
  assert.match(doc, /does not run `apply-repository-settings`/);
  assert.match(doc, /implies no environment approval/);
  assert.match(doc, /no secrets, no\s+environment/);
  assert.match(doc, /Published tags are not retargeted/);
  assert.match(doc, /documentation-only, no-automated-release exception/);
  assert.match(read('README.md'), /\]\(RELEASING\.md\)/, 'README links the release guide');
});
