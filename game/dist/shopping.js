import { payFor, purchaseLimit } from './money.js';
import { servingFor,portionKey } from './food-catalog.js';
import { groceries,groceryPrice } from './grocery-stock.js';
import { carriedOrder,legacyDish,menuFor,PEP,plateStyle } from './menu.js';
import { KIND } from './places.js';
import { crossesFixture,roomLocal,roomPoint } from './room.js';

const dishes=new Map();
export function pantryItem(id){
  if(typeof id!=='string')return null;
  const partial=/^partial-([1-3])-(?!partial-|empty-)(.+)$/.exec(id);
  if(partial){
    const food=pantryItem(partial[2]),remaining=Number(partial[1]);
    if(!food || food.effect==='pantry' || remaining>=servingSize(food))return null;
    return {...food,id,source:food.id,remaining};
  }
  if(id.startsWith('empty-')){
    const source=id.slice(6);
    if(source.startsWith('empty-') || source.startsWith('partial-'))return null;
    const food=pantryItem(source);if(!food || food.effect==='pantry')return null;
    const shape=groceries[source]?.shape,style=plateStyle(food.preparation||food.name);
    const name=({bottle:'Empty bottle',can:'Empty can',pouch:'Empty snack bag',box:'Empty box',carton:'Empty carton',apple:'Apple core',orange:'Orange peel'})[shape] ||
      ({banana:'Banana peel',oranges:'Empty fruit bag',cone:'Paper sleeve',popcorn:'Empty popcorn carton',chocolate:'Candy wrapper',chips:'Empty chip bag','doughnut-box':'Empty bakery box'})[style] ||
      (beverage(food)?'Empty drink container':'Cleared dish');
    return {id,name:name+' · '+food.name,source,effect:'empty'};
  }
  if(Object.hasOwn(groceries,id))return groceries[id];
  if(dishes.has(id))return dishes.get(id);
  const match=/^meal-([a-z]+)-([a-z0-9-]+)$/.exec(id);
  if(!match || !Object.hasOwn(KIND,match[1]))return null;
  const menu=menuFor({kind:match[1]}),item=(/^\d+$/.test(match[2])?menu[Number(match[2])]:menu.find(row=>dishKey(row.name)===match[2])) || legacyDish(match[1],match[2]);
  if(!item || item.product || !preparedFood({kind:match[1]},item))return null;
  const food={...item,id};dishes.set(id,food);return food;
}
const dishKey=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
export const preparedFood=(place,item)=>Boolean(carriedOrder(item));
export function foodId(place,item){
  if(item.product)return item.product;
  return menuFor(place).some(row=>row.name===item.name)?'meal-'+place.kind+'-'+dishKey(item.name):null;
}
export const beverage=item=>groceries[item.source||item.id]?item.effect==='pep':carriedOrder(item)==='cup';
export const servingSize=item=>beverage(item)?4:3;
const servingLevel=(item,remaining)=>2*remaining/servingSize(item);
const portionId=(item,remaining)=>remaining===0?'empty-'+item.id:remaining===servingSize(item)?item.id:'partial-'+remaining+'-'+item.id;
export function heldFood(item){
  if(item.effect==='empty')return portionKey(heldFood(pantryItem(item.source)),0);
  if(item.remaining)return portionKey(heldFood(pantryItem(item.source)),servingLevel(item,item.remaining));
  return groceries[item.id]?item.id:servingFor(item);
}

export function diningTable(sim,view){
  const seat=sim.seat;if(!seat || seat.leaving || !view)return null;
  const at=roomLocal(view.plan,seat.x,seat.z);
  const spot=view.plan.seats.find(s=>Math.hypot(s.a-at.a,s.b-at.b)<.14);
  if(!spot)return null;
  return view.plan.things.filter(t=>t.shape==='table' && (t.a-spot.a)*spot.da+(t.b-spot.b)*spot.db>0 && Math.hypot(t.a-spot.a,t.b-spot.b)<1.66)
    .sort((a,b)=>Math.hypot(a.a-spot.a,a.b-spot.b)-Math.hypot(b.a-spot.a,b.b-spot.b))[0]||null;
}

export class Shopping{
  constructor(sim){
    this.sim=sim;this.inventory=Object.create(null);this.sold=Object.create(null);this.reservations=new Map();this.basket=null;this.order=null;this.revision=0;this.eating=null;this.held=null;
  }
  restore(record){
    if(!record || typeof record!=='object')return;
    for(const [id,n] of Object.entries(record.inventory||{}))if(pantryItem(id) && Number.isSafeInteger(n) && n>0)this.inventory[id]=n;
    for(const [key,slots] of Object.entries(record.sold||{}))if(key.length<160 && !['__proto__','constructor','prototype'].includes(key) && Array.isArray(slots)){
      this.sold[key]=new Set(slots.filter(i=>Number.isInteger(i) && i>=0 && i<4096));
    }
    if(this.inventory[record.held])this.sim.player.carry=record.wrapped===true?'takeout':heldFood(pantryItem(record.held));
    this.held=this.inventory[record.held]?record.held:null;
    const use=record.inUse,item=pantryItem(use?.id);
    if(item && item.effect!=='empty' && item.effect!=='pantry' && Number.isFinite(use.progress)){
      if(use.finish===undefined){
        const progress=use.progress>=3.56?4:use.progress>=1.31?1.4:0;
        this.beginEating(item,null,progress);
      }else this.beginEating(item,null,Math.max(0,Math.min(4.5,use.progress)),{finish:use.finish===true});
      this.tick();
    }
    this.revision++;
  }
  record(){const e=this.eating;return {inUse:e && !e.onRemaining?{id:portionId(e.item,e.initial),progress:this.sim.elapsed-e.start,finish:e.finish}:null,inventory:this.inventory,held:this.held,wrapped:Boolean(this.held && this.sim.player.carry==='takeout'),sold:Object.fromEntries(Object.entries(this.sold).map(([id,set])=>[id,[...set]]))};}
  missing(shop,index,visible=false){const visitor=this.reservations.get(shop)?.get(index);
    return this.sold[shop]?.has(index) || visitor && (!visible || visitor.collected) || (this.basket?.shop===shop && this.basket.units.some(s=>s.index===index)) ||
    (this.order?.shop===shop && this.order.slot?.index===index && (!visible || this.order.collected));}
  shopperStock(visit,reserve){
    const shop=visit.room.place.id,index=visit.slot.index;
    if(reserve){
      if(!this.reservations.has(shop))this.reservations.set(shop,new Map());
      this.reservations.get(shop).set(index,visit);
    }else{
      const slots=this.reservations.get(shop);slots?.delete(index);
      if(!slots?.size)this.reservations.delete(shop);
      if(visit.paid)(this.sold[shop]??=new Set()).add(index);
    }
    this.revision++;
  }
  shelf(room){
    if(!room?.grocerySlots || this.sim.player.armed)return [];
    const {a,b}=room;
    const slots=room.grocerySlots.filter(s=>{
      const da=a-s.a,db=b-s.b;
      return da*s.da+db*s.db>.02 && Math.hypot(da,db)<=1.22 && !room.things.some(t=>t!==s.fixture && t.solid && t.h+t.y>.7 && crossesFixture({a,b},{a:s.a+s.da*.21,b:s.b+s.db*.21},t));
    }).sort((s,t)=>Math.hypot(a-s.a,b-s.b)-Math.hypot(a-t.a,b-t.b));
    return slots;
  }
  setHand(id){
    if(this.eating)return false;
    this.held=id;this.sim.player.carry=id?heldFood(pantryItem(id)):null;return true;
  }
  receive(id){
    this.inventory[id]=(this.inventory[id]||0)+1;
    this.setHand(id);this.revision++;
  }
  take(room,slot){
    if(this.eating || this.order || this.sim.room!==room || !this.shelf(room).includes(slot) || this.missing(room.place.id,slot.index))return false;
    if(this.basket && this.basket.shop!==room.place.id)return false;
    this.basket??={shop:room.place.id,units:[],reminded:false};
    this.basket.units.push(slot);this.sim.player.carry=slot.id;this.revision++;return true;
  }
  putBack(room,id){
    const bag=this.basket;if(this.eating || this.order || bag?.shop!==room.place.id || !bag)return false;
    const nearby=new Set(this.shelf(room).filter(s=>s.id===id).map(s=>s.index));
    const i=bag.units.findLastIndex(s=>s.id===id && nearby.has(s.index));if(i<0)return false;
    bag.units.splice(i,1);if(!bag.units.length && !bag.charges?.length)this.basket=null;
    this.sim.player.carry=bag.units.at(-1)?.id || (this.held && heldFood(pantryItem(this.held)));this.revision++;return true;
  }
  charge(place,price,sale){
    if(this.sim.room?.place.id!==place.id || this.basket && this.basket.shop!==place.id)return false;
    this.basket??={shop:place.id,units:[],reminded:false};
    (this.basket.charges??=[]).push({price,sale});this.revision++;
    return true;
  }
  charges(place){return this.basket?.shop===place.id?this.basket.charges?.reduce((sum,line)=>sum+line.price,0)||0:0;}
  total(place){return this.charges(place)+(this.basket?.shop===place.id?this.basket.units.reduce((sum,s)=>sum+groceryPrice(place,groceries[s.id]),0):0);}
  payCharges(place){
    const due=this.charges(place);
    if(this.sim.room?.place.id!==place.id || this.eating || this.order || !due || !this.canPay(due))return false;
    const tender=this.pay(due,place.name);
    if(!tender)return false;
    this.settleCharges(place,tender);
    if(!this.basket.units.length)this.basket=null;
    this.revision++;this.sim._say('Paid $'+due.toFixed(2)+'.',4);return true;
  }
  pay(amount,merchant){
    const tender=payFor(this.sim,amount,merchant || 'Store purchase');
    if(!tender)return null;
    this.sim.spent=(this.sim.spent||0)+amount;
    return tender;
  }
  settleCharges(place,tender){
    for(const {price,sale} of this.basket.charges||[])sale?.(place,price,tender);
    this.basket.charges=[];
  }
  eatFromBasket(id,view,finish,sale){
    const room=this.sim.room,b=this.basket,item=pantryItem(id);
    if(this.eating || this.order || this.sim.player.armed || !room || b?.shop!==room.place.id || !item || item.effect==='pantry')return false;
    const index=b.units.findIndex(slot=>slot.id===id);
    if(index<0 || !this.charge(room.place,groceryPrice(room.place,item),sale))return false;
    this.transfer(b.shop,b.units.splice(index,1));
    return this.consume(id,view,finish);
  }
  transfer(shop,units){
    if(!units.length)return;
    const removed=this.sold[shop]??=new Set();
    for(const s of units){this.inventory[s.id]=(this.inventory[s.id]||0)+1;removed.add(s.index);}
    this.setHand(units.at(-1).id);this.revision++;
  }
  canPay(amount){const limit=purchaseLimit(this.sim);if(limit>=amount)return true;this.sim._say('You need $'+(amount-limit).toFixed(2)+' more.');return false;}
  accept(order,toGo=false,unpaid=false){
    const sim=this.sim;
    if(this.eating || !order || this.order!==order || !order.ready || sim.room?.place.id!==order.shop || order.view.closed || order.view.handoff || sim.player.armed ||
      (unpaid?order.basket:!this.canPay(order.price)))return false;
    const near=order.table?diningTable(sim,order.view)===order.table:Math.hypot(sim.player.x-order.employee.x,sim.player.z-order.employee.z)<2.65;
    if(!near)return false;
    const [x,z]=order.table?roomPoint(sim.room,order.table.a,order.table.b):[order.employee.x,order.employee.z];
    let tender;
    if(unpaid){
      if(!this.charge(sim.room.place,order.price,order.sale))return false;
    }else{
      tender=this.pay(order.price,sim.room.place.name);
      if(!tender)return false;
      this.payment={start:sim.elapsed,x,z,tender};
    }
    let sale=order.price;
    if(order.basket){
      sale-=this.charges(sim.room.place);
      this.settleCharges(sim.room.place,tender);
      this.transfer(order.shop,this.basket.units);
      if(this.basket.units.length>1){this.held=null;sim.player.carry='takeout';}
      this.basket=null;
    }
    else if(order.slot)this.transfer(order.shop,[order.slot]);
    else{
      this.receive(order.food.id);
      if(order.packed || toGo && !beverage(order.food))sim.player.carry='takeout';
    }
    if(!unpaid && sale>0)order.sale?.(sim.room.place,sale,tender);
    order.paid=!unpaid;this.cancelOrder();
    sim._say('Received '+order.label+(unpaid?'. Payment due $':'. $')+order.price.toFixed(2)+'.',4);return true;
  }
  cancelOrder(){
    const order=this.order;if(!order)return;
    this.order=null;order.release?.();this.revision++;
  }
  consume(id,view=null,finish=true){
    if(this.eating || !this.inventory[id])return false;
    const item=pantryItem(id);if(!item || ['pantry','empty'].includes(item.effect))return false;
    this.payment=null;
    if(--this.inventory[id]===0)delete this.inventory[id];
    this.setHand(null);
    this.beginEating(item,view,0,{finish});
    this.sim._say((beverage(item)?'Drinking ':'Eating ')+item.name+'.');return true;
  }
  beginEating(item,view,progress=0,{finish=true,remaining=item.remaining||servingSize(item),onRemaining=null}={}){
    if(item.source)item=pantryItem(item.source);
    const seatTable=diningTable(this.sim,view),table=seatTable && !groceries[item.id] && !view.claims.has(seatTable)?seatTable:null,drink=beverage(item);
    const level=servingLevel(item,remaining), duration=drink?1.05:1.4;
    if(table){
      view.claims.set(table,this);
      if(!drink)view.group?.userData.mealAt?.(table,true,item,level);
    }
    const base=table && drink?servingFor(item,true):heldFood(item),start=this.sim.elapsed-progress;
    const carry=table && !drink?'fork':portionKey(base,level);
    this.eating={item,base,style:plateStyle(item.preparation||item.name),level,start,duration,
      until:start+duration*(finish?remaining:1),initial:remaining,remaining,finish,onRemaining,table,view,drink,carry,seat:this.sim.seat};
    this.sim.player.carry=carry;this.revision++;
  }
  portion(e,level){
    if(e.level===level)return;
    e.level=level;
    if(e.table && !e.drink)e.view.group?.userData.mealRemaining?.(e.table,e.item,level);
    else{
      const next=portionKey(e.base,level);
      if(this.sim.player.carry===e.carry)this.sim.player.carry=next;
      e.carry=next;
    }
  }
  clearEating(){
    const e=this.eating;if(!e)return;
    this.eating=null;
    if(e.onRemaining?.(e.remaining,e)){
      if(this.sim.player.carry===e.carry)this.sim.player.carry=null;
    }else if(e.table && !e.remaining){
      const mug=e.drink?{...e.table,y:e.table.h,temporary:true}:null;
      if(mug)e.view.group?.userData.drinkAt?.(mug,'mug',true,e.item,0);
      e.view.cleanups.push({table:e.table,mug,emptyCarry:portionKey(e.base,0),server:null,left:1.4});
      if(this.sim.player.carry===e.carry)this.sim.player.carry=null;
    }else{
      if(e.table){
        if(!e.drink)e.view.group?.userData.mealAt?.(e.table,false);
        e.view.claims.delete(e.table);
      }
      const id=portionId(e.item,e.remaining);this.inventory[id]=(this.inventory[id]||0)+1;
      if(this.sim.player.carry===e.carry)this.setHand(id);
    }
    this.revision++;
  }
  discard(id){
    if(!this.inventory[id] || pantryItem(id)?.effect!=='empty')return false;
    if(--this.inventory[id]===0){delete this.inventory[id];if(this.held===id)this.setHand(null);}
    this.revision++;return true;
  }
  tick(){
    const sim=this.sim,b=this.basket;
    if(this.payment && sim.elapsed-this.payment.start>=.72)this.payment=null;
    const e=this.eating;
    if(e){
      if(e.table && (e.seat!==sim.seat || sim.seat?.leaving || sim.room?.place.id!==e.view.plan.place.id)){
        if(!e.drink)e.view.group?.userData.mealAt?.(e.table,false);
        e.view.claims.delete(e.table);e.table=null;e.base=heldFood(e.item);
        e.carry=sim.player.carry=portionKey(e.base,e.level);
      }
      const t=sim.elapsed-e.start;
      const bites=Math.min(e.finish?e.initial:1,Math.max(0,Math.floor((t-e.duration*.54)/e.duration)+1));
      if(e.initial-bites<e.remaining){
        e.remaining=e.initial-bites;
        const fraction=(servingSize(e.item)-e.remaining)/servingSize(e.item);
        sim.pep=e.item.effect==='drink'?0:Math.max(sim.pep||0,(PEP[e.item.effect]||PEP.pep)*fraction);
        this.portion(e,servingLevel(e.item,e.remaining));this.revision++;
      }
      if(sim.elapsed>=e.until)this.clearEating();
    }
    if(!b)return;
    if(b.until && sim.room?.place.id===b.shop){delete b.until;return;}
    if(b.until && (sim.elapsed>=b.until || sim.room && sim.room.place.id!==b.shop)){this.closeUnpaid();return;}
    if(!b.until && !b.reminded && sim.room?.place.id===b.shop && sim.room.b<.60 && sim.room.b>0 && this.witness(sim.doorway)){
      b.reminded=true;sim._say('Clerk: You still need to pay.',4);
    }
  }
  witness(view){
    const clerk=view?.clerk;
    if(!clerk || clerk.gone || clerk.escape || view.closed)return false;
    const room=view.plan,from=roomLocal(room,clerk.x,clerk.z),door={a:0,b:.05};
    return !room.things.some(t=>t.solid && t.h+t.y>1.55 && crossesFixture(from,door,t));
  }
  leave(view){
    this.payment=null;
    const order=this.order;order?.walkout?.(this.basket?.shop===order.shop);
    this.cancelOrder();
    const b=this.basket;if(!b || b.until)return;
    // Staff sometimes call after the customer first. Only an observed, reported exit reaches dispatch.
    b.at={x:view?.plan.x??this.sim.player.x,y:this.sim.player.y,z:view?.plan.z??this.sim.player.z};
    b.report=this.witness(view) && this.sim._random()<.68;
    if(b.report)b.roomView=view;
    if(b.report && this.sim._random()<.55){
      b.until=this.sim.elapsed+9;this.sim._say('Clerk: Excuse me! Come back and pay.',6);
    }else this.closeUnpaid();
  }
  closeUnpaid(){
    const b=this.basket;if(!b)return;
    this.transfer(b.shop,b.units);this.basket=null;
    if(b.report)this.sim.offence('theft',{...b.at,witnessReport:true,localResponse:true,identified:false,roomView:b.roomView,message:'A store employee reported a shop theft.'});
    else this.sim._say(b.charges?.length?'You left without settling the bill.':'You left with the unpaid groceries.',4);
  }
  interrupt(){
    this.payment=null;this.cancelOrder();this.clearEating();
    if(this.basket?.until)this.closeUnpaid();
    else if(this.basket){this.basket=null;this.setHand(this.held);this.revision++;}
  }
}
