import { resetVehicleDynamics } from './vehicle-dynamics.js';

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
const UNITS = [0, 2, 3, 4, 6, 8], MAX_PATROLS = 14, MAX_OFFICERS = 10;
// Seconds out of sight before the police give up, by stars.
export const evadeTime = stars => 18 + 8 * stars;
// How far a unit sees in a chase and in a search, how near it notices
// whatever its heading, and the half-angle of what it watches while searching.
export const SIGHT = { chase: 90, search: 62, close: 14, cone: 55 * Math.PI / 180 };
const CONE_COS = Math.cos(SIGHT.cone);
// A patrol car leaves the street and drives straight at the player inside this.
const INTERCEPT = 55, CAR_RADIUS = 0.92;
// Officers run a little slower than the player can.
const OFFICER = { radius: 0.4, run: 7.2, search: 3, health: 100, range: 45, hold: 12 };
export const HELICOPTER = { stars: 3, height: 62, speed: 34, chaseSight: 75, beam: 32 };
// Seconds held before the cuffs go on.
const BUST = 2;
export const OFFICER_LOOK = { top: 0x1b2a4a, bottom: 0x141b2c, skin: 0xb98563, hair: 0x14110f, kit: 4, height: 1.8 };

export class Police {
  constructor(sim) {
    this.sim = sim;
    this._rng = 0x9e3779b9;
    this._serial = 0;
    this.shotsFired = 0;
    this.clear();
  }

  /** Everything forgotten at once: the player was arrested, put in hospital, or has travelled. */
  clear() {
    this.state = 'clear';
    this.lastKnown = null;
    this.evade = 0; this.evadeTotal = 0;
    this.searchTime = 0; this.chaseTime = 0;
    this.officers = []; this.shots = [];
    this.helicopter = null;
    this.arrest = 0; this.cornered = false;
    this._seen = false; this._unseen = 0; this._lookAt = 0; this._dispatchAt = 0; this._stoppedFor = 0; this._saidAt = -Infinity;
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

  /** A crime has been called in: the police know where the player is right now. */
  report() {
    const player = this.sim.player;
    this.lastKnown = { x: player.x, z: player.z };
    if (this.state === 'clear') { this.state = 'search'; this.searchTime = 0; this._unseen = 0; }
    this.evadeTotal = this.evade = evadeTime(this.stars);
  }

  _playerSpeed() {
    const player = this.sim.player;
    return player.mode === 'drive' ? Math.hypot(player.velocityX || 0, player.velocityZ || 0) : Math.abs(player.speed || 0);
  }

  update(dt) {
    const sim = this.sim, player = sim.player;
    while (this.shots.length && sim.elapsed - this.shots[0].at > 0.3) this.shots.shift();
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
      this.state = 'chase'; this._unseen = 0; this.searchTime = 0; this.cornered = false;
      this.lastKnown = { x: player.x, z: player.z };
      this.chaseTime += dt;
      // Running from an arrest makes it worse, up to a point.
      if (sim.heat < 3 && speed > 3) sim.heat = Math.min(3, sim.heat + dt / 45);
      this.evadeTotal = this.evade = evadeTime(this.stars);
    } else {
      this._unseen += dt;
      if (this.state === 'chase' && this._unseen > 2) {
        this.state = 'search'; this.searchTime = 0;
        // Seen going in through a door, the player is not hidden: the police know which door.
        this.cornered = Boolean(sim.room);
        this._say(this.cornered ? 'They saw you go in. They are coming.' : 'Out of sight. Stay hidden until they give up.', 5);
      }
      if (this.state === 'search') {
        this.searchTime += dt;
        if (this.cornered && !sim.room) this.cornered = false;
        if (!this.cornered) this.evade -= dt;
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
    this._officers(dt);
    this._helicopter(dt);
    this._arrests(dt);
  }

  /** Can anyone see the player? Sets `_sees` on each car, `sees` on each officer and the helicopter. */
  _look() {
    const sim = this.sim, player = sim.player, hidden = Boolean(sim.room), chase = this.state === 'chase';
    const range = chase ? SIGHT.chase : SIGHT.search;
    const sees = unit => {
      if (hidden) return false;
      const dx = player.x - unit.x, dz = player.z - unit.z, d = Math.hypot(dx, dz);
      if (d > range) return false;
      if (Number.isFinite(unit.y) && Number.isFinite(player.y) && Math.abs(unit.y - player.y) > 12) return false;
      // Searching, a unit sees what is in front of it; in a chase it is looking for the player.
      if (!chase && d > SIGHT.close && dx * Math.sin(unit.angle) + dz * Math.cos(unit.angle) < CONE_COS * d) return false;
      return sim._hasSight(unit, player);
    };
    let seen = false;
    for (const car of sim.cars) {
      if (car.type !== 'police') continue;
      car._sees = !car._crewOut && !car._abandoned && sees(car);
      if (car._sees) seen = true;
    }
    for (const officer of this.officers) { officer.sees = sees(officer); if (officer.sees) seen = true; }
    const helicopter = this.helicopter;
    if (helicopter) { helicopter.sees = !hidden && !helicopter.leaving && this._fromAbove(helicopter); if (helicopter.sees) seen = true; }
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
    if (!edges.length) return;
    let answering = 0, patrols = 0, stray = null;
    for (const car of sim.cars) {
      if (car.type !== 'police') continue;
      patrols++;
      if (car._abandoned || (car.parked && !car._crewOut)) continue;
      const away = distance(car, player);
      if (away < 480) answering++;
      else if (!car._crewOut && !stray) stray = car;
    }
    if (stray && sim._joinTraffic(stray)) { stray._direct = false; stray._routeAt = 0; answering++; }
    if (answering < UNITS[this.stars] && patrols < MAX_PATROLS) {
      const car = sim._makeCar(`police-r${++this._serial}`, 'police', { x: player.x + 1e6, z: player.z }, 0, edges[0]);
      car._dispatched = true;
      if (sim._joinTraffic(car)) sim.cars.push(car);
    }
  }

  /** A patrol's speed with its siren on. */
  cruise() { return this.state === 'chase' ? 15 + this.stars * 2.4 : 10; }
  /** Whether patrol cars drive into the player's car rather than follow it. */
  get rams() { return this.state === 'chase' && this.stars >= 2 && this.sim.player.mode === 'drive' && this._stoppedFor < 1; }

  /** Where a patrol is heading: the player in a chase, somewhere in the search area otherwise. */
  _goal(car) {
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
    if (car._crewOut) { car.speed = 0; car.siren = sim.heat > 0; return true; }
    if (this.state === 'clear') {
      if (car._direct) this._rebind(car);
      return false;
    }
    const player = sim.player, away = distance(car, player), afoot = player.mode !== 'drive';
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
    const next = sim._resolvePosition(car.x + sin * car.speed * dt, car.z + cos * car.speed * dt, CAR_RADIUS, car.angle, car);
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

  /** Two officers out of a stopped patrol car. */
  _dismount(car) {
    const sim = this.sim;
    if (this.officers.length + 2 > MAX_OFFICERS) return false;
    car._crewOut = true; car.speed = 0;
    resetVehicleDynamics(car);
    for (const side of [-1, 1]) {
      const at = sim._resolvePosition(car.x - Math.cos(car.angle) * side * 1.7, car.z + Math.sin(car.angle) * side * 1.7, OFFICER.radius);
      this.officers.push({ id: `officer-${++this._serial}`, carId: car.id, x: at.x, z: at.z, y: sim.groundHeight(at.x, at.z), angle: car.angle, speed: 0,
        health: OFFICER.health, phase: this._random() * 6, stride: 0, fire: 0.7 + this._random(), sees: false, aiming: false, returning: false, goal: null, side: side, dodge: 0 });
    }
    return true;
  }

  _board(officer, car) {
    this.officers.splice(this.officers.indexOf(officer), 1);
    if (!car || this.officers.some(other => other.carId === car.id)) return;
    car._crewOut = false;
    this._rebind(car);
  }

  _officers(dt) {
    const sim = this.sim, player = sim.player, stars = this.stars, chase = this.state === 'chase', clear = this.state === 'clear';
    const driving = player.mode === 'drive', speed = this._playerSpeed();
    for (const officer of [...this.officers]) {
      const car = sim.cars.find(other => other.id === officer.carId) || null, away = distance(officer, player);
      // Left behind with no car to go back to.
      if (away > 150 || (clear && !car)) { this._board(officer, car); continue; }
      if (clear || (driving && speed > 6 && away > 28) || (!chase && this.searchTime > 10 && away > 50)) officer.returning = Boolean(car);
      else if (chase && away < 60 && (!driving || speed < 2)) officer.returning = false;
      // Guns are out at two stars for anyone who runs or drives off, and at three for anyone at all.
      const shooting = chase && !officer.returning && (stars >= 3 || (stars === 2 && (driving || speed > 5.2)));
      let target, pace = OFFICER.run, hold = 1.3;
      officer.aiming = false;
      if (officer.returning) { target = car; hold = 2.6; }
      else if (chase) {
        target = player;
        if (shooting && officer.sees) { hold = OFFICER.hold; officer.aiming = true; }
        else if (driving) hold = 2.6;
      } else if (this.cornered || this.searchTime < 3) { target = this.lastKnown; hold = 1.5; }
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
      if (officer.returning && gap < 2.8) { this._board(officer, car); continue; }
      let heading = Math.atan2(dx, dz);
      const wanted = clamp((gap - hold) * 3, 0, pace);
      if (officer.dodge > 0) { officer.dodge -= dt; heading += officer.side * 1.25; }
      const before = { x: officer.x, z: officer.z };
      if (wanted > 0.05) {
        let next = sim._resolvePosition(officer.x + Math.sin(heading) * wanted * dt, officer.z + Math.cos(heading) * wanted * dt, OFFICER.radius, null, null, true);
        const bump = sim._nearCar(next.x, next.z, OFFICER.radius, null, officer.y);
        if (bump) next = sim._resolvePosition(next.x + bump.nx * (bump.depth + 0.001), next.z + bump.nz * (bump.depth + 0.001), OFFICER.radius, null, null, true);
        officer.x = next.x; officer.z = next.z;
      }
      const moved = distance(before, officer);
      // Walked into something: go round it, the other way from last time.
      if (wanted > 0.5 && moved < wanted * dt * 0.35 && !(officer.dodge > 0)) { officer.side = -officer.side; officer.dodge = 0.9; }
      // Hit by the player's car.
      if (driving && speed > 4) {
        const struck = sim._nearCar(officer.x, officer.z, OFFICER.radius + 0.15, null, officer.y);
        if (struck?.car.controlled) { this._down(officer, 'You ran down an officer.', 1.5); continue; }
      }
      officer.speed = moved / dt;
      officer.phase += moved * 3.3;
      officer.stride = Math.min(1, officer.speed / 1.2);
      if (moved > 0) officer.y = sim.groundHeight(officer.x, officer.z);
      const facing = officer.aiming || moved < 1e-4 ? Math.atan2(player.x - officer.x, player.z - officer.z) : heading;
      officer.angle += turnDelta(officer.angle, facing) * (1 - Math.exp(-12 * dt));
      if (shooting && officer.sees && away < OFFICER.range) {
        officer.fire -= dt;
        if (officer.fire <= 0) {
          officer.fire = (1.5 - stars * 0.2) * (0.75 + this._random() * 0.5);
          this._shoot(officer, away, driving, speed);
        }
      }
    }
  }

  _shoot(officer, away, driving, speed) {
    const sim = this.sim, player = sim.player, stars = this.stars;
    // Harder to hit far off, on the move, or from the run.
    let chance = clamp(0.62 - away * 0.011, 0.12, 0.6);
    chance *= driving ? clamp(1 - speed / 30, 0.3, 0.8) : speed > 5 ? 0.6 : 1;
    if (officer.speed > 1) chance *= 0.6;
    const hit = this._random() < chance, spread = hit ? 0 : 0.6 + this._random() * 1.2, side = this._random() < 0.5 ? -1 : 1;
    const ax = (player.z - officer.z) / (away || 1), az = -(player.x - officer.x) / (away || 1);
    this.shots.push({ at: sim.elapsed, hit,
      x: officer.x + Math.sin(officer.angle) * 0.5, y: (officer.y || 0) + 1.42, z: officer.z + Math.cos(officer.angle) * 0.5,
      tx: player.x + ax * spread * side, ty: (player.y || 0) + (driving ? 0.9 : 1.1), tz: player.z + az * spread * side });
    this.shotsFired++;
    if (hit) sim.hurt(driving ? 3 + stars : 5 + stars * 1.5, 'police');
  }

  _down(officer, message, heat) {
    const car = this.sim.cars.find(other => other.id === officer.carId) || null;
    this.officers.splice(this.officers.indexOf(officer), 1);
    if (car) {
      car._lost = (car._lost || 0) + 1;
      // A car with nobody left to drive it stays where it stopped.
      if (!this.officers.some(other => other.carId === car.id)) {
        if (car._lost >= 2) { car._abandoned = true; car._crewOut = false; car.parked = true; car.siren = false; car._edge = null; }
        else { car._crewOut = false; this._rebind(car); }
      }
    }
    this.sim.crime(heat, message);
  }

  /** The player's punch, thrown from (x, z) along `angle`. True if it landed on an officer. */
  strike(x, z, angle) {
    for (const officer of this.officers) {
      const dx = officer.x - x, dz = officer.z - z, d = Math.hypot(dx, dz);
      if (d > 2 || dx * Math.sin(angle) + dz * Math.cos(angle) < 0.3 * d) continue;
      officer.health -= 40;
      if (officer.health <= 0) this._down(officer, 'Officer down. Every unit is coming.', 1);
      else this.sim.crime(0.5, 'You hit a police officer.');
      return true;
    }
    return false;
  }

  _helicopter(dt) {
    const sim = this.sim, player = sim.player, chase = this.state === 'chase';
    let helicopter = this.helicopter;
    const needed = this.state !== 'clear' && this.stars >= HELICOPTER.stars;
    if (!helicopter) {
      if (!needed) return;
      const bearing = this._random() * TAU, x = player.x + Math.sin(bearing) * 380, z = player.z + Math.cos(bearing) * 380;
      helicopter = this.helicopter = { x, z, y: (player.y || 0) + HELICOPTER.height + 20, angle: bearing + Math.PI, vx: 0, vz: 0, light: { x, z }, orbit: bearing, sees: false, leaving: false };
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
    let rate = 0;
    if (sim.room) {
      if (this.cornered) for (const officer of this.officers) if (distance(officer, this.lastKnown) < 3.5) rate = 0.5;
    } else {
      for (const officer of this.officers) {
        const away = distance(officer, player);
        if (driving ? away < 3.8 && speed < 1.5 : away < 2.4 && speed < 3.2) rate = 1;
      }
      if (!rate && speed < 1.2) for (const car of sim.cars) if (car.type === 'police' && car._sees && distance(car, player) < 8) rate = 0.45;
    }
    this.arrest = rate ? this.arrest + dt * rate / BUST : Math.max(0, this.arrest - dt);
    if (this.arrest < 1) return;
    const fine = Math.min(sim.cash, 80 * this.stars);
    sim.cash -= fine;
    sim.reset();
    sim._say(`Busted. Fine: $${fine}. Your cab is waiting at the start.`, 7);
  }

  _standDown() {
    this.state = 'clear';
    this.lastKnown = null;
    this.evade = 0; this.searchTime = 0; this.chaseTime = 0; this.arrest = 0; this.cornered = false;
    this._seen = false;
    for (const car of this.sim.cars) if (car.type === 'police') { car._sees = false; car._goal = null; }
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
