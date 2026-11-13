// SPDX-License-Identifier: Apache-2.0
import { readFileSync, lstatSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, createPrivateKey } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { loadManifestDirectory } from './manifest-directory.mjs';
import { signAppJwt, envNames } from './app-token.mjs';
import { receiveCode } from './receive-app-manifest-code.mjs';
import { convert, exchangeOnce, token } from './exchange-app-manifest-code.mjs';
import { githubRead } from './audit-app-access.mjs';

export const usage = `Usage: node tools/github/registration-handoff.mjs --directory PRIVATE_DIRECTORY [--receive | --exchange | --verify]
Inspect an existing owner-confirmed manifest session. Default is offline, no writes.
--receive waits for the state-bound callback; --exchange converts once using the
existing owner gh credential. Both require the original, unexpired session.
--verify uses the returned existing key for GET /app, then writes only a nonsecret
identity proposal for review. It never converts a code, installs, creates keys or
changes grants. The owner must store the key privately and select repositories.
Run from the reviewed checkout. Never print or upload the registration response.`;

function privateFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 1_000_000) throw new Error('Private regular file required.');
  return readFileSync(file, 'utf8');
}
export function validateRegistration(value, owner, manifest) {
  if (!Number.isSafeInteger(value?.id) || value.id < 1 || !/^[a-z0-9-]+$/.test(value.slug ?? '') || value.owner?.type !== 'Organization' || value.owner.login?.toLowerCase() !== owner.toLowerCase() || value.name !== manifest.name || !isDeepStrictEqual(value.permissions, manifest.default_permissions) || !isDeepStrictEqual(value.events, manifest.default_events)) throw new Error('Registration identity or grants do not match reviewed manifest.');
  return { app_id: value.id, app_slug: value.slug };
}
export function loadSession(directory, root = process.cwd()) {
  if (!path.isAbsolute(directory)) throw new Error('Absolute private directory required.');
  const stat = lstatSync(directory);
  const relative = path.relative(realpathSync(root), realpathSync(directory));
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) throw new Error('Private directory outside checkout required.');
  const confirmation = JSON.parse(privateFile(path.join(directory, 'owner-confirmation.json')));
  const { config, manifests } = loadManifestDirectory(root);
  const app = config.apps.find(item => item.agent === confirmation.agent);
  const manifest = manifests[confirmation.agent];
  if (!app || confirmation.owner !== config.owner || confirmation.source !== 'interactive-owner-registration-inventory-inspection' || !confirmation.confirmed_by || !Number.isFinite(Date.parse(confirmation.confirmed_at)) || confirmation.manifest_sha256 !== createHash('sha256').update(JSON.stringify(manifest)).digest('hex')) throw new Error('Owner session does not match current manifest.');
  return { config, app, manifest, confirmation };
}
export function inspectSession(directory, root = process.cwd()) {
  const { config, app, manifest, confirmation } = loadSession(directory, root);
  const registration = JSON.parse(privateFile(path.join(directory, 'registration')));
  const identity = validateRegistration(registration, config.owner, manifest);
  if (app.identity && !isDeepStrictEqual(app.identity, identity)) throw new Error('Stored identity conflicts with session.');
  if (typeof registration.pem !== 'string' || registration.pem.length > 16384 || createPrivateKey(registration.pem).asymmetricKeyType !== 'rsa') throw new Error('Invalid returned key.');
  return { config, app, manifest, registration, identity, manifest_sha256: confirmation.manifest_sha256 };
}

export async function continueSession(directory, action, { root = process.cwd(), now = Date.now(), bearer, read = githubRead, send = convert, receive = receiveCode } = {}) {
  const { config, app, confirmation } = loadSession(directory, root);
  const age = now - Date.parse(confirmation.confirmed_at);
  if (app.identity || age < 0 || age >= 3600000) throw new Error('Session expired or identity already recorded; inspect existing App, never recreate.');
  if (action === '--receive') return receive(path.join(directory, 'code'), path.join(directory, 'state'), 3600000 - age);
  if (action !== '--exchange') throw new Error('Invalid action.');
  const membership = await read(`/user/memberships/orgs/${config.owner}`, bearer);
  if (membership.state !== 'active' || membership.role !== 'admin' || membership.organization?.login?.toLowerCase() !== config.owner.toLowerCase() || membership.user?.login?.toLowerCase() !== confirmation.confirmed_by.toLowerCase()) throw new Error('Use the same approved owner identity as preparation.');
  const code = privateFile(path.join(directory, 'code')).trim();
  await exchangeOnce(code, path.join(directory, 'registration'), value => send(value, bearer));
}

export async function handoff(directory, { root = process.cwd(), verify = false, read = githubRead } = {}) {
  const session = inspectSession(directory, root);
  const { config, app, manifest, registration, identity, manifest_sha256 } = session;
  const proposal = { schema_version: 1, agent: app.agent, owner: config.owner, manifest: app.manifest, manifest_sha256,
    github_identity: identity, status: 'offline-response-checked', installation: 'owner-selection-required',
    installation_url: `https://github.com/apps/${identity.app_slug}/installations/new`,
    credentials: envNames(app.agent),
    next_steps: ['Store App ID and existing PEM in the approved bot secret store; never commit the registration response.',
      'Review and commit only this nonsecret identity to agents.json; do not replace an existing identity.',
      'Owner installs only on Living-Proof-Labs, selects the explicitly approved repositories, and records installation ID and exact scope in app-access.json.',
      'Rerun bootstrap and access audit. Selected-repository membership needs complete owner evidence; no passing claim from token-visible repositories.'] };
  if (verify) {
    const output = path.join(directory, 'identity-proposal.json');
    if (existsSync(output)) throw new Error('Proposal exists; inspect and reuse it.');
    const { jwt } = signAppJwt(identity.app_id, registration.pem);
    const live = validateRegistration(await read('/app', jwt), config.owner, manifest);
    if (!isDeepStrictEqual(identity, live)) throw new Error('Live identity does not match response.');
    proposal.status = 'app-signed-registration-verified';
    writeFileSync(output, `${JSON.stringify(proposal, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  return proposal;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log(usage);
    else {
      if (![2, 3].includes(args.length) || args[0] !== '--directory' || (args.length === 3 && !['--receive', '--exchange', '--verify'].includes(args[2]))) throw new Error('Invalid arguments.');
      if (['--receive', '--exchange'].includes(args[2])) {
        if (args[2] === '--exchange' && (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI)) throw new Error('Interactive owner session required.');
        await continueSession(args[1], args[2], { bearer: args[2] === '--exchange' ? token() : undefined });
        console.log('Local session step saved. Preserve private files; run --verify after conversion.');
      } else console.log(JSON.stringify(await handoff(args[1], { verify: args[2] === '--verify' }), null, 2));
    }
  } catch { console.error('Registration handoff incomplete. Preserve private session files; resolve identity, scope, owner access or uncertain conversion. No secrets logged.'); process.exitCode = 1; }
}
