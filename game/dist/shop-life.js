import { crossesFixture, roomLocal, roomPoint } from './room.js';
import { stepSeating } from './seating.js';
import { menuFor } from './menu.js';
import { dress, KIT, seeded } from './crowd.js';

export function populateShop(view, tones) {
  const room = view.plan;
  const random = seeded(Math.round(room.x * 7919 + room.z * 104729) >>> 0 || 1);
  const person = (spot, sitting) => {
    const [x, z] = roomPoint(room, spot.a, spot.b);
    const [fx,fz] = roomPoint(room,spot.a+spot.da,spot.b+spot.db);
    const look = dress(spot.treadmill ? 'athletic' : 'casual', random, tones?.(x, z));
    look.kit &= KIT.longHair | KIT.shortSleeves | KIT.woman | (spot.treadmill ? KIT.shorts : 0);
    view.actors.push({ x, z, y: view.floor, lift: spot.lift || 0, sitting, spot, seat: sitting ? spot : null, look,
      heading: Math.atan2(fx-x,fz-z) });
  };
  for (const spot of room.staff) person(spot, false);
  if (room.register) view.clerk=view.actors[room.register.clerk];
  for (const seat of room.seats) {
    // Leave at least one place for the player.
    if (random() < .42 && view.occupied.size < room.seats.length - 1) {
      view.occupied.add(seat); person(seat, true);
    }
  }
  if (room.style === 'gym') {
    const belts = room.things.filter(t => t.shape === 'treadmill');
    const runners = Math.min(2, Math.ceil(belts.length / 4));
    for (let i = 0; i < runners; i++) {
      const belt = belts.splice(Math.floor(random() * belts.length), 1)[0], [fa, fb] = belt.face;
      person({ a: belt.a + .13 * fa, b: belt.b + .13 * fb, da: -fa, db: -fb,
        lift: .265, treadmill: true, cadence: .86 + random() * .23, offset: random() * 3 }, false);
    }
  }
  view.menu = menuFor(room.place);
  view.nextVisit = random() * 5;
  view.random = random;
}

function pathsFromDoor(room, step, radius) {
  const solids = room.things.filter(t => t.solid);
  const queue = [{ a: 0, b: .5, prev: null }], seen = new Set(['0,0.5']);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    for (const [da, db] of [[0,step],[step,0],[-step,0],[0,-step]]) {
      const a = node.a + da, b = node.b + db, key = a + ',' + b;
      if (seen.has(key) || Math.abs(a) > room.width/2-radius || b < radius || b > room.depth-radius) continue;
      const next = {a, b, prev:node};
      if (solids.some(t => crossesFixture(node,next,t,radius))) continue;
      seen.add(key); queue.push(next);
    }
  }
  return queue;
}

export function counterPath(room) {
  let goal, best = Infinity;
  for (const node of pathsFromDoor(room,.5,.25)) {
    for (const staff of room.staff) {
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

// An occupied chair is the one solid the person may step out of. If there is
// no aisle to the door, they take cover where they are.
export function fleeShop(view, actor) {
  if (actor.escape || actor.gone) return;
  const room = view.plan, at = roomLocal(room, actor.x, actor.z), radius = .16;
  view.exits ??= pathsFromDoor(room,.25,radius);
  let nearest, best = 1.5;
  const obstacles = room.things.filter(t => t.solid && !(actor.sitting && t.a === actor.spot.a && t.b === actor.spot.b));
  for (const node of view.exits) {
    const d = Math.hypot(node.a-at.a,node.b-at.b);
    if (d >= best || obstacles.some(t => crossesFixture(at,node,t,radius) && !crossesFixture(at,at,t,radius))) continue;
    nearest=node; best=d;
  }
  actor.escape = [];
  actor.clip = actor.sitting ? null : 'cower'; actor.time = 0;
  if (!nearest) return;
  actor.escape.push({a:0,b:-1.25}, {a:0,b:0});
  const route=[];
  for (let node=nearest; node; node=node.prev) route.push(node);
  actor.escape.push(...route.reverse());
  if (actor.sitting) {
    const [fromX,fromZ]=roomPoint(room,nearest.a,nearest.b);
    actor.seat={...actor.spot,x:actor.x,z:actor.z,y:view.floor,fromX,fromZ,fromY:view.floor,path:{length:0,points:[]},
      fromAngle:actor.heading,turn:0,duration:.68,progress:1,weight:1,leaving:true};
  } else { actor.clip='jog'; actor.stride=1; }
}

export function stepEscape(view, actor, dt, outside) {
  actor.time += dt;
  if (actor.seat?.leaving) {
    const riseTime=actor.seat.progress*actor.seat.duration;
    stepSeating(actor,actor.seat,dt);
    if (actor.seat.progress>0) return;
    dt=Math.max(0,dt-riseTime);
    view.occupied.delete(actor.spot);
    actor.seat=null; actor.sitting=false; actor.lift=0; actor.clip='jog'; actor.stride=1;
  }
  let left = 3.6 * dt;
  while (left > 0 && actor.escape.length) {
    const room=view.plan, node=actor.escape.at(-1), [x,z]=roomPoint(room,node.a,node.b);
    const dx=x-actor.x, dz=z-actor.z, d=Math.hypot(dx,dz), step=Math.min(d,left);
    if (d>.0001) {
      const at=roomLocal(room,actor.x,actor.z);
      actor.heading=Math.atan2(dx,dz); actor.x+=dx/d*step; actor.z+=dz/d*step;
      actor.phase=(actor.phase||0)+step*4.6;
      const next=roomLocal(room,actor.x,actor.z), skew=room.skew||0;
      view.door?.push(at.a+skew*at.b,at.b,next.a+skew*next.b,next.b,.25,dt);
    }
    left-=step;
    if (d>step) break;
    actor.escape.pop();
    if (!actor.escape.length) { actor.gone=true; outside?.(actor); }
  }
}

export function inviteCustomer(view, people, time, sale) {
  if (view.closed || view.handoff || !view.menu.length || time < view.nextVisit || view.visitor?.visit ||
      view.actors.some(actor=>actor.escape && !actor.gone)) return;
  view.nextVisit = time + 2;
  const room = view.plan;
  for (const person of people) {
    if (person.state !== 'walk' || !person.run || person.age < .5 || time < (person.shoppedUntil || 0)) continue;
    const start = roomLocal(room, person.x, person.z);
    if (Number.isFinite(person.y) && Math.abs(person.y - view.floor) > 1.6) continue;
    if (start.b >= -.6 || start.b < -8 || Math.abs(start.a) > room.width / 2) continue;
    if (view.route === undefined) view.route = counterPath(room);
    if (!view.route) return;
    const out = { a: 0, b: Math.min(-1, start.b) };
    const path = [start, out, ...view.route.path];
    const item = view.menu[Math.floor(view.random() * view.menu.length)];
    const visit = { path: [...path, ...path.slice(0,-1).reverse()], at: 1, counter: path.length - 1,
      wait: 0, item, room, view, sale, step: stepCustomer };
    person.visit = visit; person.state = 'shopping'; view.visitor = person;
    view.nextVisit = time + 15 + view.random() * 15;
    return;
  }
}

export function stepCustomer(person, dt, time) {
  const visit = person.visit, { room, view } = visit;
  // Interrupted customers retrace their route without completing a sale.
  if (!visit.interrupted && (view.handoff || view.closed || visit.scared)) {
    visit.interrupted=true;
    if (visit.at<=visit.counter || visit.wait>0) visit.at=visit.path.length-Math.min(visit.at,visit.counter+1);
    visit.wait=0;
  }
  if (visit.wait > 0) {
    visit.wait -= dt;
    if (visit.wait <= 0) visit.sale(room.place, visit.item.price);
    return;
  }
  const point = visit.path[visit.at], [x,z] = roomPoint(room, point.a, point.b);
  const dx = x - person.x, dz = z - person.z, distance = Math.hypot(dx,dz);
  const step = Math.min(distance, dt * (visit.interrupted ? 3.6 : person.look.pace));
  const at = roomLocal(room, person.x, person.z);
  if (distance > .001) {
    person.heading = Math.atan2(dx, dz);
    person.x += dx / distance * step; person.z += dz / distance * step;
    person.phase += step * 4.6;
  }
  const next = roomLocal(room, person.x, person.z);
  const skew = room.skew || 0;
  view.door.push(at.a + skew * at.b, at.b, next.a + skew * next.b, next.b, .29, dt);
  if (next.b > -.6) person.y = view.floor;
  if (distance > step + .001) return;
  if (!visit.interrupted && visit.at === visit.counter) {
    visit.wait = 3 + view.random() * 2;
    const staff = view.route.staff, [sx,sz] = roomPoint(room, staff.a, staff.b);
    person.heading = Math.atan2(sx-person.x, sz-person.z);
  }
  if (++visit.at === visit.path.length) {
    person.state = visit.interrupted ? 'flee' : 'walk'; person.visit = null; person.shoppedUntil = time + 90;
    if (visit.interrupted) person.mad=4;
    view.visitor = null;
  }
}
