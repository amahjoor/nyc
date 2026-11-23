import test from 'node:test';
import {createThumbPress} from '../dist/phone-touch.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIND } from '../dist/places.js';
import { createPhone, listPlaces, describePlace, formatDistance, CATEGORIES, ROWS } from '../dist/phone.js';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const place = (name, kind, x, z, extra = {}) => ({ id: name, kind, group: KIND[kind].group, name, x, z, bin: 0, area: 0, grade: '', ...extra });
const around = () => [place('FANELLI CAFE', 'american', 30, 0, { grade: 'A' }), place('RAYS', 'pizza', 100, 0), place('', 'bodega', 10, 5), place('LUCKY NAILS', 'nails', 400, 0), place('ONE TEN REPAIR', 'repair', 0, 900),
  place('THE EAR INN', 'bar', 60, 60), place('THUMA', 'coffee', 5, 0), place('HOTEL EDISON', 'hotel', 0, 250)];

// The page as far as the phone uses it: elements by id, with a text, a hidden flag, a value and listeners.
function page() {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) {
      const listeners = {}, attributes = {};
      elements.set(id, { id, hidden: false, disabled: false, textContent: '', value: '0', attributes, setAttribute: (name, value) => { attributes[name] = value; }, getAttribute: name => attributes[name],
        addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }, fire: name => (listeners[name] || []).forEach(listener => listener({})) });
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
  const ids = ['phone', 'phone-clock', 'phone-title', 'phone-home', 'phone-nearby', 'phone-place', 'phone-contacts', 'phone-bank', 'phone-map-nearby', 'phone-app-settings', 'phone-app-contacts', 'phone-app-bank', 'phone-app-map', 'phone-app-messages', 'phone-messages', 'phone-thread', 'phone-call', 'phone-messages-badge', 'phone-contact-message', 'phone-call-end', 'phone-thread-send', 'phone-thread-call',
    ...CATEGORIES.map(category => `phone-chip-${category.id}`), 'phone-search', 'phone-empty', 'phone-prev', 'phone-next', 'phone-page', 'phone-place-name', 'phone-place-kind', 'phone-place-note', 'phone-directions',
    'phone-contact-mechanic', 'phone-bank-balance', 'phone-bank-savings', 'phone-bank-transfer', 'phone-back', 'phone-close', 'place-hint'];
  for (let i = 0; i < ROWS; i++) ids.push(`phone-row-${i}`, `phone-row-${i}-name`, `phone-row-${i}-note`);
  for (const id of ids) assert.equal(html.split(`id="${id}"`).length, 2, `${id} appears once`);
  for (const category of CATEGORIES) assert.match(html, new RegExp(`id="phone-chip-${category.id}">${category.label}<`));
  assert.match(html, /<section id="phone" class="phone" hidden/);
  assert.match(html, /Open phone<\/span><kbd>↑<\/kbd>/);
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
  assert.deepEqual([$('phone-bank-balance').textContent, $('phone-bank-savings').textContent], ['$1,234.40', '$0']);
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
  for(const bad of ['-4','0','7.123','Infinity','1000']) assert.ok(bank.transfer(sim,'save',bad,'Noon'));
  assert.equal(bank.transfer(sim,'save','10.25','Noon'),'');
  assert.equal(sim.cash,20);assert.equal(bank.savings,1025);
  const restored=new PhoneBank();restored.restore(JSON.parse(JSON.stringify(bank.record())),sim.cash);
  assert.equal(restored.entries[0].amount,-1025);
  assert.ok(restored.transfer(sim,'withdraw','10.26','1 PM'));
  assert.equal(restored.transfer(sim,'withdraw','2.15','1 PM'),'');
  assert.equal(sim.cash,22.15);assert.equal(restored.savings,810);
  sim.cash+=5;restored.sync(sim.cash,'2 PM');restored.sync(sim.cash,'2 PM');
  assert.deepEqual(restored.entries.map(row=>row.amount),[500,215,-1025]);
});

test('D Ride passengers follow the dispatched driver, can hurry or stop early, and settle on drop-off', async()=>{
  const {CityRides}=await import('../dist/phone-services.js');
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
    for(let i=0;i<80;i++)step();
    assert.equal(sim.player.mode,'passenger');assert.equal(sim.player.x,car.x);assert.equal(sim.cash,60);
    assert.equal(car.rideDriver,trip.driver);assert.ok(car.x>4 && car.x<200);
    const normal=car.speed;
    rides.toggleHurry();for(let i=0;i<45;i++)step();
    assert.ok(car.speed>normal+2);assert.equal(car.siren,false);
    if(early)rides.stopEarly();
    for(let i=0;i<2200 && rides.trip;i++)step();
    assert.equal(rides.trip,null);assert.equal(sim.player.mode,'walk');assert.equal(sim.rideHoldCents,0);
    if(early)assert.ok(sim.player.x<170);else assert.ok(Math.abs(sim.player.x-230)<10);
    if(early)assert.ok(sim.cash<60 && sim.cash>60-quote.fare);else assert.equal(sim.cash,60-quote.fare);
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
  const {portfolio}=await import('../dist/market.js');
  const bank=new PhoneBank(),sim={cash:100},time=12345678;
  bank.restore(null,sim.cash);
  const stock=portfolio({},time).stocks[0];
  const trade=(side,count,price=stock.price,now=time)=>bank.trade(sim,stock.symbol,side,count,price,'Noon',now);
  assert.ok(trade('buy',0));assert.ok(trade('buy','1.2'));assert.ok(trade('buy',10000));assert.ok(trade('buy',1,stock.price+1));
  assert.equal(sim.cash,100);assert.equal(trade('buy',3),'');assert.ok(trade('sell',4));
  const saved=JSON.parse(JSON.stringify(bank.record()));bank.restore(saved,sim.cash);
  const later=time+3600000,newPrice=portfolio(bank.holdings,later).stocks[0].price;
  assert.notEqual(newPrice,stock.price);assert.equal(trade('sell',2,newPrice,later),'');
  assert.deepEqual(bank.holdings[stock.symbol],{shares:1,cost:stock.price});
  assert.equal(trade('sell',1,newPrice,later),'');assert.deepEqual(bank.holdings,{});
  assert.equal(sim.cash,(10000+3*(newPrice-stock.price))/100);assert.equal(bank.entries.length,3);
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
  const hand=createThumbPress(handset,layer,(x,y)=>taps.push([x,y]),()=>false);
  hand.reach(button,{type:'pointerdown',clientX:50,clientY:108});
  hand.press(button,null,()=>actions.push('open'));
  hand.press(button,null,()=>actions.push('duplicate'));
  assert.deepEqual(taps,[[.2,.22]]);
  assert.deepEqual(actions,[]);
  t.mock.timers.tick(86);
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
  const ui=page(), bank=new PhoneBank(),sim={cash:80};bank.restore(null,sim.cash);
  const phone=createPhone({$:ui.$,state:()=>({cash:sim.cash,bank:bank.record()}),onTrade:(...args)=>bank.trade(sim,...args,'Noon')});
  phone.setOpen(true);ui.click('phone-app-bank');ui.click('phone-bank-invest');ui.click('phone-stock-BGL');
  assert.equal(phone.screen,'order');assert.equal(ui.$('phone-order-sell').disabled,true);
  ui.click('phone-order-buy');assert.equal(bank.holdings.BGL.shares,1);
  assert.match(ui.$('phone-order-position').textContent,/1 shares? held/);
  ui.click('phone-back');assert.equal(phone.screen,'market');assert.match(ui.$('phone-stock-BGL-quote').textContent,/1 shares? held/);
  ui.click('phone-back');assert.equal(phone.screen,'bank');assert.equal(ui.$('phone-activity-0-name').textContent,'Bought 1 BGL');
});

function memory(){
  const box=new Map();
  return {getItem:key=>box.has(key)?box.get(key):null,setItem:(key,value)=>box.set(key,String(value))};
}

test('messages keep the mechanic thread, and a call can start from it',()=>{
  const {$,click}=page(), sent=[];
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
  assert.match($('phone-bubble-0-text').textContent,/\$90/);
  assert.equal($('phone-messages-badge').hidden,true);
  $('phone-thread-draft').value='How much?';
  click('phone-thread-send');
  assert.equal($('phone-bubble-1-who').textContent,'You · 3:10 PM');
  assert.equal($('phone-bubble-1-text').textContent,'How much?');
  assert.match($('phone-bubble-2-text').textContent,/Call-out is \$90/);
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
  assert.equal(again.$('phone-bubble-1-text').textContent,'How much?');
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
