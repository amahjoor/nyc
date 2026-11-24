// Export the same identities used by the map, signs and clothing shops.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { unpackPlace } from '../dist/places.js';
import { ARCHIVE } from '../dist/archive-collection.js';
import { archiveName } from '../dist/archive-stock.js';

const dist = new URL('../dist/', import.meta.url);
const out = new URL('../docs/business-puns/', import.meta.url);
await mkdir(out, { recursive: true });
const json = async path => JSON.parse(await readFile(new URL(path, dist), 'utf8'));
async function save(name, header, rows) {
  const csv = [header, ...rows].map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
  const file = new URL(name + '.csv', out);
  if (process.argv.includes('--check')) {
    if (csv !== await readFile(file, 'utf8')) throw Error(name + ' catalog needs regeneration');
  } else await writeFile(file, csv);
  console.log(name, rows.length);
}
for (const [source, prefix] of [['places', ''], ['shops', 'o']]) {
  const index = await json(source + '-index.json'), rows = [];
  for (const cell of Object.keys(index.cells).sort()) {
    const tile = await json(index.cells[cell].url);
    for (const [i, row] of tile.places.entries()) {
      const p = unpackPlace(row, prefix + cell + ':' + i, true);
      if (p.group === 'public') continue;
      if (!p.name || p.name === p.registeredName) throw Error('Missing alias for ' + p.id);
      rows.push([p.id, p.kind, p.registeredName, p.name, p.x, p.z]);
    }
  }
  await save(source, ['id', 'kind', 'registered_name', 'display_name', 'world_x', 'world_z'], rows);
}
await save('wardrobe', ['id', 'archive_label', 'display_label'], ARCHIVE.map(p => [p.id, archiveName(p, false), archiveName(p, true)]));
