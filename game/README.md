# NYC After Hours

A playable browser prototype spanning **all five boroughs of New York City**. The complete city index contains 1,083,529 buildings from NYC OTI’s actual 2014 survey. Coarse geometry renders the citywide overview; detailed buildings, collision footprints, streets and aerial images stream around the player.

Explore Manhattan, Brooklyn, Queens, the Bronx and Staten Island from the city view, then arrive on an actual mapped street to walk or drive. The game retains delivery jobs, local traffic, police attention and saved earnings.

## Play locally

Requires Node.js 20+ to serve and test the project. There are no npm dependencies to install.

```sh
cd game
npm run dev
```

Open http://localhost:5173 in a desktop browser with WebGL 2 and hardware acceleration. The game also includes touch buttons and standard gamepad controls. Internet access is required while exploring: official NYC geometry and aerial imagery stream directly from public services. The geographic index, road cells and Three.js are bundled. Serving over HTTP is required because browsers restrict ES modules and data fetches from `file://` URLs.

Click **Explore New York** to open the full-city view. Enter an NYC address and press **Search**, choose the matching address and borough, then press **Spawn here**. **Pick spawn location** lets you click or drag a pin across the map; press **Done picking** to resume camera orbit. **Clear** removes the selection and cancels a pending search. You can also expand **Or choose a neighborhood** and choose **Travel here**, or double-click a street for quick travel.

Drag to orbit and scroll to zoom. **All five boroughs** returns to the city view. Arrivals snap to a mapped street within 600 metres of the chosen point and wait for streets and building collision data to load. Locations with no nearby mapped street are rejected. Address lookup uses NYC Planning's public GeoSearch service, sends a request only when submitted, and requires an internet connection. Choosing a search result places a pin; it does not move the player until **Spawn here** is pressed.

On the street, press **E** to enter the nearby yellow taxi, then **N** to take a delivery. Stop inside the orange destination ring before the timer expires. Earnings and completed delivery count save in browser storage on this device. Sound starts muted; enable it with the top-right button.

| Action | Keyboard | Controller |
| --- | --- | --- |
| Walk / steer | WASD or arrows | Left stick |
| Accelerate / brake then reverse | W / S | Right / left trigger |
| Enter / exit car | E | A |
| Sprint on foot | Shift | Left stick click |
| Handbrake / slide | Space | X |
| Delivery job | N | Y |
| Look around | Drag mouse | Right stick |
| Expand map | M | View / Back |
| Pause | Escape | Start |
| Change chase camera | C | |
| Street / aerial / city view | V | Right bumper |
| City orbit / zoom | Drag / scroll in city view | |
| Travel to a mapped street | Double-click in city view | |
| Horn | H | |
| Recover to starting street | R | |

Walking follows the direction of the current camera. While driving, A/D turn the front wheels left/right; reverse uses the same steering wheel direction. S slows forward motion to a stop before backing up. Tap Space while steering to use the handbrake, then release it to regain grip. Steering builds progressively and becomes gentler at higher speeds; releasing the accelerator lets the car coast.

The driving model keeps world velocity separate from the body heading, with bounded tire grip and yaw inertia. This allows recoverable slides and smooth countersteering. It uses a 120 Hz fixed physics step, including collision response. Controller steering remaps the deadzone continuously for small corrections. The chase camera looks ahead during forward driving and returns gently after a manual orbit; it stays behind the car's nose in reverse.

The handling is an original arcade model inspired by the feel of GTA, not a reproduction of Rockstar's proprietary physics. Tire-slip and low-speed stability concepts are informed by [NVIDIA's PhysX vehicle documentation](https://nvidia-omniverse.github.io/PhysX/physx/5.6.1/docs/Vehicles.html). This game does not run PhysX. Handling regressions cover corner entry, countersteering, handbrake recovery, reverse, frame-rate independence and collision safety.

## City coverage and loading

The official source contains 4,721 spatial nodes, including 3,361 detailed chunks. The 74 coarse overview chunks contain about 1.51 million triangles; full detail contains roughly 27 million triangles. Full detail is loaded locally as needed, rather than all at once.

`city-stream.js` reads the official public I3S geometry buffers without an API key. It preserves measured triangle surfaces, derives collision outlines from the actual ground triangles and retains courtyard holes. Each building retains its relative surveyed shape and is anchored to sampled terrain. This is an approximate foundation placement: I3S uses EGM96 heights while the DEM uses NAVD88, so their absolute elevations are not treated as interchangeable. Level changes keep a complete parent until its replacement geometry is ready, preventing overlapping parent/child meshes.

Geometry fetches are bounded to five concurrent requests. The cache has a 210 MB target and a 140-chunk target; chunks required for the current visible scene or movement safety are retained. Requests retry with a cooldown. Movement waits at unloaded geometry, and travel waits for both streets and collision before changing position. Saved earnings survive travel. Traveling cancels an active delivery.

`city-ground.js` displays the entire city with a low-resolution aerial atlas and loads 81 detailed image tiles around street-level play. Local zoom 19 tiles provide approximately 23 cm per pixel in NYC, twice the previous linear resolution, over a roughly 520 m window. Tiles nearest the player load first. Its cache is capped at 128 local tiles with six active image requests. A transparent local atlas supplies the same sharp imagery to nearby surveyed roofs and street surfaces with Mercator-correct coordinates; missing tiles retain the coarse source image. Images use anonymous CORS and retry without substituting invented geography. The **Shadows** button toggles rendered sun shadows and remembers the setting. Balanced quality uses 1024-pixel shadow maps and high quality uses 2048. Shadows and vehicles baked into the aerial photographs remain visible when rendered shadows are off.

`street-detail.js` renders NYC OTI's 2022 mapped roadbed and sidewalk polygons around SoHo, preserving concavity and holes. The initial import covers a 2 km × 2 km area centered on the project origin, split into sixteen 500 m cells. It contains 1,063 roadbed polygons, 620 sidewalk polygons and 2,638 curb lines, with 447 polygon holes. Whole source features can extend beyond the import boundary. The renderer deduplicates repeated tile features and batches visible surfaces into one mesh, using the official aerial image for appearance. Where a filtered local atlas sample is incomplete, the street mesh yields to the existing ground-image tiles instead of covering them with a coarse triangle. A small depth bias resolves overlaps with old building bottom caps without changing sidewalk elevations. It reuses triangulation for resident source features and keeps the existing GPU batch when a grid crossing leaves the selected tiles unchanged. Up to four detail downloads run concurrently; the cell cache is capped at 36. This layer is optional and does not block city travel.

No artificial lights, speculative facade patterns or decorative street props are added. The street exports contain only 2D positions, so their surfaces are draped onto the measured terrain. Source triangles are subdivided with a bounded vertex budget to follow slopes. Curb lines are retained as source data but are not extruded into invented heights. Unknown pavement materials are not assigned procedural asphalt, brick or cobblestone textures. Building walls remain plain until building-specific facade evidence is available.

The street database covers 112,677 constructed drivable source segments. It is split into 1 km cells. Nearby cells feed the traffic graph and local minimap; distant cells are evicted. Borough shoreline polygons provide the full-city map outline. Preset destinations and double-click arrivals snap to actual streets.

## Landscape reconstruction

From the city view choose **Explore reconstructed parks**, then **Explore park**. Detailed regions cover Central Park's Pond, Prospect Lake, Meadow Lake, the Bronx Botanical Garden ponds and Clove Lake. These are bounded sample areas, with coarse measured terrain spanning the whole city. Arrival still snaps to an actual nearby road; walk toward the park or press V for the aerial camera.

`landscape.js` drapes the official aerial atlas over the 2017 topobathymetric DEM. The citywide grid is roughly 63–72 metres; park grids are roughly 2.4–3.9 metres. Fine-grid edges blend into the coarse measurements over 20 metres, and physics uses the same triangle interpolation. This avoids separate visual and driving surfaces. Cars sample four wheel supports for slope; actors, camera targets, pins and building foundations use measured height.

Mapped water comes from the 2022 hydrography. Full source shorelines govern collisions, preserving islands and avoiding false shorelines at region boundaries. Only consistent interior DEM samples establish a visible water level. The optical material is an approximation. Unknown levels do not create an invented horizontal water plane.

Tree footprints and upper-canopy heights come from Qin Ma's published crown and canopy-height datasets, derived from 2013–2014 LiDAR with watershed segmentation. Source crowns under 5 m are excluded following the paper's criterion. Approximate crown envelopes and trunks show these source trees in 3D; branch shapes, crown undersides and trunk dimensions are unmeasured. The source can oversegment trees and may disagree with newer aerial imagery. Nearby crowns are selected by distance and built in cooperative batches; distant/full-city views retain the aerial image. The scene status reports rendered crowns separately from available source crowns.

Actual local **Meta SAM ViT-B** inference is bundled as a review artifact. Thirteen source-prompted candidates were evaluated against the 2024 Pond aerial imagery. One visible-water mask passed; all twelve proposed tree masks failed the source agreement gates. The accepted water mask is clipped to the mapped shoreline and changes appearance only. It never changes collisions, invents height or creates a new object. Source agreement is a consistency check, not independent ground-truth accuracy, because source geometry also supplies prompts. See [the image comparison](dist/reconstruction.html) and [machine-readable report](dist/reconstruction-review.json).

Rebuild measured landscape data in an isolated environment:

```sh
python3 -m venv /tmp/nyc-landscape-venv
/tmp/nyc-landscape-venv/bin/pip install -r scripts/requirements-landscape.txt
/tmp/nyc-landscape-venv/bin/python scripts/import-landscape.py --download --all-regions --cache /tmp/nyc-landscape
```

The importer downloads roughly 449 MB of original crown/height data to the external cache, verifies checksums, projects into the game's metre grid, and bundles only sampled/clipped assets. Additional areas can use `--bbox WEST SOUTH EAST NORTH --region-id safe-slug --name "Area name"`. Existing regions are retained.

Reproduce the AI stage in a separate Python 3.13 environment:

```sh
python3.13 -m venv /tmp/nyc-reconstruction-ai-venv
/tmp/nyc-reconstruction-ai-venv/bin/pip install -r scripts/requirements-reconstruction-ai.txt
/tmp/nyc-reconstruction-ai-venv/bin/python scripts/reconstruct-imagery.py --reference dist/reconstruction/reference.geojson
```

The pinned, Apache-2.0 SAM model downloads into the external cache. Weights are not shipped to players. Inference runs offline after that download, using Mac GPU acceleration when available or CPU otherwise. Individual aerial tiles, masks, review metrics, source geometry, model revision and checksums are included for audit and reproducibility. The packaged reference geometry covers only the Pond review, not automatic inference over all boroughs.

## Accuracy and limits

- Buildings represent the **2014 survey**. Coarse overview levels simplify the source surfaces. Walls remain neutral and untextured; the earlier five SoHo photos remain available as references.
- The aerial photographs were captured **March 14–24, 2024**. Redevelopment can differ from the older model. Shadows and parked vehicles in the imagery are flat photographic details.
- Ground comes from the 2017 DEM, with coarse citywide sampling and five finer park patches. Walking and wheel support use the same terrain triangles as rendering. This is surface-following arcade physics, without jumps or a full suspension solver. Bridge decks, tunnels and multilevel crossings still lack independent measured driving surfaces. Mapped inland water blocks movement away from mapped road corridors; those corridors remain traversable to retain existing bridge routes.
- Street surface outlines use mapped polygons in the SoHo detail area; citywide navigation and traffic still use simplified centerlines. Curb heights and pavement materials are not supplied by the street import. Interiors, combat, multiplayer, a campaign and a Steam executable remain future work. Cars, pedestrians and jobs are game elements.

The full map is available to render and explore, but this is a historical city model rather than a live Street View feed. It depends on NYC’s external public tile services; the source panel and loading indicator disclose connection problems.

## Sources and reproducible pipeline

| Data | Project files | Source |
| --- | --- | --- |
| Citywide 3D hierarchy | `dist/city-index.json`, `scripts/build-city-index.py` | [NYC OTI 3D Buildings Citywide](https://www.arcgis.com/home/item.html?id=a6961bc4505c44e8a495b53483491cc0), [NYC Open Data terms](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html) |
| Streets | `dist/road-index.json`, `dist/roads/`, `scripts/import-city-roads.py` | [NYC OTI Citywide Street Centerline](https://data.cityofnewyork.us/City-Government/NYC-Street-Centerline-CSCL-/inkn-q76z) |
| SoHo street surfaces | `dist/street-detail-index.json`, `dist/street-detail/`, `scripts/import-street-detail.py` | NYC OTI 2022 planimetrics: [roadbeds](https://data.cityofnewyork.us/d/i36f-5ih7), [sidewalks](https://data.cityofnewyork.us/d/52n9-sdep), [curbs](https://data.cityofnewyork.us/d/5xvt-8cbk), [capture rules](https://github.com/CityOfNewYork/nyc-planimetrics/blob/main/Capture_Rules.md) |
| Address search | `dist/geocoder.js`, requested on submission | [NYC Planning GeoSearch](https://geosearch.planninglabs.nyc/docs/), Property Address Directory |
| Shorelines | `dist/boroughs.json` | NYC Department of City Planning borough boundaries, shoreline clipped |
| Aerial images | Public NYC tile service, runtime cache | NYC OTI / NYS, [2024 metadata](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_AerialImagery.md), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Terrain | `dist/landscape-index.json`, `dist/landscape/`, `scripts/import-landscape.py` | [NYC 2017 topobathymetric DEM](https://elevation.its.ny.gov/arcgis/rest/services/NYC_TopoBathymetric_2017_1_meter/ImageServer) |
| Inland water | `dist/landscape/` | [NYC OTI 2022 hydrography](https://data.cityofnewyork.us/d/pjs3-c3z5) |
| Tree crowns and heights | `dist/landscape/` | [Qin Ma (2022), Trees in New York City](https://doi.org/10.6084/m9.figshare.20522895.v2), CC BY 4.0, 2013–2014 LiDAR |
| AI imagery review | `dist/reconstruction/`, `scripts/reconstruct-imagery.py` | [Meta SAM ViT-B](https://huggingface.co/facebook/sam-vit-base), Apache 2.0, and NYC 2024 aerials, CC BY 4.0 |
| SoHo photo references | `dist/assets/references/`, `dist/facade-profiles.json` | Individual author, license and original URL in the manifest and in-game source panel |

All layers use the same origin, latitude 40.7235 / longitude -74.0015, with metre coordinates, X east and Z south. I3S positions contain geographic offsets relative to each node; they are converted directly into this coordinate system. Source feature IDs remain attached to collision geometry.

The previous bundled SoHo CityGML extract, OSM snapshot, renderer and conversion scripts remain available for offline source regression tests. Runtime citywide geometry comes from the official I3S service, and runtime roads now come from CSCL. All reference JPEGs are unchanged. Their individual CC BY 2.0 or CC BY-SA 4.0 attribution is retained. The earlier source-based facade interpretations remain offered under CC BY-SA 4.0 with the cited photo credits.

Three.js 0.180.0 is vendored in `dist/vendor` under its MIT license. No Google Maps API key is used. The source importers describe their download/cache arguments in `--help`; they rebuild the city index, road cells and boundary files from the linked public sources.

## Verification

```sh
npm run check
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The simulation tests include variable display frame rates, collision tunneling, car entry/exit, mission rewards, police escape, city streaming, safe travel and progress preservation. Data tests check all five boroughs, actual I3S fixtures, coordinate projection, courtyards, cache limits, cancellation, retry timing and safe arrival. The complete coarse hierarchy and representative detailed chunks have also been decoded from the live source. The importer tests require the optional dependencies in `scripts/requirements-survey.txt`; install these in a Python virtual environment to include source conversion tests. Plain Python runs artifact checks and skips conversion tests when dependencies are absent. Integration and geometry tests use mocked DOM/canvas/WebGL surfaces; they do not verify real GPU rendering or browser frame rate.

Landscape conversion tests need `scripts/requirements-landscape.txt`; AI tests need `scripts/requirements-reconstruction-ai.txt`. Run each suite in its corresponding environment with `python -m unittest discover -s tests -p test_landscape.py -v` or `-p test_reconstruct_imagery.py -v`.

The render and simulation code are separate ES modules. A later Steam build could package a desktop runtime or port the simulation and geographic pipeline into a native game engine; controller support here is an initial implementation, not Steam Deck certification.
