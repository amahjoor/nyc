import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BODIES, catalogVehicles, createFleet, drawVehicle, vehicleName } from '../dist/fleet.js';
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
  assert.equal(driven.getObjectByName('Car body').geometry, mesh.body);
  assert.equal(driven.userData.wheels[1].position.z, asset.wheels.front); assert.equal(loads, 1);
  const offline = createVehicleMeshLibrary(async () => { throw Error('offline'); });
  assert.equal(offline.get(asset), null); await nextTick(); assert.equal(offline.get(asset), null);
  parked.dispose(); distant.dispose();
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
    assert.ok(triangles > 3000 && triangles < 7000, `${spec.id}: ${triangles} triangles`);
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
  assert.equal(driven.getObjectByName('Car body').geometry, mesh.body);
  assert.equal(driven.userData.wheels[1].position.z, spec.wheels.front);
  parked.dispose();
});
