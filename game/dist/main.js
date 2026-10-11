import * as THREE from './vendor/three.module.min.js';
import { createWorld, createCar, createPerson } from './world.js';
import { Simulation } from './simulation.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { CityAudio } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const angleDifference = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SAVE_KEY = 'nyc-after-hours-v1';
let sim, city, renderer, scene, camera, world, hud, avatar, marker, markerDiamond, enterHint;
let started=false, paused=false, highQuality=false, farCamera=false, savedEarnings='';
let yaw=0, pitch=.38, lookIdle=0, elapsed=0, lastFrame=0, hudTime=0, qualityTimer=0, slowFrames=0;
const carModels = new Map(), pedestrians=[];
const audio = new CityAudio();
const canvas=$('world');
const input=new Input(canvas, action);
const cameraTarget=new THREE.Vector3(), desiredCamera=new THREE.Vector3();

function announce(text) { if(sim){sim.notice=text;sim.noticeTime=4;} }
function action(name) {
  if(!sim)return;
  if(name==='pause') { if(started)togglePause();return; }
  if(!started||paused)return;
  if(name==='interact')sim.interact();
  if(name==='job')sim.startMission();
  if(name==='recover'){sim.reset();yaw=sim.player.angle;announce('Back on Greene Street. Your next ride is waiting.');}
  if(name==='map')hud.toggleMap();
  if(name==='camera'){farCamera=!farCamera;announce(farCamera?'Camera: wide chase':'Camera: close chase');}
  if(name==='horn')audio.horn();
}
function togglePause(force) {
  if(!started)return;
  paused=force??!paused;
  input.clear();
  if(paused && !$('pause-dialog').open && !$('help-dialog').open)$('pause-dialog').showModal();
  if(!paused&&$('pause-dialog').open)$('pause-dialog').close();
}

$('start-button').addEventListener('click',()=>{
  if(!sim)return;
  started=true;paused=false;$('intro').hidden=true;
  for(const id of ['hud','mission-panel','wanted'])$(id).hidden=false;
  $('touch-controls').hidden=!matchMedia('(pointer:coarse)').matches;
  announce('Welcome to SoHo. Walk to the yellow cab and press E.');
  canvas.focus();
});
$('sound-button').addEventListener('click',async()=>{
  const enabled=await audio.toggle();
  $('sound-button').textContent=enabled?'SOUND ON':'SOUND OFF';
  $('sound-button').setAttribute('aria-label',enabled?'Turn sound off':'Turn sound on');
});
$('quality-button').addEventListener('click',()=>{highQuality=!highQuality;applyQuality();});
$('help-button').addEventListener('click',()=>{if(started){paused=true;input.clear();}$('help-dialog').showModal();});
$('help-dialog').addEventListener('close',()=>{if(started)paused=false;input.clear();});
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();togglePause(false);});
$('resume-button').addEventListener('click',()=>togglePause(false));
$('recover-button').addEventListener('click',()=>{togglePause(false);action('recover');});
$('brand').addEventListener('click',e=>{e.preventDefault();if(started)togglePause();});
$('job-button').addEventListener('click',()=>action('job'));
$('map-button').addEventListener('click',()=>action('map'));
$('touch-enter').addEventListener('click',()=>action('interact'));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)togglePause(true);});
window.addEventListener('resize',resize);

function applyQuality() {
  if(!renderer)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,highQuality?1.65:1.15));
  renderer.shadowMap.enabled=highQuality;
  scene.traverse(object=>{if(object.material){for(const m of Array.isArray(object.material)?object.material:[object.material])m.needsUpdate=true;}});
  $('quality-button').textContent='QUALITY: '+(highQuality?'HIGH':'BALANCED');
  resize();
}
function resize() {
  if(!renderer)return;
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
}
function restoreProgress() {
  try {
    const record=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(record?.version===1){
      if(Number.isFinite(record.cash)&&record.cash>=0)sim.cash=Math.min(record.cash,1e8);
      if(Number.isInteger(record.deliveries)&&record.deliveries>=0)sim.deliveries=Math.min(record.deliveries,1e6);
    }
  } catch { /* Storage can be unavailable in private browsing; play still works. */ }
}
function saveProgress() {
  const value=JSON.stringify({version:1,cash:sim.cash,deliveries:sim.deliveries});
  if(value===savedEarnings)return;
  savedEarnings=value;
  try{localStorage.setItem(SAVE_KEY,value);}catch{/* Earnings remain for the current session. */}
}

function createMissionMarker() {
  const group=new THREE.Group();
  const material=new THREE.MeshBasicMaterial({color:0xff794f,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.RingGeometry(7.2,7.7,64),material);ring.rotation.x=-Math.PI/2;ring.position.y=.17;group.add(ring);
  const inner=new THREE.Mesh(new THREE.CircleGeometry(7.1,48),new THREE.MeshBasicMaterial({color:0xff794f,transparent:true,opacity:.055,depthWrite:false}));inner.rotation.x=-Math.PI/2;inner.position.y=.16;group.add(inner);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,19,6),new THREE.MeshBasicMaterial({color:0xff956b,transparent:true,opacity:.65}));pole.position.y=9.6;group.add(pole);
  markerDiamond=new THREE.Mesh(new THREE.OctahedronGeometry(.85),new THREE.MeshStandardMaterial({color:0xff885c,emissive:0xff6633,emissiveIntensity:.4,metalness:.2,roughness:.35}));markerDiamond.position.y=5;group.add(markerDiamond);
  group.visible=false;scene.add(group);return group;
}
function createEnterHint() {
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  ctx.fillStyle='#181d20';ctx.fillRect(20,20,88,88);ctx.strokeStyle='#ff794f';ctx.lineWidth=3;ctx.strokeRect(20,20,88,88);ctx.fillStyle='#eee9df';ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('E',64,66);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(1.1,1.1,1.1);sprite.visible=false;scene.add(sprite);return sprite;
}

function populatePedestrians() {
  const colors=[0x738990,0x8b654d,0xb6a280,0x3b4c50,0x824e48,0x5d6952];
  let i=0;
  for(const road of city.roads){
    if(pedestrians.length>=40)break;
    if(road.points.length<2)continue;
    const a=road.points[0],b=road.points.at(-1),dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<25)continue;
    const side=i%2?1:-1,offset=road.width*.5+1.3;
    const ax=a[0]+dx*.18+dz/len*offset*side,az=a[1]+dz*.18-dx/len*offset*side;
    const bx=a[0]+dx*.78+dz/len*offset*side,bz=a[1]+dz*.78-dx/len*offset*side;
    // Sidewalk routes are only decorative; reject those that enter footprints.
    if([0,.25,.5,.75,1].some(t=>sim.isBlocked(ax+(bx-ax)*t,az+(bz-az)*t,.3)))continue;
    const mesh=createPerson(colors[i%colors.length]);scene.add(mesh);
    pedestrians.push({mesh,a:{x:ax,z:az},b:{x:bx,z:bz},phase:i*.41,length:Math.hypot(bx-ax,bz-az)});i++;
  }
}
function animatePerson(mesh,moving,time,speed=1) {
  const swing=moving?Math.sin(time*8*Math.max(.6,Math.min(speed,1.6)))*.4:0;
  const legs=mesh.userData.legs||[],arms=mesh.userData.arms||[];
  legs.forEach((leg,i)=>{if(leg?.rotation)leg.rotation.x=swing*(i%2?-1:1);});
  arms.forEach((arm,i)=>{if(arm?.rotation)arm.rotation.x=swing*(i%2?1:-1)*.7;});
}

function syncScene(dt,controls) {
  const p=sim.player;
  avatar.visible=p.mode==='walk';avatar.position.set(p.x,0,p.z);avatar.rotation.y=p.angle;
  animatePerson(avatar,Math.abs(p.speed)>.1,elapsed,Math.abs(p.speed)/3);
  for(const car of sim.cars){
    let mesh=carModels.get(car.id);
    if(!mesh){mesh=createCar({type:car.type,color:car.color});carModels.set(car.id,mesh);scene.add(mesh);}
    mesh.visible=Math.hypot(car.x-p.x,car.z-p.z)<230;
    mesh.position.set(car.x,.025,car.z);mesh.rotation.y=car.angle;
    if(car.id===p.vehicleId){
      const road=sim.getStreet();
      const rough=/Greene|Wooster|Crosby/.test(road)&&Math.abs(car.speed)>1;
      mesh.position.y+=rough?Math.sin(elapsed*55)*Math.min(.026,Math.abs(car.speed)*.0015):0;
      mesh.rotation.z=THREE.MathUtils.damp(mesh.rotation.z,-controls.turn*Math.min(Math.abs(car.speed)*.0019,.045),7,dt);
    }else mesh.rotation.z=0;
    for(const wheel of mesh.userData.wheels||[])if(wheel?.rotation)wheel.rotation.x-=car.speed*dt/.35;
    if(mesh.userData.update)mesh.userData.update(elapsed,car,sim.heat);
    // Scene factories may expose lamp meshes for a lightweight police flash.
    if(car.type==='police')for(const [i,light] of (mesh.userData.lights||[]).entries()){
      if(light.material)light.material.emissiveIntensity=sim.heat>.1?(Math.sin(elapsed*14+i*Math.PI)>0?3:.1):.15;
    }
  }
  for(const ped of pedestrians){
    const cycle=(elapsed*.9/ped.length+ped.phase)%2,t=cycle<1?cycle:2-cycle;
    ped.mesh.position.set(ped.a.x+(ped.b.x-ped.a.x)*t,0,ped.a.z+(ped.b.z-ped.a.z)*t);
    ped.mesh.rotation.y=Math.atan2(ped.b.x-ped.a.x,ped.b.z-ped.a.z)+(cycle<1?0:Math.PI);
    ped.mesh.visible=ped.mesh.position.distanceTo(avatar.position)<85;animatePerson(ped.mesh,true,elapsed+ped.phase);
  }
  if(sim.mission.phase==='active'&&sim.mission.target){
    marker.visible=true;marker.position.set(sim.mission.target.x,0,sim.mission.target.z);markerDiamond.rotation.y=elapsed*.7;markerDiamond.position.y=5+Math.sin(elapsed*2)*.3;
  }else marker.visible=false;
  const near=sim.getNearbyCar();enterHint.visible=p.mode==='walk'&&!!near&&started;
  if(near)enterHint.position.set(near.x,3+Math.sin(elapsed*2)*.15,near.z);
  world.update?.(elapsed,p);
}

function updateCamera(dt) {
  const p=sim.player,driving=p.mode==='drive';
  const look=input.lookDelta,vertical=input.lookVertical;input.lookDelta=0;input.lookVertical=0;
  yaw+=look;pitch=clamp(pitch+vertical,.17,.85);lookIdle=look||vertical?0:lookIdle+dt;
  if(!started){yaw=p.angle+Math.sin(elapsed*.12)*.13;pitch=.48;}
  else if(driving&&Math.abs(p.speed)>1&&lookIdle>1.6)yaw+=angleDifference(p.angle,yaw)*(1-Math.exp(-dt*2));
  const distance=!started?18:driving?(farCamera?14:9.3):(farCamera?10:6.5);
  let safeDistance=distance;
  // Pull the chase camera forward before its sightline crosses a facade.
  // Checking the same collision geometry keeps narrow SoHo streets readable.
  for(let d=1;d<=distance;d+=.6){
    if(sim.isBlocked(p.x-Math.sin(yaw)*d,p.z-Math.cos(yaw)*d,.2)){safeDistance=Math.max(.9,d-.7);break;}
  }
  const height=1.55+Math.sin(pitch)*safeDistance;
  desiredCamera.set(p.x-Math.sin(yaw)*safeDistance,height,p.z-Math.cos(yaw)*safeDistance);
  camera.position.lerp(desiredCamera,1-Math.exp(-dt*(safeDistance<3?22:8)));
  // A smoothed camera can cut across a corner even when its destination is safe.
  // Clamp inward immediately, then ease back out once the sightline clears.
  const dx=camera.position.x-p.x,dz=camera.position.z-p.z,actualDistance=Math.hypot(dx,dz);
  for(let d=.6;d<=actualDistance;d+=.4){
    if(sim.isBlocked(p.x+dx*d/actualDistance,p.z+dz*d/actualDistance,.2)){
      const ratio=Math.max(.15,d-.5)/actualDistance;
      camera.position.x=p.x+dx*ratio;camera.position.z=p.z+dz*ratio;break;
    }
  }
  cameraTarget.set(p.x,driving?1.1:1.45,p.z);camera.lookAt(cameraTarget);
  const targetFov=driving?60+Math.min(9,Math.abs(p.speed)*.24):57;
  camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,4,dt);camera.updateProjectionMatrix();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-(lastFrame||now))/1000);lastFrame=now;
  let controls={forward:0,turn:0,brake:false,run:false,moveX:0,moveZ:0};
  if(started){
    // Keep polling controller button edges while paused so Start can resume.
    // An action inside sample() may change paused during this same frame.
    controls=input.sample(yaw,dt);
    if(!paused){sim.step(controls,dt);elapsed+=dt;}
  }else elapsed+=dt;
  syncScene(paused?0:dt,controls);updateCamera(dt);audio.update(sim,elapsed,started&&!paused);
  hudTime+=dt;if(hudTime>.075){hud.update(sim);saveProgress();hudTime=0;}
  renderer.render(scene,camera);
  qualityTimer+=dt;if(dt>.035)slowFrames++;
  if(highQuality&&qualityTimer>5){if(slowFrames>90){highQuality=false;applyQuality();announce('Switched to balanced graphics for smoother streets.');}qualityTimer=0;slowFrames=0;}
}

async function boot() {
  const response=await fetch('./city.json');if(!response.ok)throw new Error('The city data could not load. Reload to try again.');city=await response.json();
  $('load-text').textContent='OPENING SOHO…';
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#b6ac9e');scene.fog=new THREE.FogExp2('#b6ac9e',.0032);
  camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.15,1600);
  const sky=new THREE.HemisphereLight(0xe7edf0,0x807566,2.4);scene.add(sky);
  const sun=new THREE.DirectionalLight(0xffc08a,3.5);sun.position.set(-160,210,90);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-160;sun.shadow.camera.right=160;sun.shadow.camera.top=160;sun.shadow.camera.bottom=-160;sun.shadow.camera.near=1;sun.shadow.camera.far=550;sun.shadow.bias=-.001;sun.shadow.normalBias=.1;scene.add(sun);scene.add(sun.target);
  sim=new Simulation(city);restoreProgress();yaw=sim.player.angle;
  world=createWorld(city);scene.add(world.group);
  avatar=createPerson(0xd7774e);scene.add(avatar);marker=createMissionMarker();enterHint=createEnterHint();
  populatePedestrians();hud=new HUD(city);applyQuality();
  camera.position.set(sim.player.x-Math.sin(yaw)*18,11,sim.player.z-Math.cos(yaw)*18);
  $('start-button').disabled=false;$('load-text').textContent='HIT THE STREETS';
  // This read-only diagnostic surface helps inspect runtime state during QA.
  window.nycGame={getState:()=>({player:{...sim.player},heat:sim.heat,health:sim.health,mission:{...sim.mission},cash:sim.cash,deliveries:sim.deliveries,cars:sim.cars.length,buildings:city.buildings.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,started,paused})};
  requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);$('load-text').textContent='UNABLE TO START';$('load-error').hidden=false;
  $('load-error').textContent=error.message.includes('WebGL')?'This game needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.':error.message;
});
