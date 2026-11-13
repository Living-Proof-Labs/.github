#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/** Audit or deliberately apply Living Proof Labs' repository defaults. */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const policyPath = new URL('../../config/github/repository-policy.json', import.meta.url);

export function parseArgs(args) {
  let repository;
  let apply = false;
  let applyMainRuleset = false;
  let applyImmutableReleasesWhenUnknown = false;
  let applyPages = false;
  let help = false;
  let inventoryPath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') apply = true;
    else if (argument === '--apply-main-ruleset') applyMainRuleset = true;
    else if (argument === '--apply-immutable-releases-when-unknown') applyImmutableReleasesWhenUnknown = true;
    else if (argument === '--apply-pages') applyPages = true;
    else if (argument === '--help') help = true;
    else if (argument === '--inventory') {
      inventoryPath = args[index + 1];
      if (!inventoryPath || inventoryPath.startsWith('-')) throw new Error('--inventory requires a JSON file path.');
      index += 1;
    }
    else if (argument === '--repo') {
      repository = args[index + 1];
      if (!repository || repository.startsWith('-')) throw new Error('--repo requires a repository name.');
      index += 1;
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (applyMainRuleset && !apply) throw new Error('--apply-main-ruleset requires --apply.');
  if (applyImmutableReleasesWhenUnknown && !apply) throw new Error('--apply-immutable-releases-when-unknown requires --apply.');
  if (applyPages && !apply) throw new Error('--apply-pages requires --apply.');
  if (!help && !inventoryPath) throw new Error('--inventory is required so the consumer controls its repository inventory.');
  if (apply && !repository) throw new Error('--apply requires exactly one --repo from the declaration.');
  return { apply, applyMainRuleset, applyImmutableReleasesWhenUnknown, applyPages, help, inventoryPath, repository };
}

export function differences(actual, desired) {
  return Object.entries(desired)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => ({ field: key, actual: actual[key], desired: value }));
}

export function normalizeRuleset(ruleset) {
  const byType = Object.fromEntries((ruleset.rules ?? []).map((rule) => [rule.type, rule]));
  const pullRequest = byType.pull_request?.parameters ?? {};
  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    conditions: { ref_name: {
      include: [...(ruleset.conditions?.ref_name?.include ?? [])].sort(),
      exclude: [...(ruleset.conditions?.ref_name?.exclude ?? [])].sort()
    } },
    // GitHub deliberately omits this field when the caller cannot read it.
    // Treat absence as unknown, never as an empty bypass list.
    bypass_actors: Array.isArray(ruleset.bypass_actors)
      ? ruleset.bypass_actors
        .map(({ actor_id: actorId, actor_type: actorType, bypass_mode: bypassMode }) => ({ actor_id: actorId, actor_type: actorType, bypass_mode: bypassMode }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : undefined,
    rules: [
      ...(byType.deletion ? [{ type: 'deletion' }] : []),
      ...(byType.non_fast_forward ? [{ type: 'non_fast_forward' }] : []),
      ...(byType.pull_request ? [{ type: 'pull_request', parameters: {
        required_approving_review_count: pullRequest.required_approving_review_count,
        dismiss_stale_reviews_on_push: pullRequest.dismiss_stale_reviews_on_push,
        require_code_owner_review: pullRequest.require_code_owner_review,
        require_last_push_approval: pullRequest.require_last_push_approval,
        required_review_thread_resolution: pullRequest.required_review_thread_resolution,
        allowed_merge_methods: [...(pullRequest.allowed_merge_methods ?? [])].sort()
      } }] : [])
    ]
  };
}

export function rulesetState(existing, desired) {
  if (!existing) return 'missing';
  const normalizedExisting = normalizeRuleset(existing);
  if (normalizedExisting.bypass_actors === undefined) return 'unknown';
  return JSON.stringify(normalizedExisting) === JSON.stringify(normalizeRuleset(desired)) ? 'matches' : 'different';
}

/** Preserve all non-managed policy when correcting the fields this manifest owns. */
export function updateRulesetPayload(existing, desired) {
  const existingByType = Object.fromEntries((existing.rules ?? []).map((rule) => [rule.type, rule]));
  const desiredByType = Object.fromEntries((desired.rules ?? []).map((rule) => [rule.type, rule]));
  const managedTypes = new Set(Object.keys(desiredByType));
  const rules = (existing.rules ?? []).filter((rule) => !managedTypes.has(rule.type));
  for (const rule of desired.rules) {
    if (rule.type === 'pull_request') {
      rules.push({
        type: 'pull_request',
        parameters: {
          ...(existingByType.pull_request?.parameters ?? {}),
          ...rule.parameters
        }
      });
    } else rules.push(rule);
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

const PAGES_KEYS = new Set(['build_type', 'https_enforced', 'https_enforced_exempt']);

function isRepositoryName(name) {
  return typeof name === 'string' && (name === '.github' || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name));
}

/** Closed pages schema. Unknown keys are rejected, including on each exemption. */
export function validatePages(pages) {
  if (pages === undefined) return;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) throw new Error('policy.pages must be an object.');
  for (const key of Object.keys(pages)) {
    if (!PAGES_KEYS.has(key)) throw new Error(`policy.pages.${key} is not supported.`);
  }
  if (pages.build_type !== undefined && pages.build_type !== 'legacy' && pages.build_type !== 'workflow') {
    throw new Error('policy.pages.build_type must be legacy or workflow.');
  }
  if (Object.hasOwn(pages, 'https_enforced') && typeof pages.https_enforced !== 'boolean') {
    throw new Error('policy.pages.https_enforced must be a boolean.');
  }
  if (!Object.hasOwn(pages, 'https_enforced_exempt')) return;
  const entries = pages.https_enforced_exempt;
  if (!Array.isArray(entries)) throw new Error('policy.pages.https_enforced_exempt must be an array.');
  if (entries.length === 0) throw new Error('policy.pages.https_enforced_exempt must not be empty.');
  if (pages.https_enforced !== true) throw new Error('policy.pages.https_enforced_exempt requires pages.https_enforced to be true.');
  const seen = new Set();
  entries.forEach((entry, index) => {
    const at = `policy.pages.https_enforced_exempt[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${at} must be an object with repo and reason.`);
    for (const key of Object.keys(entry)) {
      if (key !== 'repo' && key !== 'reason') throw new Error(`${at}.${key} is not supported.`);
    }
    if (!isRepositoryName(entry.repo)) throw new Error(`${at}.repo must be a non-empty repository name.`);
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') throw new Error(`${at}.reason must be a non-empty string.`);
    if (seen.has(entry.repo)) throw new Error(`${at}.repo duplicates ${entry.repo}.`);
    seen.add(entry.repo);
  });
}

/**
 * How pages.https_enforced applies to one repository.
 *
 * An exempt repository has enforce false and report `exempt (<reason>)`.
 * Callers must not write https_enforced and must not treat it as drift.
 * Otherwise enforce is true when the policy sets the boolean.
 */
export function pagesHttpsEnforced(policy, repositoryName) {
  const pages = policy?.pages;
  const entries = Array.isArray(pages?.https_enforced_exempt) ? pages.https_enforced_exempt : [];
  const exemption = entries.find((entry) => entry?.repo === repositoryName);
  if (exemption) return { enforce: false, reason: exemption.reason, report: `exempt (${exemption.reason})` };
  if (pages && Object.hasOwn(pages, 'https_enforced') && typeof pages.https_enforced === 'boolean') {
    return { enforce: true, desired: pages.https_enforced };
  }
  return { enforce: false };
}

export function validateConfig(policy, inventory, selectedRepository) {
  if (policy.schema_version !== 1) throw new Error(`Unsupported policy schema version: ${policy.schema_version}`);
  validatePages(policy.pages);
  if (inventory.schema_version !== 1) throw new Error(`Unsupported inventory schema version: ${inventory.schema_version}`);
  if (typeof inventory.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(inventory.owner)) throw new Error('Inventory owner must be a GitHub account name.');
  if (!Array.isArray(inventory.repositories) || new Set(inventory.repositories).size !== inventory.repositories.length || !inventory.repositories.every((name) => typeof name === 'string' && (name === '.github' || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)))) throw new Error('Inventory must contain unique, valid GitHub repository names.');
  if (selectedRepository && !inventory.repositories.includes(selectedRepository)) throw new Error(`Repository is not declared for ${inventory.owner}: ${selectedRepository}`);
}

export function loadInventory(inventoryPath, cwd = process.cwd()) {
  const root = realpathSync(cwd);
  const resolved = realpathSync(path.resolve(root, inventoryPath));
  if (!resolved.startsWith(`${root}${path.sep}`) || path.extname(resolved) !== '.json') throw new Error('Inventory must be a JSON file inside the current working directory.');
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

export function usage() {
  return `Usage: node tools/github/repository-settings.mjs --inventory PATH [--repo NAME] [--apply [--apply-main-ruleset] [--apply-immutable-releases-when-unknown] [--apply-pages]]

Without --apply, only GET requests are made. Omit --repo to audit every declared
repository, or use it to audit one. --apply requires exactly one declared repo.
--apply updates general settings and immutable releases after verification.
--apply-main-ruleset additionally changes main protection; authorize that
access-control operation separately from ordinary policy application.
--apply-immutable-releases-when-unknown requests immutable releases even when
GitHub's read endpoint cannot verify state; the outcome remains unverified.
--apply-pages creates or corrects the GitHub Pages site so it builds from GitHub
Actions (policy pages.build_type), changing only its source. It does not write
pages.https_enforced. The organization command is documented relative to this
file at ../../docs/repository-operations.md. A repository in pages.https_enforced_exempt
is not an Enforce HTTPS failure and is reported as exempt (<reason>).
It needs the Pages repository permission.`;
}

function gh(method, endpoint, body) {
  const args = ['api', '--method', method, endpoint];
  if (body !== undefined) args.push('--input', '-');
  return execFileSync('gh', args, { input: body === undefined ? undefined : `${JSON.stringify(body)}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function graphql(query, variables) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(variables)) args.push('-F', `${name}=${value}`);
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
}

function statusFrom(error) {
  const detail = `${error.stderr ?? ''}\n${error.message ?? ''}`;
  const found = detail.match(/HTTP (\d{3})/);
  return found ? Number(found[1]) : undefined;
}

export function immutableStateFrom(get, endpoint) {
  try {
    const response = get(`${endpoint}/immutable-releases`);
    return response?.enabled === true ? 'enabled' : 'unknown';
  } catch (error) { return statusFrom(error) === 404 ? 'disabled' : 'unknown'; }
}

/**
 * Pages state for one repository: matches, drifted (another source), missing or inaccessible.
 *
 * GitHub answers 404 both when no site exists and when the caller cannot read Pages, so a 404
 * is a confirmed absence only when the repository itself reports has_pages: false. Any other
 * failure is inaccessible, never missing.
 */
export function pagesStateFrom(get, endpoint, repository, desired) {
  try {
    const site = get(`${endpoint}/pages`);
    const state = site?.build_type === desired.build_type ? 'matches' : 'drifted';
    return { state, buildType: site?.build_type, cname: site?.cname ?? null };
  } catch (error) {
    const status = statusFrom(error);
    if (status === 404 && repository?.has_pages === false) return { state: 'missing' };
    return { state: 'inaccessible', status: status ?? 'unknown' };
  }
}

const defaultApi = {
  get(endpoint) { return JSON.parse(gh('GET', endpoint)); },
  write(method, endpoint, body) { gh(method, endpoint, body); },
  immutableState(endpoint) { return immutableStateFrom(this.get.bind(this), endpoint); },
  graphqlRepository(owner, repository) {
    return graphql('query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { hasSponsorshipsEnabled } }', { owner, name: repository }).data.repository;
  }
};

function inspectRuleset(api, endpoint, desired) {
  const summary = api.get(`${endpoint}/rulesets`);
  const match = summary.find((ruleset) => ruleset.name === desired.name);
  if (!match) return { state: 'missing' };
  return { state: rulesetState(api.get(`${endpoint}/rulesets/${match.id}`), desired), id: match.id };
}

function applyPages(api, endpoint, repositoryName, desired, current) {
  if (current.state === 'matches') return { ...current, outcome: 'unchanged' };
  if (current.state === 'inaccessible') {
    throw new Error(`pages state is inaccessible (HTTP ${current.status}); nothing written`);
  }
  // POST creates the site; PUT changes only build_type, so a custom domain and
  // every other Pages setting stay as they are. https_enforced is never sent.
  // pagesHttpsEnforced tells the organization command to omit it as well when
  // the repository is exempt.
  const https = pagesHttpsEnforced({ pages: desired }, repositoryName);
  const body = { build_type: desired.build_type };
  if (https.report) delete body.https_enforced;
  if (current.state === 'missing') api.write('POST', `${endpoint}/pages`, body);
  else api.write('PUT', `${endpoint}/pages`, body);
  const after = pagesStateFrom(api.get.bind(api), endpoint, api.get(endpoint), desired);
  if (after.state !== 'matches') throw new Error(`pages verification failed: ${after.state}`);
  if (current.state === 'drifted' && after.cname !== current.cname) {
    throw new Error(`pages verification failed: custom domain changed from ${current.cname} to ${after.cname}`);
  }
  return { ...after, outcome: 'applied' };
}

function assertVerified(label, state) {
  if (state !== 'matches' && state !== 'enabled') throw new Error(`${label} verification failed: ${state}`);
}

export function run({ policy, inventory, flags, api = defaultApi, log = console.log }) {
  validateConfig(policy, inventory, flags.repository);
  const repositories = flags.repository ? [flags.repository] : inventory.repositories;
  const report = { repositories: [], failures: [] };
  for (const repository of repositories) {
    const endpoint = `repos/${inventory.owner}/${repository}`;
    const result = {
      repository, settings: [], settingsOutcome: 'unchanged', immutableReleases: 'unknown',
      sponsorships: [], immutableOutcome: 'unknown', mainRuleset: 'unknown', mainRulesetOutcome: 'not-requested',
      pages: policy.pages ? 'unknown' : 'not-managed', pagesOutcome: 'not-requested'
    };
    report.repositories.push(result);
    try {
      const actual = api.get(endpoint);
      result.settings = differences(actual, policy.repository);
      if (policy.graphql_repository) {
        const graphqlActual = api.graphqlRepository(inventory.owner, repository);
        result.sponsorships = differences(graphqlActual, policy.graphql_repository)
          .map((difference) => ({ ...difference, field: `graphql.${difference.field}` }));
      }
      result.immutableReleases = api.immutableState(endpoint);
      result.mainRuleset = inspectRuleset(api, endpoint, policy.main_ruleset).state;
      let pages;
      let https;
      if (policy.pages) {
        pages = pagesStateFrom(api.get.bind(api), endpoint, actual, policy.pages);
        result.pages = pages.state;
        https = pagesHttpsEnforced(policy, repository);
        if (https.report) result.pagesHttpsEnforced = https.report;
      }
      log(`${inventory.owner}/${repository}`);
      log(result.settings.length ? `  repository settings: ${result.settings.length} difference(s)` : '  repository settings: match');
      for (const item of result.settings) log(`  ${item.field}: ${JSON.stringify(item.actual)} -> ${JSON.stringify(item.desired)}`);
      log(result.sponsorships.length ? `  sponsorship settings: ${result.sponsorships.length} difference(s)` : '  sponsorship settings: match');
      for (const item of result.sponsorships) log(`  ${item.field}: ${JSON.stringify(item.actual)} -> ${JSON.stringify(item.desired)}`);
      log(`  immutable releases: ${result.immutableReleases}`);
      log(`  main ruleset: ${result.mainRuleset}`);
      if (pages) {
        const detail = pages.state === 'drifted' ? ` (source ${pages.buildType} -> ${policy.pages.build_type})`
          : pages.state === 'inaccessible' ? ` (HTTP ${pages.status}; not treated as missing)` : '';
        log(`  pages: ${pages.state}${detail}`);
      }
      if (https?.report) log(`  pages.https_enforced: ${https.report}`);
      if (!flags.apply) continue;
      if (result.settings.length) {
        api.write('PATCH', endpoint, policy.repository);
        const verification = differences(api.get(endpoint), policy.repository);
        if (verification.length) throw new Error(`repository settings verification failed: ${verification.map((item) => item.field).join(', ')}`);
        result.settings = [];
        result.settingsOutcome = 'applied';
      }
      if (result.sponsorships.length) throw new Error('sponsorship settings differ and require a separately authorized GraphQL update.');
      if (result.immutableReleases === 'disabled') {
        api.write('PUT', `${endpoint}/immutable-releases`);
        assertVerified('immutable releases', api.immutableState(endpoint));
        result.immutableReleases = 'enabled';
        result.immutableOutcome = 'applied';
      } else if (result.immutableReleases === 'enabled') {
        result.immutableOutcome = 'unchanged';
      } else if (flags.applyImmutableReleasesWhenUnknown) {
        api.write('PUT', `${endpoint}/immutable-releases`);
        // The endpoint can remain unreadable after a successful idempotent PUT.
        // Preserve unknown state rather than treating the write response as proof.
        result.immutableOutcome = 'applied-unverified';
      }
      if (flags.applyMainRuleset) {
        const ruleset = inspectRuleset(api, endpoint, policy.main_ruleset);
        if (ruleset.state === 'missing') api.write('POST', `${endpoint}/rulesets`, policy.main_ruleset);
        else if (ruleset.state === 'different') {
          const existing = api.get(`${endpoint}/rulesets/${ruleset.id}`);
          api.write('PUT', `${endpoint}/rulesets/${ruleset.id}`, updateRulesetPayload(existing, policy.main_ruleset));
        }
        assertVerified('main ruleset', inspectRuleset(api, endpoint, policy.main_ruleset).state);
        result.mainRuleset = 'matches';
        result.mainRulesetOutcome = ruleset.state === 'matches' ? 'unchanged' : 'applied';
      }
      if (flags.applyPages && pages) {
        const applied = applyPages(api, endpoint, repository, policy.pages, pages);
        result.pages = applied.state;
        result.pagesOutcome = applied.outcome;
      }
      log(`  outcome: settings=${result.settingsOutcome}; immutable-releases=${result.immutableOutcome}; main-ruleset=${result.mainRulesetOutcome}${pages ? `; pages=${result.pagesOutcome}` : ''}`);
    } catch (error) {
      const failure = { repository, error: error.message };
      report.failures.push(failure);
      log(`  ERROR: ${failure.error}`);
    }
  }
  return report;
}

export function reportDifferences(report) {
  return report.repositories.reduce((total, result) => total + result.settings.length + result.sponsorships.length + (result.immutableReleases === 'enabled' ? 0 : 1) + (result.mainRuleset === 'matches' ? 0 : 1) + (['matches', 'not-managed'].includes(result.pages) ? 0 : 1), 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const flags = parseArgs(process.argv.slice(2));
    if (flags.help) { console.log(usage()); process.exit(0); }
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const inventory = loadInventory(flags.inventoryPath);
    const report = run({ policy, inventory, flags });
    console.log(`\n${reportDifferences(report)} difference(s) found; ${report.failures.length} error(s).`);
    process.exit(report.failures.length ? 1 : 0);
  } catch (error) { console.error(error.message); process.exit(1); }
}
