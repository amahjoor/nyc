#!/usr/bin/env node
// One list of every named place in the bundles (dist/places, dist/shops), so
// the address search can find a business anywhere in the city without loading
// every cell. Each is given the borough of the street nearest it. No network.
//
// usage: node scripts/build-place-search.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { KINDS } from '../dist/places.js';
import { createRoutePlanner } from '../dist/route-planner.js';

const dist = new URL('../dist/', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, dist), 'utf8'));
const planner = createRoutePlanner(read('navigation-roads.json')), byId = new Map(planner.roads.map(road => [road.id, road]));
const places = [], labels = KINDS.map(kind => kind.label);
for (const index of ['places-index.json', 'shops-index.json'].map(read)) for (const cell of Object.values(index.cells)) for (const [x, z, kind, name] of read(cell.url.slice(2)).places) {
  if (!name) continue;
  const id = index.kinds[kind], which = KINDS.findIndex(known => known.id === id), snapped = planner.snap({ x, z }, { maxSnapDistance: 600 });
  const borough = snapped ? byId.get(snapped.roadId)?.borough || 0 : 0;
  if (which >= 0 && borough) places.push([name, x, z, which, borough]);
}
places.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2] - b[2]);
writeFileSync(new URL('place-names.json', dist), JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), row: ['name', 'x', 'z', 'kind', 'borough'], kinds: labels, places }));
console.log(`${places.length} named places`);
