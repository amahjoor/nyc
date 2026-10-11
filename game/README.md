# NYC After Hours

A playable browser prototype set in a roughly 590 × 556 metre slice of SoHo. Explore on foot, enter a yellow cab or another car, take timed delivery jobs, and escape police attention after reckless driving. The city now uses NYC’s actual surveyed 3D building geometry and georeferenced aerial photographs, with OpenStreetMap roads.

## Play locally

Requires Node.js 20+ to serve and test the project. There are no npm dependencies to install.

```sh
cd game
npm run dev
```

Open http://localhost:5173 in a desktop browser with WebGL 2 and hardware acceleration. The game also includes touch buttons and standard gamepad controls. Network access is needed only to initially load the files; map data and Three.js are bundled. Serving over HTTP is required because browsers restrict ES modules and data fetches from `file://` URLs.

Click **Hit the streets**. Press **E** to enter the yellow taxi ahead of you, then **N** to take a delivery. Stop inside the orange destination ring before the timer expires. Earnings and completed delivery count save in browser storage on this device. Sound starts muted; enable it with the top-right button.

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
| Street / aerial view | V | |
| Horn | H | |
| Recover to starting street | R | |

## City coverage

The playable SoHo rectangle contains 587 buildings from NYC’s official 3D survey. The rendered surroundings contain 1,596 surveyed buildings in total, with 94,532 source triangles. Surveyed walls, roof setbacks and courtyard holes replace the previous invented architecture. Collision and the minimap use the same surveyed ground polygons.

The ground and roofs use NYC’s 2024 orthophotography, geographically aligned with the 3D model. Use **V** or **Aerial view** to see the neighborhood from above. **Map sources / Real NYC** opens the imagery dates, limitations and landmark reference photographs.

Five landmark facades are matched by exact NYC BIN: Haughwout, 101 Spring / Judd, Gunther, King of Greene and Queen of Greene. Their window counts and simplified materials follow cited architectural surveys and inspected photographs. Other walls remain neutral and untextured. The old fictional shop labels, random rooftop props, fabricated skyline and street-name-based cobblestone assumptions are removed.

The game retains walking, arcade driving, building collisions, traffic, police pursuit and repeatable delivery jobs. Map edges bound this neighborhood prototype. Interiors, combat, multiplayer, a campaign and a Steam executable remain future work. Cars, people and missions are game elements, not surveyed objects.

## Geographic accuracy and limits

- The building model represents the **2014 aerial survey**, published in 2016. It preserves measured volumes, not every architectural ornament.
- Aerial photographs were captured **March 14–24, 2024**. Redeveloped buildings can differ from the older geometry. Shadows, painted road markings and captured parked vehicles are flat photographic details.
- The game flattens each building’s ground elevation independently. Original absolute elevations remain in `survey.json`; the current driving plane does not reproduce the roughly 10 m terrain variation.
- OpenStreetMap provides road centerlines, names and direction. Lane widths and traffic behavior are simplified. This is a dated reconstruction, not live Street View or a complete photorealistic city scan.

## Data and reproducible pipeline

| Input | Local source / derived artifact | Provenance |
| --- | --- | --- |
| OSM streets | `data/soho.osm` → `dist/city.json` | [OpenStreetMap](https://api.openstreetmap.org/api/0.6/map?bbox=-74.005,40.721,-73.998,40.726), © contributors, [ODbL](https://www.openstreetmap.org/copyright) |
| Surveyed 3D buildings | `data/soho-survey.gml.gz` → `dist/survey.json` | [NYC OTI 3D Building Model](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_3DBuildingModel.md), [NYC Open Data terms](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html) |
| Aerial images | `dist/assets/ortho/` + `dist/ortho.json` | NYC OTI / New York State, [2024 imagery metadata](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_AerialImagery.md), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Facade photographs | `dist/assets/references/` + `dist/facade-profiles.json` | Per-photo author, license and original URL in the manifest and in-game sources panel |

CityGML comes from development area DA12 in the [official archive](https://maps.nyc.gov/download/3dmodel/DA_WISE_GML.zip). Its EPSG:2263 coordinates use US survey feet. The importer converts them into the game’s east-positive X, south-positive Z metre coordinates and triangulates surfaces while preserving holes. The bundled extract rebuilds the geometry offline. Source IDs and elevations remain available for audit.

The imagery importer downloads unchanged public map tiles and records each tile’s bounds and SHA-256. The browser assembles them into a north-up texture atlas, then projects it onto the ground and surveyed roof surfaces. The bounded extract is about 0.45 metres per pixel. No Google Maps API key is needed for these bundled open datasets.

Rebuild from `game/`:

```sh
python3 scripts/build-city.py
python3 -m venv /tmp/nyc-survey-venv
/tmp/nyc-survey-venv/bin/pip install -r scripts/requirements-survey.txt
/tmp/nyc-survey-venv/bin/python scripts/import-survey.py
python3 scripts/import-ortho.py
```

Existing aerial tiles are reused; missing tiles require network access. All reference JPEGs are unchanged. Their individual CC BY 2.0 or CC BY-SA 4.0 attribution is retained. The source-based facade interpretations are also offered under CC BY-SA 4.0 with the cited photo credits. All five photographs were inspected during this build; no live Google Street View session was used.

The earlier scouting notebook remains in the parent project. Three.js 0.180.0 is vendored in `dist/vendor` with its MIT license. OSM height estimates remain in the intermediate map file, but the renderer and collisions use `survey.json` exclusively for buildings.

## Verification

```sh
npm run check
npm test
/tmp/nyc-survey-venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
```

The simulation tests include variable display frame rates, collision tunneling, car entry/exit, mission rewards, police escape and sustained traffic on the real map. Data tests check coordinate projection, triangulation with holes, source IDs, tile coverage, image checksums and safe connected mission points. The importer tests require the optional survey dependencies; plain Python runs artifact checks and skips conversion tests when they are absent. Integration and geometry tests use mocked DOM/canvas/WebGL surfaces; they do not verify real GPU rendering or browser frame rate.

The render and simulation code are separate ES modules. A later Steam build could package a desktop runtime or port the simulation and geographic pipeline into a native game engine; controller support here is an initial implementation, not Steam Deck certification.
