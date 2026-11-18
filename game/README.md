# NYC After Hours

A playable browser prototype spanning **all five boroughs of New York City**. The complete city index contains 1,083,529 buildings from NYC OTI’s actual 2014 survey. Coarse geometry renders the citywide overview; detailed buildings, collision footprints, streets and aerial images stream around the player.

The city's shapes are surveyed. How they look is drawn: every wall is dressed as a New York building type, streets are asphalt and concrete inside their mapped kerb lines, street trees stand where the city's census counted them, and the whole scene is lit by a sun, moon and sky that follow a real July day and night. [What is measured and what is drawn](#what-is-measured-and-what-is-drawn) lists which is which.

Explore Manhattan, Brooklyn, Queens, the Bronx and Staten Island from the city view, then arrive on an actual mapped street to walk or drive. The game retains delivery jobs, local traffic, police attention and saved earnings.

## Play locally

Requires Node.js 20+ to serve and test the project. There are no npm dependencies to install.

```sh
cd game
npm run dev
```

Open http://localhost:5173 in a desktop browser with WebGL 2 and hardware acceleration. The game also includes touch buttons and standard gamepad controls. Internet access is required while exploring: official NYC geometry and aerial imagery stream directly from public services, and street outlines and street trees outside the bundled neighbourhoods come from NYC Open Data. The geographic index, road cells and Three.js are bundled.

The game opens on Lower Manhattan from the harbor in the early evening, and the clock runs: about 75 seconds to the hour, so dusk and night follow within a few minutes. **TIME** in the top bar, or **T**, skips to the next of morning, midday, golden hour, dusk and night. Serving over HTTP is required because browsers restrict ES modules and data fetches from `file://` URLs.

Click **Explore New York** to open the full-city view. Open **Where to?** to browse neighborhood, park, bridge, and survey destinations. Type to filter the list or press **Search** to look up an NYC address, intersection, or business. Choose a result to preview the pin, then select **Spawn here**. **Pick on the map** lets you place or drag a pin directly. Select **Done picking** to resume camera orbit or **Clear** to reset the picker. Double-click a street for quick travel.

Drag to orbit and scroll to zoom. Press **Escape** for **All five boroughs** and **About & Credits**. Street arrivals snap to a mapped street within 600 metres of the chosen point and wait for streets and building collision data to load. Locations with no nearby mapped street are rejected. Address lookup uses NYC Planning's public GeoSearch service, sends a request only when submitted, and requires an internet connection.

Press **M** or **MAP** for a street map centered on your neighborhood. Gameplay pauses while it is open. Scroll or use **+ / −** to zoom, drag the background to pan, and select **All five boroughs** to fit the whole city. **My location** returns to your position. Search for an NYC address, intersection, or business and select a result to place a destination pin, or click or tap the map to place one. The map draws a purple route to the pin and shows turn directions. Drag the pin to reroute, or click it again to remove it and its directions. **Spawn here** moves you to the selected valid position after the local city data loads. Press **M**, **Escape** or **×** to close the map. The compact minimap keeps the route and next turn visible while driving. When the map canvas has keyboard focus, arrow keys pan, **+ / −** zoom, and **Delete** removes the pin.

On the street, press **E** to enter the nearby yellow taxi, then **N** to take a delivery. Stop inside the orange destination ring before the timer expires. Earnings and completed delivery count save in browser storage on this device. Sound starts muted; enable it with the top-right button.

Press **↑** or choose **PHONE** to open the handset. Use the arrow keys to move between controls, **Enter** to select, **Backspace** to go back and **Esc** to put it away. You can keep walking or driving with **WASD** while browsing. When typing in a search field, use **Tab** to return to the app controls and resume keyboard movement. The round Home button returns to the app grid. At a shop counter, street stand, garage or nearby pedestrian, press **G** to see your choices in the upper-right corner. Use **↑/↓** and **Enter**, or click an option. **Esc** leaves the interaction. **Nearby** lists the restaurants, shops, salons, garages and public buildings within about 700 m, nearest first: narrow it by category or type part of a name. Each shows how far it is, whether it is open now and, for a restaurant, its inspection grade; **Directions** sets route guidance to it. **Contacts** has the dispatcher, who gives you the next delivery, and **Wallet** your cash and record. On foot, standing at a shop front shows what it is above the controls. Deliveries go to named places as well as to streets: the drop is at the kerb in front of the door.

Choose **Meadow Lake road reconstruction** in the city picker and select **Spawn here** to visit the reconstructed road and parking loop. Walk to the waiting cab and press **E**. While nearby, **Show aerial / Show reconstruction** compares the original photograph with source-sampled pavement and reviewed paint. Both modes share the same measured driving surface. The patch loads only when visited; the rest of NYC keeps its existing rendering.

| Action | Keyboard | Controller |
| --- | --- | --- |
| Walk / steer | WASD | Left stick |
| Accelerate / brake then reverse | W / S | Right / left trigger |
| Enter / exit car | E | A |
| Sprint on foot | Shift | Left stick click |
| Handbrake / slide | Space | X |
| Show total money | Z | D-pad down |
| Delivery job (Phone → Contacts → Dispatch) | N | Y |
| Look around | Drag mouse | Right stick |
| Open / close street map | M | View / Back |
| Pause | Escape | Start |
| Toggle first / third person | B | Right stick click |
| Change chase camera | C | |
| Skip to the next time of day | T | |
| Street / aerial / city view | V | Right bumper |
| Aerial zoom | Scroll or + / − in aerial view | |
| City orbit / zoom | Drag / scroll in city view | |
| Travel to a mapped street | Double-click in city view | |
| Horn | H | |
| Recover to starting street | R | |

First person puts you at eye level on foot and in the driver's seat when you enter a car. Drag to look around or use the right stick. You can also switch perspective in the pause menu.

Walking follows the direction of the current camera. While driving, A/D turn the front wheels left/right; reverse uses the same steering wheel direction. S slows forward motion to a stop before backing up. Tap Space while steering to use the handbrake, then release it to regain grip. Steering builds progressively and becomes gentler at higher speeds; releasing the accelerator lets the car coast.

The driving model keeps world velocity separate from the body heading, with bounded tire grip and yaw inertia. This allows recoverable slides and smooth countersteering. It uses a 120 Hz fixed physics step, including collision response. Controller steering remaps the deadzone continuously for small corrections. The chase camera looks ahead during forward driving and returns gently after a manual orbit; it stays behind the car's nose in reverse. Its eye and aim share one damped terrain height, preventing bumps from making the view nod. Body height and tilt have bounded visual damping while each tire follows its own measured contact height. Recovery and travel reset these filters.

The handling is an original arcade model inspired by the feel of GTA, not a reproduction of Rockstar's proprietary physics. Tire-slip and low-speed stability concepts are informed by [NVIDIA's PhysX vehicle documentation](https://nvidia-omniverse.github.io/PhysX/physx/5.6.1/docs/Vehicles.html). This game does not run PhysX. Handling regressions cover corner entry, countersteering, handbrake recovery, reverse, frame-rate independence and collision safety.

## City coverage and loading

The official source contains 4,721 spatial nodes, including 3,361 detailed chunks. The 74 coarse overview chunks contain about 1.51 million triangles; full detail contains roughly 27 million triangles. Full detail is loaded locally as needed, rather than all at once.

`city-stream.js` reads the official public I3S geometry buffers without an API key. It preserves measured triangle surfaces, derives collision outlines from the actual ground triangles and retains courtyard holes. Each building retains its relative surveyed shape and is anchored to sampled terrain. This is an approximate foundation placement: I3S uses EGM96 heights while the DEM uses NAVD88, so their absolute elevations are not treated as interchangeable. Level changes keep a complete parent until its replacement geometry is ready, preventing overlapping parent/child meshes.

Geometry fetches are bounded to five concurrent requests. The cache has a 210 MB target and a 140-chunk target; chunks required for the current visible scene or movement safety are retained. Requests retry with a cooldown. Movement waits at unloaded geometry, and travel waits for both streets and collision before changing position. Saved earnings survive travel. Traveling cancels an active delivery.

`city-ground.js` loads a low-resolution aerial atlas of the entire city and 81 detailed image tiles around street-level play. The measured terrain and the roofs are textured from them; the flat image itself is drawn only if the terrain fails to load. Local zoom 19 tiles provide approximately 23 cm per pixel in NYC, twice the previous linear resolution, over a roughly 520 m window. Tiles nearest the player load first. Its cache is capped at 128 local tiles with six active image requests. A transparent local atlas supplies the same sharp imagery to nearby surveyed roofs and street surfaces with Mercator-correct coordinates; missing tiles retain the coarse source image. Images use anonymous CORS and retry without substituting invented geography. The **Shadows** button toggles rendered sun and moon shadows and remembers the setting. Shadows are drawn in three cascades, 48, 190 and 900 metres out from the action: 2048, 2048 and 1024 pixels at balanced quality, 4096, 2048 and 2048 at high. Balanced quality also draws at up to 1.15 device pixels per CSS pixel, high at up to 1.65. Shadows and vehicles baked into the aerial photographs remain visible when rendered shadows are off. Terrain, roofs and pavement evaluate Mercator texture coordinates relative to each atlas, avoiding absolute-latitude float32 cancellation that caused horizontal image bands. Numerical float32 checks across all five boroughs bound projection error below 2.5 cm.

`street-detail.js` loads NYC OTI's 2022 roadbed, sidewalk and parking polygons bundled for seven bounded sample regions: SoHo, the five reconstructed parks, and the Brooklyn Bridge approaches. The import has 1,725 roadbeds, 907 sidewalks, 4,143 curb lines, 111 parking lots and 56 transport structures, with 934 polygon holes. The 62 cells occupy about 23.8 MB. Whole features retain source IDs and may extend beyond the requested region. Structure-only cells keep complete bridge spans available after approach cells leave the streaming cache. In the game this module now supplies the measured bridge decks; street surfaces are built by `streetscape.js`. Its original aerial drape of the polygons remains available to callers that ask for it. Up to four detail downloads run concurrently and the resident cell cache is capped at 36. Missing optional detail leaves the city playable.

`streetscape.js` builds the street surfaces everywhere. It uses a bundled cell where that cell lies wholly inside a surveyed region (21 of the 62 do) and otherwise asks NYC Open Data for the roadbed and sidewalk outlines that touch the 500 m cell around the player: two requests a cell, plus one each for medians, plazas and parking lots, all kept in the browser's cache. Those three are optional: if one fails, the street is built without it. The other 41 bundled cells sit on the edge of a region and hold only the part inside it, so they are used only when the city service cannot be reached. Roadbeds become asphalt laid 5 cm above the measured terrain; right-of-way sidewalks are raised a further 15 cm with a kerb face and kerbstone along every edge that meets a roadbed. Large triangles are cut where the terrain bends, to within 2.5 cm. Lane lines, centre lines, ladder crossings and stop lines are laid out from the street centrelines and the mapped junction outlines; they are assumed, not surveyed. Roadbeds that a bridge or viaduct centreline crosses, with no street at grade inside them, are left off the ground. Walking and wheel heights include the street surface, so feet and tyres meet what is drawn. A failed request leaves that cell as relit aerial photograph and retries.

`transport-surfaces.js` uses the official transportation Polygon Z outlines. The ArcGIS export preserves native US survey feet, converted by exactly `1200 / 3937` to metres in NAVD88, matching the terrain datum. The import contains 48 outlines with usable nonzero heights; eight contain zero ordinates with unresolved measurement semantics and remain unavailable for deck reconstruction. Tunnel footprints and rail structures are not used as driving decks. The survey measures a deck only along its outline. The inside is meshed in triangles of at most 10 m and given the smoothest surface that meets those edges (each inner vertex the mean-value average of its neighbours), so a span rises evenly from side to side instead of folding along whichever outline vertices happened to be joined. One to three outline heights that stand more than 4 m from agreeing neighbours are treated as slips, and where the outline is recorded as steps (one height held, then another some metres up) the step is spread into a slope of at most 15%. Between its measured edges a deck's shape is therefore an estimate. New deck entry requires the measured surface to be within 0.30 m of the actor's previous height; an already selected deck retains a 1.5 m continuity tolerance. Traffic following a street takes that street's level, so it rides the deck and not the ground beneath. All wheels follow the center's selected level, avoiding mixed bridge and lower-road supports. Building and water collisions still use horizontal footprints. Motion stops at an unsupported deck drop, which is where the parapet is drawn. Cars on separate measured levels do not collide or offer entry from the road below. Surface selection uses the actor's previous height and travel mode to avoid snapping an underpassing vehicle onto an upper deck.

`deck-structure.js` builds what stands around a deck so that it reads as a structure: asphalt on top with lane lines along the streets it carries, a 1.1 m concrete slab beneath, a 0.9 m parapet along every edge that is a drop, a wall down to the ground where the deck runs less than 2.8 m above it, and a bent of one or two columns with a cap beam every 26 m under each carried street. An edge is left open where ground or another deck lies within 0.75 m of its height just beyond it. Piers are left out over water, where the deck is under 3.2 m clear, where a column would stand in a street at grade or on a lower deck. None of this is surveyed: the outline and its heights are the city's, every dimension and position of the structure is assumed, and the piers are not where the real ones are. Columns and parapets have no collision of their own.

`deck-approaches.js` joins decks to the streets. The survey outlines a bridge from where its structure begins, usually one to five metres above the modelled ground, because the embankment or filled ramp that leads up to it is in neither the outline nor the terrain. Where a street coded as raised runs onto the end of such a deck, an approach is built back along that street and whichever street continues it, falling to the ground at about 7% (never steeper than 20%, at most 150 m long, for drops of up to 12 m). A street that only passes beneath a deck is told apart by coming out the other side within the deck's width. The approach's line is the street's; its length, grade and width are assumed. Around the Brooklyn Bridge this builds 25 to 28 approaches, and several ramps there still do not connect.

JFK and LaGuardia use a bundled pavement mask on the measured terrain. Six runway footprints, 640 taxiway polygons and 36 apron polygons come from FAA Airport Mapping. Up close, local aerial tiles supply paint and tire wear. The fallback centerlines, edge stripes and nighttime edge lights are illustrative. Surveyed buildings whose centers fall inside FAA terminal footprints use glazed facades. Other matched airport buildings use the industrial facade. Rebuild the mask and footprint data with `python3 scripts/build-airports.py`. [FAA runway layer](https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/AM_Runway/FeatureServer) · [Taxiways](https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/AM_Taxiway/FeatureServer) · [Aprons](https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/AM_Apron/FeatureServer) · [Buildings](https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/AM_Building/FeatureServer)

The Queensboro, Throgs Neck and RFK crossings also stream measured deck components near the player. The street map draws bridges above intersecting roads and uses dashes for underground segments. Rebuild the additional decks with `python3 scripts/build-landmark-bridges.py`. [NYC OTI transport structures](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Transport_Structure_2022/FeatureServer/25)

Rebuild all bounded street regions with the standard library only:

```sh
python3 scripts/import-street-detail.py --all-regions --download --cache /tmp/nyc-street-detail
python3 -m unittest discover -s tests -p test_street_detail.py
```

The source manifest records each region's bounded query, source hash, feature counts and transport height metadata. Subsequent runs reuse matching query caches. Omit `--download` to rebuild offline.

The street database covers 118,916 constructed road components, including multipart source segments. It is split into 1 km cells. Nearby cells feed the traffic graph and local minimap; distant cells are evicted. Borough shoreline polygons provide the full-city map outline. Preset destinations and double-click arrivals snap to actual streets.

The street map loads `navigation-roads.json` once in the background. Its 5.02 MB compact representation preserves all 118,916 source components and 356,357 vertices at the original centimetre precision, along with names, traffic directions, boroughs and endpoint level codes. `route-planner.js` finds shortest-distance routes with A*. Only matching source endpoints at the same level connect; crossing lines do not create a junction. One-way roads retain their permitted direction, and the 164 tunnel components remain excluded from driving routes.

Route pins snap to a mapped drivable road within 400 metres. Guidance ends at that road point; it does not invent a road from an off-street pin. Unconnected destinations show an unavailable-route message. The graph describes historical mapped connectivity, while detailed bridge approaches and multilevel driving surfaces remain incomplete in the game. The map therefore provides road guidance without guaranteeing every real route is physically reconstructed yet. Source hashes link the compact dataset to all 941 existing road tiles. Rebuild it offline with:

```sh
node scripts/build-navigation-data.mjs
node --test tests/route-planner.test.js
```

## What is measured and what is drawn

Earlier versions showed only what a source could vouch for, which left bare grey walls and a smeared aerial photograph underfoot. The game now separates two things. **Where things are and what shape they have** still comes only from the sources listed below. **What their surfaces look like** is drawn by the renderer, and is an interpretation.

| | Measured or mapped | Drawn |
| --- | --- | --- |
| Buildings | Every volume, setback and roof from the 2014 survey; collision footprints | Wall materials, window layout, cornices, shop fronts, fire escapes, lit windows. A building's type is chosen from its height, footprint and district, not from records of that building. Buildings on Times Square carry illuminated screens, as zoning there requires; what they show is invented |
| Streets | Roadbed, sidewalk and junction outlines; centreline positions, widths and one-way flags | Asphalt, concrete flags, the 15 cm kerb height, kerbstones, all road paint |
| Street furniture | Kerb lines the lamps and parked cars follow | Lamp positions (one about every 58 m of kerb), lamp design, light colour. Parked cars: about seven kerb spaces in ten within 150 m of the player are taken (130 cars at most), and only where a parked car stays clear of moving traffic, corners and crossings: at both kerbs of a street with parking lanes, on the far side of a narrower one-way street. A space always holds the same car. They are ordinary cars to the simulation, so you can run into one or drive it away, and the renderer batches cars that share an exterior |
| Trees | Street trees: position, species and trunk diameter from the 2015 census. Park crowns: footprint and height from lidar. Central Park: where each of 47,786 crowns tops out, its height and the ground it covers, from the same lidar | Crown shape and foliage; height and spread estimated from trunk diameter. A Central Park tree is one of four drawn forms, turned and tinted by where it stands: no species is recorded. Without a connection, street trees are placed at a typical spacing instead, and the status says so |
| Ground | Terrain heights; the 2024 aerial photograph | Within about 150 m of the camera, ground that is not a built street surface is drawn, not shown: the photograph, averaged over a few metres, only decides whether a spot is turf, a red court or track, or hard ground, and whether that is nearer asphalt or concrete. Yards, lots and park paths therefore have plausible surfaces, not surveyed ones. Further off the photograph is shown, with hard ground relit. Central Park does not use the photograph at all: see [Central Park](#central-park) |
| Water | Shorelines from the borough outlines; lake and pond outlines | The surface: ripples, colour, reflections |
| Sky and light | Sun and moon directions for New York's latitude on 12 July, by the clock | Atmosphere colours, cloud, exposure, the moon's size, city sky-glow |
| Beyond the city | Coarse land outline and height from public elevation tiles | A plain lit silhouette. No buildings, roads or imagery; New Jersey's skyline is absent |
| Signals and signs | The 6,787 signals that give pedestrians a head start, and the 734 where all traffic stops for them; street names and one-way directions | Which other junctions have signals or stop signs (from street widths), every cycle length and split, and where each pole stands |
| People | How many DOT counted an hour on 114 sidewalks, morning and evening | Everyone. Numbers elsewhere, the shape of the day, what people wear and where they walk are a model |
| Cars | Passenger registrations by ZIP, make, model year and body, with paint frequencies from the citywide register | Licensed exterior models for compatible years, eight shared body shapes for the rest, and handling by body class |
| Traffic | Each street's width and direction | How much there is by hour and district, the share of it that is cabs, and the lanes it keeps to |
| Baskets and shelters | The position of each of 20,211 litter baskets and 3,307 bus shelters | Their design; each is moved onto the nearest kerb |
| Shops and restaurants | What is at each address, its trade name, a restaurant's inspection grade and a food store's floor area, for 74,844 places | Which wall of the building is its front, how wide that is, the sign's colours and second line, and its opening hours |

The vehicle catalog matches licensed 3D exteriors to real makes, models and years. Shared bodies and the cab and police liveries come from `vehicle-model.js`. [Vehicle catalog](dist/vehicles.html)

`facade.js` holds the building types: house, rowhouse, tenement, prewar apartment, loft, postwar slab, setback tower, curtain wall, glass slab, supertall, industrial, housing block and civic. Window bays are fitted to each wall's surveyed length, so they meet corners cleanly, and walls built against a neighbouring footprint are left blank, as lot-line walls are. None of this adds geometry: openings, relief and rooms behind glass are shaded on the surveyed wall planes.

`atmosphere.js` solves the sky. The sun follows the real solar path for 40.71° N at the declination of 12 July, the later Manhattanhenge date, so the sun sets at bearing 299.5°, along the cross streets. Sky colour comes from a single-scattering model of the atmosphere, with observed dusk colours added where that model falls short. Shade is lit by that sky plus an assumed 6% of the sunlight, standing in for light returned by sunlit walls and pavements; no bounce is actually traced. `gfx.js` turns one clock time into sun or moon light, three cascaded shadow maps, haze and exposure; `post.js` finishes the frame with ambient occlusion, bloom, light shafts and a filmic transfer. Street lamps share a top-down light texture. Each surface receives headlights and tail lights according to its height above each nearby car’s road, including on ramps and stacked decks. `water.js` draws the harbor and rivers and, near open water, mirrors the city in them. Building tiles are decoded in two background threads (`city-decode-worker.js`), so new districts do not stall the frame.

## Street life

The streets are run and peopled by a small set of rules, fed by five lists the city publishes. `scripts/build-street-life.mjs` bundles those lists as `dist/street-life.json` (350 KB).

**Signals.** `signal-plan.js` decides how each junction is controlled. A junction has a signal if the city lists one there, if its main street is 12 m wide or more, or if it is in the Manhattan core (the Battery to 110th Street), where nearly every corner is signalled. Otherwise the lesser street gets a stop sign, or all of them do if they are alike. A boulevard mapped as several carriageways is timed as one junction. Signals are fixed-time, as most of New York's are: a 90-second cycle (120 on boulevards, 60 on quiet outer-borough corners), three seconds of yellow and two of all-red, and each signal offset from the last so that traffic at the 25 mph limit meets a green wave. Where the city lists a leading pedestrian interval, walkers get seven seconds' head start; where it lists an exclusive pedestrian phase, every approach is red while people cross. Flashing-hand time is the width of the street at 3.5 feet a second.

Simulated traffic stops at red lights and stop signs; patrols with their sirens on do not. There is no right turn on red. If you run a red light, a patrol with a view of it gives chase (see The police), and about one signalled junction in twelve has a camera that fines you $50. That share is the game's; the city has far fewer cameras.

`street-signs.js` draws the hardware: a galvanised pole on the far right of each approach with a mast arm over the roadway, yellow three-lamp heads with twelve-inch lenses, pedestrian heads showing an orange hand or a white walking figure, green street-name signs parallel to the street they name, black ONE WAY arrows and red stop signs. The lamps of distant signals are drawn to 800 m.

**People.** `citylife.js` estimates how many people pass a point in an hour. Near one of DOT's 114 counted sidewalks the count leads; a kilometre away a model has taken over: a handful of named districts (offices, sights, shopping streets, evenings out, and homes for everything else), each with its own shape of day. `crowd.js` turns that into people on the surveyed sidewalks, up to 240 around the player: about 45 to a hundred metres of Times Square sidewalk at half past five, two or three on a residential block. They walk the kerb side, turn corners, wait for the walk signal and, if nothing is coming, cross against it. Traffic stops for anyone in the roadway. What they wear follows the district and the hour: jackets and shirts round the offices at lunch, shorts and backpacks where the visitors are, dark clothes on a street of bars at night. Skin and hair are drawn from one wide range everywhere. They cannot be collided with; they step back from a car that passes close.

**Traffic.** Moving traffic is kept within about 400 m of the player: some 15 cars on residential streets in the small hours, 47 there in the rush, and 62 in Midtown. A car joins on a street that leads toward the player, most often an avenue or a street the player can see down, and only where it will not be seen to appear: no nearer than 150 m behind the camera or 330 m in front of it, where a car is a few pixels wide. Cars that stray further are brought back the same way. In the Manhattan core about a third of the cars are yellow cabs by day and more than half after midnight; elsewhere cabs are few and apple green.

**Lanes.** `lanes.js` divides every street 9 m wide or more into a parking lane at each kerb and travel lanes of about 3.3 m. The painted lines, the parked cars and the traffic all take their places from that one layout, so Seventh Avenue is painted with four lanes and carries four files of cars, each in its lane. Traffic uses every lane that is at least 2.9 m wide; narrower streets, bridges and ramps keep to a single file. Right turns are made from the right-hand lane and left turns from the left-hand one. A car held up behind one left standing in its lane pulls out when the next lane is clear; where there is only one lane it waits, and other traffic turns off before reaching that block. Nobody steps off the kerb in front of a car that is waiting to go.

Traffic further than about 50 m from the player is drawn together, as parked cars are, and does not show turning wheels; nearer cars, patrols and the player's own car each have a model with wheels that roll and steer.

**Baskets and shelters.** `street-props.js` stands each litter basket and bus shelter from the city's inventories on the nearest surveyed kerb. One with no kerb within reach is left out.

## Places and shop fronts

`scripts/build-places.mjs` gathers what is at each address from seven public registers and bundles it by the square kilometre under `dist/places/` (74,844 places in 919 cells, 3.3 MB): restaurants with their cuisine and inspection grade, food stores with their floor area, hair and nail salons and barbers, bars and liquor stores, garages, body shops and car dealers, hotels, and schools, libraries, firehouses and other public buildings. `places.js` sorts them into 68 kinds. The same business in two registers (a restaurant and its liquor licence) is kept once.

A sign carries the name the place trades under. Where a register holds only the name of whoever has the licence, the game does not show it: the sign says what kind of place it is ("BARBER SHOP").

Each place near the player is given a street front: the stretch of its building's wall, facing a street, nearest the point the register puts it at. `storefronts.js` then tells the facade shader whose each shop front is, through a map of the ground a metre to the texel, a table of sign colours and an atlas of lettering for the nearest seventy or so. A shop front that belongs to a place takes its name, colours its kind is usually seen in (a yellow or red awning for a bodega, pink for a nail salon), a second line saying what it sells, the health department's grade card in the window of a restaurant, a turning pole beside a barber's door and OPEN in neon in a bar's window. It is lit or shuttered by the hours that kind of place keeps. A building with no shop fronts of its own gets one where a place is registered.

Shop fronts that belong to no registered place stay as they were, anonymous. The registers do not cover clothes shops, banks, laundromats, pharmacies without a beer licence or offices, so most of Fifth Avenue is still unnamed.

## Search

The search box in the city view finds three kinds of thing at once. A **street corner** ("53rd st and 6th ave", "53 & 6", "Fifty-third Street at Sixth Avenue", "6th ave / w 53rd, manhattan") is found in the street centrelines the route planner already holds: `local-search.js` reduces every spelling of a street to a direction, a name with its numbers as digits, and a kind, so ordinals, number words, abbreviations, a missing "West" and "Avenue of the Americas" all meet the same street; one letter wrong is forgiven. Where the same corner exists in two boroughs both are offered, or name the borough. A **business** is found by name in `dist/place-names.json`, a list of the 82,023 named places from the bundles (`scripts/build-place-search.mjs`, no network), nearest branches first, each with the street it is on. A **building address** still goes to NYC Planning's GeoSearch. Corners and businesses work offline; a street on its own gives its midpoint in each borough. Streets that the centreline files under another name (the Grand Concourse) are not found by their common one.

## Chain signs and logos

About ninety chains, chosen by how many branches the bundled places hold, are signed in their own colours with their name alone (`BRANDS` in `places.js`): some six thousand places.

Their logos are **not in this repository**. They are trademarks, and often copyrighted artwork, of the companies concerned, and this repository is public. `scripts/build-logos.mjs` fetches them to `dist/logos/`, which git ignores, from Wikimedia Commons by way of each company's "logo image" on Wikidata, with an index of where each came from. Where a logo is on the machine the game draws it as that chain's sign, in its own colours on white, or on near-black if the logo is pale; where it is not, the sign is the name. Wikimedia limits how often it may be asked, so the script goes slowly, stops when told to and carries on from where it was when run again. The lookup is by name and can pick the wrong thing (it once took an arena for a pizza chain): look through `dist/logos/index.json` after a run. Deleting the folder puts every sign back to its name.

## What each building is

Facades used to be chosen from a building's height, footprint and a few districts drawn by hand. `scripts/build-lots.mjs` now reads the city's tax lots (PLUTO: 816,442 lots with a building) for the year each was built and the assessor's building class, and lays them on a grid of fifty-metre cells, each holding the era and use of the biggest building centred in it (`dist/lots.bin`, 867 KB, one byte a cell). `lots.js` turns that into a facade: a walk-up of before 1920 is a tenement and one of the 1960s post-war brick; elevator apartments go pre-war, post-war, then glass; an office tower of the 1930s is Art Deco, of the 1960s a slab, of this century a curtain wall; schools, churches and hospitals are civic stone; one- and two-family lots are row houses where old and narrow, houses otherwise. In the old loft districts a building of before 1940 is mostly a loft whatever it is classed as now, because the register no longer has a loft class. Where a cell is empty, the eight around it are tried; where nothing is recorded, or the record does not help (a low store, a tall "house"), the old choice by size and place stands. The era and the use are the city's; which facade suits them is the game's judgement, and two buildings in one cell share its record.

## Landmarks and historic districts

The Landmarks Preservation Commission records every individual landmark and every building in a historic district: what kind of building it is and what it is faced with. `scripts/build-landmarks.mjs` keeps 35,997 of them as a position and one byte (`dist/landmark-buildings.bin`, 211 KB): 19,151 row houses, 2,462 tenements, 1,579 store-and-lofts; 7,604 faced in brownstone, 16,164 in red brick, 411 in cast iron. A building in the record gets the facade the record gives, in a wall colour matched to its material (`landmarks.js`): Park Slope is brownstone because the Commission says each house is, and Greene Street is cast-iron lofts. A recorded building that is now far taller than its recorded type is left to its tax lot. Architects' and owners' names in the database are not read. The record covers protected buildings only, mostly in Manhattan and brownstone Brooklyn.

The 1,439 individual landmarks are also kept by name (`dist/landmarks.json`): the search finds them ("flatiron building") and the map has a LANDMARKS layer. Their shapes are the survey's, as for any building; none has a facade or an interior made specially for it.

## What is where, on the map

The street map (**M**) has a row of fourteen kinds of place and the city's landmarks: restaurants, coffee and bakeries, delis and groceries, bars and liquor, barbers, hair and nails, clothes and shoes, banks, laundry, pharmacy and health, garages and parking, hotels and shows, schools and public buildings, and other shops. Chosen kinds are drawn from the same list of 82,023 named places the search uses (`map-places.js`). Seen from far off, each kind is a disc for every square of ground that holds any, sized against that kind's own busiest square, so where barbers gather shows beside where restaurants do even though there are fourteen restaurants to a barber. Closer than about a mile across, or wherever a chosen kind has only a few hundred places in view, each place is a dot, and at block level it is named. A line on the map counts each chosen kind in view. Clicking a place pins it by name, to route or spawn there. Only named places are shown, so a deli the register knows only as a deli is missing.

## Shops the registers do not list

No city or state register lists a clothes shop, a bank or a laundromat. `scripts/build-shops.mjs` takes 12,296 of them in 37 kinds from OpenStreetMap, inside the city's boundary: clothes, banks, laundromats, gyms, phone shops, dry cleaners, jewellers, opticians, post offices, cinemas and so on. They get a front, a sign, opening hours and a room like any other place, and the phone finds them under MORE. Kinds a register already covers (delis, pharmacies, restaurants) are not taken, so nothing is counted twice. OpenStreetMap is mapped by volunteers and is uneven: Manhattan is dense, parts of the other boroughs sparse.

These files (`dist/shops-index.json`, `dist/shops/`) are kept apart from the registers' places because they are © OpenStreetMap contributors under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/), and remain under it. The public Overpass server often refuses a request when busy; `--save` keeps a response and `--from` reuses it.

The sign atlas now letters the nearest 152 fronts (it was 74); beyond that a front keeps its colours without a name.

## Who is on the street

`scripts/build-demographics.mjs` takes two tables of the Census Bureau's 2019-2023 American Community Survey for the 2,231 lived-in census tracts of the five boroughs: residents by race and Hispanic origin, and the language spoken at home. `demographics.js` gives the crowd on a block its mix of skin and hair from the people who live in that tract, blended toward the whole city's where most people on the street are there to work, shop or look around, and by day more than by night. The survey's five groups are each given a wide, overlapping range of tones, so the proportions of a crowd follow the tract while no figure stands for a category; which tones each group ranges over is the game's assumption. Nothing else about a person, their clothes or what they do, is drawn from this.

Where a quarter or more of a tract speaks one language other than English at home, shop signs there add the word for what the place is in that language: Spanish, Chinese, Russian, Korean, Arabic, French or Yiddish. The survey's language groups are coarser than that ("Russian, Polish or other Slavic"), and the choice within each is the commonest in New York.

## The subway

`scripts/build-transit.mjs` bundles the MTA's list of street entrances as 451 stations with the lines that stop at each and 2,067 entrances (`dist/transit.json`). The list's complex numbers put Herald Square and Union Square in one complex, so a station here is a name and its lines. At each mapped stair entrance, green railings and globes mark an opening in the sidewalk. You can walk down the steps and back up. Pressing **E** at the entrance or on the steps lists every station on a line that stops there, nearest first. Choosing one puts you at the top of a stair at that station for the $2.90 fare. With less than the fare you jump the turnstile, which the police may notice. Platforms, tunnels and trains are not modelled, and a ride takes no time; elevators and entrances inside buildings are not drawn.

## The buses

`scripts/build-transit.mjs` also bundles the MTA's bus stops in effect: 13,740 stops and the routes that call at each (`dist/bus-stops.json`). A stop is drawn as a pole with its round blue sign, half a metre in from the nearest kerb. On foot beside one, **E** lists the other stops its routes call at, nearest first, and choosing one puts you there for the $2.90 fare; without it you ride anyway and the police may take an interest. The list does not give the order of a route's stops, so both directions are offered from every stop, and the stop across the street is left out. Buses themselves are not drawn, a ride takes no time, and the sign does not letter the route numbers.

## Sidewalk sheds

`scripts/build-sheds.mjs` bundles the 6,413 buildings with a Department of Buildings sidewalk-shed permit that is issued and has not expired (`dist/sheds.json`: position and building number only). `sheds.js` stands a shed along every wall of such a building that faces a street: a level plywood deck on steel posts with a green parapet, which can be walked under. The permit does not say which sides the shed covers or how long it is, so whole street walls are assumed, and its dimensions are the common kind. A shed hides the signs of the shops beneath it, as real ones do. Rerun the script to bring the list up to date.

## Sidewalk cafes

`scripts/build-dining.mjs` bundles the city's issued Dining Out NYC licences: 1,661 for the sidewalk and 832 for the roadway (`dist/dining.json`, positions only). `dining.js` sets a row of two to five tables with chairs, and a planter at each end, against the street wall nearest each sidewalk licence. The licence does not give the number of tables or where they stand, so the row is the game's. From late morning to eleven at night about half the chairs are taken, by the same people each time; they sit still and do not come or go. Roadway licences are bundled but not drawn, because a dining cabin would stand in the lane where the game parks cars.

## Newsstands and fruit stands

The city's business licences, already bundled with the other places, include 263 newsstands and 1,395 fruit and vegetable stands. `stands.js` puts each at the kerb nearest its licensed address: a steel kiosk with papers on its counter, or a cart of crates under an umbrella, with someone minding it through the day. What a stand looks like is the common kind. On foot at one that is minded, **G** lists what it sells: a paper, water or a scratch-off at a newsstand, fruit at a cart. Prices are the game's.

## Citi Bike

`scripts/build-bikes.mjs` bundles the 2,369 Citi Bike stations in the city from the system's public station feed, with the number of docks at each (`dist/bikes.json`). `bikes.js` draws a station as a row of docks along the nearest kerb, a pay kiosk at one end, and a blue bike in about six docks of ten (the same docks every time; live availability is not read). Real stations mostly stand in the parking lane: here they are on the sidewalk side of the kerb, because the game parks cars in that lane, and a station of more than fifteen docks is cut to fifteen. The bikes cannot be ridden.

## The figures

The crowd is drawn with two modelled figures, a man and a woman, from Quaternius's Universal Base Characters with the walk from his Universal Animation Library (both CC0). `scripts/build-people.mjs` poses each body at 24 frames of the walk and standing still, thins it to about two thousand vertices, and writes where each vertex is at each frame (`dist/people.bin`, 620 KB), with one more frame for sitting on a chair; the crowd's vertex shader looks positions up from that, so a few hundred people cost one draw. The packs are not in the repository: download the free versions into `game/assets-src/characters/` to run the script again. The free packs have one build of body, and no clothes: shirts, trousers and shoes are colours painted on by which bone moves each part of the skin, so everyone is the same athletic shape in close-fitting clothes. The player and the people who mind shops are drawn with the same figures, in the same draw as the crowd; someone behind a counter is the same person each visit. Until the figures have loaded the older blocked-out figure is used.

## Going inside

On foot, walking into the door of an open shop, restaurant, bar, salon, hotel or public building goes in, and walking back out through the door leaves; **E** does either as well. The door is at the middle of the place's front, where the facade now draws one: a glazed door in a dark frame with a handle. A moment passes after coming out before it will take the player in again. No register holds the inside of a shop: `interiors.js` lays the room out. It is as wide as the place's street front (nine metres at most) and as deep as the building behind the door allows (twelve at most), and furnished in the manner of the kind of place. There are thirty-one manners of room, made in the order of how many places of each kind the bundles hold: the plain restaurant (10% of all places) is a diner with a counter, stools and booths; then the deli grocery, the hair salon, the pawn and jewellery counter, the nail salon, the take-out counter under its lit menu, the coffee shop, the barber's, the steam-table lunch counter, the clothes shop with its rails and fitting rooms, the pizzeria with pies under glass, the liquor store, the bar, the bank, the laundromat, the bakery, the sushi bar, the supermarket, the white-tablecloth restaurant, the halal grill, the nightclub with its lit floor, the gym, and so on (`STYLE_OF` in `interiors.js`). Over nine in ten places that can be entered have a room made for their kind; the rest take a plain shop, restaurant or lobby. Every place of a kind has the same layout, varied by its own name in colours and in who is sitting where; a room too small for its layout gets a counter across the back. Rooms are boxes: nothing is modelled finer than a crate, and no real interior is surveyed. Someone minds each one. Standing by whoever is serving, **G** shows what the place sells (`menu.js`): coffee and a bacon, egg and cheese at a bodega, a slice at a pizzeria, a haircut at a barber's, a room at a hotel. A coffee or a meal makes the player a little quicker on foot for a while, a scratch-off pays back about half what it costs, and a night in a hotel mends the car and loses the police. Menus and prices are the game's. About four seats in ten are taken: customers sit at restaurant tables, on bar stools and in barbers' and salon chairs, the same people each visit, and do not move. The room is a closed box: the street cannot be seen from inside, and upper floors are not modelled.

## Earning money

On the street, open the phone with **↑** and choose **Work**.

- **Fast-food crew** and **Finance associate** mark their workplaces on the map. Arrive on foot, open Work again and clock in. Four decisions take your shift from 9 AM to 5 PM. The grill pays $80 plus $8 per correct tray. The office pays $120 plus $12 per correctly posted balance. An unfinished shift resumes from the same ticket.
- **Food courier** offers a restaurant pickup and a customer drop-off. Stop at both gold markers in order to earn the fee and a time-based tip.
- **Coffee cart** costs $60 with six cups included. Six more cost $12. Approach a pedestrian and select **Offer coffee nearby** to sell a cup for $5.
- **Street interactions**, also available with **G** beside a pedestrian, lets you ask a passerby for change or steal their wallet. At a shop counter the same screen offers **Rob the till**. Wallet theft adds one wanted star and a till robbery adds two. A robbed till takes ten real minutes to restock.

## The police

Being wanted runs from one star to five. The rules are in `dist/police.js`; they are the game's, not the NYPD's.

**Nothing is known to the police unless somebody tells them.** A crime counts at once if a patrol or an officer within 55 m can see it. Otherwise it counts only if a bystander saw it and makes the call: each person near enough (and each driver in traffic close by) may pick up a phone, the call takes four to nine seconds to get through, and the police are sent to where it happened, not to where you are by then. On an empty street at four in the morning nobody saw anything.

**Each kind of crime brings only so many stars**, however often it is done:

| Crime | Most stars | Who has to see it |
| --- | --- | --- |
| Red light, unpaid fare, a crash, reckless driving, a broken car window, a stolen wallet | 1 | A patrol (red light), the victim (wallet), otherwise bystanders |
| A punch or a kick, running somebody down, taking a car with its driver in it, a gun shown in the street, a till robbed | 2 | Bystanders; the shop's alarm for the till |
| Gunfire, ramming a patrol car, hitting an officer, killing somebody | 3 | Gunfire is heard 90 m off; the police see what is done to them |
| An officer killed; four people dead | 4 | |
| Three officers killed; eight people dead | 5 | |

Running from an arrest raises one star to two, slowly, and no further.

A chase has two states. While any unit can see you the stars are steady and every unit knows where you are. Out of everyone's sight for two seconds, the stars flash and a bar under them fills: the police go to where you were last seen and spread out from there, and when the bar is full (26 seconds at one star, 58 at five) they give up and all the stars go at once. Seen again, the chase is back on and the bar starts over. Walls block sight. A searching unit sees only what is in front of it, 55° to either side out to 62 m, and anything within 14 m. They are looking for what they last saw you in: change cars, or get out of the one they were chasing, and a searching unit has to come within 24 m to know you. Indoors nobody on the street can see you, unless they saw you go in: then they know the door, the bar does not fill, and an officer who reaches it makes the arrest.

| Stars | Patrol cars | What they do |
| --- | --- | --- |
| 1 | 1 | Follow, pull up, and get out to arrest you |
| 2 | 2 | Ram your car; draw only if you have a gun out |
| 3 | 4 | Shoot; a helicopter joins |
| 4 | 6 | The same, faster and more of it |
| 5 | 8 | The same again |

Officers do not shoot on the run. One who has stopped with you in sight takes about a second to bring the gun up and two and a half for the aim to settle, fires two or three shots and takes a breath. A settled shot at somebody standing still is even odds at 9 m, one in five at 30 m; a running target cuts that to a third, and somebody in a moving car is hit about one time in twelve.

Patrol cars are sent from out of view, a few blocks off, and take the streets with their sirens on: through red lights, and round a queue on the wrong side. Within 55 m and in sight of you they leave the lane and drive straight at you. When you are on foot or stopped, the crew of two get out. Officers run a little slower than you can. Standing still with an officer at arm's length, or stopped with a patrol car on top of you, is an arrest after two seconds: **BUSTED** comes up over a picture drained of colour while the world runs at a third of its speed, then a fine of $80 a star, and you are put back at the courthouse. Dying (shot, run down, a fall, a wrecked car) is **WASTED** the same way, and a hospital bill.

The helicopter circles over you during a chase and over the search area afterwards. It sees you under its searchlight unless a building stands close between you and it. The searchlight is light: it goes into the same map of light as the street lamps, so the street, the cars and the people under it are lit and nothing else is.

The map and the minimap show patrol cars, officers and the helicopter while you are wanted. During a search they also show the area being searched, around the place you were last seen, and what each unit can see.

Not done: officers have no drawn weapon or aiming pose, there are no roadblocks or spike strips, patrol cars cannot be taken, and the player has no gun.

## Cars and garages

Parked and passing passenger cars draw a make, model, year and body together from the registration ZIP nearest their location. The November 3, 2026 snapshot covers 1,784,663 eligible registrations in the five boroughs. It identifies 4,243 distinct make/model/year combinations across 44 makes. Cars with a compatible licensed exterior use it at the kerb, in traffic and when driven. Other years keep their registered identity and use a shared body. Paint uses the earlier citywide registration colours. One in seven moving civilian vehicles is a simulated working van or pickup.

Open **Browse the vehicle catalog** from the pause menu to check a model year’s count, rotate its car or inspect the artist credits. On foot, approach a named passenger car to see its year, make and model in the entry prompt. [Vehicle catalog and asset workflow](docs/vehicles.md)

Cars have individual top speeds, 0–60 times, braking distances and cornering grip. Pause beside a car or while driving to see its figures. At an open auto repair shop, stop and press **G** to compare the next engine or motor, brake and tyre upgrades. Each stage changes the car you drive. Body shops offer repairs and resprays. Collision damage stays with the car. Heavy hits can crush bodywork, break glass and start a fire. An open door can be torn off. The phone mechanic repairs your current car or your nearby burned-out cab for $90 plus repairs. Cab delivery costs $60, and its upgrades and paint are saved with your earnings. [Vehicle physics, trim references and damage](docs/vehicles.md#how-each-car-goes)

## Landscape reconstruction

The [Meadow Lake road pilot](docs/road-pilot.md) adds a roughly 350 × 460 m terrain patch, 27 road/parking surfaces and 65 reviewed paint fragments. A roughly one-metre DEM is constrained by 47 vetted survey points and blended into the surrounding terrain at its boundary. Rendering and tire contact use the same triangles. Actual Segment Anything inference excludes reviewed vehicles from pavement color samples; classical image processing and visual review extract visible paint. This is a bounded, supervised reconstruction pipeline. Sparse bridge measurements, hidden structures and unmeasured curb dimensions remain unresolved. [The evidence page](dist/road-pilot-review.html) links source snapshots, accepted and rejected candidates, and limitations. Rebuild commands and model requirements are in the workflow document.

The city picker includes all of Central Park and detailed areas around Prospect Lake, Meadow Lake, the Bronx Botanical Garden ponds, and Clove Lake, plus the Brooklyn Bridge ground-level approaches and Meadow Lake’s eastern road and parking area. Coarse measured terrain spans the rest of the city. Arrival snaps to an actual nearby road. Walk toward the park or press **V** for the aerial camera.

`landscape.js` drapes the official aerial atlas over the 2017 topobathymetric DEM. The citywide grid is roughly 63–72 metres; park grids are roughly 2.4–3.9 metres. A grid may be turned from north, as Central Park's is, and a large one ships its heights as two bytes a node beside its description and is drawn in pieces 160 m square, those beyond 650 m of the player with every fourth node (`terrain-chunks.js`). Fine-grid edges blend into the coarse measurements over 20 metres, and physics uses the same triangle interpolation. This avoids separate visual and driving surfaces. Cars sample four wheel supports for slope; actors, camera targets, pins and building foundations use measured height.

Mapped water comes from the 2022 hydrography. Full source shorelines govern collisions, preserving islands and avoiding false shorelines at region boundaries. Only consistent interior DEM samples establish a water level, and 17 of the 1,048 mapped lakes and ponds have one citywide. The rest used to stop a walker without being drawn. They are now laid on the ground they are mapped on: seen, sloping wherever the coarse terrain under them slopes, and at no level of their own. The optical material is an approximation.

Tree footprints and upper-canopy heights come from Qin Ma's published crown and canopy-height datasets, derived from 2013–2014 LiDAR with watershed segmentation. Source crowns under 5 m are excluded following the paper's criterion. Approximate crown envelopes and trunks show these source trees in 3D; branch shapes, crown undersides and trunk dimensions are unmeasured. The source can oversegment trees and may disagree with newer aerial imagery. Nearby crowns are selected by distance and built in cooperative batches; distant/full-city views retain the aerial image. The scene status reports rendered crowns separately from available source crowns.

Actual local **Meta SAM ViT-B** inference is bundled as a review artifact. Thirteen source-prompted candidates were evaluated against the 2024 Pond aerial imagery. One visible-water mask passed; all twelve proposed tree masks failed the source agreement gates. The accepted water mask is clipped to the mapped shoreline and changes appearance only. It never changes collisions, invents height or creates a new object. Source agreement is a consistency check, not independent ground-truth accuracy, because source geometry also supplies prompts. See [the image comparison](dist/reconstruction.html) and [machine-readable report](dist/reconstruction-review.json).

Rebuild measured landscape data in an isolated environment:

```sh
python3 -m venv /tmp/nyc-landscape-venv
/tmp/nyc-landscape-venv/bin/pip install -r scripts/requirements-landscape.txt
/tmp/nyc-landscape-venv/bin/python scripts/import-landscape.py --download --all-regions --cache /tmp/nyc-landscape
```

The importer downloads roughly 449 MB of original crown/height data to the external cache, verifies checksums, projects into the game's metre grid, and bundles only sampled/clipped assets. Additional areas can use `--bbox WEST SOUTH EAST NORTH --region-id safe-slug --name "Area name"`. Existing regions are retained. `--all-regions` still rebuilds the first patch around Central Park's Pond; run the Central Park build after it, which takes that patch's place.

### Central Park

The aerial photograph was taken in March. Trees are bare, lawns are straw, and the rule that tells turf from paving called most of Central Park paving: it was drawn as a grey slab with no trees north of 66th Street, on terrain sampled every 70 m. The park is now built from what is mapped and measured inside it (`scripts/build-central-park.py`), in a frame 930 m by 4,200 m turned 28.9° to follow the avenues.

| | From the source | Drawn or assumed |
|---|---|---|
| Ground | A height every 2.5 m (627,013 nodes) from the 2017 one-metre lidar model | Lake beds, which the model leaves at the water's surface, are cut up to 1.8 m below it, and the ground runs evenly through each shore so that the water's edge falls on the mapped line |
| Water | The 13 mapped lakes and ponds, each at the level the model holds across it: the Reservoir at 34.9 m, the Lake at 16.8 m, the Harlem Meer at 3.9 m | Its colour and movement. The streams (the Loch, the Gill) are not drawn |
| Trees | 47,786 crowns from the 2013–14 lidar: where each tops out, its height, the area it covers | The trunk stands under the crown's highest point. Shape, limbs and leaf colour are drawn; a crown is drawn no wider than 0.62 of its height. Crowns whose top is over water or over the sidewalk outside the wall (2,400) are left out, the second because the street tree census draws those |
| Paths, drives, plazas | The city's 2022 outlines of interior sidewalks, plazas and roadbeds; paths the survey lacks from OpenStreetMap's lines, at 2 to 5 m wide by kind | Weathered asphalt throughout. The Mall's paving, the brick and the hexagonal blocks are not told apart |
| Lawns, woods, rock, sand, courts, playgrounds | OpenStreetMap areas: 90 lawns, 149 woods, 112 outcrops of rock, 57 of sand or clay, 74 playing surfaces and playgrounds; the survey's 25 ballfield infields | How each looks. Ground no one has mapped as anything is drawn as rough grass, worn to earth under the crowns. Ground steeper than about 40° is drawn as rock |

`park-ground.js` draws that ground in the terrain's own shader from two images: one holds, for each metre, the distance to the nearest edge of path, lawn, bare earth and rock, which keeps those edges sharp between pixels; the other, at two metres, holds how much is under crowns, woodland, court, and inside the park. `park-trees.js` draws the trees at three levels of detail: the few hundred within 48 m of the camera with boughs and limbs, cells of 140 m at 130 triangles a tree out to about 170 m, and 26 triangles a tree beyond, to 1.5 km. Past that, and on the city map, the crowns are painted on the ground. Trunks within 90 m of the player stop a walker or a car. `central-park.js` loads the two ground maps (2.1 MB) with the game, so the park is green on the city map too, and the tree records when the player comes within 3.2 km.

Not yet right: the four transverse roads run in cuttings, and where a park drive or a hillside crosses over one the elevation model records the top, so a transverse climbs a wall of four to seven metres at every bridge and tunnel over it. The bridges themselves, the perimeter wall, benches, lamps, Bethesda Fountain and Bow Bridge are not built; park buildings are dressed as any other building in the city; and the photograph's March colours still show in parks elsewhere.

```sh
python3 -m venv /tmp/nyc-park-venv
/tmp/nyc-park-venv/bin/pip install numpy scipy rasterio pyproj shapely pyshp py7zr pillow
/tmp/nyc-park-venv/bin/python scripts/build-central-park.py --download --cache /tmp/nyc-central-park
```

The first build downloads the same 449 MB of crown data, the elevation model around the park and a 74 MB OpenStreetMap extract, and takes about twelve minutes. What ships is 1.25 MB of heights, 2.1 MB of ground maps and 0.6 MB of tree records. The ground maps and the furniture list in `dist/central-park/` are derived from OpenStreetMap and remain under the Open Database Licence.

Reproduce the AI stage in a separate Python 3.13 environment:

```sh
python3.13 -m venv /tmp/nyc-reconstruction-ai-venv
/tmp/nyc-reconstruction-ai-venv/bin/pip install -r scripts/requirements-reconstruction-ai.txt
/tmp/nyc-reconstruction-ai-venv/bin/python scripts/reconstruct-imagery.py --reference dist/reconstruction/reference.geojson
```

The pinned, Apache-2.0 SAM model downloads into the external cache. Weights are not shipped to players. Inference runs offline after that download, using Mac GPU acceleration when available or CPU otherwise. Individual aerial tiles, masks, review metrics, source geometry, model revision and checksums are included for audit and reproducibility. The packaged references cover the Pond and a Meadow Lake road/parking review, rather than automatic inference over all boroughs.

The road review ran SAM on 32 roadbed candidates and two parking candidates in the 2024 imagery east of Meadow Lake. All 34 failed the unchanged agreement gates because the masks did not reliably distinguish the source pavement classes. Rejected masks are retained for inspection but contribute no geometry or material changes. The actual mapped pavement still comes from the official polygons. A single overhead image does not establish bridge clearance, hidden road connections or unseen walls; those require independent measured geometry. Inspect both review sections in [the comparison page](dist/reconstruction.html) and the [road report](dist/road-reconstruction-review.json).

Reproduce the exact saved road/parking review:

```sh
/tmp/nyc-reconstruction-ai-venv/bin/python scripts/reconstruct-imagery.py --reference dist/road-reconstruction/reference.geojson --output dist/road-reconstruction-review.json --bbox -73.8392 40.7350 -73.8358 40.7385 --model-directory /tmp/nyc-reconstruction-ai-model --title "Meadow Lake road and parking imagery review" --classes roadbed parking --prompt-grid 3
```

To build a new review reference from the bundled source tiles, replace `--reference ...` with `--street-index dist/street-detail-index.json` and supply the desired bounded `--bbox`. The original review preserves the upstream geographic coordinates; generated references use the millimetre-rounded game geometry.

## Accuracy and limits

- Buildings represent the **2014 survey**. Coarse overview levels simplify the source surfaces. Facades are drawn from a building type inferred from each volume, so a real building's material, window count and ground floor will often differ from what is shown, and landmarks are not recognisable by their facades. The earlier five SoHo photos remain available as references.
- The aerial photographs were captured **March 14–24, 2024**. Redevelopment can differ from the older model. Shadows and parked vehicles in the imagery are flat photographic details.
- Ground comes from the 2017 DEM, with coarse citywide sampling, four finer park patches and all of Central Park. Walking and wheel support use the same terrain triangles as rendering. This is surface-following arcade physics, without jumps or a full suspension solver. Selected bridge decks use surveyed transport outline Z with interpolated interiors. Other bridges, tunnel interiors and complete multilevel connectivity remain unfinished. Mapped inland water blocks movement away from mapped road corridors; those corridors remain traversable to retain existing bridge routes.
- Street surface outlines use mapped polygons citywide, bundled for seven sample regions and requested from NYC Open Data elsewhere; navigation and traffic still use simplified centerlines. Kerb heights, pavement materials and road paint are not in the source and are assumed. Raised medians, traffic islands, plazas and parking lots are built from their own outlines; painted medians are not drawn. Other ground outside those layers (yards, park paths, vacant lots) is drawn from the photograph's averaged colour, as described above. Every building stands on the terrain height at its centre, and its walls are carried 12 m further down as a plain foundation, so sloping ground shows a concrete base where the survey would have a stoop, a retaining wall or a lower storey. Lamp posts and street trees have no collision. Parked cars follow a rule, not a survey: a one-way street too narrow for two rows beside the simulated traffic lane gets one row where it would usually have two, and no parking regulation is consulted. Signals exist only where the rules in "Street life" put them, so a real signal on a narrow street the city does not list is drawn as a stop sign, and every timing is assumed. Lane markings are assumed from each street's width: turn lanes, bus lanes and bike lanes are not drawn, a raised median is not kept clear of, and traffic changes lane only to pass a standing car. The game's day is a weekday; there are no weekends, weather, buses, trucks, bicycles or subway entrances. Bridges and viaducts have decks, slabs, parapets and assumed piers; towers, cables, trusses and the stonework of the old approaches are not modelled, and decks exist only in the seven surveyed regions and on the three landmark crossings: elsewhere an elevated road is still drawn on the ground. Interiors, combat, multiplayer, a campaign and a Steam executable remain future work. Cars, pedestrians and jobs are game elements.

The full map is available to render and explore, but this is a historical city model rather than a live Street View feed. It depends on NYC’s external public tile services; the source panel and loading indicator disclose connection problems.

## Sources and reproducible pipeline

| Data | Project files | Source |
| --- | --- | --- |
| Citywide 3D hierarchy | `dist/city-index.json`, `scripts/build-city-index.py` | [NYC OTI 3D Buildings Citywide](https://www.arcgis.com/home/item.html?id=a6961bc4505c44e8a495b53483491cc0), [NYC Open Data terms](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html) |
| Streets | `dist/road-index.json`, `dist/roads/`, `scripts/import-city-roads.py` | [NYC OTI Citywide Street Centerline](https://data.cityofnewyork.us/City-Government/NYC-Street-Centerline-CSCL-/inkn-q76z) |
| Street map and routes | `dist/navigation-roads.json`, `dist/route-planner.js`, `dist/game-map.js`, `scripts/build-navigation-data.mjs` | Losslessly packed existing NYC CSCL road tiles with source hashes; no external routing provider |
| Street surfaces, citywide | `dist/streetscape.js`, requested per 500 m cell | NYC OTI 2022 planimetrics through NYC Open Data: [roadbeds](https://data.cityofnewyork.us/d/i36f-5ih7), [sidewalks](https://data.cityofnewyork.us/d/52n9-sdep). Medians, plazas and parking lots come from the same survey through NYC OTI's map service (`Median_2022`, `Plaza_2022`, `Parking_Lot_2022` at `services6.arcgis.com/yG5s3afENB5iO9fj`) |
| Signals, sidewalk counts, baskets and shelters | `dist/street-life.json`, `scripts/build-street-life.mjs` | NYC Open Data: [leading pedestrian interval signals](https://data.cityofnewyork.us/d/xc4v-ntf4), [exclusive pedestrian signals](https://data.cityofnewyork.us/d/8kuj-2n3u), [bi-annual pedestrian counts](https://data.cityofnewyork.us/d/cqsj-cfgu), [bus stop shelters](https://data.cityofnewyork.us/d/t4f2-8md7), [DSNY litter baskets](https://data.cityofnewyork.us/d/8znf-7b2c) |
| Places | `dist/places-index.json`, `dist/places/`, `scripts/build-places.mjs` | NYC Open Data: [restaurant inspections](https://data.cityofnewyork.us/d/43nn-pn8j), [legally operating businesses](https://data.cityofnewyork.us/d/w7w3-xahh), [facilities database](https://data.cityofnewyork.us/d/ji82-xba5). New York State Open Data: [retail food stores](https://data.ny.gov/d/9a8c-vfzj), [appearance enhancement and barber businesses](https://data.ny.gov/d/y3u4-jbgh), [liquor authority licences](https://data.ny.gov/d/9s3h-dpkz), [DMV-licensed facilities](https://data.ny.gov/d/nhjr-rpi2) |
| Cars | `dist/vehicle-catalog.json`, `dist/fleet.json`, `dist/assets/vehicles/` | [NYS DMV registrations](https://data.ny.gov/d/w4pv-hbkt), [NHTSA vPIC](https://vpic.nhtsa.dot.gov/), [mesh sources and licenses](dist/assets/vehicles/index.json). ZIP centroids come from the restaurant inspections above. |
| Subway | `dist/transit.json`, `scripts/build-transit.mjs` | New York State Open Data: [MTA subway entrances and exits, 2024](https://data.ny.gov/d/i9wp-a4ja) |
| Landmarks | `dist/landmark-buildings.bin`, `dist/landmarks.json`, `scripts/build-landmarks.mjs` | NYC Open Data: LPC [Individual Landmark and Historic District Building Database](https://data.cityofnewyork.us/d/7mgd-s57w) and [Individual Landmark Sites](https://data.cityofnewyork.us/d/buis-pvji) |
| Building era and use | `dist/lots.bin`, `scripts/build-lots.mjs` | NYC Open Data: [Primary Land Use Tax Lot Output (PLUTO)](https://data.cityofnewyork.us/d/64uk-42ks), NYC Department of City Planning |
| Citi Bike | `dist/bikes.json`, `scripts/build-bikes.mjs` | [Citi Bike system data](https://citibikenyc.com/system-data), station information feed (GBFS) |
| Sidewalk cafes | `dist/dining.json`, `scripts/build-dining.mjs` | NYC Open Data: [Dining Out NYC Locations](https://data.cityofnewyork.us/d/fpeh-f7ci) |
| Other shops | `dist/shops-index.json`, `dist/shops/`, `scripts/build-shops.mjs` | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, Open Database Licence 1.0 |
| Sidewalk sheds | `dist/sheds.json`, `scripts/build-sheds.mjs` | NYC Open Data: [DOB NOW: Build – Approved Permits](https://data.cityofnewyork.us/d/rbx6-tga4) |
| Bus stops | `dist/bus-stops.json`, `scripts/build-transit.mjs` | New York State Open Data: [MTA bus stops](https://data.ny.gov/d/2ucp-7wg5) |
| Residents | `dist/demographics.json`, `scripts/build-demographics.mjs` | U.S. Census Bureau, [American Community Survey 2019-2023](https://www.census.gov/programs-surveys/acs/data/summary-file.html), tables B03002 and C16001; tract positions from NYC Open Data [2020 census tracts](https://data.cityofnewyork.us/d/63ge-mke6) |
| Street trees | `dist/streetscape.js`, requested per cell | [2015 Street Tree Census](https://data.cityofnewyork.us/d/uvpi-gqnh), NYC Parks |
| Land around the city | `dist/context-land.json`, `dist/assets/context/land.png`, `scripts/build-context-land.mjs` | [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen; USGS 3DEP, SRTM, ETOPO1 and other public sources), sampled to a 100 m silhouette |
| Surveyed pavement and transport | `dist/street-detail-index.json`, `dist/street-detail/`, `scripts/import-street-detail.py` | NYC OTI 2022 planimetrics: [roadbeds](https://data.cityofnewyork.us/d/i36f-5ih7), [sidewalks](https://data.cityofnewyork.us/d/52n9-sdep), [curbs](https://data.cityofnewyork.us/d/5xvt-8cbk), [parking lots](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Parking_Lot_2022/FeatureServer/13), [transport structures](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Transport_Structure_2022/FeatureServer/25), [capture rules](https://github.com/CityOfNewYork/nyc-planimetrics/blob/main/Capture_Rules.md) |
| Address search | `dist/geocoder.js`, requested on submission | [NYC Planning GeoSearch](https://geosearch.planninglabs.nyc/docs/), Property Address Directory |
| Shorelines | `dist/boroughs.json` | NYC Department of City Planning borough boundaries, shoreline clipped |
| Aerial images | Public NYC tile service, runtime cache | NYC OTI / NYS, [2024 metadata](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_AerialImagery.md), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Terrain | `dist/landscape-index.json`, `dist/landscape/`, `scripts/import-landscape.py` | [NYC 2017 topobathymetric DEM](https://elevation.its.ny.gov/arcgis/rest/services/NYC_TopoBathymetric_2017_1_meter/ImageServer) |
| Inland water | `dist/landscape/` | [NYC OTI 2022 hydrography](https://data.cityofnewyork.us/d/pjs3-c3z5) |
| Tree crowns and heights | `dist/landscape/`, `dist/central-park/trees.bin` | [Qin Ma (2022), Trees in New York City](https://doi.org/10.6084/m9.figshare.20522895.v2), CC BY 4.0, 2013–2014 LiDAR |
| Central Park ground and outlines | `dist/landscape/central-park-terrain.*`, `dist/central-park/`, `scripts/build-central-park.py` | The 2017 DEM above; NYC OTI 2022 planimetrics (`Park_2022`, `Sidewalk_2022`, `Plaza_2022`, `Roadbed_2022` at `services6.arcgis.com/yG5s3afENB5iO9fj`); lawns, woods, rock, sand, playing surfaces and unsurveyed paths © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, Open Database Licence 1.0 |
| AI imagery review | `dist/reconstruction/`, `dist/road-reconstruction/`, `scripts/reconstruct-imagery.py` | [Meta SAM ViT-B](https://huggingface.co/facebook/sam-vit-base), Apache 2.0, and NYC 2024 aerials, CC BY 4.0 |
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

The simulation tests include variable display frame rates, collision tunneling, car entry/exit, mission rewards, the police (stars, chase and search, dispatch, arrest, gunfire, the helicopter), city streaming, safe travel and progress preservation. Rendering tests cover the sun's path and lighting states, the shader chunk extensions, building type selection and wall layout on real survey tiles, street construction from outlines, kerbside parking on the real SoHo outlines (no two spaces overlap, and traffic runs exactly as it does past empty kerbs), shoreline masks, vehicle bodies and street furniture. Car tests cover the eight bodies as closed solids, the fleet mix by ZIP code, cars drawn from it in traffic and at the kerb, handling by body, and every garage, mechanic and phone action. Place tests cover the kinds and how the registers' categories fall into them, trade names against licensees' names, merging two registers' entries for one business, every bundled cell, finding a place's street front, and the map, table and lettering the shader reads. Street-life tests cover signal timing (a cycle is whole, two streets are never green together, the wave down an avenue moves at 25 mph, the flashing hand lasts long enough to cross), traffic stopping at red lights and stop signs, what running a red costs, traffic gathering round the player without appearing or vanishing in view, the lane layout the paint, the parked cars and the traffic share, turns from the proper lane, pulling out round a standing car, the bundled city lists and the footfall model against the counts it is built on, where signal hardware stands and that its lamps show what the plan says, and a crowd that fills to the modelled density, keeps to the sidewalk and waits for the walk signal. Data tests check all five boroughs, actual I3S fixtures, coordinate projection, courtyards, cache limits, cancellation, retry timing and safe arrival. The complete coarse hierarchy and representative detailed chunks have also been decoded from the live source. The importer tests require the optional dependencies in `scripts/requirements-survey.txt`; install these in a Python virtual environment to include source conversion tests. Plain Python runs artifact checks and skips conversion tests when dependencies are absent. Integration and geometry tests use mocked DOM/canvas/WebGL surfaces; they do not compile a shader or draw a pixel. What the game looks like, and its frame rate, were checked by hand in Chromium on a GeForce GTX 1660 while this renderer was written: 60 frames a second at 1600 × 900 with vertical sync, with occasional longer frames as new districts load.

Refresh the bundled signal, count, basket and shelter lists from NYC Open Data:

```sh
node scripts/build-street-life.mjs
```

Refresh the ZIP centroids and paint mix with the original fleet builder. The separate model-year rebuild uses partial manufacturer descriptors. [Registration and geometry build instructions](docs/vehicles.md)

```sh
node scripts/build-fleet.mjs
```

Refresh the places from the city's and the state's registers (about twenty seconds; businesses open and close, so the counts change):

```sh
node scripts/build-places.mjs
```

Rebuild the land silhouette around the city with the standard library only; elevation tiles are cached in the directory given:

```sh
node scripts/build-context-land.mjs --cache /tmp/nyc-context-land
```

Landscape conversion tests need `scripts/requirements-landscape.txt`; AI tests need `scripts/requirements-reconstruction-ai.txt`. Run each suite in its corresponding environment with `python -m unittest discover -s tests -p test_landscape.py -v` or `-p test_reconstruct_imagery.py -v`.

The render and simulation code are separate ES modules. A later Steam build could package a desktop runtime or port the simulation and geographic pipeline into a native game engine; controller support here is an initial implementation, not Steam Deck certification.
