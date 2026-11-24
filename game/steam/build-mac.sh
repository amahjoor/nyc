#!/bin/sh
# Stage the same public client as the PC depots. Universal merging uses macOS.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
out="$here/../../output/steam"
source_app="$out/mac-source"
if [ ! -f "$source_app/main.cjs" ]; then source_app="$out/depots/linux/resources/app"; fi
if [ ! -f "$source_app/main.cjs" ]; then source_app="$out/depots/windows/resources/app"; fi
if [ ! -f "$source_app/main.cjs" ]; then
    echo "Stage a public client with build.py first." >&2
    exit 1
fi
case "${1:-}" in
    universal|x64|arm64) arch="$1" ;;
    '') if [ "$(uname -s)" = Darwin ]; then arch=universal; else arch=x64,arm64; fi ;;
    *) echo "Usage: build-mac.sh [universal|x64|arm64]" >&2; exit 2 ;;
esac
set --
if [ -n "${CJ_MAC_BUNDLE_ID:-}" ]; then set -- "--app-bundle-id=$CJ_MAC_BUNDLE_ID"; fi
exec npx --yes @electron/packager@20.3.0 "$source_app" 'Concrete Jungle' \
    --platform=darwin --arch="$arch" --electron-version=45.4.1 --out="$out/macos" \
    --icon="$here/artwork/client-icon.icns" --no-asar --no-prune --overwrite "$@"
