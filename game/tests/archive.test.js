import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { ARCHIVE } from '../dist/archive-collection.js';
import { ARCHIVE_PIECES, archiveItem, archiveStock } from '../dist/archive-stock.js';
import { fittingStock, fittedLook, purchaseStock, ownsWearable } from '../dist/shop-stock.js';
import { tidyPerson, DEFAULT_PERSON } from '../dist/human-designs.js';
import { lookOf } from '../dist/human-looks.js';
import { createHuman } from '../dist/human.js';

const assets = new URL('../dist/human/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('human.json', assets)));
const recipes = readdirSync(new URL('../data/archive-collection/', import.meta.url)).filter(name => name.endsWith('.json'))
  .flatMap(name => JSON.parse(readFileSync(new URL('../data/archive-collection/' + name, import.meta.url))));
const parts = new Map(manifest.parts.map(part => [part.kind + '/' + part.id, part]));
const partOf = piece => parts.get((piece.slot === 'shoes' ? 'shoes/' : 'garment/') + piece.id);

test('the collection is the hundred pieces of the list, each with a maker, a season and a price', () => {
  assert.deepEqual(ARCHIVE_PIECES.map(piece => piece.n), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.equal(new Set(ARCHIVE.map(piece => piece.id)).size, ARCHIVE.length);
  for (const piece of ARCHIVE_PIECES) {
    assert.match(piece.id, /^[a-z][a-z0-9-]{1,46}[a-z]$/, piece.id);
    assert.ok(piece.designer && piece.name && piece.season, piece.id);
    assert.ok(Number.isFinite(piece.price) && piece.price >= 100, piece.id + ' price');
    assert.ok(['top', 'bottom', 'shoes', 'bag'].includes(piece.slot), piece.id + ' slot');
  }
  // What the game reads is what the recipes say.
  assert.deepEqual(ARCHIVE.map(piece => piece.id).sort(), recipes.map(piece => piece.id).sort());
});

test('every piece that is worn has its mesh, its two pictures and its own colours', () => {
  for (const piece of ARCHIVE) {
    if (piece.slot === 'bag') continue;
    const part = partOf(piece);
    assert.ok(part, piece.id + ' is not in human.json: run scripts/build-human.mjs');
    assert.equal(piece.slot === 'shoes' ? part.kind : part.slot, piece.slot, piece.id);
    assert.ok(part.ownColour, piece.id);
    for (const map of [part.map, part.normal]) assert.ok(existsSync(new URL('tex/' + map, assets)), piece.id + ' ' + map);
    if (piece.with) assert.ok(ARCHIVE.find(other => other.id === piece.with)?.part, piece.id + ' is sold with a piece that is not a part');
  }
});

test('a cut coat, trousers and boots fit a small woman and a heavy man without a point out of place', () => {
  const binary = name => Uint8Array.from(readFileSync(new URL(name, assets))).buffer;
  const rig = JSON.parse(readFileSync(new URL('../dist/motion.json', import.meta.url)));
  const human = createHuman(manifest, binary('body.bin'), binary('parts.bin'), rig);
  const top = ARCHIVE_PIECES.find(piece => piece.slot === 'top' && /parka|coat/i.test(piece.name)), bottom = ARCHIVE_PIECES.find(piece => piece.slot === 'bottom'), shoes = ARCHIVE_PIECES.find(piece => piece.slot === 'shoes');
  for (const body of [{ sex: 1, height: 1.52, weight: -.4 }, { sex: 0, height: 1.92, weight: .9, muscle: .5 }]) {
    const design = tidyPerson({ ...DEFAULT_PERSON, ...body, top: top.id, bottom: bottom.id, shoes: shoes.id }), dressed = lookOf(design, human);
    const made = human.build({ ...design, wear: dressed.wear }, { detail: 'close' });
    for (const id of [top.id, bottom.id, shoes.id]) {
      const piece = made.pieces.find(p => p.id === id);
      assert.ok(piece, id + ' is worn');
      let low = Infinity, high = -Infinity;
      for (let i = 0; i < piece.position.length; i += 3) {
        assert.ok(Number.isFinite(piece.position[i] + piece.position[i + 1] + piece.position[i + 2]), id);
        low = Math.min(low, piece.position[i + 1]); high = Math.max(high, piece.position[i + 1]);
      }
      assert.ok(low > -.03 && high < body.height, id + ' lies between the ground and the top of the head');
      // A cut garment says which bones move it; their shares come to one.
      for (let i = 0; i < piece.skinWeight.length; i += 4) assert.ok(Math.abs(piece.skinWeight[i] + piece.skinWeight[i + 1] + piece.skinWeight[i + 2] + piece.skinWeight[i + 3] - 1) < .02, id + ' weights');
    }
    // Its colours are its own, whatever dye the wearer last chose.
    assert.equal(dressed.look.colours['garment/' + top.id], undefined);
  }
});

test('a house sells its own, the resale market sells everything, and a corner vintage shop has finds', () => {
  const everything = fittingStock({ kind: 'clothes', name: 'THE REALREAL' });
  assert.deepEqual(everything.map(item => item.archive), ARCHIVE_PIECES.map(piece => piece.n));
  const rick = fittingStock({ kind: 'clothes', name: 'RICK OWENS' });
  assert.ok(rick.length >= 8 && rick.every(item => item.name.startsWith('Rick Owens')));
  const vintage = fittingStock({ kind: 'clothes', name: 'L TRAIN VINTAGE' });
  assert.ok(vintage.length === 12 && vintage.every(item => item.price <= 1500));
  assert.deepEqual(vintage, fittingStock({ kind: 'clothes', name: 'L TRAIN VINTAGE' }));
  assert.notDeepEqual(vintage.map(item => item.sku), fittingStock({ kind: 'clothes', name: 'MONK VINTAGE' }).map(item => item.sku));
  // An ordinary shop is as it was, and a department store keeps its own lines beside the houses it carries.
  assert.equal(archiveStock({ kind: 'clothes', name: 'GU' }), null);
  assert.equal(archiveStock({ kind: 'pizza', name: 'PRADA PIZZA' }), null);
  const saks = fittingStock({ kind: 'department', name: 'SAKS FIFTH AVENUE' });
  assert.ok(saks.some(item => item.sku === 'tee-chalk') && saks.some(item => item.archive));
});

test('buying a piece puts it on, a suit puts on both halves, and what is bought is kept', () => {
  const shop = { kind: 'clothes', name: 'THE REALREAL' }, stock = fittingStock(shop);
  const sim = { room: { place: shop }, cash: 1e6, buy(item) { if (item.price > this.cash) return false; this.cash -= item.price; return true; } };
  const jacket = stock.find(item => ARCHIVE.find(piece => piece.id === item.sku).with), bag = stock.find(item => item.slot === 'bag'), boots = stock.find(item => item.slot === 'shoes');
  const suited = tidyPerson(fittedLook(DEFAULT_PERSON, jacket));
  assert.equal(suited.top, jacket.sku); assert.equal(suited.bottom, ARCHIVE.find(piece => piece.id === jacket.sku).with);
  assert.equal(tidyPerson(fittedLook(DEFAULT_PERSON, bag)).bag, 'nylon backpack');
  assert.equal(tidyPerson(fittedLook(DEFAULT_PERSON, boots)).shoes, boots.sku);
  assert.equal(purchaseStock(sim, shop, jacket).paid, jacket.price);
  assert.ok(ownsWearable(sim, jacket));
  assert.equal(purchaseStock(sim, shop, jacket).paid, 0);
  assert.equal(purchaseStock({ ...sim, cash: 10, purchases: {} }, shop, boots), null);
  for (const piece of ARCHIVE_PIECES) assert.equal(archiveItem(piece).price, piece.price);
});
