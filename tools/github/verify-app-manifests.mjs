// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';

const manifests = [
  ['config/github/apps/repository-settings-audit.manifest.json', 'read'],
  ['config/github/apps/repository-settings-apply.manifest.json', 'write']
];

export function validateManifest(manifest, administration) {
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('Manifest needs a name.');
  if (manifest.public !== false) throw new Error('Manifest must create a private App.');
  if (manifest.default_permissions?.administration !== administration) throw new Error(`Manifest must request Administration ${administration}.`);
  if (manifest.default_permissions?.metadata !== 'read') throw new Error('Manifest must request Metadata read.');
  if (!Array.isArray(manifest.default_events) || manifest.default_events.length) throw new Error('Manifest must not subscribe to webhooks.');
  if (manifest.redirect_url !== 'http://127.0.0.1:8787/github-app-manifest/callback') throw new Error('Manifest must use the documented local callback.');
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    for (const [file, administration] of manifests) validateManifest(JSON.parse(readFileSync(file, 'utf8')), administration);
    console.log('GitHub App manifests are valid.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
