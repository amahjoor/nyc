import { fixtureShotCover, roomFixturePanes } from './room-glass.js';

// Moving about a room laid out by interiors.js: no drawing here, so the simulation can use it.
/** The width of a room's door, in metres. */
export const DOOR = 1.1;
export const CEILING = 3.1;
export const WINDOW_SILL = .64, WINDOW_HEAD = 2.27;

/** Where a point of the room is in the world: (a, b) to [x, z]. */
export const roomPoint = (room, a, b) => [room.x + room.tx * (a + (room.skew || 0) * b) - room.nx * b, room.z + room.tz * (a + (room.skew || 0) * b) - room.nz * b];

/**
 * Move someone of `radius` about the room: from (a, b) by (da, db), kept
 * within the walls and out of the furniture. `out` is true when they have
 * walked out through the door.
 */
export function walkRoom(room, a, b, da, db, radius = .35) {
  let na = a + da, nb = b + db;
  if (nb < radius && Math.abs(na) < DOOR / 2 && db < 0) return { a: na, b: nb, out: nb < .05 };
  const half = room.width / 2 - radius;
  na = Math.max(-half, Math.min(half, na)); nb = Math.max(radius, Math.min(room.depth - radius, nb));
  for (let pass = 0; pass < 2; pass++) for (const thing of room.things) {
    if (!thing.solid) continue;
    const pa = thing.w / 2 + radius - Math.abs(na - thing.a), pb = thing.d / 2 + radius - Math.abs(nb - thing.b);
    if (pa <= 0 || pb <= 0) continue;
    // Out by the shorter way.
    if (pa < pb) na += Math.sign(na - thing.a || 1) * pa; else nb += Math.sign(nb - thing.b || 1) * pb;
  }
  return { a: na, b: nb, out: false };
}

export function roomLocal(room, x, z) {
  const dx = x - room.x, dz = z - room.z;
  const b = -dx * room.nx - dz * room.nz;
  return { a: dx * room.tx + dz * room.tz - (room.skew || 0) * b, b };
}

/** Keep both the door's swing and the first part of the indoor aisle clear. */
export function blocksShopEntry(room, fixture) {
  const near = Math.max(0, fixture.b-fixture.d/2), far = Math.min(1.55, fixture.b+fixture.d/2);
  if (near >= far) return false;
  const skew = room.skew || 0, clearance = DOOR/2+.10;
  const left = fixture.a-fixture.w/2+Math.min(0,skew*near,skew*far);
  const right = fixture.a+fixture.w/2+Math.max(0,skew*near,skew*far);
  return left < clearance && right > -clearance;
}

// Segment against the footprint of a room fixture, optionally widened for a walking body.
export function crossesFixture(at, to, fixture, padding = 0) {
  return Number.isFinite(segmentEntry(at, to, fixture, [['a', 'w'], ['b', 'd']], padding));
}

function segmentEntry(at, to, box, axes, padding = 0) {
  let low = 0, high = 1;
  for (const [axis, size] of axes) {
    const delta = to[axis] - at[axis], offset = box[axis] - at[axis], half = box[size] / 2 + padding;
    if (Math.abs(delta) < .00001) {
      if (Math.abs(offset) > half) return Infinity;
    } else {
      const u = (offset - half) / delta, v = (offset + half) / delta;
      low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v));
    }
  }
  return low <= high ? low : Infinity;
}

const sightAxes = [['a', 'w'], ['b', 'd'], ['y', 'h']];

function fixtureEntry(room, at, target, projectile = false) {
  let first = Infinity;
  const cover = projectile ? room.things.flatMap(fixtureShotCover) : room.things.filter(t=>t.solid);
  for (const thing of cover) {
    if (thing.h > 0) {
      first = Math.min(first, segmentEntry(at,target,{...thing,y:(thing.y || 0)+thing.h/2},sightAxes));
    }
  }
  return first;
}

/** Distance along a ray to a wall, floor, ceiling or solid fixture in a room. */
export function roomRayDistance(room, origin, direction, range) {
  const at = {...roomLocal(room,origin.x,origin.z),y:origin.y-room.floor};
  const target = {...roomLocal(room,origin.x+direction.x*range,origin.z+direction.z*range),
    y:origin.y+direction.y*range-room.floor};
  let stop = 1;
  for (const [axis,low,high] of [['a',-room.width/2,room.width/2],['b',0,room.depth],['y',0,CEILING]]) {
    const from = at[axis], to = target[axis];
    if (from<low || from>high) return 0;
    if (to<low || to>high) stop=Math.min(stop,((to<low ? low : high)-from)/(to-from));
  }
  return range*Math.min(stop,fixtureEntry(room,at,target));
}

export function shopWindowPanes(room) {
  const half = room.width/2;
  return [-1,1].flatMap(side => {
    const panes = [], front = (edge,start,end) => panes.push({
      id:`front:${side}${edge}`,a0:side*start,b0:.04,a1:side*end,b1:.04,
    });
    const mullion = (half+.48)/2;
    if (half>3) front(':inner',.7,mullion-.025);
    front('',half>3 ? mullion+.025 : .7,half-.22);
    const length = room.returns?.find(edge => edge.side === side)?.length;
    if (length > .49) for (const [edge,b0,b1] of [['',.22,length/2-.025],[':rear',length/2+.025,length-.22]])
      panes.push({id:`side:${side}${edge}`,a0:side*half,b0,a1:side*half,b1});
    return panes;
  });
}

/** Bound a shot to the furnished room and identify any windows at its ends. */
export function roomShotSpan(view, origin, direction, range) {
  const room = view.plan;
  const at = {...roomLocal(room,origin.x,origin.z),y:origin.y-view.floor};
  const ahead = roomLocal(room,origin.x+direction.x,origin.z+direction.z);
  const da = ahead.a-at.a, db = ahead.b-at.b, dy = direction.y;
  const half = room.width/2;
  let start = 0, end = range, enter = null, exit = null;
  for (const [axis,low,high,speed] of [['a',-half,half,da],['b',0,room.depth,db],['y',0,CEILING,dy]]) {
    const from = at[axis];
    if (Math.abs(speed)<1e-8) {
      if (from<low || from>high) return null;
      continue;
    }
    const near = speed>0 ? low : high, far = speed>0 ? high : low;
    const i = (near-from)/speed, j = (far-from)/speed;
    if (i>=start) {start=i;enter={axis,edge:near,speed};}
    if (j<=end) {end=j;exit={axis,edge:far,speed};}
    if (start>=end) return null;
  }
  const along = distance => ({a:at.a+da*distance,b:at.b+db*distance,y:at.y+dy*distance});
  const portal = (edge, distance) => {
    if (!edge || edge.axis==='y') return null;
    const {a,b,y} = along(distance);
    const front = edge.axis==='b';
    if (front && edge.edge!==0) return null;
    if (front && Math.abs(a)<DOOR/2 && y>=0 && y<2.22)
      return {id:null,distance,grace:Math.min(.75,.09/Math.abs(db)),view};
    if (y<=WINDOW_SILL || y>=WINDOW_HEAD) return null;
    for (const pane of shopWindowPanes(room)) {
      if (front && pane.b0===pane.b1 && a>Math.min(pane.a0,pane.a1) && a<Math.max(pane.a0,pane.a1))
        return {id:pane.id,distance,grace:Math.min(.75,.09/Math.abs(db)),view};
      if (!front && pane.a0===edge.edge && pane.a0===pane.a1 && b>pane.b0 && b<pane.b1)
        return {id:pane.id,distance,grace:Math.min(.75,.09/Math.abs(da)),view};
    }
    return null;
  };
  const from = along(start), to = along(end), fixture = fixtureEntry(room,from,to,true);
  const panes = roomFixturePanes(room).flatMap(({id,quad})=>{
    const t = paneEntry(quad,from,to);
    return Number.isFinite(t) ? [{id,view,distance:start+t*(end-start)}] : [];
  }).sort((a,b)=>a.distance-b.distance);
  return {start,end,view,enter:portal(enter,start),exit:portal(exit,end),startsInside:!enter,
    wall:Boolean(exit),panes,fixture:Number.isFinite(fixture) ? start+(end-start)*fixture : Infinity};
}

// Fixture panes are rectangles parallel to two of the room's local axes.
function paneEntry(quad, from, to) {
  const axes = ['a','b','y'];
  const normal = axes.findIndex((axis,i)=>quad.every(point=>Math.abs(point[i]-quad[0][i])<1e-7));
  if (normal<0) return Infinity;
  const axis = axes[normal], delta = to[axis]-from[axis];
  if (Math.abs(delta)<1e-8) return Infinity;
  const t = (quad[0][normal]-from[axis])/delta;
  if (t<0 || t>1) return Infinity;
  for (const [i,key] of axes.entries()) {
    if (i===normal) continue;
    const at = from[key]+(to[key]-from[key])*t, limits = quad.map(point=>point[i]);
    if (at<Math.min(...limits) || at>Math.max(...limits)) return Infinity;
  }
  return t;
}

/** The moving leaf shares the rendered hinge, rails, glass and handle. */
export function shopDoorShot(view, origin, ray, range) {
  const room = view.plan, at = roomLocal(room,origin.x,origin.z);
  const skew = room.skew || 0;
  const u = at.a+skew*at.b+DOOR/2, v = at.b;
  const du = ray.x*room.tx+ray.z*room.tz, dv = -ray.x*room.nx-ray.z*room.nz;
  const angle = view.door?.angle ?? 0, cos = Math.cos(angle), sin = Math.sin(angle);
  const speed = dv*cos-du*sin;
  if (Math.abs(speed)<1e-8) return null;
  const distance = (u*sin-v*cos)/speed;
  if (distance<0 || distance>range) return null;
  const along = (u+du*distance)*cos+(v+dv*distance)*sin, y = origin.y-view.floor+ray.y*distance;
  if (along<0 || along>DOOR || y<0 || y>2.18) return null;
  const glass = along>.052 && along<DOOR-.052 && y>.21 && y<2.11 &&
    !(Math.abs(along-(DOOR-.13))<.018 && Math.abs(y-1.05)<.135);
  return {id:glass ? 'door' : null,distance,view};
}

/** Actors still inside this room, including visitors borrowed from the street crowd. */
export function roomOccupants(view) {
  if (!view) return [];
  return [...new Set([...(view.actors || []),...(view.visitors || []),view.visitor])]
    .filter(actor=>actor && !actor.gone && roomLocal(view.plan,actor.x,actor.z).b>0);
}

export function roomUnderFire(view, time) {
  const age = time - (view?.gunfireAt ?? -Infinity);
  return age >= 0 && age < 10;
}

/** A clear line between two occupants, accounting for the height of cover. */
export function roomHasSight(view, from, to, fromHeight = 1.42, toHeight = 1.15) {
  const {plan, floor} = view;
  const at = {...roomLocal(plan,from.x,from.z), y:(from.y ?? floor) - floor + fromHeight};
  const target = {...roomLocal(plan,to.x,to.z), y:(to.y ?? floor) - floor + toHeight};
  return !Number.isFinite(fixtureEntry(plan,at,target));
}

// A two-way hinge with a damped closer. Resolve disk contact against the
// swinging leaf by turning it around the hinge, preserving the walker's step.
export class ShopDoor {
  angle = 0;
  velocity = 0;
  step(dt) {
    for (let remaining = Math.min(dt, .12); remaining > 0; remaining -= 1 / 120) {
      const h = Math.min(remaining, 1 / 120);
      this.velocity += (-8 * this.angle - 3.8 * this.velocity) * h;
      this.angle += this.velocity * h;
      if (Math.abs(this.angle) > 1.65) {
        this.angle = Math.sign(this.angle) * 1.65;
        this.velocity *= -.18;
      }
    }
  }
  push(a, b, nextA, nextB, radius, dt) {
    const x = nextA + DOOR / 2, r = Math.hypot(x, nextB);
    if (r > DOOR + radius || x <= 0 || !dt) return;
    const sin = Math.sin(this.angle), cos = Math.cos(this.angle);
    const along = x * cos + nextB * sin;
    if (along < 0 || along > DOOR + radius) return;
    const before = b * cos - (a + DOOR / 2) * sin;
    const side = Math.sign(before) || -Math.sign(nextB - b) || 1;
    const clearance = side * (nextB * cos - x * sin);
    if (clearance >= radius) return;
    const contact = Math.atan2(nextB, x) - side * Math.asin(Math.min(.99, radius / Math.max(radius, r)));
    const angle = Math.max(-1.65, Math.min(1.65, contact));
    const change = angle - this.angle;
    if (change * side >= 0) return;
    this.pushed=true;
    this.angle = angle;
    const impulse = Math.min(4, Math.abs(change) / dt);
    this.velocity = -side * Math.max(-side * this.velocity, impulse);
  }
}
