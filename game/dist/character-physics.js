// A displaced character keeps momentum until contact with the street or a wall.
// The angle of the falling body drives its pose independently of horizontal travel.
export const GRAVITY = 9.81, WALK_SPEED = 1.85, JOG_SPEED = 3.95, RUN_SPEED = 8.6;

const bounded = (value, limit) => Math.max(-limit, Math.min(limit, value));
const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// The runner can redirect a walking step almost immediately. At speed the
// outside leg has to brake and carry the body around a finite turning radius.
export function stepGroundStride(player, desiredX, desiredZ, dt, aimYaw) {
  const vx = player.velocityX, vz = player.velocityZ;
  const speed = Math.hypot(vx, vz), goal = Math.hypot(desiredX, desiredZ);
  const intent = Math.atan2(desiredX, desiredZ);
  let heading = speed > .04 ? Math.atan2(vx, vz) : intent;
  const turn = angleTo(heading, intent);
  const pivot = goal > .02 && speed > .08 && Math.abs(turn) > 2.4;
  if (speed <= .08 && goal > .02) heading = intent;
  else if (goal > .02 && !pivot) heading += bounded(turn, 15 * dt / speed);
  const cornerPace = 1 - .38 * Math.min(1, speed / JOG_SPEED) * Math.min(1, Math.abs(turn) / 1.57);
  const target = pivot ? 0 : goal * cornerPace;
  const push = target > speed ? Math.min(12, 5.5 * goal) : 13 + .75 * speed;
  const next = speed + bounded(target - speed, push * dt);
  player.velocityX = next * Math.sin(heading);
  player.velocityZ = next * Math.cos(heading);

  if (Number.isFinite(aimYaw)) player.angle = aimYaw;
  else if (goal > .02) {
    // Lead a bend with the shoulders. On a reversal hold the old heading
    // through the braking step and pivot as weight comes off that foot.
    const lead = pivot ? 0 : bounded(angleTo(heading, intent), .40);
    const face = angleTo(player.angle, heading + lead);
    player.angle += bounded(face * (1 - Math.exp(-18 * dt)), (speed < 2 ? 13 : 8) * dt);
  }
  const sin = Math.sin(player.angle), cos = Math.cos(player.angle);
  player.strideForward = ((player.velocityX - vx) * sin + (player.velocityZ - vz) * cos) / dt;
  player.strideSide = ((player.velocityX - vx) * cos - (player.velocityZ - vz) * sin) / dt;
  player.strideTurn = goal > .02 ? bounded(angleTo(player.angle, intent), .75) : 0;
}

export function receiveImpulse(actor,vx,vz,{fall=false,lift=0,rest=.45,clip='stumble',impact=0}={}) {
  const previous=actor.reaction;
  const r=actor.reaction={vx:vx+(previous?.vx||0),vz:vz+(previous?.vz||0),
    vy:(previous?.vy ?? actor.vy ?? 0)+lift,grounded:false,age:0,
    fall:fall||Boolean(previous?.fall),rest,angle:previous?.angle||0,
    spin:Math.min(8,1.8+Math.hypot(vx,vz)*.42),recover:0,clip,time:0};
  if(r.fall){
    r.clip='knocked'; r.time=.85*r.angle/(Math.PI/2);
    const heading=actor.heading ?? actor.angle ?? 0, sx=Math.sin(heading),sz=Math.cos(heading);
    const speed=Math.hypot(r.vx,r.vz);
    r.side=speed>.15 ? (r.vx*sz-r.vz*sx)/speed : previous?.side??0;
    r.forward=speed>.15 ? (r.vx*sx+r.vz*sz)/speed : previous?.forward??1;
    if(previous?.fall && previous.angle>1 && previous.forward!=null){
      r.side=previous.side;r.forward=previous.forward;
    }
    r.spin=Math.min(9,1.8+Math.hypot(speed,lift,impact*.65)*.50);
    r.clearance=previous?.clearance||0;
    r.fromHeight=previous?.fromHeight||false;
    r.rock=previous?.rock||0;
    r.rockSpeed=previous?.fall ? Math.min(3,speed*.3)+(previous.rockSpeed||0) : 0;
  }
  actor.carry=null;
  return r;
}

// resolve(actor,x,z) returns a clear position and optionally a contact normal.
// floor(actor) supplies the support under the new horizontal position.
export function stepImpulse(actor,dt,resolve,floor) {
  const r=actor.reaction;
  if (!r) return false;
  for (let left=dt;left>1e-7;){
    const h=Math.min(left,1/60);left-=h;r.age+=h;
    const next=resolve(actor,actor.x+r.vx*h,actor.z+r.vz*h);
    actor.x=next.x;actor.z=next.z;
    if(next.hit){
      const {nx,nz}=next.hit, inward=Math.min(0,r.vx*nx+r.vz*nz);
      r.vx-=nx*inward;r.vz-=nz*inward;
      if(r.fall && inward<-.5)r.rockSpeed+=Math.min(3,-inward*.35);
    }
    const support=floor(actor);
    r.vy-=GRAVITY*h;
    actor.y=(actor.y??support)+r.vy*h;
    r.grounded=actor.y<=support && r.vy<=0;
    if(r.grounded){
      if(r.fall && r.vy < -1){
        r.landingSpeed=Math.max(r.landingSpeed||0,-r.vy);
        r.rockSpeed-=Math.min(3.5,-r.vy*.35);
      }
      actor.y=support;r.vy=0;
    }
    r.clearance=Math.max(0,actor.y-support);
    const drag=Math.exp(-(r.grounded ? (r.fall?4:7) : .28)*h);
    r.vx*=drag;r.vz*=drag;
    if(!r.fall){r.time=r.age+(r.poseLead||0);if(r.age>=.38 && r.grounded) break;continue;}
    // Impact rocks the torso; friction and damping settle it while the
    // limbs still carry their own momentum.
    r.rockSpeed+=(-65*r.rock-9*r.rockSpeed)*h;
    r.rock+=r.rockSpeed*h;
    if(r.angle<Math.PI/2) {
      r.spin+=GRAVITY*Math.sin(r.angle)*h;
      r.angle=Math.min(Math.PI/2,r.angle+r.spin*h);
      if(r.angle===Math.PI/2 && r.grounded)r.rockSpeed-=Math.min(2.5,r.spin*.22);
      r.time=.85*r.angle/(Math.PI/2);
    } else if(r.grounded && Math.hypot(r.vx,r.vz)<.55) {
      r.rest-=h;
      if(r.rest>0){r.clip='lying';r.time=r.age;}
      else {r.recover+=h;r.clip='getUp';r.time=r.recover;}
    }
  }
  if(r.grounded && (r.fall ? r.recover>=1.5 : r.age>=.38)){actor.reaction=null;actor.airborne=false;actor.vy=0;}
  return true;
}

// Small changes are steps and slopes. A drop puts the feet in free fall.
export function followFloor(actor,floor,dt){
  if(!actor.airborne && (actor.y??floor)-floor<=.55){actor.y=floor;return 0;}
  actor.vy=(actor.vy||0)-GRAVITY*dt;
  actor.y=Math.max(floor,actor.y+actor.vy*dt);
  actor.airborne=actor.y>floor;
  if(actor.airborne) return 0;
  const impact=-actor.vy;
  actor.vy=0;
  return impact;
}
