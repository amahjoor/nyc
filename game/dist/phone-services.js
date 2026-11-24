import { availableCents, paymentMethod, payFor } from './money.js';
import { listingBySymbol, portfolio, sharePrice, restoreHoldings } from './market.js';
import { hasDriver } from './vehicle-damage.js';
import { vehicleTravelSpeed } from './vehicle-dynamics.js';
import { RideRoute } from './ride-route.js';
import { vehicleHandling } from './garage.js';
import { roadFigures, MPS_PER_MPH } from './vehicle-performance.js';
const cents = value => Math.round(value * 100);
export const BANK_HISTORY_MINUTES = 360;

export class PhoneBank {
  constructor() { this.restore(null, 0); }
  restore(record, cash) {
    this.preferredPayment=record?.preferredPayment==='cash'?'cash':'card';
    this.history = [];
    this.clockMinute = null;
    if (Array.isArray(record?.history)) {
      for (const point of record.history.slice(-BANK_HISTORY_MINUTES - 1)) {
        if (Array.isArray(point) && Number.isSafeInteger(point[0]) && point[0] >= 0 &&
            Number.isSafeInteger(point[1]) && point[0] > (this.history.at(-1)?.[0] ?? -1)) {
          this.history.push([point[0], point[1]]);
        }
      }
    }
    this.holdings = restoreHoldings(record?.holdings, record?.catalogVersion);
    this.realized = Number.isSafeInteger(record?.realized) ? record.realized : 0;
    // Earlier saves kept the wallet under cash and the deposited balance under savings.
    const deposited = record?.checking ?? record?.savings;
    this.checking = Number.isSafeInteger(deposited) && deposited >= 0 ? deposited : 0;
    this.entries = Array.isArray(record?.entries) ? record.entries.filter(row => row && typeof row.name === 'string' &&
      Number.isSafeInteger(row.amount) && typeof row.clock === 'string').slice(0, 16) : [];
    this.last = cents(cash);
  }
  record() { return { catalogVersion:2, preferredPayment:this.preferredPayment, checking:this.checking, entries:this.entries, holdings:this.holdings, realized:this.realized, history:this.history }; }
  sampleBalance(cash, hours, now = Date.now()) {
    if (!Number.isFinite(hours) || !Number.isFinite(cash)) return;
    const clock = Math.floor(hours * 60);
    const last = this.history.at(-1);
    // Resume at the saved point when the game clock restarts on load.
    const elapsed = this.clockMinute === null ? 0 : (clock - this.clockMinute + 1440) % 1440;
    const minute = (last?.[0] ?? 0) + elapsed;
    this.clockMinute = clock;
    const total = cents(cash) + this.checking + portfolio(this.holdings, now).value;
    if (last && !elapsed) last[1] = total;
    else this.history.push([minute, total]);
    while (this.history[0][0] < minute - BANK_HISTORY_MINUTES) this.history.shift();
  }
  sync(cash, clock = '', label) {
    const balance = cents(cash), change = balance - this.last;
    if (!Number.isSafeInteger(balance) || !change) return;
    this.last = balance;
    this.addEntry(label || (change > 0 ? 'Game earnings' : 'Game spending'), change, clock, 'Cash');
  }
  addEntry(name, amount, clock, account = 'Checking') {
    this.entries.unshift({name, amount, clock, account});
    this.entries.length = Math.min(this.entries.length, 16);
  }
  recordEndingLoss(kind, carried, clock) {
    // Account for any wallet activity since the last save before recording its loss.
    this.sync(carried, clock);
    const arrested = kind === 'busted';
    this.sync(0, clock, arrested ? 'Cash seized on arrest' : 'Cash lost on death');
    const fee = Math.min(2500, Math.round(this.checking / 100));
    if (fee > 0) {
      this.checking -= fee;
      this.addEntry(arrested ? 'Booking fee' : 'Hospital fee', -fee, clock);
    }
    return fee;
  }
  trade(sim, symbol, side, raw, quoted, clock, now=Date.now()) {
    const company=listingBySymbol.get(symbol);
    const shares=Number(raw);
    if(!company || !['buy','sell'].includes(side) || !/^\d+$/.test(String(raw).trim()) ||
       !Number.isSafeInteger(shares) || shares<1)return 'Enter a positive whole number of shares.';
    const price=sharePrice(company,now);
    if(price!==quoted)return 'The price changed. Review the new total and submit again.';
    const position=this.holdings[symbol] || {shares:0,cost:0}, amount=shares*price;
    const buying=side==='buy';
    if(!Number.isSafeInteger(amount))return 'This order is too large.';
    if(buying && company.sellOnly)return 'Only sales are available for this legacy holding.';
    if(buying && amount>availableCents(sim,'card',this))return 'Insufficient available checking balance.';
    if(!buying && shares>position.shares)return 'You do not own that many shares.';
    this.sync(sim.cash,clock);
    if(buying)this.holdings[symbol]={shares:position.shares+shares,cost:position.cost+amount};
    else {
      const remaining=position.shares-shares;
      const cost=Math.round(position.cost*(remaining/position.shares));
      this.realized+=amount-(position.cost-cost);
      if(remaining)this.holdings[symbol]={shares:remaining,cost};
      else delete this.holdings[symbol];
    }
    const change=buying?-amount:amount;
    this.checking+=change;
    this.addEntry((buying?'Bought ':'Sold ')+shares+' '+symbol,change,clock);
    return '';
  }
  transfer(sim, direction, raw, clock) {
    if (!['deposit','withdraw'].includes(direction) || !/^\d+(?:\.\d{1,2})?$/.test(String(raw).trim())) return 'Enter an amount in dollars and cents.';
    const amount = cents(Number(raw)), deposit = direction === 'deposit';
    if (!Number.isSafeInteger(amount) || amount <= 0) return 'Enter an amount greater than zero.';
    if (amount > availableCents(sim,deposit?'cash':'card',this)) return deposit ? 'Not enough available cash on hand.' : 'Not enough money in checking.';
    this.sync(sim.cash, clock);
    const delta = deposit ? amount : -amount;
    this.checking += delta;
    sim.cash = (cents(sim.cash) - delta) / 100;
    this.last = cents(sim.cash);
    this.addEntry(deposit ? 'ATM cash deposit' : 'ATM cash withdrawal',delta,clock);
    return '';
  }
}

// Headshots are rendered from these same numbered members of the street cast.
const drivers = [
  {name:'Andre Brooks',member:27,rating:'4.96'},
  {name:'Mina Park',member:57,rating:'4.93'},
  {name:'Rafael Cruz',member:67,rating:'4.98'},
];
const gap = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

// Door positions in cab-local metres. Positive X is the driver's side.
const passengerSeats = [
  {side:-1, along:0},
  {side:-1, along:-.76},
  {side:1, along:-.76},
];
function nearestPassengerSeat(car, player) {
  const dx=player.x-car.x, dz=player.z-car.z;
  const across=dx*Math.cos(car.angle)-dz*Math.sin(car.angle);
  const along=dx*Math.sin(car.angle)+dz*Math.cos(car.angle);
  const distance=seat=>Math.hypot(across-seat.side,along-seat.along);
  return passengerSeats.reduce((best,seat)=>distance(seat)<distance(best)?seat:best);
}

// Follow legal incoming lanes back from the actual pickup. The resulting
// forward itinerary is consumed by the same driver AI as ordinary traffic.
function findApproach(sim, stop) {
  const incoming=new Map();
  for(const edge of sim._graph.edges){
    if(!incoming.has(edge.to))incoming.set(edge.to,[]);
    incoming.get(edge.to).push(edge);
  }
  const queue=[{path:[stop.edge],after:0,fraction:stop.fraction}];
  const visited=new Set(); let best=null;
  for(let i=0;i<queue.length && i<250;i++){
    const {path,after,fraction}=queue[i], edge=path[0];
    if(visited.has(edge))continue;
    visited.add(edge);
    const length=edge.length*fraction;
    const back=Math.min(length*.9,145-after);
    const distance=after+back;
    if(back>0 && distance>=32 && (!best || distance>best.distance)){
      const point=sim._lanePoint(edge,fraction-back/edge.length);
      if(!sim._nearCar(point.x,point.z,3.5) && !sim._carContact(point.x,point.z,edge.angle)){
        best={point,path,distance}; if(distance>=130)return best;
      }
    }
    if(after+length>185)continue;
    const before=(incoming.get(edge.from)||[]).filter(prev=>prev.from!==edge.to && !visited.has(prev));
    before.sort((a,b)=>Math.cos(b.angle-edge.angle)-Math.cos(a.angle-edge.angle));
    for(const prev of before)queue.push({path:[prev,...path],after:after+length,fraction:1});
  }
  return best;
}

export class CityRides {
  constructor(sim, {planner, paid}) {
    this.sim=sim; this.planner=planner; this.paid=paid;
    this.trip=null; this.receipt=''; this.bookings=0;
  }
  get choosing(){return this.trip?.phase==='choosing';}
  nearbyCab() {
    const s=this.sim,p=s.player;
    if(p.mode!=='walk' || p.move || p.reaction || s.ending || s.seat || s.room)return null;
    if(this.canBoard())return this.trip.car;
    const car=s.getNearbyCar();
    if(car?.type!=='taxi' || !hasDriver(car) || !car._edge || s.transport?.nearby() || s.getNearbyBike(car))return null;
    return car;
  }
  boardStreetCab(car) {
    const s=this.sim;
    if(car!==this.nearbyCab() || !car)return false;
    if(this.trip){s._say('You already have a ride booked.');return false;}
    if(vehicleTravelSpeed(car)>4){s._say('Wait for the cab to slow down.');return false;}
    if(s.mission.phase==='active'){s._say('Finish your active delivery before taking a ride.');return false;}
    const driver=car.rideDriver || drivers[this.bookings++ % drivers.length];
    const pickup={x:car.x,z:car.z};
    this.trip={phase:'choosing',car,driver,pickup,stop:{point:pickup,edge:car._edge},cruise:car._cruise,remaining:0,fare:0};
    this.receipt='';
    Object.assign(car,{rideDriver:driver,hired:true,parked:true,speed:0,velocityX:0,velocityZ:0,_turn:null,
      passengerSeat:{side:nearestPassengerSeat(car,s.player).side,along:-.76}});
    this.seatPassenger(car);
    return true;
  }
  seatPassenger(car) {
    const s=this.sim;
    Object.assign(s.player,{mode:'passenger',vehicleId:car.id,standing:null,move:null,armed:false,grounded:true});
    s.updateGrounding();
  }
  releaseBooking(car) {
    if(this.trip?.car===car && this.trip.phase==='waiting'){
      car.hired=false;this.trip=null;this.receipt='Pickup canceled. No fare charged.';
    }
  }
  async quote(destination) {
    const streetTrip=this.choosing?this.trip:null;
    const planner=await this.planner();
    const pickup={x:this.sim.player.x,z:this.sim.player.z};
    const route=planner?.plan(pickup,destination);
    if(!route?.ok) throw new Error('No street route to this destination.');
    if(route.distance<50) throw new Error('This destination is within walking distance.');
    return {destination,pickup,planner,streetTrip,distance:route.distance,fare:Math.max(7,Math.ceil(4+route.distance*.0024))};
  }
  pickupChanged(quote){return gap(this.sim.player,quote.pickup)>5;}
  request(quote) {
    const s=this.sim;
    if((quote?.streetTrip || null)!==(this.choosing?this.trip:null))return 'Choose a destination for your current pickup.';
    if(this.trip && !this.choosing) return 'You already have a ride.';
    if(!quote || this.pickupChanged(quote)) return 'Updating the fare from your current location.';
    if(!paymentMethod(s,quote.fare)) return 'Your checking and cash balances are too low for this fare.';
    if(s.mission.phase==='active') return 'Finish your active delivery before taking a ride.';
    if(this.choosing){
      const {planner,destination,distance,fare}=quote;
      Object.assign(this.trip,{planner,destination,distance,fare});
      return this.startTrip(this.trip);
    }
    const pickup={x:s.player.x,z:s.player.z}, stop=s._pinTaxiPlacement(pickup,null);
    const approach=stop && findApproach(s,stop);
    if(!approach) return 'No driver can reach this pickup. Try a different street.';
    const driver=drivers[this.bookings++ % drivers.length], edge=approach.path[0];
    const car=s._makeCar('ride-'+this.bookings,'taxi',approach.point,edge.angle,edge);
    car.hired=true; car.rideDriver=driver; car._route=approach.path.slice(1);
    s.cars.push(car); s.updateGrounding();
    this.receipt='';
    this.trip={...quote,pickup,stop,car,driver,cruise:car._cruise,phase:'approaching',remaining:approach.distance,
      eta:Math.ceil(approach.distance/6),best:approach.distance,lastProgress:s.elapsed};
    return '';
  }
  // The map and ETA both read the real car and the turns it still has to take.
  approachPoints() {
    const t=this.trip;
    if(t?.phase==='traveling')return [t.car,t.car._edge?.to,...t.car._route.slice(0,3).map(edge=>edge.to)].filter(Boolean);
    if(!t || t.phase!=='approaching')return [];
    const {car,stop}=t, edges=[car._edge,...car._route];
    return [car,...edges.slice(0,-1).map(edge=>edge.to),stop.point];
  }
  update() {
    const t=this.trip, s=this.sim;
    if(!t)return;
    if(t.phase==='traveling' || this.choosing){this.updatePassenger(t);return;}
    const {car,stop}=t;
    if(s.ending || gap(s.player,t.pickup)>220 || !s.cars.includes(car) || car.destroyed || car.burningSince!=null || car.driverEjected){
      this.cancel('Pickup canceled. No fare charged.'); return;
    }
    if(t.phase!=='approaching')return;
    if(!car._edge){this.cancel('Your driver could not reach this street. No fare charged.');return;}
    const atStop=gap(car,stop.point);
    // Traffic can change lanes. A car level with the pickup in an adjacent lane
    // has arrived even when the two lane centres are more than five metres apart.
    const along=(car.x-stop.point.x)*Math.sin(stop.angle)+(car.z-stop.point.z)*Math.cos(stop.angle);
    const alongside=along>=-1 && atStop<Math.max(6,(stop.edge.road.width || 10)*.8);
    if(car._edge===stop.edge && (atStop<5 || alongside || (atStop<18 && car.speed<.8 && s.elapsed-t.lastProgress>4))){
      t.phase='waiting'; car.parked=true; car.speed=0; car._edge=null; car._route=[];
      t.eta=0; t.remaining=0;
      s._say(t.driver.name+' is here.',7);
      return;
    }
    const points=this.approachPoints();
    t.remaining=points.slice(1).reduce((total,p,i)=>total+gap(p,points[i]),0);
    if(t.remaining<t.best-1){t.best=t.remaining;t.lastProgress=s.elapsed;}
    if(s.elapsed-t.lastProgress>110){this.cancel('Your driver was blocked. Request another pickup.');return;}
    t.eta=Math.max(1,Math.ceil(t.remaining/Math.max(3,(car._cruise+car.speed)*.5)));
    if(car._edge===stop.edge)car._cruise=Math.min(car._cruise,Math.max(2,atStop*.6));
  }
  canBoard() {
    const s=this.sim,t=this.trip;
    return t?.phase==='waiting' && s.cars.includes(t.car) && !t.car.destroyed && !t.car.driverEjected && t.car.burningSince==null && s.player.mode==='walk' && !s.player.move && !s.player.reaction && !s.ending && !s.seat && !s.room &&
      Math.hypot(s.player.x-t.car.x,s.player.z-t.car.z)<6 && Math.abs((s.player.y||0)-(t.car.y||0))<3;
  }
  cancel(message='Ride canceled. No fare charged.') {
    if(!this.trip || this.trip.phase==='traveling' || this.choosing) return;
    this.removeCar(); this.trip=null; this.receipt=message;
  }
  removeCar() {
    const i=this.sim.cars.indexOf(this.trip?.car);
    if(i>=0)this.sim.cars.splice(i,1);
  }
  board() {
    if(!this.canBoard())return false;
    const t=this.trip,s=this.sim;
    if(!paymentMethod(s,t.fare) || s.mission.phase==='active'){this.cancel('Ride canceled. Check your balance and active deliveries.');s._say(this.receipt);return false;}
    const error=this.startTrip(t);
    if(error){this.cancel(error);s._say(error);return false;}
    return true;
  }
  startTrip(t) {
    const s=this.sim,car=t.car,edge=t.stop.edge;
    const tender=paymentMethod(s,t.fare);
    if(!tender)return 'Insufficient funds for this ride.';
    // Start where the driver actually stopped. If the route heads back along
    // this block, continue to its junction before making that turn.
    let route=t.planner.plan(car,t.destination,{startRoadId:edge.road.id});
    const first=route.legs?.[0]?.points;
    if(!first || first.length<2)return 'No route from this curb. No fare charged.';
    const backwards=(first[1][0]-first[0][0])*Math.sin(edge.angle)+(first[1][1]-first[0][1])*Math.cos(edge.angle)<0;
    if(backwards)route=t.planner.plan(edge.to,t.destination,{startRoadId:edge.road.id});
    if(!route.legs?.length)return 'No route from this curb. No fare charged.';
    t.itinerary=new RideRoute(route.legs);
    car._route=[];
    t.itinerary.fill(s,car);
    car._edge=backwards?edge:car._route.shift();
    if(!car._edge)return 'No route from this curb. No fare charged.';
    Object.assign(car,{passengerSeat:car.passengerSeat || nearestPassengerSeat(car,s.player),parked:false,_cruise:t.cruise,_wait:0,_turn:null});
    t.fastSpeed=roadFigures(vehicleHandling(car)).topSpeed*MPS_PER_MPH;
    t.phase='traveling';t.remaining=route.distance;t.lastProgress=s.elapsed;t.best=Infinity;
    s.ridePaymentMethod=tender;s.rideHoldCents=cents(t.fare);
    this.seatPassenger(car);this.updatePassenger(t);
    s._say('Riding with '+t.driver.name+'.',6);
    return '';
  }

  toggleHurry() {
    const t=this.trip;
    if(t?.phase!=='traveling' || t.stopping)return;
    t.car.rideHurry=!t.car.rideHurry;
    this.sim._say(t.car.rideHurry?'Your driver is hurrying.':'Your driver is back to normal speed.');
  }

  stopEarly() {
    if(this.choosing){this.trip.stopping=true;this.updatePassenger(this.trip);return;}
    if(this.trip?.phase==='traveling' && !this.trip.stopping){
      this.trip.stopping=true;this.trip.requestedStop=true;
      this.sim._say('Driver is stopping here. You pay for the distance ridden.');
    }
  }

  updatePassenger(t) {
    const s=this.sim,car=t.car;
    const aboard=s.player.mode==='passenger' && s.player.vehicleId===car.id;
    const interrupted=!aboard || (!this.choosing && !car._edge) || !s.cars.includes(car) || s.ending || car.destroyed || car.burningSince!=null || car.driverEjected;
    if(this.choosing && !interrupted && !t.stopping)return;
    if(!this.choosing && !interrupted){
      t.itinerary.fill(s,car);
      const end=s._lanePoint(car._edge,1,car._lane||0);
      const final=t.itinerary.next===t.itinerary.legs.length && !car._route.length;
      t.remaining=Math.max(0,t.itinerary.unloaded)+car._route.reduce((n,e)=>n+e.length,0)+gap(car,end);
      t.tripDistance??=t.remaining;
      if(t.remaining<t.best-1){t.best=t.remaining;t.lastProgress=s.elapsed;}
      if(s.elapsed-t.lastProgress>120)t.stopping=true;
      const cruise=car.rideHurry?t.fastSpeed:t.cruise;
      car._cruise=t.stopping?0:Math.min(cruise,final?Math.sqrt(4*Math.max(0,t.remaining-2.8)):Infinity);
      t.eta=Math.max(1,Math.ceil(t.remaining/Math.max(3,(cruise+car.speed)/2)));
      if(!t.stopping && (!final || t.remaining>5))return;
      car._cruise=0;
      if(car.speed>.65)return;
    }
    if(aboard){
      car.speed=0;
      if(s.cars.includes(car) && !s.ending){
        if(!s.interact())return;
      }else{
        Object.assign(s.player,s._findSafePoint(s.player.x,s.player.z,.45,car.id),{mode:'walk',vehicleId:null,speed:0,velocityX:0,velocityZ:0});
      }
    }
    const arrived=!interrupted && !t.stopping;
    const tender=s.ridePaymentMethod;
    s.ridePaymentMethod=null;s.rideHoldCents=0;this.trip=null;
    const fraction=Math.min(1,Math.max(0,1-t.remaining/Math.max(1,t.tripDistance || 0)));
    const fare=arrived?t.fare:!interrupted && t.requestedStop?Math.round(t.fare*fraction):0;
    this.receipt='Ride ended. No fare charged.';
    if(fare && payFor(s,fare,'Ride fare',tender)){
      this.paid();
      this.receipt=(arrived?'Arrived at '+t.destination.name:'Early drop-off')+' · $'+fare;
    }
    // Return the driver to local traffic once the passenger is clear of the door.
    const nearby=s._nearestEdge(car.x,car.z,car.angle);
    const next=!car.destroyed && car.burningSince==null && !car.driverEjected && nearby?.distance<12 ? nearby.edge : null;
    Object.assign(car,{hired:false,passengerSeat:null,rideHurry:false,_ridePlan:null,_cruise:t.cruise,_edge:next,_route:[],_turn:null,_wait:2,parked:!next});
    if(!s.ending)s._say(this.receipt,6);
  }
}
