#!/bin/bash
# DigitalOcean user data for a dedicated Ubuntu 24.04 x64 lobby host.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils caddy ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

version=v24.22.3
archive=node-$version-linux-x64.tar.xz
checksum=4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
curl -fsSL --retry 3 "https://nodejs.org/dist/$version/$archive" -o "$temp/$archive"
(cd "$temp" && printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check)
install -d /opt/concrete-jungle/runtime
tar -xJf "$temp/$archive" -C /opt/concrete-jungle/runtime
for binary in node npm; do
    ln -sfn "/opt/concrete-jungle/runtime/node-$version-linux-x64/bin/$binary" "/usr/local/bin/$binary"
done
/usr/local/bin/node --version
