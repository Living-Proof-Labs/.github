// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { statelessInstallationToken } from './installation-token.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const tool = path.join(root, 'tools/github/audit-junit.mjs');

function createJUnit({ policy, audit, manualEvidence }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'repository-settings-junit-'));
  const policyFile = path.join(directory, 'policy.json');
  const auditFile = path.join(directory, 'audit.txt');
  const outputFile = path.join(directory, 'results.xml');
  writeFileSync(policyFile, JSON.stringify(policy));
  writeFileSync(auditFile, audit);
  const evidenceFile = path.join(directory, 'manual-evidence.json');
  writeFileSync(evidenceFile, JSON.stringify(manualEvidence ?? { observations: [] }));
  const result = spawnSync(process.execPath, [tool, policyFile, auditFile, outputFile, evidenceFile], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(outputFile, 'utf8');
}

test('reports hidden main-ruleset fields as unverified and GraphQL sponsorship drift as a failure', () => {
  const xml = createJUnit({
    policy: {
      repository: { has_wiki: false },
      graphql_repository: { hasSponsorshipsEnabled: false },
      manual_or_unavailable_settings: { include_git_lfs_objects_in_archives: false }
    },
    audit: `Living-Proof-Labs/example\n  repository settings: match\n  sponsorship settings: 1 difference(s)\n  graphql.hasSponsorshipsEnabled: true -> false\n  immutable releases: enabled\n  main ruleset: unknown\n`
  });
  assert.match(xml, /tests="5" failures="1" errors="1" skipped="1"/);
  assert.match(xml, /graphql\.hasSponsorshipsEnabled/);
  assert.match(xml, /unverified main protection/);
  assert.match(xml, /unverified manual setting/);
  assert.match(xml, /no dated manual evidence/);
});

test('separates dated manual evidence from API-enforced checks', () => {
  const xml = createJUnit({
    policy: {
      repository: { has_wiki: false },
      manual_or_unavailable_settings: { include_git_lfs_objects_in_archives: false }
    },
    audit: `Living-Proof-Labs/example\n  repository settings: match\n  immutable releases: enabled\n  main ruleset: matches\n`,
    manualEvidence: {
      schema_version: 1,
      observations: [{
        observed_at: '2026-10-30T05:50:00Z',
        repositories: ['Living-Proof-Labs/example'],
        settings: { include_git_lfs_objects_in_archives: false }
      }]
    }
  });
  assert.match(xml, /tests="4" failures="0" errors="0" skipped="0"/);
  assert.match(xml, /manual observation/);
  assert.match(xml, /not an automated API measurement/);
  assert.match(xml, /2026-10-30T05:50:00Z/);
});

test('junit compares Enforce HTTPS, passes a repository with no Pages site, and records an exemption', () => {
  const xml = createJUnit({
    policy: {
      pages: {
        https_enforced: true,
        https_enforced_exempt: [{ repo: 'website', reason: 'HTTPS terminated at Cloudflare' }]
      }
    },
    audit: [
      'Living-Proof-Labs/website',
      '  pages: matches',
      '  pages.https_enforced: exempt (HTTPS terminated at Cloudflare)',
      '  immutable releases: enabled',
      '  main ruleset: matches',
      'Living-Proof-Labs/plain',
      '  pages: missing',
      '  pages.https_enforced: no Pages site',
      '  immutable releases: enabled',
      '  main ruleset: matches',
      'Living-Proof-Labs/docs',
      '  pages: matches',
      '  pages.https_enforced: false -> true',
      '  immutable releases: enabled',
      '  main ruleset: matches'
    ].join('\n')
  });
  assert.match(xml, /website :: pages\.https_enforced/);
  assert.match(xml, /exempt \(HTTPS terminated at Cloudflare\)/);
  assert.match(xml, /plain :: pages\.https_enforced"\/>/);
  assert.match(xml, /docs :: pages\.https_enforced/);
  assert.match(xml, /actual false -> true; expected true/);
  assert.equal((xml.match(/<failure /g) || []).length, 1);
});

test('reports a contradictory dated manual observation as a manual-correction warning', () => {
  const xml = createJUnit({
    policy: { manual_or_unavailable_settings: { auto_close_linked_issues: true } },
    audit: `Living-Proof-Labs/example\n  immutable releases: enabled\n  main ruleset: matches\n`,
    manualEvidence: {
      observations: [{
        observed_at: '2026-10-30T05:50:00Z',
        repositories: ['Living-Proof-Labs/example'],
        settings: { auto_close_linked_issues: false }
      }]
    }
  });
  assert.match(xml, /tests="3" failures="0" errors="0" skipped="1"/);
  assert.match(xml, /manual correction required/);
  assert.match(xml, /warning: observed false/);
});

test('junit results redact a stateless installation token', () => {
  const fixture = statelessInstallationToken();
  const xml = createJUnit({
    policy: { repository: { has_wiki: false } },
    audit: [
      'Living-Proof-Labs/example',
      '  repository settings: 1 difference(s)',
      `  has_wiki: ${fixture.token} -> false`,
      '  immutable releases: enabled',
      '  main ruleset: matches',
      ` ERROR: ${fixture.token}`
    ].join('\n')
  });
  assert.equal(xml.includes(fixture.header), false);
  assert.equal(xml.includes(fixture.payload), false);
  assert.equal(xml.includes(fixture.signature), false);
  assert.equal(xml.includes(fixture.appId), false);
  assert.equal(xml.includes(fixture.token.slice(4)), false);
  assert.match(xml, /\[redacted\]/);
});
