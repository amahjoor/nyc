const $ = id => document.getElementById(id);
const metersToMiles = .000621371;
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
  update(sim) {
    const p=sim.player, driving=p.mode==='drive', mission=sim.mission;
    this.text('speed', String(Math.round(Math.abs(p.speed)*2.23694)).padStart(2,'0'));
    this.text('speed-unit', driving?'MPH':'ON FOOT');
    this.text('gear', driving ? p.speed < -.3 ? 'REVERSE' : Math.abs(p.speed) < .2 ? 'IDLE' : 'DRIVE' : 'FREE ROAM');
    this.text('cash', '$'+Math.round(sim.cash).toLocaleString('en-US'));
    this.text('deliveries', sim.deliveries+' DELIVERIES');
    this.text('distance', (sim.distanceTravelled*metersToMiles).toFixed(1)+' MI');
    this.text('health-number', String(Math.round(sim.health)));
    $('health-bar').style.width = Math.max(0,sim.health)+'%';
    this.text('street-name', sim.getStreet().toUpperCase());
    const stars = Math.min(3,Math.ceil(sim.heat));
    this.text('wanted-stars', '★'.repeat(stars)+'☆'.repeat(3-stars));
    this.text('wanted-label', stars ? 'LOSE THE POLICE' : 'KEEP IT CLEAN');
    const near = sim.getNearbyCar();
    $('interact-prompt').hidden = !driving && !near;
    $('interact-prompt').querySelector('span').textContent = driving ? Math.abs(p.speed)>4 ? 'SLOW DOWN TO EXIT' : 'EXIT VEHICLE' : near?.type==='taxi' ? 'GET IN THE CAB' : 'ENTER VEHICLE';
    $('toast').textContent = sim.notice || '';
    $('toast').classList.toggle('visible', Boolean(sim.notice && sim.noticeTime>0));
    const active=mission.phase==='active' && mission.target;
    if(active) {
      this.text('mission-kicker','SPECIAL DELIVERY');
      this.text('mission-title', mission.target.name);
      this.text('mission-description','Follow the orange marker. Slow to a stop inside the ring to make the drop.');
      this.text('mission-distance', Math.round(Math.hypot(p.x-mission.target.x,p.z-mission.target.z))+' M TO DROP');
      const sec=Math.max(0,Math.ceil(mission.timeLeft));
      this.text('mission-timer',Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'));
    } else {
      this.text('mission-kicker', mission.phase==='complete'?'DELIVERY COMPLETE':'THE NIGHT SHIFT');
      this.text('mission-title', mission.phase==='complete'?'Another block. Another dollar.':mission.phase==='failed'?'Next one’s yours.':'Make your first drop.');
      this.text('mission-description',mission.phase==='complete'?'Your payment is in. Keep exploring or pick up another delivery.':'Find a car and take a delivery job. The city is yours to explore.');
      this.text('mission-distance','FREE ROAM'); this.text('mission-timer','NO RUSH');
    }
    $('job-button').hidden=Boolean(active);
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
    for(const car of sim.cars) {
      if(car.id===sim.player.vehicleId) continue;
      const [x,y]=xy(car.x,car.z);c.fillStyle=car.type==='police'&&sim.heat>0?'#7dc3eb':'#eac877';c.fillRect(x-2,y-2,4,4);
    }
    const [px,py]=xy(sim.player.x,sim.player.z);c.translate(px,py);c.rotate(-sim.player.angle);c.fillStyle='#f8f2df';c.strokeStyle='#101918';c.lineWidth=3;c.beginPath();c.moveTo(0,11);c.lineTo(-7,-7);c.lineTo(0,-3);c.lineTo(7,-7);c.closePath();c.fill();c.stroke();
    c.restore();
  }
}
