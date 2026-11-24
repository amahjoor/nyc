# Windows agent handoff

Build on Windows x64 with Git, Python 3.11+, Node 22.12+ and npm. Use PowerShell in a fresh checkout. The release coordinator supplies the candidate commit and, for an online release, the production WSS lobby URL. Set `CJ_RELEASE_SHA` and `CJ_LOBBY_URL` in the local environment. Leaving the URL empty produces a local QA build whose lobby address must be entered manually. For the friends playtest, use `wss://concrete-jungle.159-65-216-109.sslip.io/lobby`. On a fresh profile, select **Play with friends** and verify the game joins the NYC lobby at Broadway & Spring.

```powershell
if (!$env:CJ_RELEASE_SHA) { throw "Set CJ_RELEASE_SHA to the candidate commit" }
git fetch origin main
if ($LASTEXITCODE) { throw "Fetch failed" }
git switch --detach $env:CJ_RELEASE_SHA
if ($LASTEXITCODE) { throw "Cannot check out the candidate" }
git rev-parse HEAD
py -3 --version
node --version
npm ci --prefix game/lobby
if ($LASTEXITCODE) { throw "Lobby install failed" }
$buildArgs = @("--platform", "windows")
if ($env:CJ_LOBBY_URL) { $buildArgs += @("--lobby-url", $env:CJ_LOBBY_URL) }
py -3 -X utf8 game/steam/build.py @buildArgs
if ($LASTEXITCODE) { throw "Windows packaging failed" }
node game/steam/smoke.mjs "output/steam/depots/windows/ConcreteJungle.exe"
if ($LASTEXITCODE) { throw "Packaged game smoke test failed" }
```

The test opens the game twice and writes `report.json` and `street.jpg` under `output/steam/qa/win32-*/`. Read the report. On a clean standard-user Windows installation, launch the candidate, enter SoHo, move with WASD, drive a car, open the map and zoom, listen during travel, change a setting and select **Pause → Settings → Quit to desktop**. Reopen and check the saved setting. Record Windows version, GPU/driver, resolution, observed performance and any install or graphics prompt.

```powershell
New-Item -ItemType Directory -Path output/steam/handoff -Force | Out-Null
tar.exe -czf output/steam/handoff/windows-x64.tar.gz -C output/steam/depots windows
if ($LASTEXITCODE) { throw "Archiving the Windows depot failed" }
Get-FileHash output/steam/handoff/windows-x64.tar.gz -Algorithm SHA256
```

Return the archive, SHA-256, source commit, smoke evidence and manual results to the release coordinator. After upload, install the same BuildID through Steam on a clean machine. Verify the green **Play** button starts the Windows executable, the overlay opens where enabled, and the game exits back to the library. Play at least five minutes. With a Linux or Mac peer on a different network, join the prefilled lobby, meet at Broadway & Spring, exchange a signal, start a sprint and leave/rejoin. Report BuildID, play time, peer OS and any failed step. The release coordinator records the results for Valve. [Submission packet](submission.md)
