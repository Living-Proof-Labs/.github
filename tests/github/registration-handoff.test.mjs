// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { handoff, continueSession } from '../../tools/github/registration-handoff.mjs';
import { exchangeOnce } from '../../tools/github/exchange-app-manifest-code.mjs';
import { acceptCallback, matchesState } from '../../tools/github/receive-app-manifest-code.mjs';
import { registrationForm } from '../../tools/github/render-app-manifest-form.mjs';
const manifest = JSON.parse(readFileSync('config/github/apps/cody.manifest.json'));
const pem = generateKeyPairSync('rsa', {modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const registration = () => ({id:123,slug:'living-proof-labs-cody',name:manifest.name,owner:{login:'Living-Proof-Labs',type:'Organization'},permissions:manifest.default_permissions,events:[],pem,client_secret:'SECRET_CANARY',webhook_secret:'WEBHOOK_CANARY'});
const membership = {state:'active',role:'admin',organization:{login:'Living-Proof-Labs'},user:{login:'owner'}};
function fixture(t, overrides = {}) {
 const dir=mkdtempSync(path.join(tmpdir(),'registration-session-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const save=(name,value)=>writeFileSync(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value),{mode:0o600});
 save('owner-confirmation.json',{agent:'cody',owner:'Living-Proof-Labs',confirmed_by:'owner',confirmed_at:new Date().toISOString(),manifest_sha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),source:'interactive-owner-registration-inventory-inspection',...overrides});
 save('state','a'.repeat(43));save('code','temporary_code');save('registration',registration());return {dir,save};
}
test('generated action carries encoded state; callback rejects empty, duplicate and wrong state',()=>{
 assert.match(registrationForm({},'Living-Proof-Labs','a+b'),/new\?state=a%2Bb/);
 assert.equal(matchesState('',''),false);
 const state='a'.repeat(43);const request=url=>({url,method:'GET',headers:{host:'127.0.0.1:8787'}});
 assert.equal(acceptCallback(request(`/github-app-manifest/callback?state=${state}&code=abc`),state),'abc');
 for(const query of [`code=abc`,`state=${state}&state=${state}&code=abc`,`state=${state}&code=abc&code=def`,`state=wrong&code=abc`]) assert.equal(acceptCallback(request(`/github-app-manifest/callback?${query}`),state),null);
 assert.equal(acceptCallback(request('/github-app-manifest/callback?code=abc'),''),null);
});
test('uncertain conversion preserves attempt and output and cannot replay',async t=>{
 const {dir}=fixture(t);const output=path.join(dir,'response');let calls=0;
 await assert.rejects(exchangeOnce('code',output,async()=>{calls++;throw Error('timeout');}));
 assert.ok(existsSync(output));assert.ok(existsSync(`${output}.attempt`));
 await assert.rejects(exchangeOnce('code',output,async()=>{calls++;return 'secret';}));assert.equal(calls,1);
});
test('successful conversion reserves atomically and concurrent attempts send only once',async t=>{
 const {dir}=fixture(t);const output=path.join(dir,'response');let calls=0;
 const results=await Promise.allSettled([1,2].map(()=>exchangeOnce('code',output,async()=>{calls++;return JSON.stringify(registration());})));
 assert.equal(calls,1);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(JSON.parse(readFileSync(output)).id,123);
});
test('handoff uses existing key for only GET app evidence and emits no secrets',async t=>{
 const {dir}=fixture(t);let reads=0;const result=await handoff(dir,{verify:true,read:async(endpoint,jwt)=>{reads++;assert.equal(endpoint,'/app');assert.equal(jwt.split('.').length,3);return registration();}});
 assert.equal(reads,1);assert.equal(result.status,'app-signed-registration-verified');assert.equal(result.installation,'owner-selection-required');
 const output=readFileSync(path.join(dir,'identity-proposal.json'),'utf8');for(const secret of [pem,'SECRET_CANARY','WEBHOOK_CANARY','temporary_code'])assert.ok(!output.includes(secret));
 await assert.rejects(handoff(dir,{verify:true,read:()=>{throw Error('must not read');}}));
 assert.equal((await handoff(dir)).status,'offline-response-checked');
});
test('mismatch, malformed response and unsafe local files stop before credentials are used',async t=>{
 const {dir,save}=fixture(t);let calls=0;const options={verify:true,read:()=>{calls++;return registration();}};
 for(const changed of [{id:0},{owner:{login:'other',type:'Organization'}},{permissions:{metadata:'read',administration:'write'}},{pem:'bad'},{events:['push']}]) {save('registration',{...registration(),...changed});await assert.rejects(handoff(dir,options));}
 save('registration','invalid-json');await assert.rejects(handoff(dir,options));save('registration',registration());chmodSync(path.join(dir,'registration'),0o644);await assert.rejects(handoff(dir,options));assert.equal(calls,0);
});
test('changed manifest session and expired session cannot continue',async t=>{
 const {dir}=fixture(t,{manifest_sha256:'stale'});await assert.rejects(handoff(dir));
 const {dir:expired}=fixture(t,{confirmed_at:new Date(Date.now()-3600001).toISOString()});
 await assert.rejects(continueSession(expired,'--receive',{receive:()=>{throw Error('must not receive');}}));
});
test('conversion session validates original owner and retains returned response for verification',async t=>{
 const {dir}=fixture(t);rmSync(path.join(dir,'registration'));let calls=0;
 await assert.rejects(continueSession(dir,'--exchange',{bearer:'existing',read:async()=>({...membership,user:{login:'someone-else'}}),send:async()=>{calls++;}}));assert.equal(calls,0);
 await continueSession(dir,'--exchange',{bearer:'existing',read:async()=>membership,send:async()=>{calls++;return JSON.stringify(registration());}});assert.equal(calls,1);
 assert.equal((await handoff(dir)).status,'offline-response-checked');
 await assert.rejects(continueSession(dir,'--exchange',{read:async()=>membership,send:async()=>{calls++;}}));assert.equal(calls,1);
});
test('live identity mismatch cannot produce an identity proposal',async t=>{
 const {dir}=fixture(t);await assert.rejects(handoff(dir,{verify:true,read:async()=>({...registration(),id:124})}));assert.equal(existsSync(path.join(dir,'identity-proposal.json')),false);
});
test('conversion transport bounds responses and handles timeout, abort and denied responses',async()=>{
 const {convert}=await import('../../tools/github/exchange-app-manifest-code.mjs');const {EventEmitter}=await import('node:events');
 for(const mode of ['timeout','aborted','oversized','denied','success']) {
  const requestImpl=(options,callback)=>{
   assert.equal(options.hostname,'api.github.com');assert.equal(options.method,'POST');assert.equal(options.path,'/app-manifests/code/conversions');
   const req=new EventEmitter();req.destroy=()=>req.emit('error',Error('secret-canary'));req.setTimeout=(ms,fn)=>{assert.equal(ms,30000);req.timeout=fn;};
   req.end=()=>queueMicrotask(()=>{if(mode==='timeout')return req.timeout();const res=new EventEmitter();res.statusCode=mode==='denied'?403:201;callback(res);if(mode==='aborted')return res.emit('aborted');res.emit('data',Buffer.from(mode==='oversized'?'x'.repeat(1000001):'{}'));res.emit('end');});return req;
  };
  if(mode==='success')assert.equal(String(await convert('code','existing',requestImpl)),'{}');else await assert.rejects(convert('code','existing',requestImpl),error=>!error.message.includes('secret-canary'));
 }
});

test('session refuses unsafe state before starting callback receiver',async t=>{
 const {dir}=fixture(t);chmodSync(path.join(dir,'state'),0o644);let calls=0;
 await assert.rejects(continueSession(dir,'--receive',{receive:()=>{calls++;}}));assert.equal(calls,0);
});

test('parent directory entries are synchronized before any conversion POST',async t=>{
 const {dir}=fixture(t);const output=path.join(dir,'response');const order=[];
 await exchangeOnce('code',output,async()=>{order.push('send');return '{}';},{syncDirectory:file=>{assert.ok(existsSync(file));order.push(path.basename(file));}});
 assert.deepEqual(order,['response.attempt','response','send']);
});
test('directory sync failure stops before POST and retains the retry guard',async t=>{
 for(const failAt of [1,2]) {
  const {dir}=fixture(t);const output=path.join(dir,'response');let calls=0, syncs=0;
  await assert.rejects(exchangeOnce('code',output,async()=>{calls++;return '{}';},{syncDirectory:()=>{if(++syncs===failAt)throw Error('sync unavailable');}}));
  assert.equal(calls,0);assert.ok(existsSync(`${output}.attempt`));
  await assert.rejects(exchangeOnce('code',output,async()=>{calls++;return '{}';}));assert.equal(calls,0);
 }
});
