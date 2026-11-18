// SPDX-License-Identifier: Apache-2.0
// A cancelled workflow run must not start the release. always() "returns true, even when canceled"
// (GitHub expressions reference), so a release `if` built on it still starts after a cancel that arrives
// once the gate has succeeded. !cancelled() is the documented alternative and stays false. Offline.
// Added by Vera (verification) for .github PR 131.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const verify = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
const release = verify.slice(verify.search(/^  release:\s*$/m));
const condition = release.match(/^    if:[ \t]*(.*)$/m)[1].trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '');

function evaluate(context) {
  const term = t => {
    t = t.trim();
    if (t === 'always()') return true;
    if (t === '!cancelled()') return !context.cancelled;
    if (t === 'cancelled()') return context.cancelled;
    let m = t.match(/^needs\.verification-gate\.result\s*(==|!=)\s*'([^']*)'$/);
    if (m) return (context.gate === m[2]) === (m[1] === '==');
    m = t.match(/^github\.(event_name|ref)\s*(==|!=)\s*'([^']*)'$/);
    if (m) return (context[m[1]] === m[3]) === (m[2] === '==');
    assert.fail(`unsupported term: ${t}`);
  };
  return condition.split('||').some(g => g.split('&&').every(term));
}
const push = { event_name: 'push', ref: 'refs/heads/main' };

test('a green push to main starts the release when the run is not cancelled', () => {
  assert.equal(evaluate({ ...push, gate: 'success', cancelled: false }), true);
});

test('a cancelled run never starts the release, even when the gate had already succeeded', () => {
  assert.equal(evaluate({ ...push, gate: 'success', cancelled: true }), false);
});

test('a cancelled, failed or skipped gate never starts the release', () => {
  for (const gate of ['failure', 'cancelled', 'skipped', undefined]) for (const cancelled of [false, true]) {
    assert.equal(evaluate({ ...push, gate, cancelled }), false, `${gate} cancelled=${cancelled}`);
  }
});
