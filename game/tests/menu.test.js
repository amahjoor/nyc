import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND, KINDS } from '../dist/places.js';
import { menuFor, scratch, PEP } from '../dist/menu.js';
import { planRoom } from '../dist/interiors.js';
import { Simulation } from '../dist/simulation.js';

const place = kind => ({ id: kind, kind, group: KIND[kind].group, name: 'X', x: 0, z: 0, bin: 0, area: 0, grade: '' });

test('each kind of place sells what such places sell, and a scratch-off pays back half', () => {
  assert.deepEqual(menuFor(place('pizza')).map(item => item.name), ['Slice', 'Two slices and a soda', 'Soda']);
  assert.ok(menuFor(place('bodega')).some(item => item.effect === 'lottery') && menuFor(place('coffee')).some(item => item.name === 'Coffee') && menuFor(place('hotel'))[0].effect === 'sleep');
  assert.deepEqual(menuFor(place('library')), []); assert.deepEqual(menuFor(place('repair')), []);
  for (const kind of KINDS) for (const item of menuFor(place(kind.id))) assert.ok(item.name && item.price > 0 && item.price < 400 && item.effect, kind.id);
  let paid = 0, wins = 0; const n = 200000;
  for (let i = 0; i < n; i++) { const prize = scratch((i + .5) / n); paid += prize; if (prize) wins++; }
  assert.ok(Math.abs(paid / n - 1) < .15 && Math.abs(wins / n - .3) < .01, `pays back ${(paid / n).toFixed(2)} on two dollars, ${(100 * wins / n).toFixed(0)}% win`);
});

test('buying is done indoors, costs what it says, and a coffee quickens the step', () => {
  const sim = new Simulation({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, roads: [], buildings: [], spawn: { x: 10, z: 2, angle: 0 }, missionPoints: [] });
  const coffee = menuFor(place('coffee'))[0], room = planRoom({ place: place('coffee'), x: 10, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, width: 7 });
  assert.equal(sim.buy(coffee), false, 'not from the street');
  sim.enterRoom(room); sim.cash = 5;
  assert.equal(sim.buy(menuFor(place('italian')).at(-1)), false); assert.equal(sim.cash, 5, 'lunch is more than five dollars');
  assert.equal(sim.buy(coffee), true); assert.deepEqual([sim.cash, sim.pep, sim.spent], [1.5, PEP.pep, 3.5]);
  // Quicker on their feet for a minute and a half, then as before.
  const stride = () => { sim.room.a = 1.35; sim.room.b = 1.1; sim.player.velocityX = sim.player.velocityZ = 0; for (let i = 0; i < 12; i++) sim.step({ moveX: 0, moveZ: -1 }, 1 / 60); return sim.room.b - 1.1; };
  const quick = stride(); sim.pep = 0;
  assert.ok(quick > stride() * 1.08);
  sim.cash = 1000; sim.heat = 2; sim.health = 40;
  assert.equal(sim.buy(menuFor(place('hotel'))[0]), true); assert.deepEqual([sim.cash, sim.heat, sim.health], [720, 0, 100]);
  // At a stand there is no room to be in: it is bought on the sidewalk, on foot.
  sim.leaveRoom();
  const banana = menuFor(place('fruitstand'))[0], cash = sim.cash;
  assert.equal(sim.buy(banana), false); assert.equal(sim.buy(banana, { street: true }), true); assert.equal(sim.cash, cash - .5);
  assert.ok(menuFor(place('newsstand')).some(item => item.name === 'Newspaper'));
  sim.enterRoom(room);
  const before = sim.cash; sim.buy(menuFor(place('bodega')).find(item => item.effect === 'lottery'));
  assert.ok(sim.cash >= before - 2 && /Scratched/.test(sim.notice));
});
