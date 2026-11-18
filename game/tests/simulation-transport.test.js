import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../dist/simulation.js';
import { TransportSurfaces } from '../dist/transport-surfaces.js';
import { prepareTerrain, sampleTerrain } from '../dist/landscape.js';

function fixture(t, { ramp = true, subtype = 'bridge', spawn = { x: 0, z: -12 }, roads = [] } = {}) {
  const decks = new TransportSurfaces();t.after(() => decks.dispose());
  const north = ramp ? 0 : -100;
  decks.setFeatures([{ id: 'transport:ramp', sourceId: 'survey-ramp', kind: 'transport', subtype,
    polygon: [[-8, north], [8, north], [8, 120], [-8, 120]], holes: [],
    elevations: { polygon: ramp ? [0, 0, 12, 12] : [6, 6, 6, 6], holes: [] },
    elevationStatus: 'surveyed', elevationUnits: 'meters', verticalDatum: 'NAVD88' }]);
  const sim = new Simulation({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, spawn,
    roads, buildings: [], sampleSurface: (x, z, options) => decks.sampleSurface(x, z, options) || { elevation: 0, normal: { x: 0, y: 1, z: 0 } } });
  return { sim, decks };
}
function advance(sim, seconds, input) { for (let i = 0; i < seconds * 120; i++) sim.step(input, 1 / 120); }

test('walking climbs a surveyed ramp continuously while an overhead bridge leaves the lower road unchanged', t => {
  const { sim } = fixture(t);sim.cars = [];
  advance(sim, 12, { moveZ: 1 });
  assert.ok(sim.player.z > 35 && sim.player.z < 45);
  assert.ok(Math.abs(sim.player.y - sim.player.z * .1) < 1e-4);
  const { sim: lower } = fixture(t, { ramp: false });lower.cars = [];
  advance(lower, 12, { moveZ: 1 });
  assert.equal(lower.player.y, 0);
});

test('vehicle support points climb the same ramp and preserve the deck level on exit', t => {
  const { sim } = fixture(t);assert.equal(sim.interact(), true);
  for (let i = 0; i < 1200 && sim.player.z < 70; i++) sim.step({ forward: 1 }, 1 / 120);
  const car = sim.cars.find(car => car.controlled);
  assert.ok(car.z > 65 && car.z < 75);
  assert.ok(Math.abs(car.y - (car.z - .035) * .1) < 1e-4);
  assert.ok(Math.abs(car.pitch + Math.atan(.1)) < 1e-4);
  assert.equal(sim.player.y, car.y);
  car.speed = 0;car.velocityX = 0;car.velocityZ = 0;
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'walk');
  assert.ok(Math.abs(sim.player.y - sim.player.z * .1) < 1e-4);
});

test('wheels slightly outside a deck outline do not average in the distant road below', t => {
  const { sim } = fixture(t);
  const car = sim.cars[0];Object.assign(car, { x: 7.5, z: 60, y: 6, angle: 0 });
  sim.updateGrounding();
  assert.ok(Math.abs(car.y - 5.9965) < 1e-5);
  assert.ok(Math.abs(car.roll) < 1e-5);
  assert.ok(Math.abs(car.pitch + Math.atan(.1)) < 1e-4);
  assert.deepEqual(car.wheelSupported, [true, true, false, false]);
  assert.ok(Math.abs(car.wheelHeights[0] - 5.863) < 1e-5);
  assert.ok(Math.abs(car.wheelHeights[1] - 6.13) < 1e-5);
});

test('travel and recovery discard a previous deck level before sampling the destination', t => {
  const { sim } = fixture(t, { ramp: false });
  sim.player.y = 6;sim.cars[0].y = 6;
  sim.travelTo({ x: 0, z: 30 });
  assert.equal(sim.player.y, 0);assert.ok(sim.cars.every(car => car.y === 0));
  sim.player.y = 6;sim.cars[0].y = 6;
  sim.reset();
  assert.equal(sim.player.y, 0);assert.equal(sim.cars[0].y, 0);
  sim.step({}, 1 / 60);
  assert.equal(sim.player.y, 0);assert.equal(sim.cars[0].y, 0);
  assert.equal(sim.groundHeight(0, 30), 0, 'foundation queries never acquire the deck overhead');
});

test('recycled traffic cannot carry its old deck level to a separate road', t => {
  const roads = [{ id: 'road', name: 'Source street', width: 8, points: [[0, 0], [0, 300]] }];
  const { sim } = fixture(t, { ramp: false, roads, spawn: { x: -200, z: -200 } });
  const car = sim._makeCar('recycle', 'sedan', { x: 200, z: 200 }, 0, sim._graph.edges[0]);
  car.y = 6;sim.cars = [sim.cars[0], car];sim._random = () => 0;
  assert.equal(sim._recycleTraffic(car), true);
  assert.equal(car.y, undefined, 'repositioned traffic has no known prior elevation at the new location');
  sim.updateGrounding();assert.equal(car.y, 0);
});

test('a car on an overhead deck cannot be entered or collide with actors below', t => {
  const { sim } = fixture(t, { ramp: false });
  const lower = sim.cars[0], overhead = sim._makeCar('overhead', 'sedan', { x: 0, z: 0 }, 0);
  overhead.y = 6;sim.cars.push(overhead);
  Object.assign(sim.player, { x: 0, z: 0, y: 0 });
  assert.equal(sim.getNearbyCar(), null);
  assert.equal(sim._nearCar(0, 0, .4, null, 0), null);
  Object.assign(sim.player, { x: lower.x, z: lower.z - 3, y: 0 });
  assert.equal(sim.interact(), true);
  advance(sim, 5, { forward: 1 });
  assert.ok(sim.player.z > 20, 'the lower car can pass through the bridge projection');
  assert.equal(sim.player.y, 0);assert.equal(overhead.y, 6);
  assert.equal(sim.health, 100);assert.equal(sim.heat, 0);
});

test('pedestrian-only ramp elevation is available to walking but excluded for driving', t => {
  const { sim } = fixture(t, { subtype: 'pedestrian bridge' });
  sim.cars = [];advance(sim, 8, { moveZ: 1 });
  assert.ok(sim.player.y > 2);
  const { sim: driver } = fixture(t, { subtype: 'pedestrian bridge' });
  assert.equal(driver.interact(), true);
  advance(driver, 4, { forward: 1 });
  assert.ok(driver.player.z > 20);assert.equal(driver.player.y, 0);
});

test('vehicle exit skips an unsupported bridge-edge door and uses the supported opposite side', t => {
  const { sim } = fixture(t, { ramp: false });
  const car = sim.cars[0];Object.assign(car, { x: -7, z: 30, y: 6, angle: 0, controlled: true });
  Object.assign(sim.player, { x: car.x, z: car.z, y: car.y, mode: 'drive', vehicleId: car.id });
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'walk');
  assert.ok(Math.abs(sim.player.x - (-7 + 2.2)) < 1e-10, 'the first door is beyond the measured deck; the opposite door remains supported');
  assert.equal(sim.player.z, 30);assert.equal(sim.player.y, 6);
});

test('vehicle exit stays in the car when every horizontally clear candidate lacks nearby deck support', t => {
  const { sim, decks } = fixture(t, { ramp: false });
  decks.setFeatures([{ id: 'transport:narrow', sourceId: 'survey-narrow', kind: 'transport', subtype: 'bridge',
    polygon: [[-1, -1], [1, -1], [1, 1], [-1, 1]], holes: [],
    elevations: { polygon: [6, 6, 6, 6], holes: [] },
    elevationStatus: 'surveyed', elevationUnits: 'meters', verticalDatum: 'NAVD88' }]);
  const car = sim.cars[0];Object.assign(car, { x: 0, z: 0, y: 6, angle: 0, controlled: true });
  Object.assign(sim.player, { x: 0, z: 0, y: 6, mode: 'drive', vehicleId: car.id });
  const before = { ...sim.player };
  assert.equal(sim.interact(), false);
  assert.deepEqual(sim.player, before);assert.equal(car.controlled, true);
  assert.match(sim.notice, /Both doors are blocked/);
});

test('an actor already on a measured deck stops before an unsupported drop without damage', t => {
  const { sim } = fixture(t, { ramp: false });
  const car = sim.cars[0];Object.assign(car, { x: 0, z: 119, y: 6, angle: 0, controlled: true });
  Object.assign(sim.player, { x: 0, z: 119, y: 6, mode: 'drive', vehicleId: car.id });
  sim.updateGrounding();advance(sim, 4, { forward: 1 });
  assert.ok(car.z <= 120);assert.equal(car.y, 6);assert.equal(sim.health, 100);assert.equal(sim.heat, 0);
  assert.match(sim.notice, /Deck edge/);
  Object.assign(sim.player, { x: 0, z: 119, y: 6, mode: 'walk', vehicleId: null, transportId: car.transportId, grounded: true, vy: 0 });
  sim.cars = [];advance(sim, 4, { moveZ: 1 });
  assert.ok(sim.player.z > 120, 'on foot you can step off the deck');
  assert.ok(sim.player.y < 1, 'and fall to the road below');
});

test('actual Central Park road samples no longer mix deck and ground wheel levels or jump across a meter gap', t => {
  const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url)));
  const base = prepareTerrain(read('landscape/nyc-terrain.json'));
  // The park's grid keeps its heights beside it, as centimetres above a floor.
  const park = read('landscape/central-park-terrain.json'), packed = readFileSync(new URL(`../dist/landscape/${park.heightsUrl.slice(2)}`, import.meta.url));
  const raw = new Uint16Array(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
  const fine = prepareTerrain({ ...park, heights: Float32Array.from(raw, value => value * park.heightEncoding.scale + park.heightEncoding.offset) }, { base });
  const decks = new TransportSurfaces();t.after(() => decks.dispose());
  const structures = new Map();
  for (const cell of ['3_-11', '4_-11']) for (const feature of read(`street-detail/${cell}.json`).structures) structures.set(feature.id, feature);
  decks.setFeatures([...structures.values()]);
  const sampleSurface = (x, z, options) => decks.sampleSurface(x, z, options) || sampleTerrain(fine, x, z) || sampleTerrain(base, x, z);
  // These exact mapped road/lane positions reproduced 1.49 m height, 42.47°
  // pitch and 48.61° roll discontinuities over just 0.25 m before the fix.
  const cases = [
    { name: 'West Drive bridge 220', x: 1821.6454186341857, z: -5097.486871678191, dx: 4.53, dz: -14.42 },
    { name: 'West Drive bridge 410', x: 1935.6570155631002, z: -5258.988601923, dx: 9.37, dz: -9.77 },
    { name: 'Center Drive bridge 221', x: 2241.9988606577167, z: -5119.840821225721, dx: 1.21, dz: -1.33 },
  ];
  for (const location of cases) {
    const angle = Math.atan2(location.dx, location.dz);
    const sim = new Simulation({ bounds: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 },
      roads: [], buildings: [], spawn: { x: 0, z: 0 }, sampleSurface });
    const car = sim.cars[0];
    Object.assign(car, { x: location.x - Math.sin(angle) * .25, z: location.z - Math.cos(angle) * .25, angle, y: undefined, transportId: null });
    sim.updateGrounding();const before = { y: car.y, pitch: car.pitch, roll: car.roll };
    Object.assign(car, { x: location.x, z: location.z });sim.updateGrounding();
    assert.ok(Math.abs(car.y - before.y) < .2, location.name);
    assert.ok(Math.abs(car.pitch - before.pitch) < 2 * Math.PI / 180, location.name);
    assert.ok(Math.abs(car.roll - before.roll) < 2 * Math.PI / 180, location.name);
    assert.equal(car.transportId, null, 'a disconnected elevated surface cannot capture ground wheels');
    assert.equal(car.wheelHeights.length, 4);assert.deepEqual(car.wheelSupported, [true, true, true, true]);
  }
});
