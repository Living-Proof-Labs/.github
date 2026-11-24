// SPDX-License-Identifier: Apache-2.0
// collaboration-guidelines bumps move every consumer pin together and keep the release interface.
// Proposed by Vera in the capability-verifier#72 review (guidelines bump checklist items 2, 3 and 6).
// Offline: the shared release interface is recorded here and checked against the workflow call
// when this repo has one. LIVINGPROOF_NETWORK=1 reads the pinned semantic-release.yml and
// derives its inputs and outputs. Every recorded key must still be declared there. A later
// guidelines release may add an input without failing that check; a caller is allowed
// whatever that file declares, so the next bump does not need a handwritten allow-list edit.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = "Living-Proof-Labs/collaboration-guidelines";
const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
function usesRe() {
  return /^\s+uses:\s*Living-Proof-Labs\/collaboration-guidelines\/\.github\/workflows\/([\w.-]+\.ya?ml)@(\S+)\s*$/gm;
}
const PRESET = /^github>Living-Proof-Labs\/collaboration-guidelines:renovate-preset#(.+)$/;
const SHARED_RELEASE_INPUTS = new Set([
  "dry-run",
  "draft-release",
  "expected-version",
  "expected-commit",
]);
const SHARED_RELEASE_OUTPUTS = new Set([
  "draft-created",
  "published",
  "version",
  "git-tag",
  "commit",
  "release-url",
]);

function root() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, "renovate.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("could not find the repository root (renovate.json)");
    dir = parent;
  }
}

const ROOT = root();

function workflowPath() {
  for (const name of [".github/workflows/verify.yml", ".github/workflows/release.yml"]) {
    const path = join(ROOT, name);
    if (existsSync(path) && usesRe().test(readFileSync(path, "utf8"))) return path;
  }
  return null;
}

function guidelineCalls(text = null) {
  const path = workflowPath();
  if (text == null) {
    if (path == null) return {};
    text = readFileSync(path, "utf8");
  }
  const calls = {};
  for (const match of text.matchAll(usesRe())) {
    const before = text.slice(0, match.index);
    const headers = [...before.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
    assert.ok(headers.length, "expected a job name above the guidelines workflow call");
    calls[headers.at(-1)] = { file: match[1], ref: match[2] };
  }
  return calls;
}

function presetRefs(config = null) {
  config = config ?? JSON.parse(readFileSync(join(ROOT, "renovate.json"), "utf8"));
  return (config.extends ?? []).map((item) => item.match(PRESET)?.[1]).filter(Boolean);
}

function pinnedVersions(text = null, config = null) {
  const refs = new Set(presetRefs(config));
  if (text != null || workflowPath() != null) {
    for (const call of Object.values(guidelineCalls(text))) refs.add(call.ref);
  }
  return refs;
}

function jobBlock(text, job) {
  const start = text.search(new RegExp(`^  ${job}:\\n`, "m"));
  assert.ok(start >= 0, `job ${job} not found`);
  const after = start + `  ${job}:\n`.length;
  const later = text.slice(after).match(/^  [A-Za-z0-9_-]+:\s*$/m);
  const end = later ? after + later.index : text.length;
  return text.slice(start, end);
}

function mapping(block, key, indent = 4) {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  const found = block.match(new RegExp(`^${pad}${key}:\\n((?:${inner}.*\\n)*)`, "m"));
  if (!found) return {};
  const out = {};
  for (const row of found[1].matchAll(new RegExp(`^${inner}([A-Za-z0-9_-]+):\\s*(\\S+)`, "gm"))) {
    out[row[1]] = row[2];
  }
  return out;
}

function workflowCallKeys(shared, section) {
  const call = shared.match(/^  workflow_call:\n((?:    .*\n)+)/m);
  assert.ok(call, "expected a workflow_call interface");
  const found = call[1].match(new RegExp(`^    ${section}:\\n((?:      .*\\n)+)`, "m"));
  if (!found) return new Set();
  return new Set([...found[1].matchAll(/^      ([A-Za-z0-9_-]+):/gm)].map((m) => m[1]));
}

function inputKeysAllowed(shared, callText, job) {
  const allowed = workflowCallKeys(shared, "inputs");
  return Object.keys(mapping(jobBlock(callText, job), "with")).every((key) => allowed.has(key));
}

function recordedKeysRemain(shared) {
  const inputs = workflowCallKeys(shared, "inputs");
  const outputs = workflowCallKeys(shared, "outputs");
  for (const key of SHARED_RELEASE_INPUTS) if (!inputs.has(key)) return false;
  for (const key of SHARED_RELEASE_OUTPUTS) if (!outputs.has(key)) return false;
  return true;
}

function sharedReleaseWorkflow(inputs, outputs) {
  const lines = ["on:", "  workflow_call:", "    inputs:"];
  for (const key of inputs) lines.push(`      ${key}:`, "        type: string");
  lines.push("    outputs:");
  for (const key of outputs) lines.push(`      ${key}:`, "        value: kept");
  lines.push("");
  return lines.join("\n");
}

function releaseCaller(withKeys) {
  const lines = [
    "jobs:",
    "  release:",
    "    uses: Living-Proof-Labs/collaboration-guidelines/.github/workflows/semantic-release.yml@v9.9.11",
  ];
  const keys = Object.keys(withKeys);
  if (keys.length) {
    lines.push("    with:");
    for (const key of keys) lines.push(`      ${key}: ${withKeys[key]}`);
  }
  lines.push("");
  return lines.join("\n");
}

// The network test calls this helper, so both checks run on offline fixtures.
function releaseCallsMatchShared(shared, callText) {
  if (!recordedKeysRemain(shared)) return false;
  const outputs = workflowCallKeys(shared, "outputs");
  for (const name of Object.keys(guidelineCalls(callText))) {
    if (!inputKeysAllowed(shared, callText, name)) return false;
    const used = new Set(
      [...callText.matchAll(new RegExp(`needs\\.${name}\\.outputs\\.([\\w-]+)`, "g"))].map((m) => m[1]),
    );
    for (const key of used) if (!outputs.has(key)) return false;
  }
  return true;
}

const hasCall = workflowPath() != null;
const skipCall = hasCall ? false : "this repository has no guidelines workflow call";
const skipNetwork = process.env.LIVINGPROOF_NETWORK
  ? skipCall
  : "set LIVINGPROOF_NETWORK=1";

test("every guidelines pin is a full release tag", () => {
  const refs = pinnedVersions();
  assert.ok(refs.size, "expected a Renovate preset pin and/or a release workflow call");
  for (const ref of refs) {
    assert.match(ref, TAG, `${ref} is not a full vX.Y.Z release tag`);
  }
});

test("workflow call and renovate preset name one guidelines release", () => {
  // A partial bump (one pin moved, the other left behind) fails here.
  // Repos that only pin the preset still need exactly one release tag.
  const refs = pinnedVersions();
  assert.equal(refs.size, 1, [...refs].sort().join(", "));
});

test("mismatched pins are reported", { skip: skipCall }, () => {
  const text = readFileSync(workflowPath(), "utf8");
  const mutated = text.replace(usesRe(), (whole, file, ref) => whole.replace(ref, "v2.2.0"));
  const preset = { extends: [`github>${REPO}:renovate-preset#v9.2.0`] };
  assert.equal(pinnedVersions(mutated, preset).size, 2);
});

test("release call uses only the shared interface", { skip: skipCall }, () => {
  const text = readFileSync(workflowPath(), "utf8");
  const calls = guidelineCalls(text);
  assert.ok(Object.keys(calls).length, "expected a job that uses the shared semantic-release workflow");
  for (const [name, match] of Object.entries(calls)) {
    assert.equal(match.file, "semantic-release.yml");
    const block = jobBlock(text, name);
    const withKeys = new Set(Object.keys(mapping(block, "with")));
    for (const key of withKeys) assert.ok(SHARED_RELEASE_INPUTS.has(key), key);
    assert.equal(mapping(block, "permissions").contents, "write");
    const used = new Set(
      [...text.matchAll(new RegExp(`needs\\.${name}\\.outputs\\.([\\w-]+)`, "g"))].map((m) => m[1]),
    );
    for (const key of used) {
      assert.ok(SHARED_RELEASE_OUTPUTS.has(key), `unexpected output ${key}`);
    }
  }
});

test("an unknown release output is reported", { skip: skipCall }, () => {
  const text = readFileSync(workflowPath(), "utf8");
  const mutated = text.includes("needs.release.outputs")
    ? `${text}\n# needs.release.outputs.tag\n`
    : text.replace("permissions:", "needs.release.outputs.tag: placeholder\n  permissions:");
  const found = new Set([...mutated.matchAll(/needs\.release\.outputs\.([\w-]+)/g)].map((m) => m[1]));
  assert.ok(found.has("tag"));
  assert.ok(found.has("tag") && !SHARED_RELEASE_OUTPUTS.has("tag"));
});

test("recorded release interface names the sealed delivery inputs", () => {
  assert.deepEqual(
    [...SHARED_RELEASE_INPUTS].sort(),
    ["draft-release", "dry-run", "expected-commit", "expected-version"],
  );
  assert.deepEqual(
    [...SHARED_RELEASE_OUTPUTS].sort(),
    ["commit", "draft-created", "git-tag", "published", "release-url", "version"],
  );
});

test("a later shared input is allowed without editing the recorded set", () => {
  const shared = sharedReleaseWorkflow(["dry-run", "future-input"], ["commit"]);
  const call = releaseCaller({ "future-input": "later-guidelines-release" });
  assert.equal(SHARED_RELEASE_INPUTS.has("future-input"), false);
  assert.equal(inputKeysAllowed(shared, call, "release"), true);
});

test("an added shared input does not make the recorded interface stale", () => {
  const shared = sharedReleaseWorkflow(
    [...SHARED_RELEASE_INPUTS, "future-input"],
    SHARED_RELEASE_OUTPUTS,
  );
  assert.equal(workflowCallKeys(shared, "inputs").has("future-input"), true);
  assert.equal(recordedKeysRemain(shared), true);
});

test("recordedKeysRemain fails when the pinned workflow drops a recorded input", () => {
  const shared = sharedReleaseWorkflow(
    [...SHARED_RELEASE_INPUTS].filter((key) => key !== "expected-commit"),
    SHARED_RELEASE_OUTPUTS,
  );
  assert.equal(workflowCallKeys(shared, "inputs").has("expected-commit"), false);
  assert.equal(recordedKeysRemain(shared), false);
});

test("recordedKeysRemain fails when the pinned workflow drops a recorded output", () => {
  const shared = sharedReleaseWorkflow(
    SHARED_RELEASE_INPUTS,
    [...SHARED_RELEASE_OUTPUTS].filter((key) => key !== "commit"),
  );
  assert.equal(workflowCallKeys(shared, "outputs").has("commit"), false);
  assert.equal(recordedKeysRemain(shared), false);
});

test("inputKeysAllowed rejects a caller passing an unknown input", () => {
  const shared = sharedReleaseWorkflow(SHARED_RELEASE_INPUTS, SHARED_RELEASE_OUTPUTS);
  const call = releaseCaller({ "not-a-release-input": "value" });
  assert.equal(inputKeysAllowed(shared, call, "release"), false);
});

test("the shared-workflow check fails when a recorded input is gone", () => {
  const shared = sharedReleaseWorkflow(
    [...SHARED_RELEASE_INPUTS].filter((key) => key !== "expected-commit"),
    SHARED_RELEASE_OUTPUTS,
  );
  const call = releaseCaller({ "dry-run": "false" });
  assert.equal(inputKeysAllowed(shared, call, "release"), true);
  assert.equal(releaseCallsMatchShared(shared, call), false);
});

test("the shared-workflow check fails when a caller passes an unknown input", () => {
  const shared = sharedReleaseWorkflow(SHARED_RELEASE_INPUTS, SHARED_RELEASE_OUTPUTS);
  const call = releaseCaller({ "not-a-release-input": "value" });
  assert.equal(recordedKeysRemain(shared), true);
  assert.equal(releaseCallsMatchShared(shared, call), false);
});

test("pinned shared workflow still declares every recorded release key", { skip: skipNetwork }, async () => {
  const refs = new Set(Object.values(guidelineCalls()).map((call) => call.ref));
  assert.equal(refs.size, 1);
  const [ref] = refs;
  const url = `https://raw.githubusercontent.com/${REPO}/${ref}/.github/workflows/semantic-release.yml`;
  const response = await fetch(url);
  assert.ok(response.ok, `${url} -> ${response.status}`);
  const shared = await response.text();
  assert.equal(
    releaseCallsMatchShared(shared, readFileSync(workflowPath(), "utf8")),
    true,
    `pinned ${ref} release call left the shared interface`,
  );
});
