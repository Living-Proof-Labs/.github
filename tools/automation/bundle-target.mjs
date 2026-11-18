// SPDX-License-Identifier: Apache-2.0
// Local allowlist, not a second organization repository inventory. Each adapter
// requires review of its own generator, publisher, file/branch guards and queue.
import { pathToFileURL } from 'node:url';
import { githubRead } from '../github/audit-app-access.mjs';
export const target = 'Living-Proof-Labs/livingproof-verification';
export function authorize(repository, env) {
  if (repository !== target) throw new Error('No reviewed bundle adapter for target.');
  if (env.GITHUB_REPOSITORY !== 'Living-Proof-Labs/.github' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
      !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') ||
      env.GITHUB_WORKFLOW_REF !== `Living-Proof-Labs/.github/.github/workflows/bundle-completion.yml@refs/heads/main`)
    throw new Error('Bundle operations require the trusted main workflow.');
  return repository;
}
export async function verifyToken(repository, env, read) {
  authorize(repository, env);
  // This proves the effective token boundary, NOT complete installation membership.
  // Exactly one result needs no pagination. Missing/truncated evidence fails closed.
  const result = await read('/installation/repositories?per_page=100&page=1');
  if (result?.total_count !== 1 || result.repositories?.length !== 1 ||
      result.repositories[0].full_name !== repository)
    throw new Error('Token is not restricted to the one reviewed repository.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, repository, ...extra] = process.argv.slice(2);
    if (extra.length || !['authorize', 'verify-token'].includes(mode)) throw new Error('Use authorize|verify-token OWNER/REPO.');
    authorize(repository, process.env);
    if (mode === 'verify-token') {
      if (!process.env.GH_TOKEN) throw new Error('Missing job token.');
      await verifyToken(repository, process.env, endpoint => githubRead(endpoint, process.env.GH_TOKEN));
    }
  } catch { console.error('Bundle authorization refused; inspect trusted context, target and token scope.'); process.exitCode = 1; }
}
