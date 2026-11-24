# Steamworks submission packet

The publisher can use the copy and media below to fill out the partner dashboard. The desktop candidate currently defaults to an empty lobby address. The online release needs a published endpoint, rebuilt depots and a successful Internet playtest. The local builds and native QA can proceed while the publisher recovers the Steam account. After recovery, complete Steam Direct onboarding, then use the partner checklist for the assigned AppID. [Valve review process](https://partner.steamgames.com/doc/store/review_process)

## Store presence

| Steamworks field | Entry or file |
| --- | --- |
| Product type and name | Game · Concrete Jungle (working title pending publisher clearance) |
| Short description and About This Game | Paste the two paragraphs and short copy from the [store draft](README.md#store-page-draft). |
| Features and language | Single-player, online multiplayer, English interface. The lobby shares player presence, signals and a three-checkpoint race. Each player has local inventory and city simulation. |
| Candidate tags | Open World, Exploration, Sandbox, Driving. Confirm their ordering in the tag wizard. |
| Store capsules | [Header](artwork/header.png), [small](artwork/small.png), [main](artwork/main.png), [vertical](artwork/vertical.png) |
| Library art | [Capsule](artwork/library-capsule.png), [hero](artwork/library-hero.png), [logo](artwork/library-logo.png), [header](artwork/header.png). Preview logo placement at desktop and handheld widths. |
| Community and client | [184 × 184 JPEG app icon](artwork/app-icon.jpg), [256 × 256 PNG shortcut icon](artwork/client-icon.png), [Windows ICO](artwork/client-icon.ico), [Mac ICNS](artwork/client-icon.icns) |
| Screenshots | Upload the six [1920 × 1080 in-game captures](screenshots/) and preview the first four in the carousel. Set family-friendly flags after viewing each image. |
| Trailer | Upload the [26-second gameplay trailer](gameplay-trailer.mp4). It shows walking, route selection, driving and Liberty Island in the packaged Linux game. Select **Gameplay**, review the maturity setting, wait for transcoding, preview with sound and mark it **Visible on Store**. |
| Publisher fields | Supply the actual developer and publisher display names, support email/URL, territories, pricing, release date and minimum hardware/OS established by native testing. Publish approved pricing. |

The trailer contains captured game sound. Use the game's asset provenance to prepare public credits for the video and screenshots. The capture includes edited sound effects, NYC imagery and the adapted e-sfera Statue of Liberty. Provide applicable creator names, source and license links, and modification notices with the marketing material. [Audio attribution](../dist/assets/audio/credits.txt) · [Map, imagery and model credits](../README.md#asset-credits-and-archived-inputs) · [Valve trailer settings](https://partner.steamgames.com/doc/store/trailer) · [Valve icon specifications](https://partner.steamgames.com/doc/store/assets/community)

**Publisher rights decision.** An existing Steam game released in 2015 already uses the exact title *Concrete Jungle*. Decide on title clearance or a new title before publishing the page, then update the artwork, bundles and listing together if needed. Review the fictional storefronts, clothing designs, surviving trade dress, models, imagery, recordings and third-party notices in the shipped candidate and marketing assets. The internal brand toggle is locked to fictional names in public packages. [Existing Steam listing](https://store.steampowered.com/app/400160/Concrete_Jungle/) · [Repository rights research](../docs/brand-parody-and-steam-release.md)

The publisher is considering a paid base game and optional currency. The [pricing proposal and purchase design](commerce/README.md) covers the candidate US prices, a private preview and Steam Wallet integration. Leave the In-App Purchases feature unchecked for the current build.

## Content survey working notes

- Play through combat and death, weapons, robbery, vehicle theft, bars, scratchcards and character customization. Answer Valve's violence, substances, simulated gambling, nudity and age-rating questions from the content players can actually encounter and the publisher's inventory.
- The development records identify generated shop imagery, including menu photographs and salon imagery. Some NPC speech is prerecorded synthetic speech. The packaged app also synthesizes speech locally at runtime using Piper. The release uses authored text conversations and disables the development dialogue API. Describe the generated assets and runtime speech separately. Verify inputs, applicable model licenses and the safeguards actually present before answering Valve's live-generation questions. [Development records](../README.md) · [Voice credits](../dist/assets/audio/credits.txt) · [Valve content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)
- Online players receive a preset nickname and can send preset signals. The lobby receives connection and movement data. Confirm the chosen host's IP logging, retention, support contact and privacy disclosures. Select additional Steam features only when exercised by the reviewed build on the advertised platforms.

## Depot setup and upload

1. Recover the Steam account through [Steam Support](https://help.steampowered.com/en/wizard/HelpWithLogin), finish Steamworks onboarding and create the application. Record the real AppID and three OS-specific depot IDs. Set the install folder to `Concrete Jungle`. Attach the same shipping depots to both the store and Developer Comp packages, with OS filters and all languages. [Steam Direct](https://partner.steamgames.com/steamdirect) · [Valve depot setup](https://partner.steamgames.com/doc/store/application/depots)
2. Set platform-specific launch options relative to the install root. Use `ConcreteJungle.exe` on Windows x64, `concrete-jungle` on Linux x64 and `Concrete Jungle.app` on macOS. Select 64-bit and notarization status on macOS once verified. Choose the tested Linux runtime in the partner settings where offered. Publish these configuration changes. [Valve platform settings](https://partner.steamgames.com/doc/store/application/platforms)
3. Use the [Linux](linux.md), [Windows](windows.md) and [Mac](macos.md) procedures with one source revision and the same production WSS URL. Assemble their returned archives on the SteamPipe upload host. A Mac can preserve both the signed bundle's symlinks and the Linux executable bits. Verify each archive's SHA-256 against the native agent's result before unpacking into a fresh staging directory.

```sh
set -eu
mkdir -p output/steam/depots "output/steam/macos/Concrete Jungle-darwin-universal"
tar -xzf output/steam/handoff/windows-x64.tar.gz -C output/steam/depots
tar -xzf output/steam/handoff/linux-x64.tar.gz -C output/steam/depots
ditto -x -k output/steam/handoff/macos-universal.zip "output/steam/macos/Concrete Jungle-darwin-universal"
test -x output/steam/depots/linux/concrete-jungle
xcrun stapler validate "output/steam/macos/Concrete Jungle-darwin-universal/Concrete Jungle.app"
codesign --verify --deep --strict "output/steam/macos/Concrete Jungle-darwin-universal/Concrete Jungle.app"
python3 game/steam/build.py --vdf "$STEAM_APP_ID" "$STEAM_WINDOWS_DEPOT_ID" "$STEAM_LINUX_DEPOT_ID" --mac-depot "$STEAM_MAC_DEPOT_ID" --preview
```

4. Launch SteamCMD from the Steamworks SDK's ContentBuilder environment. Log in interactively using the authorized build account. Run `run_app_build "/absolute/path/to/output/steam/scripts/app_<APP_ID>.vdf"`, replacing the path and ID with the generated file. Inspect the preview lists and logs for each OS. Regenerate the VDF with the same IDs and without `--preview`, then rerun the command to upload. Record the resulting BuildID. The script leaves branch assignment to the publisher. [Valve SteamPipe upload](https://partner.steamgames.com/doc/sdk/uploading)
5. Assign that BuildID to a private beta for native Steam-install and cross-network QA. Once accepted internally, assign the same BuildID to the **default branch** of the unreleased app. Confirm the store and Developer Comp packages download the expected files. Launch through the library's green **Play** button on a clean machine and play the current candidate for at least five minutes. Record BuildID, OS, duration and date. Valve documents the accepted playtime window in the checklist. [Valve build review](https://partner.steamgames.com/doc/store/review_process)
6. Complete the store presence checklist and submit the store page for review first. Complete the build checklist and submit the default-branch build for review with the instructions below. Track Valve's feedback on the app landing page. After approval, the publisher controls the Coming Soon and public release actions and their timing. [Valve release process](https://partner.steamgames.com/doc/store/releasing) · [Onboarding and waiting periods](https://partner.steamgames.com/steamdirect)

## Draft build review notes

Use after checking these steps on the actual submitted BuildID and production lobby.

> Launch from your Steam library and select Explore New York. Search for SoHo, choose the destination and spawn. Walk with WASD. Open the map with M, change the zoom and return to the street. An Internet connection supplies detailed city geometry and aerial imagery.
>
> For multiplayer, open Pause → Map → Online lobby. Join the prefilled server. A second player can join on another supported desktop platform. Use Meet at Broadway & Spring, send a signal, then start the Broadway sprint to see the first checkpoint on the map. Characters, inventories and civilian traffic are local to each player.
>
> Under Pause → Settings, change Interface sounds, choose Quit to desktop, then launch again to check the saved preference. No separate game account is required.

## Submission record

Record the candidate commit, archive digests, AppID and depot IDs, BuildID, device reports, protected-beta and default-branch install results, published lobby URL and cross-network QA, asset/rights sign-off, store presence review status and build review status in the publisher's release record. Keep account passwords, Steam Guard codes, signing keys and banking information in their respective account systems.
