#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Classify a repository-settings audit and choose the wrapper's exit status.
 *
 * The pinned tool (collaboration-guidelines v7.10.0) counts every repository whose Pages
 * state is not `matches` as one difference, including repositories that have no Pages
 * site (`missing`) and ones whose Pages state the audit token cannot read
 * (`inaccessible`). Neither is drift this organization enforces: most repositories
 * publish no site, and the audit App is not granted Pages read. Both are subtracted from
 * the strict count and reported separately. A Pages site that exists with another source
 * (`drifted`) and every other difference still count.
 *
 * pages.https_enforced is compared for a repository that has a Pages site.
 * A missing site is not Enforce HTTPS drift. v7.10.0 exempts website in
 * pages.https_enforced_exempt, and that repository is not drift either.
 * A line `pages.https_enforced: unverified` means the value could not be read
 * (permission error, failed request, non-boolean field, or an inaccessible
 * Pages source). That is incomplete, not a pass and not drift. Incomplete
 * takes precedence over confirmed drift so the exit cannot hide missing
 * evidence; the difference count stays in the summary. Report mode, without
 * --fail-on-drift, keeps exit 0 and prints the same incomplete summary.
 *
 * Usage: audit-status.mjs AUDIT_OUTPUT [--fail-on-drift]
 * Exit: 0 compliant (or not strict), 2 drift, 3 incomplete (immutable state
 * unknown, or pages.https_enforced unreadable), 4 unrecognizable summary.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { redactSecrets } from './redact-secrets.mjs';

export function classify(text) {
  const summary = text.match(/^(\d+) difference\(s\) found; \d+ error\(s\)\.$/m);
  const lines = text.split('\n');
  const pagesNotEnforced = lines.filter((line) => /^ {2}pages: (missing|inaccessible)\b/.test(line)).length;
  const httpsDrift = lines.filter((line) => /^ {2}pages\.https_enforced: (?:true|false) -> (?:true|false)$/.test(line)).length;
  const httpsUnverified = lines.filter((line) => line === '  pages.https_enforced: unverified').length;
  return {
    recognized: Boolean(summary),
    differences: summary ? Number(summary[1]) : undefined,
    pagesNotEnforced,
    httpsDrift,
    httpsUnverified,
    enforced: summary ? Number(summary[1]) - pagesNotEnforced + httpsDrift : undefined,
    immutableUnknown: lines.some((line) => line.startsWith('  immutable releases: unknown'))
  };
}

function incompleteMessage(state) {
  const details = [`${state.enforced} difference(s)`];
  if (state.pagesNotEnforced) {
    details.push(`${state.pagesNotEnforced} Pages state(s) missing or unreadable, reported but not enforced`);
  }
  if (state.httpsUnverified) {
    details.push(`${state.httpsUnverified} pages.https_enforced value(s) unknown, not counted as drift`);
  }
  if (state.immutableUnknown) details.push('immutable release state unknown');
  return `Audit status: incomplete (${details.join('; ')}).`;
}

export function decide(text, failOnDrift) {
  const state = classify(text);
  if (!state.recognized) {
    return { status: 4, message: 'Audit did not return a recognizable summary; refusing to classify state.', stream: 'stderr' };
  }
  const note = state.pagesNotEnforced
    ? `; ${state.pagesNotEnforced} Pages state(s) missing or unreadable, reported but not enforced`
    : '';
  if (state.immutableUnknown || state.httpsUnverified > 0) {
    return { status: failOnDrift ? 3 : 0, message: incompleteMessage(state) };
  }
  if (state.enforced > 0) {
    return { status: failOnDrift ? 2 : 0, message: `Audit status: drift detected (${state.enforced} difference(s)${note}).` };
  }
  return { status: 0, message: `Audit status: compliant${note ? ` (${note.slice(2)})` : ''}.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, flag] = process.argv.slice(2);
  const result = decide(redactSecrets(readFileSync(file, 'utf8')), flag === '--fail-on-drift');
  const message = redactSecrets(result.message);
  (result.stream === 'stderr' ? console.error : console.log)(message);
  process.exit(result.status);
}
