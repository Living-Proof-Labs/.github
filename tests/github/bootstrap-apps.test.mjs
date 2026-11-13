// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, symlinkSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { plan, prepare, validateConfig } from '../../tools/github/bootstrap-apps.mjs';
import { loadManifestDirectory } from '../../tools/github/manifest-directory.mjs';
import { githubRead } from '../../tools/github/audit-app-access.mjs';
const enrolled = loadManifestDirectory();
const manifest = enrolled.manifests.cody;
function fixture() {
  return { config: {schema_version:1, owner:'Living-Proof-Labs', apps:[structuredClone(enrolled.config.apps.find(app=>app.agent==='cody'))]}, manifests: {cody:structuredClone(manifest)} };
}
const registration = (overrides={}) => ({id:42, slug:'living-proof-labs-cody', name:manifest.name, owner:{login:'Living-Proof-Labs', type:'Organization'}, permissions:manifest.default_permissions, events:[], ...overrides});
const installation = (overrides={}) => ({id:12, app_id:42, app_slug:'living-proof-labs-cody', target_type:'Organization', account:{login:'Living-Proof-Labs'}, suspended_at:null, permissions:manifest.default_permissions, ...overrides});
function reader({registrations={}, installations=[], failList=false}={}) {
  return async endpoint => {
    if (endpoint.startsWith('/user/')) return {state:'active',role:'admin',organization:{login:'Living-Proof-Labs'},user:{login:'owner'}};
    if (endpoint.startsWith('/orgs/')) {
      if (failList) throw new Error('secret-body');
      return {total_count: installations.length, installations};
    }
    if (registrations[endpoint.slice(6)]) return registrations[endpoint.slice(6)];
    throw Object.assign(new Error('secret-body'), {httpStatus:404});
  };
}
const run = (f, read) => plan(f.config, f.manifests, read);

test('repeated verified identity runs are identical and only read', async()=>{
  const f=fixture(); f.config.apps[0].identity={app_id:42,app_slug:'living-proof-labs-cody'};
  const read=reader({registrations:{'living-proof-labs-cody':registration()},installations:[installation()]});
  const first=await run(f,read); assert.deepEqual(await run(f,read),first);
  assert.equal(first.results[0].status,'verified'); assert.equal(first.results[0].installation,'permissions-verified');
});
test('discovery adopts an existing registration and a persisted identity becomes a no-op', async()=>{
  const f=fixture(), read=reader({registrations:{'living-proof-labs-cody':registration()}});
  const first=(await run(f,read)).results[0]; assert.equal(first.status,'adopt');
  f.config.apps[0].identity=first.identity; assert.equal((await run(f,read)).results[0].status,'verified');
});
test('installation discovery finds a non-default slug, but never equates installation ownership to registration ownership', async()=>{
  const f=fixture();
  let result=await run(f,reader({registrations:{renamed:registration({slug:'renamed'})},installations:[installation({app_slug:'renamed'})]}));
  assert.equal(result.results[0].identity.app_slug,'renamed');
  result=await run(f,reader({registrations:{renamed:registration({slug:'renamed',owner:{login:'Other',type:'Organization'}})},installations:[installation({app_slug:'renamed'})]}));
  assert.equal(result.results[0].identity,undefined);
});
for(const status of [401,403,404,429,500]) test(`HTTP ${status} never proves absence or prints the API error body`,async()=>{
  const report=await run(fixture(),async()=>{throw Object.assign(new Error('SECRET_SENTINEL'),{httpStatus:status});});
  assert.equal(report.results[0].status,'unverified'); assert.equal(report.discovery,'unverified'); assert.doesNotMatch(JSON.stringify(report),/SECRET_SENTINEL/);
});
test('empty, inaccessible, malformed and incomplete installation lists do not authorize creation',async()=>{
  for(const read of [reader(),reader({failList:true}),async()=>({total_count:2,installations:[installation()]}),async()=>({})]) {
    const report=await run(fixture(),read); assert.ok(['unverified','ambiguous'].includes(report.results[0].status));
  }
});
test('identity mismatch, wrong owner and missing registration never fall back to creating',async()=>{
  for(const found of [registration({id:7}),registration({slug:'other'}),registration({owner:{login:'Other',type:'Organization'}}),registration({owner:{login:'Living-Proof-Labs',type:'User'}}),null]) {
    const f=fixture(); f.config.apps[0].identity={app_id:42,app_slug:'living-proof-labs-cody'};
    assert.equal((await run(f,reader({registrations:{'living-proof-labs-cody':found}}))).results[0].status,'unverified');
  }
});
test('multiple matching Apps or occupied candidate slug require owner resolution',async()=>{
  const f=fixture();
  assert.equal((await run(f,reader({registrations:{'living-proof-labs-cody':registration(),renamed:registration({id:43,slug:'renamed'})},installations:[installation({id:13,app_id:43,app_slug:'renamed'})]}))).results[0].status,'ambiguous');
  assert.equal((await run(f,reader({registrations:{'living-proof-labs-cody':registration({name:'Someone else'})}}))).results[0].status,'ambiguous');
});
test('permission and event drift preserve identity; installation acceptance remains separate',async()=>{
  const f=fixture();f.config.apps[0].identity={app_id:42,app_slug:'living-proof-labs-cody'};
  for(const overrides of [{permissions:{metadata:'read'}},{events:['push']},{permissions:{...manifest.default_permissions,administration:'write'}}]) assert.equal((await run(f,reader({registrations:{'living-proof-labs-cody':registration(overrides)}}))).results[0].status,'drift');
  assert.equal((await run(f,reader({registrations:{'living-proof-labs-cody':registration()},installations:[installation({permissions:{metadata:'read'}})]}))).results[0].installation,'review-required');
  assert.equal((await run(f,reader({registrations:{'living-proof-labs-cody':registration()},failList:true}))).results[0].installation,'unverified');
});
test('scope validation rejects permission expansion, events, webhook, public and callback changes',()=>{
  for(const mutate of [m=>m.default_permissions.administration='write',m=>m.default_permissions.contents='read',m=>m.default_events=['push'],m=>m.hook_attributes={url:'https://attacker.invalid'},m=>m.public=true,m=>m.redirect_url='https://attacker.invalid']) {
    const f=fixture();mutate(f.manifests.cody);assert.throws(()=>validateConfig(f.config,f.manifests));
  }
  assert.deepEqual(enrolled.manifests.art.default_permissions,{contents:'read',issues:'write',metadata:'read',pull_requests:'write'});
});
test('fixed-origin GET transport rejects redirects and never uses mutating requests',async()=>{
  await githubRead('/apps/example','SENTINEL',async(url,options)=>{assert.equal(url,'https://api.github.com/apps/example');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({})};});
  for(const endpoint of ['//evil.invalid','https://evil.invalid','/\\evil.invalid']) await assert.rejects(githubRead(endpoint,'SENTINEL',()=>{throw new Error('must not fetch');}));
});
function local(t) { const base=mkdtempSync(path.join(os.tmpdir(),'bootstrap-test-')); t.after(()=>rmSync(base,{recursive:true,force:true}));return base; }
test('only fresh interactive owner confirmation creates a private local form; repeats cannot overwrite it',async t=>{
  const base=local(t), f=fixture(), directory=path.join(base,'registration');
  const options={...f,agent:'cody',directory,read:reader(),interactive:true,confirm:async question=>question.trim().split('\n').at(-1)};
  await prepare(options);
  assert.equal(statSync(directory).mode&0o777,0o700);
  for(const name of ['registration.html','state','owner-confirmation.json']) assert.equal(statSync(path.join(directory,name)).mode&0o777,0o600);
  const html=readFileSync(path.join(directory,'registration.html'),'utf8');
  assert.match(html,/organizations\/Living-Proof-Labs\/settings\/apps\/new/);assert.match(html,/Living Proof Labs Cody/);assert.doesNotMatch(html,/SECRET_SENTINEL/);
  await assert.rejects(prepare(options));assert.equal(readFileSync(path.join(directory,'registration.html'),'utf8'),html);
});
test('noninteractive, nonowner, rejected confirmation, bound identity and discovered Apps cannot prepare',async t=>{
  const base=local(t), f=fixture();
  const options={...f,agent:'cody',directory:path.join(base,'registration'),read:reader(),interactive:true,confirm:async()=>''};
  await assert.rejects(prepare(options));
  await assert.rejects(prepare({...options,interactive:false}));
  await assert.rejects(prepare({...options,read:async()=>({state:'active',role:'member'})}));
  await assert.rejects(prepare({...options,read:reader({registrations:{'living-proof-labs-cody':registration()}})}));
  f.config.apps[0].identity={app_id:42,app_slug:'living-proof-labs-cody'};await assert.rejects(prepare(options));
  assert.deepEqual(readdirSync(base),[]);
});
test('local preparation rejects destinations inside checkout, including symlink aliases',async t=>{
  const base=local(t),root=path.join(base,'checkout');mkdirSync(root);symlinkSync(root,path.join(base,'alias'));
  const f=fixture();for(const directory of [path.join(root,'secret'),path.join(base,'alias','secret')]) await assert.rejects(prepare({...f,agent:'cody',directory,root,interactive:true,read:reader(),confirm:async()=>''}));
});
test('adding a manifest alone enrolls it, while conflicting stored identities fail closed',t=>{
  const root=local(t);mkdirSync(path.join(root,'config/github/apps'),{recursive:true});
  const save=(file,value)=>writeFileSync(path.join(root,file),JSON.stringify(value));
  save('config/github/agents.json',{owner:'Living-Proof-Labs',agents:[]});save('config/github/app-access.json',{owner:'Living-Proof-Labs',apps:[]});
  save('config/github/apps/new-role.manifest.json',{...manifest,name:'New role',default_permissions:{metadata:'read'}});
  assert.deepEqual(loadManifestDirectory(root).config.apps.map(x=>x.agent),['new-role']);
  save('config/github/agents.json',{owner:'Living-Proof-Labs',agents:[{manifest:'config/github/apps/new-role.manifest.json',github_identity:{app_id:'42',app_slug:'one'}}]});
  save('config/github/app-access.json',{owner:'Living-Proof-Labs',apps:[{manifest:'config/github/apps/new-role.manifest.json',app_id:43,app_slug:'two'}]});
  assert.throws(()=>loadManifestDirectory(root));
});
test('audit automatically covers every manifest and explicitly reports missing installation policy',async()=>{
  const {auditManifestDirectory}=await import('../../tools/github/audit-app-access.mjs');
  const policy=JSON.parse(readFileSync('config/github/app-access.json','utf8'));
  const report=await auditManifestDirectory(policy,{read:reader(),revision:'fixture',configDigest:'fixture',now:()=> '2026-11-13T00:00:00Z'});
  assert.deepEqual(report.registrations.results.map(app=>app.agent),enrolled.config.apps.map(app=>app.agent));
  for(const agent of ['art','cody','vera']) assert.ok(report.missing_installation_policy.includes(agent));
  assert.equal(report.status,'incomplete-or-drift');
});

test('settings reference manifests are validated examples, never bootstrap targets', async t => {
  assert.equal(enrolled.config.apps.some(app => app.agent.startsWith('repository-settings-')), false);
  const base = local(t);
  await assert.rejects(prepare({ ...enrolled, agent: 'repository-settings-apply', directory: path.join(base, 'registration'), interactive: true, read: reader(), confirm: async () => { throw new Error('must not ask'); } }));
  assert.deepEqual(readdirSync(base), []);
});
