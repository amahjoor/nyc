import test from 'node:test';
import assert from 'node:assert/strict';
import { aloftness, streamRanges, leadPoint, aboveTheStreet } from '../dist/aloft.js';

test('the street is left behind between sixty and three hundred metres up', () => {
  assert.deepEqual([0, 30, 60, 180, 300, 1100, NaN, undefined].map(aloftness), [0, 0, 0, .5, 1, 1, 0, 0]);
  // Above the street at 250 m; not below it again until 190 m.
  assert.deepEqual([aboveTheStreet(100), aboveTheStreet(249), aboveTheStreet(251), aboveTheStreet(220, true), aboveTheStreet(189, true), aboveTheStreet(NaN, true)], [false, false, true, true, false, false]);
});

test('from the ground the city is drawn as it was; from the air all of it is, and nothing is solid above the roofs', () => {
  assert.deepEqual(streamRanges(0), { cut: 2100, refine: 850, physics: 850 });
  assert.deepEqual(streamRanges(40), streamRanges(0), 'a rooftop or a chase camera changes nothing');
  const cruise = streamRanges(500), jet = streamRanges(1100);
  assert.ok(cruise.cut > 45000 && jet.cut === cruise.cut, 'no part of the five boroughs is beyond it');
  assert.ok(streamRanges(180).cut > 2100 && streamRanges(180).cut < cruise.cut, 'and it opens out as the view climbs');
  assert.deepEqual([streamRanges(120).physics, streamRanges(200).physics, streamRanges(640).physics, streamRanges(700).physics], [850, 350, 350, 0]);
  assert.deepEqual([0, 100, 300, 500, 750, 1000, 1100].map(height => streamRanges(height).refine), [850, 850, 850, 850, 425, 0, 0], 'full detail thins out above five hundred metres and is not asked for from a kilometre up');
});

test('what is built is built ahead of a fast aircraft, and where a walker stands', () => {
  assert.deepEqual(leadPoint({ x: 10, z: 20 }, { x: 4, z: 0 }), { x: 10, z: 20 });
  assert.deepEqual(leadPoint({ x: 10, z: 20 }, { x: 0, z: 0 }), { x: 10, z: 20 });
  const prop = leadPoint({ x: 0, z: 0 }, { x: 70, z: 0 }), jet = leadPoint({ x: 0, z: 0 }, { x: 0, z: -135 });
  assert.deepEqual([prop.x, prop.z], [245, 0], 'three and a half seconds on');
  assert.ok(Math.abs(jet.z + 472.5) < 1e-9 && jet.x === 0);
  assert.equal(leadPoint({ x: 0, z: 0 }, { x: 300, z: 0 }).x, 700, 'never further than seven hundred metres');
});
