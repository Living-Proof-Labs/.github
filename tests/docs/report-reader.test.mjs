// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../../docs/${name}`, import.meta.url), 'utf8');

test('report reader guide is a published page reachable from the site index', () => {
  const site = JSON.parse(read('site.json'));
  assert.deepEqual(site.pages.find((p) => p.source === 'docs/reading-reports.md'), {
    source: 'docs/reading-reports.md', path: 'reading-reports.md',
    title: 'Read a robot report', license: 'CC-BY-4.0',
  });
  assert.match(read('index.md'), /\]\(reading-reports\.md\)/);
});

test('reader guidance keeps evaluator scope, evidence and simulation limits explicit', () => {
  const guide = read('reading-reports.md');
  assert.match(guide, /\]\(vision\.md#glossary\)/);
  assert.match(guide, /\*\*Scenario\*\*/);
  assert.match(guide, /\*\*Run Integrity\*\*/);
  assert.match(guide, /100% completeness result is not 100% robot/);
  assert.match(guide, /declared pin alone does not prove execution/);
  assert.match(guide, /recordings\ncan expire/);
  assert.match(guide, /simulation reports are not physical-robot/);
  assert.match(guide, /Use this run's pass bar/);
  assert.doesNotMatch(guide, /18\/20|sections A[–-]F/);
});
