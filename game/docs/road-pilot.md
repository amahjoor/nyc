# Meadow Lake road reconstruction pilot

This bounded pilot replaces flat aerial pavement with survey-backed ground geometry and source-colored materials. It covers approximately 347 × 463 metres east of Meadow Lake in Queens. It is an offline build pipeline: the running game does not load model weights or perform AI inference.

Launch the game with `npm run dev`, choose **Explore road pilot**, and use **Show aerial / Show reconstruction** to compare appearance while driving the same measured surface. [The evidence page](../dist/road-pilot-review.html) documents accepted and rejected outputs.

## What ships

| Output | Current result |
| --- | --- |
| Ground pavement | 27 patches, 78,837 source triangles, 31,683.96 m² |
| Terrain | 349 × 465 nodes at approximately one-metre spacing |
| Survey constraints | 47 accepted ground points from 115 elevation records |
| Source appearance | 21 source material records matched to the 27 ground patches |
| Paint | 65 observed fragments from 95 classical image-analysis candidates |
| Vehicle exclusions | 13 accepted SAM masks from 26 visually selected vehicle prompts |
| Additional survey evidence | 33 pavement edges, one curb cut, two deferred bridge footprints |

The source spot-elevation fit has a maximum residual of 0.0223 m and mean residual of 0.0016 m. These numbers measure fit to input constraints, not independent accuracy. A quarter-metre sampling audit of the existing CSCL 111892 parking-loop route measured a maximum adjacent height change of 0.0167 m across 1,276 samples. Other terrain near bridges can remain steep.

## Set up the offline tools

Run these commands from a complete repository checkout. Python 3.13 was used for the appearance build. Keep the reconstruction environment separate from any environment using `requirements-landscape.txt`, whose older pinned NumPy versions serve the existing landscape importer.

```sh
python3.13 -m venv /tmp/nyc-reconstruction-ai-venv
/tmp/nyc-reconstruction-ai-venv/bin/pip install -r scripts/requirements-reconstruction-ai.txt
```

The appearance stage uses Meta SAM ViT-B, pinned to revision `70c1a07f894ebb5b307fd9eaaee97b9dfc16068f`. Obtain it once in an external model directory:

```sh
/tmp/nyc-reconstruction-ai-venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id="facebook/sam-vit-base",
    revision="70c1a07f894ebb5b307fd9eaaee97b9dfc16068f",
    local_dir="/tmp/nyc-reconstruction-ai-model",
    allow_patterns=["config.json", "preprocessor_config.json", "model.safetensors"],
)
PY
```

`model.safetensors` must have SHA-256 `892c410e496344e527255ccdcb2cb7244a609acb5389c7c4fdba1288f861c579`. The builder verifies this before inference. Model weights stay outside the project and are not shipped to players. Default inference uses MPS when available; `--device cpu` works without a GPU. The recorded run used Torch 2.14.1 and Transformers 4.57.6 from the requirements file.

## Build measured ground geometry

The default build is network independent because source snapshots are bundled:

```sh
/tmp/nyc-reconstruction-ai-venv/bin/python scripts/build-road-pilot.py
```

To refresh the bounded official sources:

```sh
/tmp/nyc-reconstruction-ai-venv/bin/python scripts/build-road-pilot.py --download --cache /tmp/nyc-road-pilot
```

The builder queries exactly the pilot bounds, rejects error or truncated responses, and preserves raw snapshots with hashes. It uses source roadbed and parking footprints from `dist/road-reconstruction/reference.geojson`. Shoulder subtype `350020` is excluded from resurfacing. A deterministic coverage partition assigns overlap to roadbed before parking, then by stable source feature ID. It removes 33.96584 m² of duplicate coverage without expanding source footprints; repairs and the feature retaining each shared area are recorded in `topologyRepairs`.

Heights begin with NYC's 2017 one-metre topobathymetric DEM. Selected 2022 ground elevation points constrain that grid. US survey feet are converted with exactly `1200 / 3937` metres per foot. Source elevations use NAVD88, with the DEM metadata specifying Geoid 12B. Some records labeled ground fall on bridge footprints; footprint checks exclude them from ground fitting. The outer 20 metres blend toward the existing base and Meadow Lake terrain. The builder's boundary audit records a 0.043504 m maximum discrepancy at its sample locations; finer interpolation checks can differ. This is an approximate blend rather than an exact continuous join. Runtime retains the required Meadow Lake fine grid while this terrain patch is active. The dependency and its source hashes are recorded in `terrain.requiredRegions` and `terrain.baselineHashes`. Original measurements remain separately available.

Pavement meshes are clipped to actual footprints and split on the terrain triangles used by gameplay. The runtime clips observed paint against those supported triangles, preserving holes and slope. All 65 accepted paint fragments produce geometry. Degenerate float32 slivers are omitted from the GPU geometry. No geometry changes when switching comparison modes.

The two local bridge polygons have zero Z ordinates. Nine bridge survey spots do not establish complete decks, crossfall and connected approaches. Their footprints are excluded from ground resurfacing. These bridges remain deferred; the ground DEM must not be mistaken for a usable bridge deck. Pavement edges and the curb cut are review evidence only because their presence does not establish curb height or profile.

## Build appearance with actual model inference

```sh
/tmp/nyc-reconstruction-ai-venv/bin/python scripts/reconstruct-road-appearance.py --model-directory /tmp/nyc-reconstruction-ai-model
```

The input image is `dist/road-reconstruction/aerial.png`, assembled from the same 2024 NYC source tiles used by the game. The original tile grid and image hash anchor pixel coordinates to game X/Z coordinates, measured east/south from longitude −74.0015, latitude 40.7235.

The appearance stages have different responsibilities:

1. **Vehicle masks:** source-image inspection supplies 26 vehicle boxes. SAM computes masks from those prompts. The highest model-scored mask is selected before checking its gates. Acceptance requires predicted IoU ≥ 0.75, at least 90% containment in the reviewed box, and 20–1,800 pixels. Thirteen masks pass. Accepted masks expand by two pixels to conservatively exclude their boundaries from color samples. The model score describes estimated mask quality, not semantic certainty. The boxes are not an independent benchmark.
2. **Material samples:** eroded pavement interiors, accepted vehicle exclusions, brightness quantiles, neutral-color checks and local-contrast trimming select 196,253 pixels. Median RGB produces one color per source feature. Brightness trimming removes many cast shadows and bright objects without claiming complete semantic shadow or vehicle detection. Roughness `0.94` and fine color variation `0.015` are explicit rendering approximations, not measured physical properties.
3. **Paint proposals:** classical local contrast finds thin bright connected components inside mapped pavement. Shape gates reject broad vehicle-like regions. Each proposal keeps its exact source pixels. Visual inspection of highlighted source crops rejects 29 of 95 components, including bridge seams, vehicle reflections and uncertain edges. One additional component, candidate 5, overlaps an accepted vehicle exclusion. The remaining 65 are converted to polygons without extending stripes through gaps or occlusions. SAM does not identify this paint.
4. **Runtime acceptance:** only explicitly accepted materials and markings are used. Markings clip to survey-supported surface triangles. Unaccepted or unmatched surfaces keep their existing aerial appearance. No new curb dimensions, lane patterns, light poles or hidden structures are introduced.

No generative image inpainting is used. Source-colored material replaces the photograph on reconstructed pavement, so old cars and photographic shadows are not copied onto those surfaces. Unreconstructed surfaces can still display photographic artifacts.

The former whole-road SAM experiment remains unchanged: zero of 34 road/parking masks pass its original source-overlap gates. The new vehicle exclusion rules apply to a different task and do not weaken those earlier thresholds.

## Review and extend the pipeline

Open `http://localhost:5173/road-pilot-review.html` after `npm run dev`. Inspect the original image, the color-sample overlay, all paint candidates and every accepted/rejected vehicle proposal. Download individual masks or inspect the JSON source pixels when a decision is uncertain.

`REVIEWED_IMAGE_SHA256` and `REVIEWED_CANDIDATES_SHA256` in `scripts/reconstruct-road-appearance.py` lock decisions to the exact image and extraction result. The manifest's `review.candidatesSha256` hashes canonical sorted-key JSON content for that review gate; `review.candidatesFileSha256` separately hashes the distributed file bytes, including serialization and trailing newline. If an image or algorithm changes, the builder generates the candidate contact sheet and then refuses to reuse the old acceptances. Inspect the changed output, update the explicit rejection set and hashes only after review, and rerun. Do not change hashes solely to bypass the check. Current inspection was performed by the coding assistant against the actual source crops; no independent human accuracy study is claimed.

For a new area, begin with official footprints and measured vertical data. Keep road/bridge levels separate. Save the untouched inputs and checksums, review appearance candidates and extend the tests with independent positive and negative examples. Expand only after the new area passes source containment, source-level separation and drive-height continuity checks. The current script contains pilot-specific review decisions and vehicle prompts; changing only its bounds is not a valid citywide workflow.

## Files and data contracts

| File | Role |
| --- | --- |
| `dist/road-pilot-index.json` | Small lazy-loading index, source bounds and repeatable road spawn |
| `dist/road-pilot.json` | Ground mesh, survey decisions, raw source hashes and limitations |
| `dist/road-pilot-source/terrain.json` | Final gameplay/render terrain grid |
| `dist/road-pilot-source/raw-dem.json` | Original sampled DEM before constraint fitting |
| `dist/road-pilot-source/survey-review.json` | Interpreted elevation, edge, curb-cut and bridge records |
| `dist/road-pilot-source/{elevation,pavement-edge,curb-cut,transport}.json` | Unmodified bounded official responses |
| `dist/road-pilot-appearance.json` | Source materials, observed paint vectors, vehicle decisions and model provenance |
| `dist/road-pilot-vision/` | All candidate pixel records, masks and evidence contact sheets |
| `dist/road-pilot.js` | Runtime source materials, paint clipping and comparison mode |

Appearance surfaces match survey patches by `sourceFeatureId`. Each material contains `color`, `roughness`, `colorVariation`, `sourceSample` and `reviewStatus`. Markings contain accepted `polygons` with `outer` and `holes` X/Z rings, their source identity and exact image pixels under `evidence`. Neither material colors nor marking polygons supply elevations.

## Check the result

```sh
/tmp/nyc-reconstruction-ai-venv/bin/python -m unittest discover -s tests -p 'test_road_*.py' -v
npm test
npm run check
```

Appearance tests cover pinned inputs, review invalidation, rejected seams and reflections, occluder gates, sample exclusion and exact source-footprint containment. Geometry tests cover official response validity, elevation classification, mesh/terrain agreement, bridge exclusions and repeatability. Runtime tests compare actual mesh and paint heights with gameplay terrain and verify mode switching does not change collision sampling.

The nine appearance tests pass without rerunning the model. Full inference remains necessary when regenerating its evidence. Pixel/model outputs can differ across device or library versions; retain their recorded environment and review changed masks rather than assuming byte identity. The geometry builder's nine generated JSON outputs reproduce byte-for-byte from the bundled source snapshots in the documented environment.

## Provenance and current limits

| Source | Use and terms |
| --- | --- |
| [NYC 2024 aerial imagery](https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/NYC_Orthos_2024/MapServer) | March 14–24, 2024 imagery; CC BY 4.0 attribution to NYC OTI / NYS |
| [NYC 2022 roadbeds](https://data.cityofnewyork.us/d/i36f-5ih7) and [parking](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Parking_Lot_2022/FeatureServer/13) | Exact pavement footprints; retain NYC source attribution and [Open Data terms](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html) |
| [NYC elevation points](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Elevation_2022/FeatureServer/6) | 2022 ground and bridge spot measurements; original query and hash in manifest |
| [Pavement edges](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Pavement_Edge_2022/FeatureServer/14), [curb cuts](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Curb_Cut_2022/FeatureServer/5), [transport structures](https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Transport_Structure_2022/FeatureServer/25) | 2022 review evidence and unsupported-level exclusions |
| [NYC 2017 LiDAR DEM](https://elevation.its.ny.gov/arcgis/rest/services/NYC_TopoBathymetric_2017_1_meter/ImageServer) | Bare-earth topobathymetric elevations; NYC/NYS source metadata and query retained |
| [Meta SAM ViT-B](https://huggingface.co/facebook/sam-vit-base) | Apache-2.0 model; pinned revision/weight hash, external download, no redistributed weights |

The data dates differ. Fine terrain between survey points is interpolated, material colors remain affected by photographic exposure, and missing or ambiguous paint is omitted. Neither yellow lines nor parking-stall patterns are invented to make the result look complete. Two bridges remain deferred, and detailed facades, curb dimensions and bridge supports are outside this pilot. A single aerial photograph cannot recover hidden structure or establish multilevel traversability.

This repository workflow is prepared for contribution and reproducible builds. Its existence does not change repository visibility or assign a new blanket license to upstream data or game code.
