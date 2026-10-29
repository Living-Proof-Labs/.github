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
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function storeCode(output, code) {
  if (!/^[A-Za-z0-9_-]+$/.test(code) || existsSync(output)) throw new Error('Callback was not accepted.');
  writeFileSync(output, `${code}\n`, { mode: 0o600, flag: 'wx' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage); process.exit(0); }
    const expectedState = readFileSync(options.stateFile, 'utf8').trim();
    const server = createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method !== 'GET' || request.headers.host !== '127.0.0.1:8787' || url.pathname !== '/github-app-manifest/callback' || !matchesState(expectedState, url.searchParams.get('state') ?? '')) {
        response.writeHead(400, { 'cache-control': 'no-store' }).end('Callback was not accepted.');
        return;
      }
      try {
        storeCode(options.output, url.searchParams.get('code') ?? '');
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        response.end('Code saved locally. You may close this tab and return to the terminal.');
        server.close(() => console.log(`Saved one-time manifest code to ${options.output}.`));
      } catch {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        response.end('Callback was not accepted.');
      }
    });
    server.listen(8787, '127.0.0.1', () => console.log('Waiting for the GitHub App manifest callback on http://127.0.0.1:8787.'));
  } catch { console.error('Could not start the local callback receiver.'); process.exit(1); }
}
