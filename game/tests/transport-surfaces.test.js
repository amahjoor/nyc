import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { TransportSurfaces } from '../dist/transport-surfaces.js';

function feature(overrides = {}) {
  return { id: 'transport:1:0', sourceId: 'survey-1', kind: 'transport', subtype: 'bridge',
    polygon: [[0, 0], [20, 0], [20, 10], [0, 10]], holes: [],
    elevations: { polygon: [5, 7, 7, 5], holes: [] }, elevationStatus: 'surveyed', elevationUnits: 'meters', verticalDatum: 'NAVD88', ...overrides };
}
function fixture(t, features) {
  const scene = new THREE.Scene(), decks = new TransportSurfaces({ scene });
  decks.setFeatures(features);t.after(() => decks.dispose());return decks;
}

test('ramp rendering and surface queries share surveyed heights and triangle slopes', t => {
  const decks = fixture(t, [feature()]);
  const sample = decks.sampleSurface(10, 5, { referenceHeight: 6, mode: 'drive' });
  assert.equal(sample.elevation, 6);
  assert.equal(sample.sourceId, 'survey-1');assert.equal(sample.transportId, 'transport:1:0');
  assert.equal(sample.verticalDatum, 'NAVD88');
  assert.ok(Math.abs(sample.normal.x + .1 / Math.sqrt(1.01)) < 1e-8);
  assert.ok(Math.abs(sample.normal.y - 1 / Math.sqrt(1.01)) < 1e-8);
  const positions = decks.mesh.geometry.attributes.position;
  assert.deepEqual(Array.from({ length: positions.count }, (_, i) => positions.getY(i)), [5, 7, 7, 5]);
  assert.equal(decks.getStatus().triangles, 2);
  let referenceHeight = 5;
  for (let x = 0; x <= 20; x += .5) {
    const surface = decks.sampleSurface(x, 5, { referenceHeight, mode: 'drive' });
    assert.ok(surface, 'continuous movement can climb the measured ramp');
    referenceHeight = surface.elevation;
  }
  assert.equal(referenceHeight, 7);
});

test('a deck above a ground road cannot capture its actor or a query without a prior level', t => {
  const decks = fixture(t, [feature()]);
  assert.equal(decks.sampleSurface(10, 5), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: NaN }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 0 }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 8 }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 7.4 }).elevation, 6);
  assert.equal(decks.sampleSurface(30, 5, { referenceHeight: 6 }), null);
});

test('overlapping bridge levels select the closest accessible measured surface', t => {
  const lower = feature(), upper = feature({ id: 'transport:2:0', sourceId: 'survey-2',
    elevations: { polygon: [6.8, 8.8, 8.8, 6.8], holes: [] } });
  const decks = fixture(t, [lower, upper]);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6.5 }).transportId, lower.id);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 7.7 }).transportId, upper.id);
});

test('surveyed concavities and courtyard holes stay open in both the mesh and surface queries', t => {
  const source = feature({ polygon: [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]],
    holes: [[[2, 2], [7, 2], [7, 7], [2, 7]]], elevations: { polygon: [5, 5, 5, 5, 5, 5], holes: [[5, 5, 5, 5]] } });
  const decks = fixture(t, [source]);
  assert.equal(decks.sampleSurface(5, 5, { referenceHeight: 5 }), null);
  assert.equal(decks.sampleSurface(15, 15, { referenceHeight: 5 }), null);
  assert.equal(decks.sampleSurface(9, 9, { referenceHeight: 5 }).elevation, 5);
  const { position } = decks.mesh.geometry.attributes, indices = decks.mesh.geometry.index;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => indices.getX(i + k));
    area += Math.abs((position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a))
      - (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))) / 2;
  }
  assert.equal(area, 20 * 20 - 10 * 10 - 5 * 5);
});

test('closed source rings keep elevation indices aligned after their repeated endpoint is removed', t => {
  const source = feature({ polygon: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]],
    holes: [[[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]],
    elevations: { polygon: [5, 7, 7, 5, 5], holes: [[5.2, 5.4, 5.4, 5.2, 5.2]] } });
  const decks = fixture(t, [source]);
  assert.equal(decks.mesh.geometry.attributes.position.count, 8);
  assert.equal(decks.sampleSurface(3, 3, { referenceHeight: 5.3 }), null);
  assert.ok(Math.abs(decks.sampleSurface(10, 5, { referenceHeight: 6 }).elevation - 6) < 1e-6);
});

test('tunnels, rail bridges, uncertain elevations and mismatched height rings cannot become drivable decks', t => {
  const invalid = [
    { subtype: 'tunnel' }, { subtype: 'rail bridge' }, { elevationStatus: 'unavailable' },
    { elevationUnits: 'feet' }, { verticalDatum: 'EGM96' }, { verticalDatum: undefined },
    { elevations: { polygon: [5, 5], holes: [] } }, { elevations: { polygon: [5, NaN, 5, 5], holes: [] } },
    { holes: [[[1, 1], [2, 1], [2, 2]]] }, { sourceId: undefined },
  ].map((overrides, i) => feature({ ...overrides, id: `invalid-${i}` }));
  const decks = fixture(t, invalid);
  assert.equal(decks.getStatus().surfaces, 0);
  assert.equal(decks.getStatus().rejectedFeatures, invalid.length);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6 }), null);
});

test('pedestrian bridges support walking without routing cars onto them', t => {
  const decks = fixture(t, [feature({ subtype: 'pedestrian bridge' })]);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6, mode: 'drive' }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6, mode: 'walk' }).elevation, 6);
});

test('cell replacement removes old query coverage, deduplicates features and releases only owned resources', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
  let materialDisposals = 0;material.addEventListener('dispose', () => materialDisposals++);
  const decks = new TransportSurfaces({ scene, material }), source = feature();
  decks.setFeatures([source, source]);
  assert.equal(decks.getStatus().surfaces, 1);
  const previous = decks.mesh.geometry;let disposed = 0;previous.addEventListener('dispose', () => disposed++);
  decks.setFeatures([source]);assert.equal(decks.mesh.geometry, previous, 'unchanged active source objects do not rebuild');
  decks.setFeatures([]);
  assert.equal(disposed, 1);assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6 }), null);
  decks.dispose();decks.dispose();
  assert.equal(scene.children.length, 0);assert.equal(materialDisposals, 0);
  material.dispose();assert.equal(materialDisposals, 1);
});

test('actual Brooklyn Bridge outline preserves all surveyed NAVD88 vertex heights without filling below the deck', t => {
  const tile = JSON.parse(readFileSync(new URL('../dist/street-detail/0_2.json', import.meta.url)));
  const source = tile.structures.find(feature => feature.name === 'Brooklyn Bridge');
  assert.ok(source);assert.equal(source.polygon.length, 1162);
  const decks = fixture(t, [source]);
  assert.equal(decks.getStatus().surfaces, 1);
  const positions = decks.mesh.geometry.attributes.position, indices = decks.mesh.geometry.index;
  assert.equal(positions.count, source.polygon.length);
  for (let i = 0; i < positions.count; i++) {
    assert.equal(positions.getY(i), Math.fround(source.elevations.polygon[i]));
  }
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < indices.count; i += 3) {
    const vertices = [0, 1, 2].map(k => indices.getX(i + k));
    const x = vertices.reduce((sum, v) => sum + positions.getX(v), 0) / 3;
    const z = vertices.reduce((sum, v) => sum + positions.getZ(v), 0) / 3;
    const y = vertices.reduce((sum, v) => sum + positions.getY(v), 0) / 3;
    min = Math.min(min, y);max = Math.max(max, y);
    const sample = decks.sampleSurface(x, z, { referenceHeight: y, mode: 'drive' });
    assert.ok(sample);assert.ok(Math.abs(sample.elevation - y) < .0001);
    assert.equal(decks.sampleSurface(x, z, { referenceHeight: 0, mode: 'drive' }), null);
  }
  assert.ok(min < 8 && max > 40, 'the actual source retains the bridge approach and elevated span');
});
