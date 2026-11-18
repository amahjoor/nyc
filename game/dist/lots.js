// What stands on each piece of ground: when it was built and what it is.
//
// The city's tax lots (PLUTO) give the year each building was built and the
// assessor's class for it. scripts/build-lots.mjs lays those on a grid of
// fifty-metre cells, each holding the era and use of the biggest building
// centred in it (dist/lots.bin, one byte a cell). A building's facade is
// chosen from the cell it stands in: a walk-up of the 1900s is a tenement, an
// elevator building of the 1960s is post-war brick, an office tower of the
// 1930s is Art Deco, one of the 2010s is glass. Which facade suits which era
// and use is the game's judgement; the era and the use are the city's.

/** Metres to a cell. */
export const LOT_CELL = 50;
/** When a building was built, by number (0 is not known). */
export const ERAS = ['unknown', 'before 1900', '1900 to 1919', '1920 to 1939', '1940 to 1959', '1960 to 1979', '1980 to 1999', '2000 on'];
export const eraOf = year => !(year >= 1700 && year <= 2100) ? 0 : year < 1900 ? 1 : year < 1920 ? 2 : year < 1940 ? 3 : year < 1960 ? 4 : year < 1980 ? 5 : year < 2000 ? 6 : 7;
/** What a building is, by number (0 is not known), from the first letter of its building class. */
export const USES = ['unknown', 'house', 'walk-up', 'elevator', 'loft', 'industrial', 'office', 'store', 'hotel', 'civic'];
const USE_OF = { A: 1, B: 1, C: 2, S: 2, D: 3, R: 3, L: 4, E: 5, F: 5, G: 5, O: 6, K: 7, H: 8, W: 9, M: 9, I: 9, P: 9, Y: 9, N: 9, J: 9 };
export const useOf = buildingClass => USE_OF[String(buildingClass || '')[0]] || 0;

/** `buffer` is lots.bin. Without it nothing is known anywhere. */
export function createLots(buffer = null) {
  if (!buffer || buffer.byteLength < 20) return { cells: 0, at: () => null };
  const [minX, minZ, cell, cols, rows] = new Int32Array(buffer.slice(0, 20)), cells = new Uint8Array(buffer, 20);
  if (cell <= 0 || cols <= 0 || rows <= 0 || cells.length < cols * rows) return { cells: 0, at: () => null };
  const read = (gx, gz) => gx < 0 || gz < 0 || gx >= cols || gz >= rows ? 0 : cells[gz * cols + gx];
  return {
    cells: cols * rows,
    /**
     * The era and use of the building at (x, z): { era, use } as numbers into
     * ERAS and USES, from its own cell or, if that is empty, the nearest of
     * the eight around it. Null where nothing is recorded.
     */
    at(x, z) {
      const gx = Math.floor((x - minX) / cell), gz = Math.floor((z - minZ) / cell);
      let value = read(gx, gz);
      if (!value) {
        let best = Infinity;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const near = read(gx + dx, gz + dz);
          if (!near) continue;
          const d = Math.hypot((gx + dx + .5) * cell + minX - x, (gz + dz + .5) * cell + minZ - z);
          if (d < best) { best = d; value = near; }
        }
      }
      return value ? { era: value & 15, use: value >> 4 } : null;
    },
  };
}

/**
 * The facade that suits a building of this era and use, as a style id of
 * facade.js, or null to leave it to the building's size and where it is.
 * `random` is a number from 0 to 1 that is the building's own.
 */
export function lotStyle(lot, { height, area, random }) {
  if (!lot || !lot.era) return lot?.use === 9 && height < 62 ? 'civic' : null;
  const { era, use } = lot, pick = (...table) => { const total = table.reduce((sum, entry) => sum + entry[1], 0); let cursor = random * total; for (const [style, weight] of table) { cursor -= weight; if (cursor <= 0) return style; } return table.at(-1)[0]; };
  // Whatever it is, a very tall building of an era looks like the towers of that era.
  if (height >= 215) return era <= 3 ? 'deco' : era <= 5 ? pick(['slab', 2], ['curtain', 1]) : 'supertall';
  if (height >= 130) return era <= 3 ? 'deco' : era <= 5 ? pick(['slab', 3], ['curtain', 2]) : pick(['curtain', 4], ['supertall', 1]);
  switch (use) {
    case 1: // One and two families: row houses where they are old and narrow, free-standing houses otherwise.
      if (height >= 15.5) return null;
      return era <= 2 && area < 230 ? pick(['rowhouse', 5], ['house', 1]) : era === 3 && area < 170 ? pick(['rowhouse', 2], ['house', 2]) : 'house';
    case 2: // Walk-up apartments, with or without a shop below.
      if (height >= 30) return era <= 3 ? 'prewar' : 'postwar';
      return era <= 2 ? (height < 13 && area < 190 ? pick(['rowhouse', 3], ['tenement', 2]) : 'tenement') : era === 3 ? pick(['tenement', 3], ['prewar', 2]) : era <= 5 ? 'postwar' : pick(['postwar', 2], ['curtain', 1]);
    case 3: // Elevator apartments and condominiums.
    case 8: // Hotels are built like them.
      if (height < 13) return null;
      return era <= 3 ? (height > 62 && era === 3 ? pick(['prewar', 3], ['deco', 2]) : 'prewar') : era <= 5 ? (area > 500 && area < 1900 && height < 62 && use === 3 ? pick(['postwar', 3], ['projects', 1]) : pick(['postwar', 4], ['slab', height > 50 ? 2 : 0]))
        : era === 6 ? pick(['postwar', 2], ['curtain', 2]) : pick(['curtain', 5], ['slab', 1]);
    case 4: // Lofts.
      return era <= 3 ? 'loft' : era <= 5 ? 'industrial' : 'curtain';
    case 5: // Warehouses, factories and garages.
      return era <= 3 && height > 15 ? pick(['loft', 3], ['industrial', 2]) : 'industrial';
    case 6: // Offices.
      if (height < 13) return null;
      return era <= 2 ? pick(['loft', 3], ['prewar', 2], ['civic', 1]) : era === 3 ? (height > 40 ? 'deco' : pick(['deco', 2], ['prewar', 2], ['loft', 1])) : era <= 5 ? pick(['slab', 3], ['curtain', 2]) : 'curtain';
    case 7: // Stores: low ones are left to their size; taller ones follow their era.
      if (height < 15.5) return null;
      return era <= 2 ? pick(['loft', 2], ['tenement', 2]) : era === 3 ? pick(['prewar', 2], ['deco', 1], ['loft', 1]) : era <= 5 ? 'postwar' : 'curtain';
    case 9: // Schools, churches, hospitals, courts.
      return height < 62 ? 'civic' : era <= 3 ? 'prewar' : 'postwar';
    default:
      if (height < 15.5) return null;
      return era <= 2 ? pick(['tenement', 3], ['loft', 1]) : era === 3 ? 'prewar' : era <= 5 ? 'postwar' : 'curtain';
  }
}
