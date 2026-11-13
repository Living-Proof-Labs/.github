// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { run, parseArgs, GitHubApiError, renderHttpsJunit } from '../../tools/github/apply-repo-policy.mjs';
const policy = { repository: { has_wiki: false }, pages: { build_type: 'workflow', https_enforced: true, https_enforced_exempt: [{ repo: 'website', reason: 'Cloudflare' }] } };
function fixture(states) {
  const calls = [];
  const api = {
    async get(p) {
      calls.push(['GET', p]);
      const name = p.split('/')[3], state = states[name];
      assert.ok(state, 'request stays in inventory');
      if (!p.endsWith('/pages')) return { has_pages: state.missing ? false : true, has_wiki: true };
      if (state.denied) throw new GitHubApiError(403, 'denied', 'GET', p);
      if (state.missing || state.hidden) throw new GitHubApiError(404, 'not found', 'GET', p);
      return { https_enforced: state.https, build_type: 'legacy', cname: 'keep.example' };
    },
    async write(method,p,body) {
      calls.push([method,p,body]);
      const state = states[p.split('/')[3]];
      if (state.certificate) throw new GitHubApiError(422, 'certificate not ready',method,p);
      if (!state.ignoreWrite) state.https = body.https_enforced;
    }
  };
  const invoke = (options={}) => run({ policy, org: 'Example', inventory: { schema_version: 1, owner:'Example', repositories: Object.keys(states) }, httpsOnly:true, dryRun:true, api, ...options });
  return { calls, invoke };
}
test('HTTPS requires explicit inventory, matching owner and registered selection', async () => {
  assert.throws(()=>parseArgs(['--apply','--https-only']),/inventory/);
  assert.throws(()=>parseArgs(['--apply','--junit','out']),/https-only/);
  const f=fixture({a:{https:false}});
  await assert.rejects(f.invoke({repo:'other'}),/not in/);
  await assert.rejects(f.invoke({org:'Other'}),/owner/);
  assert.equal(f.calls.length,0);
});
test('HTTPS preview is read-only and does not observe unrelated policy endpoints',async()=>{
  const f=fixture({a:{https:false},website:{https:false}});
  const result=await f.invoke();
  assert.equal(result.failures,0);
  assert.deepEqual(result.repositories[0].lines,[{setting:'pages.https_enforced',current:false,desired:true}]);
  assert.ok(f.calls.every(c=>c[0]==='GET'));
  assert.equal(f.calls.length,2);
});
test('reviewed apply writes only HTTPS, verifies readback, repeated apply is a no-op',async()=>{
  const f=fixture({a:{https:false},website:{https:false}});
  const preview=await f.invoke();
  const applied=await f.invoke({dryRun:false,expectedPlan:preview.plan});
  assert.equal(applied.failures,0);
  assert.deepEqual(f.calls.filter(c=>c[0]!=='GET'),[['PUT','/repos/Example/a/pages',{https_enforced:true}]]);
  const again=await f.invoke({dryRun:false});
  assert.equal(again.failures,0);
  assert.equal(f.calls.filter(c=>c[0]!=='GET').length,1);
});
test('changed plan refuses all writes across inventory',async()=>{
  const states={a:{https:false},b:{https:false}};const f=fixture(states);
  const preview=await f.invoke();states.b.https=true;
  await assert.rejects(f.invoke({dryRun:false,expectedPlan:preview.plan}),/changed since preview/);
  assert.ok(f.calls.every(c=>c[0]==='GET'));
});
test('missing, hidden, denied, nonboolean and certificate failures stay distinct; eligible repo proceeds',async()=>{
 const f=fixture({missing:{missing:true},hidden:{hidden:true},denied:{denied:true},invalid:{https:'false'},cert:{https:false,certificate:true},good:{https:false}});
 const report=await f.invoke({dryRun:false});
 assert.equal(report.failures,5);
 const messages=report.repositories.flatMap(r=>r.failures.map(f=>f.message)).join('\n');
 assert.match(messages,/missing site/);assert.match(messages,/not treated as absent/);assert.match(messages,/403/);assert.match(messages,/non-boolean/);assert.match(messages,/certificate not ready/);
 assert.equal(f.calls.filter(c=>c[0]!=='GET').length,2);
 assert.equal(report.repositories.at(-1).failures.length,0);
 assert.match(renderHttpsJunit(report,'Example'),/failures="5"/);
});
test('read-back mismatch fails even on accepted write',async()=>{
 const f=fixture({a:{https:false,ignoreWrite:true}});
 assert.match((await f.invoke({dryRun:false})).repositories[0].failures[0].message,/read-back failed/);
});
test('invalid expected plan cannot bypass reviewed-plan guard',async()=>{
 for (const expectedPlan of [null,false,{},[]]) {
  const f=fixture({a:{https:false}});
  await assert.rejects(f.invoke({dryRun:false,expectedPlan}),/changed since preview/);
  assert.ok(f.calls.every(c=>c[0]==='GET'));
 }
 assert.throws(()=>parseArgs(['--apply','--inventory','x']),/https-only/);
});
test('preview differences are not passing compliance evidence',async()=>{
 const result=await fixture({a:{https:false}}).invoke();
 assert.match(renderHttpsJunit(result,'Example'),/skipped="1"/);
 assert.match(renderHttpsJunit(result,'Example'),/preview only/);
});
