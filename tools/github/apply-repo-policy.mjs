#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Apply the pinned Living Proof Labs repository policy with GH_TOKEN.
 *
 * The token may be a personal access token or a GitHub App installation token.
 * Repository discovery uses GET /orgs/{org}/repos. This command never calls
 * /user. It never writes the token to disk, argv, or logs.
 *
 * Policy bytes come from the commit and blob SHA pinned in
 * config/github/repository-policy.json, unless --policy points at a local
 * file. --dry-run prints current -> desired and performs no write calls.
 * --apply writes only the fields that differ.
 *
 * pages.https_enforced is applied when the policy sets that boolean, except for
 * a repository in pages.https_enforced_exempt. This command does not invent
 * Enforce HTTPS, and it does not create Pages sites.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { validateInventory } from './verify-inventory.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagesHttpsEnforced, validatePages } from './pages-https.mjs';
import { redactSecrets } from './redact-secrets.mjs';

const USER_AGENT = 'living-proof-labs-apply-repo-policy';
const API_VERSION = '2022-11-28';
// GitHub leaves these fields out of GET /repos unless the token has Administration: read.
const ADMINISTRATION_READ_FIELDS = new Set([
  'allow_auto_merge',
  'allow_merge_commit',
  'allow_rebase_merge',
  'allow_squash_merge',
  'allow_update_branch',
  'delete_branch_on_merge',
  'merge_commit_message',
  'merge_commit_title',
  'squash_merge_commit_message',
  'squash_merge_commit_title',
  'use_squash_pr_title_as_default'
]);
const POLICY_KEYS = new Set([
  'schema_version',
  'repository',
  'graphql_repository',
  'manual_or_unavailable_settings',
  'immutable_releases',
  'pages',
  'main_ruleset'
]);

const SPONSORSHIP_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    hasSponsorshipsEnabled
  }
}`;

const SPONSORSHIP_MUTATION = `mutation($id: ID!, $enabled: Boolean!) {
  updateRepository(input: {repositoryId: $id, hasSponsorshipsEnabled: $enabled}) {
    repository { hasSponsorshipsEnabled }
  }
}`;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export class DryRunWriteError extends Error {
  constructor(description) {
    super(`dry-run refused a write: ${description}`);
    this.name = 'DryRunWriteError';
  }
}

export class GitHubApiError extends Error {
  constructor(status, detail, method, resource) {
    super(`HTTP ${status} ${method} ${resource}: ${detail}`);
    this.name = 'GitHubApiError';
    this.status = status;
    this.detail = detail;
    this.method = method;
    this.resource = resource;
  }
}

export function repositoryRoot() {
  return path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

export function gitBlobSha(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

export function isGraphqlMutation(query) {
  return !/^\s*query\b/.test(query) || /\bmutation\b/.test(query);
}

function usage() {
  return `Usage: scripts/apply-repo-policy (--dry-run | --apply) [--policy FILE] [--org ORG] [--repo NAME]

Reads the Living Proof Labs repository policy and compares it with every
repository from GET /orgs/{org}/repos. The default organization is
Living-Proof-Labs. Pass --repo to limit that list to one name.

--dry-run  Print each difference as current -> desired. No write API calls.
--apply    Write only settings whose current value differs from the policy.
--policy   Use a local policy JSON file instead of the pinned blob.
--org      Organization login. Default: Living-Proof-Labs; must match inventory.
--inventory FILE  Use only these registered repositories, never organization discovery.
--https-only  Isolate HTTPS changes; missing or unreadable sites fail without creation.
--junit FILE  Write per-repository verification evidence (HTTPS mode).
--plan-output FILE  Save the read-only HTTPS preview for owner review.
--expected-plan FILE  Refuse all writes if the HTTPS plan changed since preview.
--repo     Repository name (not owner/name) that the organization list must include.

Without --policy, the pin in config/github/repository-policy.json selects a
commit of collaboration-guidelines. The file is downloaded without GH_TOKEN
and rejected unless its git blob SHA matches the pin.

GH_TOKEN is a classic PAT, a fine-grained PAT, or a GitHub App installation
token. It is read from the environment only and is never stored or logged.
Do not put the token in an argument.

A repository in pages.https_enforced_exempt is reported as exempt (reason)
and Enforce HTTPS is not written for it. The list must be non-empty and
pages.https_enforced must be true. A repository with no Pages site is left
unchanged. The v7.10.0 pin exempts website.`;
}

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    apply: false,
    help: false,
    policyPath: undefined,
    org: 'Living-Proof-Labs',
    repo: undefined,
    httpsOnly: false,
    inventoryPath: undefined,
    junitPath: undefined,
    planOutput: undefined,
    expectedPlan: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const take = (flag) => {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new UsageError(`${flag} requires a value.`);
      index += 1;
      return value;
    };
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--policy') options.policyPath = take('--policy');
    else if (argument === '--org') options.org = take('--org');
    else if (argument === '--repo') options.repo = take('--repo');
    else if (argument === '--https-only') options.httpsOnly = true;
    else if (argument === '--inventory') options.inventoryPath = take('--inventory');
    else if (argument === '--junit') options.junitPath = take('--junit');
    else if (argument === '--plan-output') options.planOutput = take('--plan-output');
    else if (argument === '--expected-plan') options.expectedPlan = take('--expected-plan');
    else throw new UsageError(`Unknown option: ${argument}`);
  }
  if (options.help) return options;
  if (options.inventoryPath && !options.httpsOnly) throw new UsageError('--inventory requires --https-only.');
  if ((options.planOutput || options.expectedPlan) && !options.httpsOnly) throw new UsageError('Plan files require --https-only.');
  if (options.expectedPlan && !options.apply) throw new UsageError('--expected-plan requires --apply.');
  if (options.junitPath && !options.httpsOnly) throw new UsageError('--junit requires --https-only.');
  if (options.httpsOnly && !options.inventoryPath) throw new UsageError('--https-only requires --inventory.');
  if (options.dryRun === options.apply) throw new UsageError('Choose exactly one of --dry-run or --apply.');
  if (!isAccountName(options.org)) throw new UsageError('--org must be a GitHub organization login.');
  if (options.repo !== undefined && !isRepositoryName(options.repo)) {
    throw new UsageError('--repo must be a repository name, not an owner/name pair.');
  }
  return options;
}

export function requireToken(env) {
  const token = env.GH_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('GH_TOKEN is not set. Export a personal access token or a GitHub App installation token. This command reads that variable and does not store it.');
  }
  if (token !== token.trim()) throw new Error('GH_TOKEN must not begin or end with whitespace.');
  return token;
}

function sanitize(text, token) {
  // Redact before the length limit. A stateless token is longer than the limit,
  // and cutting it first would print the unredacted prefix.
  let cleaned = redactSecrets(text, token);
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 180) || 'request failed';
}

function isAccountName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(name);
}

function isRepositoryName(name) {
  return name === '.github' || (typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name));
}

export function assertOrgScopedPath(resource) {
  const pathname = resource.startsWith('http') ? new URL(resource).pathname : resource.split('?')[0];
  if (pathname === '/user' || pathname.startsWith('/user/')) {
    throw new Error(`Refusing user-scoped endpoint ${pathname}. List repositories with GET /orgs/{org}/repos.`);
  }
}

export function validatePin(pin) {
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) throw new Error('Policy pin is not a JSON object.');
  if (typeof pin.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(pin.repository)) {
    throw new Error('Policy pin repository must be owner/name.');
  }
  if (typeof pin.commit !== 'string' || !/^[0-9a-f]{40}$/.test(pin.commit)) {
    throw new Error('Policy pin commit must be a 40-character commit id.');
  }
  if (typeof pin.policy_path !== 'string' || pin.policy_path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Policy pin path is invalid.');
  }
  if (typeof pin.policy_blob_sha !== 'string' || !/^[0-9a-f]{40}$/.test(pin.policy_blob_sha)) {
    throw new Error('Policy pin blob SHA must be 40 hexadecimal characters.');
  }
  return pin;
}

export async function fetchPinnedPolicy(pin, fetchImpl) {
  const checked = validatePin(pin);
  const url = `https://raw.githubusercontent.com/${checked.repository}/${checked.commit}/${checked.policy_path}`;
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      headers: { Accept: 'application/vnd.github.raw', 'User-Agent': USER_AGENT }
    });
  } catch (error) {
    throw new Error(`Could not download the pinned policy from ${checked.repository}@${checked.commit}: ${sanitize(error.message, '')}`);
  }
  if (!response.ok) throw new Error(`Could not download the pinned policy (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = gitBlobSha(bytes);
  if (actual !== checked.policy_blob_sha) {
    throw new Error(`Pinned policy blob SHA ${checked.policy_blob_sha} does not match the downloaded file (${actual}). Refusing to continue.`);
  }
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Pinned policy is not JSON.');
  }
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Policy must be a JSON object.');
  if (policy.schema_version !== 1) throw new Error(`Unsupported policy schema version: ${policy.schema_version}`);
  for (const key of Object.keys(policy)) {
    if (!POLICY_KEYS.has(key)) throw new Error(`Unsupported policy field: ${key}`);
  }
  if (!policy.repository || typeof policy.repository !== 'object' || Array.isArray(policy.repository)) {
    throw new Error('policy.repository must be an object.');
  }
  if (policy.pages !== undefined) validatePages(policy.pages);
  if (policy.graphql_repository !== undefined) {
    const graphql = policy.graphql_repository;
    if (!graphql || typeof graphql !== 'object' || Array.isArray(graphql)) throw new Error('policy.graphql_repository must be an object.');
    for (const key of Object.keys(graphql)) {
      if (key !== 'hasSponsorshipsEnabled') throw new Error(`policy.graphql_repository.${key} is not supported.`);
    }
    if (typeof graphql.hasSponsorshipsEnabled !== 'boolean') throw new Error('policy.graphql_repository.hasSponsorshipsEnabled must be a boolean.');
  }
  if (policy.immutable_releases !== undefined && typeof policy.immutable_releases !== 'boolean') {
    throw new Error('policy.immutable_releases must be a boolean.');
  }
  if (policy.manual_or_unavailable_settings !== undefined) {
    const manual = policy.manual_or_unavailable_settings;
    if (!manual || typeof manual !== 'object' || Array.isArray(manual)) throw new Error('policy.manual_or_unavailable_settings must be an object.');
  }
  if (policy.main_ruleset !== undefined) validateRuleset(policy.main_ruleset);
  return policy;
}

function validateRuleset(ruleset) {
  if (!ruleset || typeof ruleset !== 'object' || Array.isArray(ruleset)) throw new Error('policy.main_ruleset must be an object.');
  for (const key of ['name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules']) {
    if (!(key in ruleset)) throw new Error(`policy.main_ruleset.${key} is required.`);
  }
  if (!Array.isArray(ruleset.rules) || !Array.isArray(ruleset.bypass_actors)) {
    throw new Error('policy.main_ruleset rules and bypass_actors must be arrays.');
  }
}

export function policyNotices(policy) {
  if (!policy.pages || !Object.hasOwn(policy.pages, 'https_enforced')) {
    return ['pinned policy does not set pages.https_enforced, so Enforce HTTPS is not written. Add boolean pages.https_enforced in collaboration-guidelines, then repin commit and policy_blob_sha in config/github/repository-policy.json.'];
  }
  return [];
}

export function manualSettingNames(policy) {
  return Object.keys(policy.manual_or_unavailable_settings ?? {});
}

function sameValue(left, right) {
  return Object.is(left, right);
}

export function normalizeRuleset(ruleset) {
  const byType = Object.fromEntries((ruleset.rules ?? []).map((rule) => [rule.type, rule]));
  const pullRequest = byType.pull_request?.parameters ?? {};
  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    conditions: {
      ref_name: {
        include: [...(ruleset.conditions?.ref_name?.include ?? [])].sort(),
        exclude: [...(ruleset.conditions?.ref_name?.exclude ?? [])].sort()
      }
    },
    bypass_actors: Array.isArray(ruleset.bypass_actors)
      ? ruleset.bypass_actors
        .map(({ actor_id: actorId, actor_type: actorType, bypass_mode: bypassMode }) => ({
          actor_id: actorId,
          actor_type: actorType,
          bypass_mode: bypassMode
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : undefined,
    rules: [
      ...(byType.deletion ? [{ type: 'deletion' }] : []),
      ...(byType.non_fast_forward ? [{ type: 'non_fast_forward' }] : []),
      ...(byType.pull_request ? [{
        type: 'pull_request',
        parameters: {
          required_approving_review_count: pullRequest.required_approving_review_count,
          dismiss_stale_reviews_on_push: pullRequest.dismiss_stale_reviews_on_push,
          require_code_owner_review: pullRequest.require_code_owner_review,
          require_last_push_approval: pullRequest.require_last_push_approval,
          required_review_thread_resolution: pullRequest.required_review_thread_resolution,
          allowed_merge_methods: [...(pullRequest.allowed_merge_methods ?? [])].sort()
        }
      }] : [])
    ]
  };
}

export function updateRulesetPayload(existing, desired) {
  const existingByType = Object.fromEntries((existing.rules ?? []).map((rule) => [rule.type, rule]));
  const desiredByType = Object.fromEntries((desired.rules ?? []).map((rule) => [rule.type, rule]));
  const managedTypes = new Set(Object.keys(desiredByType));
  const rules = (existing.rules ?? []).filter((rule) => !managedTypes.has(rule.type));
  for (const rule of desired.rules) {
    if (rule.type === 'pull_request') {
      rules.push({
        type: 'pull_request',
        parameters: { ...(existingByType.pull_request?.parameters ?? {}), ...rule.parameters }
      });
    } else rules.push(structuredClone(rule));
  }
  return {
    name: desired.name,
    target: desired.target,
    enforcement: desired.enforcement,
    conditions: { ...(existing.conditions ?? {}), ...desired.conditions },
    bypass_actors: desired.bypass_actors,
    rules
  };
}

function absentRepositoryField(key) {
  const permission = ADMINISTRATION_READ_FIELDS.has(key) ? 'missing Administration: read; ' : '';
  return `field is absent from the repository response; ${permission}not written`;
}

function rulesetIdentity(value) {
  const id = String(value ?? '');
  return /^[0-9]+$/.test(id) ? id : undefined;
}

/**
 * Pure diff of one repository. `writes` is empty when nothing differs.
 * Unreadable settings become failures and are not written.
 */
export function planRepository(policy, observed, repository) {
  if (observed.repositoryError) {
    return { lines: [], writes: [], skipped: [], failures: [{ setting: 'repository', message: observed.repositoryError }] };
  }
  const lines = [];
  const writes = [];
  const skipped = [];
  const failures = [];
  const patch = {};
  for (const [key, desired] of Object.entries(policy.repository)) {
    const setting = `repository.${key}`;
    if (!Object.hasOwn(observed.repository, key)) {
      failures.push({ setting, message: absentRepositoryField(key) });
      continue;
    }
    if (!sameValue(observed.repository[key], desired)) {
      lines.push({ setting, current: observed.repository[key], desired });
      patch[key] = desired;
    }
  }
  if (Object.keys(patch).length > 0) {
    writes.push({ setting: 'repository', method: 'PATCH', path: `/repos/${repository.owner}/${repository.name}`, body: patch });
  }

  if (policy.graphql_repository) {
    const setting = 'graphql.hasSponsorshipsEnabled';
    const desired = policy.graphql_repository.hasSponsorshipsEnabled;
    if (observed.sponsorship?.error) failures.push({ setting, message: observed.sponsorship.error });
    else if (typeof observed.sponsorship?.id !== 'string' || observed.sponsorship.id.length === 0) {
      failures.push({ setting, message: 'GraphQL repository id is absent; not written' });
    } else if (!sameValue(observed.sponsorship.hasSponsorshipsEnabled, desired)) {
      lines.push({ setting, current: observed.sponsorship.hasSponsorshipsEnabled, desired });
      writes.push({ setting, graphql: { query: SPONSORSHIP_MUTATION, variables: { id: observed.sponsorship.id, enabled: desired } } });
    }
  }

  if (typeof policy.immutable_releases === 'boolean') {
    const setting = 'immutable_releases';
    if (observed.immutableReleases?.error) failures.push({ setting, message: observed.immutableReleases.error });
    else if (typeof observed.immutableReleases?.enabled !== 'boolean') {
      failures.push({ setting, message: 'immutable release state is unverified; not written' });
    } else if (observed.immutableReleases.enabled !== policy.immutable_releases) {
      lines.push({ setting, current: observed.immutableReleases.enabled, desired: policy.immutable_releases });
      writes.push({
        setting,
        method: policy.immutable_releases ? 'PUT' : 'DELETE',
        path: `/repos/${repository.owner}/${repository.name}/immutable-releases`
      });
    }
  }

  if (policy.pages) planPages(policy.pages, observed.pages, repository, lines, writes, skipped, failures);
  if (policy.main_ruleset) planRuleset(policy.main_ruleset, observed.ruleset, repository, lines, writes, failures);
  return { lines, writes, skipped, failures };
}

function planPages(desiredPages, observedPages, repository, lines, writes, skipped, failures) {
  if (observedPages?.error) {
    failures.push({ setting: 'pages', message: observedPages.error });
    return;
  }
  if (!observedPages) {
    failures.push({ setting: 'pages', message: 'Pages state was not read; not written' });
    return;
  }
  if (observedPages.site === null) {
    skipped.push('pages: no site, so build type and Enforce HTTPS are not changed');
    return;
  }
  if (typeof observedPages.site !== 'object') {
    failures.push({ setting: 'pages', message: 'Pages response was not an object; not written' });
    return;
  }
  const body = {};
  if (Object.hasOwn(desiredPages, 'build_type')) {
    if (!Object.hasOwn(observedPages.site, 'build_type')) {
      failures.push({ setting: 'pages.build_type', message: 'field is absent from the Pages response; not written' });
    } else if (observedPages.site.build_type !== desiredPages.build_type) {
      lines.push({ setting: 'pages.build_type', current: observedPages.site.build_type, desired: desiredPages.build_type });
      body.build_type = desiredPages.build_type;
    }
  }
  const https = pagesHttpsEnforced({ pages: desiredPages }, repository.name);
  if (https.report) {
    skipped.push(`pages.https_enforced: ${https.report}`);
  } else if (https.enforce) {
    if (typeof observedPages.site.https_enforced !== 'boolean') {
      failures.push({ setting: 'pages.https_enforced', message: 'field is absent or non-boolean in the Pages response; not written' });
    } else if (observedPages.site.https_enforced !== https.desired) {
      lines.push({ setting: 'pages.https_enforced', current: observedPages.site.https_enforced, desired: https.desired });
      body.https_enforced = https.desired;
    }
  }
  if (Object.keys(body).length > 0) {
    writes.push({ setting: 'pages', method: 'PUT', path: `/repos/${repository.owner}/${repository.name}/pages`, body });
  }
}

function planRuleset(desired, observed, repository, lines, writes, failures) {
  const setting = 'main_ruleset';
  if (!observed || observed.error) {
    failures.push({ setting, message: observed?.error ?? 'main ruleset was not read' });
    return;
  }
  if (observed.state === 'matches') return;
  if (observed.state === 'missing') {
    lines.push({ setting, current: null, desired: normalizeRuleset(desired) });
    writes.push({ setting, method: 'POST', path: `/repos/${repository.owner}/${repository.name}/rulesets`, body: desired });
    return;
  }
  if (observed.state === 'different') {
    const id = rulesetIdentity(observed.id);
    if (!id) {
      failures.push({ setting, message: 'ruleset id is invalid; not written' });
      return;
    }
    lines.push({ setting, current: normalizeRuleset(observed.existing), desired: normalizeRuleset(desired) });
    writes.push({
      setting,
      method: 'PUT',
      path: `/repos/${repository.owner}/${repository.name}/rulesets/${id}`,
      body: updateRulesetPayload(observed.existing, desired)
    });
    return;
  }
  failures.push({ setting, message: observed.error ?? 'main ruleset state is unverified; not written' });
}

export function createGitHubClient({ token, fetchImpl, allowWrites, baseUrl = 'https://api.github.com' }) {
  async function request(method, resource, { body, graphql } = {}) {
    if (!graphql) assertOrgScopedPath(resource);
    const url = graphql ? new URL('/graphql', baseUrl) : new URL(resource, baseUrl);
    if (!graphql) assertOrgScopedPath(url.pathname);
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': API_VERSION
    };
    const init = { method, headers, redirect: 'error' };
    if (graphql || body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(graphql ? { query: graphql.query, variables: graphql.variables ?? {} } : body);
    }
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      throw new GitHubApiError(0, sanitize(error.message, token), method, graphql ? '/graphql' : url.pathname);
    }
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GitHubApiError(response.status, 'response was not JSON', method, graphql ? '/graphql' : url.pathname);
      }
    }
    const resourceLabel = graphql ? '/graphql' : url.pathname;
    if (!response.ok) {
      const message = typeof parsed?.message === 'string' ? parsed.message : (response.statusText || 'request failed');
      throw new GitHubApiError(response.status, sanitize(message, token), method, resourceLabel);
    }
    if (graphql && Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
      const message = typeof parsed.errors[0]?.message === 'string' ? parsed.errors[0].message : 'GraphQL request failed';
      throw new GitHubApiError(response.status, sanitize(message, token), method, resourceLabel);
    }
    return parsed;
  }

  return {
    get(resource) {
      return request('GET', resource);
    },
    write(method, resource, body) {
      if (!allowWrites) throw new DryRunWriteError(`${method} ${resource.split('?')[0]}`);
      return request(method, resource, { body });
    },
    graphql(query, variables) {
      if (isGraphqlMutation(query) && !allowWrites) throw new DryRunWriteError('GraphQL mutation');
      return request('POST', '/graphql', { graphql: { query, variables } });
    }
  };
}

export async function listOrgRepositories(api, org) {
  if (!isAccountName(org)) throw new Error('Organization login is invalid.');
  const repositories = [];
  for (let page = 1; page <= 50; page += 1) {
    const resource = `/orgs/${org}/repos?per_page=100&type=all&page=${page}`;
    const batch = await api.get(resource);
    if (!Array.isArray(batch)) throw new Error(`GET /orgs/${org}/repos did not return a repository list.`);
    for (const repository of batch) {
      if (!isRepositoryName(repository?.name)) throw new Error('Organization repository list included an invalid name.');
      repositories.push({ name: repository.name, archived: repository.archived === true });
    }
    if (batch.length < 100) return repositories;
  }
  throw new Error(`GET /orgs/${org}/repos did not end within 50 pages.`);
}

function describeFailure(error) {
  if (error instanceof DryRunWriteError) throw error;
  if (error instanceof GitHubApiError) {
    if (error.status === 401 || error.status === 403) return `HTTP ${error.status} (token lacks permission for this setting)`;
    return `HTTP ${error.status} (${error.detail})`;
  }
  return 'request failed';
}

async function readResource(api, resource) {
  try {
    return { value: await api.get(resource) };
  } catch (error) {
    if (error instanceof DryRunWriteError) throw error;
    if (error instanceof GitHubApiError) return { error: describeFailure(error), status: error.status };
    return { error: 'request failed' };
  }
}

async function readImmutable(api, org, name) {
  const result = await readResource(api, `/repos/${org}/${name}/immutable-releases`);
  if (result.status === 404) return { enabled: false };
  if (result.error) return { error: result.error };
  if (typeof result.value?.enabled !== 'boolean') return { error: 'immutable release state is unverified; not written' };
  return { enabled: result.value.enabled };
}

async function readPages(api, org, name, repository) {
  const result = await readResource(api, `/repos/${org}/${name}/pages`);
  if (!result.error) return { site: result.value };
  if (result.status === 404 && repository.has_pages === false) return { site: null };
  if (result.status === 404) {
    return { error: 'HTTP 404 (Pages is not readable, and the repository reports a site; not treated as absent)' };
  }
  return { error: result.error };
}

async function readSponsorship(api, org, name) {
  try {
    const body = await api.graphql(SPONSORSHIP_QUERY, { owner: org, name });
    const repository = body?.data?.repository;
    if (typeof repository?.id !== 'string' || typeof repository.hasSponsorshipsEnabled !== 'boolean') {
      return { error: 'GraphQL did not return hasSponsorshipsEnabled; not written' };
    }
    return { id: repository.id, hasSponsorshipsEnabled: repository.hasSponsorshipsEnabled };
  } catch (error) {
    if (error instanceof DryRunWriteError) throw error;
    return { error: describeFailure(error) };
  }
}

async function readRuleset(api, org, name, desired) {
  const summary = await readResource(api, `/repos/${org}/${name}/rulesets`);
  if (summary.error) return { error: summary.error };
  if (!Array.isArray(summary.value)) return { error: 'main ruleset list was not an array; not written' };
  const matches = summary.value.filter((ruleset) => ruleset?.name === desired.name);
  if (matches.length > 1) return { error: `main ruleset name matched ${matches.length} rulesets; not written` };
  if (matches.length === 0) return { state: 'missing' };
  const id = rulesetIdentity(matches[0].id);
  if (!id) return { error: 'ruleset id is invalid; not written' };
  const full = await readResource(api, `/repos/${org}/${name}/rulesets/${id}`);
  if (full.error) return { error: full.error };
  if (!Array.isArray(full.value?.bypass_actors)) {
    return { state: 'unknown', error: 'main ruleset bypass actors are unreadable; not written' };
  }
  const state = JSON.stringify(normalizeRuleset(full.value)) === JSON.stringify(normalizeRuleset(desired)) ? 'matches' : 'different';
  return { state, id, existing: full.value };
}

export async function observe(api, org, name, policy) {
  const repository = await readResource(api, `/repos/${org}/${name}`);
  if (repository.error) return { repositoryError: repository.error };
  const observed = { repository: repository.value };
  if (typeof policy.immutable_releases === 'boolean') observed.immutableReleases = await readImmutable(api, org, name);
  if (policy.pages) observed.pages = await readPages(api, org, name, repository.value);
  if (policy.graphql_repository) observed.sponsorship = await readSponsorship(api, org, name);
  if (policy.main_ruleset) observed.ruleset = await readRuleset(api, org, name, policy.main_ruleset);
  return observed;
}

export async function run({ policy, org, repo, dryRun, api, inventory, httpsOnly = false, expectedPlan }) {
  if (inventory && !httpsOnly) throw new Error('--inventory requires HTTPS-only mode.');
  if (inventory) {
    validateInventory(inventory);
    if (inventory.owner !== org) throw new Error('Inventory owner differs from --org.');
  }
  if (httpsOnly && !inventory) throw new Error('HTTPS-only mode requires the canonical inventory.');
  let listed = inventory ? inventory.repositories.map(name => ({ name })) : await listOrgRepositories(api, org);
  if (httpsOnly) return runHttps({ policy, org, repo, dryRun, api, listed, expectedPlan });
  if (repo) {
    listed = listed.filter((item) => item.name === repo);
    if (listed.length === 0) throw new Error(`GET /orgs/${org}/repos did not include ${repo}.`);
  } else if (listed.length === 0) {
    throw new Error(`GET /orgs/${org}/repos returned no repositories. An installation token only lists repositories the GitHub App can access.`);
  }
  const repositories = [];
  for (const item of listed) {
    if (item.archived) {
      repositories.push({
        name: item.name,
        archived: true,
        lines: [],
        skipped: [],
        failures: [],
        writeFailures: 0
      });
      continue;
    }
    const observed = await observe(api, org, item.name, policy);
    const planned = planRepository(policy, observed, { owner: org, name: item.name });
    let writeFailures = 0;
    if (!dryRun) {
      for (const write of planned.writes) {
        try {
          if (write.graphql) await api.graphql(write.graphql.query, write.graphql.variables);
          else await api.write(write.method, write.path, write.body);
        } catch (error) {
          if (error instanceof DryRunWriteError) throw error;
          writeFailures += 1;
          planned.failures.push({ setting: write.setting, message: describeFailure(error) });
        }
      }
    }
    repositories.push({
      name: item.name,
      lines: planned.lines,
      skipped: planned.skipped,
      failures: planned.failures,
      writeFailures
    });
  }
  const failures = repositories.reduce((total, item) => total + item.failures.length, 0);
  return { notices: policyNotices(policy), manual: manualSettingNames(policy), repositories, failures };
}

/** Isolated Pages HTTPS application; reuses the existing Pages diff planner. */
export async function runHttps({ policy, org, repo, dryRun, api, listed, expectedPlan }) {
  if (repo && !listed.some(item => item.name === repo)) throw new Error(`${repo} is not in the canonical inventory.`);
  if (repo) listed = listed.filter(item => item.name === repo);
  const repositories = [];
  for (const { name } of listed) {
    const item = { name, lines: [], skipped: [], failures: [], writeFailures: 0 };
    repositories.push(item);
    const decision = pagesHttpsEnforced(policy, name);
    if (decision.report) { item.skipped.push(decision.report); continue; }
    if (!decision.enforce) { item.failures.push({ setting: 'pages.https_enforced', message: 'pinned policy has no HTTPS value' }); continue; }
    const repository = await readResource(api, `/repos/${org}/${name}`);
    if (repository.error) { item.failures.push({ setting: 'repository', message: repository.error }); continue; }
    if (repository.value?.archived === true) { item.skipped.push('archived; no writes'); continue; }
    const before = await readPages(api, org, name, repository.value);
    if (before.site === null) { item.failures.push({ setting: 'pages', message: 'missing site; HTTPS-only mode never creates a site' }); continue; }
    const writes = [];
    planPages({ https_enforced: decision.desired }, before, { owner: org, name }, item.lines, writes, item.skipped, item.failures);
    item.writes = writes;
  }
  const plan = structuredClone({ owner: org, repositories: repositories.map(({ name, lines, skipped, failures, writes = [] }) => ({ name, lines, skipped, failures, writes })) });
  if (expectedPlan !== undefined && JSON.stringify(plan) !== JSON.stringify(expectedPlan)) throw new Error('HTTPS plan changed since preview; no writes performed. Review a fresh preview.');
  for (const item of repositories) {
    const writes = item.writes ?? [];
    const name = item.name;
    const decision = pagesHttpsEnforced(policy, name);
    if (dryRun) continue;
    for (const write of writes) {
      try { await api.write(write.method, write.path, write.body); }
      catch (error) {
        item.writeFailures++;
        const message = error instanceof GitHubApiError && error.status === 422 && /certificate|https/i.test(error.detail)
          ? `certificate not ready or HTTPS unavailable: ${describeFailure(error)}` : describeFailure(error);
        item.failures.push({ setting: 'pages.https_enforced', message });
      }
    }
    if (writes.length && !item.writeFailures) {
      const after = await readPages(api, org, name, { has_pages: true });
      if (after.error || after.site?.https_enforced !== decision.desired) {
        item.failures.push({ setting: 'pages.https_enforced', message: `read-back failed: ${after.error ?? 'desired boolean not observed'}` });
      }
    }
  }
  return { plan, dryRun, inventory: true, notices: [], manual: [], repositories, failures: repositories.reduce((n, item) => n + item.failures.length, 0) };
}

export function renderHttpsJunit(report, org) {
  const xml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
  const cases = report.repositories.map(item => {
    const failure = item.failures.map(f => `${f.setting}: ${f.message}`).join('; ');
    const skipped = [...item.skipped, ...(report.dryRun && item.lines.length ? ['preview only: changes not applied or verified'] : [])];
    return `  <testcase classname="pages.https_enforced" name="${xml(org + '/' + item.name)}">${failure ? `<failure message="${xml(failure)}"/>` : skipped.length ? `<skipped message="${xml(skipped.join('; '))}"/>` : ''}</testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Pages HTTPS" tests="${cases.length}" failures="${report.repositories.filter(i => i.failures.length).length}" skipped="${report.repositories.filter(i => !i.failures.length && (i.skipped.length || (report.dryRun && i.lines.length))).length}">\n${cases.join('\n')}\n</testsuite>\n`;
}

export function renderReport(report, { dryRun, org, policySource }) {
  const lines = [
    `mode: ${dryRun ? 'dry-run (no writes)' : 'apply'}`,
    `repositories: ${report.inventory ? 'canonical inventory' : `GET /orgs/${org}/repos?type=all`}`,
    `policy: ${policySource}`
  ];
  for (const notice of report.notices) lines.push(`notice: ${notice}`);
  if (report.manual.length > 0) lines.push(`skipped (no API): ${report.manual.join(', ')}`);
  lines.push('');
  for (const repository of report.repositories) {
    lines.push(`${org}/${repository.name}`);
    if (repository.archived) {
      lines.push('  skipped (archived)');
      continue;
    }
    if (repository.lines.length === 0 && repository.skipped.length === 0 && repository.failures.length === 0) {
      lines.push('  no changes');
    }
    for (const line of repository.lines) {
      lines.push(`  ${line.setting}: ${JSON.stringify(line.current)} -> ${JSON.stringify(line.desired)}`);
    }
    for (const skip of repository.skipped) lines.push(`  skipped: ${skip}`);
    for (const failure of repository.failures) lines.push(`  ERROR ${failure.setting}: ${failure.message}`);
    if (repository.lines.length > 0) {
      const outcome = dryRun ? 'not written (dry-run)' : report.inventory && report.plan ? (repository.failures.length > 0 ? 'not verified' : 'written and verified') : (repository.writeFailures > 0 ? 'not fully written' : 'written');
      lines.push(`  outcome: ${outcome}`);
    }
  }
  const changes = report.repositories.reduce((total, repository) => total + repository.lines.length, 0);
  lines.push('');
  lines.push(`${changes} change(s); ${report.failures} error(s).`);
  return `${lines.join('\n')}\n`;
}

function readPolicyFile(policyPath) {
  let text;
  try {
    text = readFileSync(policyPath, 'utf8');
  } catch {
    throw new UsageError(`Could not read policy file: ${policyPath}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`Policy file is not JSON: ${policyPath}`);
  }
}

function readPin(pinPath) {
  let text;
  try {
    text = readFileSync(pinPath, 'utf8');
  } catch {
    throw new Error(`Could not read policy pin: ${pinPath}`);
  }
  try {
    return validatePin(JSON.parse(text));
  } catch (error) {
    throw new Error(`Policy pin is invalid: ${error.message}`);
  }
}

export async function main(argv, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const io = dependencies.io ?? { stdout: process.stdout, stderr: process.stderr };
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const tokenForErrors = typeof env.GH_TOKEN === 'string' ? env.GH_TOKEN : '';
  try {
    const options = parseArgs(argv);
    if (options.help) {
      io.stdout.write(`${usage()}\n`);
      return 0;
    }
    let token;
    try {
      token = requireToken(env);
    } catch (error) {
      io.stderr.write(`${sanitize(error.message, tokenForErrors)}\n`);
      return 1;
    }
    const pinPath = dependencies.pinPath ?? path.join(repositoryRoot(), 'config/github/repository-policy.json');
    let policy;
    let policySource;
    if (options.policyPath) {
      policy = readPolicyFile(options.policyPath);
      policySource = `file ${options.policyPath} (local file, blob SHA not checked)`;
    } else {
      const pin = readPin(pinPath);
      policy = await fetchPinnedPolicy(pin, fetchImpl);
      policySource = `${pin.repository}@${pin.commit} ${pin.policy_path} blob ${pin.policy_blob_sha}`;
    }
    validatePolicy(policy);
    const api = createGitHubClient({ token, fetchImpl, allowWrites: options.apply === true });
    const inventory = options.inventoryPath ? JSON.parse(readFileSync(options.inventoryPath, 'utf8')) : undefined;
    const report = await run({ policy, org: options.org, repo: options.repo, dryRun: options.dryRun, api, inventory, httpsOnly: options.httpsOnly, expectedPlan: options.expectedPlan ? JSON.parse(readFileSync(options.expectedPlan, 'utf8')) : undefined });
    if (options.planOutput) {
      mkdirSync(path.dirname(options.planOutput), { recursive: true });
      writeFileSync(options.planOutput, JSON.stringify(report.plan, null, 2) + '\n');
    }
    if (options.junitPath) {
      if (!options.httpsOnly) throw new UsageError('--junit requires --https-only.');
      mkdirSync(path.dirname(options.junitPath), { recursive: true });
      writeFileSync(options.junitPath, redactSecrets(renderHttpsJunit(report, options.org), tokenForErrors));
    }
    io.stdout.write(redactSecrets(renderReport(report, { dryRun: options.dryRun, org: options.org, policySource }), tokenForErrors));
    return report.failures > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed';
    io.stderr.write(`${sanitize(message, tokenForErrors)}\n`);
    return error instanceof UsageError ? 64 : 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
