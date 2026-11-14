// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadManifestDirectory } from '../../tools/github/manifest-directory.mjs';
import { prepareBrowser, adoptReadback, browserUrl, manifestDigest } from '../../tools/github/browser-app-registration.mjs';
function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'browser-registration-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo'); mkdirSync(root);
  cpSync('config', path.join(root, 'config'), { recursive: true });
  const file = path.join(root, 'config/github/agents.json');
  const agents = JSON.parse(readFileSync(file));
  Object.assign(agents.agents.find(a => a.id === 'cody').github_identity, { app_id: null, app_slug: null });
  writeFileSync(file, JSON.stringify(agents));
  const manifest = loadManifestDirectory(root).manifests.cody;
  const evidence = { schema_version: 1, agent: 'cody', owner: 'Living-Proof-Labs', manifest_sha256: manifestDigest(manifest), source: 'owner-settings-readback', app_id: 5754786, app_slug: 'cody-agent-living-proof-labs', name: manifest.name, description: manifest.description, url: manifest.url, public: false, webhook_active: false, request_oauth_on_install: false, device_flow_enabled: false, callback_urls: [], permissions: manifest.default_permissions, events: [] };
  return { base, root, manifest, evidence, directory: path.join(base, 'session') };
}
const approved = f => ({ agent: 'cody', root: f.root, directory: f.directory, interactive: true, confirm: async () => `ABSENT Living-Proof-Labs/cody ${manifestDigest(f.manifest)}` });
test('prefills exactly the audited permissions without OAuth callbacks, codes or credentials', t => {
  const f = fixture(t), url = new URL(browserUrl(f.manifest, 'Living-Proof-Labs'));
  assert.equal(url.origin, 'https://github.com'); assert.equal(url.pathname, '/organizations/Living-Proof-Labs/settings/apps/new');
  for (const [key, value] of Object.entries(f.manifest.default_permissions)) assert.equal(url.searchParams.get(key), value);
  for (const key of ['public', 'webhook_active', 'request_oauth_on_install']) assert.equal(url.searchParams.get(key), 'false');
  for (const key of ['callback_urls[]', 'redirect_url', 'state', 'code', 'manifest', 'device_flow_enabled']) assert.equal(url.searchParams.has(key), false);
  assert.equal(url.searchParams.size, Object.keys(f.manifest.default_permissions).length + 6);
});
test('exclusive owner-confirmed session refuses repeated preparation', async t => {
  const f = fixture(t); const result = await prepareBrowser(approved(f));
  assert.equal(result.status, 'browser-consent-required');
  assert.equal(JSON.parse(readFileSync(path.join(f.directory, 'browser-registration.json'))).registration_url, result.registration_url);
  await assert.rejects(prepareBrowser(approved(f)));
});
for (const [name, patch] of Object.entries({ 'noninteractive': { interactive: false }, 'inaccessible inventory': { confirm: async () => 'inaccessible' }, 'ambiguous inventory': { confirm: async () => 'maybe absent' }, 'HTTP absence inference': { confirm: async () => '404' }, 'wrong digest': { confirm: async () => 'ABSENT Living-Proof-Labs/cody wrong' }, 'reference manifest': { agent: 'repo-settings' } })) test(`preparation rejects ${name}`, async t => {
  const f = fixture(t); await assert.rejects(prepareBrowser({ ...approved(f), ...patch })); assert.equal(existsSync(f.directory), false);
});
test('recorded identity forbids creation even if inaccessible', async t => { const f = fixture(t); await assert.rejects(prepareBrowser({ ...approved(f), agent: 'rivet' })); });
test('new manifest enrolls without a second registry', async t => {
  const f = fixture(t), manifest = { ...f.manifest, name: 'Future Agent' };
  writeFileSync(path.join(f.root, 'config/github/apps/future.manifest.json'), JSON.stringify(manifest));
  const result = await prepareBrowser({ ...approved(f), agent: 'future', confirm: async () => `ABSENT Living-Proof-Labs/future ${manifestDigest(manifest)}` });
  assert.equal(new URL(result.registration_url).searchParams.get('name'), 'Future Agent');
});
test('nonsecret adoption is repeatable and does not claim authenticated or installed', t => {
  const f = fixture(t); const proposal = adoptReadback('cody', f.evidence, f.root);
  assert.equal(proposal.status, 'owner-readback-adoption-proposal'); assert.equal(proposal.authentication, 'unverified'); assert.equal(proposal.installation, 'unverified');
  const file = path.join(f.root, 'config/github/agents.json'), agents = JSON.parse(readFileSync(file));
  Object.assign(agents.agents.find(a => a.id === 'cody').github_identity, proposal.github_identity); writeFileSync(file, JSON.stringify(agents));
  assert.equal(adoptReadback('cody', f.evidence, f.root).status, 'already-recorded-owner-readback');
  assert.throws(() => adoptReadback('cody', { ...f.evidence, app_id: 43 }, f.root));
});
for (const [name, patch] of Object.entries({
  'wrong owner': { owner: 'elsewhere' }, 'wrong digest': { manifest_sha256: '0'.repeat(64) },
  'wrong name': { name: 'Other' }, 'wrong description': { description: 'Other' }, 'public App': { public: true }, 'active webhook': { webhook_active: true },
  'OAuth enabled': { request_oauth_on_install: true }, 'device flow enabled': { device_flow_enabled: true },
  'OAuth callback': { callback_urls: ['https://example.com'] }, 'extra events': { events: ['push'] },
  'extra permission': { permissions: { metadata: 'read', administration: 'write' } }, 'invalid id': { app_id: '5754786' },
  'invalid slug': { app_slug: 'unsafe/slug' }, 'secret field': { pem: 'SECRET_FIXTURE' }, 'wrong source': { source: 'API-404' }
})) test(`adoption rejects ${name}`, t => { const f = fixture(t); assert.throws(() => adoptReadback('cody', { ...f.evidence, ...patch }, f.root)); });
test('CLI rejects secret-bearing input without echoing values', t => {
  const f = fixture(t), file = path.join(f.base, 'readback.json');
  writeFileSync(file, JSON.stringify({ ...f.evidence, pem: 'SECRET_FIXTURE' }));
  const child = spawnSync(process.execPath, ['tools/github/browser-app-registration.mjs', '--adopt', 'cody', '--readback', file], { encoding: 'utf8' });
  assert.equal(child.status, 1); assert.doesNotMatch(child.stdout + child.stderr, /SECRET_FIXTURE/);
});
test('recorded Cody pilot is adopted without registering another App', () => {
  const { config } = loadManifestDirectory();
  assert.deepEqual(config.apps.find(a => a.agent === 'cody').identity, { app_id: 5754786, app_slug: 'cody-agent-living-proof-labs' });
});
test('registration session must remain outside checkout', async t => { const f = fixture(t); await assert.rejects(prepareBrowser({ ...approved(f), directory: path.join(f.root, 'session') })); });
test('adoption cannot assign another enrolled App identity', t => { const f = fixture(t); const rivet = loadManifestDirectory(f.root).config.apps.find(a => a.agent === 'rivet').identity; assert.throws(() => adoptReadback('cody', { ...f.evidence, app_id: rivet.app_id, app_slug: rivet.app_slug }, f.root)); });
test('permission parameters cannot overwrite form settings', t => { const f = fixture(t); assert.throws(() => browserUrl({ ...f.manifest, default_permissions: { ...f.manifest.default_permissions, name: 'write' } }, 'Living-Proof-Labs')); });
