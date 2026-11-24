import { receiveImpulse, stepImpulse, followFloor } from './character-physics.js';
import { trafficAtHeight } from './road-level.js';
import { hasStandingRoom, limitPedestrianStep, localWalkRoute, walkTowards } from './pedestrian-motion.js';
import { resetVehicleDynamics } from './vehicle-dynamics.js';
import { patrolAppearance } from './human-cast.js';
import { roomHasSight, roomLocal, roomPoint, walkRoom } from './room.js';
import { peopleInRoom, roomWalkStep, shopAisle } from './room-walk.js';
import { shopStairRoute } from './shop-entrance.js';

// The police: how wanted the player is, who is sent, how they hunt, and how it
// ends. The simulation owns the cars and moves them along the streets; this
// module decides where a patrol is going, takes the wheel when one has the
// player in front of it, and runs everything that is not a car: officers on
// foot, the helicopter, gunfire and the arrest.
//
// A chase has two states. In `chase` somebody can see the player and every
// unit knows where they are. Out of sight for a moment it becomes `search`:
// units go to where the player was last seen and fan out from there, each
// seeing only what is in front of it, and a clock runs down. Seen again, it is
// a chase again; if the clock runs out, the player has got away.
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const turnDelta = (from, to) => ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const MAX_STARS = 5;
// Patrol cars answering, by stars.
const UNITS = [0, 1, 2, 4, 6, 8], MAX_PATROLS = 14, MAX_OFFICERS = 10;
// What the player can be wanted for. `heat` is what one of them adds, in
// stars, and `cap` the most stars that kind of thing brings however often it
// is done: running red lights all night is still one star. Nothing is known
// to the police unless one of them sees it or somebody who did calls it in:
// `reach` is how far off a bystander notices, in metres, and `call` how
// likely each one who does is to pick up a phone. `certain` is done to the
// police themselves.
export const OFFENCES = {
  redLight: { heat: .5, cap: 1, minor: true },
  fare: { heat: .3, cap: 1, reach: 12, call: .15, minor: true },
  reckless: { heat: .4, cap: 1, reach: 24, call: .15, minor: true },
  collision: { heat: .5, cap: 1, reach: 30, call: .25, minor: true },
  glass: { heat: .5, cap: 1, reach: 24, call: .3 },
  theft: { heat: 1, cap: 1, reach: 16, call: .45 },
  pickpocket: { heat: 1, cap: 1, reach: 7, call: .22, watch: 12 },
  assault: { heat: .7, cap: 2, reach: 26, call: .35 },
  robbery: { heat: 1, cap: 2, reach: 30, call: .6 },
  carjack: { heat: 1, cap: 2, reach: 35, call: .45 },
  runDown: { heat: 1, cap: 2, reach: 40, call: .45 },
  brandish: { heat: .55, cap: 1, reach: 20, call: .35, minor: true },
  gunfire: { heat: 1, cap: 3, reach: 90, call: .5 },
  killing: { heat: 1.5, cap: 3, reach: 45, call: .6 },
  ramPatrol: { heat: .34, cap: 3, certain: true },
  hitOfficer: { heat: 1, cap: 3, certain: true },
  officerDown: { heat: 2, cap: 4, certain: true },
};
// How far a unit notices a crime that is not the one it is chasing.
const WATCH = 55;
const WARNING_WINDOW = 16, FLEE_TIME = 8;
const DOOR_APPROACH = {a:0,b:-.75}, DOOR_INSIDE = {a:0,b:.6};
// Seconds out of sight before the police give up, by stars.
export const evadeTime = stars => 18 + 8 * stars;
// How far a unit sees in a chase and in a search, how near it notices
// whatever its heading, and the half-angle of what it watches while searching.
export const SIGHT = { chase: 90, search: 62, changed: 24, close: 14, cone: 55 * Math.PI / 180 };
const CONE_COS = Math.cos(SIGHT.cone);
// A patrol car leaves the street and drives straight at the player inside this.
const INTERCEPT = 55, CAR_RADIUS = 0.92;
// Officers run a little slower than the player can.
const OFFICER = { radius: 0.4, run: 7.2, search: 3, health: 100, range: 45, hold: 12 };
export const HELICOPTER = { stars: 3, height: 62, speed: 34, chaseSight: 75, beam: 32 };
// Seconds held before the cuffs go on.
const BUST = 2;
// Shooting: seconds to bring the gun up, seconds for the aim to settle, and the range at which a settled shot at somebody standing still is even odds.
const AIM = { raise: .9, settle: 2.6, even: 9 };
/**
 * The chance that one shot from an officer lands. A pistol is a short-range
 * thing: even odds at nine metres on somebody standing still, one in five by
 * thirty, and much less on anyone moving, in a car, or with a hurried shot.
 */
export function hitChance(away, speed, driving, settle = AIM.settle, following = false) {
  let chance = .92 / (1 + Math.pow(Math.max(0, away) / AIM.even, 1.35) * .85);
  // Across the sights, a running target is a small one; a car covers most of whoever is in it.
  chance *= 1 / (1 + Math.max(0, speed) * (driving ? .09 : .28));
  if (driving) chance *= .55;
  chance *= .35 + .65 * clamp((settle - AIM.raise) / (AIM.settle - AIM.raise), 0, 1);
  // The second and third shots of a burst climb.
  if (following) chance *= .7;
  return clamp(chance, .02, .85);
}
export const OFFICER_LOOK = patrolAppearance('');

export class Police {
  constructor(sim) {
    this.sim = sim;
    this._rng = 0x9e3779b9;
    this._serial = 0;
    this.shotsFired = 0;
    this.cases = [];
    this.clear();
  }

  /** Everything forgotten at once: the player was arrested, put in hospital, or has travelled. */
  clear() {
    this.state = 'clear';
    this.fieldOfficers = [];
    this.lastKnown = null;
    this.evade = 0; this.evadeTotal = 0;
    this.searchTime = 0; this.chaseTime = 0; this.fleeTime = 0;
    this.officers = []; this.downOfficers=[]; this.shots = [];
    this.helicopter = null;
    this.arrest = 0; this.searchRoom = null;
    // Calls on their way in, who has died, and what the police last saw the player in.
    this.calls = []; this.killed = 0; this.fallen = 0; this.known = null; this.armed = false;
    this._seen = false; this._unseen = 0; this._lookAt = 0; this._dispatchAt = 0; this._stoppedFor = 0; this._saidAt = -Infinity;
    this.localResponse = false;
    this.localResponders = null;
    this.warningHeat = 0; this.warningUntil = 0;
    for (const car of this.sim.cars || []) if (car.type === 'police') { car._crewOut = false; car._direct = false; car._sees = false; }
  }

  get stars() { return clamp(Math.ceil(this.sim.heat - 1e-9), 0, MAX_STARS); }
  /** How far from where the player was last seen the search has spread. */
  get searchRadius() { return Math.min(240, 35 + this.searchTime * 5); }

  _random() {
    this._rng = (Math.imul(this._rng, 1664525) + 1013904223) >>> 0;
    return this._rng / 4294967296;
  }

  _say(message, seconds = 4) {
    if (this.sim.elapsed - this._saidAt < 6) return;
    this._saidAt = this.sim.elapsed;
    this.sim._say(message, seconds);
  }

  /** A crime has been called in: the police know where it happened (or, told nothing else, where the player is now). */
  report(at = null, localResponse = false, escalate = true, known = this._ride(), view = null) {
    const sim = this.sim, player = sim.player;
    if (this.state !== 'chase') {
      this.lastKnown = at ? { x: at.x, z: at.z } : { x: player.x, z: player.z };
      this.searchRoom = view;
    } else if (view) this.searchRoom = view;
    if (this.state === 'clear') {
      this.state = 'search'; this.searchTime = 0; this._unseen = 0; this.known = known;
      this.localResponse = localResponse;
      if (localResponse) {
        const scene = view ? {x:view.plan.x,z:view.plan.z,y:view.floor} : at ?? player;
        const nearby = unit => distance(unit,scene)<WATCH && (!Number.isFinite(scene.y) || trafficAtHeight(unit,scene.y));
        this.localResponders = new Set([
          ...sim.cars.filter(car=>car.type==='police' && !car._abandoned && !car.destroyed && !car.controlled && nearby(car)),
          ...this.fieldOfficers.filter(actor=>nearby(actor) && !(actor.absentUntil>sim.elapsed) && !(actor.downUntil>sim.elapsed)),
          ...this.officers.filter(nearby),
        ].map(unit=>unit.id));
      }
    } else {
      if (!localResponse && escalate) {
        this.localResponse = false;
        this.localResponders = null;
      }
      if (this.state === 'search' && known !== null) this.known = known;
    }
    // Dispatch the officers already posted at the scene of this report.
    let entrance = at;
    if (view) {
      const [x,z] = roomPoint(view.plan,DOOR_APPROACH.a,DOOR_APPROACH.b);
      entrance = {x,z,y:view.floor};
    }
    if(entrance && (localResponse || !this.sim.room) && !this.sim.subway?.belowStreet){
      for(const actor of this.fieldOfficers){
        if(!this._assigned(actor) || (actor.post?.unit.activity==='boat' || actor.post?.post==='case') || distance(actor,entrance)>WATCH ||
           (Number.isFinite(entrance.y) && !trafficAtHeight(actor,entrance.y)) || !this.sim._hasSight(actor,entrance))continue;
        this._respondFromPost(actor);
      }
    }
    this.evadeTotal = this.evade = evadeTime(this.stars);
  }

  _assigned(unit) {
    return !this.localResponders || this.localResponders.has(unit.id) || this.localResponders.has(unit.carId);
  }

  responding(car) { return this.stars>0 && this._assigned(car); }

  _activeRoom() {
    const {room,doorway} = this.sim;
    return room?.place && doorway?.plan?.place?.id === room.place.id ? doorway : null;
  }

  /** A visible suspect went through this entrance. Responders still have to find them inside. */
  roomEntered() {
    const view = this._activeRoom();
    if (view && this.state === 'chase' && this._seen) {
      this.searchRoom = view;
      this.lastKnown = {x:view.plan.x,z:view.plan.z};
    }
    this.roomChanged();
  }

  roomChanged() {
    this._lookAt = 0;
    this._seen = false;
    this.arrest = 0;
    for (const officer of this.officers) officer.sees = false;
  }

  /** What the player is in: the police look for that, and are slower to know them in anything else. */
  _ride() { const player = this.sim.player; return player.mode === 'drive' ? player.vehicleId : player.mode; }

  /** The most stars an offence can bring: more once people have died. */
  ceiling(kind) {
    const cap = OFFENCES[kind].cap;
    if (kind === 'officerDown') return this.fallen >= 3 ? 5 : cap;
    if (kind === 'killing') return this.killed >= 8 ? 5 : this.killed >= 4 ? 4 : cap;
    return cap;
  }

  /** Whether a police unit is where it would see something done at this place. */
  watching(at, reach = WATCH, heard = false) {
    const sim = this.sim;
    if (sim.room || sim.subway?.belowStreet) return false;
    const sees = observer => {
      const dx=at.x-observer.x, dz=at.z-observer.z, gap=Math.hypot(dx,dz);
      if(gap>=reach || (Number.isFinite(at.y)&&!trafficAtHeight(observer,at.y)))return false;
      if(heard)return true;
      const heading=observer.heading??observer.angle;
      return (observer._sees || observer.sees || gap<9 || !Number.isFinite(heading) ||
        dx*Math.sin(heading)+dz*Math.cos(heading)>=gap*CONE_COS) && sim._hasSight(observer,at);
    };
    for (const car of sim.cars) if (car.type === 'police' && !car._abandoned && !car._crewOut && sees(car)) return true;
    for (const officer of [...this.officers,...this.fieldOfficers]) if (!officer.reaction && !(officer.absentUntil>sim.elapsed) && sees(officer)) return true;
    return false;
  }

  /**
   * The player has done something (a key of OFFENCES) at a place. Seen by the
   * police it counts at once; seen by somebody else it counts when their call
   * gets through, a few seconds on; seen by nobody it never happened.
   * Returns how the incident was noticed, or null.
   */
  offence(kind, { x, y, z, message = '', seen = false, witnessReport = false, victim = null,
    severity = 1, identified = true, collision = false, localResponse = Boolean(this.sim.room), roomView } = {}) {
    const sim = this.sim, spec = OFFENCES[kind], player = sim.player;
    if (!spec) throw new Error(`no such offence: ${kind}`);
    const location = localResponse && sim.room ? sim.room : player;
    const at = { x: Number.isFinite(x) ? x : location.x ?? player.x, z: Number.isFinite(z) ? z : location.z ?? player.z };
    const height=Number.isFinite(y)?y:location.floor??player.y;
    if(Number.isFinite(height))at.y=height;
    const view = localResponse ? roomView ?? this._activeRoom() : null;
    const record={kind,at,collision,belowStreet:Boolean(sim.subway?.belowStreet),message,localResponse,severity,known:identified?this._ride():null,view};
    const queued=kind==='gunfire'?this.calls.findIndex(call=>call.kind===kind&&distance(call.at,at)<25):-1;
    const seenInside = view && view === this._activeRoom() && this.officers.some(officer => officer.room === view && !officer.reaction &&
      distance(officer,at) < WATCH && roomHasSight(view,officer,sim.player));
    if (seen || spec.certain || seenInside || (!localResponse && this.watching(at,spec.watch))) {
      if(queued!==-1)this.calls.splice(queued,1);
      this._charge(record,true);return 'seen';
    }
    if(kind==='gunfire'&&!localResponse&&this.watching(at,35,true)){
      if(queued!==-1)this.calls.splice(queued,1);
      this._charge({...record,known:null});return 'heard';
    }
    if(!witnessReport){
      const near=spec.reach>0?sim.witnesses(at.x,at.z,spec.reach,at.y,{exclude:victim,indoors:localResponse}):0;
      const victimChance=victim && !victim.dead && victim.state!=='down' ? .5 : 0;
      const chance=1-(1-victimChance)*(1-(spec.call||0))**near;
      if(!(chance>0 && this._random()<chance)){
        if(kind!=='gunfire' || !sim.witnesses(at.x,at.z,42,at.y,{heard:true,indoors:localResponse}) || this._random()>=.55)return null;
        record.known=null;
      }
    }
    if(queued!==-1){this.calls[queued].known??=record.known;return 'called';}
    this.calls.push({...record,due:sim.elapsed+4+this._random()*5});
    if(!this.stars && !spec.minor)sim._say(kind==='gunfire'&&record.known===null?'Someone heard the shots and called police.':'A witness is calling the police.',4);
    return 'called';
  }

  _charge({kind,at,collision,belowStreet,message,localResponse,severity,known,view}, direct = false) {
    const sim=this.sim, spec=OFFENCES[kind];
    const amount=spec.heat*clamp(severity,0,3);
    if(spec.minor && !this.stars){
      if(sim.elapsed>=this.warningUntil)this.warningHeat=0;
      this.warningHeat+=amount;
      this.warningUntil=sim.elapsed+WARNING_WINDOW;
      if(this.warningHeat<1-1e-9){
        if(direct)this._say(kind==='brandish'?'Police warning. Put the weapon away.':'Patrol warning. Take it easy.');
        return;
      }
      this.warningHeat=0;
      sim.heat=1;
    }else{
      if(kind==='killing')this.killed++;
      if(kind==='officerDown')this.fallen++;
      const cap=this.ceiling(kind);
      if(sim.heat<cap)sim.heat=Math.min(cap,sim.heat+amount);
    }
    // The follow-up stays at the reported location when the pursuit moves away.
    let units;
    if (kind==='killing' || kind==='officerDown') units=collision ? ['collision'] : ['scene','homicide'];
    if (kind==='robbery') units=[view?.plan?.place?.kind==='bank' ? 'major' : 'robbery'];
    if (kind==='carjack') units=['auto'];
    if (units && !belowStreet) {
      const site=view?.plan || at;
      const previous=this.cases.find(c=>c.units[0]===units[0] && distance(c,site)<16);
      if (previous) previous.reported=sim.elapsed;
      else {
        if (this.cases.length>=12) this.cases.shift();
        this.cases.push({id:'case-'+ ++this._serial,x:site.x,z:site.z,y:view?.floor ?? at.y,units,reported:sim.elapsed});
      }
    }
    sim._timeSinceCrime = 0;
    this.report(at,localResponse,!spec.minor,known,view);
    if (message) sim._say(message);
  }

  /** Calls that have got through. */
  _answer() {
    const sim = this.sim;
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const call = this.calls[i];
      if (sim.elapsed < call.due) continue;
      this.calls.splice(i, 1);
      this._charge(call);
    }
  }

  _playerSpeed() {
    const player = this.sim.player;
    return player.mode === 'drive' ? Math.hypot(player.velocityX || 0, player.velocityZ || 0) : Math.abs(player.speed || 0);
  }

  update(dt) {
    const sim = this.sim, player = sim.player;
    for(const actor of this.fieldOfficers){
      // An earlier impact can dispatch other officers from this same list.
      if(!this.fieldOfficers.includes(actor))continue;
      const hit=sim._nearCar(actor.x,actor.z,OFFICER.radius+.15,null,actor.y);
      if(hit && Math.abs(hit.car.speed)>4)this._vehicleImpact(this._respondFromPost(actor),hit.car);
    }
    while (this.shots.length && sim.elapsed - this.shots[0].at > 0.3) this.shots.shift();
    for(let i=this.downOfficers.length-1;i>=0;i--){
      const officer=this.downOfficers[i];
      if(sim.elapsed-officer.downAt>12) this.downOfficers.splice(i,1);
      else this._stepReaction(officer,dt);
    }
    if (this.cases.some(c=>sim.elapsed-c.reported>240)) this.cases=this.cases.filter(c=>sim.elapsed-c.reported<=240);
    if (this.calls.length) this._answer();
    if (!(sim.heat > 0)) {
      sim.heat = 0; sim.spotted = false;
      if (this.state !== 'clear') this._standDown();
      this._offDuty(dt);
      return;
    }
    sim.heat = Math.min(MAX_STARS, sim.heat);
    if (this.state === 'clear') this.report();
    const speed = this._playerSpeed();
    if (sim.elapsed >= this._lookAt) { this._lookAt = sim.elapsed + 0.1; this._seen = this._look(); }
    if (this._seen) {
      if (this.state !== 'chase') this._say(this.stars > 1 ? 'The police have you in sight.' : 'A patrol has spotted you.');
      this.state = 'chase'; this._unseen = 0; this.searchTime = 0;
      this.searchRoom = this._activeRoom();
      this.lastKnown = { x: player.x, z: player.z };
      this.known = this._ride();
      this.chaseTime += dt;
      // A sustained escape can add a second star. Moving away briefly does not.
      const fleeing=speed>(player.mode==='drive'?10:4.5);
      this.fleeTime=fleeing?this.fleeTime+dt:0;
      if(this.stars===1 && this.fleeTime>=FLEE_TIME)sim.heat=2;
      this.evadeTotal = this.evade = evadeTime(this.stars);
    } else {
      this.fleeTime=0;
      this._unseen += dt;
      if (this.state === 'chase' && this._unseen > 2) {
        this.state = 'search'; this.searchTime = 0;
        this._say(this.searchRoom ? 'The police are searching the building.' : 'Out of sight. Stay hidden until they give up.', 5);
      }
      if (this.state === 'search') {
        this.searchTime += dt;
        this.evade -= dt;
        if (this.evade <= 0) {
          sim.heat = 0; sim.spotted = false;
          this._standDown();
          sim._say('You lost the police.', 5);
          return;
        }
      }
    }
    sim.spotted = this.state === 'chase';
    this._stoppedFor = speed < 2 ? this._stoppedFor + dt : 0;
    if (sim.elapsed >= this._dispatchAt) { this._dispatchAt = sim.elapsed + 1; this._dispatch(); }
    if (this.searchRoom) {
      for (const car of sim.cars) {
        if (car.parked && !car._crewOut && this._atRoomScene(car) && this._dismount(car)) car.siren = true;
      }
    }
    this._officers(dt);
    this._helicopter(dt);
    if (sim.health > 0 && !sim.ending) this._arrests(dt);
  }

  /** Can anyone see the player? Sets `_sees` on each car, `sees` on each officer and the helicopter. */
  _look() {
    const sim = this.sim, player = sim.player, hidden = Boolean(sim.room || sim.subway?.belowStreet), chase = this.state === 'chase';
    // Searching, they look for what they last saw: in another car, or out of the one they were after, the player has to be close to be known.
    const changed = !chase && this.known !== null && this._ride() !== this.known;
    const range = chase ? SIGHT.chase : changed ? SIGHT.changed : SIGHT.search, close = changed ? SIGHT.close * .5 : SIGHT.close;
    const identifiable=chase || this.known!==null || (player.armed && this.lastKnown && distance(player,this.lastKnown)<35);
    const view = this._activeRoom();
    const sees = unit => {
      if (hidden || !identifiable || !this._assigned(unit)) return false;
      const dx = player.x - unit.x, dz = player.z - unit.z, d = Math.hypot(dx, dz);
      if (d > range) return false;
      if (Number.isFinite(unit.y) && Number.isFinite(player.y) && Math.abs(unit.y - player.y) > 12) return false;
      // Searching, a unit sees what is in front of it; in a chase it is looking for the player.
      if (!chase && d > close && dx * Math.sin(unit.angle) + dz * Math.cos(unit.angle) < CONE_COS * d) return false;
      return sim._hasSight(unit, player);
    };
    let seen = false;
    for (const actor of this.fieldOfficers) {
      if(!sees({...actor,angle:actor.heading}))continue;
      // Harbor crews keep shore units updated from their boat.
      if(actor.post?.unit.activity==='boat' || actor.post?.post==='case')seen=true;
      else this._respondFromPost(actor);
    }
    for (const car of sim.cars) {
      if (car.type !== 'police') continue;
      car._sees = !car._crewOut && !car._abandoned && sees(car);
      if (car._sees) seen = true;
    }
    for (const officer of this.officers) {
      officer.sees = !officer.reaction && this._assigned(officer) && (officer.room ?
        officer.room === view && identifiable && this._roomSeesPlayer(officer) : sees(officer));
      if (officer.sees) seen = true;
    }
    const helicopter = this.helicopter;
    if (helicopter) { helicopter.sees = !hidden && identifiable && !helicopter.leaving && this._fromAbove(helicopter); if (helicopter.sees) seen = true; }
    return seen;
  }

  /** The helicopter sees whoever is under it, unless a building stands close between. */
  _fromAbove(helicopter) {
    const sim = this.sim, player = sim.player, away = distance(helicopter, player);
    if (this.state === 'chase' ? away > HELICOPTER.chaseSight : distance(helicopter.light, player) > HELICOPTER.beam) return false;
    if (away < 8) return true;
    // The line of sight comes down steeply. Only the last of it, near the player, is low enough for a building to cut.
    for (const fraction of [0.66, 0.76, 0.86, 0.94]) {
      if (sim.isBlocked(helicopter.x + (player.x - helicopter.x) * fraction, helicopter.z + (player.z - helicopter.z) * fraction, 0.05, { ignoreWater: true })) return false;
    }
    return true;
  }

  /** Send as many cars as the stars call for, and bring back any that have been left behind. */
  _dispatch() {
    const sim = this.sim, player = sim.player, edges = sim._graph.edges;
    if (this.localResponse || !edges.length) return;
    let answering = 0, patrols = 0, stray = null, hasESU = false;
    for (const car of sim.cars) {
      if (car.type !== 'police') continue;
      patrols++;
      if (car._abandoned || (car.parked && !car._crewOut)) continue;
      const away = distance(car, player);
      if (car.unit==='esu') hasESU=true;
      if (away < 480) answering++;
      else if (!car._crewOut && !stray) stray = car;
    }
    if (stray && sim._joinTraffic(stray)) { stray._direct = false; stray._routeAt = 0; answering++; }
    const specialist = this.stars>=4 && !hasESU;
    if ((answering < UNITS[this.stars] || specialist) && patrols < MAX_PATROLS) {
      const car = sim._makeCar(`police-r${++this._serial}`, 'police', { x: player.x + 1e6, z: player.z }, 0, edges[0]);
      car.unit = specialist ? 'esu' : 'patrol';
      if(specialist){car.shape='van';sim._serviceIdentity(car);}
      car._dispatched = true;
      if (sim._joinTraffic(car)) sim.cars.push(car);
    }
  }

  /** A patrol's speed with its siren on. */
  cruise() { return this.state === 'chase' ? 15 + this.stars * 2.4 : 10; }
  /** Whether patrol cars drive into the player's car rather than follow it. */
  get rams() { return this.state === 'chase' && this.stars >= 2 && this.sim.player.mode === 'drive' && this._stoppedFor < 1; }

  _atRoomScene(car) {
    const view = this.searchRoom;
    return view && car.type === 'police' && this._assigned(car) && !car.controlled && !car._abandoned && !car.destroyed &&
      car.burningSince == null && distance(car,view.plan)<24 && Math.abs((car.y ?? view.floor)-view.floor)<4;
  }

  /** Where a patrol is heading: the player in a chase, somewhere in the search area otherwise. */
  _goal(car) {
    if (this.searchRoom) return this.searchRoom.plan;
    if (this.state === 'chase' || !this.lastKnown) return this.sim.player;
    if (this.searchTime < 4) return this.lastKnown;
    if (!car._goal || this.sim.elapsed > car._goalUntil || distance(car, car._goal) < 22) {
      const angle = this._random() * TAU, reach = Math.sqrt(this._random()) * this.searchRadius;
      car._goal = { x: this.lastKnown.x + Math.sin(angle) * reach, z: this.lastKnown.z + Math.cos(angle) * reach };
      car._goalUntil = this.sim.elapsed + 14;
    }
    return car._goal;
  }

  /**
   * Called for each patrol car before the simulation moves it as traffic.
   * Returns true when the car has been dealt with here: it is standing with
   * its crew out, or is being driven straight at the player.
   */
  drive(car, dt) {
    const sim = this.sim;
    if (car._crewOut) { car.speed = 0; car.siren = this.responding(car); return true; }
    if (this.state === 'clear' || !this._assigned(car)) {
      if (car._direct) this._rebind(car);
      return false;
    }
    const player = sim.player, away = distance(car, player), afoot = player.mode !== 'drive';
    if (this._atRoomScene(car)) {
      car.siren = true;
      car.speed *= Math.exp(-5*dt);
      if (Math.abs(car.speed)<2) this._dismount(car);
      return true;
    }
    const level = !Number.isFinite(car.y) || !Number.isFinite(player.y) || Math.abs(car.y - player.y) < 3;
    if (this.state === 'chase' && car._sees && away < INTERCEPT && level && !(car._avoid > sim.elapsed)) {
      car._direct = true; car.siren = true;
      const slow = afoot || this._stoppedFor > 1;
      // Held up behind the cars already there, the crew get out where they are and run the rest.
      car._stalled = Math.abs(car.speed) < 0.6 ? (car._stalled || 0) + dt : 0;
      if (slow && (away < 22 || (away < 50 && car._stalled > 0.8)) && Math.abs(car.speed) < 3 && this._dismount(car)) return true;
      this._intercept(car, dt, away, afoot);
      return true;
    }
    if (car._direct) this._rebind(car);
    if (!car._edge) return false;
    if (sim.elapsed >= (car._routeAt || 0)) {
      car._routeAt = sim.elapsed + (this.state === 'chase' ? 1.2 : 3) + this._random() * 0.4;
      sim._routePolice(car, this._goal(car));
    }
    return false;
  }

  /** Off the lane and straight at the player: alongside at one star, into them after that. */
  _intercept(car, dt, away, afoot) {
    const sim = this.sim, player = sim.player, rams = this.rams;
    const lead = afoot ? 0 : clamp(away / Math.max(8, Math.abs(car.speed)), 0, 1.1);
    const tx = player.x + (player.velocityX || 0) * lead, tz = player.z + (player.velocityZ || 0) * lead;
    const delta = turnDelta(car.angle, Math.atan2(tx - car.x, tz - car.z));
    car.angle += clamp(delta, -2.4 * dt, 2.4 * dt);
    let speed = this.cruise() * 1.08 / (1 + Math.abs(delta) * 1.3);
    // Nobody is run down on foot, and at one star the patrol only keeps up.
    if (afoot) speed = Math.min(speed, Math.max(0, (away - 10) * 1.3));
    else if (!rams) speed = Math.min(speed, this._playerSpeed() + Math.max(-4, (away - 7.5) * 1.3));
    car._wait = Math.max(0, (car._wait || 0) - dt);
    if (car._wait > 0) speed = 0;
    const sin = Math.sin(car.angle), cos = Math.cos(car.angle), sight = 6 + Math.abs(car.speed) * 0.5;
    for (const other of sim.cars) {
      if (other === car || (rams && other.controlled)) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      if (Math.abs(dx) > sight + 2 || Math.abs(dz) > sight + 2) continue;
      const along = dx * sin + dz * cos;
      if (along > 0 && along < sight && Math.abs(dx * cos - dz * sin) < 1.95) speed = Math.min(speed, Math.max(0, (along - 5) * 1.2));
    }
    car.speed += (Math.max(0, speed) - car.speed) * (1 - Math.exp(-3.2 * dt));
    const next = sim._resolvePosition(car.x + sin * car.speed * dt, car.z + cos * car.speed * dt, CAR_RADIUS, car.angle, car, false, dt);
    car.x = next.x; car.z = next.z;
    if (next.hit) {
      car.speed *= 0.9;
      car._jammed = (car._jammed || 0) + dt;
      // Stuck on a wall: back to the street for a while, and round by the road.
      if (car._jammed > 1.5) { car._jammed = 0; car._avoid = sim.elapsed + 4; }
    } else car._jammed = Math.max(0, (car._jammed || 0) - dt);
  }

  /** Back onto the street nearest the car, facing the way it faces if there is such a lane. */
  _rebind(car) {
    const sim = this.sim;
    car._direct = false; car._route = []; car._routeAt = 0; car._lane = 0; car._stuckTime = 0;
    let best = null;
    for (const edge of sim._graph.edges) {
      const dx = edge.to.x - edge.from.x, dz = edge.to.z - edge.from.z, length = dx * dx + dz * dz || 1;
      const t = clamp(((car.x - edge.from.x) * dx + (car.z - edge.from.z) * dz) / length, 0, 1);
      const gap = Math.hypot(car.x - edge.from.x - dx * t, car.z - edge.from.z - dz * t);
      if (gap > 60) continue;
      const score = gap + Math.abs(turnDelta(car.angle, edge.angle)) * 4;
      if (!best || score < best.score) best = { edge, score };
    }
    car._edge = best?.edge || null;
    if (!car._edge) sim._recycleTraffic(car);
  }

  _nearbyPeople(actor,reach) {
    const sim=this.sim;
    const people=[...this.officers,...this.downOfficers,...(sim._people || []),...sim.bystanders];
    if(sim.player.mode==='walk')people.push(sim.player);
    return people.filter(p=>p!==actor && !p.gone && !(p.absentUntil>sim.elapsed) &&
      Math.abs(p.x-actor.x)<reach && Math.abs(p.z-actor.z)<reach);
  }

  _respondFromPost(actor) {
    const officer={id:actor.id,post:actor.post,fieldActor:actor,look:actor.look,unit:actor.unit,
      x:actor.x,y:actor.y,z:actor.z,angle:actor.heading,speed:0,health:OFFICER.health,
      phase:actor.phase||0,stride:0,fire:1,sees:false};
    this.fieldOfficers=this.fieldOfficers.filter(other=>other!==actor);
    this.officers.push(officer);
    return officer;
  }

  /** Two officers out of a stopped patrol car. */
  _dismount(car) {
    const sim = this.sim;
    if (this.officers.length + 2 > MAX_OFFICERS) return false;
    const occupants=this._nearbyPeople(car,5), exits=[];
    for(const side of [-1,1]){
      const x=car.x-Math.cos(car.angle)*side*1.7,z=car.z+Math.sin(car.angle)*side*1.7;
      let exit;
      for(const along of [0,.85,-.85,1.7,-1.7]){
        const at=sim._resolvePosition(x+along*Math.sin(car.angle),z+along*Math.cos(car.angle),OFFICER.radius);
        const point={x:at.x,z:at.z,y:sim.groundHeight(at.x,at.z),side};
        if(hasStandingRoom(point,occupants)){exit=point;break;}
      }
      if(!exit)return false;
      exits.push(exit);occupants.push(exit);
    }
    car._crewOut = true; car.speed = 0;
    resetVehicleDynamics(car);
    for (const {x,z,y,side} of exits) {
      this.officers.push({ id: `officer-${++this._serial}`, carId: car.id, x,z,y, angle: car.angle, speed: 0,
        health: OFFICER.health, phase: this._random() * 6, stride: 0, fire: 0.7 + this._random(), sees: false, aiming: false, returning: false, goal: null, unit:car.unit || 'patrol', uniform:side>0 ? 1 : 0 });
    }
    return true;
  }

  _board(officer, car) {
    if(officer.fieldActor && distance(officer,officer.post)<1){
      Object.assign(officer.fieldActor,{x:officer.x,y:officer.y,z:officer.z,heading:officer.angle});
    }
    this.officers.splice(this.officers.indexOf(officer), 1);
    if (!car || this.officers.some(other => other.carId === car.id)) return;
    car._crewOut = false;
    if (car.parked) car.siren = false;
    else this._rebind(car);
  }

  _stepReaction(officer,dt) {
    const x=officer.x,z=officer.z;
    const view=officer.room;
    stepImpulse(officer,dt,(actor,x,z)=>{
      if(!view)return this.sim._resolvePosition(x,z,OFFICER.radius,null,actor,true);
      const plan=view.plan,at=roomLocal(plan,actor.x,actor.z),to=roomLocal(plan,x,z);
      const moved=walkRoom(plan,at.a,at.b,to.a-at.a,to.b-at.b,OFFICER.radius);
      const [wx,wz]=roomPoint(plan,moved.a,Math.max(.08,moved.b));
      return {x:wx,z:wz};
    }, actor=>view?.floor ?? (this.sim._sampleSurface?.(actor.x,actor.z,{referenceHeight:actor.y,mode:'walk'})?.elevation ?? this.sim.groundHeight(actor.x,actor.z)));
    limitPedestrianStep(officer,x,z,this._nearbyPeople(officer,Math.hypot(officer.x-x,officer.z-z)+1));
    officer.speed=officer.stride=0;
    officer.aiming=officer.cuffing=false;
  }

  _roomSeesPlayer(officer) {
    const view = officer.room;
    return view && view === this._activeRoom() &&
      roomLocal(view.plan,officer.x,officer.z).b>0 &&
      roomHasSight(view,officer,this.sim.player,1.42,this.sim.seat ? .85 : 1.16);
  }

  _canReachSuspect(officer, view = this._activeRoom()) {
    if (!this.sim.room) return !officer.room;
    if (!view || officer.room!==view || !this._roomSeesPlayer(officer)) return false;
    const plan = view.plan, player = this.sim.player;
    return shopAisle(view).clear(roomLocal(plan,officer.x,officer.z),roomLocal(plan,player.x,player.z),.18);
  }

  _roomStep(officer, view, goal, pace, dt) {
    const plan = view.plan, at = roomLocal(plan,officer.x,officer.z);
    const [x,z] = roomPoint(plan,goal.a,goal.b);
    const previousPhase = officer.phase || 0;
    const others = peopleInRoom(view,officer);
    for (const person of [this.sim.player,...this.officers]) {
      if (person !== officer && !others.includes(person)) others.push(person);
    }
    const moved = roomWalkStep(view,officer,x,z,pace*dt,others);
    const next = roomLocal(plan,officer.x,officer.z), skew = plan.skew || 0;
    if (Math.abs(next.b)<.85) view.door?.push(at.a+skew*at.b,at.b,next.a+skew*next.b,next.b,.3,dt);
    officer.phase = previousPhase + moved*3.3;
    officer.speed = moved/dt;
    officer.stride = Math.min(1,officer.speed/1.2);
    if (moved>.001) officer.angle = officer.heading;
    return distance(officer,{x,z})<.13;
  }

  /** Let the street path bring the officer to the bottom of the steps first. */
  _approachRoom(officer, view, dt) {
    const plan = view.plan;
    if (officer.entrance?.view !== view) {
      const stairs = shopStairRoute(plan,view.entry?.stairs,roomLocal(plan,officer.x,officer.z));
      officer.entrance = {view,path:[...(stairs || [DOOR_APPROACH]),DOOR_INSIDE],at:0};
    }
    const entry = officer.entrance, next = entry.path[entry.at];
    const [x,z] = roomPoint(plan,next.a,next.b);
    if (!entry.at && next !== DOOR_INSIDE && distance(officer,{x,z})>.27) return {x,z};
    if (this._roomStep(officer,view,next,OFFICER.search,dt)) entry.at++;
    if (roomLocal(plan,officer.x,officer.z).b>=.17) {
      officer.room = view;
      officer.entrance = null;
      officer.footRoute=null;
      officer.blockedFor=0;
      this._lookAt = 0;
    }
    return null;
  }

  _searchGoal(officer, view, at, aisle) {
    if (officer.roomGoal && this.sim.elapsed<officer.roomGoal.until &&
        Math.hypot(at.a-officer.roomGoal.a,at.b-officer.roomGoal.b)>.45) return officer.roomGoal;
    if (!view.policeSearchPoints) {
      const cells = new Map();
      for (const node of aisle.nodes) {
        const key = Math.floor(node.a/2.5)+','+Math.floor(node.b/2.5);
        if (!cells.has(key)) cells.set(key,node);
      }
      view.policeSearchPoints = [...cells.values()];
    }
    const checked = officer.checkedRoom ??= new Set();
    const targets = view.policeSearchPoints.filter(node => !checked.has(node) &&
      !this.officers.some(other => other !== officer && other.room === view && other.roomGoal?.node === node));
    if (!targets.length) return DOOR_INSIDE;
    const node = targets.reduce((a,b) => Math.hypot(at.a-a.a,at.b-a.b)<Math.hypot(at.a-b.a,at.b-b.b) ? a : b);
    checked.add(node);
    return officer.roomGoal = {a:node.a,b:node.b,node,until:this.sim.elapsed+5};
  }

  _insideOfficer(officer, dt, chase, stars, speed) {
    const sim = this.sim, player = sim.player, view = officer.room, plan = view.plan;
    const exiting = officer.roomExit || this.searchRoom !== view || !this._assigned(officer), away = distance(officer,player);
    const sees = !exiting && officer.sees && this._roomSeesPlayer(officer);
    const shooting = chase && sees && (stars>=3 || (stars===2 && (this.armed || player.armed)));
    officer.aiming = !officer.cuffing && sees && (shooting || speed<3.2 && away<8);
    const at = roomLocal(plan,officer.x,officer.z), aisle = shopAisle(view);
    if (exiting && !officer.roomExit) {
      const stairs = view.entry?.stairs, route = [];
      if (at.b>=.65 || Math.abs(at.a)>=.24) route.push(DOOR_INSIDE);
      if (stairs?.turn) route.push(roomLocal(plan,...stairs.point(0,0)));
      route.push(stairs ? roomLocal(plan,...stairs.point(stairs.toe+.36,0)) : DOOR_APPROACH);
      officer.roomExit = route;
    }
    const goal = exiting ? officer.roomExit[0] :
      sees ? roomLocal(plan,player.x,player.z) : this._searchGoal(officer,view,at,aisle);
    const hold = sees ? (shooting && !officer.cuffing ? 5 : 1.05) : 0;
    const pace = sees ? clamp((away-hold)*3,0,5) : OFFICER.search;
    let next = goal;
    if (pace>.05 && goal.b>=0 && !aisle.clear(at,goal,.18)) {
      const route = officer.roomRoute;
      if (!route || route.until<=sim.elapsed || Math.hypot(route.goal.a-goal.a,route.goal.b-goal.b)>.6) {
        officer.roomRoute = {goal,until:sim.elapsed+.5,path:aisle.route(at,goal)};
      }
      const path = officer.roomRoute.path;
      while (path?.length>1 && Math.hypot(at.a-path[0].a,at.b-path[0].b)<.18) path.shift();
      next = path?.[0];
    } else officer.roomRoute = null;
    if (next && pace>.05) {
      const arrived = this._roomStep(officer,view,next,pace,dt);
      if (exiting && next===goal && arrived) {
        officer.roomExit.shift();
        if (!officer.roomExit.length) {
          officer.room = officer.roomExit = officer.roomGoal = officer.roomRoute = officer.checkedRoom = null;
          return;
        }
      }
    } else {
      officer.speed = officer.stride = 0;
    }
    if (sees) officer.angle += turnDelta(officer.angle,Math.atan2(player.x-officer.x,player.z-officer.z))*(1-Math.exp(-12*dt));
    this._officerFire(officer,dt,shooting,away,false,speed);
  }

  _streetStep(officer, target, wanted, dt) {
    const sim=this.sim;
    let route=officer.footRoute;
    if(route && distance(route.goal,target)>3)route=officer.footRoute=null;
    if(route && distance(officer,route.path[0])<.28){
      route.path.shift();
      if(!route.path.length)route=officer.footRoute=null;
    }
    if(wanted<=.05){officer.footRoute=null;officer.blockedFor=0;return;}
    const goal=route?.path[0] || target, before=distance(officer,goal);
    const blocked=(x,z)=>sim.isBlocked(x,z,OFFICER.radius,{baseHeight:officer.y}) ||
      sim._nearCar(x,z,OFFICER.radius,null,officer.y);
    const others=this._nearbyPeople(officer,3+wanted*dt);
    // A car or another actor can move into a position the officer already owns.
    if(blocked(officer.x,officer.z)){
      const point=sim._resolvePosition(officer.x,officer.z,OFFICER.radius,null,officer,true);
      const bump=sim._nearCar(point.x,point.z,OFFICER.radius,null,officer.y);
      const x=point.x+(bump?bump.nx*(bump.depth+.001):0), z=point.z+(bump?bump.nz*(bump.depth+.001):0);
      if(distance(officer,{x,z})<1 && !blocked(x,z) && hasStandingRoom({x,z,y:officer.y,look:officer.look},others)){
        officer.x=x;officer.z=z;
      }
    }
    walkTowards(officer,goal.x,goal.z,wanted*dt,others,(x,z)=>!blocked(x,z));
    if(before-distance(officer,goal)>wanted*dt*.22){officer.blockedFor=0;return;}
    officer.blockedFor=(officer.blockedFor||0)+dt;
    if(officer.blockedFor<.55)return;
    officer.footRoute=null;officer.blockedFor=0;
    const standing=this._nearbyPeople(officer,16).filter(person=>person!==sim.player &&
      (person.walkSpeed ?? person.speed ?? 0)<.15);
    const probe={x:0,y:officer.y,z:0,look:officer.look};
    const path=localWalkRoute(officer,target,(x,z)=>{
      probe.x=x;probe.z=z;
      return blocked(x,z) || !hasStandingRoom(probe,standing);
    });
    if(path.length)officer.footRoute={goal:{x:target.x,z:target.z},path};
    else if(target===officer.goal)officer.goal=null;
    else officer.blockedFor=-.85;
  }

  _officers(dt) {
    const sim = this.sim, player = sim.player, stars = this.stars, chase = this.state === 'chase', clear = this.state === 'clear';
    const driving = player.mode === 'drive', speed = this._playerSpeed();
    let arresting=null;
    if(chase && this.arrest>.45 && !driving){
      let nearest=2.4;
      for(const officer of this.officers){
        const gap=distance(officer,player);
        if(!officer.reaction && officer.sees && gap<nearest && this._canReachSuspect(officer)){arresting=officer;nearest=gap;}
      }
    }
    for (const officer of [...this.officers]) {
      if(officer.reaction){this._stepReaction(officer,dt);continue;}
      officer.cuffing=officer===arresting;
      const car = sim.cars.find(other => other.id === officer.carId) || null, away = distance(officer, player);
      // Left behind with no car to go back to.
      if (away > 150) { this._board(officer, car); continue; }
      if (officer.room) { this._insideOfficer(officer,dt,chase,stars,speed); continue; }
      const inactive = clear || !this._assigned(officer);
      if (inactive && !car && !officer.post) { this._board(officer,car); continue; }
      const responding = !inactive && this.searchRoom && distance(officer,this.searchRoom.plan)<WATCH+12;
      const doorTarget = responding ? this._approachRoom(officer,this.searchRoom,dt) : null;
      if (responding && !doorTarget) { officer.aiming=false; continue; }
      if (!responding) officer.entrance = null;
      if (inactive || (driving && speed > 6 && away > 28) || (!chase && this.searchTime > 10 && away > 50)) officer.returning = Boolean(car || officer.post);
      else if (chase && away < 60 && (!driving || speed < 2)) officer.returning = false;
      // Guns are out at three stars, and before that only for somebody who has one out themselves.
      const shooting = chase && !officer.returning && (stars >= 3 || (stars === 2 && this.armed));
      let target, pace = OFFICER.run, hold = 1.3;
      officer.aiming = false;
      if (doorTarget) { target = doorTarget; hold = .12; officer.returning = false; }
      else if (officer.returning) { target = car || officer.post; hold = car ? 2.6 : .2; }
      else if (chase) {
        target = player;
        if (shooting && officer.sees) { hold = OFFICER.hold; officer.aiming = true; }
        else if (driving) hold = 2.6;
        if(!officer.cuffing && officer.sees && !driving && speed<3.2 && away<8) officer.aiming=true;
        if(officer.cuffing){hold=1;officer.aiming=false;}
        else if(!officer.sees && !driving)hold=.65;
      } else if (this.searchTime < 3) { target = this.lastKnown; hold = 1.5; }
      else {
        // Looking around on foot, near where the player was last seen.
        if (!officer.goal || sim.elapsed > officer.goalUntil || distance(officer, officer.goal) < 2) {
          const angle = this._random() * TAU, reach = 6 + this._random() * 26;
          officer.goal = { x: this.lastKnown.x + Math.sin(angle) * reach, z: this.lastKnown.z + Math.cos(angle) * reach };
          officer.goalUntil = sim.elapsed + 7;
        }
        target = officer.goal; pace = OFFICER.search; hold = 1;
      }
      const dx = target.x - officer.x, dz = target.z - officer.z, gap = Math.hypot(dx, dz);
      if (officer.returning && gap < (car ? 2.8 : .35)) { this._board(officer, car); continue; }
      let heading = Math.atan2(dx, dz);
      const wanted = clamp((gap - hold) * 3, 0, pace);
      const before = { x: officer.x, z: officer.z };
      this._streetStep(officer,target,wanted,dt);
      const moved = distance(before, officer);
      if(moved>0)heading=Math.atan2(officer.x-before.x,officer.z-before.z);
      const struck = sim._nearCar(officer.x, officer.z, OFFICER.radius + .15, null, officer.y);
      if (struck && Math.abs(struck.car.speed) > 4) {
        this._vehicleImpact(officer,struck.car);
        continue;
      }
      officer.speed = moved / dt;
      officer.phase += moved * 3.3;
      officer.stride = Math.min(1, officer.speed / 1.2);
      if(moved>0 || officer.airborne){
        const floor=sim._sampleSurface?.(officer.x,officer.z,{referenceHeight:officer.y,mode:'walk'})?.elevation ?? sim.groundHeight(officer.x,officer.z);
        const impact=followFloor(officer,floor,dt);
        if(impact>9.5 || officer.vy < -7){
          receiveImpulse(officer,Math.sin(heading)*officer.speed,Math.cos(heading)*officer.speed,{fall:true,rest:.3,impact:impact||-officer.vy});
          continue;
        }
      }
      const facing = officer.aiming || (!doorTarget && moved < 1e-4) ? Math.atan2(player.x - officer.x, player.z - officer.z) : heading;
      officer.angle += turnDelta(officer.angle, facing) * (1 - Math.exp(-12 * dt));
      // Nobody shoots on the run. Standing with the player in sight, the gun
      // comes up, the aim settles over a couple of seconds, and it is lost
      // again whenever the officer has to move or the player goes out of sight.
      this._officerFire(officer,dt,shooting && !sim.room,away,driving,speed);
    }
  }

  _officerFire(officer, dt, shooting, away, driving, speed) {
    const steady = shooting && !officer.cuffing && officer.sees && away<OFFICER.range && officer.speed<1 && !this.sim.ending;
    officer.settle = steady ? Math.min(AIM.settle,(officer.settle || 0)+dt) : Math.max(0,(officer.settle || 0)-dt*3);
    if (!steady) officer.burst=0;
    if (!steady || officer.settle<AIM.raise) return;
    officer.fire -= dt;
    if (officer.fire>0) return;
    officer.burst = officer.burst>0 ? officer.burst-1 : 1+Math.floor(this._random()*2);
    officer.fire = officer.burst>0 ? .32+this._random()*.2 : (2.1-this.stars*.2)*(.7+this._random()*.7);
    this._shoot(officer,away,driving,speed);
  }

  _shoot(officer, away, driving, speed) {
    const sim = this.sim, player = sim.player, stars = this.stars;
    if (officer.room && !this._roomSeesPlayer(officer)) return;
    if (officer.room) officer.room.gunfireAt = sim.elapsed;
    const chance = hitChance(away, speed, driving, officer.settle || 0, officer.burst > 0);
    // A miss goes wide by more the further off it was fired from.
    const hit = this._random() < chance, spread = hit ? 0 : .5 + this._random() * (1 + away * .07), side = this._random() < 0.5 ? -1 : 1;
    const ax = (player.z - officer.z) / (away || 1), az = -(player.x - officer.x) / (away || 1);
    this.shots.push({ at: sim.elapsed, hit,
      x: officer.x + Math.sin(officer.angle) * 0.5, y: (officer.y || 0) + 1.42, z: officer.z + Math.cos(officer.angle) * 0.5,
      tx: player.x + ax * spread * side, ty: (player.y || 0) + (driving ? 0.9 : 1.1), tz: player.z + az * spread * side });
    this.shotsFired++;
    if (hit) sim.hurt(driving ? 4 + stars : 9 + stars * 1.5, 'police');
  }

  _vehicleImpact(officer,car) {
    this.sim.onVehicleContact?.('person',car,officer,Math.abs(car.speed));
    const speed=Math.abs(car.speed);
    const rolling=car.controlled || car._loose>0;
    const vx=rolling ? car.velocityX : Math.sin(car.angle)*car.speed;
    const vz=rolling ? car.velocityZ : Math.cos(car.angle)*car.speed;
    officer.health-=speed*7;
    receiveImpulse(officer,vx*.65,vz*.65,{fall:true,lift:Math.min(4.5,speed*.21),rest:officer.health<=0 ? Infinity : .65});
    if(officer.health<=0) this._down(officer, 'You ran down an officer.', car.controlled ? 1.5 : 0, true);
    else if(car.controlled) this.offence('hitOfficer',{x:officer.x,z:officer.z,message:'You hit an officer with the car.'});
  }

  _down(officer, message, heat, collision = false) {
    const car = this.sim.cars.find(other => other.id === officer.carId) || null;
    this.officers.splice(this.officers.indexOf(officer), 1);
    if(!officer.reaction?.fall) receiveImpulse(officer,0,0,{fall:true,rest:Infinity});
    officer.aiming=officer.cuffing=false;
    officer.downAt=this.sim.elapsed;
    this.downOfficers.push(officer);
    if(officer.fieldActor)officer.fieldActor.absentUntil=this.sim.elapsed+90;
    if (car) {
      car._lost = (car._lost || 0) + 1;
      // A car with nobody left to drive it stays where it stopped.
      if (!this.officers.some(other => other.carId === car.id)) {
        if (car._lost >= 2) { car._abandoned = true; car._crewOut = false; car.parked = true; car.siren = false; car._edge = null; }
        else { car._crewOut = false; this._rebind(car); }
      }
    }
    if (heat) this.offence('officerDown', { x: officer.x, y:officer.y, z: officer.z, message, collision });
  }

  meleeTarget(x,z,angle,y=this.sim.player.y) {
    let best=null, reach=2;
    for (const officer of [...this.officers,...this.fieldOfficers]) {
      const dx=officer.x-x, dz=officer.z-z, d=Math.hypot(dx,dz);
      if (officer.health<=0 || d>reach || (officer.reaction?.fall && d>1.25) ||
          Math.abs(officer.y-y)>1.3 || dx*Math.sin(angle)+dz*Math.cos(angle)<.3*d) continue;
      best=officer; reach=d;
    }
    return best;
  }

  strike(x, z, angle, power = 1, y=this.sim.player.y, low=false, target, clip='hitChest') {
    let officer=target===undefined ? this.meleeTarget(x,z,angle,y)
      : (this.officers.includes(target) || this.fieldOfficers.includes(target)) && !(target.health<=0) ? target : null;
    if (officer && (!low || officer.reaction?.fall)) {
      if(this.fieldOfficers.includes(officer))officer=this._respondFromPost(officer);
      officer.health -= 40 * power;
      const fall=officer.health<=0 || power>1;
      const heading=Math.atan2(officer.x-x,officer.z-z);
      const reaction=receiveImpulse(officer,Math.sin(heading)*3.4*power,Math.cos(heading)*3.4*power,
        {fall,rest:officer.health<=0 ? Infinity : .35,clip,lift:fall ? .5 : 0});
      if (target && !reaction.fall) reaction.time=reaction.poseLead=.045;
      if (officer.health <= 0) this._down(officer, 'Officer down. Every unit is coming.', 1);
      else this.offence('hitOfficer', { x: officer.x, z: officer.z, message: 'You hit a police officer.' });
      return true;
    }
    return false;
  }

  hitByShot(officer, zone = 'torso') {
    if(this.fieldOfficers.includes(officer))officer=this._respondFromPost(officer);
    // Where it lands matters: the head ends it, a leg costs least.
    officer.health -= zone === 'head' ? 200 : zone === 'legs' ? 35 : 60;
    if (officer.health <= 0) this._down(officer, 'Officer down. Every unit is coming.', 1);
    else this.offence('hitOfficer', { x: officer.x, y: officer.y, z: officer.z, message: 'You shot a police officer.' });
  }

  _helicopter(dt) {
    const sim = this.sim, player = sim.player, chase = this.state === 'chase';
    let helicopter = this.helicopter;
    const needed = this.state !== 'clear' && this.stars >= HELICOPTER.stars;
    if (!helicopter) {
      if (this.localResponse) return;
      if (!needed) return;
      const bearing = this._random() * TAU, x = player.x + Math.sin(bearing) * 380, z = player.z + Math.cos(bearing) * 380;
      helicopter = this.helicopter = { unit:'aviation', x, z, y: (player.y || 0) + HELICOPTER.height + 20, angle: bearing + Math.PI, vx: 0, vz: 0, light: { x, z }, orbit: bearing, sees: false, leaving: false };
      this.sim._say('A police helicopter is on its way.', 5);
    }
    helicopter.leaving = !needed;
    let tx, tz;
    if (helicopter.leaving) {
      const away = distance(helicopter, player) || 1;
      if (away > 460) { this.helicopter = null; return; }
      tx = helicopter.x + (helicopter.x - player.x) / away * 100; tz = helicopter.z + (helicopter.z - player.z) / away * 100;
    } else if (chase || !this.lastKnown) {
      // Round and round above the player.
      helicopter.orbit += dt * 0.3;
      tx = player.x + Math.sin(helicopter.orbit) * 22; tz = player.z + Math.cos(helicopter.orbit) * 22;
    } else {
      // A widening circle about where the player was last seen.
      helicopter.orbit += dt * 0.35;
      const reach = Math.min(110, 20 + this.searchTime * 2.5);
      tx = this.lastKnown.x + Math.sin(helicopter.orbit) * reach; tz = this.lastKnown.z + Math.cos(helicopter.orbit) * reach;
    }
    const dx = tx - helicopter.x, dz = tz - helicopter.z, gap = Math.hypot(dx, dz) || 1, pace = Math.min(HELICOPTER.speed, gap * 1.2), blend = 1 - Math.exp(-1.4 * dt);
    helicopter.vx += (dx / gap * pace - helicopter.vx) * blend;
    helicopter.vz += (dz / gap * pace - helicopter.vz) * blend;
    helicopter.x += helicopter.vx * dt; helicopter.z += helicopter.vz * dt;
    helicopter.y += ((Number.isFinite(player.y) ? player.y : 0) + HELICOPTER.height - helicopter.y) * (1 - Math.exp(-dt));
    if (Math.hypot(helicopter.vx, helicopter.vz) > 2) helicopter.angle += turnDelta(helicopter.angle, Math.atan2(helicopter.vx, helicopter.vz)) * (1 - Math.exp(-3 * dt));
    // The searchlight is on the player while they are seen, and sweeps ahead of the helicopter while they are not.
    const aim = chase && helicopter.sees ? player : { x: helicopter.x + helicopter.vx * 0.8, z: helicopter.z + helicopter.vz * 0.8 }, ease = 1 - Math.exp(-4 * dt);
    helicopter.light.x += (aim.x - helicopter.light.x) * ease;
    helicopter.light.z += (aim.z - helicopter.light.z) * ease;
  }

  /** Held still with an officer at arm's length, or boxed in by a patrol car, is an arrest. */
  _arrests(dt) {
    const sim = this.sim, player = sim.player, driving = player.mode === 'drive', speed = this._playerSpeed();
    const view = this._activeRoom();
    let rate = 0;
    if(this.state==='chase'){
      for (const officer of this.officers) {
        const away = distance(officer, player);
        if (!officer.sees || officer.reaction || Math.abs(officer.y-player.y)>2) continue;
        if (!this._canReachSuspect(officer,view)) continue;
        if (driving ? away < 3.8 && speed < 1.5 : away < 2.4 && speed < 3.2) rate = 1;
      }
      if (!sim.room && !rate && speed < 1.2) for (const car of sim.cars) if (car.type === 'police' && car._sees && distance(car, player) < 8) rate = 0.45;
    }
    this.arrest = rate ? this.arrest + dt * rate / BUST : Math.max(0, this.arrest - dt);
    if (this.arrest < 1) return;
    const stars = this.stars;
    sim.end('busted', stars > 2 ? 'They got you.' : 'You are under arrest.',
      loss => sim.recoverAt('courthouse', 'Busted. ' + loss));
  }

  _standDown() {
    this.state = 'clear';
    this.lastKnown = null;
    this.evade = 0; this.searchTime = 0; this.chaseTime = 0; this.fleeTime = 0; this.arrest = 0; this.searchRoom = null;
    this.killed = 0; this.fallen = 0; this.known = null;
    this.warningHeat = 0; this.warningUntil = 0;
    this.localResponse = false;
    this.localResponders = null;
    this._seen = false;
    for (const car of this.sim.cars) if (car.type === 'police') {
      car._sees = false; car._goal = null;
      if (!car.controlled) car.siren = false;
    }
    for (const officer of this.officers) { officer.sees = false; officer.aiming = false; }
    if (this.helicopter) this.helicopter.sees = false;
  }

  /** Nobody is wanted: officers walk back to their cars, the helicopter leaves, the extra cars go home. */
  _offDuty(dt) {
    const sim = this.sim;
    if (this.officers.length) this._officers(dt);
    if (this.helicopter) this._helicopter(dt);
    if (sim.elapsed < this._dispatchAt) return;
    this._dispatchAt = sim.elapsed + 1;
    for (let i = sim.cars.length - 1; i >= 0; i--) {
      const car = sim.cars[i];
      if (car.type !== 'police' || !car._dispatched || car._crewOut) continue;
      // Sent for the chase and no longer needed: gone once it is where nobody will see it go.
      if (distance(car, sim.player) >= sim._joinDistance(car)) sim.cars.splice(i, 1);
    }
  }
}
