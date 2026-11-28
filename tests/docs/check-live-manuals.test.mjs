// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkLiveManuals, collectDirectoryTargets } from '../../tools/docs/check-live-manuals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function copyDocs() {
  const dir = mkdtempSync(path.join(tmpdir(), 'org-live-manuals-'));
  cpSync(path.join(ROOT, 'docs'), path.join(dir, 'docs'), { recursive: true });
  return dir;
}

function mockFetch({ archivedRepos = new Set(), statusByUrl = new Map() } = {}) {
  return async (url, init = {}) => {
    const repoMatch = url.match(/\/repos\/Living-Proof-Labs\/([^/]+)$/);
    if (repoMatch) {
      const repo = repoMatch[1];
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: repo, archived: archivedRepos.has(repo) }),
      };
    }
    const status = statusByUrl.get(url) ?? 200;
    return { ok: status >= 200 && status < 400, status };
  };
}

test('collects verification-reports-action and livingproof-evaluator-health and excludes livingproof-verification', () => {
  const { repos, manualUrls } = collectDirectoryTargets(ROOT);
  assert.ok(repos.includes('livingproof-evaluator-health'));
  assert.ok(repos.includes('verification-reports-action'));
  assert.ok(!repos.includes('livingproof-verification'));
  assert.ok(manualUrls.includes('https://docs.livingprooflabs.com/livingproof-evaluator-health/'));
  assert.ok(manualUrls.includes('https://docs.livingprooflabs.com/verification-reports-action/'));
  assert.ok(!manualUrls.includes('https://docs.livingprooflabs.com/livingproof-verification/'));
});

test('passes when all listed repositories are active and all manual URLs return 200', async () => {
  const result = await checkLiveManuals(ROOT, { fetchImpl: mockFetch(), token: '' });
  assert.deepEqual(result.errors, []);
});

test('fails when an archived repository is listed in the directory', async () => {
  const dir = copyDocs();
  const indexPath = path.join(dir, 'docs/index.md');
  writeFileSync(
    indexPath,
    readFileSync(indexPath, 'utf8').replace(
      '| Website |',
      '| Archived verification | Archived. | [livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification) | [Manual](https://docs.livingprooflabs.com/livingproof-verification/) |\n| Website |',
    ),
  );
  const result = await checkLiveManuals(dir, {
    fetchImpl: mockFetch({ archivedRepos: new Set(['livingproof-verification']) }),
    token: '',
  });
  assert.ok(result.errors.some((e) => e.includes('Living-Proof-Labs/livingproof-verification: repository is archived')));
});

test('fails when a listed manual URL returns 404', async () => {
  const result = await checkLiveManuals(ROOT, {
    fetchImpl: mockFetch({
      statusByUrl: new Map([['https://docs.livingprooflabs.com/verification-reports-action/', 404]]),
    }),
    token: '',
  });
  assert.ok(result.errors.some((e) => e.includes('https://docs.livingprooflabs.com/verification-reports-action/: HTTP 404')));
});

test('falls back to GET when HEAD returns 405', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.includes('/repos/Living-Proof-Labs/')) {
      return { ok: true, status: 200, json: async () => ({ archived: false }) };
    }
    if (init.method === 'HEAD' && url === 'https://docs.livingprooflabs.com/verification-reports-action/') {
      return { ok: false, status: 405 };
    }
    return { ok: true, status: 200 };
  };
  const result = await checkLiveManuals(ROOT, { fetchImpl, token: '' });
  assert.deepEqual(result.errors, []);
  assert.ok(calls.some((c) => c.method === 'GET' && c.url === 'https://docs.livingprooflabs.com/verification-reports-action/'));
});

function counting(statusFor) {
  const calls = new Map();
  const fetchImpl = async (url, init = {}) => {
    const repoMatch = url.match(/\/repos\/Living-Proof-Labs\/([^/]+)$/);
    const n = (calls.get(url) || 0) + 1;
    calls.set(url, n);
    if (repoMatch) return { ok: true, status: 200, json: async () => ({ archived: false }) };
    const status = statusFor(url, n);
    if (status === 'throw') throw new Error('socket hang up');
    return { ok: status >= 200 && status < 400, status };
  };
  return { fetchImpl, calls };
}

const MANUAL = 'https://docs.livingprooflabs.com/verification-reports-action/';

test('a transient 5xx or network failure on a manual URL is retried once', async () => {
  for (const first of [503, 'throw']) {
    const { fetchImpl, calls } = counting((url, n) => (url === MANUAL && n === 1 ? first : 200));
    const result = await checkLiveManuals(ROOT, { fetchImpl, token: '' });
    assert.deepEqual(result.errors, [], String(first));
    assert.equal(calls.get(MANUAL), 2);
  }
});

test('a manual URL that fails twice is reported', async () => {
  const { fetchImpl, calls } = counting((url) => (url === MANUAL ? 503 : 200));
  const result = await checkLiveManuals(ROOT, { fetchImpl, token: '' });
  assert.deepEqual(result.errors, [`${MANUAL}: HTTP 503`]);
  assert.equal(calls.get(MANUAL), 2);
});

test('a 404 is a real answer and is not retried', async () => {
  const { fetchImpl, calls } = counting((url) => (url === MANUAL ? 404 : 200));
  const result = await checkLiveManuals(ROOT, { fetchImpl, token: '' });
  assert.deepEqual(result.errors, [`${MANUAL}: HTTP 404`]);
  assert.equal(calls.get(MANUAL), 1);
});

test('a GitHub API 5xx for a listed repository is retried once', async () => {
  let hits = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/repos/Living-Proof-Labs/verification-reports-action')) {
      hits += 1;
      return hits === 1
        ? { ok: false, status: 502 }
        : { ok: true, status: 200, json: async () => ({ archived: false }) };
    }
    if (url.includes('/repos/')) return { ok: true, status: 200, json: async () => ({ archived: false }) };
    return { ok: true, status: 200 };
  };
  const result = await checkLiveManuals(ROOT, { fetchImpl, token: '' });
  assert.deepEqual(result.errors, []);
  assert.equal(hits, 2);
});
