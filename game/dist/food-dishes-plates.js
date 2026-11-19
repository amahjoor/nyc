// Plated meals: rice plates, things off the grill, seafood, and what the old
// country cooks.
import { blob,lathe,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,mottle,toward,browned,pale,spots,outward } from './food-kit.js';
import * as W from './food-ware.js';
import * as F from './food-parts.js';
const C=F.C;

/** Pieces of meat in their sauce. */
function saucy(k,x,z,{n=8,r=1.4,meat=C.chicken,dark=C.friedDark,sauce=C.gravy,spread=3.2,pool=true,glaze=.6,gloss=.55,detail=2}={}){
  if(pool)F.puddle(k,x,z,spread*1.25,sauce,{h:.2});
  F.chunks(k,x,z,n,{r,color:meat,dark,spread,gloss,detail});
  if(glaze)F.coat(k,x,z,spread*glaze,sauce,{thick:.12,amp:.3});
}
const blackBox=k=>W.tray(k,23,16.5,3.4,{color:W.BLACK,gloss:.5,flare:.1,corner:2.2,paint:null});
function leafy(k,x,z,n,r,colors=[C.lettuce,C.leaf,C.lettucePale],size=2.6){
  for(let i=0;i<n;i++){
    const [px,pz]=k.spot(x,z,r),seed=k.rand(9),s=size*k.rand(.7,1.15);
    k.drop(sheet((u,v)=>[(u-.5)*s,.35*s*Math.sin(u*3+seed)*Math.sin(v*2.6+seed)+.1,(v-.5)*s*.8*(1+.2*Math.sin(u*6+seed))],5,4),px,pz,{lift:.05,rot:[k.rand(-.25,.25),k.rand(TAU),k.rand(-.25,.25)],color:k.pick(colors),gloss:.32,paint:mottle(.14,1.6),whole:true,settle:.15,roll:2,within:[x,z,r*1.15]});
  }
}
function steak(k,x,z,yaw,{w=13,d=8,h=2.1,color=0x6a3a24,marks=true,inside=C.rare,bone=false}={}){
  k.at(x,z,yaw,()=>{
    k.drop(puck(F.wobble(w/2,14,.1,k.rand(9),d/2),h,{edge:.6,dome:.3,bump:.14,freq:.7,seed:k.rand(9),n:34}),0,0,{color,gloss:.42,inside,whole:false,paint:[mottle(.16,1.5),spots(0x2e1a12,.2,1.6,k.rand(9)),toward(0x8a4a30,(P,N)=>smooth(.4,-.3,N.y)*.5)]});
    if(marks)F.grillMarks(k,0,0,1.1,{n:5,length:d*.6,gap:w*.14});
    if(bone)k.add(tube([[-w*.42,h*.5,-d*.3],[-w*.5,h*.5,0],[-w*.42,h*.5,d*.4]],.55,{sides:7}),{at:[0,k.top(0,0)-h,0],color:C.bone,gloss:.4});
  });
}
function fillet(k,x,z,yaw,{w=12,d=6,h=1.9,color=C.salmon,skin=0x5a544a,stripes=0xf6c9ae}={}){
  k.at(x,z,yaw,()=>{
    k.drop(puck([[-w/2,-d*.42],[-w*.2,-d/2],[w*.42,-d*.4],[w/2,0],[w*.4,d*.45],[-w*.25,d/2],[-w/2,d*.38]],h,{edge:.5,dome:.35,bump:.08,freq:.8,seed:k.rand(9),n:34}),0,0,{color,gloss:.5,inside:0xf2a585,whole:false,
      paint:[toward(skin,(P,N,L)=>smooth(.25,.05,L.y/h)*.9),spots(0xc9703a,.2,1.2,k.rand(9)),mottle(.07,1.3)]});
    if(stripes!==null)for(let i=-3;i<=3;i++)k.drizzle([[i*w*.12-.5,-d*.4],[i*w*.12+.3,0],[i*w*.12-.4,d*.4]],.1,stripes,{gloss:.4,ry:.04});
  });
}
function ribs(k,x,z,yaw,{bones=5}={}){
  k.at(x,z,yaw,()=>{
    k.drop(puck(F.roundedPath(bones*2.5,8.6,1.2),2,{edge:.7,dome:.3,bump:.2,freq:.6,seed:k.rand(9),n:36}),0,0,{color:0x5e2a18,gloss:.62,inside:0xa86a54,whole:false,
      paint:[toward(0x3a160c,(P,N,L)=>.55*smooth(.35,.75,Math.abs(Math.sin(L.x*Math.PI/2.5)))),spots(0x1e100a,.18,1.6,k.rand(9)),mottle(.14,1.6)]});
    for(let i=0;i<bones;i++){const u=(i-(bones-1)/2)*2.5;for(const s of [-1,1])k.add(tube([[u,1,s*4],[u,1.05,s*5]],.42,{sides:7,curve:false}),{at:[0,k.top(u,s*3.4)-2,0],color:C.bone,gloss:.4,whole:true});}
  });
}
function potatoes(k,x,z,n=5,{r=1.5,spread=2.4,color=0xe0b060}={}){
  for(let i=0;i<n;i++){const [px,pz]=k.spot(x,z,spread);k.drop(blob({r:[r*k.rand(.9,1.2),r*.8,r],bump:.08,freq:.9,seed:k.rand(30),detail:2,flat:.1}),px,pz,{lift:-.1,rot:[0,k.rand(TAU),0],color,gloss:.35,roll:3,within:[x,z,spread*1.2],paint:[spots(0xa9692a,.3,1.3,k.rand(9)),mottle(.08,1.5)],inside:0xf3e3b0,whole:true});}
  F.herbs(k,x,z,12,{r:spread,size:.4,onFood:.9});
}
function greens(k,x,z,{r=3,h=1.4,color=0x3f6a2c,light=0x6a9a3c}={}){
  F.dollop(k,x,z,{r,h,color,gloss:.4,bump:.25,freq:.9,paint:spots(light,.35,1.6,k.rand(9))});
  leafy(k,x,z,14,r*.8,[color,light,0x2f5a24],2.2);
}
function mash(k,x,z,{r=3.2,gravy=C.gravy}={}){
  F.dollop(k,x,z,{r,h:1.9,color:0xf1e2b4,gloss:.35,bump:.16,freq:.7});
  if(gravy!==null){F.coat(k,x,z,r*.6,gravy,{thick:.14,amp:.35});}
}
function asparagus(k,x,z,yaw,n=5){
  k.at(x,z,yaw,()=>{for(let i=0;i<n;i++)k.drop(tube([[-5,0,0],[0,0,k.rand(-.3,.3)],[5,0,0]],.42,{sides:6,taper:t=>t>.8?1.25-(t-.8)*3:1}),k.rand(-.4,.4),(i-(n-1)/2)*.85,{rot:[0,k.rand(-.08,.08),0],color:0x5c8a34,gloss:.4,paint:[toward(0x3a5a24,(P,N,L)=>smooth(3,5,L.x)*.7),mottle(.1,2)],whole:true});});
}
function lemon(k,x,z,yaw=.6){W.citrus(k,x,z,yaw,{r:2});}

function halal(k,{meat='chicken'}={}){
  W.foilPan(k,9.5,3.6);
  W.leavings(k,{crumbs:[C.yellowRice,0xd9a94a],smear:C.white,r:5});
  if(!k.level)return;
  F.riceMound(k,-1.2,.8,{r:6.4,h:2.2,color:C.yellowRice,n:90});
  F.chunks(k,-1.8,1.6,meat==='lamb'?13:15,{r:1.15,color:meat==='lamb'?0x7a4a34:0xc98444,dark:meat==='lamb'?0x3e2418:0x7a4a1c,spread:3.4,cover:.36,gloss:.42});
  F.shreds(k,4.4,-2.6,60,{r:2.9,size:1.7});
  F.tomatoSlices(k,5.2,-2.2,2,{r:1.9,spread:1.3});
  F.flatbread(k,-1.5,-4.4,.5,{outline:[[-3.4,-2],[3.6,-1.6],[.2,3.4]],lift:.2});
  F.zigzag(k,-1.6,2,.5,{length:10,width:5,turns:6,r:.26,color:C.white});
  F.zigzag(k,-2.4,2.6,-.9,{length:7,width:3,turns:3,r:.18,color:C.hot});
  k.biteAngle=.5;k.biteAt=-1;
}
/** Rice on one side, the main on the other, something green in front. */
function ricePlate(k,main,{rice={},boxed=false,side=null,smear=C.gravy,scale=1}={}){
  if(boxed)blackBox(k);else W.plate(k,12.5);
  W.leavings(k,{crumbs:[rice.color??C.rice,0xd9c9a0],smear,r:5});
  if(!k.level)return;
  F.riceMound(k,-4.2,-.6,{r:4.6,rz:5.6,h:2.3,n:70,...rice});
  main(3.6,.4);
  if(side)side(1.2,-6.2);
  k.biteAngle=.1;k.biteAt=.5;
}
const peas={color:0xe9dcc0,flecks:{kind:'pea',color:[0x7a3a34,0x5a2a28],n:26,size:.62}};
const gandules={color:0xe3b85a,flecks:{kind:'pea',color:[0x6a7a34,0x8a8a3a],n:24,size:.6}};
const friedRice={color:C.friedRice,flecks:{kind:'cube',color:[0x6fa644,C.carrot,0xf3d35a,0x8a4a2a],n:34,size:.42}};
const slaw=(k,x,z)=>{F.dollop(k,x,z,{r:2.6,h:1,color:0xf1eedc});F.shreds(k,x,z,50,{r:2.5,color:[C.cabbage,0xf1eedc,C.carrot,0x9a5a9a],size:1.4});};
const maduros=(k,x,z,n=4)=>{for(let i=0;i<n;i++)F.coin(k,x+(i-(n-1)/2)*2.3,z+k.rand(-.5,.5),{r:1.9,rz:1.2,h:.7,color:0xc9812a,dark:0x5a2a10,cover:.36,gloss:.55,tilt:.15});};
const cabbage=(k,x,z)=>{F.dollop(k,x,z,{r:2.8,h:.9,color:0xd9e0a8,gloss:.4});F.shreds(k,x,z,50,{r:2.6,color:[0xd9e0a8,0xc9d68a,C.carrot,0xf1f0d0],size:1.6});};

export const plates={
  fries:k=>{W.tray(k,13,8.5,3.6,{color:W.PAPER,gloss:.15,flare:.24,corner:1.4});W.leavings(k,{crumbs:C.potato,n:8,r:3});F.fries(k,0,0,34,{r:3.4,bias:.9,along:0,stray:.45,length:7});k.biteAngle=.1;k.biteAt=.4;},
  'chicken-rice':k=>halal(k),'lamb-rice':k=>halal(k,{meat:'lamb'}),
  'lunch-special':k=>ricePlate(k,(x,z)=>{saucy(k,x,z,{n:9,r:1.25,meat:0xb9602a,dark:0x6a2a12,sauce:0x8a3a16});F.sesame(k,x,z,26,{r:3,onFood:1});},{rice:friedRice,boxed:true,side:(x,z)=>{for(let i=0;i<3;i++)F.broccoli(k,x+(i-1)*2.4,z+.6);}}),
  tso:k=>ricePlate(k,(x,z)=>{saucy(k,x,z,{n:10,r:1.3,meat:0xa8481e,dark:0x5a1e0c,sauce:0x8a2e12,glaze:.7,gloss:.7});F.sesame(k,x,z,30,{r:3,onFood:1});k.sprinkle('shard',8,{x,z,r:3,color:[0x8a1a12],size:.9,onFood:1});},{boxed:true,side:(x,z)=>{for(let i=0;i<4;i++)F.broccoli(k,x+(i-1.5)*2.3,z+.6);}}),
  'beef-broccoli':k=>ricePlate(k,(x,z)=>{F.puddle(k,x,z,4.2,0x5a3018,{h:.2});for(let i=0;i<9;i++){const [px,pz]=k.spot(x,z,3.2);k.drop(sheet((u,v)=>[(u-.5)*3.2,.2*Math.sin(u*5+i),(v-.5)*1.8],5,2),px,pz,{rot:[k.rand(-.3,.3),k.rand(TAU),k.rand(-.3,.3)],color:0x5a3220,gloss:.6,paint:mottle(.2,2),whole:true});}
    for(let i=0;i<5;i++){const [px,pz]=k.spot(x,z,3.2);F.broccoli(k,px,pz,{s:1.1});}},{boxed:true}),
  'stir-fry':k=>ricePlate(k,(x,z)=>{F.puddle(k,x,z,4,0x8a5a2a,{h:.15});for(let i=0;i<4;i++){const [px,pz]=k.spot(x,z,3);F.broccoli(k,px,pz);}
    for(let i=0;i<14;i++){const [px,pz]=k.spot(x,z,3.4);k.drop(tube([[-1.6,0,0],[0,.3,.5],[1.6,0,0]],.36,{sides:5,ry:.2}),px,pz,{rot:[k.rand(-.3,.3),k.rand(TAU),0],color:k.pick([C.pepper,C.carrot,0xe6c13a,0x5c9a34]),gloss:.55,whole:true});}
    for(let i=0;i<5;i++){const [px,pz]=k.spot(x,z,3);k.drop(brick(1.5,1,1.5,.2,{n:12}),px,pz,{rot:[0,k.rand(TAU),0],color:C.tofu,gloss:.4,paint:spots(0xc9963a,.3,1.2,i),whole:true});}}),
  jerk:k=>ricePlate(k,(x,z)=>{F.friedPiece(k,x-.4,z-1.6,.5,{r:2.4,color:0x5a2e18,dark:0x1e100a,bone:true,gloss:.5});F.friedPiece(k,x+.6,z+2.2,-2.2,{r:2.2,color:0x6a3418,dark:0x1e100a,gloss:.5});F.friedPiece(k,x+3,z-.4,1.2,{r:1.9,color:0x5a2e18,dark:0x1e100a,gloss:.5});},{rice:peas,boxed:true,smear:0x5a2e18,side:(x,z)=>{cabbage(k,x-2.6,z+1);maduros(k,x+3.4,z+.6,3);}}),
  oxtail:k=>ricePlate(k,(x,z)=>{F.puddle(k,x,z,4.4,0x5a2a14,{h:.3});for(let i=0;i<6;i++){const [px,pz]=k.spot(x,z,3);k.at(px,pz,k.rand(TAU),()=>{k.drop(blob({r:[1.7,1.2,1.5],bump:.2,freq:.9,seed:k.rand(30),detail:2,flat:.12}),0,0,{lift:-.1,color:0x5a2a16,gloss:.65,paint:[mottle(.18,1.6),spots(0x2e140a,.25,1.5,i)],whole:true});k.add(lathe([[0,0],[.62,0],[.7,.3],[.3,.38],[0,.3]],10),{at:[0,k.top(0,0)-.12,0],color:C.bone,gloss:.5,cast:false});});}
    for(let i=0;i<5;i++){const [px,pz]=k.spot(x,z,3.4);k.drop(blob({r:[.9,.5,.7],bump:.05,detail:1}),px,pz,{color:0xe9dcc0,gloss:.5,whole:true});}},{rice:peas,boxed:true,smear:0x5a2a14,side:(x,z)=>{cabbage(k,x-2.4,z+1);maduros(k,x+3.6,z+.6,3);}}),
  'curry-goat':k=>ricePlate(k,(x,z)=>{saucy(k,x,z,{n:9,r:1.35,meat:0x8a5a24,dark:0x4a2a10,sauce:0xb07a1e,glaze:.75});for(let i=0;i<4;i++){const [px,pz]=k.spot(x,z,3);k.drop(blob({r:[1.2,.9,1.1],bump:.08,detail:1,flat:.1}),px,pz,{color:0xe3b84a,gloss:.5,whole:true});}},{rice:peas,boxed:true,smear:0xb07a1e,side:(x,z)=>cabbage(k,x,z+.8)}),
  pernil:k=>ricePlate(k,(x,z)=>{for(let i=0;i<22;i++){const [px,pz]=k.spot(x,z,3.4);k.drop(tube([[-1.8,0,0],[0,.4,k.rand(-.6,.6)],[1.8,0,0]],.5,{sides:5,ry:.32}),px,pz,{rot:[0,k.rand(TAU),k.rand(-.35,.35)],color:k.pick([0xb07a52,0xc99a72,0x8a5234]),gloss:.45,paint:mottle(.18,2),whole:true,roll:2,within:[x,z,3.8]});}
    for(let i=0;i<3;i++){const [px,pz]=k.spot(x,z,2.6);k.drop(puck(F.wobble(1.7,10,.2,i),.4,{edge:.15,dome:.3,bump:.3,freq:1.5,n:16}),px,pz,{rot:[k.rand(-.4,.4),0,k.rand(-.4,.4)],color:0x9a4a1a,gloss:.6,paint:spots(0x5a2408,.3,2,i),whole:true});}},{rice:gandules,boxed:true,side:(x,z)=>{F.beans(k,x-2.6,z+.8,{r:2.7,color:0x7a2a24,sauce:0x8a3a2a});maduros(k,x+3.4,z+.6,3);}}),
  'pollo-guisado':k=>ricePlate(k,(x,z)=>{F.puddle(k,x,z,4.6,0xb8561e,{h:.3});F.friedPiece(k,x-.6,z-1.2,.4,{r:2.3,color:0xb9702a,dark:0x7a3a12,bone:true,gloss:.6});F.friedPiece(k,x+1,z+2.2,2.4,{r:2,color:0xb9702a,dark:0x7a3a12,gloss:.6});
    for(let i=0;i<4;i++){const [px,pz]=k.spot(x,z,3.4);k.drop(blob({r:[1,.8,1],bump:.06,detail:1,flat:.1}),px,pz,{color:k.pick([0xe3b84a,C.carrot]),gloss:.5,whole:true});}F.coat(k,x,z,2.6,0xb8561e,{thick:.1,amp:.4});k.sprinkle('ring',8,{x,z,r:3,color:[0x5c7a2e],size:.7,onFood:.8});},{rice:{color:C.rice},side:(x,z)=>F.beans(k,x,z+.6,{r:3,color:0x7a2a24,sauce:0x8a3a2a})}),
  mofongo:k=>{W.plate(k,12);W.leavings(k,{crumbs:[0xd9b04a],smear:0xb8561e});
    F.puddle(k,0,0,6.6,0xc9702a,{h:.25});
    k.drop(lathe([[0,0],[4.3,0],[4.9,1],[4.6,3.6],[3.6,4.9],[1.8,5.4],[0,5.5]],26,{bump:.07,freq:.6,seed:3}),-1,0,{color:0xd9b04a,gloss:.3,inside:0xe6c66a,whole:false,paint:[spots(0x9a6a1e,.3,1.3,2),mottle(.1,1.6)]});
    k.sprinkle('cube',16,{x:-1,z:0,r:3.4,color:[0x8a4a1a,0xb9702a],size:.5,onFood:3});
    for(let i=0;i<5;i++)F.shrimp(k,4.6+Math.cos(i*1.25)*1.8,Math.sin(i*1.25)*4.4,i*1.25,{s:.85});F.herbs(k,0,0,20,{r:6,size:.5});k.biteAngle=.2;k.biteAt=0;},
  jollof:k=>ricePlate(k,(x,z)=>{F.friedPiece(k,x,z-.6,.5,{r:2.9,color:0x9a5a22,dark:0x4a2410,bone:true,gloss:.4});maduros(k,x,z+4.2,3);},{rice:{color:C.redRice,flecks:{kind:'cube',color:[C.pepper,0x5c9a34,C.carrot],n:22,size:.4},r:5.4,rz:6}}),
  egusi:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0xe9dcc0],smear:0xc9902a});
    const b=W.bowl(k,6.6,4.4,{x:-4,z:0,color:0xe9e2d0});
    if(k.level){W.fill(k,b,k.level===2?.8:.4,0xc9902a,{gloss:.6,dome:.4,paint:[spots(0x3f6a2c,.4,1.5,2),spots(0xb8401e,.2,1.1,5),mottle(.1,2)]});
      if(k.level===2)for(let i=0;i<4;i++){const a=i*1.6;k.drop(blob({r:[1.2,.9,1],bump:.2,detail:1}),-4+Math.cos(a)*2.6,Math.sin(a)*2.6,{color:0x6a3a20,gloss:.5,whole:true});}}
    k.drop(blob({r:[4,3,3.6],bump:.05,freq:.5,seed:4,detail:3,flat:.14}),6.2,.4,{color:0xf3ecd8,gloss:.35,inside:0xf6f1e2,whole:false,paint:mottle(.03,.8)});k.biteAngle=0;k.biteAt=6.5;},
  injera:k=>{k.ware(lathe([[0,0],[13.4,0],[13.8,.5],[13.6,.7],[12.6,.4],[0,.4]],48),{color:0xb4b9bd,gloss:.6,paint:mottle(.06,1.5)});W.leavings(k,{crumbs:[0xc9b08a],smear:0x9a2a16,r:7});
    const seed=k.rand(9);
    k.add(sheet((u,v)=>{const a=u*TAU,d=v*13*(1+.02*Math.sin(a*9));return [Math.cos(a)*d,.1+.06*fbm(Math.cos(a)*d*2+seed,1,Math.sin(a)*d*2),Math.sin(a)*d];},48,10),{at:[0,.02,0],drape:.01,color:0xc9b08a,gloss:.18,inside:0xc9b08a,whole:false,paint:[spots(0xa9906a,.5,3.2,seed),mottle(.08,1.2)]});
    const heaps=[[0xa02a16,0x5a140a],[0xd9a82a,0x9a6a1a],[0x3f6a2c,0x2a4a1e],[0xc97a2a,0x8a4a14],[0xe6d9a8,0xc9b06a],[0x7a3a24,0x3e1a10]];
    heaps.forEach(([c,d],i)=>{const a=i*TAU/6,x=Math.cos(a)*7,z=Math.sin(a)*7;F.dollop(k,x,z,{r:3,h:1.1,color:c,gloss:.5,bump:.22,freq:1.1,paint:spots(d,.35,1.6,i)});});
    F.dollop(k,0,0,{r:3.2,h:1.3,color:0x8a2a16,gloss:.55,bump:.25,paint:spots(0x4a120a,.3,1.5,9)});
    for(let i=0;i<2;i++)k.add(tube([[-2.4,0,0],[2.4,0,0]],1.2,{sides:10,curve:false,caps:true}),{at:[(i?1:-1)*9.6,k.top((i?1:-1)*9.6,-6+i*12)+1.1,-6+i*12],rot:[0,.9+i,0],color:0xc9b08a,gloss:.18,paint:spots(0xa9906a,.5,3.2,i),whole:true});
    k.biteAngle=.3;k.biteAt=0;},
  bulgogi:k=>ricePlate(k,(x,z)=>{for(let i=0;i<16;i++){const [px,pz]=k.spot(x,z,3.4);k.drop(sheet((u,v)=>[(u-.5)*3.6,.28*Math.sin(u*6+i)+.15,(v-.5)*1.9*(1+.2*Math.sin(u*5+i))],6,2),px,pz,{rot:[k.rand(-.3,.3),k.rand(TAU),k.rand(-.3,.3)],color:k.pick([0x6a3a20,0x7a4424,0x52281a]),gloss:.6,paint:mottle(.2,2),whole:true,roll:2,within:[x,z,3.8]});}
    F.sesame(k,x,z,30,{r:3.2,onFood:.8});F.scallions(k,x,z,12,{r:3,onFood:.8});},{side:(x,z)=>{for(let i=0;i<3;i++)leafy(k,x+(i-1)*2.6,z+.8,3,1,[0xc9452a,0xe9d9b8,0xd9603a],1.8);}}),
  'katsu-curry':k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.fried,C.rice],smear:0x9a6a1e});if(!k.level)return;
    F.riceMound(k,-5,0,{r:4.4,rz:6,h:2.2});F.puddle(k,3.6,0,6,0x9a6a1e,{rz:6.6,h:.4,paint:spots(0xc9902a,.25,1.4,3)});
    for(let i=0;i<5;i++)k.at(.4+i*1.9,-.4+i*.25,.28,()=>k.drop(brick(1.6,1.5,7.6,.4,{n:24,bump:.16,freq:1.4}),0,0,{rot:[0,0,-.35],color:C.fried,gloss:.25,inside:C.chickenIn,whole:false,paint:[mottle(.18,2.4),spots(C.friedDark,.3,1.8,i),toward(C.chickenIn,(P,N,L)=>Math.abs(N.x)>.75?.9:0)]}));
    for(let i=0;i<3;i++){const [px,pz]=k.spot(6.6,3.8,1.4);k.drop(blob({r:[1,.8,1],bump:.06,detail:1,flat:.1}),px,pz,{color:k.pick([C.carrot,0xe3b84a]),gloss:.5,whole:true});}k.biteAngle=.1;k.biteAt=2.5;},
  biryani:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0xe9c66a,0xf3ecd8],smear:0xb8601e});if(!k.level)return;
    F.riceMound(k,0,0,{r:8.2,h:3.2,color:0xf1e2b0,grains:[0xf6ecd0,0xe9b83a,0xf3d98a,0xd9862a],n:150});
    F.friedPiece(k,-1,.4,.6,{r:2.5,color:0xa8601e,dark:0x5a2a0c,bone:true,gloss:.45});F.chunks(k,2.6,-1.6,3,{r:1.3,color:0xa8601e,dark:0x5a2a0c,spread:1.6});
    F.onionRings(k,1,2.6,3,{color:0x8a4a2a,r:1.5});F.herbs(k,0,0,26,{r:6,size:.6,onFood:1.2});k.sprinkle('pea',8,{r:6,color:[0xc9a05a],size:.6,onFood:1.2});
    W.ramekin(k,8.4,-6,0xf1eedc,{full:k.level===2?1:.4,paint:spots(0x6a9a3c,.2,3,1)});k.biteAngle=.2;k.biteAt=1;},
  chana:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.rice],smear:0xb8601e});if(!k.level)return;
    F.riceMound(k,-4.6,0,{r:4.4,rz:6,h:2.2});const b=W.bowl(k,5.6,3.6,{x:4.6,z:0,color:0xb4b9bd});
    W.fill(k,b,k.level===2?.8:.35,0xb8601e,{gloss:.6,dome:.3,paint:mottle(.1,1.6)});k.sprinkle('pea',k.level===2?40:14,{x:4.6,z:0,r:4,color:[C.chickpea,0xc9a05a],size:.85,onFood:1.2,gloss:.5});F.herbs(k,4.6,0,12,{r:3,size:.5,onFood:1.2});k.cut=false;},
  'saag-paneer':k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.rice],smear:0x3f6a2c});if(!k.level)return;
    F.riceMound(k,-4.6,0,{r:4.4,rz:6,h:2.2});const b=W.bowl(k,5.6,3.6,{x:4.6,z:0,color:0xb4b9bd});
    W.fill(k,b,k.level===2?.8:.35,0x3f6a2c,{gloss:.5,dome:.3,paint:[spots(0x6a9a3c,.3,1.6,2),mottle(.12,2)]});
    for(let i=0;i<(k.level===2?7:3);i++){const [px,pz]=k.spot(4.6,0,3);k.drop(brick(1.3,1,1.3,.15,{n:12}),px,pz,{lift:-.4,rot:[k.rand(-.3,.3),k.rand(TAU),0],color:0xf6f0dc,gloss:.4,paint:spots(0xd9b06a,.2,1.2,i),whole:true});}
    k.add(tube([[3,2.9,-1.6],[4.4,3.1,.2],[6.2,2.9,1.4]],.22,{sides:5,ry:.08}),{color:0xf6f1e4,gloss:.6,cast:false,whole:true});k.cut=false;},
  suya:k=>{W.deliPaper(k,26,18,{color:0xe6d9c0,yaw:.15});W.leavings(k,{crumbs:[0x9a5a22,0xc9382c],r:5});
    const n=k.level===1?2:3;
    for(let s=0;s<n;s++)F.skewer(k,-.6,(s-1)*3.6,.12+s*.06,5,(i,u,y)=>k.add(blob({r:[1.5,.95,1.4],bump:.2,freq:1.2,seed:k.rand(30),detail:2}),{at:[u,y,0],rot:[k.rand(TAU),0,0],color:0x8a4a20,gloss:.4,paint:[mottle(.18,2),spots(0x3a1a0a,.3,1.6,i),spots(0xc9601e,.3,3,i+4)],whole:true}),{length:18,lift:1});
    F.onionRings(k,8.6,3.4,4,{r:1.9});F.tomatoSlices(k,8.8,-3.4,2,{r:1.8,spread:1.2});k.sprinkle('shard',40,{r:7,color:[0xb9502a,0x8a2a12],size:.3,flat:true});k.cut=false;},
  satay:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0xc98a2a],smear:0xb9844a});
    const n=k.level===1?2:4;
    for(let s=0;s<n;s++)F.skewer(k,-2,(s-1.5)*2.6,.1+s*.04,1,(i,u,y)=>k.add(tube([[-4.5,y,0],[-1.5,y+.2,.3],[1.5,y,-.3],[4.5,y+.1,0]],1.05,{sides:8,ry:.5,taper:t=>.7+.3*Math.sin(t*Math.PI)}),{at:[2.5,0,0],color:0xd9a03a,gloss:.5,paint:[spots(0x6a3a10,.3,1.3,s),mottle(.14,2)],whole:true}),{length:19,lift:.7});
    W.ramekin(k,8.4,-4.6,0xb9844a,{r:2.6,full:k.level===2?1:.5,paint:spots(0x8a4a1a,.25,2,1)});for(let i=0;i<4;i++)F.coin(k,8+k.rand(-1,1),3+i*1.1,{r:1.3,h:.3,color:C.cucumber,dark:0x5c9a34,tilt:.15});k.cut=false;},
  'bbq-ribs':k=>{W.platter(k,30,20);W.leavings(k,{crumbs:[C.bone,0x5e2a18],smear:C.bbq,r:6});ribs(k,-3.4,.4,.2,{bones:k.level===1?3:6});slaw(k,8.4,3.2);
    k.drop(brick(4.6,2.6,4.6,.3,{n:16,bump:.06}),8,-4,{rot:[0,.3,0],color:0xe6b34a,gloss:.25,inside:0xf3d98a,paint:[browned(0xb9772a,.6,.9),mottle(.08,1.5)],whole:true});k.cut=false;},
  brisket:k=>{W.tray(k,26,18,1.6,{color:0x8a8f93,gloss:.55,flare:.06,corner:1.8});W.deliPaper(k,25,17,{color:0xd9c4a0,yaw:0,lift:.02});W.leavings(k,{crumbs:[0x5a2a18,C.bun],smear:C.bbq,r:6});
    const n=k.level===1?3:6;
    for(let i=0;i<n;i++)k.at(-7.4+i*2.3,.4,.1,()=>k.drop(brick(1.1,3.4,9,.35,{n:24,bump:.08}),0,0,{rot:[0,0,-1.12],settle:.2,color:0xa8644c,gloss:.5,whole:true,paint:[toward(0x2a140c,(P,N,L)=>smooth(2.6,3.3,L.y)+smooth(.6,.1,L.y)*.7),toward(0xb0443a,(P,N,L)=>smooth(2.5,2.1,L.y)*smooth(1.5,2.1,L.y)*.6),mottle(.12,2)]}));
    for(let i=0;i<4;i++)F.pickles(k,8,5.4-i*.4,1,{spread:1.6});F.onionRings(k,8.6,-1,3,{color:0xf1e8d6,r:1.9});
    F.slice(k,7.4,-5.4,.3,{s:.72,h:1.1,color:0xfaf5e8,crust:0xd9b98a});k.cut=false;},
  meatloaf:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0x7a4a2e],smear:C.gravy});
    for(let i=0;i<2;i++)k.at(-3.6+i*1.2,-1.6+i*3.4,.2,()=>k.drop(puck(F.roundedPath(10,5.4,1.6),1.8,{edge:.3,bump:.1,freq:1,seed:i,n:32}),0,0,{rot:[.25*i,0,0],color:0x7a4a2e,gloss:.4,inside:0x8a5a40,whole:false,paint:[toward(0x8a2a16,(P,N,L)=>smooth(1,2.4,Math.abs(L.z))*.8),spots(0x4a2a18,.25,1.8,i),mottle(.14,2)]}));
    F.coat(k,-3,0,3.4,C.gravy,{thick:.12,amp:.4});mash(k,5.6,3.4);for(let i=0;i<5;i++)k.sprinkle('pea',9,{x:5.4,z:-4.4,r:2.4,color:[0x5c9a34,C.carrot,0x6aa63c],size:.75,gloss:.5});k.biteAngle=.2;k.biteAt=-2.5;},
  steak:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0x6a3a24],smear:0x7a2a1a});steak(k,-1.4,.6,.3,{w:15,d:8.6});F.butterPat(k,-1.4,.4);k.biteAngle=.3;k.biteAt=-.5;},
  dinner:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0x6a3a24],smear:C.gravy});steak(k,-3,1.4,.4,{w:12,d:7.4});mash(k,5.8,3.2,{gravy:null});asparagus(k,3.4,-5.4,.25,5);k.biteAngle=.3;k.biteAt=-2.4;},
  ribeye:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0x6a3a24],smear:0x7a2a1a});steak(k,-.6,.4,.25,{w:16,d:10.4,h:2.6,bone:true});F.butterPat(k,0,.4);F.herbs(k,-.6,.4,10,{r:4,size:.7,color:[0x4a6a2a],onFood:2});k.biteAngle=.3;k.biteAt=0;},
  'steak-frites':k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0x6a3a24,C.potato],smear:0x7a2a1a});steak(k,-3.6,1,.5,{w:12,d:7});F.butterPat(k,-3.6,1);F.fries(k,5.6,-.6,26,{r:3.6,along:1.3,stray:.8});k.biteAngle=.3;k.biteAt=-3;},
  'bacon-slab':k=>{W.plate(k,11);W.leavings(k,{crumbs:[0x8b3524],smear:0xc9812a});
    k.at(0,0,.35,()=>k.drop(puck(F.roundedPath(14,5,1),1.5,{edge:.35,bump:.12,freq:.8,seed:2,n:34}),0,0,{color:0x8a3a22,gloss:.65,inside:0xb0584a,whole:false,paint:[toward(0xe6b890,(P,N,L)=>.75*smooth(.3,.6,Math.abs(Math.sin(L.z*1.5+.5)))),spots(0x3a180c,.25,1.3,1),mottle(.12,1.8)]}));k.biteAngle=-.35;k.biteAt=1;},
  parm:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.fried,C.noodle],smear:C.marinara});
    F.noodles(k,5.4,-.8,{r:4,h:1.2,n:12});F.coat(k,5.4,-.8,2.6,C.marinara,{thick:.2,amp:.3});
    F.cutlet(k,-3.2,.8,.4,{w:13,d:9.4,h:1.6});F.coat(k,-3.2,.8,5,C.marinara,{rz:3.6,thick:.2,amp:.25});F.coat(k,-3.2,.8,3.6,0xf3e6b8,{rz:2.6,thick:.22,amp:.3,gloss:.55,paint:spots(0xc98a36,.28,1.4,3)});F.herbs(k,-3.2,.8,8,{r:3,size:.7,onFood:2});k.biteAngle=.3;k.biteAt=-2.6;},
  schnitzel:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.fried],smear:0xe9c63a});F.cutlet(k,-1.8,.6,.3,{w:17,d:11.4,h:1.2});lemon(k,-1.6,.4);potatoes(k,7,-3.4,4,{r:1.3});leafy(k,6.6,4.4,8,1.8);k.biteAngle=.3;k.biteAt=-1;},
  'duck-confit':k=>{W.plate(k,12);W.leavings(k,{crumbs:[0x8a4a1e],smear:0x6a3a1a});F.puddle(k,0,0,5.4,0x6a3a1a,{h:.14});leafy(k,3.6,3.2,10,2.4,[0x7cab3a,0x5f9233,0x8a3a5a]);potatoes(k,3.2,-3.4,4,{r:1.2});F.friedPiece(k,-2.6,.4,.5,{r:3,color:0x9a5a22,dark:0x4a2410,bone:true,gloss:.55,long:1.15});k.biteAngle=.3;k.biteAt=-2;},
  'roast-chicken':k=>{W.tray(k,22,16,5,{color:W.BLACK,gloss:.5,flare:.12,corner:3,paint:null});W.leavings(k,{crumbs:[C.bone,0xa8621e],smear:0x9a6a2a,r:5});
    k.drop(blob({r:[7,4.4,5.4],bump:.06,freq:.35,seed:5,detail:3,flat:.16}),0,0,{color:0xb9742a,gloss:.6,inside:C.chickenIn,whole:false,paint:[browned(0x7a3a12,.75,.6),spots(0x4a2008,.12,1.4,2),mottle(.1,1.2)]});
    for(const s of [-1,1]){k.at(4.4,s*4.2,s*-.5,()=>F.friedPiece(k,0,0,0,{r:2,color:0xb9742a,dark:0x7a3a12,bone:true,gloss:.6,long:1.2}));k.drop(blob({r:[2.6,1.3,1.4],bump:.1,detail:2}),-3.4,s*4.6,{rot:[0,s*.4,0],color:0xa8621e,gloss:.6,paint:mottle(.12,1.5),whole:true});}
    k.biteAngle=.2;k.biteAt=0;},
  'chicken-potatoes':k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.bone,0xa8621e],smear:0x9a6a2a});F.puddle(k,-1,0,5,0x9a6a2a,{h:.12});
    k.drop(blob({r:[4.6,2.6,3.6],bump:.08,freq:.5,seed:3,detail:3,flat:.16}),-3.4,1,{color:0xb9742a,gloss:.6,inside:C.chickenIn,whole:false,paint:[browned(0x7a3a12,.7,.7),mottle(.1,1.3)]});
    k.at(-3.4,1,2.5,()=>F.friedPiece(k,3.6,1.6,.3,{r:1.7,color:0xb9742a,dark:0x7a3a12,bone:true,gloss:.6}));potatoes(k,5.2,-2.6,5);asparagus(k,4.6,4.6,.5,4);k.biteAngle=.3;k.biteAt=-2.6;},
  'grilled-salmon':k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.salmon],smear:0xe9c63a});fillet(k,-2.6,1,.35);potatoes(k,5.6,-3,5,{r:1.2});asparagus(k,4.4,4.2,.45,4);lemon(k,-6.6,-5.4,.3);k.biteAngle=.35;k.biteAt=-2.2;},
  'fish-chips':k=>{W.tray(k,23,14,3,{color:W.PAPER,gloss:.15,flare:.2,corner:1.6});W.deliPaper(k,21,13,{color:0xe9e2d0,yaw:.05,lift:.03});W.leavings(k,{crumbs:[C.fried,C.potato],r:5});
    F.fries(k,3,0,26,{r:4.4,along:.2,stray:.6});
    for(let i=0;i<(k.level===1?1:2);i++)k.at(-3.8+i*1.2,-2+i*4.2,.3-i*.5,()=>k.drop(puck([[-5.4,-1.9],[-1,-2.5],[4.6,-1.6],[5.6,.3],[3,2.2],[-3.6,2.3],[-5.6,.6]],1.9,{edge:.7,dome:.4,bump:.24,freq:1.2,seed:i,n:32}),0,0,{settle:.8,color:0xd69a3a,gloss:.3,inside:0xf6f1e4,whole:false,paint:[mottle(.18,2.2),spots(0x9a5a1e,.3,1.6,i),toward(0xe9c06a,(P,N)=>smooth(.3,-.4,N.y)*.4)]}));
    lemon(k,7.6,3.6,.4);W.ramekin(k,8,-3.6,0xf1ecd2,{r:2,h:1.8,full:k.level===2?1:.4,paint:spots(0x6a9a3c,.2,3,1)});k.cut=false;},
  lobster:k=>{W.platter(k,30,20);W.leavings(k,{crumbs:[0xd9442e],smear:0xf3d77a,r:6});
    const shell=0xd03a22,dark=0x8a1a10;
    k.at(-1,0,.15,()=>{
      for(let i=0;i<6;i++)k.drop(blob({r:[1.7-.14*i,1.5-.12*i,2.2-.16*i],bump:.05,detail:2,flat:.12}),-1.6-i*1.75,0,{color:shell,gloss:.7,paint:[toward(dark,(P,N,L)=>smooth(.5,1.1,Math.abs(L.x))*.6),mottle(.1,2)],whole:true,settle:0});
      k.drop(blob({r:[3.6,2,2.6],bump:.05,detail:3,flat:.12}),2.4,0,{color:shell,gloss:.7,inside:0xf6eee2,whole:false,paint:[spots(dark,.2,1.2,2),mottle(.1,1.6)]});
      for(const s of [-1,1]){
        k.add(tube([[4.4,1.2,s*1.6],[6.4,1.3,s*3.6],[8.4,1.2,s*3.4]],.6,{sides:7}),{color:shell,gloss:.7,whole:true});
        k.drop(blob({r:[2.5,1,1.5],bump:.08,detail:2,flat:.1}),10,s*3.6,{rot:[0,-s*.3,0],color:shell,gloss:.7,paint:[toward(dark,(P,N,L)=>smooth(1,2.4,L.x)*.5),mottle(.1,1.6)],whole:true});
        for(let i=0;i<3;i++)k.add(tube([[1+i*1.2,1,s*2.2],[1.4+i*1.3,1.4,s*4.2],[1.8+i*1.5,.5,s*5.8]],.24,{sides:5}),{color:shell,gloss:.6,whole:true});
        k.add(tube([[5.6,1.6,s*.6],[9,2.6,s*2],[12.6,2.2,s*4.6]],.09,{sides:4}),{color:dark,gloss:.5,whole:true,cast:false});
      }
      for(let i=-2;i<=2;i++)k.add(sheet((u,v)=>[-12.4-v*1.8,.5,i*.9+(u-.5)*1.2*(1+v)],2,2),{color:shell,gloss:.6,whole:true});
    });
    W.ramekin(k,9.4,6.2,0xf3d77a,{r:2.3,full:k.level===2?1:.4});lemon(k,-9.6,6.2,.4);lemon(k,-7,7.2,1.2);k.biteAngle=.15;k.biteAt=1.5;},
  oysters:k=>{k.ware(lathe([[0,0],[9.6,0],[12.4,2.2],[12.6,2.5],[12.2,2.5],[9.6,.6],[0,.6]],40),{color:0xb4b9bd,gloss:.6,paint:mottle(.06,1.4)});
    k.ware(lathe([[11.8,2],[9,2.3],[6,2.5],[3,2.6],[0,2.6]],36,{bump:.05,freq:1.3}),{color:0xeef4f6,gloss:.7,paint:mottle(.08,2.6)});
    const n=k.level===2?6:k.level===1?3:0;
    for(let i=0;i<6;i++){const a=i*TAU/6+.2;k.at(Math.cos(a)*7.2,Math.sin(a)*7.2,-a+Math.PI/2,()=>{
      k.ware(puck([[-2.1,-3],[2.2,-2.6],[2.6,.6],[1.2,3.4],[-1,3.5],[-2.6,.8]],.5,{edge:.2,dome:-.3,bump:.2,freq:1.2,seed:i,n:22}),{at:[0,k.top(0,0)-.1,0],rot:[.12,0,0],color:0xd9d2c0,gloss:.6,paint:[outward(0x6a665c,2.2,3.4,.7),mottle(.14,2)]});
      if(i<n)k.drop(blob({r:[1.5,.5,2.1],bump:.14,freq:1.2,seed:i,detail:2}),0,.2,{lift:-.2,color:0xc9c2b0,gloss:.85,paint:[spots(0x8a8474,.3,1.6,i),mottle(.1,2)],whole:true});
    },{y:0});}
    W.ramekin(k,0,0,0xb23a2a,{r:2.2,h:1.9,full:k.level===2?1:.4});lemon(k,2.4,3,.3);lemon(k,-3,2.2,1.4);k.cut=false;},
  'shrimp-cocktail':k=>{stemGlass(k);const n=k.level===2?6:k.level===1?3:0;
    for(let i=0;i<n;i++){const a=i*TAU/6;F.shrimp(k,Math.cos(a)*4.3,Math.sin(a)*4.3,-a+1.2,{s:1.05});}
    k.cut=false;},
  calamari:k=>{W.plate(k,12);W.deliPaper(k,17,17,{yaw:.5,lift:.02});W.leavings(k,{crumbs:[C.fried],smear:C.marinara,r:4.4});
    const n=k.level===1?12:26;
    for(let i=0;i<n;i++){const [x,z]=k.spot(-1.4,.4,5,.9),r=k.rand(1,1.6);k.drop(lathe([[r,0],[r+.34,.2],[r+.34,.6],[r,.8],[r-.34,.6],[r-.34,.2],[r,0]],12,{bump:.12,freq:2,seed:i}),x,z,{rot:[k.rand(-.4,.4),0,k.rand(-.4,.4)],color:0xd9a84a,gloss:.25,paint:[mottle(.16,3),spots(0xa9702a,.28,2,i)],whole:true,roll:3,within:[-1.4,.4,5.6],settle:.6});}
    W.ramekin(k,7.2,-4.8,C.marinara,{r:2.4,full:k.level===2?1:.4});lemon(k,6.8,3.6,.3);k.cut=false;},
  moules:k=>{const pot=W.bowl(k,9.4,7,{color:0x23272a,inner:0x3a3f42,gloss:.6});k.cut=false;
    for(const s of [-1,1])k.ware(tube([[s*9,5.6,-1.6],[s*11,5.9,0],[s*9,5.6,1.6]],.5,{sides:7,caps:false}),{color:0x23272a,gloss:.6});
    if(!k.level){W.fill(k,pot,.1,0xe6d9a8,{ware:true});return;}
    W.fill(k,pot,k.level===2?.62:.3,0xe6d9a8,{gloss:.85,paint:spots(0x5c9a34,.12,3,1)});
    const n=k.level===2?12:5;
    for(let i=0;i<n;i++){const [x,z]=k.spot(0,0,k.level===2?6:4.4);k.at(x,z,k.rand(TAU),()=>{
      for(const s of [-1,1])k.drop(puck([[-2.6,0],[-1.6,-1.2*1],[1,-1.3],[2.6,-.2],[2.2,.2],[-2.2,.3]],.5,{edge:.2,dome:.5,n:18}),0,s*.5,{rot:[s*.9,0,0],color:0x1e2228,gloss:.75,paint:toward(0x4a5a7a,(P,N)=>smooth(.2,.9,N.y)*.5),whole:true,settle:.7});
      k.drop(blob({r:[1.3,.5,.6],bump:.1,detail:1}),0,0,{lift:-.2,color:0xe9a04a,gloss:.7,whole:true});
    },{tilt:[k.rand(-.5,.5),k.rand(-.5,.5)]});}
    F.herbs(k,0,0,18,{r:5.4,size:.5,onFood:3});},
  pierogi:k=>{W.plate(k,12);W.leavings(k,{crumbs:[C.dough,0x8a5a24],smear:0xf1eedc});
    const n=k.level===1?3:6;
    for(let i=0;i<n;i++){const a=i*TAU/6+.3;F.dumpling(k,-1+Math.cos(a)*4.6,Math.sin(a)*4.4,-a+.4,{s:1.1,color:0xf1e2b8});}
    F.dollop(k,-1,0,{r:2.2,h:1.3,color:C.cream});for(let i=0;i<22;i++){const [x,z]=k.spot(-1,0,6);k.drop(tube([[-1,0,0],[0,.2,.4],[1,0,0]],.2,{sides:4,ry:.12}),x,z,{rot:[0,k.rand(TAU),0],color:k.pick([0x8a5a24,0xb9843a,0x6e4a1e]),gloss:.5,whole:true});}
    F.scallions(k,-1,0,10,{r:5.6,size:.5});k.cut=false;},
  goulash:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[0xe9d9a8],smear:0x8a2a16});if(!k.level)return;
    F.noodles(k,-4.6,0,{r:4.6,h:1.4,color:0xf1dc9a,n:14,thick:.5,flat:.3,sides:4});saucy(k,3.8,.4,{n:9,r:1.3,meat:0x6a3018,dark:0x2e140a,sauce:0x8a2a16,spread:3.6,glaze:.7});
    F.dollop(k,3.8,.4,{r:1.4,h:.8,color:C.cream});F.herbs(k,3.8,.4,10,{r:3,size:.5,onFood:1});k.biteAngle=.1;k.biteAt=.5;},
  'shepherds-pie':k=>{const d=W.bowl(k,8,4.6,{color:0x8a4a2a,inner:0xd9c9a8});k.cut=false;
    if(!k.level){W.fill(k,d,.08,0x7a4a2a,{ware:true});return;}
    if(k.level===1){W.fill(k,d,.45,0x7a4a2a,{gloss:.5,paint:[spots(0x5c9a34,.14,2.4,1),spots(C.carrot,.14,2.4,5),mottle(.12,2)]});F.dollop(k,-2.6,.6,{r:3.4,h:1.6,color:0xf1e2b4});return;}
    W.fill(k,d,.95,0xf1e2b4,{gloss:.3,dome:.9,paint:[toward(0xc98a36,(P,N,L)=>.75*smooth(.35,.75,.5+.5*Math.sin(L.x*2.4)*Math.cos(L.z*2.4))),mottle(.06,2)]});F.herbs(k,0,0,8,{r:5,size:.5,onFood:3});},
};
function stemGlass(k){
  k.ware(lathe([[0,0],[4.6,0],[4.6,.2],[.9,.7],[.5,1.6],[.5,5],[1.2,5.6],[5.4,8.4],[7.4,10.4],[7.5,10.6],[7.3,10.6],[5.2,8.7],[1,6.2],[0,6.2]],32),{color:0xdcecea,opacity:.24,gloss:.95,shade:false});
  k.ware(lathe([[1,6.2],[5,8.6],[5.6,9.2],[3,9.4],[0,9.4]],28,{bump:.03,freq:1.5}),{color:0xeef4f6,gloss:.7});
  if(k.level)k.add(lathe([[2.6,9.4],[2.4,10.2],[1.4,10.4],[0,10.4]],20),{color:0xb23a2a,gloss:.7,paint:mottle(.1,2.5),whole:true,cast:false});
  W.citrus(k,0,0,0,{r:1.6,lift:10.2});
}
