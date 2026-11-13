// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pagesHttpsEnforced } from './pages-https.mjs';
import { redactSecrets } from './redact-secrets.mjs';

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
const lines = redactSecrets(readFileSync(auditFile, 'utf8')).split('\n');
const entries = new Map();
let repository;
for (const line of lines) {
  if (line.startsWith('Living-Proof-Labs/')) {
    repository = line.trim();
    entries.set(repository, { differences: new Map(), immutable: 'unknown', ruleset: 'unknown', pages: 'unknown', https: undefined });
  } else if (repository && line.startsWith('  pages.https_enforced: ')) {
    entries.get(repository).https = line.trim().slice('pages.https_enforced: '.length);
  } else if (repository && line.startsWith('  pages: ')) {
    entries.get(repository).pages = line.trim().slice('pages: '.length).split(' ')[0];
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
  const pagesName = `${repo} :: pages`;
  if (policy.pages) cases.push(state.pages === 'matches' ? `<testcase name="${escape(pagesName)}"/>` :
    ['missing', 'drifted'].includes(state.pages) ? `<testcase name="${escape(pagesName)}"><failure message="required Pages drift">${escape(state.pages)}</failure></testcase>` :
    `<testcase name="${escape(pagesName)}"><error message="Pages state unverified"/></testcase>`);
  const https = pagesHttpsEnforced(policy, repo.split('/').pop());
  const httpsName = `${repo} :: pages.https_enforced`;
  if (https.report) {
    cases.push(`<testcase name="${escape(httpsName)}"><system-out>${escape(https.report)}; not Enforce HTTPS drift</system-out></testcase>`);
  } else if (https.enforce) {
    if (/^(?:true|false) -> (?:true|false)$/.test(state.https ?? '')) {
      cases.push(`<testcase name="${escape(httpsName)}"><failure message="setting drift">actual ${escape(state.https)}; expected ${escape(JSON.stringify(https.desired))}</failure></testcase>`);
    } else if (state.pages === 'missing' || state.https === 'no Pages site') {
      cases.push(`<testcase name="${escape(httpsName)}"/>`);
    } else if (state.https === 'matches') {
      cases.push(`<testcase name="${escape(httpsName)}"/>`);
    } else {
      cases.push(`<testcase name="${escape(httpsName)}"><error message="unverified Enforce HTTPS">Pages site was not readable, so pages.https_enforced was not compared</error></testcase>`);
    }
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
