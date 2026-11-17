import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { indexPoints, indexKerbs, snapToKerb, createStreetProps, SETBACK } from '../dist/street-props.js';

// A kerb along z = -5 from x = 0 to 100 with the roadway to its south (+Z), and one along x = 0 running north with the road to the west.
const run = (id, points, normal) => ({ id, points, normals: points.slice(1).map(() => normal), length: 0, depth: 3 });
const walks = () => [run('street', [[0, -5], [50, -5], [100, -5]], [0, 1]), run('avenue', [[0, -5], [0, -105]], [-1, 0])];

test('points are found by range, and a point is moved to the nearest kerb with the road on the right side', () => {
  const index = indexPoints([10, 10, 40, 10, 500, 500, 12, 11]);
  assert.deepEqual(index.near(11, 10, 3).sort(), [[10, 10], [12, 11]]);
  assert.deepEqual(index.near(0, 0, 5), []); assert.equal(index.near(300, 300, 450).length, 4);
  assert.deepEqual(indexPoints(undefined).near(0, 0, 100), []);
  const kerbs = indexKerbs(walks());
  // A basket surveyed two metres out in the roadway, 30 m along the street.
  const hit = snapToKerb(kerbs, 30, -3, 9);
  assert.deepEqual([hit.x, hit.z, hit.nx, hit.nz, hit.tx, hit.tz], [30, -5, 0, 1, 1, 0]);
  assert.equal(hit.distance, 2); assert.equal(hit.room, 30, 'thirty metres of this kerb to its nearer end, however many pieces it is surveyed in');
  // Near the corner the closer kerb wins; out of reach of any, nothing.
  assert.equal(snapToKerb(kerbs, -1, -40, 9).nx, -1);
  assert.equal(snapToKerb(kerbs, 30, 30, 9), null);
  assert.equal(snapToKerb(indexKerbs([]), 0, 0, 9), null);
});

test('baskets and shelters stand on the sidewalk just inside the kerb, facing the roadway', () => {
  const scene = new THREE.Scene();
  const data = { baskets: [30, -3, 2, -60, 400, 400, 60, 40], shelters: [70, -4, 99, -4, 60, 300] };
  const props = createStreetProps({ scene, heightAt: () => 2, data });
  assert.equal(props.update(walks(), { x: 20, z: -20 }), true);
  assert.deepEqual(props.counts, { baskets: 2, shelters: 1 }, 'those with no kerb in reach are left out; a shelter needs straight kerb either side');
  const matrix = new THREE.Matrix4(), at = new THREE.Vector3(), front = new THREE.Vector3();
  const stood = [0, 1].map(i => { props.meshes.baskets.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix); return [+at.x.toFixed(6), +at.y.toFixed(6), +at.z.toFixed(6)]; }).sort((p, q) => p[0] - q[0]);
  // On the avenue the sidewalk is to the east of the kerb; on the street, to the north of it. Both on the surface.
  assert.deepEqual(stood, [[SETBACK.basket, 2, -60], [30, 2, -5 - SETBACK.basket]]);
  props.meshes.shelters.getMatrixAt(0, matrix); at.setFromMatrixPosition(matrix); front.set(0, 0, 1).transformDirection(matrix);
  assert.ok(Math.abs(at.x - 70) < 1e-9 && Math.abs(at.z - (-5 - SETBACK.shelter)) < 1e-9);
  assert.ok(Math.abs(front.z - 1) < 1e-9, 'its open side faces the road');
  assert.equal(props.meshes.glazing.count, 1); assert.equal(props.meshes.adverts.count, 1);
  assert.ok(props.meshes.adverts.instanceColor.getX(0) > .5, 'the advertising panel is lit');
  // Nothing is redone until the player has moved or the kerbs have changed.
  assert.equal(props.update(props.update.length ? walks() : walks(), { x: 21, z: -20 }), true, 'a new list of kerbs is a change');
  const same = walks();
  props.update(same, { x: 20, z: -20 });
  assert.equal(props.update(same, { x: 25, z: -22 }), false);
  assert.equal(props.update(same, { x: 80, z: -22 }), true);
  // A basket that would stand in a signal pole is slid a pace along the kerb, still on the sidewalk.
  const pole = [{ x: 30.2, z: -5 - SETBACK.basket }];
  assert.equal(props.update(same, { x: 80, z: -22 }, pole), true);
  const moved = [0, 1].map(i => { props.meshes.baskets.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix); return [+at.x.toFixed(4), +at.z.toFixed(4)]; }).sort((p, q) => p[0] - q[0]);
  assert.deepEqual(moved[1], [28.7, -5 - SETBACK.basket]); assert.deepEqual(moved[0], [SETBACK.basket, -60]);
  assert.equal(props.update(same, { x: 80, z: -22 }, pole), false, 'the same poles change nothing');
  // Data may arrive late, and may be absent.
  props.setData({ baskets: [10, -4] });
  props.update(same, { x: 80, z: -22 });
  assert.deepEqual(props.counts, { baskets: 1, shelters: 0 });
  const bare = createStreetProps({ heightAt: () => 0 });
  bare.update(same, { x: 0, z: 0 });
  assert.deepEqual(bare.counts, { baskets: 0, shelters: 0 });
  props.dispose(); bare.dispose();
  assert.equal(scene.children.length, 0);
});
