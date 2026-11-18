#!/usr/bin/env node
// Take out of the bundled places the names that read as a person's own and
// not a trade name (places.js personalNames): such a place keeps its spot and
// its kind and loses its name. build-places.mjs does this as it bundles; this
// does it to bundles already made, without asking the registers again, and
// then the list the search uses should be rebuilt (build-place-search.mjs).
//
// usage: node scripts/scrub-place-names.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { personalNames } from '../dist/places.js';

const dist = new URL('../dist/', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, dist), 'utf8'));
const index = read('places-index.json'), cells = Object.values(index.cells).map(cell => ({ path: cell.url.slice(2), data: read(cell.url.slice(2)) }));
const personal = personalNames(cells.flatMap(cell => cell.data.places.map(row => ({ name: row[3], kind: index.kinds[row[2]] }))));
let scrubbed = 0;
for (const cell of cells) {
  let changed = false;
  for (const row of cell.data.places) if (row[3] && personal.has(row[3])) { row[3] = ''; changed = true; scrubbed++; }
  if (changed) writeFileSync(new URL(cell.path, dist), JSON.stringify(cell.data));
}
console.log(`${scrubbed} names taken out of ${cells.length} cells`);
