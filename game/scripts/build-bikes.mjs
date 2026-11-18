#!/usr/bin/env node
// Where the Citi Bike docking stations are and how many docks each has, from
// the system's own public feed (the General Bikeshare Feed Specification's
// station list). Stations across the Hudson are left out.
//
// usage: node scripts/build-bikes.mjs [--out dist/bikes.json] [--from saved.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const FEED = { url: 'https://gbfs.citibikenyc.com/gbfs/en/station_information.json', page: 'https://citibikenyc.com/system-data', name: 'Citi Bike station information (GBFS)', agency: 'Lyft Bikes and Scooters, for NYC DOT' };
const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const out = argument('--out') || new URL('../dist/bikes.json', import.meta.url).pathname;
const feed = argument('--from') ? JSON.parse(readFileSync(argument('--from'), 'utf8')) : await (await fetch(FEED.url, { headers: { 'user-agent': 'city-explorer-build/1.0' } })).json();
const stations = [];
for (const station of feed.data.stations) {
  // Region 71 is New York City; the others are Jersey City and Hoboken.
  if (String(station.region_id) !== '71') continue;
  const [x, z] = projectPoint(Number(station.lon), Number(station.lat)).map(Math.round), docks = Number(station.capacity) || 0;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 40000 || Math.abs(z) > 40000 || docks < 2) continue;
  stations.push([x, z, docks, String(station.name || '').trim()]);
}
stations.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
writeFileSync(out, JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin', source: { name: FEED.name, agency: FEED.agency, url: FEED.page }, row: ['x', 'z', 'docks', 'name'], stations }));
console.log(`${stations.length} stations, ${stations.reduce((sum, station) => sum + station[2], 0).toLocaleString('en-US')} docks`);
