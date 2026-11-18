import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogVehicles, createFleet, drawTaxi, drawVehicle } from '../dist/fleet.js';
import { carPerformance, describePerformance, REFERENCE } from '../dist/vehicle-performance.js';
import { designFor } from '../dist/vehicle-designs.js';
import { handlingFor, BODY_HANDLING } from '../dist/garage.js';
import { resetVehicleDynamics, stepVehicleDynamics } from '../dist/vehicle-dynamics.js';
import { Simulation } from '../dist/simulation.js';

const json = file => JSON.parse(readFileSync(new URL('../dist/' + file, import.meta.url)));
const data = json('vehicle-catalog.json'), figures = json('vehicle-performance.json'), working = json('working-vehicles.json'), base = json('fleet.json');
const art = json('assets/vehicles/index.json').models;
const count = new Map();
for (let i = 0; i < data.city.length; i += 2) if (data.city[i] >= 0) count.set(data.city[i], data.city[i + 1]);
const find = (make, model, year, shape) => data.variants.findIndex(v => v[0] === make && v[1] === model && v[2] === year && v[3] === shape);
const of = (make, model, year, shape) => { const i = find(make, model, year, shape); assert.ok(i >= 0, `${year} ${make} ${model}`); return carPerformance({ make, year, shape }, figures.variants[i], designFor(make, model, year, shape).design); };

test('each registered model year has the power, weight, drive and fuel vPIC files for it', () => {
  assert.equal(figures.version, 1); assert.deepEqual(figures.fields, ['hp', 'kg', 'drive', 'fuel']);
  assert.deepEqual(figures.snapshot, data.snapshot, 'built from the same registrations as the catalog');
  assert.equal(figures.variants.length, data.variants.length);
  for (const name of ['taxis', 'boroTaxis', 'work']) assert.equal(figures[name].length, working[name].variants.length, name);
  const filed = [0, 0, 0, 0]; let all = 0;
  for (const [i, row] of figures.variants.entries()) {
    const [hp, kg, drive, fuel] = row, n = count.get(i);
    assert.equal(row.length, 4);
    assert.ok(hp === null || (Number.isInteger(hp) && hp >= 40 && hp <= 1300), data.variants[i].join(' '));
    assert.ok(kg === null || (Number.isInteger(kg) && kg >= 650 && kg <= 4500), data.variants[i].join(' '));
    assert.ok(drive === null || 'FRA'.includes(drive)); assert.ok(fuel === null || 'GDHPE'.includes(fuel));
    all += n; row.forEach((value, k) => { if (value !== null) filed[k] += n; });
  }
  const share = filed.map(n => n / all);
  assert.ok(share[0] > .65 && share[1] > .5 && share[2] > .8 && share[3] > .95, `on file for ${share.map(s => (s * 100).toFixed(0) + '%').join(', ')} of named registrations`);
  // What the register says of a few everyone knows.
  const row = (...car) => figures.variants[find(...car)];
  assert.deepEqual(row('Toyota', 'Camry', 2019, 'sedan').slice(2), ['F', 'G']); assert.ok(Math.abs(row('Toyota', 'Camry', 2019, 'sedan')[0] - 203) < 8);
  assert.equal(row('Tesla', 'Model Y', 2023, 'suv')[3], 'E'); assert.equal(row('Toyota', 'Sienna', 2022, 'minivan')[3], 'H'); assert.equal(row('Dodge', 'Charger', 2019, 'sedan')[2], 'R');
});

test('time to 60 mph and top speed land near what road tests measured', () => {
  // [seconds to 60 mph, top speed in mph] as published for the common version of each.
  const published = [['Toyota', 'Camry', 2019, 'sedan', 7.6, 135], ['Honda', 'CR-V', 2018, 'suv', 7.5, 124], ['Toyota', 'Corolla', 2020, 'sedan', 9.2, 118], ['Toyota', 'PRIUS', 2012, 'hatch', 10, 112],
    ['Ford', 'Mustang', 2018, 'coupe', 5, 155], ['Porsche', '911', 2017, 'coupe', 4.2, 183], ['Tesla', 'Model Y', 2023, 'suv', 4.8, 135], ['BMW', '330i', 2020, 'sedan', 5.5, 155], ['Jeep', 'Wrangler', 2019, 'suv', 7, 112],
    ['Ford', 'F-150', 2018, 'pickup', 6, 107], ['Toyota', 'Sienna', 2022, 'minivan', 7.7, 117], ['Dodge', 'Charger', 2019, 'sedan', 5.9, 140], ['Chevrolet', 'Suburban', 2019, 'suv', 7.3, 113], ['Honda', 'Fit', 2015, 'hatch', 8.5, 115]];
  let miss = 0;
  for (const [make, model, year, shape, seconds, mph] of published) {
    const p = of(make, model, year, shape);
    assert.ok(Math.abs(p.zeroToSixty - seconds) <= 1.1, `${year} ${make} ${model}: ${p.zeroToSixty} s against ${seconds}`);
    assert.ok(Math.abs(p.topSpeed - mph) <= 22, `${year} ${make} ${model}: ${p.topSpeed} mph against ${mph}`);
    miss += Math.abs(p.zeroToSixty - seconds);
  }
  assert.ok(miss / published.length < .7, `${(miss / published.length).toFixed(2)} s out on average`);
  // Nothing in the catalog does anything a road car could not.
  for (const [i, [make, model, year, shape]] of data.variants.entries()) {
    const p = carPerformance({ make, year, shape }, figures.variants[i], designFor(make, model, year, shape).design);
    assert.ok(p.hp >= 50 && p.hp <= 1300 && p.kg >= 700 && p.kg <= 4500 && p.zeroToSixty >= 2.3 && p.zeroToSixty <= 17 && p.topSpeed >= 80 && p.topSpeed <= 205 && p.grip >= .65 && p.grip <= 1.1 && p.braking >= .7 && p.braking <= 1.2, `${year} ${make} ${model}: ${describePerformance(p)}`);
    for (const value of Object.values(p.handling)) assert.ok(value >= .45 && value <= 2.6);
  }
});

test('power, weight, driven wheels and body each move the figures the way they move a car', () => {
  const car = { make: 'Honda', year: 2018, shape: 'sedan' }, size = { L: 4.8, W: 1.85, H: 1.45 }, plain = carPerformance(car, [200, 1500, 'F', 'G'], size);
  assert.deepEqual(plain.measured, { hp: true, kg: true });
  assert.ok(carPerformance(car, [300, 1500, 'F', 'G'], size).zeroToSixty < plain.zeroToSixty - 1.5 && carPerformance(car, [200, 2000, 'F', 'G'], size).zeroToSixty > plain.zeroToSixty + 1.5);
  assert.ok(carPerformance(car, [200, 1500, 'A', 'G'], size).zeroToSixty < carPerformance(car, [200, 1500, 'R', 'G'], size).zeroToSixty && carPerformance(car, [200, 1500, 'R', 'G'], size).zeroToSixty < plain.zeroToSixty);
  assert.ok(carPerformance(car, [200, 1500, 'F', 'E'], size).zeroToSixty < plain.zeroToSixty, 'an electric car has all its pull at once');
  assert.equal(carPerformance(car, [200, 1500, 'F', 'H'], size).hp, 260, 'a hybrid is filed by its engine alone');
  const van = carPerformance({ ...car, shape: 'van' }, [200, 1500, 'F', 'G'], size), coupe = carPerformance({ ...car, shape: 'coupe' }, [200, 1500, 'F', 'G'], size);
  assert.ok(van.topSpeed < plain.topSpeed && van.grip < plain.grip && coupe.grip > plain.grip && van.braking < plain.braking);
  assert.ok(carPerformance(car, [90, 1500, 'F', 'G'], size).topSpeed < 120, 'a weak engine runs out of breath before any limiter');
  // Nothing on file: its size, kind and period stand in, and it says so.
  const guessed = carPerformance(car, [null, null, null, null], size), bare = carPerformance({ shape: 'pickup' });
  assert.deepEqual(guessed.measured, { hp: false, kg: false }); assert.ok(guessed.kg > 1300 && guessed.kg < 1700 && guessed.hp > 140 && guessed.hp < 220 && guessed.drive === null && guessed.fuel === 'G');
  assert.ok(bare.kg > 1900 && bare.topSpeed <= 108);
  assert.match(describePerformance(guessed), /^~\d+ hp · ~[\d,]+ kg · 0–60 mph in [\d.]+ s · \d+ mph$/);
  assert.match(describePerformance(carPerformance(car, [200, 1500, 'A', 'H'], size)), /^260 hp · 1,500 kg · hybrid · all-wheel drive · /);
  assert.ok(carPerformance({ make: 'smart', year: 2016, shape: 'coupe' }, null, { L: 2.7, W: 1.66, H: 1.555 }).zeroToSixty > 9, 'a two-door city car is no sports car');
  // The reference sedan is the game's sedan.
  const reference = carPerformance(car, [200, 1625, 'F', 'G'], size);
  assert.ok(Math.abs(reference.zeroToSixty - REFERENCE.zeroToSixty) < .15 && reference.topSpeed === REFERENCE.topSpeed);
  for (const [key, value] of Object.entries(reference.handling)) assert.ok(Math.abs(value - BODY_HANDLING.sedan[key]) < .02, key);
});

test('a car the player drives pulls, tops out, stops and grips as its model does against the others', () => {
  const fleet = createFleet(base, data, art, designFor, working, figures), plain = createFleet(base, data, art, designFor, working);
  const cars = catalogVehicles(data, art, designFor, figures), bare = catalogVehicles(data, art, designFor);
  assert.ok(cars.every(car => car.performance?.handling) && bare.every(car => car.performance === undefined));
  assert.equal(drawVehicle(plain.at(0, 0), .5).identity.performance, undefined);
  assert.equal(drawVehicle(createFleet(base, data, art, designFor, working, { ...figures, variants: figures.variants.slice(1) }).at(0, 0), .5).identity.performance, undefined, 'figures for another catalog are not used');
  const cab = drawTaxi(fleet.at(0, 0), 0).identity;
  assert.ok(cab.performance.measured.hp && cab.performance.fuel === 'H' && cab.plain.performance === cab.performance, 'a cab goes as the same car out of livery does');
  assert.ok(drawVehicle(fleet.at(0, 0), 0, true).identity.performance.handling.top < 1, 'a working van is no quicker for being at work');
  assert.ok(fleet.patrol.performance.hp === 318 && fleet.patrol.performance.handling.power > 1 && plain.patrol.performance === undefined);

  // Driving: the game's own dynamics, with each car's figures.
  const mustang = cars[find('Ford', 'Mustang', 2018, 'coupe')], sienna = cars[find('Toyota', 'Sienna', 2022, 'minivan')], camry = cars[find('Toyota', 'Camry', 2019, 'sedan')];
  const sprint = handling => { const car = { angle: 0, speed: 0, handling }; resetVehicleDynamics(car); let t = 0; while (car.speed < 26.8224 && t < 30) { stepVehicleDynamics(car, { forward: 1, turn: 0 }, 1 / 120); t += 1 / 120; } return t; };
  const flat = handling => { const car = { angle: 0, speed: 0, handling }; resetVehicleDynamics(car); for (let i = 0; i < 60 * 120; i++) stepVehicleDynamics(car, { forward: 1, turn: 0 }, 1 / 120); return car.speed; };
  const own = car => handlingFor(car.shape, {}, car.performance.handling);
  assert.deepEqual(own(mustang), mustang.performance.handling); assert.notDeepEqual(own(mustang), handlingFor('coupe'));
  assert.deepEqual(handlingFor('coupe', {}, null), BODY_HANDLING.coupe, 'a car nobody has figures for drives as its body does');
  const pace = sprint(own(sienna)) / sprint(own(mustang)), real = sienna.performance.zeroToSixty / mustang.performance.zeroToSixty;
  assert.ok(real > 1.3 && Math.abs(pace / real - 1) < .12, `the Sienna takes ${pace.toFixed(2)}× the Mustang's time to 60 mph in the game, ${real.toFixed(2)}× on the road`);
  assert.ok(Math.abs(sprint(own(camry)) - sprint(BODY_HANDLING.sedan)) < .15, 'a family sedan keeps the pace the game always had');
  assert.ok(Math.abs(flat(own(mustang)) / flat(own(sienna)) - mustang.performance.topSpeed / sienna.performance.topSpeed) < .01);
  assert.ok(Math.abs(flat(own(camry)) - 30) < .01);
  const tuned = handlingFor('coupe', { engine: 2, tyres: 1 }, mustang.performance.handling);
  assert.ok(Math.abs(tuned.power / mustang.performance.handling.power - 1.18) < 1e-9 && Math.abs(tuned.grip / mustang.performance.handling.grip - 1.08) < 1e-9, 'parts raise its own figures');

  // In the simulation: getting in takes the car's figures; a car without them keeps its body's.
  const sim = new Simulation({ bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }, buildings: [], roads: [], spawn: { x: 0, z: 0, angle: 0 }, missionPoints: [] });
  sim.syncParkedCars([{ id: 'kerb', x: 60, z: 0, angle: 0 }]);
  const parked = sim.cars.find(car => car.id === 'kerb');
  Object.assign(parked, { identity: mustang, shape: 'coupe' });
  Object.assign(sim.player, { x: 60, z: 2, y: parked.y });
  sim.interact();
  assert.equal(sim.player.vehicleId, 'kerb'); assert.deepEqual(parked.handling, mustang.performance.handling);
  sim.interact(); parked.identity = null; Object.assign(sim.player, { x: 60, z: 2, y: parked.y }); sim.interact();
  assert.equal(sim.player.vehicleId, 'kerb'); assert.deepEqual(parked.handling, BODY_HANDLING.coupe);
});
