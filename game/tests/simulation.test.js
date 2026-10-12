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
  assert.ok(states[0].x < 0, 'right steering moves toward screen-right when the chase camera looks along +Z');
});

test('forward and reverse follow the vehicle nose at every cardinal heading', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const forward of [-1, 1]) {
    const sim = new Simulation(city({ spawn: { x: 0, z: 0, angle } }));
    sim.interact();
    const start = { ...sim.player };
    advance(sim, 1, { forward });
    const dx = sim.player.x - start.x, dz = sim.player.z - start.z;
    assert.ok((dx * Math.sin(angle) + dz * Math.cos(angle)) * forward > 2);
    assert.ok(Math.abs(dx * Math.cos(angle) - dz * Math.sin(angle)) < 0.001, 'straight throttle has no lateral motion');
    assert.equal(Math.sign(sim.player.speed), forward);
  }
});

test('right and left steering follow the chase camera in forward and reverse at every heading', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const turn of [-1, 1]) for (const forward of [-1, 1]) {
    const sim = new Simulation(city({ spawn: { x: 0, z: 0, angle } }));
    sim.interact();
    const start = { ...sim.player }, car = sim.cars.find(car => car.controlled);
    advance(sim, 0.8, { forward, turn });
    // Camera-forward is +Z in the car's frame. Its right vector is -X.
    const rightX = -Math.cos(angle), rightZ = Math.sin(angle);
    const lateral = (sim.player.x - start.x) * rightX + (sim.player.z - start.z) * rightZ;
    assert.ok(lateral * turn > 0.1, `heading=${angle}, gear=${forward}, steering=${turn}`);
    const noseRight = Math.sin(sim.player.angle) * rightX + Math.cos(sim.player.angle) * rightZ;
    assert.ok(noseRight * turn * forward > 0, 'reverse changes nose yaw while the rear follows the steering direction');
    assert.equal(Math.sign(car._steering), -turn, 'physical wheel yaw can drive the visual steering directly');
  }
});

test('brake overrides either accelerator and holds a stationary vehicle still', () => {
  for (const forward of [-1, 1]) {
    const sim = new Simulation(city());sim.interact();
    const initial = { ...sim.player };
    advance(sim, 2, { forward, brake: true });
    assert.equal(sim.player.speed, 0);
    assert.equal(sim.player.x, initial.x);assert.equal(sim.player.z, initial.z);
    const car = sim.cars.find(car => car.controlled);car.speed = forward * 15;
    advance(sim, 1, { forward, brake: true });
    assert.equal(sim.player.speed, 0, 'a held throttle cannot weaken braking or cause creep');
  }
});

test('opposing throttle stops before engaging the other direction', () => {
  for (const direction of [-1, 1]) for (const initialSpeed of [0.19, 10]) {
    const sim = new Simulation(city());sim.interact();
    const car = sim.cars.find(car => car.controlled);car.speed = direction * initialSpeed;
    let stopped = false, neutralSteps = 0;
    for (let step = 0; step < 120; step++) {
      sim.step({ forward: -direction }, 1 / 120);
      if (car.speed === 0) { stopped = true;neutralSteps++; }
      if (car.speed * direction < 0) {
        assert.ok(stopped, 'braking must reach an actual stop before reversing');
        break;
      }
    }
    assert.ok(neutralSteps >= 12, 'direction changes include a short predictable neutral hold');
    assert.ok(car.speed * direction < 0, 'holding the opposite throttle eventually changes direction');
  }
});

test('high-speed steering stays controlled and released steering recenters smoothly', () => {
  const high = new Simulation(city()), low = new Simulation(city());high.interact();low.interact();
  const highCar = high.cars.find(car => car.controlled), lowCar = low.cars.find(car => car.controlled);
  highCar.speed = 30;lowCar.speed = 4;
  high.step({ forward: 1, turn: 1 }, 1 / 120);
  assert.ok(highCar._steering < 0 && highCar._steering > -0.01, 'steering turns in progressively');
  advance(high, 1, { forward: 1, turn: 1 });advance(low, 1, { forward: 0.1, turn: 1 });
  assert.ok(Math.abs(high.player.angle) < 0.5, 'full steering at top speed cannot spin the car in one second');
  assert.ok(Math.abs(low.player.angle) > Math.abs(high.player.angle) * 2, 'slow parking turns retain a useful steering range');
  advance(high, 0.5, { forward: 1 });
  assert.ok(Math.abs(highCar._steering) < 0.0001);
  const settledAngle = high.player.angle;
  advance(high, 0.5, { forward: 1 });
  assert.ok(Math.abs(high.player.angle - settledAngle) < 0.001, 'released steering does not leave a persistent curve');
});

test('traffic lanes lie to each driver’s right on roads in every cardinal direction', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const dx = Math.sin(angle) * 150, dz = Math.cos(angle) * 150;
    const sim = new Simulation(city({ roads: [{ id: 'avenue', name: 'Avenue', points: [[-dx, -dz], [dx, dz]], width: 14 }] }));
    assert.equal(sim._graph.edges.length, 2);
    const points = [];
    for (const edge of sim._graph.edges) {
      const lane = sim._lanePoint(edge, 0.5);
      const rightOffset = lane.x * -Math.cos(edge.angle) + lane.z * Math.sin(edge.angle);
      assert.ok(rightOffset > 1, 'traffic occupies the right-hand side, including the reverse road direction');
      points.push(lane);
    }
    assert.ok(Math.hypot(points[0].x - points[1].x, points[0].z - points[1].z) > 3, 'opposing traffic has separated lanes');
  }
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
