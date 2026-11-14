// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AppTokenError,
  BOTS,
  discoverBots,
  normalizeBot,
  DEFAULT_ORG,
  envNames,
  loadBotConfig,
  main,
  mintInstallationToken,
  normalizePrivateKey,
  resolveApiUrl,
  signAppJwt
} from '../../tools/github/app-token.mjs';
import { BOT_MANIFESTS, validateAllFromDisk, validateBotManifest } from '../../tools/github/verify-app-manifests.mjs';
import { registrationManifests, validateRegistrationManifest } from '../../tools/github/manifest-directory.mjs';
import { CLASSIC_INSTALLATION_TOKEN, statelessInstallationToken } from './installation-token.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
const SENTINEL = 'SENTINEL_PRIVATE_KEY_MATERIAL';

function tempDirectory(t, prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function decodeJwt(jwt) {
  const [header, payload, signature] = jwt.split('.');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, 'base64url')), true);
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  };
}

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write: (chunk) => { stdout.push(String(chunk)); } },
    stderr: { write: (chunk) => { stderr.push(String(chunk)); } },
    out: () => stdout.join(''),
    err: () => stderr.join('')
  };
}

function rivetEnv(overrides = {}) {
  return {
    RIVET_GITHUB_APP_ID: '12345',
    RIVET_GITHUB_APP_PRIVATE_KEY: privateKey,
    ...overrides
  };
}

test('versioned manifests match the least-privilege bot sets', () => {
  validateAllFromDisk(root);
  for (const { agent: bot, manifest } of registrationManifests(root)) {
    assert.equal(validateRegistrationManifest(bot, manifest).name, manifest.name);
    assert.deepEqual(manifest.default_events, []);
    assert.equal(manifest.public, false);
    assert.equal(Object.hasOwn(manifest, 'hook_attributes'), false);
  }
  for (const bot of ['cody', 'vera']) {
    const permissions = BOT_MANIFESTS[bot].permissions;
    assert.equal(Object.hasOwn(permissions, 'administration'), false);
    assert.equal(Object.hasOwn(permissions, 'pages'), false);
  }
  assert.equal(Object.hasOwn(BOT_MANIFESTS.vera.permissions, 'statuses'), false);
  assert.equal(BOT_MANIFESTS.cody.permissions.statuses, 'read');
  assert.equal(BOT_MANIFESTS.cody.permissions.organization_projects, 'write');
  assert.equal(Object.hasOwn(BOT_MANIFESTS.cody.permissions, 'deployments'), false);
  const rivet = BOT_MANIFESTS.rivet.permissions;
  assert.equal(rivet.administration, undefined);
  assert.equal(rivet.pages, 'write');
  assert.equal(rivet.contents, 'write');
  assert.equal(rivet.pull_requests, 'write');
  assert.equal(rivet.issues, 'write');
  assert.equal(rivet.actions, 'write');
  assert.equal(rivet.checks, 'read');
  assert.equal(rivet.metadata, 'read');
  assert.equal(rivet.statuses, 'read');
  assert.equal(rivet.deployments, 'read');
  assert.equal(rivet.workflows, 'write');
  assert.equal(BOT_MANIFESTS.cody.permissions.workflows, 'write');
  assert.equal(BOT_MANIFESTS.cody.permissions.actions, 'read');
  assert.equal(BOT_MANIFESTS.vera.permissions.actions, 'read');
  assert.equal(BOT_MANIFESTS.vera.permissions.contents, 'read');
  assert.equal(Object.hasOwn(BOT_MANIFESTS, 'keel'), false);
  assert.throws(() => validateBotManifest('cody', {
    ...JSON.parse(readFileSync(path.join(root, BOT_MANIFESTS.cody.file), 'utf8')),
    default_permissions: { ...BOT_MANIFESTS.cody.permissions, administration: 'read' }
  }), /least-privilege|Administration/);
});

test('JWT claims are iss, iat, and exp, signed with RS256', () => {
  const nowMs = 1_700_000_000_000;
  const { jwt, claims } = signAppJwt('12345', normalizePrivateKey(privateKey, 'RIVET_GITHUB_APP_PRIVATE_KEY'), nowMs);
  const decoded = decodeJwt(jwt);
  assert.deepEqual(decoded.header, { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(decoded.payload, claims);
  assert.equal(claims.iss, '12345');
  assert.equal(claims.iat, 1_700_000_000 - 60);
  assert.equal(claims.exp, 1_700_000_000 + 9 * 60);
  assert.ok(claims.exp - Math.floor(nowMs / 1000) <= 600);
  assert.deepEqual(Object.keys(claims).sort(), ['exp', 'iat', 'iss']);
});

test('a PEM stored with escaped newlines or quotes still signs', () => {
  const escaped = privateKey.trim().replaceAll('\n', '\\n');
  const quoted = `"${escaped}"`;
  const key = normalizePrivateKey(quoted, 'RIVET_GITHUB_APP_PRIVATE_KEY');
  const { jwt } = signAppJwt('9', key, 1_700_000_000_000);
  assert.equal(decodeJwt(jwt).payload.iss, '9');
});

test('a file path is rejected and the path text is not treated as a key', (t) => {
  const directory = tempDirectory(t, 'app-token-key-');
  const keyPath = path.join(directory, 'key.pem');
  writeFileSync(keyPath, `${privateKey}${SENTINEL}\n`);
  assert.throws(() => normalizePrivateKey(keyPath, 'RIVET_GITHUB_APP_PRIVATE_KEY'), (error) => {
    assert.equal(error instanceof AppTokenError, true);
    assert.match(error.message, /file path/);
    assert.equal(error.message.includes(SENTINEL), false);
    assert.equal(error.message.includes('BEGIN RSA'), false);
    return true;
  });
  assert.throws(() => normalizePrivateKey('-----BEGIN RSA PRIVATE KEY-----\nnot-a-key\n-----END RSA PRIVATE KEY-----\n', 'RIVET_GITHUB_APP_PRIVATE_KEY'), (error) => {
    assert.equal(error.message.includes('not-a-key'), false);
    return true;
  });
});

test('API origin rejects non-https hosts and embedded credentials', () => {
  const url = resolveApiUrl('https://api.github.com', '/orgs/Living-Proof-Labs/installation');
  assert.equal(url.href, 'https://api.github.com/orgs/Living-Proof-Labs/installation');
  assert.equal(resolveApiUrl('http://127.0.0.1:9', '/app/installations/1/access_tokens').protocol, 'http:');
  assert.throws(() => resolveApiUrl('http://example.com', '/app'), /https/);
  assert.throws(() => resolveApiUrl('https://user:secret@api.github.com', '/app'), /credentials/);
});

test('installation lookup then token exchange uses one JWT and returns only the token', async () => {
  const calls = [];
  const nowMs = 1_700_000_100_000;
  const token = await mintInstallationToken({
    appId: '12345',
    privateKey: normalizePrivateKey(privateKey, 'RIVET_GITHUB_APP_PRIVATE_KEY'),
    org: DEFAULT_ORG,
    nowMs,
    request: async (spec) => {
      calls.push(spec);
      if (spec.method === 'GET') {
        return { ok: true, status: 200, body: { id: 99, account: { login: 'Living-Proof-Labs', type: 'Organization' } } };
      }
      return {
        ok: true,
        status: 201,
        body: { token: CLASSIC_INSTALLATION_TOKEN, expires_at: '2030-01-01T00:00:00Z', pem: privateKey }
      };
    }
  });
  assert.equal(token, CLASSIC_INSTALLATION_TOKEN);
  assert.equal(token.includes('.'), false);
  assert.equal(token.length, 40);
  assert.deepEqual(calls.map((call) => [call.method, call.path]), [
    ['GET', '/orgs/Living-Proof-Labs/installation'],
    ['POST', '/app/installations/99/access_tokens']
  ]);
  assert.equal(calls[0].jwt, calls[1].jwt);
  const claims = decodeJwt(calls[0].jwt).payload;
  assert.equal(claims.iss, '12345');
  assert.equal(claims.iat, 1_700_000_100 - 60);
  assert.equal(token.includes(privateKey), false);
});

test('an installation id skips the organization lookup', async () => {
  const calls = [];
  const token = await mintInstallationToken({
    appId: '12345',
    privateKey: normalizePrivateKey(privateKey, 'RIVET_GITHUB_APP_PRIVATE_KEY'),
    installationId: '77',
    org: DEFAULT_ORG,
    request: async (spec) => {
      calls.push(spec.method);
      return { ok: true, status: 201, body: { token: CLASSIC_INSTALLATION_TOKEN } };
    }
  });
  assert.equal(token, CLASSIC_INSTALLATION_TOKEN);
  assert.deepEqual(calls, ['POST']);
});

test('a stateless installation token is accepted and is not a fixed length', async () => {
  const fixture = statelessInstallationToken();
  assert.ok(fixture.token.length > 40);
  assert.equal(fixture.token.split('.').length, 3);
  assert.match(fixture.token, /^ghs_9876543210_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const token = await mintInstallationToken({
    appId: '12345',
    privateKey: normalizePrivateKey(privateKey, 'RIVET_GITHUB_APP_PRIVATE_KEY'),
    installationId: '77',
    org: DEFAULT_ORG,
    request: async () => ({ ok: true, status: 201, body: { token: fixture.token } })
  });
  assert.equal(token, fixture.token);

  const io = capture();
  const code = await main(['rivet'], rivetEnv(), {
    ...io,
    request: async (spec) => (spec.method === 'GET'
      ? { ok: true, status: 200, body: { id: 3, account: { login: DEFAULT_ORG } } }
      : { ok: true, status: 201, body: { token: fixture.token } })
  });
  assert.equal(code, 0);
  assert.equal(io.out(), `${fixture.token}\n`);
  assert.equal(io.err(), '');

  const failed = capture();
  const jwt = `${fixture.header}.${fixture.payload}.${fixture.signature}`;
  const failure = await main(['rivet'], rivetEnv(), {
    ...failed,
    request: async () => {
      throw new AppTokenError(`upstream ${fixture.token} bearer ${jwt}`);
    }
  });
  assert.equal(failure, 1);
  assert.equal(failed.out(), '');
  const printed = failed.err();
  assert.equal(printed.includes(fixture.header), false);
  assert.equal(printed.includes(fixture.payload), false);
  assert.equal(printed.includes(fixture.signature), false);
  assert.equal(printed.includes(fixture.appId), false);
  assert.equal(printed.includes(fixture.token.slice(4)), false);
  assert.match(printed, /\[redacted\]/);
});

test('tokens that are empty, short, or not installation tokens are rejected', async () => {
  const key = normalizePrivateKey(privateKey, 'RIVET_GITHUB_APP_PRIVATE_KEY');
  for (const token of ['', 'ghs_', `ghs_${'A'.repeat(35)}`, `ghp_${'A'.repeat(36)}`, `ghs_${'A'.repeat(36)}\n`]) {
    await assert.rejects(() => mintInstallationToken({
      appId: '12345',
      privateKey: key,
      installationId: '5',
      org: DEFAULT_ORG,
      request: async () => ({ ok: true, status: 201, body: { token } })
    }), /usable token/);
  }
});

test('lookup and exchange failures omit response bodies and secrets', async () => {
  const key = normalizePrivateKey(privateKey, 'RIVET_GITHUB_APP_PRIVATE_KEY');
  await assert.rejects(() => mintInstallationToken({
    appId: '12345',
    privateKey: key,
    org: DEFAULT_ORG,
    request: async () => ({
      ok: false,
      status: 404,
      body: { message: `missing ${statelessInstallationToken().token}`, token: 'ghs_leak', pem: privateKey }
    })
  }), (error) => {
    const fixture = statelessInstallationToken();
    assert.match(error.message, /HTTP 404/);
    assert.equal(error.message.includes('ghs_leak'), false);
    assert.equal(error.message.includes(fixture.header), false);
    assert.equal(error.message.includes(fixture.payload), false);
    assert.equal(error.message.includes(fixture.signature), false);
    assert.equal(error.message.includes(SENTINEL), false);
    assert.equal(error.message.includes('BEGIN'), false);
    return true;
  });
  await assert.rejects(() => mintInstallationToken({
    appId: '12345',
    privateKey: key,
    installationId: '5',
    org: DEFAULT_ORG,
    request: async () => ({ ok: true, status: 201, body: { token: 'ghs_bad\nsecond' } })
  }), /usable token/);
});

test('stdout contains only the token and a failed run prints nothing there', async () => {
  const io = capture();
  const env = rivetEnv();
  const code = await main(['Rivet'], env, {
    ...io,
    request: async (spec) => (spec.method === 'GET'
      ? { ok: true, status: 200, body: { id: 3, account: { login: DEFAULT_ORG } } }
      : { ok: true, status: 201, body: { token: CLASSIC_INSTALLATION_TOKEN, pem: privateKey } })
  });
  assert.equal(code, 0);
  assert.equal(io.out(), `${CLASSIC_INSTALLATION_TOKEN}\n`);
  assert.equal(io.err(), '');
  assert.equal(io.out().includes('BEGIN'), false);

  const failed = capture();
  const failure = await main(['rivet'], rivetEnv({ RIVET_GITHUB_APP_ID: '' }), failed);
  assert.equal(failure, 1);
  assert.equal(failed.out(), '');
  assert.match(failed.err(), /RIVET_GITHUB_APP_ID/);
  assert.equal(failed.err().includes(privateKey), false);
});

test('missing configuration and unknown bots fail before a request', async () => {
  const names = envNames('cody');
  assert.equal(names.key, 'CODY_GITHUB_APP_PRIVATE_KEY');
  let called = false;
  const refuse = async () => { called = true; throw new Error('network'); };
  const io = capture();
  assert.equal(await main(['rivet'], { CODY_GITHUB_APP_ID: '1', CODY_GITHUB_APP_PRIVATE_KEY: privateKey }, { ...io, request: refuse }), 1);
  assert.equal(called, false);
  assert.match(io.err(), /RIVET_GITHUB_APP_ID/);
  const leaked = capture();
  assert.equal(await main([privateKey], rivetEnv(), { ...leaked, request: refuse }), 1);
  assert.equal(leaked.err().includes('BEGIN'), false);
  assert.equal(await main(['nope'], rivetEnv(), capture()), 1);
  assert.throws(() => loadBotConfig('rivet', rivetEnv({ GITHUB_APP_ORG: '../evil' })), /organization/);
  assert.throws(() => loadBotConfig('keel', { KEEL_GITHUB_APP_ID: '1', KEEL_GITHUB_APP_PRIVATE_KEY: privateKey }), /Unknown bot "keel"/);
});

test('help names the environment variables and the example command', async () => {
  const io = capture();
  assert.equal(await main(['--help'], {}, io), 0);
  assert.match(io.out(), /<BOT>_GITHUB_APP_PRIVATE_KEY/);
  assert.match(io.out(), /GH_TOKEN=\$\(scripts\/app-token rivet\)/);
  assert.equal(io.out().toLowerCase().includes('keel'), false);
  assert.equal(io.err(), '');
  const empty = capture();
  assert.equal(await main([], rivetEnv(), empty), 1);
  assert.equal(empty.out(), '');
});

test('the command process prints only the token and writes no files', (t) => {
  const directory = tempDirectory(t, 'app-token-run-');
  const result = spawnSync('bash', [path.join(root, 'scripts/app-token'), 'rivet'], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      NODE_OPTIONS: `--import ${path.join(root, 'tests/github/app-token-mock-transport.mjs')}`,
      RIVET_GITHUB_APP_ID: '4242',
      RIVET_GITHUB_APP_PRIVATE_KEY: privateKey
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${CLASSIC_INSTALLATION_TOKEN}\n`);
  assert.equal(result.stderr, '');
  assert.equal(`${result.stdout}${result.stderr}`.includes('BEGIN RSA PRIVATE KEY'), false);
  assert.equal(readdirSync(directory).length, 0);
});

test('a failed command leaks neither the key file nor the error body', (t) => {
  const directory = tempDirectory(t, 'app-token-fail-');
  const keyPath = path.join(directory, 'secret.pem');
  writeFileSync(keyPath, privateKey);
  const refused = spawnSync('bash', [path.join(root, 'scripts/app-token'), 'vera'], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      VERA_GITHUB_APP_ID: '8',
      VERA_GITHUB_APP_PRIVATE_KEY: keyPath
    }
  });
  assert.equal(refused.status, 1);
  assert.equal(refused.stdout, '');
  assert.match(refused.stderr, /file path/);
  assert.equal(refused.stderr.includes('BEGIN RSA PRIVATE KEY'), false);
  assert.deepEqual(readdirSync(directory), ['secret.pem']);

  const exchanged = spawnSync('bash', [path.join(root, 'scripts/app-token'), 'vera'], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      NODE_OPTIONS: `--import ${path.join(root, 'tests/github/app-token-mock-transport.mjs')}`,
      APP_TOKEN_MOCK: 'unauthorized',
      VERA_GITHUB_APP_ID: '8',
      VERA_GITHUB_APP_PRIVATE_KEY: privateKey,
      VERA_GITHUB_APP_INSTALLATION_ID: '15'
    }
  });
  assert.equal(exchanged.status, 1);
  assert.equal(exchanged.stdout, '');
  assert.match(exchanged.stderr, /HTTP 401/);
  const leaked = statelessInstallationToken();
  assert.equal(exchanged.stderr.includes('ghs_should_not_leak'), false);
  assert.equal(exchanged.stderr.includes(leaked.header), false);
  assert.equal(exchanged.stderr.includes(leaked.payload), false);
  assert.equal(exchanged.stderr.includes(leaked.signature), false);
  assert.equal(exchanged.stderr.includes(leaked.appId), false);
  assert.equal(exchanged.stderr.includes('BEGIN PRIVATE KEY'), false);
});

test('the command process prints a stateless installation token and nothing else', (t) => {
  const directory = tempDirectory(t, 'app-token-stateless-');
  const fixture = statelessInstallationToken();
  const result = spawnSync('bash', [path.join(root, 'scripts/app-token'), 'rivet'], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      NODE_OPTIONS: `--import ${path.join(root, 'tests/github/app-token-mock-transport.mjs')}`,
      APP_TOKEN_MOCK: 'stateless',
      RIVET_GITHUB_APP_ID: '4242',
      RIVET_GITHUB_APP_PRIVATE_KEY: privateKey
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${fixture.token}\n`);
  assert.equal(result.stderr, '');
  assert.equal(readdirSync(directory).length, 0);
});

test('token helper source does not read or write files', () => {
  const source = readFileSync(path.join(root, 'tools/github/app-token.mjs'), 'utf8');
  const wrapper = readFileSync(path.join(root, 'scripts/app-token'), 'utf8');
  assert.equal(source.includes('node:fs'), false);
  assert.equal(source.includes('writeFile'), false);
  assert.equal(source.includes('readFile'), false);
  assert.match(wrapper, /app-token\.mjs/);
  assert.equal(wrapper.includes('writeFile'), false);
});

test('a new valid manifest alone enables token configuration, without agent-directory enrollment', t => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'token-enrollment-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  mkdirSync(path.join(temporary, 'config/github/apps'), { recursive: true });
  const file = path.join(temporary, 'config/github/apps/design-review.manifest.json');
  const manifest = { ...JSON.parse(readFileSync(path.join(root, 'config/github/apps/art.manifest.json'), 'utf8')), name: 'Design review' };
  writeFileSync(file, JSON.stringify(manifest));
  assert.deepEqual(discoverBots(temporary), ['design-review']);
  assert.equal(normalizeBot('Design-Review', temporary), 'design-review');
  const names = envNames('design-review');
  assert.equal(names.id, 'DESIGN_REVIEW_GITHUB_APP_ID');
  const config = loadBotConfig('design-review', { [names.id]: '12345', [names.key]: privateKey }, temporary);
  assert.equal(config.bot, 'design-review');
  assert.equal(config.appId, '12345');
  assert.throws(() => loadBotConfig('design-review', { [names.id]: '12345', [names.key]: '/tmp/key.pem' }, temporary), /file path is rejected/i);
  manifest.public = true;
  writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => normalizeBot('design-review', temporary), /Could not validate/);
  assert.throws(() => normalizeBot('../design-review', temporary));
});

test('token helper excludes settings references and finds manifests outside the current directory', () => {
  assert.ok(!BOTS.some(bot => bot.startsWith('repository-settings-')));
  const result = spawnSync(process.execPath, [path.join(root, 'tools/github/app-token.mjs'), 'art'], { cwd: tmpdir(), env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Set ART_GITHUB_APP_ID/);
});
