import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { indexFootprints } from '../dist/places.js';
import { createCollection, planTrash, bagsOf, bagsOut, createTrashMesh, daysOf, DAYS, SET_OUT, COLLECTED } from '../dist/trash.js';

const file = readFileSync(new URL('../dist/collection.bin', import.meta.url)), collection = createCollection(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const MON = 1, THU = 8, SAT = 32;

test('collection days are read as bits, and bags stand from the evening before until the truck has been', () => {
  assert.deepEqual([daysOf('Mon, Thu'), daysOf('Tue, Thu, Sat'), daysOf('Wed, Sat'), daysOf(''), daysOf(undefined)], [MON | THU, 2 | 8 | 32, 4 | SAT, 0, 0]);
  assert.deepEqual(DAYS, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const monThu = MON | THU;
  // Sunday is day 6: out on Sunday night for Monday, still there early on Monday, gone by mid-morning.
  assert.deepEqual([bagsOut(monThu, 6, 19), bagsOut(monThu, 6, SET_OUT), bagsOut(monThu, 6, 23.5), bagsOut(monThu, 0, 3), bagsOut(monThu, 0, COLLECTED - .1), bagsOut(monThu, 0, COLLECTED), bagsOut(monThu, 0, 14)], [false, true, true, true, true, false, false]);
  assert.deepEqual([bagsOut(monThu, 0, 22), bagsOut(monThu, 2, 22), bagsOut(monThu, 3, 5), bagsOut(monThu, 4, 5)], [false, true, true, false], 'Monday night is not Tuesday\'s; Wednesday night is Thursday\'s');
  assert.equal(bagsOut(0, 2, 22), false);
});

test('the bundled grid has a collection for every block of the city, two or three days a week, never on a Sunday', () => {
  assert.ok(collection.cells > 150000);
  const soho = collection.daysAt(126, -80), count = bits => DAYS.filter((_, i) => bits >> i & 1).length;
  assert.ok(count(soho) === 2 || count(soho) === 3, `SoHo: ${DAYS.filter((_, i) => soho >> i & 1).join(', ')}`);
  for (const [x, z] of [[2300, 5750], [24500, -1200], [4353, -9634], [-9000, 14000]]) { const days = collection.daysAt(x, z); assert.ok(count(days) >= 2 && count(days) <= 3 && !(days & 64), `${x}, ${z}: ${days}`); }
  assert.equal(collection.daysAt(-90000, 0), 0); assert.equal(createCollection(null).daysAt(0, 0), 0); assert.equal(createCollection(new ArrayBuffer(8)).cells, 0);
});

test('each building people live in puts a heap at the kerb before it: more bags for more homes', () => {
  // Three buildings on the north side of a street that is everything south of z = 0, the kerb four metres out.
  const house = { polygon: [[0, -12], [6, -12], [6, 0], [0, 0]] }, walkup = { polygon: [[6, -20], [14, -20], [14, 0], [6, 0]] }, tower = { polygon: [[14, -30], [50, -30], [50, 0], [14, 0]] }, office = { polygon: [[50, -30], [70, -30], [70, 0], [50, 0]] };
  const footprints = indexFootprints([house, walkup, tower, office]), isStreet = (x, z) => z > 0, kerb = (x, z) => Math.abs(z - 4) < 12 ? { x, z: 4, nx: 0, nz: 1, tx: 1, tz: 0 } : null;
  const useAt = x => x < 6 ? 1 : x < 14 ? 2 : x < 50 ? 3 : 6, options = { kerb, useAt, daysAt: () => MON | THU };
  const heaps = planTrash([house, walkup, tower, office], footprints, isStreet, options).sort((a, b) => a.x - b.x);
  assert.equal(heaps.length, 3, 'the office has a private carter');
  assert.ok(heaps[0].bags >= 2 && heaps[0].bags <= 3 && heaps[1].bags >= 3 && heaps[1].bags <= 6 && heaps[2].bags > heaps[1].bags && heaps[2].bags <= 14, heaps.map(heap => heap.bags).join(', '));
  assert.ok(heaps.every(heap => heap.z === 3.5 && heap.days === (MON | THU) && heap.tx === 1), 'on the sidewalk side of the kerb');
  assert.ok(heaps[0].x > 0 && heaps[0].x < 6 && heaps[1].x > 6 && heaps[1].x < 14 && heaps[2].x > 14 && heaps[2].x < 50, 'each before its own building');
  assert.deepEqual(planTrash([house, walkup, tower], footprints, isStreet, options).sort((a, b) => a.x - b.x), heaps, 'the same every week');
  assert.deepEqual(planTrash([house], footprints, isStreet, { ...options, daysAt: () => 0 }), []); assert.deepEqual(planTrash([house], footprints, isStreet, { ...options, kerb: () => null }), []); assert.deepEqual(planTrash([house], footprints, () => false, options), []);
  // A heap's bags lie along the kerb within a couple of metres of it, the big heaps piled.
  const bags = bagsOf(heaps[2]);
  assert.equal(bags.length, heaps[2].bags);
  assert.ok(bags.every(bag => Math.abs(bag.x - heaps[2].x) < 3.2 && Math.abs(bag.z - 3.5) < .6 && bag.size > .2 && bag.size < .4) && bags.some(bag => bag.y > 0));
  assert.ok(bagsOf(heaps[0]).every(bag => bag.y === 0), 'two or three bags sit on the ground');
});

test('bags are drawn only while they are out', () => {
  const scene = new THREE.Scene(), trash = createTrashMesh({ scene, heightAt: () => 2 });
  trash.setHeaps([{ x: 0, z: 0, tx: 1, tz: 0, bags: 5, days: MON | THU }, { x: 20, z: 0, tx: 1, tz: 0, bags: 9, days: 2 | 16 }]);
  const mesh = scene.getObjectByName('Refuse bags');
  assert.deepEqual([trash.show(6, 14), mesh.visible], [0, false], 'Sunday afternoon: nothing out');
  assert.deepEqual([trash.show(6, 21), mesh.visible], [5, true], 'Sunday night: Monday\'s bags');
  assert.deepEqual([trash.show(0, 6), trash.show(0, 9), trash.show(0, 21)], [5, 0, 9], 'collected on Monday morning; Tuesday\'s out on Monday night');
  const matrix = new THREE.Matrix4(), at = new THREE.Vector3(); mesh.getMatrixAt(0, matrix); at.setFromMatrixPosition(matrix);
  assert.ok(at.y >= 2 && Math.abs(at.x - 20) < 3);
  mesh.geometry.computeBoundingBox(); assert.ok(mesh.geometry.boundingBox.min.y > -.05, 'a bag sits on the ground');
  trash.setHeaps([]); assert.equal(trash.show(0, 21), 0);
  trash.dispose(); assert.equal(scene.children.length, 0);
});
