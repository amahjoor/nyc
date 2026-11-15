# NYC game and street reference pipeline

The playable prototype is in [`game/`](game/README.md). Run `cd game && npm run dev`, then open http://localhost:5173 to walk and drive through the SoHo neighborhood. The reference tools below remain available for future scouting passes.

Plan a SoHo scouting pass from OpenStreetMap roads, open each viewpoint in Google's official Street View viewer, record observations, and export a notebook for the city build. Python 3.9+; no dependencies, API key, or paid API calls.

## Run

Create the notebook using the included OSM snapshot:

```sh
python3 -m nyc_reference plan --config config/soho.json --osm data/soho-osm.json --output output/soho
```

Open `output/soho/index.html` in a browser. Choose a street and stop, then open the forward, left, right, or back view. Links target the nearest available panorama; inspect the actual location and imagery date in Google's viewer. A generated link does not establish coverage.

Record observations and set the stop to `checked` or `unavailable`. Notes remain in the page's current session until you click **Export notebook JSON**. Save that downloaded file somewhere convenient. Reopen it with the notebook's import control or regenerate HTML:

```sh
python3 -m nyc_reference report /path/to/exported-notebook.json --output output/reviewed.html
python3 -m nyc_reference brief /path/to/exported-notebook.json --output output/scouting-notes.md
```

The brief contains checked observations only. No imagery or observations are invented when a stop has not been inspected. Use it to organize subsequent research and modeling decisions; it is not a production asset license.

## Change the area or refresh roads

Edit `config/soho.json`: bounding box order is `[south, west, north, east]`, spacing is in meters, and `max_stops` limits survey size. Small neighborhood boxes keep public OSM queries reasonable. Stops are ordered by OSM way ID, not optimized as a walking route. The cap can leave parts of the area unsampled.

Omit `--osm` to fetch current road geometry from the official OpenStreetMap map API:

```sh
python3 -m nyc_reference plan --config config/soho.json --output output/soho-fresh
```

The map API response is converted to the same JSON shape as Overpass `out geom`. If the endpoint is unavailable, retry later or use the included snapshot. Saved Overpass JSON responses with full way geometry also work. Existing output is protected by default. Use a new directory when possible. To carry observations into a refreshed notebook:

```sh
python3 -m nyc_reference plan --config config/soho.json --osm data/soho-osm.json --reviews /path/to/exported-notebook.json --output output/soho-reviewed
```

Reviews carry over only when ID, coordinates, and heading match. Changed road geometry or spacing can invalidate earlier viewpoints. Original exported notebooks remain your record of prior observations.

## Reference sources

Street locations and names come from OpenStreetMap. Road polylines are sampled at regular distance intervals with four camera headings per stop. Geometry supplies locations, not building dimensions or confirmed Street View camera positions. Start with street proportions, facade rhythm, road materials, street furniture, and atmosphere as inspection prompts; distinguish observed facts from design ideas in your notes.

Google's [Maps URLs API](https://developers.google.com/maps/documentation/urls/get-started#street-view-action) supports opening Street View with coordinates, heading, pitch, and field of view without an API key. This tool generates viewer links. It does not fetch, cache, scrape, or redistribute Google imagery, run vision extraction, or generate meshes/textures from panoramas.

Google's [Maps terms](https://www.google.com/help/terms_maps/) and [Maps Platform terms, section 3.2.3](https://cloud.google.com/maps-platform/terms) restrict copying, bulk extraction, and creating content from Maps content. Opening a viewer link or writing a note does not resolve those restrictions or grant rights to derived game assets. Review the intended use before converting references into commercial content; use your own or appropriately licensed photography for a production image-to-asset workflow.

Street data: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). The input snapshot and generated location database retain that attribution. Check applicable attribution and share-alike obligations when distributing derived databases. The Google imagery viewed externally remains subject to its own terms and attribution.

## Validate

```sh
python3 -m unittest discover -v
```

Tests cover geographic sampling, camera directions, malformed inputs, notebook imports, preservation of reviews, and offline CLI generation. The default notebook starts with all stops pending; browser coverage is a separate check.
