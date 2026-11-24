import test from 'node:test';
import assert from 'node:assert/strict';
import {carTop} from '../dist/player-moves.js';
import {handStrikes,closeStrikes,movingStrikes,meleeMoves} from '../dist/melee-moves.js';
import {Simulation} from '../dist/simulation.js';
import {motorist,phoneGlance} from '../dist/motorists.js';
import {createCrowd,dress,seeded} from '../dist/crowd.js';
import {planRoom,buildRoom} from '../dist/interiors.js';
import {populateShop,inviteCustomer} from '../dist/shop-life.js';
import {ShopDoor} from '../dist/room.js';

function street() {
  const road={id:'road',name:'ST',points:[[0,-160],[0,160]],width:9,oneway:'yes',kind:'residential',roadwayType:1,fromLevel:13,toLevel:13};
  const sim=new Simulation({bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},roads:[road],buildings:[],spawn:{x:22,z:2,angle:0}});
  const edge=sim._graph.edges[0], car=sim._makeCar('shopper','sedan',sim._lanePoint(edge,.45),edge.angle,edge);
  car.y=0; sim.cars=[car];return {sim,car};
}

test('phone exposure has the survey duty cycle and stays stable across render rates',()=>{
  let holding=0, observed=0, phoneUsers=0;
  for(let id=0;id<1000;id++) {
    const car={id}, profile=motorist(car);
    if(profile.usesPhone) phoneUsers++;
    for(let frame=0;frame<100;frame++) {
      if(phoneGlance(car,frame*profile.period/100)>=0) holding++;
      observed++;
    }
    assert.deepEqual(profile,motorist({id}));
  }
  assert.ok(phoneUsers>450 && phoneUsers<550);
  assert.ok(Math.abs(holding/observed-.03)<.003);
});

test('an ordinary unarmed attack chooses a car kick, a low kick, or a punch',()=>{
  const {sim,car}=street();
  Object.assign(sim.player,{x:car.x+1.25,z:car.z,y:0,angle:-Math.PI/2});
  assert.ok(sim.fight());
  assert.equal(sim.player.move.kind,'kick');
  for(let i=0;i<20;i++) sim.step({},1/60);
  const hit=sim.moveEvents.find(e=>e.kind==='kick');
  assert.equal(hit.vehicleId,car.id);
  assert.ok(sim.strikeVehicle(hit,5));
  sim.player.move=null;
  sim.player.angle=Math.PI/2;
  assert.ok(sim.fight({state:'down'})); assert.equal(sim.player.move.kind,'lowKick');
  sim.player.move=null;
  assert.ok(sim.fight()); assert.ok(sim.player.swing>0);
});

test('both attack buttons stomp the supporting car, including as it moves',()=>{
  const {sim,car}=street(); sim.moves=true; car.parked=true;
  Object.assign(sim.player,{x:car.x,z:car.z,y:carTop(car,car.x,car.z),standing:{id:car.id,x:car.x,z:car.z,angle:car.angle}});
  for(const [button,clip] of [['fight','stompRight'],['kick','stompLeft']]) {
    assert.ok(sim[button]()); assert.equal(sim.player.move.clip,clip);
    car.x+=.5;
    while(sim.player.move) sim.step({},1/60);
    const hits=sim.moveEvents.splice(0).filter(e=>e.kind==='kick');
    assert.equal(hits.length,1); assert.equal(hits[0].vehicleId,car.id);
    assert.ok(Math.abs(hits[0].x-car.x)<.01);
    assert.ok(sim.strikeVehicle(hits[0],5)); assert.ok(car.bodyRock.heave<0);
    assert.equal(sim.strikeVehicle({...hits[0],vehicleId:'other'},5),false);
  }
});

test('hand strikes each land once at their own contact frame',()=>{
  const {sim}=street();
  for(const [sequence,speed,gap] of [[handStrikes,0,1.5],[closeStrikes,0,.85],[movingStrikes,2.5,1.5]]) for(const clip of sequence) {
    sim.player.speed=speed;
    assert.ok(sim.fight({x:sim.player.x,z:sim.player.z+gap},'light')); assert.equal(sim.player.swingClip,clip);
    let elapsed=0, hits=0;
    while(sim.player.swing>0) {
      sim.step({},1/60); elapsed+=1/60;
      for(const event of sim.moveEvents.splice(0)) if(event.kind==='punch') {
        assert.equal(event.clip,clip);assert.ok(Math.abs(elapsed-meleeMoves[clip].contact)<=1/60+.0001);hits++;
      }
    }
    assert.equal(hits,1);
  }
});

test('an assisted strike respects a thin wall, a target leaving reach, and the approach budget',()=>{
  function swing(mode,hz) {
    const {sim}=street(), p=sim.player;
    const start=p.z, target={x:p.x,z:start+1.14,y:p.y};
    if (mode==='wall') {
      const blocked=sim.isBlocked.bind(sim);
      sim.isBlocked=(x,z,r,options)=>Math.abs(z-(start+.59))<.03+r || blocked(x,z,r,options);
    }
    assert.ok(sim.fight(target));const attack=sim.meleeAction;
    while(!attack.committed) {
      if (mode==='escape' && sim.elapsed-attack.started>.05) target.z=start+2.5;
      sim.step({},1/hz);
    }
    assert.ok(p.z-start<=.481 && p.z>=start);
    return {distance:p.z-start,point:attack.point};
  }
  for (const hz of [24,60,120]) {
    assert.equal(swing('wall',hz).point,null);
    assert.equal(swing('escape',hz).point,null);
    assert.ok(swing('clear',hz).point);
  }
  assert.ok(Math.abs(swing('clear',24).distance-swing('clear',120).distance)<.005);
});

test('an impatient blocked driver honks with a cooldown and only confronts after repeated strikes',()=>{
  const {sim,car}=street(); Object.assign(motorist(car),{honks:true,patience:5,confronts:true});
  Object.assign(sim.player,{x:car.x,z:car.z+3.7,y:0});
  for(let i=0;i<12*60;i++)sim.step({},1/60);
  assert.equal(sim.moveEvents.filter(e=>e.kind==='driverHorn').length,1);
  assert.equal(car.driverEjected,undefined);
  const hit={x:car.x+1.25,z:car.z,angle:-Math.PI/2};
  assert.ok(sim.strikeVehicle(hit,3));assert.ok(!car.driverEjected);
  assert.ok(sim.strikeVehicle(hit,3));assert.ok(car.parked && car.driverEjected);
  sim.strikeVehicle(hit,3);
  assert.equal(sim.moveEvents.filter(e=>e.kind==='driverConfronts').length,1);
});

test('one driver parks at a free curb, visits the coffee shop, reboards and drives on',()=>{
  const {sim,car}=street();
  motorist(car).shops=true;
  const space={id:'curb',x:car.x-3,z:6,angle:0};
  const shop={id:'coffee',x:space.x-5,z:6,nx:1,nz:0,y:0};
  const front={...shop,tx:0,tz:1,width:7,place:{id:'coffee',kind:'coffee',name:'Coffee',x:shop.x,z:6}};
  const plan=planRoom(front,(x,z)=>x<shop.x && x>shop.x-12);
  const group=buildRoom(plan),view={plan,group,floor:0,door:new ShopDoor(),actors:[],occupied:new Set()};populateShop(view);
  const crowd=createCrowd({life:{crowding:()=>0,wardrobe:()=>({casual:1})}});
  const look=dress('office',seeded(5)), phases=new Set(),walks=[];let sales=0;
  try {
    for(let i=0;i<4500;i++) {
      if(i%20===0)crowd.updateShoppingDrivers(sim,[space],[shop],()=>look);
      sim.step({},.05); view.door.step(.05);
      inviteCustomer(view,crowd.people,sim.elapsed,()=>sales++);
      crowd.update(.05,{walks,focus:sim.player,player:sim.player,time:sim.elapsed,cars:sim.cars});
      if(car.errand)phases.add(car.errand.phase);
      if(car.finishedErrand && !car.errand && car.z>space.z+8)break;
    }
    assert.deepEqual([...phases],['approach','parked','walking','waiting','visiting','returning','boarded']);
    assert.ok(sales>0 && car.speed>1 && car.z>space.z+8);
    assert.equal(crowd.people.length,0);
  } finally {crowd.dispose();group.userData.dispose();}
});

test('a sudden cut-in during a phone glance can cause a physical rear-end collision',()=>{
  function cutIn(phoneOffset) {
    const {sim,car}=street();
    Object.assign(motorist(car),{phoneOffset,period:100,usesPhone:true});
    car._cruise=car.speed=8;
    sim.step({},1/60);
    const lead=sim._makeCar('lead','sedan',{x:car.x,z:car.z+7.8},car.angle,car._edge);
    lead.y=0; lead.speed=lead._cruise=0;
    sim.cars.push(lead);
    let collided=false;
    sim.onVehicleContact=(kind,source,target,speed)=>{
      if(kind==='crash' && source===car && target===lead && speed>0) collided=true;
    };
    for(let i=0;i<45 && !collided;i++) sim.step({},1/60);
    return collided;
  }
  assert.equal(cutIn(50),false);
  assert.equal(cutIn(0),true);
});

test('driver patience controls the horn gesture and a sustained obstruction escalates it',()=>{
  const {sim,car}=street(), driver=motorist(car);
  sim.player.x=car.x;sim.player.z=car.z;
  function honk(patience,waiting){
    Object.assign(driver,{confronts:false,patience});car.blockedForHorn=waiting;
    sim.elapsed+=25;sim._driverHorn(car);return sim.moveEvents.at(-1).gesture;
  }
  assert.equal(honk(12,12),'courteous');assert.equal(honk(9,9),'ordinary');
  assert.equal(honk(6,6),'impatient');assert.equal(honk(6,22),'insistent');assert.equal(honk(12,32),'ordinary');
});
