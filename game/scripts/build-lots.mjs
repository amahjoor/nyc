#!/usr/bin/env node
// What stands on each piece of ground, from the city's tax lots (PLUTO): when
// it was built and what kind of building the assessor classes it as. The
// result is a grid fifty metres to the cell over the five boroughs, each cell
// holding the era and the use of the biggest building whose lot is centred in
// it: one byte a cell, dist/lots.bin. Building facades are chosen from it.
//
// The register has over eight hundred thousand lots and is read fifty
// thousand at a time: allow a few minutes.
//
// usage: node scripts/build-lots.mjs [--out dist/lots.bin]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';
import { LOT_CELL, eraOf, useOf, ERAS, USES } from '../dist/lots.js';

const PLUTO = { url: 'https://data.cityofnewyork.us/resource/64uk-42ks.json', page: 'https://data.cityofnewyork.us/d/64uk-42ks', name: 'Primary Land Use Tax Lot Output (PLUTO)', agency: 'NYC Department of City Planning' };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/lots.bin', import.meta.url).pathname;
const lots = [], size = 50000;
for (let offset = 0; ; offset += size) {
  let page = null;
  for (let attempt = 0; attempt < 4 && !page; attempt++) {
    const response = await fetch(`${PLUTO.url}?${new URLSearchParams({ $select: 'latitude,longitude,yearbuilt,bldgclass,bldgarea', $where: 'latitude IS NOT NULL AND bldgarea > 0', $order: 'bbl', $limit: String(size), $offset: String(offset) })}`);
    if (response.ok) page = await response.json(); else if (attempt === 3) throw new Error(`${PLUTO.name}: ${response.status}`); else await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  for (const row of page) {
    const [x, z] = projectPoint(Number(row.longitude), Number(row.latitude)), era = eraOf(Number(row.yearbuilt)), use = useOf(row.bldgclass);
    if (Number.isFinite(x) && Number.isFinite(z) && (era || use)) lots.push({ x, z, era, use, area: Number(row.bldgarea) || 0 });
  }
  process.stdout.write(`\r${lots.length.toLocaleString('en-US')} lots`);
  if (page.length < size) break;
}
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const lot of lots) { if (lot.x < minX) minX = lot.x; if (lot.x > maxX) maxX = lot.x; if (lot.z < minZ) minZ = lot.z; if (lot.z > maxZ) maxZ = lot.z; }
minX = Math.floor(minX / LOT_CELL) * LOT_CELL; minZ = Math.floor(minZ / LOT_CELL) * LOT_CELL;
const cols = Math.floor((maxX - minX) / LOT_CELL) + 1, rows = Math.floor((maxZ - minZ) / LOT_CELL) + 1;
const cells = new Uint8Array(cols * rows), biggest = new Float32Array(cols * rows);
for (const lot of lots) {
  const index = Math.floor((lot.z - minZ) / LOT_CELL) * cols + Math.floor((lot.x - minX) / LOT_CELL);
  if (lot.area > biggest[index]) { biggest[index] = lot.area; cells[index] = lot.era | (lot.use << 4); }
}
// Five whole numbers ahead of the cells: where the grid starts, the size of a cell, and how many across and down.
const header = new Int32Array([minX, minZ, LOT_CELL, cols, rows]), file = new Uint8Array(header.byteLength + cells.length);
file.set(new Uint8Array(header.buffer), 0); file.set(cells, header.byteLength);
writeFileSync(out, file);
const filled = cells.reduce((sum, cell) => sum + (cell ? 1 : 0), 0), count = (list, pick) => list.map((name, i) => `${name} ${lots.filter(lot => pick(lot) === i).length.toLocaleString('en-US')}`).slice(1).join(', ');
console.log(`\n${cols} x ${rows} cells, ${filled.toLocaleString('en-US')} with a building, ${(file.length / 1024).toFixed(0)} KB`);
console.log('built:', count(ERAS, lot => lot.era)); console.log('use:', count(USES, lot => lot.use));
console.log(`source: ${PLUTO.name}, ${PLUTO.agency}, ${PLUTO.page}`);
