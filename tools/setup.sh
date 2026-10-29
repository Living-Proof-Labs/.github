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
if [ -x "$destination/bin/node" ] && [ "$("$destination/bin/node" --version)" = "$version" ]; then
  printf 'Node %s is already installed at %s\n' "$version" "$destination"
  exit 0
fi
command -v curl >/dev/null || { echo 'setup needs curl to download the official Node archive.' >&2; exit 69; }
command -v tar >/dev/null || { echo 'setup needs tar to extract the official Node archive.' >&2; exit 69; }
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
archive="$temporary/node.tar.xz"
url="https://nodejs.org/dist/$version/node-$version-linux-$platform.tar.xz"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$archive" "$url"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
tar -xJf "$archive" -C "$temporary"
mkdir -p "$root/.tools"
mv "$temporary/node-$version-linux-$platform" "$destination"
printf 'Installed Node %s at %s\n' "$version" "$destination"
