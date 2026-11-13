// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runInventory } from '../../tools/github/reconcile-inventory.mjs';
import { readPolicyFile } from '../../tools/github/apply-repo-policy.mjs';
import { policy, inventory, fixtureApi } from './local-settings-transport.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const baseline = JSON.parse(readFileSync(new URL('./fixtures/settings-migration-plans.json', import.meta.url)));
for (const mode of ['compliant', 'drift']) test(`local policy preserves old complete ${mode} plans for every registered repository`, async () => {
  const report = await runInventory({ api: fixtureApi(mode), inventory, policy, revision: 'a'.repeat(40), dryRun: true });
  const digest = createHash('sha256').update(JSON.stringify(report.plan.repositories)).digest('hex');
  assert.equal(digest, baseline[mode].repositories_sha256);
  assert.equal(report.plan.repositories.length, baseline[mode].repository_count);
  assert.deepEqual(readPolicyFile(), JSON.parse(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url))));
});
test('documented audit and preview CLIs use only local settings sources and mocked GitHub reads', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-settings-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const transport = new URL('./local-settings-transport.mjs', import.meta.url).href;
  const log = path.join(directory, 'requests.log');
  writeFileSync(path.join(directory, 'gh'), `#!/usr/bin/env node\nimport { response } from ${JSON.stringify(transport)};\nconst args = process.argv.slice(2);\nif (args[0] !== 'api') throw new Error('Only gh api allowed');\nlet value;\nif (args[1] === 'graphql') {\n const vars = {}; let query;\n for (let i=2; i<args.length; i+=2) { const n=args[i+1].indexOf('='); const key=args[i+1].slice(0,n), val=args[i+1].slice(n+1); if(key==='query') query=val; else vars[key]=val; }\n value=response('/graphql',{method:'POST',body:{query,variables:vars}});\n} else { if(args[1]!=='--method'||args[2]!=='GET') throw new Error('Writes forbidden'); value=response(args[3]); }\nconsole.log(JSON.stringify(value));\n`, { mode: 0o755 });
  writeFileSync(path.join(directory, 'curl'), '#!/bin/sh\necho "Unexpected source download" >&2\nexit 99\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_TOKEN: 'mock-only-settings-token', NODE_OPTIONS: `--import=${transport}`, SETTINGS_MOCK_NETWORK: '1', SETTINGS_REQUEST_LOG: log };
  for (const args of [['tools/task.sh', 'github:settings:check'], ['scripts/apply-repo-policy', '--dry-run']]) {
    const result = spawnSync('bash', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /mock-only-settings-token|raw.githubusercontent/);
    assert.equal(inventory.repositories.every(name => result.stdout.includes(`${inventory.owner}/${name}`)), true);
  }
  const requests = readFileSync(log, 'utf8');
  assert.doesNotMatch(requests, /raw.githubusercontent|PATCH|PUT|DELETE/);
  assert.match(requests, /GET.*\/repos\/Living-Proof-Labs\//);
});
