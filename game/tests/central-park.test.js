import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { prepareTerrain, sampleTerrain, Landscape } from '../dist/landscape.js';
import { createParkGroundUniforms, bindParkGround, setParkTreeFade } from '../dist/park-ground.js';
import { createParkTrees, buildTreeForms, treeLook, TREE_RANGE } from '../dist/park-trees.js';
import { createMappedPark } from '../dist/mapped-parks.js';

const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected}`);
const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url)));
const bytes = path => { const file = readFileSync(new URL(`../dist/${path}`, import.meta.url)); return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength); };

function parkTerrain() {
  const park = read('landscape/central-park-terrain.json'), raw = new Uint16Array(bytes('landscape/central-park-terrain.bin'));
  return prepareTerrain({ ...park, heights: Float32Array.from(raw, value => value * park.heightEncoding.scale + park.heightEncoding.offset) });
}
const treeRecords = manifest => ({ records: new Uint16Array(bytes('central-park/trees.bin')), scale: manifest.trees.scale, offset: manifest.trees.offset, frame: manifest.frame });

test('park ground uniforms carry the frame, the maps and how far trees are drawn', () => {
  const uniforms = createParkGroundUniforms(), surface = new THREE.Texture(), canopy = new THREE.Texture();
  assert.equal(uniforms.parkUse.value, false);
  bindParkGround(uniforms, { frame: { x: 3, z: 4, cos: .6, sin: .8 }, size: { width: 930, depth: 4200 }, surface, canopy, reach: 4 });
  assert.equal(uniforms.parkUse.value, true);
  assert.deepEqual(uniforms.parkFrame.value.toArray(), [3, 4, .6, .8]);
  assert.deepEqual(uniforms.parkSize.value.toArray(), [930, 4200]);
  setParkTreeFade(uniforms, 1150, 1500);assert.deepEqual(uniforms.parkTreeFade.value.toArray(), [1150, 1500]);
  bindParkGround(uniforms, null);assert.equal(uniforms.parkUse.value, false);
  // The citywide terrain uses the overview bindings.
  const landscape = new Landscape({ scene: new THREE.Scene(), index: { version: 1, regions: [] }, fetcher: async () => ({ ok: false }) });
  landscape.setParkGround({ frame: { x: 0, z: 0, cos: 1, sin: 0 }, size: { width: 1, depth: 1 }, surface, canopy });
  assert.equal(landscape.parkGround.parkUse.value, true);
  landscape.dispose();
});

test('the shipped park: its frame, its ground and its lakes agree', () => {
  const manifest = read('central-park/park.json'), region = read('landscape-index.json').regions.find(region => region.id === 'central-park');
  const terrain = parkTerrain(), features = read('landscape/central-park-features.json');
  assert.deepEqual(terrain.frame, manifest.frame);
  assert.equal(terrain.bounds.maxX, manifest.size.width);assert.equal(terrain.bounds.maxZ, manifest.size.depth);
  close(terrain.dx, 2.5);close(terrain.dz, 2.5);
  // The park is four kilometres by eight hundred metres, turned 29 degrees to follow the avenues.
  close(Math.atan2(manifest.frame.sin, manifest.frame.cos) * 180 / Math.PI, 28.9, .3);
  assert.ok(manifest.size.depth > 4000 && manifest.size.depth < 4300 && manifest.size.width > 850 && manifest.size.width < 960);
  assert.deepEqual(region.bounds, manifest.bounds);
  const named = Object.fromEntries(features.water.filter(feature => feature.name !== 'unset').map(feature => [feature.name, feature]));
  // The Reservoir stands 36 m above the sea, the Lake 17 m, the Harlem Meer under 4 m.
  close(named.RESERVOIR.elevation, 35, 1.5);close(named['THE LAKE'].elevation, 16.8, 1);close(named['HARLEM MEER'].elevation, 3.9, 1);
  assert.ok(features.water.length >= 12 && features.water.every(feature => Number.isFinite(feature.elevation)), 'every lake and pond has a level');
  const base = read('landscape/nyc-water.json').water;
  for (const feature of features.water) assert.ok(base.some(other => other.id === feature.id), 'each is the citywide feature, so the two are one body of water');
  const inRing = (x, z, ring) => { let inside = false;for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j];if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };
  const toShore = (x, z, rings) => { let best = Infinity;for (const ring of rings) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return best; };
  for (const feature of [named.RESERVOIR, named['THE LAKE'], named['HARLEM MEER']]) {
    // The bed lies under the water from shore to shore; the bank beside it stands clear.
    const rings = [feature.polygon, ...feature.holes], xs = feature.polygon.map(point => point[0]), zs = feature.polygon.map(point => point[1]);
    let wet = 0, dry = 0;
    for (let x = Math.min(...xs) - 20; x <= Math.max(...xs) + 20; x += 23) for (let z = Math.min(...zs) - 20; z <= Math.max(...zs) + 20; z += 23) {
      const distance = toShore(x, z, rings), inside = inRing(x, z, feature.polygon) && !feature.holes.some(hole => inRing(x, z, hole)), ground = sampleTerrain(terrain, x, z);
      if (!ground || distance < 4) continue;
      if (inside) { wet++;assert.ok(ground.elevation < feature.elevation - .5, `${feature.name}: the bed at ${x.toFixed(0)}, ${z.toFixed(0)} is under water`); }
      else if (distance < 12 && !features.water.some(other => inRing(x, z, other.polygon))) { dry++;assert.ok(ground.elevation > feature.elevation + .05, `${feature.name}: the bank at ${x.toFixed(0)}, ${z.toFixed(0)} stands above it`); }
    }
    assert.ok(wet > 20 && dry > 5, `${feature.name}: ${wet} points on the bed, ${dry} on the bank`);
  }
});

test('every tree in the park stands on the park\'s ground, out of the water', async () => {
  const manifest = read('central-park/park.json'), terrain = parkTerrain(), water = read('landscape/central-park-features.json').water;
  const { records, scale, offset, frame } = treeRecords(manifest);
  assert.equal(records.length, manifest.trees.count * 6);
  assert.ok(manifest.trees.count > 40000 && manifest.trees.count < 60000);
  const inRing = (x, z, ring) => { let inside = false;for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j];if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };
  let tallest = 0;
  for (let i = 0; i < manifest.trees.count; i += 7) {
    const value = k => records[i * 6 + k] * scale[k] + offset[k];
    const x = frame.x + value(0) * frame.cos - value(1) * frame.sin, z = frame.z + value(0) * frame.sin + value(1) * frame.cos;
    close(sampleTerrain(terrain, x, z).elevation, value(2), .011);
    assert.ok(value(3) >= 5 && value(3) <= 60 && value(4) > .3);
    tallest = Math.max(tallest, value(3));
    assert.ok(!water.some(feature => inRing(x, z, feature.polygon) && !feature.holes.some(hole => inRing(x, z, hole))), 'no trunk stands in a lake');
  }
  assert.ok(tallest > 30 && tallest < 50, `the tallest tree is ${tallest} m`);
});

test('a tree is drawn the same way every time, and no wider than it is tall', () => {
  const a = treeLook(2500.5, -5600.25, 18, 6), b = treeLook(2500.5, -5600.25, 18, 6);
  assert.deepEqual(a, b);
  assert.ok(a.form >= 0 && a.form <= 2 && a.spread <= 18 * .62 + 1e-9);
  assert.ok(treeLook(10, 20, 6, 40).spread <= 6 * .62 + 1e-9, 'a crown the segmentation made too wide is drawn in proportion');
  assert.ok(a.tint[1] > a.tint[0] && a.tint[1] > a.tint[2], 'green in July');
  const forms = buildTreeForms(), triangles = geometry => geometry.attributes.position.count / 3;
  assert.equal(forms.near.length, 4);assert.equal(forms.mid.length, 2);assert.equal(forms.far.length, 1);
  assert.ok(forms.near.every(form => triangles(form) > 3 * triangles(forms.mid[0]) / 2) && triangles(forms.mid[0]) > 3 * triangles(forms.far[0]));
  for (const form of [...forms.near, ...forms.mid, ...forms.far]) {
    form.computeBoundingBox();
    assert.ok(form.boundingBox.min.y > -.05 && form.boundingBox.max.y < 1.2, 'a form is one tree-height tall, to be stretched to the measured height');
    form.dispose();
  }
});

test('each tree is drawn once: in full nearby, in its cell further off, with its block beyond', async () => {
  const manifest = read('central-park/park.json'), bodies = new Map();
  const physics = { replace: (key, list) => bodies.set(key, list) };
  const trees = await createParkTrees({ ...treeRecords(manifest), physics });
  assert.equal(trees.count, manifest.trees.count);
  // Standing in the Ramble, in the middle of the park.
  const eye = { x: 2655, y: 32, z: -6005 };
  trees.update(eye, eye, true);
  const drawn = trees.drawn;
  assert.ok(drawn.near > 20 && drawn.near < 900 && drawn.mid > 3 && drawn.far > 50, JSON.stringify(drawn));
  let instances = 0, lifted = 0;
  const zero = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  trees.group.traverse(object => {
    if (!object.isInstancedMesh || !object.visible) return;
    if (object.name.endsWith('near')) { instances += object.count;return; }
    for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, matrix);if (matrix.elements[0] === 0 && matrix.elements[5] === 0) lifted++;else instances++; }
  });
  assert.equal(lifted, drawn.near, 'a tree drawn in full is taken out of its cell');
  const within = trees.near(eye.x, eye.z, TREE_RANGE.far - 400).length;
  assert.ok(instances >= within && instances <= trees.count, `${instances} drawn, ${within} within range`);
  for (const tree of trees.near(eye.x, eye.z, 20)) assert.equal(tree.near, true);
  // Trunks near the player can be walked into.
  const stems = bodies.get('park-trees');
  assert.ok(stems.length > 50 && stems.every(stem => stem.kind === 'tree' && stem.radius >= .12 && stem.radius < 1 && Math.hypot(stem.x - eye.x, stem.z - eye.z) < 90));
  // From a height nothing is near enough for boughs.
  trees.update({ ...eye, y: 400 }, eye, true);
  assert.equal(trees.drawn.near, 0);
  // Moving on returns the lifted trees to their cells.
  const away = { x: 3600, y: 12, z: -8200 };
  trees.update(away, away, true);
  for (const tree of trees.near(eye.x, eye.z, 20)) assert.equal(tree.near, false);
  trees.update(away, away, false);
  assert.equal(trees.group.visible, false);assert.deepEqual(bodies.get('park-trees'), []);
  trees.dispose();
});

test('Central Park waits for its terrain before standing its trees, and paints the crowns until then', async () => {
  let active = [], ground = null;
  const uniforms = createParkGroundUniforms();
  const landscape = { parkGround: uniforms, setParkGround: park => { ground = park; }, getStatus: () => ({ activeRegions: active }) };
  const requests = [];
  const fetcher = async url => { requests.push(url);return url.endsWith('.bin') ? { ok: true, arrayBuffer: async () => bytes(url.replace(/^\.\//, '')) } : { ok: true, json: async () => read(url.replace(/^\.\//, '')) }; };
  const textures = { surface: new THREE.Texture(), canopy: new THREE.Texture() };
  const park = createMappedPark({ scene: new THREE.Scene(), landscape, fetcher, loadTextures: async () => textures });
  const manifest = await park.ready;
  assert.equal(manifest.id, 'central-park');
  assert.equal(ground.surface, textures.surface);assert.deepEqual(ground.frame, manifest.frame);
  // Far downtown nothing more is fetched.
  park.update({ x: 0, z: 0 });
  assert.deepEqual(requests, ['./central-park/park.json']);
  const inside = { x: 2655, z: -6005 };
  park.update(inside, { eye: { ...inside, y: 30 } });
  assert.ok(requests.includes('./central-park/trees.bin'));
  while (!park.trees) await new Promise(resolve => setTimeout(resolve, 5));
  park.update(inside, { eye: { ...inside, y: 30 } });
  assert.equal(park.trees.group.visible, false, 'no terrain yet, no trees');
  assert.deepEqual(uniforms.parkTreeFade.value.toArray(), [0, 1], 'the crowns are painted on the ground meanwhile');
  active = ['central-park'];
  park.update(inside, { eye: { ...inside, y: 30 } });
  assert.equal(park.trees.group.visible, true);
  assert.deepEqual(uniforms.parkTreeFade.value.toArray(), [TREE_RANGE.far - 350, TREE_RANGE.far]);
  park.update(inside, { overview: true });
  assert.equal(park.trees.group.visible, false, 'the city map shows no trees');
  assert.equal(park.getStatus().trees, manifest.trees.count);
  park.dispose();
  assert.equal(ground, null);
});

test('the park hands its bridges to the city\'s decks while it is near, and takes them back', async () => {
  const given = [];
  const decks = { setExtraStructures: (features, material) => given.push({ count: features.length, lids: features.filter(feature => feature.cover === 'ground').length, material }),
    clearExtraStructures: () => given.push({ count: 0 }) };
  const landscape = { parkGround: createParkGroundUniforms(), setParkGround: () => {}, getStatus: () => ({ activeRegions: [] }) };
  const fetcher = async url => url.endsWith('.bin') ? { ok: true, arrayBuffer: async () => bytes(url.replace(/^\.\//, '')) } : { ok: true, json: async () => read(url.replace(/^\.\//, '')) };
  const park = createMappedPark({ scene: new THREE.Scene(), landscape, fetcher, streetDetail: () => decks, loadTextures: async () => ({ surface: new THREE.Texture(), canopy: new THREE.Texture() }) });
  const manifest = await park.ready, inside = { x: 2655, z: -6005 };
  park.update({ x: -8000, z: 9000 });
  assert.equal(given.length, 0, 'far off, nothing is asked for');
  park.update(inside);
  for (let waited = 0; waited < 400 && !given.length; waited++) { await new Promise(resolve => setTimeout(resolve, 5));park.update(inside); }
  assert.equal(given.length, 1);
  assert.equal(given[0].count, manifest.structures.count);
  assert.ok(given[0].lids >= 8 && given[0].material.isMeshStandardMaterial, 'the lids come with the material that draws the ground on them');
  park.update(inside);assert.equal(given.length, 1, 'once is enough');
  park.update({ x: -8000, z: 9000 });
  assert.deepEqual(given.at(-1).count, 0, 'leaving the park returns the decks to the city\'s own');
  park.dispose();
});
