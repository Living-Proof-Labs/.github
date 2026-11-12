// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const IDENTITY_FIELDS = ['commit_name', 'commit_email', 'app_slug', 'app_id'];
const MANIFEST_PATH = /^config\/github\/apps\/[A-Za-z0-9._-]+\.manifest\.json$/;

export function validateAgents(directory, options = {}) {
  const root = options.root ?? process.cwd();
  const exists = options.exists ?? ((manifest) => existsSync(path.join(root, manifest)));
  if (directory?.schema_version !== 1) throw new Error('Unsupported agent directory schema version.');
  if (typeof directory.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(directory.owner)) {
    throw new Error('Agent directory owner must be a GitHub account name.');
  }
  if (typeof directory.identity_note !== 'string' || !directory.identity_note.trim()) {
    throw new Error('Agent directory needs a note explaining identity fields that are not in the manifests.');
  }
  if (!Array.isArray(directory.agents) || !directory.agents.length) {
    throw new Error('Agent directory must declare at least one agent.');
  }
  const ids = new Set();
  for (const agent of directory.agents) {
    if (!agent || typeof agent !== 'object') throw new Error('Each agent entry must be an object.');
    if (typeof agent.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(agent.id)) {
      throw new Error('Agent id must be a lowercase slug.');
    }
    if (ids.has(agent.id)) throw new Error(`Duplicate agent id ${agent.id}.`);
    ids.add(agent.id);
    if (typeof agent.role !== 'string' || !agent.role.trim()) {
      throw new Error(`Agent ${agent.id} needs a non-empty role.`);
    }
    if (typeof agent.manifest !== 'string' || !MANIFEST_PATH.test(agent.manifest)) {
      throw new Error(`Agent ${agent.id} manifest path must stay inside config/github/apps/.`);
    }
    if (!exists(agent.manifest)) throw new Error(`Agent ${agent.id} manifest does not exist: ${agent.manifest}.`);
    const identity = agent.github_identity;
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
      throw new Error(`Agent ${agent.id} needs a github_identity object.`);
    }
    for (const field of IDENTITY_FIELDS) {
      if (!Object.hasOwn(identity, field)) throw new Error(`Agent ${agent.id} github_identity is missing ${field}.`);
      const value = identity[field];
      if (value === null) continue;
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Agent ${agent.id} github_identity.${field} must be a non-empty string or null.`);
      }
      if (field === 'app_id' && !/^[0-9]{1,20}$/.test(value)) {
        throw new Error(`Agent ${agent.id} github_identity.app_id must be a numeric string or null.`);
      }
    }
  }
  return directory;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked && import.meta.url === invoked) {
  try {
    const root = process.cwd();
    validateAgents(JSON.parse(readFileSync(path.join(root, 'config/github/agents.json'), 'utf8')), { root });
    console.log('Agent directory is valid.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
