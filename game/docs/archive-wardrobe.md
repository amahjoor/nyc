# Archive wardrobe

The archive collection is five hundred pieces of archival fashion, each cut and painted from a recipe. A recipe is plain data: how the garment is cut, and what is laid on its cloth. The build turns it into a mesh that fits every body in the game and a picture of its surface.

- Recipes: [`data/archive-collection/`](../data/archive-collection/), one file per chapter, each an array of pieces. `01` to `05`, `footwear` and `accessories` are the first hundred; `06` to `25` are pieces 101 to 500, twenty to a chapter, a house or a group of houses each, with their shoes and accessories among them.
- Drawings for prints and patches: [`data/archive-prints/`](../data/archive-prints/), one SVG each.
- The tailor: [`scripts/garment-shells.mjs`](../scripts/garment-shells.mjs). The painter: [`scripts/garment-paint.mjs`](../scripts/garment-paint.mjs).
- `node scripts/build-human.mjs` builds everything into `dist/human/`.

The first hundred ship with the figure, in `dist/human/parts.bin`. Each later chapter has a bin of its own, `dist/human/archive/<chapter>.bin`, which the game fetches when one of its pieces is first put on (`human.ready(wear)` in [`dist/human.js`](../dist/human.js)): a piece numbered above 100 is given its chapter's `bin` by the build, and nothing in a recipe says so.

## A piece

```json
{
 "n": 1, "id": "raf-riot-camo-bomber",
 "designer": "Raf Simons", "name": "Riot! Riot! Riot! Camo Bomber", "season": "FW2001", "price": 30000,
 "slot": "top", "colour": "#56643c", "finish": {"roughness": 0.62},
 "cut": {"like": "bomber", "hem": "hip+0.02", "ease": {"chest": 0.05}},
 "paint": [{"step": "fabric", "type": "nylon"}, {"step": "pattern", "type": "woodland", "colours": ["#5a4630", "#b3a877", "#1c1e19"]}]
}
```

| Field | Meaning |
| --- | --- |
| `n` | Its number in the list. |
| `id` | Lower case and hyphens, at most 48 characters, never ending in a digit. Starts with the designer: `raf-`, `hl-`, `dior-`, `nn-`, `uc-`, `ro-`, `mmm-`, `yohji-`, `cdg-`, `junya-`, `issey-`, `ccp-`, `guidi-`, `ad-`, `julius-`, `bbs-`, `jpg-`, `vw-`, `mcq-`, `chalayan-`, `jil-`, `ysl-`, `gucci-`, `prada-`, `si-`, `cp-`, `kapital-`, `visvim-`, `bape-`, `supreme-`, `givenchy-`, `balenciaga-`, `cg-`, `miumiu-`, `ch-` (Chrome Hearts). |
| `designer`, `name`, `season` | As shown in the game. `season` is the corrected one. |
| `price` | US dollars: what an original in good condition sells for now. |
| `slot` | `top`, `bottom`, `shoes` or `bag`. A coat, a vest and a dress are tops. A `bag` is anything worn in the bag's place (below). |
| `colour` | The main cloth's colour. The player's dye starts from it. |
| `finish` | How it takes the light: `roughness` (0.35 patent leather, 0.45 leather and waxed cotton, 0.6 nylon, 0.85 cotton, 0.95 wool) and `metalness` (0 for cloth, 0.5 to 0.8 for reflective or metallic cloth). |
| `cut` | How it is cut (below). |
| `paint` | What is laid on it, in order (below). |
| `under` | A second garment worn under it and sold with it: `{ "cut", "colour", "paint" }`. The shirt in a blazer, the tee under a vest. Give it `"overWaist": false` in its cut and a hem above the outer one. |
| `with` | For a suit: the `id` of the trousers sold with the jacket. The trousers are a piece of their own with `"part": true` and no price. |
| `sheer` | `true` for net and gauze: the picture's own transparency shows the skin through. |
| `note` | One line on what was approximated. |
| `refs` | The pages whose photographs it was designed from. |

## Measures

Everything is in metres, on a body 1.67 m tall standing with its arms by its sides.

**Heights** are above the floor, as a number or a landmark with offsets: `"hip-0.04"`, `"knee"`, `"hem+0.06"`, `"chest+0.02-0.05"`.

| Landmark | Height | Landmark | Height |
| --- | --- | --- | --- |
| `ankle` | 0.07 | `chest` | 1.21 |
| `calf` | 0.26 | `armpit` | 1.26 |
| `knee` | 0.45 | `shoulder` | 1.34 |
| `thigh` | 0.66 | `neck` | 1.41 |
| `crotch` | 0.77 | `collar` | 1.43 |
| `hip` | 0.87 | `wrist` | 1.06 (arm as modelled) |
| `waist` | 1.00 | `hem`, `top` | the garment's own lowest and highest points |

**Across** (`x`) is from the middle of the body toward the wearer's left. Seen from the front, positive is on the viewer's right. The chest is about 0.17 either side, a breast pocket sits at `x` 0.09.

## Cut

Start from the fit the garment is `like` and change what differs.

| Tops | | Bottoms | |
| --- | --- | --- | --- |
| `tee`, `longsleeve`, `tight`, `tank` | jersey | `slim` | skinny jeans |
| `sweatshirt`, `hoodie`, `knit` | ribbed hem and cuffs | `straight` | regular jeans and trousers |
| `shirt` | fold collar, curved hem | `wide` | wide and flared legs, hakama |
| `blazer` | deep V (give it an `under` shirt) | `cargo` | roomy straight |
| `bomber` | blouson with ribbed hem | `dropcrotch` | lowered seat, tapered |
| `biker`, `trucker` | short fitted jackets | `shorts` | to the knee |
| `parka`, `coat` | long, hung from the chest | `skirt` | from the long skirt, flared |
| `vest`, `dress` | sleeveless | | |

### Tops

| Key | Meaning | Typical |
| --- | --- | --- |
| `hem` | Height of the hem. Below `crotch+0.02` the garment has a skirt (a coat, a parka, a dress). | `hip+0.05` cropped, `hip-0.03` tee, `thigh+0.04` parka, `knee` coat, `calf` long coat |
| `hemBack` | How much lower the hem is at the back (a fishtail). | 0.1 |
| `hemCurve` | How much lower at centre front and back than at the sides (a shirt tail). | 0.04 |
| `hemSlant` | How much lower toward the wearer's left, per 0.2 m (an asymmetric hem). | 0.05 |
| `sleeve` | Where the sleeve ends: 0 none, 0.3 short, 0.55 elbow, 0.78 three-quarter, 1 wrist. | |
| `armhole` | For sleeveless tops, how far onto the shoulder the cloth reaches: 0.2 a narrow strap, 0.32 a vest, 0.45 a cap. A garment with a skirt cannot go below 0.2. | |
| `neck` | `{ y, depth, v, width, round }`: `y` raises or lowers the neckline, `depth` is how much lower in front, `v` how deep a V goes below that and `width` how wide the V is at the top, `round` how wide the opening is. | crew `depth` 0.03, scoop `depth` 0.09, V `v` 0.12, blazer `v` 0.22, boat `round` 0.11 |
| `ease` | How far the cloth stands off the body at the `shoulder`, `chest`, `waist`, `hip`, `hem`, `sleeve` and `cuff`. | tee 0.02, sweatshirt 0.04 to 0.055, oversized 0.06 to 0.1; sleeves 0.01 to 0.03 |
| `hang` | 0 follows the body, 1 hangs plumb from the chest. | 0.5 tee, 1 coat |
| `hug` | 1 for something skin-tight (a mesh top). | |
| `chest` | How flat it lies across the chest (0 shows the body, 0.85 by default). | |
| `cinch`, `rib` | How much a ribbed hem gathers the body, and how tall the rib is. | 0.12 to 0.25, 0.06 |
| `cuffCinch` | How much a ribbed cuff gathers the sleeve. | 0.15 to 0.3 |
| `waist` | How much it is taken in at the waist (tailoring). | 0.04 |
| `flare` | How much wider the hem is than the hips (an A-line). | 0.06 |
| `tube` | How far the sleeve keeps its width from the upper arm down (0 follows the arm, 1 a straight tube). | 0.8 |
| `sleeveFlare` | Wider toward the cuff (a bell or pirate sleeve). | 0.3 |
| `shoulderDrop` | A shoulder seam that falls past the shoulder. | 0.02 |
| `bumps` | Padded swellings: `[x, height, 1 front or -1 back, how wide, how far out]`. | |
| `subdivide` | 1 gives four times the points, for shapes that need them. Use sparingly. | 0 |
| `relax` | How much the finished shape is let settle. | 3 |

### Bottoms

| Key | Meaning | Typical |
| --- | --- | --- |
| `rise` | Height of the waistband. `riseBack` raises the back. | `waist-0.09` regular, `waist-0.16` low, `hip-0.03` bumster |
| `hem` | Height of the hem. | `ankle-0.01`, `calf`, `knee+0.02` |
| `ease` | Room at the `waist`, `seat`, `thigh`, `knee`, `hem`. Keep `waist` at 0.002. | slim 0.008, straight 0.02, wide 0.05 |
| `straight` | 0 follows the leg in and out, 1 falls straight from the thigh. | |
| `flare`, `taper` | Wider or narrower toward the hem. | 0.2 |
| `dropCrotch` | How far the seat hangs below the body. | 0.12 |
| `overBoot` | The leg covers a boot's shaft. Set `false` for cropped or tucked legs. | true |

A `skirt` takes `rise`, `hem`, `flare`, `ease { waist, hip, hem }`, `tiers` (hard steps outward: `[[height, how far], ...]`) and `round` (0 to 1, how nearly a circle).

### What is added (`add`)

What a garment adds joins what its fit already has. Put `"only": true` on one item to have just the garment's own.

| Type | Meaning |
| --- | --- |
| `collar` | `{ style, height, flare, gap, points }`. No style is a standing band (a rib collar, a mandarin); `fold` turns over and lies down (a shirt, a biker, a coat); `funnel` is tall. `gap` parts it at the throat by that width; `points` (0.3 to 1) lengthens it toward the front. |
| `hood` | `{ size, drop }`. A hood lying down the back: `drop` is how far it hangs. |
| `lip` | The hem and cuffs turned inside, so that they have thickness. Painted as zone `lining`. |
| `cuff` | `{ length, flare }`. The sleeve carried on past the wrist, over the hand. |
| `hem` | `{ length, flare, out, zone }`. A band hung below the hem: a second layer showing, a frill. `zone` names it for painting (`lining`, or `body`). |
| `strap` | `{ from, to, width, sag, out }`. A strap between two places, hanging between them: `from` and `to` are `{ "on": "front" or "back", "x", "h" }`. It stretches when the legs part. |
| `tail` | `{ from, length, width, lean }`. A strap, tie or drawcord hanging from one place. |

## Paint

Steps are laid one over another in order. The first is nearly always the cloth.

### Where a step applies (`where`)

Any step that fills an area takes a `where`. Every key given must hold.

| Key | Meaning |
| --- | --- |
| `zone` | `front`, `back`, `sleeveL`, `sleeveR`, `legL`, `legR`, `collar`, `hood`, `lining`, `strap`, or a group: `body` (front and back), `torso` (body, collar and hood), `sleeves`, `legs`, `trim`. A list takes any of them. |
| `not` | Zones left out. |
| `h` | `[low, high]` heights. |
| `x` | `[from, to]` across, signed. `ax` is the same either side of the middle. |
| `s` | `[from, to]` along a limb: 0 at the shoulder or hip, 1 at the wrist or ankle. |
| `ang` | `[from, to]` round a limb in radians: 0 the outside, positive toward the front, ±3.14 the inside. |
| `front` | `true` or `false`: the front or back half. |
| `side` | `"l"` or `"r"`: the wearer's left or right. |

### Frames

Steps that draw a thing (`line`, `rect`, `dots`, `print`, `laces`) place it in a frame.

| Frame | Its two measures |
| --- | --- |
| `front`, `back` | `[x, height]`. On the back, positive `x` is still the viewer's right. Works on trousers too. |
| `sleeves`, `sleeveL`, `sleeveR`, `legs`, `legL`, `legR` | `[metres round the limb toward the front, how far along it from 0 to 1]`. `[0, 0.3]` is the outside of the upper arm. `sleeves` and `legs` draw on both. |
| `hood` | `[x, height]` on the hood as it lies down the back. |
| `collar`, `strap` | `[metres round, metres up]` on that part alone. |

### Steps

**`fabric`** `{ type, colour, colour2, scale, where }` The cloth. Types: `plain` (shirting), `jersey` (tees), `marl` (grey sweatshirt fleece), `knit` (with `gauge`, default 0.0042), `wool`, `tweed`, `denim` (`colour2` is the faded shade), `canvas`, `waxed`, `leather`, `nylon`, `ripstop`, `satin`, `velvet`, `fur`, `mesh` (set `sheer` on the piece), `rubber`, `wood`.

**`pattern`** `{ type, colours, scale, amount, where }` Over the cloth. `scale` enlarges it.
- Camouflage: `woodland` (brown, sand, black on the cloth's green), `camo` (soft blotches, any colours), `tiger`.
- Woven: `tartan` (`period`, and `sett`: `[[offset, width, which colour], ...]`), `stripes` (`period`, `width`, `dir` `h`, `v` or `d`), `pinstripe`, `check`, `gingham`, `houndstooth`, `herringbone`, `argyle`.
- Printed: `floral` (`size`; two petal colours, a centre, a leaf), `leopard` (spot, centre), `snake`, `dots`, `opart`, `swirl`, `tiedye`, `marble` (vein, fine vein, cloud), `clouds`.
- Worked: `patchwork` and `boro` (`size`, `stitch`; scraps in the colours given), `tapestry`, `feathers`, `scales`, `lace`, `web` (`at`, `spokes`, `size`, `width`), `bleach` (bleached blotches), `splatter` (`size`, `density`; thrown paint), `speckle`.

**`panel`** `{ colour, where, amount, keepShade }` A block of another colour: a sleeve, a yoke, a hem band. `keepShade` 1 keeps the weave showing through.

**`gradient`** `{ from: [height, colour], to: [height, colour], where }` One colour running into another.

**`rib`** `{ where, gauge, depth, colour, dir }` Knitted ribbing: on hems `{ "zone": "body", "h": ["hem", "hem+0.06"] }`, on cuffs `{ "zone": "sleeves", "s": [0.88, 1.2] }`, on collars `{ "zone": "collar" }`. A large `gauge` (0.012) makes pleats.

**`quilt`** `{ type, size, size2, puff, colour, where }` Stitched padding that catches the light: `h` rows (a puffer), `v` channels, `diamond`, or boxes of `size` by `size2`. `puff` 0.004 to 0.008.

**`line`** `{ frame, pts, style, width, colour, colour2, mirror }` A line through points. `mirror` draws it both sides of the middle.
- `seam` a joined edge; `stitch` one row of stitches; `twin` two rows (`gap`); `groove` a fold or dart; `ridge` piping.
- `zip` teeth (`colour`) on a tape (`colour2`); `width` 0.004.
- `tape` a flat band (a taped seam, a stripe); `strap` webbing with a woven face; `width` is the band's.
- `paint` a painted stroke (`opacity`, `dry`).

**`rect`** `{ frame, at, size, style, colour, stitch, rot, mirror, round }` A rectangle centred at `at`.
- `patch` sewn on in its own `colour`; `label` the same without stitching.
- `pocket` a patch pocket; `flap` a pocket flap (`flap` is how much of it is flap, `snap`, `pleat`); `welt` a slit; `zip` a zipped opening.
- `buckle` a metal frame and bar; `window` a clear panel; `fill` flat colour; `hole` worn through with threads across.

**`dots`** `{ frame, pts or from/to/count, r, style, colour, mirror }` `button`, `snap`, `stud` or `eyelet`.

**`laces`** `{ frame, from, to, rows, width, colour, eyelets }` Lacing between two points.

**`print`** `{ frame, art, at, width, opacity, rot, crack, raise, mirror, where }` The drawing `data/archive-prints/<art>.svg`, `width` metres wide, centred at `at`. `crack` (0 to 1) breaks the ink like an old screen print; `raise` 0.0007 makes it a sewn patch.

**`cut`** `{ where, arch }` Removes cloth, on a piece marked `"clear": true`.

**`distress`** `{ type, amount, colour, where }` `fade` and `whisker` (with `frame`, `at`, `size`, `mirror`: knees, thighs, the lap), `wash`, `edges`, `grime`, `crackle`, `holes` (`size`, `density`), `pill`, `folds` (`freq`, `depth`: long folds in hanging cloth), `crumple`, `shade` (a little darker toward the hem).

### Drawings

One SVG per graphic, named for its piece: `raf-riot-portrait.svg`. Draw on a transparent ground unless the graphic is itself a patch. Any `viewBox`; the step's `width` sets its size on the garment. Fonts on the build machine: Liberation Sans, Liberation Serif, Liberation Mono, Nimbus Sans, Nimbus Sans Narrow, Nimbus Roman, C059 (a Century). Filters (`feGaussianBlur`), gradients and patterns work. Text under about 6 mm tall on the garment will not read.

## Shoes, bags and what else is worn

A shoe is not cut: it is one of the wardrobe's boots or shoes, reshaped and painted. Its recipe names the mesh (`pack`, `source`) in place of a `cut`, and may `shape` it.

| Mesh | What it is |
| --- | --- |
| `shoes01` / `toigo_ankle_boots_male` | a plain ankle boot: Chelsea and zip boots, high-top sneakers |
| `shoes01` / `culturalibre_heroine_boots_3` | a plain boot to the calf |
| `shoes01` / `toigo_ankle_boots_female` | a low bootie: low sneakers and moccasins |

| Shape step | Meaning |
| --- | --- |
| `platform` `{ height, from }` | Lifts everything above `from` (metres above the ground), thickening the sole. |
| `arch` `{ from, to, depth }` | Cuts the sole away under the instep (from and to are shares of the shoe's length from the heel), leaving a heel and a forefoot. |
| `shaft` `{ add, from, flare }` | Draws the leg of the boot up. |
| `wide` `{ by, below }` | Broadens the shoe. |
| `toe` `{ square, point, bulb, split, from }` | Squares, points, swells or cleaves the toe. |
| `tongue` `{ up, out }` | Stands the tongue of a high top above its collar. |

The foot stays flat in the game, so a heel is a platform with its arch cut out. A shoe hides the foot inside it, so nothing of its upper can be cut away: a flat, a pump or a sandal is painted with the sock it is shown with (the Tabi flats, the Christo sandals).

Paint works as on a garment, with a shoe's own measures: `h` is metres above the ground, `ft` is the share of its length from the heel (0) to the toe (1), `fx` is metres toward the outside of the foot and `afx` the same either way, and `face` picks a side (`outer`, `inner`, `side`, `front`, `back`, `top`). Frames: `sides`, `outer`, `inner` and `shaft` are `[metres from the heel, height]`; `toe` and `heel` are `[toward the outside, height]`; `vamp` is `[toward the outside, metres from the heel]`, seen from above. `laces` draws lacing between two points of a frame. `cut` removes cloth where its `where` says, or under an `arch: [from, to, height]`, on a piece marked `"clear": true`.

What is neither cut nor a shoe is not a mesh from a recipe: the bags, the Buffalo hat, the antler headpiece, the necklaces and the rings. Each is an entry with `"slot": "bag"` and a `bag` name and no `cut` or `paint`, and is built from plain shapes on the wearer's own measurements: the nylon backpack in [`dist/human-accessories.js`](../dist/human-accessories.js), the rest in [`dist/archive-accessories.js`](../dist/archive-accessories.js), under that name. They are worn in the bag's place, one at a time. A new one needs its builder there and its entry here; the wardrobe takes its name from the catalogue.

## Looking at a piece

The game's tests never draw a garment, so each piece is looked at on a bench: a private build and a headless browser with the GPU.

```sh
lab=~/.cache/nyc-park/fashion-lab
$lab/lab.sh setup 3                                             # once: bench 3, its folder and server
$lab/lab.sh build 3 data/archive-collection/03-dark.json ro-stooges-leather   # cut all, paint that one
$lab/lab.sh shot 3 $lab/shots-3/ro-stooges-leather.jpg ro-stooges-leather     # nine views of it
$lab/lab.sh sheet 3 $lab/shots-3/all.jpg id-one,id-two,id-three               # front and back of many
```

`build` without ids paints every piece in the file (about ten seconds each).

Shoes are not cut by the bench: they are built by `node scripts/build-human.mjs --out <bench folder> --only <ids>` (with `ARCHIVE_ONLY=<chapters>` to leave the rest out). A long tight dress worn over trousers lets them through: give it `hang` near 1 and room at the hip and hem.

## Writing many pieces

Chapters `06` to `25` were written by scripts, a chapter each, from a small library of constructors and kits (the seams and pockets a trucker jacket has, a hoodie's pouch and cords, a five-pocket jean). They are kept with the bench, not here: `gen.py` and `ch06.py` to `ch25.py`, `shoes.py` and `acc.py` in the bench folder. Running one rewrites its pieces in the chapter file and its drawings in `data/archive-prints/`; the JSON is what the build reads. These four hundred were designed from knowledge of the garments, not from photographs laid beside each render as the first hundred were, and their prices are estimates.
