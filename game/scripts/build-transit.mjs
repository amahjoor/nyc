#!/usr/bin/env node
// Bundle the subway: every station complex with the lines that stop there and
// where each of its street entrances is, from the MTA's own list.
//
// usage: node scripts/build-transit.mjs [--out dist/transit.json]
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/transit.json', import.meta.url).pathname;
execFileSync('python3',[fileURLToPath(new URL('./build-subway.py',import.meta.url)),'--out',out],{stdio:'inherit'});

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
writeFileSync(join(dirname(out),'bus-stops.json'), JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin', source: { name: STOPS.name, agency: STOPS.agency, url: STOPS.page }, row: ['x', 'z', 'name', 'routes'], stops: stopList }));
console.log(`${stopList.length} bus stops, ${new Set(stopList.flatMap(stop => stop[3].split(' '))).size} routes`);
