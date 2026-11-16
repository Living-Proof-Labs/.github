// SPDX-License-Identifier: Apache-2.0
// The guidelines Renovate preset pin, checked by shape and a floor rather than one
// frozen version (Vera review of #109; replaces the v9.4.0-only check from #105,
// which broke this bump). v9.5.0 is the first release with rebaseWhen: "conflicted"
// (.github#103). LIVINGPROOF_NETWORK=1 also reads the pinned release and its preset.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const REPO = 'Living-Proof-Labs/collaboration-guidelines';
const PIN = /^github>Living-Proof-Labs\/collaboration-guidelines:renovate-preset#v(\d+)\.(\d+)\.(\d+)$/;
const FLOOR = [9, 5, 0];
const config = JSON.parse(readFileSync(path.join(root, 'renovate.json'), 'utf8'));
const skipNetwork = process.env.LIVINGPROOF_NETWORK ? false : 'set LIVINGPROOF_NETWORK=1';

function pinnedVersion() {
  const pins = (config.extends ?? []).filter(item => item.startsWith(`github>${REPO}:`));
  assert.equal(pins.length, 1, `expected one guidelines preset pin, got ${JSON.stringify(pins)}`);
  const match = PIN.exec(pins[0]);
  assert.ok(match, `${pins[0]} is not a full vX.Y.Z release tag`);
  return match.slice(1).map(Number);
}

function atLeast(version, floor) {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] !== floor[i]) return version[i] > floor[i];
  }
  return true;
}

test('the only guidelines preset pin is a full release tag at or above v9.5.0', () => {
  const version = pinnedVersion();
  assert.ok(atLeast(version, FLOOR), `v${version.join('.')} is below v${FLOOR.join('.')}`);
  assert.equal(atLeast([9, 4, 9], FLOOR), false);
  assert.equal(atLeast([10, 0, 0], FLOOR), true);
});

test('this repository has no docs-brand lock, so the docs-brand manager extracts nothing here', () => {
  assert.equal(existsSync(path.join(root, 'docs-brand.lock.json')), false);
});

test('the pinned release is published and its preset rebases only on conflict', { skip: skipNetwork }, async () => {
  const tag = `v${pinnedVersion().join('.')}`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const release = await (await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers })).json();
  assert.equal(release.tag_name, tag);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  const raw = await fetch(`https://api.github.com/repos/${REPO}/contents/renovate-preset.json?ref=${tag}`, {
    headers: { ...headers, Accept: 'application/vnd.github.raw' },
  });
  assert.equal(raw.status, 200);
  const preset = await raw.json();
  assert.equal(preset.rebaseWhen, 'conflicted');
  assert.equal(preset.automerge, false);
  assert.equal(preset.platformAutomerge, false);
});
