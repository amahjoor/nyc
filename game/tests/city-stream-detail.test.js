import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCityStream } from '../dist/city-stream.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
// The smallest tile the decoder accepts: one building that is one flat triangle ten metres across.
function tinyTile() {
  const buffer = new ArrayBuffer(8 + 3 * 36 + 16), view = new DataView(buffer);
  view.setUint32(0, 3, true); view.setUint32(4, 1, true);
  [[0, 0, 0], [.0001, 0, 0], [0, .0001, 0]].forEach((point, i) => point.forEach((value, k) => view.setFloat32(8 + (i * 3 + k) * 4, value, true)));
  view.setBigUint64(8 + 3 * 36, 7n, true); view.setUint32(8 + 3 * 36 + 8, 0, true); view.setUint32(8 + 3 * 36 + 12, 0, true);
  return buffer;
}
function fixture(options = {}) {
  const asked = [];
  const stream = createCityStream(index, { fetcher: async url => { asked.push(Number(url.match(/nodes\/(\d+)\//)[1])); return { ok: true, arrayBuffer: async () => tinyTile() }; }, ...options });
  const settle = async () => { for (let i = 0; i < 400 && stream.getStatus().loading; i++) await new Promise(resolve => setTimeout(resolve, 2)); assert.equal(stream.getStatus().loading, 0); };
  const visible = () => new Set([...stream.cache.values()].filter(record => record.mesh.visible).map(record => record.node.id));
  return { stream, asked, settle, visible };
}
const soho = { x: 138, z: -100 };

test('from high above, a place asked for in detail is drawn in full, and the far city stays coarse', async t => {
  const f = fixture(); t.after(() => f.stream.dispose());
  const leaves = f.stream.nearby(soho, 1200), ids = new Set(leaves.map(node => node.id));
  assert.ok(leaves.length > 30 && leaves.every(node => !node.children.length));
  // Three kilometres up, as the stream is for an aircraft: only what is straight below is refined.
  f.stream.update(soho, null, { altitude: 2940 }); await f.settle();
  const coarse = f.stream.desired.size, under = leaves.filter(node => f.stream.desired.has(node.id)).length;
  assert.ok(coarse > 0 && under < leaves.length * .6, `${under} of ${leaves.length} in detail`);
  // The same view with the place wanted in detail: acted on at once, not at the next third of a second.
  f.stream.update(soho, null, { altitude: 2940, detail: [{ ...soho, radius: 1200 }] });
  assert.ok(leaves.every(node => f.stream.desired.has(node.id)), 'every full-detail tile within the circle');
  await f.settle(); f.stream.showSelection();
  const seen = f.visible();
  assert.ok(leaves.every(node => seen.has(node.id)), 'and they are what is drawn');
  // Each is drawn in place of its coarse parents, never on top of them.
  for (const node of leaves) for (let parent = f.stream.nodes.get(node.id).parent; parent !== null && parent !== undefined; parent = f.stream.nodes.get(parent).parent) assert.ok(!seen.has(parent));
  // Away from the circle the city is as coarse as before.
  const far = f.stream.nearby({ x: 14000, z: -4500 }, 800);
  assert.ok(far.length > 0 && far.every(node => !f.stream.desired.has(node.id)));
  assert.ok(f.stream.desired.size > coarse);
  // Two places at once: the one being left and the one being arrived at.
  const flushing = { x: 14000, z: -4500 };
  f.stream.update(soho, null, { altitude: 2940, detail: [{ ...soho, radius: 600 }, { ...flushing, radius: 600 }] });
  for (const place of [soho, flushing]) assert.ok(f.stream.nearby(place, 600).every(node => f.stream.desired.has(node.id)));
  // A map of the whole city is never refined.
  f.stream.update(soho, null, { overview: true, detail: [{ ...soho, radius: 1200 }] });
  assert.ok(![...f.stream.desired].some(id => ids.has(id)));
});

test('scenery fetched ahead is kept, unseen, until it is wanted or let go', async t => {
  // A cache with no room to spare: anything not held is dropped as soon as it is not on screen.
  const f = fixture({ maxCacheBytes: 0 }); t.after(() => f.stream.dispose());
  const leaves = f.stream.nearby(soho, 700);
  f.stream.update({ x: 14000, z: -4500 }, null, { overview: true }); await f.settle();
  const before = f.asked.length;
  const result = await f.stream.prepareScenery([{ ...soho, radius: 700 }, { ...soho, radius: 300 }]);
  // The tiles inside the circles, and the neighbours that share a parent with them: a parent gives way only to all its children.
  assert.ok(result.ready && result.chunks >= leaves.length && result.chunks < leaves.length * 3 && result.loadedChunks === result.chunks, JSON.stringify(result));
  assert.equal(f.asked.length - before, result.chunks, 'each tile fetched once, though two circles cover some');
  assert.ok(leaves.every(node => f.stream.cache.has(node.id) && !f.stream.cache.get(node.id).mesh.visible), 'in memory, not drawn');
  // The map goes on being selected elsewhere while the traveller waits: the prepared tiles survive it.
  f.stream.lastSelection = -Infinity; f.stream.update({ x: 14000, z: -4500 }, null, { overview: true });
  assert.ok(leaves.every(node => f.stream.cache.has(node.id)));
  // Arriving: they are on screen without another request.
  const asked = f.asked.length;
  // (Long enough after the last look at the map that the jump is not taken for flight.)
  f.stream.lastSelection = -Infinity; f.stream.selectedAt = null; f.stream.update(soho, null, { altitude: 2940, detail: [{ ...soho, radius: 700 }] });
  assert.ok(leaves.every(node => f.stream.cache.get(node.id).mesh.visible));
  assert.ok(!f.asked.slice(asked).some(resource => leaves.some(node => node.resource === resource)));
  // Let go and looked away from, they are dropped like anything else.
  // (They stay up for the moment it takes the coarse tile they replaced to come back.)
  f.stream.releaseScenery(); f.stream.lastSelection = -Infinity; f.stream.update({ x: 14000, z: -4500 }, null, { overview: true });
  await f.settle(); f.stream.lastSelection = -Infinity; f.stream.update({ x: 14000, z: -4500 }, null, { overview: true });
  assert.ok(!leaves.some(node => f.stream.cache.has(node.id)));
  // A tile that cannot be had does not hold up the rest.
  const broken = fixture(); t.after(() => broken.stream.dispose());
  broken.stream.fetcher = async url => { if (/nodes\/(\d+)\//.exec(url)[1] === String(leaves[0].resource)) return { ok: false, status: 500 }; return { ok: true, arrayBuffer: async () => tinyTile() }; };
  const partial = await broken.stream.prepareScenery([{ ...soho, radius: 700 }]);
  assert.deepEqual(partial, { ready: false, chunks: result.chunks, loadedChunks: result.chunks - 1 });
  assert.deepEqual(await broken.stream.prepareScenery([]), { ready: true, chunks: 0, loadedChunks: 0 });
});
