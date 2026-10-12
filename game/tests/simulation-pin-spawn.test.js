import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../dist/simulation.js';

const street = { id: 'source-street', name: 'Mapped Street', kind: 'residential', width: 10, points: [[0, -100], [0, 100]] };
function city(overrides = {}) {
  return { bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, spawn: { x: 0, z: -70 },
    roads: [street], buildings: [], missionPoints: [], sampleSurface: (x, z) => ({ elevation: 10 + x * .01 + z * .02 }), ...overrides };
}

test('an exact park pin preserves its coordinates and places the courtesy cab on a nearby mapped street', () => {
  const sim = new Simulation(city());sim.cash = 350;sim.deliveries = 2;
  const mission = sim.mission;
  sim.travelTo({ x: 45.1234, z: 38.4567, exact: true, name: 'Park lawn' });
  assert.equal(sim.player.x, 45.1234);assert.equal(sim.player.z, 38.4567);
  assert.equal(sim.player.mode, 'walk');assert.equal(sim.player.y, 10 + 45.1234 * .01 + 38.4567 * .02);
  assert.equal(sim.city.spawn.exact, true);assert.equal(sim.cash, 350);assert.equal(sim.deliveries, 2);assert.equal(sim.mission, mission);
  const taxi = sim.cars.find(car => car.id === 'player-taxi');
  assert.ok(taxi);assert.ok(Math.abs(taxi.x) < 3, 'the taxi stays in the real street, not beside the off-road pin');
  assert.ok(Math.hypot(taxi.x - sim.player.x, taxi.z - sim.player.z) > 30);
  assert.equal(sim._carContact(taxi.x, taxi.z, taxi.angle), null);
  sim.reset();assert.ok(Math.abs(taxi.x) < 3, 'recovering after pin travel also keeps the taxi on its mapped street');
});

test('exact dry ground can be reached without a road or fabricated nearby car', () => {
  const sim = new Simulation(city({ roads: [] }));
  sim.travelTo({ x: 321.234, z: 210.987, exact: true });
  assert.equal(sim.player.x, 321.234);assert.equal(sim.player.z, 210.987);
  assert.equal(sim.player.mode, 'walk');assert.equal(sim.cars.length, 0);assert.equal(sim.getNearbyCar(), null);
  assert.match(sim.notice, /Explore on foot/);
});

test('exact pins reject blocked, unloaded and out-of-bounds locations without moving the current player', () => {
  const building = { polygon: [[90, 90], [110, 90], [110, 110], [90, 110]], holes: [] };
  const sim = new Simulation(city({ buildings: [building], isReadyAt: (x, z) => x < 200 }));
  const before = { ...sim.player }, cars = sim.cars;
  for (const pin of [{ x: 100, z: 100 }, { x: 250, z: 0 }, { x: -600, z: 0 }]) {
    assert.throws(() => sim.travelTo({ ...pin, exact: true }), /blocked|loading/);
    assert.deepEqual(sim.player, before);assert.equal(sim.cars, cars);
  }
});

test('a mapped road corridor cannot turn an exact water pin into a ground spawn', () => {
  const sim = new Simulation(city({ landscapeContact: (x, z) => z > 20 ? { kind: 'water', nx: 0, nz: -1, depth: 1 } : null }));
  assert.equal(sim.isBlocked(0, 50, .4), false, 'ordinary traversal still retains the mapped water crossing');
  const before = { ...sim.player };
  assert.throws(() => sim.travelTo({ x: 0, z: 50, exact: true }), /water/);
  assert.deepEqual(sim.player, before);
});

test('borough shoreline polygons and their holes reject ocean and unmapped islands', () => {
  const sim = new Simulation(city({ boroughs: [{ name: 'Measured land', polygons: [{
    outer: [[-100, -100], [100, -100], [100, 100], [-100, 100]],
    holes: [[[30, 30], [60, 30], [60, 60], [30, 60]]],
  }] }] }));
  for (const pin of [{ x: 150, z: 0 }, { x: 45, z: 45 }, { x: 99.9, z: 0 }]) {
    assert.throws(() => sim.travelTo({ ...pin, exact: true }), /shoreline/);
  }
  sim.travelTo({ x: 20, z: 10, exact: true });assert.equal(sim.player.x, 20);assert.equal(sim.player.z, 10);
});

test('actual NYC shoreline data admits Central Park land and rejects a Hudson River pin', () => {
  const { boroughs } = JSON.parse(readFileSync(new URL('../dist/boroughs.json', import.meta.url)));
  const { bounds } = JSON.parse(readFileSync(new URL('../dist/road-index.json', import.meta.url)));
  const sim = new Simulation(city({ boroughs, bounds, roads: [], spawn: { x: 0, z: 0 } }));
  const point = { x: 2182.620481132906, z: -4681.312877831491 };
  sim.travelTo({ ...point, exact: true });assert.equal(sim.player.x, point.x);assert.equal(sim.player.z, point.z);
  assert.throws(() => sim.travelTo({ x: -1500, z: -3500, exact: true }), /shoreline/);
});

test('unsafe or distant mapped roads do not force a starter cab onto the selected lawn', () => {
  for (const roads of [[{ ...street, kind: 'bridge', roadwayType: 3 }], [{ ...street, kind: 'tunnel', roadwayType: 4 }],
    [{ ...street, kind: 'footway' }], [{ ...street, points: [[-300, -100], [-300, 100]] }]]) {
    const sim = new Simulation(city({ roads }));sim.travelTo({ x: 40, z: 40, exact: true });
    assert.equal(sim.player.x, 40);assert.equal(sim.player.z, 40);
    assert.equal(sim.cars.some(car => car.id === 'player-taxi'), false);
  }
});

test('ordinary neighborhood travel retains its existing street snapping and nearby starter cab', () => {
  const sim = new Simulation(city());sim.travelTo({ x: 45, z: 38 });
  assert.ok(Math.abs(sim.player.x) < 3);assert.notEqual(sim.player.x, 45);
  assert.equal(sim.getNearbyCar()?.id, 'player-taxi');
});
