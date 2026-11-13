#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGitHubClient, fetchPinnedPolicy, requireToken, repositoryRoot, runHttps, GitHubApiError } from './apply-repo-policy.mjs';
import { validateInventory } from './verify-inventory.mjs';
import { pagesHttpsEnforced, validatePages } from './pages-https.mjs';
import { redactSecrets } from './redact-secrets.mjs';

export const help = `Usage: node tools/github/setup-pages.mjs --repo NAME (--dry-run --plan-output FILE | --apply --expected-plan FILE)

Configure Actions-based Pages for one public, active, inventoried repository.
unitree-foxglove-sdk is excluded. Reads the canonical inventory and pinned policy.
Preview saves the observed state and intended changes. Apply requires that exact
preview, checks state again before each write, and verifies the result.
Only POST/PUT /repos/Living-Proof-Labs/NAME/pages are allowed: build_type=workflow
and https_enforced=true. Existing custom domains are preserved. HTTPS exemptions
come from the pinned policy. No credentials or permissions are provisioned.
GH_TOKEN is read only from the environment. Certificate/access failures fail;
review a fresh preview before retrying a partially completed operation.
This configures Pages; it does not dispatch or verify a documentation deployment.

Example (preview only):
  node tools/github/setup-pages.mjs --repo livingproof-evaluator --dry-run --plan-output pages-plan.json
After reviewing that file, apply with the same --repo and --apply --expected-plan pages-plan.json.
`;

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (Object.hasOwn(options, flag)) throw new Error(`Duplicate option ${flag}. Run with --help.`);
    if (['--help', '--dry-run', '--apply'].includes(flag)) options[flag] = true;
    else if (['--repo', '--plan-output', '--expected-plan'].includes(flag)) {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`${flag} requires a value. Run with --help.`);
      options[flag] = value;
    } else throw new Error(`Unknown option ${flag}. Run with --help.`);
  }
  if (options['--help']) return options;
  if (!options['--repo'] || Boolean(options['--dry-run']) === Boolean(options['--apply']) ||
      (options['--dry-run'] && (!options['--plan-output'] || options['--expected-plan'])) ||
      (options['--apply'] && (!options['--expected-plan'] || options['--plan-output']))) {
    throw new Error('Choose one repository and either preview with --plan-output or apply with --expected-plan. Run with --help.');
  }
  return options;
}

function scope(inventory, repo, fullInventory = false) {
  validateInventory(inventory);
  if (inventory.owner !== 'Living-Proof-Labs' || !inventory.repositories.includes(repo) ||
      (!fullInventory && repo.toLowerCase() === 'unitree-foxglove-sdk')) {
    throw new Error('Select one allowed Living-Proof-Labs repository from the canonical inventory; unitree-foxglove-sdk is excluded.');
  }
  return `/repos/${inventory.owner}/${repo}`;
}

/** Defense in depth: even a faulty planner cannot write outside these fields. */
export function pagesOnlyApi(api, inventory, repo, dryRun, fullInventory = false) {
  const base = scope(inventory, repo, fullInventory);
  return {
    get(resource) {
      if (resource !== base && resource !== `${base}/pages`) throw new Error('Pages-only read refused.');
      return api.get(resource);
    },
    write(method, resource, body) {
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
      const allowed = keys.length === 1 && (
        (keys[0] === 'build_type' && body.build_type === 'workflow' && ['POST', 'PUT'].includes(method)) ||
        (keys[0] === 'https_enforced' && body.https_enforced === true && method === 'PUT'));
      if (dryRun || resource !== `${base}/pages` || !allowed) throw new Error('Pages-only write refused.');
      return api.write(method, resource, body);
    }
  };
}

async function snapshot(api, base) {
  const repo = await api.get(base);
  if (!Number.isSafeInteger(repo?.id) || repo.full_name !== base.slice('/repos/'.length) ||
      repo.archived !== false || repo.disabled !== false || repo.visibility !== 'public' ||
      typeof repo.has_pages !== 'boolean' || typeof repo.default_branch !== 'string') {
    throw new Error('Repository identity, public visibility, or active state is unverified; no write allowed.');
  }
  let site;
  try {
    site = await api.get(`${base}/pages`);
    if (!site || typeof site !== 'object' || Array.isArray(site)) {
      throw new Error('Pages response is not an object; absence is unverified.');
    }
  }
  catch (error) {
    // A 404 alone can mean insufficient access. Require independent absence.
    if (!(error instanceof GitHubApiError && error.status === 404 && repo.has_pages === false)) throw error;
    site = null;
  }
  if (site !== null) {
    if (!repo.has_pages || !['workflow', 'legacy'].includes(site?.build_type) ||
        !Object.hasOwn(site, 'cname') || (site.cname !== null && typeof site.cname !== 'string') ||
        typeof site.https_enforced !== 'boolean') throw new Error('Pages state is incomplete or inconsistent; no write allowed.');
    site = { build_type: site.build_type, cname: site.cname, https_enforced: site.https_enforced, source: site.source ?? null };
  } else if (repo.has_pages) throw new Error('Pages state is inconsistent; no write allowed.');
  return { id: repo.id, default_branch: repo.default_branch, site };
}

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runPages({ api, inventory, repo, policy, dryRun, expectedPlan, fullInventory = false }) {
  const base = scope(inventory, repo, fullInventory);
  validatePages(policy?.pages);
  const decision = pagesHttpsEnforced(policy, repo);
  if (policy?.pages?.build_type !== 'workflow' || (!decision.report && decision.desired !== true)) {
    throw new Error('Pinned policy must require workflow Pages and HTTPS, or declare an HTTPS exemption.');
  }
  if (typeof dryRun !== 'boolean' || (!dryRun && !expectedPlan)) throw new Error('Apply requires a reviewed saved plan.');
  const scoped = pagesOnlyApi(api, inventory, repo, dryRun, fullInventory);
  const before = await snapshot(scoped, base);
  const setup = before.site?.build_type === 'workflow' ? null : { method: before.site ? 'PUT' : 'POST', body: { build_type: 'workflow' } };
  const plan = {
    schema_version: 1, mode: 'pages-only', owner: inventory.owner, repo,
    policy: digest(policy), inventory: digest(inventory), before,
    setup, https: decision.report ?? true
  };
  if (expectedPlan !== undefined && !isDeepStrictEqual(plan, expectedPlan)) {
    throw new Error('Pages plan changed since preview; no writes performed. Review a fresh preview.');
  }
  if (dryRun) return { plan, verified: false };
  let current = before;
  const assertCurrent = async () => {
    if (!isDeepStrictEqual(await snapshot(scoped, base), current)) throw new Error('Pages state changed before write; stopped. Review a fresh preview.');
  };
  if (setup) {
    await assertCurrent();
    await scoped.write(setup.method, `${base}/pages`, setup.body);
    current = await snapshot(scoped, base);
    if (current.id !== before.id || current.default_branch !== before.default_branch ||
        current.site?.build_type !== 'workflow' || current.site.cname !== (before.site?.cname ?? null)) {
      throw new Error('Pages setup read-back failed; stopped. Review a fresh preview.');
    }
  }
  // Reuse the HTTPS-only controller, including exemption and certificate errors.
  // Wrap its writer with our field/target guard and a fresh state precondition.
  const https = await runHttps({ policy, org: inventory.owner, repo, dryRun: false,
    listed: [{ name: repo }], api: { get: scoped.get, write: async (...args) => {
      await assertCurrent();
      return scoped.write(...args);
    } } });
  if (https.failures) throw new Error(`Pages HTTPS failed: ${https.repositories.flatMap(item => item.failures.map(f => f.message)).join('; ')}. Review a fresh preview.`);
  const after = await snapshot(scoped, base);
  if (after.id !== before.id || after.default_branch !== before.default_branch ||
      after.site?.build_type !== 'workflow' || after.site.cname !== (before.site?.cname ?? null) ||
      (!decision.report && after.site.https_enforced !== true)) {
    throw new Error('Pages final read-back failed. Review a fresh preview.');
  }
  return { plan, after, verified: true };
}

export async function main(argv, { env = process.env, fetchImpl = globalThis.fetch, io = process } = {}) {
  try {
    const options = parseArgs(argv);
    if (options['--help']) { io.stdout.write(help); return 0; }
    const root = repositoryRoot();
    const read = name => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
    const inventory = read('config/github/repositories.json');
    scope(inventory, options['--repo']);
    const token = requireToken(env);
    const policy = await fetchPinnedPolicy(read('config/github/repository-policy.json'), fetchImpl);
    const report = await runPages({ api: createGitHubClient({ token, fetchImpl, allowWrites: Boolean(options['--apply']) }),
      inventory, repo: options['--repo'], policy, dryRun: Boolean(options['--dry-run']),
      expectedPlan: options['--expected-plan'] ? JSON.parse(readFileSync(options['--expected-plan'], 'utf8')) : undefined });
    if (options['--plan-output']) writeFileSync(options['--plan-output'], JSON.stringify(report.plan, null, 2) + '\n');
    io.stdout.write(redactSecrets(JSON.stringify(report, null, 2), env.GH_TOKEN ?? '') + '\n');
    return 0;
  } catch (error) {
    io.stderr.write(redactSecrets(error.message, env.GH_TOKEN ?? '') + '\n');
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
