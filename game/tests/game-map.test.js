import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameMap, mapWorldToScreen, mapScreenToWorld } from '../dist/game-map.js';
import { doorBlips } from '../dist/map-blips.js';

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
  assert.equal(byId('game-map-spawn').disabled, false);
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
  pointer('pointerdown', 450, 300);pointer('pointermove', 540, 300);assert.equal(pins.length, 1);pointer('pointerup', 540, 300);
  assert.equal(pins.length, 2);
  assert.equal(map.getState().pin.x, 100);assert.equal(map.getState().view.x, 0);
  const pinCount = pins.length;
  pointer('pointerdown', 200, 100);pointer('pointermove', 290, 160);pointer('pointerup', 290, 160);
  assert.equal(pins.length, pinCount);assert.equal(map.getState().view.x, -100);assert.ok(map.getState().view.z < 0);
  const placed = mapWorldToScreen(map.pin, map.view);
  pointer('pointerdown', placed.x, placed.y);pointer('pointerup', placed.x, placed.y);
  assert.equal(map.pin, null);assert.equal(pins.at(-1), null);assert.equal(byId('game-map-spawn').disabled, true);
});

test('canceled touches, secondary pointers and off-city clicks cannot create accidental destinations', t => {
  const { map, pointer, document } = fixture(t);map.setOpen(true);
  pointer('pointerdown', 300, 250);pointer('pointerup', 600, 350, { pointerId: 2 });assert.equal(map.pin, null);
  pointer('pointercancel', 300, 250);pointer('pointerup', 300, 250);assert.equal(map.pin, null);
  map.setPin({ x: 900000, z: 0 });assert.equal(map.pin, null);
  map.setPin({ x: NaN, z: 0 });assert.equal(map.pin, null);
  pointer('pointerdown', 450, 300);pointer('pointerup', 450, 300);
  pointer('pointerdown', 450, 300);pointer('pointermove', 560, 350);pointer('pointercancel', 560, 350);
  assert.deepEqual(map.pin, { x: 0, z: 0, name: 'Map pin' });
  document.fire('keydown', { key: 'Delete' });assert.equal(map.pin, null);
});

test('spawning uses the pin, locks edits while pending, and closes only on success', async t => {
  let release;const calls = [];
  const { map, byId, pointer } = fixture(t, { onSpawn: pin => { calls.push(pin);return new Promise(resolve => { release = resolve; }); } });
  map.setOpen(true);map.setPin({ x: 100, z: 200 });
  const pending = byId('game-map-spawn').fire('click')[0];assert.equal(map.busy, true);assert.equal(byId('game-map-spawn').disabled, true);
  pointer('pointerdown', 100, 100);pointer('pointerup', 100, 100);assert.equal(map.pin.x, 100);
  release(false);await pending;assert.deepEqual(calls[0], { x: 100, z: 200, name: 'Map pin' });assert.equal(map.busy, false);
  assert.equal(map.open, true);
  const [retry] = byId('game-map-spawn').fire('click');release(true);await retry;assert.equal(map.open, false);
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

test('city overview keeps every source road in one layer, reuses it, and keeps route geometry live', t => {
  const { map, canvas } = fixture(t);
  const roads = Array.from({ length: 2000 }, (_, i) => ({ name: `Road ${i}`, points: [[i * 10 - 10000, -4000], [i * 10 - 10000, 4000]] }));
  map.setRoads(roads);map.setOpen(true);map.showCity();
  const cache = map.sharpRoads, calls = cache.canvas.calls;
  assert.ok(Math.abs(cache.scale - map.view.width / map.view.span) < 1e-12, 'kept at the scale on screen');
  assert.equal(calls.filter(call => call.key === 'moveTo').length, roads.length);
  assert.equal(calls.filter(call => call.key === 'lineTo').length, roads.length);
  assert.equal(calls.filter(call => call.key === 'stroke').length, 1);
  const count = calls.length;map.setPin({ x: 200, z: 300 });map.setRoute({ ok: true, points: [[0, 0], [200, 0], [200, 300]], distance: 500 });
  assert.equal(cache.canvas.calls.length, count);
  assert.ok(canvas.calls.some(call => call.key === 'drawImage' && call.args[0] === cache.canvas));
  assert.ok(canvas.calls.some(call => call.key === 'stroke' && call.strokeStyle === '#ba8cff'));
  map.recenter();canvas.calls.length = 0;map.draw();
  assert.ok(!canvas.calls.some(call => call.key === 'drawImage' && call.args[0] === cache.canvas), 'local streets stay vector geometry');
  map.setRoads(roads.slice(0, 1200));map.showCity();assert.notEqual(map.sharpRoads, cache);
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

test('zoomed-out streets stay at screen resolution through every zoom and pan', async t => {
  const f = fixture(t), roads = [];
  for (let i = 0; i < 1200; i++) roads.push({ id: `r${i}`, width: 8, kind: i % 100 ? 'street' : 'highway', points: [[-15000 + i * 30, -20000], [-15000 + i * 30, 30000]] });
  f.map.setRoads(roads);f.map.setOpen(true);f.map.zoom(12);
  assert.equal(f.map.view.span, 12000);
  const blit = () => f.canvas.calls.filter(call => call.key === 'drawImage').at(-1).args;
  const exact = () => {
    const sharp = f.map.sharpRoads;assert.equal(blit()[0], sharp.canvas);
    assert.ok(Math.abs(sharp.canvas.width / sharp.view.span - 900 / f.map.view.span) < 1e-9, 'one kept pixel per screen pixel');
    assert.deepEqual(blit().slice(3), [sharp.view.width, sharp.view.height], 'copied at its own size, not stretched');
    assert.equal(f.map.sharpTimer, null);return sharp;
  };
  // The very first frame past 10 km is already drawn for this scale.
  let sharp = exact();
  // A pan inside what is kept copies it without another pass over the streets.
  const strokes = sharp.canvas.calls.length;f.map.view.x += 1000;f.map.draw();
  assert.equal(exact(), sharp);assert.equal(sharp.canvas.calls.length, strokes);
  // A whole notch of the wheel is redrawn in the same frame.
  f.map.zoom(1.16);assert.notEqual(exact(), sharp);sharp = f.map.sharpRoads;
  // A small step of a pinch rescales what is kept, by under 8%, until it rests.
  f.map.zoom(1 / 1.05);assert.equal(f.map.sharpRoads, sharp);
  assert.ok(Math.abs(blit()[3] / sharp.view.width - 1.05) < 1e-9);assert.notEqual(f.map.sharpTimer, null);
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.notEqual(exact(), sharp);
  f.map.setOpen(false);assert.equal(f.map.sharpRoads, null);
});

test('zoomed-out streets are stroked from paths built once, only where in sight', t => {
  class Path { constructor() { this.points = 0; } moveTo() { this.points++; } lineTo() { this.points++; } }
  globalThis.Path2D = Path;t.after(() => { delete globalThis.Path2D; });
  const f = fixture(t), roads = [];
  for (let i = 0; i < 1200; i++) roads.push({ id: `r${i}`, width: 8, kind: i % 100 ? 'street' : 'highway', points: [[-15000 + i * 30, -2000], [-15000 + i * 30, 2000]] });
  f.map.setRoads(roads);f.map.setOpen(true);f.map.zoom(12);
  const chunks = f.map.roadChunks(), strokes = () => f.map.sharpRoads.canvas.calls.filter(call => call.key === 'stroke');
  assert.equal(chunks.reduce((sum, chunk) => sum + chunk.path.points, 0), 2400, 'no street is left out');
  assert.ok(chunks.findIndex(chunk => chunk.major) > chunks.findLastIndex(chunk => !chunk.major), 'highways are drawn over streets');
  const seen = strokes().length;assert.ok(seen > 0 && seen < chunks.length, 'squares out of sight are skipped');
  f.map.zoom(1.5);assert.equal(f.map.roadChunks(), chunks);assert.ok(strokes().length > seen);
  f.map.setRoads(roads.slice(0, 1100));assert.notEqual(f.map.roadChunks(), chunks);
});

const door = (kind, x, z, name = '') => ({ place: { id: `${kind}|${x}|${z}`, kind, name, x, z }, x, z, tx: 1, tz: 0, nx: 0, nz: 1, width: 6 });

test('doors nearby are marked on the radar and the open map, and a click on a badge pins that place by name', t => {
  const pins = [], { map, pointer, byId } = fixture(t, { onPin: pin => pins.push(pin) });
  const doors = doorBlips([door('pizza', 30, -20, "JOE'S PIZZA"), door('barber', -40, 35)]);
  map.setDoors(doors, 12);
  const mini = byId('minimap');mini.calls.length = 0;
  map.update({ player: { x: 0, z: 0, angle: 0 } });
  // The radar is 300 m across a canvas 440 wide: each door is a badge 28 across where it stands, the rarer trade drawn first.
  const badges = calls => calls.filter(call => call.key === 'arc' && (call.args[2] === 14 || call.args[2] === 11)).map(call => call.args.slice(0, 2).map(Math.round));
  assert.deepEqual(badges(mini.calls), [[161, 271], [264, 191]]);
  // The open map is 1000 m across 900 pixels: the same doors, smaller.
  const canvas = byId('game-map-canvas');map.setOpen(true);
  assert.deepEqual(badges(canvas.calls), [[414, 332], [477, 282]]);
  // Closer in, 600 m across, each has its name beside it.
  canvas.calls.length = 0;map.zoom(.6);
  assert.deepEqual(badges(canvas.calls), [[390, 353], [495, 270]]);
  assert.deepEqual(canvas.calls.filter(call => call.key === 'fillText' && /PIZZA|BARBER/.test(call.args[0])).map(call => call.args[0]), ['BARBER SHOP', "JOE'S PIZZA"]);
  // Beside it, what each badge stands for.
  const legend = byId('game-map-legend');
  assert.equal(legend.hidden, false);assert.deepEqual(legend.children.map(child => child.textContent || child.children.map(part => part.textContent).join('')), ['WALK IN NEARBY', 'BARBER · 1', 'PIZZA · 1']);
  assert.match(legend.children[1].children[0].innerHTML, /^<svg /);
  // A click on the badge is a click on the place.
  pointer('pointerdown', 498, 273);pointer('pointerup', 498, 273);
  assert.deepEqual(pins.at(-1), { x: 30, z: -20, name: "JOE'S PIZZA · Pizza" });
  // A click clear of every badge is still a plain pin.
  pointer('pointerdown', 700, 100);pointer('pointerup', 700, 100);
  assert.equal(pins.at(-1).name, 'Map pin');
});

test('doors are redrawn when they or the hour change, dim when shut, and left off a map of the whole city', t => {
  const { map, byId } = fixture(t), canvas = byId('game-map-canvas');
  const doors = doorBlips([door('barber', 20, 0), door('bodega', 120, 0)]);
  map.setOpen(true);map.setDoors(doors, 12);
  const alphas = () => canvas.calls.filter(call => call.key === 'arc' && call.args[2] === 11).length;
  assert.equal(alphas(), 2);
  // The same doors at the same hour draw nothing again.
  canvas.calls.length = 0;map.setDoors(doors, 12.1);assert.equal(canvas.calls.length, 0);
  // At midnight the barber is shut: the map is drawn again.
  map.setDoors(doors, 0);assert.equal(alphas(), 2);assert.equal(map.hours, 0);
  // Doors that would overlap share one badge: at 2.4 km across, these two a hundred metres apart are 37 pixels apart and both fit; forty metres apart, 15 pixels, one stays.
  canvas.calls.length = 0;map.view.span = 2400;map.draw();assert.equal(alphas(), 2);
  canvas.calls.length = 0;map.setDoors(doorBlips([door('barber', 20, 0), door('bodega', 60, 0)]), 12);assert.equal(alphas(), 1);
  // Across the whole city the doors around one person are not drawn at all.
  canvas.calls.length = 0;map.showCity();assert.equal(alphas(), 0);
  // With no doors there is no legend.
  map.setDoors([], 12);assert.equal(byId('game-map-legend').hidden, true);
});
