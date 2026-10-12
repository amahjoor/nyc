import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { RoadPilot } from '../dist/road-pilot.js';
import { buildTerrainGeometry, prepareTerrain, sampleTerrain } from '../dist/landscape.js';

const bounds = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };
function road(overrides = {}) {
  return { id: 'roadbed:100', sourceId: 'NYC:100', kind: 'roadbed', sourceUrl: 'https://example.test/road-survey/100',
    geometry: { positions: [0, 2, 0, 20, 4, 0, 20, 6, 20, 0, 4, 20], indices: [0, 1, 2, 0, 2, 3] }, ...overrides };
}
function fixture(t, features = [road()], appearance = {}, extra = {}) {
  const data = { version: 1, bounds, origin: { lat: 40.7235, lon: -74.0015 }, verticalDatum: 'NAVD88', elevationUnits: 'meters',
    terrain: { sourceId: 'NYC DEM', url: 'test/terrain.json' }, features };
  const scene = new THREE.Scene(), pilot = new RoadPilot({ scene, data, appearance, ...extra });
  t.after(() => pilot.dispose());return { pilot, data, scene };
}
function marking(overrides = {}) {
  return { id: 'observed-stripe-1', sourceFeatureId: 'roadbed:100', color: '#eeeecc',
    polygons: [{ outer: [[-2, 2], [8, 2], [8, 3], [-2, 3]], holes: [] }],
    evidence: { reviewStatus: 'accepted', method: 'source-image observed paint', pixelPolygon: [[0, 0], [10, 0], [10, 1], [0, 1]] }, ...overrides };
}

test('road collision and normals exactly match rendered surveyed triangles', t => {
  const { pilot } = fixture(t);
  assert.equal(pilot.getStatus().surfaces, 1);assert.equal(pilot.getStatus().triangles, 2);
  for (let x = 0; x <= 20; x += 1.25) for (let z = 0; z <= 20; z += 1.25) {
    const sample = pilot.sampleSurface(x, z);
    assert.ok(Math.abs(sample.elevation - (2 + x * .1 + z * .1)) < 1e-8);
    assert.ok(Math.abs(sample.normal.x + .1 / Math.sqrt(1.02)) < 1e-8);
    assert.ok(Math.abs(sample.normal.z + .1 / Math.sqrt(1.02)) < 1e-8);
    assert.ok(Math.abs(sample.normal.y - 1 / Math.sqrt(1.02)) < 1e-8);
    assert.equal(sample.transportId, null);assert.equal(sample.sourceId, 'NYC:100');
    assert.equal(sample.verticalDatum, 'NAVD88');assert.equal(sample.units, 'meters');
  }
  const geometry = pilot.surfaces[0].mesh.geometry;
  assert.deepEqual(Array.from(geometry.attributes.position.array), road().geometry.positions);
  assert.equal(pilot.sampleSurface(20.01, 5), null);assert.equal(pilot.getHeight(NaN, 2), null);
  assert.equal(pilot.isCovered(10, 10), true);assert.equal(pilot.isCovered(-.001, 10), false);
});

test('bridge and ground retain separate levels with continuous entry and stable wheel support IDs', t => {
  const deck = road({ id: 'bridge:1', kind: 'bridge', transportId: 'transport:original:1',
    geometry: { positions: [0, 12, 0, 20, 14, 0, 20, 16, 20, 0, 14, 20], indices: [0, 1, 2, 0, 2, 3] } });
  const { pilot } = fixture(t, [deck, road()]);
  assert.equal(pilot.getHeight(10, 10), 4, 'an unhinted ground/wheel query cannot capture the deck');
  assert.equal(pilot.getHeight(10, 10, { referenceHeight: 4 }), 4);
  assert.equal(pilot.getHeight(10, 10, { referenceHeight: 13.8 }), 14);
  assert.equal(pilot.getHeight(10, 10, { referenceHeight: 13.8, kind: 'ground' }), 4);
  assert.equal(pilot.getHeight(10, 10, { referenceHeight: 4, kind: 'bridge' }), null);
  assert.equal(pilot.getHeight(10, 10, { referenceHeight: 13.8, kind: 'bridge' }), 14);
  assert.equal(pilot.getHeight(10, 10, { referenceHeight: 13 }), 4, 'a nearby but disconnected level cannot enter');
  const current = pilot.sampleSurface(10, 10, { referenceHeight: 13, transportId: deck.transportId });
  assert.equal(current.elevation, 14);assert.equal(current.transportId, deck.transportId);
  assert.equal(pilot.sampleSurface(10, 11, { referenceHeight: current.elevation, transportId: current.transportId }).transportId, deck.transportId);
  const other = road({ id: 'bridge:2', kind: 'bridge', geometry: { positions: [0, 14.2, 0, 20, 14.2, 0, 20, 14.2, 20, 0, 14.2, 20], indices: [0, 1, 2, 0, 2, 3] } });
  const stacked = fixture(t, [other, deck, road()]).pilot;
  assert.equal(stacked.sampleSurface(10, 10, { referenceHeight: 14.2, transportId: deck.transportId }).transportId, deck.transportId,
    'a closer overlapping deck does not steal the actor from its current deck');
});

test('aerial/reconstruction and visibility toggles cannot alter physics or rebuild geometry', t => {
  const { pilot } = fixture(t, [road()], { surfaces: [{ sourceFeatureId: 'roadbed:100', color: '#55554f', roughness: .94, colorVariation: .015, reviewStatus: 'accepted' }], markings: [marking()] });
  const mesh = pilot.surfaces[0].mesh, geometry = mesh.geometry, reconstructed = mesh.material, sample = pilot.sampleSurface(10, 10);
  pilot.setMode('aerial');assert.equal(mesh.geometry, geometry);assert.notEqual(mesh.material, reconstructed);
  assert.equal(pilot.markingsGroup.visible, false);assert.deepEqual(pilot.sampleSurface(10, 10), sample);
  pilot.setVisible(false);assert.deepEqual(pilot.sampleSurface(10, 10), sample);assert.equal(pilot.getStatus().visible, false);
  pilot.setMode('reconstructed');assert.equal(mesh.material, reconstructed);assert.equal(pilot.markingsGroup.visible, true);
  assert.throws(() => pilot.setMode('invented'), RangeError);
});

test('accepted observed paint clips to road boundaries and every supporting triangle slope', t => {
  // A crease along the first diagonal requires a separate paint triangle on
  // each side. Simple vertex draping would float above this measured fold.
  const bent = road({ geometry: { positions: [0, 2, 0, 20, 4, 0, 20, 3, 20, 0, 7, 20], indices: [0, 1, 2, 0, 2, 3] } });
  const paint = marking({ polygons: [{ outer: [[-2, 2], [22, 2], [22, 18], [-2, 18]], holes: [] }] });
  const { pilot } = fixture(t, [bent], { markings: [paint] });
  assert.equal(pilot.getStatus().acceptedMarkings, 1);assert.equal(pilot.getStatus().rejectedMarkings, 0);
  const geometry = pilot.markingsGroup.children[0].geometry, position = geometry.attributes.position, indices = geometry.index;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const vertices = [0, 1, 2].map(k => indices.getX(i + k));
    const [a, b, c] = vertices.map(index => ({ x: position.getX(index), y: position.getY(index), z: position.getZ(index) }));
    area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
    assert.ok(x >= 0 && x <= 20 && z >= 2 && z <= 18);
    assert.ok(Math.abs(y - pilot.getHeight(x, z)) < 1e-6, 'paint remains on its exact supporting road plane');
  }
  assert.ok(Math.abs(area - 20 * 16) < 1e-5);
  assert.equal(pilot.markingsGroup.children[0].material.polygonOffset, true);
});

test('mapped gaps and source paint holes remain open; unreviewed detections cannot render', t => {
  const split = road({ geometry: { positions: [0, 2, 0, 4, 2, 0, 4, 2, 20, 0, 2, 20, 6, 2, 0, 20, 2, 0, 20, 2, 20, 6, 2, 20],
    indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7] } });
  const paint = marking({ polygons: [{ outer: [[0, 0], [20, 0], [20, 20], [0, 20]], holes: [[[10, 5], [15, 5], [15, 10], [10, 10]]] }] });
  const { pilot } = fixture(t, [split], { markings: [paint, marking({ id: 'unreviewed', evidence: { reviewStatus: 'candidate' } }), marking({ id: 'wrong-road', sourceFeatureId: 'elsewhere' })] });
  assert.equal(pilot.sampleSurface(5, 5), null);assert.equal(pilot.getStatus().rejectedMarkings, 2);
  const geometry = pilot.markingsGroup.children[0].geometry, position = geometry.attributes.position, indices = geometry.index;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => indices.getX(i + k));
    area += Math.abs((position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a))
      - (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))) / 2;
  }
  assert.ok(Math.abs(area - (18 * 20 - 25)) < 1e-6);
});

test('invalid geometry, unknown elevation units and unsupported transport cannot silently become roads', t => {
  const invalid = [road({ id: 'bad-index', geometry: { positions: [0, 1, 0, 1, 1, 0, 0, 1, 1], indices: [0, 1, 4] } }),
    road({ id: 'feet', elevationUnits: 'feet' }), road({ id: 'datum', verticalDatum: 'EGM96' }), road({ id: 'rail', kind: 'rail bridge' }),
    road({ id: 'nan', geometry: { positions: [0, 1, 0, 1, NaN, 0, 0, 1, 1], indices: [0, 1, 2] } }),
    road({ id: 'huge', geometry: { positions: [0, 1, 0, 1, 1e100, 0, 0, 1, 1], indices: [0, 1, 2] } })];
  const { pilot } = fixture(t, invalid);
  assert.equal(pilot.getStatus().surfaces, 0);assert.equal(pilot.getStatus().rejectedFeatures, invalid.length);
  assert.equal(pilot.sampleSurface(1, 1), null);
});

test('immutable provenance is detached from input and disposal frees only owned GPU resources once', t => {
  const texture = new THREE.Texture(), orthophoto = { texture, bounds };
  let textureDisposals = 0;texture.addEventListener('dispose', () => textureDisposals++);
  const { pilot, data, scene } = fixture(t, [road()], { markings: [marking()] }, { orthophoto });
  data.terrain.sourceId = 'mutated';data.bounds.maxX = 999;
  assert.equal(pilot.source.terrain.sourceId, 'NYC DEM');assert.equal(pilot.source.bounds.maxX, 20);
  assert.throws(() => { pilot.source.bounds.maxX = 888; }, TypeError);
  assert.throws(() => { pilot.sourceFeatureIds.push('new'); }, TypeError);
  let geometryDisposals = 0, materialDisposals = 0;
  pilot.surfaces[0].geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of pilot.materials) material.addEventListener('dispose', () => materialDisposals++);
  const materials = pilot.materials.size;
  pilot.dispose();pilot.dispose();
  assert.equal(geometryDisposals, 1);assert.equal(materialDisposals, materials);assert.equal(textureDisposals, 0);
  assert.equal(scene.children.length, 0);assert.equal(pilot.sampleSurface(2, 2), null);assert.equal(pilot.getStatus().disposed, true);
});

test('aerial comparison uses shared Mercator projection and falls back where local imagery is missing', t => {
  const { pilot } = fixture(t);
  const local = { texture: new THREE.Texture(), bounds, mercator: { originLat: 40.7235 * Math.PI / 180, radius: 6378137, north: .7791, south: .7789 } };
  pilot.setLocalOrthophoto(local);
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  pilot.aerial.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.pilotLocal.value, local.texture);assert.equal(shader.uniforms.pilotLocalEnabled.value, true);
  assert.ok(shader.fragmentShader.includes('atlasNorthUV'));assert.ok(shader.fragmentShader.includes('localPixel.a > 0.99'));
  pilot.setLocalOrthophoto();assert.equal(shader.uniforms.pilotLocalEnabled.value, false);
});

test('surface appearance without an actual matching source sample retains aerial fallback', t => {
  const { pilot } = fixture(t, [road()], { surfaces: [{ sourceFeatureId: 'wrong-road', color: '#444444' }] });
  assert.equal(pilot.getStatus().reconstructedSurfaces, 0);assert.equal(pilot.getStatus().aerialFallbackSurfaces, 1);
  assert.equal(pilot.surfaces[0].mesh.material, pilot.aerial.material);
});

test('appearance origin mismatch is rejected before scene mutation and fine grain uses local coordinates', t => {
  const scene = new THREE.Scene();
  assert.throws(() => new RoadPilot({ scene, data: { origin: { lat: 40, lon: -74 } }, appearance: { origin: { lat: 41, lon: -74 } } }), /coordinate origins/);
  assert.equal(scene.children.length, 0);
  const source = road({ geometry: { positions: [13800, 2, -1400, 13820, 4, -1400, 13820, 6, -1380, 13800, 4, -1380], indices: [0, 1, 2, 0, 2, 3] } });
  const { pilot } = fixture(t, [source], { surfaces: [{ sourceFeatureId: source.id, color: '#55554f', colorVariation: .015, reviewStatus: 'accepted' }] });
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  pilot.surfaces[0].material.onBeforeCompile(shader);
  assert.ok(Math.abs(shader.uniforms.pilotMaterialOrigin.value.x - 13800) < 32);
  assert.ok(shader.vertexShader.includes('position.xz - pilotMaterialOrigin'));
  assert.ok(shader.fragmentShader.includes('dFdx'), 'grain fades when smaller than a rendered pixel');
});

test('actual Meadow Lake pavement and accepted paint remain on the measured terrain triangles', t => {
  const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url)));
  const data = read('road-pilot.json'), appearance = read('road-pilot-appearance.json');
  const terrain = prepareTerrain(read('road-pilot-source/terrain.json'), { blendMargin: 0 });
  const pilot = new RoadPilot({ data, appearance }), terrainGeometry = buildTerrainGeometry(terrain);
  t.after(() => { pilot.dispose();terrainGeometry.dispose(); });
  const status = pilot.getStatus();
  assert.equal(status.surfaces, data.stats.features);assert.equal(status.rejectedFeatures, 0);
  assert.equal(status.reconstructedSurfaces, status.surfaces);assert.equal(status.aerialFallbackSurfaces, 0);
  assert.equal(status.acceptedMarkings, appearance.summary.paintAccepted);assert.equal(status.rejectedMarkings, 0);
  assert.ok(status.triangles >= data.stats.triangles - 2, 'only float32-collapsed boundary slivers may disappear');
  assert.ok(pilot.surfaces.every(part => part.kind !== 'bridge'), 'unvalidated bridge approaches remain excluded');

  const positions = terrainGeometry.attributes.position;
  function renderedTerrainHeight(x, z) {
    let column = Math.max(0, Math.min(terrain.width - 2, Math.floor((x - terrain.bounds.minX) / terrain.dx)));
    let row = Math.max(0, Math.min(terrain.height - 2, Math.floor((z - terrain.bounds.minZ) / terrain.dz)));
    // Quantizing the GPU's coordinate grid moves its boundaries slightly.
    // Select the actual rendered cell, including those narrow boundary strips.
    while (column > 0 && x < positions.getX(column)) column--;
    while (column < terrain.width - 2 && x > positions.getX(column + 1)) column++;
    while (row > 0 && z < positions.getZ(row * terrain.width)) row--;
    while (row < terrain.height - 2 && z > positions.getZ((row + 1) * terrain.width)) row++;
    const a = row * terrain.width + column, b = a + 1, c = a + terrain.width, d = c + 1;
    const u = (x - positions.getX(a)) / (positions.getX(b) - positions.getX(a));
    const v = (z - positions.getZ(a)) / (positions.getZ(c) - positions.getZ(a));
    if (u + v <= 1) return positions.getY(a) + (positions.getY(b) - positions.getY(a)) * u + (positions.getY(c) - positions.getY(a)) * v;
    return positions.getY(d) + (positions.getY(c) - positions.getY(d)) * (1 - u) + (positions.getY(b) - positions.getY(d)) * (1 - v);
  }
  let maxSampleError = 0, maxRenderedError = 0;
  for (const part of pilot.surfaces) for (const triangle of part.triangles) {
    const x = (triangle.a.x + triangle.b.x + triangle.c.x) / 3;
    const z = (triangle.a.z + triangle.b.z + triangle.c.z) / 3, y = (triangle.a.y + triangle.b.y + triangle.c.y) / 3;
    maxSampleError = Math.max(maxSampleError, Math.abs(sampleTerrain(terrain, x, z).elevation - y));
    maxRenderedError = Math.max(maxRenderedError, Math.abs(renderedTerrainHeight(x, z) - y));
  }
  assert.ok(maxSampleError < .001, `terrain sample deviation ${maxSampleError}m`);
  assert.ok(maxRenderedError < .001, `rendered terrain deviation ${maxRenderedError}m`);
  for (const mesh of pilot.markingsGroup.children) {
    const positions = mesh.geometry.attributes.position, indices = mesh.geometry.index;
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [0, 1, 2].map(k => indices.getX(i + k));
      const x = ids.reduce((sum, id) => sum + positions.getX(id), 0) / 3;
      const y = ids.reduce((sum, id) => sum + positions.getY(id), 0) / 3;
      const z = ids.reduce((sum, id) => sum + positions.getZ(id), 0) / 3;
      assert.ok(Math.abs(renderedTerrainHeight(x, z) - y) < .001, 'source paint matches the visible terrain plane within 1mm');
    }
  }
  const initial = pilot.sampleSurface(data.spawn.x, data.spawn.z);
  assert.ok(initial);pilot.setMode('aerial');assert.deepEqual(pilot.sampleSurface(data.spawn.x, data.spawn.z), initial);
});

test('actual pilot edges remain within five centimetres of the required Meadow Lake terrain between grid nodes', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url)));
  const terrain = prepareTerrain(read('road-pilot-source/terrain.json'), { blendMargin: 0 });
  const base = prepareTerrain(read('landscape/nyc-terrain.json'));
  const meadow = prepareTerrain(read('landscape/meadow-lake-terrain.json'), { base, blendMargin: 20 });
  const b = terrain.bounds;
  let maxNodeError = 0, maxBetweenError = 0;
  const compare = (x, z) => Math.abs(sampleTerrain(terrain, x, z).elevation - (sampleTerrain(meadow, x, z) || sampleTerrain(base, x, z)).elevation);
  // Coarse triangle breakpoints can fall between the fine grid's edge nodes.
  // Testing only nodes conceals the remaining interpolation error there.
  for (let column = 0; column < terrain.width - 1; column++) for (const z of [b.minZ, b.maxZ]) {
    const x = b.minX + column * terrain.dx;maxNodeError = Math.max(maxNodeError, compare(x, z));
    for (let part = 1; part < 8; part++) maxBetweenError = Math.max(maxBetweenError, compare(x + terrain.dx * part / 8, z));
  }
  for (let row = 0; row < terrain.height - 1; row++) for (const x of [b.minX, b.maxX]) {
    const z = b.minZ + row * terrain.dz;maxNodeError = Math.max(maxNodeError, compare(x, z));
    for (let part = 1; part < 8; part++) maxBetweenError = Math.max(maxBetweenError, compare(x, z + terrain.dz * part / 8));
  }
  assert.ok(maxNodeError < .000001, `node mismatch ${maxNodeError}m`);
  assert.ok(maxBetweenError < .05, `between-node mismatch ${maxBetweenError}m`);
});
