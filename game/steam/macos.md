# Mac agent handoff

Use a Mac with Xcode command-line tools, Git, Python 3.11+, Node 22.12+ and npm. In a fresh checkout, set `CJ_RELEASE_SHA` to the agreed commit and `CJ_MAC_BUNDLE_ID` to the publisher's reverse-DNS identifier. Set `CJ_LOBBY_URL` to the production WSS endpoint for the online candidate. Empty is valid for local QA. Run these commands from the repository root in Bash or zsh. For the friends playtest, use `wss://concrete-jungle.159-65-216-109.sslip.io/lobby`. On a fresh profile, select **Play with friends** and verify the game joins the NYC lobby at Broadway & Spring.

```sh
set -eu
git fetch origin main
git switch --detach "${CJ_RELEASE_SHA:?set the release commit}"
git rev-parse HEAD
: "${CJ_MAC_BUNDLE_ID:?set the publisher bundle ID}"
export CJ_MAC_BUNDLE_ID
python3 game/steam/build.py --platform macos --lobby-url "${CJ_LOBBY_URL:-}"
sh game/steam/build-mac.sh universal
app="$PWD/output/steam/macos/Concrete Jungle-darwin-universal/Concrete Jungle.app"
lipo -archs "$app/Contents/MacOS/Concrete Jungle"
lipo -verify_arch arm64 x86_64 "$app/Contents/MacOS/Concrete Jungle"
npm ci --prefix game/lobby
node game/steam/smoke.mjs "$app/Contents/MacOS/Concrete Jungle"
```

Re-stage the source and rebuild after changing commit, endpoint or identifier. For distribution, use the publisher's **Developer ID Application** certificate and an Apple notarytool profile already stored in the local Keychain. Set `CJ_MAC_SIGN_IDENTITY` to the certificate identity and `CJ_NOTARY_PROFILE` to the local profile name. Keep certificates and credentials in the signing environment. Apple receives the signed app during notarization. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) · [Valve macOS requirements](https://partner.steamgames.com/doc/store/application/platforms)

```sh
set -eu
: "${CJ_MAC_SIGN_IDENTITY:?set the Developer ID Application identity}"
: "${CJ_NOTARY_PROFILE:?set the Keychain profile}"
export CJ_MAC_SIGN_IDENTITY
npm ci --prefix game/steam/mac
node game/steam/mac/sign.mjs "$app"
codesign -dv --verbose=4 "$app"
mkdir -p output/steam/handoff
handoff="$PWD/output/steam/handoff"
ditto -c -k --keepParent "$app" "$handoff/mac-notary-input.zip"
xcrun notarytool submit "$handoff/mac-notary-input.zip" --keychain-profile "$CJ_NOTARY_PROFILE" --wait --output-format json > "$handoff/mac-notary.json"
python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); print(r["id"],r["status"]); sys.exit(r["status"]!="Accepted")' "$handoff/mac-notary.json"
xcrun stapler staple "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=4 "$app"
codesign --verify --deep --strict --verbose=2 "$app"
ditto -c -k --keepParent "$app" "$handoff/macos-universal.zip"
shasum -a 256 "$handoff/macos-universal.zip"
```

If notarization fails, retrieve Apple's log with `xcrun notarytool log SUBMISSION_ID --keychain-profile "$CJ_NOTARY_PROFILE"`, correct the cause and produce a new signed archive. Return the stapled ZIP, digest, commit, notarization ID/status and native QA evidence. Record the macOS version, hardware, GPU, resolution and which architectures were exercised.

Smoke-test the distributed bundle on Apple silicon and a physical Intel Mac. On each, enter SoHo, walk, drive, zoom the map, listen during travel and quit through **Pause → Settings**. After Steam upload, install the same BuildID from the library and play for at least five minutes, including a relaunch, an overlay check where enabled and a cross-network meet, signal, sprint and reconnect with a Windows or Linux peer. Record actual device results separately, including any architecture still waiting for hardware. [Submission packet](submission.md)
