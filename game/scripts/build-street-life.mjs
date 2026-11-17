#!/usr/bin/env node
// Bundle the small citywide point datasets that drive street life: where
// signals give pedestrians a head start, where every direction of traffic
// stops for them, how many people DOT counted on the sidewalk, and where bus
// shelters and litter baskets stand. Each is a few thousand points, so they
// ship with the game instead of being requested street by street.
//
// usage: node scripts/build-street-life.mjs [--out dist/street-life.json]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const PORTAL = 'https://data.cityofnewyork.us/resource';
const SOURCES = {
  lpi: { id: 'xc4v-ntf4', name: 'VZV Leading Pedestrian Interval Signals', select: 'long,lat' },
  exclusive: { id: '8kuj-2n3u', name: 'Exclusive Pedestrian Signal (Barnes Dance) Locations', select: 'the_geom' },
  counts: { id: 'cqsj-cfgu', name: 'Bi-Annual Pedestrian Counts', select: '*' },
  shelters: { id: 't4f2-8md7', name: 'Bus Stop Shelters', select: 'longitude,latitude' },
  baskets: { id: '8znf-7b2c', name: 'DSNY Litter Basket Inventory', select: 'longitude,latitude' },
};

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/street-life.json', import.meta.url).pathname;

async function rows(source) {
  const all = [];
  for (let offset = 0; ; offset += 20000) {
    const url = `${PORTAL}/${source.id}.json?$select=${encodeURIComponent(source.select)}&$limit=20000&$offset=${offset}&$order=:id`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${source.name}: ${response.status}`);
    const page = await response.json();
    all.push(...page);
    if (page.length < 20000) return all;
  }
}

// The five boroughs fit well inside this box around the game's origin.
const inCity = (x, z) => Math.abs(x) < 40000 && Math.abs(z) < 40000;
function points(list, lonLat) {
  const seen = new Set(), flat = [];
  for (const row of list) {
    const [lon, lat] = lonLat(row).map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const [x, z] = projectPoint(lon, lat).map(Math.round), key = `${x},${z}`;
    if (!inCity(x, z) || seen.has(key)) continue;
    seen.add(key); flat.push(x, z);
  }
  return flat;
}

const [lpi, exclusive, counted, shelters, baskets] = await Promise.all(Object.values(SOURCES).map(rows));

// Counts: the most recent May or September figure for each period that was
// actually taken. AM is 7 to 9, PM is 4 to 7, both on a weekday; MD is noon
// to 2 on a Saturday.
const PERIOD = /^(?:may|sept|oct|june)_?(\d\d)_(am|pm|md)$/;
const counts = [];
for (const row of counted) {
  const coordinates = row.the_geom?.coordinates;
  if (!Array.isArray(coordinates)) continue;
  const [x, z] = projectPoint(coordinates[0], coordinates[1]).map(Math.round), latest = {};
  for (const [key, value] of Object.entries(row)) {
    const match = PERIOD.exec(key), number = Number(String(value).replace(/,/g, ''));
    if (!match || !Number.isFinite(number) || number <= 0) continue;
    const year = 2000 + Number(match[1]), period = match[2];
    if (!latest[period] || year >= latest[period].year) latest[period] = { year, number };
  }
  if (!latest.am && !latest.pm && !latest.md) continue;
  counts.push({ x, z, at: [row.street_nam, row.from_stree, row.to_street].filter(text => text && !/^\d+$/.test(text)).join(' / ').slice(0, 80),
    // People an hour, from a two- or three-hour count.
    am: latest.am ? Math.round(latest.am.number / 2) : null, pm: latest.pm ? Math.round(latest.pm.number / 3) : null,
    saturday: latest.md ? Math.round(latest.md.number / 2) : null, year: Math.max(...Object.values(latest).map(entry => entry.year)) });
}

const data = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  units: 'metres east (x) and south (z) of 40.7235 N, 74.0015 W, to the nearest metre',
  sources: Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => [key, { name: source.name, url: `https://data.cityofnewyork.us/d/${source.id}` }])),
  lpi: points(lpi, row => [row.long, row.lat]),
  exclusive: points(exclusive, row => row.the_geom?.coordinates || []),
  counts,
  shelters: points(shelters, row => [row.longitude, row.latitude]),
  baskets: points(baskets, row => [row.longitude, row.latitude]),
};
writeFileSync(out, JSON.stringify(data));
console.log(`${out}: ${data.lpi.length / 2} head-start signals, ${data.exclusive.length / 2} all-walk signals, ${data.counts.length} counted sidewalks, ${data.shelters.length / 2} bus shelters, ${data.baskets.length / 2} litter baskets`);
