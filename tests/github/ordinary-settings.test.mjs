// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrdinarySettings } from '../../tools/github/ordinary-settings.mjs';

function exercise(options, statuses = []) {
  const calls = [];
  const status = applyOrdinarySettings({ repository: 'livingproof-evaluator-run', ...options }, args => {
    calls.push(args);
    return statuses[calls.length - 1] ?? 0;
  });
  return { calls, status };
}
test('Pages setup applies HTTPS to the same target then freshly reads settings', () => {
  const { calls, status } = exercise({ pages: true, ruleset: true });
  assert.equal(status, 0);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].includes('--apply-pages'));
  assert.ok(calls[0].includes('--apply-main-ruleset'));
  assert.ok(calls[1].includes('--https-only'));
  assert.ok(calls[1].includes('--inventory'));
  for (const call of calls) assert.equal(call[call.indexOf('--repo') + 1], 'livingproof-evaluator-run');
  assert.equal(calls[2][0], 'tools/github/repository-settings.sh');
  assert.ok(calls[2].includes('artifacts/target-settings-readback.xml'));
  assert.ok(!calls[2].some(arg => arg.startsWith('--apply')));
});
test('ordinary settings without Pages never writes HTTPS', () => {
  const { calls } = exercise({});
  assert.equal(calls.length, 2);
  assert.ok(!calls.flat().includes('--https-only'));
});
test('failed general apply skips HTTPS but still reads back partial state', () => {
  const { calls, status } = exercise({ pages: true }, [2, 0]);
  assert.equal(calls.length, 2);
  assert.equal(status, 2);
  assert.ok(!calls[1].includes('--apply'));
});
test('HTTPS failure is retained after successful fresh readback', () => {
  assert.equal(exercise({ pages: true }, [0, 1, 0]).status, 1);
});
test('readback failure is not success', () => {
  assert.equal(exercise({ pages: true }, [0, 0, 1]).status, 1);
});
test('all, empty, and invalid targets fail before any process runs', () => {
  for (const repository of ['all', '', undefined, '../other', '--all']) {
    assert.throws(() => applyOrdinarySettings({ repository }, () => assert.fail('must not run')), /one named/);
  }
});
