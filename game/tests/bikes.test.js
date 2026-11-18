import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createBikeShare, planBikeDocks, createBikeDocks, DOCKS } from '../dist/bikes.js';

const data = JSON.parse(readFileSync(new URL('../dist/bikes.json', import.meta.url), 'utf8'));
// A kerb along x at z = 0 with the roadway to the south, in reach of anything within 14 m of it.
const kerb = (x, z) => Math.abs(z) <= 14 ? { x, z: 0, nx: 0, nz: 1, tx: 1, tz: 0 } : null;

test('the bundled stations are the city side of the system, each with its docks and its name', () => {
  assert.ok(data.stations.length > 1500 && data.stations.length < 4000, `${data.stations.length} stations`);
  for (const [x, z, docks, name] of data.stations) assert.ok(Math.abs(x) < 40000 && Math.abs(z) < 40000 && docks >= 2 && docks < 200 && name, name);
  assert.deepEqual(data.row, ['x', 'z', 'docks', 'name']);
  const share = createBikeShare(data), soho = share.near(126, -80, 300);
  assert.equal(share.count, data.stations.length);
  assert.ok(soho.length >= 3 && soho.every(station => Math.hypot(station.x - 126, station.z + 80) <= 300));
  for (let i = 1; i < soho.length; i++) assert.ok(Math.hypot(soho[i].x - 126, soho[i].z + 80) >= Math.hypot(soho[i - 1].x - 126, soho[i - 1].z + 80), 'nearest first');
  assert.deepEqual(createBikeShare(null).near(0, 0, 500), []);
});

test('a station is a row of docks along the nearest kerb, the same docks full every time', () => {
  const stations = [{ x: 10, z: -4, docks: 8, name: 'A' }, { x: 60, z: -2, docks: 67, name: 'B' }, { x: 90, z: -40, docks: 20, name: 'C' }];
  const rows = planBikeDocks(stations, kerb);
  assert.deepEqual(rows.map(row => [row.station.name, row.x, row.z, row.docks]), [['A', 10, -DOCKS.setback, 8], ['B', 60, -DOCKS.setback, DOCKS.most]], 'a long station is cut to what fits, and one with no kerb in reach is left out');
  assert.ok(rows.every(row => row.bikes.length === row.docks && row.bikes.some(Boolean) && row.tx === 1 && row.nz === 1));
  assert.deepEqual(planBikeDocks(stations, kerb).map(row => row.bikes), rows.map(row => row.bikes));
  // Across the whole system about six docks in ten hold a bike.
  const all = planBikeDocks(createBikeShare(data).near(0, 0, 40000), () => ({ x: 0, z: 0, nx: 0, nz: 1, tx: 1, tz: 0 })), docks = all.reduce((sum, row) => sum + row.docks, 0), bikes = all.reduce((sum, row) => sum + row.bikes.filter(Boolean).length, 0);
  assert.ok(Math.abs(bikes / docks - .6) < .03, `${(100 * bikes / docks).toFixed(0)}% of docks hold a bike`);
});

test('bikes stand in their docks on the sidewalk side of the kerb, nose to the roadway', () => {
  const scene = new THREE.Scene(), docks = createBikeDocks({ scene, heightAt: () => 3 });
  const [row] = planBikeDocks([{ x: 10, z: -4, docks: 8, name: 'A' }], kerb);
  assert.equal(docks.update([row]), 1);
  const bikes = scene.getObjectByName('Citi Bikes'), posts = scene.getObjectByName('Citi Bike docks'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), nose = new THREE.Vector3();
  assert.deepEqual(docks.counts, { bikes: row.bikes.filter(Boolean).length, parts: 8 * 2 + 3 });
  for (let i = 0; i < bikes.count; i++) {
    bikes.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix); nose.set(0, 0, 1).transformDirection(matrix);
    assert.ok(at.y === 3 && Math.abs(at.z + DOCKS.setback) < 1e-6 && Math.abs(at.x - 10) <= 4 * DOCKS.pitch && nose.z > .999);
  }
  // The whole bike, wheels and all, is over the sidewalk.
  bikes.geometry.computeBoundingBox();
  assert.ok(bikes.geometry.boundingBox.max.z < DOCKS.setback && bikes.geometry.boundingBox.min.y > -.01 && bikes.geometry.boundingBox.max.y < 1.3 && bikes.geometry.boundingBox.max.x < .3);
  for (let i = 0; i < posts.count; i++) { posts.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix); assert.ok(at.z < 0 && at.z > -DOCKS.setback); }
  const small = createBikeDocks({ capacity: 10 });
  assert.equal(small.update([row, row]), 1);
  const [borrowed] = docks.available, original = docks.counts;
  docks.update([row], borrowed.id);
  assert.equal(docks.available.some(bike => bike.id === borrowed.id), false);
  assert.deepEqual(docks.counts, { ...original, bikes: original.bikes - 1 });
  docks.update([row]);
  assert.deepEqual(docks.counts, original);
  assert.equal(docks.update([]), 0); assert.deepEqual(docks.counts, { bikes: 0, parts: 0 });
  docks.dispose(); small.dispose(); assert.equal(scene.children.length, 0);
});
