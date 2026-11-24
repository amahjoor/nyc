import * as T from '../vendor/three.module.min.js';
import { buildRoom } from '../interiors.js';
import { dress, seeded } from '../crowd.js';
import { populateShop, inviteCustomer } from '../shop-life.js';
import { roomLocal, roomPoint } from '../room.js';
import { Shopping } from '../shopping.js';
import { carriedItems } from '../carried-items.js';

// Each phase name is emitted by the facility's own service itinerary. The
// preview advances that itinerary until the actor is partway through the task.
const studies=[
  {id:'cafe',name:'Café pickup',kind:'coffee',venue:'Café',stages:[
    ['handoff','Drink handoff','handing over drink','pair'],['order','Paying at the counter','ordering and paying','pair'],
    ['brew','Preparing the drink','Barista · ','work'],['collect','Collecting a drink','picking up drink','work'],
    ['sit','Drinking at a table','drinking','table']]},
  {id:'bar',name:'Bar service',kind:'bar',venue:'Bar',stages:[
    ['prepare','Preparing a drink','Bartender · ','work'],['serve','Serving at the bar','handing over drink','pair']]},
  {id:'restaurant',name:'Restaurant table service',kind:'italian',venue:'Italian restaurant',stages:[
    ['serve','Serving a plate','setting down plate','pair'],['order','Taking the order','taking table order','pair'],
    ['kitchen','In the kitchen','Chef · ','work'],['dine','Eating at the table','eating','table'],
    ['check','Settling the check','settling check','pair']]},
  {id:'jeweler',name:'Jewelry consultation',kind:'jewelry',venue:'Jewelry store',stages:[
    ['show','Presenting a ring','showing ring','pair'],['browse','Browsing rings','looking at rings','display'],
    ['lift','Opening the case','lifting ring from case','work'],['return','Returning the ring','returning ring','pair']]},
  {id:'grocery',name:'Grocery checkout',kind:'grocery',venue:'Grocery store',stages:[
    ['handoff','Returning the purchase','returning purchase','pair'],['browse','Reading a package','reading the package','display'],
    ['scan','Scanning groceries','scanning groceries','pair'],['pay','Paying the clerk','paying for groceries','pair']]},
];
function replay(plan,group,phase){
  const shopping=new Shopping({player:{}}),view={plan,group,shopping,actors:[],occupied:new Set(),floor:0,door:group.userData.door};
  populateShop(view);
  const random=seeded(2037),visitors=[0,1,2].map(i=>({
    state:'walk',run:{},age:5,phase:0,y:0,x:-.42+i*.42,z:2+i*.25,look:{...dress('casual',random),pace:1.5}
  }));
  const entered=new Set(),elapsed=new WeakMap();
  for(let tick=0;tick<4400;tick++){
    const dt=.05,time=20+tick*dt;
    view.door.step(dt);
    inviteCustomer(view,visitors.filter(p=>p.visit||!entered.has(p)),time,()=>{});
    for(const p of visitors){
      const visit=p.visit;
      if(!visit)continue;
      entered.add(p);
      visit.step(p,dt,time);
      if(!visit.task || (phase.endsWith(' · ')?!visit.phase.startsWith(phase)||!visit.employee?.preparation:visit.phase!==phase))continue;
      const seconds=(elapsed.get(visit.task)||0)+dt;
      elapsed.set(visit.task,seconds);
      if(seconds>=.30){
        group.userData.updateDoor();
        group.userData.syncGroceries?.(shopping);
        return {view,visit,actors:[...view.actors,...view.visitors]};
      }
    }
  }
  throw new Error('The visit did not reach “'+phase+'”.');
}
function asPoint(plan,mark){
  if(!mark)return null;
  if(Number.isFinite(mark.x))return new T.Vector3(mark.x,mark.sitting?1.00:1.22,mark.z);
  const [x,z]=roomPoint(plan,mark.a,mark.b);
  return new T.Vector3(x,Math.min(1.52,Math.max(.68,(mark.y||0)+(mark.h||.95))),z);
}
function shotFor(plan,visit,actors,shot){
  const task=visit.task,active=task.actor;
  const subjects=shot==='pair'?[visit.person,visit.employee]:shot==='work'?[active,task.face]:
    shot==='table'?[visit.person,visit.table]:[visit.person,visit.display||visit.slot];
  const marks=subjects.map(s=>asPoint(plan,s)).filter(Boolean),target=marks[0].clone();
  if(marks[1])target.lerp(marks[1],.48);
  const pair=marks.length>1?marks[1].clone().sub(marks[0]):new T.Vector3(1,0,0);
  const radius=Math.max(1.95,Math.min(3.05,pair.length()*.94+1.05));pair.y=0;pair.normalize();
  let best,high=-Infinity;
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,dir=new T.Vector3(Math.cos(angle),0,Math.sin(angle));
    const eye=target.clone().addScaledVector(dir,radius);eye.y=target.y+.58;
    const point=roomLocal(plan,eye.x,eye.z);
    let score=1.2*(1-Math.abs(dir.dot(pair)))+.4*dir.z;
    if(Math.abs(point.a)>plan.width/2-.12||point.b<.12||point.b>plan.depth-.12)score-=60;
    for(const actor of actors){
      if(subjects.includes(actor))continue;
      const delta=new T.Vector3(actor.x-target.x,0,actor.z-target.z);
      const along=delta.dot(dir);
      if(along>.12&&along<radius+.25&&delta.addScaledVector(dir,-along).length()<.52)score-=6;
    }
    // Avoid sightlines through a wall rack or a tall display. Low counters
    // and the consultation case remain visible below the camera's eyeline.
    for(let step=1;step<=10;step++){
      const p=target.clone().lerp(eye,step/10),at=roomLocal(plan,p.x,p.z);
      if(plan.things.some(t=>t.solid && t.y<=p.y && t.y+t.h>p.y-.05 &&
        Math.abs(at.a-t.a)<t.w/2+.04 && Math.abs(at.b-t.b)<t.d/2+.04))score-=2.5;
    }
    if(score>high){high=score;best=eye;}
  }
  return {position:best.toArray(),target:target.toArray()};
}
export function sceneEntries({makePlan,actorObject,owned,dispose}){
  return studies.map(study=>({
    id:'scene-'+study.id,name:study.name,collection:'Service scenes',group:study.venue,
    source:'facility-visits.js',model:study.kind,view:'room',places:[study.venue],tags:[study.kind,...study.stages.flat()],
    detail:'Simulated service visit · select a moment',variants:study.stages.map(([id,label])=>({id,label})),
    async build(id){
      const stage=study.stages.find(s=>s[0]===id)||study.stages[0];
      const place={id:study.id,kind:study.kind,x:0,z:0,name:''};
      const plan=makePlan(place,'service'),group=buildRoom(plan),people=[];
      let held;
      function cleanup(){held?.dispose();for(const person of people)dispose(person);group.userData.dispose();}
      try{
        const {actors,visit}=replay(plan,group,stage[2]);
        group.userData.inspectionView=shotFor(plan,visit,actors,stage[3]);
        held=carriedItems(actors.length);
        for(const actor of actors){
          const clip=actor.clip||(actor.spot?.treadmill?'jog':'idle');
          const person=await actorObject(actor,clip,true);
          people.push(person);group.add(person);
          for(const part of person.userData.prepProps||[])held.add(part.tool,part.point,actor.heading||0,part.rotation,null,part.size);
          if(actor.carry)held.add(actor.carry,person.userData.carryPoint,actor.heading||0);
        }
        // Empty instance batches have no meaningful bounds for an inspector.
        for(const mesh of [...held.group.children])if(!mesh.count)mesh.removeFromParent();
        group.add(held.group);
        return owned(group,cleanup);
      }catch(error){cleanup();throw error;}
    },dispose
  }));
}
