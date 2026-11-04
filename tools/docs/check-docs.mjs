#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Validate organization documentation before the root site publishes it:
// declared pages exist, local links and fragments resolve, the directory names only
// inventoried repositories, redirects target published pages, and Mermaid blocks
// stay within what the site and GitHub both render.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MERMAID_TYPES = ['flowchart', 'graph', 'sequenceDiagram', 'stateDiagram-v2', 'classDiagram', 'erDiagram'];
const MARKERS = ['manuals', 'projects'];

export function slugify(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s]+/g, '-');
}

// Split Markdown into prose lines and fenced blocks so links inside code are ignored.
export function scan(text) {
  const prose = [];
  const fences = [];
  let fence = null;
  text.split('\n').forEach((line, index) => {
    const open = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (fence) {
      if (open && line.trim().startsWith(fence.marker)) {
        fences.push(fence);
        fence = null;
      } else fence.body.push(line);
    } else if (open) {
      fence = { marker: open[1], lang: open[2], line: index + 1, body: [] };
    } else prose.push({ line: index + 1, text: line });
  });
  if (fence) fences.push({ ...fence, unclosed: true });
  return { prose, fences };
}

export function anchors(text) {
  const ids = new Set();
  for (const { text: line } of scan(text).prose) {
    const heading = line.match(/^#{1,6}\s+(.*?)\s*(\{#([\w-]+)\})?\s*$/);
    if (heading) ids.add(heading[3] || slugify(heading[1]));
    for (const m of line.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  }
  return ids;
}

export function links(text) {
  const found = [];
  for (const { line, text: prose } of scan(text).prose) {
    const stripped = prose.replace(/`[^`]*`/g, '');
    for (const m of stripped.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) found.push({ line, target: m[1] });
  }
  return found;
}

export function check(root) {
  const errors = [];
  const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
  const site = JSON.parse(read('docs/site.json'));
  const inventory = new Set(JSON.parse(read('config/github/repositories.json')).repositories);
  const pages = new Map();
  const published = new Set();
  for (const page of site.pages) {
    if (!/\.md$/.test(page.path) || !page.title || !page.license) {
      errors.push(`site.json: page ${page.source} needs a .md path, a title and a license`);
    }
    if (published.has(page.path)) errors.push(`site.json: ${page.path} is published twice`);
    published.add(page.path);
    if (!existsSync(path.join(root, page.source))) {
      errors.push(`site.json: missing page ${page.source}`);
      continue;
    }
    pages.set(page.source, read(page.source));
  }
  if (!published.has('index.md')) errors.push('site.json: no index.md homepage');
  const html = new Set([...published].map((p) => p.replace(/\.md$/, '.html')));
  for (const [from, to] of Object.entries(site.redirects || {})) {
    if (html.has(from)) errors.push(`site.json: redirect ${from} would hide a published page`);
    if (!html.has(to.split('#')[0])) errors.push(`site.json: redirect ${from} targets ${to}, which is not a published page`);
  }

  const directory = JSON.parse(read(site.directory));
  for (const kind of MARKERS) {
    const rows = directory[kind] || [];
    if (!rows.length) errors.push(`${site.directory}: no ${kind}`);
    for (const row of rows) {
      if (!inventory.has(row.repository)) {
        errors.push(`${site.directory}: ${kind} entry ${row.repository} is not in config/github/repositories.json`);
      }
      if (kind === 'manuals' && !/^https:\/\//.test(row.url || '')) errors.push(`${site.directory}: manual ${row.repository} needs an https url`);
    }
  }
  const home = site.pages.find((p) => p.path === 'index.md');
  if (home && pages.has(home.source)) {
    for (const kind of MARKERS) {
      const text = pages.get(home.source);
      for (const row of directory[kind] || []) {
        const url = kind === 'manuals' ? row.url : `https://github.com/Living-Proof-Labs/${row.repository}`;
        if (url && !text.includes(`](${url})`)) errors.push(`${home.source}: project directory does not link ${url}`);
      }
    }
  }

  const ids = new Map([...pages].map(([source, text]) => [source, anchors(text)]));
  for (const [source, text] of pages) {
    const where = path.posix.dirname(source);
    for (const { line, target } of links(text)) {
      if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const [file, fragment] = target.split('#');
      const resolved = file ? path.posix.normalize(path.posix.join(where, decodeURIComponent(file))) : source;
      if (resolved.startsWith('..') || resolved.startsWith('/')) {
        errors.push(`${source}:${line}: ${target} leaves the repository`);
        continue;
      }
      if (/\.html$/.test(file)) {
        errors.push(`${source}:${line}: link ${target} to the .md source, not published .html`);
        continue;
      }
      if (!existsSync(path.join(root, resolved))) {
        errors.push(`${source}:${line}: broken link ${target} (${resolved} does not exist)`);
        continue;
      }
      if (fragment && ids.has(resolved) && !ids.get(resolved).has(fragment)) {
        errors.push(`${source}:${line}: broken fragment ${target} (no #${fragment} in ${resolved})`);
      }
    }
    for (const fence of scan(text).fences) {
      if (fence.unclosed) errors.push(`${source}:${fence.line}: unclosed code fence`);
      if (fence.lang !== 'mermaid') continue;
      const first = fence.body.find((l) => l.trim() && !l.trim().startsWith('%%')) || '';
      if (!MERMAID_TYPES.includes(first.trim().split(/\s+/)[0])) {
        errors.push(`${source}:${fence.line}: Mermaid type "${first.trim()}" is not one of ${MERMAID_TYPES.join(', ')}`);
      }
      if (fence.body.some((l) => l.includes('%%{init'))) errors.push(`${source}:${fence.line}: Mermaid %%{init}%% overrides the site theme`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const errors = check(root);
  for (const error of errors) console.error(error);
  if (errors.length) process.exit(1);
  const site = JSON.parse(readFileSync(path.join(root, 'docs/site.json'), 'utf8'));
  console.log(`organization documentation: ${site.pages.length} pages, links, fragments, directory and diagrams valid`);
}
