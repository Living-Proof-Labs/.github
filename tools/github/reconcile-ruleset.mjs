// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual as equal } from 'node:util';

const booleans = ['dismiss_stale_reviews_on_push', 'require_code_owner_review', 'require_last_push_approval', 'required_review_thread_resolution'];
const methods = new Set(['merge', 'squash', 'rebase']);
const payloadKeys = ['name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules'];
const payload = value => Object.fromEntries(payloadKeys.map(key => [key, structuredClone(value[key])]));
const fail = message => { throw new Error(message); };
function validateRules(value) {
  if (!Array.isArray(value.rules) || value.rules.some(rule => !rule || typeof rule.type !== 'string') || new Set(value.rules.map(r => r.type)).size !== value.rules.length) fail('Ruleset rules are incomplete or duplicate; no write.');
}
export function strengthenRuleset(existing, desired) {
  if (desired?.target !== 'branch' || desired.enforcement !== 'active' || !equal(desired.bypass_actors, []) ||
      !equal(desired.conditions, { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } })) fail('Unsupported ruleset policy; no write.');
  validateRules(desired);
  if (desired.rules.some(rule => !['deletion', 'non_fast_forward', 'pull_request'].includes(rule.type))) fail('Unsupported managed rule type; no write.');
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
  if (!equal(existing.bypass_actors, [])) fail('Existing bypass actors are unreadable or require an explicit reviewed exception; no write.');
  const ref = existing.conditions?.ref_name;
  if (!equal(Object.keys(existing.conditions ?? {}), ['ref_name']) || !ref || !Array.isArray(ref.include) || !ref.include.length || ref.include.some(v => typeof v !== 'string') || !equal(ref.exclude, [])) fail('Existing branch exclusions or incomplete conditions require separate review; no write.');
  const next = payload(existing);
  next.enforcement = 'active';
  if (!ref.include.includes('~DEFAULT_BRANCH') && !ref.include.includes('~ALL')) next.conditions.ref_name.include.push('~DEFAULT_BRANCH');
  for (const rule of desired.rules) {
    const previous = next.rules.find(r => r.type === rule.type);
    if (!previous) { next.rules.push(structuredClone(rule)); continue; }
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

export async function rulesetPlan(api, inventory, name, policy) {
  if (!inventory.repositories.includes(name) || inventory.owner !== 'Living-Proof-Labs') fail('Ruleset target not registered.');
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
    before = { id: full.id, ...payload(full) };
  }
  const desired = strengthenRuleset(before, policy.main_ruleset);
  const write = before && equal(payload(before), desired) ? null : { method: before ? 'PUT' : 'POST', path: `${base}/rulesets${before ? `/${before.id}` : ''}`, body: desired };
  return { identity: { id: repo.id, full_name: repo.full_name, default_branch: repo.default_branch }, before, write };
}

export async function applyRuleset(api, inventory, name, policy, approved) {
  const current = await rulesetPlan(api, inventory, name, policy);
  if (!equal(current, approved)) fail('Ruleset action differs from reviewed preview; no ruleset write.');
  if (!current.write) return { status: 'compliant', after: current };
  // Recompute and compare directly before the security-sensitive action. Only
  // this registered repository's named, non-weakening action is permitted.
  if (!equal(await rulesetPlan(api, inventory, name, policy), current)) fail('Ruleset state changed before write; stopped.');
  const { method, path, body } = current.write;
  await api.write(method, path, body);
  const after = await rulesetPlan(api, inventory, name, policy);
  if (!equal(after.identity, current.identity) || after.write || !equal(payload(after.before ?? {}), body) || (current.before && after.before.id !== current.before.id)) fail('Ruleset readback failed; inspect fresh evidence before retry.');
  return { status: 'verified', action: current.write, after };
}
