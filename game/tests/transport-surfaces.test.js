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
  assert.ok(Math.abs(sample.elevation - 6) < 1e-4);
  assert.equal(sample.sourceId, 'survey-1');assert.equal(sample.transportId, 'transport:1:0');
  assert.equal(sample.verticalDatum, 'NAVD88');
  assert.ok(Math.abs(sample.normal.x + .1 / Math.sqrt(1.01)) < 1e-4);
  assert.ok(Math.abs(sample.normal.y - 1 / Math.sqrt(1.01)) < 1e-4);
  // The inside is meshed finer than the outline, and every vertex of it lies in the surveyed plane.
  const positions = decks.mesh.geometry.attributes.position;
  assert.ok(positions.count > 4);
  for (let i = 0; i < positions.count; i++) assert.ok(Math.abs(positions.getY(i) - (5 + positions.getX(i) * .1)) < 1e-4);
  let referenceHeight = 5;
  for (let x = 0; x <= 20; x += .5) {
    const surface = decks.sampleSurface(x, 5, { referenceHeight, mode: 'drive' });
    assert.ok(surface, 'continuous movement can climb the measured ramp');
    referenceHeight = surface.elevation;
  }
  assert.ok(Math.abs(referenceHeight - 7) < 1e-4);
});

test('a deck above a ground road cannot capture its actor or a query without a prior level', t => {
  const decks = fixture(t, [feature()]);
  assert.equal(decks.sampleSurface(10, 5), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: NaN }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 0 }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 8 }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 7.4 }), null, 'a nearby road level cannot capture a deck across a 1.4 m gap');
  assert.ok(Math.abs(decks.sampleSurface(10, 5, { referenceHeight: 6.29 }).elevation - 6) < 1e-4);
  assert.ok(Math.abs(decks.sampleSurface(10, 5, { referenceHeight: 7.4, transportId: 'transport:1:0' }).elevation - 6) < 1e-4, 'an actor already on the measured deck retains its level');
  assert.equal(decks.sampleSurface(30, 5, { referenceHeight: 6 }), null);
});

test('overlapping bridge levels select the closest accessible measured surface', t => {
  const lower = feature(), upper = feature({ id: 'transport:2:0', sourceId: 'survey-2',
    elevations: { polygon: [6.8, 8.8, 8.8, 6.8], holes: [] } });
  const decks = fixture(t, [lower, upper]);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6.5 }), null);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 6.5, transportId: lower.id }).transportId, lower.id);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 7.7 }).transportId, upper.id);
  assert.equal(decks.sampleSurface(10, 5, { referenceHeight: 7.3, transportId: lower.id }).transportId, lower.id);
});

test('surveyed concavities and courtyard holes stay open in both the mesh and surface queries', t => {
  const source = feature({ polygon: [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]],
    holes: [[[2, 2], [7, 2], [7, 7], [2, 7]]], elevations: { polygon: [5, 5, 5, 5, 5, 5], holes: [[5, 5, 5, 5]] } });
  const decks = fixture(t, [source]);
  assert.equal(decks.sampleSurface(5, 5, { referenceHeight: 5 }), null);
  assert.equal(decks.sampleSurface(15, 15, { referenceHeight: 5 }), null);
  assert.ok(Math.abs(decks.sampleSurface(9, 9, { referenceHeight: 5 }).elevation - 5) < 1e-6);
  const { position } = decks.mesh.geometry.attributes, indices = decks.mesh.geometry.index;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => indices.getX(i + k));
    area += Math.abs((position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a))
      - (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))) / 2;
  }
  assert.ok(Math.abs(area - (20 * 20 - 10 * 10 - 5 * 5)) < 1e-6);
});

test('closed source rings keep elevation indices aligned after their repeated endpoint is removed', t => {
  const source = feature({ polygon: [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]],
    holes: [[[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]],
    elevations: { polygon: [5, 7, 7, 5, 5], holes: [[5.2, 5.4, 5.4, 5.2, 5.2]] } });
  const decks = fixture(t, [source]);
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
  assert.ok(Math.abs(decks.sampleSurface(10, 5, { referenceHeight: 6, mode: 'walk' }).elevation - 6) < 1e-4);
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

test('the inside of a wide span follows its edges from side to side and does not fold into a ridge', t => {
  // Two sides surveyed at different stations, as a long span is: the old fill joined far-apart vertices.
  const polygon = [[0, 0], [300, 0], [300, 30], [200, 30], [90, 30], [0, 30]];
  const decks = fixture(t, [feature({ polygon, elevations: { polygon: polygon.map(([x]) => 10 + x * .05), holes: [] } })]);
  assert.ok(decks.getStatus().triangles > 50);
  for (let x = 5; x < 300; x += 12.5) for (const z of [3, 15, 27]) {
    const found = decks.surfacesAt(x, z, 'drive');
    assert.equal(found.length, 1);
    assert.ok(Math.abs(found[0].elevation - (10 + x * .05)) < 1e-3, `plane at ${x},${z}: ${found[0].elevation}`);
  }
});

test('a lone survey slip is ignored and a stepped rise becomes a slope a car can climb', t => {
  // The south side dips to nothing at one vertex; both sides jump five metres at x = 100.
  const south = [[0, 0], [50, 0], [60, 0], [70, 0], [100, 0], [101, 0], [200, 0]], heights = [10, 10, 1, 10, 10, 15, 15];
  const polygon = [...south, [200, 20], [101, 20], [100, 20], [0, 20]];
  const decks = fixture(t, [feature({ polygon, elevations: { polygon: [...heights, 15, 15, 10, 10], holes: [] } })]);
  assert.ok(Math.abs(decks.surfacesAt(60, 1, 'drive')[0].elevation - 10) < .2, 'the slip is gone');
  let steepest = 0, before = decks.surfacesAt(1, 10, 'drive')[0].elevation, reference = before;
  for (let x = 1.5; x < 199; x += .5) {
    const now = decks.surfacesAt(x, 10, 'drive')[0].elevation;
    steepest = Math.max(steepest, Math.abs(now - before) / .5);before = now;
    const surface = decks.sampleSurface(x, 10, { referenceHeight: reference, mode: 'drive', transportId: 'transport:1:0' });
    assert.ok(surface, `continuous at ${x}`);reference = surface.elevation;
  }
  assert.ok(steepest < .15, `steepest grade ${steepest.toFixed(2)}`);
  assert.ok(Math.abs(decks.surfacesAt(5, 10, 'drive')[0].elevation - 10) < .2 && Math.abs(decks.surfacesAt(195, 10, 'drive')[0].elevation - 15) < .2, 'away from the step the survey stands');
});

test('traffic takes the deck its street is on; nothing else is lifted to one', t => {
  const lower = feature(), upper = feature({ id: 'transport:2:0', sourceId: 'survey-2', elevations: { polygon: [12, 14, 14, 12], holes: [] } });
  const decks = fixture(t, [lower, upper]);
  assert.equal(decks.sampleSurface(10, 5, { mode: 'drive', level: 17 }).transportId, lower.id);
  assert.equal(decks.sampleSurface(10, 5, { mode: 'drive', level: 21 }).transportId, upper.id);
  assert.equal(decks.sampleSurface(10, 5, { mode: 'drive', level: 13 }), null, 'a street at grade stays on the ground');
  assert.equal(decks.sampleSurface(10, 5, { mode: 'walk', level: 17 }), null, 'someone on foot is never placed by a street level');
  assert.equal(decks.sampleSurface(10, 5, { mode: 'drive', level: 17, referenceHeight: 0 }), null, 'a car on the ground does not leap six metres up');
  assert.equal(decks.sampleSurface(30, 5, { mode: 'drive', level: 17 }), null);
});

test('a deck is drawn with a slab and parapets, open where it lands or meets another deck', t => {
  const landing = feature({ polygon: [[0, 0], [60, 0], [60, 10], [0, 10]], elevations: { polygon: [0, 6, 6, 0], holes: [] } });
  const next = feature({ id: 'transport:2:0', sourceId: 'survey-2', polygon: [[60, 0], [80, 0], [80, 10], [60, 10]], elevations: { polygon: [6, 6, 6, 6], holes: [] } });
  const scene = new THREE.Scene(), decks = new TransportSurfaces({ scene, groundAt: () => 0 });
  t.after(() => decks.dispose());
  decks.setFeatures([landing, next]);
  const at = (id, test) => { const part = decks.parts.find(p => p.id === id); return part.edges.filter(edge => { const p = part.vertices[edge.i], q = part.vertices[edge.j]; return test((p.x + q.x) / 2, (p.z + q.z) / 2); }); };
  assert.ok(at(landing.id, x => x < .01).every(edge => edge.open), 'the foot of the ramp is open to the ground');
  assert.ok(at(landing.id, x => x > 59.99).every(edge => edge.open), 'and its head to the next deck');
  assert.ok(at(next.id, x => x < 60.01).every(edge => edge.open));
  assert.ok(at(next.id, x => x > 79.99).every(edge => !edge.open), 'the far end is a drop, and has a parapet');
  assert.ok(at(landing.id, (x, z) => x > 12 && (z < .01 || z > 9.99)).every(edge => !edge.open), 'as do the sides');
  // Two sides of the ramp less its landing, and three sides of the level deck.
  assert.ok(decks.getStatus().parapetMetres > 140 && decks.getStatus().parapetMetres <= 170, String(decks.getStatus().parapetMetres));
  const y = decks.structure.geometry.attributes.position;let lowest = Infinity, highest = -Infinity;
  for (let i = 0; i < y.count; i++) { lowest = Math.min(lowest, y.getY(i));highest = Math.max(highest, y.getY(i)); }
  assert.ok(highest > 6.8 && highest < 7, 'parapets stand above the deck');
  assert.ok(lowest < 0 && lowest > -1.2, 'the low sides are walled down to the ground');
});

test('the streets a deck carries give it lane lines and piers, clear of the street below', t => {
  const viaduct = feature({ polygon: [[0, 0], [200, 0], [200, 12], [0, 12]], elevations: { polygon: [9, 9, 9, 9], holes: [] } });
  const decks = fixture(t, [viaduct]);
  const road = (id, points, more = {}) => ({ id, name: id, points, width: 10, oneway: 'yes', kind: 'bridge', roadwayType: 3, fromLevel: 17, toLevel: 17, ...more });
  decks.setRoads([road('over', [[-20, 6], [220, 6]]), road('under', [[100, -50], [100, 60]], { kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13, oneway: false })]);
  decks.setGround(() => 0);decks.refresh();
  const status = decks.getStatus();
  assert.ok(status.piers >= 5 && status.piers <= 9, `piers: ${status.piers}`);
  const paint = decks.paint.geometry.attributes.position;
  assert.ok(paint.count > 100);
  for (let i = 0; i < paint.count; i++) assert.ok(Math.abs(paint.getY(i) - 9.03) < 1e-3 && paint.getX(i) >= 0 && paint.getX(i) <= 200);
  const structure = decks.structure.geometry.attributes.position;
  for (let i = 0; i < structure.count; i++) {
    const x = structure.getX(i), y = structure.getY(i);
    assert.ok(!(y < 6 && Math.abs(x - 100) < 5), `nothing stands in the street below: ${x},${y}`);
  }
  decks.setGround(() => 7);decks.refresh();
  assert.equal(decks.getStatus().piers, 0, 'no piers where the deck is barely above the ground');
});

test('a street that runs onto a deck hanging in the air is given an approach from the ground', t => {
  const bridge = feature({ polygon: [[0, 0], [100, 0], [100, 10], [0, 10]], elevations: { polygon: [4, 4, 4, 4], holes: [] } });
  const decks = fixture(t, [bridge]);
  const road = (id, points, more = {}) => ({ id, name: id, points, width: 8, oneway: false, kind: 'bridge', roadwayType: 3, fromLevel: 13, toLevel: 17, ...more });
  decks.setRoads([road('on', [[-40, 5], [50, 5]]), road('lead', [[-200, 5], [-40, 5]], { kind: 'residential', roadwayType: 1, toLevel: 13 }),
    // This one only passes beneath, and must not be given a ramp up into the side of the bridge.
    road('beneath', [[50, -80], [50, 90]], { fromLevel: 17, toLevel: 17 })]);
  decks.setGround(() => 0);decks.refresh();
  assert.equal(decks.getStatus().approaches, 1);
  assert.equal(decks.sampleSurface(-150, 5, { referenceHeight: 0, mode: 'drive' }), null, 'the street is on the ground well before the bridge');
  // Drive from the ground onto the bridge.
  let y = 0, id = null, steepest = 0;
  for (let x = -120; x <= 60; x += .25) {
    const surface = decks.sampleSurface(x, 5, { referenceHeight: y, mode: 'drive', transportId: id });
    if (!surface) continue;
    steepest = Math.max(steepest, Math.abs(surface.elevation - y) / .25);
    y = surface.elevation;id = surface.transportId;
  }
  assert.equal(id, bridge.id);assert.ok(Math.abs(y - 4) < 1e-3);
  assert.ok(steepest < .25, `steepest ${steepest.toFixed(2)}`);
  decks.setGround(() => 3.9);decks.refresh();
  assert.equal(decks.getStatus().approaches, 0, 'a deck that already meets the ground needs none');
});

test('actual Brooklyn Bridge outline becomes a smooth roadway from its approach to the span', t => {
  const tile = JSON.parse(readFileSync(new URL('../dist/street-detail/0_2.json', import.meta.url)));
  const source = tile.structures.find(feature => feature.name === 'Brooklyn Bridge');
  assert.ok(source);assert.equal(source.polygon.length, 1162);
  const decks = fixture(t, [source]);
  assert.equal(decks.getStatus().surfaces, 1);
  let min = Infinity, max = -Infinity, area = 0, steep = 0;
  for (const { a, b, c, normal } of decks.parts[0].triangles) {
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3, y = (a.y + b.y + c.y) / 3;
    min = Math.min(min, y);max = Math.max(max, y);
    const size = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    area += size;if (Math.hypot(normal.x, normal.z) / normal.y > .25) steep += size;
    const sample = decks.sampleSurface(x, z, { referenceHeight: y, mode: 'drive' });
    assert.ok(sample);assert.ok(Math.abs(sample.elevation - y) < .001);
    assert.equal(decks.sampleSurface(x, z, { referenceHeight: 0, mode: 'drive' }), null);
  }
  assert.ok(min < 8 && max > 40, 'the actual source retains the bridge approach and elevated span');
  assert.ok(Math.abs(area - 59960) < 60, `the whole outline is decked: ${area}`);
  assert.ok(steep < 40, `no walls in the roadway: ${steep.toFixed(0)} m² steeper than one in four`);
  // Through the Manhattan tower, where the survey steps up five metres at once.
  let before = null;
  for (let s = 0; s <= 200; s += 2) {
    const deck = decks.surfacesAt(100 + s * .7071, 1640 + s * .7071, 'drive')[0];
    assert.ok(deck);
    if (before !== null) assert.ok(Math.abs(deck.elevation - before) < .45, `a step of ${(deck.elevation - before).toFixed(2)} m at ${s}`);
    before = deck.elevation;
  }
});
