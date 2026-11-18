#!/usr/bin/env node
// Where restaurants are licensed to seat people outdoors: the city's Dining
// Out NYC licences that have been issued, on the sidewalk or in the roadway.
// Only where each is and which of the two it is are kept.
//
// usage: node scripts/build-dining.mjs [--out dist/dining.json]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const LICENCES = { url: 'https://data.cityofnewyork.us/resource/fpeh-f7ci.json', page: 'https://data.cityofnewyork.us/d/fpeh-f7ci', name: 'Dining Out NYC Locations', agency: 'NYC Department of Transportation' };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/dining.json', import.meta.url).pathname;
const rows = await (await fetch(`${LICENCES.url}?${new URLSearchParams({ $select: 'license_type,latitude,longitude', $where: "license_status='Issued' AND latitude IS NOT NULL", $limit: '50000' })}`)).json();
const seen = new Set(), dining = [];
for (const row of rows) {
  const [x, z] = projectPoint(Number(row.longitude), Number(row.latitude)).map(Math.round), kind = row.license_type === 'Roadway' ? 1 : 0;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 40000 || Math.abs(z) > 40000 || seen.has(`${x},${z},${kind}`)) continue;
  seen.add(`${x},${z},${kind}`); dining.push([x, z, kind]);
}
dining.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
writeFileSync(out, JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin', source: { name: LICENCES.name, agency: LICENCES.agency, url: LICENCES.page, filter: 'licence issued' }, kinds: ['sidewalk', 'roadway'], row: ['x', 'z', 'kind'], dining }));
console.log(`${dining.length} outdoor dining licences: ${dining.filter(row => row[2] === 0).length} on the sidewalk, ${dining.filter(row => row[2] === 1).length} in the roadway`);
