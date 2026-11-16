// SPDX-License-Identifier: Apache-2.0
// Vera review of #106 (Renovate "pin dependencies"). Offline: every third-party
// Action in the workflows is pinned by a full 40-hex commit SHA with an exact
// "# vX.Y.Z" release comment, and every setup-node node-version is exact.
// LIVINGPROOF_NETWORK=1: each SHA is the peeled commit of the commented tag.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const FILES = readdirSync(WORKFLOWS).filter(name => /\.ya?ml$/.test(name)).sort();
const USES = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm;
const PINNED = /^([\w.-]+\/[\w.-]+)(?:\/[\w./-]+)?@([0-9a-f]{40})$/;
const COMMENT = /^\s*#\s*(v\d+\.\d+\.\d+)\s*$/;

function thirdPartyUses() {
  const found = [];
  for (const file of FILES) {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    for (const match of text.matchAll(USES)) {
      const [, ref, rest] = match;
      if (ref.startsWith('./') || ref.startsWith('Living-Proof-Labs/') || ref.startsWith('docker://')) continue;
      found.push({ file, ref, rest });
    }
  }
  return found;
}

test('third-party Actions are pinned by full SHA with an exact release comment', () => {
  const found = thirdPartyUses();
  assert.ok(found.length > 0, 'expected third-party Actions in the workflows');
  for (const { file, ref, rest } of found) {
    assert.match(ref, PINNED, `${file}: ${ref} is not pinned by a full commit SHA`);
    assert.match(rest, COMMENT, `${file}: ${ref} lacks an exact "# vX.Y.Z" comment`);
  }
});

test('setup-node versions are exact', () => {
  let count = 0;
  for (const file of FILES) {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    for (const match of text.matchAll(/^\s*node-version:\s*['"]?([^'"\s]+)['"]?\s*$/gm)) {
      count += 1;
      assert.match(match[1], /^\d+\.\d+\.\d+$/, `${file}: node-version ${match[1]} is not exact`);
    }
  }
  assert.ok(count > 0, 'expected setup-node versions in the workflows');
});

const skipNetwork = process.env.LIVINGPROOF_NETWORK ? false : 'set LIVINGPROOF_NETWORK=1';

test('each Action SHA is the peeled commit of its commented tag', { skip: skipNetwork }, async () => {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const cache = new Map();
  for (const { file, ref, rest } of thirdPartyUses()) {
    const [, ownerRepo, sha] = PINNED.exec(ref);
    const [, tag] = COMMENT.exec(rest);
    const key = `${ownerRepo}@${tag}`;
    if (!cache.has(key)) {
      const url = `https://api.github.com/repos/${ownerRepo}/commits/${tag}`;
      const response = await fetch(url, { headers });
      assert.ok(response.ok, `${url} -> ${response.status}`);
      cache.set(key, (await response.json()).sha);
    }
    assert.equal(sha, cache.get(key), `${file}: ${ownerRepo}@${sha} is not the commit of ${tag}`);
  }
});

test('the node-version pin is a published Node.js release', { skip: skipNetwork }, async () => {
  const response = await fetch('https://nodejs.org/dist/index.json');
  assert.ok(response.ok, `nodejs.org -> ${response.status}`);
  const releases = new Set((await response.json()).map(release => release.version));
  for (const file of FILES) {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    for (const match of text.matchAll(/^\s*node-version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/gm)) {
      assert.ok(releases.has(`v${match[1]}`), `${file}: Node.js v${match[1]} is not published`);
    }
  }
});
