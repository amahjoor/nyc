import { updateChaseHeight } from './vehicle-presentation.js';
import { createDriverCabin } from './driver-cabin.js';
import { createSwitchShot } from './switch-shot.js';
import * as THREE from './vendor/three.module.min.js';
import { createCar, createParkedCars, createDistantTraffic, createPerson, updateCarVisuals, setVehicleLamps } from './world.js';
import { Simulation, TRAFFIC_SIGHT } from './simulation.js';
import { OFFICER_LOOK } from './police.js';
import { createPoliceScene } from './police-scene.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { CityAudio } from './audio.js';
import { lotsReady, createCityStream } from './city-stream.js';
import { createCityGround, worldToGeographic } from './city-ground.js';
import { createStreetDetail } from './street-detail.js';
import { Landscape } from './landscape.js';
import { RoadPilot } from './road-pilot.js';
import { createRoadStream, nearestStreet, localDestinations } from './road-stream.js';
import { createCityNavigation } from './city-navigation.js';
import { GameMap } from './game-map.js';
import { createRoutePlanner } from './route-planner.js';
import { createStreetIndex, createPlaceIndex, searchLocal, title } from './local-search.js';
import { createPlaceLayer } from './map-places.js';
import { createGraphics } from './gfx.js';
import { createStreetscape } from './streetscape.js';
import { createStreetLife } from './streetlife.js';
import { createWater } from './water.js';
import { createCityLife, manhattanCore, characterAt } from './citylife.js';
import { createStreetSigns } from './street-signs.js';
import { createCrowd, dress, seeded, KIT } from './crowd.js';
import { createStreetProps } from './street-props.js';
import { createPlaceSource, placeName, joinPlaceSources, indexFootprints, solveFrontages } from './places.js';
import { createStorefronts } from './storefronts.js';
import { Work } from './work.js';
import { createPhone, describePlace } from './phone.js';
import { createFleet } from './fleet.js';
import { createVehicleMeshLibrary } from './vehicle-assets.js';
import { designFor } from './vehicle-designs.js';
import { offersAt } from './garage.js';
import { planRoom, buildRoom, roomKind, hasRoom } from './interiors.js';
import { doorBlips } from './map-blips.js';
import { createDemographics } from './demographics.js';
import { createBuses, createBusStops } from './bus.js';
import { createSheds, planSheds, createShedMesh } from './sheds.js';
import { createDining, planDining, createDiningMesh, seatsOf } from './dining.js';
import { planStands, vendorOf, createStandMesh } from './stands.js';
import { createBikeShare, planBikeDocks, createBikeDocks } from './bikes.js';
import { menuFor } from './menu.js';
import { createSubway, createSubwayEntrances, FARE } from './subway.js';
import { indexKerbs, snapToKerb } from './street-props.js';
import { formatDistance } from './phone.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const angleDifference = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SAVE_KEY = 'nyc-after-hours-v1';
const DISPLAY_KEY = 'nyc-after-hours-display-v1';
let sim, city, renderer, scene, camera, world, hud, avatar, marker, markerDiamond, enterHint, navigation, gfx, policeScene;
let started=false, paused=false, highQuality=false, farCamera=false, aerialView=false, aerialTracking=false, savedEarnings='';
let shadowsEnabled=true;
let cityIndex, roadIndex, roadStream, ground, streetDetail, bootReady=false, traveling=false;
let viewOverride=null;
// The satellite shot that carries the view from one place to the next (switch-shot.js).
const switchShot=createSwitchShot();let switchShotLive=false;
let cityView=false, cityZoom=1, cityOrbit=0, cityFocus=null, roadCell='', roadEpoch=0, roadBusy=false, buildings=[], boroughs=[];
let streetscape=null, streetLife=null, water=null, parkedCars=null, distantTraffic=null, signs=null, crowd=null, props=null, cityLife=createCityLife(null), lifeTimer=0;
const noStreetFurniture=[], crowdAhead=new THREE.Vector3();
let cameraFlashing=false;
// What is at each address (places.js), and the street fronts of those near the player.
let placeSource=null, storefronts=null, footprints=indexFootprints([]), fronts=[], frontsFor=null, placeTimer=0;
// The doors that can be walked through near the player, as the radar and the map mark them: fronts with a room behind them, and the subway's stairs.
let doors=[], doorsFor=null;
// The phone, and where a delivery can be sent: the streets around, and the places with a street front.
let phone=null, work=null, roadDestinations=[], placeDestinations=[], shopHere=null;
// The front the player is standing at if it has a room to go into, and the room they are in.
// The player and shop staff as the crowd's modelled figures, once those have loaded: where in their stride the player is.
let playerStride=0, strideClock=0;
const officerModels=new Map();
const PLAYER_LOOK={top:0xd7774e,bottom:0x1c1d22,skin:0xb98563,hair:0x14110f,kit:0,height:1.76};
let doorAgain=0;
let doorHere=null, roomGroup=null, roomStaff=[], roomGuests=[], counterHere=false;
// The subway: its stations, the stair entrances drawn nearby, the one the player is standing at, and the kerbs they line up with.
// Who lives where (demographics.js): one even range of faces until the survey has loaded.
let demographics=createDemographics(null);
// The buses: their stops, those drawn nearby, and the one the player is waiting at.
let buses=null, busStops=null, stopHere=null;
// Sidewalk sheds: the buildings permitted one, and those standing nearby.
let sheds=null, shedMesh=null;
// Sidewalk cafes: the addresses licensed for one, and the tables set out nearby.
let dining=null, diningMesh=null, diners=[];
// Newsstands and fruit stands at the kerb, and whoever minds each.
let standMesh=null, vendors=[], standHere=null;
// Citi Bike: the stations, and the docks drawn nearby.
let bikeShare=null, bikeDocks=null;
let subway=null, subwayStairs=null, stairHere=null, kerbIndex=null, kerbsFor=null;
// Which cars are registered where (fleet.js): the whole city's mix until the counts by ZIP code have loaded.
let fleet=createFleet(null);
const vehicleMeshes=createVehicleMeshLibrary();
const destinationsFor=(roads,focus)=>{roadDestinations=localDestinations(roads,focus);return [...roadDestinations,...placeDestinations];};
const trafficAhead=new THREE.Vector3();
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
function cityPresets(){
  const parks=landscape?.getStatus().baseReady?landscapeManifest.regions:[];
  const streets=streetManifest?.coverageRegions.filter(region=>region.view)||[];
  const places=[
    ...roadIndex.places,
    ...parks.map(region=>({...region.view,name:region.name})),
    ...streets.map(region=>({...region.view,name:region.exploreName||region.name})),
  ];
  if(roadPilotIndex&&landscape?.getStatus().baseReady){
    places.push({...roadPilotIndex.spawn,name:roadPilotIndex.name,borough:'Queens',exact:true,roadPilot:true});
  }
  return places;
}
let chaseHeight=null, chaseEyeOffset=null;
let firstPerson=false, headAnchor, headTurn=0, headPitch=0, driverCabin=null, snapChase=false;
let gameMap, mapOpen=false, routePlanner=null, plannerReady=null, activeRoute=null, routeDestination=null, routeGuidance=null, routeEpoch=0, rerouteAt=0;
let yaw=0, pitch=.38, lookIdle=0, elapsed=0, lastFrame=0, hudTime=0, qualityTimer=0, slowFrames=0;
const carModels = new Map(), distantCars=[];
// Cars are drawn as far as the simulation keeps traffic in sight. Traffic
// nearer than MODEL_RANGE gets a model of its own and keeps it out to
// MODEL_KEPT, so that none flickers between the two at the boundary.
const CAR_SIGHT=TRAFFIC_SIGHT, MODEL_RANGE=42, MODEL_KEPT=52;
const audio = new CityAudio();
const canvas=$('world');
const input=new Input(canvas, action, event=>phone?.handleKey(event));
const cameraTarget=new THREE.Vector3(), desiredCamera=new THREE.Vector3(), cameraForward=new THREE.Vector3();
const aerialTarget=new THREE.Vector3(), aerialOffset=new THREE.Vector3(-95,240,180);
// How far back the aerial camera stands, as a multiple of that offset: 1 is
// the view V opens on. The wheel sets the goal and the camera eases to it.
const AERIAL_ZOOM_MIN=.3, AERIAL_ZOOM_MAX=3;
let aerialZoom=1, aerialZoomGoal=1;
const zoomAerial=factor=>{aerialZoomGoal=clamp(aerialZoomGoal*factor,AERIAL_ZOOM_MIN,AERIAL_ZOOM_MAX);};
const chaseLookAhead=new THREE.Vector3(), desiredLookAhead=new THREE.Vector3();

function announce(text) { if(sim){sim.notice=text;sim.noticeTime=4;} }
function firstPersonActive(){return started&&firstPerson&&!aerialView&&!cityView&&!viewOverride&&!switchShot.active;}
function updatePerspectiveButton(){
  $('first-person-button').textContent=firstPersonActive()?'THIRD PERSON':'FIRST PERSON';
}
function action(name,event) {
  if(!sim)return;
  if(name==='map') { if(started&&!paused&&!traveling&&bootReady){phone?.setOpen(false);gameMap?.toggle();}return; }
  if(name==='pause'){
    if(!started)return;
    // Escape also dismisses native dialogs by default, including one just opened here.
    event?.preventDefault();
    if($('sources-dialog').open)$('sources-dialog').close();
    else if($('help-dialog').open)$('help-dialog').close();
    else if(mapOpen)gameMap.setOpen(false);
    else if(phone?.open)phone.setOpen(false);
    else togglePause();
    return;
  }
  if(name==='shop'&&(!started||paused||traveling||!bootReady||cityView||mapOpen||phone?.open))return;
  if(name==='shop'&&sim.room) {
    // Indoors, at the counter: what the place sells.
    const menu=menuFor(sim.room.place);
    if(!menu.length)announce('Nothing is sold over the counter here.');
    else if(!counterHere)announce('Go up to whoever is serving.');
    else {
      const shop=sim.room.place;
      const rows=menu.map(item=>({item,name:item.name.toUpperCase(),note:'$'+item.price.toFixed(2)}));
      rows.push({name:'Rob the till', note:'Reported crime · two wanted stars'});
      phone.openList(sim.room.name,rows,({item})=>{
        if (!item) { work.rob(shop); return; }
        if(sim.buy(item))saveProgress();
      });
    }
    return;
  }
  if(name==='shop'&&standHere&&sim.player.mode==='walk') {
    // At a stand on the sidewalk: what it sells.
    const place=standHere.place;
    phone.openList(placeName(place),menuFor(place).map(item=>({item,name:item.name.toUpperCase(),note:'$'+item.price.toFixed(2)})),({item})=>{if(sim.buy(item,{street:true}))saveProgress();});
    return;
  }
  if(name==='shop') {
    if(shopHere)phone?.openShop(shopHere);
    else if(work.pedestrian())work.street();
    return;
  }
  if(name==='phone') { if(started&&!paused&&!traveling&&bootReady&&!cityView&&!mapOpen)phone?.toggle();return; }
  if(name==='fight') {
    if(!started||paused||traveling||!bootReady||cityView||mapOpen||phone?.open||sim.player.mode!=='walk')return;
    if(!sim.fight())return;
    // An officer in reach takes the punch before a passer-by does.
    if(sim.police.strike(sim.player.x,sim.player.z,sim.player.angle))return;
    const hit=crowd?.strike(sim.player.x,sim.player.z,sim.player.angle);
    if(hit)sim.assault();
    else sim._say('You swing at the air.');
    return;
  }
  if(mapOpen)return;
  if(name==='perspective'){
    if(!started||paused||traveling||!bootReady||phone?.open)return;
    firstPerson=!firstPersonActive();
    if(cityView||aerialView)setView('street');
    else{
      const p=sim.player;
      headAnchor=p.mode==='walk'?(sim.room??null):undefined;
      if(firstPerson&&p.mode==='walk'){
        camera.getWorldDirection(cameraForward);
        yaw=Math.atan2(cameraForward.x,cameraForward.z);
      }else if(p.mode==='drive')yaw=p.angle;
      headTurn=0;headPitch=0;input.lookDelta=0;input.lookVertical=0;
      updatePerspectiveButton();
    }
    return;
  }
  if(name==='view') { setView(cityView?'street':aerialView?'city':'aerial');return; }
  if(name==='time') { if(gfx){const preset=gfx.nextPreset();updateTimeButton();announce('Time of day: '+preset.label.toLowerCase()+', '+gfx.clock+'.');}return; }
  if(!started||paused||traveling||!bootReady||cityView)return;
  if(name==='cash'){if(!phone?.open)hud.showCash(sim.cash);return;}
  if(name==='interact'){
    // On foot at a bus stop: on to the next bus. A ride is to any stop a route from here also calls at.
    if(sim.player.mode==='walk'&&!sim.room&&!stairHere&&stopHere&&!sim.getNearbyCar()){
      const from=stopHere.stop,rides=buses.ridesFrom(from).map(ride=>({ride,name:ride.stop.name,note:ride.lines.slice(0,3).join(' ')+' · '+formatDistance(ride.distance)+' · $'+FARE.toFixed(2)}));
      phone.openList(from.name+' · '+from.lines.slice(0,4).join(' '),rides,({ride})=>{
        // The driver waves a rider with no fare on more often than not; an inspector does not.
        const unpaid=sim.cash<FARE;if(unpaid)sim.heat=Math.min(5,sim.heat+.2);else sim.cash-=FARE;
        travel({x:ride.stop.x,z:ride.stop.z,name:ride.stop.name}).then(arrived=>arrived&&announce((unpaid?'You rode without paying. ':'')+'The '+ride.lines[0]+' to '+ride.stop.name+'.'));
      });
      return;
    }
    // On foot at the head of a subway stair: down to the trains. A ride is to any station on a line that stops here.
    if(sim.player.mode==='walk'&&!sim.room&&stairHere&&!sim.getNearbyCar()){
      const from=stairHere.station,rides=subway.ridesFrom(from).map(ride=>({ride,name:ride.station.name,note:ride.lines.join(' ')+' · '+formatDistance(ride.distance)+' · $'+FARE.toFixed(2)}));
      phone.openList(from.name+' · '+from.routes,rides,({ride})=>{
        // No fare, no problem, until someone sees.
        const jumped=sim.cash<FARE;if(jumped)sim.heat=Math.min(5,sim.heat+.4);else sim.cash-=FARE;
        const exit=subway.exitOf(ride.station);
        travel({x:exit.x+2.5,z:exit.z+2.5,name:ride.station.name,exact:true}).then(arrived=>arrived&&announce((jumped?'You jumped the turnstile. ':'')+'The '+ride.lines[0]+' to '+ride.station.name+'.'));
      });
      return;
    }
    // On foot at an open door, with no car to get into: go in.
    if(sim.player.mode==='walk'&&!sim.room&&doorHere&&!sim.getNearbyCar()&&goIn(doorHere))return;
    const changed=sim.interact();
    if(changed&&sim.player.mode==='drive'){
      // A walking camera can face the cab's nose. Start behind the newly
      // entered vehicle so its forward gear immediately reads as forward.
      yaw=sim.player.angle;pitch=.38;lookIdle=2;input.lookDelta=0;input.lookVertical=0;chaseLookAhead.set(0,0,0);
      if(!aerialView&&!firstPersonActive()){
        const distance=farCamera?14:9.3;
        camera.position.set(sim.player.x-Math.sin(yaw)*distance,sim.player.y+1.55+Math.sin(pitch)*distance,sim.player.z-Math.cos(yaw)*distance);
        camera.lookAt(sim.player.x,sim.player.y+1.1,sim.player.z);
      }
    }
  }
  if(name==='job')sim.startMission();
  if(name==='recover'){chaseHeight=null;chaseEyeOffset=null;headAnchor=undefined;sim.reset();yaw=sim.player.angle;aerialTracking=false;chaseLookAhead.set(0,0,0);announce('Recovered to a nearby street. Your next ride is waiting.');}
  if(name==='camera'){
    if(firstPersonActive()){
      firstPerson=false;updatePerspectiveButton();
      if(sim.player.mode==='drive')yaw=sim.player.angle;
    }
    farCamera=!farCamera;announce(farCamera?'Camera: wide chase':'Camera: close chase');
  }
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
  started=true;paused=false;$('intro').hidden=true;setView('city');
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
$('time-button').addEventListener('click',fromMenu(()=>action('time')));
$('help-button').addEventListener('click',()=>{if($('pause-dialog').open)togglePause(false);if(started){paused=true;input.clear();}$('help-dialog').showModal();});
$('help-dialog').addEventListener('close',()=>{if(started)paused=false;input.clear();});
function fromMenu(run){return()=>{if($('pause-dialog').open)togglePause(false);run();};}
$('view-button').addEventListener('click',fromMenu(()=>action('view')));
$('first-person-button').addEventListener('click',fromMenu(()=>action('perspective')));
$('open-map-button').addEventListener('click',fromMenu(()=>action('map')));
$('phone-button').addEventListener('click',fromMenu(()=>action('phone')));
$('city-button').addEventListener('click',fromMenu(()=>{if(!started&&bootReady){$('start-button').click();return;}setView(cityView?'street':'city');}));
$('road-pilot-mode-button').addEventListener('click',()=>{
  if(!roadPilot)return;
  roadPilot.setMode(roadPilot.getStatus().mode==='reconstructed'?'aerial':'reconstructed');
  updateRoadPilotControls();
});
canvas.addEventListener('wheel',event=>{
  if(cityView){event.preventDefault();cityZoom=clamp(cityZoom*Math.exp(event.deltaY*.001),.07,1.8);}
  else if(aerialView&&started&&!paused){event.preventDefault();zoomAerial(Math.exp(clamp(event.deltaY*(event.deltaMode===1?16:1),-500,500)*.0015));}
},{passive:false});
// Plus and minus do the same from the keyboard.
window.addEventListener('keydown',event=>{
  if(!aerialView||!started||paused||mapOpen||phone?.open||event.ctrlKey||event.metaKey||event.altKey||event.target?.closest?.('input,textarea,select'))return;
  if(event.key==='+'||event.key==='=')zoomAerial(.8);else if(event.key==='-'||event.key==='_')zoomAerial(1.25);
});
$('sources-button').addEventListener('click',()=>{input.clear();$('sources-dialog').showModal();});
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();togglePause(false);});
$('resume-button').addEventListener('click',()=>togglePause(false));
$('recover-button').addEventListener('click',()=>{togglePause(false);action('recover');});
$('show-cash-button').addEventListener('click',fromMenu(()=>action('cash')));
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
      work.restore(record.work);
      if(Number.isFinite(record.cash)&&record.cash>=0)sim.cash=Math.min(record.cash,1e8);
      if(Number.isInteger(record.deliveries)&&record.deliveries>=0)sim.deliveries=Math.min(record.deliveries,1e6);
      const cab=sim.cars.find(car=>car.id==='player-taxi');
      if(cab&&record.cab){
        if(record.cab.mods&&typeof record.cab.mods==='object')cab.mods=Object.fromEntries(['engine','brakes','tyres'].map(part=>[part,Math.max(0,Math.min(3,Math.floor(Number(record.cab.mods[part])||0)))]));
        if(/^#[0-9a-f]{6}$/.test(record.cab.color||'')){cab.color=record.cab.color;cab.type='sedan';cab.shape='sedan';cab.resprays=1;}
      }
    }
  } catch { /* Storage can be unavailable in private browsing; play still works. */ }
}
function saveProgress() {
  const cab=sim.cars.find(car=>car.id==='player-taxi');
  const value=JSON.stringify({version:1,cash:sim.cash,deliveries:sim.deliveries,work:work.record,cab:cab?{mods:cab.mods||null,color:cab.resprays?cab.color:null}:null});
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

function animatePerson(mesh,moving,time,speed=1) {
  const swing=moving?Math.sin(time*8*Math.max(.6,Math.min(speed,1.6)))*.4:0;
  const legs=mesh.userData.legs||[],arms=mesh.userData.arms||[];
  legs.forEach((leg,i)=>{if(leg?.rotation)leg.rotation.x=swing*(i%2?-1:1);});
  arms.forEach((arm,i)=>{if(arm?.rotation)arm.rotation.x=swing*(i%2?1:-1)*.7;});
}

function syncScene(dt,controls) {
  const p=sim.player, eyeView=firstPersonActive();
  if(driverCabin)driverCabin.group.visible=eyeView&&p.mode==='drive';
  // Kerbside cars are drawn together, and so is traffic more than a few car
  // lengths off. The player's car, a patrol, a car left standing in the road
  // and whatever traffic is close by each have a model of their own, with
  // wheels that turn and steer.
  const activeCars=new Set();distantCars.length=0;
  for(const car of sim.cars){
    if(car._kerb)continue;
    const away=Math.hypot(car.x-p.x,car.z-p.z);
    if(car.controlled||car.type==='police'||!car._edge||!distantTraffic||away<(carModels.has(car.id)?MODEL_KEPT:MODEL_RANGE))activeCars.add(car.id);
    else if(away<CAR_SIGHT)distantCars.push(car);
  }
  for(const [id,mesh] of carModels)if(!activeCars.has(id)){scene.remove(mesh);carModels.delete(id);}
  parkedCars?.update(sim.cars);
  distantTraffic?.update(distantCars);
  // Walking into the door of an open place goes in: no key needed. Having just come out, a moment passes first.
  if(doorHere&&!sim.room&&sim.player.mode==='walk'&&elapsed>doorAgain){
    const p=sim.player,f=doorHere,dx=p.x-f.x,dz=p.z-f.z,inward=-((p.velocityX||0)*f.nx+(p.velocityZ||0)*f.nz);
    if(dx*f.nx+dz*f.nz<1.25&&Math.abs(dx*f.tx+dz*f.tz)<Math.min(1.8,f.width/2)&&inward>.8&&goIn(f))doorHere=null;
  }
  // Once the modelled figures are in, the player and whoever is serving are drawn as two of them.
  const modelled=Boolean(crowd?.modelled),pace=Math.abs(p.speed);
  playerStride+=pace*Math.min(.1,Math.max(0,elapsed-strideClock))*3.3;strideClock=elapsed;
  if(modelled){
    // Diners sit out from late morning until the kitchens close.
    const extras=roomStaff.map(person=>person.userData.figure);
    for(const guest of roomGuests)extras.push(guest);
    if(gfx.hours>=11&&gfx.hours<23&&!sim.room)for(const diner of diners)extras.push(diner);
    // A newsstand is minded from before dawn; a fruit cart through the day.
    if(!sim.room)for(const vendor of vendors)if(vendor.fruit?gfx.hours>=7&&gfx.hours<20:gfx.hours>=5&&gfx.hours<23)extras.push(vendor);
    if(p.mode==='walk'&&!eyeView){
      const lunging=(p.swing||0)>0;
      extras.push({x:p.x+Math.sin(p.angle)*(lunging?0.45:0),y:p.y||0,z:p.z+Math.cos(p.angle)*(lunging?0.45:0),heading:p.angle,phase:lunging?1.2:playerStride,stride:lunging?0.2:Math.min(1,pace/1.2),look:PLAYER_LOOK});
    }
    // Officers out of their cars are drawn the same way, in uniform.
    for(const officer of sim.police.officers)extras.push({x:officer.x,y:officer.y||0,z:officer.z,heading:officer.angle,phase:officer.aiming?1.2:officer.phase,stride:officer.aiming?.2:officer.stride,look:OFFICER_LOOK});
    crowd.setExtras(extras);
  }
  // Until the modelled figures are in, officers are drawn as the plain figure the player is.
  for(const [id,mesh] of officerModels)if(modelled||!sim.police.officers.some(officer=>officer.id===id)){scene.remove(mesh);officerModels.delete(id);}
  if(!modelled)for(const officer of sim.police.officers){
    let mesh=officerModels.get(officer.id);
    if(!mesh){mesh=createPerson(0x1b2a4a);officerModels.set(officer.id,mesh);scene.add(mesh);}
    mesh.position.set(officer.x,officer.y||0,officer.z);mesh.rotation.y=officer.angle;animatePerson(mesh,officer.speed>.1,elapsed,officer.speed/3);
  }
  policeScene.update(sim.police,elapsed,started&&!cityView);
  for(const person of roomStaff)person.visible=!modelled;
  avatar.visible=p.mode==='walk'&&!modelled&&!eyeView;avatar.position.set(p.x,p.y||0,p.z);avatar.rotation.y=p.angle;
  animatePerson(avatar,Math.abs(p.speed)>.1,elapsed,Math.abs(p.speed)/3);
  for(const car of sim.cars){
    if(!activeCars.has(car.id))continue;
    let mesh=carModels.get(car.id);
    const model=vehicleMeshes.get(car.identity?.asset);
    if(!mesh||mesh.name!==car.type||mesh.userData.model!==model||mesh.userData.tint!==car.color||mesh.userData.given!==(car.shape??null)){
      if(mesh)scene.remove(mesh);
      mesh=createCar({type:car.type,color:car.color,seed:car.id,shape:car.shape,model});
      carModels.set(car.id,mesh);scene.add(mesh);
    }
    mesh.visible=Math.hypot(car.x-p.x,car.z-p.z)<CAR_SIGHT&&!(eyeView&&car.id===p.vehicleId);
    updateCarVisuals(mesh,car,dt);
    if(mesh.userData.update)mesh.userData.update(elapsed,car,sim.heat);
    // Scene factories may expose lamp meshes for a lightweight police flash.
    if(car.type==='police')for(const [i,light] of (mesh.userData.lights||[]).entries()){
      if(light.material)light.material.emissiveIntensity=sim.heat>.1?(Math.sin(elapsed*14+i*Math.PI)>0?3:.1):.15;
    }
  }
  if(sim.mission.phase==='active'&&sim.mission.target){
    marker.visible=true;marker.position.set(sim.mission.target.x,groundHeight(sim.mission.target.x,sim.mission.target.z),sim.mission.target.z);markerDiamond.rotation.y=elapsed*.7;markerDiamond.position.y=5+Math.sin(elapsed*2)*.3;
  }else marker.visible=false;
  const near=sim.getNearbyCar();enterHint.visible=p.mode==='walk'&&!!near&&started&&!eyeView;
  if(near)enterHint.position.set(near.x,(near.y||0)+3+Math.sin(elapsed*2)*.15,near.z);

}

function updateFirstPerson(look,vertical){
  const p=sim.player, driving=p.mode==='drive';
  const anchor=driving?p.vehicleId:(sim.room??null);
  if(headAnchor!==anchor){
    headAnchor=anchor;yaw=p.angle;headTurn=0;headPitch=0;
  }
  if(paused||traveling||phone?.open){look=0;vertical=0;}
  headPitch=clamp(headPitch+vertical,driving?-.9:-1.4,driving?1.05:1.4);
  if(driving){
    headTurn=clamp(headTurn+look,-1.95,1.95);
    yaw=p.angle+headTurn;
    driverCabin??=createDriverCabin(scene);
    driverCabin.placeCamera(camera,carModels.get(p.vehicleId),headTurn,headPitch);
  }else{
    yaw+=look;p.angle=yaw;
    const floor=sim.room&&roomGroup?roomGroup.userData.floorY:p.y;
    camera.position.set(p.x,(floor??0)+PLAYER_LOOK.height-.12,p.z);
    camera.rotation.set(-headPitch,Math.PI+yaw,0,'YXZ');
  }
  camera.near=.07;camera.fov=70;camera.updateProjectionMatrix();
  chaseHeight=null;chaseEyeOffset=null;snapChase=true;
}

function updateCamera(dt) {
  const p=sim.player,driving=p.mode==='drive';
  if(viewOverride){
    // A fixed camera for photographs and visual checks. Play continues.
    const v=viewOverride;chaseHeight=null;chaseEyeOffset=null;input.lookDelta=0;input.lookVertical=0;
    camera.position.set(...v.position);camera.near=v.near??.3;camera.far=v.far??9000;camera.fov=v.fov??55;
    camera.lookAt(...v.target);camera.updateProjectionMatrix();return;
  }
  // Between two places the shot has the camera: straight up, across, and down behind the player.
  const shotPose=switchShot.update(dt,switchShot.stage!=='cross'||!world.getStatus().loading);
  if(shotPose){
    chaseHeight=null;chaseEyeOffset=null;input.lookDelta=0;input.lookVertical=0;
    camera.up.set(...shotPose.up);camera.position.set(...shotPose.position);camera.near=shotPose.near;camera.far=shotPose.far;camera.fov=shotPose.fov;
    camera.lookAt(...shotPose.target);camera.updateProjectionMatrix();return;
  }
  // The shot has ended: the game's cameras all stand upright.
  camera.up.set(0,1,0);
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
    aerialZoom+=(aerialZoomGoal-aerialZoom)*(1-Math.exp(-dt*9));
    camera.position.copy(aerialTarget).addScaledVector(aerialOffset,aerialZoom);
    // At this altitude a street-level near plane wastes depth precision and
    // makes closely spaced ground surfaces flicker.
    camera.near=5;camera.lookAt(aerialTarget);camera.fov=52;camera.updateProjectionMatrix();return;
  }
  const look=input.lookDelta,vertical=input.lookVertical;input.lookDelta=0;input.lookVertical=0;
  if(firstPerson){updateFirstPerson(look,vertical);return;}
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
  if(snapChase){camera.position.copy(desiredCamera);snapChase=false;}
  else camera.position.lerp(desiredCamera,1-Math.exp(-dt*(safeDistance<3?22:driving?13:8)));
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
  if(sim.room){
    // Indoors the camera stays in the room, close behind the player.
    const room=sim.room,back=2.3,cx=p.x-Math.sin(yaw)*back,cz=p.z-Math.cos(yaw)*back;
    const a=Math.max(-room.width/2+.3,Math.min(room.width/2-.3,(cx-room.x)*room.tx+(cz-room.z)*room.tz)),b=Math.max(.3,Math.min(room.depth-.3,-((cx-room.x)*room.nx+(cz-room.z)*room.nz)));
    camera.position.set(room.x+room.tx*a-room.nx*b,chaseHeight.height+1.9,room.z+room.tz*a-room.nz*b);camera.near=.08;
  }
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
    // Nobody steers a player they cannot see: they stand where they were put until the shot comes down.
    if(switchShot.active)controls={forward:0,turn:0,brake:false,run:false,moveX:0,moveZ:0};
    if(switchShot.active!==switchShotLive){switchShotLive=switchShot.active;for(const id of ['hud','mission-panel','wanted','touch-controls'])$(id).classList.toggle('switch-shot',switchShotLive);}
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
    sim.melee=Boolean(!cityView&&sim.player.mode==='walk'&&crowd?.closest(sim.player.x,sim.player.z));
    sim.threats=crowd?.threats||[];
    hud.city=sim.city;hud.update(sim);updateDirections();saveProgress();updateLocation();updateTimeButton();hudTime=0;
  }
  water.update(lit,{overview:cityView&&!viewOverride});
  // Lamps and headlights are gathered before the frame that they light.
  streetLife.update(lit,{lights:gfx.state.lightsOn,cars:sim.cars,overview:overview&&!viewOverride});
  // Signals show what the simulation's traffic is obeying, on the same clock.
  signs.group.visible=!cityView||Boolean(viewOverride);
  if(signs.group.visible)signs.update(sim.junctions,lit,sim.elapsed);
  // How much traffic, and whose cabs, follows the hour and the neighbourhood.
  // It joins the streets where the camera is not looking.
  lifeTimer-=dt;
  if(lifeTimer<=0){lifeTimer=2;sim.setTraffic(cityLife.traffic(sim.player.x,sim.player.z,gfx.hours));}
  camera.getWorldDirection(trafficAhead);sim.setLookout(trafficAhead.x,trafficAhead.z);
  // People on the sidewalks: as many as the place and the hour call for.
  crowd.mesh.visible=started&&(!cityView||Boolean(viewOverride));
  if(crowd.mesh.visible){
    const ahead=camera.getWorldDirection(crowdAhead),flat=Math.hypot(ahead.x,ahead.z)||1;
    crowd.update(paused||mapOpen?0:dt,{walks:streetscape?.walks()||noStreetFurniture,focus:lit,forward:[ahead.x/flat,ahead.z/flat],hours:gfx.hours,time:sim.elapsed,junctions:sim.junctions,cars:sim.cars,player:sim.player});
    if(crowd.damage)sim.hurt(crowd.damage);
    sim.setWalkers(crowd.crossing);
  }
  // Shop fronts take the names of the places the registers put behind them.
  // Whose front is whose is worked out again when the places, the buildings
  // or the streets around change, or the player has gone thirty metres.
  placeTimer-=dt;
  if(placeSource&&placeTimer<=0){
    placeTimer=.4;placeSource.request(lit.x,lit.z,700);
    markDoors();
    const walks=streetscape?.walks()||noStreetFurniture;
    if(!frontsFor||frontsFor.places!==placeSource.version||frontsFor.footprints!==footprints||frontsFor.walks!==walks||Math.hypot(lit.x-frontsFor.x,lit.z-frontsFor.z)>30){
      frontsFor={places:placeSource.version,footprints,walks,x:lit.x,z:lit.z};
      fronts=solveFrontages(placeSource.near(lit.x,lit.z,250),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z)));
      // Sheds stand along the street walls of the buildings permitted one.
      if(sheds&&shedMesh)shedMesh.update(planSheds(sheds.near(lit.x,lit.z,220),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z))));
      if(standMesh){
        if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
        const stands=planStands(placeSource.near(lit.x,lit.z,220),(x,z)=>snapToKerb(kerbIndex,x,z,16));
        standMesh.update(stands);
        vendors=stands.map(stand=>{
          const spot=vendorOf(stand),random=seeded((Math.round(stand.x*13+stand.z*29)>>>0)||1),look=dress('casual',random,demographics.tracts?demographics.tonesAt(stand.x,stand.z,.3):null);
          look.kit=(look.kit&(KIT.longHair|KIT.shortSleeves))|(random()<.35?KIT.woman:0);
          return {x:spot.x,y:groundHeight(spot.x,spot.z),z:spot.z,heading:spot.heading,phase:0,stride:0,look,fruit:stand.kind==='fruitstand',stand};
        });
      }
      if(bikeShare&&bikeDocks){
        if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
        bikeDocks.update(planBikeDocks(bikeShare.near(lit.x,lit.z,200),(x,z)=>snapToKerb(kerbIndex,x,z,14)));
      }
      if(dining&&diningMesh){
        const rows=planDining(dining.near(lit.x,lit.z,200),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z)));
        diningMesh.update(rows);
        // Who is at the tables: the same people at the same chairs each time, with the faces of the neighbourhood. About half the chairs are taken.
        diners=[];
        for(const row of rows)for(const seat of seatsOf(row)){
          const random=seeded((Math.round(seat.x*31+seat.z*17)>>>0)||1);
          if(random()>.55)continue;
          const look=dress('casual',random,demographics.tracts?demographics.tonesAt(seat.x,seat.z,.5):null);
          look.kit=(look.kit&(KIT.longHair|KIT.shortSleeves))|(random()<.5?KIT.woman:0);look.height=1.72;
          diners.push({x:seat.x,y:groundHeight(seat.x,seat.z)+.02,z:seat.z,heading:seat.heading,sitting:true,look});
        }
      }
      // A sign also says what the place is in a language a quarter or more of its neighbours speak at home.
      if(demographics.tracts)for(const front of fronts){const [language,share]=demographics.languagesAt(front.x,front.z).find(([name])=>name!=='english')||[];front.language=share>=.25?language:null;}
      // A delivery can be sent to any place with a name over its door: the drop is on the sidewalk in front.
      placeDestinations=fronts.filter(front=>front.place.name).map(front=>({name:front.place.name,x:front.x+front.nx*3.2,z:front.z+front.nz*3.2}));
      sim.setActiveCity({missionPoints:[...roadDestinations,...placeDestinations]});city=sim.city;
    }
    // Standing at a shop front, the player is told what it is.
    let facing=null;
    // On foot that is any front within a few steps; in a car, an auto shop it has stopped outside.
    const driving=sim.player.mode==='drive',reach=driving?14:7;
    if(started&&!cityView&&!mapOpen)for(const front of fronts){
      if(driving&&!offersAt(front.place.kind))continue;
      const dx=sim.player.x-front.x,dz=sim.player.z-front.z,out=dx*front.nx+dz*front.nz;
      if(out>-1&&out<reach&&Math.abs(dx*front.tx+dz*front.tz)<front.width/2+(driving?5:1)&&(!facing||out<facing.out))facing={front,out};
    }
    // The head of a subway stair within a few steps.
    stairHere=null;
    if(started&&!cityView&&!mapOpen&&!driving&&!sim.room&&subwayStairs)for(const entrance of subwayStairs.entrances){if(Math.hypot(entrance.x-sim.player.x,entrance.z-sim.player.z)<4.5){stairHere=entrance;break;}}
    // A bus stop within a couple of steps.
    stopHere=null;
    if(started&&!cityView&&!mapOpen&&!driving&&!sim.room&&!stairHere&&busStops)for(const stop of busStops.stops){if(Math.hypot(stop.x-sim.player.x,stop.z-sim.player.z)<3){stopHere=stop;break;}}
    // A stand that someone is minding, within a couple of steps of its counter.
    standHere=null;
    if(started&&!cityView&&!mapOpen&&!driving&&!sim.room&&!stairHere&&!stopHere)for(const vendor of vendors){
      const open=vendor.fruit?gfx.hours>=7&&gfx.hours<20:gfx.hours>=5&&gfx.hours<23;
      if(open&&Math.hypot(vendor.stand.x-sim.player.x,vendor.stand.z-sim.player.z)<3.2){standHere=vendor.stand;break;}
    }
    if(stairHere||stopHere||standHere)facing=null;
    $('place-hint').hidden=(!facing&&!stairHere&&!stopHere&&!standHere)||Boolean(sim.room);
    if(standHere)$('place-hint').textContent=placeName(standHere.place)+' · G TO BUY';
    if(stopHere)$('place-hint').textContent=stopHere.stop.name+' · '+stopHere.stop.lines.slice(0,5).join(' ')+' · E FOR THE BUS';
    if(stairHere)$('place-hint').textContent=stairHere.station.name.toUpperCase()+' · '+stairHere.station.routes+' · E FOR THE SUBWAY';
    if(started&&!cityView&&!mapOpen&&!phone?.open&&!facing&&!stopHere&&!stairHere&&!standHere&&work.pedestrian()){
      $('place-hint').hidden=false;$('place-hint').textContent='G TO TALK';
    }
    shopHere=null;doorHere=null;
    if(!sim.room&&roomGroup){roomGroup.userData.dispose();roomGroup=null;roomStaff=[];roomGuests=[];doorAgain=elapsed+1.2;}
    // Indoors, within reach of whoever is serving.
    counterHere=Boolean(sim.room)&&sim.room.staff.some(spot=>Math.hypot(spot.a-sim.room.a,spot.b-sim.room.b)<2.6);
    if(sim.room){$('place-hint').hidden=!counterHere||!menuFor(sim.room.place).length;$('place-hint').textContent=sim.room.name+' · G TO ORDER';}
    if(facing){
      const about=describePlace(facing.front.place,gfx.hours),open=about.status==='OPEN';
      if(driving&&open&&Math.abs(sim.player.speed)<1)shopHere=facing.front.place;
      if(!driving&&open&&facing.out<3.5&&roomKind(facing.front.place))doorHere=facing.front;
      $('place-hint').textContent=[about.name,about.kind===about.name?'':about.kind,about.grade,about.status,driving&&open?(shopHere?'G FOR THE COUNTER':'STOP HERE FOR THE SHOP'):doorHere?'WALK IN':''].filter(Boolean).join(' · ');
    }
  }
  gfx.indoors=Boolean(sim.room);
  // Subway stairs stand where the MTA lists them, running along the kerb beside them.
  if(subway&&subwayStairs){
    const walks=streetscape?.walks()||noStreetFurniture;
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    subwayStairs.group.visible=!cityView||Boolean(viewOverride);
    subwayStairs.update(subway,lit);
  }
  if(buses&&busStops){
    const walks=streetscape?.walks()||noStreetFurniture;
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    busStops.group.visible=!cityView||Boolean(viewOverride);if(shedMesh)shedMesh.mesh.visible=busStops.group.visible;if(diningMesh)diningMesh.mesh.visible=busStops.group.visible;if(standMesh)standMesh.mesh.visible=busStops.group.visible;if(bikeDocks)bikeDocks.group.visible=busStops.group.visible;
    busStops.update(buses,lit,kerbIndex);
  }
  storefronts?.update(fronts,lit,gfx.hours);
  phone?.update(elapsed);
  // A red-light camera's flash: the frame blows out for a tenth of a second.
  const flashed=sim.cameraFlash&&sim.elapsed-sim.cameraFlash.at<.11;
  if(flashed!==cameraFlashing){cameraFlashing=flashed;$('world').style.filter=flashed?'brightness(2.2)':'';}
  props.group.visible=crowd.mesh.visible;
  if(props.group.visible)props.update(streetscape?.walks()||noStreetFurniture,lit,signs.poles);
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
  headAnchor=undefined;input.lookDelta=0;input.lookVertical=0;
  updatePerspectiveButton();
  $('view-button').textContent=cityView?'STREET CAMERA':aerialView?'CITY OVERVIEW':'AERIAL VIEW';
  $('city-button').textContent=cityView?'RETURN TO STREET':'ALL FIVE BOROUGHS';
  $('show-cash-button').disabled=cityView;
  $('city-navigation').hidden=!cityView;
  navigation?.setVisible(cityView);
  if(started)for(const id of ['hud','mission-panel','wanted'])$(id).hidden=cityView;
  $('touch-controls').hidden=cityView||!started||!matchMedia('(pointer:coarse)').matches;
  updateStreaming(world.getStatus());
}
// Chain logos, where they have been fetched to this machine (scripts/build-logos.mjs); they are not part of the game.
// Each is given the plain ground it reads on: its own, if it has no clear parts; white, or near-black for a pale logo.
async function loadLogos(){
  const logos=new Map(),response=await fetch('./logos/index.json').catch(()=>null);
  if(!response?.ok)return logos;
  const index=await response.json(),scratch=document.createElement('canvas'),context=scratch.getContext('2d',{willReadFrequently:true});
  await Promise.all(Object.entries(index.logos||{}).map(([key,entry])=>new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const w=scratch.width=64,h=scratch.height=Math.max(1,Math.round(64*image.height/image.width));
        context.clearRect(0,0,w,h);context.drawImage(image,0,0,w,h);
        const pixels=context.getImageData(0,0,w,h).data;let light=0,solid=0,clear=0;
        for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<40){clear++;continue;}solid++;light+=(pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)/255;}
        const hex=i=>'#'+[0,1,2].map(k=>pixels[i+k].toString(16).padStart(2,'0')).join('');
        logos.set(key,{image,width:image.width,height:image.height,background:clear<pixels.length/4*.02?hex(0):light/Math.max(1,solid)>.72?'#17191b':'#ffffff'});
      }catch{}
      resolve();
    };
    image.onerror=resolve;image.src='./logos/'+entry.file;
  })));
  return logos;
}
// Mark the doors that can be walked through on the radar and the map (map-blips.js): the fronts with a room behind
// them and the subway's stairs. The open map looks further than the street does, so for it fronts are worked out as
// far as places are loaded. Past 300 m fewer of the streets are known, and fewer doors are found than are there.
function markDoors(){
  if(!gameMap||!placeSource)return;
  const stairs=subwayStairs?.entrances;
  if(!doorsFor||doorsFor.fronts!==fronts||doorsFor.stairs!==stairs||doorsFor.wide!==mapOpen){
    doorsFor={fronts,stairs,wide:mapOpen};
    const inside=(x,z)=>Boolean(footprints.at(x,z)),at=frontsFor||sim.player;
    const beyond=mapOpen?solveFrontages(placeSource.near(at.x,at.z,700).filter(place=>Math.hypot(place.x-at.x,place.z-at.z)>250),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z))):[];
    doors=doorBlips([...fronts,...beyond].filter(front=>hasRoom(front,inside)),mapOpen&&subway?subway.entrancesNear(at.x,at.z,700).filter(entrance=>entrance.kind===0):stairs);
  }
  gameMap.setDoors(doors,gfx.hours);
}
// Through the door of a place and into its room. Returns whether there was a room to go into.
function goIn(front){
    const room=planRoom(front,(x,z)=>Boolean(footprints.at(x,z)));
    if(room&&sim.enterRoom(room)){
      // The floor is laid just above the highest ground under the room, so no ground shows through it.
      let floor=groundHeight(room.x+room.nx*1.5,room.z+room.nz*1.5);
      for(const along of [-.5,0,.5])for(const deep of [0,.5,1]){const h=groundHeight(room.x+room.tx*room.width*along-room.nx*room.depth*deep,room.z+room.tz*room.width*along-room.nz*room.depth*deep);if(Number.isFinite(h)&&h>floor&&h<floor+1.2)floor=h;}
      floor+=.06;
      roomGroup=buildRoom(room,floor);roomGroup.userData.floorY=floor;scene.add(roomGroup);
      roomStaff=room.staff.map((spot,i)=>{const person=createPerson([0x2f4a5a,0x7a2f2f,0x3f5a3a,0x4a3a5a][i%4]);const x=room.x+room.tx*spot.a-room.nx*spot.b,z=room.z+room.tz*spot.a-room.nz*spot.b;person.position.set(x,floor,z);person.rotation.y=Math.atan2(room.tx*spot.da-room.nx*spot.db,room.tz*spot.da-room.nz*spot.db);roomGroup.add(person);
        // The same person each visit: drawn from the place's own number, with the faces of the neighbourhood.
        const random=seeded((Math.round(room.x*7+room.z*13)^(i*7919))>>>0||1),look=dress('casual',random,demographics.tracts?demographics.tonesAt(x,z,.2):null);
        look.kit=(look.kit&(KIT.longHair|KIT.shortSleeves))|(random()<.5?KIT.woman:0);
        person.userData.figure={x,y:floor,z,heading:person.rotation.y,phase:0,stride:0,look};return person;});
      // Customers: about four seats in ten are taken, by the same people each visit.
      roomGuests=[];
      room.seats.forEach((spot,i)=>{
        const random=seeded((Math.round(room.x*11+room.z*5)^(i*104729))>>>0||1);
        if(random()>.42)return;
        const x=room.x+room.tx*spot.a-room.nx*spot.b,z=room.z+room.tz*spot.a-room.nz*spot.b,look=dress('casual',random,demographics.tracts?demographics.tonesAt(x,z,.5):null);
        look.kit=(look.kit&(KIT.longHair|KIT.shortSleeves))|(random()<.5?KIT.woman:0);look.height=1.72;
        roomGuests.push({x,y:floor+spot.lift,z,heading:Math.atan2(room.tx*spot.da-room.nx*spot.db,room.tz*spot.da-room.nz*spot.db),sitting:true,look});
      });
      yaw=sim.player.angle;return true;
    }
  return false;
}
// Corners and businesses, found in the game's own data. The street index is made from the route planner's roads the
// first time something is searched for, and the list of place names is fetched then too.
let streetIndex=null, placeIndex=null, placeIndexReady=null;
// The citywide list of place names is fetched once, the first time a search or the map's layers ask for it.
function loadPlaceNames(){
  const read=file=>fetch('./'+file,{signal:AbortSignal.timeout(30000)}).then(response=>response.ok?response.json():null);
  placeIndexReady||=Promise.all([read('place-names.json'),read('landmarks.json').catch(()=>null)]).then(([data,named])=>{
    // The city's individual landmarks are searched and mapped by name with everything else.
    if(data&&named){const kind=data.kinds.length;data.kinds.push('Landmark');for(const [name,x,z] of named.landmarks)data.places.push([name,x,z,kind,0]);}
    placeIndex=createPlaceIndex(data);gameMap?.setPlaces(createPlaceLayer(data));
  }).catch(()=>{placeIndexReady=null;});
  return placeIndexReady;
}
async function findLocally(query){
  const planner=await plannerReady;
  if(planner&&!streetIndex)streetIndex=createStreetIndex(planner.roads);
  await loadPlaceNames();
  const found=searchLocal(query,{streets:streetIndex,places:placeIndex,near:sim?{x:sim.player.x,z:sim.player.z}:null});
  // Several branches of one name are told apart by the street each is on.
  for(const place of found)if(place.kind==='place'&&planner){const road=planner.snap({x:place.x,z:place.z},{maxSnapDistance:300});if(road)place.detail=title(road.name);}
  return found;
}
function focusCityDestination(place){
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
  $('stream-status').textContent=status.error?'SOME CITY DETAIL UNAVAILABLE · RETRYING':'LOADING NYC · '+status.visibleChunks+' AREAS VISIBLE';
  $('stream-status').hidden=!started||(!status.error&&!status.loading);
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
  buildings=next;footprints=indexFootprints(next);
  if(sim){sim.setActiveCity({buildings});city=sim.city;}
}
async function refreshRoads(){
  const key=Math.floor(sim.player.x/400)+','+Math.floor(sim.player.z/400);
  if(key===roadCell||roadBusy)return;
  roadCell=key;roadBusy=true;const epoch=roadEpoch;
  try{
    const roads=await roadStream.loadAround(sim.player);
    if(epoch!==roadEpoch)return;
    sim.setActiveCity({roads,missionPoints:destinationsFor(roads,sim.player)});city=sim.city;
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
    const json=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('The road pilot could not load. Choose Spawn here to retry.');return response.json();};
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
  traveling=true;roadEpoch++;input.clear();
  // Leave by the sky. From indoors, or from a map, there is no street on screen to rise from: hold the picture instead.
  camera.getWorldDirection(cameraForward);
  switchShot.depart(started&&!cityView&&!aerialView&&!mapOpen&&!sim.room?{x:sim.player.x,y:sim.player.y||0,z:sim.player.z,angle:sim.player.angle}:null,
    {position:camera.position.toArray(),target:camera.position.clone().addScaledVector(cameraForward,30).toArray(),up:[0,1,0],fov:camera.fov,near:camera.near,far:camera.far});
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
    placeDestinations=[];
    sim.setActiveCity({roads,buildings,missionPoints:destinationsFor(roads,target)},{spawn:{...target,name:place.name,exact:Boolean(place.exact)}});
    if(sim.mission.phase==='active'){sim.mission.phase='failed';announce('Travel canceled the active delivery. Your earnings are saved.');}
    city=sim.city;yaw=sim.player.angle;roadCell='';chaseHeight=null;chaseEyeOffset=null;
    camera.position.set(sim.player.x-Math.sin(yaw)*12,(sim.player.y||0)+9,sim.player.z-Math.cos(yaw)*12);
    if(!started)$('start-button').click();
    setView('street');$('travel-note').textContent='';
    switchShot.arrive({x:sim.player.x,y:sim.player.y||0,z:sim.player.z,angle:sim.player.angle});
    clearDirections();gameMap?.setStatus('Spawned at the selected location.');return true;
  }catch(error){
    // The stream can publish additional colliders while a destination loads.
    // Restore navigation data without replacing that newer collision snapshot.
    switchShot.cancel();
    sim.setActiveCity({...previous,buildings});$('travel-note').textContent=error.message;announce(error.message);
    if(mapOpen)gameMap.setStatus(error.message);return false;
  }
  finally{traveling=false;navigation?.setTraveling(false);}
}

function clearDirections(){
  routeEpoch++;activeRoute=null;routeDestination=null;routeGuidance=null;gameMap?.setRoute(null);
}
async function requestDirections(pin){
  clearDirections();
  if(!pin)return false;
  const epoch=routeEpoch;gameMap.setStatus('Finding a route along mapped streets…');
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
  // What stands where, for dressing buildings decoded on the page itself; the background decoders fetch their own.
  await lotsReady();
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
  parkedCars=createParkedCars({capacity:PARKED_LIMIT+8,library:vehicleMeshes});scene.add(parkedCars.group);
  distantTraffic=createDistantTraffic({library:vehicleMeshes});scene.add(distantTraffic.group);
  sim=new Simulation(city);
  work=new Work({sim,phone:()=>phone,fronts:()=>fronts,hours:()=>gfx.hours,save:saveProgress,
    guide:site=>{gameMap.setOpen(true);gameMap.showCity();gameMap.setPin(site);},
    pedestrian:()=>sim.player.mode==='walk'&&!sim.room?crowd?.closest(sim.player.x,sim.player.z,4):null,
    counter:()=>sim.room&&counterHere&&sim.room.place.id&&menuFor(sim.room.place).length?sim.room.place:null});
  restoreProgress();yaw=sim.player.angle;
  signs=createStreetSigns({scene,heightAt:groundHeight,raised:(x,z)=>(streetscape?.offsetAt(x,z)||0)>.1});
  crowd=createCrowd({scene,heightAt:groundHeight,isRoad:(x,z)=>streetscape?.surfaceAt(x,z)==='road',
    life:{crowding:(x,z,hours)=>cityLife.crowding(x,z,hours),wardrobe:(x,z,hours)=>cityLife.wardrobe(x,z,hours),
      // Offices, shops and sights fill a street with people from all over the city; at home, and at night, it is the neighbours.
      tones:(x,z,hours)=>{if(!demographics.tracts)return null;const c=characterAt(x,z),day=hours>7&&hours<20?1:.35;return demographics.tonesAt(x,z,Math.min(.85,Math.max(c.business,c.visited,c.shopping*.7)*day));}}});
  // The city's own lists: sidewalk counts, and the signals that favour people
  // on foot. Without them the model answers alone and nothing is lost but detail.
  const signalHints=(x,z)=>({...cityLife.hintsAt(x,z),core:manhattanCore(x,z)});
  sim.setActiveCity({signalHints});
  props=createStreetProps({scene,heightAt:groundHeight});
  storefronts=createStorefronts();
  loadLogos().then(logos=>{if(logos.size)storefronts.setLogos(logos);}).catch(()=>{});
  // The registers' places, and the shops they do not list (OpenStreetMap), read as one.
  const registerPlaces=createPlaceSource({load:url=>loadData(url.replace(/^\.\//,''))}),otherShops=createPlaceSource({load:url=>loadData(url.replace(/^\.\//,'')),prefix:'o'});
  placeSource=joinPlaceSources(registerPlaces,otherShops);
  loadData('places-index.json').then(index=>registerPlaces.setIndex(index)).catch(()=>{});
  loadData('shops-index.json').then(index=>otherShops.setIndex(index)).catch(()=>{});
  subwayStairs=createSubwayEntrances({scene,heightAt:groundHeight,facing:(x,z)=>{const kerb=kerbIndex&&snapToKerb(kerbIndex,x,z,12);return kerb?[kerb.tx,kerb.tz]:null;}});
  loadData('demographics.json').then(data=>{demographics=createDemographics(data);}).catch(()=>{});
  busStops=createBusStops({scene,heightAt:groundHeight,kerb:(x,z)=>kerbIndex&&snapToKerb(kerbIndex,x,z,14)});
  shedMesh=createShedMesh({scene,heightAt:groundHeight});
  diningMesh=createDiningMesh({scene,heightAt:groundHeight});standMesh=createStandMesh({scene,heightAt:groundHeight});
  loadData('dining.json').then(data=>{dining=createDining(data);frontsFor=null;}).catch(()=>{});
  bikeDocks=createBikeDocks({scene,heightAt:groundHeight});
  loadData('bikes.json').then(data=>{bikeShare=createBikeShare(data);frontsFor=null;}).catch(()=>{});
  loadData('sheds.json').then(data=>{sheds=createSheds(data);frontsFor=null;}).catch(()=>{});
  loadData('bus-stops.json').then(data=>{buses=createBuses(data);}).catch(()=>{});
  loadData('transit.json').then(data=>{subway=createSubway(data);}).catch(()=>{});
  sim.setFleet(fleet);
  Promise.all(['fleet.json','vehicle-catalog.json','assets/vehicles/index.json','working-vehicles.json','vehicle-performance.json'].map(file=>loadData(file).catch(()=>null)))
    .then(([base,catalog,art,working,performance])=>{fleet=createFleet(base,catalog,art?.models,designFor,working,performance);sim.setFleet(fleet);});
  // The modelled figures replace the blocked-out ones once they have loaded.
  Promise.all([loadData('people.json'),fetch('./people.bin').then(response=>{if(!response.ok)throw new Error('people');return response.arrayBuffer();})]).then(([meta,buffer])=>crowd.setFigures(meta,new Int16Array(buffer))).catch(()=>{});
  phone=createPhone({$,places:()=>placeSource.near(sim.player.x,sim.player.z,700),
    state:()=>({x:sim.player.x,z:sim.player.z,hours:gfx.hours,clock:gfx.clock,cash:sim.cash,jobActive:sim.mission.phase==='active',fares:sim.deliveries,miles:sim.distanceTravelled/1609.344,redLights:sim.redLights||0,car:sim.vehicle?{health:sim.health,mods:sim.vehicle.mods,color:sim.vehicle.color}:null}),
    onGarage:(kind,job,choice)=>{if(sim.garage(kind,job,choice))saveProgress();},onMechanic:()=>sim.callMechanic(),onCab:()=>sim.summonCab(),
    onDirections:place=>{const name=place.name||describePlace(place,gfx.hours).name;requestDirections({x:place.x,z:place.z}).then(found=>announce(found?'Directions to '+name+'. Follow the highlighted streets.':'No way to '+name+' along mapped streets.'));},
    onWork:()=>work.board(),onJob:()=>action('job'),onMap:()=>action('map'),
    onOpenChange:open=>{input.clear();$('phone-button').setAttribute('aria-expanded',String(open));$('mission-panel').classList.toggle('behind-phone',open);if(!open)canvas.focus();}});
  loadData('street-life.json').then(data=>{cityLife=createCityLife(data);props.setData(data);sim.setActiveCity({signalHints});}).catch(()=>{});
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
    navigation?.refreshPresets();
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
    navigation?.refreshPresets();
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
    roadPilotIndex=index;navigation?.refreshPresets();
  }).catch(()=>{$('road-pilot-status').textContent='Road pilot unavailable. Reload to try again.';});
  loadData('road-reconstruction-review.json').then(report=>{
    roadReconstructionReview=report;
    $('road-reconstruction-status').textContent=report.summary.accepted+' of '+report.summary.candidates+
      ' road and parking masks passed source checks. Rejected masks create no game geometry.';
  }).catch(()=>{$('road-reconstruction-status').textContent='Road image review unavailable. Surveyed surfaces remain active.';});
  avatar=createPerson(0xd7774e,{courier:true});scene.add(avatar);marker=createMissionMarker();enterHint=createEnterHint();policeScene=createPoliceScene(scene,(x,z)=>groundHeight(x,z));
  hud=new HUD(city);applyQuality();
  gameMap=new GameMap({city,searchLocal:findLocally,onPlacesWanted:loadPlaceNames,onPin:requestDirections,
    onSpawn:pin=>travel({...pin,exact:true}),
    onOpenChange:open=>{mapOpen=open;input.clear();input.lookDelta=0;input.lookVertical=0;if(!open)canvas.focus();markDoors();}});
  hud.attachMap(gameMap);
  // The compact citywide graph is optional: a failed route download must not
  // prevent entering the game or using a measured, validated spawn point.
  plannerReady=loadData('navigation-roads.json').then(data=>{
    routePlanner=createRoutePlanner(data);gameMap.setRoads(routePlanner.roads);return routePlanner;
  }).catch(()=>null);
  const b=city.bounds;camera.position.set((b.minX+b.maxX)/2-14000,44000,(b.minZ+b.maxZ)/2+32000);
  navigation=createCityNavigation({canvas,camera,input,bounds:city.bounds,heightAt:terrainHeight,onTravel:travel,onDestinationSelected:focusCityDestination,getPresets:cityPresets,searchLocal:findLocally});
  window.nycGame={graphics:gfx,get streetscape(){return streetscape;},get streetLife(){return streetLife;},get parkedCars(){return parkedCars;},get distantTraffic(){return distantTraffic;},get world(){return world;},get simulation(){return sim;},get signs(){return signs;},get crowd(){return crowd;},get props(){return props;},get places(){return placeSource;},get storefronts(){return storefronts;},get fronts(){return fronts;},get phone(){return phone;},get fleet(){return fleet;},get subway(){return subway;},get buses(){return buses;},get sheds(){return sheds;},get dining(){return dining;},get standMesh(){return standMesh;},get map(){return gameMap;},findLocally,get bikeShare(){return bikeShare;},get bikeDocks(){return bikeDocks;},get diningMesh(){return diningMesh;},get shedMesh(){return shedMesh;},get busStops(){return busStops;},get demographics(){return demographics;},get subwayStairs(){return subwayStairs;},get cityLife(){return cityLife;},heightAt:(x,z)=>terrainHeight(x,z),setView:view=>{viewOverride=view&&Array.isArray(view.position)&&Array.isArray(view.target)?view:null;},getState:()=>({time:gfx.clock,switching:switchShot.active,player:{...sim.player},heat:sim.heat,health:sim.health,mission:{...sim.mission},cash:sim.cash,deliveries:sim.deliveries,cars:sim.cars.length,parkedCars:sim.cars.filter(car=>car._kerb).length,buildings:buildings.length,totalBuildings:cityIndex.stats.buildingFeatures,stream:world.getStatus(),ground:ground.getStatus(),streetDetail:streetDetail?.getStatus()||null,streetscape:streetscape?.getStatus()||null,landscape:landscape?.getStatus()||null,reconstruction:reconstructionReview?{model:reconstructionReview.model,summary:reconstructionReview.summary}:null,roadReconstruction:roadReconstructionReview?{model:roadReconstructionReview.model,summary:roadReconstructionReview.summary}:null,roadPilot:roadPilot?roadPilot.getStatus():{ready:false,loading:Boolean(roadPilotLoading),error:roadPilotError},navigation:navigation.getState(),map:gameMap.getState(),routeGuidance,cityView,aerialView,firstPersonView:firstPersonActive(),traveling,bootReady,shadows:{enabled:shadowsEnabled,active:renderer.shadowMap.enabled},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,started,paused})};
  requestAnimationFrame(frame);
  const [roads]=await Promise.all([roadStream.loadAround(seed.spawn),world.prepareAt(seed.spawn,300),landscapeReady]);
  sim.setActiveCity({roads,buildings,isReadyAt:(x,z,radius)=>world.isReadyAt(x,z,radius),missionPoints:destinationsFor(roads,seed.spawn)},{spawn:seed.spawn});city=sim.city;yaw=sim.player.angle;
  bootReady=true;
  $('start-button').disabled=false;$('load-text').textContent='Explore New York';
}
restoreDisplaySettings();
boot().catch(error=>{
  console.error(error);$('load-text').textContent='Unable to start';$('load-error').hidden=false;
  $('load-error').textContent=error.message.includes('WebGL')?'This game needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.':error.message;
});
