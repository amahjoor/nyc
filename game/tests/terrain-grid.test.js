import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { prepareTerrain, sampleTerrain, buildTerrainGeometry, Landscape } from '../dist/landscape.js';
import { buildTerrainChunks } from '../dist/terrain-chunks.js';

const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected}`);
const grid = (overrides = {}) => ({ version: 1, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 20 }, width: 2, height: 2, heights: [0, 10, 20, 30], units: 'meters', verticalDatum: 'NAVD88', sourceId: 'dem', ...overrides });
// A quarter turn: the grid's own x runs along world z, its z back along world x.
const quarter = { x: 100, z: 50, cos: 0, sin: 1 };

test('a turned terrain grid is sampled, sloped and drawn where it lies in the world', () => {
  const terrain = prepareTerrain(grid({ frame: quarter }));
  // Its corner is the frame's; ten along its own x is ten along world z.
  close(sampleTerrain(terrain, 100, 50).elevation, 0);
  close(sampleTerrain(terrain, 100, 60).elevation, 10);
  close(sampleTerrain(terrain, 80, 50).elevation, 20);
  close(sampleTerrain(terrain, 80, 60).elevation, 30);
  assert.equal(sampleTerrain(terrain, 101, 55), null, 'east of the corner is outside it');
  assert.equal(sampleTerrain(terrain, 90, 61), null);
  // It rises a metre a metre along its own x, so it faces back down world z.
  const normal = sampleTerrain(terrain, 95, 53).normal;
  assert.ok(normal.z < -.5 && normal.y > 0);close(Math.hypot(normal.x, normal.y, normal.z), 1);
  close(normal.x, 1 / Math.sqrt(3));
  const geometry = buildTerrainGeometry(terrain), p = geometry.attributes.position;
  assert.deepEqual([p.getX(1), p.getY(1), p.getZ(1)], [100, 10, 60]);
  assert.deepEqual([p.getX(2), p.getY(2), p.getZ(2)], [80, 20, 50]);
  geometry.dispose();
  assert.throws(() => prepareTerrain(grid({ frame: { x: 0, z: 0, cos: 1 } })), /Invalid measured/);
});

test('the rim of a turned grid meets the coarse ground under it, wherever that is in the world', () => {
  const base = prepareTerrain(grid({ bounds: { minX: 0, maxX: 200, minZ: 0, maxZ: 200 }, heights: [5, 5, 5, 5] }));
  const detail = prepareTerrain(grid({ frame: quarter, bounds: { minX: 0, maxX: 60, minZ: 0, maxZ: 60 }, width: 7, height: 7, heights: new Float32Array(49).fill(20) }), { base, blendMargin: 20 });
  close(sampleTerrain(detail, 100, 80).elevation, 5);
  close(sampleTerrain(detail, 70, 80).elevation, 20);
  close(sampleTerrain(detail, 70, 80).measuredElevation, 20);
  close(sampleTerrain(detail, 90, 80).elevation, 12.5, 1e-4);
});

test('a large grid is cut into pieces that agree with it and with each other', () => {
  const width = 150, height = 100, heights = new Float32Array(width * height);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) heights[row * width + column] = Math.sin(column * .2) * 3 + row * .1;
  const terrain = prepareTerrain(grid({ frame: quarter, bounds: { minX: 0, maxX: 298, minZ: 0, maxZ: 198 }, width, height, heights }));
  const chunks = buildTerrainChunks(terrain);
  assert.equal(chunks.length, 3 * 2);
  let fine = 0, coarse = 0;
  for (const chunk of chunks) {
    fine += chunk.fine.index.count / 3;coarse += chunk.coarse.index.count / 3;
    assert.ok(chunk.radius > 15 && chunk.radius < 140);
    const p = chunk.fine.attributes.position, n = chunk.fine.attributes.normal;
    // Every vertex of the surface stands on the grid; the skirt hangs below it.
    for (let i = 0; i < p.count; i += 37) {
      const sample = sampleTerrain(terrain, p.getX(i), p.getZ(i));
      assert.ok(sample, 'a piece never reaches past its grid');
      assert.ok(p.getY(i) <= sample.elevation + 1e-3 && p.getY(i) >= sample.elevation - 2.6);
      assert.ok(n.getY(i) > .2);
    }
    chunk.fine.dispose();chunk.coarse.dispose();
  }
  assert.ok(fine > (width - 1) * (height - 1) * 2 && fine < (width - 1) * (height - 1) * 2 * 1.2, 'every cell once, and a rim of skirt');
  assert.ok(coarse < fine / 8);
});

test('the landscape loads a region with packed heights and draws it near in full, far in outline', async t => {
  const width = 520, height = 400, raw = new Uint16Array(width * height).fill(2500);
  const files = new Map([
    ['base', grid({ bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 }, heights: [2, 2, 2, 2] })],
    ['regions/park.json', grid({ frame: { x: 0, z: 0, cos: 1, sin: 0 }, bounds: { minX: 0, maxX: 1297.5, minZ: 0, maxZ: 997.5 }, width, height, heights: undefined,
      heightsUrl: './park.bin', heightEncoding: { type: 'uint16', scale: .01, offset: -20 } })],
    ['regions/features', { water: [], canopies: [] }],
  ]);
  const index = { version: 1, baseTerrain: { url: 'base' }, regions: [{ id: 'park', bounds: { minX: 0, maxX: 1297.5, minZ: 0, maxZ: 997.5 }, terrainUrl: 'regions/park.json', featuresUrl: 'regions/features', blendMargin: 0 }] };
  const requests = [];
  const fetcher = async url => { requests.push(url);return url === 'regions/park.bin' ? { ok: true, arrayBuffer: async () => raw.buffer } : { ok: files.has(url), status: 404, json: async () => files.get(url) }; };
  const landscape = new Landscape({ scene: new THREE.Scene(), index, fetcher, radius: 100 });
  t.after(() => landscape.dispose());
  close((await landscape.prepareAt({ x: 100, z: 100 })).elevation, 5);
  assert.ok(requests.includes('regions/park.bin'), 'heights are fetched beside their description');
  const entry = landscape.cache.get('park');
  assert.equal(entry.chunks.length, Math.ceil((width - 1) / 64) * Math.ceil((height - 1) / 64));
  landscape.update({ x: 100, z: 100 });
  const near = entry.chunks.filter(chunk => chunk.fineMesh.visible), far = entry.chunks.filter(chunk => chunk.coarseMesh.visible);
  assert.ok(near.length > 0 && far.length > 0 && near.length + far.length === entry.chunks.length, 'each piece is drawn once');
  assert.ok(near.every(chunk => Math.hypot(chunk.x - 100, chunk.z - 100) < landscape.detailRange + chunk.radius));
  landscape.update({ x: 1200, z: 900 });
  assert.ok(entry.chunks.find(chunk => chunk.x < 200 && chunk.z < 200).coarseMesh.visible, 'detail follows the player');
  // The base gives way to the region under it, turned or not.
  const coverage = landscape.base.material.userData.uniforms;
  assert.equal(coverage.landscapeCoverageCount.value, 1);
  assert.deepEqual(coverage.landscapeCoverageFrame.value[0].toArray(), [0, 0, 1, 0]);
});

test('a truncated or unknown height file is refused', async t => {
  const index = { version: 1, baseTerrain: { url: 'base' }, regions: [{ id: 'park', bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 20 }, terrainUrl: 'park.json', featuresUrl: null }] };
  const fetcher = async url => url === 'park.bin' ? { ok: true, arrayBuffer: async () => new Uint16Array(3).buffer }
    : { ok: true, json: async () => url === 'base' ? grid({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } }) : grid({ heights: undefined, heightsUrl: './park.bin', heightEncoding: { type: 'uint16', scale: .01, offset: 0 } }) };
  const landscape = new Landscape({ scene: new THREE.Scene(), index, fetcher, radius: 100 });
  t.after(() => landscape.dispose());
  await assert.rejects(landscape.prepareAt({ x: 5, z: 5 }), /do not match their grid/);
});
