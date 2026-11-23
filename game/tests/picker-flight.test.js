import test from 'node:test';
import assert from 'node:assert/strict';
import { createPickerFlight, flightPath, SECONDS } from '../dist/picker-flight.js';

const fly = (from, to) => { const flight = createPickerFlight(), views = []; flight.start(from, to); for (let i = 0; i < 600 && flight.active; i++) views.push(flight.update(1 / 60)); return { flight, views }; };

test('a flight to another borough pulls back to see both places, and arrives exactly', () => {
  const from = { x: 100, z: -100, width: 9000 }, to = { x: -6300, z: 8900, width: 9000 }, distance = Math.hypot(to.x - from.x, to.z - from.z);
  const { flight, views } = fly(from, to);
  assert.equal(flight.active, false); assert.equal(flight.update(1 / 60), null);
  assert.deepEqual(views.at(-1), to);
  // It rises on the way, far enough to take in most of the journey, and comes back down.
  const widest = Math.max(...views.map(view => view.width)), peak = views.findIndex(view => view.width === widest);
  assert.ok(widest > distance * .8 && widest < distance * 4, `it widens to ${widest.toFixed(0)} m for ${distance.toFixed(0)} m`);
  assert.ok(peak > views.length * .25 && peak < views.length * .75, 'the widest view is in the middle');
  for (let i = 1; i < views.length; i++) {
    const a = views[i - 1], b = views[i];
    for (const value of [b.x, b.z, b.width]) assert.ok(Number.isFinite(value));
    // Never a cut: no frame moves the ground by more than a fraction of what is on screen, or changes the width sharply.
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < Math.max(a.width, b.width) * .09, `frame ${i} slides too far`);
    assert.ok(Math.abs(Math.log(b.width / a.width)) < .08, `frame ${i} zooms too hard`);
    // Always toward the place, along the straight line to it.
    assert.ok(Math.hypot(to.x - b.x, to.z - b.z) <= Math.hypot(to.x - a.x, to.z - a.z) + 1e-6);
    if (i <= peak) assert.ok(b.width >= a.width - 1e-6); else assert.ok(b.width <= a.width + 1e-6);
  }
  // It starts and stops gently.
  assert.ok(Math.hypot(views[1].x - views[0].x, views[1].z - views[0].z) < 5 && Math.hypot(views.at(-1).x - views.at(-2).x, views.at(-1).z - views.at(-2).z) < 5);
});

test('a near place is a short slide, the first choice is a zoom in, and every flight lasts a sensible time', () => {
  // Two places on screen together: no need to pull back.
  const near = fly({ x: 0, z: 0, width: 9000 }, { x: 900, z: -400, width: 9000 });
  assert.ok(Math.max(...near.views.map(view => view.width)) < 9000 * 1.05);
  assert.ok(near.views.length / 60 <= 1);
  // From the map of the whole city down to one neighbourhood: the width only falls.
  const first = fly({ x: 6000, z: 7000, width: 50000 }, { x: 100, z: -100, width: 9000 });
  for (let i = 1; i < first.views.length; i++) assert.ok(first.views[i].width <= first.views[i - 1].width + 1e-6);
  assert.deepEqual(first.views.at(-1), { x: 100, z: -100, width: 9000 });
  // The same place, a different width: it stays where it is.
  const zoom = fly({ x: 5, z: 5, width: 40000 }, { x: 5, z: 5, width: 9000 });
  assert.ok(zoom.views.every(view => view.x === 5 && view.z === 5)); assert.equal(zoom.views.at(-1).width, 9000);
  for (const [from, to] of [[{ x: 0, z: 0, width: 9000 }, { x: 1, z: 0, width: 9000 }], [{ x: 0, z: 0, width: 9000 }, { x: 40000, z: 30000, width: 9000 }], [{ x: 0, z: 0, width: 50000 }, { x: 0, z: 0, width: 50000 }]]) {
    const { seconds } = flightPath(from, to);
    assert.ok(seconds >= SECONDS[0] && seconds <= SECONDS[1]);
  }
  // A longer way takes longer.
  assert.ok(flightPath({ x: 0, z: 0, width: 9000 }, { x: 20000, z: 0, width: 9000 }).seconds > flightPath({ x: 0, z: 0, width: 9000 }, { x: 3000, z: 0, width: 9000 }).seconds);
});

test('a flight can be dropped part way, and a new one starts from wherever the view is', () => {
  const flight = createPickerFlight();
  assert.equal(flight.active, false); assert.equal(flight.update(.016), null);
  flight.start({ x: 0, z: 0, width: 9000 }, { x: 12000, z: 0, width: 9000 });
  let view = null; for (let i = 0; i < 30; i++) view = flight.update(1 / 60);
  assert.ok(flight.active && view.x > 0 && view.x < 12000);
  flight.cancel(); assert.equal(flight.active, false); assert.equal(flight.update(1 / 60), null);
  flight.start(view, { x: 0, z: 0, width: 9000 });
  const next = flight.update(1 / 60);
  assert.ok(Math.abs(next.x - view.x) < 20 && Math.abs(next.width - view.width) < view.width * .02, 'no jump at the turn');
});
