import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameMap, mapWorldToScreen, mapScreenToWorld } from '../dist/game-map.js';

class Events {
  listeners = new Map();
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set());this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  fire(type, values = {}) { const event = { preventDefault() { this.prevented = true; },stopPropagation() {},stopImmediatePropagation() {}, ...values };return [...(this.listeners.get(type) || [])].map(fn => fn(event)); }
}
class Element extends Events {
  constructor(document) { super();this.document = document;this.hidden = true;this.disabled = false;this.width = 440;this.height = 440;this.attributes = new Map();this.textContent = '';this.captures = new Set();this.calls = [];const that = this;this.context = new Proxy({}, { get(target, key) { if (key in target) return target[key];return (...args) => that.calls.push({ key, args, strokeStyle: target.strokeStyle }); } }); }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 40, top: 20, width: 900, height: 600 }; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  children = [];
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  focus() { this.document.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}
function fixture(t, callbacks = {}) {
  const document = new Events();document.elements = new Map();
  // Parse production IDs so missing controls fail instead of being invented by
  // the fixture. The overlay's DOM placement is checked separately below.
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) document.elements.set(id, new Element(document));
  document.getElementById = id => document.elements.get(id);
  document.createElement = () => new Element(document);
  const city = { bounds: { minX: -20000, maxX: 30000, minZ: -25000, maxZ: 35000 }, spawn: { x: 0, z: 0 }, buildings: [], boroughs: [], roads: [
    { id: 'a', name: 'Source Avenue', width: 10, points: [[-1500, 0], [1500, 0]] },
    { id: 'b', name: 'Source Street', width: 8, points: [[0, -1500], [0, 1500]] },
  ] };
  const map = new GameMap({ document, city, ...callbacks });t.after(() => map.dispose());
  const canvas = document.getElementById('game-map-canvas');
  const pointer = (type, x, y, extra = {}) => canvas.fire(type, { pointerId: 1, clientX: x + 40, clientY: y + 20, button: 0, ...extra });
  return { map, document, canvas, city, pointer, byId: id => document.getElementById(id) };
}

test('world and pointer coordinates roundtrip at neighborhood and full-city scales', () => {
  for (const span of [120, 1000, 75000]) for (const point of [{ x: 25000, z: -20000 }, { x: -80, z: 900 }]) {
    const view = { x: 15000, z: -9000, span, width: 1365, height: 719 };
    const actual = mapScreenToWorld(mapWorldToScreen(point, view), view);
    assert.ok(Math.abs(actual.x - point.x) < 1e-9);assert.ok(Math.abs(actual.z - point.z) < 1e-9);
  }
});

test('the full map stays outside the HUD hidden by city view', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), stack = [];
  let ancestors;
  for (const [, close, tag, attributes] of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
    if (close) { const i = stack.findLastIndex(entry => entry.tag === tag);if (i >= 0) stack.splice(i);continue; }
    const id = attributes.match(/\bid="([^"]+)"/)?.[1];
    if (id === 'game-map') ancestors = stack.map(entry => entry.id);
    if (!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag)) stack.push({ tag, id });
  }
  assert.ok(ancestors);assert.ok(!ancestors.includes('hud'));assert.ok(!ancestors.includes('city-navigation'));
});

test('opening shows the local player neighborhood, not the whole city, and emits freeze transitions once', t => {
  const changes = [], { map, byId } = fixture(t, { onOpenChange: open => changes.push(open) });
  map.setPlayer({ x: 2200, z: -3600, angle: .2 });map.setOpen(true);map.setOpen(true);
  assert.equal(byId('game-map').hidden, false);assert.deepEqual(changes, [true]);
  assert.equal(map.getState().view.span, 1000);assert.equal(map.getState().view.x, 2200);assert.equal(map.getState().view.z, -3600);
  assert.equal(byId('map-button').attributes.get('aria-expanded'), 'true');
  assert.equal(byId('open-map-button').attributes.get('aria-expanded'), 'true');
  map.setOpen(false);assert.deepEqual(changes, [true, false]);assert.equal(byId('game-map').hidden, true);
});

test('address search centers a named destination and ignores results after the map closes', async t => {
  let completeSearch;
  const { map, document, byId } = fixture(t, {
    lookupAddress: () => new Promise(resolve => { completeSearch = resolve; }),
  });
  const place = { name: '350 5th Avenue', borough: 'Manhattan', x: 100, z: 200 };
  map.setOpen(true);
  const field = byId('game-map-address');
  field.focus();field.value = '350 5th Avenue Manhattan';
  document.fire('keydown', { key: 'm' });
  assert.equal(map.getState().open, true);
  const [submitted] = byId('game-map-search').fire('submit');
  completeSearch([place]);
  await submitted;
  const results = byId('game-map-search-results');
  results.children[0].fire('click');
  assert.deepEqual(map.getState().pin, { x: 100, z: 200, name: '350 5th Avenue · Manhattan' });
  assert.equal(map.getState().view.x, 100);
  assert.equal(map.getState().view.z, 200);
  assert.equal(byId('game-map-route').disabled, false);
  assert.equal(results.children.length, 0);

  const pending = map.searchAddress();
  map.setOpen(false);
  completeSearch([place]);
  await pending;
  assert.equal(results.children.length, 0);
});

test('wheel zoom keeps its cursor anchor, has bounds, and full city includes every borough extent', t => {
  const { map, canvas, city } = fixture(t);map.setOpen(true);
  const anchor = { x: 650, y: 240 }, before = mapScreenToWorld(anchor, map.getState().view);
  canvas.fire('wheel', { clientX: 690, clientY: 260, deltaY: -250, deltaMode: 0 });
  const after = mapScreenToWorld(anchor, map.getState().view);
  assert.ok(Math.abs(after.x - before.x) < 1e-9);assert.ok(Math.abs(after.z - before.z) < 1e-9);
  assert.ok(map.getState().view.span < 1000);
  for (let i = 0; i < 50; i++) map.zoom(.1);assert.equal(map.getState().view.span, 120);
  map.showCity();const view = map.getState().view;
  for (const x of [city.bounds.minX, city.bounds.maxX]) for (const z of [city.bounds.minZ, city.bounds.maxZ]) { const p = mapWorldToScreen({ x, z }, view);assert.ok(p.x >= 0 && p.x <= view.width);assert.ok(p.y >= 0 && p.y <= view.height); }
  map.recenter();assert.equal(map.getState().view.span, 1000);
});

test('click places a pin, dragging the pin moves it, and dragging background only pans', t => {
  const pins = [], { map, pointer, byId } = fixture(t, { onPin: pin => pins.push(pin) });map.setOpen(true);
  pointer('pointerdown', 450, 300);pointer('pointerup', 450, 300);
  assert.deepEqual(map.getState().pin, { x: 0, z: 0, name: 'Map pin' });assert.equal(byId('game-map-spawn').disabled, false);
  pointer('pointerdown', 450, 300);pointer('pointermove', 540, 300);pointer('pointerup', 540, 300);
  assert.equal(map.getState().pin.x, 100);assert.equal(map.getState().view.x, 0);
  const pinCount = pins.length;
  pointer('pointerdown', 200, 100);pointer('pointermove', 290, 160);pointer('pointerup', 290, 160);
  assert.equal(pins.length, pinCount);assert.equal(map.getState().view.x, -100);assert.ok(map.getState().view.z < 0);
  map.clearPin();assert.equal(pins.at(-1), null);assert.equal(byId('game-map-route').disabled, true);
});

test('canceled touches, secondary pointers and off-city clicks cannot create accidental destinations', t => {
  const { map, pointer } = fixture(t);map.setOpen(true);
  pointer('pointerdown', 300, 250);pointer('pointerup', 600, 350, { pointerId: 2 });assert.equal(map.pin, null);
  pointer('pointercancel', 300, 250);pointer('pointerup', 300, 250);assert.equal(map.pin, null);
  map.setPin({ x: 900000, z: 0 });assert.equal(map.pin, null);
  map.setPin({ x: NaN, z: 0 });assert.equal(map.pin, null);
});

test('route and spawn use the selected coordinates, disable edits while pending, and close only after successful spawn', async t => {
  let release, result = false;const calls = [];
  const { map, byId, pointer } = fixture(t, { onRoute: pin => { calls.push(pin);return new Promise(resolve => { release = resolve; }); }, onSpawn: async pin => { calls.push(pin);return result; } });
  map.setOpen(true);map.setPin({ x: 100, z: 200 });
  const pending = byId('game-map-route').fire('click')[0];assert.equal(map.busy, true);assert.equal(byId('game-map-spawn').disabled, true);
  pointer('pointerdown', 100, 100);pointer('pointerup', 100, 100);assert.equal(map.pin.x, 100);
  release();await pending;assert.deepEqual(calls[0], { x: 100, z: 200, name: 'Map pin' });assert.equal(map.busy, false);
  await byId('game-map-spawn').fire('click')[0];assert.equal(map.open, true);
  result = true;await byId('game-map-spawn').fire('click')[0];assert.equal(map.open, false);
});

test('the actual route polyline renders on the compact map and directions clear with the pin', t => {
  const { map, byId } = fixture(t);map.setPin({ x: 100, z: 100 });
  const route = { ok: true, points: [[0, 0], [100, 0], [100, 100]], distance: 200, instructions: [{ text: 'Head onto Source Avenue' }] };
  map.setRoute(route);map.setGuidance({ nextInstruction: { text: 'Turn right onto Source Street' }, remainingDistance: 130, distanceToInstruction: 30 });
  map.update({ player: { x: 0, z: 0, angle: 0 }, mission: { phase: 'idle' } });
  const mini = byId('minimap'), routeStroke = mini.calls.findIndex(call => call.key === 'stroke' && call.strokeStyle === '#ba8cff');
  assert.ok(routeStroke > 0);
  const path = mini.calls.slice(0, routeStroke).filter(call => call.key === 'moveTo' || call.key === 'lineTo').slice(-3);
  assert.deepEqual(path.map(call => call.key), ['moveTo', 'lineTo', 'lineTo']);
  assert.ok(Math.abs(path[1].args[0] - (220 + 100 * 440 / 300)) < 1e-8);assert.equal(path[1].args[1], 220);
  assert.match(byId('route-instruction').textContent, /In 30 m: Turn right.*130 m remaining/);assert.equal(byId('route-guide').hidden, false);
  map.clearPin();assert.equal(byId('route-guide').hidden, true);assert.equal(map.getState().route, null);
});

test('keyboard closing restores focus and disposing removes all event listeners', t => {
  const { map, document, byId, canvas } = fixture(t);
  const before = byId('open-map-button');before.focus();map.setOpen(true);
  document.fire('keydown', { code: 'KeyM', repeat: true });assert.equal(map.open, true);
  document.fire('keydown', { key: 'Tab' });assert.equal(document.activeElement, canvas);
  document.fire('keydown', { key: 'Escape' });assert.equal(map.open, false);assert.equal(document.activeElement, before);
  map.setOpen(true);document.fire('keydown', { code: 'KeyM' });assert.equal(map.open, false);
  map.dispose();assert.equal([...document.listeners.values()].reduce((n, list) => n + list.size, 0), 0);
  assert.equal([...canvas.listeners.values()].reduce((n, list) => n + list.size, 0), 0);
});

test('city overview caches every source road, reuses the bitmap, and keeps route geometry live', t => {
  const { map, canvas } = fixture(t);
  const roads = Array.from({ length: 2000 }, (_, i) => ({ name: `Road ${i}`, points: [[i * 10 - 10000, -4000], [i * 10 - 10000, 4000]] }));
  map.setRoads(roads);map.setOpen(true);map.showCity();
  const cache = map.overviewCache, calls = cache.canvas.calls;
  assert.ok(cache.canvas.width <= 2048 && cache.canvas.height <= 2048);
  assert.equal(calls.filter(call => call.key === 'moveTo').length, roads.length);
  assert.equal(calls.filter(call => call.key === 'lineTo').length, roads.length);
  assert.equal(calls.filter(call => call.key === 'stroke').length, 1);
  const count = calls.length;map.setPin({ x: 200, z: 300 });map.setRoute({ ok: true, points: [[0, 0], [200, 0], [200, 300]], distance: 500 });
  assert.equal(cache.canvas.calls.length, count);
  assert.ok(canvas.calls.some(call => call.key === 'drawImage' && call.args[0] === cache.canvas));
  assert.ok(canvas.calls.some(call => call.key === 'stroke' && call.strokeStyle === '#ba8cff'));
  map.recenter();canvas.calls.length = 0;map.draw();
  assert.ok(!canvas.calls.some(call => call.key === 'drawImage' && call.args[0] === cache.canvas), 'local streets stay vector geometry');
  map.setRoads(roads.slice(0, 1200));map.showCity();assert.notEqual(map.overviewCache, cache);
});

test('local land uses only intersecting polygons and reuses its precise buffer until the player leaves it', t => {
  const { map, city, byId } = fixture(t);
  const square = (x, z) => ({ outer: [[x - 1000, z - 1000], [x + 1000, z - 1000], [x + 1000, z + 1000], [x - 1000, z + 1000]], holes: [] });
  map.setCity({ ...city, boroughs: [{ name: 'Near', polygons: [square(0, 0)] }, { name: 'Far', polygons: [square(10000, 10000)] }] });
  map.update({ player: { x: 0, z: 0 } });const cache = map.miniLandCache;
  assert.equal(cache.canvas.calls.filter(call => call.key === 'moveTo').length, 1);
  assert.equal(cache.view.width / cache.view.span, byId('minimap').width / 300, 'buffer retains the full local pixel resolution');
  map.update({ player: { x: 80, z: 40 } });assert.equal(map.miniLandCache, cache);
  map.update({ player: { x: 350, z: 40 } });assert.notEqual(map.miniLandCache, cache);
});
