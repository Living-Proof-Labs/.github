// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizePrivateKey, signAppJwt } from './app-token.mjs';

export const SOURCE = 'Living-Proof-Labs/.github';
export const TARGET = 'Living-Proof-Labs/collaboration-guidelines';
export const REQUEST_ID = 'keel-identity-pilot-001';
export const MARKER = `<!-- ${REQUEST_ID} -->`;
export const BODY = `Keel App identity pilot. This fixed comment verifies the approved GitHub Actions posting path.\n\nRequest: \`${REQUEST_ID}\`\n\n${MARKER}`;
const positive = value => Number.isSafeInteger(value) && value > 0;

export function validateConfig(config, enabled = true) {
  const fields = ['schema_version','enabled','app_id','app_slug','installation_id','bot_user_id','issue_number'];
  if (!config || Object.keys(config).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(config,key)) || config.schema_version !== 1 || typeof config.enabled !== 'boolean') throw Error('Invalid pilot configuration.');
  if (!config.enabled && !enabled) return config;
  if (!config.enabled || ![config.app_id,config.installation_id,config.bot_user_id,config.issue_number].every(positive) || !/^[a-z0-9-]+$/.test(config.app_slug ?? '')) throw Error('Pilot not configured and enabled by review.');
  return config;
}
export function validateRun(config, env) {
  validateConfig(config);
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REPOSITORY !== SOURCE || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_WORKFLOW_REF !== `${SOURCE}/.github/workflows/keel-comment-pilot.yml@refs/heads/main` || env.GITHUB_RUN_ATTEMPT !== '1' || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || env.APPROVED_RUN_ID !== env.GITHUB_RUN_ID || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw Error('Unapproved source, ref, run or attempt.');
}

// No redirect, retry, configurable origin, token export or response-body logging.
export function api(config, token, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token) throw Error('Credential unavailable.');
  const issue = `/repos/${TARGET}/issues/${config.issue_number}`;
  return async (method, endpoint, body) => {
    const readAllowed = ['/app', `/app/installations/${config.installation_id}`, '/installation/repositories?per_page=100&page=1', issue].includes(endpoint) || new RegExp(`^${issue}/comments\\?per_page=100&page=[1-9][0-9]*$`).test(endpoint) || new RegExp(`^/repos/${TARGET}/issues/comments/[1-9][0-9]*$`).test(endpoint);
    if (!((method === 'GET' && body === undefined && readAllowed) || (method === 'POST' && endpoint === `${issue}/comments` && body?.body === BODY && Object.keys(body).length === 1))) throw Error('Operation outside pilot allowlist.');
    const response = await fetchImpl(`https://api.github.com${endpoint}`, {method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'lpl-keel-comment-pilot',Authorization:`Bearer ${token}`,...(body ? {'Content-Type':'application/json'} : {})},...(body ? {body:JSON.stringify(body)} : {})});
    if (response.status !== (method === 'POST' ? 201 : 200)) throw Error('GitHub request failed; outcome may be uncertain.');
    const chunks=[];let bytes=0;
    for await (const chunk of response.body) { bytes+=chunk.length;if(bytes>1_000_000)throw Error('Response exceeds limit.');chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
}
export async function verifyApp(config, env, request) {
  validateRun(config,env);
  const registration = await request('GET','/app');
  if (registration?.id !== config.app_id || registration.slug !== config.app_slug || registration.owner?.login !== 'Living-Proof-Labs' || registration.owner?.type !== 'Organization' || registration.permissions?.issues !== 'write') throw Error('Keel registration identity or existing permission unavailable.');
  const installation = await request('GET',`/app/installations/${config.installation_id}`);
  if (installation?.id !== config.installation_id || installation.app_id !== config.app_id || installation.app_slug !== config.app_slug || installation.account?.login !== 'Living-Proof-Labs' || installation.target_type !== 'Organization' || installation.suspended_at !== null || installation.permissions?.issues !== 'write' || installation.repository_selection !== 'selected') throw Error('Reviewed selected installation unavailable.');
  return {status:'app-identity-verified',request_id:REQUEST_ID};
}
function assertComment(config, comment) {
  if (!positive(comment?.id) || comment.body !== BODY || comment.user?.id !== config.bot_user_id || comment.user.login !== `${config.app_slug}[bot]` || comment.user.type !== 'Bot' || comment.performed_via_github_app?.id !== config.app_id) throw Error('Comment identity/body mismatch; inspect without retry.');
  return comment;
}
export async function postPilot(config, env, request) {
  validateRun(config,env);
  if (env.TOKEN_APP_SLUG !== config.app_slug || env.TOKEN_INSTALLATION_ID !== String(config.installation_id)) throw Error('Minted token identity mismatch.');
  const scope = await request('GET','/installation/repositories?per_page=100&page=1');
  if (scope?.total_count !== 1 || !Array.isArray(scope.repositories) || scope.repositories.length !== 1 || scope.repositories[0].full_name !== TARGET) throw Error('Pilot token is not limited to the target repository.');
  const issuePath = `/repos/${TARGET}/issues/${config.issue_number}`;
  const issue = await request('GET',issuePath);
  if (issue?.number !== config.issue_number || issue.url !== `https://api.github.com${issuePath}` || issue.pull_request || issue.locked !== false || issue.state !== 'open') throw Error('Approved open issue unavailable.');
  const matches=[];const ids=new Set();let complete=false;
  for(let page=1;page<=1000;page++) {
    const comments=await request('GET',`${issuePath}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(comments) || comments.length>100) throw Error('Incomplete comment evidence.');
    for(const comment of comments) {
      if(!positive(comment?.id) || ids.has(comment.id) || typeof comment.body!=='string')throw Error('Invalid or changing comment evidence.');
      ids.add(comment.id);if(comment.body.includes(MARKER))matches.push(comment);
    }
    if(comments.length<100){complete=true;break;}
  }
  if(!complete || matches.length>1)throw Error('Incomplete or duplicate pilot evidence.');
  if(matches.length===1){const comment=assertComment(config,matches[0]);return {status:'already-posted',request_id:REQUEST_ID,comment_id:comment.id,author:comment.user.login};}
  // Deliberately one POST. A failure after this point is uncertain and must not
  // be retried under another approved run ID for this same fixed request.
  const created=assertComment(config,await request('POST',`${issuePath}/comments`,{body:BODY}));
  const readback=assertComment(config,await request('GET',`/repos/${TARGET}/issues/comments/${created.id}`));
  if(readback.id!==created.id)throw Error('Comment readback mismatch.');
  return {status:'posted-and-verified',request_id:REQUEST_ID,comment_id:created.id,author:created.user.login};
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);const config=JSON.parse(readFileSync('config/github/keel-comment-pilot.json','utf8'));
    if(args.length!==1 || !['--check-config','--preflight','--verify-app','--post'].includes(args[0]))throw Error('Invalid command.');
    if(args[0]==='--check-config'){validateConfig(config,false);console.log('Pilot configuration parsed; disabled does not authorize execution.');}
    else {
      validateRun(config,process.env);
      if(args[0]==='--preflight')console.log('Fixed pilot request and one-use run authorization verified.');
      else if(args[0]==='--verify-app') {
        const key=normalizePrivateKey(process.env.KEEL_APP_PRIVATE_KEY,'Keel approved key');const {jwt}=signAppJwt(config.app_id,key);
        console.log(JSON.stringify(await verifyApp(config,process.env,api(config,jwt))));
      } else console.log(JSON.stringify(await postPilot(config,process.env,api(config,process.env.GH_TOKEN))));
    }
  } catch {console.error('Keel pilot stopped. No credential or response body logged. If posting may have started, inspect the approved run and target issue; never authorize another run for this request.');process.exitCode=1;}
}
