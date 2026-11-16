// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const config = JSON.parse(readFileSync(path.join(root, 'renovate.json'), 'utf8'));
const presetPins = (config.extends ?? []).filter(item =>
  item.startsWith('github>Living-Proof-Labs/collaboration-guidelines:renovate-preset#'),
);

test('the only guidelines Renovate preset pin is the published v9.4.0 tag', () => {
  assert.deepEqual(presetPins, [
    'github>Living-Proof-Labs/collaboration-guidelines:renovate-preset#v9.4.0',
  ]);
});

test('this repository has no docs-brand lock, so the v9.4.0 docs-brand manager extracts nothing here', () => {
  assert.equal(existsSync(path.join(root, 'docs-brand.lock.json')), false);
});
