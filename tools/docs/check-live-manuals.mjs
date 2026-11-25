#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Verify that repositories listed in the organization directory are not archived
// on GitHub and that every listed manual URL resolves (no 404 or other error).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { directoryRows } from './check-docs.mjs';

const OWNER = 'Living-Proof-Labs';
const USER_AGENT = 'Living-Proof-Labs-docs-link-check';

function extractRepo(cell) {
  const match = (cell || '').match(/\]\(https:\/\/github\.com\/Living-Proof-Labs\/([^)]+)\)/);
  return match ? match[1] : null;
}

function extractUrls(cell) {
  return [...(cell || '').matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
}

export function collectDirectoryTargets(root) {
  const directory = JSON.parse(readFileSync(path.join(root, 'docs/directory.json'), 'utf8'));
  const indexText = readFileSync(path.join(root, 'docs/index.md'), 'utf8');
  const repos = new Set();
  const manualUrls = new Set();

  for (const entry of [...(directory.manuals || []), ...(directory.projects || [])]) {
    if (entry.repository) repos.add(entry.repository);
    if (entry.url) manualUrls.add(entry.url);
    if (entry.documentation?.url) manualUrls.add(entry.documentation.url);
  }

  for (const row of directoryRows(indexText)) {
    const repo = extractRepo(row[2]);
    if (repo) repos.add(repo);
    for (const url of extractUrls(row[3])) manualUrls.add(url);
  }

  return { repos: [...repos], manualUrls: [...manualUrls] };
}

export async function checkLiveManuals(root, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token ?? (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '');
  const apiBase = options.apiBase || 'https://api.github.com';
  const { repos, manualUrls } = collectDirectoryTargets(root);
  const errors = [];

  const apiHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  for (const repo of repos) {
    const endpoint = `${apiBase}/repos/${OWNER}/${repo}`;
    try {
      const response = await fetchImpl(endpoint, { headers: apiHeaders });
      if (!response.ok) {
        errors.push(`${OWNER}/${repo}: GitHub API returned HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (data.archived === true) {
        errors.push(`${OWNER}/${repo}: repository is archived`);
      }
    } catch (error) {
      errors.push(`${OWNER}/${repo}: GitHub API check failed (${error.message})`);
    }
  }

  for (const url of manualUrls) {
    try {
      let response = await fetchImpl(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } });
      if (response.status === 405) {
        response = await fetchImpl(url, { method: 'GET', headers: { 'User-Agent': USER_AGENT } });
      }
      if (response.status >= 400) {
        errors.push(`${url}: HTTP ${response.status}`);
      }
    } catch (error) {
      errors.push(`${url}: request failed (${error.message})`);
    }
  }

  return { repos, manualUrls, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const { repos, manualUrls, errors } = await checkLiveManuals(root);
  for (const error of errors) console.error(error);
  if (errors.length) process.exit(1);
  console.log(`live manual check: ${repos.length} repositories active, ${manualUrls.length} manual URLs reachable`);
}
