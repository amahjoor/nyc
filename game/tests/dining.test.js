import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { indexFootprints } from '../dist/places.js';
import { createDining, planDining, createDiningMesh, CAFE } from '../dist/dining.js';

const data = JSON.parse(readFileSync(new URL('../dist/dining.json', import.meta.url), 'utf8'));

test('the bundled licences are where outdoor dining is allowed, and nothing about who holds them', () => {
  assert.ok(data.dining.length > 1000 && data.dining.length < 20000, `${data.dining.length} licences`);
  for (const row of data.dining) assert.ok(row.length === 3 && Math.abs(row[0]) < 40000 && Math.abs(row[1]) < 40000 && (row[2] === 0 || row[2] === 1));
  assert.deepEqual([data.kinds, data.row], [['sidewalk', 'roadway'], ['x', 'z', 'kind']]);
  assert.match(data.source.url, /^https:\/\/data\.cityofnewyork\.us\/d\//);
  const dining = createDining(data), soho = dining.near(126, -80, 300);
  assert.ok(soho.length > 5 && soho.some(cafe => !cafe.roadway) && soho.every(cafe => Math.hypot(cafe.x - 126, cafe.z + 80) <= 300));
  assert.deepEqual(createDining(null).near(0, 0, 500), []);
});

test('a row of tables is set against the street wall nearest the licensed address', () => {
  // A building on the north side of a street that is everything south of z = 0, and one behind it on no street.
  const front = { polygon: [[0, -20], [14, -20], [14, 0], [0, 0]] }, back = { polygon: [[0, -40], [14, -40], [14, -20], [0, -20]] };
  const footprints = indexFootprints([front, back]), isStreet = (x, z) => z > 0;
  const [row, ...rest] = planDining([{ x: 6, z: -3, roadway: false }], footprints, isStreet);
  assert.deepEqual(rest, []);
  assert.deepEqual([row.x, row.z, Math.abs(row.tx), row.tz, row.nx, row.nz, row.tables], [6, 0, 1, 0, 0, 1, CAFE.most]);
  // Near the corner the row slides along to stay on its wall; a short wall takes fewer tables.
  const corner = planDining([{ x: 13.5, z: 2, roadway: false }], footprints, isStreet)[0];
  assert.ok(corner.x + corner.tables * CAFE.pitch / 2 <= 14 && corner.x > 6);
  const narrow = planDining([{ x: 3, z: 1, roadway: false }], indexFootprints([{ polygon: [[0, -10], [6, -10], [6, 0], [0, 0]] }]), isStreet)[0];
  assert.equal(narrow.tables, 2);
  // Roadway seating is not drawn, two licences on one wall share a row, and a licence far from any street wall has none.
  assert.deepEqual(planDining([{ x: 6, z: -3, roadway: true }], footprints, isStreet), []);
  assert.equal(planDining([{ x: 4, z: 1, roadway: false }, { x: 9, z: 1, roadway: false }], footprints, isStreet).length, 1);
  assert.deepEqual(planDining([{ x: 6, z: 60, roadway: false }], footprints, isStreet), []);
  assert.deepEqual(planDining([{ x: 6, z: -3, roadway: false }], footprints, () => false), []);
});

test('each table has a top, a leg and two chairs, all over the sidewalk, with a planter at each end', () => {
  const scene = new THREE.Scene(), cafes = createDiningMesh({ scene, heightAt: () => 5 });
  const row = { x: 6, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, tables: 3 };
  assert.equal(cafes.update([row]), 1);
  const mesh = scene.getObjectByName('Sidewalk cafes'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
  const parts = Array.from({ length: mesh.count }, (_, i) => { mesh.getMatrixAt(i, matrix); matrix.decompose(at, turn, size); return { x: at.x, y: at.y, z: at.z, h: size.y }; });
  assert.equal(parts.length, 3 * 10 + 4);
  assert.ok(parts.every(part => part.z > .2 && part.z < 2 && part.y - part.h / 2 >= 5 - 1e-5 && part.y + part.h / 2 < 6.1), 'on the sidewalk, standing on the ground, none taller than a planter');
  const tops = parts.filter(part => Math.abs(part.y - 5.74) < 1e-5);
  assert.deepEqual(tops.map(part => +part.x.toFixed(2)), [6 - CAFE.pitch, 6, 6 + CAFE.pitch].map(x => +x.toFixed(2)));
  const span = [Math.min(...parts.map(part => part.x)), Math.max(...parts.map(part => part.x))];
  assert.ok(span[1] - span[0] < 3 * CAFE.pitch + 1, 'the row is as long as its tables and no longer');
  const small = createDiningMesh({ capacity: 40 });
  assert.equal(small.update([row, row]), 1);
  assert.equal(cafes.update([]), 0); assert.equal(mesh.count, 0);
  cafes.dispose(); small.dispose(); assert.equal(scene.children.length, 0);
});
