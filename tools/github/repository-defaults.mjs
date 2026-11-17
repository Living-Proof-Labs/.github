// SPDX-License-Identifier: Apache-2.0
/** Narrow, reasoned exceptions to the organization-wide Discussions default. */
export function validateDiscussionExceptions(policy, inventory) {
  const entries = policy.discussions_enabled_exceptions;
  if (entries === undefined) return;
  if (!Array.isArray(entries) || !entries.length) throw new Error('policy.discussions_enabled_exceptions must be a non-empty array.');
  if (policy.repository?.has_discussions !== false) throw new Error('Discussions exceptions require repository.has_discussions: false.');
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['repo', 'reason'].includes(key))) throw new Error('Discussions exception must contain only repo and reason.');
    if (typeof entry.repo !== 'string' || !/^(?:\.github|[A-Za-z0-9][A-Za-z0-9_.-]*)$/.test(entry.repo)) throw new Error('Discussions exception requires a repository name.');
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) throw new Error('Discussions exception requires a reason.');
    if (seen.has(entry.repo.toLowerCase())) throw new Error('Duplicate Discussions exception.');
    if (inventory && !inventory.repositories.includes(entry.repo)) throw new Error('Discussions exception must name an inventoried repository.');
    seen.add(entry.repo.toLowerCase());
  }
}

export function repositoryDefaults(policy, name) {
  const desired = { ...policy.repository };
  if (policy.discussions_enabled_exceptions?.some(entry => entry.repo === name)) desired.has_discussions = true;
  return desired;
}
