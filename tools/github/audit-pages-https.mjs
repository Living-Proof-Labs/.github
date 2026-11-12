#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Add pages.https_enforced lines to a strict repository-settings audit.
 * Reads GH_TOKEN only to GET an existing Pages site. The token is not printed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { annotateAudit, readHttpsEnforced, validatePages } from './pages-https.mjs';

const [policyFile, auditFile] = process.argv.slice(2);
if (!policyFile || !auditFile) {
  console.error('Usage: audit-pages-https.mjs POLICY_FILE AUDIT_FILE');
  process.exit(64);
}

const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
validatePages(policy.pages);
const original = readFileSync(auditFile, 'utf8');
const owner = original.match(/^([^/\s]+)\/[^/\s]+$/m)?.[1] ?? 'Living-Proof-Labs';
const token = typeof process.env.GH_TOKEN === 'string' ? process.env.GH_TOKEN : '';

async function readSite(repository) {
  return readHttpsEnforced(repository, { token, owner });
}

const annotated = await annotateAudit(original, policy, readSite);
writeFileSync(auditFile, annotated);
let repository;
for (const line of annotated.split('\n')) {
  if (!line.startsWith(' ') && /^[^/\s]+\/[^/\s]+$/.test(line)) repository = line;
  if (line.startsWith('  pages.https_enforced:') && !original.includes(line)) {
    console.log(`${repository}\n${line}`);
  }
}
