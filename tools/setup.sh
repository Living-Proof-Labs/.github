#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
version=v24.22.2
architecture=$(uname -m)
case "$architecture" in
  x86_64) platform=x64; checksum=48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75 ;;
  aarch64|arm64) platform=arm64; checksum=eb187837a2230d4047161ac0be008584e16b46f726e9c9490ee35dc6b17d9ba8 ;;
  *) echo "Unsupported Linux architecture: $architecture (supported: x86_64, aarch64)." >&2; exit 64 ;;
esac
destination="$root/.tools/node-$version-linux-$platform"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
if [ -x "$destination/bin/node" ] && [ "$("$destination/bin/node" --version)" = "$version" ]; then
  printf 'Node %s is already installed at %s\n' "$version" "$destination"
else
command -v curl >/dev/null || { echo 'setup needs curl to download the official Node archive.' >&2; exit 69; }
command -v tar >/dev/null || { echo 'setup needs tar to extract the official Node archive.' >&2; exit 69; }
archive="$temporary/node.tar.xz"
url="https://nodejs.org/dist/$version/node-$version-linux-$platform.tar.xz"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$archive" "$url"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
tar -xJf "$archive" -C "$temporary"
mkdir -p "$root/.tools"
if [ -e "$destination" ]; then
  rm -rf "$destination"
fi
mv "$temporary/node-$version-linux-$platform" "$destination"
fi
installed_node_version=$("$destination/bin/node" --version)
if [ "$installed_node_version" != "$version" ]; then
  echo 'Installed Node did not report the expected version.' >&2
  exit 70
fi
task_version=v3.54.0
task_destination="$root/.tools/task-$task_version-linux-$platform"
if [ "$platform" = x64 ]; then task_platform=amd64; task_checksum=680859dbb4d881a9c72d4d9a8f510825450849af8567deacd7302c01124416fb; else task_platform=arm64; task_checksum=d7189d439d4a6058e39e1b2acd7c8b27acd4856691b408f23b242e4294e1df5b; fi
if [ ! -x "$task_destination/task" ]; then
  task_archive="$temporary/task.tar.gz"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$task_archive" "https://github.com/go-task/task/releases/download/$task_version/task_linux_$task_platform.tar.gz"
  printf '%s  %s\n' "$task_checksum" "$task_archive" | sha256sum --check --status
  mkdir -p "$task_destination"
  tar -xzf "$task_archive" -C "$task_destination" task
fi
printf 'Verified Node %s and Task %s under %s\n' "$installed_node_version" "$task_version" "$root/.tools"
printf 'For repository commands: bash tools/task.sh verify\n'
printf 'For bare node in this shell only: source tools/activate-node.sh\n'
