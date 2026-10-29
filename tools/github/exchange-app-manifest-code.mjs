// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const usage = 'Usage: node tools/github/exchange-app-manifest-code.mjs --code-file FILE --output FILE --execute';

export function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') parsed.help = true;
    else if (argument === '--execute') parsed.execute = true;
    else if (['--code-file', '--output'].includes(argument)) parsed[argument.slice(2)] = args[++index];
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!parsed.help && (!parsed['code-file'] || !parsed.output)) throw new Error(usage);
  return parsed;
}

export function validCode(code) {
  return /^[A-Za-z0-9_-]+$/.test(code);
}

function token() { try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { throw new Error('Could not obtain GitHub authentication.'); } }
function convert(code, bearer) {
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'api.github.com', path: `/app-manifests/${encodeURIComponent(code)}/conversions`, method: 'POST', headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${bearer}`, 'user-agent': 'repository-settings-bootstrap', 'x-github-api-version': '2026-03-10' } }, (response) => {
      const chunks = []; response.on('data', (chunk) => chunks.push(chunk)); response.on('end', () => response.statusCode === 201 ? resolve(Buffer.concat(chunks)) : reject(new Error(`GitHub conversion failed with HTTP ${response.statusCode}.`)));
    });
    request.on('error', () => reject(new Error('GitHub conversion request failed.'))); request.end();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage); process.exit(0); }
    const code = readFileSync(options['code-file'], 'utf8').trim();
    if (!validCode(code)) throw new Error('Invalid code.');
    const output = path.resolve(options.output);
    if (!options.execute) {
      console.log(`Dry run: would exchange a manifest code and save the secret response to ${output}. Re-run with --execute after owner approval.`);
      process.exit(0);
    }
    const descriptor = openSync(output, 'wx', 0o600);
    try { writeFileSync(descriptor, await convert(code, token())); } catch (error) { closeSync(descriptor); unlinkSync(output); throw error; }
    closeSync(descriptor);
    console.log(`Saved GitHub App registration response to ${output}. It contains secrets; do not commit or print it.`);
  } catch (error) { console.error(error.message === usage ? error.message : 'GitHub App conversion did not complete.'); process.exit(1); }
}
