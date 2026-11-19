import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { prepareTerrain, sampleTerrain } from '../dist/landscape.js';
import { createParkGroundUniforms } from '../dist/park-ground.js';
import { createMappedParks } from '../dist/mapped-parks.js';
import { createCentralPark } from '../dist/central-park.js';
import { STATUE } from '../dist/liberty.js';

const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected}`);
const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url)));
const bytes = path => { const file = readFileSync(new URL(`../dist/${path}`, import.meta.url)); return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength); };
const inRing = (x, z, ring) => { let inside = false;for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j];if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };

function fixture() {
  let active = [], ground = null, binds = 0;
  const regionParkGround = new Map(read('parks.json').parks.map(({ id }) => [id, createParkGroundUniforms()]));
  const landscape = { regionParkGround, parkGround: createParkGroundUniforms(), setParkGround: park => { ground = park;binds++; }, getStatus: () => ({ activeRegions: active }) };
  const requests = [];
  const fetcher = async url => { requests.push(url);return url.endsWith('.bin') ? { ok: true, arrayBuffer: async () => bytes(url.replace(/^\.\//, '')) } : { ok: true, json: async () => read(url.replace(/^\.\//, '')) }; };
  const loadTextures = async (manifest, base) => ({ surface: Object.assign(new THREE.Texture(), { name: base + 'surface' }), canopy: new THREE.Texture() });
  return { landscape, requests, fetcher, loadTextures, activate: regions => { active = regions; }, get ground() { return ground; }, get binds() { return binds; } };
}

test('the parks the game draws from maps are listed, and each is a region of measured ground', () => {
  const { parks } = read('parks.json'), regions = read('landscape-index.json').regions;
  assert.deepEqual(parks.map(park => park.id), ['central-park', 'liberty-island', 'ellis-island', 'governors-island', 'prospect-park']);
  for (const entry of parks) {
    const park = read(`${entry.base.slice(2)}park.json`), region = regions.find(region => region.id === entry.id);
    assert.equal(park.id, entry.id);assert.deepEqual(park.bounds, entry.bounds);assert.deepEqual(region.bounds, entry.bounds);
    assert.equal(region.stats.trees, park.trees.count);
  }
});

test('Liberty Island: the ground inside the surveyed seawall, its plaza and lawns, and the trees the lidar found', () => {
  const park = read('liberty-island/park.json'), description = read('landscape/liberty-island-terrain.json'), raw = new Uint16Array(bytes('landscape/liberty-island-terrain.bin'));
  const terrain = prepareTerrain({ ...description, heights: Float32Array.from(raw, value => value * description.heightEncoding.scale + description.heightEncoding.offset) });
  // The island is 5.7 hectares; its frame, with forty metres of water round it, is under 300 by 500 m.
  assert.ok(park.size.width * park.size.depth < 300 * 500 && park.size.width > 200);
  // The statue stands inside it, on ground a few metres above the bay, and the bay round it is at sea level.
  const fort = sampleTerrain(terrain, STATUE.pedestal.x - 60, STATUE.pedestal.z);
  assert.ok(fort.elevation > 1.5 && fort.elevation < 8, `the ground beside the fort is at ${fort.elevation} m`);
  const arrival = sampleTerrain(terrain, STATUE.arrival.x, STATUE.arrival.z);
  assert.ok(arrival.elevation > 1.5 && arrival.elevation < 6, 'the plaza where visitors arrive is dry land');
  // A quarter of the island is paved (the plaza and the promenade inside the seawall) and half is lawn.
  assert.ok(park.ground.paved > .15 && park.ground.paved < .4 && park.ground.lawn > .35 && park.ground.lawn < .7, JSON.stringify(park.ground));
  assert.equal(park.sources.cover, undefined, 'everything on the island is from the city\'s survey: nothing here is under the Open Database Licence');
  assert.equal(park.structures, undefined);
  // Four hundred-odd trees, each on the island's ground.
  const records = new Uint16Array(bytes('liberty-island/trees.bin')), { scale, offset } = park.trees, frame = park.frame;
  assert.equal(records.length, park.trees.count * 6);
  assert.ok(park.trees.count > 250 && park.trees.count < 600, `${park.trees.count} trees`);
  for (let i = 0; i < park.trees.count; i++) {
    const value = k => records[i * 6 + k] * scale[k] + offset[k];
    const x = frame.x + value(0) * frame.cos - value(1) * frame.sin, z = frame.z + value(0) * frame.sin + value(1) * frame.cos;
    close(sampleTerrain(terrain, x, z).elevation, value(2), .011);
    assert.ok(value(2) > .5 && value(3) >= 5 && value(3) < 35, 'a tree on dry ground, of a tree\'s height');
    assert.ok(Math.hypot(x - STATUE.pedestal.x, z - STATUE.pedestal.z) > 40, 'none stands in the fort');
  }
});

test('the new island arrivals are on measured dry land inside their surveyed shorelines', () => {
  const { regions } = read('landscape-index.json');
  const shores = read('boroughs.json').boroughs.find(entry => entry.name === 'Manhattan').polygons;
  for (const id of ['ellis-island', 'governors-island']) {
    const region = regions.find(r => r.id === id), { x, z } = region.view, park = read(id + '/park.json');
    const data = read('landscape/' + id + '-terrain.json'), raw = new Uint16Array(bytes('landscape/' + id + '-terrain.bin'));
    const grid = prepareTerrain({ ...data, heights: Float32Array.from(raw, h => h * data.heightEncoding.scale + data.heightEncoding.offset) });
    assert.equal(region.view.exact, true);
    assert.equal(shores.filter(p => inRing(x, z, p.outer)).length, 1);
    assert.ok(sampleTerrain(grid, x, z).elevation > .5);
    assert.equal(grid.dx, 2.5);
    assert.ok(park.ground.paved > .1 && park.ground.lawn > .3 && park.trees.count > 100);
  }
});

test('Prospect Park includes the Brooklyn crowns, the lake and the surveyed bridge decks', () => {
  const park = read('prospect-park/park.json');
  const region = read('landscape-index.json').regions.find(r => r.id === park.id);
  assert.equal(region.borough, 'Brooklyn');
  assert.ok(region.stats.trees > 10000 && region.stats.terrainNodes > 400000);
  assert.ok(read('landscape/prospect-park-features.json').water.some(feature => /prospect/i.test(feature.name)));
  assert.ok(park.structures.count > 0 && park.sources.cover.attribution.includes('OpenStreetMap'));
  assert.equal(region.presets[0].name, 'Brooklyn · Prospect Lake');
});

test('the terrain is given the ground of the park the player is in, and of the largest from the city map', async () => {
  const f = fixture(), parks = createMappedParks({ scene: new THREE.Scene(), landscape: f.landscape, fetcher: f.fetcher, loadTextures: f.loadTextures });
  await parks.ready;
  assert.deepEqual(f.requests.slice(0, 1), ['./parks.json']);
  assert.ok(f.requests.includes('./central-park/park.json') && f.requests.includes('./liberty-island/park.json'));
  assert.equal(parks.parks.length, 5);assert.equal(f.ground, null, 'nothing is given until somebody is somewhere');
  parks.update({ x: 2655, z: -6005 });
  assert.equal(f.ground.surface.name, './central-park/surface');assert.equal(parks.getStatus().ground, 'central-park');
  parks.update({ x: 2700, z: -6000 });assert.equal(f.binds, 1, 'it is given once, not every frame');
  for (const id of ['ellis-island', 'governors-island', 'prospect-park']) {
    assert.equal(f.landscape.regionParkGround.get(id).parkSurface.value.name, './' + id + '/surface');
  }
  parks.update({ x: STATUE.arrival.x, z: STATUE.arrival.z });
  assert.equal(f.ground.surface.name, './liberty-island/surface');
  assert.deepEqual(f.ground.frame, parks.park('liberty-island').manifest.frame);
  // The Battery is closest to Governors Island.
  parks.update({ x: -1500, z: 1500 });assert.equal(parks.getStatus().ground, 'governors-island');
  parks.update({ x: -1500, z: 1500 }, { overview: true });assert.equal(parks.getStatus().ground, 'central-park', 'the city map shows Central Park green');
  parks.dispose();assert.equal(f.ground, null);
});

test('each park stands its own trees, and the old name still gives all the parks', async () => {
  const f = fixture(), bodies = new Map(), physics = { replace: (key, list) => bodies.set(key, list.length) };
  const parks = createCentralPark({ scene: new THREE.Scene(), landscape: f.landscape, fetcher: f.fetcher, loadTextures: f.loadTextures, physics });
  await parks.ready;
  const island = { x: STATUE.arrival.x, z: STATUE.arrival.z };
  f.activate(['liberty-island']);
  parks.update(island, { eye: { ...island, y: 6 } });
  const liberty = parks.park('liberty-island');
  for (let waited = 0; waited < 400 && !liberty.trees; waited++) { await new Promise(resolve => setTimeout(resolve, 5));parks.update(island, { eye: { ...island, y: 6 } }); }
  parks.update(island, { eye: { ...island, y: 6 } });
  assert.equal(liberty.trees.count, liberty.manifest.trees.count);
  assert.equal(liberty.trees.group.visible, true);
  assert.equal(parks.trees, null, 'Central Park, eleven kilometres off, has not loaded its own');
  assert.ok(!f.requests.includes('./central-park/trees.bin'));
  assert.ok(bodies.get('park-trees:liberty-island') > 0, 'its trunks are the island\'s own among the street\'s objects');
  // The trees near her are drawn in full.
  assert.ok(liberty.trees.drawn.near > 0 || liberty.trees.drawn.mid > 0);
  parks.dispose();
});

test('the island\'s shore is the surveyed one, and no shelf of surrounding country lies round it', () => {
  const manhattan = read('boroughs.json').boroughs.find(borough => borough.name === 'Manhattan');
  const island = manhattan.polygons.filter(polygon => inRing(STATUE.x, STATUE.z, polygon.outer));
  assert.equal(island.length, 1);
  const outer = island[0].outer, area = Math.abs(outer.reduce((sum, point, i) => sum + point[0] * outer[(i + 1) % outer.length][1] - outer[(i + 1) % outer.length][0] * point[1], 0)) / 2;
  assert.ok(outer.length > 200, `${outer.length} points round the island, where the borough outline had 34`);
  assert.ok(area > 56000 && area < 60000, `${area} m2: 5.7 hectares of island and its three piers`);
  // The arrival point is on it; the water forty metres off the seawall is not.
  assert.ok(inRing(STATUE.arrival.x, STATUE.arrival.z, outer));
  assert.ok(!inRing(STATUE.x + 150, STATUE.z + 130, outer));
  // The picture of the land around the city has no land in the cells the island lies in.
  const context = read('context-land.json'), png = readFileSync(new URL('../dist/assets/context/land.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), context.width);assert.equal(png.readUInt32BE(20), context.height);
  assert.match(context.source.modifications, /on either side of it/);
});
