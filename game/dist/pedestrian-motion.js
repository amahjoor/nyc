// Local walking in metres. Both the route and the rendered body use the accepted step.
export function pedestrianRadius(person) {
  const look = person.look;
  return Math.max(.25, Math.min(.42, .32 * (look?.build || 1) * (look?.height || 1.72) / 1.72));
}
const bodyX = p => p.x + (p.shove?.[0] || 0);
const bodyZ = p => p.z + (p.shove?.[1] || 0);

// A frame starts with everyone in their current cell. Publish each accepted move
// immediately so a second walker cannot claim the space the first one just took.
export class PedestrianGrid {
  cells = new Map();
  keys = new Map();
  nearby = [];
  clear() { this.cells.clear(); this.keys.clear(); }
  put(person) {
    const key = Math.floor(bodyX(person)/4) + ',' + Math.floor(bodyZ(person)/4);
    if (key === this.keys.get(person)) return;
    this.remove(person);
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key).add(person);
    this.keys.set(person, key);
  }
  remove(person) {
    this.cells.get(this.keys.get(person))?.delete(person);
    this.keys.delete(person);
  }
  around(person, reach = 3, nearby = this.nearby) {
    const x = bodyX(person), z = bodyZ(person);
    nearby.length = 0;
    for (let i = Math.floor((x-reach)/4); i <= Math.floor((x+reach)/4); i++) {
      for (let j = Math.floor((z-reach)/4); j <= Math.floor((z+reach)/4); j++) {
        const cell = this.cells.get(i + ',' + j);
        if (!cell) continue;
        for (const other of cell) {
          if (other !== person && !other.gone && Math.abs(bodyX(other)-x) < reach && Math.abs(bodyZ(other)-z) < reach &&
              Math.abs((other.y ?? 0)-(person.y ?? 0)) < 1.6) nearby.push(other);
        }
      }
    }
    return nearby;
  }
}

export function hasStandingRoom(person, others) {
  const radius = pedestrianRadius(person);
  return !others.some(other => Math.abs((other.y ?? 0)-(person.y ?? 0)) < 1.6 &&
    Math.hypot(bodyX(person)-bodyX(other), bodyZ(person)-bodyZ(other)) < radius + pedestrianRadius(other) + .06);
}

// An actor can be placed directly into the crowd by a doorway or a change of
// floor. Find the shortest free step out, including when both centres coincide.
export function recoverStandingRoom(person, others, allowed) {
  const x=bodyX(person), z=bodyZ(person), radius=pedestrianRadius(person);
  let touching;
  for(const p of others){
    const dx=bodyX(p)-x,dz=bodyZ(p)-z,gap=radius+pedestrianRadius(p)-.0001;
    if(dx*dx+dz*dz>=gap*gap || p===person || p.gone || Math.abs((p.y??0)-(person.y??0))>=1.6)continue;
    touching ??= [];
    touching.push(p);
  }
  if(!touching)return;
  const bearing=Math.atan2(x-bodyX(touching[0]),z-bodyZ(touching[0]));
  let best=Infinity, dx=0, dz=0;
  for(let i=0;i<16;i++){
    const angle=bearing+i*Math.PI/8, ux=Math.sin(angle), uz=Math.cos(angle);
    let step=0;
    for(const p of touching){
      const px=bodyX(p)-x,pz=bodyZ(p)-z,gap=radius+pedestrianRadius(p)+.026,side=px*uz-pz*ux;
      step=Math.max(step,px*ux+pz*uz+Math.sqrt(Math.max(0,gap*gap-side*side)));
    }
    if(step>=best || clearTravel(person,ux,uz,step,others)<step || !allowed(x+ux*step,z+uz*step))continue;
    best=step;dx=ux*step;dz=uz*step;
  }
  person.x+=dx;person.z+=dz;
}

// Distance to first contact on a swept step. Someone already touching can
// always walk away, including after an external shove or a floor-height change.
export function clearTravel(person, ux, uz, reach, others, x = bodyX(person), z = bodyZ(person)) {
  const radius = pedestrianRadius(person);
  let clear = reach;
  for (const other of others) {
    if (other === person || other.gone || Math.abs((other.y ?? 0)-(person.y ?? 0)) >= 1.6) continue;
    const dx = bodyX(other)-x, dz = bodyZ(other)-z, ahead = dx*ux + dz*uz;
    if (ahead <= 0) continue;
    const across = dx*uz - dz*ux, gap = radius + pedestrianRadius(other) + .025;
    if (Math.abs(across) >= gap) continue;
    clear = Math.min(clear, Math.max(0, ahead - Math.sqrt(gap*gap-across*across)));
  }
  return clear;
}

// Reconcile a shove or a physics-driven step with the same occupied space as a walk.
export function limitPedestrianStep(person, fromX, fromZ, others) {
  const dx = bodyX(person)-fromX, dz = bodyZ(person)-fromZ, step = Math.hypot(dx,dz);
  if (step < .00001) return;
  const free = clearTravel(person,dx/step,dz/step,step,others,fromX,fromZ);
  if (free < step) {
    person.x -= dx*(1-free/step);
    person.z -= dz*(1-free/step);
  }
}

// Try straight ahead, then increasingly wide detours. For equally open
// alternatives both walkers keep right. A wall or a narrow queue can rule out both.
const directions = [0,.44,-.44,.86,-.86,1.32,-1.32].map(a => [Math.cos(a), Math.sin(a)]);
export function walkTowards(person, x, z, budget, others, allowed, obstacles = others, dt = 0) {
  const dx = x-person.x, dz = z-person.z, gap = Math.hypot(dx,dz);
  if (gap < .00001 || budget <= 0) {
    if(dt)person.steerX=person.steerZ=0;
    return 0;
  }
  const fx = dx/gap, fz = dz/gap, step = Math.min(budget,gap);
  const sight = Math.min(gap, Math.max(step,1.45));
  let best = 0, bestX = 0, bestZ = 0, travel = 0;
  for (const [forward, side] of directions) {
    const ux = fx*forward-fz*side, uz = fz*forward+fx*side;
    const space = clearTravel(person,ux,uz,sight,obstacles);
    if (space < .000001) continue;
    // Ease up behind the person ahead before reaching shoulder distance.
    let distance = Math.min(space,step*(space < sight ? Math.min(1,space/.48) : 1));
    const score = (space/sight)*(.32+.68*forward);
    if (score <= best) continue;
    // Moving in the same stream changes the desired pace. Their bodies still
    // occupy their current positions when this particular step is taken.
    if(obstacles!==others)distance=clearTravel(person,ux,uz,distance,others);
    if(distance<.000001)continue;
    const nx = person.x+ux*distance, nz = person.z+uz*distance;
    if (allowed && !allowed(nx,nz)) continue;
    // A sidestep needs somewhere to go beyond this frame, especially along a wall.
    const probe = Math.min(space,.65);
    if (side && allowed && !allowed(person.x+ux*probe, person.z+uz*probe)) continue;
    best = score; bestX = ux; bestZ = uz; travel = distance;
    if (forward === 1 && space === sight) break;
  }
  if(dt && travel>0 && person.steerX!==undefined){
    // Build a turn over several steps. Recheck the curved approach against
    // the current bodies and curb, just as for the originally chosen step.
    const vx=bestX*travel/dt, vz=bestZ*travel/dt;
    const dx=vx-person.steerX,dz=vz-person.steerZ, change=Math.hypot(dx,dz);
    const maxChange=4*dt;
    if(change>maxChange){
      const ax=person.steerX+dx*maxChange/change, az=person.steerZ+dz*maxChange/change;
      const speed=Math.hypot(ax,az);
      if(speed>.00001){
        const ux=ax/speed,uz=az/speed;
        const step=clearTravel(person,ux,uz,Math.min(travel,speed*dt),others);
        if(step>.000001 && (!allowed || allowed(person.x+ux*step,person.z+uz*step))){
          bestX=ux;bestZ=uz;travel=step;
        }else travel=Math.min(travel,maxChange*dt);
      }else travel=0;
    }
  }
  if(dt){person.steerX=bestX*travel/dt;person.steerZ=bestZ*travel/dt;}
  if (travel > 0) {
    person.x += bestX*travel; person.z += bestZ*travel;
    const heading = Math.atan2(bestX,bestZ);
    if(dt && Number.isFinite(person.heading)){
      const turn=heading-person.heading, shortest=Math.atan2(Math.sin(turn),Math.cos(turn));
      person.heading+=Math.max(-5*dt,Math.min(5*dt,shortest));
    }else person.heading=heading;
  }
  return travel;
}
