import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { prepareTerrain, sampleTerrain, buildTerrainGeometry, buildWaterGeometry, buildCanopyGeometry, waterContact, reviewedWaterFeatures, Landscape } from '../dist/landscape.js';

const bounds = (minX = 0, maxX = 10, minZ = 0, maxZ = 10) => ({ minX, maxX, minZ, maxZ });
const grid = (overrides = {}) => ({ version: 1, bounds: bounds(), width: 2, height: 2, heights: [0, 10, 20, 30], units: 'meters', verticalDatum: 'NAVD88', sourceId: 'official-dem', ...overrides });
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected}`);
const water = { id: 'pond', sourceId: 'official-hydrography', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]], elevation: 3 };
const crown = { id: 'crown-1', sourceId: 'lidar-crowns', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], holes: [], maxHeight: 14, p10Height: 4, baseElevation: 7 };

test('terrain datum, coordinate direction, edge nodes and slope follow the measured source', () => {
  const terrain = prepareTerrain(grid());
  close(sampleTerrain(terrain, 0, 0).elevation, 0);
  close(sampleTerrain(terrain, 10, 10).elevation, 30);
  const center = sampleTerrain(terrain, 5, 5);close(center.elevation, 15);
  close(center.normal.x, -1 / Math.sqrt(6));close(center.normal.y, 1 / Math.sqrt(6));close(center.normal.z, -2 / Math.sqrt(6));
  assert.equal(center.sourceId, 'official-dem');assert.equal(center.verticalDatum, 'NAVD88');
  assert.equal(sampleTerrain(terrain, -1, 5), null);assert.equal(sampleTerrain(terrain, 0, NaN), null);
  const geometry = buildTerrainGeometry(terrain);
  assert.equal(geometry.index.count, 6);
  assert.ok(geometry.attributes.normal.getY(0) > 0, 'terrain faces point up');geometry.dispose();
});

test('surface samples follow exact mesh triangles rather than floating above saddle cells', () => {
  const terrain = prepareTerrain(grid({ bounds: bounds(0, 1, 0, 1), heights: [0, 0, 0, 10] }));
  close(sampleTerrain(terrain, .25, .25).elevation, 0);
  close(sampleTerrain(terrain, .75, .75).elevation, 5);
  close(sampleTerrain(terrain, 1, 1).elevation, 10);
  const normal = sampleTerrain(terrain, .8, .8).normal;
  close(normal.x, -10 / Math.sqrt(201));close(normal.z, -10 / Math.sqrt(201));
});

test('unknown heights leave holes, while unverified units and datums are rejected', () => {
  const terrain = prepareTerrain(grid({ heights: [0, 10, 20, null] })), geometry = buildTerrainGeometry(terrain);
  assert.equal(geometry.index.count, 3);assert.equal(sampleTerrain(terrain, 8, 8), null);
  close(sampleTerrain(terrain, 2, 2).elevation, 6);geometry.dispose();
  for (const change of [{ units: 'feet' }, { verticalDatum: 'EGM96' }, { sourceId: null }, { heights: [1] }, { heights: [0, 0, 0, NaN] }, { width: 1 }]) {
    assert.throws(() => prepareTerrain(grid(change)), /Invalid measured/);
  }
});

test('fine terrain shares coarse edge heights and preserves measured elevations separately', () => {
  const base = prepareTerrain(grid({ bounds: bounds(0, 100, 0, 100), heights: [10, 10, 10, 10] }));
  const detail = prepareTerrain(grid({ bounds: bounds(20, 80, 20, 80), width: 4, height: 4, heights: Array(16).fill(20) }), { base, blendMargin: 20 });
  close(sampleTerrain(detail, 20, 50).elevation, 10);close(sampleTerrain(detail, 80, 50).elevation, 10);
  close(sampleTerrain(detail, 50, 50).elevation, 20);
  close(sampleTerrain(detail, 20, 50).measuredElevation, 20);
  assert.deepEqual(detail.heights, Array(16).fill(20), 'LOD transition never overwrites source measurements');
});

test('water triangulation retains mapped islands and adds no out-of-source surface', () => {
  const geometry = buildWaterGeometry([water, { ...water, id: 'unverified', sourceId: null }]), p = geometry.attributes.position;
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cz = p.getZ(i + 2);
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    const x = (ax + bx + cx) / 3, z = (az + bz + cz) / 3;
    assert.ok(!(x > 4 && x < 6 && z > 4 && z < 6), 'no triangle covers the mapped island');
    close(p.getY(i), 3.025);assert.ok(geometry.attributes.normal.getY(i) > .99);
  }
  close(area, 96);assert.deepEqual(geometry.userData.sourceIds, ['pond']);geometry.dispose();
});

test('shoreline collision pushes out of water and preserves dry islands', () => {
  assert.equal(waterContact(water, 5, 5, .2), null);
  assert.equal(waterContact(water, -1, 5, .5), null);
  const bank = waterContact(water, -.2, 5, .5);close(bank.nx, -1);close(bank.nz, 0);close(bank.depth, .3);
  const wet = waterContact(water, .2, 5, .5);close(wet.nx, -1);close(wet.depth, .7);assert.equal(wet.inside, true);
  const islandBank = waterContact(water, 4.1, 5, .3);close(islandBank.nx, 1);close(islandBank.depth, .2);
  const onEdge = waterContact(water, 0, 5, .5);close(onEdge.nx, -1);close(onEdge.depth, .5);
});

test('canopy envelopes use recorded footprint and measured height, with explicit optional stem approximation', () => {
  const geometry = buildCanopyGeometry([crown, { ...crown, id: 'unknown', sourceId: null }]);
  geometry.computeBoundingBox();close(geometry.boundingBox.min.x, 0);close(geometry.boundingBox.max.x, 4);
  close(geometry.boundingBox.min.z, 0);close(geometry.boundingBox.max.z, 4);
  close(geometry.boundingBox.min.y, 11);close(geometry.boundingBox.max.y, 21);
  assert.deepEqual(geometry.userData.sourceIds, ['crown-1']);assert.equal(geometry.userData.approximateTrunks, 0);
  const individual = buildCanopyGeometry([{ ...crown, individualTree: true }]);individual.computeBoundingBox();
  close(individual.boundingBox.min.y, 7);close(individual.boundingBox.max.y, 21);
  assert.equal(individual.userData.approximateTrunks, 1);assert.match(individual.userData.approximation, /not measured/);
  const lowVegetation = buildCanopyGeometry([{ ...crown, maxHeight: 2.5, p10Height: 2.4, individualTree: false }]);lowVegetation.computeBoundingBox();
  close(lowVegetation.boundingBox.min.y, 7.15);close(lowVegetation.boundingBox.max.y, 9.5);assert.equal(lowVegetation.userData.approximateTrunks, 0);
  geometry.dispose();individual.dispose();lowVegetation.dispose();
});

test('canopy batching stops before its feature or vertex resource budget', () => {
  const features = Array.from({ length: 10 }, (_, i) => ({ ...crown, id: `tree-${i}` }));
  for (const options of [{ maxFeatures: 2 }, { maxVertices: 100 }]) {
    const geometry = buildCanopyGeometry(features, options);
    assert.ok(geometry.userData.sourceIds.length <= 2);assert.equal(geometry.userData.truncated, true);
    if (options.maxVertices) assert.ok(geometry.attributes.position.count <= options.maxVertices);geometry.dispose();
  }
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, overrides = {}) {
  const scene = new THREE.Scene(), texture = new THREE.Texture(), localTexture = new THREE.Texture();
  const files = new Map([
    ['base', grid({ bounds: bounds(-100, 300, -100, 100), heights: [2, 2, 2, 2], sourceId: 'base-dem' })],
    ['terrain-a', grid({ width: 3, height: 3, heights: Array(9).fill(8), sourceId: 'detail-dem' })],
    ['features-a', { water: [water], canopies: [{ ...crown, individualTree: true }] }],
    ['terrain-b', grid({ bounds: bounds(100, 110, 0, 10), width: 3, height: 3, heights: Array(9).fill(12), sourceId: 'detail-b-dem' })],
    ['features-b', { water: [], canopies: [] }],
  ]);
  const index = { version: 1, origin: { lat: 40.7235, lon: -74.0015 }, baseTerrain: { url: 'base' }, regions: [
    { id: 'a', bounds: bounds(), terrainUrl: 'terrain-a', featuresUrl: 'features-a', blendMargin: 0 },
    { id: 'b', bounds: bounds(100, 110, 0, 10), terrainUrl: 'terrain-b', featuresUrl: 'features-b', blendMargin: 0 },
  ] };
  const requests = [], atlas = { texture, bounds: bounds(-100, 300, -100, 100) };
  const fetcher = async (url, options) => { requests.push({ url, ...options });return { ok: files.has(url), status: files.has(url) ? 200 : 404, json: async () => files.get(url) }; };
  const landscape = new Landscape({ scene, index, orthophoto: atlas, localOrthophoto: { ...atlas, texture: localTexture }, fetcher, radius: 15, ...overrides });
  t.after(() => { landscape.dispose();texture.dispose();localTexture.dispose(); });
  return { landscape, scene, requests, files, texture, localTexture };
}

test('terrain readiness does not claim water coverage while hydrography is missing or loading', async t => {
  const f = fixture(t);f.landscape.index.regions = [];f.landscape.index.baseFeaturesUrl = 'base-water';
  assert.equal(f.landscape.getStatus().baseWaterReady, false);
  await f.landscape.loadBase();
  assert.equal(f.landscape.getStatus().baseReady, true);
  assert.equal(f.landscape.getStatus().baseWaterReady, false);
  assert.match(f.landscape.getStatus().error, /404/);
  assert.equal(f.landscape.contactAt(2, 2), null, 'absence of contacts is not proof of dry land before water is loaded');
  const base = f.landscape.base, groupCount = f.landscape.group.children.length;
  let resolveWater;let waterRequests = 0;
  f.landscape.fetcher = url => {
    assert.equal(url, 'base-water', 'recovery retains the measured DEM');waterRequests++;
    return new Promise(resolve => { resolveWater = resolve; });
  };
  const preparing = f.landscape.prepareAt({ x: 2, z: 2 });
  const loading = f.landscape.loadBase();
  assert.equal(waterRequests, 1, 'simultaneous consumers share the recovery request');
  assert.equal(f.landscape.getStatus().baseWaterReady, false);
  resolveWater({ ok: true, json: async () => ({ version: 1, water: [water], canopies: [] }) });
  await Promise.all([preparing, loading]);
  assert.equal(f.landscape.getStatus().baseWaterReady, true);
  assert.equal(f.landscape.getStatus().error, null);
  assert.equal(f.landscape.base, base);assert.equal(f.landscape.group.children.length, groupCount);
  assert.equal(f.requests.filter(request => request.url === 'base').length, 1);
  assert.equal(f.landscape.contactAt(2, 2).kind, 'water');
  await f.landscape.loadBase();assert.equal(waterRequests, 1, 'successful coverage remains cached');
});

test('malformed water coverage remains retryable and an explicit empty source list is valid', async t => {
  const f = fixture(t);f.landscape.index.regions = [];f.landscape.index.baseFeaturesUrl = 'base-water';
  f.files.set('base-water', { version: 1, canopies: [] });
  await f.landscape.loadBase();
  assert.equal(f.landscape.getStatus().baseReady, true);assert.equal(f.landscape.getStatus().baseWaterReady, false);
  assert.match(f.landscape.getStatus().error, /water coverage/);
  f.files.set('base-water', { version: 1, water: [], canopies: [] });
  await f.landscape.prepareAt({ x: 2, z: 2 });
  assert.equal(f.landscape.getStatus().baseWaterReady, true);assert.equal(f.landscape.getStatus().error, null);
  assert.equal(f.requests.filter(request => request.url === 'base').length, 1);
});

test('an optional canopy error does not invalidate loaded citywide water coverage', async t => {
  const f = fixture(t);f.landscape.index.baseFeaturesUrl = 'base-water';
  f.files.set('base-water', { version: 1, water: [water], canopies: [] });
  await f.landscape.prepareAt({ x: 2, z: 2 });
  f.landscape.cache.get('a').vegetationError = 'Optional crowns unavailable';
  assert.equal(f.landscape.getStatus().failures, 1);assert.equal(f.landscape.getStatus().baseWaterReady, true);
  assert.equal(f.landscape.contactAt(2, 2).kind, 'water');
});

test('preparing a place loads its measured surfaces and exposes source water contacts', async t => {
  const f = fixture(t);const sample = await f.landscape.prepareAt({ x: 2, z: 2 });
  close(sample.elevation, 8);assert.equal(sample.sourceId, 'detail-dem');close(f.landscape.sampleHeight(20, 20), 2);
  close(f.landscape.sampleHeight(999, 999), 0);assert.equal(f.landscape.waterAt(2, 2).sourceId, 'official-hydrography');
  assert.equal(f.landscape.waterAt(5, 5), null);assert.equal(f.landscape.contactAt(-.2, 5, .5).kind, 'water');
  assert.equal(f.landscape.getStatus().baseReady, true);assert.equal(f.landscape.getStatus().canopies, 1);
  assert.deepEqual(f.landscape.getStatus().activeRegions, ['a']);assert.equal(f.landscape.getStatus().failures, 0);
});

test('baked road terrain replaces both overlapping park and city terrain without replacing water', async t => {
  const f = fixture(t);await f.landscape.prepareAt({ x: 2, z: 2 });
  const patch = grid({ bounds: bounds(1, 9, 1, 9), heights: [11, 12, 13, 15], sourceId: 'road-survey' });
  f.landscape.addTerrainOverlay('road', patch);
  const sampled = f.landscape.sampleSurface(5, 5);
  close(sampled.elevation, 12.5);assert.equal(sampled.sourceId, 'road-survey');
  close(f.landscape.sampleHeight(.5, .5), 8, 1e-4);
  assert.equal(f.landscape.base.material.userData.uniforms.landscapeCoverageCount.value, 2);
  const park = f.landscape.cache.get('a');
  assert.equal(park.material.userData.uniforms.landscapeCoverageCount.value, 1);
  assert.deepEqual(park.material.userData.uniforms.landscapeCoverage.value[0].toArray(), [1, 9, 1, 9]);
  assert.equal(f.landscape.contactAt(2, 2).kind, 'water', 'fine ground must not erase official water collision');
  assert.throws(() => f.landscape.addTerrainOverlay('overlap', patch), /overlap/);
  assert.throws(() => f.landscape.addTerrainOverlay('missing', { ...patch, heights: [11, 12, null, 15] }), /missing/);
  let disposed = 0;f.landscape.terrainOverlays.get('road').mesh.geometry.addEventListener('dispose', () => disposed++);
  f.landscape.setLayers({ terrain: false });
  assert.equal(f.landscape.terrainOverlays.get('road').mesh.visible, false);
  close(f.landscape.sampleHeight(5, 5), 12.5, 1e-4);
  f.landscape.setLayers({ terrain: true });f.landscape.removeTerrainOverlay('road');
  assert.equal(disposed, 1);close(f.landscape.sampleHeight(5, 5), 8);
  assert.equal(park.material.userData.uniforms.landscapeCoverageCount.value, 0);
});

test('road patch background remains resident across travel and is released after a failed load', async t => {
  const f = fixture(t, { maxCache: 2 });
  const release = await f.landscape.retainTerrainRegion('a');
  await f.landscape.prepareAt({ x: 105, z: 5 });
  assert.ok(f.landscape.wanted.has('a'));assert.ok(f.landscape.cache.has('a'));
  f.landscape.update({ x: 900, z: 900 }, { overview: true });
  assert.equal(f.landscape.cache.get('a').group.visible, true);
  close(f.landscape.sampleHeight(2, 2), 8);
  release();release();assert.equal(f.landscape.retainedTerrainRegions.size, 0);
  assert.equal(f.landscape.wanted.has('a'), false);
  await assert.rejects(f.landscape.retainTerrainRegion('missing'), /unavailable/);
  f.landscape.cache.delete('b');f.files.delete('terrain-b');
  await assert.rejects(f.landscape.retainTerrainRegion('b'), /404/);
  assert.equal(f.landscape.retainedTerrainRegions.size, 0);
});

test('region replacement releases GPU geometry while keeping borrowed imagery alive', async t => {
  const f = fixture(t, { maxCache: 1 });await f.landscape.prepareAt({ x: 2, z: 2 });
  let released = 0, textureDisposals = 0;
  f.landscape.cache.get('a').group.traverse(object => object.geometry?.addEventListener('dispose', () => released++));
  f.texture.addEventListener('dispose', () => textureDisposals++);f.localTexture.addEventListener('dispose', () => textureDisposals++);
  await f.landscape.prepareAt({ x: 105, z: 5 });assert.equal(f.landscape.cache.size, 1);assert.ok(released >= 3);
  close(f.landscape.sampleHeight(2, 2), 2);close(f.landscape.sampleHeight(105, 5), 12);
  assert.equal(f.landscape.waterAt(2, 2), null);assert.equal(textureDisposals, 0);
  f.landscape.dispose();assert.equal(f.scene.children.length, 0);assert.equal(textureDisposals, 0);
});

test('coarse imagery survives missing local tiles and region coverage updates without recompiling', async t => {
  const f = fixture(t);await f.landscape.prepareAt({ x: 2, z: 2 });
  const material = f.landscape.base.material, version = material.version;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.landscapeCoverageCount.value, 1);
  assert.deepEqual(shader.uniforms.landscapeCoverage.value[0].toArray(), [0, 10, 0, 10]);
  assert.match(shader.fragmentShader, /pixel.a>0.99/);assert.match(shader.fragmentShader, /landscapeCoverage\[i\]/);
  // Near the camera the ground is drawn from the photograph's average, never shown as a smear.
  assert.match(shader.fragmentShader, /textureLod\(landscapeLocal,uv,3\.2\)/);assert.match(shader.fragmentShader, /textureLod\(landscapeLocal,uv,5\.2\)/);
  for (const name of ['paving', 'turf', 'court', 'relit']) assert.match(shader.fragmentShader, new RegExp(`vec3 ${name} = `), name);
  assert.match(shader.fragmentShader, /mix\(relit, drawn, 1\.0 - smoothstep\(150\.0, 480\.0, span\)\)/);
  assert.ok(shader.fragmentShader.indexOf('nycLand(vLandscapeXZ) < 0.5') < shader.fragmentShader.indexOf('vec3 paving = '), 'water is cut away before any ground is drawn');
  const uniform = shader.uniforms.landscapeLocalBounds.value;
  f.landscape.setLocalOrthophoto({ texture: f.localTexture, bounds: bounds(100, 120, -10, 10) });
  assert.equal(shader.uniforms.landscapeLocalBounds.value, uniform);assert.deepEqual(uniform.toArray(), [100, 120, -10, 10]);
  f.landscape.setLocalOrthophoto(null);assert.equal(shader.uniforms.landscapeUseLocal.value, false);assert.equal(shader.uniforms.landscapeUseOrtho.value, true);
  assert.equal(material.version, version);f.landscape.setLayers({ vegetation: false, water: false });
  assert.equal(f.landscape.cache.get('a').vegetation.visible, false);assert.equal(f.landscape.cache.get('a').water.visible, false);
  f.landscape.update({ x: 200, z: 20 });assert.equal(shader.uniforms.landscapeCoverageCount.value, 0);
});

test('failed detail keeps measured base and can retry without retaining an error after success', async t => {
  let time = 0;const f = fixture(t, { now: () => time });const saved = f.files.get('terrain-a');f.files.delete('terrain-a');
  await assert.rejects(f.landscape.prepareAt({ x: 2, z: 2 }), /unavailable/);
  assert.equal(f.landscape.getStatus().failures, 1);close(f.landscape.sampleHeight(2, 2), 2);
  f.files.set('terrain-a', saved);time = 6000;
  f.landscape.update({ x: 2, z: 2 });await settle();await settle();
  close(f.landscape.sampleHeight(2, 2), 8);assert.equal(f.landscape.getStatus().failures, 0);
});

test('late canceled terrain responses cannot attach meshes after travel or disposal', async t => {
  const deferred = new Map();
  const f = fixture(t, { fetcher: (url, options) => new Promise(resolve => deferred.set(url, { resolve, signal: options.signal })) });
  const loadingBase = f.landscape.loadBase();deferred.get('base').resolve({ ok: true, json: async () => grid({ bounds: bounds(-100, 300, -100, 100) }) });await loadingBase;
  f.landscape.update({ x: 2, z: 2 });await settle();
  f.landscape.update({ x: 200, z: 20 });assert.equal(deferred.get('terrain-a').signal.aborted, true);
  deferred.get('terrain-a').resolve({ ok: true, json: async () => grid() });
  deferred.get('features-a').resolve({ ok: true, json: async () => ({ water: [water], canopies: [crown] }) });
  await settle();assert.equal(f.landscape.cache.size, 0);assert.equal(f.landscape.group.children.length, 1);
  f.landscape.dispose();assert.equal(f.scene.children.length, 0);
});

test('accepted AI water masks refine appearance only after an exact source and coordinate match', async t => {
  const f = fixture(t), origin = f.landscape.index.origin;
  const approved = { id: 'review-pond', kind: 'water', sourceId: 'pond', accepted: true,
    localGeometry: { type: 'Polygon', coordinates: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] } };
  const report = { version: 1, origin, features: [approved, { ...approved, id: 'rejected', accepted: false },
    { ...approved, id: 'unmatched', sourceId: 'unknown' }, { ...approved, id: 'canopy', kind: 'canopy' }] };
  const features = reviewedWaterFeatures(report, [water], origin);assert.equal(features.length, 1);close(features[0].elevation, 3.02);
  assert.equal(reviewedWaterFeatures({ ...report, origin: { lat: 0, lon: 0 } }, [water], origin).length, 0);
  f.landscape.setReconstructionReview(report);await f.landscape.prepareAt({ x: 2, z: 2 });
  assert.equal(f.landscape.getStatus().reviewedWaterParts, 1);
  assert.equal(f.landscape.waterAt(8, 8).id, 'pond', 'unseen water remains mapped water');
  assert.equal(f.landscape.waterAt(5, 5), null, 'the official island remains dry');
  assert.equal(f.landscape.contactAt(8, 8, .5).id, 'pond', 'AI coverage never limits collision');
  let disposed = false;f.landscape.cache.get('a').reviewedWater.geometry.addEventListener('dispose', () => disposed = true);
  f.landscape.setReconstructionReview(null);assert.equal(disposed, true);assert.equal(f.landscape.getStatus().reviewedWaterParts, 0);
});

test('vegetation selection follows the camera region instead of truncating source order', async t => {
  const f = fixture(t), far = { ...crown, id: 'far', x: 602, z: 2, polygon: crown.polygon.map(([x, z]) => [x + 600, z]) };
  f.landscape.index.regions[0].bounds = bounds(0, 1000, 0, 1000);
  f.files.set('terrain-a', grid({ bounds: bounds(0, 1000, 0, 1000), width: 3, height: 3, heights: Array(9).fill(8) }));
  f.files.set('features-a', { water: [], canopies: [far, { ...crown, id: 'near', x: 2, z: 2 }] });
  await f.landscape.prepareAt({ x: 2, z: 2 });const entry = f.landscape.cache.get('a'), previous = entry.vegetation.geometry;
  assert.deepEqual(previous.userData.sourceIds, ['near']);assert.equal(f.landscape.getStatus().sourceCanopies, 2);
  f.landscape.update({ x: 80, z: 20 });assert.equal(entry.vegetation.geometry, previous, 'movement inside one cell keeps the existing GPU geometry');
  f.landscape.update({ x: 610, z: 10 });await entry.vegetationTask;
  assert.deepEqual(entry.vegetation.geometry.userData.sourceIds, ['far']);
  f.landscape.update({ x: 610, z: 10 }, { overview: true });assert.equal(entry.vegetation.visible, false);
  assert.equal(f.landscape.getStatus().canopies, 0, 'whole-city overview does not draw thousands of nearby crown meshes');
});

test('fine measured water replaces its coarser level in both graphics and collision', async t => {
  const f = fixture(t);f.landscape.index.baseFeaturesUrl = 'base-water';f.files.set('base-water', { version: 1, water: [{ ...water, elevation: 9 }] });
  await f.landscape.prepareAt({ x: 2, z: 2 });
  assert.equal(f.landscape.base.water.material.userData.coverage.landscapeWaterCoverageCount.value, 1, 'coarse lake plane is masked only under the refined region');
  assert.equal(f.landscape.waterAt(2, 2).elevation, 3);
  f.landscape.update({ x: 200, z: 50 });
  assert.equal(f.landscape.base.water.material.userData.coverage.landscapeWaterCoverageCount.value, 0);assert.equal(f.landscape.waterAt(2, 2).elevation, 9);
});

test('a clipped detail boundary cannot become an invented shoreline', async t => {
  const f = fixture(t), large = { ...water, polygon: [[0, 0], [20, 0], [20, 20], [0, 20]], holes: [], elevation: null };
  f.landscape.index.baseFeaturesUrl = 'base-water';f.files.set('base-water', { version: 1, water: [large] });
  f.files.set('features-a', { water: [{ ...water, holes: [] }], canopies: [] });await f.landscape.prepareAt({ x: 9.8, z: 5 });
  assert.equal(f.landscape.base.water.geometry.attributes.position.count, 0, 'an unmeasured water level never generates a guessed plane');
  const contact = f.landscape.contactAt(9.8, 5, .5);
  close(contact.depth, 5.5);close(contact.nx, 0);close(contact.nz, -1);
  assert.equal(f.landscape.waterAt(15, 5).id, 'pond', 'mapped water still exists beyond the detail boundary');
});

test('travel readiness survives render frames that still follow the previous player location', async t => {
  const deferred = new Map();let fixtureFiles;
  const f = fixture(t, { fetcher: async (url, options) => {
    if (url === 'terrain-b' || url === 'features-b') return new Promise(resolve => deferred.set(url, { resolve, signal: options.signal }));
    return { ok: true, json: async () => fixtureFiles.get(url) };
  } });fixtureFiles = f.files;
  await f.landscape.prepareAt({ x: 2, z: 2 });
  let ready = false;const arriving = f.landscape.prepareAt({ x: 105, z: 5 }).then(sample => { ready = true;return sample; });await settle();
  for (let frame = 0; frame < 5; frame++) f.landscape.update({ x: 2, z: 2 });
  assert.equal(ready, false);assert.equal(deferred.get('terrain-b').signal.aborted, false);
  deferred.get('terrain-b').resolve({ ok: true, json: async () => f.files.get('terrain-b') });
  deferred.get('features-b').resolve({ ok: true, json: async () => f.files.get('features-b') });
  const sample = await arriving;close(sample.elevation, 12);assert.equal(f.landscape.preparing.size, 0);
  assert.ok(f.landscape.cache.has('b'));
});
