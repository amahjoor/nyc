import test from 'node:test';
import assert from 'node:assert/strict';
import { interactWithTrip,courierBag } from '../dist/driver-work.js';
import { hasKitchen,kitchenTicket } from '../dist/kitchen-shift.js';
import { deskTicket } from '../dist/service-desk.js';
import { Simulation } from '../dist/simulation.js';
import { Work, EMPLOYERS } from '../dist/work.js';

function fixture() {
  const sim = new Simulation({
    bounds: { minX: -3000, minZ: -3000, maxX: 3000, maxZ: 3000 }, roads: [], buildings: [],
    spawn: { ...EMPLOYERS.kitchen, angle: 0 }, missionPoints: [{ name: 'Prince St', x: 170, z: 80 }],
  });
  const person = { state: 'walk' }, shop = { id: 'corner', name: 'Corner Deli', kind: 'bodega' };
  let screen, guided, now = 10000, atCounter = true;
  const called = [];
  const phone = { openList(title, rows, pick, { message }) { screen = { title, rows, pick, message }; }, setOpen() { screen = null; } };
  const work = new Work({ sim, phone: () => phone, meet: (title,message,rows,available,view) => { screen = {title,message,rows,available,view,pick: row => row.choose(), inPerson: true}; }, pedestrian: () => person, counter: () => atCounter ? shop : null,
    fronts: () => [{place:{id:'slice',name:'Corner Slice',group:'food',kind:'pizza'},x:136,z:-100,nx:1,nz:0}], hours: () => 13, save: () => called.push(structuredClone(work.record)), random: () => .75,
    now: () => now, guide: site => { guided = site; } });
  const choose = name => {
    const row = screen.rows.find(row => row.name === name);
    assert.ok(row, `Missing ${name} on ${screen.title}`);screen.pick(row);
  };
  return { work, sim, person, shop, choose, called, screen: () => screen, guided: () => guided,
    leaveCounter() { atCounter = false; }, restock() { now += 600001; } };
}

for(const job of ['kitchen','pizza','barista','bakery'])test(job+' cooks, portions and hands over four saved customer orders',()=>{
  const f=fixture(),site=EMPLOYERS[job];
  Object.assign(f.sim.player,{x:site.x,z:site.z});f.work.job(job,true);
  for(let i=0;i<4;i++){
    const t=kitchenTicket(f.work.record.shift),m=t.menu;
    assert.ok(!f.screen().rows.some(r=>r.name.startsWith('Hand tray')));
    if(t.wantsMain){
      f.choose(m.station);f.choose('Take '+m.mains[t.main]);f.choose(m.prep);
      f.choose(m.turn);assert.equal(f.work.record.shift.kitchen.main,2);
    }
    if(t.wantsSide){f.choose(m.sideStation);f.choose(m.lower+' '+t.sideName);}
    f.screen().view.advance(3.25);
    f.work.restore(structuredClone(f.work.record));f.work.job(job);
    if(t.wantsMain){f.choose(m.station);f.choose(m.turn);}
    f.screen().view.advance(1);
    if(t.wantsSide){f.choose(m.sideStation);f.choose(m.drain+' '+t.sideName);}
    f.screen().view.advance(2.3);
    if(t.wantsMain){
      if(t.wantsSide)f.choose(m.station);
      f.choose(m.lift);f.choose(m.dress+' '+t.garnish);
    }
    if(t.wantsDrink){
      f.choose('Drink fountain');f.choose('Fill cup with '+t.drinkName);
      f.screen().view.advance(2.1);f.choose('Release tap and lid cup');
    }
    const hand=f.screen().rows.find(r=>r.name==='Hand tray to '+t.customer);
    assert.ok(hand);assert.equal(f.sim.cash,0);hand.choose();hand.choose();
  }
  assert.equal(f.sim.cash,site.wage+site.bonus*4);assert.equal(f.work.record.shift,null);
});

test('finance associate posts the reconciled client balances',()=>{
  const f=fixture(),site=EMPLOYERS.finance;
  Object.assign(f.sim.player,{x:site.x,z:site.z});f.work.job('finance',true);
  for(let i=0;i<4;i++){
    f.choose('Open client ledger');
    const amounts=f.screen().message.match(/\$[\d,]+/g).map(s=>Number(s.slice(1).replaceAll(',','')));
    f.choose('$'+(amounts[0]+amounts[1]-amounts[2]).toLocaleString('en-US'));
  }
  assert.equal(f.sim.cash,site.wage+4*site.bonus);
});

test('declining changes the offer and entering either marker cannot complete a food handoff',()=>{
  const f=fixture();f.work.food();const old=f.screen().message;
  const stale=f.screen().rows[0];f.choose('Decline order');assert.notEqual(f.screen().message,old);
  stale.choose();assert.notEqual(f.sim.mission.phase,'active');f.choose('Accept order');
  const m=f.sim.mission;assert.equal(m.stage,'pickup');assert.equal(m.pickup.name,'Corner Slice');
  Object.assign(f.sim.player,m.dropoff);assert.equal(interactWithTrip(f.sim),false);
  Object.assign(f.sim.player,m.target);f.sim._updateMission(1);assert.equal(m.stage,'pickup');
  f.sim.player.mode='drive';assert.equal(interactWithTrip(f.sim),false);
  f.sim.player.mode='walk';assert.ok(interactWithTrip(f.sim));assert.equal(courierBag(m),'takeout');
  Object.assign(f.sim.player,m.target);f.sim._updateMission(1);assert.equal(f.sim.cash,0);
  assert.ok(interactWithTrip(f.sim));assert.equal(courierBag(m),null);
  assert.equal(interactWithTrip(f.sim),false);assert.equal(f.sim.cash,m.payout);
});

test('D Ride drivers stop for boarding and alighting in the accepted car and receive one fare',()=>{
  const f=fixture(),s=f.sim;
  s.city.missionPoints=[{name:'Prince',x:70,z:0},{name:'Spring',x:293,z:250}];
  f.work.driving('driver');f.choose('Accept ride');assert.equal(s.mission.phase,'idle');
  const car={id:'own',type:'sedan',speed:0};s.cars.push(car);
  Object.assign(s.player,{mode:'drive',vehicleId:car.id});f.choose('Accept ride');
  const m=s.mission;Object.assign(s.player,m.pickup);assert.ok(interactWithTrip(s));
  car.speed=2;s._updateMission(.1);assert.equal(m.stage,'pickup');assert.ok(interactWithTrip(s));assert.equal(m.stage,'pickup');
  car.speed=0;assert.ok(interactWithTrip(s));s._updateMission(2);assert.equal(m.stage,'dropoff');
  Object.assign(s.player,m.dropoff);assert.ok(interactWithTrip(s));assert.equal(s.cash,0);
  s._updateMission(2);s._updateMission(2);assert.equal(s.cash,m.reward);assert.equal(s.deliveries,0);
  f.work.driving('driver');f.choose('Accept ride');s.player.mode='walk';s._updateMission(.1);
  assert.equal(s.mission.phase,'failed');assert.equal(s.cash,m.reward);
});

test('sales calls preserve objections through reload and log a single commission or a lost lead',()=>{
  const f=fixture(),sales=()=>{f.work.board();f.choose('Business sales rep');};
  sales();f.choose('Dial Harbor Florals');f.choose('Introduce yourself and ask about their day');
  f.choose('Offer Online order form');f.work.restore(structuredClone(f.work.record));sales();
  f.choose('Offer to embed it on their site');const book=f.screen().rows[0];book.choose();book.choose();
  assert.equal(f.sim.cash,32);f.choose('Dial Mercer Coffee');f.choose('Introduce yourself and ask about their day');
  f.choose('Offer Online order form');f.choose('Log declined lead');assert.equal(f.sim.cash,32);
  assert.equal(f.work.record.calls,2);assert.equal(f.work.record.lastCall,'Mercer Coffee · Declined');
});

test('coffee uses working capital and inventory, and a pedestrian can transact once', () => {
  const f = fixture();
  f.work.coffee();f.choose('Open a coffee cart');assert.equal(f.work.record.cart, false);
  f.sim.cash = 60;f.work.coffee();f.choose('Open a coffee cart');assert.equal(f.sim.cash, 0);
  f.work.restore(JSON.parse(JSON.stringify(f.work.record)));assert.equal(f.work.record.cups, 6);
  f.work.street();f.choose('Sell a coffee');f.choose('Pour hot coffee');f.choose('Add a splash of milk');
  assert.equal(f.sim.cash,0);f.choose('Lid and hand over coffee');assert.equal(f.sim.cash, 5);assert.equal(f.work.record.cups, 5);
  f.work.street();f.choose('Steal wallet');assert.equal(f.sim.cash, 5);assert.equal(f.sim.heat, 0);
  f.sim.cash = 12;f.work.coffee();f.choose('Buy six cups');assert.equal(f.work.record.cups, 11);assert.equal(f.sim.cash, 0);
});

test('street donations, wallet theft and till theft have different consequences', () => {
  const f = fixture();f.work.street();assert.equal(f.screen().inPerson, true);f.choose('Ask for spare change');assert.equal(f.sim.cash, 4);assert.equal(f.sim.heat, 0);
  const g = fixture();g.work.street();g.choose('Steal wallet');assert.equal(g.sim.heat, 1);assert.equal(g.person.state, 'flee');
  g.work.rob(g.shop);assert.equal(g.sim.heat, 2);const balance = g.sim.cash;
  g.work.restore(JSON.parse(JSON.stringify(g.work.record)));g.work.rob(g.shop);assert.equal(g.sim.cash, balance);
  g.restock();g.work.rob(g.shop);assert.ok(g.sim.cash > balance);
  const h = fixture();h.work.street();h.leaveCounter();h.work.rob(h.shop);assert.equal(h.sim.cash, 0);
});

test('a greeting opens an in-person reply and leaves the other conversation options available', () => {
  const f=fixture();
  f.work.street();f.choose('Say hello');
  assert.equal(f.screen().message,'Hey, how’s it going?');
  f.person.resident={id:0};
  f.person.state='rest';
  f.work.street();f.choose('Say hello');
  assert.equal(f.screen().inPerson,true);
  assert.match(f.screen().message,/slept outside/);
  assert.equal(f.sim.cash,0);
  f.choose('Ask for spare change');assert.equal(f.sim.cash,4);
});

test('tills use the shop category and its own completed sales, including after reload', () => {
  const payout=(kind,sales=[])=>{
    const f=fixture();f.shop.kind=kind;
    for(const price of sales)f.work.sale(f.shop,price);
    f.work.sale({id:'elsewhere'},500);
    f.work.restore(structuredClone(f.work.record));
    f.work.rob(f.shop);return f.sim.cash;
  };
  assert.ok(payout('jewelry')>payout('clothes'));assert.ok(payout('clothes')>payout('pizza'));
  assert.equal(payout('pizza',[4,8]),payout('pizza')+12);
  const f=fixture();f.work.rob(f.shop);const before=f.sim.cash;
  assert.ok(f.work.isClosed(f.shop));assert.equal(f.work.isClosed({id:'elsewhere'}),false);
  f.work.sale(f.shop,3.5);f.work.rob(f.shop);assert.equal(f.sim.cash,before);
  const {closures,...olderSave}=f.work.record;f.work.restore(olderSave);assert.ok(f.work.isClosed(f.shop));
  f.restock();assert.equal(f.work.isClosed(f.shop),false);f.work.sale(f.shop,3.5);
  assert.equal(f.work.balance(f.shop),before+3.5);
});

test('taking a shift saves it to My work until released or completed',()=>{
  const f=fixture();
  f.work.board();f.choose('Finance associate');f.choose('Take shift');
  f.work.restore(JSON.parse(JSON.stringify(f.work.record)));
  f.work.board();assert.equal(f.screen().rows.find(row=>row.active).name,'Finance associate');
  f.choose('Fast-food crew');assert.ok(!f.screen().rows.some(row=>row.name==='Take shift'));
  f.work.board();f.choose('Finance associate');f.choose('Release shift');
  assert.ok(!f.screen().rows.some(row=>row.active));
});

test('every service desk issues four distinct work slips, requires the site and pays its advertised maximum',()=>{
  for(const [job,site] of Object.entries(EMPLOYERS).filter(([job])=>!hasKitchen(job)&&job!=='finance')){
    const f=fixture();f.work.board();f.choose(site.role);f.choose('Take shift');
    Object.assign(f.sim.player,{x:site.x+200,z:site.z});f.choose('Clock in');assert.equal(f.work.record.shift,null);
    Object.assign(f.sim.player,{x:site.x,z:site.z});f.work.job(job,true);
    const slips=new Set();
    for(let i=0;i<4;i++){
      const task=deskTicket(f.work.record.shift);slips.add(task.item);f.choose(task.open);
      f.work.restore(structuredClone(f.work.record));f.work.job(job);
      if(job==='cashier'){
        let due=Math.round(Number(task.result.slice(1))*100);
        for(const [cents,label] of [[1000,'$10'],[500,'$5'],[100,'$1'],[25,'$0.25']]){
          while(due>=cents){f.choose('Count out '+label);due-=cents;}
        }
        f.choose('Hand change to customer');
      }else f.choose(task.actions.find(a=>a.match).name);
      f.choose(task.complete);
    }
    assert.equal(slips.size,4);assert.equal(f.sim.cash,site.wage+4*site.bonus);
  }
});

test('a newspaper carrier makes distinct local drops and collects one paycheck on the last block',()=>{
  const f=fixture();
  f.sim.city.missionPoints=Array.from({length:5},(_,i)=>({name:'Stop '+i,x:f.sim.player.x+65*(i+1),z:f.sim.player.z}));
  f.work.board();f.choose('Newspaper carrier');f.choose('Start paper round');
  const mission=f.sim.mission;
  assert.equal(new Set(mission.stops).size,3);
  assert.equal(f.work.jobs().filter(row=>row.active).map(row=>row.name).join(),'Newspaper carrier');
  for(const stop of mission.stops){
    assert.equal(f.sim.cash,0);
    Object.assign(f.sim.player,stop);f.sim._updateMission(1);assert.equal(f.sim.cash,0);assert.ok(f.sim.dropPaper());
  }
  assert.equal(mission.phase,'complete');assert.ok(f.sim.cash>=54 && f.sim.cash<=66);
  const balance=f.sim.cash;f.sim._updateMission(1);assert.equal(f.sim.cash,balance);
});

test('daily cash uses local turnover, payment tender and the previous seven game days',()=>{
  const f=fixture(),w=f.work, b={id:'counter',kind:'bank',name:'Neighborhood Bank'},
    designer={...b,kind:'clothes',name:'LOUIS VUITTON'}, clothing={...designer,name:'Neighborhood Clothing'},
    lunch={...b,kind:'chinese',name:'Neighborhood Kitchen'};
  w.advanceShopClock(0,9);
  assert.ok(w.balance(b)>w.balance(designer) && w.balance(designer)>w.balance(clothing) && w.balance(clothing)>w.balance(lunch));
  const open=w.balance(lunch);w.advanceShopClock(0,17);
  const current=w.balance(lunch);assert.ok(current>open);
  w.sale(lunch,1600,'card');assert.equal(w.balance(lunch),current);
  w.sale(lunch,4.53,'cash');assert.equal(w.balance(lunch),current+4.53);
  const saved=structuredClone(w.record);w.restore(saved);w.advanceShopClock(0,17);assert.equal(w.balance(lunch),current+4.53);
  const quiet=fixture().work;quiet.advanceShopClock(0,17);
  const other={...lunch,id:'other'},daily=new Set([current]);
  for(let d=1;d<=8;d++){
    w.advanceShopClock(d%7,17);quiet.advanceShopClock(d%7,17);
    assert.equal(w.record.sales[lunch.id],undefined);
    const baseline=quiet.balance(lunch);daily.add(baseline);
    if(d<=7)assert.ok(w.balance(lunch)>baseline);
    else assert.equal(w.balance(lunch),baseline);
    assert.equal(w.balance(other),quiet.balance(other));
  }
  assert.ok(daily.size>1,'unvisited branches have busier and quieter days');
  w.restore({sales:{counter:14.36}});w.advanceShopClock(0,17);assert.equal(w.balance(lunch),current+14.36);
});
