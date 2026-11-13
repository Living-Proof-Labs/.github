// SPDX-License-Identifier: Apache-2.0
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const usage = 'Usage: node tools/github/receive-app-manifest-code.mjs --output FILE --state-file FILE';

export function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.length !== 4 || !args.includes('--output') || !args.includes('--state-file')) throw new Error(usage);
  return { output: path.resolve(args[args.indexOf('--output') + 1]), stateFile: path.resolve(args[args.indexOf('--state-file') + 1]) };
}

export function matchesState(expected, received) {
  if (!expected || !received) return false;
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function storeCode(output, code) {
  if (!/^[A-Za-z0-9_-]+$/.test(code) || existsSync(output)) throw new Error('Callback was not accepted.');
  writeFileSync(output, `${code}\n`, { mode: 0o600, flag: 'wx' });
}

export function acceptCallback(request, expectedState) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(expectedState)) return null;
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' || request.headers.host !== '127.0.0.1:8787' || url.pathname !== '/github-app-manifest/callback' || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1 || !matchesState(expectedState, url.searchParams.get('state') ?? '')) return null;
    const code = url.searchParams.get('code');
    return /^[A-Za-z0-9_-]+$/.test(code) ? code : null;
  } catch { return null; }
}
export function receiveCode(output, stateFile, timeout = 3600000) {
  const expectedState = readFileSync(stateFile, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(expectedState) || existsSync(output)) throw new Error('Invalid or completed callback session.');
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const code = acceptCallback(request, expectedState);
      if (!code) { response.writeHead(400, { 'cache-control': 'no-store' }).end('Callback was not accepted.'); return; }
      try {
        storeCode(output, code);
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('Code saved locally. Return to the terminal.');
        clearTimeout(timer); server.close(() => resolve());
      } catch { response.writeHead(400, { 'cache-control': 'no-store' }).end('Callback was not accepted.'); }
    });
    const timer = setTimeout(() => { server.close(); server.closeAllConnections(); reject(new Error('Callback session expired.')); }, timeout);
    server.on('error', () => { clearTimeout(timer); reject(new Error('Could not bind local callback.')); });
    server.listen(8787, '127.0.0.1', () => console.log('Waiting for the GitHub App manifest callback on http://127.0.0.1:8787.'));
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(usage);
    else { await receiveCode(options.output, options.stateFile); console.log('Saved one-time manifest code locally.'); }
  } catch { console.error('Could not receive the local callback. Preserve the session and inspect existing Apps before retrying.'); process.exitCode = 1; }
}
