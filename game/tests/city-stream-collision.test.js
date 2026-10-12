import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCityStream } from '../dist/city-stream.js';

const source = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
const samples = [['brooklyn', 4], ['queens', 301], ['staten-island', 2737]].map(([name, resource], id) => {
  const bytes = gunzipSync(readFileSync(new URL(`./fixtures/i3s-${name}.bin.gz`, import.meta.url)));
  return { node: { ...source.nodes.find(node => node.resource === resource), id, parent: null },
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
});
const index = { ...source, roots: [0, 1, 2], nodes: samples.map(sample => sample.node) };
const point = id => ({ x: samples[id].node.x, z: samples[id].node.z });
const response = sample => ({ ok: true, arrayBuffer: async () => sample.buffer.slice(0) });
const sampleFor = url => samples.find(sample => url.includes(`/nodes/${sample.node.resource}/`));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('cached scenery remains unready until its collision region is published', async t => {
  const publications = [];
  const stream = createCityStream(index, { fetcher: async url => response(sampleFor(url)),
    onCollisionChange: (buildings, status) => publications.push({ buildings, status }) });
  t.after(() => stream.dispose());
  for (const node of index.nodes) await stream.request(node, 0);
  await flush();
  assert.equal(stream.cache.size, 3);
  assert.equal(publications.length, 0, 'background cache fills must not rebuild the gameplay collision grid');
  for (const node of index.nodes) assert.equal(stream.isReadyAt(node.x, node.z, 4), false);
  stream.update(point(0), null, { overview: false });
  assert.equal(publications.length, 1);
  assert.equal(publications[0].status.collisionChunks, 1);
  assert.equal(publications[0].buildings.length, 114, 'publish Brooklyn walls without distant cached Queens and Staten Island');
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), true);
  assert.equal(stream.isReadyAt(...Object.values(point(1)), 4), false);
  stream.update(point(1), null, { overview: true });
  assert.equal(publications.length, 2, 'a cached destination still triggers collision publication');
  assert.equal(publications[1].buildings.length, 425);
  assert.equal(stream.isReadyAt(...Object.values(point(1)), 4), true);
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), false);
  assert.equal(stream.cache.size, 3, 'render cache and physics publication have independent lifetimes');
});

test('destination preparation retains current walls until arrival then releases their collision data', async t => {
  let completeDestination;
  const publications = [];
  const stream = createCityStream(index, { fetcher: async url => {
    const sample = sampleFor(url);
    if (sample.node.id === 2) return new Promise(resolve => { completeDestination = () => resolve(response(sample)); });
    return response(sample);
  }, onCollisionChange: buildings => publications.push(buildings) });
  t.after(() => stream.dispose());
  stream.update(point(0), null, { overview: false });
  await stream.prepareAt(point(0), 40);
  const brooklyn = publications.at(-1);
  assert.equal(brooklyn.length, 114);
  const traveling = stream.prepareAt(point(2), 40);
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), true);
  assert.equal(stream.isReadyAt(...Object.values(point(2)), 4), false);
  completeDestination();await traveling;
  assert.equal(publications.at(-1).length, 114 + 335, 'publish both regions while the player has not moved');
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), true);
  assert.equal(stream.isReadyAt(...Object.values(point(2)), 4), true);
  stream.update(point(2), null, { overview: true });
  assert.equal(publications.at(-1).length, 335);
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), false);
  assert.equal(stream.isReadyAt(...Object.values(point(2)), 4), true);
});

test('failed travel after preparation republishes current walls without retaining the unused destination', async t => {
  let published = [];
  const stream = createCityStream(index, { fetcher: async url => response(sampleFor(url)),
    onCollisionChange: buildings => { published = buildings; } });
  t.after(() => stream.dispose());
  stream.update(point(0), null, { overview: false });await stream.prepareAt(point(0), 40);
  await stream.prepareAt(point(1), 40);
  assert.equal(published.length, 114 + 425);
  // Main retains the player's original position if final placement fails.
  stream.update(point(0), null, { overview: true });
  assert.equal(published.length, 114);
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), true);
  assert.equal(stream.isReadyAt(...Object.values(point(1)), 4), false);
});

test('unrelated loads and unchanged local selections do not repeat collision callbacks', async t => {
  let count = 0;
  const stream = createCityStream(index, { fetcher: async url => response(sampleFor(url)), onCollisionChange: () => count++ });
  t.after(() => stream.dispose());
  stream.update(point(0), null, { overview: false });await stream.prepareAt(point(0), 40);
  const before = count;
  await stream.request(index.nodes[1], 0);
  await stream.request(index.nodes[2], 0);
  await flush();
  assert.equal(count, before);
  stream.update(point(0), null, { overview: true });
  stream.update(point(0), null, { overview: false });
  assert.equal(count, before, 'unchanged published leaf records do not rebuild the simulation grid');
});

test('prepared destination and active collision remain protected under cache pressure', async t => {
  const stream = createCityStream(index, { maxCacheBytes: 1, fetcher: async url => response(sampleFor(url)) });
  t.after(() => stream.dispose());
  stream.update(point(0), null, { overview: false });await stream.prepareAt(point(0), 40);
  await stream.prepareAt(point(2), 40);await flush();stream.evict();
  assert.equal(stream.isReadyAt(...Object.values(point(0)), 4), true);
  assert.equal(stream.isReadyAt(...Object.values(point(2)), 4), true);
  stream.update(point(2), null, { overview: true });
  // Return to street selection so distant overview meshes no longer pin caches.
  stream.update(point(2), null, { overview: false });
  assert.equal(stream.cache.has(0), false);
  assert.equal(stream.isReadyAt(...Object.values(point(2)), 4), true);
});
