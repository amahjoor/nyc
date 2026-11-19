import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { STATUE, buildStatueGeometry, createStatueOfLiberty } from '../dist/liberty.js';
import { MONUMENTS, monumentAt, replacedByMonument } from '../dist/monuments.js';
import { chooseStyle, STYLE_INDEX, FLAG } from '../dist/facade.js';
import { decodeI3S } from '../dist/city-stream.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected}`);

test('she stands where the survey has her, as tall as it has her, facing the harbour mouth', () => {
  // The survey: an outline in the Upper Bay 5.3 km south-west of SoHo, 46.66 m tall, on a mass 43.2 m high.
  close(Math.hypot(STATUE.x, STATUE.z), 5259, 5);
  close(STATUE.height, 46.657, .001);close(STATUE.pedestal.height, 43.218, .001);
  assert.ok(Math.hypot(STATUE.x - STATUE.pedestal.x, STATUE.z - STATUE.pedestal.z) < 3, 'she is over the middle of the pedestal');
  // 147 degrees by the compass: south-east, the way ships come in.
  close(180 - STATUE.facing * 180 / Math.PI, 147, .5);
  // The arrival point is on the plaza behind her, a hundred-odd metres off, and looks at her.
  const dx = STATUE.x - STATUE.arrival.x, dz = STATUE.z - STATUE.arrival.z;
  assert.ok(Math.hypot(dx, dz) > 90 && Math.hypot(dx, dz) < 150);
  close(Math.atan2(dx, dz), STATUE.arrival.angle, .05);
});

test('the figure has her published proportions: head, raised torch, tablet and seven rays', () => {
  const { figure, flame } = buildStatueGeometry();
  const p = figure.attributes.position, n = figure.attributes.normal, c = figure.attributes.color;
  assert.ok(p.count / 3 > 8000 && p.count / 3 < 30000, `${p.count / 3} triangles`);
  // Heel to torch is 46.05 m: the flame's tip is the top of everything.
  close(flame.boundingBox.max.y, 46.05, .06);
  assert.ok(figure.boundingBox.max.y < flame.boundingBox.max.y && figure.boundingBox.min.y > -1 && figure.boundingBox.min.y < -.5, 'she stands on a low plinth');
  // The torch is in her right hand: with +z ahead of her and y up, her right is -x. The tablet is on her left.
  let torchSide = 0, tabletSide = 0, headTop = -Infinity, widest = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 38) torchSide += x;
    if (y > 20 && y < 26 && z > 3.2) tabletSide += x;
    // Everything above the shoulders that is not the raised arm is head, diadem and rays.
    if (x > -2.6) headTop = Math.max(headTop, y);
    // Below the arms there is only the robe.
    if (y > 2 && y < 16) widest = Math.max(widest, Math.hypot(x, z));
    close(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), 1, 1e-3);
    assert.ok(c.getY(i) >= c.getX(i) && c.getY(i) >= c.getZ(i), 'weathered copper is green throughout');
  }
  assert.ok(torchSide < 0 && tabletSide > 0);
  // The top of her head is at 33.86 m; the rays of the diadem stand up to three metres above it.
  assert.ok(headTop > 34.5 && headTop < 37.5, `rays reach ${headTop} m`);
  // Thirty-five feet through the waist with the robe: about eleven metres across at the widest.
  assert.ok(widest > 4.5 && widest < 6.2, `${widest} m from the axis`);
  for (let i = 0; i < flame.attributes.color.count; i++) assert.ok(flame.attributes.color.getX(i) > flame.attributes.color.getZ(i) * 2, 'the flame is gilded');
  figure.dispose();flame.dispose();
});

test('she is seated on the pedestal, turned to face 147 degrees, and follows the ground when it changes', () => {
  let ground = 4.4;
  const scene = new THREE.Scene(), statue = createStatueOfLiberty({ scene, heightAt: () => ground });
  assert.equal(scene.children.length, 1);
  close(statue.base, 4.4 + STATUE.pedestal.height);
  const scale = STATUE.height / 46.05;
  close(statue.group.position.y, statue.base + .9 * scale);
  close(statue.group.position.x, STATUE.x);close(statue.group.position.z, STATUE.z);
  close(statue.group.scale.y, scale);close(statue.group.rotation.y, STATUE.facing);
  // The tip of the flame in the world: the pedestal's top plus her surveyed height.
  const box = new THREE.Box3().setFromObject(statue.group);
  close(box.max.y, statue.base + .9 * scale + STATUE.height, .1);
  // Her own +z is turned to south-east: +x and +z in the world.
  const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(statue.group.quaternion);
  assert.ok(ahead.x > .5 && ahead.z > .8);
  ground = 3.1;statue.update();
  close(statue.base, 3.1 + STATUE.pedestal.height);
  statue.setTerrainSampler(() => NaN);close(statue.base, STATUE.pedestal.height, 1e-9);
  assert.ok(statue.group.children.every(mesh => mesh.castShadow));
  statue.dispose();assert.equal(scene.children.length, 0);
});

test('the fort and pedestal are faced in stone, and no other building is', () => {
  const [monument] = MONUMENTS;
  assert.equal(monumentAt(monument.x + 4, monument.z - 3), monument);
  assert.equal(monumentAt(monument.x + 140, monument.z - 80), null, 'the museum across the plaza is a building');
  const volume = { height: 43.2, area: 5610, random: .31, random2: .62 };
  const stone = chooseStyle({ ...volume, x: monument.x, z: monument.z });
  assert.equal(stone.style, STYLE_INDEX.civic);
  assert.equal(stone.flags & FLAG.BLANK, FLAG.BLANK, 'no windows');
  assert.equal(stone.flags & FLAG.STONE, FLAG.STONE, 'and not the common brick of a lot-line wall');
  assert.equal(stone.flags & (FLAG.SHOP | FLAG.ESCAPE | FLAG.SCREENS), 0);
  for (const [x, z] of [[0, 0], [2500, -5600], [monument.x + 140, monument.z - 80]]) assert.equal(chooseStyle({ ...volume, x, z }).flags & FLAG.STONE, 0);
});

/** A tile of square prisms in the survey's own layout: positions, 24 unused bytes a vertex, then identifiers and face ranges. */
function tile(prisms) {
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  const vertexCount = prisms.length * faces.length * 3, buffer = new ArrayBuffer(8 + vertexCount * 36 + prisms.length * 16), view = new DataView(buffer);
  view.setUint32(0, vertexCount, true);view.setUint32(4, prisms.length, true);
  const positions = new Float32Array(buffer, 8, vertexCount * 3), featureOffset = 8 + vertexCount * 36;
  prisms.forEach(({ id, lon, lat, size, base, height }, feature) => {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [lon + a * size, lat + b * size]);
    const points = [...corners.map(corner => [...corner, base]), ...corners.map(corner => [...corner, base + height])];
    faces.forEach((face, f) => face.forEach((corner, k) => positions.set(points[corner], ((feature * faces.length + f) * 3 + k) * 3)));
    view.setBigUint64(featureOffset + feature * 8, BigInt(id), true);
    view.setUint32(featureOffset + prisms.length * 8 + feature * 8, feature * faces.length, true);
    view.setUint32(featureOffset + prisms.length * 8 + feature * 8 + 4, (feature + 1) * faces.length - 1, true);
  });
  return buffer;
}

test('the surveyed prism she replaces is folded away, and the mass beside it is left as surveyed', () => {
  assert.equal(replacedByMonument('339282'), true);assert.equal(replacedByMonument(339279), false);
  const origin = { lat: 40.7235, lon: -74.0015 }, node = { center: [-74.0445, 40.6893, 0] };
  const decoded = decodeI3S(tile([{ id: 339279, lon: 0, lat: 0, size: .0004, base: 4, height: 43 }, { id: 339282, lon: 0, lat: 0, size: .00005, base: 47, height: 46.6 }]), node, origin, { heightAt: () => 4.4 });
  const [fort, prism] = decoded.anchors, p = decoded.positions;
  assert.equal(prism.featureId, '339282');
  const spread = anchor => { let low = Infinity, high = -Infinity; for (let i = anchor.start; i < anchor.end; i++) { low = Math.min(low, p[i * 3 + 1]);high = Math.max(high, p[i * 3 + 1]); } return [low, high]; };
  close(spread(fort)[0], 4.4, 1e-4);close(spread(fort)[1], 47.4, 1e-3);
  assert.deepEqual(spread(prism), [Math.fround(4.4), Math.fround(4.4)], 'nothing of it stands up');
  for (let i = prism.start; i < prism.end; i++) { assert.equal(p[i * 3], p[prism.start * 3]);assert.equal(p[i * 3 + 2], p[prism.start * 3 + 2]); }
  assert.equal(decoded.buildings.filter(building => building.featureId === '339282').length, 1, 'its footprint is still known to the simulation');
});
