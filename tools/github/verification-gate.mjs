#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { pathToFileURL } from 'node:url';
export const verificationJobs = ['verify', 'docs-preview', 'repository-settings', 'trusted-repository-settings', 'app-bootstrap-tests', 'settings-scenarios'];
export function verifyResults(needs, event) {
  if (!['pull_request', 'merge_group', 'push', 'schedule', 'workflow_dispatch'].includes(event)) throw new Error('Unsupported verification event.');
  if (!needs || typeof needs !== 'object' || Array.isArray(needs) || Object.keys(needs).length !== verificationJobs.length || Object.keys(needs).some(k => !verificationJobs.includes(k))) throw new Error('Missing or unexpected verification job evidence.');
  for (const job of verificationJobs) {
    const prLike = event === 'pull_request' || event === 'merge_group';
    const expected = (job === 'trusted-repository-settings' && prLike) || (job === 'repository-settings' && !prLike) ? 'skipped' : 'success';
    if (needs[job]?.result !== expected) throw new Error(`Verification job ${job} must be ${expected}; observed ${needs[job]?.result ?? 'missing'}.`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { verifyResults(JSON.parse(process.env.VERIFICATION_NEEDS ?? ''), process.env.VERIFICATION_EVENT); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
