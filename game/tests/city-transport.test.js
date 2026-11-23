import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3 } from '../dist/vendor/three.module.min.js';
import { Simulation } from '../dist/simulation.js';
import { TransportFleet } from '../dist/transport.js';
import { BOARDINGS, TRANSPORT, isAircraft, isWatercraft } from '../dist/transport-catalog.js';
import { createTransportModel } from '../dist/transport-models.js';
import { landPolygons, shorelineQuery, WATER_LEVEL } from '../dist/water.js';
import { harborLimits } from '../dist/harbor-limits.js';

const json = file => JSON.parse(readFileSync(new URL('../dist/'+file+'.json',import.meta.url)));
const boroughs = json('boroughs').boroughs, bounds = json('road-index').bounds;
const isLand = shorelineQuery(landPolygons(boroughs)), inCity = shorelineQuery(harborLimits);
const isNavigable = (x,z) => inCity(x,z) && !isLand(x,z);
function at(id) {
  const stop = BOARDINGS.find(s=>s.id===id);
  const sim = new Simulation({roads:[],buildings:[],bounds,boroughs,spawn:{...stop.board},sampleSurface:()=>({elevation:1})});
  sim.cars = []; sim.transport = new TransportFleet(sim,{isLand,isNavigable,waterLevel:WATER_LEVEL});
  Object.assign(sim.player,stop.board);sim.updateGrounding();
  assert.equal(sim.transport.nearby()?.home.id,id);
  assert.ok(sim.interact(),sim.notice);
  return sim;
}
function run(sim, input, seconds, fps = 30) { for(let tick=0;tick<Math.round(seconds*fps);tick++)sim.step(input,1/fps); }

test('every catalog model has an on-foot boarding point and a usable vehicle in the correct medium',()=>{
  assert.deepEqual(new Set(BOARDINGS.map(s=>s.type)),new Set(Object.keys(TRANSPORT)));
  for(const stop of BOARDINGS){
    const sim=at(stop.id),ride=sim.transport.active;
    assert.equal(sim.player.mode,'transport');
    assert.ok(isLand(stop.board.x,stop.board.z),stop.id+' has dry access');
    assert.equal(isNavigable(ride.x,ride.z),!!isWatercraft(ride.spec),stop.id);
    const mesh=createTransportModel(stop.type), bounds=new Box3().setFromObject(mesh);
    assert.equal(mesh.name,ride.spec.name);
    assert.ok(!bounds.isEmpty() && bounds.max.z-bounds.min.z>1);
    mesh.traverse(part=>{if(part.isMesh)assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));});
    assert.ok(sim.interact(),stop.id+' can exit at its start');
    assert.equal(sim.player.mode,'walk');assert.equal(sim.transport.nearby(),ride);
    assert.ok(sim.interact());assert.equal(sim.transport.active,ride);
  }
});

test('helicopter hovers across grounding refreshes, clears roofs by height and lands for re-entry',()=>{
  const sim=at('pier6'),p=sim.player,ride=sim.transport.active,{x,z}=p;
  const block={polygon:[[x-5,z+5],[x+5,z+5],[x+5,z+10],[x-5,z+10]],height:20};
  sim.setActiveCity({buildings:[block]});ride.angle=0;
  assert.ok(sim.isBlocked(x,z+7,.4,{baseHeight:10}));
  run(sim,{lift:1},3);const height=p.y;assert.ok(height>30);
  assert.equal(sim.isBlocked(x,z+7,.4,{baseHeight:height}),false);
  sim.updateGrounding();assert.equal(p.y,height);
  assert.equal(sim.interact(),false);assert.equal(sim.transport.active,ride);
  run(sim,{},2);const hover=p.y;run(sim,{},1);assert.equal(p.y,hover);
  run(sim,{forward:1},2);assert.ok(p.z>z+10);
  run(sim,{forward:0,lift:-1},10);assert.equal(p.grounded,true);assert.equal(p.y,1);
  assert.ok(sim.interact(),sim.notice);assert.equal(sim.player.mode,'walk');
});

test('both runway planes and the floatplane need flying speed to climb',()=>{
  for(const id of ['JFK','LGA','skyport']){
    const sim=at(id),ride=sim.transport.active,base=sim.player.y;
    run(sim,{lift:1},2);assert.equal(sim.player.y,base,id);
    run(sim,{forward:1,lift:1},9);assert.ok(sim.player.y>base+15,id);
    assert.equal(sim.interact(),false);
    run(sim,{forward:-1,lift:-1},25);assert.equal(sim.player.grounded,true,id);
    assert.equal(sim.player.y,id==='skyport'?WATER_LEVEL:base,id);
    assert.equal(ride.speed,0);
  }
});

test('a water taxi can steer, stops at dry ground, and requires a landing to disembark',()=>{
  const sim=at('fulton'),r=sim.transport.active;
  run(sim,{forward:1},5);assert.ok(Math.hypot(r.x-r.home.berth.x,r.z-r.home.berth.z)>30);
  run(sim,{handbrake:true},4);assert.equal(r.speed,0);assert.equal(sim.interact(),false);
  // Point directly into the mapped bank. Once the bow grounds, even sustained
  // throttle cannot put the hull onto the street.
  Object.assign(r,r.home.berth,{angle:Math.atan2(r.home.board.x-r.home.berth.x,r.home.board.z-r.home.berth.z)});
  run(sim,{forward:1},6);assert.equal(r.speed,0);assert.ok(isNavigable(r.x,r.z));
  assert.ok(sim.interact());assert.ok(isLand(sim.player.x,sim.player.z));
});

test('a ferry can leave Ellis, cross the state line and disembark at Governors Island',()=>{
  const sim=at('ellis-ferry'), fleet=sim.transport, ride=fleet.active;
  const course=[[-3040,2960],[-2700,3080],[-1800,3100],[-1100,3080],[-1090,3280],[-1126,3349]];
  for(const [x,z] of course) {
    let remaining;
    for(let i=0;i<2400;i++){
      remaining=Math.hypot(x-ride.x,z-ride.z);
      if(remaining<10)break;
      const error=Math.atan2(x-ride.x,z-ride.z)-ride.angle;
      const turn=Math.atan2(Math.sin(error),Math.cos(error));
      fleet.step({forward:Math.abs(turn)>.7?.15:Math.min(.85,remaining/100),turn:-Math.max(-1,Math.min(1,turn*3))},.1);
    }
    assert.ok(remaining<10,`could not sail to ${x}, ${z}`);
  }
  for(let i=0;i<50;i++)fleet.step({forward:0,turn:0,handbrake:true},.1);
  assert.equal(sim.interact(),true);
  const landing=BOARDINGS.find(stop=>stop.id==='governors-ferry').board;
  assert.deepEqual([sim.player.x,sim.player.z],[landing.x,landing.z]);
});

test('the sailing area ends at the bank and a pier over water blocks a ferry bow',()=>{
  const sim=at('pier11'),r=sim.transport.active;
  assert.ok(isNavigable(-1400,0));
  assert.equal(isNavigable(-3200,0),false);
  const x=r.x+7*Math.sin(r.angle),z=r.z+7*Math.cos(r.angle);
  const ahead=10.5, bowX=x+ahead*Math.sin(r.angle),bowZ=z+ahead*Math.cos(r.angle);
  assert.ok(sim.transport.waterFits(r,x,z,r.angle));
  sim.setActiveCity({buildings:[{height:4,polygon:[[bowX-1,bowZ-1],[bowX+1,bowZ-1],[bowX+1,bowZ+1],[bowX-1,bowZ+1]]}]});
  assert.equal(sim.transport.waterFits(r,x,z,r.angle),false);
});

test('the tram and commuter train reach each terminal, allow exit there and can return',()=>{
  for(const [from,to] of [['tram-west','tram-east'],['douglaston','little-neck']]){
    const sim=at(from),r=sim.transport.active;
    run(sim,{forward:1},3);
    assert.equal(sim.interact(),false);assert.ok(r.t>0 && r.t<1);
    if(from==='tram-west')assert.ok(sim.player.y>19);
    run(sim,{},90);assert.equal(r.t,1);assert.equal(r.speed,0);assert.ok(sim.interact());
    assert.equal(sim.player.x,BOARDINGS.find(s=>s.id===to).board.x);
    assert.ok(sim.interact());run(sim,{forward:1},90);assert.equal(sim.transport.active.t,0);
    assert.equal(r.speed,0);
  }
});

test('transport movement respects unloaded areas and successful and failed transfers have distinct outcomes',()=>{
  const sim=at('JFK'),r=sim.transport.active,start={x:r.x,z:r.z};
  sim.setActiveCity({isReadyAt:()=>false});
  run(sim,{forward:1,lift:1},3);assert.equal(r.x,start.x);assert.equal(r.z,start.z);
  assert.throws(()=>sim.travelTo({...r.home.board,exact:true}));assert.equal(sim.transport.active,r);
  sim.setActiveCity({isReadyAt:()=>true});sim.travelTo({...r.home.board,exact:true});
  assert.equal(sim.transport.active,null);assert.equal(sim.player.mode,'walk');
  assert.ok(sim.transport.nearby());assert.ok(isAircraft(r.spec));
});

test('fixed-step street and marine handling agree at different display rates',()=>{
  for(const id of ['greene','grandconcourse','concourse-bus','pier11','pier26']){
    const a=at(id),b=at(id),input={forward:1,turn:.12};
    run(a,input,2,30);run(b,input,2,120);
    assert.ok(a.player.speed>0,id);
    for(const key of ['x','z','speed','angle'])assert.ok(Math.abs(a.player[key]-b.player[key])<1e-8,id+' '+key);
  }
});

test('a city bus brakes and reverses, and can cross a supported deck over water',()=>{
  const sim=at('concourse-bus'),r=sim.transport.active;
  sim.transport.isLand=()=>false;
  sim.setActiveCity({sampleSurface:()=>({elevation:1,transportId:'test-deck'})});
  run(sim,{forward:1},2);
  assert.ok(r.speed>0);assert.equal(r.transportId,'test-deck');
  run(sim,{brake:true},2);assert.equal(r.speed,0);
  run(sim,{forward:-1},2);assert.ok(r.speed<0);
  run(sim,{handbrake:true},2);assert.equal(r.speed,0);
  assert.ok(sim.interact());assert.equal(sim.player.transportId,'test-deck');
});

test('recovery stays aboard until the dry boarding point is ready',()=>{
  const sim=at('pier11'),r=sim.transport.active;
  run(sim,{forward:1},6);
  sim.setActiveCity({isReadyAt:()=>false});sim.reset();
  assert.equal(sim.player.mode,'transport');assert.equal(sim.transport.active,r);
  sim.setActiveCity({isReadyAt:()=>true});sim.reset();
  assert.equal(sim.player.mode,'walk');assert.equal(sim.transport.active,null);
  assert.equal(sim.player.x,r.home.board.x);assert.ok(isLand(sim.player.x,sim.player.z));
});
