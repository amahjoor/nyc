# NYC passenger vehicles

Open **Browse the vehicle catalog** in the pause menu. Select a make, model and year to see its citywide registration count and the same exterior the game draws. The licensed-exterior selector jumps directly to each imported body. Choose a ZIP under **Most registered model years** to see its highest-volume vehicles and the selected car’s local count. [Vehicle catalog](../dist/vehicles.html)

## What is registered

The November 3, 2026 NYS DMV snapshot contains 1,784,663 active passenger-class registrations with one of the seven supported DMV body codes in the five NYC counties. The state supplies the model year, registration ZIP and body code. The build requests only the manufacturer's descriptor and the year/plant characters of a 17-character VIN. NHTSA vPIC supplies the make, model and, where available, the more specific body style. The packaged game contains aggregate counts. [NYS DMV register](https://data.ny.gov/d/w4pv-hbkt) · [NHTSA partial VIN decoding](https://vpic.nhtsa.dot.gov/api/)

There are 1,676,954 registrations in named groups, or 94.0% of the eligible total. They cover 44 makes, 516 make/model pairs and 4,243 make/model/year combinations. A year with multiple body styles has separate counts for each. The catalog retains a named group once it has 50 registrations of that make, model, year and body citywide. Rarer groups, ambiguous decodes and older vehicles retain their weight in the shared body classes.

Each kerb space and each incoming civilian passenger car samples the ZIP centroid nearest its own position. A ZIP with fewer than 400 registrations blends with the citywide counts in proportion to its sample size. The 182 mapped ZIPs account for 1,769,255 records. The citywide distribution includes every eligible registration. Paint uses the existing citywide paint distribution, and the game assigns half the DMV’s grey cars silver paint. Taxi demand, police vehicles and the 14% allowance for working vans and pickups have their own simulation rules. Registration counts measure where cars are registered. Actual passing traffic also includes commuters, visitors and commercial vehicles.

## Licensed exteriors in the game

An exterior matches the make, model, compatible US model-year range and body style. The registration keeps its exact year. An imported exterior takes precedence over a generated one for its years. Each mesh represents the shared exterior for those years, with approximate trim, wheels and materials. The scanned Accord and early CR-V retain uneven detail around glass and trim at close range. Passing cars, parked cars and the car the player takes share that geometry. Handling and collision dimensions still use game approximations.

| Exterior | Model years used | NYC registrations in that range | Geometry source |
| --- | --- | ---: | --- |
| Nissan Rogue | 2017–2020 | 12,892 | [George Mason CCSA / NHTSA, public domain](https://www.ccsa.gmu.edu/models/2020-nissan-rogue/) |
| Tesla Model Y | 2020–2024 | 7,639 | [763468712, CC BY 4.0](https://sketchfab.com/3d-models/tesla-model-y-2021-c0a86cac582d4b33aba0fb1b1912d970) |
| Honda Accord sedan | 2018–2020 | 7,278 | [roflowhale, CC BY 4.0](https://sketchfab.com/3d-models/2018-honda-accord-54c227442c4b42dfbaa25e474ad9d736) |
| Toyota Camry | 2012–2014 | 6,035 | [George Mason CCSA / FHWA, public domain](https://www.ccsa.gmu.edu/models/2012-toyota-camry/) |
| Honda Civic sedan | 2016–2018 | 4,486 | [Aldios, CC BY 4.0](https://sketchfab.com/3d-models/honda-civic-ff844e296f214e709c0d0691d031c68b) |
| Hyundai Tucson | 2016–2018 | 2,422 | [razor24, CC BY 4.0](https://sketchfab.com/3d-models/2015-hyundai-tucson-7674a3bd168a451daf73fc0a33d39589) |
| Honda CR-V | 2002–2004 | 1,676 | [alexdelker, CC BY 4.0](https://sketchfab.com/3d-models/day-76-honda-crv-e511fa250abd4feebaeedad5707ff1f7) |
| Mazda CX-5 | 2013–2015 | 1,240 | [tnnv, CC BY 4.0](https://sketchfab.com/3d-models/mazda-cx-5-0ca0354c7b2a41bbb84c835ff046e8e5) |
| Tesla Model 3 | 2017–2020 | 1,035 | [wintrez, CC BY 4.0](https://sketchfab.com/3d-models/tesla-m3-model-3a602469d7874d1397efa67182198705) |

Together these cover 44,703 registrations, or 2.50% of the eligible citywide population. CCSA describes its public-domain vehicle models in section 1.3 and figure 2 of its paper. The seven artist models retain their individual licenses and attribution through Allen AI’s Objaverse archive. Each shipped GLB embeds the original title, author, source, license and adaptation notice. [CCSA paper](https://doi.org/10.3390/machines12090596) · [Objaverse](https://objaverse.allenai.org/docs/objaverse-1.0/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [Game asset manifest](../dist/assets/vehicles/index.json)

Model-year coverage follows recognizable exterior changes. The CR-V scan shows the second-generation front end that preceded Honda’s 2005 lamp and bumper redesign. Honda refreshed the Accord’s grille for 2021. Nissan changed the Rogue’s front for 2017 and introduced the next generation for 2021. Hyundai sold the artist’s Tucson generation in the US starting with model year 2016. Mazda changed the CX-5 grille for 2016. Exterior ranges describe the game’s visual matches and can be narrowed in the model recipe. [2005 CR-V changes](https://hondanews.com/en-US/releases/release-98fc1b52a53b415474ccf5004c34c331-the-honda-cr-v-returns-for-2005-updated-styling-new-special-edition-model-and-an-expanded-list-of-standard-safety-features) · [Honda Accord timeline](https://hondanews.com/en-US/honda-automobiles/releases/release-13f25e90cfe47cd58453f1f71003d7c7-honda-accord-timeline-and-milestones) · [2017 Rogue](https://usa.nissannews.com/en-US/releases/us-2017-nissan-rogue-press-kit) · [2021 Rogue](https://usa.nissannews.com/en-US/releases/2021-nissan-rogue-press-kit) · [US Tucson](https://www.hyundainews.com/releases/2179) · [2016 CX-5](https://news.mazdausa.com/2015-02-09-2016-Mazda-CX-5-Pricing-Announced)

## Exteriors the game draws

Every other named registration gets an exterior the game generates: 930 of them, one for each generation of each model in each body style. A generation is a row of model years with the car's published length, width, height and wheelbase, rounded to 5 mm. The make's grille and lamps of the period, and the body style, supply the rest. A row can override any of it, so a Wrangler stands upright on round lamps and a Prius keeps its one-line roof. 99.5% of named registrations fall on a row of their own. The remainder are models with no row yet: they are drawn as a typical car of their style with their make's face. [Design rows and makes' faces](../dist/vehicle-designs.js) · [Generator](../dist/vehicle-generator.js)

These are likenesses, not surveys. Proportions, wheel positions and overall size follow the real car; panel surfaces, lamp outlines and trim are drawn from a small vocabulary of shapes. Each body is built in the browser the first time a car of that kind comes into view (about 10 ms, 3,600–5,500 triangles) and is shared by parked cars, traffic and the car the player drives. Nothing is downloaded for them. Taxis, patrol cars, working vans and pickups in traffic, and the 6% of registrations with no decoded model still use the eight shared bodies.

To add or correct a car, edit its row in `ROWS`: `[make, model, body, [[first year, last year, length, width, height, wheelbase, {overrides}], …]]`, with the make and model spelled as the catalog page shows them. Then look at it in the catalog and run `node --test tests/vehicle-catalog.test.js`.

## Where imported art would reach the most cars

The leading named models across all years are the Honda CR-V (80,256), Toyota RAV4 (62,753), Nissan Rogue (51,899), Honda Accord (49,688), Toyota Camry (43,451) and Toyota Sienna (41,271). The 2026 CR-V alone accounts for 7,759 registrations, the 2026 Rogue for 7,306 and the 2018 RAV4 for 5,545. These years use generated exteriors. A later Rogue or Camry needs its own exterior even though an older one is already in the library.

| Additional published source | NYC registrations for the listed year | What to check before importing |
| --- | ---: | --- |
| [2025 Honda CR-V by Palma123 JAAT](https://sketchfab.com/3d-models/2025-honda-cr-v-15-vtec-turbo-cvt-91c6673859444597bf006a0ef8570005) | 6,352 | CC BY, about 108,400 source triangles. Compare its regional trim with the US vehicle. |
| [2019 Toyota RAV4 by Merc_TV](https://sketchfab.com/3d-models/toyota-rav4-mk5-2019-082c0ed5b88b44f2b0f556f04f8f904c) | 4,240 | CC BY, 416,719 source triangles. Simplify the exterior and fit the axles. |
| [2015 Honda CR-V by ImperialBlue3D](https://sketchfab.com/3d-models/2015-honda-cr-v-8d478eeb3681481596a32126c3ac6906) | 4,096 | CC BY, 4,478 source triangles. The artist supplies an underbody and engine. |

## Rebuild and extend

Use Python 3.11 or later in a virtual environment. These tools are needed only for rebuilding. The running game loads the local JSON and GLBs directly.

```sh
python -m pip install ultravin==3.0.2
python scripts/build-vehicle-catalog.py --cache /tmp/nyc-dmv

python -m pip install numpy==2.4.6 scipy==1.17.1 trimesh==5.2.1 fast-simplification==0.2.0 Pillow==13.0.0
python scripts/build-vehicle-meshes.py --cache /tmp/nyc-vehicle-sources
```

With the local fleet in place, pass `--only honda-civic-2016` or another recipe ID to rebuild a single exterior. The same option adds a newly specified model to the existing fleet.

The DMV build reuses a completed five-county cache. An empty directory requests the current register. The checked-in catalog records the DMV revision, query, decoder version and vPIC data month. The November build uses the October 2026 decoding database. The separate `node scripts/build-fleet.mjs` rebuilds the ZIP centroids, shared body mix and paint counts.

To add art, find the exact catalog spelling and body in the viewer. Add one recipe with the artist, license, original URL, download URL, source SHA-256, supported US years and the materials or engineering part IDs used for its exterior. The importer keeps paint, glass, trim, chrome and lamps, derives the wheel positions and writes a local glTF plus its manifest entry. Registration weights stay independent of art availability. Run `node --test tests/vehicle-catalog.test.js` and inspect the result in the catalog. [Model recipes](../data/vehicle-models.json) · [Mesh importer](../scripts/build-vehicle-meshes.py) · [Registration importer](../scripts/build-vehicle-catalog.py)
