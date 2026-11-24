# NYC friends lobby

The pilot uses one DigitalOcean Basic Droplet in NYC1, Ubuntu 24.04 x64, a single Node process and Caddy for HTTPS and WebSockets. The selected $6/month plan includes one shared vCPU, 1 GiB RAM, 25 GiB SSD and 1,000 GiB outbound transfer. Additional transfer is currently $0.01/GiB. Start with 16 players until tests on this host justify raising the limit. The Node process keeps the lobby in memory. A restart disconnects players and clears race records. [Droplet prices](https://www.digitalocean.com/pricing/droplets) · [Transfer billing](https://docs.digitalocean.com/products/droplets/details/pricing/)

The friends playtest runs at [Concrete Jungle NYC](https://concrete-jungle.159-65-216-109.sslip.io/). Share that link and choose **Play with friends** to meet at Broadway & Spring. On November 24, 2026, two separate desktop browser profiles joined over the public TLS endpoint, saw a nearby peer and started a Broadway sprint. The host caps the playtest at 16 concurrent players.

## Create and deploy

1. Use doctl with an authenticated context named `concrete-jungle`. The account needs billing enabled and permission to manage SSH keys and create Droplets. Recent doctl versions support `doctl auth login --context concrete-jungle` in the browser. The local `DOCTL` environment variable may point to an alternate binary. The provisioner prints the plan by default. With `--create`, it reuses the named Droplet if present. It creates a dedicated local SSH identity and registers its public key for a new host.

   ```sh
   python3 game/lobby/hosting/provision.py
   python3 game/lobby/hosting/provision.py --create
   ```

2. Set `CJ_IP` to the reported public IPv4. Point the chosen hostname's A record to that address and export `CJ_HOST` with that hostname. A temporary `<dashed-public-IP>.sslip.io` hostname can serve a friends playtest if its DNS and certificate issuance work. Use publisher-controlled DNS for release. The free hostname depends on a third party. [sslip.io](https://sslip.io/)

3. From the repository root, build with the actual address and run the deployment commands below. The first SSH connection asks you to trust the host key. The bootstrap script installs the pinned Node runtime, Caddy and the host firewall. The activation script configures Caddy for this dedicated host. Publish the **web** archive along with the lobby so friends can play directly from a link.

   ```sh
   set -eu
   : "${CJ_IP:?set the Droplet IPv4}" "${CJ_HOST:?set the public hostname}"
   ssh_key="$HOME/.ssh/id_ed25519_concrete_jungle"
   remote="root@$CJ_IP"
   python3 game/steam/build.py --platform linux --lobby-url "wss://$CJ_HOST/lobby"
   mkdir -p output/steam/handoff
   tar -czf output/steam/handoff/lobby-linux.tar.gz game/lobby/package.json game/lobby/package-lock.json game/lobby/server.mjs game/lobby/README.md game/lobby/concrete-jungle-lobby.service game/dist/lobby-protocol.js
   tar -czf output/steam/handoff/web.tar.gz -C output/steam web
   digest=$(sha256sum output/steam/handoff/lobby-linux.tar.gz | cut -d' ' -f1)
   web_digest=$(sha256sum output/steam/handoff/web.tar.gz | cut -d' ' -f1)
   ssh -i "$ssh_key" "$remote" 'cloud-init status --wait'
   scp -i "$ssh_key" game/lobby/hosting/activate.sh output/steam/handoff/{lobby-linux,web}.tar.gz "$remote:/tmp/"
   ssh -i "$ssh_key" "$remote" bash -s -- "$web_digest" <<'REMOTE'
   set -eu
   printf '%s  %s\n' "$1" /tmp/web.tar.gz | sha256sum --check
   base=/srv/concrete-jungle
   install -d "$base/releases"
   if ! test -d "$base/releases/$1"; then
       stage=$(mktemp -d "$base/releases/.web.XXXXXXXX")
       tar -xzf /tmp/web.tar.gz -C "$stage"
       mv "$stage/web" "$base/releases/$1"
       rmdir "$stage"
   fi
   ln -sfn "releases/$1" "$base/web.next"
   mv -Tf "$base/web.next" "$base/web"
   REMOTE
   ssh -i "$ssh_key" "$remote" bash /tmp/activate.sh "$CJ_HOST" /tmp/lobby-linux.tar.gz "$digest"
   npm ci --prefix game/lobby
   curl -fsS --retry 12 --retry-all-errors "https://$CJ_HOST/health"
   node game/lobby/hosting/probe.mjs "wss://$CJ_HOST/lobby"
   ```

4. Visit the HTTPS root in a WebGL2 browser, select **Play with friends** and wait for the street to appear. Open **Pause → Map → Online lobby** for the player list and sprint. Have a second person join from another network, meet at Broadway & Spring and exchange a signal. A successful WebSocket probe verifies the route and protocol. Record the two-player experience separately.

## Operate and scale

- Use the DigitalOcean CPU, memory and bandwidth graphs, the public health URL and a periodic WebSocket probe. Register a billing alert in the DigitalOcean control panel. Compare snapshot delivery, CPU, memory and outbound traffic at 8 and 16 players before adjusting `LOBBY_CAPACITY` in `/etc/concrete-jungle/lobby.env` and restarting the service. [Lobby benchmark](../README.md#capacity-and-testing)
- For a busy single room, first test a CPU/RAM resize. DigitalOcean's $12 option has 2 GiB RAM and one shared core. The $24 option has two shared cores, 4 GiB RAM and 4,000 GiB outbound transfer. A dedicated CPU may help if measured tick times vary with host load. The runtime is single-process, so extra cores are especially useful for additional independent rooms.
- For many simultaneous rooms, run independent lobby processes and add a small room directory that assigns groups to a room with available capacity. Keep each room on one process and let friends rejoin by room ID. Existing sessions and leaderboards are in-memory. Put purchases and account entitlements in a separate persistent service before enabling sales.
- The crowded 512-client loopback benchmark produced 52.65 Mbit/s of outgoing application data. Sustained for 30 days, that is about 15.5 TiB before transport overhead. Use real aggregate transfer when budgeting. Hosting capacity and egress are separate costs. [DigitalOcean bandwidth pricing](https://docs.digitalocean.com/products/droplets/details/pricing/)

AWS Lightsail is a reasonable comparison for a growing single room. Its $12 US Linux IPv4 bundle includes two burstable vCPUs, 2 GB RAM and 3 TB transfer. For this friends test the existing DigitalOcean account and $6 baseline keep the setup small. [AWS bundle comparison](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) · [Lightsail CPU baselines](https://docs.aws.amazon.com/lightsail/latest/userguide/baseline-cpu-performance.html)
