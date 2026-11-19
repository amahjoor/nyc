import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoom,buildRoom } from '../dist/interiors.js';
import { populateShop } from '../dist/shop-life.js';
import { startCounterOrder,stepCounterOrder,stepServiceJobs } from '../dist/facility-visits.js';
import { menuFor } from '../dist/menu.js';
import { Shopping,diningTable } from '../dist/shopping.js';
import { roomPoint,ShopDoor } from '../dist/room.js';
import { groceries } from '../dist/grocery-stock.js';

function store(kind,width=6,deep=9,name=kind){
  const place={id:kind+'-'+width,name,kind,x:0,z:0};
  const front={place,x:0,z:0,tx:1,tz:0,nx:0,nz:1,width};
  const room=planRoom(front,(x,z)=>z<=0 && z>=-deep),group=buildRoom(room);
  const view={plan:room,group,actors:[],floor:0,occupied:new Set(),door:new ShopDoor()};
  populateShop(view);const sales=[],calls=[];
  const sim={room:{...room},player:{mode:'walk',x:0,z:-.4,y:0},doorway:view,cash:100,elapsed:0,_say(s){this.notice=s;},_random:()=>0,offence:(...args)=>calls.push(args)};
  sim.shopping=new Shopping(sim);
  function go(a,b){sim.room.a=a;sim.room.b=b;[sim.player.x,sim.player.z]=roomPoint(room,a,b);}
  function tick(seconds,until=()=>false){
    for(let i=0;i<seconds*20;i++){sim.elapsed+=.05;sim.shopping.tick();stepCounterOrder(sim,view,.05);stepServiceJobs(view,sim.elapsed);if(until())return;}
  }
  function atShelf(id){
    const slot=room.grocerySlots.find(s=>s.id===id && !sim.shopping.missing(place.id,s.index));
    go(slot.a+slot.da*.62,slot.b+slot.db*.62);return slot;
  }
  function checkout(){const r=room.register;go(r.a+r.da*.73,r.b+r.db*.73);}
  function placeOrder(item,basket=false){return startCounterOrder(sim,view,{item,basket,sale:(_p,n)=>sales.push(n)});}
  return {view,sim,bag:sim.shopping,room,go,tick,atShelf,checkout,placeOrder,sales,calls};
}

test('packaged stock can be handled, returned, scanned once and used from a saved inventory',()=>{
  for(const [kind,w] of [['bodega',4],['grocery',6],['supermarket',9]]){
    const {view,sim,bag,room,atShelf,checkout,tick,placeOrder,sales}=store(kind,w);
    try{
      assert.equal(new Set(room.grocerySlots.map(s=>s.id)).size,Object.keys(groceries).length);
      const water=atShelf('grocery-water');assert.ok(bag.take(sim.room,water));assert.equal(bag.take(sim.room,water),false);
      assert.ok(bag.putBack(sim.room,water.id));assert.equal(bag.missing(room.place.id,water.index),false);
      assert.ok(bag.take(sim.room,water));const chips=atShelf('grocery-chips');assert.ok(bag.take(sim.room,chips));
      view.group.userData.syncGroceries(bag);checkout();assert.ok(placeOrder(null,true));
      const order=bag.order;tick(35,()=>order.ready);assert.ok(order.ready,kind+' '+order.phase);assert.equal(order.employee.carry,'takeout');
      assert.equal(sim.cash,100);assert.ok(bag.accept(order));assert.equal(bag.accept(order),false);
      assert.equal(sales.length,1);assert.equal(sim.cash,100-sales[0]);assert.ok(bag.missing(room.place.id,chips.index));
      const saved=new Shopping(sim);saved.restore(JSON.parse(JSON.stringify(bag.record())));
      assert.equal(saved.inventory[water.id],1);assert.equal(saved.inventory[chips.id],1);
      assert.equal(saved.consume(water.id),true);assert.equal(saved.inventory[water.id],undefined);assert.equal(sim.player.carry,water.id);
    }finally{view.group.userData.dispose();}
  }
});

test('the fruit at a corner market window can be picked up and returned to its crate',()=>{
  const {bag,sim,room,view,go}=store('bodega',6,9,'Avenue Grocery Market');
  try{
    const slot=room.grocerySlots.find(s=>s.fixture && s.id==='grocery-orange');
    assert.ok(slot);go(slot.fixture.a+slot.da*(slot.fixture.w/2+.40),slot.b);
    assert.ok(bag.take(sim.room,slot));assert.ok(bag.putBack(sim.room,slot.id));assert.equal(bag.basket,null);
  }finally{view.group.userData.dispose();}
});

test('ordering a bottle fetches that physical facing and hands over the labeled bottle',()=>{
  for(const width of [4,7,9]){
    const {sim,room,bag,view,tick,checkout,placeOrder}=store('bodega',width);
    try{
      checkout();const item=menuFor(room.place).find(i=>i.product==='grocery-water');assert.ok(placeOrder(item));
      const o=bag.order;const states=new Set();tick(70,()=>{states.add(o.phase);return o.ready;});
      assert.ok(states.has('Taking item from shelf'));assert.ok(o.ready,o.phase);assert.equal(o.employee.carry,item.product);
      assert.ok(bag.accept(o));assert.equal(sim.player.carry,item.product);assert.equal(bag.inventory[item.product],1);
      assert.ok(!o.employee);assert.ok(view.actors.every(a=>!a.serviceOwner));
    }finally{view.group.userData.dispose();}
  }
});

test('unpaid exits can go unnoticed, prompt a return, or generate exactly one witness report',()=>{
  for(const outcome of ['unnoticed','warning','reported']){
    const {sim,bag,view,atShelf,calls}=store('bodega');
    try{
      const slot=atShelf('grocery-chips');bag.take(sim.room,slot);let i=0;
      sim._random=()=>outcome==='unnoticed'?1:outcome==='warning'?0:[0,1][i++%2];
      bag.leave(view);sim.room=null;
      if(outcome==='warning'){assert.ok(bag.basket?.until);sim.room={...view.plan};bag.tick();assert.ok(!bag.basket.until);atShelf('grocery-chips');assert.ok(bag.putBack(sim.room,slot.id));}
      else assert.equal(bag.inventory[slot.id],1);
      sim.elapsed+=20;bag.tick();assert.equal(calls.length,outcome==='reported'?1:0);
      if(calls.length)assert.ok(calls[0][1].witnessReport);
    }finally{view.group.userData.dispose();}
  }
});

test('restaurant staff prepare the player’s dish and deliver it at the counter or to the occupied table',()=>{
  for(const [kind,width,seated] of [['american',6,false],['italian',8,true],['pizza',4,true],['coffee',5,false]]){
    const {sim,bag,view,room,go,tick,checkout,placeOrder,sales}=store(kind,width);
    try{
      checkout();const menu=menuFor(room.place),item=kind==='coffee'?menu[0]:menu.find(i=>i.effect==='meal');
      if(seated){
        const spot=room.seats.find(s=>{go(s.a,s.b);sim.seat={x:sim.player.x,z:sim.player.z};return diningTable(sim,view);});assert.ok(spot);
      }
      assert.ok(placeOrder(item));const order=bag.order;let chef,server;
      tick(90,()=>{
        if(order.phase.startsWith('Preparing '))chef=order.employee;
        if(order.phase==='Collecting your order')server=order.employee;
        return order.ready;
      });
      assert.ok(order.ready,kind+' '+order.phase);assert.ok(!seated || order.table===diningTable(sim,view));
      if(kind!=='coffee'){assert.equal(chef?.spot.role,'cook');assert.equal(server?.spot.role,'server');assert.notEqual(chef,server);}
      if(!seated)assert.equal(order.employee.carry,kind==='coffee'?'cup':'plate-eggs');
      assert.ok(bag.accept(order));assert.equal(sales[0],item.price);
      assert.ok(bag.consume(order.food.id,view));assert.ok(sim.pep>0);tick(6);assert.equal(bag.eating,null);
      if(seated){
        tick(50,()=>!view.cleanups.length);
        assert.equal(view.claims.size,0);assert.equal(view.cleanups.length,0);
      }
    }finally{view.group.userData.dispose();}
  }
});

test('canceling an order while staff hold the bottle returns that facing without charging',()=>{
  const {bag,sim,room,view,checkout,placeOrder,tick,sales}=store('bodega');
  try{
    checkout();placeOrder(menuFor(room.place).find(i=>i.product==='grocery-water'));
    const o=bag.order;tick(70,()=>o.ready);assert.ok(o.ready && bag.missing(room.place.id,o.slot.index,true));
    bag.cancelOrder();assert.equal(sim.cash,100);assert.equal(sales.length,0);assert.ok(!bag.missing(room.place.id,o.slot.index));
    assert.ok(view.actors.every(a=>!a.serviceOwner));
  }finally{view.group.userData.dispose();}
});

test('a guest who sits after the coffee is ready gets table delivery and the mug goes back with staff',()=>{
  const {bag,sim,room,view,checkout,placeOrder,go,tick}=store('coffee',7);
  try{
    checkout();placeOrder(menuFor(room.place)[0]);const o=bag.order;
    tick(60,()=>o.ready);assert.ok(o.ready && !o.table);
    const seat=room.seats.find(s=>{
      go(s.a,s.b);sim.seat={x:sim.player.x,z:sim.player.z};return !view.occupied.has(s) && diningTable(sim,view);
    });assert.ok(seat);
    tick(60,()=>o.ready && o.table);assert.ok(o.ready && o.table);
    assert.ok(bag.accept(o));assert.ok(bag.consume(o.food.id,view));assert.equal(sim.player.carry,'mug');
    tick(30,()=>view.cleanups.some(job=>job.mug && job.cleared));assert.ok(view.actors.some(a=>a.carry==='mug@0'));
    tick(30,()=>!view.cleanups.length);assert.equal(view.claims.size,0);
  }finally{view.group.userData.dispose();}
});

test('a requested takeaway is packed by the server and opens as the same dish from inventory',()=>{
  const {bag,sim,room,view,checkout,placeOrder,tick}=store('italian',6);
  try{
    checkout();placeOrder(menuFor(room.place).find(i=>i.name==='Spaghetti pomodoro'));
    const o=bag.order;tick(90,()=>o.ready);o.pack();assert.equal(o.ready,false);tick(4,()=>o.ready);
    assert.equal(o.employee.carry,'takeout');assert.ok(bag.accept(o));assert.equal(sim.player.carry,'takeout');
    const saved=new Shopping(sim);saved.restore(JSON.parse(JSON.stringify(bag.record())));assert.equal(sim.player.carry,'takeout');
    assert.ok(saved.consume(o.food.id));assert.equal(sim.player.carry,'plate-pasta');
  }finally{view.group.userData.dispose();}
});

test('spring rolls go from the Chinese kitchen to a half portion and a cleared dish across save and reload',()=>{
  const {bag,sim,room,view,checkout,placeOrder,tick}=store('chinese',7);
  try{
    checkout();const rolls=menuFor(room.place).find(i=>i.name==='Spring rolls');
    assert.ok(placeOrder(rolls));const ticket=bag.order;tick(90,()=>ticket.ready);
    assert.equal(ticket.employee.carry,'plate-spring-rolls');assert.ok(bag.accept(ticket));
    assert.ok(bag.consume(ticket.food.id));assert.equal(sim.player.carry,'plate-spring-rolls');
    tick(1.5);assert.equal(sim.player.carry,'plate-spring-rolls@1');
    assert.equal(bag.setHand(null),false);bag.leave(view);assert.equal(sim.player.carry,'plate-spring-rolls@1');
    const save=JSON.parse(JSON.stringify(bag.record()));sim.elapsed=0;
    const loaded=sim.shopping=new Shopping(sim);loaded.restore(save);assert.equal(sim.player.carry,'plate-spring-rolls@1');
    tick(2.2);assert.equal(sim.player.carry,'plate-spring-rolls@0');tick(1);
    const empty='empty-'+ticket.food.id;assert.equal(loaded.held,empty);assert.equal(loaded.inventory[empty],1);
    assert.equal(loaded.consume(empty),false);assert.ok(loaded.discard(empty));assert.equal(sim.player.carry,null);
    assert.equal(loaded.discard(empty),false);assert.equal(sim.cash,100-rolls.price);
  }finally{view.group.userData.dispose();}
});

test('a seated meal changes on the actual table when eaten and stays empty when cleared',()=>{
  const {bag,sim,room,view,placeOrder,tick,go}=store('italian',7);
  try{
    assert.ok(room.seats.find(s=>{go(s.a,s.b);sim.seat={x:sim.player.x,z:sim.player.z};return diningTable(sim,view);}));
    const item=menuFor(room.place).find(i=>i.name==='Spaghetti pomodoro');
    assert.ok(placeOrder(item));const ticket=bag.order;tick(90,()=>ticket.ready);
    assert.ok(bag.accept(ticket));assert.ok(bag.consume(ticket.food.id,view));assert.equal(sim.player.carry,'fork');
    const plate=()=>view.group.children.find(c=>c.name==='Served plate' && c.visible);
    assert.equal(plate().userData.level,2);tick(1.5);assert.equal(plate().userData.level,1);
    tick(2.2);assert.equal(plate().userData.level,0);tick(1);assert.equal(sim.player.carry,null);
    assert.equal(bag.inventory['empty-'+ticket.food.id],undefined);
    tick(40,()=>view.cleanups.some(j=>j.cleared));
    assert.ok(view.actors.some(a=>a.carry==='plate-pasta@0'));assert.equal(plate(),undefined);
  }finally{view.group.userData.dispose();}
});
