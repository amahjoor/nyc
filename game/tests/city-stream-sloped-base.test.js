import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCityStream, decodeI3S } from '../dist/city-stream.js';
import { Simulation } from '../dist/simulation.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
const node = index.nodes.find(node => node.resource === 4336);
// Unmodified public NYC geometry, fetched 2026-10-11:
// https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0/nodes/4336/geometries/0
const bytes = gunzipSync(readFileSync(new URL('./fixtures/i3s-soho-sloped-base.bin.gz', import.meta.url)));
const fixture = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('real NYC feature 486142 retains its measured base when the bottom is 28mm above its lowest vertex', () => {
  const measured = decodeI3S(fixture, node, index.origin, { collisions: false });
  const decoded = decodeI3S(fixture, node, index.origin);
  assert.equal(decoded.featureCount, 283);assert.equal(decoded.triangles, 14978);
  assert.deepEqual(decoded.positions, measured.positions, 'the recovery must not move or invent any rendered vertices');
  const building = decoded.buildings.find(building => building.featureId === '486142');
  assert.ok(building);assert.equal(building.heightEstimated, false);
  assert.ok(Math.abs(building.height - 56.25445747375488) < .00001);
  assert.equal(building.polygon.length, 17);
  const surveyed = new Set();
  for (let i = 0; i < measured.positions.length; i += 3) surveyed.add(`${measured.positions[i]},${measured.positions[i + 2]}`);
  for (const point of building.polygon) assert.ok(surveyed.has(point.join(',')), 'each collision corner comes from the source mesh');
});

test('the formerly rejected 283-building tile becomes collision-ready without retries or a persistent error', async () => {
  const leaf = { ...node, id: 0, parent: null }, localIndex = { ...index, roots: [0], nodes: [leaf] };
  let fetches = 0, buildings = [];
  const stream = createCityStream(localIndex, { fetcher: async () => {
    fetches++;return { ok: true, arrayBuffer: async () => fixture.slice(0) };
  }, onCollisionChange: value => { buildings = value; } });
  try {
    await stream.prepareAt({ x: node.x, z: node.z }, 4);
    assert.equal(fetches, 1);assert.equal(stream.getStatus().error, null);
    assert.equal(stream.isReadyAt(node.x, node.z, 4), true);
    assert.equal(new Set(buildings.map(building => building.featureId)).size, 283);
  } finally { stream.dispose(); }
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

test('connected sloped ground preserves courtyard holes and excludes elevated roofs or overhangs', () => {
  const triangles = [], quad = (a, b, c, d) => triangles.push([a, b, c], [a, c, d]);
  const floor = (x, z) => [x, x * .01 + z * .02, z], roof = (x, z) => [x, 10, z];
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10]], inner = [[3, 3], [7, 3], [7, 7], [3, 7]];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quad(floor(...outer[i]), floor(...outer[next]), floor(...inner[next]), floor(...inner[i]));
    quad(roof(...outer[i]), roof(...outer[next]), roof(...inner[next]), roof(...inner[i]));
    for (const ring of [outer, inner]) quad(floor(...ring[i]), floor(...ring[next]), roof(...ring[next]), roof(...ring[i]));
  }
  // A separate downward-facing shelf is measured, but does not meet the ground.
  quad([20, 4, 0], [25, 4, 0], [25, 4, 5], [20, 4, 5]);
  const buffer = geometryBuffer(triangles), decoded = decodeI3S(buffer, testNode, testOrigin);
  assert.equal(decoded.buildings.length, 1);assert.equal(decoded.buildings[0].holes.length, 1);
  assert.deepEqual(decoded.positions, decodeI3S(buffer, testNode, testOrigin, { collisions: false }).positions);
  const sim = new Simulation({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    roads: [], buildings: decoded.buildings, spawn: { x: -50, z: -50 } });
  assert.equal(sim.isBlocked(1, 1, .1), true);
  assert.equal(sim.isBlocked(5, 5, .1), false, 'the actual courtyard remains open');
  assert.equal(sim.isBlocked(22, 2, .1), false, 'an elevated shelf does not create a ground-level obstacle');
});

test('a mesh without any connected surveyed bottom still cannot fabricate a collision footprint', () => {
  const buffer = geometryBuffer([
    [[0, 0, 0], [10, 0, 0], [10, 10, 0]],
    [[0, 10, 0], [10, 10, 0], [10, 10, 10]],
  ]);
  assert.throws(() => decodeI3S(buffer, testNode, testOrigin), /no surveyed ground surface/);
});
