import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createWater, drawLandMask, landPolygons, WATER_LEVEL, STILL_WATER_GLSL } from '../dist/water.js';
import { shared } from '../dist/gfx-common.js';

const boroughs = JSON.parse(readFileSync(new URL('../dist/boroughs.json', import.meta.url), 'utf8')).boroughs;
const roads = JSON.parse(readFileSync(new URL('../dist/road-index.json', import.meta.url), 'utf8'));
// A canvas that records what was drawn, in place of a browser's.
function canvas() {
  const calls = [];
  const context = { fillStyle: '', setTransform() {}, fillRect: (...args) => calls.push(['rect', context.fillStyle, ...args]), beginPath: () => calls.push(['begin']),
    moveTo: (x, y) => calls.push(['move', x, y]), lineTo: (x, y) => calls.push(['line', x, y]), closePath: () => calls.push(['close']), fill: rule => calls.push(['fill', context.fillStyle, rule]) };
  return { width: 0, height: 0, calls, getContext: () => context };
}

test('borough outlines become shoreline polygons with bounds', () => {
  const polygons = landPolygons(boroughs);
  assert.equal(polygons.length, boroughs.reduce((sum, borough) => sum + borough.polygons.length, 0));
  for (const { outer, bounds } of polygons) assert.ok(outer.every(([x, z]) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ));
  assert.deepEqual(landPolygons([{ polygons: [{ outer: [[0, 0], [1, 1]] }] }]), [], 'degenerate outlines are skipped');
  assert.deepEqual(landPolygons(null), []);
});

test('a mask draws land white on black, north up, and only what is in view', () => {
  const polygons = landPolygons([{ polygons: [{ outer: [[0, 0], [100, 0], [100, 50], [0, 50]], holes: [[[40, 10], [60, 10], [60, 20], [40, 20]]] }, { outer: [[5000, 5000], [5100, 5000], [5100, 5100]] }] }]);
  const surface = canvas(), context = surface.getContext();
  assert.equal(drawLandMask(context, 200, polygons, { minX: -50, minZ: -50, size: 200 }), 1, 'the distant island is not drawn');
  assert.deepEqual(surface.calls[0], ['rect', '#000', 0, 0, 200, 200]);
  assert.deepEqual(surface.calls.filter(call => call[0] === 'move'), [['move', 50, 50], ['move', 90, 60]], 'x runs east, z runs down the image');
  assert.deepEqual(surface.calls.at(-1), ['fill', '#fff', 'evenodd'], 'holes are cut by the even-odd rule');
});

test('the water publishes shoreline masks, tracks the player and knows land from sea', () => {
  const scene = new THREE.Scene(), created = [], water = createWater({ scene, boroughs, bounds: roads.bounds, createCanvas: () => { const c = canvas(); created.push(c); return c; } });
  assert.equal(created.length, 2);
  assert.equal(shared.uNycLand.value.image, created[0]); assert.equal(shared.uNycLandRect.value.w, 1);
  const rect = shared.uNycLandRect.value, size = 1 / rect.z;
  assert.ok(rect.x <= roads.bounds.minX && rect.x + size >= roads.bounds.maxX && rect.y <= roads.bounds.minZ && rect.y + size >= roads.bounds.maxZ, 'the wide mask covers the whole city');
  assert.equal(shared.uNycLand.value.flipY, false, 'row zero is north');
  assert.equal(shared.uNycLandNearRect.value.w, 0, 'no close mask until there is a player');
  // SoHo is land; the middle of the Hudson and the Upper Bay are not.
  assert.equal(water.isLand(130, -100), true); assert.equal(water.isLand(-2000, -1000), false); assert.equal(water.isLand(-1500, 4500), false);
  const mesh = scene.getObjectByName('Harbor and river water');
  assert.equal(mesh.position.y, WATER_LEVEL); assert.ok(WATER_LEVEL < 0, 'the sheet lies below every street');
  const { width, height, widthSegments, heightSegments } = mesh.geometry.parameters;
  assert.ok(Math.hypot(width / widthSegments, height / heightSegments) < 6500, 'water triangles fit inside the street camera range for eye-level depth precision');
  assert.ok(mesh.renderOrder < 0, 'water is drawn before the land, so land wins a tie in depth');
  const draws = () => created[1].calls.filter(call => call[0] === 'fill').length;
  water.update({ x: 130, z: -100 });
  const first = draws(), near = shared.uNycLandNearRect.value;
  assert.ok(first > 0 && near.w === 1 && near.x < 130 && near.x + 1 / near.z > 130);
  assert.equal(water.waterNearby, true, 'SoHo is within reach of the Hudson');
  water.update({ x: 140, z: -95 }); assert.equal(draws(), first, 'small moves reuse the close mask');
  water.update({ x: 900, z: -100 }); assert.ok(draws() > first);
  water.update({ x: 7000, z: 5500 }); assert.equal(water.waterNearby, false, 'the middle of Brooklyn is not');
  water.update({ x: 130, z: -100 }, { overview: true }); assert.equal(shared.uNycLandNearRect.value.w, 0);
  // Without a GPU the mirror pass declines politely.
  assert.equal(water.renderMirror({}, scene, new THREE.PerspectiveCamera(), { enabled: false }), false);
  assert.equal(water.material.uniforms.uMirror.value, 0);
  water.dispose();
  assert.equal(scene.children.length, 0); assert.equal(shared.uNycLandRect.value.w, 0, 'with no shoreline, everything is land again');
});

test('the land around the city is accepted only with a usable description', () => {
  const water = createWater({ scene: new THREE.Scene(), boroughs, bounds: roads.bounds, createCanvas: canvas });
  const manifest = JSON.parse(readFileSync(new URL('../dist/context-land.json', import.meta.url), 'utf8')), image = { width: manifest.width, height: manifest.height };
  assert.equal(water.setContext(image, { bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 }, width: 1, height: 1 }), false);
  assert.equal(water.setContext(null, manifest), false);
  assert.equal(water.setContext(image, manifest), true);
  const u = water.material.uniforms;
  assert.deepEqual(u.uContextRect.value.toArray(), [manifest.bounds.minX, manifest.bounds.minZ, 1 / (manifest.bounds.maxX - manifest.bounds.minX), 1 / (manifest.bounds.maxZ - manifest.bounds.minZ)]);
  assert.equal(u.tContext.value.image, image); assert.equal(u.tContext.value.flipY, false);
  assert.ok(manifest.bounds.minX < roads.bounds.minX - 20000 && manifest.bounds.maxX > roads.bounds.maxX + 20000, 'the silhouette reaches well past the city');
  assert.equal(manifest.width * manifest.cellMeters, manifest.bounds.maxX - manifest.bounds.minX);
  assert.match(manifest.source.attribution, /Mapzen/);
  water.dispose();
  assert.match(STILL_WATER_GLSL, /roughnessFactor = 0\.07;/);
});

test('surface swimming uses a motion ripple and reserves the foam wake for boats', () => {
  const water = createWater({ boroughs: [], bounds: roads.bounds, createCanvas: canvas });
  const swimmer = { x: 0, z: 0, angle: 0, speed: 1.7 };
  const kayak = { ...swimmer, spec: { radius: .38, length: 4.2 } };
  const { uWakeShape, uSwimRipple } = water.material.uniforms;
  water.update(swimmer, { vessel: kayak });
  assert.equal(uWakeShape.value.x, kayak.spec.radius);
  assert.equal(uSwimRipple.value, 0);
  water.update(swimmer, { swimmer });
  assert.equal(uWakeShape.value.x, 0);
  assert.equal(uSwimRipple.value, 1);
  water.update(swimmer, { swimmer: { ...swimmer, speed: 0 } });
  assert.equal(uSwimRipple.value, 0);
  water.update(swimmer, { swimmer });
  water.update(swimmer);
  assert.equal(uSwimRipple.value, 0);
  water.dispose();
});
