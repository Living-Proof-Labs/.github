#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Mint a GitHub App installation token for one Living Proof Labs bot.
 * The private key and the token stay in memory. Standard output is the token.
 */
import { createPrivateKey, createSign } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const API_VERSION = '2026-03-10';
const USER_AGENT = 'living-proof-labs-app-token';
const TOKEN_PATTERN = /^[A-Za-z0-9_]+$/;
const MAX_KEY_LENGTH = 16 * 1024;
const MAX_RESPONSE_BYTES = 1_000_000;

export const DEFAULT_ORG = 'Living-Proof-Labs';
export const DEFAULT_API_BASE = 'https://api.github.com';
export const BOTS = ['rivet', 'cody', 'vera'];

export const usage = `Usage: scripts/app-token <bot>

Print a GitHub App installation token for one Living Proof Labs bot.
The token is the only text on standard output. Errors go to standard error.

bot: rivet, cody, or vera

Environment variables, with <BOT> as the bot name in uppercase:
  <BOT>_GITHUB_APP_ID                 numeric App id
  <BOT>_GITHUB_APP_PRIVATE_KEY        RSA PEM private key text, not a file path
  <BOT>_GITHUB_APP_INSTALLATION_ID    optional installation id
  GITHUB_APP_ORG                      organization login (default: ${DEFAULT_ORG})
  GITHUB_API_BASE                     API origin (default: ${DEFAULT_API_BASE})

Example:
  GH_TOKEN=$(scripts/app-token rivet) gh api orgs/${DEFAULT_ORG}/repos`;

export class AppTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppTokenError';
  }
}

export function envNames(bot) {
  const prefix = bot.toUpperCase();
  return {
    id: `${prefix}_GITHUB_APP_ID`,
    key: `${prefix}_GITHUB_APP_PRIVATE_KEY`,
    installation: `${prefix}_GITHUB_APP_INSTALLATION_ID`
  };
}

export function normalizeBot(value) {
  if (typeof value !== 'string') throw new AppTokenError('Expected bot rivet, cody, or vera.');
  const bot = value.trim().toLowerCase();
  if (BOTS.includes(bot)) return bot;
  if (/^[a-z0-9-]{1,32}$/.test(bot)) {
    throw new AppTokenError(`Unknown bot "${bot}". Expected rivet, cody, or vera.`);
  }
  throw new AppTokenError('Expected bot rivet, cody, or vera. Example: scripts/app-token rivet');
}

function requireDigits(value, label, noun) {
  if (typeof value !== 'string' || !/^[0-9]{1,20}$/.test(value.trim())) {
    throw new AppTokenError(`${label} must be a numeric ${noun}.`);
  }
  return value.trim();
}

export function normalizePrivateKey(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppTokenError(`Set ${label} to the RSA PEM private key text. A file path is rejected.`);
  }
  if (value.length > MAX_KEY_LENGTH) throw new AppTokenError(`${label} is too large.`);
  let pem = value.trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1);
  }
  if (!pem.includes('\n') && pem.includes('\\n')) pem = pem.replaceAll('\\n', '\n');
  pem = pem.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (!pem.endsWith('\n')) pem += '\n';
  if (!pem.includes('BEGIN ') || !pem.includes('PRIVATE KEY')) {
    throw new AppTokenError(`Set ${label} to the RSA PEM private key text. A file path is rejected.`);
  }
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') throw new AppTokenError(`${label} must be an RSA private key.`);
    return key;
  } catch (error) {
    if (error instanceof AppTokenError) throw error;
    throw new AppTokenError(`Could not read ${label} as an RSA PEM private key. Paste the PEM text; a file path is rejected.`);
  }
}

function requireOrg(value) {
  const org = value === undefined || value === '' ? DEFAULT_ORG : String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(org)) {
    throw new AppTokenError('GITHUB_APP_ORG must be a GitHub organization login.');
  }
  return org;
}

export function resolveApiUrl(base, resourcePath) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new AppTokenError('GITHUB_API_BASE must be an https URL.');
  }
  if (url.username || url.password) throw new AppTokenError('GITHUB_API_BASE must not include credentials.');
  if (url.search || url.hash) throw new AppTokenError('GITHUB_API_BASE must not include a query or fragment.');
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new AppTokenError('GITHUB_API_BASE must be an https URL.');
  }
  if (!resourcePath.startsWith('/') || resourcePath.includes('..')) {
    throw new AppTokenError('GitHub API path is invalid.');
  }
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}${resourcePath}`;
  return url;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signAppJwt(appId, privateKey, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  // GitHub rejects a JWT whose exp is more than 10 minutes ahead. iat sits
  // 60 seconds in the past so a small clock skew still validates.
  const claims = { iat: now - 60, exp: now + 9 * 60, iss: String(appId) };
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  let signature;
  try {
    signature = signer.sign(privateKey);
  } catch {
    throw new AppTokenError('Could not sign the App JWT. Check the private key.');
  }
  return { jwt: `${unsigned}.${signature.toString('base64url')}`, claims };
}

export function loadBotConfig(botName, env) {
  const bot = normalizeBot(botName);
  const names = envNames(bot);
  if (env[names.id] === undefined || env[names.id] === '') {
    throw new AppTokenError(`Set ${names.id} to the numeric GitHub App id.`);
  }
  const appId = requireDigits(env[names.id], names.id, 'GitHub App id');
  if (env[names.key] === undefined || String(env[names.key]).trim() === '') {
    throw new AppTokenError(`Set ${names.key} to the RSA PEM private key text. A file path is rejected.`);
  }
  const privateKey = normalizePrivateKey(env[names.key], names.key);
  const installationId = env[names.installation] === undefined || env[names.installation] === ''
    ? undefined
    : requireDigits(env[names.installation], names.installation, 'installation id');
  const org = requireOrg(env.GITHUB_APP_ORG);
  const apiBase = env.GITHUB_API_BASE === undefined || env.GITHUB_API_BASE === '' ? DEFAULT_API_BASE : env.GITHUB_API_BASE;
  resolveApiUrl(apiBase, '/app');
  return { bot, appId, privateKey, installationId, org, apiBase, names };
}

export function githubRequest({ method, path: resourcePath, jwt, apiBase = DEFAULT_API_BASE }) {
  const url = resolveApiUrl(apiBase, resourcePath);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${jwt}`,
        'user-agent': USER_AGENT,
        'x-github-api-version': API_VERSION
      }
    }, (response) => {
      const chunks = [];
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_RESPONSE_BYTES) {
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (received > MAX_RESPONSE_BYTES) {
          fail(new AppTokenError('GitHub API response was too large.'));
          return;
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            body = null;
          }
        }
        const status = response.statusCode ?? 0;
        succeed({ ok: status >= 200 && status < 300, status, body });
      });
    });
    request.setTimeout(15_000, () => request.destroy());
    request.on('error', () => fail(new AppTokenError('GitHub API request failed.')));
    request.end();
  });
}

export async function mintInstallationToken({
  appId,
  privateKey,
  installationId,
  org,
  apiBase,
  nowMs,
  request
}) {
  const { jwt } = signAppJwt(appId, privateKey, nowMs);
  const call = request ?? ((spec) => githubRequest({ ...spec, apiBase }));
  let installation = installationId;
  if (!installation) {
    const found = await call({ method: 'GET', path: `/orgs/${encodeURIComponent(org)}/installation`, jwt });
    if (!found?.ok) {
      const status = found?.status ?? 0;
      throw new AppTokenError(`Could not find the ${org} installation (HTTP ${status}). Install the App on that organization, or set the installation id.`);
    }
    const login = found.body?.account?.login;
    if (typeof login === 'string' && login.toLowerCase() !== org.toLowerCase()) {
      throw new AppTokenError(`The installation is not for ${org}.`);
    }
    installation = String(found.body?.id ?? '');
    if (!/^[0-9]+$/.test(installation)) throw new AppTokenError('Installation response did not include an id.');
  }
  const exchanged = await call({
    method: 'POST',
    path: `/app/installations/${installation}/access_tokens`,
    jwt
  });
  if (!exchanged?.ok) {
    const status = exchanged?.status ?? 0;
    throw new AppTokenError(`Could not create an installation token (HTTP ${status}).`);
  }
  const token = exchanged.body?.token;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new AppTokenError('Installation token response did not include a usable token.');
  }
  return token;
}

export async function main(argv = process.argv.slice(2), env = process.env, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      stdout.write(`${usage}\n`);
      return 0;
    }
    if (argv.length !== 1) throw new AppTokenError(usage);
    const config = loadBotConfig(argv[0], env);
    const token = await mintInstallationToken({
      appId: config.appId,
      privateKey: config.privateKey,
      installationId: config.installationId,
      org: config.org,
      apiBase: config.apiBase,
      request: io.request
    });
    stdout.write(`${token}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof AppTokenError ? error.message : 'Could not mint an installation token.';
    stderr.write(`${message}\n`);
    return 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked && import.meta.url === invoked) {
  process.exit(await main());
}
