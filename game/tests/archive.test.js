import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { ARCHIVE } from '../dist/archive-collection.js';
import { ARCHIVE_PIECES, archiveItem, archiveStock } from '../dist/archive-stock.js';
import { fittingStock, fittedLook, purchaseStock, ownsWearable } from '../dist/shop-stock.js';
import { tidyPerson, DEFAULT_PERSON } from '../dist/human-designs.js';
import { lookOf } from '../dist/human-looks.js';
import { createHuman } from '../dist/human.js';
import { ARCHIVE_LOOKS } from '../dist/archive-looks.js';
import { OFFICERS, archiveForMember, fashionForMember, memberInfo, designOf } from '../dist/human-cast.js';

const assets = new URL('../dist/human/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('human.json', assets)));
const recipes = readdirSync(new URL('../data/archive-collection/', import.meta.url)).filter(name => name.endsWith('.json'))
  .flatMap(name => JSON.parse(readFileSync(new URL('../data/archive-collection/' + name, import.meta.url))));
const parts = new Map(manifest.parts.map(part => [part.kind + '/' + part.id, part]));
const partOf = piece => parts.get((piece.slot === 'shoes' ? 'shoes/' : 'garment/') + piece.id);

test('the collection is the five hundred pieces of the two lists, each with a maker, a season and a price', () => {
  assert.deepEqual(ARCHIVE_PIECES.map(piece => piece.n), Array.from({ length: 500 }, (_, i) => i + 1));
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
    // The first hundred ship in parts.bin; a later chapter has a bin of its own.
    assert.equal(Boolean(part.bin), piece.n > 100, piece.id + ' bin');
    if (part.bin) assert.ok(existsSync(new URL(part.bin + '.bin', assets)), piece.id + ' ' + part.bin);
  }
});

test('a piece of a later chapter is fetched when it is first worn, and what stands in the bag\'s place has a builder', async () => {
  const binary = name => Uint8Array.from(readFileSync(new URL(name, assets))).buffer, fetched = [];
  const rig = JSON.parse(readFileSync(new URL('../dist/motion.json', import.meta.url)));
  const human = createHuman(manifest, binary('body.bin'), binary('parts.bin'), rig, async name => { fetched.push(name); return binary(name + '.bin'); });
  const top = ARCHIVE_PIECES.find(piece => piece.n > 100 && piece.slot === 'top'), shoes = ARCHIVE_PIECES.find(piece => piece.n > 100 && piece.slot === 'shoes');
  const design = tidyPerson({ ...DEFAULT_PERSON, top: top.id, shoes: shoes.id }), dressed = lookOf(design, human);
  assert.ok(dressed.wear.includes('garment/' + top.id) && human.has('garment/' + top.id));
  // Until its bin has come, the piece is left off rather than built wrong.
  assert.ok(!human.build({ ...design, wear: dressed.wear }, { detail: 'close' }).pieces.some(piece => piece.id === top.id));
  await human.ready(dressed.wear); await human.ready(dressed.wear);
  assert.deepEqual(fetched.sort(), [...new Set([partOf(top).bin, partOf(shoes).bin])].sort());
  const made = human.build({ ...design, wear: dressed.wear }, { detail: 'close' });
  for (const id of [top.id, shoes.id]) { const piece = made.pieces.find(p => p.id === id); assert.ok(piece, id); for (const v of piece.position) assert.ok(Number.isFinite(v), id); }
  const { ARCHIVE_ACCESSORIES } = await import('../dist/archive-accessories.js');
  for (const piece of ARCHIVE_PIECES.filter(piece => piece.slot === 'bag')) {
    assert.equal(tidyPerson({ ...DEFAULT_PERSON, bag: piece.bag }).bag, piece.bag, piece.id);
    assert.ok(piece.bag === 'nylon backpack' || typeof ARCHIVE_ACCESSORIES[piece.bag] === 'function', piece.id + ' has no builder');
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
  // An ordinary shop keeps its own lines and adds a rail of the archive, a shoe shop a few pairs; a department store keeps its lines beside the houses it carries.
  const gu = fittingStock({ kind: 'clothes', name: 'GU' });
  assert.ok(gu.some(item => item.sku === 'tee-chalk') && gu.filter(item => item.archive).length === 14);
  assert.notDeepEqual(gu.filter(item => item.archive).map(item => item.sku), fittingStock({ kind: 'clothes', name: 'UNIQLO' }).filter(item => item.archive).map(item => item.sku));
  assert.ok(fittingStock({ kind: 'clothes', name: 'OLD NAVY' }).some(item => item.sku === 'crew-navy'));
  const shoes = fittingStock({ kind: 'shoes', name: 'FOOT LOCKER' }).filter(item => item.archive);
  assert.ok(shoes.length === 6 && shoes.every(item => item.slot === 'shoes'));
  assert.deepEqual(fittingStock('clothes').filter(item => item.archive), []);
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

test('the adults without a preset walk the street in archive looks, each piece with its street pictures', () => {
  const worn = new Map();
  for (let id = 0; id < OFFICERS[0]; id++) {
    const look = archiveForMember(id), info = memberInfo(id);
    if (!look) continue;
    assert.ok(!info.child && !fashionForMember(id) && info.outfit === look.occasion, 'member ' + id);
    assert.ok(look.woman === null || look.woman === info.woman); assert.ok(!(look.young && info.old));
    assert.ok(!worn.has(look), look.name + ' is worn twice'); worn.set(look, id);
    const design = designOf(id, { dials: [] });
    for (const slot of ['top', 'bottom', 'shoes']) if (look.clothes[slot]) assert.equal(design[slot], look.clothes[slot]);
  }
  assert.ok(worn.size >= 20 && ARCHIVE_LOOKS.slice(0, 12).every(look => worn.has(look)));
  for (const look of ARCHIVE_LOOKS) for (const slot of ['top', 'bottom', 'shoes']) {
    const id = look.clothes[slot], part = manifest.parts.find(part => part.id === id && part.slot === slot);
    assert.ok(part, look.name + ' ' + slot);
    if (part.ownColour) for (const map of [part.map, part.normal]) assert.ok(existsSync(new URL('tex/' + map.replace('archive/', 'archive/street/'), assets)), map);
  }
});
