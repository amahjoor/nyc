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

Click **Explore New York** to open the full-city view. Pick a neighborhood and choose **Travel here**, or double-click a street. Drag to orbit and scroll to zoom. **All five boroughs** returns to the city view. On the street, press **E** to enter the nearby yellow taxi, then **N** to take a delivery. Stop inside the orange destination ring before the timer expires. Earnings and completed delivery count save in browser storage on this device. Sound starts muted; enable it with the top-right button.

| Action | Keyboard | Controller |
| --- | --- | --- |
| Walk / steer | WASD or arrows | Left stick |
| Accelerate / reverse | W / S | Right / left trigger |
| Enter / exit car | E | A |
| Sprint on foot | Shift | Left stick click |
| Brake | Space | X |
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

## City coverage and loading

The official source contains 4,721 spatial nodes, including 3,361 detailed chunks. The 74 coarse overview chunks contain about 1.51 million triangles; full detail contains roughly 27 million triangles. Full detail is loaded locally as needed, rather than all at once.

`city-stream.js` reads the official public I3S geometry buffers without an API key. It preserves measured triangle surfaces, derives collision outlines from the actual ground triangles and retains courtyard holes. Each building’s source ground elevation is flattened for the driving plane. Level changes keep a complete parent until its replacement geometry is ready, preventing overlapping parent/child meshes.

Geometry fetches are bounded to five concurrent requests. The cache has a 210 MB target and a 140-chunk target; chunks required for the current visible scene or movement safety are retained. Requests retry with a cooldown. Movement waits at unloaded geometry, and travel waits for both streets and collision before changing position. Saved earnings survive travel. Traveling cancels an active delivery.

`city-ground.js` displays the entire city with a low-resolution aerial atlas and loads 81 detailed image tiles around street-level play. Its cache is capped at 128 local tiles with six active image requests. Images use anonymous CORS; failed requests retry without substituting invented geography. The citywide roof shader uses the same georeferenced atlas with Mercator-correct coordinates.

The street database covers 112,677 constructed drivable source segments. It is split into 1 km cells. Nearby cells feed the traffic graph and local minimap; distant cells are evicted. Borough shoreline polygons provide the full-city map outline. Preset destinations and double-click arrivals snap to actual streets.

## Accuracy and limits

- Buildings represent the **2014 survey**. Coarse overview levels simplify the source surfaces. Walls remain neutral and untextured; the earlier five SoHo photos remain available as references.
- The aerial photographs were captured **March 14–24, 2024**. Redevelopment can differ from the older model. Shadows and parked vehicles in the imagery are flat photographic details.
- Terrain is flat and each building is grounded independently. Bridge and tunnel grade codes are retained in the road data, but vertical road decks and multilevel crossings are not physically modeled. Water is visible in the imagery; a shoreline collision system is not implemented.
- Street widths and traffic behavior are simplified. Interiors, combat, multiplayer, a campaign and a Steam executable remain future work. Cars, pedestrians and jobs are game elements.

The full map is available to render and explore, but this is a historical city model rather than a live Street View feed. It depends on NYC’s external public tile services; the source panel and loading indicator disclose connection problems.

## Sources and reproducible pipeline

| Data | Project files | Source |
| --- | --- | --- |
| Citywide 3D hierarchy | `dist/city-index.json`, `scripts/build-city-index.py` | [NYC OTI 3D Buildings Citywide](https://www.arcgis.com/home/item.html?id=a6961bc4505c44e8a495b53483491cc0), [NYC Open Data terms](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html) |
| Streets | `dist/road-index.json`, `dist/roads/`, `scripts/import-city-roads.py` | [NYC OTI Citywide Street Centerline](https://data.cityofnewyork.us/City-Government/NYC-Street-Centerline-CSCL-/inkn-q76z) |
| Shorelines | `dist/boroughs.json` | NYC Department of City Planning borough boundaries, shoreline clipped |
| Aerial images | Public NYC tile service, runtime cache | NYC OTI / NYS, [2024 metadata](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_AerialImagery.md), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
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

The render and simulation code are separate ES modules. A later Steam build could package a desktop runtime or port the simulation and geographic pipeline into a native game engine; controller support here is an initial implementation, not Steam Deck certification.
