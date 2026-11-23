// Local contact shapes for streamed street furniture. Dimensions are in metres.
// Breakaway and drag values are tuned for gameplay.
const CELL = 16;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const propId = (kind, x, z) => `${kind}:${Math.round(x * 100)}:${Math.round(z * 100)}`;

export class StreetObjects {
  constructor() {
    this.groups = new Map();
    this.grid = new Map();
    this.damage = new Map();
    this.moving = new Map();
  }

  _index(body, add) {
    // Include the fall arc of upright poles. Loose props are reindexed as they move.
    const reach = body.radius + (body.half || 0) + (body.kind === 'lamp' || body.kind === 'sapling' ? body.height : 1);
    const x = body.x + (body.pose?.dx || 0), z = body.z + (body.pose?.dz || 0);
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++) {
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
        const key = i + ',' + j;
        let cell = this.grid.get(key);
        if (add) {
          if (!cell) this.grid.set(key, cell = new Set());
          cell.add(body);
        } else if (cell) {
          cell.delete(body);
          if (!cell.size) this.grid.delete(key);
        }
      }
    }
  }

  replace(group, bodies) {
    for (const body of this.groups.get(group) || []) {
      this._index(body, false);
      if (body.pose && !body.pose.settled) {
        // Finish the movement after the mesh streams out. Drop the GPU references.
        this.moving.set(body.id, { ...body, draw: null, loaded: false });
      }
    }
    if (bodies.length) this.groups.set(group, bodies);
    else this.groups.delete(group);
    for (const body of bodies) {
      body.kind ??= group;
      body.loaded = true;
      body.pose = this.damage.get(body.id);
      if (body.pose) {
        body.draw?.(body.pose);
        if (!body.pose.settled) this.moving.set(body.id, body);
      }
      this._index(body, true);
    }
  }

  skateRail(x,y,z,heading){
    const cell=this.grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL));
    let nearest=null,best=.27;
    for(const body of cell||[]){
      if(body.kind!=='rail' || body.pose || !(body.half>0))continue;
      const top=body.y+body.height,dx=x-body.x,dz=z-body.z;
      const dot=Math.sin(heading)*body.tx+Math.cos(heading)*body.tz;
      if(Math.abs(dot)<.87 || y<top-.06 || y>top+.13)continue;
      const t=dx*body.tx+dz*body.tz;
      if(Math.abs(t)>body.half+.03)continue;
      const side=Math.abs(dx*body.tz-dz*body.tx);
      if(side>=best)continue;
      best=side;nearest={x:body.x+body.tx*t,y:top,z:body.z+body.tz*t,angle:Math.atan2(body.tx,body.tz)+(dot<0?Math.PI:0)};
    }
    return nearest;
  }

  contact(x, z, radius, y, actor, time) {
    let best = null;
    for (let i = Math.floor((x - radius) / CELL); i <= Math.floor((x + radius) / CELL); i++) {
      for (let j = Math.floor((z - radius) / CELL); j <= Math.floor((z + radius) / CELL); j++) {
        const cell = this.grid.get(i + ',' + j);
        if (!cell) continue;
        for (const body of cell) {
          if (body.belowGrade && !Number.isFinite(y)) continue;
          const pose = body.pose;
          // Give the striking bumper time to clear the falling object.
          if (actor && pose && pose.actor === (actor.id ?? 'player') && time < pose.clearAt) continue;
          const tilt = body.kind==='bag' ? 0 : pose?.tilt || 0, sin = Math.sin(tilt), cos = Math.cos(tilt);
          const base = body.y + (pose?.lift || 0);
          const low = Number.isFinite(y) ? y : body.y;
          const top = base + body.height * cos + body.radius;
          if (low > top || low + 1.6 < base - body.radius) continue;
          if (body.kind==='rail' && !pose && actor?.mode==='skate' && low>=base+body.height-.015) continue;
          if (body.kind === 'rail' && pose && top < body.y + .12) continue; // Step or drive over a flattened panel.

          // Project the query onto the panel's hinge, then onto the length of
          // the leaning object that overlaps the actor's vertical interval.
          const px = body.x + (pose?.dx || 0), pz = body.z + (pose?.dz || 0);
          const tx = body.tx || 0, tz = body.tz || 0, half = body.half || 0;
          const along = clamp((x - px) * tx + (z - pz) * tz, -half, half);
          const ax = px + along * tx, az = pz + along * tz;
          const fx = sin * (pose?.nx || 0), fz = sin * (pose?.nz || 0);
          const from = clamp((low - base - body.radius) / Math.max(.001, cos), 0, body.height);
          const to = clamp((low + 1.6 - base + body.radius) / Math.max(.001, cos), 0, body.height);
          const h = sin > .001 ? clamp(((x - ax) * fx + (z - az) * fz) / (sin * sin), from, to) : 0;
          const dx = x - ax - fx * h, dz = z - az - fz * h, gap = Math.hypot(dx, dz);
          const depth = radius + body.radius - gap;
          if (depth > 0 && (!best || depth > best.depth)) {
            best = { kind: 'prop', body, depth, nx: gap ? dx / gap : tz || 1, nz: gap ? dz / gap : -tx };
          }
        }
      }
    }
    return best;
  }

  strike(hit, actor, vx, vz, vehicle, time) {
    const body = hit.body, bag = body.kind === 'bag', loose = bag || body.kind === 'basket';
    if (body.fixed || body.belowGrade || body.kind === 'tree' || (!loose && (!vehicle || body.pose))) return null;
    let closing = -(vx * hit.nx + vz * hit.nz), nx = -hit.nx, nz = -hit.nz;
    if (body.kind === 'rail') {
      // Only the component across the panel can fold it around the lower edge.
      const across = vx * body.tz - vz * body.tx;
      closing = Math.min(closing, Math.abs(across));
      nx = Math.sign(across) * body.tz;
      nz = -Math.sign(across) * body.tx;
    }
    const threshold = loose ? .7 : body.kind === 'rail' ? 5 : 9;
    if (closing < threshold) return null;

    const pose = body.pose || { dx: 0, dz: 0, lift: 0, tilt: 0, nx, nz };
    // A lamp falling towards its overhanging head comes to rest on that head.
    const armReach = body.kind === 'lamp' ? (body.nx * nx + body.nz * nz) * 2.8 : 0;
    pose.restTilt = armReach > body.radius ? Math.atan2(8.7, armReach - body.radius) : Math.PI / 2;
    if (body.kind === 'sapling') pose.restTilt = Math.acos(clamp(body.crownRadius / body.height, 0, 1));
    const launch = loose ? Math.min(bag ? 11 : 7, closing * .85) : 0;
    if (bag) {
      Object.assign(pose,{nx,nz,vy:Math.min(2.8,closing*.17),air:Math.max(0,pose.air??body.stackHeight??0)});
      if (vehicle && closing >= 7 && !pose.torn) {
        pose.torn = {x:body.x+pose.dx, z:body.z+pose.dz, nx,nz,speed:launch, age:0};
      }
    }
    Object.assign(pose, { vx: nx * launch, vz: nz * launch, spin: loose ? 3 + launch : 1.1,
      settled: false, actor: actor.id ?? 'player', clearAt: time + (loose ? .35 : .85) });
    body.pose = pose;
    this.damage.set(body.id, pose);
    this.moving.set(body.id, body);
    body.draw?.(pose);
    return bag ? .995 : loose ? .94 : body.kind === 'lamp' ? .61 : .78;
  }

  step(dt, blocked, heightAt) {
    for (const body of this.moving.values()) {
      const p = body.pose, basket = body.kind === 'basket';
      if (body.kind === 'bag') {
        if (body.loaded) this._index(body,false);
        const dx=p.dx+p.vx*dt, dz=p.dz+p.vz*dt;
        if (body.loaded && blocked(body.x+dx,body.z+dz,body.radius,body.y+p.lift)) {
          p.vx*=-.22; p.vz*=-.22;
        } else { p.dx=dx; p.dz=dz; }
        p.vy-=9.81*dt;
        p.air=Math.max(0,p.air+p.vy*dt);
        if (!p.air && p.vy<0) p.vy=p.vy < -.9 ? -p.vy*.23 : 0;
        const drag=Math.exp(-(p.air ? .5 : 3.1)*dt);
        p.vx*=drag; p.vz*=drag;
        const speed=Math.hypot(p.vx,p.vz);
        p.tilt+=speed*dt/body.radius;
        if (p.torn) p.torn.age+=dt;
        if (body.loaded) {
          p.groundOffset=heightAt(body.x+p.dx,body.z+p.dz)-body.y;
          this._index(body,true);
        }
        p.lift=(p.groundOffset||0)+p.air;
        if (speed<.08 && !p.air && (!p.torn || p.torn.age>1.5)) {
          p.settled=true; p.actor=null; this.moving.delete(body.id);
        }
        body.draw?.(p);
        continue;
      }
      p.spin += (basket ? 3 : 4.5) * Math.sin(p.tilt) * dt;
      let tilt = Math.min(p.restTilt, p.tilt + p.spin * dt);
      if (basket) {
        if (body.loaded) this._index(body, false);
        const dx = p.dx + p.vx * dt, dz = p.dz + p.vz * dt;
        const x = body.x + dx, z = body.z + dz;
        const reach = body.height * Math.sin(tilt);
        const y = body.y + p.lift;
        // Check both ends as the basket turns onto its side. A wall can
        // arrest the tumble before the rim reaches the pavement.
        const obstructed = body.loaded && (blocked(x, z, body.radius, y)
          || blocked(x + p.nx * reach, z + p.nz * reach, body.radius, y + body.height * Math.cos(tilt)));
        if (obstructed) {
          p.vx = 0;
          p.vz = 0;
          tilt = p.restTilt = p.tilt;
        } else {
          p.dx = dx;
          p.dz = dz;
          const drag = Math.exp(-2.4 * dt);
          p.vx *= drag;
          p.vz *= drag;
        }
        if (body.loaded) {
          this._index(body, true);
          p.groundOffset = heightAt(body.x + p.dx, body.z + p.dz) - heightAt(body.x, body.z);
        }
      }
      p.tilt = tilt;
      p.lift = body.radius * Math.sin(tilt) + (p.groundOffset || 0);
      if (tilt >= p.restTilt && Math.hypot(p.vx, p.vz) < .08) {
        p.settled = true;
        p.actor = null;
        this.moving.delete(body.id);
      }
      body.draw?.(p);
    }
  }
}
