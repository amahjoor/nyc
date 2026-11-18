#!/usr/bin/env node
// Fetch the logos of the chains the game signs in their own colours, from
// Wikimedia Commons by way of Wikidata's "logo image" for each company, into
// dist/logos/ with an index of where each came from.
//
// THE LOGOS ARE NOT PART OF THE REPOSITORY. They are trademarks, and many are
// copyrighted artwork, of the companies they belong to; dist/logos/ is
// ignored by git. Run this to have them on your own machine. Without them a
// chain's sign is its name in its colours.
//
// Wikidata is asked once, for every chain together; the images are then
// fetched one at a time with a pause between, because Wikimedia limits how
// often it may be asked. What is already in dist/logos/ is kept, so a run
// that is cut short carries on when run again. The match is by name: read
// dist/logos/index.json afterwards, and delete any that is not the chain.
//
// usage: node scripts/build-logos.mjs [--only key,key]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { brandNames } from '../dist/places.js';

const out = new URL('../dist/logos/', import.meta.url), AGENT = { 'user-agent': 'city-explorer-build/1.0 (logo fetch for a local game build)' };
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
// Other names a chain is filed under.
const ALSO = { 'chipotle-mexican-grill': ['Chipotle'], popeyes: ['Popeyes Louisiana Kitchen'], 'domino-s': ["Domino's Pizza"], 'target-corporation': ['Target', 'Target Corporation'], 'charter-spectrum': ['Charter Spectrum'],
  'golden-krust-caribbean-bakery-grill': ['Golden Krust'], 'joe-the-juice': ['Joe & the Juice'], 'apple-bank-for-savings': ['Apple Bank'], 'equinox-fitness': ['Equinox'], 'gregorys-coffee': ["Gregory's Coffee"], ihop: ['International House of Pancakes'] };
// Not the company: things that share its name, or the group that owns it.
const OTHER = /rapid transit|railway|film|album|song|village|town in|city in|river|family name|given name|disambiguation|video game|television|novel|band|ship|mountain|species|genus|arena|stadium|holding company|parent company|restaurant in /i;
const plain = name => name.replace(/\s*\(.*?\)/g, '').replace(/,? (Inc\.|N\.A\.|Corporation)$/, '');

mkdirSync(out, { recursive: true });
const index = { version: 1, generated: new Date().toISOString().slice(0, 10), note: 'Logos are trademarks of their owners, fetched from Wikimedia Commons for a local build. Not for redistribution with the game.', logos: {} };
if (existsSync(new URL('index.json', out))) Object.assign(index.logos, JSON.parse(readFileSync(new URL('index.json', out), 'utf8')).logos);
const wanted = brandNames().filter(([key]) => !index.logos[key] && (!only || only.has(key)));
if (!wanted.length) { console.log(`${Object.keys(index.logos).length} logos in dist/logos/; nothing to fetch`); process.exit(0); }

// One question: everything called, or also called, one of these names in English that has a logo, and what it is.
const names = new Map();
for (const [key, name] of wanted) for (const written of [plain(name), ...(ALSO[key] || [])]) names.set(written, key);
const values = [...names.keys()].map(name => `"${name.replace(/"/g, '\\"')}"@en`).join(' ');
const query = `SELECT DISTINCT ?name ?item ?logo ?about WHERE { VALUES ?name { ${values} } { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name } ?item wdt:P154 ?logo. OPTIONAL { ?item schema:description ?about FILTER(LANG(?about) = "en") } }`;
const answer = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { ...AGENT, accept: 'application/sparql-results+json' } });
if (!answer.ok) { console.log(`Wikidata answered ${answer.status}: try again in a while.`); process.exit(1); }
const found = new Map();
for (const row of (await answer.json()).results.bindings) {
  const key = names.get(row.name.value), about = row.about?.value || '';
  if (!key || OTHER.test(about) || found.has(key)) continue;
  found.set(key, { id: row.item.value.split('/').pop(), logo: row.logo.value, about, brand: row.name.value });
}

const missed = wanted.map(([key]) => key).filter(key => !found.has(key));
let limited = false, fetched = 0;
for (const [key, entry] of found) {
  if (limited) { missed.push(key); continue; }
  try {
    // Commons renders a vector logo to a PNG of the width asked for.
    const response = await fetch(`${entry.logo.replace(/^http:/, 'https:')}?width=640`, { headers: AGENT }), type = response.headers.get('content-type') || '';
    if (response.status === 429) { limited = true; missed.push(key); continue; }
    // A JPEG filed as a "logo image" has every time been a photograph of a shop: not wanted.
    if (!response.ok || !/image\/png/.test(type)) { missed.push(key); continue; }
    writeFileSync(new URL(`${key}.png`, out), Buffer.from(await response.arrayBuffer()));
    index.logos[key] = { file: `${key}.png`, brand: entry.brand, about: entry.about, wikidata: entry.id, source: decodeURIComponent(entry.logo).replace('http://commons.wikimedia.org/wiki/Special:FilePath/', 'https://commons.wikimedia.org/wiki/File:').replace(/ /g, '_') };
    writeFileSync(new URL('index.json', out), JSON.stringify(index, null, 1));
    process.stdout.write(`\r${++fetched} fetched`);
  } catch { missed.push(key); }
  await new Promise(resolve => setTimeout(resolve, 4000));
}
writeFileSync(new URL('index.json', out), JSON.stringify(index, null, 1));
if (limited) console.log('\nWikimedia asked for fewer requests: stopped early. Run again in a while for the rest.');
console.log(`\n${Object.keys(index.logos).length} logos in dist/logos/; none for: ${missed.join(', ') || 'none'}`);
