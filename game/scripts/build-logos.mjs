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
// Wikimedia limits how fast it may be asked: the script goes slowly, keeps
// what it has, and stops when told it is asking too much. Run it again later
// and it carries on with what is missing.
//
// usage: node scripts/build-logos.mjs [--only key,key]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { brandNames } from '../dist/places.js';

const out = new URL('../dist/logos/', import.meta.url), AGENT = { 'user-agent': 'city-explorer-build/1.0 (logo fetch for a local game build)' };
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ask(url, params) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${url}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`, { headers: AGENT });
    if (response.ok) return response.json();
    if (response.status === 429) throw Object.assign(new Error('asked too much'), { limited: true });
    if (attempt === 2) throw new Error(`${url}: ${response.status}`);
    await wait(3000 * (attempt + 1));
  }
}
// Not the company: things that share its name.
const OTHER = /rapid transit|railway|film|album|song|village|town in|city in|river|family name|given name|disambiguation|video game|television|novel|band|ship|mountain|scientific|species|genus|arena|stadium|holding company|parent company/i;
async function logoOf(name) {
  const plain = name.replace(/\s*\(.*?\)/g, '').replace(/,? (Inc\.|N\.A\.|Corporation)$/, '');
  const found = await ask('https://www.wikidata.org/w/api.php', { action: 'wbsearchentities', search: plain, language: 'en', type: 'item', limit: '7' });
  const ids = (found.search || []).filter(item => !OTHER.test(item.description || '')).map(item => item.id);
  if (!ids.length) return null;
  const { entities } = await ask('https://www.wikidata.org/w/api.php', { action: 'wbgetentities', ids: ids.join('|'), props: 'claims|descriptions|labels', languages: 'en' });
  for (const id of ids) {
    const entity = entities[id], file = entity?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
    // The company itself, not something named after it or the group that owns it.
    if (file && !OTHER.test(entity.descriptions?.en?.value || '')) return { id, label: entity.labels?.en?.value || plain, description: entity.descriptions?.en?.value || '', file };
  }
  return null;
}

mkdirSync(out, { recursive: true });
const index = { version: 1, generated: new Date().toISOString().slice(0, 10), note: 'Logos are trademarks of their owners, fetched from Wikimedia Commons for a local build. Not for redistribution with the game.', logos: {} }, missed = [];
// Carry on from an earlier run.
if (existsSync(new URL('index.json', out))) Object.assign(index.logos, JSON.parse(readFileSync(new URL('index.json', out), 'utf8')).logos);
let limited = false;
for (const [key, name] of brandNames()) {
  if ((only && !only.has(key)) || index.logos[key]) continue;
  if (limited) { missed.push(key); continue; }
  try {
    const logo = await logoOf(name);
    if (!logo) { missed.push(key); continue; }
    // Commons renders any format, vector or not, to a PNG of the width asked for.
    const response = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logo.file)}?width=640`, { headers: AGENT });
    if (response.status === 429) { limited = true; missed.push(key); continue; }
    if (!response.ok || !/image\/(png|jpeg)/.test(response.headers.get('content-type') || '')) { missed.push(key); continue; }
    const extension = /jpeg/.test(response.headers.get('content-type')) ? 'jpg' : 'png';
    writeFileSync(new URL(`${key}.${extension}`, out), Buffer.from(await response.arrayBuffer()));
    index.logos[key] = { file: `${key}.${extension}`, brand: logo.label, about: logo.description, wikidata: logo.id, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(logo.file.replace(/ /g, '_'))}` };
    process.stdout.write(`\r${Object.keys(index.logos).length} fetched`);
  } catch (error) { missed.push(key); if (error.limited) limited = true; }
  await wait(2500);
}
writeFileSync(new URL('index.json', out), JSON.stringify(index, null, 1));
if (limited) console.log('\nWikimedia asked for fewer requests: stopped early. Run again in a while for the rest.');
console.log(`\n${Object.keys(index.logos).length} logos in dist/logos/; none found for: ${missed.join(', ') || 'none'}`);
