import test from 'node:test';
import assert from 'node:assert/strict';
import { planJunction, phaseAt, vehicleAspect, crossingAspect, stopDistance, junctionArms, YELLOW, ALL_RED, LEAD, PROGRESSION, WALK_SPEED, CROSSWALK } from '../dist/signal-plan.js';

const N = Math.PI, E = Math.PI / 2, S = 0, W = -Math.PI / 2;
const arm = (angle, width, flow = 'both') => ({ angle, width, inbound: flow !== 'out', outbound: flow !== 'in' });
// A one-way avenue running north (heading pi), crossed by a two-way street.
const avenue = (extra = {}) => planJunction({ x: 0, z: 0, arms: [arm(N, 18, 'out'), arm(S, 18, 'in'), arm(E, 9), arm(W, 9)], ...extra });

test('street widths decide between a signal, a stop sign and nothing', () => {
  const plan = avenue();
  assert.equal(plan.control, 'signal');
  assert.deepEqual(plan.groups, [0, 0, 1, 1]); assert.deepEqual(plan.widths, [18, 9]);
  assert.ok(Math.abs(plan.axis - 0) < 1e-9 || Math.abs(plan.axis - Math.PI) < 1e-9, 'the avenue is the main axis');
  // Two side streets of the same width: everyone stops.
  assert.equal(planJunction({ arms: [arm(N, 9), arm(S, 9), arm(E, 9), arm(W, 9)] }).control, 'allway');
  // A lane meeting a wider street: the lane stops.
  const lesser = planJunction({ arms: [arm(N, 10), arm(S, 10), arm(E, 6)] });
  assert.equal(lesser.control, 'stop'); assert.deepEqual(lesser.groups, [0, 0, 1]);
  assert.equal(vehicleAspect(lesser, 1, 0).aspect, 'stop'); assert.equal(vehicleAspect(lesser, 0, 0).aspect, 'green');
  // In the Manhattan core the same corner has a signal, as almost all do there.
  assert.equal(planJunction({ arms: [arm(N, 9), arm(S, 9), arm(E, 9), arm(W, 9)], core: true }).control, 'signal');
  // The city's own list of signals overrides the guess from widths.
  assert.equal(planJunction({ arms: [arm(N, 9), arm(S, 9), arm(E, 9), arm(W, 9)], hints: { lpi: true } }).control, 'signal');
  // A bend, a dead end, and a street that only leaves need no control.
  assert.equal(planJunction({ arms: [arm(N, 18), arm(S, 18)] }), null);
  assert.equal(planJunction({ arms: [arm(N, 10), arm(S, 10), arm(E, 6, 'out')] }), null);
  assert.equal(planJunction({ arms: [arm(N, 18), arm(N + .2, 18), arm(S, 18)] }), null, 'three arms on one axis cross nothing');
  assert.equal(planJunction(), null);
});

test('a cycle is whole, repeats, and never shows two streets green at once', () => {
  for (const plan of [avenue(), avenue({ hints: { lpi: true } }), avenue({ hints: { exclusive: true } }), planJunction({ arms: [arm(N, 26), arm(S, 26), arm(E, 12), arm(W, 12)] })]) {
    const total = plan.lead[0] + plan.green[0] + plan.lead[1] + plan.green[1] + 2 * (YELLOW + ALL_RED) + plan.exclusive;
    assert.equal(total, plan.cycle);
    assert.ok(plan.green[0] >= plan.green[1] && plan.green[1] >= 12, `the lesser street still gets ${plan.green[1]} s`);
    let greens = [0, 0], previous = null;
    for (let t = 0; t < plan.cycle; t += .25) {
      const main = vehicleAspect(plan, 0, t), cross = vehicleAspect(plan, 1, t);
      assert.ok(main.aspect === 'red' || cross.aspect === 'red', `conflict at ${t}`);
      if (main.aspect === 'green') greens[0] += .25; if (cross.aspect === 'green') greens[1] += .25;
      // Green is always followed by yellow, and yellow by red.
      if (previous === 'green') assert.ok(['green', 'yellow'].includes(main.aspect));
      if (previous === 'yellow') assert.ok(['yellow', 'red'].includes(main.aspect));
      previous = main.aspect;
      assert.deepEqual(vehicleAspect(plan, 0, t + plan.cycle * 3).aspect, main.aspect, 'the cycle repeats');
    }
    assert.ok(Math.abs(greens[0] - plan.green[0]) < .51 && Math.abs(greens[1] - plan.green[1]) < .51);
  }
  assert.equal(avenue().cycle, 90); assert.equal(planJunction({ arms: [arm(N, 26), arm(S, 26), arm(E, 12), arm(W, 12)] }).cycle, 120);
  assert.equal(planJunction({ arms: [arm(N, 9), arm(S, 9), arm(E, 9), arm(W, 9)], hints: { lpi: true } }).cycle, 60);
  assert.equal(YELLOW, 3); assert.equal(ALL_RED, 2);
});

test('a red light says how long until green, and that is when green comes', () => {
  const plan = avenue({ x: 300, z: -700 });
  for (const group of [0, 1]) for (let t = 0; t < plan.cycle; t += 1.7) {
    const now = vehicleAspect(plan, group, t);
    if (now.aspect !== 'red') continue;
    assert.equal(vehicleAspect(plan, group, t + now.remaining + .01).aspect, 'green');
    assert.equal(vehicleAspect(plan, group, t + now.remaining - .01).aspect, 'red');
  }
});

test('signals along a one-way avenue turn green in a wave at the speed limit', () => {
  // Three corners 80 m apart going north (z decreasing), as on a Manhattan avenue.
  const corners = [0, -80, -160].map(z => avenue({ x: 0, z }));
  const greenStart = plan => plan.offset + plan.lead[0];
  for (let i = 1; i < corners.length; i++) {
    const lag = ((greenStart(corners[i]) - greenStart(corners[i - 1])) % 90 + 90) % 90;
    assert.ok(Math.abs(lag - 80 / PROGRESSION) < 1e-6, `the next corner turns ${lag.toFixed(2)} s later`);
  }
  assert.ok(Math.abs(PROGRESSION - 11.176) < .001, '25 mph');
  // A driver leaving the first corner as it turns green, at that speed, meets green at each.
  const start = greenStart(corners[0]) + .5;
  corners.forEach((plan, i) => assert.equal(vehicleAspect(plan, 0, start + i * 80 / PROGRESSION).aspect, 'green'));
  // The wave follows the traffic: reverse the avenue and the order reverses.
  const south = [0, -80].map(z => planJunction({ x: 0, z, arms: [arm(N, 18, 'in'), arm(S, 18, 'out'), arm(E, 9), arm(W, 9)] }));
  const lag = ((greenStart(south[0]) - greenStart(south[1])) % 90 + 90) % 90;
  assert.ok(Math.abs(lag - 80 / PROGRESSION) < 1e-6);
});

test('people walk beside the traffic that has green, then get a flashing hand long enough to cross', () => {
  const plan = avenue();
  assert.deepEqual(plan.lead, [0, 0]);
  // Crossing the side street (group 1) happens while the avenue (group 0) runs.
  for (let t = 0; t < plan.cycle; t += .5) {
    const walk = crossingAspect(plan, 1, t), beside = vehicleAspect(plan, 0, t), against = vehicleAspect(plan, 1, t);
    if (walk.aspect !== 'dont') { assert.equal(beside.aspect, 'green'); assert.equal(against.aspect, 'red', 'nobody is sent across moving traffic'); }
  }
  const flashing = [], walking = [];
  for (let t = 0; t < plan.cycle; t += .1) { const a = crossingAspect(plan, 0, t).aspect; if (a === 'flash') flashing.push(t); if (a === 'walk') walking.push(t); }
  // Crossing the 18 m avenue at 3.5 ft/s takes 17 s; the hand flashes that long.
  assert.ok(Math.abs(flashing.length * .1 - 18 / WALK_SPEED) < .3, `${(flashing.length * .1).toFixed(1)} s of flashing hand`);
  assert.ok(walking.length * .1 >= 4, 'and at least four seconds of walk before it');
  assert.ok(Math.abs(WALK_SPEED - 1.0668) < 1e-4);
  // No pedestrian signal at stop signs.
  assert.equal(crossingAspect(planJunction({ arms: [arm(N, 9), arm(S, 9), arm(E, 9), arm(W, 9)] }), 0, 0).aspect, null);
  assert.equal(crossingAspect(null, 0, 0).aspect, null);
});

test('a head start shows walk before the traffic beside it moves', () => {
  const plan = avenue({ hints: { lpi: true } });
  assert.deepEqual(plan.lead, [LEAD, LEAD]); assert.equal(LEAD, 7);
  const first = phaseAt(plan, plan.offset + 1);
  assert.equal(first.name, 'lead0');
  assert.equal(crossingAspect(plan, 1, plan.offset + 1).aspect, 'walk');
  assert.equal(vehicleAspect(plan, 0, plan.offset + 1).aspect, 'red', 'the avenue waits out the head start');
  assert.equal(vehicleAspect(plan, 0, plan.offset + LEAD + .1).aspect, 'green');
  assert.ok(Math.abs(vehicleAspect(plan, 0, plan.offset + 1).remaining - (LEAD - 1)) < 1e-9);
});

test('where the city lists an all-walk phase, every car stops and people cross any way', () => {
  const plan = avenue({ hints: { exclusive: true, lpi: true } });
  assert.ok(plan.exclusive >= 18 && plan.exclusive <= 34); assert.deepEqual(plan.lead, [0, 0]);
  let walk = 0;
  for (let t = 0; t < plan.cycle; t += .25) {
    const a = crossingAspect(plan, 0, t), b = crossingAspect(plan, 1, t);
    assert.equal(a.aspect, b.aspect, 'both crossings show the same');
    if (a.aspect !== 'dont') { walk += .25; assert.equal(vehicleAspect(plan, 0, t).aspect, 'red'); assert.equal(vehicleAspect(plan, 1, t).aspect, 'red'); }
  }
  assert.ok(Math.abs(walk - plan.exclusive) < .26);
});

test('stop lines stand back from the crossing street by its half width and a crosswalk', () => {
  const plan = avenue();
  assert.equal(stopDistance(plan, 0), 9 / 2 + CROSSWALK); assert.equal(stopDistance(plan, 1), 18 / 2 + CROSSWALK);
});

test('graph edges become arms; bridges overhead and highways are not part of the junction', () => {
  const node = { id: 1 }, far = { id: 2 };
  const street = (name, width, extra = {}) => ({ name, width, kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13, ...extra });
  const edges = [
    { from: node, to: far, angle: N, road: street('7 AVE', 18, { oneway: 'yes' }) },
    { from: far, to: node, angle: N, road: street('7 AVE', 18, { oneway: 'yes' }) },          // arrives from the south
    { from: node, to: far, angle: E, road: street('W 42 ST', 12) }, { from: far, to: node, angle: W, road: street('W 42 ST', 12) },
    { from: node, to: far, angle: W, road: street('W 42 ST', 12) }, { from: far, to: node, angle: E, road: street('W 42 ST', 12) },
    { from: node, to: far, angle: .7, road: street('RAMP', 8, { kind: 'bridge', fromLevel: 15, toLevel: 15 }) },
    { from: node, to: far, angle: 2.2, road: street('FDR DR', 20, { roadwayType: 2 }) },
    { from: far, to: far, angle: 0, road: street('ELSEWHERE', 9) },
  ];
  const arms = junctionArms(node, edges);
  assert.equal(arms.length, 4);
  const by = heading => arms.find(a => Math.abs(Math.atan2(Math.sin(a.angle - heading), Math.cos(a.angle - heading))) < .01);
  assert.deepEqual([by(N).inbound, by(N).outbound, by(S).inbound, by(S).outbound], [false, true, true, false], 'a one-way avenue arrives by one arm and leaves by the other');
  assert.ok(by(E).inbound && by(E).outbound && by(W).inbound && by(W).outbound);
  assert.equal(by(N).width, 18); assert.equal(by(E).name, 'W 42 ST');
  const plan = planJunction({ x: 10, z: 20, arms });
  assert.equal(plan.control, 'signal'); assert.deepEqual(plan.widths, [18, 12]);
});

test('a carriageway of a boulevard is timed as the boulevard, not as the lane it looks like', () => {
  // One 10 m carriageway of a four-carriageway boulevard, crossed by an 11 m street.
  const arms = [arm(N, 10, 'out'), arm(S, 10, 'in'), arm(E, 11), arm(W, 11)];
  const alone = planJunction({ arms });
  assert.equal(alone.control, 'allway', 'on its own it would be two lesser streets meeting');
  const part = planJunction({ arms, boulevard: { angle: N, breadth: 40 } });
  assert.equal(part.control, 'signal'); assert.equal(part.cycle, 120);
  assert.deepEqual(part.groups, [0, 0, 1, 1], 'the boulevard is the main street although the cross street is wider here');
  assert.deepEqual(part.widths, [10, 11], 'and stop lines still stand where this carriageway\'s kerbs are');
});
