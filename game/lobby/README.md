# Concrete Jungle multiplayer

Select **Play with friends** on the title screen to spawn at Broadway & Spring and join the configured lobby. To choose another server or open the multiplayer controls after entering the city, open **Pause → Map → Online lobby**. People using the desktop game and the public web build can enter the same server address. Each participant gets a session nickname and a colour. **Meet at Broadway & Spring** brings friends to the same intersection. Nearby players appear on the radar and map. Their avatars follow their movement and show their current travel mode. Signals appear over the game. **Start Broadway sprint** marks three checkpoints in order and records the fastest completed time for this server session.

Players see each other's fitted character, clothing and animated pose. Within 180 metres of a neighborhood's simulation host, friends in the same street or interior share traffic, parked cars, pedestrians, police vehicles and officers, bicycles, damaged street furniture, and shop doors and windows. A player driving a car supplies its movement to the group. The lobby elects an active participant to run each neighborhood, relays street interactions, and supplies the city clock. A late joiner receives the current scene. When a host leaves, another nearby player takes over.

World state is session-based. A neighborhood can repopulate when everyone leaves. Money, health, wanted level, inventory and jobs belong to each player. The lobby favors a player with an active pursuit when assigning neighborhood authority. Direct player-versus-player damage and shared mission progress are outside this playtest. A server restart clears the session record. The server accepts preset signals and assigns names from a fixed list.

## Run a lobby

From the repository root, use Node 22 or newer.

```sh
npm ci --prefix game/lobby
npm start --prefix game/lobby
```

The local address is `ws://127.0.0.1:8787/lobby`. To host for others, place a TLS reverse proxy in front of the server. Forward WebSocket upgrades at `/lobby` to `127.0.0.1:8787`. Serve the contents of `output/steam/web` as static files on the same HTTPS origin for browser players. In Caddy, the following directives go inside your actual hostname’s site block.

```caddyfile
handle /lobby {
    reverse_proxy 127.0.0.1:8787
}
handle {
    root * /srv/concrete-jungle/web
    file_server
}
```

The public browser client proposes `wss://<its-own-host>/lobby`. Supply your public endpoint to the desktop packaging command using `--lobby-url`. Each player can also type the endpoint in the lobby dialog. All clients need WebGL2 and a compatible WebSocket implementation. A public deployment needs a reachable hostname, a trusted certificate, and an operator for the game service.

| Process setting | Meaning |
| --- | --- |
| `HOST` | Listening interface, default `127.0.0.1` |
| `PORT` | Listening port, default `8787` |
| `LOBBY_CAPACITY` | Simultaneous connections, default 512 |
| `LOBBY_ORIGINS` | Optional comma-separated browser origins. Include `concrete://game` for the desktop app and the exact public HTTPS origin for web clients. |
| `GET /health` | Protocol version, active connections and configured capacity |

## Capacity and testing

Each client sends position, heading, travel mode and interior at up to 10 Hz. Each snapshot contains up to 32 players within 650 metres in the same space. The server shares candidate lists for players on the same block, drops snapshots when a client falls behind and checks connections with WebSocket heartbeats. At larger populations, run additional independent lobby processes and give each its own endpoint.

```sh
npm test --prefix game/lobby
node game/lobby/load.mjs 512
node game/lobby/load.mjs 1024
```

The presence benchmark sends player positions only. It omits character animation and neighborhood snapshots. It starts a private loopback server and crowds all clients into the same area for 100 updates. In the release-preparation run, 512 simulated clients received 9.50 snapshots per second each at 52.65 Mbit/s of outgoing application payload. At 1,024 clients the figures were 9.02 and 100.22 Mbit/s. TLS, Internet latency, packet loss, mobile performance and long-running operations need separate measurement on the deployment host.
