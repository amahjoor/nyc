// Bowls: soups, noodles and things eaten with a spoon.
import { blob,lathe,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,mottle,toward,browned,pale,spots,outward } from './food-kit.js';
import * as W from './food-ware.js';
import * as F from './food-parts.js';
const C=F.C;

/** A bowl of soup: `top(y)` floats things on a full one. */
function soup(k,{r=8.4,h=5.6,color=W.CHINA,inner=color,band=null,broth,paint=null,top=null,dome=0,gloss=.8,full=.86,sticks=false}){
  const dish=W.bowl(k,r,h,{color,inner,band});
  if(sticks)W.chopsticks(k,1.5,r*.5,.25);
  k.cut=false;
  if(!k.level){W.fill(k,dish,.06,broth,{ware:true,gloss});return dish;}
  const y=W.fill(k,dish,k.level===2?full:full*.48,broth,{paint,gloss,dome:k.level===2?dome:0});
  if(top)top(y,k.level===2?1:.45,dish.width(y));
  return dish;
}
const float=(k,g,x,z,y,o={})=>k.add(g,{at:[x,y,z],rot:[k.rand(-.15,.15),k.rand(TAU),k.rand(-.15,.15)],gloss:.5,whole:true,cast:false,...o});
const oil=(hex=0xf2dc9a,cover=.2)=>[spots(hex,cover,1.6,3),mottle(.08,.6)];
function eggHalf(k,x,z,yaw=0){
  k.at(x,z,yaw,()=>{
    k.drop(blob({r:[1.9,1.2,2.3],bump:.02,flat:.25,detail:2}),0,0,{lift:-.3,color:C.egg,gloss:.6});
    k.drop(blob({r:[1.05,.4,1.25],bump:.02,detail:1}),0,0,{lift:-.25,color:0xf09a1c,gloss:.8});
  });
}
function ramen(k,{broth=C.tonkotsu}={}){
  soup(k,{r:10,h:7.6,color:0x26323a,inner:0xe9e2d2,band:0x8a2a22,broth,paint:oil(),sticks:true,top:(y,share)=>{
    if(share<1){F.noodles(k,0,0,{r:3.4,h:.4,color:0xedd27c,n:6,thick:.24});return;}
    F.noodles(k,-.6,.6,{r:5.2,h:.7,color:0xedd27c,n:14,thick:.24});
    for(const [x,z,a] of [[3.6,-2.6,.4],[5.2,-.4,1.0]])k.drop(puck(circle(2.5,12),.5,{edge:.2,n:20}),x,z,{rot:[.2,a,.12],color:0xb9825e,gloss:.5,paint:[outward(0x6e3a20,2,2.5,.9),toward(0xf0d8bf,(P,N,L)=>.6*smooth(.6,.9,Math.sin(Math.hypot(L.x,L.z)*2.4+Math.atan2(L.z,L.x)))),mottle(.08,2)]});
    eggHalf(k,-3.4,-3.4,.6);
    k.add(sheet((u,v)=>[(u-.5)*5.6,v*6.2,-v*1.6+.25*Math.sin(u*3)],4,4),{at:[-5.6,y-.6,2.6],rot:[0,1.15,0],color:C.nori,gloss:.35,paint:mottle(.2,2.2),cast:false});
    F.scallions(k,1.4,2.8,16,{r:2.2,onFood:y-.1});
    k.drop(puck(circle(1.5,12),.35,{edge:.1,n:16}),.8,-4.6,{color:0xf7f1ea,gloss:.5,paint:toward(0xe9839a,(P,N,L)=>N.y>.5?smooth(.45,.6,Math.hypot(L.x,L.z))*smooth(1.05,.9,Math.hypot(L.x,L.z)):0)});
  }});
}
/** Noodles heaped in a wide bowl or on a plate with what goes over them. */
function pasta(k,{color=C.noodle,sauce=null,over=null,vessel='bowl',thick=.26,n=18,flat=1,r=5.6,smear=C.marinara}){
  if(vessel==='bowl')W.bowl(k,10.4,4,{color:W.CHINA});else W.plate(k,12.5);
  W.leavings(k,{crumbs:[color],smear,r:4.4});
  if(!k.level)return;
  const s=k.level===2?1:.6;
  F.noodles(k,0,0,{r:r*s,h:1.9*s,color,n:Math.round(n*s),thick,flat});
  if(sauce!==null)F.coat(k,0,0,r*.62*s,sauce,{thick:.22,amp:.3});
  if(over)over(s);
  k.cut=false;
}
/** The folded paper pail of a takeout counter. */
function pail(k,{mound,top,rice=false}){
  const w=9.6,h=9.4;
  k.ware(W.basin(W.rounded(w,w,.5,2),[[0,0],[.72,0],[.74,.2],[1,h],[1.01,h],[.985,h],[.73,.35],[.4,.3],[0,.3]]),{color:W.PAPER,gloss:.3,paint:toward(0xb9382c,(P,N,L)=>Math.abs(N.y)<.5&&N.x*L.x+N.z*L.z>0?smooth(.42,.46,L.y/h)*smooth(.66,.62,L.y/h)*(.5+.5*Math.sign(Math.sin(Math.atan2(L.z,L.x)*4+.8)))*.9:0)});
  for(let i=0;i<4;i++)k.ware(sheet((u,v)=>[(u-.5)*w*(1-.12*v),v*3.4,v*1.6],3,3),{at:[Math.sin(i*TAU/4)*w*.5,h,Math.cos(i*TAU/4)*w*.5],rot:[0,i*TAU/4,0],color:W.PAPER,gloss:.3});
  k.ware(tube([[-w*.5,h*.8,0],[-w*.62,h+3,0],[0,h+6.4,0],[w*.62,h+3,0],[w*.5,h*.8,0]],.09,{sides:5,caps:false}),{color:0x9da2a6,gloss:.7,cast:false});
  k.cut=false;
  if(!k.level)return;
  const y=k.level===2?h-1.6:h*.42,r=w*.5*(.73+.27*y/h)-.3;
  if(rice)F.riceMound(k,0,0,{r:r*1.09,h:k.level===2?1.15:.35,y,color:mound,outline:W.rounded(r*2,r*2,.8,2),
    grains:[0xe5bf84,0xdba96a,0xc78951,0xd6a465],flecks:{color:[0x688d39,C.carrot,0xf3d35a,0x8a4a2a,0xc98a7a],size:.57,n:k.level===2?33:15}});
  else k.add(puck(W.rounded(r*2,r*2,.6,2),.3,{dome:k.level===2?1.6:.4,bump:.3,freq:.9,n:28}),{at:[0,y,0],color:mound,gloss:.35,whole:true,paint:mottle(.1,2)});
  top?.(r,k.level===2);
  W.chopsticks(k,0,.6,.5,{length:21});
}

export const bowls={
  ramen:k=>ramen(k),
  pho:k=>soup(k,{r:10,h:7,color:0xe9e2d2,band:0x3a5a8a,broth:0xb9853a,paint:oil(0xe9c47a,.14),gloss:.9,sticks:true,top:(y,share)=>{
    F.noodles(k,0,.4,{r:5.4*share,h:.5,color:C.riceNoodle,n:Math.round(13*share),thick:.3,flat:.4});if(share<1)return;
    for(let i=0;i<5;i++)float(k,sheet((u,v)=>[(u-.5)*4.4,.2*Math.sin(u*5+i),(v-.5)*2.6],5,2),3+Math.cos(i*1.2)*2.2,-2.4+Math.sin(i*1.2)*2,y+.5,{color:i%2?0x9a5a48:0xb8776a,paint:mottle(.14,2)});
    for(let i=0;i<5;i++)float(k,sheet((u,v)=>[(u-.5)*2.6,.15*Math.sin(u*3.1)+.05,(v-.5)*1.5*Math.sin(Math.PI*(.15+.7*u))],5,3),-4+k.rand(-1.4,1.4),-2.6+k.rand(-1.4,1.4),y+.6,{color:0x3f8a34});
    for(let i=0;i<9;i++)float(k,tube([[-1.8,0,0],[0,.2,.3],[1.8,0,0]],.2,{sides:5}),-3.6+k.rand(-1.6,1.6),3+k.rand(-1.4,1.4),y+.5,{color:0xf3ecd8});
    F.scallions(k,1,2.6,14,{r:2.6,onFood:y-.1});W.citrus(k,5.4,3.4,.6,{rind:C.lime,flesh:0xcfe08a,r:1.6,lift:y-1});
    for(let i=0;i<3;i++)float(k,lathe([[0,0],[.7,0],[.7,.25],[0,.25]],10),-.6+i*.9,-4.8,y+.2,{color:0xc9302a});
  }}),
  soup:k=>soup(k,{broth:0xd9b45a,paint:oil(0xf2e09a,.18),gloss:.9,top:(y,share,r)=>{
    for(let i=0;i<Math.round(12*share);i++){const [x,z]=k.spot(0,0,r*.75);float(k,tube([[-1.6,0,0],[0,0,.6],[1.6,0,0]],.2,{sides:5,ry:.12}),x,z,y+.12,{color:0xf1dc9a});}
    for(let i=0;i<Math.round(9*share);i++){const [x,z]=k.spot(0,0,r*.75);float(k,brick(.9,.5,.9,.1,{n:10}),x,z,y,{color:k.pick([C.carrot,0xa9c86a,0xf1e2c0])});}
    if(share===1)F.herbs(k,0,0,12,{r:r*.7,size:.4,onFood:y-.1});
  }}),
  'mushroom-soup':k=>soup(k,{broth:0xc9b08a,paint:[spots(0xe9d9b8,.3,1.1,2),mottle(.08,1.5)],gloss:.55,top:(y,share,r)=>{
    for(let i=0;i<Math.round(6*share);i++){const [x,z]=k.spot(0,0,r*.6);float(k,puck([[-1.4,.2],[-1,-.7],[0,-1],[1,-.7],[1.4,.2],[.4,.3],[.35,1.2],[-.35,1.2],[-.4,.3]],.2,{edge:.06,n:20}),x,z,y+.05,{color:0x9a7a5a,paint:outward(0x6a4a34,.9,1.4,.6)});}
    if(share===1){k.drizzle(Array.from({length:10},(_,i)=>{const a=i*.75;return [Math.cos(a)*(1+i*.3),Math.sin(a)*(1+i*.3)];}),.16,0xf6f1e4,{gloss:.6});F.herbs(k,0,0,10,{r:r*.6,size:.4,onFood:y-.1});}
  }}),
  miso:k=>soup(k,{r:6.6,h:5.4,color:0x23272a,inner:0x8a2a22,broth:C.miso,paint:[spots(0xd9c08a,.35,.7,2),mottle(.08,1)],top:(y,share,r)=>{
    for(let i=0;i<Math.round(6*share);i++){const [x,z]=k.spot(0,0,r*.65);float(k,brick(1,.9,1,.1,{n:10}),x,z,y-.4,{color:C.tofu});}
    for(let i=0;i<Math.round(5*share);i++){const [x,z]=k.spot(0,0,r*.65);float(k,sheet((u,v)=>[(u-.5)*1.8,.1*Math.sin(u*6),(v-.5)*1.2],3,2),x,z,y+.06,{color:0x2a4a2e});}
    F.scallions(k,0,0,Math.round(10*share),{r:r*.6,onFood:y-.1,size:.5});
  }}),
  'wonton-soup':k=>soup(k,{broth:0xd9b86a,band:0x3a5a8a,paint:oil(0xf2e09a,.15),gloss:.9,top:(y,share,r)=>{
    for(let i=0;i<Math.round(5*share);i++){const a=i*TAU/5;k.at(Math.cos(a)*r*.5,Math.sin(a)*r*.5,a,()=>{
      k.add(blob({r:[1.5,1,1.3],bump:.1,detail:2}),{at:[0,-.3,0],color:0xf1e2bc,gloss:.6,paint:toward(0xd9a08a,(P,N,L)=>.4*smooth(.6,0,Math.hypot(L.x,L.z))),whole:true});
      k.add(sheet((u,v)=>[1+v*1.6,.2+.25*Math.sin(u*9),(u-.5)*2.6*(.4+v)],6,2),{color:0xf1e2bc,gloss:.6,whole:true});
    });}
    F.scallions(k,0,0,Math.round(12*share),{r:r*.6,onFood:y-.1,size:.5});
    if(share===1)for(let i=0;i<3;i++)float(k,sheet((u,v)=>[(u-.5)*3.4,.2*Math.sin(u*3),(v-.5)*1.9*Math.sin(Math.PI*(.2+.6*u))],5,3),k.rand(-2,2),k.rand(-2,2),y+.1,{color:0x4f9a3a});
  }}),
  'matzo-ball':k=>soup(k,{broth:0xe3c66a,paint:oil(0xf6e6a0,.2),gloss:.9,top:(y,share,r)=>{
    for(let i=0;i<(share===1?2:1);i++)k.add(blob({r:2.5,bump:.07,freq:.9,seed:i,detail:3}),{at:[i?2.4:-2,y-.4,i?1.2:-.6],color:0xf1e2a8,gloss:.4,paint:[spots(0x6a9a3c,.08,3,i),mottle(.06,2)],whole:true});
    for(let i=0;i<Math.round(8*share);i++){const [x,z]=k.spot(0,0,r*.75);float(k,lathe([[0,0],[.7,0],[.7,.25],[0,.25]],10),x,z,y,{color:C.carrot});}
    if(share===1)for(let i=0;i<8;i++){const [x,z]=k.spot(0,0,r*.7);float(k,tube([[-.9,0,0],[.9,0,.2]],.06,{sides:4,curve:false}),x,z,y+.08,{color:0x4f8a34});}
  }}),
  'onion-soup':k=>{const d=W.bowl(k,6.6,6.4,{color:0x7a3a1e,inner:0xd9c9a8});k.cut=false;
    if(!k.takeaway)for(const s of [-1,1])k.ware(blob({r:[1.3,.8,1.5],bump:0,detail:1}),{at:[s*7,4.4,0],color:0x7a3a1e,gloss:.72});
    if(!k.level){W.fill(k,d,.06,0x6a3a16,{ware:true});return;}
    if(k.level===1){W.fill(k,d,.45,0x6a3a16,{paint:oil(0xb9843a,.25)});F.dollop(k,-1.6,.6,{r:2.4,h:.7,color:0xf1dc9a,paint:spots(0xb9772a,.3,1.6,1)});return;}
    const y=W.fill(k,d,.98,0xf1dc9a,{gloss:.55,dome:.7,paint:[spots(0xa9641e,.42,1.1,2),spots(0x5a2e0c,.14,1.9,5),mottle(.08,2)]});
    void y;},
  chowder:k=>{soup(k,{broth:0xf1ead2,paint:[spots(0xf9f5e6,.3,.9,2),mottle(.05,1.4)],gloss:.5,top:(y,share,r)=>{
      for(let i=0;i<Math.round(9*share);i++){const [x,z]=k.spot(0,0,r*.7);float(k,brick(1,.8,1,.15,{n:10}),x,z,y-.25,{color:k.pick([0xf1e2b4,0xe9d9a0,0xf7ead0])});}
      for(let i=0;i<Math.round(6*share);i++){const [x,z]=k.spot(0,0,r*.7);float(k,blob({r:[.7,.3,.5],detail:1,bump:.1}),x,z,y+.02,{color:0xd9b08a});}
      if(share===1){F.herbs(k,0,0,10,{r:r*.6,size:.4,onFood:y-.1});k.sprinkle('fleck',16,{r:r*.6,color:[0x2a2a2a],size:.2,onFood:y-.1,flat:true});}
    }});
    },
  'tom-yum':k=>soup(k,{color:0xe9e2d2,band:0x8a2a22,broth:0xd9702a,paint:[spots(0xb8301a,.3,1.2,2),spots(0xf2a04a,.2,2,5)],gloss:.9,top:(y,share,r)=>{
    for(let i=0;i<Math.round(4*share);i++)k.at(Math.cos(i*1.6)*r*.45,Math.sin(i*1.6)*r*.45,i*1.6,()=>F.shrimp(k,0,0,0,{s:.95}),{y:-.9});
    for(let i=0;i<Math.round(5*share);i++){const [x,z]=k.spot(0,0,r*.6);float(k,blob({r:[.9,.6,.9],bump:.06,detail:1,flat:.3}),x,z,y+.1,{color:0xd9c9a8});}
    if(share===1){for(let i=0;i<5;i++){const [x,z]=k.spot(0,0,r*.6);float(k,sheet((u,v)=>[(u-.5)*2.6,.15*Math.sin(u*3.1)+.05,(v-.5)*1.5*Math.sin(Math.PI*(.15+.7*u))],5,3),x,z,y+.12,{color:0x3f8a34});}
      for(let i=0;i<3;i++){const [x,z]=k.spot(0,0,r*.6);float(k,tube([[-1.6,0,0],[1.6,0,.3]],.3,{sides:6,curve:false,taper:t=>1-.7*t}),x,z,y+.15,{color:0xc9302a,gloss:.7});}
      W.citrus(k,-4.6,-3.2,.6,{rind:C.lime,flesh:0xcfe08a,r:1.5,lift:y-.9});}
  }}),
  borscht:k=>soup(k,{broth:0x8a1a3a,paint:[spots(0xb02a4a,.3,1.1,2),mottle(.1,1.5)],gloss:.8,top:(y,share,r)=>{
    for(let i=0;i<Math.round(8*share);i++){const [x,z]=k.spot(0,0,r*.7);float(k,brick(1,.6,1,.12,{n:10}),x,z,y-.1,{color:k.pick([0x7a1230,0xa02a4a,0xd9a06a])});}
    if(share===1){k.add(blob({r:[2,.8,1.8],bump:.12,detail:2,flat:.2}),{at:[.4,y+.25,-.2],color:0xfaf5ee,gloss:.5,whole:true,cast:false});for(let i=0;i<8;i++){const [x,z]=k.spot(.4,-.2,2.6);float(k,tube([[-.8,0,0],[.8,0,.2]],.05,{sides:4,curve:false}),x,z,y+.7,{color:0x3f7a34});}}
  }}),
  'kimchi-jjigae':k=>soup(k,{r:7.6,h:5.6,color:0x23272a,inner:0x2e3336,broth:0xc03a1e,paint:[spots(0xe9702a,.28,1.3,2),mottle(.1,1.5)],gloss:.85,top:(y,share,r)=>{
    for(let i=0;i<Math.round(5*share);i++){const [x,z]=k.spot(0,0,r*.6);float(k,brick(1.9,1,1.5,.12,{n:12}),x,z,y-.5,{color:C.tofu,paint:toward(0xe08a5a,(P,N,L)=>smooth(.3,-.3,L.y)*.5)});}
    for(let i=0;i<Math.round(7*share);i++){const [x,z]=k.spot(0,0,r*.65);float(k,sheet((u,v)=>[(u-.5)*2.4,.25*Math.sin(u*6+i),(v-.5)*1.7],4,2),x,z,y+.1,{color:k.pick([0xd9503a,0xe9a06a,0xc9402a])});}
    for(let i=0;i<Math.round(4*share);i++){const [x,z]=k.spot(0,0,r*.6);float(k,sheet((u,v)=>[(u-.5)*2.6,.2*Math.sin(u*5+i),(v-.5)*1.3],4,2),x,z,y+.15,{color:0xb8806a});}
    F.scallions(k,0,0,Math.round(12*share),{r:r*.6,onFood:y-.2});
  }}),
  'green-curry':k=>soup(k,{color:0xe9e2d2,band:0x3a6a4a,broth:C.greenCurry,paint:[spots(0xd9e6a0,.3,1.2,2),spots(0x5a7a34,.14,2,5)],gloss:.8,top:(y,share,r)=>{
    F.chunks(k,0,0,Math.round(6*share),{r:1.15,color:0xe9d9b0,dark:0xc9b08a,cover:.2,spread:r*.5,gloss:.5,lift:-.7});
    for(let i=0;i<Math.round(5*share);i++){const [x,z]=k.spot(0,0,r*.6);float(k,lathe([[0,0],[1.1,0],[1.1,.3],[0,.3]],10),x,z,y,{color:0x6a4a7a,paint:toward(0xe6dcc0,(P,N,L)=>N.y>.5?smooth(1,.7,Math.hypot(L.x,L.z)):0)});}
    if(share===1){for(let i=0;i<5;i++){const [x,z]=k.spot(0,0,r*.6);float(k,sheet((u,v)=>[(u-.5)*2.6,.15*Math.sin(u*3.1)+.05,(v-.5)*1.5*Math.sin(Math.PI*(.15+.7*u))],5,3),x,z,y+.14,{color:0x3f8a34});}
      for(let i=0;i<3;i++){const [x,z]=k.spot(0,0,r*.6);float(k,tube([[-1.6,0,0],[1.6,0,.3]],.3,{sides:6,curve:false,taper:t=>1-.7*t}),x,z,y+.15,{color:0xc9302a,gloss:.7});}}
  }}),
  tikka:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.rice],smear:C.tikka,r:5});if(!k.level)return;
    F.riceMound(k,-4.8,-.6,{r:4.2,rz:5.6,h:2.2,grains:[0xf6f1e2,0xf3ecd8,0xe9c84a]});const b=W.bowl(k,5.8,3.6,{x:4.4,z:.6,color:0xb4b9bd});
    W.fill(k,b,k.level===2?.8:.35,C.tikka,{gloss:.65,dome:.2,paint:[spots(0xe99a5a,.28,1.2,2),mottle(.1,1.6)]});
    F.chunks(k,4.4,.6,k.level===2?6:2,{r:1.2,color:0xd9703a,dark:0x8a3a12,cover:.3,spread:3,gloss:.6,lift:-.5});
    if(k.level===2){k.add(tube([[2.8,2.9,-1],[4.2,3.1,.6],[6,2.9,1.6]],.2,{sides:5,ry:.07}),{color:0xf6f1e4,gloss:.6,cast:false,whole:true});F.herbs(k,4.4,.6,10,{r:3,size:.5,onFood:1.6});}k.cut=false;},
  'fried-rice':k=>pail(k,{mound:C.friedRice,rice:true}),
  'lo-mein':k=>pail(k,{mound:0xb9843a,top:(r,full)=>{F.noodles(k,0,0,{r:r*.9,h:.3,color:0xd9a44a,n:full?13:6,thick:.3,gloss:.6});k.sprinkle('fleck',full?16:6,{r:r*.85,color:[0x5c9a34,C.carrot,0xe9e2c0],size:.5,stretch:3,onFood:2});for(let i=0;i<(full?4:1);i++){const [x,z]=k.spot(0,0,r*.6);k.drop(blob({r:[1.2,.6,.9],bump:.15,detail:1}),x,z,{color:0xc98a5a,gloss:.5,paint:spots(0x7a3a1a,.3,2,i),whole:true});}}}),
  bibimbap:k=>{const d=W.bowl(k,9.6,6,{color:0x2a2a2c,inner:0x3a3a3c,gloss:.3});k.cut=false;
    const chopsticks=()=>W.chopsticks(k,.4,-6.6,.22,{color:0xaeb2b0});
    if(!k.level){k.sprinkle('seed',26,{r:5,color:[C.rice],size:.6,ware:true});chopsticks();return;}
    const y=W.fill(k,d,k.level===2?.6:.3,0xdacdb6,{gloss:.27,dome:.4,paint:mottle(.08,3)});
    F.riceGrains(k,0,0,{r:d.width(y)*.93,short:true,density:k.level===2?2.2:5.4,minY:y-.1,
      grains:k.level===1?[0xf3ead5,0xf3ead5,0xe5ceae,0xca854d]:null});
    if(k.level===1){chopsticks();return;}
    // Carrot matchsticks, blanched spinach, bean sprouts, bulgogi, mushrooms and cucumber.
    for(let i=0;i<24;i++){
      const [x,z]=k.spot(-4.67,-.6,1.43),length=k.rand(.65,1.45);
      k.drop(tube([[-length,0,0],[length,.09,.15]],.11,{sides:5,curve:false}),x,z,{lift:-.04,
        rot:[k.rand(-.25,.25),.68+k.rand(-.45,.45),k.rand(-.25,.25)],color:k.pick([0xec8023,0xf89436,0xe66c1d]),gloss:.41,whole:true});
    }
    for(let i=0;i<21;i++){
      const [x,z]=k.spot(-2.76,-3.83,1.67);
      k.add(sheet((u,v)=>[(u-.5)*2.9,.16+.27*Math.sin(u*7+i)*Math.sin(v*3.1),(v-.5)*1.28*Math.sin(Math.PI*(.08+.84*u))],8,4),
        {at:[x,y+.35+k.rand(0,.38),z],color:k.pick([0x326038,0x3a6a31,0x223f24]),gloss:.47,
          rot:[0,k.rand(TAU),k.rand(-.18,.18)],whole:true,cast:false});
    }
    for(let i=0;i<24;i++){
      const [x,z]=k.spot(2.17,-3.71,1.67),angle=k.rand(-.2,1.1);
      k.at(x,z,angle,()=>{
        k.add(tube([[-1.28,0,0],[-.33,.13,.11],[.64,.18,.31],[1.22,.32,.42]],.079,{sides:5,steps:6}),{color:0xede0c0,gloss:.43,whole:true});
        k.add(blob({r:[.24,.11,.16],detail:1,bump:.14}),{at:[1.17,.32,.43],color:0xd9b74d,gloss:.39,whole:true});
      });
    }
    for(let i=0;i<14;i++){
      const [x,z]=k.spot(4.43,-.27,1.53);
      k.drop(puck(F.wobble(1.05,10,.28,i,.64),.32,{edge:.13,bump:.19,n:14}),x,z,{color:k.pick([0x99562e,0x774426,0x935a38]),gloss:.52,lift:-.08,
        rot:[0,k.rand(TAU),k.rand(-.25,.25)],paint:[spots(0x562f1c,.3,2.1,i),mottle(.16,2.2)],whole:true});
    }
    for(let i=0;i<11;i++){
      const [x,z]=k.spot(2.35,3.94,1.60);
      k.drop(puck([[-1.1,-.5],[.8,-.52],[1.32,.1],[.9,.66],[-.52,.74],[-1.15,.17]],.28,{edge:.12,bump:.09,n:17}),x,z,
        {color:0x8a6040,gloss:.43,lift:-.075,rot:[0,k.rand(TAU),0],paint:[outward(0x56351e,.61,1.16,.81),mottle(.13,1.6)],whole:true});
    }
    for(let i=0;i<9;i++){
      const a=-.5+.28*i;
      F.coin(k,-3.2+Math.sin(a)*1.66,3.75+Math.cos(a)*1.08,{r:1.06,rz:.60,h:.29,color:0xa6bc68,dark:0x446a35,tilt:.26});
    }
    F.friedEgg(k,.1,.15,{r:2.67});
    F.dollop(k,1.92,2.46,{r:.84,h:.39,color:0x9d3121,gloss:.62});F.sesame(k,0,0,23,{r:5.4,onFood:y,size:.32});chopsticks();},
  'pad-thai':k=>pasta(k,{vessel:'plate',color:0xd9984a,thick:.34,flat:.4,n:16,smear:0xc9702a,over:s=>{
    for(let i=0;i<Math.round(3*s);i++)F.shrimp(k,Math.cos(i*2.1)*3,Math.sin(i*2.1)*3,i*1.4,{s:.9});
    for(let i=0;i<Math.round(14*s);i++){const [x,z]=k.spot(0,0,5);k.drop(tube([[-1.7,0,0],[0,.2,.3],[1.7,0,0]],.17,{sides:5}),x,z,{rot:[0,k.rand(TAU),0],color:0xf3ecd8,gloss:.4,whole:true});}
    F.scallions(k,0,0,Math.round(14*s),{r:4.6,onFood:1});k.sprinkle('pea',Math.round(22*s),{x:5.6,z:-3,r:1.6,color:[0xd9b06a,0xc99a52],size:.42});
    if(s===1){W.citrus(k,-7.4,4.4,.8,{rind:C.lime,flesh:0xcfe08a,r:1.8});F.herbs(k,0,0,10,{r:4.6,size:.7,onFood:1});}
  }}),
  pasta:k=>pasta(k,{sauce:C.marinara,over:s=>{if(s===1){for(let i=0;i<3;i++)k.drop(sheet((u,v)=>[(u-.5)*2.8,.15*Math.sin(u*3.1)+.05,(v-.5)*1.7*Math.sin(Math.PI*(.15+.7*u))],5,3),k.rand(-1,1),k.rand(-1,1),{rot:[0,k.rand(TAU),0],color:0x3f8a34,gloss:.4,whole:true});k.sprinkle('fleck',26,{r:3.4,color:[0xf6eccc],size:.34,stretch:2,onFood:1.5});}}}),
  meatballs:k=>pasta(k,{sauce:C.marinara,over:s=>{for(let i=0;i<Math.round(3*s);i++){const a=i*2.1+.4;k.drop(blob({r:2.1,bump:.1,freq:1.1,seed:i,detail:3,flat:.1}),Math.cos(a)*2.4,Math.sin(a)*2.4,{color:0x7a3a22,gloss:.5,inside:0x9a5a44,whole:true,paint:[mottle(.16,2),spots(0x9a2e1a,.4,1.2,i)]});}
    F.coat(k,0,0,3.2,C.marinara,{thick:.14,amp:.4});if(s===1)k.sprinkle('fleck',30,{r:4,color:[0xf6eccc],size:.34,stretch:2,onFood:1.5});}}),
  alfredo:k=>pasta(k,{color:0xf1dc9a,thick:.36,flat:.4,n:16,smear:0xf6eed8,over:s=>{F.puddle(k,0,0,6.4*s,0xf6eed8,{h:.12});if(s===1){k.sprinkle('fleck',22,{r:4,color:[0x4d8a2c,0x2a2a2a],size:.24,onFood:1.5,flat:true});}}}),
  japchae:k=>pasta(k,{vessel:'plate',color:0x8a6a4a,thick:.22,n:18,smear:0x5a3a20,over:s=>{k.sprinkle('fleck',Math.round(40*s),{r:5,color:[C.carrot,0x3f7a2f,0xe9e2c0,0x7a4a2a,0xc9302a],size:.5,stretch:3.4,onFood:1});F.sesame(k,0,0,Math.round(34*s),{r:5,onFood:1});}}),
  acai:k=>{const d=W.bowl(k,8,5.2,{color:0xe9dcc0,gloss:.4});k.cut=false;if(!k.level){W.fill(k,d,.06,0x5a2a5c,{ware:true});return;}
    const y=W.fill(k,d,k.level===2?.86:.4,0x5a2a5c,{gloss:.5,paint:[spots(0x7a3a7a,.3,1.2,2),mottle(.1,2)]});if(k.level===1)return;
    for(let i=0;i<6;i++)k.add(puck(circle(1.3,10),.4,{edge:.12,n:14}),{at:[-4.4+i*1.5,y+.15+i*.03,-2.6+i*.3],rot:[.25,0,.2],color:0xf3e2a0,gloss:.4,paint:toward(0xe6c97a,(P,N,L)=>smooth(.5,.1,Math.hypot(L.x,L.z))*.5),whole:true});
    for(let i=0;i<5;i++)k.add(lathe([[0,0],[1.1,.2],[1.3,.9],[.6,1.5],[0,1.6]],10),{at:[-3.4+i*1.6,y+.1,1.4+k.rand(-.3,.3)],rot:[1.2,i,0],color:0xc9242e,gloss:.6,paint:spots(0xf3e08a,.15,6,i),whole:true});
    k.sprinkle('pea',14,{x:3.4,z:-.6,r:1.8,color:[C.blueberry,0x2e3260],size:.75,onFood:y-.2,gloss:.6});k.sprinkle('cube',36,{x:.6,z:3.4,r:2.4,color:[0xc99a52,0xb9843a,0xd9b06a],size:.34,onFood:y-.2});
    k.drizzle([[-4,3.6],[-1,2],[2,3],[4.6,1]],.14,0xd9a02a,{gloss:.9});},
};
