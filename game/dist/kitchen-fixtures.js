// Commercial kitchen equipment, drawn with the room prop tools (room-props.js).
//
// Every piece is a prop: (t, w, d, h, hex, more). u runs across it, v out of
// its front (its back, at -d/2, stands to the wall), heights from its foot.
// For a piece worked at, `h` is the working surface: the grate a pan is set
// on, the table top, the rim of the fryer. What belongs behind or on that
// surface (a back riser, a splash and its sprayer, a stock pot) stands above
// it by no more than KITCHEN_SIZES[name].rise. A cabinet's `h` is all of it.

const S='#a6aeaa', HI='#c6cbc5', LO='#7f8884', DARK='#394340', IRON='#25292a', CHROME='#cdd1d0', WHITE='#eceae2', PAPER='#eee8d8';
const GAS='#4f8fff', FIRE='#ffa040', LAMP='#fff1cf', OIL='#c9952f', WOOD='#c9a26b', DOUGH='#efe2c2';
const MISE=['#7da455','#c4472f','#e9dfc6','#e08a35','#4f7d3c','#e7c15a','#8f4a6e','#b9a184'];
const SUB=['#86ab5a','#c4472f','#9b5a7a','#e9c35a','#d98c8c','#c9a184','#55733c','#a9382c','#ece3c9','#3a3230'];
const FLAVOURS=['#f0e3b8','#5d3a26','#e6a0a8','#a8d8b0','#a67c52','#b9c98a','#7d6aa5','#f2a65a','#d9d2c4','#c4566a'];

/** `a` a part of the way to `b`. */
const mix=(a,b,k)=>/^#[0-9a-f]{6}$/i.test(a)?'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-k)+parseInt(b.slice(i,i+2),16)*k).toString(16).padStart(2,'0')).join(''):a;
const legs=(t,w,d,h,hex,r=.022,inset=.05,v=0)=>{for(const su of[-1,1])for(const sv of[-1,1])t.post(su*(w/2-inset),v+sv*(d/2-inset),r,h,0,hex);};
/** A knob on a front that stands at `v`. */
const knob=(t,u,v,up,hex=IRON,r=.019)=>t.rodV(u,v+.012,.026,r,up,hex);
/** A bar handle across a door, on two stand-offs. */
const pull=(t,u,v,len,up,hex=CHROME)=>{t.rodU(u,v+.034,len,.010,up,hex);for(const s of[-1,1])t.box(u+s*(len/2-.03),v+.015,.014,.03,.014,up-.007,hex);};
/** The same, upright. */
const grip=(t,u,v,len,up,hex=CHROME)=>{t.box(u,v+.03,.02,.014,len,up,hex);for(const k of[.035,len-.035])t.box(u,v+.012,.014,.024,.014,up+k-.007,hex);};
const louvre=(t,u,v,wu,h,up,n=4)=>{t.box(u,v+.003,wu,.006,h,up,'#2b3132');for(let k=0;k<n;k++)t.box(u,v+.008,wu-.02,.006,h/n*.4,up+h*(k+.3)/n,LO);};
/** A ring of gas jets: blue with orange tips. */
const flames=(t,u,v,r,up,n=6,s=.013)=>{
  for(let i=0;i<n;i++){
    const a=(i+.5)/n*2*Math.PI, x=u+Math.cos(a)*r, y=v+Math.sin(a)*r;
    t.box(x,y,s,s,s*1.3,up,GAS,true);t.box(x,y,s*.55,s*.55,s*.8,up+s*1.3,FIRE,true);
  }
};
/** A ring doughnut lying flat. */
const doughnut=(t,u,v,up,hex,hole,icing)=>{
  t.can(u,v,.05,.026,up,hex);
  if(icing)t.can(u,v,.044,.006,up+.026,icing);
  t.can(u,v,.015,.003,up+(icing?.032:.026),hole);
};
/** A glass coffee pot with its plastic collar and handle. */
const decanter=(t,u,v,up,trim)=>{
  t.ball(u,v,.066,.052,.066,up+.052,'#3a2417');t.post(u,v,.043,.05,up+.085,'#c3cdc9');
  t.post(u,v,.047,.014,up+.117,trim);
  t.box(u+.083,v,.02,.022,.085,up+.04,trim);t.box(u+.064,v,.04,.022,.012,up+.113,trim);
};

/** What a cook has on the go: `more.ware` picks one, `tone` colours the food in it. */
const WARES={
  pan(t,tone){
    flames(t,0,0,.104,0,8,.014);
    t.disc(0,0,.125,.04,.029,'#3a3e40');t.disc(0,0,.114,.003,.069,'#232627');t.disc(0,0,.098,.007,.069,tone);
    for(const[u,v,k]of[[-.035,-.03,.18],[.04,-.015,-.15],[0,.045,.3],[-.045,.03,-.08]])t.bud(u,v,.024,.079,mix(tone,k>0?'#fff0c8':'#3a2416',Math.abs(k)));
    t.slope(0,.118,.058,.215,.1,.024,.014,IRON);
  },
  pot(t,tone){
    flames(t,0,0,.075,0,6);
    t.disc(0,0,.105,.14,.02,'#b4bab6');t.disc(0,0,.111,.01,.15,HI);t.disc(0,0,.095,.003,.16,tone);
    for(const s of[-1,1])t.box(s*.12,0,.03,.055,.012,.125,LO);
    t.ball(.02,-.01,.016,.028,.016,.21,'#e9ece6');t.ball(-.03,.02,.02,.034,.02,.285,'#eef0ea');t.ball(.012,0,.014,.026,.014,.365,'#f3f4ef');
  },
  wok(t,tone){
    t.disc(0,0,.085,.03,0,IRON);flames(t,0,0,.112,0,8,.018);
    t.basin(0,0,.34,.34,.095,.028,'#2f3335');t.disc(0,0,.112,.004,.08,tone);
    for(const[u,v,hex]of[[-.04,-.03,mix(tone,'#fff0c8',.25)],[.045,-.02,'#6f9a4a'],[0,.045,mix(tone,'#3a2416',.2)],[-.05,.04,'#b8402f'],[.05,.04,mix(tone,'#fff0c8',.1)]])t.bud(u,v,.027,.092,hex);
    t.rodV(0,.19,.06,.014,.112,IRON);
  },
  basket(t){
    const wire='#9aa19c';
    t.box(0,-.02,.14,.2,.006,.05,'#6f7773');
    for(const s of[-1,1]){t.box(s*.0675,-.02,.005,.2,.09,.056,wire);t.box(0,-.02+s*.0975,.14,.005,.09,.056,wire);}
    t.box(0,-.02,.128,.188,.05,.056,'#d9a441');
    for(const[u,v,k]of[[-.035,-.07,.2],[.03,-.04,-.12],[-.02,.01,.3],[.035,.045,.1],[-.04,.05,-.1]])t.bud(u,v,.026,.108,mix('#d9a441',k>0?'#f2d58a':'#9a6a24',Math.abs(k)));
    t.slope(0,.078,.14,.215,.2,.018,.012,IRON);
  },
  tray(t,tone){
    t.box(0,0,.34,.25,.012,0,'#c2c7c3');t.box(0,0,.315,.225,.003,.012,'#a4aaa6');
    for(let i=0;i<3;i++)for(let j=0;j<2;j++)t.ball((i-1)*.1,(j-.5)*.105,.04,.02,.036,.03,mix(tone,(i+j)%2?'#fff0c8':'#3a2416',.12));
  },
  pie(t,tone){
    t.disc(0,0,.168,.006,0,'#8b918e');t.disc(0,0,.158,.014,.006,'#d6a25c');t.disc(0,0,.136,.004,.02,tone);
    for(let i=0;i<5;i++){const a=i*1.26+.4;t.can(Math.cos(a)*.08,Math.sin(a)*.08,.018,.003,.024,mix(tone,'#8a2a1e',.65));}
    t.can(.01,-.01,.02,.003,.024,mix(tone,'#fff3c8',.6));t.can(-.05,.03,.016,.003,.0245,mix(tone,'#fff3c8',.5));
  },
  board(t,tone,inUse){
    t.box(0,0,.3,.22,.018,0,'#e7e3d3');
    if(['sushi','kimbap','nigiri'].includes(inUse?.style)){
      if(inUse.style==='nigiri'){
        t.ball(.015,0,.063,.024,.034,.042,inUse.action==='slice'?'#e99570':'#eee7cd');
        if(inUse.action==='shape')t.ball(.015,0,.057,.009,.034,.065,'#df8a69');
      }else{
        for(let i=-6;i<=6;i++)t.rodU(0,i*.014,.245,.006,.024,'#bda16b');
        if(inUse.action==='slice'){
          t.rodU(0,0,.192,.029,.057,'#414939');
          for(const u of [-.061,-.023,.022,.067])t.box(u,.001,.003,.055,.046,.033,'#e1dec6');
        }else{
          t.box(0,0,.19,.14,.003,.032,'#444c3d');t.box(0,.01,.179,.10,.007,.035,'#ebe5d1');
          if(inUse.action!=='spread')t.rodU(0,.024,.16,.012,.048,'#df9471');
        }
      }
      return;
    }
    if(inUse?.action==='stretch' || inUse?.style==='calzone'){
      t.ball(0,0,.128,.014,.094,.032,'#e8cda3');return;
    }
    t.box(-.08,-.04,.09,.06,.042,.018,tone);
    for(const[u,v,k]of[[-.01,-.05,.2],[.02,-.02,-.15],[.05,-.055,.1],[.0,-.0,.3],[.045,.005,-.1],[.08,-.025,.22]])t.box(u,v,.022,.02,.016,.018,mix(tone,k>0?'#fff0c8':'#3a2416',Math.abs(k)));
    if(inUse)return;
    t.box(.05,.065,.17,.034,.003,.019,'#d5d9d8');t.box(-.085,.062,.1,.022,.016,.018,IRON);
  },
  bowl(t,tone,inUse){
    t.basin(0,0,.3,.3,.13,0,'#c4c9c5');t.disc(0,0,.1,.004,.078,tone);
    t.ball(-.01,-.01,.06,.014,.06,.084,mix(tone,'#ffffff',.18));
    if(inUse)return;
    t.slope(.03,.02,.092,.14,.19,.011,.011,CHROME);t.bud(.03,.02,.024,.098,CHROME);
  },
  plate(t,tone){
    t.disc(0,0,.14,.01,0,WHITE);t.disc(0,0,.1,.003,.01,'#f7f6ef');
    t.ball(-.015,-.005,.055,.03,.05,.038,tone);t.ball(.05,-.04,.032,.018,.03,.022,mix(tone,'#f0e6c8',.65));
    t.bud(.03,.05,.02,.022,'#5f8f45');t.bud(.055,.035,.015,.02,'#b8402f');
  },
  ladle(t,tone,inUse){
    t.box(0,0,.33,.27,.065,0,'#b9bfbb');t.box(0,0,.35,.29,.006,.065,HI);t.box(0,0,.3,.24,.004,.071,tone);
    for(const[u,v,k]of[[-.08,-.05,.2],[-.03,.05,-.15],[-.1,.06,.1],[.09,.07,-.1]])t.ball(u,v,.035,.014,.03,.076,mix(tone,k>0?'#fff0c8':'#3a2416',Math.abs(k)));
    if(inUse)return;
    t.ball(.06,-.045,.036,.02,.036,.085,CHROME);t.slope(.06,-.03,.085,.13,.2,.014,.008,CHROME);
  },
  cup(t,tone){
    t.post(0,0,.033,.05,0,'#f1efe6');t.post(0,0,.039,.075,.05,'#f1efe6');t.post(0,0,.036,.04,.04,'#b8463c');
    t.disc(0,0,.042,.006,.123,'#f7f5ee');t.disc(0,0,.034,.002,.129,tone);
  },
  griddle(t,tone,inUse){
    if(/burger|sliders/.test(inUse?.style)){
      const count=inUse.style==='sliders'?3:inUse.style==='burger-double'?2:1;
      for(let i=0;i<count;i++){
        const u=(i-(count-1)/2)*(count===3?.09:.13),r=count===3?.043:.065;
        t.disc(u,0,r,.021,0,inUse.action==='press'?'#a46452':'#77503a');
        if(inUse.action==='place')t.box(u,0,r*1.8,r*1.8,.004,.021,'#efb84d');
      }
      return;
    }
    for(const[u,v]of[[-.08,-.045],[.045,-.065],[-.03,.065]]){t.can(u,v,.052,.016,0,tone);t.can(u,v,.04,.003,.016,mix(tone,'#3a2416',.45));}
    if(inUse)return;
    t.box(.1,.055,.075,.09,.003,.003,'#cfd3d0');t.slope(.1,.1,.008,.215,.075,.022,.012,IRON);
  },
};
export const COOKWARE=Object.keys(WARES);

/**
 * The sizes each piece is drawn for: across, front to back, and `h` as the
 * prop is given it. `rise` is how far the tallest thing on it stands above
 * `h`; `counter` marks what sits on a counter top, `hung` what hangs.
 */
export const KITCHEN_SIZES={
  gasRange:{w:.9,d:.75,h:.92,rise:.21}, flatTop:{w:.9,d:.75,h:.92,rise:.09}, fryer:{w:.8,d:.75,h:.92,rise:.25},
  prepTable:{w:1.5,d:.7,h:.9,rise:.05}, reachIn:{w:.75,d:.8,h:2}, dishSink:{w:1.5,d:.65,h:.9,rise:.62},
  passShelf:{w:1.8,d:.6,h:1.45}, exhaustHood:{w:2,d:.9,h:.5,rise:.25,hung:true}, doughBench:{w:1.8,d:.7,h:.92,rise:.71},
  stockBurner:{w:.6,d:.6,h:.5,rise:.6}, tandoor:{w:.7,d:.7,h:.95,rise:.46}, smoker:{w:.9,d:.8,h:1.9},
  sandwichUnit:{w:1.5,d:.75,h:1.1}, donutFryer:{w:1,d:.7,h:.92,rise:.13}, rackOven:{w:.95,d:1,h:2},
  mixer:{w:.55,d:.6,h:1.3}, dipCabinet:{w:1.5,d:.7,h:1.05}, softServe:{w:.55,d:.7,h:1.5},
  riceCooker:{w:.4,d:.4,h:.35,counter:true}, sodaFountain:{w:.6,d:.6,h:.75,counter:true}, coffeeBrewer:{w:.5,d:.4,h:.5,counter:true},
  slicer:{w:.5,d:.5,h:.45,counter:true}, sushiStation:{w:.9,d:.5,h:.25,counter:true}, shakeMixer:{w:.3,d:.3,h:.55,counter:true},
  toaster:{w:.45,d:.4,h:.4,counter:true}, cookware:{w:.34,d:.34,h:.2,rise:.2},
};

export const KITCHEN_FIXTURES={
  /** A six-burner range: cast grates, a knob to a burner, the oven under. `more.pots` stands a stock pot on a back burner. */
  gasRange(t,w,d,h,hex=S,{pots}={}){
    const fv=d/2-.03, cols=Math.max(2,Math.round(w/.3)), pitch=(w-.04)/cols, D=d-.11, vc=.01;
    legs(t,w,d-.03,.15,LO,.025,.06,-.015);
    t.box(0,-.015,w,d-.03,h-.21,.15,hex);
    t.box(0,fv+.003,w-.06,.006,.035,.165,DARK);
    t.box(0,fv+.007,w-.07,.014,h-.47,.22,mix(hex,DARK,.3));pull(t,0,fv+.014,w*.6,h-.31);
    t.box(0,fv+.012,w,.024,.12,h-.19,mix(hex,'#ffffff',.14));
    for(let i=0;i<cols*2;i++)knob(t,(i-cols+.5)*pitch/2,fv+.024,h-.13);
    t.box(0,-.015,w+.012,d-.03,.03,h-.06,HI);t.box(0,vc,w-.04,D,.012,h-.03,'#2c3030');
    for(let c=0;c<cols;c++){
      const u=(c-(cols-1)/2)*pitch;
      for(const s of[-1,1]){
        t.disc(u,vc+s*D/4,.05,.01,h-.018,'#4d5251');
        t.box(u+s*(pitch/2-.012),vc,.014,D-.01,.018,h-.018,IRON);t.box(u+s*pitch*.16,vc,.01,D-.03,.01,h-.01,IRON);
      }
      for(const k of[-1,0,1])t.box(u,vc+k*(D/2-.012),pitch-.02,.014,.018,h-.018,IRON);
    }
    t.box(0,-d/2+.035,w,.07,.2,h-.06,hex);t.box(0,-d/2+.035,w-.08,.035,.004,h+.14,IRON);
    if(pots){
      const u=-(cols-1)/2*pitch, v=vc-D/4, r=Math.min(.125,pitch*.43);
      t.disc(u,v,r,.2,h,'#b4bab6');t.disc(u,v,r+.006,.01,h+.19,HI);t.disc(u,v,r-.01,.003,h+.2,'#a9793f');
      for(const s of[-1,1])t.box(u+s*(r+.016),v,.03,.06,.012,h+.15,LO);
    }
  },
  /** A griddle on its stand: thick plate, splash guards, grease trough. `more.char` makes it a char-broiler. */
  flatTop(t,w,d,h,hex=S,{char}={}){
    const base=h-.3, fv=d/2-.04, n=Math.max(2,Math.round(w/.3)), pv=-.035, pd=d-.16;
    legs(t,w,d-.03,base-.03,S,.022,.05,-.015);
    t.box(0,-.015,w-.06,d-.09,.02,.2,LO);t.box(0,-.015,w,d-.03,.035,base-.035,HI);
    t.box(0,-.02,w-.02,d-.04,.27,base,hex);
    t.box(0,fv+.005,w-.02,.01,.15,base+.02,mix(hex,DARK,.28));
    for(let i=0;i<n;i++){
      const u=-w/2+.11+i*(w-.4)/Math.max(1,n-1);
      knob(t,u,fv+.01,base+.09);t.box(u+.045,fv+.012,.012,.006,.012,base+.125,'#e2452f',true);
    }
    t.box(w/2-.12,fv+.013,.15,.01,.08,base+.04,HI);t.box(w/2-.12,fv+.022,.07,.012,.014,base+.085,LO);
    t.box(0,d/2-.0775,w-.07,.045,.008,h-.03,'#202425');t.box(0,d/2-.048,w-.02,.016,.022,h-.03,HI);
    t.box(0,-d/2+.035,w-.03,.016,.11,h-.03,HI);
    for(const s of[-1,1])t.box(s*(w/2-.033),-.09,.014,d-.27,.07,h-.03,HI);
    if(char){
      const bars=Math.min(18,Math.floor((w-.09)/.048)), step=(w-.1)/bars;
      t.box(0,pv,w-.08,pd,.012,h-.03,'#6a2817',true);
      for(const[u,v,s]of[[-.22,-.08,.2],[.08,.06,.24],[.26,-.12,.16],[-.05,-.16,.14]])t.box(u*w,v*d*1.2,s*w,s*d*.7,.003,h-.018,'#c8531f',true);
      for(let i=0;i<bars;i++)t.box((i-(bars-1)/2)*step,pv,.017,pd,.016,h-.016,IRON);
      for(const s of[-1,1])t.box(0,pv+s*(pd/2-.008),w-.07,.016,.02,h-.02,IRON);
    }else{
      t.box(0,pv,w-.07,pd,.03,h-.03,'#54585a');t.box(-w*.05,pv+.01,w*.55,pd*.6,.002,h,'#63676a');
    }
  },
  /** A deep fryer: a well of oil every 40 cm, baskets hung on the flue behind, a door and a drain under each. */
  fryer(t,w,d,h,hex=S){
    const fv=d/2-.03, n=Math.max(1,Math.round(w/.42)), each=w/n, vb=-d/2+.1, v0=vb, v1=fv-.07, vm=(v0+v1)/2, wire='#959c98';
    legs(t,w,d-.03,.15,LO,.025,.055,-.015);
    t.box(0,-.015,w,d-.03,h-.28,.15,hex);
    t.box(0,-d/2+.05,w,.1,.37,h-.13,hex);t.box(0,-d/2+.05,w-.06,.06,.004,h+.24,IRON);
    t.rodU(0,vb+.022,w-.03,.009,h+.2,CHROME);
    t.box(0,fv-.035,w,.07,.13,h-.13,HI);
    for(let k=0;k<=n;k++)t.box(-w/2+k*each+(k===0?.0125:k===n?-.0125:0),vm,.025,v1-v0,.13,h-.13,HI);
    for(let k=0;k<n;k++){
      const u=-w/2+each*(k+.5), pair=each>=.36?[-1,1]:[0];
      t.box(u,vm,each-.025,v1-v0,.09,h-.13,OIL);
      for(const s of pair){
        const bu=u+s*(each-.05)/4, bw=Math.min(.15,(each-.07)/pair.length);
        t.box(bu,vb+.15,bw,.21,.005,h+.05,'#6f7773');
        for(const side of[-1,1])t.box(bu+side*(bw/2-.0025),vb+.15,.005,.21,.085,h+.055,wire);
        t.box(bu,vb+.2525,bw,.005,.085,h+.055,wire);t.box(bu,vb+.035,bw*.5,.03,.012,h+.185,wire);
        t.slope(bu,vb+.25,h+.14,Math.min(d/2,vb+.47),h+.215,.018,.012,IRON);
      }
      t.box(u,fv+.005,each-.05,.01,h-.53,.22,mix(hex,DARK,.24));pull(t,u,fv+.01,each*.5,h-.37);
      knob(t,u-each*.2,fv,h-.22);t.box(u-each*.2+.05,fv+.003,.014,.006,.014,h-.2,'#e2452f',true);
      t.box(u+each*.2,fv+.003,.05,.006,.03,h-.235,IRON);
    }
    t.rodV(-w/2+.11,fv+.012,.05,.016,.185,LO);t.box(-w/2+.11,fv+.04,.05,.012,.016,.2,'#c8a02c');
  },
  /** A steel prep table: tubs on the undershelf, a board and knife, a row of pans let into the top along the back. */
  prepTable(t,w,d,h,hex=S,{seed=0}={}){
    const n=Math.min(8,Math.max(2,Math.floor((w-.12)/.175))), pitch=.175, zone=n*pitch, z0=-d/2+.035, z1=-d/2+.255, zm=(z0+z1)/2;
    legs(t,w,d,h-.04,hex,.02,.045);
    t.box(0,0,w-.06,d-.07,.022,.24,LO);
    // The top is laid round the well the pans hang in.
    t.box(0,(z1+d/2)/2,w,d/2-z1,.04,h-.04,HI);t.box(0,-d/2+.0175,w,.035,.085,h-.04,HI);
    for(const s of[-1,1])t.box(s*(w+zone)/4,zm,(w-zone)/2,z1-z0,.04,h-.04,HI);
    t.box(0,zm,zone,z1-z0,.02,h-.07,'#59605d');
    for(let i=0;i<n;i++){
      const u=(i-(n-1)/2)*pitch, food=MISE[(i+seed)%MISE.length];
      t.box(u,zm,pitch-.014,z1-z0-.012,.03,h-.045,food);t.ball(u+(i%2?.02:-.015),zm+(i%3-1)*.03,.05,.02,.06,h-.015,mix(food,i%2?'#ffffff':'#2a2416',.12));
      if(i)t.box(u-pitch/2,zm,.012,z1-z0,.04,h-.04,HI);
    }
    const bu=-w*.13, bv=d/2-.2, bw=Math.min(.44,w*.34);
    t.box(bu,bv,bw,.28,.02,h,'#e9e6d8');
    t.box(bu+.05,bv+.02,.2,.038,.004,h+.02,'#d5d9d8');t.box(bu-.1,bv+.016,.105,.024,.016,h+.02,IRON);
    t.box(w*.3,d/2-.15,.17,.13,.016,h,WHITE);t.box(w*.3,d/2-.15,.172,.03,.002,h+.016,'#4d6f9a');
    const tubs=w>1.15?3:2;
    for(let i=0;i<tubs;i++){
      const u=(i-(tubs-1)/2)*Math.min(.42,(w-.2)/tubs);
      t.box(u,0,.3,Math.min(.4,d-.2),.2,.262,'#d3d9d3');t.box(u,0,.31,Math.min(.41,d-.19),.022,.462,['#b4463c','#3f7d57','#3d5f8f'][(i+seed)%3]);
    }
  },
  /** A reach-in refrigerator: a door to every 70 cm, long handle, hinges, the compressor behind a grille on top. */
  reachIn(t,w,d,h,hex=S){
    const fv=d/2-.045, doors=Math.max(1,Math.round(w/.72)), each=(w-.03)/doors, top=h-.24;
    t.box(0,-.035,w-.04,d-.11,.12,0,DARK);
    t.box(0,-.0225,w,d-.045,h-.12,.12,hex);
    louvre(t,0,fv,w-.06,.17,top+.04,5);
    t.box(-w/2+.13,fv+.008,.13,.012,.08,top+.085,IRON);t.box(-w/2+.13,fv+.015,.075,.003,.03,top+.11,'#9fe6b0',true);
    for(let k=0;k<doors;k++){
      const u=(k-(doors-1)/2)*each, side=doors>1&&k>=doors/2?-1:1;
      t.box(u,fv+.012,each-.025,.024,top-.19,.16,mix(hex,'#ffffff',.16));
      grip(t,u+side*(each/2-.08),fv+.024,.5,top*.42);
      for(const y of[.25,(top+.06)/2,top-.2])t.box(u-side*(each/2-.016),fv+.028,.02,.012,.075,y,CHROME);
    }
  },
  /** A three-compartment sink: wash, rinse, sanitise, a pre-rinse sprayer on a gooseneck, and a rack drying on the drainboard. */
  dishSink(t,w,d,h,hex=S){
    const BW=w*.62, each=(BW-.03)/3, u0=-w/2, DW=w-BW, ud=w/2-DW/2, ub=u0+BW/2, deep=.3, bed=h-deep;
    for(const sv of[-1,1]){
      t.post(u0+.05,sv*(d/2-.06),.021,bed,0,hex);t.post(u0+BW-.03,sv*(d/2-.06),.021,bed,0,hex);t.post(w/2-.05,sv*(d/2-.06),.021,h-.03,0,hex);
    }
    t.rodU(0,-d/2+.06,w-.1,.012,.22,LO);for(const u of[u0+.05,w/2-.05])t.rodV(u,0,d-.12,.012,.22,LO);
    t.box(ub,d/2-.011,BW,.022,deep,bed,hex);t.box(ub,-d/2+.035,BW,.022,deep,bed,hex);
    for(let k=0;k<4;k++)t.box(u0+.015+k*each,0,.03,d-.07,deep,bed,hex);
    t.box(ub,0,BW-.02,d-.04,.02,bed,LO);
    for(let k=0;k<3;k++)t.disc(u0+.015+(k+.5)*each,0,.03,.004,bed+.02,DARK);
    // Suds in the wash bowl, clear water in the rinse.
    t.box(u0+.015+each/2,-.0055,each-.03,d-.092,.004,h-.09,'#b7c6c4');
    for(const[du,dv,r]of[[-.05,-.08,.05],[.03,.06,.06],[.06,-.1,.04]])t.ball(u0+.015+each/2+du,dv,r,.018,r,h-.084,'#f1f3ee');
    t.box(u0+.015+each*1.5,-.0055,each-.03,d-.092,.004,h-.12,'#a3bfc4');
    t.box(ud,0,DW,d,.03,h-.03,HI);t.box(ud,d/2-.01,DW,.02,.022,h,HI);t.box(w/2-.01,0,.02,d-.04,.022,h,HI);
    for(let k=-1;k<=1;k++)t.box(ud+k*DW*.3,.0,.008,d-.12,.002,h,LO);
    const R=Math.min(.44,DW-.1,d-.16), vr=.01, rack='#6c8aa3';
    t.box(ud,vr,R,R,.02,h+.004,rack);
    for(const s of[-1,1]){t.box(ud+s*(R/2-.006),vr,.012,R,.075,h+.024,rack);t.box(ud,vr+s*(R/2-.006),R-.024,.012,.075,h+.024,rack);}
    for(let k=0;k<4;k++)t.drum(ud+(k%2?.03:-.03),vr-R*.3+k*R*.2,.012,R*.24,h+.03+R*.24,WHITE);
    t.box(0,-d/2+.012,w,.024,.3,h,hex);
    const uf=u0+.015+each, vf=-d/2+.06;
    t.rodU(uf,vf,.2,.017,h+.12,CHROME);
    for(const[s,hex2]of[[-1,'#b8463c'],[1,'#3e68a8']]){t.box(uf+s*.085,vf+.035,.02,.06,.014,h+.13,CHROME);t.bud(uf+s*.085,vf+.065,.013,h+.137,hex2);}
    t.slope(uf,vf,h+.13,vf+.2,h+.19,.02,.02,CHROME);t.post(uf,vf+.2,.011,.05,h+.14,CHROME);
    t.post(uf,vf,.014,.44,h+.12,CHROME);t.rodV(uf,-d/2+.04,.04,.008,h+.4,CHROME);
    t.slope(uf,vf,h+.555,vf+.15,h+.6,.026,.026,CHROME);
    t.post(uf,vf+.155,.017,.27,h+.33,'#8b9290');t.post(uf,vf+.155,.025,.09,h+.24,IRON);t.tub(uf,vf+.155,.03,.03,h+.21,CHROME);
    t.slope(uf,vf+.165,h+.33,vf+.21,h+.27,.012,.008,CHROME);
  },
  /** The pass: a steel-topped counter, and over it a shelf on posts with heat lamps under and the ticket rail along its edge. */
  passShelf(t,w,d,h,hex=S,{seed=0}={}){
    const deck=Math.min(.95,h-.42), sd=Math.min(.38,d*.62), lamps=Math.max(1,Math.round(w/.8)), span=(w-.22)/lamps;
    t.box(0,0,w-.06,d-.09,.1,0,DARK);t.box(0,0,w,d-.03,deck-.14,.1,hex);
    t.box(0,d/2-.012,w,.006,.02,deck*.5,LO);
    t.box(0,0,w+.02,d,.04,deck-.04,HI);
    const posts=w>2.3?[-1,0,1]:[-1,1];
    for(const k of posts)for(const sv of[-1,1])t.box(k*(w/2-.055),sv*sd*.3,.03,.03,h-.1-deck,deck,S);
    t.box(0,0,w,sd,.035,h-.1,S);t.box(0,-sd/2+.008,w,.016,.035,h-.065,HI);
    t.box(0,sd/2+.01,w-.04,.022,.04,h-.075,HI);
    const slips=Math.max(2,Math.min(6,Math.round(w/.36)));
    for(let k=0;k<slips;k++){
      const u=-w*.36+k*.105+(k>2?.08:0), long=.1+((seed+k*7)%4)*.022;
      t.box(u,sd/2+.024,.074,.003,long,h-.07-long,k===3?'#f1dc8a':k===4?'#f0c4c0':PAPER);
    }
    for(let k=0;k<lamps;k++){
      const u=(k-(lamps-1)/2)*span;
      t.box(u,0,span-.08,.14,.045,h-.145,LO);t.box(u,0,span-.12,.1,.02,h-.165,'#ffa24a',true);
    }
    const eu=w/2-.2;
    t.disc(eu,-d/2+.12,.04,.008,deck,DARK);t.ball(eu,-d/2+.12,.036,.026,.036,deck+.012,CHROME);t.bud(eu,-d/2+.12,.009,deck+.04,DARK);
    t.disc(eu,d/2-.1,.034,.008,deck,DARK);t.post(eu,d/2-.1,.003,.11,deck,CHROME);t.box(eu,d/2-.1,.06,.07,.012,deck+.03,PAPER);
  },
  /** A canopy hood, hung: its foot is its underside. Slanted baffle filters, a lit strip, the duct collar on top. */
  exhaustHood(t,w,d,h,hex=S){
    const wall=.025, v0=-d/2+wall+.012, v1=v0+Math.min(.34,d*.38), y0=.05, y1=h-.07, len=Math.hypot(v1-v0,y1-y0), nv=(y1-y0)/len, ny=-(v1-v0)/len;
    t.box(0,0,w,d,wall,h-wall,hex);
    for(const s of[-1,1]){t.box(0,s*(d/2-wall/2),w,wall,h-wall,0,hex);t.box(s*(w/2-wall/2),0,wall,d-2*wall,h-wall,0,hex);}
    t.box(0,d/2+.004,w,.008,.06,0,LO);
    t.box(0,d/2-wall-.02,w-.08,.035,.02,.005,LAMP,true);
    t.slope(0,v0,y0,v1,y1,w-2*wall-.01,.02,'#565f5c');
    const step=Math.max(.075,(w-.1)/24);
    for(let u=-w/2+.07;u<w/2-.05;u+=step)t.slope(u,v0+nv*.013,y0+ny*.013,v1+nv*.013,y1+ny*.013,.026,.008,'#aab3ad');
    t.box(0,v0+.035,w-2*wall,.07,.035,.0,LO);
    const cw=Math.min(.5,w*.34), cd=Math.min(.36,d*.42);
    t.box(0,-d*.14,cw+.05,cd+.05,.016,h,LO);t.box(0,-d*.14,cw,cd,.22,h+.016,hex);
  },
  /** A pizza bench: marble top, a tray of dough balls, sauce and its ladle, cheese, a round on the go and the peel stood at one end. */
  doughBench(t,w,d,h,hex=S,{seed=0}={}){
    const fv=d/2-.035, doors=Math.max(1,Math.round(w/.62)), each=(w-.04)/doors, back=-d/2;
    t.box(0,-.035,w-.06,d-.11,.11,0,DARK);t.box(0,-.0175,w,d-.035,h-.15,.11,hex);
    for(let k=0;k<doors;k++){
      const u=(k-(doors-1)/2)*each;
      t.box(u,fv+.006,each-.03,.012,h-.3,.15,mix(hex,DARK,.2));pull(t,u,fv+.012,each*.42,h-.21);
    }
    t.box(0,0,w+.02,d,.04,h-.04,'#e3dfd5');t.box(0,back+.01,w,.02,.05,h,'#d6d2c8');
    const pu=w/2-.17, cu=pu-.33, su=cu-.29, room=su-.13+w/2-.05, tw=Math.min(.5,room), tu=-w/2+.05+tw/2;
    if(tw>=.2){
      const cols=Math.max(1,Math.floor(tw/.15));
      t.box(tu,back+.23,tw,.36,.035,h,'#bfc3bb');t.box(tu,back+.23,tw-.03,.33,.004,h+.035,'#a9ada5');
      for(let i=0;i<cols;i++)for(let j=0;j<2;j++)t.ball(tu+(i-(cols-1)/2)*.15,back+.23+(j-.5)*.16,.06,.04,.06,h+.066,DOUGH);
    }
    t.disc(su,back+.18,.105,.2,h,'#c5cac5');t.disc(su,back+.18,.094,.004,h+.2,'#b03a26');
    t.slope(su+.02,back+.2,h+.19,back+.34,h+.34,.014,.009,CHROME);t.box(su+.02,back+.345,.014,.02,.012,h+.325,CHROME);
    if(w>=1.3){
      t.box(cu,back+.2,.26,.3,.13,h,'#d5dbd6');t.box(cu,back+.2,.235,.275,.006,h+.13,'#f0e2a8');
      for(const[du,dv]of[[-.05,-.05],[.04,.03],[-.02,.07]])t.ball(cu+du,back+.2+dv,.05,.02,.05,h+.138,'#f5ebbd');
    }
    const ru=Math.min(su-.3,-w*.02)<tu+tw/2-.05?su-.02:Math.min(su-.3,-w*.02), rv=d/2-.21;
    t.disc(ru,rv,.2,.002,h,'#f5f2e9');t.disc(ru,rv,.15,.012,h+.002,DOUGH);
    t.slope(pu,back+.2,h+.004,back+.102,h+.36,.3,.012,WOOD);t.slope(pu,back+.102,h+.36,back+.016,h+.69,.036,.02,WOOD);
  },
  /** A low candy-stove burner carrying a tall stock pot, lid ajar, ladle in. `more.kettle` makes it a wide bagel kettle. */
  stockBurner(t,w,d,h,hex=S,{kettle}={}){
    const s=Math.min(w,d), r=kettle?s*.44:s*.33, tall=kettle?.3:.46, top=h+tall;
    for(const su of[-1,1])for(const sv of[-1,1])t.box(su*(w/2-.04),sv*(d/2-.04),.04,.04,h-.02,0,DARK);
    for(const sv of[-1,1]){t.box(0,sv*(d/2-.04),w-.12,.04,.05,h-.07,DARK);t.box(sv*(w/2-.04),0,.04,d-.12,.05,h-.07,DARK);t.rodU(0,sv*(d/2-.04),w-.1,.011,.13,DARK);}
    t.disc(0,0,s*.21,.03,h-.13,IRON);t.post(0,0,.03,h-.2,.07,IRON);flames(t,0,0,s*.17,h-.1,8,.018);
    t.box(0,0,w-.1,.024,.02,h-.02,IRON);t.box(0,0,.024,d-.1,.02,h-.02,IRON);
    t.rodU(0,d/2-.012,w-.1,.014,h-.17,'#6b716d');
    for(const su of[-1,1])knob(t,su*w*.2,d/2-.004,h-.17,'#a8382c');
    t.disc(0,0,r,tall,h,hex===S?'#b4bab6':hex);t.disc(0,0,r+.008,.012,top-.012,HI);
    for(const su of[-1,1])t.box(su*(r+.018),0,.036,.09,.014,top-.1,LO);
    if(kettle){
      t.disc(0,0,r-.012,.004,top,'#c3cdbd');
      for(let i=0;i<5;i++){const a=i*1.26+.3, x=Math.cos(a)*r*.56, y=Math.sin(a)*r*.56;t.can(x,y,.05,.02,top-.004,i%2?'#d9b77a':'#e3c58c');t.can(x,y,.015,.003,top+.016,'#a98a56');}
      t.can(0,0,.05,.02,top-.004,'#dcbc80');t.can(0,0,.015,.003,top+.016,'#a98a56');
      t.box(r*.5,.02,.11,.09,.004,top+.03,'#9aa19c');t.slope(r*.5,.06,top+.03,Math.min(d/2,r+.07),top+.12,.016,.012,WOOD);
    }else{
      t.disc(0,0,r-.012,.004,top,'#b08a4f');
      t.disc(-.07,-.05,r+.004,.012,top+.004,HI);t.can(-.07,-.05,.022,.026,top+.016,IRON);
      t.slope(.08,.06,top-.02,.24,top+.11,.013,.008,CHROME);t.box(.08,.243,.013,.012,.03,top+.085,CHROME);
    }
  },
  /** A tandoor: a clay pot cased in steel, its mouth glowing, skewers stood in it and the lid set down beside. */
  tandoor(t,w,d,h,hex=S){
    const s=Math.min(w,d), D=s*.6, mu=-w*.07, mv=-d*.06, clay='#b8652f';
    for(const su of[-1,1])for(const sv of[-1,1])t.post(su*(w/2-.07),sv*(d/2-.07),.03,.1,0,IRON);
    t.box(0,0,w,d,h-.14,.1,hex);t.box(0,0,w,d,.04,h-.04,HI);
    // The pot's collar stands proud of the deck; the fire shows in the floor of it.
    t.disc(mu,mv,D*.47,.004,h,mix(clay,'#3a2416',.2));t.basin(mu,mv,D,D,.2,h-.118,clay);
    t.disc(mu,mv,D*.335,.004,h+.004,'#8a2f14');t.disc(mu,mv,D*.25,.004,h+.008,'#ff8a2a');t.box(mu,mv,D*.2,D*.2,.003,h+.012,'#ffd27a',true);
    t.box(0,d/2+.003,w-.1,.006,.035,h-.12,LO);
    t.box(0,d/2+.003,w*.34,.006,.16,.17,DARK);pull(t,0,d/2+.004,w*.18,.29,LO);
    knob(t,w*.3,d/2,.3,'#a8382c');
    for(const[du,v1,y1]of[[-.05,mv-.17,h+.42],[.03,mv-.2,h+.36],[.07,mv+.19,h+.4]]){
      t.slope(mu+du,mv+(v1>mv?.03:-.03),h+.012,v1,y1,.008,.008,'#c9cdca');t.bud(mu+du,v1,.016,y1,IRON);
    }
    const lu=w/2-.15, lv=d/2-.15;
    t.disc(lu,lv,.115,.016,h,LO);t.disc(lu,lv,.07,.01,h+.016,S);t.can(lu,lv,.022,.03,h+.026,IRON);
  },
  /** A cabinet pit smoker: the big door with its latch and dial, the firebox door low down, the stack on top. */
  smoker(t,w,d,h,hex='#26292b'){
    const fv=d/2-.04, top=h-.28, T=mix(hex,'#ffffff',.1), dw=w-.12, d0=.63, d1=top-.06, mid=(d0+d1)/2;
    for(const su of[-1,1])for(const sv of[-1,1])t.post(su*(w/2-.08),-.02+sv*(d/2-.1),.035,.1,0,'#17191a');
    t.box(0,-.02,w,d-.04,top-.1,.1,hex);t.box(0,-.02,w+.02,d-.02,.03,top,T);
    t.box(0,fv+.01,dw,.02,d1-d0,d0,T);
    for(const y of[d0+.1,mid-.035,d1-.17])t.box(-dw/2+.005,fv+.024,.04,.012,.07,y,'#4a5053');
    t.box(dw/2-.07,fv+.022,.07,.014,.05,mid-.025,'#565c5f');t.box(dw/2-.05,fv+.038,.026,.014,.22,mid-.11,CHROME);
    t.drum(0,fv+.026,.012,.062,d1-.2,CHROME);t.drum(0,fv+.034,.004,.05,d1-.2,WHITE);t.box(.014,fv+.038,.034,.002,.006,d1-.203,'#b8322a');
    t.box(0,fv+.008,dw,.016,.07,.53,T);t.box(0,fv+.02,.14,.012,.016,.557,'#565c5f');
    t.box(0,fv+.01,w*.5,.02,.3,.19,T);pull(t,0,fv+.02,w*.22,.43,'#8d9492');
    for(let k=-1;k<=1;k++)t.box(k*.08,fv+.021,.05,.004,.014,.25,'#ff7a2a',true);
    for(const y of[.24,.4])t.box(-w*.25+.005,fv+.024,.04,.012,.05,y,'#4a5053');
    t.post(w*.24,-d*.2,.06,h-top-.08,top+.03,hex);t.cone(w*.24,-d*.2,.095,.05,h-.05,T);
  },
  /** A refrigerated sandwich unit: a cutting board along the front, a raised well of pans behind under its open lid, doors below. */
  sandwichUnit(t,w,d,h,hex=S,{seed=0}={}){
    const deck=h-.24, fv=d/2-.06, doors=Math.max(1,Math.round(w/.65)), each=(w-.04)/doors;
    const n=Math.min(8,Math.max(3,Math.floor((w-.06)/.2))), pitch=(w-.07)/n, vA=d/2-.3, yA=deck+.035, vB=-d/2+.055, yB=deck+.1;
    const at=f=>[vA+(vB-vA)*f,yA+(yB-yA)*f];
    t.box(0,-.05,w-.06,d-.16,.1,0,DARK);for(let k=0;k<3;k++)t.box(0,fv-.019,w-.12,.006,.012,.025+k*.026,LO);
    t.box(0,-.03,w,d-.06,deck-.14,.1,hex);
    for(let k=0;k<doors;k++){
      const u=(k-(doors-1)/2)*each, side=k%2?-1:1;
      t.box(u,fv+.006,each-.03,.012,deck-.27,.14,mix(hex,DARK,.18));grip(t,u+side*(each/2-.07),fv+.012,.17,deck-.34);
    }
    t.box(0,-.03,w,d-.06,.04,deck-.04,HI);
    t.box(0,d/2-.135,w-.01,.27,.022,deck,'#efeee6');
    t.box(0,vA+.012,w,.026,.045,deck,HI);t.box(0,-d/2+.025,w,.05,.12,deck,HI);
    for(const s of[-1,1])t.box(s*(w/2-.0125),(vA+vB)/2,.025,vA-vB,.085,deck,HI);
    t.slope(0,vA,yA,vB,yB,w-.05,.014,'#59605d');
    for(let i=0;i<n;i++)for(let row=0;row<2;row++){
      const u=(i-(n-1)/2)*pitch, food=SUB[(i+row*4+seed)%SUB.length], [v0,y0]=at(row*.5+.05), [v1,y1]=at(row*.5+.45), [vm,ym]=at(row*.5+.25);
      t.slope(u,v0,y0+.012,v1,y1+.012,pitch-.024,.012,food);
      t.ball(u+((i+row)%2?.015:-.015),vm,pitch*.27,.016,.05,ym+.024,mix(food,(i+row)%2?'#ffffff':'#2a2416',.14));
    }
    t.box(0,-d/2+.02,w-.01,.036,h-deck-.12,deck+.12,HI);t.box(0,-d/2+.04,w-.09,.004,h-deck-.16,deck+.14,WHITE);
    for(const s of[-1,1])t.box(s*(w/2-.012),-d/2+.075,.02,.08,h-deck-.14,deck+.12,HI);
  },
  /** A doughnut fryer: a wide shallow kettle with rings floating in it, and beside it the glazing screen with a batch done. */
  donutFryer(t,w,d,h,hex=S,{seed=0}={}){
    const fv=d/2-.03, fw=w*.58, uf=-w/2+fw/2, gw=w-fw, ug=w/2-gw/2, v0=-d/2+.065, v1=fv-.035, vm=(v0+v1)/2;
    legs(t,w,d-.03,.15,LO,.025,.055,-.015);
    t.box(0,-.015,w,d-.03,h-.27,.15,hex);
    t.box(0,-d/2+.015,w,.03,.24,h-.12,hex);
    t.box(uf,fv-.0175,fw,.035,.12,h-.12,HI);t.box(uf,-d/2+.0475,fw,.035,.12,h-.12,HI);
    for(const u of[-w/2+.0175,-w/2+fw-.0175])t.box(u,vm,.035,v1-v0,.12,h-.12,HI);
    t.box(uf,vm,fw-.07,v1-v0,.075,h-.12,OIL);
    const fx=(fw-.07)/3, fy=(v1-v0)/2;
    for(const[i,j,pale]of[[0,0,1],[1,0,0],[2,0,1],[0,1,0],[2,1,0]])doughnut(t,uf+(i-1)*fx*.92,vm+(j-.5)*fy*.9,h-.052,pale?'#e4c68a':'#cf9a4f',mix(OIL,'#6a4a16',.3));
    for(const k of[0,1])t.rodU(uf+.03,vm+fy*.02+k*.03,fw*.62,.006,h+.006,WOOD);
    t.box(uf,fv+.004,fw-.04,.008,.1,h-.25,mix(hex,DARK,.28));
    knob(t,uf-fw*.2,fv+.008,h-.2);t.box(uf-fw*.2+.05,fv+.011,.014,.006,.014,h-.18,'#e2452f',true);t.box(uf+fw*.2,fv+.011,.05,.006,.03,h-.215,IRON);
    t.box(uf,fv+.005,fw-.07,.01,h-.52,.22,mix(hex,DARK,.2));pull(t,uf,fv+.01,fw*.4,h-.35);
    t.rodV(uf-fw*.3,fv+.012,.05,.016,.185,LO);
    t.box(ug,-.015,gw,d-.03,.09,h-.12,HI);
    t.box(ug,-.01,gw-.06,d-.16,.02,h-.03,'#d0d5d0');t.box(ug,-.01,gw-.1,d-.2,.003,h-.01,'#f3efe2');
    for(const s of[-1,1])t.box(ug,-.01+s*(d/2-.1),gw-.07,.008,.008,h+.012,'#8f9792');
    for(let k=-1;k<=1;k++)t.box(ug+k*(gw-.1)/3,-.01,.008,d-.2,.008,h+.012,'#8f9792');
    for(let i=0;i<2;i++)for(let j=0;j<3;j++)doughnut(t,ug+(i-.5)*Math.min(.19,gw*.42),-.01+(j-1)*Math.min(.17,(d-.26)/2.2),h+.02,'#c98f4b','#8a5f30',['#f1e6cf','#5a3524','#e79ab0'][(i+j+seed)%3]);
  },
  /** A bakery rack oven: the tall door with its warm window, the control panel beside it, the vent hood lip over. */
  rackOven(t,w,d,h,hex=S){
    const fv=d/2-.13, dw=w*.6, ud=-w/2+.05+dw/2, pw=w-dw-.13, uc=w/2-.04-pw/2, d0=.03, d1=h-.34, wu=ud-dw*.1, ww=dw*.46, wy=.5, wh=d1-wy-.3;
    t.box(0,-.065,w,d-.13,h,0,hex);
    t.box(ud,fv+.015,dw,.03,d1-d0,d0,mix(hex,'#ffffff',.12));
    t.box(wu,fv+.032,ww,.004,wh+.05,wy-.025,IRON);t.box(wu,fv+.035,ww-.05,.004,wh,wy,'#f5a64c',true);
    t.box(wu,fv+.038,ww-.09,.003,wh*.5,wy+wh*.3,'#ffc978',true);
    for(let k=0;k<6;k++)t.box(wu,fv+.041,ww-.05,.003,.012,wy+(k+.6)*wh/6.4,'#6f3d19',true);
    grip(t,ud+dw/2-.075,fv+.03,.75,h*.3);
    for(const y of[.2,d1/2,d1-.2])t.box(ud-dw/2+.004,fv+.034,.022,.012,.08,y,CHROME);
    t.slope(ud,fv,d0+.006,d/2+.03,.008,dw,.012,LO);
    t.box(uc,fv+.006,pw,.012,.56,1.02,IRON);t.box(uc,fv+.013,pw-.06,.004,.07,1.45,'#9fe6b0',true);
    for(let i=0;i<2;i++)for(let j=0;j<3;j++)t.box(uc+(i-.5)*pw*.38,fv+.014,pw*.24,.006,.032,1.36-j*.06,j===2&&i?'#b8402f':j===2?'#3f8a52':'#8d9492');
    t.drum(uc,fv+.022,.02,Math.min(.04,pw*.22),1.12,HI);t.box(uc,fv+.033,.008,.002,.03,1.12,IRON);
    t.box(0,d/2-.1,w,.26,.2,h-.2,hex);t.slope(0,fv,h-.33,d/2+.02,h-.2,w-.02,.016,mix(hex,DARK,.2));
    t.box(0,d/2+.032,w-.1,.004,.05,h-.12,LO);
  },
  /** A floor planetary mixer: bowl in its cradle, wire guard, the head over it. */
  mixer(t,w,d,h,hex='#8f9795'){
    const cw=w*.5, colV=-d/2+.14, bv=d*.1, br=Math.min(w*.36,d*.31), headH=h*.2, bowlUp=h*.36, bowlH=h*.26, hb=h-headH, hd=d*.84, hv=-d/2+.02+hd/2;
    t.box(0,0,w*.84,d-.04,.07,0,hex);
    t.box(0,colV,cw,.24,hb-.07,.07,hex);
    t.box(0,hv,cw+.04,hd,headH*.7,hb,hex);t.box(0,hv,cw-.03,hd-.07,headH*.3,hb+headH*.7,hex);
    t.disc(0,bv,.08,.06,hb-.06,LO);t.post(0,bv,.014,hb-.06-bowlUp-bowlH,bowlUp+bowlH,CHROME);
    t.disc(0,bv,br*.62,bowlH*.16,bowlUp,'#c9ceca');t.disc(0,bv,br*.86,bowlH*.2,bowlUp+bowlH*.16,'#c9ceca');t.disc(0,bv,br,bowlH*.64,bowlUp+bowlH*.36,'#c9ceca');
    t.disc(0,bv,br-.014,.003,bowlUp+bowlH,'#8f9794');
    for(const s of[-1,1])t.box(s*(br+.012),(colV+.12+bv)/2,.035,bv-colV-.1,.04,bowlUp+bowlH*.6,hex);
    for(let i=0;i<8;i++){const a=(i+.5)/8*2*Math.PI;t.box(Math.cos(a)*br*.9,bv+Math.sin(a)*br*.9,.008,.008,hb-bowlUp-bowlH+.01,bowlUp+bowlH-.01,'#b9bfbb');}
    const vf=hv+hd/2, reach=Math.min(.09,w*.14);
    t.box(-.05,vf+.004,.036,.008,.036,hb+headH*.2,'#3f8a52');t.box(.05,vf+.004,.036,.008,.036,hb+headH*.2,'#b8402f');
    t.box(0,vf+.003,cw*.5,.006,.03,hb+headH*.48,CHROME);
    t.rodU(cw/2+reach/2,colV,reach,.012,h*.5,CHROME);t.bud(cw/2+reach+.005,colV,.024,h*.5,IRON);
  },
  /** An ice-cream dipping cabinet: tubs of each flavour sunk in the well under angled glass lids, a scoop standing in its well. */
  dipCabinet(t,w,d,h,hex='#e6e4da',{seed=0}={}){
    const top=h-.2, sw=.2, zone=w-.08-sw, n=Math.min(5,Math.max(2,Math.floor(zone/.27))), pitch=zone/n, u0=-w/2+.04, us=w/2-.04-sw/2;
    const r=Math.min(pitch,(d-.08)/2)*.45, vb=-d/2+.045, yb=h-.025, vf=d/2-.045, yf=top+.02;
    t.box(0,0,w-.06,d-.08,.1,0,DARK);t.box(0,0,w,d,top-.22,.1,hex);
    for(const s of[-1,1]){t.box(0,s*(d/2-.02),w,.04,.12,top-.12,HI);t.box(s*(w/2-.02),0,.04,d-.08,.12,top-.12,HI);}
    t.box(0,0,w-.08,d-.08,.02,top-.12,'#3b4344');
    for(let i=0;i<n;i++)for(let row=0;row<2;row++){
      const u=u0+pitch*(i+.5), v=(row-.5)*(d-.08)/2, ice=FLAVOURS[(i*2+row+seed)%FLAVOURS.length];
      t.disc(u,v,r,.07,top-.1,'#d9d2c0');t.disc(u,v,r-.012,.006,top-.03,ice);
      t.ball(u+((i+row)%2?.03:-.02),v+.02,r*.5,.016,r*.4,top-.022,mix(ice,'#ffffff',.2));
    }
    t.box(us,0,sw,d-.08,.1,top-.1,HI);
    t.box(us,-.08,.11,.15,.003,top,'#9ec4cf');t.slope(us,-.08,top,.02,top+.12,.014,.014,IRON);t.bud(us,-.09,.026,top+.012,CHROME);
    t.tub(us,.16,.04,.13,top,'#d6a865');t.tub(us,.16,.04,.13,top+.03,'#c99a58');
    for(const s of[-1,1])t.box(s*(w/2-.02),vb,.03,.03,yb-top,top,HI);
    t.box(0,vb,w,.03,.03,yb-.005,HI);t.box(-sw/2,vf,zone+.02,.022,.018,top+.008,HI);
    for(let i=0;i<=n;i++)t.slope(u0+pitch*i,vb,yb,vf,yf,.018,.014,HI);
    for(let i=0;i<n;i++){
      const u=u0+pitch*(i+.68), f0=.28, f1=.62;
      t.slope(u,vb+(vf-vb)*f0,yb+(yf-yb)*f0+.004,vb+(vf-vb)*f1,yb+(yf-yb)*f1+.004,.026,.003,'#eef6f4');
    }
  },
  /** A soft-serve machine: two draw handles over a drip tray, lit header, hoppers on top and a tube of cones at its side. */
  softServe(t,w,d,h,hex=S){
    const bw=w-.13, ub=-.065, fv=d/2-.11, uc=w/2-.05, hy=h-.5;
    for(const su of[-1,1])for(const sv of[-1,1])t.post(ub+su*(bw/2-.06),-.055+sv*(d/2-.13),.03,.09,0,IRON);
    t.box(ub,-.055,bw,d-.11,h-.09,.09,hex);
    louvre(t,ub,fv,bw-.08,.3,.2,4);
    t.box(ub,fv+.005,bw-.06,.01,.36,h-.64,'#2f3537');
    for(const s of[-1,1]){
      const u=ub+s*bw*.2;
      t.box(u,fv+.03,.1,.05,.12,hy,HI);t.post(u,fv+.035,.02,.04,hy-.04,WHITE);
      t.slope(u,fv+.05,hy+.09,fv+.105,hy+.17,.018,.018,CHROME);t.bud(u,fv+.11,.026,hy+.18,IRON);
    }
    t.post(ub,fv+.03,.016,.05,hy-.03,WHITE);t.box(ub,fv+.02,.05,.03,.07,hy+.02,HI);
    t.box(ub,fv+.06,bw-.1,.12,.02,h-.78,HI);t.box(ub,fv+.06,bw-.14,.09,.004,h-.76,IRON);
    t.box(ub,fv+.008,bw-.06,.016,.2,h-.25,'#f6ead0',true);
    t.box(ub,fv+.018,.05,.004,.06,h-.22,'#d6a865',true);
    for(let k=0;k<3;k++)t.box(ub,fv+.018,.07-k*.02,.004,.03,h-.16+k*.03,k%2?'#e9a0b4':'#fbf6ea',true);
    for(const s of[-1,1]){t.box(ub+s*bw*.3,fv+.018,bw*.14,.004,.012,h-.2,'#c9785a',true);t.box(ub+s*bw*.3,fv+.018,bw*.14,.004,.012,h-.12,'#c9785a',true);}
    for(const s of[-1,1]){t.box(ub+s*bw*.23,-.1,bw*.38,d*.42,.02,h,LO);t.can(ub+s*bw*.23,-.1,.02,.02,h+.02,IRON);}
    t.can(uc,fv-.1,.045,.42,h-.62,HI);t.box(uc-.055,fv-.1,.05,.03,.03,h-.4,LO);
    t.tub(uc,fv-.1,.04,.09,h-.7,'#d6a865');t.tub(uc,fv-.1,.04,.05,h-.665,'#c99a58');
  },
  /** A commercial rice cooker on a counter. */
  riceCooker(t,w,d,h,hex='#e9e7df'){
    const r=Math.min(w,d)/2-.035, v=-.012, bh=h*.6, lid=.014+bh;
    for(let i=0;i<3;i++)t.can(Math.cos(i*2.1+.5)*r*.75,v+Math.sin(i*2.1+.5)*r*.75,.02,.014,0,IRON);
    t.disc(0,v,r,bh,.014,hex);t.disc(0,v,r+.004,.03,.014,DARK);
    t.disc(0,v,r+.008,.022,lid,HI);t.ball(0,v,r*.92,h-lid-.056,r*.92,lid+.022,HI);
    t.can(0,v,.032,.032,h-.04,IRON);t.can(r*.55,v-r*.3,.014,.012,lid+.022+(h-lid-.056)*.7,IRON);
    for(const s of[-1,1])t.box(s*(r+.014),v,.03,.075,.022,bh*.78,IRON);
    t.box(0,v+r-.004,.12,.03,.1,.03,DARK);
    t.box(-.025,v+r+.013,.016,.004,.016,.095,'#ff8a3a',true);t.box(.025,v+r+.013,.016,.004,.016,.095,'#8fd98a',true);
    t.box(0,v+r+.016,.04,.012,.014,.05,WHITE);
  },
  /** A soda fountain: a row of valves under a lit head, the drip tray, cups stacked rim down beside it. */
  sodaFountain(t,w,d,h,hex=S,{seed=0}={}){
    const tw=w-.15, ut=-.075, n=Math.max(4,Math.min(8,Math.round(tw/.075))), pitch=(tw-.05)/n, hy=h*.56, hv=d*.2, uc=w/2-.065;
    const brand=['#b8322a','#2f5f9e','#3f8a52','#e07b2a','#e9e4d6','#7a4a9e','#c9a23f','#23272b'];
    t.box(ut,0,tw,d,.05,0,mix(hex,DARK,.5));
    t.box(ut,d/4+.01,tw-.04,d/2-.05,.012,.05,IRON);for(let k=-1;k<=1;k++)t.box(ut,d/4+.01+k*(d/2-.09)/3,tw-.06,.012,.004,.062,LO);
    t.box(ut,-d/4,tw,d/2,hy-.05,.05,hex);t.box(ut,.003,tw-.05,.006,hy-.08,.065,'#30363a');
    t.box(ut,(hv-d/2)/2,tw,d/2+hv,h-hy,hy,hex);
    t.box(ut,hv+.004,tw-.04,.008,h-hy-.16,hy+.13,'#f4ecd8',true);
    t.box(ut,hv+.009,tw-.1,.004,(h-hy)*.14,hy+.13+(h-hy-.16)*.55,'#b8322a',true);t.box(ut,hv+.009,tw-.1,.004,(h-hy)*.09,hy+.13+(h-hy-.16)*.22,'#2f5f9e',true);
    for(let i=0;i<n;i++){
      const u=ut+(i-(n-1)/2)*pitch;
      t.box(u,hv+.022,pitch*.72,.044,.1,hy+.01,'#2b2f31');t.can(u,hv+.024,.014,.035,hy-.025,'#17191b');
      t.box(u,hv+.004,pitch*.42,.004,.085,hy-.085,CHROME);t.box(u,hv+.046,pitch*.52,.004,.045,hy+.045,brand[(i+seed)%brand.length],true);
    }
    for(let k=0;k<8;k++)t.tub(uc,.08,.045,.12,k*.021,k%2?'#e3dfd3':'#f3f1e8');
    t.disc(uc,-.1,.05,.06,0,'#dfe6e4');t.disc(uc,-.1,.012,.004,.06,'#aab4b2');
  },
  /** A pour-over coffee brewer: a pot under the funnel, another keeping warm on top, filters and a pitcher beside. */
  coffeeBrewer(t,w,d,h,hex=S){
    const bw=Math.min(.3,w*.56), ub=-w/2+bw/2+.01, fv=d/2-.04, pv=d*.12, hb=h-.24;
    t.box(ub,0,bw,d,.05,0,hex);t.disc(ub,pv,.078,.006,.05,IRON);
    t.box(ub,-d/2+.07,bw,.14,hb-.05,.05,hex);
    t.box(ub,-.02,bw,d-.04,.1,hb,hex);t.disc(ub,-.01,.078,.006,h-.14,IRON);
    t.can(ub,pv,.062,.06,hb-.06,IRON);t.box(ub,pv+.075,.022,.04,.02,hb-.045,IRON);
    decanter(t,ub,pv,.056,IRON);decanter(t,ub,-.01,h-.134,'#d9722a');
    t.box(ub-bw*.28,fv+.003,.03,.006,.022,hb+.04,'#e2452f',true);t.box(ub-bw*.05,fv+.003,.03,.006,.022,hb+.04,IRON);
    t.box(ub+bw*.22,fv+.002,bw*.3,.004,.05,hb+.025,mix(hex,DARK,.5));
    const ur=w/2-(w-bw-.01)/2;
    if(w-bw>.16){
      t.tub(ur-.02,-d*.2,.06,.05,0,'#f4f2ea');t.tub(ur-.02,-d*.2,.06,.05,.012,'#e9e6dc');
      t.post(ur+.01,d*.18,.04,.1,0,HI);t.box(ur+.06,d*.18,.016,.016,.07,.02,HI);
    }
  },
  /** A deli slicer, side on: the round blade in its guard, a ham on the carriage pressed to it. */
  slicer(t,w,d,h,hex=S){
    const br=Math.min(w*.3,(h-.14)/2), bu=-w*.08, bv=-.03, cy=.095+br, cu=bu+br*.25;
    for(const su of[-1,1])for(const sv of[-1,1])t.can(su*(w/2-.07),sv*(d/2-.08),.022,.016,0,IRON);
    t.box(0,0,w-.04,d-.06,.07,.016,hex);
    t.box(bu-br*.2,bv-.1,br*1.7,.14,cy-.03,.086,hex);
    t.drum(bu,bv-.014,.034,br+.012,cy,LO);t.drum(bu,bv+.009,.012,br,cy,'#dfe2e0');t.drum(bu,bv+.018,.006,br*.3,cy,LO);
    t.box(bu,bv-.02,.08,.05,.035,cy+br,hex);
    t.box(cu+.02,bv+.11,br*1.5,.17,.018,.1,HI);t.box(cu+.02,bv+.11,.04,.1,.016,.085,LO);
    t.box(cu-br*.72,bv+.11,.012,.17,.15,.118,HI);
    t.drum(cu,bv+.085,.13,.055,.118+.058,'#d98c8c');t.drum(cu,bv+.152,.004,.045,.118+.058,'#e7a9a4');
    t.box(cu,bv+.165,.11,.012,.13,.118,HI);t.bud(cu+.02,bv+.185,.022,.26,IRON);
    t.drum(w*.3,d/2-.035,.03,.035,.056,IRON);t.box(w*.3,d/2-.018,.006,.002,.03,.056,WHITE);
    t.box(-w*.3,d/2-.028,.03,.006,.02,.045,'#3f8a52');t.box(-w*.3+.045,d/2-.028,.03,.006,.02,.045,'#b8402f');
  },
  /** A sushi chef's station: the rice tub and paddle, fish and the long knife on the board, nori, and the small dishes. */
  sushiStation(t,w,d,h,hex='#d8b98a'){
    const hr=Math.min(.17,d*.36,w*.2), hu=-w/2+hr+.02, bu=w*.07, nu=w/2-.1;
    t.disc(hu,0,hr,.09,0,'#c7a16a');t.disc(hu,0,hr+.004,.012,.018,'#9a6038');t.disc(hu,0,hr+.004,.012,.06,'#9a6038');
    t.disc(hu,0,hr-.016,.004,.088,'#f3f0e6');t.ball(hu-.02,-.01,hr*.6,.03,hr*.55,.09,'#f8f6ee');
    t.slope(hu+.07,-.03,.1,hr+.05,.165,.05,.007,'#e2c896');
    t.box(bu,.02,.34,.24,.025,0,hex);
    t.box(bu-.07,-.035,.15,.055,.035,.025,'#a8323a');
    for(let k=0;k<3;k++)t.slope(bu+.035+k*.024,-.06,.027,-.01,.047,.014,.006,'#b83c44');
    t.box(bu-.07,.04,.13,.05,.03,.025,'#e98858');for(const k of[-1,0,1])t.box(bu-.07+k*.035,.04,.006,.051,.002,.055,'#f6cdb4');
    t.box(bu+.06,.108,.22,.026,.003,.027,'#d9dcda');t.box(bu-.095,.108,.095,.022,.018,.026,'#e6d3a8');t.box(bu-.045,.108,.012,.024,.02,.025,IRON);
    t.box(nu,-.1,.12,.2,.03,0,'#1c2a22');t.box(nu+.006,-.094,.12,.2,.002,.03,'#27392d');
    for(const[k,hex2]of[[0,'#8fae4a'],[1,'#e8a9a0']]){t.disc(nu-.075+k*.075,.12,.033,.012,0,WHITE);t.bud(nu-.075+k*.075,.12,.02,.024,hex2);}
    t.disc(nu+.075,.12,.033,.012,0,WHITE);t.disc(nu+.075,.12,.024,.002,.012,'#2a1c14');
  },
  /** A spindle milkshake mixer with its steel cup hung under the head. */
  shakeMixer(t,w,d,h,hex='#8fb5a2'){
    const s=Math.min(w,d), cv=d*.08, cy=h-.38;
    t.box(0,0,s*.62,d*.8,.035,0,hex);t.box(0,d*.4+.002,s*.4,.004,.016,.01,CHROME);
    t.box(0,-d*.28,s*.3,.075,h-.175,.035,hex);
    t.box(0,-d*.08,s*.44,d*.56,.075,h-.14,hex);t.box(0,-d*.08,s*.34,d*.47,.035,h-.065,hex);
    t.box(0,d*.2+.003,s*.3,.006,.03,h-.115,CHROME);
    t.post(0,cv,.006,.2,h-.34,CHROME);t.disc(0,cv,.016,.006,h-.34,CHROME);
    t.box(0,-d*.14,.07,.1,.014,cy-.014,CHROME);
    t.post(0,cv,.037,.05,cy,'#cdd1ce');t.post(0,cv,.044,.14,cy+.05,'#cdd1ce');t.disc(0,cv,.047,.008,cy+.19,HI);
    t.box(s*.08,-d*.08,.012,.03,.008,h-.03,IRON);t.bud(s*.08,-d*.08,.012,h-.012,'#b8402f');
  },
  /** A conveyor toaster: bread goes in on the rack up top and comes back toasted on the tray below. */
  toaster(t,w,d,h,hex=S){
    const fv=d/2-.1;
    for(const su of[-1,1])for(const sv of[-1,1])t.can(su*(w/2-.05),-.04+sv*(d/2-.11),.02,.02,0,IRON);
    t.box(0,-.04,w,d-.12,h-.035,.02,hex);
    t.box(0,fv+.002,w-.08,.004,.11,h-.2,IRON);t.box(0,fv+.004,w-.14,.004,.03,h-.125,'#ff7a2a',true);t.box(0,fv+.006,w-.2,.004,.01,h-.115,'#ffd27a',true);
    t.slope(0,fv,h-.185,d/2+.02,h-.115,w-.11,.006,'#b9bfbb');
    for(const s of[-1,1])t.slope(s*(w/2-.05),fv,h-.18,d/2+.025,h-.105,.012,.022,HI);
    for(const s of[-1,1])t.slope(s*.085,fv+.02,h-.167,d/2+.01,h-.117,.1,.014,'#ead9ae');
    t.box(0,fv+.003,w-.06,.006,.07,.16,mix(hex,DARK,.45));
    knob(t,w*.25,fv+.006,.195,IRON,.022);knob(t,w*.08,fv+.006,.195,IRON,.022);t.box(-w*.2,fv+.008,.03,.006,.02,.185,'#e2452f',true);
    t.box(0,fv+.002,w-.1,.004,.075,.07,IRON);
    t.box(0,fv+.06,w-.08,.12,.012,.05,HI);t.box(0,fv+.115,w-.08,.01,.03,.05,HI);
    t.box(-.06,fv+.055,.1,.1,.014,.062,'#c58e48');t.box(.05,fv+.06,.1,.1,.014,.064,'#b98140');
    for(let k=-1;k<=1;k++)t.box(0,-.04+k*.06,w-.14,.022,.002,h-.015,IRON);
  },
  /** What is on the heat or the board while a cook works: `more.ware` names it, `more.tone` colours the food. */
  cookware(t,w,d,h,hex,{ware,tone='#c98a4b',inUse}={}){
    (Object.hasOwn(WARES,ware)?WARES[ware]:WARES.pan)(t,tone,inUse);
  },
};
