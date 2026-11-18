import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwitchShot, levelsFor, LEVELS } from '../dist/switch-shot.js';

const height = pose => pose.position[1] - pose.target[1];
const run = (shot, seconds, each = () => {}) => { let pose = null; for (let t = 0; t < seconds && shot.active; t += 1 / 60) { pose = shot.update(1 / 60); if (pose) each(pose, t); } return pose; };
const chase = { position: [88, 16, -112], target: [100, 11, -100], up: [0, 1, 0], fov: 55 };

test('leaving a street climbs three steps straight up, waits, crosses and comes down behind the player', () => {
  const shot = createSwitchShot(), from = { x: 100, y: 10, z: -100, angle: .4 }, to = { x: 6100, y: 25, z: 3900, angle: 2 };
  assert.equal(shot.active, false); assert.equal(shot.update(.016), null);
  shot.depart(from, chase);
  assert.equal(shot.active, true); assert.equal(shot.stage, 'rise');
  // The climb: never downward, and it pauses near each level.
  const heights = [], levels = new Set(); let previous = 0;
  run(shot, 2.6, pose => {
    const h = height(pose); assert.ok(h >= previous - 1e-6, 'the climb never dips'); previous = h; heights.push(h); levels.add(shot.level);
    for (const value of [...pose.position, ...pose.target, ...pose.up, pose.fov, pose.near, pose.far]) assert.ok(Number.isFinite(value));
    assert.ok(pose.far > h * 2 && pose.near < h && pose.near >= .3);
  });
  assert.deepEqual([...levels], [1, 2, 3]); assert.equal(shot.stage, 'hold');
  for (const level of LEVELS) assert.ok(heights.filter(h => h >= level && h <= level * 1.06).length >= 20, `it hangs at ${level} m`);
  // Over the place it left, straight down, with the player's heading up the picture.
  let pose = shot.update(1 / 60);
  assert.ok(Math.abs(pose.position[0] - from.x) < 1e-6 && Math.abs(pose.position[2] - from.z) < 1e-6 && pose.target[1] === from.y);
  assert.ok(Math.abs(pose.up[0] - Math.sin(.4)) < 1e-6 && Math.abs(pose.up[2] - Math.cos(.4)) < 1e-6 && pose.up[1] === 0);
  // It waits as long as the place takes to load, barely moving.
  const before = height(pose); run(shot, 3); assert.equal(shot.stage, 'hold'); assert.ok(height(shot.update(0)) < before * 1.05);
  shot.arrive(to);
  const path = []; run(shot, 1.2, p => path.push(p)); // the crossing
  assert.ok(path.every(p => height(p) > LEVELS[2] * .98), 'it crosses at the top of the climb');
  const landed = []; pose = run(shot, 8, p => landed.push(p));
  assert.equal(shot.active, false); assert.equal(pose, null);
  for (let i = 1; i < landed.length; i++) assert.ok(height(landed[i]) <= height(landed[i - 1]) + 1e-6, 'the descent never climbs');
  const final = landed.at(-1);
  // It ends where the game's camera starts: behind the player, looking at them, the right way up.
  assert.ok(Math.hypot(final.target[0] - to.x, final.target[2] - to.z) < .5 && Math.abs(final.target[1] - to.y - 1.3) < .1);
  assert.ok(Math.abs(final.position[0] - (to.x - Math.sin(2) * 11)) < .5 && Math.abs(final.position[2] - (to.z - Math.cos(2) * 11)) < .5 && height(final) < 8);
  assert.ok(final.up[1] > .99 && Math.abs(final.fov - 55) < .5);
});

test('a short hop climbs only as far as it needs, and a first spawn only comes down', () => {
  assert.deepEqual([50, 299, 300, 2499, 2500, 40000].map(levelsFor), [1, 1, 2, 2, 3, 3]);
  const from = { x: 0, y: 0, z: 0, angle: 0 };
  for (const [distance, most] of [[120, LEVELS[0]], [1500, LEVELS[1]], [9000, LEVELS[2]]]) {
    const shot = createSwitchShot(); let peak = 0, seconds = 0;
    shot.depart(from, chase); shot.arrive({ x: distance, y: 0, z: 0, angle: 1 });
    run(shot, 20, (pose, t) => { peak = Math.max(peak, height(pose)); seconds = t; });
    assert.equal(shot.active, false); assert.ok(peak >= most && peak <= most * 1.12, `${distance} m away peaks at ${peak.toFixed(0)} m`);
    assert.ok(seconds > 1.5 && seconds < 7.5, `${distance} m takes ${seconds.toFixed(1)} s`);
  }
  // From the map of the whole city: it holds that picture until the place is ready, then swings over it and descends.
  const shot = createSwitchShot(), overview = { position: [3000, 30000, 26000], target: [2000, 0, 1000], up: [0, 1, 0], fov: 52, near: 10, far: 150000 };
  shot.depart(null, overview);
  assert.equal(shot.stage, 'hold');
  assert.deepEqual(shot.update(1).position, overview.position); assert.deepEqual(shot.update(5).position, overview.position);
  assert.deepEqual([shot.update(0).near, shot.update(0).far], [10, 150000], 'the picture it holds keeps the depth it was drawn with');
  const to = { x: 700, y: 12, z: -400, angle: -1 }; shot.arrive(to);
  const seen = []; run(shot, 12, pose => seen.push(pose));
  assert.equal(shot.active, false);
  assert.ok(Math.hypot(seen[0].position[0] - overview.position[0], seen[0].position[1] - overview.position[1]) < 400, 'it starts from the picture already on screen');
  assert.ok(seen.some(pose => Math.abs(height(pose) - LEVELS[2]) < LEVELS[2] * .06 && Math.hypot(pose.position[0] - to.x, pose.position[2] - to.z) < 1));
  assert.ok(seen.some(pose => Math.abs(height(pose) - LEVELS[1]) < LEVELS[1] * .06) && seen.some(pose => Math.abs(height(pose) - LEVELS[0]) < LEVELS[0] * .06));
  assert.ok(height(seen.at(-1)) < 8);
});

test('it waits over a place that is still loading, but not for ever', () => {
  const shot = createSwitchShot(); let waited = 0;
  shot.depart({ x: 0, y: 0, z: 0, angle: 0 }, chase); shot.arrive({ x: 5000, y: 0, z: 0, angle: 0 });
  for (let t = 0; t < 20 && shot.active; t += 1 / 60) { const pose = shot.update(1 / 60, t > 6); if (shot.stage === 'cross') { waited += 1 / 60; assert.ok(height(pose) > LEVELS[2] * .98); } }
  assert.ok(waited > 2.5 && waited < 4, `held ${waited.toFixed(1)} s over the place until it settled`);
  shot.depart({ x: 0, y: 0, z: 0, angle: 0 }, chase); shot.arrive({ x: 5000, y: 0, z: 0, angle: 0 }); waited = 0;
  for (let t = 0; t < 30 && shot.active; t += 1 / 60) { shot.update(1 / 60, false); if (shot.stage === 'cross') waited += 1 / 60; }
  assert.equal(shot.active, false); assert.ok(waited > 4 && waited < 5.2, 'a place that never settles is still arrived at');
});

test('a place that never loads, or an arrival nobody asked for, leaves the game its camera', () => {
  const shot = createSwitchShot();
  shot.arrive({ x: 1, z: 1 }); assert.equal(shot.active, false);
  shot.depart({ x: 0, y: 0, z: 0, angle: 0 }, chase); run(shot, 1);
  shot.cancel(); assert.equal(shot.active, false); assert.equal(shot.update(.1), null);
  // Arriving before the climb is done: it finishes the step it is on, then goes.
  shot.depart({ x: 0, y: 0, z: 0, angle: 0 }, chase); run(shot, .3); shot.arrive({ x: 200, y: 0, z: 0, angle: 0 });
  let peak = 0; run(shot, 10, pose => { peak = Math.max(peak, height(pose)); });
  assert.equal(shot.active, false); assert.ok(peak < LEVELS[0] * 1.12);
});
