// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInventory } from '../../tools/github/verify-inventory.mjs';

test('accepts the group directory inventory shape', () => {
  assert.equal(validateInventory({ schema_version: 1, owner: 'example-org', repositories: ['.github', 'project'] }).owner, 'example-org');
});

test('rejects duplicate and unsafe repository names', () => {
  assert.throws(() => validateInventory({ schema_version: 1, owner: 'example-org', repositories: ['project', 'project'] }), /unique/);
  assert.throws(() => validateInventory({ schema_version: 1, owner: 'example-org', repositories: ['../project'] }), /valid/);
});
