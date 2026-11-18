import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KINDS } from '../dist/places.js';
import { MAP_CATEGORIES, categoryOf, createPlaceLayer, placeMarks, drawPlaceMarks } from '../dist/map-places.js';

const data = JSON.parse(readFileSync(new URL('../dist/place-names.json', import.meta.url), 'utf8')), layer = createPlaceLayer(data);
const kind = id => KINDS.findIndex(entry => entry.id === id);

test('every kind of place is shown under one category, and the commonest have their own', () => {
  for (const entry of KINDS) assert.ok(MAP_CATEGORIES.some(category => category.id === categoryOf(entry.id)), entry.id);
  assert.deepEqual(['pizza', 'american', 'coffee', 'bodega', 'bar', 'barber', 'salon', 'nails', 'clothes', 'bank', 'laundromat', 'pharmacy', 'repair', 'hotel', 'school', 'electronics'].map(categoryOf),
    ['eat', 'eat', 'coffee', 'grocery', 'drinks', 'barber', 'beauty', 'beauty', 'clothes', 'bank', 'laundry', 'health', 'cars', 'stay', 'public', 'shops']);
  assert.equal(categoryOf('nonsense'), null);
  assert.ok(MAP_CATEGORIES.every(category => /^#[0-9a-f]{6}$/.test(category.colour) && category.label) && new Set(MAP_CATEGORIES.map(category => category.colour)).size === MAP_CATEGORIES.length);
});

test('the layer counts the city by category, and what is in view', () => {
  assert.equal(layer.count, data.places.length);
  const totals = layer.totals;
  assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), layer.count);
  assert.ok(totals.eat > 15000 && totals.barber > 1500 && totals.bank > 800 && totals.eat > totals.coffee && totals.coffee > totals.bank, JSON.stringify(totals));
  // SoHo, half a mile across: clothes shops outnumber delis there, as they do not in the city at large.
  const soho = { minX: -280, maxX: 520, minZ: -480, maxZ: 320 }, counted = layer.counts(soho);
  assert.ok(counted.clothes > counted.grocery && totals.clothes < totals.grocery, `${counted.clothes} clothes shops, ${counted.grocery} delis`);
  const barbers = layer.within(soho, ['barber']);
  assert.equal(barbers.length, counted.barber); assert.ok(barbers.every(place => place.category === 'barber' && place.kind === 'Barber Shop' && place.x >= soho.minX && place.x <= soho.maxX && place.name));
  assert.equal(layer.within(soho, ['eat', 'coffee']).length, counted.eat + counted.coffee); assert.equal(layer.within(soho, [], 100).length, 0); assert.equal(layer.within(soho, null, 7).length, 7);
  assert.deepEqual(createPlaceLayer(null).within(soho), []);
});

test('gathered into squares nothing is lost, and each square sits among its own places', () => {
  const made = createPlaceLayer({ kinds: KINDS.map(entry => entry.label), places: [['A', 10, 10, kind('pizza'), 1], ['B', 30, 20, kind('pizza'), 1], ['C', 40, 40, kind('barber'), 1], ['D', 900, 900, kind('bank'), 1], ['E', 5000, 5000, kind('bank'), 1]] });
  const all = { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 }, squares = made.gathered(all, 500).sort((a, b) => a.x - b.x);
  assert.deepEqual(squares.map(square => [Math.round(square.x * 10) / 10, Math.round(square.z * 10) / 10, square.count, square.category]), [[26.7, 23.3, 3, 'eat'], [900, 900, 1, 'bank']]);
  assert.deepEqual(made.gathered(all, 500, ['barber']).map(square => [square.x, square.z, square.count, square.category]), [[40, 40, 1, 'barber']]);
  assert.deepEqual([made.nearest({ x: 35, z: 35 }).name, made.nearest({ x: 35, z: 35 }, 40, ['eat']).name, made.nearest({ x: 400, z: 400 }, 40)], ['C', 'B', null]);
  const soho = { minX: -280, maxX: 520, minZ: -480, maxZ: 320 };
  assert.equal(layer.gathered(soho, 250).reduce((sum, square) => sum + square.count, 0), layer.within(soho, null, 1e6).length);
});

test('a wide view shows where places gather, a close one each place, the closest their names', () => {
  const view = span => ({ x: 126, z: -80, span, width: 1000, height: 700 });
  const city = placeMarks(layer, view(30000)), district = placeMarks(layer, view(1000), ['eat']), block = placeMarks(layer, view(300), ['eat', 'coffee']);
  assert.equal(city.mode, 'gathered'); assert.ok(city.marks.length > 200 && city.marks.length < 2500 && city.marks.every(mark => mark.radius >= 2 && mark.radius < 40 && !mark.label && mark.count >= 1));
  assert.ok(Math.max(...city.marks.map(mark => mark.count)) > 200, 'the busiest square of the city holds hundreds');
  assert.equal(district.mode, 'places'); assert.ok(district.marks.length > 50 && district.marks.every(mark => mark.colour === '#ff794f' && mark.label === '' && mark.px >= 0 && mark.px <= 1000 && mark.py >= 0 && mark.py <= 700));
  assert.ok(block.marks.length >= 4 && block.marks.every(mark => mark.label) && block.marks.some(mark => mark.label === 'FANELLI CAFE'));
  // Drawn: a disc for every mark, and no name over another.
  const calls = { arc: 0, text: [] }, context = { save() {}, restore() {}, beginPath() {}, fill() {}, fillRect() {}, arc() { calls.arc++; }, measureText: text => ({ width: text.length * 6 }), fillText(text, x, y) { calls.text.push({ x, y, w: text.length * 6 }); } };
  drawPlaceMarks(context, block);
  assert.equal(calls.arc, block.marks.length); assert.ok(calls.text.length >= 3 && calls.text.length <= block.marks.length);
  for (const a of calls.text) for (const b of calls.text) if (a !== b) assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && Math.abs(a.y - b.y) < 12), 'names do not overlap');
});
