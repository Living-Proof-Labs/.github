// SPDX-License-Identifier: Apache-2.0
// Fixture tokens only. These are built in tests and are not GitHub credentials.

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
