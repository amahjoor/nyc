# NYC After Hours

A playable browser prototype set in a roughly 590 × 556 metre slice of SoHo. Explore on foot, enter a yellow cab or another car, take timed delivery jobs, and escape police attention after reckless driving. Original procedural artwork sits on real OpenStreetMap streets and building footprints.

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
| Horn | H | |
| Recover to starting street | R | |

## Scope and behavior

- Real SoHo streets and 594 building footprints; original generated facades, signage, cars, street details and sound.
- On-foot movement and arcade vehicle handling with fixed-step physics, building collisions, traffic, police pursuit and a repeatable delivery loop.
- Local minimap, destination markers, saved earnings, graphics quality controls and pause menu.
- This is a neighborhood prototype. Building interiors, combat, multiplayer, a campaign and a Steam executable are future work.

Police heat rises after forceful collisions and decays after escaping patrol sight. Getting caught or wrecking the car recovers the player and can charge a fine. Map edges are prototype boundaries. Street widths and heights without source measurements are estimated for playability. Pedestrians are decorative and have no combat behavior.

## Data and references

`data/soho.osm` is the OSM XML snapshot downloaded from:

https://api.openstreetmap.org/api/0.6/map?bbox=-74.005,40.721,-73.998,40.726

The converter keeps street centerlines and building polygons, projects them into local metre coordinates, and emits `dist/city.json`. Most building heights use OSM height tags; each building carries `heightSource` and `heightEstimated`. Courtyard holes are currently filled in the simplified geometry. Facade materials and street furniture are artistic interpretations, not surveyed features. Rebuild offline:

```sh
python3 scripts/build-city.py
```

Map data © OpenStreetMap contributors, licensed under [ODbL 1.0](https://www.openstreetmap.org/copyright). The raw snapshot and derived city database are provided in this source checkout; the browser download at `city.json` also exposes the derived database. Retain attribution and the applicable ODbL database terms when redistributing. ODbL does not license Google imagery.

The earlier Street View scouting notebook remains in the parent project. This game does not load or contain Google imagery. No live Street View inspection was completed during this build because the browser connection was unavailable. The current artwork is procedural and has not been certified against street-level photography. The distant skyline is a stylized backdrop rather than additional playable geography.

Three.js 0.180.0 is vendored in `dist/vendor`, with its MIT license. There are no third-party models, music recordings or texture downloads. All visible shop names are fictional art labels.

## Verification

```sh
npm run check
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The simulation tests include variable display frame rates, collision tunneling, car entry/exit, mission rewards, police escape and sustained traffic on the real map. Data tests check projection, safe connected mission points and source provenance. Integration and geometry tests use mocked DOM/canvas/WebGL surfaces; they do not verify real GPU rendering or browser frame rate.

The render and simulation code are separate ES modules. A later Steam build could package a desktop runtime or port the simulation and geographic pipeline into a native game engine; controller support here is an initial implementation, not Steam Deck certification.
