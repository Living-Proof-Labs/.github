// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guide = readFileSync(new URL('../../docs/reading-reports.md', import.meta.url), 'utf8');
const normalized = guide.replace(/\s+/g, ' ');

// Keel-authored follow-up to #25, independently implementing the checks suggested
// in Vera's review of #134. No unpublished patch was copied or applied.
test('the dated one-trial example keeps its Wilson rounding and robot-width arithmetic', () => {
  assert.match(normalized, /one pass out of one simulated trial, with one required/);
  const interval = normalized.match(/interval is approximately (\d+)–(\d+)%/);
  assert.ok(interval, 'the example must state its uncertainty');
  // For k = n = 1, the Wilson lower bound simplifies to 1 / (1 + z²).
  const lower = 1 / (1 + 1.96 ** 2);
  assert.equal(Number(lower.toFixed(4)), 0.2065);
  assert.deepEqual(interval.slice(1).map(Number), [Math.round(100 * lower), 100]);
  const lateral = guide.match(/`([\d.]+) \/ 2 - ([\d.]+) \/ 2 = ([\d.]+) m`/);
  assert.ok(lateral, 'show the declared hallway and robot widths');
  const [hallway, robot, limit] = lateral.slice(1).map(Number);
  assert.deepEqual([hallway, robot, limit], [1.5, 0.541, 0.4795]);
  assert.ok(Math.abs(hallway / 2 - robot / 2 - limit) < 1e-12);
});

test('the guide links the dated evidence and current report/manual destinations over HTTPS', () => {
  const external = [...guide.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
  assert.deepEqual(external.sort(), [
    'https://docs.livingprooflabs.com/livingproof-verification/',
    'https://docs.livingprooflabs.com/livingproof-verification/booster-t1/stock-mujoco-corner-left/runs/44253837813/',
    'https://docs.livingprooflabs.com/capability-verifier/',
    'https://docs.livingprooflabs.com/livingproof-capability-report/',
  ].sort());
  // These offline assertions protect destinations, not live HTTP availability.
});

test('trial-plan guidance distinguishes hallway agreement from corner uncertainty', () => {
  const section = normalized.split('## 3. ')[1].split('## 4. ')[0];
  assert.match(section, /hallway reports use `repeated-outcome@1\.0\.0`/);
  assert.match(section, /3 of 3 repeats agree/);
  assert.match(section, /no Wilson interval or threshold/);
  assert.match(section, /k-of-n and 95% interval guidance here applies to corner reports/);
});
