// SPDX-License-Identifier: Apache-2.0
const fail = message => { throw new Error(message); };
const MERGE_QUEUE_KEYS = ['check_response_timeout_minutes', 'grouping_strategy', 'max_entries_to_build', 'max_entries_to_merge', 'merge_method', 'min_entries_to_merge', 'min_entries_to_merge_wait_minutes'];
const registeredName = (name, inventory, kind) => {
  if (!(name === '.github' || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) || (inventory && !inventory.repositories.includes(name))) fail(`${kind} repository is not registered.`);
};
export function validateChecks(parameters, trusted = false) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) ||
      Object.keys(parameters).some(k => !['required_status_checks', 'strict_required_status_checks_policy', 'do_not_enforce_on_create'].includes(k)) ||
      typeof parameters.strict_required_status_checks_policy !== 'boolean' ||
      (parameters.do_not_enforce_on_create !== undefined && typeof parameters.do_not_enforce_on_create !== 'boolean') ||
      !Array.isArray(parameters.required_status_checks) || !parameters.required_status_checks.length) fail('Required-check parameters are incomplete or unsupported; no write.');
  const contexts = new Set();
  for (const check of parameters.required_status_checks) {
    if (!check || Object.keys(check).some(k => !['context', 'integration_id'].includes(k)) ||
        typeof check.context !== 'string' || !check.context.trim() || check.context !== check.context.trim() || /[\r\n]/.test(check.context) || contexts.has(check.context) ||
        (check.integration_id != null && (!Number.isSafeInteger(check.integration_id) || check.integration_id <= 0)) ||
        (trusted && check.integration_id !== 15368)) fail('Required checks need unique contexts and valid sources; managed checks require GitHub Actions app 15368; no write.');
    contexts.add(check.context);
  }
}
export function validateMergeQueue(parameters) {
  const intOk = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) ||
      MERGE_QUEUE_KEYS.some(k => !(k in parameters)) || Object.keys(parameters).some(k => !MERGE_QUEUE_KEYS.includes(k)) ||
      !intOk(parameters.check_response_timeout_minutes, 1, 360) ||
      !['ALLGREEN', 'HEADGREEN'].includes(parameters.grouping_strategy) ||
      !intOk(parameters.max_entries_to_build, 0, 100) ||
      !intOk(parameters.max_entries_to_merge, 0, 100) ||
      !['MERGE', 'SQUASH', 'REBASE'].includes(parameters.merge_method) ||
      !intOk(parameters.min_entries_to_merge, 0, 100) ||
      !intOk(parameters.min_entries_to_merge_wait_minutes, 0, 360)) fail('Merge-queue parameters are incomplete or unsupported; no write.');
}
export function validateRequiredChecks(policy, inventory) {
  const map = policy.required_checks_by_repository;
  const queues = policy.merge_queue_by_repository;
  if (map === undefined && queues === undefined) return;
  if (!policy.main_ruleset) fail('required_checks_by_repository and merge_queue_by_repository require main_ruleset.');
  if (map !== undefined) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) fail('required_checks_by_repository requires an object and main_ruleset.');
    if (policy.main_ruleset.rules.some(r => r.type === 'required_status_checks')) fail('Use repository-specific required checks, not a global check name.');
    for (const [name, parameters] of Object.entries(map)) {
      registeredName(name, inventory, 'Required-check');
      validateChecks(parameters, true);
      if (queues?.[name]) {
        if (parameters.do_not_enforce_on_create !== false) fail('Managed required checks with a merge queue must be enforced on creation.');
      } else if (parameters.strict_required_status_checks_policy !== true || parameters.do_not_enforce_on_create !== false) fail('Managed required checks must be strict and enforced on creation.');
    }
  }
  if (queues !== undefined) {
    if (!queues || typeof queues !== 'object' || Array.isArray(queues)) fail('merge_queue_by_repository requires an object and main_ruleset.');
    if (policy.main_ruleset.rules.some(r => r.type === 'merge_queue')) fail('Use repository-specific merge queues, not a global merge_queue rule.');
    for (const [name, parameters] of Object.entries(queues)) {
      registeredName(name, inventory, 'Merge-queue');
      validateMergeQueue(parameters);
      if (parameters.merge_method !== 'MERGE') fail('Managed merge queues must use merge commits.');
    }
  }
}
export function repositoryRuleset(policy, name) {
  const desired = structuredClone(policy.main_ruleset);
  const checks = policy.required_checks_by_repository?.[name];
  if (checks) { validateChecks(checks, true); desired.rules.push({ type: 'required_status_checks', parameters: structuredClone(checks) }); }
  const queue = policy.merge_queue_by_repository?.[name];
  if (queue) { validateMergeQueue(queue); desired.rules.push({ type: 'merge_queue', parameters: structuredClone(queue) }); }
  return desired;
}
export function strengthenChecks(previous, desired) {
  validateChecks(previous); validateChecks(desired, true);
  const next = structuredClone(previous);
  next.strict_required_status_checks_policy ||= desired.strict_required_status_checks_policy;
  next.do_not_enforce_on_create = (previous.do_not_enforce_on_create ?? false) && (desired.do_not_enforce_on_create ?? false);
  for (const check of desired.required_status_checks) {
    const old = next.required_status_checks.find(c => c.context === check.context);
    if (!old) next.required_status_checks.push(structuredClone(check));
    else if (old.integration_id == null) old.integration_id = check.integration_id;
    else if (old.integration_id !== check.integration_id) fail('Required-check source conflicts with existing protection; separate review required.');
  }
  return next;
}
export function strengthenMergeQueue(previous, desired) {
  validateMergeQueue(previous); validateMergeQueue(desired);
  if (previous.merge_method !== desired.merge_method) fail('Merge-queue method conflicts with existing protection; separate review required.');
  const next = structuredClone(previous);
  next.check_response_timeout_minutes = Math.max(previous.check_response_timeout_minutes, desired.check_response_timeout_minutes);
  next.grouping_strategy = previous.grouping_strategy === 'ALLGREEN' || desired.grouping_strategy === 'ALLGREEN' ? 'ALLGREEN' : 'HEADGREEN';
  next.max_entries_to_build = Math.max(previous.max_entries_to_build, desired.max_entries_to_build);
  next.max_entries_to_merge = Math.max(previous.max_entries_to_merge, desired.max_entries_to_merge);
  next.min_entries_to_merge = Math.max(previous.min_entries_to_merge, desired.min_entries_to_merge);
  next.min_entries_to_merge_wait_minutes = Math.max(previous.min_entries_to_merge_wait_minutes, desired.min_entries_to_merge_wait_minutes);
  return next;
}
