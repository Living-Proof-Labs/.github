// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BOT_MANIFESTS, validateBotManifest, validateSettingsManifest, LOCAL_REDIRECT, HOMEPAGE } from './verify-app-manifests.mjs';

export function validateRegistrationManifest(agent, manifest) {
  if (BOT_MANIFESTS[agent]) return validateBotManifest(agent, manifest);
  if (agent === 'repository-settings-audit') return validateSettingsManifest(manifest, 'read');
  if (agent === 'repository-settings-apply') return validateSettingsManifest(manifest, 'write');
  // A new manifest is enrolled without adding code or a registry entry. Its
  // permissions are an explicit reviewed proposal, not a live grant.
  const allowed = ['name', 'description', 'url', 'redirect_url', 'public', 'default_permissions', 'default_events'];
  if (!manifest || Object.keys(manifest).some(key => !allowed.includes(key)) || typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 34 || typeof manifest.description !== 'string' || !manifest.description.trim() || manifest.public !== false || manifest.url !== HOMEPAGE || manifest.redirect_url !== LOCAL_REDIRECT || !Array.isArray(manifest.default_events) || manifest.default_events.length || !manifest.default_permissions || Array.isArray(manifest.default_permissions) || manifest.default_permissions.metadata !== 'read' || Object.entries(manifest.default_permissions).some(([key, level]) => !/^[a-z_]+$/.test(key) || !['read', 'write'].includes(level))) throw new Error('Invalid registration manifest.');
  return manifest;
}

export function loadManifestDirectory(root = process.cwd()) {
  const json = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  const directory = json('config/github/agents.json');
  const access = json('config/github/app-access.json');
  if (directory.owner !== 'Living-Proof-Labs' || access.owner !== directory.owner) throw new Error('Identity owners disagree.');
  const manifests = {}, apps = [];
  for (const file of readdirSync(path.join(root, 'config/github/apps')).sort()) {
    if (!file.endsWith('.manifest.json')) continue;
    const agent = file.slice(0, -'.manifest.json'.length);
    if (!/^[a-z0-9-]+$/.test(agent)) throw new Error('Invalid manifest filename.');
    const manifestPath = `config/github/apps/${file}`;
    const manifest = validateRegistrationManifest(agent, json(manifestPath));
    manifests[agent] = manifest;
    const identities = [];
    for (const entry of access.apps.filter(item => item.manifest === manifestPath)) identities.push({ app_id: entry.app_id, app_slug: entry.app_slug });
    for (const entry of directory.agents.filter(item => item.manifest === manifestPath)) {
      const value = entry.github_identity;
      if (value.app_id !== null || value.app_slug !== null) identities.push({ app_id: Number(value.app_id), app_slug: value.app_slug });
    }
    if (identities.some(identity => !Number.isSafeInteger(identity.app_id) || identity.app_id < 1 || typeof identity.app_slug !== 'string' || !/^[a-z0-9-]+$/.test(identity.app_slug)) || identities.some(identity => identity.app_id !== identities[0].app_id || identity.app_slug !== identities[0].app_slug)) throw new Error('Stored registration identities are partial or disagree.');
    // A name-derived slug is only a lookup hint, never a recorded identity.
    const hint = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!hint) throw new Error('Manifest name needs a lookup hint.');
    apps.push({ agent, manifest: manifestPath, candidate_slugs: [hint], identity: identities[0] ?? null });
  }
  if (!apps.length) throw new Error('No registration manifests found.');
  return { config: { schema_version: 1, owner: directory.owner, apps }, manifests };
}
