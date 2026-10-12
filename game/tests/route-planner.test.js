import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoutePlanner} from '../dist/route-planner.js';
import {encodeNavigationData} from '../scripts/build-navigation-data.mjs';

const road=(id,points,extra={})=>({id:`cscl:${id}`,name:`ROAD ${id}`,points,kind:'residential',oneway:false,borough:1,fromLevel:13,toLevel:13,...extra});
const planner=roads=>createRoutePlanner(encodeNavigationData(roads,{origin:{lat:40.7235,lon:-74.0015},bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000}}));
const xy=(x,z)=>({x,z});

test('compact source encoding round-trips centimeter geometry, identities, names and levels',()=>{
  const source=[road('12:3',[[-15326.47,-12004.38],[-15200.01,-12440.99],[-15112.52,-12830.74]],{name:'MEASURED RAMP',oneway:'-1',kind:'ramp',fromLevel:25,toLevel:13,borough:5})];
  const encoded=encodeNavigationData(source),decoded=createRoutePlanner(encoded).roads[0];
  for(const key of ['id','name','points','oneway','kind','fromLevel','toLevel','borough'])assert.deepEqual(decoded[key],source[0][key]);
  assert.deepEqual(encodeNavigationData(source),encoded,'offline rebuild is deterministic');
  assert.throws(()=>createRoutePlanner({...encoded,roads:[encoded.roads[0],encoded.roads[0]]}),/identity/);
});

test('one-way roads require the real connecting loop instead of a reverse shortcut',()=>{
  const p=planner([road(1,[[0,0],[100,0]],{oneway:'yes'}),road(2,[[100,0],[100,100]],{oneway:'yes'}),road(3,[[100,100],[0,100]],{oneway:'yes'}),road(4,[[0,100],[0,0]],{oneway:'yes'})]);
  const route=p.plan(xy(80,0),xy(20,0));assert.equal(route.ok,true);assert.equal(route.distance,340);
  assert.deepEqual(route.legs.map(leg=>leg.roadId),['cscl:1','cscl:2','cscl:3','cscl:4','cscl:1']);
  assert.ok(route.legs.every(leg=>leg.toStation>=leg.fromStation));assert.deepEqual(route.points[0],[80,0]);assert.deepEqual(route.points.at(-1),[20,0]);
});

test('reverse source direction is enforced and an isolated wrong-way route is unreachable',()=>{
  const p=planner([road(1,[[0,0],[100,0]],{oneway:'-1'})]);
  assert.equal(p.plan(xy(80,0),xy(20,0)).distance,60);
  assert.equal(p.plan(xy(20,0),xy(80,0)).reason,'unreachable');
  const endpoint=planner([road(1,[[0,0],[100,0]],{oneway:'yes'}),road(2,[[0,0],[0,100]])]);
  assert.equal(endpoint.plan({...xy(0,0),roadId:'cscl:1'},xy(0,80)).distance,80,'starting exactly at a source junction may leave on another street');
});

test('planar crossings and different endpoint levels never create an invented junction',()=>{
  const crossing=planner([road(1,[[-100,0],[100,0]]),road(2,[[0,-100],[0,100]])]);
  assert.equal(crossing.plan(xy(-80,0),xy(0,80)).reason,'unreachable');
  const stacked=planner([road(1,[[-100,0],[0,0]]),road(2,[[0,0],[100,0]],{kind:'bridge',fromLevel:17,toLevel:17})]);
  assert.equal(stacked.plan(xy(-80,0),xy(80,0)).reason,'unreachable');
  const ramp=planner([road(1,[[-100,0],[0,0]]),road(2,[[50,0],[100,0]],{kind:'bridge',fromLevel:17,toLevel:17}),road(3,[[0,0],[25,25],[50,0]],{kind:'ramp',fromLevel:13,toLevel:17})]);
  const route=ramp.plan(xy(-80,0),xy(80,0));assert.equal(route.ok,true);assert.ok(route.legs.some(leg=>leg.roadId==='cscl:3'));assert.ok(route.distance>160);
});

test('unmodeled tunnels remain visible source roads but cannot supply driving connectivity',()=>{
  const p=planner([road(1,[[0,0],[100,0]]),road(2,[[100,0],[200,0]],{kind:'tunnel'}),road(3,[[200,0],[300,0]])]);
  assert.equal(p.roads.length,3);assert.equal(p.stats.routableRoads,2);assert.equal(p.plan(xy(20,0),xy(280,0)).reason,'unreachable');
  assert.equal(p.snap(xy(150,0),{roadId:'cscl:2'}),null);
});

test('routes follow surveyed bends and preserve continuous partial endpoint geometry',()=>{
  const p=planner([road(1,[[0,0],[30,40],[60,0]])]);
  const route=p.plan(xy(0,0),xy(60,0));assert.equal(route.distance,100);assert.deepEqual(route.points,[[0,0],[30,40],[60,0]]);
  const partial=p.plan(xy(9,12),xy(51,12));assert.equal(partial.distance,70);assert.deepEqual(partial.points,[[9,12],[30,40],[51,12]]);
  assert.equal(p.plan(xy(0,0),xy(5000,5000)).reason,'no-road');assert.equal(p.plan(xy(NaN,0),xy(0,0)).reason,'no-road');
});

test('invalid search radii cannot create an unbounded spatial query',()=>{
  const p=planner([road(1,[[0,0],[100,0]])]);
  for(const maxSnapDistance of [Infinity,NaN,-1,1000000])assert.equal(p.plan(xy(20,0),xy(80,0),{maxSnapDistance}).reason,'no-road');
  assert.equal(p.plan(xy(20,0),xy(80,0),{maxSnapDistance:0}).distance,60);
});

test('turn instructions use world east/south orientation and progress reports turns, arrival and deviation',()=>{
  const p=planner([road(1,[[0,0],[100,0]],{name:'FIRST ST'}),road(2,[[100,0],[100,100]],{name:'SECOND ST'})]);
  const route=p.plan(xy(0,0),xy(100,100));const turn=route.instructions.find(instruction=>instruction.kind==='right');
  assert.equal(turn.atDistance,100);assert.equal(turn.roadName,'SECOND ST');assert.equal(route.distance,200);
  const progress=p.progress(route,xy(40,0));assert.equal(progress.remainingDistance,160);assert.equal(progress.distanceToInstruction,60);assert.equal(progress.offRoute,false);assert.equal(progress.nextInstruction.kind,'right');
  assert.equal(p.progress(route,xy(40,80)).offRoute,true);assert.equal(p.progress(route,xy(100,100)).arrived,true);
  assert.equal(p.plan(xy(100,100),xy(0,0)).instructions.find(instruction=>instruction.kind==='left').roadName,'FIRST ST');
  const stationary=p.plan(xy(50,0),xy(50,0));assert.equal(stationary.distance,0);assert.equal(p.progress(stationary,xy(50,0)).arrived,true);
});

test('continuing through source segments with the same name does not announce every segment',()=>{
  const p=planner([road(1,[[0,0],[100,0]],{name:'BROADWAY'}),road(2,[[100,0],[200,0]],{name:'BROADWAY'})]);
  const route=p.plan(xy(10,0),xy(180,0));assert.deepEqual(route.instructions.map(instruction=>instruction.kind),['depart','arrive']);
});

test('explicit source road hints select the correct overlapping level without adding a cross-level connection',()=>{
  const p=planner([road(1,[[0,0],[100,0]]),road(2,[[0,0],[100,0]],{kind:'bridge',fromLevel:17,toLevel:17})]);
  const route=p.plan({...xy(20,0),roadId:'cscl:2'},{...xy(80,0),roadId:'cscl:2'});assert.equal(route.legs[0].roadId,'cscl:2');
  assert.equal(p.plan({...xy(20,0),roadId:'cscl:1'},{...xy(80,0),roadId:'cscl:2'}).reason,'unreachable');
});

test('bundled network is compact and connects actual source destinations across all five boroughs',()=>{
  const raw=readFileSync(new URL('../dist/navigation-roads.json',import.meta.url)),data=JSON.parse(raw),p=createRoutePlanner(data);
  assert.ok(raw.length<6_000_000);assert.equal(p.roads.length,118916);assert.equal(data.stats.points,356357);assert.equal(Object.keys(data.stats.byBorough).length,5);
  assert.equal(data.stats.byKind.tunnel,164);assert.equal(p.stats.routableRoads,118752);
  const index=JSON.parse(readFileSync(new URL('../dist/road-index.json',import.meta.url))),byId=new Map(p.roads.map(road=>[road.id,road]));
  const seen=new Set();for(const cell of Object.values(index.cells))for(const source of JSON.parse(readFileSync(new URL('../dist/'+cell.url.slice(2),import.meta.url))).roads){
    if(seen.has(source.id))continue;seen.add(source.id);const actual=byId.get(source.id);
    for(const key of ['points','name','kind','oneway','fromLevel','toLevel','borough'])assert.deepEqual(actual[key],source[key],source.id+' '+key);
  }
  assert.equal(seen.size,p.roads.length);
  for(const destination of index.places.slice(1)){
    const route=p.plan(index.places[0],destination);assert.equal(route.ok,true,destination.name);assert.ok(route.distance>1000);
    assert.ok(route.legs.every(leg=>leg.kind!=='tunnel'));
    for(let i=1;i<route.legs.length;i++)assert.ok(distanceBetween(route.legs[i-1].points.at(-1),route.legs[i].points[0])<.001,'routing cannot add an unmapped gap');
    assert.equal(p.progress(route,route.end).arrived,true);
  }
});
function distanceBetween(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
