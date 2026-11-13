#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { observe, planRepository, validatePolicy, fetchPinnedPolicy, createGitHubClient, requireToken, repositoryRoot, GitHubApiError } from './apply-repo-policy.mjs';
import { validateInventory } from './verify-inventory.mjs';
import { runPages } from './setup-pages.mjs';
import { rulesetPlan, applyRuleset, strengthenRuleset } from './reconcile-ruleset.mjs';
import { redactSecrets } from './redact-secrets.mjs';

export const help = `Usage: task github:settings:reconcile -- --dry-run --plan-output artifacts/settings-plan.json
       task github:settings:reconcile -- --apply --expected-plan artifacts/settings-plan.json

Reconcile EVERY registered repository using the pinned policy. No target or scope
checkboxes. Preview never writes. Apply requires the saved plan from this source
revision, inventory and policy; each repository is checked again before writes.
Known general settings, sponsorships, immutable releases and Pages (including
HTTPS) are reconciled. Website's policy HTTPS exemption remains unmanaged.
Unknown immutable state never authorizes a write. Rulesets are reconciled without weakening stronger existing protection.
Each security-sensitive action must match its saved preview and protected approval.
Failures and readback are reported for every repository; no rollback or automatic
retry of writes after partial failure. Post-write reads alone may retry three times
(1, 2, 4 seconds), only while the complete known pre-write snapshot persists.
Review a fresh preview to retry writes. GH_TOKEN is read
from the environment. --report-output FILE, --summary-output FILE and --junit FILE retain audit evidence;
--fail-on-drift makes a preview fail on changes as well as unresolved state.
`;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const implementationDigest = () => digest(['reconcile-inventory.mjs', 'reconcile-ruleset.mjs', 'apply-repo-policy.mjs', 'setup-pages.mjs', 'pages-https.mjs', 'verify-inventory.mjs', 'redact-secrets.mjs'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')));
const fields = new Set(['has_wiki', 'has_issues', 'has_discussions', 'has_projects', 'pull_request_creation_policy', 'allow_merge_commit', 'allow_squash_merge', 'allow_rebase_merge', 'merge_commit_title', 'merge_commit_message', 'allow_update_branch', 'allow_auto_merge', 'delete_branch_on_merge']);

export function validateConfiguration(inventory, policy) {
  validateInventory(inventory); validatePolicy(policy); strengthenRuleset(null, policy.main_ruleset);
  if (inventory.owner !== 'Living-Proof-Labs' || new Set(inventory.repositories.map(n => n.toLowerCase())).size !== inventory.repositories.length) throw new Error('Expected unique Living-Proof-Labs inventory.');
  for (const field of Object.keys(policy.repository)) if (!fields.has(field)) throw new Error(`Unsupported general setting: ${field}`);
  if (policy.immutable_releases !== true || policy.pages?.build_type !== 'workflow' || policy.pages?.https_enforced !== true) throw new Error('Policy must require immutable releases, workflow Pages and HTTPS; downgrades refused.');
  const seen = new Set();
  for (const entry of policy.pages.https_enforced_exempt ?? []) {
    const name = entry.repo.toLowerCase();
    if (!inventory.repositories.includes(entry.repo) || seen.has(name)) throw new Error('HTTPS exception must uniquely name an inventoried repository.');
    seen.add(name);
  }
}

// 404 is ambiguous for this administration endpoint. Unlike the legacy helper,
// never convert it to evidence that immutability is disabled.
async function settingsSnapshot(api, inventory, name, policy) {
  const scoped = { ...api, get: async resource => {
    try { return await api.get(resource); }
    catch (error) {
      if (resource.endsWith('/immutable-releases') && error.status === 404) throw new GitHubApiError(403, 'immutable state unverified (404)', 'GET', resource);
      throw error;
    }
  } };
  const state = await observe(scoped, inventory.owner, name, { ...policy, pages: undefined, main_ruleset: undefined });
  const repo = state.repository;
  if (!Number.isSafeInteger(repo?.id) || repo.full_name !== `${inventory.owner}/${name}` || repo.archived !== false || repo.disabled !== false || repo.visibility !== 'public' || typeof repo.default_branch !== 'string') throw new Error('Repository identity/public active state unverified; no writes.');
  state.repository = Object.fromEntries(['id', 'full_name', 'archived', 'disabled', 'visibility', 'default_branch', ...Object.keys(policy.repository)].filter(key => Object.hasOwn(repo, key)).map(key => [key, repo[key]]));
  return state;
}
function settingsPlan(policy, before, owner, name) {
  const planned = planRepository({ ...policy, pages: undefined, main_ruleset: undefined }, before, { owner, name });
  return planned;
}

// Retry reads only when the entire known pre-write snapshot persists. A different
// value, missing field, permission error or unrelated change is not propagation
// evidence. Keep the original snapshots for comparison; redact only at output.
const readbackDelays = [1000, 2000, 4000];
async function verifySettingsWrite({ api, inventory, name, policy, before, expected, setting, diagnostics, wait }) {
  const diagnostic = { setting, before: structuredClone(before), expected: structuredClone(expected), attempts: [], outcome: 'unverified' };
  diagnostics.push(diagnostic);
  const knownBefore = settingsPlan(policy, before, inventory.owner, name).failures.length === 0 &&
    Object.entries(policy.repository).every(([key, value]) => typeof before.repository[key] === typeof value) &&
    (!policy.graphql_repository || typeof before.sponsorship?.hasSponsorshipsEnabled === 'boolean');
  for (let attempt = 0; attempt <= readbackDelays.length; attempt++) {
    const observation = { attempt: attempt + 1, delay_ms: attempt ? readbackDelays[attempt - 1] : 0 };
    diagnostic.attempts.push(observation);
    try {
      if (observation.delay_ms) await wait(observation.delay_ms);
      observation.observed = await settingsSnapshot(api, inventory, name, policy);
    } catch (error) {
      observation.error = error.message;
      diagnostic.outcome = 'read-error';
      throw new Error('Settings readback failed (read error); see settingsReadbacks; remaining settings stopped.');
    }
    if (equal(observation.observed, expected)) {
      diagnostic.outcome = attempt ? 'converged' : 'matched';
      return;
    }
    if (!knownBefore || !equal(observation.observed, before)) {
      diagnostic.outcome = 'unexpected-state';
      break;
    }
    diagnostic.outcome = 'exhausted';
  }
  throw new Error(`Settings readback failed (${diagnostic.outcome}); see settingsReadbacks; remaining settings stopped.`);
}

// An independent transport boundary prevents a planner regression from reaching
// unreviewed rulesets, branch protection, domains, access grants or an unregistered target.
export async function writeSettings(api, inventory, name, policy, write) {
  if (!inventory.repositories.includes(name)) throw new Error('Unregistered write refused.');
  const base = `/repos/${inventory.owner}/${name}`;
  if (write.graphql) {
    if (write.setting !== 'graphql.hasSponsorshipsEnabled' ||
        !equal(Object.keys(write.graphql.variables).sort(), ['enabled', 'id']) ||
        write.graphql.variables.enabled !== policy.graphql_repository?.hasSponsorshipsEnabled ||
        typeof write.graphql.variables.id !== 'string' ||
        !/^mutation\(\$id: ID!, \$enabled: Boolean!\) \{\s+updateRepository\(input: \{repositoryId: \$id, hasSponsorshipsEnabled: \$enabled\}\) \{\s+repository \{ hasSponsorshipsEnabled \}\s+\}\s+\}$/.test(write.graphql.query)) throw new Error('GraphQL write refused.');
    return api.graphql(write.graphql.query, write.graphql.variables);
  }
  if (write.setting === 'repository' && write.method === 'PATCH' && write.path === base &&
      write.body && !Array.isArray(write.body) && Object.keys(write.body).length &&
      Object.entries(write.body).every(([key, value]) => fields.has(key) && Object.hasOwn(policy.repository, key) && equal(value, policy.repository[key]))) return api.write(write.method, write.path, write.body);
  if (write.setting === 'immutable_releases' && write.method === 'PUT' && write.path === `${base}/immutable-releases` && write.body === undefined && policy.immutable_releases === true) return api.write(write.method, write.path);
  throw new Error('Settings write refused.');
}

// Bind rulesets separately per action so an unavailable ruleset does not hide
// unrelated work. A newly visible ruleset never authorizes an unreviewed write.
function writablePlan(entry) {
  const value = structuredClone(entry);
  delete value.ruleset;
  delete value.rulesetError;
  return value;
}

export async function runInventory({ api, inventory, policy, revision, dryRun, expectedPlan, wait = sleep }) {
  validateConfiguration(inventory, policy);
  if (typeof dryRun !== 'boolean' || typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Boolean mode and exact source revision required.');
  const binding = { schema_version: 1, mode: 'inventory', revision, implementation: implementationDigest(), inventory: digest(inventory), policy: digest(policy), owner: inventory.owner };
  if (!dryRun && (!expectedPlan || !equal(Object.fromEntries(Object.keys(binding).map(key => [key, expectedPlan[key]])), binding) || !equal(expectedPlan.repositories?.map(r => r.name), inventory.repositories))) throw new Error('Saved plan source, policy or complete inventory changed; no writes.');
  const plan = { ...binding, repositories: [] };
  const results = [];
  for (const name of inventory.repositories) {
    const result = { name, status: 'unverified', changes: [], writes: [], settingsReadbacks: [], failures: [], after: {} };
    results.push(result);
    const entry = { name };
    plan.repositories.push(entry);
    const pagesArgs = { api, inventory, repo: name, policy, fullInventory: true };
    try {
      entry.before = await settingsSnapshot(api, inventory, name, policy);
      entry.settings = settingsPlan(policy, entry.before, inventory.owner, name);
    } catch (error) { entry.settingsError = error.message; }
    try { entry.pages = (await runPages({ ...pagesArgs, dryRun: true })).plan; }
    catch (error) { entry.pagesError = error.message; }
    try { entry.ruleset = await rulesetPlan(api, inventory, name, policy); }
    catch (error) { entry.rulesetError = error.message; }
    result.changes = structuredClone(entry.settings?.lines ?? []);
    result.ruleset = entry.ruleset ?? { error: entry.rulesetError };
    if (entry.ruleset?.write) result.changes.push({ setting: 'main_ruleset', current: entry.ruleset.before, desired: entry.ruleset.write.body });
    result.pages = entry.pages ?? { error: entry.pagesError };
    result.failures.push(...(entry.settings?.failures ?? []));
    for (const key of ['settingsError', 'pagesError', 'rulesetError']) if (entry[key]) result.failures.push({ setting: key, message: entry[key] });
    if (!dryRun && !equal(writablePlan(entry), writablePlan(expectedPlan.repositories.find(r => r.name === name)))) {
      result.status = 'unresolved';
      result.failures.push({ setting: 'plan', message: 'Repository changed since preview; no writes for this repository. Review a fresh plan.' });
      continue;
    }
    if (!dryRun) {
      let current = structuredClone(entry.before);
      try {
        for (const write of entry.settings?.writes ?? []) {
          if (!equal(await settingsSnapshot(api, inventory, name, policy), current)) throw new Error('State changed before write; remaining settings stopped.');
          const beforeWrite = structuredClone(current);
          // Execute only newly generated operations, never operations from the saved file.
          await writeSettings(api, inventory, name, policy, write);
          result.writes.push(write.setting);
          if (write.setting === 'repository') Object.assign(current.repository, write.body);
          else if (write.setting === 'immutable_releases') current.immutableReleases = { enabled: true };
          else if (write.setting === 'graphql.hasSponsorshipsEnabled') current.sponsorship.hasSponsorshipsEnabled = write.graphql.variables.enabled;
          else throw new Error('Unexpected write setting.');
          await verifySettingsWrite({ api, inventory, name, policy, before: beforeWrite, expected: current, setting: write.setting, diagnostics: result.settingsReadbacks, wait });
        }
      } catch (error) { result.failures.push({ setting: 'apply', message: error.message }); }
      if (entry.pages) {
        try { result.after.pages = await runPages({ ...pagesArgs, dryRun: false, expectedPlan: entry.pages }); }
        catch (error) { result.failures.push({ setting: 'pages', message: error.message }); }
      }
      if (entry.ruleset) {
        try { result.after.ruleset = await applyRuleset(api, inventory, name, policy, expectedPlan.repositories.find(r => r.name === name).ruleset); }
        catch (error) { result.failures.push({ setting: 'main_ruleset', message: error.message }); }
      }
      try {
        result.after.rulesetAudit = await rulesetPlan(api, inventory, name, policy);
        if (result.after.rulesetAudit.write) result.failures.push({ setting: 'main_ruleset.readback', message: 'Ruleset drift remains.' });
      } catch (error) { result.failures.push({ setting: 'main_ruleset.readback', message: error.message }); }
      // Always fresh readback, including after partial write/certificate failures.
      try {
        result.after.settings = settingsPlan(policy, await settingsSnapshot(api, inventory, name, policy), inventory.owner, name);
        if (result.after.settings.lines.length || result.after.settings.failures.length) result.failures.push({ setting: 'readback', message: 'Settings drift or unverified state remains; see after.settings.' });
      } catch (error) { result.failures.push({ setting: 'readback', message: error.message }); }
      try {
        result.after.pagesAudit = (await runPages({ ...pagesArgs, dryRun: true })).plan;
        const audit = result.after.pagesAudit;
        if (audit.setup || (audit.https === true && audit.before.site?.https_enforced !== true)) result.failures.push({ setting: 'pages.readback', message: 'Required Pages or HTTPS drift remains.' });
      }
      catch (error) { result.failures.push({ setting: 'pages.readback', message: error.message }); }
    }
    const pagesDrift = entry.pages && (entry.pages.setup || (entry.pages.https === true && entry.pages.before.site?.https_enforced !== true));
    result.status = result.failures.length ? 'unresolved' : dryRun && (result.changes.length || pagesDrift) ? 'planned' : dryRun ? 'compliant' : 'verified';
  }
  return { plan, dryRun, repositories: results, failures: results.filter(r => r.failures.length).length, manual: Object.keys(policy.manual_or_unavailable_settings ?? {}), protection: 'non-weakening reconciliation; each action bound to reviewed preview' };
}

export function summary(report) {
  const rows = report.repositories.map(r => `| ${r.name} | ${r.status} | ${r.changes.length} | ${r.pages?.setup ? 'setup + HTTPS policy' : r.pages?.https ?? 'unverified'} | ${r.failures.length} |`);
  return `## Repository settings ${report.dryRun ? 'preview' : 'readback'}\n\n${report.repositories.length} registered repositories; ${report.failures} unresolved. Review the JSON artifact for exact before/desired values, write outcomes and failures.\n\n| Repository | Outcome | General/protection differences | Pages | Errors |\n| --- | --- | ---: | --- | ---: |\n${rows.join('\n')}\n\nRulesets: non-weakening reconciliation with per-action plan checks. Manual settings are unverified by this controller: ${report.manual.join(', ')}. Artifacts retained 14 days.\n`;
}

export function junit(report) {
  const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
  const cases = report.repositories.map(r => `<testcase classname="inventory-reconciliation" name="${xml(r.name)}">${r.failures.length ? `<failure message="${xml(r.failures.map(f => `${f.setting}: ${f.message}`).join('; '))}"/>` : r.status === 'planned' ? '<skipped message="Preview changes not applied"/>' : ''}<system-out>${xml(JSON.stringify(r))}</system-out></testcase>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Inventory reconciliation" tests="${cases.length}" failures="${report.failures}" skipped="${report.repositories.filter(r => r.status === 'planned').length}">\n${cases.join('\n')}\n</testsuite>\n`;
}
export async function main(argv, { env = process.env, fetchImpl = globalThis.fetch, io = process } = {}) {
  try {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
      const key = argv[i];
      if (Object.hasOwn(options, key)) throw new Error('Duplicate option; run --help.');
      if (['--help', '--dry-run', '--apply', '--fail-on-drift'].includes(key)) options[key] = true;
      else if (['--plan-output', '--expected-plan', '--report-output', '--summary-output', '--junit'].includes(key) && argv[i + 1] && !argv[i + 1].startsWith('-')) options[key] = argv[++i];
      else throw new Error('Unknown option or missing value; run --help.');
    }
    if (options['--help']) { io.stdout.write(help); return 0; }
    const dryRun = Boolean(options['--dry-run']);
    if (dryRun === Boolean(options['--apply']) || (!dryRun && !options['--expected-plan']) || (dryRun && options['--expected-plan']) || (!dryRun && options['--plan-output'])) throw new Error('Preview or apply with a saved plan required; run --help.');
    const root = repositoryRoot();
    const read = file => JSON.parse(readFileSync(file, 'utf8'));
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const token = requireToken(env);
    const report = await runInventory({ api: createGitHubClient({ token, fetchImpl, allowWrites: !dryRun }), inventory: read(path.join(root, 'config/github/repositories.json')), policy: await fetchPinnedPolicy(read(path.join(root, 'config/github/repository-policy.json')), fetchImpl), revision, dryRun, expectedPlan: options['--expected-plan'] ? read(options['--expected-plan']) : undefined });
    const save = (file, text) => { if (file) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, redactSecrets(text, token)); } };
    save(options['--plan-output'], JSON.stringify(report.plan, null, 2) + '\n');
    save(options['--report-output'], JSON.stringify(report, null, 2) + '\n');
    save(options['--junit'], junit(report));
    save(options['--summary-output'], summary(report));
    io.stdout.write(redactSecrets(JSON.stringify(report, null, 2), token) + '\n');
    return report.failures || (options['--fail-on-drift'] && report.repositories.some(r => r.status === 'planned')) ? 1 : 0;
  } catch (error) { io.stderr.write(redactSecrets(error.message, env.GH_TOKEN ?? '') + '\n'); return 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
