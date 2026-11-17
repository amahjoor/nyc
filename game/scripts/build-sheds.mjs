#!/usr/bin/env node
// Where there is a sidewalk shed today: every building with a Department of
// Buildings permit for one that has been issued and has not run out. Only
// where each building is and its building number are kept.
//
// usage: node scripts/build-sheds.mjs [--out dist/sheds.json]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const PERMITS = { url: 'https://data.cityofnewyork.us/resource/rbx6-tga4.json', page: 'https://data.cityofnewyork.us/d/rbx6-tga4', name: 'DOB NOW: Build – Approved Permits', agency: 'NYC Department of Buildings' };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/sheds.json', import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 10);
const rows = await (await fetch(`${PERMITS.url}?${new URLSearchParams({ $select: 'bin,max(latitude) as lat,max(longitude) as lon', $where: `work_type='Sidewalk Shed' AND permit_status='Permit Issued' AND expired_date > '${today}T00:00:00' AND latitude IS NOT NULL`, $group: 'bin', $limit: '50000' })}`)).json();
const sheds = [];
for (const row of rows) {
  const [x, z] = projectPoint(Number(row.lon), Number(row.lat)).map(Math.round), bin = Number(row.bin) || 0;
  if (Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) < 40000 && Math.abs(z) < 40000) sheds.push([x, z, bin]);
}
sheds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
writeFileSync(out, JSON.stringify({ version: 1, generated: today, units: 'metres from the game origin', source: { name: PERMITS.name, agency: PERMITS.agency, url: PERMITS.page, filter: 'sidewalk sheds, permit issued and not expired' }, row: ['x', 'z', 'bin'], sheds }));
console.log(`${sheds.length} buildings with a sidewalk shed`);
