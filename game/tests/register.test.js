import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoom, planRoom } from '../dist/interiors.js';
import { beginRegisterTake, registerAction, updateClerk } from '../dist/register.js';
import { inviteCustomer, populateShop } from '../dist/shop-life.js';
import { roomLocal, roomPoint } from '../dist/room.js';
import { Work } from '../dist/work.js';

function fixture(kind='clothes') {
  const place={id:'fixture',kind,name:'Costume Shop',x:0,z:0};
  const plan=planRoom({place,x:0,z:0,width:9,tx:1,tz:0,nx:0,nz:1});
  const view={plan,group:buildRoom(plan),floor:0,actors:[],occupied:new Set()};
  view.door=view.group.userData.door;
  populateShop(view);
  const reports=[], notices=[];
  const sim={room:{...plan},doorway:view,player:{mode:'walk',armed:false,y:0},cash:0,elapsed:50,
    offence:(type,info)=>reports.push([type,info]),_say:msg=>notices.push(msg)};
  const work=new Work({sim,counter:()=>registerAction(sim)?place:null,save(){}});
  const till=plan.register;
  function stand(a,b){[sim.player.x,sim.player.z]=roomPoint(plan,a,b);}
  function side(direction){stand(till.a+direction*.95*till.da,till.b+direction*.95*till.db);}
  const look=()=>Math.atan2(view.clerk.x-sim.player.x,view.clerk.z-sim.player.z);
  const escaped=[];
  function tick(dt,heading=look(),pitch=0){
    sim.elapsed+=dt;
    updateClerk(view,sim,heading,pitch,dt,work,{outside:actor=>escaped.push(actor),firstPerson:true});
  }
  return {place,sim,work,view,side,stand,look,tick,escaped,reports,notices};
}

test('reaching into the drawer opens it and taking the notes pays exactly once',()=>{
  const f=fixture();try {
    f.side(-1);assert.equal(beginRegisterTake(f.sim,f.work),false);
    f.side(1);const amount=f.work.balance(f.place);
    assert.ok(beginRegisterTake(f.sim,f.work));const take=f.view.take;
    assert.ok(beginRegisterTake(f.sim,f.work));assert.equal(f.view.take,take);
    f.tick(.3);const drawer=f.view.group.getObjectByName('Register drawer'), cash=f.view.group.getObjectByName('Cash from clerk');
    assert.ok(drawer.position.distanceTo(cash.position)<.15);
    assert.ok(f.view.group.getObjectByName('Reaching hand').visible);
    const atDrawer=cash.position.clone();
    f.tick(.8);assert.ok(atDrawer.distanceTo(cash.position)>.15);assert.equal(f.sim.cash,0);
    f.tick(.3);assert.equal(f.sim.cash,amount);assert.equal(cash.visible,false);
    assert.equal(f.view.group.getObjectByName('Reaching hand').visible,false);
    assert.equal(f.reports.length,1);assert.equal(registerAction(f.sim),null);
    f.work.restore(structuredClone(f.work.record));assert.ok(f.work.isClosed(f.place));
    assert.equal(f.work.balance(f.place),0);
  } finally {f.view.group.userData.dispose();}
});

test('leaving during a reach cancels the transaction',()=>{
  const f=fixture();try {
    f.side(1);beginRegisterTake(f.sim,f.work);f.tick(.6);f.stand(0,1);f.tick(.9);
    assert.equal(f.view.take,null);assert.equal(f.sim.cash,0);assert.ok(f.work.balance(f.place)>0);
  } finally {f.view.group.userData.dispose();}
});

test('the clerk notices a visible weapon off-axis and picks up and extends the same bundle',()=>{
  const f=fixture();try {
    f.side(-1);f.tick(.1);assert.equal(f.view.handoff??null,null);
    f.sim.player.armed=true;f.tick(.1,f.look()+1.1,.6);
    assert.equal(f.view.clerk.clip,'handsUp');assert.equal(f.reports.length,1);
    f.tick(.6,f.look()+.7);assert.equal(f.view.clerk.clip,'pickUp');
    const cash=f.view.group.getObjectByName('Cash from clerk'), inDrawer=cash.position.clone();
    f.tick(.65);assert.ok(cash.position.distanceTo(inDrawer)>.12);
    f.tick(.25);assert.equal(f.view.handoff.phase,'giving');assert.equal(f.view.clerk.clip,'reach');
    f.tick(.8);assert.equal(f.view.handoff.phase,'offered');assert.ok(cash.visible);
    f.sim.player.armed=false;f.tick(.1);
    assert.equal(registerAction(f.sim),'collect');assert.ok(beginRegisterTake(f.sim,f.work));
    const amount=f.work.balance(f.place);f.tick(.5);assert.equal(f.sim.cash,0);
    f.tick(.5);assert.equal(f.sim.cash,amount);assert.equal(f.reports.length,1);assert.equal(cash.visible,false);
    f.sim.room=null;f.tick(.1);assert.equal(f.view.clerk.clip,'jog');
    for(let i=0;i<200&&!f.view.clerk.gone;i++)f.tick(.05);
    assert.ok(f.escaped.includes(f.view.clerk));assert.ok(roomLocal(f.view.plan,f.view.clerk.x,f.view.clerk.z).b < -1);
    assert.ok(f.work.isClosed(f.place));
  } finally {f.view.group.userData.dispose();}
});

test('a shelf blocks sight and turning away long enough lets the clerk escape',()=>{
  const f=fixture();try {
    f.side(-1);f.sim.player.armed=true;
    const staff=f.view.plan.staff[f.view.plan.register.clerk], at=roomLocal(f.view.plan,f.sim.player.x,f.sim.player.z);
    const wall={a:(at.a+staff.a)/2,b:(at.b+staff.b)/2,w:.3,d:.3,h:2,y:0,solid:true};
    f.view.plan.things.push(wall);f.tick(.1);assert.equal(f.view.handoff??null,null);
    f.view.plan.things.pop();f.tick(.1);f.tick(.4,f.look()+Math.PI);
    assert.equal(f.view.handoff.phase,'startled');
    f.tick(1.2,f.look()+Math.PI);assert.equal(f.view.handoff.phase,'escaping');
    assert.equal(f.sim.cash,0);assert.ok(f.work.balance(f.place)>0);assert.equal(f.reports.length,1);
  } finally {f.view.group.userData.dispose();}
});

test('a customer waiting to pay leaves the shop when the clerk raises their hands',()=>{
  const f=fixture();
  try {
    const {view,sim}=f;
    view.door=view.group.userData.door;
    const person={x:0,z:2,state:'walk',run:{},age:4,phase:0,look:{pace:1.6}};
    const sales=[];
    inviteCustomer(view,[person],sim.elapsed,(shop,amount)=>sales.push(amount));
    assert.ok(person.visit);
    const walk=()=>{sim.elapsed+=.05;person.visit.step(person,.05,sim.elapsed);};
    for(let i=0;i<800&&person.visit&&!person.visit.wait;i++)walk();
    assert.ok(person.visit?.wait>0);
    f.side(-1);sim.player.armed=true;f.tick(.1);
    assert.equal(view.clerk.clip,'handsUp');
    for(let i=0;i<800&&person.visit;i++)walk();
    assert.deepEqual(sales,[]);
    assert.equal(person.state,'flee');
    assert.equal(view.visitor,null);
    assert.ok(Math.hypot(person.x,person.z-2)<.001);
  } finally {f.view.group.userData.dispose();}
});
