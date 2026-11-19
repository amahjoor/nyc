// These are actors in the same crowd batches as shop staff and sidewalk walkers.
// Local positions let riders keep their place when a train moves or turns.
import { dress, seeded } from './crowd.js';
import { DOORS, PLATFORM_EDGE, TRAIN_X, WAITING_RIDERS } from './subway-service.js';
import { localFloor, worldPoint } from './subway-space.js';

export function createSubwayRiders(){
  const platform=[],car=[],visible=[];
  let station,service,dwell,tick=0;
  function cast(spots,seed,aboard){
    return spots.map(([x,z],i)=>({
      localX:x,localZ:z,aboard,subway:true,localHeading:aboard?1.45:-1.3,phase:i*.73,stride:0,
      look:dress(['office','casual','visitor','suit','worker'][i%5],seeded(seed+i*97))
    }));
  }
  function cross(actor,boarding){
    if(!actor)return;
    const door=DOORS.reduce((a,b)=>Math.abs(b-actor.localZ)<Math.abs(a-actor.localZ)?b:a);
    // Line up with the opening on this side before crossing the threshold.
    const aisle=TRAIN_X+.55;
    actor.path=boarding?[[actor.localX,door],[aisle,door],[aisle,door+1.8],[TRAIN_X-.83,door+1.8]]:
      [[aisle,actor.localZ],[aisle,door],[-1.7,door],[-1.7,door+1.4]];
  }
  function step(j,shownStation,dt){
    tick++;
    if(station!==shownStation){
      station=shownStation;
      platform.splice(0,platform.length,...cast([...WAITING_RIDERS,[1.24,-8.3]],8123+station.index*1171,false));
    }
    if(service!==j.service){
      service=j.service;
      car.splice(0,car.length,...cast([-4,7.5,17,30].map(z=>[TRAIN_X-.91,z]),3401+Math.floor(service?.base||0),true));
    }
    if(j.doorsOpen && dwell!==j.platform){
      dwell=j.platform;
      // Different doors let passengers get off without meeting the boarding queue.
      cross(car.find(a=>a.localZ>28)||car.at(-1),false);
      if(j.nextPlatform)cross(platform[1],true);
    }else if(j.phase!=='dwell')dwell=null;
    for(const group of [platform,car]){
      for(let i=group.length-1;i>=0;i--){
        const a=group[i];
        if(a.stepTick===tick)continue;
        a.stride=0;
        if(!a.path)continue;
        if(!j.doorsOpen){a.path=null;continue;}
        const [x,z]=a.path[0],dx=x-a.localX,dz=z-a.localZ;
        a.stepTick=tick;
        const d=Math.hypot(dx,dz),step=Math.min(d,1.5*dt);
        const nextX=a.localX+dx*step/(d||1),nextZ=a.localZ+dz*step/(d||1);
        // Let the player pass through a door first if they meet there.
        if(Math.hypot(nextX-j.x,nextZ-j.z)<.57 &&
           Math.hypot(a.localX-j.x,a.localZ-j.z)>=Math.hypot(nextX-j.x,nextZ-j.z))continue;
        a.localX=nextX;a.localZ=nextZ;
        if(step){a.localHeading=Math.atan2(dx,dz);a.stride=1;a.phase+=step*4.6;}
        if(step===d){a.path.shift();if(!a.path.length)a.path=null;}
        if(a.aboard!==(a.localX<PLATFORM_EDGE)){
          a.aboard=!a.aboard;group.splice(i,1);(a.aboard?car:platform).push(a);
        }
      }
    }
  }
  function draw(view,frame){
    visible.length=0;
    for(const [group,actors] of [[view.station,platform],[view.train,car]]){
      if(!group.visible)continue;
      const f={x:group.position.x,y:group.position.y,z:group.position.z,angle:group.rotation.y};
      for(const actor of actors){
        Object.assign(actor,worldPoint(f,actor.localX,actor.aboard?0:localFloor(actor.localZ,!frame.belowGrade),actor.localZ));
        actor.heading=f.angle+actor.localHeading;visible.push(actor);
      }
    }
  }
  function clear(x,z,aboard){
    return !(aboard?car:platform).some(a=>Math.hypot(a.localX-x,a.localZ-z)<.54);
  }
  return {step,draw,visible,clear};
}
