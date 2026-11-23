import { COMPANIES, portfolio, sharePrice } from './market.js';
import { formatClock } from './atmosphere.js';
import { createThumbPress } from './phone-touch.js';
import { drawPhoneMap } from './phone-map.js';
import { searchDestinations } from './geocoder.js';
import { formatMoney } from './money.js';
// The in-game handset shares places, jobs, transport and balances with the world.
//
// It is a panel of the page, built in index.html; this module fills it in and
// answers its buttons. What it lists comes from places.js, so "nearest
// bodega" finds a real one, and directions to it use the game's own route
// planner.
import { KIND, placeName, isOpen } from './places.js';
import { CALL_OUT, DELIVERY } from './garage.js';

/** What the Nearby list can be narrowed to, and the groups of kinds (places.js) each covers. */
export const CATEGORIES = [
  { id: 'all', label: 'ALL', groups: null }, { id: 'eat', label: 'EAT', groups: ['food', 'dining'] }, { id: 'coffee', label: 'COFFEE', groups: ['cafe'] },
  { id: 'deli', label: 'DELI', groups: ['bodega', 'market'] }, { id: 'drinks', label: 'DRINKS', groups: ['bar', 'liquor'] }, { id: 'hair', label: 'HAIR', groups: ['beauty', 'barber'] },
  { id: 'cars', label: 'CARS', groups: ['auto'] }, { id: 'more', label: 'MORE', groups: ['shop', 'hotel', 'public', 'stand'] },
];
/** Rows the Nearby list shows at a time. */
export const ROWS = 6;

/** A distance as a New Yorker's phone gives it: feet up close, then miles. */
export const formatDistance = metres => metres < 160 ? `${Math.max(10, Math.round(metres * 3.28084 / 10) * 10)} FT` : `${(metres / 1609.344).toFixed(1)} MI`;

/** What the phone says about a place: its name, what it is, whether it is open now and any inspection grade. */
export function describePlace(place, hours, isClosed = () => false) {
  return { name: placeName(place), kind: (KIND[place.kind]?.label || 'Place').toUpperCase(), status: isClosed(place) ? 'TEMPORARILY CLOSED' : isOpen(place.kind, hours) ? 'OPEN' : 'CLOSED', grade: place.grade ? `GRADE ${place.grade}` : '' };
}

/**
 * The places to list: those of a category whose name or kind contains
 * `query`, nearest first. Each row is { place, name, note, distance }.
 */
export function listPlaces(places, { category = 'all', query = '', x = 0, z = 0, hours = 12, isClosed } = {}) {
  const groups = CATEGORIES.find(item => item.id === category)?.groups, wanted = String(query || '').trim().toUpperCase();
  const rows = [];
  for (const place of places) {
    if (groups && !groups.includes(place.group)) continue;
    const about = describePlace(place, hours, isClosed);
    if (wanted && !about.name.includes(wanted) && !about.kind.includes(wanted)) continue;
    const distance = Math.hypot(place.x - x, place.z - z);
    rows.push({ place, name: about.name, distance, note: [about.kind === about.name ? '' : about.kind, formatDistance(distance), about.status, about.grade].filter(Boolean).join(' · ') });
  }
  return rows.sort((a, b) => a.distance - b.distance);
}

/**
 * Run the phone. `$` finds an element of the page by id. `places()` gives
 * the places within reach. The live state supplies the clock, location and
 * checking and savings balances. App actions go back to the game.
 */
export function createPhone({ $, isClosed, places = () => [], state = () => ({}), onDirections = () => {}, onTransport = () => {}, onWork = () => {}, onMap = () => {}, onOpenChange = () => {}, onTap = () => {}, showTap = () => true, onMechanic = () => {}, onCab = () => {}, onCapture = () => '', onTransfer = () => '', onTrade = () => '', rides, roads = () => [], storage, destinations = () => [], searchCity = async () => [] } = {}) {
  const titles = {home:'Home', nearby:'Nearby', place:'Place', contacts:'Contacts', contact:'Contact', messages:'Messages', thread:'Message', call:'Call', camera:'Camera', gallery:'Gallery', photo:'Photo', bank:'Bank', transfer:'Transfer', market:'Investments', order:'Trade shares', list:'Work', maps:'Maps', rides:'D Ride', settings:'Settings', wallpaper:'Wallpaper'};
  // Contacts is the address book. Calls start from a person, or from their
  // texts. Messages is the inbox. There is no keypad: these are the only numbers.
  const contacts = [
    {id:'mechanic',name:'Mechanic',initials:'M',role:'Roadside assistance',note:'Repair your current car or a nearby burned-out cab. $'+CALL_OUT+' call-out plus repairs.',call:onMechanic,
      texts:true,seed:['If the car will not move, call. $'+CALL_OUT+' to come out, then the repair.'],
      reply(text){
        const line=String(text||'').toLowerCase();
        if(/\b(where|far|long|soon|when)\b/.test(line))return 'A few minutes. Stay with the car.';
        if(/\b(cost|price|much|charge|pay|\$)\b/.test(line))return 'Call-out is $'+CALL_OUT+'. The repair depends on the car.';
        if(/\b(thanks|thank)\b/.test(line))return 'Anytime. Call if it starts knocking.';
        return 'Call when you are with the car and I will come out.';
      }},
  ];
  let listing=null, listPage=0, visibleJobs=[], mine=false, contact=null;
  const messagesKey='nyc-phone-messages', photosKey='nyc-phone-photos', BUBBLES=8, SHOTS=8;
  const threads=new Map(), seen=new Map(), inbox=[];
  let call=null, facing='rear', photos=[], photoSerial=0, shot=null, threadPage=0;
  let selectedStock=COMPANIES[0].symbol, displayedPrice=0;
  let sector='All sectors', jobSort='Featured', boardPage=0, jobMenu=null, jobOptions=[];
  const jobOptionCount=9;
  const jobSorts=['Featured','Nearest','Highest pay'];
  let destinationRows=[], quote=null, rideMessage='', searchRevision=0, quoteRevision=0, quoting=false;
  let open = false, screen = 'home', category = 'all', page = 0, rows = [], chosen = null, listed = -Infinity;
  const handset = $('phone');
  const papers = ['earth', 'soho', 'tide', 'six-seven', 'charles'];
  const paperKey = 'nyc-phone-wallpaper', settingsKey = 'nyc-phone-preferences';
  const prefs = {dark:false, large:false, motion:false, clock:false};
  const focusHistory = new Map();
  let viewRevision=0;
  let paper = 'earth', pendingSearch=null, searchTimer=null;
  try {
    storage ??= handset.ownerDocument?.defaultView?.localStorage;
    const saved = storage?.getItem(paperKey);
    if (papers.includes(saved)) paper = saved;
    const stored=JSON.parse(storage?.getItem(settingsKey) || '{}');
    for(const key of Object.keys(prefs))prefs[key]=stored?.[key]===true;
  } catch {}
  handset.setAttribute('data-wallpaper',paper);
  function applyPreferences() {
    handset.setAttribute('data-dark',String(prefs.dark));
    handset.setAttribute('data-large-text',String(prefs.large));
    handset.setAttribute('data-reduce-motion',String(prefs.motion));
    for(const key of Object.keys(prefs))$('phone-pref-'+key).setAttribute('aria-checked',String(prefs[key]));
  }
  applyPreferences();
  function loadPhoneMemory(){
    let saved=null, shots=null;
    try { saved=JSON.parse(storage?.getItem(messagesKey)||'null'); } catch {}
    try { shots=JSON.parse(storage?.getItem(photosKey)||'null'); } catch {}
    for(const person of contacts){
      const record=saved?.[person.id];
      const rows=Array.isArray(record)?record:Array.isArray(record?.rows)?record.rows:[];
      const clean=rows.filter(row=>row&&(row.who==='me'||row.who==='them')&&typeof row.text==='string').slice(-40);
      threads.set(person.id, clean.length?clean:(person.seed||[]).map(text=>({who:'them',text,time:''})));
      seen.set(person.id, Number.isInteger(record?.seen)?record.seen:0);
    }
    if(Array.isArray(shots))photos=shots.filter(item=>item&&typeof item.image==='string'&&(item.facing==='selfie'||item.facing==='rear')).slice(0,SHOTS);
    photoSerial=photos.reduce((max,item)=>Math.max(max,item.id||0),0);
  }
  function saveThreads(){
    const data={};
    for(const person of contacts)data[person.id]={seen:seen.get(person.id)||0,rows:threads.get(person.id)||[]};
    try{storage?.setItem(messagesKey,JSON.stringify(data));}catch{}
  }
  function savePhotos(){
    try{storage?.setItem(photosKey,JSON.stringify(photos));}
    catch{photos.splice(Math.ceil(photos.length/2));try{storage?.setItem(photosKey,JSON.stringify(photos));}catch{}}
  }
  loadPhoneMemory();
  const unread=()=>{let n=0;for(const person of contacts)if((threads.get(person.id)||[]).length>(seen.get(person.id)||0))n++;return n;};
  const clocked=seconds=>{const s=Math.max(0,Math.floor(seconds));return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0');};
  function openThread(person=contact){
    if(!person)return;
    contact=person;
    const rows=threads.get(person.id)||[];
    seen.set(person.id, rows.length);
    threadPage=Math.max(0,Math.ceil(rows.length/BUBBLES)-1);
    saveThreads();
    show('thread');
  }
  function sendThread(){
    if(screen!=='thread'||!contact)return;
    const text=$('phone-thread-draft').value.trim().slice(0,140);
    if(!text)return;
    const rows=threads.get(contact.id)||[];
    rows.push({who:'me',text,time:state().clock||''});
    if(contact.reply)rows.push({who:'them',text:contact.reply(text),time:state().clock||''});
    threads.set(contact.id, rows.slice(-40));
    seen.set(contact.id, threads.get(contact.id).length);
    $('phone-thread-draft').value='';
    threadPage=Math.max(0,Math.ceil(threads.get(contact.id).length/BUBBLES)-1);
    saveThreads();
    render();
    $('phone-thread-draft').scrollIntoView?.({block:'nearest'});
  }
  function beginCall(){
    if(!contact)return;
    call={contact,from:screen==='thread'?'thread':'contact',began:null,connected:false,sent:false,elapsed:0};
    show('call');
  }
  const reducedMotion=()=>prefs.motion || Boolean(handset.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const touch=createThumbPress(handset,$('phone-thumb'),onTap,reducedMotion,showTap);
  handset.addEventListener('pointermove',event=>{
    if(event.pointerType==='mouse' && handset.getAttribute('data-navigation')!=='pointer')handset.setAttribute('data-navigation','pointer');
  });
  handset.addEventListener('pointerdown',event=>{
    handset.setAttribute('data-navigation','pointer');
    const control=event.target.closest?.('button, input, select') || handset;
    if(control && !control.disabled && event.isPrimary!==false && event.button===0)touch.reach(control,event);
  });
  const followThumb=(x,y)=>{
    if(!open || !showTap())return;
    const rect=handset.getBoundingClientRect();
    if(rect.width && rect.height)onTap((x-rect.left)/rect.width,(y-rect.top)/rect.height,reducedMotion());
  };
  handset.addEventListener('pointermove',event=>{
    if(event.isPrimary!==false && event.buttons===1)followThumb(event.clientX,event.clientY);
  });
  handset.addEventListener('touchmove',event=>{
    if(event.touches.length===1)followThumb(event.touches[0].clientX,event.touches[0].clientY);
  },{passive:true});
  handset.addEventListener('pointercancel',touch.withdraw);
  handset.ownerDocument?.addEventListener?.('pointerup',touch.release);
  handset.ownerDocument?.defaultView?.addEventListener('blur',touch.cancel);
  function stopSearch() {
    clearTimeout(searchTimer); pendingSearch?.abort(); pendingSearch=null; searchRevision++;
  }
  function controls(panel) {
    return Array.from(panel.querySelectorAll?.('button, input, select') || [])
      .filter(element => !element.disabled && !element.closest('[hidden]'));
  }
  function focusScreen(restore=false) {
    const items = controls($('phone-' + screen));
    const remembered=restore && focusHistory.get(screen);
    const first=items.includes(remembered) ? remembered : items.find(item=>item.tagName!=='INPUT' && item.tagName!=='SELECT') || items[0] || $('phone-back');
    first.focus?.();
  }
  function show(next,backward=false) {
    const previous=screen;
    if(previous==='call' && next!=='call')call=null;
    viewRevision++;
    if(previous==='rides' && next!=='rides'){stopSearch();quoteRevision++;quoting=false;}
    const current=handset.ownerDocument?.activeElement;
    if(controls($('phone-'+previous)).includes(current))focusHistory.set(previous,current);
    screen=next;render();focusScreen(backward || next==='home');
    if(previous===next || reducedMotion())return;
    const start=previous==='home' || next==='home' ? 'scale(.92)' : 'translateX('+(backward?-12:12)+'%)';
    $('phone-'+next).animate?.([{transform:start,opacity:.65},{transform:'none',opacity:1}],{duration:160,easing:'ease-out'});
  }
  function parentScreen() {
    if(screen==='rides' && !rides?.trip && (quote || quoting))return 'rides';
    if(screen==='list' && listing?.board && jobMenu)return 'list';
    if(screen==='list')return listing?.app==='maps'?'maps':listing?.onBack?'list':'home';
    return ({order:'market',market:'bank',wallpaper:'settings',place:'nearby',nearby:'maps',contact:'contacts',transfer:'bank',thread:'messages',call:call?.from||'contact',gallery:'camera',photo:'gallery'})[screen] || 'home';
  }
  function back() {
    if(screen==='list' && listing?.board && jobMenu){
      const trigger=$('phone-job-'+jobMenu);jobMenu=null;render();trigger.focus?.();return;
    }
    if(screen==='home')setOpen(false);
    else if(screen==='rides' && parentScreen()==='rides'){
      quoteRevision++;quoting=false;quote=null;rideMessage='';render();focusScreen();
    }
    else if(screen==='list' && listing?.onBack)listing.onBack();
    else show(parentScreen(),true);
  }

  function center(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function moveFocus(key, active) {
    const items = controls($('phone-' + screen));
    if (!items.includes(active)) {
      items[0]?.focus();
      return;
    }
    const origin = center(active);
    const vertical = key === 'ArrowUp' || key === 'ArrowDown';
    const sign = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
    let next = null;
    let best = Infinity;
    for (const item of items) {
      const point = center(item);
      const dx = point.x - origin.x, dy = point.y - origin.y;
      const along = sign * (vertical ? dy : dx);
      if (along < 2) continue;
      // Prefer the current row or column when moving between icons or list entries.
      const score = along + 3 * Math.abs(vertical ? dx : dy);
      if (score < best) {
        next = item;
        best = score;
      }
    }
    next?.focus();
  }

  function handleKey(event) {
    if (!open) return false;
    const key = event.key || event.code || '';
    const active = handset.ownerDocument?.activeElement;
    const editing = !event.fromPad && Boolean(active?.matches?.('input, textarea, select'));
    if(event.fromPad || ['Tab','ArrowUp','ArrowDown','ArrowRight','ArrowLeft','Backspace','Home','Enter',' '].includes(key))handset.setAttribute('data-navigation','keys');
    if (key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) setOpen(false);
    } else if (key === 'Tab') {
      event.preventDefault();
      const items = controls(handset);
      if (!items.length) return true;
      const index = items.indexOf(active);
      const start = index < 0 && event.shiftKey ? 0 : index;
      items[(start + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    } else if(!editing && (key==='Backspace' || (key==='ArrowLeft' && screen!=='home') || key==='Home')){
      event.preventDefault();
      if(!event.repeat)pressNavigation(key==='Home' || parentScreen()==='home'?'phone-home-key':'phone-back');
    } else if (!editing && key.startsWith('Arrow')) {
      event.preventDefault();
      moveFocus(key, active);
    } else if (!editing && (key === 'Enter' || key === ' ')) {
      event.preventDefault();
      if (!event.repeat && handset.contains?.(active)) active.click();
    } else if (!editing && event.code === 'KeyM' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!event.repeat) {
        setOpen(false);
        onMap();
      }
    } else return editing;
    return true;
  }
  function handlePad(index) {
    if(!open)return false;
    const key=({0:'Enter',1:'Backspace',8:'Home',9:'Escape',12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'})[index];
    return key ? handleKey({key,fromPad:true,preventDefault(){}}) : false;
  }

  // The left bezel goes back and an upward gesture over the Home key goes home.
  let gesture=null;
  handset.addEventListener('touchstart',event=>{
    if(event.touches.length!==1){gesture=null;return;}
    const {clientX:x,clientY:y}=event.touches[0], bounds=handset.getBoundingClientRect();
    gesture={x,y,left:x-bounds.left<22,bottom:bounds.bottom-y<32};
  },{passive:true});
  handset.addEventListener('touchend',event=>{
    if(!gesture || !open)return;
    const dx=event.changedTouches[0].clientX-gesture.x, dy=event.changedTouches[0].clientY-gesture.y;
    if(gesture.bottom && dy < -45 && Math.abs(dx)<-dy){event.preventDefault();pressNavigation('phone-home-key');}
    else if(gesture.left && dx>55 && Math.abs(dy)<dx*.6){event.preventDefault();pressNavigation('phone-back');}
    gesture=null;
  },{passive:false});
  handset.addEventListener('touchcancel',()=>{gesture=null;});
  function list() {
    const now = state();
    rows = listPlaces(places(), { category, query: $('phone-search').value, x: now.x, z: now.z, hours: now.hours, isClosed });
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / ROWS) - 1));
  }
  const shareCount=n=>n+(n===1?' share':' shares');
  function drawStockHistory(company,time){
    const prices=Array.from({length:21},(_,i)=>sharePrice(company,time-(20-i)*30000));
    const change=prices.at(-1)-prices[0];
    $('phone-stock-change').textContent='Last 10 minutes · '+(change<0?'−':'+')+formatMoney(Math.abs(change)/100);
    const canvas=$('phone-stock-chart'),ctx=canvas.getContext?.('2d');
    if(!ctx)return;
    const w=canvas.width,h=canvas.height,low=Math.min(...prices),high=Math.max(...prices);
    const y=price=>high===low?h/2:8+(high-price)/(high-low)*(h-16);
    ctx.clearRect(0,0,w,h);
    ctx.beginPath();
    prices.forEach((price,i)=>ctx[i?'lineTo':'moveTo'](3+(w-6)*i/(prices.length-1),y(price)));
    ctx.strokeStyle=change<0?'#ba6d4b':'#418768';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
    ctx.fillStyle=change<0?'#ba6d4b1c':'#4187681c';ctx.fill();
  }
  function renderBank(now) {
    $('phone-bank-balance').textContent=formatMoney(now.availableCash??now.cash??0);
    $('phone-bank-savings').textContent=formatMoney((now.bank?.savings || 0)/100);
    $('phone-bank-invested').textContent=formatMoney(portfolio(now.bank?.holdings||{}).value/100)+' market value';
    const entries=now.bank?.entries || [];
    $('phone-bank-empty').hidden=entries.length>0;
    for(let i=0;i<16;i++){
      const row=entries[i], id='phone-activity-'+i;
      $(id).hidden=!row;
      if(!row)continue;
      $(id+'-name').textContent=row.name; $(id+'-time').textContent=row.clock;
      $(id+'-amount').textContent=(row.amount>0?'+':'−')+formatMoney(Math.abs(row.amount)/100);
    }
  }
  function renderRide(now) {
    const trip=rides?.trip, selected=trip || quote;
    $('phone-ride-street').textContent=trip?.pickupName || now.street || 'Current location';
    $('phone-ride-destination').textContent=selected?.destination.name || 'Choose a destination';
    $('phone-ride-picker').hidden=Boolean(selected || trip);
    const pin=now.mapPin;
    $('phone-destination-pin').hidden=!pin;
    if(pin){
      const distance=formatDistance(Math.hypot(pin.x-now.x,pin.z-now.z));
      $('phone-destination-pin-note').textContent=pin.name && pin.name!=='Map pin' ? pin.name+' · '+distance : distance;
    }
    for(let i=0;i<5;i++) {
      const place=destinationRows[i], id='phone-destination-'+i;
      $(id).hidden=!place || Boolean(pin && place.x===pin.x && place.z===pin.z);
      if(place){$(id+'-name').textContent=place.name; $(id+'-note').textContent=place.detail || place.borough || formatDistance(Math.hypot(place.x-now.x,place.z-now.z));}
    }
    const eta=$('phone-ride-eta'), driver=$('phone-driver');
    eta.hidden=!trip; driver.hidden=!trip;
    if(trip){
      const identity=trip.car.identity;
      const model=identity ? [identity.make,identity.model].filter(Boolean).join(' ') : '';
      const seconds=trip.eta;
      eta.textContent=trip.phase==='waiting'?'Arrived':seconds<60?seconds+' sec':Math.ceil(seconds/60)+' min';
      $('phone-driver-name').textContent=trip.driver.name;
      $('phone-driver-rating').textContent='★ '+trip.driver.rating;
      $('phone-driver-vehicle').textContent=model?'Yellow '+model:'Yellow cab';
      $('phone-driver-photo').setAttribute('src','./assets/rides/driver-'+trip.driver.member+'.webp');
      $('phone-ride-map').setAttribute('aria-label','Driver at '+(trip.car._edge?.road?.name || trip.pickupName || 'pickup')+' · '+eta.textContent);
    } else $('phone-ride-map').setAttribute('aria-label','Current pickup location');
    drawPhoneMap($('phone-ride-map'),{roads:roads(),center:now,trip,approach:rides?.approachPoints?.() || [],destination:selected?.destination});
    const at=trip?.car._edge?.road?.name;
    $('phone-ride-summary').textContent=trip ? (trip.phase==='approaching'?'On the way'+(at?' · '+at:''):trip.phase==='waiting'?'Your driver is waiting '+formatDistance(Math.hypot(now.x-trip.car.x,now.z-trip.car.z))+' away. Board on foot.':(trip.stopping?'Pulling over':trip.car.rideHurry?'Driver is hurrying':'On trip')+' · '+formatDistance(trip.remaining)+' left')+' · '+formatMoney(trip.fare) :
      rideMessage || (quote ? formatDistance(quote.distance)+' by road · '+formatMoney(quote.fare)+' upfront fare' : rides?.receipt || '');
    $('phone-ride-request').hidden=!quote || Boolean(trip);
    $('phone-ride-request').disabled=quoting || (quote && now.cash<quote.fare);
    if(quote && !trip && now.cash<quote.fare)$('phone-ride-summary').textContent+=' · Insufficient funds';
    $('phone-ride-board').hidden=trip?.phase!=='waiting';
    $('phone-ride-board').disabled=!rides?.canBoard();
    $('phone-ride-cancel').hidden=(!quote && !trip && !quoting) || trip?.phase==='traveling';
    $('phone-ride-cancel').textContent=trip?'Cancel ride':'Change destination';
  }
  async function findDestination() {
    stopSearch();
    const revision=searchRevision, query=$('phone-ride-search').value.trim();
    quote=null; quoteRevision++; quoting=false;
    destinationRows=destinations().filter(p=>p.name?.toLowerCase().includes(query.toLowerCase())).slice(0,5);
    rideMessage=query && !destinationRows.length?'Searching…':'';
    render();
    if(!query)return;
    const controller=pendingSearch=new AbortController();
    let found=[], failure='';
    try {
      found=query.length<3 ? await searchCity(query) : await searchDestinations(query,{searchLocal:searchCity,signal:controller.signal});
    } catch(error){failure=error.message;}
    if(revision!==searchRevision || !open || screen!=='rides' || quote || quoting)return;
    const keys=new Set();
    destinationRows=[...found,...destinationRows].filter(p=>{
      const key=p.name+'|'+Math.round(p.x)+','+Math.round(p.z);
      if(keys.has(key) || !Number.isFinite(p.x) || !Number.isFinite(p.z))return false;
      keys.add(key);return true;
    }).slice(0,5);
    rideMessage=destinationRows.length?'':(failure || 'No matching destinations.');render();
  }
  async function chooseDestination(place) {
    if(!place || !rides || rides.trip)return;
    const revision=++quoteRevision;
    stopSearch(); quoting=true; rideMessage='Finding the street fare…';render();
    try {
      const result=await rides.quote(place);
      if(revision!==quoteRevision)return;
      quote=result;rideMessage='';
    } catch(error) { if(revision===quoteRevision)rideMessage=error.message; }
    if(revision===quoteRevision){quoting=false;render();}
  }
  function render() {
    const now = state();
    const focused=handset.ownerDocument?.activeElement;
    const following=handset.getAttribute('data-navigation')==='keys' && focused?.closest?.('.phone-screen')?.id==='phone-'+screen;
    handset.hidden = !open;
    if (!open) return;
    const app=({market:'bank',order:'bank',contact:'contacts',transfer:'bank',wallpaper:'settings',place:'maps',nearby:'maps',list:listing?.app || 'work',call:call?.from==='thread'?'messages':'contacts',thread:'messages',gallery:'camera',photo:'camera'})[screen] || screen;
    handset.setAttribute('data-app',app);
    const waiting=unread();
    $('phone-messages-badge').hidden=waiting<1;
    $('phone-app-messages').setAttribute('aria-label',waiting?`Messages, ${waiting} unread`:'Messages');
    $('phone-clock').textContent=prefs.clock && Number.isFinite(now.hours) ? formatClock(now.hours,true) : now.clock || '';
    $('phone-title').textContent=screen==='list'?listing?.title:screen==='thread'?(contact?.name||'Message'):screen==='photo'?(shot?.facing==='selfie'?'Selfie':'Photo'):titles[screen];
    for (const name of Object.keys(titles)) $('phone-'+name).hidden = name !== screen;
    $('phone-toolbar').hidden = screen === 'home';
    $('phone-back').hidden = screen === 'home';
    $('phone-back').textContent=titles[parentScreen()];
    if(screen==='rides')renderRide(now);
    if(screen==='bank')renderBank(now);
    if(screen==='market' || screen==='order'){
      const time=Date.now(),market=portfolio(now.bank?.holdings||{},time);
      const gain=value=>(value<0?'−':'+')+formatMoney(Math.abs(value)/100);
      if(screen==='market'){
        $('phone-market-value').textContent=formatMoney(market.value/100);
        $('phone-market-return').textContent=gain(market.value-market.cost)+' open gain / loss';
        for(const stock of market.stocks)$('phone-stock-'+stock.symbol+'-quote').textContent=
          stock.symbol+' · '+formatMoney(stock.price/100)+' · '+shareCount(stock.shares)+' held';
      }else{
        const stock=market.stocks.find(row=>row.symbol===selectedStock);
        displayedPrice=stock.price;
        drawStockHistory(COMPANIES.find(company=>company.symbol===selectedStock),time);
        const quantity=Number($('phone-order-shares').value), valid=Number.isSafeInteger(quantity)&&quantity>0;
        const total=quantity*stock.price;
        $('phone-order-name').textContent=stock.name+' · '+stock.symbol;
        $('phone-order-price').textContent=formatMoney(stock.price/100);
        $('phone-order-position').textContent=shareCount(stock.shares)+' held · '+gain(stock.value-stock.cost)+' open gain / loss';
        $('phone-order-cash').textContent=formatMoney(now.availableCash??now.cash??0)+' available in checking';
        $('phone-order-total').textContent=valid?'Order total '+formatMoney(total/100):'Enter a whole number of shares.';
        $('phone-order-buy').disabled=!valid || total>Math.round((now.availableCash??now.cash??0)*100);
        $('phone-order-sell').disabled=!valid || quantity>stock.shares;
      }
    }
    if(screen==='maps'){
      $('phone-map-street').textContent=now.street || 'Current location';
      const nearby=listPlaces(places(),{...now,isClosed}).slice(0,3);
      $('phone-map-nearby-note').textContent=nearby.length?nearby.map(row=>row.name).join(' · '):'Browse places around you';
      drawPhoneMap($('phone-map-preview'), {roads:roads(),center:now,places:nearby.map(row=>row.place)});
    }
    if(screen==='settings')$('phone-paper-name').textContent=$('phone-wall-'+paper).textContent.trim();
    if(screen==='wallpaper')for(const id of papers)$('phone-wall-'+id).setAttribute('aria-pressed',String(paper===id));
    if (screen === 'nearby') {
      list();
      for (const item of CATEGORIES) $(`phone-chip-${item.id}`).setAttribute('aria-pressed', String(item.id === category));
      for (let i = 0; i < ROWS; i++) {
        const row = rows[page * ROWS + i];
        $(`phone-row-${i}`).hidden = !row;
        if (row) { $(`phone-row-${i}-name`).textContent = row.name; $(`phone-row-${i}-note`).textContent = row.note; }
      }
      const pages = Math.max(1, Math.ceil(rows.length / ROWS));
      $('phone-nearby-pager').hidden=pages<=1;
      $('phone-empty').hidden = rows.length > 0;
      $('phone-page').textContent = rows.length ? `${page + 1} / ${pages}` : '';
      $('phone-prev').disabled = page <= 0; $('phone-next').disabled = page >= pages - 1;
    }
    if (screen === 'place' && chosen) {
      const about = describePlace(chosen, now.hours, isClosed);
      $('phone-place-name').textContent = about.name; $('phone-place-kind').textContent = about.kind === about.name ? '' : about.kind;
      $('phone-place-note').textContent = [formatDistance(Math.hypot(chosen.x - now.x, chosen.z - now.z)), about.status, about.grade].filter(Boolean).join(' · ');
    }
    if (screen === 'contacts') {
      const term=$('phone-contact-search').value.trim().toLowerCase();
      const found=contacts.filter(c=>(c.name+' '+c.role).toLowerCase().includes(term));
      for(const c of contacts)$('phone-contact-'+c.id).hidden=!found.includes(c);
      for(const letter of ['M'])$('phone-letter-'+letter).hidden=!found.some(c=>c.name[0]===letter);
      $('phone-contact-empty').hidden=Boolean(found.length);
    }
    if(screen==='contact' && contact){
      $('phone-contact-avatar').textContent=contact.initials;
      $('phone-contact-avatar').setAttribute('class','monogram '+contact.id);
      $('phone-contact-name').textContent=contact.name;
      $('phone-contact-role').textContent=contact.role;
      $('phone-contact-note').textContent=contact.note;
      $('phone-contact-call').textContent='Call '+contact.name;
      $('phone-contact-message').hidden=!contact.texts;
      $('phone-cab-delivery').textContent='Deliver my cab · '+formatMoney(DELIVERY);
    }
    if(screen==='messages'){
      inbox.length=0;
      for(const person of contacts)if((threads.get(person.id)||[]).length)inbox.push(person);
      for(let i=0;i<ROWS;i++){
        const person=inbox[i], id='phone-inbox-'+i;
        $(id).hidden=!person;
        if(!person)continue;
        const rows=threads.get(person.id), last=rows[rows.length-1];
        $(id+'-name').textContent=person.name;
        $(id+'-note').textContent=last.text;
        $(id).setAttribute('data-unread',String(rows.length>(seen.get(person.id)||0)));
      }
      $('phone-messages-empty').hidden=inbox.length>0;
    }
    if(screen==='thread' && contact){
      const rows=threads.get(contact.id)||[];
      const pages=Math.max(1,Math.ceil(rows.length/BUBBLES));
      threadPage=Math.max(0,Math.min(threadPage,pages-1));
      for(let i=0;i<BUBBLES;i++){
        const row=rows[threadPage*BUBBLES+i], id='phone-bubble-'+i;
        $(id).hidden=!row;
        if(!row)continue;
        $(id).setAttribute('data-who',row.who);
        $(id+'-who').textContent=(row.who==='me'?'You':contact.name)+(row.time?' · '+row.time:'');
        $(id+'-text').textContent=row.text;
      }
      $('phone-thread-pager').hidden=pages<=1;
      $('phone-thread-page').textContent=`${threadPage+1} / ${pages}`;
      $('phone-thread-prev').disabled=threadPage<=0;
      $('phone-thread-next').disabled=threadPage>=pages-1;
      $('phone-thread-call').textContent='Call '+contact.name;
    }
    if(screen==='call' && call){
      const person=call.contact;
      $('phone-call-avatar').textContent=person.initials;
      $('phone-call-avatar').setAttribute('class','monogram '+person.id);
      $('phone-call-name').textContent=person.name;
      $('phone-call-status').textContent=call.connected?'Connected':'Calling…';
      $('phone-call-timer').textContent=call.connected?clocked(call.elapsed-1.1):'';
    }
    if(screen==='camera'){
      $('phone-camera-status').textContent=$('phone-camera-status').textContent||(facing==='selfie'?'Front camera':'Rear camera');
    }
    if(screen==='gallery'){
      for(let i=0;i<SHOTS;i++){
        const item=photos[i], id='phone-shot-'+i;
        $(id).hidden=!item;
        if(!item)continue;
        $(id+'-image').setAttribute('src',item.image);
        $(id+'-image').setAttribute('alt',item.facing==='selfie'?'Selfie':'Photo');
        $(id).setAttribute('aria-label',(item.facing==='selfie'?'Selfie':'Photo')+(item.time?' · '+item.time:''));
      }
      $('phone-gallery-empty').hidden=photos.length>0;
    }
    if(screen==='photo' && shot){
      $('phone-photo-image').setAttribute('src',shot.image);
      $('phone-photo-image').setAttribute('alt',shot.facing==='selfie'?'Selfie':'Photo');
      $('phone-photo-note').textContent=[shot.facing==='selfie'?'Selfie':'Photo',shot.time].filter(Boolean).join(' · ');
    }
    if (screen === 'list' && listing) {
      $('phone-title').textContent = listing.title;
      $('phone-list-message').textContent = listing.message;
      $('phone-list-message').hidden = !listing.message;
      $('phone-job-tools').hidden=!listing.board;
      const term=$('phone-job-search').value.trim().toLowerCase();
      if(listing.refresh)listing.rows=listing.refresh();
      visibleJobs=listing.board ? listing.rows.filter(row=>(!mine || row.active) && [row.name,row.note,row.company,row.pay,row.sector].join(' ').toLowerCase().includes(term)) : listing.rows;
      if(listing.board){
        if(!mine && sector!=='All sectors')visibleJobs=visibleJobs.filter(row=>row.sector===sector);
        if(jobSort==='Nearest')visibleJobs.sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity));
        if(jobSort==='Highest pay')visibleJobs.sort((a,b)=>(b.wage||0)-(a.wage||0));
        jobOptions=jobMenu==='sector'?['All sectors',...new Set(listing.rows.map(row=>row.sector).filter(Boolean).sort())]:jobSorts;
        $('phone-job-options').hidden=!jobMenu;
        for(let i=0;i<jobOptionCount;i++){
          const el=$('phone-job-option-'+i),label=jobOptions[i];
          el.hidden=!label;el.textContent=label||'';
          el.setAttribute('aria-pressed',String(label===(jobMenu==='sector'?sector:jobSort)));
        }
        for(const menu of ['sector','sort'])$('phone-job-'+menu).setAttribute('aria-expanded',String(menu===jobMenu));
        $('phone-job-sector').textContent=sector+' ▾';
        $('phone-job-sector').hidden=mine;
        $('phone-job-sort').textContent=jobSort+' ▾';
        $('phone-job-count').textContent=visibleJobs.length+' '+(visibleJobs.length===1?'listing':'listings');
      }
      $('phone-list').setAttribute('data-board',String(Boolean(listing.board)));
      $('phone-job-mine').setAttribute('aria-pressed',String(mine));
      $('phone-job-all').setAttribute('aria-pressed',String(!mine));
      $('phone-job-empty').hidden=Boolean(visibleJobs.length);
      $('phone-job-empty').textContent=mine?'No matching jobs in My work.':'No matching listings.';
      const pages = Math.max(1, Math.ceil(visibleJobs.length / ROWS)); listPage = Math.max(0, Math.min(listPage, pages - 1));
      for (let i = 0; i < ROWS; i++) {
        const row = visibleJobs[listPage * ROWS + i];
        $(`phone-ride-${i}`).hidden = !row;
        if (row) {
          const id='phone-ride-'+i;
          $(id+'-name').textContent=row.name;
          $(id+'-note').textContent=[row.note, Number.isFinite(row.distance)?formatDistance(row.distance):''].filter(Boolean).join(' · ');
          $(id).setAttribute('data-active',String(Boolean(row.active)));
          $(id).setAttribute('data-sector',row.sector||'');
          $(id).setAttribute('data-initials',(row.company||'').split(/\s+/).slice(0,2).map(word=>word[0]).join(''));
          for(const field of ['company','pay']){
            $(id+'-'+field).hidden=!row[field]; $(id+'-'+field).textContent=row[field] || '';
          }
        }
      }
      $('phone-list-pager').hidden=pages<=1;
      $('phone-ride-page').textContent = `${listPage + 1} / ${pages}`; $('phone-ride-prev').disabled = listPage <= 0; $('phone-ride-next').disabled = listPage >= pages - 1;
    }
    // A quote or live list may replace the focused button while the app stays open.
    if(following && (focused.disabled || focused.closest('[hidden]')))focusScreen();
  }
  const setOpen = (next,navigation) => {
    next = Boolean(next);
    if (next === open) return;
    touch.cancel();viewRevision++;
    open = next; stopSearch(); quoteRevision++; quoting=false;
    if(open && navigation)handset.setAttribute('data-navigation',navigation);
    if (open) { screen = 'home'; $('phone-search').value = ''; page = 0; }
    render(); onOpenChange(open); if (open) focusScreen();
  };
  function activate(button,event,action) {
    if(!open || button.disabled || button.closest?.('[hidden]'))return;
    const revision=viewRevision;
    touch.press(button,event,()=>{
      if(open && revision===viewRevision && !button.disabled && !button.closest?.('[hidden]'))action();
    });
  }
  const click = (id, action) => {
    const button=$(id);
    button.addEventListener('click',event=>activate(button,event,action));
  };
  const home=()=>screen==='home'?setOpen(false):show('home',true);
  function pressNavigation(id) {activate($(id),null,id==='phone-back'?back:home);}
  for(const key of Object.keys(prefs))click('phone-pref-'+key,()=>{
    prefs[key]=!prefs[key]; applyPreferences();
    try { storage?.setItem(settingsKey,JSON.stringify(prefs)); } catch {}
    render();
  });
  click('phone-open-wallpaper',()=>show('wallpaper'));
  click('phone-app-settings',()=>show('settings'));
  for(const id of papers)click('phone-wall-'+id,()=>{
    paper=id; handset.setAttribute('data-wallpaper',id);
    try { storage?.setItem(paperKey,id); } catch {}
    render();
  });
  click('phone-map-nearby', () => { page = 0; show('nearby'); }); click('phone-app-contacts', () => { $('phone-contact-search').value='';show('contacts'); });
  click('phone-app-bank', () => show('bank'));
  click('phone-bank-invest',()=>show('market'));
  for(const {symbol} of COMPANIES)click('phone-stock-'+symbol,()=>{
    selectedStock=symbol;$('phone-order-shares').value='1';$('phone-order-status').textContent='';show('order');
  });
  $('phone-order-shares').addEventListener('input',render);
  for(const side of ['buy','sell'])click('phone-order-'+side,()=>{
    const qty=$('phone-order-shares').value;
    const error=onTrade(selectedStock,side,qty,displayedPrice);
    $('phone-order-status').textContent=error || (side==='buy'?'Bought ':'Sold ')+qty+' '+selectedStock+' at '+formatMoney(displayedPrice/100)+'.';
    render();
  });
  click('phone-bank-transfer',()=>{ $('phone-bank-message').textContent='';$('phone-bank-amount').value='';$('phone-bank-direction').value='save';show('transfer'); });
  click('phone-bank-confirm',()=>{ const error=onTransfer($('phone-bank-direction').value,$('phone-bank-amount').value);
    if(error)$('phone-bank-message').textContent=error;else show('bank'); });
  click('phone-app-rides',()=>{quote=null;rideMessage='';$('phone-ride-search').value='';show('rides');findDestination();});
  $('phone-ride-search').addEventListener('input',()=>{
    stopSearch(); quoteRevision++; quote=null; quoting=false; destinationRows=[];
    rideMessage='Searching…';render();
    searchTimer=setTimeout(findDestination,300);
  });
  click('phone-destination-pin',()=>chooseDestination(state().mapPin));
  for(let i=0;i<5;i++)click('phone-destination-'+i,()=>chooseDestination(destinationRows[i]));
  click('phone-ride-request',()=>{if(!quote || !rides || rides.trip)return;rideMessage=rides.request(quote);
    if(rideMessage && rides.pickupChanged(quote)){chooseDestination(quote.destination);return;}
    if(rides.trip){rides.trip.pickupName=state().street;quote=null;}render();});
  click('phone-ride-cancel',()=>{rides?.cancel();quote=null;rideMessage='';$('phone-ride-search').value='';findDestination();});
  click('phone-ride-board',()=>{if(rides?.canBoard()){rides.board();render();}});
  click('phone-job-sector',()=>{
    jobMenu=jobMenu==='sector'?null:'sector';render();
  });
  click('phone-job-sort',()=>{jobMenu=jobMenu==='sort'?null:'sort';render();});
  for(let i=0;i<jobOptionCount;i++)click('phone-job-option-'+i,()=>{
    if(!jobOptions[i] || !jobMenu)return;
    if(jobMenu==='sector')sector=jobOptions[i];else jobSort=jobOptions[i];
    const trigger=$('phone-job-'+jobMenu);jobMenu=null;listPage=0;render();trigger.focus?.();
  });
  $('phone-job-search').addEventListener('input',()=>{listPage=0;render();});
  for(const tab of ['all','mine'])click('phone-job-'+tab,()=>{mine=tab==='mine';jobMenu=null;listPage=0;render();});
  $('phone-contact-search').addEventListener('input',render);
  click('phone-app-work',()=>{mine=false;boardPage=0;jobMenu=null;sector='All sectors';jobSort='Featured';$('phone-job-search').value='';onWork();});
  click('phone-map-stops',onTransport);
  click('phone-app-map',()=>show('maps'));
  click('phone-map-full',()=>{setOpen(false);onMap();});
  for (const item of CATEGORIES) click(`phone-chip-${item.id}`, () => { category = item.id; page = 0; render(); });
  $('phone-search').addEventListener('input', () => { page = 0; render(); });
  for (let i = 0; i < ROWS; i++) click(`phone-row-${i}`, () => { const row = rows[page * ROWS + i]; if (row) { chosen = row.place; show('place'); } });
  click('phone-prev', () => { page = Math.max(0, page - 1); render(); }); click('phone-next', () => { page++; render(); });
  click('phone-directions', () => { if (chosen) { onDirections(chosen); setOpen(false); } });
  for (let i = 0; i < ROWS; i++) click(`phone-ride-${i}`, () => { const row = visibleJobs[listPage * ROWS + i]; if (open && screen === 'list' && row) { const pick = listing.onPick; if (!listing.keepOpen) setOpen(false); pick(row); } });
  click('phone-ride-prev', () => { listPage--; render(); }); click('phone-ride-next', () => { listPage++; render(); });
  for(const c of contacts)click('phone-contact-'+c.id,()=>{contact=c;show('contact');});
  click('phone-contact-call',beginCall);
  click('phone-contact-message',()=>openThread());
  click('phone-app-messages',()=>show('messages'));
  for(let i=0;i<ROWS;i++)click('phone-inbox-'+i,()=>{const person=inbox[i];if(person)openThread(person);});
  click('phone-thread-send',sendThread);
  $('phone-thread-draft').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sendThread();}});
  click('phone-thread-prev',()=>{threadPage--;render();});
  click('phone-thread-next',()=>{threadPage++;render();});
  click('phone-thread-call',beginCall);
  click('phone-call-end',()=>{if(screen==='call')show(call?.from||'contact',true);});
  click('phone-app-camera',()=>{facing='rear';$('phone-camera-status').textContent='Rear camera';show('camera');});
  click('phone-camera-flip',()=>{
    facing=facing==='selfie'?'rear':'selfie';
    $('phone-camera-status').textContent=facing==='selfie'?'Front camera':'Rear camera';
    render();
  });
  click('phone-shutter',()=>{
    const image=onCapture(facing)||'';
    if(!image){$('phone-camera-status').textContent='The lens is still opening.';return;}
    photos.unshift({id:++photoSerial,facing,time:state().clock||'',image});
    photos.splice(SHOTS);
    savePhotos();
    $('phone-camera-status').textContent='Saved.';
    render();
  });
  click('phone-camera-roll',()=>show('gallery'));
  for(let i=0;i<SHOTS;i++)click('phone-shot-'+i,()=>{shot=photos[i];if(shot)show('photo');});
  click('phone-photo-delete',()=>{
    if(!shot)return;
    photos=photos.filter(item=>item!==shot);
    shot=null;savePhotos();show('gallery',true);
  });
  click('phone-cab-delivery',()=>{setOpen(false);onCab();});
  click('phone-back', back);
  click('phone-home-key',home);
  click('phone-close', () => setOpen(false));
  return {
    get open() { return open; },
    get pressPhase() { return touch.phase; },
    get screen() { return screen; },
    get facing() { return facing; },
    setOpen, handleKey, handlePad, focus:()=>focusScreen(true), toggle: navigation => setOpen(!open,navigation),
    /** Show a list to choose from: `rows` of { name, note }; `onPick(row)` is told which. */
    openList(title, rows, onPick, { message = '', keepOpen = false, app = 'work', board = false, refresh = null, onBack = null } = {}) { if(screen==='list' && listing?.board)boardPage=listPage; listing = { title, rows, onPick, message, keepOpen, app, board, refresh, onBack }; listPage = board ? boardPage : 0; setOpen(true); show('list'); },
    /** Keep the clock, the cash and the distances current while the phone is out. `time` is in seconds. */
    update(time = 0) {
      if(!open)return;
      if(screen==='call' && call){
        if(call.began==null)call.began=time;
        call.elapsed=Math.max(0,time-call.began);
        const connected=call.elapsed>=1.1;
        if(connected && !call.sent){call.sent=true;call.connected=true;call.contact.call?.();}
        call.connected=connected;
        const status=connected?'Connected':'Calling…';
        if($('phone-call-status').textContent!==status)render();
      }
      const live=screen==='call' || (screen==='rides' && rides?.trip);
      if(time-listed>(live?0.25:1)){listed=time;render();}
    },
  };
}
