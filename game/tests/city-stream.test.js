import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCityStream, decodeI3S, groundRings, projectCityPoint } from '../dist/city-stream.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
const bytes = gunzipSync(readFileSync(new URL('./fixtures/i3s-soho.bin.gz', import.meta.url)));
const fixture = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const node = index.nodes.find(node => node.resource === 4341);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let count = 0; count < 500; count++) { if (predicate()) return; await delay(2); }
  assert.fail('Timed out waiting for the deterministic tile scheduler');
}

test('official index covers every referenced node and all five boroughs', () => {
  const ids = new Set(index.nodes.map(node => node.id));
  assert.equal(index.stats.buildingFeatures, 1083529);
  assert.equal(index.stats.leafChunks, 3361);
  assert.equal(index.nodes.length, 4721);
  for (const node of index.nodes) for (const child of node.children) assert.ok(ids.has(child));
  const stream = createCityStream(index);
  for (const [lon, lat] of [[-74.0015,40.7235],[-73.9647,40.6826],[-73.8306,40.7592],[-73.9215,40.8275],[-74.076,40.642]]) {
    const [x,z] = projectCityPoint(lon,lat,index.origin);
    assert.ok(stream.nearby({x,z},120).length > 0);
    assert.equal(stream.isReadyAt(x,z,120),false,'unloaded borough must not pretend to be collision-ready');
  }
  stream.dispose();
});

test('real SoHo I3S chunk decodes surveyed features, ground rings and courtyards', () => {
  const result = decodeI3S(fixture,node,index.origin);
  assert.equal(result.featureCount,280);
  assert.equal(result.triangles,11512);
  assert.equal(result.buildings.length,282);
  assert.equal(result.buildings.reduce((sum,building)=>sum+building.holes.length,0),3);
  assert.ok(result.positions.every(Number.isFinite));
  assert.ok(result.bounds.minX < 0 && result.bounds.maxX > 0);
  assert.ok(result.bounds.minZ < 0 && result.bounds.maxZ > 0);
  assert.ok(result.buildings.every(building=>building.polygon.length>=3&&building.height>=0&&!building.heightEstimated));
  let minimum=Infinity;
  for(let i=1;i<result.positions.length;i+=3)minimum=Math.min(minimum,result.positions[i]);
  assert.equal(minimum,0,'every building is flattened at its actual lowest survey elevation');
});

test('ground-triangle boundaries retain courtyard holes and separate islands', () => {
  const triangles=[];
  const quad=(a,b,c,d)=>triangles.push([a,b,c],[a,c,d]);
  quad([0,0],[10,0],[7,3],[3,3]);
  quad([10,0],[10,10],[7,7],[7,3]);
  quad([10,10],[0,10],[3,7],[7,7]);
  quad([0,10],[0,0],[3,3],[3,7]);
  quad([20,0],[22,0],[22,2],[20,2]);
  const shapes=groundRings(triangles);
  assert.equal(shapes.length,2);
  assert.equal(shapes[0].polygon.length,4);
  assert.equal(shapes[0].holes.length,1);
  assert.equal(shapes[0].holes[0].length,4);
  assert.equal(shapes[1].holes.length,0);
});

test('truncated or corrupt geometry is rejected before it can become collision-ready', () => {
  assert.throws(()=>decodeI3S(fixture.slice(0,100),node,index.origin),/payload length/);
  const corrupt=fixture.slice(0),view=new DataView(corrupt);
  const count=view.getUint32(0,true),features=view.getUint32(4,true);
  view.setUint32(8+count*36+features*8,999999,true);
  assert.throws(()=>decodeI3S(corrupt,node,index.origin),/triangle ranges/);
});

function tinyIndex() {
  const base={center:node.center,vertices:node.vertices,buildings:node.buildings,lodThreshold:1};
  return {...index,root:0,roots:[1],nodes:[
    {...base,id:0,resource:null,parent:null,x:0,z:0,radius:3000,children:[1]},
    {...base,id:1,resource:100,parent:0,x:0,z:0,radius:2000,children:[2,3]},
    {...base,id:2,resource:200,parent:1,x:500,z:0,radius:20,children:[]},
    {...base,id:3,resource:300,parent:1,x:750,z:0,radius:20,children:[]},
  ]};
}
const response=()=>({ok:true,arrayBuffer:async()=>fixture.slice(0)});

test('default browser fetch keeps its global receiver while loading surveyed geometry',async t=>{
  const requests=[];
  // Native browser fetch rejects a CityStream receiver; arrow mocks hide this.
  t.mock.method(globalThis,'fetch',function(url,options){
    if(this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    requests.push({url,options});
    return Promise.resolve(response());
  });
  const stream=createCityStream(tinyIndex());
  t.after(()=>stream.dispose());
  await stream.prepareAt({x:500,z:0},10);
  assert.equal(requests.length,1,'a valid request should not need retries');
  assert.equal(requests[0].url,`${index.source.service}/nodes/200/geometries/0`);
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.equal(stream.isReadyAt(500,0,10),true);
  assert.ok(stream.cache.get(2).buildings.length>0);
});

test('coarse parent remains until detailed replacements are complete, without overlap',async()=>{
  const pending=new Map(),scene=new THREE.Scene();let snapshots=[];
  const stream=createCityStream(tinyIndex(),{scene,fetcher:async url=>{
    const id=Number(url.match(/nodes\/(\d+)/)[1]);
    if(id===100)return response();
    return new Promise(resolve=>pending.set(id,()=>resolve(response())));
  },onCollisionChange:buildings=>snapshots.push(buildings)});
  stream.update({x:0,z:0},null,{overview:true});
  await until(()=>stream.cache.has(1));
  assert.equal(stream.cache.get(1).mesh.visible,true);
  stream.update({x:0,z:0},null,{overview:false});
  await until(()=>pending.size===2);
  pending.get(200)(); await until(()=>stream.cache.has(2));
  assert.equal(stream.cache.get(1).mesh.visible,true);
  assert.equal(stream.cache.get(2).mesh.visible,false,'a partial detailed branch cannot overlap its fallback parent');
  pending.get(300)(); await until(()=>stream.cache.has(3));
  await until(()=>!stream.cache.get(1).mesh.visible);
  assert.equal(stream.cache.get(2).mesh.visible,true);
  assert.equal(stream.cache.get(3).mesh.visible,true);
  assert.ok(snapshots.at(-1).length>0);
  stream.update({x:0,z:0},null,{overview:true});
  assert.equal(stream.cache.get(1).mesh.visible,true);
  assert.ok(snapshots.at(-1).length>0,'overview rendering must retain nearby collision geometry');
  stream.dispose();assert.equal(scene.children.length,0);
});

test('prepareAt waits for geometry, bounds fetch concurrency and retains source footprints',async()=>{
  let active=0,maximum=0,last=[];
  const stream=createCityStream(tinyIndex(),{concurrency:1,fetcher:async()=>{
    active++;maximum=Math.max(maximum,active);await delay(5);active--;return response();
  },onCollisionChange:buildings=>{last=buildings;}});
  assert.equal(stream.isReadyAt(600,0,200),false);
  const ready=await stream.prepareAt({x:600,z:0},200);
  assert.equal(ready.ready,true);assert.equal(maximum,1);
  assert.equal(stream.isReadyAt(600,0,200),true);
  assert.ok(last.length>0);assert.ok(last.some(building=>building.holes.length));
  stream.dispose();assert.equal(stream.isReadyAt(600,0,200),false);
});

test('dispose prevents late network results from adding GPU meshes or colliders',async()=>{
  let finish;
  const stream=createCityStream(tinyIndex(),{fetcher:()=>new Promise(resolve=>{finish=()=>resolve(response());})});
  const pending=stream.prepareAt({x:500,z:0},10);
  await until(()=>Boolean(finish));stream.dispose();finish();
  await assert.rejects(pending,/disposed/);
  await delay(10);assert.equal(stream.group.children.length,0);assert.equal(stream.cache.size,0);
});

test('travel promotes an already queued scenery tile ahead of unrelated requests',async()=>{
  const started=[],pending=new Map();
  const stream=createCityStream(tinyIndex(),{concurrency:1,fetcher:async url=>{
    const id=Number(url.match(/nodes\/(\d+)/)[1]);started.push(id);
    return new Promise(resolve=>pending.set(id,()=>resolve(response())));
  }});
  const first=stream.request(stream.nodes.get(1),0);
  const unrelated=stream.request(stream.nodes.get(2),10);
  const prefetched=stream.request(stream.nodes.get(3),20);
  const travel=stream.prepareAt({x:750,z:0},10);
  pending.get(100)();await first;
  await until(()=>pending.has(300));
  assert.deepEqual(started,[100,300]);
  pending.get(300)();await travel;await prefetched;
  await until(()=>pending.has(200));pending.get(200)();await unrelated;
  stream.dispose();
});

test('a failed response retries with a fresh unexpired signal and becomes ready',async()=>{
  const signals=[];let attempts=0;
  const stream=createCityStream(tinyIndex(),{fetcher:async(url,{signal})=>{
    signals.push(signal);attempts++;
    return attempts<3?{ok:false,status:503}:response();
  }});
  await stream.prepareAt({x:500,z:0},10);
  assert.equal(attempts,3);
  assert.equal(new Set(signals).size,3);
  assert.ok(signals.every(signal=>!signal.aborted));
  assert.equal(stream.isReadyAt(500,0,10),true);
  assert.equal(stream.getStatus().error,null);
  stream.dispose();
});

test('an attempt failing near its deadline cannot abort the next attempt during backoff',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const signals=[];
  const stream=createCityStream(tinyIndex(),{fetcher:async(url,{signal})=>{
    signals.push(signal);
    if(signals.length===1)return new Promise((resolve,reject)=>setTimeout(()=>reject(new Error('temporary network failure')),19900));
    return response();
  }});
  const pending=stream.prepareAt({x:500,z:0},10);
  const flush=()=>new Promise(resolve=>process.nextTick(resolve));
  t.mock.timers.tick(19900);await flush();
  t.mock.timers.tick(100);await flush();
  t.mock.timers.tick(200);await flush();
  await pending;
  assert.equal(signals.length,2);
  assert.equal(signals[1].aborted,false,'the old deadline must not abort a replacement controller');
  stream.dispose();
});

test('rooftop atlas stores exact Mercator latitude parameters for full-city imagery',()=>{
  const stream=createCityStream(tinyIndex());
  const mercator={north:.81,south:.77,originLat:index.origin.lat*Math.PI/180,radius:6371008.8};
  const texture=new THREE.Texture();stream.setOrthophoto({texture,bounds:{minX:-30000,maxX:30000,minZ:-30000,maxZ:30000},mercator});
  assert.equal(stream.orthoUniforms.cityOrtho.value,texture);
  assert.equal(stream.orthoUniforms.cityUseMercator.value,true);
  assert.deepEqual(stream.orthoUniforms.cityMercator.value.toArray(),[mercator.north,mercator.south,mercator.originLat,mercator.radius]);
  stream.dispose();texture.dispose();
});


test('terrain anchors preserve measured relative building shapes and collision footprints', () => {
  const flat=decodeI3S(fixture,node,index.origin),raised=decodeI3S(fixture,node,index.origin,{heightAt:()=>27.5});
  assert.deepEqual(raised.buildings,flat.buildings);
  for(let i=0;i<flat.positions.length;i++)assert.ok(Math.abs(raised.positions[i]-flat.positions[i]-(i%3===1?27.5:0))<.0001);
  const missing=decodeI3S(fixture,node,index.origin,{heightAt:()=>NaN});
  assert.deepEqual(missing.positions,flat.positions);
});

test('cached buildings follow new terrain without accumulated vertical displacement', async t => {
  const stream=createCityStream(tinyIndex(),{fetcher:async()=>response(),heightAt:()=>10});
  t.after(()=>stream.dispose());await stream.prepareAt({x:500,z:0},10);
  const record=stream.cache.get(2),positions=record.mesh.geometry.attributes.position;
  const initial=positions.array.slice();
  stream.setTerrainSampler(()=>24,1);
  for(let i=1;i<initial.length;i+=3)assert.ok(Math.abs(positions.array[i]-initial[i]-14)<.0001);
  stream.setTerrainSampler(()=>24,2);stream.setTerrainSampler(()=>10,3);
  for(let i=1;i<initial.length;i+=3)assert.ok(Math.abs(positions.array[i]-initial[i])<.0001);
});
