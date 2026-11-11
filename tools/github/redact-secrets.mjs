#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Remove GitHub credentials from text before it is printed or saved.
 *
 * Stateless installation tokens (ghs_<app id>_<JWT>, default since 2026-10-02)
 * contain dots and dashes. A legacy ghs_[A-Za-z0-9_]+ mask stops at the first
 * dot and leaves the JWT payload and signature. Match the whole token with
 * ghs_[A-Za-z0-9._-]{36,} and do that before bare JWT replacement, which would
 * otherwise leave the app id after ghs_. No trailing word boundary: a dot is
 * not a word character, so \b ends the match in the middle of the token.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REDACTED = '[redacted]';

function patterns() {
  return [
    /ghs_[A-Za-z0-9._-]{36,}/g,
    /gh[poru]_[A-Za-z0-9_]{36,}/g,
    /github_pat_[A-Za-z0-9_]{22,}/g,
    /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
  ];
}

export function redactSecrets(text, knownSecrets = []) {
  let cleaned = String(text ?? '');
  const secrets = Array.isArray(knownSecrets) ? knownSecrets : [knownSecrets];
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) cleaned = cleaned.replaceAll(secret, REDACTED);
  }
  for (const pattern of patterns()) cleaned = cleaned.replace(pattern, REDACTED);
  return cleaned;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked && import.meta.url === invoked) {
  const token = process.env.GH_TOKEN;
  const known = typeof token === 'string' && token.length > 0 ? [token] : [];
  process.stdout.write(redactSecrets(readFileSync(0, 'utf8'), known));
}
