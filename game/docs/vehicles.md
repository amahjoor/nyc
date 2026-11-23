# NYC passenger vehicles

Open **Browse the vehicle catalog** in the pause menu. Select a make, model and year to see its citywide registration count and the same exterior the game draws. The licensed-exterior selector jumps directly to each imported body. Choose a ZIP under **Most registered model years** to see its highest-volume vehicles and the selected car’s local count. [Vehicle catalog](../dist/vehicles.html)

## What is registered

The November 3, 2026 NYS DMV snapshot contains 1,784,663 active passenger-class registrations with one of the seven supported DMV body codes in the five NYC counties. The state supplies the model year, registration ZIP and body code. The build requests only the manufacturer's descriptor and the year/plant characters of a 17-character VIN. NHTSA vPIC supplies the make, model and, where available, the more specific body style. The packaged game contains aggregate counts. [NYS DMV register](https://data.ny.gov/d/w4pv-hbkt) · [NHTSA partial VIN decoding](https://vpic.nhtsa.dot.gov/api/)

There are 1,676,954 registrations in named groups, or 94.0% of the eligible total. They cover 44 makes, 516 make/model pairs and 4,243 make/model/year combinations. A year with multiple body styles has separate counts for each. The catalog retains a named group once it has 50 registrations of that make, model, year and body citywide. Street traffic samples only named groups, in proportion to their counts. ZIPs with no named registrations use the citywide named mix.

Each kerb space and each incoming civilian passenger car samples the ZIP centroid nearest its own position. A ZIP with fewer than 400 registrations blends with the citywide counts in proportion to its sample size. The 182 mapped ZIPs account for 1,769,255 records. The citywide distribution includes every eligible registration. Paint uses the existing citywide paint distribution, and the game assigns half the DMV’s grey cars silver paint. How many cabs are out, where the police patrol and the 14% of traffic that is a van or pickup at work are the simulation's rules; which models those are comes from the city's own lists, below. Registration counts measure where cars are registered. Actual passing traffic also includes commuters, visitors and commercial vehicles.

## Licensed exteriors in the game

An exterior matches the make, model, compatible US model-year range and body style. The registration keeps its exact year. In the catalog an imported exterior takes precedence over a generated one for its years. Each mesh represents the shared exterior for those years, with approximate trim, wheels and materials. The scanned Accord and early CR-V retain uneven detail around glass and trim at close range, and carry the shadows of their photographs on their windows. The street does not use the imported exteriors for that reason: every car in traffic and at the kerb is one the game generates, and passing cars, parked cars and the car the player takes share that geometry. To put the imported exteriors back in the street, pass the models of `assets/vehicles/index.json` to `createFleet` in `main.js` again. Handling and collision dimensions still use game approximations.

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

Every other named registration gets an exterior the game generates: 929 of them, one for each generation of each model in each body style. A generation is a row of model years with the car's published length, width, height and wheelbase, rounded to 5 mm. The make's grille and lamps of the period, and the body style, supply the rest. A row can override any of it, so a Wrangler stands upright on round lamps and a Prius keeps its one-line roof. 99.5% of named registrations fall on a row of their own. The remainder are models with no row yet: they are drawn as a typical car of their style with their make's face. [Design rows and makes' faces](../dist/vehicle-designs.js) · [Generator](../dist/vehicle-generator.js)

The windscreen and the rear window sit in a black bonded band, with the high stop lamp in the band at the head of the rear window and a wiper parked at the foot of a tailgate's glass. A tail lamp is a dark housing, a red lens standing on it, and under the lens the strip that glows when the car is lit, the stop lamp, a clear reversing lamp and, on the makes that fit one, an amber indicator. It wraps the corner on a saloon, stands up the corner beside the tailgate glass on an SUV or minivan where the body is upright enough to carry it, and is an upright block on a van, a pickup or an older SUV. A pickup has a step bumper and a painted tailgate; other cars have a dark valance with the tailpipe through it (two on a coupe or a low premium car, none on a battery car).

These are likenesses, not surveys. Proportions, wheel positions and overall size follow the real car; panel surfaces, lamp outlines and trim are drawn from a small vocabulary of shapes. Each body is built in the browser the first time a car of that kind comes into view (30–60 ms, 6,500–8,500 triangles) and is shared by parked cars, traffic and the car the player drives. Nothing is downloaded for them. During startup, cars draw from a small roster of named models until the registration data arrives.

## Cabs, patrol cars and work vans

Cabs and working vehicles are not in the passenger registrations, so they have a list of their own. [Fleet mix](../dist/working-vehicles.json)

| Fleet | Source | Vehicles | Named model years | Most common |
| --- | --- | ---: | ---: | --- |
| Yellow cabs | [TLC authorized medallion vehicles](https://data.cityofnewyork.us/d/rhe8-mgbb), 17 November 2026 | 10,270 | 10,204 | Toyota Sienna 40%, Toyota RAV4 28%, Ford Transit Connect 16%, Nissan NV200 6% |
| Boro cabs | [TLC street hail livery permits](https://data.cityofnewyork.us/d/yhuu-4pt3), 17 November 2026 | 609 | 442 | Toyota RAV4, Toyota Camry, Ford Escape |
| Vans and pickups at work | [NYS DMV register](https://data.ny.gov/d/w4pv-hbkt), commercial class, 3 November 2026 | 42,619 | 29,564 | Ford Transit 22%, Mercedes-Benz Sprinter 7%, Chevrolet Express 6% |

Each source is asked only for counts by partial VIN, as for passenger cars: no licence, plate or owner is requested. A cab is the generated exterior of its model with a roof light and the band of squares along its doors, painted yellow or green by the game. A van registered to a trade is panelled in behind the cab; the same van registered as a passenger car has windows. Working vans and pickups take their colours from the same register: 70% are white. Commercial traffic draws from the named van and pickup entries.

Patrol cars are drawn as the Ford Police Interceptor Utility, the Explorer-based car that makes up most of the NYPD's marked fleet, in white with two blue stripes. That choice is the game's; no fleet list is behind it. For-hire cars (about 100,000 TLC-plated vehicles, mostly Uber and Lyft) are not in traffic yet.

## How each car goes

A car the player drives pulls, tops out, brakes and corners as its model does against other cars. The figures start from what the makers filed with NHTSA: vPIC decodes engine power, curb weight, driven wheels and fuel from the same partial VINs the catalog counts, and the build averages them over the cars registered. A 2018 Mustang's 357 hp is the mix of four- and eight-cylinder cars New Yorkers own, not the brochure's best. Power is on file for 71% of named registrations, weight for 57%, driven wheels for 86% and fuel for 99%. [Figures by model year](../dist/vehicle-performance.json) · [Formulas](../dist/vehicle-performance.js)

The game uses a representative production trim when a factory spec or instrumented test is available. Registrations combine trims of the same model, year and body. For other cars, power-to-weight and driven wheels determine estimated acceleration. Power, frontal area, drag and a representative electronic limiter determine estimated top speed. Grip and braking use the vehicle class and weight. Missing power and weight are estimated from dimensions, body and era and marked with a tilde. The catalog identifies the trim used for top speed or labels it an estimate.

| Representative configurations | Sources |
| --- | --- |
| CR-V Touring and Sport Touring Hybrid, RAV4 Adventure, Sienna Hybrid, Rogue Platinum | [CR-V and RAV4 road test](https://www.caranddriver.com/reviews/comparison-test/a27426166/2019-honda-cr-v-vs-2019-toyota-rav4/) · [RAV4 Adventure](https://www.caranddriver.com/reviews/a24734743/2019-toyota-rav4-suv-drive/) · [Honda hybrid limiter](https://hondanews.com/en-US/honda-automobiles/releases/release-1503019bd8a757ea08267d7944378955-ho) · [Hybrid CR-V test](https://www.caranddriver.com/reviews/a41623655/2023-honda-cr-v-sport-touring-hybrid-by-the-numbers/) · [Sienna](https://www.caranddriver.com/toyota/sienna-2021) · [Rogue](https://www.caranddriver.com/nissan/rogue-2023) |
| Model Y and Model 3, fourth-generation Prius and Volvo's 180 km/h limiter | [Tesla model comparison](https://www.tesla.com/ns_videos/2024-extended-version-tesla-impact-report.pdf) · [Current Model Y configurations](https://www.tesla.com/modely/design) · [Toyota Prius](https://media.toyota.co.uk/toyota-reaches-greater-heights-of-efficiency-in-all-new-prius/) · [Volvo](https://www.volvocars.com/de/media/press-releases/05410E4F3999963D/) |
| 911 Carrera PDK, M3 and M4 with standard limiters, 750i and i4 eDrive40 | [Porsche specifications](https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr%3A8a8a3990-34a8-4ae0-a11e-f4bb53abd5e0/2017_911_Carrera_and_Carrera_S_Technical_Specifications.pdf.PDF) · [BMW M3 and M4](https://www.press.bmwgroup.com/usa/article/detail/T0317577EN_US/the-new-2021-bmw-m3-sedan-and-m4-coupe) · [BMW 7 Series](https://www.press.bmwgroup.com/usa/article/detail/T0290164EN_US/the-new-2020-bmw-7-series-sedan) · [BMW i4](https://www.press.bmwgroup.com/usa/article/detail/T0334247EN_US/the-new-2022-bmw-i4-edrive40-and-i4-m50) |
| C7 Stingray Z51 and C8 Stingray 1LT | [Chevrolet C7](https://media.chevrolet.com/content/dam/Media/documents/INTL/chevrolet/2019/vehicles/corvette-stingray/Tech-Data-Chevrolet-Corvette-Stingray.pdf) · [Chevrolet C8 stock top speed](https://media.chevrolet.com/content/dam/Media/images/US/Release_Images/2019/08-19/2020-corvette-stingray-pricing.pdf) · [MotorTrend 1LT acceleration, braking and grip test](https://www.motortrend.com/reviews/2020-chevrolet-corvette-1lt-first-test-review) |
| Lucid Air Touring and Gravity Grand Touring, Rivian R1S Launch Edition and Tri-Motor Max, R2 Performance | [Air Touring](https://lucidmotors.com/media/document/lucid-air-touring-technical-specs-2024.pdf) · [Gravity specifications](https://lucidmotors.gcs-web.com/node/10311/pdf) · [R1S road test](https://www.caranddriver.com/reviews/a40514350/2022-rivian-r1s-drive/) · [R1S Tri-Motor test](https://www.caranddriver.com/rivian/r1s-2025) · [R2 road test](https://www.caranddriver.com/reviews/a73308571/2027-rivian-r2-performance-awd-launch-edition-test/) |
| Ford Police Interceptor Utility Hybrid AWD | [Michigan State Police model year 2021 evaluation](https://www.michigan.gov/-/media/Project/Websites/msp/training/my2021policevehicleevaluationtestbook.pdf?rev=9967af7ced3a451a984f5d43318b3397) |

The vehicle dynamics use metres and seconds. Flat-road runs measure elapsed time to 60 mph and distance covered at sustained full speed. High-speed acceleration tapers as the car approaches its own limiter. Axle heights determine the road grade, so the same car accelerates and coasts differently up and down a hill. Service braking uses longitudinal deceleration in g. Where a road test measured a stop from 70 mph, its average deceleration gives the displayed 60–0 distance. Tyre grip limits lateral acceleration and the model's axle spacing sets its low-speed turning radius. Traffic and patrol AI choose their own target speeds. Cars with no named identity use one of eight body-style profiles. [Driving equations](../dist/vehicle-dynamics.js) · [Fleet road tests](../tests/vehicle-performance.test.js) · [GTA V sustained-speed testing methodology](https://gtacars.net/gta5/topspeed)

In the catalog, figures describe a stock car. Pause near or inside a car to see its fitted setup. At a repair shop, the counter previews the next stage in mph, seconds, feet or g. Each engine stage adds 9% of stock acceleration and 5% of stock top speed, each brake stage adds 10% of stock braking force, and each tyre stage adds 8% of stock cornering grip. Each part has three stages. These gains are game tuning. [Parts and prices](../dist/garage.js)

## Bodywork and damage

Parked cars and passing traffic keep the same clear front windows and darker rear windows as you approach or walk away. A car is drawn the same at any distance: cars further off are drawn in batches, with the same body, alloy wheels, seats, dashboard and seated driver they have close by, and only stop turning their wheels. An empty car shows its empty seats. Seen from a seat, or through a window, the inside of the body is cabin lining (pale under the roof, dark elsewhere), not the outside's paint, and lamps do not show or shine through it. Generated exteriors carry their original panel seams. Imported meshes use the available surface labels and approximate hinges. The catalog's studio lights make the paint and glass easier to inspect from different angles.

Impact speed into the struck surface and the relative masses of colliding vehicles determine how much that side crushes. The hood can buckle, the windscreen can crack or give way, and side glazing can shatter. Entry opens a front door. A locked car may require a window break, and an occupied car's driver leaves the seat during the entry animation. A door caught open in a collision can break free and tumble onto the roadway. Heavy damage reduces propulsion. A severe front, rear or battery-area impact can start a fire. Traffic drivers can escape once their car slows, and the fire eventually leaves a burned-out wreck. The fire delay and explosion are gameplay effects. Repairs restore that particular car's panels, glass and mechanical condition. [Damage model](../dist/vehicle-damage.js) · [Articulated exterior](../dist/vehicle-detail.js)

To add or correct a car, edit its row in `ROWS`: `[make, model, body, [[first year, last year, length, width, height, wheelbase, {overrides}], …]]`, with the make and model spelled as the catalog page shows them. Then look at it in the catalog and run `node --test tests/vehicle-catalog.test.js`.

## Number plates

Every car carries a plate with a number of its own (`license-plates.js`), the same on the car whether it is parked, in traffic or being driven:

| Plate | Who carries it | Number |
| --- | --- | --- |
| Excelsior (white, gold band, issued since 2020) | Every car of model year 2021 on, and just under half of older ones | `KAB-1234`, beginning K or L |
| Empire Gold (2010–2020) | Most other older cars | `FAB-1234`, beginning F, G, H or J |
| Empire State (blue and white, to 2010) | About one car in twenty-five from 2010 or before | `DAB-1234`, beginning D or E |
| Commercial, on either base | Trade vans and pickups | `12345-MA` |
| Medallion, Empire Gold with T&LC | About seven yellow cabs in ten | the medallion and a letter, `5K38H` |
| T&LC, Excelsior | Green cabs and the other yellow ones | `T123456C`, `Y123456C` |
| New Jersey, Pennsylvania, Connecticut, Florida | About one car in eight, half of them New Jersey | each state's own |

Pennsylvania and Florida issue one plate, so those cars have none on the nose. Numbers leave out I, O and Q. The shares are the game's estimate of a Manhattan street, not a count.

The artwork of all eleven plates is painted once onto one sheet, and the characters onto another, as single-weight strokes like the dies a plate is stamped with. A plate's number travels with it as eight small integers and is laid over the artwork in the shader (`vehicle-plates.js`), so a thousand cars need no texture each. Plates catch a little light after dark, as reflective sheeting under a plate lamp does.

A body shop fits a new set of plates for $120: the car gets the next number of its kind. Nothing in the game reads plates yet, so new plates do not shake off the police.

## Wheels

A car's wheels are its model's: five-spoke alloys on most, eight-spoke on coupes, multi-spoke or gunmetal on premium makes and some others, aero covers on Teslas, pressed steel under a cap on cabs and trade vans, black steel on patrol cars. They are the same wheels close by and down the street. A body shop fits any of six patterns for $350 a set.

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
python scripts/build-working-vehicles.py --cache /tmp/nyc-working
python scripts/build-vehicle-performance.py --cache /tmp/nyc-dmv --working-cache /tmp/nyc-working

python -m pip install numpy==2.4.6 scipy==1.17.1 trimesh==5.2.1 fast-simplification==0.2.0 Pillow==13.0.0
python scripts/build-vehicle-meshes.py --cache /tmp/nyc-vehicle-sources
```

With the local fleet in place, pass `--only honda-civic-2016` or another recipe ID to rebuild a single exterior. The same option adds a newly specified model to the existing fleet.

The second command rebuilds the cab and work-van mix from the TLC and the register's commercial class. The third reads both caches, requests nothing, and must be rerun whenever the catalog is. The DMV build reuses a completed five-county cache. An empty directory requests the current register. The checked-in catalog records the DMV revision, query, decoder version and vPIC data month. The November build uses the October 2026 decoding database. The separate `node scripts/build-fleet.mjs` rebuilds the ZIP centroids, shared body mix and paint counts.

To add art, find the exact catalog spelling and body in the viewer. Add one recipe with the artist, license, original URL, download URL, source SHA-256, supported US years and the materials or engineering part IDs used for its exterior. The importer keeps paint, glass, trim, chrome and lamps, derives the wheel positions and writes a local glTF plus its manifest entry. Registration weights stay independent of art availability. Run `node --test tests/vehicle-catalog.test.js` and inspect the result in the catalog. [Model recipes](../data/vehicle-models.json) · [Mesh importer](../scripts/build-vehicle-meshes.py) · [Registration importer](../scripts/build-vehicle-catalog.py)

### Driver behavior and calibration

NHTSA observed 3.0% of passenger-vehicle drivers visibly manipulating handheld devices in its 2023 US survey. Civilian traffic uses that daytime snapshot as a target share of simulated time. As a gameplay choice, half of civilian drivers are eligible for brief, staggered phone episodes averaging 6% of their time behind the wheel. They update their response to the vehicle ahead less often during an episode. Collisions and damage depend on actual vehicle contact and closing speed. NYC DOT recorded driver inattention or distraction at 184 locations (31.8%) in its Q4 2024 serious-injury response report. The broader distraction category and the serious-injury sample cannot establish a per-trip phone crash probability. [NHTSA observational survey](https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813660.pdf) · [NYC DOT serious-injury report](https://a860-gpp.nyc.gov/downloads/r207tt05b?locale=en)

In AAA Foundation’s 2014 national survey, 44.5% of drivers reported honking in annoyance during the preceding year, and 3.7% reported getting out to confront another driver. The game uses these as approximate shares of driver personalities. A continuously blocked driver may honk after 5–13 seconds. Repeatedly striking an occupied, stopped car can provoke a confrontation when the driver has room to exit. The delays, cooldown and escalation after a second strike are gameplay choices. [AAA Foundation survey](https://aaafoundation.org/research/prevalence-self-reported-aggressive-driving-behavior-united-states-2014/)

Shopping accounted for 17% of trips across travel modes in NYC DOT’s 2024 Citywide Mobility Survey. The game borrows that share to select potential shopping trips among civilian cars. Completing one requires an open storefront and a vacant nearby space along the driver’s route. The actual share completing a shopping stop depends on the neighborhood and curb occupancy. [NYC DOT survey, trip purpose](https://www.nyc.gov/html/dot/downloads/pdf/2024-cms-report.pdf)
