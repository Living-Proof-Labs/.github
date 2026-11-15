// SPDX-License-Identifier: Apache-2.0
// Review checks from Vera's review of #101 (Fixes #100).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const architecture = readFileSync(
  path.join(ROOT, 'docs/architecture/verification-architecture.md'),
  'utf8',
);
const index = readFileSync(path.join(ROOT, 'docs/index.md'), 'utf8');
const directory = JSON.parse(readFileSync(path.join(ROOT, 'docs/directory.json'), 'utf8'));

const GONE = 'without a new evaluator repository';

test('the contradictory evaluator-repository wording is gone', () => {
  assert.equal(architecture.includes(GONE), false);
  assert.equal(index.includes(GONE), false);
  assert.equal(JSON.stringify(directory).includes(GONE), false);
});

test('the architecture names the shipped contract and scenario evaluator separately from the verifier grade', () => {
  assert.match(architecture, /livingproof-evaluator/);
  assert.match(architecture, /v1\.0\.0/);
  assert.match(architecture, /schema\/defs\.schema\.json/);
  assert.match(architecture, /livingproof-evaluator-scenario/);
  assert.match(architecture, /v1\.2\.1/);
  assert.match(architecture, /result\.py/);
  assert.match(architecture, /livingproof-hallway-evidence\/2\.0\.0/);
  assert.match(architecture, /SHA-256 digests of the observation, the manifest, and the graded thresholds/);
  assert.match(architecture, /Remains the orchestration and grading authority/);
  assert.match(architecture, /The authoritative run grade stays with the verifier/);
  assert.equal(/grading can evolve[\s\S]*without a new evaluator repository/i.test(architecture), false);
});

test('vocabulary, bindings, and human or agent evaluation stay unfinished and linked', () => {
  assert.match(architecture, /livingproof-evaluator\/issues\/1/);
  assert.match(architecture, /livingproof-evaluator\/issues\/2/);
  assert.match(architecture, /livingproof-evaluator\/issues\/3/);
  assert.match(architecture, /livingproof-evaluator-scenario\/issues\/1/);
  assert.match(architecture, /livingproof-sim-mujoco\/issues\/28/);
  assert.match(architecture, /livingproof-sim-gazebo\/issues\/5/);
  assert.match(architecture, /livingproof-unitree-g1\/issues\/17/);
  assert.match(architecture, /livingproof-unitree-go1\/issues\/12/);
  assert.match(architecture, /livingproof-booster-t1\/issues\/17/);
  assert.match(architecture, /robot-capability-specs\/issues\/40/);
  assert.match(architecture, /human and agent evaluators/);
  assert.match(architecture, /Package checks and those drafts are\n {2}separate from a delivered robot capability result/);
});

test('the reporter stays render-only', () => {
  assert.match(architecture, /livingproof-capability-report/);
  const mentions = architecture.match(/render-only/g) || [];
  assert.ok(mentions.length >= 3, `expected several render-only mentions, got ${mentions.length}`);
  assert.match(
    architecture,
    /Render the verifier's stored run and series assessments \(render-only since/,
  );
  assert.match(architecture, /Must not recompute a grade or invent missing evidence/);
  assert.match(architecture, /`livingproof-capability-report`, render-only/);
  assert.match(architecture, /The reporter stays render-only/);
  assert.doesNotMatch(architecture, /the reporter (computes|grades|recomputes)/i);
});

test('the homepage and directory use the same unfinished-work boundary', () => {
  const contract = directory.projects.find((p) => p.repository === 'livingproof-evaluator');
  const scenario = directory.projects.find((p) => p.repository === 'livingproof-evaluator-scenario');
  assert.match(contract.summary, /v1\.0\.0/);
  assert.match(contract.summary, /remain design work/);
  assert.match(scenario.summary, /v1\.2\.1/);
  assert.match(scenario.summary, /remain unfinished/);
  assert.match(index, /Shared contract definitions at v1\.0\.0/);
  assert.match(index, /Observable vocabulary and observation bindings remain design work/);
  assert.match(index, /Deterministic per-trial results from observation JSON at v1\.2\.1/);
  assert.match(index, /Gherkin vocabulary, MCAP reading, and bindings remain unfinished/);
});
