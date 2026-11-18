import { BOARDINGS, TRANSPORT, GUIDED_LINES, isAircraft, isWatercraft } from './transport-catalog.js';

const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const approach = (now, goal, delta) => now + clamp(goal - now, -delta, delta);
const MAX_ALTITUDE = 1100;

function parked(home,heightAt) {
  const ride = { ...home.berth, home, spec: TRANSPORT[home.type], angle: home.angle, entrance: home.board,
    speed: 0, vy: 0, grounded: true, pitch: 0, roll: 0, transportId: null };
  const line=GUIDED_LINES[home.type];
  if (line) {
    ride.line=line;
    ride.length=gap(line.terminals[0].berth,line.terminals[1].berth);
    ride.t = home.id === line.terminals[1].id ? 1 : 0;
    ride.track = ride.t ? 1 : -1;
    ride.direction = ride.t ? -1 : 1;
    Object.assign(ride,line.position(ride.t,ride.track,heightAt));
    if (ride.direction < 0) ride.angle += Math.PI;
  }
  return ride;
}

/** The same occupants and parked positions feed interaction, physics and drawing. */
export class TransportFleet {
  constructor(sim, { isLand, isNavigable, waterLevel, stops = BOARDINGS }) {
    this.sim = sim;
    this.isLand = isLand;
    this.isNavigable = isNavigable;
    this.waterLevel = waterLevel;
    this.heightAt = (x,z) => sim.groundHeight(x,z);
    this.stops = stops;
    this.rides = stops.map(stop=>parked(stop,this.heightAt));
    this.active = null;
  }

  recall(id) {
    const index = this.rides.findIndex(ride => ride.home.id === id);
    if (index >= 0) this.rides[index] = parked(this.rides[index].home,this.heightAt);
  }

  abandon() {
    if (this.active) this.recall(this.active.home.id);
    this.active = null;
  }

  altitude(ride) {
    if (ride.spec.kind==='rail' && ride!==this.active) return this.heightAt(ride.x,ride.z)+.27;
    if (Number.isFinite(ride.y)) return ride.y;
    return isWatercraft(ride.spec) ? this.waterLevel : this.sim.groundHeight(ride.x, ride.z);
  }

  nearby() {
    const p = this.sim.player;
    if (p.mode !== 'walk' || this.sim.room || !p.grounded) return null;
    let nearest = null, reach = 3.5;
    for (const ride of this.rides) {
      const d = gap(p, ride.entrance);
      if (d < reach && Math.abs(p.y - (ride.entrance.y ?? this.sim.groundHeight(ride.entrance.x, ride.entrance.z))) < 2.6) {
        nearest = ride; reach = d;
      }
    }
    return nearest;
  }

  board(ride) {
    if (!ride || ride !== this.nearby()) return false;
    const sim = this.sim;
    if (!ride.line && (this.blocked(ride, ride.x, ride.z, this.altitude(ride))
      || (isWatercraft(ride.spec) && !this.waterFits(ride, ride.x, ride.z, ride.angle)))) {
      sim._say('The boarding area is obstructed or still loading.'); return false;
    }
    ride.y = this.altitude(ride);
    this.active = ride;
    Object.assign(sim.player, { mode: 'transport', vehicleId: null, swing: 0, slide: 0 });
    this.sync();
    sim._say(ride.spec.controls, 9);
    return true;
  }

  sync() {
    const r = this.active;
    Object.assign(this.sim.player, { x: r.x, y: r.y, z: r.z, angle: r.angle, speed: r.speed,
      grounded: r.grounded, transportId: r.transportId, vy: r.vy,
      velocityX: Math.sin(r.angle)*r.speed, velocityZ: Math.cos(r.angle)*r.speed });
  }

  blocked(ride, x, z, y) {
    return this.sim.isBlocked(x, z, ride.spec.radius, { ignoreWater: true, baseHeight: y });
  }

  waterFits(ride, x, z, angle) {
    const s = ride.spec, sin = Math.sin(angle), cos = Math.cos(angle);
    const beam = s.floats ? 1.4 : s.radius, end = (s.length || 7)*.46;
    const bowX=x+end*sin, bowZ=z+end*cos, sternX=x-end*sin, sternZ=z-end*cos;
    if (!this.isNavigable(x,z) || !this.isNavigable(bowX,bowZ) || !this.isNavigable(sternX,sternZ)
      || !this.isNavigable(x+beam*cos,z-beam*sin) || !this.isNavigable(x-beam*cos,z+beam*sin)) return false;
    if (s.kind !== 'boat') return true;
    // Piers on piles can extend past the mapped dry shoreline.
    const options={ignoreWater:true,baseHeight:this.waterLevel};
    return !this.sim.isBlocked(bowX,bowZ,beam*.6,options) && !this.sim.isBlocked(sternX,sternZ,beam*.6,options);
  }

  clearExit(point, ride) {
    const sim = this.sim, { x, z } = point;
    const deck = ride.transportId && sim._sampleSurface?.(x,z,{referenceHeight:ride.y,mode:'walk',transportId:ride.transportId})?.transportId;
    return (deck || this.isLand(x,z)) && !sim.isBlocked(x,z,.45,{baseHeight:point.y}) && (deck || !sim._landscapeContact?.(x,z,.4))
      && !sim._nearCar(x,z,.45,null,point.y ?? sim.groundHeight(x,z))
      && !sim._unsupportedDeckExit(ride,x,z,'walk');
  }

  nearestLanding(point) {
    let nearest = null, distance = Infinity;
    for (const stop of this.stops) {
      if (!isWatercraft(TRANSPORT[stop.type])) continue;
      const d = gap(point,stop.berth);
      if (d < distance) { nearest = stop; distance = d; }
    }
    return nearest;
  }

  leave() {
    const r = this.active, sim = this.sim;
    if (!r) return false;
    if (r.line && r.t !== 0 && r.t !== 1) { sim._say('Get off when you reach the station.'); return false; }
    if (!r.line && !r.grounded) { sim._say('Land before getting out.'); return false; }
    if (Math.abs(r.speed) > 1.2) { sim._say('Slow to a stop to get out.'); return false; }
    const points = [];
    if (r.line) points.push(r.line.terminals[r.t].board);
    else if (isWatercraft(r.spec)) {
      const dock = this.nearestLanding(r);
      if (!dock || gap(r,dock.berth) >= 29) { sim._say('Pull alongside a marked landing to get out.'); return false; }
      points.push(dock.board);
    } else {
      if (gap(r,r.home.berth) < 2) points.push(r.home.board);
      for (const side of [-1, 1]) {
        const offset = side*(r.spec.radius+.8);
        points.push({ x: r.x+Math.cos(r.angle)*offset, z: r.z-Math.sin(r.angle)*offset, y: r.y });
      }
    }
    for (const point of points) {
      if (!this.clearExit(point,r)) continue;
      r.speed = r.vy = r.roll = r.pitch = 0;
      r.entrance = point;
      this.active = null;
      Object.assign(sim.player, { ...point, mode: 'walk', vehicleId: null, speed: 0, velocityX: 0, velocityZ: 0,
        grounded: true, transportId: r.transportId, vy: 0, slide: 0, swing: 0 });
      sim.updateGrounding();
      sim._say('On foot. Press E here to board again.');
      return true;
    }
    sim._say('The exit is obstructed. Wait for clear ground.'); return false;
  }

  step(input, dt) {
    const r = this.active;
    if (!r) return;
    if (r.line) this.followLine(r,input,dt);
    else if (isAircraft(r.spec)) this.fly(r,input,dt);
    else this.surface(r,input,dt);
    this.sync();
  }

  followLine(r, input, dt) {
    const endpoint = r.t === 0 || r.t === 1;
    if (endpoint && r.spec.kind === 'rail') r.y = this.heightAt(r.x,r.z)+.27;
    if (endpoint && input.forward <= 0) { r.departHeld = false; return; }
    if (endpoint && r.departHeld) return;
    if (endpoint) r.direction = r.t === 0 ? 1 : -1;
    const remaining = (r.direction === 1 ? 1-r.t : r.t)*r.length;
    r.speed = Math.min(r.spec.speed, r.speed + 2.4*dt, Math.sqrt(2*2.4*remaining));
    const t = clamp(r.t + r.direction*r.speed*dt/r.length,0,1);
    const point = r.line.position(t,r.track,this.heightAt);
    if (this.sim._isReadyAt && !this.sim._isReadyAt(point.x,point.z,2)) { r.speed=0; return; }
    Object.assign(r,point,{t,grounded:t === 0 || t === 1});
    if (r.direction < 0) r.angle += Math.PI;
    if (r.grounded) {
      r.speed = 0; r.departHeld = input.forward > 0;
      this.sim._say('At '+r.line.terminals[t].place+' · E get off · W return',7);
    }
  }

  surface(r, input, dt) {
    const s = r.spec, boat = s.kind === 'boat', sim = this.sim;
    const reverse=boat ? -.32 : r.home.type==='bus' ? -.15 : 0;
    const target = input.handbrake || input.brake ? 0 : s.speed*clamp(input.forward,reverse,1);
    const braking = input.handbrake || input.brake || input.forward < 0 && r.speed > 0;
    const rate = braking ? s.accel*2.3 : input.forward ? s.accel : s.accel*.42;
    r.speed = approach(r.speed,target,dt*rate);
    const steer = boat ? .35+.65*Math.min(1,Math.abs(r.speed)/3) : Math.min(1,Math.abs(r.speed)*.9)/(1+Math.abs(r.speed)*.035);
    const angle = r.angle - input.turn*s.turn*steer*dt*(r.speed < -.1 ? -1 : 1);
    const x = r.x+Math.sin(angle)*r.speed*dt, z = r.z+Math.cos(angle)*r.speed*dt;
    if (boat) {
      if (this.waterFits(r,x,z,angle) && !this.blocked(r,x,z,this.waterLevel)) Object.assign(r,{x,z,angle,y:this.waterLevel});
      else r.speed = 0;
    } else {
      const next = sim._resolvePosition(x,z,s.radius,null,r);
      const supportAt=(px,pz)=>sim._sampleSurface?.(px,pz,{referenceHeight:r.y,mode:'drive',transportId:r.transportId});
      const support=supportAt(next.x,next.z);
      const obstructed=(px,pz,floor)=>!(floor?.transportId || this.isLand(px,pz))
        || sim.isBlocked(px,pz,s.radius,{baseHeight:r.y}) || sim._nearCar(px,pz,s.radius,null,r.y);
      const axle = (s.length || 0)*.38;
      const blocked = next.hit || obstructed(next.x,next.z,support) || (axle && [-axle,axle].some(d=>{
        const px=next.x+d*Math.sin(angle),pz=next.z+d*Math.cos(angle);
        return obstructed(px,pz,supportAt(px,pz));
      }));
      if (blocked) r.speed = 0;
      else {
        Object.assign(r,{x:next.x,z:next.z,angle,y:support?.elevation ?? 0,transportId:support?.transportId ?? null});
      }
    }
    r.roll = approach(r.roll,input.turn*Math.min(1,Math.abs(r.speed)/8)*(boat || s.length ? .07 : .23),dt*1.4);
  }

  fly(r, input, dt) {
    const s = r.spec, rotor = s.kind === 'rotor', sim = this.sim;
    // Fixed-wing throttle holds when released. Below flying speed the aircraft settles.
    const allowed = rotor && r.grounded ? 0 : s.speed;
    if (rotor) r.speed = approach(r.speed,allowed*clamp(input.forward,-.35,1),s.accel*dt);
    else r.speed = clamp(r.speed+input.forward*s.accel*(input.forward<0 ? 1.7 : 1)*dt,0,s.speed);
    const steer = rotor ? 1 : r.grounded ? Math.min(1,r.speed/5) : clamp(r.speed/s.speed,.35,1);
    const angle = r.angle-input.turn*s.turn*steer*dt;
    const lift = rotor || r.speed >= s.lift;
    const climb = lift ? input.lift*(rotor ? 16 : 21) : -7;
    r.vy = approach(r.vy,climb,dt*14);
    const altitude = Math.min(MAX_ALTITUDE,r.y+r.vy*dt);
    const x = r.x+Math.sin(angle)*r.speed*dt, z = r.z+Math.cos(angle)*r.speed*dt;
    const wet = this.isNavigable(x,z), floor = wet ? this.waterLevel : sim.groundHeight(x,z);
    const validSurface = s.floats ? wet && this.waterFits(r,x,z,angle) : !wet && this.isLand(x,z);
    const airborne = altitude > floor+.08;
    const cross = validSurface || (!r.grounded && altitude >= floor+2);
    // Hold the horizontal position at walls and unloaded cells. The vertical axis
    // remains independent, so hovering beside a wall still allows climbing away.
    const clear = cross && !this.blocked(r,x,z,Math.max(altitude,floor));
    if (clear) Object.assign(r,{x,z,angle});
    else { r.speed = 0; if (rotor) r.angle = angle; }
    const support = clear ? floor : this.isNavigable(r.x,r.z) ? this.waterLevel : sim.groundHeight(r.x,r.z);
    const landing = clear ? validSurface : s.floats ? this.waterFits(r,r.x,r.z,r.angle) : this.isLand(r.x,r.z);
    const minY = support+(landing ? 0 : 2);
    const y = clamp(altitude,minY,MAX_ALTITUDE);
    if (y >= r.y || !this.blocked(r,r.x,r.z,y)) r.y = y;
    r.grounded = landing && r.y <= minY+.02;
    if (r.y <= minY && r.vy < 0 || r.y >= MAX_ALTITUDE && r.vy > 0) r.vy = 0;
    r.pitch = approach(r.pitch,r.grounded ? 0 : rotor ? .13*r.speed/s.speed : -.22*r.vy/21,dt*.7);
    r.roll = approach(r.roll,airborne && !r.grounded ? input.turn*(rotor ? .13 : .35) : 0,dt*.8);
  }
}
