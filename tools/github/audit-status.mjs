#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Classify a repository-settings audit and choose the wrapper's exit status.
 *
 * The pinned tool (collaboration-guidelines v7.9.0) counts every repository whose Pages
 * state is not `matches` as one difference, including repositories that have no Pages
 * site (`missing`) and ones whose Pages state the audit token cannot read
 * (`inaccessible`). Neither is drift this organization enforces: most repositories
 * publish no site, and the audit App is not granted Pages read. Both are subtracted from
 * the strict count and reported separately. A Pages site that exists with another source
 * (`drifted`) and every other difference still count.
 *
 * Usage: audit-status.mjs AUDIT_OUTPUT [--fail-on-drift]
 * Exit: 0 compliant (or not strict), 2 drift, 3 incomplete (immutable state unknown),
 * 4 unrecognizable summary.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

export function classify(text) {
  const summary = text.match(/^(\d+) difference\(s\) found; \d+ error\(s\)\.$/m);
  const lines = text.split('\n');
  const pagesNotEnforced = lines.filter((line) => /^ {2}pages: (missing|inaccessible)\b/.test(line)).length;
  return {
    recognized: Boolean(summary),
    differences: summary ? Number(summary[1]) : undefined,
    pagesNotEnforced,
    enforced: summary ? Number(summary[1]) - pagesNotEnforced : undefined,
    immutableUnknown: lines.some((line) => line.startsWith('  immutable releases: unknown'))
  };
}

export function decide(text, failOnDrift) {
  const state = classify(text);
  if (!state.recognized) {
    return { status: 4, message: 'Audit did not return a recognizable summary; refusing to classify state.', stream: 'stderr' };
  }
  const note = state.pagesNotEnforced
    ? `; ${state.pagesNotEnforced} Pages state(s) missing or unreadable, reported but not enforced`
    : '';
  if (state.immutableUnknown) {
    return { status: failOnDrift ? 3 : 0, message: `Audit status: incomplete (${state.enforced} difference(s)${note}; immutable release state unknown).` };
  }
  if (state.enforced > 0) {
    return { status: failOnDrift ? 2 : 0, message: `Audit status: drift detected (${state.enforced} difference(s)${note}).` };
  }
  return { status: 0, message: `Audit status: compliant${note ? ` (${note.slice(2)})` : ''}.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, flag] = process.argv.slice(2);
  const result = decide(readFileSync(file, 'utf8'), flag === '--fail-on-drift');
  (result.stream === 'stderr' ? console.error : console.log)(result.message);
  process.exit(result.status);
}
