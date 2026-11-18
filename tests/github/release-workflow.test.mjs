// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
const renovate = JSON.parse(readFileSync(new URL('../../renovate.json', import.meta.url), 'utf8'));

describe('Release workflow gating', () => {
  const releaseBlock = workflow.split('\n  release:\n')[1] ?? '';

  test('release job gates on verification-gate and runs only on push to main', () => {
    assert.ok(releaseBlock, 'expected release job in .github/workflows/verify.yml');
    assert.match(releaseBlock, /^\s+needs:\s*verification-gate\s*$/m);
    assert.match(
      releaseBlock,
      /^\s+if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\s*$/m,
    );
    assert.match(releaseBlock, /^\s+permissions:\s*\n\s+contents:\s*write\s*$/m);
  });

  test('release job pins the same collaboration-guidelines release tag as renovate.json', () => {
    const usesMatch = releaseBlock.match(
      /^\s+uses:\s*Living-Proof-Labs\/collaboration-guidelines\/\.github\/workflows\/semantic-release\.yml@(v\d+\.\d+\.\d+)\s*$/m,
    );
    assert.ok(usesMatch, 'expected pinned semantic-release.yml@vX.Y.Z call');
    const presetTag = renovate.extends
      .map(entry => entry.match(/^github>Living-Proof-Labs\/collaboration-guidelines:renovate-preset#(v\d+\.\d+\.\d+)$/)?.[1])
      .find(Boolean);
    assert.equal(usesMatch[1], presetTag);
  });

  test('release job does not invoke repository settings application', () => {
    assert.doesNotMatch(releaseBlock, /apply-repository-settings|reconcile-inventory|repository-administration/);
  });
});
