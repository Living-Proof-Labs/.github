// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOCAL_REDIRECT = 'http://127.0.0.1:8787/github-app-manifest/callback';
export const HOMEPAGE = 'https://github.com/Living-Proof-Labs/.github';

const MANIFEST_KEYS = ['name', 'description', 'url', 'redirect_url', 'public', 'default_permissions', 'default_events'];

export const SETTINGS_MANIFESTS = [
  ['config/github/apps/repository-settings-audit.manifest.json', 'read'],
  ['config/github/apps/repository-settings-apply.manifest.json', 'write']
];

// Rivet permissions come from the reviewed access definition, not a second grant list.
export const BOT_MANIFESTS = {
  art: {
    file: 'config/github/apps/art.manifest.json',
    name: 'Living Proof Labs Art',
    permissions: { contents: 'read', issues: 'write', metadata: 'read', pull_requests: 'write' }
  },
  rivet: {
    file: 'config/github/apps/rivet.manifest.json',
    name: 'Rivet Agent - Living Proof Labs',
    permissions: JSON.parse(readFileSync(new URL('../../config/github/app-access.json', import.meta.url), 'utf8')).apps.find(app => app.agent === 'rivet').permissions
  },
  cody: {
    file: 'config/github/apps/cody.manifest.json',
    name: 'Living Proof Labs Cody',
    permissions: {
      actions: 'read',
      checks: 'read',
      contents: 'write',
      issues: 'write',
      metadata: 'read',
      pull_requests: 'write',
      workflows: 'write'
    }
  },
  vera: {
    file: 'config/github/apps/vera.manifest.json',
    name: 'Living Proof Labs Vera',
    permissions: {
      actions: 'read',
      checks: 'read',
      contents: 'read',
      issues: 'write',
      metadata: 'read',
      pull_requests: 'write'
    }
  }
};

function samePermissions(actual, expected) {
  const actualKeys = Object.keys(actual ?? {}).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.join(',') === expectedKeys.join(',') && actualKeys.every((key) => actual[key] === expected[key]);
}

function assertCommonShape(manifest) {
  const unexpected = Object.keys(manifest).filter((key) => !MANIFEST_KEYS.includes(key));
  if (unexpected.length) throw new Error(`Manifest includes unsupported field ${unexpected[0]}.`);
  if (typeof manifest.description !== 'string' || !manifest.description.trim()) throw new Error('Manifest needs a description.');
  if (manifest.url !== HOMEPAGE) throw new Error('Manifest must use the organization repository homepage.');
  if (manifest.hook_attributes != null) throw new Error('Manifest must not configure a webhook.');
}

export function validateManifest(manifest, administration) {
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('Manifest needs a name.');
  if (manifest.public !== false) throw new Error('Manifest must create a private App.');
  if (manifest.default_permissions?.administration !== administration) throw new Error(`Manifest must request Administration ${administration}.`);
  if (manifest.default_permissions?.metadata !== 'read') throw new Error('Manifest must request Metadata read.');
  if (!Array.isArray(manifest.default_events) || manifest.default_events.length) throw new Error('Manifest must not subscribe to webhooks.');
  if (manifest.redirect_url !== LOCAL_REDIRECT) throw new Error('Manifest must use the documented local callback.');
  if (manifest.hook_attributes != null) throw new Error('Manifest must not configure a webhook.');
  return manifest;
}

export function validateSettingsManifest(manifest, administration) {
  validateManifest(manifest, administration);
  assertCommonShape(manifest);
  if (!samePermissions(manifest.default_permissions, { administration, metadata: 'read', pages: administration })) {
    throw new Error('Settings manifest must request only Administration, Pages at the same level, and Metadata read.');
  }
  return manifest;
}

export function validateBotManifest(bot, manifest) {
  const spec = BOT_MANIFESTS[bot];
  if (!spec) throw new Error(`Unknown bot manifest ${bot}.`);
  if (manifest.name !== spec.name) throw new Error(`Manifest name must be ${spec.name}.`);
  if (manifest.public !== false) throw new Error('Manifest must create a private App.');
  if (manifest.redirect_url !== LOCAL_REDIRECT) throw new Error('Manifest must use the documented local callback.');
  if (!Array.isArray(manifest.default_events) || manifest.default_events.length) throw new Error('Manifest must not subscribe to webhooks.');
  if (manifest.default_permissions?.metadata !== 'read') throw new Error('Manifest must request Metadata read.');
  assertCommonShape(manifest);
  if (!samePermissions(manifest.default_permissions, spec.permissions)) {
    throw new Error(`Manifest for ${bot} must request only its least-privilege permissions.`);
  }
  if (Object.hasOwn(manifest.default_permissions, 'administration')) throw new Error('Engineering Apps must not request Administration.');
  if (bot !== 'rivet' && Object.hasOwn(manifest.default_permissions, 'pages')) {
    throw new Error('Pages belongs only on the Rivet manifest.');
  }
  return manifest;
}

export function validateAllFromDisk(root, readFile = readFileSync) {
  for (const [file, administration] of SETTINGS_MANIFESTS) {
    validateSettingsManifest(JSON.parse(readFile(path.join(root, file), 'utf8')), administration);
  }
  for (const bot of Object.keys(BOT_MANIFESTS)) {
    validateBotManifest(bot, JSON.parse(readFile(path.join(root, BOT_MANIFESTS[bot].file), 'utf8')));
  }
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked && import.meta.url === invoked) {
  try {
    validateAllFromDisk(process.cwd());
    console.log('GitHub App manifests are valid.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
