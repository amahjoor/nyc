import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLots, lotStyle, eraOf, useOf, ERAS, USES, LOT_CELL } from '../dist/lots.js';
import { chooseStyle, setLots, STYLES, STYLE_INDEX } from '../dist/facade.js';

const file = readFileSync(new URL('../dist/lots.bin', import.meta.url)), lots = createLots(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

test('years and building classes fall into eras and uses', () => {
  assert.deepEqual([0, 1850, 1899, 1900, 1925, 1945, 1965, 1999, 2000, 2024, 3000].map(eraOf), [0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 0]);
  assert.deepEqual(['A1', 'B2', 'C4', 'S9', 'D6', 'R4', 'E1', 'O5', 'K1', 'H2', 'W1', 'M1', 'Z9', '', undefined].map(useOf).map(use => USES[use]), ['house', 'house', 'walk-up', 'walk-up', 'elevator', 'elevator', 'industrial', 'office', 'store', 'hotel', 'civic', 'civic', 'unknown', 'unknown', 'unknown']);
  assert.equal(ERAS.length, 8); assert.equal(USES.length, 10);
});

test('the bundled grid knows the city: old walk-ups downtown, towers in midtown, houses in the boroughs', () => {
  assert.ok(lots.cells > 500000 && LOT_CELL === 50);
  const tally = (cx, cz, radius) => { const counts = { era: new Array(8).fill(0), use: new Array(10).fill(0), n: 0 }; for (let x = cx - radius; x <= cx + radius; x += 50) for (let z = cz - radius; z <= cz + radius; z += 50) { const lot = lots.at(x, z); if (lot) { counts.era[lot.era]++; counts.use[lot.use]++; counts.n++; } } return counts; };
  // SoHo and the Lower East Side: most of what stands was built before 1920.
  const soho = tally(126, -80, 500);
  assert.ok(soho.n > 200 && (soho.era[1] + soho.era[2]) / soho.n > .5, JSON.stringify(soho.era));
  // Eastern Queens (Bellerose): houses, most from the 1920s to the 1950s.
  const queens = tally(24500, -1200, 500);
  assert.ok(queens.use[1] / queens.n > .8 && (queens.era[3] + queens.era[4]) / queens.n > .6, JSON.stringify(queens));
  assert.equal(lots.at(-90000, 0), null, 'nothing is recorded out at sea'); assert.equal(createLots(null).at(0, 0), null); assert.equal(createLots(new ArrayBuffer(4)).cells, 0);
});

test('a facade follows the era and use of what stands there', () => {
  const style = (era, use, height, area = 300, random = .5) => lotStyle({ era, use }, { height, area, random });
  assert.deepEqual([style(2, 2, 18), style(5, 2, 18), style(2, 3, 45), style(5, 3, 45, 3000), style(7, 3, 45), style(3, 6, 80), style(5, 6, 80, 300, .2), style(7, 6, 80), style(2, 5, 25, 900, .2), style(5, 5, 25), style(4, 9, 20), style(1, 1, 11, 120, .2), style(4, 1, 8)],
    ['tenement', 'postwar', 'prewar', 'postwar', 'curtain', 'deco', 'slab', 'curtain', 'loft', 'industrial', 'civic', 'rowhouse', 'house']);
  assert.deepEqual([style(3, 6, 300), style(5, 6, 300, 300, .1), style(7, 3, 300)], ['deco', 'slab', 'supertall'], 'the tallest look like the towers of their time');
  assert.deepEqual([style(0, 2, 18), style(4, 1, 30), lotStyle(null, { height: 20, area: 300, random: .5 }), style(3, 7, 8)], [null, null, null, null], 'where the record does not help, size and place decide');
  for (let era = 0; era < 8; era++) for (let use = 0; use < 10; use++) for (const height of [6, 12, 20, 40, 80, 160, 300]) for (const random of [0, .5, .999]) { const chosen = style(era, use, height, 400, random); assert.ok(chosen === null || chosen in STYLE_INDEX, `${era} ${use} ${height}: ${chosen}`); }
});

test('the building chooser uses the record when it has one, and is as it was without', () => {
  const volume = { height: 20, area: 320, x: 9000, z: 9000, random: .3, random2: .6 }, before = chooseStyle(volume);
  setLots({ cells: 1, at: () => ({ era: 5, use: 2 }) });
  assert.equal(STYLES[chooseStyle(volume).style].id, 'postwar');
  setLots({ cells: 1, at: () => ({ era: 2, use: 2 }) });
  assert.equal(STYLES[chooseStyle(volume).style].id, 'tenement');
  // In the old loft districts a building of before 1940 is mostly a loft, whatever it is used as now.
  const lofts = Array.from({ length: 100 }, (_, i) => STYLES[chooseStyle({ height: 24, area: 500, x: 126, z: -80, random: (i + .5) / 100, random2: .4 }).style].id);
  assert.ok(lofts.filter(id => id === 'loft').length >= 75);
  setLots(null);
  assert.deepEqual(chooseStyle(volume), before);
});
