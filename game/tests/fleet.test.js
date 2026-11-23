import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BODY_SHAPES } from '../dist/vehicle-model.js';
import { BODIES, BODY_OF, PAINTS, paintIndex, cumulative, drawFrom, createFleet, drawBody, drawPaint } from '../dist/fleet.js';
import { Simulation } from '../dist/simulation.js';

const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8'));
const tally = (draw, n = 4000) => { const counts = {}; for (let i = 0; i < n; i++) { const value = draw((i + .5) / n); counts[value] = (counts[value] || 0) + 1; } return counts; };

test('registration body types and colours fall into bodies and paint the game can draw', () => {
  assert.deepEqual([...BODIES].sort(), [...BODY_SHAPES].sort(), 'every body in the mix has a shape, and every shape is in the mix');
  for (const [type, shares] of Object.entries(BODY_OF)) {
    assert.ok(Object.keys(shares).every(body => BODIES.includes(body)), type);
    assert.ok(Math.abs(Object.values(shares).reduce((sum, share) => sum + share, 0) - 1) < 1e-9, `${type} is shared out whole`);
  }
  assert.ok(PAINTS.every(([code, hex]) => /^[A-Z]{2}$/.test(code) && /^#[0-9a-f]{6}$/.test(hex)) && new Set(PAINTS.map(([code]) => code)).size === PAINTS.length);
  // Light and dark shades are the colour they are shades of; anything else is left out.
  assert.deepEqual(['BK', 'bl', 'DK BL', 'LT  BL', 'LT GR', ' WH ', 'WH/BL', 'XX', 'NOCL', '', undefined].map(paintIndex), [0, 4, 4, 4, 6, 1, 1, -1, -1, -1, -1]);
  assert.deepEqual(cumulative([1, 1, 2]), [.25, .5, 1]); assert.deepEqual(cumulative([0, 0]), [0, 0]);
  assert.deepEqual([0, .24, .25, .6, .999, 1].map(r => drawFrom(['a', 'b', 'c'], [.25, .5, 1], r)), ['a', 'a', 'b', 'c', 'c', 'c']);
});

test('each ZIP code has its own cars; a small one leans on the city; traffic has more vans than the kerb', () => {
  // With no counts, the whole city has one plain mix.
  const plain = createFleet(null), anywhere = plain.at(123, -456);
  assert.equal(plain.zips, 0); assert.equal(anywhere.zip, null);
  assert.ok(Math.abs(anywhere.bodyShares.reduce((a, b) => a + b, 0) - 1) < 1e-9 && anywhere.parked.at(-1) === 1 && anywhere.moving.at(-1) === 1 && anywhere.paint.at(-1) === 1);
  assert.ok(BODIES.includes(drawBody(anywhere, .3)) && /^#[0-9a-f]{6}$/.test(drawPaint(anywhere, .3)));
  // Two ZIP codes: one all sedans in black, one all pickups in white with very few cars.
  const only = (list, name) => list.map(item => item === name ? 1000 : 0);
  const data = { bodies: BODIES, paints: PAINTS.map(([, hex]) => hex), city: { cars: 1000000, bodies: BODIES.map(body => body === 'suv' ? 1000 : 0), paints: only(PAINTS.map(([code]) => code), 'SL') },
    zips: [['10001', 0, 0, 20000, only(BODIES, 'sedan'), only(PAINTS.map(([code]) => code), 'BK')], ['10314', 5000, 0, 100, only(BODIES, 'pickup'), only(PAINTS.map(([code]) => code), 'WH')]] };
  const fleet = createFleet(data), midtown = fleet.at(900, 300), island = fleet.at(4000, -200);
  assert.deepEqual([fleet.zips, midtown.zip, island.zip], [2, '10001', '10314'], 'the ZIP code whose middle is nearest');
  assert.equal(fleet.at(900, 300), midtown, 'the same mix each time');
  assert.deepEqual(tally(r => drawBody(midtown, r)), { sedan: 4000 }); assert.deepEqual(tally(r => drawPaint(midtown, r)), { '#15181b': 4000 });
  // A hundred cars say little: three quarters of that mix is the city's.
  const parked = tally(r => drawBody(island, r)), paint = tally(r => drawPaint(island, r));
  assert.ok(Math.abs(parked.pickup - 1000) < 20 && Math.abs(parked.suv - 3000) < 20, JSON.stringify(parked));
  assert.ok(Math.abs(paint['#e8e9e6'] - 1000) < 20 && Math.abs(paint['#b4b9bd'] - 3000) < 20);
  // Passing traffic: one car in seven is a van or a pickup at work, whoever lives there.
  const moving = tally(r => drawBody(midtown, r, true));
  assert.ok(Math.abs(moving.sedan - 3440) < 20 && Math.abs(moving.van - 336) < 20 && Math.abs(moving.pickup - 224) < 20, JSON.stringify(moving));
});

test('the bundled counts cover the city, and SoHo is mostly sport utilities', () => {
  const data = read('fleet.json'), fleet = createFleet(data);
  assert.deepEqual(data.bodies, BODIES); assert.deepEqual(data.paints, PAINTS.map(([, hex]) => hex));
  assert.ok(data.city.cars > 1500000 && data.zips.length > 150 && data.zips.length < 260, `${data.city.cars} cars in ${data.zips.length} ZIP codes`);
  for (const [zip, x, z, cars, bodies] of data.zips) {
    assert.ok(/^1[01]\d{3}$/.test(zip) && Math.abs(x) < 40000 && Math.abs(z) < 40000 && cars >= 150, zip);
    assert.ok(bodies.length === BODIES.length && Math.abs(bodies.reduce((a, b) => a + b, 0) - 1000) <= 6, zip);
  }
  assert.ok(data.city.paints.length === PAINTS.length && Math.abs(data.city.paints.reduce((a, b) => a + b, 0) - 1000) <= 8);
  for (const source of Object.values(data.sources)) assert.match(source.url, /^https:\/\/data\.(ny\.gov|cityofnewyork\.us)\/d\/[a-z0-9]{4}-[a-z0-9]{4}$/);
  const share = (mix, body) => mix.bodyShares[BODIES.indexOf(body)];
  const soho = fleet.at(126, -80), city = createFleet({ ...data, zips: [] }).at(0, 0);
  assert.equal(soho.zip, '10012');
  assert.ok(share(soho, 'suv') + share(soho, 'hatch') + share(soho, 'wagon') + share(soho, 'minivan') > .6, 'what the register calls suburbans');
  assert.ok(share(city, 'sedan') > .2 && share(city, 'sedan') < .35 && share(city, 'pickup') > .015 && share(city, 'pickup') < .06);
  // Black, white, grey and silver are most of any street, and the same everywhere: colours are counted for the city as a whole.
  assert.ok(city.paintShares.slice(0, 4).reduce((a, b) => a + b, 0) > .6);
  assert.deepEqual(soho.paintShares, city.paintShares);
  assert.ok(Math.abs(city.paintShares[2] - city.paintShares[3]) < .002, 'half of what the register calls grey is painted silver');
});

const road = (id, name, points, width) => ({ id, name, points, width, oneway: false, kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13 });
const grid = () => { const roads = []; for (let i = -3; i <= 3; i++) { roads.push(road(`a${i}`, `A${i}`, [[i * 120, -420], [i * 120, 420]], 9)); roads.push(road(`s${i}`, `S${i}`, [[-420, i * 120], [420, i * 120]], 9)); } return roads; };
const town = () => ({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, roads: grid(), buildings: [], spawn: { x: 5, z: 5, angle: 0 }, missionPoints: [] });

test('the cars that join the traffic and stand at the kerb are those registered there', () => {
  const only = (list, name) => list.map(item => item === name ? 1000 : 0);
  const fleet = createFleet({ bodies: BODIES, paints: PAINTS.map(([, hex]) => hex), city: { cars: 1, bodies: only(BODIES, 'suv'), paints: only(PAINTS.map(([code]) => code), 'SL') },
    zips: [['10001', 0, 0, 50000, BODIES.map(body => body === 'wagon' ? 700 : body === 'coupe' ? 300 : 0), PAINTS.map(([code]) => code === 'RD' ? 500 : code === 'BL' ? 500 : 0)]] });
  const sim = new Simulation(town());
  sim.setFleet(fleet.at(0, 0)); sim.setTraffic({ level: 1, taxis: .2, green: false });
  for (let i = 0; i < 60 * 60; i++) sim.step({}, 1 / 60);
  const fresh = sim.cars.filter(car => /^traffic-\d{3,}$/.test(car.id)), cabs = fresh.filter(car => car.type === 'taxi'), others = fresh.filter(car => car.type !== 'taxi');
  assert.ok(fresh.length > 30 && cabs.length > 2 && others.length > 20);
  assert.ok(cabs.every(car => car.identity?.asset.livery === 'taxi' && car.color === '#f2b91c'), 'a cab stays a cab');
  assert.ok(others.every(car => ['wagon', 'coupe', 'van', 'pickup'].includes(car.shape) && ['#8a1f1f', '#1f3a6a'].includes(car.color)), 'the rest are the wagons and coupes of the place, and vans and pickups at work');
  const wagons = others.filter(car => car.shape === 'wagon').length;
  assert.ok(wagons > others.length * .4, `${wagons} of ${others.length} are wagons`);
  // Kerb spaces: the same space always holds the same car, drawn from the same mix without the working vans.
  const spaces = Array.from({ length: 40 }, (_, i) => ({ id: `kerb:${i * 17}:${i}`, x: -300 + i * 7, z: 44, angle: Math.PI / 2 }));
  assert.ok(sim.syncParkedCars(spaces) > 30);
  const kerb = () => Object.fromEntries(sim.cars.filter(car => car._kerb).map(car => [car.id, `${car.shape} ${car.color}`]));
  const first = kerb();
  assert.ok(Object.values(first).every(look => /^(wagon|coupe) #(8a1f1f|1f3a6a)$/.test(look)) && new Set(Object.values(first)).size === 4, 'both bodies in both colours');
  sim.syncParkedCars([]); sim.syncParkedCars(spaces);
  assert.deepEqual(kerb(), first);
  // Every car has a named exterior even before the registration catalog arrives.
  const before = new Simulation(town());
  before.syncParkedCars(spaces);
  assert.ok(before.cars.filter(car => car._kerb).every(car => car.identity?.asset && car.identity.shape === car.shape && /^#[0-9a-f]{6}$/.test(car.color)));
  sim.setFleet(null); sim.setFleet({ nonsense: true });
  assert.ok(sim._fleet.at(0,0));
});
