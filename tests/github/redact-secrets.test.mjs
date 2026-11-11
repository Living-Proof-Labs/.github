// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { redactSecrets } from '../../tools/github/redact-secrets.mjs';
import { CLASSIC_INSTALLATION_TOKEN, statelessInstallationToken } from './installation-token.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = statelessInstallationToken();
const jwt = `${fixture.header}.${fixture.payload}.${fixture.signature}`;

function assertFullyRedacted(text, secret, label) {
  assert.equal(text.includes(secret), false, label);
  const body = secret.startsWith('ghs_') ? secret.slice(4) : secret;
  assert.equal(text.includes(body), false, `${label} body`);
}

test('stateless ghs_ tokens, JWTs, and classic tokens are fully redacted', () => {
  const personal = `ghp_${'D'.repeat(36)}`;
  const oauth = `gho_${'E'.repeat(36)}`;
  const user = `ghu_${'F'.repeat(36)}`;
  const refresh = `ghr_${'G'.repeat(36)}`;
  const fine = `github_pat_${'e'.repeat(22)}_${'f'.repeat(59)}`;
  const text = [
    `before ${fixture.token} after`,
    `jwt ${jwt}`,
    `classic ${CLASSIC_INSTALLATION_TOKEN}`,
    `pat ${personal}`,
    `oauth ${oauth}`,
    `user ${user}`,
    `refresh ${refresh}`,
    `fine ${fine}`,
    'pages: missing'
  ].join('\n');
  const cleaned = redactSecrets(text);
  assertFullyRedacted(cleaned, fixture.token, 'stateless');
  assert.equal(cleaned.includes(fixture.header), false);
  assert.equal(cleaned.includes(fixture.payload), false);
  assert.equal(cleaned.includes(fixture.signature), false);
  assert.equal(cleaned.includes(fixture.appId), false);
  assertFullyRedacted(cleaned, jwt, 'jwt');
  assertFullyRedacted(cleaned, CLASSIC_INSTALLATION_TOKEN, 'classic ghs_');
  assertFullyRedacted(cleaned, personal, 'ghp_');
  assertFullyRedacted(cleaned, oauth, 'gho_');
  assertFullyRedacted(cleaned, user, 'ghu_');
  assertFullyRedacted(cleaned, refresh, 'ghr_');
  assert.equal(cleaned.includes('e'.repeat(22)), false);
  assert.equal(cleaned.includes('f'.repeat(59)), false);
  assert.match(cleaned, /before \[redacted\] after/);
  assert.match(cleaned, /pages: missing/);
  assert.equal(redactSecrets('ghs_short'), 'ghs_short');
  assert.equal(redactSecrets('seen ghs_short', 'ghs_short'), 'seen [redacted]');
});

test('the redactor command and the settings audit wrapper redact a stateless token', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'tools/github/redact-secrets.mjs')], {
    input: `ERROR: ${fixture.token}\n`,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(fixture.token.slice(4)), false);
  assert.equal(result.stdout.includes(fixture.payload), false);
  assert.equal(result.stdout.includes(fixture.signature), false);
  assert.match(result.stdout, /ERROR: \[redacted\]/);

  const audit = readFileSync(path.join(root, 'tools/github/repository-settings.sh'), 'utf8');
  assert.match(audit, /redact-secrets\.mjs/);
  const apply = readFileSync(path.join(root, 'scripts/apply-repo-policy'), 'utf8');
  const applyTool = readFileSync(path.join(root, 'tools/github/apply-repo-policy.mjs'), 'utf8');
  assert.match(apply, /apply-repo-policy\.mjs/);
  assert.match(applyTool, /redactSecrets/);
  assert.match(readFileSync(path.join(root, 'tools/github/app-token.mjs'), 'utf8'), /redactSecrets/);
  assert.match(readFileSync(path.join(root, 'tools/github/audit-junit.mjs'), 'utf8'), /redactSecrets/);
  assert.match(readFileSync(path.join(root, 'tools/github/audit-status.mjs'), 'utf8'), /redactSecrets/);
});
