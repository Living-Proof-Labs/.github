// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

export function conversionEndpoint(code) {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('Code file does not contain a valid manifest code.');
  return `app-manifests/${code}/conversions`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage); process.exit(0); }
    const code = readFileSync(options['code-file'], 'utf8').trim();
    const endpoint = conversionEndpoint(code);
    const output = path.resolve(options.output);
    if (existsSync(output)) throw new Error(`Refusing to overwrite ${output}.`);
    if (!options.execute) {
      console.log(`Dry run: would POST ${endpoint} and save the secret response to ${output}. Re-run with --execute after owner approval.`);
      process.exit(0);
    }
    const response = execFileSync('gh', ['api', '--method', 'POST', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    writeFileSync(output, response, { mode: 0o600, flag: 'wx' });
    console.log(`Saved GitHub App registration response to ${output}. It contains secrets; do not commit or print it.`);
  } catch (error) { console.error(error.message); process.exit(1); }
}
