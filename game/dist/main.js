import { createATM } from './atm.js';
import { createSportsCourts, addCourtPlaces } from './sports-courts.js';
import { interactWithTrip, tripAction, courierBag } from './driver-work.js';
import { renderStats, performanceName } from './vehicle-stats.js';
import { availableCents, formatMoney, payFor, purchaseLimit } from './money.js';
import { createDoorDebris, hasAlteredGlazing, vehicleShotContacts } from './vehicle-detail.js';
import { PANEL, strikeVehicleGlass } from './vehicle-damage.js';
import { updateChaseHeight } from './vehicle-presentation.js';
import { cabinSeatPoint, placeDriverCamera } from './driver-cabin.js';
import { createSwitchShot, LEVELS, levelsFor, ceilingFor, groundReach, SHOT_FOV, DRIFT } from './switch-shot.js';
import { detailView, viewFromAbove } from './detail-view.js';
import { createPickerFlight } from './picker-flight.js';
import { createTileStore } from './tile-store.js';
import * as THREE from './vendor/three.module.min.js';
import { createCar, createParkedCars, createDistantTraffic, createPerson, updateCarVisuals, setVehicleLamps } from './world.js';
import { plateFor } from './license-plates.js';
import { Simulation, TRAFFIC_SIGHT } from './simulation.js';
import { createPoliceScene } from './police-scene.js';
import { shared } from './gfx-common.js';
import { createCarSmoke } from './car-smoke.js';
import { GUN, carTop, setCarShell } from './player-moves.js';
import { shotObstruction, traceShopShot } from './weapon-aim.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { CityAudio } from './audio.js';
import { lots, lotsReady, createCityStream } from './city-stream.js';
import { createCityGround, worldToGeographic, atlasZoomFor } from './city-ground.js';
import { createStreetDetail } from './street-detail.js';
import { Landscape } from './landscape.js';
import { createCentralPark } from './central-park.js';
import { createStatueOfLiberty, STATUE } from './liberty.js';
import { RoadPilot } from './road-pilot.js';
import { createRoadStream, nearestStreet, localDestinations } from './road-stream.js';
import { createCityNavigation } from './city-navigation.js';
import { GameMap } from './game-map.js';
import { createRoutePlanner } from './route-planner.js';
import { createStreetIndex, createPlaceIndex, matchPresets, searchLocal, title } from './local-search.js';
import { createPlaceLayer } from './map-places.js';
import { createGraphics } from './gfx.js';
import { createStreetscape } from './streetscape.js';
import { createCityBirds } from './city-birds.js';
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
import { foodPreviewOptions,openFoodCounter,openInventory,counterInReach } from './food-counter.js';
import { stepCounterOrder } from './facility-visits.js';
import { promptTableService, waitsTables } from './table-service.js';
import { diningTable } from './shopping.js';
import { browseShop, changeClothes } from './shop-preview.js';
import { createStreetLitter } from './street-litter.js';
import { createStreetScans } from './street-scans.js';
import { fittedLook, ownedWearables, wearing } from './shop-stock.js';
import { loadPerson, savePerson } from './human-designs.js';
import { fitFallPose } from './fall-pose.js';
import { createMotion, createAnimator, fitPose, gripOffsetFor } from './body-motion.js';
import { writeMovements } from './body-moves.js';
import { createFigures } from './people-figures.js';
import { castWalkStyle, patrolAppearance } from './human-cast.js';
import { carriedItems,createFoodHand } from './carried-items.js';
import { createStreetProps } from './street-props.js';
import { createPlaceSource, placeName, isOpen, setOpeningHours, joinPlaceSources, indexFootprints, solveFrontages } from './places.js';
import { roomPoint, roomLocal, crossesFixture, roomRayDistance, roomUnderFire } from './room.js';
import { seatApproach, seatEyeOffset, seatHeight } from './seating.js';
import { beginRegisterTake, updateClerk, registerAction } from './register.js';
import { fleeShop, inviteCustomer, populateShop, roomOccupantHit } from './shop-life.js';
import { createStorefronts } from './storefronts.js';
import { warmStreetModel } from './street-talk.js';
import { Work } from './work.js';
import { createInteraction } from './interaction.js';
import { CityRides, PhoneBank } from './phone-services.js';
import { setHandSource } from './view-hand.js';
import { fingerPose, pinchOffset } from './hand-poses.js';
import { createPhoneHand } from './phone-hand.js';
import { createPhone, describePlace } from './phone.js';
import { createPhoneLens } from './phone-camera.js';
import { createFleet, vehicleName } from './fleet.js';
import { vehicleTravelSpeed } from './vehicle-dynamics.js';
import { createVehicleMeshLibrary } from './vehicle-assets.js';
import { designFor } from './vehicle-designs.js';
import { offersAt, shopRows, vehicleHandling } from './garage.js';
import { planRoom, roomKind, hasRoom } from './interiors.js';
import { doorBlips } from './map-blips.js';
import { createDemographics } from './demographics.js';
import { createTransitNetwork, busJourney } from './transit-network.js';
import { clockTime } from './subway-service.js';
import { createBuses, createBusStops } from './bus.js';
import { createSheds, planSheds, createShedMesh } from './sheds.js';
import { createDining, planDining, createDiningMesh, seatsOf } from './dining.js';
import { planStands, vendorOf, createStandMesh } from './stands.js';
import { createCollection, planTrash, createTrashMesh } from './trash.js';
import { aboveTheStreet } from './aloft.js';
import { fitCyclist, PEDAL_PERIOD } from './cycling.js';
import { indexBikeLanes, createLaneMarkings, bikeLaneParking } from './bike-lanes.js';
import { createBikeTraffic } from './bike-traffic.js';
import { createSkateboard } from './skateboard.js';
import { createBikeShare, planBikeDocks, createBikeDocks } from './bikes.js';
import { menuFor } from './menu.js';
import { createSubway, createSubwayEntrances, SUBWAY_LAYER, FARE } from './subway.js';
import { indexKerbs, snapToKerb } from './street-props.js';
import { formatDistance } from './phone.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const angleDifference = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SAVE_KEY = 'nyc-after-hours-v1';
const DISPLAY_KEY = 'nyc-after-hours-display-v1';
let sim, city, renderer, scene, camera, world, hud, avatar, marker, markerDiamond, navigation, gfx, policeScene;
let started=false, paused=false, highQuality=false, farCamera=false, aerialView=false, aerialTracking=false, savedEarnings='';
let shadowsEnabled=true;
let cityIndex, roadIndex, roadStream, ground, streetDetail, bootReady=false, traveling=false;
let viewOverride=null;
// The satellite shot that carries the view from one place to the next (switch-shot.js).
const switchShot=createSwitchShot();let switchShotLive=false;
// The spawn picker's map travelling from one chosen place to the next (picker-flight.js).
const pickerFlight=createPickerFlight();
// What an arrival looks down on. Each picture of the descent has its buildings at the level of detail that height
// shows (buildingView), and the ground is photographed at the zoom each height wants (arrivalZooms, coarsest first).
// All of it is fetched before the camera moves: see prepareDescent and arrivalSettled.
let arrivalZooms=[], arrivalHeld=false;
// Whether frames are running freely: none much longer than this machine's usual for half a second. A place being built stalls them.
const frameCalm={quiet:0,usual:1/60,get calm(){return this.quiet>=.5;},
  note(seconds){
    if(seconds>Math.max(.05,this.usual*2.2))this.quiet=0;else this.quiet+=seconds;
    // The usual frame is learned from every frame, a stall counting for no more than a slow one.
    this.usual+=(Math.min(seconds,this.usual*2.2,.25)-this.usual)*.06;
  }};
// The opening is shown whole. The city is fetched and built behind a veil, and the picture fades up once the
// skyline is all there and frames are running freely: nobody watches it being assembled. It never waits for ever.
// What only the street needs (routes, bicycle lanes, trains and buses, the cast of people) is fetched once the city itself
// is up: before that it would only take the page's attention from the buildings and ground the title is waiting for.
let cityUp;const afterCityUp=new Promise(resolve=>{cityUp=resolve;});
let openingVeiled=false, openingSince=0;
function veilOpening(){openingVeiled=true;openingSince=0;canvas.style.opacity='0';}
function showOpening(now){
  openingSince||=now;
  climbStartup(now);
  if(!bootReady)return;
  const whole=frameCalm.calm&&!world.getStatus().loading&&!ground.getStatus().loading;
  if(!started&&!whole&&now-openingSince<20000)return;
  openingVeiled=false;canvas.style.transition='opacity 1.2s ease-out';canvas.style.opacity='1';
  $('startup-art').classList.add('is-leaving');
  // Loading ends here, with the city coming up out of the black: the bar fills as it does, and only then is the way in offered.
  startupPhase(1,'City ready');$('startup-progress').value=1;
  setTimeout(()=>{$('startup-loading').hidden=true;$('start-button').hidden=false;},450);
  // The fade done, the canvas goes back to the stylesheet's own transitions.
  setTimeout(()=>{canvas.style.transition='';canvas.style.opacity='';$('startup-art').hidden=true;},1300);
}
/** The heights the shot hangs at on a journey that climbs to `ceiling`, highest first: each step as it arrives there and as it leaves. */
const shotHeights=ceiling=>LEVELS.filter(level=>level*1.02<=ceiling).reverse().flatMap(level=>[level*(1+DRIFT),level*(1-DRIFT)]);
/** The picture the shot has looking straight down on `place` from `height`, for choosing the buildings' level of detail (detail-view.js). */
const shotView=(place,height)=>viewFromAbove(place,height,SHOT_FOV,camera.aspect,renderer.domElement?.clientHeight);
/** Fetch what the shot will show on its way down to `target`, and on its way up from `leaving` if there is such a place. */
function prepareDescent(target,leaving){
  const ceiling=leaving?Math.max(switchShot.ceiling,ceilingFor(levelsFor(Math.hypot(target.x-leaving.x,target.z-leaving.z)))):ceilingFor(LEVELS.length);
  arrivalZooms=[...new Set(LEVELS.filter(level=>level*1.02<=ceiling).map(level=>atlasZoomFor(level*1.06)).concat(atlasZoomFor(0)))].sort((a,b)=>a-b);
  arrivalHeld=true;
  if(leaving){
    ground.prepare(leaving,arrivalZooms);
    // The pictures of the climb are asked for at once: it hangs a step lower for the highest of them (climbReady).
    world.prepareViews(shotHeights(ceiling).map(height=>({focus:leaving,altitude:height,view:shotView(leaving,height)}))).catch(()=>null);
  }
  // The buildings each picture of the descent needs at the level of detail it will be drawn in, the highest first, and then the street the player lands on.
  const views=shotHeights(ceiling).map(height=>({focus:target,altitude:height,view:shotView(target,height)})).concat({focus:target,altitude:0,view:null});
  const ready=Promise.all([world.prepareViews(views),ground.prepare(target,arrivalZooms)]);
  // Worth waiting for, but an arrival is never held up for good by a slow server.
  return Promise.race([ready,new Promise(resolve=>setTimeout(resolve,15000))]).catch(()=>null);
}
/** Whether the step a climb is about to pull back to has its picture: the buildings at that height's level of detail, and the ground. */
function climbReady(){
  const height=switchShot.climbingTo,over=switchShot.over;
  if(!height||!over)return true;
  const zoom=arrivalZooms.filter(each=>each<=atlasZoomFor(height)).at(-1)??arrivalZooms[0];
  return world.viewsReady([{focus:over,altitude:height,view:shotView(over,height)}])&&(zoom===undefined||ground.has(over,zoom));
}
/** Whether the place the player has been put down in is built: nothing still loading, and frames running freely. */
function arrivalSettled(){
  if(traveling||!frameCalm.calm)return false;
  return !(world.getStatus().loading||ground.getStatus().loading||streetDetail?.getStatus().loading||streetscape?.getStatus().loading||landscape?.getStatus().loading);
}
/**
 * The picture the buildings are chosen for (detail-view.js), or null on the street, where distance decides.
 * The camera's own, except while the shot is on its steps: there it is the picture of the step it is at or
 * leaving, the one that was fetched for it, so that a fast move between two steps asks for nothing new.
 */
function buildingView(){
  const tall=renderer.domElement?.clientHeight;
  if(switchShot.active&&switchShot.stage!=='land'){
    const over=switchShot.over,step=shotHeights(switchShot.ceiling).filter(height=>height>=viewHeight*.9).at(-1);
    if(over&&step&&Math.hypot(camera.position.x-over.x,camera.position.z-over.z)<step*.25)return shotView(over,step);
  }
  camera.updateMatrixWorld();
  // The shot's camera does not turn until it lands, so nothing outside its picture is drawn for it.
  return detailView(camera.matrixWorld.elements,camera.fov,camera.aspect,camera.position.y-viewHeight,tall,switchShot.active&&switchShot.stage!=='land');
}
// What can be made out from the height the shot hangs at: the city's own shapes, its ground and its water. Everything
// else in the scene is the size of a street's furniture: people, cars, signs, shop fronts.
const CITY_SCALE=new Set(['Streamed official NYC survey','Measured NYC landscape reconstruction','Park trees','Surveyed waterfront','Harbor and river water',
  'NYC 2024 aerial imagery','Sky','Statue of Liberty','NYC mapped street surfaces','Street surfaces','NYC DOT bike lanes','City transport']);
/** Whether the shot is too high over the street for anything of a street's size to show: a person is under three pixels. */
const shotIsHigh=()=>switchShot.active&&viewHeight>700;
/**
 * Leave the street's own things out of this frame, and give back the ones that were hidden so that they can be shown again
 * after it. They are a third of the picture's cost from where none of them can be seen. One frame in sixteen draws them all
 * the same: what is new among them is then sent to the graphics card while the camera waits, not on its way down.
 */
function hideStreetScale(){
  if(gfx.frame%16===0)return null;
  const hidden=[];
  for(const thing of scene.children)if(thing.visible&&!thing.isLight&&!CITY_SCALE.has(thing.name)&&(thing.isMesh||thing.isGroup||thing.isPoints||thing.isLine||thing.isSprite)&&thing!==avatar){thing.visible=false;hidden.push(thing);}
  return hidden;
}
/** The zoom to paint the ground at for the shot's camera: the sharpest fetched one that still covers the picture. */
function arrivalZoom(over){
  const best=atlasZoomFor(viewHeight),ready=arrivalZooms.filter(zoom=>ground.has(over,zoom));
  return ready.filter(zoom=>zoom<=best).at(-1)??ready[0];
}
// The place last chosen on the picker's map, `{x, z}`, and the height below which the map shows it from sharper photographs.
let cityPicked=null;const PICKER_SHARP=14000;
let cityView=false, cityZoom=1, cityOrbit=0, cityFocus=null, roadCell='', roadEpoch=0, roadBusy=false, buildings=[], boroughs=[];
let streetscape=null, streetLife=null, cityBirds=null, water=null, parkedCars=null, distantTraffic=null, signs=null, crowd=null, props=null, cityLife=createCityLife(null), lifeTimer=0;
const noStreetFurniture=[], crowdAhead=new THREE.Vector3();
let cameraFlashing=false;
let transportScene;
// What is at each address (places.js), and the street fronts of those near the player.
let placeSource=null, storefronts=null, footprints=indexFootprints([]), fronts=[], frontsFor=null, placeTimer=0;
// The doors that can be walked through near the player, as the radar and the map mark them: fronts with a room behind them, and the subway's stairs.
let doors=[], doorsFor=null;
// The phone, and where a delivery can be sent: the streets around, and the places with a street front.
const phoneBank=new PhoneBank();
let cityRides=null, phoneHand=null, phoneLens=null;
const lensEye=new THREE.Vector3();
const phonePalm=new THREE.Vector3(), phoneTarget=new THREE.Vector3();
let atmTerminal=null, phone=null, interaction=null, work=null, roadDestinations=[], placeDestinations=[], shopHere=null;
// The front the player is standing at if it has a room to go into, and the room they are in.
// The player and shop staff as the crowd's modelled figures, once those have loaded: where in their stride the player is.
let playerStride=0, strideClock=0;
// The player's own body (grown from the design saved by the character page), what moves it, and the street's figures.
let sessionAppearance=null;
let playerBody=null, playerDesign='', animator=null, moves=null, figures=null, bodyShop=null;
let gunSeen=0, brandished=-99;
let foodHand=null;
let doorDebris=null, carSmoke=null, playerGun=null, gunWatch=0, endingShown=null;
const smoking=[], struckSeen=new WeakMap(), blastSeen=new WeakMap();
const playerSeen={swing:0,move:null,grounded:true,vy:0,fired:0,reloading:0}, playerFitted={q:[],pelvis:[0,0,0]};
let playerItems=null;
const officerModels=new Map(), uniformBuilds=new Map();
const driverSeat=new THREE.Vector3(), hipAt=new THREE.Vector3();
function driverAppearance(car){
  if(car.type==='police' && car.driverAppearance?.unit!==(car.unit || 'patrol'))
    return car.driverAppearance=patrolAppearance(car.id,0,car.unit);
  if(car.driverAppearance) return car.driverAppearance;
  let seed=17;
  for(const c of String(car.id)) seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  const look=dress('office',seeded(seed));
  if(car.rideDriver)look.member=car.rideDriver.member;
  return car.driverAppearance=look;
}
const PLAYER_LOOK={top:0xd7774e,bottom:0x1c1d22,skin:0xb98563,hair:0x14110f,kit:0,height:1.76};
let doorHere=null, roomGroup=null, counterHere=false;
const ROOM_LAYER=1;
const HANDHELD_LAYER=2;
const roomSightline=new THREE.Ray(),roomBounds=new THREE.Box3(),roomHit=new THREE.Vector3();
// The subway: its stations, the stair entrances drawn nearby, the one the player is standing at, and the kerbs they line up with.
// Who lives where (demographics.js): one even range of faces until the survey has loaded.
let demographics=createDemographics(null);
// The buses: their stops, those drawn nearby, and the one the player is waiting at.
let buses=null, busStops=null, stopHere=null;
let transitNetwork=null, transitRequest=null, busTimesRequest=null, busRide=null;
const loadData=async file=>{const response=await fetch('./'+file,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('The city data could not load. Reload to try again.');return response.json();};
function loadTransitNetwork(){
  if(!transitRequest)transitRequest=loadData('transit-network.json').then(data=>{
    transitNetwork=createTransitNetwork(data);
    buses=createBuses(transitNetwork.busData);
    return transitNetwork;
  }).catch(error=>{transitRequest=null;throw error;});
  return transitRequest;
}

function loadBusTimes(){
  if(!busTimesRequest)busTimesRequest=loadData('bus-timetable.json').then(data=>{
    if(data.week!==transitNetwork.week||data.profiles.length!==transitNetwork.patterns.length)throw new Error('Timetable version mismatch');
    return data;
  }).catch(error=>{busTimesRequest=null;throw error;});
  return busTimesRequest;
}

async function openBusDepartures(pole){
  const available=()=>!mapOpen&&!paused&&!traveling&&!busRide&&!sim.room&&sim.player.mode==='walk'&&Math.hypot(sim.player.x-pole.x,sim.player.z-pole.z)<3;
  try{
    const network=await loadTransitNetwork(),times=await loadBusTimes();
    if(!available())return;
    const stop=network.stops[pole.stop.networkIndex]||network.nearby(pole.stop,20).find(s=>s.id.startsWith('bus:')&&s.name===pole.stop.name);
    if(!stop){announce('No scheduled service at this stop.');return;}
    const now=weekday*86400+gfx.hours*3600,plan=gameMap.transit.trip?.legs[0];
    const rows=network.departures(stop,now,times).map(service=>{
      const {pattern,time}=service,days=Math.floor(time/86400)-Math.floor(now/86400);
      return {service,name:pattern.line.name+' toward '+pattern.head,note:clockTime(time)+(days?' · '+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][Math.floor(time/86400)%7]:'')+' · next '+network.stops[pattern.stops[service.k+1]].name};
    });
    interaction.openList(stop.name,rows,({service})=>{
      const p=service.pattern,choices=[];
      for(let i=service.k+1;i<p.stops.length;i++)if(!p.noExit.has(i)){
        choices.push({i,name:network.stops[p.stops[i]].name,note:clockTime(service.base+service.offsets[i])+' · '+(i-service.k)+' stops'});
      }
      interaction.openList(p.line.name+' toward '+p.head,choices,({i})=>{
        const journey=busJourney(network,service,i);
        busRide={journey,clock:journey.time,paint:0,arriving:false};
        gameMap.transit.setNetwork(network);
        gameMap.transit.startRide(journey,finishBusRide);
      },{available,message:'Choose where to get off.',index:choices.findIndex(c=>p.stops[c.i]===plan?.to.index)});
    },{available,cash:sim.cash,message:rows.length?'Choose a departure · $'+FARE.toFixed(2):'No departures from this stop.',index:rows.findIndex(r=>r.service.pattern===plan?.pattern)});
  }catch{if(available())announce('The bus timetable could not load. Press E to retry.');}
}

async function finishBusRide(){
  const ride=busRide;
  if(!ride||ride.arriving)return;
  ride.arriving=true;
  const {journey}=ride,stop=journey.destination;
  const arrived=await travel({x:stop.x,z:stop.z,name:stop.name,exact:true,busExit:true});
  busRide=null;gameMap.setPlayer(sim.player);gameMap.transit.endRide();gameMap.setOpen(false);
  if(!arrived){announce('Could not load the destination. You are still at the boarding stop.');return;}
  if(sim.cash<FARE)sim.offence('fare');else sim.cash-=FARE;
  gfx.setHours((journey.arrival%86400)/3600);weekday=Math.floor(journey.arrival/86400)%7;clockWas=gfx.hours;
  saveProgress('Bus ride');announce(journey.pattern.line.name+' · '+stop.name+' · '+clockTime(journey.arrival));
}

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
let bikeWheel=0,bikePedal=0;
let boardMesh=null, bikeLanes=null, bikeTraffic=null, cycleRoutes=null, laneSurfaceRevision=0;
let bikeShare=null, bikeDocks=null, bikeRows=[], borrowedDock=null;
let subwayVisit=null, subwayView=null, previewPortal=null, subway=null, subwayStairs=null, stairHere=null, kerbIndex=null, kerbsFor=null;
// Which cars are registered where (fleet.js): the whole city's mix until the counts by ZIP code have loaded.
let fleet=createFleet(null);
const vehicleMeshes=createVehicleMeshLibrary();
const destinationsFor=(roads,focus)=>{roadDestinations=localDestinations(roads,focus);return [...roadDestinations,...placeDestinations];};
const trafficAhead=new THREE.Vector3();
let landscape=null, landscapeRevision=0, landscapeDirty=false, landscapeManifest=null, reconstructionReview=null, roadReconstructionReview=null, streetManifest=null;
// The opening shot: a slow sweep around the Financial District from the harbor.
const INTRO={x:-420,z:1760,radius:2700,height:150,aim:150,aside:620,bearing:-.82,sweep:.38};
let introTime=0;
let centralPark=null, statue=null, sportsCourts=null, courtData=null;
function loadCourts() {
  courtData ||= loadData('courts.json').then(({ courts }) => {
    sportsCourts = createSportsCourts(courts, { scene, heightAt: groundHeight, physics: sim.streetObjects });
    return courts;
  }).catch(error => {
    courtData = null;
    throw error;
  });
  return courtData;
}
const terrainHeight=(x,z)=>landscape?.sampleHeight(x,z)??0;
// Where actors stand: the bare terrain plus the street surface laid on it.
const groundHeight=(x,z)=>terrainHeight(x,z)+(streetscape?.offsetAt(x,z)||0);
function groundSurface(x,z){
  const surface=landscape?.sampleSurface(x,z),lift=streetscape?.offsetAt(x,z)||0;
  return surface&&lift?{...surface,elevation:surface.elevation+lift}:surface;
}
function waterColumn(x,z,actor) {
  if(!water || water.waterfront.deckAt(x,z))return null;
  // A walker may cross the river on a surveyed deck or inside a tunnel.
  if(actor){
    const options={mode:'walk',referenceHeight:actor.y,transportId:actor.transportId};
    const deck=roadPilot?.sampleSurface(x,z,{...options,kind:'bridge'}) ?? streetDetail?.sampleSurface(x,z,options);
    if(deck && Math.abs(deck.elevation-actor.y)<1.2)return null;
  }
  if(water.isTidal(x,z))return {level:WATER_LEVEL,bed:water.waterfront.bed(x,z),tidal:true};
  const pond=landscape?.waterAt(x,z);
  if(!pond)return null;
  const bed=terrainHeight(x,z);
  return {level:Number.isFinite(pond.elevation)?pond.elevation+.04:bed+.07,bed};
}
function audibleShore(player) {
  if(!water)return 0;
  for(const distance of [22,65])for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,x=player.x+Math.cos(angle)*distance,z=player.z+Math.sin(angle)*distance;
    if(water.isTidal(x,z)||landscape?.waterAt(x,z))return distance===22?1:.4;
  }
  return 0;
}
function streetSurface(x,z,options) {
  const walking=options?.mode==='walk';
  const deck=roadPilot?.sampleSurface(x,z,{...options,kind:'bridge'}) ?? streetDetail?.sampleSurface(x,z,options)
    ?? (walking ? subwayStairs?.surfaceAt(x,z) : null);
  if(deck)return deck;
  const pier=water?.waterfront.deckAt(x,z);
  if(pier)return {elevation:pier.y+.035,normal:{x:0,y:1,z:0},kind:'pier'};
  const ground=roadPilot?.sampleSurface(x,z,{...options,kind:'ground'}) ?? groundSurface(x,z);
  const redStep=walking ? world?.timesSquare?.stepAt(x,z) : null;
  if(redStep!=null)return {elevation:redStep,normal:{x:0,y:1,z:0},kind:'plaza-step'};
  const step=walking ? storefronts?.stepHeightAt(x,z,options.referenceHeight) : null;
  return step!=null && step>=(ground?.elevation??-Infinity)
    ? {elevation:step,normal:{x:0,y:1,z:0},kind:'shop-step'} : ground;
}
function audibleFooting(person) {
  if (streetscape?.surfaceAt(person.x, person.z) === 'road' || person.y > terrainHeight(person.x,person.z) + 2.2) return 'hard';
  for (const park of centralPark?.parks || []) {
    const material = park.footingAt(person);
    if (material) return material;
  }
  return 'hard';
}
let roadPilot=null, roadPilotIndex=null, roadPilotLoading=null, roadPilotError=null, roadPilotRetryAt=0;
// Public streets near the sights, in the bundled NYC road index's local meters.
const landmarkArrivals=[
  {name:'Empire State Building',borough:'Manhattan',x:1312,z:-2741},
  {name:'Grand Central Terminal',borough:'Manhattan',x:1992,z:-3154},
  {name:'Rockefeller Center',borough:'Manhattan',x:1890,z:-3893},
  {name:'Coney Island',borough:'Brooklyn',x:1700,z:16400,keywords:'boardwalk luna park'},
  {name:'Yankee Stadium',borough:'Bronx',x:6405,z:-11687},
  {name:'Flushing Meadows–Corona Park',borough:'Queens',x:13014,z:-2443,keywords:'unisphere'},
];
const featuredDestinations=[
  'Midtown / Times Square','Central Park','Statue of Liberty','Empire State Building','Brooklyn Bridge approaches',
  'Grand Central Terminal','Rockefeller Center','SoHo','DUMBO','Coney Island','Prospect Park',
  'Yankee Stadium','Flushing Meadows–Corona Park','St. George',
];
function cityPresets(){
  const parks=landscape?.getStatus().baseReady?landscapeManifest.regions:[];
  const streets=streetManifest?.coverageRegions.filter(region=>region.view)||[];
  const places=[
    ...roadIndex.places,
    ...landmarkArrivals,
    ...BOARDINGS.map(transportDestination),
    ...parks.flatMap(region=>[{...region.view,name:region.name,borough:region.borough},...(region.presets||[])]),
    {...STATUE.arrival,name:'Statue of Liberty',borough:'Manhattan',exact:true},
    ...streets.map(region=>({...region.view,name:region.exploreName||region.name,borough:region.borough})),
  ];
  if(roadPilotIndex&&landscape?.getStatus().baseReady){
    places.push({...roadPilotIndex.spawn,name:roadPilotIndex.name,borough:'Queens',exact:true,roadPilot:true});
  }
  return places;
}
function defaultCityPresets(){
  const places=cityPresets();
  const byName=new Map(places.map(place=>[place.name,place]));
  const featured=featuredDestinations.map(name=>byName.get(name)).filter(Boolean);
  return [...featured,...places.filter(place=>!featuredDestinations.includes(place.name))];
}
let chaseHeight=null, chaseEyeOffset=null;
let seatedEyeStart=null;
let firstPerson=false, headAnchor, headTurn=0, headPitch=0, snapChase=false, ownBody=false;
let shoulderActive=false, shoulderPitch=0, shoulderFocus=0, fireRequested=false;
let shoulderCamera=false, shoulderBlend=null, eyeFocus=0;
const eyeGoal=new THREE.Vector3();
const eyeRotation=new THREE.Quaternion();
let gameMap, mapOpen=false, routePlanner=null, plannerReady=null, activeRoute=null, routeDestination=null, routeGuidance=null, routeEpoch=0, rerouteAt=0;
let sampledSeconds=0, sampledFrames=0, recentFrameMs=0;
let yaw=0, pitch=.38, lookIdle=0, elapsed=0, lastFrame=0, hudTime=0, qualityTimer=0, slowSeconds=0;
const carModels = new Map(), distantCars=[];
// Cars are drawn as far as the simulation keeps traffic in sight. Traffic
// nearer than MODEL_RANGE gets a model of its own and keeps it out to
// MODEL_KEPT, so that none flickers between the two at the boundary.
const CAR_SIGHT=TRAFFIC_SIGHT, MODEL_RANGE=42, MODEL_KEPT=52;
const audio = new CityAudio();
const CITY_SOUND_KEY='nyc.city-sound';
const INTERFACE_SOUND_KEY='nyc.interface-sounds';
let citySoundWanted=true;
try{citySoundWanted=localStorage.getItem(CITY_SOUND_KEY)!=='off';}catch{}
try{audio.interfaceEnabled=localStorage.getItem(INTERFACE_SOUND_KEY)!=='off';}catch{}
const interfaceAreas='#intro, #pause-dialog, #sources-dialog, #city-navigation, #game-map, #interaction, #road-pilot-controls, #map-button';
const interfaceControls='button, a[href], select, input:not([type="hidden"]), textarea';
function interfaceControl(target){
  const control=target?.closest?.(interfaceControls);
  if(control?.closest(interfaceAreas) && !control.closest(':disabled, [aria-disabled="true"], [hidden], [inert]'))return control;
}
let pointerNavigation=false;
document.addEventListener('pointerdown',()=>{pointerNavigation=true;},true);
document.addEventListener('keydown',()=>{pointerNavigation=false;},true);
document.addEventListener('pointerover',event=>{
  if(event.pointerType==='touch' || event.buttons)return;
  const control=interfaceControl(event.target);
  if(control && !control.contains(event.relatedTarget))audio.interfaceCue('select');
});
document.addEventListener('focusin',event=>{
  if(!pointerNavigation && interfaceControl(event.target))audio.interfaceCue('select');
});
document.addEventListener('click',event=>{
  const control=interfaceControl(event.target);
  if(control && control.id!=='interface-sound-button' && control.matches('button, a[href]'))audio.interfaceCue('confirm');
},true);
document.addEventListener('change',event=>{
  if(interfaceControl(event.target)?.matches('select'))audio.interfaceCue('confirm');
},true);
const canvas=$('world');
function interfaceKey(event){
  if(atmTerminal?.active)return atmTerminal.key(event);
  if(interaction?.open && event.code==='KeyM' && event.target?.id!=='street-line'){
    if(!event.repeat)interaction.close();
    return true;
  }
  if(interaction?.open && phone?.open && $('phone').contains(document.activeElement))return phone.handleKey(event);
  return interaction?.handleKey(event) || phone?.handleKey(event);
}
const input=new Input(canvas, action, interfaceKey, weaponControls, index=>{
  pointerNavigation=false;
  if($('pause-dialog').open)return pausePad(index);
  if(atmTerminal?.active)return atmTerminal.pad(index);
  if(input.ps5 && index===9 && (phone?.open || interaction?.open || mapOpen)){
    phone?.setOpen(false);interaction?.close();if(mapOpen)gameMap.setOpen(false);
    action('pause');return true;
  }
  if(input.ps5 && index===input.psControls.mapButton){action('map');return true;}
  if(mapOpen && (index===8 || index===17)){action('map');return true;}
  if (mapOpen && (index === 14 || index === 15)) {
    if(gameMap.key.stepTarget(index === 14 ? -1 : 1))audio.interfaceCue('select');
    return true;
  }
  if(interaction?.open){
    if(index===8){interaction.close();return true;}
    const key=({0:'Enter',1:'Escape',12:'ArrowUp',13:'ArrowDown'})[index];
    if(key)interaction.handleKey({key,preventDefault(){}});
    return true;
  }
  if(!input.ps5 && index===15 && sim?.player.mode==='drive' && (tripAction(sim) || sim.canDropPaper())){action('interact',{fromPad:true});return true;}
  if(index===15 && sim?.player.mode==='passenger'){action('driverSpeed');return true;}
  if(phone?.open){
    if(index===11){action('interact');return true;}
    if(index===3){action(input.ps5?'psInteract':sim.room?'shop':'vehicle',{fromPad:true});return true;}
    return phone.handlePad(index);
  }
  if(cityView && !mapOpen && navigation?.handlePad(index))return true;
  if(!input.ps5 && index===15 && streetControls() && !interactionPrompt() && (standHere || shopHere || sim?.room)){action('shop');return true;}
  return false;
},()=>streetControls() ? sim.player.mode : 'menu');
const cameraTarget=new THREE.Vector3(), desiredCamera=new THREE.Vector3(), cameraForward=new THREE.Vector3();
let walkingLookBackYaw=null;
function walkingControlYaw(){
  if(walkingLookBackYaw!==null)return walkingLookBackYaw;
  camera.getWorldDirection(cameraForward);
  return Math.atan2(cameraForward.x,cameraForward.z);
}
const aerialTarget=new THREE.Vector3(), aerialOffset=new THREE.Vector3(-95,240,180);
// How far back the aerial camera stands, as a multiple of that offset: 1 is
// the view F6 opens on. The wheel sets the goal and the camera eases to it.
const AERIAL_ZOOM_MIN=.3, AERIAL_ZOOM_MAX=3;
let aerialZoom=1, aerialZoomGoal=1;
const zoomAerial=factor=>{const next=clamp(aerialZoomGoal*factor,AERIAL_ZOOM_MIN,AERIAL_ZOOM_MAX);if(next!==aerialZoomGoal)audio.sceneCue(next<aerialZoomGoal?'zoomIn':'zoomOut',.4);aerialZoomGoal=next;};
const chaseLookAhead=new THREE.Vector3(), desiredLookAhead=new THREE.Vector3();

function announce(text) { if(sim){sim.notice=text;sim.noticeTime=4;} }
function firstPersonActive(){return started&&firstPerson&&!aerialView&&!cityView&&!viewOverride&&!switchShot.active&&!fitting&&!atmTerminal?.active;}
function phoneCameraActive(){return phone?.open && phone.screen==='camera';}
// Trying clothes on in a shop. `tryOnLook` is the design the player's body is drawn with while a piece is being looked
// at (their own with that piece in it), or null. `fitting` is the camera's part in it, `{slot, turn, fresh}`: which part
// of them is being chosen, how far round them the camera has been turned, and whether it has only just come round.
let tryOnLook=null, fitting=null, streetLitter=null, streetScans=null;
// For each part: how high on the body the camera looks (a share of their height), how far back it stands (the same), and
// how much it rises for each metre it stands back.
const FITTING={hair:[.9,.36,.05],top:[.68,.8,.06],bottom:[.32,.95,.08],shoes:[.07,.5,.4],bag:[.6,.85,.06]};
const fittingEye=new THREE.Vector3();
function nearbyATM(){
  const room=sim.room;
  if(room?.style!=='bank' || sim.player.mode!=='walk' || sim.seat || sim.ending)return null;
  const {a,b}=roomLocal(room,sim.player.x,sim.player.z);
  let nearest=null,reach=1.65;
  for(const thing of room.things){
    if(thing.shape!=='branchATM' && thing.shape!=='cashMachine')continue;
    const distance=Math.hypot(a-thing.a,b-thing.b);
    if(distance<reach){nearest=thing;reach=distance;}
  }
  return nearest;
}
/** What the player is standing at in a shop: the changing room, a piece on a rail or a table (its number), or neither. */
function shopSpot(){
  const room=sim.room;
  if(!room?.things)return null;
  const at=roomLocal(room,sim.player.x,sim.player.z);
  let best=null,near=1.35;
  for(const thing of room.things){
    const away=Math.hypot(thing.a-at.a,thing.b-at.b);
    if(thing.shape==='fittingRoom'){if(away<1.9)return {changing:true};continue;}
    const sku=thing.sku??thing.more?.sku;
    if(sku&&away<near){near=away;best={sku};}
  }
  return best;
}
// The clothes a character was made with were never bought, so no shop's list has them. The first time one of them is
// changed for something else it is noted here, by slot, and a changing room offers it back as "What you came with".
const WARDROBE_KEY='nyc-after-hours-wardrobe-v1';
function firstClothes(){try{return JSON.parse(localStorage.getItem(WARDROBE_KEY))||{};}catch{return {};}}
function keepFirstClothes(look,item){
  if(!item.design||!['top','bottom','shoes','bag'].includes(item.slot))return;
  const kept=firstClothes();
  if(kept[item.slot]||ownedWearables(sim).some(other=>other.slot===item.slot&&wearing(look,other)))return;
  kept[item.slot]=Object.fromEntries(Object.keys(item.design).map(key=>[key,look[key]??null]));
  try{localStorage.setItem(WARDROBE_KEY,JSON.stringify(kept));}catch{/* a browser that keeps nothing: they keep what they have on */}
}
/** How far a camera can stand from the player in a room, on the side `view` (radians) looks from, before a wall or a tall fixture would cover it: `most` metres at best. */
function roomStandBack(room,view,height,most){
  const sin=Math.sin(view),cos=Math.cos(view),db=sin*room.nx+cos*room.nz,da=-(sin*room.tx+cos*room.tz)-(room.skew||0)*db;
  const pad=.16,b=Math.max(pad,room.b);
  roomSightline.origin.set(room.a,height,b);roomSightline.direction.set(da,0,db).normalize();
  roomBounds.min.set(-room.width/2+pad,0,pad);roomBounds.max.set(room.width/2-pad,3,room.depth-pad);
  const reach=()=>Math.hypot(roomHit.x-room.a,roomHit.z-b);
  let back=roomSightline.intersectBox(roomBounds,roomHit)?Math.min(most,reach()):0;
  for(const t of room.things){
    if(t.y+t.h<height-pad||t.y>height+pad)continue;
    roomBounds.min.set(t.a-t.w/2-pad,t.y-pad,t.b-t.d/2-pad);roomBounds.max.set(t.a+t.w/2+pad,t.y+t.h+pad,t.b+t.d/2+pad);
    if(roomBounds.containsPoint(roomSightline.origin))return 0;
    if(roomSightline.intersectBox(roomBounds,roomHit))back=Math.min(back,reach());
  }
  return back;
}
/** The camera while something is being tried on: in front of the player, on the part of them being chosen, inside the room. */
function updateFittingCamera(p,dt){
  const room=sim.room,tall=playerBody?.rig.height||PLAYER_LOOK.height||1.76,[at,away,rise]=FITTING[fitting.slot]||FITTING.top;
  const floor=roomGroup?.userData.floorY??p.y??0,height=tall*at+(p.y??floor)-floor,want=tall*away;
  const standBack=turn=>room?roomStandBack(room,p.angle+turn+Math.PI,height,want):want;
  if(fitting.fresh){
    // Straight in front of them if there is room to stand there; otherwise from whichever side has the most.
    let best=0,space=-1;
    for(const turn of [0,.7,-.7,1.4,-1.4,2.2,-2.2,Math.PI]){
      const back=standBack(turn);
      if(back>space+.05){space=back;best=turn;}
      if(back>=want-.02)break;
    }
    fitting.turn=best;
  }
  const view=p.angle+fitting.turn+Math.PI,back=Math.max(.3,standBack(fitting.turn)),sin=Math.sin(view),cos=Math.cos(view);
  fittingEye.set(p.x-sin*back,floor+height+back*rise,p.z-cos*back);
  if(fitting.fresh)camera.position.copy(fittingEye);else camera.position.lerp(fittingEye,1-Math.exp(-dt*8));
  fitting.fresh=false;
  camera.lookAt(p.x,floor+height,p.z);
  // Where it cannot stand as far back as it would like, it takes in the same picture with a wider lens.
  camera.near=.025;camera.fov=clamp(2*Math.atan(Math.tan(22*Math.PI/180)*want/back)*180/Math.PI,44,78);camera.updateProjectionMatrix();
  chaseHeight=null;chaseEyeOffset=null;snapChase=true;
}
function streetTargets(){
  return bikeTraffic ? sim.bystanders.concat(bikeTraffic.riders.filter(r=>!r.abandoned)) : sim.bystanders;
}
function alarmStreet(at,reach,chance,options={}){
  const bystanders=streetTargets().filter(actor=>actor!==at && !actor.crash);
  return crowd?.alarm(at.x,at.z,reach,chance,{y:at.y,time:sim.elapsed,bystanders,...options});
}
function meleeTarget(){
  const p=sim.player, person=crowd?.meleeTarget(p,streetTargets(),sim.elapsed);
  const officer=sim.police.meleeTarget(p.x,p.z,p.angle,p.y);
  if(!officer || (person && Math.hypot(person.x-p.x,person.z-p.z)<Math.hypot(officer.x-p.x,officer.z-p.z)))return person;
  return officer;
}
function resolveMelee(event) {
  const {action,x,y,z,angle,low}=event, kick=event.kind==='kick';
  audio.effect('swing',sim.player,.32,11);
  if (event.vehicleId!=null) {
    if (sim.strikeVehicle(event,5)) audio.effect('roofHit',event,.66,19);
    return;
  }
  const target=action?.point && action.touched!==false ? action.target : null;
  if (target && !sim.player.reaction && !sim.ending) {
    const heavy=kick || action.heavy;
    if (sim.police.strike(x,z,angle,heavy?1.5:1,y,low,target,action.timing.reaction)) {
      audio.effect(heavy?'heavyHit':'bodyHit',target,.62,17);
      alarmStreet(event,8,.75);
      return target;
    }
    const hit=crowd.strike(x,z,angle,{target,power:heavy?2:1,low,clip:event.clip,y,
      momentum:action.momentum,bystanders:streetTargets(),time:sim.elapsed});
    if (hit) {
      audio.effect(heavy?'heavyHit':'bodyHit',hit,.62,17);
      blowLanded(hit);
      return target;
    }
  }
  if (!low && sim.strikeVehicle(event,kick?5:3)) audio.effect('roofHit',event,.55,19);
  else if (!kick) sim._say('You swing at the air.');
}
let grabbedPerson=null, menuGrapple=false, shoulderSide=1;
let lockedPerson=null, queuedStrike=null, wheelSelection=null, wheelOpened=0, wheelChanged=false;
function streetControls(){
  return Boolean(started && bootReady && sim && !paused && !traveling && !cityView && !aerialView && !mapOpen &&
    !subwayVisit && !viewOverride && !switchShot.active && !sim.ending && !atmTerminal?.active && (allowPhone || !phone?.open) && !interaction?.open);
}
function selectWheel(armed){
  wheelSelection=armed;
  $('wheel-fists').setAttribute('aria-pressed',String(!armed));
  $('wheel-pistol').setAttribute('aria-pressed',String(armed));
}
function selectLoadout(armed){
  if(streetControls() && sim.player.mode==='walk' && Boolean(sim.player.armed)!==armed)sim.draw();
}
function meleeFocus(controls){
  const p=sim.player;
  if(!streetControls() || !input.focusing || p.armed || p.mode!=='walk' || sim.room || sim.seat || wheelSelection!==null){
    lockedPerson=null;return;
  }
  const eligible=a=>a && !a.gone && !a.dead && !(a.hp<=0 || a.health<=0 || a.absentUntil>sim.elapsed || a.downUntil>sim.elapsed)
    && Math.abs((a.y??p.y)-p.y)<1.4 && Math.hypot(a.x-p.x,a.z-p.z)<5.5 && sim._hasSight(p,a);
  const actors=[...(crowd?.people||[]),...streetTargets(),...sim.police.officers,...sim.police.fieldOfficers];
  if(!actors.includes(lockedPerson) || !eligible(lockedPerson)){
    lockedPerson=null;
    let best=Infinity;
    camera.getWorldDirection(cameraForward);
    const heading=Math.atan2(cameraForward.x,cameraForward.z);
    for(const a of actors){
      const dx=a.x-p.x,dz=a.z-p.z,d=Math.hypot(dx,dz);
      if(d>4.5 || !d)continue;
      const cosine=(dx*Math.sin(heading)+dz*Math.cos(heading))/d,score=d+2*(1-cosine);
      if(cosine>.25 && score<best && eligible(a)){lockedPerson=a;best=score;}
    }
  }
  if(lockedPerson){
    controls.aimYaw=Math.atan2(lockedPerson.x-p.x,lockedPerson.z-p.z);
    if(!p.move && !p.swing)p.angle=controls.aimYaw;
    p.guard=Math.max(p.guard||0,.15);
    yaw=controls.aimYaw;
  }
}
function weaponControls(){
  return Boolean(!subwayVisit && started && bootReady && sim?.player.armed && sim.player.mode==='walk' && !sim.player.move && !sim.player.reaction && !sim.seat && !sim.doorway?.take && !sim.ending && !paused && !traveling && !cityView && !aerialView && !viewOverride && !switchShot.active && !mapOpen && !atmTerminal?.active && !phone?.open && !interaction?.open);
}
function focusedAim(){return input.aiming && !sim.seat;}
// The pistol is pointed only while it is being aimed, and for a moment around each shot. The rest of the time it is carried
// at the side, and whoever holds it faces the way they are going and walks, jogs and runs as they would without it.
const RAISED_AFTER_SHOT=.8;
function gunRaised(){return focusedAim() || fireRequested || sim.elapsed-(sim.player.firedAt??-Infinity)<RAISED_AFTER_SHOT;}
function updatePerspectiveButton(){
  $('perspective-value').textContent=firstPerson?'FIRST PERSON':'THIRD PERSON';
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
    if(sim.garage(place.kind,row.job,row.color??row.choice))saveProgress(placeName(place));
    openGarage(place,i);
  },{cash:sim.cash,index,available:()=>shopHere===place&&Boolean(sim.vehicle)});
}

function finishSubway(){
  if(!subwayVisit)return;
  subwayVisit.dispose();subwayVisit=null;sim.subway=null;
  subwayStairs.openings.cabinAt(null);previewPortal=null;subwayView.root.visible=false;
  stairHere=null;chaseHeight=null;chaseEyeOffset=null;snapChase=false;
}

function startSubway(entrance){
  if(subwayVisit||!subway?.table.platforms[entrance.stop]||entrance.entry===false)return;
  if(aerialView)setView('street');
  subwayView ||= subway.preview(scene);
  subwayView.root.visible=true;
  sim.doorway=null;
  subwayVisit=subway.visit(entrance,weekday*86400+gfx.hours*3600,{
    $,interaction,sim,view:subwayView,heightAt:groundHeight,
    stairSurface:(x,z)=>subwayStairs.surfaceAt(x,z),
    resolveExit(station,stop){
      if(station===entrance.station && stop===entrance.stop && station.exits?.some(e=>e[0]===entrance.source.x && e[1]===entrance.source.z))return entrance;
      const exits=station.exits||station.entrances;
      const same=exits.filter(e=>e[3]===stop),choices=same.length?same:exits;
      const [x,z,kind,platform]=choices.reduce((a,b)=>Math.hypot(a[0]-station.x,a[1]-station.z)<Math.hypot(b[0]-station.x,b[1]-station.z)?a:b);
      return subwayStairs.portals.find(e=>e.station===station && e.source.x===x && e.source.z===z && e.kind===kind)
        || subwayStairs.resolve({x,z,kind,stop:platform,station},subway);
    },
    turnCamera:delta=>{yaw+=delta;},chime:()=>audio.trainDoors(),pay:()=>saveProgress('Transit fare'),
    exit:()=>{const name=subwayVisit.journey.station.name;finishSubway();announce(name+' · Street exit');}
  });
  sim.subway=subwayVisit;
}

// Detect the open end of the actual street model in the player's direction
// of travel. Crossing sideways on the sidewalk never opens a station.
function enterSubwayOnFoot(controls){
  const p=sim.player;
  if(subwayVisit||!subway||p.mode!=='walk'||p.move||p.reaction||sim.room||sim.seat||sim.ending||interaction?.open)return;
  for(const e of subwayStairs.portals){
    const dx=p.x-e.x,dz=p.z-e.z;
    if(Math.abs(dx)>3||Math.abs(dz)>3||e.entry===false)continue;
    const s=Math.sin(e.angle),c=Math.cos(e.angle),along=dx*s+dz*c;
    if(controls.moveX*s+controls.moveZ*c<.15 || Math.abs(dx*c-dz*s)>.54)continue;
    const stair=e.kind===0;
    if(along<(stair?-2.13:-.18)||along>(stair?2.15:.55))continue;
    const level=subwayStairs.surfaceAt(p.x,p.z)?.elevation??e.y;
    if(Math.abs(p.y-level)<.65){startSubway(e);break;}
  }
}

function action(name,event) {
  if(!sim)return;
  if(atmTerminal?.active){
    if(name==='pause')atmTerminal.close();
    return;
  }
  if(name==='weaponOpen'){
    if(!streetControls() || sim.player.mode!=='walk' || sim.seat || sim.player.reaction || sim.player.move)return false;
    if(wheelSelection===null){
      selectWheel(Boolean(sim.player.armed));wheelOpened=performance.now();wheelChanged=false;
      $('wheel-fists').querySelector('kbd').textContent=event?.fromPad?'←':'1';
      $('wheel-pistol').querySelector('kbd').textContent=event?.fromPad?'→':'6';
      $('weapon-wheel').hidden=false;
    }
    return true;
  }
  if(name==='weaponClose' || name==='weaponCancel'){
    if(wheelSelection!==null && name==='weaponClose')
      selectLoadout(!wheelChanged && performance.now()-wheelOpened<190 ? !sim.player.armed : wheelSelection);
    wheelSelection=null;$('weapon-wheel').hidden=true;return;
  }
  if(wheelSelection!==null){
    if(name==='wheelCycle'){wheelChanged=true;selectWheel(!wheelSelection);}
    else if(['pistol','wheelPistol','unarmed','wheelUnarmed'].includes(name)){wheelChanged=true;selectWheel(name==='pistol'||name==='wheelPistol');}
    else if(name==='pause')action('weaponCancel');
    return;
  }
  if(name==='unarmed' || name==='pistol'){selectLoadout(name==='pistol');return;}
  if(name==='psInteract'){
    if(subwayVisit)name='interact';
    else if(sim.player.mode!=='walk')name='vehicle';
    else {
      const hint=interactionPrompt();
      name=hint?.key==='F'?'vehicle':!hint && (standHere || shopHere || sim.room)?'shop':'interact';
    }
  }
  if(name==='tripInteract'){
    if(tripAction(sim) || sim.canDropPaper())action('interact',event);
    return;
  }
  if(name==='vehicleMenu'){
    if(sim.player.mode==='drive' && streetControls())interaction.openList('Vehicle controls',[
      {name:'Headlights',id:'lights'},{name:'Camera perspective',id:'nextCamera'}],row=>action(row.id));
    return;
  }
  if(name==='interactionMenu'){
    if(interaction?.open){interaction.close();return;}
    if(!streetControls(true))return;
    const entries=[['Map','map'],['Inventory','inventory'],['Nearby interactions','shop'],['Delivery job','job'],['Skateboard','skate'],['Camera perspective','nextCamera'],['City views','view']];
    if(sim.player.mode==='walk' && !phone?.open && !sim.room && !sim.seat){
      if(sim.player.armed)entries.push(['Switch aiming shoulder','shoulder']);
      else if(meleeTarget())entries.push(['Grab nearby pedestrian','grapple']);
    }
    if(sim.player.mode==='drive')entries.splice(1,0,['Vehicle controls','vehicleMenu']);
    interaction.openList('Interaction menu',entries.map(([name,id])=>({name,id})),row=>action(row.id,{fromMenu:true}));
    return;
  }
  if(mapOpen && name==='nextCamera'){action('map');return;}
  if(name==='nextCamera'){
    if(!started || paused || mapOpen || traveling)return;
    if(cityView || aerialView){setView('street');return;}
    if(firstPerson){farCamera=false;switchPerspective();}
    else if(!farCamera)action('camera');
    else switchPerspective();
    return;
  }
  if(name==='lightOrReload')name=sim.player.armed?'reload':'light';
  if(name==='status'){
    if(started&&!paused&&!traveling&&bootReady&&!cityView&&!mapOpen&&!sim.ending)hud.showStatus(sim.cash,sim.health,phoneBank.checking/100);
    return;
  }
  if($('pause-dialog').open&&!$('sources-dialog').open&&(name==='heavy'||name==='interact')){showPauseTab(pauseTab+(name==='interact'?1:-1),true);return;}
  if(interaction?.open){
    if(name==='pause'||name==='shop'||name==='inventory'){interaction.close();return;}
    if(name==='map')interaction.close();
    else if(name!=='phone')return;
  }
  if(busRide)return;
  if(subwayVisit && name==='interact'){
    if(!mapOpen&&!paused&&!traveling)subwayVisit.interact();
    return;
  }
  if(subwayVisit && !['pause','map','perspective','cash','phone','inventory'].includes(name))return;
  if(name==='map') { if(started&&!paused&&!traveling&&bootReady){phone?.setOpen(false);if(subwayVisit&&!mapOpen){gameMap.setPlayer(sim.player);gameMap.transit.setActive(true);}gameMap?.toggle();}return; }
  if(name==='pause'){
    if(!started)return;
    // Escape also dismisses native dialogs by default, including one just opened here.
    event?.preventDefault?.();
    if($('sources-dialog').open)$('sources-dialog').close();
    else if(mapOpen)gameMap.setOpen(false);
    else if(phone?.open)phone.setOpen(false);
    else togglePause();
    return;
  }
  if(name==='shop' && sim.player.mode==='passenger')name='driverSpeed';
  if(name==='shop'&&(!started||paused||traveling||!bootReady||cityView||mapOpen))return;
  if(name==='inventory'){
    if(started && bootReady && !paused && !traveling && !mapOpen && !cityView)openInventory({$,sim,interaction,sale:(place,amount,tender)=>work.sale(place,amount,tender),save:saveProgress});
    return;
  }
  if(name==='shop'&&sim.room) {
    if(openFoodCounter({$,sim,interaction,work,sale:(place,amount,tender)=>work.sale(place,amount,tender),save:saveProgress}))return;
    // Indoors, at the counter: what the place sells.
    const menu=menuFor(sim.room.place);
    const boutique=menu.some(item=>item.sku);
    if(!menu.length)announce('Nothing is sold over the counter here.');
    else if(closedAfterIncident(sim.room.place))announce('This shop is temporarily closed.');
    else if(sim.doorway?.handoff||sim.player.armed)announce('The counter is closed while the clerk is on alert.');
    else if(!boutique&&!atShopCounter())announce('Go up to whoever is serving.');
    else {
      const shop=sim.room.place;
      const available=()=>sim.room?.place===shop && (boutique || atShopCounter()) && !closedAfterIncident(shop) && !sim.doorway?.handoff && !sim.player.armed;
      const order=item=>{
        if(available()&&sim.buy(item,{sale:(place,amount,tender)=>work.sale(place,amount,tender)}))saveProgress(placeName(shop));
      };
      if(boutique) {
        const getLook=()=>sessionAppearance || loadPerson();
        // What the list rests on is worn by the player's own body for as long as it rests there (null puts back their own).
        const tryOn=look=>{tryOnLook=look;dressPlayer();};
        // The camera comes round to the part being chosen; ← and → turn it about them. A slot of null lets the camera go.
        const fit=(slot,turn=0)=>{
          if(!slot)fitting=null;
          else if(fitting){fitting.slot=slot;fitting.turn+=turn*1.4;}
          else fitting={slot,turn:0,fresh:true};
        };
        const putOn=item=>{
          keepFirstClothes(getLook(),item);
          const next=fittedLook(getLook(),item);
          sessionAppearance=savePerson(next)?null:next; dressPlayer();
        };
        // At the changing room it is their own clothes; at a piece on a rail, that piece's section; anywhere else, the whole shop.
        const spot=shopSpot();
        if(spot?.changing)changeClothes({sim,interaction,available,getLook,wear:item=>{putOn(item);saveProgress(placeName(shop));},tryOn,fitting:fit,base:firstClothes});
        else browseShop({$,sim,interaction,title:sim.room.name,menu,available,order,getLook,grow:bodyShop,moves,start:spot?.sku||null,
          tryOn,fitting:fit,applyLook:putOn,sale:(place,price,tender)=>work.sale(place,price,tender),save:()=>saveProgress(placeName(shop))});
      } else {
        const rows=menu.map(item=>({item,name:item.name.toUpperCase(),note:'$'+item.price.toFixed(2)}));
        interaction.openList(sim.room.name,rows,({item})=>order(item),{...foodPreviewOptions($),cash:sim.cash,available});
      }
    }
    return;
  }
  if(name==='shop'&&standHere&&sim.player.mode==='walk'&&!sim.player.armed) {
    // At a stand on the sidewalk: what it sells.
    const place=standHere.place;
    interaction.openList(placeName(place),menuFor(place).map(item=>({item,name:item.name.toUpperCase(),note:'$'+item.price.toFixed(2)})),({item})=>{if(sim.buy(item,{street:true,place}))saveProgress();},{...foodPreviewOptions($),cash:sim.cash,available:()=>standHere?.place===place});
    return;
  }
  if(name==='shop') {
    if(shopHere&&sim.vehicle)openGarage(shopHere);
    else if(work.pedestrian())work.street();
    return;
  }
  if(name==='phone') { if(started&&!paused&&!traveling&&bootReady&&!cityView&&!mapOpen)phone?.toggle(event?.fromPad || event?.code || event?.detail===0 ? 'keys' : 'pointer');return; }
  if(name==='shoulder'){
    if(weaponControls() && (event?.fromMenu || focusedAim()))shoulderSide*=-1;
    return;
  }
  if(name==='grapple'){
    if(grabbedPerson || !streetControls())return;
    const p=sim.player,target=lockedPerson || meleeTarget();
    if(sim.ending || sim.room || sim.seat || p.mode!=='walk' || p.armed || p.move || p.swing || p.reaction || !p.grounded || p.water ||
       !target || !crowd?.people.includes(target) || target.reaction || target.gone || target.dead || target.sitting || target.visit ||
       target.state==='down' || Math.hypot(target.x-p.x,target.z-p.z)>.95 || !sim._hasSight(p,target) ||
       !sim.clearStrikePath({limb:'hand'},{x:target.x,y:(target.y??p.y)+1.25,z:target.z}))return;
    menuGrapple=Boolean(event?.fromMenu);grabbedPerson=target;target.grappled=true;target.strikeDue=null;target.once=false;
    p.cover=null;p.velocityX=p.velocityZ=p.speed=0;
    sim.assault(target.x,target.z);
    return;
  }
  if(name==='interact' && grabbedPerson && menuGrapple){
    grabbedPerson.grappled=false;grabbedPerson=null;return;
  }
  if(name==='reload'){if(weaponControls())sim.reload();return;}
  if(name==='fire' || (name==='fight' && sim.player.armed)){
    if(weaponControls() && !(sim.player.reloading>0) && !(sim.player.fireWait>0))fireRequested=true;
    return;
  }
  if(name==='fight' || name==='light' || name==='heavy' || name==='cover') {
    if(sim.doorway?.take)return;
    if(!streetControls() || sim.seat || sim.room)return;
    const target=grabbedPerson || lockedPerson || meleeTarget();
    if(name==='cover' || name==='heavy' && (!target && !input.focusing || sim.player.armed || sim.player.cover)){
      if(sim.toggleCover() || name==='cover' || sim.player.armed)return;
    }
    if(!sim.player.armed){
      if(grabbedPerson){grabbedPerson.grappled=false;grabbedPerson=null;}
      const p=sim.player,style=(name==='heavy'||name==='heavyMelee')?'heavy':name==='light'?'light':'alternate';
      if(sim.fight(target,style))queuedStrike=null;
      else if(sim.meleeAction && !p.reaction){
        const recovery=p.move ? p.move.T-p.move.t : p.swing;
        if(recovery>0 && recovery<=.18)queuedStrike={style,expires:sim.elapsed+.3};
      }
    }
    return;
  }
  if(name==='draw') {
    if(!started||paused||traveling||!bootReady||cityView||mapOpen||phone?.open||sim.player.mode!=='walk'||sim.seat||aerialView)return;
    if(sim.draw()){
      if(!sim.player.armed)shoulderPitch=0;
      sim._say(!sim.player.armed?'Pistol away.':'Pistol equipped.',3);
    }
    return;
  }
  if(mapOpen)return;
  if(name==='perspective'){
    if(!paused)switchPerspective();
    return;
  }
  // Not from the title screen: there is no street to look at until the game has been entered.
  if(name==='view') { if(started)setView(cityView?'street':aerialView?'city':'aerial');return; }
  if(name==='viewToggle' || name==='viewCity'){
    if(started && bootReady && !paused && !traveling){
      if(name==='viewToggle')setView(cityView||aerialView?'street':'aerial');
      else if(!cityView)setView('city');
    }
    return;
  }
  if(name==='time') { if(gfx){const preset=gfx.nextPreset();updateTimeButton();announce('Time of day: '+preset.label.toLowerCase()+', '+gfx.clock+'.');}return; }
  if(!started||paused||traveling||!bootReady||cityView)return;
  if(name==='driverSpeed'){
    if(sim.player.mode==='passenger' && !sim.ending)cityRides.toggleHurry();
    return;
  }
  if(name==='stealth'){
    const p=sim.player;if(streetControls() && p.mode==='walk' && p.grounded && !p.move && !p.reaction && !p.water && !sim.seat)p.stealth=!p.stealth;
    return;
  }
  if(name==='skate'){if(!mapOpen&&sim.toggleSkateboard()){input.skating=sim.player.mode==='skate';headAnchor=undefined;snapChase=true;}return;}
  if(name==='cash'){hud.showStatus(sim.cash,null,phoneBank.checking/100);return;}
  if(name==='interact' && sim.player.mode==='bike' && event?.code==='KeyE' && !tripAction(sim) && !sim.canDropPaper()){action('horn');return;}
  if(name==='interact' && sim.player.mode==='drive' && event && !tripAction(sim) && !sim.canDropPaper()){action('horn');return;}
  if(['vehicle','interact','boardCab','takeCab'].includes(name)){
    const vehicleOnly=name!=='interact', resolving=name==='boardCab' || name==='takeCab';
    if(vehicleOnly && (sim.room || sim.seat))return;
    currentInteractPrompt=null;
    if(!vehicleOnly && (interactWithTrip(sim) || sim.dropPaper()))return;
    if(sim.player.mode==='skate'){sim.toggleSkateboard();return;}
    if(sim.player.mode==='passenger'){cityRides.stopEarly();return;}

    const cab=cityRides?.nearbyCab();
    if(resolving && (!cab || cab!==event.car))return;
    if(cab && name==='vehicle' && (event?.code==='KeyF' || event?.fromPad)){
      input.startCabPress(cab,event);return;
    }
    if(name!=='takeCab' && cityRides?.canBoard()){cityRides.board();return;}
    if(!vehicleOnly){
      if(sim.seat){sim.stand();return;}
      if(sim.player.mode==='walk'&&!sim.room&&!stairHere&&stopHere){
        openBusDepartures(stopHere);return;
      }
      const atm=nearbyATM();
      if(atm){atmTerminal.open(sim.room,atm);return;}
      if(beginRegisterTake(sim,work))return;
      const seat=nearestSeat();
      if(seat&&sim.sit(seat))return;
      if(sim.room){
        if(sim.doorway && Math.hypot(sim.room.a,sim.room.b)<1.6)sim.doorway.door.velocity=-2.8;
        return;
      }
    }
    if(sim.player.mode==='transport'||sim.transport.nearby()||sim.player.mode==='bike'||sim.getNearbyBike()){
      if(sim.interact()){yaw=sim.player.angle;snapChase=true;headAnchor=undefined;}
      return;
    }
    // On foot at an open door, with no car to get into: go in.
    if(!vehicleOnly&&sim.player.mode==='walk'&&!sim.room&&doorHere&&!sim.getNearbyCar()&&goIn(doorHere))return;
    if(!vehicleOnly && event && sim.player.mode==='walk'){
      if(standHere || shopHere || crowd?.closest(sim.player.x,sim.player.z))action('shop');
      return;
    }
    if(cab && name!=='takeCab'){
      if(cityRides.boardStreetCab(cab))phone.openRidePicker();
      return;
    }
    const changed=sim.interact(name==='takeCab'?cab:null);
    if(changed && name==='takeCab')cityRides.releaseBooking(cab);
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
  if(name==='lights' && sim.vehicle && !sim.vehicle.destroyed){
    const car=sim.vehicle;
    car.lampsOn=!(car.lampsOn ?? (gfx.state.lightsOn>.4));
  }
  if(name==='horn' && sim.player.mode==='bike')audio.bikeBell(sim.player,true);
  if(name==='horn' && sim.player.mode==='drive' && !sim.vehicle?.destroyed)audio.horn(sim.vehicle);
}
function switchPerspective(){
  if(!started||traveling||!bootReady||mapOpen)return;
  firstPerson=!firstPersonActive();
  if(cityView||aerialView)setView('street');
  else{
    const p=sim.player;
    headAnchor=p.mode==='walk' && !sim.seat?null:undefined;
    if(firstPerson&&p.mode==='walk'){
      yaw=walkingControlYaw();
    }else if(!firstPerson && p.mode==='walk' && p.armed)shoulderPitch=clamp(headPitch,-1,.95);
    else if(p.mode==='drive')yaw=p.angle;
    headTurn=0;headPitch=shoulderActive?shoulderPitch:0;input.lookDelta=0;input.lookVertical=0;
    updatePerspectiveButton();
  }
}
function togglePause(force) {
  if(!started)return;
  paused=force??!paused;
  if(paused)interaction?.close();
  if(paused&&mapOpen)gameMap.setOpen(false);
  input.clear();
  if(paused && !$('pause-dialog').open && !$('sources-dialog').open) {
    refreshPauseMenu();
    showPauseTab(0);
    $('pause-dialog').showModal();
    drawPausePreview();
  }
  if(!paused&&$('pause-dialog').open){$('pause-dialog').close();closeCharacter();}
}

const PAUSE_TABS=['map','player','settings','controls','about'];
const CONTROL_SETS=['foot','vehicles','skate','combat','city','camera'];
const WEEKDAYS=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
let pauseTab=0;
function showPauseTab(index,focus=false){
  pauseTab=(index+PAUSE_TABS.length)%PAUSE_TABS.length;
  PAUSE_TABS.forEach((name,i)=>{
    const tab=$('pause-tab-'+name),selected=i===pauseTab;
    tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    $('pause-'+name).hidden=!selected;
  });
  if(focus)$('pause-tab-'+PAUSE_TABS[pauseTab]).focus();
  $('pause-help').textContent=$('about-help').textContent='';
  if(!$('pause-dialog').open)return;
  if(PAUSE_TABS[pauseTab]==='map')drawPausePreview();
  if(PAUSE_TABS[pauseTab]==='player'&&!characterOpen){characterOpen=true;characterFrame.setAttribute('src','./character.html?embed');}
}
PAUSE_TABS.forEach((name,i)=>$('pause-tab-'+name).addEventListener('click',()=>showPauseTab(i)));
function showControls(name){
  for(const set of CONTROL_SETS){
    $('controls-'+set).hidden=set!==name;
    $('controls-tab-'+set).setAttribute('aria-pressed',String(set===name));
  }
}
for(const set of CONTROL_SETS)for(const event of ['click','focus'])$('controls-tab-'+set).addEventListener(event,()=>showControls(set));
for(const event of ['pointerover','focusin'])$('pause-dialog').addEventListener(event,({target})=>{
  const option=target?.closest?.('.pause-option');
  if(!option)return;
  $(PAUSE_TABS[pauseTab]==='about'?'about-help':'pause-help').textContent=option.dataset.help||'';
});
const characterFrame=$('pause-character');
let characterOpen=false;
function closeCharacter(){
  if(!characterOpen)return;
  characterOpen=false;
  if(document.activeElement===characterFrame)canvas.focus();
  characterFrame.setAttribute('src','about:blank');
  dressPlayer();
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==characterFrame.contentWindow||event.data?.type!=='pause-key'||!$('pause-dialog').open)return;
  if(event.data.code==='Escape')togglePause(false);
  else showPauseTab(pauseTab+(event.data.code==='KeyE'?1:-1),true);
});
let previewSpan=1400;
function drawPausePreview(){if(!$('pause-map').hidden)gameMap?.drawPreview($('pause-map-canvas'),previewSpan);}
$('open-map-button').addEventListener('wheel',event=>{
  event.preventDefault();
  previewSpan=clamp(previewSpan*Math.exp(clamp(event.deltaY,-300,300)*.002),300,16000);
  drawPausePreview();
},{passive:false});
function pauseClock(){return (WEEKDAYS[weekday]||'')+' '+(gfx?.clock||'');}
function refreshPauseMenu(){
  $('pause-place').textContent=$('district-name').textContent;
  $('pause-clock').textContent=pauseClock();
  $('pause-cash').textContent=formatMoney(sim.cash);
  $('pause-checking').textContent=formatMoney(phoneBank.checking/100);
  $('pause-street').textContent=$('street-name').textContent;
  $('pause-coordinates').textContent=$('coordinates').textContent;
  const condition=Math.max(0,Math.round(sim.health)),stars=Math.min(5,Math.max(0,Math.ceil(sim.heat-1e-9)));
  $('pause-health').textContent=String(condition);
  $('pause-health-bar').style.width=condition+'%';
  $('pause-wanted').textContent='★'.repeat(stars)+'☆'.repeat(5-stars);
  $('pause-deliveries').textContent=String(sim.deliveries);
  $('pause-distance').textContent=(sim.distanceTravelled*.000621371).toFixed(1)+' MI';
  const performanceLine=$('street-performance');
  performanceLine.hidden=!recentFrameMs;
  if(recentFrameMs)performanceLine.textContent=Math.round(1000/recentFrameMs)+' FPS · '+Math.round(recentFrameMs)+' ms per frame';
  const car = sim.vehicle;
  $('pause-car').hidden = !car;
  if (car) {
    $('pause-car-name').textContent = performanceName(car);
    renderStats($('pause-car-stats'), vehicleHandling(car));
  }
  updatePerspectiveButton();
}
function pauseItems(){
  const panel=$('pause-'+PAUSE_TABS[pauseTab]);
  return [...(panel.querySelectorAll?.('.pause-option,.pause-map-view')||[])].filter(item=>!item.hidden&&item.offsetParent!==null);
}
function movePauseFocus(step){
  const items=pauseItems();
  if(!items.length)return;
  const at=items.indexOf(document.activeElement);
  items[at<0?(step>0?0:items.length-1):(at+step+items.length)%items.length].focus();
}
function pausePad(index){
  if($('sources-dialog').open){if(index===1)$('sources-dialog').close();return index!==9;}
  if(index===4||index===5)showPauseTab(pauseTab+(index===5?1:-1),true);
  else if(index===12||index===13)movePauseFocus(index===13?1:-1);
  else if(index===0){const item=document.activeElement;if(item&&$('pause-dialog').contains(item))item.click();}
  else if(index===1)togglePause(false);
  return index!==9;
}
$('pause-dialog').addEventListener('keydown',event=>{
  if($('sources-dialog').open)return;
  const item=document.activeElement,onTab=item?.getAttribute?.('role')==='tab';
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();movePauseFocus(event.key==='ArrowDown'?1:-1);}
  else if(onTab&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();showPauseTab(pauseTab+(event.key==='ArrowRight'?1:-1),true);}
});

$('start-button').addEventListener('click',()=>{
  if(!sim||!bootReady)return;
  if(citySoundWanted)audio.setEnabled(true).then(showCitySound);
  started=true;paused=false;$('intro').hidden=true;setView('city');
  canvas.focus();
});
$('startup-retry').addEventListener('click',()=>window.location.reload());
const citySoundButton=$('sound-button');
function showCitySound(){
  $('sound-value').textContent=audio.enabled?'ON':'OFF';
  citySoundButton.setAttribute('aria-pressed',String(audio.enabled));
}
citySoundButton.addEventListener('click',async()=>{
  citySoundWanted=!audio.enabled;
  try{localStorage.setItem(CITY_SOUND_KEY,citySoundWanted?'on':'off');}catch{}
  await audio.setEnabled(citySoundWanted);
  showCitySound();
});
const interfaceSoundButton=$('interface-sound-button');
function showInterfaceSound(){
  $('interface-sound-value').textContent=audio.interfaceEnabled?'ON':'OFF';
  interfaceSoundButton.setAttribute('aria-pressed',String(audio.interfaceEnabled));
}
showInterfaceSound();
interfaceSoundButton.addEventListener('click',()=>{
  audio.interfaceEnabled=!audio.interfaceEnabled;
  showInterfaceSound();
  if(audio.interfaceEnabled)audio.interfaceCue('confirm');
  try{localStorage.setItem(INTERFACE_SOUND_KEY,audio.interfaceEnabled?'on':'off');}catch{}
});
const controllerLayouts=['auto','ps5','classic'];
try{
  const saved=localStorage.getItem('nyc.controller-layout');
  if(controllerLayouts.includes(saved))input.controllerLayout=saved;
}catch{}
const layoutLabels=[...document.querySelectorAll('[data-ps5]')].map(node=>({node,classic:node.textContent}));
let lastHelpLayout;
function refreshControllerHelp(){
  const ps5=input.controllerLayout==='ps5' || input.controllerLayout==='auto' && input.ps5;
  const label=input.controllerLayout==='auto' && ps5?'AUTO · PS5':input.controllerLayout.toUpperCase();
  if(lastHelpLayout===label)return;
  lastHelpLayout=label;
  $('controller-layout-value').textContent=label;
  $('pad-help-heading').textContent=ps5?'PS5':'Controller';
  $('controller-sprint').hidden=ps5;
  for(const {node,classic} of layoutLabels)node.textContent=ps5?node.dataset.ps5:classic;
}
refreshControllerHelp();
$('controller-layout').addEventListener('click',()=>{
  input.clear();
  input.controllerLayout=controllerLayouts[(controllerLayouts.indexOf(input.controllerLayout)+1)%controllerLayouts.length];
  try{localStorage.setItem('nyc.controller-layout',input.controllerLayout);}catch{}
  refreshControllerHelp();
});
const paceButton=$('controller-sprint');
function showPaceButton(){$('sprint-value').textContent=input.tapSprint?'TAP':'HOLD';}
try{input.tapSprint=localStorage.getItem('nyc.controller-sprint')!=='hold';}catch{}
showPaceButton();
paceButton.addEventListener('click',()=>{
  input.clear();input.tapSprint=!input.tapSprint;showPaceButton();
  try{localStorage.setItem('nyc.controller-sprint',input.tapSprint?'tap':'hold');}catch{}
});
$('quality-button').addEventListener('click',()=>{highQuality=!highQuality;qualityTimer=slowSeconds=0;applyQuality();});
$('hours-button').addEventListener('click',()=>{
  actualHours=!actualHours;
  updateHoursButton();
  saveDisplaySettings();
});
$('shadows-button').addEventListener('click',()=>{
  shadowsEnabled=!shadowsEnabled;
  updateShadowButton();
  if(renderer)setLocalShadows(!cityView);
  saveDisplaySettings();
});
$('time-button').addEventListener('click',()=>{action('time');$('pause-clock').textContent=pauseClock();});
function fromMenu(run){return event=>{if($('pause-dialog').open)togglePause(false);run(event);};}
$('view-button').addEventListener('click',()=>action('view'));
$('first-person-button').addEventListener('click',()=>{if(!busRide)switchPerspective();});
$('open-map-button').addEventListener('click',fromMenu(()=>action('map')));
$('city-button').addEventListener('click',fromMenu(()=>{if(!started&&bootReady){$('start-button').click();return;}setView(cityView?'street':'city');}));
$('road-pilot-mode-button').addEventListener('click',()=>{
  if(!roadPilot)return;
  roadPilot.setMode(roadPilot.getStatus().mode==='reconstructed'?'aerial':'reconstructed');
  updateRoadPilotControls();
});
for(const [id,slot] of [['wheel-fists','wheelUnarmed'],['wheel-pistol','wheelPistol']]){
  $(id).addEventListener('pointerenter',()=>{if(wheelSelection!==null)action(slot);});
  $(id).addEventListener('click',()=>{if(wheelSelection!==null){action(slot);action('weaponClose');}});
}
let lastWeaponScroll=-Infinity;
canvas.addEventListener('wheel',event=>{
  if(event.ctrlKey || event.metaKey || event.altKey || !event.deltaY)return;
  if(wheelSelection===null && streetControls() && sim.player.mode==='walk' && !sim.seat){
    event.preventDefault();
    if(performance.now()-lastWeaponScroll>=130){selectLoadout(!sim.player.armed);lastWeaponScroll=performance.now();}
    return;
  }
  if(wheelSelection!==null){event.preventDefault();action(wheelSelection?'wheelUnarmed':'wheelPistol');return;}
  if(cityView){event.preventDefault();pickerFlight.cancel();const next=clamp(cityZoom*Math.exp(event.deltaY*.001),.07,1.8);if(next!==cityZoom)audio.sceneCue(next<cityZoom?'zoomIn':'zoomOut',.4);cityZoom=next;}
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
$('inventory-button').addEventListener('click',fromMenu(()=>action('inventory')));
$('map-button').addEventListener('click',()=>action('map'));
$('touch-skate')?.addEventListener('click',()=>action('skate'));
$('ride-speed').addEventListener('click',()=>action('driverSpeed'));
$('touch-shop').addEventListener('click',()=>action('shop'));
const touchEnter=$('touch-enter');
let cabPointer=null, handledCabTouch=false;
touchEnter.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false)return;
  handledCabTouch=false;
  if(!streetControls() || interactionPrompt()?.key!=='F')return;
  const cab=cityRides?.nearbyCab();
  if(!cab)return;
  handledCabTouch=true;cabPointer=event.pointerId;
  touchEnter.setPointerCapture(event.pointerId);
  input.startCabPress(cab,event,'touch');
});
touchEnter.addEventListener('pointerup',event=>{
  if(event.pointerId!==cabPointer)return;
  cabPointer=null;
  if(input.cabPress?.source==='touch')input.updateCabPress(false,0,event.timeStamp);
});
for(const type of ['lostpointercapture','pointercancel'])touchEnter.addEventListener(type,event=>{
  if(event.pointerId!==cabPointer)return;
  cabPointer=null;
  if(input.cabPress?.source==='touch')input.cabPress=null;
});
touchEnter.addEventListener('click',event=>{
  if(handledCabTouch && event.detail!==0){handledCabTouch=false;return;}
  const key=currentInteractPrompt?.key;
  action(key==='CLICK'?'fight':key==='F'?'vehicle':'interact');
});
$('touch-horn').addEventListener('click',()=>action('horn'));
$('touch-equip').addEventListener('click',()=>action('draw'));
$('touch-aim').addEventListener('click',()=>{
  if(!weaponControls())return;
  if(input.touch.has('aim'))input.touch.delete('aim');else input.touch.add('aim');
});
$('touch-fire').addEventListener('click',()=>action('fire'));
$('touch-reload').addEventListener('click',()=>action('reload'));
// Leaving the tab does not pause the game or open its menu: the browser stops drawing a hidden page, and coming back
// finds everything as it was left.
window.addEventListener('resize',resize);

function applyQuality() {
  if(!renderer)return;
  // Quality sets shadow map sizes and the resolution the frame is drawn at.
  gfx.setQuality(highQuality?'high':'balanced');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,gfx.pixelRatioLimit));
  setLocalShadows(!cityView);
  $('quality-value').textContent=highQuality?'HIGH':'BALANCED';
  resize();
}
function setLocalShadows(enabled) {
  // Sun shadows are drawn at street scale only. Switching between city and
  // local views invalidates shader variants once, not every frame.
  gfx.setShadows(shadowsEnabled,Boolean(enabled));
}
function updateTimeButton() {
  $('time-value').textContent=gfx.clock;
  $('time-button').setAttribute('aria-label','Time of day, '+gfx.clock+'. Select to skip ahead.');
}
function updateShadowButton(){
  $('shadows-value').textContent=shadowsEnabled?'ON':'OFF';
  $('shadows-button').setAttribute('aria-pressed',String(shadowsEnabled));
}
// Shops and services never close unless the player asks for the hours each kind of place really keeps.
let actualHours=false;
function updateHoursButton(){
  setOpeningHours(actualHours);
  $('hours-value').textContent=actualHours?'ACTUAL HOURS':'ALWAYS OPEN';
  $('hours-button').setAttribute('aria-pressed',String(actualHours));
}
function restoreDisplaySettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(DISPLAY_KEY)||'null');
    if(saved?.version===1&&typeof saved.shadows==='boolean')shadowsEnabled=saved.shadows;
    if(saved?.version===1&&typeof saved.actualHours==='boolean')actualHours=saved.actualHours;
  }catch{}
  updateShadowButton();updateHoursButton();
}
function saveDisplaySettings(){
  try{localStorage.setItem(DISPLAY_KEY,JSON.stringify({version:1,shadows:shadowsEnabled,actualHours}));}catch{}
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
      sim.shopping.restore(record.shopping);
      if(record.purchases && typeof record.purchases==='object') sim.purchases=Object.fromEntries(Object.entries(record.purchases).filter(([sku,n])=>/^[a-z0-9-]+$/.test(sku) && Number.isSafeInteger(n) && n>0));
      if(Number.isFinite(record.cash)&&record.cash>=0)sim.cash=Math.min(record.cash,1e8);
      phoneBank.restore(record.bank,sim.cash);
      if(Number.isInteger(record.deliveries)&&record.deliveries>=0)sim.deliveries=Math.min(record.deliveries,1e6);
      const cab=sim.ownedCab;
      if(cab&&record.cab){
        if(record.cab.mods&&typeof record.cab.mods==='object')cab.mods=Object.fromEntries(['engine','brakes','tyres'].map(part=>[part,Math.max(0,Math.min(3,Math.floor(Number(record.cab.mods[part])||0)))]));
        if(/^#[0-9a-f]{6}$/.test(record.cab.color||'')){cab.color=record.cab.color;cab.type='sedan';cab.resprays=1;cab.identity=cab.identity.plain;cab.shape=cab.identity.shape;}
      }
    }
  } catch { /* Storage can be unavailable in private browsing; play still works. */ }
}
function saveProgress(entryName) {
  const cab=sim.ownedCab;
  phoneBank.sync(sim.cash,gfx.clock,typeof entryName==='string'?entryName:undefined);
  if(started)phoneBank.sampleBalance(sim.cash,gfx.hours);
  const value=JSON.stringify({version:1,cash:sim.cash,bank:phoneBank.record(),deliveries:sim.deliveries,shopping:sim.shopping.record(),purchases:sim.purchases,work:work.record,cab:cab?{mods:cab.mods||null,color:cab.resprays?cab.color:null}:null});
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
// Cars parked at the kerb around the player. About seven spaces in ten are
// taken, always the same ones, so a street looks the same on every visit.
const PARKED_RANGE=150, PARKED_LIMIT=130, PARKED_SHARE=.72;
let parkedAt=null, parkedSource=null, parkedCount=0, parkingInput=null, parkingRevision=-1, cycleParking=[];
function availableKerbParking() {
  let spaces=streetscape?.parking()||noStreetFurniture;
  if(buses && streetscape){
    const walks=streetscape.walks();
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    spaces=buses.availableParking(spaces,kerbIndex,(x,z)=>snapToKerb(kerbIndex,x,z,14));
  }
  if(!cycleRoutes)return spaces;
  if(spaces!==parkingInput || parkingRevision!==laneSurfaceRevision){
    parkingInput=spaces;parkingRevision=laneSurfaceRevision;
    const road=(x,z)=>streetscape?.surfaceAt(x,z)==='road';
    cycleParking=spaces.map(space=>bikeLaneParking(cycleRoutes,space,road)).filter(Boolean);
  }
  return cycleParking;
}
function refreshParkedCars() {
  const spaces=availableKerbParking(), p=sim.player;
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
  alarmStreet(person,8,.75);
  if(person.dead)sim.offence('killing',{x:person.x,y:person.y,z:person.z,message:'A death was reported.'});
  else sim.assault(person.x,person.z);
}
function streetSightBlocked(x,y,z,apertureBuildings){
  return y<=groundHeight(x,z) || sim.isBlocked(x,z,.04,{ignoreWater:true,baseHeight:y,height:0,apertureBuildings});
}

const muzzleTip=new THREE.Vector3(0,.025,.185);
function fireFromView(){
  if(!weaponControls())return;
  const gun=playerBody?.mesh.visible?playerGun:null;
  const direction=camera.getWorldDirection(new THREE.Vector3());
  // The round leaves somewhere inside the reticle, not through its centre: anywhere in a cone as wide as gunSpread says.
  const spread=gunSpread(),turn=Math.random()*Math.PI*2,off=Math.tan(Math.sqrt(Math.random())*spread);
  const across=new THREE.Vector3().crossVectors(direction,camera.up).normalize(),over=new THREE.Vector3().crossVectors(across,direction);
  direction.addScaledVector(across,Math.cos(turn)*off).addScaledVector(over,Math.sin(turn)*off).normalize();
  const muzzle=gun?.visible?gun.localToWorld(muzzleTip.clone()):null;
  if(!sim.fire({origin:camera.position.clone(),direction,muzzle}))return;
  // The gun kicks: up, a little to one side, harder from the hip and harder again when fired fast.
  gunFeel.kickPitch+=.02+gunFeel.heat*.02+(focusedAim()?0:.009);
  gunFeel.kickYaw+=(Math.random()-.5)*(.012+gunFeel.heat*.016);
  gunFeel.heat=Math.min(1,gunFeel.heat+.34);
}
// How the pistol is behaving in the hand. `heat` (0 to 1) is how fast it has just been fired: it opens the reticle and
// lets shots stray, and cools in under a second. A kick waiting to arrive is in `kickPitch` and `kickYaw` (radians); a
// little over half of each kick comes back by itself (`settle`), and the rest is the shooter's to pull down.
const gunFeel={heat:0,kickPitch:0,kickYaw:0,settle:0};
// A hit on somebody turns the reticle for a moment; a kill turns it red.
const hitMark={until:0,kill:false};
/** How far a shot may stray from where the pistol points, in radians: least when aimed and still, most from the hip at a run. */
function gunSpread(){
  const p=sim.player,aimed=focusedAim(),moving=Math.min(1,Math.hypot(p.velocityX||0,p.velocityZ||0)/6);
  return (aimed?.0025:.011)+gunFeel.heat*.03+moving*(aimed?.008:.022)+(p.grounded===false?.03:0);
}
/** Move the view by this frame's share of the kick, as if the mouse had been moved: so it works from the shoulder and from the eye alike. */
function updateGunFeel(dt){
  if(!weaponControls()){gunFeel.heat=gunFeel.kickPitch=gunFeel.kickYaw=gunFeel.settle=0;return;}
  gunFeel.heat=Math.max(0,gunFeel.heat-dt*1.6);
  const rise=1-Math.exp(-dt*55),up=gunFeel.kickPitch*rise,side=gunFeel.kickYaw*rise;
  gunFeel.kickPitch-=up;gunFeel.kickYaw-=side;gunFeel.settle+=up*.55;
  const back=gunFeel.settle*(1-Math.exp(-dt*5.5));gunFeel.settle-=back;
  input.lookVertical+=back-up;input.lookDelta+=side;
}

/** Trace from the reticle to pick a 3D point, then from the muzzle to hit it. */
function shotFired(event) {
  const police=sim.police, anchor=new THREE.Vector3(event.x,event.y,event.z);
  const room=sim.room, view=room ? sim.doorway : null;
  const direction=event.sight?.direction ?? new THREE.Vector3(Math.sin(event.angle),0,Math.cos(event.angle));
  const muzzle=event.sight?.muzzle ?? anchor.clone().addScaledVector(direction,.35);
  const people=(crowd?.people || []).filter(person=>!person.visit || roomLocal(person.visit.room,person.x,person.z).b<=0);
  const officers=police.officers.concat(police.fieldOfficers);
  const views=[...new Set([view,...(storefronts?.rooms || [])])].filter(Boolean);
  const cars=sim.cars.filter(car=>Math.hypot(car.x-event.x,car.z-event.z)<GUN.range+8);
  const trace=(start,ray,range,step)=>{
    const panes=[], undrawn=[];
    let vehicleStop=Infinity;
    for(const car of cars){
      const dx=car.x-start.x, dz=car.z-start.z, dy=(car.y||0)+1-start.y;
      const along=clamp(dx*ray.x+dy*ray.y+dz*ray.z,0,range);
      if(Math.hypot(dx-along*ray.x,dy-along*ray.y,dz-along*ray.z)>4)continue;
      const mesh=carModels.get(car.id), model=mesh ? null : vehicleMeshes.forCar(car,true);
      const contact=vehicleShotContacts(car,mesh,model,start,ray,range);
      if(!contact){undrawn.push(car);continue;}
      vehicleStop=Math.min(vehicleStop,contact.distance);
      panes.push(...contact.panes);
    }
    const bodyAt=(x,y,z)=>undrawn.some(car=>Math.abs(car.x-x)<4 && Math.abs(car.z-z)<4 &&
      y>=(car.y||0)+.12 && (carTop(car,x,z)??-Infinity)>=y);
    const streetBlocked=(x,y,z,buildings)=>streetSightBlocked(x,y,z,buildings) || bodyAt(x,y,z);
    const trace=traceShopShot(start,ray,Math.min(range,vehicleStop),{views,people,officers,streetBlocked,step});
    const metal=trace.distance===vehicleStop || !trace.actor && trace.solid &&
      bodyAt(start.x+ray.x*(trace.distance+.06),start.y+ray.y*(trace.distance+.06),start.z+ray.z*(trace.distance+.06));
    trace.panes.push(...panes.filter(pane=>pane.distance<=trace.distance));
    return {...trace,metal,solid:trace.solid || metal};
  };
  const sight=event.sight?.origin ?? anchor;
  const convergence=trace(sight,direction,GUN.range+sight.distanceTo(anchor)).distance;
  const clearance=muzzle.clone().sub(sight).dot(direction)+.3;
  const aim=sight.clone().addScaledVector(direction,Math.max(convergence,clearance));
  const exit=muzzle.clone().sub(anchor), barrelLength=exit.length();
  const barrel=trace(anchor,exit.normalize(),barrelLength,.08);
  let start=muzzle, ray=aim.sub(muzzle).normalize(), result;
  if(barrel.distance<barrelLength || barrel.solid){
    start=anchor;ray=exit;result=barrel;
  }else result=trace(start,ray,GUN.range);
  const breakPanes=(panes,from,along)=>{
    for(const pane of panes){
      if(pane.view)pane.view.gunfireAt=sim.elapsed;
      const changed=pane.car ? strikeVehicleGlass(pane.car,pane.panel,pane.offset) :
        storefronts?.breakGlass(pane.view,pane.id);
      if(!changed)continue;
      const point=from.clone().addScaledVector(along,pane.distance);
      carSmoke?.impact(point.x,point.y,point.z,along.x,along.y,along.z,'glass');
      if(!pane.car || pane.panel===PANEL.front)audio.effect('glassBreak',point,.6,36);
    }
  };
  if(result!==barrel)breakPanes(barrel.panes,anchor,exit);
  breakPanes(result.panes,start,ray);
  const impact=start.clone().addScaledVector(ray,result.distance);
  police.shots.push({at:sim.elapsed,hit:Boolean(result.actor),x:start.x,y:start.y,z:start.z,tx:impact.x,ty:impact.y,tz:impact.z});
  police.shotsFired++;police.armed=true;gunWatch=20;
  // Where on them it landed: the top seventh of somebody is their head, and below the hip it is a leg.
  let zone='torso';
  if(result.actor){
    const actor=result.actor,floor=(actor.y||0)+(actor.rideLift||0),tall=actor.look?.height||actor.height||1.76,up=(impact.y-floor)/tall;
    zone=up>.86?'head':up<.47?'legs':'torso';
    carSmoke?.impact(impact.x,impact.y,impact.z,ray.x,ray.y,ray.z,'body');
  }else if(result.distance<GUN.range-.01){
    carSmoke?.impact(impact.x,impact.y,impact.z,ray.x,ray.y,ray.z,result.metal?'metal':'wall');
  }
  if(result.officer){
    police.hitByShot(result.actor,zone);
    hitMark.kill=!(result.actor.health>0);hitMark.until=sim.elapsed+(hitMark.kill?.32:.12);
  }else if(result.actor){
    const {actor,view:targetRoom}=result;
    if(targetRoom)fleeShop(targetRoom,actor);
    const dead=crowd.hitByShot(actor,ray,zone);
    if(targetRoom)roomOccupantHit(targetRoom,actor);
    hitMark.kill=dead;hitMark.until=sim.elapsed+(dead?.32:.12);
    sim.offence(dead?'killing':'assault',{x:actor.x,y:actor.y,z:actor.z,message:dead?'You shot somebody dead.':'You shot somebody.'});
  }
  alarmStreet({...event,y:sim.player.y},48,.85);
  sim.offence('gunfire',{x:event.x,y:sim.player.y,z:event.z,message:'Gunfire was reported.'});
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
  gun.name='Held pistol';
  // In the hand's own space the fingers run along +Y and the back of the hand faces -X: the barrel
  // goes the way the fingers do, the grip down through the palm (measured in the aiming pose).
  const forward=new THREE.Vector3(.03,.982,-.184).normalize(),up=new THREE.Vector3(-.042,.185,.982).normalize(),side=new THREE.Vector3().crossVectors(up,forward).normalize();
  up.crossVectors(forward,side);
  gun.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,up,forward));
  gun.position.copy(forward).multiplyScalar(.1).addScaledVector(up,.075);
  gun.traverse(object=>{object.layers.mask=hand.layers.mask;});
  gun.visible=false;hand.add(gun);
  return gun;
}
const meleeMarkerPosition=new THREE.Vector3();
function updateWeaponHUD(){
  const marker=$('melee-lock');
  marker.hidden=true;
  if(lockedPerson){
    const target=lockedPerson;
    meleeMarkerPosition.set(target.x,(target.y??sim.player.y)+(target.look?.height||1.75)*.73,target.z).project(camera);
    const {x,y,z}=meleeMarkerPosition;
    if(Math.abs(x)<=1 && Math.abs(y)<=1 && Math.abs(z)<=1){
      marker.style.left=(50+50*x)+'%';marker.style.top=(50-50*y)+'%';marker.hidden=false;
    }
  }
  const aiming=focusedAim();
  const eyeView=firstPersonActive(), restrained=eyeView && sim.police?.arrest>.2;
  const controls=weaponControls() && !restrained, ready=controls;
  if(!ready)input.touch.delete('aim');
  const p=sim.player, reloading=p.reloading>0, raised=gunRaised();
  $('aim-dot').hidden=!ready || reloading || eyeView && !raised;
  $('aim-dot').classList.toggle('focused',aiming);
  // The reticle is as wide as the cone a shot may leave in: it opens at a run and with each shot, and closes as the gun settles.
  $('aim-dot').style?.setProperty?.('--reticle-size',Math.round(Math.max(14,8+gunSpread()*1600))+'px');
  $('aim-dot').classList.toggle('hit',sim.elapsed<hitMark.until);
  $('aim-dot').classList.toggle('kill',sim.elapsed<hitMark.until&&hitMark.kill);
  const ammo=$('weapon-status');
  ammo.hidden=!controls;
  if(controls){
    const label=reloading?'Reloading…':`${p.rounds ?? GUN.rounds} / ${GUN.rounds} rounds`;
    if(ammo.textContent!==label)ammo.textContent=label;
  }
}
function dressPlayer() {
  if(!bodyShop)return;
  const design=tryOnLook || sessionAppearance || loadPerson(),key=JSON.stringify(design);
  phoneHand?.tone(design.tone);
  if(sim) Object.assign(sim.player,{height:design.height,walkStyle:design.walkStyle});
  Object.assign(PLAYER_LOOK,{height:design.height,kit:design.sex>.5?KIT.woman:0,
    top:parseInt((design.topColour||'#d7774e').slice(1),16),bottom:parseInt((design.bottomColour||'#1c1d22').slice(1),16),
    skin:parseInt((design.tone||'#b98563').slice(1),16),hair:parseInt((design.hairColour||'#14110f').slice(1),16)});
  if(key===playerDesign)return;
  playerDesign=key;
  bodyShop(design,'close').then(built=>{
    if(key!==playerDesign)return;
    if(playerBody){
      scene.remove(playerBody.mesh);playerBody.dispose();
      playerGun?.traverse(part=>{part.geometry?.dispose();part.material?.dispose();});
    }
    playerBody=createHumanMesh(built,built.look);playerBody.mesh.traverse(object=>{object.layers.enable(ROOM_LAYER);object.layers.enable(SUBWAY_LAYER);});scene.add(playerBody.mesh);
    setHandSource(built,playerBody.meshes);
    playerGun=createGun(playerBody);
    playerItems?.dispose(); playerItems=carriedItems(1);
    playerItems.group.traverse(object=>{object.layers.enable(ROOM_LAYER);object.layers.enable(SUBWAY_LAYER);}); playerBody.mesh.add(playerItems.group);
  }).catch(error=>{if(key===playerDesign)playerDesign='';console.warn('The player could not be drawn:',error);});
}
/** Put the player's body where the player is, in the pose for what they are doing. */
let traversalPose;
function showPlayer(dt,p,floor,eyeView,riding) {
  const mesh=playerBody.mesh;
  const lensActive=phoneCameraActive();
  const driving=p.mode==='drive'||p.mode==='passenger', skating=p.mode==='skate';
  const striking=p.swing>0 || ['kick','lowKick','stomp'].includes(p.move?.kind);
  const arrest=sim.police?.arrest||0, ending=sim.ending?.kind;
  const visibleOnFoot=!p.water && !sim.seat && !sim.shopping.payment && !phoneHand?.amount &&
    (striking || p.armed || !(courierBag(sim.mission) || p.carry));
  ownBody=eyeView && p.mode==='walk' && Boolean(ending || arrest>.2 || visibleOnFoot);
  playerBody.setFirstPerson(ownBody ? camera : null);
  mesh.visible=!atmTerminal?.active && Boolean(ownBody || ((p.mode==='walk'||skating||riding||driving)&&!eyeView));
  // What the simulation has just begun is begun here too: a swing, a kick, a vault, a hand to a car door.
  const take=sim.room && !sim.seat && sim.doorway?.take;
  if(p.swing>0 && (sim.meleeAction!==playerSeen.action || p.swing>playerSeen.swing+.1))animator.punch(Math.abs(p.speed)>1.2,p.swingClip);
  playerSeen.action=sim.meleeAction;
  playerSeen.swing=p.swing||0;
  const entering = ['door','breakIn','carjack'].includes(p.move?.kind);
  const move = p.move?.approach?.length ? null : entering && p.move.t >= p.move.T-.20 ? 'getIn' : p.move?.clip || p.move?.kind || null;
  const traversing=move==='climb'||move==='vault';
  if(move&&!traversing&&move!==playerSeen.move)animator.play(move,{fadeIn:.08,fadeOut:.18});
  playerSeen.move=move;
  const impact=playerSeen.grounded===false&&p.grounded!==false?-playerSeen.vy:0;
  playerSeen.grounded=p.grounded!==false;if(p.grounded===false)playerSeen.vy=p.vy||0;
  const held=p.mode==='passenger'?'sit':riding||driving?'drive':ending==='wasted'||sim.health<=0?'death':ending==='busted'?'cuffed':arrest>.6?'kneel':arrest>.2?'handsUp':null;
  // The fall plays from the start of Wasted and can settle before recovery.
  const heldTime=ending==='wasted' && held==='death'
    ? moves.clip(held).seconds*sim.ending.t/(sim.ending.T*.9) : undefined;
  const seat=held?null:sim.seat;
  // The pistol: brought up while it is out, kicked by each shot, and a new magazine when the last round has gone.
  const armed=Boolean(p.armed)&&p.mode==='walk'&&!held&&!seat&&!take&&!phoneHand?.amount;
  if(armed&&(p.firedAt||0)!==playerSeen.fired)animator.play('shoot',{rate:1.6,upperOnly:true,fadeIn:.03,fadeOut:.12});
  if(armed&&(p.reloading||0)>playerSeen.reloading+.5)animator.play('reload',{rate:1.25,upperOnly:true,fadeIn:.1,fadeOut:.2});
  playerSeen.fired=p.firedAt||0;playerSeen.reloading=p.reloading||0;
  if(playerGun)playerGun.visible=armed && (!eyeView || ownBody && !striking);
  const striding = p.mode === 'walk' && p.grounded && !p.move && !p.reaction && !p.water &&
    !held && !seat && !take && !striking && !p.slide && !armed;
  const pose = animator.update(dt, {
    walkStyle: p.walkStyle, speed: p.mode === 'walk' ? (seat?.stepSpeed ?? p.speed) : 0,
    strideScale: playerBody.rig.stride, strideEffort: striding ? p : null,
    grounded: riding || traversing || p.grounded, vy: p.vy, sliding: (p.slide || 0) > 0, impact,
    guard: (p.guard || 0) > 0, aim: armed && (!eyeView || !striking) && gunRaised(), held, heldTime, seat,
  });
  // The phone can look back at this body even when the gameplay camera hides it.
  if(!mesh.visible && !lensActive && !(eyeView && (p.reaction || traversing)))return;
  mesh.position.set(p.x,floor+(p.lift||0)+(riding?.25:0),p.z);mesh.rotation.set(0,p.angle,0);
  const payment=sim.shopping.payment;
  const carry=!p.reaction && p.mode==='walk' && !held && !take && !armed && !p.move && !p.swing ? (payment?payment.tender || 'cash':courierBag(sim.mission) || p.carry) : null;
  if(grabbedPerson && !p.reaction)moves.sample('clinch',sim.elapsed,pose);
  else if((p.cover || p.stealth && p.speed<.12) && !p.move && !p.reaction && !(p.swing>0) && !gunRaised())moves.sample('crouch',sim.elapsed,pose);
  else if(p.reaction && !ending)moves.sample(p.reaction.clip,p.reaction.time,pose);
  else if(p.mode==='bike'){
    moves.sample(p.speed<.18?'cycleStop':'cycle',bikePedal,pose);
    mesh.position.y=floor;
  }
  else if(skating){
    const clip=p.board.grind||p.board.manual?'skateBalance':!p.grounded?'skateOllie':p.board.pushing?'skatePush':'skateRoll';
    moves.sample(clip,clip==='skateOllie'?clamp(p.board.airTime,0,.6):p.board.pushing?p.board.phase:sim.elapsed,pose);
    const shift=-.065*p.board.manual;
    mesh.position.x+=shift*Math.sin(p.angle);mesh.position.z+=shift*Math.cos(p.angle);
    mesh.quaternion.copy(boardMesh.quaternion);mesh.rotateY(-Math.PI/2);
    mesh.position.y+=.095-.075*p.board.landing-.20*p.board.load-.33*p.board.tuck;
  }
  else if(p.water && !p.grounded && !ending){
    const moving=Math.min(1,Math.abs(p.speed));
    moves.sample(moving>.15?'swim':'treadWater',sim.elapsed,pose);
    const lean=.12+moving*.94, back=.75*Math.sin(lean);
    mesh.rotateX(lean);
    mesh.position.y+=1.52*(1-Math.cos(lean));
    mesh.position.x-=Math.sin(p.angle)*back;
    mesh.position.z-=Math.cos(p.angle)*back;
  }
  else if(driving)moves.sample(p.duckAmount>.01?'driveDuck':held,p.duckAmount||sim.elapsed,pose);
  else if(traversing){
    const phase=p.move.t/p.move.T;
    // Keep the gait clock advancing behind the move so the last frame can
    // settle into the pose the player will actually use after the landing.
    traversalPose??=moves.newPose();
    moves.sample(move,phase*moves.clip(move).seconds,traversalPose);
    const weight=THREE.MathUtils.smoothstep(phase,0,.10)*(1-THREE.MathUtils.smoothstep(phase,.83,1));
    moves.blend(pose,traversalPose,weight,pose);
  }
  else if(take?.hand && !ending)moves.sample('pickUp',take.clipTime,pose);
  const attack=sim.meleeAction;
  if (attack?.point && attack.committed && !attack.presented && !p.reaction) {
    const t=attack.timing.contact, clip=attack.clip;
    moves.sample(clip,clip==='jab' ? .12+2*t : clip==='cross' ? .16+2*t : t,pose);
  }
  if(p.stealth && striding && p.speed>=.12){
    pose.pelvis[1]-=.085;
  }
  const eating=mealMotion(carry),lift=eating?.lift||0;
  const eatingPlate=eating && carry.startsWith('plate-');
  fitPose(moves,playerBody.rig,pose,playerFitted,seat,carry,eatingPlate && !phoneHand?.amount?0:lift);
  if(p.mode==='bike')fitCyclist(playerBody.rig,playerFitted,bikePedal*2*Math.PI/PEDAL_PERIOD,p.speed<.18);
  if(p.reaction?.fall && !ending)fitFallPose(playerBody.rig,playerFitted,p.reaction,p.angle);
  playerBody.pose(playerFitted);
  fitStrikeContact(playerBody,sim.meleeAction);
  if(grabbedPerson){
    const sin=Math.sin(p.angle),cos=Math.cos(p.angle);
    const target=grabbedPerson;
    if(!figures?.contactJoint?.(target,'spine_03',receiverJoint))
      receiverJoint.set(target.x,target.y+(target.look.height||1.75)*.73,target.z);
    for(const side of ['l','r']){
      const across=side==='l'?.13:-.13;
      strikeGoal.copy(receiverJoint);strikeGoal.x+=across*cos-.14*sin;strikeGoal.z-=across*sin+.14*cos;
      reachWithHand(playerBody,side,jointOrigin,strikeGoal);
    }
  }
  plantStrideFeet(playerBody, animator.strideCycle, striding && !p.standing ? p : null);
  if((shoulderActive || ownBody) && gunRaised() && playerGun?.visible && !p.reaction && !p.water && !(p.reloading>0)){
    const sinceShot=sim.elapsed-(p.firedAt??-Infinity),recoil=sinceShot<.5?Math.exp(-sinceShot/.07)*.15:0;
    const angle=(ownBody?clamp(headPitch,-1.25,1.25):shoulderPitch)-recoil;
    sightTarget.set(p.x+20*Math.sin(yaw),floor+1.45-20*Math.tan(angle),p.z+20*Math.cos(yaw));
    aimHeldGun(playerBody,playerGun,sightTarget,1.2);
  }
  if(skating){
    plantSkateFeet(playerBody,p);
    if(p.board.grab){
      boardMesh.localToWorld(skateTarget.set(p.board.grab*.10,.115+.31*p.board.tuck,.035));
      reachWithHand(playerBody,p.board.grab<0?'l':'r',gripOffset,skateTarget);
    }
  }
  playerItems.begin();
  if(carry){
    if(payment && (carry==='cash' || carry==='card')){
      const hand=playerBody.bones[playerBody.rig.index.get('hand_l')];
      hand.localToWorld(handStart.copy(cashPinch.fromArray(pinchOffset(playerBody.rig))));
      cashTarget.set(payment.x,floor+1.12,payment.z);
      cashTarget.lerp(handStart,1-.7*paymentReach(payment));
      reachWithHand(playerBody,'l',cashPinch,cashTarget);
    }
    const hand=playerBody.bones[playerBody.rig.index.get('hand_l')];
    const point=hand.localToWorld(gripHere.fromArray(gripOffsetFor(playerBody.rig,carry)));
    playerItems.add(carry,mesh.worldToLocal(point),0);
    if(eatingPlate && !phoneHand?.amount)eatFromPlate(playerBody,point,eating);
    else if(carry==='fork' && eating?.loaded)playerItems.add('morsel',point,0,null,eating.color);
  }
  if(phoneHand?.amount && (mesh.visible || lensActive) && !take && !traversing && !p.reaction && !ending){
    const {bones,rig}=playerBody, head=bones[rig.index.get('Head')], palm=bones[rig.index.get('hand_r')];
    head.rotateX((phone?.screen==='camera' && phone.facing==='selfie' ? -.2 : .14)*phoneHand.amount);
    for(const [i,q] of fingerPose(rig,'phone','r'))bones[i].quaternion.fromArray(q);
    head.getWorldPosition(phoneTarget);mesh.worldToLocal(phoneTarget);
    phoneTarget.x-=.14;phoneTarget.y-=.21;phoneTarget.z+=.31;
    mesh.localToWorld(phoneTarget);
    palm.localToWorld(phonePalm.copy(gripOffset));
    phoneTarget.lerp(phonePalm,1-phoneHand.amount);
    reachWithHand(playerBody,'r',gripOffset,phoneTarget);
    phoneHand.inPalm(palm,rig.bones[rig.index.get('middle_01_r')].t,mesh);
  }
  if(traversing && !p.move.support){
    const t=p.move.t/p.move.T,grip=p.move.grip;
    const w=Math.max(0,Math.min(1,t/.15,(.72-t)/.18));
    const {bones,rig}=playerBody;
    for(const side of (move==='climb'?['l','r']:['l'])){
      const hand=bones[rig.index.get('hand_'+side)],offset=side==='l'?.20:-.20;
      const edge=cashTarget.set(grip.x+Math.cos(p.angle)*offset,grip.y+.025,grip.z-Math.sin(p.angle)*offset);
      edge.lerp(hand.localToWorld(handStart.copy(gripOffset)),1-w);
      reachWithHand(playerBody,side,gripOffset,edge);
    }
  } else if(p.standing && p.grounded){
    const car=sim.cars.find(c=>c.id===p.standing.id);
    if(car)fitVehicleFeet(playerBody,p,car);
  }
  if(take?.hand && !ending) {
    for(const [i,q] of fingerPose(playerBody.rig,'pinch'))playerBody.bones[i].quaternion.fromArray(q);
    cashTarget.set(take.hand.x,floor+take.hand.y,take.hand.z);
    reachWithHand(playerBody,'l',cashPinch.fromArray(pinchOffset(playerBody.rig)),cashTarget);
  }
}

/** WASTED or BUSTED: the picture drains and the word comes up while the world runs slow, and both go when the player is put back. */
function showEnding() {
  const ending=sim.ending,kind=ending?.kind||null;
  if(kind===endingShown)return;
  endingShown=kind;
  if(kind){audio.sceneCue(kind);interaction?.close();phone?.setOpen(false);}
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
const handStart=new THREE.Vector3(), gripHere=new THREE.Vector3(), gripGoal=new THREE.Vector3(), gripTurn=new THREE.Quaternion();
function aimLimb(joint, tip, offset, target){
  joint.worldToLocal(tip.localToWorld(gripHere.copy(offset)));
  joint.worldToLocal(gripGoal.copy(target));
  if(gripHere.lengthSq()>.00001 && gripGoal.lengthSq()>.00001)
    joint.quaternion.multiply(gripTurn.setFromUnitVectors(gripHere.normalize(),gripGoal.normalize()));
}
// Solve a two-link reach in the current bend plane. This preserves the elbow
// direction of the animation, including on a short arm and near full extension.
const shoulderAt=new THREE.Vector3(), elbowAt=new THREE.Vector3(), palmAt=new THREE.Vector3();
const reachAxis=new THREE.Vector3(), bendAxis=new THREE.Vector3(), elbowGoal=new THREE.Vector3(), jointOrigin=new THREE.Vector3();
function reachWithHand(body,side,offset,target){
  const {bones,rig}=body, shoulder=bones[rig.index.get('upperarm_'+side)];
  const elbow=bones[rig.index.get('lowerarm_'+side)], hand=bones[rig.index.get('hand_'+side)];
  reachJointChain(shoulder,elbow,hand,offset,target);
}
function reachJointChain(shoulder,elbow,hand,offset,target,bendHint=null,bendWeight=0){
  shoulder.getWorldPosition(shoulderAt);elbow.getWorldPosition(elbowAt);
  hand.localToWorld(palmAt.copy(offset));
  const upper=elbowAt.distanceTo(shoulderAt), lower=palmAt.distanceTo(elbowAt);
  reachAxis.subVectors(target,shoulderAt);
  const gap=reachAxis.length();
  if(gap<.0001) return;
  reachAxis.divideScalar(gap);
  bendAxis.subVectors(elbowAt,shoulderAt).normalize();
  if(bendHint)bendAxis.lerp(bendHint,bendWeight);
  bendAxis.addScaledVector(reachAxis,-bendAxis.dot(reachAxis));
  if(bendAxis.lengthSq()<1e-7){
    bendAxis.set(0,-1,0);
    if(Math.abs(reachAxis.y)>.95) bendAxis.set(1,0,0);
    bendAxis.addScaledVector(reachAxis,-bendAxis.dot(reachAxis));
  }
  const d=clamp(gap,Math.abs(upper-lower)+.0001,upper+lower-.0001);
  const along=(upper*upper-lower*lower+d*d)/(2*d);
  elbowGoal.copy(shoulderAt).addScaledVector(reachAxis,along)
    .addScaledVector(bendAxis.normalize(),Math.sqrt(Math.max(0,upper*upper-along*along)));
  aimLimb(shoulder,elbow,jointOrigin,elbowGoal);
  aimLimb(elbow,hand,offset,target);
}
// Fit only the delivery and first part of recovery. Keep the authored wind-up,
// supporting foot and follow-through, including on swings that miss.
const strikeAim=new THREE.Vector3(), strikeGoal=new THREE.Vector3(), strikeMarker=new THREE.Vector3();
const strikeOffset=new THREE.Vector3(), receiverJoint=new THREE.Vector3();
function fitStrikeContact(body,action) {
  figures?.trackContact?.(grabbedPerson || action?.target);
  if (!action?.point || sim.player.reaction) return;
  const {profile,point,target,timing}=action;
  const age=sim.elapsed-action.started, impactFrame=action.committed && !action.presented;
  const weight=impactFrame ? 1 : THREE.MathUtils.smoothstep(age,timing.contact*.45,timing.contact)*
    (1-THREE.MathUtils.smoothstep(age,timing.contact+.025,timing.contact+.14));
  if (!weight) return;
  const {side,limb}=profile, foot=limb==='foot', elbow=limb==='elbow';
  strikeAim.copy(point);
  if (!action.committed || impactFrame) {
    const joint=profile.joint;
    const officer=officerModels.get(target.id)?.body;
    const bone=officer?.bones[officer.rig.index.get(joint)];
    if (bone) {
      bone.getWorldPosition(receiverJoint).sub(officer.mesh.position);
      receiverJoint.x+=target.x;receiverJoint.y+=target.y||0;receiverJoint.z+=target.z;
    }
    if (bone || figures?.contactJoint?.(target,joint,receiverJoint)) {
      const dx=body.mesh.position.x-receiverJoint.x, dz=body.mesh.position.z-receiverJoint.z;
      const d=Math.hypot(dx,dz)||1, radius=(profile.joint==='neck_01' ? .13 : .18)*(target.look?.height||1.76)/1.76;
      strikeAim.set(receiverJoint.x+dx/d*radius,receiverJoint.y,receiverJoint.z+dz/d*radius);
    }
    if (impactFrame) Object.assign(point,{x:strikeAim.x,y:strikeAim.y,z:strikeAim.z});
  }
  const sides=action.clip==='palmPush'?['l','r']:[side];
  let error=Infinity;
  for (const hand of sides) {
    const joint=name=>body.bones[body.rig.index.get(name+'_'+hand)];
    const upper=joint(foot?'thigh':'upperarm'), lower=joint(foot?'calf':'lowerarm');
    const end=elbow?lower:joint(foot?'foot':'hand');
    strikeOffset.set(0,0,0);
    if (!elbow) strikeOffset.copy(joint(foot?'ball':'middle_01').position);
    const goal=strikeGoal.copy(strikeAim);
    if (sides.length===2) {
      const spread=hand==='l' ? .095 : -.095;
      goal.x+=spread*Math.cos(sim.player.angle);goal.z-=spread*Math.sin(sim.player.angle);
    }
    const actual=end.localToWorld(strikeMarker.copy(strikeOffset));
    actual.lerp(goal,weight);
    if (elbow) aimLimb(upper,lower,jointOrigin,actual);
    else reachJointChain(upper,lower,end,strikeOffset,actual);
    error=Math.min(error,end.localToWorld(strikeMarker.copy(strikeOffset)).distanceTo(goal));
  }
  if (impactFrame) {
    action.presented=true;
    action.touched=error<=.085 && sim.clearStrikePath(profile,strikeAim);
  }
}

// Cache contact points in their panel's coordinates so a rocking hood or door
// carries the planted palm with it. Raycast only when acquiring the handhold.
const climbRay=new THREE.Raycaster(), climbDown=new THREE.Vector3(0,-1,0);
const climbNormal=new THREE.Vector3(), climbForward=new THREE.Vector3(), climbAcross=new THREE.Vector3();
const climbBasis=new THREE.Matrix4(), climbTurn=new THREE.Quaternion(), handTurn=new THREE.Quaternion();
const wristTarget=new THREE.Vector3(), palmOffset=new THREE.Vector3(), shoulderShift=new THREE.Vector3();
const gripFrames=new WeakMap();
function findCarGrip(mesh,move,side,width,angle){
  const sx=Math.sin(angle),sz=Math.cos(angle), pieces=Object.values(mesh.userData.detail.pieces)
    .filter(panel=>panel.visible && panel.parent.visible);
  const start=move.grip, spread=(side==='l'?1:-1)*width;
  let best=null,score=Infinity;
  for(const fraction of [1,.70,.40]){
    for(const i of [2,1,3,0,4,-1,5,-2,6,-3,7,8,9,10,11]){
      const depth=i*.045,offset=fraction*spread;
      if(Math.abs(depth-.09)>=score)break;
      climbRay.ray.origin.set(start.x+sx*depth+sz*offset,start.y+2,start.z+sz*depth-sx*offset);
      climbRay.ray.direction.copy(climbDown);
      const hit=climbRay.intersectObjects(pieces,false)[0];
      if(!hit)continue;
      climbNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if(climbNormal.y<.36)continue;
      const cost=Math.abs(depth-.09)+.6*(1-fraction)+.9*Math.abs(hit.point.y-(move.kind==='climb'?move.to.y:start.y))+.28*(1-climbNormal.y);
      if(cost>=score)continue;
      score=cost;
      best={panel:hit.object,point:hit.object.worldToLocal(hit.point),normal:hit.face.normal.clone()};
    }
    if(best)break;
  }
  return best;
}
function fitVehicleHands(body,p,mesh){
  const move=p.move, phase=move.t/move.T, mantle=move.kind==='climb';
  const planting=THREE.MathUtils.smoothstep(phase,0,.16);
  const weight=planting*(1-THREE.MathUtils.smoothstep(phase,mantle?.66:.39,mantle?.82:.54));
  if(!weight)return;
  mesh.updateWorldMatrix(true,true);
  let holds=gripFrames.get(move);
  if(!holds || holds.mesh!==mesh){
    const {rig,bones}=body;
    const thighs=['l','r'].map(side=>bones[rig.index.get('thigh_'+side)]);
    holds={mesh,hands:[],thighs,legTurns:thighs.map(()=>new THREE.Quaternion())};
    for(const side of mantle?['l','r']:['l']){
      const upper=bones[rig.index.get('upperarm_'+side)],lower=bones[rig.index.get('lowerarm_'+side)],hand=bones[rig.index.get('hand_'+side)];
      const grip=findCarGrip(mesh,move,side,rig.height*.115,p.angle);
      if(!grip)continue;
      const offset=new THREE.Vector3().fromArray(rig.bones[rig.index.get('middle_01_'+side)].t).multiplyScalar(.72);
      offset.x+=(side==='l'?1:-1)*.014;
      holds.hands.push({...grip,side,upper,lower,hand,offset,wrist:new THREE.Vector3(),turn:new THREE.Quaternion()});
    }
    gripFrames.set(move,holds);
  }
  for(const h of holds.hands){
    climbNormal.copy(h.normal).transformDirection(h.panel.matrixWorld);
    climbForward.set(Math.sin(p.angle),0,Math.cos(p.angle));
    climbForward.addScaledVector(climbNormal,-climbForward.dot(climbNormal)).normalize();
    // The knuckles point up the panel while the palm faces into it.
    climbAcross.copy(climbNormal).multiplyScalar(h.side==='l'?-1:1);
    climbBasis.makeBasis(climbAcross,climbForward,reachAxis.crossVectors(climbAcross,climbForward));
    h.turn.setFromRotationMatrix(climbBasis);
    h.panel.localToWorld(h.wrist.copy(h.point)).sub(palmOffset.copy(h.offset).applyQuaternion(h.turn));
  }
  // Share load with the legs: keep the shoulders within arm's reach as
  // the hips rise and the lead foot takes over. Do not stretch the arms.
  if(mantle && holds.hands.length){
    // Hinge at the waist before shifting weight. A low hood takes a deeper
    // forward bend than a roof rail, while the legs keep their footholds.
    const pelvis=body.bones[body.rig.index.get('pelvis')],spine=body.bones[body.rig.index.get('spine_01')];
    const {thighs,legTurns}=holds;
    thighs.forEach((thigh,i)=>thigh.getWorldQuaternion(legTurns[i]));
    holds.hands[0].upper.getWorldPosition(shoulderAt);
    const drop=shoulderAt.y-holds.hands[0].wrist.y;
    const lean=THREE.MathUtils.smoothstep(drop,.10,1.05)*1.95*weight;
    for(const [joint,share] of [[pelvis,.68],[spine,.32]]){
      joint.parent.getWorldQuaternion(climbTurn);
      reachAxis.set(Math.cos(p.angle),0,-Math.sin(p.angle)).applyQuaternion(climbTurn.invert());
      joint.quaternion.premultiply(handTurn.setFromAxisAngle(reachAxis,share*lean));
    }
    thighs.forEach((thigh,i)=>{
      thigh.parent.getWorldQuaternion(climbTurn);
      thigh.quaternion.copy(climbTurn.invert().multiply(legTurns[i]));
    });
    shoulderShift.set(0,0,0);
    for(let pass=0;pass<3;pass++)for(const h of holds.hands){
      h.upper.getWorldPosition(shoulderAt).add(shoulderShift);
      reachAxis.subVectors(h.wrist,shoulderAt);
      const length=reachAxis.length(),span=h.lower.position.length()+h.hand.position.length()-.015;
      if(length>span)shoulderShift.addScaledVector(reachAxis,(length-span)/length);
    }
    body.mesh.position.addScaledVector(shoulderShift,weight);
  }
  for(const h of holds.hands){
    const load=mantle && h.side==='r' ? planting*(1-THREE.MathUtils.smoothstep(phase,.59,.76)) : weight;
    h.hand.getWorldPosition(wristTarget).lerp(h.wrist,load);
    h.hand.getWorldQuaternion(handTurn).slerp(h.turn,load);
    reachJointChain(h.upper,h.lower,h.hand,jointOrigin,wristTarget);
    h.hand.parent.getWorldQuaternion(climbTurn);
    h.hand.quaternion.copy(climbTurn.invert().multiply(handTurn));
  }
}
// Hold the ball of the stance foot in world X/Z as the pelvis travels or
// turns. Keep the clip's vertical lift and shoe pitch through heel-to-toe roll.
const stridePlants = ['l', 'r'].map(side => ({side, cycle: -1, point: new THREE.Vector3()}));
const soleAt = new THREE.Vector3(), soleOffset = new THREE.Vector3(), ankleGoal = new THREE.Vector3();
function plantStrideFeet(body, cycle, player) {
  const {bones, rig} = body, speed = player?.speed || 0;
  const duty = THREE.MathUtils.lerp(.54, .21, THREE.MathUtils.smoothstep(speed, 1.85, 3.95));
  for (const plant of stridePlants) {
    const footCycle = cycle + (plant.side === 'r' ? .5 : 0), phase = footCycle % 1;
    if (speed < .12 || phase >= duty) { plant.cycle = -1; continue; }
    const bone = name => bones[rig.index.get(name + '_' + plant.side)];
    const ankle = bone('foot');
    bone('ball').getWorldPosition(soleAt);
    if (plant.cycle !== Math.floor(footCycle) || plant.body !== body || plant.point.distanceToSquared(soleAt) > .35) {
      plant.cycle = Math.floor(footCycle); plant.body = body;
      plant.point.copy(soleAt);
      // Sample once per contact, using the same deck/curb selection as walking.
      plant.floor = sim.room || sim.subway ? player.y : streetSurface(soleAt.x, soleAt.z, {
        referenceHeight: player.y, transportId: player.transportId, mode: 'walk',
      })?.elevation ?? player.y;
    }
    soleOffset.subVectors(plant.point, soleAt);
    const load = THREE.MathUtils.smoothstep(phase / duty, 0, .20);
    soleOffset.y = clamp(plant.floor - player.y, -.14, .16) * load;
    const release = (1 - THREE.MathUtils.smoothstep(phase / duty, .67, 1)) * THREE.MathUtils.smoothstep(speed, .12, .8);
    ankle.getWorldPosition(ankleGoal).addScaledVector(soleOffset.clampLength(0, .18), release);
    ankle.getWorldQuaternion(handTurn);
    reachJointChain(bone('thigh'), bone('calf'), ankle, jointOrigin, ankleGoal);
    ankle.parent.getWorldQuaternion(climbTurn);
    ankle.quaternion.copy(climbTurn.invert().multiply(handTurn));
  }
}

const forkHead=new THREE.Vector3(),forkTarget=new THREE.Vector3(),forkAxis=new THREE.Vector3();
const cashPinch=new THREE.Vector3(),forkTurn=new THREE.Quaternion(),forkUp=new THREE.Vector3(0,1,0);
const biteColors={steak:0x955536,rice:0xe8ddbb,eggs:0xe6bc52,sushi:0xe29265,pizza:0xce8f45,pasta:0xd9a554};
function mealMotion(item){
  const meal=sim.shopping.eating;
  if(!meal || meal.carry!==item)return null;
  const phase=Math.max(0,sim.elapsed-meal.start)%meal.duration/meal.duration;
  const travel=phase<.55?clamp((phase-.12)/.43,0,1):clamp((1-phase)/.36,0,1);
  return {lift:travel*travel*(3-2*travel),loaded:phase>=.12 && phase<.58,color:biteColors[meal.style]??0xbf905f};
}
function paymentReach(payment){
  return Math.sin(Math.PI*clamp((sim.elapsed-payment.start)/.72,0,1));
}
function eatFromPlate(body,plate,eating){
  const lift=eating.lift;
  const {mesh,bones,rig}=body;
  for(const [i,q] of fingerPose(rig,'pinch','r'))bones[i].quaternion.fromArray(q);
  const wrist=bones[rig.index.get('hand_r')],offset=cashPinch.fromArray(pinchOffset(rig,'r'));
  mesh.worldToLocal(bones[rig.index.get('Head')].getWorldPosition(forkHead));
  forkHead.z+=.102;forkHead.y+=.012;
  forkAxis.set(.66-.5*lift,-.46+.84*lift,.58-1.42*lift).normalize();
  forkTarget.copy(plate);forkTarget.y+=.047;
  forkTarget.lerp(forkHead,lift).addScaledVector(forkAxis,-.126);
  reachWithHand(body,'r',offset,mesh.localToWorld(forkTarget));
  mesh.worldToLocal(wrist.localToWorld(forkTarget.copy(offset)));
  playerItems.add('fork',forkTarget,0,forkTurn.setFromUnitVectors(forkUp,forkAxis));
  if(eating.loaded)playerItems.add('morsel',forkTarget,0,forkTurn,eating.color);
}

const skateTarget = new THREE.Vector3(), skateRotation = new THREE.Quaternion(), skateParent = new THREE.Quaternion();
// During the mantle each foot rises on the approach side before swinging onto
// its landing spot. Both soles continue sampling the local roof as the gait resumes.
const vehicleFoot=new THREE.Vector3(), animatedFoot=new THREE.Vector3(), kneeOut=new THREE.Vector3(), toeAt=new THREE.Vector3();
function fitVehicleFeet(body,p,car){
  const {rig,bones}=body, move=p.move, sx=Math.sin(p.angle), sz=Math.cos(p.angle);
  for(const side of ['l','r']){
    const index=rig.index.get('foot_'+side), ankle=bones[index];
    const sole=rig.world[index].p[1]+.03, width=rig.height*(side==='l'?.075:-.075);
    ankle.getWorldPosition(animatedFoot);
    vehicleFoot.copy(animatedFoot);
    let bendWeight=0,flatWeight=0;
    if(move?.kind==='climb'){
      const phase=move.t/move.T, lead=side==='r';
      // Open the knee toward the side while the shin is below the panel.
      // The recorded knee points forward into the door during this part.
      bendWeight=THREE.MathUtils.smoothstep(phase,.10,.25)*(1-THREE.MathUtils.smoothstep(phase,.55,.75));
      const outward=side==='l'?1:-1;
      kneeOut.set(outward*sz-.25*sx,0,-outward*sx-.25*sz).normalize();
      const lift=THREE.MathUtils.smoothstep(phase,lead?.16:.30,lead?.52:.69);
      const over=THREE.MathUtils.smoothstep(phase,lead?.52:.69,lead?.76:.94);
      flatWeight=THREE.MathUtils.smoothstep(phase,lead?.16:.30,lead?.46:.64)*(1-THREE.MathUtils.smoothstep(phase,.85,1));
      const blend=THREE.MathUtils.smoothstep(phase,.05,.21)*(1-THREE.MathUtils.smoothstep(phase,.86,1));
      const x=move.to.x+sz*width,z=move.to.z-sx*width;
      const top=carTop(car,x,z,.04)??move.to.y;
      const bx=move.grip.x-.38*sx+sz*width,bz=move.grip.z-.38*sz-sx*width;
      vehicleFoot.set(bx+(x-bx)*over,move.from.y+sole+(top-move.from.y)*lift+
        .14*Math.sin(Math.PI*over),bz+(z-bz)*over).lerp(animatedFoot,1-blend);
    }
    // Include the toe on an upslope, where sampling only the heel cuts the shoe into the hood.
    const beneath=()=>Math.max(carTop(car,vehicleFoot.x,vehicleFoot.z)??-Infinity,
      carTop(car,vehicleFoot.x+.14*sx,vehicleFoot.z+.14*sz)??-Infinity);
    let surface=beneath();
    if(move?.kind==='climb'){
      const phase=move.t/move.T,release=side==='r'?.52:.69;
      const hip=bones[rig.index.get('thigh_'+side)].getWorldPosition(shoulderAt);
      const tuckedHeight=1-THREE.MathUtils.smoothstep(Math.abs(vehicleFoot.y-hip.y),.13,.43);
      const back=(vehicleFoot.x-hip.x)*sx+(vehicleFoot.z-hip.z)*sz;
      const clearance=Math.max(0,back+.23)*tuckedHeight*(1-THREE.MathUtils.smoothstep(phase,release,release+.14));
      vehicleFoot.x-=sx*clearance;vehicleFoot.z-=sz*clearance;
      surface=beneath();
      const tuck=1-THREE.MathUtils.smoothstep(phase,release-.11,release);
      vehicleFoot.y-=Math.max(0,vehicleFoot.y-hip.y+.20)*tuck;
      // Slide the shoe clear of a side panel while lifting it. Raising a
      // street-level foot directly onto the roof here produces a visible pop.
      if(phase<release+.12){
        for(let i=0;i<15 && surface+sole>vehicleFoot.y+.05;i++){
          vehicleFoot.x-=sx*.03;vehicleFoot.z-=sz*.03;surface=beneath();
        }
      }
    }
    if(move?.kind==='vault' && surface+sole>vehicleFoot.y+.05){
      const outward=move.t<move.T*.5?-1:1;
      for(let i=0;i<22 && surface+sole>vehicleFoot.y+.05;i++){
        vehicleFoot.x+=outward*sx*.03;vehicleFoot.z+=outward*sz*.03;surface=beneath();
      }
    }
    vehicleFoot.y=Math.max(vehicleFoot.y,surface+sole);
    const toe=bones[rig.index.get('ball_'+side)];
    toe.getWorldPosition(toeAt);
    const toeSurface=carTop(car,toeAt.x,toeAt.z);
    const toeLow=toeSurface!==null && toeAt.y<toeSurface+.03;
    if(!toeLow && !bendWeight && vehicleFoot.distanceToSquared(animatedFoot)<1e-7)continue;
    reachJointChain(bones[rig.index.get('thigh_'+side)],bones[rig.index.get('calf_'+side)],ankle,jointOrigin,vehicleFoot,kneeOut,bendWeight);
    // Place the sole flat when bearing weight; leave the swing orientation in the air.
    if(toeLow || vehicleFoot.y<=surface+sole+.035)flatWeight=1;
    if(flatWeight){
      body.mesh.getWorldQuaternion(skateRotation).multiply(skateParent.fromArray(rig.world[index].q));
      ankle.parent.getWorldQuaternion(skateParent);
      ankle.quaternion.slerp(skateParent.invert().multiply(skateRotation),flatWeight);
    }
  }
}
function plantSkateFeet(body,p) {
  const {rig,bones}=body, phase=p.board.phase;
  for(const side of ['l','r']){
    const ankleIndex=rig.index.get('foot_'+side), ankle=bones[ankleIndex];
    let x=.045, y=.096, z=side==='l'?.20:-.20;
    if(side===(p.board.pushFoot<0?'l':'r') && p.board.pushing){
      const stroke=Math.sin(Math.PI*phase)**2;
      x+=stroke*.26*p.board.pushFoot;
      z+=.28*Math.sin(phase*Math.PI*2);
      y+=phase<.54 ? -.096*Math.sin(Math.PI*phase/.54)**2 : .14*Math.sin(Math.PI*(phase-.54)/.46)**2;
    }
    if(side==='r' && p.board.braking){ x+=.22; y=0; z=-.23; }
    if(!p.grounded && !p.board.grind){
      const tuck=Math.sin(Math.PI*Math.min(1,p.board.airTime/.55));
      y+=.14*tuck;z+=(side==='l'?1:-1)*.05*tuck;
    }
    y+=.31*p.board.tuck;
    boardMesh.localToWorld(skateTarget.set(x,y+rig.world[ankleIndex].p[1],z));
    body.mesh.getWorldQuaternion(skateRotation);
    skateRotation.multiply(skateParent.fromArray(rig.world[ankleIndex].q));
    reachJointChain(bones[rig.index.get('thigh_'+side)],bones[rig.index.get('calf_'+side)],ankle,jointOrigin,skateTarget);
    ankle.parent.getWorldQuaternion(skateParent);
    ankle.quaternion.copy(skateParent.invert().multiply(skateRotation));
  }
}
const gripOffset=new THREE.Vector3(0,.075,0), simpleGrip=new THREE.Vector3(0,-.62,.008), cashTarget=new THREE.Vector3();

// Officers need live hand and spine joints so their aim can follow a moving target.
const barrelOrigin=new THREE.Vector3(), barrelTip=new THREE.Vector3(), sightTarget=new THREE.Vector3();
const butt=new THREE.Vector3(0,-.025,.005);
const supportShoulder=new THREE.Vector3(), supportElbow=new THREE.Vector3(), supportPalm=new THREE.Vector3(), handGoal=new THREE.Vector3();
const firingWrist=new THREE.Quaternion(), wristParent=new THREE.Quaternion();
const aimRotation=new THREE.Quaternion();
function aimHeldGun(body,gun,target,turnLimit){
  const {bones,rig}=body,spine=bones[rig.index.get('spine_02')];
  // Measure the barrel and desired direction in the joint's own space.
  spine.worldToLocal(gun.getWorldPosition(barrelOrigin));
  spine.worldToLocal(gun.localToWorld(barrelTip.set(0,0,1))).sub(barrelOrigin).normalize();
  spine.worldToLocal(target).sub(barrelOrigin).normalize();
  gripTurn.setFromUnitVectors(barrelTip,target);
  aimRotation.identity().rotateTowards(gripTurn,turnLimit);
  spine.quaternion.multiply(aimRotation);
  gun.localToWorld(target.copy(butt));
  // Keep the support hand on the grip as the upper body turns.
  bones[rig.index.get('upperarm_l')].getWorldPosition(supportShoulder);
  bones[rig.index.get('lowerarm_l')].getWorldPosition(supportElbow);
  bones[rig.index.get('hand_l')].localToWorld(supportPalm.copy(gripOffset));
  const reach=supportShoulder.distanceTo(supportElbow)+supportElbow.distanceTo(supportPalm)-.025;
  const gap=supportShoulder.distanceTo(target);
  if(gap>reach){
    const wrist=bones[rig.index.get('hand_r')];
    wrist.getWorldQuaternion(firingWrist);
    wrist.getWorldPosition(handGoal);
    handGoal.addScaledVector(supportShoulder.sub(target),1-reach/gap);
    reachWithHand(body,'r',jointOrigin,handGoal);
    wrist.quaternion.copy(wrist.parent.getWorldQuaternion(wristParent).invert()).multiply(firingWrist);
    gun.localToWorld(target.copy(butt));
  }
  reachWithHand(body,'l',gripOffset,target);
}
function drawOfficers(dt,p,extras){
  const officers=sim.police.officers.concat(sim.police.downOfficers);
  for(const [id,model] of officerModels){
    if(officers.some(officer=>officer.id===id)) continue;
    scene.remove(model.body.mesh); model.body.dispose();
    model.gun?.traverse(part=>{part.geometry?.dispose();part.material?.dispose();});
    officerModels.delete(id);
  }
  for(const officer of officers){
    const look=officer.look ??= patrolAppearance(officer.carId,officer.uniform,officer.unit), member=look.member, r=officer.reaction;
    let model=officerModels.get(officer.id), built=uniformBuilds.get(member);
    if(!model && !built && bodyShop){
      uniformBuilds.set(member,'loading');
      bodyShop.member(member,'near').then(result=>uniformBuilds.set(member,result))
        .catch(()=>uniformBuilds.delete(member));
    }
    if(!model && built && built!=='loading'){
      const body=createHumanMesh(built,built.look);
      body.mesh.traverse(part=>part.layers.enable(ROOM_LAYER));scene.add(body.mesh);
      model={body,gun:createGun(body),animator:createAnimator(moves),fitted:{q:[],pelvis:[0,0,0]}};
      officerModels.set(officer.id,model);
    }
    if(!model){
      extras.push({contactActor:officer,x:officer.x,y:officer.y||0,z:officer.z,heading:officer.angle,phase:officer.phase,
        stride:officer.stride,look,member,reaction:r,clip:r?.clip || (officer.cuffing?'cuffing':officer.aiming?'aim':undefined),time:r?.time??elapsed});
      continue;
    }
    const {body,gun,animator,fitted}=model, {mesh,rig}=body;
    mesh.visible=Boolean(crowd?.mesh.visible);
    if(!mesh.visible) continue;
    mesh.position.set(officer.x,officer.y||0,officer.z);mesh.rotation.y=officer.angle;
    const pose=animator.update(dt,{walkStyle:castWalkStyle(member),speed:officer.speed,strideScale:rig.stride,grounded:!officer.airborne,vy:officer.vy,aim:officer.aiming,held:officer.cuffing?'cuffing':null});
    if(r) moves.sample(r.clip,r.time,pose);
    fitPose(moves,rig,pose,fitted);
    if(r?.fall)fitFallPose(rig,fitted,r,officer.angle);
    body.pose(fitted);
    if(!gun) continue;
    gun.visible=Boolean(officer.aiming && !officer.cuffing && !r);
    if(!gun.visible) continue;
    sightTarget.set(p.x,(p.y||0)+(sim.police.arrest>.6 ? .85 : 1.17),p.z);
    aimHeldGun(body,gun,sightTarget,.95);
  }
}
let nextShopDrive = 0;
function updateShoppingDrivers() {
  const stores=[];
  for (const view of storefronts.rooms) {
    if (view.closed || !view.menu?.length || !shopOpen(view.plan.place)) continue;
    const {x,z,nx,nz}=view.plan;
    stores.push({id:view.plan.place.id,x,z,nx,nz,y:view.floor});
  }
  crowd.updateShoppingDrivers(sim,availableKerbParking(),stores,driverAppearance);
}

function syncScene(dt,controls) {
  const p=sim.player, eyeView=firstPersonActive();
  const cycling=p.mode==='bike', skating=p.mode==='skate';
  if(boardMesh){
    boardMesh.visible=skating;
    if(skating){
      const wheelLift=p.grounded ? .246*Math.abs(Math.sin(p.board.pop)) : 0;
      boardMesh.position.set(p.x,p.y+wheelLift,p.z);
      boardMesh.userData.deck.position.y=.096+.31*p.board.tuck;
      boardMesh.rotation.set(p.board.pitch+p.board.pop,p.angle+p.board.spin+(p.board.switch?Math.PI:0),p.board.lean);
      boardMesh.userData.deck.rotation.set(0,p.board.shove,p.board.roll);
    }
  }
  const ride=sim.transport.active, type=ride?.home.type;
  const openRide=type==='scooter'||type==='motorcycle'||type==='kayak';
  phoneHand?.advance(dt,Boolean(phone?.open && !sim.ending),phone?.pressPhase==='pressing',firstPersonActive());
  transportScene.update(p,elapsed,started&&!cityView,eyeView);
  if(bikeDocks){
    const id=sim.bike?.id??null;
    if(id!==borrowedDock){borrowedDock=id;bikeDocks.setPersonal(Boolean(sim.bike?.personal));bikeDocks.update(bikeRows,id);}
    bikeDocks.rental.visible=Boolean(sim.bike);
    if(sim.bike){
      const at=cycling?p:sim.bike;
      if(cycling){bikeDocks.rental.scale.setScalar((playerBody?.rig.height||PLAYER_LOOK.height||1.76)/1.76);bikeWheel+=dt*p.speed/(.345*bikeDocks.rental.scale.x);bikePedal+=dt*Math.min(1.55,Math.abs(p.speed)/4.3);}
      bikeDocks.pedal(bikeWheel,bikePedal*2*Math.PI/PEDAL_PERIOD);
      bikeDocks.rental.position.set(at.x,at.y,at.z);bikeDocks.rental.rotation.y=at.angle;
    }
  }
  if(sim.room&&!sim.seat&&sim.doorway?.take?.heading!=null)p.angle=sim.doorway.take.heading;
  else if(sim.room&&p.armed&&!sim.seat&&!aerialView&&!cityView)p.angle=yaw;
  const occupiedRoom=sim.room&&sim.doorway;
  storefronts?.setActive(occupiedRoom||null);
  roomGroup=occupiedRoom?.group||null;
  if(roomGroup)roomGroup.userData.floorY=occupiedRoom.floor;
  // Kerbside cars are drawn together, and so is traffic more than a few car
  // lengths off. The player's car, a patrol, a car left standing in the road
  // and whatever traffic is close by each have a model of their own, with
  // wheels that turn and steer.
  if (started && !cityView && !paused && !mapOpen && storefronts && crowd && (sim.elapsed>=nextShopDrive || nextShopDrive-sim.elapsed>2)) {
    nextShopDrive=sim.elapsed+1;
    updateShoppingDrivers();
  }
  const activeCars=new Set(), batchedParked=[];distantCars.length=0;
  for(const car of sim.cars){
    const away=Math.hypot(car.x-p.x,car.z-p.z);
    // The batches show intact, closed windows. Keep cracked, missing and open panes on the articulated car.
    if(away<CAR_SIGHT && hasAlteredGlazing(car)){
      activeCars.add(car.id);continue;
    }
    if(car._kerb && away > (carModels.has(car.id) ? 14 : 10) && !(car.damage && away < MODEL_RANGE)){
      batchedParked.push(car);continue;
    }
    if(car.controlled||car.type==='police'||!car._edge||!distantTraffic||away<(carModels.has(car.id)?MODEL_KEPT:MODEL_RANGE))activeCars.add(car.id);
    else if(away<CAR_SIGHT)distantCars.push(car);
  }
  for(const [id,mesh] of carModels)if(!activeCars.has(id)){scene.remove(mesh);carModels.delete(id);}
  parkedCars?.update(batchedParked,null,camera.position);
  const extras=[], pedestrians=[];
  if(bikeTraffic){
    bikeTraffic.update(p,dt,{visible:started&&!cityView&&!aloft&&!traveling,
      player:p,cars:sim.cars,people:crowd?.people,junctions:sim.junctions,hours:gfx.hours,time:sim.elapsed,
      contactCar:(x,z,y)=>sim._nearCar(x,z,.30,null,y),
      blocked:(x,z,y)=>sim.isBlocked(x,z,.35,{baseHeight:y})});
    extras.push(...bikeTraffic.figures);
    pedestrians.push(...bikeTraffic.riders.filter(r=>!r.abandoned));
  }
  function drawDriver(car,seat){
    if(!crowd?.mesh.visible)return false;
    const look=driverAppearance(car), scale=look.height/1.76, ahead=.31*scale;
    extras.push({x:seat.x+Math.sin(car.angle)*ahead,y:seat.y-.54*scale,
      z:seat.z+Math.cos(car.angle)*ahead,heading:car.angle,look,clip:'drive',carry:car.onPhone?'phone':null,sitting:true,time:elapsed});
    return true;
  }
  distantTraffic?.update(distantCars,drawDriver,camera.position);
  // Bags are at the kerb from the evening before a collection day until the truck has been the next morning.
  if(gfx){if(clockWas!==null&&gfx.hours<clockWas-12)weekday=(weekday+1)%7;clockWas=gfx.hours;work?.advanceShopClock(weekday,gfx.hours);trashMesh?.show(weekday,gfx.hours);if(trashMesh&&cityView&&!viewOverride)trashMesh.mesh.visible=false;}
  // Once the modelled figures are in, the player and whoever is serving are drawn as two of them.
  const modelled=Boolean(crowd?.modelled),pace=Math.abs(p.speed);
  // Indoors the player stands on the room's floor, which is laid level a little above the highest ground under it. Their
  // own height follows the ground outside, which on a sloping block is lower at one end of the shop: left to that, their
  // feet (and any shoes being tried on) sink into the floorboards. A jump or a fall still shows as one.
  const roomFloor=sim.room?roomGroup?.userData.floorY:undefined;
  const playerFloor=Number.isFinite(roomFloor)&&p.grounded!==false&&!p.reaction&&Math.abs((p.y??roomFloor)-roomFloor)<.75?roomFloor:p.y??roomGroup?.userData.floorY??0;
  if(storefronts)for(const view of storefronts.rooms){
    if(view.plan.grocerySlots)view.shopping=sim.shopping;
    view.group.userData.syncGroceries?.(sim.shopping,sim.room?.place.id===view.plan.place.id || Math.hypot(p.x-view.plan.x,p.z-view.plan.z)<14);
    view.nearbyPeople=crowd?.nearbyPeople;
    view.player=p;
    view.door.step(dt);view.group.userData.updateDoor();
    if(!mapOpen&&!paused&&!aerialView&&!cityView&&!viewOverride&&!traveling&&started){
      const gunfire=roomUnderFire(view,sim.elapsed);
      if(gunfire && sim.shopping.order?.view===view)sim.shopping.cancelOrder();
      else stepCounterOrder(sim,view,dt);
      if(view===sim.doorway && !interaction?.open && !phone?.open)promptTableService({$,sim,interaction,work,sale:(place,amount,tender)=>work.sale(place,amount,tender),save:saveProgress});
      if(gunfire || !interaction?.open)updateClerk(view,sim,yaw,eyeView?headPitch:0,dt,work,{
        outside:actor=>crowd.fleeOntoStreet(actor),palm:actor=>crowd.palm(actor),firstPerson:eyeView,
        playerHand:()=>{
          const hand=playerBody?.bones[playerBody.rig.index.get('hand_l')];
          const joint=hand || (avatar.visible && avatar.userData.arms?.[1]);
          if(!joint)return null;
          const point=joint.localToWorld(hand?gripHere.fromArray(pinchOffset(playerBody.rig)):gripHere.copy(simpleGrip));
          return {x:point.x,y:point.y-view.floor,z:point.z};
        }
      });
    }
    for (const actor of view.actors) {
      if (actor.gone) continue;
      if (actor.spot.treadmill && !actor.escape && !actor.reaction) {
        actor.time = sim.elapsed * actor.spot.cadence + actor.spot.offset;
        actor.clip = 'jog'; actor.stride = 1; actor.phase = actor.time * 7;
      }
      actor.suspendCarry=Boolean(actor===view.clerk && view.handoff);
      if(!actor.escape && !actor.reaction)actor.y = view.floor + (actor.sitting ? 0 : actor.lift);
      extras.push(actor);pedestrians.push(actor);
    }
    if(dt&&started&&!cityView&&!aerialView&&shopOpen(view.plan.place))inviteCustomer(view,crowd.people,sim.elapsed,(shop,price)=>work.sale(shop,price,'customer'),()=>sim.seat);
  }
  playerStride+=pace*Math.min(.25,Math.max(0,elapsed-strideClock))*3.3;strideClock=elapsed;
  {
    // Diners sit out from late morning until the kitchens close.
    const bystanders=sim.bystanders;
    bystanders.length=0;
    if(subwayVisit)bystanders.push(...subwayVisit.actors);
    if(gfx.hours>=11&&gfx.hours<23)for(const diner of diners)if(!(diner.absentUntil>sim.elapsed) && (!sim.seat||Math.hypot(sim.seat.x-diner.x,sim.seat.z-diner.z)>.2))bystanders.push(diner);
    // A newsstand is minded from before dawn; a fruit cart through the day.
    for(const vendor of vendors)if(!(vendor.absentUntil>sim.elapsed) && (vendor.fruit?gfx.hours>=7&&gfx.hours<20:gfx.hours>=5&&gfx.hours<23))bystanders.push(vendor);
    extras.push(...bystanders);pedestrians.push(...bystanders);
  }
  if(modelled){
    if(p.mode==='walk'&&!eyeView&&!playerBody){
      const action=sim.meleeAction, age=action && sim.elapsed-action.started;
      const clip=action?.clip || (sim.doorway?.take?'pickUp':null);
      const time=clip==='jab' ? .12+age*2 : clip==='cross' ? .16+age*2 : age ?? sim.doorway?.take?.clipTime;
      extras.push({x:p.x,y:playerFloor,z:p.z,heading:p.angle,phase:playerStride,stride:Math.min(1,pace/1.2),
        sitting:Boolean(sim.seat),seat:sim.seat,clip,time,look:PLAYER_LOOK,subway:Boolean(subwayVisit)});
    }
    if(cycling&&!eyeView&&!playerBody)extras.push({x:p.x,y:playerFloor,z:p.z,heading:p.angle,cycling:true,clip:p.speed<.18?'cycleStop':'cycle',time:bikePedal,phase:bikePedal*2*Math.PI/PEDAL_PERIOD,look:PLAYER_LOOK});
    if(openRide&&!eyeView&&!playerBody){
      const offset=type==='motorcycle'?-.38:type==='kayak'?-.24:0;
      extras.push({x:p.x+Math.sin(p.angle)*offset,z:p.z+Math.cos(p.angle)*offset,
        y:p.y+(type==='kayak' ? -.20 : type==='motorcycle' ? .34 : .22),heading:p.angle,sitting:type!=='scooter',look:PLAYER_LOOK});
    }
  }
  if(!modelled&&sim.seat&&!eyeView&&!playerBody)extras.push({x:p.x,y:playerFloor,z:p.z,heading:p.angle,sitting:true,seat:sim.seat,look:PLAYER_LOOK});
  policeScene.drawDetails(started && !cityView && !aloft && !traveling, paused || mapOpen ? 0 : dt,
    {ground:groundHeight,blocked:(x,z)=>sim.isBlocked(x,z,.33),people:crowd?.people || [],player:p,waterLevel:WATER_LEVEL,
      bystanders:sim.bystanders,time:sim.elapsed,incident:sim.heat>0 ? sim.police.lastKnown : null},extras,pedestrians,sim.police);
  avatar.visible=!atmTerminal?.active && (skating||(p.mode==='walk'||cycling||openRide)&&!modelled)&&!sim.seat&&!eyeView;avatar.position.set(p.x,playerFloor,p.z);avatar.rotation.y=p.angle;
  animatePerson(avatar,Math.abs(p.speed)>.1,elapsed,Math.abs(p.speed)/3);
  const take=sim.room && !sim.seat && sim.doorway?.take;
  if(avatar.visible && avatar.userData.arms?.[1]){
    const arm=avatar.userData.arms[1];
    arm.rotation.y=0; arm.rotation.z=.07;
    if(take?.hand)aimLimb(arm,arm,simpleGrip,cashTarget.set(take.hand.x,playerFloor+take.hand.y,take.hand.z));
  }
  if(avatar.visible && !playerBody && sim.meleeAction) {
    const {profile,timing,started}=sim.meleeAction;
    const age=sim.elapsed-started;
    const reach=THREE.MathUtils.smoothstep(age,0,timing.contact)*
      (1-THREE.MathUtils.smoothstep(age,timing.contact,timing.seconds));
    const foot=profile.limb==='foot', side=profile.side==='l'?1:0;
    const limb=(foot?avatar.userData.legs:avatar.userData.arms)[side];
    limb.rotation.x-=reach*(profile.low ? .72 : 1.55);
  }
  if(skating && avatar.visible){avatar.rotation.y-=Math.PI/2;avatar.position.y+=.09;}
  if(playerBody&&animator){avatar.visible=false;showPlayer(dt,p,playerFloor,eyeView,cycling||openRide);}
  // Capture the player's posed contact before drawing the receiving officer
  // or pedestrian, including when a bystander becomes a simulated actor here.
  for (let i=0;i<sim.moveEvents.length;) {
    const event=sim.moveEvents[i];
    if (event.kind==='punch' || event.kind==='kick') {
      sim.moveEvents.splice(i,1);
      const hit=resolveMelee(event);
      if (hit) {
        const slot=extras.findIndex(extra=>(extra.contactActor || extra)===hit);
        if (slot>=0) extras.splice(slot,1);
      }
    } else i++;
  }
  drawOfficers(dt,p,extras);
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
  if(phoneHand?.amount && !eyeView && !playerBody && (p.mode==='walk'||cycling||openRide)){
    const lift=phoneHand.amount, arm=avatar.visible && avatar.userData.arms?.[0];
    if(arm){
      arm.rotation.x-=1.5*lift;
      arm.localToWorld(phonePalm.set(0,-.60,.02));avatar.worldToLocal(phonePalm);
      phoneHand.hold(avatar,phonePalm.x,phonePalm.y+.05,phonePalm.z,false);
    } else {
      const height=(sim.seat?seatHeight(sim.seat)+.62:1.18)+.17*lift;
      phoneTarget.set(-.16,height,.24*lift).applyAxisAngle(THREE.Object3D.DEFAULT_UP,p.angle);
      phoneHand.hold(scene,p.x+phoneTarget.x,playerFloor+phoneTarget.y,p.z+phoneTarget.z);
      phoneHand.group.rotation.y+=p.angle;
    }
  }
  const drawingPlayer=playerBody && (playerBody.mesh.visible || phoneCameraActive());
  for(const car of sim.cars){
    if(!activeCars.has(car.id))continue;
    let mesh=carModels.get(car.id);
    const loaded=vehicleMeshes.forCar(car,car.controlled || Math.hypot(car.x-p.x,car.z-p.z)<14);
    // Keep the same body under load if a higher-detail model finishes streaming.
    const supporting=p.move?.support?.id===car.id || p.standing?.id===car.id;
    const model=supporting && mesh ? mesh.userData.model : loaded;
    if(!model){
      if(mesh){scene.remove(mesh);carModels.delete(car.id);}
      continue;
    }
    if(!mesh||mesh.name!==car.type||mesh.userData.unit!==(car.unit || 'patrol')||mesh.userData.model!==model||mesh.userData.tint!==car.color||mesh.userData.given!==(car.shape??null)||mesh.userData.plate!==plateFor(car).text||mesh.userData.rims!==(car.rims??null)){
      if(mesh)scene.remove(mesh);
      mesh=createCar({type:car.type,unit:car.unit,color:car.color,seed:car.id,shape:car.shape,model,plate:plateFor(car),rims:car.rims??null});
      setCarShell(car,mesh.userData.contactShell);
      mesh.addEventListener('removed',()=>setCarShell(car,null));
      carModels.set(car.id,mesh);scene.add(mesh);
    }
    mesh.visible=Math.hypot(car.x-p.x,car.z-p.z)<CAR_SIGHT;
    const previousDoors = mesh.userData.missingDoors ?? car.missingDoors ?? 0;
    for (const [i,bit] of [1,2].entries()) if ((car.missingDoors & bit) && !(previousDoors & bit)) {
      doorDebris?.detach(mesh.userData.detail.doors[i],car,i === 0 ? 1 : -1);
    }
    mesh.userData.missingDoors = car.missingDoors || 0;
    updateCarVisuals(mesh,car,dt);
    if(playerBody?.mesh.visible && p.move?.support?.id===car.id){
      fitVehicleHands(playerBody,p,mesh);
      fitVehicleFeet(playerBody,p,car);
    }
    if(phoneHand?.amount && !playerBody?.mesh.visible && car.id===p.vehicleId && !eyeView && mesh.userData.detail?.driver){
      const lift=phoneHand.amount;
      cabinSeatPoint(mesh.userData.detail.driver,car.passengerSeat,phonePalm.set(-.12,.56+.47*lift,.05+.23*lift));
      mesh.worldToLocal(phonePalm);phoneHand.hold(mesh,phonePalm.x,phonePalm.y,phonePalm.z);
    }
    // A car that has been hit smokes, the more the worse it is, and throws bits off when it is hit.
    const harm=car.damage||0;
    if(car.destroyed && blastSeen.get(car)!==car.explodedAt && sim.elapsed-car.explodedAt < 1 && Math.hypot(car.x-p.x,car.z-p.z)<CAR_SIGHT) {
      blastSeen.set(car,car.explodedAt);
      carSmoke?.explosion(car.x,car.y||0,car.z);
      audio.explosion(Math.hypot(car.x-p.x,car.z-p.z));
    }
    if(harm>.45 && (mesh.visible || car.controlled) && (!car.destroyed || sim.elapsed-car.explodedAt < 18))smoking.push({burning:car.burningSince!=null,id:car.id,x:car.x,y:car.y||0,z:car.z,angle:car.angle,amount:Math.min(1,(harm-.45)/.5),vx:car.velocityX||0,vz:car.velocityZ||0});
    const impact=car.lastImpact;
    if(impact && struckSeen.get(car)!==impact && sim.elapsed-car.struckAt<.25){
      struckSeen.set(car,impact);
      carSmoke?.burst(impact.x,(car.y||0)+.55,impact.z,impact.speed,impact);
    }
    if(mesh.userData.update)mesh.userData.update(elapsed,car,sim.heat);
    const driver=mesh.userData.detail?.driver;
    if(p.mode==='passenger' && car.id===p.vehicleId && drawingPlayer && driver){
      const body=playerBody.mesh;
      cabinSeatPoint(driver,car.passengerSeat,driverSeat.set(0,.56,0));
      driver.getWorldQuaternion(body.quaternion);
      playerBody.bones[playerBody.rig.index.get('pelvis')].getWorldPosition(hipAt);
      body.position.add(driverSeat.sub(hipAt));
    }
    if(car.controlled && driver && (eyeView || playerBody)){
      driver.visible=false;
      if(drawingPlayer){
        const body=playerBody.mesh;
        driver.localToWorld(driverSeat.set(0,.56,0));
        driver.getWorldQuaternion(body.quaternion);
        playerBody.bones[playerBody.rig.index.get('pelvis')].getWorldPosition(hipAt);
        body.position.add(driverSeat.sub(hipAt));
        for (const side of ['l','r']) {
          if (side==='r' && phoneHand?.amount) continue;
          const rim=driver.localToWorld(cashTarget.set(side==='l'?.14:-.14,.92,.30));
          reachWithHand(playerBody,side,gripOffset,rim);
        }
      }
    } else if(driver?.visible && mesh.visible && crowd?.mesh.visible){
      driver.localToWorld(driverSeat.set(0,.56,0));
      driver.visible=!drawDriver(car,driverSeat);
    }
    // Scene factories may expose lamp meshes for a lightweight police flash.
    if(car.type==='police')for(const [i,light] of (mesh.userData.lights||[]).entries()){
      light.visible=!car.destroyed;
      if(light.material)light.material.emissiveIntensity=sim.heat>.1?(Math.sin(elapsed*14+i*Math.PI)>0?3:.1):.15;
    }
  }
  const gig=sim.mission;
  if(['courier','driver'].includes(gig.kind) && (gig.phase==='active' || gig.phase==='complete' && sim.elapsed-gig.finishedAt<5)){
    const curb=gig.phase==='complete'?gig.dropoff:gig.target;
    if(Math.hypot(curb.x-p.x,curb.z-p.z)<125 || gig.kind==='driver' && gig.stage==='dropoff'){
      const staff=gig.kind==='courier' && gig.stage==='pickup';
      const look=staff?(gig.staffLook??=dress('casual',seeded(gig.number*53))):(gig.look??=dress('casual',seeded(gig.number*97)));
      let x=curb.x,z=curb.z,y=groundHeight(x,z),sitting=false,heading=Math.atan2(p.x-x,p.z-z);
      const cabin=gig.kind==='driver' && gig.phase==='active' && carModels.get(gig.vehicleId)?.userData.detail?.driver;
      if(cabin && gig.stage!=='pickup'){
        const t=gig.stage==='boarding'?gig.transfer:gig.stage==='alighting'?1-gig.transfer:1;
        cabinSeatPoint(cabin,{side:-1,along:0},driverSeat.set(0,.56,0));
        x+=(driverSeat.x-x)*t;z+=(driverSeat.z-z)*t;y+=(driverSeat.y-.54*(look.height/1.76)-y)*t;
        sitting=t>.9;heading=p.angle;
      }
      extras.push({x,y,z,heading,look,sitting,clip:sitting?'sit':null,
        carry:gig.kind==='courier' && (gig.stage==='pickup'||gig.phase==='complete')?'takeout':null,
        stride:cabin && !sitting && gig.stage!=='pickup'?.65:0,phase:elapsed*5});
    }
  }
  crowd?.setExtras(extras,pedestrians);
  if(sim.mission.phase==='active'&&sim.mission.target){
    marker.visible=true;marker.position.set(sim.mission.target.x,groundHeight(sim.mission.target.x,sim.mission.target.z),sim.mission.target.z);markerDiamond.rotation.y=elapsed*.7;markerDiamond.position.y=5+Math.sin(elapsed*2)*.3;
  }else marker.visible=false;
}

function updateFirstPerson(look,vertical,dt){
  const p=sim.player, ending=sim.ending, driving=p.mode==='drive'||p.mode==='passenger';
  const ride=sim.transport.active, anchor=ride??(driving?p.vehicleId:p.mode==='bike'?sim.bike:p.mode==='skate'?p.board:sim.seat??null);
  if(headAnchor!==anchor){
    // Carry the walking eye height into the seat blend, including on a high stool.
    seatedEyeStart=sim.seat && headAnchor===null ? camera.position.y-sim.seat.fromY : null;
    if(sim.seat||headAnchor?.seatKind){headTurn=clamp(angleDifference(yaw,p.angle),-1.95,1.95);}
    else{yaw=p.angle;headTurn=0;headPitch=0;}
    headAnchor=anchor;
  }
  if(paused||traveling||ending){look=0;vertical=0;}
  headPitch=clamp(headPitch+vertical,driving?-.9:-1.4,driving?1.05:p.mode==='walk' && !sim.seat?Math.PI/2:1.4);
  const posedEnding=ending && ownBody && playerBody?.mesh.visible;
  if(posedEnding){
    playerBody.eyePosition(eyeGoal);
    eyeGoal.y=Math.max(eyeGoal.y,(p.y??0)+.11);
    const follow=camera.position.distanceToSquared(eyeGoal)>4 ? 1 : 1-Math.exp(-22*dt);
    camera.position.lerp(eyeGoal,follow);
    camera.quaternion.slerp(playerBody.eyeOrientation(eyeRotation),follow);
  }else if(driving){
    headTurn=clamp(headTurn+look,-2.8,2.8);
    yaw=p.angle+headTurn;
    placeDriverCamera(camera,carModels.get(p.vehicleId),headTurn,headPitch,p.mode==='passenger' && cityRides?.trip?.car.passengerSeat,p.duckAmount);
  }else if(ride){
    const [height,forward]=ride.spec.eye;
    headTurn=clamp(headTurn+look,-2.2,2.2);yaw=p.angle+headTurn;
    camera.position.set(p.x+Math.sin(p.angle)*forward,p.y+height,p.z+Math.cos(p.angle)*forward);
    camera.rotation.set(-headPitch-ride.pitch,Math.PI+yaw,-ride.roll*.5,'YXZ');
  }else{
    if(p.mode==='bike'||p.mode==='skate'||sim.seat){headTurn=clamp(headTurn+look,-1.95,1.95);yaw=p.angle+headTurn;}
    else{yaw+=look;if(!p.reaction && !p.move && !(p.swing>0 && sim.meleeAction?.target) && !ending)p.angle=yaw;}
    const take=sim.room&&!sim.seat&&sim.doorway?.take;
    if(take && !look && !vertical && !ending){
      const dx=take.source.x-p.x,dz=take.source.z-p.z;
      const align=1-Math.exp(-8*Math.max(0,take.age-(take.cameraAge||0)));
      yaw+=align*angleDifference(Math.atan2(dx,dz),yaw);
      headPitch+=align*(Math.atan2(1.64-take.source.y,Math.hypot(dx,dz))-headPitch);
      p.angle=yaw;take.cameraAge=take.age;
    }
    const floor=p.y??roomGroup?.userData.floorY;
    const height=playerBody?.rig.height??PLAYER_LOOK.height;
    let eyeHeight=height-.12+seatEyeOffset(sim.seat,height);
    if(sim.seat && seatedEyeStart!==null)eyeHeight+=(seatedEyeStart-(height-.12))*(1-sim.seat.weight);
    camera.position.set(p.x,(floor??0)+eyeHeight,p.z);
    if(p.mode==='walk' && playerBody && (ownBody || phoneCameraActive())){
      // Look input is consumed after posing. Turn the drawn body on this frame
      // before reading its fitted eye sockets, including on a fast mouse turn.
      playerBody.mesh.rotation.y=p.angle;
    }
    if(ownBody && playerBody?.mesh.visible && p.mode==='walk'){
      const mesh=playerBody.mesh;
      playerBody.eyePosition(eyeGoal);
      // Lean over the collar as the gaze lowers toward the hands and feet.
      const lean=.08*height*Math.sin(Math.max(0,headPitch));
      eyeGoal.x+=lean*Math.sin(yaw);eyeGoal.z+=lean*Math.cos(yaw);
      const dx=eyeGoal.x-p.x, dz=eyeGoal.z-p.z, reach=Math.hypot(dx,dz);
      if(reach>.24 && (sim.room || subwayVisit || sim.isBlocked(eyeGoal.x,eyeGoal.z,.2))){
        // At a wall keep the leaning body and its eye together inside the
        // player's collision footprint. showPlayer sets the root anew each frame.
        const excess=(reach-.24)/reach;
        mesh.position.x-=dx*excess; mesh.position.z-=dz*excess;
        eyeGoal.x-=dx*excess; eyeGoal.z-=dz*excess;
      }
      camera.position.copy(eyeGoal);
    }
    if(p.mode==='skate'){
      camera.position.y-=(p.board.pushing ? .04 : 0)+.075*p.board.landing;
    }
    let fall=0;
    if(p.reaction?.fall || p.move?.grip){
      const head=playerBody?.bones[playerBody.rig.index.get('Head')];
      if(head && !ownBody){
        head.getWorldPosition(handStart);
        camera.position.y=Math.max((floor??0)+.16,handStart.y+.06);
      }
      const r=p.reaction;
      if(r?.fall) fall=Math.sin(r.angle)*(1-Math.min(1,r.recover/1.5));
    }
    let sightPitch=headPitch;
    if(p.mode==='walk' && !sim.seat && !p.reaction && !phoneHand?.amount){
      const move=p.move;
      if(move && ['kick','lowKick','stomp'].includes(move.kind)){
        const progress=move.t/move.T, dip=move.kind==='stomp'?1.22:move.kind==='lowKick'?.94:.40;
        const weight=Math.sin(Math.PI*Math.min(1,progress))**2;
        sightPitch+=Math.max(0,dip-headPitch)*weight;
      }
    }
    camera.rotation.set(-sightPitch+fall*.3,Math.PI+yaw,p.mode==='skate' ? -.24*p.board.lean : 0,'YXZ');
  }
  if(ending && !posedEnding){
    const bow=THREE.MathUtils.smoothstep(ending.t/ending.T,0,.55);
    camera.position.y-=bow*.12;
    camera.rotateX(-bow*.24);
    if(ending.kind==='wasted')camera.rotateZ(bow*.16);
  }
  if(input.lookingBack && !ending && !sim.seat){
    if(p.mode==='walk')walkingLookBackYaw=yaw;
    camera.rotateY(Math.PI);
  }
  const aimZoom=!ending && !(sim.police?.arrest>.2) && focusedAim();
  eyeFocus=ending?0:THREE.MathUtils.damp(eyeFocus,Number(aimZoom),15,dt);
  camera.near=.07;camera.fov=THREE.MathUtils.lerp(70,54,eyeFocus);camera.updateProjectionMatrix();
  chaseHeight=null;chaseEyeOffset=null;snapChase=true;
}

function updateShoulderLook(controls,dt){
  if(paused)return;
  const active=!firstPersonActive() && weaponControls();
  if(!active){shoulderActive=false;return;}
  const aim=focusedAim(), sensitivity=aim ? .65 : 1;
  shoulderFocus=shoulderActive?THREE.MathUtils.damp(shoulderFocus,Number(aim),15,dt):Number(aim);
  shoulderActive=true;
  yaw+=input.lookDelta*sensitivity;
  shoulderPitch=clamp(shoulderPitch+input.lookVertical*sensitivity,-1,.95);
  input.lookDelta=0;input.lookVertical=0;
  // Carried, the pistol leaves its holder free to turn and to run; pointed, they face where it points and walk.
  if(gunRaised()){controls.aimYaw=yaw;sim.player.angle=yaw;}
}

const shoulderPivot=new THREE.Vector3(), shoulderBoom=new THREE.Vector3(), blendOrigin=new THREE.Vector3();
function clearShoulderCamera(p){
  shoulderPivot.set(p.x,p.y+(playerBody?.rig.height??PLAYER_LOOK.height)*.86,p.z);
  shoulderBoom.subVectors(camera.position,shoulderPivot);
  const reach=shoulderBoom.length();
  if(reach>0){
    shoulderBoom.divideScalar(reach);
    const clear=sim.room ? roomRayDistance(sim.room,shoulderPivot,shoulderBoom,reach) :
      shotObstruction(shoulderPivot,shoulderBoom,reach,streetSightBlocked);
    if(clear<reach)camera.position.copy(shoulderPivot).addScaledVector(shoulderBoom,Math.max(0,clear-.22));
  }
  const floor=sim.room?.floor ?? groundHeight(camera.position.x,camera.position.z);
  camera.position.y=Math.max(camera.position.y,floor+.12);
}
function blendShoulderCamera(p,dt){
  if(!shoulderBlend)return;
  shoulderBlend.time+=paused?0:dt;
  const {time,offset,rotation,fov}=shoulderBlend;
  const weight=THREE.MathUtils.smoothstep(time,0,.28);
  if(weight===1){shoulderBlend=null;return;}
  camera.position.lerp(blendOrigin.set(p.x,p.y,p.z).add(offset),1-weight);
  camera.quaternion.slerp(rotation,1-weight);
  camera.fov=THREE.MathUtils.lerp(fov,camera.fov,weight);
  clearShoulderCamera(p);
  camera.updateProjectionMatrix();
}
function updateShoulderCamera(p){
  const sin=Math.sin(yaw),cos=Math.cos(yaw);
  const distance=THREE.MathUtils.lerp(4.1,2.45,shoulderFocus);
  const side=shoulderSide*THREE.MathUtils.lerp(.78,.67,shoulderFocus);
  const back=distance*Math.cos(shoulderPitch);
  const height=(playerBody?.rig.height??PLAYER_LOOK.height)*.86;
  camera.position.set(p.x-sin*back-cos*side,p.y+height+Math.sin(shoulderPitch)*distance+.14,p.z-cos*back+sin*side);
  clearShoulderCamera(p);
  camera.rotation.set(-shoulderPitch,Math.PI+yaw,0,'YXZ');
  camera.near=.06;camera.fov=THREE.MathUtils.lerp(59,49,shoulderFocus);camera.updateProjectionMatrix();
  chaseHeight=null;chaseEyeOffset=null;snapChase=true;
}

function updateCamera(dt) {
  const previousLookBackYaw=walkingLookBackYaw;
  walkingLookBackYaw=null;
  const p=sim.player,driving=p.mode==='drive'||p.mode==='passenger';
  const indoorView=started&&sim.room&&!aerialView&&!cityView;
  const streetOnFoot=started && p.mode==='walk' && !cityView && !aerialView && !firstPerson && !fitting &&
    !viewOverride && !switchShot.active && !indoorView && !subwayVisit && !traveling && !sim.ending;
  if(!streetOnFoot){shoulderCamera=false;shoulderBlend=null;}
  else if(shoulderCamera!==shoulderActive){
    shoulderCamera=shoulderActive;
    // Carry the previous view with the player while the camera moves to its new position.
    shoulderBlend={time:0,offset:camera.position.clone().sub(blendOrigin.set(p.x,p.y,p.z)),rotation:camera.quaternion.clone(),fov:camera.fov};
  }
  if(!firstPersonActive())eyeFocus=0;
  // Indoors the room is drawn, and the street with it: it is there to be seen through the doorway and the windows.
  camera.layers.set(0);
  if(indoorView)camera.layers.enable(ROOM_LAYER);
  if(subwayVisit && !aerialView && !cityView){
    if(subwayVisit.enclosed)camera.layers.set(SUBWAY_LAYER);
    else camera.layers.enable(SUBWAY_LAYER);
  }
  // Keep the surveyed shell clear of the room's storefront openings.
  if(indoorView&&roomGroup){
    const room=sim.room;
    shared.uNycRoom.value.set(room.x,roomGroup.userData.floorY,room.z,1);
    shared.uNycRoomSide.value.set(room.nx,room.nz,room.width/2,room.skew||0);
    shared.uNycRoomEdges.value.set(room.tx,room.tz,
      room.returns?.find(edge=>edge.side===-1)?.length||0,room.returns?.find(edge=>edge.side===1)?.length||0);
  }else shared.uNycRoom.value.w=0;
  if(atmTerminal?.active){
    input.lookDelta=0;input.lookVertical=0;
    atmTerminal.frame(camera,innerWidth,innerHeight);
    return;
  }
  if(viewOverride){
    // A fixed camera for photographs and visual checks. Play continues.
    const v=viewOverride;chaseHeight=null;chaseEyeOffset=null;input.lookDelta=0;input.lookVertical=0;
    camera.position.set(...v.position);camera.near=v.near??.3;camera.far=v.far??9000;camera.fov=v.fov??55;
    camera.lookAt(...v.target);camera.updateProjectionMatrix();return;
  }
  // Between two places the shot has the camera: straight up, across, and down behind the player.
  if(dt>0 && !paused)audio.cameraStep(switchShot.stage,switchShot.level);
  const shotPose=switchShot.update(dt,arrivalSettled(),climbReady());
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
    const b=city.bounds,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
    // On its way to a chosen place the map is where the flight puts it, frame by frame.
    const flying=pickerFlight.update(dt);
    if(flying){cityFocus={x:flying.x,z:flying.z};cityZoom=flying.width/span;}
    const cx=cityFocus?.x??(b.minX+b.maxX)/2,cz=cityFocus?.z??(b.minZ+b.maxZ)/2;
    desiredCamera.set(cx+Math.sin(cityOrbit-.3)*span*.65*cityZoom,span*.86*cityZoom,cz+Math.cos(cityOrbit-.3)*span*.65*cityZoom);
    if(flying)camera.position.copy(desiredCamera);else camera.position.lerp(desiredCamera,1-Math.exp(-dt*5));camera.near=10;camera.far=150000;camera.fov=52;camera.lookAt(cx,terrainHeight(cx,cz),cz);camera.updateProjectionMatrix();return;
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
  // Leaving the shop, or its list, ends a fitting however it was left.
  if(fitting&&(!sim.room||!interaction?.open)){fitting=null;if(tryOnLook){tryOnLook=null;dressPlayer();}}
  if(fitting){updateFittingCamera(p,dt);return;}
  if(firstPerson){
    const sensitivity=focusedAim() ? .65 : 1;
    updateFirstPerson(look*sensitivity,vertical*sensitivity,dt);return;
  }
  if(shoulderActive){updateShoulderCamera(p);blendShoulderCamera(p,dt);return;}
  yaw+=look;pitch=clamp(pitch+vertical,.17,.85);lookIdle=look||vertical?0:lookIdle+dt;
  if(subwayVisit){
    const eye=p.y+1.38,cabinEye=subwayVisit.cabinEye(yaw,pitch,eye);
    const back=cabinEye?0:subwayVisit.cameraReach(yaw,pitch,eye);
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    if(cabinEye)camera.position.set(cabinEye.x,cabinEye.y,cabinEye.z);
    else camera.position.set(p.x-sin*back,eye+Math.sin(pitch)*back,p.z-cos*back);
    camera.lookAt(p.x+sin*.28,eye,p.z+cos*.28);
    camera.near=.035;camera.fov=57;camera.updateProjectionMatrix();
    chaseHeight=null;chaseEyeOffset=null;return;
  }
  if(indoorView){
    const room=sim.room,floor=roomGroup?.userData.floorY??p.y??0;
    const targetHeight=1.45+(p.y??floor)-floor+seatEyeOffset(sim.seat,playerBody?.rig.height??PLAYER_LOOK.height);
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
  const chaseCar = driving ? sim.cars.find(car => car.id === p.vehicleId) : null;
  if((driving||p.mode==='bike'||p.mode==='skate'||ride)&&(speed>.25||ride?.spec.kind==='rotor')){
    const headingRate=7+4*clamp(speed/22,0,1);
    // Let the nose rotate in frame during a drift while the chase boom
    // follows part of the actual travel direction. Never swing around in reverse.
    const drift = chaseCar && p.speed > 3 ? clamp(chaseCar.slipAngle || 0, -.7, .7) * .40 : 0;
    yaw+=angleDifference(p.angle + drift,yaw)*(1-Math.exp(-dt*headingRate*chaseAssist));
  }
  if(driving){
    const car=chaseCar;
    desiredLookAhead.set(Math.sin(p.angle),0,Math.cos(p.angle));
    const vx=car?.velocityX,vz=car?.velocityZ,velocity=Math.hypot(vx,vz);
    // Preview the actual forward path during a slide, but keep reverse views
    // behind the vehicle's nose rather than flipping toward reverse velocity.
    if(p.speed>0&&Number.isFinite(velocity)&&velocity>.5&&vx*desiredLookAhead.x+vz*desiredLookAhead.z>0){
      const grip = 1 - THREE.MathUtils.smoothstep(Math.abs(car.slipAngle || 0), .06, .22);
      const path = Math.atan2(vx, vz) + clamp((car.yawRate || 0) * .12, -.12, .12) * grip;
      desiredLookAhead.set(Math.sin(path),0,Math.cos(path));
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
  const aimHeight=ride?Math.max(.8,ride.spec.eye[0]*.75):driving?1.1:1.45+seatEyeOffset(sim.seat,playerBody?.rig.height??PLAYER_LOOK.height);
  const cameraContact=(x,z,d)=>sim.isBlocked(x,z,.2,{ignoreWater:true,baseHeight:ride?p.y+aimHeight+Math.sin(pitch)*d:undefined});
  let safeDistance=distance;
  // Pull the chase camera forward before its sightline crosses a facade.
  // Checking the same collision geometry keeps narrow SoHo streets readable.
  // Keep steering on the forward view while the chase camera moves around the walker.
  // Restore that view on release so the return trip cannot reverse the next input sample.
  if(p.mode==='walk'){
    if(input.lookingBack)walkingLookBackYaw=(previousLookBackYaw ?? walkingControlYaw())+look;
    else if(previousLookBackYaw!==null){yaw=previousLookBackYaw+look;snapChase=true;}
  }
  const orbitYaw=(walkingLookBackYaw ?? yaw)+(input.lookingBack ? Math.PI : 0);
  const sightStep=ride?Math.max(.6,distance/40):.6;
  for(let d=1;d<=distance;d+=sightStep){
    if(cameraContact(p.x-Math.sin(orbitYaw)*d,p.z-Math.cos(orbitYaw)*d,d)){safeDistance=Math.max(.9,d-sightStep-.1);break;}
  }
  const previousHeight=chaseHeight;
  chaseHeight=updateChaseHeight(chaseHeight,p,dt,ride?ride.home.id:driving?'car:'+p.vehicleId:'walk');
  const eyeOffset=(ride?aimHeight+.5:Math.min(1.55,aimHeight+.015*doorwayDistance))+Math.sin(pitch)*safeDistance;
  if(chaseHeight!==previousHeight||chaseEyeOffset===null)chaseEyeOffset=eyeOffset;
  else chaseEyeOffset=THREE.MathUtils.damp(chaseEyeOffset,eyeOffset,safeDistance<3?22:driving?13:8,dt);
  // Eye and aim share the same smoothed elevation. Filtering only the eye
  // while looking at raw terrain height makes every bump pitch the camera.
  const height=chaseHeight.height+chaseEyeOffset;
  desiredCamera.set(p.x-Math.sin(orbitYaw)*safeDistance,height,p.z-Math.cos(orbitYaw)*safeDistance);
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
  const cameraBed=p.water?waterColumn(camera.position.x,camera.position.z)?.bed:null;
  camera.position.y=Math.max(camera.position.y,(cameraBed??terrainHeight(camera.position.x,camera.position.z))+.35);
  cameraTarget.set(p.x,chaseHeight.height+aimHeight,p.z);
  if(driving)cameraTarget.add(chaseLookAhead);
  camera.lookAt(cameraTarget);
  const targetFov=driving?60+Math.min(9,Math.abs(p.speed)*.24):57;
  camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,4,dt);camera.updateProjectionMatrix();
  blendShoulderCamera(p,dt);
}

function transportExitLabel(ride) {
  if(ride.line)return ride.grounded?'GET OFF AT STATION':'EXIT AT NEXT STATION';
  if(!ride.grounded)return 'LAND TO GET OUT';
  if(ride.spec.kind==='boat'||ride.spec.floats){
    const dock=sim.transport.nearestLanding(sim.player);
    if(!dock||Math.hypot(sim.player.x-dock.berth.x,sim.player.z-dock.berth.z)>=29)return 'DOCK TO GET OUT';
  }
  return Math.abs(ride.speed)>1.2?'SLOW DOWN TO GET OUT':'GET OUT';
}

function interactionPrompt() {
  const p=sim.player, trip=tripAction(sim);
  const interact=touch=>({touch}), vehicle=touch=>({key:'F',touch});
  if(trip)return interact(sim.room?'COLLECT':'CONFIRM');
  if(sim.canDropPaper())return interact('DELIVER');
  if(p.mode==='skate')return interact('EXIT');
  if(p.mode==='passenger')return vehicle(cityRides?.choosing?'EXIT':'STOP');
  if(cityRides?.canBoard())return vehicle('BOARD');
  if(sim.seat)return interact('STAND');
  if(p.mode==='walk'&&!sim.room&&!stairHere&&stopHere)return interact('BUS');
  if(sim.doorway?.take)return null;
  if(nearbyATM())return interact('ATM');
  if(registerAction(sim))return interact('TAKE');
  if(nearestSeat())return interact('SIT');
  if(sim.room)return sim.doorway && Math.hypot(sim.room.a,sim.room.b)<1.6?interact('OPEN'):null;
  if(sim.transport.active || p.mode==='bike' || p.mode==='drive')return vehicle('EXIT');
  if(p.mode!=='walk')return null;
  const boarding=sim.transport.nearby();
  if(boarding)return vehicleHint('BOARD '+boarding.spec.name.toUpperCase(),boarding.entrance,1.35,'BOARD');
  const car=sim.getNearbyCar(), bike=sim.getNearbyBike(car);
  if(bike)return vehicleHint(bike.owner?'TAKE BICYCLE':bike.personal?'RIDE BICYCLE':'RIDE CITI BIKE',bike,1.35,'RIDE');
  if(car){
    const label=vehicleTravelSpeed(car)>4?'WAIT FOR VEHICLE TO SLOW':car.type==='taxi'?'GET IN THE CAB':'ENTER '+vehicleName(car.identity).toUpperCase();
    return vehicleHint(label,car,(carTop(car,car.x,car.z)??((car.y??0)+1.7))-(car.y??0)+.35);
  }
  if(canOpenDoor(doorHere))return hint('OPEN DOOR',doorHere,2.1,'OPEN');
  if(crowd?.closest(p.x,p.z)||p.armed)return {...hint(p.armed?'FIRE':'ATTACK',null,0,p.armed?'FIRE':'ATTACK'),key:'CLICK'};
  return null;
}

let currentInteractPrompt=null;
const interactPosition=new THREE.Vector3();
function updateInteractPrompt(refresh){
  const bottom=$('interact-prompt'), worldPrompt=$('world-interact-prompt');
  const p=sim.player;
  const enabled=started&&bootReady&&!paused&&!traveling&&!cityView&&!mapOpen&&!switchShot.active&&!viewOverride
    && !phone?.open&&!interaction?.open&&!busRide&&!subwayVisit&&!sim.ending&&!p.reaction&&!p.move;
  if(!enabled)currentInteractPrompt=null;
  else if(refresh)currentInteractPrompt=interactionPrompt();
  const hint=currentInteractPrompt;
  bottom.hidden=!hint||Boolean(hint.at);
  let showWorld=false;
  if(hint?.at&&!aerialView){
    const {x,y,z}=hint.at;
    camera.updateMatrixWorld();
    interactPosition.set(x,(y??groundHeight(x,z))+hint.lift,z).project(camera);
    const projected=interactPosition;
    if(Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&Math.abs(projected.z)<=1){
      showWorld=true;
      worldPrompt.style.left=(50+projected.x*50)+'%';
      worldPrompt.style.top=(50-projected.y*50)+'%';
    }
  }
  worldPrompt.hidden=!showWorld;
  if(hint){
    const prompt=hint.at?worldPrompt:bottom, label=prompt.querySelector('span'), key=prompt.querySelector('kbd');
    if(label.textContent!==hint.label)label.textContent=hint.label;
    if(key.textContent!==(hint.key??'E'))key.textContent=hint.key??'E';
  }
  const transitAction=sim.subway&&({board:'BOARD',alight:'GET OFF',gate:'FARE',services:'TRAINS',leave:'EXIT'}[sim.subway.journey.action]);
  hud.text('touch-enter',transitAction||hint?.touch||(p.mode==='walk'?'ENTER':'EXIT'));
}

let occupiedCarId=null, vehicleTitleUntil=0;
function updateVehicleTitle(){
  const p=sim.player, id=(p.mode==='drive'||p.mode==='passenger')?p.vehicleId:null;
  const title=$('vehicle-title');
  if(id!==occupiedCarId){
    occupiedCarId=id;
    vehicleTitleUntil=sim.elapsed+4;
  }
  const left=vehicleTitleUntil-sim.elapsed;
  const show=id&&left>0&&started&&!cityView&&!paused&&!mapOpen&&!traveling&&!switchShot.active&&!sim.ending&&!phone?.open&&!interaction?.open;
  const car=show?sim.cars.find(candidate=>candidate.id===id):null;
  title.hidden=!car;
  if(!car)return;
  hud.text('vehicle-title',vehicleName(car.identity));
  title.classList.toggle('leaving',left<.55);
}

function frame(now) {
  requestAnimationFrame(frame);
  // A death or an arrest is watched at a third of the speed.
  const elapsedSeconds=Math.max(0,(now-(lastFrame||now))/1000);
  const frameSeconds=Math.min(.25,elapsedSeconds);
  const dt=frameSeconds*(sim?.ending ? .36 : 1);lastFrame=now;
  frameCalm.note(elapsedSeconds);
  if(openingVeiled)showOpening(now);
  if(sim)sim.paintedCrossings=streetscape?.paintedCrossings(sim.junctions);
  let controls={forward:0,turn:0,brake:false,run:false,moveX:0,moveZ:0};
  if(started){
    // Keep polling controller button edges while paused so Start can resume.
    // An action inside sample() may change paused during this same frame.
    controls=input.sample(walkingControlYaw(),dt,sim.player.mode==='walk'&&!paused&&!mapOpen,sim.player.mode==='skate'&&!paused&&!mapOpen&&!cityView&&!traveling&&!interaction?.open,sim.transport.active?.spec.kind || (sim.player.water?'swim':null));
    if(atmTerminal?.active)controls={forward:0,turn:0,brake:false,run:false,moveX:0,moveZ:0};
    refreshControllerHelp();
    sim.player.duckAmount=sim.player.mode==='drive'
      ? THREE.MathUtils.damp(sim.player.duckAmount||0,Number(Boolean(controls.duck)),15,dt) : 0;
    if(grabbedPerson){
      const p=sim.player,target=grabbedPerson;
      if(!(menuGrapple || input.padGrapple) || !streetControls() || wheelSelection!==null || p.armed || p.mode!=='walk' || p.reaction || p.move ||
         sim.room || sim.seat || target.reaction || target.dead || target.gone || target.state==='down' || Math.hypot(target.x-p.x,target.z-p.z)>1.05){
        target.grappled=false;grabbedPerson=null;
      }else{
        p.angle=Math.atan2(target.x-p.x,target.z-p.z);target.heading=p.angle+Math.PI;
        const approach=Math.min(.8,Math.max(0,Math.hypot(target.x-p.x,target.z-p.z)-.56)*4);
        controls={moveX:Math.sin(p.angle)*approach,moveZ:Math.cos(p.angle)*approach};p.guard=.2;
      }
    }
    if(wheelSelection!==null){
      if(!streetControls() || sim.player.mode!=='walk')action('weaponCancel');
      input.lookDelta=input.lookVertical=0;controls={};
    }
    if(grabbedPerson){lockedPerson=grabbedPerson;controls.aimYaw=yaw=sim.player.angle;}else meleeFocus(controls);
    if(queuedStrike){
      const p=sim.player;
      if(!streetControls() || p.armed || p.mode!=='walk' || p.reaction || sim.room || sim.seat || wheelSelection!==null || sim.elapsed>queuedStrike.expires)queuedStrike=null;
      else if(!p.move && !(p.swing>.08)){
        sim.fight(lockedPerson || meleeTarget(),queuedStrike.style);
        queuedStrike=null;
      }
    }
    updateGunFeel(dt);updateShoulderLook(controls,dt);
    if(busRide&&!busRide.arriving){
      busRide.clock=Math.min(busRide.journey.arrival,busRide.clock+dt*45);
      busRide.paint-=dt;
      if(busRide.paint<=0){gameMap.transit.updateRide(busRide.clock);busRide.paint=.16;}
      if(busRide.clock>=busRide.journey.arrival)finishBusRide();
    }
    // Nobody steers a player they cannot see: they stand where they were put until the shot comes down.
    if(switchShot.active)controls={forward:0,turn:0,brake:false,run:false,moveX:0,moveZ:0};
    if(switchShot.active!==switchShotLive){switchShotLive=switchShot.active;for(const id of ['hud','mission-panel','wanted','touch-controls'])$(id).classList.toggle('switch-shot',switchShotLive);}
    if(!paused&&!traveling&&!cityView&&!mapOpen&&bootReady){
      if(subwayVisit && interaction?.open)controls={};
      if(!subwayVisit)selectDoorway();
      enterSubwayOnFoot(controls);sim.step(controls,dt);cityRides?.update();elapsed+=dt;
    }
    atmTerminal?.check();
    showEnding();
  }else{elapsed+=dt;introTime+=dt;}
  if(landscapeDirty){
    landscapeDirty=false;landscapeRevision++;
    world.setTerrainSampler(terrainHeight,landscapeRevision);
    streetDetail?.setTerrainSampler(groundHeight,landscapeRevision);
    streetscape?.setTerrainSampler(terrainHeight,landscapeRevision);
    sim.updateGrounding();
  }
  if(subwayVisit){
    const now=subwayVisit.journey.now;
    gfx.hours=(now%86400)/3600;weekday=Math.floor(now/86400)%7;clockWas=gfx.hours;
    subwayVisit.draw();subwayStairs.openings.cabinAt(subwayVisit.cabin);
  }
  syncScene(paused||traveling||cityView||mapOpen?0:dt,controls);if(!mapOpen)updateCamera(dt);updateWeaponHUD();
  if(fireRequested){fireRequested=false;fireFromView();}
  if(firstPersonActive() && phoneHand?.amount && !sim.ending)phoneHand.cameraGrip(camera,scene,$('phone').getBoundingClientRect(),innerWidth,innerHeight,renderer);
  const handItem=firstPersonActive() && sim.player.mode==='walk' && !sim.player.armed && !sim.ending && !sim.player.swing && !sim.player.move && (sim.shopping.payment?sim.shopping.payment.tender || 'cash':courierBag(sim.mission) || sim.player.carry);
  if(handItem && !foodHand)foodHand=createFoodHand(camera,scene,HANDHELD_LAYER);
  const eating=mealMotion(handItem);
  const utensil=phoneHand?.amount && eating && handItem.startsWith('plate-') ? null : eating;
  foodHand?.(handItem,PLAYER_LOOK.skin,eating?.lift||0,utensil,sim.shopping.payment?paymentReach(sim.shopping.payment):0);
  navigation?.updatePin();
  // prepareAt owns the destination's collision data until arrival. Reselecting
  // around the old player while terrain is still loading would discard it.
  // Continue rendering and downloads; resume selection after arrival/rollback.
  // How high the view is above the ground under it, and whether that is too high to see a street's furniture (aloft.js).
  const playerAltitude=(sim.player.y||0)-groundHeight(sim.player.x,sim.player.z);
  viewHeight=Math.max(0,camera.position.y-groundHeight(camera.position.x,camera.position.z),playerAltitude);
  aloft=started&&!cityView&&!switchShot.active&&aboveTheStreet(viewHeight,aloft);
  if(!traveling)world.update(sim.player,camera,{overview:cityView||!started,altitude:started&&!cityView?viewHeight:0,collisionAltitude:Math.max(0,playerAltitude-35),view:started?buildingView():null});
  // Under the shot the ground is painted for the place and the height in the picture; otherwise for the street the player is on.
  const shotOver=switchShot.active?switchShot.over:null;
  // Over the picker's map a place that has been chosen is photographed at the zoom the map's own height wants,
  // as soon as it is chosen: the whole-city photograph is thirty metres a pixel, and a place fills the screen at five.
  const pickedOver=!shotOver&&cityView&&started&&cityPicked&&viewHeight<PICKER_SHARP?cityPicked:null;
  ground.update(shotOver||pickedOver||sim.player,{overview:(cityView&&!pickedOver)||!started,zoom:shotOver?arrivalZoom(shotOver):pickedOver?atlasZoomFor(viewHeight):undefined});
  // Once the shot is over, what was fetched for it is let go.
  if(arrivalHeld&&!switchShot.active&&!traveling&&!(cityView&&warming)){arrivalHeld=false;arrivalZooms=[];world.releaseScenery();ground.release();}
  // While the shot hangs high over a place being built, the street builders work in long pieces: a stall is not seen from there.
  // Over the picker's map, for a place chosen there, in middling ones.
  streetscape?.setUrgent(traveling||shotIsHigh()?2:cityView&&warming?1:0);
  world.setLocalOrthophoto(ground.localOrthophoto);
  landscape?.setLocalOrthophoto(ground.localOrthophoto);
  landscape?.update(sim.player,{overview:cityView||!started});
  sportsCourts?.update(sim.player, started && !cityView && !aloft, landscapeRevision + laneSurfaceRevision);
  centralPark?.update(sim.player,{overview:cityView||!started,eye:camera.position});
  (statue||=createStatueOfLiberty({scene,heightAt:terrainHeight})).update(camera.position);
  streetDetail?.setLocalOrthophoto(ground.localOrthophoto);
  streetDetail?.update(sim.player,{overview:cityView||!started||aloft});
  streetscape?.update(sim.player,{overview:cityView||!started||aloft});
  bikeLanes?.update(sim.player,started&&!cityView&&!aloft,landscapeRevision+laneSurfaceRevision);
  roadPilot?.setLocalOrthophoto(ground.localOrthophoto);
  if(started&&!cityView&&roadPilotIndex&&!roadPilot&&!roadPilotLoading&&Date.now()>=roadPilotRetryAt&&nearRoadPilot(sim.player,600))ensureRoadPilot().catch(()=>{});
  updateRoadPilotControls();
  // The opening shot and street play are lit with shadows; the map view is not.
  setLocalShadows(!cityView);
  // Light and shadows follow what the camera is looking at.
  const overview=cityView||!started;
  const lit=viewOverride?{x:viewOverride.target[0],y:viewOverride.target[1],z:viewOverride.target[2]}:!started?{x:INTRO.x,y:0,z:INTRO.z}
    :aerialView&&!overview?aerialTarget:{x:sim.player.x,y:sim.player.y||0,z:sim.player.z};
  const cameraWater=!cityView&&!subwayVisit&&!sim.room && (sim.player.water||viewOverride) ? waterColumn(camera.position.x,camera.position.z) : null;
  const immersed=cameraWater && camera.position.y<cameraWater.level;
  water.waterfront.underwater(camera.position,Boolean(immersed&&cameraWater.tidal));
  water.waterfront.update(lit,terrainHeight,landscapeRevision,cityView&&!viewOverride);
  gfx.update(dt,{underwater:Boolean(immersed),focus:lit,overview:(cityView&&!viewOverride)||aloft,paused:paused||mapOpen||Boolean(subwayVisit),height:viewHeight});
  // The streets under an aircraft are not driven on: they are fetched again when the view comes down.
  if(bootReady&&!traveling&&!aloft)refreshRoads();
  if(bootReady&&started&&!traveling&&!cityView)refreshParkedCars();
  camera.getWorldDirection(trafficAhead);
  audio.update(sim,elapsed,started&&!paused&&!traveling&&!cityView&&!mapOpen&&!switchShot.active,{
    altitude:playerAltitude,throttle:Math.abs(controls.forward||0),pedaling:controls.forward>.05 && !controls.brake && !controls.handbrake,
    yaw:Math.atan2(trafficAhead.x,trafficAhead.z),pitch:Math.asin(clamp(trafficAhead.y,-1,1)),people:crowd?.people,stepCount:playerBody && animator ? Math.floor(animator.strideCycle * 2) : undefined,shore:audibleShore,footing:audibleFooting,
  });
  hudTime+=dt;const updateHUD=hudTime>.075;
  if(updateHUD){
    // Retain nearby streets if the optional citywide route download fails.
    if(!routePlanner&&gameMap.roads!==sim.city.roads)gameMap.setRoads(sim.city.roads);
    sim.threats=crowd?.threats||[];
    const rideControls=paused || traveling || mapOpen || interaction?.open ? null : cityRides;
    hud.city=sim.city;
    hud.update(sim,focusedAim(),rideControls);
    updateJobDirections();updateDirections();saveProgress();updateLocation();updateTimeButton();hudTime=0;
  }
  const surfaceSwimmer=sim.player.water?.tidal && sim.player.y+1.65>=WATER_LEVEL ? sim.player : null;
  const vessel=sim.transport?.active;
  water.update(lit,{overview:cityView&&!viewOverride,swimmer:surfaceSwimmer,vessel:vessel?.spec.kind==='boat'?vessel:null});
  // Lamps and headlights are gathered before the frame that they light.
  const streetVisible=(!overview||Boolean(viewOverride))&&!aloft;
  const signSpill=world.timesSquare.update(lit,groundHeight,sim.streetObjects,streetVisible,gfx.state.lightsOn,gfx.elapsed);
  streetLife.update(lit,{lights:gfx.state.lightsOn,cars:sim.cars,overview:!streetVisible,
    spots:signSpill.length ? policeScene.spots.concat(signSpill) : policeScene.spots});
  const birdsOut=started&&!cityView&&!aloft&&!traveling&&!switchShot.active&&!sim.room&&!subwayVisit&&!immersed&&gfx.state.sunElevation>-2;
  cityBirds.update(paused||mapOpen?0:dt,{focus:sim.player,forward:trafficAhead,visible:birdsOut,
    walks:birdsOut?streetscape?.walks()||noStreetFurniture:noStreetFurniture});
  doorDebris?.update(paused||traveling?0:dt);
  // Photographed things set out by the shop fronts: boards, planters, crates, bags at the kerb.
  (streetScans||=createStreetScans({scene})).update(fronts,sim.player,kerbIndex,groundHeight,started&&!cityView&&!aloft&&!subwayVisit&&!shotIsHigh());
  // What lies in the gutters, and is blown along them by passing cars.
  (streetLitter||=createStreetLitter({scene})).update(paused||traveling?0:dt,sim.player,kerbIndex,groundHeight,sim.cars,started&&!cityView&&!aloft&&!sim.room&&!subwayVisit&&!shotIsHigh());
  // One crossing in four has a manhole breathing steam, a little way out from its middle: always the same ones.
  if(carSmoke&&started&&!paused&&!traveling&&!cityView&&!aloft&&!sim.room&&!subwayVisit)for(const junction of sim.junctions){
    const away=Math.hypot(junction.x-sim.player.x,junction.z-sim.player.z);
    if(away>130)continue;
    let mark=0;for(const character of junction.id)mark=(mark*31+character.charCodeAt(0))>>>0;
    if(mark%4)continue;
    const x=junction.x+((mark>>3)%5-2)*.9,z=junction.z+((mark>>6)%5-2)*.9;
    carSmoke.steam(x,groundHeight(x,z)+.06,z,dt,'steam:'+junction.id);
  }
  carSmoke?.update(paused||traveling?0:dt,smoking,renderer.domElement?.height||720,sim?.player);smoking.length=0;
  // Signals show what the simulation's traffic is obeying, on the same clock.
  signs.group.visible=!cityView||Boolean(viewOverride);
  if(signs.group.visible)signs.update(sim.junctions,lit,sim.elapsed,streetscape?.walks(),sim.paintedCrossings);
  // How much traffic, and whose cabs, follows the hour and the neighbourhood.
  // It joins the streets where the camera is not looking.
  lifeTimer-=dt;
  if(lifeTimer<=0){lifeTimer=2;sim.setTraffic(cityLife.traffic(sim.player.x,sim.player.z,gfx.hours));}
  sim.setLookout(trafficAhead.x,trafficAhead.z);
  // People on the sidewalks: as many as the place and the hour call for.
  crowd.mesh.visible=started&&(!cityView||Boolean(viewOverride))&&!aloft;
  if(crowd.mesh.visible){
    const ahead=camera.getWorldDirection(crowdAhead),flat=Math.hypot(ahead.x,ahead.z)||1;
    // People out of the picture are not drawn. The phone's camera looks its own way, so while it is up they all are.
    if(phoneCameraActive())figures?.look(null);else{camera.updateMatrixWorld();figures?.look(camera);}
    crowd.update(paused||mapOpen||traveling?0:dt,{walks:streetscape?.walks()||noStreetFurniture,focus:lit,forward:[ahead.x/flat,ahead.z/flat],hours:gfx.hours,weekday,time:sim.elapsed,junctions:sim.junctions,cars:sim.cars,player:sim.player,officers:sim.police.officers.concat(sim.police.downOfficers),enclosedSubway:subwayVisit?.enclosed && !aerialView && !cityView});
    for(const bump of crowd.bumps)audio.bump(bump.person,bump.pace);
    if(crowd.damage){
      sim.hurt(crowd.damage);
      if(crowd.counterblow)sim.pushPlayer(crowd.counterblow.vx,crowd.counterblow.vz,{fall:sim.health<30,clip:crowd.counterblow.clip || 'hitChest'});
    }
    // Running somebody down is a crime if anybody sees it, and so is most of what the player's moves end in.
    for(const hit of crowd.struck){
      audio.vehicleContact('person',hit.car,hit.person,hit.speed);
      if(hit.speed>3.5)carSmoke?.burst(hit.x,(hit.person?.y||0)+.8,hit.z,hit.speed*.5);
      if(!hit.player)continue;
      sim.brush(hit.speed>3.5?.82:.95);
      if(hit.speed>3.5){alarmStreet(hit.person,14,.9);sim.offence(hit.dead?'killing':'runDown',{x:hit.x,y:hit.person.y,z:hit.z,message:hit.dead?'You ran somebody over. Somebody saw.':'You ran somebody down.'});}
    }
    if(sim.moveEvents?.length)for(const event of sim.moveEvents.splice(0)){
      if(event.kind==='bystanderHit'){
        const person=crowd.fleeOntoStreet(event.actor);
        Object.assign(person,{state:'down',x:event.x,z:event.z,vx:event.vx,vz:event.vz,liftOff:event.lift,
          down:4.5});
      }
      else if(event.kind==='propImpact' && sim.elapsed-event.at<.4){
        const material={bag:'bagHit',basket:'tinHit',rail:'railHit',lamp:'poleHit',sapling:'timberHit'}[event.prop];
        if(material)audio.effect(material,event,Math.min(.95,.23+event.speed*.047),40,true);
      }
      else if(event.kind==='vault' || event.kind==='climb'){
        audio.effect('cloth',sim.player,.27,8);
        audio.effect('vault',sim.player,.49,12);
      }
      else if(event.kind==='spareChange')audio.effect('coins',event,.48,10);
      else if(event.kind==='driverHorn'){
        const dx=event.x-sim.player.x,dz=event.z-sim.player.z;
        const hornDistance=Math.hypot(dx,(event.y||0)-(sim.player.y||0),dz);
        if(hornDistance<=60 && sim.elapsed-event.at<1)audio.horn(event.car || event);
      }
      else if(event.kind==='driverConfronts'){
        const actor=crowd.fleeOntoStreet({...event,look:driverAppearance(event.car)});
        Object.assign(actor,{state:'fight',mad:5,hp:3,attack:.8});
      }
      else if(event.kind==='shot')shotFired(event);
      else if(event.kind==='glass')sim.offence('glass',{x:event.x,z:event.z,message:'Glass all over the seat. Somebody saw that.'});
      else if(event.kind==='escapeFire'){
        const driver=crowd.throwOut(event.x,event.z,event.heading,gfx.hours,driverAppearance(event.car));
        Object.assign(driver,{state:'flee',mad:5,fireOrigin:{x:event.car.x,z:event.car.z}});
        alarmStreet(event,10,.7);
      }
      else if(event.kind==='thrown'){crowd.throwOut(event.x,event.z,event.heading,gfx.hours,driverAppearance(event.car));alarmStreet(event,10,.8);sim.offence('carjack',{x:event.x,z:event.z,message:'You took a car with somebody in it.'});}
    }
    // A gun in the open: whoever it is pointed at puts their hands up or runs, and somebody may call it in.
    const armed=Boolean(sim.player.armed)&&sim.player.mode==='walk'&&!sim.room&&!sim.seat;
    gunWatch=Math.max(0,gunWatch-dt);
    sim.police.armed=armed||gunWatch>0;
    if(armed&&!paused&&!mapOpen&&!traveling&&(gunSeen-=dt)<=0){
      gunSeen=.4;
      const noticed=alarmStreet(sim.player,20,.65,{angle:sim.player.angle,calm:true,sight:person=>sim._hasSight(person,sim.player)});
      if(noticed&&focusedAim()&&sim.elapsed-brandished>8){brandished=sim.elapsed;sim.offence('brandish',{message:'Threatening someone with a pistol was reported.'});}
    }
    sim.setWalkers(bikeTraffic?.riders.length?crowd.crossing.concat(bikeTraffic.riders.filter(r=>!r.abandoned)):crowd.crossing,crowd.people);
  }
  policeScene.update(sim.police,elapsed,started&&!cityView);
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
          look.kit &= KIT.longHair|KIT.shortSleeves|KIT.woman;
          return {x:spot.x,y:groundHeight(spot.x,spot.z),z:spot.z,heading:spot.heading,phase:0,stride:0,look,absentUntil:lastVendors.get(stand.place.id),fruit:stand.kind==='fruitstand',stand};
        });
      }
      if(bikeShare&&bikeDocks){
        if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
        bikeRows=planBikeDocks(bikeShare.near(lit.x,lit.z,200),(x,z)=>snapToKerb(kerbIndex,x,z,14));
        bikeDocks.update(bikeRows,borrowedDock);
      }
      if(dining&&diningMesh){
        const rows=planDining(dining.near(lit.x,lit.z,200),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z)),{fronts});
        const drawn=diningMesh.update(rows);
        // Who is at the tables: the same people at the same chairs each time, with the faces of the neighbourhood. About half the chairs are taken.
        const lastDiners=new Map(diners.map(d=>[d.x+','+d.z,d.absentUntil]));
        diners=[];patioSeats=[];
        for(const row of rows.slice(0,drawn))for(const seat of seatsOf(row)){
          patioSeats.push(seat);
          const random=seeded((Math.round(seat.x*31+seat.z*17)>>>0)||1);
          if(random()>.55)continue;
          const look=dress('casual',random,demographics.tracts?demographics.tonesAt(seat.x,seat.z,.5):null);
          look.kit &= KIT.longHair|KIT.shortSleeves|KIT.woman;
          diners.push({x:seat.x,y:groundHeight(seat.x,seat.z),seat,z:seat.z,heading:seat.heading,sitting:true,look,carry:random()<.7?'cup':'tray',absentUntil:lastDiners.get(seat.x+','+seat.z)});
        }
      }
      // A sign also says what the place is in a language a quarter or more of its neighbours speak at home.
      if(demographics.tracts)for(const front of fronts){const [language,share]=demographics.languagesAt(front.x,front.z).find(([name])=>name!=='english')||[];front.language=share>=.25?language:null;}
      // A delivery can be sent to any place with a name over its door: the drop is on the sidewalk in front.
      placeDestinations=fronts.filter(front=>front.place.name).map(front=>({name:front.place.name,x:front.x+front.nx*3.2,z:front.z+front.nz*3.2}));
      sim.setActiveCity({missionPoints:[...roadDestinations,...placeDestinations]});city=sim.city;
    }
    if(started && !cityView && !traveling){
      if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
      policeScene.plan({focus:lit,fronts,entrances:subwayStairs?.entrances,walks,kerbs:kerbIndex,park:centralPark?.manifest,parkRegions:landscape?.index?.regions,
        boardings:BOARDINGS,isWater:(x,z)=>water?.isNavigable(x,z),
        blocked:(x,z)=>sim.isBlocked(x,z,.40),lotAt:(x,z)=>lots()?.at(x,z)});
    }
    // Standing at a shop front, the player is told what it is.
    let facing=null;
    // On foot that is any front within a few steps; in a car, an auto shop it has stopped outside.
    const driving=sim.player.mode==='drive',onFoot=sim.player.mode==='walk',reach=driving?14:7;
    if(started&&!subwayVisit&&!sim.room&&!cityView&&!mapOpen&&(driving||onFoot))for(const front of fronts){
      if(driving&&!offersAt(front.place.kind))continue;
      const dx=sim.player.x-front.x,dz=sim.player.z-front.z,out=dx*front.nx+dz*front.nz;
      if(out>-1&&out<reach&&Math.abs(dx*front.tx+dz*front.tz)<front.width/2+(driving?5:1)&&(!facing||out<facing.out))facing={front,out};
    }
    // The head of a subway stair within a few steps.
    stairHere=null;
    if(started&&!subwayVisit&&!cityView&&!mapOpen&&onFoot&&!sim.room&&subwayStairs)for(const entrance of subwayStairs.portals){
      const d=Math.hypot(entrance.x-sim.player.x,entrance.z-sim.player.z);
      if(d>=4.5)continue;
      const level=subwayStairs.surfaceAt(sim.player.x,sim.player.z)?.elevation ?? groundHeight(entrance.x,entrance.z);
      if(Math.abs((sim.player.y??level)-level)<2.3 && (!stairHere || d<Math.hypot(stairHere.x-sim.player.x,stairHere.z-sim.player.z)))stairHere=entrance;
    }
    // A bus stop within a couple of steps.
    stopHere=null;
    if(started&&!subwayVisit&&!cityView&&!mapOpen&&onFoot&&!sim.room&&!stairHere&&busStops)for(const stop of busStops.stops){if(Math.hypot(stop.x-sim.player.x,stop.z-sim.player.z)<3){stopHere=stop;break;}}
    // A stand that someone is minding, within a couple of steps of its counter.
    standHere=null;
    if(started&&!subwayVisit&&!cityView&&!mapOpen&&onFoot&&!sim.room&&!stairHere&&!stopHere)for(const vendor of vendors){
      const open=vendor.fruit?gfx.hours>=7&&gfx.hours<20:gfx.hours>=5&&gfx.hours<23;
      if(open&&!sim.player.armed&&!(vendor.absentUntil>sim.elapsed)&&!(vendor.downUntil>sim.elapsed)&&Math.hypot(vendor.x-sim.player.x,vendor.z-sim.player.z)<3.2){standHere=vendor.stand;break;}
    }
    if(stairHere||stopHere||standHere)facing=null;
    $('place-hint').hidden=(!facing&&!stairHere&&!stopHere&&!standHere)||Boolean(sim.room);
    if(standHere)$('place-hint').textContent=placeName(standHere.place)+' · G TO BUY';
    if(stopHere)$('place-hint').textContent=stopHere.stop.name+' · '+stopHere.stop.lines.slice(0,5).join(' ');
    if(stairHere)$('place-hint').textContent=stairHere.station.name.toUpperCase()+' · '+stairHere.station.routes+(stairHere.entry===false?' · EXIT ONLY':' · WALK IN');
    if(started&&!subwayVisit&&!cityView&&!mapOpen&&!facing&&!stopHere&&!stairHere&&!standHere&&work.pedestrian()){
      $('place-hint').hidden=false;$('place-hint').textContent='G TO TALK';
    }
    if(started && !subwayVisit && !sim.room && !facing && !stairHere && !stopHere && !standHere && !cityView && !mapOpen){
      const name=policeScene.identify(sim.player,sim.police.officers);
      if(name){$('place-hint').hidden=false;$('place-hint').textContent=name;}
    }
    shopHere=null;doorHere=null;
    // Indoors, within reach of whoever is serving.
    counterHere=atShopCounter();
    if(sim.room){
      const visit=sim.doorway?.visitor?.visit;
      const hints=[sim.room.name];
      if(visit?.phase)hints.push(visit.phase[0].toUpperCase()+visit.phase.slice(1));
      else if(visit?.wait>0)hints.push('Customer ordering '+visit.item.name.toLowerCase());
      const phase=sim.doorway?.handoff?.phase;
      if(sim.doorway?.take)hints.push('Taking the cash');
      else if(sim.doorway?.closed)hints.push('Temporarily closed');
      else if(phase==='giving')hints.push('The clerk reaches across the counter');
      else if(phase==='startled')hints.push('The clerk raises their hands');
      else if(phase==='opening')hints.push('The clerk is opening the drawer');
      else if(phase==='offered')hints.push('The clerk is holding out the cash');
      else if(!phase && !sim.player.armed && sim.shopping.order)hints.push(sim.shopping.order.phase+(sim.shopping.order.ready?' · G TO COLLECT':''));
      else if(!phase && !sim.player.armed && sim.room.grocerySlots) {
        if(counterInReach(sim))hints.push('G FOR CHECKOUT');
        else if(sim.shopping.shelf(sim.room).length)hints.push('G TO SHOP THE SHELF');
        if(sim.shopping.basket)hints.push('Unpaid $'+sim.shopping.total(sim.room.place).toFixed(2));
      }
      else if(!phase && !sim.player.armed && sim.seat && diningTable(sim,sim.doorway) && waitsTables(sim.doorway))hints.push('G TO CALL YOUR SERVER');
      else if(!phase && !sim.player.armed && sim.seat && sim.room.kind==='eat')hints.push('G FOR TABLE SERVICE');
      else if(!phase&&!sim.player.armed&&menuFor(sim.room.place).some(item=>item.sku)){const spot=shopSpot();hints.push(spot?.changing?'G TO CHANGE':spot?'G TO TRY ON':'G TO BROWSE');}
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
  $('touch-shop').hidden=!(sim.room || standHere || shopHere) || Boolean(interaction?.open);
  gfx.indoors=camera.layers.isEnabled(ROOM_LAYER);
  gfx.subwayInterior=Boolean(subwayVisit?.enclosed);
  gfx.indoorDepth=subwayVisit?.belowStreet?1:gfx.indoors?clamp(sim.room.b/1.8,0,1):0;
  // Subway stairs stand where the MTA lists them, running along the kerb beside them.
  if(subway&&subwayStairs&&!aloft){
    const walks=streetscape?.walks()||noStreetFurniture;
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    subwayStairs.group.visible=!cityView||Boolean(viewOverride);
    subwayStairs.update(subway,lit,walks,landscapeRevision);
    if(!subwayVisit){
      const near=started&&!cityView&&sim.player.mode==='walk'&&subwayStairs.portals.find(e=>Math.hypot(e.x-sim.player.x,e.z-sim.player.z)<6);
      if(near && subway.table.platforms[near.stop]){
        subwayView ||= subway.preview(scene);subwayView.root.visible=true;
        if(previewPortal!==near){subwayView.preview(near,subway.table.platforms[near.stop],groundHeight);previewPortal=near;}
      }else if(subwayView){subwayView.root.visible=false;previewPortal=null;}
    }
  }
  if(buses&&busStops&&!aloft){
    const walks=streetscape?.walks()||noStreetFurniture;
    if(walks!==kerbsFor){kerbsFor=walks;kerbIndex=indexKerbs(walks);}
    busStops.group.visible=!cityView||Boolean(viewOverride);if(shedMesh)shedMesh.mesh.visible=busStops.group.visible;if(diningMesh)diningMesh.mesh.visible=busStops.group.visible;if(standMesh)standMesh.mesh.visible=busStops.group.visible;if(bikeDocks)bikeDocks.group.visible=busStops.group.visible;
    busStops.update(buses,lit,kerbIndex);
  }
  if(work && work.now()>=work.nextReopening)work.updateClosures();
  storefronts?.update(fronts,lit,gfx.hours,Boolean(viewOverride)||started&&!cityView&&!aerialView,
    landscapeRevision+laneSurfaceRevision,work?.closureRevision,sim.player.mode==='walk'?sim.player:null);
  interaction?.update(paused||cityView||mapOpen||traveling?0:dt);
  phone?.update(elapsed);
  updateInteractPrompt(updateHUD);
  updateVehicleTitle();
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
  const unseen=shotIsHigh()?hideStreetScale():null;
  gfx.render();
  if(unseen)for(const thing of unseen)thing.visible=true;
  if(phoneCameraActive()){
    phoneLens?.preview({renderer,scene,view:camera,canvas:$('phone-lens'),player:sim.player,eye:playerBody?.eyePosition(lensEye),facing:phone.facing,body:playerBody?.mesh??avatar,hide:phoneHand?.group});
  }
  if(started && !paused && !mapOpen && !cityView && !traveling && !document.hidden && elapsedSeconds>0){
    sampledSeconds+=elapsedSeconds;sampledFrames++;
    if(sampledSeconds>=1){recentFrameMs=1000*sampledSeconds/sampledFrames;sampledSeconds=sampledFrames=0;}
    if(highQuality){
      qualityTimer+=elapsedSeconds;
      if(elapsedSeconds>.035)slowSeconds+=elapsedSeconds;
      if(qualityTimer>=5){
        if(slowSeconds>qualityTimer*.64){highQuality=false;applyQuality();announce('Switched to balanced graphics for smoother streets.');}
        qualityTimer=slowSeconds=0;
      }
    }
  }
}

function setView(mode){
  if(subwayVisit)return;
  interaction?.close();
  if(mode!=='aerial'||!aerialView)aerialTracking=false;
  chaseLookAhead.set(0,0,0);
  if(mode==='city'&&!cityView){cityFocus=null;cityPicked=null;cityZoom=1;}
  pickerFlight.cancel();
  cityView=mode==='city';aerialView=mode==='aerial';input.clear();
  if(cityView)phone?.setOpen(false);
  headAnchor=undefined;input.lookDelta=0;input.lookVertical=0;
  updatePerspectiveButton();
  $('view-value').textContent=cityView?'FIVE BOROUGHS':aerialView?'AERIAL':'STREET';
  $('city-button').textContent=cityView?'RETURN TO STREET':'ALL FIVE BOROUGHS';
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
// Show walk-in doors and subway stairs on the radar. The street map also uses
// known doors so choosing a place can route to its entrance.
function markDoors(){
  if(!gameMap||!placeSource)return;
  const stairs=subwayStairs?.portals;
  if(!doorsFor||doorsFor.fronts!==fronts||doorsFor.stairs!==stairs||doorsFor.wide!==mapOpen){
    doorsFor={fronts,stairs,wide:mapOpen};
    const at=frontsFor||sim.player;
    const beyond=mapOpen?solveFrontages(placeSource.near(at.x,at.z,700).filter(place=>Math.hypot(place.x-at.x,place.z-at.z)>250),footprints,(x,z)=>Boolean(streetscape?.surfaceAt(x,z))):[];
    doors=doorBlips([...fronts,...beyond].filter(front=>hasRoom(front,(x,z)=>insideShopBuilding(front,x,z))),stairs);
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
function canOpenDoor(front){
  if(!front||sim.player.mode!=='walk'||sim.room||!shopOpen(front.place))return false;
  const at=roomLocal(front,sim.player.x,sim.player.z);
  return Math.abs(at.a)<=1.1&&at.b<=0&&at.b>=-1.65;
}
function goIn(front){
  if(!canOpenDoor(front))return false;
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
  placeIndexReady||=Promise.all([read('place-names.json'),read('landmarks.json').catch(()=>null),loadCourts().catch(()=>[])]).then(([data,named,courts])=>{
    if(!data)throw new Error('The citywide places could not load.');
    // The city's individual landmarks are searched and mapped by name with everything else.
    if(named){const kind=data.kinds.length;data.kinds.push('Landmark');for(const [name,x,z] of named.landmarks)data.places.push([name,x,z,kind,0]);}
    addCourtPlaces(data, courts);
    placeIndex=createPlaceIndex(data);gameMap?.setPlaces(createPlaceLayer(data));
  }).catch(()=>{placeIndexReady=null;});
  return placeIndexReady;
}
async function findLocally(query,{limit=6}={}){
  const presets=matchPresets(query,cityPresets());
  const planner=await plannerReady;
  if(planner&&!streetIndex)streetIndex=createStreetIndex(planner.roads);
  await loadPlaceNames();
  const found=searchLocal(query,{streets:streetIndex,places:placeIndex,near:sim?{x:sim.player.x,z:sim.player.z}:null,limit});
  // Several branches of one name are told apart by the street each is on.
  for(const place of found)if(place.kind==='place'&&planner){const road=planner.snap({x:place.x,z:place.z},{maxSnapDistance:300});if(road)place.detail=title(road.name);}
  return [...presets,...found];
}
function focusCityDestination(place){
  // The map flies there from wherever it is: back far enough to show both places, across, and in on the new one.
  const b=city.bounds,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
  pickerFlight.start({x:cityFocus?.x??(b.minX+b.maxX)/2,z:cityFocus?.z??(b.minZ+b.maxZ)/2,width:span*cityZoom},{x:place.x,z:place.z,width:span*.18});
  cityPicked={x:place.x,z:place.z};
  warmArrival(place);
}
// A place chosen on the picker's map is probably where the player will ask to be put down. What that arrival needs (the
// buildings and ground of the descent, the streets under it) is fetched while the place is being looked at, so that Spawn
// has little left to wait for. A newer choice takes over from an older one; leaving the map lets it all go.
let warming=0;
function warmArrival(place){
  const turn=++warming;
  // Not for a place the map only passes on its way to another: the choice has to stand a moment first.
  setTimeout(async()=>{
    if(turn!==warming||traveling||!cityView||!bootReady)return;
    try{
      const roads=await roadStream.loadAround(place,1000),target=place.exact?place:nearestStreet(roads,place,600);
      if(!target||turn!==warming||traveling||!cityView)return;
      world.releaseScenery();ground.release();
      streetscape?.prepareAt(target,0);
      prepareDescent(target,null);
    }catch{
      // Nothing is lost: the arrival fetches for itself whatever this did not.
    }
  },700);
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
  camera.getWorldDirection(cameraForward);pickerFlight.cancel();
  const leaving=!subwayVisit&&started&&!cityView&&!aerialView&&!mapOpen&&!sim.room?{x:sim.player.x,y:sim.player.y||0,z:sim.player.z,angle:sim.player.angle}:null;
  // Over the picker's map the held picture eases toward the place while it loads; a known destination sets how high the climb goes.
  switchShot.depart(leaving,
    {position:camera.position.toArray(),target:camera.position.clone().addScaledVector(cameraForward,30).toArray(),up:[0,1,0],fov:camera.fov,near:camera.near,far:camera.far,creep:cityView&&!mapOpen?camera.position.y*.06:0},
    !recovery&&Number.isFinite(place.x)&&Number.isFinite(place.z)?place:null);
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
    let target=place.exact?place:nearestStreet(roads,place,600);
    if(!target)throw new Error('Choose a point closer to a street. Water and unmapped areas cannot be arrival points.');
    if(place.exact&&!landscape?.getStatus().baseReady)throw new Error('Measured ground is unavailable. Wait for the terrain to load before spawning at this pin.');
    // Street surfaces are worth a short wait, but never hold up an arrival.
    await Promise.all([world.prepareAt(target,300),landscape?.prepareAt(target),streetscape?.prepareAt(target),place.roadPilot?ensureRoadPilot():nearRoadPilot(target)?ensureRoadPilot().catch(()=>null):null,prepareDescent(target,leaving)]);
    if(place.exact&&!landscape?.getStatus().baseWaterReady)throw new Error('Mapped water data is unavailable. Try again when it has loaded before spawning at this pin.');
    if(place.busExit){
      const edge=kerbIndex&&snapToKerb(kerbIndex,place.x,place.z,14);
      const x=edge?edge.x-edge.nx*.9:place.x,z=edge?edge.z-edge.nz*.9:place.z;
      const safe=sim._findSafePoint(x,z,.38);
      if(Math.hypot(safe.x-place.x,safe.z-place.z)<20)target={...place,x:safe.x,z:safe.z};
    }
    // Data readiness is a prerequisite for changing the player position.
    placeDestinations=[];
    sim.setActiveCity({roads,buildings,missionPoints:destinationsFor(roads,target)},{spawn:{...target,name:place.name,exact:Boolean(place.exact)}});
    if(sim.mission.phase==='active' && !place.busExit){sim.mission.phase='failed';announce('Travel canceled the active delivery. Your earnings are saved.');}
    if(subwayVisit){finishSubway();sim.updateGrounding();}
    city=sim.city;yaw=sim.player.angle;roadCell='';chaseHeight=null;chaseEyeOffset=null;
    camera.position.set(sim.player.x-Math.sin(yaw)*12,(sim.player.y||0)+9,sim.player.z-Math.cos(yaw)*12);
    if(!started)$('start-button').click();
    setView('street');$('travel-note').textContent='';
    switchShot.arrive({x:sim.player.x,y:sim.player.y||0,z:sim.player.z,angle:sim.player.angle});
    clearDirections();gameMap?.setStatus('Spawned at the selected location.');
    if(place.boarding){
      const stop=BOARDINGS.find(s=>s.id===place.boarding);
      if(stop){sim.transport.recall(stop.id);sim._say(stop.place,8);}
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

let jobStop=null, jobRouteEpoch=0;
function updateJobDirections(){
  const m=sim.mission;
  const target=m.phase==='active' && (m.kind==='courier' || m.kind==='driver') ? m.target : null;
  if(jobStop===target)return;
  if(target){
    requestDirections(target);
    jobRouteEpoch=routeEpoch;
  }else if(routeEpoch===jobRouteEpoch)clearDirections();
  jobStop=target;
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

// The loading bar, from 0 to 1. Each stage of startup sets a mark, and the wait for the map's own tiles moves it by the
// share of them that have arrived. What is shown eases toward the mark and meanwhile creeps on toward `ceiling`, where the
// stage is expected to end, so that the bar climbs instead of jumping. It is full only when the city is on screen (showOpening).
const startup={shown:0,goal:0,ceiling:0,last:0};
function startupPhase(complete,message,ceiling=complete){
  startup.goal=Math.max(startup.goal,complete);startup.ceiling=Math.max(startup.goal,ceiling);
  $('startup-stage').textContent=message;
  // Until frames are running there is nothing to ease it with but the stylesheet.
  if(!startup.last){startup.shown=startup.goal;$('startup-progress').value=startup.shown;}
}
/** Move the bar on for this frame. `now` is the frame's time in milliseconds. */
function climbStartup(now){
  const dt=Math.min(.25,startup.last?(now-startup.last)/1000:0);startup.last=now;
  if(bootReady){
    const tiles=world.getStatus(),photos=ground.getStatus(),here=tiles.cachedChunks+photos.loaded,due=tiles.loading+photos.loading;
    startup.goal=Math.max(startup.goal,.6+.37*here/Math.max(1,here+due));
  }
  startup.goal=Math.max(startup.goal,Math.min(startup.ceiling,startup.goal+dt*.015));
  startup.shown+=(startup.goal-startup.shown)*(1-Math.exp(-dt*5));
  $('startup-progress').value=startup.shown;
}

async function boot() {

  const [seed,index,streets,land]=await Promise.all(['city.json','city-index.json','road-index.json','boroughs.json'].map(loadData));
  // What stands where, for dressing buildings decoded on the page itself; the background decoders fetch their own.
  await lotsReady();
  cityIndex=index;roadIndex=streets;boroughs=land.boroughs;roadStream=createRoadStream(roadIndex);
  city={...seed,bounds:roadIndex.bounds,buildings:[],roads:[],boroughs,missionPoints:[],sampleSurface:streetSurface,waterColumn,landscapeContact:(x,z,radius)=>landscape?.contactAt(x,z,radius)};
  startupPhase(.1,'Preparing the city renderer…',.3);
  // The frame is antialiased in its own multisampled target, not the canvas.
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
  veilOpening();
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,10,150000);
  // Sky, sun, haze and the screen-space finish share one time of day.
  gfx=createGraphics({renderer,scene,camera});
  sim=new Simulation(city,{onVehicleContact:(kind,car,other,speed)=>audio.vehicleContact(kind,car,other,speed),
    onPedestrianBump:(person,pace)=>audio.bump(person,pace),onTripPaid:saveProgress,
    onEndingLoss:(kind,carried)=>{
      atmTerminal?.close();
      const fee=phoneBank.recordEndingLoss(kind,carried,gfx.clock);
      saveProgress();
      return fee;
    },
    onRecovery:recovery=>travel({x:sim.player.x,z:sim.player.z},recovery)});
  subwayStairs=createSubwayEntrances({scene,physics:sim.streetObjects,heightAt:groundHeight,
    kerbAt:(x,z)=>kerbIndex&&snapToKerb(kerbIndex,x,z,12)});
  const stairOpenings=subwayStairs.openings;
  // Rivers, harbor and sea, bounded by the borough shorelines.
  water=createWater({scene,boroughs,bounds:roadIndex.bounds,panorama:gfx.skyPanorama,stairOpenings});
  loadData('landscape/piers.json').then(data=>water.waterfront.setPiers(data.piers)).catch(error=>console.warn('Pier survey unavailable',error));
  Promise.all([loadData('landscape/coastal-depths.json'),fetch('./landscape/coastal-depths.bin').then(async response=>{
    if(!response.ok)throw new Error('Missing harbor depths');
    return new Int16Array(await response.arrayBuffer());
  })]).then(([grid,values])=>{
    if(values.length!==grid.cols*grid.rows)throw new Error('Incomplete harbor depths');
    water.waterfront.setGrid({...grid,values});
  }).catch(error=>console.warn('Coastal depth survey unavailable',error));
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
  transportScene=createTransportScene(scene,sim.transport,createPerson);
  cityBirds=createCityBirds({scene,heightAt:groundHeight,openWater:water.isNavigable,onTakeoff:at=>audio.wingbeats(at),onCall:(family,at)=>audio.effect(family,at,family==='gull'?.48:.4,family==='gull'?105:31,true)});
  streetLife=createStreetLife({scene,renderer,physics:sim.streetObjects,getLamps:()=>streetscape?.lamps()||noStreetFurniture,getTrees:()=>streetscape?.trees()||noStreetFurniture});
  parkedCars=createParkedCars({capacity:PARKED_LIMIT+8,library:vehicleMeshes});scene.add(parkedCars.group);
  distantTraffic=createDistantTraffic({library:vehicleMeshes});scene.add(distantTraffic.group);
  let phoneControlBeforeMenu;
  interaction=createInteraction({$,checking:()=>phoneBank.checking/100,onOpenChange:open=>{
    const handset=$('phone');
    if(open){
      phoneControlBeforeMenu=handset.contains(document.activeElement)?document.activeElement:null;
    }else if(phone?.open){
      if(handset.contains(document.activeElement))return;
      if(phoneControlBeforeMenu && !phoneControlBeforeMenu.disabled && !phoneControlBeforeMenu.closest('[hidden]'))phoneControlBeforeMenu.focus();
      else phone.focus();
    }else canvas.focus();
  }});
  work=new Work({sim,speak:(person,line,phones,signal)=>audio.reply(person,line,phones,signal),
    openTalk:(...args)=>{warmStreetModel();return interaction.openTalk(...args);},streetName:()=>$('street-name').textContent,
    canTalk:person=>sim.player.mode==='walk' && !sim.player.armed && !sim.room && !person.gone && !person.reaction &&
      ['walk','rest','wait'].includes(person.state) && Math.hypot(person.x-sim.player.x,person.z-sim.player.z,(person.y||0)-(sim.player.y||0))<5 &&
      crowd?.people.includes(person),
    talkPlace:(person,request='')=>{
      const spots=(placeSource?.near(person.x,person.z,250)||[]).filter(p=>shopOpen(p))
        .sort((a,b)=>Math.hypot(a.x-person.x,a.z-person.z)-Math.hypot(b.x-person.x,b.z-person.z));
      const category=/pizza|slice/i.test(request)?p=>p.kind==='pizza':/coffee|caf[eé]/i.test(request)?p=>p.group==='cafe':
        /eat|food|restaurant|lunch|dinner|breakfast/i.test(request)?p=>['dining','food','cafe'].includes(p.group):null;
      const spot=category?spots.find(category):spots[0];
      return spot && {name:placeName(spot),x:spot.x,z:spot.z};
    },phone:()=>phone,meet:(title,message,rows,available,kitchen,slip,onClose)=>{
    interaction.openList(title,rows,row=>row.choose(),{message,available,kitchen,slip,onClose});
  },fronts:()=>fronts,hours:()=>gfx.hours,save:saveProgress,passengerTrip:()=>cityRides?.trip,
    guide:site=>{gameMap.setOpen(true);gameMap.showCity();gameMap.setPin(site);},
    pedestrian:()=>sim.player.mode==='walk'&&!sim.room&&!sim.player.armed?crowd?.closest(sim.player.x,sim.player.z,4,true):null,
    counter:()=>registerAction(sim)?sim.room.place:null});
  restoreProgress();yaw=sim.player.angle;
  signs=createStreetSigns({scene,physics:sim.streetObjects,heightAt:groundHeight,raised:(x,z)=>{const offset=streetscape?.offsetAt(x,z);return offset ? offset>.1 : null;}});
  crowd=createCrowd({scene,boroughs,heightAt:(x,z,y)=>streetSurface(x,z,{mode:'walk',referenceHeight:y})?.elevation ?? groundHeight(x,z),blocked:(x,z,y,radius)=>sim.isBlocked(x,z,radius,{baseHeight:y}),isRoad:(x,z)=>streetscape?.surfaceAt(x,z)==='road',
    life:{crowding:(x,z,hours)=>cityLife.crowding(x,z,hours),wardrobe:(x,z,hours)=>cityLife.wardrobe(x,z,hours),
      // Offices, shops and sights fill a street with people from all over the city; at home, and at night, it is the neighbours.
      // How dressed a street is: the shopping streets and the streets of bars most, then where the visitors are.
      style:(x,z)=>{const c=characterAt(x,z);return clamp(Math.max(c.shopping||0,(c.evenings||0)*.8,(c.visited||0)*.5),0,1);},
      tones:(x,z,hours)=>{if(!demographics.tracts)return null;const c=characterAt(x,z),day=hours>7&&hours<20?1:.35;return demographics.tonesAt(x,z,Math.min(.85,Math.max(c.business,c.visited,c.shopping*.7)*day));}}});
  crowd.mesh.traverse(object=>{object.layers.enable(ROOM_LAYER);object.layers.enable(SUBWAY_LAYER);});
  // The city's own lists: sidewalk counts, and the signals that favour people
  // on foot. Without them the model answers alone and nothing is lost but detail.
  const signalHints=(x,z)=>({...cityLife.hintsAt(x,z),core:manhattanCore(x,z)});
  sim.setActiveCity({signalHints});
  loadCourts().catch(error => console.warn('Court data unavailable', error));
  props=createStreetProps({scene,physics:sim.streetObjects,heightAt:groundHeight});
  storefronts=createStorefronts({scene,roomFor,floorFor,physics:sim.streetObjects,
    groundAt:(x,z)=>roadPilot?.sampleSurface(x,z,{kind:'ground'})?.elevation??groundHeight(x,z),
    clearApproach:(x,z)=>!footprints.at(x,z) && streetscape?.surfaceAt(x,z)!=='road',
    isClosed:closedAfterIncident,policeUsing:view=>sim.police.searchRoom===view || sim.police.officers.some(officer=>officer.room===view) ||
      sim.police.calls.some(call=>call.view===view) || sim.shopping.basket?.roomView===view,
    populate:view=>populateShop(view,(x,z)=>demographics.tracts?demographics.tonesAt(x,z,.35):null)});
  loadLogos().then(logos=>{if(logos.size)storefronts.setLogos(logos);}).catch(()=>{});
  // The registers' places, and the shops they do not list (OpenStreetMap), read as one.
  const registerPlaces=createPlaceSource({load:url=>loadData(url.replace(/^\.\//,''))}),otherShops=createPlaceSource({load:url=>loadData(url.replace(/^\.\//,'')),prefix:'o'});
  placeSource=joinPlaceSources(registerPlaces,otherShops);
  loadData('places-index.json').then(index=>registerPlaces.setIndex(index)).catch(()=>{});
  loadData('shops-index.json').then(index=>otherShops.setIndex(index)).catch(()=>{});
  loadData('demographics.json').then(data=>{demographics=createDemographics(data);}).catch(()=>{});
  busStops=createBusStops({scene,heightAt:groundHeight,kerb:(x,z)=>kerbIndex&&snapToKerb(kerbIndex,x,z,14)});
  shedMesh=createShedMesh({scene,heightAt:groundHeight,physics:sim.streetObjects});
  trashMesh=createTrashMesh({scene,physics:sim.streetObjects,heightAt:groundHeight});
  fetch('./collection.bin').then(response=>response.ok?response.arrayBuffer():null).then(buffer=>{collection=createCollection(buffer);frontsFor=null;}).catch(()=>{});
  diningMesh=createDiningMesh({scene,heightAt:groundHeight});standMesh=createStandMesh({scene,heightAt:groundHeight});
  loadData('dining.json').then(data=>{dining=createDining(data);frontsFor=null;}).catch(()=>{});
  boardMesh=createSkateboard();scene.add(boardMesh);
  bikeDocks=createBikeDocks({scene,heightAt:groundHeight});
  sim.dockedBikes=bikeDocks.available;
  loadData('bikes.json').then(data=>{bikeShare=createBikeShare(data);frontsFor=null;}).catch(()=>{});
  loadData('sheds.json').then(data=>{sheds=createSheds(data);frontsFor=null;}).catch(()=>{});
  afterCityUp.then(()=>{
    loadTransitNetwork().catch(()=>loadData('bus-stops.json').then(data=>{if(!transitNetwork)buses=createBuses(data);}).catch(()=>{}));
    loadData('transit.json').then(data=>{subway=createSubway(data);gameMap.setSubwayStations(subway.stations);}).catch(()=>{});
  });
  sim.setFleet(fleet);
  // Every car in the street is one the game draws (vehicle-generator.js). The scanned exteriors in assets/vehicles are
  // lumpier than those and carry the shadows of their photographs on their glass; the catalog page still shows them.
  Promise.all(['fleet.json','vehicle-catalog.json','working-vehicles.json','vehicle-performance.json'].map(file=>loadData(file).catch(()=>null)))
    .then(([base,catalog,working,performance])=>{fleet=createFleet(base,catalog,null,designFor,working,performance);sim.setFleet(fleet);});
  // People are grown here (body.js): the street's cast and the player, once the skeleton and its movements have loaded.
  // Bodies are grown on another thread; where there is none, the blocked-out figures stay.
  afterCityUp.then(()=>Promise.all([loadData('motion.json'),fetch('./motion.bin').then(response=>{if(!response.ok)throw new Error('motion');return response.arrayBuffer();})])).then(([meta,buffer])=>{
    moves=writeMovements(createMotion(meta,new Int16Array(buffer)));
    animator=createAnimator(moves);bodyShop=createHumanShop(meta,{moves});dressPlayer();
    if(typeof Worker!=='undefined' || typeof OffscreenCanvas!=='undefined'){
      figures=createFigures({motion:moves,grow:bodyShop,scene,capacity:400,layers:[ROOM_LAYER,SUBWAY_LAYER]});crowd.setFigures(figures);
    }
    // The character page saves a design in this browser; coming back from it, the player is drawn afresh.
    addEventListener('storage',dressPlayer);addEventListener('focus',dressPlayer);
  }).catch(error=>console.warn('People could not be loaded:',error));
  phoneHand=createPhoneHand(ROOM_LAYER,HANDHELD_LAYER,$('phone'));
  phoneHand.tone('#'+PLAYER_LOOK.skin.toString(16).padStart(6,'0'));
  cityRides=new CityRides(sim,{planner:()=>plannerReady,paid:()=>saveProgress('Ride fare')});
  phoneLens=createPhoneLens();
  atmTerminal=createATM({$,balances:()=>({
    cash:Math.round(sim.cash*100),availableCash:availableCents(sim,'cash'),checking:phoneBank.checking,availableChecking:availableCents(sim,'card'),
  }),available:machine=>!paused && !traveling && !cityView && !mapOpen && !aerialView && !viewOverride &&
    !switchShot.active && !interaction?.open && nearbyATM()===machine,
    transfer:(direction,amount)=>{
      const error=phoneBank.transfer(sim,direction,amount,gfx.clock);
      if(!error)saveProgress();
      return error;
    },
    onChange:open=>{
      input.clear();
      document.body?.classList.toggle('atm-active',open);
      if(open){phone?.setOpen(false);atmTerminal.frame(camera,innerWidth,innerHeight);}
      else canvas.focus();
    },
  });
  phone=createPhone({$,canUse:()=>!atmTerminal.active && !sim.ending && !traveling,rides:cityRides,showTap:firstPersonActive,onTap:(x,y,instant)=>phoneHand.tap(x,y,instant),onSound:cue=>audio.interfaceCue(cue),roads:()=>sim.city.roads,destinations:()=>roadIndex.places.filter(place=>Math.hypot(place.x-sim.player.x,place.z-sim.player.z)>50),searchCity:findLocally,
    worldMap:()=>gameMap,loadMapPlaces:loadPlaceNames,
    searchMapPlaces:async query=>{
      await loadPlaceNames();
      return placeIndex?.search(query,{near:sim.player,limit:40,listings:true}) || [];
    },
    previewScene:place=>{
      const front=fronts.find(f=>f.place.x===place.x && f.place.z===place.z && f.place.name===place.name);
      return {renderer,scene,front,room:front && roomFor(front),height:front ? groundHeight(front.x,front.z) : 0};
    },
    onCapture:facing=>phoneLens.snapshot($('phone-lens'),facing),
    onTrade:(symbol,side,shares,price)=>{const error=phoneBank.trade(sim,symbol,side,shares,price,gfx.clock);if(!error)saveProgress();return error;},
    isClosed:closedAfterIncident,places:()=>placeSource.near(sim.player.x,sim.player.z,700),
    state:()=>({x:sim.player.x,z:sim.player.z,mapPin:gameMap?.pin,hours:gfx.hours,clock:gfx.clock,cash:sim.cash,purchaseLimit:purchaseLimit(sim),availableChecking:availableCents(sim,'card'),jobActive:sim.mission.phase==='active',street:$('street-name').textContent,bank:phoneBank.record()}),
    onMechanic:()=>{if(sim.callMechanic())saveProgress('Roadside assistance');},mechanicQuote:()=>sim.mechanicQuote(),onCab:()=>{if(sim.summonCab())saveProgress('Cab delivery');},
    onDirections:place=>{const name=place.name||describePlace(place,gfx.hours).name;requestDirections({x:place.x,z:place.z}).then(found=>announce(found?'Directions to '+name+'. Follow the highlighted streets.':'No way to '+name+' along mapped streets.'));},
    onTransport:()=>phone.openList('Travel to a boarding point',BOARDINGS.map(stop=>({stop,name:TRANSPORT[stop.type].name,note:stop.place+' · '+stop.borough})),row=>travel(transportDestination(row.stop)),{app:'maps'}),
    onWork:()=>work.board(),onDrive:()=>work.driving('driver','rides'),onMap:()=>action('map'),
    onOpenChange:open=>{$('mission-panel').classList.toggle('behind-phone',open);if(!open){if(interaction?.open)interaction.focus();else canvas.focus();}}});
  loadData('street-life.json').then(data=>{cityLife=createCityLife(data);props.setData(data);sim.setActiveCity({signalHints});}).catch(()=>{});
  world=createCityStream(cityIndex,{scene,onCollisionChange:applyBuildings,onStatus:updateStreaming,heightAt:terrainHeight,store:createTileStore()});
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
    streetscape=createStreetscape({scene,index,physics:sim.streetObjects,stairOpenings,heightAt:terrainHeight,onChange:()=>{laneSurfaceRevision++;sim?.updateGrounding();},
      roadsFor:bounds=>roadStream.loadAround({x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2},320)});
    if(roadPilot)streetscape.setGroundReplacementBounds(roadPilotIndex.bounds);
  };
  loadData('street-detail-index.json').then(surfaces=>{
    streetManifest=surfaces;startStreetscape(surfaces);
    navigation?.refreshPresets();
    // The mapped street module now supplies bridge decks only.
    streetDetail=createStreetDetail(surfaces,{scene,orthophoto:ground.orthophoto,heightAt:groundHeight,drape:false,roadsFor:focus=>roadStream.loadAround(focus,1100),waterAt:(x,z)=>landscape?.waterAt(x,z),onChange:()=>{laneSurfaceRevision++;sim?.regroundTraffic();},onStatus:status=>{
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
  avatar=createPerson(0xd7774e,{courier:true});avatar.traverse(object=>{object.layers.enable(ROOM_LAYER);object.layers.enable(SUBWAY_LAYER);});scene.add(avatar);marker=createMissionMarker();policeScene=createPoliceScene(scene,(x,z)=>groundHeight(x,z));carSmoke=createCarSmoke(scene);doorDebris=createDoorDebris(scene);
  hud=new HUD(city);applyQuality();
  sim.onCashReceived=(cents,balance)=>{
    hud.showCashGain(cents,balance,phoneBank.checking/100);
    audio.interfaceCue('cash');
  };
  gameMap=new GameMap({city,loadTransit:loadTransitNetwork,getPresets:cityPresets,searchLocal:findLocally,onPlacesWanted:loadPlaceNames,onPin:requestDirections,onCue:cue=>audio.interfaceCue(cue),onZoom:inward=>audio.sceneCue(inward?'zoomIn':'zoomOut',.42),
    onSpawn:pin=>travel({...pin,exact:true}),
    onOpenChange:open=>{if(open)interaction?.close();mapOpen=open;input.clear();input.lookDelta=0;input.lookVertical=0;if(!open)canvas.focus();markDoors();}});
  hud.attachMap(gameMap);
  afterCityUp.then(()=>loadData('bike-lanes.json')).then(async data=>{
    const lanes=await indexBikeLanes(data);
    gameMap.bikeLanes=lanes;gameMap.dirty=true;
    const laneHeight=(x,z,level)=>{
      if(level<13)return null;
      if(level===13 && !water?.isNavigable(x,z) && !landscape?.waterAt(x,z))return groundHeight(x,z);
      const decks=streetDetail?.surfacesAt(x,z,'walk') || [];
      const rank=clamp(Math.round((level-13)/4)-1,0,Math.max(0,decks.length-1));
      return decks[rank]?.elevation ?? null;
    };
    cycleRoutes=lanes;parkedAt=null;
    bikeLanes=createLaneMarkings(scene,lanes,laneHeight);
    sim.bikeTraffic=bikeTraffic=createBikeTraffic({scene,index:lanes,heightAt:laneHeight,onBell:r=>audio.bikeBell(r),
      onCrash:(r,car)=>{
        audio.vehicleContact('cyclist',car,r,Math.abs(car.speed));
        alarmStreet(r,14,.9);
        if(car.controlled)sim.offence('runDown',{x:r.x,y:r.y,z:r.z,message:'You knocked a cyclist down.'});
      },
      onDisplaced:r=>{
        const person=crowd.fleeOntoStreet(r);
        if(r.reaction)person.reaction=r.reaction;
        alarmStreet(r,8,.7);
      },
      appearance:(id,x,z)=>dress(id%4===0?'athletic':'casual',seeded((id*7547+891)>>>0),
        demographics?.tracts?demographics.tonesAt(x,z,.4):null)});
  }).catch(()=>{});
  // The compact citywide graph is optional: a failed route download must not
  // prevent entering the game or using a measured, validated spawn point.
  plannerReady=afterCityUp.then(()=>loadData('navigation-roads.json')).then(data=>{
    routePlanner=createRoutePlanner(data);gameMap.setRoads(routePlanner.roads);return routePlanner;
  }).catch(()=>null);
  const b=city.bounds;camera.position.set((b.minX+b.maxX)/2-14000,44000,(b.minZ+b.maxZ)/2+32000);
  navigation=createCityNavigation({canvas,camera,input,bounds:city.bounds,heightAt:terrainHeight,onTravel:travel,onMapPickStart:()=>pickerFlight.cancel(),onMapPick:cue=>audio.interfaceCue(cue),onDestinationSelected:focusCityDestination,getPresets:cityPresets,getDefaultPlaces:defaultCityPresets,searchLocal:findLocally});
  window.nycGame={graphics:gfx,get playerBody(){return playerBody;},enter:front=>goIn(front),get streetscape(){return streetscape;},get streetLife(){return streetLife;},get policeDetails(){return policeScene.details.actors;},get parkedCars(){return parkedCars;},get distantTraffic(){return distantTraffic;},get world(){return world;},get simulation(){return sim;},get signs(){return signs;},get crowd(){return crowd;},get props(){return props;},get places(){return placeSource;},get storefronts(){return storefronts;},get fronts(){return fronts;},get phone(){return phone;},get fleet(){return fleet;},get subway(){return subway;},get subwayJourney(){return subwayVisit?.journey||null;},get buses(){return buses;},get sheds(){return sheds;},get dining(){return dining;},get standMesh(){return standMesh;},get aloft(){return aloft;},get viewHeight(){return viewHeight;},get trash(){return trashMesh;},get weekday(){return weekday;},set weekday(day){weekday=((day%7)+7)%7;},get map(){return gameMap;},findLocally,get bikeTraffic(){return bikeTraffic;},get bikeShare(){return bikeShare;},get bikeDocks(){return bikeDocks;},get diningMesh(){return diningMesh;},get shedMesh(){return shedMesh;},get busStops(){return busStops;},get demographics(){return demographics;},get subwayStairs(){return subwayStairs;},get cityLife(){return cityLife;},heightAt:(x,z)=>terrainHeight(x,z),travel:place=>travel(place),get streetDetail(){return streetDetail;},get landscape(){return landscape;},get centralPark(){return centralPark;},get statue(){return statue;},setView:view=>{viewOverride=view&&Array.isArray(view.position)&&Array.isArray(view.target)?view:null;},getState:()=>({time:gfx.clock,switching:switchShot.active,player:{...sim.player},heat:sim.heat,health:sim.health,mission:{...sim.mission},cash:sim.cash,deliveries:sim.deliveries,cars:sim.cars.length,parkedCars:sim.cars.filter(car=>car._kerb).length,buildings:buildings.length,totalBuildings:cityIndex.stats.buildingFeatures,stream:world.getStatus(),ground:ground.getStatus(),streetDetail:streetDetail?.getStatus()||null,streetscape:streetscape?.getStatus()||null,landscape:landscape?.getStatus()||null,reconstruction:reconstructionReview?{model:reconstructionReview.model,summary:reconstructionReview.summary}:null,roadReconstruction:roadReconstructionReview?{model:roadReconstructionReview.model,summary:roadReconstructionReview.summary}:null,roadPilot:roadPilot?roadPilot.getStatus():{ready:false,loading:Boolean(roadPilotLoading),error:roadPilotError},navigation:navigation.getState(),map:gameMap.getState(),routeGuidance,cityView,aerialView,firstPersonView:firstPersonActive(),traveling,bootReady,shadows:{enabled:shadowsEnabled,active:renderer.shadowMap.enabled},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,started,paused})};
  startupPhase(.35,'Loading streets and buildings…',.58);
  requestAnimationFrame(frame);
  const [roads]=await Promise.all([roadStream.loadAround(seed.spawn),world.prepareAt(seed.spawn,300),landscapeReady]);
  sim.setActiveCity({roads,buildings,isReadyAt:(x,z,radius,y)=>world.isReadyAt(x,z,radius,Number.isFinite(y)?y-terrainHeight(x,z):0),missionPoints:destinationsFor(roads,seed.spawn)},{spawn:seed.spawn});city=sim.city;yaw=sim.player.angle;
  bootReady=true;cityUp();
  // The streets are in, but the map of the city is still arriving: the bar goes on, and the button comes with the picture (showOpening).
  startupPhase(.6,'Loading the city map…',.97);
  $('start-button').disabled=false;
}
restoreDisplaySettings();
boot().catch(error=>{
  console.error(error);$('startup-loading').hidden=true;$('load-error').hidden=false;
  $('load-error').textContent=error.message.includes('WebGL')?'This game needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.':error.message;
  $('startup-retry').hidden=false;
});
