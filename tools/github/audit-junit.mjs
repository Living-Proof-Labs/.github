// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [policyFile, auditFile, outputFile, manualEvidenceFile] = process.argv.slice(2);
const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
const manualEvidence = manualEvidenceFile
  ? JSON.parse(readFileSync(manualEvidenceFile, 'utf8'))
  : { observations: [] };
if (manualEvidence.schema_version !== undefined && manualEvidence.schema_version !== 1) {
  throw new Error('Unsupported manual settings evidence schema version.');
}
if (!Array.isArray(manualEvidence.observations)) {
  throw new Error('Manual settings evidence must contain an observations array.');
}
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
function manualObservation(repository, field) {
  for (const observation of manualEvidence.observations) {
    if (!Array.isArray(observation.repositories) || !observation.repositories.includes(repository)) continue;
    if (typeof observation.observed_at !== 'string') continue;
    if (observation.settings && Object.hasOwn(observation.settings, field)) return observation;
  }
  return undefined;
}
const cases = [];
for (const [repo, state] of entries) {
  for (const [field, expected] of Object.entries(policy.repository ?? {})) {
    const actual = state.differences.get(field);
    const name = `${repo} :: ${field}`;
    if (actual === undefined) cases.push(`<testcase name="${escape(name)}"/>`);
    else if (actual === 'undefined') cases.push(`<testcase name="${escape(name)}"><error message="administration field unavailable">expected ${escape(JSON.stringify(expected))}</error></testcase>`);
    else cases.push(`<testcase name="${escape(name)}"><failure message="setting drift">actual ${escape(actual)}; expected ${escape(JSON.stringify(expected))}</failure></testcase>`);
  }
  const immutable = `${repo} :: immutable releases`;
  cases.push(state.immutable === 'enabled' ? `<testcase name="${escape(immutable)}"/>` : `<testcase name="${escape(immutable)}"><error message="unverified immutable-release state">${escape(state.immutable)}</error></testcase>`);
  const ruleset = `${repo} :: main ruleset`;
  if (state.ruleset === 'matches') cases.push(`<testcase name="${escape(ruleset)}"/>`);
  else if (state.ruleset === 'unknown') cases.push(`<testcase name="${escape(ruleset)}"><error message="unverified main protection">bypass actors or another protected field was unavailable</error></testcase>`);
  else cases.push(`<testcase name="${escape(ruleset)}"><failure message="main protection drift">${escape(state.ruleset)}</failure></testcase>`);
  for (const [field, expected] of Object.entries(policy.graphql_repository ?? {})) {
    const actual = state.differences.get(`graphql.${field}`);
    const name = `${repo} :: graphql.${field}`;
    if (actual === undefined) cases.push(`<testcase name="${escape(name)}"/>`);
    else if (actual === 'undefined') cases.push(`<testcase name="${escape(name)}"><error message="GraphQL field unavailable">expected ${escape(JSON.stringify(expected))}</error></testcase>`);
    else cases.push(`<testcase name="${escape(name)}"><failure message="setting drift">actual ${escape(actual)}; expected ${escape(JSON.stringify(expected))}</failure></testcase>`);
  }
  for (const [field, expected] of Object.entries(policy.manual_or_unavailable_settings ?? {})) {
    const name = `${repo} :: manual ${field}`;
    const observation = manualObservation(repo, field);
    if (!observation) {
      cases.push(`<testcase name="${escape(`${name} [unverified]`)}"><skipped message="unverified manual setting">? Not exposed by the managed API; no dated manual evidence</skipped></testcase>`);
    } else if (observation.settings[field] !== expected) {
      cases.push(`<testcase name="${escape(`${name} [manual correction required]`)}"><skipped message="manual correction required">warning: observed ${escape(JSON.stringify(observation.settings[field]))} at ${escape(observation.observed_at)}; expected ${escape(JSON.stringify(expected))}; not exposed by the managed API</skipped></testcase>`);
    } else {
      cases.push(`<testcase name="${escape(`${name} [manual observation]`)}"><system-out>manually observed ${escape(JSON.stringify(expected))} at ${escape(observation.observed_at)}; not an automated API measurement</system-out></testcase>`);
    }
  }
}
const failures = cases.filter((value) => value.includes('<failure')).length;
const errors = cases.filter((value) => value.includes('<error')).length;
const skipped = cases.filter((value) => value.includes('<skipped')).length;
mkdirSync(path.dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="repository-settings" tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="${skipped}">\n${cases.join('\n')}\n</testsuite>\n`);
