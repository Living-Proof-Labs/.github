// SPDX-License-Identifier: Apache-2.0
// The media NOTICE must record the hashes of the files actually shipped beside it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const MEDIA = path.join(import.meta.dirname, '../../docs/media');

function section(notice, heading) {
  const start = notice.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, heading);
  const rows = {};
  for (const line of notice.slice(start + heading.length + 1).split('\n')) {
    const m = line.match(/^ {2}(\S+)\s+([0-9a-f]{40,64})$/);
    if (!m) break;
    rows[m[1]] = m[2];
  }
  return rows;
}

test('NOTICE.txt SHA-256 and git blob lines match every shipped media file', () => {
  const notice = readFileSync(path.join(MEDIA, 'NOTICE.txt'), 'utf8');
  const files = readdirSync(MEDIA).filter((name) => name !== 'NOTICE.txt').sort();
  const sha256 = section(notice, 'SHA-256:');
  const blob = section(notice, 'Git blob SHA-1:');
  assert.deepEqual(Object.keys(sha256).sort(), files);
  assert.deepEqual(Object.keys(blob).sort(), files);
  for (const name of files) {
    const bytes = readFileSync(path.join(MEDIA, name));
    assert.equal(sha256[name], createHash('sha256').update(bytes).digest('hex'), name);
    const header = Buffer.from(`blob ${bytes.length}\0`);
    assert.equal(blob[name], createHash('sha1').update(Buffer.concat([header, bytes])).digest('hex'), name);
  }
});
