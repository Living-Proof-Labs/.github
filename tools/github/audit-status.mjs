#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/** Required missing Pages is drift; inaccessible Pages is unverified, never compliant. */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { redactSecrets } from './redact-secrets.mjs';

export function classify(text) {
  const summary = text.match(/^(\d+) difference\(s\) found; \d+ error\(s\)\.$/m);
  const lines = text.split('\n');
  const pagesNotEnforced = lines.filter((line) => /^ {2}pages: inaccessible\b/.test(line)).length;
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
    details.push(`${state.pagesNotEnforced} Pages state(s) unreadable, not counted as drift`);
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
    ? `; ${state.pagesNotEnforced} Pages state(s) unreadable, not counted as drift`
    : '';
  if (state.immutableUnknown || state.httpsUnverified > 0 || state.pagesNotEnforced > 0) {
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
