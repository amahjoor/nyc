# Linux release and lobby operations

For the approved $6 NYC friends pilot, follow the [US East provisioning and deployment guide](../lobby/hosting/README.md).

The Linux Steam depot contains the game and its Electron runtime. The dedicated lobby runs on a separate host. Installed players only need the desktop depot to start the game.

## Build and test the client

Use x86-64 Linux with a desktop session, WebGL2-capable graphics, Python 3.11+ and Node 22.12+ for the test driver. From the repository root, set `CJ_LOBBY_URL` to the production WSS address for a multiplayer release. An empty value stages a candidate for local testing.

```sh
set -eu
git rev-parse HEAD
python3 game/steam/build.py --platform linux --lobby-url "${CJ_LOBBY_URL:-}"
npm ci --prefix game/lobby
node game/steam/smoke.mjs output/steam/depots/linux/concrete-jungle
```

Repeat the smoke test with `CJ_STEAM_RUNTIME` set to the absolute path of the Valve runtime's `SteamLinuxRuntime_sniper/run` executable. Run under the logged-in desktop user. The driver starts a temporary lobby and save profile and writes a screenshot and JSON report under `output/steam/qa/linux-*/`. [Valve runtime releases](https://repo.steampowered.com/steamrt-images-sniper/snapshots/) · [Valve Linux development](https://partner.steamgames.com/doc/store/application/platforms/linux)

```sh
mkdir -p output/steam/handoff
tar -czf output/steam/handoff/linux-x64.tar.gz -C output/steam/depots linux
tar -czf output/steam/handoff/lobby-linux.tar.gz game/lobby/package.json game/lobby/package-lock.json game/lobby/server.mjs game/lobby/README.md game/lobby/concrete-jungle-lobby.service game/dist/lobby-protocol.js game/dist/shared-scene.js
(cd output/steam/handoff && sha256sum linux-x64.tar.gz lobby-linux.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS)
```

On November 24, 2026, the Linux desktop test exercised SoHo spawn, WebGL2, a loopback lobby, the Broadway sprint and preference persistence. The machine ran Omarchy 4.0.6 on Wayland with a GTX 1660 and Core i7-7700K. The Valve container test used sniper 3.0.20261021.266025. The lobby archive installed on a clean temporary path and its health endpoint reported protocol v1 and capacity 512. This machine has no authenticated Steam client. The native Steam download, overlay, minimum-spec measurement and physical Steam Deck playtest have separate results to collect. See the [NYC pilot](../lobby/hosting/README.md) for the live browser session. [Valve runtime used for this test](https://repo.steampowered.com/steamrt-images-sniper/snapshots/3.0.20261021.266025/)

## Operate the Linux lobby

On the chosen server, install system-wide Node 22+ and npm. Verify the supplied archive against the release coordinator's SHA-256 value. The service file expects the following directory layout. Install it as the server administrator after choosing the deployment host.

```sh
sudo install -d /opt/concrete-jungle
sudo tar -xzf lobby-linux.tar.gz -C /opt/concrete-jungle
sudo npm ci --omit=dev --prefix /opt/concrete-jungle/game/lobby
sudo install -m 644 /opt/concrete-jungle/game/lobby/concrete-jungle-lobby.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now concrete-jungle-lobby
curl -fsS http://127.0.0.1:8787/health
```

Place a TLS reverse proxy in front of the loopback listener. Configure public DNS and a trusted certificate and forward WebSocket upgrades on `/lobby`. The Caddy example and environment settings are in the server guide. For a browser deployment, serve `output/steam/web` over HTTPS. Optional overrides go in `/etc/concrete-jungle/lobby.env`. Restart the service after editing this file. Review proxy logging and retention against the operator's privacy disclosures. [Lobby deployment and capacity measurements](../lobby/README.md)

Bake that same public address into all release depots. From two separate Internet connections, join via the prefilled address, meet at Broadway & Spring, exchange a signal and start a sprint. Restart the test lobby and rejoin. Report the host, candidate commit, BuildID, peer platforms and observed behavior. The private Steam branch is for team QA. Valve's review uses the candidate on the default branch. [Submission packet](submission.md)
