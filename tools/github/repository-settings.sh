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
policy=$("${node[@]}" -e 'const fs=require("fs"); console.log(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1]))))' "$policy_file")
repository=$("${node[@]}" -e 'console.log(JSON.parse(process.argv[1]).repository)' "$policy")
tag=$("${node[@]}" -e 'console.log(JSON.parse(process.argv[1]).tag)' "$policy")
tool_path=$("${node[@]}" -e 'console.log(JSON.parse(process.argv[1]).tool_path)' "$policy")
expected_sha=$("${node[@]}" -e 'console.log(JSON.parse(process.argv[1]).tool_blob_sha)' "$policy")
policy_path=$("${node[@]}" -e 'console.log(JSON.parse(process.argv[1]).policy_path)' "$policy")
expected_policy_sha=$("${node[@]}" -e 'console.log(JSON.parse(process.argv[1]).policy_blob_sha)' "$policy")
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
fetch_pinned_file() {
  local remote_path=$1 expected=$2 output=$3 actual url
  # The provider is public. Fetch it anonymously so the administration-only
  # installation token never needs Contents permission; verify the Git blob
  # identity locally before executing either downloaded file.
  url="https://raw.githubusercontent.com/$repository/$tag/$remote_path"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$url" > "$output"
  actual=$(git hash-object "$output")
  if [ "$actual" != "$expected" ]; then
    echo "Released policy identity differs from the pinned blob; refusing to execute." >&2
    exit 1
  fi
}
tool_file="$work_dir/$tool_path"
released_policy_file="$work_dir/$policy_path"
mkdir -p "$(dirname "$tool_file")" "$(dirname "$released_policy_file")"
fetch_pinned_file "$tool_path" "$expected_sha" "$tool_file"
fetch_pinned_file "$policy_path" "$expected_policy_sha" "$released_policy_file"
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
"${node[@]}" "$root/tools/github/redact-secrets.mjs" <"$raw_output" | tee "$audit_output"
"${node[@]}" "$root/tools/github/redact-secrets.mjs" <"$raw_error" >&2
rm -f "$raw_output" "$raw_error"
if [ "$tool_status" -ne 0 ]; then
  exit "$tool_status"
fi
# Compare pages.https_enforced for sites the audit could read. A repository
# with no Pages site is required Pages drift. An unreadable value is incomplete, not a
# pass. v7.10.0 exempts website; that line is not drift.
"${node[@]}" "$root/tools/github/audit-pages-https.mjs" "$released_policy_file" "$audit_output"
if [ -n "$result_file" ]; then
  "${node[@]}" tools/github/audit-junit.mjs "$released_policy_file" "$audit_output" "$result_file" "$manual_evidence_file"
fi
# Exit status and summary: missing Pages is drift; inaccessible is unverified. pages.https_enforced: unverified is incomplete (see audit-status.mjs).
strict_flag=()
if [ "$fail_on_drift" = true ]; then strict_flag=(--fail-on-drift); fi
set +e
"${node[@]}" "$root/tools/github/audit-status.mjs" "$audit_output" "${strict_flag[@]}"
status=$?
set -e
exit "$status"
