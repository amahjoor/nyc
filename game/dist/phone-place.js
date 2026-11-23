import * as guide from './place-guide.js';
import { worldToGeographic } from './city-ground.js';
import { menuFor } from './menu.js';
import { googlePlaceCard } from './place-google.js';

export function createPlaceSheet({$,click,storage,roll,previewScene}) {
  const document=$('phone-place').ownerDocument;
  const reviewKey='nyc-place-reviews', previews=new Map();
  let place,branch,record,request,tab,photos=[],index=0,googleStarted=false,key,attachment;
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
      const credit=element('credit');credit.textContent=item.artist || '';
      if(item.source)credit.setAttribute('href',item.source);else credit.removeAttribute('href');
      const license=element('license');license.hidden=!item.license;license.textContent=item.license || '';
      if(item.license)license.setAttribute('href',item.licenseUrl || item.source);
    }
    element('photo-count').textContent=photos.length?`${index+1} of ${photos.length}`:'No photos available';
    for(const id of ['photo-prev','photo-next'])element(id).disabled=photos.length<2;
  }
  element('photo').addEventListener('error',()=>{
    if(element('photo').getAttribute('src')!==photos[index]?.src)return;
    photos.splice(index,1);index=Math.max(0,Math.min(index,photos.length-1));photo();
  });
  function overview(){
    const address=record?.address || branch?.address;
    const {lat,lon}=worldToGeographic(place.x,place.z);
    element('address').textContent=address || `${lat.toFixed(5)}° N, ${Math.abs(lon).toFixed(5)}° W`;
    element('cuisine').textContent=record?.cuisine || '';
    element('city-source').hidden=!record;
    element('google-link').setAttribute('href',guide.mapsURL(place,address));
  }
  function review(){
    const own=reviews[key];
    element('own-review').hidden=!own;
    element('write').textContent=own?'Edit your review':'Review your visit';
    if(own){
      element('own-stars').textContent='Your visit · '+'★'.repeat(own.stars);
      element('own-text').textContent=own.text;
      element('own-photo').hidden=!own.image;
      if(own.image)element('own-photo').setAttribute('src',own.image);
    }
  }
  async function publicReviews(){
    if(googleStarted || !document?.defaultView)return;
    googleStarted=true;
    const active=request;
    element('review-status').textContent='Loading public reviews…';
    try {
      const widget=await googlePlaceCard(place,active.signal);
      if(active.signal.aborted)return;
      if(widget){
        widget.addEventListener('gmp-error',()=>{if(!active.signal.aborted)element('review-status').textContent='Open Google Maps below to see public reviews.';});
        element('google-card').replaceChildren(widget);
        element('review-status').textContent='';return;
      }
    }catch{}
    if(!active.signal.aborted)element('review-status').textContent='Open Google Maps below to see public reviews.';
  }
  function changeTab(next){
    tab=next;
    for(const name of ['overview','photos','reviews']){
      element(name).hidden=name!==tab;element('tab-'+name).setAttribute('aria-pressed',String(name===tab));
    }
    photo();
    if(tab==='reviews'){review();publicReviews();}
  }
  function close(){request?.abort();place=null;}
  async function open(next){
    close();place=next;request=new AbortController();
    const active=request;
    key=JSON.stringify([place.name,place.kind,place.x,place.z]);
    branch=null;record=null;googleStarted=false;index=0;photos=[];
    element('guide-review').hidden=true;
    element('google-card').replaceChildren?.();element('editor').hidden=true;element('review-status').textContent='';
    const stock=menuFor(place).slice(0,3);
    element('game-stock').textContent=stock.length?'In game · '+stock.map(row=>row.name).join(' · '):'';
    overview();changeTab('overview');
    if(!document?.defaultView)return;
    guide.cityRecord(next,active.signal).then(value=>{if(!active.signal.aborted){record=value;overview();}}).catch(()=>{});
    guide.editorialReview?.(next).then(entry=>{
      if(!entry || active.signal.aborted)return;
      element('guide-quote').textContent=entry.quote;
      element('guide-source').textContent='Wikivoyage contributors · '+entry.article.split('/').pop();
      element('guide-source').setAttribute('href','https://en.wikivoyage.org/w/index.php?oldid='+entry.revision);
      element('guide-review').hidden=false;
    });
    const featured=await guide.featuredBranch?.(next);
    if(active.signal.aborted)return;
    branch=featured;overview();
    photos=[...(featured?.photos || [])];
    if(!photos.length){
      let rendered=previews.get(key);
      if(!rendered){
        try{
          const context=previewScene?.(place);
          if(context){
            const {scenePhotos}=await import('./place-preview.js');
            if(active.signal.aborted)return;
            rendered=scenePhotos(context);
            if(previews.size>=12)previews.delete(previews.keys().next().value);
            if(rendered.length)previews.set(key,rendered);
          }
        }catch{}
      }
      photos=rendered?.slice() || [];
    }
    const aerial=guide.aerialPhoto?.(place);
    if(aerial)photos.push(aerial);
    photo();
  }
  for(const tab of ['overview','photos','reviews'])click('place-tab-'+tab,()=>changeTab(tab));
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
    reviews=updated;element('editor').hidden=true;review();
  });
  return {open,close};
}
