#!/usr/bin/env node
// Who lives in each census tract of the five boroughs: race and Hispanic
// origin (table B03002) and the language spoken at home (C16001) from the
// Census Bureau's 2019-2023 American Community Survey, with where each tract
// is from the city's tract outlines. The Bureau's bulk files cover the whole
// country (about 150 MB between them); only New York City's tracts are kept.
//
// usage: node scripts/build-demographics.mjs [--out dist/demographics.json]
import { writeFileSync } from 'node:fs';
import { projectPoint } from '../dist/streetscape.js';

const FILES = 'https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData';
const TRACTS = { url: 'https://data.cityofnewyork.us/resource/63ge-mke6.json', page: 'https://data.cityofnewyork.us/d/63ge-mke6', name: '2020 Census Tracts', agency: 'NYC Department of City Planning' };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : new URL('../dist/demographics.json', import.meta.url).pathname;
// Counties: the Bronx, Brooklyn, Manhattan, Queens, Staten Island.
const CITY = /^1400000US36(005|047|061|081|085)/;
export const GROUPS = ['white', 'black', 'asian', 'hispanic', 'other'], LANGUAGES = ['english', 'spanish', 'french', 'germanic', 'slavic', 'indoeuropean', 'korean', 'chinese', 'vietnamese', 'tagalog', 'asian', 'arabic', 'other'];

async function table(name, pick) {
  const response = await fetch(`${FILES}/acsdt5y2023-${name}.dat`);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const rows = new Map(), decoder = new TextDecoder(); let rest = '', header = null;
  for await (const chunk of response.body) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split('\n'); rest = lines.pop();
    for (const line of lines) {
      if (!header) { header = line.trim().split('|'); continue; }
      if (!CITY.test(line)) continue;
      const cells = line.trim().split('|'), value = column => Math.max(0, Number(cells[header.indexOf(column)]) || 0);
      rows.set(cells[0].slice(9), pick(value));
    }
  }
  return rows;
}
console.log('reading the survey tables and the tract outlines');
const [race, language, outlines] = await Promise.all([
  // Not Hispanic: white alone, black alone, Asian alone; Hispanic of any race; everyone else.
  table('b03002', v => { const total = v('B03002_E001'), white = v('B03002_E003'), black = v('B03002_E004'), asian = v('B03002_E006'), hispanic = v('B03002_E012'); return { total, shares: [white, black, asian, hispanic, Math.max(0, total - white - black - asian - hispanic)] }; }),
  table('c16001', v => ['002', '003', '006', '009', '012', '015', '018', '021', '024', '027', '030', '033', '036'].map(column => v(`C16001_E${column}`))),
  (async () => { const all = []; for (let offset = 0; ; offset += 500) { const page = await (await fetch(`${TRACTS.url}?${new URLSearchParams({ $select: 'geoid,the_geom', $limit: '500', $offset: String(offset), $order: 'geoid' })}`)).json(); all.push(...page); if (page.length < 500) return all; } })(),
]);
const permille = counts => { const total = counts.reduce((sum, count) => sum + count, 0) || 1; return counts.map(count => Math.round(count / total * 1000)); };
const tracts = [];
for (const row of outlines) {
  const people = race.get(row.geoid), speech = language.get(row.geoid);
  // Parks, airports and cemeteries are tracts too: nobody lives there to count.
  if (!people || people.total < 50 || !row.the_geom) continue;
  let sx = 0, sz = 0, n = 0;
  for (const polygon of row.the_geom.type === 'MultiPolygon' ? row.the_geom.coordinates : [row.the_geom.coordinates]) for (const [lon, lat] of polygon[0]) { const [x, z] = projectPoint(lon, lat); sx += x; sz += z; n++; }
  tracts.push([Math.round(sx / n), Math.round(sz / n), people.total, permille(people.shares), permille(speech || [1])]);
}
const sum = index => permille(GROUPS.map((_, i) => tracts.reduce((total, tract) => total + tract[2] * tract[3][i], 0)));
writeFileSync(out, JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'metres from the game origin; shares in parts per thousand',
  source: { survey: { name: 'American Community Survey 2019-2023 five-year estimates, tables B03002 and C16001', agency: 'U.S. Census Bureau', url: 'https://www.census.gov/programs-surveys/acs/data/summary-file.html' }, tracts: { name: TRACTS.name, agency: TRACTS.agency, url: TRACTS.page } },
  groups: GROUPS, languages: LANGUAGES, city: sum(), row: ['x', 'z', 'residents', 'groups', 'languages'], tracts }));
console.log(`${tracts.length} tracts, ${tracts.reduce((total, tract) => total + tract[2], 0).toLocaleString('en-US')} residents; city: ${GROUPS.map((group, i) => `${group} ${sum()[i] / 10}%`).join(', ')}`);
