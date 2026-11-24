#!/bin/bash
# On a dedicated host initialized by bootstrap.sh, publish a verified lobby archive.
set -euo pipefail
if [[ $# != 3 || $EUID != 0 ]]; then
    echo 'Usage as root: activate.sh lobby.hostname lobby-linux.tar.gz SHA256' >&2
    exit 2
fi
host=$1
archive=$(realpath "$2")
digest=$3
if [[ ! $host =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$ || ! $digest =~ ^[a-f0-9]{64}$ ]]; then
    echo 'Supply a public DNS name and the release archive SHA-256.' >&2
    exit 2
fi
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check
root=/opt/concrete-jungle
install -d "$root/releases" /etc/concrete-jungle
exec 9>"$root/deploy.lock"
flock 9
if [[ -e "$root/game" && ! -L "$root/game" ]]; then
    echo "$root/game already contains an unmanaged deployment." >&2
    exit 1
fi
stage=$(mktemp -d "$root/releases/.stage.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT
release="$root/releases/$digest"
if [[ ! -d "$release" ]]; then
    tar --no-same-owner -xzf "$archive" -C "$stage"
    npm ci --omit=dev --prefix "$stage/game/lobby"
    mkdir "$stage/release"
    mv "$stage/game" "$stage/release/game"
    mv "$stage/release" "$release"
fi
if [[ ! -e /etc/concrete-jungle/lobby.env ]]; then
    printf 'LOBBY_CAPACITY=16\n' >/etc/concrete-jungle/lobby.env
fi
cat > "$stage/Caddyfile" <<CADDY
$host {
    encode zstd gzip
    header X-Robots-Tag "noindex, nofollow"
    @lobby path /lobby /health
    handle @lobby {
        reverse_proxy 127.0.0.1:8787
    }
    handle {
        root * /srv/concrete-jungle/web
        file_server
    }
}
CADDY
caddy validate --config "$stage/Caddyfile" --adapter caddyfile
previous=$(readlink "$root/game" || true)
ln -s "$release/game" "$stage/current"
mv -Tf "$stage/current" "$root/game"
install -m 644 "$release/game/lobby/concrete-jungle-lobby.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable concrete-jungle-lobby
if ! systemctl restart concrete-jungle-lobby || ! curl -fsS --retry 8 --retry-connrefused --max-time 5 http://127.0.0.1:8787/health; then
    if [[ -n "$previous" ]]; then
        ln -s "$previous" "$stage/rollback"
        mv -Tf "$stage/rollback" "$root/game"
        install -m 644 "$previous/lobby/concrete-jungle-lobby.service" /etc/systemd/system/
        systemctl daemon-reload
        systemctl restart concrete-jungle-lobby
    else
        systemctl stop concrete-jungle-lobby
    fi
    exit 1
fi
if [[ ! -e /etc/caddy/Caddyfile.before-concrete-jungle ]]; then
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-concrete-jungle
fi
install -m 644 "$stage/Caddyfile" /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy
printf '\nLobby ready on host. Verify https://%s/health and wss://%s/lobby from another network.\n' "$host" "$host"
