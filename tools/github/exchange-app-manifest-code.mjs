// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, fsyncSync, writeFileSync } from 'node:fs';
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

export function token() { try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { throw new Error('Could not obtain GitHub authentication.'); } }
export function convert(code, bearer, requestImpl = https.request) {
  return new Promise((resolve, reject) => {
    const request = requestImpl({ hostname: 'api.github.com', path: `/app-manifests/${encodeURIComponent(code)}/conversions`, method: 'POST', headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${bearer}`, 'user-agent': 'repository-settings-bootstrap', 'x-github-api-version': '2026-03-10' } }, (response) => {
      const chunks = []; let bytes = 0;
      response.on('aborted', () => reject(new Error('Conversion response interrupted.')));
      response.on('error', () => reject(new Error('Conversion response failed.')));
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 1_000_000) request.destroy(new Error('Response limit.')); else chunks.push(chunk); }); response.on('end', () => response.statusCode === 201 ? resolve(Buffer.concat(chunks)) : reject(new Error(`GitHub conversion failed with HTTP ${response.statusCode}.`)));
    });
    request.setTimeout(30000, () => request.destroy(new Error('Conversion timeout.')));
    request.on('error', () => reject(new Error('GitHub conversion request failed.'))); request.end();
  });
}

// Reserve BEFORE sending. Retain both the attempt marker and response even on
// failure: GitHub may have consumed the code and issued credentials already.
export function syncParentDirectory(file) {
  const directory = openSync(path.dirname(file), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
export async function exchangeOnce(code, output, send, { syncDirectory = syncParentDirectory } = {}) {
  if (!validCode(code)) throw new Error('Invalid code.');
  const marker = openSync(`${output}.attempt`, 'wx', 0o600);
  try { writeFileSync(marker, 'Conversion attempted; never automatically replay. Inspect existing App on uncertainty.\n'); fsyncSync(marker); }
  finally { closeSync(marker); }
  // File fsync alone does not persist the new directory entry across a crash.
  // If directory sync is unsupported or fails, stop before sending anything.
  syncDirectory(`${output}.attempt`);
  const descriptor = openSync(output, 'wx', 0o600);
  try { syncDirectory(output); writeFileSync(descriptor, await send(code)); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
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
    const bearer = token();
    await exchangeOnce(code, output, value => convert(value, bearer));
    console.log(`Saved GitHub App registration response to ${output}. It contains secrets; do not commit or print it.`);
  } catch (error) { console.error(error.message === usage ? error.message : 'GitHub App conversion did not complete. Preserve local files; inspect the existing App before any recovery. Do not replay an uncertain conversion.'); process.exit(1); }
}
