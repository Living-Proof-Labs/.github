// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [policyFile, auditFile, outputFile] = process.argv.slice(2);
const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
const lines = readFileSync(auditFile, 'utf8').split('\n');
const entries = new Map();
let repository;
for (const line of lines) {
  if (line.startsWith('Living-Proof-Labs/')) {
    repository = line.trim();
    entries.set(repository, { differences: new Map(), immutable: 'unknown', ruleset: 'unknown' });
  } else if (repository && line.startsWith('  ') && line.includes(': ') && line.includes(' -> ')) {
    const [field, actual] = line.trim().split(': ', 2);
    entries.get(repository).differences.set(field, actual);
  } else if (repository && line.startsWith('  immutable releases: ')) entries.get(repository).immutable = line.trim().slice(20);
  else if (repository && line.startsWith('  main ruleset: ')) entries.get(repository).ruleset = line.trim().slice(14);
}
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const cases = [];
for (const [repo, state] of entries) {
  for (const [field, expected] of Object.entries(policy.repository)) {
    const actual = state.differences.get(field);
    const name = `${repo} :: ${field}`;
    if (actual === undefined) cases.push(`<testcase name="${escape(name)}"/>`);
    else if (actual === 'undefined') cases.push(`<testcase name="${escape(name)}"><error message="administration field unavailable">expected ${escape(JSON.stringify(expected))}</error></testcase>`);
    else cases.push(`<testcase name="${escape(name)}"><failure message="setting drift">actual ${escape(actual)}; expected ${escape(JSON.stringify(expected))}</failure></testcase>`);
  }
  const immutable = `${repo} :: immutable releases`;
  cases.push(state.immutable === 'enabled' ? `<testcase name="${escape(immutable)}"/>` : `<testcase name="${escape(immutable)}"><error message="unverified immutable-release state">${escape(state.immutable)}</error></testcase>`);
  const ruleset = `${repo} :: main ruleset`;
  cases.push(state.ruleset === 'matches' ? `<testcase name="${escape(ruleset)}"/>` : `<testcase name="${escape(ruleset)}"><failure message="main protection drift">${escape(state.ruleset)}</failure></testcase>`);
  for (const field of Object.keys(policy.manual_or_unavailable_settings ?? {})) {
    cases.push(`<testcase name="${escape(`${repo} :: manual ${field}`)}"><error message="manual verification required">not exposed by the managed API</error></testcase>`);
  }
}
const failures = cases.filter((value) => value.includes('<failure')).length;
const errors = cases.filter((value) => value.includes('<error')).length;
mkdirSync(path.dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="repository-settings" tests="${cases.length}" failures="${failures}" errors="${errors}">\n${cases.join('\n')}\n</testsuite>\n`);
