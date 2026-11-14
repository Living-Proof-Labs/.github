// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadManifestDirectory } from './manifest-directory.mjs';

export const usage = `Usage: node tools/github/browser-app-registration.mjs [--prepare AGENT --directory NEW_DIRECTORY | --adopt AGENT --readback FILE | --help]
Default: list every registration manifest and recorded identity, offline.
--prepare requires interactive owner inspection of the complete organization App
inventory. It saves a nonsecret prefilled browser URL in a new session directory.
It never submits the form. Inspect every field before submitting in GitHub.
--adopt validates nonsecret owner settings readback and prints an identity proposal
for a reviewed commit. This is not App-authenticated verification.
No token, callback code, key generation, conversion, installation or grants.
Example: node tools/github/browser-app-registration.mjs --prepare vera --directory /private/vera-browser-session
After an uncertain submission inspect existing Apps; never rerun to create another.`;
export const manifestDigest = manifest => createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
function select(agent, root) {
  const loaded = loadManifestDirectory(root);
  const app = loaded.config.apps.find(item => item.agent === agent);
  if (!app) throw Error('Unknown manifest.');
  return { ...loaded, app, manifest: loaded.manifests[agent] };
}
export function browserUrl(manifest, owner) {
  if (owner !== 'Living-Proof-Labs' || manifest.public !== false || manifest.default_events.length) throw Error('Unsupported browser registration policy.');
  const url = new URL(`https://github.com/organizations/${owner}/settings/apps/new`);
  for (const field of ['name', 'description', 'url']) url.searchParams.set(field, manifest[field]);
  for (const [key, value] of Object.entries(manifest.default_permissions)) {
    if (['name', 'description', 'url', 'public', 'webhook_active', 'request_oauth_on_install', 'single_file'].includes(key)) throw Error('Permission requires unsupported form mapping.');
    url.searchParams.set(key, value);
  }
  url.searchParams.set('public', 'false');
  url.searchParams.set('webhook_active', 'false');
  url.searchParams.set('request_oauth_on_install', 'false');
  // redirect_url is for manifest conversion, not an OAuth callback. Do not map it.
  // Device flow has no documented URL parameter: verify it is off in the UI.
  return url.href;
}
export async function prepareBrowser({ agent, directory, root = process.cwd(), interactive, confirm }) {
  const { app, manifest, config } = select(agent, root);
  if (!interactive || app.identity || !path.isAbsolute(directory)) throw Error('Interactive owner and an unbound manifest required.');
  const relative = path.relative(realpathSync(root), path.join(realpathSync(path.dirname(directory)), path.basename(directory)));
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..') throw Error('Session must be outside checkout.');
  const digest = manifestDigest(manifest);
  const phrase = `ABSENT ${config.owner}/${agent} ${digest}`;
  const answer = await confirm(`Using your authorized organization-owner browser session, inspect https://github.com/organizations/${config.owner}/settings/apps including renamed and uninstalled Apps. Coordinate with other owners. Stop if access is incomplete, ambiguous, or an existing App serves this role. Only after complete inspection confirms absence of ${manifest.name}, type exactly:\n${phrase}\n`);
  if (answer !== phrase) throw Error('Absence not confirmed.');
  const result = { schema_version: 1, agent, owner: config.owner, manifest_sha256: digest,
    source: 'interactive-owner-inventory-confirmation', status: 'browser-consent-required',
    registration_url: browserUrl(manifest, config.owner),
    required_readback: { name: manifest.name, description: manifest.description, url: manifest.url, public: false, webhook_active: false,
      request_oauth_on_install: false, device_flow_enabled: false, callback_urls: [],
      permissions: manifest.default_permissions, events: manifest.default_events },
    next_steps: ['Review every prefilled field, all permissions, and disabled device flow in GitHub before submitting.',
      'After submission record numeric App ID, exact slug and all settings via --adopt; never assume a name-derived slug.',
      'Do not generate a key or install here. Owner key delivery and installation scope are separate authorized steps.',
      'If submission is uncertain, inspect the existing registration before any retry.'] };
  // Exclusive creation prevents accidental reuse of this local session. Browser
  // URLs are not one-time capabilities; owner coordination remains necessary.
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(path.join(directory, 'browser-registration.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return result;
}
export function adoptReadback(agent, evidence, root = process.cwd()) {
  const { config, app, manifest } = select(agent, root);
  const keys = ['schema_version', 'agent', 'owner', 'manifest_sha256', 'source', 'app_id', 'app_slug', 'name', 'description', 'url', 'public', 'webhook_active', 'request_oauth_on_install', 'device_flow_enabled', 'callback_urls', 'permissions', 'events'];
  if (!evidence || !isDeepStrictEqual(Object.keys(evidence).sort(), keys.sort()) || evidence.schema_version !== 1 || evidence.agent !== agent || evidence.owner !== config.owner || evidence.source !== 'owner-settings-readback' || evidence.manifest_sha256 !== manifestDigest(manifest) ||
      !Number.isSafeInteger(evidence.app_id) || evidence.app_id < 1 || typeof evidence.app_slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(evidence.app_slug) ||
      evidence.name !== manifest.name || evidence.description !== manifest.description || evidence.url !== manifest.url || evidence.public !== false || evidence.webhook_active !== false || evidence.request_oauth_on_install !== false || evidence.device_flow_enabled !== false ||
      !isDeepStrictEqual(evidence.callback_urls, []) || !isDeepStrictEqual(evidence.permissions, manifest.default_permissions) || !isDeepStrictEqual(evidence.events, manifest.default_events)) throw Error('Readback does not match manifest.');
  const identity = { app_id: evidence.app_id, app_slug: evidence.app_slug };
  if (app.identity && !isDeepStrictEqual(app.identity, identity)) throw Error('Identity conflict; preserve existing registration.');
  if (config.apps.some(other => other.agent !== agent && other.identity && (other.identity.app_id === identity.app_id || other.identity.app_slug === identity.app_slug))) throw Error('Identity already belongs to another manifest.');
  return { schema_version: 1, agent, owner: config.owner, manifest: app.manifest,
    manifest_sha256: evidence.manifest_sha256, github_identity: identity,
    status: app.identity ? 'already-recorded-owner-readback' : 'owner-readback-adoption-proposal',
    authentication: 'unverified', installation: 'unverified',
    next_step: 'Review and commit only App ID and slug to agents.json. Owner key delivery and installation scope remain separate. Rerun authenticated audit when available.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log(usage);
    else if (!args.length) console.log(JSON.stringify(loadManifestDirectory().config.apps.map(app => ({ agent: app.agent, manifest: app.manifest, identity: app.identity, status: app.identity ? 'identity-recorded-authentication-unverified' : 'owner-inventory-required' })), null, 2));
    else if (args.length === 4 && args[0] === '--prepare' && args[2] === '--directory') {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try { console.log(JSON.stringify(await prepareBrowser({ agent: args[1], directory: path.resolve(args[3]), interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI, confirm: question => terminal.question(question) }), null, 2)); }
      finally { terminal.close(); }
    } else if (args.length === 4 && args[0] === '--adopt' && args[2] === '--readback') {
      const input = readFileSync(args[3]);
      if (input.length > 16384) throw Error('Readback too large.');
      console.log(JSON.stringify(adoptReadback(args[1], JSON.parse(input)), null, 2));
    } else throw Error('Invalid arguments.');
  } catch { console.error('Browser registration incomplete. Inspect owner access, existing Apps and exact nonsecret readback. Never recreate on uncertainty. Run --help for usage.'); process.exitCode = 1; }
}
