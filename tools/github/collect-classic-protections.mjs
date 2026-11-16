// SPDX-License-Identifier: Apache-2.0
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createGitHubClient, repositoryRoot } from './apply-repo-policy.mjs';
import { validateInventory } from './verify-inventory.mjs';
import { redactSecrets } from './redact-secrets.mjs';

function requiredChecks(protection) {
  if (!protection || typeof protection !== 'object' || !Object.hasOwn(protection, 'required_status_checks')) {
    throw new Error('Missing required_status_checks evidence');
  }
  const value = protection.required_status_checks;
  if (value === null) return null;
  if (typeof value?.strict !== 'boolean' || !Array.isArray(value.contexts) ||
      !value.contexts.every((context) => typeof context === 'string' && context.length > 0) ||
      !Array.isArray(value.checks) || !value.checks.every((check) =>
        typeof check?.context === 'string' && check.context.length > 0 &&
        (check.app_id === null || Number.isSafeInteger(check.app_id) && check.app_id > 0))) {
    throw new Error('Malformed required status checks evidence');
  }
  return { strict: value.strict, contexts: value.contexts, checks: value.checks.map(({ context, app_id }) => ({ context, app_id })) };
}

export async function collectClassicProtections({ inventory, api, sourceRevision, inventoryDigest, now = () => new Date().toISOString() }) {
  validateInventory(inventory);
  const results = [];
  const startedAt = now();
  for (const name of inventory.repositories) {
    const repository = `${inventory.owner}/${name}`;
    const result = { repository, status: 'unverified' };
    let stage = 'repository';
    try {
      const root = `/repos/${repository}`;
      const metadata = await api.get(root);
      if (metadata?.full_name !== repository || typeof metadata.default_branch !== 'string' || !metadata.default_branch.length) {
        throw new Error('Invalid repository identity or default branch');
      }
      result.default_branch = metadata.default_branch;
      const branchPath = `${root}/branches/${encodeURIComponent(metadata.default_branch)}`;
      stage = 'protection';
      try {
        result.required_status_checks = requiredChecks(await api.get(`${branchPath}/protection`));
        result.status = 'protected';
      } catch (error) {
        // Generic 404 can conceal inaccessible resources. Only GitHub's explicit
        // unprotected-branch response, after identity reads, establishes absence.
        if (error.status !== 404 || error.detail !== 'Branch not protected') throw error;
        result.status = 'unprotected';
        result.required_status_checks = null;
      }
      // Detect default-branch changes during collection; this is a snapshot,
      // never a guarantee that the live protection cannot change afterward.
      stage = 'confirm-default-branch';
      const confirmed = await api.get(root);
      if (confirmed?.full_name !== repository || confirmed.default_branch !== result.default_branch) {
        throw new Error('Default branch changed during collection');
      }
    } catch (error) {
      result.status = 'unverified';
      delete result.required_status_checks;
      // Do not persist arbitrary server/error text, headers or response bodies.
      result.error = { stage, http_status: Number.isInteger(error.status) ? error.status : null };
    }
    results.push(result);
  }
  return { schema_version: 1, source_revision: sourceRevision, inventory_sha256: inventoryDigest,
    started_at: startedAt, finished_at: now(), complete: results.every((result) => result.status !== 'unverified'),
    scope: 'Classic default-branch required status checks only; not rulesets or queue readiness certification', results };
}

export async function main({ token = process.env.GH_TOKEN, fetchImpl = globalThis.fetch,
  outputDirectory = path.join(repositoryRoot(), 'artifacts/classic-protections') } = {}) {
  const root = repositoryRoot();
  const bytes = readFileSync(path.join(root, 'config/github/repositories.json'));
  if (!token) throw new Error('GH_TOKEN is required');
  const report = await collectClassicProtections({ inventory: JSON.parse(bytes),
    api: createGitHubClient({ token, fetchImpl, allowWrites: false }),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    inventoryDigest: createHash('sha256').update(bytes).digest('hex') });
  const directory = outputDirectory;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'report.json'), redactSecrets(`${JSON.stringify(report, null, 2)}\n`, [token]), { mode: 0o600 });
  console.log(`Classic protection evidence: ${report.results.length} repositories; complete=${report.complete}`);
  return report.complete ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('Classic protection collection failed before a complete report could be written.');
    process.exitCode = 1;
  });
}
