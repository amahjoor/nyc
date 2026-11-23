import { roomOccupants, roomShotSpan, shopDoorShot } from './room.js';

// March against the same height-aware collision data used on the street.
export function shotObstruction(origin, direction, range, blocked, step = .2) {
  const at = distance => blocked(origin.x + direction.x * distance,
    origin.y + direction.y * distance, origin.z + direction.z * distance);
  for (let clear = 0; clear < range;) {
    let solid = Math.min(clear + step, range);
    if (!at(solid)) { clear = solid; continue; }
    for (let i = 0; i < 5; i++) {
      const middle = (clear + solid) / 2;
      if (at(middle)) solid = middle;
      else clear = middle;
    }
    return solid;
  }
  return range;
}

// Intersect a standing actor's cylinder. The horizontal and vertical tests
// each give an interval along the same 3D ray, including a straight-down shot.
function actorDistance(origin, direction, actor, radius, range) {
  const x = origin.x - actor.x - (actor.shove?.[0] || 0);
  const z = origin.z - actor.z - (actor.shove?.[1] || 0);
  const floor = (actor.y || 0) + (actor.rideLift || 0);
  const top = floor + (actor.look?.height || actor.height || 1.76);
  let enter = .03, exit = range;
  const horizontal = direction.x ** 2 + direction.z ** 2;
  const radial = x * x + z * z - radius * radius;
  if (horizontal > 1e-8) {
    const toward = x * direction.x + z * direction.z;
    const discriminant = toward * toward - horizontal * radial;
    if (discriminant < 0) return Infinity;
    const span = Math.sqrt(discriminant);
    enter = Math.max(enter, (-toward - span) / horizontal);
    exit = Math.min(exit, (-toward + span) / horizontal);
  } else if (radial > 0) return Infinity;
  if (Math.abs(direction.y) > 1e-8) {
    const bottomDistance = (floor - origin.y) / direction.y;
    const topDistance = (top - origin.y) / direction.y;
    enter = Math.max(enter, Math.min(bottomDistance, topDistance));
    exit = Math.min(exit, Math.max(bottomDistance, topDistance));
  } else if (origin.y < floor || origin.y > top) return Infinity;
  return enter <= exit ? enter : Infinity;
}

export function nearestShotActor(origin, direction, range, people, officers) {
  let hit = null, nearest = range;
  for (const [actors, officer, radius] of [[people, false, .32], [officers, true, .33]]) {
    for (const actor of actors) {
      if (actor.gone || actor.dead || actor.state === 'down' || actor.health <= 0) continue;
      const distance = actorDistance(origin, direction, actor, radius, nearest);
      if (distance >= nearest) continue;
      nearest = distance;
      hit = { actor, officer, distance };
    }
  }
  return hit;
}

const shotPoint = (origin, ray, distance) => ({
  x:origin.x+ray.x*distance,y:origin.y+ray.y*distance,z:origin.z+ray.z*distance,
});

/** Trace successive stretches of street and furnished room through window openings. */
export function traceShopShot(origin, ray, range, {views, people, officers, streetBlocked, step}) {
  const doorHits = views.map(view=>shopDoorShot(view,origin,ray,range)).filter(Boolean);
  const leaf = doorHits.reduce((first,hit)=>!hit.id ? Math.min(first,hit.distance) : first,Infinity);
  const result = traceShotRooms(origin,ray,Math.min(range,leaf),views,people,officers,streetBlocked,step);
  result.solid ||= leaf<=result.distance;
  result.panes.push(...doorHits.filter(hit=>hit.id && hit.distance<=result.distance));
  return result;
}

function traceShotRooms(origin, ray, range, views, people, officers, streetBlocked, step) {
  const spans = views.map(view=>roomShotSpan(view,origin,ray,range))
    .filter(span=>span && (span.startsInside || span.enter)).sort((a,b)=>a.start-b.start);
  const panes = [];
  let cursor = 0, last = null;
  function street(end, next) {
    const start = shotPoint(origin,ray,cursor);
    const hit = nearestShotActor(start,ray,end-cursor,people,officers.filter(officer=>!officer.room));
    const limit = hit?.distance ?? end-cursor;
    const blocked = (x,y,z) => {
      const distance = (x-origin.x)*ray.x+(y-origin.y)*ray.y+(z-origin.z)*ray.z;
      const buildings = [];
      if (last && distance-last.distance<=last.grace) buildings.push(last.view.front?.building);
      if (next && next.distance-distance<=next.grace) buildings.push(next.view.front?.building);
      return streetBlocked(x,y,z,buildings);
    };
    const distance = shotObstruction(start,ray,limit,blocked,step);
    const point = shotPoint(start,ray,distance);
    const solid = distance<limit || limit>0 && blocked(point.x,point.y,point.z);
    return hit && !solid ? {...hit,distance:cursor+distance,panes} : {distance:cursor+distance,panes,solid};
  }
  for (const span of spans) {
    if (span.start<cursor) continue;
    if (span.start>cursor) {
      const result=street(span.start,span.enter);
      if (result.actor || result.solid) return result;
    }
    if (span.enter?.id) panes.push(span.enter);
    const start = shotPoint(origin,ray,span.start);
    const stop = Math.min(span.fixture,span.end);
    const hit = nearestShotActor(start,ray,stop-span.start,roomOccupants(span.view),
      officers.filter(officer=>officer.room===span.view));
    const reached = hit ? span.start+hit.distance : stop;
    panes.push(...span.panes.filter(pane=>pane.distance<=reached));
    if (hit) return {...hit,distance:span.start+hit.distance,panes,view:span.view};
    if (span.fixture<=span.end || !span.exit) return {distance:stop,panes,solid:span.fixture<=span.end || span.wall};
    if (span.exit.id) panes.push(span.exit);
    cursor=span.end;last=span.exit;
  }
  return street(range,null);
}
