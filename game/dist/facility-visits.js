// Customers keep their sidewalk actor and walking route. A visit leases actual
// employees, seats, display cases and equipment until the relevant task ends.
import { foodId,pantryItem,heldFood,diningTable,beverage } from './shopping.js';
import { DOOR, roomPoint, roomLocal, roomUnderFire } from './room.js';
import { floorAt, facePoint, followRoute, peopleInRoom, roomSeatStep, shopAisle, walkingPose } from './room-walk.js';
import { shopStairRoute } from './shop-entrance.js';
import { clearTravel, hasStandingRoom } from './pedestrian-motion.js';
import { servingFor,portionKey } from './food-catalog.js';
import { seatApproach, seatApproachEnd } from './seating.js';
import { cookDish, workSteps, clearPlate, clearWare, passApproach, stepKitchenChores } from './kitchen-line.js';

const serviceStyles={bar:'bar',club:'bar',coffee:'cafe', diner:'restaurant',fine:'restaurant',sushi:'restaurant',steamtable:'restaurant',
  pizza:'restaurant',takeout:'restaurant',halal:'restaurant',jewelry:'jeweler',shoes:'shoes',clothes:'apparel',tech:'phones',music:'music',gym:'gym',barber:'barber',salon:'barber'};
export const serviceMode=room=>room.grocerySlots?'grocer':serviceStyles[room.style];
const entrance={a:0,b:.5};
const dist=(a,b)=>Math.hypot(a.a-b.a,a.b-b.b);
export const walking=(actor,point,phase,path)=>({actor,point,phase,path,at:0});
export const pause=(actor,phase,time,face,clip='reach')=>({actor,phase,time,face,clip});
const ASK_PATIENCE=14, KITCHEN_ROLES=['cook','deliCook','prep'];
const release=actor=>{actor.serviceOwner=null;actor.returning=true;actor.carry=null;actor.clip=null;actor.stride=0;};
function employees(v) {return v.view.actors.filter(a=>v.room.staff.includes(a.spot) && !a.escape && !a.gone);}
export function* ask(v, role='server') {
  const {view}=v;
  const staff=employees(v);
  let employee=staff.find(a=>a.spot.role===role && !a.serviceOwner && !a.requests?.length) || staff.find(a=>a.spot.role===role) || view.clerk || staff[0];
  if(!employee)return null;
  employee.requests??=[];
  employee.requests.push(v); v.request=employee;
  let waited=0;
  while(employee.serviceOwner || employee.requests[0]!==v) {
    yield pause(v.person,'waiting for staff',.22,null,'idle');
    // Nobody waits on one busy member of staff while a colleague stands free.
    if((waited+=.22)<ASK_PATIENCE || employee.escape || employee.gone)continue;
    const free=employees(v).find(a=>a!==employee && !a.serviceOwner && !a.requests?.length && (role==='cook')===KITCHEN_ROLES.includes(a.spot.role));
    waited=0;
    if(!free)continue;
    employee.requests=employee.requests.filter(req=>req!==v);
    employee=free;(employee.requests??=[]).push(v);v.request=employee;
  }
  employee.requests.shift(); v.request=null;
  employee.serviceOwner=v; employee.returning=null; v.employee=employee;return employee;
}
export function done(v) {if(v.employee){release(v.employee);v.employee=null;}}
function freeSeat(v) {
  const occupied=v.playerSeat?.(), aisle=shopAisle(v.view);
  for(const spot of v.room.seats) {
    if(v.mode==='barber' && spot.seatKind!=='lounge' && v.room.seats.some(s=>s.seatKind==='lounge'))continue;
    const [x,z]=roomPoint(v.room,spot.a,spot.b);
    if(v.view.occupied.has(spot) || occupied && Math.hypot(x-occupied.x,z-occupied.z)<.25) continue;
    const [fx,fz]=roomPoint(v.room,spot.a+spot.da,spot.b+spot.db);
    const seat={...spot,x,z,y:v.view.floor,heading:Math.atan2(fx-x,fz-z)};
    const fixture=spot.fixture ?? v.room.things.find(t=>t.solid && t.a===spot.a && t.b===spot.b);
    const table=v.room.things.filter(t=>t.shape==='table' && (t.a-spot.a)*spot.da+(t.b-spot.b)*spot.db>0)
      .sort((a,b)=>dist(a,spot)-dist(b,spot))[0];
    if(v.mode==='restaurant' && (!table || dist(table,spot)>1.65 || v.view.claims.has(table)))continue;
    const clear=(a,b)=>aisle.clear(floorAt(v.view,a),floorAt(v.view,b),.10,fixture);
    const candidates=aisle.nodes.filter(n=>dist(n,spot)<1.05).sort((a,b)=>dist(a,spot)-dist(b,spot));
    for(const node of candidates) {
      const [fromX,fromZ]=roomPoint(v.room,node.a,node.b), path=seatApproach({x:fromX,z:fromZ},seat,clear);
      if(!path)continue;
      v.spot=spot; v.view.occupied.add(spot);
      if(v.mode==='restaurant' || v.mode==='cafe' && table && dist(table,spot)<=1.65 && !v.view.claims.has(table)){v.table=table;v.view.claims.set(table,v);}
      v.seat={...seat,fixture,fromX,fromZ,fromY:v.view.floor,path,progress:0,weight:0,
        duration:Math.max(1.5,3.8*path.length/v.person.look.pace),node};
      return true;
    }
  }
  return false;
}
// An escort or another guest can occupy the originally planned chair approach.
// Check the actual route, then keep its short sweep clear during the animation.
function chairPath(v,from,others) {
  const {view,person,seat}=v, aisle=shopAisle(view);
  const clear=(a,b)=>{
    const dx=b.x-a.x,dz=b.z-a.z,gap=Math.hypot(dx,dz);
    return aisle.clear(floorAt(view,a),floorAt(view,b),.10,seat.fixture) &&
      (!gap || clearTravel(person,dx/gap,dz/gap,gap,others,a.x,a.z)>=gap);
  };
  if(from!==person && !hasStandingRoom({...from,y:view.floor,look:person.look},others))return null;
  return seatApproach(from,seat,clear);
}
function setChairPath(v,from,path) {
  const {seat,person}=v;
  seat.fromX=from.x;seat.fromZ=from.z;seat.path=path;
  const length=path.length+seatApproachEnd(path,seat,from.x,from.z);
  seat.duration=Math.max(1.5,3.8*length/person.look.pace);
  seat.clearance=[];
  let prev=from;
  for(const next of [...path.points,seat]){
    const count=Math.max(1,Math.ceil(Math.hypot(next.x-prev.x,next.z-prev.z)/.12));
    for(let i=0;i<=count;i++)seat.clearance.push({x:prev.x+(next.x-prev.x)*i/count,z:prev.z+(next.z-prev.z)*i/count,y:seat.y,look:person.look});
    prev=next;
  }
}
function openChairApproach(v,others) {
  const {view,person}=v, at=floorAt(view,person);
  const nodes=shopAisle(view).nodes.filter(n=>dist(n,v.spot)<1.1);
  nodes.sort((a,b)=>dist(a,at)-dist(b,at));
  for(const node of nodes){
    const [x,z]=roomPoint(v.room,node.a,node.b),from={x,z};
    const path=chairPath(v,from,others);
    if(path)return {node,from,path};
  }
}
function* sit(v) {
  yield walking(v.person,v.seat.node,'walking to seat');
  for(;;){
    const others=peopleInRoom(v.view,v.person);
    const path=Math.hypot(v.person.x-v.seat.x,v.person.z-v.seat.z)<1.5 && chairPath(v,v.person,others);
    if(path){setChairPath(v,v.person,path);break;}
    const approach=openChairApproach(v,others);
    if(approach)yield walking(v.person,approach.node,'walking to seat');
    else yield pause(v.person,'walking to seat',.35,null,'idle');
    if((v.seatTries=(v.seatTries||0)+1)>40){v.giveUp=true;return;}
  }
  v.seat.fromAngle=v.person.heading;
  v.seat.turn=Math.atan2(Math.sin(v.seat.heading-v.person.heading),Math.cos(v.seat.heading-v.person.heading));
  v.person.sitting=true;v.person.seat=v.seat;v.person.spot=v.spot;
  yield {actor:v.person,phase:'sitting down',seating:v.seat};
  v.seat.clearance=null;
}
function* stand(v) {
  for(;;){
    const approach=openChairApproach(v,peopleInRoom(v.view,v.person));
    if(approach){setChairPath(v,approach.from,approach.path);break;}
    yield pause(v.person,'standing up',.35,null,'idle');
  }
  v.seat.leaving=true;yield {actor:v.person,phase:'standing up',seating:v.seat};
  v.person.sitting=false;v.person.seat=null;v.person.spot=null;
  v.view.occupied.delete(v.spot);v.spot=null;
}
export function sample(v,shape) {return shape && v.room.things.find(t=>t.shape===shape);}
function pay(v) {
  if(!v.paid){v.sale(v.room.place,v.item.price);v.paid=true;}
}
function waitingPoint(v,index) {
  const aisle=shopAisle(v.view), service=v.view.route.path.at(-1);
  const points=v.view.queueSpots??=(()=>{
    const points=[service];
    const nodes=[...aisle.nodes].filter(n=>n.b>.95 && dist(n,service)<4.5);
    nodes.sort((a,b)=>dist(a,service)-dist(b,service));
    for(const n of nodes) if(points.every(p=>dist(p,n)>.83) && points.length<4)points.push(n);
    return points;
  })();
  return points[Math.min(index,points.length-1)];
}
function* queueAtCounter(v) {
  const {view,person}=v;view.queue.push(v);
  let previous=-1;
  while(true) {
    const index=view.queue.indexOf(v);
    if(index!==previous){yield walking(person,waitingPoint(v,index),index?'queuing':'at the counter');previous=index;}
    if(index===0)break;
    yield pause(person,'queuing',.25,view.route.staff,'idle');
  }
}
function leaveQueue(v) {const i=v.view.queue.indexOf(v);if(i>=0)v.view.queue.splice(i,1);}

function* tender(v,employee,phase){
  const person=v.person;
  person.carry='cash';person.time=0;
  yield pause(person,phase,.82,floorAt(v.view,employee),'giveCash');
  person.carry=null;
}
function* cafe(v) {
  const {view,person}=v;
  const dineIn=v.number%2===0 && freeSeat(v);
  yield* queueAtCounter(v);
  const barista=yield* ask(v);
  yield walking(barista,barista.spot,'taking order');
  yield* tender(v,barista,'ordering and paying');pay(v);
  const machine=sample(v,'espresso')||sample(v,'blenders');
  yield* workSteps(v,barista,v.item,{label:'Barista'});
  const kind=servingFor(v.item,dineIn);
  barista.carry=kind;
  // Move both people along opposite sides of the bar to its pickup end.
  const pickup=v.room.things.find(t=>t.more?.pickup)||machine||barista.spot;
  const counter=v.room.things.find(t=>t.solid && t.a===machine?.a && t.d>1);
  const a=counter?.a ?? barista.spot.a;
  yield walking(barista,{a:a-.73,b:pickup.b},'bringing drink to pickup');
  yield walking(person,{a:a+.78,b:pickup.b},'collecting drink');
  facePoint(view,person,floorAt(view,barista));
  yield pause(barista,'handing over drink',.65,floorAt(view,person));
  if(pickup.more?.pickup){
    v.drink={pickup,kind};barista.carry=null;
    view.group?.userData.drinkAt?.(pickup,kind,true,v.item);
    yield pause(person,'picking up drink',.65,pickup);
    view.group?.userData.drinkAt?.(pickup,kind,false);v.drink=null;
  }
  person.carry=kind;done(v);leaveQueue(v);
  if(dineIn) {
    yield* sit(v);
    const duration=6+view.random()*4;
    for(const level of [2,1,0]){
      person.carry=portionKey(kind,level);
      yield pause(person,'drinking',duration*(level===0?.10:.45),null,'idle');
    }
    if(v.table){
      const mug={...v.table,y:v.table.h,temporary:true};
      view.group?.userData.drinkAt?.(mug,kind,true,v.item,0);
      view.cleanups.push({table:v.table,mug,emptyCarry:person.carry,server:null,left:1.4});
      v.table=null;
    }
    person.carry=null;yield* stand(v);
  }
}

function* restaurant(v) {
  // Full tables leave the next party waiting by the entrance. Counter-only
  // footprints serve a takeaway on the same route as other walk-up orders.
  if(!v.view.hasDiningSeat) {yield* retail(v,'counter');return;}
  if(!v.seat){yield* retail(v,'counter');return;}
  const host=yield* ask(v);
  yield walking(host,entrance,'welcoming guest');
  yield pause(host,'seating guest',.6,floorAt(v.view,v.person),'talk');
  const table=v.table;
  const service={a:v.seat.node.a,b:v.seat.node.b};
  // A server reaches the open edge of this guest's table.
  const nearby=shopAisle(v.view).nodes.filter(n=>dist(n,table)<1.45 && dist(n,v.spot)>.56);
  nearby.sort((a,b)=>dist(a,table)-dist(b,table));
  const side=nearby[0]||service;
  const hostMark=nearby.find(n=>dist(n,v.seat.node)>.95 && dist(n,v.spot)>.95)||side;
  yield { ...walking(host,hostMark,'escorting to table'), follower:v.person };
  yield* sit(v);done(v);
  let server=yield* ask(v);
  yield walking(server,side,'approaching guest');
  yield pause(server,'taking table order',1.45,v.spot,'talk');done(v);
  // The kitchen makes it at the stations the dish needs and sets it on the pass.
  const plated=yield* cookDish(v,v.item);
  let from=null;
  if(!plated || plated.held)server=plated?.held || (yield* ask(v));
  else{
    v.portion=plated;
    server=yield* ask(v);
    from=passApproach(v.view,plated,server);
    if(from)yield walking(server,from,'collecting plate');
  }
  clearPortion(v);server.carry=servingFor(v.item,true);
  yield walking(server,side,'serving table');yield pause(server,'setting down plate',.65,table);
  v.view.group?.userData.mealAt?.(table,true,v.item);
  done(v);
  v.person.carry='fork';
  const duration=8+v.view.random()*5;
  for(const level of [2,1,0]){
    if(level<2)v.view.group?.userData.mealRemaining?.(table,v.item,level);
    yield pause(v.person,'eating',duration*(level===0?.10:.45),table,'idle');
  }
  v.person.carry=null;
  server=yield* ask(v);
  yield walking(server,side,'bringing check');
  yield pause(server,'settling check',1.2,v.spot,'talk');pay(v);
  yield* stand(v);
  // Remains unavailable to another party until the server clears the plate.
  v.view.cleanups.push({table,server,left:1.6,emptyCarry:portionKey(servingFor(v.item,true),0),returnTo:from||server.spot});
  server.serviceOwner=table;v.employee=null;v.table=null;
}

function clearPortion(v){
  clearWare(v);
  if(!v.portion)return;
  clearPlate(v,v.portion);v.portion=null;
}

function caseApproach(t,side=1) {
  const [da,db]=t.face||[0,-1];
  return {a:t.a+side*da*(t.w/2+.35),b:t.b+side*db*(t.d/2+.35)};
}
function* jeweler(v) {
  const {view,person}=v;
  const cases=v.room.things.filter(t=>t.shape==='showcase' && t.more?.items==='rings');
  if(!cases.length){yield* retail(v,'counter');return;}
  const pass=v.number%3!==1;
  for(let round=0;round<(pass?1:2);round++) {
    let display;
    while(!(display=cases.find(t=>!view.claims.has(t))))yield pause(person,'browsing collection',.45,null,'idle');
    v.display=display;view.claims.set(display,v);
    yield walking(person,caseApproach(display),'browsing jewelry');
    yield pause(person,'looking at rings',2.0,display,'idle');
    const jeweler=yield* ask(v);
    yield walking(jeweler,caseApproach(display,-1),'joining shopper');
    yield pause(jeweler,'lifting ring from case',.75,display,'pickUp');
    view.group?.userData.sampleAt?.(display,false);jeweler.carry='jewel';
    yield pause(jeweler,'showing ring',2.3,floorAt(view,person));
    if(pass){pay(v);person.carry='jewelBag';}
    else yield pause(jeweler,'returning ring',.85,display);
    if(pass) {
      // The selected piece leaves with the buyer. A replacement comes from stock.
      yield walking(jeweler,jeweler.spot,'packing purchase');
      yield walking(jeweler,caseApproach(display,-1),'replenishing display');
    }
    view.group?.userData.sampleAt?.(display,true);view.claims.delete(display);v.display=null;done(v);
    if(!pass && round===0){
      const other=v.room.things.find(t=>t.shape==='showcase' && t!==display);
      if(other){yield walking(person,caseApproach(other),'browsing watches');yield pause(person,'considering collection',2,other,'idle');}
    }
  }
}

const trainingShapes=['spinBike','treadmill','exerciseMat','reformer','barbellRack','cableStation','dumbbells'];
function* workout(v) {
  const {view,person}=v, machines=v.room.things.filter(t=>trainingShapes.includes(t.shape));
  if(!machines.length)return;
  const fixed=new Set(view.actors.filter(a=>!a.gone).map(a=>a.spot.equipment));
  let machine;
  while(!(machine=machines.find(t=>!view.claims.has(t) && !fixed.has(t)))) {
    if(machines.every(t=>fixed.has(t)))return;
    yield pause(person,'waiting for equipment',.5,null,'idle');
  }
  view.claims.set(machine,v);v.display=machine;
  const [da,db]=machine.face||[0,-1], type=machine.shape;
  const mounted=['spinBike','treadmill','exerciseMat','reformer'].includes(type);
  // Mount from the aisle beside the machine, away from the window and console.
  const side=shopAisle(view).nearest(mounted ?
    {a:machine.a-Math.sign(machine.a||1)*(machine.w/2+.42),b:machine.b+.12} : caseApproach(machine));
  yield walking(person,side,'approaching equipment');
  const position={a:machine.a+da*.16,b:machine.b+db*.16};
  const height={treadmill:.265,exerciseMat:.054,spinBike:.12,reformer:.49}[type]||0;
  if(mounted)yield {actor:person,point:position,path:[position],at:0,phase:'mounting equipment',rise:height};
  const forward=mounted?{a:position.a-da,b:position.b-db}:machine;
  const clip={spinBike:'cycle',treadmill:'jog',exerciseMat:'stretch',reformer:'kneel',cableStation:'rowCable',barbellRack:'rowCable',dumbbells:'curlWeight'}[type]||'reach';
  yield pause(person,'training',7,forward,clip);
  if(mounted)yield {actor:person,point:side,path:[side],at:0,phase:'stepping off equipment',rise:0};
  view.claims.delete(machine);v.display=null;
}

function* groceriesVisit(v){
  const {room,view,person}=v,choices=room.grocerySlots.filter(slot=>!view.claims.has(slot) && !view.shopping?.missing(room.place.id,slot.index));
  if(!choices.length)return;
  const slot=choices[Math.floor(view.random()*choices.length)];
  v.slot=slot;view.claims.set(slot,v);view.shopping?.shopperStock(v,true);
  v.item=view.menu.find(item=>item.product===slot.id);
  yield walking(person,{a:slot.a+slot.da*.67,b:slot.b+slot.db*.67},'browsing groceries');
  yield pause(person,'reading the package',1.8,slot,'idle');
  yield pause(person,'picking from shelf',.7,slot,'pickUp');
  v.collected=true;if(view.shopping)view.shopping.revision++;
  person.carry=slot.id;
  yield* queueAtCounter(v);
  const clerk=yield* ask(v);
  yield walking(clerk,clerk.spot,'at checkout');
  person.carry=null;clerk.carry=slot.id;
  yield pause(clerk,'scanning groceries',1.2,room.register,'pickUp');
  yield* tender(v,clerk,'paying for groceries');
  yield pause(clerk,'returning purchase',.65,floorAt(view,person));
  pay(v);person.carry=slot.id;done(v);leaveQueue(v);
  view.shopping?.shopperStock(v,false);view.claims.delete(slot);v.slot=null;
}
function* retail(v,mode) {
  const {person,view}=v;
  const shapes={shoes:'sneaker',apparel:'shirt',phones:'phone',music:'guitar'};
  const display=v.room.things.find(t=>t.shape===shapes[mode] && t.more?.sku===v.item.sku) || sample(v,shapes[mode]);
  let look;
  if(display) {
    // Stand at the aisle edge of the plinth, regardless of which sample on its top is selected.
    const plinth=v.room.things.find(t=>t.solid && t.y===0 && t.h<=display.y+.08 &&
      Math.abs(t.a-display.a)<=t.w/2 && Math.abs(t.b-display.b)<=t.d/2);
    look=plinth ? {a:plinth.a-Math.sign(plinth.a)*(plinth.w/2+.40),b:display.b} : caseApproach(display);
    yield walking(person,look,'browsing');yield pause(person,'examining display',1.7,display,'idle');
  }
  yield* queueAtCounter(v);
  let worker=yield* ask(v);
  yield walking(worker,worker.spot,'at counter'); yield pause(worker,'speaking with customer',1.3,floorAt(view,person),'talk');
  leaveQueue(v);
  if((mode==='shoes'||mode==='barber') && freeSeat(v)) {
    if(mode==='barber' && view.actors.some(a=>a.spot.role==='barber')){
      done(v);worker=yield* ask(v,'barber');
    }
    if(mode==='shoes')worker.carry='shoebox';
    yield* sit(v);
    const s=v.spot, beside={a:s.a+s.db*.64,b:s.b-s.da*.64};
    const behind={a:s.a-s.da*.74,b:s.b-s.db*.74};
    const workAt=mode==='barber' && shopAisle(view).route(floorAt(view,worker),behind) ? behind : beside;
    yield walking(worker,workAt,mode==='shoes'?'bringing shoes':'beside barber chair');
    yield pause(worker,mode==='shoes'?'fitting shoes':'cutting hair',mode==='shoes'?2.6:5,s,mode==='shoes'?'crouch':'cutHair');
    yield* stand(v);
    if(mode==='shoes')person.carry='shoebox';
  }
  if(mode==='apparel'){
    const fitting=sample(v,'fittingRoom');
    if(fitting){
      yield walking(person,fitting,'at fitting room');yield pause(person,'trying on shirt',2.8,fitting,'idle');
      person.look.top=parseInt((v.item.design?.topColour||display?.color||'#687d73').slice(1),16);person.drawn=-1;
      yield walking(person,caseApproach(fitting),'checking fit');
    }
  }
  if((mode==='phones' || mode==='music') && display){
    yield walking(person,look,'at display');
    yield walking(worker,{a:look.a,b:look.b+.82},'joining demonstration');
    worker.carry=['phone-rose','guitar-mahogany'].includes(v.item.sku)?v.item.sku:v.item.model;
    yield pause(worker,mode==='phones'?'demonstrating handset':'demonstrating guitar',2.2,floorAt(view,person));
    person.carry=worker.carry;worker.carry=null;
    yield pause(person,mode==='phones'?'testing handset':'auditioning guitar',3,floorAt(view,worker),mode==='music'?'strum':'reach');
    person.carry=null;
  }
  if(mode==='counter')yield* workSteps(v,worker,v.item);
  pay(v);done(v);
  if(mode==='counter')person.carry=servingFor(v.item)||'takeout';
  if(mode==='gym')yield* workout(v);
}

function* itinerary(v) {
  const out={a:0,b:Math.min(-1,v.start.b)};
  if(v.mode==='restaurant' && v.view.hasDiningSeat){
    while(!freeSeat(v)){
      if(!v.view.claims.size && !v.playerSeat?.())break;
      yield pause(v.person,'waiting for table',.5,null,'idle');
    }
  }
  const doorwayX=v.start.a*entrance.b/(entrance.b-v.start.b);
  const viaDoor=shopStairRoute(v.room,v.view.entry?.stairs,v.start) ?? (Math.abs(doorwayX)<DOOR/2-.25 ? [] : [out]);
  yield walking(v.person,entrance,'entering',[...viaDoor,entrance]);
  if(v.mode==='bar'){
    yield* queueAtCounter(v);
    const bartender=yield* ask(v);
    yield walking(bartender,bartender.spot,'taking bar order');
    yield* tender(v,bartender,'ordering and paying');pay(v);
    yield* workSteps(v,bartender,v.item,{label:'Bartender'});
    bartender.carry=servingFor(v.item,true);
    yield walking(bartender,bartender.spot,'serving at the bar');
    yield pause(bartender,'handing over drink',.65,floorAt(v.view,v.person));
    v.person.carry=bartender.carry;done(v);leaveQueue(v);
  }
  else if(v.mode==='cafe')yield* cafe(v);
  else if(v.mode==='restaurant')yield* restaurant(v);
  else if(v.mode==='jeweler')yield* jeweler(v);
  else if(v.mode==='grocer')yield* groceriesVisit(v);
  else yield* retail(v,v.mode);
  yield walking(v.person,entrance,'leaving');
  yield walking(v.person,v.start,'back to sidewalk',[...viaDoor.reverse(),v.start]);
}

function move(v,task,dt) {
  const {actor}=task,aisle=shopAisle(v.view);
  if(!task.path) {
    if(dist(floorAt(v.view,actor),task.point)<.015)return true;
    const end=aisle.nearest(task.point);
    task.path=end && aisle.route(floorAt(v.view,actor),end);
    if(!task.path)return false;
  }
  if(actor===v.person){v.path=task.path;v.at=task.at;v.wait=0;}
  const before=floorAt(v.view,actor);
  const distanceToEnd=dist(before,task.point);
  const arrived=followRoute(v.view,actor,task,dt);
  walkingPose(actor,dist(before,floorAt(v.view,actor)),dt);
  if(task.rise!==undefined){
    task.fromLift??=actor.lift||0;task.length??=Math.max(.01,distanceToEnd);
    actor.lift=task.rise+(task.fromLift-task.rise)*Math.min(1,dist(floorAt(v.view,actor),task.point)/task.length);
    actor.y=v.view.floor+actor.lift;
  }
  if(task.follower){
    const follower=task.follower;
    if(!task.trail)task.trail={at:0,path:[]};
    const end=task.trail.path.at(-1);
    if(!end||dist(end,before)>.15)task.trail.path.push(before);
    const at=floorAt(v.view,follower);
    if(dist(at,before)>.62)followRoute(v.view,follower,task.trail,dt);
    walkingPose(follower,dist(at,floorAt(v.view,follower)),dt);
  }
  if(arrived){actor.clip='idle';actor.stride=0;}
  return arrived;
}
// A blocked aisle or a sealed counter never holds a visit for good: after a
// fair try the walker stops where they are and the next step starts from there.
export function reached(v,task,dt) {
  if(move(v,task,dt))return true;
  task.spent=(task.spent||0)+dt;
  if(task.path && task.span===undefined){
    let from=floorAt(v.view,task.actor);task.span=0;
    for(const point of task.path.slice(task.at)){task.span+=dist(from,point);from=point;}
  }
  if(task.spent<(task.path ? 6+3*task.span/(task.actor.look?.pace||1.35) : 1.6))return false;
  task.missed=true;task.actor.clip='idle';task.actor.stride=0;
  return true;
}
// A guest who cannot get to where the visit needs them walks back out.
function bail(v) {
  clearWare(v);
  if(v.bailed){v.person.state='walk';v.person.shoppedUntil=(v.view.lastServiceTime||0)+90;v.detach();v.person.visit=null;return;}
  v.bailed=true;v.task=null;
  const {person}=v;
  if(person.sitting && v.seat){
    v.seat.leaving=true;v.seat.progress=0;person.sitting=false;person.seat=null;person.spot=null;
    v.view.occupied.delete(v.spot);v.spot=null;
  }
  person.carry=null;
  if(v.employee?.serviceOwner===v)done(v);
  if(v.request){v.request.requests=v.request.requests.filter(req=>req!==v);v.request=null;}
  leaveQueue(v);
  v.script=(function*(){
    const at=floorAt(v.view,person),stairs=v.view.entry?.stairs;
    if(at.b>0)yield walking(person,entrance,'leaving');
    const via=shopStairRoute(v.room,stairs,v.start)?.reverse() ?? (at.b>0?[{a:0,b:Math.min(-1,v.start.b)}]:[]);
    yield walking(person,v.start,'back to sidewalk',[...via,v.start]);
  })();
}
function tick(v,dt,time) {
  if(dt<=0)return;
  stepServiceJobs(v.view,time);
  if(v.giveUp && !v.bailed)bail(v);
  const task=v.task??=v.script.next().value;
  if(!task){v.person.state='walk';v.person.shoppedUntil=time+90;v.detach();v.person.visit=null;return;}
  v.phase=task.phase;
  const actor=task.actor;
  if(task.point) {
    v.wait=actor===v.person?0:.1;
    if(!reached(v,task,dt))return;
    if(task.missed && actor===v.person){bail(v);return;}
  } else if(task.seating) {
    v.wait=.1;roomSeatStep(v.view,actor,task.seating,dt);
    if(task.seating.progress!==(task.seating.leaving?0:1))return;
  } else {
    if(task.face)facePoint(v.view,actor,task.face);
    actor.clip=task.clip;actor.stride=0;actor.time=(actor.time||0)+dt;
    v.wait=Math.max(.01,task.time);
    task.time-=dt;if(task.time>0)return;
  }
  v.task=null;
}

function busTable(view,job){
  if(job.mug)view.group?.userData.drinkAt?.(job.mug,'mug',false);
  else view.group?.userData.mealAt?.(job.table,false);
  view.claims.delete(job.table);
}
export function stepServiceJobs(view,time) {
  const dt=Math.max(0,Math.min(.1,time-(view.lastServiceTime??time)));view.lastServiceTime=time;
  if(!dt || !view.cleanups)return;
  const gunfire=roomUnderFire(view,time);
  if(!gunfire)stepKitchenChores(view,dt);
  if(view.closed || view.handoff || gunfire){
    for(const job of view.cleanups){
      busTable(view,job);if(job.server)release(job.server);
    }
    view.cleanups.length=0;return;
  }
  for(const actor of view.actors) {
    if(!actor.returning || actor.serviceOwner || actor.escape || actor.gone)continue;
    if(actor.returning===true)actor.returning=walking(actor,actor.spot,'returning to station');
    if(reached({view},actor.returning,dt)){actor.returning=null;actor.clip=null;facePoint(view,actor,{a:actor.spot.a+actor.spot.da,b:actor.spot.b+actor.spot.db});}
  }
  for(const job of view.cleanups){
    if(!job.server){
      const server=view.actors.find(a=>view.plan.staff.includes(a.spot) && a.spot.role!=='cook' && !a.serviceOwner && !a.requests?.length && !a.gone && !a.escape);
      if(!server)continue;
      const aisle=shopAisle(view),side=aisle.nodes.filter(n=>dist(n,job.table)<1.45)
        .sort((a,b)=>dist(a,job.table)-dist(b,job.table)).find(n=>aisle.route(floorAt(view,server),n));
      if(!side)continue;
      job.server=server;server.serviceOwner=job;server.returning=null;
      job.returnTo=server.spot;job.approach=walking(server,side,'clearing table');
    }
    if(job.approach){
      if(!reached({view},job.approach,dt))continue;
      job.approach=null;
    }
    if(job.cleared){
      job.trip??=walking(job.server,job.returnTo,'returning dishes');
      if(job.server.escape || reached({view},job.trip,dt)){
        job.finished=true;if(!job.server.escape)release(job.server);
      }
      continue;
    }
    if(!job.server.escape){facePoint(view,job.server,job.table);job.server.clip='pickUp';job.server.time=(job.server.time||0)+dt;}
    job.left-=dt;
    if(job.left<=0){
      busTable(view,job);
      job.cleared=true;job.server.carry=job.emptyCarry||'dishes';
      if(job.server.escape){job.server.serviceOwner=null;job.finished=true;}
    }
  }
  view.cleanups=view.cleanups.filter(job=>!job.finished);
}
export function startFacilityVisit(view,person,start,sale,playerSeat,interrupt) {
  const v={person,start,view,room:view.plan,mode:serviceMode(view.plan),playerSeat,sale,phase:'entering',wait:0,path:[start],at:0,number:view.visitNumber++};
  v.item=view.menu[Math.floor(view.random()*view.menu.length)];
  if(v.mode==='cafe' || v.mode==='bar'){
    const drinks=view.menu.filter(beverage);
    if(drinks.length)v.item=drinks[v.number%drinks.length];
  }
  if(v.mode==='jeweler')v.item=view.menu.find(i=>i.model==='ringSample')||v.item;
  if(v.mode==='restaurant'){
    const meals=view.menu.filter(i=>i.effect==='meal');if(meals.length)v.item=meals[v.number%meals.length];
  }
  if(v.mode==='gym')v.item=view.menu[0];
  if(['apparel','shoes','barber','phones','music'].includes(v.mode)){
    const rows=view.menu.filter(item=>item.sku && (v.mode!=='apparel' || item.slot==='top'));
    if(rows.length)v.item=rows[v.number%rows.length];
  }
  v.script=itinerary(v);
  v.bail=()=>bail(v);
  v.detach=(keepSeat=false)=>{
    if(person.carry==='cash')person.carry=null;
    if(v.slot){view.shopping?.shopperStock(v,false);view.claims.delete(v.slot);v.slot=null;}
    if(v.drink){view.group?.userData.drinkAt?.(v.drink.pickup,v.drink.kind,false);v.drink=null;}
    clearPortion(v);leaveQueue(v);if(!keepSeat)view.occupied.delete(v.spot);
    if(v.request)v.request.requests=v.request.requests.filter(req=>req!==v);
    if(v.table){view.claims.delete(v.table);view.group?.userData.mealAt?.(v.table,false);}
    if(v.display){view.claims.delete(v.display);if(v.mode==='jeweler')view.group?.userData.sampleAt?.(v.display,true);}
    if(v.employee?.serviceOwner===v){if(v.employee.escape)v.employee.serviceOwner=null;else release(v.employee);}
    view.visitors.delete(person);view.visitor=view.visitors.values().next().value||null;
  };
  v.step=(p,dt,time,player)=>{
    if(p.escape || v.scared || view.closed || view.handoff) {
      if(!v.interrupted){v.interrupted=true;v.detach(p.sitting);view.visitors.add(p);view.visitor??=p;}
      interrupt(p,dt,time,player);return;
    }
    tick(v,dt,time);
  };
  person.carry=null;person.visit=v;person.state='shopping';view.visitors.add(person);view.visitor??=person;
}

// A player's ticket uses the same staff request queues, paths and workstations as sidewalk guests.
export function startCounterOrder(sim,view,{item,basket=false,sale}){
  const shopping=sim.shopping,room=view?.plan;
  if(!room || shopping.eating || sim.room?.place.id!==room.place.id || !view.clerk || view.closed || view.handoff || shopping.order || sim.player.armed)return false;
  let slot=null,food=null;
  if(!basket){
    if(!item)return false;
    const id=foodId(room.place,item);food=id && pantryItem(id);
    if(!food)return false;
    if(item.product){
      slot=room.grocerySlots.find(s=>s.id===id && !shopping.missing(room.place.id,s.index));
      if(!slot){sim._say('That shelf is sold out.');return false;}
    }
  }else if(shopping.basket?.shop!==room.place.id || !shopping.basket.units.length)return false;
  const price=basket?shopping.total(room.place):item.price;
  const table=diningTable(sim,view);
  if(table && view.claims.has(table)){sim._say('This table is still being served.');return false;}
  const o={shop:room.place.id,room,view,person:sim.player,basket,slot,food,price,table,sale,
    label:basket?'your groceries':food.name,phase:'Waiting for staff',ready:false};
  if(table)view.claims.set(table,o);
  const carry=basket?(shopping.basket.units.length===1?shopping.basket.units[0].id:'takeout'):heldFood(food);
  const drink=Boolean(food && !slot && beverage(food));
  function cashierSpot(worker){
    if(worker===view.clerk)return worker.spot;
    const aisle=shopAisle(view),cashier=floorAt(view,view.clerk);
    const spots=aisle.nodes.filter(n=>dist(n,room.register)<1.35 && dist(n,cashier)>.60);
    spots.sort((a,b)=>dist(a,room.register)-dist(b,room.register));
    return spots.find(n=>aisle.route(floorAt(view,worker),n))||worker.spot;
  }
  function* prepare(){
    let employee=yield* ask(o);
    if(!employee)return;
    if(!basket && !slot){
      const seat=table && tableEdge();
      yield walking(employee,seat||cashierSpot(employee),seat?'Coming to take your order':'At the counter');
      yield pause(employee,'Taking your order',.9,floorAt(view,sim.player),'talk');
      const cook=room.staff.find(s=>!drink && (s.role==='cook'||s.role==='deliCook'));
      if(cook && employee.spot!==cook){done(o);employee=yield* ask(o,cook.role);}
    }
    const kitchen=sample(o,'kitchenRange')||sample(o,'cookline')||sample(o,'oven')||sample(o,'espresso')||sample(o,'grill')||sample(o,'spit')||employee.spot;
    if(slot){
      yield walking(employee,{a:slot.a+slot.da*.59,b:slot.b+slot.db*.59},'Fetching '+food.name);
      yield pause(employee,'Taking item from shelf',.70,slot,'pickUp');
      o.collected=true;shopping.revision++;
    }else if(basket){
      yield walking(employee,employee.spot,'At checkout');
      yield pause(employee,'Scanning groceries',.65+.35*shopping.basket.units.length,room.register,'pickUp');
    }else{
      yield* workSteps(o,employee,item);
    }
    let server=employee;
    if(employee.spot.role==='deliCook' || employee.spot.role==='cook' && room.staff.some(s=>s.role==='server')){
      const pass=sample(o,'plates')||sample(o,'pizza')||kitchen;
      const surfaces=room.things.filter(t=>t.solid && t.y===0 && t.h>.73 && t.h<1.25 && t.shape!=='table');
      const support=surfaces.find(t=>Math.abs(t.a-pass.a)<=t.w/2 && Math.abs(t.b-pass.b)<=t.d/2) ||
        surfaces.sort((a,b)=>dist(a,pass)-dist(b,pass))[0];
      if(support){
        o.portion={a:support.a+.18,b:support.b,y:0,h:support.h,temporary:true};
        if(drink){o.portion.y=support.h;view.group?.userData.drinkAt?.(o.portion,carry,true,food);}
        else view.group?.userData.mealAt?.(o.portion,true,food);
      }
      done(o);server=yield* ask(o);
      const edge=support && support.d>support.w?{a:support.a+Math.sign(-support.a||1)*(support.w/2+.46),b:pass.b}:{a:pass.a,b:pass.b-.74};
      yield walking(server,edge,'Collecting your order');
      clearPass();
    }
    server.carry=carry;
    if(!o.table && !room.grocerySlots){
      const seat=diningTable(sim,view);
      if(seat && !view.claims.has(seat)){o.table=seat;view.claims.set(seat,o);}
    }
    if(o.table){yield* tableDelivery(server);}
    else{
      yield walking(server,cashierSpot(server),'Bringing your order to the counter');
      yield pause(server,'Handing over your order',.70,floorAt(view,sim.player),'reach');
    }
    o.ready=true;o.phase=o.table?'Your order is on the table':o.counterOnly?'Your order is up at the counter':'The clerk is holding your order';
    sim._say(o.phase+'.',5);
  }
  function tableEdge(){
    const at=roomLocal(room,sim.player.x,sim.player.z),nodes=shopAisle(view).nodes.filter(n=>dist(n,at)>.65 && dist(n,o.table)<1.45);
    nodes.sort((a,b)=>dist(a,o.table)-dist(b,o.table));return nodes[0]||at;
  }
  function* tableDelivery(server){
    yield walking(server,tableEdge(),'Bringing your order to the table');
    if(dist(floorAt(view,server),o.table)>2.3){
      // No way through to this table: the order waits at the counter instead.
      view.claims.delete(o.table);o.table=null;o.counterOnly=true;
      yield walking(server,cashierSpot(server),'Bringing your order to the counter');
      return;
    }
    yield pause(server,'Setting down your order',.7,o.table,'reach');
    if(drink){o.drinkSpot={...o.table,y:o.table.h,temporary:true};view.group?.userData.drinkAt?.(o.drinkSpot,'mug',true,food);}
    else view.group?.userData.mealAt?.(o.table,true,food);
    done(o);
  }
  o.deliverToSeat=seat=>{
    o.table=seat;view.claims.set(seat,o);o.ready=false;o.task=null;
    o.script=(function*(){yield* tableDelivery(o.employee);o.ready=true;o.phase=o.table?'Your order is on the table':'Your order is up at the counter';sim._say(o.phase+'.',5);})();
  };
  if(!basket && !slot && !drink)o.pack=()=>{
    if(!o.ready || o.table || o.packed || !o.employee)return;
    o.ready=false;o.task=null;
    o.script=(function*(){
      yield pause(o.employee,'Packing your order to go',1.4,room.register,'pickUp');
      o.employee.carry='takeout';o.packed=true;o.ready=true;o.phase='Your takeaway is ready';
      sim._say('Your takeaway is ready.',5);
    })();
  };
  function clearPass(){
    if(!o.portion)return;
    if(drink)view.group?.userData.drinkAt?.(o.portion,'mug',false);
    else view.group?.userData.mealAt?.(o.portion,false);
    o.portion=null;
  }
  o.release=()=>{
    clearPass();clearWare(o);
    if(o.table){view.claims.delete(o.table);if(o.drinkSpot)view.group?.userData.drinkAt?.(o.drinkSpot,'mug',false);
      else view.group?.userData.mealAt?.(o.table,false);}
    if(o.request)o.request.requests=o.request.requests.filter(req=>req!==o);
    if(o.employee?.serviceOwner===o)done(o);
  };
  o.script=prepare();shopping.order=o;shopping.revision++;return true;
}

export function stepCounterOrder(sim,view,dt){
  const o=sim.shopping.order;if(o?.view!==view || !dt)return;
  if(o.step){o.step(dt);return;}
  if(sim.room?.place.id!==o.shop || view.handoff || view.closed || sim.player.armed || sim.ending || o.employee?.escape || o.employee?.gone ||
     (o.table && diningTable(sim,view)!==o.table)){
    sim.shopping.cancelOrder();return;
  }
  if(o.ready){
    if(o.employee){
      const seat=!o.packed && !o.counterOnly && !o.room.grocerySlots && diningTable(sim,view);
      if(seat && !view.claims.has(seat)){o.deliverToSeat(seat);return;}
      facePoint(view,o.employee,floorAt(view,sim.player));
      if(Math.hypot(sim.player.x-o.employee.x,sim.player.z-o.employee.z)>2.65){
        o.away=(o.away||0)+dt;
        if(o.away>45){sim.shopping.cancelOrder();sim._say('Your uncollected order was canceled.');}
      }else o.away=0;
    }
    return;
  }
  const task=o.task??=o.script.next().value;
  if(!task){if(!o.ready)sim.shopping.cancelOrder();return;}
  o.phase=task.phase;
  if(task.point){if(!reached(o,task,dt))return;}
  else{
    if(task.actor!==sim.player){
      if(task.face)facePoint(view,task.actor,task.face);
      task.actor.clip=task.clip;task.actor.stride=0;task.actor.time=(task.actor.time||0)+dt;
    }
    task.time-=dt;if(task.time>0)return;
  }
  o.task=null;
}
