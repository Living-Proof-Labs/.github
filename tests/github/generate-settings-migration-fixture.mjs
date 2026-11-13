// SPDX-License-Identifier: Apache-2.0
// One-time migration evidence, regenerated from an isolated pre-migration tree:
// mkdir /tmp/settings-before
// git archive 6744acbfab0648ca6d1568fa652d28281025b61b | tar -x -C /tmp/settings-before
// node tests/github/generate-settings-migration-fixture.mjs /tmp/settings-before
// No remote policy fetch, credentials, or writes to GitHub are used.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventory, policy, fixtureApi } from './local-settings-transport.mjs';
const source = process.argv[2];
if (!source || process.argv.length !== 3) throw new Error('Pass the isolated pre-migration tree path. See the commands at the top of this file.');
const baseline = path.resolve(source);
const { runInventory } = await import(pathToFileURL(path.join(baseline, 'tools/github/reconcile-inventory.mjs')));
const { gitBlobSha } = await import(pathToFileURL(path.join(baseline, 'tools/github/apply-repo-policy.mjs')));
const pin = JSON.parse(readFileSync(path.join(baseline, 'config/github/repository-policy.json')));
const oldBytes = readFileSync(path.join(baseline, 'tests/github/fixtures/reconciliation-policy.json'));
assert.equal(pin.commit, '122db54d0763dc39f81133ec06e35dab2b24d41b');
assert.equal(gitBlobSha(oldBytes), pin.policy_blob_sha);
const oldPolicy = JSON.parse(oldBytes);
assert.deepEqual(oldPolicy, policy);
assert.deepEqual(JSON.parse(readFileSync(path.join(baseline, 'config/github/repositories.json'))), inventory);
const expected = { source_revision: '6744acbfab0648ca6d1568fa652d28281025b61b', policy_source: 'collaboration-guidelines v7.10.0', policy_blob: pin.policy_blob_sha };
for (const mode of ['compliant', 'drift']) {
  const report = await runInventory({ api: fixtureApi(mode), inventory, policy: oldPolicy, revision: 'a'.repeat(40), dryRun: true });
  // Exclude only top-level source/implementation bindings, which must change in
  // the migration. Hash complete repository snapshots and proposed operations.
  expected[mode] = { repositories_sha256: createHash('sha256').update(JSON.stringify(report.plan.repositories)).digest('hex'), repository_count: report.plan.repositories.length };
}
writeFileSync(new URL('./fixtures/settings-migration-plans.json', import.meta.url), JSON.stringify(expected, null, 2) + '\n');
