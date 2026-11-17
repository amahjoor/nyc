#!/usr/bin/env node
// Bundle the subway: every station complex with the lines that stop there and
// where each of its street entrances is, from the MTA's own list.
//
// usage: node scripts/build-transit.mjs [--out dist/transit.json]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const SOURCE = { url: 'https://data.ny.gov/resource/i9wp-a4ja.json', page: 'https://data.ny.gov/d/i9wp-a4ja', name: 'MTA Subway Entrances and Exits: 2024', agency: 'Metropolitan Transportation Authority' };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/transit.json', import.meta.url).pathname;
const response = await fetch(`${SOURCE.url}?${new URLSearchParams({ $select: 'stop_name,daytime_routes,entrance_type,entry_allowed,entrance_latitude,entrance_longitude', $limit: '5000', $order: 'stop_name' })}`);
if (!response.ok) throw new Error(`${SOURCE.name}: ${response.status}`);
// How an entrance is drawn: a stair down from the sidewalk, an elevator, or a door in a building.
const KINDS = ['stair', 'elevator', 'door'];
const kindOf = type => /elevator/i.test(type) ? 1 : /stair|escalator|ramp/i.test(type) ? 0 : 2;
const stations = new Map();
for (const row of await response.json()) {
  const [x, z] = projectPoint(Number(row.entrance_longitude), Number(row.entrance_latitude)).map(Math.round);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 40000 || Math.abs(z) > 40000 || row.entry_allowed === 'NO') continue;
  // The list's complex numbers are not to be trusted (Herald Square and Union Square share one): a station is a name and the lines that stop there.
  const name = String(row.stop_name || '').replace(/\bSquare\b/, 'Sq').trim(), key = `${name}|${String(row.daytime_routes || '').split(/\s+/).filter(Boolean).sort().join(' ')}`;
  if (!name) continue;
  if (!stations.has(key)) stations.set(key, { name, routes: new Set(), entrances: [] });
  const station = stations.get(key);
  for (const route of String(row.daytime_routes || '').split(/\s+/).filter(Boolean)) station.routes.add(route);
  if (!station.entrances.some(([ex, ez]) => Math.hypot(ex - x, ez - z) < 4)) station.entrances.push([x, z, kindOf(row.entrance_type)]);
}
const list = [...stations.values()].filter(station => station.entrances.length && station.routes.size).map(station => ({ name: station.name, routes: [...station.routes].sort().join(' '),
  x: Math.round(station.entrances.reduce((sum, e) => sum + e[0], 0) / station.entrances.length), z: Math.round(station.entrances.reduce((sum, e) => sum + e[1], 0) / station.entrances.length), entrances: station.entrances }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.x - b.x);
writeFileSync(out, JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin', source: { name: SOURCE.name, agency: SOURCE.agency, url: SOURCE.page }, kinds: KINDS, stations: list }));
console.log(`${list.length} stations, ${list.reduce((sum, station) => sum + station.entrances.length, 0)} entrances, ${new Set(list.flatMap(station => station.routes.split(' '))).size} lines`);

// Bus stops: where each stands and the routes that call there, from the MTA's list of stops in effect.
const STOPS = { url: 'https://data.ny.gov/resource/2ucp-7wg5.json', page: 'https://data.ny.gov/d/2ucp-7wg5', name: 'MTA Bus Stops', agency: 'Metropolitan Transportation Authority' };
const rows = [];
for (let offset = 0; ; offset += 40000) {
  const page = await (await fetch(`${STOPS.url}?${new URLSearchParams({ $select: 'stop_id,route_short_name,max(stop_name) as name,max(latitude) as lat,max(longitude) as lon', $where: "in_effect='true'", $group: 'stop_id,route_short_name', $order: 'stop_id', $limit: '40000', $offset: String(offset) })}`)).json();
  rows.push(...page); if (page.length < 40000) break;
}
const stops = new Map();
for (const row of rows) {
  const [x, z] = projectPoint(Number(row.lon), Number(row.lat)).map(Math.round);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 40000 || Math.abs(z) > 40000) continue;
  if (!stops.has(row.stop_id)) stops.set(row.stop_id, { x, z, name: String(row.name || '').replace(/\s+/g, ' ').trim(), routes: new Set() });
  if (row.route_short_name) stops.get(row.stop_id).routes.add(row.route_short_name);
}
const stopList = [...stops.values()].map(stop => [stop.x, stop.z, stop.name, [...stop.routes].sort().join(' ')]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
writeFileSync(out.replace(/transit\.json$/, 'bus-stops.json'), JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin', source: { name: STOPS.name, agency: STOPS.agency, url: STOPS.page }, row: ['x', 'z', 'name', 'routes'], stops: stopList }));
console.log(`${stopList.length} bus stops, ${new Set(stopList.flatMap(stop => stop[3].split(' '))).size} routes`);
