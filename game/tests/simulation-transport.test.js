import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../dist/simulation.js';
import { TransportSurfaces } from '../dist/transport-surfaces.js';

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
  assert.ok(Math.abs(sim.player.y - sim.player.z * .1) < 1e-6);
  const { sim: lower } = fixture(t, { ramp: false });lower.cars = [];
  advance(lower, 12, { moveZ: 1 });
  assert.equal(lower.player.y, 0);
});

test('vehicle support points climb the same ramp and preserve the deck level on exit', t => {
  const { sim } = fixture(t);assert.equal(sim.interact(), true);
  for (let i = 0; i < 1200 && sim.player.z < 70; i++) sim.step({ forward: 1 }, 1 / 120);
  const car = sim.cars.find(car => car.controlled);
  assert.ok(car.z > 65 && car.z < 75);
  assert.ok(Math.abs(car.y - (car.z - .035) * .1) < 1e-5);
  assert.ok(Math.abs(car.pitch + Math.atan(.1)) < 1e-5);
  assert.equal(sim.player.y, car.y);
  car.speed = 0;car.velocityX = 0;car.velocityZ = 0;
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'walk');
  assert.ok(Math.abs(sim.player.y - sim.player.z * .1) < 1e-5);
});

test('wheels slightly outside a deck outline do not average in the distant road below', t => {
  const { sim } = fixture(t);
  const car = sim.cars[0];Object.assign(car, { x: 7.5, z: 60, y: 6, angle: 0 });
  sim.updateGrounding();
  assert.ok(Math.abs(car.y - 5.9965) < 1e-5);
  assert.ok(Math.abs(car.roll) < 1e-5);
  assert.ok(Math.abs(car.pitch + Math.atan(.1)) < 1e-5);
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
