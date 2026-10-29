// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { conversionEndpoint, parseArgs as parseExchange } from '../../tools/github/exchange-app-manifest-code.mjs';
import { registrationForm } from '../../tools/github/render-app-manifest-form.mjs';
import { parseArgs as parseReceiver, storeCode } from '../../tools/github/receive-app-manifest-code.mjs';

test('renders an organization manifest POST form without a hosted service', () => {
  const form = registrationForm({ name: 'Example & audit' }, 'Living-Proof-Labs');
  assert.match(form, /organizations\/Living-Proof-Labs\/settings\/apps\/new/);
  assert.match(form, /Example &amp; audit/);
  assert.match(form, /name="manifest"/);
});

test('stores a valid callback code once without printing it', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'manifest-code-'));
  const output = path.join(directory, 'code');
  storeCode(output, 'code_123');
  assert.equal(readFileSync(output, 'utf8'), 'code_123\n');
  assert.throws(() => storeCode(output, 'other'), /overwrite/);
  assert.throws(() => storeCode(path.join(directory, 'bad'), '../bad'), /valid/);
  assert.deepEqual(parseReceiver(['--output', output]), { output });
});

test('requires an explicit execute flag before manifest conversion', () => {
  assert.equal(conversionEndpoint('code_123'), 'app-manifests/code_123/conversions');
  assert.throws(() => conversionEndpoint('../bad'), /valid/);
  assert.deepEqual(parseExchange(['--code-file', 'code', '--output', 'response']), {
    'code-file': 'code', output: 'response'
  });
});
