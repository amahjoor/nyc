#!/usr/bin/env node
// What the buildings the city protects are and are faced with, from the
// Landmarks Preservation Commission's database of individual landmarks and
// every building in a historic district: its type (row house, tenement,
// store and lofts, church) and its main facade material (brownstone, brick,
// limestone, cast iron). Each is kept as where its middle is and one byte
// (dist/landmark-buildings.bin). Names of the individual landmarks, with
// where they are, go to dist/landmarks.json for the map and the search.
// Architects' and owners' names in the database are not read.
//
// usage: node scripts/build-landmarks.mjs
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';
import { typeOf, materialOf, BUILDING_TYPES, FACINGS } from '../dist/landmarks.js';

const BUILDINGS = { url: 'https://data.cityofnewyork.us/resource/gpmc-yuvp.json', page: 'https://data.cityofnewyork.us/d/7mgd-s57w', name: 'Individual Landmark and Historic District Building Database', agency: 'NYC Landmarks Preservation Commission' };
const SITES = { url: 'https://data.cityofnewyork.us/resource/buis-pvji.json', page: 'https://data.cityofnewyork.us/d/buis-pvji', name: 'Individual Landmark Sites', agency: 'NYC Landmarks Preservation Commission' };
const dist = new URL('../dist/', import.meta.url);
const rows = async (source, query) => { const all = []; for (let offset = 0; ; offset += 20000) { const page = await (await fetch(`${source.url}?${new URLSearchParams({ ...query, $limit: '20000', $offset: String(offset), $order: ':id' })}`)).json(); if (!Array.isArray(page)) throw new Error(`${source.name}: ${JSON.stringify(page).slice(0, 200)}`); all.push(...page); if (page.length < 20000) return all; } };
const middle = geometry => { let sx = 0, sz = 0, n = 0; for (const polygon of geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : []) for (const [lon, lat] of polygon[0]) { const [x, z] = projectPoint(lon, lat); sx += x; sz += z; n++; } return n ? [sx / n, sz / n] : null; };

console.log('reading the building database');
const records = [];
for (const row of await rows(BUILDINGS, { $select: 'the_geom,build_type,mat_prim' })) {
  const type = typeOf(row.build_type), facing = materialOf(row.mat_prim), at = middle(row.the_geom);
  if (!at || (!type && !facing) || Math.abs(at[0]) > 32000 || Math.abs(at[1]) > 32000) continue;
  records.push([Math.round(at[0]), Math.round(at[1]), type | (facing << 4)]);
}
records.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
// Each building: two whole numbers for where it is, in metres, and a byte for what it is, padded to six bytes.
const file = new DataView(new ArrayBuffer(records.length * 6));
records.forEach(([x, z, code], i) => { file.setInt16(i * 6, x, true); file.setInt16(i * 6 + 2, z, true); file.setUint8(i * 6 + 4, code); });
writeFileSync(new URL('landmark-buildings.bin', dist), new Uint8Array(file.buffer));
const tally = (names, pick) => names.map((name, i) => `${name} ${records.filter(record => pick(record[2]) === i).length}`).slice(1).join(', ');
console.log(`${records.length} buildings, ${(file.byteLength / 1024).toFixed(0)} KB`); console.log('types:', tally(BUILDING_TYPES, code => code & 15)); console.log('faced with:', tally(FACINGS, code => code >> 4));

console.log('reading the individual landmarks');
const seen = new Set(), sites = [];
for (const row of await rows(SITES, { $select: 'lpc_name,latitude,longitude,landmarkty', $where: 'latitude IS NOT NULL' })) {
  const name = String(row.lpc_name || '').replace(/\s+/g, ' ').trim(), [x, z] = projectPoint(Number(row.longitude), Number(row.latitude)).map(Math.round);
  if (!name || !Number.isFinite(x) || Math.abs(x) > 40000 || Math.abs(z) > 40000 || seen.has(name.toUpperCase())) continue;
  seen.add(name.toUpperCase()); sites.push([name, x, z]);
}
sites.sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(new URL('landmarks.json', dist), JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin',
  sources: { sites: { name: SITES.name, agency: SITES.agency, url: SITES.page }, buildings: { name: BUILDINGS.name, agency: BUILDINGS.agency, url: BUILDINGS.page } }, row: ['name', 'x', 'z'], landmarks: sites }));
console.log(`${sites.length} named landmarks`);
