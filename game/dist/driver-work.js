import { vehicleTravelSpeed } from './vehicle-dynamics.js';
import { doorPanel } from './vehicle-damage.js';
// Offers keep their quoted endpoints and pay through both legs of the trip.
import { isOpen, placeName } from './places.js';
import { menuFor } from './menu.js';

const customers = ['Maya', 'Luis', 'Imani', 'Noah', 'Priya', 'Sam', 'Avery', 'Jules'];
const gap = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

function curbStops(sim) {
  const stops = [];
  for (const road of sim.city.roads || []) {
    if (!road.name || !road.points?.length || ['bridge','tunnel','motorway','steps','path','cycleway','footway','pedestrian'].includes(road.kind) || [3,4].includes(road.roadwayType)) continue;
    const i = Math.floor(road.points.length/2);
    if (!i) continue;
    const [ax,az] = road.points[i-1], [bx,bz] = road.points[i];
    const length = Math.hypot(bx-ax,bz-az);
    if (length < 10) continue;
    const offset = (road.width || 8)/2 + .65;
    for (const side of [1,-1]) {
      const point = {name:road.name, x:(ax+bx)/2+side*(bz-az)/length*offset, z:(az+bz)/2-side*(bx-ax)/length*offset};
      if (gap(sim.player,point)>850 || sim.isBlocked(point.x,point.z,.45)) continue;
      stops.push(point); break;
    }
  }
  return stops.sort((a,b)=>gap(a,sim.player)-gap(b,sim.player));
}

export function driverOffer(work, kind, serial) {
  const {sim} = work;
  const fronts = work.fronts();
  const doorstep = f => ({name:placeName(f.place),placeId:f.place.id,x:f.x+f.nx*3.2,z:f.z+f.nz*3.2});
  const usable = point => Number.isFinite(point.x) && Number.isFinite(point.z) && !sim.isBlocked(point.x,point.z,.45);
  const curbs = curbStops(sim);
  const doors = fronts.filter(f=>f.place.name).map(doorstep).filter(usable);
  const stops = curbs.length ? curbs : (sim.city.missionPoints || []).filter(usable);
  let pickup, meal;
  if (kind === 'courier') {
    const restaurants = fronts.filter(f=>['food','dining','cafe'].includes(f.place.group) &&
      !work.isClosed(f.place) && isOpen(f.place.kind,work.hours()) && usable(doorstep(f)))
      .sort((a,b)=>gap(a,sim.player)-gap(b,sim.player)).slice(0,8);
    if (!restaurants.length) return null;
    const front = restaurants[serial % restaurants.length];
    pickup = doorstep(front);
    const menu = menuFor(front.place).filter(item=>item.effect==='meal');
    meal = menu[serial % menu.length]?.name || menuFor(front.place)[0]?.name || 'Lunch special';
  } else {
    const nearby = stops.filter(point=>gap(sim.player,point)>20).slice(0,10);
    if (!nearby.length) return null;
    pickup = nearby[serial % nearby.length];
  }
  const away = point => gap(point,pickup)>55 && gap(point,pickup)<1400;
  const addresses = kind==='courier' ? doors.filter(away) : [];
  const destinations = addresses.length ? addresses : stops.filter(away);
  if (!destinations.length) return null;
  const dropoff = destinations[serial % destinations.length];
  const meters = Math.round(gap(pickup,dropoff));
  return {kind,pickup,dropoff,meal,customer:customers[serial%customers.length],number:100+serial%900,
    meters,reward:kind==='courier'?8+Math.ceil(meters*.018):7+Math.ceil(meters*.022),
    totalTime:100+Math.ceil((meters+gap(sim.player,pickup))/3.2)};
}

export function driverEligible(sim) {
  const car = sim.vehicle;
  return Boolean(car && !car.destroyed && car.burningSince==null && !car.hired && car.type!=='police');
}

export function startDriverOffer(sim,offer) {
  if (sim.mission.phase==='active' || sim.ending || sim.player.mode==='passenger' || sim.rideHoldCents) return false;
  if (offer.kind==='driver' && !driverEligible(sim)) return false;
  sim.mission = {...offer,stage:'pickup',phase:'active',target:offer.pickup,timeLeft:offer.totalTime,
    vehicleId:offer.kind==='driver'?sim.player.vehicleId:null};
  sim._say(tripInstruction(sim.mission),7);
  return true;
}

export function tripInstruction(m) {
  if (m.kind==='courier') return m.stage==='pickup' ?
    'Walk to the pickup at '+m.pickup.name+' and collect order #'+m.number+' ('+m.meal+').' :
    'Meet '+m.customer+' on foot at '+m.dropoff.name+' and hand over the bag.';
  if (m.stage==='boarding') return 'Stay parked while '+m.customer+' gets in.';
  if (m.stage==='alighting') return 'Stay parked while '+m.customer+' gets out.';
  return m.stage==='pickup' ? 'Pull up beside '+m.customer+' and confirm the pickup.' : 'Drive '+m.customer+' to '+m.dropoff.name+' and let them out.';
}

export function tripAction(sim) {
  const m=sim.mission, p=sim.player;
  if(m.phase!=='active' || sim.ending || sim.subway || sim.seat || p.armed || p.move || p.reaction || !['pickup','dropoff'].includes(m.stage))return null;
  if(!sim.room && Number.isFinite(p.y) && Math.abs(p.y-sim.groundHeight(m.target.x,m.target.z))>3.2)return null;
  if(m.kind==='courier' && p.mode==='walk'){
    if(sim.room){
      if(m.stage!=='pickup' || sim.room.place?.id!==m.pickup.placeId || !sim.doorway?.clerk || gap(p,sim.doorway.clerk)>2.65)return null;
    }else if(gap(p,m.target)>3.4)return null;
    return m.stage==='pickup'?'COLLECT ORDER #'+m.number:'HAND BAG TO '+m.customer.toUpperCase();
  }
  if(m.kind==='driver' && sim.vehicle?.id===m.vehicleId && driverEligible(sim) && vehicleTravelSpeed(sim.vehicle)<.5 && gap(p,m.target)<9)
    return m.stage==='pickup'?'PICK UP '+m.customer.toUpperCase():'LET RIDER OUT';
  return null;
}

function finish(sim,m) {
  const tip=m.kind==='courier'?Math.round(6*m.timeLeft/m.totalTime):0;
  m.payout=m.reward+tip;
  m.phase='complete';m.finishedAt=sim.elapsed;
  sim.cash+=m.payout;
  if(m.kind==='courier')sim.deliveries++;
  sim.onTripPaid?.(m.kind==='driver'?'D Ride fare':'Food courier');
  sim._say(m.kind==='courier'?m.customer+' received the order. +$'+m.payout+' including $'+tip+' tip.':'Ride complete. +$'+m.payout+' fare.',7);
}

export function interactWithTrip(sim) {
  const m=sim.mission;
  if(m.phase==='active' && m.kind==='driver' && sim.vehicle?.id===m.vehicleId){
    if(m.stage==='boarding' || m.stage==='alighting')return true;
    if(gap(sim.player,m.target)<9 && vehicleTravelSpeed(sim.vehicle)>=.5){
      sim._say('Brake to a stop so your rider can use the door.');return true;
    }
  }
  if(!tripAction(sim))return false;
  if(m.kind==='courier'){
    if(m.stage==='dropoff')finish(sim,m);
    else {m.stage='dropoff';m.target=m.dropoff;sim._say(tripInstruction(m),7);}
  }else{
    m.stage=m.stage==='pickup'?'boarding':'alighting';
    const car=sim.vehicle;
    car.doorSide=-1;
    car.doorOpen=car.missingDoors & doorPanel(-1)?0:1;
    car.doorHold=2;
    m.transfer=0;sim._say(tripInstruction(m),4);
  }
  return true;
}

export function stepDriverTrip(sim,dt) {
  const m=sim.mission;
  if(m.kind!=='driver')return;
  if(!driverEligible(sim) || sim.player.vehicleId!==m.vehicleId){
    m.phase='failed';sim._say('Ride canceled. You left the driving seat or lost the car.',6);return;
  }
  if(m.stage!=='boarding' && m.stage!=='alighting')return;
  if(vehicleTravelSpeed(sim.vehicle)>=.5 || gap(sim.player,m.target)>=9){
    m.stage=m.stage==='boarding'?'pickup':'dropoff';m.transfer=0;sim._say('Pull over and stop to let your rider use the door.',5);return;
  }
  m.transfer=Math.min(1,m.transfer+dt/2);
  if(m.transfer<1)return;
  if(m.stage==='alighting')finish(sim,m);
  else {m.stage='dropoff';m.target=m.dropoff;sim._say(tripInstruction(m),7);}
}

export const courierBag = m => m.phase==='active' && m.kind==='courier' && m.stage==='dropoff' ? 'takeout' : null;
