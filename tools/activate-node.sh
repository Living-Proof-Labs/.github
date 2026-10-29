#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Source this file to opt into this checkout's Node runtime for the current shell.
root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
node=$(find "$root/.tools" -maxdepth 3 -type f -path '*/bin/node' -print -quit 2>/dev/null || true)
if [ -z "$node" ]; then
  echo 'Node is not installed. Run: task setup' >&2
  return 69 2>/dev/null || exit 69
fi
export PATH="$(dirname "$node"):$PATH"
echo "Activated $(node --version) for this shell only."
