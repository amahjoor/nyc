import test from 'node:test';
import assert from 'node:assert/strict';
import { BLIPS, BLIP, blipOf, blipColour, doorBlips, blipOpen, thinBlips, blipLegend, blipSvg, drawBlips } from '../dist/map-blips.js';
import { KINDS } from '../dist/places.js';
import { roomKind, hasRoom, roomDepth, planRoom } from '../dist/interiors.js';
import { MAP_CATEGORIES } from '../dist/map-places.js';

const front = (kind, x, z, name = '') => ({ place: { id: `${kind}-${x}-${z}`, kind, name, x, z }, x, z, tx: 1, tz: 0, nx: 0, nz: 1, width: 6 });

test('every kind of place with a room wears a badge that is drawn', () => {
  for (const kind of KINDS) {
    const icon = blipOf(kind.id);
    assert.ok(BLIP[icon], `${kind.id} has the badge ${icon}`);
    assert.match(blipColour(kind.id), /^#[0-9a-f]{6}$/);
  }
  // A trade with fittings of its own is not left with the plain shop's badge.
  for (const kind of ['pizza', 'barber', 'jewelry', 'optician', 'bodega', 'coffee', 'hotel', 'bank', 'pharmacy', 'clothes', 'liquor', 'bar', 'laundromat', 'police']) assert.notEqual(blipOf(kind), 'shop', kind);
  assert.equal(blipOf('pizza'), 'pizza'); assert.equal(blipOf('barber'), 'scissors'); assert.equal(blipOf('salon'), 'comb'); assert.equal(blipOf('jewelry'), 'gem'); assert.equal(blipOf('optician'), 'glasses');
  assert.equal(blipOf('no such kind'), 'shop'); assert.equal(blipOf('subway'), 'subway');
  // Fewer than one kind in six that can be walked into is told apart only by its colour.
  const rooms = KINDS.filter(kind => roomKind({ kind: kind.id }));
  assert.ok(rooms.filter(kind => blipOf(kind.id) === 'shop').length < rooms.length / 6);
  assert.equal(blipColour('pizza'), MAP_CATEGORIES.find(category => category.id === 'eat').colour);
});

test('the pictures are paths within their box, each badge named once', () => {
  assert.equal(new Set(BLIPS.map(blip => blip.id)).size, BLIPS.length);
  assert.equal(new Set(BLIPS.map(blip => blip.label)).size, BLIPS.length);
  for (const blip of BLIPS) {
    assert.ok(blip.steps.length >= 1 && blip.label, blip.id);
    assert.ok(!/^[-~]/.test(blip.steps[0]) || blip.steps[0][0] === '~', `${blip.id} starts with something drawn`);
    for (const step of blip.steps) {
      const d = step.replace(/^-?~?/, '');
      assert.match(d, /^M[\d.\- MmLlHhVvQqAaZz]+$/, `${blip.id}: ${d}`);
      // Where each path starts is inside the 24 by 24 box.
      for (const [, x, y] of d.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)) assert.ok(+x >= 0 && +x <= 24 && +y >= 0 && +y <= 24, `${blip.id} starts at ${x}, ${y}`);
    }
    const svg = blipSvg(blip.id, '#ff794f');
    assert.match(svg, /^<svg [^>]*viewBox="-6 -6 36 36"/); assert.equal(svg.match(/<path /g).length, blip.steps.length);
  }
});

test('doors become badges, and a station is marked once however many stairs it has', () => {
  const station = { name: 'Canal St' };
  const blips = doorBlips([front('pizza', 10, 5, "JOE'S PIZZA"), front('barber', 40, 5)], [{ x: 0, z: 0, station }, { x: 14, z: 3, station }, { x: 300, z: 0, station }]);
  assert.equal(blips.length, 4);
  assert.deepEqual(blips.map(blip => blip.icon), ['pizza', 'scissors', 'subway', 'subway']);
  assert.equal(blips[0].name, "JOE'S PIZZA"); assert.equal(blips[0].what, 'Pizza'); assert.equal(blips[1].name, 'BARBER SHOP'); assert.equal(blips[2].name, 'Canal St');
  assert.equal(new Set(blips.map(blip => blip.id)).size, 4);
  assert.deepEqual(doorBlips(), []);
  // A barber is shut at midnight, a bodega and the subway are not.
  const [barber, bodega, stairs] = doorBlips([front('barber', 0, 0), front('bodega', 9, 0)], [{ x: 20, z: 0, station }]);
  assert.equal(blipOpen(barber, 0), false); assert.equal(blipOpen(barber, 12), true); assert.equal(blipOpen(bodega, 3), true); assert.equal(blipOpen(stairs, 3), true);
});

test('badges too close to draw apart leave the rarer trade, the same ones wherever the map looks', () => {
  // A street of restaurants six metres apart with one jeweller among them.
  const row = []; for (let i = 0; i < 30; i++) row.push(front(i === 13 ? 'jewelry' : 'american', i * 6, 0));
  const blips = doorBlips(row), kept = thinBlips(blips, 20);
  assert.ok(kept.some(blip => blip.icon === 'gem'), 'the jeweller is among them');
  assert.ok(kept.length >= 7 && kept.length <= 10, `${kept.length} of thirty fit`);
  for (const a of kept) for (const b of kept) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 20);
  // The order they come in changes nothing.
  assert.deepEqual(thinBlips(blips.slice().reverse(), 20).map(blip => blip.id).sort(), kept.map(blip => blip.id).sort());
  // With room for all, all are kept; none are made up.
  assert.equal(thinBlips(blips, 5).length, 30); assert.equal(thinBlips(blips, 0).length, 30); assert.deepEqual(thinBlips([], 20), []);
  // At night an open bodega beats the shut jeweller beside it.
  const pair = doorBlips([front('jewelry', 0, 0), front('bodega', 6, 0)]);
  assert.equal(thinBlips(pair, 20, 12)[0].icon, 'gem'); assert.equal(thinBlips(pair, 20, 2)[0].icon, 'bodega');
});

test('the legend counts each badge among the doors', () => {
  const legend = blipLegend(doorBlips([front('pizza', 0, 0), front('pizza', 9, 0), front('barber', 18, 0), front('salon', 27, 0), front('bank', 36, 0)]));
  assert.deepEqual(legend.map(row => [row.id, row.label, row.count]), [['pizza', 'Pizza', 2], ['bank', 'Bank', 1], ['comb', 'Hair salon', 1], ['scissors', 'Barber', 1]]);
  assert.ok(legend.every(row => /^#[0-9a-f]{6}$/.test(row.colour)));
  // A vet and two pet shops share the paw: one row, in the colour most of them wear.
  const paws = blipLegend(doorBlips([front('vet', 0, 0), front('pets', 9, 0), front('pets', 18, 0)]));
  assert.deepEqual(paws, [{ id: 'paw', label: 'Pets & vet', count: 3, colour: blipColour('pets') }]);
  assert.notEqual(blipColour('vet'), blipColour('pets'));
});

test('drawing without a picture surface still marks every door, shut ones dim', () => {
  const calls = [], context = new Proxy({}, { set(target, key, value) { target[key] = value; if (key === 'globalAlpha') calls.push(['alpha', value]); return true; }, get(target, key) { if (key in target) return target[key]; return (...args) => { calls.push([key, ...args]); return key === 'measureText' ? { width: 40 } : undefined; }; } });
  drawBlips(context, [{ px: 50, py: 60, icon: 'pizza', colour: '#ff794f', open: true, label: 'JOE' }, { px: 200, py: 60, icon: 'bar', colour: '#b070ff', open: false, label: '' }], { size: 22, document: null });
  assert.equal(calls.filter(call => call[0] === 'arc').length, 2);
  assert.deepEqual(calls.filter(call => call[0] === 'alpha').map(call => call[1]), [1, .42, 1]);
  assert.deepEqual(calls.filter(call => call[0] === 'fillText').map(call => call[1]), ['JOE']);
});

test('a front has a room when its kind has one and the building goes four metres back', () => {
  const deep = (x, z) => z <= 0 && z >= -9, shallow = (x, z) => z <= 0 && z >= -3;
  const pizzeria = front('pizza', 0, 0), garage = front('parking', 0, 0);
  assert.equal(roomDepth(pizzeria, deep), 9); assert.equal(roomDepth(pizzeria, shallow), 3);
  assert.equal(hasRoom(pizzeria, deep), true); assert.equal(hasRoom(pizzeria, shallow), false); assert.equal(hasRoom(garage, deep), false);
  // It is the rule planRoom() goes by.
  for (const [place, inside] of [[pizzeria, deep], [pizzeria, shallow], [garage, deep]]) assert.equal(Boolean(planRoom(place, inside)), hasRoom(place, inside));
});
