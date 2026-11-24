import { streetLines } from './street-reactions.js';
import { greetPerson, encounter, savedConversations, streetIdentity, streetReply, talkToPerson } from './street-talk.js';
import { hasKitchen,kitchenRole,kitchenTicket,kitchenState,kitchenActions,trayReady,advanceKitchen } from './kitchen-shift.js';
import { deskTicket } from './service-desk.js';
import { salesCall } from './sales-calls.js';
import { customerUsesCash, drawerBalance } from './shop-turnover.js';
import { SHIFTS } from './shift-catalog.js';
import { formatMoney, payFor } from './money.js';
import { placeName } from './places.js';
import { driverOffer, driverEligible, startDriverOffer, tripInstruction } from './driver-work.js';
import { clothesFor } from './human-cast.js';
import { archivePiece } from './archive-stock.js';

// Clock-in locations and pay are shared by the board, directions and payroll.
export const EMPLOYERS = {
  kitchen: { name: 'Greene Street Grill', role: 'Fast-food crew', district:'SoHo · Manhattan', sector:'Food', duties:'Cook burgers to order, work the fryer and fill drinks for the lunch rush.', x: 138.65, z: -100.42, wage: 80, bonus: 8 },
  finance: { name: 'Wall Street Ledger', role: 'Finance associate', district:'Financial District · Manhattan', sector:'Office', duties:'Reconcile client balances and post incoming payments.', x: -773.41, z: 1820.86, wage: 120, bonus: 12 },
  ...SHIFTS,
};
const BLOCKS = ['9 AM', '11 AM', '1 PM', '3 PM'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const option = (name, note, choose) => ({ name, note, choose });
const count = (value, max) => Number.isInteger(value) && value >= 0 && value <= max ? value : 0;
const completedStreetAction = {
  ask: 'You already asked them for spare change.',
  sell: 'You already served this customer.',
  steal: 'You already took their wallet.',
};

function walletCash(person, random) {
  const look=person.look;
  const clothes=Number.isInteger(look?.member)?clothesFor(look.member,look.variant):null;
  const archiveValue=Math.max(0,...[clothes?.top,clothes?.bottom,clothes?.shoes].map(id=>archivePiece(id)?.price||0));
  const archive=archiveValue?Math.min(1,.45+Math.log1p(archiveValue/350)*.22):0;
  const formal=look?.outfit==='suit'?.9:look?.outfit==='office'?.35:0;
  const dress=Math.max(archive,formal), roll=random();
  // Clothes shift the odds. Every outfit can have an empty wallet or a lot of cash.
  if(roll<.18-.06*dress)return 0;
  if(roll<.57-.23*dress)return 1+Math.floor(random()*10);
  if(roll<.94-.12*dress)return 10+Math.floor(random()*(25+30*dress));
  return 40+Math.floor(random()*(100+60*dress));
}

function ledger(shift) {
  // The same open ticket survives closing the phone and loading a save.
  let seed = (shift.seed + Math.imul(shift.block, 0x9e3779b9)) >>> 0;
  const pick = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
  const opening = (25 + pick(80)) * 100, received = (2 + pick(15)) * 50, fee = (1 + pick(8)) * 25;
  const question = `Client balance ${formatMoney(opening)}. A payment of ${formatMoney(received)} came in and a ${formatMoney(fee)} fee went out. Post the closing balance.`;
  const answers = [opening + received - fee, opening + received, opening - received - fee].map(formatMoney);
  const correct = pick(3);
  [answers[0], answers[correct]] = [answers[correct], answers[0]];
  return { question, answers, correct };
}

export class Work {
  constructor({ sim, phone, meet, fronts, hours, guide, pedestrian, counter, save, speak = () => {}, openTalk, talkReply = streetReply, talkPlace = () => null, streetName = () => '', canTalk = person => pedestrian() === person, passengerTrip = () => null, random = Math.random, now = Date.now }) {
    Object.assign(this, { sim, phone, meet, fronts, hours, guide, pedestrian, counter, save, speak, openTalk, talkReply, talkPlace, streetName, canTalk, passengerTrip, random, now });
    this.offerSerial=Math.floor(random()*900);this.offers={};
    this.streetActions = { ask: new WeakSet(), sell: new WeakSet(), steal: new WeakSet() };
    this.restore();
  }

  restore(record = {}) {
    record = record || {};
    this.record = { shifts: count(record.shifts, 1e7), cart: record.cart === true, cups: 0, shift: null, tills: {}, sales: {}, closures: {}, tradingDay:count(record.tradingDay,1e8), businessMinute:count(record.businessMinute,1439), turnover:{} };
    this.record.conversations = savedConversations(record.conversations);
    if (this.record.cart) this.record.cups = count(record.cups, 12);
    this.record.booked = Object.hasOwn(EMPLOYERS, record.booked ?? '') ? record.booked : null;
    const s = record.shift;
    if (s && Object.hasOwn(EMPLOYERS, s.job) && Number.isInteger(s.block) && s.block >= 0 && s.block < BLOCKS.length) {
      this.record.shift = { job: s.job, seed: count(s.seed, 0xffffffff), block: s.block, correct: count(s.correct, s.block) };
    }
    const shift=this.record.shift;
    if(shift){
      shift.step=count(s.step,2);shift.clean=s.clean!==false;
      if(shift.job==='cashier')shift.change=count(s.change,2000);
      if(hasKitchen(shift.job))shift.kitchen=kitchenState(s.kitchen);
      if(hasKitchen(shift.job) && s.branch && typeof s.branch.id==='string' && typeof s.branch.name==='string' &&
        Number.isFinite(s.branch.x) && Number.isFinite(s.branch.z))shift.branch={id:s.branch.id,name:s.branch.name,x:s.branch.x,z:s.branch.z};
    }
    this.record.calls=count(record.calls,1e7);
    this.record.call=['hello','discovery','objection','close','declined'].includes(record.call)?record.call:null;
    this.record.lastCall=typeof record.lastCall==='string'?record.lastCall.slice(0,100):'';
    this.lastWeekday=null;
    this.receipts=new Map();
    for(const [id,rows] of Object.entries(record.turnover||{})){
      if(!Array.isArray(rows))continue;
      const days=new Map();
      for(const row of rows)if(Array.isArray(row) && Number.isInteger(row[0]) && row[0]>=Math.max(0,this.record.tradingDay-7) &&
        row[0]<=this.record.tradingDay && Number.isSafeInteger(row[1]) && row[1]>0)days.set(row[0],row[1]);
      if(days.size)this.record.turnover[id]=[...days].sort((a,b)=>a[0]-b[0]);
    }
    for(const [id,amount] of Object.entries(record.sales||{}))if(Number.isFinite(amount) && amount>0){
      this.record.sales[id]=Math.round(amount*100)/100;
      if(!record.turnover)this.record.turnover[id]=[[this.record.tradingDay,Math.round(amount*100)]];
    }
    for (const [id, until] of Object.entries(record.tills || {})) {
      if (Number.isFinite(until) && until > this.now()) this.record.tills[id] = until;
    }
    for (const [id, until] of Object.entries({...this.record.tills, ...record.closures})) {
      if (Number.isFinite(until) && until > this.now()) this.record.closures[id] = until;
    }
    this.updateClosures();
  }

  updateClosures() {
    const now = this.now(), closures = this.record.closures;
    for (const id of Object.keys(closures)) if (closures[id] <= now) delete closures[id];
    this.nextReopening = Math.min(Infinity, ...Object.values(closures));
    this.closureRevision = (this.closureRevision || 0) + 1;
  }

  isClosed(shop) {
    return this.record.closures[shop.id] > this.now();
  }

  closeShop(shop, until) {
    if (this.record.closures[shop.id] >= until) return;
    this.record.closures[shop.id] = until;
    this.updateClosures();
  }

  list(title, message, rows, board = false, app='work') {
    this.phone().openList(title, rows, row => row.choose(), { message, keepOpen: true, app, board, refresh:board ? ()=>this.jobs() : null, onBack:board || app==='rides' ? null : () => this.board() });
  }

  jobs() {
    const s = this.record.shift;
    const rows = Object.keys(EMPLOYERS).map(job => {
      const site=this.site(job);
      return {
        name:site.role, company:site.name, sector:site.sector, distance:distance(this.sim.player,site), wage:site.wage, pay:formatMoney(site.wage)+'–'+formatMoney(site.wage+4*site.bonus)+' / shift', active:s?.job===job || this.record.booked===job,
        note:site.district+' · '+(s?.job===job?'Shift in progress':this.record.booked===job?'Shift accepted':job==='kitchen'?'Burger grill':'On-site'),
        choose:()=>this.jobListing(job)
      };
    });
    rows.push({name:'Food courier',company:'Local restaurants',sector:'Logistics',pay:'Per order + time bonus',note:'Food delivery · Flexible hours',active:this.sim.mission.phase==='active' && Boolean(this.sim.mission.meal),choose:()=>this.food()},
      {name:'D Ride driver',company:'D Ride',sector:'Logistics',pay:'Quoted fare per ride',note:'Curbside pickups · Bring a car',active:this.sim.mission.phase==='active' && this.sim.mission.kind==='driver',choose:()=>this.driving('driver')},
      {name:'Business sales rep',company:'Borough Business Services',sector:'Office',pay:'$32 per trial booked',note:'Cold calling · Flexible hours',active:Boolean(this.record.call),choose:()=>salesCall(this)},
      {name:'Coffee cart',company:'Self-employed',sector:'Food',pay:'$5 per sale',note:this.record.cart ? `${this.record.cups} cups in stock` : 'Street vending · $60 startup',active:this.record.cart,choose:()=>this.coffee()},
      {name:'Newspaper carrier',company:'Borough Evening Post',sector:'Logistics',pay:'$18 per stop + time bonus',note:'Local paper round · Flexible hours',
        active:this.sim.mission.phase==='active' && this.sim.mission.kind==='paper',choose:()=>this.paper()});
    return rows;
  }

  board(message = '') {
    this.list('Work', message, this.jobs(), true);
  }

  jobListing(job) {
    const site=this.site(job), booked=this.record.booked===job, active=this.record.shift?.job===job;
    const rows=[];
    if(booked || active) {
      rows.push(option(active?'Resume shift':'Clock in','At the workplace',()=>this.job(job,true)));
      if(!active)rows.push(option('Release shift','Remove from My work',()=>{this.record.booked=null;this.save();this.board();}));
    } else if(!this.record.booked && !this.record.shift) {
      rows.push(option('Take shift','Add to My work',()=>{if(this.record.booked || this.record.shift)return this.board();this.record.booked=job;this.save();this.jobListing(job);}));
    }
    rows.push(option('Show workplace on map',site.name,()=>{this.phone().setOpen(false);this.guide(site);}));
    this.list(site.role,`${site.name} · ${site.district}. ${site.duties} 9 AM–5 PM. ${formatMoney(site.wage)} per shift plus ${formatMoney(site.bonus)} per quality bonus.`+
      (!booked && !active && (this.record.booked || this.record.shift)?' Finish or release your other shift first.':''),rows);
  }

  site(job){
    const shift=this.record.shift;
    return shift?.job===job && shift.branch?{...EMPLOYERS[job],...shift.branch,district:'Restaurant counter'}:EMPLOYERS[job];
  }

  counterShift(room){
    const job=kitchenRole(room.place.kind),shift=this.record.shift;
    if(!job || (this.record.booked && this.record.booked!==job) ||
      (shift && (shift.job!==job || shift.branch?.id!==room.place.id)))return null;
    const branch={id:room.place.id,name:placeName(room.place),x:room.x,z:room.z};
    return {name:shift?'Resume kitchen shift':'Clock in at '+branch.name,note:EMPLOYERS[job].role,run:()=>this.job(job,true,branch)};
  }

  job(job, clockIn=false, branch=null) {
    const current=this.record.shift, site=branch && !current?{...EMPLOYERS[job],...branch}:this.site(job);
    if ((this.record.booked && this.record.booked !== job) || (current && current.job !== job)) return this.board('Finish your current shift or quit it before taking a different job.');
    const branchId=current?.branch?.id || branch?.id;
    const onSite=()=>this.sim.player.mode==='walk' && !this.sim.heat && !this.sim.ending &&
      (branchId?this.sim.room?.place?.id===branchId:distance(this.sim.player,site)<=25);
    const quit=option('Quit shift','Leave without collecting this paycheck.',()=>{
      if(this.record.shift!==current)return this.board();
      this.record.shift=null;this.record.booked=null;this.save();this.board('You clocked out early.');
    });
    if(!onSite()){
      const rows=[option('Show workplace on map',site.name,()=>{this.phone().setOpen(false);this.guide(site);})];
      if(current)rows.push(quit);
      return this.list(site.name,'Return to the workplace on foot and clear any wanted level to clock in.',rows);
    }
    if(!current){
      if(!clockIn)return this.list(site.name,'Start your shift at 9 AM.',[option('Clock in',site.role,()=>this.job(job,true,branch))]);
      this.record.shift={job,seed:Math.floor(this.random()*0x100000000),block:0,correct:0,step:0,clean:true};
      if(branch)this.record.shift.branch=branch;
      if(hasKitchen(job))this.record.shift.kitchen=kitchenState();
      this.save();return this.job(job);
    }
    this.phone().setOpen(false);
    const block=current.block;
    const available=()=>this.record.shift===current && current.block===block && onSite();
    const finish=clean=>{
      if(!available())return;
      current.correct+=clean?1:0;current.block++;current.step=0;current.clean=true;
      if(job==='cashier')current.change=0;
      if(current.block<BLOCKS.length){
        if(hasKitchen(job))current.kitchen=kitchenState();
        this.save();this.job(job);return;
      }
      const pay=site.wage+current.correct*site.bonus;
      this.record.shift=null;this.record.booked=null;this.record.shifts++;this.sim.cash+=pay;
      this.save('Paycheck · '+site.name);
      const message='5 PM · '+current.correct+'/4 quality bonuses · Paycheck +'+formatMoney(pay);
      this.sim._say(message);this.board(message);
    };
    if(hasKitchen(job)){
      const t=kitchenTicket(current),k=current.kitchen;
      const stations=[];
      if(t.wantsMain)stations.push(['main',t.menu.station]);
      if(t.wantsSide)stations.push(['side',t.menu.sideStation]);
      if(t.wantsDrink)stations.push(['drink','Drink fountain']);
      const show=(station='tray',feedback='')=>{
        if(!available())return;
        const ready={main:k.main===5,side:k.side===2,drink:k.drink===2};
        const rows=kitchenActions(t,k,station).map(a=>option(a.name,'',()=>{
          if(!available())return;
          const note=a.run();this.save();show(station,note);
        }));
        const actions=rows.slice();
        const serve=()=>{
          if(!available() || !trayReady(t,k))return;
          this.sim._say(t.customer+' picked up order #'+t.number+'.',4);finish(k.clean);
        };
        if(trayReady(t,k))rows.push(option('Hand tray to '+t.customer,'Complete order #'+t.number,serve));
        for(const [id,label] of stations){
          if(id!==station)rows.push(option(label,ready[id]?'On tray':id==='main'?t.dish:id==='side'?t.sideName:t.drinkName,()=>show(id)));
        }
        rows.push(quit);
        const order=[t.wantsMain && t.dish,t.wantsMain && t.garnish,t.wantsSide && t.sideName,t.wantsDrink && t.drinkName].filter(Boolean).join(' · ');
        this.meet('Order #'+t.number+' · '+t.customer,order+(feedback?' — '+feedback:''),rows,available,
          {ticket:t,state:k,job,station,actions,serve,ready:trayReady(t,k),advance:dt=>advanceKitchen(k,dt),select:id=>show(id)});
      };
      return show();
    }
    const step=current.step;
    const next=()=>{if(available() && current.step===step){current.step++;this.save();this.job(job);}};
    if(job==='finance'){
      const task=ledger(current);
      const rows=step===0?[option('Open client ledger','Match payment and fee to account',next)]:
        task.answers.map((answer,i)=>option(answer,'Post to ledger',()=>{if(available() && current.step===step)finish(i===task.correct);}));
      return this.meet('Ledger · '+BLOCKS[block],step===0?'Payment batch '+(block+1)+' is ready to reconcile.':task.question,[...rows,quit],available);
    }
    const t=deskTicket(current);
    if(job==='cashier' && step===1){
      const cents=current.change || 0, due=Math.round(Number(t.result.slice(1))*100);
      const controls=[1000,500,100,25].map(value=>option('Count out '+formatMoney(value/100),'',()=>{
        if(!available() || current.step!==step || (current.change||0)!==cents)return;
        current.change=Math.min(2000,cents+value);this.save();this.job(job);
      }));
      controls.push(option('Return change to drawer','Start the count again',()=>{
        if(available() && current.step===step){current.change=0;this.save();this.job(job);}
      }),option('Hand change to customer',formatMoney(cents/100),()=>{
        if(!available() || current.step!==step)return;
        if(cents===due){next();return;}
        current.clean=false;this.save();this.sim._say('Count back from the purchase price to the amount tendered.');
        this.job(job);
      }),quit);
      return this.meet('Cash drawer',t.item+' · Counted out '+formatMoney(cents/100),controls,available);
    }
    const rows=step===0?[option(t.open,t.item,next)]:step===1?t.actions.map(a=>option(a.name,'',()=>{
      if(!available() || current.step!==step)return;
      if(a.match)next();
      else {current.clean=false;this.save();this.sim._say('Check the work slip before releasing this item.');this.job(job);}
    })):[option(t.complete,t.result,()=>finish(current.clean))];
    this.meet(step===1?t.station:t.desk,step===1?'Drag the work slip to a destination or select it below.':'',
      [...rows,quit],available,null,{from:site.name+' · '+BLOCKS[block],item:t.item,result:step===2?t.result:'',sorting:step===1});
  }

  food() {
    this.driving('courier');
  }

  driving(kind, app='work', message='') {
    const sim=this.sim, title=kind==='driver'?'D Ride driver':'Food courier', m=sim.mission;
    const list=(message,rows)=>this.list(title,message,rows,false,app);
    if(m.phase==='active'){
      if(m.kind!==kind)return list('Finish your current trip first.',[]);
      return list(tripInstruction(m),[
        option('Return to trip',m.target.name,()=>this.phone().setOpen(false)),
        option('Show stop on map',m.target.name,()=>{this.phone().setOpen(false);this.guide(m.target);}),
        option('Cancel trip','Forfeit this fare',()=>{
          if(sim.mission===m && m.phase==='active'){m.phase='failed';sim._say('Trip canceled.');}
          this.driving(kind,app);
        })
      ]);
    }
    if(this.passengerTrip())return list('Finish or cancel your passenger booking in D Ride first.',[]);
    const offer=driverOffer(this,kind,this.offerSerial);
    this.offers[kind]=offer;
    if(!offer)return list(kind==='courier'?'No open restaurant has an order nearby. Try another block or come back during meal service.':'No local rider requests. Try another street.',[
      option('Refresh requests','Check nearby again',()=>{this.offerSerial++;this.driving(kind,app);})
    ]);
    const accept=kind==='driver'?'Accept ride':'Accept order';
    list([message,kind==='driver'?offer.customer+' needs a ride.':offer.customer+' ordered '+offer.meal+'.',
      offer.pickup.name+' → '+offer.dropoff.name+' · '+offer.meters+' m apart · '+formatMoney(offer.reward)+(kind==='courier'?' + tip':' fare')].filter(Boolean).join(' '),[
      option(accept,kind==='driver'?'Use the car you are driving':'Collect at the restaurant entrance or counter',()=>{
        if(this.offers[kind]!==offer || this.passengerTrip())return this.driving(kind,app);
        if(kind==='driver' && !driverEligible(sim))return this.driving(kind,app,'Get into a passenger car to accept.');
        if(!startDriverOffer(sim,offer))return this.driving(kind,app,'Finish your current trip first.');
        this.offers[kind]=null;this.offerSerial++;this.phone().setOpen(false);
      }),
      option(kind==='driver'?'Decline ride':'Decline order','See the next request',()=>{
        if(this.offers[kind]===offer)this.offerSerial++;
        this.driving(kind,app);
      })
    ]);
  }

  paper() {
    const m=this.sim.mission;
    if(m.phase==='active')return this.list('Newspaper carrier',m.kind==='paper'?
      `Bundle ${m.index+1} of ${m.stops.length} · ${m.target.name}`:'Finish your current delivery first.',[
      option('Return to delivery','Follow the marker',()=>this.phone().setOpen(false))]);
    this.list('Newspaper carrier','Run bundles to two or three nearby corners. Stop on foot or by bike and use the interact control to leave each bundle. Finish early for up to $12 extra.',[
      option('Start paper round','$18 per stop, paid at the final drop',()=>{
        if(this.sim.startPaperRoute())this.phone().setOpen(false);
        else this.board(this.sim.notice);
      })]);
  }

  coffee() {
    const r = this.record;
    const rows = [option(r.cart ? 'Buy six cups' : 'Open a coffee cart', r.cart ? '$12 supplies · capacity 12' : '$60 · six cups included', () => {
      const cost = r.cart ? 12 : 60;
      if (r.cups > 6) return this.board('Sell some coffee before restocking.');
      if (!payFor(this.sim,cost,'Coffee cart supplies')) return this.board(`You need ${formatMoney(cost)} for that purchase.`);
      r.cart = true; r.cups += 6; this.save('Coffee cart supplies'); this.coffee();
    })];
    if (r.cart) rows.push(option('Offer coffee nearby', '$5 a cup', () => this.street()));
    this.list('Coffee cart', r.cart ? `${r.cups}/12 cups. Walk up to a pedestrian to make a sale.` : 'Start a sidewalk coffee business. Sell each cup for $5 to a different pedestrian.', rows);
  }

  street(message='', person=this.pedestrian()) {
    const rows = [];
    if(person?.post?.unit){
      const unit=person.post.unit;
      const answers={
        'traffic-agents':'I’m checking the parked cars on this block. Is that your car?',
        'traffic-ops':'I’m helping drivers through this light. Wait for the walk signal before you cross.',
        scene:'I’m documenting where we found the evidence. Could you leave this patch of pavement clear?',
        homicide:'I’m speaking to people who were here before patrol arrived. Did you see what happened?',
        collision:'I’m recording where the collision happened. Please give me room to work.',
        robbery:'I’m following up on a robbery report. I’m looking for people who were here at the time.',
        major:'We’re following up on the bank robbery. The staff and witnesses can help us piece it together.',
        auto:'A driver reported a carjacking here. I’m taking down the vehicle description.'
      };
      const reply=line=>{
        if(!this.canTalk(person))return;
        this.speak(person,line);
        this.street(line,person);
      };
      rows.push(option('Say hello','',()=>reply(person.post.caseId?'Hello. Please give us a little room here.':'Hi there. Can I help you?')),
        option('What are you working on?','',()=>reply(answers[unit.id] || 'My assignment today? '+unit.duty)));
      this.streetMenu(person,unit.name,message,rows);
      return;
    }
    if (person) {
      rows.push(option('Say hello', '', () => {
        if(!this.canTalk(person))return this.sim._say('They have moved on.');
        const line=greetPerson(this,person);
        this.speak(person,line);
        this.street(line,person);
      }));
      if(this.openTalk) rows.push(option('Talk for a while', '', () => talkToPerson(this,person)));
      const action = (kind, name, note, choose) => {
        const disabled = this.streetActions[kind].has(person);
        return { ...option(name, disabled ? completedStreetAction[kind] : note, choose), disabled };
      };
      rows.push(action('ask', 'Ask for spare change', 'They can say no.', () => this.trade(person, 'ask')));
      if (this.record.cart) rows.push(action('sell', 'Sell a coffee', `$5 · ${this.record.cups} cups left`, () => this.pourCoffee(person)));
      rows.push(action('steal', 'Steal wallet', 'A witness may report it.', () => this.trade(person, 'steal')));
    }
    if (!rows.length) return this.board('Walk up to a pedestrian and press E.');
    this.streetMenu(person,'Passerby',message,rows);
  }

  streetMenu(person,title,message,rows,available=()=>this.canTalk(person)) {
    if (!available()) return;
    this.meet(title,message,rows,available,null,null,()=>{delete person.talkingTo;});
    if (this.openTalk) person.talkingTo=this.sim.player;
  }

  pourCoffee(person,after){
    if(this.streetActions.sell.has(person))return this.sim._say(completedStreetAction.sell);
    if(!this.record.cups)return this.sim._say('Restock your coffee cart first.');
    const available=()=>this.canTalk(person) && !this.streetActions.sell.has(person) && this.record.cups>0;
    const milk=(person.resident?.id || 0)%2===0;
    const order=streetLines.choose(person,milk?'milkCoffee':'blackCoffee');
    this.speak(person,order);
    const serve=()=>this.streetMenu(person,'Coffee cart','One cup ready.',[
      option('Lid and hand over coffee','$5',()=>this.trade(person,'sell',after))
    ],available);
    this.streetMenu(person,'Coffee cart',order,[option('Pour hot coffee','Fill a paper cup',()=>{
      if(!available())return;
      this.streetMenu(person,'Coffee cart',order,[option(milk?'Add a splash of milk':'Leave it black','',serve)],available);
    })],available);
  }

  trade(person, action, after) {
    if (!person || !this.canTalk(person)) return this.sim._say('They have moved on.');
    const completed = this.streetActions[action];
    if (completed.has(person)) return this.sim._say(completedStreetAction[action]);
    if (action === 'sell' && (!this.record.cart || this.record.cups < 1)) return this.sim._say('Restock your coffee cart first.');
    completed.add(person);
    let amount, report;
    if (action === 'sell') { this.record.cups--; person.carry = 'cup'; amount = 5; }
    else if (action === 'ask') amount = this.random() < .55 ? 0 : 1 + Math.floor(this.random() * 4);
    else {
      amount = walletCash(person,this.random);
      person.state = 'flee'; person.mad = 5;
      report=this.sim.offence('pickpocket',{x:person.x,y:person.y,z:person.z,victim:person,message:'Wallet theft reported.'});
    }
    const reply=streetLines.choose(person,action==='steal'?'theft':action==='sell'?'coffee':amount?'give':'decline');
    const entry=encounter(this.record.conversations,streetIdentity(person).key);
    entry.pastEncounter=action==='sell'?'The player sold you a coffee.':action==='steal'?'This player took your wallet.':
      amount?'You gave the player spare change.':'The player asked for change and you declined.';
    this.speak(person, reply);
    if (action === 'ask' && amount) this.sim.moveEvents?.push({kind:'spareChange', x:person.x, y:person.y, z:person.z});
    this.sim.cash += amount; this.save(action==='sell'?'Coffee sale':undefined);
    const theftNotice=report==='called'?' A witness is calling police.':report==='seen'?' Police saw the theft.':'';
    const theft=amount?`Wallet +${formatMoney(amount)}.`:'The wallet had no cash.';
    this.sim._say(action === 'steal' ? theft+theftNotice : action === 'sell' ? 'Coffee sold. +$5.' : amount ? `They gave you $${amount}.` : 'They shake their head and keep walking.');
    after?.(reply);
  }

  advanceShopClock(weekday,hours) {
    if(!Number.isInteger(weekday)||!Number.isFinite(hours))return;
    if(this.lastWeekday!==null && weekday!==this.lastWeekday){
      this.record.tradingDay+=(weekday-this.lastWeekday+7)%7;
      this.record.businessMinute=0;this.record.sales={};
      for(const [id,rows] of Object.entries(this.record.turnover)){
        const recent=rows.filter(([day])=>day>=this.record.tradingDay-7);
        if(recent.length)this.record.turnover[id]=recent;
        else delete this.record.turnover[id];
      }
    }
    this.lastWeekday=weekday;
    this.record.businessMinute=Math.max(this.record.businessMinute,Math.min(1439,Math.floor(hours*60)));
  }

  sale(shop, price, tender='cash') {
    if(!shop?.id || !Number.isFinite(price) || price<=0 || this.isClosed(shop))return;
    const cents=Math.round(price*100), day=this.record.tradingDay;
    if(!cents)return;
    const rows=this.record.turnover[shop.id]??=[];
    const cash=tender==='cash' || tender==='customer' && customerUsesCash(shop,day,rows.at(-1)?.[0]===day?rows.at(-1)[1]:0);
    if(rows.at(-1)?.[0]===day)rows.at(-1)[1]+=cents;
    else rows.push([day,cents]);
    if(cash)this.record.sales[shop.id]=(Math.round((this.record.sales[shop.id]||0)*100)+cents)/100;
    const at=this.sim.elapsed||0;
    for(const [id,receipt] of this.receipts)if(at-receipt.at>=5)this.receipts.delete(id);
    this.receipts.set(shop.id,{cash,amount:cents/100,at});
  }

  receipt(shop){
    const last=this.receipts.get(shop.id);
    return last && (this.sim.elapsed||0)-last.at<5 ? last : null;
  }

  balance(shop, now = this.now()) {
    if(!shop?.id || this.record.tills[shop.id]>now)return 0;
    return drawerBalance(shop,this.record.tradingDay,this.record.businessMinute,this.record.turnover[shop.id],this.record.sales[shop.id]||0);
  }

  alarm(view,message) {
    if (view && this.sim.elapsed < view.alarmUntil) { this.sim._say(message); return; }
    this.sim.offence('robbery',{seen:true,localResponse:true,identified:false,message});
    if (view) view.alarmUntil=this.sim.elapsed+12;
  }

  rob(shop) {
    if (!shop || this.counter()?.id !== shop.id || this.isClosed(shop)) return 0;
    const now=this.now(), tills=this.record.tills, amount=this.balance(shop,now);
    if (!amount) { this.sim._say('The register is empty.'); return 0; }
    for (const id of Object.keys(tills)) if (tills[id] <= now) delete tills[id];
    if (!(tills[shop.id]>now)) tills[shop.id]=now+600000;
    this.closeShop(shop,tills[shop.id]);
    delete this.record.sales[shop.id];
    this.sim.cash += amount;
    const view=this.sim.doorway;
    const message='Till +'+formatMoney(amount)+'. Shop closed after the robbery.';
    this.alarm(view,message);
    if (view) {
      view.handoff={phase:'alarmed',age:0,safeTime:0};
    }
    this.save();
    return amount;
  }
}
