// Bakery, dessert, ice cream, fruit and things out of a wrapper.
import { banana,orangeBag } from './food-fruit.js';
import { chipBag } from './food-packaging.js';
import { blob,lathe,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,mottle,toward,browned,pale,spots,outward,upward } from './food-kit.js';
import * as W from './food-ware.js';
import * as F from './food-parts.js';
import { isPastry } from './food-catalog.js';
const C=F.C;
const count=(k,full,part)=>k.level===2?full:k.level===1?part:0;
const small=(k,r=9,crumbs=[C.bun,C.crumb],smear=null)=>{
  if(k.takeaway && isPastry(k.key.slice(6))){
    W.deliPaper(k,1.55*r,1.45*r,{color:0xd8b990,yaw:0});
    // Fold one end over the pastry. The pocket collapses when the food is gone.
    k.ware(sheet((u,v)=>[
      -r*.77+r*.50*v,(k.level?3.3:1.0)*Math.sin(v*Math.PI*.65)+.22+.15*Math.cos(u*17),
      (u-.5)*1.44*r,
    ],10,5),{color:0xe3caa5,gloss:.18,cast:false});
  }else W.plate(k,r);
  W.leavings(k,{crumbs,smear,r:r*.45,n:18});
};
const sugar=(k,x,z,r,n=60,onFood=.6)=>k.sprinkle('cube',n,{x,z,r,color:[0xfdfbf6],size:.13,onFood,gloss:.2});

function ringProfile(R,a,b,t0=-Math.PI/2,span=TAU,n=16){return Array.from({length:n+1},(_,i)=>{const t=t0+span*i/n;return [R+a*Math.cos(t),b+b*Math.sin(t)];});}
function doughnut(k,x,z,{R=3.2,a=1.9,b=1.5,icing=null,sprinkles=false,glaze=true,filled=false,stripe=null,color=0xc98a3a,tilt=null,powder=false,inside=null}={}){
  const seed=k.rand(9),prof=filled?[[0,0],[R*.9,0],[R+a*.8,b*.4],[R+a,b],[R+a*.8,b*1.6],[R*.9,b*2],[R*.4,b*2.1],[0,b*2.1]]:ringProfile(R,a,b);
  k.at(x,z,k.rand(TAU),()=>{
    k.drop(lathe(prof,28,{bump:.05,freq:.5,seed}),0,0,{settle:.9,color,gloss:glaze?.6:.3,inside:inside??(filled?0xf3d98a:0xf3e2b4),whole:false,paint:[toward(0xe9c98a,(P,N,L)=>smooth(.5,.1,Math.abs(L.y/b-1))*.8),powder?toward(0xfdfbf6,(P,N)=>smooth(.1,.9,N.y)*(.35+.5*fbm(P.x*2.4,P.y*2.4,P.z*2.4))):null,mottle(.07,1.2)].filter(Boolean)});
    if(icing!==null){
      const ring=filled?[[R+a*.72,b*1.5],[R+a*.5,b*1.9],[R*.9,b*2.06],[R*.4,b*2.16],[0,b*2.16]]:ringProfile(R,a*1.04,b*1.04,.25,Math.PI-.5,8);
      k.add(lathe(ring,28,{wave:(q,j)=>j===0||(!filled&&j===8)?1+(j?-.05:.05)*Math.sin(q*7+seed):1}),{at:[0,k.top(R,0)-b*2+(filled?.02:-.04),0],color:icing,gloss:.7,whole:false,paint:stripe?toward(stripe,(P,N,L)=>smooth(.75,.9,Math.abs(Math.sin(L.x*1.6+L.z*.5)))):mottle(.04,1.4)});
      if(sprinkles)k.sprinkle('seed',44,{r:R+a*.7,color:[0xe94a6a,0x4a9ae9,0xf3d32a,0x4ac96a,0xfdfbf6,0xe98a2a],size:.42,stretch:1.5,onFood:k.top(R,0)-.3,gloss:.5});
    }
  },{tilt});
}
function croissant(k,x,z,yaw,{s=1,color=0xd9a04a}={}){
  const pts=Array.from({length:11},(_,i)=>{const a=(i/10-.5)*2.5;return [Math.sin(a)*5.6*s,0,(1-Math.cos(a))*4.2*s-1.6*s];});
  k.at(x,z,yaw,()=>k.drop(tube(pts,2.3*s,{sides:12,ry:1.9*s,taper:t=>(.28+.72*Math.sin(t*Math.PI))*(1+.07*(1-2*Math.abs((t*7)%1-.5))),steps:42}),0,0,{color,gloss:.45,inside:0xf3e2b0,whole:false,paint:[browned(0x8f4f1a,.7,.8),pale(0xf1d79a,.6),mottle(.08,1.6)]}));
}
function wedge(k,x,z,yaw,{r=11,angle=.8,layers}){
  const pts=[[0,0]];for(let i=0;i<=6;i++){const a=(i/6-.5)*angle;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}
  k.at(x,z,yaw,()=>{for(const [t,color,o={}] of layers)k.drop(puck(pts.map(([a,b])=>[a-r*.55,b]),t,{sharp:true,edge:Math.min(.12,t*.3),n:36,bump:o.bump||0,freq:1.4,dome:o.dome||0}),0,0,{settle:1,color,gloss:o.gloss??.3,inside:o.inside??color,whole:false,paint:o.paint||mottle(.05,1.6)});});
}
function slab(k,x,z,yaw,w,d,layers){k.at(x,z,yaw,()=>{for(const [t,color,o={}] of layers)k.drop(brick(w,t,d,Math.min(.14,t*.3),{n:24,bump:o.bump||0,freq:1.5}),0,0,{settle:1,color,gloss:o.gloss??.3,inside:color,whole:false,paint:o.paint||mottle(.05,1.8)});});}
function berry(k,x,z,{s=1}={}){k.drop(lathe([[0,0],[.5,.1],[1.1,.9],[1.2,1.6],[.8,2.1],[0,2.2]],10),x,z,{scale:s,rot:[.5,k.rand(TAU),0],color:0xc9242e,gloss:.6,paint:spots(0xf3e08a,.14,6,k.rand(9)),whole:true});k.sprinkle('leaf',3,{x,z,r:.4,color:[0x3f8a34],size:.7*s,onFood:1});}
const cherry=(k,x,z)=>{k.drop(blob({r:.9,detail:1,bump:0}),x,z,{color:C.cherry,gloss:.85,whole:true});const y=k.top(x,z);k.add(tube([[x,y-.1,z],[x+.3,y+1.2,z+.2],[x+.9,y+1.9,z+.3]],.06,{sides:4}),{color:0x5a3a1a,gloss:.3,whole:true,cast:false});};
const coneOf=(k,{r=3.1,h=11,color=0xd9a45a}={})=>k.ware(lathe([[.25,0],[r*.5,h*.5],[r,h],[r+.12,h],[r+.12,h+.5],[r-.2,h+.5],[r-.2,h],[.2,.4]],28),{color,gloss:.25,paint:[toward(0x9a6a2a,(P,N,L)=>.55*smooth(.72,.95,Math.max(Math.abs(Math.sin(Math.atan2(L.z,L.x)*5+L.y*1.6)),Math.abs(Math.sin(Math.atan2(L.z,L.x)*5-L.y*1.6))))),mottle(.06,1.5)]});
function clearCup(k,{r0=3.4,r1=4.6,h=10}={}){k.ware(lathe([[0,0],[r0,0],[r1,h],[r1+.1,h+.1],[r1-.1,h],[r0-.1,.2],[0,.2]],28),{color:0xdcecea,opacity:.2,gloss:.95,shade:false});}
const paperCup=(k,{r0=3,r1=4.3,h=7,color=W.PAPER,band=null}={})=>{k.ware(lathe([[0,0],[r0,0],[r1,h],[r1+.14,h+.05],[r1+.14,h+.2],[r1-.08,h+.15],[r0-.1,.3],[0,.3]],28),{color,gloss:.25,paint:band?toward(band,(P,N,L)=>N.x*L.x+N.z*L.z>0&&N.y<.5?smooth(.2,.24,L.y/h)*smooth(.8,.76,L.y/h)*(.5+.5*Math.sign(Math.sin(Math.atan2(L.z,L.x)*8))):0):null});return {r0,r1,h};};
export const sweets={
  // ---- bakery ----
  croissant:k=>{small(k,9,[0xd9a04a,0xf3e2b0]);croissant(k,0,0,.3);k.biteAngle=.3;k.biteAt=1.4;},
  muffin:k=>{small(k,8,[0xc9903e,0xf3e2b0]);
    k.ware(lathe([[0,0],[2.6,0],[3.4,3.6],[3.3,3.6],[2.5,.2],[0,.2]],24,{wave:a=>1+.03*Math.sin(a*12)}),{color:0xf1e8d6,gloss:.2});
    k.add(lathe([[3.3,3.4],[4.3,4],[4.5,4.9],[3.9,6],[2.4,6.9],[0,7.2]],26,{bump:.09,freq:.7,seed:3}),{color:0xd9a85a,gloss:.3,inside:0xf3e2b0,whole:false,paint:[browned(0x9a5a1e,.6,1),spots(C.blueberry,.16,1.7,4),mottle(.08,1.6)]});
    k.add(lathe([[0,.2],[2.5,.2],[3.2,3.5],[0,3.5]],18),{color:0xe9c88a,gloss:.2,whole:false});sugar(k,0,0,3.4,40,6);k.biteAngle=.2;k.biteAt=1;},
  cookie:k=>{small(k,8,[0xc9903e,C.chocolate]);
    k.drop(puck(F.wobble(4.6,16,.05,2),1,{edge:.45,dome:.25,bump:.3,freq:1.1,seed:2,n:32}),0,0,{color:0xc9903e,gloss:.3,inside:0xe6c48a,whole:false,paint:[outward(0x9a6424,3.4,4.6,.6),mottle(.1,2)]});
    for(let i=0;i<12;i++){const [x,z]=k.spot(0,0,3.8);k.drop(blob({r:[.6,.45,.6],bump:.2,detail:1,flat:.3}),x,z,{lift:-.2,color:C.chocolate,gloss:.5,whole:true});}k.biteAngle=.3;k.biteAt=1.6;},
  'bw-cookie':k=>{small(k,8.5,[0xe9d9a8,C.chocolate]);
    k.drop(lathe([[0,0],[4.4,0],[5.1,.5],[4.9,1.1],[3.6,1.4],[0,1.5]],30),0,0,{color:0xe9d39a,gloss:.3,inside:0xf3e6b8,whole:false,paint:mottle(.05,1.5)});
    for(let i=0;i<2;i++){const half=Array.from({length:13},(_,j)=>{const a=Math.PI*j/12+i*Math.PI+.3;return [Math.cos(a)*4.75,Math.sin(a)*4.75];});
      k.add(puck(half,.18,{sharp:true,edge:.07,n:30}),{at:[0,.02,0],drape:.6,color:i?0xfaf6ec:0x3a241a,gloss:.72,whole:false});}k.biteAngle=.3;k.biteAt=1.8;},
  rugelach:k=>{small(k,9,[0xc9903e,0x5a3220]);const n=count(k,4,2);
    for(let i=0;i<n;i++){const a=i*TAU/4+.5;k.at(Math.cos(a)*3.4,Math.sin(a)*3.2,-a,()=>k.drop(tube([[-2.4,0,0],[0,0,.7],[2.4,0,0]],1.2,{sides:10,ry:1,taper:t=>(.45+.55*Math.sin(t*Math.PI))*(1+.1*(1-2*Math.abs((t*5)%1-.5))),steps:24}),0,0,{color:0xcf9a4a,gloss:.4,inside:0x5a3220,whole:true,paint:[browned(0x8f4f1a,.6,1),spots(0x4a2416,.16,2.4,i),mottle(.08,2)]}));}
    if(k.level)sugar(k,0,0,5,70,.9);k.cut=false;},
  'butter-roll':k=>{if(!k.takeaway)W.plate(k,9);else W.deliPaper(k,17,15,{yaw:.3});W.leavings(k,{crumbs:[C.bun,C.crumb]});F.bunBottom(k,0,0,{r:4.8,h:1.5});
    if(k.level)k.add(lathe([[4.4,0],[3,.12],[1.4,.14],[0,.14]],24),{at:[0,k.top(0,0)+.02,0],color:0xf6dc7a,gloss:.8,whole:false,cast:false,paint:mottle(.1,1.4)});
    F.bunTop(k,.4,-.4,{r:4.8,seeds:'poppy',kaiser:true,tilt:-.14});k.biteAngle=.2;k.biteAt=1.2;},
  rye:k=>{W.deliPaper(k,25,15,{color:0xe9dcc0,yaw:.1});W.leavings(k,{crumbs:[C.rye,C.ryeCrumb]});
    k.at(0,0,.15,()=>{k.drop(blob({r:[10,4.6,5.6],bump:.05,freq:.3,seed:2,detail:3,flat:.18}),0,0,{color:0x8f5e30,gloss:.25,inside:C.ryeCrumb,whole:false,paint:[browned(0x5a3418,.5,.6),spots(0xe9dcc0,.14,1.6,3),mottle(.1,1.2)]});
      for(let i=-2;i<=2;i++)k.drizzle([[i*3.2-1.2,-2.6],[i*3.2+1.2,2.6]],.42,0xd9b98a,{gloss:.15,ry:.08});k.sprinkle('seed',40,{r:8,color:[0x4a3220],size:.36,onFood:4});});k.biteAngle=-.15;k.biteAt=2.5;},
  challah:k=>{W.deliPaper(k,27,15,{color:0xe9dcc0,yaw:.1});W.leavings(k,{crumbs:[0xc98a34,C.crumb]});
    k.at(0,0,.12,()=>{for(let s=0;s<3;s++){const pts=Array.from({length:25},(_,i)=>{const t=i/24,a=t*TAU*2.5+s*TAU/3,env=Math.sin(t*Math.PI)**.6;return [(t-.5)*21,2.2+Math.cos(a)*1.3*env,Math.sin(a)*2.6*env];});
      k.add(tube(pts,2.3,{sides:9,ry:2,taper:t=>.35+.65*Math.sin(t*Math.PI)**.5,curve:false}),{color:0xc98a34,gloss:.7,inside:0xf3e2a8,whole:false,paint:[browned(0x7a3e12,.75,.7),pale(0xe9c88a,.7),mottle(.07,1.2)]});}
      k.sprinkle('seed',70,{r:9,color:[0xf3e3b8,0xe9d39c],size:.42,onFood:3.4});});k.biteAngle=-.12;k.biteAt=3;},
  babka:k=>{W.deliPaper(k,22,14,{color:0xe9dcc0,yaw:.1});W.leavings(k,{crumbs:[0xc98a34,C.chocolate]});
    k.at(0,0,.2,()=>{k.drop(brick(16,6.4,7.4,1.3,{n:36,bump:.12,freq:.5}),0,0,{color:0xc98a34,gloss:.55,inside:0xe9c88a,whole:false,paint:[spots(0x3a2014,.42,.55,3),browned(0x7a3e12,.5,.7),mottle(.07,1.3)]});
      k.sprinkle('cube',60,{r:6.6,color:[0xe6c48a,0xd9a85a],size:.34,onFood:5.4});});k.biteAngle=-.2;k.biteAt=2;},
  pie:k=>{small(k,10,[0xc98a45,0xa8521e],0x9a3a1a);
    wedge(k,-1.4,0,.5,{r:12,angle:.85,layers:[[.5,0xc98a45,{paint:[browned(0x8a5a22,.4,1),mottle(.08,2)]}],[2.3,0xb0622a,{inside:0xc9862e,gloss:.6,bump:.1,paint:[spots(0xe0a84a,.34,1.2,3),mottle(.14,2)]}],[.55,0xdbac68,{bump:.2,dome:.15,gloss:.35,paint:[browned(0x9a5a22,.7,1.1),spots(0xf1d79a,.2,2.4,2),mottle(.08,2)]}]]});
    if(k.level){k.at(-1.4,0,.5,()=>k.add(tube(Array.from({length:7},(_,i)=>{const a=(i/6-.5)*.85;return [Math.cos(a)*11.8-12*.55,1.9,Math.sin(a)*11.8];}),.8,{sides:7,ry:1.7,taper:t=>1+.12*Math.sin(t*50)}),{at:[0,k.top(-6,0)-3.4,0],color:0xc98a45,gloss:.3,paint:[browned(0x8a5a22,.6,1),mottle(.1,2)],whole:false}));sugar(k,-1.4,0,4.6,40,3);}
    k.biteAngle=2.2;k.biteAt=2.2;},
  cheesecake:k=>{small(k,9.5,[C.graham,0xf3e6c0],0xb01f2c);
    wedge(k,-1.2,0,.5,{r:11.5,angle:.72,layers:[[.6,C.graham,{bump:.1,paint:mottle(.12,3)}],[3.6,0xf6ecc8,{gloss:.4,paint:[upward(0xe6c88a,3.3,3.6,.6),mottle(.03,1.4)]}],[.22,0xb01f2c,{gloss:.85,bump:.1}]]});
    if(k.level===2)berry(k,-1.6,0,{s:1.1});k.biteAngle=2.2;k.biteAt=2.4;},
  cannoli:k=>{small(k,9.5,[0xc98a3e],0xf6f1e4);const n=count(k,2,1);
    for(let i=0;i<n;i++)k.at(-.6+i*1.2,-2+i*4,.3-i*.5,()=>{
      k.drop(tube([[-4.4,0,0],[0,0,0],[4.4,0,0]],1.7,{sides:12,caps:false,curve:false,steps:6,section:(a,t)=>1+.04*Math.sin(a*TAU*7+t*8)}),0,0,{color:0xb9742e,gloss:.3,inside:0xf6f1e4,whole:false,paint:[spots(0x7a4416,.3,1.8,i),spots(0xe0aa5a,.25,3,i+3),mottle(.12,2.4)]});
      for(const s of [-1,1]){k.add(blob({r:[1,1.45,1.45],bump:.12,detail:2}),{at:[s*4.3,k.top(0,0)-1.7,0],color:0xfaf6ea,gloss:.4,whole:false});k.sprinkle('cube',9,{x:s*4.9,z:0,r:1,color:[C.chocolate,0x7aa63a],size:.3,onFood:1});}
    });if(k.level)sugar(k,0,0,5.6,70,1.2);k.biteAngle=.3;k.biteAt=.8;},
  cupcake:k=>{small(k,8,[0xf3e2b0,C.pink]);
    k.ware(lathe([[0,0],[2.5,0],[3.3,3.4],[3.2,3.4],[2.4,.2],[0,.2]],24,{wave:a=>1+.035*Math.sin(a*14)}),{color:0xe94a6a,gloss:.25});
    k.add(lathe([[0,.2],[2.4,.2],[3.15,3.3],[3.3,3.9],[2,4.3],[0,4.4]],20),{color:0xe9c88a,gloss:.2,inside:0xf3e2b0,whole:false});
    F.swirl(k,0,0,{r:2.9,h:3.4,turns:2.6,thick:1.05,color:C.pink,lift:-.2});if(k.level===2){k.sprinkle('seed',26,{r:2.6,color:[0xfdfbf6,0xf3d32a,0x4a9ae9],size:.36,onFood:4.6});cherry(k,0,0);}k.biteAngle=.2;k.biteAt=1;},
  baklava:k=>{small(k,9.5,[0xd9a44a,0x7aa63a],0xc98a2a);F.puddle(k,0,0,5,0xd9982a,{h:.08,gloss:.9});const n=count(k,3,1);
    for(let i=0;i<n;i++)k.at(-3+i*3,-.6+i*.8,.5+i*.2,()=>{
      for(let j=0;j<5;j++)k.drop(puck([[-3,0],[0,-1.9],[3,0],[0,1.9]],.42,{sharp:true,edge:.08,n:20,bump:j===4?.25:.05,freq:1.6}),0,0,{settle:1,color:j%2?0xd9a44a:0xb9782e,gloss:.6,whole:true,paint:mottle(.1,2.4)});
      k.sprinkle('cube',14,{r:1.2,color:[0x7aa63a,0x9ab84a,0x5a8a2a],size:.3,onFood:1.6});
    });k.cut=false;},
  // ---- doughnuts ----
  doughnut:k=>{small(k,8,[0xc98a3a,0xf3e2b4]);doughnut(k,0,0,{icing:0xf3ead2});k.biteAngle=.3;k.biteAt=1.4;},
  'doughnut-chocolate':k=>{small(k,8,[0xc98a3a,0x4a2c1e]);doughnut(k,0,0,{icing:0x4a2a1c});k.biteAngle=.3;k.biteAt=1.4;},
  'doughnut-sprinkle':k=>{small(k,8,[0xc98a3a,C.pink]);doughnut(k,0,0,{icing:0xf08aa6,sprinkles:true});k.biteAngle=.3;k.biteAt=1.4;},
  'doughnut-jelly':k=>{small(k,8,[0xc98a3a,0xb01f2c]);doughnut(k,0,0,{filled:true,glaze:false,powder:true,inside:0xa81a2a});
    if(k.level===2)k.add(blob({r:[.8,.5,.8],bump:.2,detail:1}),{at:[4.7,1.7,0],color:0xa81a2a,gloss:.85,whole:true});k.biteAngle=0;k.biteAt=1.4;},
  'boston-cream':k=>{small(k,8,[0xc98a3a,0x4a2c1e]);doughnut(k,0,0,{filled:true,icing:0x3e2418});k.biteAngle=.3;k.biteAt=1.4;},
  'doughnut-box':k=>{W.tray(k,23,16,4.6,{color:0xf0b6c0,gloss:.3,flare:.03,corner:.6});
    k.ware(sheet((u,v)=>[(u-.5)*23,4.7+v*14.5*.42,-8-v*14.5*.9],6,6),{color:0xf0b6c0,gloss:.3});
    const n=count(k,6,3),kinds=[{icing:0xf3ead2},{icing:0x4a2a1c},{icing:0xf08aa6,sprinkles:true},{icing:0xf3ead2,stripe:0x4a2a1c},{icing:0xf3d98a},{icing:0x4a2a1c,sprinkles:true}];
    for(let i=0;i<n;i++)doughnut(k,(i%3-1)*7,(Math.floor(i/3)-.5)*7.2,{R:2.2,a:1.25,b:1.05,...kinds[i]});
    if(!k.level)k.sprinkle('shard',20,{r:6,color:[0xc98a3a,0xf3ead2],size:.3,ware:true,flat:true});k.cut=false;},
  // ---- dessert ----
  flan:k=>{small(k,9,[0xf3d98a],0xa85a12);F.puddle(k,0,0,5.6,0xb8641a,{h:.1,gloss:.92});
    k.drop(lathe([[0,0],[4.2,0],[4.3,.3],[3.3,3.2],[3,3.4],[0,3.4]],28),0,0,{color:0xf3d98a,gloss:.75,inside:0xf6e6a8,whole:false,paint:[toward(0x9a4a0e,(P,N,L)=>smooth(2.6,3.3,L.y)*(N.y>.3?1:.6)),mottle(.03,1.4)]});k.biteAngle=.3;k.biteAt=1;},
  tiramisu:k=>{small(k,9,[C.cocoa,0xf6ecd2],0xf6ecd2);
    slab(k,0,0,.3,7.6,7.6,[[.9,0xb98a5a,{bump:.06}],[1.1,0xf6ecd2,{gloss:.4}],[.8,0x9a6a40,{bump:.06}],[1.2,0xf6ecd2,{gloss:.4}],[.14,C.cocoa,{bump:.4,gloss:.1,paint:mottle(.2,3)}]]);k.biteAngle=.3;k.biteAt=.8;},
  'creme-brulee':k=>{k.ware(lathe([[0,0],[5,0],[5.6,3],[5.3,3],[4.8,.5],[0,.5]],32,{wave:a=>1+.02*Math.sin(a*18)}),{color:W.CHINA,gloss:.7});k.cut=false;
    if(!k.level){k.ware(lathe([[4.7,.6],[2,.62],[0,.62]],20),{color:0xf3dc9a,gloss:.5,cast:false});return;}
    if(k.level===2)k.add(lathe([[5.2,2.6],[4.6,2.64],[4,2.66],[3.3,2.68],[2.6,2.7],[1.9,2.7],[1.2,2.68],[.6,2.7],[0,2.7]],32),{color:0xd9982a,gloss:.92,whole:true,paint:[spots(0x6a2e08,.4,1.1,2),spots(0xf3d98a,.2,1.7,6),mottle(.1,2)]});
    else{k.add(lathe([[5,1.5],[2.4,1.55],[0,1.55]],28),{color:0xf6e6a8,gloss:.5,whole:true});for(let i=0;i<6;i++){const [x,z]=k.spot(0,0,3.6);k.add(F.bitOf('shard'),{at:[x,1.7,z],rot:[k.rand(.5),k.rand(TAU),k.rand(.5)],scale:1.8,color:0xc9862a,gloss:.9,whole:true});}}},
  crepe:k=>{small(k,11,[0xe9c88a],C.chocolate);
    k.at(-.6,.4,.4,()=>{for(let i=0;i<2;i++)k.add(puck([[-7,-5.4],[7.4,0],[-7,5.4],[-8,0]],.26,{edge:.1,dome:.1,bump:.5,freq:.5,seed:i,n:36}),{at:[0,.05+i*.5,i*.6],rot:[0,i*.25,0],drape:.6,color:0xf0d9a2,gloss:.3,inside:0xf6e6b8,whole:false,paint:[spots(0xb9772a,.34,.9,i+2),mottle(.06,1.4)]});});
    if(k.level){k.drizzle([[-6,-3],[-3,2.6],[0,-2.4],[3,1.8],[5.6,-.6]],.2,C.chocolate,{gloss:.85});for(let i=0;i<count(k,3,1);i++)berry(k,4+i*1.4,4.4-i*1.6,{s:.8});F.dollop(k,-5.4,4.6,{r:1.7,h:1.3,color:0xfaf6ee,bump:.2});sugar(k,-.6,.4,6,60,.4);}k.biteAngle=.4;k.biteAt=1;},
  strudel:k=>{small(k,10,[0xd9a85a,0xe9d08a],0xf6f1e4);
    k.at(-1.6,0,.3,()=>{k.drop(tube([[-4.4,0,0],[0,0,0],[4.4,0,0]],3,{sides:14,ry:2.1,curve:false,steps:6,section:(a,t)=>1+.05*Math.sin(a*TAU*5+t*4)}),0,0,{color:0xd9a85a,gloss:.4,inside:0xd9b86a,whole:false,paint:[browned(0x9a5a1e,.6,1),spots(0xf1dc9a,.25,2.6,2),mottle(.1,2)]});});
    if(k.level){sugar(k,-1.6,0,4.6,90,2.6);F.swirl(k,5.6,2.4,{r:1.7,h:1.8,turns:2,thick:.7,color:0xfaf6ee});}k.biteAngle=-.3;k.biteAt=0;},
  'gulab-jamun':k=>{const d=W.bowl(k,6,3.6,{color:0xb4b9bd});k.cut=false;if(!k.level){W.fill(k,d,.08,0xc9862a,{ware:true});return;}
    const y=W.fill(k,d,.34,0xd9982a,{gloss:.92});for(let i=0;i<count(k,3,1);i++){const a=i*TAU/3+.4;k.add(blob({r:1.75,bump:.03,detail:2}),{at:[Math.cos(a)*2,y+1.1,Math.sin(a)*2],color:0x7a3410,gloss:.85,paint:mottle(.14,2),whole:true});}
    if(k.level===2)k.sprinkle('cube',14,{r:2.6,color:[0x7aa63a,0xf6e6c0],size:.26,onFood:2.6});},
  'mango-sticky-rice':k=>{small(k,10.5,[C.rice,0xf2b03a],0xf6f1e4);if(!k.level)return;
    F.riceMound(k,-3.4,.4,{r:3.8,rz:4.6,h:1.65,color:0xf6efdf,short:true});F.sesame(k,-3.4,.4,26,{r:3,onFood:1.6,color:[0xe9d39c,0x2a2a30]});
    for(let i=0;i<count(k,6,3);i++)k.at(2.2+i*1.15,-.4+i*.2,.2,()=>k.drop(puck([[-.6,-3.6],[.6,-3.4],[.9,0],[.6,3.4],[-.6,3.6],[-.9,0]],1.3,{edge:.4,n:20}),0,0,{rot:[0,0,-.5],color:0xf2a82a,gloss:.6,whole:true,paint:mottle(.05,1.6)}));k.cut=false;},
  mochi:k=>{small(k,9,[0xf6f1e4]);const n=count(k,3,1),cols=[0xf3b8c4,0xc9dcA0,0xf1e2b0];
    for(let i=0;i<n;i++){const a=i*TAU/3+.5;k.drop(blob({r:[2.5,1.9,2.5],bump:.03,freq:.6,seed:i,detail:3,flat:.2}),Math.cos(a)*3.1,Math.sin(a)*3.1,{color:cols[i],gloss:.2,inside:0xf6ecd8,whole:true,paint:[toward(0xfdfbf6,(P,N)=>.5*smooth(.2,1,N.y)),mottle(.03,2)]});}k.cut=false;},
  'banana-pudding':k=>{clearCup(k,{r0:3.6,r1:4.6,h:8.4});k.cut=false;if(!k.level)return;
    const h=k.level===2?7.6:3.6;k.add(lathe([[0,.25],[3.5,.25],[3.5+h*.12,h],[2,h+.1],[0,h+.1]],26),{color:0xf3e2a0,gloss:.45,whole:true,paint:[toward(0xd9b06a,(P,N,L)=>.7*smooth(.75,.95,Math.abs(Math.sin(L.y*1.6+.4)))),mottle(.04,1.4)]});
    if(k.level===2){F.swirl(k,0,0,{r:3.4,h:2,turns:2.2,thick:1,color:0xfaf6ee});for(let i=0;i<3;i++)k.add(puck(circle(1.5,10),.35,{edge:.12,n:14}),{at:[Math.cos(i*2.1)*2.6,8.6,Math.sin(i*2.1)*2.6],rot:[.8,i*2.1,0],color:0xd9a85a,gloss:.3,whole:true,paint:outward(0xb9843a,1,1.5,.5)});}},
  churros:k=>{W.deliPaper(k,22,15,{yaw:.2});W.leavings(k,{crumbs:[0xc98a34],smear:C.chocolate});const n=count(k,4,2);
    for(let i=0;i<n;i++)k.at(-2.6+k.rand(-.4,.4),(i-1.5)*2.1,.15+k.rand(-.12,.12),()=>k.drop(tube([[-6,0,0],[0,0,.3],[6,0,0]],.95,{sides:10,section:a=>1+.16*Math.cos(a*TAU*5),steps:10}),0,0,{color:0xc98a34,gloss:.25,inside:0xe9c88a,whole:false,paint:[mottle(.14,2.4),spots(0x9a5e1e,.25,1.8,i)]}));
    if(k.level)sugar(k,-2.6,0,6.4,140,.8);W.ramekin(k,7,3.4,C.chocolate,{r:2.2,full:k.level===2?1:.4});k.biteAngle=-.15;k.biteAt=0;},
  // ---- frozen ----
  cone:k=>{coneOf(k);k.cut=false;if(!k.level)return;
    if(k.level===2){k.add(lathe([[2.85,10.7],[1.4,10.8],[0,10.8]],16),{color:C.strawberry,gloss:.4,whole:true});F.scoop(k,0,0,{r:3.4,color:C.strawberry,dark:0xd9607a,lift:-.5});}else k.add(lathe([[2.9,11.2],[1.6,11.7],[0,11.8]],20,{bump:.05}),{color:C.strawberry,gloss:.5,whole:true});},
  'soft-serve':k=>{k.ware(lathe([[0,0],[2.2,0],[2.4,4.4],[3.4,5.4],[3.6,8],[3.3,8],[3.2,5.6],[2.2,4.6],[0,4.6]],24,{wave:(a,j)=>j<3?1+.02*Math.sin(a*12):1}),{color:0xe3bd7a,gloss:.2,paint:[toward(0xb98a44,(P,N,L)=>.5*smooth(.8,.95,Math.abs(Math.sin(L.y*4)))*(L.y>5?1:0)),mottle(.05,1.5)]});k.cut=false;
    if(!k.level)return;F.swirl(k,0,0,{r:3,h:k.level===2?7.6:2.4,turns:k.level===2?3.6:1.4,thick:1.5,color:C.vanilla,lift:8-k.top(0,0)});},
  sundae:k=>{if(k.takeaway)paperCup(k,{r0:3.8,r1:6.2,h:9.4});else k.ware(lathe([[0,0],[3.4,0],[3.4,.25],[.8,.8],[.6,2.2],[1.4,3],[5,5.6],[6.2,9.4],[6.3,9.6],[6.05,9.6],[4.8,5.9],[1,3.5],[0,3.5]],32),{color:0xdcecea,opacity:.24,gloss:.95,shade:false});k.cut=false;
    if(!k.level){k.ware(lathe([[1.6,3.6],[0,3.6]],12),{color:0x6a4028,gloss:.6,cast:false});return;}
    k.add(lathe([[0,3.55],[1,3.55],[4.7,5.9],[5.3,7.2],[0,7.2]],26),{color:C.vanilla,gloss:.4,whole:true,paint:[spots(0x4a2a1c,.25,.8,2),mottle(.06,1.5)]});if(k.level===1)return;
    for(const [x,z,c] of [[-2.2,-.6,C.vanilla],[2.2,.8,C.chocolate]])k.add(blob({r:[3,2.7,3],bump:.08,freq:.9,seed:x,detail:3}),{at:[x,8.6,z],color:c,gloss:.45,whole:true,paint:mottle(.07,1.6)});
    F.coat(k,0,0,3.6,0x3e2418,{thick:.14,amp:.5,gloss:.85});F.swirl(k,0,0,{r:2.2,h:2.4,turns:2.2,thick:.9,color:0xfaf6ee});cherry(k,0,0);k.sprinkle('seed',20,{r:4,color:[0xe94a6a,0x4a9ae9,0xf3d32a,0x4ac96a],size:.36,stretch:1.5,onFood:9});},
  'ice-cream-cup':k=>{paperCup(k,{r0:3.4,r1:4.8,h:5.6,color:0xf3ead6,band:0x4a9ab8});k.cut=false;if(!k.level)return;
    k.add(lathe([[0,.3],[3.3,.3],[4.6,5.2],[0,5.2]],22),{color:C.pistachio,gloss:.4,whole:true});
    if(k.level===2){k.add(blob({r:[3.2,2.9,3.2],bump:.08,detail:3}),{at:[-1.6,7,0],color:C.pistachio,gloss:.45,whole:true,paint:[spots(0x7aa63a,.12,2.6,1),mottle(.07,1.6)]});k.add(blob({r:[3,2.7,3],bump:.08,detail:3}),{at:[2,7.4,.6],color:C.chocolate,gloss:.45,whole:true,paint:mottle(.08,1.6)});}
    k.ware(tube([[1,5,-2],[2.6,9.6,-3.2],[3,11,-3.4]],.5,{sides:6,ry:.12,taper:t=>t<.3?1.6:.8}),{color:0xf3a6b8,gloss:.5,cast:false});},
  'banana-split':k=>{if(k.takeaway)W.carton(k,26,11,3.8);else k.ware(W.basin(circle(13,40,5.2),[[0,0],[.5,0],[.56,.5],[.98,3.6],[1,3.8],[.96,3.8],[.52,.9],[0,.9]]),{color:0xdcecea,opacity:.26,gloss:.95,shade:false});k.cut=false;if(!k.level)return;
    for(const s of [-1,1])k.add(tube([[-10,1.6,s*2.6],[0,1.2,s*3.4],[10,1.6,s*2.6]],1.5,{sides:10,taper:t=>.5+.5*Math.sin(t*Math.PI)**.4}),{color:0xf6e6a8,gloss:.35,whole:true,paint:mottle(.04,1.5)});
    const cols=[C.vanilla,C.chocolate,C.strawberry],n=count(k,3,1);
    for(let i=0;i<n;i++){const x=(i-1)*5.6;k.add(blob({r:[2.9,2.6,2.9],bump:.08,freq:.9,seed:i,detail:3}),{at:[x,3.4,0],color:cols[i],gloss:.45,whole:true,paint:mottle(.07,1.6)});
      if(k.level===2){k.add(puck(F.wobble(2.2,12,.3,i),.14,{edge:.06,n:20}),{at:[x,.02,0],drape:1.6,color:[0x3e2418,0xc9862a,0xb01f2c][i],gloss:.85,whole:true,cast:false});F.swirl(k,x,0,{r:1.5,h:1.5,turns:1.8,thick:.7,color:0xfaf6ee});cherry(k,x,0);}}},
  'ice-cream-sandwich':k=>{if(!k.takeaway)W.plate(k,9);else W.deliPaper(k,14,11,{yaw:.2});W.leavings(k,{crumbs:[C.chocolate]});
    slab(k,0,0,.25,10.4,4.6,[[.7,0x2e1c14,{bump:.05,paint:spots(0x1a0e0a,.14,3,2)}],[2,C.vanilla,{gloss:.4}],[.7,0x2e1c14,{bump:.05,paint:spots(0x1a0e0a,.14,3,5)}]]);k.biteAngle=-.25;k.biteAt=1.4;},
  'italian-ice':k=>{paperCup(k,{r0:2.2,r1:4.2,h:7.4,color:0xf6f1e6,band:0xc9382c});k.cut=false;if(!k.level)return;
    const y=k.level===2?7.2:3.6,r=2.2+2*y/7.4-.1;
    k.add(lathe([[r,y],[r*.94,y+(k.level===2?1.2:.1)],[r*.7,y+(k.level===2?2.3:.2)],[r*.4,y+(k.level===2?2.9:.25)],[0,y+(k.level===2?3.1:.25)]],26,{bump:.05,freq:1.5}),{color:0xd9242e,gloss:.6,whole:true,paint:[toward(0x2a6ac9,(P,N,L)=>smooth(-.4,.4,Math.sin(Math.atan2(L.z,L.x)*1.5))),mottle(.1,3)]});},
  // ---- fruit ----
  banana,oranges:orangeBag,
  fruit:k=>{k.cut=false;
    if(k.level){k.add(lathe([[0,.5],[1.4,0],[2.9,.6],[3.6,2.6],[3.5,4.6],[2.6,6.2],[1.2,6.6],[.3,6.2],[0,6.1]],28,{bump:.03,freq:.6,seed:2,wave:k.level===1?a=>1-.36*smooth(.55,1,Math.cos(a-.6)):null}),{color:0xb8281e,gloss:.7,whole:true,paint:[toward(0xe6c84a,(P,N,L)=>.5*smooth(.3,.8,fbm(L.x*.5,L.y*.3,L.z*.5)+.5)),k.level===1?toward(0xf6ecc8,(P,N,L)=>smooth(.75,.95,Math.cos(Math.atan2(L.z,L.x)-.6))*smooth(1,2,L.y)*smooth(6,5,L.y)):null,mottle(.06,2)].filter(Boolean)});
      k.add(tube([[0,6.1,0],[.2,7,0],[.6,7.6,.1]],.12,{sides:5}),{color:0x5a3a1a,gloss:.3,whole:true});return;}
    k.ware(lathe([[0,.2],[1.2,0],[1.6,.6],[.6,1.8],[.5,4.6],[1.4,5.9],[1,6.4],[0,6.2]],16,{bump:.06,freq:1.2}),{color:0xf1e2b0,gloss:.3,paint:[toward(0xb8281e,(P,N,L)=>smooth(1,.4,L.y)+smooth(5.6,6.2,L.y)),spots(0xc9a05a,.25,2,2)]});
    k.ware(tube([[0,6.2,0],[.2,7,0],[.6,7.6,.1]],.12,{sides:5}),{color:0x5a3a1a,gloss:.3});},
  'cut-fruit':k=>{clearCup(k,{r0:3.6,r1:4.9,h:9});k.cut=false;if(!k.level)return;
    const cols=[0xf2a82a,0xe9505a,0x8fc45a,0xf6e08a,0xf08a3a],n=count(k,26,10);
    for(let i=0;i<n;i++){const y=.8+(i/n)*(k.level===2?8.4:3.6),r=(3.4+1.2*y/9)-1.2,a=i*2.4;k.add(brick(1.7,1.5,1.7,.25,{n:12}),{at:[Math.cos(a)*r*Math.sqrt(k.rand(.2,1)),y,Math.sin(a)*r*Math.sqrt(k.rand(.2,1))],rot:[k.rand(TAU),k.rand(TAU),0],color:cols[i%5],gloss:.6,whole:true});}
    k.ware(tube([[1,3,1],[2.4,11,2],[2.8,13,2.2]],.34,{sides:6,ry:.1}),{color:0xf6f1e6,gloss:.5,cast:false});},
  'mango-cup':k=>{clearCup(k,{r0:3.6,r1:4.8,h:10});k.cut=false;if(!k.level)return;
    const n=count(k,7,3);for(let i=0;i<n;i++){const a=i*TAU/7,r=i?2.4:0;k.add(tube([[Math.cos(a)*r*.6,.6,Math.sin(a)*r*.6],[Math.cos(a)*r,6,Math.sin(a)*r],[Math.cos(a)*r*1.5,k.level===2?12.4:7,Math.sin(a)*r*1.5]],1.15,{sides:7,ry:.8,taper:t=>1-.5*t}),{color:0xf2a82a,gloss:.6,whole:true,paint:[spots(0xb8301a,.3,2.2,i),mottle(.05,1.6)]});}
    if(k.level===2)W.citrus(k,3.6,0,.5,{rind:C.lime,flesh:0xcfe08a,r:1.6,lift:9.6});k.ware(tube([[0,2,0],[.6,13.6,.4]],.14,{sides:5,curve:false}),{color:0xd9b87a,gloss:.3,cast:false});},
  // ---- out of a wrapper ----
  chips:k=>{k.cut=false;chipBag(k);},
  popcorn:k=>{k.cut=false;const w=8.6,h=13;
    k.ware(W.basin(W.rounded(w,w,.4,1),[[0,0],[.74,0],[1,h],[1.02,h],[.985,h],[.73,.3],[0,.3]]),{color:0xf7f3ea,gloss:.3});
    for(let i=0;i<4;i++)for(const s of [-1.5,-.5,.5,1.5])k.ware(sheet((u,v)=>{const sc=.74+.26*v;return [(s*.25+(u-.5)*.125)*w*sc,.3+v*(h-.3),w*.5*sc+.05];},1,2),{rot:[0,i*TAU/4,0],color:0xc9302a,gloss:.3,cast:false});
    if(!k.level){k.sprinkle('bead',10,{r:2.4,color:[0xf6ecc8,0xe9c84a],size:.7,ware:true,onFood:.1});return;}
    const top=k.level===2?h-.6:h*.45,r=w*.5*(.74+.26*top/h)-.4;
    k.add(puck(W.rounded(r*2,r*2,.5,2),.3,{dome:k.level===2?2.2:.5,bump:.6,freq:1.2,n:28}),{at:[0,top,0],color:0xf3e6b4,gloss:.25,whole:true,paint:mottle(.12,3)});
    for(let i=0;i<(k.level===2?34:14);i++){const [x,z]=k.spot(0,0,r);k.drop(blob({r:[.9,.8,.85],bump:.4,freq:2.2,seed:i,detail:1}),x,z,{lift:-.3,roll:3,within:[0,0,r],settle:.1,rot:[k.rand(TAU),k.rand(TAU),0],color:k.pick([0xf9f2d6,0xf3e6b4,0xf6e08a]),gloss:.25,whole:true});}},
  chocolate:k=>{k.cut=false;const w=6.4,l=14;
    k.ware(sheet((u,v)=>[(u-.5)*(w+.6),.06+.05*Math.sin(u*40+v*9),(v-.5)*(k.level?l*.5:l)-(k.level?l*.25:0)],8,8),{color:0xc9c2b4,gloss:.75});
    if(!k.level){k.ware(sheet((u,v)=>[(u-.5)*(w+.3),.16+.3*Math.abs(Math.sin(v*6)),(v-.5)*l*.7],4,10),{at:[.5,0,.6],rot:[0,.3,0],color:0x8a2a2a,gloss:.5});return;}
    k.ware(brick(w+.4,1.15,l*.5,.15,{n:20}),{at:[0,.08,-l*.25],color:0x8a2a2a,gloss:.5,paint:toward(0xe9c84a,(P,N,L)=>N.y>.5?smooth(.6,.75,Math.abs(Math.sin(L.z*.9)))*smooth(2.4,2,Math.abs(L.x)):0)});
    const rows=k.level===2?4:2;
    for(let j=0;j<rows;j++)for(let i=0;i<3;i++)k.add(puck(W.rounded(1.9,1.7,.3,2),.9,{edge:.3,n:16}),{at:[(i-1)*2.05,.14,.35+j*1.85],color:0x4a2a1c,gloss:.55,whole:true,paint:mottle(.05,2)});},
  pretzel:k=>{if(!k.takeaway)W.plate(k,9);else W.deliPaper(k,17,15,{yaw:.3});W.leavings(k,{crumbs:[0x9a5a1e,0xf7f3ea],n:20});
    const plan=[[2.6,-3.2],[1,-1.2],[-.9,.8],[-3.4,2.9],[-6,1.6],[-6.4,-1.6],[-3.8,-4],[0,-4.7],[3.8,-4],[6.4,-1.6],[6,1.6],[3.4,2.9],[.9,.8],[-1,-1.2],[-2.6,-3.2]];
    const pts=plan.map(([x,z],i)=>[x,1.3+(i<2||i>12?1.5:i===12||i===13?.9:0),-z-.6]);
    k.add(tube(pts,1.3,{sides:10,ry:1.15,steps:60,taper:t=>.72+.28*Math.sin(t*Math.PI)**.4}),{at:[0,k.top(0,0),0],color:0x9a521a,gloss:.6,inside:0xf1e2b8,whole:false,paint:[browned(0x6a3410,.5,.9),spots(0xc9842e,.2,1.4,2),mottle(.08,1.6)]});
    if(k.level)k.sprinkle('cube',70,{r:7,color:[0xfdfbf6],size:.3,onFood:2,gloss:.3});k.biteAngle=.2;k.biteAt=2;},
};
