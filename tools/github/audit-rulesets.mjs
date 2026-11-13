#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitHubClient } from './apply-repo-policy.mjs';
import { validateInventory } from './verify-inventory.mjs';
import { rulesetPlan, strengthenRuleset } from './reconcile-ruleset.mjs';
import { redactSecrets } from './redact-secrets.mjs';

/** Replace only the legacy ruleset comparison; retain all other audit evidence. */
export async function annotateRulesets(text, policy, inventory, api) {
  validateInventory(inventory);
  strengthenRuleset(null, policy.main_ruleset);
  const summaries = [...text.matchAll(/^(\d+) difference\(s\) found; (\d+) error\(s\)\.$/gm)];
  if (summaries.length !== 1) throw new Error('Expected one audit summary; cannot reconcile ruleset evidence.');
  let differences = Number(summaries[0][1]);
  const output = [], seen = new Set(), headings = new Set();
  let name;
  for (const line of text.split('\n')) {
    const heading = line.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (heading) {
      if (heading[1] !== inventory.owner || !inventory.repositories.includes(heading[2])) throw new Error('Audit contains an unregistered ruleset target.');
      name = heading[2];
      if (headings.has(name)) throw new Error('Duplicate repository audit identity.');
      headings.add(name);
    }
    const state = line.match(/^  main ruleset: (matches|different|missing|unknown)$/);
    if (state) {
      if (!name || seen.has(name)) throw new Error('Missing or duplicate ruleset audit identity.');
      seen.add(name);
      let current, evidence;
      try {
        const plan = await rulesetPlan(api, inventory, name, policy);
        current = plan.write ? (plan.before ? 'different' : 'missing') : 'matches';
        evidence = plan.write ? 'below required protection baseline; reviewed reconciliation needed' : 'meets or exceeds required protection baseline';
      } catch (error) {
        current = 'unknown';
        evidence = error.message;
      }
      differences += Number(current !== 'matches') - Number(state[1] !== 'matches');
      output.push(`  main ruleset: ${current}`, `  main ruleset evidence: ${JSON.stringify(evidence)}`);
    } else if (!line.startsWith('  main ruleset evidence:')) output.push(line);
  }
  if (!headings.size || seen.size !== headings.size) throw new Error('Missing ruleset audit evidence; refusing to classify.');
  if (differences < 0) throw new Error('Audit difference count is inconsistent; refusing to classify.');
  return output.join('\n').replace(summaries[0][0], `${differences} difference(s) found; ${summaries[0][2]} error(s).`);
}

export async function main(argv, { env = process.env, fetchImpl = globalThis.fetch, io = process } = {}) {
  try {
    const [policyFile, inventoryFile, auditFile] = argv;
    if (!policyFile || !inventoryFile || !auditFile || argv.length !== 3) throw new Error('Usage: audit-rulesets.mjs POLICY_FILE INVENTORY_FILE AUDIT_FILE');
    const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
    const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
    const api = createGitHubClient({ token: env.GH_TOKEN ?? '', fetchImpl, allowWrites: false });
    const result = await annotateRulesets(readFileSync(auditFile, 'utf8'), policy, inventory, api);
    writeFileSync(auditFile, redactSecrets(result, env.GH_TOKEN ?? ''));
    return 0;
  } catch (error) { io.stderr.write(redactSecrets(error.message, env.GH_TOKEN ?? '') + '\n'); return 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
