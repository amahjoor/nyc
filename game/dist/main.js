import { renderStats, performanceName } from './vehicle-stats.js';
import { createDoorDebris } from './vehicle-detail.js';
import { updateChaseHeight } from './vehicle-presentation.js';
import { createDriverCabin } from './driver-cabin.js';
import { createSwitchShot } from './switch-shot.js';
import * as THREE from './vendor/three.module.min.js';
import { createCar, createParkedCars, createDistantTraffic, createPerson, updateCarVisuals, setVehicleLamps } from './world.js';
import { Simulation, TRAFFIC_SIGHT } from './simulation.js';
import { OFFICER_LOOK } from './police.js';
import { createPoliceScene } from './police-scene.js';
import { shared } from './gfx-common.js';
import { createCarSmoke } from './car-smoke.js';
import { GUN } from './player-moves.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { CityAudio } from './audio.js';
import { lots, lotsReady, createCityStream } from './city-stream.js';
import { createCityGround, worldToGeographic } from './city-ground.js';
import { createStreetDetail } from './street-detail.js';
import { Landscape } from './landscape.js';
import { createCentralPark } from './central-park.js';
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
import { createWater, WATER_LEVEL } from './water.js';
import { BOARDINGS, TRANSPORT, transportDestination } from './transport-catalog.js';
import { TransportFleet } from './transport.js';
import { createTransportScene } from './transport-models.js';
import { createCityLife, manhattanCore, characterAt } from './citylife.js';
import { createStreetSigns } from './street-signs.js';
import { createCrowd, dress, seeded, KIT } from './crowd.js';
import { createHumanShop } from './human-shop.js';
import { createHumanMesh } from './human-mesh.js';
import { loadPerson } from './human-designs.js';
import { createMotion, createAnimator, fitPose } from './body-motion.js';
import { writeMovements } from './body-moves.js';
import { createFigures } from './people-figures.js';
import { CAST } from './body-designs.js';
import { createStreetProps } from './street-props.js';
import { createPlaceSource, placeName, isOpen, joinPlaceSources, indexFootprints, solveFrontages } from './places.js';
import { roomPoint, roomLocal, crossesFixture } from './room.js';
import { seatApproach, seatEyeOffset, seatHeight } from './seating.js';
import { beginRegisterTake, updateClerk, registerAction } from './register.js';
import { inviteCustomer, populateShop } from './shop-life.js';
import { createStorefronts } from './storefronts.js';
import { Work } from './work.js';
import { createInteraction } from './interaction.js';
import { createPhone, describePlace } from './phone.js';
import { createFleet } from './fleet.js';
import { createVehicleMeshLibrary } from './vehicle-assets.js';
import { designFor } from './vehicle-designs.js';
import { offersAt, shopRows, vehicleHandling } from './garage.js';
import { planRoom, roomKind, hasRoom } from './interiors.js';
import { doorBlips } from './map-blips.js';
import { createDemographics } from './demographics.js';
import { createBuses, createBusStops } from './bus.js';
import { createSheds, planSheds, createShedMesh } from './sheds.js';
import { createDining, planDining, createDiningMesh, seatsOf } from './dining.js';
import { planStands, vendorOf, createStandMesh } from './stands.js';
import { createCollection, planTrash, createTrashMesh } from './trash.js';
import { aboveTheStreet } from './aloft.js';
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
let transportScene;
// What is at each address (places.js), and the street fronts of those near the player.
let placeSource=null, storefronts=null, footprints=indexFootprints([]), fronts=[], frontsFor=null, placeTimer=0;
// The doors that can be walked through near the player, as the radar and the map mark them: fronts with a room behind them, and the subway's stairs.
let doors=[], doorsFor=null;
// The phone, and where a delivery can be sent: the streets around, and the places with a street front.
let phone=null, interaction=null, work=null, roadDestinations=[], placeDestinations=[], shopHere=null;
// The front the player is standing at if it has a room to go into, and the room they are in.
// The player and shop staff as the crowd's modelled figures, once those have loaded: where in their stride the player is.
let playerStride=0, strideClock=0;
// The player's own body (grown from the design saved by the character page), what moves it, and the street's figures.
let playerBody=null, playerDesign='', animator=null, moves=null, figures=null, bodyShop=null;
let gunSeen=0, brandished=-99, viewPistol=null;
let doorDebris=null, carSmoke=null, playerGun=null, gunWatch=0, endingShown=null;
const smoking=[], struckSeen=new Map(), blastSeen=new WeakMap();
const playerSeen={swing:0,move:null,grounded:true,vy:0,fired:0,reloading:0}, playerFitted={q:[],pelvis:[0,0,0]};
const OFFICER_CAST=CAST.findIndex(member=>member.suits.has('officer'));
const officerModels=new Map();
const PLAYER_LOOK={top:0xd7774e,bottom:0x1c1d22,skin:0xb98563,hair:0x14110f,kit:0,height:1.76};
let doorHere=null, roomGroup=null, counterHere=false;
const ROOM_LAYER=1;
const VIEW_PISTOL_LAYER=2;
const roomSightline=new THREE.Ray(),roomBounds=new THREE.Box3(),roomHit=new THREE.Vector3();
// The subway: its stations, the stair entrances drawn nearby, the one the player is standing at, and the kerbs they line up with.
// Who lives where (demographics.js): one even range of faces until the survey has loaded.
let demographics=createDemographics(null);
// The buses: their stops, those drawn nearby, and the one the player is waiting at.
let buses=null, busStops=null, stopHere=null;
// Sidewalk sheds: the buildings permitted one, and those standing nearby.
let sheds=null, shedMesh=null;
// Sidewalk cafes: the addresses licensed for one, and the tables set out nearby.
let dining=null, diningMesh=null, diners=[], patioSeats=[];
// Newsstands and fruit stands at the kerb, and whoever minds each.
let standMesh=null, vendors=[], standHere=null;
// How high the view is above the ground, and whether it is above the street (aloft.js).
let viewHeight=0, aloft=false;
// Trash night: which days each block is collected, the heaps of bags near the player, and what day of the week it is.
// The week starts on today's real weekday and moves on a day each time the game's clock passes midnight.
let collection=null, trashMesh=null, weekday=(new Date().getDay()+6)%7, clockWas=null;
// Citi Bike: the stations, and the docks drawn nearby.
let bikeShare=null, bikeDocks=null, bikeRows=[], borrowedDock=null;
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
let centralPark=null;
const terrainHeight=(x,z)=>landscape?.sampleHeight(x,z)??0;
// Where actors stand: the bare terrain plus the street surface laid on it.
const groundHeight=(x,z)=>terrainHeight(x,z)+(streetscape?.offsetAt(x,z)||0);
function groundSurface(x,z){
  const surface=landscape?.sampleSurface(x,z),lift=streetscape?.offsetAt(x,z)||0;
  return surface&&lift?{...surface,elevation:surface.elevation+lift}:surface;
}
function streetSurface(x,z,options) {
  return roadPilot?.sampleSurface(x,z,{...options,kind:'bridge'}) ?? streetDetail?.sampleSurface(x,z,options)
    ?? (options?.mode === 'walk' ? subwayStairs?.surfaceAt(x,z) : null)
    ?? roadPilot?.sampleSurface(x,z,{...options,kind:'ground'}) ?? groundSurface(x,z);
}
let roadPilot=null, roadPilotIndex=null, roadPilotLoading=null, roadPilotError=null, roadPilotRetryAt=0;
function cityPresets(){
  const parks=landscape?.getStatus().baseReady?landscapeManifest.regions:[];
  const streets=streetManifest?.coverageRegions.filter(region=>region.view)||[];
  const places=[
    ...roadIndex.places,
    ...BOARDINGS.map(transportDestination),
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
const input=new Input(canvas, action, event=>interaction?.handleKey(event)||phone?.handleKey(event), weaponControls);
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
function weaponControls(){
  return Boolean(started && bootReady && sim?.player.armed && sim.player.mode==='walk' && !sim.player.move && !sim.seat && !sim.doorway?.take && !sim.ending && !paused && !traveling && !cityView && !aerialView && !viewOverride && !switchShot.active && !mapOpen && !phone?.open && !interaction?.open);
}
function focusedAim(){return input.aiming && !sim.room && !sim.seat;}
function updatePerspectiveButton(){
  $('first-person-button').textContent=firstPersonActive()?'THIRD PERSON':'FIRST PERSON';
}
const closedAfterIncident = place => work.isClosed(place);
const shopOpen = place => !closedAfterIncident(place) && isOpen(place.kind,gfx.hours);
function atShopCounter(){
  return Boolean(sim.room)&&sim.room.staff.some(spot=>Math.hypot(spot.a-sim.room.a,spot.b-sim.room.b)<2.6);
}

function openGarage(place, index=0) {
  const rows=shopRows(place.kind,sim.vehicle);
  for(const row of rows)row.disabled=row.price===null;
  interaction.openList(placeName(place),rows,(row,i)=>{
    if(sim.garage(place.kind,row.job,row.color??row.choice))saveProgress();
    openGarage(place,i);
  },{cash:sim.cash,index,available:()=>shopHere===place&&Boolean(sim.vehicle)});
}

function action(name,event) {
  if(!sim)return;
  if(interaction?.open){
    if(name==='pause'||name==='shop'){interaction.close();return;}
    if(name!=='map'&&name!=='phone')return;
    interaction.close();
  }
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
    else if(closedAfterIncident(sim.room.place))announce('This shop is temporarily closed.');
    else if(sim.doorway?.handoff||sim.player.armed)announce('The counter is closed while the clerk is on alert.');
    else if(!atShopCounter())announce('Go up to whoever is serving.');
    else {
      const shop=sim.room.place;
      const rows=menu.map(item=>({item,name:item.name.toUpperCase(),note:'$'+item.price.toFixed(2)}));
      interaction.openList(sim.room.name,rows,({item})=>{
        if(sim.room?.place!==shop||closedAfterIncident(shop)||sim.doorway?.handoff||sim.player.armed)return;
        if(sim.buy(item)){work.sale(shop,item.price);saveProgress();}
      },{cash:sim.cash,available:()=>sim.room?.place===shop&&atShopCounter()&&!closedAfterIncident(shop)&&!sim.doorway?.handoff&&!sim.player.armed});
    }
    return;
  }
  if(name==='shop'&&standHere&&sim.player.mode==='walk'&&!sim.player.armed) {
    // At a stand on the sidewalk: what it sells.
    const place=standHere.place;
    interaction.openList(placeName(place),menuFor(place).map(item=>({item,name:item.name.toUpperCase(),note:'$'+item.price.toFixed(2)})),({item})=>{if(sim.buy(item,{street:true}))saveProgress();},{cash:sim.cash,available:()=>standHere?.place===place});
    return;
  }
  if(name==='shop') {
    if(shopHere&&sim.vehicle)openGarage(shopHere);
    else if(work.pedestrian())work.street();
    return;
  }
  if(name==='phone') { if(started&&!paused&&!traveling&&bootReady&&!cityView&&!mapOpen)phone?.toggle();return; }
  if(name==='reloadOrRecover')name=sim.player.mode==='walk'&&sim.player.armed?'reload':'recover';
  if(name==='reload'){if(weaponControls())sim.reload();return;}
  if(name==='fire' || (name==='fight' && sim.player.armed)){
    if(weaponControls() && !sim.room){
      if(focusedAim() || firstPersonActive())sim.player.angle=yaw+input.lookDelta*(focusedAim() ? .65 : 1);
      sim.fight();
    }
    return;
  }
  if(name==='fight') {
    if(sim.doorway?.take)return;
    if(!started||paused||traveling||!bootReady||cityView||mapOpen||phone?.open||sim.player.mode!=='walk')return;
    if(!sim.fight())return;
    // An officer in reach takes the punch before a passer-by does.
    if(sim.police.strike(sim.player.x,sim.player.z,sim.player.angle))return;
    const hit=crowd?.strike(sim.player.x,sim.player.z,sim.player.angle);
    if(hit)blowLanded(hit);
    else sim._say('You swing at the air.');
    return;
  }
  if(name==='draw') {
    if(!started||paused||traveling||!bootReady||cityView||mapOpen||phone?.open||sim.player.mode!=='walk'||sim.seat||aerialView)return;
    if(sim.draw())sim._say(!sim.player.armed?'Pistol away.':'Pistol equipped.',3);
    return;
  }
  if(name==='kick') {
    if(!started||paused||traveling||!bootReady||cityView||mapOpen||phone?.open||sim.player.mode!=='walk')return;
    sim.kick();
    return;
  }
  if(mapOpen)return;
  if(name==='perspective'){
    if(!started||paused||traveling||!bootReady||phone?.open)return;
    firstPerson=!firstPersonActive();
    if(cityView||aerialView)setView('street');
    else{
      const p=sim.player;
      headAnchor=p.mode==='walk'?null:undefined;
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
    if(phone?.open)return;
    if(sim.seat){sim.stand();return;}
    if(beginRegisterTake(sim,work))return;
    const seat=nearestSeat();
    if(seat&&sim.sit(seat))return;
    if(sim.room){
      if(sim.doorway && Math.hypot(sim.room.a,sim.room.b)<1.6)sim.doorway.door.velocity=-2.8;
      return;
    }
    if(sim.player.mode==='transport'||sim.transport.nearby()||sim.player.mode==='bike'||sim.getNearbyBike()){
      if(sim.interact()){yaw=sim.player.angle;snapChase=true;headAnchor=undefined;}
      return;
    }
    // On foot at a bus stop: on to the next bus. A ride is to any stop a route from here also calls at.
    if(sim.player.mode==='walk'&&!sim.room&&!stairHere&&stopHere&&!sim.getNearbyCar()){
      const from=stopHere.stop,rides=buses.ridesFrom(from).map(ride=>({ride,name:ride.stop.name,note:ride.lines.slice(0,3).join(' ')+' · '+formatDistance(ride.distance)+' · $'+FARE.toFixed(2)}));
      interaction.openList(from.name+' · '+from.lines.slice(0,4).join(' '),rides,({ride})=>{
        // The driver waves a rider with no fare on more often than not; an inspector does not.
        const unpaid=sim.cash<FARE;if(unpaid)sim.offence('fare');else sim.cash-=FARE;
        travel({x:ride.stop.x,z:ride.stop.z,name:ride.stop.name}).then(arrived=>arrived&&announce((unpaid?'You rode without paying. ':'')+'The '+ride.lines[0]+' to '+ride.stop.name+'.'));
      },{cash:sim.cash,available:()=>stopHere?.stop===from});
      return;
    }
    // On foot at the head of a subway stair: down to the trains. A ride is to any station on a line that stops here.
    if(sim.player.mode==='walk'&&!sim.room&&stairHere&&!sim.getNearbyCar()){
      const from=stairHere.station,rides=subway.ridesFrom(from).map(ride=>({ride,name:ride.station.name,note:ride.lines.join(' ')+' · '+formatDistance(ride.distance)+' · $'+FARE.toFixed(2)}));
      interaction.openList(from.name+' · '+from.routes,rides,({ride})=>{
        // No fare, no problem, until someone sees.
        const jumped=sim.cash<FARE;if(jumped)sim.offence('fare');else sim.cash-=FARE;
        const exit=subway.exitOf(ride.station);
        travel({x:exit.x+2.5,z:exit.z+2.5,name:ride.station.name,exact:true}).then(arrived=>arrived&&announce((jumped?'You jumped the turnstile. ':'')+'The '+ride.lines[0]+' to '+ride.station.name+'.'));
      },{cash:sim.cash,available:()=>stairHere?.station===from});
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
  if(name==='recover'){
    if(sim.transport.active){
      travel(transportDestination(sim.transport.active.home)).then(arrived=>{if(arrived)sim._restoreCondition();});
      return;
    }
    chaseHeight=null;chaseEyeOffset=null;headAnchor=undefined;sim.reset();yaw=sim.player.angle;aerialTracking=false;chaseLookAhead.set(0,0,0);announce('Recovered to a nearby street. Your next ride is waiting.');
  }
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
  if(paused)interaction?.close();
  if(paused&&mapOpen)gameMap.setOpen(false);
  input.clear();
  if(paused && !$('pause-dialog').open && !$('help-dialog').open && !$('sources-dialog').open) {
    const car = sim.vehicle || sim.getNearbyCar();
    $('pause-car').hidden = !car;
    if (car) {
      $('pause-car-name').textContent = performanceName(car);
      renderStats($('pause-car-stats'), vehicleHandling(car));
    }
    $('pause-dialog').showModal();
  }
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
$('touch-equip').addEventListener('click',()=>action('draw'));
$('touch-aim').addEventListener('click',()=>{
  if(!weaponControls() || sim.room)return;
  if(input.touch.has('aim'))input.touch.delete('aim');else input.touch.add('aim');
});
$('touch-fire').addEventListener('click',()=>action('fire'));
$('touch-reload').addEventListener('click',()=>action('reload'));
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

/** Grow the player's body afresh if the saved design has changed. */
/** A punch or a kick has landed on somebody in the crowd: those near by get away from it, and it may be called in. */
function blowLanded(person) {
  crowd.alarm(person.x,person.z,8,.75);
  if(person.dead)sim.offence('killing',{x:person.x,z:person.z,message:'You killed somebody. Somebody saw.'});
  else sim.assault(person.x,person.z);
}
/** The player's shot: an officer or a passer-by in its line is hit, everyone who hears it runs, and it is heard a long way off. */
function shotFired(event) {
  const police=sim.police,sin=Math.sin(event.angle),cos=Math.cos(event.angle);
  let reach=GUN.range;
  // A wall stops it.
  for(let d=2;d<reach;d+=2)if(sim.isBlocked(event.x+sin*d,event.z+cos*d,.05)){reach=d;break;}
  const officer=police.shot(event.x,event.z,event.angle,reach);
  const hit=officer===null?crowd?.shoot(event.x,event.z,event.angle,reach):null;
  const far=officer??hit?.distance??reach;
  police.shots.push({at:sim.elapsed,hit:Boolean(hit)||officer!==null,x:event.x+sin*.55,y:event.y,z:event.z+cos*.55,tx:event.x+sin*far,ty:event.y-(hit||officer!==null?.2:0),tz:event.z+cos*far});
  police.shotsFired++;police.armed=true;gunWatch=20;
  crowd?.alarm(event.x,event.z,48,.85);
  sim.offence('gunfire',{x:event.x,z:event.z,message:'Shots fired. Somebody is calling it in.'});
  if(hit?.dead)sim.offence('killing',{x:hit.person.x,z:hit.person.z,message:'You shot somebody dead.'});
  else if(hit)sim.offence('assault',{x:hit.person.x,z:hit.person.z,message:'You shot somebody.'});
}
/** The pistol in the player's hand: a few boxes, held by the bone of the right hand. */
function pistolMesh() {
  const gun=new THREE.Group(),steel=new THREE.MeshBasicMaterial({color:0x515962});
  const slide=new THREE.Mesh(new THREE.BoxGeometry(.034,.05,.22),steel);slide.position.set(0,.025,.075);
  const grip=new THREE.Mesh(new THREE.BoxGeometry(.028,.11,.045),new THREE.MeshBasicMaterial({color:0x262a30}));grip.position.set(0,-.045,-.005);grip.rotation.x=.22;
  gun.add(slide,grip);
  return gun;
}
function createGun(body) {
  const hand=body.bones.find(bone=>bone.name==='hand_r');
  if(!hand)return null;
  const gun=pistolMesh();
  // In the hand's own space the fingers run along +Y and the back of the hand faces -X: the barrel
  // goes the way the fingers do, the grip down through the palm (measured in the aiming pose).
  const forward=new THREE.Vector3(.03,.982,-.184).normalize(),up=new THREE.Vector3(-.042,.185,.982).normalize(),side=new THREE.Vector3().crossVectors(up,forward).normalize();
  up.crossVectors(forward,side);
  gun.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,up,forward));
  gun.position.copy(forward).multiplyScalar(.1).addScaledVector(up,.075);
  gun.traverse(object=>object.layers.enable(ROOM_LAYER));
  gun.visible=false;hand.add(gun);
  return gun;
}
// Draw the held prop on a camera-only layer so it stays out of the world reflections.
function updateViewPistol(){
  const aiming=focusedAim();
  if(!weaponControls() || sim.room)input.touch.delete('aim');
  const visible=weaponControls() && !sim.doorway?.take && (aiming || firstPersonActive());
  $('aim-dot').hidden=!aiming || sim.player.reloading>0;
  if(!visible){if(viewPistol)viewPistol.visible=false;return;}
  if(!viewPistol){
    viewPistol=pistolMesh();viewPistol.name='First-person pistol';
    const glove=new THREE.Mesh(new THREE.BoxGeometry(.067,.074,.115),new THREE.MeshBasicMaterial({color:0x373b41}));
    glove.position.set(.013,-.041,-.028);viewPistol.add(glove);
    viewPistol.traverse(part=>part.layers.set(VIEW_PISTOL_LAYER));
    if(!camera.parent)scene.add(camera);
    camera.add(viewPistol);
  }
  camera.layers.enable(VIEW_PISTOL_LAYER);viewPistol.visible=true;
  const p=sim.player, kick=p.firedAt==null?0:Math.max(0,1-(sim.elapsed-p.firedAt)/.14);
  const dip=p.reloading>0?Math.sin(Math.PI*p.reloading/GUN.reload):0;
  viewPistol.position.set(aiming ? .025 : .14,(aiming?-.049:-.115)-dip*.12,-.34+kick*.035);
  viewPistol.rotation.set(kick*.13-dip*.5,Math.PI,0,'YXZ');
}
function dressPlayer() {
  if(!bodyShop)return;
  const design=loadPerson(),key=JSON.stringify(design);
  if(key===playerDesign)return;
  playerDesign=key;
  bodyShop(design,'close').then(built=>{
    if(key!==playerDesign)return;
    if(playerBody){scene.remove(playerBody.mesh);playerBody.dispose();}
    playerBody=createHumanMesh(built,built.look);playerBody.mesh.traverse(object=>object.layers.enable(ROOM_LAYER));scene.add(playerBody.mesh);
    playerGun=createGun(playerBody);
  }).catch(error=>console.warn('The player could not be drawn:',error));
}
/** Put the player's body where the player is, in the pose for what they are doing. */
function showPlayer(dt,p,floor,eyeView,riding) {
  const mesh=playerBody.mesh;
  mesh.visible=(p.mode==='walk'||riding)&&!eyeView;
  // What the simulation has just begun is begun here too: a swing, a kick, a vault, a hand to a car door.
  const take=sim.room && !sim.seat && sim.doorway?.take;
  if((p.swing||0)>playerSeen.swing+.1)animator.punch(Math.abs(p.speed)>1.2);
  playerSeen.swing=p.swing||0;
  const entering = ['door','breakIn','carjack'].includes(p.move?.kind);
  const move = p.move?.approach?.length ? null : entering && p.move.t >= p.move.T-.20 ? 'getIn' : p.move?.kind || null;
  if(move&&move!==playerSeen.move)animator.play(move,{fadeIn:.08,fadeOut:.18});
  playerSeen.move=move;
  const impact=playerSeen.grounded===false&&p.grounded!==false?-playerSeen.vy:0;
  playerSeen.grounded=p.grounded!==false;if(p.grounded===false)playerSeen.vy=p.vy||0;
  const arrest=sim.police?.arrest||0,ending=sim.ending?.kind||null;
  const held=riding?'drive':ending==='wasted'||sim.health<=0?'death':ending==='busted'?'cuffed':arrest>.6?'kneel':arrest>.2?'handsUp':null;
  const seat=held?null:sim.seat;
  // The pistol: brought up while it is out, kicked by each shot, and a new magazine when the last round has gone.
  const armed=Boolean(p.armed)&&p.mode==='walk'&&!held&&!seat&&!take;
  if(armed&&(p.firedAt||0)!==playerSeen.fired)animator.play('shoot',{rate:1.6,upperOnly:true,fadeIn:.03,fadeOut:.12});
  if(armed&&(p.reloading||0)>playerSeen.reloading+.5)animator.play('reload',{rate:1.25,upperOnly:true,fadeIn:.1,fadeOut:.2});
  playerSeen.fired=p.firedAt||0;playerSeen.reloading=p.reloading||0;
  if(playerGun)playerGun.visible=armed;
  const pose=animator.update(dt,{speed:p.mode==='walk'?(seat?.stepSpeed??p.speed):0,grounded:riding||p.grounded,guard:(p.guard||0)>0,aim:armed,sliding:(p.slide||0)>0,impact,held,seat});
  if(!mesh.visible)return;
  mesh.position.set(p.x,floor+(p.lift||0)+(riding?.25:0),p.z);mesh.rotation.y=p.angle;
  playerBody.pose(fitPose(moves,playerBody.rig,take?.hand ? moves.sample('pickUp',take.clipTime,pose) : pose,playerFitted,seat));
  if(take?.hand) {
    const {bones,rig}=playerBody, hand=bones[rig.index.get('hand_l')];
    cashTarget.set(take.hand.x,floor+take.hand.y,take.hand.z);
    const elbow=bones[rig.index.get('lowerarm_l')], shoulder=bones[rig.index.get('upperarm_l')];
    for(let i=0;i<3;i++){aimLimb(elbow,hand,gripOffset,cashTarget);aimLimb(shoulder,hand,gripOffset,cashTarget);}
  }
}

/** WASTED or BUSTED: the picture drains and the word comes up while the world runs slow, and both go when the player is put back. */
function showEnding() {
  const ending=sim.ending,kind=ending?.kind||null;
  if(kind===endingShown)return;
  endingShown=kind;
  if(kind)interaction?.close();
  const panel=$('ending');
  if(!panel)return;
  document.body?.classList?.toggle('ending-wasted',kind==='wasted');
  document.body?.classList?.toggle('ending-busted',kind==='busted');
  panel.hidden=!kind;
  if(kind){$('ending-word').textContent=kind==='wasted'?'WASTED':'BUSTED';$('ending-line').textContent=ending.line||'';panel.className='ending '+kind;}
}

function animatePerson(mesh,moving,time,speed=1) {
  const swing=moving?Math.sin(time*8*Math.max(.6,Math.min(speed,1.6)))*.4:0;
  const legs=mesh.userData.legs||[],arms=mesh.userData.arms||[];
  legs.forEach((leg,i)=>{if(leg?.rotation)leg.rotation.x=swing*(i%2?-1:1);});
  arms.forEach((arm,i)=>{if(arm?.rotation)arm.rotation.x=swing*(i%2?1:-1)*.7;});
}

// Turn a posed limb towards a checkout target in the joint's own frame.
const gripHere=new THREE.Vector3(), gripGoal=new THREE.Vector3(), gripTurn=new THREE.Quaternion();
function aimLimb(joint, tip, offset, target){
  joint.worldToLocal(tip.localToWorld(gripHere.copy(offset)));
  joint.worldToLocal(gripGoal.copy(target));
  if(gripHere.lengthSq()>.00001 && gripGoal.lengthSq()>.00001)
    joint.quaternion.multiply(gripTurn.setFromUnitVectors(gripHere.normalize(),gripGoal.normalize()));
}
const gripOffset=new THREE.Vector3(0,.075,0), simpleGrip=new THREE.Vector3(0,-.62,.008), cashTarget=new THREE.Vector3();

function syncScene(dt,controls) {
  const p=sim.player, eyeView=firstPersonActive() || focusedAim();
  const cycling=p.mode==='bike';
  const ride=sim.transport.active, type=ride?.home.type;
  const openRide=type==='scooter'||type==='motorcycle'||type==='kayak';
  transportScene.update(p,elapsed,started&&!cityView,eyeView);
  if(bikeDocks){
    const id=sim.bike?.id??null;
    if(id!==borrowedDock){borrowedDock=id;bikeDocks.update(bikeRows,id);}
    bikeDocks.rental.visible=Boolean(sim.bike);
    if(sim.bike){
      const at=cycling?p:sim.bike;
      bikeDocks.rental.position.set(at.x,at.y,at.z);bikeDocks.rental.rotation.y=at.angle;
    }
  }
  if(sim.room&&!sim.seat&&sim.doorway?.take?.heading!=null)p.angle=sim.doorway.take.heading;
  else if(sim.room&&p.armed&&!sim.seat&&!aerialView&&!cityView)p.angle=yaw;
  const occupiedRoom=sim.room&&sim.doorway;
  storefronts?.setActive(occupiedRoom||null);
  roomGroup=occupiedRoom?.group||null;
  if(roomGroup)roomGroup.userData.floorY=occupiedRoom.floor;
  if(driverCabin)driverCabin.group.visible=eyeView&&p.mode==='drive';
  // Kerbside cars are drawn together, and so is traffic more than a few car
  // lengths off. The player's car, a patrol, a car left standing in the road
  // and whatever traffic is close by each have a model of their own, with
  // wheels that turn and steer.
  const activeCars=new Set(), batchedParked=[];distantCars.length=0;
  for(const car of sim.cars){
    const away=Math.hypot(car.x-p.x,car.z-p.z);
    if(car._kerb && away > (carModels.has(car.id) ? 14 : 10) && !(car.damage && away < MODEL_RANGE)){
      batchedParked.push(car);continue;
    }
    if(car.controlled||car.type==='police'||!car._edge||!distantTraffic||away<(carModels.has(car.id)?MODEL_KEPT:MODEL_RANGE))activeCars.add(car.id);
    else if(away<CAR_SIGHT)distantCars.push(car);
  }
  for(const [id,mesh] of carModels)if(!activeCars.has(id)){scene.remove(mesh);carModels.delete(id);}
  parkedCars?.update(batchedParked);
  distantTraffic?.update(distantCars);
  // Bags are at the kerb from the evening before a collection day until the truck has been the next morning.
  if(gfx&&trashMesh){if(clockWas!==null&&gfx.hours<clockWas-12)weekday=(weekday+1)%7;clockWas=gfx.hours;trashMesh.show(weekday,gfx.hours);if(cityView&&!viewOverride)trashMesh.mesh.visible=false;}
  // Once the modelled figures are in, the player and whoever is serving are drawn as two of them.
  const modelled=Boolean(crowd?.modelled),pace=Math.abs(p.speed);
  const playerFloor=roomGroup?.userData.floorY??p.y??0;
  const extras=[];
  if(storefronts)for(const view of storefronts.rooms){
    view.door.step(dt);view.group.userData.updateDoor();
    if(!mapOpen&&!paused&&!phone?.open&&!interaction?.open&&!aerialView&&!cityView&&!viewOverride&&!traveling&&started){
      updateClerk(view,sim,yaw,eyeView?headPitch:0,dt,work,{
        outside:actor=>crowd.fleeOntoStreet(actor),palm:actor=>crowd.palm(actor),firstPerson:eyeView,
        playerHand:()=>{
          const hand=playerBody?.bones[playerBody.rig.index.get('hand_l')];
          const joint=hand || (avatar.visible && avatar.userData.arms?.[1]);
          if(!joint)return null;
          const point=joint.localToWorld(gripHere.copy(hand?gripOffset:simpleGrip));
          return {x:point.x,y:point.y-view.floor,z:point.z};
        }
      });
    }
    for (const actor of view.actors) {
      if (actor.gone) continue;
      if (actor.spot.treadmill && !actor.escape) {
        actor.time = sim.elapsed * actor.spot.cadence + actor.spot.offset;
        actor.clip = 'jog'; actor.stride = 1; actor.phase = actor.time * 7;
      }
      actor.y = view.floor + (actor.sitting ? 0 : actor.lift);
      extras.push(actor);
    }
    if(dt&&started&&!cityView&&!aerialView&&shopOpen(view.plan.place))inviteCustomer(view,crowd.people,sim.elapsed,(shop,price)=>work.sale(shop,price));
  }
  playerStride+=pace*Math.min(.1,Math.max(0,elapsed-strideClock))*3.3;strideClock=elapsed;
  {
    // Diners sit out from late morning until the kitchens close.
    const bystanders=sim.bystanders;
    bystanders.length=0;
    if(gfx.hours>=11&&gfx.hours<23)for(const diner of diners)if(!(diner.absentUntil>sim.elapsed) && (!sim.seat||Math.hypot(sim.seat.x-diner.x,sim.seat.z-diner.z)>.2))bystanders.push(diner);
    // A newsstand is minded from before dawn; a fruit cart through the day.
    for(const vendor of vendors)if(!(vendor.absentUntil>sim.elapsed) && (vendor.fruit?gfx.hours>=7&&gfx.hours<20:gfx.hours>=5&&gfx.hours<23))bystanders.push(vendor);
    extras.push(...bystanders);
  }
  if(modelled){
    if(p.mode==='walk'&&!eyeView&&!playerBody){
      const lunging=(p.swing||0)>0;
      extras.push({x:p.x+Math.sin(p.angle)*(lunging?0.45:0),y:playerFloor,z:p.z+Math.cos(p.angle)*(lunging?0.45:0),heading:p.angle,phase:lunging?1.2:playerStride,stride:lunging?0.2:Math.min(1,pace/1.2),sitting:Boolean(sim.seat),seat:sim.seat,clip:sim.doorway?.take?'pickUp':null,time:sim.doorway?.take?.clipTime,look:PLAYER_LOOK});
    }
    if(cycling&&!eyeView&&!playerBody)extras.push({x:p.x-.28*Math.sin(p.angle),y:playerFloor+.52,z:p.z-.28*Math.cos(p.angle),heading:p.angle,cycling:true,phase:playerStride*.42,look:PLAYER_LOOK});
    if(openRide&&!eyeView&&!playerBody){
      const offset=type==='motorcycle'?-.38:type==='kayak'?-.24:0;
      extras.push({x:p.x+Math.sin(p.angle)*offset,z:p.z+Math.cos(p.angle)*offset,
        y:p.y+(type==='kayak' ? -.20 : type==='motorcycle' ? .34 : .22),heading:p.angle,sitting:type!=='scooter',look:PLAYER_LOOK});
    }
    // Officers out of their cars are drawn the same way, in uniform.
    for(const officer of sim.police.officers){const cuffing=(sim.police.arrest||0)>.5&&Math.hypot(officer.x-p.x,officer.z-p.z)<2.2;extras.push({x:officer.x,y:officer.y||0,z:officer.z,heading:officer.angle,phase:officer.phase,stride:officer.stride,look:OFFICER_LOOK,member:OFFICER_CAST<0?undefined:OFFICER_CAST,clip:cuffing?'cuffing':officer.aiming?'aim':(officer.stride||0)>.6?'jog':undefined,time:cuffing||officer.aiming?elapsed:(officer.phase||0)/6.2832*.93});}
  }
  if(!modelled&&sim.seat&&!eyeView&&!playerBody)extras.push({x:p.x,y:playerFloor,z:p.z,heading:p.angle,sitting:true,seat:sim.seat,look:PLAYER_LOOK});
  crowd?.setExtras(extras);
  // Until the modelled figures are in, officers are drawn as the plain figure the player is.
  for(const [id,mesh] of officerModels)if(modelled||!sim.police.officers.some(officer=>officer.id===id)){scene.remove(mesh);officerModels.delete(id);}
  if(!modelled)for(const officer of sim.police.officers){
    let mesh=officerModels.get(officer.id);
    if(!mesh){mesh=createPerson(0x1b2a4a);officerModels.set(officer.id,mesh);scene.add(mesh);}
    mesh.position.set(officer.x,officer.y||0,officer.z);mesh.rotation.y=officer.angle;animatePerson(mesh,officer.speed>.1,elapsed,officer.speed/3);
  }
  policeScene.update(sim.police,elapsed,started&&!cityView);
  avatar.visible=(p.mode==='walk'||cycling||openRide)&&!sim.seat&&!modelled&&!eyeView;avatar.position.set(p.x,playerFloor,p.z);avatar.rotation.y=p.angle;
  animatePerson(avatar,Math.abs(p.speed)>.1,elapsed,Math.abs(p.speed)/3);
  const take=sim.room && !sim.seat && sim.doorway?.take;
  if(avatar.visible && avatar.userData.arms?.[1]){
    const arm=avatar.userData.arms[1];
    arm.rotation.y=0; arm.rotation.z=.07;
    if(take?.hand)aimLimb(arm,arm,simpleGrip,cashTarget.set(take.hand.x,playerFloor+take.hand.y,take.hand.z));
  }
  if(playerBody&&animator){avatar.visible=false;showPlayer(dt,p,playerFloor,eyeView,cycling||openRide);}
  if(cycling&&!modelled){
    avatar.position.x-=.28*Math.sin(p.angle);avatar.position.z-=.28*Math.cos(p.angle);avatar.position.y+=.1;
    avatar.userData.legs.forEach((leg,i)=>{leg.rotation.x=-.52+Math.sin(playerStride+i*Math.PI)*.3;});
    avatar.userData.arms.forEach(arm=>{arm.rotation.x=-.85;});
  }
  if(openRide&&!modelled){
    const seated=type!=='scooter', offset=seated?-.26:0;
    avatar.position.x+=offset*Math.sin(p.angle);avatar.position.z+=offset*Math.cos(p.angle);
    avatar.position.y+=type==='kayak'?-.55:type==='motorcycle'?-.08:.20;
    avatar.userData.legs.forEach(leg=>{leg.rotation.x=seated?-1.05:0;});
    avatar.userData.arms.forEach(arm=>{arm.rotation.x=-.84;});
  }
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
    const previousDoors = mesh.userData.missingDoors ?? car.missingDoors ?? 0;
    for (const [i,bit] of [1,2].entries()) if ((car.missingDoors & bit) && !(previousDoors & bit)) {
      doorDebris?.detach(mesh.userData.detail.doors[i],car,i === 0 ? 1 : -1);
    }
    mesh.userData.missingDoors = car.missingDoors || 0;
    updateCarVisuals(mesh,car,dt);
    // A car that has been hit smokes, the more the worse it is, and throws bits off when it is hit.
    const harm=car.damage||0;
    if(car.destroyed && blastSeen.get(car)!==car.explodedAt && sim.elapsed-car.explodedAt < 1 && Math.hypot(car.x-p.x,car.z-p.z)<CAR_SIGHT) {
      blastSeen.set(car,car.explodedAt);
      carSmoke?.explosion(car.x,car.y||0,car.z);
      audio.explosion(Math.hypot(car.x-p.x,car.z-p.z));
    }
    if(harm>.45 && (mesh.visible || car.controlled) && (!car.destroyed || sim.elapsed-car.explodedAt < 18))smoking.push({burning:car.burningSince!=null,id:car.id,x:car.x,y:car.y||0,z:car.z,angle:car.angle,amount:Math.min(1,(harm-.45)/.5),vx:car.velocityX||0,vz:car.velocityZ||0});
    if(car.struckAt&&struckSeen.get(car.id)!==car.struckAt){struckSeen.set(car.id,car.struckAt);carSmoke?.burst(car.x,(car.y||0)+.7,car.z,9);}
    if(mesh.userData.update)mesh.userData.update(elapsed,car,sim.heat);
    // Scene factories may expose lamp meshes for a lightweight police flash.
    if(car.type==='police')for(const [i,light] of (mesh.userData.lights||[]).entries()){
      light.visible=!car.destroyed;
      if(light.material)light.material.emissiveIntensity=sim.heat>.1?(Math.sin(elapsed*14+i*Math.PI)>0?3:.1):.15;
    }
  }
  if(sim.mission.phase==='active'&&sim.mission.target){
    marker.visible=true;marker.position.set(sim.mission.target.x,groundHeight(sim.mission.target.x,sim.mission.target.z),sim.mission.target.z);markerDiamond.rotation.y=elapsed*.7;markerDiamond.position.y=5+Math.sin(elapsed*2)*.3;
  }else marker.visible=false;
  const nearCar=sim.getNearbyCar(),boarding=sim.transport.nearby(),near=boarding?.entrance||sim.getNearbyBike(nearCar)||nearCar;
  enterHint.visible=p.mode==='walk'&&!!near&&started&&!eyeView;
  if(near)enterHint.position.set(near.x,(near.y??groundHeight(near.x,near.z))+3+Math.sin(elapsed*2)*.15,near.z);

}

function updateFirstPerson(look,vertical){
  const p=sim.player, driving=p.mode==='drive';
  const ride=sim.transport.active, anchor=ride??(driving?p.vehicleId:p.mode==='bike'?sim.bike:sim.seat??null);
  if(headAnchor!==anchor){
    if(sim.seat||headAnchor?.seatKind){headTurn=clamp(angleDifference(yaw,p.angle),-1.95,1.95);}
    else{yaw=p.angle;headTurn=0;headPitch=0;}
    headAnchor=anchor;
  }
  if(paused||traveling){look=0;vertical=0;}
  headPitch=clamp(headPitch+vertical,driving?-.9:-1.4,driving?1.05:1.4);
  if(driving){
    headTurn=clamp(headTurn+look,-1.95,1.95);
    yaw=p.angle+headTurn;
    driverCabin??=createDriverCabin(scene);
    driverCabin.placeCamera(camera,carModels.get(p.vehicleId),headTurn,headPitch);
  }else if(ride){
    const [height,forward]=ride.spec.eye;
    headTurn=clamp(headTurn+look,-2.2,2.2);yaw=p.angle+headTurn;
    camera.position.set(p.x+Math.sin(p.angle)*forward,p.y+height,p.z+Math.cos(p.angle)*forward);
    camera.rotation.set(-headPitch-ride.pitch,Math.PI+yaw,-ride.roll*.5,'YXZ');
  }else{
    if(p.mode==='bike'||sim.seat){headTurn=clamp(headTurn+look,-1.95,1.95);yaw=p.angle+headTurn;}
    else{yaw+=look;if(!sim.seat)p.angle=yaw;}
    const take=sim.room&&!sim.seat&&sim.doorway?.take;
    if(take && !look && !vertical){
      const dx=take.source.x-p.x,dz=take.source.z-p.z;
      const align=1-Math.exp(-8*Math.max(0,take.age-(take.cameraAge||0)));
      yaw+=align*angleDifference(Math.atan2(dx,dz),yaw);
      headPitch+=align*(Math.atan2(1.64-take.source.y,Math.hypot(dx,dz))-headPitch);
      p.angle=yaw;take.cameraAge=take.age;
    }
    const floor=sim.room&&roomGroup?roomGroup.userData.floorY:p.y;
    const height=playerBody?.rig.height??PLAYER_LOOK.height;
    camera.position.set(p.x,(floor??0)+height-.12+seatEyeOffset(sim.seat,height),p.z);
    camera.rotation.set(-headPitch,Math.PI+yaw,0,'YXZ');
  }
  camera.near=.07;camera.fov=70;camera.updateProjectionMatrix();
  chaseHeight=null;chaseEyeOffset=null;snapChase=true;
}

function updateCamera(dt) {
  const p=sim.player,driving=p.mode==='drive';
  const indoorView=started&&sim.room&&!aerialView&&!cityView;
  // Indoors the room is drawn, and the street with it: it is there to be seen through the doorway and the windows.
  camera.layers.set(indoorView?ROOM_LAYER:0);if(indoorView)camera.layers.enable(0);
  // And the building's own wall is left out where the room's front is.
  if(indoorView&&roomGroup){const room=sim.room;shared.uNycRoom.value.set(room.x,roomGroup.userData.floorY,room.z,1);shared.uNycRoomSide.value.set(room.nx,room.nz,room.width/2,0);}else shared.uNycRoom.value.w=0;
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
  if(focusedAim()){
    yaw+=look*.65;p.angle=yaw;headAnchor=null;
    camera.position.set(p.x,p.y+1.4,p.z);camera.rotation.set(0,Math.PI+yaw,0,'YXZ');
    camera.near=.07;camera.fov=54;camera.updateProjectionMatrix();
    chaseHeight=null;chaseEyeOffset=null;snapChase=true;return;
  }
  if(firstPerson){updateFirstPerson(look,vertical);return;}
  yaw+=look;pitch=clamp(pitch+vertical,.17,.85);lookIdle=look||vertical?0:lookIdle+dt;
  if(indoorView){
    const room=sim.room,floor=roomGroup?.userData.floorY??p.y??0;
    const targetHeight=1.45+seatEyeOffset(sim.seat,PLAYER_LOOK.height);
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    const db=sin*room.nx+cos*room.nz,da=-(sin*room.tx+cos*room.tz)-(room.skew||0)*db;
    // Follow the sightline back from the player until a wall or tall fixture
    // would cover the camera. Keep a little space for the near plane.
    const pad=.16,b=Math.max(pad,room.b);
    roomSightline.origin.set(room.a,targetHeight,b);
    roomSightline.direction.set(da,.45/2.3,db).normalize();
    roomBounds.min.set(-room.width/2+pad,0,pad);
    roomBounds.max.set(room.width/2-pad,3,room.depth-pad);
    const reach=()=>Math.hypot(roomHit.x-room.a,roomHit.z-b);
    let back=roomSightline.intersectBox(roomBounds,roomHit)?Math.min(2.3,reach(),Math.max(.03,Math.hypot(room.a,room.b)*1.4)):0;
    for(const t of room.things){
      if(t.y+t.h<targetHeight-pad||t.y>targetHeight+.45+pad)continue;
      roomBounds.min.set(t.a-t.w/2-pad,t.y-pad,t.b-t.d/2-pad);
      roomBounds.max.set(t.a+t.w/2+pad,t.y+t.h+pad,t.b+t.d/2+pad);
      if(roomBounds.containsPoint(roomSightline.origin)){back=0;break;}
      if(roomSightline.intersectBox(roomBounds,roomHit))back=Math.min(back,reach());
    }
    const x=p.x-room.nx*(b-room.b),z=p.z-room.nz*(b-room.b);
    camera.position.set(x-sin*back,floor+targetHeight+.45*back/2.3,z-cos*back);
    camera.lookAt(x+sin*.25,floor+targetHeight,z+cos*.25);
    camera.near=.025;camera.fov=57;camera.updateProjectionMatrix();
    chaseHeight=null;chaseEyeOffset=null;snapChase=false;return;
  }
  // A manual orbit owns the view for 1.1 seconds. Ease assistance back in so
  // releasing the mouse does not abruptly pull the camera behind the car.
  const chaseAssist=clamp((lookIdle-1.1)/.65,0,1), speed=Math.abs(p.speed);
  const ride=sim.transport.active;
  if((driving||p.mode==='bike'||ride)&&(speed>.25||ride?.spec.kind==='rotor')){
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
  const doorwayDistance=sim.doorway?Math.hypot(p.x-sim.doorway.plan.x,p.z-sim.doorway.plan.z):Infinity;
  const distance=ride?ride.spec.view*(farCamera?1.48:1):driving?(farCamera?14:9.3):Math.min(farCamera?10:6.5,Math.max(.03,doorwayDistance-.15)*1.4);
  const aimHeight=ride?Math.max(.8,ride.spec.eye[0]*.75):driving?1.1:1.45+seatEyeOffset(sim.seat,PLAYER_LOOK.height);
  const cameraContact=(x,z,d)=>sim.isBlocked(x,z,.2,{ignoreWater:true,baseHeight:ride?p.y+aimHeight+Math.sin(pitch)*d:undefined});
  let safeDistance=distance;
  // Pull the chase camera forward before its sightline crosses a facade.
  // Checking the same collision geometry keeps narrow SoHo streets readable.
  const sightStep=ride?Math.max(.6,distance/40):.6;
  for(let d=1;d<=distance;d+=sightStep){
    if(cameraContact(p.x-Math.sin(yaw)*d,p.z-Math.cos(yaw)*d,d)){safeDistance=Math.max(.9,d-sightStep-.1);break;}
  }
  const previousHeight=chaseHeight;
  chaseHeight=updateChaseHeight(chaseHeight,p,dt,ride?ride.home.id:driving?'car:'+p.vehicleId:'walk');
  const eyeOffset=(ride?aimHeight+.5:Math.min(1.55,aimHeight+.015*doorwayDistance))+Math.sin(pitch)*safeDistance;
  if(chaseHeight!==previousHeight||chaseEyeOffset===null)chaseEyeOffset=eyeOffset;
  else chaseEyeOffset=THREE.MathUtils.damp(chaseEyeOffset,eyeOffset,safeDistance<3?22:driving?13:8,dt);
  // Eye and aim share the same smoothed elevation. Filtering only the eye
  // while looking at raw terrain height makes every bump pitch the camera.
  const height=chaseHeight.height+chaseEyeOffset;
  desiredCamera.set(p.x-Math.sin(yaw)*safeDistance,height,p.z-Math.cos(yaw)*safeDistance);
  if(snapChase){camera.position.copy(desiredCamera);snapChase=false;}
  else camera.position.lerp(desiredCamera,1-Math.exp(-dt*(safeDistance<3?22:driving?13:8)));
  camera.position.y=height;
  if(!driving&&!ride&&doorwayDistance<2.5){
    const dx=camera.position.x-p.x,dz=camera.position.z-p.z,reach=Math.hypot(dx,dz);
    if(reach>safeDistance){camera.position.x=p.x+dx*safeDistance/reach;camera.position.z=p.z+dz*safeDistance/reach;}
  }
  // A smoothed camera can cut across a corner even when its destination is safe.
  // Clamp inward immediately, then ease back out once the sightline clears.
  const dx=camera.position.x-p.x,dz=camera.position.z-p.z,actualDistance=Math.hypot(dx,dz);
  const eyeStep=ride?Math.max(.4,actualDistance/48):.4;
  for(let d=.6;d<=actualDistance;d+=eyeStep){
    if(cameraContact(p.x+dx*d/actualDistance,p.z+dz*d/actualDistance,d)){
      const ratio=Math.max(.15,d-eyeStep-.1)/actualDistance;
      camera.position.x=p.x+dx*ratio;camera.position.z=p.z+dz*ratio;break;
    }
  }
  camera.position.y=Math.max(camera.position.y,terrainHeight(camera.position.x,camera.position.z)+.6);
  cameraTarget.set(p.x,chaseHeight.height+aimHeight,p.z);
  if(driving)cameraTarget.add(chaseLookAhead);
  camera.lookAt(cameraTarget);
  const targetFov=driving?60+Math.min(9,Math.abs(p.speed)*.24):57;
  camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,4,dt);camera.updateProjectionMatrix();
}

function frame(now) {
  requestAnimationFrame(frame);
  // A death or an arrest is watched at a third of the speed.
  const dt=Math.min(.05,(now-(lastFrame||now))/1000)*(sim?.ending?.36:1);lastFrame=now;
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
    if(!paused&&!traveling&&!cityView&&!mapOpen&&bootReady){selectDoorway();sim.step(controls,dt);elapsed+=dt;}
    showEnding();
  }else{elapsed+=dt;introTime+=dt;}
  if(landscapeDirty){
    landscapeDirty=false;landscapeRevision++;
    world.setTerrainSampler(terrainHeight,landscapeRevision);
    streetDetail?.setTerrainSampler(groundHeight,landscapeRevision);
    streetscape?.setTerrainSampler(terrainHeight,landscapeRevision);
    sim.updateGrounding();
  }
  syncScene(paused||traveling||cityView||mapOpen?0:dt,controls);if(!mapOpen)updateCamera(dt);updateViewPistol();navigation?.updatePin();
  // prepareAt owns the destination's collision data until arrival. Reselecting
  // around the old player while terrain is still loading would discard it.
  // Continue rendering and downloads; resume selection after arrival/rollback.
  // How high the view is above the ground under it, and whether that is too high to see a street's furniture (aloft.js).
  const playerAltitude=(sim.player.y||0)-groundHeight(sim.player.x,sim.player.z);
  viewHeight=Math.max(0,camera.position.y-groundHeight(camera.position.x,camera.position.z),playerAltitude);
  aloft=started&&!cityView&&!switchShot.active&&aboveTheStreet(viewHeight,aloft);
  if(!traveling)world.update(sim.player,camera,{overview:cityView||!started,altitude:started&&!cityView?viewHeight:0,collisionAltitude:Math.max(0,playerAltitude-35)});
  ground.update(sim.player,{overview:cityView||!started});
  world.setLocalOrthophoto(ground.localOrthophoto);
  landscape?.setLocalOrthophoto(ground.localOrthophoto);
  landscape?.update(sim.player,{overview:cityView||!started});
  centralPark?.update(sim.player,{overview:cityView||!started,eye:camera.position});
  streetDetail?.setLocalOrthophoto(ground.localOrthophoto);
  streetDetail?.update(sim.player,{overview:cityView||!started||aloft});
  streetscape?.update(sim.player,{overview:cityView||!started||aloft});
  roadPilot?.setLocalOrthophoto(ground.localOrthophoto);
  if(started&&!cityView&&roadPilotIndex&&!roadPilot&&!roadPilotLoading&&Date.now()>=roadPilotRetryAt&&nearRoadPilot(sim.player,600))ensureRoadPilot().catch(()=>{});
  updateRoadPilotControls();
  // The opening shot and street play are lit with shadows; the map view is not.
  setLocalShadows(!cityView);
  // Light and shadows follow what the camera is looking at.
  const overview=cityView||!started;
  const lit=viewOverride?{x:viewOverride.target[0],y:viewOverride.target[1],z:viewOverride.target[2]}:!started?{x:INTRO.x,y:0,z:INTRO.z}
    :aerialView&&!overview?aerialTarget:{x:sim.player.x,y:sim.player.y||0,z:sim.player.z};
  gfx.update(dt,{focus:lit,overview:(cityView&&!viewOverride)||aloft,paused:paused||mapOpen});
  // The streets under an aircraft are not driven on: they are fetched again when the view comes down.
  if(bootReady&&!traveling&&!aloft)refreshRoads();
  if(bootReady&&started&&!traveling&&!cityView)refreshParkedCars();
  audio.update(sim,elapsed,started&&!paused&&!traveling&&!cityView&&!mapOpen);
  hudTime+=dt;if(hudTime>.075){
    // Retain nearby streets if the optional citywide route download fails.
    if(!routePlanner&&gameMap.roads!==sim.city.roads)gameMap.setRoads(sim.city.roads);
    sim.melee=Boolean(!cityView&&sim.player.mode==='walk'&&crowd?.closest(sim.player.x,sim.player.z));
    sim.threats=crowd?.threats||[];
    hud.city=sim.city;hud.update(sim,Boolean(nearestSeat()),sim.doorway?.take?null:registerAction(sim),focusedAim());updateDirections();saveProgress();updateLocation();updateTimeButton();hudTime=0;
  }
  water.update(lit,{overview:cityView&&!viewOverride});
  // Lamps and headlights are gathered before the frame that they light.
  streetLife.update(lit,{lights:gfx.state.lightsOn,cars:sim.cars,overview:(overview&&!viewOverride)||aloft,spots:policeScene.spots});
  doorDebris?.update(paused||traveling?0:dt);
  carSmoke?.update(paused||traveling?0:dt,smoking,renderer.domElement?.height||720,sim?.player);smoking.length=0;
  if(struckSeen.size>200)struckSeen.clear();
  // Signals show what the simulation's traffic is obeying, on the same clock.
  signs.group.visible=!cityView||Boolean(viewOverride);
  if(signs.group.visible)signs.update(sim.junctions,lit,sim.elapsed);
  // How much traffic, and whose cabs, follows the hour and the neighbourhood.
  // It joins the streets where the camera is not looking.
  lifeTimer-=dt;
  if(lifeTimer<=0){lifeTimer=2;sim.setTraffic(cityLife.traffic(sim.player.x,sim.player.z,gfx.hours));}
  camera.getWorldDirection(trafficAhead);sim.setLookout(trafficAhead.x,trafficAhead.z);
  // People on the sidewalks: as many as the place and the hour call for.
  crowd.mesh.visible=started&&(!cityView||Boolean(viewOverride))&&!aloft;
  if(crowd.mesh.visible){
    const ahead=camera.getWorldDirection(crowdAhead),flat=Math.hypot(ahead.x,ahead.z)||1;
    crowd.update(paused||mapOpen||traveling?0:dt,{walks:streetscape?.walks()||noStreetFurniture,focus:lit,forward:[ahead.x/flat,ahead.z/flat],hours:gfx.hours,time:sim.elapsed,junctions:sim.junctions,cars:sim.cars,player:sim.player});
    if(crowd.damage)sim.hurt(crowd.damage);
    // Running somebody down is a crime if anybody sees it, and so is most of what the player's moves end in.
    for(const hit of crowd.struck){
      if(hit.speed>3.5)carSmoke?.burst(hit.x,(hit.person?.y||0)+.8,hit.z,hit.speed*.5);
      if(!hit.player)continue;
      sim.brush(hit.speed>3.5?.82:.95);
      if(hit.speed>3.5){crowd.alarm(hit.x,hit.z,14,.9,{y:hit.person.y});sim.offence(hit.dead?'killing':'runDown',{x:hit.x,y:hit.person.y,z:hit.z,message:hit.dead?'You ran somebody over. Somebody saw.':'You ran somebody down.'});}
    }
    if(sim.moveEvents?.length)for(const event of sim.moveEvents.splice(0)){
      if(event.kind==='kick'){if(!sim.police.strike(event.x,event.z,event.angle,1.5)){const hit=crowd.strike(event.x,event.z,event.angle,{reach:2.1,power:2});if(hit)blowLanded(hit);}}
      else if(event.kind==='shot')shotFired(event);
      else if(event.kind==='glass')sim.offence('glass',{x:event.x,z:event.z,message:'Glass all over the seat. Somebody saw that.'});
      else if(event.kind==='escapeFire'){
        const driver=crowd.throwOut(event.x,event.z,event.heading,gfx.hours);
        Object.assign(driver,{state:'flee',mad:5,fireOrigin:{x:event.car.x,z:event.car.z}});
        crowd.alarm(event.x,event.z,10,.7);
      }
      else if(event.kind==='thrown'){crowd.throwOut(event.x,event.z,event.heading,gfx.hours);crowd.alarm(event.x,event.z,10,.8);sim.offence('carjack',{x:event.x,z:event.z,message:'You took a car with somebody in it.'});}
    }
    // A gun in the open: whoever it is pointed at puts their hands up or runs, and somebody may call it in.
    const armed=Boolean(sim.player.armed)&&sim.player.mode==='walk'&&!sim.room&&!sim.seat;
    gunWatch=Math.max(0,gunWatch-dt);
    sim.police.armed=armed||gunWatch>0;
    if(armed&&!paused&&!mapOpen&&!traveling&&(gunSeen-=dt)<=0){
      gunSeen=.4;
      if(crowd.alarm(sim.player.x,sim.player.z,20,.65,{angle:sim.player.angle,calm:true,y:sim.player.y,sight:person=>sim._hasSight(person,sim.player),bystanders:sim.bystanders,time:sim.elapsed})&&sim.elapsed-brandished>8){brandished=sim.elapsed;sim.offence('brandish',{message:'Somebody saw the gun.'});}
    }
    sim.setWalkers(crowd.crossing,crowd.people);
  }
  // Shop fronts take the names of the places the registers put behind them.
  // Whose front is whose is worked out again when the places, the buildings
  // or the streets around change, or the player has gone thirty metres.
  placeTimer-=dt;
  // From the air no shop front, shed or stand can be made out, and at an aircraft's speed they would be worked out afresh several times a second.
  if(placeSource&&placeTimer<=0&&!aloft){
    placeTimer=.4;placeSource.request(lit.x,lit.z,700);
    markDoors();
    const walks=streetscape?.walks()||noStreetFurniture;
    if(!frontsFor||frontsFor.places!==placeSource.version||frontsFor.footprints!==footprints||frontsFor.walks!==walks||Math.hypot(lit.x-frontsFor.x,lit.z-frontsFor.z)>30){
      frontsFor={places:placeSource.version,footprints,walks,x:lit.x,z:lit.z};
      fronts=solveFrontages(placeSource.near(lit.x,lit.z,250),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z)));
      // Sheds stand along the street walls of the buildings permitted one.
      if(sheds&&shedMesh)shedMesh.update(planSheds(sheds.near(lit.x,lit.z,220),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z))));
      if(collection&&trashMesh){
        if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
        trashMesh.setHeaps(planTrash(footprints.near(lit.x,lit.z,150),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z)),{kerb:(x,z)=>snapToKerb(kerbIndex,x,z,12),useAt:(x,z)=>lots()?.at(x,z)?.use??0,daysAt:(x,z)=>collection.daysAt(x,z)}));
      }
      if(standMesh){
        if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
        const stands=planStands(placeSource.near(lit.x,lit.z,220),(x,z)=>snapToKerb(kerbIndex,x,z,16));
        standMesh.update(stands);
        const lastVendors=new Map(vendors.map(v=>[v.stand.place.id,v.absentUntil]));
        vendors=stands.map(stand=>{
          const spot=vendorOf(stand),random=seeded((Math.round(stand.x*13+stand.z*29)>>>0)||1),look=dress('casual',random,demographics.tracts?demographics.tonesAt(stand.x,stand.z,.3):null);
          look.kit=(look.kit&(KIT.longHair|KIT.shortSleeves))|(random()<.35?KIT.woman:0);
          return {x:spot.x,y:groundHeight(spot.x,spot.z),z:spot.z,heading:spot.heading,phase:0,stride:0,look,absentUntil:lastVendors.get(stand.place.id),fruit:stand.kind==='fruitstand',stand};
        });
      }
      if(bikeShare&&bikeDocks){
        if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
        bikeRows=planBikeDocks(bikeShare.near(lit.x,lit.z,200),(x,z)=>snapToKerb(kerbIndex,x,z,14));
        bikeDocks.update(bikeRows,borrowedDock);
      }
      if(dining&&diningMesh){
        const rows=planDining(dining.near(lit.x,lit.z,200),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z)));
        const drawn=diningMesh.update(rows);
        // Who is at the tables: the same people at the same chairs each time, with the faces of the neighbourhood. About half the chairs are taken.
        const lastDiners=new Map(diners.map(d=>[d.x+','+d.z,d.absentUntil]));
        diners=[];patioSeats=[];
        for(const row of rows.slice(0,drawn))for(const seat of seatsOf(row)){
          patioSeats.push(seat);
          const random=seeded((Math.round(seat.x*31+seat.z*17)>>>0)||1);
          if(random()>.55)continue;
          const look=dress('casual',random,demographics.tracts?demographics.tonesAt(seat.x,seat.z,.5):null);
          look.kit=(look.kit&(KIT.longHair|KIT.shortSleeves))|(random()<.5?KIT.woman:0);look.height=1.72;
          diners.push({x:seat.x,y:groundHeight(seat.x,seat.z),seat,z:seat.z,heading:seat.heading,sitting:true,look,absentUntil:lastDiners.get(seat.x+','+seat.z)});
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
    const driving=sim.player.mode==='drive',onFoot=sim.player.mode==='walk',reach=driving?14:7;
    if(started&&!sim.room&&!cityView&&!mapOpen&&(driving||onFoot))for(const front of fronts){
      if(driving&&!offersAt(front.place.kind))continue;
      const dx=sim.player.x-front.x,dz=sim.player.z-front.z,out=dx*front.nx+dz*front.nz;
      if(out>-1&&out<reach&&Math.abs(dx*front.tx+dz*front.tz)<front.width/2+(driving?5:1)&&(!facing||out<facing.out))facing={front,out};
    }
    // The head of a subway stair within a few steps.
    stairHere=null;
    if(started&&!cityView&&!mapOpen&&onFoot&&!sim.room&&subwayStairs)for(const entrance of subwayStairs.entrances){if(Math.hypot(entrance.x-sim.player.x,entrance.z-sim.player.z)<4.5){stairHere=entrance;break;}}
    // A bus stop within a couple of steps.
    stopHere=null;
    if(started&&!cityView&&!mapOpen&&onFoot&&!sim.room&&!stairHere&&busStops)for(const stop of busStops.stops){if(Math.hypot(stop.x-sim.player.x,stop.z-sim.player.z)<3){stopHere=stop;break;}}
    // A stand that someone is minding, within a couple of steps of its counter.
    standHere=null;
    if(started&&!cityView&&!mapOpen&&onFoot&&!sim.room&&!stairHere&&!stopHere)for(const vendor of vendors){
      const open=vendor.fruit?gfx.hours>=7&&gfx.hours<20:gfx.hours>=5&&gfx.hours<23;
      if(open&&!sim.player.armed&&!(vendor.absentUntil>sim.elapsed)&&!(vendor.downUntil>sim.elapsed)&&Math.hypot(vendor.x-sim.player.x,vendor.z-sim.player.z)<3.2){standHere=vendor.stand;break;}
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
    // Indoors, within reach of whoever is serving.
    counterHere=atShopCounter();
    if(sim.room){
      const visit=sim.doorway?.visitor?.visit;
      const hints=[sim.room.name];
      if(visit?.wait>0)hints.push('Customer ordering '+visit.item.name.toLowerCase());
      const phase=sim.doorway?.handoff?.phase;
      if(sim.doorway?.take)hints.push('Taking the cash');
      else if(sim.doorway?.closed)hints.push('Temporarily closed');
      else if(phase==='giving')hints.push('The clerk reaches across the counter');
      else if(phase==='startled')hints.push('The clerk raises their hands');
      else if(phase==='opening')hints.push('The clerk is opening the drawer');
      else if(phase==='offered')hints.push('The clerk is holding out the cash');
      else if(!phase&&!sim.player.armed&&counterHere&&menuFor(sim.room.place).length)hints.push('G TO ORDER');
      $('place-hint').hidden=false;$('place-hint').textContent=hints.join(' · ');
    }
    if(facing){
      const about=describePlace(facing.front.place,gfx.hours,closedAfterIncident),open=about.status==='OPEN';
      if(driving&&open&&Math.abs(sim.player.speed)<1)shopHere=facing.front.place;
      if(onFoot&&open&&facing.out<3.5&&roomKind(facing.front.place))doorHere=facing.front;
      $('place-hint').textContent=[about.name,about.kind===about.name?'':about.kind,about.grade,about.status,driving&&open?(shopHere?'G FOR THE COUNTER':'STOP HERE FOR THE SHOP'):doorHere?'WALK IN':''].filter(Boolean).join(' · ');
    }
  }
  gfx.indoors=camera.layers.isEnabled(ROOM_LAYER);
  gfx.indoorDepth=gfx.indoors?clamp(sim.room.b/1.8,0,1):0;
  // Subway stairs stand where the MTA lists them, running along the kerb beside them.
  if(subway&&subwayStairs&&!aloft){
    const walks=streetscape?.walks()||noStreetFurniture;
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    subwayStairs.group.visible=!cityView||Boolean(viewOverride);
    subwayStairs.update(subway,lit,walks,landscapeRevision);
  }
  if(buses&&busStops&&!aloft){
    const walks=streetscape?.walks()||noStreetFurniture;
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    busStops.group.visible=!cityView||Boolean(viewOverride);if(shedMesh)shedMesh.mesh.visible=busStops.group.visible;if(diningMesh)diningMesh.mesh.visible=busStops.group.visible;if(standMesh)standMesh.mesh.visible=busStops.group.visible;if(bikeDocks)bikeDocks.group.visible=busStops.group.visible;
    busStops.update(buses,lit,kerbIndex);
  }
  if(work && work.now()>=work.nextReopening)work.updateClosures();
  storefronts?.update(fronts,lit,gfx.hours,Boolean(viewOverride)||started&&!cityView&&!aerialView,landscapeRevision,work?.closureRevision);
  interaction?.update();
  phone?.update(elapsed);
  // A red-light camera's flash: the frame blows out for a tenth of a second.
  const flashed=sim.cameraFlash&&sim.elapsed-sim.cameraFlash.at<.11;
  if(flashed!==cameraFlashing){cameraFlashing=flashed;$('world').style.filter=flashed?'brightness(2.2)':'';}
  props.group.visible=crowd.mesh.visible;
  if(props.group.visible&&!aloft)props.update(streetscape?.walks()||noStreetFurniture,lit,signs.poles);
  setVehicleLamps(gfx.state.lightsOn);
  const furnishedRooms=storefronts?.rooms;
  if(furnishedRooms)world.roomCutaways.update(furnishedRooms);
  else world.roomCutaways.update(sim.room&&roomGroup?[{plan:sim.room,floor:roomGroup.userData.floorY}]:[]);
  // Above the street nothing of its furniture is drawn; each is shown again by its own update when the view comes down.
  if(aloft)for(const thing of [crowd?.mesh,signs?.group,props?.group,subwayStairs?.group,busStops?.group,shedMesh?.mesh,diningMesh?.mesh,standMesh?.mesh,bikeDocks?.group,trashMesh?.mesh])if(thing)thing.visible=false;
  if(figures)figures.group.visible=crowd.mesh.visible;
  gfx.render();
  qualityTimer+=dt;if(dt>.035)slowFrames++;
  if(highQuality&&qualityTimer>5){if(slowFrames>90){highQuality=false;applyQuality();announce('Switched to balanced graphics for smoother streets.');}qualityTimer=0;slowFrames=0;}
}

function setView(mode){
  interaction?.close();
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
function insideShopBuilding(front,x,z){
  const building=footprints.at(x,z);
  return Boolean(building&&(!front.building||front.building===building||front.building.id!=null&&front.building.id===building.id));
}
function roomFor(front){
  return planRoom(front,(x,z)=>insideShopBuilding(front,x,z));
}
function floorFor(room){
  // Keep the furnishings above the sidewalk and the ground under the room.
  let floor=groundHeight(room.x+room.nx*1.5,room.z+room.nz*1.5);
  for(const along of [-.5,0,.5])for(const deep of [0,.5,1]){const h=groundHeight(...roomPoint(room,room.width*along,room.depth*deep));if(Number.isFinite(h)&&h>floor&&h<floor+1.2)floor=h;}
  return floor+.06;
}
// Mark the doors that can be walked through on the radar and the map (map-blips.js): the fronts with a room behind
// them and the subway's stairs. The open map looks further than the street does, so for it fronts are worked out as
// far as places are loaded. Past 300 m fewer of the streets are known, and fewer doors are found than are there.
function markDoors(){
  if(!gameMap||!placeSource)return;
  const stairs=subwayStairs?.entrances;
  if(!doorsFor||doorsFor.fronts!==fronts||doorsFor.stairs!==stairs||doorsFor.wide!==mapOpen){
    doorsFor={fronts,stairs,wide:mapOpen};
    const at=frontsFor||sim.player;
    const beyond=mapOpen?solveFrontages(placeSource.near(at.x,at.z,700).filter(place=>Math.hypot(place.x-at.x,place.z-at.z)>250),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z))):[];
    doors=doorBlips([...fronts,...beyond].filter(front=>hasRoom(front,(x,z)=>insideShopBuilding(front,x,z))),mapOpen&&subway?subway.entrancesNear(at.x,at.z,700).filter(entrance=>entrance.kind===0):stairs);
  }
  if(doorsFor.closures!==work.closureRevision){
    doorsFor.closures=work.closureRevision;
    doors=doors.map(door=>({...door,closed:closedAfterIncident(door)}));
  }
  gameMap.setDoors(doors,gfx.hours);
}
// Door contact is sampled every movement frame, independent of the slower sign/HUD lookup.
function selectDoorway(){
  if(sim.room||!storefronts)return;
  let nearest=null, best=5;
  if(sim.player.mode==='walk')for(const view of storefronts.rooms){
    const distance=Math.hypot(sim.player.x-view.plan.x,sim.player.z-view.plan.z);
    if(distance<best&&(shopOpen(view.plan.place)||storefronts.closingDoor===view)){best=distance;nearest=view;}
  }
  if(doorHere&&Math.hypot(sim.player.x-doorHere.x,sim.player.z-doorHere.z)<Math.min(best,2)&&shopOpen(doorHere.place))nearest=storefronts.prepare(doorHere);
  sim.doorway=nearest;
}
function goIn(front){
  if(sim.player.mode!=='walk'||sim.room||!shopOpen(front.place))return false;
  const at=roomLocal(front,sim.player.x,sim.player.z);
  if(Math.abs(at.a)>1.1||at.b>0||at.b < -1.65)return false;
  const view=storefronts.prepare(front);
  if(!view)return false;
  sim.doorway=view;view.door.velocity=2.8;
  return true;
}
function nearestSeat(){
  if(sim.player.mode!=='walk'||sim.seat||sim.player.move||sim.player.grounded===false)return null;
  const p=sim.player;
  let best=1.45, choice=null;
  const consider=(seat,clear)=>{
    const distance=Math.hypot(seat.x-p.x,seat.z-p.z);
    if(distance>=best)return;
    const y=seat.y??groundHeight(seat.x,seat.z);
    if(Math.abs(y-p.y)>1.2)return;
    const path=seatApproach(p,seat,clear);
    if(path){best=distance;choice={...seat,y,path};}
  };
  if(sim.room){
    for(const spot of sim.room.seats||[]){
      if(sim.doorway?.occupied.has(spot))continue;
      const [x,z]=roomPoint(sim.room,spot.a,spot.b);
      const [fx,fz]=roomPoint(sim.room,spot.a+spot.da,spot.b+spot.db);
      if(Math.hypot(x-p.x,z-p.z)>=best)continue;
      consider({...spot,x,z,y:sim.doorway?.floor??p.y,seatHeight:seatHeight(spot),heading:Math.atan2(fx-x,fz-z)},(from,to)=>{
        const a=roomLocal(sim.room,from.x,from.z), b=roomLocal(sim.room,to.x,to.z);
        if(Math.abs(b.a)>sim.room.width/2-.1||b.b<.1||b.b>sim.room.depth-.1)return false;
        return !sim.room.things.some(t=>t.solid&&(t.a!==spot.a||t.b!==spot.b)&&crossesFixture(a,b,t,.08));
      });
    }
  }else {
    for(const seat of props?.seats||[])consider(seat);
    for(const seat of patioSeats){
      if(Math.abs(seat.x-p.x)>best||Math.abs(seat.z-p.z)>best)continue;
      if(gfx.hours>=11&&gfx.hours<23&&diners.some(d=>!(d.absentUntil>sim.elapsed)&&d.x===seat.x&&d.z===seat.z))continue;
      const sin=Math.sin(seat.heading), cos=Math.cos(seat.heading);
      const local=pt=>({a:(pt.x-seat.x)*cos-(pt.z-seat.z)*sin,b:(pt.x-seat.x)*sin+(pt.z-seat.z)*cos});
      consider(seat,(from,to)=>!crossesFixture(local(from),local(to),{a:0,b:.58,w:.62,d:.62},.06));
    }
  }
  return choice;
}
// Corners and businesses, found in the game's own data. The street index is made from the route planner's roads the
// first time something is searched for, and the list of place names is fetched then too.
let streetIndex=null, placeIndex=null, placeIndexReady=null;
// Search, map layers and recovery share one citywide list of places.
function loadPlaceNames(){
  const read=file=>fetch('./'+file,{signal:AbortSignal.timeout(30000)}).then(response=>response.ok?response.json():null);
  placeIndexReady||=Promise.all([read('place-names.json'),read('landmarks.json').catch(()=>null)]).then(([data,named])=>{
    if(!data)throw new Error('The citywide places could not load.');
    // The city's individual landmarks are searched and mapped by name with everything else.
    if(named){const kind=data.kinds.length;data.kinds.push('Landmark');for(const [name,x,z] of named.landmarks)data.places.push([name,x,z,kind,0]);}
    placeIndex=createPlaceIndex(data);gameMap?.setPlaces(createPlaceLayer(data));
  }).catch(()=>{placeIndexReady=null;});
  return placeIndexReady;
}
async function findLocally(query){
  const terms=query.trim().toLowerCase().split(/\s+/);
  const boardings=BOARDINGS.map(transportDestination).filter(p=>terms.every(term=>(p.name+' '+p.borough+' '+p.keywords).toLowerCase().includes(term)));
  const planner=await plannerReady;
  if(planner&&!streetIndex)streetIndex=createStreetIndex(planner.roads);
  await loadPlaceNames();
  const found=searchLocal(query,{streets:streetIndex,places:placeIndex,near:sim?{x:sim.player.x,z:sim.player.z}:null});
  // Several branches of one name are told apart by the street each is on.
  for(const place of found)if(place.kind==='place'&&planner){const road=planner.snap({x:place.x,z:place.z},{maxSnapDistance:300});if(road)place.detail=title(road.name);}
  return [...boardings,...found];
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
      candidate=new RoadPilot({scene,data,appearance,orthophoto:ground.orthophoto,stairOpenings:subwayStairs.openings});
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
async function travel(place,recovery=null){
  if(!place||traveling||!bootReady)return false;
  interaction?.close();
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
    if(recovery){
      phone?.setOpen(false);
      await loadPlaceNames();
      place=placeIndex?.nearestRecovery(recovery.facility,place);
      if(!place)throw new Error(`The ${recovery.facility} location is unavailable.`);
    }
    const roads=await roadStream.loadAround(place,1000);
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
    clearDirections();gameMap?.setStatus('Spawned at the selected location.');
    if(place.boarding){
      const stop=BOARDINGS.find(s=>s.id===place.boarding);
      if(stop){sim.transport.recall(stop.id);sim._say(stop.place+' · Press E to board the '+TRANSPORT[stop.type].name+'.',8);}
    }
    if(recovery){
      const release=recovery.facility==='hospital'?'Discharged from':'Released from';
      sim._say(`${recovery.message} ${release} ${title(place.name)}.`,7);
    }
    return true;
  }catch(error){
    // The stream can publish additional colliders while a destination loads.
    // Restore navigation data without replacing that newer collision snapshot.
    switchShot.cancel();
    sim.setActiveCity({...previous,buildings});$('travel-note').textContent=error.message;announce(error.message);
    if(recovery){
      sim.reset();
      sim._say(`${recovery.message} The ${recovery.facility} was unavailable. Recovered locally.`,7);
    }
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
  city={...seed,bounds:roadIndex.bounds,buildings:[],roads:[],boroughs,missionPoints:[],sampleSurface:streetSurface,landscapeContact:(x,z,radius)=>landscape?.contactAt(x,z,radius)};
  $('load-text').textContent='CONNECTING TO NEW YORK…';
  // The frame is antialiased in its own multisampled target, not the canvas.
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,10,150000);
  // Sky, sun, haze and the screen-space finish share one time of day.
  gfx=createGraphics({renderer,scene,camera});
  sim=new Simulation(city,{onRecovery:recovery=>travel({x:sim.player.x,z:sim.player.z},recovery)});
  subwayStairs=createSubwayEntrances({scene,physics:sim.streetObjects,heightAt:groundHeight,
    kerbAt:(x,z)=>kerbIndex&&snapToKerb(kerbIndex,x,z,12)});
  const stairOpenings=subwayStairs.openings;
  // Rivers, harbor and sea, bounded by the borough shorelines.
  water=createWater({scene,boroughs,bounds:roadIndex.bounds,panorama:gfx.skyPanorama,stairOpenings});
  // The country around the city, as a silhouette. Optional: without it the city stands in open sea.
  loadData('context-land.json').then(manifest=>{
    const image=new Image();
    image.onload=()=>water.setContext(image,manifest);
    image.src=manifest.url;
  }).catch(()=>{});
  gfx.passes.push((renderer,scene,camera)=>water.renderMirror(renderer,scene,camera,{enabled:!gfx.indoors&&(Boolean(viewOverride)||!cityView),scale:highQuality?.75:.5}));
  sim.moves=true;
  // The crowd answers for itself when a car hits it, and a death or an arrest is watched before what follows.
  sim.peopleReact=true;sim.endingSeconds=2;
  sim.transport=new TransportFleet(sim,{isLand:(x,z)=>water.isLand(x,z)&&!landscape?.waterAt(x,z),isNavigable:water.isNavigable,waterLevel:WATER_LEVEL});
  transportScene=createTransportScene(scene,sim.transport);
  streetLife=createStreetLife({scene,renderer,physics:sim.streetObjects,getLamps:()=>streetscape?.lamps()||noStreetFurniture,getTrees:()=>streetscape?.trees()||noStreetFurniture});
  parkedCars=createParkedCars({capacity:PARKED_LIMIT+8,library:vehicleMeshes});scene.add(parkedCars.group);
  distantTraffic=createDistantTraffic({library:vehicleMeshes});scene.add(distantTraffic.group);
  interaction=createInteraction({$,onOpenChange:open=>{
    if(open)phone?.setOpen(false);else canvas.focus();
  }});
  work=new Work({sim,phone:()=>phone,meet:(title,message,rows,available)=>{
    interaction.openList(title,rows,row=>row.choose(),{message,available});
  },fronts:()=>fronts,hours:()=>gfx.hours,save:saveProgress,
    guide:site=>{gameMap.setOpen(true);gameMap.showCity();gameMap.setPin(site);},
    pedestrian:()=>sim.player.mode==='walk'&&!sim.room&&!sim.player.armed?crowd?.closest(sim.player.x,sim.player.z,4,true):null,
    counter:()=>registerAction(sim)?sim.room.place:null});
  restoreProgress();yaw=sim.player.angle;
  signs=createStreetSigns({scene,heightAt:groundHeight,raised:(x,z)=>(streetscape?.offsetAt(x,z)||0)>.1});
  crowd=createCrowd({scene,heightAt:groundHeight,blocked:(x,z,y)=>sim.isBlocked(x,z,.2,{baseHeight:y}),isRoad:(x,z)=>streetscape?.surfaceAt(x,z)==='road',
    life:{crowding:(x,z,hours)=>cityLife.crowding(x,z,hours),wardrobe:(x,z,hours)=>cityLife.wardrobe(x,z,hours),
      // Offices, shops and sights fill a street with people from all over the city; at home, and at night, it is the neighbours.
      tones:(x,z,hours)=>{if(!demographics.tracts)return null;const c=characterAt(x,z),day=hours>7&&hours<20?1:.35;return demographics.tonesAt(x,z,Math.min(.85,Math.max(c.business,c.visited,c.shopping*.7)*day));}}});
  crowd.mesh.traverse(object=>object.layers.enable(ROOM_LAYER));
  // The city's own lists: sidewalk counts, and the signals that favour people
  // on foot. Without them the model answers alone and nothing is lost but detail.
  const signalHints=(x,z)=>({...cityLife.hintsAt(x,z),core:manhattanCore(x,z)});
  sim.setActiveCity({signalHints});
  props=createStreetProps({scene,physics:sim.streetObjects,heightAt:groundHeight});
  storefronts=createStorefronts({scene,roomFor,floorFor,isClosed:closedAfterIncident,populate:view=>populateShop(view,(x,z)=>demographics.tracts?demographics.tonesAt(x,z,.35):null)});
  loadLogos().then(logos=>{if(logos.size)storefronts.setLogos(logos);}).catch(()=>{});
  // The registers' places, and the shops they do not list (OpenStreetMap), read as one.
  const registerPlaces=createPlaceSource({load:url=>loadData(url.replace(/^\.\//,''))}),otherShops=createPlaceSource({load:url=>loadData(url.replace(/^\.\//,'')),prefix:'o'});
  placeSource=joinPlaceSources(registerPlaces,otherShops);
  loadData('places-index.json').then(index=>registerPlaces.setIndex(index)).catch(()=>{});
  loadData('shops-index.json').then(index=>otherShops.setIndex(index)).catch(()=>{});
  loadData('demographics.json').then(data=>{demographics=createDemographics(data);}).catch(()=>{});
  busStops=createBusStops({scene,heightAt:groundHeight,kerb:(x,z)=>kerbIndex&&snapToKerb(kerbIndex,x,z,14)});
  shedMesh=createShedMesh({scene,heightAt:groundHeight});
  trashMesh=createTrashMesh({scene,heightAt:groundHeight});
  fetch('./collection.bin').then(response=>response.ok?response.arrayBuffer():null).then(buffer=>{collection=createCollection(buffer);frontsFor=null;}).catch(()=>{});
  diningMesh=createDiningMesh({scene,heightAt:groundHeight});standMesh=createStandMesh({scene,heightAt:groundHeight});
  loadData('dining.json').then(data=>{dining=createDining(data);frontsFor=null;}).catch(()=>{});
  bikeDocks=createBikeDocks({scene,heightAt:groundHeight});
  sim.dockedBikes=bikeDocks.available;
  loadData('bikes.json').then(data=>{bikeShare=createBikeShare(data);frontsFor=null;}).catch(()=>{});
  loadData('sheds.json').then(data=>{sheds=createSheds(data);frontsFor=null;}).catch(()=>{});
  loadData('bus-stops.json').then(data=>{buses=createBuses(data);}).catch(()=>{});
  loadData('transit.json').then(data=>{subway=createSubway(data);}).catch(()=>{});
  sim.setFleet(fleet);
  // Every car in the street is one the game draws (vehicle-generator.js). The scanned exteriors in assets/vehicles are
  // lumpier than those and carry the shadows of their photographs on their glass; the catalog page still shows them.
  Promise.all(['fleet.json','vehicle-catalog.json','working-vehicles.json','vehicle-performance.json'].map(file=>loadData(file).catch(()=>null)))
    .then(([base,catalog,working,performance])=>{fleet=createFleet(base,catalog,null,designFor,working,performance);sim.setFleet(fleet);});
  // People are grown here (body.js): the street's cast and the player, once the skeleton and its movements have loaded.
  // Bodies are grown on another thread; where there is none, the blocked-out figures stay.
  if(typeof Worker!=='undefined')Promise.all([loadData('motion.json'),fetch('./motion.bin').then(response=>{if(!response.ok)throw new Error('motion');return response.arrayBuffer();})]).then(([meta,buffer])=>{
    moves=writeMovements(createMotion(meta,new Int16Array(buffer)));
    figures=createFigures({motion:moves,meta,scene,capacity:360});crowd.setFigures(figures);
    animator=createAnimator(moves);bodyShop=createHumanShop(meta);dressPlayer();
    // The character page saves a design in this browser; coming back from it, the player is drawn afresh.
    addEventListener('storage',dressPlayer);addEventListener('focus',dressPlayer);
  }).catch(error=>console.warn('People could not be loaded:',error));
  phone=createPhone({$,isClosed:closedAfterIncident,places:()=>placeSource.near(sim.player.x,sim.player.z,700),
    state:()=>({x:sim.player.x,z:sim.player.z,hours:gfx.hours,clock:gfx.clock,cash:sim.cash,jobActive:sim.mission.phase==='active',fares:sim.deliveries,miles:sim.distanceTravelled/1609.344,redLights:sim.redLights||0}),
    onMechanic:()=>sim.callMechanic(),onCab:()=>sim.summonCab(),
    onDirections:place=>{const name=place.name||describePlace(place,gfx.hours).name;requestDirections({x:place.x,z:place.z}).then(found=>announce(found?'Directions to '+name+'. Follow the highlighted streets.':'No way to '+name+' along mapped streets.'));},
    onTransport:()=>phone.openList('Travel to a boarding point',BOARDINGS.map(stop=>({stop,name:TRANSPORT[stop.type].name,note:stop.place+' · '+stop.borough})),row=>travel(transportDestination(row.stop))),
    onWork:()=>work.board(),onJob:()=>action('job'),onMap:()=>action('map'),
    onOpenChange:open=>{$('phone-button').setAttribute('aria-expanded',String(open));$('mission-panel').classList.toggle('behind-phone',open);if(!open)canvas.focus();}});
  loadData('street-life.json').then(data=>{cityLife=createCityLife(data);props.setData(data);sim.setActiveCity({signalHints});}).catch(()=>{});
  world=createCityStream(cityIndex,{scene,onCollisionChange:applyBuildings,onStatus:updateStreaming,heightAt:terrainHeight});
  ground=createCityGround({scene,renderer,stairOpenings,onStatus:status=>{if(status.failures)$('imagery-status').textContent='Some aerial tiles are unavailable. NYC imagery will retry as you explore; surveyed geometry loads separately.';}});
  world.setOrthophoto(ground.orthophoto);
  const landscapeReady=loadData('landscape-index.json').then(async index=>{
    landscapeManifest=index;
    landscape=new Landscape({scene,index,physics:sim.streetObjects,stairOpenings,orthophoto:ground.orthophoto,onChange:()=>{landscapeDirty=true;},onStatus:updateLandscapeStatus});
    await landscape.loadBase();
    centralPark=createCentralPark({scene,landscape,physics:sim.streetObjects,streetDetail:()=>streetDetail});
    // Measured terrain and the water sheet now cover everything the flat
    // photograph did; it stays loaded as the terrain's and the roofs' texture.
    ground.group.visible=!landscape.getStatus().baseReady;
    sim.updateGrounding();world.setTerrainSampler(terrainHeight,++landscapeRevision);
    navigation?.refreshPresets();
    loadData('reconstruction-review.json').then(report=>{
      reconstructionReview=report;landscape?.setReconstructionReview(report);if(landscape)updateLandscapeStatus(landscape.getStatus());
    }).catch(()=>{$('reconstruction-status').textContent='Image review unavailable. Measured source geometry remains active.';});
  }).catch(()=>{
    centralPark?.dispose();centralPark=null;
    landscape?.dispose();landscape=null;landscapeManifest=null;landscapeDirty=true;ground.group.visible=true;
    $('landscape-status').textContent='Measured terrain is unavailable. The aerial map remains playable.';
  });
  // Do not await optional detail. Even a stalled download must leave city
  // startup and travel independent of this neighborhood enrichment layer.
  // Asphalt, sidewalks, kerbs and paint. Surveyed outlines ship for a few
  // neighbourhoods; elsewhere they stream from NYC Open Data around the player.
  const startStreetscape=index=>{
    streetscape=createStreetscape({scene,index,physics:sim.streetObjects,stairOpenings,heightAt:terrainHeight,onChange:()=>sim?.updateGrounding(),
      roadsFor:bounds=>roadStream.loadAround({x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2},320)});
    if(roadPilot)streetscape.setGroundReplacementBounds(roadPilotIndex.bounds);
  };
  loadData('street-detail-index.json').then(surfaces=>{
    streetManifest=surfaces;startStreetscape(surfaces);
    navigation?.refreshPresets();
    // The mapped street module now supplies bridge decks only.
    streetDetail=createStreetDetail(surfaces,{scene,orthophoto:ground.orthophoto,heightAt:groundHeight,drape:false,roadsFor:focus=>roadStream.loadAround(focus,1100),waterAt:(x,z)=>landscape?.waterAt(x,z),onChange:()=>sim?.regroundTraffic(),onStatus:status=>{
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
  avatar=createPerson(0xd7774e,{courier:true});avatar.traverse(object=>object.layers.enable(ROOM_LAYER));scene.add(avatar);marker=createMissionMarker();enterHint=createEnterHint();policeScene=createPoliceScene(scene,(x,z)=>groundHeight(x,z));carSmoke=createCarSmoke(scene);doorDebris=createDoorDebris(scene);
  hud=new HUD(city);applyQuality();
  gameMap=new GameMap({city,searchLocal:findLocally,onPlacesWanted:loadPlaceNames,onPin:requestDirections,
    onSpawn:pin=>travel({...pin,exact:true}),
    onOpenChange:open=>{if(open)interaction?.close();mapOpen=open;input.clear();input.lookDelta=0;input.lookVertical=0;if(!open)canvas.focus();markDoors();}});
  hud.attachMap(gameMap);
  // The compact citywide graph is optional: a failed route download must not
  // prevent entering the game or using a measured, validated spawn point.
  plannerReady=loadData('navigation-roads.json').then(data=>{
    routePlanner=createRoutePlanner(data);gameMap.setRoads(routePlanner.roads);return routePlanner;
  }).catch(()=>null);
  const b=city.bounds;camera.position.set((b.minX+b.maxX)/2-14000,44000,(b.minZ+b.maxZ)/2+32000);
  navigation=createCityNavigation({canvas,camera,input,bounds:city.bounds,heightAt:terrainHeight,onTravel:travel,onDestinationSelected:focusCityDestination,getPresets:cityPresets,searchLocal:findLocally});
  window.nycGame={graphics:gfx,get playerBody(){return playerBody;},enter:front=>goIn(front),get streetscape(){return streetscape;},get streetLife(){return streetLife;},get parkedCars(){return parkedCars;},get distantTraffic(){return distantTraffic;},get world(){return world;},get simulation(){return sim;},get signs(){return signs;},get crowd(){return crowd;},get props(){return props;},get places(){return placeSource;},get storefronts(){return storefronts;},get fronts(){return fronts;},get phone(){return phone;},get fleet(){return fleet;},get subway(){return subway;},get buses(){return buses;},get sheds(){return sheds;},get dining(){return dining;},get standMesh(){return standMesh;},get aloft(){return aloft;},get viewHeight(){return viewHeight;},get trash(){return trashMesh;},get weekday(){return weekday;},set weekday(day){weekday=((day%7)+7)%7;},get map(){return gameMap;},findLocally,get bikeShare(){return bikeShare;},get bikeDocks(){return bikeDocks;},get diningMesh(){return diningMesh;},get shedMesh(){return shedMesh;},get busStops(){return busStops;},get demographics(){return demographics;},get subwayStairs(){return subwayStairs;},get cityLife(){return cityLife;},heightAt:(x,z)=>terrainHeight(x,z),travel:place=>travel(place),get streetDetail(){return streetDetail;},get landscape(){return landscape;},get centralPark(){return centralPark;},setView:view=>{viewOverride=view&&Array.isArray(view.position)&&Array.isArray(view.target)?view:null;},getState:()=>({time:gfx.clock,switching:switchShot.active,player:{...sim.player},heat:sim.heat,health:sim.health,mission:{...sim.mission},cash:sim.cash,deliveries:sim.deliveries,cars:sim.cars.length,parkedCars:sim.cars.filter(car=>car._kerb).length,buildings:buildings.length,totalBuildings:cityIndex.stats.buildingFeatures,stream:world.getStatus(),ground:ground.getStatus(),streetDetail:streetDetail?.getStatus()||null,streetscape:streetscape?.getStatus()||null,landscape:landscape?.getStatus()||null,reconstruction:reconstructionReview?{model:reconstructionReview.model,summary:reconstructionReview.summary}:null,roadReconstruction:roadReconstructionReview?{model:roadReconstructionReview.model,summary:roadReconstructionReview.summary}:null,roadPilot:roadPilot?roadPilot.getStatus():{ready:false,loading:Boolean(roadPilotLoading),error:roadPilotError},navigation:navigation.getState(),map:gameMap.getState(),routeGuidance,cityView,aerialView,firstPersonView:firstPersonActive(),traveling,bootReady,shadows:{enabled:shadowsEnabled,active:renderer.shadowMap.enabled},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,started,paused})};
  requestAnimationFrame(frame);
  const [roads]=await Promise.all([roadStream.loadAround(seed.spawn),world.prepareAt(seed.spawn,300),landscapeReady]);
  sim.setActiveCity({roads,buildings,isReadyAt:(x,z,radius,y)=>world.isReadyAt(x,z,radius,Number.isFinite(y)?y-terrainHeight(x,z):0),missionPoints:destinationsFor(roads,seed.spawn)},{spawn:seed.spawn});city=sim.city;yaw=sim.player.angle;
  bootReady=true;
  $('start-button').disabled=false;$('load-text').textContent='Explore New York';
}
restoreDisplaySettings();
boot().catch(error=>{
  console.error(error);$('load-text').textContent='Unable to start';$('load-error').hidden=false;
  $('load-error').textContent=error.message.includes('WebGL')?'This game needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.':error.message;
});
