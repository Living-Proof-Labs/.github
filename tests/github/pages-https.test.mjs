// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { classify, decide } from '../../tools/github/audit-status.mjs';
import { annotateAudit, pagesHttpsEnforced, readHttpsEnforced, validatePages } from '../../tools/github/pages-https.mjs';

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

test('nine Pages sites do not count website as Enforce HTTPS drift', async () => {
  const others = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
  const blocks = ['website', ...others].map((name) => `Living-Proof-Labs/${name}\n  pages: matches`);
  const calls = [];
  const annotated = await annotateAudit(audit(blocks), policy, async (repository) => {
    calls.push(repository);
    return { httpsEnforced: false };
  });
  assert.deepEqual(calls.sort(), others.sort());
  assert.match(annotated, /Living-Proof-Labs\/website\n {2}pages: matches\n {2}pages\.https_enforced: exempt \(HTTPS terminated at Cloudflare\)/);
  assert.equal(annotated.includes('website\n  pages: matches\n  pages.https_enforced: false'), false);
  const state = classify(annotated);
  assert.equal(state.httpsDrift, 8);
  assert.equal(state.enforced, 8);
  const again = await annotateAudit(annotated, policy, async () => {
    throw new Error('a reported Enforce HTTPS line must not be read again');
  });
  assert.equal(again, annotated);
  assert.equal(classify(again).enforced, 8);
});

test('HTTP 403, a failed fetch, and a non-boolean field are unverified on an otherwise compliant audit', async () => {
  const token = 'ghs_should_not_leak';
  const compliant = [
    'Living-Proof-Labs/docs',
    '  repository settings: match',
    '  sponsorship settings: match',
    '  immutable releases: enabled',
    '  main ruleset: matches',
    '  pages: matches',
    '',
    '0 difference(s) found; 0 error(s).',
    ''
  ].join('\n');
  const reads = {
    forbidden: { ok: false, status: 403, async json() { return { message: 'SECRET_BODY_should_not_leak' }; } },
    failed: () => { throw new Error(`network ${token}`); },
    missing: { ok: true, status: 200, async json() { return { build_type: 'workflow' }; } },
    nonboolean: { ok: true, status: 200, async json() { return { https_enforced: 'true' }; } },
    enforcedTrue: { ok: true, status: 200, async json() { return { https_enforced: true }; } },
    enforcedFalse: { ok: true, status: 200, async json() { return { https_enforced: false }; } }
  };
  const expected = {
    forbidden: [/pages\.https_enforced: unverified/, 3, /unknown, not counted as drift/],
    failed: [/pages\.https_enforced: unverified/, 3, /unknown, not counted as drift/],
    missing: [/pages\.https_enforced: unverified/, 3, /unknown, not counted as drift/],
    nonboolean: [/pages\.https_enforced: unverified/, 3, /unknown, not counted as drift/],
    enforcedTrue: [/pages\.https_enforced: matches/, 0, /^Audit status: compliant\.$/],
    enforcedFalse: [/pages\.https_enforced: false -> true/, 2, /drift detected \(1 difference\(s\)\)\.$/]
  };
  for (const [mode, response] of Object.entries(reads)) {
    const calls = [];
    const observed = await readHttpsEnforced('docs', {
      token,
      owner: 'Living-Proof-Labs',
      fetchImpl: async (url, init) => {
        calls.push({ url, authorization: init?.headers?.Authorization });
        const result = typeof response === 'function' ? response() : response;
        return result;
      }
    });
    const annotated = await annotateAudit(compliant, policy, async () => observed);
    const decision = decide(annotated, true);
    const [line, status, message] = expected[mode];
    assert.deepEqual(calls, [{
      url: 'https://api.github.com/repos/Living-Proof-Labs/docs/pages',
      authorization: `Bearer ${token}`
    }], mode);
    assert.match(annotated, line, mode);
    assert.equal(decision.status, status, `${mode}: ${decision.message}`);
    assert.match(decision.message, message, mode);
    assert.equal(`${annotated}${decision.message}`.includes(token), false, mode);
    assert.equal(`${annotated}${decision.message}`.includes('SECRET_BODY_should_not_leak'), false, mode);
    if (status === 3) {
      assert.equal(classify(annotated).httpsDrift, 0, mode);
      assert.equal(classify(annotated).enforced, 0, mode);
      const report = decide(annotated, false);
      assert.equal(report.status, 0, mode);
      assert.equal(report.message, decision.message, mode);
    }
  }
  const untouched = [];
  const absent = await annotateAudit(
    'Living-Proof-Labs/plain\n  pages: missing\n\n1 difference(s) found; 0 error(s).\n',
    policy,
    async (repository) => { untouched.push(repository); return { httpsEnforced: false }; }
  );
  const exempted = await annotateAudit(
    'Living-Proof-Labs/website\n  pages: matches\n\n0 difference(s) found; 0 error(s).\n',
    policy,
    async (repository) => { untouched.push(repository); return { httpsEnforced: false }; }
  );
  assert.deepEqual(untouched, []);
  assert.match(absent, /pages\.https_enforced: no Pages site/);
  assert.match(exempted, /pages\.https_enforced: exempt \(HTTPS terminated at Cloudflare\)/);
  assert.equal(decide(absent, true).status, 0);
  assert.match(decide(absent, true).message, /compliant/);
  assert.doesNotMatch(decide(absent, true).message, /unknown/);
  assert.equal(decide(exempted, true).status, 0);
  assert.match(decide(exempted, true).message, /^Audit status: compliant\.$/);
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
