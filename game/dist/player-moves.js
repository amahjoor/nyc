import { doorPanel } from './vehicle-damage.js';
// What the player can do on foot besides walk, run, jump and punch: kick, get
// over a car, climb onto something, and the few seconds it takes to open a
// car door, break a window or haul the driver out. Each is a move that owns
// the player until it is done; the simulation steps it, and the animator
// (body-motion.js) shows the movement of the same name for the same time.

/** How long each move takes, in seconds: the same as the movement drawn for it. */
export const MOVE = { kick: .72, vault: .8, climb: 1.3, door: .5, carjack: 1.15, breakIn: 1.25 };
const RADIUS = .38;
// A car as something to stand on: how far its body reaches from its middle, and how high it stands:
// the roof over the cabin, and the bonnet and the boot at the ends. Tall ones are by the shape of body.
const CAR = { along: 1.95, across: .88, cabin: 1.02, roof: 1.42, deck: .92 };
const TALL = { suv: { roof: 1.72, deck: 1.08 }, minivan: { roof: 1.74, deck: 1.05 }, pickup: { roof: 1.76, deck: 1.1 }, van: { roof: 2.1, deck: 1.2, cabin: 1.5 } };
const bodyOf = car => TALL[car.type === 'taxi' || car.type === 'police' ? 'sedan' : car.shape || car.type] || CAR;
/** Whether a car is too tall to swing the legs over: it is climbed, however fast it is come at. */
export const tooTallToVault = car => bodyOf(car).roof > 1.6;
/** The pistol: rounds in it, seconds between shots, seconds to change the magazine, and how far a shot carries. */
export const GUN = { rounds: 12, gap: .3, reload: 1.7, range: 70 };

/** How high a car stands under a point over it (the roof amidships, the bonnet and the boot at the ends), or null beside it. */
export function carTop(car, x, z, margin = 0) {
  const dx = x - car.x, dz = z - car.z, sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  const along = dx * sin + dz * cos, across = dx * cos - dz * sin;
  if (Math.abs(along) > CAR.along + margin || Math.abs(across) > CAR.across + margin) return null;
  const body = bodyOf(car);
  return (car.y || 0) + (Math.abs(along) < (body.cabin || CAR.cabin) ? body.roof : body.deck);
}

/** The car under somebody's feet at this height, and how high it stands there: { car, top } or null. */
export function carUnder(sim, x, z, y) {
  let best = null;
  for (const car of sim.cars) {
    if (Math.abs(car.x - x) > 4 || Math.abs(car.z - z) > 4) continue;
    const top = carTop(car, x, z, .12);
    if (top !== null && y > top - .75 && y < top + 3 && (!best || top > best.top)) best = { car, top };
  }
  return best;
}

/** Take the pistol out, or put it away. */
export function toggleGun(sim) {
  const player = sim.player;
  if (player.mode !== 'walk' || sim.seat || sim.ending || player.move) return false;
  player.armed = !player.armed;
  if (player.armed) {
    player.rounds ??= GUN.rounds;
    if (player.rounds===0) reloadGun(sim);
  } else player.reloading=0;
  player.guard = 0;
  return true;
}

export function reloadGun(sim) {
  const p=sim.player;
  if (!p.armed || p.mode!=='walk' || sim.seat || sim.ending || p.move || p.reloading>0 || !(p.rounds<GUN.rounds)) return false;
  p.reloading=GUN.reload;
  return true;
}

/** Pull the trigger. Returns whether a shot went off; whoever asked works out what it hit, from the 'shot' event. */
export function fireGun(sim) {
  const player = sim.player;
  if (!player.armed || player.mode !== 'walk' || sim.seat || player.move || (player.fireWait || 0) > 0 || (player.reloading || 0) > 0) return false;
  if (player.rounds===0) { reloadGun(sim); return false; }
  player.rounds = (player.rounds ?? GUN.rounds) - 1;
  player.fireWait = GUN.gap; player.firedAt = sim.elapsed;
  if (player.rounds <= 0) player.reloading = GUN.reload;
  (sim.moveEvents || (sim.moveEvents = [])).push({ kind: 'shot', x: player.x, y: (Number.isFinite(player.y) ? player.y : 0) + 1.4, z: player.z, angle: player.angle });
  return true;
}

/** A kick. Returns whether it comes out; whoever asked resolves who it lands on, about a third of the way through. */
export function startKick(sim) {
  const player = sim.player;
  if (player.mode !== 'walk' || sim.room || sim.seat || player.move || player.grounded === false || (player.swing || 0) > .08) return false;
  player.move = { kind: 'kick', t: 0, T: MOVE.kick };
  player.guard = 4;
  return true;
}

/**
 * Space, pressed facing something: a car is vaulted, and a ledge up to a little
 * over head height is climbed. Returns whether a move began (if not, it is a jump).
 */
export function tryVault(sim) {
  const player = sim.player;
  if (player.mode !== 'walk' || sim.room || player.move || player.grounded === false) return false;
  const dx = Math.sin(player.angle), dz = Math.cos(player.angle), y = Number.isFinite(player.y) ? player.y : 0;
  const car = sim._nearCar(player.x + dx * .85, player.z + dz * .85, RADIUS, null, y);
  // Walked up to, a car is climbed onto; run at, it is gone over, unless it stands too tall for that.
  if (car && (tooTallToVault(car.car) || Math.hypot(player.velocityX || 0, player.velocityZ || 0) < 5.5) && !(y > (car.car.y || 0) + .5)) {
    for (const reach of [1.25, 1.6, .95, 2]) {
      const x = player.x + dx * reach, z = player.z + dz * reach, top = carTop(car.car, x, z, -.1);
      if (top === null) continue;
      player.move = { kind: 'climb', t: 0, T: MOVE.climb, from: { x: player.x, z: player.z, y }, to: { x, z, y: top }, transportId: player.transportId || null };
      player.velocityX = player.velocityZ = 0;
      return true;
    }
  }
  if (car && tooTallToVault(car.car)) return false;
  if (car) {
    // The first clear ground on the far side, if it is near enough to swing the legs over to.
    for (let reach = 1.5; reach <= 4.4; reach += .25) {
      const x = player.x + dx * reach, z = player.z + dz * reach;
      if (sim._nearCar(x, z, RADIUS, null, y) || sim.isBlocked(x, z, RADIUS)) continue;
      player.move = { kind: 'vault', t: 0, T: MOVE.vault, from: { x: player.x, z: player.z }, to: { x, z }, lift: .62 };
      player.velocityX = player.velocityZ = 0;
      return true;
    }
    return false;
  }
  if (!sim._sampleSurface) return false;
  const ax = player.x + dx * .75, az = player.z + dz * .75;
  const top = sim._sampleSurface(ax, az, { referenceHeight: y + 2.5, mode: 'walk', transportId: null }), rise = Number(top?.elevation) - y;
  if (!(rise > .5 && rise < 2.45) || sim.isBlocked(ax, az, RADIUS, { baseHeight: y + rise })) return false;
  player.move = { kind: 'climb', t: 0, T: MOVE.climb, from: { x: player.x, z: player.z, y }, to: { x: ax, z: az, y: y + rise }, transportId: top.transportId || null };
  player.velocityX = player.velocityZ = 0;
  return true;
}

/**
 * Getting into a car takes a moment, and how depends on whose it is: a hand to
 * the door of one the player has driven, an elbow through the window of one
 * left locked at the kerb, and for one with somebody at the wheel, the driver
 * hauled out. Returns whether the move began; the car is entered when it ends.
 */
export function beginEntry(sim, car) {
  const player = sim.player;
  if (player.move) return true;
  player.armed = false;
  const driven = car._driven || car.id === sim._lastVehicleId || car.id === 'player-taxi', occupied = !driven && Boolean(car._edge) && !car.parked && !car._kerb && car.type !== 'police';
  // Use the driver’s door to remove an occupant. For an empty car either side works.
  const side = { x: Math.cos(car.angle), z: -Math.sin(car.angle) };
  const forward = { x: Math.sin(car.angle), z: Math.cos(car.angle) };
  const across = (player.x-car.x)*side.x + (player.z-car.z)*side.z;
  const left = !occupied && across < 0 ? -1 : 1;
  const open = ((car.missingDoors | car.brokenGlass) & doorPanel(left)) !== 0;
  const kind = occupied ? 'carjack' : !driven && !open && lockedAt(car) ? 'breakIn' : 'door';
  const door = { x: car.x + side.x * left * 1.45 + Math.sin(car.angle) * .25, z: car.z + side.z * left * 1.45 + Math.cos(car.angle) * .25 };
  const clear = point => {
    const neighbour = sim._nearCar(point.x,point.z,RADIUS*.6,car.id,player.y)?.car;
    return !sim.isBlocked(point.x,point.z,RADIUS) && (!neighbour || neighbour === car);
  };
  if (!clear(door)) { sim._say?.('The door is blocked.'); return false; }
  let approach = null;
  if (occupied && across < -.45) {
    // From the passenger side, walk around the nearest clear end of the car.
    const along = (player.x-car.x)*forward.x + (player.z-car.z)*forward.z;
    const end = (car.identity?.asset?.design?.L || 4.7)/2+.55;
    for (const sign of [Math.sign(along) || 1, -(Math.sign(along) || 1)]) {
      const route = [-1,1].map(s => ({ x: car.x+s*1.48*side.x+sign*end*forward.x,
        z: car.z+s*1.48*side.z+sign*end*forward.z })).concat(door);
      let previous = player;
      if (route.every(next => {
        const steps = Math.ceil(Math.hypot(next.x-previous.x,next.z-previous.z)/.35);
        for (let i=1;i<=steps;i++) if (!clear({ x:previous.x+(next.x-previous.x)*i/steps, z:previous.z+(next.z-previous.z)*i/steps })) return false;
        previous=next; return true;
      })) { approach = route; break; }
    }
    if (!approach) { sim._say?.('Move closer to the driver’s door.'); return false; }
  }
  car.doorSide = left;
  player.move = { kind, t: 0, T: MOVE[kind], car: car.id, from: approach ? door : { x:player.x,z:player.z },
    to:door, face:Math.atan2(car.x-door.x,car.z-door.z), left, approach };
  player.velocityX = player.velocityZ = 0; player.speed = 0;
  if (occupied) { car.parked = true; car._route = []; car.speed = 0; car.velocityX = car.velocityZ = 0; car._jacked = true; }
  return true;
}
/** Whether a car standing at the kerb was left locked: about half are, the same ones each time. */
export function lockedAt(car) {
  let hash = 0; for (const ch of String(car.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 100 < 55;
}

/**
 * Step the move the player is in, if any. Returns the move if it still owns the
 * player this tick. `sim.moveEvents` collects what happened for whoever draws
 * and scores it: { kind: 'kick' | 'glass' | 'thrown' | 'vault' | 'climb', ... }.
 */
export function stepMove(sim, dt) {
  const player = sim.player, move = player.move;
  if (player.guard > 0) player.guard = Math.max(0, player.guard - dt);
  if (player.fireWait > 0) player.fireWait = Math.max(0, player.fireWait - dt);
  if (player.reloading > 0) { player.reloading = Math.max(0, player.reloading - dt); if (!player.reloading) player.rounds = GUN.rounds; }
  if (!move) return null;
  if (player.mode !== 'walk') { player.move = null; return null; }
  if (move.approach?.length) {
    const next = move.approach[0], dx = next.x-player.x, dz = next.z-player.z, distance = Math.hypot(dx,dz);
    player.speed = 3; player.angle = Math.atan2(dx,dz);
    const step = Math.min(1, player.speed*dt/Math.max(distance,.001));
    player.x += dx*step; player.z += dz*step;
    if (step === 1) move.approach.shift();
    return move;
  }
  const before = move.t; move.t += dt;
  const passed = at => before < at && move.t >= at, events = sim.moveEvents || (sim.moveEvents = []);
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  player.speed = 0;
  if (move.kind === 'kick') { if (passed(.27)) events.push({ kind: 'kick', x: player.x, z: player.z, angle: player.angle }); }
  else if (move.kind === 'getOut') {
    const t = smooth(move.t/move.T);
    player.x = move.from.x+(move.to.x-move.from.x)*t;
    player.z = move.from.z+(move.to.z-move.from.z)*t;
  } else if (move.kind === 'vault') {
    const t = smooth(move.t / move.T);
    player.x = move.from.x + (move.to.x - move.from.x) * t; player.z = move.from.z + (move.to.z - move.from.z) * t;
    // Lifted over the car and set down again; the height is the picture's, not the ground's.
    player.lift = Math.sin(Math.min(1, move.t / move.T) * Math.PI) * move.lift;
    if (passed(.01)) events.push({ kind: 'vault' });
  } else if (move.kind === 'climb') {
    const up = smooth((move.t - .22) / .6), over = smooth((move.t - .7) / .45);
    player.y = move.from.y + (move.to.y - move.from.y) * up; player.grounded = true; player.vy = 0;
    player.x = move.from.x + (move.to.x - move.from.x) * over; player.z = move.from.z + (move.to.z - move.from.z) * over;
    if (passed(.01)) events.push({ kind: 'climb' });
  } else {
    // At a car door.
    const t = smooth(move.t / .22);
    player.x = move.from.x + (move.to.x - move.from.x) * t; player.z = move.from.z + (move.to.z - move.from.z) * t;
    let turn = move.face - player.angle; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); player.angle += turn * Math.min(1, dt * 14);
    const car = sim.cars.find(item => item.id === move.car);
    if (!car) { player.move = null; return null; }
    if (car.destroyed || car.burningSince != null) { car._jacked = false; player.move = null; return null; }
    const panel = doorPanel(move.left), start = move.kind === 'breakIn' ? .43 : .1;
    if (!(car.missingDoors & panel)) car.doorOpen = smooth((move.t - start) / .26);
    const seating = smooth((move.t - move.T + .20) / .20);
    player.x += (car.x + .38 * Math.cos(car.angle) - player.x) * seating;
    player.z += (car.z - .38 * Math.sin(car.angle) - player.z) * seating;
    if (move.kind === 'breakIn' && passed(.43)) {
      car.brokenGlass = (car.brokenGlass || 0) | panel;
      car.damage = Math.min(1, (car.damage || 0) + .025);
      events.push({ kind: 'glass', x: move.to.x, z: move.to.z });
    }
    if (move.kind === 'carjack' && passed(.5)) { car.driverEjected = true; events.push({ kind: 'thrown', x: move.to.x - Math.sin(player.angle) * .2, z: move.to.z - Math.cos(player.angle) * .2, heading: player.angle + Math.PI * .6, car }); }
  }
  if (move.t < move.T) return move;
  player.move = null; player.lift = 0;
  if (move.kind === 'climb') { player.y = move.to.y; player.x = move.to.x; player.z = move.to.z; player.transportId = move.transportId; }
  if (move.kind === 'door' || move.kind === 'breakIn' || move.kind === 'carjack') {
    const car = sim.cars.find(item => item.id === move.car);
    if (car) {
      car.doorHold = .5; car._jacked = false; sim._entering = car;
      try {
        if (sim.interact()) { car._driven = true; events.push({ kind: 'entered', how: move.kind, car }); }
      } finally { sim._entering = null; }
    }
  }
  return null;
}
