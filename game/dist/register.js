// Cash registers are fixtures in the generated interiors. The same local
// coordinates place the drawer, its operator side, and the interaction.
import { blocksShopEntry, crossesFixture, roomLocal, roomPoint, roomUnderFire, walkRoom } from './room.js';
import { fleeShop, stepEscape, stepRoomInjury } from './shop-life.js';
import { checkoutAxes, CHECKOUT_WIDTH, CHECKOUT_DEPTH } from './checkout-model.js';
import { KIND } from './places.js';

const clamp = (n, low, high) => Math.min(high, Math.max(low,n));

function reachableFloor(room, extra) {
  const step = .28, radius = .32;
  const solids = room.things.filter(t => t.solid);
  if(extra)solids.push(extra);
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
  const kind = room.place.kind;
  // Public reception desks handle no payments, except at the post office.
  if (!room.staff.length || (KIND[kind]?.group === 'public' && kind !== 'postoffice')) return null;
  const floor=reachableFloor(room), markers=room.things.filter(t=>t.shape==='register');
  const cashier=room.staff.findIndex(s=>s.checkout || s.role==='cashier');
  const operators=cashier>=0?[[cashier,room.staff[cashier]]]:[...room.staff.entries()];
  let best=Infinity, register=null;
  const overlaps=(t,a,b,ra,rb)=>Math.abs(a-t.a)<ra+t.w/2 && Math.abs(b-t.b)<rb+t.d/2;
  function consider(surface,staff,clerk,da,db,requested,rank,support=null){
    const axes=checkoutAxes(room,da,db);
    const ra=(Math.abs(axes.ua)*CHECKOUT_WIDTH+Math.abs(axes.va)*CHECKOUT_DEPTH)/2;
    const rb=(Math.abs(axes.ub)*CHECKOUT_WIDTH+Math.abs(axes.vb)*CHECKOUT_DEPTH)/2;
    if(surface.w<2*ra+.025 || surface.d<2*rb+.025)return;
    const a=clamp(requested.a,surface.a-surface.w/2+ra+.012,surface.a+surface.w/2-ra-.012);
    const b=clamp(requested.b,surface.b-surface.d/2+rb+.012,surface.b+surface.d/2-rb-.012);
    const xa=staff.a-a, xb=staff.b-b, gap=Math.hypot(xa,xb);
    const facing=da*xa+db*xb;
    if(gap<.46 || gap>1.48 || facing<.24 || facing/gap<.35)return;
    // Thin stone or steel worktops in older layouts sit on top of the cabinet.
    let up=surface.h;
    const slabs=room.things.filter(t=>!t.shape && !t.solid && t.h<=.085 && Math.abs(t.y-surface.h)<.012 &&
      Math.abs(a-t.a)+ra<=t.w/2+.008 && Math.abs(b-t.b)+rb<=t.d/2+.008);
    for(const slab of slabs)up=Math.max(up,slab.y+slab.h);
    if(room.things.some(t=>t!==surface && t.shape!=='register' && t.y+t.h>up+.003 &&
      t.y<up+.41 && overlaps(t,a,b,ra+.009,rb+.009)))return;
    // Keep customers able to approach the counter. Their approach never sets
    // the orientation of the operator display or drawer.
    if(!floor.some(p=>Math.hypot(p.a-a,p.b-b)<1.5 && clearView(room,p,{a,b})))return;
    const displacement=Math.hypot(a-requested.a,b-requested.b);
    const score=rank+gap+displacement*2+(1-facing/gap)*1.5;
    if(score>=best)return;
    if(support==='podium'){
      const after=reachableFloor(room,surface);
      const nearStaff=p=>Math.hypot(p.a-staff.a,p.b-staff.b)<.57;
      if(!after.some(p=>Math.hypot(p.a-a,p.b-b)<1.5 && clearView(room,p,{a,b})) ||
        floor.some(nearStaff) && !after.some(nearStaff))return;
    }
    best=score;register={a,b,up,da,db,clerk};
    if(support==='shelf')register.mounted=true;
    if(support==='podium')register.podium=surface;
  }
  const counters=room.things.filter(t=>t.solid && t.y===0 && t.h>=.78 && t.h<=1.22 &&
    (!t.shape || ['serviceDesk','tellerPod','checkoutCounter','branchDesk','showcase'].includes(t.shape)));
  for(const t of counters){
    const anchors=markers.filter(m=>Math.abs(m.y-t.h)<=.10 && overlaps(t,m.a,m.b,.015,.015));
    for(const [index,staff] of operators){
      if(Math.max(Math.abs(staff.a-t.a)-t.w/2,Math.abs(staff.b-t.b)-t.d/2)>1.65)continue;
      const longA=t.w>=t.d, face=longA?[0,Math.sign(staff.b-t.b)]:[Math.sign(staff.a-t.a),0];
      const end=longA?[Math.sign(staff.a-t.a),0]:[0,Math.sign(staff.b-t.b)];
      const options=anchors.map(m=>({point:m,rank:0}));
      for(const offset of [0,-.40,.40,-.80,.80,-1.2,1.2])
        options.push({point:{a:longA?staff.a+offset:t.a,b:longA?t.b:staff.b+offset},rank:anchors.length?4:t.shape==='showcase'?11:8});
      for(const {point,rank} of options){
        if(face[0]||face[1])consider(t,staff,index,...face,point,rank);
        if(end[0]||end[1])consider(t,staff,index,...end,point,rank+2);
      }
    }
  }
  if(register)return register;
  // A compact shop can use a bracketed POS shelf on an opaque wall. Its
  // front faces into the room, and its rear edge touches its support.
  const half=room.width/2;
  for(const [index,staff] of operators){
    for(const [da,db] of [[1,0],[-1,0],[0,-1]]){
      const sideStart=da?(room.returns?.find(e=>e.side===-da)?.length||0):0;
      const low=da?Math.max(.85,sideStart+.30):-half+.34, high=da?room.depth-.34:half-.34;
      for(let pos=low;pos<=high+.001;pos+=.23){
        const a=da?-da*(half-.225):pos,b=da?pos:room.depth-.225;
        if(room.things.some(t=>t.y+t.h>.84 && t.y<1.38 && overlaps(t,a,b,da?.225:.28,da?.28:.225)))continue;
        const shelf={a,b,w:da?.46:.62,d:da?.62:.46,h:.97};
        consider(shelf,staff,index,da,db,shelf,0,'shelf');
      }
    }
  }
  if(register)return register;
  // Where masonry or glazing occupies the walls, fit a narrow cashier podium
  // beside the attendant. Keep the door, existing furniture and staff lane free.
  for(const [index,staff] of operators){
    for(const [da,db] of [[-1,0],[1,0],[0,-1],[0,1]]){
      for(const side of [0,-.40,.40,-.67,.67])for(const distance of [.72,.92,1.13]){
        const a=staff.a-da*distance+db*side,b=staff.b-db*distance-da*side;
        const w=da?.50:.61,d=da?.61:.50;
        if(Math.abs(a)+w/2>half-.06 || b-d/2<.12 || b+d/2>room.depth-.06 ||
          blocksShopEntry(room,{a,b,w,d}))continue;
        const podium={a,b,w,d,h:.96,y:0,solid:true,shape:'checkoutCounter',face:[-da,-db],
          color:'#706653',more:{trim:'#a99c87'}};
        if(room.things.some(t=>t.y<1.30 && overlaps(t,a,b,w/2+.018,d/2+.018)) ||
          room.staff.some(person=>overlaps(podium,person.a,person.b,.25,.25)))continue;
        // Reach the station from the shop door even after installing the podium.
        const prefer=1+staff.da*da+staff.db*db;
        consider(podium,staff,index,da,db,podium,prefer,'podium');
      }
    }
  }
  if(register)return register;
  // Fully occupied counters need a staffed side station. Preserve the cook or
  // technician at their machine and fit the attendant beside an available wall.
  for(const p of floor){
    if(p.b<1.55 || room.staff.some(s=>Math.hypot(s.a-p.a,s.b-p.b)<.65))continue;
    for(const [da,db] of [[1,0],[-1,0],[0,-1]]){
      const a=da?-da*(half-.225):p.a,b=da?p.b:room.depth-.225;
      const gap=(p.a-a)*da+(p.b-b)*db;
      if(gap<.50 || gap>1.02 || Math.abs(a)>.001+half-(da?.20:.33) || b>room.depth-(da?.34:.20) ||
        da && b-.34<(room.returns?.find(e=>e.side===-da)?.length||0))continue;
      if(room.things.some(t=>t.y+t.h>.78 && t.y<1.38 && overlaps(t,a,b,da?.23:.30,da?.30:.23)))continue;
      const shelf={a,b,w:da?.46:.62,d:da?.62:.46,h:.97};
      const attendant={a:p.a,b:p.b,da:-da,db:-db,facing:db<0?2:da>0?1:3,role:'cashier'};
      const before=best;
      consider(shelf,attendant,room.staff.length,da,db,shelf,Math.hypot(a-room.staff[0].a,b-room.staff[0].b),'shelf');
      if(best<before)register.attendant=attendant;
    }
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
  const t=room.register, axes=checkoutAxes(room,t.da,t.db);
  const [x,z]=roomPoint(room,t.a+.30*axes.va,t.b+.30*axes.vb);
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
    work.alarm(view,'The clerk recoils as the drawer opens. Store alarm reported.');
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
  fleeShop(view,view.clerk,0); // The clerk has already had time to react at the till.
}

export function updateClerk(view, sim, yaw, pitch, dt, work, {outside, palm, firstPerson=false, playerHand}={}) {
  const room=view.plan, p=sim.player, till=room.register, clerk=view.clerk;
  const active=sim.doorway===view && sim.room?.place?.id===room.place.id && !sim.ending && p.mode==='walk';
  const armed=active && p.armed && !sim.seat;
  const gunfire=roomUnderFire(view,sim.elapsed);
  const closed=work.isClosed(room.place);
  if (view.closed && !closed) {
    // A room can stay streamed in for the entire closure.
    for (const actor of view.actors) {
      if (actor.escape && !actor.gone) continue;
      const s=actor.spot, [x,z]=roomPoint(room,s.a,s.b), [fx,fz]=roomPoint(room,s.a+s.da,s.b+s.db);
      const sitting=room.seats.includes(s);
      if (sitting && active && sim.seat && Math.hypot(sim.seat.x-x,sim.seat.z-z)<.2) {
        actor.gone=true; view.occupied.delete(s); continue;
      }
      Object.assign(actor,{x,z,heading:Math.atan2(fx-x,fz-z),escape:null,robbery:null,gone:false,clip:null,from:null,stride:0,lift:s.lift||0,sitting,seat:sitting?s:null,
        dead:false,hp:3,wounds:0,wounded:false,state:null,reaction:null});
      if (actor.sitting) view.occupied.add(s);
    }
    view.handoff=null;
  }
  view.closed=closed;
  if (closed && !view.handoff) for (const actor of view.actors) actor.gone=true;
  if (!dt) return;
  let event=view.handoff;
  if (gunfire && event && event.phase!=='escaping') {
    event=view.handoff={phase:'escaping',age:0};
    if (view.take?.kind==='collect') view.take=null;
  }
  if (clerk && !clerk.gone && !clerk.escape && !clerk.dead && !event && !gunfire && armed && canNotice(view,p,clerk)) {
    event=view.handoff={phase:'startled',age:0,safeTime:0};
    sim._say('The clerk spots the pistol and raises their hands.');
  }
  // People who hear the commotion can flee alongside those who see the pistol.
  for(const visitor of view.visitors?.size ? view.visitors : [view.visitor])
    if(visitor?.visit && (gunfire || event || armed && canNotice(view,p,visitor))) fleeShop(view,visitor);
  for (const actor of view.actors) {
    if (actor.gone) continue;
    if (stepRoomInjury(view,actor,dt)) continue;
    if (!actor.escape && (gunfire || actor!==clerk && (event || armed && canNotice(view,p,actor)))) fleeShop(view,actor);
    if (actor.escape) stepEscape(view,actor,dt,outside,p);
    else if (actor.machine && !actor.serviceOwner && !(event && actor===clerk)) {
      const [x,z]=roomPoint(room,actor.machine.a,actor.machine.b);
      actor.heading=Math.atan2(x-actor.x,z-actor.z);
      actor.clip='reach';
      actor.time=.45+.32*Math.sin(sim.elapsed*2.2);
    }
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
    if (!view.take && (!active || event.safeTime>1.45 || closed && event.age>1)) {
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
      clerk.clip=taking?'pickUp':'giveCash';
      clerk.time=taking?clamp((event.age-.55)*.56,0,.51):mix(.34,.76,t);
      if (phase==='giving' && event.age<1.78) {
        clerk.from='pickUp'; clerk.fromTime=.51;
        clerk.fade=1-smooth((event.age-1.45)/.33);
      }
      const extension=taking?.52:.6;
      const grip=palm?.(clerk) || {x:clerk.x+Math.sin(clerk.heading)*extension,y:taking?drawer.y+.17:1.32,z:clerk.z+Math.cos(clerk.heading)*extension};
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
  const receipt=view.closed || view.handoff ? null : work.receipt?.(room.place) || null;
  const payingCash=receipt?.cash && sim.elapsed-receipt.at<.95;
  view.group.userData.updateTill(open||payingCash,cash,dt,firstPerson ? hand : null,p,
    open||payingCash ? work.balance(room.place) : 0,receipt);
}
