// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseArgs as parseExchange, validCode } from '../../tools/github/exchange-app-manifest-code.mjs';
import { registrationForm } from '../../tools/github/render-app-manifest-form.mjs';
import { matchesState, parseArgs as parseReceiver, storeCode } from '../../tools/github/receive-app-manifest-code.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('renders an organization manifest POST form without a hosted service', () => {
  const form = registrationForm({ name: 'Example & audit' }, 'Living-Proof-Labs', 'state-value');
  assert.match(form, /organizations\/Living-Proof-Labs\/settings\/apps\/new/);
  assert.match(form, /Example &amp; audit/);
  assert.match(form, /name="manifest"/);
  assert.match(form, /name="state"/);
});

test('stores a valid callback code once without printing it', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'manifest-code-'));
  const output = path.join(directory, 'code');
  storeCode(output, 'code_123');
  assert.equal(readFileSync(output, 'utf8'), 'code_123\n');
  assert.throws(() => storeCode(output, 'other'), /accepted/);
  assert.throws(() => storeCode(path.join(directory, 'bad'), '../bad'), /accepted/);
  assert.deepEqual(parseReceiver(['--output', output, '--state-file', path.join(directory, 'state')]), { output, stateFile: path.join(directory, 'state') });
  assert.equal(matchesState('state-value', 'state-value'), true);
  assert.equal(matchesState('state-value', 'wrong'), false);
});

test('requires an explicit execute flag before manifest conversion', () => {
  assert.equal(validCode('code_123'), true);
  assert.equal(validCode('../bad'), false);
  assert.deepEqual(parseExchange(['--code-file', 'code', '--output', 'response']), {
    'code-file': 'code', output: 'response'
  });
});

test('conversion dry run never prints the one-time code', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'manifest-exchange-'));
  const codeFile = path.join(directory, 'code');
  const sentinel = 'SENTINEL_MANIFEST_CODE_123';
  writeFileSync(codeFile, `${sentinel}\n`);
  const result = spawnSync(process.execPath, [path.join(root, 'tools/github/exchange-app-manifest-code.mjs'), '--code-file', codeFile, '--output', path.join(directory, 'response')], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel));
});
