import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { planStands, vendorOf, createStandMesh, STANDS } from '../dist/stands.js';

const place = (kind, x, z) => ({ id: `${kind}${x}`, kind, x, z, name: '' });
// A kerb along x at z = 0 with the roadway to the south, in reach of anything within 16 m of it.
const kerb = (x, z) => Math.abs(z) <= 16 ? { x, z: 0, nx: 0, nz: 1, tx: 1, tz: 0 } : null;

test('newsstands and fruit stands stand on the sidewalk at the nearest kerb; nothing else does', () => {
  const stands = planStands([place('newsstand', 10, -6), place('fruitstand', 40, -3), place('pizza', 60, -3), place('fruitstand', 80, -40), place('fruitstand', 41, -2)], kerb);
  assert.deepEqual(stands.map(stand => [stand.kind, stand.x, stand.z]), [['newsstand', 10, -STANDS.newsstand.setback], ['fruitstand', 40, -STANDS.fruitstand.setback]],
    'a restaurant is not a stand, one with no kerb in reach is left out, and two do not share a spot');
  assert.ok(stands.every(stand => stand.tx === 1 && stand.nz === 1 && stand.place));
  // Whoever minds it is on the roadway side of the counter and faces the sidewalk.
  for (const stand of stands) {
    const vendor = vendorOf(stand);
    assert.ok(vendor.z > stand.z && vendor.z < 0, 'between the counter and the kerb');
    assert.ok(Math.abs(Math.sin(vendor.heading)) < 1e-9 && Math.cos(vendor.heading) < -.99, 'facing away from the roadway');
  }
});

test('a kiosk and a cart are drawn on the sidewalk side of the kerb, standing on the ground', () => {
  const scene = new THREE.Scene(), mesh = createStandMesh({ scene, heightAt: () => 2 });
  const stands = planStands([place('newsstand', 10, -6), place('fruitstand', 40, -3)], kerb);
  assert.equal(mesh.update(stands), 2);
  const drawn = scene.getObjectByName('Street stands'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
  const parts = Array.from({ length: drawn.count }, (_, i) => { drawn.getMatrixAt(i, matrix); matrix.decompose(at, turn, size); return { x: at.x, y: at.y, z: at.z, h: size.y }; });
  assert.ok(parts.length > 30 && parts.length === mesh.parts);
  assert.ok(parts.every(part => part.z < .05 && part.z > -2.2 && part.y - part.h / 2 >= 2 - 1e-5 && part.y + part.h / 2 < 4.7), 'nothing over the roadway, under the ground or taller than a kiosk');
  const kiosk = parts.filter(part => Math.abs(part.x - 10) < 2), cart = parts.filter(part => Math.abs(part.x - 40) < 2);
  assert.ok(kiosk.length > 25 && cart.length > 15 && kiosk.length + cart.length === parts.length);
  assert.ok(Math.max(...kiosk.map(part => part.y + part.h / 2)) > 4.5 && Math.max(...cart.map(part => part.y + part.h / 2)) < 4.5, 'the kiosk has a roof; the cart an umbrella lower than it');
  const small = createStandMesh({ capacity: 60 });
  assert.equal(small.update([...stands, ...stands]), 1);
  assert.equal(mesh.update([]), 0); assert.equal(drawn.count, 0);
  mesh.dispose(); small.dispose(); assert.equal(scene.children.length, 0);
});
