import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { carBody, buildCar, createCarMaterial, createLampMaterial, wheelGeometry, WHEEL, HEADLAMP, TAILLAMP } from '../dist/vehicle-model.js';
import { createCar, setVehicleLamps } from '../dist/world.js';

/** Signed volume of a triangle soup: positive when faces are wound outward. */
function volume(geometry) {
  const p = geometry.attributes.position, index = geometry.index, count = index ? index.count : p.count, at = i => { const k = index ? index.getX(i) : i; return [p.getX(k), p.getY(k), p.getZ(k)]; };
  let total = 0;
  for (let i = 0; i < count; i += 3) { const a = at(i), b = at(i + 1), c = at(i + 2); total += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }
  return total;
}

test('car bodies are closed, outward-facing and sized like cars', () => {
  for (const shape of ['sedan', 'suv', 'van']) {
    const body = carBody(shape, [.5, .5, .5]), count = body.position.length / 3;
    assert.equal(body.normal.length, count * 3); assert.equal(body.color.length, count * 3); assert.equal(body.finish.length, count * 3);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(body.position, 3)); geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(volume(geometry) > 4 && volume(geometry) < 12, `${shape} encloses ${volume(geometry).toFixed(1)} cubic metres`);
    assert.ok(size.x > 1.7 && size.x < 2.1 && size.z > 4.3 && size.z < 4.5 && size.y > 1 && size.y < 1.9, `${shape} is ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    assert.ok(geometry.boundingBox.min.y > .2, 'the body clears the road');
    for (let i = 0; i < count; i++) assert.ok(Math.abs(Math.hypot(body.normal[i * 3], body.normal[i * 3 + 1], body.normal[i * 3 + 2]) - 1) < 1e-6);
    // Glass is confined to the cabin, above the belt line.
    let glass = 0;
    for (let i = 0; i < count; i++) if (body.finish[i * 3 + 1] > .8 && body.finish[i * 3] < .1) { glass++; assert.ok(body.position[i * 3 + 1] > .75 && Math.abs(body.position[i * 3 + 2]) < 2.2); }
    assert.ok(glass > 30, `${shape} has windows`);
    // Every panel is wound the way it is shaded, so none is culled from outside.
    // Total volume cannot show this: an inside-out end cap barely changes it.
    let nose = 0, tail = 0;
    const corner = (i, k) => new THREE.Vector3().fromArray(body.position, (i + k) * 3);
    for (let i = 0; i < count; i += 3) {
      const a = corner(i, 0), b = corner(i, 1), c = corner(i, 2), face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-12) continue;
      const shade = new THREE.Vector3();
      for (let k = 0; k < 3; k++) shade.add(new THREE.Vector3().fromArray(body.normal, (i + k) * 3));
      assert.ok(face.dot(shade) > 0, `${shape} has a panel facing inward near z = ${a.z.toFixed(2)}, y = ${a.y.toFixed(2)}`);
      const end = z => [a, b, c].every(point => Math.abs(point.z - z) < 1e-9);
      if (end(2.2)) { nose++; assert.ok(face.z > 0, `${shape}'s nose is closed from outside`); }
      if (end(-2.2)) { tail++; assert.ok(face.z < 0, `${shape}'s tail is closed from outside`); }
    }
    assert.ok(nose >= 8 && tail >= 8, `${shape} is closed at both ends`);
  }
  assert.ok(carBody('unknown', [1, 1, 1]).position.length > 0, 'an unknown shape falls back to a sedan');
});

test('each vehicle type carries its lamps and livery', () => {
  const head = new THREE.Color(HEADLAMP), tail = new THREE.Color(TAILLAMP), same = (c, i, t) => Math.abs(c.getX(i) - t.r) + Math.abs(c.getY(i) - t.g) + Math.abs(c.getZ(i) - t.b) < 1e-5;
  for (const type of ['sedan', 'taxi', 'police']) {
    const built = buildCar({ type, paint: 0x336699 }), p = built.lamps.attributes.position, c = built.lamps.attributes.color;
    let heads = 0, tails = 0;
    for (let i = 0; i < p.count; i++) {
      if (same(c, i, head)) { heads++; assert.ok(p.getZ(i) > 2.1); }
      if (same(c, i, tail)) { tails++; assert.ok(p.getZ(i) < -2.1); }
    }
    assert.ok(heads >= 48 && tails >= 48, 'two headlamps and two tail lamps');
    assert.ok(volume(built.body) > 0 && volume(built.lamps) > 0);
    assert.equal(built.body.attributes.aFinish.count, built.body.attributes.position.count);
  }
  assert.ok(buildCar({ type: 'taxi' }).lamps.attributes.position.count > buildCar({ type: 'sedan' }).lamps.attributes.position.count, 'a cab has a roof light');
  const { tyre, rim } = wheelGeometry();
  assert.ok(volume(tyre) > 0 && volume(rim) > 0);
  tyre.computeBoundingBox(); assert.ok(Math.abs(tyre.boundingBox.max.y - WHEEL.radius) < 1e-6 && tyre.boundingBox.max.x < .14, 'the axle runs along X');
});

test('finished cars share geometry and materials, vary by identity, and light up after dark', () => {
  const a = createCar({ type: 'sedan', color: '#7a8c99', seed: 'traffic-1' }), b = createCar({ type: 'sedan', color: '#7a8c99', seed: 'traffic-1' });
  const body = car => car.userData.chassis.getObjectByName('Car body'), lamps = car => car.userData.chassis.getObjectByName('Car lamps');
  assert.equal(body(a).geometry, body(b).geometry, 'identical cars reuse one body');
  assert.equal(body(a).material, body(createCar({ type: 'taxi' })).material);
  const shapes = new Set(Array.from({ length: 40 }, (_, i) => createCar({ type: 'sedan', seed: `traffic-${i}` }).userData.shape));
  assert.deepEqual([...shapes].sort(), ['sedan', 'suv', 'van'], 'traffic comes in several body styles');
  assert.equal(createCar({ type: 'taxi', seed: 'x' }).userData.shape, 'sedan'); assert.equal(createCar({ type: 'police', seed: 'y' }).userData.shape, 'sedan');
  assert.equal(lamps(a).material.emissiveIntensity, .55);
  setVehicleLamps(1); assert.ok(lamps(a).material.emissiveIntensity > 3);
  setVehicleLamps(5); const bright = lamps(a).material.emissiveIntensity; setVehicleLamps(1); assert.equal(lamps(a).material.emissiveIntensity, bright, 'input is clamped');
  setVehicleLamps(0); assert.equal(lamps(a).material.emissiveIntensity, .55);
  // Finish and lamp colour ride on the stock physical and standard shaders.
  const paint = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <emissivemap_fragment>\n#include <lights_physical_fragment>' };
  createCarMaterial().onBeforeCompile(paint);
  assert.match(paint.fragmentShader, /roughnessFactor = vFinish\.x; metalnessFactor = vFinish\.y;/); assert.match(paint.fragmentShader, /material\.clearcoat \*= vFinish\.z;/);
  const glow = { fragmentShader: '#include <emissivemap_fragment>' };
  createLampMaterial().onBeforeCompile(glow); assert.match(glow.fragmentShader, /totalEmissiveRadiance \*= vColor\.rgb;/);
});
