import { markerScale } from './map-places.js';
import { legGeometry } from './transit-network.js';
const inView=(s,b)=>s.x>=b.minX&&s.x<=b.maxX&&s.z>=b.minZ&&s.z<=b.maxZ;
const mode=line=>line.id.startsWith('rail:')?'Subway':'Bus';
export class TransitMap {
  constructor(map,listen,load){
    this.map=map;this.load=load;
    this.button=map.byId('game-map-transit');this.select=map.byId('transit-line');this.info=map.byId('transit-itinerary');
    this.guide=map.byId('transit-board-guide');this.skip=map.byId('transit-finish');
    this.active=false;this.filter='rail';this.shown=[];
    if(this.button)listen(this.button,'click',()=>this.setActive(!this.active));
    if(this.select)listen(this.select,'change',()=>{
      this.filter=this.select.value;
      const line=this.network?.lines.get(this.filter);
      if(line){
        const shapes=[...line.shapes],v=map.view;
        const x=Math.min(...shapes.map(s=>s.minX)),z=Math.min(...shapes.map(s=>s.minZ));
        const w=Math.max(...shapes.map(s=>s.maxX))-x,h=Math.max(...shapes.map(s=>s.maxZ))-z;
        Object.assign(v,{x:x+w/2,z:z+h/2,span:Math.max(650,w,h*v.width/v.height)*1.14});map.following=false;
      }
      this.refresh();map.draw();
    });
    if(this.guide)listen(this.guide,'click',()=>{const stop=this.trip?.legs[0]?.from;if(stop){map.onPin({...stop});map.setOpen(false);}});
    if(this.skip)listen(this.skip,'click',()=>this.finish?.());
  }
  setNetwork(network){
    if(this.network===network)return;
    this.network=network;
    if(this.select){
      this.select.replaceChildren();
      const option=(id,label)=>{const el=this.map.document.createElement('option');el.value=id;el.textContent=label;this.select.append(el);};
      option('rail','All subway lines');option('bus','All bus routes');
      for(const l of [...network.lines.values()].sort((a,b)=>mode(b).localeCompare(mode(a))||a.name.localeCompare(b.name,undefined,{numeric:true})))option(l.id,mode(l)+' · '+l.name+' · '+l.description);
      this.select.value=this.filter;
    }
    this.refresh();this.map.draw();
  }
  setActive(value){
    if(this.journey && !value)return;
    this.active=value;this.button?.setAttribute('aria-pressed',String(value));
    if(this.select)this.select.hidden=!value;
    if(this.map.pin&&!this.journey){this.map.onPin(value?null:{...this.map.pin});this.map.setStatus(this.map.pin.name);}
    this.map.listDoors();
    if(value&&!this.network&&this.load)this.load().then(n=>this.setNetwork(n)).catch(()=>{if(this.active)this.info.textContent='Transit routes could not load. Switch Transit off and on to retry.';});
    this.refresh();this.map.draw();
  }
  refresh(){
    const {map,info,guide}=this;
    if(!info||!guide||this.journey)return;
    guide.hidden=true;this.trip=null;info.textContent='';
    if(!this.active)return;
    if(!this.network){info.textContent='Loading transit routes…';return;}
    if(!map.pin){info.textContent='Choose a line to explore, or pin a destination for a transit itinerary.';return;}
    if(Math.hypot(map.pin.x-map.player.x,map.pin.z-map.player.z)<120){info.textContent='Your destination is within walking distance.';return;}
    const trip=this.trip=this.network.commute(map.player,map.pin);
    if(!trip){info.textContent='No connection within walking distance with two transfers or fewer.';return;}
    const steps=[];
    let previous=map.player;
    for(const leg of trip.legs){
      const walk=Math.round(Math.hypot(previous.x-leg.from.x,previous.z-leg.from.z));
      if(walk>15)steps.push('Walk about '+walk+' m to '+leg.from.name+'.');
      steps.push((steps.length&&previous!==map.player?'Transfer to ':'Board ')+leg.pattern.line.name+' toward '+leg.pattern.head+' at '+leg.from.name+' → '+leg.to.name);
      leg.points=legGeometry(this.network,leg);
      previous=leg.to;
    }
    info.textContent=steps.join('\n')+'\nWalk '+Math.round(trip.walk)+' m to '+map.pin.name+'.';
    guide.hidden=false;guide.textContent='Directions to '+trip.legs[0].from.name;
  }
  accepts(line){return line.id===this.filter||line.id.startsWith(this.filter+':');}
  hit(p){
    let nearest = null, distance = Math.max(4, 11 * markerScale(this.map.view.span));
    for (const entry of this.shown) {
      const d = Math.hypot(entry.x - p.x, entry.y - p.y);
      if (d < distance) { nearest = entry.stop;distance = d; }
    }
    return nearest;
  }
  paint(ctx,v,bounds){
    if(!this.active||!this.network)return;
    const scale=v.width/v.span,left=v.width/2-v.x*scale,top=v.height/2-v.z*scale;
    const at=(x,z)=>[left+x*scale,top+z*scale];
    
    const lines=this.journey?[this.journey.pattern.line]:[...this.network.lines.values()].filter(l=>this.accepts(l));
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(const line of lines){
      ctx.strokeStyle=line.color;ctx.lineWidth=this.journey?4:2.4;ctx.globalAlpha=this.trip ? .35 : 1;
      for(const s of line.shapes){
        if(s.minX>bounds.maxX||s.maxX<bounds.minX||s.minZ>bounds.maxZ||s.maxZ<bounds.minZ)continue;
        if(this.journey&&s!==this.journey.pattern.shape)continue;
        if(typeof Path2D==='function'){
          if(!s.path){s.path=new Path2D();s.points.forEach(([x,z],i)=>i?s.path.lineTo(x,z):s.path.moveTo(x,z));}
          ctx.save();ctx.translate(left,top);ctx.scale(scale,scale);ctx.lineWidth/=scale;ctx.stroke(s.path);ctx.restore();
        }else{
          ctx.beginPath();s.points.forEach(([x,z],i)=>i?ctx.lineTo(...at(x,z)):ctx.moveTo(...at(x,z)));ctx.stroke();
        }
      }
    }
    ctx.globalAlpha=1;
    if(this.trip){
      const stroke=(points,color,width)=>{
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
        points.forEach(([x,z],i)=>i?ctx.lineTo(...at(x,z)):ctx.moveTo(...at(x,z)));ctx.stroke();
      };
      let last=this.map.player;
      const walk=(a,b)=>{ctx.setLineDash([4,5]);stroke([[a.x,a.z],[b.x,b.z]],'#fff4d9',2);ctx.setLineDash([]);};
      for(const leg of this.trip.legs){
        walk(last,leg.from);
        stroke(leg.points,'#172329',7);stroke(leg.points,leg.pattern.line.color,4);
        last=leg.to;
      }
      walk(last,this.map.pin);
    }
    const important=new Set(this.trip?.legs.flatMap(l=>[l.from,l.to])||[]);
    if(this.journey){important.add(this.journey.origin);important.add(this.journey.destination);}
    this.shown=[];const labels=new Set();
    const drawStop=s=>{
      if(!inView(s,bounds))return;
      const [x,y]=at(s.x,s.z);this.shown.push({x,y,stop:s});
      ctx.beginPath();ctx.arc(x,y,important.has(s)?5:Math.max(1.5,3*markerScale(v.span)),0,Math.PI*2);ctx.fillStyle='#fff6dd';ctx.fill();
      ctx.strokeStyle='#192630';ctx.lineWidth=1.3;ctx.stroke();
      const key=Math.floor(x/120)+','+Math.floor(y/22);
      if((v.span<2400||important.has(s))&&!labels.has(key)){
        ctx.font='600 11px sans-serif';ctx.textAlign='left';ctx.lineWidth=3;ctx.strokeStyle='#172329';
        ctx.strokeText?.(s.name,x+7,y-4);ctx.fillStyle='#fff6dd';ctx.fillText(s.name,x+7,y-4);labels.add(key);
      }
    };
    for(const s of important)drawStop(s);
    if(!this.journey)for(const s of this.network.stops){
      if(!important.has(s)&&inView(s,bounds)&&[...s.lines].some(l=>this.accepts(l)))drawStop(s);
    }
    if(this.marker){
      ctx.beginPath();ctx.arc(...at(this.marker.x,this.marker.z),7,0,Math.PI*2);
      ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#0089bc';ctx.lineWidth=4;ctx.stroke();
    }
    ctx.restore();
  }
  startRide(journey,finish){
    this.journey=journey;this.finish=finish;this.map.setOpen(true);this.setActive(true);
    this.filter=journey.pattern.line.id;this.select.value=this.filter;this.select.disabled=true;
    this.guide.hidden=true;this.skip.hidden=false;this.skip.focus();this.trip=null;this.map.following=false;this.map.setBusy(true);
    this.map.view.span=2200;this.updateRide(journey.time);
  }
  updateRide(clock){
    this.marker=this.journey.at(clock);
    this.map.view.x=this.marker.x;this.map.view.z=this.marker.z;
    const status=this.journey.pattern.line.name+' toward '+this.journey.pattern.head+' · Next stop: '+this.marker.next+'\nGetting off at '+this.journey.destination.name;
    if(this.info.textContent!==status)this.info.textContent=status;
    this.map.draw();
  }
  endRide(){
    this.journey=null;this.marker=null;this.finish=null;this.skip.hidden=true;this.select.disabled=false;this.map.setBusy(false);this.refresh();
  }
}
