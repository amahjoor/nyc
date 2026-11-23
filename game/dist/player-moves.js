import { meleeMoves, nextStrike } from './melee-moves.js';
import { importedSupport,exteriorSupport } from './vehicle-assets.js';
import { vehicleTop } from './vehicle-generator.js';
import { GRAVITY } from './character-physics.js';
import { doorPanel, vehiclePaneBroken } from './vehicle-damage.js';
// What the player can do on foot besides walk, run, jump and punch: kick, get
// over a car, climb onto something, and the few seconds it takes to open a
// car door, break a window or haul the driver out. Each is a move that owns
// the player until it is done; the simulation steps it, and the animator
// (body-motion.js) shows the movement of the same name for the same time.

/** How long each move takes, in seconds: the same as the movement drawn for it. */
export const MOVE = { kick: .72, vault: .8, climb: 1.3, door: .5, carjack: 1.15, breakIn: 1.25 };
const RADIUS = .38;
const drawnShells=new WeakMap();
export function setCarShell(car,shell){
  if(shell)drawnShells.set(car,shell);else drawnShells.delete(car);
}
// A car as something to stand on: how far its body reaches from its middle, and how high it stands:
// the roof over the cabin, and the bonnet and the boot at the ends. Tall ones are by the shape of body.
const CAR = { along: 1.95, across: .88, cabin: 1.02, roof: 1.42, deck: .92 };
const TALL = { suv: { roof: 1.72, deck: 1.08 }, minivan: { roof: 1.74, deck: 1.05 }, pickup: { roof: 1.76, deck: 1.1 }, van: { roof: 2.1, deck: 1.2, cabin: 1.5 } };
const bodyOf = car => TALL[car.type === 'taxi' || car.type === 'police' ? 'sedan' : car.shape || car.type] || CAR;
/** Whether a car is too tall to swing the legs over: it is climbed, however fast it is come at. */
export const tooTallToVault = car => (car.identity?.asset?.design?.H ?? importedSupport(car.identity?.asset)?.height ?? bodyOf(car).roof)>1.6;
/** The pistol: rounds in it, seconds between shots, seconds to change the magazine, and how far a shot carries. */
export const GUN = { rounds: 12, gap: .3, reload: 1.7, range: 70 };

/** How high a car stands under a point over it (the roof amidships, the bonnet and the boot at the ends), or null beside it. */
export function carTop(car, x, z, margin = 0) {
  const dx = x - car.x, dz = z - car.z, sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  const along = dx * sin + dz * cos, across = dx * cos - dz * sin;
  const design=car.identity?.asset?.design;
  const ground=(car.y||0)+across*Math.tan(car.roll||0)-along*Math.tan(car.pitch||0);
  const shell=exteriorSupport(drawnShells.get(car)) || (!design && importedSupport(car.identity?.asset));
  if(design || shell){
    const top=shell ? shell.top(across,along,margin) : vehicleTop(design,along,across,margin);
    return top===null ? null : ground+top+.025;
  }
  if (Math.abs(along) > CAR.along + margin || Math.abs(across) > CAR.across + margin) return null;
  const body = bodyOf(car);
  const cabin = body.cabin || CAR.cabin;
  if (along <= -cabin) return ground + body.deck;
  // Before a model is available, connect the hood and roof with a sloping windshield.
  const rise = Math.max(0, Math.min(1, (cabin + .4 - along) / .4));
  return ground + body.deck + rise * (body.roof - body.deck);
}

/** The car under somebody's feet at this height, and how high it stands there: { car, top } or null. */
export function carUnder(sim, x, z, y) {
  let best = null;
  for (const car of sim.cars) {
    if (Math.abs(car.x - x) > 4 || Math.abs(car.z - z) > 4) continue;
    let top = carTop(car, x, z, .12);
    if (sim.player?.standing?.id === car.id && sim.player.grounded && (top === null || top < y - .25)) {
      // A ray can pass through the seam between two panels and hit the floorpan.
      // Bridge only a shoe-sized gap with bodywork supporting both ends.
      const dx = .13*Math.sin(car.angle), dz = .13*Math.cos(car.angle);
      for (const [sx,sz] of [[dx,dz],[dz,-dx]]) {
        const a = carTop(car,x+sx,z+sz), b = carTop(car,x-sx,z-sz);
        if (a !== null && b !== null && Math.abs(a-b)<.2 && Math.abs((a+b)/2-y)<.25) {
          top = (a+b)/2;
          break;
        }
      }
    }
    if (top !== null && y > top - .75 && y < top + 3 && (!best || top > best.top)) best = { car, top };
  }
  return best;
}

/** Take the pistol out, or put it away. */
export function toggleGun(sim) {
  const player = sim.player;
  if (player.mode !== 'walk' || player.reaction || sim.seat || sim.ending || player.move) return false;
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
  if (!p.armed || p.mode!=='walk' || p.reaction || sim.seat || sim.ending || p.move || p.reloading>0 || !(p.rounds<GUN.rounds)) return false;
  p.reloading=GUN.reload;
  return true;
}

/** Pull the trigger. Returns whether a shot went off; whoever asked works out what it hit, from the 'shot' event. */
export function fireGun(sim, sight) {
  const player = sim.player;
  if (!player.armed || player.mode !== 'walk' || player.reaction || sim.seat || player.move || (player.fireWait || 0) > 0 || (player.reloading || 0) > 0) return false;
  if (player.rounds===0) { reloadGun(sim); return false; }
  player.rounds = (player.rounds ?? GUN.rounds) - 1;
  player.fireWait = GUN.gap; player.firedAt = sim.elapsed;
  if (player.rounds <= 0) player.reloading = GUN.reload;
  (sim.moveEvents || (sim.moveEvents = [])).push({ kind: 'shot', x: player.x, y: (Number.isFinite(player.y) ? player.y : 0) + 1.4, z: player.z, angle: player.angle, sight });
  return true;
}

/** A kick. Returns whether it comes out; whoever asked resolves who it lands on, about a third of the way through. */
export function startKick(sim, low = false) {
  const player = sim.player;
  if (player.mode !== 'walk' || player.reaction || sim.room || sim.seat || player.move || player.grounded === false || (player.swing || 0) > .08) return false;
  const under=player.standing && carUnder(sim,player.x,player.z,player.y);
  const roof=under && under.car.id===player.standing.id && Math.abs(player.y-under.top)<.3;
  const clip=nextStrike(player,roof?'roof':low?'low':'kick');
  player.move = { kind: roof?'stomp':low?'lowKick':'kick', clip, t:0, T:meleeMoves[clip].seconds };
  if (roof) player.move.vehicleId=under.car.id;
  player.guard = 4;
  return true;
}

/**
 * Space, pressed facing something: a car is vaulted, and a ledge up to a little
 * over head height is climbed. Returns whether a move began (if not, it is a jump).
 */
export function tryVault(sim) {
  const player = sim.player;
  if (player.mode !== 'walk' || player.reaction || sim.room || player.move || player.grounded === false) return false;
  const dx = Math.sin(player.angle), dz = Math.cos(player.angle), y = Number.isFinite(player.y) ? player.y : 0;
  const car = sim._nearCar(player.x + dx * .85, player.z + dz * .85, RADIUS, null, y);
  const vehicle=car?.car || sim.cars.find(other=>Math.hypot(other.x-player.x,other.z-player.z)<5 &&
    Math.abs((other.y||0)-y)<1 && carTop(other,player.x+dx,player.z+dz,.15)!==null);
  if (vehicle && (Math.abs(vehicle.speed||0)>2.5 || y>(vehicle.y||0)+.5)) return false;
  const from={x:player.x,y,z:player.z};
  const point=d=>({x:from.x+dx*d,z:from.z+dz*d});
  const surface=(at,reference)=>sim._sampleSurface?.(at.x,at.z,{referenceHeight:reference,mode:'walk',transportId:player.transportId});
  const top=at=>vehicle ? carTop(vehicle,at.x,at.z) : surface(at,y+2.5)?.elevation;
  const reachHeight=y+Math.min(2.45,(player.height??1.78)*1.29);
  // Find the first elevated surface in reach. Keep its actual edge as the handhold.
  let grip;
  for(let d=.08;d<=1.3;d+=.08){
    const at=point(d), height=top(at);
    if(height!=null && height>y+.5 && height<reachHeight){grip={...at,y:height};break;}
  }
  if(!grip) return false;
  const speed=Math.hypot(player.velocityX||0,player.velocityZ||0);
  const support=vehicle ? {id:vehicle.id,x:vehicle.x,z:vehicle.z,angle:vehicle.angle,y:vehicle.y||0} : null;
  if(vehicle && !tooTallToVault(vehicle) && speed>=5.5){
    for(let reach=1.5;reach<=4.4;reach+=.2){
      const to=point(reach);
      if(top(to)!=null || sim._nearCar(to.x,to.z,RADIUS,null,y) || sim.isBlocked(to.x,to.z,RADIUS)) continue;
      to.y=surface(to,y)?.elevation ?? y;
      let highest=grip.y, exit=0;
      for(let d=0;d<=reach;d+=.06){
        const roof=top(point(d));
        if(roof!==null){highest=Math.max(highest,roof);exit=d;}
      }
      const apex=Math.max(to.y+.2,highest+.28);
      const launch=Math.sqrt(2*GRAVITY*(apex-y));
      const T=(launch+Math.sqrt(2*GRAVITY*(apex-to.y)))/GRAVITY;
      // Cross the bodywork during the part of the arc above its highest surface.
      const span=Math.sqrt(2*(apex-highest)/GRAVITY);
      player.move={kind:'vault',t:0,T,from,to,grip,launch,support,
        rise:launch/GRAVITY-span,descent:launch/GRAVITY+span,
        enter:Math.max(0,(Math.hypot(grip.x-from.x,grip.z-from.z)-.24)/reach),
        exit:Math.min(1,(exit+.22)/reach)};
      player.grounded=false; player.vy=launch;
      return true;
    }
    return false;
  }
  for(const depth of [.48,.28,.12]){
    const to={x:grip.x+dx*depth,z:grip.z+dz*depth};
    to.y=top(to);
    if(to.y==null || to.y<=y+.5 || to.y>reachHeight || sim.isBlocked(to.x,to.z,RADIUS,{baseHeight:to.y})) continue;
    player.move={kind:'climb',t:0,T:MOVE.climb*(.8+.15*(to.y-y)),from,to,grip,support,
      transportId:vehicle ? player.transportId : surface(to,to.y)?.transportId};
    player.velocityX=player.velocityZ=player.vy=0;
    return true;
  }
  return false;
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
  const panel = doorPanel(left), open = Boolean(car.missingDoors & panel) || vehiclePaneBroken(car,panel);
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
  if (move.kind==='kick' || move.kind==='lowKick' || move.kind==='stomp') {
    if (passed(meleeMoves[move.clip ?? move.kind].contact)) events.push({kind:'kick',clip:move.clip,action:move.vehicleId==null ? sim._commitStrike?.(move.clip) : null,
      low:move.kind==='lowKick', roof:move.kind==='stomp', vehicleId:move.vehicleId,
      x:player.x,y:player.y,z:player.z,angle:player.angle});
  }
  else if (move.kind==='dodge') {
    const stride=.67*(smooth(move.t/.30)-smooth(before/.30));
    const next=sim._resolvePosition(player.x+Math.sin(move.angle)*stride,player.z+Math.cos(move.angle)*stride,.38,null,player);
    if (!sim._nearCar(next.x,next.z,.38,player.standing?.id,player.y)) {player.x=next.x;player.z=next.z;}
  }
  else if (move.kind === 'getOut') {
    const t = smooth(move.t/move.T);
    player.x = move.from.x+(move.to.x-move.from.x)*t;
    player.z = move.from.z+(move.to.z-move.from.z)*t;
  } else if (move.kind==='climb' || move.kind==='vault') {
    const t=Math.min(1,move.t/move.T), {from,to,grip,support}=move;
    if(support){
      const car=sim.cars.find(item=>item.id===support.id);
      if(!car || Math.abs(car.speed||0)>2.5) {player.move=null;player.grounded=false;return null;}
      if(move.kind==='climb'){
        const turn=car.angle-support.angle, c=Math.cos(turn), s=Math.sin(turn);
        for(const pt of [from,to,grip]){
          const x=pt.x-support.x,z=pt.z-support.z;
          pt.x=car.x+x*c+z*s;pt.z=car.z+z*c-x*s;pt.y+=(car.y||0)-support.y;
        }
        player.angle+=turn;
        Object.assign(support,{x:car.x,z:car.z,y:car.y||0,angle:car.angle});
      }
    }
    const x0=player.x,z0=player.z,y0=player.y;
    if(move.kind==='vault'){
      const seconds=t*move.T;
      const travel=seconds<move.rise ? move.enter*seconds/move.rise :
        seconds<move.descent ? move.enter+(move.exit-move.enter)*(seconds-move.rise)/(move.descent-move.rise) :
        move.exit+(1-move.exit)*(seconds-move.descent)/(move.T-move.descent);
      player.x=from.x+(to.x-from.x)*travel; player.z=from.z+(to.z-from.z)*travel;
      player.y=from.y+move.launch*seconds-.5*GRAVITY*seconds*seconds;
      player.vy=move.launch-GRAVITY*seconds;
      player.speed=Math.hypot(to.x-from.x,to.z-from.z)/move.T;
    } else {
      const approach=smooth(t/.27), over=smooth((t-.56)/.40);
      const braceX=grip.x-.34*Math.sin(player.angle), braceZ=grip.z-.34*Math.cos(player.angle);
      player.x=from.x+(braceX-from.x)*approach+(to.x-braceX)*over;
      player.z=from.z+(braceZ-from.z)*approach+(to.z-braceZ)*over;
      player.y=from.y+(to.y-from.y)*smooth((t-.10)/.57);
      player.vy=dt>0 ? (player.y-y0)/dt : 0;
    }
    player.grounded=false;
    if(dt>0){player.velocityX=(player.x-x0)/dt;player.velocityZ=(player.z-z0)/dt;}
    if(passed(.01)) events.push({kind:move.kind});
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
  if (move.kind==='climb' || move.kind==='vault') {
    Object.assign(player,move.to,{grounded:true,vy:0,transportId:move.transportId||null});
    player.standing=move.kind==='climb' ? move.support : null;
    if(move.kind==='vault'){player.velocityX=(move.to.x-move.from.x)/move.T;player.velocityZ=(move.to.z-move.from.z)/move.T;}
  }
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
