// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const usage = 'Usage: node tools/github/receive-app-manifest-code.mjs --output FILE';

export function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) throw new Error(usage);
  return { output: path.resolve(args[1]) };
}

export function storeCode(output, code) {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('Callback did not contain a valid manifest code.');
  if (existsSync(output)) throw new Error(`Refusing to overwrite ${output}.`);
  writeFileSync(output, `${code}\n`, { mode: 0o600, flag: 'wx' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage); process.exit(0); }
    const server = createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method !== 'GET' || url.pathname !== '/github-app-manifest/callback') {
        response.writeHead(404).end('Not found.');
        return;
      }
      try {
        storeCode(options.output, url.searchParams.get('code') ?? '');
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Code saved locally. You may close this tab and return to the terminal.');
        server.close(() => console.log(`Saved one-time manifest code to ${options.output}.`));
      } catch (error) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Callback was not accepted. Check the terminal.');
        console.error(error.message);
      }
    });
    server.listen(8787, '127.0.0.1', () => console.log('Waiting for the GitHub App manifest callback on http://127.0.0.1:8787.'));
  } catch (error) { console.error(error.message); process.exit(1); }
}
