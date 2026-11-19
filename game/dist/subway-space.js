// The station's local +Z points from the sidewalk into its fare hall.
// The street mesh owns the first flight. The second flight gives trains
// enough clearance below the pavement (or above it on a viaduct).
import { TRAIN_X, RAMP_FRACTION } from './subway-service.js';

export const LIFT_TRAVEL=3.2;
export const JOIN=-21, HALL=-14, LANDING=2.24, FLIGHT=2.8;
export const clamp=(n,lo,hi)=>Math.max(lo,Math.min(n,hi));
export const turnBetween=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const raisedStation=structure=>['Elevated','Viaduct','Embankment'].includes(structure);

export function stationFrame(portal){
  const {x,z,angle,y,open,kind}=portal;
  const sign=open?1:-1, end=kind===0?2.15:.55;
  const distance=end-JOIN;
  return {x:x+Math.sin(angle)*distance,z:z+Math.cos(angle)*distance,angle,
    y:y+sign*((kind===0?(open?1.98:1.94):LIFT_TRAVEL)+FLIGHT+LANDING)+(portal.grade||0)*end,
    portal,open};
}

export function localFloor(z,open){
  const sign=open?1:-1;
  if(z<HALL)return -sign*(LANDING+FLIGHT*(1-clamp(Math.floor((z-JOIN)/.5)/14,0,1)));
  return -sign*(14-clamp(Math.floor((z+4)/.42),0,14))*.16;
}

export function worldPoint(frame,x,y,z){
  const s=Math.sin(frame.angle),c=Math.cos(frame.angle);
  return {x:frame.x+c*x+s*z,y:frame.y+y,z:frame.z-s*x+c*z};
}
export function localPoint(frame,p){
  const dx=p.x-frame.x,dz=p.z-frame.z,s=Math.sin(frame.angle),c=Math.cos(frame.angle);
  return {x:dx*c-dz*s,z:dx*s+dz*c};
}

// The middle car stops on the mapped track. The entrance gets its own frame:
// a sidewalk kerb can face across the tracks or be on another block.
const BERTH_Z=12;
export function railFrame(x,y,z,angle){
  const s=Math.sin(angle),c=Math.cos(angle);
  return {x:x-TRAIN_X*c-BERTH_Z*s,y,z:z+TRAIN_X*s-BERTH_Z*c,angle};
}
export function platformAt(platform,portal,height){
  const open=platform.structure!=='Subway';
  const belowGrade=!open || platform.structure==='Open Cut';
  const elevation=belowGrade?(open?-6.4:-10):raisedStation(platform.structure)?7.2:1.1;
  return {...railFrame(platform.x,height+elevation,platform.z,platform.angle),portal,open,belowGrade,platform};
}

function lengths(points){
  const dist=[0];
  for(let i=1;i<points.length;i++)dist.push(dist[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
  return dist;
}
function interval(dist,d){
  let lo=0,hi=dist.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(dist[mid]<=d)lo=mid;else hi=mid;}
  return lo;
}

// A real distance along the paid or unpaid passage is used by both the floor
// mesh and walking. Its entrances meet their respective floors and headings.
export function passage(from,to){
  const points=[],span=Math.hypot(to.x-from.x,to.z-from.z);
  const handle=clamp(span*.35,3,18), count=Math.max(12,Math.ceil(span/3));
  const ax=from.x+Math.sin(from.angle)*handle,az=from.z+Math.cos(from.angle)*handle;
  const bx=to.x-Math.sin(to.angle)*handle,bz=to.z-Math.cos(to.angle)*handle;
  for(let i=0;i<=count;i++){
    const t=i/count,u=1-t;
    const x=u**3*from.x+3*u*u*t*ax+3*u*t*t*bx+t**3*to.x;
    const z=u**3*from.z+3*u*u*t*az+3*u*t*t*bz+t**3*to.z;
    const angle=Math.atan2(u*u*(ax-from.x)+2*u*t*(bx-ax)+t*t*(to.x-bx),
      u*u*(az-from.z)+2*u*t*(bz-az)+t*t*(to.z-bz));
    points.push({x,z,angle});
  }
  const dist=lengths(points),length=dist.at(-1);
  for(let i=0;i<points.length;i++)points[i].y=from.y+(to.y-from.y)*dist[i]/(length||1);
  return {points,length,at(d){
    d=clamp(d,0,length);
    const i=interval(dist,d),f=(d-dist[i])/(dist[i+1]-dist[i]||1),a=points[i],b=points[i+1];
    const width=(a.width??1.45)+((b.width??1.45)-(a.width??1.45))*f;
    const clearance=(a.clearance??2.52)+((b.clearance??2.52)-(a.clearance??2.52))*f;
    return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f,angle:a.angle+turnBetween(a.angle,b.angle)*f,width,clearance};
  },containsEye(eye,d){
    let min=Infinity,nearest=d;
    for(let i=interval(dist,Math.max(0,d-4));i<points.length-1 && dist[i]<d+4;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const f=clamp(((eye.x-a.x)*dx+(eye.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      const off=(eye.x-a.x-f*dx)**2+(eye.z-a.z-f*dz)**2;
      if(off<min){min=off;nearest=dist[i]+f*(dist[i+1]-dist[i]);}
    }
    const section=this.at(nearest);
    return min<(section.width-.12)**2 && eye.y<section.y+section.clearance-.09 && eye.y>section.y+.09;
  }};
}

export function streetPassage(portal,dock,heightAt=()=>portal.y){
  const entry=stationFrame(portal);
  const path=passage({...worldPoint(entry,0,localFloor(JOIN,entry.open),JOIN),angle:entry.angle},
    {...worldPoint(dock,0,localFloor(HALL,!dock.belowGrade),HALL),angle:dock.angle});
  for(const [i,p] of path.points.entries()){
    const d=Math.hypot(p.x-path.points[0].x,p.z-path.points[0].z);
    p.width=.72+.73*clamp(d/5,0,1);
    if(portal.open || !dock.belowGrade)continue;
    const sideX=Math.cos(p.angle)*p.width,sideZ=-Math.sin(p.angle)*p.width;
    const pavement=Math.min(heightAt(p.x+sideX,p.z+sideZ),heightAt(p.x-sideX,p.z-sideZ));
    if(i>0 && i<path.points.length-1)p.y=Math.min(p.y,pavement-2.66);
    p.clearance=Math.min(2.52,pavement-p.y-.09);
  }
  return path;
}

// Each pattern carries directed segments from its own scheduled GTFS shape.
// Sample by chainage, using a car-length chord to smooth the yaw on bends.
export function trainLeg(table,pattern,index,from,to){
  const flat=table.tracks[pattern.tracks[index]],points=[];
  for(let i=0;i<flat.length;i+=2)points.push({x:flat[i],z:flat[i+1]});
  const dist=lengths(points),length=dist.at(-1), reverse=pattern.direction===1;
  const start=worldPoint(from,TRAIN_X,0,BERTH_Z),end=worldPoint(to,TRAIN_X,0,BERTH_Z);
  function at(d){
    d=clamp(d,0,length);
    const i=interval(dist,d),f=(d-dist[i])/(dist[i+1]-dist[i]||1);
    const a=points[i],b=points[i+1];
    // A pair of direction-specific GTFS shapes can end on opposite ends of
    // the same platform. Join that short difference inside the station.
    const span=Math.min(length*.45,120),w0=Math.max(0,1-d/span),w1=Math.max(0,1-(length-d)/span);
    return {x:a.x+(b.x-a.x)*f+(start.x-points[0].x)*w0+(end.x-points.at(-1).x)*w1,
      z:a.z+(b.z-a.z)*f+(start.z-points[0].z)*w0+(end.z-points.at(-1).z)*w1};
  }
  return t=>{
    const ramp=RAMP_FRACTION;
    const f=t<ramp?t*t/(2*ramp*(1-ramp)):t>1-ramp?1-(1-t)**2/(2*ramp*(1-ramp)):(t-ramp/2)/(1-ramp);
    const d=length*f,p=at(d),a=at(d-9),b=at(d+9);
    let angle=Math.atan2(b.x-a.x,b.z-a.z)+(reverse?Math.PI:0);
    const berth=Math.min(22,length/2);
    if(d<berth)angle+=turnBetween(angle,from.angle)*(1-d/berth);
    else if(length-d<berth)angle+=turnBetween(angle,to.angle)*(1-(length-d)/berth);
    return {...railFrame(p.x,from.y+(to.y-from.y)*f,p.z,angle),distance:d};
  };
}

export function cabinCamera(j,frame,yaw,pitch,eye){
  const a=yaw-frame.angle,s=Math.sin(a),c=Math.cos(a);
  const centre=Math.round((j.z-12)/20)*20+12;
  // Slide the eye along the aisle when an orbit hits a side wall. Pulling the
  // camera straight into the character's head makes a sideways view unusable.
  const x=clamp(j.x-s*2.45,TRAIN_X-1.19,TRAIN_X+1.19);
  let z=clamp(j.z-c*2.45,centre-9.44,centre+9.44);
  if(Math.hypot(x-j.x,z-j.z)<.85){
    const side=Math.abs(c)>.08?-Math.sign(c):j.z<centre?-1:1;
    z=clamp(j.z+side*1.05,centre-9.44,centre+9.44);
    if(Math.abs(z-j.z)<.5)z=j.z-side*.95;
  }
  return worldPoint(frame,x,Math.min(2.37,eye-frame.y+.22+Math.sin(pitch)*.38),z);
}
