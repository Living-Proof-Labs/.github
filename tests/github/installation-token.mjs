// SPDX-License-Identifier: Apache-2.0
// Fixture tokens only. These are built in tests and are not GitHub credentials.
import { randomBytes } from 'node:crypto';

export const CLASSIC_INSTALLATION_TOKEN = `ghs_${'A'.repeat(36)}`;

export function statelessInstallationToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'stateless-fixture' })).toString('base64url');
  const signature = 'not-a-real_signature';
  const appId = '9876543210';
  return {
    appId,
    header,
    payload,
    signature,
    token: `ghs_${appId}_${header}.${payload}.${signature}`
  };
}

/** About 520 characters, with a 256-byte RS256-shaped signature. Not a real token. */
export function rs256InstallationToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const signature = randomBytes(256).toString('base64url');
  const appId = '9876543210';
  const claims = { sub: 'stateless-fixture', iss: 'fixture' };
  let pad = '';
  let payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  let token = `ghs_${appId}_${header}.${payload}.${signature}`;
  while (token.length < 520) {
    pad += 'x';
    payload = Buffer.from(JSON.stringify({ ...claims, pad })).toString('base64url');
    token = `ghs_${appId}_${header}.${payload}.${signature}`;
  }
  return { appId, header, payload, signature, token };
}
