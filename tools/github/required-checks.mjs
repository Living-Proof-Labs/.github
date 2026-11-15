// SPDX-License-Identifier: Apache-2.0
const fail = message => { throw new Error(message); };
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
        (trusted && !Number.isSafeInteger(check.integration_id))) fail('Required checks need unique contexts and trusted positive integration IDs; no write.');
    contexts.add(check.context);
  }
}
export function validateRequiredChecks(policy, inventory) {
  const map = policy.required_checks_by_repository;
  if (map === undefined) return;
  if (!policy.main_ruleset || !map || typeof map !== 'object' || Array.isArray(map)) fail('required_checks_by_repository requires an object and main_ruleset.');
  if (policy.main_ruleset.rules.some(r => r.type === 'required_status_checks')) fail('Use repository-specific required checks, not a global check name.');
  for (const [name, parameters] of Object.entries(map)) {
    if (!(name === '.github' || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) || (inventory && !inventory.repositories.includes(name))) fail('Required-check repository is not registered.');
    validateChecks(parameters, true);
    if (parameters.strict_required_status_checks_policy !== true || parameters.do_not_enforce_on_create !== false) fail('Managed required checks must be strict and enforced on creation.');
  }
}
export function repositoryRuleset(policy, name) {
  const desired = structuredClone(policy.main_ruleset);
  const checks = policy.required_checks_by_repository?.[name];
  if (checks) { validateChecks(checks, true); desired.rules.push({ type: 'required_status_checks', parameters: structuredClone(checks) }); }
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
