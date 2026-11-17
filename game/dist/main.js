import { updateChaseHeight } from './vehicle-presentation.js';
import * as THREE from './vendor/three.module.min.js';
import { createCar, createParkedCars, createPerson, updateCarVisuals, setVehicleLamps } from './world.js';
import { Simulation } from './simulation.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { CityAudio } from './audio.js';
import { createCityStream } from './city-stream.js';
import { createCityGround, worldToGeographic } from './city-ground.js';
import { createStreetDetail } from './street-detail.js';
import { Landscape } from './landscape.js';
import { RoadPilot } from './road-pilot.js';
import { createRoadStream, nearestStreet, localDestinations } from './road-stream.js';
import { createCityNavigation } from './city-navigation.js';
import { GameMap } from './game-map.js';
import { createRoutePlanner } from './route-planner.js';
import { createGraphics } from './gfx.js';
import { createStreetscape } from './streetscape.js';
import { createStreetLife } from './streetlife.js';
import { createWater } from './water.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const angleDifference = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SAVE_KEY = 'nyc-after-hours-v1';
const DISPLAY_KEY = 'nyc-after-hours-display-v1';
let sim, city, renderer, scene, camera, world, hud, avatar, marker, markerDiamond, enterHint, navigation, gfx;
let started=false, paused=false, highQuality=false, farCamera=false, aerialView=false, aerialTracking=false, savedEarnings='';
let shadowsEnabled=true;
let cityIndex, roadIndex, roadStream, ground, streetDetail, bootReady=false, traveling=false, pausedBeforeSources=false;
let viewOverride=null;
let cityView=false, cityZoom=1, cityOrbit=0, cityFocus=null, roadCell='', roadEpoch=0, roadBusy=false, buildings=[], boroughs=[];
let streetscape=null, streetLife=null, water=null, parkedCars=null;
const noStreetFurniture=[];
let landscape=null, landscapeRevision=0, landscapeDirty=false, landscapeManifest=null, reconstructionReview=null, roadReconstructionReview=null, streetManifest=null;
// The opening shot: a slow sweep around the Financial District from the harbor.
const INTRO={x:-420,z:1760,radius:2700,height:150,aim:150,aside:620,bearing:-.82,sweep:.38};
let introTime=0;
const terrainHeight=(x,z)=>landscape?.sampleHeight(x,z)??0;
// Where actors stand: the bare terrain plus the street surface laid on it.
const groundHeight=(x,z)=>terrainHeight(x,z)+(streetscape?.offsetAt(x,z)||0);
function groundSurface(x,z){
  const surface=landscape?.sampleSurface(x,z),lift=streetscape?.offsetAt(x,z)||0;
  return surface&&lift?{...surface,elevation:surface.elevation+lift}:surface;
}
let roadPilot=null, roadPilotIndex=null, roadPilotLoading=null, roadPilotError=null, roadPilotRetryAt=0;
let chaseHeight=null, chaseEyeOffset=null;
let gameMap, mapOpen=false, routePlanner=null, plannerReady=null, activeRoute=null, routeDestination=null, routeGuidance=null, routeEpoch=0, rerouteAt=0;
let yaw=0, pitch=.38, lookIdle=0, elapsed=0, lastFrame=0, hudTime=0, qualityTimer=0, slowFrames=0;
const carModels = new Map(), pedestrians=[];
const audio = new CityAudio();
const canvas=$('world');
const input=new Input(canvas, action);
const cameraTarget=new THREE.Vector3(), desiredCamera=new THREE.Vector3(), cameraForward=new THREE.Vector3();
const aerialTarget=new THREE.Vector3(), aerialOffset=new THREE.Vector3(-95,240,180);
const chaseLookAhead=new THREE.Vector3(), desiredLookAhead=new THREE.Vector3();

function announce(text) { if(sim){sim.notice=text;sim.noticeTime=4;} }
function action(name) {
  if(!sim)return;
  if(name==='map') { if(started&&!paused&&!traveling&&bootReady)gameMap?.toggle();return; }
  if(name==='pause'&&mapOpen) { gameMap.setOpen(false);return; }
  if(mapOpen)return;
  if(name==='pause') { if(started)togglePause();return; }
  if(name==='view') { setView(cityView?'street':aerialView?'city':'aerial');return; }
  if(name==='time') { if(gfx){const preset=gfx.nextPreset();updateTimeButton();announce('Time of day: '+preset.label.toLowerCase()+', '+gfx.clock+'.');}return; }
  if(!started||paused||traveling||!bootReady||cityView)return;
  if(name==='interact'){
    const changed=sim.interact();
    if(changed&&sim.player.mode==='drive'){
      // A walking camera can face the cab's nose. Start behind the newly
      // entered vehicle so its forward gear immediately reads as forward.
      yaw=sim.player.angle;pitch=.38;lookIdle=2;input.lookDelta=0;input.lookVertical=0;chaseLookAhead.set(0,0,0);
      if(!aerialView){
        const distance=farCamera?14:9.3;
        camera.position.set(sim.player.x-Math.sin(yaw)*distance,sim.player.y+1.55+Math.sin(pitch)*distance,sim.player.z-Math.cos(yaw)*distance);
        camera.lookAt(sim.player.x,sim.player.y+1.1,sim.player.z);
      }
    }
  }
  if(name==='job')sim.startMission();
  if(name==='recover'){chaseHeight=null;chaseEyeOffset=null;sim.reset();yaw=sim.player.angle;aerialTracking=false;chaseLookAhead.set(0,0,0);announce('Recovered to a nearby street. Your next ride is waiting.');}
  if(name==='camera'){farCamera=!farCamera;announce(farCamera?'Camera: wide chase':'Camera: close chase');}
  if(name==='horn')audio.horn();
}
function togglePause(force) {
  if(!started)return;
  paused=force??!paused;
  if(paused&&mapOpen)gameMap.setOpen(false);
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
$('shadows-button').addEventListener('click',()=>{
  shadowsEnabled=!shadowsEnabled;
  updateShadowButton();
  if(renderer)setLocalShadows(!cityView);
  saveDisplaySettings();
});
$('time-button').addEventListener('click',()=>action('time'));
$('help-button').addEventListener('click',()=>{if(started){paused=true;input.clear();}$('help-dialog').showModal();});
$('help-dialog').addEventListener('close',()=>{if(started)paused=false;input.clear();});
$('view-button').addEventListener('click',()=>action('view'));
$('open-map-button').addEventListener('click',()=>action('map'));
$('city-button').addEventListener('click',()=>{if(!started&&bootReady){$('start-button').click();return;}setView(cityView?'street':'city');});
$('travel-button').addEventListener('click',()=>travel(roadIndex?.places[Number($('place-select').value)]));
$('landscape-travel-button').addEventListener('click',()=>{
  const region=landscapeManifest?.regions[Number($('landscape-select').value)];
  if(region)travel({...region.view,name:region.name});
});
$('transport-travel-button').addEventListener('click',()=>{
  const region=streetManifest?.coverageRegions.filter(region=>region.view)[Number($('transport-select').value)];
  if(region)travel({...region.view,name:region.exploreName||region.name});
});
$('road-pilot-travel-button').addEventListener('click',()=>{
  if(roadPilotIndex)travel({...roadPilotIndex.spawn,name:roadPilotIndex.name,exact:true,roadPilot:true});
});
$('road-pilot-mode-button').addEventListener('click',()=>{
  if(!roadPilot)return;
  roadPilot.setMode(roadPilot.getStatus().mode==='reconstructed'?'aerial':'reconstructed');
  updateRoadPilotControls();
});
canvas.addEventListener('wheel',event=>{if(cityView){event.preventDefault();cityZoom=clamp(cityZoom*Math.exp(event.deltaY*.001),.07,1.8);}},{passive:false});
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
  // Quality sets shadow map sizes and the resolution the frame is drawn at.
  gfx.setQuality(highQuality?'high':'balanced');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,gfx.pixelRatioLimit));
  setLocalShadows(!cityView);
  $('quality-button').textContent='QUALITY: '+(highQuality?'HIGH':'BALANCED');
  resize();
}
function setLocalShadows(enabled) {
  // Sun shadows are drawn at street scale only. Switching between city and
  // local views invalidates shader variants once, not every frame.
  gfx.setShadows(shadowsEnabled,Boolean(enabled));
}
function updateTimeButton() {
  $('time-button').textContent='TIME: '+gfx.clock;
  $('time-button').setAttribute('aria-label','Time of day, '+gfx.clock+'. Select to skip ahead.');
}
function updateShadowButton(){
  $('shadows-button').textContent='SHADOWS: '+(shadowsEnabled?'ON':'OFF');
  $('shadows-button').setAttribute('aria-pressed',String(shadowsEnabled));
}
function restoreDisplaySettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(DISPLAY_KEY)||'null');
    if(saved?.version===1&&typeof saved.shadows==='boolean')shadowsEnabled=saved.shadows;
  }catch{}
  updateShadowButton();
}
function saveDisplaySettings(){
  try{localStorage.setItem(DISPLAY_KEY,JSON.stringify({version:1,shadows:shadowsEnabled}));}catch{}
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

// Cars parked at the kerb around the player. About seven spaces in ten are
// taken, always the same ones, so a street looks the same on every visit.
const PARKED_RANGE=150, PARKED_LIMIT=130, PARKED_SHARE=.72;
let parkedAt=null, parkedSource=null, parkedCount=0;
function refreshParkedCars() {
  const spaces=streetscape?.parking()||noStreetFurniture, p=sim.player;
  // Travel and recovery reseed the simulation's cars; notice and park again.
  if(parkedCount&&!sim.cars.some(car=>car._kerb))parkedAt=null;
  if(spaces===parkedSource&&parkedAt&&Math.hypot(p.x-parkedAt.x,p.z-parkedAt.z)<16)return;
  parkedSource=spaces;parkedAt={x:p.x,z:p.z};
  const near=[];
  for(const space of spaces){
    if(space.fill>=PARKED_SHARE)continue;
    const d=Math.hypot(space.x-p.x,space.z-p.z);if(d<PARKED_RANGE)near.push([d,space]);
  }
  near.sort((a,b)=>a[0]-b[0]);
  parkedCount=sim.syncParkedCars(near.slice(0,PARKED_LIMIT).map(entry=>entry[1]));
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
  // Kerbside cars are drawn together; every other car has a model of its own.
  const activeCars=new Set();for(const car of sim.cars)if(!car._kerb)activeCars.add(car.id);
  for(const [id,mesh] of carModels)if(!activeCars.has(id)){scene.remove(mesh);carModels.delete(id);}
  parkedCars?.update(sim.cars);
  avatar.visible=p.mode==='walk';avatar.position.set(p.x,p.y||0,p.z);avatar.rotation.y=p.angle;
  animatePerson(avatar,Math.abs(p.speed)>.1,elapsed,Math.abs(p.speed)/3);
  for(const car of sim.cars){
    if(car._kerb)continue;
    let mesh=carModels.get(car.id);
    if(!mesh){mesh=createCar({type:car.type,color:car.color,seed:car.id});carModels.set(car.id,mesh);scene.add(mesh);}
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
    ped.mesh.position.y=groundHeight(ped.mesh.position.x,ped.mesh.position.z);
    ped.mesh.rotation.y=Math.atan2(ped.b.x-ped.a.x,ped.b.z-ped.a.z)+(cycle<1?0:Math.PI);
    ped.mesh.visible=ped.mesh.position.distanceTo(avatar.position)<85;animatePerson(ped.mesh,true,elapsed+ped.phase);
  }
  if(sim.mission.phase==='active'&&sim.mission.target){
    marker.visible=true;marker.position.set(sim.mission.target.x,groundHeight(sim.mission.target.x,sim.mission.target.z),sim.mission.target.z);markerDiamond.rotation.y=elapsed*.7;markerDiamond.position.y=5+Math.sin(elapsed*2)*.3;
  }else marker.visible=false;
  const near=sim.getNearbyCar();enterHint.visible=p.mode==='walk'&&!!near&&started;
  if(near)enterHint.position.set(near.x,(near.y||0)+3+Math.sin(elapsed*2)*.15,near.z);

}

function updateCamera(dt) {
  const p=sim.player,driving=p.mode==='drive';
  if(viewOverride){
    // A fixed camera for photographs and visual checks. Play continues.
    const v=viewOverride;chaseHeight=null;chaseEyeOffset=null;input.lookDelta=0;input.lookVertical=0;
    camera.position.set(...v.position);camera.near=v.near??.3;camera.far=v.far??9000;camera.fov=v.fov??55;
    camera.lookAt(...v.target);camera.updateProjectionMatrix();return;
  }
  if(!started){
    // Before play begins the camera drifts over the Upper Bay, facing Lower
    // Manhattan: the first thing shown is the skyline, not a map.
    chaseHeight=null;chaseEyeOffset=null;input.lookDelta=0;input.lookVertical=0;
    const a=INTRO.bearing+INTRO.sweep*Math.sin(introTime*.045),sin=Math.sin(a),cos=Math.cos(a);
    camera.position.set(INTRO.x+sin*INTRO.radius,INTRO.height,INTRO.z+cos*INTRO.radius);
    camera.near=5;camera.far=60000;camera.fov=36;
    // Aim left of the towers so they stand clear of the title.
    camera.lookAt(INTRO.x-cos*INTRO.aside,INTRO.aim,INTRO.z+sin*INTRO.aside);camera.updateProjectionMatrix();return;
  }
  if(cityView){
    chaseHeight=null;chaseEyeOffset=null;
    input.lookVertical=0;cityOrbit+=input.lookDelta;input.lookDelta=0;
    const b=city.bounds,cx=cityFocus?.x??(b.minX+b.maxX)/2,cz=cityFocus?.z??(b.minZ+b.maxZ)/2,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
    desiredCamera.set(cx+Math.sin(cityOrbit-.3)*span*.65*cityZoom,span*.86*cityZoom,cz+Math.cos(cityOrbit-.3)*span*.65*cityZoom);
    camera.position.lerp(desiredCamera,1-Math.exp(-dt*5));camera.near=10;camera.far=150000;camera.fov=52;camera.lookAt(cx,terrainHeight(cx,cz),cz);camera.updateProjectionMatrix();return;
  }
  camera.near=.15;camera.far=6500;
  if(aerialView){
    chaseHeight=null;chaseEyeOffset=null;
    input.lookDelta=0;input.lookVertical=0;
    cameraTarget.set(p.x,p.y||0,p.z);
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
  // A manual orbit owns the view for 1.1 seconds. Ease assistance back in so
  // releasing the mouse does not abruptly pull the camera behind the car.
  const chaseAssist=clamp((lookIdle-1.1)/.65,0,1), speed=Math.abs(p.speed);
  if(driving&&speed>.25){
    const headingRate=7+4*clamp(speed/22,0,1);
    yaw+=angleDifference(p.angle,yaw)*(1-Math.exp(-dt*headingRate*chaseAssist));
  }
  if(driving){
    const car=sim.cars.find(candidate=>candidate.id===p.vehicleId);
    desiredLookAhead.set(Math.sin(p.angle),0,Math.cos(p.angle));
    const vx=car?.velocityX,vz=car?.velocityZ,velocity=Math.hypot(vx,vz);
    // Preview the actual forward path during a slide, but keep reverse views
    // behind the vehicle's nose rather than flipping toward reverse velocity.
    if(p.speed>0&&Number.isFinite(velocity)&&velocity>.5&&vx*desiredLookAhead.x+vz*desiredLookAhead.z>0){
      desiredLookAhead.set(vx/velocity,0,vz/velocity);
    }
    desiredLookAhead.multiplyScalar(clamp((p.speed-1)*.13,0,3)*chaseAssist);
    chaseLookAhead.lerp(desiredLookAhead,1-Math.exp(-dt*6));
    // Clip the smoothed target too: its path can cross a facade while the
    // car rounds a corner, even when the chase eye itself remains clear.
    const previewLength=chaseLookAhead.length();
    for(let d=.25;d<previewLength+.25;d+=.25){
      const probe=Math.min(d,previewLength);
      if(previewLength&&sim.isBlocked(p.x+chaseLookAhead.x*probe/previewLength,p.z+chaseLookAhead.z*probe/previewLength,.15,{ignoreWater:true})){
        chaseLookAhead.multiplyScalar(Math.max(0,probe-.25)/previewLength);break;
      }
    }
  }else chaseLookAhead.set(0,0,0);
  const distance=!started?18:driving?(farCamera?14:9.3):(farCamera?10:6.5);
  let safeDistance=distance;
  // Pull the chase camera forward before its sightline crosses a facade.
  // Checking the same collision geometry keeps narrow SoHo streets readable.
  for(let d=1;d<=distance;d+=.6){
    if(sim.isBlocked(p.x-Math.sin(yaw)*d,p.z-Math.cos(yaw)*d,.2,{ignoreWater:true})){safeDistance=Math.max(.9,d-.7);break;}
  }
  const previousHeight=chaseHeight;
  chaseHeight=updateChaseHeight(chaseHeight,p,dt,driving?'car:'+p.vehicleId:'walk');
  const eyeOffset=1.55+Math.sin(pitch)*safeDistance;
  if(chaseHeight!==previousHeight||chaseEyeOffset===null)chaseEyeOffset=eyeOffset;
  else chaseEyeOffset=THREE.MathUtils.damp(chaseEyeOffset,eyeOffset,safeDistance<3?22:driving?13:8,dt);
  // Eye and aim share the same smoothed elevation. Filtering only the eye
  // while looking at raw terrain height makes every bump pitch the camera.
  const height=chaseHeight.height+chaseEyeOffset;
  desiredCamera.set(p.x-Math.sin(yaw)*safeDistance,height,p.z-Math.cos(yaw)*safeDistance);
  camera.position.lerp(desiredCamera,1-Math.exp(-dt*(safeDistance<3?22:driving?13:8)));
  camera.position.y=height;
  // A smoothed camera can cut across a corner even when its destination is safe.
  // Clamp inward immediately, then ease back out once the sightline clears.
  const dx=camera.position.x-p.x,dz=camera.position.z-p.z,actualDistance=Math.hypot(dx,dz);
  for(let d=.6;d<=actualDistance;d+=.4){
    if(sim.isBlocked(p.x+dx*d/actualDistance,p.z+dz*d/actualDistance,.2,{ignoreWater:true})){
      const ratio=Math.max(.15,d-.5)/actualDistance;
      camera.position.x=p.x+dx*ratio;camera.position.z=p.z+dz*ratio;break;
    }
  }
  camera.position.y=Math.max(camera.position.y,terrainHeight(camera.position.x,camera.position.z)+.6);
  cameraTarget.set(p.x,chaseHeight.height+(driving?1.1:1.45),p.z);
  if(driving)cameraTarget.add(chaseLookAhead);
  camera.lookAt(cameraTarget);
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
    if(!paused&&!traveling&&!cityView&&!mapOpen&&bootReady){sim.step(controls,dt);elapsed+=dt;}
  }else{elapsed+=dt;introTime+=dt;}
  if(landscapeDirty){
    landscapeDirty=false;landscapeRevision++;
    world.setTerrainSampler(terrainHeight,landscapeRevision);
    streetDetail?.setTerrainSampler(terrainHeight,landscapeRevision);
    streetscape?.setTerrainSampler(terrainHeight,landscapeRevision);
    sim.updateGrounding();
  }
  syncScene(paused||traveling||cityView||mapOpen?0:dt,controls);if(!mapOpen)updateCamera(dt);navigation?.updatePin();
  // prepareAt owns the destination's collision data until arrival. Reselecting
  // around the old player while terrain is still loading would discard it.
  // Continue rendering and downloads; resume selection after arrival/rollback.
  if(!traveling)world.update(sim.player,camera,{overview:cityView||!started});
  ground.update(sim.player,{overview:cityView||!started});
  world.setLocalOrthophoto(ground.localOrthophoto);
  landscape?.setLocalOrthophoto(ground.localOrthophoto);
  landscape?.update(sim.player,{overview:cityView||!started});
  streetDetail?.setLocalOrthophoto(ground.localOrthophoto);
  streetDetail?.update(sim.player,{overview:cityView||!started});
  streetscape?.update(sim.player,{overview:cityView||!started});
  roadPilot?.setLocalOrthophoto(ground.localOrthophoto);
  if(started&&!cityView&&roadPilotIndex&&!roadPilot&&!roadPilotLoading&&Date.now()>=roadPilotRetryAt&&nearRoadPilot(sim.player,600))ensureRoadPilot().catch(()=>{});
  updateRoadPilotControls();
  // The opening shot and street play are lit with shadows; the map view is not.
  setLocalShadows(!cityView);
  // Light and shadows follow what the camera is looking at.
  const overview=cityView||!started;
  const lit=viewOverride?{x:viewOverride.target[0],y:viewOverride.target[1],z:viewOverride.target[2]}:!started?{x:INTRO.x,y:0,z:INTRO.z}
    :aerialView&&!overview?aerialTarget:{x:sim.player.x,y:sim.player.y||0,z:sim.player.z};
  gfx.update(dt,{focus:lit,overview:cityView&&!viewOverride,paused:paused||mapOpen});
  if(bootReady&&!traveling)refreshRoads();
  if(bootReady&&started&&!traveling&&!cityView)refreshParkedCars();
  audio.update(sim,elapsed,started&&!paused&&!traveling&&!cityView&&!mapOpen);
  hudTime+=dt;if(hudTime>.075){
    // Retain nearby streets if the optional citywide route download fails.
    if(!routePlanner&&gameMap.roads!==sim.city.roads)gameMap.setRoads(sim.city.roads);
    hud.city=sim.city;hud.update(sim);updateDirections();saveProgress();updateLocation();updateTimeButton();hudTime=0;
  }
  water.update(lit,{overview:cityView&&!viewOverride});
  // Lamps and headlights are gathered before the frame that they light.
  streetLife.update(lit,{lights:gfx.state.lightsOn,cars:sim.cars,overview:overview&&!viewOverride});
  setVehicleLamps(gfx.state.lightsOn);
  gfx.render();
  qualityTimer+=dt;if(dt>.035)slowFrames++;
  if(highQuality&&qualityTimer>5){if(slowFrames>90){highQuality=false;applyQuality();announce('Switched to balanced graphics for smoother streets.');}qualityTimer=0;slowFrames=0;}
}

function setView(mode){
  if(mode!=='aerial'||!aerialView)aerialTracking=false;
  chaseLookAhead.set(0,0,0);
  if(mode==='city'&&!cityView){cityFocus=null;cityZoom=1;}
  cityView=mode==='city';aerialView=mode==='aerial';input.clear();
  $('view-button').textContent=cityView?'STREET CAMERA':aerialView?'CITY OVERVIEW':'AERIAL VIEW';
  $('city-button').textContent=cityView?'RETURN TO STREET':'ALL FIVE BOROUGHS';
  $('city-navigation').hidden=!cityView;
  navigation?.setVisible(cityView);
  if(started)for(const id of ['hud','mission-panel','wanted'])$(id).hidden=cityView;
  $('touch-controls').hidden=cityView||!started||!matchMedia('(pointer:coarse)').matches;
}
function focusCityAddress(place){
  cityFocus={x:place.x,z:place.z};cityZoom=.18;
  const b=city.bounds,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
  // A search may select a different borough while the map is tightly zoomed.
  // Center both eye and target immediately so the selected pin stays visible.
  camera.position.set(place.x+Math.sin(cityOrbit-.3)*span*.65*cityZoom,span*.86*cityZoom,place.z+Math.cos(cityOrbit-.3)*span*.65*cityZoom);
  camera.lookAt(place.x,terrainHeight(place.x,place.z),place.z);camera.updateMatrixWorld();
}
function updateLocation(){
  const geo=worldToGeographic(sim.player.x,sim.player.z);
  $('coordinates').textContent=Math.abs(geo.lat).toFixed(4)+'° N / '+Math.abs(geo.lon).toFixed(4)+'° W';
  const nearest=roadIndex.places.reduce((best,place)=>Math.hypot(place.x-sim.player.x,place.z-sim.player.z)<Math.hypot(best.x-sim.player.x,best.z-sim.player.z)?place:best,roadIndex.places[0]);
  $('district-name').textContent=nearest.borough.toUpperCase();
}
function updateStreaming(status){
  $('stream-status').textContent=traveling?'LOADING DESTINATION…':status.error?'SOME CITY DETAIL UNAVAILABLE · RETRYING':status.loading?'LOADING NYC · '+status.visibleChunks+' AREAS VISIBLE':status.visibleChunks+' AREAS VISIBLE · CITY READY';
}
function updateLandscapeStatus(status){
  $('landscape-status').textContent=status.error
    ?'Some landscape detail is unavailable and will retry. '+status.error
    :!status.baseReady?'Loading measured ground…'
      :'Citywide terrain ready. '+status.activeRegions.length+' detailed park areas loaded; '+status.canopies.toLocaleString()+' nearby measured crowns visible.';
  const review=reconstructionReview?.summary;
  $('reconstruction-status').textContent=review
    ?review.accepted+' image masks passed source checks; '+review.rejected+' rejected. Accepted water masks affect appearance only.'
    :'Loading the imagery review…';
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
function nearRoadPilot(point, margin=0){
  const b=roadPilotIndex?.bounds;
  return Boolean(b&&point&&point.x>=b.minX-margin&&point.x<=b.maxX+margin&&point.z>=b.minZ-margin&&point.z<=b.maxZ+margin);
}
function updateRoadPilotControls(){
  const active=Boolean(roadPilot&&started&&!cityView&&!mapOpen&&nearRoadPilot(sim.player,30));
  $('road-pilot-controls').hidden=!active;
  if(!active)return;
  const reconstructed=roadPilot.getStatus().mode==='reconstructed';
  $('road-pilot-mode').textContent=reconstructed?'RECONSTRUCTED PAVEMENT':'SOURCE AERIAL';
  $('road-pilot-mode-button').textContent=reconstructed?'SHOW AERIAL':'SHOW RECONSTRUCTION';
  $('road-pilot-mode-button').setAttribute('aria-pressed',String(reconstructed));
}
async function ensureRoadPilot(){
  if(roadPilot)return roadPilot;
  if(roadPilotLoading)return roadPilotLoading;
  if(!roadPilotIndex||!landscape?.getStatus().baseReady)throw new Error('Measured terrain is still loading. Try the road pilot again shortly.');
  roadPilotLoading=(async()=>{
    let candidate=null;const releaseBackground=[];
    try{
      const json=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('The road pilot could not load. Select Explore road pilot to retry.');return response.json();};
      const [data,terrain,appearance]=await Promise.all([roadPilotIndex.manifestUrl,roadPilotIndex.terrainUrl,roadPilotIndex.appearanceUrl].map(json));
      const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      if(data.id!==roadPilotIndex.id||!same(data.origin,landscapeManifest.origin)||!same(appearance.origin,data.origin)
        ||!same(terrain.bounds,roadPilotIndex.bounds)||!same(terrain.bounds,data.terrain?.bounds)||terrain.sourceId!==data.terrain?.sourceId
        ||!terrain.alreadyBlended||!Array.isArray(data.terrain.requiredRegions))throw new Error('Road pilot assets do not describe the same measured location. Reload to retry.');
      // Build and validate before replacing older ground. A partial request
      // must never erase the playable baseline or leave half a road loaded.
      candidate=new RoadPilot({scene,data,appearance,orthophoto:ground.orthophoto});
      if(!candidate.getStatus().surfaces)throw new Error('The road pilot contains no validated road surfaces.');
      candidate.setVisible(false);
      for(const id of data.terrain.requiredRegions)releaseBackground.push(await landscape.retainTerrainRegion(id));
      landscape.addTerrainOverlay(roadPilotIndex.id,terrain);
      roadPilot=candidate;roadPilot.setMode('reconstructed');roadPilot.setVisible(true);roadPilotError=null;
      streetDetail?.setGroundReplacementBounds(terrain.bounds);
      streetscape?.setGroundReplacementBounds(terrain.bounds);
      landscapeDirty=true;
      const status=roadPilot.getStatus();
      $('road-pilot-status').textContent=status.surfaces+' surveyed surfaces; '+status.reconstructedSurfaces+' with source-sampled pavement. The comparison changes appearance only; driving geometry stays identical.';
      return roadPilot;
    }catch(error){
      if(candidate&&candidate!==roadPilot)candidate.dispose();
      if(!roadPilot)for(const release of releaseBackground)release();
      roadPilotError=error.message;roadPilotRetryAt=Date.now()+15000;
      $('road-pilot-status').textContent=error.message;throw error;
    }finally{roadPilotLoading=null;}
  })();
  return roadPilotLoading;
}
async function travel(place){
  if(!place||traveling||!bootReady)return false;
  traveling=true;roadEpoch++;input.clear();$('travel-button').disabled=true;$('landscape-travel-button').disabled=true;$('transport-travel-button').disabled=true;$('road-pilot-travel-button').disabled=true;
  navigation?.setTraveling(true);
  $('travel-note').textContent='Loading surveyed buildings and streets…';
  if(mapOpen)gameMap.setStatus('Loading measured ground and buildings at the pin…');
  const previous={roads:sim.city.roads,buildings:sim.city.buildings,missionPoints:sim.city.missionPoints};
  try{
    let roads=await roadStream.loadAround(place,1000);
    const target=place.exact?place:nearestStreet(roads,place,600);
    if(!target)throw new Error('Choose a point closer to a street. Water and unmapped areas cannot be arrival points.');
    if(place.exact&&!landscape?.getStatus().baseReady)throw new Error('Measured ground is unavailable. Wait for the terrain to load before spawning at this pin.');
    // Street surfaces are worth a short wait, but never hold up an arrival.
    await Promise.all([world.prepareAt(target,300),landscape?.prepareAt(target),streetscape?.prepareAt(target),place.roadPilot?ensureRoadPilot():nearRoadPilot(target)?ensureRoadPilot().catch(()=>null):null]);
    if(place.exact&&!landscape?.getStatus().baseWaterReady)throw new Error('Mapped water data is unavailable. Try again when it has loaded before spawning at this pin.');
    // Data readiness is a prerequisite for changing the player position.
    sim.setActiveCity({roads,buildings,missionPoints:localDestinations(roads,target)},{spawn:{...target,name:place.name,exact:Boolean(place.exact)}});
    if(sim.mission.phase==='active'){sim.mission.phase='failed';announce('Travel canceled the active delivery. Your earnings are saved.');}
    city=sim.city;yaw=sim.player.angle;roadCell='';chaseHeight=null;chaseEyeOffset=null;
    for(const ped of pedestrians)scene.remove(ped.mesh);pedestrians.length=0;populatePedestrians();
    camera.position.set(sim.player.x-Math.sin(yaw)*12,(sim.player.y||0)+9,sim.player.z-Math.cos(yaw)*12);
    if(!started)$('start-button').click();
    setView('street');$('travel-note').textContent='Choose a neighborhood, or double-click a street in the city view.';
    clearDirections();gameMap?.setStatus('Spawned at the selected location.');return true;
  }catch(error){
    // The stream can publish additional colliders while a destination loads.
    // Restore navigation data without replacing that newer collision snapshot.
    sim.setActiveCity({...previous,buildings});$('travel-note').textContent=error.message;announce(error.message);
    if(mapOpen)gameMap.setStatus(error.message);return false;
  }
  finally{traveling=false;$('travel-button').disabled=false;$('landscape-travel-button').disabled=!landscapeManifest;$('transport-travel-button').disabled=!streetManifest;$('road-pilot-travel-button').disabled=!roadPilotIndex;navigation?.setTraveling(false);}
}

function clearDirections(){
  routeEpoch++;activeRoute=null;routeDestination=null;routeGuidance=null;gameMap?.setRoute(null);
}
async function requestDirections(pin){
  const epoch=++routeEpoch;gameMap.setStatus('Finding a route along mapped streets…');
  try{
    const planner=await plannerReady;
    if(epoch!==routeEpoch)return false;
    if(!planner)throw new Error('Street directions could not load. Reload to try again; pin spawning is still available.');
    const route=planner.plan(sim.player,pin);
    if(!route.ok)throw new Error(route.message);
    activeRoute=route;routeDestination={...pin};routeGuidance=null;rerouteAt=elapsed+2;
    gameMap.setRoute(route);updateDirections();
    gameMap.setStatus(route.end.snapDistance>20?'Directions end at the nearest mapped street to the pin.':'Route ready. Close the map to follow the highlighted streets.');
    return true;
  }catch(error){
    if(epoch===routeEpoch){activeRoute=null;routeDestination=null;routeGuidance=null;gameMap.setRoute(null);gameMap.setStatus(error.message);}return false;
  }
}
function updateDirections(){
  if(!activeRoute||!routePlanner)return;
  routeGuidance=routePlanner.progress(activeRoute,sim.player,{previousDistance:routeGuidance?.passedDistance||0});
  // Replan only while playing, with a cooldown. A moved or cleared pin cancels
  // pending work so an older route cannot replace the current destination.
  if(routeGuidance?.offRoute&&!mapOpen&&!paused&&!traveling&&!cityView&&elapsed>=rerouteAt){
    rerouteAt=elapsed+2;
    const next=routePlanner.plan(sim.player,routeDestination);
    if(next.ok){activeRoute=next;gameMap.setRoute(next);routeGuidance=routePlanner.progress(next,sim.player);}
  }
  gameMap.setGuidance(routeGuidance);
}

async function boot() {
  const loadData=async file=>{const response=await fetch('./'+file,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('The city data could not load. Reload to try again.');return response.json();};
  const [seed,index,streets,land]=await Promise.all(['city.json','city-index.json','road-index.json','boroughs.json'].map(loadData));
  cityIndex=index;roadIndex=streets;boroughs=land.boroughs;roadStream=createRoadStream(roadIndex);
  city={...seed,bounds:roadIndex.bounds,buildings:[],roads:[],boroughs,missionPoints:[],sampleSurface:(x,z,options)=>roadPilot?.sampleSurface(x,z,{...options,kind:'bridge'})??streetDetail?.sampleSurface(x,z,options)??roadPilot?.sampleSurface(x,z,{...options,kind:'ground'})??groundSurface(x,z),landscapeContact:(x,z,radius)=>landscape?.contactAt(x,z,radius)};
  $('load-text').textContent='CONNECTING TO NEW YORK…';
  // The frame is antialiased in its own multisampled target, not the canvas.
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,10,150000);
  // Sky, sun, haze and the screen-space finish share one time of day.
  gfx=createGraphics({renderer,scene,camera});
  // Rivers, harbor and sea, bounded by the borough shorelines.
  water=createWater({scene,boroughs,bounds:roadIndex.bounds,panorama:gfx.skyPanorama});
  // The country around the city, as a silhouette. Optional: without it the city stands in open sea.
  loadData('context-land.json').then(manifest=>{
    const image=new Image();
    image.onload=()=>water.setContext(image,manifest);
    image.src=manifest.url;
  }).catch(()=>{});
  gfx.passes.push((renderer,scene,camera)=>water.renderMirror(renderer,scene,camera,{enabled:Boolean(viewOverride)||!cityView,scale:highQuality?.75:.5}));
  streetLife=createStreetLife({scene,renderer,getLamps:()=>streetscape?.lamps()||noStreetFurniture,getTrees:()=>streetscape?.trees()||noStreetFurniture});
  parkedCars=createParkedCars({capacity:PARKED_LIMIT+8});scene.add(parkedCars.group);
  sim=new Simulation(city);restoreProgress();yaw=sim.player.angle;
  world=createCityStream(cityIndex,{scene,onCollisionChange:applyBuildings,onStatus:updateStreaming,heightAt:terrainHeight});
  ground=createCityGround({scene,renderer,onStatus:status=>{if(status.failures)$('imagery-status').textContent='Some aerial tiles are unavailable. NYC imagery will retry as you explore; surveyed geometry loads separately.';}});
  world.setOrthophoto(ground.orthophoto);
  const landscapeReady=loadData('landscape-index.json').then(async index=>{
    landscapeManifest=index;
    landscape=new Landscape({scene,index,orthophoto:ground.orthophoto,onChange:()=>{landscapeDirty=true;},onStatus:updateLandscapeStatus});
    await landscape.loadBase();
    // Measured terrain and the water sheet now cover everything the flat
    // photograph did; it stays loaded as the terrain's and the roofs' texture.
    ground.group.visible=!landscape.getStatus().baseReady;
    sim.updateGrounding();world.setTerrainSampler(terrainHeight,++landscapeRevision);
    const select=$('landscape-select');
    select.innerHTML=index.regions.map((region,i)=>'<option value="'+i+'">'+region.name+'</option>').join('');
    $('landscape-travel-button').disabled=!bootReady;
    loadData('reconstruction-review.json').then(report=>{
      reconstructionReview=report;landscape?.setReconstructionReview(report);if(landscape)updateLandscapeStatus(landscape.getStatus());
    }).catch(()=>{$('reconstruction-status').textContent='Image review unavailable. Measured source geometry remains active.';});
  }).catch(()=>{
    landscape?.dispose();landscape=null;landscapeManifest=null;landscapeDirty=true;ground.group.visible=true;
    $('landscape-status').textContent='Measured terrain is unavailable. The aerial map remains playable.';
  });
  // Do not await optional detail. Even a stalled download must leave city
  // startup and travel independent of this neighborhood enrichment layer.
  // Asphalt, sidewalks, kerbs and paint. Surveyed outlines ship for a few
  // neighbourhoods; elsewhere they stream from NYC Open Data around the player.
  const startStreetscape=index=>{
    streetscape=createStreetscape({scene,index,heightAt:terrainHeight,onChange:()=>sim?.updateGrounding(),
      roadsFor:bounds=>roadStream.loadAround({x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2},320)});
    if(roadPilot)streetscape.setGroundReplacementBounds(roadPilotIndex.bounds);
  };
  loadData('street-detail-index.json').then(surfaces=>{
    streetManifest=surfaces;startStreetscape(surfaces);
    $('transport-select').innerHTML=surfaces.coverageRegions.filter(region=>region.view)
      .map((region,i)=>'<option value="'+i+'">'+(region.exploreName||region.name)+'</option>').join('');
    $('transport-travel-button').disabled=!bootReady||traveling;
    // The mapped street module now supplies bridge decks only.
    streetDetail=createStreetDetail(surfaces,{scene,orthophoto:ground.orthophoto,heightAt:terrainHeight,drape:false,onChange:()=>sim?.updateGrounding(),onStatus:status=>{
      $('street-detail-status').textContent=status.covered&&status.failures>0
        ?'Some mapped street surfaces are unavailable here. Aerial imagery remains available; street surfaces will retry.' :'';
    }});
    if(roadPilot)streetDetail.setGroundReplacementBounds(roadPilotIndex.bounds);
    $('street-detail-status').textContent='';
  }).catch(()=>{
    if(!streetscape)startStreetscape(null);
    $('street-detail-status').textContent='Mapped street data is unavailable. Aerial imagery and city travel remain available.';
  });
  loadData('road-pilot-index.json').then(index=>{
    if(index.version!==1||!index.id||!index.bounds||!index.spawn)throw new Error('Invalid road pilot index.');
    roadPilotIndex=index;$('road-pilot-travel-button').disabled=!bootReady||traveling;
  }).catch(()=>{$('road-pilot-note').textContent='Road pilot unavailable. Reload to try again.';});
  loadData('road-reconstruction-review.json').then(report=>{
    roadReconstructionReview=report;
    $('road-reconstruction-status').textContent=report.summary.accepted+' of '+report.summary.candidates+
      ' road and parking masks passed source checks. Rejected masks create no game geometry.';
  }).catch(()=>{$('road-reconstruction-status').textContent='Road image review unavailable. Surveyed surfaces remain active.';});
  avatar=createPerson(0xd7774e,{courier:true});scene.add(avatar);marker=createMissionMarker();enterHint=createEnterHint();
  hud=new HUD(city);applyQuality();
  gameMap=new GameMap({city,onPin:clearDirections,onRoute:requestDirections,
    onSpawn:pin=>travel({...pin,exact:true}),
    onOpenChange:open=>{mapOpen=open;input.clear();input.lookDelta=0;input.lookVertical=0;if(!open)canvas.focus();}});
  hud.attachMap(gameMap);
  // The compact citywide graph is optional: a failed route download must not
  // prevent entering the game or using a measured, validated spawn point.
  plannerReady=loadData('navigation-roads.json').then(data=>{
    routePlanner=createRoutePlanner(data);gameMap.setRoads(routePlanner.roads);return routePlanner;
  }).catch(()=>null);
  const b=city.bounds;camera.position.set((b.minX+b.maxX)/2-14000,44000,(b.minZ+b.maxZ)/2+32000);
  navigation=createCityNavigation({canvas,camera,input,bounds:city.bounds,heightAt:terrainHeight,onTravel:travel,onAddressSelected:focusCityAddress});
  $('place-select').innerHTML=roadIndex.places.map((place,i)=>'<option value="'+i+'">'+place.name+' · '+place.borough+'</option>').join('');
  window.nycGame={graphics:gfx,get streetscape(){return streetscape;},get streetLife(){return streetLife;},get parkedCars(){return parkedCars;},get world(){return world;},heightAt:(x,z)=>terrainHeight(x,z),setView:view=>{viewOverride=view&&Array.isArray(view.position)&&Array.isArray(view.target)?view:null;},getState:()=>({time:gfx.clock,player:{...sim.player},heat:sim.heat,health:sim.health,mission:{...sim.mission},cash:sim.cash,deliveries:sim.deliveries,cars:sim.cars.length,parkedCars:sim.cars.filter(car=>car._kerb).length,buildings:buildings.length,totalBuildings:cityIndex.stats.buildingFeatures,stream:world.getStatus(),ground:ground.getStatus(),streetDetail:streetDetail?.getStatus()||null,streetscape:streetscape?.getStatus()||null,landscape:landscape?.getStatus()||null,reconstruction:reconstructionReview?{model:reconstructionReview.model,summary:reconstructionReview.summary}:null,roadReconstruction:roadReconstructionReview?{model:roadReconstructionReview.model,summary:roadReconstructionReview.summary}:null,roadPilot:roadPilot?roadPilot.getStatus():{ready:false,loading:Boolean(roadPilotLoading),error:roadPilotError},navigation:navigation.getState(),map:gameMap.getState(),routeGuidance,cityView,aerialView,traveling,bootReady,shadows:{enabled:shadowsEnabled,active:renderer.shadowMap.enabled},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,started,paused})};
  requestAnimationFrame(frame);
  const [roads]=await Promise.all([roadStream.loadAround(seed.spawn),world.prepareAt(seed.spawn,300),landscapeReady]);
  sim.setActiveCity({roads,buildings,isReadyAt:(x,z,radius)=>world.isReadyAt(x,z,radius),missionPoints:localDestinations(roads,seed.spawn)},{spawn:seed.spawn});city=sim.city;yaw=sim.player.angle;
  populatePedestrians();bootReady=true;
  $('start-button').disabled=false;$('travel-button').disabled=false;$('landscape-travel-button').disabled=!landscapeManifest;$('transport-travel-button').disabled=!streetManifest;$('road-pilot-travel-button').disabled=!roadPilotIndex;$('load-text').textContent='EXPLORE NEW YORK';
}
restoreDisplaySettings();
boot().catch(error=>{
  console.error(error);$('load-text').textContent='UNABLE TO START';$('load-error').hidden=false;
  $('load-error').textContent=error.message.includes('WebGL')?'This game needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.':error.message;
});
