// A displaced character keeps momentum until contact with the street or a wall.
// The angle of the falling body drives its pose independently of horizontal travel.
export const GRAVITY = 9.81, WALK_SPEED = 1.85, JOG_SPEED = 3.95, RUN_SPEED = 8.6;

export function receiveImpulse(actor,vx,vz,{fall=false,lift=0,rest=.45,clip='stumble'}={}) {
  const previous=actor.reaction;
  const r=actor.reaction={vx:vx+(previous?.vx||0),vz:vz+(previous?.vz||0),
    vy:(previous?.vy ?? actor.vy ?? 0)+lift,grounded:false,age:0,
    fall:fall||Boolean(previous?.fall),rest,angle:previous?.angle||0,
    spin:Math.min(8,1.8+Math.hypot(vx,vz)*.42),recover:0,clip,time:0};
  if(r.fall){
    r.clip='knocked'; r.time=.85*r.angle/(Math.PI/2);
    // A sideways impact turns the body over time. Keep its original facing at contact.
    const heading=actor.heading ?? actor.angle ?? 0;
    const direction=Math.hypot(r.vx,r.vz)>.1 ? Math.atan2(-r.vx,-r.vz) : heading;
    r.turn=Math.atan2(Math.sin(direction-heading),Math.cos(direction-heading));
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
    }
    const support=floor(actor);
    r.vy-=GRAVITY*h;
    actor.y=(actor.y??support)+r.vy*h;
    r.grounded=actor.y<=support && r.vy<=0;
    if(r.grounded){actor.y=support;r.vy=0;}
    const drag=Math.exp(-(r.grounded ? (r.fall?4:7) : .28)*h);
    r.vx*=drag;r.vz*=drag;
    if(!r.fall){r.time=r.age;if(r.age>=.38 && r.grounded) break;continue;}
    if(r.turn){
      const amount=r.turn*(1-Math.exp(-r.spin*h));
      r.turn-=amount;
      if(actor.heading!==undefined) actor.heading+=amount;
      else actor.angle=(actor.angle||0)+amount;
    }
    if(r.angle<Math.PI/2) {
      r.spin+=GRAVITY*Math.sin(r.angle)*h;
      r.angle=Math.min(Math.PI/2,r.angle+r.spin*h);
      r.time=.85*r.angle/(Math.PI/2);
    } else if(r.grounded && Math.hypot(r.vx,r.vz)<.55) {
      r.rest-=h;
      if(r.rest>0){r.clip='lying';r.time=r.age;}
      else {r.recover+=h;r.clip='getUp';r.time=r.recover;}
    }
  }
  if(r.grounded && (r.fall ? r.recover>=1.5 : r.age>=.38)) actor.reaction=null;
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
