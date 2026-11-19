import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.min.js';
import * as THREE from '../dist/vendor/three.module.min.js';
import { STATUE, createStatueOfLiberty } from '../dist/liberty.js';
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

function asset(detail) {
  const file = readFileSync(new URL(`../dist/liberty-island/statue-${detail}.glb`, import.meta.url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

test('both local GLBs include the credited sculpture at the surveyed height and an increasingly detailed silhouette', async () => {
  for (const detail of ['harbor', 'island']) {
    const buffer = asset(detail), header = new DataView(buffer);
    assert.equal(header.getUint32(0, true), 0x46546c67);
    assert.equal(header.getUint32(8, true), buffer.byteLength);
    const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, header.getUint32(12, true))));
    assert.match(doc.asset.extras.author, /e-sfera/);
    assert.match(doc.asset.extras.license, /CC-BY-4.0/);
    const parts = doc.meshes[0].primitives;
    assert.deepEqual(parts.map(p => doc.materials[p.material].name), ['Granite', 'Copper', 'Gold']);
    const triangles = parts.reduce((total, p) => total + doc.accessors[p.indices].count / 3, 0);
    if (detail === 'island') {
      assert.ok(triangles > 40000 && triangles < 60000);
      const node = doc.nodes.find(node => node.mesh === 0);
      const topOf = part => node.translation[1] + node.scale[1] * doc.accessors[part.attributes.POSITION].max[1];
      close(topOf(parts[0]), STATUE.pedestal.height, .02);
      close(topOf(parts[2]), STATUE.pedestal.height + STATUE.height, .02);
      assert.equal(doc.images.length, 2);
      assert.ok(doc.images.every(image => Number.isInteger(image.bufferView)));
      assert.ok(doc.materials.every(m => m.normalTexture && m.pbrMetallicRoughness.baseColorTexture));
    } else {
      assert.ok(triangles < 5000 && buffer.byteLength < 100000);
      const { scene } = await new GLTFLoader().parseAsync(buffer, '');
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene, true);
      close(box.max.y, STATUE.height + STATUE.pedestal.height, .15);
      assert.ok(box.min.y < 0 && box.max.x - box.min.x > 85);
      const flame = scene.getObjectsByProperty('isMesh', true).find(mesh => mesh.material.name === 'Gold');
      assert.ok(new THREE.Box3().setFromObject(flame, true).max.x < 0, 'the torch is on her right');
    }
  }
});

test('travel swaps levels only when ready and keeps the monument on the measured ground', async () => {
  let ground = 4.4;
  const loads = new Map(), scene = new THREE.Scene();
  const load = name => new Promise(resolve => { assert.ok(!loads.has(name)); loads.set(name, resolve); });
  const statue = createStatueOfLiberty({ scene, heightAt: () => ground, load });
  const far = { x: 0, y: 100, z: 0 }, near = { x: STATUE.x, y: 100, z: STATUE.z };
  statue.update(far); statue.update(far);
  assert.deepEqual([...loads.keys()], ['harbor']);
  const distant = new THREE.Group(), detailed = new THREE.Group();
  loads.get('harbor')(distant); await Promise.resolve();
  assert.equal(distant.visible, true);
  statue.update(near);
  assert.equal(distant.visible, true, 'distant geometry covers the island download');
  loads.get('island')(detailed); await Promise.resolve();
  assert.equal(detailed.visible, true); assert.equal(distant.visible, false);
  statue.update(far);
  assert.equal(distant.visible, true); assert.equal(detailed.visible, false);
  close(statue.base, ground + STATUE.pedestal.height);
  close(statue.group.rotation.y, STATUE.facing);
  close(statue.group.position.x, STATUE.x); close(statue.group.position.z, STATUE.z);
  ground = 3.1; statue.update(near); close(statue.group.position.y, ground);
  statue.setTerrainSampler(() => NaN); close(statue.base, STATUE.pedestal.height);
  statue.dispose(); assert.equal(scene.children.length, 0);
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

test('the surveyed fort and statue are hidden while both collision footprints and nearby buildings survive', () => {
  assert.equal(replacedByMonument('339282'), true);assert.equal(replacedByMonument(339279), true);
  const origin = { lat: 40.7235, lon: -74.0015 }, node = { center: [-74.0445, 40.6893, 0] };
  const decoded = decodeI3S(tile([{ id: 339279, lon: 0, lat: 0, size: .0004, base: 4, height: 43 }, { id: 339282, lon: 0, lat: 0, size: .00005, base: 47, height: 46.6 }, { id: 100, lon: .002, lat: .002, size: .00005, base: 3, height: 9 }]), node, origin, { heightAt: () => 4.4 });
  const [fort, prism, other] = decoded.anchors, p = decoded.positions;
  assert.equal(prism.featureId, '339282');
  const spread = anchor => { let low = Infinity, high = -Infinity; for (let i = anchor.start; i < anchor.end; i++) { low = Math.min(low, p[i * 3 + 1]);high = Math.max(high, p[i * 3 + 1]); } return [low, high]; };
  close(spread(other)[0], 4.4, 1e-4);close(spread(other)[1], 13.4, 1e-3);
  assert.deepEqual(spread(fort), [Math.fround(4.4), Math.fround(4.4)]);
  assert.ok(decoded.buildings.some(building => building.featureId === '339279'));
  assert.deepEqual(spread(prism), [Math.fround(4.4), Math.fround(4.4)], 'nothing of it stands up');
  for (let i = prism.start; i < prism.end; i++) { assert.equal(p[i * 3], p[prism.start * 3]);assert.equal(p[i * 3 + 2], p[prism.start * 3 + 2]); }
  assert.equal(decoded.buildings.filter(building => building.featureId === '339282').length, 1, 'its footprint is still known to the simulation');
});
