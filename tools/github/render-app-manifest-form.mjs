// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const usage = 'Usage: node tools/github/render-app-manifest-form.mjs --manifest FILE --output FILE --state-output FILE [--organization OWNER]';

export function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') parsed.help = true;
    else if (['--manifest', '--output', '--state-output', '--organization'].includes(argument)) parsed[argument.slice(2)] = args[++index];
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!parsed.help && (!parsed.manifest || !parsed.output || !parsed['state-output'])) throw new Error(usage);
  return parsed;
}

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export const createState = () => randomBytes(32).toString('base64url');
export function registrationForm(manifest, organization, state) {
  const destination = organization
    ? `https://github.com/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
  return `<!doctype html>\n<title>GitHub App manifest registration</title>\n<form method="post" action="${escape(destination)}">\n  <input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}">\n  <input type="hidden" name="state" value="${escape(state)}">\n  <button type="submit">Register this GitHub App with GitHub</button>\n</form>\n<p>Review the manifest before submitting. This form performs the owner-consent browser step only.</p>\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage); process.exit(0); }
    const state = createState();
    writeFileSync(path.resolve(options['state-output']), `${state}\n`, { mode: 0o600, flag: 'wx' });
    const manifest = JSON.parse(readFileSync(options.manifest, 'utf8'));
    writeFileSync(path.resolve(options.output), registrationForm(manifest, options.organization, state), { mode: 0o600, flag: 'wx' });
    console.log(`Wrote local owner-consent form: ${path.resolve(options.output)}`);
  } catch (error) { console.error(error.message === usage ? error.message : 'Could not create local bootstrap files.'); process.exit(1); }
}
