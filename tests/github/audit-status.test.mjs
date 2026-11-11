// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { classify } from '../../tools/github/audit-status.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const tool = path.join(root, 'tools/github/audit-status.mjs');

/** v7.9.0 audit output: one block per repository, then the summary line it prints. */
function audit(repositories) {
  let total = 0;
  const blocks = repositories.map(({ name, pages, settings = [], immutable = 'enabled' }) => {
    total += settings.length + (immutable === 'enabled' ? 0 : 1) + (pages === 'matches' ? 0 : 1);
    return [
      `Living-Proof-Labs/${name}`,
      settings.length ? `  repository settings: ${settings.length} difference(s)` : '  repository settings: match',
      ...settings.map((field) => `  ${field}: true -> false`),
      '  sponsorship settings: match',
      `  immutable releases: ${immutable}`,
      '  main ruleset: matches',
      `  pages: ${pages}`
    ].join('\n');
  });
  return `${blocks.join('\n')}\n\n${total} difference(s) found; 0 error(s).\n`;
}

function strict(text) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'audit-status-')), 'audit.txt');
  writeFileSync(file, text);
  return spawnSync(process.execPath, [tool, file, '--fail-on-drift'], { encoding: 'utf8' });
}

const noPages = Array.from({ length: 7 }, (_, index) => ({ name: `no-site-${index}`, pages: 'missing' }));
const unreadable = Array.from({ length: 10 }, (_, index) => ({
  name: `hidden-${index}`, pages: 'inaccessible (HTTP 404; not treated as missing)'
}));
const published = [{ name: 'docs', pages: 'matches' }];

test('strict audit is green when the only differences are repositories without Pages or with unreadable Pages', () => {
  const text = audit([...published, ...noPages, ...unreadable]);
  assert.match(text, /^17 difference\(s\) found/m); // what the pinned audit tool would fail on
  const result = strict(text);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /compliant \(17 Pages state\(s\) missing or unreadable, reported but not enforced\)/);
});

test('strict audit stays red on real repository-settings drift alongside Pages exemptions', () => {
  const result = strict(audit([...published, ...noPages, ...unreadable, { name: 'wiki', pages: 'missing', settings: ['has_wiki'] }]));
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /drift detected \(1 difference\(s\); 18 Pages state\(s\) missing/);
});

test('strict audit stays red when a Pages site exists with another source', () => {
  const result = strict(audit([...noPages, { name: 'legacy', pages: 'drifted (source legacy -> workflow)' }]));
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /drift detected \(1 difference\(s\)/);
});

test('unknown immutable release state is still incomplete (exit 3), and nothing is exempted from it', () => {
  const result = strict(audit([...noPages, { name: 'unknown', pages: 'missing', immutable: 'unknown' }]));
  assert.equal(result.status, 3, result.stdout);
  assert.match(result.stdout, /incomplete \(1 difference\(s\); 8 Pages state/);
});

test('without --fail-on-drift drift is reported but exits 0, and an unrecognizable audit exits 4', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'audit-status-')), 'audit.txt');
  writeFileSync(file, audit([{ name: 'wiki', pages: 'matches', settings: ['has_wiki'] }]));
  const lenient = spawnSync(process.execPath, [tool, file], { encoding: 'utf8' });
  assert.equal(lenient.status, 0);
  assert.match(lenient.stdout, /drift detected \(1 difference/);
  writeFileSync(file, 'nothing useful\n');
  const broken = spawnSync(process.execPath, [tool, file, '--fail-on-drift'], { encoding: 'utf8' });
  assert.equal(broken.status, 4);
  assert.match(broken.stderr, /refusing to classify/);
});

test('only Pages lines are exempted, never a setting that happens to mention pages', () => {
  const state = classify('Living-Proof-Labs/x\n  has_pages: true -> false\n  pages: missing\n\n2 difference(s) found; 0 error(s).\n');
  assert.deepEqual([state.differences, state.pagesNotEnforced, state.enforced], [2, 1, 1]);
});
