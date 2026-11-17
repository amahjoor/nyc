#!/usr/bin/env node
// The shops that no city or state register lists: clothes, banks,
// laundromats, hardware, florists and the rest, from OpenStreetMap, inside
// the boundary of New York City. They are bundled apart from the places of
// the registers (dist/shops-index.json, dist/shops/) because OpenStreetMap's
// data is under the Open Database Licence and these files stay under it.
//
// The public Overpass server turns away requests when it is busy: a response
// saved from an earlier run can be given instead of asking again.
//
// usage: node scripts/build-shops.mjs [--out dist] [--from saved.json] [--save saved.json]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectPoint } from '../dist/streetscape.js';
import { KINDS, osmKind, tradeName, mergePlaces, packPlace, placeCellKey, PLACE_CELL } from '../dist/places.js';

const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const out = argument('--out') || new URL('../dist', import.meta.url).pathname;
const SERVER = 'https://overpass-api.de/api/interpreter';
const SHOPS = 'clothes|shoes|laundry|dry_cleaning|books|hardware|florist|optician|mobile_phone|jewelry|bicycle|pet|furniture|tattoo|tobacco|cosmetics|toys|gift|department_store|cannabis|sports|stationery|music|art|bag|e-cigarette|copyshop|tailor|travel_agency|massage|houseware';
// Area 3600175905 is the boundary relation of the City of New York.
const QUERY = `[out:json][timeout:240];area(3600175905)->.nyc;(nwr["shop"~"^(${SHOPS})$"](area.nyc);nwr["amenity"~"^(bank|post_office|cinema|veterinary|dentist|clinic)$"](area.nyc);nwr["leisure"="fitness_centre"](area.nyc););out center tags;`;

let text = argument('--from') ? readFileSync(argument('--from'), 'utf8') : null;
if (!text) {
  console.log('asking OpenStreetMap');
  const response = await fetch(SERVER, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'city-explorer-build/1.0' }, body: new URLSearchParams({ data: QUERY }) });
  if (!response.ok) throw new Error(`OpenStreetMap: ${response.status}. The public server is busy; try again in a minute.`);
  text = await response.text();
  if (argument('--save')) writeFileSync(argument('--save'), text);
}
const { elements, osm3s } = JSON.parse(text), entries = [];
for (const element of elements) {
  const tags = element.tags || {}, kind = osmKind(tags), lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon;
  // Shut for good, or not yet open.
  if (!kind || lat === undefined || Object.keys(tags).some(key => /^(disused|abandoned|was|proposed|construction):/.test(key))) continue;
  const [x, z] = projectPoint(Number(lon), Number(lat)).map(Math.round);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 40000 || Math.abs(z) > 40000) continue;
  entries.push({ kind, x, z, name: tradeName(tags.name || tags.brand || '', { trading: true }), bin: 0, rank: 0 });
}
const places = mergePlaces(entries), cells = new Map();
for (const place of places) { const key = placeCellKey(place.x, place.z); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(place); }
rmSync(join(out, 'shops'), { recursive: true, force: true });
mkdirSync(join(out, 'shops'), { recursive: true });
const index = { version: 1, generated: new Date().toISOString().slice(0, 10), asOf: osm3s?.timestamp_osm_base || '', cellSize: PLACE_CELL, kinds: KINDS.map(kind => kind.id), row: ['x', 'z', 'kind', 'name', 'bin', 'area', 'grade'],
  licence: { name: 'Open Database Licence 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', page: 'https://www.openstreetmap.org/copyright' },
  counts: {}, total: places.length, cells: {} };
for (const place of places) index.counts[place.kind] = (index.counts[place.kind] || 0) + 1;
let bytes = 0;
for (const [key, list] of [...cells].sort()) {
  list.sort((a, b) => a.x - b.x || a.z - b.z || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const [cx, cz] = key.split(',').map(Number), file = `${cx}_${cz}.json`, body = JSON.stringify({ version: 1, places: list.map(packPlace) });
  writeFileSync(join(out, 'shops', file), body);
  index.cells[key] = { url: `./shops/${file}`, count: list.length };
  bytes += body.length;
}
writeFileSync(join(out, 'shops-index.json'), JSON.stringify(index));
console.log(`${elements.length} read, ${places.length} shops kept in ${cells.size} cells, ${(bytes / 1048576).toFixed(2)} MB`);
console.log(Object.entries(index.counts).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} ${n}`).join(', '));
