// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { classify } from '../../tools/github/audit-status.mjs';
import { statelessInstallationToken } from './installation-token.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const tool = path.join(root, 'tools/github/audit-status.mjs');

/** v7.10.0 audit output: one block per repository, then the summary line it prints. */
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

test('strict audit reports missing Pages drift and inaccessible Pages as incomplete', () => {
  const text = audit([...published, ...noPages, ...unreadable]);
  assert.match(text, /^17 difference\(s\) found/m); // what the pinned audit tool would fail on
  const result = strict(text);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /incomplete \(7 difference\(s\); 10 Pages state\(s\) unreadable/);
});

test('strict audit stays red on real repository-settings drift alongside inaccessible Pages', () => {
  const result = strict(audit([...published, ...noPages, ...unreadable, { name: 'wiki', pages: 'missing', settings: ['has_wiki'] }]));
  assert.equal(result.status, 3, result.stdout);
  assert.match(result.stdout, /incomplete \(9 difference\(s\); 10 Pages state/);
});

test('strict audit fails when a Pages site does not enforce HTTPS and also fails for a missing site', () => {
  const drifted = audit([{ name: 'docs', pages: 'matches' }]).replace(
    '  pages: matches',
    '  pages: matches\n  pages.https_enforced: false -> true'
  );
  const driftedResult = strict(drifted);
  assert.equal(driftedResult.status, 2, driftedResult.stdout);
  assert.match(driftedResult.stdout, /drift detected \(1 difference\(s\)/);
  const absent = audit([{ name: 'plain', pages: 'missing' }]).replace(
    '  pages: missing',
    '  pages: missing\n  pages.https_enforced: no Pages site'
  );
  const absentResult = strict(absent);
  assert.equal(absentResult.status, 2, absentResult.stdout);
  assert.match(absentResult.stdout, /drift detected/);
  const exempt = audit([{ name: 'website', pages: 'matches' }]).replace(
    '  pages: matches',
    '  pages: matches\n  pages.https_enforced: exempt (HTTPS terminated at Cloudflare)'
  );
  const exemptResult = strict(exempt);
  assert.equal(exemptResult.status, 0, exemptResult.stdout);
});

test('unreadable Enforce HTTPS is incomplete; missing sites drift and HTTPS exemptions remain unmanaged; true passes and false drifts', () => {
  const sample = (pages, https) => audit([{ name: 'docs', pages }]).replace(
    `  pages: ${pages}`,
    `  pages: ${pages}\n  pages.https_enforced: ${https}`
  );
  const expectStatus = (label, text, status, message) => {
    const result = strict(text);
    assert.equal(result.status, status, `${label}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, message, label);
    return result;
  };
  const unverified = sample('matches', 'unverified');
  expectStatus('unreadable', unverified, 3, /incomplete \(0 difference\(s\); 1 pages\.https_enforced value\(s\) unknown, not counted as drift\)/);
  assert.equal(classify(unverified).httpsDrift, 0);
  assert.equal(classify(unverified).httpsUnverified, 1);
  assert.doesNotMatch(strict(unverified).stdout, /compliant|drift detected/);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'audit-status-')), 'audit.txt');
  writeFileSync(file, unverified);
  const report = spawnSync(process.execPath, [tool, file], { encoding: 'utf8' });
  assert.equal(report.status, 0, report.stdout);
  assert.match(report.stdout, /incomplete \(0 difference\(s\); 1 pages\.https_enforced value\(s\) unknown, not counted as drift\)/);
  assert.doesNotMatch(report.stdout, /compliant/);
  expectStatus('no Pages site', sample('missing', 'no Pages site'), 2, /drift detected/);
  assert.doesNotMatch(strict(sample('missing', 'no Pages site')).stdout, /unknown|compliant/);
  expectStatus('exempt', sample('matches', 'exempt (HTTPS terminated at Cloudflare)'), 0, /^Audit status: compliant\.$/m);
  expectStatus('enforced true', sample('matches', 'matches'), 0, /^Audit status: compliant\.$/m);
  const drifted = sample('matches', 'false -> true');
  expectStatus('enforced false', drifted, 2, /drift detected \(1 difference\(s\)\)/);
  assert.equal(classify(drifted).httpsDrift, 1);
  assert.equal(classify(drifted).httpsUnverified, 0);
  const mixed = `${sample('matches', 'false -> true').replace(/\n\n0 difference[\s\S]*$/, '')}\nLiving-Proof-Labs/other\n  repository settings: match\n  sponsorship settings: match\n  immutable releases: enabled\n  main ruleset: matches\n  pages: matches\n  pages.https_enforced: unverified\n\n0 difference(s) found; 0 error(s).\n`;
  const mixedStrict = expectStatus('unreadable with drift', mixed, 3, /incomplete \(1 difference\(s\); 1 pages\.https_enforced value\(s\) unknown, not counted as drift\)/);
  assert.doesNotMatch(mixedStrict.stdout, /drift detected|compliant/);
  writeFileSync(file, mixed);
  const mixedReport = spawnSync(process.execPath, [tool, file], { encoding: 'utf8' });
  assert.equal(mixedReport.status, 0, mixedReport.stdout);
  assert.equal(mixedReport.stdout, mixedStrict.stdout);
});

test('strict audit stays red when a Pages site exists with another source', () => {
  const result = strict(audit([...noPages, { name: 'legacy', pages: 'drifted (source legacy -> workflow)' }]));
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /drift detected \(8 difference\(s\)/);
});

test('unknown immutable release state is still incomplete (exit 3), and nothing is exempted from it', () => {
  const result = strict(audit([...noPages, { name: 'unknown', pages: 'missing', immutable: 'unknown' }]));
  assert.equal(result.status, 3, result.stdout);
  assert.match(result.stdout, /incomplete \(9 difference\(s\); immutable release state unknown/);
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

test('audit status output does not print a stateless installation token', () => {
  const fixture = statelessInstallationToken();
  const text = `${audit([{ name: 'docs', pages: 'matches' }])}ERROR: ${fixture.token}\n`;
  const result = strict(text);
  const printed = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, printed);
  assert.equal(printed.includes(fixture.header), false);
  assert.equal(printed.includes(fixture.payload), false);
  assert.equal(printed.includes(fixture.signature), false);
  assert.equal(printed.includes(fixture.appId), false);
  assert.match(printed, /compliant/);
});

test('missing Pages and general settings both count as drift', () => {
  const state = classify('Living-Proof-Labs/x\n  has_pages: true -> false\n  pages: missing\n\n2 difference(s) found; 0 error(s).\n');
  assert.deepEqual([state.differences, state.pagesNotEnforced, state.enforced], [2, 0, 2]);
});
