import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createWorld, createCar, createPerson } from '../dist/world.js';

// Geometry can be validated without a GPU. The canvas stand-in only supports
// procedural texture painting; these checks do not replace browser visual QA.
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const context = {
      fillRect() {}, strokeRect() {}, beginPath() {}, roundRect() {}, fill() {}, fillText() {},
      createLinearGradient() { return { addColorStop() {} }; },
    };
    return { width: 0, height: 0, getContext: () => context };
  },
};

const city = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url), 'utf8'));
const world = createWorld(city);

test('full SoHo geometry contains only finite coordinates and valid triangle indices', () => {
  let vertices = 0;
  for (const mesh of world.group.children) {
    const geometry = mesh.geometry;
    assert.ok(geometry.attributes.position.count > 0);
    for (const attribute of Object.values(geometry.attributes)) {
      assert.ok(attribute.array.every(Number.isFinite), 'all vertex attributes must be finite');
    }
    assert.equal(geometry.index.count % 3, 0);
    assert.ok(geometry.index.array.every(i => i >= 0 && i < geometry.attributes.position.count));
    assert.ok(Number.isFinite(geometry.boundingSphere.radius));
    vertices += geometry.attributes.position.count;
  }
  assert.ok(vertices > 100_000, 'test the full geographic scene, not an empty placeholder');
});

test('594 footprints stay within the static scene draw and triangle budgets', () => {
  let triangles = 0;
  for (const mesh of world.group.children) triangles += mesh.geometry.index.count / 3;
  assert.ok(world.group.children.length < 500, `${world.group.children.length} static batches exceeds budget`);
  assert.ok(triangles < 600_000, `${triangles} static triangles exceeds budget`);
  assert.ok(new Set(world.group.children.map(mesh => mesh.material)).size < 20, 'textures must be shared, not created per building');
});

test('distance culling keeps the local city visible and drops distant batches', () => {
  world.update(0, city.spawn);
  const visible = world.group.children.filter(mesh => mesh.visible);
  assert.ok(visible.length > 0);
  assert.ok(visible.length < world.group.children.length);
  for (const mesh of world.group.children) {
    const { center, radius } = mesh.geometry.boundingSphere;
    if (Math.hypot(center.x - city.spawn.x, center.z - city.spawn.z) <= radius + 30) {
      assert.equal(mesh.visible, true, 'geometry surrounding the player must remain visible');
    }
  }
});

function signedVolume(geometry) {
  const p = geometry.attributes.position, index = geometry.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

test('vehicle surfaces face outward so bodies and windows survive backface culling', () => {
  for (const type of ['sedan', 'taxi', 'police']) {
    const car = createCar({ type });
    car.traverse(mesh => {
      if (mesh.isMesh) assert.ok(signedVolume(mesh.geometry) > 0, `${type} has an inside-out mesh`);
    });
    const bounds = new THREE.Box3().setFromObject(car);
    assert.ok(bounds.min.y >= -0.01, 'wheels rest on the road');
    assert.ok(bounds.max.z > 2 && bounds.min.z < -2, 'vehicle dimensions use metres');
    assert.equal(car.userData.wheels.length, 4);
    assert.equal(car.userData.wheels.filter(wheel => wheel.userData.front).length, 2);
    assert.ok(car.userData.wheels.filter(wheel => wheel.userData.front).every(wheel => wheel.position.z > 0), 'front points +Z');
  }
});

test('police flashers can animate independently without changing other cars', () => {
  const first = createCar({ type: 'police' });
  const second = createCar({ type: 'police' });
  assert.equal(first.userData.lights.length, 2);
  const original = second.userData.lights[0].material.emissiveIntensity;
  first.userData.lights[0].material.emissiveIntensity = 0.05;
  assert.equal(second.userData.lights[0].material.emissiveIntensity, original);
  assert.notEqual(first.userData.lights[0].material.emissive.getHex(), first.userData.lights[1].material.emissive.getHex());
});

test('walking avatars expose separate limb pivots and human-scale ground contact', () => {
  const person = createPerson(0x6b7965);
  assert.equal(person.userData.legs.length, 2);
  assert.equal(person.userData.arms.length, 2);
  assert.ok(person.userData.legs.every(leg => leg.parent === person));
  const before = person.userData.legs[1].rotation.x;
  person.userData.legs[0].rotation.x = 0.5;
  assert.equal(person.userData.legs[1].rotation.x, before);
  person.userData.legs[0].rotation.x = 0;
  const bounds = new THREE.Box3().setFromObject(person);
  assert.ok(bounds.min.y >= 0 && bounds.min.y < 0.06);
  assert.ok(bounds.max.y > 1.7 && bounds.max.y < 2);
});
