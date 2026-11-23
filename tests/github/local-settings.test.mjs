// SPDX-License-Identifier: Apache-2.0
import test, { describe } from 'node:test';
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
const baselinePolicy = JSON.parse(readFileSync(new URL('./fixtures/reconciliation-policy.json', import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL('./fixtures/settings-migration-plans.json', import.meta.url)));
describe('Local settings ownership', () => {
// The migration evidence predates Health and still includes the now-archived repository.
const baselineInventory = { ...inventory, repositories: [
  ...inventory.repositories.filter(name => name !== 'livingproof-health' && name !== 'website'),
  'unitree-foxglove-sdk', 'website',
] };
for (const mode of ['compliant', 'drift']) test(`local policy preserves old complete ${mode} plans for every pre-health registered repository`, async () => {
  const report = await runInventory({ api: fixtureApi(mode, baselinePolicy, baselineInventory), inventory: baselineInventory, policy: baselinePolicy, revision: 'a'.repeat(40), dryRun: true });
  const digest = createHash('sha256').update(JSON.stringify(report.plan.repositories)).digest('hex');
  assert.equal(digest, baseline[mode].repositories_sha256);
  assert.equal(report.plan.repositories.length, baseline[mode].repository_count);
  const { required_checks_by_repository, merge_queue_by_repository, discussions_enabled_exceptions, ...unchanged } = readPolicyFile();
  assert.deepEqual(unchanged, baselinePolicy);
});
test('documented audit and preview CLIs use only local settings sources and mocked GitHub reads', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-settings-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const transport = new URL('./local-settings-transport.mjs', import.meta.url).href;
  const log = path.join(directory, 'requests.log');
  writeFileSync(path.join(directory, 'gh'), `#!/usr/bin/env node\nimport { response } from ${JSON.stringify(transport)};\nconst args = process.argv.slice(2);\nif (args[0] !== 'api') throw new Error('Only gh api allowed');\nlet value;\nif (args[1] === 'graphql') {\n const vars = {}; let query;\n for (let i=2; i<args.length; i+=2) { const n=args[i+1].indexOf('='); const key=args[i+1].slice(0,n), val=args[i+1].slice(n+1); if(key==='query') query=val; else vars[key]=val; }\n value=response('/graphql',{method:'POST',body:{query,variables:vars}});\n} else { if(args[1]!=='--method'||args[2]!=='GET') throw new Error('Writes forbidden'); value=response(args[3]); }\nconsole.log(JSON.stringify(value));\n`, { mode: 0o755 });
  writeFileSync(path.join(directory, 'curl'), '#!/bin/sh\necho "Unexpected source download" >&2\nexit 99\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_TOKEN: 'mock-only-settings-token', NODE_OPTIONS: `--import=${transport}`, SETTINGS_MOCK_NETWORK: '1', SETTINGS_REQUEST_LOG: log };
  for (const args of [['tools/task.sh', 'github:settings:check'], ['tools/task.sh', 'github:settings:reconcile', '--', '--dry-run']]) {
    const result = spawnSync('bash', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /mock-only-settings-token|raw.githubusercontent/);
    assert.equal(inventory.repositories.every(name => result.stdout.includes(`${inventory.owner}/${name}`)), true);
  }
  const requests = readFileSync(log, 'utf8');
  assert.doesNotMatch(requests, /raw.githubusercontent|PATCH|PUT|DELETE/);
  assert.match(requests, /GET.*\/repos\/Living-Proof-Labs\//);
});

});


describe('Selected required-check enrollment', () => {
  test('exact desired context, producer and enforcement; no other policy changed', () => {
    const { required_checks_by_repository, merge_queue_by_repository, discussions_enabled_exceptions, ...rest } = readPolicyFile();
    assert.deepEqual(rest, baselinePolicy);
    assert.deepEqual(required_checks_by_repository, { '.github': {
      required_status_checks: [{ context: 'Repository verification gate', integration_id: 15368 }],
      strict_required_status_checks_policy: false, do_not_enforce_on_create: false
    }, ...Object.fromEntries(['livingproof-booster-t1','livingproof-unitree-g1','livingproof-unitree-go1'].map(name => [name, {
      required_status_checks: [{ context: 'Robot verification gate', integration_id: 15368 }],
      strict_required_status_checks_policy: false, do_not_enforce_on_create: false
    }])), 'livingproof-verification': {
      required_status_checks: ['checks', 'bundle-release-engine', 'renovate', 'verification'].map(context => ({context, integration_id: 15368})),
      strict_required_status_checks_policy: true, do_not_enforce_on_create: false
    } });
    assert.deepEqual(merge_queue_by_repository, Object.fromEntries(inventory.repositories.map(name => [name, {
      check_response_timeout_minutes: 60, grouping_strategy: 'ALLGREEN',
      max_entries_to_build: 5, max_entries_to_merge: 5, merge_method: 'MERGE',
      min_entries_to_merge: 0, min_entries_to_merge_wait_minutes: 0
    }])));
  });
  test('pilot-to-fleet preview adds queue rules for all non-root repositories without changing required checks or other settings', async () => {
    const fleet = structuredClone(policy);
    fleet.required_checks_by_repository = { '.github': policy.required_checks_by_repository['.github'] };
    const pilot = structuredClone(fleet);
    pilot.merge_queue_by_repository = { '.github': policy.merge_queue_by_repository['.github'] };
    const oldPlan = await runInventory({api: fixtureApi('compliant', pilot), inventory, policy: pilot, revision:'a'.repeat(40), dryRun:true});
    const newPlan = await runInventory({api: fixtureApi('compliant', pilot), inventory, policy: fleet, revision:'a'.repeat(40), dryRun:true});
    assert.equal(oldPlan.failures,0); assert.equal(newPlan.failures,0);
    assert.equal(newPlan.plan.repositories.length,inventory.repositories.length);
    for (let i=0;i<inventory.repositories.length;i++) {
      const old = structuredClone(oldPlan.plan.repositories[i]), next = structuredClone(newPlan.plan.repositories[i]);
      assert.notEqual(next.pages.policy,old.pages.policy);
      delete next.pages.policy; delete old.pages.policy;
      if (next.name === '.github') { assert.deepEqual(next,old); continue; }
      const {ruleset,...other}=next, {ruleset:oldRuleset,...oldOther}=old;
      assert.deepEqual(other,oldOther); assert.deepEqual(ruleset.before,oldRuleset.before);
      assert.equal(ruleset.write.method,'PUT');
      assert.equal(ruleset.write.path,`/repos/Living-Proof-Labs/${next.name}/rulesets/1`);
      assert.deepEqual(ruleset.write.body.rules,[...pilot.main_ruleset.rules,{type:'merge_queue',parameters:policy.merge_queue_by_repository[next.name]}]);
      assert.deepEqual(ruleset.write.body.conditions,pilot.main_ruleset.conditions);
      assert.deepEqual(ruleset.write.body.bypass_actors,[]);
    }
    assert.equal(newPlan.plan.repositories.filter(r=>r.ruleset.write).length, inventory.repositories.length - 1);
  });
  test('existing stronger rules survive; unavailable bypass evidence cannot become a live plan', async () => {
    const api = fixtureApi('compliant',baselinePolicy), get=api.get;
    api.get=async resource=>{
      const value=await get(resource);
      if (resource.endsWith('/.github/rulesets/1')) {
        value.rules[2].parameters.required_approving_review_count=2;
        value.rules.push({type:'required_signatures'});
        value.rules.push({type:'required_status_checks',parameters:{required_status_checks:[{context:'Existing trusted gate',integration_id:42}],strict_required_status_checks_policy:true,do_not_enforce_on_create:false}});
      }
      return value;
    };
    const preview=await runInventory({api,inventory,policy,revision:'a'.repeat(40),dryRun:true});
    const rules=preview.plan.repositories[0].ruleset.write.body.rules;
    assert.equal(rules[2].parameters.required_approving_review_count,2);
    assert.ok(rules.some(r=>r.type==='required_signatures'));
    assert.deepEqual(rules.find(r=>r.type==='required_status_checks').parameters.required_status_checks,[{context:'Existing trusted gate',integration_id:42},...policy.required_checks_by_repository['.github'].required_status_checks]);
    assert.equal(rules.find(r=>r.type==='required_status_checks').parameters.strict_required_status_checks_policy,true);
    assert.deepEqual(rules.find(r=>r.type==='merge_queue').parameters, policy.merge_queue_by_repository['.github']);
    api.get=async resource=>{const value=await get(resource);if(resource.endsWith('/.github/rulesets/1'))delete value.bypass_actors;return value;};
    const incomplete=await runInventory({api,inventory,policy,revision:'a'.repeat(40),dryRun:true});
    assert.match(incomplete.plan.repositories[0].rulesetError,/bypass actors are unreadable/);
    assert.equal(incomplete.plan.repositories[0].ruleset,undefined);
    assert.ok(incomplete.failures>0);
  });
});

 test('robot contract preview adds only three trusted gate rules', async () => {
  const previous = structuredClone(policy);
  const robots = ['livingproof-booster-t1','livingproof-unitree-g1','livingproof-unitree-go1'];
  for (const name of robots) delete previous.required_checks_by_repository[name];
  const preview = await runInventory({api:fixtureApi('compliant', previous),inventory,policy,revision:'a'.repeat(40),dryRun:true});
  assert.equal(preview.failures, 0);
  assert.deepEqual(preview.plan.repositories.filter(r=>r.ruleset?.write).map(r=>r.name), robots);
  for (const r of preview.plan.repositories.filter(r=>r.ruleset?.write)) {
    const {before,write} = r.ruleset;
    assert.equal(write.method, 'PUT');
    assert.deepEqual(write.body.conditions, before.conditions);
    assert.deepEqual(write.body.bypass_actors, before.bypass_actors);
    assert.deepEqual(write.body.rules.filter(r=>r.type!=='required_status_checks'), before.rules);
    assert.deepEqual(write.body.rules.find(r=>r.type==='required_status_checks').parameters, {
      required_status_checks:[{context:'Robot verification gate',integration_id:15368}],
      strict_required_status_checks_policy:false,do_not_enforce_on_create:false
    });
  }
 });
