import { hasKitchen,kitchenRole,kitchenTicket,kitchenState,kitchenActions,trayReady,advanceKitchen } from './kitchen-shift.js';
import { deskTicket } from './service-desk.js';
import { salesCall } from './sales-calls.js';
import { customerUsesCash, drawerBalance } from './shop-turnover.js';
import { SHIFTS } from './shift-catalog.js';
import { formatMoney } from './money.js';
import { isOpen, placeName } from './places.js';
import { menuFor } from './menu.js';

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
  constructor({ sim, phone, meet, fronts, hours, guide, pedestrian, counter, save, random = Math.random, now = Date.now }) {
    Object.assign(this, { sim, phone, meet, fronts, hours, guide, pedestrian, counter, save, random, now });
    this.met = new WeakSet();
    this.restore();
  }

  restore(record = {}) {
    record = record || {};
    this.record = { shifts: count(record.shifts, 1e7), cart: record.cart === true, cups: 0, shift: null, tills: {}, sales: {}, closures: {}, tradingDay:count(record.tradingDay,1e8), businessMinute:count(record.businessMinute,1439), turnover:{} };
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

  list(title, message, rows, board = false) {
    this.phone().openList(title, rows, row => row.choose(), { message, keepOpen: true, app:'work', board, refresh:board ? ()=>this.jobs() : null, onBack:board ? null : () => this.board() });
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
    rows.push({name:'Food courier',company:'Local restaurants',sector:'Logistics',pay:'Per order + time bonus',note:'Citywide · Flexible hours',active:this.sim.mission.phase==='active' && Boolean(this.sim.mission.meal),choose:()=>this.food()},
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
    if (this.sim.mission.phase === 'active') {
      const target=this.sim.mission.target;
      return this.list('Current delivery',target?.name || 'Follow the delivery marker.',[
        option('Return to delivery','Follow the marker in the city',()=>this.phone().setOpen(false))]);
    }
    const candidates = this.fronts().filter(f => ['food', 'dining', 'cafe'].includes(f.place.group) && !this.isClosed(f.place) && isOpen(f.place.kind, this.hours()))
      .sort((a, b) => distance(a, this.sim.player) - distance(b, this.sim.player));
    const front = candidates[0];
    const pickup = front ? { name: placeName(front.place), x: front.x + front.nx * 3.2, z: front.z + front.nz * 3.2 } : { ...EMPLOYERS.kitchen };
    const items = front && menuFor(front.place);
    const meal = items?.find(item => item.effect === 'meal')?.name || 'Lunch special';
    this.list('Food courier', `${pickup.name} has a ${meal.toLowerCase()} ready. Stop at the gold marker to collect it, then follow it to the customer.`, [
      option('Accept order', 'Delivery fee + time bonus at drop-off', () => {
        if (!this.sim.startMission({ pickup, meal })) return this.board(this.sim.notice);
        this.phone().setOpen(false);
      }),
    ]);
  }

  paper() {
    const m=this.sim.mission;
    if(m.phase==='active')return this.list('Newspaper carrier',m.kind==='paper'?
      `Bundle ${m.index+1} of ${m.stops.length} · ${m.target.name}`:'Finish your current delivery first.',[
      option('Return to delivery','Follow the marker',()=>this.phone().setOpen(false))]);
    this.list('Newspaper carrier','Run bundles to two or three nearby corners. Stop at each marked address in order. Finish early for up to $12 extra.',[
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
      if (this.sim.cash - (this.sim.rideHoldCents||0)/100 < cost) return this.board(`You need ${formatMoney(cost)} for that purchase.`);
      this.sim.cash -= cost; r.cart = true; r.cups += 6; this.save('Coffee cart supplies'); this.coffee();
    })];
    if (r.cart) rows.push(option('Offer coffee nearby', '$5 a cup', () => this.street()));
    this.list('Coffee cart', r.cart ? `${r.cups}/12 cups. Walk up to a pedestrian to make a sale.` : 'Start a sidewalk coffee business. Sell each cup for $5 to a different pedestrian.', rows);
  }

  street(message='') {
    const person = this.pedestrian();
    const rows = [];
    if (person) {
      rows.push(option('Say hello', '', () => {
        if(this.pedestrian()!==person)return this.sim._say('They have moved on.');
        const replies=['I slept outside last night. It’s good to talk to someone.', 'Morning’s my favorite time on this block.', 'I’m looking for somewhere to stay tonight. How’s your day going?', 'Hey. Good to see a friendly face.'];
        this.street(person.resident ? replies[person.resident.id%replies.length] : 'Hey, how’s it going?');
      }));
      rows.push(option('Ask for spare change', 'They can say no.', () => this.trade(person, 'ask')));
      if (this.record.cart) rows.push(option('Sell a coffee', `$5 · ${this.record.cups} cups left`, () => this.trade(person, 'sell')));
      rows.push(option('Steal wallet', 'Reported crime · one wanted star', () => this.trade(person, 'steal')));
    }
    if (!rows.length) return this.board('Walk up to a pedestrian and press G.');
    this.meet('Passerby', message, rows, () => this.pedestrian() === person);
  }

  trade(person, action) {
    if (!person || this.pedestrian() !== person) return this.sim._say('They have moved on.');
    if (this.met.has(person)) return this.sim._say('You already spoke to this person.');
    if (action === 'sell' && (!this.record.cart || this.record.cups < 1)) return this.sim._say('Restock your coffee cart first.');
    this.met.add(person);
    let amount;
    if (action === 'sell') { this.record.cups--; person.carry = 'cup'; amount = 5; }
    else if (action === 'ask') amount = this.random() < .55 ? 0 : 1 + Math.floor(this.random() * 4);
    else {
      amount = 6 + Math.floor(this.random() * 20);
      person.state = 'flee'; person.mad = 5;
      // Whoever it was taken from tells the police themselves.
      this.sim.offence('theft', { seen: true, message: 'Wallet theft reported.' });
    }
    this.sim.cash += amount; this.save(action==='sell'?'Coffee sale':undefined);
    this.sim._say(action === 'steal' ? `Wallet +$${amount}. Theft reported.` : action === 'sell' ? 'Coffee sold. +$5.' : amount ? `They gave you $${amount}.` : 'They shake their head and keep walking.');
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
    this.sim.offence('robbery',{seen:true,message});
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
    if (view?.handoff) this.sim._say(message);
    else this.alarm(view,message);
    if (view) {
      view.handoff={phase:'alarmed',age:0,safeTime:0};
    }
    this.save();
    return amount;
  }
}
