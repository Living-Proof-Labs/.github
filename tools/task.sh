#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task=$(find "$root/.tools" -maxdepth 3 -type f -name task -print -quit 2>/dev/null || true)
if [ -z "$task" ]; then
  echo 'Task is not installed. Run: bash tools/setup.sh' >&2
  exit 69
fi
exec "$task" "$@"
