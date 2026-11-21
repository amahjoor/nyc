import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoom,buildRoom,roomKind } from '../dist/interiors.js';
import { populateShop } from '../dist/shop-life.js';
import { startCounterOrder,stepCounterOrder,stepServiceJobs } from '../dist/facility-visits.js';
import { callServer,openTableService,promptTableService,tableMenu,waitsTables } from '../dist/table-service.js';
import { stationOf } from '../dist/kitchen-line.js';
import { recipeFor } from '../dist/recipes.js';
import { shutIn } from '../dist/service-way.js';
import { menuFor } from '../dist/menu.js';
import { Shopping,diningTable } from '../dist/shopping.js';
import { roomPoint,ShopDoor } from '../dist/room.js';
import { KIND } from '../dist/places.js';

const EATING=Object.keys(KIND).filter(kind=>roomKind({kind})==='eat');
function store(kind,width=7,deep=10,name='Test '+kind){
  const place={id:kind+'-'+width+'-'+deep,name,kind,x:0,z:0};
  const front={place,x:0,z:0,tx:1,tz:0,nx:0,nz:1,width};
  const room=planRoom(front,(x,z)=>z<=0 && z>=-deep),group=buildRoom(room);
  const view={plan:room,group,actors:[],floor:0,occupied:new Set(),door:new ShopDoor()};
  populateShop(view);
  const sales=[],calls=[],said=[];
  const sim={room:{...room},player:{mode:'walk',x:0,z:-.4,y:0},doorway:view,cash:500,elapsed:0,_say(s){this.notice=s;said.push(s);},_random:()=>0,offence:(...args)=>calls.push(args)};
  sim.shopping=new Shopping(sim);
  // The choices as the player sees them: the last list opened, and a way to pick from it.
  const ui={open:false,last:null,
    openList(title,rows,onPick,opts={}){if(opts.available && !opts.available())return;this.last?.opts.onClose?.();this.last={title,rows,onPick,opts};this.open=true;},
    pick(test){
      const {rows,onPick,opts}=this.last,row=rows.find(r=>!r.disabled && (typeof test==='string'?r.name.startsWith(test):test(r)));
      assert.ok(row,'no choice '+test+' among '+rows.map(r=>r.name).join(' | '));
      this.open=false;this.last=null;opts.onClose?.();onPick(row);return row;
    }};
  const ctx={$:()=>({hidden:true,textContent:''}),sim,interaction:ui,sale:(_p,n)=>sales.push(n),save(){}};
  function sitAt(spot){sim.room.a=spot.a;sim.room.b=spot.b;[sim.player.x,sim.player.z]=roomPoint(room,spot.a,spot.b);sim.seat={x:sim.player.x,z:sim.player.z};return diningTable(sim,view);}
  const phases=[];
  function tick(seconds,until=()=>false){
    for(let i=0;i<seconds*20;i++){
      sim.elapsed+=.05;sim.shopping.tick();stepCounterOrder(sim,view,.05);stepServiceJobs(view,sim.elapsed);promptTableService(ctx);
      const phase=sim.shopping.order?.phase;if(phase && phase!==phases.at(-1))phases.push(phase);
      if(until())return true;
    }
    return until();
  }
  const seats=()=>room.seats.filter(spot=>sitAt(spot));
  return {view,sim,bag:sim.shopping,room,tick,sitAt,seats,ui,ctx,sales,calls,said,phases};
}

test('nobody on the staff of an eating place is walled in behind its counter',()=>{
  for(const kind of EATING)for(const width of [4,5,6,7.5,9])for(const deep of [5,6.5,9,14]){
    const room=planRoom({place:{id:kind,name:kind,kind,x:0,z:0},x:0,z:0,tx:1,tz:0,nx:0,nz:1,width},(x,z)=>z<=0 && z>=-deep);
    assert.deepEqual(shutIn(room),[],`${kind} ${width} by ${deep}`);
  }
});

test('an order placed from any table is brought, in the narrow rooms that once left guests waiting for good',()=>{
  for(const [kind,width,deep] of [['chinese',4,14],['mexican',4,14],['latin',4,14],['mediterranean',4,6],['mediterranean',6,6.5],['coffee',4,14],['burgers',5,9]]){
    const {view,sim,bag,room,tick,seats}=store(kind,width,deep);
    try{
      const tables=seats();assert.ok(tables.length,kind+' has a table');
      for(const spot of tables){
        sim.room.a=spot.a;sim.room.b=spot.b;[sim.player.x,sim.player.z]=roomPoint(room,spot.a,spot.b);sim.seat={x:sim.player.x,z:sim.player.z};
        const item=menuFor(room.place).find(i=>i.effect==='meal' && !i.product)||menuFor(room.place).find(i=>!i.product);
        assert.ok(startCounterOrder(sim,view,{item,sale(){}}),kind+' '+sim.notice);
        const order=bag.order;
        assert.ok(tick(200,()=>order.ready),`${kind} ${width} by ${deep}: ${order.phase}`);
        bag.cancelOrder();tick(1);
      }
    }finally{view.group.userData.dispose();}
  }
});

test('a sitting: the server is waved over, asks, takes the order, the kitchen cooks it step by step, and the check is paid with a tip',()=>{
  for(const kind of ['italian','american','chinese','pizza','japanese','mediterranean','coffee']){
    const {view,sim,bag,room,tick,sitAt,seats,ui,ctx,sales,said,phases}=store(kind);
    try{
      const spot=seats()[0];assert.ok(spot,kind);sitAt(spot);
      assert.ok(waitsTables(view));
      assert.ok(openTableService(ctx));const ticket=bag.order;assert.ok(ticket?.dineIn);assert.equal(ticket.stage,'hailed');
      assert.ok(tick(90,()=>ui.open),kind+' server arrives: '+ticket.phase);
      // They greet the guest by the name of the place and wait for an answer.
      assert.match(ui.last.opts.message,/Test /);assert.match(ui.last.title,/your server$/);
      ui.pick('What do you recommend');assert.match(ui.last.rows[0].name,/^I will have the /);
      ui.pick('Let me see the menu');
      const menu=tableMenu(room.place), dish=menu.find(d=>!d.drink && recipeFor(d.item,kind).length>=3)||menu.find(d=>!d.drink), drink=menu.find(d=>d.drink);
      ui.pick(dish.item.name);if(ui.open)ui.pick(drink?drink.item.name:'Nothing');
      assert.equal(sim.cash,500,'nothing is paid before the check');
      assert.ok(tick(300,()=>ticket.stage==='dining'),kind+' served: '+ticket.phase);
      assert.deepEqual(ticket.items.map(d=>d.state),ticket.items.map(()=>'table'));
      // Every step of the dish's recipe was worked in the kitchen, in order.
      const steps=recipeFor(dish.item,kind).map(step=>step.say), seen=phases.filter(p=>steps.some(s=>p.endsWith(' · '+s))).map(p=>p.split(' · ').slice(1).join(' · '));
      assert.deepEqual(seen,steps,kind+' '+dish.item.name);
      assert.ok(phases.some(p=>/calls it in: /.test(p)) || !steps.length);
      assert.ok(view.group.children.some(c=>c.name==='Served plate' && c.visible),'the plate is on the table');
      for(const _ of ticket.items){openTableService(ctx);ui.pick(r=>/^(Eat|Drink) the /.test(r.name));assert.ok(bag.eating);tick(10,()=>!bag.eating);tick(.5);}
      assert.ok(ticket.items.every(d=>d.state==='eaten'));assert.ok(sim.pep>0);
      tick(60,()=>!view.cleanups.length);
      openTableService(ctx);ui.pick('Ask for the check');
      assert.ok(tick(120,()=>ui.open),'the check comes: '+ticket.phase);
      const due=dish.price+(drink?drink.price:0);assert.match(ui.last.opts.message,new RegExp('Total \\$'+due.toFixed(2).replace('.','\\.')));
      ui.pick('Pay with a 20% tip');
      assert.ok(Math.abs(sim.cash-(500-due*1.2))<.011);assert.deepEqual(sales,[due]);
      assert.ok(tick(90,()=>!bag.order),'the ticket closes: '+ticket.phase);
      tick(90,()=>!view.cleanups.length && !view.claims.size);
      assert.equal(view.claims.size,0);assert.ok(view.actors.every(a=>!a.serviceOwner));
      assert.ok(said.some(line=>/Thank you so much/.test(line)));
    }finally{view.group.userData.dispose();}
  }
});

test('what is on the heat can be seen at the station while a step is worked, and is gone after',()=>{
  const {view,bag,tick,sitAt,seats,ui,ctx}=store('italian');
  try{
    sitAt(seats()[0]);openTableService(ctx);const ticket=bag.order;tick(90,()=>ui.open);
    ui.pick('I am ready');ui.pick('Spaghetti pomodoro');ui.pick('Nothing');
    const wares=()=>view.group.children.filter(c=>c.name==='Cookware in use');
    let seen=new Set(),cook=null;
    tick(200,()=>{
      if(ticket.phase.startsWith('Chef · ')){cook=ticket.employee;for(const ware of wares())seen.add(ware.userData.ware);}
      return ticket.stage==='dining';
    });
    assert.equal(cook.spot.role,'cook');
    assert.ok(seen.has('pot') && seen.has('pan'),[...seen].join());
    assert.equal(wares().length,0);
    assert.ok(stationOf(view,'range') && stationOf(view,'pass'));
  }finally{view.group.userData.dispose();}
});

test('asking for a few minutes sends the server away until they are called back',()=>{
  const {view,sim,bag,tick,sitAt,seats,ui,ctx}=store('american');
  try{
    sitAt(seats()[0]);openTableService(ctx);const ticket=bag.order;tick(90,()=>ui.open);
    ui.pick('I need a few minutes');assert.ok(tick(30,()=>ticket.stage==='seated'));
    assert.ok(tick(60,()=>view.actors.every(a=>!a.serviceOwner)),'the server is free for other tables');
    openTableService(ctx);ui.pick('Call your server');
    assert.ok(tick(90,()=>ui.open && ticket.talk?.kind==='greeting'));
    ui.pick('I am ready');assert.ok(ui.last.rows.some(r=>r.item));
    // Nothing ordered yet costs nothing to walk away from.
    ui.pick(r=>r.item);if(ui.open)ui.pick('Nothing');tick(3);
    openTableService(ctx);ui.pick('Cancel the order');assert.equal(bag.order,null);assert.equal(sim.cash,500);
    tick(30);assert.equal(view.claims.size,0);assert.ok(view.actors.every(a=>!a.serviceOwner));
  }finally{view.group.userData.dispose();}
});

test('walking out on a served meal is reported by staff who see it; standing up before anything arrives only cancels',()=>{
  const fled=store('american');
  try{
    const {view,sim,bag,tick,sitAt,seats,ui,ctx,calls,sales}=fled;
    sitAt(seats()[0]);openTableService(ctx);const ticket=bag.order;tick(90,()=>ui.open);
    ui.pick('I am ready');ui.pick(r=>r.item);if(ui.open)ui.pick('Nothing');
    assert.ok(tick(300,()=>ticket.stage==='dining'));
    bag.leave(view);sim.room=null;
    assert.equal(bag.order,null);assert.equal(calls.length,1);assert.equal(calls[0][0],'theft');assert.ok(calls[0][1].witnessReport);
    assert.equal(sim.cash,500);assert.deepEqual(sales,[]);
  }finally{fled.view.group.userData.dispose();}
  const early=store('american');
  try{
    const {view,sim,bag,tick,sitAt,seats,ui,ctx,calls}=early;
    sitAt(seats()[0]);openTableService(ctx);tick(90,()=>ui.open);
    ui.pick('I am ready');ui.pick(r=>r.item);if(ui.open)ui.pick('Nothing');tick(2);
    sim.seat=null;tick(30,()=>!bag.order);
    assert.equal(bag.order,null);assert.equal(calls.length,0);assert.equal(sim.cash,500);
    tick(60);assert.equal(view.claims.size,0);assert.ok(view.actors.every(a=>!a.serviceOwner));
  }finally{early.view.group.userData.dispose();}
});

test('a cook with no ticket keeps the kitchen going and drops it when an order comes in',()=>{
  const {view,sim,bag,tick,sitAt,seats,ui,ctx}=store('american',9,12);
  try{
    const cook=view.actors.find(a=>a.spot.role==='cook');
    let chore=null;
    assert.ok(tick(60,()=>{chore=cook.chore||chore;return Boolean(chore && !chore.trip);}),'the cook finds something to do');
    assert.ok(chore.phase.length>5);
    sitAt(seats()[0]);openTableService(ctx);const ticket=bag.order;tick(90,()=>ui.open);
    ui.pick('I am ready');ui.pick(r=>r.item?.effect==='meal');if(ui.open)ui.pick('Nothing');
    assert.ok(tick(300,()=>ticket.stage==='dining'),ticket.phase);
    assert.equal(sim.cash,500);
  }finally{view.group.userData.dispose();}
});
