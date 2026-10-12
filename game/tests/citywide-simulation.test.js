import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../dist/simulation.js';

const bounds = { minX: -40000, maxX: 40000, minZ: -40000, maxZ: 40000 };
const box = (x, z, width = 10) => ({ id: `${x}:${z}`, polygon: [[x, z], [x + width, z], [x + width, z + width], [x, z + width]] });
const road = (x = 0, z = 0) => ({ id: `road:${x}:${z}`, name: 'Local Street', points: [[x, z - 300], [x, z + 300]], width: 14, oneway: true });
const city = (overrides = {}) => ({ bounds, spawn: { x: 0, z: 0, angle: 0 }, roads: [], buildings: [], missionPoints: [{ x: 0, z: 160, name: 'Delivery' }], ...overrides });
function advance(sim, seconds, controls = {}) {
  for (let frame = 0; frame < seconds * 60; frame++) sim.step(controls, 1 / 60);
}

test('streamed collision replaces unloaded buildings without resetting the player or active job', () => {
  const sim = new Simulation(city({ buildings: [box(20, 20)] }));
  sim.cash = 675;
  sim.deliveries = 4;
  sim.heat = 1.5;
  sim.health = 74;
  sim.interact();
  sim.startMission();
  const player = { ...sim.player }, mission = sim.mission, taxi = sim.cars.find(car => car.controlled), graph = sim._graph;
  const result = sim.setActiveCity({ buildings: [box(80, 80)] });
  assert.equal(sim.isBlocked(25, 25), false);
  assert.equal(sim.isBlocked(85, 85), true);
  assert.deepEqual(sim.player, player);
  assert.equal(sim.mission, mission);
  assert.equal(sim._graph, graph, 'collision-only callbacks retain the local graph');
  assert.equal(sim.cars.find(car => car.controlled), taxi);
  assert.equal(sim.cash, 675);
  assert.equal(sim.deliveries, 4);
  assert.equal(sim.heat, 1.5);
  assert.equal(sim.health, 74);
  assert.equal(sim.bounds, bounds, 'global bounds do not shrink to the loaded neighborhood');
  assert.deepEqual(result.player, { x: player.x, z: player.z });
});

test('traffic loses every stale graph reference and keeps its directed route across road reloads', () => {
  const sim = new Simulation(city({ roads: [road()] }));
  const edge = sim._graph.edges[0];
  const car = sim._makeCar('test-patrol', 'police', sim._lanePoint(edge, 0.7), edge.angle, edge);
  car._route = [edge];
  sim.cars = [sim.cars[0], car];
  sim.setActiveCity({ roads: [structuredClone(road())] });
  assert.notEqual(car._edge, edge);
  assert.ok(sim._graph.edges.includes(car._edge));
  assert.deepEqual(car._route, []);
  assert.equal(car.parked, false);
  assert.ok(car._edge.to.z > car._edge.from.z, 'one-way direction survives');
  sim.setActiveCity({ roads: [] });
  assert.equal(car._edge, null);
  assert.deepEqual(car._route, []);
  assert.equal(car.parked, true);
  sim.setActiveCity({ roads: [road()] });
  assert.ok(sim._graph.edges.includes(car._edge));
  assert.equal(car.parked, false, 'traffic resumes when its road loads again');
  assert.doesNotThrow(() => advance(sim, 1));
});

test('driving pauses at loaded coverage without heat or damage and continues as coverage expands', () => {
  const loadedBounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 30 };
  const sim = new Simulation(city({ loadedBounds }));
  sim.interact();
  advance(sim, 6, { forward: 1 });
  assert.ok(sim.player.z > 20 && sim.player.z < 28, `stopped at ${sim.player.z}`);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
  assert.match(sim.notice, /Loading/);
  assert.equal(sim.bounds.maxZ, 40000);
  sim.setActiveCity({ loadedBounds: { ...loadedBounds, maxZ: 1000 } });
  advance(sim, 3, { forward: 1 });
  assert.ok(sim.player.z > 60);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
});

test('irregular streaming coverage blocks walking and cars before missing geometry', () => {
  let readyLimit = 25;
  const sim = new Simulation(city({ isReadyAt: (x, z, radius) => z + radius < readyLimit }));
  sim.interact();
  advance(sim, 5, { forward: 1 });
  assert.ok(sim.player.z < 23);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
  readyLimit = 150;
  advance(sim, 2, { forward: 1 });
  assert.ok(sim.player.z > 35);
  const walker = new Simulation(city({ isReadyAt: (x, z, radius) => z + radius < 12 }));
  walker.cars = [];
  advance(walker, 4, { moveZ: 1, run: true });
  assert.ok(walker.player.z > 10 && walker.player.z < 11.6);
  assert.equal(walker.isBlocked(walker.player.x, walker.player.z, 0.4), false);
});

test('travel snaps to a loaded street, supplies a safe taxi, and preserves completed and active progress', () => {
  const sim = new Simulation(city());
  sim.cash = 450;
  sim.deliveries = 2;
  sim.startMission();
  const mission = sim.mission;
  const result = sim.setActiveCity({
    roads: [road(10000, 7000)],
    buildings: [box(10012, 6990, 20)],
    loadedBounds: { minX: 9600, maxX: 10400, minZ: 6600, maxZ: 7400 },
  }, { spawn: { x: 10017, z: 7000, name: 'Queens' } });
  assert.ok(Math.abs(sim.player.x - 10000) < 5);
  assert.ok(Math.abs(sim.player.z - 7000) < 10);
  assert.equal(sim.player.mode, 'walk');
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
  assert.equal(sim.getNearbyCar()?.id, 'player-taxi');
  for (const car of sim.cars) assert.equal(sim._carContact(car.x, car.z, car.angle), null);
  assert.equal(sim.cash, 450);
  assert.equal(sim.deliveries, 2);
  assert.equal(sim.mission, mission);
  assert.deepEqual(result.player, { x: sim.player.x, z: sim.player.z });
  sim.reset();
  assert.ok(sim.player.x > 9000, 'recovery uses the current borough');
});

test('travel rejects invalid or unloaded destinations without changing the current trip', () => {
  const sim = new Simulation(city({ roads: [road()], loadedBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } }));
  const player = { ...sim.player }, cars = sim.cars;
  assert.throws(() => sim.travelTo({ x: NaN, z: 0 }), /finite/);
  assert.throws(() => sim.travelTo({ x: 10000, z: 10000 }), /loaded, clear street/);
  assert.deepEqual(sim.player, player);
  assert.equal(sim.cars, cars);
  assert.throws(() => sim.setActiveCity({ loadedBounds: { minX: 10, maxX: 0, minZ: 0, maxZ: 10 } }), /bounds/);
});

test('recovery stays loaded when the previous arrival point has streamed out', () => {
  const sim = new Simulation(city({ roads: [road()] }));
  sim.player.x = 10000;
  sim.player.z = 7000;
  sim.cash = 125;
  sim.setActiveCity({ roads: [road(10000, 7000)], loadedBounds: { minX: 9600, maxX: 10400, minZ: 6600, maxZ: 7400 } });
  sim.reset();
  assert.ok(sim.player.x > 9900);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
  assert.equal(sim.cash, 125);
});
