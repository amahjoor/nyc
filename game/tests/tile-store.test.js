import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTileStore } from '../dist/tile-store.js';
import { createCityStream } from '../dist/city-stream.js';

// The browser's Cache Storage, as far as the store uses it.
function fakeStorage() {
  const caches = new Map(), opened = [];
  return { caches, opened, open: async name => {
    opened.push(name);
    if (!caches.has(name)) caches.set(name, new Map());
    const entries = caches.get(name);
    return { match: async url => entries.get(url)?.clone(), put: async (url, response) => { entries.delete(url); entries.set(url, response); },
      keys: async () => [...entries.keys()], delete: async url => entries.delete(url) };
  } };
}
const bytes = (length, seed = 1) => { const data = new Uint8Array(length); for (let i = 0; i < length; i++) data[i] = (i * seed) % 7; return data.buffer; };

test('a tile is kept compressed and comes back byte for byte; what is not there, or is damaged, is a miss', async () => {
  const storage = fakeStorage(), store = createTileStore({ cacheStorage: storage });
  assert.equal(await store.get('a'), null);
  const tile = bytes(200000, 3);
  assert.equal(await store.put('a', tile), true);
  assert.deepEqual(new Uint8Array(await store.get('a')), new Uint8Array(tile));
  const kept = await storage.caches.get('nyc-buildings-v1').get('a').clone().arrayBuffer();
  assert.ok(kept.byteLength < tile.byteLength / 4, `${kept.byteLength} bytes kept for ${tile.byteLength}`);
  assert.deepEqual(storage.opened, ['nyc-buildings-v1'], 'opened once');
  // A damaged entry reads as a miss, and can be forgotten.
  storage.caches.get('nyc-buildings-v1').set('bad', new Response(new Uint8Array([1, 2, 3, 4])));
  assert.equal(await store.get('bad'), null);
  assert.equal(await store.remove('bad'), true); assert.equal(await store.remove('bad'), false);
  // Without the storage there is no store, and one that throws never does so to its caller.
  assert.equal(createTileStore({ cacheStorage: null }), null);
  const broken = createTileStore({ cacheStorage: { open: async () => { throw new Error('denied'); } } });
  assert.equal(await broken.get('a'), null); assert.equal(await broken.put('a', tile), false); assert.equal(await broken.remove('a'), false);
});

test('the store keeps the newest tiles up to its limit', async () => {
  const storage = fakeStorage(), store = createTileStore({ cacheStorage: storage, limit: 50 });
  for (let i = 0; i < 120; i++) await store.put(`tile-${i}`, bytes(64, i + 1));
  const keys = [...storage.caches.get('nyc-buildings-v1').keys()];
  assert.equal(keys.length, 50); assert.equal(keys[0], 'tile-70'); assert.equal(keys.at(-1), 'tile-119');
  assert.equal(await store.get('tile-3'), null); assert.ok(await store.get('tile-119'));
});

test('the building stream reads a kept tile instead of fetching it, and refetches one that will not decode', async t => {
  const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
  const tile = () => {
    const buffer = new ArrayBuffer(8 + 3 * 36 + 16), view = new DataView(buffer);
    view.setUint32(0, 3, true); view.setUint32(4, 1, true);
    [[0, 0, 0], [.0001, 0, 0], [0, .0001, 0]].forEach((point, i) => point.forEach((value, k) => view.setFloat32(8 + (i * 3 + k) * 4, value, true)));
    view.setBigUint64(8 + 3 * 36, 7n, true);
    return buffer;
  };
  const storage = fakeStorage(), soho = { x: 138, z: -100 };
  const launch = () => {
    const asked = [], stream = createCityStream(index, { store: createTileStore({ cacheStorage: storage }), fetcher: async url => { asked.push(url); return { ok: true, arrayBuffer: async () => tile() }; } });
    t.after(() => stream.dispose());
    return { stream, asked };
  };
  const first = launch(), prepared = await first.stream.prepareAt(soho, 300);
  assert.ok(prepared.loadedChunks > 5); assert.equal(first.asked.length, prepared.loadedChunks);
  // Kept as each decodes (the copy is written behind the stream's back: give it a moment).
  for (let i = 0; i < 200 && storage.caches.get('nyc-buildings-v1')?.size !== prepared.loadedChunks; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual([...storage.caches.get('nyc-buildings-v1').keys()].sort(), [...first.asked].sort());
  // The next launch: the same place, and nothing asked of the server.
  const second = launch();
  assert.equal((await second.stream.prepareAt(soho, 300)).loadedChunks, prepared.loadedChunks);
  assert.equal(second.asked.length, 0); assert.ok(second.stream.isReadyAt(soho.x, soho.z, 40));
  // One kept copy is spoiled: that tile alone is fetched again, and the good copy replaces it.
  const spoiled = first.asked[0];
  await createTileStore({ cacheStorage: storage }).put(spoiled, new ArrayBuffer(5));
  const third = launch();
  assert.equal((await third.stream.prepareAt(soho, 300)).loadedChunks, prepared.loadedChunks);
  assert.deepEqual(third.asked, [spoiled]);
  for (let i = 0; i < 200; i++) { const kept = await createTileStore({ cacheStorage: storage }).get(spoiled); if (kept?.byteLength === tile().byteLength) break; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.equal((await createTileStore({ cacheStorage: storage }).get(spoiled)).byteLength, tile().byteLength);
});
