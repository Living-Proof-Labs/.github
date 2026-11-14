// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAccess,comparePermissions,compareApp,collectInstallations,audit,githubRead} from '../../tools/github/audit-app-access.mjs';
const config=JSON.parse(readFileSync(new URL('../../config/github/app-access.json',import.meta.url)));
const desired=config.apps[0];
const registration=()=>({id:desired.app_id,slug:desired.app_slug,owner:{login:config.owner},permissions:{...desired.permissions}});
const installation=()=>({id:desired.installation_id,app_id:desired.app_id,account:{login:config.owner},target_type:'Organization',suspended_at:null,repository_selection:'all',permissions:{...desired.permissions}});

test('reviewed config matches manifest and excludes Administration',()=>{
 assert.equal(validateAccess(config),config);
 assert.equal(desired.permissions.administration,undefined);
 const manifest=JSON.parse(readFileSync(new URL('../../'+desired.manifest,import.meta.url)));
 assert.equal(comparePermissions(desired.permissions,manifest.default_permissions).status,'compliant');
});
test('complete matching registration and installation pass',()=>assert.equal(compareApp(config,desired,registration(),installation()).status,'compliant'));
for(const kind of ['missing','extra','level']) test(`${kind} permission drift has precise before/after`,()=>{
 const reg=registration(); if(kind==='missing') delete reg.permissions.issues; if(kind==='extra') reg.permissions.administration='write'; if(kind==='level') reg.permissions.contents='read';
 const result=compareApp(config,desired,reg,installation());assert.equal(result.status,'drift');assert.equal(result.registration.changes.length,1);assert.ok(Object.hasOwn(result.registration.changes[0],'before'));assert.ok(Object.hasOwn(result.registration.changes[0],'after'));
});
test('accepted installation mismatch is possible pending acceptance, not proof',()=>{const inst=installation();delete inst.permissions.workflows;assert.equal(compareApp(config,desired,registration(),inst).pending_acceptance_possible,true);});
test('token narrowing never substitutes for installation evidence',()=>{
 const token={token:'secret',permissions:{issues:'read'},repository_selection:'selected'};
 assert.equal(compareApp(config,desired,registration(),token).installation.status,'unverified');
});
test('selected scope drift and unsupported membership are not compliance',()=>{
 const inst=installation();inst.repository_selection='selected';assert.equal(compareApp(config,desired,registration(),inst).scope.status,'drift');
 const select={...desired,repository_selection:'selected',repositories:[`${config.owner}/.github`]};assert.equal(compareApp(config,select,registration(),inst).scope.status,'unverified');
});
for(const field of ['permissions','account','app_id','id','target_type','repository_selection','suspended_at']) test(`missing installation ${field} is unverified`,()=>{const inst=installation();delete inst[field];assert.equal(compareApp(config,desired,registration(),inst).status,'unverified');});
test('wrong registration identity and null permission maps fail closed',()=>{const reg=registration();reg.id++;assert.equal(compareApp(config,desired,reg,installation()).status,'unverified');assert.equal(comparePermissions({},null).status,'unverified');});
test('all installation pages are collected',async()=>{let calls=0;const entries=Array.from({length:101},(_,id)=>({id}));const found=await collectInstallations(config.owner,async()=>({total_count:101,installations:++calls===1?entries.slice(0,100):entries.slice(100)}));assert.equal(found.length,101);assert.equal(calls,2);});
test('short, duplicate, changing and denied pages cannot pass',async()=>{
 await assert.rejects(collectInstallations(config.owner,async()=>({total_count:2,installations:[{id:1}]})));
 await assert.rejects(collectInstallations(config.owner,async()=>({total_count:2,installations:[{id:1},{id:1}]})));
 let count=0;await assert.rejects(collectInstallations(config.owner,async()=>({total_count:++count===1?101:102,installations:Array.from({length:100},(_,id)=>({id}))})));
 await assert.rejects(collectInstallations(config.owner,async()=>{throw Error('403');}));
});
test('audit reports provenance and redacts failures; only GET endpoints requested',async()=>{
 const endpoints=[];const result=await audit(config,{revision:'abc',configDigest:'def',now:()=> '2026-11-12T00:00:00Z',read:async endpoint=>{endpoints.push(endpoint);throw Error('secret-token');}});
 assert.equal(result.status,'incomplete-or-drift');assert.equal(result.configuration_revision,'abc');assert.equal(result.configuration_sha256,'def');assert.equal(result.observed_at,'2026-11-12T00:00:00Z');assert.ok(!JSON.stringify(result).includes('secret-token'));assert.equal(endpoints.length,1+config.apps.length);
});
test('suspended installation does not pass',()=>{const inst=installation();inst.suspended_at='2026-11-12';assert.notEqual(compareApp(config,desired,registration(),inst).status,'compliant');});
test('read transport fixes destination, forbids redirect and writes',async()=>{
 await githubRead('/apps/rivet','SECRET',async(url,options)=>{assert.equal(url,'https://api.github.com/apps/rivet');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({})};});
 await assert.rejects(githubRead('/apps/rivet','SECRET',async()=>({ok:false,status:403})),error=>error.httpStatus===403);
});
test('invalid desired state rejected',()=>{
 for(const change of [{app_id:0},{repository_selection:'selected',repositories:[]},{permissions:{metadata:'admin'}},{justifications:{}},{manifest:'../../secret'}]) assert.throws(()=>validateAccess({...config,apps:[{...desired,...change}]}));
});

test('transport rejects host confusion before attaching authorization',async()=>{for(const endpoint of ['@example.invalid/path','//example.invalid/path','https://example.invalid/','/\\example.invalid']) await assert.rejects(githubRead(endpoint,'SECRET',()=>{throw Error('must not fetch');}),/Invalid GitHub/);});
