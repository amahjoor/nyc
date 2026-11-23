import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BODIES, catalogVehicles, createFleet, drawVehicle, drawTaxi, drawPaint, vehicleName } from '../dist/fleet.js';
import { createVehicleMeshLibrary, decodeVehicleMesh } from '../dist/vehicle-assets.js';
import { createCar, createDistantTraffic, createParkedCars } from '../dist/world.js';
import { Simulation } from '../dist/simulation.js';
import { designFor, DESIGNED } from '../dist/vehicle-designs.js';
import { generateVehicle, designWheels, GENERATED_SHAPES } from '../dist/vehicle-generator.js';

const bytes = file => readFileSync(new URL('../dist/' + file, import.meta.url));
const json = file => JSON.parse(bytes(file));
const bufferFor = file => Uint8Array.from(bytes(file)).buffer;
const data = json('vehicle-catalog.json'), art = json('assets/vehicles/index.json').models;
const base = json('fleet.json');
const recipes = JSON.parse(readFileSync(new URL('../data/vehicle-models.json', import.meta.url)));
const nextTick = () => new Promise(resolve => setImmediate(resolve));

test('city and ZIP registration weights conserve named and unnamed passenger cars', () => {
  const variants = catalogVehicles(data, art);
  const city = new Map(), localTotals = new Map();
  function add(pairs, tally) {
    assert.equal(pairs.length % 2, 0);
    for (let i = 0; i < pairs.length; i += 2) {
      const id = pairs[i], count = pairs[i + 1];
      assert.ok(Number.isInteger(id) && id >= -data.fallbacks.length && id < variants.length);
      assert.ok(Number.isInteger(count) && count > 0);
      tally.set(id, (tally.get(id) || 0) + count);
    }
  }
  add(data.city, city);
  assert.equal([...city.values()].reduce((a, b) => a + b, 0), data.registrations);
  assert.equal(variants.reduce((sum, v, i) => sum + city.get(i), 0), data.represented);
  assert.ok(data.represented < data.registrations);
  for (const [zip] of base.zips) {
    if (data.zips[zip]) add(data.zips[zip], localTotals);
  }
  for (const [id, count] of localTotals) assert.ok(count <= city.get(id));
  assert.ok(variants.every(v => v.make && v.model && Number.isInteger(v.year) && BODIES.includes(v.shape)));
  assert.deepEqual(new Set(variants.flatMap(v => v.asset ? [v.asset.id] : [])), new Set(art.map(a => a.id)));
  for (const v of variants) {
    const matches = art.filter(a => v.make === a.make && v.model === a.model && v.shape === a.shape && v.year >= a.years[0] && v.year <= a.years[1]);
    assert.ok(matches.length <= 1);
    assert.equal(v.asset, matches[0] || null);
  }
});

test('each car draws one registered model year at its own ZIP and retains it after driving away', () => {
  const counts = { version: 1, variants: [['Honda', 'Accord', 2018, 'sedan'], ['Nissan', 'Rogue', 2024, 'suv']],
    fallbacks: ['hatch'], city: [-1, 200, 0, 400, 1, 600], zips: { '10001': [0, 400], '10002': [1, 600], '10003': [-1, 100] } };
  const zips = [['10001', -120, 0], ['10002', 120, 0], ['10003', 0, 250]].map(z => [...z, 500, base.city.bodies]);
  const fleet = createFleet({ ...base, zips }, counts, art);
  const left = fleet.at(-120, 0), right = fleet.at(120, 0), small = fleet.at(0, 250);
  assert.ok(drawVehicle(left, .4).identity.asset);
  assert.equal(drawVehicle(right, .4).identity.asset, null, 'a 2024 Rogue never gets the older body');
  assert.equal(drawVehicle(right, 0, true).identity, null, 'work traffic still shares the road');
  assert.deepEqual(drawVehicle(small, .1), { shape: 'hatch', identity: null });
  assert.equal(drawVehicle(small, .99).identity.year, 2024, 'a small ZIP also draws from citywide counts');
  const sim = new Simulation({ bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }, buildings: [], roads: [], spawn: { x: 0, z: 0, angle: 0 }, missionPoints: [] });
  const spaces = [{ id: 'left', x: -120, z: 0, angle: 0 }, { id: 'right', x: 120, z: 0, angle: 0 }];
  sim.syncParkedCars(spaces); sim.setFleet(fleet);
  const car = id => sim.cars.find(c => c.id === id);
  assert.equal(vehicleName(car('left').identity), '2018 Honda Accord');
  assert.equal(vehicleName(car('right').identity), '2024 Nissan Rogue');
  const paint = car('left').color;
  sim.syncParkedCars([]); sim.syncParkedCars(spaces);
  assert.equal(car('left').color, paint);
  const identity = car('left').identity;
  Object.assign(sim.player, { x: -120, z: 2, y: car('left').y });
  sim.interact();
  assert.equal(sim.player.vehicleId, 'left');
  sim.syncParkedCars([]); car('left').x = 120; sim.setFleet(createFleet({ ...base, zips }, counts, art));
  assert.equal(car('left').identity, identity);
  sim.setTraffic({ taxis: 1 });
  const recycled = { id: 'traffic-used', type: 'sedan', identity, shape: 'sedan', x: -120, z: 0 };
  sim._styleTraffic(recycled);
  assert.equal(recycled.type, 'taxi'); assert.equal(recycled.identity, null); assert.equal(recycled.shape, undefined);
});

test('every local exterior decodes to paintable panels, forward and rear lamps and real wheel positions', () => {
  assert.deepEqual(art.map(m => m.id), recipes.map(m => m.id));
  for (const spec of art) {
    const buffer = bufferFor(spec.url), mesh = decodeVehicleMesh(buffer, spec);
    assert.equal(createHash('sha256').update(new Uint8Array(buffer)).digest('hex'), spec.sha256);
    const header = new DataView(buffer), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, header.getUint32(12, true))));
    for (const field of ['title', 'author', 'license', 'source', 'licenseUrl']) assert.equal(meta.asset.extras[field], spec[field]);
    assert.ok(meta.asset.extras.changes);
    assert.equal((mesh.body.index.count + mesh.lamps.index.count) / 3, spec.triangles);
    assert.ok(spec.triangles > 500 && spec.triangles <= (meta.meshes[0].primitives[0].attributes.COLOR_0 === undefined ? 7000 : 14000));
    const pos = mesh.body.getAttribute('position'), finish = mesh.body.getAttribute('aFinish');
    assert.ok(pos.array.every(Number.isFinite) && mesh.body.getAttribute('normal').array.every(Number.isFinite));
    assert.equal(finish.count, pos.count); assert.ok(finish.array.includes(1));
    for (const primitive of [mesh.body, mesh.lamps]) assert.ok(primitive.index.array.every(i => i < pos.count));
    const z = [...mesh.lamps.index.array].map(i => pos.getZ(i));
    assert.ok(Math.max(...z) > 1.6 && Math.min(...z) < -1.6, spec.id);
    const w = spec.wheels;
    assert.ok(w.front > 1 && w.rear < -1 && w.x > .65 && w.x < 1 && w.radius > .25 && w.radius < .45, spec.id);
  }
});

test('the imported Accord has transparent sightlines through its sloping glass', () => {
  const spec = art.find(model=>model.id==='honda-accord-2018');
  const car = createCar({model:decodeVehicleMesh(bufferFor(spec.url),spec)});
  car.updateMatrixWorld(true);
  const {pieces} = car.userData.detail;
  for (const [z,name] of [[1,'windshield'],[-1,'rearGlass']]) {
    for (const x of [-.25,0,.25]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x,1.21,0),new THREE.Vector3(0,0,z));
      const hit = ray.intersectObjects(Object.values(pieces),false)[0];
      assert.equal(hit?.object,pieces[name]);
    }
  }
});

test('a stationary car updates as its shared exterior arrives, moves between detail levels and takes a respray', async () => {
  const asset = art[0], identity = { asset }, color = '#234567';
  let loads = 0;
  const library = createVehicleMeshLibrary(async url => { loads++; return bufferFor(url); });
  const parked = createParkedCars({ capacity: 1, library }), distant = createDistantTraffic({ capacity: 1, library });
  const car = { id: 'same-space', type: 'sedan', shape: asset.shape, color, identity, x: 0, z: 0, _kerb: true };
  parked.update([car]); distant.update([car]);
  assert.equal(loads, 1);
  await nextTick();
  const mesh = library.get(asset);
  assert.ok(mesh); assert.equal(parked.update([car]), true); assert.equal(distant.update([car]), true);
  const parkedMesh = parked.group.getObjectByName('Parked ' + asset.id + ' bodies');
  assert.equal(parkedMesh.count, 1);
  assert.equal(distant.group.getObjectByName('Distant ' + asset.id + ' bodies').count, 1);
  assert.equal(parked.update([car]), false);
  const tint = parkedMesh.geometry.getAttribute('aPaint'), before = tint.getX(0);
  car.color = '#fafafa'; assert.equal(parked.update([car]), true); assert.ok(tint.getX(0) > before);
  car.controlled = true; parked.update([car]); assert.equal(parked.count, 0);
  const driven = createCar({ color: car.color, shape: car.shape, model: mesh });
  assert.equal(driven.getObjectByName('Car body').geometry.attributes.position, mesh.body.attributes.position, 'close-up panels retain the registered exterior vertices');
  assert.equal(driven.userData.wheels[1].position.z, asset.wheels.front); assert.equal(loads, 1);
  const offline = createVehicleMeshLibrary(async () => { throw Error('offline'); });
  assert.equal(offline.get(asset), null); await nextTick(); assert.equal(offline.get(asset), null);
  parked.dispose(); distant.dispose();
});

test('every intact car pane shares one tint at every detail level', () => {
  const models = [null, generateVehicle(designFor('Toyota', 'RAV4', 2021, 'suv')), decodeVehicleMesh(bufferFor(art[0].url), art[0])];
  const triangles = meshes => meshes.flatMap(mesh => {
    const indices = mesh.geometry.index.array, faces = [];
    for (let i = 0; i < indices.length; i += 3) faces.push(`${indices[i]},${indices[i + 1]},${indices[i + 2]}`);
    return faces;
  }).sort();
  for (const model of models) {
    const car = { id: 'space', type: 'sedan', shape: 'sedan', color: '#ab4341', x: 0, z: 0, _kerb: true, identity: { asset: model } };
    const near = createCar({ ...car, seed: car.id, model }), panels = Object.values(near.userData.detail.pieces);
    const { windshield, rearGlass } = near.userData.detail.pieces;
    const material = windshield.material, closePanes = panels.filter(mesh => mesh.material.transparent);
    assert.equal(rearGlass.material, material);
    assert.ok(closePanes.length >= 4 && closePanes.every(mesh => mesh.material === material));
    assert.ok(material.transparent && !material.depthWrite);
    for (const createSet of [createParkedCars, createDistantTraffic]) {
      const batch = createSet({ capacity: 1, library: { get: () => model } });
      batch.update([car]);
      const visible = batch.group.children.filter(mesh => mesh.count > 0);
      const body = visible.find(mesh => mesh.name.endsWith(' bodies'));
      assert.deepEqual(triangles([body]), triangles(panels.filter(mesh => !mesh.material.transparent)));
      const panes = visible.filter(mesh => mesh.material === material);
      assert.equal(panes.length, 1);
      assert.ok(!panes[0].castShadow && panes[0].instanceMatrix === body.instanceMatrix);
      assert.deepEqual(triangles(panes), triangles(closePanes));
      assert.equal(visible.find(mesh => mesh.name.endsWith('Cabin upholstery')).count, 1);
      assert.ok(!visible.some(mesh => mesh.name.endsWith('Seated driver')));
      batch.dispose();
    }
  }
});

test('every named registration without an imported exterior gets one the game draws, an imported one first', () => {
  const plain = catalogVehicles(data, art), drawn = catalogVehicles(data, art, designFor);
  assert.ok(drawn.every(v => v.asset));
  const specs = new Map();
  drawn.forEach((v, i) => {
    if (plain[i].asset) { assert.equal(v.asset, plain[i].asset); return; }
    const spec = v.asset;
    assert.ok(spec.generated && spec.design && spec.make === v.make && spec.model === v.model);
    assert.equal(designFor(v.make, v.model, v.year, v.shape), spec, 'the same car is the same design, whoever asks');
    if (spec.known) assert.ok(v.year >= spec.years[0] - 3 && v.year <= spec.years[1] + 3, `${vehicleName(v)} is drawn as its ${spec.years.join('–')} generation`);
    specs.set(spec.id, spec);
  });
  assert.ok(specs.size > 800, 'a generation of a model is its own exterior');
  for (const spec of specs.values()) {
    const { L, W, H, WB, shape } = spec.design, w = spec.wheels;
    assert.ok(GENERATED_SHAPES.includes(shape), spec.id);
    assert.ok(L > 2.5 && L < 6.6 && W > 1.5 && W < 2.2 && H > 1.15 && H < 2.7 && WB > 1.8 && WB < L - .7, spec.id);
    assert.deepEqual(w, designWheels(spec.design));
    assert.ok(w.front < L / 2 - .4 && w.rear > -L / 2 + .4 && Math.abs(w.front - w.rear - WB) < .001 && w.x < W / 2 && w.x > W / 2 - .2 && w.radius > .26 && w.radius < .44, spec.id);
  }
  // The registered cars with a row of their own, by weight.
  const count = new Map(); let known = 0, named = 0;
  for (let i = 0; i < data.city.length; i += 2) if (data.city[i] >= 0) count.set(data.city[i], data.city[i + 1]);
  drawn.forEach((v, i) => { named += count.get(i); if (!v.asset.generated || v.asset.known) known += count.get(i); });
  assert.ok(known / named > .95, `${(known / named * 100).toFixed(1)}% of named cars have their generation's own dimensions`);
  for (const { make, model, generations } of DESIGNED) for (const [k, [from, to]] of generations.entries()) {
    assert.ok(from <= to, `${make} ${model}`);
    if (k) assert.ok(from > generations[k - 1][1], `${make} ${model} generations do not overlap`);
  }
});

test('a drawn exterior is a closed, paintable car of its published size with lamps at both ends', () => {
  const picks = [['Honda', 'CR-V', 2018, 'suv'], ['Toyota', 'Camry', 2019, 'sedan'], ['Honda', 'Civic', 2019, 'hatch'], ['Ford', 'F-150', 2018, 'pickup'], ['Ford', 'Transit', 2019, 'van'], ['Toyota', 'Sienna', 2015, 'minivan'],
    ['Jeep', 'Wrangler', 2019, 'suv'], ['BMW', '330i', 2020, 'sedan'], ['Ford', 'Mustang', 2016, 'coupe'], ['Subaru', 'Outback', 2021, 'suv'], ['Tesla', 'Model Y', 2023, 'suv'], ['MINI', 'Hardtop', 2016, 'hatch'], ['Nobody', 'Makes This', 2011, 'wagon']];
  const seen = new Set();
  for (const [make, model, year, shape] of picks) {
    const spec = designFor(make, model, year, shape), mesh = generateVehicle(spec), { L, W, H } = spec.design;
    assert.equal(mesh.id, spec.id); assert.deepEqual(mesh.wheels, spec.wheels);
    const pos = mesh.body.getAttribute('position'), finish = mesh.body.getAttribute('aFinish'), weight = mesh.body.getAttribute('aPaintWeight');
    for (const g of [mesh.body, mesh.lamps]) {
      assert.ok(g.getAttribute('position').array.every(Number.isFinite) && g.getAttribute('normal').array.every(Number.isFinite), spec.id);
      assert.ok(g.index.count % 3 === 0 && g.index.array.every(i => i < g.getAttribute('position').count));
      for (let i = 0; i < g.getAttribute('normal').count; i++) assert.ok(Math.abs(Math.hypot(g.getAttribute('normal').getX(i), g.getAttribute('normal').getY(i), g.getAttribute('normal').getZ(i)) - 1) < .02, spec.id);
    }
    const triangles = (mesh.body.index.count + mesh.lamps.index.count) / 3;
    assert.ok(triangles > 3000 && triangles < 9000, `${spec.id}: ${triangles} triangles`);
    assert.equal(finish.count, pos.count); assert.equal(weight.count, pos.count);
    const painted = weight.array.reduce((n, v) => n + v, 0) / weight.count;
    assert.ok(painted > .3 && painted < .8, `${spec.id}: ${painted} of its vertices take the paint`);
    mesh.body.computeBoundingBox();
    const box = mesh.body.boundingBox;
    assert.ok(Math.abs(box.max.z - box.min.z - L) < .06 && Math.abs(box.max.z + box.min.z) < .06, `${spec.id} is ${L} m long and centred`);
    assert.ok(box.max.y > H - .02 && box.max.y < H + .08 && box.min.y > .1 && box.min.y < .3, `${spec.id} is ${H} m tall and clear of the road`);
    // Mirrors stand out from a body exactly as wide as the car.
    assert.ok(box.max.x > W / 2 && box.max.x < W / 2 + .25 && Math.abs(box.max.x + box.min.x) < .001, spec.id);
    const lamps = mesh.lamps.getAttribute('position'), z = [...lamps.array].filter((_, i) => i % 3 === 2), colour = mesh.lamps.getAttribute('color');
    assert.ok(Math.max(...z) > L / 2 - .5 && Math.min(...z) < -L / 2 + .5, spec.id);
    for (let i = 0; i < lamps.count; i++) if (lamps.getZ(i) < 0) assert.ok(colour.getX(i) > colour.getZ(i) * 3, `${spec.id} shows red behind`);
    seen.add(JSON.stringify([...pos.array.slice(0, 600)].map(v => Math.round(v * 100))));
  }
  assert.equal(seen.size, picks.length, 'no two are the same car');
  assert.notEqual(designFor('Honda', 'CR-V', 2018, 'suv'), designFor('Honda', 'CR-V', 2024, 'suv'));
  assert.equal(designFor('BMW', '330i', 2020, 'sedan').design.L, designFor('BMW', '328i', 2019, 'sedan').design.L, 'both badges are one 3 Series');
});

test('a drawn exterior is built off the frame, then shared by the kerb, the traffic and the driver', async () => {
  const spec = designFor('Toyota', 'RAV4', 2021, 'suv'), other = designFor('Honda', 'Pilot', 2019, 'suv');
  let builds = 0;
  const library = createVehicleMeshLibrary(async () => { throw Error('no file is fetched for a drawn exterior'); }, s => { builds++; return generateVehicle(s); });
  const parked = createParkedCars({ capacity: 2, library });
  const car = { id: 'kerb', type: 'sedan', shape: 'suv', color: '#234567', identity: { asset: spec }, x: 0, z: 0, _kerb: true };
  const next = { ...car, id: 'kerb-2', identity: { asset: other }, x: 6 };
  assert.equal(library.get(spec), null); assert.equal(library.get(other), null); assert.equal(builds, 0, 'nothing is built in the asking frame');
  parked.update([car, next]);
  assert.equal(parked.group.getObjectByName('Parked suv bodies').count, 2, 'both wear the shared body meanwhile');
  await new Promise(resolve => setTimeout(resolve, 5));
  await new Promise(resolve => setTimeout(resolve, 5));
  const mesh = library.get(spec);
  assert.ok(mesh && library.get(other)); assert.equal(builds, 2); assert.equal(library.get(spec), mesh);
  assert.equal(parked.update([car, next]), true);
  const body = parked.group.getObjectByName('Parked ' + spec.id + ' bodies');
  assert.equal(body.count, 1); assert.equal(parked.group.getObjectByName('Parked suv bodies').count, 0);
  assert.equal(body.geometry.getAttribute('position'), mesh.body.getAttribute('position'), 'the set shares the vertices and adds only its paint');
  assert.ok(body.geometry.getAttribute('aPaint') && !mesh.body.getAttribute('aPaint'));
  const driven = createCar({ color: car.color, shape: car.shape, model: mesh });
  assert.equal(driven.getObjectByName('Car body').geometry.attributes.position, mesh.body.attributes.position, 'close-up panels retain the registered exterior vertices');
  assert.equal(driven.userData.wheels[1].position.z, spec.wheels.front);
  parked.dispose();
});

test('every drawn exterior has a windscreen widest at its foot and a window in its tail, however upright', () => {
  const specs = new Map();
  for (const [make, model, year, shape] of data.variants) { const spec = designFor(make, model, year, shape); specs.set(spec.id, spec); }
  const sample = [...specs.values()].filter((spec, i) => i % 7 === 0 || /wrangler|g-class|transit|sienna|express|soul|defender/.test(spec.id));
  sample.push(designFor('Ford', 'Transit', 2019, 'van', 'cargo'), designFor('Nissan', 'NV200', 2016, 'van', 'taxi'));
  assert.ok(sample.length > 130);
  for (const spec of sample) {
    const mesh = generateVehicle(spec), pos = mesh.body.getAttribute('position'), normal = mesh.body.getAttribute('normal'), finish = mesh.body.getAttribute('aFinish');
    const ahead = [], behind = [];
    // Glass is the one finish this smooth and this reflective.
    for (let i = 0; i < pos.count; i++) if (Math.abs(finish.getX(i) - .06) < .001 && Math.abs(finish.getY(i) - .9) < .001) {
      if (normal.getZ(i) > .25) ahead.push([Math.abs(pos.getX(i)), pos.getY(i)]);
      // A fastback's rear window lies nearly flat; it still faces backwards, behind the middle of the car.
      if (normal.getZ(i) < -.12 && pos.getZ(i) < -.2) behind.push([Math.abs(pos.getX(i)), pos.getY(i)]);
    }
    assert.ok(ahead.length > 12, `${spec.id} has a windscreen`);
    const low = Math.min(...ahead.map(p => p[1])), high = Math.max(...ahead.map(p => p[1])), widest = (list, from, to) => Math.max(...list.filter(p => p[1] >= from && p[1] <= to).map(p => p[0]));
    const foot = widest(ahead, low, low + (high - low) * .25), head = widest(ahead, high - (high - low) * .25, high);
    assert.ok(high - low > .3 && foot >= head - .005 && foot > spec.design.W / 2 * .68, `${spec.id}: its windscreen is ${foot.toFixed(2)} m to a side at the foot and ${head.toFixed(2)} at the roof`);
    assert.ok(behind.length >= 4, `${spec.id} has a rear window`);
    const span = Math.max(...behind.map(p => p[1])) - Math.min(...behind.map(p => p[1]));
    assert.ok(span > .12 && Math.max(...behind.map(p => p[0])) > spec.design.W / 2 * (spec.design.cargo ? .4 : .5), `${spec.id}: its rear window is ${span.toFixed(2)} m tall`);
  }
  // A van carries people unless it is registered to a trade: then nothing is glazed behind the cab.
  const side = spec => { const m = generateVehicle(spec), p = m.body.getAttribute('position'), n = m.body.getAttribute('normal'), f = m.body.getAttribute('aFinish'); let rear = 0; for (let i = 0; i < p.count; i++) if (Math.abs(f.getX(i) - .06) < .001 && Math.abs(n.getX(i)) > .7 && p.getZ(i) < -.6) rear++; return rear; };
  assert.ok(side(designFor('Ford', 'Transit', 2019, 'van')) > 8); assert.equal(side(designFor('Ford', 'Transit', 2019, 'van', 'cargo')), 0);
});

test('cabs, patrol cars and working vans are the models the city licenses and registers', () => {
  const working = json('working-vehicles.json');
  assert.equal(working.version, 1); assert.ok(working.decoder.decoder_version);
  for (const [name, least] of [['taxis', 8000], ['boroTaxis', 300], ['work', 30000]]) {
    const entry = working[name];
    assert.ok(/^https:\/\/data\.(cityofnewyork\.us|ny\.gov)\/d\//.test(entry.source) && entry.snapshot.date && entry.filter);
    assert.ok(entry.vehicles > least && entry.represented <= entry.vehicles && entry.represented > entry.vehicles * .6, name);
    assert.equal(entry.variants.reduce((sum, row) => sum + row[4], 0), entry.represented);
    for (const [k, [make, model, year, shape, count]] of entry.variants.entries()) {
      assert.ok(make && model && year > 1985 && year < 2030 && BODIES.includes(shape) && Number.isInteger(count) && count >= entry.minimumCount, `${name} ${make} ${model}`);
      if (k) assert.ok(count <= entry.variants[k - 1][4]);
      if (name === 'work') assert.ok(shape === 'van' || shape === 'pickup');
      assert.ok(designFor(make, model, year, shape).design, `${make} ${model}`);
    }
  }
  assert.equal(working.work.bodies.van + working.work.bodies.pickup, working.work.vehicles);
  const drawnShare = entry => entry.variants.reduce((sum, [make, model, year, shape, count]) => sum + (designFor(make, model, year, shape).known ? count : 0), 0) / entry.represented;
  assert.ok(drawnShare(working.taxis) > .99 && drawnShare(working.work) > .97, 'nearly every named one has its own dimensions');

  const fleet = createFleet(base, data, art, designFor, working), mix = fleet.at(0, 0), plain = createFleet(base, data, art, designFor).at(0, 0);
  assert.deepEqual(drawTaxi(plain, .3), { identity: null, shape: undefined }, 'without the roster a cab is just a cab');
  assert.equal(drawVehicle(plain, 0, true).identity, null);
  // Cabs: the commonest medallion car first, each in livery, and the same car out of it.
  const [make, model, year, shape] = working.taxis.variants[0], first = drawTaxi(mix, 0).identity;
  assert.deepEqual([first.make, first.model, first.year, first.shape], [make, model, year, shape]);
  assert.equal(first.asset, designFor(make, model, year, shape, 'taxi')); assert.equal(first.asset.livery, 'taxi'); assert.equal(first.asset.design.livery, 'taxi');
  assert.equal(first.plain.asset, designFor(make, model, year, shape)); assert.equal(first.plain.asset.livery, undefined);
  assert.deepEqual(first.asset.wheels, first.plain.asset.wheels);
  assert.equal(drawTaxi(mix, .99999).identity, null, 'the few the TLC lists that no decoder names stay plain cabs');
  const tally = (draw, n = 4000) => { const seen = new Map(); for (let i = 0; i < n; i++) { const car = draw((i + .5) / n); const key = car.identity ? car.identity.make + ' ' + car.identity.model : car.shape; seen.set(key, (seen.get(key) || 0) + 1 / n); } return seen; };
  const share = (entry, name) => entry.variants.reduce((sum, row) => sum + (row[0] + ' ' + row[1] === name ? row[4] : 0), 0) / entry.vehicles;
  const yellow = tally(r => drawTaxi(mix, r)), green = tally(r => drawTaxi(mix, r, true));
  for (const name of ['Toyota Sienna', 'Toyota RAV4', 'Ford Transit Connect']) assert.ok(Math.abs(yellow.get(name) - share(working.taxis, name)) < .01, name);
  assert.ok(Math.abs(green.get('Toyota Camry') - share(working.boroTaxis, 'Toyota Camry')) < .01 && green.get('Toyota Camry') > yellow.get('Toyota Camry') * 3, 'boro cabs are their own fleet');
  // Work traffic: named vans and pickups in their own colours, and the unnamed remainder as plain ones.
  const AT_WORK = .14, work = tally(r => drawVehicle(mix, r * AT_WORK * .99999, true));
  assert.ok(Math.abs(work.get('Ford Transit') - share(working.work, 'Ford Transit')) < .01);
  assert.ok(work.get('van') > .15 && work.get('pickup') > .005 && work.get('van') > work.get('pickup') * 3);
  const van = drawVehicle(mix, 0, true);
  assert.equal(van.working, true); assert.equal(van.shape, 'van'); assert.equal(van.identity.asset.design.cargo, true); assert.equal(van.identity.asset.livery, 'cargo');
  assert.equal(drawVehicle(mix, .5, true).working, undefined); assert.equal(drawVehicle(mix, 0).working, undefined, 'nobody parks a work van at the kerb for the night');
  let white = 0, whiteCar = 0;
  for (let i = 0; i < 1000; i++) { if (drawPaint(mix, (i + .5) / 1000, true) === '#e8e9e6') white++; if (drawPaint(mix, (i + .5) / 1000) === '#e8e9e6') whiteCar++; }
  assert.ok(white > 600 && white < 800 && white > whiteCar * 2, `${white / 10}% of working vans are white`);
  // The patrol car.
  assert.deepEqual([fleet.patrol.make, fleet.patrol.model, fleet.patrol.asset.livery, fleet.patrol.asset.known], ['Ford', 'Police Interceptor Utility', 'police', true]);
  assert.equal(createFleet(base, data, art).patrol, null);

  // What the liveries add.
  const cab = generateVehicle(first.asset), bare = generateVehicle(first.plain.asset), patrol = generateVehicle(fleet.patrol.asset);
  const top = g => Math.max(...[...g.getAttribute('position').array].filter((_, i) => i % 3 === 1));
  assert.ok(top(cab.lamps) > first.asset.design.H + .05 && top(bare.lamps) < first.asset.design.H, 'a cab has a lit roof light');
  assert.ok(cab.body.index.count > bare.body.index.count);
  assert.ok(patrol.roof > 1.6 && patrol.roof <= fleet.patrol.asset.design.H + .001 && top(patrol.body) > patrol.roof + .1, 'the light bar stands on the roof where the beacons flash');
  const lights = createCar({ type: 'police', model: patrol }).userData.lights;
  assert.equal(lights.length, 2); assert.ok(Math.abs(lights[0].position.y - patrol.roof - .15) < 1e-9);
});

test('traffic cabs and patrol cars keep one model, in the simulation and in what draws them', async () => {
  const working = json('working-vehicles.json'), fleet = createFleet(base, data, art, designFor, working);
  const sim = new Simulation({ bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }, buildings: [], roads: [], spawn: { x: 0, z: 0, angle: 0 }, missionPoints: [] });
  const cab = sim._makeCar('traffic-7', 'taxi', { x: 10, z: 0 }, 0), police = sim._makeCar('police-1', 'police', { x: 30, z: 0 }, 0);
  assert.equal(cab.identity, null); assert.equal(police.identity, null);
  sim.cars.push(cab, police); sim.setFleet(fleet);
  assert.equal(cab.identity.asset.livery, 'taxi'); assert.equal(cab.shape, undefined); assert.equal(police.identity, fleet.patrol);
  const kept = cab.identity;
  sim.setFleet(createFleet(base, data, art, designFor, working));
  assert.deepEqual([cab.identity.make, cab.identity.model, cab.identity.year], [kept.make, kept.model, kept.year], 'the same cab is the same model when the fleet arrives again');
  assert.equal(sim._makeCar('police-r9', 'police', { x: 0, z: 50 }, 0).identity.asset.livery, 'police');
  // Recycled into traffic: a cab draws from the cabs, anything else from the block or the trades.
  sim.setTraffic({ taxis: 1 });
  const recycled = { id: 'x', type: 'sedan', identity: null, x: 0, z: 0 };
  sim._styleTraffic(recycled);
  assert.equal(recycled.type, 'taxi'); assert.equal(recycled.identity.asset.livery, 'taxi'); assert.equal(recycled.shape, undefined); assert.equal(recycled.color, '#f2b91c');
  sim.setTraffic({ taxis: 1, green: true }); sim._styleTraffic(recycled);
  assert.equal(recycled.color, '#74b541'); assert.ok(working.boroTaxis.variants.some(([make, model, year]) => make === recycled.identity.make && model === recycled.identity.model && year === recycled.identity.year));
  sim.setTraffic({ taxis: 0 });
  let vans = 0, white = 0;
  for (let i = 0; i < 400; i++) { sim._styleTraffic(recycled); assert.equal(recycled.type, 'sedan'); if (recycled.identity?.asset?.livery === 'cargo' || (!recycled.identity && recycled.shape === 'van')) { vans++; if (recycled.color === '#e8e9e6') white++; } }
  assert.ok(vans > 20 && vans < 90 && white > vans * .5, `${vans} of 400 are vans at work, ${white} of them white`);

  // Drawn: its own model once that is built, the shared cab until then.
  const library = createVehicleMeshLibrary(async () => { throw Error('nothing is fetched'); });
  const distant = createDistantTraffic({ capacity: 3, library });
  const cars = [{ ...cab, color: '#f2b91c' }, { ...police, color: '#f1f2e9' }];
  distant.update(cars);
  assert.equal(distant.group.getObjectByName('Distant cab bodies').count, 1);
  await new Promise(resolve => setTimeout(resolve, 5)); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(distant.update(cars), true);
  assert.equal(distant.group.getObjectByName('Distant cab bodies').count, 0);
  assert.equal(distant.group.getObjectByName('Distant ' + cab.identity.asset.id + ' bodies').count, 1);
  assert.equal(distant.group.getObjectByName('Distant ' + fleet.patrol.asset.id + ' bodies').count, 1);
  const tint = distant.group.getObjectByName('Distant ' + cab.identity.asset.id + ' bodies').geometry.getAttribute('aPaint');
  assert.ok(tint.getX(0) > .8 && tint.getZ(0) < .1, 'the cab is painted yellow, not built yellow');
  distant.dispose();
});

test('climbing samples the imported body shell at the hood and roof',async()=>{
  const {carTop}=await import('../dist/player-moves.js');
  const asset=art.find(model=>model.id==='honda-accord-2018'), model=decodeVehicleMesh(bufferFor(asset.url),asset);
  const shell=new THREE.Mesh(model.body,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const car={x:0,y:3,z:0,angle:0,identity:{asset}};
  for(const [x,z] of [[0,0],[.4,1.65],[-.45,-1.7]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0));
    const surface=ray.intersectObject(shell)[0];
    assert.ok(surface);
    assert.ok(Math.abs(carTop(car,x,z)-3-.025-surface.point.y)<.0001);
  }
  assert.equal(carTop(car,3,0),null);
});
