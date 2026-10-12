import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCar, createPerson, updateCarVisuals } from '../dist/world.js';
import { Simulation } from '../dist/simulation.js';
import { Input } from '../dist/input.js';
import { HUD } from '../dist/hud.js';
import { CityAudio } from '../dist/audio.js';
import { createCityStream } from '../dist/city-stream.js';
import { createCityGround, worldToGeographic } from '../dist/city-ground.js';
import { createRoadStream, nearestStreet, localDestinations, cellsAround } from '../dist/road-stream.js';

// This is application integration QA, not a browser/GPU rendering test. The
// actual city geometry, physics, input and HUD run; browser primitives are fake.
const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url), 'utf8'));
const fixtureResources = new Map([[4341,'soho'],[4,'brooklyn'],[301,'queens'],[2264,'bronx'],[2737,'staten-island']]);
const fixtureBuffers = new Map([...fixtureResources].map(([resource, name]) => {
  const bytes = gunzipSync(readFileSync(new URL(`./fixtures/i3s-${name}.bin.gz`, import.meta.url)));
  return [resource, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)];
}));
// Keep each borough's real coordinates and geometry. Only the streaming tree is
// reduced so integration tests remain offline without copying the entire city.
const fixtureNodes = index.nodes.filter(node => fixtureResources.has(node.resource)).map(node => ({...node, parent:-1}));
const fixtureIndex = {...index, root:-1, roots:fixtureNodes.map(node=>node.id), nodes:[
  {...index.nodes.find(node=>node.id===index.root), id:-1, parent:null, children:fixtureNodes.map(node=>node.id)},
  ...fixtureNodes,
]};
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
    this.value = attributes.match(/value="([^"]*)"/)?.[1] || '0';
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
  click() { if(!this.disabled)this.dispatch('click'); }
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

async function bootHarness({ stored = null, unavailableStorage = false, fetchOK = true, geometryOK = true, imageryOK = true, coarsePointer = false, holdRoads = () => false } = {}) {
  const { document, elements } = makeDocument();
  const window = new EventTarget();
  const pads = [];
  const storage = new Map(stored === null ? [] : [['nyc-after-hours-v1', stored]]);
  const frames = [], errors = [], requests = [], roadWaiters = [];
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
      // Traverse real geometry once to catch invalid source coordinates and
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
    set src(url) {
      this.url=url;
      if(!url)return;
      assert.match(url,/^https:\/\/tiles\.arcgis\.com\/.+\/NYC_Orthos_2024\/MapServer\/tile\//);
      queueMicrotask(()=>{if(this.url===url)(imageryOK?this.onload:this.onerror)?.();});
    }
  }
  const fetcher = async function(url) {
    // Match native fetch: unqualified calls work, unrelated method receivers fail.
    if(this!=null&&this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    requests.push(url);
    if(!fetchOK)return {ok:false,status:503};
    if(url.startsWith(index.source.service)) {
      if(!geometryOK)return {ok:false,status:503};
      const resource=Number(url.match(/\/nodes\/(\d+)\/geometries\/0$/)?.[1]);
      assert.ok(fixtureBuffers.has(resource),`unexpected external geometry request: ${url}`);
      return {ok:true,arrayBuffer:async()=>fixtureBuffers.get(resource).slice(0)};
    }
    assert.ok(!/^https?:/.test(url),`integration test attempted an external request: ${url}`);
    const data=JSON.parse(readFileSync(new URL(`../dist/${url.replace(/^\.\//,'')}`,import.meta.url),'utf8'));
    if(Array.isArray(data.roads)&&holdRoads(url))await new Promise(resolve=>roadWaiters.push(resolve));
    return {ok:true,json:async()=>structuredClone(data)};
  };
  const globals = { document, window, navigator, Image: ImageStub, fetch:fetcher };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const context = vm.createContext({
    ...globals,
    THREE: { ...THREE, WebGLRenderer: RendererStub },
    createCar, createPerson, updateCarVisuals, Simulation, Input, HUD, CityAudio,
    createCityStream:(fullIndex,options)=>{
      assert.equal(fullIndex.stats.buildingFeatures,index.stats.buildingFeatures);
      return createCityStream(fixtureIndex,options);
    },
    createCityGround, worldToGeographic, createRoadStream, nearestStreet, localDestinations,
    console: { error: error => errors.push(error), warn: () => {}, log: () => {} },
    matchMedia: () => ({ matches: coarsePointer }),
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    requestAnimationFrame: callback => frames.push(callback),
    localStorage: {
      getItem: key => { if (unavailableStorage) throw new Error('Storage disabled'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (unavailableStorage) throw new Error('Storage disabled'); storage.set(key, value); },
    },
  });
  function close() {
    vm.runInContext('world?.dispose(); ground?.dispose();',context);
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  try {
    // The imported modules above are the production modules. Only main's static
    // imports are replaced by those same bindings to run it without VM flags.
    vm.runInContext(main.replace(/^import .*;\s*$/gm, ''), context, { filename: 'main.js' });
    async function until(predicate,message='application state did not settle') {
      for(let i=0;i<400;i++) {
        if(predicate())return;
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.fail(message);
    }
    await until(()=>vm.runInContext('bootReady',context)||!elements.get('load-error').hidden,'production boot did not finish');
    return {
      close, errors, elements, storage, pads, window, document, rendererInstances, requests, until,
      releaseRoads:()=>roadWaiters.splice(0).forEach(resolve=>resolve()),
      waitingRoads:()=>roadWaiters.length,
      state: () => window.nycGame.getState(),
      simulation: () => vm.runInContext('sim', context),
      camera: () => vm.runInContext('({position:camera.position.clone(),quaternion:camera.quaternion.clone(),yaw,near:camera.near,far:camera.far,fov:camera.fov})',context),
      vehicleVisual() {
        const simulation=vm.runInContext('sim',context),mesh=vm.runInContext('carModels',context).get(simulation.player.vehicleId);
        assert.ok(mesh,'the controlled vehicle must have a production scene model');
        mesh.updateWorldMatrix(true,true);
        const axle=front=>{
          const wheels=mesh.userData.wheels.filter(wheel=>wheel.userData.front===front);
          assert.equal(wheels.length,2);
          return wheels.reduce((sum,wheel)=>sum.add(wheel.getWorldPosition(new THREE.Vector3())),new THREE.Vector3()).multiplyScalar(.5);
        };
        return {forward:axle(true).sub(axle(false)).normalize(),frontSteering:mesh.userData.wheels.filter(wheel=>wheel.userData.front).map(wheel=>wheel.rotation.y)};
      },
      roadIndex: () => vm.runInContext('roadIndex', context),
      click: id => elements.get(id).click(),
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

test('five-borough app boots, walks, enters a cab, delivers, saves and pauses through production UI', async () => {
  const app = await bootHarness({ stored: JSON.stringify({ version: 1, cash: 225, deliveries: 2 }), coarsePointer:true });
  try {
    assert.equal(app.errors.length, 0, app.errors[0]?.stack);
    assert.equal(app.elements.get('start-button').disabled, false);
    assert.ok(app.state().buildings>=280,'actual SoHo I3S ground surfaces reach the simulation');
    assert.equal(app.state().totalBuildings,1083529);
    assert.ok(app.state().ground.loaded>0);
    assert.equal(app.state().bootReady,true);
    assert.equal(app.state().cars, 16);
    assert.equal(app.state().cash, 225);
    app.frames(2);
    app.click('start-button');
    assert.equal(app.state().started, true);
    assert.equal(app.elements.get('intro').hidden, true);
    assert.equal(app.elements.get('world').focused, true);
    assert.equal(app.state().cityView,true,'entering the game first exposes all five boroughs');
    assert.equal(app.elements.get('touch-controls').hidden,true,'city overview hides driving controls on touch devices');
    const overviewState=app.state(),overviewNotice=app.simulation().notice,overviewCars=app.simulation().cars;
    for(const code of ['KeyE','KeyN','KeyR']){
      app.key(code);app.key(code,false);
      assert.deepEqual(app.state().player,overviewState.player,`${code} cannot change the player from city overview`);
      assert.deepEqual(app.state().mission,overviewState.mission,`${code} cannot start or reset a job from city overview`);
      assert.equal(app.simulation().cars,overviewCars,`${code} cannot replace vehicles from city overview`);
      assert.equal(app.simulation().notice,overviewNotice,`${code} cannot trigger a gameplay notice from city overview`);
    }
    app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    assert.equal(app.state().stream.visibleChunks,5,'all five real borough fixtures reach the city overview');
    app.click('view-button');assert.equal(app.state().cityView,false);
    assert.equal(app.elements.get('touch-controls').hidden,false,'street view restores touch controls');
    app.key('KeyV');app.key('KeyV',false);app.frames(2);
    assert.equal(app.state().aerialView,true);
    app.click('view-button');assert.equal(app.state().cityView,true);
    assert.equal(app.elements.get('touch-controls').hidden,true,'returning to city overview hides touch controls again');
    app.click('city-button');assert.equal(app.state().cityView,false);assert.equal(app.state().aerialView,false);
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

test('unavailable survey geometry exhausts bounded retries and leaves play disabled',async()=>{
  const app=await bootHarness({geometryOK:false});
  try{
    assert.equal(app.errors.length,1);
    assert.equal(app.state().bootReady,false);
    assert.equal(app.elements.get('start-button').disabled,true);
    assert.equal(app.elements.get('load-error').hidden,false);
    assert.match(app.elements.get('load-error').textContent,/NYC geometry service returned 503/);
    assert.equal(app.requests.filter(url=>url.startsWith(index.source.service)).length,3);
    app.click('start-button');assert.equal(app.state().started,false);
  }finally{app.close();}
});

test('failed aerial images retain playable surveyed geometry and disclose missing imagery', async () => {
  const app = await bootHarness({ imageryOK: false });
  try {
    assert.equal(app.errors.length, 0, app.errors[0]?.stack);
    assert.equal(app.state().ground.loaded, 0);
    assert.ok(app.state().ground.failures>0);
    assert.match(app.elements.get('imagery-status').textContent,/unavailable/);
    assert.equal(app.elements.get('start-button').disabled,false);
    app.click('start-button');app.click('view-button');app.frames(2);
    assert.equal(app.state().started,true);
    assert.ok(app.state().buildings>=280);
  } finally { app.close(); }
});

test('borough selector loads actual Staten Island streets and geometry before moving the player',async()=>{
  const app=await bootHarness({stored:JSON.stringify({version:1,cash:375,deliveries:4})});
  try{
    app.click('start-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    const places=app.roadIndex().places;
    const destination=places.findIndex(place=>place.borough==='Staten Island');
    assert.ok(destination>=0);
    const initial={...app.state().player};
    app.elements.get('place-select').value=String(destination);
    app.click('travel-button');
    assert.equal(app.state().traveling,true);
    assert.equal(app.elements.get('travel-button').disabled,true);
    assert.equal(app.state().player.x,initial.x,'asynchronous travel retains the previous position until ready');
    await app.until(()=>!app.state().traveling);
    assert.equal(app.state().cityView,false);
    assert.equal(app.elements.get('travel-button').disabled,false);
    assert.ok(Math.hypot(app.state().player.x-initial.x,app.state().player.z-initial.z)>9000);
    assert.ok(Math.hypot(app.state().player.x-places[destination].x,app.state().player.z-places[destination].z)<100);
    assert.equal(app.state().stream.readyAtFocus,true);
    assert.equal(app.state().cash,375);assert.equal(app.state().deliveries,4);
    assert.ok(app.simulation().city.buildings.some(building=>building.polygon.some(([x,z])=>x < -6000 && z > 8500)),
      'the Staten Island fixture is decoded at its actual location and published to physics');
    app.frames(6);
    assert.equal(app.elements.get('district-name').textContent,'STATEN ISLAND');
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('a late street refresh cannot replace the roads of a newly selected borough',async()=>{
  const held=new Set();
  const app=await bootHarness({holdRoads:url=>held.has(url)});
  try{
    app.click('start-button');app.click('view-button');
    const queens=fixtureNodes.find(node=>node.resource===301);
    for(const cell of cellsAround(app.roadIndex(),queens))held.add(cell.url);
    Object.assign(app.simulation().player,{x:queens.x,z:queens.z});
    app.frames(2);
    await app.until(()=>app.waitingRoads()>0,'the old neighborhood street request should remain in flight');
    const destination=app.roadIndex().places.findIndex(place=>place.borough==='Staten Island');
    app.elements.get('place-select').value=String(destination);app.click('travel-button');
    await app.until(()=>!app.state().traveling);
    const roads=app.simulation().city.roads,arrival={...app.state().player};
    assert.ok(roads.length>0);
    app.releaseRoads();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.simulation().city.roads,roads,'road epoch rejects the stale Queens refresh');
    assert.equal(app.state().player.x,arrival.x);assert.equal(app.state().player.z,arrival.z);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.releaseRoads();app.close();}
});

function cameraRight(app){
  const right=new THREE.Vector3(1,0,0).applyQuaternion(app.camera().quaternion);
  right.y=0;return right.normalize();
}

function orbitWalkingCamera(app,targetYaw){
  const delta=Math.atan2(Math.sin(targetYaw-app.camera().yaw),Math.cos(targetYaw-app.camera().yaw));
  const canvas=app.elements.get('world');
  canvas.dispatch('pointerdown',{clientX:0,clientY:0,pointerId:1});
  canvas.dispatch('pointermove',{clientX:-delta/.005,clientY:0,pointerId:1});
  canvas.dispatch('pointerup',{pointerId:1});
  app.frames(75);
}

function aerialPose(app){
  const camera=app.camera(),direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  assert.ok(direction.y<-.1,'the aerial camera must look down toward the city');
  // Recover the viewed ground point geometrically, without depending on the
  // name or implementation of the camera's internal tracking state.
  const focus=camera.position.clone().addScaledVector(direction,-camera.position.y/direction.y);
  return {...camera,focus,distance:camera.position.distanceTo(focus)};
}

test('aerial movement and stopping translate a fixed view with sufficient ground depth precision',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    const sim=app.simulation(),spawn={...sim.player};
    const clear=sim.city.roads.flatMap(road=>road.points.slice(1).map((point,i)=>({x:(point[0]+road.points[i][0])/2,z:(point[1]+road.points[i][1])/2})))
      .find(point=>Math.hypot(point.x-spawn.x,point.z-spawn.z)<250&&!sim.isBlocked(point.x,point.z,4)
        &&sim.cars.every(car=>Math.hypot(car.x-point.x,car.z-point.z)>9));
    assert.ok(clear);
    Object.assign(sim.player,clear,{velocityX:0,velocityZ:0,speed:0});
    app.key('KeyV');app.key('KeyV',false);app.frames();
    const baseline=aerialPose(app),before={...sim.player};
    assert.ok(baseline.focus.distanceTo(new THREE.Vector3(sim.player.x,0,sim.player.z))<1e-6,
      'entering aerial view starts at the current player rather than easing from the prior camera position');
    assert.equal(baseline.position.y,240);
    const depthQuantum=baseline.distance**2*(baseline.far-baseline.near)/(baseline.far*baseline.near*(2**24-1));
    assert.ok(depthQuantum<.025/4,'24-bit depth precision must distinguish the 2.5cm aerial layer separation');
    app.key('KeyD');
    for(let frame=0;frame<48;frame++){
      if(frame===18)app.key('KeyD',false);
      app.frames();
      const pose=aerialPose(app);
      assert.ok(pose.quaternion.angleTo(baseline.quaternion)<1e-7,'following movement and deceleration must not rotate the whole city');
      assert.ok(Math.abs(pose.distance-baseline.distance)<1e-7,'camera and look target must translate together');
      assert.equal(pose.position.y,baseline.position.y);
      assert.equal(pose.fov,baseline.fov);
    }
    assert.ok(Math.hypot(sim.player.x-before.x,sim.player.z-before.z)>.4,'the fixed-view assertions must exercise actual player movement');
    assert.ok(aerialPose(app).position.distanceTo(baseline.position)>.25,'the camera still follows the moving player');
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('aerial entry, recovery and large location changes reset tracking without camera travel across the map',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    const sim=app.simulation();
    app.key('KeyV');app.key('KeyV',false);app.frames();
    const fixed=aerialPose(app);
    // A location discontinuity must not animate the camera through hundreds
    // of meters of intervening buildings while looking at a distant player.
    Object.assign(sim.player,{x:sim.player.x+300,z:sim.player.z+100,velocityX:0,velocityZ:0,speed:0});
    app.frames();
    let pose=aerialPose(app);
    assert.ok(pose.focus.distanceTo(new THREE.Vector3(sim.player.x,0,sim.player.z))<1e-6,'large location change resets the aerial focus');
    assert.ok(pose.quaternion.angleTo(fixed.quaternion)<1e-7);
    app.key('KeyR');app.key('KeyR',false);app.frames();
    pose=aerialPose(app);
    assert.ok(pose.focus.distanceTo(new THREE.Vector3(sim.player.x,0,sim.player.z))<1e-6,'recovery resets the aerial focus');
    app.click('view-button');assert.equal(app.state().cityView,true);app.frames(8);
    app.click('view-button');assert.equal(app.state().cityView,false);app.frames(8);
    assert.equal(app.state().aerialView,false);
    assert.ok(app.camera().near<1,'street view restores its close clipping range');
    app.key('KeyV');app.key('KeyV',false);app.frames();
    pose=aerialPose(app);
    assert.ok(pose.focus.distanceTo(new THREE.Vector3(sim.player.x,0,sim.player.z))<1e-6,'returning from city and street views starts at the current player');
    assert.ok(pose.quaternion.angleTo(fixed.quaternion)<1e-7);
    assert.ok(Math.abs(pose.distance-fixed.distance)<1e-7);
    assert.ok(pose.near>=3);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('walking A/D and arrow keys follow the visible camera right axis after orbiting',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    const sim=app.simulation(),spawn={...sim.player};
    const clear=sim.city.roads.flatMap(road=>road.points.slice(1).map((point,i)=>({x:(point[0]+road.points[i][0])/2,z:(point[1]+road.points[i][1])/2})))
      .find(point=>Math.hypot(point.x-spawn.x,point.z-spawn.z)<250&&!sim.isBlocked(point.x,point.z,4)
        &&sim.cars.every(car=>Math.hypot(car.x-point.x,car.z-point.z)>9));
    assert.ok(clear,'an actual nearby street must have room for a short lateral walking test');
    Object.assign(sim.player,clear,{velocityX:0,velocityZ:0,speed:0});
    for(const heading of [.37,1.89]){
      orbitWalkingCamera(app,heading);
      for(const [key,sign] of [['KeyD',1],['ArrowRight',1],['KeyA',-1],['ArrowLeft',-1]]){
        Object.assign(sim.player,{velocityX:0,velocityZ:0,speed:0});
        const before={...sim.player},right=cameraRight(app);
        app.key(key);app.frames(6);app.key(key,false);
        const delta=new THREE.Vector3(sim.player.x-before.x,0,sim.player.z-before.z);
        assert.ok(delta.dot(right)*sign>.025,`${key} must move toward its visible screen side at camera yaw ${heading}`);
      }
    }
    Object.assign(sim.player,{velocityX:0,velocityZ:0,speed:0});
    app.key('KeyV');app.key('KeyV',false);app.frames(75);
    assert.equal(app.state().aerialView,true);
    for(const [key,axis] of [['KeyD',new THREE.Vector3(1,0,0)],['KeyW',new THREE.Vector3(0,0,-1)]]){
      Object.assign(sim.player,{velocityX:0,velocityZ:0,speed:0});
      const before={...sim.player},direction=axis.applyQuaternion(app.camera().quaternion);
      direction.y=0;direction.normalize();
      app.key(key);app.frames(6);app.key(key,false);
      const delta=new THREE.Vector3(sim.player.x-before.x,0,sim.player.z-before.z);
      assert.ok(delta.length()>.025,`${key} must advance the walking simulation in aerial view`);
      assert.ok(delta.normalize().dot(direction)>.98,
        `${key} follows the aerial camera basis instead of the earlier chase-camera yaw`);
    }
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('entering a cab snaps behind its visible nose and W drives toward that nose',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    const sim=app.simulation(),cab=sim.getNearbyCar();
    assert.ok(cab,'the real spawn must place a cab within entering distance');
    orbitWalkingCamera(app,cab.angle+Math.PI);
    const nose=new THREE.Vector3(Math.sin(cab.angle),0,Math.cos(cab.angle));
    assert.ok(app.camera().position.clone().sub(new THREE.Vector3(cab.x,0,cab.z)).dot(nose)>.3,
      'set up the walking camera in front of the cab before entry');
    app.key('KeyE');app.key('KeyE',false);
    assert.equal(sim.player.mode,'drive');
    assert.ok(app.camera().position.clone().sub(new THREE.Vector3(cab.x,0,cab.z)).dot(nose)<-3,
      'entry must place the camera behind the cab immediately, before another frame');
    const visual=app.vehicleVisual(),before={x:cab.x,z:cab.z};
    assert.ok(visual.forward.dot(nose)>.99,'front and rear wheel positions establish the rendered vehicle nose');
    app.key('KeyW');app.frames(18);app.key('KeyW',false);
    const delta=new THREE.Vector3(cab.x-before.x,0,cab.z-before.z);
    assert.ok(cab.speed>1);
    assert.ok(delta.dot(visual.forward)>.15,'forward throttle moves the car along its actual rendered nose');
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('A/D steering turns the front wheels correctly in forward and reverse driving',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    app.key('KeyE');app.key('KeyE',false);app.frames();
    const sim=app.simulation(),car=sim.cars.find(car=>car.id===sim.player.vehicleId);
    assert.ok(car);
    const start={x:car.x,z:car.z,angle:car.angle};
    for(const speed of [5,-5])for(const [key,side] of [['KeyD',1],['KeyA',-1]]){
      Object.assign(car,start,{speed,_steering:0});
      Object.assign(sim.player,start,{speed});
      const forward=new THREE.Vector3(Math.sin(start.angle),0,Math.cos(start.angle));
      // A camera behind the +Z nose has world-right = forward cross up.
      const right=forward.clone().cross(new THREE.Vector3(0,1,0)).normalize();
      app.key(key);app.frames(8);app.key(key,false);
      const moved=new THREE.Vector3(car.x-start.x,0,car.z-start.z),visual=app.vehicleVisual();
      assert.ok(moved.dot(right)*side>.005,`${key} sends the ${speed>0?'front':'rear'} trajectory toward the requested side`);
      assert.ok(visual.forward.dot(right)*side*Math.sign(speed)>.01,
        'reversing changes nose yaw while preserving the physical steering direction');
      assert.ok(visual.frontSteering.every(angle=>angle*side<-.01),'visible front wheel yaw matches requested steering');
      assert.ok(moved.dot(forward)*Math.sign(speed)>.2,'each scenario actually moves in its selected gear');
    }
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});
