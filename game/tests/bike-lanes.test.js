import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from '../dist/vendor/three.module.min.js';
import { indexBikeLanes,createLaneMarkings } from '../dist/bike-lanes.js';

test('NYC lane data covers five boroughs and draws the mapped protected lane on First Avenue',async()=>{
  const data=JSON.parse(readFileSync(new URL('../dist/bike-lanes.json',import.meta.url)));
  assert.deepEqual(Object.keys(data.byBorough).sort(),['1','2','3','4','5']);
  assert.ok(data.source.endsWith('/mzxg-pwib.json'));
  assert.deepEqual([...new Set(data.lines.map(row=>row[0]))].sort(),['buffer','lane','path','protected','shared','signed']);
  const index=await indexBikeLanes(data);
  const x=1598,z=-875;
  const nearby=index.within({minX:x-20,maxX:x+20,minZ:z-20,maxZ:z+20});
  assert.ok([...nearby].some(l=>l.kind==='protected'));
  const paint=createLaneMarkings(new Scene(),index,()=>3);
  paint.update({x,z},true,0);
  const before=paint.mesh.geometry;
  assert.ok(before.attributes.position.count>100);
  assert.ok(Math.abs(before.attributes.position.getY(0)-3.038)<.03);
  paint.update({x,z},true,0);assert.equal(paint.mesh.geometry,before);
  paint.update({x,z},false,0);assert.equal(paint.mesh.visible,false);
  paint.update({x:100000,z:100000},true,1);assert.equal(paint.mesh.geometry.attributes.position.count,0);
});

test('riders stop at a red, cross into the next directed block on green and keep their appearance',async()=>{
  const {createBikeTraffic}=await import('../dist/bike-traffic.js');
  const {planJunction,vehicleAspect}=await import('../dist/signal-plan.js');
  const {seeded}=await import('../dist/crowd.js');
  const index=await indexBikeLanes({lines:[['protected',13,0,0,0,640],['protected',13,20,660,20,1500]],
    links:[[0,1,0,0,0,65],[1,2,0,0,60,0]],streets:['First Ave']});
  const traffic=createBikeTraffic({index,heightAt:()=>2,capacity:1,random:seeded(6),appearance:()=>({height:1.76})});
  const focus={x:18,z:25,y:2},plan=planJunction({x:0,z:64,arms:[{angle:0,width:18},{angle:Math.PI/2,width:11,inbound:true},{angle:Math.PI,width:18,inbound:true}]});
  const ctx={visible:true,junctions:[{x:0,z:64,plan}],time:0};
  const phase=aspect=>Array.from({length:plan.cycle},(_,t)=>t).find(t=>vehicleAspect(plan,0,t).aspect===aspect);
  ctx.time=phase('red');traffic.update(focus,0,ctx);const r=traffic.riders[0],look=r.look;
  const [edge]=index.departures.get(0);Object.assign(r,{edge,x:0,z:44,d:44,y:2,heading:0,speed:4});
  for(let i=0;i<200;i++)traffic.update(focus,.1,ctx);
  assert.ok(Math.abs(r.z-57.5)<.2 && r.speed<.05);
  ctx.time=phase('green');
  let biggest=0;
  for(let i=0;i<85;i++){const last={x:r.x,z:r.z};traffic.update(focus,.1,ctx);biggest=Math.max(biggest,Math.hypot(last.x-r.x,last.z-r.z));}
  assert.equal(r.edge.start,1);assert.ok(r.z>67);assert.ok(biggest<1);
  assert.equal(traffic.figures[0].look,look);assert.equal(traffic.figures[0].clip,'cycle');
  assert.equal(traffic.meshes.reduce((n,m)=>n+m.count,0),1);
  const z=r.z;traffic.update(focus,0,ctx);assert.equal(r.z,z);
});

test('two-way path cyclists keep right and yield to people; parked cars leave lane and intersection space',async()=>{
  const {createBikeTraffic}=await import('../dist/bike-traffic.js');
  const {bikeLaneParking}=await import('../dist/bike-lanes.js');
  const {seeded}=await import('../dist/crowd.js');
  const index=await indexBikeLanes({lines:[['path',13,0,0,0,2000]],links:[[0,1,0,1]],streets:['Greenway']});
  const traffic=createBikeTraffic({index,heightAt:()=>0,capacity:7,random:seeded(34),appearance:()=>({})});
  const focus={x:12,z:100},ctx={visible:true,people:[]};traffic.update(focus,0,ctx);
  assert.equal(new Set(traffic.riders.map(r=>r.edge.reverse)).size,2);
  for(const r of traffic.riders)assert.ok(r.edge.reverse?r.x>0:r.x<0);
  const rider=traffic.riders[0],dir=rider.edge.reverse?-1:1;
  const walker={x:rider.x,z:rider.z+dir*7};ctx.people.push(walker);
  for(let i=0;i<70;i++)traffic.update(focus,.1,ctx);
  assert.ok(rider.speed<.05 && (walker.z-rider.z)*dir>1);
  const lanes=await indexBikeLanes({lines:[['protected',13,0,0,0,2000]],links:[[0,1,0,2,70,70]]});
  const moved=bikeLaneParking(lanes,{x:0,z:80},()=>true);
  assert.ok(moved.x < -3);assert.equal(bikeLaneParking(lanes,{x:0,z:3},()=>true),null);
  assert.equal(bikeLaneParking(lanes,{x:0,z:80},()=>false),null);
});

test('a hard vehicle contact separates the cyclist from the bicycle and the same rider recovers it',async()=>{
  const {createBikeTraffic}=await import('../dist/bike-traffic.js');
  const {seeded}=await import('../dist/crowd.js');
  const index=await indexBikeLanes({lines:[['protected',13,0,0,0,2000]],links:[[0,1,0,0]]});
  const traffic=createBikeTraffic({index,heightAt:()=>0,capacity:1,random:seeded(7),appearance:()=>({height:1.67})});
  const focus={x:25,z:80},ctx={visible:true};traffic.update(focus,0,ctx);
  const r=traffic.riders[0],look=r.look;
  Object.assign(r,{d:45,x:0,z:45,heading:0});
  ctx.contactCar=()=>({car:{speed:8,angle:Math.PI/2},nx:1,nz:0});
  traffic.update(focus,.2,ctx);assert.equal(traffic.figures[0].clip,'knocked');assert.ok(r.x>r.crash.x+.35);
  delete ctx.contactCar;
  for(let i=0;i<120;i++)traffic.update(focus,.1,ctx);
  assert.equal(r.crash,null);assert.equal(r.look,look);assert.equal(traffic.figures[0].clip,'cycle');assert.ok(r.speed>1);
});

test('a rider bicycle blocks the walker, transfers once, and keeps its frame when remounted',async()=>{
  const {Simulation}=await import('../dist/simulation.js');
  const {createBikeTraffic}=await import('../dist/bike-traffic.js');
  const {seeded}=await import('../dist/crowd.js');
  const index=await indexBikeLanes({lines:[['protected',13,0,0,0,2000]],links:[[0,1,0,0]]});
  const displaced=[],traffic=createBikeTraffic({index,heightAt:()=>0,capacity:1,random:seeded(7),
    appearance:()=>({height:1.7}),onDisplaced:r=>displaced.push(r)});
  const sim=new Simulation({bounds:{minX:-200,minZ:-200,maxX:200,maxZ:260},roads:[],buildings:[],spawn:{x:25,z:80,angle:0}});
  sim.cars=[];sim.bikeTraffic=traffic;traffic.update(sim.player,0,{visible:true});
  const [bike]=traffic.bicycles,p=sim.player;
  Object.assign(p,{x:bike.x+.68,y:0,z:bike.z,grounded:true});
  assert.equal(sim.witnesses(bike.x,bike.z,3,0),1);
  assert.equal(sim.witnesses(bike.x,bike.z,3,8),0);
  assert.equal(sim._contact(bike.x,bike.z,.38,false,0,p).kind,'bicycle');
  assert.equal(sim._contact(bike.x,bike.z,.38,false,4,p),null);
  assert.ok(sim.interact());assert.equal(p.mode,'bike');assert.equal(sim.bike.personal,bike.personal);
  assert.equal(traffic.riders.length,0);assert.equal(traffic.bicycles.length,0);
  assert.deepEqual(displaced,[bike.owner]);assert.equal(traffic.take(bike),false);
  assert.ok(sim.interact());assert.equal(p.mode,'walk');assert.ok(sim.interact());assert.equal(p.mode,'bike');
  assert.equal(displaced.length,1);
});
