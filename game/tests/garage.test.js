import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BODY_HANDLING, PARTS, RESPRAYS, RESPRAY_PRICE, CALL_OUT, DELIVERY, repairCost, offersAt, handlingFor } from '../dist/garage.js';
import { BODIES, bodyShape } from '../dist/fleet.js';
import { stepVehicleDynamics, resetVehicleDynamics } from '../dist/vehicle-dynamics.js';
import { Simulation } from '../dist/simulation.js';
import { shopRows, createPhone } from '../dist/phone.js';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const town = () => ({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, roads: [{ id: 'a', name: 'A ST', points: [[-400, 30], [400, 30]], width: 10, oneway: false }], buildings: [], spawn: { x: 0, z: 0, angle: 0 }, missionPoints: [] });
const run = (handling, input, seconds) => { const car = { angle: 0, speed: 0, handling }; resetVehicleDynamics(car); for (let i = 0; i < seconds * 120; i++) stepVehicleDynamics(car, { forward: 0, turn: 0, ...input }, 1 / 120); return car; };

test('every body has its own figures, and what a shop fits raises them', () => {
  assert.deepEqual(Object.keys(BODY_HANDLING).sort(), [...BODIES].sort());
  assert.deepEqual(handlingFor('sedan'), { power: 1, top: 1, brakes: 1, grip: 1 });
  assert.deepEqual(handlingFor('hovercraft'), handlingFor('sedan'));
  const tuned = handlingFor('coupe', { engine: 3, brakes: 1, tyres: 2 }), stock = handlingFor('coupe');
  assert.ok(Math.abs(tuned.power - stock.power * 1.27) < 1e-9 && Math.abs(tuned.top - stock.top * 1.15) < 1e-9 && Math.abs(tuned.brakes - stock.brakes * 1.1) < 1e-9 && Math.abs(tuned.grip - stock.grip * 1.16) < 1e-9);
  assert.deepEqual(handlingFor('van', { engine: 9, brakes: -2 }), handlingFor('van', { engine: 3 }), 'three stages at most');
  // A cab and a patrol car are sedans whatever else is said; other cars keep the body they were given.
  assert.deepEqual([bodyShape('taxi', 'x', 'van'), bodyShape('police', 'x'), bodyShape('sedan', 'x', 'pickup'), bodyShape('sedan', 'kerb:1', 'boat')], ['sedan', 'sedan', 'pickup', bodyShape('sedan', 'kerb:1')]);
  assert.deepEqual([repairCost(100), repairCost(99), repairCost(60), repairCost(0), repairCost(-5), repairCost(140)], [0, 5, 120, 300, 300, 0]);
  assert.deepEqual([offersAt('repair'), offersAt('bodyshop'), offersAt('pizza')], [{ repair: true, respray: false, parts: true }, { repair: true, respray: true, parts: false }, null]);
  assert.ok(RESPRAYS.length === 8 && RESPRAYS.every(([name, colour]) => name && /^#[0-9a-f]{6}$/.test(colour)) && RESPRAY_PRICE > 0 && CALL_OUT > 0 && DELIVERY > 0);
  for (const part of Object.values(PARTS)) assert.ok(part.prices.length === 3 && part.prices[0] < part.prices[1] && part.prices[1] < part.prices[2]);
});

test('a car drives by its figures: a coupe pulls harder and tops out higher than a van, and stops shorter', () => {
  const plain = run(undefined, { forward: 1 }, 1.5), sedan = run(handlingFor('sedan'), { forward: 1 }, 1.5);
  assert.equal(plain.speed, sedan.speed, 'a car with no figures is a plain sedan');
  const coupe = run(handlingFor('coupe'), { forward: 1 }, 1.5), van = run(handlingFor('van'), { forward: 1 }, 1.5);
  assert.ok(coupe.speed > sedan.speed * 1.1 && van.speed < sedan.speed * .85, `${van.speed.toFixed(1)} < ${sedan.speed.toFixed(1)} < ${coupe.speed.toFixed(1)} m/s after a second and a half`);
  const flat = body => run(handlingFor(body), { forward: 1 }, 40).speed;
  assert.ok(Math.abs(flat('sedan') - 30) < .01 && Math.abs(flat('coupe') - 33.6) < .01 && Math.abs(flat('van') - 25.5) < .01, 'top speeds');
  assert.ok(Math.abs(run(handlingFor('sedan', { engine: 3 }), { forward: 1 }, 40).speed - 34.5) < .01);
  // From 20 m/s on the brakes for a second.
  const stop = handling => { const car = { angle: 0, speed: 20, handling }; resetVehicleDynamics(car, 20); for (let i = 0; i < 60; i++) stepVehicleDynamics(car, { forward: 0, turn: 0, brake: true }, 1 / 120); return car.speed; };
  assert.ok(stop(handlingFor('sedan', { brakes: 3 })) < stop(handlingFor('sedan')) - 3 && stop(handlingFor('van')) > stop(handlingFor('sedan')) + 1);
});

test('a garage mends, resprays and fits parts for cash, to the car that is driven in', () => {
  const sim = new Simulation(town());
  assert.equal(sim.vehicle, null); assert.equal(sim.garage('repair', 'repair'), false, 'on foot there is nothing to work on');
  sim.interact();
  const cab = sim.vehicle;
  assert.ok(cab && cab.id === 'player-taxi'); assert.deepEqual(cab.handling, handlingFor('sedan'));
  sim.cash = 1000; sim.health = 60;
  assert.equal(sim.garage('pizza', 'repair'), false);
  assert.equal(sim.garage('bodyshop', 'engine'), false, 'a body shop does not fit engines'); assert.equal(sim.garage('repair', 'respray', '#8a1f1f'), false, 'a repair shop does not paint');
  assert.equal(sim.garage('repair', 'repair'), true);
  assert.deepEqual([sim.health, sim.cash], [100, 880]);
  assert.equal(sim.garage('repair', 'repair'), false); assert.equal(sim.cash, 880, 'nothing to mend, nothing charged');
  // Parts, a stage at a time, while the money lasts.
  assert.equal(sim.garage('repair', 'engine'), true);
  assert.deepEqual([cab.mods, sim.cash], [{ engine: 1 }, 480]); assert.deepEqual(cab.handling, handlingFor('sedan', { engine: 1 }));
  assert.equal(sim.garage('repair', 'engine'), false); assert.deepEqual([cab.mods.engine, sim.cash], [1, 480], 'stage two costs more than is left');
  assert.match(sim.notice, /\$800/);
  assert.equal(sim.garage('repair', 'tyres'), true); assert.deepEqual([cab.mods, sim.cash], [{ engine: 1, tyres: 1 }, 180]);
  sim.cash = 1e6;
  for (let i = 0; i < 4; i++) sim.garage('repair', 'brakes');
  assert.equal(cab.mods.brakes, 3); assert.equal(sim.cash, 1e6 - 1650, 'no fourth stage to pay for');
  // A respray: a colour the shop keeps, and a cab out of its livery is a car like any other.
  assert.equal(sim.garage('bodyshop', 'respray', '#123456'), false);
  assert.equal(sim.garage('bodyshop', 'respray', '#1f3a6a'), true);
  assert.deepEqual([cab.color, cab.type, cab.shape, sim.cash], ['#1f3a6a', 'sedan', 'sedan', 1e6 - 1650 - RESPRAY_PRICE]);
  assert.equal(sim.garage('bodyshop', 'respray', '#1f3a6a'), false, 'it is that colour already');
  // Not while the car is moving.
  for (let i = 0; i < 120; i++) sim.step({ forward: 1 }, 1 / 60);
  assert.equal(sim.garage('repair', 'engine'), false); assert.match(sim.notice, /Stop the car/);
});

test('the mechanic comes out to the car, and the cab can be brought round', () => {
  const sim = new Simulation(town());
  sim.cash = 500;
  assert.equal(sim.callMechanic(), false, 'on foot');
  assert.equal(sim.summonCab(), false, 'the cab is right there');
  // Walk off down the street, then have it brought.
  sim.player.x = 250; sim.player.z = 36;
  assert.equal(sim.summonCab(), true);
  const cab = sim.cars.find(car => car.id === 'player-taxi');
  assert.ok(Math.hypot(cab.x - 250, cab.z - 36) < 25 && Math.abs(cab.z - 30) < 4, `the cab is ${Math.hypot(cab.x - 250, cab.z - 36).toFixed(0)} m away, on the street`);
  assert.equal(sim.cash, 500 - DELIVERY);
  sim.cash = 10; sim.player.x = -250;
  assert.equal(sim.summonCab(), false); assert.equal(sim.cash, 10);
  sim.player.x = cab.x - 2.5; sim.player.z = cab.z; sim.interact();
  assert.equal(sim.vehicle, cab);
  assert.equal(sim.summonCab(), false, 'sitting in it');
  sim.health = 50; sim.cash = 100;
  assert.equal(sim.callMechanic(), false); assert.equal(sim.health, 50, 'not enough for the call-out and the repair');
  sim.cash = 400;
  assert.equal(sim.callMechanic(), true); assert.deepEqual([sim.health, sim.cash], [100, 400 - CALL_OUT - repairCost(50)]);
  assert.equal(sim.callMechanic(), false, 'nothing to mend');
});

test('the counter lists what the shop does, and the page has a place for each', () => {
  assert.deepEqual(shopRows('pizza'), []);
  assert.deepEqual(shopRows('bodyshop', { health: 80 }), [{ job: 'repair', name: 'REPAIR', note: '$60', price: 60 }]);
  assert.deepEqual(shopRows('repair', { health: 100, mods: { engine: 3, tyres: 1 } }), [
    { job: 'repair', name: 'REPAIR', note: 'NOTHING TO MEND', price: null }, { job: 'engine', name: 'ENGINE', note: 'STAGE 3 · FULLY FITTED', price: null },
    { job: 'brakes', name: 'BRAKES', note: 'STAGE 0 OF 3 · NEXT $250', price: 250 }, { job: 'tyres', name: 'TYRES', note: 'STAGE 1 OF 3 · NEXT $600', price: 600 }]);
  const ids = ['phone-shop', 'phone-paints', 'phone-paints-note', 'phone-contact-mechanic', 'phone-contact-mechanic-note', 'phone-contact-cab', 'phone-contact-cab-note'];
  for (let i = 0; i < 4; i++) ids.push(`phone-shop-${i}`, `phone-shop-${i}-name`, `phone-shop-${i}-note`);
  RESPRAYS.forEach(([, colour], i) => { ids.push(`phone-paint-${i}`); assert.match(html, new RegExp(`id="phone-paint-${i}" style="background:${colour}"`)); });
  for (const id of ids) assert.equal(html.split(`id="${id}"`).length, 2, `${id} appears once`);
  // At the counter: the rows for this shop, and each button does its job.
  const elements = new Map(), $ = id => { if (!elements.has(id)) { const listeners = {}, attributes = {}; elements.set(id, { hidden: false, disabled: false, textContent: '', value: '', setAttribute: (k, v) => { attributes[k] = v; }, getAttribute: k => attributes[k], addEventListener: (n, f) => { (listeners[n] ||= []).push(f); }, fire: n => (listeners[n] || []).forEach(f => f({})) }); } return elements.get(id); };
  const done = [], phone = createPhone({ $, state: () => ({ cash: 900, car: { health: 70, mods: {}, color: '#8a1f1f' } }), onGarage: (...job) => done.push(job), onMechanic: () => done.push('mechanic'), onCab: () => done.push('cab') });
  phone.openShop({ kind: 'bodyshop', name: 'ZAID AUTO COLLISION' });
  assert.deepEqual([phone.open, phone.screen, $('phone-title').textContent, $('phone-shop').hidden, $('phone-shop-0-note').textContent, $('phone-shop-1').hidden, $('phone-paints').hidden], [true, 'shop', 'ZAID AUTO COLLISION', false, '$90', true, false]);
  assert.equal($('phone-paint-5').getAttribute('aria-pressed'), 'true', 'the colour the car is');
  $('phone-shop-0').fire('click'); $('phone-paint-4').fire('click');
  assert.deepEqual(done, [['bodyshop', 'repair'], ['bodyshop', 'respray', '#1f3a6a']]);
  phone.openShop({ kind: 'repair', name: '' });
  assert.deepEqual([$('phone-title').textContent, $('phone-shop-3').hidden, $('phone-paints').hidden, $('phone-shop-1-note').textContent], ['AUTO REPAIR', false, true, 'STAGE 0 OF 3 · NEXT $400']);
  $('phone-shop-2').fire('click');
  assert.deepEqual(done.at(-1), ['repair', 'brakes']);
  $('phone-back').fire('click'); $('phone-app-contacts').fire('click');
  assert.match($('phone-contact-mechanic-note').textContent, /\$90/);
  $('phone-contact-mechanic').fire('click'); phone.setOpen(true); $('phone-app-contacts').fire('click'); $('phone-contact-cab').fire('click');
  assert.deepEqual(done.slice(-2), ['mechanic', 'cab']);
});
