import { blipColour, blipOf, blipSvg } from './map-blips.js';
import { geographicToWorld, NYC_BBOX } from './city-ground.js';
import { categoryOf } from './map-places.js';
import { KIND, placeName } from './places.js';
import { mapWorldToScreen } from './game-map.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const min=geographicToWorld(NYC_BBOX[0],NYC_BBOX[3]),max=geographicToWorld(NYC_BBOX[2],NYC_BBOX[1]);
const placeKey=p=>JSON.stringify([placeName(p),p.kind,p.x,p.z]);
export function createPhoneExplore({$,click,worldMap,locations,openPlace,summary}){
  const canvas=$('phone-map-preview'),surface=$('map-touch'),playerMarker=$('phone-map-player'),pointers=new Map();
  const pinLayer=$('phone-map-pins'),pins=new Map();
  let player=null,center=null,span=520,nearby=[],last,local=[],frame=0,dragged=false,gesture=null;
  const refresh=()=>{
    if(!last || frame || canvas.closest?.('[hidden]'))return;
    if(typeof requestAnimationFrame==='undefined'){paint(last);return;}
    frame=requestAnimationFrame(()=>{frame=0;if(!canvas.closest?.('[hidden]'))paint(last);});
  };
  let filter='all',keyOpen=false;
  const icons={all:null,eat:'american',coffee:'coffee',grocery:'supermarket',drinks:'bar',barber:'barber',beauty:'salon',clothes:'clothes',bank:'bank',laundry:'laundromat',health:'pharmacy',cars:'repair',stay:'hotel',public:'school',shops:'hardware'};
  const setKey=open=>{
    keyOpen=open;$('map-key-options').hidden=!open;$('map-key-toggle').setAttribute('aria-expanded',String(open));
  };
  click('map-key-toggle',()=>setKey(!keyOpen));
  for(const [id,kind] of Object.entries(icons)){
    const button=$('mobile-key-'+id),label=button.textContent;
    if(kind)button.insertAdjacentHTML?.('afterbegin',blipSvg(blipOf(kind),blipColour(kind),18));
    button.setAttribute('aria-pressed',String(id===filter));
    click(button.id,()=>{
      $('mobile-key-'+filter).setAttribute('aria-pressed','false');filter=id;
      button.setAttribute('aria-pressed','true');$('map-key-toggle').textContent=id==='all'?'Map key':'Map key · '+label;
      setKey(false);$('map-key-toggle').focus?.();refresh();
    });
  }
  const zoom=factor=>{span=clamp(span*factor,100,3600);refresh();};
  click('map-zoom-in',()=>zoom(1/1.6));click('map-zoom-out',()=>zoom(1.6));
  click('map-recenter',()=>{center=null;span=520;refresh();});
  const point=event=>({x:event.clientX,y:event.clientY});
  function rebase(){
    const [a,b]=pointers.values();
    if(!a || !last){gesture=null;return;}
    const mid=b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a;
    const rect=canvas.getBoundingClientRect(),c=center||player;
    gesture={mid,span,x:c.x,z:c.z,rect,gap:b?Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)):0};
  }
  surface.addEventListener('pointerdown',e=>{
    if(e.button!==0 || pointers.size>=2)return;
    if(!pointers.size)dragged=false;
    if(e.isTrusted)e.target.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,point(e));rebase();
  });
  surface.addEventListener('pointermove',e=>{
    if(!gesture || !pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,point(e));
    const [a,b]=pointers.values(),mid=b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a;
    const g=gesture,r=g.rect,dx=mid.x-g.mid.x,dy=mid.y-g.mid.y;
    if(!r.width || (!b && !dragged && Math.hypot(dx,dy)<4))return;
    dragged=true;
    if(b)span=clamp(g.span*g.gap/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),100,3600);
    const offsetX=g.mid.x-r.left-r.width/2,offsetY=g.mid.y-r.top-r.height/2;
    center={x:clamp(g.x+(offsetX*(g.span-span)-dx*span)/r.width,min.x,max.x),
      z:clamp(g.z+(offsetY*(g.span-span)-dy*span)/r.width,min.z,max.z)};
    refresh();
  });
  function end(e){if(pointers.delete(e.pointerId))rebase();}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,end);
  surface.ownerDocument?.addEventListener('pointerup',end);
  surface.addEventListener('click',e=>{if(dragged && e.detail){e.stopImmediatePropagation();dragged=false;}},true);
  surface.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.25:.8);},{passive:false});
  function updatePins(places,view,cellSize){
    const visible=new Map(),groups=new Map();
    for(const [key,place] of places){
      if(!cellSize){visible.set(key,place);continue;}
      const gx=Math.floor(place.x/cellSize),gz=Math.floor(place.z/cellSize);
      const id=`group/${cellSize}/${gx}/${gz}`;
      const group=groups.get(id);
      if(group){group.count++;group.x+=place.x;group.z+=place.z;}
      else groups.set(id,{key,place,count:1,x:place.x,z:place.z});
    }
    for(const [id,group] of groups){
      if(group.count===1)visible.set(group.key,group.place);
      else visible.set(id,{count:group.count,x:group.x/group.count,z:group.z/group.count});
    }
    // Stable geographic ordering keeps overlapping pins in the same stacking order.
    const ordered=[];
    for(const [key,place] of visible){
      const {x,y}=mapWorldToScreen(place,view);
      if(x < -17 || y < -17 || x > view.width+17 || y > view.height+17){visible.delete(key);continue;}
      ordered.push({key,place,x,y});
    }
    ordered.sort((a,b)=>a.y-b.y || a.x-b.x || a.key.localeCompare(b.key));
    for(const [order,{key,place,x,y}] of ordered.entries()){
      let pin=pins.get(key);
      if(!pin){
        const button=pinLayer.ownerDocument.createElement('button');
        button.type='button';
        pin={button,place};pins.set(key,pin);
        if(place.count)button.className='map-pin-group';
        else{
          button.innerHTML=blipSvg(blipOf(place.kind),blipColour(place.kind),24);
          button.setAttribute('aria-label',place.name || KIND[place.kind]?.label || 'Place');
        }
        click(button,()=>{
          if(pins.get(key)!==pin)return;
          if(!pin.place.count){openPlace(pin.place);return;}
          center={x:pin.place.x,z:pin.place.z};zoom(.5);
        });
        pinLayer.append(button);
      }
      pin.place=place;
      const button=pin.button;
      if(place.count && button.textContent!==String(place.count)){
        button.textContent=String(place.count);button.setAttribute('aria-label',`Zoom in on ${place.count} places`);
      }
      button.style.left=x/view.width*100+'%';button.style.top=y/view.height*100+'%';
      button.style.zIndex=String(order);
    }
    for(const [key,pin] of pins)if(!visible.has(key)){pin.button.remove();pins.delete(key);}
  }
  for(let i=0;i<3;i++)click('map-pick-'+i,()=>openPlace(nearby[i]));
  function paint(now){
    if(now!==last)local=locations();
    last=now;
    const map=worldMap?.();
    player=map?.transit?.marker || now;
    const c=center||player;
    const rect=canvas.getBoundingClientRect?.();
    const view=map?.drawPreview(canvas,span,c,{phone:true}) ||
      {x:c.x,z:c.z,span,width:rect?.width||300,height:rect?.height||230};
    const {width,height}=view,position=mapWorldToScreen(player,view);
    playerMarker.hidden=!(position.x>=0 && position.x<=width && position.y>=0 && position.y<=height);
    if(!playerMarker.hidden && playerMarker.style){
      playerMarker.style.left=position.x/width*100+'%';
      playerMarker.style.top=position.y/height*100+'%';
      playerMarker.style.transform=`translate(-50%,-50%) rotate(${-(map?.player?.angle || 0)}rad)`;
    }
    const bounds={minX:c.x-span/2,maxX:c.x+span/2,minZ:c.z-span*height/width/2,maxZ:c.z+span*height/width/2};
    // Query entire edge cells so panning cannot change a group's membership.
    // Use fixed world-grid sizes for each zoom band. At street detail every
    // business has its own icon, even in a building with several tenants.
    const cellSize=span<=200?0:2**Math.floor(Math.log2(28*span/width));
    const step=cellSize||1,margin=17*span/width;
    const query={minX:Math.floor((bounds.minX-margin)/step)*step,maxX:Math.ceil((bounds.maxX+margin)/step)*step,
      minZ:Math.floor((bounds.minZ-margin)/step)*step,maxZ:Math.ceil((bounds.maxZ+margin)/step)*step};
    const candidates=new Map();
    map?.placeLayer?.forEachWithin(query,filter==='all'?null:new Set([filter]),p=>{
      const kind=KIND[p.kindId];
      if(!kind)return;
      const place={name:p.name,x:p.door?.sourceX??p.x,z:p.door?.sourceZ??p.z,kind:kind.id,group:kind.group};
      place.id='map/'+place.x+'/'+place.z+'/'+kind.id;
      candidates.set(placeKey(place),place);
    });
    for(const p of local)if(filter==='all' || categoryOf(p.kind)===filter)candidates.set(placeKey(p),p);
    const inView=p=>p.x>=bounds.minX && p.x<=bounds.maxX && p.z>=bounds.minZ && p.z<=bounds.maxZ;
    nearby=[...candidates.values()].filter(p=>!center || inView(p))
      .sort((a,b)=>(a.x-c.x)**2+(a.z-c.z)**2-((b.x-c.x)**2+(b.z-c.z)**2)).slice(0,3);
    updatePins(candidates,view,cellSize);
    for(let i=0;i<3;i++){
      const p=nearby[i];$('map-pick-'+i).hidden=!p;
      if(p){const row=summary(p,now);$('map-pick-'+i+'-name').textContent=row.name;$('map-pick-'+i+'-note').textContent=row.note;}
    }
    $('phone-map-street').textContent=center?'In this area':now.street || 'Around you';
    $('map-no-results').hidden=nearby.length>0;
    $('map-scale').textContent=span>=1000?(span/1000).toFixed(1)+' km':Math.round(span)+' m';
    $('map-zoom-in').disabled=span<=100;$('map-zoom-out').disabled=span>=3600;
  }
  return {paint,enter(){pointers.clear();gesture=null;dragged=false;}};
}
