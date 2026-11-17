import { updateChaseHeight } from '../dist/vehicle-presentation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCar, createParkedCars, createPerson, updateCarVisuals, setVehicleLamps } from '../dist/world.js';
import { Simulation } from '../dist/simulation.js';
import { resetVehicleDynamics } from '../dist/vehicle-dynamics.js';
import { Input } from '../dist/input.js';
import { HUD } from '../dist/hud.js';
import { CityAudio } from '../dist/audio.js';
import { createCityStream } from '../dist/city-stream.js';
import { createCityGround, worldToGeographic } from '../dist/city-ground.js';
import { createRoadStream, nearestStreet, localDestinations, cellsAround } from '../dist/road-stream.js';
import { createCityNavigation } from '../dist/city-navigation.js';
import { createStreetDetail } from '../dist/street-detail.js';
import { Landscape } from '../dist/landscape.js';
import { RoadPilot } from '../dist/road-pilot.js';
import { GameMap } from '../dist/game-map.js';
import { createRoutePlanner } from '../dist/route-planner.js';
import { createGraphics } from '../dist/gfx.js';
import { createStreetscape, ROAD_LIFT, SIDEWALK_LIFT } from '../dist/streetscape.js';
import { createStreetLife } from '../dist/streetlife.js';
import { createWater } from '../dist/water.js';
import { createCityLife, manhattanCore } from '../dist/citylife.js';

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
  removeEventListener(name, listener) {
    this.listeners.set(name,(this.listeners.get(name)||[]).filter(candidate=>candidate!==listener));
  }
  dispatch(name, detail = {}) {
    const event = { target: this, button:0, preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped=true; }, stopImmediatePropagation() { this.propagationStopped=true; }, ...detail, currentTarget:this };
    for (const listener of this.listeners.get(name) || []) listener(event);
    if(event.bubbles&&!event.propagationStopped&&this.parentElement)this.parentElement.dispatch(name,event);
    return event;
  }
}

function canvasContext() {
  const context = {};
  for (const method of ['setTransform', 'quadraticCurveTo', 'drawImage', 'fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'roundRect', 'arc', 'fill', 'stroke', 'fillText', 'save', 'restore', 'translate', 'rotate', 'setLineDash']) {
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
    this.children = [];
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
  removeAttribute(name) { this.attributes.delete(name); }
  getContext(kind) { assert.equal(kind, '2d'); return this.context ||= canvasContext(); }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return {left:0,top:0,right:1440,bottom:900,width:1440,height:900}; }
  append(...nodes) { for(const node of nodes){node.parentElement=this;this.children.push(node);} }
  appendChild(node) { this.append(node);return node; }
  replaceChildren(...nodes) { for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes); }
  contains(node) { return node===this||this.children.some(child=>child.contains(node)); }
  closest(selector) { return selector.toUpperCase()===this.tagName?this:this.parentElement?.closest(selector)||null; }
  click() { if(!this.disabled)this.dispatch('click',{bubbles:true}); }
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

async function bootHarness({ stored = null, displayStored = null, unavailableStorage = false, fetchOK = true, geometryOK = true, imageryOK = true, streetFailure = null, landscapeFailure = false, roadPilotFailure = false, navigationFailure = false, baseWaterFailure = false, terrainElevation = 0, coarsePointer = false, holdRoads = () => false, holdLandscape = () => false, measuredLandscape = false, extraGeometry = [], geocodeFetch = null } = {}) {
  const { document, elements } = makeDocument();
  const window = new EventTarget();
  const pads = [];
  const storage = new Map(stored === null ? [] : [['nyc-after-hours-v1', stored]]);
  if(displayStored!==null)storage.set('nyc-after-hours-display-v1',displayStored);
  const frames = [], errors = [], requests = [], imageRequests = [], roadWaiters = [], landscapeWaiters = [];
  const geometryBuffers=new Map(fixtureBuffers),extraNodes=[];
  for(const fixture of extraGeometry){
    const resource=typeof fixture==='number'?fixture:fixture.resource;
    const name=typeof fixture==='number'?`prospect-${resource}`:fixture.name;
    const bytes=gunzipSync(readFileSync(new URL(`./fixtures/i3s-${name}.bin.gz`,import.meta.url)));
    geometryBuffers.set(resource,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    extraNodes.push({...index.nodes.find(node=>node.resource===resource),parent:-1});
  }
  const geometryIndex={...fixtureIndex,roots:[...fixtureIndex.roots,...extraNodes.map(node=>node.id)],nodes:[...fixtureIndex.nodes,...extraNodes]};
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
      scene.updateMatrixWorld();camera.updateMatrixWorld();
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
      // The bundled land silhouette loads from the game's own assets.
      if(url.startsWith('./assets/context/')){queueMicrotask(()=>this.onload?.());return;}
      assert.match(url,/^https:\/\/tiles\.arcgis\.com\/.+\/NYC_Orthos_2024\/MapServer\/tile\//);
      imageRequests.push(url);
      queueMicrotask(()=>{if(this.url===url)(imageryOK?this.onload:this.onerror)?.();});
    }
  }
  const fetcher = async function(url,options={}) {
    // Match native fetch: unqualified calls work, unrelated method receivers fail.
    if(this!=null&&this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    url=String(url);requests.push(url);
    if(!fetchOK)return {ok:false,status:503};
    if(roadPilotFailure&&url==='./road-pilot.json')return {ok:false,status:503};
    if(navigationFailure&&url==='./navigation-roads.json')return {ok:false,status:503};
    if(baseWaterFailure&&url==='./landscape/nyc-water.json')return {ok:false,status:503};
    if(landscapeFailure&&url==='./landscape-index.json')return {ok:false,status:503};
    if(streetFailure==='stalled-index'&&url==='./street-detail-index.json')return new Promise(()=>{});
    if(streetFailure==='index'&&url==='./street-detail-index.json')return {ok:false,status:503};
    if(streetFailure==='chunks'&&url.startsWith('./street-detail/'))return {ok:false,status:503};
    if(url.startsWith('https://geosearch.planninglabs.nyc/v2/search')){
      assert.ok(geocodeFetch,'address requests must have an explicit offline fixture');
      return geocodeFetch(new URL(url),options);
    }
    if(url.startsWith(index.source.service)) {
      if(!geometryOK)return {ok:false,status:503};
      const resource=Number(url.match(/\/nodes\/(\d+)\/geometries\/0$/)?.[1]);
      assert.ok(geometryBuffers.has(resource),`unexpected external geometry request: ${url}`);
      return {ok:true,arrayBuffer:async()=>geometryBuffers.get(resource).slice(0)};
    }
    assert.ok(!/^https?:/.test(url),`integration test attempted an external request: ${url}`);
    let data=JSON.parse(readFileSync(new URL(`../dist/${url.replace(/^\.\//,'')}`,import.meta.url),'utf8'));
    // Geometry/source tests verify the complete DEMs. This application's offline
    // fixture keeps their real bounds with a known elevation to expose flat-Y
    // integration bugs without allocating every citywide grid in every UI test.
    if(url.startsWith('./landscape/')&&measuredLandscape){
      // Keep actual terrain and mapped water for destination safety. Crown
      // rendering has its own tests and is unrelated to collision readiness.
      if(data.canopies)data={...data,canopies:[]};
    }else if(url.startsWith('./landscape/'))data=data.heights
      ?{...data,width:2,height:2,heights:Array(4).fill(terrainElevation)}
      :{...data,water:[],canopies:[]};
    if(Array.isArray(data.roads)&&holdRoads(url))await new Promise(resolve=>roadWaiters.push(resolve));
    if(holdLandscape(url))await new Promise(resolve=>landscapeWaiters.push(resolve));
    return {ok:true,json:async()=>structuredClone(data)};
  };
  const globals = { document, window, navigator, Image: ImageStub, fetch:fetcher };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const context = vm.createContext({
    ...globals,
    THREE: { ...THREE, WebGLRenderer: RendererStub },
    createCar, createParkedCars, createPerson, updateCarVisuals, Simulation, Input, HUD, CityAudio, GameMap, createRoutePlanner,
    createCityStream:(fullIndex,options)=>{
      assert.equal(fullIndex.stats.buildingFeatures,index.stats.buildingFeatures);
      return createCityStream(geometryIndex,options);
    },
    updateChaseHeight, createCityGround, worldToGeographic, createRoadStream, nearestStreet, localDestinations, createCityNavigation,
    createStreetDetail:(manifest,options)=>createStreetDetail(manifest,{...options,now:()=>timestamp}),
    Landscape, RoadPilot, AbortSignal, createGraphics, createStreetLife, createWater, setVehicleLamps, createCityLife, manhattanCore,
    // Bundled survey cells only: these tests stay offline.
    createStreetscape:options=>createStreetscape({...options,live:false,now:()=>timestamp}),
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
    vm.runInContext('if(typeof gameMap!=="undefined")gameMap?.dispose?.();if(typeof navigation!=="undefined")navigation?.dispose?.();if(typeof roadPilot!=="undefined")roadPilot?.dispose();landscape?.dispose();streetDetail?.dispose();streetscape?.dispose();streetLife?.dispose();parkedCars?.dispose();water?.dispose();world?.dispose();ground?.dispose();gfx?.dispose();',context);
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
      close, errors, elements, storage, pads, window, document, rendererInstances, requests, imageRequests, until,
      setStreetFailure:value=>{streetFailure=value;},
      setBaseWaterFailure:value=>{baseWaterFailure=value;},
      advanceTime:milliseconds=>{timestamp+=milliseconds;},
      releaseRoads:()=>roadWaiters.splice(0).forEach(resolve=>resolve()),
      waitingRoads:()=>roadWaiters.length,
      releaseLandscape:()=>landscapeWaiters.splice(0).forEach(resolve=>resolve()),
      waitingLandscape:()=>landscapeWaiters.length,
      state: () => window.nycGame.getState(),
      simulation: () => vm.runInContext('sim', context),
      gameMap: () => vm.runInContext('gameMap', context),
      camera: () => vm.runInContext('({position:camera.position.clone(),quaternion:camera.quaternion.clone(),yaw,near:camera.near,far:camera.far,fov:camera.fov})',context),
      renderState: () => vm.runInContext('({scene,localOrthophoto:ground.localOrthophoto,roofUniforms:world.orthoUniforms})',context),
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
      screenPoint(x,z) {
        const camera=vm.runInContext('camera',context).clone();camera.updateMatrixWorld();
        const point=new THREE.Vector3(x,0,z).project(camera);
        return {clientX:(point.x+1)*720,clientY:(1-point.y)*450};
      },
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
    assert.equal(app.elements.get('game-map').hidden,false);
    assert.equal(app.state().map.open,true);
    app.click('game-map-close');
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

test('street view builds surveyed SoHo street surfaces and shares source imagery with roofs and shadow receivers', async () => {
  const app = await bootHarness();
  try {
    app.frames(2);
    assert.equal(app.state().streetscape.surfaces,0);
    assert.ok(!app.requests.some(url=>url.startsWith('./street-detail/')),'city overview does not download neighborhood surface chunks');
    assert.equal(app.rendererInstances[0].shadowMap.enabled,true,'the opening skyline shot is lit with sun shadows');
    const roofMaterial=app.renderState().scene.getObjectByName('NYC survey node 4341').material;
    const openingMaterialVersion=roofMaterial.version;
    app.click('start-button');app.frames(2);
    assert.equal(app.rendererInstances[0].shadowMap.enabled,false,'the five-borough map draws no sun shadows');
    assert.ok(roofMaterial.version>openingMaterialVersion,'leaving the opening shot invalidates the shadow shader variant');
    const overviewMaterialVersion=roofMaterial.version;
    app.click('view-button');app.frames(2);
    assert.ok(roofMaterial.version>overviewMaterialVersion,'entering local view invalidates the shadow shader variant');
    const localMaterialVersion=roofMaterial.version;
    await app.until(()=>{app.frames();return app.state().streetscape.cells>0&&app.state().streetscape.loading===0&&app.state().streetDetail.loading===0&&app.state().ground.loading===0;});
    app.frames();
    assert.equal(roofMaterial.version,localMaterialVersion,'steady local rendering must not recompile materials every frame');
    const {scene,localOrthophoto,roofUniforms}=app.renderState();
    const group=scene.getObjectByName('NYC mapped street surfaces');
    assert.ok(group?.visible);
    assert.ok(group.getObjectByName('NYC measured transport decks'),'source bridge decks have a separate height batch');
    const mesh=group.children[0];
    assert.equal(mesh.visible,false,'the aerial drape gives way to built street surfaces');
    assert.equal(mesh.geometry.attributes.position?.count||0,0,'no hidden duplicate of the street polygons is built');
    // Roadbeds, sidewalks and paint are built from the bundled survey outlines.
    const streets=scene.getObjectByName('Street surfaces');
    assert.ok(streets?.visible);
    assert.ok(app.state().streetscape.surfaces>100,'bundled official outlines reach the production scene');
    const kindOf=name=>streets.children.filter(child=>child.name.startsWith(`Street ${name} `));
    const roads=kindOf('road'),walks=kindOf('walk'),paint=kindOf('marks');
    assert.ok(roads.length>0&&walks.length>0&&paint.length>0,'asphalt, sidewalks and road paint each have a batch');
    assert.ok(roads.reduce((sum,child)=>sum+child.geometry.attributes.position.count,0)>1000);
    // The offline terrain is flat at zero, so heights show exactly what was added.
    const near=(a,b)=>Math.abs(a-b)<1e-6;
    for(const child of roads){const p=child.geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(near(p.getY(i),ROAD_LIFT),'roadbeds lie one fixed lift above measured ground');}
    for(const child of walks){const p=child.geometry.attributes.position;for(let i=0;i<p.count;i++){
      const y=p.getY(i);assert.ok(near(y,ROAD_LIFT)||near(y,SIDEWALK_LIFT)||near(y,SIDEWALK_LIFT+.004)||near(y,-.03),`sidewalks rise one kerb above the roadbed, not ${y}`);
    }}
    for(const child of [...roads,...walks,...paint])assert.ok(child.material.isMeshStandardMaterial&&child.receiveShadow);
    assert.ok(app.state().streetscape.lamps>10,'street lamps stand along surveyed kerbs');
    assert.ok(scene.getObjectByName('Street lamps').count>10);
    // Cars stand at those kerbs: simulated like any other, drawn together.
    app.frames(2);
    const parked=app.state().parkedCars,parkedGroup=scene.getObjectByName('Parked cars');
    assert.ok(parked>20,`${parked} cars are parked around the SoHo spawn`);
    assert.equal(parkedGroup.children.filter(child=>/bodies$/.test(child.name)).reduce((sum,child)=>sum+child.count,0),parked);
    assert.equal(parkedGroup.getObjectByName('Parked car tyres').count,parked*4);
    assert.equal(scene.children.filter(child=>child.userData?.chassis).length,app.state().cars-parked,'only cars that move have a model of their own');
    assert.equal(app.elements.get('quality-button').textContent,'QUALITY: BALANCED');
    assert.equal(app.rendererInstances[0].shadowMap.enabled,true,'balanced quality retains nearby shadows');
    const localGround=scene.getObjectByName('NYC 2024 aerial imagery').children.filter(child=>child.visible&&child.material.isMeshStandardMaterial);
    assert.ok(localGround.length>0);
    assert.ok(localGround.every(child=>child.receiveShadow&&child.material.map.colorSpace===THREE.SRGBColorSpace));
    assert.ok(app.imageRequests.some(url=>url.includes('/tile/19/')),'local appearance uses the actual high-resolution orthophoto service');
    assert.equal(localOrthophoto.texture.image.width,2304);
    assert.equal(localOrthophoto.texture.colorSpace,THREE.SRGBColorSpace);
    assert.equal(roofUniforms.cityUseLocalOrtho.value,true);
    assert.equal(roofUniforms.cityLocalOrtho.value,localOrthophoto.texture);
    assert.deepEqual(roofUniforms.cityLocalOrthoBounds.value.toArray(),[
      localOrthophoto.bounds.minX,localOrthophoto.bounds.maxX,localOrthophoto.bounds.minZ,localOrthophoto.bounds.maxZ,
    ]);
    // Inspect the production shader hook's bindings without claiming a GPU
    // compile. Both street and roof sampling must see the same moving atlas.
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    mesh.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.streetUseLocal.value,true);
    assert.equal(shader.uniforms.streetLocal.value,localOrthophoto.texture);
    assert.deepEqual(shader.uniforms.streetLocalBounds.value.toArray(),roofUniforms.cityLocalOrthoBounds.value.toArray());
    const destination=app.roadIndex().places.findIndex(place=>place.borough==='Staten Island');
    app.elements.get('place-select').value=String(destination);app.click('travel-button');
    await app.until(()=>!app.state().traveling);app.frames(2);
    assert.equal(app.state().streetDetail.covered,false);
    assert.equal(app.state().streetscape.surfaces,0,'SoHo outlines do not follow the player into another borough');
    assert.ok(streets.children.every(child=>!child.visible),'street batches from the previous neighbourhood are hidden');
    assert.equal(app.elements.get('street-detail-status').textContent,'');
    assert.equal(localOrthophoto.texture,app.renderState().localOrthophoto.texture,'travel moves atlas coverage without replacing its GPU texture');
    assert.ok(localOrthophoto.bounds.minX<app.state().player.x&&localOrthophoto.bounds.maxX>app.state().player.x);
    assert.ok(localOrthophoto.bounds.minZ<app.state().player.z&&localOrthophoto.bounds.maxZ>app.state().player.z);
    const beforeCityMaterialVersion=roofMaterial.version;
    app.click('city-button');app.frames();
    assert.equal(group.visible,false);
    assert.equal(streets.visible,false);
    assert.equal(app.rendererInstances[0].shadowMap.enabled,false);
    assert.ok(roofMaterial.version>beforeCityMaterialVersion,'city overview invalidates the now-disabled shadow variant');
    const cityMaterialVersion=roofMaterial.version;app.frames();
    assert.equal(roofMaterial.version,cityMaterialVersion);
    assert.equal(app.errors.length,0);
  } finally { app.close(); }
});

test('failed or stalled optional street data keep the full city playable', async () => {
  for(const streetFailure of ['index','chunks','stalled-index']){
    const app=await bootHarness({streetFailure});
    try{
      assert.equal(app.state().bootReady,true);
      assert.equal(app.elements.get('load-error').hidden,true);
      app.click('start-button');app.click('view-button');app.frames(2);
      if(streetFailure!=='chunks'){
        assert.equal(app.state().streetDetail,null);
        if(streetFailure==='index')assert.match(app.elements.get('street-detail-status').textContent,/Mapped street data is unavailable/);
        else assert.equal(app.elements.get('street-detail-status').textContent,'','a pending optional request does not manufacture an error');
      }
      else{
        await app.until(()=>app.state().streetDetail.failures>0&&app.state().streetDetail.loading===0);
        assert.equal(app.state().streetscape.surfaces,0);
        assert.match(app.elements.get('street-detail-status').textContent,/mapped street surfaces are unavailable here/);
      }
      const before=app.state().player;
      app.key('KeyW');app.frames(20);app.key('KeyW',false);
      assert.ok(Math.hypot(app.state().player.x-before.x,app.state().player.z-before.z)>.1,'optional surface failure cannot block walking');
      const destination=app.roadIndex().places.findIndex(place=>place.borough==='Staten Island');
      app.elements.get('place-select').value=String(destination);app.click('travel-button');
      await app.until(()=>!app.state().traveling);app.frames(8);
      assert.equal(app.elements.get('district-name').textContent,'STATEN ISLAND');
      assert.equal(app.state().stream.readyAtFocus,true);
      if(streetFailure==='chunks'){
        assert.equal(app.elements.get('street-detail-status').textContent,'','leaving mapped coverage clears its failed-chunk warning');
        const soho=app.roadIndex().places.findIndex(place=>place.name==='SoHo');
        assert.ok(soho>=0);
        app.elements.get('place-select').value=String(soho);app.click('travel-button');
        await app.until(()=>!app.state().traveling);app.frames();
        await app.until(()=>app.state().streetDetail.failures>0&&app.state().streetDetail.loading===0);
        assert.match(app.elements.get('street-detail-status').textContent,/unavailable here/);
        app.setStreetFailure(null);app.advanceTime(5001);app.frames();
        await app.until(()=>{app.frames();return app.state().streetDetail.failures===0&&app.state().streetDetail.loading===0
          &&app.state().streetscape.failures===0&&app.state().streetscape.loading===0&&app.state().streetscape.cells>0;});
        app.frames();
        assert.ok(app.state().streetscape.surfaces>100,'street surfaces return once their source does');
        assert.equal(app.elements.get('street-detail-status').textContent,'','successful source retries clear the Sources notice');
      }
      assert.equal(app.errors.length,0);
    }finally{app.close();}
  }
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

async function prepareChaseReplay(app){
  app.click('start-button');app.click('view-button');app.frames(2);
  await app.until(()=>app.state().stream.loading===0);
  app.key('KeyE');app.key('KeyE',false);app.frames();
  const sim=app.simulation(),car=sim.cars.find(candidate=>candidate.id===sim.player.vehicleId);
  assert.ok(car);
  const clear=sim.city.roads.flatMap(road=>road.points).map(([x,z])=>({x,z}))
    .find(point=>Math.hypot(point.x-car.x,point.z-car.z)<300&&!sim.isBlocked(point.x,point.z,11));
  assert.ok(clear,'the camera benchmark needs an actually unobstructed source location');
  // Replay known telemetry while simulation is paused. This isolates camera
  // response from driving tuning while retaining the production source map,
  // camera collision checks, rendered vehicle, and pointer input bindings.
  app.key('Escape');app.key('Escape',false);
  const pose=(angle,speed,travelAngle=angle)=>{
    const state={...clear,angle,speed,velocityX:Math.sin(travelAngle)*speed,velocityZ:Math.cos(travelAngle)*speed};
    Object.assign(car,state);Object.assign(sim.player,state);
  };
  return {car,pose};
}

function chasePose(app){
  const camera=app.camera(),player=app.state().player;
  const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  assert.ok(direction.y<0);
  const target=camera.position.clone().addScaledVector(direction,(1.1-camera.position.y)/direction.y);
  const lookAhead=target.sub(new THREE.Vector3(player.x,1.1,player.z));
  const behind=camera.position.clone().sub(new THREE.Vector3(player.x,camera.position.y,player.z)).normalize();
  const lag=Math.abs(Math.atan2(Math.sin(player.angle-Math.atan2(-behind.x,-behind.z)),Math.cos(player.angle-Math.atan2(-behind.x,-behind.z))));
  return {camera,lookAhead,behind,lag};
}

test('chase camera tracks sustained turns promptly and previews forward travel without flipping in reverse',async()=>{
  const app=await bootHarness();
  try{
    const {car,pose}=await prepareChaseReplay(app);
    let angle=car.angle;
    pose(angle,18);app.frames(120);
    for(const side of [-1,1]){
      let maximumLag=0;
      for(let frame=0;frame<120;frame++){
        angle+=side*.9/60;pose(angle,18);app.frames();
        const view=chasePose(app);
        if(frame>30)maximumLag=Math.max(maximumLag,view.lag);
        assert.ok(view.lookAhead.length()<=3.00001,'view target stays within three meters of the car');
      }
      assert.ok(maximumLag<.23,`sustained turn must remain readable behind the nose; lag=${maximumLag}`);
    }
    pose(angle,40,angle+.3);app.frames(150);
    const preview=chasePose(app).lookAhead;
    assert.ok(preview.length()>2.99&&preview.length()<=3.00001);
    assert.ok(preview.clone().normalize().dot(new THREE.Vector3(Math.sin(angle+.3),0,Math.cos(angle+.3)))>.999,
      'look-ahead follows actual forward travel during a slide');
    pose(angle,-7);app.frames(120);
    const reverse=chasePose(app);
    assert.ok(reverse.behind.dot(new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)))<-.99,'reverse keeps the camera behind the nose');
    assert.ok(reverse.lookAhead.length()<.001,'reverse fades the forward preview instead of aiming across the car');
    pose(angle,0);app.frames(120);
    const stopped=app.camera();app.frames(60);
    assert.ok(app.camera().position.distanceTo(stopped.position)<.001);
    assert.ok(app.camera().quaternion.angleTo(stopped.quaternion)<.001,'stopped camera settles without oscillation');
    assert.equal(app.errors.length,0);
  }finally{app.close();}
});

test('manual driving orbit owns the view before chase assistance returns gradually',async()=>{
  const app=await bootHarness();
  try{
    const {car,pose}=await prepareChaseReplay(app);
    pose(car.angle,12);app.frames(120);
    const canvas=app.elements.get('world');
    canvas.dispatch('pointerdown',{clientX:0,clientY:0,pointerId:4});
    canvas.dispatch('pointermove',{clientX:-.9/.005,clientY:0,pointerId:4});
    canvas.dispatch('pointerup',{pointerId:4});app.frames();
    const manualYaw=app.camera().yaw;
    app.frames(60);
    assert.ok(Math.abs(app.camera().yaw-manualYaw)<1e-9,'automatic tracking respects the manual-orbit hold');
    app.frames(8);
    const firstReturn=Math.abs(app.camera().yaw-manualYaw);
    assert.ok(firstReturn>0&&firstReturn<.025,'tracking eases in after the hold instead of snapping back');
    app.frames(120);
    assert.ok(chasePose(app).lag<.01,'normal chase view recovers after manual orbit');
    assert.equal(app.errors.length,0);
  }finally{app.close();}
});

test('driving look-ahead stays in front of actual surveyed walls',async()=>{
  const app=await bootHarness();
  try{
    const {car}=await prepareChaseReplay(app),sim=app.simulation();
    let wall;
    for(const building of sim.city.buildings){
      const ring=building.polygon;
      for(let i=0;i<ring.length&&!wall;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        if(length<10)continue;
        const middle={x:(a[0]+b[0])/2,z:(a[1]+b[1])/2};
        if(Math.hypot(middle.x-car.x,middle.z-car.z)>200)continue;
        for(const side of [-1,1]){
          const nx=-dz/length*side,nz=dx/length*side;
          const outside={x:middle.x+nx*2.5,z:middle.z+nz*2.5};
          if(!sim.isBlocked(outside.x,outside.z,.2)&&sim.isBlocked(middle.x-nx*.4,middle.z-nz*.4,.1)){
            wall={...outside,angle:Math.atan2(-nx,-nz)};break;
          }
        }
      }
      if(wall)break;
    }
    assert.ok(wall,'use a real source facade with open space in front');
    const pose={...wall,speed:40,velocityX:Math.sin(wall.angle)*40,velocityZ:Math.cos(wall.angle)*40};
    Object.assign(car,pose);Object.assign(sim.player,pose);app.frames(150);
    const preview=chasePose(app).lookAhead;
    assert.ok(preview.length()<2.5,'wall truncates an otherwise three-meter preview');
    assert.equal(sim.isBlocked(car.x+preview.x,car.z+preview.z,.15),false,'the final smoothed target remains outside the facade');
  }finally{app.close();}
});

test('keyboard, controller and touch handbrakes reach driving without replacing throttle or service braking',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.frames(2);
    await app.until(()=>app.state().stream.loading===0);
    app.key('KeyE');app.key('KeyE',false);app.frames();
    const sim=app.simulation(),car=sim.cars.find(candidate=>candidate.id===sim.player.vehicleId);
    assert.ok(car);
    const samples=[],step=sim.step.bind(sim);
    sim.step=(controls,dt)=>{samples.push({...controls});return step(controls,dt);};
    app.key('KeyW');app.frames(30);app.key('KeyD');app.key('Space');app.frames(8);
    assert.equal(samples.at(-1).handbrake,true);
    assert.equal(samples.at(-1).brake,false);
    assert.equal(samples.at(-1).forward,1);
    assert.equal(samples.at(-1).turn,1);
    assert.ok(car.speed>0,'a short handbrake tap is not an instantaneous stop');
    assert.ok(app.vehicleVisual().frontSteering.every(angle=>angle<0),'handbraking preserves right-wheel steering direction');
    app.key('Space',false);app.frames();assert.equal(samples.at(-1).handbrake,false);
    app.key('KeyW',false);app.key('KeyD',false);
    const pad={axes:[.6,0,0,0],buttons:Array.from({length:12},()=>({pressed:false,value:0}))};
    pad.buttons[7].value=.8;pad.buttons[2].pressed=true;app.pads.push(pad);app.frames();
    assert.equal(samples.at(-1).handbrake,true);
    assert.equal(samples.at(-1).forward,.8);
    assert.ok(samples.at(-1).turn>0);
    pad.buttons[2].pressed=false;pad.buttons[7].value=0;pad.buttons[6].value=.7;app.frames();
    assert.equal(samples.at(-1).handbrake,false);
    assert.equal(samples.at(-1).forward,-.7,'left trigger retains brake/reverse intent');
    app.pads.length=0;
    const brake=app.document.querySelectorAll('[data-control]').find(button=>button.dataset.control==='brake');
    brake.dispatch('pointerdown',{pointerId:9});app.frames();assert.equal(samples.at(-1).handbrake,true);
    brake.dispatch('pointerup',{pointerId:9});app.frames();assert.equal(samples.at(-1).handbrake,false);
    app.key('KeyS');app.frames();app.key('KeyS',false);
    assert.equal(samples.at(-1).forward,-1);
    assert.equal(samples.at(-1).handbrake,false,'reverse key stays separate from handbrake');
    assert.equal(app.errors.length,0);
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
      Object.assign(car,start);resetVehicleDynamics(car,speed);
      Object.assign(sim.player,start,{speed});
      const forward=new THREE.Vector3(Math.sin(start.angle),0,Math.cos(start.angle));
      // A camera behind the +Z nose has world-right = forward cross up.
      const right=forward.clone().cross(new THREE.Vector3(0,1,0)).normalize();
      // Give yaw and tire grip time to respond before checking the path's
      // sign; the new inertial handling no longer rotates velocity instantly.
      app.key(key);app.frames(16);app.key(key,false);
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

function addressFeature({name='10 RICHMOND TERRACE',lon=-74.076018,lat=40.642348,borough='Staten Island',id='4270085'}={}){
  return {type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{id,gid:`nycpad:venue:${id}`,
    source:'nycpad',name,borough,region_a:'NY',country_code:'US',label:`${name}, ${borough}, NY, USA`}};
}
const addressResponse=features=>({ok:true,json:async()=>({type:'FeatureCollection',features})});
function submitAddress(app,value){
  app.elements.get('address-input').value=value;
  app.elements.get('address-input').dispatch('input');
  app.elements.get('address-form').dispatch('submit');
}

test('an address result selects a spawn and waits for real destination data before travel',async()=>{
  let hold=false;
  const app=await bootHarness({geocodeFetch:async()=>addressResponse([addressFeature()]),holdRoads:()=>hold});
  try{
    app.click('start-button');app.frames(2);
    const before=app.state().player;
    app.elements.get('world').dispatch('wheel',{deltaY:-3000});app.frames(120);
    const navigation=app.elements.get('city-navigation');
    assert.equal(navigation.classes.has('has-spawn'),false);
    assert.equal(app.elements.get('spawn-button').disabled,true);
    submitAddress(app,'10 Richmond Terrace');
    await app.until(()=>!app.state().navigation.searching);
    const results=app.elements.get('address-results').children;
    assert.equal(results.length,1);
    assert.equal(app.state().navigation.selected,null,'search alone cannot choose or move the player');
    assert.deepEqual(app.state().player,before);
    results[0].click();
    assert.match(app.state().navigation.selected.name,/RICHMOND TERRACE/i);
    assert.match(app.elements.get('spawn-note').textContent,/Staten Island/,'the selected address keeps its borough for disambiguation');
    assert.equal(navigation.classes.has('has-spawn'),true);
    assert.equal(navigation.classes.has('is-picking'),false);
    assert.equal(app.elements.get('spawn-button').disabled,false);
    assert.deepEqual(app.state().player,before,'choosing a result only previews the location');
    app.frames();assert.equal(app.elements.get('spawn-pin').hidden,false);
    const selected=app.state().navigation.selected,projected=app.screenPoint(selected.x,selected.z);
    assert.ok(Math.abs(projected.clientX-720)<30&&Math.abs(projected.clientY-450)<30,
      'choosing an address recenters its pin near the viewport center even after a close zoom');
    hold=true;app.click('spawn-button');
    await app.until(()=>app.waitingRoads()>0);
    assert.equal(app.state().traveling,true);
    assert.equal(app.elements.get('spawn-button').disabled,true);
    assert.deepEqual(app.state().player,before,'player remains in the current neighborhood while destination streets load');
    hold=false;app.releaseRoads();
    await app.until(()=>!app.state().traveling);
    const destination=app.roadIndex().places.find(place=>place.borough==='Staten Island');
    assert.ok(Math.hypot(app.state().player.x-destination.x,app.state().player.z-destination.z)<300);
    assert.equal(app.state().cityView,false);
    assert.ok(app.simulation().city.buildings.some(building=>building.polygon.some(([x,z])=>x < -6000 && z > 8500)));
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{hold=false;app.releaseRoads();app.close();}
});

test('invalid and outside-NYC address results never enable spawn or relocate the player',async()=>{
  const app=await bootHarness({geocodeFetch:async()=>addressResponse([
    addressFeature({name:'OUTSIDE NYC',lon:-118.2437,lat:34.0522}),
    {...addressFeature(),geometry:{type:'Point',coordinates:[null,40.7]}},
  ])});
  try{
    app.click('start-button');app.frames(2);
    const before=app.state().player;submitAddress(app,'outside address');
    await app.until(()=>!app.state().navigation.searching);
    assert.equal(app.elements.get('address-results').children.length,0);
    assert.equal(app.state().navigation.selected,null);
    assert.equal(app.elements.get('spawn-button').disabled,true);
    assert.ok(app.elements.get('address-status').textContent.length>0);
    app.click('spawn-button');assert.deepEqual(app.state().player,before);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('superseded address responses and canceled searches cannot restore stale results or a spawn',async()=>{
  const pending=[];
  const app=await bootHarness({geocodeFetch:(url,{signal})=>new Promise(resolve=>pending.push({url,signal,resolve}))});
  try{
    app.click('start-button');app.frames(2);
    submitAddress(app,'350 5th Avenue');await app.until(()=>pending.length===1);
    submitAddress(app,'10 Richmond Terrace');await app.until(()=>pending.length===2);
    assert.equal(pending[0].signal.aborted,true,'the replaced address request is canceled');
    pending[1].resolve(addressResponse([addressFeature()]));
    await app.until(()=>!app.state().navigation.searching);
    assert.match(app.elements.get('address-results').children[0].textContent,/RICHMOND/i);
    pending[0].resolve(addressResponse([addressFeature({name:'350 5TH AVENUE',lon:-73.9857,lat:40.7484,borough:'Manhattan',id:'old'})]));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.elements.get('address-results').children.length,1);
    assert.match(app.elements.get('address-results').children[0].textContent,/RICHMOND/i);
    app.elements.get('address-results').children[0].click();
    assert.ok(app.state().navigation.selected);
    submitAddress(app,'another address');await app.until(()=>pending.length===3);
    app.click('clear-spawn-button');
    assert.equal(pending[2].signal.aborted,true);
    pending[2].resolve(addressResponse([addressFeature()]));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.state().navigation.selected,null);assert.equal(app.state().navigation.picking,false);
    assert.equal(app.state().navigation.searching,false);assert.equal(app.elements.get('address-results').children.length,0);
    assert.equal(app.elements.get('spawn-button').disabled,true);assert.equal(app.elements.get('spawn-pin').hidden,true);
    submitAddress(app,'address before leaving map');await app.until(()=>pending.length===4);
    app.click('view-button');assert.equal(app.state().cityView,false);
    assert.equal(pending[3].signal.aborted,true,'leaving city view cancels the pending address lookup');
    pending[3].resolve(addressResponse([addressFeature()]));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.state().navigation.selected,null);assert.equal(app.elements.get('address-results').children.length,0);
    app.click('city-button');assert.equal(app.state().cityView,true);
    assert.doesNotMatch(app.elements.get('address-status').textContent,/searching/i,
      'returning to city view cannot retain the canceled search progress message');
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{for(const request of pending)request.resolve(addressResponse([]));app.close();}
});

test('explicit map-pick mode selects geographic points without orbiting or immediately spawning',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.frames(180);
    await app.until(()=>app.state().stream.loading===0);
    const canvas=app.elements.get('world'),before=app.state().player;
    canvas.dispatch('pointerdown',{clientX:650,clientY:450,pointerId:4});
    canvas.dispatch('pointermove',{clientX:710,clientY:450,pointerId:4});
    canvas.dispatch('pointerup',{clientX:710,clientY:450,pointerId:4});app.frames(120);
    assert.equal(app.state().navigation.selected,null,'ordinary orbit dragging cannot select a spawn');
    app.click('pick-spawn-button');assert.equal(app.state().navigation.picking,true);
    const navigation=app.elements.get('city-navigation');
    assert.equal(navigation.classes.has('is-picking'),true);assert.equal(navigation.classes.has('has-spawn'),false);
    const orientation=app.camera().quaternion;
    const place=app.roadIndex().places.find(place=>place.borough==='Staten Island');
    const from=app.screenPoint(place.x,place.z),to=app.screenPoint(place.x+50,place.z+20);
    canvas.dispatch('pointerdown',{...from,pointerId:5});
    canvas.dispatch('pointermove',{...to,pointerId:5});
    canvas.dispatch('pointerup',{...to,pointerId:5});app.frames();
    const selection=app.state().navigation.selected;
    assert.ok(selection);assert.ok(Math.hypot(selection.x-place.x-50,selection.z-place.z-20)<1);
    assert.equal(navigation.classes.has('is-picking'),true);assert.equal(navigation.classes.has('has-spawn'),true);
    assert.ok(app.camera().quaternion.angleTo(orientation)<1e-5,'dragging the spawn point must not also orbit the map');
    assert.deepEqual(app.state().player,before);
    assert.equal(app.elements.get('spawn-button').disabled,false);assert.equal(app.elements.get('spawn-pin').hidden,false);
    app.click('clear-spawn-button');assert.equal(app.state().navigation.selected,null);assert.equal(app.state().navigation.picking,false);
    assert.equal(navigation.classes.has('is-picking'),false);assert.equal(navigation.classes.has('has-spawn'),false);
    assert.equal(app.elements.get('spawn-pin').hidden,true);
    app.click('pick-spawn-button');assert.equal(app.state().navigation.picking,true);
    app.click('view-button');assert.equal(app.state().cityView,false);assert.equal(app.state().navigation.picking,false);
    assert.equal(navigation.classes.has('is-picking'),false);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});


test('measured landscape boots at elevation and supports park travel through the production UI',async()=>{
  const app=await bootHarness({terrainElevation:28});
  try{
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
    assert.equal(app.state().landscape.baseReady,true);
    assert.equal(app.state().player.y,28);
    app.click('start-button');app.click('view-button');app.frames(90);
    assert.ok(app.camera().position.y>28,'street camera must remain above measured ground');
    app.key('KeyV');app.key('KeyV',false);app.frames();
    assert.equal(app.camera().position.y,268,'aerial eye height is relative to measured ground');
    app.click('city-button');
    app.click('landscape-travel-button');
    await app.until(()=>!app.state().traveling);
    app.frames(2);
    // Street surfaces add at most a kerb to the measured ground.
    const lift=app.state().player.y-28;
    assert.ok(lift>=0&&lift<=SIDEWALK_LIFT+1e-9,`player stands ${lift} m above measured terrain`);
    assert.ok(app.state().landscape.cachedRegions>0);
    assert.equal(app.state().cityView,false);
    assert.ok(app.state().reconstruction.summary.accepted>0);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('landscape source failure leaves existing city exploration available',async()=>{
  const app=await bootHarness({landscapeFailure:true});
  try{
    assert.equal(app.state().bootReady,true);
    assert.equal(app.state().landscape,null);
    assert.equal(app.elements.get('landscape-travel-button').disabled,true);
    assert.match(app.elements.get('landscape-status').textContent,/unavailable/);
    app.click('start-button');app.click('view-button');app.frames();
    assert.equal(app.state().player.y,0);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('Prospect Lake arrival retains real building collisions while slower park data loads',async()=>{
  const app=await bootHarness({extraGeometry:[91,3464,3465],measuredLandscape:true,
    holdLandscape:url=>url==='./landscape/prospect-lake-terrain.json'});
  try{
    const manifest=JSON.parse(readFileSync(new URL('../dist/landscape-index.json',import.meta.url)));
    const region=manifest.regions.find(region=>region.id==='prospect-lake');
    app.click('start-button');
    app.elements.get('landscape-select').value=String(manifest.regions.indexOf(region));
    const before={...app.state().player};
    app.click('landscape-travel-button');
    await app.until(()=>app.waitingLandscape()>0&&app.state().stream.loading===0);
    assert.equal(app.state().traveling,true);
    const roads=app.simulation().city.roads;
    assert.ok(roads.length,'the origin remains playable until the complete destination is ready');
    // Production streaming selects at 350 ms intervals. Allow an actual frame
    // at the old location after building preload has resolved but before the
    // measured terrain response resolves, reproducing the reported race.
    await new Promise(resolve=>setTimeout(resolve,360));
    app.frames(3);
    assert.deepEqual({...app.state().player},before,'loading must not move the player early');
    app.releaseLandscape();
    await app.until(()=>!app.state().traveling);
    assert.equal(app.state().cityView,false,app.elements.get('travel-note').textContent);
    const {player}=app.state(),b=region.bounds;
    assert.ok(player.x>b.minX&&player.x<b.maxX&&player.z>b.minZ&&player.z<b.maxZ);
    assert.ok(player.y>18&&player.y<30,'arrival uses actual Prospect terrain');
    assert.equal(app.simulation().isBlocked(player.x,player.z,.35),false);
    assert.ok(app.simulation().getNearbyCar(),'arrival has room for the starter cab');
    assert.ok(app.simulation().interact(),'the cab is usable after arrival');
    app.frames(3);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.releaseLandscape();await app.until(()=>!app.state().traveling);app.close();}
});

test('shadow preference persists and survives quality changes and camera switches',async()=>{
  const app=await bootHarness({displayStored:JSON.stringify({version:1,shadows:false})});
  try{
    app.click('start-button');app.click('view-button');app.frames();
    assert.equal(app.state().shadows.enabled,false);assert.equal(app.state().shadows.active,false);
    assert.equal(app.elements.get('shadows-button').textContent,'SHADOWS: OFF');
    app.click('quality-button');app.frames();assert.equal(app.state().shadows.active,false);
    app.click('shadows-button');app.frames();
    assert.equal(app.state().shadows.active,true);
    assert.equal(app.elements.get('shadows-button').getAttribute('aria-pressed'),'true');
    assert.deepEqual(JSON.parse(app.storage.get('nyc-after-hours-display-v1')),{version:1,shadows:true});
    app.click('city-button');app.frames();assert.equal(app.state().shadows.active,false);
    app.click('city-button');app.frames();assert.equal(app.state().shadows.active,true);
    app.click('shadows-button');app.frames();assert.equal(app.state().shadows.active,false);
    assert.equal(JSON.parse(app.storage.get('nyc-after-hours-display-v1')).shadows,false);
  }finally{app.close();}
});

test('Central Park Pond arrival accepts the actual surveyed building with a raised ground cap',async()=>{
  const resources=[3136,3144,3164,3166,3216,3220,3222,3907];
  const app=await bootHarness({extraGeometry:resources.map(resource=>({resource,name:`central-park-${resource}`})),measuredLandscape:true});
  try{
    const manifest=JSON.parse(readFileSync(new URL('../dist/landscape-index.json',import.meta.url)));
    const region=manifest.regions.find(region=>region.id==='central-park-south');
    app.click('start-button');app.elements.get('landscape-select').value=String(manifest.regions.indexOf(region));
    app.click('landscape-travel-button');await app.until(()=>!app.state().traveling);
    assert.equal(app.state().cityView,false,app.elements.get('travel-note').textContent);
    const {player}=app.state(),b=region.bounds;
    assert.ok(player.x>b.minX&&player.x<b.maxX&&player.z>b.minZ&&player.z<b.maxZ);
    assert.ok(player.y>10&&player.y<30);
    assert.equal(app.simulation().isBlocked(player.x,player.z,.35),false);
    assert.ok(app.requests.some(url=>url.includes('/nodes/3220/geometries/0')),'the failing real survey chunk must participate');
    assert.ok(app.simulation().getNearbyCar());
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('road pilot loads on demand, arrives on measured pavement and toggles appearance without moving the car', async () => {
  const app=await bootHarness({measuredLandscape:true});
  try{
    assert.equal(app.requests.includes('./road-pilot.json'),false,'ordinary city startup must not allocate pilot geometry');
    assert.equal(app.elements.get('road-pilot-travel-button').disabled,false);
    app.click('start-button');app.click('road-pilot-travel-button');
    assert.equal(app.state().traveling,true);
    await app.until(()=>!app.state().traveling);
    assert.equal(app.state().roadPilot.surfaces,27,app.elements.get('travel-note').textContent);
    assert.equal(app.state().roadPilot.mode,'reconstructed');assert.equal(app.state().cityView,false);
    const source=JSON.parse(readFileSync(new URL('../dist/road-pilot-index.json',import.meta.url),'utf8'));
    const sim=app.simulation();
    assert.ok(Math.hypot(sim.player.x-source.spawn.x,sim.player.z-source.spawn.z)<.01,'exact source arrival is preserved');
    assert.ok(app.state().landscape.terrainOverlays.includes(source.id));
    app.frames(2);assert.equal(app.elements.get('road-pilot-controls').hidden,false);
    const height=sim.player.y,surface=sim.city.sampleSurface(sim.player.x,sim.player.z);
    assert.ok(surface.roadPilotId,'spawn must use a reconstructed support triangle');
    app.click('road-pilot-mode-button');app.frames(2);
    assert.equal(app.state().roadPilot.mode,'aerial');assert.equal(sim.player.y,height);
    assert.deepEqual(sim.city.sampleSurface(sim.player.x,sim.player.z),surface);
    app.click('road-pilot-mode-button');
    const cab=sim.cars.find(car=>car.id==='player-taxi');assert.ok(cab,'a courtesy taxi waits on the actual street');
    orbitWalkingCamera(app,Math.atan2(cab.x-sim.player.x,cab.z-sim.player.z));
    app.key('KeyW');for(let i=0;i<180&&!sim.getNearbyCar();i++)app.frames();app.key('KeyW',false);
    app.key('KeyE');app.key('KeyE',false);assert.equal(sim.player.mode,'drive');
    const before={x:sim.player.x,z:sim.player.z};
    app.key('KeyW');app.frames(45);app.key('KeyW',false);
    assert.ok(Math.hypot(sim.player.x-before.x,sim.player.z-before.z)>1,'throttle drives over reconstructed ground');
    assert.ok(Number.isFinite(sim.player.y));
    app.click('city-button');app.frames();assert.equal(app.elements.get('road-pilot-controls').hidden,true);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('failed road pilot data leaves the original terrain and current player intact', async () => {
  const app=await bootHarness({roadPilotFailure:true});
  try{
    app.click('start-button');const before={...app.state().player};
    app.click('road-pilot-travel-button');await app.until(()=>!app.state().traveling);
    assert.equal(app.state().roadPilot.ready,false);assert.match(app.state().roadPilot.error,/could not load/);
    assert.equal(app.state().player.x,before.x);assert.equal(app.state().player.z,before.z);
    assert.equal(app.state().landscape.terrainOverlays.length,0);
    assert.equal(app.elements.get('road-pilot-travel-button').disabled,false,'the user can retry without reloading the city');
    app.click('view-button');app.frames(2);app.key('KeyW');app.frames(12);app.key('KeyW',false);
    assert.notEqual(app.state().player.z,before.z,'the original neighborhood remains playable');
  }finally{app.close();}
});

test('road and bridge destinations use source-backed arrival points and disclose the actual AI review', async () => {
  const app=await bootHarness();
  try{
    const source=JSON.parse(readFileSync(new URL('../dist/street-detail-index.json',import.meta.url),'utf8'));
    const destinations=source.coverageRegions.filter(region=>region.view);
    assert.equal(app.elements.get('transport-travel-button').disabled,false);
    assert.match(app.elements.get('transport-select').innerHTML,/Brooklyn Bridge/);
    assert.match(app.elements.get('transport-select').innerHTML,/Meadow Lake roads/);
    assert.equal(app.state().roadReconstruction.summary.candidates,34);
    assert.equal(app.state().roadReconstruction.summary.accepted,0);
    assert.match(app.elements.get('road-reconstruction-status').textContent,/0 of 34/);
    app.click('start-button');
    for(let i=0;i<destinations.length;i++){
      app.elements.get('transport-select').value=String(i);app.click('transport-travel-button');
      assert.equal(app.state().traveling,true);
      assert.equal(app.elements.get('transport-travel-button').disabled,true);
      await app.until(()=>!app.state().traveling);
      const target=destinations[i].view, player=app.state().player;
      assert.equal(app.state().cityView,false,app.elements.get('travel-note').textContent);
      assert.ok(Math.hypot(player.x-target.x,player.z-target.z)<100);
      await app.until(()=>{app.frames();return app.state().streetDetail.loading===0&&app.state().streetscape.loading===0&&app.state().streetscape.surfaces>0;});
      assert.equal(app.state().streetDetail.covered,true);
      assert.equal(app.elements.get('transport-travel-button').disabled,false);
    }
    assert.equal(app.errors.length,0);
  }finally{app.close();}
});

test('uneven-road camera uses one elevation anchor without pitching at every bump',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.click('view-button');app.key('KeyE');
    const sim=app.simulation();assert.equal(sim.player.mode,'drive');
    let elevation=10;
    sim.setActiveCity({sampleSurface:()=>({elevation,normal:{x:0,y:1,z:0}})});
    app.frames(180);
    const pitches=[];
    for(let i=0;i<180;i++){
      elevation=10+.2*Math.sin(i/60*8*Math.PI*2);app.frames();
      const direction=new THREE.Vector3(0,0,-1).applyQuaternion(app.camera().quaternion);
      pitches.push(Math.atan2(direction.y,Math.hypot(direction.x,direction.z)));
      assert.ok(app.camera().position.y>.6,'terrain clearance remains enforced');
    }
    assert.ok(Math.max(...pitches)-Math.min(...pitches)<.0001,'vertical bumps must not nod the whole view');
    assert.equal(app.errors.length,0);
  }finally{app.close();}
});

function dropGameMapPin(app,point){
  const view=app.state().map.view,canvas=app.elements.get('game-map-canvas');
  const clientX=(point.x-view.x)*view.width/view.span+view.width/2;
  const clientY=(point.z-view.z)*view.width/view.span+view.height/2;
  canvas.dispatch('pointerdown',{pointerId:5,clientX,clientY});
  canvas.dispatch('pointerup',{pointerId:5,clientX,clientY});
}

test('interactive map opens from city view, zooms, pans, and pauses driving without pausing the menu',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.frames(2);app.key('KeyM');app.key('KeyM',false);
    assert.equal(app.state().map.open,true);assert.equal(app.elements.get('game-map').hidden,false);
    assert.equal(app.state().map.view.span,1000);
    app.click('game-map-city');assert.ok(app.state().map.view.span>40000);
    app.click('game-map-zoom-in');const zoom=app.state().map.view.span;
    assert.ok(zoom<70000);app.click('game-map-recenter');assert.equal(app.state().map.view.span,1000);
    app.click('game-map-close');app.click('view-button');app.key('KeyE');app.key('KeyE',false);
    app.key('KeyW');app.frames(30);app.key('KeyW',false);assert.equal(app.state().player.mode,'drive');
    app.click('open-map-button');const before=app.state().player;
    app.key('KeyW');app.frames(30);app.key('KeyW',false);
    assert.deepEqual(app.state().player,before);assert.equal(app.state().paused,false);
    app.key('Escape');app.key('Escape',false);assert.equal(app.state().map.open,false);
    assert.equal(app.elements.get('pause-dialog').open,false);
    app.key('KeyW');app.frames(12);app.key('KeyW',false);assert.notEqual(app.state().player.x,before.x);
    app.key('Escape');app.key('Escape',false);app.key('KeyM');app.key('KeyM',false);
    assert.equal(app.state().paused,true);assert.equal(app.state().map.open,false,'native pause dialogs own input until resumed');
    app.click('resume-button');app.click('open-map-button');app.document.hidden=true;app.document.dispatch('visibilitychange');
    assert.equal(app.state().map.open,false,'losing visibility closes the map before displaying the pause dialog');
    assert.equal(app.state().paused,true);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('map pins produce real street routes, live guidance, reroutes and can be cleared',async()=>{
  const app=await bootHarness();
  try{
    app.click('start-button');app.frames(2);app.click('open-map-button');
    const destination=app.roadIndex().places.find(place=>/times/i.test(place.name));assert.ok(destination);
    app.click('game-map-city');dropGameMapPin(app,destination);app.click('game-map-route');
    await app.until(()=>!app.state().map.busy);
    assert.ok(app.state().map.route?.points.length>20,app.elements.get('game-map-status').textContent);
    assert.ok(app.state().map.route.distance>3000);
    assert.equal(app.elements.get('route-guide').hidden,false);assert.match(app.elements.get('route-instruction').textContent,/remaining/);
    const original=app.state().map.route.points[0];
    app.click('game-map-close');app.click('view-button');
    // Move to a known off-route street to exercise production cooldown/replan.
    const sim=app.simulation(),candidate=sim.city.roads.flatMap(road=>road.points)
      .find(([x,z])=>Math.hypot(x-original[0],z-original[1])>500&&x<original[0]-150);
    assert.ok(candidate);Object.assign(sim.player,{x:candidate[0],z:candidate[1]});app.frames(180);
    const rerouted=app.state().map.route.points[0];assert.ok(Math.hypot(rerouted[0]-original[0],rerouted[1]-original[1])>200);
    app.click('open-map-button');app.click('game-map-clear');
    assert.equal(app.state().map.route,null);assert.equal(app.state().map.pin,null);assert.equal(app.elements.get('route-guide').hidden,true);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});

test('Spawn here waits for destination data, preserves the exact pin and closes the map only on success',async()=>{
  let hold=false;const app=await bootHarness({holdRoads:url=>hold&&url.startsWith('./roads/')});
  try{
    app.click('start-button');app.frames(2);app.click('open-map-button');
    const destination=app.roadIndex().places.find(place=>place.borough==='Staten Island');assert.ok(destination);
    // Pick a clear point on that destination's actual centerline after loading
    // its source extract offline; gameplay must still fetch those cells itself.
    const stream=createRoadStream(app.roadIndex());const roads=await stream.loadAround(destination,1000);
    const target=nearestStreet(roads,destination,600);assert.ok(target);
    app.click('game-map-city');dropGameMapPin(app,target);
    const selected=app.state().map.pin,before=app.state().player;hold=true;app.click('game-map-spawn');
    await app.until(()=>app.waitingRoads()>0);
    assert.equal(app.state().traveling,true);assert.deepEqual(app.state().player,before);assert.equal(app.state().map.open,true);
    hold=false;app.releaseRoads();await app.until(()=>!app.state().map.busy);
    assert.equal(app.state().map.open,false,app.elements.get('game-map-status').textContent);
    assert.equal(app.state().player.x,selected.x);assert.equal(app.state().player.z,selected.z);assert.equal(app.state().player.mode,'walk');
    assert.equal(app.state().cityView,false);assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{hold=false;app.releaseRoads();await app.until(()=>!app.state().traveling);app.close();}
});

test('unavailable routes and invalid water pins show useful errors without losing the player or disabling the map',async()=>{
  const app=await bootHarness({navigationFailure:true});
  try{
    app.click('start-button');app.frames(8);app.click('open-map-button');
    assert.ok(app.gameMap().roads.length>10,'loaded nearby streets survive a citywide navigation download failure');
    dropGameMapPin(app,{x:app.state().player.x+30,z:app.state().player.z});app.click('game-map-route');
    await app.until(()=>!app.state().map.busy);assert.match(app.elements.get('game-map-status').textContent,/directions could not load/);
    const before=app.state().player;app.click('game-map-city');dropGameMapPin(app,{x:-1500,z:-3500});app.click('game-map-spawn');
    await app.until(()=>!app.state().map.busy);
    assert.deepEqual(app.state().player,before);assert.equal(app.state().map.open,true);
    assert.match(app.elements.get('game-map-status').textContent,/shoreline|water/);
    assert.equal(app.elements.get('game-map-clear').disabled,false);
    assert.equal(app.errors.length,0,app.errors[0]?.stack);
  }finally{app.close();}
});


test('pin spawning requires citywide water data even when measured ground has loaded',async()=>{
  const app=await bootHarness({baseWaterFailure:true});
  try{
    app.click('start-button');app.frames(2);app.click('open-map-button');
    assert.equal(app.state().landscape.baseReady,true);
    const before=app.state().player;app.click('game-map-city');dropGameMapPin(app,{x:8554.682909090909,z:-19372.682});
    app.click('game-map-spawn');await app.until(()=>!app.state().map.busy);
    assert.equal(app.state().map.open,true);assert.deepEqual(app.state().player,before);
    assert.match(app.elements.get('game-map-status').textContent,/water.*unavailable|water.*load/i);
    // A second attempt can recover without restarting the game or rebuilding
    // terrain. An unavailable safety layer must not become a permanent lockout.
    app.setBaseWaterFailure(false);app.click('game-map-clear');app.click('game-map-recenter');dropGameMapPin(app,before);
    const selected=app.state().map.pin;
    app.click('game-map-spawn');await app.until(()=>!app.state().map.busy);
    assert.equal(app.state().landscape.baseWaterReady,true);
    assert.equal(app.state().map.open,false,app.elements.get('game-map-status').textContent);
    assert.equal(app.state().player.x,selected.x);assert.equal(app.state().player.z,selected.z);
  }finally{app.close();}
});
