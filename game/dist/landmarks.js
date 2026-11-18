// The buildings the city protects: what each is and what it is faced with.
//
// The Landmarks Preservation Commission records every individual landmark
// and every building in a historic district: its type and its main facade
// material (scripts/build-landmarks.mjs). Where a building is in that record
// its facade is the type the Commission gives, in the material it gives: a
// brownstone row house is brownstone, a cast-iron store-and-lofts is a loft,
// a limestone town house is pale stone. The record is of some 37,000
// buildings, most of them in Manhattan and brownstone Brooklyn; everywhere
// else lots.js decides.

/** What a building is, by number (0 is not recorded). */
export const BUILDING_TYPES = ['unknown', 'row house', 'house', 'tenement', 'apartments', 'lofts', 'civic', 'store'];
const TYPE_WORDS = [[/row house|town ?house|rowhouse/, 1], [/tenement|flats/, 3], [/apartment|hotel/, 4], [/loft|warehouse|factory|industrial|store and/, 5], [/church|synagogue|school|library|museum|hospital|club|institution|convent|rectory|chapel|bank|firehouse|police|courthouse/, 6], [/house|residen|mansion|cottage|villa/, 2], [/store|commercial|office|shop/, 7]];
export const typeOf = text => { const lower = String(text || '').toLowerCase(); if (/garage|stable|carriage|outbuilding|shed/.test(lower)) return 0; for (const [pattern, type] of TYPE_WORDS) if (pattern.test(lower)) return type; return 0; };
/** What a building is faced with, by number (0 is not recorded), and the colour of each as a wall. */
export const FACINGS = ['unknown', 'red brick', 'brownstone', 'pale stone', 'grey stone', 'buff brick', 'cast iron', 'wood or stucco'];
export const FACING_COLOURS = [null, '#8a4b3a', '#6a4a3c', '#c8bca4', '#9c9a94', '#b79a78', '#d9d5cb', '#d6d0be'];
const FACING_WORDS = [[/cast[- ]iron/, 6], [/brownstone|sandstone/, 2], [/limestone|marble|terra[- ]cotta/, 3], [/granite|stone|masonry|concrete/, 4], [/buff|yellow|tan|roman|orange|white|gr[ae]y brick|beige/, 5], [/brick/, 1], [/wood|stucco|shingle|clapboard|vinyl|aluminum|siding/, 7]];
export const materialOf = text => { const lower = String(text || '').toLowerCase(); for (const [pattern, facing] of FACING_WORDS) if (pattern.test(lower)) return facing; return 0; };

const CELL = 32;
/** `buffer` is landmark-buildings.bin. Without it no building is in the record. */
export function createLandmarkBuildings(buffer = null) {
  const count = buffer ? Math.floor(buffer.byteLength / 6) : 0, view = count ? new DataView(buffer) : null, grid = new Map();
  for (let i = 0; i < count; i++) { const x = view.getInt16(i * 6, true), z = view.getInt16(i * 6 + 2, true), key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); }
  return {
    count,
    /** The recorded building whose middle is nearest (x, z), within `reach` metres: { type, facing } as numbers, or null. */
    at(x, z, reach = 14) {
      let best = null, distance = reach;
      for (let gx = Math.floor((x - reach) / CELL); gx <= Math.floor((x + reach) / CELL); gx++) for (let gz = Math.floor((z - reach) / CELL); gz <= Math.floor((z + reach) / CELL); gz++) for (const i of grid.get(`${gx},${gz}`) || []) {
        const d = Math.hypot(view.getInt16(i * 6, true) - x, view.getInt16(i * 6 + 2, true) - z);
        if (d <= distance) { distance = d; best = view.getUint8(i * 6 + 4); }
      }
      return best === null ? null : { type: best & 15, facing: best >> 4 };
    },
  };
}

/**
 * The facade for a recorded building, as a style id of facade.js, or null to
 * leave it to its lot. Height keeps a "row house" that has become a tower honest.
 */
export function landmarkStyle(record, { height }) {
  if (!record) return null;
  const { type, facing } = record;
  if (height >= 62) return null;
  if (facing === 6) return 'loft';
  switch (type) {
    case 1: return height < 22 ? 'rowhouse' : null;
    case 2: return height < 16 ? 'house' : null;
    case 3: return 'tenement';
    case 4: return 'prewar';
    case 5: return 'loft';
    case 6: return 'civic';
    case 7: return height < 16 ? null : 'loft';
    default: return facing === 2 && height < 22 ? 'rowhouse' : null;
  }
}

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** Which of a style's palettes ([wall, trim, glass] each) is nearest the colour of a facing; -1 if the facing is not recorded. */
export function paletteFor(palettes, facing) {
  const target = FACING_COLOURS[facing];
  if (!target) return -1;
  const [r, g, b] = channels(target);
  let best = 0, least = Infinity;
  palettes.forEach((palette, index) => { const [pr, pg, pb] = channels(palette[0]), d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (d < least) { least = d; best = index; } });
  return best;
}
