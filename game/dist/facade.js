// Facades for the surveyed building volumes.
//
// The city survey gives every building's true massing but no walls worth
// looking at. This module dresses those walls: it picks a New York building
// type from each volume's height, footprint and neighbourhood, lays window
// bays out along every wall so they meet its corners cleanly, and shades the
// result in the fragment stage. Window openings, brick, cornices, shop fronts
// and fire escapes are drawn there, not modelled, so a million buildings cost
// no extra triangles. Shapes stay surveyed; the dressing is an interpretation.

import { lotStyle } from './lots.js';

export const MATERIAL = { BRICK: 0, STONE: 1, CONCRETE: 2, GLASS: 3, IRON: 4, BROWNSTONE: 5, SIDING: 6 };

const srgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { const v = c / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
};

// Dimensions in metres. Fractions are of one bay or one storey.
//   bay/floor/ground  nominal bay width, storey height, ground-storey height (0 = none)
//   window            [width fraction, height fraction, sill fraction, recess depth]
//   cornice           height of the band closing the top of each wall
//   piers             1 = continuous vertical piers with dark spandrels between windows
//   belt              height of a trim course at every floor line
//   lit/warm          share of windows lit after dark, and how warm that light is
//   glass             [reflectivity, roughness] of the glazing
//   shops/escapes     chance of a shop front at street level / of fire escapes
//   palettes          four of [wall, trim, glass]
export const STYLES = [
  { id: 'house', material: MATERIAL.SIDING, bay: 3.3, floor: 2.9, ground: 0, window: [.34, .5, .28, .09], cornice: .22, piers: 0, belt: 0, lit: .5, warm: .9, glass: [.3, .1], shops: 0, escapes: 0,
    palettes: [['#d9d5cb', '#f1eee6', '#3e4a52'], ['#c5bba6', '#ece6d8', '#3c4850'], ['#a3aeb5', '#e8e8e4', '#394750'], ['#8c5a47', '#d8d0c0', '#3a4348']] },
  { id: 'rowhouse', material: MATERIAL.BROWNSTONE, bay: 2.15, floor: 3.35, ground: 0, window: [.42, .62, .2, .2], cornice: .75, piers: 0, belt: 0, lit: .46, warm: .92, glass: [.3, .09], shops: .08, escapes: 0,
    palettes: [['#6a4a3c', '#59392c', '#37444b'], ['#7c5a48', '#4a332a', '#36434a'], ['#8f4a3a', '#d9cfbd', '#37444b'], ['#c8bca4', '#8a8273', '#394850']] },
  { id: 'tenement', material: MATERIAL.BRICK, bay: 2.3, floor: 3.05, ground: 3.9, window: [.4, .58, .24, .19], cornice: .95, piers: 0, belt: 0, lit: .43, warm: .85, glass: [.3, .1], shops: .62, escapes: .72,
    palettes: [['#8a4b3a', '#d2c9b6', '#35424a'], ['#70433a', '#3d2b26', '#34414a'], ['#b79a78', '#e0d8c6', '#394852'], ['#9c9a94', '#dfdcd3', '#36444c']] },
  { id: 'prewar', material: MATERIAL.BRICK, bay: 2.7, floor: 3.1, ground: 4.4, window: [.42, .56, .25, .21], cornice: 1.25, piers: 0, belt: 0, lit: .4, warm: .86, glass: [.32, .09], shops: .3, escapes: .12,
    palettes: [['#8c5644', '#d6cebb', '#34424a'], ['#b39a79', '#ded6c3', '#37454e'], ['#74483c', '#cbc2ae', '#33414a'], ['#c3b79f', '#e3dccb', '#39474f']] },
  { id: 'loft', material: MATERIAL.IRON, bay: 2.9, floor: 4.15, ground: 4.9, window: [.7, .72, .13, .27], cornice: 1.35, piers: 0, belt: .3, lit: .32, warm: .7, glass: [.34, .08], shops: .85, escapes: .5,
    palettes: [['#d6d0be', '#ebe6d8', '#33434a'], ['#b9beba', '#d7dad5', '#34444b'], ['#8d4f3f', '#cfc6b3', '#35434b'], ['#a2a9a5', '#c9cdc8', '#32424a']] },
  { id: 'postwar', material: MATERIAL.BRICK, bay: 3.3, floor: 2.85, ground: 3.6, window: [.56, .5, .3, .11], cornice: .32, piers: 0, belt: 0, lit: .38, warm: .82, glass: [.36, .08], shops: .28, escapes: 0,
    palettes: [['#d6d1c4', '#bfbab0', '#3a4a54'], ['#bfa888', '#d8cfbd', '#3a4852'], ['#93523f', '#cfc7b6', '#37464f'], ['#a7a39b', '#d2cfc7', '#3a4952']] },
  { id: 'deco', material: MATERIAL.STONE, bay: 1.8, floor: 3.6, ground: 5.6, window: [.5, .58, .26, .3], cornice: .85, piers: 1, belt: 0, lit: .34, warm: .6, glass: [.36, .08], shops: .5, escapes: 0,
    palettes: [['#cfc6b1', '#6f6a5e', '#33424a'], ['#bcae92', '#5d5347', '#34424a'], ['#a9a79f', '#55585a', '#32424b'], ['#9c6e55', '#4c3a31', '#33414a']] },
  { id: 'curtain', material: MATERIAL.GLASS, bay: 1.5, floor: 3.9, ground: 6, window: [.94, .72, .28, .03], cornice: .5, piers: 0, belt: 0, lit: .5, warm: .28, glass: [.9, .05], shops: 0, escapes: 0,
    palettes: [['#5e7f93', '#aeb6b9', '#6f95ab'], ['#557c7a', '#a7b0ae', '#62918d'], ['#77838c', '#b9bec0', '#8b99a3'], ['#28333b', '#6d7477', '#3a4a55']] },
  { id: 'slab', material: MATERIAL.GLASS, bay: 1.45, floor: 3.65, ground: 5.4, window: [.84, .6, .4, .1], cornice: .4, piers: 0, belt: 0, lit: .46, warm: .36, glass: [.72, .07], shops: 0, escapes: 0,
    palettes: [['#4a3c2e', '#5b4a38', '#7b664f'], ['#22282b', '#34393c', '#3f4b52'], ['#4d6a5c', '#8b948e', '#5f8573'], ['#8a8f8f', '#c9ccca', '#6c7f8c']] },
  { id: 'supertall', material: MATERIAL.GLASS, bay: 1.5, floor: 4.1, ground: 7, window: [.97, .8, .2, .02], cornice: .3, piers: 0, belt: 0, lit: .3, warm: .3, glass: [.95, .04], shops: 0, escapes: 0,
    palettes: [['#6a8ca3', '#b6bdc0', '#7ea2b8'], ['#8a97a2', '#c2c7c9', '#9aa9b4'], ['#4f7c86', '#a9b3b3', '#5f96a0'], ['#2f3d48', '#7f878b', '#465b6a']] },
  { id: 'industrial', material: MATERIAL.BRICK, bay: 5.4, floor: 5, ground: 0, window: [.3, .3, .55, .1], cornice: .3, piers: 0, belt: 0, lit: .08, warm: .5, glass: [.25, .14], shops: 0, escapes: 0,
    palettes: [['#7f4a3c', '#b3aa98', '#3b4649'], ['#9a968e', '#c4c0b7', '#3b4649'], ['#b7ad98', '#d2cbb9', '#3c474b'], ['#6d7175', '#a9adaf', '#39464a']] },
  { id: 'projects', material: MATERIAL.BRICK, bay: 3.1, floor: 2.75, ground: 3, window: [.36, .44, .32, .1], cornice: .2, piers: 0, belt: 0, lit: .45, warm: .88, glass: [.3, .1], shops: 0, escapes: 0,
    palettes: [['#8a4f3e', '#b9b0a0', '#38464d'], ['#7a5142', '#aaa193', '#37454c'], ['#a98d6e', '#cdc5b3', '#3a4850'], ['#93594a', '#bdb4a3', '#38464d']] },
  { id: 'civic', material: MATERIAL.STONE, bay: 4.2, floor: 5.2, ground: 5.5, window: [.38, .66, .16, .35], cornice: 1.6, piers: 0, belt: .35, lit: .14, warm: .8, glass: [.3, .09], shops: 0, escapes: 0,
    palettes: [['#cbc3b0', '#ded8c8', '#33424a'], ['#b5b0a4', '#cfcbc0', '#33424a'], ['#bfb39a', '#d9d1bf', '#34424a'], ['#a8a59d', '#c6c3bb', '#32414a']] },
];
export const STYLE_INDEX = Object.fromEntries(STYLES.map((style, index) => [style.id, index]));

// Flag bits carried per wall in the style attribute's fourth byte.
export const FLAG = { PALETTE: 3, BLANK: 16, SHOP: 32, ESCAPE: 64, SCREENS: 128 };
/** Height in texels of a line of sign lettering in the atlas storefronts.js keeps. */
export const ATLAS_CELL_HEIGHT = 80;
/** Metres per unit of the height byte. */
export const HEIGHT_UNIT = 2.2;

const within = (x, z, cx, cz, radius) => Math.hypot(x - cx, z - cz) < radius;
/** How strongly a point belongs to a business district. Metres from the SoHo origin. */
export function businessDistrict(x, z) {
  const fall = (cx, cz, radius) => Math.max(0, 1 - Math.hypot(x - cx, z - cz) / radius);
  return Math.min(1, Math.max(
    fall(1750, -3950, 2500) * 1.5,   // Midtown
    fall(-450, 1950, 1250) * 1.6,    // Financial District
    fall(1950, 3050, 800) * 1.2,     // Downtown Brooklyn
    fall(4760, -2610, 700) * 1.2,    // Long Island City
  ));
}
/** Cast-iron and masonry loft districts: SoHo, Tribeca, NoHo, Flatiron, the Garment District. */
export function loftDistrict(x, z) {
  return (x > -1000 && x < 950 && z > -1100 && z < 1400) || within(x, z, 1050, -2050, 800) || within(x, z, 900, -3050, 520);
}
/**
 * Times Square: the bowtie where Broadway crosses Seventh Avenue, 42nd to 47th
 * Street, where zoning requires buildings to carry illuminated signs.
 */
export function timesSquare(x, z) {
  // Along the avenues, which run 29 degrees off north, and across them.
  const dx = x - 1362, dz = z + 3862, along = dx * -.485 + dz * .875, across = dx * .875 + dz * .485;
  return Math.abs(along) < 330 && Math.abs(across) < 135;
}
/** Dense attached housing, as opposed to free-standing houses. */
const attachedHousing = (x, z) => within(x, z, 1800, -1500, 9500) || within(x, z, 5200, -13500, 5200);

// When each building was built and what it is, where the city's tax lots say (lots.js). Until it is set, and
// wherever nothing is recorded, a building's facade is chosen from its size and where it stands alone.
let lots = null;
export function setLots(next) { lots = next?.cells ? next : null; }

/**
 * Choose a building type for a surveyed volume.
 * @param {{height:number, area:number, x:number, z:number, random:number, random2:number}} volume
 */
export function chooseStyle({ height, area, x, z, random, random2 }) {
  const business = businessDistrict(x, z), lofts = loftDistrict(x, z), s = STYLE_INDEX;
  const pick = table => {
    const total = table.reduce((sum, entry) => sum + entry[1], 0);
    let cursor = random * total;
    for (const [style, weight] of table) { cursor -= weight; if (cursor <= 0) return style; }
    return table.at(-1)[0];
  };
  let style;
  const lot = lots ? lots.at(x, z) : null;
  // The old loft districts are lofts whatever the assessor now calls them: offices, shops and apartments have moved in.
  const known = lot && lots && lofts && lot.era >= 1 && lot.era <= 3 && lot.use !== 1 && lot.use !== 9 && height >= 12 && height < 62 && random < .78 ? 'loft' : lotStyle(lot, { height, area, random });
  if (known) style = s[known];
  else if (height < 9.5) {
    if (area > 1100) style = s.industrial;
    else if (area > 320 && business + (lofts ? .5 : 0) < .2) style = pick([[s.industrial, 2], [s.house, 1]]);
    else style = attachedHousing(x, z) ? pick([[s.rowhouse, 3], [s.house, 1]]) : s.house;
  } else if (height < 15.5) {
    if (area > 1600) style = pick([[s.industrial, 3], [s.civic, 1]]);
    else if (lofts) style = pick([[s.loft, 3], [s.tenement, 2]]);
    else if (!attachedHousing(x, z)) style = pick([[s.house, 2], [s.rowhouse, 2], [s.tenement, 1]]);
    else style = area < 190 ? pick([[s.rowhouse, 4], [s.tenement, 1]]) : pick([[s.tenement, 3], [s.rowhouse, 1]]);
  } else if (height < 27) {
    if (lofts) style = pick([[s.loft, 5], [s.tenement, 2], [s.prewar, 1]]);
    else if (area > 2600) style = pick([[s.industrial, 2], [s.civic, 2], [s.postwar, 2], [s.loft, 1]]);
    else style = pick([[s.tenement, 6], [s.prewar, 2], [s.projects, business < .2 && area > 500 ? 2 : 0], [s.loft, business > .3 ? 2 : .4]]);
  } else if (height < 62) {
    if (lofts && height < 46) style = pick([[s.loft, 5], [s.prewar, 2], [s.deco, 1], [s.curtain, 1]]);
    else if (business > .35) style = pick([[s.deco, 4], [s.curtain, 3], [s.slab, 2], [s.prewar, 2], [s.loft, 1]]);
    else style = pick([[s.prewar, 5], [s.postwar, 3], [s.projects, area > 500 && area < 1900 ? 2.5 : .3], [s.curtain, 1], [s.civic, area > 3000 ? 2 : 0]]);
  } else if (height < 130) {
    style = business > .3 ? pick([[s.curtain, 4], [s.deco, 3.5], [s.slab, 3]]) : pick([[s.postwar, 5], [s.curtain, 3], [s.prewar, 2], [s.slab, 1]]);
  } else if (height < 215) {
    style = pick([[s.curtain, 5], [s.deco, business > .3 ? 3 : 1], [s.slab, 3], [s.supertall, 1]]);
  } else style = pick([[s.supertall, 6], [s.curtain, 2], [s.deco, height < 330 ? 2.5 : 0]]);
  const definition = STYLES[style];
  let flags = Math.floor(random2 * 4) & FLAG.PALETTE;
  // Derive independent draws from the second number.
  const third = (random2 * 37.719) % 1, fourth = (random2 * 91.337) % 1;
  // Shops line busy streets; quiet residential blocks have few.
  const shopChance = definition.shops * (.45 + .55 * Math.max(business, lofts ? .8 : 0, attachedHousing(x, z) ? .45 : 0));
  if (third < shopChance) flags |= FLAG.SHOP;
  if (timesSquare(x, z)) flags |= FLAG.SCREENS | FLAG.SHOP;
  if (fourth < definition.escapes) flags |= FLAG.ESCAPE;
  return { style, flags };
}

/** A stable 0..1 pair from a survey feature identifier. */
export function featureRandom(id) {
  let h = 2166136261;
  const text = String(id);
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  const a = (h >>> 0) / 4294967296;
  h = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return [a, (h >>> 0) / 4294967296];
}

const WALL_SLOPE = .3;        // |normal.y| below this is a wall
const DIRECTION_BINS = 240;   // 1.5 degrees: walls this close share a bay grid
const centimetres = value => Math.max(0, Math.min(65535, Math.round(value * 100)));

/** Reusable working memory for writeFacade(); grows to the largest tile seen. */
export function createFacadeScratch() { return { along: new Float32Array(0), bins: new Int16Array(0), low: new Float64Array(DIRECTION_BINS), high: new Float64Array(DIRECTION_BINS) }; }

/**
 * Fill the facade attributes for one building.
 *
 * `positions` holds x, height above the building's base, z for each vertex of
 * a triangle soup. Every wall gets a coordinate that runs along it, measured
 * from the end of all the building's walls that face the same way; parallel
 * walls therefore share one bay grid, even across a setback.
 *
 * `choose(area)` picks the building type once the plan area is known.
 * @returns {{area:number, style:number}} plan area of upward-facing surfaces, and the chosen type
 */
export function writeFacade(positions, start, end, { normals, facade, style, heightByte, seedByte, choose, isBlank = null, scratch }) {
  const count = end - start, triangles = count / 3;
  if (scratch.along.length < count) { scratch.along = new Float32Array(count * 2); scratch.bins = new Int16Array(Math.ceil(count * 2 / 3)); }
  const { along, bins, low, high } = scratch;
  low.fill(Infinity); high.fill(-Infinity);
  let first = null, area = 0, cx = 0, cz = 0;
  for (let i = start; i < end; i++) { cx += positions[i * 3]; cz += positions[i * 3 + 2]; }
  cx /= count; cz /= count;
  for (let t = 0; t < triangles; t++) {
    const a = (start + t * 3) * 3, b = a + 3, c = a + 6;
    // The same cross product Three uses, so stored normals match its shading.
    const ux = positions[c] - positions[b], uy = positions[c + 1] - positions[b + 1], uz = positions[c + 2] - positions[b + 2];
    const vx = positions[a] - positions[b], vy = positions[a + 1] - positions[b + 1], vz = positions[a + 2] - positions[b + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length > 1e-12) { nx /= length; ny /= length; nz /= length; } else { nx = 0; ny = 1; nz = 0; }
    const packedX = Math.round(nx * 127), packedY = Math.round(ny * 127), packedZ = Math.round(nz * 127);
    for (let k = 0; k < 3; k++) {
      const o = (start + t * 3 + k) * 4;
      normals[o] = packedX; normals[o + 1] = packedY; normals[o + 2] = packedZ;
    }
    bins[t] = -1;
    if (Math.abs(ny) >= WALL_SLOPE) { if (ny > 0) area += length * ny / 2; continue; }
    const flat = Math.hypot(nx, nz), tx = -nz / flat, tz = nx / flat, angle = Math.atan2(nz, nx);
    // Centre the bins on the first wall. On a rectilinear plan every wall then
    // sits mid-bin, and rounding cannot split one wall between two grids.
    first ??= angle;
    const bin = ((Math.round((angle - first) / (Math.PI * 2) * DIRECTION_BINS) % DIRECTION_BINS) + DIRECTION_BINS) % DIRECTION_BINS;
    bins[t] = bin;
    for (let k = 0; k < 3; k++) {
      const p = a + k * 3, value = (positions[p] - cx) * tx + (positions[p + 2] - cz) * tz;
      along[t * 3 + k] = value;
      if (value < low[bin]) low[bin] = value;
      if (value > high[bin]) high[bin] = value;
    }
  }
  // The plan area is known now, so the building type can be chosen.
  const { style: styleByte, flags } = choose(area);
  for (let t = 0; t < triangles; t++) {
    const base = start + t * 3, bin = bins[t], a = base * 3;
    const top = Math.max(positions[a + 1], positions[a + 4], positions[a + 7]);
    let wallFlags = flags;
    if (bin >= 0 && isBlank) {
      // A wall built against a neighbour is a blank lot-line wall.
      const nx = normals[base * 4] / 127, nz = normals[base * 4 + 2] / 127, flat = Math.hypot(nx, nz) || 1;
      const mx = (positions[a] + positions[a + 3] + positions[a + 6]) / 3, mz = (positions[a + 2] + positions[a + 5] + positions[a + 8]) / 3;
      if (isBlank(mx + nx / flat * .7, mz + nz / flat * .7)) wallFlags |= FLAG.BLANK;
    }
    for (let k = 0; k < 3; k++) {
      const vertex = base + k, o = vertex * 4;
      if (bin >= 0) {
        facade[o] = centimetres(along[t * 3 + k] - low[bin]);
        // Zero length marks a roof, so a real wall is never shorter than a centimetre.
        facade[o + 2] = Math.max(1, centimetres(high[bin] - low[bin]));
        facade[o + 3] = centimetres(top);
      } else { facade[o] = 0; facade[o + 2] = 0; facade[o + 3] = 0; }
      facade[o + 1] = centimetres(positions[vertex * 3 + 1]);
      style[o] = seedByte; style[o + 1] = styleByte; style[o + 2] = heightByte; style[o + 3] = wallFlags;
    }
  }
  return { area, style: styleByte };
}

// --- Shader ---------------------------------------------------------------------
const glslFloat = value => Number.isInteger(value) ? `${value}.0` : String(value);
const glslVec3 = values => `vec3(${values.map(value => value.toFixed(4)).join(', ')})`;
const glslVec4 = values => `vec4(${values.map(glslFloat).join(', ')})`;
const table = (type, name, rows, format) => `const ${type} ${name}[${rows.length}] = ${type}[${rows.length}](\n  ${rows.map(format).join(',\n  ')}\n);`;
const palette = index => STYLES.flatMap(style => style.palettes.map(entry => srgb(entry[index])));

const STYLE_TABLES = [
  `#define NYC_STYLE_COUNT ${STYLES.length}`,
  table('vec4', 'NYC_STYLE_A', STYLES.map(s => [s.bay, s.floor, s.ground, s.material]), glslVec4),
  table('vec4', 'NYC_STYLE_B', STYLES.map(s => s.window), glslVec4),
  table('vec4', 'NYC_STYLE_C', STYLES.map(s => [s.cornice, s.piers, s.belt, s.lit]), glslVec4),
  table('vec4', 'NYC_STYLE_D', STYLES.map(s => [s.warm, s.glass[0], s.glass[1], 0]), glslVec4),
  table('vec3', 'NYC_WALL', palette(0), glslVec3),
  table('vec3', 'NYC_TRIM', palette(1), glslVec3),
  table('vec3', 'NYC_GLASS', palette(2), glslVec3),
].join('\n');

// A wall's length, top and type are the same at all three corners of a
// triangle. They are passed flat: interpolating them reintroduces rounding
// noise, and a bay count that flickers between two values from pixel to pixel.
export const FACADE_VERTEX_PARS = /* glsl */`
attribute vec4 aFacade;
attribute vec4 aStyle;
varying vec2 vFacade;
flat varying vec2 vFacadeWall;
flat varying vec4 vStyle;
`;
/** How far below its measured base each wall is carried, in metres. */
export const FOUNDATION_DEPTH = 12;
export const FACADE_VERTEX = /* glsl */`
vFacade = aFacade.xy * 0.01;
vFacadeWall = aFacade.zw * 0.01;
vStyle = aStyle;
// A building stands on one measured height, and sloping ground rarely meets
// its base along a whole wall. Each wall's foot is carried down as a plain
// foundation, so there is never daylight between a building and the ground.
if ( aFacade.z > 0.5 && aFacade.y < 0.5 ) { transformed.y -= ${glslFloat(FOUNDATION_DEPTH)}; vFacade.y = - ${glslFloat(FOUNDATION_DEPTH)}; }
`;

export const FACADE_FRAGMENT_PARS = /* glsl */`
varying vec2 vFacade;
flat varying vec2 vFacadeWall;
flat varying vec4 vStyle;
// Where in the world the fragment is, for looking up whose shop front this is.
vec3 nycFacadeWorld = vec3( 0.0 );
${STYLE_TABLES}
#define NYC_MAT_BRICK ${MATERIAL.BRICK}
#define NYC_MAT_STONE ${MATERIAL.STONE}
#define NYC_MAT_CONCRETE ${MATERIAL.CONCRETE}
#define NYC_MAT_GLASS ${MATERIAL.GLASS}
#define NYC_MAT_IRON ${MATERIAL.IRON}
#define NYC_MAT_BROWNSTONE ${MATERIAL.BROWNSTONE}
#define NYC_MAT_SIDING ${MATERIAL.SIDING}

struct NycFacade {
	vec3 albedo;
	float roughness;
	float metalness;
	vec3 emissive;
	vec3 lean;      // world-space push on the shading normal
	float sun;      // share of direct sun that reaches the surface
	float shade;    // ambient occlusion from the facade's own relief
};

// Area under a train of unit-period pulses of width 'duty', from 0 to x.
float nycPulseArea( float x, float duty ) { return floor( x ) * duty + min( fract( x ), duty ); }
// Box-filtered pulse train. Exact at any distance: a window grid seen from a
// kilometre away settles to its mean instead of shimmering.
float nycPulse( float x, float start, float duty, float width ) {
	x -= start; width = max( width, 1e-4 );
	return ( nycPulseArea( x + 0.5 * width, duty ) - nycPulseArea( x - 0.5 * width, duty ) ) / width;
}
float nycBox( float x, float low, float high, float width ) {
	width = max( width, 1e-4 );
	return clamp( ( x - low ) / width + 0.5, 0.0, 1.0 ) * clamp( ( high - x ) / width + 0.5, 0.0, 1.0 );
}
float nycLine( float x, float center, float halfWidth, float width ) { return nycBox( x, center - halfWidth, center + halfWidth, width ); }
float nycHash13( vec3 p ) {
	p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 );
	return fract( ( p.x + p.y ) * p.z );
}

// Wall surface between the windows.
vec3 nycWall( int material, vec3 base, vec2 at, vec2 pixel, float seed, out float roughness ) {
	float size = max( pixel.x, pixel.y );
	// Weathering: broad tonal drift, and streaks that run down the wall.
	float drift = texture2D( uNycNoise, at * 0.041 + seed * 9.0 ).r;
	float streak = texture2D( uNycNoise, vec2( at.x * 0.19 + seed * 5.0, at.y * 0.013 ) ).g;
	vec3 color = base * ( 0.86 + 0.25 * drift ) * ( 0.93 + 0.12 * streak );
	roughness = 0.9;
	if ( material == NYC_MAT_BRICK ) {
		float close = 1.0 - smoothstep( 0.008, 0.03, size );
		if ( close > 0.0 ) {
			float row = at.y / 0.076, course = floor( row );
			float column = at.x / 0.22 + 0.5 * mod( course, 2.0 );
			float mortar = 1.0 - nycPulse( row, 0.0, 0.86, pixel.y / 0.076 ) * nycPulse( column, 0.0, 0.955, pixel.x / 0.22 );
			float tone = 0.8 + 0.42 * nycHash12( vec2( floor( column ), course ) + seed * 71.0 );
			vec3 detailed = mix( color * tone, vec3( 0.52, 0.5, 0.46 ) * ( 0.75 + 0.3 * drift ), mortar );
			color = mix( mix( color, vec3( 0.5, 0.48, 0.44 ), 0.16 ), detailed, close );
		} else color = mix( color, vec3( 0.5, 0.48, 0.44 ), 0.16 );
		roughness = 0.93;
	} else if ( material == NYC_MAT_STONE ) {
		float course = floor( at.y / 0.62 );
		float column = at.x / 1.25 + 0.5 * mod( course, 2.0 );
		float joint = 1.0 - nycPulse( at.y / 0.62, 0.0, 0.975, pixel.y / 0.62 ) * nycPulse( column, 0.0, 0.988, pixel.x / 1.25 );
		float close = 1.0 - smoothstep( 0.02, 0.09, size );
		color *= 1.0 - 0.3 * joint * close;
		color *= 0.95 + 0.1 * close * nycHash12( vec2( floor( column ), course ) + seed * 37.0 );
		roughness = 0.8;
	} else if ( material == NYC_MAT_SIDING ) {
		float lap = 1.0 - nycPulse( at.y / 0.125, 0.0, 0.84, pixel.y / 0.125 );
		color *= 1.0 - 0.32 * lap * ( 1.0 - smoothstep( 0.02, 0.07, size ) );
		roughness = 0.7;
	} else if ( material == NYC_MAT_BROWNSTONE ) {
		float course = 1.0 - nycPulse( at.y / 0.42, 0.0, 0.965, pixel.y / 0.42 );
		color *= 1.0 - 0.22 * course * ( 1.0 - smoothstep( 0.02, 0.08, size ) );
		roughness = 0.86;
	} else if ( material == NYC_MAT_IRON ) {
		roughness = 0.55;
	} else if ( material == NYC_MAT_CONCRETE ) {
		float board = 1.0 - nycPulse( at.y / 1.2, 0.0, 0.985, pixel.y / 1.2 );
		color *= 1.0 - 0.2 * board;
		roughness = 0.88;
	}
	// Splash-back and grime where the wall meets the pavement.
	color *= 0.8 + 0.2 * smoothstep( 0.0, 1.6, at.y );
	return color;
}

// A room seen through glass: the ray is traced into a box one bay wide and
// one storey high. 'cell' is the entry point, 'ray' points into the room.
vec3 nycRoom( vec2 cell, vec3 ray, vec3 tone, float lit, vec3 lamp, float ident ) {
	vec3 origin = vec3( cell, 0.0 );
	vec3 inv = 1.0 / ( abs( ray ) + 1e-4 );
	vec3 hit = vec3( ray.x > 0.0 ? 1.0 - origin.x : origin.x, ray.y > 0.0 ? 1.0 - origin.y : origin.y, 1.0 ) * inv;
	float t = min( hit.x, min( hit.y, hit.z ) );
	vec3 p = origin + ray * t;
	vec3 surface;
	float fixture = 0.0;
	if ( t == hit.z ) {
		surface = tone * ( 0.7 + 0.3 * p.y );
		// A doorway or a piece of furniture breaks up the back wall.
		float item = nycBox( p.x, 0.12 + 0.5 * ident, 0.36 + 0.5 * ident, 0.02 ) * step( p.y, 0.62 );
		surface *= 1.0 - 0.45 * item;
	} else if ( t == hit.y ) {
		if ( ray.y > 0.0 ) {
			surface = vec3( 0.86 );
			fixture = 1.0 - smoothstep( 0.02, 0.06, length( ( p.xz - vec2( 0.5, 0.45 ) ) * vec2( 1.0, 2.2 ) ) );
		} else surface = tone * vec3( 0.42, 0.34, 0.27 );
	} else surface = tone * 0.82;
	float depth = p.z;
	vec3 day = uNycAmbientSky * ( 0.085 * ( 1.0 - 0.8 * depth ) );
	vec3 night = lamp * ( 1.05 / ( 1.0 + 1.9 * depth ) + 3.0 * fixture );
	return surface * mix( day, night, lit );
}

// Iron fire escape: landings at each floor, railings, and stairs between.
// 'p' is in metres from the left edge of the escape; returns ironwork coverage.
float nycEscape( vec2 p, float width, float storey, float landing, vec2 pixel ) {
	if ( p.x < -0.1 || p.x > width + 0.1 ) return 0.0;
	float size = max( pixel.x, pixel.y );
	float level = p.y / storey, index = floor( level ), y = ( level - index ) * storey;
	float inside = nycBox( p.x, 0.0, width, pixel.x );
	float deck = nycLine( y, landing, 0.035, pixel.y );
	float rail = nycLine( y, landing + 0.98, 0.022, pixel.y ) + nycLine( y, landing + 0.5, 0.012, pixel.y );
	float guard = nycBox( y, landing, landing + 0.98, pixel.y );
	float posts = ( 1.0 - nycPulse( p.x / 0.13, 0.0, 0.86, pixel.x / 0.13 ) ) * guard;
	float ends = ( nycLine( p.x, 0.02, 0.025, pixel.x ) + nycLine( p.x, width - 0.02, 0.025, pixel.x ) ) * guard;
	// Stairs climb from one landing to the next, alternating direction.
	float rise = ( y - landing ) / storey; rise = rise < 0.0 ? rise + 1.0 : rise;
	float run = mod( index + ( y < landing ? 1.0 : 0.0 ), 2.0 ) < 0.5 ? rise : 1.0 - rise;
	float stair = nycLine( p.x, mix( 0.3, width - 0.3, run ), 0.05 + 0.5 * size, pixel.x ) * step( 0.02, rise ) * step( rise, 0.98 );
	float iron = max( max( deck, rail ), max( posts * 0.9, max( ends, stair ) ) );
	return clamp( iron, 0.0, 1.0 ) * inside;
}

NycFacade nycFacade( vec4 facade, vec4 styleIn, vec3 wallNormal, float facing, vec3 toEye ) {
	NycFacade result;
	float u = facade.x, v = facade.y, wallLength = facade.z, wallTop = facade.w;
	int style = clamp( int( styleIn.y * 255.0 + 0.5 ), 0, NYC_STYLE_COUNT - 1 );
	int flags = int( styleIn.w * 255.0 + 0.5 );
	int tint = style * 4 + ( flags & 3 );
	bool blank = ( flags & ${FLAG.BLANK} ) != 0, shop = ( flags & ${FLAG.SHOP} ) != 0, escape = ( flags & ${FLAG.ESCAPE} ) != 0, screens = ( flags & ${FLAG.SCREENS} ) != 0;
	float seed = styleIn.x, buildingHeight = styleIn.z * 255.0 * ${glslFloat(HEIGHT_UNIT)};
	vec4 A = NYC_STYLE_A[ style ], B = NYC_STYLE_B[ style ], C = NYC_STYLE_C[ style ], D = NYC_STYLE_D[ style ];
	float bay = A.x, storey = A.y, ground = A.z; int material = int( A.w + 0.5 );
	float windowWidth = B.x, windowHeight = B.y, sill = B.z, recess = B.w;
	float cornice = C.x, belt = C.z, litShare = C.w;
	bool glassWall = material == NYC_MAT_GLASS;
	vec3 wallColor = NYC_WALL[ tint ] * ( 0.88 + 0.24 * fract( seed * 7.31 ) ), trimColor = NYC_TRIM[ tint ], glassColor = NYC_GLASS[ tint ];
	// Low buildings have no separate street storey.
	if ( buildingHeight < ground * 1.7 ) ground = 0.0;
	if ( blank && ! glassWall ) {
		// Lot-line walls are plain common brick whatever the street front is
		// made of, and finish in a simple coping.
		material = NYC_MAT_BRICK;
		wallColor = mix( vec3( 0.17, 0.088, 0.066 ), wallColor, 0.1 ) * ( 0.8 + 0.5 * fract( seed * 13.7 ) );
		cornice = min( cornice, 0.22 ); belt = 0.0;
	}

	// Facade axes: along the wall, up, and out toward the viewer.
	vec3 along = normalize( vec3( - wallNormal.z, 0.0, wallNormal.x ) );
	float eyeOut = max( dot( toEye, wallNormal ) * facing, 0.1 ), eyeAlong = dot( toEye, along ), eyeUp = toEye.y;
	float sunOut = dot( uNycSunDir, wallNormal ) * facing, sunAlong = dot( uNycSunDir, along ), sunUp = uNycSunDir.y;
	vec2 pixel = vec2( fwidth( u ), fwidth( v ) );
	float size = max( pixel.x, pixel.y );
	float close = 1.0 - smoothstep( 0.035, 0.13, size );   // relief, frames and rooms
	float lights = uNycLights;

	// Fit whole bays to the wall, so windows are centred between its corners.
	float bays = max( 1.0, floor( wallLength / bay + 0.5 ) ), bayWidth = wallLength / bays;
	float cellU = u / bayWidth, bayIndex = floor( cellU ), bayAt = cellU - bayIndex;
	float above = v - ground, cellV = above / storey, floorIndex = floor( cellV ), floorAt = cellV - floorIndex;
	vec2 cellPixel = pixel / vec2( bayWidth, storey );
	// A storey needs most of its height below the top of the wall to exist.
	float upper = step( 0.0, above ) * step( 0.78 * storey + cornice, wallTop - ( ground + floorIndex * storey ) );
	float fromTop = wallTop - v;

	float roughness;
	vec3 wall = nycWall( material, wallColor, vec2( u, v ), pixel, seed, roughness );
	result.albedo = wall; result.roughness = roughness; result.metalness = 0.0;
	result.emissive = vec3( 0.0 ); result.lean = vec3( 0.0 ); result.sun = 1.0; result.shade = 1.0;

	// --- Glazing shared by windows, shop fronts and curtain walls ---------------
	float glass = 0.0;       // share of this pixel that is glass
	vec2 pane = vec2( 0.0 ); // which pane, for per-pane variety
	vec2 roomAt = vec2( 0.5 ); float roomDepth = 5.0; float roomHeight = storey;
	float frame = 0.0, litBoost = 1.0, litChance = litShare, warmth = D.x;
	float glassReflect = D.y, glassRough = D.z;

	if ( glassWall ) {
		// Curtain wall: mullions on every bay line, an opaque spandrel hiding
		// each floor slab, vision glass between.
		float spandrel = 1.0 - windowHeight;
		float mullion = 1.0 - nycPulse( cellU, 0.5 * ( 1.0 - windowWidth ), windowWidth, cellPixel.x );
		float isGround = 1.0 - step( 0.0, above );
		float vision = nycPulse( cellV, spandrel, windowHeight, cellPixel.y ) * step( 0.0, above ) * step( 0.5, fromTop );
		float rail = ( 1.0 - nycPulse( cellV, 0.006, 0.988, cellPixel.y ) ) + ( 1.0 - nycPulse( cellV - spandrel, 0.006, 0.988, cellPixel.y ) );
		// The lobby is one tall sheet of clear glass under a dark fascia.
		float lobby = isGround * nycBox( v, 0.35, ground - 0.9, pixel.y );
		vision = mix( vision, lobby, isGround );
		float metal = clamp( mullion + ( 1.0 - isGround ) * rail * ( 1.0 - smoothstep( 0.04, 0.12, pixel.y ) ), 0.0, 1.0 );
		glass = vision * ( 1.0 - metal );
		// Spandrel panels: the same glass, back-painted, so duller and darker.
		vec3 panel = mix( glassColor * 0.62, wallColor, 0.35 );
		result.albedo = mix( panel, trimColor * 0.8, metal );
		result.roughness = mix( 0.2, 0.42, metal ); result.metalness = mix( 0.78, 0.9, metal );
		pane = vec2( bayIndex, isGround > 0.5 ? -1.0 : floorIndex );
		roomAt = vec2( bayAt, isGround > 0.5 ? v / ground : floorAt ); roomDepth = 9.0; roomHeight = isGround > 0.5 ? ground : storey;
		// Offices light whole floors at once; the lobby is always on.
		float floorOn = step( nycHash12( vec2( floorIndex, seed * 251.0 ) ), mix( 0.52, 0.2, uNycLate ) );
		litChance = mix( floorOn * 0.85, 1.0, isGround ); litBoost = mix( 0.8, 1.15, isGround ); warmth = mix( warmth, 0.75, isGround );
		// Fins stand proud of the glass and catch the sun.
		result.lean = along * ( ( bayAt - 0.5 ) * 2.0 * mullion * recess * 3.0 );
	} else if ( ! blank ) {
		// Punched windows, recessed behind the wall face.
		float low = 0.5 * ( 1.0 - windowWidth ), high = low + windowWidth, head = sill + windowHeight;
		float columnMask = nycPulse( cellU, low, windowWidth, cellPixel.x );
		float opening = columnMask * nycPulse( cellV, sill, windowHeight, cellPixel.y ) * upper;
		if ( C.y > 0.5 ) {
			// Vertical piers: spandrels between windows sit back and go dark.
			float spandrelMask = columnMask * upper * ( 1.0 - opening / max( columnMask, 1e-3 ) );
			result.albedo = mix( result.albedo, trimColor * 0.7, spandrelMask * 0.85 );
			result.shade *= 1.0 - 0.25 * spandrelMask;
		}
		if ( belt > 0.0 ) {
			float course = ( 1.0 - nycPulse( cellV, 0.0, 1.0 - belt / storey, cellPixel.y ) ) * step( 0.0, above );
			result.albedo = mix( result.albedo, trimColor, course );
			result.shade *= 1.0 - 0.3 * course * ( 1.0 - nycPulse( cellV, 0.0, 1.0 - 0.3 * belt / storey, cellPixel.y ) );
		}
		// The ray carries on past the wall face to the glass, a recess behind.
		float depth = recess * close;
		vec2 slide = vec2( eyeAlong, eyeUp ) * ( depth / eyeOut ) / vec2( bayWidth, storey );
		vec2 seen = vec2( bayAt, floorAt ) - slide;
		float inU = nycBox( seen.x, low, high, cellPixel.x ), inV = nycBox( seen.y, sill, head, cellPixel.y );
		glass = opening * inU * inV;
		float reveal = opening - glass;
		if ( reveal > 0.001 ) {
			// What shows instead is one inner face of the opening.
			float side = 1.0 - inU, left = side * step( seen.x, 0.5 ), right = side - left;
			float lintel = inU * ( 1.0 - inV ) * step( 0.5 * ( sill + head ), seen.y ), ledge = inU * ( 1.0 - inV ) - lintel;
			float total = max( side + lintel + ledge, 1e-3 );
			vec3 face = wall * 0.9;
			face = mix( face, trimColor, ledge / total );
			result.albedo = mix( result.albedo, face, reveal );
			result.lean += ( along * ( left - right ) + vec3( 0.0, 1.0, 0.0 ) * ( ledge - lintel ) ) * ( 1.6 * reveal / total );
			result.shade *= 1.0 - reveal * ( 0.25 + 0.5 * lintel / total );
			result.sun *= 1.0 - reveal * lintel / total;
		}
		// The wall above and beside a window shades the glass.
		if ( sunOut > 0.03 && depth > 0.0 ) {
			vec2 toSun = vec2( sunAlong, sunUp ) * ( depth / sunOut ) / vec2( bayWidth, storey );
			float lit = nycBox( seen.x + toSun.x, low, high, cellPixel.x ) * nycBox( seen.y + toSun.y, sill, head, cellPixel.y );
			result.sun *= mix( 1.0, lit, glass );
		}
		// Sash: a frame around the glass, a meeting rail, a mullion if wide.
		if ( close > 0.0 ) {
			vec2 inset = vec2( min( seen.x - low, high - seen.x ) * bayWidth, min( seen.y - sill, head - seen.y ) * storey );
			frame = 1.0 - smoothstep( 0.045, 0.045 + size, min( inset.x, inset.y ) );
			frame = max( frame, nycLine( seen.y, sill + 0.5 * windowHeight, 0.022 / storey, cellPixel.y ) );
			if ( windowWidth * bayWidth > 1.55 ) frame = max( frame, nycLine( seen.x, 0.5, 0.022 / bayWidth, cellPixel.x ) );
			frame *= close;
		}
		pane = vec2( bayIndex, floorIndex ); roomAt = seen;
		// A light sill under every window, and the soot that runs from it.
		float ledgeBand = columnMask * upper * nycLine( floorAt, sill - 0.045 / storey, 0.05 / storey, cellPixel.y );
		result.albedo = mix( result.albedo, trimColor, ledgeBand * ( 1.0 - opening ) );
		float stain = columnMask * upper * nycBox( floorAt, sill - 0.5, sill - 0.06, cellPixel.y ) * ( 1.0 - opening );
		result.albedo *= 1.0 - 0.1 * stain * smoothstep( sill - 0.5, sill - 0.06, floorAt );
	}

	// --- Street storey ------------------------------------------------------------
	// Shops come two bays at a time. One whose middle lies on the street front
	// of a place the city's registers put here is that place's (storefronts.js).
	float shopShift = floor( seed * 2.0 ), shopIndex = floor( ( bayIndex + shopShift ) * 0.5 );
	float streetStorey = ground > 0.0 ? ground : storey;
	vec4 tenantSign = vec4( 0.0 ), tenantInk = vec4( 0.0 ), tenantLabel = vec4( 0.0 ), tenantAt = vec4( 0.0 );
	float tenant = 0.0, tenantMiddle = 0.0;
	#ifdef USE_FOG
	if ( uNycPlaceRect.w > 0.5 && ! blank && v < streetStorey ) {
		float middleU = clamp( ( 2.0 * shopIndex - shopShift + 1.0 ) * bayWidth, 0.5 * bayWidth, wallLength - 0.5 * bayWidth );
		vec2 middle = nycFacadeWorld.xz + along.xz * ( middleU - u );
		vec2 placeAt = ( middle - uNycPlaceRect.xy ) * uNycPlaceRect.z;
		if ( placeAt.x > 0.0 && placeAt.x < 1.0 && placeAt.y > 0.0 && placeAt.y < 1.0 ) {
			vec2 row = floor( textureLod( uNycPlaceMap, placeAt, 0.0 ).rg * 255.0 + 0.5 );
			tenant = row.x + 256.0 * row.y;
		}
		if ( tenant > 0.5 ) {
			int row = int( tenant );
			tenantSign = texelFetch( uNycPlaceTable, ivec2( 0, row ), 0 ); tenantInk = texelFetch( uNycPlaceTable, ivec2( 1, row ), 0 );
			tenantLabel = texelFetch( uNycPlaceTable, ivec2( 2, row ), 0 ); tenantAt = texelFetch( uNycPlaceTable, ivec2( 3, row ), 0 );
			// The shop front nearest the middle of the place's stretch of wall is
			// its own and carries the name. Others are, only if they lie wholly
			// within that stretch: a supermarket has several, a nail salon one.
			float aside = abs( dot( middle - tenantAt.xy, along.xz ) );
			tenantMiddle = step( aside, bayWidth );
			if ( aside > bayWidth && aside + bayWidth > tenantAt.z ) tenant = 0.0;
		}
	}
	#endif
	bool tenanted = tenant > 0.5;
	if ( ( ground > 0.0 && above < 0.0 && ! glassWall ) || ( tenanted && v < streetStorey ) ) {
		// A building with no street storey of its own gives a tenant its first floor.
		float storeyHeight = tenanted ? streetStorey : ground, height = v / storeyHeight;
		if ( ( shop || tenanted ) && ! blank ) {
			// Each shop takes two bays: plate glass over a low bulkhead, under a sign band.
			float shopSeed = nycHash12( vec2( shopIndex, seed * 173.0 ) );
			float glazing = nycPulse( cellU, 0.05, 0.9, cellPixel.x ) * nycBox( height, 0.13, 0.74, pixel.y / storeyHeight );
			float signBand = nycBox( height, 0.77, 0.95, pixel.y / storeyHeight );
			// Awning and sign colours, as varied as the shops.
			vec3 signColor = 0.5 + 0.5 * cos( 6.2831853 * ( shopSeed * 3.0 + vec3( 0.0, 0.33, 0.67 ) ) );
			signColor = mix( signColor * signColor * 0.7, vec3( shopSeed > 0.5 ? 0.06 : 0.82 ), step( 0.55, fract( shopSeed * 7.0 ) ) );
			float open = step( fract( shopSeed * 13.0 ), 0.72 );
			// Across the shop from its left as seen from the street, and up its sign band.
			float across = 1.0 - fract( ( cellU + shopShift ) * 0.5 ), shopWidth = 2.0 * bayWidth, bandHeight = 0.18 * storeyHeight;
			float ink = 0.0, card = 0.0, cardInk = 0.0, neon = 0.0, pole = 0.0;
			if ( tenanted ) {
				signColor = tenantSign.rgb; open = tenantSign.a;
				// The lettering keeps its proportions whatever the shape of the band.
				float fit = ( shopWidth / bandHeight ) / 8.0;
				vec2 stretch = vec2( max( fit, 1.0 ) * 1.04, max( 1.0 / fit, 1.0 ) * 1.06 );
				vec2 q = ( vec2( across, ( height - 0.77 ) / 0.18 ) - 0.5 ) * stretch + 0.5;
				vec2 spread = vec2( pixel.x / shopWidth, pixel.y / bandHeight ) * stretch * tenantLabel.zw;
				float lettered = step( 0.0, q.x ) * step( q.x, 1.0 ) * step( 0.0, q.y ) * step( q.y, 1.0 ) * step( 0.0001, tenantLabel.z );
				ink = textureGrad( uNycPlaceAtlas, tenantLabel.xy + clamp( q, 0.0, 1.0 ) * tenantLabel.zw, vec2( spread.x, 0.0 ), vec2( 0.0, spread.y ) ).r * lettered * tenantMiddle * signBand;
				// In the window: the health department's grade card, and OPEN in neon where there is a bar.
				vec2 glyph = uNycPlaceGlyphs.zw * vec2( 0.25, 1.0 );
				vec2 cardAt = vec2( ( across - 0.075 ) / 0.05, ( height - 0.42 ) / ( 0.36 / storeyHeight ) );
				card = step( 0.5, tenantInk.a ) * tenantMiddle * step( 0.0, cardAt.x ) * step( cardAt.x, 1.0 ) * step( 0.0, cardAt.y ) * step( cardAt.y, 1.0 ) * close;
				// The letters are ${ATLAS_CELL_HEIGHT} texels high: choose the level that puts about one to the pixel.
				float glyphLevel = clamp( log2( pixel.y * ${glslFloat(ATLAS_CELL_HEIGHT)} / 0.36 ), 0.0, 6.0 );
				cardInk = card * textureLod( uNycPlaceAtlas, uNycPlaceGlyphs.xy + vec2( tenantInk.a - 1.0 + mix( 0.2, 0.8, cardAt.x ), mix( 0.05, 0.95, cardAt.y ) ) * glyph, glyphLevel ).r;
				vec2 neonAt = vec2( ( across - 0.66 ) / 0.24, ( height - 0.5 ) / ( 0.42 / storeyHeight ) );
				neon = step( 1.5, tenantAt.w ) * step( tenantAt.w, 2.5 ) * tenantMiddle * step( 0.0, neonAt.x ) * step( neonAt.x, 1.0 ) * step( 0.0, neonAt.y ) * step( neonAt.y, 1.0 ) * close
					* textureLod( uNycPlaceAtlas, uNycPlaceGlyphs.xy + vec2( 3.0 + neonAt.x, neonAt.y ) * glyph, glyphLevel ).r * open;
				// A barber's pole turns beside the door.
				float poleAt = ( across - 0.012 ) / 0.03;
				pole = step( 0.5, tenantAt.w ) * step( tenantAt.w, 1.5 ) * tenantMiddle * step( 0.0, poleAt ) * step( poleAt, 1.0 ) * nycBox( height, 0.3, 0.68, pixel.y / storeyHeight ) * close;
			}
			vec3 bandColor = mix( signColor, tenantInk.rgb, ink );
			vec3 base = mix( wall * 0.55, vec3( 0.07, 0.075, 0.08 ), 0.6 );
			result.albedo = mix( base, bandColor, signBand );
			result.roughness = mix( 0.55, 0.7, signBand );
			// A lit sign, and the canvas of an awning catching street light.
			result.emissive += bandColor * ( signBand * lights * mix( 0.05, 0.42, open ) * ( 1.0 + 1.6 * ink ) );
			vec2 slide = vec2( eyeAlong, eyeUp ) * ( 0.12 * close / eyeOut ) / vec2( bayWidth, storeyHeight );
			vec2 seen = vec2( bayAt, height ) - slide;
			glass = glazing;
			// Steel shutters come down over closed shops at night.
			float shutter = ( 1.0 - open ) * smoothstep( 0.55, 0.9, lights ) * glazing;
			float slats = 1.0 - 0.3 * ( 1.0 - nycPulse( v / 0.085, 0.0, 0.78, pixel.y / 0.085 ) );
			result.albedo = mix( result.albedo, vec3( 0.33, 0.34, 0.35 ) * slats, shutter );
			result.roughness = mix( result.roughness, 0.5, shutter ); result.metalness = 0.55 * shutter;
			glass *= 1.0 - shutter;
			// What hangs in the window is in front of the glass, and gone behind a shutter.
			card *= 1.0 - shutter; cardInk *= 1.0 - shutter;
			vec3 gradeColor = tenantInk.a < 1.5 ? vec3( 0.03, 0.12, 0.5 ) : tenantInk.a < 2.5 ? vec3( 0.04, 0.3, 0.07 ) : vec3( 0.6, 0.2, 0.02 );
			result.albedo = mix( result.albedo, mix( vec3( 0.86 ), gradeColor, cardInk ), card );
			float stripe = fract( ( height * storeyHeight * 2.2 + across * shopWidth * 6.0 ) - uNycTime * 0.6 );
			vec3 poleColor = stripe < 0.33 ? vec3( 0.6, 0.03, 0.03 ) : stripe < 0.66 ? vec3( 0.85 ) : vec3( 0.04, 0.1, 0.5 );
			result.albedo = mix( result.albedo, poleColor, pole );
			result.emissive += poleColor * ( pole * lights * 0.5 ) + vec3( 1.0, 0.08, 0.06 ) * ( neon * mix( 0.5, 1.6, lights ) );
			result.albedo = mix( result.albedo, vec3( 0.5, 0.03, 0.03 ), neon );
			glass *= ( 1.0 - card ) * ( 1.0 - pole );
			// The way in: a glazed door in a dark frame where the place's front is, which is where walking into it goes inside.
			float doorway = 0.0;
			if ( tenanted ) {
				float doorOff = dot( nycFacadeWorld.xz - tenantAt.xy, along.xz );
				doorway = step( abs( doorOff ), 0.62 ) * step( v, 2.3 ) * close;
				float leaf = step( abs( doorOff ), 0.5 ) * step( 0.1, v ) * step( v, 2.16 );
				float handle = step( 0.3, doorOff ) * step( doorOff, 0.36 ) * step( 0.92, v ) * step( v, 1.28 );
				result.albedo = mix( result.albedo, mix( vec3( 0.045, 0.045, 0.05 ), vec3( 0.6, 0.6, 0.58 ), handle ), doorway );
				result.metalness = mix( result.metalness, 0.6, doorway * handle );
				glass = mix( glass, leaf * ( 1.0 - handle ) * ( 1.0 - shutter ), doorway );
			}
			frame = ( 1.0 - nycPulse( cellU * 2.0, 0.02, 0.96, cellPixel.x * 2.0 ) ) * close * ( 1.0 - doorway );
			pane = vec2( shopIndex, -1.0 ); roomAt = vec2( fract( ( cellU + shopShift ) * 0.5 ), seen.y / 0.78 );
			roomDepth = 9.0; roomHeight = storeyHeight * 0.78;
			litChance = open; litBoost = 1.0; warmth = mix( 0.35, 0.8, fract( shopSeed * 5.0 ) );
			glassReflect = 0.22; glassRough = 0.06;
		} else {
			// A plain base course in the trim stone, with smaller windows.
			result.albedo = mix( wall, mix( wall, trimColor, 0.6 ), step( 0.5, C.x ) ) * 0.92;
			float low = 0.5 * ( 1.0 - windowWidth * 0.8 );
			float opening = blank ? 0.0 : nycPulse( cellU, low, windowWidth * 0.8, cellPixel.x ) * nycBox( height, 0.34, 0.8, pixel.y / ground );
			// The entrance: a darker door under a transom, in the middle bay.
			float door = blank ? 0.0 : step( abs( bayIndex - floor( bays * 0.5 ) ), 0.1 ) * nycBox( bayAt, 0.2, 0.8, cellPixel.x ) * nycBox( height, 0.0, 0.72, pixel.y / ground );
			result.albedo = mix( result.albedo, vec3( 0.09, 0.075, 0.06 ), door );
			result.emissive += vec3( 1.0, 0.78, 0.5 ) * ( 0.5 * lights * door * nycBox( height, 0.58, 0.7, pixel.y / ground ) );
			glass = opening * ( 1.0 - door );
			pane = vec2( bayIndex, -1.0 ); roomAt = vec2( bayAt, height ); roomHeight = ground;
			litChance = litShare * 0.6;
		}
		// The line where the street storey ends.
		result.albedo = mix( result.albedo, trimColor * 0.92, nycBox( height, 0.955, 1.0, pixel.y / storeyHeight ) );
	}

	// --- Cornice or coping --------------------------------------------------------
	if ( cornice > 0.0 ) {
		float band = nycBox( fromTop, -1.0, cornice, pixel.y );
		float profile = fromTop / cornice;
		// A stack of mouldings: fascia, shadow line, bed moulding, soffit.
		float moulding = mix( 1.05, 0.55, smoothstep( 0.3, 0.36, profile ) );
		moulding = mix( moulding, 0.95, smoothstep( 0.42, 0.5, profile ) );
		moulding = mix( moulding, 0.5, smoothstep( 0.78, 0.9, profile ) );
		float dentil = 1.0 - 0.3 * ( 1.0 - nycPulse( u / 0.26, 0.0, 0.5, pixel.x / 0.26 ) ) * nycBox( profile, 0.5, 0.78, pixel.y / cornice ) * ( 1.0 - smoothstep( 0.02, 0.07, size ) );
		vec3 cap = glassWall ? trimColor * 0.75 : trimColor * moulding * dentil;
		result.albedo = mix( result.albedo, cap, band );
		result.roughness = mix( result.roughness, glassWall ? 0.4 : 0.8, band );
		result.metalness = mix( result.metalness, glassWall ? 0.85 : 0.0, band );
		result.emissive *= 1.0 - band; glass *= 1.0 - band;
		if ( ! glassWall ) {
			// The cornice projects, so it shades the wall below; further when the sun is high.
			float reach = cornice * 0.42 * clamp( sunUp / max( sunOut, 0.12 ), 0.0, 6.0 );
			result.sun *= mix( 1.0, smoothstep( cornice + reach - 0.1, cornice + reach + 0.1 + pixel.y, fromTop ), ( 1.0 - band ) * step( 0.03, sunOut ) );
			result.shade *= mix( 1.0, 0.72 + 0.28 * smoothstep( cornice, cornice * 2.4, fromTop ), 1.0 - band );
		}
	}

	// --- Glass --------------------------------------------------------------------
	if ( glass > 0.001 ) {
		float ident = nycHash13( vec3( pane, seed * 311.0 ) ), ident2 = nycHash13( vec3( pane.yx + 17.0, seed * 127.0 ) );
		// Individual windows merge with distance; their lights must average out, not sparkle.
		float distinct = 1.0 - smoothstep( 0.45, 1.3, max( cellPixel.x, cellPixel.y ) );
		// Lights come on one by one through dusk, each at its own moment.
		float switched = smoothstep( ident2 * 0.85, ident2 * 0.85 + 0.12, lights );
		// Fewer windows stay lit into the small hours; shops and lobbies keep theirs.
		if ( pane.y > -0.5 && ! glassWall ) litChance *= mix( 1.0, 0.42, uNycLate );
		float lit = mix( litChance * lights, step( ident, litChance ) * switched, distinct );
		vec3 lamp = mix( vec3( 0.78, 0.88, 1.0 ), vec3( 1.0, 0.71, 0.4 ), clamp( warmth + ( ident2 - 0.5 ) * 0.5, 0.0, 1.0 ) );
		lamp *= ( 0.24 + 0.36 * fract( ident * 9.7 ) ) * litBoost;
		// Blinds: drawn part-way on about half the windows.
		// Curtain walls show few blinds, and those behind tinted glass.
		float blindDrop = step( glassWall ? 0.93 : 0.45, fract( ident * 5.3 ) ) * fract( ident2 * 3.7 ) * step( -0.5, pane.y );
		float blind = step( 1.0 - blindDrop, roomAt.y ) * distinct * ( glassWall ? 0.45 : 1.0 );
		vec3 interior;
		if ( close > 0.0 && distinct > 0.0 ) {
			vec3 ray = vec3( - eyeAlong / bayWidth, - eyeUp / roomHeight, eyeOut / roomDepth );
			vec3 tone = 0.55 + 0.4 * cos( 6.2831853 * ( ident * 2.0 + vec3( 0.0, 0.1, 0.22 ) ) ) * vec3( 0.5, 0.45, 0.4 );
			vec3 room = nycRoom( clamp( roomAt, 0.0, 1.0 ), ray, tone, lit, lamp, fract( ident * 3.1 ) );
			vec3 plain = lamp * ( 0.5 * lit ) + uNycAmbientSky * ( 0.03 * ( 1.0 - lit ) );
			interior = mix( plain, room, close );
		} else interior = lamp * ( 0.5 * lit ) + uNycAmbientSky * ( 0.03 * ( 1.0 - lit ) );
		// A drawn blind glows evenly when the room behind it is lit.
		vec3 blindColor = vec3( 0.74, 0.7, 0.62 );
		interior = mix( interior, blindColor * ( lamp * 0.42 * lit + uNycAmbientSky * 0.05 ), blind );
		vec3 glassAlbedo = mix( glassColor * 0.5, blindColor * 0.5, blind * 0.6 );
		float mirror = glassReflect * ( 1.0 - 0.55 * blind );
		// No two panes are quite flat or quite parallel; reflections break across them.
		vec2 tilt = ( vec2( fract( ident * 23.3 ), fract( ident2 * 41.7 ) ) - 0.5 ) * ( glassWall ? 0.011 : 0.028 ) * distinct;
		vec3 paneLean = along * tilt.x + vec3( 0.0, 1.0, 0.0 ) * tilt.y;
		vec3 sash = glassWall ? trimColor * 0.6 : mix( trimColor, vec3( 0.07, 0.07, 0.075 ), step( 0.5, fract( seed * 3.3 ) ) );
		float pure = glass * ( 1.0 - frame );
		result.albedo = mix( result.albedo, mix( glassAlbedo, sash, frame ), glass );
		result.roughness = mix( result.roughness, mix( glassRough, 0.6, frame ), glass );
		result.metalness = mix( result.metalness, mix( mirror, 0.0, frame ), glass );
		result.emissive += interior * pure * ( 1.0 - 0.35 * mirror );
		result.lean += paneLean * pure;
		result.shade = mix( result.shade, 1.0, pure );
	}

	// --- Fire escape --------------------------------------------------------------
	if ( escape && ! blank && ! glassWall && wallLength > 4.5 && buildingHeight > 9.0 ) {
		float span = min( 2.0, bays ) * bayWidth * 0.94;
		// One on a narrow front; repeated along a wide one.
		float repeat = max( span + 2.0 * bayWidth, floor( bays / max( 1.0, floor( bays / 6.0 ) ) ) * bayWidth );
		float local = mod( u - 0.5 * ( wallLength - span ), repeat );
		float landing = ( sill - 0.09 ) * storey;
		// From the first landing above the street storey to the top floor's railing.
		float lowest = ground + landing - 0.06, highest = wallTop - cornice - 0.5;
		vec2 at = vec2( local, above );
		float iron = nycEscape( at, span, storey, landing, pixel ) * step( lowest, v ) * step( v, highest );
		// Its shadow falls on the wall behind, offset away from the sun.
		if ( sunOut > 0.05 ) {
			vec2 thrown = vec2( sunAlong, sunUp ) * ( 0.75 / sunOut );
			float shadow = nycEscape( at + thrown, span, storey, landing, pixel + 0.03 ) * step( lowest, v + thrown.y ) * step( v + thrown.y, highest );
			result.sun *= 1.0 - 0.85 * shadow * ( 1.0 - iron );
		}
		result.albedo = mix( result.albedo, vec3( 0.035, 0.035, 0.04 ), iron );
		result.roughness = mix( result.roughness, 0.6, iron ); result.metalness = mix( result.metalness, 0.5, iron );
		result.emissive *= 1.0 - iron;
	}

	// --- Times Square signs ---------------------------------------------------------
	if ( screens && ! blank && wallLength > 9.0 && v > 6.5 && v < min( wallTop - 3.0, 46.0 ) ) {
		// The lower floors are hung with LED screens of several sizes.
		vec2 board = vec2( u / 11.0, ( v - 6.5 ) / 7.9 ), boardId = floor( board ), boardAt = board - boardId;
		float pick = nycHash13( vec3( boardId, seed * 97.0 ) );
		if ( pick > 0.3 ) {
			float inset = min( min( boardAt.x, 1.0 - boardAt.x ) * 11.0, min( boardAt.y, 1.0 - boardAt.y ) * 7.9 );
			float panel = smoothstep( 0.22, 0.22 + size + 0.02, inset );
			// Pictures change every few seconds: two colours, a drifting shape,
			// moving bars. From across the square that is what an advert is.
			float beat = uNycTime * ( 0.06 + 0.1 * fract( pick * 7.0 ) ) + pick * 40.0, scene = floor( beat );
			vec3 first = 0.5 + 0.5 * cos( 6.2831853 * ( pick * 5.0 + scene * 0.37 + vec3( 0.0, 0.33, 0.67 ) ) );
			vec3 second = 0.5 + 0.5 * cos( 6.2831853 * ( pick * 9.0 + scene * 0.61 + vec3( 0.1, 0.5, 0.8 ) ) );
			float shape = texture2D( uNycNoise, boardAt * vec2( 0.33, 0.24 ) + vec2( beat * 0.06, pick + scene * 0.13 ) ).r;
			float bars = step( 0.5, fract( boardAt.x * ( 2.0 + floor( pick * 5.0 ) ) + beat * 0.7 ) );
			vec3 picture = mix( first, second, smoothstep( 0.44, 0.56, shape ) ) * ( 0.6 + 0.4 * bars );
			picture = mix( picture, vec3( 1.0 ), 0.55 * step( 0.9, fract( boardAt.y * 2.0 - beat * 0.5 ) ) );
			// Not every sign is a rainbow: some are mostly white, some mostly dark.
			float mood = fract( pick * 13.0 );
			picture = mix( picture, vec3( dot( picture, vec3( 0.3, 0.59, 0.11 ) ) ), 0.2 );
			picture = mood < 0.28 ? mix( picture, vec3( 0.95 ), 0.6 ) : mood > 0.8 ? picture * 0.4 : picture;
			result.albedo = mix( result.albedo, vec3( 0.015 ), panel );
			result.roughness = mix( result.roughness, 0.32, panel ); result.metalness = mix( result.metalness, 0.0, panel );
			// Bright enough to read at noon; dimmed after dark, as the real ones are.
			result.emissive = mix( result.emissive, picture * picture * mix( 1.7, 0.55, uNycNight ), panel );
			result.shade = mix( result.shade, 1.0, panel ); result.lean *= 1.0 - panel;
		}
	}

	// --- Crown lighting on the tallest towers --------------------------------------
	if ( buildingHeight > 170.0 && lights > 0.0 && fract( seed * 17.3 ) < 0.45 ) {
		// Some towers floodlight their tops: most in warm white, a few in colour.
		float crown = smoothstep( buildingHeight * 0.94, buildingHeight * 0.99, v );
		vec3 hue = mix( vec3( 1.0, 0.86, 0.62 ), 0.55 + 0.45 * cos( 6.2831853 * ( seed * 5.0 + vec3( 0.0, 0.33, 0.67 ) ) ), step( 0.7, fract( seed * 11.0 ) ) );
		result.emissive += hue * ( 0.2 * lights * crown );
	}
	return result;
}
`;

export const FACADE_FRAGMENT = /* glsl */`
if ( vFacadeWall.x > 0.004 ) {
	vec3 nycWallNormal = inverseTransformDirection( vNormal, viewMatrix );
	vec3 nycToEye = inverseTransformDirection( vViewPosition, viewMatrix );
	#ifdef USE_FOG
	nycFacadeWorld = cameraPosition + vNycFogRay;
	#endif
	NycFacade nycSurface = nycFacade( vec4( vFacade.x, max( vFacade.y, 0.0 ), vFacadeWall ), vStyle, nycWallNormal, faceDirection, nycToEye );
	if ( vFacade.y < 0.0 ) {
		// Below the measured base: poured concrete, down to wherever the ground is.
		float nycPour = texture2D( uNycNoise, vec2( vFacade.x, vFacade.y ) * 0.23 ).r, nycForm = step( 0.93, fract( vFacade.y / 1.2 ) );
		nycSurface.albedo = vec3( 0.2, 0.197, 0.19 ) * ( 0.78 + 0.34 * nycPour ) * ( 1.0 - 0.25 * nycForm );
		nycSurface.shade = 1.0; nycSurface.roughness = 0.93; nycSurface.metalness = 0.0;
		nycSurface.emissive = vec3( 0.0 ); nycSurface.lean = vec3( 0.0 ); nycSurface.sun = 1.0;
	}
	diffuseColor.rgb = nycSurface.albedo * nycSurface.shade;
	roughnessFactor = nycSurface.roughness;
	metalnessFactor = nycSurface.metalness;
	totalEmissiveRadiance += nycSurface.emissive;
	normal = normalize( normal + ( viewMatrix * vec4( nycSurface.lean, 0.0 ) ).xyz );
	nycSunMask = nycSurface.sun;
}
`;

/** Add facade shading to a MeshStandardMaterial's shader; call from onBeforeCompile. */
export function applyFacadeShader(shader) {
  shader.vertexShader = FACADE_VERTEX_PARS + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${FACADE_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${FACADE_FRAGMENT_PARS}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FACADE_FRAGMENT}`);
}
