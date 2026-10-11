import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../dist/simulation.js';

function city(overrides = {}) {
  return {
    bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
    roads: [],
    buildings: [],
    spawn: { x: 0, z: 0, angle: 0 },
    missionPoints: [{ x: 0, z: 140, name: 'Prince Street' }, { x: 110, z: 0, name: 'Broadway' }],
    ...overrides,
  };
}

function advance(simulation, seconds, input = {}, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) simulation.step(input, 1 / fps);
}

test('spawn leaves room beside a nearby driveable taxi', () => {
  const sim = new Simulation(city());
  assert.equal(sim.player.mode, 'walk');
  assert.equal(sim.getNearbyCar()?.id, 'player-taxi');
  assert.equal(sim._nearCar(sim.player.x, sim.player.z, 0.4), null);
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'drive');
  assert.equal(sim.player.vehicleId, 'player-taxi');
});

test('acceleration and steering are consistent at 30, 60 and 144 Hz', () => {
  const states = [30, 60, 144].map(fps => {
    const sim = new Simulation(city());
    sim.interact();
    advance(sim, 4, { forward: 1 }, fps);
    advance(sim, 1, { forward: 1, turn: 0.3 }, fps);
    advance(sim, 1, { brake: true }, fps);
    return sim.player;
  });
  for (const state of states.slice(1)) {
    assert.ok(Math.abs(state.x - states[0].x) < 0.02);
    assert.ok(Math.abs(state.z - states[0].z) < 0.02);
    assert.ok(Math.abs(state.angle - states[0].angle) < 0.002);
    assert.ok(Math.abs(state.speed - states[0].speed) < 0.02);
  }
  assert.ok(states[0].x > 0, 'positive steering turns right');
});

test('brakes stop without turning forward speed into reverse speed', () => {
  const sim = new Simulation(city());
  sim.interact();
  advance(sim, 2, { forward: 1 });
  assert.ok(sim.player.speed > 10);
  advance(sim, 3, { brake: true });
  assert.equal(sim.player.speed, 0);
});

test('high speed and a long frame cannot tunnel through a thin building', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[-30, 22], [30, 22], [30, 22.3], [-30, 22.3]] }] }));
  sim.interact();
  const car = sim.cars.find(item => item.controlled);
  car.z = 18;
  car.speed = 30;
  sim.step({ forward: 1 }, 0.25);
  assert.ok(car.z < 20.1, `car should remain on its original side, got ${car.z}`);
  assert.equal(sim._carContact(car.x, car.z, car.angle), null);
  assert.ok(sim.health < 100);
  assert.ok(sim.heat > 0);
});

test('walking slides along a wall and cannot cross it', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[3, -60], [20, -60], [20, 60], [3, 60]] }] }));
  sim.cars = [];
  advance(sim, 3, { moveX: 1, moveZ: 1, run: true });
  assert.ok(sim.player.x <= 2.601);
  assert.ok(sim.player.z > 10);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
});

test('a car stays inside world bounds without damage or heat from the map limit', () => {
  const sim = new Simulation(city({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 } }));
  sim.interact();
  advance(sim, 6, { forward: 1 });
  assert.ok(sim.player.z <= 37.961);
  assert.ok(sim.player.z > 30);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
});

test('safe exit requires low speed and chooses the unblocked side', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[-8, -8], [-1.5, -8], [-1.5, 12], [-8, 12]] }] }));
  assert.equal(sim.interact(), true);
  const car = sim.cars.find(item => item.controlled);
  car.speed = 10;
  assert.equal(sim.interact(), false);
  assert.equal(sim.player.mode, 'drive');
  car.speed = 0;
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'walk');
  assert.ok(sim.player.x > car.x);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
  assert.equal(car.speed, 0);
  assert.equal(car.controlled, false);
});

test('delivery pays once, can be repeated, and will not complete at high speed', () => {
  const sim = new Simulation(city());
  sim.interact();
  assert.equal(sim.startMission(), true);
  assert.equal(sim.startMission(), false);
  const car = sim.cars.find(item => item.controlled);
  Object.assign(car, { x: sim.mission.target.x, z: sim.mission.target.z, speed: 10 });
  sim.step({}, 1 / 60);
  assert.equal(sim.mission.phase, 'active');
  car.speed = 0;
  sim.step({}, 1 / 60);
  assert.equal(sim.mission.phase, 'complete');
  assert.equal(sim.deliveries, 1);
  const cash = sim.cash;
  advance(sim, 2);
  assert.equal(sim.cash, cash);
  const firstTarget = sim.mission.target.name;
  assert.equal(sim.startMission(), true);
  assert.notEqual(sim.mission.target.name, firstTarget);
  Object.assign(car, { x: sim.mission.target.x, z: sim.mission.target.z, speed: 0 });
  sim.step({}, 1 / 60);
  assert.equal(sim.deliveries, 2);
  assert.ok(sim.cash > cash);
});

test('an expired delivery fails without paying', () => {
  const sim = new Simulation(city());
  sim.startMission();
  sim.mission.timeLeft = 0.01;
  sim.step({}, 1 / 30);
  assert.equal(sim.mission.phase, 'failed');
  assert.equal(sim.cash, 0);
  assert.equal(sim.deliveries, 0);
});

test('heat clears after escaping patrol sight', () => {
  const sim = new Simulation(city());
  sim.heat = 2;
  sim._timeSinceCrime = 0;
  advance(sim, 8);
  assert.equal(sim.heat, 2);
  advance(sim, 20);
  assert.equal(sim.heat, 0);
});

test('recovery retains completed progress and cancels an active job', () => {
  const sim = new Simulation(city());
  sim.cash = 250;
  sim.deliveries = 2;
  sim.startMission();
  sim.heat = 2;
  sim.health = 25;
  sim.reset();
  assert.equal(sim.cash, 250);
  assert.equal(sim.deliveries, 2);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
  assert.equal(sim.mission.phase, 'failed');
  assert.equal(sim.player.mode, 'walk');
});

test('road crossings become junctions and directed police routes obey one-way streets', () => {
  const roads = [
    { id: 'east', name: 'Prince Street', points: [[-80, 0], [80, 0]], width: 12, oneway: true },
    { id: 'north', name: 'Broadway', points: [[0, -80], [0, 80]], width: 14, oneway: true },
  ];
  const sim = new Simulation(city({ roads }));
  const junction = sim._graph.nodes.find(node => Math.abs(node.x) < 0.1 && Math.abs(node.z) < 0.1);
  assert.ok(junction, 'the crossing exists even without an explicit shared OSM vertex');
  assert.equal(junction.edges.length, 2);
  for (const edge of sim._graph.edges) {
    if (edge.road.id === 'east') assert.ok(edge.to.x > edge.from.x);
    if (edge.road.id === 'north') assert.ok(edge.to.z > edge.from.z);
  }
  const approach = sim._graph.edges.find(edge => edge.from.x === -80);
  const police = sim._makeCar('test-police', 'police', sim._lanePoint(approach, 0.5), approach.angle, approach);
  sim.player.x = 0;
  sim.player.z = 70;
  sim._routePolice(police);
  assert.ok(police._route.length > 0);
  assert.equal(police._route[0].road.id, 'north');
  assert.equal(police._route.at(-1).to.z, 80);
  assert.equal(sim.getStreet(), 'Broadway');
});

test('polygons with either winding and boundary points block placement', () => {
  const polygon = [[10, 10], [20, 10], [20, 20], [10, 20]];
  for (const ring of [polygon, [...polygon].reverse()]) {
    const sim = new Simulation(city({ buildings: [{ polygon: ring }] }));
    assert.equal(sim.isBlocked(15, 15), true);
    assert.equal(sim.isBlocked(10, 15), true);
    assert.equal(sim.isBlocked(9.7, 15, 0.4), true);
    assert.equal(sim.isBlocked(9, 15, 0.4), false);
    const point = sim._resolvePosition(10, 15, 0.4);
    assert.equal(sim.isBlocked(point.x, point.z, 0.4), false);
  }
});

test('clipped one-way exits recycle offscreen and keep actual SoHo traffic moving', () => {
  const soho = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url), 'utf8'));
  const sim = new Simulation(soho);
  assert.equal(sim.cars.length, 16);
  assert.ok(sim.getNearbyCar(), 'the real spawn provides an immediately accessible cab');
  const taxi = sim.cars.find(car => car.id === 'player-taxi');
  assert.equal(sim._carContact(taxi.x, taxi.z, taxi.angle), null);
  for (let second = 0; second < 120; second++) {
    advance(sim, 1);
    for (const car of sim.cars) assert.equal(sim._carContact(car.x, car.z, car.angle), null, `${car.id} entered a building or crossed the world boundary`);
  }
  assert.ok(sim.cars.filter(car => car.speed > 2).length >= 8, 'traffic continues instead of accumulating permanently at map exits');
  assert.equal(sim.startMission(), true);
  assert.equal(sim.isBlocked(sim.mission.target.x, sim.mission.target.z, 1), false);
});
