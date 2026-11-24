import { tripInstruction } from './driver-work.js';
import { GUN } from './player-moves.js';
import { formatMoney } from './money.js';
import { title } from './local-search.js';
import { isAircraft } from './transport-catalog.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(city) {
    this.city = city;
    this.mapPanel = $('map-panel');
    this.map = $('minimap'); this.ctx = this.map.getContext('2d');
    this.expanded = false;
    this.radarExpanded = false;
    this.lastHealth = null;
    this.gainAt = -Infinity;
    this.previous = {};
  }
  text(id, text) { if(this.previous[id] !== text) { $(id).textContent = text; this.previous[id] = text; } }
  attachMap(gameMap) { this.gameMap = gameMap; }
  toggleMap() {
    if (this.gameMap) { this.gameMap.toggle();this.expanded = this.gameMap.open;return; }
    this.expanded = !this.expanded;
    this.mapPanel.classList.toggle('expanded', this.expanded);
    $('map-button').setAttribute('aria-label', this.expanded ? 'Close expanded map' : 'Expand map');
    this.map.width = this.map.height = this.expanded ? 1000 : 440;
  }
  revealCash() {
    const cashDisplay = $('cash-display');
    cashDisplay.hidden = false;
    clearTimeout(this.cashTimer);
    this.cashTimer = setTimeout(() => { cashDisplay.hidden = true; }, 4000);
  }
  showStatus(balance, health = null, checking = 0) {
    this.text('hud-checking',formatMoney(checking));
    this.text('cash', formatMoney(balance));
    this.cashRoll = null;
    this.revealCash();
    if (health !== null) this.showHealth(health);
    this.setRadarExpanded(health !== null);
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.setRadarExpanded(false), 4000);
  }
  showCashGain(cents, balance, checking = 0) {
    this.text('hud-checking',formatMoney(checking));
    const now = performance.now(), to = Math.round(balance * 100);
    const from = this.cashRoll?.to === to - cents ? this.displayedCents : to - cents;
    this.cashRoll = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? null : { from, to, start: now };
    this.gainCents = now - this.gainAt < 750 ? this.gainCents + cents : cents;
    this.gainAt = now;
    this.revealCash();
    const gain = $('cash-gain');
    this.text('cash-gain', '+' + formatMoney(this.gainCents / 100));
    gain.hidden = false;
    gain.classList.remove('fading');
    this.updateCash(balance, now);
  }
  updateCash(balance, now = performance.now()) {
    const gain = $('cash-gain');
    if (!gain.hidden) {
      const age = now - this.gainAt;
      gain.classList.toggle('fading', age >= 2600);
      gain.hidden = age >= 3000;
    }
    if ($('cash-display').hidden) return;
    let cents = Math.round(balance * 100);
    const roll = this.cashRoll;
    if (roll && roll.to === cents && now - roll.start < 500) {
      const remaining = (1 - (now - roll.start) / 500) ** 3;
      const step = (roll.to - roll.from) % 100 === 0 ? 100 : 1;
      cents -= step * Math.round((roll.to - roll.from) * remaining / step);
    } else this.cashRoll = null;
    this.displayedCents = cents;
    this.text('cash', formatMoney(cents / 100));
  }
  setRadarExpanded(expanded) {
    this.radarExpanded = expanded;
    this.mapPanel.classList.toggle('radar-expanded', expanded);
  }
  showHealth(health) {
    const display = $('health-display');
    const value = Math.round(health);
    this.lastHealth = health;
    $('health-bar').value = value;
    display.hidden = false;
    clearTimeout(this.healthTimer);
    this.healthTimer = setTimeout(() => { display.hidden = true; }, 4000);
  }
  update(sim, aiming = false, cityRides = null) {
    const p=sim.player, driving=p.mode==='drive', passenger=p.mode==='passenger', mission=sim.mission;
    const ride=sim.transport?.active, flying=isAircraft(ride?.spec);
    const cycling=p.mode==='bike', skating=p.mode==='skate';
    $('touch-skate').hidden=Boolean(p.water || sim.subway || sim.room || sim.seat || sim.ending || !skating && p.mode!=='walk');
    $('touch-run').hidden=p.mode!=='walk' || Boolean(sim.seat || p.water);
    this.text('touch-skate',skating?'STEP OFF':'BOARD');
    $('touch-horn').hidden=!(cycling || driving) || Boolean(sim.ending || driving && sim.vehicle?.destroyed);
    this.text('touch-horn',cycling?'BELL':'HORN');
    this.text('touch-brake',skating?'POP / FLICK':p.mode==='walk'?'JUMP':'BRAKE');
    $('touch-climb').hidden=$('touch-descend').hidden=!flying&&!p.water;
    this.text('touch-climb',p.water?'SURFACE':'CLIMB');this.text('touch-descend',p.water?'DIVE':'DESCEND');
    $('touch-climb').setAttribute('aria-label',p.water?'Swim to the surface':'Climb');
    $('touch-descend').setAttribute('aria-label',p.water?'Dive':'Descend');
    const equipped=!sim.subway && p.mode==='walk' && p.armed && !sim.seat && !sim.ending;
    $('touch-brake').setAttribute('aria-label',skating?'Hold to load, release to ollie or swipe to flick':p.mode==='walk'?'Jump':'Brake');
    $('touch-brake').hidden=Boolean(flying || p.water || equipped || passenger);
    $('touch-fire').hidden=$('touch-aim').hidden=!equipped;
    $('touch-aim').setAttribute('aria-pressed',String(aiming));
    $('touch-reload').hidden=!equipped;
    $('touch-reload').disabled=Boolean(p.reloading>0 || !(p.rounds<GUN.rounds));
    const checking=sim.bank?.checking ?? 0;
    if(this.lastChecking!==undefined && (this.lastChecking!==checking || this.lastWallet!==sim.cash))this.revealCash();
    this.lastWallet=sim.cash;
    this.lastChecking=checking;
    if(!$('cash-display').hidden)this.text('hud-checking',formatMoney(checking/100));
    this.updateCash(sim.cash);
    if (this.lastHealth !== null && sim.health !== this.lastHealth && !sim.ending) this.showHealth(sim.health);
    this.lastHealth = sim.health;
    const dock=ride?.grounded && (ride.spec.kind==='boat'||ride.spec.floats) ? sim.transport.nearestLanding(p) : null;
    const dockDistance=dock ? Math.hypot(dock.berth.x-p.x,dock.berth.z-p.z) : 0;
    this.text('street-name',dock ? dock.place+' · '+(dockDistance < 29 ? 'DOCK' : Math.round(dockDistance)+' m') : flying ? ride.spec.name : title(sim.getStreet()));
    const police = sim.police, stars = police.stars, searching = Boolean(stars && police.state === 'search');
    this.text('wanted-stars', '★'.repeat(stars) + '☆'.repeat(5 - stars));
    this.text('wanted-label', police.arrest > .15 ? 'HANDS UP' : searching ? (police.searchRoom || police.known===null ? 'POLICE INVESTIGATING' : 'STAY OUT OF SIGHT') : stars > 1 ? 'LOSE THE COPS' : 'WANTED');
    // Stars show only while the police care. They are steady while you are seen
    // and flash while the police are searching; the bar is how long until they give up.
    $('wanted').classList?.toggle('calm', !stars);
    $('wanted').classList?.toggle('spotted', Boolean(stars && sim.spotted));
    $('wanted').classList?.toggle('searching', searching);
    const evade = $('wanted-evade');
    if (evade?.style) evade.style.width = searching && police.evadeTotal ? Math.round(100 * (1 - Math.max(0, police.evade) / police.evadeTotal)) + '%' : '0%';
    const trip=cityRides?.trip;
    $('ride-speed').hidden=!(passenger && trip?.phase==='traveling' && !trip.stopping && !sim.ending);
    if (!$('ride-speed').hidden) this.text('ride-speed-label',trip.car.rideHurry?'ASK FOR NORMAL SPEED':'ASK DRIVER TO HURRY');
    $('touch-equip').hidden = p.mode!=='walk' || Boolean(sim.seat || sim.subway);
    this.text('touch-equip',p.armed?'HOLSTER':'EQUIP');
    $('toast').textContent = sim.notice || '';
    $('toast').classList.toggle('visible', Boolean(sim.notice && sim.noticeTime>0));
    const active=mission.phase==='active' && mission.target;
    if(active) {
      this.text('mission-kicker', mission.kind==='driver'?'D RIDE · '+mission.customer.toUpperCase():mission.kind==='paper' ? 'PAPER ROUND · '+(mission.index+1)+'/'+mission.stops.length : mission.stage === 'pickup' ? 'FOOD PICKUP' : mission.meal ? 'FOOD DROP-OFF' : 'SPECIAL DELIVERY');
      this.text('mission-title', mission.target.name);
      this.text('mission-description', ['driver','courier'].includes(mission.kind)?tripInstruction(mission):mission.kind==='paper'?'Stop on foot or by bike. Press E to leave the bundle.':mission.meal ? `Stop at the marker to ${mission.stage === 'pickup' ? 'collect' : 'deliver'} the ${mission.meal.toLowerCase()}.` : 'Follow the orange marker. Slow to a stop inside the ring to make the drop.');
      this.text('mission-distance', Math.round(Math.hypot(p.x-mission.target.x,p.z-mission.target.z))+(mission.stage === 'pickup' || mission.stage === 'boarding' ? ' M TO PICKUP' : ' M TO DROP'));
      const sec=Math.max(0,Math.ceil(mission.timeLeft));
      this.text('mission-timer',Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'));
    } else {
      this.text('mission-kicker', mission.phase==='complete'?(mission.kind==='driver'?'RIDE COMPLETE':'DELIVERY COMPLETE'):'THE NIGHT SHIFT');
      this.text('mission-title', mission.phase==='complete'?'Another block. Another dollar.':mission.phase==='failed'?'Next one’s yours.':'Make your first drop.');
      this.text('mission-description',mission.phase==='complete'?'Your payment is in. Keep exploring or pick up another delivery.':'Find a car and take a delivery job. The city is yours to explore.');
      this.text('mission-distance','FREE ROAM'); this.text('mission-timer','NO RUSH');
    }
    $('mission-panel').classList?.toggle('idle', !active && mission.phase !== 'complete' && mission.phase !== 'failed');
    this.text('mission-number',String(sim.deliveries+1).padStart(2,'0'));
    this.drawMap(sim);
  }
  drawMap(sim) {
    if (this.gameMap) { this.gameMap.setCity(this.city);this.gameMap.update(sim, this.radarExpanded);return; }
    const c=this.ctx, size=this.map.width, {bounds,roads,buildings}=this.city;
    const span=this.expanded?Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)*1.1:this.radarExpanded?480:240;
    const scale=size/span;
    const center=this.expanded?{x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2}:sim.player;
    const xy=(x,z)=>[(x-center.x)*scale+size/2,(z-center.z)*scale+size/2];
    c.fillStyle=this.expanded?'#263e4a':'#242c2d'; c.fillRect(0,0,size,size);
    c.save();
    if(this.expanded&&this.city.boroughs){
      if(!this.boroughMap||this.boroughMap.width!==size){
        this.boroughMap=document.createElement('canvas');this.boroughMap.width=this.boroughMap.height=size;
        const map=this.boroughMap.getContext('2d');map.fillStyle='#536460';map.strokeStyle='#84918a';map.lineWidth=1;
        for(const borough of this.city.boroughs){
          map.beginPath();
          for(const polygon of borough.polygons)for(const ring of [polygon.outer,...(polygon.holes||[])]){
            ring.forEach(([x,z],i)=>{const [px,py]=xy(x,z);i?map.lineTo(px,py):map.moveTo(px,py);});map.closePath();
          }
          map.fill('evenodd');map.stroke();
        }
        map.fillStyle='#e7e9db';map.font='bold 15px Arial';map.textAlign='center';
        for(const borough of this.city.boroughs)if(borough.label){const [x,y]=xy(borough.label.x,borough.label.z);map.fillText(borough.name.toUpperCase(),x,y);}
      }
      c.drawImage(this.boroughMap,0,0);
    }
    c.fillStyle='#465151';
    for(const b of buildings) {
      if(!b.polygon.length)continue;
      c.beginPath();
      for(const ring of [b.polygon,...(b.holes||[])]){
        ring.forEach(([x,z],i)=>{const [px,py]=xy(x,z);i?c.lineTo(px,py):c.moveTo(px,py);});c.closePath();
      }
      c.fill('evenodd');
    }
    c.strokeStyle='#6d7772';c.lineCap='round';c.lineJoin='round';
    for(const r of roads) {
      c.lineWidth=Math.max(1,r.width*scale*.53);c.beginPath();r.points.forEach(([x,z],i)=>{const [px,py]=xy(x,z);i?c.lineTo(px,py):c.moveTo(px,py);});c.stroke();
    }
    const mission=sim.mission;
    if(mission.phase==='active'&&mission.target) {
      const [tx,ty]=xy(mission.target.x,mission.target.z),[px,py]=xy(sim.player.x,sim.player.z);
      c.strokeStyle='#ff996b';c.lineWidth=2;c.setLineDash([5,7]);c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();c.setLineDash([]);
      c.fillStyle='#ff794f';c.beginPath();c.arc(tx,ty,8,0,Math.PI*2);c.fill();c.strokeStyle='#191d20';c.lineWidth=3;c.stroke();
      // Keep distant destinations visible on the edge of the local map.
      const cx=Math.max(12,Math.min(size-12,tx)),cy=Math.max(12,Math.min(size-12,ty));
      if(cx!==tx||cy!==ty){c.beginPath();c.arc(cx,cy,6,0,Math.PI*2);c.fill();}
    }
    if (sim.heat > 0) {
      for (const car of sim.cars) {
        if (car.type !== 'police') continue;
        const [x, y] = xy(car.x, car.z);
        const px = Math.max(10, Math.min(size - 10, x)), py = Math.max(10, Math.min(size - 10, y));
        c.fillStyle = '#7ec8ff'; c.beginPath(); c.moveTo(px, py - 6); c.lineTo(px - 4.5, py + 4); c.lineTo(px + 4.5, py + 4); c.closePath(); c.fill();
      }
      for (const officer of sim.police?.officers || []) { const [x, y] = xy(officer.x, officer.z); c.fillStyle = '#7ec8ff'; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
    }
    for (const mark of sim.threats || []) {
      const [x, y] = xy(mark.x, mark.z);
      c.fillStyle = mark.kind === 'down' ? '#8d928a' : '#ff5d3c'; c.fillRect(x - 3, y - 3, 6, 6);
    }
    const [px,py]=xy(sim.player.x,sim.player.z);c.translate(px,py);c.rotate(-sim.player.angle);c.fillStyle='#f8f2df';c.strokeStyle='#101918';c.lineWidth=3;c.beginPath();c.moveTo(0,11);c.lineTo(-7,-7);c.lineTo(0,-3);c.lineTo(7,-7);c.closePath();c.fill();c.stroke();
    c.restore();
  }
}
