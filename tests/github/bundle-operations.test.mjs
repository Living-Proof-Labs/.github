// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareApp } from '../../tools/github/audit-app-access.mjs';
import { loadManifestDirectory } from '../../tools/github/manifest-directory.mjs';
import { authorize, verifyToken, target } from '../../tools/automation/bundle-target.mjs';
const context = {GITHUB_REPOSITORY:'Living-Proof-Labs/.github', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'schedule', GITHUB_SHA:'a'.repeat(40), GITHUB_WORKFLOW_REF:'Living-Proof-Labs/.github/.github/workflows/bundle-completion.yml@refs/heads/main'};
test('only the reviewed target and trusted scheduled/manual context authorize', () => {
  assert.equal(authorize(target, context), target);
  assert.equal(authorize(target, {...context,GITHUB_EVENT_NAME:'workflow_dispatch'}), target);
  for (const value of ['', 'Living-Proof-Labs/.github', 'elsewhere/livingproof-verification', target + '\n', [target]]) assert.throws(() => authorize(value,context));
  for (const [key,value] of Object.entries({GITHUB_REPOSITORY:target,GITHUB_REF:'refs/pull/1/merge',GITHUB_EVENT_NAME:'pull_request_target',GITHUB_SHA:'main',GITHUB_WORKFLOW_REF:context.GITHUB_WORKFLOW_REF.replace('@refs/heads/main','@refs/heads/other')})) assert.throws(() => authorize(target,{...context,[key]:value}));
});
test('token must expose exactly the reviewed single repository', async () => {
  await verifyToken(target,context,async endpoint => {
    assert.equal(endpoint,'/installation/repositories?per_page=100&page=1');
    return {total_count:1,repositories:[{full_name:target}]};
  });
  for (const result of [{}, {total_count:2,repositories:[{full_name:target}]}, {total_count:1,repositories:[]}, {total_count:1,repositories:[{full_name:'Living-Proof-Labs/.github'}]}, {total_count:1,repositories:[{full_name:target},{full_name:target}]}]) await assert.rejects(verifyToken(target,context,async()=>result));
  await assert.rejects(verifyToken(target,context,async()=>{throw Error('403');}));
});
test('unauthorized target is refused before any authenticated read', async () => {
  await assert.rejects(verifyToken('other/repository',context,async()=>assert.fail('read attempted')));
});
test('installed workflow matches the reviewed template and preserves credential isolation', () => {
  const template = readFileSync(new URL('../../.github/workflows/bundle-completion.yml',import.meta.url),'utf8');
  const dormant = readFileSync(new URL('../../tools/automation/bundle-completion.yml',import.meta.url),'utf8');
  const executable = text => text.replace(/ # v[0-9.]+/g,'').split('\n').filter(line => !line.startsWith('#')).join('\n');
  assert.equal(executable(template), executable(dormant));
  const prepare=template.split('  prepare:')[1].split('  publish:')[0];
  assert.doesNotMatch(prepare,/secrets\.|environment:|create-github-app-token/);
  for (const job of ['publish','queue']) {
    const body=template.split(`  ${job}:`)[1].split('\n  queue:')[0];
    assert.match(body,/environment: ci-automation/);
    assert.match(body,/owner: Living-Proof-Labs\n          repositories: livingproof-verification\n/);
    assert.match(body,/permission-metadata: read/);
    assert.match(body,/permission-contents: write/);
    assert.match(body,/permission-pull-requests: write/);
    assert.match(body,/verify-token Living-Proof-Labs\/livingproof-verification/);
    const permissions = [...body.matchAll(/permission-([a-z-]+): ([a-z]+)/g)].map(match => `${match[1]}:${match[2]}`).sort();
    assert.deepEqual(permissions, (job === 'publish' ? ['metadata:read','contents:write','pull-requests:write','workflows:write'] : ['metadata:read','contents:write','pull-requests:write']).sort());
    assert.ok(body.indexOf('bundle-target.mjs authorize') < body.indexOf('create-github-app-token'));
    assert.ok(body.indexOf('verify-token') > body.indexOf('create-github-app-token'));
    assert.match(body,/ref: \$\{\{ needs.prepare.outputs.main \}\}/);

    assert.doesNotMatch(body,/pip install|npm |skip-token-revoke|permission-administration|pull_request_target/);
  }
  assert.equal((template.match(/permission-workflows: write/g)||[]).length,1);
  assert.match(template,/name: trusted-bundle-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  assert.match(template,/DIGEST: \$\{\{ needs.prepare.outputs.digest \}\}/);
  assert.match(template,/RECEIPT_DIGEST: \$\{\{ needs.publish.outputs.receipt_digest \}\}/);
  assert.match(template,/artifact-ids: \$\{\{ needs.publish.outputs.receipt_artifact \}\}/);
  assert.match(template,/receipt_artifact: \$\{\{ steps.receipt.outputs.artifact-id \}\}/);
  assert.match(template,/retention-days: 1/);
  assert.doesNotMatch(template,/run-id:|github-token:/);
  assert.doesNotMatch(template,/secrets: inherit|BUNDLE_WRITER_TOKEN|pull_request_target:|workflow_call:/);
  assert.equal((template.match(/persist-credentials: false/g)||[]).length,6);
  assert.equal((template.match(/ref: \$\{\{ github.sha \}\}/g)||[]).length,3);
  assert.equal((template.match(/github.repository == 'Living-Proof-Labs\/\.github' && github.ref == 'refs\/heads\/main'/g)||[]).length,3);
  assert.match(template,/permissions:\n  contents: read/);
  assert.match(template,/cancel-in-progress: false/);
});

test('enrolled CI Automation manifest preserves the reviewed minimum grants', () => {
  const manifest=JSON.parse(readFileSync(new URL('../../config/github/app-reference-manifests/ci-automation.manifest.json',import.meta.url)));
  assert.deepEqual(manifest.default_permissions,{metadata:'read',contents:'write',workflows:'write',pull_requests:'write'});
  assert.equal(manifest.name,'CI Automation');
  assert.equal(manifest.public,false);
  assert.deepEqual(manifest.default_events,[]);
  const enrolled=JSON.parse(readFileSync(new URL('../../config/github/apps/ci-automation.manifest.json',import.meta.url)));
  assert.deepEqual(enrolled,manifest);
});


test('verified CI Automation identity enrolls only the selected target without claiming membership compliance', () => {
  const config=JSON.parse(readFileSync(new URL('../../config/github/app-access.json',import.meta.url)));
  const app=config.apps.find(app => app.agent === 'ci-automation');
  assert.equal(app.app_id,5829119);
  assert.equal(app.app_slug,'living-proof-labs-ci-automation');
  assert.equal(app.installation_id,183589516);
  assert.equal(app.manifest,'config/github/apps/ci-automation.manifest.json');
  assert.equal(app.repository_selection,'selected');
  assert.deepEqual(app.repositories,[target]);
  assert.deepEqual(app.permissions,{metadata:'read',contents:'write',workflows:'write',pull_requests:'write'});
  assert.deepEqual(Object.keys(app.justifications).sort(),Object.keys(app.permissions).sort());
  const enrolled=loadManifestDirectory().config.apps.find(item => item.agent === 'ci-automation');
  assert.deepEqual(enrolled.identity,{app_id:5829119,app_slug:'living-proof-labs-ci-automation'});
  const result=compareApp(config,app,
    {id:app.app_id,slug:app.app_slug,owner:{login:config.owner},permissions:app.permissions},
    {id:app.installation_id,app_id:app.app_id,account:{login:config.owner},target_type:'Organization',suspended_at:null,repository_selection:'selected',permissions:app.permissions});
  assert.equal(result.registration.status,'compliant');
  assert.equal(result.installation.status,'compliant');
  assert.equal(result.scope.status,'unverified');
  assert.equal(result.status,'unverified');
});


test('recovery rejects missing artifact identity before download can default to all artifacts', () => {
  const workflow=readFileSync(new URL('../../.github/workflows/bundle-completion.yml',import.meta.url),'utf8');
  const step=workflow.split('name: Validate publication evidence outputs')[1];
  const script=step.match(/run: \|\n((?:          .+\n)+)/)[1].replace(/^          /gm,'');
  for (const [id,digest,valid] of [['123','a'.repeat(64),true],['','a'.repeat(64),false],['all','a'.repeat(64),false],['0','a'.repeat(64),false],['123','',false],['123','head',false]]) {
    const result=spawnSync('bash',['-eu','-c',script],{env:{...process.env,ARTIFACT_ID:id,RECEIPT_DIGEST:digest}});
    assert.equal(result.status === 0,valid);
  }
});
