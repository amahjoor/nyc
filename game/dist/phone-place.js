import { punMode } from './business-puns.js';
import { bundledContact, cityRecord, contactLinks, resolveMapPlace } from './place-guide.js';
import { worldToGeographic } from './city-ground.js';
import { menuFor } from './menu.js';
import { placeReviews } from './place-reviews.js';

export function createPlaceSheet({$,click,storage,roll,previewScene,onResolved}) {
  const document=$('phone-place').ownerDocument;
  const reviewKey='nyc-place-reviews', previews=new Map();
  let place,record,request,tab,photos=[],index=0,key,attachment,notes=[];
  let reviews={};
  try {const saved=JSON.parse(storage?.getItem(reviewKey)||'{}');if(saved && typeof saved==='object')reviews=saved;}catch{}
  const element=id=>$('place-'+id);

  function photo(){
    const item=photos[index],shown=Boolean(item) && tab!=='reviews';
    element('figure').hidden=!shown;
    if(shown){
      const img=element('photo');
      if(img.getAttribute('src')!==item.src)img.setAttribute('src',item.src);
      img.alt=item.caption;
      element('caption').textContent=item.caption;
    }
    element('photo-controls').hidden=photos.length<2;
    element('photo-count').textContent=photos.length>1?`${index+1} of ${photos.length}`:'';
  }
  element('photo').addEventListener('error',()=>{
    if(element('photo').getAttribute('src')!==photos[index]?.src)return;
    photos.splice(index,1);index=Math.max(0,Math.min(index,photos.length-1));photo();visitors();
  });
  function overview(){
    const address=record?.address,{lat,lon}=worldToGeographic(place.x,place.z);
    element('address-label').textContent=address?'Address':'Map location';
    element('address').textContent=address || `${lat.toFixed(5)}° N, ${Math.abs(lon).toFixed(5)}° W`;
    const {number,tel,website}=contactLinks(record);
    element('phone-row').hidden=!number;element('web-row').hidden=!website;
    if(number){element('number').textContent=number;element('number').setAttribute('href',tel);}
    if(website){element('website').textContent=website.hostname.replace(/^www\./,'');element('website').setAttribute('href',website.href);}
    for(const field of ['cuisine','hours']){
      element(field+'-row').hidden=!record?.[field];element(field).textContent=record?.[field] || '';
    }
  }
  function visitors(){
    const ratings=notes.map(n=>n.stars),own=Number(reviews[key]?.stars);
    if(Number.isInteger(own) && own>=1 && own<=5)ratings.push(own);
    const mean=(ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1);
    element('rating').textContent=mean+' ★ · '+ratings.length;
    element('summary-rating').textContent=mean+' ★ · '+ratings.length+' in-game reviews';
    notes.forEach((note,i)=>{
      const id='visitor-'+i;
      $(id+'-name').textContent=note.author;$(id+'-stars').textContent='★'.repeat(note.stars)+'☆'.repeat(5-note.stars);
      $(id+'-text').textContent=note.text;
      const image=photos.find(p=>p.kind===note.subject);
      $(id+'-open').hidden=!image;
      if(image){
        $(id+'-photo').setAttribute('src',image.src);$(id+'-photo').alt=image.caption;
        $(id+'-open').setAttribute('aria-label','View photo · '+image.caption);
      }
    });
  }
  for(let i=0;i<3;i++)click('visitor-'+i+'-open',()=>{
    const found=photos.findIndex(p=>p.kind===notes[i]?.subject);
    if(found<0)return;
    index=found;changeTab('overview');$('phone-place').scrollTop=0;
    element(photos.length>1?'photo-next':'tab-overview').focus?.({preventScroll:true});
  });
  function syncVisitPhoto(){
    photos=photos.filter(item=>item.kind!=='visit');
    const image=reviews[key]?.image;
    if(image)photos.push({kind:'visit',caption:'Your visit',src:image});
    index=Math.max(0,Math.min(index,photos.length-1));
  }
  function review(){
    const own=reviews[key];
    if(notes.length)visitors();element('own-review').hidden=!own;
    element('write').textContent=own?'Edit your review':'Review your visit';
    if(own){
      element('own-stars').textContent='Your visit · '+'★'.repeat(own.stars);
      element('own-text').textContent=own.text;
      element('own-photo').hidden=!own.image;
      if(own.image)element('own-photo').setAttribute('src',own.image);
    }
  }
  function changeTab(next){
    tab=next;
    for(const name of ['overview','reviews']){
      element(name).hidden=name!==tab;element('tab-'+name).setAttribute('aria-pressed',String(name===tab));
    }
    photo();
    if(tab==='reviews')review();
  }
  function close(){request?.abort();place=null;}
  async function open(next){
    close();place=next;request=new AbortController();
    const active=request;
    key=JSON.stringify([place.registeredName ?? place.name,place.kind,place.x,place.z]);
    record=null;index=0;photos=[];tab='overview';$('phone-place').scrollTop=0;syncVisitPhoto();
    element('editor').hidden=true;
    if(document?.defaultView && String(next.id).startsWith('map/')){
      notes=[];element('figure').hidden=true;element('visitor-reviews').hidden=true;
      element('summary-rating').textContent='';
      overview();changeTab('overview');
      next=await resolveMapPlace(next,active.signal);
      if(active.signal.aborted)return;
      place=next;key=JSON.stringify([place.registeredName ?? place.name,place.kind,place.x,place.z]);syncVisitPhoto();onResolved(next);
    }
    element('visitor-reviews').hidden=false;
    const stock=menuFor(place),visits=placeReviews(place,stock);
    notes=visits.notes;
    overview();visitors();changeTab(tab);
    if(!document?.defaultView)return;
    if(!punMode || next.group==='public') (async()=>{
      let value=await bundledContact(next);
      if(active.signal.aborted)return;
      if(!value)value=await cityRecord(next,active.signal);
      if(!active.signal.aborted){record=value;overview();}
    })().catch(()=>{});
    try{
      const context=previewScene?.(place);
      if(!context)return;
      const cacheKey=key+(context.front?'|street':'|preview');
      let rendered=previews.get(cacheKey);
      if(!rendered){
        const {scenePhotos}=await import('./place-preview.js');
        if(active.signal.aborted)return;
        rendered=await scenePhotos(context,next,visits.featured,active.signal);
        if(active.signal.aborted)return;
        if(previews.size>=12)previews.delete(previews.keys().next().value);
        if(rendered.length)previews.set(cacheKey,rendered);
      }
      photos=rendered.slice();
    }catch(error){console.warn('Place photos unavailable',error);}
    finally{if(!active.signal.aborted){syncVisitPhoto();photo();visitors();}}

  }
  for(const tab of ['overview','reviews'])click('place-tab-'+tab,()=>changeTab(tab));
  for(const [name,step] of [['prev',-1],['next',1]])click('place-photo-'+name,()=>{
    if(photos.length){index=(index+step+photos.length)%photos.length;photo();}
  });
  click('place-write',()=>{
    const own=reviews[key];element('editor').hidden=false;element('stars').value=String(own?.stars || 5);
    element('draft').value=own?.text || '';element('save-status').textContent='';
    const select=element('attachment');select.replaceChildren();
    function option(value,label){const item=document.createElement('option');item.value=value;item.textContent=label;select.append(item);}
    option('','No photo');attachment=own?.image || '';
    if(attachment)option('keep','Keep attached photo');
    for(const item of roll())option(String(item.id),(item.facing==='selfie'?'Selfie':'Photo')+' · '+(item.time || '#'+item.id));
    select.value=attachment?'keep':'';
    element('draft').focus?.();
  });
  click('place-save',()=>{
    const selection=element('attachment').value, text=element('draft').value.trim().slice(0,600);
    const image=selection==='keep'?attachment:roll().find(p=>String(p.id)===selection)?.image || '';
    const stars=Number(element('stars').value);
    if(!Number.isInteger(stars)||stars<1||stars>5)return;
    const updated={...reviews,[key]:{text,stars,image}};
    try {storage?.setItem(reviewKey,JSON.stringify(updated));}catch{element('save-status').textContent='Storage is full. Try a review without a photo.';return;}
    reviews=updated;syncVisitPhoto();photo();element('editor').hidden=true;review();
  });
  return {open,close};
}
