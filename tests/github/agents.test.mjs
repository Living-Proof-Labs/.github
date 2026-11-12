// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BOTS } from '../../tools/github/app-token.mjs';
import { validateAgents } from '../../tools/github/verify-agents.mjs';
import { BOT_MANIFESTS } from '../../tools/github/verify-app-manifests.mjs';
import { anchors, links } from '../../tools/docs/check-docs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function entry(overrides = {}) {
  return {
    id: 'rivet',
    role: 'Head of Engineering and Delivery',
    manifest: 'config/github/apps/rivet.manifest.json',
    github_identity: { commit_name: null, commit_email: null, app_slug: null, app_id: null },
    ...overrides
  };
}

function directory(agents = [entry()]) {
  return {
    schema_version: 1,
    owner: 'Living-Proof-Labs',
    identity_note: 'Identity fields stay null until this repository records them.',
    agents
  };
}

test('accepts a directory whose manifest path exists and whose role is set', () => {
  const result = validateAgents(directory(), { exists: () => true });
  assert.equal(result.agents[0].id, 'rivet');
});

test('requires unique ids, a non-empty role, and a manifest that exists', () => {
  assert.throws(() => validateAgents(directory([entry(), entry({ role: 'Other' })]), { exists: () => true }), /Duplicate agent id rivet/);
  assert.throws(() => validateAgents(directory([entry({ role: '  ' })]), { exists: () => true }), /non-empty role/);
  assert.throws(() => validateAgents(directory([entry({ role: '' })]), { exists: () => true }), /non-empty role/);
  assert.throws(() => validateAgents(directory(), { exists: () => false }), /manifest does not exist/);
  assert.throws(() => validateAgents(directory([entry({ manifest: '../secrets.manifest.json' })]), { exists: () => true }), /config\/github\/apps/);
  assert.throws(() => validateAgents(directory([entry({ id: 'Rivet' })]), { exists: () => true }), /lowercase slug/);
});

test('leaves unknown GitHub identity fields null rather than inventing them', () => {
  const agent = entry();
  agent.github_identity.app_id = 4242;
  assert.throws(() => validateAgents(directory([agent]), { exists: () => true }), /app_id/);
  agent.github_identity.app_id = '   ';
  assert.throws(() => validateAgents(directory([agent]), { exists: () => true }), /app_id/);
  agent.github_identity.app_id = null;
  agent.github_identity.app_slug = 'living-proof-labs-rivet';
  assert.equal(validateAgents(directory([agent]), { exists: () => true }).agents[0].github_identity.app_slug, 'living-proof-labs-rivet');
});

test('the committed agent directory matches the App manifests in this repository', () => {
  const committed = JSON.parse(readFileSync(path.join(root, 'config/github/agents.json'), 'utf8'));
  const inventory = JSON.parse(readFileSync(path.join(root, 'config/github/repositories.json'), 'utf8'));
  assert.equal(validateAgents(committed, { root }).owner, inventory.owner);
  assert.ok(committed.agents.every(agent => BOTS.includes(agent.id))); // Identity metadata is optional for enrollment.
  assert.match(committed.identity_note, /null/);
  const roles = {
    rivet: 'Head of Engineering and Delivery',
    cody: 'Software engineer',
    vera: 'Verification',
    art: 'Style and product guidance',
    keel: 'Repository review and coordination'
  };
  for (const agent of committed.agents) {
    assert.equal(agent.role, roles[agent.id]);
    assert.equal(agent.manifest, BOT_MANIFESTS[agent.id].file);
    assert.equal(existsSync(path.join(root, agent.manifest)), true);
    assert.deepEqual(Object.keys(agent.github_identity).sort(), ['app_id', 'app_slug', 'commit_email', 'commit_name']);
  }
});

test('the owner guide keeps the stateless-token notes and its links resolve here', () => {
  const guidePath = 'docs/GITHUB-APPS.md';
  const guide = readFileSync(path.join(root, guidePath), 'utf8');
  assert.match(guide, /c2ba2653ec7ec2685525a63f41ec29f47c70a657/);
  assert.match(guide, /minimum commit that accepts a stateless installation token/);
  assert.match(guide, /Earlier commits reject a `ghs_<APPID>_<JWT>` token and exit 1 with\n`Installation token response did not include a usable token\.`/);
  assert.match(guide, /On Linux, use one of `wl-copy` or\n`xclip -selection clipboard`/);
  assert.match(guide, /On Linux, use one of these:/);
  assert.match(guide, /scripts\/app-token rivet >\/dev\/null && echo "token OK"/);
  assert.doesNotMatch(guide, /does not contain that helper/);
  assert.doesNotMatch(guide, /\]\(SETTINGS\.md/);
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /\]\(docs\/GITHUB-APPS\.md\)/);
  assert.match(readme, /directory of\nagents that have GitHub Apps/);
  assert.match(readme, /An agent without an App is not listed/);
  assert.doesNotMatch(readme, /directory of\norganization agents/);
  assert.match(readFileSync(path.join(root, 'docs/github-app-bootstrap.md'), 'utf8'), /agents that have\nGitHub Apps/);
  assert.match(guide, /directory of\nagents that have GitHub Apps/);
  for (const source of [guidePath, 'README.md', 'docs/repository-operations.md', 'docs/github-app-bootstrap.md']) {
    const text = source === guidePath ? guide : readFileSync(path.join(root, source), 'utf8');
    for (const { target } of links(text)) {
      if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const [file, fragment] = target.split('#');
      const resolved = file
        ? path.normalize(path.join(root, path.dirname(source), file))
        : path.join(root, source);
      assert.equal(existsSync(resolved), true, `${source} -> ${target}`);
      assert.equal(resolved.startsWith(`${root}${path.sep}`) || resolved === root, true, target);
      if (!fragment || !resolved.endsWith('.md')) continue;
      assert.equal(anchors(readFileSync(resolved, 'utf8')).has(fragment), true, `${source} -> #${fragment}`);
    }
  }
});
