// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { anchors, check, slugify } from '../../tools/docs/check-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function copy() {
  const dir = mkdtempSync(path.join(tmpdir(), 'org-docs-'));
  cpSync(path.join(ROOT, 'docs'), path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(ROOT, 'config'), path.join(dir, 'config'), { recursive: true });
  cpSync(path.join(ROOT, 'AGENTS.md'), path.join(dir, 'AGENTS.md'));
  return dir;
}
const edit = (dir, rel, fn) => writeFileSync(path.join(dir, rel), fn(readFileSync(path.join(dir, rel), 'utf8')));
const json = (dir, rel, fn) => edit(dir, rel, (t) => JSON.stringify(fn(JSON.parse(t)), null, 2));

test('the organization documentation is valid as committed', () => {
  assert.deepEqual(check(ROOT), []);
});

test('architecture is published, in navigation, and reachable from the homepage', () => {
  const site = JSON.parse(readFileSync(path.join(ROOT, 'docs/site.json'), 'utf8'));
  assert.ok(site.pages.some((p) => p.source === 'docs/architecture/verification-architecture.md'));
  assert.match(readFileSync(path.join(ROOT, 'docs/index.md'), 'utf8'), /\]\(architecture\/verification-architecture\.md\)/);
});

test('slugs and explicit ids match the published anchors', () => {
  assert.equal(slugify('Run and series flow'), 'run-and-series-flow');
  assert.equal(slugify('Evaluation is not diagnosis'), 'evaluation-is-not-diagnosis');
  assert.deepEqual([...anchors('# A `b` c\n<a id="keep"></a>\n```\n# not a heading\n```\n')], ['a-b-c', 'keep']);
});

test('a missing declared page fails', () => {
  const dir = copy();
  json(dir, 'docs/site.json', (s) => ({ ...s, pages: [...s.pages, { source: 'docs/gone.md', path: 'gone.md', title: 'Gone', license: 'CC-BY-4.0' }] }));
  assert.ok(check(dir).some((e) => e.includes('missing page docs/gone.md')));
});

test('a broken link, a broken fragment and a published .html link fail', () => {
  const dir = copy();
  edit(dir, 'docs/index.md', (t) => t + '\n[a](nowhere.md) [b](vision.md#no-such-section) [c](vision.html)\n');
  const errors = check(dir).join('\n');
  assert.match(errors, /broken link nowhere\.md/);
  assert.match(errors, /broken fragment vision\.md#no-such-section/);
  assert.match(errors, /link vision\.html to the \.md source/);
});

test('links inside code are not checked', () => {
  const dir = copy();
  edit(dir, 'docs/index.md', (t) => t + '\n```text\n[a](nowhere.md)\n```\n`[b](nowhere.md)`\n');
  assert.deepEqual(check(dir), []);
});

test('a directory entry outside the inventory fails', () => {
  const dir = copy();
  json(dir, 'docs/directory.json', (d) => ({ ...d, projects: [...d.projects, { repository: 'not-registered', title: 'X', summary: 'Y' }] }));
  assert.ok(check(dir).some((e) => e.includes('not-registered is not in config/github/repositories.json')));
});

test('the homepage directory links every listed repository and manual', () => {
  const dir = copy();
  edit(dir, 'docs/index.md', (t) => t.replace(/^(\| Capability verifier \|.*)\]\(https:\/\/docs\.livingprooflabs\.com\/capability-verifier\/\)/m, '$1](https://example.com/)'));
  assert.ok(check(dir).some((e) => e.includes('row capability-verifier manual must be https://docs.livingprooflabs.com/capability-verifier/')));
});

test('a redirect must target a published page and must not hide one', () => {
  const dir = copy();
  json(dir, 'docs/site.json', (s) => ({ ...s, redirects: { 'old.html': 'missing.html', 'vision.html': 'index.html' } }));
  const errors = check(dir).join('\n');
  assert.match(errors, /redirect old\.html targets missing\.html/);
  assert.match(errors, /redirect vision\.html would hide a published page/);
});

test('Mermaid outside the supported types or with a theme override fails', () => {
  const dir = copy();
  edit(dir, 'docs/contribute.md', (t) => t + '\n```mermaid\npie title x\n```\n\n```mermaid\n%%{init: {"theme": "dark"}}%%\nflowchart LR\n  a --> b\n```\n');
  const errors = check(dir).join('\n');
  assert.match(errors, /Mermaid type "pie title x"/);
  assert.match(errors, /%%\{init\}%% overrides the site theme/);
});

test('the directory must list every inventory repository', () => {
  const dir = copy();
  json(dir, 'docs/directory.json', (d) => ({ ...d, projects: d.projects.filter((p) => p.repository !== 'website') }));
  assert.ok(check(dir).some((e) => e.includes('missing inventory repository website')));
});

test('a directory table row missing from directory.json fails', () => {
  const dir = copy();
  edit(dir, 'docs/index.md', (t) => t.replace(/^\| Website \|.*\n/m, ''));
  assert.ok(check(dir).some((e) => e.includes('project directory is missing row website')));
});

test('an extra directory table row fails', () => {
  const dir = copy();
  edit(dir, 'docs/index.md', (t) => t.replace(/^(\| Website \|.*\n)/m, '$1| Extra | X. | [extra](https://github.com/Living-Proof-Labs/extra) | Not yet published |\n'));
  assert.ok(check(dir).some((e) => e.includes('project directory has extra row extra')));
});
