// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Keep orchestration here; the pinned helper and HTTPS controller own policy.
export function applyOrdinarySettings({ repository, pages = false, ruleset = false, immutability = false }, run) {
  if (!repository || repository === 'all' || !/^(?:\.github|[A-Za-z0-9][A-Za-z0-9_.-]*)$/.test(repository)) {
    throw new Error('Ordinary apply requires one named registered repository.');
  }
  const selection = ['--repo', repository];
  const flags = ['--apply'];
  if (pages) flags.push('--apply-pages');
  if (ruleset) flags.push('--apply-main-ruleset');
  if (immutability) flags.push('--apply-immutable-releases-when-unknown');
  const apply = run(['tools/github/repository-settings.sh', ...selection, ...flags]);
  let https = 0;
  if (apply === 0 && pages) {
    // Ordinary mode is a fresh reconciliation, not a locked plan. Only the
    // already-approved target and Pages option are carried into this stage.
    https = run(['scripts/apply-repo-policy', '--apply', '--https-only', '--inventory',
      'config/github/repositories.json', ...selection, '--junit', 'artifacts/pages-setup-https.xml']);
  }
  // The pinned helper prints its pre-write snapshot. Never use that snapshot
  // as final evidence, even after a partial or failed application.
  const audit = run(['tools/github/repository-settings.sh', '--junit',
    'artifacts/target-settings-readback.xml', ...selection]);
  return apply || https || audit;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = applyOrdinarySettings({
      repository: process.env.TARGET_REPOSITORY,
      pages: process.env.PAGES === 'true',
      ruleset: process.env.RULESET === 'true',
      immutability: process.env.IMMUTABILITY === 'true'
    }, (args) => {
      console.log(`\nSettings stage: ${args[0]} ${args.slice(1).join(' ')}`);
      const result = spawnSync('bash', args, { stdio: 'inherit' });
      return result.status ?? 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 64;
  }
}
