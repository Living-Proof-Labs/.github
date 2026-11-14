#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
node=(bash "$root/tools/with-node.sh" node)

policy_file=config/github/repository-policy.json
inventory_file=config/github/repositories.json
manual_evidence_file=config/github/manual-settings-evidence.json
fail_on_drift=false
result_file=
if [ "${1:-}" = "--fail-on-drift" ]; then
  fail_on_drift=true
  shift
fi
if [ "${1:-}" = "--junit" ]; then
  result_file=${2:-}
  if [ -z "$result_file" ]; then echo "--junit requires an output path." >&2; exit 64; fi
  shift 2
fi
legacy_apply=false
for argument in "$@"; do
  if [ "$argument" = --apply ]; then legacy_apply=true; fi
done
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
tool_file="$root/tools/github/repository-settings.mjs"
audit_output="$work_dir/audit-output.txt"
raw_output="$work_dir/audit-raw.txt"
raw_error="$work_dir/audit-raw.err"
set +e
"${node[@]}" "$tool_file" --inventory "$inventory_file" "$@" >"$raw_output" 2>"$raw_error"
tool_status=$?
set -e
# Redact before the log and the JUnit artifact. A legacy [A-Za-z0-9_] mask
# stops at the first dot in a stateless ghs_ token and leaves the JWT.
# GH_TOKEN is inherited and replaced exactly, as well as by the token patterns.
"${node[@]}" "$root/tools/github/redact-secrets.mjs" <"$raw_output" > "$audit_output"
"${node[@]}" "$root/tools/github/redact-secrets.mjs" <"$raw_error" >&2
rm -f "$raw_output" "$raw_error"
if [ "$tool_status" -ne 0 ]; then
  cat "$audit_output"
  exit "$tool_status"
fi
# Compare pages.https_enforced for sites the audit could read. A repository
# with no Pages site is required Pages drift. An unreadable value is incomplete, not a
# pass. The local policy exempts website; that line is not drift.
"${node[@]}" "$root/tools/github/audit-pages-https.mjs" "$policy_file" "$audit_output" > /dev/null
# Use exactly the reconciliation resolver for protection: stronger rules pass;
# weaker rules drift; unreadable/conflicting evidence remains unknown. This
# changes neither general comparisons nor dated manual evidence.
if [ "$legacy_apply" = false ]; then
  "${node[@]}" "$root/tools/github/audit-rulesets.mjs" "$policy_file" "$inventory_file" "$audit_output"
fi
cat "$audit_output"
if [ -n "$result_file" ]; then
  "${node[@]}" tools/github/audit-junit.mjs "$policy_file" "$audit_output" "$result_file" "$manual_evidence_file"
fi
# Exit status and summary: missing Pages is drift; inaccessible is unverified. pages.https_enforced: unverified is incomplete (see audit-status.mjs).
strict_flag=()
if [ "$fail_on_drift" = true ]; then strict_flag=(--fail-on-drift); fi
set +e
"${node[@]}" "$root/tools/github/audit-status.mjs" "$audit_output" "${strict_flag[@]}"
status=$?
set -e
exit "$status"
