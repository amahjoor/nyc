import { icon,collectionIcon } from './icons.js';
import { foodEntries } from './food.js';
import { studio,thumbnails } from './studio.js';

const $=id=>document.getElementById(id);
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;};
for(const node of document.querySelectorAll('[data-icon]'))node.innerHTML=icon(node.dataset.icon);
const number=new Intl.NumberFormat(),perPage=12;
const reviewKey='nyc-render-atlas.reviews.v1';
let flags={};try{const stored=JSON.parse(localStorage.getItem(reviewKey));if(stored && typeof stored==='object'&&!Array.isArray(stored))flags=stored;}catch{}
const hasFlag=id=>Object.hasOwn(flags,id);
function saveFlags(){try{localStorage.setItem(reviewKey,JSON.stringify(flags));}catch{notify('Browser storage is unavailable. Flags will last for this session.');}}
let noticeTimer;
function notify(message){clearTimeout(noticeTimer);$('notice').hidden=false;$('notice').textContent=message;noticeTimer=setTimeout(()=>{$('notice').hidden=true;},4200);}

let entries=[],results=[],collection='All assets',selected=null,variant='',page=0,serial=0,viewer,wire=false,grid=true;
let comparing=false,otherId='',secondary,otherSerial=0;
const thumbs=thumbnails();
const categories=['Prepared food','Drinks','Groceries','Merchandise','Archive fashion','Interiors','Fixtures','Service scenes','People','Vehicles','Transport','Street furniture','Landmarks'];
const featured=['Spring rolls','Ramen','Iced coffee','Acoustic guitar · Honey','Ridgeline spring water','Gold solitaire','Bagel with lox','Handset · Slate','Cheeseburger','Skateboard','Lamb gyro','Strip steak'];
function priority(name){const i=featured.indexOf(name);return i<0?featured.length:i;}
const query=()=>new URLSearchParams(location.hash.slice(1));
const compact=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function sections(){
  const counts=new Map();
  for(const e of entries)counts.set(e.collection,(counts.get(e.collection)||0)+1);
  const groups=['All assets',...new Set([...categories,...counts.keys()].filter(c=>counts.has(c)))];
  const nav=$('collections'),mobile=$('mobile-collection');nav.replaceChildren();mobile.replaceChildren();
  function option(value,count){
    const opt=el('option','',value+' ('+number.format(count)+')');opt.value=value;mobile.append(opt);
  }
  for(const group of groups){
    const count=counts.get(group)||entries.length;
    const button=el('button','nav-row');button.type='button';
    button.innerHTML=icon(group==='All assets'?'grid':collectionIcon(group));
    button.append(el('span','',group),el('small','',number.format(count)));button.setAttribute('aria-pressed',collection===group);
    button.addEventListener('click',()=>filter(group));nav.append(button);option(group,count);
  }
  const n=entries.reduce((sum,e)=>sum+Number(hasFlag(e.id)),0);
  $('flag-count').textContent=number.format(n);$('flag-filter').setAttribute('aria-pressed',collection==='Flagged assets');option('Flagged assets',n);mobile.value=collection;
}
function updateHash(){
  const params=new URLSearchParams();
  if(selected){params.set('asset',selected.id);if(variant!==selected.variants[0].id)params.set('state',variant);}
  if(comparing && otherId)params.set('compare',otherId);
  if(collection!=='All assets')params.set('collection',collection);
  if($('search').value)params.set('q',$('search').value);
  if($('sort').value!=='featured')params.set('sort',$('sort').value);
  history.replaceState(null,'',location.pathname+location.search+(params.size?'#'+params:''));
}
function currentResults(){
  const terms=compact($('search').value).trim().split(/\s+/).filter(Boolean);
  results=entries.filter(e=>(collection==='All assets'||(collection==='Flagged assets'?hasFlag(e.id):e.collection===collection))&&terms.every(w=>e.search.includes(w)));
  const sort=$('sort').value;
  if(terms.length&&sort==='featured'){
    const score=e=>{const title=compact(e.name);return title===terms.join(' ')?3:title.startsWith(terms.join(' '))?2:terms.every(t=>title.includes(t))?1:0;};
    results.sort((a,b)=>score(b)-score(a));
  }
  if(sort==='az'||sort==='za')results.sort((a,b)=>(sort==='az'?1:-1)*a.name.localeCompare(b.name,undefined,{numeric:true}));
}
function filter(group){collection=group;page=0;sections();refresh();}
function refresh(prefer,preferredVariant){
  currentResults();
  const e=results.find(r=>r.id===prefer)||(!prefer&&results.find(r=>r.id===selected?.id))||results[0];
  if(e){page=Math.floor(results.indexOf(e)/perPage);select(e,preferredVariant??(e===selected?variant:undefined),false);}
  else{selected=null;serial++;stopComparison();viewer?.remove();$('inspection').hidden=true;page=0;}
  cards();updateHash();
}
function cards(){
  const start=page*perPage,visible=results.slice(start,start+perPage),host=$('cards'),jobs=[];
  $('library-title').textContent=collection==='All assets'?'Asset library':collection;
  $('total').textContent=number.format(results.length);host.replaceChildren();
  for(const e of visible){
    const button=el('button','card');button.setAttribute('aria-pressed',e===selected);button.dataset.asset=e.id;
    const thumb=el('span','thumb');thumb.innerHTML=icon(collectionIcon(e.collection));button.append(thumb);
    const info=el('span','card-info');info.append(el('span','card-title',e.name),el('span','card-cat',e.caption||e.collection));button.append(info);
    if(e===selected){const check=el('span','selected-mark');check.innerHTML=icon('check');button.append(check);}
    if(hasFlag(e.id)){const flag=el('span','flag-mark');flag.innerHTML=icon('flag');button.append(flag);}
    button.addEventListener('click',()=>{select(e,e===selected?variant:undefined);if(matchMedia('(max-width:810px)').matches)$('inspection').scrollIntoView({block:'start'});});
    host.append(button);jobs.push({entry:e,element:thumb});
  }
  if(viewer)thumbs(jobs);
  $('empty').hidden=!!results.length;
  $('empty-info').textContent=collection==='Flagged assets'&&!$('search').value?'Flag an asset in the inspector to keep it here.':'Try a different name, business, or model ID.';
  $('pages').hidden=results.length<=perPage;
  $('range').textContent=number.format(start+1)+'–'+number.format(Math.min(start+perPage,results.length))+' of '+number.format(results.length);
  $('page').textContent=(page+1)+' / '+Math.ceil(results.length/perPage);
  $('prev').disabled=page===0;$('next').disabled=start+perPage>=results.length;
}
function flagUI(){
  if(!selected)return;
  const yes=hasFlag(selected.id);
  $('flag').setAttribute('aria-pressed',yes);$('flag').querySelector('span').textContent=yes?'Flagged for review':'Flag for review';
  $('note-label').hidden=!yes;$('note').value=yes?flags[selected.id]:'';
}
function variantUI(e){
  const host=$('variants');host.replaceChildren();$('variant-title').textContent=e.collection==='Prepared food'||e.collection==='Drinks'?'Serving state':e.collection==='Interiors'?'Footprint / view':e.collection==='Archive fashion'?'Shown':'Model variant';
  if(e.variants.length>6){
    const selectBox=el('select');selectBox.setAttribute('aria-label','Model variant');
    for(const v of e.variants){const opt=el('option','',v.label);opt.value=v.id;selectBox.append(opt);}
    selectBox.value=variant;selectBox.onchange=()=>select(e,selectBox.value,false);host.append(selectBox);
  }else for(const v of e.variants){
    const b=el('button','',v.label);b.type='button';b.setAttribute('aria-pressed',v.id===variant);b.onclick=()=>select(e,v.id,false);host.append(b);
  }
}
function facts(e,m){
  const list=$('facts');list.replaceChildren();
  const dim=m?.size.toArray(),small=dim&&Math.max(...dim)<1;
  const dims=dim?dim.map(n=>small?(n*100).toFixed(1):n.toFixed(2)).join(' × ')+(small?' cm':' m'):'—';
  for(const [key,val] of [['Model ID',e.model||e.id],['Source',e.source],['Triangles',m?number.format(m.triangles):'—'],['Bounds',dims]]){
    const dd=el('dd','',val);
    if(key==='Source'&&/^[a-z0-9/_.-]+\.(js|json)$/i.test(val)){
      const link=el('a','',val);link.href=new URL('../'+val,import.meta.url);link.target='_blank';link.rel='noopener';dd.replaceChildren(link);
    }
    list.append(el('dt','',key),dd);
  }
}
function stopComparison(){
  comparing=false;otherId='';otherSerial++;secondary?.remove();
  $('comparison-canvas').hidden=true;$('compare-pick').hidden=true;$('compare-labels').hidden=true;
  $('stage').classList.remove('comparing');$('compare').setAttribute('aria-pressed',false);
}
async function compareWith(requested){
  const entry=selected;
  if(!viewer||!entry||entry.variants.length<2)return;
  try{
    secondary??=studio($('comparison-canvas'));
  }catch{notify('Another WebGL viewport is unavailable.');stopComparison();updateHash();return;}
  comparing=true;
  const options=entry.variants.filter(v=>v.id!==variant);
  const other=options.find(v=>v.id===requested)||options[0];
  otherId=other.id;const task=++otherSerial;
  $('comparison-canvas').hidden=false;$('compare-labels').hidden=false;$('compare-pick').hidden=false;
  $('compare').setAttribute('aria-pressed',true);$('stage').classList.add('comparing');
  const pick=$('compare-state');pick.replaceChildren();
  for(const v of options){const opt=el('option','',v.label);opt.value=v.id;pick.append(opt);}pick.value=otherId;
  $('label-a').textContent=entry.variants.find(v=>v.id===variant).label;$('label-b').textContent='Loading…';updateHash();
  secondary.remove();
  try{
    const model=await entry.build(other.id);if(task!==otherSerial){entry.dispose?.(model);return;}
    secondary.set(entry,model);secondary.wire(wire);secondary.grid(grid);secondary.match(viewer.pose());
    secondary.onChange(p=>viewer.match(p));$('label-b').textContent=other.label;
  }catch(err){if(task===otherSerial){$('label-b').textContent='Preview unavailable';notify(err.message);}}
}
$('compare').onclick=()=>{if(comparing){stopComparison();updateHash();}else void compareWith();};
$('compare-state').onchange=e=>void compareWith(e.target.value);
async function select(e,id,redrawCards=true){
  const previous=selected,oldVariant=variant;
  const retained=previous===e?viewer?.pose():null;
  if(previous!==e)stopComparison();
  selected=e;variant=e.variants.some(v=>v.id===id)?id:e.variants[0].id;
  $('inspection').hidden=false;$('asset-type').innerHTML=icon(collectionIcon(e.collection));$('asset-type').append(document.createTextNode(e.collection));
  $('asset-name').textContent=e.name;
  const places=(e.places||[]).filter(Boolean),context=places.slice(0,2).join(' · ');
  $('asset-context').textContent=context||e.detail||e.group;
  $('asset-context').title=[...places,e.detail].filter(Boolean).join(' · ');
  $('grid').disabled=e.view==='room';$('compare').disabled=e.variants.length<2;
  variantUI(e);flagUI();updateHash();if(redrawCards)cards();
  if(previous===e&&oldVariant===variant)return;
  const task=++serial;facts(e);viewer?.remove();if(comparing)void compareWith(otherId);$('stage-message').textContent='Loading model…';
  if(!viewer){$('stage-message').textContent='WebGL 2 is unavailable. Enable hardware acceleration to inspect the models.';return;}
  try{
    const object=await e.build(variant);
    if(task!==serial){e.dispose?.(object);return;}
    const metrics=viewer.set(e,object);if(retained&&e.view!=='room')viewer.match(retained);if(comparing)secondary?.match(viewer.pose());facts(e,metrics);$('stage-message').textContent='';
  }catch(err){if(task===serial){$('stage-message').textContent='Unable to render this model. '+err.message;console.error(e.id,err);}}
}
function applyLocation(){
  const state=query(),group=state.get('collection');collection=group==='Flagged assets'||entries.some(e=>e.collection===group)?group:'All assets';
  $('search').value=state.get('q')||'';$('sort').value=['az','za'].includes(state.get('sort'))?state.get('sort'):'featured';
  stopComparison();sections();refresh(state.get('asset'),state.get('state'));if(state.has('compare'))void compareWith(state.get('compare'));
}
$('search').oninput=()=>{page=0;refresh();};$('sort').onchange=()=>refresh();
$('mobile-collection').onchange=e=>filter(e.target.value);$('flag-filter').onclick=()=>filter('Flagged assets');
$('clear').onclick=()=>{$('search').value='';filter('All assets');};
for(const [id,delta] of [['prev',-1],['next',1]])$(id).onclick=()=>{page+=delta;cards();$('library-title').scrollIntoView({block:'nearest'});};
$('flag').onclick=()=>{
  if(!selected)return;
  if(hasFlag(selected.id))delete flags[selected.id];else flags[selected.id]='';
  saveFlags();sections();if(collection==='Flagged assets')refresh();else{flagUI();cards();}
};
$('note').oninput=()=>{if(selected&&hasFlag(selected.id)){flags[selected.id]=$('note').value;saveFlags();}};
$('copy').onclick=async()=>{
  try{await navigator.clipboard.writeText(location.href);notify('Asset link copied.');}
  catch{const input=el('input');input.value=location.href;$('notice').replaceChildren(input);$('notice').hidden=false;input.select();}
};
for(const [id,factor] of [['zoom-out',1.22],['zoom-in',1/1.22]])$(id).onclick=()=>viewer?.zoom(factor);
$('reset').onclick=()=>{viewer?.reset();if(comparing)secondary?.match(viewer.pose());};$('wire').onclick=()=>{$('wire').setAttribute('aria-pressed',wire=!wire);viewer?.wire(wire);secondary?.wire(wire);};
$('grid').onclick=()=>{$('grid').setAttribute('aria-pressed',grid=!grid);viewer?.grid(grid);secondary?.grid(grid);};
function expandState(){const open=!!document.fullscreenElement||$('stage').classList.contains('expanded');$('expand').setAttribute('aria-label',open?'Exit expanded viewport':'Expand viewport');$('expand').title=$('expand').getAttribute('aria-label');}
$('expand').onclick=async()=>{const stage=$('stage');if(document.fullscreenElement)await document.exitFullscreen();else if(stage.classList.contains('expanded'))stage.classList.remove('expanded');else{try{await stage.requestFullscreen();}catch{stage.classList.add('expanded');}}expandState();};
document.addEventListener('fullscreenchange',expandState);
window.addEventListener('hashchange',applyLocation);
window.addEventListener('keydown',e=>{
  const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  if(e.key==='/'&&!typing){e.preventDefault();$('search').focus();}
  if(e.key==='Escape'&&$('stage').classList.contains('expanded')){$('stage').classList.remove('expanded');expandState();}
});
window.addEventListener('storage',e=>{if(e.key===reviewKey){try{flags=JSON.parse(e.newValue)||{};sections();refresh();}catch{}}});

try{viewer=studio($('viewport'));viewer.onChange(p=>{if(comparing)secondary?.match(p);});$('engine').textContent='WebGL 2';$('engine').classList.add('ready');}catch{$('engine').textContent='WebGL unavailable';}
const modules=await Promise.allSettled([Promise.resolve().then(foodEntries),import('./business.js').then(m=>m.businessEntries()),import('./city.js').then(m=>m.cityEntries()),import('./fashion.js').then(m=>m.fashionEntries())]);
for(const result of modules){if(result.status==='fulfilled')entries.push(...result.value);else{notify('One collection could not load. Refresh to retry.');console.error(result.reason);}}
for(const e of entries)e.search=compact([e.name,e.caption,e.id,e.collection,e.group,e.detail,e.source,...(e.tags||[]),...(e.places||[]),...e.variants.map(v=>v.label)].join(' '));
entries.sort((a,b)=>priority(a.name)-priority(b.name)||categories.indexOf(a.collection)-categories.indexOf(b.collection)||(a.order||0)-(b.order||0)||a.name.localeCompare(b.name));
applyLocation();
