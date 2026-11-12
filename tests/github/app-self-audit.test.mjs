// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appReader, auditAsApp, collectAppInstallations } from '../../tools/github/audit-app-self.mjs';
const config=JSON.parse(readFileSync(new URL('../../config/github/app-access.json',import.meta.url)));
const desired=config.apps[0];
const registration=()=>({id:desired.app_id,slug:desired.app_slug,owner:{login:config.owner},permissions:{...desired.permissions}});
const installation=()=>({id:desired.installation_id,app_id:desired.app_id,account:{login:config.owner},target_type:'Organization',suspended_at:null,repository_selection:'all',permissions:{...desired.permissions}});
const reader=(changes={})=>async endpoint=> endpoint in changes ? changes[endpoint] : endpoint==='/app'?registration():endpoint.includes('?')?[installation()]:installation();
const run=(read)=>auditAsApp(config,'rivet',{readerFactory:()=>read,revision:'abc',configDigest:'def'});

test('App authenticates against own official records without organization endpoints',async()=>{
 const paths=[];const report=await run(async endpoint=>{paths.push(endpoint);return reader()(endpoint);});
 assert.equal(report.status,'compliant');assert.equal(report.authentication,'app-signed');assert.deepEqual(report.audited_agents,['rivet']);
 assert.deepEqual(paths,['/app',`/app/installations/${desired.installation_id}`,'/app/installations?per_page=100&page=1']);
});
test('wrong App identity stops before installation access',async()=>{let calls=0;const report=await run(async()=>{calls++;return {...registration(),id:1};});assert.equal(calls,1);assert.equal(report.status,'incomplete-or-drift');});
test('missing, denied or inconsistent installation evidence cannot pass',async()=>{
 for(const read of [reader({'/app/installations?per_page=100&page=1':[]}),reader({[`/app/installations/${desired.installation_id}`]:{...installation(),repository_selection:'selected'}}),async()=>{const e=Error('secret-canary');e.httpStatus=403;throw e;}]) {
 const report=await run(read);assert.equal(report.status,'incomplete-or-drift');assert.ok(!JSON.stringify(report).includes('secret-canary'));
 }
});
test('selected scope remains unverified until authoritative membership reader exists',async()=>{
 const selected=structuredClone(config);selected.apps[0].repository_selection='selected';selected.apps[0].repositories=[`${config.owner}/.github`];
 const inst={...installation(),repository_selection:'selected'};
 const report=await auditAsApp(selected,'rivet',{readerFactory:()=>reader({[`/app/installations/${desired.installation_id}`]:inst,'/app/installations?per_page=100&page=1':[inst]})});
 assert.equal(report.results[0].scope.status,'unverified');
});
test('all App installation pages collected and duplicate/malformed/denied pages rejected',async()=>{
 const entries=Array.from({length:100},(_,i)=>({id:i+1,app_id:desired.app_id}));let calls=0;
 assert.equal((await collectAppInstallations(async()=>++calls===1?entries:[],desired.app_id)).length,100);assert.equal(calls,2);
 for(const response of [null,{},[{id:1,app_id:0}],[entries[0],entries[0]],Array(101).fill(entries[0])]) await assert.rejects(collectAppInstallations(async()=>response,desired.app_id));
 let page=0;await assert.rejects(collectAppInstallations(async()=>{if(++page===1)return entries;throw Error('403');},desired.app_id));
});
test('existing key signs short-lived requests; reads only; credentials never in report',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={RIVET_GITHUB_APP_ID:String(desired.app_id),RIVET_GITHUB_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
 let requests=0;
 const read=appReader(desired,env,async(url,options)=>{
 requests++;assert.equal(url,'https://api.github.com/app');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
 const token=options.headers.Authorization.slice(7);const [head,body,sig]=token.split('.');
 assert.equal(JSON.parse(Buffer.from(body,'base64url')).iss,String(desired.app_id));assert.ok(verify('RSA-SHA256',Buffer.from(`${head}.${body}`),publicKey,Buffer.from(sig,'base64url')));
 return {ok:true,json:async()=>registration()};
 });
 await read('/app');assert.equal(requests,1);assert.throws(()=>read('/orgs/Living-Proof-Labs/installations'));assert.equal(requests,1);
 assert.throws(()=>appReader(desired,{...env,RIVET_GITHUB_APP_ID:'1'}));assert.throws(()=>appReader(desired,{}));
});
test('unknown App never silently falls back to shared identity',async()=>{await assert.rejects(auditAsApp(config,'unknown'));});

test('documented command exits with sanitized unverified report when key unavailable',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['tools/github/audit-app-access.mjs','--as-app','rivet'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',env:{...process.env,RIVET_GITHUB_APP_ID:'',RIVET_GITHUB_APP_PRIVATE_KEY:''}});
 assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).status,'incomplete-or-drift');assert.equal(result.stderr,'');
});
