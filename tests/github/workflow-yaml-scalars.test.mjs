// SPDX-License-Identifier: Apache-2.0
// Our tests read workflows as text, so they cannot notice invalid YAML, and GitHub then refuses to start the
// workflow (a failed run named after the file, no jobs, and no required check on the pull request).
// This catches the mistakes that have bitten before: an `if:` that is a bare plain scalar GitHub's YAML parser
// cannot read. A plain scalar cannot start with a YAML indicator such as `!` (tag), `&` (anchor) or `*` (alias),
// and cannot contain `: ` or ` #`. Write such expressions as `${{ ... }}` or quote them.
// Added by Vera (verification) for .github PR 133: `if: !cancelled() && ...` was invalid YAML at 09dcd95.
// Heuristic: it does not replace a YAML parser. GitHub's acceptance is proven by the pull request run starting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter(f => /\.ya?ml$/.test(f));
const INDICATORS = /^[!&*%@`|>{\[]/;

test('every workflow `if:` is a valid YAML scalar', () => {
  assert.ok(files.length > 0);
  let seen = 0;
  for (const file of files) {
    readFileSync(new URL(file, dir), 'utf8').split('\n').forEach((line, index) => {
      const m = line.match(/^\s*(?:- )?if:[ \t]+(\S.*)$/);
      if (!m) return;
      seen += 1;
      const value = m[1].trim();
      const where = `${file}:${index + 1}: if: ${value}`;
      if (/^(\$\{\{.*\}\}|'.*'|".*")$/.test(value)) return; // wrapped in ${{ }} or quoted
      if (/^[>|][-+]?$/.test(value)) return; // block scalar: the expression is on the following lines
      assert.doesNotMatch(value, INDICATORS, `${where}: a plain scalar cannot start with a YAML indicator; wrap it in \${{ }}`);
      assert.doesNotMatch(value, /: |\s#/, `${where}: ': ' or ' #' ends a plain scalar; wrap it in \${{ }} or quote it`);
    });
  }
  assert.ok(seen >= 3, `expected to check several if: lines, saw ${seen}`);
});

test('the release job condition is wrapped so a leading `!` is not a YAML tag', () => {
  const verify = readFileSync(new URL('verify.yml', dir), 'utf8');
  const release = verify.slice(verify.search(/^  release:\s*$/m));
  const value = release.match(/^    if:[ \t]*(.*)$/m)[1].trim();
  if (/^!/.test(value)) assert.fail(`release if starts with a bare '!': ${value}`);
  if (/!cancelled\(\)/.test(value)) assert.match(value, /^\$\{\{.*\}\}$/, 'an expression using !cancelled() must be wrapped in ${{ }}');
});
