// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';

export function validateInventory(inventory) {
  if (inventory.schema_version !== 1) throw new Error('Unsupported inventory schema version.');
  if (typeof inventory.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(inventory.owner)) {
    throw new Error('Inventory owner must be a GitHub account name.');
  }
  if (!Array.isArray(inventory.repositories) || !inventory.repositories.length) {
    throw new Error('Inventory must declare at least one repository.');
  }
  const names = new Set(inventory.repositories);
  if (names.size !== inventory.repositories.length || !inventory.repositories.every((name) => name === '.github' || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))) {
    throw new Error('Inventory must contain unique, valid GitHub repository names.');
  }
  return inventory;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    validateInventory(JSON.parse(readFileSync('config/github/repositories.json', 'utf8')));
    console.log('Repository inventory is valid.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
