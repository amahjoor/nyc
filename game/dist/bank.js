// Public-facing branch fittings, scaled to the surveyed storefront.
import { brandKey, placeName } from './places.js';

const brands = {
  'bank-of-america': ['Bank of America', '#183c6b', '#cd3446'],
  'chase-bank': ['CHASE', '#215781', '#147bb8'],
  citibank: ['citi', '#123b67', '#d64448'],
  'td-bank-n-a': ['TD Bank', '#156043', '#77a548'],
  'wells-fargo': ['WELLS FARGO', '#972e34', '#c2a265'],
  'capital-one': ['Capital One', '#254b61', '#be3b43'],
};

export function bankIdentity(place) {
  const name = placeName(place), key = /^wells fargo/i.test(name) ? 'wells-fargo' : brandKey(name);
  if (brands[key]) {
    const [title, ink, accent] = brands[key];
    return { title, key, ink, accent };
  }
  return null;
}

// Used for the back-wall lettering and the fascia when no local logo is installed.
export function drawBankName(ctx, identity, x, y, w, h, ground) {
  const {key, title, ink} = identity;
  ctx.save(); ctx.fillStyle = ground; ctx.fillRect(x,y,w,h);
  ctx.translate(x+w/2,y+h/2);
  const size = h * .55;
  ctx.font = (key === 'wells-fargo' ? '600 ' + size + 'px Georgia, serif' : '600 ' + size + 'px Arial, sans-serif');
  const mark = key === 'bank-of-america' || key === 'chase-bank';
  const emblemW = mark ? size * 1.5 : 0, gap = mark ? size*.28 : 0;
  const textW = ctx.measureText(title).width, total = textW + gap + emblemW;
  const fit = Math.min(1, w*.88/total);
  ctx.scale(fit,fit); ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillStyle=ink; ctx.fillText(title,-total/2, size*.055);
  if (mark) {
    ctx.translate(total/2-emblemW,-size*.55);
    ctx.scale(emblemW/55,size*1.1/36);
    const poly = (color, points) => {
      ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(...points[0]);
      for (const p of points.slice(1)) ctx.lineTo(...p);
      ctx.closePath(); ctx.fill();
    };
    if (key === 'bank-of-america') {
      const red='#d63149', blue='#1f4782';
      poly(blue,[[0,18],[12,10],[19,13],[7,21]]);
      poly(blue,[[10,23],[22,15],[29,18],[17,26]]);
      poly(red,[[15,8],[23,3],[39,9],[31,14]]);
      poly(red,[[26,2],[30,0],[46,6],[42,8]]);
      poly(red,[[19,28],[43,12],[50,15],[26,31]]);
      poly(red,[[29,33],[52,17],[55,19],[33,35]]);
    } else {
      ctx.translate(6,0);
      for (let i=0;i<4;i++) {
        ctx.save(); ctx.translate(18,18); ctx.rotate(i*Math.PI/2);
        poly('#1877ad',[[-18,-6],[-6,-18],[14,-18],[2,-6]]); ctx.restore();
      }
    }
  }
  ctx.restore();
}

const alloy='#9ea8a9', charcoal='#2b3134', ivory='#e8e4d9', walnut='#ad8563';
export const BANK_FIXTURES = {
  branchATM(t,w,d,h,ink,{accent}) {
    const f=d/2;
    t.box(0,-.07,w-.09,d-.14,h-.10,.06,'#b5bbb9');
    t.box(0,-.015,w-.06,d-.09,.09,.025,charcoal);
    // The screen sits behind the cheeks and under a lit hood. The keypad,
    // card reader and dispensing pocket project from the fascia.
    t.box(0,f-.14,w-.12,.055,h-.18,.10,'#cbd0cb');
    for(const side of [-1,1]) t.box(side*(w/2-.045),.012,.075,d-.08,h-.08,.05,'#b3bab9');
    t.box(0,f-.08,w,.15,.20,h-.22,ink);
    t.box(0,f-.032,w-.12,.044,.017,h-.235,'#f4f0dd',true);
    t.box(0,f-.095,w*.76,.079,.47,1.03,charcoal);
    t.plate(0,f-.053,w*.65,.35,1.09,'#35759a',true);
    t.box(0,f-.055,w*.81,.19,.06,.96,'#929b9c');
    t.box(-.12,f-.008,.22,.13,.02,1.023,'#5b6262');
    for(let row=0;row<4;row++)for(let col=0;col<3;col++)
      t.box(-.187+.062*col,f-.049+.028*row,.041,.019,.01,1.044,row===3&&col===2?'#6b996f':'#d1d3cb');
    t.box(.24,f-.076,.15,.068,.11,.99,charcoal);
    t.plate(.24,f-.040,.09,.015,1.04,'#9fcf91',true);
    t.plate(0,f-.110,w*.44,.13,.67,charcoal);
    t.box(0,f-.10,w*.42,.095,.029,.665,alloy);
    t.plate(-w*.24,f-.109,.14,.017,.87,accent);
  },
  tellerPod(t,w,d,h,color) {
    t.box(0,0,w-.16,d-.12,.11,0,'#4c4944');
    t.box(0,0,w-.07,d-.07,h-.17,.11,color);
    t.box(0,0,w,d,.06,h-.06,ivory);
    t.box(0,d/2-.018,w-.09,.024,.018,h-.082,'#686359');
    for(const u of [-w*.27,0,w*.27]) t.plate(u,d/2-.032,.011,h-.24,.13,'#725b45');
    // The customer's signature pad sits on a low swivel bracket.
    t.box(-w*.30,d*.21,.17,.14,.028,h,charcoal);
    t.slope(-w*.30,d*.14,h+.090,d*.30,h+.055,.20,.025,'#424a4c');
    t.box(-w*.30,d*.21,.13,.054,.012,h+.076,'#779997');
  },
  branchDesk(t,w,d,h) {
    t.box(0,0,w,d,.042,h-.042,walnut);
    for (const u of [-w*.39,w*.39]) for(const v of [-d*.36,d*.36])
      t.box(u,v,.046,.046,h-.055,.04,'#63686a');
    t.box(w*.16,-d*.17,.22,.15,.018,h,'#606867');
    t.box(w*.16,-d*.17,.047,.045,.15,h+.018,alloy);
    t.box(w*.16,-d*.17,.46,.045,.28,h+.15,charcoal);
    t.plate(w*.16,-d*.17+.024,.41,.226,h+.18,'#608596');
    t.box(w*.18,d*.08,.32,.12,.014,h,'#515756');
    for(const dv of [-.033,0,.033]) t.box(w*.18,d*.08+dv,.28,.006,.005,h+.014,'#929996');
    t.box(-w*.26,d*.12,.24,.29,.014,h,'#e6e3d7');
  },
  branchChair(t,w,d,h,color) {
    const cream='#afa296';
    for(const u of [-w*.34,w*.34]) for(const v of [-d*.32,d*.32])
      t.slope(u,v*1.2,.035,v,h-.08,.045,.05,cream);
    t.box(0,-.015,w-.08,d-.07,.095,h-.14,color);
    t.ball(0,.012,w*.47,.064,d*.46,h-.045,color);
    t.slope(0,-d*.38,h-.015,-d*.46,h+.37,w-.07,.082,color);
    for(const side of [-1,1]) {
      t.slope(side*(w*.46),d*.21,h-.005,-d*.27,h+.17,.057,.061,color);
      t.box(side*(w*.46),-.03,.063,d*.65,.051,h+.13,color);
    }
  },
  branchCredenza(t,w,d,h) {
    t.box(0,0,w-.09,d-.08,.095,.03,'#5f5b54');
    t.box(0,0,w-.025,d-.025,h-.17,.12,'#b49a80');
    t.box(0,0,w,d,.045,h-.045,ivory);
    const drawers=Math.max(2,Math.round(w/.60)), step=(w-.08)/drawers;
    for(let i=0;i<drawers;i++) {
      const u=-w/2+.04+(i+.5)*step;
      t.plate(u,d/2-.009,step-.012,h-.22,.135,'#c8bdb0');
      t.box(u,d/2+.004,.13,.034,.017,h-.18,'#787c79');
    }
    const end=w*.26;
    t.box(end,0,.46,.30,.16,h,'#d4d3cb');
    t.plate(end,d*.32+.015,.33,.085,h+.055,'#515854');
    t.box(end,-.018,.41,.25,.026,h+.165,'#989f9d');
    for(let i=0;i<3;i++) t.box(-w*.30+i*.10,-.03,.069,.20,.27-i*.018,h,['#949b99','#d0c7b7','#777f7a'][i]);
  },
  branchPartition(t,w,d,h) {
    for(const side of [-1,1]) t.box(side*(w/2-.019),0,.038,d,h,0,'#6d7778');
    for(const up of [.035,h-.04]) t.box(0,0,w,d,.036,up,alloy);
    for(const up of [1.12,1.17]) t.plate(0,d/2+.002,w-.07,.018,up,'#c1cbc7');
  },
  branchLamp(t,w,d,h) {
    t.post(0,0,.012,h-.095,.09,'#777974');
    t.disc(0,0,w*.49,.068,.034,'#b8a088');
    t.disc(0,0,w*.46,.022,.015,'#fff3d0');
  },
  branchPlant(t,w,d,h,ceramic) {
    const pot=h*.32;
    t.disc(0,0,w*.34,.036,.03,'#9d9281');
    t.disc(0,0,w*.39,pot-.10,.065,ceramic);
    t.disc(0,0,w*.40,.042,pot-.035,'#c9c4b8');
    t.disc(0,0,w*.355,.009,pot+.007,'#463f34');
  },
  branchTable(t,w,d,h) {
    t.disc(0,0,w/2,.032,h-.032,'#d8cfc0');
    t.post(0,0,.052,h-.07,.035,alloy); t.disc(0,0,w*.31,.032,.025,'#626769');
    t.box(.035,0,.15,.23,.019,h,'#426578');
  },
};

export function furnishBank(r, prop, identity) {
  const compact=r.depth<5.5;
  r.floor='#9e978d'; r.wall='#e2ddd1'; r.light={color:0xffefdb,power:73,ceiling:'#e5e1d8',recessed:true};
  r.finish={bank:identity,floor:'stone',zones:[]};
  const chair=(a,b,da,db)=>{
    r.seat(a,b,da,db,0,identity.ink,.63,.61,.45,'lounge');
    const seat=r.things[r.things.length-1]; seat.shape='branchChair'; seat.more={};
  };
  const atmA=.50-r.half;
  prop('branchATM',atmA,.98,.82,1.01,1.87,identity.ink,{face:[1,0],accent:identity.accent});
  if(r.depth>=8 && r.width>=7.8)
    prop('branchATM',atmA,2.11,.82,1.01,1.87,identity.ink,{face:[1,0],accent:identity.accent});

  const soffit=Math.min(2.25,r.depth*.31);
  r.add(0,r.depth-soffit/2,r.width-.04,soffit,.16,2.90,'#d7d1c5',false);
  r.add(0,r.depth-soffit+.025,r.width-.08,.035,.022,2.885,'#f5e6c2',false);

  const stations=r.width>=6.6 && !compact ? 2 : 1;
  const tellerB=r.depth-(compact?1.33:1.62), podW=Math.min(1.86,r.width*.37);
  for(let i=0;i<stations;i++) {
    const a=stations===1 ? -.20 : (i-.5)*(podW+.45);
    const b=tellerB+(i? .13:0);
    prop('tellerPod',a,b,podW,.86,1.0,walnut);
    prop(i === 0 ? 'register' : 'deskMonitor',a,b+(i === 0 ? -.15 : .11),.46,.21,.39,charcoal,{y:1,solid:false,face:[0,1]});
    r.staff(a,b+.82,0,-1);
    prop('branchLamp',a,b,.40,.40,.61,'#b5a086',{y:2.45,solid:false});
  }

  if (compact && r.width >= 4.0) chair(r.half-.45,.95,-1,0);
  if (!compact) {
    chair(r.half-.50,1.25,-1,0);
    if (tellerB>4.2) {
      prop('branchTable',r.half-.48,2.06,.44,.44,.46,'#b7ac9f');
      chair(r.half-.50,2.88,-1,0);
    }
  }
  if (r.depth>=8.4 && r.width>=5.8) {
    const b=tellerB*.57, a=-r.half+1.30;
    prop('branchPartition',-r.half+.93,b-.99,1.64,.055,2.29,alloy);
    prop('branchDesk',a,b,.73,1.39,.75,walnut,{face:[1,0]});
    chair(a-.81,b,1,0); chair(a+.88,b,-1,0);
  }
  if (r.depth>=6.6) {
    const credenzaW=Math.min(3.4,r.width-.62);
    prop('branchCredenza',0,r.depth-.245,credenzaW,.41,.72,'#b7a28b');
  }
  if (r.depth>=7.5 && r.width>=5.2)
    prop('writingDesk',r.half-.32,Math.max(4.14,tellerB*.60),.55,1.36,.94,walnut,{face:[-1,0]});
  if (r.width>=6.2 && r.depth>=6)
    prop('branchPlant',r.half-.43,tellerB-.36,.57,.57,1.39,'#b9b0a0');
}
