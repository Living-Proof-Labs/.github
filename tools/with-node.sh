#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
node=$(find "$root/.tools" -maxdepth 3 -type f -path '*/bin/node' -print -quit 2>/dev/null || true)
if [ -z "$node" ]; then
  echo 'Node is not installed. Run: task setup' >&2
  exit 69
fi
export PATH="$(dirname "$node"):$PATH"
exec "$@"
