// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DryRunWriteError,
  createGitHubClient,
  fetchPinnedPolicy,
  gitBlobSha,
  isGraphqlMutation,
  listOrgRepositories,
  main,
  manualSettingNames,
  parseArgs,
  planRepository,
  policyNotices,
  validatePolicy
} from '../../tools/github/apply-repo-policy.mjs';
import { statelessInstallationToken } from './installation-token.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const fixturePath = path.join(root, 'tests/github/fixtures/pinned-repository-policy.json');
const pinnedBytes = readFileSync(fixturePath);
const TOKEN = 'test-token-value';
const PINNED_BLOB = '018783d2796110656c91f68424aa0e4ce2379662';

function pinned() {
  return JSON.parse(pinnedBytes.toString('utf8'));
}

function withHttps(policy) {
  return { ...policy, pages: { ...policy.pages, https_enforced: true } };
}

function tempDirectory(t, prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writePolicy(t, policy) {
  const file = path.join(tempDirectory(t, 'apply-repo-policy-'), 'policy.json');
  writeFileSync(file, JSON.stringify(policy));
  return file;
}

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write: (chunk) => { stdout.push(chunk); } },
    stderr: { write: (chunk) => { stderr.push(chunk); } },
    out: () => stdout.join(''),
    err: () => stderr.join('')
  };
}

function observedMatching(policy) {
  const observed = {
    repository: { ...structuredClone(policy.repository), name: 'alpha', has_pages: true }
  };
  if (policy.graphql_repository) {
    observed.sponsorship = {
      id: 'R_alpha',
      hasSponsorshipsEnabled: policy.graphql_repository.hasSponsorshipsEnabled
    };
  }
  if (typeof policy.immutable_releases === 'boolean') {
    observed.immutableReleases = { enabled: policy.immutable_releases };
  }
  if (policy.pages) {
    observed.pages = {
      site: {
        build_type: policy.pages.build_type ?? 'workflow',
        https_enforced: Object.hasOwn(policy.pages, 'https_enforced') ? policy.pages.https_enforced : false,
        cname: 'keep.example'
      }
    };
  }
  if (policy.main_ruleset) observed.ruleset = { state: 'matches' };
  return observed;
}

function target(name = 'alpha') {
  return { owner: 'ExampleOrg', name };
}

function jsonResponse(body, status = 200) {
  const text = body === undefined || body === null ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: { 403: 'Forbidden', 404: 'Not Found' }[status] ?? 'OK',
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text); }
  };
}

function isWriteCall(call) {
  if (call.method === 'GET') return false;
  if (call.url.pathname === '/graphql') return isGraphqlMutation(JSON.parse(call.body).query);
  return true;
}

function orgFetch(state) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    const method = init.method ?? 'GET';
    const call = { url, method, body: init.body, authorization: init.headers?.Authorization };
    calls.push(call);
    assert.equal(url.host, 'api.github.com');
    assert.equal(call.authorization, `Bearer ${TOKEN}`);
    assert.equal(url.pathname === '/user' || url.pathname.startsWith('/user/'), false);
    if (method === 'GET' && url.pathname === '/orgs/ExampleOrg/repos') {
      const page = url.searchParams.get('page');
      return jsonResponse(page === '1' ? state.names.map((name) => ({
        name,
        archived: state.repos[name]?.archived === true
      })) : []);
    }
    if (url.pathname === '/graphql') {
      const parsed = JSON.parse(init.body);
      const repo = parsed.variables?.name
        ? state.repos[parsed.variables.name]
        : Object.values(state.repos).find((item) => parsed.variables?.id === `R_${item.name}`);
      assert.ok(repo, 'GraphQL variables did not name a repository');
      if (isGraphqlMutation(parsed.query)) repo.sponsorship = parsed.variables.enabled;
      return jsonResponse({ data: { repository: { id: `R_${repo.name}`, hasSponsorshipsEnabled: repo.sponsorship } } });
    }
    const match = url.pathname.match(/^\/repos\/ExampleOrg\/([^/]+)(?:\/(.*))?$/);
    assert.ok(match, `${method} ${url.pathname}`);
    const repo = state.repos[match[1]];
    const rest = match[2] ?? '';
    if (repo.repositoryStatus) return jsonResponse({ message: `denied ${TOKEN}` }, repo.repositoryStatus);
    if (method === 'GET' && rest === '') return jsonResponse({ ...repo.settings, name: repo.name, has_pages: repo.has_pages });
    if (rest === 'immutable-releases') {
      if (method === 'GET') {
        if (repo.immutable === 404) return jsonResponse({ message: 'Not Found' }, 404);
        return jsonResponse({ enabled: repo.immutable });
      }
      repo.immutable = method === 'DELETE' ? false : true;
      return jsonResponse(null, 204);
    }
    if (rest === 'pages') {
      if (method === 'GET') {
        if (!repo.has_pages) return jsonResponse({ message: 'Not Found' }, 404);
        if (repo.pagesStatus) return jsonResponse({ message: `pages ${TOKEN}` }, repo.pagesStatus);
        return jsonResponse(repo.pages);
      }
      assert.equal(method, 'PUT');
      if (repo.pagesWriteStatus) {
        return jsonResponse({ message: repo.pagesWriteMessage ?? 'Unprocessable Entity' }, repo.pagesWriteStatus);
      }
      repo.pages = { ...repo.pages, ...JSON.parse(init.body) };
      return jsonResponse(null, 204);
    }
    if (rest === 'rulesets' && method === 'GET') {
      if (repo.ruleset === 'missing') return jsonResponse([]);
      return jsonResponse([{ id: 7, name: state.policy.main_ruleset.name }]);
    }
    if (rest === 'rulesets/7' && method === 'GET') {
      const ruleset = structuredClone(state.policy.main_ruleset);
      if (repo.ruleset === 'unknown') delete ruleset.bypass_actors;
      if (repo.ruleset === 'different') ruleset.enforcement = 'evaluate';
      return jsonResponse(ruleset);
    }
    if (rest === 'rulesets' && method === 'POST') {
      repo.ruleset = 'match';
      return jsonResponse({ id: 7 }, 201);
    }
    if (rest === 'rulesets/7' && method === 'PUT') {
      repo.ruleset = 'match';
      return jsonResponse(null, 200);
    }
    if (method === 'PATCH' && rest === '') {
      Object.assign(repo.settings, JSON.parse(init.body));
      return jsonResponse({ ...repo.settings, name: repo.name, has_pages: repo.has_pages });
    }
    throw new Error(`unexpected ${method} ${url.pathname}`);
  };
  return { fetchImpl, calls };
}

function baseRepo(policy, name, overrides = {}) {
  return {
    name,
    has_pages: true,
    settings: structuredClone(policy.repository),
    pages: { build_type: 'workflow', https_enforced: true, cname: 'keep.example' },
    immutable: true,
    sponsorship: false,
    ruleset: 'match',
    ...overrides
  };
}

test('git blob SHA matches git hash-object for the pinned policy fixture', () => {
  const hashed = spawnSync('git', ['hash-object', fixturePath], { cwd: root, encoding: 'utf8' });
  assert.equal(hashed.status, 0);
  assert.equal(gitBlobSha(pinnedBytes), hashed.stdout.trim());
  assert.equal(hashed.stdout.trim(), PINNED_BLOB);
  assert.equal(Object.hasOwn(pinned().pages, 'https_enforced'), false);
  assert.equal(pinned().pages.build_type, 'workflow');
});

test('pinned policy download uses the commit, checks the blob, and sends no token', async () => {
  const pin = JSON.parse(readFileSync(path.join(root, 'config/github/repository-policy.json'), 'utf8'));
  assert.equal(pin.tag, 'v7.10.0');
  assert.equal(pin.commit, '122db54d0763dc39f81133ec06e35dab2b24d41b');
  assert.equal(pin.policy_blob_sha, 'b5f31a288ae719c0f9e632f5ec359f33839f0850');
  assert.equal(pin.tool_blob_sha, 'f5105da2a2cc2e767762bc10909e67262cea3144');
  let seen;
  const policy = await fetchPinnedPolicy(pin, async (url, init) => {
    seen = { url, authorization: init.headers?.Authorization };
    const response = await fetch(url, { headers: init.headers });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { ok: response.ok, status: response.status, arrayBuffer: async () => bytes };
  });
  assert.equal(seen.authorization, undefined);
  assert.equal(seen.url, `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}/${pin.policy_path}`);
  assert.doesNotMatch(seen.url, /\/v7\.10\.0\//);
  assert.equal(policy.pages.build_type, 'workflow');
  assert.equal(policy.pages.https_enforced, true);
  assert.deepEqual(policy.pages.https_enforced_exempt, [
    { repo: 'website', reason: 'HTTPS terminated at Cloudflare' }
  ]);
  validatePolicy(policy);
  const toolUrl = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}/${pin.tool_path}`;
  const toolResponse = await fetch(toolUrl);
  assert.equal(toolResponse.ok, true);
  assert.equal(gitBlobSha(Buffer.from(await toolResponse.arrayBuffer())), pin.tool_blob_sha);
  await assert.rejects(
    () => fetchPinnedPolicy({ ...pin, policy_blob_sha: 'b'.repeat(40) }, async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('{}\n')
    })),
    /does not match/
  );
});

test('argument defaults stay on the organization and require an explicit mode', () => {
  assert.equal(parseArgs(['--dry-run']).org, 'Living-Proof-Labs');
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.throws(() => parseArgs([]), /exactly one/);
  assert.throws(() => parseArgs(['--dry-run', '--apply']), /exactly one/);
  assert.throws(() => parseArgs(['--dry-run', '--repo', 'ExampleOrg/alpha']), /repository name/);
});

test('repository list pages through GET /orgs/{org}/repos and never /user', async () => {
  const paths = [];
  const listed = await listOrgRepositories({
    async get(resource) {
      paths.push(resource);
      assert.equal(resource.includes('/user'), false);
      const page = new URL(resource, 'https://api.github.com').searchParams.get('page');
      if (page === '1') return Array.from({ length: 100 }, (_, index) => ({ name: `repo-${index}` }));
      if (page === '2') return [{ name: '.github' }];
      throw new Error(`unexpected ${resource}`);
    }
  }, 'Living-Proof-Labs');
  assert.equal(listed.length, 101);
  assert.match(paths[0], /^\/orgs\/Living-Proof-Labs\/repos\?per_page=100&type=all&page=1$/);
  assert.match(paths[1], /page=2$/);
});

test('the client refuses user endpoints and write calls before fetch, and redacts the token', async () => {
  let fetches = 0;
  const client = createGitHubClient({
    token: TOKEN,
    allowWrites: false,
    fetchImpl: async () => {
      fetches += 1;
      return jsonResponse({ message: `bad ${TOKEN}` }, 422);
    }
  });
  await assert.rejects(() => client.get('/user/repos'), /user-scoped/);
  await assert.rejects(() => client.get('/user'), /user-scoped/);
  assert.throws(
    () => client.write('PUT', '/repos/ExampleOrg/alpha/pages', { https_enforced: true }),
    (error) => error instanceof DryRunWriteError
  );
  assert.throws(
    () => client.graphql('mutation($id: ID!) { updateRepository(input: {repositoryId: $id}) { clientMutationId } }', {}),
    (error) => error instanceof DryRunWriteError
  );
  assert.equal(fetches, 0);
  const writing = createGitHubClient({
    token: TOKEN,
    allowWrites: true,
    fetchImpl: async () => jsonResponse({ message: `bad ${TOKEN}` }, 422)
  });
  await assert.rejects(() => writing.get('/orgs/ExampleOrg/repos'), (error) => {
    assert.equal(error.status, 422);
    assert.doesNotMatch(`${error.message} ${error.detail}`, /test-token-value/);
    assert.match(error.detail, /\[redacted\]/);
    return true;
  });
});

test('a printed error redacts a stateless token, a JWT, and classic tokens', async (t) => {
  const fixture = statelessInstallationToken();
  const jwt = `${fixture.header}.${fixture.payload}.${fixture.signature}`;
  const personal = `ghp_${'D'.repeat(36)}`;
  const file = writePolicy(t, pinned());
  async function printedError(message) {
    const io = capture();
    const code = await main(['--dry-run', '--policy', file, '--org', 'ExampleOrg'], {
      env: { GH_TOKEN: TOKEN },
      io,
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(input);
        if (url.pathname === '/orgs/ExampleOrg/repos') return jsonResponse([{ name: 'alpha', archived: false }]);
        return jsonResponse({ message }, 422);
      }
    });
    assert.equal(code, 1);
    return `${io.out()}${io.err()}`;
  }
  const printed = await printedError(`nope ${TOKEN} ${fixture.token}`);
  assert.ok(printed.length > 0);
  assert.equal(printed.includes(fixture.header), false);
  assert.equal(printed.includes(fixture.payload), false);
  assert.equal(printed.includes(fixture.signature), false);
  assert.equal(printed.includes(fixture.appId), false);
  assert.equal(printed.includes(fixture.token.slice(4)), false);
  assert.equal(printed.includes(TOKEN), false);
  assert.match(printed, /\[redacted\]/);
  assert.match(printed, /HTTP 422/);

  const classicPrinted = await printedError(`bearer ${jwt} ${personal}`);
  assert.equal(classicPrinted.includes(fixture.header), false);
  assert.equal(classicPrinted.includes(fixture.payload), false);
  assert.equal(classicPrinted.includes('D'.repeat(20)), false);

  const late = await printedError(`${'n'.repeat(160)} ${fixture.token}`);
  assert.equal(late.includes(fixture.appId), false);
  assert.equal(late.includes(fixture.payload), false);
  assert.equal(late.includes(fixture.signature), false);
});

test('a matching repository produces no changes', () => {
  const policy = pinned();
  const planned = planRepository(policy, observedMatching(policy), target());
  assert.deepEqual(planned.lines, []);
  assert.deepEqual(planned.writes, []);
  assert.deepEqual(planned.failures, []);
  assert.ok(manualSettingNames(policy).includes('preserve_repository_in_archive_program'));
  assert.equal(JSON.stringify(planned.writes).includes('preserve_repository_in_archive_program'), false);
});

test('repository settings patch only the fields that differ', () => {
  const policy = pinned();
  const observed = observedMatching(policy);
  observed.repository.has_wiki = true;
  observed.repository.has_issues = true;
  const planned = planRepository(policy, observed, target());
  assert.deepEqual(planned.lines, [{ setting: 'repository.has_wiki', current: true, desired: false }]);
  assert.deepEqual(planned.writes, [{
    setting: 'repository',
    method: 'PATCH',
    path: '/repos/ExampleOrg/alpha',
    body: { has_wiki: false }
  }]);
});

test('an unreadable repository field names the missing Administration: read permission', () => {
  const policy = pinned();
  const observed = observedMatching(policy);
  delete observed.repository.delete_branch_on_merge;
  const planned = planRepository(policy, observed, target());
  assert.deepEqual(planned.writes, []);
  assert.equal(planned.failures[0].setting, 'repository.delete_branch_on_merge');
  assert.match(planned.failures[0].message, /missing Administration: read/);
  assert.match(planned.failures[0].message, /not written/);
  delete observed.repository.has_wiki;
  const wiki = planRepository(policy, observed, target()).failures.find((failure) => failure.setting === 'repository.has_wiki');
  assert.match(wiki.message, /not written/);
  assert.equal(wiki.message.includes('Administration: read'), false);
});

test('Enforce HTTPS is applied only when the policy sets it on an existing site', () => {
  const policy = withHttps(pinned());
  const observed = observedMatching(policy);
  observed.pages.site.https_enforced = false;
  const planned = planRepository(policy, observed, target());
  assert.deepEqual(planned.lines, [{ setting: 'pages.https_enforced', current: false, desired: true }]);
  assert.equal(planned.writes.length, 1);
  assert.equal(planned.writes[0].method, 'PUT');
  assert.equal(planned.writes[0].path, '/repos/ExampleOrg/alpha/pages');
  assert.deepEqual(planned.writes[0].body, { https_enforced: true });
});

test('without pages.https_enforced a build-type update does not send HTTPS or the custom domain', () => {
  const policy = pinned();
  const observed = observedMatching(policy);
  observed.pages.site.build_type = 'legacy';
  observed.pages.site.https_enforced = false;
  const planned = planRepository(policy, observed, target());
  assert.deepEqual(planned.writes[0].body, { build_type: 'workflow' });
  assert.equal(Object.hasOwn(planned.writes[0].body, 'https_enforced'), false);
  assert.equal(Object.hasOwn(planned.writes[0].body, 'cname'), false);
  assert.match(policyNotices(policy)[0], /pages\.https_enforced/);
  assert.equal(policyNotices(withHttps(policy)).length, 0);
});

test('repositories without a Pages site are not given one', () => {
  const policy = withHttps(pinned());
  const observed = observedMatching(policy);
  observed.pages = { site: null };
  observed.repository.has_pages = false;
  const planned = planRepository(policy, observed, target());
  assert.equal(planned.writes.some((write) => String(write.path).endsWith('/pages')), false);
  assert.match(planned.skipped[0], /no site/);
});

test('an exemption skips Enforce HTTPS for that repository and still writes the others', () => {
  const policy = withHttps(pinned());
  policy.pages.https_enforced_exempt = [{ repo: 'website', reason: 'HTTPS terminated at Cloudflare' }];
  validatePolicy(policy);
  const website = observedMatching(policy);
  website.pages.site.https_enforced = false;
  const exempted = planRepository(policy, website, target('website'));
  assert.equal(exempted.writes.some((write) => write.body && Object.hasOwn(write.body, 'https_enforced')), false);
  assert.match(exempted.skipped.join('\n'), /pages\.https_enforced: exempt \(HTTPS terminated at Cloudflare\)/);
  const alpha = observedMatching(policy);
  alpha.pages.site.https_enforced = false;
  const enforced = planRepository(policy, alpha, target('alpha'));
  assert.deepEqual(enforced.writes.find((write) => String(write.path).endsWith('/pages')).body, { https_enforced: true });
  assert.throws(() => validatePolicy({
    ...policy,
    pages: { ...policy.pages, https_enforced_exempt: [{ repo: 'Living-Proof-Labs/website', reason: 'no' }] }
  }), /repository name/);
  assert.throws(() => validatePolicy({
    ...policy,
    pages: { ...policy.pages, https_enforced_exempt: [{ repo: 'website' }] }
  }), /reason/);
  assert.throws(() => validatePolicy({
    ...policy,
    pages: { ...policy.pages, https_enforced_exempt: [] }
  }), /must not be empty/);
  assert.throws(() => validatePolicy({
    ...policy,
    pages: { ...policy.pages, https_enforced: false }
  }), /requires pages\.https_enforced to be true/);
});

test('nine Pages repositories: website is exempt and the other eight get Enforce HTTPS', async (t) => {
  const policy = withHttps(pinned());
  policy.pages.https_enforced_exempt = [{ repo: 'website', reason: 'HTTPS terminated at Cloudflare' }];
  const others = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
  const names = ['website', ...others];
  const repos = {};
  for (const name of names) {
    repos[name] = baseRepo(policy, name, {
      pages: { build_type: 'workflow', https_enforced: false, cname: 'keep.example' }
    });
  }
  const { fetchImpl, calls } = orgFetch({ policy, names, repos });
  const io = capture();
  const code = await main(['--apply', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl
  });
  assert.equal(code, 0, io.err());
  const pageWrites = calls.filter((call) => call.method === 'PUT' && call.url.pathname.endsWith('/pages'));
  assert.deepEqual(pageWrites.map((call) => call.url.pathname.split('/')[3]).sort(), others.sort());
  for (const call of pageWrites) assert.deepEqual(JSON.parse(call.body), { https_enforced: true });
  assert.equal(pageWrites.some((call) => call.url.pathname.includes('/website/')), false);
  const website = io.out().match(/ExampleOrg\/website\n([\s\S]*?)\nExampleOrg\//)[1];
  assert.match(website, /exempt \(HTTPS terminated at Cloudflare\)/);
  assert.doesNotMatch(website, /https_enforced: false -> true/);
});

test('an unreadable main-ruleset bypass list is not written', () => {
  const policy = pinned();
  const observed = observedMatching(policy);
  observed.ruleset = { state: 'unknown', error: 'main ruleset bypass actors are unreadable; not written' };
  const planned = planRepository(policy, observed, target());
  assert.deepEqual(planned.writes, []);
  assert.match(planned.failures[0].message, /not written/);
});

test('a ruleset update keeps rules the policy does not manage', () => {
  const policy = pinned();
  const existing = structuredClone(policy.main_ruleset);
  existing.enforcement = 'evaluate';
  existing.rules.push({ type: 'required_signatures' });
  const observed = observedMatching(policy);
  observed.ruleset = { state: 'different', id: 15, existing };
  const planned = planRepository(policy, observed, target());
  assert.equal(planned.writes[0].method, 'PUT');
  assert.equal(planned.writes[0].path, '/repos/ExampleOrg/alpha/rulesets/15');
  assert.equal(planned.writes[0].body.rules.some((rule) => rule.type === 'required_signatures'), true);
  assert.equal(planned.writes[0].body.enforcement, 'active');
});

test('unsupported policy pages fields fail before a request', async (t) => {
  const io = capture();
  let called = false;
  const file = writePolicy(t, { ...pinned(), pages: { ...pinned().pages, public: true } });
  const code = await main(['--dry-run', '--policy', file, '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl: async () => { called = true; throw new Error('network'); }
  });
  assert.equal(code, 1);
  assert.equal(called, false);
  assert.match(io.err(), /pages\.public/);
  assert.throws(() => validatePolicy({ schema_version: 2, repository: { has_wiki: false } }), /schema/);
});

test('missing GH_TOKEN fails before any request and does not echo a value', async () => {
  const io = capture();
  let called = false;
  const code = await main(['--dry-run', '--policy', 'unused.json'], {
    env: { OTHER_TOKEN: TOKEN },
    io,
    fetchImpl: async () => { called = true; throw new Error('network'); }
  });
  assert.equal(code, 1);
  assert.equal(called, false);
  assert.match(io.err(), /GH_TOKEN is not set/);
  assert.doesNotMatch(io.out() + io.err(), /test-token-value/);
});

test('a mismatched pinned blob is refused before the GitHub API', async (t) => {
  const io = capture();
  const pinPath = path.join(tempDirectory(t, 'policy-pin-'), 'repository-policy.json');
  const pin = JSON.parse(readFileSync(path.join(root, 'config/github/repository-policy.json'), 'utf8'));
  pin.policy_blob_sha = 'c'.repeat(40);
  writeFileSync(pinPath, JSON.stringify(pin));
  const hosts = [];
  const code = await main(['--dry-run'], {
    env: { GH_TOKEN: TOKEN },
    io,
    pinPath,
    fetchImpl: async (url) => {
      hosts.push(new URL(url).host);
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('{}\n'), async text() { return '{}\n'; } };
    }
  });
  assert.equal(code, 1);
  assert.deepEqual(hosts, ['raw.githubusercontent.com']);
  assert.match(io.err(), /blob SHA/);
  assert.doesNotMatch(io.out() + io.err(), /test-token-value/);
});

test('dry-run makes no write API calls', async (t) => {
  const policy = withHttps(pinned());
  const state = {
    policy,
    names: ['alpha', 'beta'],
    repos: {
      alpha: baseRepo(policy, 'alpha', {
        settings: { ...structuredClone(policy.repository), has_wiki: true },
        pages: { build_type: 'workflow', https_enforced: false, cname: 'keep.example' },
        immutable: 404,
        sponsorship: true,
        ruleset: 'missing'
      }),
      beta: baseRepo(policy, 'beta', { has_pages: false, pages: null })
    }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const io = capture();
  const code = await main(['--dry-run', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl
  });
  assert.equal(code, 0, io.err());
  assert.equal(calls.filter(isWriteCall).length, 0);
  assert.ok(calls.some((call) => call.method === 'GET' && call.url.pathname === '/orgs/ExampleOrg/repos'));
  assert.ok(calls.some((call) => call.method === 'POST' && call.url.pathname === '/graphql' && !isGraphqlMutation(JSON.parse(call.body).query)));
  assert.match(io.out(), /pages\.https_enforced: false -> true/);
  assert.match(io.out(), /repository\.has_wiki: true -> false/);
  assert.match(io.out(), /graphql\.hasSponsorshipsEnabled: true -> false/);
  assert.match(io.out(), /immutable_releases: false -> true/);
  assert.match(io.out(), /main_ruleset: null ->/);
  assert.match(io.out(), /ExampleOrg\/beta/);
  assert.match(io.out(), /no site/);
  assert.match(io.out(), /outcome: not written \(dry-run\)/);
  assert.doesNotMatch(io.out(), /"cname"/);
  assert.doesNotMatch(`${io.out()}${io.err()}`, /test-token-value/);
});

test('a permission failure is reported per repository and dry-run still does not write', async (t) => {
  const policy = pinned();
  const state = {
    policy,
    names: ['alpha', 'gamma'],
    repos: {
      alpha: baseRepo(policy, 'alpha', { settings: { ...structuredClone(policy.repository), has_wiki: true } }),
      gamma: baseRepo(policy, 'gamma', { repositoryStatus: 403 })
    }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const io = capture();
  const code = await main(['--dry-run', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl
  });
  assert.equal(code, 1);
  assert.equal(calls.filter(isWriteCall).length, 0);
  assert.match(io.out(), /ExampleOrg\/alpha[\s\S]*repository\.has_wiki: true -> false/);
  assert.match(io.out(), /ExampleOrg\/gamma[\s\S]*ERROR repository: HTTP 403 \(token lacks permission for this setting\)/);
  assert.match(io.out(), /1 change\(s\); 1 error\(s\)\./);
  assert.doesNotMatch(`${io.out()}${io.err()}`, /test-token-value/);
});

test('apply writes only drifted settings, and a second run writes nothing', async (t) => {
  const policy = pinned();
  const state = {
    policy,
    names: ['alpha'],
    repos: {
      alpha: baseRepo(policy, 'alpha', {
        settings: { ...structuredClone(policy.repository), has_wiki: true }
      })
    }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const io = capture();
  const args = ['--apply', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg', '--repo', 'alpha'];
  const first = await main(args, { env: { GH_TOKEN: TOKEN }, io, fetchImpl });
  assert.equal(first, 0, io.err());
  const writes = calls.filter(isWriteCall);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.equal(writes[0].url.pathname, '/repos/ExampleOrg/alpha');
  assert.deepEqual(JSON.parse(writes[0].body), { has_wiki: false });
  assert.match(io.out(), /outcome: written/);
  assert.match(io.out(), /skipped \(no API\): preserve_repository_in_archive_program/);

  calls.length = 0;
  const secondIo = capture();
  const second = await main(args, { env: { GH_TOKEN: TOKEN }, io: secondIo, fetchImpl });
  assert.equal(second, 0, secondIo.err());
  assert.equal(calls.filter(isWriteCall).length, 0);
  assert.match(secondIo.out(), /no changes/);
  assert.match(secondIo.out(), /0 change\(s\); 0 error\(s\)\./);
});

test('apply sends Enforce HTTPS without the custom domain or unchanged Pages fields', async (t) => {
  const policy = withHttps(pinned());
  const state = {
    policy,
    names: ['alpha'],
    repos: {
      alpha: baseRepo(policy, 'alpha', {
        pages: { build_type: 'workflow', https_enforced: false, cname: 'keep.example' }
      })
    }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const io = capture();
  const code = await main(['--apply', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl
  });
  assert.equal(code, 0, io.err());
  const writes = calls.filter(isWriteCall);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PUT');
  assert.equal(writes[0].url.pathname, '/repos/ExampleOrg/alpha/pages');
  assert.deepEqual(JSON.parse(writes[0].body), { https_enforced: true });
  assert.match(io.out(), /pages\.https_enforced: false -> true/);
});

test('a rejected Enforce HTTPS write names the repository, the setting, and the GitHub error, then continues', async (t) => {
  const policy = withHttps(pinned());
  const githubMessage = 'The certificate does not exist or is not yet available.';
  const state = {
    policy,
    names: ['website', 'alpha'],
    repos: {
      website: baseRepo(policy, 'website', {
        pages: { build_type: 'workflow', https_enforced: false, cname: 'livingprooflabs.com' },
        pagesWriteStatus: 422,
        pagesWriteMessage: githubMessage
      }),
      alpha: baseRepo(policy, 'alpha', {
        settings: { ...structuredClone(policy.repository), has_wiki: true }
      })
    }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const io = capture();
  const code = await main(['--apply', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl
  });
  assert.equal(code, 1);
  const writes = calls.filter(isWriteCall);
  assert.deepEqual(writes.map((call) => `${call.method} ${call.url.pathname}`), [
    'PUT /repos/ExampleOrg/website/pages',
    'PATCH /repos/ExampleOrg/alpha'
  ]);
  assert.deepEqual(JSON.parse(writes[0].body), { https_enforced: true });
  assert.equal(state.repos.website.pages.https_enforced, false);
  assert.equal(state.repos.alpha.settings.has_wiki, false);
  assert.match(io.out(), new RegExp(
    'ExampleOrg/website[\\s\\S]*' +
    'pages\\.https_enforced: false -> true[\\s\\S]*' +
    'ERROR pages: HTTP 422 \\(The certificate does not exist or is not yet available\\.\\)[\\s\\S]*' +
    'outcome: not fully written[\\s\\S]*' +
    'ExampleOrg/alpha[\\s\\S]*' +
    'outcome: written'
  ));
  assert.match(io.out(), /2 change\(s\); 1 error\(s\)\./);
  assert.doesNotMatch(`${io.out()}${io.err()}`, /test-token-value/);
  assert.doesNotMatch(writes[0].body, /cname|livingprooflabs/);
});

test('Pages 404 on a repository that reports a site is a permission failure and creates nothing', async (t) => {
  const policy = withHttps(pinned());
  const state = {
    policy,
    names: ['alpha'],
    repos: { alpha: baseRepo(policy, 'alpha', { pagesStatus: 404 }) }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const io = capture();
  const code = await main(['--apply', '--policy', writePolicy(t, policy), '--org', 'ExampleOrg'], {
    env: { GH_TOKEN: TOKEN },
    io,
    fetchImpl
  });
  assert.equal(code, 1);
  assert.equal(calls.filter(isWriteCall).length, 0);
  assert.match(io.out(), /not treated as absent/);
  assert.equal(calls.some((call) => call.method === 'POST' && call.url.pathname.endsWith('/pages')), false);
  assert.doesNotMatch(`${io.out()}${io.err()}`, /test-token-value/);
});

test('archived repositories are skipped in dry-run and apply', async (t) => {
  const policy = pinned();
  const state = {
    policy,
    names: ['alpha', 'legacy'],
    repos: {
      alpha: baseRepo(policy, 'alpha'),
      legacy: { archived: true }
    }
  };
  const { fetchImpl, calls } = orgFetch(state);
  const policyFile = writePolicy(t, policy);
  for (const mode of ['--dry-run', '--apply']) {
    calls.length = 0;
    const io = capture();
    const code = await main([mode, '--policy', policyFile, '--org', 'ExampleOrg'], {
      env: { GH_TOKEN: TOKEN },
      io,
      fetchImpl
    });
    assert.equal(code, 0, `${mode}\n${io.err()}\n${io.out()}`);
    assert.match(io.out(), /ExampleOrg\/legacy\n  skipped \(archived\)/);
    assert.match(io.out(), /ExampleOrg\/alpha\n  no changes/);
    assert.equal(calls.some((call) => call.url.pathname.startsWith('/repos/ExampleOrg/legacy')), false);
    assert.equal(calls.filter(isWriteCall).length, 0);
  }
});

test('the command wrapper is secret-free and invokes the policy tool', () => {
  const wrapper = readFileSync(path.join(root, 'scripts/apply-repo-policy'), 'utf8');
  assert.match(wrapper, /tools\/github\/apply-repo-policy\.mjs/);
  assert.doesNotMatch(wrapper, /GH_TOKEN=|ghp_|github_pat_|BEGIN .*PRIVATE KEY/);
});
