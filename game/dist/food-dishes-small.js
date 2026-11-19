// Small plates: fried things, sides, salads, sushi and breakfast.
import * as T from './vendor/three.module.min.js';
import { blob,lathe,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,mottle,toward,browned,pale,spots,outward } from './food-kit.js';
import * as W from './food-ware.js';
import * as F from './food-parts.js';
const C=F.C;

const boat=(k,w=17,d=11,h=3.2)=>W.tray(k,w,d,h,{color:W.PAPER,gloss:.15,flare:.22,corner:1.5});
const basket=(k,check=0xc9382c)=>{W.tray(k,23,15.5,3,{color:W.RED,gloss:.5,flare:.2,corner:3});W.deliPaper(k,22,17,{check,yaw:.3});};
const count=(k,full,part)=>k.level===2?full:k.level===1?part:0;
const sauceCup=(k,x,z,color,o={})=>W.ramekin(k,x,z,color,{full:k.level===2?1:.4,...o});
function leafy(k,x,z,n,r,colors=[C.lettuce,C.leaf,C.lettucePale],size=2.6){
  for(let i=0;i<n;i++){
    const [px,pz]=k.spot(x,z,r),seed=k.rand(9),s=size*k.rand(.7,1.15);
    k.drop(sheet((u,v)=>[(u-.5)*s,.35*s*Math.sin(u*3+seed)*Math.sin(v*2.6+seed)+.1,(v-.5)*s*.8*(1+.2*Math.sin(u*6+seed))],5,4),px,pz,{lift:.05,rot:[k.rand(-.25,.25),k.rand(TAU),k.rand(-.25,.25)],color:k.pick(colors),gloss:.32,paint:mottle(.14,1.6),whole:true,settle:.15,roll:2,within:[x,z,r*1.15]});
  }
}
/** A pastry folded over its filling and crimped shut. */
function halfMoon(k,x,z,yaw,{w=11,d=6.4,h=1,dome=1.5,color=0xd9a84a,dark=0x9a5a22,crimp=true,gloss=.32,inside=0x8a5a34,bump=.14}={}){
  const half=Array.from({length:13},(_,i)=>{const a=Math.PI*i/12;return [Math.cos(a)*w/2,Math.sin(a)*d-d*.45];});
  k.at(x,z,yaw,()=>{
    k.drop(puck(half,h,{edge:.45,dome,bump,freq:.7,seed:k.rand(9),n:34}),0,0,{color,gloss,inside,whole:false,paint:[browned(dark,.6,.9),spots(dark,.12,1.8,k.rand(9)),mottle(.08,1.2)]});
    if(crimp){const rim=Array.from({length:13},(_,i)=>{const a=Math.PI*i/12;return [Math.cos(a)*(w/2-.3),h*.55,Math.sin(a)*(d-.3)-d*.45];});
      k.add(tube(rim,.42,{sides:6,ry:.34,taper:t=>1+.3*Math.sin(t*60),steps:36}),{at:[0,k.top(0,-d*.3)-h-dome,0],color,gloss,whole:false,paint:[browned(dark,.5,1),mottle(.1,1.6)]});}
  });
}
/** A fried roll with blistered skin. */
function friedRoll(k,x,z,yaw,{length=9,r=1.5,color=0xd09a40,dark=0x9a5e1e,lift=0,tilt=null}={}){
  k.at(x,z,yaw,()=>k.drop(tube([[-length/2,0,0],[0,0,0],[length/2,0,0]],r,{sides:12,ry:r*.86,taper:t=>.8+.2*Math.min(1,Math.sin(t*Math.PI)*4),steps:16,section:(a,t)=>1+.035*Math.sin(a*TAU*9+t*30)}),0,0,{lift,color,gloss:.3,inside:0xc9c08a,whole:false,paint:[mottle(.14,2.6),spots(dark,.28,2.2,k.rand(9)),spots(0xe9c57a,.2,3.4,k.rand(9))]}),{tilt});
}
function steamer(k,r=9,h=4.6){
  k.ware(lathe([[0,0],[r+.7,0],[r+.7,h*.46],[r+.82,h*.5],[r+.7,h*.54],[r+.7,h],[r+.2,h],[r+.2,.7],[r*.6,.6],[r*.3,.6],[0,.6]],40),{color:0xd2a65a,gloss:.25,paint:[toward(0xb07e34,(P,N,L)=>N.y>.5&&L.y<1?.6*smooth(.2,.7,Math.abs(Math.sin(L.x*2.2))):0),mottle(.08,1.4)]});
}
function maki(k,x,z,{r=1.9,h=2.6,fill=[C.salmon],outside=C.nori}={}){
  const cols=fill.map(c=>new T.Color(c));
  k.drop(lathe([[0,0],[r,0],[r,h],[r*.93,h+.03],[r*.7,h+.1],[r*.42,h+.08],[r*.2,h+.08],[0,h+.08]],16),x,z,{rot:[0,k.rand(TAU),0],color:C.rice,gloss:.3,whole:true,settle:1,
    paint:[(c,P,N,L)=>{const d=Math.hypot(L.x,L.z);if(N.y<.5)c.set(outside);else if(d<r*.45)c.copy(cols[Math.floor((Math.atan2(L.z,L.x)/TAU+1)*cols.length)%cols.length]);},mottle(.06,3)]});
}
function nigiri(k,x,z,yaw,{fish=C.salmon,stripe=0xf6c9ae,kind='fish'}={}){
  k.at(x,z,yaw,()=>{
    k.drop(blob({r:[2.6,1.1,1.4],bump:.05,freq:1.3,seed:k.rand(9),detail:2,flat:.2}),0,0,{color:C.rice,gloss:.25,paint:mottle(.06,3),whole:true});
    if(kind==='egg'){k.drop(brick(5.2,.9,2.6,.2,{n:20}),0,0,{color:0xf3c84a,gloss:.4,paint:mottle(.06,1.5),whole:true});k.add(tube(Array.from({length:9},(_,i)=>{const a=i/8*TAU;return [0,1.2+Math.sin(a)*1.25,Math.cos(a)*1.6];}),.45,{sides:4,ry:.06,curve:false,caps:false}),{at:[0,-.1,0],color:C.nori,gloss:.3,cast:false});return;}
    const seed=k.rand(9);
    k.add(sheet((u,v)=>[(u-.5)*6.4,.12,(v-.5)*2.9*(1-.3*Math.abs(u-.5))],12,4),{at:[0,.03,0],drape:1.1,wide:.3,color:fish,gloss:.65,whole:true,paint:kind==='shrimp'?[toward(0xf7e2d2,(P,N,L)=>.8*smooth(.3,.8,Math.abs(Math.sin(L.x*2.6)))),toward(0xfaf0e6,(P,N,L)=>smooth(.5,.1,Math.abs(L.z))*.4)]:[toward(stripe,(P,N,L)=>.65*smooth(.7,.95,Math.abs(Math.sin(L.x*2.8+L.z*1.2+seed)))),mottle(.05,2)]});
  });
}
function chip(k,x,z,{s=1,color=0xe6b84a,settle=.7,within=null}={}){
  const seed=k.rand(9);
  k.drop(sheet((u,v)=>{const a=(u-.5)*5.2*s*(1-v),b=(v-.4)*5*s;return [a,.5*s*(a*a*.07-b*b*.05)+.4,b];},3,3),x,z,{rot:[k.rand(-.5,.5),k.rand(TAU),k.rand(-.5,.5)],color,gloss:.25,paint:[spots(0xb9842a,.2,1.6,seed),mottle(.08,2)],whole:true,settle,roll:within?2:0,within});
}
function elbows(k,x,z,n,r,color=0xf0b33a){
  for(let i=0;i<n;i++){const [px,pz]=k.spot(x,z,r);k.drop(tube([[-.7,0,0],[-.5,0,.5],[0,0,.75],[.5,0,.5],[.7,0,0]],.36,{sides:5,caps:false,curve:false}),px,pz,{rot:[k.rand(-.6,.6),k.rand(TAU),k.rand(-.6,.6)],color,gloss:.55,paint:mottle(.08,2),whole:true,roll:2,within:[x,z,r*1.1]});}
}
function wedgeOf(k,x,z,yaw,{r=10,h=4,angle=.9,layers}){
  // Stacked wedges from the bottom up: [height, colour, options].
  const pts=[[0,0]];for(let i=0;i<=6;i++){const a=(i/6-.5)*angle;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}
  k.at(x,z,yaw,()=>{for(const [t,color,o={}] of layers)k.drop(puck(pts.map(([a,b])=>[a-r*.55,b]),t,{sharp:true,edge:Math.min(.12,t*.3),n:36,bump:o.bump||0,freq:1.4,dome:o.dome||0}),0,0,{settle:1,color,gloss:o.gloss??.3,inside:o.inside??color,whole:false,paint:o.paint||mottle(.05,1.6)});});
}

export const small={
  'fried-chicken':k=>{basket(k);W.leavings(k,{crumbs:[C.fried,C.bone],r:5});
    const n=count(k,3,1);
    if(n>0)F.friedPiece(k,-3.6,1.6,.5,{r:3.1,bone:true});if(n>1)F.friedPiece(k,2.6,-2.4,2.4,{r:3});if(n>2)F.friedPiece(k,3.6,3.4,-1,{r:2.6,bone:true});
    if(k.level===2)k.drop(lathe([[0,0],[3,0],[3.3,.6],[3.2,2.3],[2.6,2.9],[0,3.1]],22,{bump:.07,freq:.8,seed:2}),-6.6,-3.6,{color:0xe3bd72,gloss:.25,inside:C.crumb,paint:[browned(0xb9843a,.7,.8),toward(0xf1dfb4,(P,N,L)=>.5*smooth(.7,.9,Math.abs(Math.sin(L.y*6)))*(1-Math.abs(N.y))),mottle(.07,1.4)],whole:true});
    k.cut=false;},
  wings:k=>{basket(k,0x2a2a2a);W.leavings(k,{crumbs:[C.bone,0xc9501e],smear:0xc9501e,r:5});
    const n=count(k,7,3);
    for(let i=0;i<n;i++){const [x,z]=k.spot(-2.6,.4,4.2);F.friedPiece(k,x,z,k.rand(TAU),{r:1.7,color:0xc9561e,dark:0x7a2a0c,bone:i%2===0,gloss:.65,long:1.3});}
    for(let i=0;i<4;i++)k.drop(brick(.9,.7,6.4,.2,{n:14}),6.2+i*.9,2.6+k.rand(-.5,.5),{rot:[0,k.rand(-.12,.12),0],color:i%2?C.carrot:0xa9c86a,gloss:.4,whole:true});
    sauceCup(k,7.4,-4.4,0xf1eedc,{paint:spots(0x8a9ab0,.2,3,1)});k.cut=false;},
  tenders:k=>{basket(k);W.leavings(k,{crumbs:[C.fried],r:5});
    const n=count(k,4,2);
    for(let i=0;i<n;i++)k.at(-5+i*2.9,.6+k.rand(-.6,.6),1.3+k.rand(-.3,.3),()=>k.drop(puck(F.wobble(4.4,12,.14,i,1.5),1.3,{edge:.55,dome:.3,bump:.24,freq:1.4,seed:i,n:26}),0,0,{rot:[0,0,.2],color:C.fried,gloss:.25,inside:C.chickenIn,whole:false,paint:[mottle(.18,2.4),spots(C.friedDark,.3,1.8,i)]}));
    F.fries(k,5.8,3,12,{r:2.6,along:.4});sauceCup(k,7.2,-4.2,0xc9902a);k.cut=false;},
  'korean-fried-chicken':k=>{W.plate(k,12);W.deliPaper(k,17,17,{yaw:.4,lift:.02});W.leavings(k,{crumbs:[C.bone,0x9a2a12],smear:0x9a2a12,r:5});
    const n=count(k,6,3);
    for(let i=0;i<n;i++){const [x,z]=k.spot(-1.6,0,4.2);F.friedPiece(k,x,z,k.rand(TAU),{r:1.9,color:0xa8361a,dark:0x5a140a,bone:i%2===0,gloss:.8,long:1.25});}
    F.sesame(k,-1.6,0,50,{r:4.6,onFood:1});F.scallions(k,-1.6,0,10,{r:4,onFood:1});
    for(let i=0;i<6;i++){const [x,z]=k.spot(7.4,3.6,1.5);k.drop(brick(1.2,1.2,1.2,.12,{n:10}),x,z,{rot:[0,k.rand(TAU),0],color:0xf7f4ea,gloss:.6,whole:true});}k.cut=false;},
  'onion-rings':k=>{boat(k);W.leavings(k,{crumbs:[C.fried],r:4});
    const n=count(k,7,3);
    for(let i=0;i<n;i++){const [x,z]=k.spot(0,0,3.6),r=k.rand(2,3);k.drop(lathe([[r,0],[r+.55,.3],[r+.55,.9],[r,1.2],[r-.55,.9],[r-.55,.3],[r,0]],18,{bump:.1,freq:1.6,seed:i}),x,z,{rot:[k.rand(-.35,.35),0,k.rand(-.35,.35)],color:0xd09a3a,gloss:.25,paint:[mottle(.16,2.6),spots(0x9a5e1e,.28,2,i)],whole:true,settle:.6});}k.cut=false;},
  'mozz-sticks':k=>{boat(k,18,11);W.leavings(k,{crumbs:[C.fried],smear:C.marinara,r:4});
    const n=count(k,5,2);
    for(let i=0;i<n;i++)friedRoll(k,-2.6+k.rand(-.5,.5),(i-2)*1.9,k.rand(-.15,.15),{length:8,r:1,color:0xc98a34});
    sauceCup(k,5.6,0,C.marinara,{r:2.3});k.cut=false;},
  tostones:k=>{W.plate(k,11);W.leavings(k,{crumbs:[0xe3b84a],smear:0xe9e0b0,r:4.6});
    const n=count(k,7,3);
    for(let i=0;i<n;i++){const a=i*TAU/7;F.coin(k,-1.2+Math.cos(a)*4.3,Math.sin(a)*4.3,{r:2.2,h:.75,color:0xe6c05a,dark:0xa9742a,cover:.3,gloss:.3,tilt:.12});}
    sauceCup(k,-1.2,0,0xe9e0b0,{r:2.2,paint:spots(0x6a9a3c,.2,3,1)});k.sprinkle('cube',20,{r:6,color:[0xf7f4ea],size:.16});k.cut=false;},
  plantains:k=>{W.plate(k,11);W.leavings(k,{crumbs:[0xc9812a],smear:0x9a5a1a,r:4.6});
    const n=count(k,8,4);
    for(let i=0;i<n;i++){const [x,z]=k.spot(0,0,4.8);F.coin(k,x,z,{r:2.3,rz:1.4,h:.8,color:0xcf8a2a,dark:0x4a200c,cover:.38,gloss:.6,tilt:.2});}k.cut=false;},
  festival:k=>{boat(k);W.leavings(k,{crumbs:[0xc98a34],r:4});const n=count(k,5,2);
    for(let i=0;i<n;i++)friedRoll(k,k.rand(-.6,.6),(i-2)*1.9,k.rand(-.2,.2),{length:9,r:1.2,color:0xc98a34,dark:0x8a4a16});k.cut=false;},
  'puff-puff':k=>{boat(k,14,11,3.6);W.leavings(k,{crumbs:[0xc98a34],r:3.4});
    F.chunks(k,0,0,count(k,9,4),{r:1.6,color:0xc98a34,dark:0x8a4a16,cover:.34,spread:3.2,squash:.92,gloss:.3,bump:.1});if(k.level)k.sprinkle('cube',40,{r:3.6,color:[0xfbf8f0],size:.14,onFood:1});k.cut=false;},
  tempura:k=>{W.plate(k,12);W.deliPaper(k,16,16,{yaw:.5,lift:.02});W.leavings(k,{crumbs:[0xe9c87a],r:4.6});
    const n=count(k,3,1);
    for(let i=0;i<n;i++)k.at(-3+i*2.6,.8,1.2+i*.1,()=>{k.drop(tube([[-4.6,0,0],[0,0,.3],[4,0,0]],1.1,{sides:9,ry:.9,taper:t=>(.6+.4*Math.sin(t*2.6))*(1+.1*Math.sin(t*40)),steps:20}),0,0,{rot:[0,0,.18],color:0xe9c87a,gloss:.25,inside:C.shrimp,whole:false,paint:[mottle(.14,3),spots(0xc99a44,.3,2.4,i)]});k.add(sheet((u,v)=>[4.4+v*1.5,.5+v*.6,(u-.5)*1.6*v],3,2),{at:[0,k.top(3.6,0)-.6,0],color:0xe0603c,gloss:.5,whole:true});});
    if(k.level===2){for(let i=0;i<2;i++)k.drop(lathe([[0,0],[2.2,0],[2.3,.25],[0,.3]],16,{bump:.1,freq:2,seed:i}),5.6,-3.4+i*2.6,{rot:[.3,0,.2],color:i?0xd9a04a:0x8fae5a,gloss:.25,paint:mottle(.14,3),whole:true});}
    sauceCup(k,6.6,4.4,0x5a3018,{r:2.2});k.cut=false;},
  samosa:k=>{W.plate(k,10.5);W.leavings(k,{crumbs:[0xc98a3e],smear:0x4a7a2a,r:4.4});
    const n=count(k,2,1);
    for(let i=0;i<n;i++)k.drop(lathe([[0,0],[3.4,0],[3.6,.5],[2.6,2.4],[1.2,4.2],[0,4.9]],3,{bump:.05,freq:.7,seed:i}).toNonIndexed(),-3.4+i*5.2,i?1.6:-1,{rot:[0,.5+i*1.3,0],color:0xcf9844,gloss:.3,inside:0xd9c06a,whole:false,paint:[mottle(.14,2.2),spots(0x9a5e1e,.25,1.8,i),spots(0xe9c57a,.2,3,i+2)]});
    sauceCup(k,4.6,-4.6,0x4a7a2a,{r:1.9,h:1.7});sauceCup(k,5.6,-.4,0x6a2a12,{r:1.9,h:1.7});k.biteAngle=.2;k.biteAt=0;},
  empanada:k=>{boat(k,18,12);W.leavings(k,{crumbs:[0xd9a84a],r:4});const n=count(k,2,1);
    for(let i=0;i<n;i++)halfMoon(k,-2+i*3.4,-1.6+i*3.2,.3-i*.5,{w:11.6,d:6,color:0xd9a84a,dark:0x9a5a1e});k.biteAngle=.2;k.biteAt=1.5;},
  'beef-patty':k=>{W.deliPaper(k,17,13,{color:0xf1e9d6,yaw:.2});W.leavings(k,{crumbs:[0xe6b63a],r:4});
    halfMoon(k,0,0,.25,{w:14,d:8,h:1.1,dome:1.1,color:0xe9b83a,dark:0xc9862a,crimp:false,inside:0x7a4a2a,bump:.2});
    if(k.level)for(let i=0;i<9;i++)k.drizzle([[-5.6+i*1.2,-3.2],[-5.4+i*1.2,-2.2]],.1,0xb9842a,{gloss:.2,ry:.03});k.biteAngle=.2;k.biteAt=1.5;},
  'meat-pie':k=>{W.plate(k,10);W.leavings(k,{crumbs:[0xd9a84a],r:4});
    k.drop(lathe([[0,0],[4.4,0],[5,1],[5.2,2.4],[4.9,2.9],[4.2,3.2],[2.4,3.7],[0,3.9]],26,{bump:.05,freq:.6,seed:2,wave:(a,j)=>j===4?1+.04*Math.sin(a*16):1}),0,0,{color:0xd9a84a,gloss:.4,inside:0x6a3a20,whole:false,paint:[browned(0x9a5a1e,.6,.8),mottle(.08,1.4)]});
    if(k.level)for(let i=0;i<3;i++)k.drizzle([[i*1.2-1.6,-.8],[i*1.2-.8,.8]],.14,0x5a2a10,{gloss:.3,ry:.04});k.biteAngle=.2;k.biteAt=1;},
  knish:k=>{W.plate(k,10);W.leavings(k,{crumbs:[0xd9a84a],smear:C.mustard,r:4});
    k.drop(brick(8.4,3.4,8.4,1.1,{n:32,bump:.08,freq:.6}),-.8,0,{rot:[0,.3,0],color:0xdcae52,gloss:.35,inside:0xf1e2b0,whole:false,paint:[browned(0xa9702a,.6,.7),mottle(.08,1.3)]});
    F.dollop(k,6.2,-4,{r:1.7,h:.7,color:C.mustard,gloss:.6});k.biteAngle=.3;k.biteAt=.2;},
  latkes:k=>{W.plate(k,12);W.leavings(k,{crumbs:[0xc98a34],smear:0xf1eedc,r:5});const n=count(k,3,1);
    for(let i=0;i<n;i++){const x=-3.6+i*2.9,z=1+i*.4;k.drop(puck(F.wobble(3.9,16,.14,i),1,{edge:.4,dome:.2,bump:.35,freq:1.7,seed:i,n:30}),x,z,{rot:[0,0,i?.3:0],color:0xc98a34,gloss:.28,inside:0xe9d08a,whole:false,paint:[mottle(.2,3),spots(0x8a4a16,.3,2.2,i),spots(0xe9c06a,.25,3.2,i+3)]});}
    sauceCup(k,6.4,-4.6,0xd9b46a,{r:2.2});sauceCup(k,7.2,.8,C.cream,{r:2.2});k.cut=false;},
  'spring-rolls':k=>{W.plate(k,11);W.leavings(k,{crumbs:[0xd09a40],smear:0xb84b2d,r:4.6});const n=count(k,3,2);
    for(let i=0;i<n;i++)friedRoll(k,-2.4+i*.6,(i-1)*2.9,.35+i*.1,{length:k.level===1&&i===n-1?4.6:9,r:1.25});
    sauceCup(k,5.6,-4.4,0xb84b2d);k.cut=false;},
  'egg-roll':k=>{W.deliPaper(k,17,12,{yaw:.15});W.leavings(k,{crumbs:[0xb57b36],r:4});
    friedRoll(k,0,.4,.3,{length:11.5,r:2.1,color:0xb9803a,dark:0x7a4416});
    if(k.level){k.ware(sheet((u,v)=>[(u-.5)*2.2,.05,(v-.5)*3.2],2,2),{at:[6.6,k.top(6.6,3.6)+.05,3.6],rot:[0,.4,0],color:0xe6902a,gloss:.5});k.ware(sheet((u,v)=>[(u-.5)*2.2,.05,(v-.5)*3.2],2,2),{at:[6.6,k.top(6.6,.6)+.05,.6],rot:[0,-.2,0],color:0xe3c02a,gloss:.5});}
    k.biteAngle=-.3;k.biteAt=1.6;},
  gyoza:k=>{W.platter(k,26,13);W.leavings(k,{crumbs:[C.dough],smear:0x5a3018,r:4});const n=count(k,6,3);
    for(let i=0;i<n;i++)F.dumpling(k,-7.6+i*2.5,.2,1.35,{s:.95,tilt:[0,.5]});
    sauceCup(k,9.4,.4,0x3a1c10,{r:1.9,h:1.5});k.cut=false;},
  dumplings:k=>{steamer(k,8.6,4.2);const n=count(k,6,3);
    for(let i=0;i<n;i++){const a=i*TAU/6;F.dumpling(k,Math.cos(a)*4.9,Math.sin(a)*4.9,-a+Math.PI/2,{seared:false,s:1});}
    if(k.level===2)F.dumpling(k,0,0,.3,{seared:false,s:1});k.cut=false;},
  'pork-bun':k=>{steamer(k,8,4.2);const n=count(k,3,1);
    for(let i=0;i<n;i++){const a=i*TAU/3+.5,x=Math.cos(a)*3.6,z=Math.sin(a)*3.6;k.ware(lathe([[0,0],[2.5,0],[0,.04]],12),{at:[x,k.top(x,z)+.03,z],color:0xf4f1e6,gloss:.15,cast:false});F.bao(k,x,z,{r:3});}k.cut=false;},
  'scallion-pancake':k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[0xd6a24e],smear:0x3a1c10,r:4.6});const n=count(k,6,3);
    for(let i=0;i<n;i++){const a=i*TAU/6;k.at(-1+Math.cos(a)*.5,Math.sin(a)*.5,-a,()=>k.add(puck([[.6,0],[8,-3.6],[8.6,0],[8,3.6]],.7,{sharp:true,edge:.25,dome:.1,bump:.2,freq:1,seed:i,n:28}),{at:[0,.03,0],drape:.01,color:0xdcae52,gloss:.35,inside:0xf1e2b0,whole:true,paint:[spots(0x9a5e1e,.3,1.2,i),spots(0x5c8a34,.16,2.6,i+5),mottle(.1,1.6)]}));}
    sauceCup(k,8.4,-6,0x3a1c10,{r:1.9,h:1.5});k.cut=false;},
  coleslaw:k=>{const d=W.bowl(k,5.2,4,{color:W.PAPER,gloss:.2});k.cut=false;if(!k.level){W.fill(k,d,.05,0xf1eedc,{ware:true});return;}
    W.fill(k,d,k.level===2?.9:.4,0xf1eedc,{gloss:.45,dome:k.level===2?.9:.2});F.shreds(k,0,0,k.level===2?70:26,{r:3.6,color:[C.cabbage,0xf1eedc,C.carrot,0x9a5a9a],size:1.4});},
  collards:k=>{const d=W.bowl(k,6,4,{color:0xe9e2d0});k.cut=false;if(!k.level){W.fill(k,d,.06,0x5a6a2a,{ware:true});return;}
    W.fill(k,d,k.level===2?.9:.4,0x35582a,{gloss:.5,dome:k.level===2?.8:.2,paint:[spots(0x5a8a34,.35,1.6,2),mottle(.12,2)]});
    leafy(k,0,0,k.level===2?14:5,3.4,[0x35582a,0x4a7a34,0x2a4a22],2.4);for(let i=0;i<5;i++){const [x,z]=k.spot(0,0,3);k.drop(brick(.9,.6,.9,.12,{n:10}),x,z,{color:0xb86a5a,gloss:.5,whole:true});}},
  'mac-cheese':k=>{const d=W.bowl(k,6.4,4.2,{color:0x23272a,inner:0x3a3f42});k.cut=false;if(!k.level){W.fill(k,d,.06,0xf0b33a,{ware:true});return;}
    W.fill(k,d,k.level===2?.9:.4,0xe9a82e,{gloss:.55,dome:k.level===2?.9:.2,paint:mottle(.08,2)});elbows(k,0,0,k.level===2?44:16,k.level===2?4.6:3.4);
    if(k.level===2)k.sprinkle('cube',30,{r:4,color:[0xc98a34,0xe9c57a],size:.22,onFood:3});},
  spinach:k=>{const d=W.bowl(k,6.4,3.6,{color:0xe9e2d0});k.cut=false;if(!k.level){W.fill(k,d,.06,0xc9d6b0,{ware:true});return;}
    W.fill(k,d,k.level===2?.9:.4,0x8aa86a,{gloss:.5,dome:.3,paint:[spots(0x3f6a2c,.45,1.5,2),spots(0xe6edd0,.2,1.1,6),mottle(.1,2)]});},
  'baked-potato':k=>{W.deliPaper(k,16,13,{color:W.FOIL,gloss:.6,crinkle:.3,yaw:.2});W.leavings(k,{crumbs:[0x8a5a34],r:4});
    k.drop(blob({r:[6,3.2,4],bump:.07,freq:.5,seed:3,detail:3,flat:.14}),0,0,{rot:[0,.2,0],color:0x8a5a34,gloss:.2,inside:0xf3e6bc,whole:false,paint:[mottle(.14,1.8),spots(0x5a3a20,.2,1.4,2)]});
    F.coat(k,0,0,3.6,0xf3e6bc,{rz:1.8,thick:.3,amp:.2,gloss:.3});F.dollop(k,-.6,0,{r:1.9,h:1.1,color:C.cream});F.butterPat(k,2.2,.2);
    k.sprinkle('cube',16,{r:2.6,color:[0x8b3524,0xa84a2a],size:.34,onFood:4});F.scallions(k,0,0,12,{r:2.6,onFood:4,size:.45});k.biteAngle=.2;k.biteAt=1.4;},
  cornbread:k=>{W.plate(k,10);W.leavings(k,{crumbs:[0xe6b34a],r:4});const n=count(k,2,1);
    for(let i=0;i<n;i++)k.drop(brick(6,3,6,.3,{n:24,bump:.07,freq:1.2}),-3+i*5,i*1.6-.6,{rot:[0,.3-i*.6,0],color:0xe6b34a,gloss:.25,inside:0xf3d98a,whole:false,paint:[browned(0xb9772a,.65,.9),mottle(.08,1.8)]});
    if(k.level)F.butterPat(k,-3,-.6);k.biteAngle=.2;k.biteAt=.2;},
  naan:k=>{W.plate(k,12);W.leavings(k,{crumbs:[0xe6c98a],r:5});
    k.add(puck([[-9,0],[-6,-5],[2,-6.4],[8.6,-3],[9.4,1.4],[4,5.6],[-4,5.4]],.7,{edge:.3,dome:.2,bump:.4,freq:.6,seed:4,n:40}),{at:[0,.05,0],drape:.01,color:0xecd49a,gloss:.5,inside:C.crumb,whole:false,paint:[spots(0x7a4a1e,.24,.9,3),spots(0x3a2010,.07,1.8,5),mottle(.08,1.2)]});
    F.herbs(k,0,0,18,{r:6,size:.6,onFood:.6});k.sprinkle('cube',14,{r:5.6,color:[0xf3ead0],size:.24,onFood:.6});k.biteAngle=.2;k.biteAt=1;},
  dosa:k=>{k.ware(lathe([[0,0],[13.6,0],[14,.5],[13.8,.7],[12.6,.4],[0,.4]],48),{color:0xb4b9bd,gloss:.6,paint:mottle(.06,1.5)});W.leavings(k,{crumbs:[0xd9a04a],smear:0xc9702a,r:6});
    k.at(-1,3,.2,()=>k.drop(tube([[-12.4,0,0],[0,0,0],[12.4,0,0]],2.6,{sides:14,ry:1.9,taper:t=>.82+.18*Math.sin(t*Math.PI),steps:20,caps:false}),0,0,{color:0xdca34a,gloss:.4,inside:0xe9c84a,whole:false,paint:[spots(0x9a5e1e,.3,.8,2),spots(0xf1d08a,.25,1.6,5),mottle(.1,1.2)]}));
    for(const [x,c] of [[-6.4,0xf1eedc],[-1.6,0xb8401e],[3.2,0x4a7a2a]])sauceCup(k,x,-6.6,c,{r:2,h:1.6,cup:0xb4b9bd});
    const b=W.bowl(k,3.4,3.2,{x:8.4,z:-5.4,color:0xb4b9bd});if(k.level)W.fill(k,b,k.level===2?.85:.4,0xc9702a,{paint:spots(0xe9c84a,.2,2,1)});k.biteAngle=-.2;k.biteAt=1;},
  elote:k=>{boat(k,20,8.6,2.8);W.leavings(k,{crumbs:[C.corn],r:4});
    k.at(-1,0,.06,()=>{
      k.drop(tube([[-7,0,0],[0,0,0],[7,0,0]],2.2,{sides:16,taper:t=>.72+.28*Math.sin(.4+t*2.3),steps:30,section:(a,t)=>1+.05*Math.sin(a*TAU*8)*Math.sin(t*90)}),0,0,{color:C.corn,gloss:.5,inside:0xf6e6a0,whole:false,paint:[spots(0xf7f3e6,.3,1.3,2),spots(0xb8401e,.12,3,6),spots(0x6a3a10,.08,2,9),mottle(.08,3)]});
      k.ware(tube([[7,2,0],[12.4,2,0]],.3,{sides:6,curve:false}),{color:0xd9b87a,gloss:.3});
    });W.citrus(k,-6,2.6,.4,{rind:C.lime,flesh:0xcfe08a,r:1.6});k.biteAngle=0;k.biteAt=0;},
  tamales:k=>{W.plate(k,12);W.leavings(k,{crumbs:[0xe9d08a],smear:0xb8401e,r:5});const n=count(k,2,1);
    for(let i=0;i<n;i++)k.at(-2.6+i*1.6,-2.6+i*5,.2-i*.5,()=>{
      k.ware(sheet((u,v)=>[(u-.5)*15*(1-.35*Math.abs(u-.5)),.2+2.2*(v-.5)*(v-.5)*4*.4,(v-.5)*8],8,8),{at:[0,k.top(0,0)+.05,0],color:0xe6d9a0,gloss:.2,paint:(c,P,N,L)=>c.multiplyScalar(1+.1*Math.sin(L.z*9))});
      k.drop(tube([[-4.4,0,0],[0,0,0],[4.4,0,0]],1.9,{sides:12,ry:1.4,taper:t=>.8+.2*Math.sin(t*Math.PI),steps:12}),0,0,{lift:-.6,color:0xe9c66a,gloss:.3,inside:0x9a4a2a,whole:false,paint:mottle(.08,1.6)});
    });
    sauceCup(k,6.8,-4.6,0xb8401e,{r:2.1});k.biteAngle=.2;k.biteAt=1;},
  tteokbokki:k=>{const d=W.bowl(k,8.6,4.6,{color:0x23272a,inner:0x2e3336});k.cut=false;if(!k.level){W.fill(k,d,.06,0xb8301a,{ware:true});return;}
    const y=W.fill(k,d,k.level===2?.6:.28,0xb8301a,{gloss:.8,paint:mottle(.1,1.4)});
    for(let i=0;i<(k.level===2?13:5);i++){const [x,z]=k.spot(0,0,k.level===2?5.2:3.6);k.drop(tube([[-2.3,0,0],[2.3,0,0]],.85,{sides:10,curve:false}),x,z,{lift:-.5,rot:[k.rand(-.2,.2),k.rand(TAU),k.rand(-.2,.2)],color:0xe6a07a,gloss:.8,paint:toward(0xc04a26,(P,N)=>smooth(.4,-.4,N.y)*.8),whole:true,settle:.2});}
    if(k.level===2){for(let i=0;i<4;i++){const [x,z]=k.spot(0,0,5);k.drop(puck([[-1.8,-1.3],[1.8,-1.3],[0,1.8]],.3,{sharp:true,edge:.1,n:12}),x,z,{rot:[k.rand(-.3,.3),k.rand(TAU),0],color:0xe0a66a,gloss:.7,whole:true});}
      F.scallions(k,0,0,14,{r:5,onFood:y});F.sesame(k,0,0,30,{r:5,onFood:y});}},
  edamame:k=>{const d=W.bowl(k,7,4.4,{color:0x3a4a52,inner:0xdcd6c6});k.cut=false;if(!k.level)return;
    for(let i=0;i<count(k,16,6);i++){const [x,z]=k.spot(0,0,4);k.drop(tube([[-2.6,0,0],[0,0,.7],[2.6,0,0]],.72,{sides:8,ry:.42,taper:t=>(.4+.6*Math.sin(t*Math.PI))*(1+.22*Math.abs(Math.sin(t*9.4))),steps:18}),x,z,{rot:[k.rand(-.4,.4),k.rand(TAU),k.rand(-.3,.3)],color:0x7aa63a,gloss:.4,paint:mottle(.12,2.4),whole:true,roll:2,within:[0,0,4.6]});}
    k.sprinkle('cube',30,{r:4,color:[0xfbf8f0],size:.16,onFood:1});},
  'pickle-plate':k=>{W.plate(k,9.5);W.leavings(k,{smear:0xb9c46a,crumbs:[C.pickle],n:6,r:4});const n=count(k,4,2);
    for(let i=0;i<n;i++)F.spear(k,-2.2+i*1.5,k.rand(-.5,.5),1.4+k.rand(-.15,.15),{length:10});k.cut=false;},
  hummus:k=>{W.plate(k,12);W.leavings(k,{crumbs:[C.pita],smear:0xe6d2a0,r:5});
    const d=W.bowl(k,7.4,2.4,{x:-2.4,z:0,color:0xd9d2c2});
    if(k.level){const y=W.fill(k,d,k.level===2?.8:.35,0xe6d2a0,{gloss:.35,paint:[toward(0xd9c088,(P,N,L)=>.6*smooth(.4,.9,Math.abs(Math.sin(Math.hypot(L.x,L.z)*1.6)))),mottle(.05,2)]});
      if(k.level===2){k.add(lathe([[1.3,0],[.6,.03],[0,.03]],16),{at:[-1.6,y+.04,.8],color:0xb9a44a,gloss:.9,cast:false,whole:true});k.sprinkle('pea',7,{x:-2.8,z:-.6,r:1.6,color:[C.chickpea],size:.85,onFood:y});k.sprinkle('fleck',40,{x:-2.4,z:0,r:5.6,color:[0xa8321e,0xa8321e,0x4d8a2c],size:.36,onFood:y,flat:true});}}
    const n=count(k,4,2);for(let i=0;i<n;i++)F.flatbread(k,7.2-i*.4,-4.6+i*3,.9+i*.5,{outline:[[-3.4,-2.2],[3.6,-2.2],[0,3.6]],lift:.05+i*.14,drape:.6});k.cut=false;},
  guacamole:k=>{W.plate(k,12);W.leavings(k,{crumbs:[0xe6b84a],smear:C.guac,r:5});
    const d=W.bowl(k,5.6,4,{x:-4.2,z:.6,color:0x3a3a3c,gloss:.25});
    if(k.level){W.fill(k,d,k.level===2?.9:.4,C.guac,{gloss:.4,dome:k.level===2?.8:.2,paint:[spots(0xc9d98a,.3,1.6,2),spots(0x6a8a2a,.2,2.2,5),mottle(.08,2)]});
      if(k.level===2){k.sprinkle('cube',10,{x:-4.2,z:.6,r:3,color:[C.tomato,0xf1e8d6],size:.4,onFood:3});F.herbs(k,-4.2,.6,8,{r:3,size:.5,onFood:3});}}
    for(let i=0;i<count(k,12,5);i++){const [x,z]=k.spot(4.8,0,4.4);chip(k,x,z,{within:[4.8,0,5]});}k.cut=false;},
  nachos:k=>{W.platter(k,28,19);W.leavings(k,{crumbs:[0xe6b84a],smear:C.cheddar,r:6});if(!k.level)return;
    const n=count(k,22,9);
    for(let i=0;i<n;i++){const [x,z]=k.spot(0,0,k.level===2?7.4:5,.9);chip(k,x,z,{settle:.55});}
    for(let i=0;i<5;i++){const [x,z]=k.spot(0,0,4.4);F.coat(k,x,z,2.6,C.cheddar,{thick:.12,amp:.4,gloss:.6});}
    if(k.level===2){F.beans(k,-2,1,{r:2.2,n:20,h:.4,size:.6});k.sprinkle('cube',16,{r:6,color:[C.tomato,0xd9503a],size:.5,onFood:1});
      for(let i=0;i<8;i++){const [x,z]=k.spot(0,0,5.4);F.coin(k,x,z,{r:.75,h:.25,color:0x5c9a34,dark:0x3f7a24,tilt:.4});}
      F.dollop(k,1.6,-1,{r:1.8,h:1,color:C.cream});F.dollop(k,-1,-2.6,{r:1.7,h:.9,color:C.guac,paint:spots(0xc9d98a,.3,1.6,2)});F.herbs(k,0,0,14,{r:6,size:.5,onFood:1});}
    k.cut=false;},
  sushi:k=>{W.board(k,24,11,1.2,{color:0x2a2a2c,gloss:.5});W.leavings(k,{crumbs:[C.rice],smear:0x3a1c10,n:8,r:4});const n=count(k,6,3);
    for(let i=0;i<n;i++)maki(k,-8.4+i*2.9+(i%2)*.1,i%2?.9:-.7,{fill:[C.salmon,0xf2a585,0xe9835d]});
    if(k.level){F.dollop(k,9.6,2.4,{r:1.1,h:.7,color:C.wasabi,gloss:.3});for(let i=0;i<4;i++)k.drop(sheet((u,v)=>[(u-.5)*2.2,.25*Math.sin(u*5+i),(v-.5)*1.6],4,2),9.2+k.rand(-.5,.5),-2.6+k.rand(-.5,.5),{rot:[0,k.rand(TAU),0],color:C.ginger,gloss:.6,whole:true});}k.cut=false;},
  kimbap:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[C.rice],n:8,r:4});const n=count(k,8,4);
    for(let i=0;i<n;i++)maki(k,-1+(i%4-1.5)*4.4+(i>3?.8:0),i>3?2.6:-2.4,{r:2.3,h:1.6,fill:[0xf3c84a,0x5c9a34,C.carrot,0x8a4a2a,0xf2d0d8]});
    if(k.level)F.sesame(k,-1,0,26,{r:6.6,onFood:1.6});k.cut=false;},
  nigiri:k=>{W.board(k,26,12,1.6,{color:0xb98a52});W.leavings(k,{crumbs:[C.rice],n:8,r:4});
    const set=[{fish:C.salmon},{fish:C.tuna,stripe:0xd96a72},{fish:0xf2a07a,kind:'shrimp'},{kind:'egg'},{fish:0xf1d9c0,stripe:0xe9b0a0}],n=count(k,5,2);
    for(let i=0;i<n;i++)nigiri(k,-8.6+i*3.7,.3,1.2,set[i]);
    if(k.level){F.dollop(k,10.4,3,{r:1.1,h:.7,color:C.wasabi,gloss:.3});for(let i=0;i<4;i++)k.drop(sheet((u,v)=>[(u-.5)*2.2,.25*Math.sin(u*5+i),(v-.5)*1.6],4,2),10.2+k.rand(-.5,.5),-2.6+k.rand(-.5,.5),{rot:[0,k.rand(TAU),0],color:C.ginger,gloss:.6,whole:true});}k.cut=false;},
  onigiri:k=>{W.plate(k,10);W.leavings(k,{crumbs:[C.rice],n:10,r:4});const n=count(k,2,1);
    for(let i=0;i<n;i++)k.at(-3+i*5.6,i*.8,.2-i*.5,()=>{
      k.drop(puck([[-3.6,2.6],[0,-3.9],[3.6,2.6]],2.5,{edge:1,dome:.2,bump:.08,freq:1.4,seed:i,n:30}),0,0,{color:C.rice,gloss:.25,inside:0xe9835d,whole:false,paint:mottle(.06,3)});
      k.add(brick(3.4,1.9,.3,.05,{n:12}),{at:[0,.2,2.4],scale:[1,1,9],color:C.nori,gloss:.35,paint:mottle(.15,2),whole:false});
      k.sprinkle('seed',12,{r:2,color:[0x2a2a30],size:.3,onFood:2});
    });k.biteAngle=.2;k.biteAt=1;},
  'papaya-salad':k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[0xd9e0a8],smear:0xe6902a,r:4.6});if(!k.level)return;
    F.dollop(k,0,0,{r:k.level===2?5.4:3.4,h:k.level===2?2.6:1.4,color:0xd9e0a8,gloss:.4,bump:.2});
    F.shreds(k,0,0,k.level===2?130:50,{r:k.level===2?5.2:3.2,color:[0xdfe6b0,0xe9eec4,C.carrot,0xc9d68a],size:2.2});
    if(k.level===2){for(let i=0;i<5;i++){const [x,z]=k.spot(0,0,4.6);k.drop(blob({r:[1.2,.8,.9],detail:1,bump:.05}),x,z,{color:C.tomato,gloss:.6,whole:true});}
      for(let i=0;i<5;i++){const [x,z]=k.spot(0,0,4.6);k.drop(tube([[-1.8,0,0],[1.8,0,.3]],.3,{sides:5,curve:false}),x,z,{rot:[0,k.rand(TAU),0],color:0x5c9a34,gloss:.4,whole:true});}
      k.sprinkle('pea',14,{r:4.6,color:[0xd9b06a,0xc99a52],size:.55,onFood:1.5});W.citrus(k,6.6,-4.6,.5,{rind:C.lime,flesh:0xcfe08a,r:1.7});}k.cut=false;},
  'greek-salad':k=>{const d=W.bowl(k,9,4.6,{color:0xe9e2d0});k.cut=false;if(!k.level)return;
    W.fill(k,d,k.level===2?.55:.2,C.lettuce,{gloss:.3,dome:.6,paint:mottle(.15,1.5)});leafy(k,0,0,count(k,18,7),5.4,[C.lettuce,C.leaf,C.lettucePale],3);
    for(let i=0;i<count(k,5,2);i++){const [x,z]=k.spot(0,0,5);k.drop(blob({r:[1.5,1,1.1],detail:1,bump:.05}),x,z,{color:C.tomato,gloss:.6,whole:true});}
    for(let i=0;i<count(k,6,2);i++){const [x,z]=k.spot(0,0,5);F.coin(k,x,z,{r:1.3,h:.35,color:0xcfe0a0,dark:0x4f8a34,cover:.0,gloss:.5,tilt:.5});}
    for(let i=0;i<count(k,6,2);i++){const [x,z]=k.spot(0,0,5);k.drop(blob({r:[.8,.7,.7],detail:1,bump:0}),x,z,{color:0x2e2030,gloss:.7,whole:true});}
    if(k.level===2){k.drop(brick(4,1.3,3,.15,{n:16,bump:.05}),.4,-.4,{rot:[.1,.5,0],color:0xfaf6ea,gloss:.3,paint:mottle(.04,3),whole:true});F.onionRings(k,0,1.6,3,{r:1.9});k.sprinkle('fleck',16,{r:3,color:[0x5a7a2a],size:.3,onFood:4,flat:true});}},
  caesar:k=>{const d=W.bowl(k,9,4.6,{color:0xe9e2d0});k.cut=false;if(!k.level)return;
    W.fill(k,d,k.level===2?.55:.2,0x9cc456,{gloss:.3,dome:.6,paint:mottle(.15,1.5)});leafy(k,0,0,count(k,22,8),5.4,[0x9cc456,C.lettuce,0xcfe08a,0xe6efb8],3.4);
    for(let i=0;i<count(k,9,3);i++){const [x,z]=k.spot(0,0,5);k.drop(brick(1.3,1.2,1.3,.12,{n:10}),x,z,{rot:[k.rand(-.4,.4),k.rand(TAU),k.rand(-.4,.4)],color:0xd9a85a,gloss:.2,paint:spots(0xa9702a,.3,1.6,i),whole:true});}
    if(k.level===2)for(let i=0;i<9;i++){const [x,z]=k.spot(0,0,4.6);k.drop(sheet((u,v)=>[(u-.5)*2.4,.2*Math.sin(u*4+i),(v-.5)*1.3],3,2),x,z,{rot:[k.rand(-.4,.4),k.rand(TAU),0],color:0xf6eccc,gloss:.3,whole:true});}},
  'wedge-salad':k=>{W.plate(k,11);W.leavings(k,{crumbs:[C.lettucePale,0x8b3524],smear:0xf1eedc,r:4.6});
    k.drop(lathe([[0,0],[4.6,0],[5.4,1.6],[4.6,4.4],[2.6,5.9],[0,6.3]],5,{bump:.08,freq:.5,seed:2}),0,0,{rot:[0,.3,0],scale:[1,1,.62],color:0xcfe29a,gloss:.35,inside:0xe9f1c8,whole:false,paint:[toward(0x8fbc4a,(P,N,L)=>.6*smooth(.2,.7,fbm(L.x*.5,L.y*.8,L.z*.5)+.5)),mottle(.08,1.6)]});
    F.coat(k,0,0,3.4,0xf1eedc,{thick:.2,amp:.4,gloss:.45,paint:spots(0x8a9ab0,.15,3,1)});k.sprinkle('cube',22,{r:4.4,color:[0x8b3524,0xa84a2a],size:.38,onFood:.5});k.sprinkle('cube',10,{r:5,color:[C.tomato],size:.6});F.scallions(k,0,0,12,{r:4.4,size:.4});k.biteAngle=.2;k.biteAt=.6;},
  caprese:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[0x3f8a34],smear:0x3a1410,r:4.6});const n=count(k,8,4);
    for(let i=0;i<n;i++){const a=i*TAU/8;k.at(Math.cos(a)*4.6,Math.sin(a)*4.6,-a,()=>k.drop(puck(circle(2.5,12),.7,{edge:.25,n:20}),0,0,{rot:[0,0,.35],color:i%2?C.tomato:0xfaf6ea,gloss:i%2?.6:.45,inside:i%2?C.tomatoIn:0xfaf6ea,whole:true,paint:mottle(.04,2)}));}
    if(k.level){for(let i=0;i<5;i++){const a=i*TAU/5+.4;k.drop(sheet((u,v)=>[(u-.5)*3,.15*Math.sin(u*3.1)+.05,(v-.5)*1.9*Math.sin(Math.PI*(.15+.7*u))],5,3),Math.cos(a)*4.4,Math.sin(a)*4.4,{rot:[0,k.rand(TAU),0],color:0x3f8a34,gloss:.4,paint:mottle(.15,2),whole:true});}
      k.drizzle(Array.from({length:14},(_,i)=>{const a=i/13*TAU*1.9,r=2+i*.3;return [Math.cos(a)*r,Math.sin(a)*r];}),.14,0x3a1410,{gloss:.85});}k.cut=false;},
  spanakopita:k=>{W.plate(k,10.5);W.leavings(k,{crumbs:[0xe0b660,0xf1dc9a],n:30,r:4.6});const n=count(k,2,1);
    for(let i=0;i<n;i++)k.at(-2.6+i*4.6,-1+i*2.4,.3+i*1.9,()=>k.drop(puck([[-4.6,-3.6],[4.8,-3.6],[-4.6,4.8]],1.8,{sharp:true,edge:.5,dome:.6,bump:.3,freq:1.3,seed:i,n:34}),0,0,{color:0xe3b85e,gloss:.35,inside:0x4a7a34,whole:false,paint:[browned(0xa9702a,.6,1.4),spots(0xf3dc9a,.3,2.6,i),mottle(.1,2.4)]}));k.biteAngle=.3;k.biteAt=.5;},
  quiche:k=>{W.plate(k,11);W.leavings(k,{crumbs:[0xc98a45],smear:0xe9c47b,r:4.6});
    wedgeOf(k,-1.6,0,.5,{r:11.5,angle:.95,layers:[[.6,0xc98a45,{paint:[browned(0x8a5a22,.4,1),mottle(.08,2)]}],[2.4,0xedca7c,{inside:0xf3dc9a,gloss:.4,dome:.15,bump:.1,paint:[browned(0xb9772a,.8,.9),spots(0xb8584a,.14,1.6,3),spots(0x4d8a2c,.1,2.2,7),mottle(.06,2)]}]]});
    if(k.level)k.at(-1.6,0,.5,()=>k.add(tube(Array.from({length:7},(_,i)=>{const a=(i/6-.5)*.95;return [Math.cos(a)*11.3-11.5*.55,1.9,Math.sin(a)*11.3];}),.75,{sides:7,ry:1.5}),{at:[0,k.top(-6,0)-3,0],color:0xc98a45,gloss:.3,paint:[browned(0x8a5a22,.6,1),mottle(.1,2)],whole:false}));
    leafy(k,6.4,-4.2,8,1.9);k.biteAngle=2.2;k.biteAt=2;},
  lasagna:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[0xf3dc9a],smear:C.marinara,r:4.6});F.puddle(k,0,0,6.2,C.marinara,{h:.2});
    k.at(0,0,.3,()=>{for(let i=0;i<4;i++){
      k.drop(brick(9.6,.5,7.4,.12,{n:24,bump:.06}),k.rand(-.15,.15),k.rand(-.15,.15),{settle:1,color:0xf1d27a,gloss:.4,inside:0xf1d27a,whole:false,paint:mottle(.06,2)});
      k.drop(brick(9.3,.6,7.1,.15,{n:24,bump:.1,freq:1.4}),0,0,{settle:1,color:i%2?0xf6eed8:0x9a2e1a,gloss:.5,inside:i%2?0xf6eed8:0x9a2e1a,whole:false,paint:mottle(.12,2.4)});}
      k.add(sheet((u,v)=>[(u-.5)*10,.1+.12*fbm(u*8,2,v*8),(v-.5)*7.8],12,10),{at:[0,.02,0],drape:1.2,wide:.3,color:0xf3dc9a,gloss:.55,whole:false,paint:[spots(0xb8361f,.3,1.1,2),spots(0xc98a36,.28,1.7,6),mottle(.06,2)]});});
    F.herbs(k,0,0,6,{r:3,size:1,onFood:3});k.biteAngle=.3;k.biteAt=.6;},
  eggs:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.toast,C.potato],smear:C.yolk,r:5});
    if(k.level){F.friedEgg(k,-4.4,2.4,{r:3.6});if(k.level===2)F.friedEgg(k,-1.6,-3,{r:3.5});}
    F.dice(k,5,3.4,count(k,14,6),{r:3,size:1.4});if(k.level)k.sprinkle('cube',10,{x:5,z:3.4,r:2.6,color:[0x5c9a34,C.pepper],size:.36,onFood:1});
    for(let i=0;i<count(k,2,1);i++)F.slice(k,5.6+i*.8,-4.6+i*1.6,.8+i*.4,{shape:[[-4.4,-4.2],[4.4,-4.2],[-4.4,4.4]],s:.8,toasted:.9,lift:i*.2});k.cut=false;},
  omelette:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.toast,C.potato],smear:0xf3d35a,r:5});
    const half=Array.from({length:13},(_,i)=>{const a=Math.PI*i/12;return [Math.cos(a)*7.4,Math.sin(a)*5.2-2.2];});
    k.at(-3,1.6,.35,()=>k.drop(puck(half,1.1,{edge:.5,dome:1.2,bump:.14,freq:.6,seed:3,n:36}),0,0,{color:0xf3cf52,gloss:.45,inside:0xf6e08a,whole:false,paint:[spots(0xd9a034,.2,1,2),mottle(.06,1.4)]}));
    if(k.level){k.sprinkle('cube',10,{x:-3,z:-1.2,r:3,color:[0x5c9a34,C.pepper,C.ham],size:.45});F.herbs(k,-3,1.6,8,{r:3,size:.5,onFood:1.5});}
    F.dice(k,5.4,3.4,count(k,12,5),{r:2.8,size:1.4});for(let i=0;i<count(k,2,1);i++)F.slice(k,5.6+i*.8,-4.6+i*1.6,.8+i*.4,{shape:[[-4.4,-4.2],[4.4,-4.2],[-4.4,4.4]],s:.8,toasted:.9,lift:i*.2});k.biteAngle=.35;k.biteAt=-2.2;},
  pancakes:k=>{W.plate(k,12);W.leavings(k,{crumbs:[0xd9a85a],smear:0x8a4a12,r:5});const n=count(k,3,1);
    if(k.level)F.puddle(k,1.4,2.2,6,0xa8601a,{h:.1,gloss:.92,amp:.25});
    for(let i=0;i<n;i++)k.drop(puck(F.wobble(6.6-i*.15,18,.03,i),1.15,{edge:.5,dome:.1,bump:.05,n:34}),k.rand(-.3,.3),k.rand(-.3,.3),{settle:1,color:0xe9c88a,gloss:.3,inside:0xf6e6b8,whole:false,paint:[toward(0xb9772a,(P,N,L)=>N.y>.5?.85*smooth(6.3,5.2,Math.hypot(L.x,L.z))*(.8+.2*fbm(L.x*.6,2,L.z*.6)):0),mottle(.05,1.6)]});
    if(k.level){F.coat(k,0,0,3.6,0xa8601a,{thick:.1,amp:.5,gloss:.92});F.butterPat(k,.3,-.2);}
    k.biteAngle=.3;k.biteAt=1.2;},
};
