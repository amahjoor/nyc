import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createWorld, createCar, createPerson, updateCarVisuals } from '../dist/world.js';

// Geometry can be validated without a GPU. The canvas stand-in only supports
// procedural texture painting; these checks do not replace browser visual QA.
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const context = {
      fillRect() {}, strokeRect() {}, beginPath() {}, roundRect() {}, fill() {}, fillText() {},
      moveTo() {}, lineTo() {}, arc() {}, quadraticCurveTo() {}, closePath() {},
      createLinearGradient() { return { addColorStop() {} }; },
    };
    return { width: 0, height: 0, getContext: () => context };
  },
};

const city = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url), 'utf8'));
const survey = JSON.parse(readFileSync(new URL('../dist/survey.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(readFileSync(new URL('../dist/facade-profiles.json', import.meta.url), 'utf8'));
const world = createWorld(city, survey, { profiles });

test('official survey is required instead of quietly generating a substitute city', () => {
  assert.throws(() => createWorld(city), /survey geometry is required/);
  assert.throws(() => createWorld(city, { ...survey, origin: { lat: 0, lon: 0 } }), /origins do not match/);
});

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

test('all city triangles come from the official survey, with only a ground-image plane added', () => {
  let triangles = 0;
  const sourcePositions = new Set();
  for (const building of survey.buildings) {
    for (let i = 0; i < building.vertices.length; i += 3) {
      sourcePositions.add([Math.fround(building.vertices[i]), Math.fround(building.vertices[i + 1] - building.baseElevation), Math.fround(building.vertices[i + 2])].join(','));
    }
  }
  for (const mesh of world.group.children) {
    if (!mesh.userData.worldTile) continue;
    triangles += mesh.geometry.index.count / 3;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) assert.ok(sourcePositions.has([p.getX(i), p.getY(i), p.getZ(i)].join(',')), 'every building vertex must retain a surveyed coordinate');
  }
  assert.equal(triangles, survey.stats.triangles);
  assert.equal(world.stats.surveyBuildings, survey.buildings.length);
  assert.equal(world.stats.playableBuildings, survey.stats.playableBuildings);
});

test('the complete official survey stays within the static scene rendering budget', () => {
  let triangles = 0;
  for (const mesh of world.group.children) triangles += mesh.geometry.index.count / 3;
  assert.ok(world.group.children.length < 500, `${world.group.children.length} static batches exceeds budget`);
  assert.ok(triangles < 150_000, `${triangles} static triangles exceeds budget`);
  assert.ok(new Set(world.group.children.map(mesh => mesh.material)).size < 20, 'textures must be shared, not created per building');
});

test('observed facade styles apply only to buildings with the exact documented NYC identifier', () => {
  const bound = profiles.profiles.filter(profile => profile.bin || profile.surveyId);
  assert.equal(world.stats.facadeProfiles.length, bound.length);
  for (const facade of world.stats.facadeProfiles) {
    const profile = bound.find(profile => profile.id === facade.profileId);
    assert.ok(profile);
    assert.equal(String(facade.bin), String(profile.bin));
    assert.ok(facade.triangles > 0);
    assert.ok(facade.reference.startsWith('https://'));
  }
  const invalidProfile = { ...bound[0], bin: 'not-a-real-bin', surveyId: 'not-a-real-id' };
  const subset = { ...survey, buildings: [survey.buildings.find(building => String(building.bin) === String(bound[0].bin))] };
  const unbound = createWorld(city, subset, { profiles: [invalidProfile] });
  assert.equal(unbound.stats.facadeProfiles.length, 0, 'a nearby or similarly shaped building must not inherit a facade');
});

test('orthophoto projects north-up onto surveyed roofs using local meter coordinates', () => {
  const bounds = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };
  const texture = new THREE.Texture();
  const subset = { ...survey, buildings: [survey.buildings[0]] };
  const textured = createWorld(city, subset, { orthoTexture: texture, orthoBounds: bounds });
  const roofMeshes = textured.group.children.filter(mesh => mesh.userData.worldTile && mesh.material.map === texture);
  assert.ok(roofMeshes.length > 0);
  for (const mesh of roofMeshes) {
    const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      assert.ok(Math.abs(uv.getX(i) - (p.getX(i) + 1000) / 2000) < 1e-6);
      assert.ok(Math.abs(uv.getY(i) - (1000 - p.getZ(i)) / 2000) < 1e-6);
    }
  }
  assert.throws(() => createWorld(city, subset, { orthoTexture: texture }), /valid local meter bounds/);
  const uncovered = createWorld(city, subset, { orthoTexture: texture, orthoBounds: { minX: 1000, maxX: 1100, minZ: 1000, maxZ: 1100 } });
  assert.equal(uncovered.stats.imageryUncoveredBuildings, 1);
  assert.ok(uncovered.group.children.filter(mesh => mesh.userData.worldTile).every(mesh => mesh.material.map !== texture), 'out-of-coverage roofs must not smear unrelated image-edge pixels');
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

test('vehicle headlights face physical +Z while red tail lamps face -Z', () => {
  const car = createCar();
  const headColor = new THREE.Color(0xffe2a4), tailColor = new THREE.Color(0xb54130);
  const heads = [], tails = [];
  car.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.emissiveIntensity !== 0.55) return;
    const position = mesh.geometry.attributes.position, color = mesh.geometry.attributes.color;
    for (let i = 0; i < position.count; i++) {
      const matches = target => Math.abs(color.getX(i) - target.r) + Math.abs(color.getY(i) - target.g) + Math.abs(color.getZ(i) - target.b) < 1e-5;
      if (matches(headColor)) heads.push(position.getZ(i));
      if (matches(tailColor)) tails.push(position.getZ(i));
    }
  });
  assert.ok(heads.length > 0 && heads.every(z => z > 2));
  assert.ok(tails.length > 0 && tails.every(z => z < -2));
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    updateCarVisuals(car, { x: 8, z: 12, angle, speed: 0 }, 1 / 60);
    const visualForward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quaternion);
    const physicsForward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    assert.ok(visualForward.distanceTo(physicsForward) < 1e-10);
  }
});

test('forward and reverse wheel spin cancel ground-contact velocity', () => {
  for (const speed of [6, -6]) {
    const car = createCar(), dt = 1 / 60;
    updateCarVisuals(car, { x: 0, z: 0, angle: 0, speed, _steering: 0 }, dt);
    for (const wheel of car.userData.wheels) {
      const angularVelocity = wheel.userData.roll.rotation.x / dt;
      const contactRadius = new THREE.Vector3(0, -wheel.userData.radius, 0);
      const contactVelocity = new THREE.Vector3(angularVelocity, 0, 0).cross(contactRadius).add(new THREE.Vector3(0, 0, speed));
      assert.ok(contactVelocity.length() < 1e-10, 'rolling must not slide the tire against its direction of travel');
      assert.equal(Math.sign(angularVelocity), Math.sign(speed));
    }
    const before = car.userData.wheels.map(wheel => wheel.userData.roll.rotation.x);
    updateCarVisuals(car, { x: 0, z: 0, angle: 0, speed, _steering: 0 }, 0);
    assert.deepEqual(car.userData.wheels.map(wheel => wheel.userData.roll.rotation.x), before, 'paused visuals do not advance the wheels');
  }
});

test('front steering pivots remain independent from wheel roll and reverse speed', () => {
  const car = createCar(), steering = -0.3;
  updateCarVisuals(car, { x: 0, z: 0, angle: 0, speed: 7, _steering: steering }, 1 / 60);
  for (const wheel of car.userData.wheels) {
    assert.equal(wheel.rotation.y, wheel.userData.front ? steering : 0);
    assert.equal(wheel.rotation.x, 0);
    assert.equal(wheel.userData.roll.parent, wheel);
    const axleBefore = new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.userData.roll.quaternion).applyQuaternion(wheel.quaternion);
    wheel.userData.roll.rotation.x += 1.9;
    const axleAfter = new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.userData.roll.quaternion).applyQuaternion(wheel.quaternion);
    assert.ok(axleBefore.distanceTo(axleAfter) < 1e-10, 'spinning the wheel must not wobble the steered axle');
  }
  assert.ok(car.rotation.z < 0, 'right steering leans the body outward toward local +X');
  updateCarVisuals(car, { x: 0, z: 0, angle: 0, speed: -7, _steering: steering }, 1 / 60);
  assert.ok(car.userData.wheels.filter(wheel => wheel.userData.front).every(wheel => wheel.rotation.y === steering), 'reversing changes roll direction, not wheel steering orientation');
  assert.ok(car.rotation.z < 0, 'reverse cornering retains the physical outward bank');
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
