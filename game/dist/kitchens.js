// Every eating place has a kitchen of its own kind: a whole line behind a pass
// at the back of a dining room, a wok range behind a take-out counter, one
// deck oven in a slice shop. This fits each to the room a style has laid out,
// and writes down where each job is done (room.kitchen) for the cooks.
const STEEL='#a6aeaa', WALNUT='#655045';

// What can stand in a line: [shape, across, deep, high, what is done there, options, work height].
const MODULES={
  range:['gasRange',.9,.75,.92,['range'],{},.93],
  pots:['gasRange',.9,.75,.92,['range','steam'],{pots:true},.93],
  flat:['flatTop',.9,.75,.92,['flat'],{},.93],
  char:['flatTop',.9,.75,.92,['grill'],{char:true},.93],
  fryer:['fryer',.5,.75,.92,['fry'],{},.86],
  fryers:['fryer',.9,.75,.92,['fry'],{},.86],
  wok:['kitchenRange',1.3,.6,2.01,['wok'],{wok:true},.87],
  prep:['prepTable',1.2,.7,.9,['board'],{},.92],
  fridge:['reachIn',.75,.78,2.0,['cold'],{},1.0],
  sink:['dishSink',1.4,.65,.9,[],{},.9],
  stock:['stockBurner',.6,.6,.5,['steam'],{},.98],
  kettle:['stockBurner',.7,.7,.5,['range'],{kettle:true},.82],
  tandoor:['tandoor',.7,.7,.95,['oven'],{},.95],
  smoker:['smoker',.9,.8,1.9,['smoker'],{},1.0],
  sandwich:['sandwichUnit',1.2,.75,1.1,['board','cold'],{},.89],
  dough:['doughBench',1.4,.7,.92,['board'],{},.94],
  donuts:['donutFryer',1.0,.7,.92,['fry'],{},.88],
  bake:['rackOven',.95,.85,2.0,['oven'],{},1.05],
  mixer:['mixer',.55,.6,1.3,[],{},1.0],
  dip:['dipCabinet',1.4,.7,1.05,['scoop'],{},.87],
  soft:['softServe',.55,.7,1.5,['scoop','blender'],{},.76],
  pack:['packingBench',1.1,.5,1.7,['pass'],{},.93],
};
const HOT=new Set(['range','pots','flat','char','fryer','fryers','stock','kettle','tandoor','donuts']);

const kitchenOf=r=>r.kitchen??={stations:[]};
/** Note where a job is done. The first place given for a job is the one used. */
function station(r,kind,thing,{a=thing.a,b=thing.b,top}={}) {
  const k=kitchenOf(r);
  if(!k.stations.some(s=>s.kind===kind))k.stations.push({kind,thing,a,b,face:thing.face||[0,-1],top});
}
const take=(r,test)=>{const i=r.things.findIndex(test);return i<0?null:r.things.splice(i,1)[0];};
/** Take away a table with the seats at it and whatever is laid on it. */
function clearTable(r,table) {
  const seats=r.seats.filter(s=>Math.hypot(s.a-table.a,s.b-table.b)<1.25 && (table.a-s.a)*s.da+(table.b-s.b)*s.db>0);
  r.seats=r.seats.filter(s=>!seats.includes(s));
  r.things=r.things.filter(t=>t!==table && !seats.some(s=>t.solid && t.a===s.a && t.b===s.b) &&
    !(!t.solid && t.y>=table.h-.03 && t.y<table.h+.3 && Math.abs(t.a-table.a)<=table.w/2 && Math.abs(t.b-table.b)<=table.d/2));
}
/** Clear the dining furniture out of a part of the floor: a <= |..| box in room coordinates. */
function clearFloor(r,a0,a1,b0,b1) {
  const hit=(a,b,w,d)=>a+w/2>a0 && a-w/2<a1 && b+d/2>b0 && b-d/2<b1;
  for(const table of r.things.filter(t=>t.shape==='table')){
    const seats=r.seats.filter(s=>Math.hypot(s.a-table.a,s.b-table.b)<1.25 && (table.a-s.a)*s.da+(table.b-s.b)*s.db>0);
    if(hit(table.a,table.b,table.w,table.d) || seats.some(s=>hit(s.a,s.b,.5,.5)))clearTable(r,table);
  }
  const loose=r.seats.filter(s=>hit(s.a,s.b,.4,.4));
  r.seats=r.seats.filter(s=>!loose.includes(s));
  r.things=r.things.filter(t=>!loose.some(s=>t.solid && t.a===s.a && t.b===s.b));
}

/**
 * Stand equipment in a row against a wall. `wall` is 'back', or -1 / 1 for a
 * side wall; the row runs from `from` to `to` along it. `want` lists modules
 * most needed first; they stand in the order of `order`. What does not fit is
 * left out. `deep` caps how far the row comes out from the wall.
 */
function line(r,prop,{wall='back',from,to,want,order=want,deep=.8,inset=.02,hood=true}) {
  let room=to-from;
  const chosen=[];
  for(const name of want){
    const across=MODULES[name][1];
    if(across+.03<=room){chosen.push(name);room-=across+.03;}
  }
  const row=order.filter(name=>chosen.includes(name)), placed=[];
  // Spread what is left over between the pieces, a little, so the row fills its wall.
  const slack=Math.min(.12,room/Math.max(1,row.length));
  let at=from+slack/2, hot=null;
  for(const name of row){
    const [shape,across,depth,high,jobs,more,top]=MODULES[name], d=Math.min(depth,deep), mid=at+across/2;
    const back=wall==='back';
    const a=back?mid:wall*(r.half-inset-d/2), b=back?r.depth-inset-d/2:mid;
    prop(shape,a,b,back?across:d,back?d:across,high,shape==='smoker'?'#26292b':STEEL,{face:back?[0,-1]:[-wall,0],...more});
    const thing=r.things.at(-1);
    for(const job of jobs)station(r,job,thing,{top});
    placed.push({name,thing,from:at,to:at+across});
    if(HOT.has(name))hot=hot?[Math.min(hot[0],at),Math.max(hot[1],at+across)]:[at,at+across];
    at+=across+.03+slack;
  }
  if(hood && hot && r.depth>0){
    const span=hot[1]-hot[0]+.12, mid=(hot[0]+hot[1])/2, back=wall==='back', d=Math.min(.9,deep+.12);
    prop('exhaustHood',back?mid:wall*(r.half-inset-d/2),back?r.depth-inset-d/2:mid,back?span:d,back?d:span,.5,STEEL,{y:1.98,solid:false,face:back?[0,-1]:[-wall,0]});
  }
  return placed;
}
/** Something that sits on a counter: at (a, b), its foot `up` high. */
function onTop(r,prop,shape,a,b,up,face,jobs=[],size) {
  const [w,d,h]=size||{riceCooker:[.4,.4,.35],sodaFountain:[.55,.55,.75],coffeeBrewer:[.5,.4,.5],slicer:[.5,.5,.45],sushiStation:[.9,.5,.25],shakeMixer:[.3,.3,.55],toaster:[.45,.4,.4]}[shape];
  prop(shape,a,b,face[1]?w:d,face[1]?d:w,h,shape==='riceCooker'?'#e9e7df':shape==='sushiStation'?'#d8b98a':STEEL,{y:up,solid:false,face});
  const thing=r.things.at(-1);
  for(const job of jobs)station(r,job,thing,{top:up+.02});
  return thing;
}
/** A free stretch `need` long on top of a counter running along b (or along a), clear of what already stands on it. */
function freeStretch(r,counter,need,alongB) {
  const top=counter.h, lo=alongB?counter.b-counter.d/2:counter.a-counter.w/2, hi=alongB?counter.b+counter.d/2:counter.a+counter.w/2;
  const taken=r.things.filter(t=>t!==counter && t.y>=top-.02 && t.y<top+.5 && t.h>.06 &&
    Math.abs(t.a-counter.a)<counter.w/2+.01 && Math.abs(t.b-counter.b)<counter.d/2+.01)
    // A till needs elbow room on both sides of the mark that stands for it.
    .map(t=>{const pad=t.shape==='register'?.34:0;return alongB?[t.b-t.d/2-pad,t.b+t.d/2+pad]:[t.a-t.w/2-pad,t.a+t.w/2+pad];}).sort((p,q)=>p[0]-q[0]);
  let at=lo+.08;
  for(const [from,to] of [...taken,[hi-.08,hi]]){
    if(from-at>=need+.06)return at+need/2+.03;
    at=Math.max(at,to);
  }
  return null;
}
const cookAt=(r,a,b,da,db,role='cook')=>{r.staff(a,b,da,db);r.people.at(-1).role=role;return r.people.at(-1);};

// A dining room: the whole back of the room is the kitchen, seen over a pass
// with heat lamps. Servers come round its open end; a drinks station stands by it.
function diningKitchen(r,prop,fine) {
  take(r,t=>t.shape==='cookline');take(r,t=>t.shape==='plates');
  const old=take(r,t=>t.solid && !t.shape && Math.abs(t.w-1.65)<.01 && Math.abs(t.d-.58)<.01);
  r.people=r.people.filter(p=>!(p.db===-1 && p.b>r.depth-1.5));
  const strip=r.depth>=10.5?2.75:r.depth>=7?2.4:2.05, passB=r.depth-strip+.3;
  // Tables give way to the pass and to the way round it.
  clearFloor(r,-r.half,r.half,passB-.9,r.depth);
  const want=fine?['char','range','fryer','prep','fridge','pots','sink']:['flat','fryer','range','prep','fridge','pots','sink'];
  const order=['fridge','prep','sink','fryer',fine?'range':'flat',fine?'char':'range','pots'];
  const placed=line(r,prop,{from:-r.half+.12,to:r.half-.12,want,order,deep:strip>2.2?.78:.66});
  // The pass runs in from the right-hand wall and stops short of the left: that gap is the kitchen door.
  const gap=Math.min(1.5,Math.max(1.05,r.width*.2)), passW=Math.min(r.width-gap-.1,4.4), passA=r.half-.06-passW/2;
  prop('passShelf',passA,passB,passW,.6,1.45,fine?WALNUT:'#8d9795',{face:[0,-1]});
  const pass=r.things.at(-1);
  station(r,'pass',pass,{top:.97});
  prop('plates',passA+passW/2-.3,passB,.28,.28,.12,'#eee7d8',{y:.97,solid:false});
  const hot=placed.find(p=>p.name===(fine?'char':'flat'))||placed[0], prep=placed.find(p=>p.name==='prep');
  const lineFront=r.depth-.8, mid=(lineFront+passB+.3)/2;
  if(!placed.some(p=>p.name==='prep'))station(r,'board',pass,{a:passA-passW/2+.5,top:.97});
  cookAt(r,Math.min(r.half-.6,Math.max(passA-passW/2+.5,(hot.from+hot.to)/2)),mid,0,1);
  // Drinks are the floor staff's own work: coffee and the soda gun in a diner, espresso and wine in a dining room.
  const side=r.half-.33, wide=r.width>=5.2, stationB=passB-.3-.82;
  if(wide){
    clearFloor(r,side-.9,r.half,stationB-.95,passB);
    r.add(side,stationB,.56,1.3,.93,fine?WALNUT:'#99816a');
    const counter=r.things.at(-1);counter.face=[-1,0];
    if(fine){
      prop('espresso',side,stationB+.2,.49,.8,.56,'#b9c2b9',{y:.93,solid:false,face:[-1,0]});
      station(r,'espresso',r.things.at(-1),{top:.95});station(r,'brew',r.things.at(-1),{top:.95});
      prop('bottleShelf',r.half-.16,stationB,.28,1.2,.39,WALNUT,{y:1.6,face:[-1,0],solid:false});
      station(r,'bar',counter,{b:stationB-.42,top:.95});station(r,'fountain',counter,{b:stationB-.42,top:.95});
    }else{
      onTop(r,prop,'coffeeBrewer',side,stationB+.36,.93,[-1,0],['brew','espresso']);
      onTop(r,prop,'sodaFountain',side,stationB-.3,.93,[-1,0],['fountain','bar']);
      const shake=onTop(r,prop,'shakeMixer',side,stationB+.02,.93,[-1,0],['blender']);
      shake.more.seed=r.seed;
    }
    station(r,'case',counter,{top:.95});
    cookAt(r,side-.75,stationB,1,0,'server').checkout=true;
  }else{
    // A narrow room keeps its coffee on the end of the pass.
    for(const job of ['brew','espresso','fountain','bar','case'])station(r,job,pass,{a:passA-passW/2+.32,top:.97});
    cookAt(r,passA-passW/2-.1-gap/2+.25,passB-.75,0,-1,'server').checkout=true;
  }
  if(prep && r.width>=6.4)cookAt(r,(prep.from+prep.to)/2,lineFront-.5,0,1);
  if(old)r.finish.zones=['DINING ROOM','KITCHEN'];
}

// Behind a take-out or lunch counter: the line that kind of food is cooked on.
const COUNTER_LINES={
  chinese:['wok','fryer','prep','stock','fridge'], asian:['wok','stock','prep','fryer','fridge'], thai:['wok','prep','stock','fryer','fridge'],
  burgers:['flat','fryers','sandwich','fridge'], chicken:['fryers','prep','fryer','fridge','pots'],
  sandwiches:['sandwich','flat','stock','fridge'], indian:['tandoor','pots','prep','range','fridge'],
  mexican:['flat','pots','sandwich','fryer','fridge'], bbq:['smoker','prep','pots','fryer','fridge'],
  latin:['pots','fryer','prep','flat','fridge'], caribbean:['pots','flat','prep','fryer','fridge'],
  african:['pots','char','prep','fryer','fridge'], kosher:['flat','pots','prep','fryer','fridge'],
};
function counterKitchen(r,prop) {
  const kind=r.place.kind, desk=r.things.find(t=>t.shape==='checkoutCounter'), old=take(r,t=>t.shape==='kitchenRange');
  if(!desk || !old)return;
  const bench=take(r,t=>t.shape==='packingBench'), side=desk.face?.[0]===1, compact=r.depth<5.7;
  const want=[...(COUNTER_LINES[kind]||['flat','fryer','prep','pots','fridge'])];
  if(bench)want.splice(2,0,'pack');
  const order=['fridge',...want.filter(n=>n!=='fridge' && n!=='pack'),'pack'];
  // Beside a steam line the cooking stays at its own end of the back wall.
  const to=side?Math.min(r.half-.14,-r.half+.14+Math.max(old.w,2.6)):r.half-.14;
  const placed=line(r,prop,{from:-r.half+.14,to,want:compact?want.filter(n=>n!=='pack' && n!=='fridge').slice(0,3):want,order,deep:compact?.56:.78});
  const prep=placed.find(p=>p.name==='prep')||placed.find(p=>p.name==='sandwich');
  if(prep && ['chinese','asian','thai','indian','latin','caribbean','african'].includes(kind))
    onTop(r,prop,'riceCooker',prep.to-.26,prep.thing.b-.1,.9,[0,-1],['steam']);
  if(prep && ['sandwiches','kosher'].includes(kind))onTop(r,prop,'slicer',prep.from+.3,prep.thing.b-.05,prep.name==='prep'?.9:.9,[0,-1],[]);
  station(r,'board',desk,{top:1.01});
  // Fountain drinks on the end of the counter away from the till, where there is counter to spare.
  const along=side?desk.d:desk.w;
  if(['burgers','chicken','mexican','bbq','sandwiches','kosher'].includes(kind) && along>=3.4){
    if(side)onTop(r,prop,'sodaFountain',desk.a,desk.b+desk.d/2-.34,1.01,[-1,0],['fountain']);
    else onTop(r,prop,'sodaFountain',desk.a-desk.w/2+.3,desk.b,1.01,[0,1],['fountain']);
  }
  if(kind==='burgers' && along>=3.9 && !side)onTop(r,prop,'shakeMixer',desk.a-desk.w/2+.78,desk.b+.05,1.01,[0,1],['blender']);
  // The cook stands where the heat is.
  const cook=r.people.find(p=>p.role==='cook'), hot=placed.find(p=>HOT.has(p.name) || p.name==='wok' || p.name==='smoker');
  if(cook && hot)cook.a=(hot.from+hot.to)/2;
}

// A slice shop is its oven. A bigger pizzeria also has a bench to stretch dough on.
function pizzaKitchen(r,prop) {
  const oven=r.things.find(t=>t.shape==='oven'), counter=r.things.find(t=>t.solid && !t.shape && t.h===1.05 && t.w===.8);
  if(!oven)return;
  station(r,'oven',oven,{top:1.02});
  const pie=r.things.find(t=>t.shape==='pizza');
  if(pie)station(r,'case',pie,{top:1.07});
  if(counter){
    counter.face=[1,0];
    const free=freeStretch(r,counter,.6,true);
    station(r,'pass',counter,{b:free??counter.b,top:1.07});
    station(r,'board',counter,{b:free??counter.b,top:1.07});
  }
  const lane=r.people.find(p=>p.da===1);
  // Behind the counter the lane is a metre wide: a bench goes against the back wall where the room runs on past the oven.
  if(r.depth-(oven.b+oven.d/2)>=1.5 && r.width>=5){
    const [placed]=line(r,prop,{from:-r.half+.14,to:-r.half+.14+1.5,want:['dough'],deep:.7,hood:false});
    if(placed){r.kitchen.stations=r.kitchen.stations.filter(s=>s.kind!=='board');station(r,'board',placed.thing,{top:.94});}
  }
  const fridge=r.things.find(t=>t.shape==='cooler') || r.things.find(t=>t.solid && !t.shape && t.h===1.9 && t.color==='#d7dde0');
  if(fridge){fridge.face??=[-1,0];station(r,'fountain',fridge,{top:1.0});}
  if(lane)lane.role='cook';
}

// Chicken and rice: the flat-top the meat is chopped on, a fryer for falafel, rice kept hot, the spit.
function halalKitchen(r,prop) {
  const counter=r.things.find(t=>t.solid && !t.shape && t.color==='#f2c400');
  if(!counter)return;
  take(r,t=>t.solid && !t.shape && t.color==='#8d9498' && t.w===1.6);
  const spit=r.things.find(t=>t.shape==='spit'), stand=r.things.find(t=>t.solid && !t.shape && t.w===.45 && t.d===.45);
  const behind=r.depth-.38-(counter.b+counter.d/2), deep=Math.min(.74,behind-.62);
  if(deep>=.5){
    const to=stand?stand.a-stand.w/2-.08:r.half-.2;
    line(r,prop,{from:-r.half+.14,to,want:['flat','fryer','prep'],order:['flat','fryer','prep'],deep,inset:.37});
    const prep=r.things.find(t=>t.shape==='prepTable');
    if(prep)onTop(r,prop,'riceCooker',prep.a+prep.w/2-.26,prep.b-.05,.9,[0,-1],['steam']);
  }
  if(spit)station(r,'spit',spit,{top:1.0});
  station(r,'pass',counter,{a:counter.a-counter.w/2+.5,top:1.12});
  // Tables stand clear of the way round the end of the counter.
  const limit=counter.b-counter.d/2-.85;
  for(const table of r.width<4.8?[]:r.things.filter(t=>t.shape==='table')){
    const seats=r.seats.filter(s=>Math.hypot(s.a-table.a,s.b-table.b)<1.25);
    const top=Math.max(table.b+table.d/2,...seats.map(s=>s.b+.2)), shift=Math.min(0,limit-top);
    if(!shift)continue;
    const low=Math.min(table.b-table.d/2,...seats.map(s=>s.b-.2))+shift;
    if(low<1.05){clearTable(r,table);continue;}
    for(const t of r.things)if(t!==table && Math.abs(t.a-table.a)<1 && Math.abs(t.b-table.b)<1 && (t.shape==='chair' || (!t.solid && t.y>=table.h-.03 && t.y<table.h+.3)))t.b+=shift;
    for(const s of seats)s.b+=shift;
    table.b+=shift;
  }
}

// A sushi bar: the chef's board and rice at the bar, and at the back the stock, the fryer and a burner for what is served hot.
function sushiKitchen(r,prop) {
  const bar=r.things.find(t=>t.solid && !t.shape && t.color==='#c9a876' && t.h===1.05), korean=r.place.kind==='korean';
  if(!bar)return;
  const glass=r.things.find(t=>t.shape==='showcase');
  let end=bar.b+bar.d/2;
  if(r.depth>=6.6){
    // The bar stops short of the back wall to let the hot kitchen in behind it.
    const cut=.55;
    bar.d-=cut;bar.b-=cut/2;end-=cut;
    const far=r.seats.filter(s=>s.seatKind==='stool' && s.b>end-.3);
    r.seats=r.seats.filter(s=>!far.includes(s));r.things=r.things.filter(t=>!far.some(s=>t.solid && t.a===s.a && t.b===s.b));
    line(r,prop,{from:-r.half+.14,to:Math.min(r.half-.14,-r.half+.14+(r.width>=6?3.3:2.3)),want:korean?['char','stock','fryer','range']:['stock','fryer','range','prep'],
      order:['stock','fryer','range','char','prep'],deep:.7});
  }
  if(glass){
    // The case shares the bar with the board the fish is cut on.
    const keep=Math.max(.9,end-(glass.b-glass.d/2)-1.15);
    glass.b=glass.b-glass.d/2+keep/2;glass.d=keep;
    const board=Math.min(end-.55,glass.b+keep/2+.58);
    onTop(r,prop,'sushiStation',bar.a-.06,board,1.05,[-1,0],['sushi','board']);
    station(r,'case',glass,{top:1.1});
    station(r,'pass',bar,{b:Math.min(end-.2,board+.62),a:bar.a+.1,top:1.07});
  }
  const chef=r.people[0];
  if(chef && glass)chef.b=Math.min(end-.6,glass.b+glass.d/2+.5);
  if(!r.kitchen?.stations.some(s=>s.kind==='steam'))onTop(r,prop,'riceCooker',bar.a-.12,bar.b-bar.d/2+.3,1.05,[-1,0],['steam']);
}

// A cafe makes everything at its bar: the machine, a brewer for drip, a toaster for what is eaten warm.
function cafeKitchen(r,prop) {
  const bar=r.things.find(t=>t.solid && !t.shape && Math.abs(t.w-.64)<.01 && t.h===1.01);
  if(!bar)return;
  bar.face=[1,0];
  const up=1.045, machine=r.things.find(t=>t.shape==='espresso' || t.shape==='blenders'), glass=r.things.find(t=>t.shape==='showcase');
  if(machine)for(const job of machine.shape==='espresso'?['espresso']:['blender','fountain'])station(r,job,machine,{top:up});
  if(glass)station(r,'case',glass,{top:up+.05});
  for(const [shape,jobs] of [['toaster',['oven','flat']],[r.place.kind==='juice'?null:'coffeeBrewer',['brew']]]){
    if(!shape)continue;
    const at=freeStretch(r,bar,shape==='toaster'?.5:.55,true);
    if(at!=null)onTop(r,prop,shape,bar.a-.04,at,up,[-1,0],jobs);
  }
  if(machine?.shape==='espresso')station(r,'brew',machine,{top:up});
  const cup=r.things.find(t=>t.shape==='cup' && t.more?.pickup);
  station(r,'pass',bar,{b:cup?cup.b-.3:bar.b,top:up});station(r,'board',bar,{b:cup?cup.b-.3:bar.b,top:up});
}

// Where things are baked, fried, boiled or scooped behind the case.
const BAKE_LINES={bakery:['bake','mixer','prep'],donuts:['donuts','mixer','bake'],bagels:['kettle','bake','prep'],icecream:['dip','soft']};
function bakeKitchen(r,prop) {
  const counter=r.things.find(t=>t.solid && !t.shape && t.h===1.15), kind=r.place.kind, want=BAKE_LINES[kind]||BAKE_LINES.bakery;
  if(!counter)return;
  const behind=r.depth-(counter.b+counter.d/2), deep=Math.min(.85,behind-.7);
  if(deep>=.55){
    const across=want.reduce((sum,name)=>sum+MODULES[name][1]+.05,0), to=Math.min(r.half-.14,-r.half+.14+across+.1);
    // The racks along the back wall give up that end of it.
    r.things=r.things.filter(t=>!(t.shape==='breadrack' && t.a-t.w/2<to+.05));
    line(r,prop,{from:-r.half+.14,to,want,deep});
    const cook=r.people[0];
    if(cook && cook.b>counter.b)cook.b=Math.min(cook.b,r.depth-deep-.55);
  }
  const glass=r.things.find(t=>t.shape==='showcase');
  if(glass)station(r,'case',counter,{a:glass.a,b:counter.b+.12,top:1.17});
  if(kind!=='icecream'){
    const brew=freeStretch(r,counter,.56,false);
    if(brew!=null)onTop(r,prop,'coffeeBrewer',brew,counter.b+.12,1.15,[0,1],['brew','espresso','fountain']);
    if(kind==='bagels'){const toast=freeStretch(r,counter,.5,false);if(toast!=null)onTop(r,prop,'toaster',toast,counter.b+.12,1.15,[0,1],['flat']);}
  }else{
    const shake=freeStretch(r,counter,.36,false);
    if(shake!=null)onTop(r,prop,'shakeMixer',shake,counter.b+.12,1.15,[0,1],['blender']);
  }
  station(r,'pass',counter,{b:counter.b+.1,top:1.17});station(r,'board',counter,{a:counter.a-.3,b:counter.b+.1,top:1.17});
}

// A bar that serves food fries and grills it in a corner at the back.
function barKitchen(r,prop) {
  const bar=r.things.find(t=>t.shape==='serviceDesk'), taps=r.things.find(t=>t.shape==='draftTaps');
  if(!bar || r.place.kind==='club')return;
  if(taps)for(const job of ['bar','fountain','brew'])station(r,job,taps,{top:1.06});
  // Four metres is not room for stools at the bar and booths opposite them.
  if(r.width<4.7)for(const table of r.things.filter(t=>t.shape==='table'))clearTable(r,table);
  station(r,'pass',bar,{b:bar.b+bar.d/2-.5,a:bar.a+.05,top:1.06});station(r,'board',bar,{b:bar.b+bar.d/2-.9,a:bar.a-.05,top:1.06});
  if(r.depth<7 || r.width<5.4)return;
  const from=r.half-.14-1.5;
  clearFloor(r,from-.5,r.half,r.depth-2.3,r.depth);
  r.things=r.things.filter(t=>!(t.shape==='wallSconce' && t.a>0) && !(t.shape==='bottleShelf' && t.b>r.depth-.5 && t.a+t.w/2>from-.1));
  const placed=line(r,prop,{from,to:r.half-.14,want:['flat','fryer'],order:['fryer','flat'],deep:.72});
  if(placed.length)cookAt(r,(placed[0].from+placed.at(-1).to)/2,r.depth-1.4,0,1);
}

const FIT={diner:(r,p)=>diningKitchen(r,p,false),fine:(r,p)=>diningKitchen(r,p,true),takeout:counterKitchen,steamtable:counterKitchen,
  pizza:pizzaKitchen,halal:halalKitchen,sushi:sushiKitchen,coffee:cafeKitchen,bakery:bakeKitchen,bar:barKitchen};
/** Give a furnished eating place the kitchen its kind of food is cooked in. */
export function fitKitchen(r,prop,style) {
  const fit=FIT[style];
  if(!fit)return;
  fit(r,prop);
  const cooks=r.people.filter(p=>p.role==='cook');
  // Whoever leads the line is first on the staff list: the room's cook.
  if(cooks.length && r.people[0].role!=='cook' && ['diner','fine'].includes(style))r.people=[cooks[0],...r.people.filter(p=>p!==cooks[0])];
}
