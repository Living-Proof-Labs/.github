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

// Least privilege for each bot. Only Rivet may request Administration or Pages.
export const BOT_MANIFESTS = {
  rivet: {
    file: 'config/github/apps/rivet.manifest.json',
    name: 'Living Proof Labs Rivet',
    permissions: {
      administration: 'write',
      contents: 'write',
      metadata: 'read',
      pages: 'write'
    }
  },
  cody: {
    file: 'config/github/apps/cody.manifest.json',
    name: 'Living Proof Labs Cody',
    permissions: {
      actions: 'read',
      checks: 'read',
      contents: 'write',
      metadata: 'read',
      pull_requests: 'write',
      statuses: 'read'
    }
  },
  vera: {
    file: 'config/github/apps/vera.manifest.json',
    name: 'Living Proof Labs Vera',
    permissions: {
      actions: 'write',
      checks: 'read',
      contents: 'read',
      metadata: 'read',
      pull_requests: 'write',
      statuses: 'read'
    }
  },
  keel: {
    file: 'config/github/apps/keel.manifest.json',
    name: 'Living Proof Labs Keel',
    permissions: {
      contents: 'read',
      issues: 'write',
      metadata: 'read',
      pull_requests: 'read'
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
  if (!samePermissions(manifest.default_permissions, { administration, metadata: 'read' })) {
    throw new Error('Settings manifest must request only Administration and Metadata.');
  }
  if (Object.hasOwn(manifest.default_permissions, 'pages')) throw new Error('Settings manifest must not request Pages.');
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
  if (bot !== 'rivet') {
    if (Object.hasOwn(manifest.default_permissions, 'administration') || Object.hasOwn(manifest.default_permissions, 'pages')) {
      throw new Error('Administration and Pages belong only on the Rivet manifest.');
    }
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
