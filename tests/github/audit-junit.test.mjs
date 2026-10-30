// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const tool = path.join(root, 'tools/github/audit-junit.mjs');

function createJUnit({ policy, audit }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'repository-settings-junit-'));
  const policyFile = path.join(directory, 'policy.json');
  const auditFile = path.join(directory, 'audit.txt');
  const outputFile = path.join(directory, 'results.xml');
  writeFileSync(policyFile, JSON.stringify(policy));
  writeFileSync(auditFile, audit);
  const result = spawnSync(process.execPath, [tool, policyFile, auditFile, outputFile], { encoding: 'utf8' });
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
  assert.match(xml, /tests="5" failures="1" errors="2"/);
  assert.match(xml, /graphql\.hasSponsorshipsEnabled/);
  assert.match(xml, /unverified main protection/);
  assert.match(xml, /manual verification required/);
});
