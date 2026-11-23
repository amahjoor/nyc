import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createStorefronts } from '../dist/storefronts.js';
import { planRoom } from '../dist/interiors.js';
import { roomPoint,roomLocal } from '../dist/room.js';
import { planShopEntrance,treadHeight,shopStairRoute } from '../dist/shop-entrance.js';
import { followRoute,roomWalkStep } from '../dist/room-walk.js';
import { Simulation } from '../dist/simulation.js';

function front(mirror,skew){
  const c=Math.cos(.64),s=Math.sin(.64);
  return {place:{id:'steps',kind:'chinese',name:'Hillside Kitchen',x:0,z:0},x:4,z:2,
    width:8,tx:mirror*c,tz:mirror*s,nx:-s,nz:c,skew};
}
function canvas(){return {getContext:()=>null};}

test('arrivals clear the landing for departing customers on straight and turning stairs',()=>{
  for(const sidewalk of [2,8]){
    const room={x:0,z:0,tx:1,tz:0,nx:0,nz:1,width:8,depth:8,things:[]};
    const groundAt=()=>0,entry=planShopEntrance(room,1,groundAt,(_x,z)=>z<sidewalk);
    const {stairs,floor}=entry;
    assert.equal(Boolean(stairs.turn),sidewalk===2);
    const start=roomLocal(room,...stairs.point(stairs.toe+.75,0));
    const stairsRoute=shopStairRoute(room,stairs,start);
    const inward={path:[...stairsRoute,{a:0,b:.5},{a:0,b:1.7}],phase:'entering',at:0};
    const outward={path:[...stairsRoute.toReversed(),start],phase:'back to sidewalk',at:0};
    const [x,z]=stairs.point(stairs.toe-.25,0);
    const arriving={x,z,y:.3,look:{pace:1.4},visit:{task:inward}};
    const departing={x:0,z:-.7,y:floor,look:{pace:1.4},visit:{task:outward}};
    const view={plan:room,floor,entry,groundAt,visitors:new Set([arriving,departing])};
    for(let i=0;i<600 && inward.at<inward.path.length;i++){
      followRoute(view,arriving,inward,1/60);
      if(followRoute(view,departing,outward,1/60))departing.visit=null;
    }
    assert.equal(departing.visit,null,'the departing customer reaches the sidewalk');
    assert.equal(inward.at,inward.path.length,'the arriving customer continues inside');
  }
});

test('a grounded walker climbs every rendered tread, pushes the door and walks down the same flight',()=>{
  for(const sidewalk of [2.05,7])for(const mirror of [-1,1]){
    const f=front(mirror,.22),floor=3.04;
    const out=(x,z)=>(x-f.x)*f.nx+(z-f.z)*f.nz;
    const ground=(x,z)=>1.12-out(x,z)*.074+(x-f.x)*f.tx*.021+(z-f.z)*f.tz*.021;
    const polygon=[[-6,0],[6,0],[6,14],[-6,14]].map(([a,b])=>roomPoint(f,a,b));
    let store;
    const sampleSurface=(x,z,opts)=>({elevation:Math.max(ground(x,z),opts?.mode==='walk'?store?.stepHeightAt(x,z,opts.referenceHeight)??-Infinity:-Infinity)});
    const sim=new Simulation({bounds:{minX:-65,maxX:65,minZ:-65,maxZ:65},spawn:{x:0,z:14,angle:0},roads:[],
      buildings:[{id:'b',polygon,holes:[]}],missionPoints:[],sampleSurface});
    const scene=new THREE.Scene(),fronts=[f];
    store=createStorefronts({scene,createCanvas:canvas,roomFor:planRoom,floorFor:()=>floor,groundAt:ground,
      clearApproach:(x,z)=>out(x,z)<sidewalk,physics:sim.streetObjects});
    try{
      store.update(fronts,f,13);
      const view=store.get(f.place.id),stairs=view.entry.stairs;
      assert.ok(stairs && stairs.count>8);
      assert.equal(stairs.turn===0,sidewalk===7);
      assert.equal(view.floor,floor);
      scene.updateMatrixWorld(true);
      const ray=new THREE.Raycaster(),mesh=view.entry.mesh,sampled=[];
      for(let i=0;i<stairs.count;i++){
        const along=i===0?0.1:stairs.landing+(i-.5)*stairs.tread;
        const [x,z]=stairs.point(along,0),h=store.stepHeightAt(x,z);
        ray.set(new THREE.Vector3(x,floor+3,z),new THREE.Vector3(0,-1,0));
        assert.ok(Math.abs(ray.intersectObject(mesh)[0].point.y-h)<.002);
        sampled.push(h);
      }
      const foot=stairs.point(stairs.toe+.22,0);
      Object.assign(sim.player,{x:foot[0],z:foot[1],y:ground(...foot),grounded:true,mode:'walk'});
      sim.doorway=view;
      const heights=new Set();
      function walk([x,z]){
        for(let i=0;i<480;i++){
          const p=sim.player, dx=x-p.x,dz=z-p.z;
          if(Math.hypot(dx,dz)<.038)return;
          const y=p.y;
          view.door.step(1/60);sim.step({moveX:dx*3,moveZ:dz*3},1/60);
          assert.ok(p.grounded,'steady footing');
          assert.ok(Math.abs(p.y-y)<.23,'one tread at a time');
          heights.add(p.y.toFixed(4));
        }
        assert.fail('walk stopped at '+JSON.stringify(roomLocal(f,sim.player.x,sim.player.z)));
      }
      walk(stairs.point(.06,0));walk(roomPoint(f,0,.72));
      assert.equal(sim.room?.place.id,f.place.id);
      assert.ok(sampled.every(h=>heights.has(h.toFixed(4))),'every tread was underfoot');
      heights.clear();
      walk(stairs.point(.06,0));walk(foot);
      assert.equal(sim.room,null);
      assert.ok(sampled.every(h=>heights.has(h.toFixed(4))));
      assert.ok(Math.abs(sim.player.y-ground(sim.player.x,sim.player.z))<.001);
      // A visiting pedestrian also turns onto the flight from the sidewalk.
      const guest={x:foot[0],z:foot[1],y:ground(...foot),look:{pace:1.4}};
      const start=roomLocal(f,guest.x,guest.z),way=shopStairRoute(f,stairs,start);
      for(const p of [...way,{a:0,b:.55},...way.reverse(),start]){
        const [wx,wz]=roomPoint(f,p.a,p.b);
        for(let i=0;i<400 && Math.hypot(wx-guest.x,wz-guest.z)>.01;i++){
          const before=guest.y;
          roomWalkStep(view,guest,wx,wz,.025,[]);
          assert.ok(Math.abs(guest.y-before)<.23);
        }
        assert.ok(Math.hypot(wx-guest.x,wz-guest.z)<.012);
      }
    }finally{store.dispose();}
    assert.equal(scene.children.length,0);
    assert.equal(sim.streetObjects.grid.size,0);
  }
});

test('level sills stay flush and narrowing a sidewalk refits the exterior of a closed shop',()=>{
  const f=front(1,0),ground=()=>4,scene=new THREE.Scene();
  let floor=4.06,walkWidth=8,frontageRoom=10,closed=false;
  const clear=(x,z)=>(x-f.x)*f.nx+(z-f.z)*f.nz<walkWidth && Math.abs((x-f.x)*f.tx+(z-f.z)*f.tz)<frontageRoom;
  const store=createStorefronts({createCanvas:canvas,scene,roomFor:planRoom,floorFor:()=>floor,groundAt:ground,clearApproach:clear,isClosed:()=>closed});
  const fronts=[f];
  try{
    store.update(fronts,f,12);
    assert.equal(store.get('steps').entry.stairs,null);
    floor=5.36;store.update(fronts,f,12,true,1);
    const first=store.get('steps').entry;
    assert.equal(first.stairs.turn,0);
    const mesh=first.mesh;let disposed=false;mesh.geometry.addEventListener('dispose',()=>{disposed=true;});
    const count=first.stairs.count;walkWidth=3.57;frontageRoom=1.6;
    store.update(fronts,f,12,true,2);
    assert.equal(first.stairs.tread,.26);assert.equal(first.stairs.count,count);
    assert.ok(disposed);assert.notEqual(first.mesh,mesh);
    closed=true;walkWidth=1.7;frontageRoom=10;
    store.update(fronts,f,12,true,3,1);
    assert.ok(disposed);assert.equal(store.get('steps'),undefined);
    assert.notEqual(first.stairs.turn,0);
    assert.equal(store.stepHeightAt(...first.stairs.point(0,0)),floor);
    assert.ok(scene.getObjectByName('Shop entrance steps'));
    floor=4.07;store.update(fronts,f,12,true,4,1);
    assert.equal(scene.getObjectByName('Shop entrance steps'),undefined);
    const flush=planShopEntrance(f,8,ground,()=>false);
    assert.ok(flush.floor-ground()<.12);assert.equal(treadHeight(flush.stairs,f.x,f.z),null);
  }finally{store.dispose();}
});

test('a recessed entrance leaves walking clearance past the bottom step beside the neighboring wall',()=>{
  // Chinese Gourmet's 4.9 m frontage faces a sloping 3 m sidewalk. The wall
  // next door projects far enough that a person cannot round the downhill cheek.
  const f={...front(1,0),x:0,z:0,tx:1,tz:0,nx:0,nz:1,width:4.896};
  const ground=(x,z)=>14.667-.036*x-.17*z;
  const clear=(x,z)=>z<3.1 && !(x < -2.45 && z<.70);
  const {floor,stairs}=planShopEntrance(f,15.569,ground,clear);
  assert.equal(floor,15.569);assert.equal(stairs.turn,1);assert.equal(stairs.count,7);
  for(const t of [-.40,0,.40])assert.ok(clear(...stairs.point(stairs.toe+.5,t)));
});
