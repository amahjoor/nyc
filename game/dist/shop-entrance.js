// A level landing with a flight of equal risers down to the surveyed paving.
// Coordinates s and t run down and across the flight. The door stays square to
// the façade even where the room behind it has a skewed footprint.
import {roomLocal,roomPoint} from './room.js';

const HALF = .72, MAX_RISE = .18, LEVEL_SILL = .12;
function frame(room, turn) {
  const dx=turn ? turn*room.tx : room.nx, dz=turn ? turn*room.tz : room.nz;
  const tx=turn ? room.nx : room.tx, tz=turn ? room.nz : room.tz;
  const x=room.x+(turn ? HALF*tx : 0), z=room.z+(turn ? HALF*tz : 0);
  const point=(s,t)=>[x+s*dx+t*tx,z+s*dz+t*tz];
  const local=(wx,wz)=>({s:(wx-x)*dx+(wz-z)*dz,t:(wx-x)*tx+(wz-z)*tz});
  return {turn,point,local,back:turn?-HALF:-.025,landing:turn?HALF:1.14};
}

export function planShopEntrance(room, floor, ground, clear=()=>true) {
  const approach=d=>ground(room.x+room.nx*d,room.z+room.nz*d);
  const grade=Math.min(approach(.12),approach(.55));
  if(!Number.isFinite(grade) || floor-grade<=LEVEL_SILL)return {floor,stairs:null};
  let best=null;
  for(const [turn,tread] of [[0,.29],[1,.29],[-1,.29],[0,.26],[1,.26],[-1,.26]]){
    const f=frame(room,turn);
    for(let count=1;count<=32;count++){
      const toe=f.landing+(count-1)*tread;
      if(turn && toe>room.width/2)break;
      const cross=[-HALF+.055,0,HALF-.055];
      // Leave room for a whole person to reach the foot. At a recessed shop
      // an adjacent building can project into that space beyond the last tread.
      if(!cross.every(t=>clear(...f.point(toe,t)) && clear(...f.point(toe+.55,t))))break;
      const grades=cross.map(t=>ground(...f.point(toe,t)));
      const bottom=Math.min(...grades);
      if(!Number.isFinite(bottom))break;
      const top=Math.min(floor,bottom+count*MAX_RISE);
      if(top<=grade+LEVEL_SILL)continue;
      const rise=(top-bottom)/count;
      if(rise<=0)break;
      if(!best || top>best.floor)best={...f,count,toe,rise,floor:top,half:HALF,tread};
      if(top===floor)break;
    }
    if(best?.floor===floor)break;
  }
  // At a particularly tight frontage the usable sidewalk sets the highest
  // reachable sill, including a flush entrance if there is no space for a step.
  return best ? {floor:best.floor,stairs:best} : {floor:Math.min(floor,grade+.06),stairs:null};
}

export function treadHeight(stairs,x,z){
  if(!stairs)return null;
  const {s,t}=stairs.local(x,z);
  if(s<stairs.back-.001 || s>stairs.toe || Math.abs(t)>stairs.half)return null;
  const tread=Math.min(stairs.count-1,Math.max(0,Math.ceil((s-stairs.landing)/stairs.tread)));
  return stairs.floor-stairs.rise*tread;
}

// Approach from the foot, turn on the landing and pass through the hinge line.
// Return points in the same room coordinates as the indoor walking routes.
export function shopStairRoute(room,stairs,start){
  if(!stairs)return null;
  const [x,z]=roomPoint(room,start.a,start.b);
  const {s,t}=stairs.local(x,z),foot=stairs.toe+.36, points=[];
  const add=(along,side)=>points.push(roomLocal(room,...stairs.point(along,side)));
  if(s<stairs.back || s>stairs.toe || Math.abs(t)>stairs.half){
    // Go around the cheek of the stairs before turning onto the bottom tread.
    if(s<foot){
      const side=(stairs.turn ? 1 : Math.sign(t)||1)*(stairs.half+.38);
      if(s<stairs.back)add(s,side);
      add(foot,side);
    }
    add(foot,0);
  }
  if(stairs.turn)add(0,0);
  return points;
}
