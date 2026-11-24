# Concrete Jungle Steam release candidate

[Linux release and lobby](linux.md) · [Windows agent handoff](windows.md) · [Mac agent handoff](macos.md) · [Steamworks submission packet](submission.md)

## Build and play

From the repository root, use Python 3.11+ and an internet connection for the first build.

```sh
python3 game/steam/build.py
```

The builder verifies Electron 45.4.1 x64 against pinned SHA-256 digests before extraction. For a single target, pass `--platform windows` or `--platform linux`. Windows and Linux builds also stage the browser client. Use `--platform macos` to stage the shared app directly for a Mac agent. Public packages lock in fictional business and wardrobe names, omit the original archive prints, downloaded chain logos, personal phone photographs and developer galleries, and retain asset credits and runtime license notices. Canonical source names remain in the underlying city and inventory data for identification and save compatibility.

| Target | Launch or serve |
| --- | --- |
| Windows x64 | `output/steam/depots/windows/ConcreteJungle.exe` |
| Linux x64 | `output/steam/depots/linux/concrete-jungle` |
| macOS Intel / Apple silicon | Run `python3 game/steam/build.py --platform macos`, then `sh game/steam/build-mac.sh universal` on a Mac. Find the resulting app bundles under `output/steam/macos/`. |
| Browser | Serve `output/steam/web/` over HTTPS, or HTTP on localhost for testing |

The entire depot directory is the install. Launch from a normal user account. Saves use the persistent application profile on desktop and the site origin on the web. An internet connection supplies detailed city geometry and orthophotos. The desktop client uses authored text replies and local speech synthesis. The development server can use a separate language model service.

A lobby server can be self-hosted. To prefill a public address in all packages, build with `--lobby-url wss://your-actual-host/lobby`. On the public web, the same-origin lobby path is the default. [Server setup and cross-play](../lobby/README.md)

## SteamPipe

Set up two OS-specific depots in Steamworks. Attach both to the appropriate packages and configure platform-filtered launch options using the relative executable paths **ConcreteJungle.exe** and **concrete-jungle**. Build the Linux depot on a host that preserves Unix executable bits. Use Valve’s actual IDs as the three arguments below.

```sh
python3 game/steam/build.py --vdf "$STEAM_APP_ID" "$STEAM_WINDOWS_DEPOT_ID" "$STEAM_LINUX_DEPOT_ID" --preview
```

For a Mac depot, run `sh game/steam/build-mac.sh universal` on macOS, sign and notarize the finished app with the publisher’s Developer ID, and add `--mac-depot "$STEAM_MAC_DEPOT_ID"` to the VDF command. Configure its launch option as **Concrete Jungle.app**. Test the downloaded build on Intel and Apple silicon. [Electron signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)

The generator writes the app and depot VDF files to `output/steam/scripts/`. On the Steamworks SDK ContentBuilder host, authenticate with your build account, then run the following from SteamCMD with the generated absolute path.

```text
run_app_build /absolute/path/to/output/steam/scripts/app_<APP_ID>.vdf
```

Preview mode creates the manifest locally. After checking the file lists, generate the VDF again without `--preview` to upload. Assign the uploaded build to a private branch in Steamworks and install it with a test account on each platform. The VDF leaves branch promotion to the publisher. [Valve SteamPipe documentation](https://partner.steamgames.com/doc/sdk/uploading)

## Store page draft

**Short description**

Explore all five boroughs of New York in a street-level sandbox. Walk into fictional shops, buy a new outfit, drive a cab, or meet friends downtown for a Broadway sprint.

**About the game**

Pick a street or landmark on the map and descend into New York. Take a bike through the neighborhood, drive across boroughs, or use the subway. The street grid follows city records, with shops and interiors built for play.

Stop for a slice, try on clothes, or clock in for a shift. In a shared lobby you can find other players at Broadway and Spring, send a signal, and race through three checkpoints. Each player keeps their own inventory and progress.

**Draft feature selections:** Single-player, online multiplayer, English interface. Describe desktop and browser cross-play in the detailed description. The public lobby address and account-side features should match the build Valve receives. Measure minimum system requirements on actual target hardware.

**Store assets.** The four store capsules and the library capsule, logo and hero are in [artwork](artwork/). Use `header.png` for both store and library header. The community icon is a 184 × 184 JPEG. The client icon is included in PNG, ICO and ICNS. The [gameplay trailer](gameplay-trailer.mp4) was captured in the packaged Linux game. The artwork reuses the game's tree emblem, Bitter typeface and mapped SoHo streets. To re-render, use `artwork.py` with Pillow, woff2_decompress and rsvg-convert. The [screenshots](screenshots/) come from live gameplay at 1920 × 1080. [Valve store artwork](https://partner.steamgames.com/doc/store/assets/standard) · [Valve library artwork](https://partner.steamgames.com/doc/store/assets/libraryassets)

## Platform verification

A packaged Linux desktop client and a Chromium web client joined the same dedicated server, met in SoHo, exchanged a signal and received the Broadway sprint checkpoint. A second run exercised all six peer travel modes, map and radar updates, and reconnection. Controller input in the Linux build selected a sprint, changed the signal and returned to the pause menu. The game suite passed 1,083 tests, the reference tools passed 36, and the dedicated lobby integration test passed. Windows x64, macOS x64 and macOS arm64 packages were built on Linux. Native Windows and Mac playtests, Safari, mobile devices, Steam Deck and Internet sessions still need device testing. There are no console builds. [Capacity measurements](../lobby/README.md#capacity-and-testing)

## Publisher decisions before release

- **Title and rights.** A separate game already uses *Concrete Jungle* on Steam. Review the title, published screenshots, distinctive outfits, storefront appearance, real vehicle designs and badges, public-agency marks, voices, photos and data redistribution terms for the intended territories. The [legal research](../docs/brand-parody-and-steam-release.md) records the distinction between changing names and clearing artwork. [Existing Steam title](https://store.steampowered.com/app/400160/Concrete_Jungle/)
- **Content survey.** Inspect the actual build for weapons, violence, death, robbery, substances, and online interactions. Document player-facing generated assets, including shop imagery, and distinguish prerecorded synthetic speech from speech synthesized during play. The production build uses authored text conversations. Complete the survey using the shipped implementation and your production records. [Valve content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)
- **Online operation.** Select a public server, configure TLS and publish its address in the build. Verify cross-play over different internet connections and reboot/reconnect behavior. Review privacy disclosures for server IP handling and any host or proxy logs. The included dedicated service runs in memory.
- **Store and build review.** The publisher supplies partner identity, tax and bank details, Steam Direct payment, AppID, depot IDs, support contact, price and release territories. Submit the store page first, then submit the candidate build on the unreleased app’s default branch for Valve review. Valve publishes onboarding and Coming Soon timing requirements. [Steam Direct](https://partner.steamgames.com/steamdirect) · [Valve review process](https://partner.steamgames.com/doc/store/review_process)
