// Real names over real shop fronts.
//
// The facade shader draws a shop front every two bays along a street wall
// (facade.js). This module tells it whose each one is. Three textures do it:
//
//   a map of the ground around the player, a metre to the texel, holding at
//   each point the number of the place whose street front lies there;
//   a table with a row per place: sign colours, whether it is open, its
//   inspection grade, and where its lettering is in the atlas;
//   an atlas of lettering for the nearest places.
//
// The shader looks up the middle of each shop front in the map. A front that
// belongs to a place takes that place's sign; one that belongs to nobody
// stays as anonymous as it was.
import * as THREE from './vendor/three.module.min.js';
import { shared } from './gfx-common.js';
import { ATLAS_CELL_HEIGHT } from './facade.js';
import { isOpen, signFor } from './places.js';

/** The map covers this many metres square, at a metre to the texel. */
export const MAP_SPAN = 512;
/** Rows in the place table; row 0 means nobody. */
export const TABLE_ROWS = 1024;
/** The lettering atlas, in pixels, and one sign's share of it: eight times as wide as it is high, like a sign band. */
export const ATLAS = { width: 2048, height: 2048, cellWidth: 8 * ATLAS_CELL_HEIGHT, cellHeight: ATLAS_CELL_HEIGHT, columns: 3, rows: 25 };
// How far either side of the wall line a front reaches in the map, in metres.
const FRONT_DEPTH = 1.6;
// Kinds of place with something of their own on the front, as the shader numbers them.
const TRIM = { barber: 1, bar: 2, pub: 2, club: 2 };

const linear = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); };

/**
 * Write the map: for every texel within a front, the row of the nearest one.
 * `fronts[i]` is given row i + 1. Returns nothing; fills `data` (two bytes a
 * texel, low then high) for a map whose corner is at (originX, originZ).
 */
export function rasterFronts(fronts, originX, originZ, data, nearest) {
  data.fill(0); nearest.fill(Infinity);
  for (let i = 0; i < fronts.length && i < TABLE_ROWS - 1; i++) {
    const front = fronts[i], half = front.width / 2, row = i + 1;
    const reachX = Math.abs(front.tx) * half + Math.abs(front.nx) * FRONT_DEPTH, reachZ = Math.abs(front.tz) * half + Math.abs(front.nz) * FRONT_DEPTH;
    const x0 = Math.max(0, Math.floor(front.x - reachX - originX)), x1 = Math.min(MAP_SPAN - 1, Math.ceil(front.x + reachX - originX));
    const z0 = Math.max(0, Math.floor(front.z - reachZ - originZ)), z1 = Math.min(MAP_SPAN - 1, Math.ceil(front.z + reachZ - originZ));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const dx = originX + x + .5 - front.x, dz = originZ + z + .5 - front.z, along = Math.abs(dx * front.tx + dz * front.tz), out = Math.abs(dx * front.nx + dz * front.nz);
      if (along > half + .5 || out > FRONT_DEPTH) continue;
      // Where two fronts both reach, the nearer along the wall has it.
      const o = z * MAP_SPAN + x;
      if (along < nearest[o]) { nearest[o] = along; data[o * 2] = row & 255; data[o * 2 + 1] = row >> 8; }
    }
  }
}

/** Letter a sign into its cell of the atlas: the name, and under it what else the sign says. White on nothing. */
export function drawSign(context, sign, x, y, width, height) {
  context.clearRect(x, y, width, height);
  context.fillStyle = '#ffffff'; context.textAlign = 'center'; context.textBaseline = 'middle';
  const fit = (text, size, weight, limit) => {
    context.font = `${weight} ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    const measured = context.measureText(text).width;
    if (measured > limit) { size = Math.max(14, Math.floor(size * limit / measured)); context.font = `${weight} ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; }
  };
  if (sign.tagline) {
    fit(sign.name, Math.round(height * .7), 800, width * .96); context.fillText(sign.name, x + width / 2, y + height * .38);
    fit(sign.tagline, Math.round(height * .25), 700, width * .94); context.fillText(sign.tagline, x + width / 2, y + height * .85);
  } else { fit(sign.name, Math.round(height * .86), 800, width * .96); context.fillText(sign.name, x + width / 2, y + height * .53); }
}

/**
 * Keep the three textures in step with the street fronts around the player.
 * `createCanvas` makes the canvas the lettering is drawn on.
 */
export function createStorefronts({ createCanvas = () => document.createElement('canvas') } = {}) {
  const mapData = new Uint8Array(MAP_SPAN * MAP_SPAN * 2), nearest = new Float32Array(MAP_SPAN * MAP_SPAN);
  const map = new THREE.DataTexture(mapData, MAP_SPAN, MAP_SPAN, THREE.RGFormat, THREE.UnsignedByteType);
  map.name = 'Whose shop front is where'; map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true;
  const tableData = new Float32Array(4 * TABLE_ROWS * 4);
  const table = new THREE.DataTexture(tableData, 4, TABLE_ROWS, THREE.RGBAFormat, THREE.FloatType);
  table.name = 'Shop signs'; table.magFilter = table.minFilter = THREE.NearestFilter; table.generateMipmaps = false; table.needsUpdate = true;
  const canvas = createCanvas(); canvas.width = ATLAS.width; canvas.height = ATLAS.height;
  const context = canvas.getContext('2d');
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.name = 'Shop sign lettering'; atlas.colorSpace = THREE.NoColorSpace; atlas.anisotropy = 8; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
  const cells = ATLAS.columns * ATLAS.rows;
  const rect = cell => { const px = (cell % ATLAS.columns) * ATLAS.cellWidth, py = Math.floor(cell / ATLAS.columns) * ATLAS.cellHeight; return { px, py, u: px / ATLAS.width, v: 1 - (py + ATLAS.cellHeight) / ATLAS.height, w: ATLAS.cellWidth / ATLAS.width, h: ATLAS.cellHeight / ATLAS.height }; };
  // Cell 0 is not a sign: the letters of the inspection grades, and OPEN, a quarter of the cell each.
  if (context) {
    const { px, py } = rect(0), quarter = ATLAS.cellWidth / 4;
    context.clearRect(px, py, ATLAS.cellWidth, ATLAS.cellHeight); context.fillStyle = '#ffffff'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `800 ${Math.round(ATLAS.cellHeight * .9)}px Arial, sans-serif`;
    ['A', 'B', 'C'].forEach((letter, i) => context.fillText(letter, px + quarter * (i + .5), py + ATLAS.cellHeight * .54));
    context.font = `800 ${Math.round(ATLAS.cellHeight * .52)}px Arial, sans-serif`; context.fillText('OPEN', px + quarter * 3.5, py + ATLAS.cellHeight * .54);
  }
  const glyphs = rect(0);
  shared.uNycPlaceMap.value = map; shared.uNycPlaceTable.value = table; shared.uNycPlaceAtlas.value = atlas;
  shared.uNycPlaceGlyphs.value.set(glyphs.u, glyphs.v, glyphs.w, glyphs.h);
  // Which sign each lettering cell holds, by place.
  const held = new Array(cells).fill(null), where = new Map();
  let shown = [], source = null, at = null, openAt = -1, lettered = 0;
  const state = {
    textures: { map, table, atlas },
    /** How many places have a front in the map, and how many of those are lettered. */
    get counts() { return { fronts: shown.length, lettered }; },
    /** The fronts in the table, row 1 first. */
    get fronts() { return shown; },
    /**
     * `fronts` is solveFrontages()'s answer for the places around `focus`;
     * pass the same array until it changes. `hours` is the time of day.
     */
    update(fronts = [], focus = { x: 0, z: 0 }, hours = 12) {
      const moved = !at || Math.hypot(focus.x - at.x, focus.z - at.z) > 12;
      if (fronts !== source || moved) {
        source = fronts; at = { x: focus.x, z: focus.z };
        shown = fronts.map(front => ({ front, distance: Math.hypot(front.x - focus.x, front.z - focus.z) })).filter(entry => entry.distance < MAP_SPAN / 2 - 8)
          .sort((a, b) => a.distance - b.distance).slice(0, TABLE_ROWS - 1).map(entry => entry.front);
        // The map is laid on whole metres, so a texel is always the same square of ground.
        const originX = Math.round(focus.x) - MAP_SPAN / 2, originZ = Math.round(focus.z) - MAP_SPAN / 2;
        rasterFronts(shown, originX, originZ, mapData, nearest);
        map.needsUpdate = true;
        shared.uNycPlaceRect.value.set(originX, originZ, 1 / MAP_SPAN, shown.length ? 1 : 0);
        // Lettering for the nearest: a place keeps its cell for as long as it is among them.
        const wanted = new Set(shown.slice(0, cells - 1).map(front => front.place.id));
        for (let cell = 1; cell < cells; cell++) if (held[cell] && !wanted.has(held[cell])) { where.delete(held[cell]); held[cell] = null; }
        let free = 1, drawn = false;
        tableData.fill(0); lettered = 0;
        shown.forEach((front, i) => {
          const sign = signFor(front.place, front.language || null), o = (i + 1) * 16, [br, bg, bb] = linear(sign.background), [lr, lg, lb] = linear(sign.lettering);
          tableData[o] = br; tableData[o + 1] = bg; tableData[o + 2] = bb; tableData[o + 3] = 1;
          tableData[o + 4] = lr; tableData[o + 5] = lg; tableData[o + 6] = lb; tableData[o + 7] = { A: 1, B: 2, C: 3 }[front.place.grade] || 0;
          tableData[o + 12] = front.x; tableData[o + 13] = front.z; tableData[o + 14] = front.width / 2; tableData[o + 15] = TRIM[front.place.kind] || 0;
          if (!wanted.has(front.place.id) || !context) return;
          let cell = where.get(front.place.id);
          if (cell === undefined) {
            while (free < cells && held[free]) free++;
            if (free >= cells) return;
            cell = free; held[cell] = front.place.id; where.set(front.place.id, cell);
            const { px, py } = rect(cell);
            drawSign(context, sign, px, py, ATLAS.cellWidth, ATLAS.cellHeight); drawn = true;
          }
          const r = rect(cell);
          tableData[o + 8] = r.u; tableData[o + 9] = r.v; tableData[o + 10] = r.w; tableData[o + 11] = r.h; lettered++;
        });
        if (drawn) atlas.needsUpdate = true;
        openAt = -1;
      }
      // Who is open changes with the hour; look again every quarter of one.
      const quarter = Math.floor(hours * 4);
      if (quarter !== openAt) {
        openAt = quarter;
        shown.forEach((front, i) => { tableData[(i + 1) * 16 + 3] = isOpen(front.place.kind, hours) ? 1 : 0; });
        table.needsUpdate = true;
      }
    },
    dispose() {
      map.dispose(); table.dispose(); atlas.dispose();
      if (shared.uNycPlaceMap.value === map) { shared.uNycPlaceMap.value = null; shared.uNycPlaceTable.value = null; shared.uNycPlaceAtlas.value = null; shared.uNycPlaceRect.value.w = 0; }
    },
  };
  return state;
}
