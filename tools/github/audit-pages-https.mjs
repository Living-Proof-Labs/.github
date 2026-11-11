#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Add pages.https_enforced lines to a strict repository-settings audit.
 * Reads GH_TOKEN only to GET an existing Pages site. The token is not printed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { annotateAudit, validatePages } from './pages-https.mjs';

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
  if (token === '') return { unverified: true };
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pages`, {
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
  if (!response.ok) return { unverified: true };
  try {
    const body = await response.json();
    if (typeof body?.https_enforced !== 'boolean') return { unverified: true };
    return { httpsEnforced: body.https_enforced };
  } catch {
    return { unverified: true };
  }
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
