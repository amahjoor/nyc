#!/usr/bin/env node
// Count the passenger cars registered in each ZIP code of the five boroughs by
// body type, and those of the whole city by colour, from the state's vehicle
// registrations. The result, dist/fleet.json, is what the cars on each block
// are drawn from.
//
// The register has twelve million rows and each count takes the state's
// server two to three minutes, so allow five. A response saved from an
// earlier run can be given instead of asking again.
//
// usage: node scripts/build-fleet.mjs [--out dist/fleet.json] [--bodies saved.json] [--colours saved.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';
import { BODIES, BODY_OF, PAINTS, paintIndex, SILVER_SHARE } from '../dist/fleet.js';

const REGISTRATIONS = { url: 'https://data.ny.gov/resource/w4pv-hbkt.json', page: 'https://data.ny.gov/d/w4pv-hbkt', name: 'Vehicle, Snowmobile, and Boat Registrations', agency: 'NYS Department of Motor Vehicles' };
// Where each ZIP code is: the middle of the restaurants the city inspects there.
const WHEREABOUTS = { url: 'https://data.cityofnewyork.us/resource/43nn-pn8j.json', page: 'https://data.cityofnewyork.us/d/43nn-pn8j', name: 'DOHMH New York City Restaurant Inspection Results', agency: 'NYC Department of Health and Mental Hygiene' };
const PASSENGER = "record_type='VEH' AND registration_class='PAS' AND county in('NEW YORK','KINGS','QUEENS','BRONX','RICHMOND')";
const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const out = argument('--out') || new URL('../dist/fleet.json', import.meta.url).pathname;

async function ask(source, query) {
  const response = await fetch(`${source.url}?${new URLSearchParams(query)}`, { signal: AbortSignal.timeout(280000) });
  if (!response.ok) throw new Error(`${source.name}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.json();
}
const counted = (saved, fields) => saved ? Promise.resolve(JSON.parse(readFileSync(saved, 'utf8'))) : ask(REGISTRATIONS, { $select: `${fields},count(*) as n`, $where: PASSENGER, $group: fields, $limit: '50000' });

console.log('counting registrations by body and by colour, and finding each ZIP code');
const [bodies, colours, middles] = await Promise.all([counted(argument('--bodies'), 'zip,body_type'), counted(argument('--colours'), 'color'),
  ask(WHEREABOUTS, { $select: 'zipcode,avg(latitude) as lat,avg(longitude) as lon,count(*) as n', $where: 'latitude > 1', $group: 'zipcode', $limit: '2000' })]);

const zips = new Map();
const entry = zip => { if (!zips.has(zip)) zips.set(zip, { cars: 0, bodies: new Array(BODIES.length).fill(0) }); return zips.get(zip); };
const city = { cars: 0, bodies: new Array(BODIES.length).fill(0), paints: new Array(PAINTS.length).fill(0) }, unknown = { bodies: 0, paints: 0 };
for (const row of bodies) {
  const shares = BODY_OF[row.body_type], n = Number(row.n) || 0;
  if (!shares || !/^\d{5}$/.test(row.zip || '')) { unknown.bodies += n; continue; }
  const here = entry(row.zip); here.cars += n; city.cars += n;
  for (const [body, share] of Object.entries(shares)) { here.bodies[BODIES.indexOf(body)] += n * share; city.bodies[BODIES.indexOf(body)] += n * share; }
}
const grey = PAINTS.findIndex(([code]) => code === 'GY'), silver = PAINTS.findIndex(([code]) => code === 'SL');
for (const row of colours) {
  const index = paintIndex(row.color), n = Number(row.n) || 0;
  if (index < 0) { unknown.paints += n; continue; }
  // The register has no silver: it is among the greys.
  if (index === grey) { city.paints[grey] += n * (1 - SILVER_SHARE); city.paints[silver] += n * SILVER_SHARE; } else city.paints[index] += n;
}
const permille = counts => { const total = counts.reduce((sum, count) => sum + count, 0) || 1; return counts.map(count => Math.round(count / total * 1000)); };
const list = [];
for (const row of middles) {
  const here = zips.get(row.zipcode);
  // A ZIP code needs somewhere to be and cars enough to speak of.
  if (!here || here.cars < 150 || Number(row.n) < 5) continue;
  const [x, z] = projectPoint(Number(row.lon), Number(row.lat)).map(Math.round);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 40000 || Math.abs(z) > 40000) continue;
  list.push([row.zipcode, x, z, here.cars, permille(here.bodies)]);
}
list.sort((a, b) => a[0].localeCompare(b[0]));
const fleet = { version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin; shares in parts per thousand',
  sources: { registrations: { name: REGISTRATIONS.name, agency: REGISTRATIONS.agency, url: REGISTRATIONS.page, filter: PASSENGER }, whereabouts: { name: WHEREABOUTS.name, agency: WHEREABOUTS.agency, url: WHEREABOUTS.page } },
  bodies: BODIES, paints: PAINTS.map(([, hex]) => hex), paintCodes: PAINTS.map(([code]) => code),
  city: { cars: city.cars, bodies: permille(city.bodies), paints: permille(city.paints) }, zips: list };
writeFileSync(out, JSON.stringify(fleet));
console.log(`${city.cars.toLocaleString('en-US')} passenger cars in ${list.length} ZIP codes; ${unknown.bodies.toLocaleString('en-US')} of other body types and ${unknown.paints.toLocaleString('en-US')} of other colours left out`);
console.log('city bodies', BODIES.map((body, i) => `${body} ${fleet.city.bodies[i] / 10}%`).join(', '));
console.log('city paints', PAINTS.map(([code], i) => `${code} ${fleet.city.paints[i] / 10}%`).join(', '));
