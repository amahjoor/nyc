// Nearby cyclists follow the directed DOT network. Junction connectors join the
// offset wheel tracks of two blocks which share a mapped intersection.
import * as THREE from './vendor/three.module.min.js';
import { receiveImpulse, stepImpulse } from './character-physics.js';
import { bikeGeometry, createBikeParts } from './bikes.js';
import { PEDAL_PERIOD } from './cycling.js';
import { lanePoint } from './bike-lanes.js';
import { vehicleAspect, stopDistance } from './signal-plan.js';

function point(edge, distance) {
  const {lane,reverse}=edge, sign=reverse?-1:1;
  const p=lanePoint(lane,reverse?lane.length-distance:distance,lane.both?sign*lane.halfWidth*.52:0);
  return {...p,dx:p.dx*sign,dz:p.dz*sign};
}

function connector(a,b,t) {
  const u=1-t, arm=Math.hypot(b.x-a.x,b.z-a.z)*.43;
  const x1=a.x+a.dx*arm,z1=a.z+a.dz*arm,x2=b.x-b.dx*arm,z2=b.z-b.dz*arm;
  const x=u*u*u*a.x+3*u*u*t*x1+3*u*t*t*x2+t*t*t*b.x;
  const z=u*u*u*a.z+3*u*u*t*z1+3*u*t*t*z2+t*t*t*b.z;
  const dx=u*u*(x1-a.x)+2*u*t*(x2-x1)+t*t*(b.x-x2);
  const dz=u*u*(z1-a.z)+2*u*t*(z2-z1)+t*t*(b.z-z2), norm=Math.hypot(dx,dz)||1;
  return {x,z,dx:dx/norm,dz:dz/norm};
}

function nextEdge(r,index,heightAt) {
  const edge=r.edge, a=point(edge,edge.lane.length);
  let best=null,score=-Infinity,reverse=null;
  for(const option of index.departures.get(edge.end)||[]) {
    if(option===edge)continue;
    const b=point(option,0),level=heightAt(b.x,b.z,option.lane.level);
    if(level==null || Math.abs(level-r.y)>1.6 || Math.hypot(b.x-a.x,b.z-a.z)>26)continue;
    if(option.lane===edge.lane){reverse=option;continue;}
    const alignment=a.dx*b.dx+a.dz*b.dz;
    if(alignment<-.8)continue;
    const preference=alignment+(edge.lane.street && option.lane.street===edge.lane.street? .45:0)
      +.35*Math.sin(r.id*7+option.lane.id*13);
    if(preference>score){score=preference;best=option;}
  }
  return best||reverse;
}

// Only consult the intersection at the approaching end of this block. An
// overpass never inherits the signal belonging to the road beneath it.
function intersectionLimit(r,context,dt) {
  const {edge}=r, remaining=edge.lane.length-r.d;
  if(remaining>32 || edge.lane.level!==13 || r.bridge)return Infinity;
  const end=point(edge,edge.lane.length);
  if(r.signalEdge!==edge || r.signalSource!==context.junctions){
    let dist=Infinity;
    r.signalEdge=edge;r.signalSource=context.junctions;r.signal=null;
    const x=edge.junction?edge.junction[0]/10:end.x,z=edge.junction?edge.junction[1]/10:end.z;
    for(const j of context.junctions||[]){
      if(!j.plan)continue;
      const gap=Math.hypot(j.x-x,j.z-z);
      if(gap<dist && gap<(edge.junction?10:18)){r.signal=j;dist=gap;}
    }
  }
  const nearest=r.signal;
  if(!nearest || r.cleared===nearest)return Infinity;
  const group=Math.abs(Math.cos(Math.atan2(end.dx,end.dz)-nearest.plan.axis))>Math.cos(.61)?0:1;
  const crossing=edge.reverse?edge.lane.entry:edge.lane.exit;
  const toLine=crossing>0 ? remaining-crossing :
    remaining+(nearest.x-end.x)*end.dx+(nearest.z-end.z)*end.dz-stopDistance(nearest.plan,group);
  if(toLine<-.6){r.cleared=nearest;return Infinity;}
  const {aspect}=vehicleAspect(nearest.plan,group,context.time);
  if(aspect==='green'){r.wait=0;return Infinity;}
  if(aspect==='yellow' && toLine<r.speed*r.speed/7+.6){r.cleared=nearest;return Infinity;}
  if(aspect==='stop' && toLine<.24 && r.speed<.25){
    r.wait+=dt;
    if(r.wait>=1){r.cleared=nearest;return Infinity;}
  }
  return Math.min(Math.sqrt(5*Math.max(0,toLine)),Math.max(0,toLine)*2.2);
}

function riderLimit(r,context,riders,dx,dz) {
  let limit=Infinity;
  function yieldTo(other,width,spacing){
    if(!other || other===r || Math.abs(r.y-(other.y??0))>1.8)return;
    const x=other.x-r.x,z=other.z-r.z,along=x*dx+z*dz;
    if(along<=0 || along>18 || Math.abs(x*dz-z*dx)>width)return;
    limit=Math.min(limit,Math.max(0,along-spacing)*1.15);
  }
  for(const other of riders)yieldTo(other,.86,2.35);
  for(const car of context.cars||[]){
    yieldTo(car,1.30,3.65);
    if(Math.abs(car.speed||0)<1 || Math.abs(r.y-(car.y??0))>1.8)continue;
    const x=car.x-r.x,z=car.z-r.z,gap=x*dx+z*dz,cross=x*dz-z*dx;
    if(gap<2||gap>16||Math.abs(cross)>18)continue;
    const vx=Math.sin(car.angle)*car.speed,vz=Math.cos(car.angle)*car.speed,lateral=vx*dz-vz*dx;
    if(Math.abs(lateral)<1)continue;
    const t=-cross/lateral,at=gap+t*(vx*dx+vz*dz);
    if(t>0 && t<2.2 && at>0 && Math.abs(at-r.speed*t)<3.8)limit=Math.min(limit,Math.max(0,at-3.4)*.62);
  }
  for(const person of context.people||[])yieldTo(person,.83,1.4);
  yieldTo(context.player,.88,1.6);
  return limit;
}

function nearestAlong(lane,focus) {
  let closest=Infinity,d=0;
  for(let i=1;i<lane.points.length;i++){
    const a=lane.points[i-1],b=lane.points[i],len=lane.cumulative[i]-lane.cumulative[i-1];
    if(!len)continue;
    const t=Math.max(0,Math.min(1,((focus.x-a[0])*(b[0]-a[0])+(focus.z-a[1])*(b[1]-a[1]))/(len*len)));
    const gap=Math.hypot(a[0]+t*(b[0]-a[0])-focus.x,a[1]+t*(b[1]-a[1])-focus.z);
    if(gap<closest){closest=gap;d=lane.cumulative[i-1]+len*t;}
  }
  return d;
}

export function createBikeTraffic({scene,index,heightAt,appearance,capacity=14,random=Math.random}) {
  const riders=[],figures=[],matrix=new THREE.Object3D(),meshes=[];
  const parts=createBikeParts(scene,capacity);
  const paint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.26});
  for(const personal of [false,true]){
    const mesh=new THREE.InstancedMesh(bikeGeometry(personal,true),paint,capacity);
    mesh.name=personal?'Commuter bicycles':'Citi Bike riders';mesh.count=0;
    mesh.frustumCulled=false;mesh.castShadow=true;scene?.add(mesh);meshes.push(mesh);
  }
  let counter=0,spawnIn=0,origin=null;
  function spawn(focus,context){
    const pool=[...index.within({minX:focus.x-125,maxX:focus.x+125,minZ:focus.z-125,maxZ:focus.z+125})];
    if(!pool.length)return;
    const hours=context.hours??12, target=Math.min(capacity,hours<6||hours>=23?4:hours<10||hours>=16&&hours<20?14:10);
    const cold=!origin || Math.hypot(focus.x-origin.x,focus.z-origin.z)>180;
    origin={x:focus.x,z:focus.z};
    for(let tries=0;tries<target*6 && riders.length<target;tries++){
      const lane=pool[Math.floor(random()*pool.length)];
      if(lane.length<8)continue;
      const edge=lane.edges[Math.floor(random()*lane.edges.length)],near=nearestAlong(lane,focus);
      const lo=Math.max(2,near-120),hi=Math.min(lane.length-2,near+120);
      const along=lo+random()*(hi-lo),d=edge.reverse?lane.length-along:along;
      const p=point(edge,d),gap=Math.hypot(p.x-focus.x,p.z-focus.z),y=heightAt(p.x,p.z,lane.level);
      if(gap<(cold?14:40) || gap>130 || y==null || Math.abs(y-(focus.y??0))>12 ||
        riders.some(r=>Math.hypot(r.x-p.x,r.z-p.z)<9) || context.blocked?.(p.x,p.z,y))continue;
      const id=++counter,cruise=3.45+random()*2.7;
      riders.push({id,edge,d,x:p.x,z:p.z,y,heading:Math.atan2(p.dx,p.dz),speed:cruise,cruise,
        look:appearance(id,p.x,p.z),style:id%3===0?0:1,pedal:random(),wheel:0,wait:0,bridge:null,cleared:null});
    }
  }
  function afterImpact(r,dt,ctx){
    const bike=r.crash;
    if(r.reaction){
      bike.lean=Math.min(1.34,bike.lean+dt*3.8);
      stepImpulse(r,dt,(actor,x,z)=>ctx.blocked?.(x,z,actor.y)?{x:actor.x,z:actor.z}:{x,z},
        actor=>heightAt(actor.x,actor.z,r.edge.lane.level)??bike.y);
    }else{
      const dx=bike.x-r.x,dz=bike.z-r.z,gap=Math.hypot(dx,dz);
      if(gap>.18){
        r.heading=Math.atan2(dx,dz);const distance=Math.min(1.2*dt,gap);
        r.x+=dx*distance/gap;r.z+=dz*distance/gap;r.y=heightAt(r.x,r.z,r.edge.lane.level)??bike.y;
        r.returnTime+=dt;
      }else{
        bike.lean=Math.max(0,bike.lean-dt*1.9);
        if(!bike.lean){
          Object.assign(r,{x:bike.x,y:bike.y,z:bike.z,heading:bike.heading,crash:null,footDown:1});
        }
      }
    }
  }
  function step(r,dt,ctx){
    if(r.crash){afterImpact(r,dt,ctx);return;}
    const hit=ctx.contactCar?.(r.x,r.z,r.y);
    if(hit && Math.abs(hit.car.speed)>3.2){
      const car=hit.car,vx=Math.sin(car.angle)*car.speed,vz=Math.cos(car.angle)*car.speed;
      const closing=(vx-r.speed*Math.sin(r.heading))*hit.nx+(vz-r.speed*Math.cos(r.heading))*hit.nz;
      if(closing>2.6){
        r.crash={x:r.x,y:r.y,z:r.z,heading:r.heading,lean:0};r.returnTime=0;
        receiveImpulse(r,vx*.35+hit.nx*1.4,vz*.35+hit.nz*1.4,{fall:true,lift:1.7,rest:.8});
        r.speed=0;afterImpact(r,dt,ctx);return;
      }
    }
    let direction=r.bridge?connector(r.bridge.a,r.bridge.b,r.bridge.t):point(r.edge,r.d);
    const endDistance=r.edge.lane.length-r.d;
    r.retryIn=Math.max(0,(r.retryIn||0)-dt);
    if(!r.bridge && endDistance<28 && (r.next===undefined || r.next===null&&!r.retryIn)){
      r.next=nextEdge(r,index,heightAt);r.retryIn=1.2;
    }
    r.surfaceCheck=(r.surfaceCheck||0)-dt;
    if(r.surfaceCheck<=0){
      const d=Math.min(r.edge.lane.length,r.d+Math.max(2.2,r.speed*.75));
      const probe=r.bridge?connector(r.bridge.a,r.bridge.b,Math.min(1,r.bridge.t+.3)):point(r.edge,d);
      const floor=heightAt(probe.x,probe.z,r.edge.lane.level);
      r.obstructed=floor==null || Math.abs(floor-r.y)>2.5 || ctx.blocked?.(probe.x,probe.z,floor);
      r.surfaceCheck=.3;
    }
    const desired=Math.min(r.obstructed?0:r.cruise,intersectionLimit(r,ctx,dt),riderLimit(r,ctx,riders,direction.dx,direction.dz),
      r.next===null?Math.max(0,endDistance-.55)*1.5:Infinity);
    r.speed+=Math.max(-4.6*dt,Math.min(1.55*dt,desired-r.speed));
    let travel=r.speed*dt;
    for(let steps=0;travel>0 && steps<4;steps++){
      if(r.bridge){
        const c=r.bridge,available=(1-c.t)*c.length,advance=Math.min(travel,available);
        c.t=Math.min(1,c.t+advance/c.length);travel-=advance;direction=connector(c.a,c.b,c.t);
        if(advance>=available-1e-7){r.edge=c.edge;r.d=0;r.bridge=null;r.next=undefined;r.cleared=null;r.wait=0;}
        continue;
      }
      const remaining=r.edge.lane.length-r.d,advance=Math.min(travel,remaining);
      r.d+=advance;travel-=advance;direction=point(r.edge,r.d);
      if(remaining-advance>.00001)break;
      const edge=r.next||nextEdge(r,index,heightAt);
      if(!edge){r.next=null;r.speed=0;break;}
      const b=point(edge,0),length=Math.max(.01,Math.hypot(direction.x-b.x,direction.z-b.z)*1.12);
      r.bridge={edge,a:direction,b,length,t:0};r.next=undefined;
    }
    const y=heightAt(direction.x,direction.z,r.edge.lane.level);
    if(y!=null){r.x=direction.x;r.z=direction.z;r.y=y;}
    if(r.speed>.04)r.heading=Math.atan2(direction.dx,direction.dz);
    const stopped=r.speed<.18?1:0;
    r.footDown=(r.footDown||0)+Math.max(-dt*3.5,Math.min(dt*3.5,stopped-(r.footDown||0)));
    r.wheel+=r.speed*dt/(.345*((r.look.height||1.76)/1.76));
    r.pedal+=dt*Math.min(1.55,r.speed/4.3);
  }
  return {riders,figures,meshes,update(focus,dt,context={}){
    parts.reset();figures.length=0;for(const mesh of meshes)mesh.count=0;
    if(!context.visible){spawnIn=0;return;}
    for(let i=riders.length-1;i>=0;i--)if(Math.hypot(riders[i].x-focus.x,riders[i].z-focus.z)>165)riders.splice(i,1);
    spawnIn-=dt;
    if(spawnIn<=0){spawn(focus,context);spawnIn=.85;}
    // Cap substeps so signal stops and wheel tracks stay stable on slow frames.
    let remaining=Math.min(.5,dt);
    while(remaining>1e-6){const slice=Math.min(remaining,1/30);for(const r of riders)step(r,slice,context);remaining-=slice;}
    for(const r of riders){
      const scale=(r.look.height||1.76)/1.76;
      const bike=r.crash||r,lean=r.crash?.lean||0;
      matrix.scale.setScalar(scale);matrix.position.set(bike.x,bike.y,bike.z);matrix.rotation.set(0,bike.heading,lean,'YXZ');matrix.updateMatrix();
      const mesh=meshes[r.style];mesh.setMatrixAt(mesh.count++,matrix.matrix);
      const phase=r.pedal*2*Math.PI/PEDAL_PERIOD;
      parts.draw(bike.x,bike.y,bike.z,bike.heading,r.wheel,phase,scale,lean);
      if(r.crash){
        const returning=Math.hypot(bike.x-r.x,bike.z-r.z)>.18;
        figures.push({x:r.x,y:r.y,z:r.z,heading:r.heading,look:r.look,clip:r.reaction?.clip||(returning?'walk':'pickUp'),
          time:r.reaction?.time??(returning?r.returnTime:(1.34-lean)/1.9),stride:returning?1:0,phase:r.returnTime*5,
          downUntil:r.reaction?.fall && !r.reaction.recover?Infinity:0});
        continue;
      }
      figures.push({x:r.x,y:r.y,z:r.z,heading:r.heading,look:r.look,
        clip:r.footDown===1?'cycleStop':'cycle',from:r.footDown>0&&r.footDown<1?'cycleStop':null,
        fade:r.footDown,fromTime:r.pedal,time:r.pedal,cycling:true,phase});
    }
    for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }};
}
