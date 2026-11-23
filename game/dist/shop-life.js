import { crossesFixture, DOOR, roomLocal, roomPoint, roomUnderFire, walkRoom } from './room.js';
import { receiveImpulse, stepImpulse } from './character-physics.js';
import { pathsFromDoor, peopleInRoom, roomSeatStep, roomWalkStep, shopAisle, yieldShopDoor } from './room-walk.js';
import { clearTravel } from './pedestrian-motion.js';
import { startFacilityVisit, serviceMode, stepServiceJobs } from './facility-visits.js';
import { shopStairRoute } from './shop-entrance.js';
import { seatApproach, seatApproachEnd } from './seating.js';
import { menuFor } from './menu.js';
import { servingFor,portionKey } from './food-catalog.js';
import { dress, KIT, seeded } from './crowd.js';

export function populateShop(view, tones) {
  const room = view.plan;
  const random = seeded(Math.round(room.x * 7919 + room.z * 104729) >>> 0 || 1);
  view.visitors = new Set();
  view.queue = [];
  view.claims = new Map();
  view.cleanups = [];
  view.visitNumber = 0;
  const mode = serviceMode(room);
  const foodService = room.kind === 'eat' || room.kind === 'bar';
  view.menu=menuFor(room.place);
  const servings=foodService?view.menu.map(item=>servingFor(item,true)).filter(Boolean):[];
  const person = (spot, sitting) => {
    const [x, z] = roomPoint(room, spot.a, spot.b);
    const [fx,fz] = roomPoint(room,spot.a+spot.da,spot.b+spot.db);
    const staff = room.staff.includes(spot);
    const look = dress(spot.treadmill ? 'athletic' : staff ? 'staff' : 'casual', random, tones?.(x, z));
    look.kit &= KIT.longHair | KIT.shortSleeves | KIT.woman | (spot.treadmill ? KIT.shorts : 0);
    if (staff) {look.top = foodService ? 0x465448 : 0x5d7082; look.bottom = 0x303239;}
    const carry=sitting && servings.length?servings[view.actors.length%servings.length]:null;
    view.actors.push({ x, z, y: view.floor, carry, lift: spot.lift || 0, sitting, spot, seat: sitting ? spot : null, look,
      heading: Math.atan2(fx-x,fz-z) });
  };
  for (const spot of room.staff) person(spot, false);
  const cook=view.actors.find(actor=>actor.spot.role==='deliCook');
  if(cook)cook.machine=room.things.find(t=>t.shape==='grill');
  const machine = room.style === 'coffee' && room.things.find(t => t.shape === 'espresso');
  if (machine) {
    const barista = view.actors.find(actor => Math.hypot(actor.spot.a-machine.a, actor.spot.b-machine.b) < 1.2);
    if (barista) {
      barista.machine = machine;
      barista.carry = null; // The drink is on the machine's drip tray.
    }
  }
  if (room.register) view.clerk=view.actors[room.register.clerk];
  view.hasDiningSeat = room.seats.some(s=>room.things.some(t=>t.shape==='table' &&
    (t.a-s.a)*s.da+(t.b-s.b)*s.db>0 && Math.hypot(t.a-s.a,t.b-s.b)<1.65));
  for (const seat of room.seats) {
    // Leave at least one place for the player.
    if (!['restaurant','barber','shoes'].includes(mode) && random() < .42 && view.occupied.size < room.seats.length - 1) {
      view.occupied.add(seat); person(seat, true);
    }
  }
  if (room.style === 'gym') {
    const belts = room.things.filter(t => t.shape === 'treadmill');
    const runners = Math.min(2, Math.ceil(belts.length / 4));
    for (let i = 0; i < runners; i++) {
      const belt = belts.splice(Math.floor(random() * belts.length), 1)[0], [fa, fb] = belt.face;
      person({ a: belt.a + .13 * fa, b: belt.b + .13 * fb, da: -fa, db: -fb,
        lift: .265, equipment: belt, treadmill: true, cadence: .86 + random() * .23, offset: random() * 3 }, false);
    }
  }
  view.nextVisit = random() * 5;
  view.random = random;
}

export function counterPath(room, stations=room.staff) {
  let goal, best = Infinity;
  for (const node of pathsFromDoor(room,.5,.25)) {
    for (const staff of stations) {
      const da = node.a - staff.a, db = node.b - staff.b;
      if (da * staff.da + db * staff.db < .6 || Math.hypot(da, db) > 2.5) continue;
      const score = Math.hypot(da - staff.da * 1.45, db - staff.db * 1.45);
      if (score < best) { best = score; goal = { node, staff }; }
    }
  }
  if (!goal) return null;
  const path = [];
  for (let p = goal.node; p; p = p.prev) path.push({ a: p.a, b: p.b });
  return { path: path.reverse(), staff: goal.staff };
}

const BODY_RADIUS = .16;
const SIDEWALK_EXIT = -1.25;

// The witness keeps this even when a fall, a blocked aisle or the doorway
// changes who is moving them. The heading leads along the shop front.
export function fleeShop(view, actor, delay) {
  if (actor.escape || actor.gone || actor.dead || actor.state === 'down') return;
  const room = view.plan, sign = (view.random?.() ?? .5) < .5 ? -1 : 1;
  actor.robbery = { x:room.x, z:room.z, heading:Math.atan2(sign*room.tx, sign*room.tz) };
  delay ??= .12 + (view.random?.() ?? .5) * .78;
  actor.escape = { delay, retry:0, path:null };
  if (actor.visit) actor.carry = null;
  if (actor.sitting && actor.seat?.path) actor.seat.leaving = true;
  actor.clip = actor.sitting ? null : 'cower';
  actor.time = 0; actor.stride = 0; actor.from = null;
  if (!delay) planEscape(view, actor);
}

/** Release a hit actor's seat and keep their injury on the room's floor. */
export function roomOccupantHit(view, actor) {
  if (actor.sitting) view.occupied.delete(actor.visit?.spot ?? actor.spot);
  actor.sitting = false;
  actor.seat = null;
  actor.carry = null;
  actor.lift = 0;
  if (!actor.visit && actor.state === 'down') {
    if (actor.dead) actor.escape = null;
    receiveImpulse(actor,0,0,{fall:true,rest:actor.dead ? Infinity : Math.max(.1,actor.down-2.2)});
  }
}

export function stepRoomInjury(view, actor, dt) {
  if (!actor.reaction) return false;
  const room = view.plan, reaction = actor.reaction;
  stepImpulse(actor,dt,(person,x,z)=>{
    const from=roomLocal(room,person.x,person.z), to=roomLocal(room,x,z);
    const moved=walkRoom(room,from.a,from.b,to.a-from.a,to.b-from.b,.20);
    const [wx,wz]=roomPoint(room,moved.a,Math.max(.08,moved.b));
    return {x:wx,z:wz};
  },()=>view.floor);
  actor.clip = reaction.clip;
  actor.time = reaction.time;
  if (!actor.reaction && !actor.dead) {
    actor.state = 'flee';
    if (actor.escape) actor.escape.path = null;
  }
  return true;
}

function planEscape(view, actor, blocker) {
  const room = view.plan, at = roomLocal(room, actor.x, actor.z), escape = actor.escape;
  const stairs=view.entry?.stairs;
  const exit=stairs ? roomLocal(room,...stairs.point(stairs.toe+.38,0)) : {a:0,b:SIDEWALK_EXIT};
  const turnPoint=stairs?.turn ? roomLocal(room,...stairs.point(0,0)) : null;
  if (at.b <= 0) {
    escape.path = stairs ? [exit] : [{a:at.a, b:Math.min(SIDEWALK_EXIT, at.b)}];
    if(turnPoint && stairs.local(actor.x,actor.z).s<stairs.landing)escape.path.push(turnPoint);
    actor.clip = 'jog'; actor.stride = 1;
    return;
  }
  const solids = room.things.filter(t => t.solid);
  if (blocker) solids.push(blocker);
  // Prefer a landing in the aisle connected to the door. A finer grid also
  // finds narrow staff passages that lie between the quarter-metre samples.
  const nodes = blocker ? pathsFromDoor(room,.25,BODY_RADIUS,solids) :
    (view.exits ??= pathsFromDoor(room,.25,BODY_RADIUS,solids));
  const others=peopleInRoom(view,actor);
  const canLand = node => {
    const [x,z]=roomPoint(room,node.a,node.b), dx=x-actor.x,dz=z-actor.z,d=Math.hypot(dx,dz);
    return (!d || clearTravel(actor,dx/d,dz/d,d,others)>=d) && !solids.some(t => crossesFixture(at,node,t,BODY_RADIUS) &&
      (!crossesFixture(at,at,t,BODY_RADIUS) || crossesFixture(node,node,t,BODY_RADIUS)));
  };
  function landing(nodes) {
    let nearest, best = 1.5;
    for (const node of nodes) {
      const d = Math.hypot(node.a-at.a,node.b-at.b);
      if (d < best && canLand(node)) { nearest = node; best = d; }
    }
    return nearest;
  }
  let nearest = landing(nodes);
  if (!nearest && nodes.length) {
    const fine = blocker ? pathsFromDoor(room,.125,BODY_RADIUS,solids) :
      (view.fineExits ??= pathsFromDoor(room,.125,BODY_RADIUS,solids));
    nearest = landing(fine);
  }
  if (nearest) {
    const route = [];
    for (let node = nearest; node; node = node.prev) route.push(node);
    escape.path = [exit,...(turnPoint?[turnPoint]:[]),{a:0,b:0},...route.reverse()];
  } else {
    escape.retry = .8;
    view.exits = view.fineExits = null;
    if (!actor.sitting && !(actor.spot?.treadmill && actor.lift)) return;
    // A blocked doorway need not keep someone on their chair or machine.
    const floor = [];
    for (let da=-1.5; da<=1.5; da+=.25) for (let db=-1.5; db<=1.5; db+=.25) {
      const a=at.a+da, b=at.b+db;
      if (Math.abs(a)<=room.width/2-BODY_RADIUS && b>=BODY_RADIUS && b<=room.depth-BODY_RADIUS) floor.push({a,b});
    }
    nearest = landing(floor);
    if (!nearest) return;
  }
  const [fromX,fromZ] = roomPoint(room,nearest.a,nearest.b);
  if (actor.sitting) {
    actor.seat = {...actor.spot,x:actor.x,z:actor.z,y:view.floor,fromX,fromZ,fromY:view.floor,
      path:{length:0,points:[]},fromAngle:actor.heading,turn:0,duration:.68,progress:1,weight:1,leaving:true};
  } else if (actor.spot?.treadmill && actor.lift > 0) {
    escape.dismount = {x:actor.x,z:actor.z,toX:fromX,toZ:fromZ,lift:actor.lift,age:0,duration:.55};
    actor.heading = Math.atan2(fromX-actor.x,fromZ-actor.z);
    actor.clip = 'walk'; actor.stride = .6;
  } else {
    actor.clip = 'jog'; actor.stride = 1;
  }
}

// Return true only after physically reaching the outside end of the route.
function advanceEscape(view, actor, dt, player) {
  const escape = actor.escape, room = view.plan;
  if (!actor.visit) actor.time += dt;
  const waiting = Math.min(dt, escape.delay);
  escape.delay -= waiting; dt -= waiting;
  if (!dt) return false;
  const body = player?.mode === 'walk' && Math.abs(player.y-view.floor) < 1.6 ?
    {...roomLocal(room,player.x,player.z),w:.42,d:.42} : null;
  if (!escape.path && !actor.seat?.leaving && !escape.dismount) {
    escape.retry -= dt;
    if (escape.retry > 0) return false;
    planEscape(view,actor,escape.blocked && body);
  }
  if (actor.seat?.leaving) {
    const riseTime = actor.seat.progress*actor.seat.duration;
    if(!roomSeatStep(view,actor,actor.seat,dt))return false;
    if (actor.seat.progress>0) return false;
    dt = Math.max(0,dt-riseTime);
    view.occupied.delete(actor.spot);
    if (actor.visit) { actor.visit.spot = null; actor.spot = null; }
    actor.seat = null; actor.sitting = false; actor.lift = 0; actor.clip = 'jog'; actor.stride = 1;
  }
  const off = escape.dismount;
  if (off) {
    const step = Math.min(dt,off.duration-off.age);
    const t = (off.age+step)/off.duration;
    const dx=off.x+(off.toX-off.x)*t-actor.x, dz=off.z+(off.toZ-off.z)*t-actor.z,d=Math.hypot(dx,dz);
    if(d && clearTravel(actor,dx/d,dz/d,d,peopleInRoom(view,actor))<d)return false;
    off.age += step; dt -= step;
    actor.x = off.x+(off.toX-off.x)*t; actor.z = off.z+(off.toZ-off.z)*t;
    actor.lift = off.lift*(1-t); actor.y = view.floor+actor.lift;
    if (t < 1) return false;
    escape.dismount = null; actor.clip = 'jog'; actor.stride = 1;
  }
  if (!escape.path) {
    if (!actor.sitting) actor.clip = 'cower';
    actor.stride = 0;
    return false;
  }
  const budget = 3.6 * dt;
  let left = budget;
  while (left > 0 && escape.path.length) {
    // After sidestepping another witness, aim at the farthest visible point.
    // Requiring everyone to touch the same aisle mark can deadlock a queue.
    const at = roomLocal(room,actor.x,actor.z);
    for (let i = 0; i < escape.path.length - 1; i++) {
      const target = escape.path[i];
      if(view.entry?.stairs && target.b<0)continue;
      if (at.b > 0 && target.b <= 0) {
        const crossing = at.a + (target.a - at.a) * at.b / (at.b - target.b);
        if (Math.abs(crossing) > DOOR / 2 - BODY_RADIUS) continue;
      }
      if (body && crossesFixture(at,target,body,BODY_RADIUS)) continue;
      if (room.things.some(t => t.solid && crossesFixture(at,target,t,BODY_RADIUS))) continue;
      escape.path.length = i + 1;
      break;
    }
    const node = escape.path.at(-1), [x,z] = roomPoint(room,node.a,node.b);
    const dx = x-actor.x, dz = z-actor.z, d = Math.hypot(dx,dz), step = Math.min(d,left);
    if (d > .0001) {
      const next = roomLocal(room,actor.x+dx/d*step,actor.z+dz/d*step);
      const obstructs = t => crossesFixture(at,next,t,BODY_RADIUS) && !crossesFixture(at,at,t,BODY_RADIUS);
      if ((body && obstructs(body)) || room.things.some(t => t.solid && obstructs(t))) {
        escape.path = null; escape.retry = .3; escape.blocked = true; view.exits = view.fineExits = null;
        actor.clip = 'cower'; actor.stride = 0;
        return false;
      }
      const walked = roomWalkStep(view,actor,x,z,step,undefined,null,body,dt);
      const actual = roomLocal(room,actor.x,actor.z);
      const skew = room.skew || 0;
      view.door?.push(at.a+skew*at.b,at.b,actual.a+skew*actual.b,actual.b,.25,dt);
      if (!view.entry?.stairs && actual.b <= SIDEWALK_EXIT) return true;
      left -= walked;
      if (Math.hypot(actor.x-x,actor.z-z)>.0001) break;
    }
    escape.path.pop();
  }
  if (!actor.visit && dt > 0) {
    const speed = (budget-left)/dt;
    actor.clip = speed > .15 ? 'jog' : 'cower';
    actor.stride = Math.min(1,speed/3.6);
    if (actor.clip === 'jog') actor.time += dt*(speed/3.5-1);
  }
  return !escape.path.length;
}

export function stepEscape(view, actor, dt, outside, player) {
  if (actor.gone || !advanceEscape(view,actor,dt,player)) return false;
  actor.gone = true;
  outside?.(actor);
  return true;
}

export function inviteCustomer(view, people, time, sale, playerSeat = () => null) {
  stepServiceJobs(view,time);
  const mode=serviceMode(view.plan);
  const capacity=mode ? Math.max(2,Math.min(4,Math.floor(view.plan.width*view.plan.depth/19))) : 1;
  if (view.closed || view.handoff || roomUnderFire(view,time) || !view.menu.length || time < view.nextVisit ||
      (mode ? view.visitors.size>=capacity : view.visitor?.visit) ||
      view.actors.some(actor=>actor.escape && !actor.gone)) return;
  view.nextVisit = time + 2;
  const room = view.plan;
  for (const person of people) {
    const trip=person.driverCar?.errand;
    if (trip && (trip.phase!=='waiting' || trip.shop.id!==view.plan.place.id)) continue;
    if (person.state !== 'walk' || (!person.run && !trip) || person.age < .5 || time < (person.shoppedUntil || 0)) continue;
    const start = roomLocal(room, person.x, person.z);
    const street=view.entry?.stairs && view.groundAt ? view.groundAt(person.x,person.z) : view.floor;
    if (Number.isFinite(person.y) && Math.abs(person.y - street) > 1.6) continue;
    if (start.b >= -.6 || start.b < -8 || Math.abs(start.a) > room.width / 2) continue;
    if (view.route === undefined) view.route = counterPath(room,mode==='barber' && view.clerk ? [view.clerk.spot] : room.staff);
    if (!view.route) {
      if (!mode) return;
      const goal=shopAisle(view).nearest(room.staff[0]);
      if (!goal) return;
      view.route={staff:room.staff[0],path:[goal]};
    }
    if (mode) {
      startFacilityVisit(view,person,start,sale,playerSeat,interruptService);
      view.nextVisit=time+2.2+view.random()*1.8;
      return;
    }
    const out = { a: 0, b: Math.min(-1, start.b) };
    const path = [start, ...(shopStairRoute(room,view.entry?.stairs,start)??[out]), ...view.route.path];
    const item = view.menu[Math.floor(view.random() * view.menu.length)];
    const visit = { path: [...path, ...path.slice(0,-1).reverse()], at: 1, counter: path.length - 1,
      wait: 0, item, room, view, sale, playerSeat, step: stepCustomer };
    person.visit = visit; person.state = 'shopping'; view.visitor = person;
    view.nextVisit = time + 15 + view.random() * 15;
    return;
  }
}

function interruptService(person,dt,time,player) {
  const visit=person.visit, view=visit.view;
  if(!person.escape) fleeShop(view,person);
  visit.wait=0;
  if(advanceEscape(view,person,dt,player)){
    visit.detach();person.visit=null;person.escape=null;person.state='flee';person.run=null;
  }
}

// Join the counter and a free seat through their common aisle. Save the
// reverse route before sitting so the very same shopper walks out afterwards.
function reserveTable(person) {
  const visit = person.visit, {room,view} = visit;
  if (!person.carry || !['eat','bar'].includes(room.kind)) return;
  const nodes = view.diningAisles ??= pathsFromDoor(room,.5,.25);
  const occupied = visit.playerSeat?.();
  for (const spot of room.seats) {
    const [x,z] = roomPoint(room,spot.a,spot.b);
    if (view.occupied.has(spot) || occupied && Math.hypot(x-occupied.x,z-occupied.z)<.2) continue;
    const [fx,fz] = roomPoint(room,spot.a+spot.da,spot.b+spot.db);
    const seat = {...spot,x,z,y:view.floor,heading:Math.atan2(fx-x,fz-z)};
    const others = room.things.filter(t=>t.solid && (spot.fixture ? t!==spot.fixture : !(t.a===spot.a && t.b===spot.b)));
    const clear = (from,to) => {
      const a=roomLocal(room,from.x,from.z), b=roomLocal(room,to.x,to.z);
      return Math.abs(b.a)<room.width/2-.1 && b.b>.1 && b.b<room.depth-.1 && !others.some(t=>crossesFixture(a,b,t,.10));
    };
    const near = nodes.filter(n=>Math.hypot(n.a-spot.a,n.b-spot.b)<1.15)
      .sort((a,b)=>Math.hypot(a.a-spot.a,a.b-spot.b)-Math.hypot(b.a-spot.a,b.b-spot.b));
    for (const node of near) {
      const [fromX,fromZ]=roomPoint(room,node.a,node.b);
      const path=seatApproach({x:fromX,z:fromZ},seat,clear);
      if (!path) continue;
      const aisle=[];
      for (let n=node;n;n=n.prev) aisle.push(n);
      aisle.reverse();
      const counter=view.route.path;
      let shared=0;
      while (shared+1<Math.min(counter.length,aisle.length) &&
        counter[shared+1].a===aisle[shared+1].a && counter[shared+1].b===aisle[shared+1].b) shared++;
      const there=[...counter.slice(shared,-1).reverse(),...aisle.slice(shared+1)];
      if (!there.length) there.push(node);
      const back=[...there.slice(0,-1).reverse(),counter.at(-1)];
      visit.path.splice(visit.at,0,...there,...back);
      visit.chairAt=visit.at+there.length-1;
      // The approach takes the first 40% of the easing curve. Bound its
      // peak speed even if they turn back halfway through taking the seat.
      const length = path.length+seatApproachEnd(path,seat,fromX,fromZ);
      const duration = Math.max(.8+length*.42, 3.75*length/person.look.pace);
      visit.table={...seat,fromX,fromZ,fromY:view.floor,path,progress:0,weight:0,duration};
      visit.spot=spot;
      view.occupied.add(spot);
      return;
    }
  }
}

export function stepCustomer(person, dt, time, player) {
  const visit = person.visit, { room, view } = visit;
  if (view.handoff || view.closed || visit.table && visit.scared) fleeShop(view,person);
  if (person.escape && visit.spot && !person.sitting) {
    view.occupied.delete(visit.spot);
    visit.spot = null;
  }
  if (person.robbery) {
    visit.wait = 0;
    if (advanceEscape(view,person,dt,player)) {
      person.visit = null; view.visitor = null; person.escape = null;
      person.state = 'flee'; person.run = null;
    }
    return;
  }
  // A fright on an ordinary shopping trip sends them back the way they came.
  if (!visit.interrupted && visit.scared) {
    visit.interrupted=true;
    if (visit.at<=visit.counter || visit.wait>0) visit.at=visit.path.length-Math.min(visit.at,visit.counter+1);
    visit.wait=0;
  }
  if (person.sitting) {
    const seat=person.seat;
    if (seat.progress===1 && !seat.leaving) {
      visit.mealDuration??=visit.mealTime;
      visit.mealTime-=dt;
      const serving=visit.item.product||servingFor(visit.item,true);
      if(serving)person.carry=portionKey(serving,visit.mealTime<.7?0:visit.mealTime<visit.mealDuration*.5?1:2);
      seat.leaving=visit.mealTime<=0;
    }
    roomSeatStep(view,person,seat,dt);
    if (seat.leaving && seat.progress===0) {
      view.occupied.delete(visit.spot);
      person.sitting=false;person.seat=null;person.spot=null;visit.spot=null;
    }
    return;
  }
  if (visit.wait > 0) {
    visit.wait -= dt;
    if (visit.wait <= 0) {
      visit.sale(room.place, visit.item.price);
      person.carry=visit.item.product||servingFor(visit.item);
      reserveTable(person);
    }
    return;
  }
  const point = visit.path[visit.at], [x,z] = roomPoint(room, point.a, point.b);
  if(!visit.interrupted && visit.at<visit.counter && yieldShopDoor(view,person,dt))return;
  const dx = x - person.x, dz = z - person.z, distance = Math.hypot(dx,dz);
  const step = Math.min(distance, dt * (visit.interrupted ? 3.6 : person.look.pace));
  const at = roomLocal(room, person.x, person.z);
  if (distance > .001) {
    roomWalkStep(view,person,x,z,step,undefined,null,null,dt);
  }
  const next = roomLocal(room, person.x, person.z);
  const skew = room.skew || 0;
  view.door.push(at.a + skew * at.b, at.b, next.a + skew * next.b, next.b, .29, dt);
  const lastMark = visit.at===visit.path.length-1 || visit.at===visit.chairAt;
  if (Math.hypot(x-person.x,z-person.z)>(lastMark ? .001 : .035)) return;
  if (!visit.interrupted && visit.at === visit.counter) {
    visit.wait = 3 + view.random() * 2;
    const staff = view.route.staff, [sx,sz] = roomPoint(room, staff.a, staff.b);
    person.heading = Math.atan2(sx-person.x, sz-person.z);
  }
  if (!visit.interrupted && visit.at===visit.chairAt) {
    const seat=visit.table;
    seat.fromAngle=person.heading;
    seat.turn=Math.atan2(Math.sin(seat.heading-person.heading),Math.cos(seat.heading-person.heading));
    person.sitting=true;person.seat=seat;person.spot=visit.spot;
    visit.mealTime=5+view.random()*6;
  }
  if (++visit.at === visit.path.length) {
    person.state = visit.interrupted ? 'flee' : 'walk'; person.visit = null; person.shoppedUntil = time + 90;
    if (visit.interrupted) person.mad=4;
    view.visitor = null;
  }
}
