// Table service. A guest who sits at a table waves the server over, is asked
// what they would like, orders, watches the kitchen make it, is served, eats,
// and settles the check before leaving. One ticket stays open for the sitting.
import { ask, done, walking, pause, reached } from './facility-visits.js';
import { cookDish, workSteps, frontOfHouse, clearPlate, passApproach, passOf, clearWare } from './kitchen-line.js';
import { diningTable, foodId, pantryItem, heldFood, beverage } from './shopping.js';
import { floorAt, facePoint, shopAisle } from './room-walk.js';
import { roomLocal, roomPoint } from './room.js';
import { menuFor, PEP, carriedOrder } from './menu.js';
import { servingFor } from './food-catalog.js';
import { foodPreviewOptions } from './food-counter.js';

const money=n=>'$'+n.toFixed(2);
const gap=(p,q)=>Math.hypot(p.a-q.a,p.b-q.b);
const lower=name=>/^[A-Z][a-z]/.test(name) && !/^(General|Caesar|French|Greek|Italian|Korean|Thai|Western|Boston|Vietnamese|Cubano|BLT)/.test(name) ? name[0].toLowerCase()+name.slice(1) : name;
const NAMES=['Marisol','Dante','Priya','Jo','Andre','Mei','Tasha','Luis','Nina','Sam','Farah','Kevin','Rosa','Malik','Ines','Theo'];
/** The name on a member of staff's apron: the same person keeps it. */
export function staffName(view,actor) {
  if(actor.name)return actor.name;
  const place=view.plan.place, index=view.actors.indexOf(actor);
  let h=2166136261;for(const c of String(place.id??place.name??''))h=Math.imul(h^c.charCodeAt(0),16777619);
  return actor.name=NAMES[((h>>>0)+index*5)%NAMES.length];
}
// How the floor staff of each manner of room talk.
const VOICES={
  fine:{hello:p=>`Good evening, and welcome to ${p}. Are you ready to order, or shall I give you a moment?`,drink:'Very good. And to drink?',
    pick:d=>`The ${d} is what the kitchen is proudest of.`,sent:'Excellent. I will put that in for you right away.',enjoy:'Enjoy.',check:'Here is your check. No rush at all.'},
  diner:{hello:p=>`Hey there, welcome to ${p}. You know what you want, or you need a minute?`,drink:'You got it. Anything to drink with that?',
    pick:d=>`Can't go wrong with the ${d}. Comes out fast, too.`,sent:'Coming right up.',enjoy:'Enjoy, hon.',check:'Here you go. Pay whenever you are ready.'},
  counter:{hello:p=>`Hey, welcome to ${p}. What can I get you?`,drink:'Sure. Something to drink?',
    pick:d=>`Everybody gets the ${d}.`,sent:'Okay, a few minutes.',enjoy:'There you go.',check:'This is your total.'},
  sushi:{hello:p=>`Welcome to ${p}. Are you ready to order?`,drink:'Of course. Would you like something to drink?',
    pick:d=>`The ${d} is very good today.`,sent:'Thank you. I will tell the chef.',enjoy:'Please enjoy.',check:'Here is your check. Thank you.'},
  cafe:{hello:p=>`Hi, welcome to ${p}! What can I get started for you?`,drink:'Got it. Anything to drink?',
    pick:d=>`The ${d} is my favorite here.`,sent:'Perfect, I will bring that right over.',enjoy:'Enjoy!',check:'Here is your check, whenever you are ready.'},
  bar:{hello:p=>`Welcome to ${p}. What are you having?`,drink:'Sure thing. What are you drinking?',
    pick:d=>`People come in for the ${d}.`,sent:'You got it.',enjoy:'Cheers.',check:'Here is your tab.'},
};
const VOICE_OF={fine:'fine',diner:'diner',sushi:'sushi',coffee:'cafe',bakery:'cafe',bar:'bar',club:'bar'};
const voiceOf=room=>VOICES[VOICE_OF[room.style]||'counter'];

/** What a guest at this place can be brought at a table: food and drink the kitchen makes. */
export function tableMenu(place) {
  const rows=[];
  for(const item of menuFor(place)){
    if(item.product || !carriedOrder(item))continue;
    const id=foodId(place,item), food=id && pantryItem(id);
    if(food)rows.push({item,food,price:item.price,drink:Boolean(beverage(food))});
  }
  return rows;
}
/** Whether this room waits on its tables right now. */
export function waitsTables(view) {
  const room=view?.plan;
  return Boolean(room && ['eat','bar'].includes(room.kind) && !view.closed && !view.handoff &&
    view.actors?.some(a=>room.staff.includes(a.spot) && !a.gone && !a.escape) && tableMenu(room.place).length);
}

/** Wave the server over to the table the player sits at. */
export function callServer(sim,view,{sale}={}) {
  const bag=sim.shopping, room=view?.plan, table=diningTable(sim,view);
  if(!table || !waitsTables(view) || bag.order || bag.eating || sim.player.armed || sim.room?.place.id!==room.place.id)return false;
  if(view.claims.has(table) && view.claims.get(table)!==bag){sim._say('This table is still being cleared.');return false;}
  if(view.cleanups?.some(job=>job.table===table)){sim._say('This table is still being cleared.');return false;}
  const voice=voiceOf(room), place=room.place;
  const o={dineIn:true,shop:place.id,room,view,person:sim.player,table,sale,items:[],stage:'hailed',phase:'Waving your server over',
    ready:false,label:'your table',price:0,talk:null,reply:null,wish:null,paid:false,tip:0,away:0};
  view.claims.set(table,o);
  const playerAt=()=>roomLocal(room,sim.player.x,sim.player.z);
  const say=(server,line,seconds=5)=>{o.said=line;sim._say((server?staffName(view,server)+': ':'')+line,seconds);};
  const idle=(seconds=.25)=>pause(sim.player,undefined,seconds,null,'idle');
  o.due=()=>o.items.filter(d=>d.state!=='ordered' && d.state!=='cooking' && d.state!=='pass').reduce((sum,d)=>sum+d.price,0);
  o.total=()=>o.items.reduce((sum,d)=>sum+d.price,0);
  function tableEdge(server) {
    const at=playerAt(), aisle=shopAisle(view), from=floorAt(view,server);
    const nodes=aisle.nodes.filter(n=>gap(n,at)>.62 && gap(n,table)<1.5).sort((p,q)=>gap(p,table)-gap(q,table));
    return nodes.find(n=>aisle.route(from,n)) || nodes[0] || at;
  }
  function* come(phase) {
    o.phase=phase;
    const server=yield* ask(o);
    if(!server)return null;
    o.server=server;
    yield walking(server,tableEdge(server),phase);
    facePoint(view,server,playerAt());
    return server;
  }
  // The server stands at the table until the guest answers, for a while.
  function* listen(server,kind,phase,patience=45) {
    o.reply=null;o.talk={kind,server};o.phase=phase;
    let waited=0;
    while(!o.reply && waited<patience && diningTable(sim,view)===table){
      yield pause(server,undefined,.25,playerAt(),'idle');
      if(!o.talkOpen)waited+=.25;
    }
    const reply=o.reply;o.talk=null;o.reply=null;
    return reply;
  }
  function* bring(server,d) {
    const name=staffName(view,server), what=lower(d.food.name);
    // A plate being cleared from an earlier course goes first.
    while(view.cleanups.some(job=>job.table===table) || (bag.eating && !d.drink))yield pause(server,name+' has your '+what,.3,null,'idle');
    yield walking(server,tableEdge(server),name+' is bringing your '+what);
    yield pause(server,name+' sets down your '+what,.75,table,'reach');
    server.carry=null;
    if(d.drink){
      // The glass goes beside the plate, toward the wall side of the table.
      const side=Math.sign(table.a)||1, along=table.w>=table.d;
      d.spot={...table,a:table.a+(along?-.24*side:0),b:table.b+(along?.12:-.2),y:table.h,temporary:true};
      view.group?.userData.drinkAt?.(d.spot,'mug',true,d.food);
    }else view.group?.userData.mealAt?.(table,true,d.food);
    d.state='table';bag.revision++;
  }
  function* round(server,items) {
    const voice=voiceOf(room), name=staffName(view,server);
    for(const d of items){d.state='ordered';o.items.push(d);}
    o.stage='fired';
    say(server,voice.sent,4);
    yield pause(server,name+' writes down your order',1.2,playerAt(),'talk');
    const front=items.filter(d=>d.drink || frontOfHouse(d.item,place.kind)), dishes=items.filter(d=>!front.includes(d));
    // Drinks and anything from the case come from whoever is serving, before the food.
    for(const d of front){
      d.state='cooking';
      yield* workSteps(o,server,d.item,{label:name});
      server.carry=d.drink?servingFor(d.food,true)||heldFood(d.food):servingFor(d.food,true)||'tray';
      yield* bring(server,d);
      if(dishes.length)say(server,'Your food will be right out.',3);
      else say(server,voice.enjoy,3);
    }
    if(dishes.length){
      const pass=passApproach(view,null,server), cook=view.actors.find(a=>['cook','deliCook'].includes(a.spot.role) && !a.gone);
      if(pass)yield walking(server,pass,name+' takes your order to the kitchen');
      yield pause(server,name+' calls it in: '+dishes.map(d=>lower(d.food.name)).join(', '),1.3,cook?floorAt(view,cook):null,'talk');
      done(o);
      for(const d of dishes){
        d.state='cooking';
        const portion=yield* cookDish(o,d.item);
        d.state='pass';d.portion=portion?.held?null:portion;
        if(portion?.held)server=portion.held;
        else{
          o.phase='Order up: '+lower(d.food.name)+' is on the pass';
          server=yield* ask(o);
          const from=passApproach(view,portion,server);
          if(from)yield walking(server,from,staffName(view,server)+' collects your '+lower(d.food.name)+' from the pass');
          yield pause(server,staffName(view,server)+' collects your '+lower(d.food.name)+' from the pass',.55,portion,'pickUp');
          clearPlate(o,portion);d.portion=null;
        }
        o.server=server;
        server.carry=servingFor(d.food,true)||'tray';
        yield* bring(server,d);
        say(server,voice.enjoy,3);
      }
    }
    yield pause(o.server,undefined,.6,playerAt(),'talk');
    done(o);
  }
  function* service() {
    const voice=voiceOf(room);
    let server=yield* come('Your server is on the way');
    if(!server)return;
    say(server,voice.hello(room.name),6);
    for(;;){
      const reply=yield* listen(server,'greeting',staffName(view,server)+' is waiting for your order · G to answer');
      if(reply?.items?.length){yield* round(server,reply.items);break;}
      // No answer, or a minute asked for: the server goes back to work until waved over again.
      say(server,'Take your time. Wave when you are ready.',4);
      done(o);o.stage='seated';o.phase='G to call your server back';o.wish=null;
      while(o.wish!=='hail')yield idle();
      o.wish=null;o.stage='hailed';
      server=yield* come('Your server is on the way');
      if(!server)return;
      say(server,'Ready when you are.',4);
    }
    for(;;){
      o.stage='dining';o.wish=null;
      while(!o.wish){
        const waiting=o.items.filter(d=>d.state==='table');
        o.phase=bag.eating?'Enjoying your '+lower(bag.eating.item.name):waiting.length?'G to '+(waiting[0].drink?'drink':'eat'):'G for more or the check';
        yield idle();
      }
      const want=o.wish;o.wish=null;
      if(want==='check')break;
      o.stage='hailed';
      server=yield* come('Your server is on the way');
      if(!server)return;
      say(server,'What else can I get you?',5);
      const reply=yield* listen(server,'greeting',staffName(view,server)+' is waiting for your order · G to answer');
      if(reply?.items?.length)yield* round(server,reply.items);
      else{say(server,'No problem.',3);done(o);}
    }
    o.stage='check';
    server=yield* come('Your server is bringing the check');
    if(!server)return;
    say(server,voice.check,5);
    o.stage='paying';
    // The check stays on the table until it is paid: nobody stands over a guest for it.
    yield pause(server,staffName(view,server)+' leaves the check',.9,table,'reach');
    done(o);
    o.talk={kind:'check',server};o.phase='Your check is '+money(o.due())+' · G to pay';
    while(!o.paid)yield idle();
    o.talk=null;
    server=yield* come('Your server is collecting the check');
    if(server){
      const share=o.tip/Math.max(.01,o.due());
      say(server,share>=.195?'Thank you so much! Come back and see us.':share>=.145?'Thank you, have a good one.':share>0?'Thanks.':'Okay. Have a good one.',5);
      yield pause(server,staffName(view,server)+' picks up the check',1,table,'pickUp');
    }
    done(o);o.stage='closed';
  }
  o.script=service();
  /** A choice made at the table: 'hail', 'more' or 'check'. */
  o.ask=wish=>{o.wish=wish;};
  /** Start on something that has been set down. */
  o.consume=d=>{
    if(bag.eating || d.state!=='table')return false;
    if(d.drink)view.group?.userData.drinkAt?.(d.spot,'mug',false);
    else view.group?.userData.mealAt?.(table,false);
    view.claims.delete(table);
    sim.pep=d.food.effect==='drink'?0:Math.max(sim.pep||0,PEP[d.food.effect]||PEP.pep);
    bag.beginEating(d.food,view);
    d.state='eating';o.eating=d;
    sim._say((d.drink?'Drinking ':'Eating ')+lower(d.food.name)+'.');
    return true;
  };
  o.pay=rate=>{
    if(o.paid || o.stage!=='paying')return false;
    const due=o.due(), tip=Math.round(due*rate*100)/100;
    if(!bag.canPay(due+tip))return false;
    const [x,z]=roomPoint(room,table.a,table.b);
    bag.payment={start:sim.elapsed,x,z};
    sim.cash=Math.round((sim.cash-due-tip)*100)/100;sim.spent=(sim.spent||0)+due+tip;
    o.sale?.(place,due);o.paid=true;o.tip=tip;
    sim._say('Paid '+money(due)+(tip?' and left '+money(tip):'')+'.',4);
    return true;
  };
  /** Leaving with the check unpaid. Staff who see it go report it. */
  o.walkout=()=>{
    const due=o.due();
    if(o.paid || !due)return;
    o.paid=true;
    if(bag.witness(view) && sim._random()<.85)sim.offence('theft',{x:room.x,y:sim.player.y,z:room.z,witnessReport:true,message:'The restaurant reported a walkout on a '+money(due)+' check.'});
    else sim._say('You walked out on a '+money(due)+' check.',5);
  };
  o.release=()=>{
    clearWare(o);
    for(const d of o.items){
      if(d.portion){clearPlate(o,d.portion);d.portion=null;}
      if(d.state==='table'){
        // What is left on the table is cleared like any other plate.
        if(d.drink){view.group?.userData.drinkAt?.(d.spot,'mug',false);const mug={...d.spot};view.group?.userData.drinkAt?.(mug,'mug',true,d.food,2);view.cleanups.push({table,mug,emptyCarry:servingFor(d.food,true),server:null,left:1.2});}
        else view.cleanups.push({table,mug:null,emptyCarry:servingFor(d.food,true),server:null,left:1.2});
        d.state='left';
      }
    }
    if(view.claims.get(table)===o && !view.cleanups.some(job=>job.table===table))view.claims.delete(table);
    if(o.request){o.request.requests=o.request.requests.filter(req=>req!==o);o.request=null;}
    if(o.employee?.serviceOwner===o)done(o);
  };
  o.step=dt=>{
    if(sim.room?.place.id!==o.shop || view.handoff || view.closed || sim.player.armed || sim.ending || o.employee?.escape || o.employee?.gone){bag.cancelOrder();return;}
    if(o.eating && bag.eating?.item!==o.eating.food){o.eating.state='eaten';o.eating=null;bag.revision++;}
    if(!view.claims.has(table))view.claims.set(table,o);
    const here=diningTable(sim,view)===table;
    o.away=here?0:o.away+dt;
    if(o.away>25 && !o.due()){bag.cancelOrder();sim._say('You left your table, so the order was cancelled.',5);return;}
    const task=o.task??=o.script.next().value;
    if(!task){bag.cancelOrder();return;}
    if(task.phase)o.phase=task.phase==='waiting for staff'?(o.stage==='fired'?'The kitchen has your ticket':o.phase):task.phase;
    if(task.point){if(!reached(o,task,dt))return;}
    else{
      if(task.actor!==sim.player){
        if(task.face)facePoint(view,task.actor,task.face);
        task.actor.clip=task.clip;task.actor.stride=0;task.actor.time=(task.actor.time||0)+dt;
      }
      task.time-=dt;if(task.time>0)return;
    }
    o.task=null;
  };
  bag.order=o;bag.revision++;
  return true;
}

// The conversation.
function listing(ctx,o,title,message,rows,extra={}) {
  const {sim,interaction}=ctx, bag=sim.shopping;
  const available=()=>bag.order===o && !o.view.closed && !o.view.handoff && !sim.player.armed && (!extra.kind || o.talk?.kind===extra.kind);
  interaction.openList(title,rows,row=>row.run?.(),{message,cash:sim.cash,available,...extra.options,onClose:()=>{o.talkOpen=false;extra.options?.onClose?.();}});
  o.talkOpen=interaction.open;
}
function sendOrder(ctx,o,items) {
  const total=items.reduce((sum,d)=>sum+d.price,0);
  if(!items.length || !ctx.sim.shopping.canPay(o.total()+total))return;
  o.reply={items:items.map(d=>({...d}))};
}
function orderMenu(ctx,o,{drinksOnly=false,chosen=null}={}) {
  const place=o.room.place, voice=voiceOf(o.room), who=staffName(o.view,o.talk.server);
  const menu=tableMenu(place), foods=menu.filter(d=>!d.drink), drinks=menu.filter(d=>d.drink);
  const send=items=>sendOrder(ctx,o,items);
  const options=foodPreviewOptions(ctx.$);
  const row=(d,run)=>({item:d.item,name:d.item.name,note:money(d.price),run});
  if(chosen || drinksOnly){
    const rows=drinks.map(d=>row(d,()=>send(chosen?[chosen,d]:[d])));
    if(chosen)rows.push({name:'Nothing to drink, thanks',run:()=>send([chosen])});
    else rows.push({name:'Back to the menu',run:()=>orderMenu(ctx,o)});
    if(!drinks.length && chosen){send([chosen]);return;}
    listing(ctx,o,who+' · your server',chosen?voice.drink:'What are you drinking?',rows,{kind:'greeting',options});
    return;
  }
  const rows=foods.map(d=>row(d,()=>orderMenu(ctx,o,{chosen:d})));
  if(drinks.length)rows.push({name:foods.length?'Just something to drink':'See the drinks',run:()=>orderMenu(ctx,o,{drinksOnly:true})});
  listing(ctx,o,place.name+' · menu','',rows,{kind:'greeting',options});
}
function greeting(ctx,o) {
  const place=o.room.place, voice=voiceOf(o.room), who=staffName(o.view,o.talk.server), menu=tableMenu(place);
  const meals=menu.filter(d=>!d.drink && d.item.effect==='meal'), pool=meals.length?meals:menu;
  let h=7;for(const c of String(place.id??place.name))h=Math.imul(h^c.charCodeAt(0),16777619);
  const pick=pool[(h>>>0)%pool.length];
  const rows=[
    {name:'I am ready to order',run:()=>orderMenu(ctx,o)},
    {name:'What do you recommend?',run:()=>listing(ctx,o,who+' · your server',voice.pick(lower(pick.item.name)),[
      {name:'I will have the '+lower(pick.item.name),note:money(pick.price),run:()=>pick.drink?sendOrder(ctx,o,[pick]):orderMenu(ctx,o,{chosen:pick})},
      {name:'Let me see the menu',run:()=>orderMenu(ctx,o)}],{kind:'greeting'})},
    {name:'I need a few minutes',run:()=>{o.reply={later:true};}},
  ];
  listing(ctx,o,who+' · your server',o.said||voice.hello(o.room.name),rows,{kind:'greeting'});
}
function check(ctx,o) {
  const {sim,save}=ctx, place=o.room.place, due=o.due();
  const lines=o.items.filter(d=>d.price && d.state!=='ordered' && d.state!=='cooking' && d.state!=='pass').map(d=>d.item.name+' '+money(d.price)).join(' · ');
  const pay=rate=>()=>{if(o.pay(rate))save?.(place.name);};
  const rows=[.2,.18,.15].map(rate=>({name:'Pay with a '+Math.round(rate*100)+'% tip',note:money(due*(1+rate)),disabled:sim.cash<due*(1+rate),run:pay(rate)}));
  rows.push({name:'Pay, no tip',note:money(due),disabled:sim.cash<due,run:pay(0)},{name:'Not yet',run:()=>{}});
  listing(ctx,o,place.name+' · your check',lines+' · Total '+money(due),rows,{kind:'check'});
}
function atTable(ctx,o) {
  const {sim}=ctx, bag=sim.shopping, place=o.room.place, rows=[];
  if(bag.eating){sim._say('Finish your '+(bag.eating.drink?'drink':'food')+' first.');return;}
  const here=diningTable(sim,o.view)===o.table;
  if(here)for(const d of o.items.filter(d=>d.state==='table'))rows.push({name:(d.drink?'Drink the ':'Eat the ')+lower(d.food.name),run:()=>{o.consume(d);}});
  if(o.stage==='dining' && here){
    rows.push({name:'Order something else',run:()=>o.ask('more')});
    if(o.due())rows.push({name:'Ask for the check',note:money(o.due()),run:()=>o.ask('check')});
  }
  if(o.stage==='seated' && here)rows.push({name:'Call your server',run:()=>o.ask('hail')});
  if(!o.due())rows.push({name:o.stage==='fired'?'Cancel the order':'Never mind',run:()=>bag.cancelOrder()});
  rows.push({name:rows.length?'Not now':'Keep waiting',run:()=>{}});
  listing(ctx,o,place.name,o.phase,rows);
}
/** G at a table. Returns whether table service took the key. */
export function openTableService(ctx) {
  const {sim}=ctx, view=sim.doorway, room=sim.room, bag=sim.shopping, o=bag.order;
  if(!room || view?.plan?.place.id!==room.place.id)return false;
  if(o?.dineIn){
    if(o.talk?.kind==='greeting' && diningTable(sim,view)===o.table)greeting(ctx,o);
    else if(o.talk?.kind==='check')check(ctx,o);
    else atTable(ctx,o);
    return true;
  }
  if(o || !diningTable(sim,view) || !waitsTables(view))return false;
  if(bag.eating){sim._say('Finish your '+(bag.eating.drink?'drink':'food')+' first.');return true;}
  if(sim.player.armed){sim._say('Nobody is coming over while that is out.');return true;}
  if(callServer(sim,view,{sale:ctx.sale}))sim._say('You catch your server’s eye.',3);
  return true;
}
/** Each frame: when the server reaches the table and speaks, the choices open by themselves. */
export function promptTableService(ctx) {
  const {sim,interaction}=ctx, o=sim.shopping?.order;
  if(!o?.dineIn || !o.talk || o.talk.shown || interaction?.open)return;
  o.talk.shown=true;
  if(o.talk.kind==='greeting')greeting(ctx,o);
  else if(o.talk.kind==='check')check(ctx,o);
}
