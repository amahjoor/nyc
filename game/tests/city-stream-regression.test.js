import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCityStream, decodeI3S } from '../dist/city-stream.js';
import { Simulation } from '../dist/simulation.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
const samples = [
  { name: 'soho', resource: 4341, features: 280, triangles: 11512, holes: 3 },
  { name: 'brooklyn', resource: 4, features: 114, triangles: 3166, holes: 0 },
  { name: 'queens', resource: 301, features: 423, triangles: 15991, holes: 2 },
  { name: 'bronx', resource: 2264, features: 105, triangles: 5892, holes: 0 },
  { name: 'staten-island', resource: 2737, features: 335, triangles: 11510, holes: 1 },
].map(sample => {
  const bytes = gunzipSync(readFileSync(new URL(`./fixtures/i3s-${sample.name}.bin.gz`, import.meta.url)));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const node = index.nodes.find(node => node.resource === sample.resource);
  return { ...sample, buffer, node };
});

for (const sample of samples) test(`${sample.name}: official geometry produces measured buildings and colliders in its actual borough`, () => {
  const decoded = decodeI3S(sample.buffer, sample.node, index.origin);
  assert.equal(decoded.featureCount, sample.features);
  assert.equal(decoded.triangles, sample.triangles);
  assert.equal(decoded.buildings.reduce((count, building) => count + building.holes.length, 0), sample.holes);
  assert.ok(decoded.buildings.length >= sample.features);
  assert.ok(decoded.positions.every(Number.isFinite));
  assert.ok(decoded.buildings.every(building => building.height >= 0 && building.heightEstimated === false && Number.isFinite(building.baseElevation)));
  let horizontalFaces = 0, verticalFaces = 0;
  for (let offset = 0; offset < decoded.positions.length; offset += 9) {
    const p = decoded.positions;
    const ax = p[offset + 3] - p[offset], ay = p[offset + 4] - p[offset + 1], az = p[offset + 5] - p[offset + 2];
    const bx = p[offset + 6] - p[offset], by = p[offset + 7] - p[offset + 1], bz = p[offset + 8] - p[offset + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (!length) continue;
    if (Math.abs(ny / length) > 0.65) horizontalFaces++;
    if (Math.abs(ny / length) < 0.1) verticalFaces++;
  }
  assert.ok(horizontalFaces > 0 && verticalFaces > 0, 'the roof material mask must distinguish real roofs from real walls');
  for (let vertex = 0; vertex < decoded.positions.length; vertex += 3) {
    const x = decoded.positions[vertex], y = decoded.positions[vertex + 1], z = decoded.positions[vertex + 2];
    assert.ok(y >= -0.001, 'flattened surveyed buildings never extend below their ground plane');
    assert.ok(Math.hypot(x - sample.node.x, z - sample.node.z) <= sample.node.radius + 1,
      'the spatial readiness index encloses every decoded vertex');
  }
  const sim = new Simulation({ bounds: { minX: -40000, maxX: 40000, minZ: -40000, maxZ: 40000 },
    roads: [], buildings: decoded.buildings, spawn: { x: -30000, z: 30000 } });
  const building = decoded.buildings.find(building => building.polygon.length > 3);
  const [x, z] = building.polygon[0];
  assert.equal(sim.isBlocked(x, z, 0.4), true, 'a measured building wall participates in gameplay collision');
  const coarse = decodeI3S(sample.buffer, sample.node, index.origin, { collisions: false });
  assert.equal(coarse.buildings.length, 0, 'overview geometry does not fabricate collision footprints');
  assert.deepEqual(coarse.positions, decoded.positions, 'rendering and collision decoding flatten the same actual geometry');
});

test('all five boroughs require every intersecting leaf before declaring collision readiness', async () => {
  for (const sample of samples) {
    const node = { ...sample.node, id: 0, children: [], parent: null };
    const localIndex = { ...index, root: 0, roots: [0], nodes: [node] };
    let release;
    const fetcher = () => new Promise(resolve => { release = () => resolve({ ok: true, arrayBuffer: async () => sample.buffer.slice(0) }); });
    let published = [];
    const stream = createCityStream(localIndex, { fetcher, onCollisionChange: buildings => { published = buildings; } });
    try {
      assert.equal(stream.isReadyAt(node.x, node.z, 4), false);
      const request = stream.prepareAt({ x: node.x, z: node.z }, 4);
      assert.equal(stream.isReadyAt(node.x, node.z, 4), false, 'an in-flight request is not collision coverage');
      release();await request;
      assert.equal(stream.isReadyAt(node.x, node.z, 4), true);
      assert.ok(published.length >= sample.features);
      for (const record of stream.cache.values()) {
        assert.ok(record.mesh.geometry.attributes.normal.array.every(Number.isFinite));
        assert.ok(record.mesh.geometry.boundingSphere.radius > 0);
      }
    } finally { stream.dispose(); }
  }
});

test('decoder rejects non-finite vertex data rather than marking its borough ready', () => {
  for (const sample of samples) {
    const corrupt = sample.buffer.slice(0);
    new DataView(corrupt).setFloat32(8, NaN, true);
    assert.throws(() => decodeI3S(corrupt, sample.node, index.origin), /invalid coordinates/);
  }
});

test('a cached survey tile recovers after collision publication fails without a second download or stale error',async()=>{
  const sample=samples.find(sample=>sample.name==='soho');
  const node={...sample.node,id:0,children:[],parent:null};
  const localIndex={...index,root:0,roots:[0],nodes:[node]};
  const focus={x:node.x,z:node.z};
  let failPublication=true,downloads=0,published=[];
  const stream=createCityStream(localIndex,{
    fetcher:async()=>{downloads++;return{ok:true,arrayBuffer:async()=>sample.buffer.slice(0)};},
    onCollisionChange:buildings=>{
      if(failPublication)throw new Error('temporary collision consumer failure');
      published=buildings;
    },
  });
  try{
    stream.update(focus,null,{overview:false});
    await assert.rejects(stream.prepareAt(focus,4),/temporary collision consumer failure/);
    assert.equal(stream.cache.size,1,'a consumer error must not discard valid measured geometry');
    assert.equal(stream.isReadyAt(focus.x,focus.z,4),false,'failed publication is not usable collision coverage');
    assert.match(stream.getStatus().error,/temporary collision consumer failure/);
    failPublication=false;
    await stream.prepareAt(focus,4);
    assert.equal(downloads,1,'recovery republishes the existing geometry instead of downloading it again');
    assert.equal(stream.isReadyAt(focus.x,focus.z,4),true);
    assert.ok(published.length>=sample.features);
    assert.equal(stream.getStatus().error,null,'a successful publication must clear its previous failure');
  }finally{stream.dispose();}
});

test('collision recovery preserves an unrelated visible tile network failure',async()=>{
  const soho=samples.find(sample=>sample.name==='soho'),brooklyn=samples.find(sample=>sample.name==='brooklyn');
  const nodes=[soho,brooklyn].map((sample,id)=>({...sample.node,id,children:[],parent:null}));
  const localIndex={...index,root:0,roots:[0,1],nodes};
  const focus={x:nodes[0].x,z:nodes[0].z};let failPublication=true;
  const stream=createCityStream(localIndex,{
    fetcher:async url=>url.includes(`/nodes/${brooklyn.resource}/`)?{ok:false,status:503}:
      {ok:true,arrayBuffer:async()=>soho.buffer.slice(0)},
    onCollisionChange:()=>{if(failPublication)throw new Error('temporary collision consumer failure');},
  });
  try{
    stream.update(focus,null,{overview:true});
    await assert.rejects(stream.prepareAt(focus,4),/temporary collision consumer failure/);
    for(let attempt=0;attempt<200&&stream.getStatus().loading;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(stream.getStatus().loading,0,'the unrelated tile has exhausted its bounded retry attempts');
    failPublication=false;await stream.prepareAt(focus,4);
    assert.equal(stream.isReadyAt(focus.x,focus.z,4),true);
    assert.match(stream.getStatus().error,/503/,'recovering SoHo collisions cannot hide the failed Brooklyn request');
  }finally{stream.dispose();}
});

test('failed travel map replacement can roll back without stale car routes or lost progress', () => {
  const roads = [{ id: 'old-street', name: 'Current Street', points: [[0, -300], [0, 300]], width: 14, oneway: true }];
  const sim = new Simulation({ bounds: { minX: -30000, maxX: 30000, minZ: -30000, maxZ: 30000 },
    roads, buildings: [], spawn: { x: 0, z: 0 }, missionPoints: [{ x: 0, z: 100, name: 'Existing job' }] });
  sim.cash = 925;sim.deliveries = 8;sim.interact();sim.startMission();
  const previous = { roads: sim.city.roads, buildings: sim.city.buildings, missionPoints: sim.city.missionPoints };
  const player = { ...sim.player }, mission = sim.mission;
  assert.throws(() => sim.setActiveCity({ roads: [] }, { spawn: { x: Infinity, z: 0 } }), /finite/);
  assert.throws(() => sim.setActiveCity({ roads: [{ ...roads[0], points: [[10000, 9900], [10000, 10100]] }] }, { spawn: { x: 20000, z: 20000 } }), /loaded, clear street/);
  sim.setActiveCity(previous);
  assert.deepEqual(sim.player, player);
  assert.equal(sim.mission, mission);
  assert.equal(sim.cash, 925);assert.equal(sim.deliveries, 8);
  const currentEdges = new Set(sim._graph.edges);
  for (const car of sim.cars) {
    assert.ok(car._edge === null || currentEdges.has(car._edge));
    assert.ok(car._route.every(edge => currentEdges.has(edge)));
  }
  assert.doesNotThrow(() => sim.step({}, 1 / 30));
});
