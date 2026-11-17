import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { convertRows, convertFeatures, convertTrees, cellQuery, layerQuery, treeQuery, cellBounds, projectPoint, indexPolygon, insideIndexed, signedArea, buildCell, createStreetSource, createStreetscape,
  ROAD_LIFT, SIDEWALK_LIFT, KERB_HEIGHT, DATASETS, LAYERS, PLANIMETRIC_SERVICE, TREE_DATASET, STREET_SERVICE } from '../dist/streetscape.js';
import { worldToGeographic } from '../dist/city-ground.js';
import { Simulation } from '../dist/simulation.js';
import { laneLayout } from '../dist/lanes.js';

const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8'));
const index = read('street-detail-index.json'), roadIndex = read('road-index.json');
const square = (x, z, size) => [[x, z], [x + size, z], [x + size, z + size], [x, z + size]];
const lonLat = (x, z) => { const g = worldToGeographic(x, z); return [g.lon, g.lat]; };
const row = (id, code, ring, extra = {}) => ({ row_id: id, sub_code: String(code), status: 'Unchanged', the_geom: { type: 'MultiPolygon', coordinates: [[ring.map(([x, z]) => lonLat(x, z))]] }, ...extra });

test('open-data rows become surfaces in the game frame; unusable rows are dropped', () => {
  const ring = [...square(100, 200, 20), [100, 200]];
  const surfaces = convertRows('roadbed', [row('row-a', 350000, ring), row('row-b', 350010, ring), row('row-c', 999999, ring), row('row-d', 350000, ring, { status: 'Deleted' }),
    { row_id: 'row-e', sub_code: '350000', the_geom: { type: 'Point', coordinates: [0, 0] } }, row('row-f', 350000, [[100, 200], [100, 200], [100, 200]]), null]);
  assert.deepEqual(surfaces.map(surface => [surface.id, surface.subtype]), [['roadbed:row-a:0', 'roadbed'], ['roadbed:row-b:0', 'intersection']]);
  assert.equal(surfaces[0].polygon.length, 4, 'the closing point is not repeated');
  for (const [i, [x, z]] of surfaces[0].polygon.entries()) assert.ok(Math.hypot(x - ring[i][0], z - ring[i][1]) < .002, 'coordinates survive the round trip to the millimetre');
  assert.equal(convertRows('sidewalk', [row('s', 380010, ring)])[0].subtype, 'interior sidewalk');
  assert.deepEqual(convertRows('unknown', [row('x', 1, ring)]), []);
  // Holes and multi-part outlines are kept.
  const multi = convertRows('sidewalk', [{ row_id: 'm', sub_code: 380000, the_geom: { type: 'MultiPolygon', coordinates: [
    [square(0, 0, 30).map(p => lonLat(...p)), square(10, 10, 5).map(p => lonLat(...p))], [square(100, 0, 10).map(p => lonLat(...p))]] } }]);
  assert.deepEqual(multi.map(surface => [surface.id, surface.holes.length]), [['sidewalk:m:0', 1], ['sidewalk:m:1', 0]]);
});

test('street trees keep their census position, species and trunk size', () => {
  const [lon, lat] = lonLat(250, -40);
  const trees = convertTrees([{ tree_dbh: '12', spc_common: 'London planetree', status: 'Alive', latitude: String(lat), longitude: String(lon) },
    { tree_dbh: '4', spc_common: 'ginkgo', status: 'Dead', latitude: String(lat), longitude: String(lon) }, { status: 'Alive', latitude: 'x', longitude: String(lon) },
    { tree_dbh: '900', status: 'Alive', latitude: String(lat), longitude: String(lon) }]);
  assert.equal(trees.length, 2);
  assert.ok(Math.hypot(trees[0].x - 250, trees[0].z + 40) < .002);
  assert.equal(trees[0].species, 'london planetree'); assert.ok(Math.abs(trees[0].girth - 12 * .0254) < 1e-9);
  assert.equal(trees[1].girth, 1.4, 'an absurd diameter is capped'); assert.equal(trees[1].species, '');
  assert.deepEqual(convertTrees(null), []);
});

test('cell requests ask the city service only for what touches that cell', () => {
  const bounds = cellBounds('2,-8', 500);
  assert.deepEqual(bounds, { minX: 1000, maxX: 1500, minZ: -4000, maxZ: -3500 });
  const url = new URL(cellQuery('roadbed', bounds));
  assert.equal(url.origin + url.pathname, `${STREET_SERVICE}/${DATASETS.roadbed.id}.json`);
  const where = url.searchParams.get('$where'), numbers = where.match(/-?\d+\.\d+/g).map(Number);
  assert.match(where, /^intersects\(the_geom,'POLYGON\(\(/);
  const sw = worldToGeographic(bounds.minX, bounds.maxZ), ne = worldToGeographic(bounds.maxX, bounds.minZ);
  assert.ok(Math.abs(Math.min(...numbers.filter(n => n < 0)) - sw.lon) < 1e-6 && Math.abs(Math.max(...numbers.filter(n => n > 0)) - ne.lat) < 1e-6);
  assert.match(url.searchParams.get('$select'), /the_geom/);
  const trees = new URL(treeQuery(bounds));
  assert.ok(trees.pathname.endsWith(`${TREE_DATASET}.json`)); assert.match(trees.searchParams.get('$where'), /^latitude between .+ and longitude between /);
  assert.deepEqual(projectPoint(-74.0015, 40.7235), [0, 0]);
});

test('indexed outlines answer point tests, holes included', () => {
  const outer = square(0, 0, 40), hole = square(10, 10, 10), indexed = indexPolygon(outer, [hole]);
  assert.equal(insideIndexed(indexed, 5, 5), true); assert.equal(insideIndexed(indexed, 15, 15), false, 'inside the hole');
  assert.equal(insideIndexed(indexed, 45, 5), false); assert.equal(insideIndexed(indexed, 20.5, 39.5), true);
  assert.equal(Math.abs(signedArea(outer)), 1600);
  // Agreement with a plain crossing test on an awkward outline.
  const star = Array.from({ length: 40 }, (_, i) => { const r = i % 2 ? 9 : 30, a = i / 40 * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; }), fast = indexPolygon(star, [], 3);
  const plain = (x, z) => { let inside = false; for (let i = 0, j = star.length - 1; i < star.length; j = i++) { const a = star[i], b = star[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; };
  for (let x = -31; x <= 31; x += 1.7) for (let z = -31; z <= 31; z += 1.3) assert.equal(insideIndexed(fast, x, z), plain(x, z), `${x},${z}`);
});

// A crossroads: two 10 m carriageways meeting in a junction, sidewalks in each corner.
function crossroads() {
  const surfaces = [
    { id: 'j', kind: 'roadbed', subtype: 'intersection', polygon: square(-5, -5, 10), holes: [] },
    { id: 'n', kind: 'roadbed', subtype: 'roadbed', polygon: [[-5, -80], [5, -80], [5, -5], [-5, -5]], holes: [] },
    { id: 's', kind: 'roadbed', subtype: 'roadbed', polygon: [[-5, 5], [5, 5], [5, 80], [-5, 80]], holes: [] },
    { id: 'e', kind: 'roadbed', subtype: 'roadbed', polygon: [[5, -5], [80, -5], [80, 5], [5, 5]], holes: [] },
    { id: 'w', kind: 'roadbed', subtype: 'roadbed', polygon: [[-80, -5], [-5, -5], [-5, 5], [-80, 5]], holes: [] },
    { id: 'walk-ne', kind: 'sidewalk', subtype: 'right-of-way sidewalk', polygon: [[5, -80], [9, -80], [9, -9], [80, -9], [80, -5], [5, -5]], holes: [] },
    { id: 'path', kind: 'sidewalk', subtype: 'interior sidewalk', polygon: square(30, 30, 6), holes: [] },
  ];
  const roads = [
    { id: 'ns', name: 'A ST', points: [[0, -80], [0, 80]], width: 10, oneway: false, kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13 },
    { id: 'ew', name: 'B ST', points: [[-80, 0], [80, 0]], width: 10, oneway: 'yes', kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13 },
  ];
  return { surfaces, roads };
}
const heights = writer => { const set = new Set(); for (let i = 1; i < writer.position.length; i += 3) set.add(Math.round(writer.position[i] * 1000) / 1000); return [...set].sort((a, b) => a - b); };

test('a crossroads is built as lifted asphalt, raised sidewalks with kerbs, and paint', async () => {
  const { surfaces, roads } = crossroads(), built = await buildCell(surfaces, roads, { heightAt: () => 10 });
  assert.equal(built.surfaces, 7);
  assert.deepEqual(heights(built.road), [10 + ROAD_LIFT], 'roadbeds lie one lift above the ground');
  assert.equal(SIDEWALK_LIFT, ROAD_LIFT + KERB_HEIGHT);
  assert.deepEqual(heights(built.walk), [9.97, 10 + ROAD_LIFT, 10 + SIDEWALK_LIFT, 10 + SIDEWALK_LIFT + .004].map(v => Math.round(v * 1000) / 1000),
    'kerb foot, flush path, sidewalk top, kerbstone cap');
  // Every top face looks up.
  const p = built.road.position;
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vz = p[i + 8] - p[i + 2];
    assert.ok(uz * vx - ux * vz > 0, 'asphalt triangles face the sky');
  }
  assert.ok(built.marks.count > 0);
  const paint = [];
  for (let i = 0; i < built.marks.position.length; i += 3) paint.push({ x: built.marks.position[i], z: built.marks.position[i + 2], yellow: built.marks.extra[i] > built.marks.extra[i + 2] * 3 });
  assert.ok(paint.some(mark => mark.yellow && Math.abs(mark.x) < .3 && mark.z < -20), 'a two-way street gets a yellow centre line');
  assert.ok(!paint.some(mark => mark.yellow && Math.abs(mark.z) < .3 && Math.abs(mark.x) > 12), 'a one-way street does not');
  assert.ok(!paint.some(mark => mark.yellow && Math.abs(mark.x) < 8 && Math.abs(mark.z) < 8), 'centre lines stop short of the junction');
  for (const [name, test] of [['north', m => m.z < -5.5 && m.z > -9.5], ['south', m => m.z > 5.5 && m.z < 9.5], ['east', m => m.x > 5.5 && m.x < 9.5], ['west', m => m.x < -5.5 && m.x > -9.5]])
    assert.ok(paint.filter(mark => !mark.yellow && test(mark)).length >= 24, `a ladder crossing spans the ${name} arm`);
  // Stop lines: the one-way street carries traffic east, so only its western arm has one.
  const stop = (test) => paint.filter(mark => !mark.yellow && test(mark)).length;
  assert.ok(stop(m => m.x < -9.9 && m.x > -10.5) > 0, 'traffic arriving from the west stops at a line');
  assert.equal(stop(m => m.x > 9.9 && m.x < 10.5 && Math.abs(m.z) < 4.4), 0, 'the exit arm has none');
  assert.ok(built.grid.find(0, 0).junction && built.grid.find(0, -40).road && built.grid.find(7, -40).raised);
  assert.ok(built.lamps.length >= 1 && built.lamps.every(lamp => lamp.y === 10 + SIDEWALK_LIFT), 'lamps stand on the sidewalk');
  assert.ok(built.lamps.every(lamp => built.grid.find(lamp.x, lamp.z)?.raised && Math.abs(Math.hypot(lamp.nx, lamp.nz) - 1) < 1e-9));
  assert.ok(built.lamps.every(lamp => built.grid.find(lamp.x + lamp.nx * 2, lamp.z + lamp.nz * 2)?.road), 'each lamp reaches out over a carriageway');
});

test('trees come from the census when there is one, and are assumed along kerbs when not', async () => {
  const { surfaces, roads } = crossroads();
  const census = [{ x: 7, z: -40, girth: .3, species: 'ginkgo' }, { x: 0, z: -40, girth: .3, species: 'oak' }, { x: 200, z: 200, girth: .2, species: '' }];
  const counted = await buildCell(surfaces, roads, { heightAt: () => 2, census, bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } });
  assert.deepEqual(counted.trees.map(tree => [tree.species, tree.y]), [['ginkgo', 2 + SIDEWALK_LIFT]], 'a tree in the roadway or outside the cell is not planted');
  const assumed = await buildCell(surfaces, roads, { heightAt: () => 2 });
  assert.ok(assumed.trees.length >= 2 && assumed.trees.length < 20, 'a few trees to a block, not a hedge');
  assert.ok(assumed.trees.every(tree => !assumed.grid.find(tree.x, tree.z)?.road), 'assumed trees stand off the carriageway');
  assert.deepEqual((await buildCell(surfaces, roads, { heightAt: () => 2 })).trees, assumed.trees, 'placement is repeatable');
});

test('roadbeds carried on bridges are left off the ground; sloping ground is followed', async () => {
  const { surfaces } = crossroads();
  const bridge = [{ id: 'b', points: [[0, -80], [0, -5]], width: 10, oneway: false, kind: 'bridge', roadwayType: 3, fromLevel: 17, toLevel: 17 }];
  const built = await buildCell(surfaces, bridge, { heightAt: () => 0 });
  assert.equal(built.grid.find(0, -40), null, 'the northern arm is on a structure');
  assert.ok(built.grid.find(0, 40)?.road);
  // A fold in the ground along x = 0: large triangles must be cut to follow it.
  const fold = (x) => Math.abs(x) * .2, wide = [{ id: 'big', kind: 'roadbed', subtype: 'roadbed', polygon: [[-60, -60], [60, -60], [60, 60], [-60, 60]], holes: [] }];
  const draped = await buildCell(wide, [], { heightAt: fold });
  assert.ok(draped.road.count > 6, 'the square was subdivided');
  const position = draped.road.position;
  for (let i = 0; i < position.length; i += 9) for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
    const mx = (position[i + a] + position[i + b]) / 2, my = (position[i + a + 1] + position[i + b + 1]) / 2;
    assert.ok(Math.abs(my - ROAD_LIFT - fold(mx)) < .2, 'edges stay close to the ground they cover');
  }
});

test('bundled survey cells are used as shipped; elsewhere the live service is asked, then cached', async () => {
  const key = Object.keys(index.cells).find(k => k === '0,0'), requests = [];
  const local = async url => { requests.push(String(url)); return { ok: true, json: async () => read(String(url).replace('./', '')) }; };
  const bundled = createStreetSource({ index, fetcher: local, cacheStorage: null });
  const cell = await bundled.load(key);
  assert.equal(cell.source, 'bundled'); assert.ok(cell.surfaces.length > 50 && cell.surfaces.every(surface => ['roadbed', 'sidewalk', 'parking'].includes(surface.kind)));
  // The bundle never held medians or plazas, so those two are asked of the city; here that fails, and costs nothing.
  assert.equal(requests[0], index.cells[key].url);
  assert.deepEqual(requests.slice(1).map(url => Object.keys(LAYERS).find(kind => url.includes(LAYERS[kind].path))).sort(), ['median', 'plaza']);
  // Offline: nothing outside the bundle, and no request is made.
  const offline = createStreetSource({ index, fetcher: local, cacheStorage: null, live: false });
  assert.equal(offline.has('40,40'), false); assert.deepEqual((await offline.load('40,40')).surfaces, []); assert.equal(await offline.trees('40,40'), null);
  // Live: two outline requests and one for trees, each stored for the next visit.
  const ring = square(20010, 20010, 30), stored = new Map(), asked = [];
  const service = async url => { asked.push(url); const kind = url.includes(DATASETS.roadbed.id) ? 350000 : 380000;
    const body = url.includes(TREE_DATASET) ? [{ tree_dbh: '6', spc_common: 'pin oak', status: 'Alive', latitude: String(lonLat(20020, 20020)[1]), longitude: String(lonLat(20020, 20020)[0]) }] : [row('r', kind, ring)];
    return { ok: true, json: async () => body, clone: () => ({ json: async () => body }) }; };
  const cacheStorage = { open: async () => ({ match: async url => stored.get(url) || null, put: async (url, response) => { stored.set(url, response); } }) };
  const live = createStreetSource({ index, fetcher: service, cacheStorage });
  const fresh = await live.load('40,40'), trees = await live.trees('40,40');
  assert.equal(fresh.source, 'live'); assert.deepEqual(fresh.surfaces.map(surface => surface.kind).sort(), ['roadbed', 'sidewalk']);
  // Roadbeds and sidewalks, then medians, plazas and parking lots, then trees.
  assert.equal(trees.length, 1); assert.equal(asked.length, 6); assert.equal(stored.size, 6);
  assert.equal(asked.filter(url => url.startsWith(PLANIMETRIC_SERVICE)).length, 3);
  await live.load('40,40'); await live.trees('40,40');
  assert.equal(asked.length, 6, 'a second visit is answered from the cache');
  const failing = createStreetSource({ index, fetcher: async () => ({ ok: false, status: 503 }), cacheStorage: null });
  await assert.rejects(failing.load('41,41'), /unavailable \(503\)/);
  assert.equal(await failing.trees('41,41'), null, 'a missing tree census never fails the street');
});

test('a bundled cell that covers only part of its square defers to the city service', async () => {
  // East of the Brooklyn Bridge region, where DUMBO's streets run on: the bundle holds a sliver.
  const partial = '2,4', whole = '0,0';
  assert.ok(index.cells[partial] && index.cells[whole]);
  const shipped = url => ({ ok: true, json: async () => read(String(url).replace('./', '')) });
  const ring = square(1010, 2010, 30), asked = [];
  const service = async url => {
    asked.push(String(url));
    if (String(url).startsWith('./')) return shipped(url);
    const text = String(url), layer = Object.keys(LAYERS).find(kind => text.includes(LAYERS[kind].path));
    // The map service answers in its own shape; an error arrives as an ordinary answer.
    const body = layer === 'median' ? { features: [{ attributes: { OBJECTID: 7, SUB_FEATURE_CODE: 360020, STATUS: 'Unchanged' }, geometry: { rings: [[...square(1100, 2100, 8), [1100, 2100]].map(point => lonLat(...point))] } }] }
      : layer === 'plaza' ? { error: { code: 400, message: 'Invalid query' } }
      : layer ? { features: [] } : [row('r', text.includes(DATASETS.roadbed.id) ? 350000 : 380000, ring)];
    return { ok: true, json: async () => body, clone: () => ({ json: async () => body }) };
  };
  const source = createStreetSource({ index, fetcher: service, cacheStorage: null });
  const cell = await source.load(partial);
  assert.equal(cell.source, 'live');
  assert.deepEqual(cell.surfaces.map(surface => surface.kind).sort(), ['median', 'roadbed', 'sidewalk'], 'a layer that answers with an error is simply absent');
  assert.equal(cell.surfaces.find(surface => surface.kind === 'median').subtype, 'kerbed median');
  assert.ok(asked.length === 5 && asked.every(url => !url.startsWith('./')), 'the shipped sliver is not even requested');
  asked.length = 0;
  const shippedCell = await source.load(whole);
  assert.equal(shippedCell.source, 'bundled');
  assert.equal(asked.filter(url => url.startsWith('./')).length, 1);
  assert.ok(asked.every(url => url.startsWith('./') || url.startsWith(PLANIMETRIC_SERVICE)), 'a cell wholly inside a surveyed region asks the city only for what the bundle lacks');
  assert.ok(shippedCell.surfaces.some(surface => surface.kind === 'median') && !asked.some(url => url.includes(LAYERS.parking.path)));
  // With the service down, or offline, the shipped part is better than bare ground.
  const down = createStreetSource({ index, fetcher: async url => String(url).startsWith('./') ? shipped(url) : { ok: false, status: 503 }, cacheStorage: null });
  assert.equal((await down.load(partial)).source, 'bundled');
  const offline = createStreetSource({ index, fetcher: async url => shipped(url), cacheStorage: null, live: false });
  assert.equal((await offline.load(partial)).source, 'bundled');
  // A cancelled request is not papered over.
  const controller = new AbortController();
  const cancelled = createStreetSource({ index, fetcher: async () => { controller.abort(); throw new Error('aborted'); }, cacheStorage: null });
  await assert.rejects(cancelled.load(partial, controller.signal), /aborted/);
});

test('map-service features become medians, plazas and lots; painted medians and retired features are left out', () => {
  const ring = points => [...points, points[0]].map(point => lonLat(...point));
  const feature = (id, code, rings, status = 'Unchanged') => ({ attributes: { OBJECTID: id, SUB_FEATURE_CODE: code, STATUS: status }, geometry: { rings } });
  const medians = convertFeatures('median', [feature(1, 360020, [ring(square(0, 0, 10))]), feature(2, 360010, [ring(square(20, 0, 10))]), feature(3, 360050, [ring(square(40, 0, 10))]),
    feature(4, 360080, [ring(square(60, 0, 10))], 'Deleted'), feature(5, 999999, [ring(square(80, 0, 10))]), { attributes: { OBJECTID: 6, SUB_FEATURE_CODE: 360020 } }, null]);
  assert.deepEqual(medians.map(surface => [surface.id, surface.kind, surface.subtype]), [['median:1:0', 'median', 'kerbed median'], ['median:3:0', 'median', 'grass median']]);
  assert.equal(medians[0].polygon.length, 4);
  for (const [i, [x, z]] of medians[0].polygon.entries()) assert.ok(Math.hypot(x - square(0, 0, 10)[i][0], z - square(0, 0, 10)[i][1]) < .01);
  // Rings arrive in any order: the hole before its outline, and a second outline after.
  const hole = [...square(110, 10, 5)].reverse();
  const [plaza, second] = convertFeatures('plaza', [feature(9, 600000, [ring(hole), ring(square(100, 0, 30)), ring(square(200, 0, 8))])]);
  assert.deepEqual([plaza.id, plaza.subtype, plaza.holes.length, second.id, second.holes.length], ['plaza:9:0', 'plaza', 1, 'plaza:9:1', 0]);
  assert.ok(Math.abs(Math.abs(signedArea(plaza.polygon)) - 900) < 1 && Math.abs(Math.abs(signedArea(plaza.holes[0])) - 25) < .5);
  assert.equal(convertFeatures('parking', [feature(4, 500000, [ring(square(0, 0, 40))])])[0].subtype, 'parking lot');
  assert.deepEqual(convertFeatures('unknown', [feature(1, 1, [ring(square(0, 0, 4))])]), []); assert.deepEqual(convertFeatures('median', null), []);
  // The request asks one layer for what touches the cell, as west, south, east, north.
  const url = new URL(layerQuery('median', cellBounds('2,-8', 500)));
  assert.ok(url.href.startsWith(`${PLANIMETRIC_SERVICE}/${LAYERS.median.path}/query?`));
  const [west, south, east, north] = url.searchParams.get('geometry').split(',').map(Number);
  assert.ok(west < east && south < north && Math.abs(west - lonLat(1000, -3500)[0]) < 1e-5 && Math.abs(north - lonLat(1000, -4000)[1]) < 1e-5);
  assert.equal(url.searchParams.get('f'), 'json'); assert.equal(url.searchParams.get('outSR'), '4326');
});

test('islands and plazas are raised and kerbed, lots are asphalt, and none of them is a street', async () => {
  const { surfaces, roads } = crossroads();
  // The street east of the junction is widened around an island; a plaza and a lot lie off the street.
  surfaces.push({ id: 'island', kind: 'median', subtype: 'traffic island', polygon: [[20, -1], [50, -1], [50, 1], [20, 1]], holes: [] },
    { id: 'green', kind: 'median', subtype: 'grass median', polygon: [[-60, -1], [-30, -1], [-30, 1], [-60, 1]], holes: [] },
    { id: 'plaza', kind: 'plaza', subtype: 'plaza', polygon: square(12, -40, 20), holes: [] },
    { id: 'lot', kind: 'parking', subtype: 'parking lot', polygon: square(-60, 20, 30), holes: [] });
  const plain = await buildCell(crossroads().surfaces, roads, { heightAt: () => 10 }), built = await buildCell(surfaces, roads, { heightAt: () => 10 });
  assert.equal(built.surfaces, plain.surfaces + 4);
  // The lot joins the asphalt at the road's own height; nothing else in that batch moved.
  assert.deepEqual(heights(built.road), [10 + ROAD_LIFT]);
  assert.ok(built.road.count > plain.road.count);
  const round = value => Math.round(value * 1000) / 1000;
  // The plaza stands back from the street, so it has an edge but no kerbstone.
  assert.deepEqual(heights(built.walk), [9.97, 10 + ROAD_LIFT, 10 + SIDEWALK_LIFT, 10 + SIDEWALK_LIFT + .003, 10 + SIDEWALK_LIFT + .004, 10 + SIDEWALK_LIFT + .006, 10 + SIDEWALK_LIFT + .01].map(round),
    'kerb foot, flush path, sidewalk, plaza, sidewalk kerbstone, island, island kerbstone');
  // Each top is paved as what it is.
  const kinds = new Map();
  for (let i = 0; i < built.walk.position.length; i += 3) {
    const x = built.walk.position[i], y = built.walk.position[i + 1], z = built.walk.position[i + 2], kind = built.walk.extra[i + 2];
    if (kind === 1) continue; // a kerb face reaches the same height as the top it holds up
    if (round(y) === round(10 + SIDEWALK_LIFT + .006)) kinds.set(x < 0 ? 'green' : 'island', kind);
    if (round(y) === round(10 + SIDEWALK_LIFT + .003) && z < -20) kinds.set('plaza', kind);
  }
  assert.deepEqual([kinds.get('island'), kinds.get('green'), kinds.get('plaza')], [0, 5, 4], 'concrete, turf, plaza stone');
  // Underfoot: an island is a step up, a lot is level with the road, and neither is a carriageway.
  const island = built.grid.find(35, 0, entry => entry.raised), lot = built.grid.find(-45, 35);
  assert.ok(island && !island.road && lot && !lot.road && !lot.raised && lot.asphalt);
  assert.ok(built.grid.find(35, 0, entry => entry.road), 'the roadbed still runs under the island');
  // Kerbside life belongs to sidewalks: no lamps, trees or parked cars are added on or beside the new surfaces.
  assert.deepEqual(built.lamps, plain.lamps);
  assert.ok(built.parking.length <= plain.parking.length && built.parking.every(space => plain.parking.some(other => other.id === space.id)));
  assert.ok(!built.parking.some(space => Math.abs(space.z) < 3 && space.x > 18 && space.x < 52), 'nothing parks against the island');
});

test('the streetscape streams cells around the player and reports what it is standing on', async () => {
  const scene = new THREE.Scene(), requests = [];
  const fetcher = async url => { requests.push(String(url)); return { ok: true, json: async () => read(String(url).replace('./', '')) }; };
  const roads = Object.entries(roadIndex.cells).filter(([key]) => key === '0,-1' || key === '0,0').flatMap(([, cell]) => read(cell.url.replace('./', '')).roads);
  let changes = 0;
  const streets = createStreetscape({ scene, index, fetcher, cacheStorage: null, live: false, heightAt: () => 3, roadsFor: async () => roads, onChange: () => changes++ });
  const spawn = { x: 127, z: -83 };
  assert.equal(await streets.prepareAt(spawn, 20000), true);
  const status = streets.getStatus();
  assert.ok(status.cells >= 4 && status.surfaces > 200 && status.lamps > 50 && status.trees > 20 && status.failures === 0, JSON.stringify(status));
  assert.equal(status.censusTrees, false, 'offline, trees are assumed, and said to be');
  assert.ok(changes >= status.cells);
  // The spawn point is on Greene Street's carriageway.
  assert.equal(streets.surfaceAt(spawn.x, spawn.z), 'road'); assert.equal(streets.offsetAt(spawn.x, spawn.z), ROAD_LIFT);
  const lamp = streets.lamps()[0];
  assert.equal(streets.surfaceAt(lamp.x, lamp.z), 'sidewalk'); assert.equal(streets.offsetAt(lamp.x, lamp.z), SIDEWALK_LIFT);
  assert.equal(streets.offsetAt(90000, 90000), 0);
  assert.equal(streets.lamps(), streets.lamps(), 'the lamp list is stable until cells change');
  const group = scene.getObjectByName('Street surfaces');
  assert.ok(group.children.length >= status.cells * 2 && group.children.every(mesh => mesh.geometry.attributes.position.count > 0));
  // Each outline is built by exactly one cell.
  const before = requests.length;
  streets.update(spawn); streets.update({ x: spawn.x + 5, z: spawn.z });
  assert.equal(requests.length, before, 'small moves ask for nothing new');
  streets.update(spawn, { overview: true });
  assert.equal(group.visible, false);
  streets.setGroundReplacementBounds({ minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 });
  streets.update(spawn);
  for (let i = 0; i < 400 && (streets.getStatus().loading || streets.getStatus().surfaces); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(streets.getStatus().surfaces, 0, 'a rectangle handed to another renderer is left empty');
  streets.dispose();
  assert.equal(scene.getObjectByName('Street surfaces'), undefined);
});

test('kerbside parking is offered only clear of the traffic lane, corners and crossings', async () => {
  const { surfaces, roads } = crossroads();
  // Sidewalks on both sides of the one-way street east of the junction.
  surfaces.push({ id: 'walk-se', kind: 'sidewalk', subtype: 'right-of-way sidewalk', polygon: [[5, 5], [80, 5], [80, 9], [5, 9]], holes: [] });
  const built = await buildCell(surfaces, roads, { heightAt: () => 0 });
  assert.ok(built.parking.length >= 6, `${built.parking.length} spaces`);
  for (const space of built.parking) {
    assert.match(space.id, /^kerb:-?\d+:-?\d+$/);
    assert.ok(built.grid.find(space.x, space.z)?.road && !built.grid.find(space.x, space.z).junction, 'a space is on the carriageway');
    // Traffic on B Street runs east in the lane south of the centreline, so only the north kerb is free.
    assert.ok(space.z < -3 && space.z > -4.2 && space.x > 14, `space at ${space.x.toFixed(1)}, ${space.z.toFixed(1)}`);
    assert.ok(Math.abs(Math.sin(space.angle) - 1) < 1e-9, 'cars park facing the way the street runs');
  }
  const xs = built.parking.map(space => space.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 5.6, 'a car\'s length apart');
  for (const space of built.parking) assert.ok(space.fill >= 0 && space.fill < 1, 'each space has its place in the order of filling');
  assert.equal(new Set(built.parking.map(space => space.id)).size, built.parking.length);
  // The two-way street is too narrow to park beside its lanes.
  assert.ok(!built.parking.some(space => Math.abs(space.x) < 5));
});

test('a street wide enough for several lanes has parked cars at both kerbs, clear of the lane beside them', async () => {
  // Fourteen metres, one way: traffic runs three abreast between the parking lanes.
  const surfaces = [
    { id: 'road', kind: 'roadbed', subtype: 'roadbed', polygon: [[-90, -7], [90, -7], [90, 7], [-90, 7]], holes: [] },
    { id: 'north', kind: 'sidewalk', subtype: 'right-of-way sidewalk', polygon: [[-90, -11], [90, -11], [90, -7], [-90, -7]], holes: [] },
    { id: 'south', kind: 'sidewalk', subtype: 'right-of-way sidewalk', polygon: [[-90, 7], [90, 7], [90, 11], [-90, 11]], holes: [] },
  ];
  const avenue = { id: 'ave', name: 'BROOME ST', points: [[-90, 0], [90, 0]], width: 14, oneway: 'yes', kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13 };
  const layout = laneLayout(14, true);
  assert.ok(layout.driven && layout.count === 3);
  const built = await buildCell(surfaces, [avenue], { heightAt: () => 0 });
  const north = built.parking.filter(space => space.z < 0), south = built.parking.filter(space => space.z > 0);
  assert.ok(north.length >= 12 && south.length >= 12, `${north.length} spaces on one kerb, ${south.length} on the other`);
  for (const space of built.parking) {
    assert.ok(Math.abs(Math.abs(space.z) - (7 - 1.28)) < .05, 'a car\'s half width and a little from the kerb');
    assert.ok(Math.abs(space.z) - layout.first >= 2.1, 'and clear of the file in the lane beside it');
    assert.ok(Math.abs(Math.sin(space.angle) - 1) < 1e-9, 'facing the way the street runs');
  }
  // Carrying traffic both ways it has a single file each way, with room to park beside each.
  const twoWay = await buildCell(surfaces, [{ ...avenue, oneway: false }], { heightAt: () => 0 });
  assert.equal(laneLayout(14, false).driven, false);
  assert.ok(twoWay.parking.filter(space => space.z < 0).length >= 12 && twoWay.parking.filter(space => space.z > 0).length >= 12);
  // Where the roadway is a metre narrower than the street is said to be, no car is parked in what is a moving lane.
  const pinched = surfaces.map(surface => surface.id === 'road' ? { ...surface, polygon: [[-90, -6.4], [90, -6.4], [90, 6.4], [-90, 6.4]] } : surface);
  assert.equal((await buildCell(pinched, [avenue], { heightAt: () => 0 })).parking.length, 0, 'no car is parked where it would stand in a moving lane');
});

test('in surveyed SoHo the kerbs fill with parked cars and traffic passes them untouched', async () => {
  const roads = new Map();
  for (const key of ['0,0', '-1,0', '0,-1', '-1,-1']) for (const road of read(roadIndex.cells[key].url.replace('./', '')).roads) roads.set(road.id, road);
  const spaces = [];
  for (const key of ['0,0', '-1,-1', '-1,0', '0,-1']) {
    const built = await buildCell(read(index.cells[key].url.replace('./', '')).surfaces.filter(surface => surface.kind === 'roadbed' || surface.kind === 'sidewalk'), [...roads.values()], { heightAt: () => 0, bounds: cellBounds(key, 500), census: [] });
    spaces.push(...built.parking);
  }
  assert.ok(spaces.length > 1200, `${spaces.length} spaces around the SoHo crossroads`);
  // No two spaces overlap, within a cell or across the seams between cells.
  const cells = new Map();
  for (const space of spaces) { const key = `${Math.floor(space.x / 8)},${Math.floor(space.z / 8)}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(space); }
  for (const space of spaces) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const other of cells.get(`${Math.floor(space.x / 8) + dx},${Math.floor(space.z / 8) + dz}`) || []) {
    if (other !== space) assert.ok(Math.hypot(other.x - space.x, other.z - space.z) > 3.9, `spaces ${space.id} and ${other.id} overlap`);
  }
  const spawn = { x: 60, z: 60, angle: 0 };
  const local = [...roads.values()].filter(road => road.points.some(point => Math.hypot(point[0] - spawn.x, point[1] - spawn.z) < 420));
  const city = () => ({ bounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 }, roads: local, buildings: [], spawn, missionPoints: [{ x: 60, z: 200, name: 'Spring Street' }] });
  const run = parked => {
    const sim = new Simulation(city());
    const placed = parked ? sim.syncParkedCars(spaces.filter(space => space.fill < .72 && Math.hypot(space.x - spawn.x, space.z - spawn.z) < 150)) : 0;
    for (let i = 0; i < 60 * 45; i++) sim.step({}, 1 / 60);
    const traffic = sim.cars.filter(car => !car._kerb);
    for (const car of traffic) assert.equal(sim._nearCar(car.x, car.z, .92, car.id), null, `${car.id} is clear of every other car`);
    return { placed, traffic: traffic.map(car => [car.id, +car.x.toFixed(3), +car.z.toFixed(3)]) };
  };
  const empty = run(false), lined = run(true);
  assert.ok(lined.placed > 60, `${lined.placed} cars parked within 150 m`);
  assert.deepEqual(lined.traffic, empty.traffic, 'forty-five seconds of traffic is the same with the kerbs full');
});
