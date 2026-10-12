import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../dist/simulation.js';

const STEP = 1 / 120;
const radians = degrees => degrees * Math.PI / 180;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function driving(speed = 15, overrides = {}) {
  const sim = new Simulation({
    bounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 },
    roads: [], buildings: [], spawn: { x: 0, z: 0, angle: 0 },
    missionPoints: [{ x: 100, z: 100, name: 'Destination' }], ...overrides,
  });
  assert.ok(sim.interact());
  const car = sim.cars.find(item => item.controlled);
  sim.cars = [car];
  Object.assign(car, { x: 0, z: 0, angle: 0, speed });
  // Let the documented signed-speed setter synchronize the dynamics before
  // tests deliberately inject independent lateral velocity.
  sim.step({}, STEP);
  return { sim, car };
}

function sample(sim, car, input) {
  const before = { x: car.x, z: car.z, angle: car.angle };
  sim.step(input, STEP);
  const vx = (car.x - before.x) / STEP, vz = (car.z - before.z) / STEP;
  const along = vx * Math.sin(car.angle) + vz * Math.cos(car.angle);
  const lateral = vx * Math.cos(car.angle) - vz * Math.sin(car.angle);
  return { x: car.x, z: car.z, vx, vz, lateral, along,
    speed: Math.hypot(vx, vz), yaw: angleDelta(before.angle, car.angle) / STEP,
    slip: Math.atan2(lateral, Math.abs(along)), angle: car.angle };
}

function run(sim, car, seconds, input) {
  return Array.from({ length: Math.round(seconds / STEP) }, () => sample(sim, car,
    typeof input === 'function' ? input(car) : input));
}

// A small test driver holds approximately the requested city speed. Tests
// constrain the path and transient response, not the engine's throttle curve.
const cruise = (car, speed = 15) => clamp(.3 + (speed - Math.abs(car.speed)) * .2, 0, 1);
const peak = (rows, field) => Math.max(...rows.map(row => Math.abs(row[field])));
const yawAcceleration = rows => Math.max(...rows.slice(1).map((row, i) => Math.abs(row.yaw - rows[i].yaw) / STEP));
const lateralAcceleration = rows => Math.max(...rows.slice(1).map((row, i) => Math.abs(
  ((row.vx - rows[i].vx) * Math.cos(row.angle) - (row.vz - rows[i].vz) * Math.sin(row.angle)) / STEP)));

test('city-speed 90-degree corners turn progressively and settle without a spin', () => {
  for (const speed of [10, 15]) for (const turn of [-1, 1]) {
    const { sim, car } = driving(speed);
    const rows = [];let turned = 0;
    for (let tick = 0; tick < 6 / STEP && Math.abs(turned) < radians(85); tick++) {
      const row = sample(sim, car, { forward: cruise(car, speed), turn });
      rows.push(row);turned += row.yaw * STEP;
    }
    assert.ok(Math.abs(turned) >= radians(85), `a useful corner is possible at ${speed}m/s`);
    assert.ok(turned * turn < 0);
    assert.ok(yawAcceleration(rows) <= 7, 'normal corner entry has bounded angular acceleration');
    assert.ok(lateralAcceleration(rows) < 14, 'sampled normal tire acceleration stays bounded through the corner');
    const released = run(sim, car, 1.5, current => ({ forward: cruise(current, speed) }));
    turned += released.reduce((sum, row) => sum + row.yaw * STEP, 0);
    assert.ok(Math.abs(turned) < radians(115), 'steering release does not continue into a spin');
    assert.ok(Math.abs(released.at(-1).yaw) < .08, 'the heading settles after release');
    assert.ok(Math.abs(released.at(-1).lateral) < .3, 'ordinary cornering does not leave persistent sideways drift');
    assert.equal(sim.health, 100);
  }
});

test('S-bend countersteering carries momentum through the reversal without snapping yaw', () => {
  const { sim, car } = driving();
  const approach = run(sim, car, 1, current => ({ forward: cruise(current), turn: 1 }));
  assert.ok(approach.at(-1).yaw < -.15, 'the first bend establishes measurable yaw');
  const reversal = run(sim, car, 1, current => ({ forward: cruise(current), turn: -1 }));
  const crossing = reversal.findIndex(row => row.yaw > 0);
  assert.ok(crossing >= 0, 'countersteering eventually turns into the second bend');
  const crossingTime = (crossing + 1) * STEP;
  assert.ok(crossingTime >= .09 && crossingTime <= .5, `controlled reversal takes time, got ${crossingTime}s`);
  assert.ok(yawAcceleration([approach.at(-1), ...reversal]) <= 7, 'yaw inertia avoids an abrupt steering-sign jump');
  const release = run(sim, car, 2, current => ({ forward: cruise(current) }));
  assert.ok(Math.abs(release.at(-1).yaw) < .08);
  assert.ok(Math.abs(release.at(-1).lateral) < .3);
});

test('handbrake opens a recoverable slide while service braking retains more grip', () => {
  function maneuver(handbrake) {
    const { sim, car } = driving(18);
    run(sim, car, .6, current => ({ forward: cruise(current, 18), turn: .65 }));
    const slide = run(sim, car, .55, { turn: .65, ...(handbrake ? { handbrake: true } : { brake: true }) });
    const settled = run(sim, car, 2, { forward: .35 });
    return { slide, settled, sim };
  }
  const service = maneuver(false), hand = maneuver(true);
  assert.ok(peak(hand.slide, 'slip') > peak(service.slide, 'slip') + radians(3), 'handbrake creates a distinct loss of lateral grip');
  assert.ok(peak(hand.slide, 'slip') < radians(75), 'a short handbrake pulse stays recoverable');
  for (const outcome of [service, hand]) {
    assert.ok(outcome.slide.at(-1).speed < outcome.slide[0].speed, 'unpowered braking reduces total movement');
    assert.ok(Math.abs(outcome.settled.at(-1).lateral) < .3);
    assert.ok(Math.abs(outcome.settled.at(-1).yaw) < .08);
    assert.equal(outcome.sim.health, 100);
  }
});

test('reverse turns remain symmetric and preserve backward travel under steering', () => {
  const paths = [-1, 1].map(turn => {
    const { sim, car } = driving(-6);
    const start = { x: car.x, z: car.z };
    const rows = run(sim, car, .7, { forward: -.2, turn: turn * .65 });
    assert.ok(rows.every(row => row.along < 0), 'reverse steering cannot silently select a forward gear');
    assert.ok(rows.at(-1).yaw * turn > 0, 'the nose yaws opposite a forward turn');
    return { x: car.x - start.x, z: car.z - start.z, angle: car.angle };
  });
  assert.ok(Math.abs(paths[0].x + paths[1].x) < .02);
  assert.ok(Math.abs(paths[0].z - paths[1].z) < .02);
  assert.ok(Math.abs(paths[0].angle + paths[1].angle) < .002);
  assert.ok(Math.abs(paths[0].x) > .1, 'reverse steering produces a useful maneuver');
});

test('corner, countersteer, handbrake and recovery are invariant across display frame rates', () => {
  const segments = [
    [1, { forward: .45, turn: .6 }], [1, { forward: .45, turn: -.6 }],
    [.5, { turn: -.6, handbrake: true }], [1.5, { forward: .4 }], [1, { brake: true }],
  ];
  function replay(schedule) {
    const { sim, car } = driving();let frame = 0;
    for (const [seconds, input] of segments) {
      let remaining = seconds;
      // Split a display frame at each input boundary so every replay receives
      // the same physical input timeline, including a jittered display clock.
      while (remaining > 1e-10) {
        const dt = Math.min(remaining, schedule[frame++ % schedule.length]);
        sim.step(input, dt);remaining -= dt;
      }
    }
    return { x: car.x, z: car.z, angle: car.angle, speed: car.speed,
      velocityX: car.velocityX, velocityZ: car.velocityZ, yawRate: car.yawRate };
  }
  const schedules = [30, 60, 120, 144].map(fps => [1 / fps]);
  schedules.push([1 / 40, 1 / 90, 1 / 144, 1 / 55]);
  const states = schedules.map(replay);
  for (const state of states.slice(1)) for (const key of Object.keys(state)) {
    const tolerance = key === 'angle' || key === 'yawRate' ? .003 : .03;
    assert.ok(Number.isFinite(state[key]) && Math.abs(state[key] - states[0][key]) < tolerance,
      `${key} differs with display frame rate`);
  }
});

test('lateral drift cannot tunnel through a thin wall during a long display frame', () => {
  const wall = { polygon: [[1.5, -100], [1.8, -100], [1.8, 100], [1.5, 100]] };
  const { sim, car } = driving(12, { buildings: [wall] });
  car.velocityX = 18;
  sim.step({ handbrake: true }, .25);
  assert.ok(car.x < .581, `the car remains on its original side of the wall, x=${car.x}`);
  assert.equal(sim._carContact(car.x, car.z, car.angle), null);
  assert.ok(car.velocityX <= .05, 'the wall removes inward lateral velocity');
  assert.ok(sim.health < 100, 'sideways impact energy counts even though the nose points along the wall');
  assert.ok(sim.heat > 0);
});

test('sideways drift stops at map and loading boundaries without a crash or stored launch velocity', () => {
  const bounds = { minX: -100, maxX: 1.5, minZ: -100, maxZ: 100 };
  for (const restriction of [
    { bounds }, { loadedBounds: bounds },
    { isReadyAt: (x, z, radius) => x + radius < 1.5 },
  ]) {
    const { sim, car } = driving(10, restriction);
    car.velocityX = 18;
    sim.step({ handbrake: true }, .25);
    assert.ok(car.x < .581);
    assert.equal(sim._carContact(car.x, car.z, car.angle), null);
    assert.ok(car.velocityX <= .05, 'blocked motion cannot retain a sideways launch');
    assert.equal(sim.health, 100);assert.equal(sim.heat, 0);
    sim.setActiveCity({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, loadedBounds: null, isReadyAt: null });
    const x = car.x;run(sim, car, .3, {});
    assert.ok(Math.abs(car.x - x) < .15, 'newly loaded space does not restore canceled velocity');
  }
});

test('loading rejection rolls back yaw as well as position to retain a fully loaded car footprint', () => {
  for (const restriction of [
    { loadedBounds: { minX: -100, maxX: 1.5, minZ: -100, maxZ: 100 } },
    { isReadyAt: (x, z, radius) => x + radius < 1.5 },
  ]) {
    const { sim, car } = driving(3, restriction);
    car.x = .579;car.yawRate = -.5;
    const before = { x: car.x, z: car.z, angle: car.angle };
    assert.equal(sim._carContact(car.x, car.z, car.angle), null);
    sim.step({ forward: .3, turn: 1 }, STEP);
    assert.equal(car.x, before.x);assert.equal(car.z, before.z);assert.equal(car.angle, before.angle);
    assert.equal(sim._carContact(car.x, car.z, car.angle), null, 'rotation cannot move an axle into missing geometry');
    assert.equal(Math.hypot(car.velocityX, car.velocityZ), 0);assert.equal(car.yawRate, 0);
    assert.equal(sim.health, 100);assert.equal(sim.heat, 0);
  }
});

test('sideways speed prevents exiting or completing a delivery despite zero forward speed', () => {
  const { sim, car } = driving(0);
  assert.ok(sim.startMission());
  sim.mission.target = { x: car.x, z: car.z, name: 'Test delivery' };
  car.velocityX = 8;
  assert.equal(sim.interact(), false, 'a sliding car is not safe to exit');
  sim.step({ handbrake: true }, STEP);
  assert.equal(sim.player.mode, 'drive');assert.equal(sim.mission.phase, 'active');
  assert.equal(sim.deliveries, 0);
  for (let frame = 0; frame < 360 && Math.hypot(car.velocityX, car.velocityZ) > .1; frame++) sim.step({ brake: true }, STEP);
  sim.mission.target = { x: car.x, z: car.z, name: 'Test delivery' };
  sim.step({ brake: true }, STEP);
  assert.equal(sim.deliveries, 1);
  assert.equal(sim.interact(), true, 'a stopped car remains safe to exit');
});

test('recovery clears old drift and yaw before the recovered cab is driven again', () => {
  const { sim, car } = driving();
  Object.assign(car, { velocityX: 8, yawRate: .7, slipAngle: .4,
    lateralAcceleration: 5, longitudinalAcceleration: -4 });
  sim.reset();
  const recovered = sim.cars.find(item => item.id === 'player-taxi');
  for (const field of ['speed', 'velocityX', 'velocityZ', 'yawRate', 'slipAngle', 'lateralAcceleration', 'longitudinalAcceleration']) {
    assert.equal(recovered[field], 0, `${field} cannot survive recovery`);
  }
  assert.ok(sim.interact());
  const start = { x: recovered.x, z: recovered.z, angle: recovered.angle };
  run(sim, recovered, .5, {});
  assert.equal(recovered.x, start.x);assert.equal(recovered.z, start.z);assert.equal(recovered.angle, start.angle);
});

test('entry and exit clear residual yaw and drift while unsafe sideways entry remains blocked', () => {
  const { sim, car } = driving(0);
  Object.assign(car, { velocityX: 1, yawRate: .4, slipAngle: .3 });
  assert.ok(sim.interact(), 'low total speed permits an exit');
  assert.equal(sim.player.mode, 'walk');
  assert.equal(Math.hypot(car.velocityX, car.velocityZ), 0);assert.equal(car.yawRate, 0);assert.equal(car.slipAngle, 0);
  car.velocityX = 8;
  assert.equal(sim.interact(), false, 'sideways speed also blocks entering a moving car');
  car.velocityX = 1;car.yawRate = .4;car.slipAngle = .3;
  assert.ok(sim.interact());
  assert.equal(Math.hypot(car.velocityX, car.velocityZ), 0);assert.equal(car.yawRate, 0);assert.equal(car.slipAngle, 0);
  const start = { x: car.x, z: car.z, angle: car.angle };
  run(sim, car, .5, {});
  assert.equal(car.x, start.x);assert.equal(car.z, start.z);assert.equal(car.angle, start.angle);
});

test('travel replaces a drifting vehicle with a stationary destination cab', () => {
  const { sim, car } = driving();
  Object.assign(car, { velocityX: 8, yawRate: .6, slipAngle: .3 });
  sim.travelTo({ x: 100, z: 100, angle: Math.PI / 2 });
  assert.equal(sim.player.mode, 'walk');assert.equal(sim.cars.includes(car), false);
  const arrived = sim.cars.find(item => item.id === 'player-taxi');
  for (const field of ['speed', 'velocityX', 'velocityZ', 'yawRate', 'slipAngle', 'lateralAcceleration', 'longitudinalAcceleration']) {
    assert.equal(arrived[field], 0, `${field} starts clean after travel`);
  }
  assert.ok(sim.interact());
  const start = { x: arrived.x, z: arrived.z, angle: arrived.angle };
  run(sim, arrived, .5, {});
  assert.equal(arrived.x, start.x);assert.equal(arrived.z, start.z);assert.equal(arrived.angle, start.angle);
});
