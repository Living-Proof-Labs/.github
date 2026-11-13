// SPDX-License-Identifier: Apache-2.0
/**
 * Enforce HTTPS (pages.https_enforced) for the strict audit and for apply.
 *
 * the local repository policy sets pages.https_enforced and exempts
 * website, which is served through Cloudflare:
 * [{ "repo": "website", "reason": "HTTPS terminated at Cloudflare" }].
 * The exemption list must be non-empty, and only when https_enforced is true.
 */
const PAGE_KEYS = new Set(['build_type', 'https_enforced', 'https_enforced_exempt']);

function isRepositoryName(name) {
  return typeof name === 'string' && (name === '.github' || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name));
}

export function validatePages(pages) {
  if (pages === undefined) return;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) throw new Error('policy.pages must be an object.');
  for (const key of Object.keys(pages)) {
    if (!PAGE_KEYS.has(key)) throw new Error(`policy.pages.${key} is not supported; refusing to ignore it.`);
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
  if (pages.https_enforced !== true) {
    throw new Error('policy.pages.https_enforced_exempt requires pages.https_enforced to be true.');
  }
  const seen = new Set();
  entries.forEach((entry, index) => {
    const at = `policy.pages.https_enforced_exempt[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${at} must be an object with repo and reason.`);
    }
    for (const key of Object.keys(entry)) {
      if (key !== 'repo' && key !== 'reason') throw new Error(`${at}.${key} is not supported.`);
    }
    if (!isRepositoryName(entry.repo)) throw new Error(`${at}.repo must be a non-empty repository name.`);
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      throw new Error(`${at}.reason must be a non-empty string.`);
    }
    if (seen.has(entry.repo)) throw new Error(`${at}.repo duplicates ${entry.repo}.`);
    seen.add(entry.repo);
  });
}

/**
 * How pages.https_enforced applies to one repository.
 * An exempt repository is not drift and must not be written.
 * Otherwise the boolean is enforced only when the policy sets it.
 * A repository with no Pages site is not decided here; callers tolerate that.
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

/**
 * Read pages.https_enforced for a repository whose Pages site the audit already
 * saw. No token, a failed request, a non-OK response, or a non-boolean
 * https_enforced is unverified. The token is not included in the result.
 * A missing site is not decided here.
 */
export async function readHttpsEnforced(repository, { token = '', owner, fetchImpl = globalThis.fetch } = {}) {
  if (token === '') return { unverified: true };
  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pages`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'living-proof-labs-repository-settings',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
  } catch {
    return { unverified: true };
  }
  if (!response?.ok) return { unverified: true };
  try {
    const body = await response.json();
    if (typeof body?.https_enforced !== 'boolean') return { unverified: true };
    return { httpsEnforced: body.https_enforced };
  } catch {
    return { unverified: true };
  }
}

function httpsLine(state, decision, observed) {
  if (decision.report) return `  pages.https_enforced: ${decision.report}`;
  if (!decision.enforce) return undefined;
  if (state === 'missing') return '  pages.https_enforced: no Pages site';
  if (state !== 'matches' && state !== 'drifted') return '  pages.https_enforced: unverified';
  if (!observed || observed.unverified || typeof observed.httpsEnforced !== 'boolean') {
    return '  pages.https_enforced: unverified';
  }
  if (observed.httpsEnforced === decision.desired) return '  pages.https_enforced: matches';
  return `  pages.https_enforced: ${observed.httpsEnforced} -> ${decision.desired}`;
}

/**
 * Insert one pages.https_enforced line under each audited repository.
 * readSite is called only for a repository that has a Pages site and is not exempt.
 */
export async function annotateAudit(text, policy, readSite) {
  const lines = String(text).split('\n');
  const already = new Set();
  let seen;
  for (const line of lines) {
    if (!line.startsWith(' ') && /^[^/\s]+\/[^/\s]+$/.test(line)) seen = line.split('/')[1];
    else if (seen && line.startsWith('  pages.https_enforced:')) already.add(seen);
  }
  const output = [];
  let repository;
  for (const line of lines) {
    output.push(line);
    if (!line.startsWith(' ') && /^[^/\s]+\/[^/\s]+$/.test(line)) {
      repository = line.split('/')[1];
      continue;
    }
    if (!repository || already.has(repository) || !line.startsWith('  pages: ')) continue;
    const state = line.trim().slice('pages: '.length).split(' ')[0];
    const decision = pagesHttpsEnforced(policy, repository);
    let observed;
    if (decision.enforce && (state === 'matches' || state === 'drifted')) {
      try {
        observed = await readSite(repository);
      } catch {
        observed = { unverified: true };
      }
    }
    const annotation = httpsLine(state, decision, observed);
    if (annotation) output.push(annotation);
  }
  return output.join('\n');
}
