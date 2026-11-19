import * as THREE from './vendor/three.module.min.js';
import { LANDING, LIFT_TRAVEL, platformAt, streetPassage, localFloor, worldPoint } from './subway-space.js';
import { PLATFORM_EDGE, TRAIN_X, CAR_CENTRES, BENCHES, GATE_Z, fareStation } from './subway-service.js';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(n,hi));
const stairs=14,landing=LANDING;
export const SUBWAY_LAYER=3;
export function createPlatformView(scene) {
  const root=new THREE.Group(), station=new THREE.Group(), hall=new THREE.Group(), tunnel=new THREE.Group(), train=new THREE.Group(), leaves=[new THREE.Group(),new THREE.Group()];
  root.name='Subway concourse and trains';station.name='Station platform';train.name='Scheduled train';
  scene.add(root);root.add(station,train,tunnel);station.add(hall);train.add(...leaves);
  const fill=new THREE.HemisphereLight(0xe5eced,0x98948a,1.05);
  fill.layers.set(SUBWAY_LAYER);root.add(fill);
  for(const [parent,x,y,z,power] of [[hall,0,3.26,-9,7],[station,0,3.36,11,11],[station,0,3.36,30,11],[train,TRAIN_X,2.5,12,4]]){
    const light=new THREE.PointLight(0xfff2d8,power,10,2);light.position.set(x,y,z);parent.add(light);
  }
  const cube=new THREE.BoxGeometry(1,1,1), materials=new Map(), batches=new Map(), labels=[];
  const material=(color,lit=true)=>{
    const key=color+lit;
    if(!materials.has(key))materials.set(key,lit?new THREE.MeshStandardMaterial({color,roughness:.69,emissive:color,emissiveIntensity:.045}):new THREE.MeshBasicMaterial({color}));
    return materials.get(key);
  };
  const box=(parent,color,x,y,z,w,h,d,lit=true,tilt=0)=>{
    const mat=material(color,lit);
    if(!batches.has(parent))batches.set(parent,new Map());
    const byMat=batches.get(parent);
    if(!byMat.has(mat))byMat.set(mat,[]);
    byMat.get(mat).push(new THREE.Matrix4().makeRotationX(tilt).scale(new THREE.Vector3(w,h,d)).setPosition(x,y,z));
  };
  function flush(){
    for(const [parent,byMat] of batches)for(const [mat,items] of byMat){
      const mesh=new THREE.InstancedMesh(cube,mat,items.length);
      items.forEach((m,i)=>mesh.setMatrixAt(i,m));parent.add(mesh);
    }
    batches.clear();
  }
  function plaque(parent,x,y,z,w,h,rotation,copies=[]){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(80,Math.round(1024*h/w));
    const ctx=canvas.getContext('2d'), tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex}));
    mesh.position.set(x,y,z);mesh.rotation.y=rotation;parent.add(mesh);labels.push(mesh);
    for(const [cx,cy,cz,angle] of copies){
      const copy=mesh.clone();copy.position.set(cx,cy,cz);copy.rotation.y=angle;parent.add(copy);
    }
    return (text,stripe='#548a81')=>{
      ctx.fillStyle='#171b1e';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle=stripe;ctx.fillRect(0,0,canvas.width,canvas.height*.11);
      ctx.fillStyle='#fff8e9';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold '+Math.round(canvas.height*.53)+'px Arial, sans-serif';
      ctx.fillText(text,canvas.width*.5,canvas.height*.56,canvas.width*.93);tex.needsUpdate=true;
    };
  }

  const steel=0x728080, iron=0x455e54, cream=0xd2c9ae, tile=0xd6d4be, black=0x202728;
  const cabin=new THREE.Group();
  root.add(cabin);
  box(cabin,steel,0,-.09,0,1.58,.18,1.57);
  for(const x of [-.79,.79])box(cabin,steel,x,1.1,0,.08,2.2,1.55);
  box(cabin,steel,0,2.26,0,1.64,.12,1.55);
  box(cabin,0xffeabf,0,2.18,0,.7,.05,.24,false);
  const underground=new THREE.Group(),outside=new THREE.Group(),cutWalls=new THREE.Group(),gates=new THREE.Group(),stairDown=new THREE.Group(),stairUp=new THREE.Group();
  station.add(underground,outside,cutWalls,gates,stairDown,stairUp);
  box(station,0x747372,0,-.22,21,7,.44,39);
  box(station,0xe1ad39,PLATFORM_EDGE+.24,.012,21,.48,.027,39);
  for(let z=2;z<40.5;z+=.75)box(station,0xeac259,PLATFORM_EDGE+.24,.031,z,.39,.019,.055);
  for(const x of [-5.81,-4.32])box(station,0x8a9293,x,-1.05,14,.095,.16,113);
  for(let z=-41;z<69;z+=1.1)box(station,0x4d4640,TRAIN_X,-1.18,z,2.15,.13,.23);
  box(station,0x363838,TRAIN_X,-1.36,15,3.6,.36,112);
  box(underground,0x484841,0,4.28,21,17,.6,39);
  box(underground,tile,3.61,1.82,21,.23,3.8,40);
  for(let y=.25;y<3.75;y+=.35)box(underground,0xacae9f,3.484,y,21,.015,.017,39.8);
  for(let z=1.5;z<41;z+=.62)box(underground,0xbabcae,3.478,1.8,z,.016,3.6,.012);
  box(underground,iron,3.46,2.85,21,.025,.29,39.8);
  box(underground,0x44423c,-7.4,1.2,17,.36,5.1,77);
  box(outside,0x777e72,.5,3.55,18,6.4,.19,29);
  box(outside,0x728a80,3.45,.77,21,.09,1.55,39);
  for(const x of [-8.3,4.6])box(cutWalls,0x76766d,x,2.7,14,.36,8,111);
  for(let z=4;z<=40;z+=6){
    box(station,iron,2.75,1.85,z,.23,3.7,.3);
    box(station,iron,2.75,.14,z,.44,.28,.45);
    box(underground,iron,-1.95,3.72,z,10.7,.26,.24);
    box(station,0xffefd1,-.45,3.43,z,1.65,.09,.20,false);
  }
  for(const z of BENCHES){
    box(station,0x876447,2.2,.50,z,.65,.12,2.9);
    box(station,0x906c4d,2.49,.91,z,.1,.59,2.9);
    for(const dz of [-.95,.95])box(station,black,2.19,.23,z+dz,.21,.45,.13);
  }
  // The fare hall meets a staircase down to a subway, or up to an open-air platform.
  for(const [stairGroup,open] of [[stairDown,false],[stairUp,true]]){
    const startY=open?-landing:landing;
    box(stairGroup,0x83837c,0,startY-.14,-9,3.7,.28,10);
    for(let i=0;i<stairs;i++){
      const top=localFloor(-4+i*.42+.04,open);
      box(stairGroup,0x98998d,0,top-.15,-4+(i+.5)*.42,3.7,.30,.43);
      box(stairGroup,0xc4b99b,0,top+.004,-4+i*.42+.035,3.7,.018,.06);
      for(const x of [-1.72,1.72]){
        if(i%4===1)box(stairGroup,steel,x,top+.42,-4+(i+.5)*.42,.045,.84,.045);
      }
    }
    const run=stairs*.42,slope=Math.atan2(startY,run),mid=-4+run/2;
    for(const x of [-1.72,1.72])box(stairGroup,steel,x,startY/2+.91,mid,.07,.075,Math.hypot(run,landing),true,slope);
    if(!open){
      box(stairGroup,0x767975,0,landing/2+3.5,mid,3.84,.15,Math.hypot(run,landing),true,slope);
      for(const x of [-1.91,1.91])box(stairGroup,tile,x,2.65,mid,.14,5.6,run);
    }
  }
  box(hall,tile,0,3.05,-13.98,3.74,.98,.12);
  for(const x of [-1.89,1.89])box(hall,cream,x,1.65,-9,.17,3.6,10);

  box(hall,0xa4a499,0,3.5,-9,3.85,.2,10);
  box(hall,0xfff1c9,0,3.34,-9.4,1.4,.09,.32,false);
  const turnstile=new THREE.Group();
  gates.add(turnstile);turnstile.position.set(.89,.82,GATE_Z);
  box(turnstile,steel,-.85,0,0,1.7,.055,.065);
  for(const x of [-1.05,1.05]){
    box(gates,steel,x,.51,GATE_Z,.34,1.03,1.24);
    box(gates,black,x,1.05,GATE_Z-.32,.29,.13,.32);
    box(gates,0x79c2a3,x,1.125,GATE_Z-.34,.16,.015,.18,false);
  }
  const stationLabels=[8,22,36].map(z=>plaque(station,3.40,2.22,z,3.5,.58,-Math.PI/2));
  const hanging=plaque(station,-2.2,3.28,6,2.35,.38,Math.PI);
  const departureBoard=plaque(station,-1.95,3.22,16,3.05,.40,Math.PI);
  const gateSign=plaque(hall,0,2.65,GATE_Z,3.3,.48,Math.PI);
  const exitSign=plaque(hall,0,2.40,-13.88,2,.54,0);exitSign('Exit to street','#b84c40');
  const exitArrow=plaque(station,1.22,3.06,3.02,2.15,.40,0);exitArrow('Exit ↑','#b84c40');
  const trainArrow=plaque(station,1.22,3.06,2.98,2.15,.40,Math.PI);trainArrow('Trains ↑');

  const metal=0xb9bdba, carLength=19.8, windowTint=0x819e9d;
  Object.assign(material(windowTint),{transparent:true,opacity:.16,depthWrite:false,metalness:.25});
  for(const centre of CAR_CENTRES){
    box(train,0x787675,TRAIN_X,-.055,centre,2.90,.14,carLength);
    box(train,0xcdcbbd,TRAIN_X,2.70,centre,2.96,.16,carLength);
    for(const end of [-1,1]){
      const z=centre+end*9.84;
      box(train,metal,TRAIN_X,.50,z,2.88,1.0,.13);
      for(const x of [-1.04,0,1.04])box(train,metal,TRAIN_X+x,1.65,z,.26,1.55,.13);
      for(const x of [-.52,.52])box(train,windowTint,TRAIN_X+x,1.66,z,.77,1.28,.025);
      box(train,black,TRAIN_X,2.38,z,2.87,.49,.14);
    }
    for(const side of [-1,1]){
      const x=TRAIN_X+side*1.45;
      for(const [offset,width] of [[-8.3,2.96],[-3,4.4],[3,4.4],[8.3,2.96]]){
        const z=centre+offset;
        box(train,metal,x,.65,z,.1,1.3,width);
        box(train,metal,x,2.41,z,.1,.45,width);
        for(const dz of [-width/2+.11,width/2-.11])box(train,black,x,1.73,z+dz,.12,1.0,.2);
        for(const h of [1.32,2.15])box(train,black,x,h,z,.12,.055,width);
        box(train,windowTint,x,1.73,z,.022,.8,width-.31);
        if(width>4)box(train,black,x,1.73,z,.12,.8,.06);
        for(const h of [.39,.53,.67])box(train,0x959c99,x+side*.06,h,z,.032,.035,width);
        box(train,0x4e8c9a,x-side*.32,.55,z,.52,.15,width-.32);
        box(train,0x6ca0ae,x-side*.12,.89,z,.11,.65,width-.32);
      }
      for(const offset of [-6,0,6])for(const [index,sign] of [[0,-1],[1,1]]){
        const z=centre+offset+sign*.4, parent=side===1?leaves[index]:train;
        box(parent,metal,x,.68,z,.12,1.36,.80);
        box(parent,metal,x,2.31,z,.12,.56,.80);
        for(const dz of [-.34,.34])box(parent,black,x,1.69,z+dz,.12,.68,.095);
        box(parent,windowTint,x,1.69,z,.022,.68,.61);
      }
      box(train,steel,TRAIN_X+side*.81,2.27,centre,.055,.055,18.9);
    }
    for(const offset of [-3,3]){
      box(train,steel,TRAIN_X+.8,1.33,centre+offset,.055,2.57,.055);
      box(train,0xfff2d5,TRAIN_X,2.59,centre+offset,.34,.05,4.2,false);
    }
  }
  // Close the tunnel beyond the lit station so an underground sightline ends in darkness.
  // Leave the track bore open at both ends as the cars pass through.
  box(underground,tile,0,1.8,40.9,7,3.8,.25);
  const exteriorSigns=CAR_CENTRES.map(z=>[TRAIN_X+1.525,2.39,z+2.9,Math.PI/2]);
  const interiorSigns=CAR_CENTRES.flatMap(z=>[[TRAIN_X,2.36,z+9.7,Math.PI],[TRAIN_X,2.36,z-9.7,0]]);
  const signAt=(poses,w,h)=>{
    const [[x,y,z,angle],...copies]=poses;
    return plaque(train,x,y,z,w,h,angle,copies);
  };
  const carSign=signAt(exteriorSigns,2.5,.30),insideSign=signAt(interiorSigns,2.40,.33);
  const movingWalls=new THREE.Group(),openSides=new THREE.Group();tunnel.add(movingWalls,openSides);
  box(movingWalls,0x333631,TRAIN_X,-1.45,12,5,.35,88);
  box(movingWalls,0x333631,TRAIN_X,3.48,12,5,.3,88);
  for(const z of [-31,55])box(movingWalls,0x222421,TRAIN_X,1,z,4.75,5,.2);
  for(const side of [-1,1]){
    box(movingWalls,0x393b39,TRAIN_X+side*2.3,1.05,12,.30,4.8,88);
    for(let z=-30;z<56;z+=4){
      box(movingWalls,0x535550,TRAIN_X+side*2.07,1.0,z,.24,4.5,.31);
      box(movingWalls,0xd9bb82,TRAIN_X+side*1.92,1.45,z,.045,.15,.39,false);
      box(openSides,0x717971,TRAIN_X+side*4.4,1.4,z,.2,4,.2);
    }
  }
  const passageMesh=new THREE.Mesh(new THREE.BufferGeometry(),[
    material(0x787976),material(0xc7c7b8),material(0x838880),material(0xffefd0,false),
    material(0x546161),material(0x375955)]);
  passageMesh.name='Station passage';root.add(passageMesh);
  let drawnPassage=null;
  function buildPassage(path){
    if(path===drawnPassage)return;
    drawnPassage=path;
    const geometry=new THREE.BufferGeometry(),vertices=[],surfaces=passageMesh.material.map(()=>[]);
    function side(p,x,y){
      return [p.x+Math.cos(p.angle)*x,p.y+y,p.z-Math.sin(p.angle)*x];
    }
    function quad(mat,a,b,c,d){
      const i=vertices.length/3;vertices.push(...a,...b,...c,...d);
      surfaces[mat].push(i,i+1,i+2,i,i+2,i+3);
    }
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i];
      const wa=a.width??1.45,wb=b.width??1.45,ha=a.clearance??2.52,hb=b.clearance??2.52;
      quad(0,side(a,-wa,0),side(b,-wb,0),side(b,wb,0),side(a,wa,0));
      quad(1,side(a,-wa,0),side(a,-wa,ha),side(b,-wb,hb),side(b,-wb,0));
      quad(1,side(b,wb,0),side(b,wb,hb),side(a,wa,ha),side(a,wa,0));
      quad(2,side(a,wa,ha),side(b,wb,hb),side(b,-wb,hb),side(a,-wa,ha));
      for(const [left,right] of [[a,b],[b,a]]){
        const inside=left===a?-1:1;
        const x0=inside*((left.width??1.45)-.008),x1=inside*((right.width??1.45)-.008);
        for(const [mat,low,high] of [[4,0,.17],[5,1.19,1.29]]){
          quad(mat,side(left,x0,low),side(left,x0,high),side(right,x1,high),side(right,x1,low));
        }
      }
      if(i%3===1)quad(3,side(a,.07,ha-.02),side(b,.07,hb-.02),side(b,-.07,hb-.02),side(a,-.07,ha-.02));
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const indices=[];
    surfaces.forEach((list,i)=>{geometry.addGroup(indices.length,list.length,i);indices.push(...list);});
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    passageMesh.geometry.dispose();passageMesh.geometry=geometry;
  }
  flush();
  let lastStation='',lastTrain='',outsideStation=false;
  function place(group,frame,offset=0){
    const p=worldPoint(frame,0,0,offset);
    group.position.set(p.x,p.y,p.z);group.rotation.y=frame.angle;
  }
  function update(j,stationFrame,trainFrame,lift=1,path){
    const service=j.service,running=j.phase==='running',travel=running?1-j.remaining/j.duration:0;
    const display=running && travel>.5 ? j.nextPlatform : j.platform;
    const undergroundStop=!stationFrame.open;
    if(display!==lastStation || outsideStation===undergroundStop){
      lastStation=display;outsideStation=!undergroundStop;
      for(const group of [station,train,tunnel,cabin,passageMesh])group.traverse(o=>{
        o.layers.set(SUBWAY_LAYER);if(!stationFrame.belowGrade)o.layers.enable(0);
      });
      if(display.structure==='At Grade'){
        for(const group of [hall,gates,stairUp,passageMesh,cabin])group.traverse(o=>o.layers.disable(0));
      }
      stationLabels.forEach(write=>write(display.name));
      hanging(display.name);gateSign(fareStation(stationFrame.portal.station)?'Fare control  ·  Trains ↑':'To trains ↑');
      underground.visible=undergroundStop;outside.visible=!undergroundStop;cutWalls.visible=display.structure==='Open Cut';
      stairDown.visible=stationFrame.belowGrade;stairUp.visible=!stationFrame.belowGrade;gates.visible=fareStation(stationFrame.portal.station);
      hall.position.y=gates.position.y=stationFrame.belowGrade?landing:-landing;
    }
    const freeExit=j.inside && j.z<GATE_Z+1.45 && !(j.hasRidden && j.station.lines.includes('SIR') && fareStation(j.station));
    turnstile.rotation.y=j.entryPaid || freeExit?Math.PI*.48:0;
    const text=service?service.route.name+'  '+service.pattern.headsign:'';
    const next=j.nextPlatform?.name,board=text+' '+(next||'');
    if(board!==lastTrain){
      const color=service?'#'+service.route.color:'#808080';
      departureBoard(text||'Departures',color);carSign(text,color);
      insideSign(next?service.route.name+'   •   Next stop: '+next:text,'#ce984d');lastTrain=board;
    }
    const sign=service?.pattern.direction===1?-1:1;

    station.visible=!running || Math.hypot(trainFrame.x-stationFrame.x,trainFrame.z-stationFrame.z)<105;
    place(station,stationFrame);
    if(path)buildPassage(path);
    passageMesh.visible=Boolean(path && station.visible && !running);
    const portal=stationFrame.portal;
    cabin.visible=station.visible && portal.kind!==0;
    cabin.rotation.y=portal.angle;
    cabin.position.set(portal.x,portal.y+(portal.open?1:-1)*lift*LIFT_TRAVEL,portal.z);
    tunnel.visible=running && Math.hypot(trainFrame.x-stationFrame.x,trainFrame.z-stationFrame.z)>40;
    movingWalls.visible=!outsideStation;openSides.visible=outsideStation;
    place(tunnel,trainFrame,-sign*((trainFrame.distance||0)%4));
    train.visible=j.aboard || j.phase==='departing' || j.phase==='dwell' || (j.phase==='waiting'&&j.remaining<5);
    const offset=j.phase==='waiting'?-sign*72*Math.pow(clamp(j.remaining/5,0,1),2):
      j.phase==='departing'?sign*74*Math.pow(1-j.remaining/j.duration,2):0;
    place(train,trainFrame,offset);
    const door=j.phase==='dwell'?clamp(Math.min(j.duration-j.remaining,j.remaining)/.7,0,1):0;
    leaves[0].position.z=-door*.73;leaves[1].position.z=door*.73;
  }
  function preview(portal,platform,heightAt){
    const frame=platformAt(platform,portal,heightAt(platform.x,platform.z));
    update({platform,station:portal.station,phase:'station'},frame,frame,0,streetPassage(portal,frame,heightAt));
  }
  return {root,station,train,update,preview,dispose(){
    root.removeFromParent();
    root.traverse(object=>{if(object.isInstancedMesh)object.dispose();});
    root.traverse(o=>{if(o.isLight)o.dispose();});passageMesh.geometry.dispose();
    cube.dispose();for(const mat of materials.values())mat.dispose();
    for(const mesh of labels){mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();}
  }};
}
