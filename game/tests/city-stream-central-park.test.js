import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCityStream, decodeI3S, groundRings } from '../dist/city-stream.js';
import { createRoadStream, nearestStreet } from '../dist/road-stream.js';
import { Simulation } from '../dist/simulation.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
const landscapeIndex = JSON.parse(readFileSync(new URL('../dist/landscape-index.json', import.meta.url)));
const region = landscapeIndex.regions.find(region => region.id === 'central-park-south');
const samples = [3136, 3144, 3164, 3166, 3216, 3220, 3222, 3907].map(resource => {
  const bytes = gunzipSync(readFileSync(new URL(`./fixtures/i3s-central-park-${resource}.bin.gz`, import.meta.url)));
  return { node: index.nodes.find(node => node.resource === resource),
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
});

test('real feature 492527 recovers its measured cap above the lowest wall feet without changing any geometry', () => {
  const { buffer, node } = samples.find(sample => sample.node.resource === 3220);
  const decoded = decodeI3S(buffer, node, index.origin);
  const measured = decodeI3S(buffer, node, index.origin, { collisions: false });
  assert.deepEqual(decoded.positions, measured.positions);
  assert.equal(decoded.featureCount, 106);
  assert.equal(decoded.triangles, 12002);
  const building = decoded.buildings.find(building => building.featureId === '492527');
  assert.equal(building.polygon.length, 38);
  assert.equal(building.holes.length, 0);
  assert.equal(building.heightEstimated, false);
  assert.ok(Math.abs(building.height - 101.81797409057617) < .00001);
  const anchor = measured.anchors.find(anchor => anchor.featureId === '492527');
  const cap = [];
  for (let vertex = anchor.start; vertex < anchor.end; vertex += 3) {
    const triangle = [0, 1, 2].map(k => Array.from(measured.positions.slice((vertex + k) * 3, (vertex + k + 1) * 3)));
    if (triangle.every(point => Math.abs(point[1] - .9110183715820312) < .00001)) cap.push(triangle.map(point => [point[0], point[2]]));
  }
  assert.equal(cap.length, 36, 'the fixture retains the actual cap discrepancy that triggered the user error');
  assert.deepEqual(building.polygon, groundRings(cap)[0].polygon, 'the collider follows every measured corner, not a hull');
});

test('all actual Central Park destination chunks become ready and permit a clear mapped-street arrival', async t => {
  const roadIndex = JSON.parse(readFileSync(new URL('../dist/road-index.json', import.meta.url)));
  const roads = await createRoadStream(roadIndex, { fetcher: async url => ({ ok: true,
    json: async () => JSON.parse(readFileSync(new URL(`../dist/${url.replace(/^\.\//, '')}`, import.meta.url))) }) }).loadAround(region.view);
  const target = nearestStreet(roads, region.view, 600);
  assert.ok(target);
  let buildings = [];
  const requests = [];
  const stream = createCityStream(index, { fetcher: async url => {
    const resource = Number(url.match(/\/nodes\/(\d+)\//)?.[1]);
    const sample = samples.find(sample => sample.node.resource === resource);
    assert.ok(sample, `unexpected destination geometry ${resource}`);
    requests.push(resource);
    return { ok: true, arrayBuffer: async () => sample.buffer.slice(0) };
  }, onCollisionChange: value => { buildings = value; } });
  t.after(() => stream.dispose());
  assert.equal(stream.isReadyAt(target.x, target.z), false);
  const prepared = await stream.prepareAt(target, 300);
  assert.equal(prepared.loadedChunks, samples.length);
  assert.equal(requests.length, samples.length, 'valid source geometry needs no retry');
  assert.equal(stream.getStatus().error, null);
  assert.equal(stream.isReadyAt(target.x, target.z), true);
  assert.ok(buildings.some(building => building.featureId === '492527'));
  const sim = new Simulation({ bounds: roadIndex.bounds, roads, buildings, spawn: target,
    isReadyAt: (x, z, radius) => stream.isReadyAt(x, z, radius) });
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, .35), false);
  assert.ok(Math.hypot(sim.player.x - region.view.x, sim.player.z - region.view.z) < 100);
  assert.ok(sim.getNearbyCar(), 'the arrival street fits the starter cab');
  assert.equal(sim.interact(), true);
});

function geometryBuffer(triangles) {
  const count = triangles.length * 3, offset = 8 + count * 36, buffer = new ArrayBuffer(offset + 16), view = new DataView(buffer);
  view.setUint32(0, count, true);view.setUint32(4, 1, true);
  const positions = new Float32Array(buffer, 8, count * 3), scale = 6371008.8 * Math.PI / 180;
  triangles.flat().forEach(([x, y, z], i) => {
    positions[i * 3] = x / scale;positions[i * 3 + 1] = -z / scale;positions[i * 3 + 2] = y;
  });
  view.setBigUint64(offset, 1n, true);view.setUint32(offset + 8, 0, true);view.setUint32(offset + 12, triangles.length - 1, true);
  return buffer;
}
const testNode = { center: [0, 0, 0] }, testOrigin = { lon: 0, lat: 0 };
function raisedCap({ height = .91, wallBottom = 0, gap = false } = {}) {
  const cap = [], triangles = [];
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
    if (x === 1 && z === 1 || x === 3 && z === 3) continue;
    const a = [x * 4, z * 4], b = [(x + 1) * 4, z * 4], c = [(x + 1) * 4, (z + 1) * 4], d = [x * 4, (z + 1) * 4];
    cap.push([a, b, c], [a, c, d]);
  }
  triangles.push(...cap.map(triangle => triangle.map(([x, z]) => [x, height, z])));
  const [shape] = groundRings(cap);
  for (const ring of [shape.polygon, ...shape.holes]) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (gap && ring === shape.polygon && i === 0) continue;
    const lowA = [a[0], wallBottom, a[1]], lowB = [b[0], wallBottom, b[1]], highA = [a[0], 10, a[1]], highB = [b[0], 10, b[1]];
    triangles.push([lowA, lowB, highB], [lowA, highB, highA]);
  }
  return triangles;
}

test('wall-backed cap recovery preserves a courtyard and concavity without adding elevated surfaces', () => {
  const triangles = raisedCap();
  // A measured elevated shelf remains rendered, but does not seal free space.
  triangles.push([[20, 5, 0], [25, 5, 0], [25, 5, 5]]);
  const decoded = decodeI3S(geometryBuffer(triangles), testNode, testOrigin);
  assert.equal(decoded.buildings.length, 1);
  assert.equal(decoded.buildings[0].holes.length, 1);
  const sim = new Simulation({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    roads: [], buildings: decoded.buildings, spawn: { x: -50, z: -50 } });
  assert.equal(sim.isBlocked(2, 2, .1), true);
  assert.equal(sim.isBlocked(6, 6, .1), false, 'the courtyard remains clear');
  assert.equal(sim.isBlocked(14, 14, .1), false, 'the measured concavity remains clear');
  assert.equal(sim.isBlocked(23, 1, .1), false, 'the elevated shelf creates no ground wall');
});

test('a low cap with an open wall boundary is not accepted as an enclosed building', () => {
  assert.throws(() => decodeI3S(geometryBuffer(raisedCap({ gap: true })), testNode, testOrigin), /no surveyed ground surface/);
});

test('a low floating enclosure cannot borrow ground contact from an unrelated wall', () => {
  const triangles = raisedCap({ wallBottom: .91 });
  triangles.push([[30, 0, 0], [40, 0, 0], [40, 10, 0]]);
  assert.throws(() => decodeI3S(geometryBuffer(triangles), testNode, testOrigin), /no surveyed ground surface/);
});

test('a high bridge-like deck with supports is not projected into a solid ground obstacle', () => {
  assert.throws(() => decodeI3S(geometryBuffer(raisedCap({ height: 5 })), testNode, testOrigin), /no surveyed ground surface/);
});
