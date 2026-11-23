// Ingredients. Each sets itself down on the bench where it is told, on top of
// whatever is already there, so a dish is put together the way a cook plates it.
import * as T from './vendor/three.module.min.js';
import { bit as bitOf,blob,lathe,loft,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,clamp,mottle,toward,browned,pale,spots,outward,upward } from './food-kit.js';

export const C={
  bun:0xc88a3a,bunPale:0xe8c98f,crumb:0xf2e2bc,toast:0xb06f2c,rye:0x8a5a34,ryeCrumb:0xc9a67a,crust:0x9a5a22,
  beef:0x5b3423,beefIn:0x8f5b48,rare:0xb0544a,pork:0xb88462,ham:0xd88f86,turkey:0xdcc2a2,pastrami:0x9c4640,chicken:0xd9a45c,chickenIn:0xf0e3c8,
  fried:0xc98b35,friedDark:0x9a5a1e,char:0x2e1c14,bone:0xe9dcc0,
  cheese:0xf3b338,cheddar:0xe7972c,mozz:0xf4e6b8,swiss:0xf1dc9a,cream:0xf7f2e7,butter:0xf6d568,
  lettuce:0x7cab3a,leaf:0x5f9233,herb:0x4d8a2c,lettucePale:0xbdd67a,cabbage:0xd9e2b0,scallion:0x6fa644,
  tomato:0xc4352a,tomatoIn:0xe0644c,onion:0xeee4d2,redOnion:0x9a4775,pickle:0x7e9038,pepper:0xc2392b,carrot:0xe27a26,corn:0xf2c63c,
  avocado:0xa9bd5a,guac:0x93ad4a,lime:0x6f9f2e,lemon:0xe9c63a,olive:0x3a2f2a,cucumber:0x8fb86a,mushroom:0xb39a7c,broccoli:0x3f7a2f,eggplant:0x4a2a4a,
  bacon:0x8b3524,fat:0xe9c3a2,egg:0xf8f3e8,yolk:0xf2a51c,
  rice:0xf3ecdc,yellowRice:0xe7b842,brownRice:0xb9925a,friedRice:0xd3a25e,redRice:0xc86a32,bean:0x3a2420,pinto:0x9a6248,chickpea:0xd9b877,
  noodle:0xe9c66e,eggNoodle:0xe6b75a,riceNoodle:0xf1e6c8,soba:0x9a8468,
  marinara:0xa62f1e,ketchup:0xa81f17,mustard:0xe3b021,mayo:0xf5efdc,white:0xf4f0e4,hot:0xb92c18,soy:0x35190f,bbq:0x5e2416,gravy:0x7b4a24,
  curry:0xc7872a,greenCurry:0x9aad5c,tikka:0xc65a2a,teriyaki:0x4a2412,brothLight:0xd9b46e,broth:0xb37d3c,miso:0xc09a62,tonkotsu:0xe3cfa4,
  salmon:0xe9835d,tuna:0xb23a44,shrimp:0xef8f66,nori:0x1d2a22,tofu:0xf1e6c6,wasabi:0x9cbb5a,ginger:0xf0b9a0,
  dough:0xf0e1c2,tortilla:0xe9c873,flour:0xf0dfb8,pita:0xe8d2a2,plantain:0xd89a2e,potato:0xe3bd6a,yuca:0xe9d9a4,
  chocolate:0x4a2c1e,cocoa:0x6a4028,vanilla:0xf4e7c2,strawberry:0xe79aa6,pistachio:0xb7d39a,caramel:0xc47a2a,berry:0x5a2a5c,blueberry:0x3a3f6e,cherry:0xb01f2c,
  graham:0xb98444,custard:0xf3d98a,icing:0xf8f4ec,pink:0xf0a6b6,
};
const many=(k,n,fn)=>{for(let i=0;i<n;i++)fn(i);};
const wobbly=(r,n=12,amp=.1,seed=0,rz=r)=>Array.from({length:n},(_,i)=>{const a=i/n*TAU,s=1+amp*sn(Math.cos(a)*1.7+seed,Math.sin(a)*1.7,seed*.7);return [Math.cos(a)*r*s,Math.sin(a)*rz*s];});

// ---- bread ------------------------------------------------------------------
const DOME=[[0,0],[.86,0],[.97,.08],[1,.22],[.97,.42],[.86,.64],[.66,.84],[.4,.95],[.15,.995],[0,1]];
/** The top half of a soft roll, set on whatever is at the spot. */
export function bunTop(k,x,z,{r=4.7,h=3,color=C.bun,seeds='sesame',kaiser=false,tilt=0,lift=0}={}){
  const g=lathe(DOME.map(([a,b])=>[a*r,b*h]),28,{bump:.035,freq:.35,seed:k.rand(9),wave:kaiser?(a,j)=>1+.022*Math.sin(a*5+j*.5)*smooth(2,6,j):null});
  k.drop(g,x,z,{lift,rot:[tilt,k.rand(TAU),0],color,gloss:.42,inside:C.crumb,paint:[pale(C.bunPale,.85),browned(C.crust,.5,.5),mottle(.07,.7)],whole:false});
  if(seeds){
    const tall=k.top(x,z);
    k.sprinkle('seed',seeds==='sesame'?46:60,{x,z,r:r*.74,color:seeds==='sesame'?[0xf3e3b8,0xe9d39c]:seeds==='poppy'?[0x2a2a30,0x3a3a44]:[0xf3e3b8,0x2a2a30,0xe0c890,0xd9c9a0],size:seeds==='sesame'?.5:.34,onFood:tall-h*.55,gloss:.3});
  }
}
/** The heel of the roll. */
export function bunBottom(k,x,z,{r=4.7,h=1.3,color=C.bun}={}){
  k.drop(puck(circle(r,16),h,{edge:.5,n:28}),x,z,{color,gloss:.25,inside:C.crumb,whole:false,paint:[toward(C.crumb,(P,N)=>smooth(.75,.95,N.y)),mottle(.06,.8)]});
}
/** Half of a long roll: a hero, a hot dog bun, a baguette. `top` domes and browns it. */
export function longRoll(k,x,z,yaw,{length=16,width=5.6,h=1.6,top=false,color=C.bun,dome=1.3,seeds=null,lift=0,tilt=null}={}){
  const g=puck(roundedPath(length,width,width*.48),h,{edge:.55,dome:top?dome:.05,bump:top?.12:.03,freq:.3,seed:k.rand(9),n:36});
  k.at(x,z,yaw,()=>{
    k.drop(g,0,0,{lift,color,gloss:top?.4:.2,inside:C.crumb,whole:false,paint:top?[pale(C.bunPale,.8),browned(C.crust,.55,.4),mottle(.07,.6)]:[toward(C.crumb,(P,N)=>smooth(.75,.95,N.y)),mottle(.05,.8)]});
    if(top && seeds)k.sprinkle('seed',50,{r:width*.42,color:[0xf3e3b8,0xe9d39c],size:.5,onFood:k.top(0,0)-.8,stretch:1,bias:.9});
  },{tilt});
}
function roundedPath(w,d,r){
  const out=[],n=7;
  for(const [cx,cz,a0] of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI],[w/2-r,-d/2+r,Math.PI*1.5]])
    for(let i=0;i<=n;i++){const a=a0+i/n*Math.PI/2;out.push([cx+Math.cos(a)*r,cz+Math.sin(a)*r]);}
  return out;
}
export { roundedPath,bitOf,wobbly as wobble };
const LOAF=[[-4.6,-4.3],[4.6,-4.3],[4.75,1.6],[5.3,2.5],[5.1,3.9],[3.4,4.75],[0,5.05],[-3.4,4.75],[-5.1,3.9],[-5.3,2.5],[-4.75,1.6]];
/** A slice of bread, toasted or not. */
export function slice(k,x,z,yaw,{s=1,h=1.1,color=C.crumb,crust=C.toast,toasted=0,lift=0,tilt=null,shape=LOAF}={}){
  const g=puck(shape.map(([a,b])=>[a*s,b*s]),h,{edge:.18,n:40,bump:.03,freq:.9,seed:k.rand(9)});
  k.at(x,z,yaw,()=>k.drop(g,0,0,{lift,color,gloss:.15,inside:C.crumb,whole:false,
    paint:[toasted?toward(C.toast,(P,N,L)=>toasted*(.68+.3*fbm(L.x*.5,1,L.z*.5))*smooth(.3,.9,Math.abs(N.y))):null,toward(crust,(P,N)=>smooth(.75,.35,Math.abs(N.y))),mottle(.06,1.4)].filter(Boolean)}),{tilt});
}
/** A triangle of flatbread: pita, naan, a quesadilla wedge. */
export function flatbread(k,x,z,yaw,{outline=[[-4,-3],[4.6,-2.2],[-.4,4.6]],h=.5,color=C.pita,blister=0x9a6a34,cover=.22,drape=true,lift=.03,dome=.12}={}){
  k.at(x,z,yaw,()=>k.add(puck(outline,h,{edge:.2,dome,bump:.14,freq:.7,seed:k.rand(9),n:30}),{at:[0,lift,0],drape,color,gloss:.2,inside:C.crumb,whole:false,paint:[spots(blister,cover,1.1,k.rand(9)),mottle(.07,.9)]}));
}

// ---- meat, cheese, salad ------------------------------------------------------
/** A burger patty. */
export function patty(k,x,z,{r=4.6,h=1.15,color=C.beef}={}){
  k.drop(puck(wobbly(r,14,.05,k.rand(9)),h,{edge:.42,dome:.1,bump:.09,freq:1.1,seed:k.rand(9),n:30}),x,z,{color,gloss:.38,inside:C.beefIn,whole:false,paint:[mottle(.16,1.6),spots(0x3a2218,.14,1.9,k.rand(9))]});
}
/** A slice of cheese melting over whatever it lies on. */
export function cheeseSlice(k,x,z,yaw,{w=8.6,color=C.cheese,sag=1.25,gloss=.5}={}){
  const g=sheet((u,v)=>{const a=(u-.5)*w,b=(v-.5)*w,round=Math.max(0,Math.max(Math.abs(a),Math.abs(b))-w*.44);return [a,.12-round*.2,b];},16,16);
  k.at(x,z,yaw,()=>k.add(g,{at:[0,0,0],drape:sag,wide:.55,color,gloss,paint:mottle(.04,.6),whole:false}),{y:-k.top(x,z)});
}
/** A ruffled leaf of lettuce. */
export function lettuce(k,x,z,{r=5.4,color=C.lettuce,ruffle=.5,lift=.05}={}){
  const seed=k.rand(9),g=sheet((u,v)=>{
    const a=u*TAU,d=v*r*(1+.1*Math.sin(a*5+seed*4)),wave=ruffle*v*v*(1.2+Math.sin(a*9+seed)+.6*Math.sin(a*14.3+seed*2));
    return [Math.cos(a)*d,wave*.5+.12-v*v*v*.9,Math.sin(a)*d];
  },40,6);
  k.add(g,{at:[x,lift,z],drape:.5,wide:.4,color,gloss:.32,whole:false,paint:[toward(C.lettucePale,(P,N,L)=>smooth(r*.75,0,Math.hypot(L.x,L.z))*.8),mottle(.1,1.2)]});
}
/** Slices of tomato fanned over a spot. */
export function tomatoSlices(k,x,z,n=2,{r=3.1,spread=1.6,yaw=0}={}){
  many(k,n,i=>{
    const a=yaw+i*2.1,px=x+Math.cos(a)*spread*(n>1?1:0),pz=z+Math.sin(a)*spread*(n>1?1:0);
    k.drop(puck(circle(r,12),.55,{edge:.22,n:20}),px,pz,{rot:[k.rand(-.06,.06),0,k.rand(-.06,.06)],color:C.tomato,gloss:.62,whole:false,inside:C.tomatoIn,paint:[toward(C.tomatoIn,(P,N,L)=>N.y>.5?.55*smooth(r*.8,r*.3,Math.hypot(L.x,L.z))*(.6+.4*sn(L.x*2,0,L.z*2)):0)]});
  });
}
/** Rings of raw onion. */
export function onionRings(k,x,z,n=3,{color=C.redOnion,r=2.6}={}){
  many(k,n,i=>{
    const rr=r*(1-.2*i/n)*k.rand(.85,1.05),[px,pz]=k.spot(x,z,1.3);
    k.drop(lathe([[rr,0],[rr+.17,.12],[rr+.17,.42],[rr,.55],[rr-.17,.42],[rr-.17,.12],[rr,0]],20),px,pz,{rot:[k.rand(-.1,.1),0,k.rand(-.1,.1)],color,gloss:.5,paint:toward(0xf3e9ee,(P,N)=>smooth(.2,-.7,N.y)*.8),whole:true});
  });
}
/** Pickle chips. */
export function pickles(k,x,z,n=3,{spread=1.7}={}){
  many(k,n,()=>{const [px,pz]=k.spot(x,z,spread);k.drop(puck(circle(1.35,10),.3,{edge:.1,n:14}),px,pz,{color:C.pickle,gloss:.55,paint:[outward(0x56661f,1,1.35,.8),toward(0xa9b860,(P,N,L)=>N.y>.5?.5*smooth(1,.2,Math.hypot(L.x,L.z)):0)],whole:true});});
}
/** A wavy rasher of bacon. */
export function bacon(k,x,z,yaw,{length=11,width=2.4,lift=.1}={}){
  const seed=k.rand(9),g=sheet((u,v)=>[(u-.5)*length,.28*Math.sin(u*13+seed)+.12*Math.sin(u*29+v*3),(v-.5)*width*(1+.08*Math.sin(u*17+seed))],22,4);
  k.at(x,z,yaw,()=>k.add(g,{at:[0,lift+.3,0],drape:1.1,wide:.4,color:C.bacon,gloss:.5,whole:false,paint:[toward(C.fat,(P,N,L)=>smooth(.25,.45,Math.abs(Math.sin(L.z*2.6+.9)))*.75),mottle(.12,2)]}));
}
/** A fried egg, sunny side up. */
export function friedEgg(k,x,z,{r=4.2}={}){
  const seed=k.rand(9);
  k.add(puck(wobbly(r,14,.16,seed),.32,{edge:.14,dome:.1,bump:.08,freq:.8,seed,n:32}),{at:[x,.02,z],drape:1.2,color:C.egg,gloss:.55,whole:false,paint:[outward(0xd9a55e,r*.78,r*1.1,.75),mottle(.03,.8)]});
  k.drop(blob({r:[1.5,.85,1.5],bump:.02,flat:.3}),x+k.rand(-.5,.5),z+k.rand(-.5,.5),{lift:-.12,color:C.yolk,gloss:.85,whole:false});
}
/** A folded pile of sliced deli meat. */
export function slicedMeat(k,x,z,yaw,{length=13,width=5,layers=6,color=C.pastrami,edge=0x3a231c,h=.34}={}){
  k.at(x,z,yaw,()=>many(k,layers,i=>{
    const seed=k.rand(9),g=sheet((u,v)=>[(u-.5)*length*(1-.03*i),h*.4*(1+Math.sin(u*9+seed))+h*.25*Math.sin(v*7+seed*2+u*4),(v-.5)*width*(1+.1*Math.sin(u*6+seed))],18,5);
    k.add(g,{at:[k.rand(-.5,.5),h*.3,k.rand(-.35,.35)],drape:1.6,wide:.4,color,gloss:.42,whole:false,paint:[toward(edge,(P,N,L)=>smooth(width*.38,width*.5,Math.abs(L.z))*.8),mottle(.12,1.3)]});
  }));
}
/** A breaded cutlet. */
export function cutlet(k,x,z,yaw,{w=12,d=8,h=1.5,color=C.fried}={}){
  k.at(x,z,yaw,()=>k.drop(puck(wobbly(w/2,14,.12,k.rand(9),d/2),h,{edge:.5,dome:.25,bump:.22,freq:1.3,seed:k.rand(9),n:32}),0,0,{color,gloss:.24,inside:C.chickenIn,whole:false,paint:[mottle(.16,2.2),spots(C.friedDark,.3,1.7,k.rand(9)),pale(0xe2b56a,.3)]}));
}
/** A rough chunk of something cooked, resting where it falls. */
export function chunk(k,x,z,{r=1.5,color=C.chicken,dark=C.friedDark,cover=.3,gloss=.4,bump=.2,inside=null,squash=.75,detail=2,lift=-.1,within=null}={}){
  const s=typeof r==='number'?[r*k.rand(.85,1.15),r*squash,r*k.rand(.85,1.15)]:r;
  return k.drop(blob({r:s,bump,freq:1.1/Math.max(.6,s[0]*.6),seed:k.rand(40),detail,flat:.12}),x,z,{lift,roll:within?4:0,within,rot:[0,k.rand(TAU),0],color,gloss,inside,paint:[mottle(.14,1.6),spots(dark,cover,1.5,k.rand(9))]});
}
/** A heap of `n` chunks about a spot. */
export function chunks(k,x,z,n,o={}){const spread=o.spread??3;many(k,n,()=>{const [px,pz]=k.spot(x,z,spread,o.bias??1);chunk(k,px,pz,{within:[x,z,spread*1.15],...o});});}
/** A craggy piece of fried chicken; `bone` gives it a drumstick's handle. */
export function friedPiece(k,x,z,yaw,{r=3,color=C.fried,bone=false,gloss=.26,dark=C.friedDark,long=1.25}={}){
  k.at(x,z,yaw,()=>{
    k.drop(blob({r:[r*long,r*.72,r*.9],bump:.2,freq:1.25,seed:k.rand(40),detail:3,flat:.1}),0,0,{lift:-.1,color,gloss,inside:C.chickenIn,whole:false,paint:[mottle(.2,2.4),spots(dark,.34,2,k.rand(9)),toward(0xe0b060,(P,N)=>smooth(.2,-.6,N.y)*.3)]});
    if(bone){
      const y=k.top(0,0)*.42;
      k.add(tube([[r*long*.8,y,0],[r*long+2.2,y+.1,0]],r*.3,{sides:8,taper:t=>1-.45*t,curve:false}),{color,gloss,paint:mottle(.2,2.4),whole:false});
      k.add(blob({r:[.75,.6,.7],bump:.15,detail:1}),{at:[r*long+2.5,y+.1,0],color:C.bone,gloss:.4});
    }
  });
}
/** French fries, tumbled. */
export function fries(k,x,z,n=22,{r=4,color=C.potato,thick=.42,length=6.5,bias=1,along=null,stray=.5}={}){
  many(k,n,()=>{
    const len=length*k.rand(.55,1.1),bend=k.rand(-.5,.5),[px,pz]=k.spot(x,z,r,bias);
    const g=tube([[-len/2,0,0],[0,k.rand(0,.25),bend],[len/2,0,0]],thick,{sides:4,spin:Math.PI/4,facet:true,steps:6});
    k.drop(g,px,pz,{lift:-.08,rot:[k.rand(-.16,.16),along===null?k.rand(TAU):along+k.rand(-stray,stray),k.rand(-.3,.3)],color,gloss:.3,inside:0xf3e3a8,whole:true,flat:true,paint:[toward(0xb97a2a,(P,N,L)=>smooth(len*.3,len*.5,Math.abs(L.x))*.7),mottle(.08,1.5)]});
  });
}
/** A sausage or a frankfurter. */
export function sausage(k,x,z,yaw,{length=13,r=1.15,color=0x9a3f28,bend=.8,lift=0}={}){
  k.at(x,z,yaw,()=>k.drop(tube([[-length/2,0,0],[-length/4,0,bend*.7],[0,0,bend],[length/4,0,bend*.7],[length/2,0,0]],r,{sides:10,taper:t=>.55+.45*Math.min(1,Math.sin(t*Math.PI)*4)}),0,0,{lift,color,gloss:.6,inside:0xd98a70,whole:false,paint:[mottle(.1,1.2),toward(0x5a2416,(P,N)=>smooth(.5,1,N.y)*.3)]}));
}

// ---- starch -------------------------------------------------------------------
const riceGrain=blob({r:[.4,.128,.138],bump:.045,detail:0});
const GOLDEN_ANGLE=Math.PI*(3-Math.sqrt(5));

/** Grain-sized pieces follow the slope and sit partly buried in the rice below. */
export function riceGrains(k,x,z,{r,rz=r,color=C.rice,grains=null,density=4.3,short=false,minY=0,inner=0,gloss=short?.39:.29}){
  const base=new T.Color(color);
  const shades=grains?.map(tone=>new T.Color(tone))||
    [base.clone().multiplyScalar(.82),base,base,base.clone().lerp(new T.Color(0xffffff),.2)];
  const count=Math.round(Math.PI*r*rz*(1-inner*inner)*density),spin=k.rand(TAU);
  for(let i=0;i<count;i++){
    const u=(i+k.rand(.06,.94))/count,d=Math.sqrt(inner*inner+(1-inner*inner)*u),a=spin+i*GOLDEN_ANGLE+k.rand(-.14,.14);
    const px=x+Math.cos(a)*d*r,pz=z+Math.sin(a)*d*rz;
    const y=k.top(px,pz);
    if(y<minY)continue;
    const grainSize=k.rand(.77,1.14),yaw=k.rand(TAU),dx=Math.cos(yaw)*.29,dz=-Math.sin(yaw)*.29;
    const lean=clamp((k.top(px+dx,pz+dz)-k.top(px-dx,pz-dz))*.8,-.54,.54);
    k.add(riceGrain,{at:[px,y+k.rand(-.025,.065),pz],rot:[k.rand(-.4,.4),yaw,lean+k.rand(-.22,.22)],
      scale:[grainSize*(short?.71:1),grainSize,grainSize*(short?1.12:1)],color:k.pick(shades),gloss,cast:false,whole:true});
  }
}

/** An uneven spooned mound with loose grains and an optional mix of vegetables or beans. */
export function riceMound(k,x,z,{r=5,rz=r,h=2.2,color=C.rice,grains=null,flecks=null,short=false,outline=null,y=null}={}){
  const seed=k.rand(9),shape=outline||wobbly(r,20,.15,seed,rz);
  const base=new T.Color(color).multiplyScalar(short?.83:.72);
  const heap=puck(shape,.28,{edge:.13,dome:h,bump:.38,freq:.72,seed,n:36});
  if(y===null)k.drop(heap,x,z,{lift:-.055,color:base,gloss:.24,inside:color,whole:false,paint:mottle(.12,2.3)});
  else k.add(heap,{at:[x,y,z],color:base,gloss:.24,inside:color,whole:false,paint:mottle(.12,2.3)});
  const top=k.top(x,z),floor=top-h-.16;
  riceGrains(k,x,z,{r:r*1.02,rz:rz*1.02,color,grains,short,minY:floor-.12});
  if(flecks){
    const {kind='cube',n=24,color:colors,size=.42}=flecks;
    for(let i=0;i<n;i++){
      const [px,pz]=k.spot(x,z,.91),fx=x+(px-x)*r,fz=z+(pz-z)*rz,y=k.top(fx,fz);
      if(y<floor)continue;
      const scale=size*k.rand(.7,1.25);
      k.add(bitOf(kind),{at:[fx,y+scale*.28,fz],rot:[k.rand(-.4,.4),k.rand(TAU),k.rand(-.4,.4)],
        scale:kind==='pea'?[scale*.8,scale*.53,scale*.54]:[scale,scale*.64,scale],color:k.pick(colors),gloss:.41,whole:true,cast:false});
    }
  }
}
/** A tangle of noodles coiled over a spot. */
export function noodles(k,x,z,{r=5,h=1.6,color=C.noodle,n=18,thick=.26,sides=4,gloss=.45,flat=1}={}){
  const seed=k.rand(9),shade=new T.Color(color).multiplyScalar(.74).getHex();
  k.drop(puck(wobbly(r*.92,14,.08,seed),.4,{edge:.3,dome:h,bump:.2,freq:.8,seed,n:26}),x,z,{lift:-.05,color:shade,gloss:.3,inside:color,whole:false});
  many(k,n,i=>{
    const cx=x+k.rand(-.3,.3)*r,cz=z+k.rand(-.3,.3)*r,rr=r*k.rand(.3,.72),a0=k.rand(TAU),sweep=k.rand(2.6,5.4),ecc=k.rand(.6,1),turn=k.rand(TAU),pts=[];
    const steps=Math.round(8+sweep*2.4);
    for(let j=0;j<=steps;j++){
      const a=a0+sweep*j/steps,lx=Math.cos(a)*rr*(1+.14*Math.sin(a*2.7+i)),lz=Math.sin(a)*rr*ecc,px=cx+lx*Math.cos(turn)-lz*Math.sin(turn),pz=cz+lx*Math.sin(turn)+lz*Math.cos(turn);
      const dx=px-x,dz=pz-z,d=Math.hypot(dx,dz),lim=r*1.02,qx=d>lim?x+dx/d*lim:px,qz=d>lim?z+dz/d*lim:pz;
      pts.push([qx,k.top(qx,qz)+thick*.9,qz]);
    }
    k.add(tube(pts,thick,{sides,ry:thick*flat,curve:false,caps:false}),{color,gloss,whole:false,paint:mottle(.08,1.5)});
  });
}
/** Home fries, diced potato, cubes of anything. */
export function dice(k,x,z,n,{r=3,size=1.2,color=C.potato,dark=0xa9692a,gloss=.3,bias=1}={}){
  many(k,n,()=>{const [px,pz]=k.spot(x,z,r,bias),s=size*k.rand(.75,1.15);
    k.drop(brick(s,s*.8,s*k.rand(.8,1.2),.14,{n:12}),px,pz,{lift:-.06,roll:3,within:[x,z,r*1.15],rot:[k.rand(-.3,.3),k.rand(TAU),k.rand(-.3,.3)],color,gloss,paint:[spots(dark,.34,1.4,k.rand(9)),mottle(.1,2)],whole:true});});
}

// ---- vegetables and garnish -----------------------------------------------------
/** A floret of broccoli. */
export function broccoli(k,x,z,{s=1}={}){
  k.at(x,z,k.rand(TAU),()=>{
    k.add(tube([[0,.3,0],[.2,1.2*s,0]],.5*s,{sides:6,curve:false}),{color:0x8fae5a,gloss:.3});
    many(k,6,i=>{const a=i*1.05,d=i?1.0*s:0;k.add(blob({r:[.95*s,.8*s,.95*s],bump:.3,freq:2.2,seed:k.rand(30),detail:1}),{at:[.2+Math.cos(a)*d,1.5*s+(i?0:.4*s),Math.sin(a)*d],color:C.broccoli,gloss:.25,paint:[mottle(.2,3),toward(0x76a84a,(P,N)=>smooth(.3,1,N.y)*.35)]});});
  },{tilt:[k.rand(-.5,.5),k.rand(-.5,.5)]});
}
/** Shredded lettuce or cabbage, in a loose heap. */
export function shreds(k,x,z,n=40,{r=3,color=[C.lettuce,C.lettucePale,0x9cc456],size=1.5,gloss=.3}={}){
  k.sprinkle('fleck',n,{x,z,r,color,size:size*.36,stretch:3.6,gloss,lift:.1,tilt:.3});
}
/** Chopped herbs or sliced scallion over the food. */
export function herbs(k,x,z,n=24,{r=4,color=[C.herb,C.leaf,0x74a83c],size=.5,onFood=0}={}){k.sprinkle('leaf',n,{x,z,r,color,size,onFood,gloss:.3});}
export function scallions(k,x,z,n=14,{r=4,onFood=0,size=.62}={}){k.sprinkle('ring',n,{x,z,r,color:[C.scallion,0x8fc05a,0xd9e6b0],size,onFood,gloss:.4,flat:true});}
export function sesame(k,x,z,n=30,{r=4,onFood=0,color=[0xf3e3b8,0xe9d39c]}={}){k.sprinkle('seed',n,{x,z,r,color,size:.45,onFood,gloss:.3});}
/** A spoonful of something soft: sour cream, guacamole, mash, whipped cream. */
export function dollop(k,x,z,{r=2,h=1.3,color=C.cream,gloss=.5,bump=.14,freq=1.1,paint=null,lift=-.15}={}){
  return k.drop(blob({r:[r,h,r*.94],bump,freq,seed:k.rand(40),detail:2,flat:.18}),x,z,{lift,color,gloss,whole:false,paint:[mottle(.05,1.4),paint].filter(Boolean)});
}
/** Sauce pooled flat on the plate. */
export function puddle(k,x,z,r,color,{gloss=.8,h=.16,rz=r,paint=null,amp=.16}={}){
  k.add(puck(wobbly(r,16,amp,k.rand(9),rz),h,{edge:.07,n:30}),{at:[x,.01,z],drape:true,color,gloss,whole:false,paint:[mottle(.1,1.1),paint].filter(Boolean)});
}
/** Sauce spooned over whatever is there, running down it. */
export function coat(k,x,z,r,color,{gloss=.75,rz=r,thick=.16,amp=.2,paint=null}={}){
  k.add(puck(wobbly(r,18,amp,k.rand(9),rz),thick,{edge:.07,n:34}),{at:[x,.02,z],drape:true,color,gloss,whole:false,paint:[mottle(.12,1.3),paint].filter(Boolean)});
}
/** Zigzag a squeeze bottle across a patch. */
export function zigzag(k,x,z,yaw,{length=8,width=3,turns=5,r=.2,color=C.white,gloss=.7}={}){
  const pts=[],cs=Math.cos(yaw),ss=Math.sin(yaw);
  for(let i=0;i<=turns*2;i++){const a=(i/(turns*2)-.5)*length,b=(i%2?1:-1)*width/2;pts.push([x+a*cs+b*ss,z-a*ss+b*cs]);}
  k.drizzle(pts,r,color,{gloss});
}
/** Beans or peas or anything spooned out in a wet heap. */
export function beans(k,x,z,{r=3.4,color=C.bean,sauce=0x5a342a,n=46,h=.9,size=.75,kind='pea'}={}){
  const seed=k.rand(9);
  k.drop(puck(wobbly(r,14,.1,seed),.3,{edge:.25,dome:h,bump:.18,freq:1,seed,n:26}),x,z,{lift:-.05,color:sauce,gloss:.6,whole:false,paint:mottle(.12,1.5)});
  k.sprinkle(kind,n,{x,z,r:r*.9,color:[color,new T.Color(color).multiplyScalar(.82).getHex()],size,stretch:1.35,onFood:k.top(x,z)-h-.2,gloss:.55,lift:-.1});
}
/** Slices of something round laid in a fanned row. */
export function fan(k,x,z,yaw,n,make,{step=1.5,lean=.5}={}){
  k.at(x,z,yaw,()=>many(k,n,i=>k.at((i-(n-1)/2)*step,0,0,()=>make(i),{tilt:[0,lean]})));
}
/** A thick round cut: plantain, cucumber, sausage coin, banana. */
export function coin(k,x,z,{r=1.6,h=.6,color=C.plantain,dark=0x8a4a16,cover=.3,gloss=.45,tilt=.2,rz=r,inside=null}={}){
  k.drop(puck(circle(r,10,rz),h,{edge:.2,dome:.06,n:16}),x,z,{lift:-.04,rot:[k.rand(-tilt,tilt),k.rand(TAU),k.rand(-tilt,tilt)],color,gloss,inside,paint:[spots(dark,cover,1.6,k.rand(20)),mottle(.08,1.5)],whole:true});
}
/** A skewer threaded with pieces. */
export function skewer(k,x,z,yaw,n,piece,{length=17,lift=1.1}={}){
  k.at(x,z,yaw,()=>{
    const y=k.top(0,0)+lift;
    k.ware(tube([[-length/2,y,0],[length/2,y,0]],.16,{sides:5,curve:false,taper:t=>t>.95?.3:1}),{color:0xcaa46a,gloss:.2,cast:false});
    many(k,n,i=>piece(i,(i-(n-1)/2)*(length*.68/n),y));
  },{y:-k.top(x,z)});
}
/** A curled shrimp. */
export function shrimp(k,x,z,yaw,{s=1,color=C.shrimp,fried=false}={}){
  const pts=Array.from({length:7},(_,i)=>{const a=-.4+i*.62;return [Math.cos(a)*1.9*s,.75*s,Math.sin(a)*1.9*s];});
  k.at(x,z,yaw,()=>{
    k.add(tube(pts,.82*s,{sides:8,taper:t=>1-.72*t*t,steps:14}),{color:fried?C.fried:color,gloss:fried?.25:.55,whole:true,paint:fried?[mottle(.2,2.4),spots(C.friedDark,.3,2)]:[toward(0xf7d9c4,(P,N,L)=>.75*smooth(.2,.9,Math.abs(Math.sin(Math.atan2(L.z,L.x)*5)))),toward(0xfff0e0,(P,N)=>smooth(0,-.8,N.y)*.5)]});
    const end=pts[6];k.add(sheet((u,v)=>[end[0]-.2*s+(u-.5)*1.5*s*v,end[1]+.1,end[2]+v*1.2*s],3,2),{color:0xd95f3c,gloss:.5,whole:true});
  });
}
/** A scoop of ice cream. */
export function scoop(k,x,z,{r=3,color=C.vanilla,dark=null,gloss=.45,lift=-.4}={}){
  k.at(x,z,k.rand(TAU),()=>{
    const base=k.top(0,0);
    k.add(lathe([[r*.8,0],[r*1.05,.22],[r*1.1,.6],[r*.96,.95],[r*.7,1.05]],24,{bump:.1,freq:.8,seed:k.rand(9)}),{at:[0,base+lift+.25,0],color,gloss,whole:false,paint:[mottle(.06,1.3),dark?spots(dark,.2,1.3,k.rand(9)):null].filter(Boolean)});
    k.add(blob({r:[r,r*.9,r],bump:.07,freq:.9,seed:k.rand(40),detail:3}),{at:[0,base+lift+r*.92,0],color,gloss,whole:false,paint:[mottle(.07,1.6),dark?spots(dark,.2,1.3,k.rand(9)):null].filter(Boolean)});
  },{y:-k.top(x,z)});
}
/** A swirl piped upward: soft serve, whipped cream, frosting. */
export function swirl(k,x,z,{r=2.6,h=4,turns=3.2,thick=1,color=C.cream,gloss=.42,lift=0}={}){
  const pts=[],n=Math.round(turns*14),base=k.top(x,z)+lift;
  for(let i=0;i<=n;i++){const t=i/n,a=t*turns*TAU,rr=r*(1-t*.94)+.04;pts.push([x+Math.cos(a)*rr,base+thick*.7+t*h,z+Math.sin(a)*rr]);}
  k.add(tube(pts,thick,{sides:8,curve:false,taper:t=>1-.62*t,section:a=>1+.16*Math.cos(a*TAU*4)}),{color,gloss,whole:false,paint:mottle(.04,1)});
}
/** A potsticker: a pleated half-moon, browned where it met the pan. */
export function dumpling(k,x,z,yaw,{s=1,color=C.dough,seared=true,tilt=null}={}){
  k.at(x,z,yaw,()=>{
    k.drop(blob({r:[2.5*s,1.25*s,1.35*s],bump:.06,freq:.8,seed:k.rand(30),detail:2,flat:.14}),0,0,{lift:-.08,color,gloss:.5,inside:0xb98a6a,whole:false,paint:seared?[toward(0xb8742c,(P,N,L)=>smooth(-.2,-.75,L.y/s)*.9),mottle(.05,1.3)]:mottle(.05,1.3)});
    const y=k.top(0,0);
    k.add(tube(Array.from({length:9},(_,i)=>{const t=i/8-.5;return [t*4.7*s,y-.25*s-2.2*s*t*t,-.25*s];}),.36*s,{sides:6,ry:.5*s,taper:t=>(.5+.5*Math.sin(t*Math.PI))*(1+.3*Math.sin(t*38)),steps:28}),{color,gloss:.5,whole:false});
  },{tilt});
}
/** A steamed bun, gathered at the top. */
export function bao(k,x,z,{r=2.6,color=0xf6f1e4}={}){
  k.drop(lathe(DOME.map(([a,b])=>[a*r,b*r*.82]),24,{wave:(a,j)=>1+.03*Math.sin(a*9+j*.9)*smooth(3,8,j)}),x,z,{color,gloss:.3,inside:0xa87a5a,whole:false,paint:mottle(.03,.8)});
}
/** A pat of butter, starting to go. */
export function butterPat(k,x,z){
  puddle(k,x,z,1.5,0xf3d77a,{h:.08,gloss:.85});
  k.drop(brick(1.7,.6,1.7,.14,{n:12}),x,z,{rot:[0,k.rand(TAU),0],color:C.butter,gloss:.6,whole:true});
}
/** Grill marks seared across what is there. */
export function grillMarks(k,x,z,yaw,{n=4,length=5,gap=1.3,color=C.char,cross=false}={}){
  for(const turn of cross?[0,1.2]:[0]){
    const cs=Math.cos(yaw+turn),ss=Math.sin(yaw+turn);
    for(let i=0;i<n;i++){const o=(i-(n-1)/2)*gap;k.drizzle([[-length/2,o],[0,o],[length/2,o]].map(([a,b])=>[x+a*cs+b*ss,z-a*ss+b*cs]),.2,color,{gloss:.3,ry:.05});}
  }
}
/** A pickle spear beside the sandwich. */
export function spear(k,x,z,yaw,{length=8.5}={}){
  k.at(x,z,yaw,()=>k.drop(tube([[-length/2,0,0],[0,0,.5],[length/2,0,0]],1.05,{sides:8,ry:.75,taper:t=>.6+.4*Math.sin(t*Math.PI)}),0,0,{color:C.pickle,gloss:.55,inside:0xb9c46a,whole:false,paint:[toward(0xb9c46a,(P,N)=>smooth(.5,1,N.y)*.6),spots(0x56661f,.25,1.6,k.rand(9)),mottle(.08,2)]}));
}
