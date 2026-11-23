// SPDX-License-Identifier: Apache-2.0
import { repositoryRuleset, validateRequiredChecks, strengthenChecks, strengthenMergeQueue, validateChecks, validateMergeQueue } from './required-checks.mjs';
import { isDeepStrictEqual as equal } from 'node:util';

const booleans = ['dismiss_stale_reviews_on_push', 'require_code_owner_review', 'require_last_push_approval', 'required_review_thread_resolution'];
const methods = new Set(['merge', 'squash', 'rebase']);
const payloadKeys = ['name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules'];
const payload = value => Object.fromEntries(payloadKeys.map(key => [key, structuredClone(value[key])]));
const fail = message => { throw new Error(message); };
// The proven cause is the echoed defaults. GitHub's ruleset create response adds
// these pull-request parameters when the request omits them. Observed after POST
// on livingproof-health (run 45007455420) and verification-reports-action
// (run 45262504725). bypass_actors was [] on both sides of those failures.
const echoedPullRequestDefaults = {
  required_reviewers: [],
  dismissal_restriction: { enabled: false, allowed_actors: [] },
  require_extra_approval_for_unattributed_changes: true,
};
// Re-read only when the ruleset is not visible yet or GitHub returns 5xx.
// A stable mismatch, including the echoed defaults above, is not retried.
export const rulesetReadbackDelays = [1000, 2000, 4000];
const waitFor = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function snapshotPayload(value) {
  return Object.fromEntries(payloadKeys.map(key => [key, Object.hasOwn(value, key) ? structuredClone(value[key]) : null]));
}
function withoutEchoedPullRequestDefaults(observed, written) {
  const copy = structuredClone(observed);
  const sent = (written?.rules ?? []).find(rule => rule?.type === 'pull_request')?.parameters ?? {};
  for (const rule of copy.rules ?? []) {
    if (rule?.type !== 'pull_request' || !rule.parameters || typeof rule.parameters !== 'object' || Array.isArray(rule.parameters)) continue;
    for (const [key, fallback] of Object.entries(echoedPullRequestDefaults)) {
      if (!Object.hasOwn(sent, key) && equal(rule.parameters[key], fallback)) delete rule.parameters[key];
    }
  }
  return copy;
}
function readbackComparable(observed, written) {
  const source = Object.fromEntries(payloadKeys.map(key => [key, observed[key]]));
  // Null or absent bypass_actors means the App cannot read them. That is unreadable, not a mismatch.
  // A readable array that differs from the written body still fails.
  if (!Array.isArray(source.bypass_actors)) source.bypass_actors = written.bypass_actors;
  return withoutEchoedPullRequestDefaults(source, written);
}
function retryableReadbackStatus(error) {
  const status = Number(error?.status);
  return status === 404 || (status >= 500 && status <= 599);
}
function rulesetDiff(actual, expected, path = '') {
  if (equal(actual, expected)) return [];
  const objectLike = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (objectLike(actual) && objectLike(expected)) {
    return [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort().flatMap(key => rulesetDiff(actual[key], expected[key], path ? `${path}.${key}` : key));
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return Array.from({ length: Math.max(actual.length, expected.length) }, (_, index) => rulesetDiff(actual[index], expected[index], `${path}[${index}]`)).flat();
  }
  return [`${path || '$'}: read ${JSON.stringify(actual)} != written ${JSON.stringify(expected)}`];
}
function validateRules(value) {
  if (!Array.isArray(value.rules) || value.rules.some(rule => !rule || typeof rule.type !== 'string') || new Set(value.rules.map(r => r.type)).size !== value.rules.length) fail('Ruleset rules are incomplete or duplicate; no write.');
}
export function strengthenRuleset(existing, desired) {
  if (desired?.target !== 'branch' || desired.enforcement !== 'active' || !equal(desired.bypass_actors, []) ||
      !equal(desired.conditions, { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } })) fail('Unsupported ruleset policy; no write.');
  validateRules(desired);
  if (desired.rules.some(rule => !['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks', 'merge_queue'].includes(rule.type))) fail('Unsupported managed rule type; no write.');
  for (const rule of desired.rules) {
    if (rule.type === 'required_status_checks') validateChecks(rule.parameters, true);
    if (rule.type === 'merge_queue') validateMergeQueue(rule.parameters);
  }
  const desiredPr = desired.rules.find(rule => rule.type === 'pull_request')?.parameters;
  if (!desiredPr || Object.keys(desiredPr).some(key => ![...booleans, 'required_approving_review_count', 'allowed_merge_methods'].includes(key))) fail('Unsupported pull-request policy parameters.');
  const validatePr = p => {
    if (!Number.isSafeInteger(p?.required_approving_review_count) || p.required_approving_review_count < 0 || booleans.some(key => typeof p[key] !== 'boolean') ||
        !Array.isArray(p.allowed_merge_methods) || !p.allowed_merge_methods.length || p.allowed_merge_methods.some(m => !methods.has(m))) fail('Pull-request protection is incomplete; no write.');
  };
  validatePr(desiredPr);
  if (!existing) return payload(desired);
  validateRules(existing);
  if (existing.name !== desired.name || existing.target !== 'branch' || !['active', 'disabled', 'evaluate'].includes(existing.enforcement)) fail('Ruleset target or identity is incompatible; no write.');
  if (!Array.isArray(existing.bypass_actors)) fail('Ruleset bypass actors are unreadable, not known to exist. GitHub requires write-level ruleset access to disclose them; no write.');
  if (existing.bypass_actors.length) fail('Existing bypass actors require an explicit reviewed exception; no write.');
  const ref = existing.conditions?.ref_name;
  if (!equal(Object.keys(existing.conditions ?? {}), ['ref_name']) || !ref || !Array.isArray(ref.include) || !ref.include.length || ref.include.some(v => typeof v !== 'string') || !equal(ref.exclude, [])) fail('Existing branch exclusions or incomplete conditions require separate review; no write.');
  const next = payload(existing);
  next.enforcement = 'active';
  if (!ref.include.includes('~DEFAULT_BRANCH') && !ref.include.includes('~ALL')) next.conditions.ref_name.include.push('~DEFAULT_BRANCH');
  for (const rule of desired.rules) {
    const previous = next.rules.find(r => r.type === rule.type);
    if (!previous) { next.rules.push(structuredClone(rule)); continue; }
    if (rule.type === 'required_status_checks') {
      previous.parameters = strengthenChecks(previous.parameters, rule.parameters);
      continue;
    }
    if (rule.type === 'merge_queue') { previous.parameters = strengthenMergeQueue(previous.parameters, rule.parameters); continue; }
    if (rule.type !== 'pull_request') continue;
    validatePr(previous.parameters);
    const p = previous.parameters;
    p.required_approving_review_count = Math.max(p.required_approving_review_count, desiredPr.required_approving_review_count);
    for (const key of booleans) p[key] ||= desiredPr[key];
    p.allowed_merge_methods = p.allowed_merge_methods.filter(method => desiredPr.allowed_merge_methods.includes(method));
    if (!p.allowed_merge_methods.length) fail('No compatible merge method; preserving existing protection requires separate review.');
  }
  return next;
}

export async function rulesetPlan(api, inventory, name, policy, options = {}) {
  if (!inventory.repositories.includes(name) || inventory.owner !== 'Living-Proof-Labs') fail('Ruleset target not registered.');
  validateRequiredChecks(policy, inventory);
  const desiredPolicy = repositoryRuleset(policy, name);
  const base = `/repos/${inventory.owner}/${name}`;
  const repo = await api.get(base);
  if (!Number.isSafeInteger(repo?.id) || repo.full_name !== `${inventory.owner}/${name}` || repo.archived !== false || repo.disabled !== false || repo.visibility !== 'public' || typeof repo.default_branch !== 'string') fail('Ruleset repository identity/state is unverified.');
  const matches = [];
  for (let page = 1; ; page++) {
    if (page > 1000) fail('Ruleset pagination did not finish; no write.');
    const list = await api.get(`${base}/rulesets?per_page=100&page=${page}&includes_parents=true`);
    if (!Array.isArray(list) || list.some(item => !item || typeof item.name !== 'string' || !Number.isSafeInteger(item.id))) fail('Ruleset inventory incomplete; no write.');
    matches.push(...list.filter(item => item.name === policy.main_ruleset.name));
    if (list.length < 100) break;
  }
  if (matches.length > 1) fail('Multiple rulesets match the managed name; no write.');
  let before = null;
  if (matches.length) {
    const item = matches[0];
    if (item.source_type !== 'Repository' || item.source !== repo.full_name) fail('Inherited or unverified ruleset ownership; no write.');
    const full = await api.get(`${base}/rulesets/${item.id}`);
    if (full?.id !== item.id || full.source_type !== 'Repository' || full.source !== repo.full_name || full.name !== item.name) fail('Ruleset identity changed; no write.');
    before = { id: full.id, ...(options.readback ? snapshotPayload(full) : payload(full)) };
  }
  // Readback compares the body itself. Planning still refuses an unreadable bypass list before any write.
  if (options.readback) return { identity: { id: repo.id, full_name: repo.full_name, default_branch: repo.default_branch }, before, write: null };
  const desired = strengthenRuleset(before, desiredPolicy);
  const write = before && equal(payload(before), desired) ? null : { method: before ? 'PUT' : 'POST', path: `${base}/rulesets${before ? `/${before.id}` : ''}`, body: desired };
  return { identity: { id: repo.id, full_name: repo.full_name, default_branch: repo.default_branch }, before, write };
}

export async function applyRuleset(api, inventory, name, policy, approved, { wait = waitFor, log = console.error } = {}) {
  const current = await rulesetPlan(api, inventory, name, policy);
  if (!equal(current, approved)) fail('Ruleset action differs from reviewed preview; no ruleset write.');
  if (!current.write) return { status: 'compliant', after: current };
  // Recompute and compare directly before the security-sensitive action. Only
  // this registered repository's named, non-weakening action is permitted.
  if (!equal(await rulesetPlan(api, inventory, name, policy), current)) fail('Ruleset state changed before write; stopped.');
  const { method, path, body } = current.write;
  await api.write(method, path, body);
  const attempts = rulesetReadbackDelays.length + 1;
  let retryNote = 'could not find the ruleset yet';
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) {
      const delay = rulesetReadbackDelays[attempt - 1];
      log(`Ruleset readback attempt ${attempt} ${retryNote}; retrying in ${delay}ms.`);
      await wait(delay);
    }
    let after;
    try {
      after = await rulesetPlan(api, inventory, name, policy, { readback: true });
    } catch (error) {
      if (!retryableReadbackStatus(error)) throw error;
      const status = Number(error.status);
      if (attempt === attempts - 1) {
        if (status >= 500 && status <= 599) fail(`Ruleset readback failed; HTTP 5xx (status ${status}) after ${attempts} attempts.`);
        fail(`Ruleset readback failed; ruleset was not found after ${attempts} attempts.`);
      }
      retryNote = status >= 500 ? `got HTTP ${status}` : 'could not find the ruleset yet';
      continue;
    }
    if (!after.before) {
      if (attempt === attempts - 1) fail(`Ruleset readback failed; ruleset was not found after ${attempts} attempts.`);
      retryNote = 'could not find the ruleset yet';
      continue;
    }
    // Found. The proven cause is the echoed defaults, compared here without another wait.
    const comparable = readbackComparable(after.before, body);
    const sameIdentity = equal(after.identity, current.identity);
    const sameId = !current.before || after.before.id === current.before.id;
    const sameBody = equal(comparable, body);
    if (!sameIdentity || !sameBody || !sameId) {
      const details = [];
      if (!sameIdentity) details.push(`Identity read ${JSON.stringify(after.identity)} != ${JSON.stringify(current.identity)}.`);
      if (!sameId) details.push(`Ruleset id read ${JSON.stringify(after.before.id)} != ${JSON.stringify(current.before?.id)}.`);
      const diff = rulesetDiff(comparable, body);
      if (diff.length) details.push(`Diff: ${diff.join('; ')}.`);
      fail(`Ruleset readback failed; inspect fresh evidence before retry.${details.length ? ` ${details.join(' ')}` : ''}`);
    }
    return { status: 'verified', action: current.write, after };
  }
  fail(`Ruleset readback failed; ruleset was not found after ${attempts} attempts.`);
}
