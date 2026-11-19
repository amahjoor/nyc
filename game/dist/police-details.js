import { UNIT, POLICE_UNITS, unitHash } from './police-units.js';
import { patrolAppearance } from './human-cast.js';
import { snapToKerb } from './street-props.js';
import { walkTowards } from './pedestrian-motion.js';

const byPost=POLICE_UNITS.reduce((groups,u)=>{(groups[u.post] ||= []).push(u);return groups;},{});
const rank={case:0,water:1,air:1,park:2,precinct:2,school:3,waterfront:3,subway:4,housing:5,community:6,road:7,street:8};
const routines={
  patrol:['idle','talk'], talk:['talk','idle'], brief:['talk','idle'], inspect:['crouch','reach'],
  interview:['talk','reach'], direct:['reach','idle'], dog:['idle','idle'], horse:['horseRide'],
  motor:['motorRide'], boat:['idle','idle'], flight:['idle','idle'],
};

/** Pick accessible posts on the streamed map. Nothing here is a real deployment schedule. */
export function planPolicePosts({focus,fronts=[],entrances=[],walks=[],boardings=[],kerbs,park,parkRegions=[],isClosed=()=>false,
  isWater=()=>false,blocked=()=>false,lotAt=()=>null}) {
  if(!kerbs || !walks.length)return [];
  const candidates=[];
  const add=(id,post,x,z,tx,tz,reach,unitId=null)=>{
    const gap=Math.hypot(x-focus.x,z-focus.z);
    if(gap>144)return;
    const hash=unitHash(id), pool=byPost[post], unit=UNIT[unitId] || pool[hash%pool.length];
    candidates.push({id,post,unit,x,z,tx,tz,reach,hash,gap});
  };
  function land(id,post,x,z,unitId=null) {
    if(Math.hypot(x-focus.x,z-focus.z)>165)return;
    const e=snapToKerb(kerbs,x,z,35);
    if(!e)return;
    // Leave the subway stairs and their railings clear. Try both ends when a
    // doorway, tree, or other fixture occupies the first landing.
    const offsets=post==='subway' ? [6,-6] : [0,3,-3];
    for(const offset of offsets){
      if(Math.abs(offset)>e.room)continue;
      const px=e.x-e.nx*1.35+e.tx*offset,pz=e.z-e.nz*1.35+e.tz*offset;
      if(blocked(px,pz))continue;
      add(id,post,px,pz,e.tx,e.tz,Math.min(post==='subway'?2:4.5,(e.room-Math.abs(offset))*.65),unitId);
      break;
    }
  }
  for(const f of fronts){
    const {place}=f, kind=place.kind;
    if(isClosed(place)) land('case-'+place.id,'case',f.x,f.z,unitHash(place.id)%4===0?'scene':kind==='bank'?'major':'robbery');
    else if(kind==='police')land('precinct-'+place.id,'precinct',f.x,f.z);
    else if(kind==='school')land('school-'+place.id,'school',f.x,f.z);
    else if(kind==='ferry')land('dock-'+place.id,'waterfront',f.x,f.z);
    else if(['library','courthouse','museum'].includes(kind)) land('community-'+place.id,'community',f.x,f.z);
  }
  for(const e of entrances)land('transit-'+(e.station?.id ?? '')+'-'+Math.round(e.x)+'-'+Math.round(e.z),'subway',e.x,e.z);
  for(const b of boardings){
    if(Math.hypot(b.board.x-focus.x,b.board.z-focus.z)>150)continue;
    if(b.type==='helicopter')land('aviation-'+b.id,'air',b.board.x,b.board.z,'aviation');
    if(!['ferry','waterTaxi','kayak'].includes(b.type))continue;
    land('waterfront-'+b.id,'waterfront',b.board.x,b.board.z);
    const dx=Math.sin(b.angle),dz=Math.cos(b.angle);
    for(const side of [1,-1]){
      const x=b.berth.x+dz*side*12,z=b.berth.z-dx*side*12;
      if(![[0,0],[dx*4,dz*4],[-dx*4,-dz*4],[dz*2,-dx*2],[-dz*2,dx*2]].every(([i,j])=>isWater(x+i,z+j)))continue;
      add('harbor-'+b.id,'water',x,z,dx,dz,0,'harbor');break;
    }
  }
  let backupBeat;
  for(const walk of walks){
    if((walk.points?.length || 0)<2 || walk.length<12)continue;
    const [a,b]=walk.points, x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
    if(Math.hypot(x-focus.x,z-focus.z)>140)continue;
    const id='beat-'+walk.id, hash=unitHash(id);
    const f=park?.frame, dx=x-(f?.x || 0),dz=z-(f?.z || 0);
    const across=f && dx*f.cos+dz*f.sin, along=f && dz*f.cos-dx*f.sin;
    const inPark=(f && across>=-8 && across<=park.size.width+8 && along>=-8 && along<=park.size.depth+8) ||
      parkRegions.some(({id,bounds})=>id!=='central-park' && bounds && x>=bounds.minX && x<=bounds.maxX && z>=bounds.minZ && z<=bounds.maxZ);
    const use=lotAt(x-walk.normals[0][0]*8,z-walk.normals[0][1]*8)?.use;
    if(!inPark && (!backupBeat || hash<backupBeat.hash))backupBeat={id,x,z,hash};
    if(inPark)land(id,'park',x,z);
    else if(hash%5===0 && (use===2||use===3))land(id,'housing',x,z);
    else if(hash%11===0)land(id,'road',x,z);
    else if(hash%17===0)land(id,'street',x,z);
  }
  if(backupBeat && !candidates.some(c=>c.post==='street')){
    land(backupBeat.id+'-patrol','street',backupBeat.x,backupBeat.z,'patrol');
  }
  candidates.sort((a,b)=>rank[a.post]-rank[b.post] || a.gap-b.gap || a.hash-b.hash);
  const posts=[];
  for(const candidate of candidates){
    if(posts.length>=6)break;
    if(posts.some(o=>o.post===candidate.post || Math.hypot(o.x-candidate.x,o.z-candidate.z)<12))continue;
    posts.push(candidate);
  }
  return posts;
}

/** Actual actors retain their pose clock, location and current activity as scenery streams. */
export function ridingPose(job, height){
  const hips=height*.52;
  if(job==='horse')return {clip:'horseRide',lift:1.785-hips};
  if(job==='motor')return {clip:'motorRide',lift:.975-hips};
  return null;
}

export function createPoliceDetails(){
  let actors=[];
  return {
    get actors(){return actors;},
    set(posts){
      const existing=new Map(actors.map(a=>[a.id,a]));
      actors=posts.map(post=>{
        const kept=existing.get(post.id);
        if(kept?.unit===post.unit.id && Math.hypot(kept.post.x-post.x,kept.post.z-post.z)<1){
          kept.post=post;return kept;
        }
        const look=patrolAppearance(post.id,0,post.unit.id), ride=ridingPose(post.unit.activity,look.height);
        return {id:post.id,unit:post.unit.id,post,x:post.x,z:post.z,y:0,heading:Math.atan2(post.tx,post.tz),
          look,ride,rideLift:ride?.lift || 0,clip:ride?.clip || 'idle',time:0,phase:0,stride:0,direction:1,
          pause:2+post.hash%5,visits:0};
      });
    },
    step(dt,{ground,blocked,people=[],player,waterLevel=0,incident=null}){
      for(const a of actors){
        const p=a.post, job=p.unit.activity, clips=routines[job], marine=job==='boat', mounted=job==='horse', motor=job==='motor';
        a.y=marine ? waterLevel+1.05 : ground(a.x,a.z);
        const rider=mounted||motor, staticPost=marine||job==='flight'||motor||job==='direct'||p.reach<.8;
        if(dt<=0)continue;
        let clip;
        if(incident && Math.hypot(incident.x-a.x,incident.z-a.z)<28){
          clip=p.unit.sworn?'talk':'cower';
          if(!rider && !marine)a.heading=Math.atan2(incident.x-a.x,incident.z-a.z);
        } else if(a.pause>0 || staticPost){
          a.pause-=dt;
          if(staticPost && a.pause<=0){a.visits++;a.pause=4;}
          clip=clips[a.visits%clips.length];
          if(job==='talk'||job==='interview'){
            const listener=people.find(o=>Math.abs(o.y-a.y)<1.5 && Math.hypot(o.x-a.x,o.z-a.z)<3);
            if(listener)a.heading=Math.atan2(listener.x-a.x,listener.z-a.z);
          }
        } else {
          const x=p.x+p.tx*p.reach*a.direction,z=p.z+p.tz*p.reach*a.direction;
          const px=a.x,pz=a.z, nearby=[...actors,player,...people].filter(o=>o && o!==a && Math.abs(o.y-a.y)<1.5 && Math.hypot(o.x-px,o.z-pz)<2.8);
          const moved=walkTowards(a,x,z,dt*(mounted?1.35:1.05),nearby,(x,z)=>!blocked(x,z),nearby,dt);
          if(moved>.001){a.heading=Math.atan2(a.x-px,a.z-pz);a.phase+=moved*4;}
          clip=moved>.001?'walk':'idle';
          if(Math.hypot(x-a.x,z-a.z)<.25 || (dt>0 && moved<.001)){
            a.direction*=-1;a.visits++;a.pause=3+p.hash%4;
          }
        }
        a.stride=clip==='walk'?1:0;
        if(rider)clip=a.ride.clip;
        if(a.clip!==clip){a.from=a.clip;a.fromTime=a.time;a.fade=1;a.time=0;}
        a.fade=Math.max(0,(a.fade||0)-dt*4);
        a.clip=clip;a.time=rider?a.phase/(2*Math.PI)*.8:a.time+dt;
      }
    }
  };
}
