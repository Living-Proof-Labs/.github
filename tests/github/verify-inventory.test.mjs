// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInventory } from '../../tools/github/verify-inventory.mjs';
import { validateManifest } from '../../tools/github/verify-app-manifests.mjs';

test('accepts the group directory inventory shape', () => {
  assert.equal(validateInventory({ schema_version: 1, owner: 'example-org', repositories: ['.github', 'project'] }).owner, 'example-org');
});

test('requires least-privilege private GitHub App manifests', () => {
  const manifest = {
    name: 'audit', public: false, redirect_url: 'http://127.0.0.1:8787/github-app-manifest/callback',
    default_permissions: { administration: 'read', metadata: 'read' }, default_events: []
  };
  assert.equal(validateManifest(manifest, 'read').name, 'audit');
  assert.throws(() => validateManifest({ ...manifest, public: true }, 'read'), /private/);
  assert.throws(() => validateManifest({ ...manifest, default_events: ['push'] }, 'read'), /webhooks/);
});

test('rejects duplicate and unsafe repository names', () => {
  assert.throws(() => validateInventory({ schema_version: 1, owner: 'example-org', repositories: ['project', 'project'] }), /unique/);
  assert.throws(() => validateInventory({ schema_version: 1, owner: 'example-org', repositories: ['../project'] }), /valid/);
  assert.throws(() => validateInventory({ schema_version: 1, owner: '../example', repositories: ['project'] }), /owner/);
  assert.throws(() => validateInventory({ schema_version: 1, owner: 'example-org', repositories: [3] }), /valid/);
});
