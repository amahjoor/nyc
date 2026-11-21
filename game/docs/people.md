# People

Open **Design your character** in the pause menu to set the player’s face, build, hair, clothes and colours. The editor and the game read the same browser save. Older saves keep glasses, facial hair and bags and map clothing and hairstyles to their closest available equivalents. [Character editor](../dist/character.html)

## Bodies and clothing

The body builder fits MakeHuman’s textured mesh and garments to each design, then binds them to the game’s animation skeleton. The editor reads its proportions and wardrobe options from the same catalog as the player. [Body builder](../dist/human.js) · [Design fields](../dist/human-designs.js)

Each pedestrian gets a seeded cast member, a height and outfit colours. That identity stays with them at the window, at the table and on their return to the sidewalk. Employees use the same cast and wear colours for their trade. The worker builds near and distant versions of the same clothes and hair, and bakes animations for that member’s proportions. [Cast](../dist/human-cast.js) · [Crowd renderer](../dist/people-figures.js)

### Archive collection

In the character editor, open **Clothes → Outfit** to try one of 24 looks. The 25 new pieces also appear in the individual top, bottom and shoe selectors. Each look sets the garments and their dyes, so a player can start with a complete outfit and change a single piece. Adults on the street wear a selection of the casual, business and athletic looks. [In-game lookbook](archive-fashion-lookbook.jpg) · [Outfits](../dist/fashion.js)

Press **G** on the sales floor of a clothing or department store carrying the collection to try on pieces in the mirror. Purchased garments can be worn again from the store catalog. [Shop stock](../dist/shop-stock.js)

The collection starts from MakeHuman’s CC0 garment meshes. The game adds longer and asymmetric hems, trouser flares, coordinated dyes, chalk stripes, repair stitching and two original screen prints.

| Garment blocks | Contributors | Source |
| --- | --- | --- |
| Tees, polo, cable sweater, camisole and halter | Elvaerwyn, Joel Palmius, namuhekam and Margaret Toigo | [Shirts 01](https://static.makehumancommunity.org/assets/assetpacks/shirts01.html) |
| Cargos, denim shorts, gathered trousers and wool trousers | Cortu and Margaret Toigo | [Pants 01](https://static.makehumancommunity.org/assets/assetpacks/pants01.html) |
| Full, tiered and mini skirts | Margaret Toigo and frankyaye | [Skirts 01](https://static.makehumancommunity.org/assets/assetpacks/skirts01.html) |
| Boots and ballet flats | culturalibre and Margaret Toigo | [Shoes 01](https://static.makehumancommunity.org/assets/assetpacks/shoes01.html) |
| Tailored jacket | MakeHuman system artists | [System assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) |

The shipped meshes and textures work offline. To rebuild them, fetch the four community archives with `node game/scripts/fetch-fashion.mjs`, then run `node game/scripts/build-human.mjs` with the base MakeHuman sources installed. Each piece records its mesh source, silhouette adjustments, fabric and artwork in the collection recipe. [Collection recipe](../data/fashion-pieces.json) · [Print artwork](../data/archive-prints.svg)

### The archive hundred

One hundred pieces of archival fashion can be bought and worn: the Raf Simons Riot bomber, Helmut Lang's bondage parka, Dior Homme's waxed denim, Rick Owens' Geobaskets, Margiela's Tabi boots and the rest of the list. Each is cut and painted from a recipe written against photographs of the real garment, and priced at what an original sells for now. [Recipe language](archive-wardrobe.md) · [Recipes](../data/archive-collection/) · [Catalogue](../dist/archive-collection.js)

A house's own shop on the map sells that house's pieces (Rick Owens, Maison Margiela, Yohji Yamamoto, Issey Miyake, Prada, Gucci, Dior, Saint Laurent, Balenciaga, BAPE, Stone Island, Supreme). Dover Street Market, Atelier New York and Opening Ceremony carry the designers they are known for, and Barneys, Bergdorf Goodman and Saks add theirs to the usual floor. The RealReal has all hundred. Tokio 7, What Goes Around Comes Around and Procell have twenty-six each up to $12,000, and any shop with "vintage", "consignment" or "resale" in its name has twelve finds under $1,500, the same twelve each visit. Flight Club and Stadium Goods have the sneakers. [Shops](../dist/archive-stock.js)

The garments are not MakeHuman's. They are cut from the two helper meshes the body carries, its tights and its long skirt, so they fit every build, and each says for itself which bones move it. An archive piece keeps its own colours whatever dye the wearer last chose. The shoes are reshaped wardrobe boots, and the nylon backpack is built with the other bags. [Tailor](../scripts/garment-shells.mjs) · [Painter](../scripts/garment-paint.mjs)

The foot stays flat in the game, so a heeled shoe (the Kiss boots, the Armadillos) stands on a platform with its arch cut out.

## Movement

The walk has a planted stance, heel strike and toe-off. Speed and leg length set cadence. Holding **Shift** blends through the jog into the sprint. [Animation and retargeting](../dist/body-motion.js)

| Recorded (Quaternius, Universal Animation Library, CC0) | Written by hand here ([`body-moves.js`](../dist/body-moves.js)) |
| --- | --- |
| idle, walk, jog, sprint, jump (start, hang, land), jab, cross, roll, hit to chest and head, death, driving, sitting, talking, crouching, pushing, reaching, picking up, dancing, pistol aim, shot and reload | guard, kick, fall, vault, climb, car door, getting in and out, carjack, thrown from a car, break-in, hands up, cower, flinch, knocked down, lying, getting up, stumble, kneel, cuffed, cuffing |

A written movement is a few poses in plain angles: `thigh_r: ['x', -92]` lifts the right thigh to the front. To add one, write its poses, pick it in the character page's movement list, and look at it.

Furniture uses five poses in the character page’s movement list. `seatChair` sits upright, `seatBench` lets one leg stretch forward, and `seatBooth` keeps the feet closer under the table. `seatLounge` settles back into a deeper cushion. `seatStool` tucks the feet toward the footrest. Each seat supplies its surface height and facing direction. Press **E** at a free seat to turn and sit down. Press **E** again, even partway down, to rise back into the aisle.

## What the player can do

**Space** jumps with the player’s current momentum. Press it facing a reachable ledge or a slow car to climb. A running approach vaults a low car along a gravity-driven arc. The hands reach for the edge and the feet finish at the height of the roof or landing surface. **F** or a click punches, and **Q** kicks. [Traversal](../dist/player-moves.js)

Getting into a car takes as long as the movement does. One the player has driven is just opened. About half the cars left at the kerb are locked, the same ones each time, and an elbow goes through the window (half a star). One with somebody driving it has the driver hauled out and thrown down, who then gets up and runs (a star, and the street takes fright).

The saved player sits in the driver’s seat with their hands on the wheel. Traffic drivers keep their face and clothes when they leave the car.

## What the street does

Pedestrians spread along a sidewalk when a block loads. In a moving crowd they follow the pace of the person ahead. At a scaffold or other obstruction they look for an opening and return to their walking line after passing it. If the opening only fits one person across, one direction waits to the side until the other group clears the exit. Pedestrians turn back when the pavement is closed across its whole width.

The city model includes fictional New Yorkers experiencing unsheltered homelessness. NYC’s March 10, 2026 HOPE survey estimated 3,560 people in surface areas that night, with 2,104 in Manhattan, 559 in Brooklyn, 457 in Queens, 430 in the Bronx and 10 on Staten Island. DHS counted another 1,431 people in subway areas separately. [NYC DHS HOPE results, slide 6](https://www.nyc.gov/assets/dhs/downloads/pdf/hope/hope-2026-results.pdf)

The game distributes those surface estimates across land in each borough. Individual locations are fictional. Nearby residents appear on an available sidewalk within 60 metres of their starting site, subject to the local crowd limit. They use the same clothing and walking system as other pedestrians. Some pause along the inside edge of the sidewalk before continuing. Press **G** near a pedestrian and choose **Say hello** to talk.

Punches, running collisions and moving cars transfer momentum on contact. A light hit produces a stagger. A heavy hit can throw the person airborne, turn them onto their back and slide them along the street. A surviving character starts getting up once grounded and nearly still. The limbs follow fitted animation poses during the simulated fall. [Impact simulation](../dist/character-physics.js)

Cups and trays follow the fitted palm through turns and seating transitions. A nearby officer facing the player can raise their pistol during an arrest. The officer who moves in to cuff them frees both hands.

## Rebuild

```sh
node scripts/build-human.mjs       # the figure and its wardrobe; needs MakeHuman under assets-src/makehuman/
node scripts/build-motion.mjs      # needs the library unpacked under assets-src/characters/
node --test tests/people.test.js
```
