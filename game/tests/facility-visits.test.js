import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoom,buildRoom } from '../dist/interiors.js';
import { populateShop,inviteCustomer } from '../dist/shop-life.js';
import { ShopDoor,roomLocal } from '../dist/room.js';
import { pedestrianRadius } from '../dist/pedestrian-motion.js';
import { KIND,facilityIndex,unpackPlace } from '../dist/places.js';
import { fittingStock, fittedLook, purchaseStock } from '../dist/shop-stock.js';
import { servingFor,portionBase } from '../dist/food-catalog.js';
import { plateStyle } from '../dist/menu.js';

const fixture=(kind,width,name=kind)=>planRoom({place:{id:name,kind,name,x:0,z:0},x:0,z:0,width,tx:1,tz:0,nx:0,nz:1},(x,z)=>z<0 && z>-(width===4?6:12));

function visits(kind,width=7,name=kind) {
  const plan=fixture(kind,width,name),group=buildRoom(plan);
  const view={plan,group,floor:2,door:new ShopDoor(),actors:[],occupied:new Set()};
  populateShop(view);
  const actors=Array.from({length:3},(_,i)=>({state:'walk',run:{},age:5,look:{pace:1.5},x:-.42+i*.42,z:2+i*.25,y:2,phase:0}));
  const phases=actors.map(()=>new Set()),events=[],sales=[];
  for(const hook of ['mealAt','sampleAt']){
    const render=group.userData[hook];
    group.userData[hook]=(fixture,show,item)=>{events.push({hook,fixture,show,item});render(fixture,show,item);};
  }
  let concurrent=0;
  try{
    for(let t=20;t<220;t+=.05){
      view.door.step(.05);
      inviteCustomer(view,actors.filter((p,i)=>p.visit || !phases[i].size),t,(_shop,price)=>sales.push(price));
      concurrent=Math.max(concurrent,view.visitors.size);
      for(const [i,p] of actors.entries()){
        const v=p.visit;
        if(!v)continue;
        v.step(p,.05,t);
        phases[i].add(v.phase);
        if(v.phase==='drinking' && v.task)assert.ok(p.sitting && portionBase(p.carry)===servingFor(v.item.name,true));
        if(v.phase==='eating' && v.task){
          assert.equal(view.claims.get(v.table),v);
          assert.ok(group.children.some(c=>c.name==='Served plate' && c.visible));
          assert.ok(p.sitting && p.carry==='fork');
        }
        if(v.phase==='showing ring' && v.task){
          assert.ok(v.employee.carry==='jewel' && view.claims.get(v.display)===v);
          assert.ok(group.children.some(c=>c.name==='Solitaire on display' && !c.visible));
        }
        if(v.employee?.preparation && !v.task?.point){
          const work=v.employee.preparation;
          assert.equal(v.employee.serviceOwner,v);
          assert.equal(work.task,v.task);
          assert.ok(Math.hypot(v.employee.x-work.x,v.employee.z-work.z)<.9);
        }
        if(v.phase==='cutting hair' && v.task){
          assert.ok(p.sitting && v.seat.fixture.shape==='cuttingChair');
          assert.equal(v.employee.spot.role,'barber');
          const point=roomLocal(plan,v.employee.x,v.employee.z);
          assert.ok(Math.hypot(point.a-v.spot.a,point.b-v.spot.b)<.95);
        }
        if(v.phase==='picking up drink' && v.task)assert.ok(group.children.some(c=>c.name==='Drink at pickup' && c.visible));
        if(v.phase.startsWith('Chef · ') && v.task)assert.equal(v.employee.spot.role,'cook');
        if(v.phase==='serving table' && v.task){
          assert.equal(v.employee.spot.role,'server');
          assert.equal(v.employee.carry,'plate-'+plateStyle(v.item.name));
        }
        if(v.phase==='training' && v.task){
          const point=roomLocal(plan,p.x,p.z);
          assert.ok(Math.hypot(point.a-v.display.a,point.b-v.display.b)<Math.max(1.4,v.display.d/2+.65));
        }
      }
      const occupants=[...view.actors,...view.visitors];
      for(let i=1;i<occupants.length;i++)for(let j=0;j<i;j++){
        const a=occupants[i],b=occupants[j];
        assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=pedestrianRadius(a)+pedestrianRadius(b)-.001,
          kind+' occupants overlapped during '+(a.visit?.phase||b.visit?.phase||'service'));
      }
      if(phases.every(s=>s.size) && !view.visitors.size && !view.cleanups.length)break;
    }
    assert.ok(concurrent>=2,kind+' has overlapping visits');
    for(const [i,p] of actors.entries()){
      assert.equal(p.state,'walk',kind+' visitor stuck at '+p.visit?.phase);
      assert.equal(p.x.toFixed(2),(-.42+.42*i).toFixed(2));assert.ok(Math.abs(p.z-2-i*.25)<.001);
    }
    assert.equal(view.claims.size,0);assert.equal(view.queue.length,0);
    assert.ok(view.actors.every(a=>!a.serviceOwner && !a.requests?.length));
    return {phases,sales,events,actors};
  }finally{group.userData.dispose();}
}

test('café makes paid orders for dine-in and takeaway guests on a shared counter',()=>{
  for(const width of [4,7]){
    const {phases,sales,actors}=visits('coffee',width);
    assert.equal(sales.length,3);
    assert.ok(phases.some(p=>p.has('queuing')));
    assert.ok(phases.every(p=>[...p].some(text=>text.startsWith('Barista · '))));
    assert.ok(phases[0].has('drinking') && !phases[1].has('drinking'));
    assert.equal(actors[1].carry,servingFor('Iced coffee'));assert.equal(actors[0].carry,null);
  }
});
test('bar patrons receive the drink a bartender prepared at their station',()=>{
  const {phases,sales,actors}=visits('bar',7);
  assert.equal(sales.length,3);
  for(const [i,p] of phases.entries()){
    assert.ok([...p].some(text=>text.startsWith('Bartender · ')));
    assert.ok(p.has('handing over drink'));
    assert.ok(actors[i].carry?.startsWith('drink-'));
  }
});
test('restaurant staff plate, serve and clear the table assigned to each paying guest',()=>{
  for(const [kind,width] of [['american',5],['italian',7],['pizza',4],['pizza',7],['chinese',7],['latin',7]]){
    const {phases,sales,events}=visits(kind,width);
    assert.equal(sales.length,3);
    for(const actions of phases)for(const phase of ['escorting to table','taking table order','serving table','eating','settling check'])assert.ok(actions.has(phase),kind+' '+width+' '+phase+': '+[...actions].join('|'));
    // The kitchen works each plate through its own steps at the line.
    for(const actions of phases)assert.ok([...actions].filter(phase=>phase.startsWith('Chef · ')).length>=2,[...actions].join('|'));
    const served=new Set();
    for(const e of events.filter(e=>e.hook==='mealAt')){
      if(e.show){assert.ok(!served.has(e.fixture));served.add(e.fixture);}
      else assert.ok(served.delete(e.fixture));
    }
    assert.equal(served.size,0);
  }
});
test('grocery shoppers browse, queue and return to the sidewalk carrying what the clerk scanned',()=>{
  for(const [kind,width] of [['bodega',4],['supermarket',7]]){
    const {phases,sales,actors}=visits(kind,width);
    assert.equal(sales.length,3);
    for(const [i,p] of actors.entries()){
      assert.ok(p.carry.startsWith('grocery-'));
      for(const stage of ['browsing groceries','picking from shelf','scanning groceries','returning purchase'])assert.ok(phases[i].has(stage));
    }
  }
});
test('jeweler gives a sold piece to the buyer and replaces a declined piece for continued browsing',()=>{
  const {phases,sales,actors,events}=visits('jewelry');
  assert.ok(phases[1].has('returning ring') && phases[1].has('browsing watches'));
  assert.equal(sales.length,2);assert.equal(actors[0].carry,'jewelBag');assert.equal(actors[1].carry,null);
  assert.ok(events.some(e=>!e.show));
});
test('other trades use their own modeled merchandise, workstation or equipment',()=>{
  for(const [kind,name,phase] of [['shoes','FOOT LOCKER','fitting shoes'],['clothes','GU','trying on shirt'],
    ['music','GUITAR CENTER','auditioning guitar'],['phones','VERIZON','testing handset'],['barber','BARBER','cutting hair'],['salon','ARROJO STUDIO','cutting hair'],
    ['gym','POWERHOUSE GYM','training'],['gym','SOULCYCLE','training'],['gym','SUI YOGA','training']]){
    const {phases,sales}=visits(kind,4,name);
    assert.equal(sales.length,3);assert.ok(phases.some(p=>p.has(phase)),name);
  }
});
test('packed business, search, stock and saved wardrobe agree on the trade',()=>{
  const labels=Object.values(KIND).sort((a,b)=>a.index-b.index).map(k=>k.label);
  for(const [type,name,want] of [['american','POWERHOUSE GYM','gym'],['coffee','SUI YOGA','gym'],['secondhand','VERIZON','phones'],
    ['secondhand','23RD STREET JEWELERS','jewelry'],['secondhand','GUITAR CENTER','music'],['clothes','ALO YOGA','clothes'],
    ['american','EQUINOX JUICE BAR','american'],['bodega','NEW CITY COFFEE','coffee']]){
    const id=KIND[type].index;
    assert.equal(unpackPlace([0,0,id,name],name).kind,want);assert.equal(facilityIndex(id,name,labels),KIND[want].index);
  }
  const shop={kind:'shoes'},item=fittingStock(shop.kind)[0],look={top:'original',shoes:'old'};
  const sim={cash:item.price,room:{place:shop},buy(i){if(i.price>this.cash)return false;this.cash-=i.price;return true;}};
  const preview=fittedLook(look,item);assert.equal(look.shoes,'old');assert.equal(preview.shoes,item.design.shoes);
  assert.equal(purchaseStock(sim,shop,item).paid,item.price);assert.equal(sim.cash,0);
  assert.equal(purchaseStock(sim,shop,item).paid,0);assert.equal(sim.purchases[item.sku],1);
  assert.equal(purchaseStock(sim,shop,fittingStock('shoes')[1]),null);
  for(const [kind,name] of [['clothes','GU'],['clothes','OLD NAVY'],['department','TJ MAXX'],['phones','VERIZON'],['music','GUITAR CENTER'],['shoes','FOOT LOCKER']]){
    const plan=fixture(kind,7,name), catalog=fittingStock(plan.place),display=plan.things.filter(t=>t.more?.sku);
    assert.ok(display.length,name);
    for(const prop of display){
      const item=catalog.find(i=>i.sku===prop.more.sku);
      assert.ok(item,name+' sells '+prop.more.sku);
      assert.equal(prop.color,item.color||item.design?.topColour||item.design?.shoeColour);
    }
  }
  assert.equal(fittingStock({kind:'department',name:'TJ MAXX'})[0].sku,'knit-wine');
  assert.equal(fittingStock({kind:'clothes',name:'OLD NAVY'})[0].sku,'crew-navy');
});
