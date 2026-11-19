// Things eaten out of the hand: burgers, heroes, wraps, bagels and pizza.
import { blob,lathe,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,mottle,toward,browned,pale,spots,outward } from './food-kit.js';
import * as W from './food-ware.js';
import * as F from './food-parts.js';
import { can } from './food-drinks.js';
const C=F.C;

const lump=(k,at,r,color,o={})=>k.add(blob({r:typeof r==='number'?[r,r*.8,r]:r,bump:o.bump??.18,freq:1.2,seed:k.rand(40),detail:o.detail??1}),{at,rot:[k.rand(TAU),k.rand(TAU),0],color,gloss:o.gloss??.4,paint:[mottle(.14,1.8),o.dark?spots(o.dark,.3,1.6,k.rand(9)):null].filter(Boolean),whole:true});
const foil=(k,w=24,d=20,yaw=.3)=>W.deliPaper(k,w,d,{color:W.FOIL,yaw,gloss:.6,crinkle:.3});
const basket=(k,check=0xc9382c)=>{W.tray(k,23,15.5,3,{color:W.RED,gloss:.5,flare:.2,corner:3});W.deliPaper(k,22,17,{check,yaw:.3});};

// ---- on a round roll ------------------------------------------------------------
function burger(k,{x=0,z=0,patties=1,cheese=true,baconOn=false,fried=false,fish=false,pulled=false,slaw=false,r=4.7,seeds='sesame',salad=true,sauce=null,kaiser=false}={}){
  F.bunBottom(k,x,z,{r});
  if(salad && !pulled){F.lettuce(k,x,z,{r:r+.9});F.tomatoSlices(k,x,z,2,{spread:1.7,r:r*.66});}
  if(pulled){
    for(let i=0;i<16;i++){const [px,pz]=k.spot(x,z,r*.8);k.drop(tube([[-1.6,0,0],[0,.3,k.rand(-.5,.5)],[1.6,0,0]],.42,{sides:5,ry:.3}),px,pz,{rot:[0,k.rand(TAU),k.rand(-.3,.3)],color:k.pick([0x8a4a2a,0x9c5a34,0x6e3a20]),gloss:.55,paint:mottle(.2,2),whole:true,roll:2,within:[x,z,r]});}
    F.coat(k,x,z,r*.7,C.bbq,{thick:.1,amp:.3});
  }else if(fried||fish)F.cutlet(k,x,z,.4,{w:r*2.25,d:r*2,h:fish?1.3:1.7,color:fish?0xcf9a44:C.fried});
  else for(let i=0;i<patties;i++){F.patty(k,x,z,{r:r*.99});if(cheese)F.cheeseSlice(k,x,z,.5+i*.7,{w:r*1.85});}
  if((fried||fish) && cheese)F.cheeseSlice(k,x,z,.5,{w:r*1.7});
  if(baconOn){F.bacon(k,x,z-.9,.2,{length:r*2.2});F.bacon(k,x,z+.9,-.15,{length:r*2.2});}
  if(slaw)F.shreds(k,x,z,46,{r:r*.75,color:[C.cabbage,0xf1eedc,C.carrot,0x9a5a9a],size:1.5});
  if(sauce!==null)F.coat(k,x,z,r*.55,sauce,{thick:.1,amp:.35});
  if(!pulled && !fish)F.pickles(k,x,z,3);
  F.bunTop(k,x,z,{r,tilt:-.06,seeds,kaiser});
  k.biteAngle=.2;k.biteAt=x+1.2;
}
const burgerPlate=(k,o={})=>{
  if(o.basket)basket(k);else W.plate(k,o.sides?12.5:11);
  W.leavings(k,{crumbs:[C.bun,C.crumb],smear:o.pulled?C.bbq:C.ketchup});
  burger(k,{x:o.sides?-3.4:0,z:o.sides?.6:0,...o});
  if(o.sides==='fries'){F.fries(k,6.4,-.5,22,{r:3.2,along:1.2,stray:.7});F.spear(k,4.6,6.6,.15);}
  if(o.sides==='slaw'){F.dollop(k,6,0,{r:3,h:1.2,color:0xf1eedc});F.shreds(k,6,0,50,{r:2.8,color:[C.cabbage,0xf1eedc,C.carrot],size:1.4});}
};
function sliders(k){
  W.board(k,27,12,1.3);W.leavings(k,{crumbs:[C.bun,C.crumb]});
  const n=k.level===1?2:3;
  for(let i=0;i<n;i++)burger(k,{x:(i-1)*8,z:0,r:3,salad:false,seeds:null});
  k.cut=false;
}

// ---- on a long roll -------------------------------------------------------------
function hero(k,{x=0,z=0,yaw=.25,length=17,width=5.8,fill,color=C.bun,seeds=null,crusty=false,dome=1.3,pressed=false}={}){
  k.at(x,z,yaw,()=>{
    F.longRoll(k,0,0,0,{length,width,color});
    fill(length*.86,width*.8);
    F.longRoll(k,0,-.5,0,{length,width,top:true,color,seeds,dome:pressed?.25:dome,tilt:pressed?null:[-.16,0]});
    if(crusty)for(let i=-2;i<=2;i++)k.drizzle([[i*length*.17-1,-1.3],[i*length*.17+1,.6]],.34,0xf0d9a6,{gloss:.2,ry:.06});
    if(pressed)for(let i=-3;i<=3;i++)k.drizzle([[i*length*.12-.6,-width*.4],[i*length*.12+.6,width*.3]],.2,0x7a4a20,{gloss:.3,ry:.05});
  });
  k.biteAngle=-yaw;k.biteAt=x+2;
}
const along=(n,len,fn)=>{for(let i=0;i<n;i++)fn((i-(n-1)/2)*len/n);};
const heroFills={
  turkey:(k)=>(len,w)=>{F.slicedMeat(k,0,0,0,{length:len,width:w,color:C.turkey,edge:0xb98a5a,layers:5});along(3,len,u=>F.cheeseSlice(k,u,0,.78,{w:4.4,color:C.swiss,sag:.7}));along(3,len,u=>F.shreds(k,u,.6,22,{r:2.3}));along(4,len,u=>F.tomatoSlices(k,u,.9,1,{r:2}));},
  italian:(k)=>(len,w)=>{F.slicedMeat(k,0,0,0,{length:len,width:w,color:C.ham,edge:0xa85a5a,layers:3});F.slicedMeat(k,0,.3,0,{length:len,width:w*.9,color:0x9c2f2a,edge:0x6a1a1a,layers:3});along(3,len,u=>F.cheeseSlice(k,u,0,.78,{w:4.4,color:0xf3e6c0,sag:.7}));along(3,len,u=>F.shreds(k,u,.7,22,{r:2.3}));along(4,len,u=>F.tomatoSlices(k,u,1,1,{r:2}));F.onionRings(k,0,.8,3,{r:1.9});},
  cutlet:(k)=>(len,w)=>{along(2,len,u=>F.cutlet(k,u,0,k.rand(-.2,.2),{w:len*.52,d:w*1.05,h:1.4}));along(3,len,u=>F.shreds(k,u,.7,24,{r:2.3}));along(4,len,u=>F.tomatoSlices(k,u,1,1,{r:2}));},
  chopped:(k)=>(len,w)=>{along(7,len,u=>F.chunks(k,u,0,3,{r:.8,color:C.beef,dark:0x2e1c14,spread:1.4,gloss:.42}));F.coat(k,0,0,len*.42,C.cheese,{rz:w*.5,thick:.14,amp:.25,gloss:.55});along(3,len,u=>F.shreds(k,u,.9,22,{r:2.2}));along(4,len,u=>F.tomatoSlices(k,u,1.2,1,{r:1.9}));},
  deli:(k)=>(len,w)=>{F.slicedMeat(k,0,0,0,{length:len,width:w,color:C.ham,edge:0xb46a62,layers:5});along(3,len,u=>F.cheeseSlice(k,u,0,.78,{w:4.4,sag:.7}));along(3,len,u=>F.shreds(k,u,.7,22,{r:2.3}));},
  banhmi:(k)=>(len,w)=>{F.slicedMeat(k,0,0,0,{length:len,width:w*.9,color:0xb9785a,edge:0x7a3a24,layers:3});k.at(0,-.9,0,()=>k.drop(tube([[-len/2,0,0],[len/2,0,0]],.7,{sides:6,ry:.45,curve:false}),0,0,{color:C.cucumber,gloss:.5,paint:toward(0xe6f0c0,(P,N)=>smooth(.3,1,N.y)*.7),whole:false}));along(3,len,u=>F.shreds(k,u,.8,26,{r:2.2,color:[C.carrot,0xf4f0e2,0xee9440],size:1.6}));F.herbs(k,0,.6,26,{r:len*.4,size:.9,onFood:1.5});along(5,len,u=>F.coin(k,u,1.4,{r:.6,h:.2,color:0x5c9a34,dark:0x3f7a24,tilt:.4}));},
  cubano:(k)=>(len,w)=>{F.slicedMeat(k,0,0,0,{length:len,width:w,color:C.ham,edge:0xb46a62,layers:3,h:.2});F.slicedMeat(k,0,0,0,{length:len,width:w,color:0xc9a27e,edge:0x8a5a34,layers:2,h:.2});along(3,len,u=>F.cheeseSlice(k,u,0,.78,{w:4.6,color:C.swiss,sag:.9}));along(5,len,u=>F.pickles(k,u,0,1,{spread:.4}));},
  lobster:(k)=>(len,w)=>{along(6,len,u=>F.chunks(k,u,0,2,{r:1.1,color:0xf4ece2,dark:0xe0503a,cover:.22,spread:.9,gloss:.5,bump:.3}));F.herbs(k,0,0,16,{r:len*.4,size:.5,color:[0x4d8a2c],onFood:1.4});},
};
function heroPlate(k,kind,o={}){
  if(o.foil)foil(k,25,19);else if(o.paper)W.deliPaper(k,25,19,{yaw:.25});else W.plate(k,12.5);
  W.leavings(k,{crumbs:[C.bun,C.crumb],n:26});
  hero(k,{fill:heroFills[kind](k),...o});
}
function hotDog(k,{x=0,z=0,yaw=.2,topping='mustard',brat=false}={}){
  k.at(x,z,yaw,()=>{
    for(const s of [-1,1])k.at(0,s*1.45,0,()=>k.drop(puck(F.roundedPath(14,2.9,1.4),2.5,{edge:.9,dome:.5,bump:.04,n:30}),0,0,{color:brat?0xc99a5a:C.bun,gloss:.3,inside:C.crumb,whole:false,paint:[toward(C.crumb,(P,N,L)=>smooth(-.2,-.9,L.z*s)*.8),browned(C.crust,.3,.5),mottle(.05,.8)]}),{tilt:[s*.5,0]});
    F.sausage(k,0,0,0,{length:brat?15:15.5,r:brat?1.3:1.1,color:brat?0xb8855a:0x9a3f28,bend:.25,lift:.3});
    if(topping==='mustard')F.zigzag(k,0,0,0,{length:13,width:1.1,turns:8,r:.2,color:C.mustard});
    if(topping==='kraut'){F.shreds(k,0,0,44,{r:1.3,color:[0xe9e2b8,0xd9d2a0,0xf1ecc8],size:1.5});F.zigzag(k,0,0,0,{length:12,width:.9,turns:7,r:.18,color:C.mustard});}
    if(topping==='onions'){for(let i=-3;i<=3;i++)F.coat(k,i*1.7,0,1.1,0xa8421e,{thick:.3,amp:.3});F.zigzag(k,0,0,0,{length:12,width:.9,turns:7,r:.18,color:C.mustard});}
  });
  k.biteAngle=-yaw;k.biteAt=x+2.5;
}

// ---- between slices ---------------------------------------------------------------
const TRI=[[-4.7,-4.5],[4.7,-4.5],[-4.7,4.7]];
function sliced(k,{x=0,z=0,yaw=0,fill,bread={},shape,top=true}={}){
  k.at(x,z,yaw,()=>{
    F.slice(k,0,0,0,{shape,...bread});
    fill();
    if(top)F.slice(k,k.rand(-.2,.2),k.rand(-.2,.2),k.rand(-.06,.06),{shape,...bread});
  });
}
const triangles=(k,fill,bread,{stack=1,pick=false}={})=>{
  for(const [x,z,yaw] of [[-3.4,1.2,.35],[3.6,-1.4,.35+Math.PI]]){
    for(let i=0;i<stack;i++)sliced(k,{x,z,yaw,fill:()=>fill(i),bread,shape:TRI,top:i===stack-1});
    if(pick)k.at(x,z,yaw,()=>{const y=k.top(-1.5,-1.4);k.ware(tube([[-1.5,y-2.5,-1.4],[-1.5,y+2,-1.4]],.1,{sides:5,curve:false}),{color:0xd9b87a,gloss:.3});k.ware(blob({r:.42,detail:1,bump:0}),{at:[-1.5,y+2.2,-1.4],color:k.pick([0xc93a2e,0x3a8a3a,0xe6b422]),gloss:.6});},{y:-k.top(x,z)});
  }
  k.biteAngle=.35;k.biteAt=1.2;
};

// ---- wrapped and folded -------------------------------------------------------------
function tacoShell(k,{R=5.7,rf=1.45,lean=.5}){
  const flat=rf*Math.PI/2,seed=k.rand(9);
  return sheet((u,v)=>{
    const a=u*TAU,rho=v*R*(1+.03*Math.sin(a*7+seed)),px=rho*Math.cos(a),pz=rho*Math.sin(a),s=Math.sign(px)||1,d=Math.abs(px);
    if(d<flat){const t=d/rf;return [s*rf*Math.sin(t),rf*(1-Math.cos(t))+.05,pz];}
    return [s*(rf+(d-flat)*Math.sin(lean)),rf+(d-flat)*Math.cos(lean)+.05,pz];
  },36,7);
}
function taco(k,x,z,yaw,{s=1,meat=0x8a4a2a,dark=0x4a2414,style='street',tilt=null}={}){
  k.at(x,z,yaw,()=>{
    k.add(tacoShell(k,{R:5.7*s,rf:1.45*s}),{color:style==='hard'?0xe6a93a:C.tortilla,gloss:.22,whole:false,paint:[spots(0xc09a4a,.14,1.3,k.rand(9)),mottle(.06,1)]});
    for(let pass=0;pass<2;pass++)for(let i=-3;i<=3;i++)F.chunk(k,k.rand(-.7,.7)*s,(i+pass*.5)*1.2*s,{r:.9*s,color:meat,dark,gloss:.45,detail:1});
    if(style==='street'){k.sprinkle('cube',26,{r:4.2*s,color:[0xf4efe2,0xe9e2d0],size:.4,onFood:1.6*s,gloss:.4});F.herbs(k,0,0,34,{r:4.2*s,size:.8,onFood:1.6*s});}
    else{for(let i=-2;i<=2;i++)F.shreds(k,0,i*1.8*s,12,{r:1.1*s,size:1.2});k.sprinkle('cube',12,{r:4*s,color:[C.tomato,0xd9503a],size:.4,onFood:1.6*s});k.sprinkle('fleck',22,{r:4*s,color:[C.cheddar,C.cheese],size:1.1,onFood:1.6*s});}
    if(style==='fish')k.drizzle([[0,-4*s],[.3,-1.5*s],[-.3,1.5*s],[0,4*s]],.3,0xf4f0e4);
  },{tilt});
}
function tacoPlate(k,n,o={}){
  W.plate(k,n>1?12.5:10.5);W.leavings(k,{crumbs:[C.tortilla,0x8a4a2a],smear:0xb9442a});
  const count=n>1&&k.level===1?n-1:n;
  for(let i=0;i<count;i++)taco(k,n>1?-1.8+(i-1)*4.7:0,n>1?(i-1)*.6:0,.12+i*.05,{s:n>1?.84:1.1,tilt:[0,-.3],...o});
  W.citrus(k,n>1?8.2:6.6,4.4,.8,{rind:C.lime,flesh:0xcfe08a,r:1.9});
  if(n>1){for(const [x,z] of [[7.6,-3.4],[8.6,-1.4]])F.coin(k,x,z,{r:1.2,h:.25,color:0xf6f2ea,dark:0xd9426a,cover:.0,gloss:.5,tilt:.1});k.cut=false;}
  else{k.biteAngle=1.4;k.biteAt=1.2;}
}
function burrito(k,{x=0,z=0,yaw=.3,length=15,r=2.9,color=C.flour,wrap=true,inside=0xc9a27a}={}){
  k.at(x,z,yaw,()=>{
    const y=r*.86;
    k.add(tube([[-length/2,y,0],[-length/4,y,0],[0,y,0],[length/4,y,0],[length/2,y,0]],r,{sides:14,ry:r*.86,taper:t=>.62+.38*Math.min(1,Math.sin(t*Math.PI)*3.2),steps:14}),{color,gloss:.22,inside,whole:false,paint:[spots(0xb8864a,.2,1.1,k.rand(9)),mottle(.06,.8)]});
    if(wrap)k.ware(tube([[-length/2-.1,y,0],[-length/4,y,0],[-.6,y,0]],r*1.045,{sides:14,ry:r*.9,taper:t=>(.64+.36*Math.min(1,Math.sin(t*Math.PI*.5)*3.2))*(1+.012*Math.sin(t*60)),steps:12,caps:false}),{color:W.FOIL,gloss:.62,paint:mottle(.14,2.2)});
  });
  k.biteAngle=-yaw;k.biteAt=x+3.4;
}
function pitaCone(k,{x=0,z=0,yaw=-.5,fill='gyro'}={}){
  // Built standing, then laid back on the plate.
  k.at(x,z,yaw,()=>{
    const pita=lathe([[1.1,0],[1.9,3],[2.9,7],[3.7,11.2],[3.5,11.3],[2.7,7],[1.7,3],[.9,.1]],22);
    k.add(pita,{color:C.pita,gloss:.2,whole:false,inside:C.crumb,paint:[spots(0xa9772e,.2,1.2,k.rand(9)),mottle(.07,.9)]});
    k.ware(lathe([[1.2,-.5],[2.05,3],[3.0,6.6],[2.95,6.6],[2.0,3],[1.1,-.5]],20,{wave:(a,j)=>1+.014*Math.sin(a*13+j)}),{color:fill==='gyro'?W.FOIL:W.PAPER,gloss:fill==='gyro'?.6:.2,paint:mottle(.1,2)});
    const meat=fill==='falafel'?null:fill==='shawarma'?0xc98a4a:0x8a5a40;
    for(let i=0;i<7;i++){const a=i*.9,d=1.5+(i%2)*.8;
      if(meat)k.add(sheet((u,v)=>[(u-.5)*3.4,v*1.2+.25*Math.sin(u*8+i),(.12*Math.sin(u*5+i))],6,2),{at:[Math.cos(a)*d,10.3+k.rand(.9),Math.sin(a)*d],rot:[k.rand(-.5,.5),a,k.rand(-.4,.4)],color:meat,gloss:.45,paint:[mottle(.2,2),toward(0x3e2418,(P,N,L)=>smooth(.9,1.2,L.y)*.8)],whole:true});
      else lump(k,[Math.cos(a)*d,10.9+k.rand(.5),Math.sin(a)*d],1.15,0x8a5a24,{dark:0x5a3a14,bump:.22,detail:2});
    }
    for(let i=0;i<26;i++){const a=k.rand(TAU),d=k.rand(3);k.add(F.bitOf('fleck'),{at:[Math.cos(a)*d,11.6+k.rand(.8),Math.sin(a)*d],rot:[k.rand(-.8,.8),k.rand(TAU),k.rand(-.8,.8)],scale:1.5,color:k.pick([C.lettuce,C.lettucePale,0x9cc456]),gloss:.3,whole:true,cast:false});}
    for(let i=0;i<4;i++){const a=1+i*1.5;k.add(puck(circle(1.25,10),.4,{edge:.15,n:14}),{at:[Math.cos(a)*2,11.7+k.rand(.4),Math.sin(a)*2],rot:[k.rand(-.9,.9),0,k.rand(-.9,.9)],color:C.tomato,gloss:.6,whole:true});}
    k.add(tube([[-2.2,12.3,-.6],[-.6,12.9,.8],[.9,12.5,-.4],[2.2,12.7,.9]],.36,{sides:6,ry:.2}),{color:C.white,gloss:.7,cast:false,whole:true});
    if(fill!=='falafel')for(let i=0;i<4;i++)k.add(lathe([[1,0],[1.14,.1],[1.14,.3],[1,.4],[.86,.3],[.86,.1],[1,0]],14),{at:[k.rand(-2,2),12.2+k.rand(.5),k.rand(-2,2)],rot:[k.rand(-.8,.8),0,k.rand(-.8,.8)],color:C.redOnion,gloss:.5,whole:true});
  },{tilt:[1.22,0],y:3.3});
  k.biteAngle=1.2;k.biteAt=1.5;
}

// ---- bagels -------------------------------------------------------------------------
function ringProfile(R,a,b,half){
  const pts=[],n=half?8:16,t0=half==='bottom'?Math.PI:half==='top'?0:-Math.PI/2,span=half?Math.PI:TAU;
  for(let i=0;i<=n;i++){const t=t0+span*i/n;pts.push([R+a*Math.cos(t),(half==='top'?0:b)+b*Math.sin(t)]);}
  if(half==='bottom')pts.push([R-a,b]);
  if(half==='top')pts.push([R+a,0]);
  return pts;
}
function bagelHalf(k,x,z,half,{R=3.5,a=2,b=1.5,color=0xc9903e,seeds=null,toasted=false,tilt=null,lift=0,yaw=0}={}){
  k.at(x,z,yaw,()=>{
    k.drop(lathe(ringProfile(R,a,b,half),28,{bump:.05,freq:.5,seed:k.rand(9)}),0,0,{lift,settle:1,color,gloss:.42,inside:C.crumb,whole:false,
      paint:[toward(toasted?0xd9a85a:C.crumb,(P,N)=>half==='bottom'?smooth(.8,.97,N.y):half==='top'?smooth(-.8,-.97,N.y):0),half==='bottom'?null:browned(0x8f531f,.45,.6),mottle(.07,.9)].filter(Boolean)});
    if(seeds && half!=='bottom')k.sprinkle('seed',seeds==='everything'?90:60,{r:R+a*.8,color:seeds==='everything'?[0xf3e3b8,0x2a2a30,0xe9d9b0,0xd9b98a,0x3a3a44]:seeds==='poppy'?[0x2a2a30]:[0xf3e3b8,0xe9d39c],size:.42,onFood:k.top(R,0)-b*.7,gloss:.3});
  },{tilt});
}
function schmear(k,x,z,{R=3.5,a=2.15,color=C.cream,h=.9}={}){
  k.drop(lathe([[R-a,0],[R,-.05],[R+a,0],[R+a+.1,h*.5],[R+a,h],[R,h+.1],[R-a,h],[R-a-.1,h*.5],[R-a,0]],28,{bump:.07,freq:.9,seed:k.rand(9)}),x,z,{settle:1,color,gloss:.45,whole:false,paint:mottle(.04,1.2)});
}
function bagel(k,{style='cream',seeds=null}={}){
  W.plate(k,style==='butter'?12.5:9.5);W.leavings(k,{crumbs:[0xc9903e,C.crumb,0xf3e3b8],n:26,r:4.5});
  if(style==='butter'){
    bagelHalf(k,-5.6,.3,'bottom',{seeds,toasted:true});bagelHalf(k,5.6,-.3,'bottom',{seeds,toasted:true,yaw:1});
    for(const x of [-5.6,5.6])k.add(lathe([[1.9,0],[3.5,.06],[5.1,0]],24),{at:[x,k.top(x+3.5,x>0?-.3:.3)+.04,x>0?-.3:.3],color:0xf6dc7a,gloss:.8,whole:false,paint:mottle(.1,1.5),cast:false});
    k.biteAngle=0;k.biteAt=1;return;
  }
  bagelHalf(k,0,0,'bottom',{seeds:null});
  if(style==='bec'){
    k.add(puck(circle(5,14),.7,{edge:.3,dome:.2,bump:.2,freq:.6,seed:k.rand(9),n:28}),{at:[0,.02,0],drape:1,wide:.5,color:0xf3d35a,gloss:.45,whole:false,paint:[toward(C.egg,(P,N,L)=>.6*smooth(.4,.7,fbm(L.x*.6,2,L.z*.6)+.5)),mottle(.06,1)]});
    F.cheeseSlice(k,0,0,.6,{w:8.4,sag:1});F.bacon(k,0,-1.2,.25,{length:10});F.bacon(k,0,1.2,-.2,{length:10});
  }else{
    schmear(k,0,0,{h:style==='lox'?.6:1});
    if(style==='lox'){
      for(let i=0;i<5;i++){const a=i*TAU/5+.3,seed=k.rand(9);k.add(sheet((u,v)=>[(u-.5)*5.6,.25*Math.sin(u*7+seed)+.3,(v-.5)*3.2*(1+.2*Math.sin(u*5+seed))],12,4),{at:[Math.cos(a)*3.2,.04,Math.sin(a)*3.2],rot:[0,-a+1.4,0],drape:.8,wide:.3,color:C.salmon,gloss:.6,whole:false,paint:[toward(0xf6c9ae,(P,N,L)=>.7*smooth(.72,.95,Math.abs(Math.sin(L.x*3.4+L.z*.8)))),mottle(.06,1.4)]});}
      F.onionRings(k,0,0,2,{r:2.7});k.sprinkle('pea',9,{r:4.6,color:[0x5a6e2e,0x6b7a34],size:.5,onFood:2.2,gloss:.5});
    }
  }
  bagelHalf(k,.3,-.3,'top',{seeds,tilt:[-.06,.03]});
  k.biteAngle=.25;k.biteAt=1.2;
}

// ---- pizza --------------------------------------------------------------------------
function pizzaSlice(k,x,z,yaw,{s=1,top='cheese'}={}){
  const L=20*s,Wd=15*s,back=L*.42,tip=-L*.58,tri=[[-Wd/2+.9*s,back],[Wd/2-.9*s,back],[Wd/2-.2*s,back-1.5*s],[0,tip],[-Wd/2+.2*s,back-1.5*s]];
  k.at(x,z,yaw,()=>{
    k.add(puck(tri,.5,{sharp:true,edge:.2,n:42}),{at:[0,.04,0],drape:.001,color:0xdcae62,gloss:.2,inside:C.crumb,whole:false,paint:[spots(0x9a6427,.25,1.2,k.rand(9)),mottle(.08,1)]});
    // Cheese on a fine grid, so that blisters and sauce can show in it.
    const seed=k.rand(9),edge=1.9*s,cheese=sheet((u,v)=>{
      const pz=tip+1.2*s+v*(back-edge-tip-1.2*s),half=(pz-tip)/(back-tip)*Wd/2-.7*s,px=(u*2-1)*Math.max(0,half);
      return [px,.14+.09*fbm(px*1.5+seed,2,pz*1.5),pz];
    },12,18);
    k.add(cheese,{at:[0,.02,0],drape:.001,color:top==='white'?0xf4ecd2:0xf3cd6c,gloss:.62,whole:false,
      paint:[top==='white'?spots(0xfffaf0,.35,.8,seed):spots(0xcf6a30,.26,1.25,seed),spots(0xc98a36,.16,2.1,seed+3),mottle(.06,2.4)]});
    const rim=Array.from({length:9},(_,i)=>{const t=i/8-.5;return [t*Wd*.96,k.top(t*Wd*.9,back-.8*s)+.5*s,back-.35*s-1.6*s*t*t];});
    k.add(tube(rim,.98*s,{sides:9,ry:.78*s,taper:t=>(.9+.1*Math.sin(t*Math.PI))*(1+.07*Math.sin(t*23)),steps:24}),{color:0xd8a152,gloss:.25,inside:C.crumb,whole:false,paint:[browned(0x8f531f,.7,1.1),spots(0x4a2c18,.1,2,seed),mottle(.1,1.4)]});
    if(top==='pepperoni')for(const [u,v] of [[-2.2,2.8],[2.3,3.4],[0,-.6],[-1.1,-4.4],[2.6,-.2],[-3.6,5]])
      k.drop(lathe([[0,0],[1.25,0],[1.42,.2],[1.3,.25],[1.02,.12],[0,.1]],16),u*s,v*s,{color:0xa52e1e,gloss:.65,whole:true,paint:[outward(0x6e1a12,1,1.4,.7),mottle(.14,2.5)]});
    if(top==='white'){for(const [u,v] of [[-1.8,3],[1.9,1.4],[-.2,-2.6],[2.6,4.6]])F.dollop(k,u*s,v*s,{r:1.5,h:.5,color:0xfbf7ee,gloss:.45});k.sprinkle('fleck',14,{r:5*s,color:[0x4d8a2c,0x2a2a2a],size:.5,onFood:.5,flat:true});}
  });
}
function slicePlate(k,{n=1,top='cheese',soda=false}={}){
  W.paperPlate(k,n>1?12.5:11.5);W.leavings(k,{crumbs:[0xdcae62,0xb9772c],smear:0xd98a4a,n:14});
  if(n===1){pizzaSlice(k,0,.6,.25,{top});k.biteAngle=-1.82;k.biteAt=5.2;}
  else{if(k.level)pizzaSlice(k,-3.1,.4,.18,{s:.82,top});if(k.level===2)pizzaSlice(k,3.3,1,-.5,{s:.82,top});k.cut=false;}
  if(soda)can(k,8.6,-8.4,{color:0xb23a2a});
}
function sicilian(k){
  W.paperPlate(k,11.5);W.leavings(k,{crumbs:[0xdcae62,0xb9772c],smear:0xa62f1e,n:14});
  k.at(0,0,.3,()=>{
    k.drop(brick(10,2.3,13,.5,{n:36,bump:.05}),0,0,{color:0xdcae62,gloss:.2,inside:0xf3e6c4,whole:false,paint:[toward(0x9a6427,(P,N)=>smooth(.5,-.2,N.y)*.8*(.6+.4*sn(P.x,P.y,P.z))),mottle(.07,1)]});
    const seed=k.rand(9);
    k.add(sheet((u,v)=>[(u-.5)*8.8,.1+.1*fbm(u*9+seed,1,v*12),(v-.5)*11.8],12,16),{at:[0,.03,0],drape:.001,color:0xb23a22,gloss:.6,whole:false,paint:[spots(0xf3d27a,.42,1.1,seed),spots(0xc98a36,.12,2.2,seed),mottle(.08,2)]});
    k.sprinkle('fleck',12,{r:4,color:[0x4d8a2c],size:.6,onFood:2,flat:true});
  });
  k.biteAngle=-1.4;k.biteAt=1.5;
}
function pie(k,{r=11.5}={}){
  k.ware(lathe([[0,0],[r+1.2,0],[r+1.5,.25],[r+1.3,.4],[r+.6,.3],[0,.3]],48),{color:0x9da2a6,gloss:.6,paint:mottle(.08,1.5)});
  W.leavings(k,{crumbs:[0xdcae62,0xb9772c],smear:0xa62f1e,n:20,r:7});
  const seed=k.rand(9);
  k.add(lathe([[0,0],[r,0],[r+.1,.5],[r-.2,1.0],[r-1.1,1.1],[r-1.7,.6],[r-3,.5],[r-5,.5],[r-7.5,.5],[0,.5]],44,{bump:.035,freq:.5,seed}),{at:[0,.3,0],color:0xdcae62,gloss:.25,inside:C.crumb,whole:false,paint:[toward(0x8f531f,(P,N,L)=>smooth(r-2.2,r-.6,Math.hypot(L.x,L.z))*(.35+.5*fbm(P.x*.9,1,P.z*.9+4))),spots(0x3a2416,.07,1.9,seed),mottle(.08,1.2)]});
  k.add(sheet((u,v)=>{const a=u*TAU,d=v*(r-1.9);return [Math.cos(a)*d,.86+.07*fbm(Math.cos(a)*d*1.3+seed,2,Math.sin(a)*d*1.3),Math.sin(a)*d];},48,9),{color:0xb8361f,gloss:.6,whole:false,paint:[spots(0xf6ecd0,.44,.42,seed),spots(0xc98a36,.1,2,seed),mottle(.08,2.2)]});
  for(let i=0;i<7;i++){const [x,z]=k.spot(0,0,r-3.4);k.drop(sheet((u,v)=>[(u-.5)*2.6,.12*Math.sin(u*3.1)+.05,(v-.5)*1.7*Math.sin(Math.PI*(.15+.7*u))],5,3),x,z,{rot:[0,k.rand(TAU),0],color:0x3f8a34,gloss:.4,paint:mottle(.15,2),whole:true});}
  k.biteAngle=.4;k.biteAt=-1;
}
function calzone(k){
  W.plate(k,12);W.leavings(k,{crumbs:[0xdcae62,0xb9772c],smear:C.marinara});
  const half=Array.from({length:13},(_,i)=>{const a=Math.PI*i/12;return [Math.cos(a)*8.2,Math.sin(a)*5.6-2.4];});
  k.at(-1.2,.6,.3,()=>{
    k.drop(puck(half,1.2,{edge:.55,dome:2.2,bump:.12,freq:.5,seed:k.rand(9),n:40}),0,0,{color:0xdcae62,gloss:.32,inside:0xf6ecd0,whole:false,paint:[browned(0x9a5a22,.7,.7),spots(0x4a2c18,.07,1.8,k.rand(9)),mottle(.08,1)]});
    const rim=Array.from({length:15},(_,i)=>{const a=Math.PI*i/14;return [Math.cos(a)*7.9,.7,Math.sin(a)*5.4-2.4];});
    k.add(tube(rim,.62,{sides:7,ry:.5,taper:t=>1+.25*Math.sin(t*70),steps:42}),{color:0xcf9a4c,gloss:.3,whole:false,paint:[browned(0x8f531f,.6,1),mottle(.1,1.4)]});
  });
  W.ramekin(k,7.2,-5.6,C.marinara,{r:2.5,full:k.level===2?1:.5});
  k.biteAngle=.3;k.biteAt=1;
}
function garlicKnots(k){
  W.paperPlate(k,10);W.leavings(k,{crumbs:[0xdcae62,0x4d8a2c],n:16,r:4});
  const n=k.level===1?3:5;
  for(let i=0;i<n;i++){
    const a=i*TAU/5+.4,x=Math.cos(a)*3.7-1.4,z=Math.sin(a)*3.7;
    k.at(x,z,k.rand(TAU),()=>{
      const pts=Array.from({length:13},(_,j)=>{const t=j/12*TAU*1.25;return [Math.cos(t)*1.35+Math.cos(2*t)*.5,1.0+.5*Math.sin(3*t),Math.sin(t)*1.35-Math.sin(2*t)*.5];});
      k.add(tube(pts,.85,{sides:8,steps:30}),{color:0xdcb46a,gloss:.5,whole:true,paint:[browned(0x9a5a22,.55,1),mottle(.08,1.4)]});
      k.sprinkle('fleck',7,{r:1.7,color:[0x4d8a2c,0xf3ead0],size:.42,onFood:1.2});
    });
  }
  W.ramekin(k,5.8,-.4,C.marinara,{r:2.3,full:k.level===2?1:.5});
  k.cut=false;
}

export const handheld={
  burger:k=>burgerPlate(k),'burger-deluxe':k=>burgerPlate(k,{sides:'fries'}),'burger-double':k=>burgerPlate(k,{patties:2,basket:true}),
  'bacon-burger':k=>burgerPlate(k,{baconOn:true,basket:true}),sliders,
  'chicken-sandwich':k=>burgerPlate(k,{fried:true,cheese:false,seeds:null,basket:true,sauce:C.mayo}),
  'fish-sandwich':k=>burgerPlate(k,{fish:true,seeds:null,sauce:0xf1ecd2}),
  'pulled-pork':k=>burgerPlate(k,{pulled:true,slaw:true,seeds:null,sides:'slaw'}),
  bec:k=>{foil(k,22,19);W.leavings(k,{crumbs:[C.bun,C.yolk]});F.bunBottom(k,0,0,{r:4.8});
    k.add(puck(circle(5.1,14),.7,{edge:.3,dome:.2,bump:.2,freq:.6,seed:3,n:28}),{at:[0,.02,0],drape:1,wide:.5,color:0xf3d35a,gloss:.45,whole:false,paint:[toward(C.egg,(P,N,L)=>.6*smooth(.4,.7,fbm(L.x*.6,2,L.z*.6)+.5)),mottle(.06,1)]});
    F.cheeseSlice(k,0,0,.6,{w:8.6,sag:1.1});F.bacon(k,0,-1.3,.25,{length:10.5});F.bacon(k,0,1.2,-.2,{length:10.5});F.bunTop(k,0,0,{r:4.8,seeds:null,kaiser:true,tilt:-.1});k.biteAngle=.2;k.biteAt=1.2;},
  'egg-cheese':k=>{foil(k,22,19);W.leavings(k,{crumbs:[C.bun,C.yolk]});F.bunBottom(k,0,0,{r:4.8});
    k.add(puck(circle(5.2,14),.9,{edge:.35,dome:.3,bump:.25,freq:.6,seed:5,n:28}),{at:[0,.02,0],drape:1,wide:.5,color:0xf3d35a,gloss:.45,whole:false,paint:[toward(C.egg,(P,N,L)=>.6*smooth(.4,.7,fbm(L.x*.6,2,L.z*.6)+.5)),mottle(.06,1)]});
    F.cheeseSlice(k,0,0,.6,{w:8.6,sag:1.1});F.bunTop(k,0,0,{r:4.8,seeds:'poppy',kaiser:true,tilt:-.1});k.biteAngle=.2;k.biteAt=1.2;},
  'chopped-cheese':k=>heroPlate(k,'chopped',{foil:true}),hero:k=>heroPlate(k,'turkey',{paper:true,seeds:true}),
  'deli-sandwich':k=>heroPlate(k,'deli',{paper:true}),'italian-hero':k=>heroPlate(k,'italian',{paper:true,seeds:true}),
  'cutlet-hero':k=>heroPlate(k,'cutlet',{foil:true}),
  'banh-mi':k=>heroPlate(k,'banhmi',{paper:true,color:0xd9a85a,crusty:true,length:18,width:5.2}),
  cubano:k=>heroPlate(k,'cubano',{color:0xd9a85a,pressed:true,length:16}),
  'lobster-roll':k=>{W.tray(k,20,12,3.2,{color:W.PAPER,gloss:.15,flare:.22,corner:1.6});W.leavings(k,{crumbs:[C.bun,0xd9442e]});hero(k,{x:-.5,yaw:.08,length:13.5,width:5,fill:heroFills.lobster(k),color:0xd9a85a,dome:.5});W.citrus(k,6.6,3.2,.6,{r:1.8});},
  'hot-dog':k=>{W.tray(k,19,8,3,{color:W.PAPER,gloss:.15,flare:.24,corner:1.4});W.leavings(k,{crumbs:[C.bun],smear:C.mustard,r:4,n:10});hotDog(k,{yaw:.04,topping:'onions'});},
  bratwurst:k=>{W.plate(k,12);W.leavings(k,{crumbs:[C.bun],smear:C.mustard});hotDog(k,{x:-1,z:1.6,yaw:.2,topping:'kraut',brat:true});F.dollop(k,5.5,-5.2,{r:1.8,h:.8,color:C.mustard,gloss:.6});F.shreds(k,-3,-5.4,60,{r:3,color:[0xe9e2b8,0xd9d2a0,0xf1ecc8],size:1.6});},
  pastrami:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[C.rye,C.ryeCrumb],smear:C.mustard});const bread={color:C.ryeCrumb,crust:C.rye,s:.95};
    sliced(k,{x:-1.2,yaw:.2,bread,fill:()=>{F.slicedMeat(k,0,0,0,{length:11,width:8.4,layers:9,color:C.pastrami,h:.5});F.zigzag(k,0,0,.4,{length:7,width:4,turns:4,r:.2,color:C.mustard});}});
    F.spear(k,7.4,1.5,1.3);k.biteAngle=.2;k.biteAt=0;},
  reuben:k=>{W.plate(k,12);W.leavings(k,{crumbs:[C.rye,C.ryeCrumb],smear:0xe9a27a});const bread={color:C.ryeCrumb,crust:C.rye,toasted:.9,s:.95};
    triangles(k,()=>{F.slicedMeat(k,0,-1,0,{length:7,width:6,layers:5,color:0xb0504a,h:.45});F.shreds(k,-1,-1,26,{r:2.2,color:[0xe9e2b8,0xd9d2a0],size:1.4});F.cheeseSlice(k,-1.2,-1.2,.2,{w:6,color:C.swiss,sag:.8});},bread);},
  'grilled-cheese':k=>{W.plate(k,11);W.leavings(k,{crumbs:[C.toast,C.crumb]});triangles(k,()=>F.cheeseSlice(k,-1.2,-1.2,.1,{w:7.4,color:C.cheddar,sag:1.3}),{toasted:1,h:1.2});},
  blt:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[C.toast,C.crumb]});triangles(k,()=>{F.lettuce(k,-1.2,-1.2,{r:4.4});F.tomatoSlices(k,-1.4,-1.4,2,{r:2.2,spread:1.2});F.bacon(k,-1.2,-1.6,.8,{length:7});F.bacon(k,-1.6,-.6,.7,{length:7});},{toasted:.8},{pick:true});},
  club:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.toast,C.crumb]});triangles(k,i=>{if(i){F.lettuce(k,-1.2,-1.2,{r:4.2});F.tomatoSlices(k,-1.4,-1.4,2,{r:2.1,spread:1.1});F.bacon(k,-1.4,-1.2,.8,{length:7});}else F.slicedMeat(k,-1.2,-1.2,.8,{length:7,width:5.4,layers:4,color:C.turkey,edge:0xb98a5a});},{toasted:.8},{stack:2,pick:true});F.fries(k,0,-7.6,10,{r:2.4,along:0});},
  croque:k=>{W.plate(k,11);W.leavings(k,{crumbs:[C.toast,C.crumb],smear:0xf1e2b0});
    sliced(k,{yaw:.3,bread:{toasted:.8},fill:()=>{F.slicedMeat(k,0,0,0,{length:9.4,width:8,layers:3,color:C.ham,edge:0xb46a62});F.cheeseSlice(k,0,0,0,{w:9,color:C.swiss,sag:.8});}});
    F.coat(k,0,0,4.6,0xf3e2a8,{thick:.3,amp:.12,gloss:.55,paint:spots(0xb9772c,.34,1.2,4)});k.biteAngle=.3;k.biteAt=.8;},
  lunch:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.toast,C.crumb]});triangles(k,()=>{F.slicedMeat(k,-1.2,-1.2,.8,{length:7,width:5.4,layers:4,color:C.turkey,edge:0xb98a5a});F.lettuce(k,-1.2,-1.2,{r:4.2});},{});F.shreds(k,0,-7.4,60,{r:2.6,size:1.6});k.sprinkle('cube',8,{x:0,z:-7.4,r:2.4,color:[C.tomato],size:.6,onFood:.8});},
  'avocado-toast':k=>{W.plate(k,11);W.leavings(k,{crumbs:[C.toast,C.avocado]});
    F.slice(k,0,0,.3,{toasted:.9,h:1.3,s:1.05});F.coat(k,0,.2,4.5,C.avocado,{rz:4.3,thick:.5,amp:.1,gloss:.35,paint:spots(0xc9d98a,.35,1.4,2)});
    F.friedEgg(k,0,.2,{r:3.4});k.sprinkle('shard',26,{r:4.2,color:[0xb9382c,0x2a2a2a,0xd9503a],size:.26,onFood:1.6,flat:true});k.biteAngle=.3;k.biteAt=1;},
  gyro:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[C.pita],smear:C.white});pitaCone(k,{fill:'gyro'});},
  falafel:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[C.pita,0x8a5a24],smear:0xe9dfc0});pitaCone(k,{fill:'falafel'});},
  shawarma:k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[C.pita],smear:C.white});pitaCone(k,{fill:'shawarma'});},
  taco:k=>tacoPlate(k,1),tacos:k=>tacoPlate(k,3,{meat:0xa8532a,dark:0x5a2a14}),
  burrito:k=>{foil(k,24,17,.4);W.leavings(k,{crumbs:[C.flour,C.rice],smear:0xb9442a});burrito(k);},
  roti:k=>{W.deliPaper(k,24,19,{yaw:.3});W.leavings(k,{crumbs:[0xe3c383],smear:C.curry});
    k.at(0,0,.25,()=>k.drop(brick(13,3,9.5,1.3,{n:36,bump:.12,freq:.5}),0,0,{color:0xe6c98a,gloss:.25,inside:C.curry,whole:false,paint:[spots(0xa9772e,.28,.9,k.rand(9)),mottle(.07,.9)]}));k.biteAngle=-.25;k.biteAt=1.5;},
  quesadilla:k=>{W.plate(k,12.5);W.leavings(k,{crumbs:[C.flour],smear:0xb9442a});
    const n=k.level===1?2:4;
    for(let i=0;i<n;i++)F.flatbread(k,-2.4+Math.cos(i*1.25-.9)*3.2,Math.sin(i*1.25-.9)*3.6,-i*1.25+2.4,{outline:[[-4.4,-3.4],[4.6,-3.4],[0,4.6]],h:.95,color:C.flour,blister:0x9a6a34,cover:.3,lift:.05+i*.12});
    W.ramekin(k,6.6,-4.4,0xb9442a,{full:k.level===2?1:.4});F.dollop(k,7,1.4,{r:1.8,h:1,color:C.guac,paint:spots(0xc9d98a,.3,1.6,2)});F.dollop(k,5.2,5.4,{r:1.6,h:.9,color:C.cream});k.cut=false;},
  arepa:k=>{W.plate(k,10.5);W.leavings(k,{crumbs:[0xf1e2b0,0x3a2420]});
    const cake=()=>puck(circle(4.9,16),1.05,{edge:.42,dome:.1,bump:.06,n:28});
    k.drop(cake(),0,0,{color:0xf3e6bc,gloss:.2,inside:0xf6eccc,whole:false,paint:[spots(0x9a6427,.26,1,2),mottle(.06,1)]});
    for(let i=0;i<14;i++){const [x,z]=k.spot(.6,.4,3.8);k.drop(tube([[-1.5,0,0],[0,.3,k.rand(-.5,.5)],[1.5,0,0]],.4,{sides:5,ry:.28}),x,z,{rot:[0,k.rand(TAU),k.rand(-.3,.3)],color:k.pick([0x6e3a20,0x8a4a2a]),gloss:.5,paint:mottle(.2,2),whole:true});}
    F.beans(k,-2,1.5,{r:2.2,n:24,h:.5,size:.6});k.sprinkle('fleck',26,{r:4,color:[0xf6f1e2,0xf3e6c0],size:1.1,onFood:1.6});
    k.drop(cake(),.2,-.9,{rot:[-.22,0,0],color:0xf3e6bc,gloss:.2,inside:0xf6eccc,whole:false,paint:[spots(0x9a6427,.3,1,5),mottle(.06,1)]});k.biteAngle=.2;k.biteAt=1.2;},
  doubles:k=>{W.deliPaper(k,20,18,{yaw:.2});W.leavings(k,{crumbs:[0xe9b84a],smear:C.curry});
    for(const [x,z,a] of [[-2.6,.4,.3],[2.8,-.6,1.4]])k.at(x,z,a,()=>k.add(puck(F.wobble(5.2,14,.1,k.rand(9),4.6),.5,{edge:.2,dome:.2,bump:.2,freq:.6,seed:k.rand(9),n:28}),{at:[0,.05,0],drape:.6,color:0xe9b84a,gloss:.3,inside:0xf3dc9a,whole:false,paint:[spots(0xb9772c,.25,1,k.rand(9)),mottle(.07,1)]}));
    F.beans(k,0,0,{r:4,color:C.chickpea,sauce:0xb9772a,n:40,h:.7,size:.8});F.zigzag(k,0,0,.5,{length:6,width:3,turns:3,r:.2,color:0x5a2a1a});k.sprinkle('fleck',14,{r:3.4,color:[C.cucumber,0x4d8a2c],size:.8,onFood:1});k.biteAngle=.3;k.biteAt=1;},
  'summer-rolls':k=>{W.plate(k,11.5);W.leavings(k,{crumbs:[0x4d8a2c],smear:0xb9844a,n:8});
    const n=k.level===1?2:3;
    for(let i=0;i<n;i++)k.at(-2.6+k.rand(-.2,.2),(i-1)*3.5,k.rand(-.12,.12),()=>{
      k.drop(tube([[-5,0,0],[0,0,0],[5,0,0]],1.55,{sides:12,ry:1.3,taper:t=>.75+.25*Math.min(1,Math.sin(t*Math.PI)*3),steps:14}),0,0,{color:0xe9e6d6,gloss:.6,whole:false,inside:0xf1ecd8,paint:[toward(C.shrimp,(P,N,L)=>N.y>.3?.85*smooth(.55,.8,Math.sin(L.x*1.9+i)):0),toward(0x5c9a34,(P,N,L)=>N.y<.3?.6*smooth(.2,.6,sn(L.x*1.2,i,L.z*2)):0),mottle(.04,1.5)]});
    });
    W.ramekin(k,6.4,0,0xb9844a,{r:2.6,full:k.level===2?1:.5,paint:spots(0xe9d9a8,.2,2,1)});k.cut=false;},
  bagel:k=>bagel(k,{style:'cream',seeds:'sesame'}),lox:k=>bagel(k,{style:'lox',seeds:'everything'}),
  'bagel-everything':k=>bagel(k,{style:'butter',seeds:'everything'}),'bagel-bec':k=>bagel(k,{style:'bec',seeds:'poppy'}),
  bialy:k=>{W.plate(k,9);W.leavings(k,{crumbs:[0xd9b06a,C.crumb],r:4});
    k.drop(lathe([[0,0],[4.6,0],[5.1,.5],[5.1,1.2],[4.4,1.9],[3.2,2],[2.3,1.3],[1.6,.9],[0,.85]],28,{bump:.06,freq:.5,seed:2}),0,0,{color:0xe3c58a,gloss:.2,inside:C.crumb,whole:false,paint:[browned(0xa9742e,.5,.8),spots(0xf6ecd4,.3,1.4,3),mottle(.07,1)]});
    k.sprinkle('cube',26,{r:1.8,color:[0x8a5a24,0xb9843a,0x6e4a1e],size:.4,onFood:.9});k.sprinkle('seed',16,{r:2,color:[0x2a2a30],size:.3,onFood:.9});k.biteAngle=.2;k.biteAt=1.2;},
  pizza:k=>slicePlate(k),'pizza-pepperoni':k=>slicePlate(k,{top:'pepperoni'}),'small-plate':k=>slicePlate(k,{top:'pepperoni'}),
  'pizza-white':k=>slicePlate(k,{top:'white'}),'pizza-combo':k=>slicePlate(k,{n:2,soda:true}),'pizza-sicilian':sicilian,
  'pizza-margherita':k=>pie(k),calzone,'garlic-knots':garlicKnots,
};
