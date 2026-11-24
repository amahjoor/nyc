import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameMap, mapWorldToScreen, mapScreenToWorld } from '../dist/game-map.js';
import { createPlaceLayer } from '../dist/map-places.js';
import { blipColour, doorBlips } from '../dist/map-blips.js';
import { KIND, KINDS } from '../dist/places.js';

class Events {
  listeners = new Map();
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set());this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  fire(type, values = {}) { const event = { preventDefault() { this.prevented = true; },stopPropagation() {},stopImmediatePropagation() {}, ...values };return [...(this.listeners.get(type) || [])].map(fn => fn(event)); }
}
class Element extends Events {
  constructor(document) { super();this.document = document;this.hidden = true;this.disabled = false;this.width = 440;this.height = 440;this.attributes = new Map();this.textContent = '';this.captures = new Set();this.calls = [];const that = this;this.context = new Proxy({}, { get(target, key) { if (key in target) return target[key];return (...args) => that.calls.push({ key, args, strokeStyle: target.strokeStyle, fillStyle: target.fillStyle, alpha: target.globalAlpha }); } }); }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 40, top: 20, width: 900, height: 600 }; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  children = [];
  append(child) { child.parent = this;this.children.push(child); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
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

test('the phone preview excludes pursuit overlays while the game radar and pause preview show them', t => {
  const {map,byId}=fixture(t);
  const player={x:0,z:0,angle:.4},unit={x:20,z:10};
  map.update({player,heat:2,elapsed:1,cars:[{...unit,type:'police'}],police:{
    state:'search',lastKnown:player,searchRadius:75,officers:[unit],helicopter:{...unit,light:unit}
  }});
  const phone=byId('phone-map-preview'),pause=byId('pause-map-canvas');
  map.drawPreview(phone,520,player,{phone:true});
  map.drawPreview(pause,520);
  for(const color of ['#ff5d3c1c','#7ec8ff30','#fff6c038','#7ec8ff']){
    const painted=canvas=>canvas.calls.some(call=>call.key==='fill' && call.fillStyle===color);
    assert.equal(painted(phone),false,color);
    assert.equal(painted(pause),true,color);
    assert.equal(painted(byId('minimap')),true,color);
  }
  assert.ok(!phone.calls.some(call=>call.key==='fill' && call.fillStyle==='#f8f2df'));
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

test('right-click isolates a map option, switches the solo, then enables every option', t => {
  const { map, byId } = fixture(t);
  map.setOpen(true);
  const coffee = map.key.rows.get('place/coffee').toggle;
  const lanes = byId('game-map-bike-lanes'), transit = map.transit.button;
  let prevented = 0;
  const solo = button => button.fire('contextmenu', {preventDefault(){prevented++;}});
  coffee.fire('click'); // Start with a mixed selection and a disabled target.
  solo(coffee);
  assert.deepEqual([...map.placeKinds], ['coffee']);
  assert.equal(lanes.attributes.get('aria-pressed'), 'false');
  assert.equal(coffee.attributes.get('aria-pressed'), 'true');
  solo(lanes);
  assert.equal(map.placeKinds.size, 0);
  assert.equal(map.showBikeLanes, true);
  solo(transit);
  assert.equal(map.transit.active, true);
  assert.equal(map.showBikeLanes, false);
  solo(transit);
  assert.equal(map.showBikeLanes, true);
  for(const row of map.key.rows.values())assert.equal(row.toggle.attributes.get('aria-pressed'), 'true');
  assert.equal(map.placeKinds.size, map.key.rows.size);
  assert.equal(prevented, 4);
  coffee.fire('click');
  assert.equal(map.placeKinds.size, map.key.rows.size-1);
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

test('typing and submitting island names pin their surveyed arrival points offline', async t => {
  const { regions } = JSON.parse(readFileSync(new URL('../dist/landscape-index.json', import.meta.url)));
  const presets = regions.map(region => ({ ...region.view, name: region.name }));
  let lookups = 0;
  const { map, byId } = fixture(t, { getPresets: () => presets, lookupAddress: async () => { lookups++;return []; } });
  map.setOpen(true);
  const field = byId('game-map-address'), results = byId('game-map-search-results');
  for (const [prefix, query, name] of [['Ellis', 'ellis island', 'Ellis Island'], ['Governor’s', "Governor's Island", 'Governors Island']]) {
    field.value = prefix;field.fire('input');
    assert.equal(results.children[0].textContent, name);
    field.value = query;field.fire('input');
    await Promise.all(byId('game-map-search').fire('submit'));
    assert.deepEqual(results.children.map(button => button.textContent), [name]);
    results.children[0].fire('click');
    const { x, z } = presets.find(place => place.name === name);
    assert.deepEqual(map.getState().pin, { x, z, name });
    assert.deepEqual([map.view.x, map.view.z], [x, z]);
  }
  assert.equal(lookups, 0);
});

test('trackpad scroll and pinch respond to small deltas and reverse at the same anchor', t => {
  const {map,canvas}=fixture(t);map.setOpen(true);
  const at={clientX:490,clientY:320};
  const scroll=(deltaY,ctrlKey=false)=>canvas.fire('wheel',{...at,deltaY,ctrlKey});
  const start=map.view.span;
  scroll(-10);
  assert.ok(map.view.span<start*.94 && map.view.span>start*.9);
  scroll(10);assert.ok(Math.abs(map.view.span-start)<1e-8);
  scroll(-10,true);assert.ok(map.view.span<start*.85);
  scroll(10,true);
  canvas.fire('gesturestart',{...at,scale:1});
  canvas.fire('gesturechange',{...at,scale:1.5});
  scroll(-10,true); // A browser reporting both should apply the pinch once.
  canvas.fire('gesturechange',{...at,scale:2});
  assert.ok(Math.abs(map.view.span-start/2)<1e-8);
  canvas.fire('gestureend',at);
  scroll(10);assert.ok(map.view.span>start/2);
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
  document.fire('keydown', { code: 'F7', repeat: true });assert.equal(map.open, true);
  document.fire('keydown', { key: 'Tab' });assert.equal(document.activeElement, canvas);
  document.fire('keydown', { key: 'Escape' });assert.equal(map.open, false);assert.equal(document.activeElement, before);
  map.setOpen(true);document.fire('keydown', { code: 'F7' });assert.equal(map.open, true);
  document.fire('keydown', { key: 'Escape' });assert.equal(map.open,false);
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
  const player = { x: 350, z: 40 };
  map.update({ player }, true);
  assert.equal(map.miniLandCache.view.width / map.miniLandCache.view.span, byId('minimap').width / 600);
  map.update({ player });
  assert.equal(map.miniLandCache.view.width / map.miniLandCache.view.span, byId('minimap').width / 300, 'restoring the radar redraws the shoreline at the compact scale');
});

test('zoomed-out streets stay at screen resolution through every zoom and pan', async t => {
  const f = fixture(t), roads = [];
  for (let i = 0; i < 1200; i++) roads.push({ id: `r${i}`, width: 8, kind: i % 100 ? 'street' : 'highway', points: [[-15000 + i * 30, -20000], [-15000 + i * 30, 30000]] });
  f.map.setRoads(roads);f.map.setOpen(true);f.map.zoom(12);
  assert.equal(f.map.view.span, 12000);
  const blit = () => f.canvas.calls.findLast(call => call.key === 'drawImage' && call.args[0] === f.map.sharpRoads.canvas).args;
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

test('one place filter covers nearby doors and distant catalog locations at every zoom', t => {
  const pins = [], { map, pointer, byId } = fixture(t, { onPin: pin => pins.push(pin) });
  const pizza = door('pizza', 30, -20, "JOE'S PIZZA");
  pizza.place.x = 35;
  const doors = doorBlips([pizza, door('barber', -40, 35)]);
  map.setPlaces(createPlaceLayer({ kinds: KINDS.map(kind => kind.label), places: [
    ["JOE'S PIZZA", 35, -20, KIND.pizza.index, 1], ['FAR PIZZA', 12500, 6000, KIND.pizza.index, 4],
  ] }));
  map.setDoors(doors, 12);
  const mini = byId('minimap');mini.calls.length = 0;
  const heading = .6;
  map.update({ player: { x: 0, z: 0, angle: heading } });
  // The radar is 300 m across a canvas 440 wide: each door is a badge 28 across where it stands, the rarer trade drawn first.
  const badges = calls => calls.filter(call => call.key === 'arc' && call.args[2] === 14).map(call => call.args.slice(0, 2).map(Math.round));
  assert.deepEqual(badges(mini.calls), [[161, 271], [264, 191]]);
  const canvas = byId('game-map-canvas');
  const restaurantMarks = (element = canvas) => element.calls.filter(call => call.key === 'arc' && call.fillStyle === blipColour('pizza'));
  const playerHeading = element => element.calls.findLast(call => call.key === 'rotate')?.args[0];
  assert.equal(playerHeading(mini), -heading);
  map.setOpen(true);
  assert.equal(restaurantMarks().length, 1, 'the doorway and catalog point share one marker');
  assert.equal(playerHeading(canvas), -heading);
  assert.equal(map.key.rows.get('place/eat').count.textContent, '2');
  assert.equal(map.key.rows.get('place/barber').count.textContent, '1', 'a door missing from the catalog is also browsable');
  assert.equal(byId('game-map-nearby'), undefined);
  canvas.calls.length = 0;map.zoom(.6);
  const [mark] = restaurantMarks();
  assert.equal(mark.args[2], 11, 'street zoom uses the illustrated badge renderer');
  assert.deepEqual(canvas.calls.filter(call => call.key === 'fillText' && /PIZZA|BARBER/.test(call.args[0])).map(call => call.args[0]).sort(), ['BARBER SHOP', "JOE'S PIZZA"]);
  pointer('pointerdown', ...mark.args.slice(0, 2));pointer('pointerup', ...mark.args.slice(0, 2));
  assert.deepEqual(pins.at(-1), { x: 30, z: -20, name: "JOE'S PIZZA · Pizza" });
  map.clearPin();
  canvas.calls.length = 0;map.showCity();
  assert.equal(playerHeading(canvas), -heading, 'the player keeps their heading arrow in the city overview');
  const overview = map.placeOverview.canvas;
  assert.deepEqual(restaurantMarks(overview).map(call => call.args[2]), [1, 1], 'the same colored marker reaches distant places');
  overview.calls.length = 0;
  map.view.x += 100;map.draw();
  assert.equal(overview.calls.length, 0, 'a small pan reuses the overview markers');
  map.key.rows.get('place/eat').toggle.fire('click');
  assert.equal(restaurantMarks(overview).length, 0);
  canvas.calls.length = 0;map.recenter();
  assert.equal(restaurantMarks().length, 0, 'the same filter hides the nearby restaurant');
});

test('known doors dim when closed and disappear from the map when unloaded if they have no catalog point', t => {
  const { map, byId } = fixture(t), canvas = byId('game-map-canvas');
  const doors = doorBlips([door('barber', 20, 0), door('bodega', 120, 0)]);
  map.setOpen(true);map.setDoors(doors, 12);
  const barber = () => canvas.calls.find(call => call.key === 'arc' && call.fillStyle === blipColour('barber'));
  assert.equal(barber().alpha, 1);
  // The same doors at the same hour draw nothing again.
  canvas.calls.length = 0;map.setDoors(doors, 12.1);assert.equal(canvas.calls.length, 0);
  // At midnight the barber is shut: the map is drawn again.
  map.setDoors(doors, 0);assert.equal(barber().alpha, .42);
  canvas.calls.length = 0;map.setDoors([], 12);
  assert.equal(barber(), undefined);
  assert.equal(map.key.rows.get('place/barber').count.textContent, '0');
});

test('a close badge stays selectable when more places share the same patch of screen', t => {
  const { map, canvas } = fixture(t);
  map.setPlaces(createPlaceLayer({ kinds: KINDS.map(kind => kind.label), places: [
    ['Deli', 20, 0, KIND.bodega.index, 1], ['Pizzeria', 25, 0, KIND.pizza.index, 1],
  ] }));
  map.setOpen(true);
  assert.equal(map.placeBadges.length, 1);
  const [badge] = map.placeBadges;
  assert.equal(canvas.calls.filter(call => call.key === 'arc' && call.args[2] === 2).length, 1);
  const other = badge.place.name === 'Deli' ? { x: 25, z: 0 } : { x: 20, z: 0 };
  map.pinAtScreenPoint(mapWorldToScreen(other, map.view));
  assert.ok(map.pin.name.startsWith(badge.place.name));
});

test('the Bike lanes control toggles the same neighborhood geometry on the map and minimap', t=>{
  const {map,byId,canvas}=fixture(t);
  map.bikeLanes={within:()=>[{points:[[0,0],[20,0]]}]};
  const mini=byId('minimap'), button=byId('game-map-bike-lanes');
  const painted=element=>element.calls.some(call=>call.key==='stroke' && call.strokeStyle==='#80c4a4');
  map.setOpen(true);map.drawMini();
  assert.ok(painted(canvas) && painted(mini));
  canvas.calls.length=mini.calls.length=0;
  button.fire('click');map.drawMini();
  assert.equal(button.attributes.get('aria-pressed'),'false');
  assert.ok(!painted(canvas) && !painted(mini));
});

test('the key browses every citywide location and pins only on selection', t => {
  const { map, byId, document, pointer } = fixture(t);
  const layer = createPlaceLayer({ kinds: ['Landmark'], places: [['Far', 12500, 6000, 0], ['Near', 100, 20, 0]] });
  map.setPlaces(layer);map.setOpen(true);
  const row = byId('game-map-places').children.at(-1);
  const [toggle, prev, count, next, selection] = row.children;
  map.showCity();
  const citySpan = map.view.span;
  const far = mapWorldToScreen({ x: 12500, z: 6000 }, map.view);
  pointer('pointerdown',far.x,far.y);pointer('pointerup',far.x,far.y);
  assert.equal(map.pin.name, 'Far · Landmark');
  row.fire('pointerenter');document.fire('keydown', { key: 'ArrowRight' });
  assert.deepEqual([count.textContent, selection.textContent, map.view.x, map.pin.x], ['1 / 2', 'Near', 100, 12500]);
  assert.equal(map.view.span, citySpan);
  prev.fire('click');assert.equal(count.textContent, '2 / 2');
  row.fire('pointerleave');next.focus();document.fire('keydown', { key: 'ArrowRight' });
  selection.fire('click');assert.equal(map.pin.name, 'Near · Landmark');
  toggle.fire('click');assert.equal(map.key.preview, undefined);assert.equal(map.placeKinds.has('landmark'), false);
  assert.equal(map.pin.name, 'Near · Landmark');
  byId('game-map-key-toggle').fire('click');
  assert.equal(byId('game-map-key-list').hidden, true);
  assert.equal(map.key.stepTarget(1), false);
});

test('subway stations use the citywide key and route to a station entrance', t => {
  const { map, byId } = fixture(t);
  const near = { name: 'Near Station', x: 100, z: 0, entrances: [[150, 0], [106, 0]] };
  const far = { name: 'Far Station', x: 12500, z: 6000, entrances: [[12506, 6000]] };
  map.setSubwayStations([far, near]);
  map.setPlaces(createPlaceLayer());
  map.setDoors(doorBlips([], [{ x: 106, z: 0, station: near }]), 12);
  map.setOpen(true);
  assert.equal(byId('game-map-nearby'), undefined);
  const row = map.key.rows.get('place/subway');
  assert.equal(row.toggle.children[0].textContent, 'SUBWAY STATIONS');
  assert.equal(row.count.textContent, '2');
  row.next.fire('click');
  assert.equal(row.selection.textContent, near.name);
  assert.equal(map.view.x, 106);
  assert.equal(map.pin, null);
  row.next.fire('click');
  assert.equal(row.selection.textContent, far.name);
  row.selection.fire('click');
  assert.deepEqual(map.pin, { x: 12506, z: 6000, name: 'Far Station · Subway Station' });
  map.setPlayer(far);
  row.next.fire('click');
  assert.equal(row.selection.textContent, far.name, 'starting from a new player position re-sorts the stations');
});

test('citywide place search frames and highlights every match and lets nearby markers be selected individually', async t => {
  const matches = Array.from({ length: 12 }, (_, i) => ({ kind: 'place', name: 'Coffee', detail: 'Store ' + i, x: i * 70, z: 0 }));
  matches.push({ kind: 'place', name: 'Coffee', detail: 'Far store', x: 16000, z: 7000 });
  const { map, byId, canvas, pointer } = fixture(t, {
    searchLocal: (query, { limit }) => matches.slice(0, limit),
    lookupAddress: async () => assert.fail('a local place search needs no address lookup'),
  });
  map.setOpen(true);
  byId('game-map-address').value = 'Coffee';
  canvas.calls.length = 0;
  await map.searchAddress();
  assert.equal(byId('game-map-search-results').children.length, 13);
  assert.equal(byId('game-map-search-status').textContent, '13 locations on the map');
  assert.equal(canvas.calls.filter(call => call.key === 'arc' && call.args[2] === 5).length, 13);
  assert.equal(map.pin, null);
  for (const place of matches.slice(0, 2)) {
    const { x, y } = mapWorldToScreen(place, map.view);
    pointer('pointerdown', x, y);pointer('pointerup', x, y);
    assert.equal(map.pin.name, 'Coffee · ' + place.detail);
  }
  assert.equal(map.searchMatches.length, 13);
  byId('game-map-address').value = '';
  byId('game-map-address').fire('input');
  assert.equal(map.searchMatches.length, 0);
  assert.equal(byId('game-map-search-results').children.length, 0);
  assert.equal(map.pin.name, 'Coffee · Store 1');
});
