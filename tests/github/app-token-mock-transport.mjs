// SPDX-License-Identifier: Apache-2.0
// Test double for node:http(s).request. Loaded with NODE_OPTIONS=--import.
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';

function fakeRequest(options, callback) {
  const headers = options.headers ?? {};
  const headerOk = headers.accept === 'application/vnd.github+json'
    && headers['user-agent'] === 'living-proof-labs-app-token'
    && headers['x-github-api-version'] === '2026-03-10'
    && typeof headers.authorization === 'string'
    && headers.authorization.startsWith('Bearer ');
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.destroy = () => request;
  request.end = () => {
    const resource = options.path ?? '';
    const unauthorized = process.env.APP_TOKEN_MOCK === 'unauthorized';
    const tokenExchange = resource.includes('/access_tokens');
    const status = headerOk ? (unauthorized && tokenExchange ? 401 : (tokenExchange ? 201 : 200)) : 500;
    const payload = tokenExchange
      ? (unauthorized
        ? JSON.stringify({ message: 'bad', token: 'ghs_should_not_leak', pem: 'BEGIN PRIVATE KEY' })
        : JSON.stringify({ token: 'ghs_fromserver', expires_at: '2030-01-01T00:00:00Z', private_key: 'BEGIN PRIVATE KEY' }))
      : JSON.stringify({ id: 77, account: { login: 'Living-Proof-Labs' } });
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = status;
      callback(response);
      response.emit('data', Buffer.from(payload));
      response.emit('end');
    });
  };
  return request;
}

http.request = fakeRequest;
https.request = fakeRequest;
