import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.min.js';
import { POLICE_UNITS, UNIFORMS, UNIT } from '../dist/police-units.js';
import { patrolAppearance, memberInfo } from '../dist/human-cast.js';
import { createPoliceScene } from '../dist/police-scene.js';
import { planPolicePosts, createPoliceDetails } from '../dist/police-details.js';
import { animalGeometry } from '../dist/police-equipment.js';
import { indexKerbs } from '../dist/street-props.js';

test('every assignment resolves to fitted crew members and a shipped uniform',async()=>{
  assert.equal(new Set(POLICE_UNITS.map(unit=>unit.id)).size,POLICE_UNITS.length);
  for(const unit of POLICE_UNITS){
    const a=patrolAppearance('unit-car',0,unit.id), b=patrolAppearance('unit-car',1,unit.id);
    assert.notEqual(a.member,b.member);
    assert.equal(memberInfo(a.member).wardrobe,unit.uniform);
    assert.equal(a.unit,unit.id);
    assert.ok(unit.duty && unit.source.startsWith('https://'));
  }
  for(const wardrobe of Object.keys(UNIFORMS)){
    const file='patrol-'+(wardrobe==='patrol'?'jacket':wardrobe)+'.webp';
    assert.ok((await stat(new URL('../dist/human/tex/'+file,import.meta.url))).size>1000);
  }
  assert.equal(UNIT['traffic-agents'].sworn,false);
  assert.equal(UNIT.crossing.sworn,false);
  assert.equal(UNIT.auxiliary.sworn,false);
});

const focus={x:0,z:0}, walks=[{id:'broadway',length:160,points:[[-80,0],[80,0]],normals:[[0,-1]]}];
const context={focus,walks,kerbs:indexKerbs(walks)};
const crewPost=(unit,x)=>({id:unit,post:UNIT[unit].post,unit:UNIT[unit],x,z:1.35,tx:1,tz:0,reach:4,hash:0});

test('street assignments use mapped features, safe berths and stable locations',()=>{
  const input={...context,fronts:[{x:-52,z:2,place:{id:'bank',kind:'bank'}},{x:22,z:1,place:{id:'school',kind:'school'}}],
    entrances:[{x:-20,z:1,station:{id:'midtown'}}],
    boardings:[{type:'ferry',id:'landing',angle:0,board:{x:53,z:0},berth:{x:53,z:45}}]};
  const posts=planPolicePosts(input);
  assert.ok(posts.some(p=>p.post==='subway') && posts.some(p=>p.post==='school'));
  assert.deepEqual(planPolicePosts({...input,isClosed:place=>place.id==='bank'}),posts,'a robbery closure does not add a sidewalk post');
  assert.ok(!posts.some(p=>p.unit.id==='harbor'));
  const harbor=planPolicePosts({...input,isWater:(x,z)=>z>35}).find(p=>p.unit.id==='harbor');
  assert.ok(harbor.z>35);
  assert.deepEqual(posts,planPolicePosts({...input,focus:{x:1,z:0}}).map(p=>({...p,gap:Math.hypot(p.x,p.z)})));
  assert.deepEqual(planPolicePosts({...context,blocked:()=>true}),[]);
  const parkRegions=[{id:'prospect-lake',bounds:{minX:-90,maxX:90,minZ:-10,maxZ:10}}];
  assert.ok(planPolicePosts({...context,parkRegions}).some(post=>post.post==='park'));
});

test('handlers keep their progress as the map streams, and suspend their round during an incident',()=>{
  const detail=createPoliceDetails(), post=crewPost('k9',0);
  detail.set([post]);
  const actor=detail.actors[0], ctx={ground:()=>3,blocked:()=>false,people:[]};
  for(let i=0;i<40;i++)detail.step(.1,ctx);
  assert.ok(actor.x>0 && actor.stride>0);
  detail.set([{...post}]);
  assert.equal(detail.actors[0],actor);
  const at=actor.x;
  detail.step(.1,{...ctx,incident:{x:2,z:1}});
  assert.equal(actor.x,at);
  assert.equal(actor.clip,'talk');
  const time=actor.time;
  detail.step(0,ctx);
  assert.equal(actor.time,time);
});

test('reported deaths get a stable two-person follow-up after patrol clears the area',()=>{
  const c={id:'death',units:['scene','homicide'],x:22,z:2,y:0,reported:10};
  const sites=options=>planPolicePosts({...context,cases:[c],time:36,...options}).filter(p=>p.caseId);
  assert.deepEqual(sites({time:29}),[]);
  assert.deepEqual(sites({incident:{x:25,z:3}}),[]);
  assert.deepEqual(sites({time:251}),[]);
  assert.deepEqual(sites({ground:()=>20}),[]);
  const staff=sites({incident:{x:110,z:0}});
  assert.deepEqual(staff.map(p=>p.unit.id).sort(),['homicide','scene']);
  assert.ok(Math.hypot(staff[0].x-staff[1].x,staff[0].z-staff[1].z)>=1.5);
  assert.deepEqual(staff.map(p=>p.id),sites({}).map(p=>p.id));
});

test('parking and junction staff need street activity, and the signal officer uses the live green phase',()=>{
  const j={id:'corner',x:24,z:0,plan:{control:'signal',axis:0,cycle:30,offset:0,lead:[0,0],green:[10,10],exclusive:0}};
  const parked={id:'8',_kerb:true,parked:true,x:-40,z:0};
  const input={...context,junctions:[j],cars:[parked,{x:23,z:0},{x:28,z:-5}],time:3};
  assert.deepEqual(planPolicePosts(input).filter(p=>['parking','junction'].includes(p.post)).map(p=>p.unit.id),['traffic-agents']);
  const scene=createPoliceScene(new THREE.Scene());
  scene.plan(input);
  input.cars.push({x:24,z:4});
  scene.plan({...input,time:8});
  const director=scene.details.actors.find(a=>a.unit==='traffic-ops');
  assert.ok(director);
  const ctx={ground:()=>0,blocked:()=>false};
  scene.details.step(.1,{...ctx,time:8});
  assert.equal(director.clip,'reach');
  scene.details.step(.1,{...ctx,time:12});
  assert.equal(director.clip,'idle');
  scene.details.step(.1,{...ctx,time:18});
  assert.equal(director.heading,Math.PI/2);
  scene.plan({...input,cars:[],time:26});
  assert.ok(scene.details.actors.includes(director));
  scene.plan({...input,cars:[],time:60});
  assert.ok(!scene.details.actors.some(a=>['traffic-ops','traffic-agents'].includes(a.unit)));
});

test('the canine and the horse have articulated walk frames in metres',async()=>{
  for(const kind of ['dog','horse']){
    const geometry=animalGeometry(JSON.parse(await readFile(new URL('../dist/assets/police/'+kind+'.json',import.meta.url))));
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.max.y>(kind==='horse'?2:.7));
    assert.ok(geometry.morphAttributes.position.length>=4);
    assert.equal(geometry.morphAttributes.position[0].count,geometry.attributes.position.count);
  }
});

test('rendered details identify the nearby unit and keep civilian staff out of police witnesses',()=>{
  const scene=createPoliceScene(new THREE.Scene()), field={fieldOfficers:[]}, extras=[], bodies=[];
  scene.details.set([crewPost('crossing',0),crewPost('mounted',22)]);
  const player={x:0,y:0,z:0,angle:0};
  const ctx={ground:()=>0,blocked:()=>false,player};
  scene.drawDetails(true,.1,ctx,extras,bodies,field);
  assert.deepEqual(field.fieldOfficers.map(o=>o.unit),['mounted']);
  assert.equal(extras[1].member,extras[1].look.member);
  assert.ok(extras[1].y>.75 && extras[1].cycling && extras[1].clip==='horseRide');
  assert.equal(scene.identify(player,[]),UNIT.crossing.name);
  field.officers=[{...field.fieldOfficers[0],x:40}];
  const posted=[];
  scene.drawDetails(true,.1,ctx,posted,[],field);
  assert.deepEqual(posted.map(actor=>actor.unit),['crossing']);
  assert.equal(scene.identify({...player,x:22},field.officers),null);
  scene.drawDetails(false,.1,ctx,[],[],field);
  assert.equal(field.fieldOfficers.length,0);
  assert.equal(scene.identify(player,[]),null);
});

test('gunfire draws a brief muzzle flash at the shooter',()=>{
  const world=new THREE.Scene(), scene=createPoliceScene(world);
  const police={sim:{elapsed:1},shots:[{at:1,x:3,y:1.4,z:2,tx:3,ty:1.1,tz:12}]};
  scene.update(police,1);
  const flash=world.children.find(mesh=>mesh.name==='Muzzle flash' && mesh.visible);
  assert.ok(flash);
  assert.deepEqual(flash.position.toArray(),[3,1.4,2]);
  assert.ok(!world.children.some(object=>object.isLine && object.visible));

  police.sim.elapsed=1.06;
  scene.update(police,1.06);
  assert.equal(flash.visible,false);
});
