// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { annotateAudit, pagesHttpsEnforced, validatePages } from '../../tools/github/pages-https.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const policy = {
  pages: {
    build_type: 'workflow',
    https_enforced: true,
    https_enforced_exempt: [{ repo: 'website', reason: 'HTTPS terminated at Cloudflare' }]
  }
};

function audit(blocks) {
  return `${blocks.join('\n')}\n\n0 difference(s) found; 0 error(s).\n`;
}

test('a Pages site is compared, a missing site is tolerated, and an exemption is not read', async () => {
  validatePages(policy.pages);
  const calls = [];
  const text = audit([
    'Living-Proof-Labs/docs\n  pages: matches',
    'Living-Proof-Labs/plain\n  pages: missing',
    'Living-Proof-Labs/website\n  pages: matches',
    'Living-Proof-Labs/hidden\n  pages: inaccessible (HTTP 404; not treated as missing)'
  ]);
  const annotated = await annotateAudit(text, policy, async (repository) => {
    calls.push(repository);
    if (repository === 'docs') return { httpsEnforced: false };
    throw new Error(`token ghs_should_not_leak for ${repository}`);
  });
  assert.deepEqual(calls, ['docs']);
  assert.match(annotated, /Living-Proof-Labs\/docs\n {2}pages: matches\n {2}pages\.https_enforced: false -> true/);
  assert.match(annotated, /pages: missing\n {2}pages\.https_enforced: no Pages site/);
  assert.match(annotated, /pages\.https_enforced: exempt \(HTTPS terminated at Cloudflare\)/);
  assert.match(annotated, /pages\.https_enforced: unverified/);
  assert.equal(annotated.includes('ghs_should_not_leak'), false);
  assert.equal(pagesHttpsEnforced(policy, 'website').report, 'exempt (HTTPS terminated at Cloudflare)');
  assert.equal(pagesHttpsEnforced({ pages: { https_enforced: true } }, 'website').enforce, true);
});

test('the audit command does not call GitHub for a repository with no Pages site', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pages-https-'));
  const policyFile = path.join(directory, 'policy.json');
  const auditFile = path.join(directory, 'audit.txt');
  writeFileSync(policyFile, JSON.stringify({ pages: { https_enforced: true } }));
  writeFileSync(auditFile, 'Living-Proof-Labs/plain\n  pages: missing\n\n1 difference(s) found; 0 error(s).\n');
  const result = spawnSync(process.execPath, [path.join(root, 'tools/github/audit-pages-https.mjs'), policyFile, auditFile], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GH_TOKEN: 'ghs_should_not_leak' }
  });
  assert.equal(result.status, 0, result.stderr);
  const written = readFileSync(auditFile, 'utf8');
  assert.match(written, /pages\.https_enforced: no Pages site/);
  assert.equal(`${result.stdout}${result.stderr}${written}`.includes('ghs_should_not_leak'), false);
  const script = readFileSync(path.join(root, 'tools/github/repository-settings.sh'), 'utf8');
  assert.match(script, /audit-pages-https\.mjs/);
  const wrapper = readFileSync(path.join(root, 'scripts/apply-repo-policy'), 'utf8');
  const usage = readFileSync(path.join(root, 'tools/github/apply-repo-policy.mjs'), 'utf8');
  assert.equal(wrapper.includes('SETTINGS.md'), false);
  assert.equal(usage.includes('.github/SETTINGS.md'), false);
});
