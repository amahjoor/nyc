// Compare paths in the current road's frame. Positive lateral offsets pass to
// the driver's left. Keep the booked lane as the reference throughout the pass.
import { trafficAtHeight } from './road-level.js';

const SHIFT_SPEED=10, PASS_SPEED=18;

function planPass(sim, car, edge, lane, projection, lateral, sin, cos) {
  const horizon=Math.min(110,Math.max(27,car.speed*2.6));
  const actors=[];
  function observe(other, vehicle) {
    if(other===car || !trafficAtHeight(other,car.y))return;
    const dx=other.x-car.x, dz=other.z-car.z;
    const along=dx*sin+dz*cos, side=lateral+dx*cos-dz*sin;
    const speed=other.speed ?? (other.state==='cross'?1.4:0);
    const reach=horizon+10+Math.abs(speed)*4;
    if(Math.abs(dx)>reach || Math.abs(dz)>reach)return;
    const heading=(other.heading ?? other.angle ?? edge.angle)-edge.angle;
    const forward=Math.cos(heading), left=Math.sin(heading);
    if(Math.abs(side)>10+Math.abs(speed*left)*4 || along < -8-Math.abs(speed)*4 || along>horizon+8+Math.abs(speed)*4)return;
    const length=vehicle?(other.identity?.asset?.design?.L ?? 4.6)/2:(other.edge?.lane ? .95 : .55);
    const width=vehicle?1:.45;
    actors.push({along,side,vx:speed*left,vz:speed*forward,
      length:Math.abs(forward)*length+Math.abs(left)*width,
      width:Math.abs(left)*length+Math.abs(forward)*width});
  }
  for(const other of sim.cars)observe(other,true);
  for(const other of sim._walkers || [])observe(other,false);

  const bodyLength=(car.identity?.asset?.design?.L ?? 4.6)/2;
  const shiftRun=Math.max(1.5,car.speed*.8);
  // Forecast the cab and each nearby actor at the same time along a proposed
  // path. A car coming up from behind matters as much as the queue in front.
  function scan(offset) {
    const cruise=Math.max(1,Math.min(car._cruise,offset?PASS_SPEED:Infinity));
    let seconds=0, speed=Math.max(0,car.speed);
    for(let d=0;d<=horizon;){
      const side=lateral+(offset-lateral)*Math.min(1,d/shiftRun);
      for(const a of actors){
        const ahead=a.along+a.vz*seconds-d, across=a.side+a.vx*seconds-side;
        const nose=Math.max(0,Math.abs(ahead)-(bodyLength-1)-a.length);
        const flank=Math.max(0,Math.abs(across)-a.width);
        if(nose*nose+flank*flank<1.2**2){
          return {room:d,crossing:Math.abs(a.vx)>1.2};
        }
      }
      const step=Math.min(1.5,Math.max(.2,speed*.25));
      const limit=Math.abs(side-offset)>.5 ? Math.min(cruise,SHIFT_SPEED) : cruise;
      const next=speed>limit ? Math.sqrt(Math.max(limit*limit,speed*speed-2*6*step))
        : Math.min(limit,Math.sqrt(speed*speed+2*5.5*step));
      seconds+=2*step/(speed+next);
      d+=step;
      speed=next;
    }
    return {room:Infinity,crossing:false};
  }

  const home=scan(0);
  let offset=0, path=home;
  const current=car._ridePlan?.edge===edge ? car._ridePlan.offset : 0;
  // Ordinary following control matches a slower car well before the two
  // footprints would touch. Request a pass as we enter that headway.
  const slowerLeader=actors.some(a=>a.vz>=0 && a.vz+2<car._cruise && Math.abs(a.vx)<1.2 &&
    Math.abs(a.side)<1.15+a.width && a.along>-(current?bodyLength+a.length+3:0) &&
    a.along<bodyLength+a.length+5+1.5*Math.max(car.speed,a.vz));
  if(home.room<Infinity || slowerLeader){
    const spacing=Math.abs(edge.step) || 3.3;
    // Keep braking in the occupied passing lane if a new hazard closes both
    // paths. Never swerve across the road in response to crossing traffic.
    const offsets=current ? [current] : (car.rideHurry && !home.crossing ? [spacing,-spacing] : []);
    const laneRight=edge.lanes>1?edge.first+edge.step*lane:edge.lane;
    const roadHalf=(edge.road.width ?? 10)/2;
    for(const candidate of offsets){
      if(Math.abs(candidate-laneRight)+1.15>roadHalf)continue;
      const alternate=scan(candidate);
      if(candidate===current){offset=current;path=alternate;}
      if(alternate.room!==Infinity)continue;
      // Check the actual road surface and fixed obstacles before pulling out.
      const reach=Math.min(horizon,(1-projection.t)*edge.length);
      let clear=true;
      for(let d=Math.min(3,reach);clear && d<=reach;d+=3){
        const side=lateral+(candidate-lateral)*Math.min(1,d/shiftRun);
        const x=projection.x+sin*d+cos*side, z=projection.z+cos*d-sin*side;
        clear=!sim._unsupportedDeckExit(car,x,z,'drive') && !sim._carContact(x,z,edge.angle,car);
      }
      if(clear){offset=candidate;path=alternate;break;}
      if(candidate===current)path={room:0};
    }
  }
  const room=Math.max(0,path.room-2);
  return {edge,lane,hurry:car.rideHurry,at:sim.elapsed,offset,speed:Math.min(Math.sqrt(8*room),room*1.2)};
}

export function steerHiredCab(sim, car, edge, lane, projection, target) {
  const sin=Math.sin(edge.angle), cos=Math.cos(edge.angle);
  const lateral=(car.x-projection.x)*cos-(car.z-projection.z)*sin;
  let plan=car._ridePlan;
  if(plan?.edge!==edge || plan.lane!==lane || plan.hurry!==car.rideHurry || sim.elapsed-plan.at>=.12){
    plan=car._ridePlan=planPass(sim,car,edge,lane,projection,lateral,sin,cos);
  }
  const offset=plan.offset;
  if(offset || Math.abs(lateral)>.5){
    const lead=Math.min((1-projection.t)*edge.length,Math.max(1.5,car.speed*.8));
    target.x=projection.x+sin*lead+cos*offset;
    target.z=projection.z+cos*lead-sin*offset;
  }
  const limit=Math.abs(offset-lateral)>.5 ? SHIFT_SPEED : offset ? PASS_SPEED : Infinity;
  return Math.min(plan.speed,limit);
}
