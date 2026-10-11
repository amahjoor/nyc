import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createWorld, createCar, createPerson } from '../dist/world.js';
import { Simulation } from '../dist/simulation.js';
import { Input } from '../dist/input.js';
import { HUD } from '../dist/hud.js';
import { CityAudio } from '../dist/audio.js';
import { applySurvey } from '../dist/survey-city.js';
import { loadOrthophoto } from '../dist/orthophoto.js';

// This is application integration QA, not a browser/GPU rendering test. The
// actual city geometry, physics, input and HUD run; browser primitives are fake.
const city = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url), 'utf8'));
const survey = JSON.parse(readFileSync(new URL('../dist/survey.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(readFileSync(new URL('../dist/facade-profiles.json', import.meta.url), 'utf8'));
const ortho = JSON.parse(readFileSync(new URL('../dist/ortho.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');

class EventTarget {
  listeners = new Map();
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  dispatch(name, detail = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...detail };
    for (const listener of this.listeners.get(name) || []) listener(event);
    return event;
  }
}

function canvasContext() {
  const context = {};
  for (const method of ['quadraticCurveTo', 'drawImage', 'fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'roundRect', 'arc', 'fill', 'stroke', 'fillText', 'save', 'restore', 'translate', 'rotate', 'setLineDash']) {
    context[method] = () => {};
  }
  context.createLinearGradient = () => ({ addColorStop() {} });
  context.measureText = text => ({ width: text.length * 12 });
  return context;
}

class Element extends EventTarget {
  constructor(tag, attributes = '') {
    super();
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.attributes = new Map();
    this.dataset = {};
    this.textContent = '';
    this.hidden = /\shidden(?:\s|$)/.test(attributes);
    this.disabled = /\sdisabled(?:\s|$)/.test(attributes);
    this.width = Number(attributes.match(/width="(\d+)"/)?.[1] || 300);
    this.height = Number(attributes.match(/height="(\d+)"/)?.[1] || 150);
    this.open = false;
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, force) => {
        const shouldAdd = force ?? !this.classes.has(name);
        if (shouldAdd) this.classes.add(name); else this.classes.delete(name);
        return shouldAdd;
      },
    };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  getContext(kind) { assert.equal(kind, '2d'); return this.context ||= canvasContext(); }
  setPointerCapture() {}
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  querySelector(selector) {
    assert.equal(selector, 'span', 'the DOM stub should not silently accept an unimplemented selector');
    return this.span ||= new Element('span');
  }
}

function makeDocument() {
  const document = new EventTarget();
  const elements = new Map(), touchButtons = [];
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const [, tag, attributes] = match;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1];
    const control = attributes.match(/\bdata-control="([^"]+)"/)?.[1];
    if (!id && !control) continue;
    const element = new Element(tag, attributes);
    if (id) { assert.ok(!elements.has(id), `duplicate DOM id ${id}`); elements.set(id, element); }
    if (control) { element.dataset.control = control; touchButtons.push(element); }
  }
  document.getElementById = id => elements.get(id) || null;
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => {
    assert.equal(selector, '[data-control]');
    return touchButtons;
  };
  document.hidden = false;
  return { document, elements };
}

async function bootHarness({ stored = null, unavailableStorage = false, fetchOK = true, imageryOK = true } = {}) {
  const { document, elements } = makeDocument();
  const window = new EventTarget();
  const pads = [];
  const storage = new Map(stored === null ? [] : [['nyc-after-hours-v1', stored]]);
  const frames = [], errors = [];
  const rendererInstances = [];
  let timestamp = 1000;
  class RendererStub {
    constructor() {
      this.shadowMap = {};
      this.info = { render: { calls: 0, triangles: 0 } };
      this.renderCount = 0;
      rendererInstances.push(this);
    }
    setPixelRatio(value) { this.pixelRatio = value; }
    setSize(width, height) { this.size = [width, height]; }
    render(scene, camera) {
      assert.ok(scene.isScene && camera.isPerspectiveCamera);
      assert.ok(Number.isFinite(camera.position.x + camera.position.y + camera.position.z));
      // Traverse real geometry once to catch invalid procedural coordinates and
      // broken factory contracts without pretending to compile GPU shaders.
      if (!this.renderCount) {
        let meshes = 0;
        scene.traverse(object => {
          if (!object.isMesh) return;
          meshes++;
          const positions = object.geometry?.attributes?.position?.array;
          if (positions) for (const coordinate of positions) assert.ok(Number.isFinite(coordinate));
          if (object.isInstancedMesh) for (const coordinate of object.instanceMatrix.array) assert.ok(Number.isFinite(coordinate));
        });
        assert.ok(meshes > 30, 'actual world and vehicle meshes should reach the renderer');
        this.info.render.calls = meshes;
      }
      this.renderCount++;
    }
  }
  const navigator = { getGamepads: () => pads };
  class ImageStub {
    set src(url) { assert.ok(url.startsWith('./assets/ortho/'));queueMicrotask(()=>imageryOK?this.onload():this.onerror()); }
  }
  const globals = { document, window, navigator, Image: ImageStub };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const context = vm.createContext({
    ...globals,
    THREE: { ...THREE, WebGLRenderer: RendererStub },
    createWorld, createCar, createPerson, Simulation, Input, HUD, CityAudio, applySurvey, loadOrthophoto,
    console: { error: error => errors.push(error), warn: () => {}, log: () => {} },
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    requestAnimationFrame: callback => frames.push(callback),
    fetch: async url => ({ ok: fetchOK, json: async () => ({'./city.json':city,'./survey.json':survey,'./facade-profiles.json':profiles,'./ortho.json':ortho})[url] }),
    localStorage: {
      getItem: key => { if (unavailableStorage) throw new Error('Storage disabled'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (unavailableStorage) throw new Error('Storage disabled'); storage.set(key, value); },
    },
  });
  function close() {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  try {
    // The imported modules above are the production modules. Only main's static
    // imports are replaced by those same bindings to run it without VM flags.
    vm.runInContext(main.replace(/^import .*;\s*$/gm, ''), context, { filename: 'main.js' });
    await new Promise(resolve => setImmediate(resolve));
    return {
      close, errors, elements, storage, pads, window, document, rendererInstances,
      state: () => window.nycGame.getState(),
      simulation: () => vm.runInContext('sim', context),
      click: id => elements.get(id).dispatch('click'),
      key: (code, down = true) => window.dispatch(down ? 'keydown' : 'keyup', { code, repeat: false, target: elements.get('world') }),
      frames(count = 1) {
        for (let i = 0; i < count; i++) {
          assert.equal(frames.length, 1, 'one animation loop should be scheduled');
          timestamp += 1000 / 60;
          frames.shift()(timestamp);
        }
      },
    };
  } catch (error) { close(); throw error; }
}

test('real city boots, walks, enters a cab, delivers, saves and pauses through production UI', async () => {
  const app = await bootHarness({ stored: JSON.stringify({ version: 1, cash: 225, deliveries: 2 }) });
  try {
    assert.equal(app.errors.length, 0, app.errors[0]?.stack);
    assert.equal(app.elements.get('start-button').disabled, false);
    assert.equal(app.state().buildings, applySurvey(city,survey).buildings.length);
    assert.equal(app.state().surveyBuildings, survey.buildings.length);
    assert.equal(app.state().imageryLoaded, true);
    assert.equal(app.state().cars, 16);
    assert.equal(app.state().cash, 225);
    app.frames(2);
    app.click('start-button');
    assert.equal(app.state().started, true);
    assert.equal(app.elements.get('intro').hidden, true);
    assert.equal(app.elements.get('world').focused, true);
    app.key('KeyV');app.key('KeyV',false);app.frames(2);
    assert.equal(app.state().aerialView,true);
    app.click('view-button');assert.equal(app.state().aerialView,false);
    app.click('sources-button');assert.equal(app.state().paused,true);
    assert.equal(app.elements.get('sources-dialog').open,true);
    app.elements.get('sources-dialog').close();assert.equal(app.state().paused,false);
    const initial = app.state().player;
    app.key('KeyW'); app.frames(12); app.key('KeyW', false);
    const walked = app.state().player;
    assert.ok(Math.hypot(walked.x - initial.x, walked.z - initial.z) > 0.2, 'keyboard input advances the real walking simulation');
    app.key('KeyR'); app.key('KeyR', false);
    app.key('KeyE'); app.key('KeyE', false);
    assert.equal(app.state().player.mode, 'drive');
    app.click('job-button');
    app.frames(6);
    assert.equal(app.state().mission.phase, 'active');
    assert.equal(app.elements.get('job-button').hidden, true);
    assert.equal(app.elements.get('mission-title').textContent, app.state().mission.target.name);
    assert.equal(app.elements.get('speed-unit').textContent, 'MPH');
    app.click('map-button');
    assert.ok(app.elements.get('map-panel').classes.has('expanded'));
    assert.equal(app.elements.get('minimap').width, 1000);
    app.key('KeyW'); app.frames(20); app.key('KeyW', false);
    assert.ok(app.state().player.speed > 1, 'accelerator reaches the actual controlled car');

    app.key('Escape'); app.key('Escape', false);
    assert.equal(app.state().paused, true);
    assert.equal(app.elements.get('pause-dialog').open, true);
    const paused = app.state();
    app.key('KeyW'); app.frames(30); app.key('KeyW', false);
    assert.equal(app.state().player.x, paused.player.x);
    assert.equal(app.state().player.z, paused.player.z);
    assert.equal(app.state().mission.timeLeft, paused.mission.timeLeft);
    app.click('resume-button');
    assert.equal(app.state().paused, false);
    assert.equal(app.elements.get('pause-dialog').open, false);

    // Place the real car at its real destination to test completion integration
    // deterministically, leaving route-driving behavior to simulation tests.
    const simulation = app.simulation();
    const vehicle = simulation.cars.find(car => car.id === simulation.player.vehicleId);
    Object.assign(vehicle, { x: simulation.mission.target.x, z: simulation.mission.target.z, speed: 0 });
    app.frames(12);
    assert.equal(app.state().mission.phase, 'complete');
    assert.equal(app.state().deliveries, 3);
    assert.ok(app.state().cash > 225);
    const saved = JSON.parse(app.storage.get('nyc-after-hours-v1'));
    assert.equal(saved.deliveries, app.state().deliveries);
    assert.equal(saved.cash, app.state().cash);
    assert.equal(app.elements.get('mission-kicker').textContent, 'DELIVERY COMPLETE');
    assert.equal(app.elements.get('job-button').hidden, false);
    app.document.hidden = true;
    app.document.dispatch('visibilitychange');
    assert.equal(app.state().paused, true);
    assert.ok(app.rendererInstances[0].renderCount > 60);
    assert.equal(app.errors.length, 0);
  } finally { app.close(); }
});

test('gamepad Start pauses and resumes without keyboard or mouse', async () => {
  const app = await bootHarness();
  try {
    assert.equal(app.errors.length, 0, app.errors[0]?.stack);
    app.click('start-button');
    const pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) };
    app.pads.push(pad);
    app.frames(2);
    pad.buttons[9].pressed = true; app.frames();
    assert.equal(app.state().paused, true);
    pad.buttons[9].pressed = false; app.frames(2);
    pad.buttons[9].pressed = true; app.frames();
    assert.equal(app.state().paused, false, 'the paused loop must still poll controller button edges');
    assert.equal(app.elements.get('pause-dialog').open, false);
  } finally { app.close(); }
});

test('blocked local storage does not prevent the game from starting or playing', async () => {
  const app = await bootHarness({ unavailableStorage: true });
  try {
    assert.equal(app.errors.length, 0, app.errors[0]?.stack);
    app.click('start-button');
    app.frames(12);
    assert.equal(app.state().started, true);
    assert.equal(app.state().cash, 0);
    assert.equal(app.storage.size, 0);
  } finally { app.close(); }
});

test('a failed city request displays the loading error and keeps play disabled', async () => {
  const app = await bootHarness({ fetchOK: false });
  try {
    assert.equal(app.errors.length, 1);
    assert.equal(app.elements.get('start-button').disabled, true);
    assert.equal(app.elements.get('load-error').hidden, false);
    assert.match(app.elements.get('load-error').textContent, /city data could not load/);
    assert.equal(app.window.nycGame, undefined);
  } finally { app.close(); }
});

test('failed aerial images retain playable surveyed geometry and disclose missing imagery', async () => {
  const app = await bootHarness({ imageryOK: false });
  try {
    assert.equal(app.errors.length, 0, app.errors[0]?.stack);
    assert.equal(app.state().imageryLoaded, false);
    assert.match(app.elements.get('imagery-status').textContent,/could not load/);
    assert.equal(app.elements.get('start-button').disabled,false);
    app.click('start-button');app.frames(2);
    assert.equal(app.state().started,true);
  } finally { app.close(); }
});
