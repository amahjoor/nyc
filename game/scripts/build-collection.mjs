#!/usr/bin/env node
// Which days the Department of Sanitation collects household refuse on each
// block, from its map of collection frequencies: some six hundred sections,
// each with its days ("Mon, Thu"). The sections are laid on a grid of
// hundred-metre cells, one byte a cell with a bit for each day of the week
// (dist/collection.bin). Bags go out at the kerb the evening before.
//
// usage: node scripts/build-collection.mjs [--out dist/collection.bin]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';
import { COLLECTION_CELL, DAYS, daysOf } from '../dist/trash.js';

const SOURCE = { url: 'https://data.cityofnewyork.us/resource/rv63-53db.json', page: 'https://data.cityofnewyork.us/d/rv63-53db', name: 'DSNY Frequencies', agency: 'NYC Department of Sanitation' };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/collection.bin', import.meta.url).pathname;
const rows = await (await fetch(`${SOURCE.url}?${new URLSearchParams({ $select: 'freq_refuse,multipolygon', $limit: '5000' })}`)).json();
const sections = [];
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const row of rows) {
  const days = daysOf(row.freq_refuse), geometry = row.multipolygon;
  if (!days || !geometry) continue;
  for (const polygon of geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]) {
    const ring = polygon[0].map(([lon, lat]) => projectPoint(lon, lat)), box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const [x, z] of ring) { if (x < box.minX) box.minX = x; if (x > box.maxX) box.maxX = x; if (z < box.minZ) box.minZ = z; if (z > box.maxZ) box.maxZ = z; }
    if (!Number.isFinite(box.minX)) continue;
    sections.push({ days, ring, box });
    minX = Math.min(minX, box.minX); maxX = Math.max(maxX, box.maxX); minZ = Math.min(minZ, box.minZ); maxZ = Math.max(maxZ, box.maxZ);
  }
}
minX = Math.floor(minX / COLLECTION_CELL) * COLLECTION_CELL; minZ = Math.floor(minZ / COLLECTION_CELL) * COLLECTION_CELL;
const cols = Math.floor((maxX - minX) / COLLECTION_CELL) + 1, gridRows = Math.floor((maxZ - minZ) / COLLECTION_CELL) + 1, cells = new Uint8Array(cols * gridRows);
const inside = (ring, x, z) => { let within = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) within = !within; } return within; };
// A cell takes the days of the section its middle lies in.
for (const section of sections) for (let gx = Math.floor((section.box.minX - minX) / COLLECTION_CELL); gx <= Math.floor((section.box.maxX - minX) / COLLECTION_CELL); gx++) for (let gz = Math.floor((section.box.minZ - minZ) / COLLECTION_CELL); gz <= Math.floor((section.box.maxZ - minZ) / COLLECTION_CELL); gz++) {
  if (inside(section.ring, minX + (gx + .5) * COLLECTION_CELL, minZ + (gz + .5) * COLLECTION_CELL)) cells[gz * cols + gx] = section.days;
}
const header = new Int32Array([minX, minZ, COLLECTION_CELL, cols, gridRows]), file = new Uint8Array(header.byteLength + cells.length);
file.set(new Uint8Array(header.buffer), 0); file.set(cells, header.byteLength);
writeFileSync(out, file);
const filled = cells.reduce((sum, cell) => sum + (cell ? 1 : 0), 0);
console.log(`${sections.length} sections on ${cols} x ${gridRows} cells, ${filled.toLocaleString('en-US')} with a collection, ${(file.length / 1024).toFixed(0)} KB`);
console.log(DAYS.map((day, i) => `${day} ${cells.reduce((sum, cell) => sum + (cell >> i & 1), 0)}`).join(', '));
console.log(`source: ${SOURCE.name}, ${SOURCE.agency}, ${SOURCE.page}`);
