// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { api, validateRun, validateConfig, verifyApp, postPilot, SOURCE, TARGET, BODY, MARKER } from '../../tools/github/keel-comment-pilot.mjs';
const config={schema_version:1,enabled:true,app_id:123,app_slug:'keel-fixture',installation_id:456,bot_user_id:789,issue_number:42};
const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:SOURCE,GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:`${SOURCE}/.github/workflows/keel-comment-pilot.yml@refs/heads/main`,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',APPROVED_RUN_ID:'12345',GITHUB_SHA:'a'.repeat(40),TOKEN_APP_SLUG:config.app_slug,TOKEN_INSTALLATION_ID:'456'};
const comment=()=>({id:901,body:BODY,user:{id:789,login:'keel-fixture[bot]',type:'Bot'},performed_via_github_app:{id:123}});
const issue=`/repos/${TARGET}/issues/42`;
function requests({comments=[],postError,readback=comment(),scope={total_count:1,repositories:[{full_name:TARGET}]}}={}){
 const calls=[];const request=async(method,endpoint,body)=>{
  calls.push({method,endpoint,body});if(endpoint==='/installation/repositories?per_page=100&page=1')return scope;
  if(endpoint===issue)return {number:42,url:`https://api.github.com${issue}`,state:'open',locked:false};
  if(method==='POST'){if(postError)throw postError;return comment();}
  if(endpoint.includes('/issues/comments/'))return readback;
  return comments;
 };return {request,calls};
}
test('committed pilot is disabled and has no guessed identity or destination issue',()=>{
 const saved=JSON.parse(readFileSync('config/github/keel-comment-pilot.json'));validateConfig(saved,false);assert.equal(saved.enabled,false);
 for(const field of ['app_id','app_slug','installation_id','bot_user_id','issue_number'])assert.equal(saved[field],null);
 assert.throws(()=>validateRun(saved,env));
});
test('wrong source, ref, operation context, run, rerun or missing approval never authenticates',async()=>{
 for(const change of [{GITHUB_REF:'refs/heads/feature'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_EVENT_NAME:'pull_request_target'},{GITHUB_WORKFLOW_REF:'other'},{APPROVED_RUN_ID:''},{GITHUB_RUN_ID:'999'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_ACTIONS:'false'}]){
  let reads=0;await assert.rejects(postPilot(config,{...env,...change},async()=>{reads++;}));assert.equal(reads,0);
 }
});
test('App identity checked before installation; wrong owner and grant fail',async()=>{
 const reg={id:123,slug:'keel-fixture',owner:{login:'Living-Proof-Labs',type:'Organization'},permissions:{issues:'write'}};
 const inst={id:456,app_id:123,app_slug:'keel-fixture',account:{login:'Living-Proof-Labs'},target_type:'Organization',suspended_at:null,permissions:{issues:'write'},repository_selection:'selected'};
 assert.equal((await verifyApp(config,env,async(_m,p)=>p==='/app'?reg:inst)).status,'app-identity-verified');
 for(const altered of [{...reg,id:1},{...reg,owner:{login:'other',type:'Organization'}},{...reg,permissions:{issues:'read'}}]){let calls=0;await assert.rejects(verifyApp(config,env,async()=>{calls++;return altered;}));assert.equal(calls,1);}
 for(const change of [{repository_selection:'all'},{suspended_at:'now'},{app_id:1},{permissions:{issues:'read'}}])await assert.rejects(verifyApp(config,env,async(_m,p)=>p==='/app'?reg:{...inst,...change}));
});
test('one fixed POST and author readback; repeating observed request is a no-op',async()=>{
 const {request,calls}=requests();const result=await postPilot(config,env,request);assert.equal(result.status,'posted-and-verified');
 assert.deepEqual(calls.filter(x=>x.method==='POST'),[{method:'POST',endpoint:`${issue}/comments`,body:{body:BODY}}]);
 const existing=requests({comments:[comment()]});assert.equal((await postPilot(config,env,existing.request)).status,'already-posted');assert.equal(existing.calls.filter(x=>x.method==='POST').length,0);
});
test('foreign, altered or duplicate marker cannot be adopted or retried',async()=>{
 for(const comments of [[{...comment(),user:{id:1,login:'human',type:'User'}}],[{...comment(),body:`different ${MARKER}`}],[comment(),{...comment(),id:902}]]){
  const {request,calls}=requests({comments});await assert.rejects(postPilot(config,env,request));assert.equal(calls.filter(x=>x.method==='POST').length,0);
 }
});
test('token identity and repository restriction are required before commenting',async()=>{
 for(const change of [{TOKEN_APP_SLUG:'rivet'},{TOKEN_INSTALLATION_ID:'999'}]){const {request,calls}=requests();await assert.rejects(postPilot(config,{...env,...change},request));assert.equal(calls.length,0);}
 const {request,calls}=requests({scope:{total_count:2,repositories:[{full_name:TARGET},{full_name:SOURCE}]}});await assert.rejects(postPilot(config,env,request));assert.equal(calls.filter(x=>x.method==='POST').length,0);
});
test('complete pagination required; denied or duplicate evidence prevents POST',async()=>{
 const base=requests();let pages=0;
 const run=async(method,endpoint,body)=>{if(endpoint.includes('comments?'))return ++pages===1?Array.from({length:100},(_,i)=>({id:i+1,body:'unrelated'})):[];return base.request(method,endpoint,body);};
 await postPilot(config,env,run);assert.equal(pages,2);
 for(const mode of ['denied','duplicate']){const {request,calls}=requests();let n=0;await assert.rejects(postPilot(config,env,async(m,p,b)=>{if(p.includes('comments?')){if(mode==='denied')throw Error('403 secret');return ++n===1?Array.from({length:100},(_,i)=>({id:i+1,body:'unrelated'})):[{id:1,body:'duplicate'}];}return request(m,p,b);}));assert.equal(calls.filter(x=>x.method==='POST').length,0);}
});
test('uncertain POST is sent once; wrong readback never claims success',async()=>{
 const broken=requests({postError:Error('timeout')});await assert.rejects(postPilot(config,env,broken.request));assert.equal(broken.calls.filter(x=>x.method==='POST').length,1);
 const bad=requests({readback:{...comment(),user:{id:1,login:'wrong',type:'Bot'}}});await assert.rejects(postPilot(config,env,bad.request));assert.equal(bad.calls.filter(x=>x.method==='POST').length,1);
});
test('transport permits only fixed API operations, never follows redirects or retries',async()=>{
 let calls=0;const request=api(config,'secret-canary',async(url,options)=>{calls++;assert.equal(url,`https://api.github.com${issue}/comments`);assert.equal(options.redirect,'error');assert.equal(options.method,'POST');assert.equal(options.body,JSON.stringify({body:BODY}));return new Response(JSON.stringify(comment()),{status:201});});
 await request('POST',`${issue}/comments`,{body:BODY});assert.equal(calls,1);
 for(const [method,endpoint,body] of [['DELETE',`${issue}/comments`],['POST',`${issue}/comments`,{body:'arbitrary'}],['POST','/repos/other/repo/issues/42/comments',{body:BODY}],['GET','https://evil.invalid'],['GET','/user']])await assert.rejects(request(method,endpoint,body));assert.equal(calls,1);
 for(const status of [302,401,403,404,500]){let attempts=0;await assert.rejects(api(config,'secret',async()=>{attempts++;return new Response('SECRET_BODY',{status});})('POST',`${issue}/comments`,{body:BODY}));assert.equal(attempts,1);}
});
test('disabled CLI produces no secret or API-body output',()=>{
 const result=spawnSync(process.execPath,['tools/github/keel-comment-pilot.mjs','--post'],{encoding:'utf8',env:{...process.env,...env,GH_TOKEN:'TOKEN_CANARY',KEEL_APP_PRIVATE_KEY:'KEY_CANARY'}});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/TOKEN_CANARY|KEY_CANARY/);
});
test('workflow remains main-only, one operation, pinned actions, no external token output',()=>{
 const workflow=readFileSync('.github/workflows/keel-comment-pilot.yml','utf8');assert.match(workflow,/workflow_dispatch:/);assert.doesNotMatch(workflow,/pull_request:|pull_request_target:|schedule:|workflow_call:|inputs:/);
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);assert.match(workflow,/environment: keel-comment-pilot/);assert.match(workflow,/repositories: collaboration-guidelines/);assert.match(workflow,/permission-issues: write/);assert.match(workflow,/skip-token-revoke: false/);
 assert.doesNotMatch(workflow,/GITHUB_ENV|GITHUB_OUTPUT|upload-artifact|outputs:\n|permission-contents: write|permission-administration/);
 for(const line of workflow.split('\n').filter(x=>x.includes('uses:')))assert.match(line,/@[a-f0-9]{40} /);
});
test('transport caps bodies and supplies an abort signal without retry',async()=>{
 for(const mode of ['oversized','malformed','aborted']) {
  let calls=0;const request=api(config,'TOKEN_CANARY',async(_url,options)=>{
   calls++;assert.ok(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);
   if(mode==='aborted')throw new DOMException('TOKEN_CANARY','AbortError');
   return new Response(mode==='oversized'?'x'.repeat(1000001):'not-json',{status:200});
  });
  await assert.rejects(request('GET',issue));assert.equal(calls,1);
 }
});
