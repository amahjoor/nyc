// The line. Where each kind of cooking is done in a room, and the staff who
// work a ticket through it: every dish is made step by step at the equipment
// that step needs (recipes.js), and what is on the heat can be seen there.
import { recipeFor, foodTone } from './recipes.js';
import { floorAt, facePoint, shopAisle } from './room-walk.js';
import { ask, done, walking, pause, reached } from './facility-visits.js';

const gap=(p,q)=>Math.hypot(p.a-q.a,p.b-q.b);
// The fixtures that can do the work of a station, the proper one first. A
// slice shop bakes, reheats and holds everything at its one oven and counter.
const EQUIPMENT={
  range:['gasRange','kitchenRange','cookline','stockBurner','flatTop','grill','tandoor','oven','hotServery'],
  wok:['wokRange','kitchenRange','gasRange','cookline','flatTop','grill'],
  flat:['flatTop','grill','cookline','kitchenRange','gasRange','oven'],
  grill:['charGrill','flatTop','grill','cookline','kitchenRange','gasRange','oven'],
  fry:['fryer','donutFryer','kitchenRange','cookline','gasRange','flatTop','grill','oven'],
  oven:['oven','rackOven','tandoor','gasRange','cookline','kitchenRange','toaster','grill','flatTop'],
  board:['prepTable','doughBench','sandwichUnit','packingBench','sushiStation','passShelf','checkoutCounter','serviceDesk'],
  cold:['reachIn','sandwichUnit','cooler','prepTable','showcase','dipCabinet','packingBench'],
  steam:['hotServery','stockBurner','riceCooker','kitchenRange','cookline','gasRange'],
  sushi:['sushiStation','showcase','prepTable'],
  spit:['spit','flatTop','grill','kitchenRange'],
  smoker:['smoker','rackOven','oven','flatTop','kitchenRange'],
  espresso:['espresso','coffeeBrewer','blenders','sodaFountain'],
  blender:['blenders','shakeMixer','softServe','espresso','sodaFountain','draftTaps'],
  fountain:['sodaFountain','cooler','blenders','draftTaps','coffeeBrewer','espresso'],
  brew:['coffeeBrewer','espresso','sodaFountain','blenders','draftTaps'],
  bar:['draftTaps','bottleShelf','sodaFountain','cooler','espresso'],
  case:['showcase','cooler','breadrack','pizza','hotServery','dipCabinet','reachIn'],
  scoop:['dipCabinet','softServe','showcase','cooler'],
  pass:['passShelf','plates','packingBench','pickupSupplies','checkoutCounter','serviceDesk'],
};
// How high the working surface of each fixture is, where it is not its full height.
const TOP={kitchenRange:.87,cookline:.93,gasRange:.93,wokRange:.9,flatTop:.93,charGrill:.93,fryer:.86,oven:1.02,grill:.93,spit:1.0,prepTable:.92,doughBench:.94,
  sandwichUnit:.9,passShelf:.97,hotServery:.93,stockBurner:.98,tandoor:.93,smoker:1.0,donutFryer:.88,rackOven:1.0,dipCabinet:.9,softServe:1.0,
  packingBench:.93,reachIn:1.0,cooler:1.0,showcase:.98,breadrack:1.0};
// What is seen on the equipment while a step is under way, and how the cook moves doing it.
const WARE={range:'pan',wok:'wok',flat:'griddle',grill:'griddle',fry:'basket',oven:'tray',board:'board',cold:'bowl',steam:'ladle',sushi:'board',
  spit:'board',smoker:'tray',espresso:'cup',blender:'cup',fountain:'cup',brew:'cup',bar:'cup',scoop:'cup',pass:'plate'};
const CLIP={range:'stir',wok:'toss',flat:'flip',grill:'flip',fry:'reach',oven:'reach',board:'chop',cold:'pickUp',steam:'stir',sushi:'chop',
  spit:'chop',smoker:'reach',espresso:'reach',blender:'reach',fountain:'reach',brew:'reach',bar:'reach',case:'pickUp',scoop:'stir',pass:'reach'};
export const FRONT_OF_HOUSE=['espresso','blender','fountain','brew','bar','case','scoop'];

/** Where a station's work is done in this room: { kind, thing, a, b, y, face }, or null where the room has nothing for it. */
export function stationOf(view,kind) {
  const found=view.stations??=new Map();
  if(found.has(kind))return found.get(kind);
  const room=view.plan, planned=room.kitchen?.stations?.find(s=>s.kind===kind);
  let station=null;
  if(planned)station={top:TOP[planned.thing?.shape],...planned};
  else for(const shape of EQUIPMENT[kind]||[]){
    // A wok is a bay of the range only where that range has one.
    const thing=room.things.find(t=>t.shape===shape && (kind!=='wok' || shape!=='kitchenRange' || t.more?.wok));
    if(!thing)continue;
    const [fa,fb]=thing.face||[0,-1], along=fb?thing.w:thing.d;
    // Two jobs on one long line are done at different ends of it.
    const shift=along>1.5?({range:-.24,wok:-.3,steam:.05,flat:.22,grill:.24,fry:.36,spit:.3,oven:0,board:.2,pass:-.2}[kind]||0)*along:0;
    station={kind,thing,a:thing.a-fb*shift,b:thing.b+fa*shift,face:[fa,fb]};
    break;
  }
  if(station){
    const {thing}=station;
    station.y=station.top ?? (thing ? (thing.y>0 || !thing.solid ? thing.y+(thing.h<.2?thing.h:.02) : TOP[thing.shape] ?? Math.min(thing.h,.95)) : .92);
    station.depth=thing ? (station.face[1]?thing.d:thing.w) : .6;
    // What goes into a cabinet is seen at its door: a tray drawn from the oven, a pie on the lip of the deck.
    const reach=!thing ? 0 : thing.shape==='oven' ? station.depth/2-.14 : ['rackOven','smoker','reachIn','cooler','softServe'].includes(thing.shape) ? station.depth/2+(thing.shape==='softServe'?-.12:.16) : 0;
    if(reach){station.wareAt={a:station.a+station.face[0]*reach,b:station.b+station.face[1]*reach};}
  }
  found.set(kind,station);
  return station;
}
/** The floor a worker stands on to use a station: on the side of it they can walk to, nearest their own post. */
export function standAt(view,station,actor) {
  const aisle=shopAisle(view), [fa,fb]=station.face, reachOut=station.depth/2+.42, home=actor.spot||floorAt(view,actor);
  let best=null, cost=Infinity;
  for(const side of [1,-1]){
    const point={a:station.a+fa*reachOut*side,b:station.b+fb*reachOut*side}, node=aisle.nearest(point);
    if(!node || gap(node,point)>.75 || !aisle.route(floorAt(view,actor),node))continue;
    const score=gap(node,home)+gap(node,point)*2+(side<0 && station.thing?.solid && station.thing.h>1.5?9:0);
    if(score<cost){cost=score;best=node;}
  }
  return best;
}

function setWare(v,station,ware,tone) {
  clearWare(v);
  if(!ware || !station)return;
  v.ware={a:station.wareAt?.a??station.a,b:station.wareAt?.b??station.b,y:station.y,face:station.face};
  v.view.group?.userData.cookAt?.(v.ware,ware,tone);
}
/** Take whatever a visit's cook had on the heat off it. */
export function clearWare(v) {
  if(!v.ware)return;
  v.view.group?.userData.cookAt?.(v.ware,null);v.ware=null;
}
const voice=actor=>actor.spot?.role==='cook' || actor.spot?.role==='deliCook' || actor.spot?.role==='prep' ? 'Chef' : actor.spot?.role==='server' ? 'Server' : 'Counter';

/** One member of staff working an item's steps at the stations of `kinds` (all of them if not given). Returns the last station used. */
export function* workSteps(v,worker,item,{kinds=null,label=voice(worker)}={}) {
  const steps=recipeFor(item,v.room.place.kind)||[], tone=foodTone(item);
  let last=null;
  for(const step of steps){
    if(kinds && !kinds.includes(step.at))continue;
    const station=stationOf(v.view,step.at), phase=label+' · '+step.say;
    if(station){
      const stand=standAt(v.view,station,worker);
      if(stand)yield walking(worker,stand,phase);
      last=station;
    }else if(worker.spot && gap(floorAt(v.view,worker),worker.spot)>.5)yield walking(worker,worker.spot,phase);
    setWare(v,station,step.ware===undefined?WARE[step.at]:step.ware,tone);
    v.cooking=step;
    yield pause(worker,phase,step.secs,station||null,CLIP[step.at]||'reach');
    clearWare(v);
  }
  v.cooking=null;
  return last;
}
/** Whether an item is made behind the counter by whoever serves (a drink, a pastry from the case) and not on the line. */
export function frontOfHouse(item,kind) {
  const steps=recipeFor(item,kind);
  return Boolean(steps?.length) && steps.every(step=>FRONT_OF_HOUSE.includes(step.at) || step.at==='pass');
}

/** Where finished plates wait for a server: { support, approach }. */
export function passOf(view) {
  if(view.pass!==undefined)return view.pass;
  const room=view.plan, planned=room.kitchen?.pass;
  if(planned)return view.pass=planned;
  const station=stationOf(view,'pass'), mark=station||room.things.find(t=>t.shape==='pizza')||stationOf(view,'range')||stationOf(view,'oven');
  if(!mark)return view.pass=null;
  const counter=t=>t.solid && t.y===0 && t.shape!=='table' && (t.shape==='passShelf' || t.h>.73 && t.h<1.3);
  const surfaces=room.things.filter(counter);
  const support=(station?.thing && counter(station.thing) && station.thing) || surfaces.find(t=>Math.abs(t.a-mark.a)<=t.w/2 && Math.abs(t.b-mark.b)<=t.d/2) ||
    surfaces.sort((s,t)=>gap(s,mark)-gap(t,mark))[0];
  if(!support)return view.pass=null;
  const long=Math.max(support.w,support.d), run=Math.min(long,1.5);
  const slots=Array.from({length:Math.max(1,Math.min(3,Math.floor(run/.4)))},(_,i)=>i);
  // Plates go down around the marked spot of a long counter, not all along it.
  const centre=station?.thing===support?{a:station.a,b:station.b}:{a:support.a,b:support.b};
  return view.pass={support,slots,mark,run,centre,top:station?.thing===support && station.top ? station.top : TOP[support.shape] ?? support.h};
}
/** Set a finished dish on the pass, or take it off again. */
export function plateUp(v,item,drink=false) {
  const pass=passOf(v.view);
  if(!pass)return null;
  const {support,slots,run,centre,top}=pass, index=slots.findIndex(slot=>typeof slot==='number');
  if(index<0)return null;
  const wide=support.w>=support.d, t=((index+.5)/slots.length-.5)*.8*run, long=wide?support.w:support.d, mid=wide?support.a:support.b;
  const at=Math.max(mid-long/2+.2,Math.min(mid+long/2-.2,(wide?centre.a:centre.b)+t));
  const portion=slots[index]={a:wide?at:centre.a,b:wide?centre.b:at,y:drink?top:0,h:top,index,drink,temporary:drink};
  if(drink)v.view.group?.userData.drinkAt?.(portion,'mug',true,item);
  else v.view.group?.userData.mealAt?.(portion,true,item);
  return portion;
}
export function clearPlate(v,portion) {
  if(!portion)return;
  const pass=passOf(v.view);
  if(portion.drink)v.view.group?.userData.drinkAt?.(portion,'mug',false);
  else v.view.group?.userData.mealAt?.(portion,false);
  if(pass?.slots[portion.index]===portion)pass.slots[portion.index]=portion.index;
}
/** Where a server stands to lift a plate off the pass. */
export function passApproach(view,portion,actor) {
  const pass=passOf(view);
  if(!pass)return null;
  if(pass.serverSide)return pass.serverSide;
  const {support}=pass, aisle=shopAisle(view);
  // Whichever open side of the pass they can walk to.
  const sides=[[0,-1],[0,1],[1,0],[-1,0]].map(([da,db])=>({a:(portion?.a??support.a)*(da?0:1)+(da?support.a+da*(support.w/2+.44):0),
    b:(portion?.b??support.b)*(db?0:1)+(db?support.b+db*(support.d/2+.44):0)}));
  let best=null, cost=Infinity;
  for(const point of sides){
    const node=aisle.nearest(point);
    if(!node || gap(node,point)>.6 || !aisle.route(floorAt(view,actor),node))continue;
    const score=gap(node,actor.spot||node)+gap(node,point);
    if(score<cost){cost=score;best=node;}
  }
  return best;
}

/**
 * The kitchen's part of a ticket: a cook takes it, makes the dish at the
 * stations its recipe names and sets it on the pass. Returns the portion
 * waiting there (null where the room has no pass and the cook still holds it).
 */
export function* cookDish(v,item,{onFire}={}) {
  const cook=yield* ask(v,'cook');
  if(!cook)return null;
  onFire?.(cook);
  yield* workSteps(v,cook,item);
  const portion=plateUp(v,item);
  if(!portion)return {held:cook};
  done(v);
  return portion;
}

// Between tickets a cook keeps the kitchen going: stock, prep, a clean griddle.
const CHORES=[
  ['board','board','Chopping onions for the line',5.5,'#e9e2c4'],['range','pot','Stirring the stockpot',5,'#b98a4a'],
  ['flat','griddle','Scraping down the flat-top',4,null],['board','board','Portioning for service',5,'#c9785a'],
  ['steam','ladle','Topping up the steam table',4,'#b87940'],['cold','bowl','Restocking the cold station',4,'#7fa860'],
  ['oven','tray','Checking what is in the oven',3.5,'#d9a45a'],['wok','wok','Seasoning the wok',4,null],
  ['fry','basket','Skimming the fryer',3.5,null],['sushi','board','Slicing fish for the case',5,'#e98a6a'],
  ['spit','board','Shaving the spit',4,'#8a4a2a'],['board','bowl','Mixing a batch',5,'#e9dcb4'],
];
/** Idle cooks do the work a kitchen never runs out of. They drop it the moment a ticket comes in. */
export function stepKitchenChores(view,dt) {
  if(!dt || view.closed || view.handoff)return;
  for(const actor of view.actors){
    const role=actor.spot?.role;
    if(role!=='cook' && role!=='deliCook' && role!=='prep')continue;
    const chore=actor.chore;
    if(actor.serviceOwner || actor.requests?.length || actor.escape || actor.gone){
      if(chore){clearWare(chore);actor.chore=null;}
      continue;
    }
    if(actor.returning)continue;
    if(!chore){
      actor.rest=(actor.rest??1+view.random()*4)-dt;
      if(actor.rest>0)continue;
      // Only on the equipment the job is really done at: nobody seasons a wok on a pizza oven.
      const jobs=CHORES.filter(([kind])=>{const shape=stationOf(view,kind)?.thing?.shape, at=EQUIPMENT[kind].indexOf(shape);return at>=0 && at<(kind==='board'||kind==='cold'?4:kind==='range'||kind==='steam'?3:2);});
      if(!jobs.length){actor.rest=30;continue;}
      const [kind,ware,phase,time,tone]=jobs[Math.floor(view.random()*jobs.length)], station=stationOf(view,kind);
      const stand=standAt(view,station,actor);
      if(!stand){actor.rest=6;continue;}
      actor.chore={view,station,ware,tone,phase,time,clip:CLIP[kind]||'reach',trip:walking(actor,stand,phase)};
      continue;
    }
    if(chore.trip){
      if(!reached({view},chore.trip,dt))continue;
      chore.trip=null;
      setWare(chore,chore.station,chore.tone?chore.ware:null,chore.tone);
    }
    const at=floorAt(view,actor);
    if(gap(at,chore.station)>.05)facePoint(view,actor,chore.station);
    actor.clip=chore.clip;actor.stride=0;actor.time=(actor.time||0)+dt;
    chore.time-=dt;
    if(chore.time<=0){
      clearWare(chore);actor.chore=null;actor.clip=null;actor.rest=2+view.random()*5;
      if(gap(at,actor.spot)>.6)actor.returning=true;
    }
  }
}
