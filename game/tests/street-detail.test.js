import test from 'node:test';
import { readFileSync } from 'node:fs';
import { landmarkBridges } from '../dist/landmark-bridges.js';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { Simulation } from '../dist/simulation.js';
import { buildStreetGeometry, createStreetDetail } from '../dist/street-detail.js';

const orthophoto = { texture: new THREE.Texture(), bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } };
const square = { id: 'measured-road', kind: 'roadbed', polygon: [[0,0],[10,0],[10,10],[0,10]],
  holes: [[[2,2],[2,4],[4,4],[4,2]]] };
const index = { cellSize: 500, coverageBounds: { minX: 0, minZ: 0, maxX: 1000, maxZ: 1000 }, cells: {
  '0,0': { url: './cell-a.json' }, '1,0': { url: './cell-b.json' },
} };
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = surfaces => ({ ok: true, json: async () => ({ surfaces, curbs: [] }) });

test('source concavity and holes survive triangulation without invented heights', () => {
  const geometry = buildStreetGeometry([square, square], orthophoto);
  const p = geometry.attributes.position, normal = geometry.attributes.normal, triangles = geometry.index.array;
  let area = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const [a,b,c] = [...triangles.slice(i, i + 3)].map(id => [p.getX(id), p.getZ(id)]);
    area += Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  }
  assert.equal(area, 96, 'the mapped four-square-meter hole remains open');
  assert.deepEqual(geometry.userData.sourceIds, [square.id], 'repeated tile features draw once');
  for (let i = 0; i < p.count; i++) { assert.equal(p.getY(i), 0);assert.equal(normal.getY(i), 1); }
  const concave = { id: 'sidewalk', polygon: [[0,0],[6,0],[6,2],[2,2],[2,6],[0,6]], holes: [] };
  const g = buildStreetGeometry([concave], orthophoto);
  assert.equal(g.index.count, 12, 'an L-shaped polygon triangulates without a bounding rectangle');
});

test('street imagery UVs preserve geographic placement and Mercator row scale', () => {
  const photo = { ...orthophoto, mercator: { north: 1, south: 0, originLat: .7, radius: 6371008.8 } };
  const g = buildStreetGeometry([square], photo);
  const expected = Math.log(Math.tan(Math.PI / 4 + .7 / 2));
  assert.ok(Math.abs(g.attributes.uv.getX(0) - .5) < 1e-7);
  assert.ok(Math.abs(g.attributes.uv.getY(0) - expected) < 1e-7);
});

test('cached source triangulation preserves holes while updating imagery layout', t => {
  const triangulate = t.mock.method(THREE.ShapeUtils, 'triangulateShape');
  const memo = new Map();
  const first = buildStreetGeometry([square], orthophoto, memo);
  const next = buildStreetGeometry([square], { ...orthophoto,
    bounds: { minX: 0, maxX: 200, minZ: 0, maxZ: 200 } }, memo);
  assert.equal(triangulate.mock.callCount(), 1);
  assert.deepEqual(next.index.array, first.index.array);
  assert.deepEqual(next.attributes.position.array, first.attributes.position.array);
  assert.equal(first.attributes.uv.getX(0), .5);
  assert.equal(next.attributes.uv.getX(0), 0, 'UVs follow the new source image bounds');
  first.dispose();next.dispose();
});

test('stream batches duplicated cell features, receives sunlight and releases geometry', async () => {
  const scene = new THREE.Scene();
  const detail = createStreetDetail(index, { scene, orthophoto, fetcher: async () => response([square]) });
  detail.update({ x: 10, z: 10 });await tick();detail.update({ x: 10, z: 10 });
  assert.equal(detail.getStatus().activeCells, 2);assert.equal(detail.getStatus().surfaces, 1);
  const mesh = detail.group.children[0];assert.ok(mesh.receiveShadow);assert.ok(mesh.material.isMeshStandardMaterial);
  assert.equal(mesh.material.map, orthophoto.texture);assert.equal(mesh.geometry.attributes.position.getY(0), 0);
  assert.equal(mesh.material.polygonOffset, true);
  assert.ok(mesh.material.polygonOffsetFactor < 0 && mesh.material.polygonOffsetUnits < 0,
    'coplanar sidewalk/building-base conflicts use depth bias, not invented elevations');
  assert.equal(scene.children.filter(object => object.isLight).length, 0);
  let disposed = false;mesh.geometry.addEventListener('dispose', () => { disposed = true; });
  detail.dispose();assert.ok(disposed);assert.equal(scene.children.length, 0);
});

test('fine road terrain masks ordinary aerial drapes without discarding elevated decks', t => {
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto, fetcher: async () => response([square]) });
  t.after(() => detail.dispose());
  const mesh = detail.group.children[0];
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  mesh.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.streetGroundReplacement.value, false);
  detail.setGroundReplacementBounds({ minX: 1, maxX: 9, minZ: 2, maxZ: 8 });
  assert.equal(shader.uniforms.streetGroundReplacement.value, true);
  assert.deepEqual(shader.uniforms.streetGroundReplacementBounds.value.toArray(), [1, 9, 2, 8]);
  assert.match(shader.fragmentShader, /if \(!streetElevated && streetGroundReplacement/);
  detail.setGroundReplacementBounds(null);
  assert.equal(shader.uniforms.streetGroundReplacement.value, false);
});

test('crossing x=0 preserves the GPU batch when wanted cells are unchanged', async t => {
  const triangulate = t.mock.method(THREE.ShapeUtils, 'triangulateShape');
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto,
    fetcher: async () => response([square]) });
  t.after(() => detail.dispose());
  detail.update({ x: -.1, z: 0 });await tick();detail.update({ x: -.1, z: 0 });
  assert.equal(detail.getStatus().activeCells, 2);
  const geometry = detail.group.children[0].geometry;
  let disposals = 0;geometry.addEventListener('dispose', () => disposals++);
  detail.update({ x: .1, z: 0 });
  assert.equal(detail.group.children[0].geometry, geometry);
  assert.equal(disposals, 0);
  assert.equal(triangulate.mock.callCount(), 1);
});

test('successive cell arrivals triangulate only new features and reuse them after overview', async t => {
  const triangulate = t.mock.method(THREE.ShapeUtils, 'triangulateShape');
  const pending = new Map();
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto,
    fetcher: url => new Promise(resolve => pending.set(url, resolve)) });
  t.after(() => detail.dispose());
  const focus = { x: 10, z: 10 };detail.update(focus);
  pending.get('./cell-a.json')(response([square]));await tick();detail.update(focus);
  assert.equal(triangulate.mock.callCount(), 1);
  const first = detail.group.children[0].geometry;
  let disposed = false;first.addEventListener('dispose', () => { disposed = true; });
  pending.get('./cell-b.json')(response([square, { ...square, id: 'another-source-feature' }]));
  await tick();detail.update(focus);
  assert.equal(triangulate.mock.callCount(), 2, 'the shared feature is not retriangulated');
  assert.equal(detail.getStatus().surfaces, 2);assert.ok(disposed);
  detail.update(focus, { overview: true });detail.update(focus);
  assert.equal(triangulate.mock.callCount(), 2, 'cached sources survive hiding the street layer');
  assert.equal(detail.getStatus().surfaces, 2);
});

test('triangulation cache follows resident cells, retaining shared IDs and releasing evicted sources', async t => {
  const triangulate = t.mock.method(THREE.ShapeUtils, 'triangulateShape');
  // Separate cells by 2km so each camera position selects just one source tile.
  const cells = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${i * 4},0`, { url: String(i) }]));
  const detail = createStreetDetail({ ...index, cells }, { scene: new THREE.Scene(), orthophoto,
    fetcher: async url => response([square, { ...square, id: `unique-${url}` }]) });
  t.after(() => detail.dispose());
  const visit = async i => {
    const focus = { x: i * 2000 + 250, z: 250 };
    detail.update(focus);await tick();detail.update(focus);
  };
  for (let i = 0; i < 40; i++) {
    await visit(i);
    assert.ok(detail.getStatus().cachedCells <= 36);
    assert.ok(detail.getStatus().triangulatedSurfaces <= 37, 'one shared ID plus at most 36 unique resident IDs');
  }
  assert.equal(detail.getStatus().cachedCells, 36);
  assert.equal(detail.getStatus().triangulatedSurfaces, 37);
  assert.equal(triangulate.mock.callCount(), 41, 'shared IDs survive eviction of their first source cell');
  await visit(0);assert.equal(triangulate.mock.callCount(), 42, 'an evicted source is rebuilt when revisited');
  await visit(39);assert.equal(triangulate.mock.callCount(), 42, 'a retained source is reused');
  const mesh = detail.group.children[0];let geometryDisposed = false, materialDisposed = false;
  mesh.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  mesh.material.addEventListener('dispose', () => { materialDisposed = true; });
  detail.dispose();
  assert.equal(detail.getStatus().cachedCells, 0);assert.equal(detail.getStatus().triangulatedSurfaces, 0);
  assert.ok(geometryDisposed);assert.ok(materialDisposed);
});

test('late fetch completion after travel never attaches obsolete street surfaces', async () => {
  const calls = [];
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto,
    fetcher: (url, { signal }) => new Promise(resolve => calls.push({ url, signal, resolve })) });
  detail.update({ x: 10, z: 10 });assert.equal(calls.length, 2);
  detail.update({ x: 10000, z: 10000 });assert.ok(calls.every(call => call.signal.aborted));
  calls.forEach(call => call.resolve(response([square])));await tick();
  detail.update({ x: 10000, z: 10000 });assert.equal(detail.getStatus().surfaces, 0);
  assert.equal(detail.getStatus().cachedCells, 0);assert.equal(detail.getStatus().covered, false);
  detail.dispose();
});

test('failed detail retries after cooldown and clears its active error on recovery', async () => {
  let now = 0, succeed = false, calls = 0;
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto, now: () => now,
    fetcher: async () => { calls++;return succeed ? response([square]) : { ok: false }; } });
  detail.update({ x: 10, z: 10 });await tick();assert.equal(detail.getStatus().failures, 2);
  detail.update({ x: 10, z: 10 });assert.equal(calls, 2);
  now = 5001;succeed = true;detail.update({ x: 10, z: 10 });await tick();detail.update({ x: 10, z: 10 });
  assert.equal(detail.getStatus().failures, 0);assert.equal(detail.getStatus().surfaces, 1);
  detail.update({ x: 10, z: 10 }, { overview: true });assert.equal(detail.group.visible, false);
  assert.equal(detail.getStatus().surfaces, 0);detail.dispose();
});

test('missing local atlas pixels expose underlying image tiles instead of overwriting them with coarse triangles', () => {
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto });
  const material = detail.group.children[0].material;
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  material.onBeforeCompile(shader);
  const texture = new THREE.Texture(), mercator = { north: 1, south: 0, originLat: .7, radius: 6371008.8 };
  detail.setLocalOrthophoto({ texture, bounds: orthophoto.bounds, mercator });
  assert.equal(shader.uniforms.streetLocal.value, texture);assert.equal(shader.uniforms.streetUseLocal.value, true);
  assert.match(shader.fragmentShader, /sourcePixel.a > 0.99/);
  assert.match(shader.fragmentShader, /if \(!streetUseLocal && !streetElevated\) discard;/);
  assert.match(shader.fragmentShader, /else if \(!streetElevated\) discard;/);
  assert.match(shader.fragmentShader, /greaterThanEqual/);
  detail.setLocalOrthophoto();assert.equal(shader.uniforms.streetUseLocal.value, false);
  assert.equal(detail.group.children[0].material, material);detail.dispose();
});

test('street surfaces follow measured slopes and retain the exact source footprint and imagery coordinates', () => {
  const terrain = (x,z) => 12+x*.2+z*.1;
  const geometry = buildStreetGeometry([square], orthophoto, new Map(), terrain);
  const position = geometry.attributes.position, uv = geometry.attributes.uv, normal = geometry.attributes.normal;
  let area = 0;
  for(let i=0;i<position.count;i++){
    assert.ok(Math.abs(position.getY(i)-terrain(position.getX(i),position.getZ(i)))<1e-5);
    assert.ok(Math.abs(uv.getX(i)-(position.getX(i)+100)/200)<1e-7);
    assert.ok(normal.getY(i)>.9 && normal.getX(i)<0 && normal.getZ(i)<0);
  }
  const ids=geometry.index.array;
  for(let i=0;i<ids.length;i+=3){
    const [a,b,c]=[ids[i],ids[i+1],ids[i+2]];
    area+=Math.abs((position.getX(b)-position.getX(a))*(position.getZ(c)-position.getZ(a))-(position.getZ(b)-position.getZ(a))*(position.getX(c)-position.getX(a)))/2;
  }
  assert.equal(area,96,'draping does not fill the mapped sidewalk hole');
  geometry.dispose();
});

test('large street triangles sample interior hills with bounded tessellation', () => {
  const surface={id:'large-measured-road',polygon:[[0,0],[80,0],[80,80],[0,80]],holes:[]};
  const slope=buildStreetGeometry([surface],orthophoto,new Map(),(x,z)=>10+x*.2+z*.1);
  assert.equal(slope.attributes.position.count,4,'constant slopes need no extra topology');slope.dispose();
  const hill=(x,z)=>20*Math.max(0,1-Math.hypot(x-40,z-40)/40);
  const geometry=buildStreetGeometry([surface],orthophoto,new Map(),hill);
  const position=geometry.attributes.position;
  assert.ok(position.count>4,'terrain is sampled between the original flat boundary vertices');
  assert.ok(position.count<=4+2048,'one source feature has a finite added-vertex budget');
  let peak=0;
  for(let i=0;i<position.count;i++)peak=Math.max(peak,position.getY(i));
  assert.ok(peak>19,'the mesh follows the measured interior hill');
  geometry.dispose();
});

test('terrain revisions refresh cached street elevations without refetching or source retriangulation', async t => {
  let elevation=5, requests=0;
  const heightAt=()=>elevation, triangulate=t.mock.method(THREE.ShapeUtils,'triangulateShape');
  const detail=createStreetDetail(index,{scene:new THREE.Scene(),orthophoto,heightAt,
    fetcher:async()=>{requests++;return response([square]);}});
  t.after(()=>detail.dispose());
  const focus={x:10,z:10};detail.update(focus);await tick();detail.update(focus);
  const first=detail.group.children[0].geometry;
  assert.equal(first.attributes.position.getY(0),5);
  let disposed=false;first.addEventListener('dispose',()=>{disposed=true;});
  elevation=31;detail.setTerrainSampler(heightAt,1);detail.update(focus);
  const next=detail.group.children[0].geometry;
  assert.ok(disposed);assert.equal(next.attributes.position.getY(0),31);
  assert.equal(requests,2);assert.equal(triangulate.mock.callCount(),1);
  detail.setTerrainSampler(heightAt,1);detail.update(focus);
  assert.equal(detail.group.children[0].geometry,next,'an unchanged revision does not rebuild GPU geometry');
  detail.setTerrainSampler(()=>NaN,2);detail.update(focus);
  assert.equal(detail.group.children[0].geometry.attributes.position.getY(0),0,'missing elevation remains a finite flat fallback');
});

const deck = { id:'bridge:measured',sourceId:'NYC transport survey:1',kind:'transport',subtype:'bridge',
  polygon:[[0,0],[10,0],[10,10],[0,10]],holes:[],elevations:{polygon:[8,8,9,9],holes:[]},
  elevationUnits:'meters',verticalDatum:'NAVD88',elevationStatus:'surveyed' };

test('streamed bridge levels are entered only from a continuous approach and are drawn as structures', async t => {
  const detail=createStreetDetail(index,{scene:new THREE.Scene(),orthophoto,
    fetcher:async()=>({ok:true,json:async()=>({surfaces:[square],structures:[deck]})})});
  t.after(()=>detail.dispose());
  const focus={x:5,z:5};detail.update(focus);await tick();detail.update(focus);
  assert.equal(detail.getStatus().transport.surfaces,1,'duplicate tile deck appears once');
  assert.equal(detail.sampleSurface(5,5,{referenceHeight:8.25,mode:'drive'}).elevation,8.5,'a nearly continuous approach can enter the measured deck');
  assert.equal(detail.sampleSurface(5,5,{referenceHeight:8,mode:'drive'}),null,'a half-meter gap cannot lift ground traffic onto a new deck');
  assert.equal(detail.sampleSurface(5,5,{referenceHeight:8,mode:'drive',transportId:deck.id}).elevation,8.5,'an existing deck contact keeps its measured level through a slope');
  assert.equal(detail.sampleSurface(5,5,{referenceHeight:0,mode:'drive'}),null,'lower road stays below');
  assert.equal(detail.sampleSurface(5,5),null,'unhinted terrain queries do not choose an overhead deck');
  const transportGroup=detail.group.children.find(group=>group.name==='NYC measured transport decks');
  const bridgeMesh=transportGroup.children[0];
  assert.equal(bridgeMesh.geometry.attributes.position.getY(0),8);
  // A deck is a structure of its own: asphalt above, concrete around and beneath, not a sheet of photograph.
  assert.equal(bridgeMesh.material.name,'Asphalt');
  const structure=transportGroup.children.find(mesh=>mesh.name==='Deck slabs, parapets and piers');
  assert.equal(structure.material.name,'Deck concrete');
  assert.ok(structure.geometry.attributes.position.count>0,'the deck has a slab and parapets');
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
  detail.group.children[0].material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.streetElevated.value,false);
  const texture=new THREE.Texture();detail.setLocalOrthophoto({texture,bounds:orthophoto.bounds,
    mercator:{north:1,south:0,originLat:.7,radius:6371008.8}});
  assert.equal(shader.uniforms.streetLocal.value,texture);
  detail.update({x:10000,z:10000});
  assert.equal(detail.getStatus().transport.surfaces,0);
  assert.equal(detail.sampleSurface(5,5,{referenceHeight:8}),null,'travel releases obsolete deck collisions');
});

test('mapped coverage includes distant sample regions without claiming the gaps', () => {
  const detail=createStreetDetail({...index,coverageRegions:[{bounds:index.coverageBounds},
    {bounds:{minX:10000,maxX:11000,minZ:10000,maxZ:11000}}]},
    {scene:new THREE.Scene(),orthophoto,fetcher:async()=>response([])});
  detail.update({x:10500,z:10500});assert.equal(detail.getStatus().covered,true);
  detail.update({x:5000,z:5000});assert.equal(detail.getStatus().covered,false);
  detail.dispose();
});


test('opening the city map preserves an actor supported by a streamed bridge deck', async t => {
  let sim;
  const detail=createStreetDetail(index,{scene:new THREE.Scene(),orthophoto,
    onChange:()=>sim?.updateGrounding(),
    fetcher:async()=>({ok:true,json:async()=>({surfaces:[],structures:[deck]})})});
  t.after(()=>detail.dispose());
  const focus={x:5,z:5};detail.update(focus);await tick();detail.update(focus);
  sim=new Simulation({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawn:focus,roads:[],buildings:[],
    sampleSurface:(x,z,options)=>detail.sampleSurface(x,z,options)||{elevation:0}});
  sim.cars=[];Object.assign(sim.player,{...focus,y:8.5});sim.updateGrounding();
  detail.update(focus,{overview:true});
  assert.equal(detail.group.visible,false);
  assert.equal(sim.player.y,8.5,'hiding the city must not change its support level');
  detail.update(focus);sim.updateGrounding();
  assert.equal(sim.player.y,8.5,'returning to street view keeps the actor on the deck');
});

test('major crossing decks stream near their surveyed extents and clear after travel', async t => {
  const detail = createStreetDetail({cellSize:500, cells:{}}, {
    scene: new THREE.Scene(), orthophoto, drape:false,
    fetcher: async url => ({ok:true, json:async () => JSON.parse(readFileSync(new URL('../dist/' + url, import.meta.url)))}),
  });
  t.after(() => detail.dispose());
  for (const { bounds } of landmarkBridges) {
    const middle = {x:(bounds.minX+bounds.maxX)/2, z:(bounds.minZ+bounds.maxZ)/2};
    detail.update(middle);await tick();detail.update(middle);
    const status = detail.getStatus().transport;
    assert.ok(status.triangles > 0);
    assert.equal(status.rejectedFeatures, 0);
  }
  detail.update({x:-15000,z:10000});
  assert.equal(detail.getStatus().transport.surfaces, 0);
});

test('decks from outside the bundled cells join them once each, and leave when taken away', async t => {
  const deck = { id: 'transport:park-lid:0', sourceId: 'dem', kind: 'transport', subtype: 'bridge', cover: 'ground', polygon: [[20, 20], [40, 20], [40, 30], [20, 30]], holes: [],
    elevations: { polygon: [5, 5, 5, 5], holes: [] }, elevationStatus: 'surveyed', elevationUnits: 'meters', verticalDatum: 'NAVD88' };
  const turf = new THREE.MeshStandardMaterial();
  const detail = createStreetDetail(index, { scene: new THREE.Scene(), orthophoto, drape: false, fetcher: async () => response([square]) });
  t.after(() => { detail.dispose();turf.dispose(); });
  detail.update({ x: 10, z: 10 });await tick();detail.update({ x: 10, z: 10 });
  assert.equal(detail.getStatus().transport.surfaces, 0);
  detail.setExtraStructures([deck, { ...deck }], turf);
  assert.equal(detail.getStatus().transport.surfaces, 1, 'the same deck given twice is one deck');
  assert.equal(detail.sampleSurface(30, 25, { referenceHeight: 5, mode: 'walk' }).transportId, deck.id);
  const lids = detail.group.children.flatMap(child => child.children).find(mesh => mesh.name.startsWith('Decks that carry the ground'));
  assert.equal(lids.material, turf);assert.ok(lids.geometry.attributes.position.count >= 4);
  // Streaming on does not drop them, and taking them away does.
  detail.update({ x: 600, z: 10 });await tick();detail.update({ x: 600, z: 10 });
  assert.equal(detail.getStatus().transport.surfaces, 1);
  detail.setExtraStructures([]);
  assert.equal(detail.getStatus().transport.surfaces, 0);
  assert.equal(detail.sampleSurface(30, 25, { referenceHeight: 5, mode: 'walk' }), null);
});
