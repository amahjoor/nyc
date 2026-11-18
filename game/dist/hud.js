import { GUN } from './player-moves.js';
import {carCondition} from './vehicle-damage.js';
import { formatMoney } from './money.js';
import { title } from './local-search.js';
import { vehicleName } from './fleet.js';
import { isAircraft } from './transport-catalog.js';

const $ = id => document.getElementById(id);
const metersToMiles = .000621371;
function transportExitLabel(ride, dockDistance) {
  if (ride.line) return ride.grounded ? 'GET OFF AT STATION' : 'EXIT AT NEXT STATION';
  if (!ride.grounded) return 'LAND TO GET OUT';
  if (dockDistance >= 29) return 'DOCK TO GET OUT';
  if (Math.abs(ride.speed) > 1.2) return 'SLOW DOWN TO GET OUT';
  return 'GET OUT';
}

export class HUD {
  constructor(city) {
    this.city = city;
    this.map = $('minimap'); this.ctx = this.map.getContext('2d');
    this.expanded = false;
    this.previous = {};
  }
  text(id, text) { if(this.previous[id] !== text) { $(id).textContent = text; this.previous[id] = text; } }
  attachMap(gameMap) { this.gameMap = gameMap; }
  toggleMap() {
    if (this.gameMap) { this.gameMap.toggle();this.expanded = this.gameMap.open;return; }
    this.expanded = !this.expanded;
    $('map-panel').classList.toggle('expanded', this.expanded);
    $('map-button').setAttribute('aria-label', this.expanded ? 'Close expanded map' : 'Expand map');
    this.map.width = this.map.height = this.expanded ? 1000 : 440;
  }
  showCash(balance) {
    const display = $('cash-display');
    this.text('cash', formatMoney(balance));
    display.hidden = false;
    clearTimeout(this.cashTimer);
    this.cashTimer = setTimeout(() => { display.hidden = true; }, 4000);
  }
  update(sim, canSit = false, register = null, aiming = false) {
    const p=sim.player, driving=p.mode==='drive', mission=sim.mission;
    const ride=sim.transport?.active, boarding=sim.transport?.nearby(), flying=isAircraft(ride?.spec);
    const knots=flying||ride?.spec.kind==='boat';
    this.text('speed', String(Math.round(Math.abs(p.speed)*(knots?1.94384:2.23694))).padStart(2,'0'));
    const cycling=p.mode==='bike';
    this.text('speed-unit', knots?'KT':ride||driving||cycling?'MPH':'ON FOOT');
    this.text('gear', flying ? Math.round(Math.max(0,p.y)*3.28084)+' FT' : ride ? ride.spec.name.toUpperCase() : cycling?'CITI BIKE':driving ? p.speed < -.3 ? 'REVERSE' : Math.abs(p.speed) < .2 ? 'IDLE' : 'DRIVE' : p.armed ? (p.reloading > 0 ? 'RELOADING' : 'PISTOL ' + (p.rounds ?? GUN.rounds)) : 'FREE ROAM');
    $('touch-climb').hidden=$('touch-descend').hidden=!flying;
    const equipped=p.mode==='walk' && p.armed && !sim.seat && !sim.ending;
    $('touch-brake').hidden=Boolean(flying || equipped);
    $('touch-fire').hidden=$('touch-aim').hidden=!equipped || Boolean(sim.room);
    $('touch-aim').setAttribute('aria-pressed',String(aiming));
    $('touch-reload').hidden=!equipped;
    $('touch-reload').disabled=Boolean(p.reloading>0 || !(p.rounds<GUN.rounds));
    if (!$('cash-display').hidden) this.text('cash', formatMoney(sim.cash));
    this.text('deliveries', sim.deliveries+' DELIVERIES');
    this.text('distance', (sim.distanceTravelled*metersToMiles).toFixed(1)+' MI');
    const condition = driving && sim.vehicle ? carCondition(sim.vehicle) : Math.round(sim.health);
    this.text('health-label', driving ? 'CAR CONDITION' : 'CONDITION');
    this.text('health-number', String(condition));
    $('health-bar').style.width = Math.max(0,condition)+'%';
    const dock=ride?.grounded && (ride.spec.kind==='boat'||ride.spec.floats) ? sim.transport.nearestLanding(p) : null;
    const dockDistance=dock ? Math.hypot(dock.berth.x-p.x,dock.berth.z-p.z) : 0;
    this.text('street-name',dock ? dock.place+' · '+(dockDistance < 29 ? 'DOCK' : Math.round(dockDistance)+' m') : flying ? ride.spec.name : title(sim.getStreet()));
    const police = sim.police, stars = Math.min(5, Math.ceil(sim.heat - 1e-9)), searching = Boolean(stars && police?.state === 'search');
    this.text('wanted-stars', '★'.repeat(stars) + '☆'.repeat(5 - stars));
    this.text('wanted-label', police?.arrest > .15 ? 'HANDS UP' : searching ? (police.cornered ? 'THEY KNOW WHERE YOU ARE' : 'STAY OUT OF SIGHT') : stars > 1 ? 'LOSE THE COPS' : 'WANTED');
    // Stars show only while the police care. They are steady while you are seen
    // and flash while the police are searching; the bar is how long until they give up.
    $('wanted').classList?.toggle('calm', !stars);
    $('wanted').classList?.toggle('spotted', Boolean(stars && sim.spotted));
    $('wanted').classList?.toggle('searching', searching);
    const evade = $('wanted-evade');
    if (evade?.style) evade.style.width = searching && police.evadeTotal ? Math.round(100 * (1 - Math.max(0, police.evade) / police.evadeTotal)) + '%' : '0%';
    const near = sim.getNearbyCar();
    const bike = sim.getNearbyBike(near);
    const moving = Math.hypot(p.velocityX || 0, p.velocityZ || 0) > 4;
    const punching = p.mode==='walk' && !sim.room && !boarding && !bike && !near && (sim.melee || p.armed);
    const prompt = $('interact-prompt');
    const interactLabel = sim.seat ? 'STAND' : register==='collect' ? 'COLLECT CASH' : register==='drawer' ? 'TAKE TILL CASH' : canSit ? 'SIT' : null;
    $('touch-equip').hidden = p.mode!=='walk' || Boolean(sim.seat);
    this.text('touch-equip',p.armed?'HOLSTER':'EQUIP');
    prompt.hidden = !interactLabel && !ride && !boarding && !driving && !cycling && !bike && !near && !punching;
    prompt.querySelector('kbd').textContent = punching && !interactLabel ? 'F' : 'E';
    const enterLabel = near?.identity ? 'ENTER ' + vehicleName(near.identity).toUpperCase() : 'ENTER VEHICLE';
    prompt.querySelector('span').textContent = interactLabel || (ride ? transportExitLabel(ride,dockDistance) : boarding ? 'BOARD '+boarding.spec.name.toUpperCase() : cycling ? 'GET OFF BIKE' : bike ? 'RIDE CITI BIKE' : driving ? (moving ? 'BAIL OUT' : 'EXIT VEHICLE') : near ? (near.type === 'taxi' ? 'GET IN THE CAB' : enterLabel) : p.armed ? 'SHOOT' : 'PUNCH');
    this.text('touch-enter', interactLabel || (ride||driving||cycling?'EXIT':boarding?'BOARD':'ENTER'));
    $('toast').textContent = sim.notice || '';
    $('toast').classList.toggle('visible', Boolean(sim.notice && sim.noticeTime>0));
    const active=mission.phase==='active' && mission.target;
    if(active) {
      this.text('mission-kicker', mission.stage === 'pickup' ? 'FOOD PICKUP' : mission.meal ? 'FOOD DROP-OFF' : 'SPECIAL DELIVERY');
      this.text('mission-title', mission.target.name);
      this.text('mission-description', mission.meal ? `Stop at the marker to ${mission.stage === 'pickup' ? 'collect' : 'deliver'} the ${mission.meal.toLowerCase()}.` : 'Follow the orange marker. Slow to a stop inside the ring to make the drop.');
      this.text('mission-distance', Math.round(Math.hypot(p.x-mission.target.x,p.z-mission.target.z))+(mission.stage === 'pickup' ? ' M TO PICKUP' : ' M TO DROP'));
      const sec=Math.max(0,Math.ceil(mission.timeLeft));
      this.text('mission-timer',Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'));
    } else {
      this.text('mission-kicker', mission.phase==='complete'?'DELIVERY COMPLETE':'THE NIGHT SHIFT');
      this.text('mission-title', mission.phase==='complete'?'Another block. Another dollar.':mission.phase==='failed'?'Next one’s yours.':'Make your first drop.');
      this.text('mission-description',mission.phase==='complete'?'Your payment is in. Keep exploring or pick up another delivery.':'Find a car and take a delivery job. The city is yours to explore.');
      this.text('mission-distance','FREE ROAM'); this.text('mission-timer','NO RUSH');
    }
    $('mission-panel').classList?.toggle('idle', !active && mission.phase !== 'complete' && mission.phase !== 'failed');
    this.text('mission-number',String(sim.deliveries+1).padStart(2,'0'));
    this.drawMap(sim);
  }
  drawMap(sim) {
    if (this.gameMap) { this.gameMap.setCity(this.city);this.gameMap.update(sim);return; }
    const c=this.ctx, size=this.map.width, {bounds,roads,buildings}=this.city;
    const span=this.expanded?Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)*1.1:240;
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
