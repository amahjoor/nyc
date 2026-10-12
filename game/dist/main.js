import * as THREE from './vendor/three.module.min.js';
import { createCar, createPerson, updateCarVisuals } from './world.js';
import { Simulation } from './simulation.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { CityAudio } from './audio.js';
import { createCityStream } from './city-stream.js';
import { createCityGround, worldToGeographic } from './city-ground.js';
import { createRoadStream, nearestStreet, localDestinations } from './road-stream.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const angleDifference = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SAVE_KEY = 'nyc-after-hours-v1';
let sim, city, renderer, scene, camera, world, hud, avatar, marker, markerDiamond, enterHint;
let started=false, paused=false, highQuality=false, farCamera=false, aerialView=false, aerialTracking=false, savedEarnings='';
let cityIndex, roadIndex, roadStream, ground, sun, localFog, bootReady=false, traveling=false, pausedBeforeSources=false;
let cityView=false, cityZoom=1, cityOrbit=0, roadCell='', roadEpoch=0, roadBusy=false, buildings=[], boroughs=[];
let yaw=0, pitch=.38, lookIdle=0, elapsed=0, lastFrame=0, hudTime=0, qualityTimer=0, slowFrames=0;
const carModels = new Map(), pedestrians=[];
const audio = new CityAudio();
const canvas=$('world');
const input=new Input(canvas, action);
const cameraTarget=new THREE.Vector3(), desiredCamera=new THREE.Vector3(), cameraForward=new THREE.Vector3();
const aerialTarget=new THREE.Vector3(), aerialOffset=new THREE.Vector3(-95,240,180);

function announce(text) { if(sim){sim.notice=text;sim.noticeTime=4;} }
function action(name) {
  if(!sim)return;
  if(name==='pause') { if(started)togglePause();return; }
  if(name==='view') { setView(cityView?'street':aerialView?'city':'aerial');return; }
  if(!started||paused||traveling||!bootReady||cityView)return;
  if(name==='interact'){
    const changed=sim.interact();
    if(changed&&sim.player.mode==='drive'){
      // A walking camera can face the cab's nose. Start behind the newly
      // entered vehicle so its forward gear immediately reads as forward.
      yaw=sim.player.angle;pitch=.38;lookIdle=2;input.lookDelta=0;input.lookVertical=0;
      if(!aerialView){
        const distance=farCamera?14:9.3;
        camera.position.set(sim.player.x-Math.sin(yaw)*distance,1.55+Math.sin(pitch)*distance,sim.player.z-Math.cos(yaw)*distance);
        camera.lookAt(sim.player.x,1.1,sim.player.z);
      }
    }
  }
  if(name==='job')sim.startMission();
  if(name==='recover'){sim.reset();yaw=sim.player.angle;aerialTracking=false;announce('Recovered to a nearby street. Your next ride is waiting.');}
  if(name==='map')hud.toggleMap();
  if(name==='camera'){farCamera=!farCamera;announce(farCamera?'Camera: wide chase':'Camera: close chase');}
  if(name==='horn')audio.horn();
}
function togglePause(force) {
  if(!started)return;
  paused=force??!paused;
  input.clear();
  if(paused && !$('pause-dialog').open && !$('help-dialog').open && !$('sources-dialog').open)$('pause-dialog').showModal();
  if(!paused&&$('pause-dialog').open)$('pause-dialog').close();
}

$('start-button').addEventListener('click',()=>{
  if(!sim||!bootReady)return;
  started=true;paused=false;setView('city');$('intro').hidden=true;
  for(const id of ['hud','mission-panel','wanted'])$(id).hidden=cityView;
  $('touch-controls').hidden=true;
  announce('Choose a neighborhood to start exploring New York.');
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
$('view-button').addEventListener('click',()=>action('view'));
$('city-button').addEventListener('click',()=>{if(!started&&bootReady){$('start-button').click();return;}setView(cityView?'street':'city');});
$('travel-button').addEventListener('click',()=>travel(roadIndex?.places[Number($('place-select').value)]));
canvas.addEventListener('wheel',event=>{if(cityView){event.preventDefault();cityZoom=clamp(cityZoom*Math.exp(event.deltaY*.001),.07,1.8);}},{passive:false});
canvas.addEventListener('dblclick',event=>{
  if(!cityView||traveling||!bootReady)return;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2),camera);
  const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  if(point)travel({x:point.x,z:point.z,name:'Selected street'});
});
$('sources-button').addEventListener('click',()=>{pausedBeforeSources=paused;if(started)paused=true;input.clear();$('sources-dialog').showModal();});
$('sources-dialog').addEventListener('close',()=>{paused=pausedBeforeSources;input.clear();});
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
  const activeCars=new Set(sim.cars.map(car=>car.id));
  for(const [id,mesh] of carModels)if(!activeCars.has(id)){scene.remove(mesh);carModels.delete(id);}
  avatar.visible=p.mode==='walk';avatar.position.set(p.x,0,p.z);avatar.rotation.y=p.angle;
  animatePerson(avatar,Math.abs(p.speed)>.1,elapsed,Math.abs(p.speed)/3);
  for(const car of sim.cars){
    let mesh=carModels.get(car.id);
    if(!mesh){mesh=createCar({type:car.type,color:car.color});carModels.set(car.id,mesh);scene.add(mesh);}
    mesh.visible=Math.hypot(car.x-p.x,car.z-p.z)<230;
    updateCarVisuals(mesh,car,dt);
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

}

function updateCamera(dt) {
  const p=sim.player,driving=p.mode==='drive';
  if(cityView||!started){
    input.lookVertical=0;cityOrbit+=input.lookDelta;input.lookDelta=0;
    const b=city.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
    desiredCamera.set(cx+Math.sin(cityOrbit-.3)*span*.65*cityZoom,span*.86*cityZoom,cz+Math.cos(cityOrbit-.3)*span*.65*cityZoom);
    camera.position.lerp(desiredCamera,1-Math.exp(-dt*5));camera.near=10;camera.far=150000;camera.fov=52;camera.lookAt(cx,0,cz);camera.updateProjectionMatrix();scene.fog=null;return;
  }
  camera.near=.15;camera.far=6500;scene.fog=localFog;
  if(aerialView){
    input.lookDelta=0;input.lookVertical=0;
    cameraTarget.set(p.x,0,p.z);
    // Move the eye and its target together. Smoothing only the eye while
    // aiming at the player makes the whole city appear to tilt during travel.
    // Entering this view or teleporting starts a fresh local tracking target.
    if(!aerialTracking||aerialTarget.distanceToSquared(cameraTarget)>200*200){
      aerialTarget.copy(cameraTarget);aerialTracking=true;
    }else aerialTarget.lerp(cameraTarget,1-Math.exp(-dt*4));
    camera.position.copy(aerialTarget).add(aerialOffset);
    // At this altitude a street-level near plane wastes depth precision and
    // makes closely spaced ground surfaces flicker.
    camera.near=5;camera.lookAt(aerialTarget);camera.fov=52;camera.updateProjectionMatrix();return;
  }
  const look=input.lookDelta,vertical=input.lookVertical;input.lookDelta=0;input.lookVertical=0;
  yaw+=look;pitch=clamp(pitch+vertical,.17,.85);lookIdle=look||vertical?0:lookIdle+dt;
  if(!started){yaw=p.angle+Math.sin(elapsed*.12)*.13;pitch=.48;}
  else if(driving&&Math.abs(p.speed)>1&&lookIdle>1.1)yaw+=angleDifference(p.angle,yaw)*(1-Math.exp(-dt*5));
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
    // Walking follows the view currently on screen, including the aerial view
    // and camera smoothing, rather than an intended chase-camera angle.
    camera.getWorldDirection(cameraForward);
    controls=input.sample(Math.atan2(cameraForward.x,cameraForward.z),dt);
    if(!paused&&!traveling&&!cityView&&bootReady){sim.step(controls,dt);elapsed+=dt;}
  }else elapsed+=dt;
  syncScene(paused||traveling||cityView?0:dt,controls);updateCamera(dt);
  world.update(sim.player,camera,{overview:cityView||!started});ground.update(sim.player,{overview:cityView||!started});
  sun.position.set(sim.player.x-160,210,sim.player.z+90);sun.target.position.set(sim.player.x,0,sim.player.z);
  if(bootReady&&!traveling)refreshRoads();
  audio.update(sim,elapsed,started&&!paused&&!traveling&&!cityView);
  hudTime+=dt;if(hudTime>.075){hud.city=sim.city;hud.update(sim);saveProgress();updateLocation();hudTime=0;}
  renderer.render(scene,camera);
  qualityTimer+=dt;if(dt>.035)slowFrames++;
  if(highQuality&&qualityTimer>5){if(slowFrames>90){highQuality=false;applyQuality();announce('Switched to balanced graphics for smoother streets.');}qualityTimer=0;slowFrames=0;}
}

function setView(mode){
  if(mode!=='aerial'||!aerialView)aerialTracking=false;
  cityView=mode==='city';aerialView=mode==='aerial';input.clear();
  $('view-button').textContent=cityView?'STREET CAMERA':aerialView?'CITY OVERVIEW':'AERIAL VIEW';
  $('city-button').textContent=cityView?'RETURN TO STREET':'ALL FIVE BOROUGHS';
  $('city-navigation').hidden=!cityView;
  if(started)for(const id of ['hud','mission-panel','wanted'])$(id).hidden=cityView;
  $('touch-controls').hidden=cityView||!started||!matchMedia('(pointer:coarse)').matches;
}
function updateLocation(){
  const geo=worldToGeographic(sim.player.x,sim.player.z);
  $('coordinates').textContent=Math.abs(geo.lat).toFixed(4)+'° N / '+Math.abs(geo.lon).toFixed(4)+'° W';
  const nearest=roadIndex.places.reduce((best,place)=>Math.hypot(place.x-sim.player.x,place.z-sim.player.z)<Math.hypot(best.x-sim.player.x,best.z-sim.player.z)?place:best,roadIndex.places[0]);
  $('district-name').textContent=nearest.borough.toUpperCase();
}
function updateStreaming(status){
  $('stream-status').textContent=traveling?'LOADING DESTINATION…':status.error?'CITY CONNECTION INTERRUPTED · RETRYING':status.loading?'LOADING NYC · '+status.visibleChunks+' AREAS VISIBLE':status.visibleChunks+' AREAS VISIBLE · CITY READY';
}
function applyBuildings(next){
  buildings=next;
  if(sim){sim.setActiveCity({buildings});city=sim.city;}
}
async function refreshRoads(){
  const key=Math.floor(sim.player.x/400)+','+Math.floor(sim.player.z/400);
  if(key===roadCell||roadBusy)return;
  roadCell=key;roadBusy=true;const epoch=roadEpoch;
  try{
    const roads=await roadStream.loadAround(sim.player);
    if(epoch!==roadEpoch)return;
    sim.setActiveCity({roads,missionPoints:localDestinations(roads,sim.player)});city=sim.city;
  }catch(error){roadCell='';announce(error.message);}finally{roadBusy=false;}
}
async function travel(place){
  if(!place||traveling||!bootReady)return;
  traveling=true;roadEpoch++;input.clear();$('travel-button').disabled=true;
  $('travel-note').textContent='Loading surveyed buildings and streets…';
  const previous={roads:sim.city.roads,buildings:sim.city.buildings,missionPoints:sim.city.missionPoints};
  try{
    let roads=await roadStream.loadAround(place,1000);
    const target=nearestStreet(roads,place,600);
    if(!target)throw new Error('Choose a point closer to a street. Water and unmapped areas cannot be arrival points.');
    await world.prepareAt(target,300);
    // Data readiness is a prerequisite for changing the player position.
    sim.setActiveCity({roads,buildings,missionPoints:localDestinations(roads,target)},{spawn:{...target,name:place.name}});
    if(sim.mission.phase==='active'){sim.mission.phase='failed';announce('Travel canceled the active delivery. Your earnings are saved.');}
    city=sim.city;yaw=sim.player.angle;roadCell='';
    for(const ped of pedestrians)scene.remove(ped.mesh);pedestrians.length=0;populatePedestrians();
    camera.position.set(sim.player.x-Math.sin(yaw)*12,9,sim.player.z-Math.cos(yaw)*12);
    if(!started)$('start-button').click();
    setView('street');$('travel-note').textContent='Choose a neighborhood, or double-click a street in the city view.';
  }catch(error){
    // The stream can publish additional colliders while a destination loads.
    // Restore navigation data without replacing that newer collision snapshot.
    sim.setActiveCity({...previous,buildings});$('travel-note').textContent=error.message;announce(error.message);
  }
  finally{traveling=false;$('travel-button').disabled=false;}
}

async function boot() {
  const loadData=async file=>{const response=await fetch('./'+file);if(!response.ok)throw new Error('The city data could not load. Reload to try again.');return response.json();};
  const [seed,index,streets,land]=await Promise.all(['city.json','city-index.json','road-index.json','boroughs.json'].map(loadData));
  cityIndex=index;roadIndex=streets;boroughs=land.boroughs;roadStream=createRoadStream(roadIndex);
  city={...seed,bounds:roadIndex.bounds,buildings:[],roads:[],boroughs,missionPoints:[]};
  $('load-text').textContent='CONNECTING TO NEW YORK…';
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#bbcbd3');localFog=new THREE.FogExp2('#bbcbd3',.00042);
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,10,150000);
  scene.add(new THREE.HemisphereLight(0xe7edf0,0x8a8580,2.1));
  sun=new THREE.DirectionalLight(0xfff0db,2.2);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-160;sun.shadow.camera.right=160;sun.shadow.camera.top=160;sun.shadow.camera.bottom=-160;sun.shadow.camera.near=1;sun.shadow.camera.far=550;sun.shadow.bias=-.001;sun.shadow.normalBias=.1;scene.add(sun);scene.add(sun.target);
  sim=new Simulation(city);restoreProgress();yaw=sim.player.angle;
  world=createCityStream(cityIndex,{scene,onCollisionChange:applyBuildings,onStatus:updateStreaming});
  ground=createCityGround({scene,onStatus:status=>{if(status.failures)$('imagery-status').textContent='Some aerial tiles are unavailable. NYC imagery will retry as you explore; surveyed geometry loads separately.';}});
  world.setOrthophoto(ground.orthophoto);
  avatar=createPerson(0xd7774e);scene.add(avatar);marker=createMissionMarker();enterHint=createEnterHint();
  hud=new HUD(city);applyQuality();
  const b=city.bounds;camera.position.set((b.minX+b.maxX)/2-14000,44000,(b.minZ+b.maxZ)/2+32000);
  $('place-select').innerHTML=roadIndex.places.map((place,i)=>'<option value="'+i+'">'+place.name+' · '+place.borough+'</option>').join('');
  window.nycGame={getState:()=>({player:{...sim.player},heat:sim.heat,health:sim.health,mission:{...sim.mission},cash:sim.cash,deliveries:sim.deliveries,cars:sim.cars.length,buildings:buildings.length,totalBuildings:cityIndex.stats.buildingFeatures,stream:world.getStatus(),ground:ground.getStatus(),cityView,aerialView,traveling,bootReady,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,started,paused})};
  requestAnimationFrame(frame);
  const [roads]=await Promise.all([roadStream.loadAround(seed.spawn),world.prepareAt(seed.spawn,300)]);
  sim.setActiveCity({roads,buildings,isReadyAt:(x,z,radius)=>world.isReadyAt(x,z,radius),missionPoints:localDestinations(roads,seed.spawn)},{spawn:seed.spawn});city=sim.city;yaw=sim.player.angle;
  populatePedestrians();bootReady=true;
  $('start-button').disabled=false;$('travel-button').disabled=false;$('load-text').textContent='EXPLORE NEW YORK';
}
boot().catch(error=>{
  console.error(error);$('load-text').textContent='UNABLE TO START';$('load-error').hidden=false;
  $('load-error').textContent=error.message.includes('WebGL')?'This game needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.':error.message;
});
