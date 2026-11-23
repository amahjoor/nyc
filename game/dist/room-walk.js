import { crossesFixture, DOOR, roomLocal, roomPoint } from './room.js';
import { treadHeight } from './shop-entrance.js';
import { clearTravel, pedestrianRadius, walkTowards } from './pedestrian-motion.js';
import { stepSeating } from './seating.js';
import { WALK_CLIP_SPEED } from './body-motion.js';

export function pathsFromDoor(room, step, radius, solids = room.things.filter(t => t.solid)) {
  const queue = [{ a: 0, b: .5, prev: null }], seen = new Set(['0,0.5']);
  if (solids.some(t => crossesFixture(queue[0], {a:0,b:-1.25}, t, radius))) return [];
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

const distance=(a,b)=>Math.hypot(a.a-b.a,a.b-b.b);
export function shopAisle(view) {
  if(view.aisle)return view.aisle;
  const room=view.plan, solids=room.things.filter(t=>t.solid), nodes=pathsFromDoor(room,.25,.18,solids);
  const clear=(a,b,radius=.18,except=null)=>!solids.some(t=>t!==except && crossesFixture(a,b,t,radius));
  function nearest(point, visible=false) {
    let best=null, gap=Infinity;
    for(const node of nodes) {
      const d=distance(point,node);
      if(d<gap && (!visible || clear(point,node,.14))) {best=node;gap=d;}
    }
    return best;
  }
  function route(start,end) {
    if(clear(start,end))return [end];
    const from=nearest(start,true),to=nearest(end,true);
    if(!from || !to)return null;
    const left=[],right=[];
    for(let n=from;n;n=n.prev)left.push(n);
    for(let n=to;n;n=n.prev)right.push(n);
    while(left.length && right.length && left.at(-1)===right.at(-1)) {
      const common=left.pop();right.pop();
      if(!left.length || !right.length || left.at(-1)!==right.at(-1)){left.push(common);break;}
    }
    const path=[...left,...right.reverse(),end], result=[];
    for(let i=0;i<path.length;i++) {
      const anchor=result.at(-1)||start;
      while(i+1<path.length && clear(anchor,path[i+1]))i++;
      result.push(path[i]);
    }
    return result;
  }
  const grid = new Map(nodes.map(n=>[n.a+','+n.b,n]));
  const adjacent = n => [[.25,0],[-.25,0],[0,.25],[0,-.25]].map(([a,b])=>grid.get((n.a+a)+','+(n.b+b))).filter(Boolean);
  return view.aisle={nodes,clear,nearest,route,adjacent};
}

export const floorAt=(view,actor)=>roomLocal(view.plan,actor.x,actor.z);
export function facePoint(view,actor,point) {
  const [x,z]=roomPoint(view.plan,point.a,point.b);actor.heading=Math.atan2(x-actor.x,z-actor.z);
}

export function peopleInRoom(view,actor) {
  const people = [...(view.actors || []),...(view.visitors || [])];
  if(view.visitor && !people.includes(view.visitor))people.push(view.visitor);
  for(const p of view.nearbyPeople?.(actor) || [])if(!people.includes(p))people.push(p);
  const others=people.filter(p=>p!==actor && !p.gone && Math.abs((p.y??view.floor)-(actor.y??view.floor))<1.6);
  for(const p of people)if(p!==actor && p.sitting && p.seat?.clearance)others.push(...p.seat.clearance);
  return others;
}

// A newly arrived walker can interrupt a seat animation, including a hurried exit.
export function roomSeatStep(view,actor,seat,dt) {
  const pose={x:actor.x,z:actor.z}, progress=seat.progress, weight=seat.weight;
  stepSeating(pose,seat,dt);
  const dx=pose.x-actor.x,dz=pose.z-actor.z,step=Math.hypot(dx,dz);
  if(step && clearTravel(actor,dx/step,dz/step,step,peopleInRoom(view,actor))<step){
    seat.progress=progress;seat.weight=weight;seat.stepSpeed=0;return false;
  }
  Object.assign(actor,pose);
  return true;
}

function insideWalls(room,at,p) {
  if (p.b > 0 && (Math.abs(p.a) > room.width/2-.15 || p.b > room.depth-.15)) return false;
  return (at.b > 0) === (p.b > 0) || Math.abs(at.a + (p.a-at.a)*at.b/(at.b-p.b)) <= DOOR/2-.16;
}

export function roomWalkStep(view, actor, x, z, budget, others = peopleInRoom(view,actor), except = null, blocker = null) {
  const room = view.plan, at = floorAt(view,actor);
  const inside = (wx,wz) => {
    const p = roomLocal(room,wx,wz);
    if (!insideWalls(room,at,p)) return false;
    const obstructs = t => crossesFixture(at,p,t,.15) && !crossesFixture(at,at,t,.15);
    return !(blocker && obstructs(blocker)) && !room.things.some(t=>t!==except && t.solid && obstructs(t));
  };
  const walked = walkTowards(actor,x,z,budget,others,inside);
  const b=floorAt(view,actor).b;
  if(b<0 && view.groundAt)actor.y=Math.max(view.groundAt(actor.x,actor.z),treadHeight(view.entry?.stairs,actor.x,actor.z)??-Infinity);
  else if(b>-.6)actor.y=view.floor;
  actor.phase = (actor.phase || 0)+walked*4.6;
  actor.stride = budget > 0 ? walked/budget : 0;
  return walked;
}

export function walkingPose(actor,metres,dt) {
  const walking=metres>dt*.08, pace=WALK_CLIP_SPEED*(actor.look?.height||1.76)/1.76;
  actor.clip=walking?'walk':'idle';
  actor.time=(actor.time||0)+(walking?metres/pace:dt);
  actor.stride=walking?Math.min(1,metres/(dt*pace)):0;
}

// If someone stops in a narrow aisle, search the connected floor around them.
// Leave occupied service marks within reach and keep through traffic on the floor.
function roomDetour(view, actor, goal, others) {
  const aisle=shopAisle(view), room=view.plan, start=floorAt(view,actor);
  const clear=(a,b)=>{
    if(!insideWalls(room,a,b) || !aisle.clear(a,b,.15))return false;
    const [x,z]=roomPoint(room,a.a,a.b), [ex,ez]=roomPoint(room,b.a,b.b);
    const gap=Math.hypot(ex-x,ez-z);
    return gap<.00001 || clearTravel(actor,(ex-x)/gap,(ez-z)/gap,gap,others,x,z)>=gap;
  };
  const queue=[], previous=new Map();
  for(const node of aisle.nodes)if(distance(start,node)<.85 && clear(start,node)){
    queue.push(node);previous.set(node,null);
  }
  let best=null, bestGap=Infinity, reached=false;
  for(let i=0;i<queue.length;i++){
    const node=queue[i], gap=distance(node,goal);
    if(gap<1 && clear(node,goal)){best=node;reached=true;break;}
    if(gap<bestGap && gap<1.4 && goal.b>0 && aisle.clear(node,goal,.12)){bestGap=gap;best=node;}
    for(const next of aisle.adjacent(node))if(!previous.has(next) && clear(node,next)){
      previous.set(next,node);queue.push(next);
    }
  }
  if(!best)return null;
  const path=[];
  for(let p=best;p;p=previous.get(p))path.push(p);
  path.reverse();
  if(reached && best!==goal)path.push(goal);
  const route=[];
  for(let i=0;i<path.length;i++){
    while(i+1<path.length && clear(route.at(-1)||start,path[i+1]))i++;
    route.push(path[i]);
  }
  return route;
}

// In a one-person aisle the guest being served may be standing in the worker's
// only way out. Let a waiting guest step to a free spot beside the route.
function makeRoom(view, actor, goal, others) {
  const aisle=shopAisle(view);
  const [gx,gz]=roomPoint(view.plan,goal.a,goal.b);
  const length=Math.hypot(gx-actor.x,gz-actor.z);
  if(length<.01)return null;
  const ux=(gx-actor.x)/length, uz=(gz-actor.z)/length;
  for(const guest of others){
    if(!guest.visit || guest.sitting || guest.escape || guest.visit.task?.actor===guest ||
        clearTravel(actor,ux,uz,Math.min(length,1.4),[guest])>=Math.min(length,1.4))continue;
    const from=floorAt(view,guest), bystanders=peopleInRoom(view,guest);
    let best=null, cost=Infinity;
    for(const node of aisle.nodes){
      const d=distance(from,node);
      if(d<.35 || d>1.65 || d>=cost || !aisle.clear(from,node,.15) || !insideWalls(view.plan,from,node))continue;
      const [x,z]=roomPoint(view.plan,node.a,node.b), dx=x-guest.x, dz=z-guest.z, step=Math.hypot(dx,dz);
      if(clearTravel(guest,dx/step,dz/step,step,bystanders)<step)continue;
      const ahead=Math.max(0,Math.min(length,(x-actor.x)*ux+(z-actor.z)*uz));
      if(Math.hypot(x-actor.x-ux*ahead,z-actor.z-uz*ahead)<pedestrianRadius(actor)+pedestrianRadius(guest)+.22)continue;
      best={guest,x,z};cost=d;
    }
    if(best)return best;
  }
  return null;
}

export function followRoute(view,actor,task,dt) {
  let left=dt*(actor.look?.pace||1.35);
  const room=view.plan;
  if(task.yielding){
    const {guest,x,z}=task.yielding;
    if(guest.visit && !guest.sitting && !guest.escape && guest.visit.task?.actor!==guest && Math.hypot(guest.x-x,guest.z-z)>.04){
      const walked=roomWalkStep(view,guest,x,z,dt*(guest.look?.pace||1.35));
      walkingPose(guest,walked,dt);
      if(walked>.001)return false;
    }
    task.yielding=null;
  }
  while(task.at<task.path.length) {
    const point=task.path[task.at], [x,z]=roomPoint(room,point.a,point.b);
    const dx=x-actor.x,dz=z-actor.z,gap=Math.hypot(dx,dz);
    if(gap>.0001){
      const at=floorAt(view,actor);
      const others=peopleInRoom(view,actor);
      const machine=task.rise===undefined ? null : actor.visit?.display;
      const step=roomWalkStep(view,actor,x,z,Math.min(left,gap),others,machine);
      const next=floorAt(view,actor), skew=room.skew||0;
      if(Math.abs(next.b)<.85)view.door?.push(at.a+skew*at.b,at.b,next.a+skew*next.b,next.b,.25,dt);
      left-=step;
      const remaining=Math.hypot(x-actor.x,z-actor.z);
      if(remaining>.0001){
        // A meeting ends at arm's length when another person occupies its mark.
        const beside = other => (next.b>.18 && point.b>0 ||
          task.phase==='back to sidewalk' && next.b<-.65 && point.b<0 && !other.visit) &&
          other!==actor && !other.gone && remaining<1 &&
          Math.hypot(x-other.x,z-other.z)<pedestrianRadius(actor)+pedestrianRadius(other)+.04 &&
          Math.hypot(other.x-actor.x,other.z-actor.z)<pedestrianRadius(actor)+pedestrianRadius(other)+.15;
        if(!others.some(beside)){
          if(task.bestGap===undefined || remaining < task.bestGap-.04){task.bestGap=remaining;task.stuck=0;}
          else task.stuck+=dt;
          if(task.stuck>.55 && point.b>=0 && task.rise===undefined){
            task.yielding=makeRoom(view,actor,point,others);
            const route=!task.yielding && roomDetour(view,actor,point,others);
            if(route)task.path=[...task.path.slice(0,task.at),...route,...task.path.slice(task.at+1)];
            task.bestGap=undefined;task.stuck=0;
          }
          return false;
        }
      }
    }
    if(Math.hypot(actor.x-x,actor.z-z)<.0001){actor.x=x;actor.z=z;}
    task.at++;task.bestGap=undefined;
  }
  return true;
}
