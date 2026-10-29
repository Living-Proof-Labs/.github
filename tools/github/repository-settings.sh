#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

policy_file=config/github/repository-policy.json
inventory_file=config/github/repositories.json
fail_on_drift=false
if [ "${1:-}" = "--fail-on-drift" ]; then
  fail_on_drift=true
  shift
fi
policy=$(node -e 'const fs=require("fs"); console.log(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1]))))' "$policy_file")
repository=$(node -e 'console.log(JSON.parse(process.argv[1]).repository)' "$policy")
tag=$(node -e 'console.log(JSON.parse(process.argv[1]).tag)' "$policy")
tool_path=$(node -e 'console.log(JSON.parse(process.argv[1]).tool_path)' "$policy")
expected_sha=$(node -e 'console.log(JSON.parse(process.argv[1]).tool_blob_sha)' "$policy")
policy_path=$(node -e 'console.log(JSON.parse(process.argv[1]).policy_path)' "$policy")
expected_policy_sha=$(node -e 'console.log(JSON.parse(process.argv[1]).policy_blob_sha)' "$policy")
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
fetch_pinned_file() {
  local remote_path=$1 expected=$2 output=$3 endpoint actual
  endpoint="repos/$repository/contents/$remote_path?ref=$tag"
  actual=$(gh api "$endpoint" --jq .sha)
  if [ "$actual" != "$expected" ]; then
    echo "Released policy identity differs from the pinned blob; refusing to execute." >&2
    exit 1
  fi
  mkdir -p "$(dirname "$output")"
  gh api "$endpoint" --jq .content | base64 --decode > "$output"
}
tool_file="$work_dir/$tool_path"
released_policy_file="$work_dir/$policy_path"
fetch_pinned_file "$tool_path" "$expected_sha" "$tool_file"
fetch_pinned_file "$policy_path" "$expected_policy_sha" "$released_policy_file"
audit_output="$work_dir/audit-output.txt"
set +e
node "$tool_file" --inventory "$inventory_file" "$@" | tee "$audit_output"
tool_status=${PIPESTATUS[0]}
set -e
if [ "$tool_status" -ne 0 ]; then
  exit "$tool_status"
fi
differences=$(sed -n 's/^\([0-9][0-9]*\) difference(s) found; [0-9][0-9]* error(s).$/\1/p' "$audit_output")
if [ -z "$differences" ]; then
  echo "Audit did not return a recognizable summary; refusing to classify state." >&2
  exit 4
fi
if grep -q 'immutable releases: unknown' "$audit_output"; then
  echo "Audit status: incomplete ($differences difference(s); immutable release state unknown)."
  "$fail_on_drift" && exit 3
elif [ "$differences" -gt 0 ]; then
  echo "Audit status: drift detected ($differences difference(s))."
  "$fail_on_drift" && exit 2
else
  echo "Audit status: compliant."
fi
