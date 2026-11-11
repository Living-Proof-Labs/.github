// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AppTokenError, main as appTokenMain } from '../../tools/github/app-token.mjs';
import { main as applyMain } from '../../tools/github/apply-repo-policy.mjs';
import { rs256InstallationToken } from './installation-token.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function assertRedacted(printed, fixture) {
  assert.equal(printed.includes(fixture.header), false);
  assert.equal(printed.includes(fixture.payload), false);
  assert.equal(printed.includes(fixture.signature), false);
  assert.equal(printed.includes(fixture.appId), false);
  assert.equal(printed.includes(fixture.token.slice(4)), false);
}

test('an RS256-shaped stateless token is fully redacted in apply, the audit, and app-token', async () => {
  const fixture = rs256InstallationToken();
  assert.ok(fixture.token.length >= 520 && fixture.token.length <= 560, String(fixture.token.length));
  assert.equal(fixture.signature.length, 342);
  assert.equal(fixture.token.split('.').length, 3);
  assert.match(fixture.header, /^eyJ/);

  const directory = mkdtempSync(path.join(tmpdir(), 'rs256-redact-'));
  const policyFile = path.join(directory, 'policy.json');
  writeFileSync(policyFile, JSON.stringify({ schema_version: 1, repository: { has_wiki: false } }));
  const stdout = [];
  const stderr = [];
  const applyCode = await applyMain(['--dry-run', '--policy', policyFile, '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: 'test-token-value' },
    io: {
      stdout: { write: (chunk) => { stdout.push(String(chunk)); } },
      stderr: { write: (chunk) => { stderr.push(String(chunk)); } }
    },
    fetchImpl: async () => { throw new Error(`connect ${fixture.token}`); }
  });
  assert.equal(applyCode, 1);
  assertRedacted(`${stdout.join('')}${stderr.join('')}`, fixture);

  const auditFile = path.join(directory, 'audit.txt');
  writeFileSync(auditFile, [
    'Living-Proof-Labs/example',
    '  repository settings: 1 difference(s)',
    `  has_wiki: ${fixture.token} -> false`,
    '  immutable releases: enabled',
    '  main ruleset: matches',
    '  pages: missing',
    '',
    '1 difference(s) found; 0 error(s).'
  ].join('\n'));
  const status = spawnSync(process.execPath, [path.join(root, 'tools/github/audit-status.mjs'), auditFile], { encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  assertRedacted(`${status.stdout}${status.stderr}`, fixture);
  const junitFile = path.join(directory, 'results.xml');
  const junit = spawnSync(process.execPath, [
    path.join(root, 'tools/github/audit-junit.mjs'),
    policyFile,
    auditFile,
    junitFile
  ], { encoding: 'utf8' });
  assert.equal(junit.status, 0, junit.stderr);
  assertRedacted(`${junit.stdout}${junit.stderr}${readFileSync(junitFile, 'utf8')}`, fixture);

  const appOut = [];
  const appErr = [];
  const appCode = await appTokenMain(['rivet'], {
    RIVET_GITHUB_APP_ID: '12345',
    RIVET_GITHUB_APP_PRIVATE_KEY: privateKey
  }, {
    stdout: { write: (chunk) => { appOut.push(String(chunk)); } },
    stderr: { write: (chunk) => { appErr.push(String(chunk)); } },
    request: async () => { throw new AppTokenError(`upstream ${fixture.token} ${fixture.header}.${fixture.payload}.${fixture.signature}`); }
  });
  assert.equal(appCode, 1);
  assert.equal(appOut.join(''), '');
  assertRedacted(appErr.join(''), fixture);
});
