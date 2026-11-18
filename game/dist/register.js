// Cash registers are fixtures in the generated interiors. The same local
// coordinates place the drawer, its operator side, and the interaction.
import { crossesFixture, roomLocal, roomPoint, walkRoom } from './room.js';
import { fleeShop, stepEscape } from './shop-life.js';
import { menuFor } from './menu.js';

const clamp = (n, low, high) => Math.min(high, Math.max(low,n));

function reachableFloor(room) {
  const step = .35, radius = .405;
  const solids = room.things.filter(t => t.solid);
  const queue = [{a:0,b:.5}], seen = new Set(['0,0']);
  for (let i=0; i<queue.length; i++) {
    const p = queue[i];
    for (const [da,db] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const a = p.a+da, b = p.b+db, key = Math.round(a/step)+','+Math.round((b-.5)/step);
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.abs(a)>room.width/2-radius || b<radius || b>room.depth-radius) continue;
      if (solids.some(t=>Math.abs(a-t.a)<t.w/2+radius && Math.abs(b-t.b)<t.d/2+radius)) continue;
      queue.push({a,b});
    }
  }
  return queue;
}

export function planRegister(room) {
  if (!room.staff.length || !menuFor(room.place).length) return null;
  const floor = reachableFloor(room);
  const fixtures = room.things.filter(t => t.shape==='register');
  let best = Infinity, register = null;
  for (const [index,staff] of room.staff.entries()) for (const t of room.things) {
    if (!t.solid || t.y!==0 || t.h<.73 || t.h>1.22 || t.w<.38 || t.d<.32) continue;
    const longA=t.w>=t.d;
    const positions=fixtures.filter(pos=>Math.abs(pos.y-t.h)<.1 && Math.abs(pos.a-t.a)<=t.w/2 && Math.abs(pos.b-t.b)<=t.d/2);
    for (const offset of [0,.5,-.5]) positions.push({a:staff.a+(longA?offset:0),b:staff.b+(longA?0:offset)});
    for (const pos of positions) {
      const a=clamp(pos.a,t.a-t.w/2+.19,t.a+t.w/2-.19);
      const b=clamp(pos.b,t.b-t.d/2+.16,t.b+t.d/2-.16);
      const staffDistance=Math.hypot(staff.a-a,staff.b-b);
      if (staffDistance>2.6) continue;
      // Small items, display cases and shelf stock also occupy the countertop.
      const crowded=room.things.some(other=>other!==t && other.shape!=='register' && other.y + other.h>t.h+.085 &&
        other.y<t.h+.43 && Math.abs(other.a-a)<other.w/2+.18 && Math.abs(other.b-b)<other.d/2+.16);
      if (crowded) continue;
      for (const p of floor) {
        const da=p.a-a, db=p.b-b, distance=Math.hypot(da,db);
        if (distance>1.15 || distance<.4) continue;
        const alignment=((staff.a-a)*da+(staff.b-b)*db)/Math.max(.01,staffDistance*distance);
        const fixtureBonus=pos.shape==='register' && alignment>0 ? 2 : 0;
        const score=staffDistance+distance-2*alignment+(t.shape?1:0)-fixtureBonus;
        if (score>=best || !clearView(room,p,{a,b})) continue;
        best=score;
        register={a,b,up:t.h+.025,da:da/distance,db:db/distance,clerk:index};
      }
    }
  }
  if (register) return register;

  // Tiny rooms can have a serving hatch instead of a counter. Mount the
  // terminal flush with a wall or display so the existing aisle stays clear.
  const staff=room.staff[0], half=room.width/2;
  const walls=[{a:-half,b:room.depth/2,w:0,d:room.depth},{a:half,b:room.depth/2,w:0,d:room.depth},{a:0,b:room.depth,w:room.width,d:0}];
  const supports=walls.concat(room.things.filter(t=>t.solid && t.y===0 && t.h>=.9));
  for (const p of floor) for (const t of supports) {
    const edgeA=clamp(p.a,t.a-t.w/2,t.a+t.w/2), edgeB=clamp(p.b,t.b-t.d/2,t.b+t.d/2);
    const gap=Math.hypot(p.a-edgeA,p.b-edgeB);
    if (gap<.4 || gap>1.05) continue;
    const da=(p.a-edgeA)/gap, db=(p.b-edgeB)/gap;
    const a=edgeA+.17*da, b=edgeB+.17*db;
    if (Math.abs(a)<.9 && b<1.5) continue;
    const score=Math.hypot(staff.a-a,staff.b-b)+gap;
    if (score>=best || !clearView(room,p,{a,b})) continue;
    best=score;register={a,b,up:.96,da,db,clerk:0,mounted:true};
  }
  return register;
}

// A shelf or partition taller than the counter interrupts a clerk interaction.
function clearView(room, at, to, throughGlass=false) {
  return !room.things.some(t => !(throughGlass && t.glass) && t.y <= 1.55 && t.y+t.h >= 1.55 && crossesFixture(at,to,t));
}

export function registerAction(sim) {
  const room=sim.room, view=sim.doorway, till=room?.register;
  if (!till || view?.plan.place.id !== room.place.id || view.closed || sim.player.mode !== 'walk' || sim.seat || sim.ending) return null;
  const at=roomLocal(room,sim.player.x,sim.player.z), da=at.a-till.a, db=at.b-till.b;
  const offer=view.take?.kind==='collect' ? view.take.source : view.cashPoint;
  if (view.handoff?.phase === 'offered' && offer &&
      Math.hypot(sim.player.x-offer.x,sim.player.z-offer.z) <= 1.55 &&
      clearView(room,at,roomLocal(room,offer.x,offer.z))) return 'collect';
  if (Math.hypot(da,db)<=1.2 && da*till.da+db*till.db>.34 && clearView(room,at,till)) return 'drawer';
  return null;
}

const mix = (a,b,t) => a+(b-a)*t;
const smooth = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
const between = (from,to,t) => ({x:mix(from.x,to.x,t),y:mix(from.y,to.y,t),z:mix(from.z,to.z,t)});

// Cash and hand positions use world X/Z and height above this room's floor.
function drawerPoint(room) {
  const t=room.register, [x,z]=roomPoint(room,t.a+.30*t.da,t.b+.30*t.db);
  return {x,z,y:t.up+.083};
}

export function beginRegisterTake(sim, work) {
  const view=sim.doorway;
  if (view?.take) return true;
  const kind=registerAction(sim);
  if (!kind || work.isClosed(view.plan.place)) return false;
  if (!work.balance(view.plan.place)) { sim._say('The register is empty.'); return true; }
  const source=kind==='collect' ? {...view.cashPoint} : drawerPoint(view.plan);
  view.take={kind,source,age:0,duration:kind==='drawer'?1.35:.95};
  if (kind==='drawer') {
    if (!view.handoff) work.alarm(view,'The clerk recoils as the drawer opens. Store alarm reported.');
    view.handoff={phase:'alarmed',age:0,safeTime:0};
  }
  return true;
}

function canNotice(view,p,actor) {
  const dx=p.x-actor.x, dz=p.z-actor.z, d=Math.hypot(dx,dz);
  return d<14 && (d<5 || dx*Math.sin(actor.heading)+dz*Math.cos(actor.heading)>-.35*d) &&
    clearView(view.plan,roomLocal(view.plan,p.x,p.z),roomLocal(view.plan,actor.x,actor.z),true);
}

function escapeClerk(view,work) {
  if (!work.isClosed(view.plan.place)) {
    work.closeShop(view.plan.place,work.now()+60000);
    work.save();
  }
  view.handoff={phase:'escaping',age:0};
  fleeShop(view,view.clerk);
}

export function updateClerk(view, sim, yaw, pitch, dt, work, {outside, palm, firstPerson=false, playerHand}={}) {
  const room=view.plan, p=sim.player, till=room.register, clerk=view.clerk;
  const active=sim.doorway===view && sim.room?.place?.id===room.place.id && !sim.ending && p.mode==='walk';
  const armed=active && p.armed && !sim.seat;
  const closed=work.isClosed(room.place);
  if (view.closed && !closed) {
    // A room can stay streamed in for the entire closure.
    for (const actor of view.actors) {
      const s=actor.spot, [x,z]=roomPoint(room,s.a,s.b), [fx,fz]=roomPoint(room,s.a+s.da,s.b+s.db);
      const sitting=room.seats.includes(s);
      if (sitting && active && sim.seat && Math.hypot(sim.seat.x-x,sim.seat.z-z)<.2) {
        actor.gone=true; view.occupied.delete(s); continue;
      }
      Object.assign(actor,{x,z,heading:Math.atan2(fx-x,fz-z),escape:null,gone:false,clip:null,from:null,stride:0,lift:s.lift||0,sitting,seat:sitting?s:null});
      if (actor.sitting) view.occupied.add(s);
    }
    view.handoff=null;
  }
  view.closed=closed;
  if (closed && !view.handoff) for (const actor of view.actors) actor.gone=true;
  if (!dt) return;
  let event=view.handoff;
  if (clerk && !clerk.gone && !event && armed && canNotice(view,p,clerk)) {
    event=view.handoff={phase:'startled',age:0,safeTime:0};
    work.alarm(view,'The clerk spots the pistol and raises their hands. Store alarm reported.');
  }
  // Anyone who sees the pistol can react before the clerk. The alarm also
  // reaches people seated behind shelves and customers on their way to pay.
  if (view.visitor?.visit && armed && canNotice(view,p,view.visitor)) view.visitor.visit.scared=true;
  for (const actor of view.actors) {
    if (actor.gone) continue;
    if (!actor.escape && actor!==clerk && (event || armed && canNotice(view,p,actor))) fleeShop(view,actor);
    if (actor.escape) stepEscape(view,actor,dt,outside);
  }
  if (!till || !clerk) return;
  const drawer=drawerPoint(room);
  let open=false, cash=null, hand=null;
  if (event && event.phase!=='escaping') {
    event.age+=dt;
    const dx=clerk.x-p.x, dz=clerk.z-p.z, d=Math.hypot(dx,dz);
    const watched=armed && (dx*Math.sin(yaw)+dz*Math.cos(yaw))*Math.cos(pitch)>.12*d &&
      clearView(room,roomLocal(room,p.x,p.z),roomLocal(room,clerk.x,clerk.z),true);
    event.safeTime=watched?0:(event.safeTime||0)+dt;
    if (!view.take && (!active || event.safeTime>1.45)) {
      escapeClerk(view,work); event=view.handoff;
    } else if (event.phase!=='alarmed') {
      if (event.phase==='startled' && event.age>=.55) event.phase='opening';
      if (event.phase==='opening' && event.age>=1.45) event.phase='giving';
      if (event.phase==='giving' && event.age>=2.25) {
        event.phase='offered'; sim._say('The clerk holds out the cash.');
      }
    }
    const phase=event.phase;
    clerk.from=null;
    if (phase==='startled' || phase==='alarmed') {
      clerk.clip=phase==='startled'?'handsUp':'cower'; clerk.time=event.age;
      clerk.heading=Math.atan2(-dx,-dz);
    } else if (phase==='opening' || phase==='giving' || phase==='offered') {
      open=true;
      const taking=phase==='opening', t=smooth((event.age-1.45)/.65);
      const drawerYaw=Math.atan2(drawer.x-clerk.x,drawer.z-clerk.z);
      // Step within reach of the open drawer before lifting the bills.
      if (taking) {
        const at=roomLocal(room,clerk.x,clerk.z), target=roomLocal(room,drawer.x,drawer.z);
        const da=target.a-at.a, db=target.b-at.b, gap=Math.hypot(da,db);
        const step=Math.min(Math.max(0,gap-.52),dt*1.8)/Math.max(.01,gap);
        const moved=walkRoom(room,at.a,at.b,da*step,db*step,.15);
        [clerk.x,clerk.z]=roomPoint(room,moved.a,moved.b);
      }
      const giveYaw=Math.atan2(p.x-clerk.x,p.z-clerk.z);
      clerk.heading=drawerYaw+t*Math.atan2(Math.sin(giveYaw-drawerYaw),Math.cos(giveYaw-drawerYaw));
      clerk.clip=taking?'pickUp':'reach';
      clerk.time=taking?clamp((event.age-.55)*.56,0,.51):mix(.34,.76,t);
      if (phase==='giving' && event.age<1.78) {
        clerk.from='pickUp'; clerk.fromTime=.51;
        clerk.fade=1-smooth((event.age-1.45)/.33);
      }
      const extension=taking?.52:.6;
      const grip=palm?.(clerk) || {x:clerk.x+Math.sin(clerk.heading)*extension,y:taking?1.12:1.32,z:clerk.z+Math.cos(clerk.heading)*extension};
      if (taking) cash=between(drawer,grip,smooth((event.age-1.06)/.28));
      else cash=grip;
    }
  }

  const take=view.take;
  if (take) {
    // Validate throughout the reach. Leaving the counter, sitting down or
    // losing the room cancels the action before it changes the wallet.
    if (registerAction(sim)!==take.kind || !active) view.take=null;
    else {
      take.age+=dt;
      const u=clamp(take.age/take.duration,0,1), pYaw=Math.atan2(take.source.x-p.x,take.source.z-p.z);
      take.heading=pYaw;
      const side=.19, rest={x:p.x+side*Math.cos(pYaw)+.18*Math.sin(pYaw),y:1.03,z:p.z-side*Math.sin(pYaw)+.18*Math.cos(pYaw)};
      const grip=smooth(u/.52), retract=smooth((u-.52)/.48);
      hand=between(rest,take.source,grip*(1-retract));
      hand.y+=.13*Math.sin(Math.PI*retract);
      take.hand=hand;
      take.clipTime=u<.52 ? mix(0,.28,u/.52) : mix(.28,.8333,(u-.52)/.48);
      open=true; cash=u<.52?take.source:hand;
      if (u>=.52 && !firstPerson && playerHand) {
        const actual=playerHand();
        if (actual) cash=between(cash,actual,smooth((u-.52)/.12));
      }
      if (u>=1) {
        work.rob(room.place);
        view.take=null;
        view.closed=work.isClosed(room.place);
        cash=null; hand=null;
      }
    }
  }
  view.cashPoint=cash;
  view.group.userData.updateTill(open,cash,dt,firstPerson ? hand : null,p);
}
