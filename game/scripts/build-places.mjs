#!/usr/bin/env node
// Bundle what is at each address in the five boroughs: restaurants, food
// stores, salons and barbers, bars and liquor stores, garages and car
// dealers, hotels, and public buildings. Each comes from the public register
// that licenses or inspects it. The result is one small file per square
// kilometre under dist/places/, and dist/places-index.json to find them by.
//
// usage: node scripts/build-places.mjs [--out dist]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectPoint } from '../dist/streetscape.js';
import { KINDS, cuisineKind, storeKind, tradeName, mergePlaces, packPlace, placeCellKey, PLACE_CELL } from '../dist/places.js';

const CITY = 'https://data.cityofnewyork.us/resource', STATE = 'https://data.ny.gov/resource';
// The five boroughs, for registers that cover the whole state.
const BOX = 'within_box(georeference, 40.93, -74.27, 40.49, -73.68)';
const SOURCES = {
  restaurants: { portal: CITY, id: '43nn-pn8j', name: 'DOHMH New York City Restaurant Inspection Results', agency: 'NYC Department of Health and Mental Hygiene' },
  stores: { portal: STATE, id: '9a8c-vfzj', name: 'Retail Food Stores', agency: 'NYS Department of Agriculture and Markets' },
  beauty: { portal: STATE, id: 'y3u4-jbgh', name: 'Active Appearance Enhancement and Barber Business and Area Renter Licensees', agency: 'NYS Department of State' },
  liquor: { portal: STATE, id: '9s3h-dpkz', name: 'Current Liquor Authority Active Licenses', agency: 'NYS Liquor Authority' },
  licences: { portal: CITY, id: 'w7w3-xahh', name: 'Legally Operating Businesses', agency: 'NYC Department of Consumer and Worker Protection' },
  motor: { portal: STATE, id: 'nhjr-rpi2', name: 'Facilities Licensed by the Department of Motor Vehicles', agency: 'NYS Department of Motor Vehicles' },
  facilities: { portal: CITY, id: 'ji82-xba5', name: 'Facilities Database', agency: 'NYC Department of City Planning' },
};
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist', import.meta.url).pathname;

async function rows(source, query) {
  const all = [], size = 25000;
  for (let offset = 0; ; offset += size) {
    const parameters = new URLSearchParams({ ...query, $limit: String(size), $offset: String(offset) });
    if (!query.$group && !query.$order) parameters.set('$order', ':id');
    let page = null;
    for (let attempt = 0; attempt < 4 && !page; attempt++) {
      const response = await fetch(`${source.portal}/${source.id}.json?${parameters}`);
      if (response.ok) page = await response.json();
      else if (attempt === 3) throw new Error(`${source.name}: ${response.status} ${(await response.text()).slice(0, 200)}`);
      else await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
    all.push(...page);
    if (page.length < size) return all;
  }
}

// The five boroughs fit well inside this box around the game's origin.
const inCity = (x, z) => Math.abs(x) < 40000 && Math.abs(z) < 40000;
// To the metre, which is how a place is stored and how its square kilometre is chosen.
const at = (lon, lat) => { const [x, z] = projectPoint(Number(lon), Number(lat)).map(Math.round); return Number.isFinite(x) && Number.isFinite(z) && inCity(x, z) ? { x, z } : null; };
const point = row => Array.isArray(row.georeference?.coordinates) ? at(row.georeference.coordinates[0], row.georeference.coordinates[1]) : null;
const building = value => { const bin = Number(value); return bin > 1000000 && bin % 1000000 !== 0 ? bin : 0; };
const entries = [], counted = {};
const add = (source, kind, where, extra) => { if (where) { entries.push({ kind, ...where, ...extra }); counted[source] = (counted[source] || 0) + 1; } };

console.log('restaurants');
{
  const [places, grades] = await Promise.all([
    rows(SOURCES.restaurants, { $select: 'camis,max(dba) as dba,max(cuisine_description) as cuisine,max(latitude) as lat,max(longitude) as lon,max(bin) as bin', $group: 'camis', $order: 'camis' }),
    rows(SOURCES.restaurants, { $select: 'camis,grade,max(grade_date) as day', $where: "grade in('A','B','C')", $group: 'camis,grade', $order: 'camis' }),
  ]);
  const latest = new Map();
  for (const row of grades) if (!latest.has(row.camis) || row.day > latest.get(row.camis).day) latest.set(row.camis, row);
  for (const row of places) if (Number(row.lat) > 1) add('restaurants', cuisineKind(row.cuisine), at(row.lon, row.lat), { name: tradeName(row.dba, { trading: true }), bin: building(row.bin), grade: latest.get(row.camis)?.grade || '', rank: 1 });
}

console.log('food stores');
for (const row of await rows(SOURCES.stores, { $select: 'dba_name,entity_name,square_footage,georeference', $where: BOX })) {
  const area = Number(row.square_footage) || 0, name = row.dba_name ? tradeName(row.dba_name, { trading: true }) : tradeName(row.entity_name);
  add('stores', storeKind(row.dba_name || row.entity_name, area), point(row), { name, area, rank: 2 });
}

console.log('salons and barbers');
for (const row of await rows(SOURCES.beauty, { $select: 'license_type,business_name,license_holder_name,georeference', $where: `${BOX} AND license_type in('DOSAEBUSINESS','DOSBARSHOPOWNER')` })) {
  const name = tradeName(row.business_name, { owner: row.license_holder_name });
  const kind = row.license_type === 'DOSBARSHOPOWNER' ? 'barber' : /\bNAILS?\b/i.test(row.business_name || '') ? 'nails' : 'salon';
  add('beauty', kind, point(row), { name, rank: 3 });
}

console.log('bars and liquor stores');
{
  const KINDS_OF_LICENCE = { 'Food & Beverage Business': 'bar', 'Liquor Store': 'liquor', Club: 'club', Cabaret: 'club', 'Legitimate theatre': 'theatre', 'Drug Store': 'pharmacy', Hotel: 'hotel' };
  const list = Object.keys(KINDS_OF_LICENCE).map(text => `'${text}'`).join(',');
  for (const row of await rows(SOURCES.liquor, { $select: 'description,legalname,dba,georeference', $where: `${BOX} AND description in(${list})` })) {
    add('liquor', KINDS_OF_LICENCE[row.description], point(row), { name: row.dba ? tradeName(row.dba, { trading: true }) : tradeName(row.legalname), rank: 5 });
  }
}

console.log('city licences');
{
  const CATEGORIES = { 'Garage & Parking Lot': 'parking', 'Stoop Line Stand': 'fruitstand', Hotel: 'hotel', Electronics: 'electronics', 'Secondhand Dealer - Auto': 'dealer', 'Self-Storage Facility': 'storage',
    Newsstand: 'newsstand', Pawnbroker: 'pawn', 'Tow Truck Company': 'tow', 'Car Wash': 'carwash', 'Secondhand Dealer - General': 'secondhand' };
  const list = Object.keys(CATEGORIES).map(text => `'${text}'`).join(',');
  for (const row of await rows(SOURCES.licences, { $select: 'business_category,business_name,dba_trade_name,latitude,longitude,bin', $where: `license_status='Active' AND latitude IS NOT NULL AND business_category in(${list})` })) {
    const kind = CATEGORIES[row.business_category];
    // A stand or a newsstand is known by what it sells, not by who holds the licence.
    const name = kind === 'fruitstand' || kind === 'newsstand' ? '' : row.dba_trade_name ? tradeName(row.dba_trade_name, { trading: true }) : tradeName(row.business_name);
    add('licences', kind, at(row.longitude, row.latitude), { name, bin: building(row.bin), rank: 4 });
  }
}

console.log('garages and dealers');
{
  const TYPES = { RS: 'repair', RSB: 'bodyshop', DLN: 'dealer', DLU: 'dealer' }, year = new Date().getFullYear(), seen = new Map();
  for (const row of await rows(SOURCES.motor, { $select: 'facility,facility_name,facility_name_overflow,owner_name,business_type,expiration_date,georeference', $where: `${BOX} AND business_type in('RS','RSB','DLN','DLU')` })) {
    // Licences that lapsed years ago are still listed.
    const expires = Number(String(row.expiration_date || '').slice(-4));
    if (expires && expires < year - 1) continue;
    const kind = TYPES[row.business_type], known = seen.get(row.facility);
    // One garage often holds a repair and a body licence: it is one place.
    if (known) { if (kind === 'repair' && known.kind === 'bodyshop') known.kind = 'repair'; continue; }
    const where = point(row);
    if (!where) continue;
    const entry = { kind, ...where, name: tradeName(`${row.facility_name || ''} ${row.facility_name_overflow || ''}`, { owner: row.owner_name }), rank: 3 };
    seen.set(row.facility, entry); entries.push(entry); counted.motor = (counted.motor || 0) + 1;
  }
}

console.log('public buildings');
{
  const GROUPS = { 'PUBLIC K-12 SCHOOLS': 'school', 'CHARTER K-12 SCHOOLS': 'school', 'NON-PUBLIC K-12 SCHOOLS': 'school', 'COLLEGES OR UNIVERSITIES': 'college', 'PUBLIC LIBRARIES': 'library', 'FIRE SERVICES': 'firehouse',
    'POLICE SERVICES': 'police', 'HOSPITALS AND CLINICS': 'hospital', MUSEUMS: 'museum', 'COURTHOUSES AND JUDICIAL': 'courthouse', 'PORTS AND FERRY LANDINGS': 'ferry' };
  const list = Object.keys(GROUPS).map(text => `'${text}'`).join(',');
  for (const row of await rows(SOURCES.facilities, { $select: 'facname,facsubgrp,factype,latitude,longitude,bin', $where: `latitude IS NOT NULL AND facsubgrp in(${list})` })) {
    const kind = GROUPS[row.facsubgrp];
    if (kind === 'hospital' && row.factype !== 'HOSPITAL') continue;
    if (kind === 'firehouse' && row.factype !== 'FIREHOUSE') continue;
    add('facilities', kind, at(row.longitude, row.latitude), { name: tradeName(row.facname, { trading: true }), bin: building(row.bin), rank: 0 });
  }
}

const places = mergePlaces(entries);
const cells = new Map();
for (const place of places) {
  const key = placeCellKey(place.x, place.z);
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(place);
}
rmSync(join(out, 'places'), { recursive: true, force: true });
mkdirSync(join(out, 'places'), { recursive: true });
const index = { version: 1, generated: new Date().toISOString().slice(0, 10), cellSize: PLACE_CELL, kinds: KINDS.map(kind => kind.id), row: ['x', 'z', 'kind', 'name', 'bin', 'area', 'grade'],
  sources: Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => [key, { name: source.name, agency: source.agency, url: `${source.portal.replace('/resource', '')}/d/${source.id}`, read: counted[key] || 0 }])),
  counts: {}, total: places.length, cells: {} };
for (const place of places) index.counts[place.kind] = (index.counts[place.kind] || 0) + 1;
let bytes = 0;
for (const [key, list] of [...cells].sort()) {
  // Nearest the cell's corner first, so the order is the same on every run.
  list.sort((a, b) => a.x - b.x || a.z - b.z || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const [cx, cz] = key.split(',').map(Number), file = `${cx}_${cz}.json`, text = JSON.stringify({ version: 1, places: list.map(packPlace) });
  writeFileSync(join(out, 'places', file), text);
  index.cells[key] = { url: `./places/${file}`, count: list.length };
  bytes += text.length;
}
writeFileSync(join(out, 'places-index.json'), JSON.stringify(index));
console.log(`${entries.length} entries read, ${places.length} places kept in ${cells.size} cells, ${(bytes / 1048576).toFixed(1)} MB`);
console.log(Object.entries(index.counts).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} ${n}`).join(', '));
console.log(`named ${places.filter(place => place.name).length}, with a building number ${places.filter(place => place.bin).length}, graded ${places.filter(place => place.grade).length}`);
