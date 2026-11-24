import { blipColour, blipOf, blipSvg } from './map-blips.js';
import { geographicToWorld, NYC_BBOX } from './city-ground.js';
import { categoryOf } from './map-places.js';
import { KIND } from './places.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const min=geographicToWorld(NYC_BBOX[0],NYC_BBOX[3]),max=geographicToWorld(NYC_BBOX[2],NYC_BBOX[1]);
const PIN_COUNT=12;
export function createPhoneExplore({$,click,worldMap,locations,openPlace,summary}){
  const canvas=$('phone-map-preview'),surface=$('map-touch'),pointers=new Map();
  let center=null,span=520,shown=[],nearby=[],last,local=[],frame=0,dragged=false,gesture=null;
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
    const rect=canvas.getBoundingClientRect(),c=center||last;
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
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.25:.8);},{passive:false});
  for(let i=0;i<PIN_COUNT;i++)click('map-pin-'+i,()=>openPlace(shown[i]?.place));
  for(let i=0;i<3;i++)click('map-pick-'+i,()=>openPlace(nearby[i]));
  function paint(now){
    if(now!==last)local=locations();
    last=now;
    const c=center||now,map=worldMap?.(),view=map?.drawPreview(canvas,span,c,false);
    const rect=canvas.getBoundingClientRect?.(),width=view?.width||rect?.width||300,height=view?.height||rect?.height||230;
    const bounds={minX:c.x-span/2,maxX:c.x+span/2,minZ:c.z-span*height/width/2,maxZ:c.z+span*height/width/2};
    const cells=new Map(),candidates=new Map(),id=p=>JSON.stringify([p.name,p.x,p.z]);
    map?.placeLayer?.forEachWithin(bounds,filter==='all'?null:new Set([filter]),p=>{
      const kind=KIND[p.kindId];
      if(kind)candidates.set(id(p),{name:p.name,x:p.x,z:p.z,kind:kind.id,group:kind.group,id:'map/'+p.x+'/'+p.z+'/'+kind.id});
    });
    for(const p of local)if(filter==='all' || categoryOf(p.kind)===filter)candidates.set(id(p),p);
    const ranked=[...candidates.values()].map(place=>({place,distance:(place.x-c.x)**2+(place.z-c.z)**2})).sort((a,b)=>a.distance-b.distance);
    nearby=[];
    for(const {place} of ranked){
      const x=(place.x-c.x)*width/span+width/2,y=(place.z-c.z)*width/span+height/2;
      if(nearby.length<3 && (!center || (x>=0 && x<=width && y>=0 && y<=height)))nearby.push(place);
      if(x<13 || x>width-13 || y<13 || y>height-13 || (x>width-50 && y>height-134))continue;
      const cell=Math.floor(x/(width/4))+','+Math.floor(y/(height/3));
      if(!cells.has(cell) && [...cells.values()].every(p=>Math.hypot(x-p.x,y-p.y)>30))cells.set(cell,{place,x,y});
      if(cells.size===PIN_COUNT && nearby.length===3)break;
    }
    shown=[...cells.values()];
    for(let i=0;i<PIN_COUNT;i++){
      const pin=$('map-pin-'+i),p=shown[i];
      pin.hidden=!p;
      if(!p)continue;
      if(pin.style){pin.style.left=p.x/width*100+'%';pin.style.top=p.y/height*100+'%';}
      if(pin.getAttribute('data-kind')!==p.place.kind){pin.innerHTML=blipSvg(blipOf(p.place.kind),blipColour(p.place.kind),24);pin.setAttribute('data-kind',p.place.kind);}
      pin.setAttribute('aria-label',p.place.name||KIND[p.place.kind]?.label||'Place');
    }
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
