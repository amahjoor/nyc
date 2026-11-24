import test from 'node:test';
import {createThumbPress} from '../dist/phone-touch.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { KIND } from '../dist/places.js';
import { createPhone, listPlaces, describePlace, formatDistance, CATEGORIES, ROWS } from '../dist/phone.js';
import { advanceRelationship, readRelationship, relationshipContext } from '../dist/phone-relationships.js';
import { handlePhoneChat } from '../scripts/phone-chat.mjs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const place = (name, kind, x, z, extra = {}) => ({ id: name, kind, group: KIND[kind].group, name, x, z, bin: 0, area: 0, grade: '', ...extra });
const around = () => [place('FANELLI CAFE', 'american', 30, 0, { grade: 'A' }), place('RAYS', 'pizza', 100, 0), place('', 'bodega', 10, 5), place('LUCKY NAILS', 'nails', 400, 0), place('ONE TEN REPAIR', 'repair', 0, 900),
  place('THE EAR INN', 'bar', 60, 60), place('THUMA', 'coffee', 5, 0), place('HOTEL EDISON', 'hotel', 0, 250)];

// The page as far as the phone uses it: elements by id, with a text, a hidden flag, a value and listeners.
function page() {
  const elements = new Map();
  function messageNode() {
    return { children:[], textContent:'', attributes:{},
      setAttribute(name,value){this.attributes[name]=value;},
      append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}},
      replaceChildren(){this.children.length=0;},
      get firstElementChild(){return this.children[0];},
      remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);},
    };
  }
  const $ = id => {
    if (!elements.has(id)) {
      const listeners = {}, attributes = {};
      elements.set(id, { id, hidden: false, disabled: false, textContent: '', value: '0', attributes, setAttribute: (name, value) => { attributes[name] = value; }, getAttribute: name => attributes[name],
        addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }, fire: (name,event={}) => (listeners[name] || []).forEach(listener => listener(event)) });
      const element=elements.get(id);
      if(id==='phone-map-pins' || id==='phone-met-contacts'){
        element.children=[];
        element.append=node=>{node.parent=element;element.children.push(node);};
        element.ownerDocument={createTextNode:text=>({textContent:text}),createElement:()=>{
          const button=Object.assign(messageNode(),{style:{},addEventListener(type,fn){this[type]=fn;}});
          return button;
        }};
      }
      if(id==='phone-thread-log')Object.defineProperties(element,Object.getOwnPropertyDescriptors(messageNode()));
      if(id==='phone-thread-log')element.ownerDocument={createElement:messageNode};
      if(id==='phone-thread-scroll'){
        let top=0;
        element.clientHeight=180;
        Object.defineProperties(element,{
          scrollHeight:{get:()=>$('phone-thread-log').children.length*60},
          scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(value,element.scrollHeight-element.clientHeight));}},
        });
      }
    }
    return elements.get(id);
  };
  return { $, elements, click: id => $(id).fire('click') };
}

test('distances read as a phone gives them, and a place is described by what it is and whether it is open', () => {
  assert.deepEqual([formatDistance(1), formatDistance(30), formatDistance(159), formatDistance(160), formatDistance(1609.344), formatDistance(5000)], ['10 FT', '100 FT', '520 FT', '0.1 MI', '1.0 MI', '3.1 MI']);
  assert.deepEqual(describePlace(around()[0], 13), { name: 'FANELLI CAFE', kind: 'RESTAURANT', status: 'OPEN', grade: 'GRADE A' });
  assert.deepEqual(describePlace(around()[2], 4), { name: 'DELI GROCERY', kind: 'DELI GROCERY', status: 'OPEN', grade: '' });
  assert.equal(describePlace(around()[3], 23).status, 'CLOSED');
});

test('the nearby list is the nearest first, narrowed by category and by what is typed', () => {
  const all = listPlaces(around(), { x: 0, z: 0, hours: 13 });
  assert.deepEqual(all.map(row => row.name), ['THUMA', 'DELI GROCERY', 'FANELLI CAFE', 'THE EAR INN', 'RAYS', 'HOTEL EDISON', 'LUCKY NAILS', 'ONE TEN REPAIR']);
  assert.equal(all[2].note, 'RESTAURANT · 100 FT · OPEN · GRADE A');
  assert.equal(all[1].note, '40 FT · OPEN', 'a place known only by its kind does not say it twice');
  assert.deepEqual(listPlaces(around(), { category: 'eat', x: 0, z: 0 }).map(row => row.name), ['FANELLI CAFE', 'RAYS']);
  assert.deepEqual(listPlaces(around(), { category: 'cars', x: 0, z: 0 }).map(row => row.name), ['ONE TEN REPAIR']);
  assert.deepEqual(listPlaces(around(), { category: 'drinks', x: 0, z: 0, hours: 9 }).map(row => row.note), ['BAR · 280 FT · CLOSED']);
  // Typing finds a name, or a kind of place.
  assert.deepEqual(listPlaces(around(), { query: ' ray ', x: 0, z: 0 }).map(row => row.name), ['RAYS']);
  assert.deepEqual(listPlaces(around(), { query: 'nail', x: 0, z: 0 }).map(row => row.name), ['LUCKY NAILS']);
  assert.deepEqual(listPlaces(around(), { query: 'hotel', category: 'eat', x: 0, z: 0 }), []);
  // Every category names groups of kinds the game knows; between them they cover every group.
  const groups = new Set(Object.values(KIND).map(kind => kind.group)), covered = new Set(CATEGORIES.flatMap(category => category.groups || []));
  assert.deepEqual([...groups].filter(group => !covered.has(group)), []);
  assert.deepEqual([...covered].filter(group => !groups.has(group)), []);
});

test('every part of the phone the game fills in is on the page', () => {
  const ids = ['phone', 'phone-clock', 'phone-title', 'phone-home', 'phone-nearby', 'phone-place', 'phone-contacts', 'phone-bank', 'phone-map-nearby', 'phone-app-settings', 'phone-app-contacts', 'phone-app-bank', 'phone-app-map', 'phone-app-messages', 'phone-app-camera', 'phone-messages', 'phone-thread', 'phone-call', 'phone-camera', 'phone-gallery', 'phone-photo', 'phone-messages-badge', 'phone-contact-message', 'phone-call-end', 'phone-thread-send', 'phone-thread-call', 'phone-shutter', 'phone-camera-flip', 'phone-camera-roll', 'phone-lens', 'phone-gallery-empty', 'phone-photo-delete',
    ...CATEGORIES.map(category => `phone-chip-${category.id}`), 'phone-search', 'phone-empty', 'phone-prev', 'phone-next', 'phone-page', 'phone-place-name', 'phone-place-kind', 'phone-place-note', 'phone-directions',
    'phone-contact-mechanic', 'phone-bank-balance', 'phone-bank-cash', 'phone-bank-locate', 'phone-back', 'phone-close', 'place-hint'];
  for (let i = 0; i < ROWS; i++) ids.push(`phone-row-${i}`, `phone-row-${i}-name`, `phone-row-${i}-note`);
  for (const id of ids) assert.equal(html.split(`id="${id}"`).length, 2, `${id} appears once`);
  for (const category of CATEGORIES) assert.match(html, new RegExp(`id="phone-chip-${category.id}">${category.label}<`));
  assert.match(html, /<section id="phone" class="phone" hidden/);
  assert.match(html, /Open phone<\/span><kbd>↑ \/ MIDDLE CLICK OUTSIDE WEAPON AIM<\/kbd>/);
});

test('right-clicking a phone map category keeps the key open and toggles back to all places', () => {
  const { $, click } = page();
  const phone=createPhone({ $, places:around });
  phone.toggle();click('phone-app-map');click('map-key-toggle');
  const coffee=$('mobile-key-coffee');
  let prevented=0;
  for(const pressed of ['true','false']){
    coffee.fire('contextmenu',{preventDefault(){prevented++;}});
    assert.equal(coffee.getAttribute('aria-pressed'),pressed);
    assert.equal($('map-key-options').hidden,false);
  }
  assert.equal($('mobile-key-all').getAttribute('aria-pressed'),'true');
  assert.equal(prevented,2);
});

test('the phone opens on its home screen, lists what is nearby, and sends the player to a place', () => {
  const { $, click } = page(), sent = [], opened = [];
  let now = { x: 0, z: 0, hours: 13, clock: '1:00 PM', cash: 1234.4, fares: 3, miles: 2.34, redLights: 2 };
  const phone = createPhone({ $, places: around, state: () => now, onDirections: target => sent.push(target.name), onMechanic: () => sent.push('mechanic'), onMap: () => sent.push('map'), onOpenChange: open => opened.push(open) });
  assert.equal(phone.open, false);
  phone.toggle();
  assert.deepEqual([phone.open, $('phone').hidden, $('phone-home').hidden, $('phone-nearby').hidden, $('phone-back').hidden], [true, false, false, true, true]);
  assert.deepEqual([$('phone-clock').textContent, $('phone-title').textContent, $('phone-search').value], ['1:00 PM', 'Home', '']);
  // Nearby: six to a page, nearest first.
  click('phone-app-map'); click('phone-map-nearby');
  assert.deepEqual([phone.screen, $('phone-nearby').hidden, $('phone-home').hidden, $('phone-back').hidden, $('phone-title').textContent], ['nearby', false, true, false, 'Nearby']);
  const names = () => Array.from({ length: ROWS }, (_, i) => $(`phone-row-${i}`).hidden ? null : $(`phone-row-${i}-name`).textContent);
  assert.deepEqual(names(), ['THUMA', 'DELI GROCERY', 'FANELLI CAFE', 'THE EAR INN', 'RAYS', 'HOTEL EDISON']);
  assert.deepEqual([$('phone-page').textContent, $('phone-prev').disabled, $('phone-next').disabled, $('phone-empty').hidden, $('phone-chip-all').getAttribute('aria-pressed')], ['1 / 2', true, false, true, 'true']);
  click('phone-next');
  assert.deepEqual(names(), ['LUCKY NAILS', 'ONE TEN REPAIR', null, null, null, null]);
  assert.deepEqual([$('phone-page').textContent, $('phone-prev').disabled, $('phone-next').disabled], ['2 / 2', false, true]);
  // A category, then a search.
  click('phone-chip-eat');
  assert.deepEqual(names(), ['FANELLI CAFE', 'RAYS', null, null, null, null]);
  assert.deepEqual([$('phone-chip-eat').getAttribute('aria-pressed'), $('phone-chip-all').getAttribute('aria-pressed'), $('phone-page').textContent], ['true', 'false', '1 / 1']);
  $('phone-search').value = 'thuma'; $('phone-search').fire('input');
  assert.deepEqual([names()[0], $('phone-empty').hidden], [null, false], 'no cafe of that name among places to eat');
  click('phone-chip-all');
  assert.deepEqual(names(), ['THUMA', null, null, null, null, null]);
  $('phone-search').value = ''; $('phone-search').fire('input');
  // A place: what it is, how far, and directions to it.
  click('phone-row-2');
  assert.deepEqual([phone.screen, $('phone-place-name').textContent, $('phone-place-kind').textContent, $('phone-place-note').textContent], ['place', 'FANELLI CAFE', 'RESTAURANT', '100 FT · OPEN · GRADE A']);
  // While the phone is out it follows the player and the clock, once a second.
  now = { ...now, x: 30, z: 300, hours: 4.5, clock: '4:30 AM' };
  phone.update(10); phone.update(10.5);
  assert.deepEqual([$('phone-place-note').textContent, $('phone-clock').textContent], ['0.2 MI · CLOSED · GRADE A', '4:30 AM']);
  click('phone-back');
  assert.equal(phone.screen, 'nearby');
  assert.equal(names()[0], 'HOTEL EDISON', 'the list is now nearest to where the player has got to');
  click('phone-row-0'); click('phone-directions');
  assert.deepEqual([sent, phone.open, $('phone').hidden], [['HOTEL EDISON'], false, true]);
  // Contacts and the bank.
  phone.setOpen(true);
  assert.equal(phone.screen, 'home', 'it opens on the home screen again');
  click('phone-app-bank');
  assert.deepEqual([$('phone-bank-cash').textContent, $('phone-bank-balance').textContent], ['$1,234.40', '$0']);
  click('phone-back'); click('phone-app-contacts'); click('phone-contact-mechanic'); assert.equal(phone.screen,'contact');click('phone-contact-call');
  assert.equal(phone.screen,'call');
  assert.equal($('phone-call-status').textContent,'Calling…');
  phone.update(0);
  assert.deepEqual(sent,['HOTEL EDISON'],'ringing does not dispatch the mechanic yet');
  phone.update(1.2);
  assert.equal($('phone-call-status').textContent,'Connected');
  assert.deepEqual([sent,phone.open],[['HOTEL EDISON','mechanic'],true]);
  click('phone-call-end');
  assert.equal(phone.screen,'contact');
  phone.setOpen(true); click('phone-app-map'); assert.equal(phone.screen,'maps');click('phone-map-full');
  assert.deepEqual([sent.at(-1), phone.open], ['map', false]);
  phone.setOpen(true); click('phone-close'); phone.setOpen(false);
  assert.deepEqual(opened, [true, false, true, false, true, false], 'the game is told each time it is taken out or put away, once');
  // With nothing loaded around, it says so.
  const empty = page(), bare = createPhone({ $: empty.$ });
  bare.setOpen(true); empty.click('phone-app-map'); empty.click('phone-map-nearby');
  assert.deepEqual([empty.$('phone-empty').hidden, empty.$('phone-page').textContent, empty.$('phone-next').disabled], [false, '', true]);
});

test('the arrow keys navigate home and the dock, Enter selects, and editing keeps native keys', () => {
  const { $ } = page();
  const doc = { activeElement: null };
  const home = [['settings', 0, 0], ['work', 60, 0], ['contacts', 0, 200], ['bank', 60, 200]];
  const apps = home.map(([name, left, top]) => {
    const app = $('phone-app-' + name);
    app.closest = () => null;
    app.focus = () => { doc.activeElement = app; };
    app.click = () => app.fire('click');
    app.getBoundingClientRect = () => ({ left, top, width: 50, height: 50 });
    return app;
  });
  $('phone').ownerDocument = doc;
  $('phone').contains = node => apps.includes(node);
  $('phone-home').querySelectorAll = () => apps;
  const phone = createPhone({ $ });
  function press(key) {
    let prevented = false;
    phone.handleKey({ key, preventDefault: () => { prevented = true; } });
    return prevented;
  }
  phone.setOpen(true);
  assert.equal(doc.activeElement.id, 'phone-app-settings');
  for (const [key, app] of [['ArrowUp', 'settings'], ['ArrowRight', 'work'], ['ArrowDown', 'bank'], ['ArrowLeft', 'contacts']]) {
    assert.equal(press(key), true);
    assert.equal(doc.activeElement.id, 'phone-app-' + app);
  }
  press('Enter');
  assert.equal(phone.screen, 'contacts');
  press('ArrowLeft');
  assert.equal(phone.screen,'home');
  assert.equal(doc.activeElement.id,'phone-app-contacts','Back restores the launcher selection');
  press('ArrowUp');press('Enter');
  assert.equal(phone.screen,'settings');
  doc.activeElement = { matches: () => true };
  assert.equal(press('ArrowLeft'), false);
  assert.equal(press('Backspace'), false);
  assert.equal(phone.screen, 'settings');
  press('Escape');
  assert.equal(phone.open, false);
  phone.setOpen(true);
  for(const code of ['KeyE','KeyG','KeyI'])assert.equal(phone.handleKey({code}),false);
  phone.handlePad(14);phone.handlePad(0);
  assert.equal(phone.screen,'settings');phone.handlePad(1);assert.equal(phone.screen,'home');
  phone.handlePad(9);assert.equal(phone.open,false);
});

test('bank transfers preserve total funds, reject invalid amounts and restore saved activity', async () => {
  const {PhoneBank}=await import('../dist/phone-services.js');
  const bank=new PhoneBank(), sim={cash:30.25};
  bank.restore(null,sim.cash);
  for(const bad of ['-4','0','7.123','Infinity','1000']) assert.ok(bank.transfer(sim,'deposit',bad,'Noon'));
  assert.equal(bank.transfer(sim,'deposit','10.25','Noon'),'');
  assert.equal(sim.cash,20);assert.equal(bank.checking,1025);
  const restored=new PhoneBank();restored.restore(JSON.parse(JSON.stringify(bank.record())),sim.cash);
  assert.equal(restored.entries[0].amount,1025);
  assert.ok(restored.transfer(sim,'withdraw','10.26','1 PM'));
  assert.equal(restored.transfer(sim,'withdraw','2.15','1 PM'),'');
  assert.equal(sim.cash,22.15);assert.equal(restored.checking,810);
  sim.cash+=5;restored.sync(sim.cash,'2 PM');restored.sync(sim.cash,'2 PM');
  assert.deepEqual(restored.entries.map(row=>row.amount),[500,-215,1025]);
});

test('the preferred tender covers a purchase in full or falls back without splitting balances',async()=>{
  const {PhoneBank}=await import('../dist/phone-services.js');
  const {payFor}=await import('../dist/money.js');
  const bank=new PhoneBank(),sim={cash:10,bank,bankClock:()=>'Noon'};
  bank.restore({checking:425},sim.cash);
  assert.equal(payFor(sim,1.25,'Lunch'),'card');
  assert.deepEqual([sim.cash,bank.checking],[10,300]);
  assert.equal(payFor(sim,7,'Shop'),'cash');
  assert.equal(payFor(sim,6,'Shop'),null);
  bank.preferredPayment='cash';
  assert.equal(payFor(sim,1,'Coffee'),'cash');
  assert.equal(payFor(sim,3,'Train'),'card');
  assert.deepEqual([sim.cash,bank.checking],[2,0]);
  const saved=new PhoneBank();saved.restore(bank.record(),sim.cash);
  assert.equal(saved.preferredPayment,'cash');
});

test('D Ride passengers follow the dispatched driver, can hurry or stop early, and settle on drop-off', async()=>{
  const {CityRides,PhoneBank}=await import('../dist/phone-services.js');
  const {Simulation}=await import('../dist/simulation.js');
  for(const [side,rear,early] of [[-1,false,true],[-1,true,false],[1,true,true]]){
    const street={id:'test-road',kind:'street',name:'Broadway',width:10,oneway:true,points:[[-240,8],[250,8]]};
    const sim=new Simulation({spawn:{x:0,z:0},bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},buildings:[],roads:[street],missionPoints:[]});
    sim.cash=60;sim.cars=[];
    const planner={plan:(a,b)=>({ok:true,distance:Math.abs(b.x-a.x),legs:[{distance:Math.abs(b.x-a.x),roadId:street.id,points:[[a.x,8],[b.x,8]]}]})};
    let paid=0;
    const rides=new CityRides(sim,{planner:()=>planner,paid:()=>paid++});
    const quote=await rides.quote({name:'Midtown',x:230,z:8});
    sim.cash=1;assert.match(rides.request(quote),/balance/);sim.cash=60;
    const byCard=side===1;
    if(byCard){
      sim.bank=new PhoneBank();sim.bank.restore(null,sim.cash);
      assert.equal(sim.bank.transfer(sim,'deposit','60','Noon'),'');
    }
    const balance=()=>byCard?sim.bank.checking/100:sim.cash;
    assert.equal(rides.request(quote),'');rides.cancel();assert.equal(sim.cars.length,0);
    assert.equal(rides.request(quote),'');
    const trip=rides.trip,car=trip.car, start=car.x;
    const step=()=>{sim.step({forward:-1,turn:1,moveX:-1},.05);rides.update();};
    for(let i=0;i<1500 && trip.phase==='approaching';i++){sim.step({},.05);rides.update();}
    assert.equal(trip.phase,'waiting');assert.ok(car.x>start+20);
    const along=rear?-1:.4;
    Object.assign(sim.player,{x:car.x+side*1.4*Math.cos(car.angle)+along*Math.sin(car.angle),
      z:car.z-side*1.4*Math.sin(car.angle)+along*Math.cos(car.angle)});
    assert.ok(rides.board());assert.equal(rides.board(),false);assert.equal(sim.player.vehicleId,car.id);
    assert.equal(car.passengerSeat.side,side);assert.equal(car.passengerSeat.along<0,rear);
    if(byCard){
      assert.equal(sim.ridePaymentMethod,'card');
      assert.ok(sim.bank.transfer(sim,'withdraw','60','Noon'));
      sim.bank.preferredPayment='cash';
    }
    for(let i=0;i<80;i++)step();
    assert.equal(sim.player.mode,'passenger');assert.equal(sim.player.x,car.x);assert.equal(balance(),60);
    assert.equal(car.rideDriver,trip.driver);assert.ok(car.x>4 && car.x<200);
    const normal=car.speed;
    rides.toggleHurry();for(let i=0;i<45;i++)step();
    assert.ok(car.speed>normal+2);assert.equal(car.siren,false);
    if(early)rides.stopEarly();
    for(let i=0;i<2200 && rides.trip;i++)step();
    assert.equal(rides.trip,null);assert.equal(sim.player.mode,'walk');assert.equal(sim.rideHoldCents,0);
    if(early)assert.ok(sim.player.x<170);else assert.ok(Math.abs(sim.player.x-230)<10);
    if(early)assert.ok(balance()<60 && balance()>60-quote.fare);else assert.equal(balance(),60-quote.fare);
    if(byCard){assert.equal(sim.cash,0);assert.equal(sim.bank.entries[0].name,'Ride fare');}
    const dx=sim.player.x-car.x, dz=sim.player.z-car.z;
    assert.equal(Math.sign(dx*Math.cos(car.angle)-dz*Math.sin(car.angle)),side);
    if(rear)assert.ok(dx*Math.sin(car.angle)+dz*Math.cos(car.angle)<-.5);
    assert.equal(car.passengerSeat,null);
    assert.equal(paid,1);
    rides.update();assert.equal(car.hired,false);
  }
});

test('stock orders settle the displayed price, retain remaining cost basis and survive reload',async()=>{
  const {PhoneBank}=await import('../dist/phone-services.js');
  const {listingBySymbol,sharePrice}=await import('../dist/market.js');
  const bank=new PhoneBank(),sim={cash:100},time=12345678;
  bank.restore({checking:10000},sim.cash);
  const company=listingBySymbol.get('F'),stock={symbol:'F',price:sharePrice(company,time)};
  const trade=(side,count,price=stock.price,now=time)=>bank.trade(sim,stock.symbol,side,count,price,'Noon',now);
  assert.ok(trade('buy',0));assert.ok(trade('buy','1.2'));assert.ok(trade('buy',10000));assert.ok(trade('buy',1,stock.price+1));
  assert.equal(sim.cash,100);assert.equal(trade('buy',3),'');assert.ok(trade('sell',4));
  const saved=JSON.parse(JSON.stringify(bank.record()));bank.restore(saved,sim.cash);
  const later=time+3600000,newPrice=sharePrice(company,later);
  assert.notEqual(newPrice,stock.price);assert.equal(trade('sell',2,newPrice,later),'');
  assert.deepEqual(bank.holdings[stock.symbol],{shares:1,cost:stock.price});
  assert.equal(trade('sell',1,newPrice,later),'');assert.deepEqual(bank.holdings,{});
  assert.equal(sim.cash,100);assert.equal(bank.checking,10000+3*(newPrice-stock.price));assert.equal(bank.entries.length,3);
});

test('Settings remembers the wallpaper and Nearby belongs to Maps',()=>{
  const values=new Map(), storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  assert.doesNotMatch(html,/id="phone-(?:app-nearby|home-street|contact-dispatch|contact-cab)"/);
  const first=page(), phone=createPhone({$:first.$,storage});phone.setOpen(true);
  first.click('phone-app-settings');first.click('phone-open-wallpaper');first.click('phone-wall-tide');
  assert.equal(first.$('phone-wall-tide').getAttribute('aria-pressed'),'true');
  const next=page(),again=createPhone({$:next.$,storage});again.setOpen(true);
  assert.equal(next.$('phone').getAttribute('data-wallpaper'),'tide');
  next.click('phone-app-map');next.click('phone-map-nearby');next.click('phone-back');
  assert.equal(again.screen,'maps');
});

test('phone display and time preferences persist and left steps back through the app',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const make=()=>{const ui=page(),phone=createPhone({$:ui.$,storage,state:()=>({hours:0,clock:'12:00 AM'})});phone.setOpen(true);return {...ui,phone};};
  const a=make();a.click('phone-app-settings');
  for(const option of ['clock','dark','large','motion'])a.click('phone-pref-'+option);
  a.click('phone-open-wallpaper');a.phone.handlePad(14);assert.equal(a.phone.screen,'settings');
  a.phone.handlePad(14);assert.equal(a.phone.screen,'home');
  const b=make();assert.equal(b.$('phone-clock').textContent,'00:00');
  for(const name of ['dark','large-text','reduce-motion'])assert.equal(b.$('phone').getAttribute('data-'+name),'true');
  b.click('phone-app-settings');b.click('phone-open-wallpaper');b.phone.handlePad(8);
  assert.equal(b.phone.screen,'home');
  b.click('phone-app-settings');b.click('phone-pref-clock');assert.equal(b.$('phone-clock').textContent,'12:00 AM');
});

test('thumb presses land at the pointer or focused button and cancel cleanly when the phone closes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const taps=[],pose={},actions=[];
  const layer={style:{},setAttribute:(key,value)=>pose[key]=value,animate:()=>({cancel(){}})};
  const handset={getBoundingClientRect:()=>({left:10,top:20,width:200,height:400}),ownerDocument:{defaultView:{
    getComputedStyle:()=>({transform:layer.style.transform,opacity:'1'})}}};
  const button={setAttribute(){},removeAttribute(){},getBoundingClientRect:()=>({left:40,top:100,right:140,bottom:140,width:100,height:40})};
  const hand=createThumbPress(handset,layer,(x,y)=>{taps.push([x,y]);return 160;},()=>false);
  hand.reach(button,{type:'pointerdown',clientX:50,clientY:108});
  hand.press(button,null,()=>actions.push('open'));
  hand.press(button,null,()=>actions.push('duplicate'));
  assert.deepEqual(taps,[[.2,.22]]);
  assert.deepEqual(actions,[]);
  t.mock.timers.tick(100);
  assert.equal(pose['data-pose'],'reach');
  assert.deepEqual(actions,[]);
  t.mock.timers.tick(61);
  assert.equal(pose['data-pose'],'press');
  t.mock.timers.tick(60);
  assert.deepEqual(actions,['open']);
  hand.cancel();
  hand.press(button,null,()=>actions.push('late'));
  assert.deepEqual(taps[1],[.4,.25]);
  hand.cancel();t.mock.timers.tick(500);
  assert.deepEqual(actions,['open']);assert.equal(hand.phase,'idle');
});

test('D Ride keeps the current map pin first and quotes its coordinates when selected',async()=>{
  const ui=page(), preset={name:'Union Square',x:480,z:180}, quoted=[];
  let mapPin=null;
  const rides={canBoard:()=>false,quote:async destination=>{
    quoted.push(destination);
    return {destination,distance:650,fare:7};
  }};
  const phone=createPhone({$:ui.$,rides,destinations:()=>[preset],state:()=>({x:0,z:0,cash:50,mapPin})});
  phone.setOpen(true);ui.click('phone-app-rides');
  assert.equal(ui.$('phone-destination-pin').hidden,true);
  assert.equal(ui.$('phone-destination-0').hidden,false);
  mapPin={...preset};
  phone.update(2);
  assert.equal(ui.$('phone-destination-pin').hidden,false);
  assert.match(ui.$('phone-destination-pin-note').textContent,/Union Square/);
  assert.equal(ui.$('phone-destination-0').hidden,true,'a matching preset appears only once');
  assert.ok(html.indexOf('id="phone-destination-pin"')<html.indexOf('id="phone-destination-0"'));
  mapPin={name:'Map pin',x:210,z:-325};
  phone.update(4);
  assert.equal(ui.$('phone-destination-0').hidden,false);
  ui.$('phone-ride-search').value='Broadway';ui.$('phone-ride-search').fire('input');
  assert.equal(ui.$('phone-destination-pin').hidden,false);
  ui.click('phone-destination-pin');await Promise.resolve();
  assert.deepEqual(quoted,[mapPin]);assert.equal(ui.$('phone-ride-destination').textContent,'Map pin');
  phone.handlePad(14);mapPin=null;phone.update(6);
  assert.equal(ui.$('phone-destination-pin').hidden,true);
});

test('boarding from the handset keeps the live fare on screen',()=>{
  const ui=page(),trip={phase:'waiting',destination:{name:'Union Square'},car:{x:0,z:0},driver:{name:'Alex',rating:4.9},fare:7,remaining:800};
  const rides={trip,canBoard:()=>trip.phase==='waiting',board:()=>{trip.phase='traveling';}};
  const phone=createPhone({$:ui.$,rides,state:()=>({x:0,z:0})});
  phone.setOpen(true);ui.click('phone-app-rides');ui.click('phone-ride-board');
  assert.equal(phone.open,true);assert.equal(phone.screen,'rides');
  assert.equal(ui.$('phone-ride-board').hidden,true);assert.match(ui.$('phone-ride-summary').textContent,/On trip/);
});

test('left from a fare returns to destination selection and an in-flight quote stays dismissed',async()=>{
  const ui=page(), place={name:'Downtown',x:1000,z:0};
  let resolve;
  const rides={quote:()=>new Promise(done=>{resolve=done;}),canBoard:()=>false};
  const phone=createPhone({$:ui.$,rides,destinations:()=>[place],state:()=>({x:0,z:0,cash:50})});
  phone.setOpen(true);ui.click('phone-app-rides');ui.click('phone-destination-0');
  phone.handlePad(14);
  resolve({destination:place,distance:1000,fare:7});await Promise.resolve();
  assert.equal(phone.screen,'rides');assert.equal(ui.$('phone-ride-request').hidden,true);
  ui.click('phone-destination-0');resolve({destination:place,distance:1000,fare:7});await Promise.resolve();
  assert.equal(ui.$('phone-ride-request').hidden,false);
  phone.handlePad(14);assert.equal(ui.$('phone-ride-picker').hidden,false);assert.equal(phone.screen,'rides');
  phone.handlePad(14);assert.equal(phone.screen,'home');
});

test('the handheld model maps HUD taps onto its own face in the posed hand',async()=>{
  const {createPhoneHand}=await import('../dist/phone-hand.js');
  const {Group,Vector3}=await import('../dist/vendor/three.module.min.js');
  const hand=createPhoneHand(1,2),parent=new Group();
  parent.position.set(8,3,-12);parent.rotation.y=1.1;
  hand.advance(.4,true);hand.hold(parent,.16,1.28,.39,false);
  for(const [x,y] of [[.5,.5],[.1,.15],[.9,.88]]){
    hand.tap(x,y);
    const point=hand.group.worldToLocal(hand.contactPoint(new Vector3()));
    assert.ok(point.distanceTo(new Vector3((x-.5)*.076,(.5-y)*.144,.006))<1e-6);
  }
  hand.advance(.1,true,true);hand.advance(.5,true,true);
  assert.equal(hand.tapBend,1,'a held button keeps the in-world thumb down');
  hand.advance(.2,true,false);assert.equal(hand.tapBend,0);

});

test('the Work board filters sectors, sorts pay, searches neighborhoods and shows accepted shifts',()=>{
  const ui=page();
  const jobs=[
    {name:'Barista',company:'Spring Coffee',sector:'Food',note:'SoHo',wage:78,distance:25},
    {name:'Mailroom clerk',company:'Harbor Post',sector:'Logistics',note:'St. George',wage:91,distance:500,active:true},
  ];
  const phone=createPhone({$:ui.$,onWork:()=>phone.openList('Work',jobs,()=>{},{board:true})});
  phone.setOpen(true);ui.click('phone-app-work');
  assert.equal(ui.$('phone-job-count').textContent,'2 listings');
  ui.click('phone-job-sort');ui.click('phone-job-option-2');assert.equal(ui.$('phone-ride-0-name').textContent,'Mailroom clerk');
  ui.click('phone-job-sector');ui.click('phone-job-option-1');assert.equal(ui.$('phone-ride-0-name').textContent,'Barista');
  assert.equal(ui.$('phone-ride-1').hidden,true);
  ui.click('phone-job-mine');assert.equal(ui.$('phone-ride-0-name').textContent,'Mailroom clerk');
  ui.$('phone-job-search').value='St. George';ui.$('phone-job-search').fire('input');
  assert.equal(ui.$('phone-job-count').textContent,'1 listing');
});

test('Bank investment screens place a whole-share order, update holdings and return to recent activity',async()=>{
  const {PhoneBank}=await import('../dist/phone-services.js');
  const ui=page(), bank=new PhoneBank(),sim={cash:80};bank.restore({checking:8000},sim.cash);
  const phone=createPhone({$:ui.$,state:()=>({cash:sim.cash,bank:bank.record()}),onTrade:(...args)=>bank.trade(sim,...args,'Noon')});
  phone.setOpen(true);ui.click('phone-app-bank');ui.click('phone-bank-invest');ui.click('phone-quote-0');
  assert.equal(phone.screen,'order');assert.equal(ui.$('phone-order-sell').disabled,true);
  ui.click('phone-order-buy');assert.equal(bank.holdings.F.shares,1);
  assert.match(ui.$('phone-order-position').textContent,/1 shares? held/);
  ui.click('phone-back');assert.equal(phone.screen,'market');assert.match(ui.$('phone-quote-0-name').textContent,/1 held/);
  ui.click('phone-back');assert.equal(phone.screen,'bank');assert.equal(ui.$('phone-activity-0-name').textContent,'Bought 1 F');
});

function memory(){
  const box=new Map();
  return {getItem:key=>box.has(key)?box.get(key):null,setItem:(key,value)=>box.set(key,String(value))};
}

test('messages keep the mechanic thread, and a call can start from it',()=>{
  const {$,click}=page(), sent=[];
  const bubble=index=>$('phone-thread-log').children[index];
  const storage=memory();
  const phone=createPhone({$,storage,state:()=>({clock:'3:10 PM'}),onMechanic:()=>sent.push('mechanic')});
  phone.setOpen(true);
  assert.equal($('phone-messages-badge').hidden,false);
  assert.equal($('phone-app-messages').getAttribute('aria-label'),'Messages, 1 unread');
  click('phone-app-messages');
  assert.equal($('phone-inbox-0-name').textContent,'Mechanic');
  assert.match($('phone-inbox-0-note').textContent,/\$90/);
  assert.equal($('phone-inbox-0').getAttribute('data-unread'),'true');
  click('phone-inbox-0');
  assert.equal(phone.screen,'thread');
  assert.equal($('phone-title').textContent,'Mechanic');
  assert.match(bubble(0).children[1].textContent,/\$90/);
  assert.equal($('phone-messages-badge').hidden,true);
  $('phone-thread-draft').value='How much?';
  click('phone-thread-send');
  assert.equal(bubble(1).children[0].textContent,'You · 3:10 PM');
  assert.equal(bubble(1).children[1].textContent,'How much?');
  assert.equal($('phone-thread-typing').hidden,false);
  phone.update(1);assert.equal(bubble(2),undefined);
  phone.update(2);
  assert.match(bubble(2).children[1].textContent,/Call-out is \$90/);
  assert.equal($('phone-thread-typing').hidden,true);
  click('phone-thread-call');
  phone.update(4);phone.update(5.2);
  assert.equal(phone.screen,'call');
  assert.deepEqual(sent,['mechanic']);
  click('phone-call-end');
  assert.equal(phone.screen,'thread');
  click('phone-back');
  assert.equal(phone.screen,'messages');
  const again=page(), restored=createPhone({$:again.$,storage,state:()=>({clock:'3:11 PM'})});
  restored.setOpen(true);again.click('phone-app-messages');again.click('phone-inbox-0');
  assert.equal(again.$('phone-inbox-0').getAttribute('data-unread'),'false');
  assert.equal(again.$('phone-thread-log').children[1].children[1].textContent,'How much?');
});

test('Maya receives nearby places and can reply after the phone is closed or restored',async()=>{
  const storage=memory(), requests=[];
  let x=15;
  const state=()=>({clock:'3:10 PM',hours:15,x,z:0});
  const places=()=>[...around(),place('ANOTHER PIZZA','pizza',230,0)];
  const generateMaya=async (rows,context)=>{
    requests.push({rows,context});
    const spot=context.nearby[0];
    return {text:`try ${spot.name}. it's ${spot.distance} from you`};
  };
  const options={storage,places,state,generateMaya};
  const ui=page(), phone=createPhone({$:ui.$,...options});
  phone.setOpen(true);ui.click('phone-app-messages');ui.click('phone-inbox-1');
  assert.equal(ui.$('phone-title').textContent,'Maya');
  ui.$('phone-thread-draft').value='anywhere for pizza';
  ui.click('phone-thread-send');
  assert.equal(ui.$('phone-thread-typing').hidden,false);
  phone.setOpen(false);
  const restoredUI=page(), restored=createPhone({$:restoredUI.$,...options});
  restored.update(2);
  await new Promise(resolve=>setImmediate(resolve));
  restored.setOpen(true);restoredUI.click('phone-app-messages');
  assert.equal(restoredUI.$('phone-inbox-0-name').textContent,'Maya');
  assert.equal(restoredUI.$('phone-inbox-0').getAttribute('data-unread'),'true');
  assert.match(restoredUI.$('phone-inbox-0-note').textContent,/RAYS/i);
  x=200;
  restoredUI.click('phone-inbox-0');restoredUI.$('phone-thread-draft').value='where';
  restoredUI.click('phone-thread-send');restored.update(4);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests[1].context.nearby[0].name,'RAYS');
  assert.equal(requests[1].context.nearby[0].distance,'330 ft');
  const message=index=>restoredUI.$('phone-thread-log').children[index].children[1].textContent;
  assert.match(message(4),/RAYS.*330 ft/i);
  assert.notEqual(message(4),message(2));
});

test('a long text thread opens at the latest message and stays put while reading back',async()=>{
  const {$,click}=page(), storage=memory();
  const rows=Array.from({length:16},(_,i)=>({who:i%2?'me':'them',text:'Text '+i}));
  storage.setItem('nyc-phone-messages',JSON.stringify({maya:{rows,seen:rows.length},mechanic:{seen:1}}));
  const phone=createPhone({$,storage,generateMaya:async ()=>'hey you'});
  phone.setOpen(true);click('phone-app-messages');click('phone-inbox-1');
  const history=$('phone-thread-scroll'), log=$('phone-thread-log');
  assert.equal(history.scrollTop,history.scrollHeight-history.clientHeight);
  assert.equal(log.children.length,16);
  assert.equal(log.firstElementChild.children[1].textContent,'Text 0');
  $('phone-thread-draft').value='hey';
  click('phone-thread-send');
  assert.equal(history.scrollTop,history.scrollHeight-history.clientHeight);
  history.scrollTop=60;
  phone.update(2);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(log.children.length,18);
  assert.equal(history.scrollTop,60);
  assert.equal($('phone-messages-badge').hidden,false);
  history.scrollTop=history.scrollHeight;
  history.fire('scroll');
  assert.equal($('phone-messages-badge').hidden,true);
  assert.doesNotMatch(html,/id="phone-thread-(?:prev|next|pager)"/);
});

test('Maya uses the recent transcript and game context for local generation and ignores a superseded reply',async()=>{
  const {$,click}=page(), requests=[];
  const generateMaya=(rows,context,signal)=>new Promise(resolve=>requests.push({rows,context,signal,resolve}));
  const phone=createPhone({$,places:around,state:()=>({clock:'3:10 PM',hours:15,x:0,z:0,street:'Greene St'}),generateMaya});
  const send=(text,time)=>{
    $('phone-thread-draft').value=text;
    click('phone-thread-send');phone.update(time);
  };
  const log=$('phone-thread-log'), text=()=>log.children.at(-1).children[1].textContent;
  phone.setOpen(true);click('phone-app-messages');click('phone-inbox-1');
  send('I missed the train.',2);
  assert.equal(requests.length,1);
  assert.equal(requests[0].rows[0].text,'hey you still in the city?');
  assert.equal(requests[0].context.street,'Greene St');
  assert.ok(requests[0].context.nearby.some(spot=>/rays/i.test(spot.name)));
  send('Actually I caught it.',4);
  assert.equal(requests[0].signal.aborted,true);
  assert.equal(requests[1].rows.at(-1).text,'Actually I caught it.');
  requests[0].resolve('take the next one');
  requests[1].resolve({text:'nice, did you get a seat?',model:'qwen3.5:2b-q4_K_M'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(text(),'nice, did you get a seat?');
  assert.equal(log.children.at(-1).attributes['data-reply-source'],'model');
  assert.match(log.children.at(-1).title,/qwen3.5:2b-q4_K_M/);
  assert.equal(log.children.length,4);
  assert.equal($('phone-thread-typing').hidden,true);
  send('not hungry anymore',7);
  requests[2].resolve('');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(text(),'not hungry anymore');
  assert.equal(log.children.length,5);
  assert.equal($('phone-thread-typing').hidden,true);
  assert.equal($('phone-thread-reply-error').hidden,false);
});

test('an unavailable Maya model preserves the text and retry resumes the saved conversation',async()=>{
  const storage=memory(), ui=page();
  const phone=createPhone({$:ui.$,storage,generateMaya:async()=>{throw new Error('Model offline');}});
  phone.setOpen(true);ui.click('phone-app-messages');ui.click('phone-inbox-1');
  ui.$('phone-thread-draft').value='how ar eyou';
  ui.click('phone-thread-send');phone.update(2);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.$('phone-thread-reply-error').hidden,false);
  assert.equal(ui.$('phone-thread-log').children.length,2);

  const requests=[], restoredUI=page();
  const restored=createPhone({$:restoredUI.$,storage,generateMaya:async rows=>{
    requests.push(rows.map(row=>row.text));
    return {text:"i'm good, just taking it easy. you?",model:'local-test'};
  }});
  restored.update(2);
  restored.setOpen(true);restoredUI.click('phone-app-messages');restoredUI.click('phone-inbox-0');
  const log=restoredUI.$('phone-thread-log');
  assert.equal(requests.length,0);
  assert.equal(restoredUI.$('phone-thread-reply-error').hidden,false);
  restoredUI.click('phone-thread-retry');restoredUI.click('phone-thread-retry');
  assert.equal(restoredUI.$('phone-thread-typing').hidden,false);
  assert.equal(restoredUI.$('phone-thread-reply-error').hidden,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests,[['hey you still in the city?','how ar eyou']]);
  assert.equal(log.children.length,3);
  assert.equal(log.children.at(-1).attributes['data-reply-source'],'model');
  assert.equal(restoredUI.$('phone-thread-typing').hidden,true);
});

test('the phone tries its own Maya endpoint on non-localhost game URLs',async t=>{
  const {$,click}=page(), storage=memory();
  $('phone').ownerDocument={defaultView:{location:{protocol:'https:',hostname:'game.example'},addEventListener(){}}};
  storage.setItem('nyc-phone-messages',JSON.stringify({maya:{rows:[
    {who:'me',text:'wanna hang'},
    {who:'them',text:'wait, what do you mean?'},
    {who:'them',text:'i’m in brooklyn rn. where’d you end up?',source:'scripted'},
  ]}}));
  const fetch=t.mock.method(globalThis,'fetch',async ()=>({
    ok:true,json:async ()=>({text:'hey you',model:'local-test'}),
  }));
  const phone=createPhone({$,storage,state:()=>({hours:1})});
  phone.setOpen(true);click('phone-app-messages');click('phone-inbox-1');
  $('phone-thread-draft').value='hey';
  click('phone-thread-send');phone.update(2);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fetch.mock.calls[0].arguments[0],'./api/phone/maya');
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body).rows,[
    {who:'me',text:'wanna hang'},{who:'me',text:'hey'},
  ]);
  assert.equal($('phone-thread-log').children.at(-1).title,'Local model · local-test');
});

async function postPhone(input) {
  const req=Readable.from([Buffer.from(JSON.stringify(input))]);
  Object.assign(req,{method:'POST',headers:{'content-type':'application/json'}});
  const res=new EventEmitter();
  res.writeHead=status=>{res.status=status;};
  res.end=body=>{res.body=JSON.parse(body);};
  await handlePhoneChat(req,res);
  return res;
}

test('Maya sends texts as distinct conversation turns and reports the model that replied',async t=>{
  const rows = [
    {who:'me',text:'wanna hang'},
    {who:'them',text:'maybe later. what part of town are you in?'},
    {who:'me',text:'mulberry st'},
  ];
  let payload;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({model:'local-test',message:{content:JSON.stringify({text:'oh nice, you gonna be there long?',event:'ordinary',remember:0,memoryKey:''})}})};
  });
  const {status,body}=await postPhone({rows,context:{street:'Mulberry St'}});
  assert.equal(status,200);
  assert.match(payload.messages[0].content,/Mulberry St/);
  assert.deepEqual(payload.messages.slice(1),rows.map(row=>({role:row.who==='me'?'user':'assistant',content:row.text})));
  assert.deepEqual(body,{text:'oh nice, you gonna be there long?',model:'local-test',event:'ordinary'});
});

test('the camera stores a street photo and a selfie, and deleting one leaves the other',async()=>{
  const {$,click}=page(), storage=memory(), sounds=[];
  const phone=createPhone({$,storage,state:()=>({clock:'9:01 PM'}),onSound:cue=>sounds.push(cue),onCapture:facing=>facing==='selfie'?'data:image/jpeg,selfie':'data:image/jpeg,street'});
  phone.setOpen(true);click('phone-app-camera');
  assert.deepEqual([phone.screen,phone.facing,$('phone-camera-status').textContent],['camera','rear','Rear camera']);
  click('phone-shutter');
  assert.equal($('phone-camera-status').textContent,'Saved.');
  click('phone-camera-flip');
  assert.equal(phone.facing,'selfie');
  assert.equal($('phone-lens').getAttribute('data-facing'),'selfie');
  assert.equal($('phone-camera-status').textContent,'Front camera');
  click('phone-shutter');
  assert.deepEqual(sounds,['phoneTap','phoneShutter','phoneTap','phoneShutter']);
  click('phone-camera-roll');
  assert.equal($('phone-shot-0-image').getAttribute('alt'),'Selfie');
  assert.equal($('phone-shot-1-image').getAttribute('src'),'data:image/jpeg,street');
  click('phone-shot-0');
  assert.equal($('phone-title').textContent,'Selfie');
  click('phone-photo-delete');
  assert.equal(phone.screen,'gallery');
  assert.equal($('phone-shot-0-image').getAttribute('alt'),'Photo');
  assert.equal($('phone-shot-1').hidden,true);
  const bare=page(), closed=createPhone({$:bare.$});
  closed.setOpen(true);bare.click('phone-app-camera');bare.click('phone-shutter');
  assert.equal(bare.$('phone-camera-status').textContent,'The lens is still opening.');
});

test('the rear lens looks ahead and the selfie looks back at the face',async()=>{
  const {PerspectiveCamera,Vector3}=await import('../dist/vendor/three.module.min.js');
  const {aimLens}=await import('../dist/phone-camera.js');
  const camera=new PerspectiveCamera(), ahead=new Vector3();
  aimLens(camera,{x:10,y:0,z:20,angle:0},{x:10,y:1.6,z:20},'rear');
  camera.getWorldDirection(ahead);
  assert.ok(camera.position.z>20 && ahead.z>0.5);
  aimLens(camera,{x:10,y:0,z:20,angle:Math.PI/2},{x:10,y:1.6,z:20},'selfie');
  camera.getWorldDirection(ahead);
  assert.ok(camera.position.x>10 && ahead.x<-0.5);
});

test('citywide ride legs pick up the lane and signal objects of each newly streamed block',async()=>{
  const {RideRoute}=await import('../dist/ride-route.js');
  const {Simulation}=await import('../dist/simulation.js');
  const road=(id,start,end)=>({id,kind:'residential',name:id,width:10,points:[[start,0],[end,0]]});
  const roads=[road('west',0,100),road('middle',100,200),road('east',200,300)];
  const sim=new Simulation({roads:roads.slice(0,2),spawn:{x:0,z:10},buildings:[],missionPoints:[],bounds:{minX:-500,minZ:-500,maxX:500,maxZ:500}});
  const trip=new RideRoute(roads.map(r=>({roadId:r.id,distance:100,points:r.points})));
  const car={_route:[]};trip.fill(sim,car);
  assert.deepEqual(car._route.map(e=>e.road.id),['west','middle']);
  car._route.shift();
  sim.setActiveCity({roads:roads.slice(1)});
  trip.fill(sim,car);
  assert.equal(car._route[1],sim._graph.edges.find(e=>e.road.id==='east'&&e.from.x===200));
  assert.equal(trip.unloaded,0);
});

test('third-person phone controls act immediately without reaching for the screen',()=>{
  const frame={left:0,top:0,width:200,height:400};
  const control={getBoundingClientRect:()=>frame};
  const handset={ownerDocument:{defaultView:{}},getBoundingClientRect:()=>frame};
  const layer={animate(){assert.fail('a tap was drawn in third person');}};
  const touch=createThumbPress(handset,layer,()=>assert.fail('a tap was started'),()=>false,()=>false);
  let actions=0;
  assert.equal(touch.reach(control),false);
  touch.press(control,null,()=>actions++);
  assert.equal(actions,1);assert.equal(touch.phase,'idle');
});

test('phone map pins survive walking past other businesses and wide zoom groups keep their members',()=>{
  const ui=page(),shops=Array.from({length:25},(_,i)=>place('Cafe '+i,'coffee',(i%5-2)*63,(Math.floor(i/5)-2)*60));
  let x=0;
  const phone=createPhone({$:ui.$,places:()=>shops,state:()=>({x,z:0,hours:12})});
  const layer=ui.$('phone-map-pins'),find=name=>layer.children.find(b=>b.attributes['aria-label']===name);
  phone.setOpen(true);ui.click('phone-app-map');
  assert.equal(layer.children.length,25);
  const cafe=find('Cafe 12'),left=cafe.style.left;
  x=28;phone.update(3);
  assert.equal(layer.children.length,25);
  assert.equal(find('Cafe 12'),cafe);
  assert.notEqual(cafe.style.left,left);
  ui.click('map-zoom-out');ui.click('map-zoom-out');
  const group=layer.children.find(button=>button.className==='map-pin-group');
  assert.ok(group);
  const count=group.textContent;
  x=36;phone.update(6);
  assert.ok(layer.children.includes(group));
  assert.equal(group.textContent,count);
  group.click({});
  assert.ok(find('Cafe 12'));
  assert.ok(!layer.children.includes(group));
  find('Cafe 12').click({});
  assert.equal(ui.$('phone-place-name').textContent,'Cafe 12');
});

test('Maps pins open their branch, with stable visitor reviews and branch-specific contact details',async()=>{
  const {matchBranch,mapsURL,contactLinks}=await import('../dist/place-guide.js');
  const {placeReviews}=await import('../dist/place-reviews.js');
  const {menuFor}=await import('../dist/menu.js');
  const katz=place("KATZ'S DELICATESSEN",'kosher',1197,111);
  const other=place(katz.name,'kosher',1521,3633);
  const catalog=JSON.parse(readFileSync(new URL('../dist/map-contacts/0_0.json',import.meta.url)));
  const branch=matchBranch(katz,catalog);
  assert.match(branch.address,/205.*HOUSTON/i);
  assert.equal(contactLinks(branch).website.hostname,'katzsdelicatessen.com');
  assert.equal(matchBranch(other,catalog),null);
  assert.equal(contactLinks({website:'javascript:alert(1)',phone:'0000000000'}).website,undefined);
  assert.equal(contactLinks({phone:'0000000000'}).tel,'');
  assert.match(new URL(mapsURL(katz,branch.address)).searchParams.get('query'),/205.*HOUSTON/i);
  const menu=menuFor(katz),reviews=placeReviews(katz,menu);
  assert.deepEqual(placeReviews({...katz,id:'citywide'},menu),reviews);
  assert.notDeepEqual(placeReviews(other,menu).notes,reviews.notes);
  assert.equal(new Set(reviews.notes.map(n=>n.author)).size,3);
  assert.ok(menu.includes(reviews.featured));
  const ui=page(),phone=createPhone({$:ui.$,places:()=>[katz,other],state:()=>({x:1195,z:112,hours:12})});
  phone.toggle();ui.click('phone-app-map');ui.$('phone-map-pins').children[0].click({});
  assert.equal(ui.$('phone-place-name').textContent,katz.name);
  ui.click('phone-back');assert.equal(phone.screen,'maps');
});

test('total money spans midnight, includes stock moves and survives a clock restart', async () => {
  const {PhoneBank}=await import('../dist/phone-services.js');
  const {listingBySymbol,sharePrice}=await import('../dist/market.js');
  const sim={cash:90,rideHoldCents:3000}, bank=new PhoneBank();
  bank.restore({savings:1000},sim.cash);
  const time=12345678, company=listingBySymbol.get('F'), price=sharePrice(company,time);
  bank.sampleBalance(sim.cash,23.5,time);
  assert.ok(bank.transfer(sim,'deposit','61',''));
  assert.equal(bank.transfer(sim,'deposit','40',''),'');
  assert.equal(bank.trade(sim,'F','buy',1,price,'',time),'');
  bank.sampleBalance(sim.cash,0,time);
  assert.deepEqual(bank.history,[[0,10000],[30,10000]]);
  const later=time+3600000, newValue=10000+sharePrice(company,later)-price;
  bank.sampleBalance(sim.cash,.5,later);
  assert.deepEqual(bank.history.at(-1),[60,newValue]);
  const copy=new PhoneBank();copy.restore(JSON.parse(JSON.stringify(bank.record())),sim.cash);
  copy.sampleBalance(sim.cash,12,later);
  assert.deepEqual(copy.history,bank.history);
  copy.sampleBalance(sim.cash,18,later);
  assert.equal(copy.history[0][0],60);
});

test('index details lead to a tracking fund or a searchable member list, and legacy BGL remains sellable', async () => {
  const {PhoneBank}=await import('../dist/phone-services.js');
  const {listingBySymbol,sharePrice}=await import('../dist/market.js');
  const bank=new PhoneBank(), sim={cash:20};
  bank.restore({savings:100000,holdings:{BGL:{shares:2,cost:1600}}},sim.cash);
  const old=listingBySymbol.get('BGL.OLD'), price=sharePrice(old,0);
  assert.equal(bank.holdings.BGL,undefined);
  assert.match(bank.trade(sim,old.symbol,'buy',1,price,'',0),/legacy/);
  assert.equal(bank.trade(sim,old.symbol,'sell',2,price,'',0),'');
  const ui=page(),phone=createPhone({$:ui.$,state:()=>({cash:sim.cash,bank:bank.record()}),onTrade:(...args)=>bank.trade(sim,...args,'')});
  phone.setOpen(true);ui.click('phone-app-stocks');
  ui.click('phone-index-2');assert.equal(ui.$('phone-stock-ticket').hidden,true);
  ui.click('phone-index-browse');
  const search=ui.$('phone-market-search');
  search.value='MSFT';search.fire('input');
  assert.equal(ui.$('phone-quote-0-symbol').textContent,'MSFT');
  search.value='NOT-A-SYMBOL';search.fire('input');assert.equal(ui.$('phone-holdings-empty').hidden,false);
  ui.click('phone-index-1');ui.click('phone-index-fund');
  assert.equal(ui.$('phone-order-symbol').textContent,'SPY');ui.click('phone-order-buy');
  assert.equal(bank.holdings.SPY.shares,1);assert.equal(sim.cash,20);
});

test('death and arrest take carried cash and a capped, cent-rounded checking fee', async()=>{
  const {PhoneBank}=await import('../dist/phone-services.js');
  for(const [checking,fee] of [[0,0],[1,0],[150,2],[10000,100],[900000,2500]]){
    for(const kind of ['wasted','busted']){
      const bank=new PhoneBank();
      bank.restore({checking,holdings:{F:{shares:2,cost:1700}}},80);
      assert.equal(bank.recordEndingLoss(kind,82.75,'Noon'),fee);
      bank.sync(0,'Noon');
      const restored=new PhoneBank();restored.restore(JSON.parse(JSON.stringify(bank.record())),0);
      assert.equal(restored.checking,checking-fee);
      assert.deepEqual(restored.holdings,{F:{shares:2,cost:1700}});
      assert.deepEqual(restored.entries.filter(e=>e.account==='Cash').map(e=>e.amount),[-8275,275]);
      assert.deepEqual(restored.entries.filter(e=>e.account==='Checking').map(e=>e.amount),fee?[-fee]:[]);
    }
  }
});

test('mutual interest, conflict, repair and breakups carry between exchanges',()=>{
  let state=readRelationship(null);
  function send(event,text){
    state=advanceRelationship(state,{event,text:'reply'},[{who:'me',text}]);
    return relationshipContext(state);
  }
  assert.equal(send('start_dating','be my girlfriend?').bond,'Friends');
  send('connection','you really came through for me');
  send('mutual_flirt','still thinking about your smile');
  assert.equal(send('mutual_flirt','you looked cute too').openToDating,true);
  assert.equal(send('start_dating','want to make this official?').bond,'Dating');
  send('hurt','I lied to you.');
  assert.equal(send('ordinary','hey').unresolvedConflict,'I lied to you.');
  assert.equal(send('repair','sorry I lied').mood,'Cooling off');
  assert.equal(send('repair','sorry I lied').mood,'Cooling off');
  assert.equal(send('repair','you deserved the truth').unresolvedConflict,'');
  assert.notEqual(send('break_up','I want to break up').bond,'Dating');
  assert.equal(relationshipContext(state).mutualInterest,false);
});

test('a new street contact keeps their own meeting and corrected memories through a reload and thread rollover',async()=>{
  const storage=memory(), ui=page(), requests=[];
  const options={storage,generateContact:async(rows,context)=>{
    requests.push(context);
    const latest=rows.at(-1).text;
    return {model:'local-test',text:'heard you '+latest,event:'ordinary',memory:latest.includes('sister')?{key:'sister',quote:latest,who:'me'}:null};
  }};
  const phone=createPhone({$:ui.$,...options});
  const npc={key:'resident/71',name:'Jules',story:['I sketch buildings.','Especially fire escapes.']};
  const entry={rows:[{who:'them',text:'I drew that fire escape.'}]};
  phone.exchangeNumbers(npc,entry,'Mulberry St');
  phone.exchangeNumbers(npc,entry,'Mulberry St');
  assert.equal(ui.$('phone-met-contacts').children.length,1);
  phone.setOpen(true);ui.click('phone-app-contacts');
  ui.$('phone-met-contacts').children[0].click({});
  assert.equal(ui.$('phone-contact-role').textContent,'Acquaintances');
  ui.click('phone-contact-message');
  let time=0;
  async function send(text){
    ui.$('phone-thread-draft').value=text;ui.click('phone-thread-send');phone.update(time+=4);
    await new Promise(resolve=>setImmediate(resolve));
  }
  await send('my sister is Lea');
  await send('my sister spells it Lia');
  assert.equal(requests[1].contact.name,'Jules');
  assert.deepEqual(requests[1].contact.meeting,entry.rows);
  for(let i=0;i<22;i++)await send('conversation '+i);
  const restoredUI=page(),restored=createPhone({$:restoredUI.$,...options});
  const history=restored.contactHistory(npc.key);
  assert.deepEqual(history.memories,[{key:'sister',who:'me',quote:'my sister spells it Lia'}]);
  assert.deepEqual(restored.contactHistory('maya').memories,[]);
  const saved=JSON.parse(storage.getItem('nyc-phone-messages'));
  assert.equal(saved[npc.key].rows.length,40);
  assert.ok(saved[npc.key].rows.every(row=>!row.text.includes('sister')));
  restored.setOpen(true);restoredUI.click('phone-app-messages');restoredUI.click('phone-inbox-0');
  assert.equal(restoredUI.$('phone-title').textContent,'Jules');
});

test('a repeated model reply gets one rewrite and memory is taken from the actual text',async t=>{
  const rows=[{who:'them',text:'Where did you end up?'},{who:'me',text:'at my sister’s diner'}];
  const outputs=[
    {text:'where did you end up!',remember:0,event:'ordinary',memoryKey:''},
    {text:'wait, your sister owns a diner?',remember:1,event:'ordinary',memoryKey:'sister'},
  ];
  const calls=[];
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    const payload=JSON.parse(init.body);calls.push(payload);
    return Response.json({model:payload.model,message:{content:JSON.stringify(outputs.shift())}});
  });
  const res=await postPhone({rows,context:{contact:{name:'Jules',background:'I like drawing.'}}});
  assert.equal(calls.length,2);assert.equal(res.status,200);
  assert.match(calls[0].messages[0].content,/You are Jules/);
  assert.doesNotMatch(calls[0].messages[0].content,/You are Maya/);
  assert.match(calls[1].messages[0].content,/fresh reply/);
  assert.deepEqual(res.body.memory,{key:'sister',who:'me',quote:'at my sister’s diner'});
});


test('brief answers to a location question leave the bond alone',()=>{
  const old=readRelationship(null);
  const rows=[{who:'them',text:'what part of town are you in?'},{who:'me',text:'mulberry st'},{who:'me',text:'chinatown'}];
  const next=advanceRelationship(old,{event:'connection'},rows);
  assert.equal(next.closeness,old.closeness);
  assert.equal(relationshipContext(next,next.lastExchangeAt+7*86400000).lastTexted,'7 days ago');
});

test('the default can use the installed smaller model when 4B is absent', {
  skip:Boolean(process.env.NYC_PHONE_MODEL || process.env.NYC_MAYA_MODEL),
},async t=>{
  const models=[];
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    const payload=JSON.parse(init.body);models.push(payload.model);
    if(models.length===1)return new Response('model not found',{status:404});
    return Response.json({model:payload.model,message:{content:JSON.stringify({text:'hey, how’s work?',event:'ordinary',remember:0,memoryKey:''})}});
  });
  const res=await postPhone({rows:[{who:'me',text:'hey'}]});
  assert.equal(res.status,200);
  assert.deepEqual(models,['qwen3.5:4b-q4_K_M','qwen3.5:2b-q4_K_M']);
  assert.equal(res.body.model,models[1]);
});
