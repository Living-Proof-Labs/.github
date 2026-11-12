// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../../docs/${name}.md`, import.meta.url), 'utf8');
const vision = read('vision');
const quickstart = read('quickstart');

test('portable example downloads use one released version and five distinct teaching cases', () => {
  const links = [...vision.matchAll(/https:\/\/github\.com\/Living-Proof-Labs\/capability-verifier\/releases\/download\/([^/]+)\/([^\s)]+\.zip)/g)];
  assert.equal(links.length, 5);
  assert.equal(new Set(links.map((match) => match[2])).size, 5);
  const version = links[0][1];
  assert.match(version, /^v\d+\.\d+\.\d+$/);
  for (const [index, kind] of ['baseline', 'strict', 'negative', 'missing-measurement', 'compatibility-matrix'].entries()) {
    assert.equal(links[index][1], version);
    assert.ok(links[index][2].startsWith(`capability-verifier-${version}-${kind}-`));
  }
  assert.ok(quickstart.includes(`BASE=https://github.com/Living-Proof-Labs/capability-verifier/releases/download/${version}`));
  assert.ok(quickstart.includes(`BUNDLE=${links[0][2]}`));
  for (const asset of ['CATALOG.md', 'BUNDLE-SHA256SUMS']) {
    assert.ok(vision.includes(`/releases/download/${version}/${asset}`));
  }
  assert.doesNotMatch(vision + quickstart, /capability-verifier[^\s)]*v1\.3\.0/);
});

test('portable examples stay explicitly separate from live robot verification and the fixture demo', () => {
  assert.match(vision, /No simulator,\nrobot, model call, or live human review is involved/);
  assert.match(quickstart, /it is not the output of the demo you just ran/);
  assert.match(quickstart, /v1\.0\.1/);
  assert.match(quickstart, /v1\.1\.0/);
});
