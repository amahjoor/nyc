// Drinks: the vessel, what is in it and how much is left.
import { blob,lathe,puck,tube,sheet,brick,circle,TAU,fbm,sn,smooth,mottle,toward,spots,volumeHeight } from './food-kit.js';
import { sodaCan } from './food-packaging.js';
import { CHINA,PAPER,FOIL } from './food-ware.js';

const GLASS=0xdcecea;
/**
 * A vessel turned from its outer profile, bottom to rim. Returns how wide it is
 * inside at a height, so that it can be filled.
 */
function vessel(k,profile,{wall=.14,floor=.5,color=CHINA,opacity=1,gloss=.7,paint=null,seg=28}={}){
  const top=profile.at(-1),inner=[...profile].reverse().filter(([,y])=>y>=profile[0][1]+floor).map(([r,y])=>[Math.max(.05,r-wall),y]);
  const base=profile[0][1]+floor;
  inner.push([Math.max(.05,inner.at(-1)[0]),base],[0,base]);
  k.ware(lathe([[0,profile[0][1]],...profile,[top[0]-wall*.5,top[1]+wall*.4],...inner],seg),{color,opacity,gloss,paint,shade:opacity===1});
  const width=y=>{for(let i=0;i<inner.length-1;i++){const [r0,y0]=inner[i],[r1,y1]=inner[i+1];if(y<=y0 && y>=y1)return y0===y1?r1:r1+(r0-r1)*(y-y1)/(y0-y1);}return inner[0][0];};
  return {width,floor:base,top:top[1],r:top[0]};
}
/** Decrease the volume while leaving the vessel and its rim in place. */
function pour(k,v,share,color,{gloss=.85,paint=null,headroom=.9}={}){
  if(k.amount<=0)return v.floor;
  const full=v.floor+(v.top*headroom-v.floor)*share;
  const y=volumeHeight(v.floor,full,v.width,k.amount),rings=[[0,v.floor+.02]];
  for(let i=0;i<=6;i++){const h=v.floor+.02+(y-v.floor-.02)*i/6;rings.push([v.width(h)*.93,h]);}
  const r=rings.at(-1)[0];rings.push([r*.6,y+.02],[r*.3,y+.02],[0,y+.02]);
  k.add(lathe(rings,32),{color,gloss,paint,whole:true,cast:false});
  return y+.02;
}
function ice(k,v,y,n=4){for(let i=0;i<n;i++){const a=i*TAU/n+.4,d=v.width(y)*.45;k.add(brick(1.5,1.2,1.5,.3,{n:12}),{at:[Math.cos(a)*d,Math.max(v.floor+.55,y-.75),Math.sin(a)*d],rot:[k.rand(-.4,.4),k.rand(TAU),k.rand(-.4,.4)],color:0xe6f0f0,gloss:.9,whole:true,cast:false});}}
function straw(k,v,{color=0xf1ece4,r=.28,lean=.22,stripe=null}={}){
  const h=v.top+4.5;
  k.ware(tube([[-lean*4,v.floor+.3,0],[lean*h*.5,h,0]],r,{sides:8,curve:false,caps:false}),{color,gloss:.45,paint:stripe?toward(stripe,(P)=>smooth(.4,.6,Math.sin(P.y*3.2))):null});
}
function wheel(k,v,color,flesh){
  const r=1.9,x=v.r-.2,y=v.top+.2;
  k.add(lathe([[0,-.14],[r,-.14],[r,.14],[0,.14]],18),{at:[x,y,0],rot:[0,0,Math.PI/2-.2],color:flesh,gloss:.65,paint:[toward(color,(P,N,L)=>smooth(r*.8,r*.92,Math.hypot(L.x,L.z))),toward(0xffffff,(P,N,L)=>.3*smooth(.6,.9,Math.abs(Math.sin(Math.atan2(L.z,L.x)*4))))],whole:true,cast:false});
}
function foam(k,v,y,color=0xf4ead2,h=.9){
  h*=Math.sqrt(k.amount);
  const r=v.width(y)*.97;
  k.add(lathe([[0,y-.05],[r,y-.05],[v.width(y+h)*.97,y+h*.8],[r*.7,y+h],[r*.35,y+h*1.05],[0,y+h*1.05]],24,{bump:.03,freq:1.4}),{color,gloss:.35,paint:mottle(.05,2.4),whole:true,cast:false});
}
function stem(k,{foot=3.4,h=7,r=.32,opacity=.3}={}){
  k.ware(lathe([[0,0],[foot,0],[foot,.15],[r*2,.5],[r,1.2],[r,h],[0,h]],24),{color:GLASS,opacity,gloss:.9,shade:false});
}
const mint=(k,x,y,z,n=4)=>{for(let i=0;i<n;i++)k.add(sheet((u,v)=>[(u-.5)*1.9,.25*Math.sin(u*3.1),(v-.5)*1.1*Math.sin(Math.PI*(.12+.76*u))],4,2),{at:[x+k.rand(-.6,.6),y+k.rand(.3),z+k.rand(-.6,.6)],rot:[k.rand(-.6,.6),k.rand(TAU),k.rand(-.6,.6)],color:0x4f9a3a,gloss:.4,whole:true,cast:false});};

// ---- vessels --------------------------------------------------------------------
// The wall is turned in bands so that the print on it has edges to keep to.
const paperCup=(k,{color=PAPER,band=null,bandColor=0x2f5aa8,h=10.6,r=4.15}={})=>vessel(k,[[r*.7,0],[r*.72,.3],...[.1,.13,.38,.41,.59,.62,.87,.9].map(t=>[r*(.72+.28*t),h*t]),[r,h],[r*1.04,h+.06],[r*1.04,h+.22]],{wall:.1,floor:.5,color,gloss:.25,seg:32,
  paint:band?[toward(bandColor,(P,N,L)=>N.y<.5&&N.x*L.x+N.z*L.z>0?smooth(.1,.13,L.y/h)*smooth(.9,.87,L.y/h):0),toward(0xf4f1e8,(P,N,L)=>N.x*L.x+N.z*L.z>0?smooth(.38,.41,L.y/h)*smooth(.62,.59,L.y/h):0)]:null});
function mug(k,{color=CHINA,r=4.1,h=8.6}={}){
  const v=vessel(k,[[r*.86,0],[r*.94,.25],[r,1.4],[r,h]],{wall:.32,floor:.6,color,gloss:.72});
  k.ware(tube([[r*.96,h*.78,0],[r+2.3,h*.72,0],[r+2.7,h*.45,0],[r+2.1,h*.22,0],[r*.96,h*.2,0]],.5,{sides:8,ry:.62,caps:false,steps:16}),{color,gloss:.72});
  return v;
}
function saucer(k,r=6.6,color=CHINA){k.ware(lathe([[0,0],[r*.5,0],[r,.75],[r*.99,.9],[r*.5,.32],[r*.36,.3],[0,.3]],28),{color,gloss:.72});}
function demitasse(k,{r=3.1,h=5.2,tea=false,color=CHINA}={}){
  saucer(k,tea?7:5.8,color);
  let v;
  k.at(0,0,0,()=>{
    v=vessel(k,tea?[[r*.5,0],[r*.56,.3],[r*.95,h*.5],[r*1.25,h]]:[[r*.6,0],[r*.7,.3],[r*.96,h*.5],[r,h]],{wall:.22,floor:.5,color,gloss:.75});
    k.ware(tube([[r*.9,h*.75,0],[r+1.5,h*.7,0],[r+1.7,h*.42,0],[r*.82,h*.25,0]],.3,{sides:6,ry:.4,caps:false,steps:12}),{color,gloss:.75});
  });
  return {...v,floor:v.floor+.3,top:v.top+.3,width:y=>v.width(y-.3),lift:.3};
}
const yunomi=(k,{r=3.6,h=7.4,color=0x4a5a52}={})=>vessel(k,[[r*.6,0],[r*.66,.4],[r*.95,1.6],[r,h]],{wall:.3,floor:.7,color,gloss:.6,paint:[mottle(.12,1.2),toward(0xe9e2d0,(P,N,L)=>N.x*L.x+N.z*L.z<0||(N.y>.5&&L.y<h*.5)?1:0)]});
const glassOf=(k,profile,o={})=>vessel(k,profile,{wall:.13,floor:.45,color:GLASS,opacity:.13,gloss:.95,seg:32,...o});
const SHAPES={
  tumbler:[[3.1,0],[3.2,.25],[4.5,13]],highball:[[3.1,0],[3.2,.2],[3.35,14]],rocks:[[3.6,0],[3.7,.2],[4.1,8.6]],
  pint:[[3,0],[3.1,.25],[3.5,7],[4.3,12],[4.3,15]],shot:[[1.9,0],[2,.2],[2.5,5.6]],shake:[[2.6,0],[2.9,.3],[3.3,4],[4.3,13],[4.6,16]],
  martini:[[.4,7],[5.6,11.6]],coupe:[[.4,7],[3.2,7.6],[4.8,9.4],[5.1,11.2]],wine:[[.4,8],[3,8.6],[4,11.5],[3.5,16]],flute:[[.4,8],[1.9,9.5],[2.6,14],[2.3,20]],
  margarita:[[.4,8],[2.2,8.6],[2.6,10.4],[5.6,11.6],[6,13.2]],
};
function bottle(k,{r=3,h=22,neck=.36,shoulder=.62,color=0x5a3a1a,opacity=.72,label=null,cap=0xd9d2c0,liquid=null}={}){
  const profile=[[r*.9,0],[r,.5],[r,h*shoulder],[r*.85,h*(shoulder+.07)],[r*neck*1.1,h*.82],[r*neck,h*.86],[r*neck,h*.97],[r*neck*1.15,h]];
  if(liquid!==null && k.amount>0){
    const width=y=>r*(.93-.23*smooth(h*shoulder,h*(shoulder+.08),y));
    const top=volumeHeight(.5,h*(shoulder+.08),width,k.amount);
    k.add(lathe([[0,.5],[width(.5),.5],...(top>h*shoulder?[[width(h*shoulder),h*shoulder]]:[]),[width(top),top],[0,top]],24),
      {color:liquid,gloss:.8,whole:true,cast:false});
  }
  k.ware(lathe([[0,0],...profile,[r*neck*.8,h],[r*neck*.8,h*.9]],28),{color,opacity,gloss:.95,shade:false});
  if(label!==null)k.ware(lathe([[r*1.012,h*.22],[r*1.012,h*.52]],28),{color:label,gloss:.3,cast:false});
  if(cap!==null && k.amount===1)k.ware(lathe([[0,h],[r*neck*1.25,h],[r*neck*1.25,h+.6],[0,h+.65]],16),{color:cap,gloss:.6});
}
/** A counter soda, using the same can as the Borough Cola on the shelf. */
export function can(k,x=0,z=0){
  k.at(x,z,.14,()=>sodaCan(k));
}

const coffee=0x3a2114,cola=0x3a1c12,beer=0xd79a2e;
const recipes={
  coffee:k=>pour(k,paperCup(k,{band:'key'}),1,coffee),
  espresso:k=>{const v=demitasse(k);const y=pour(k,v,1,0x2e170c);if(k.level)foam(k,v,y,0xb9844a,.12);},
  latte:k=>{const v=mug(k,{r:4.4,h:8});const y=pour(k,v,1,0xb98a5e,{paint:k.amount===1?toward(0xf6ecd8,(P,N,L)=>N.y>.5?smooth(.2,.55,1-Math.hypot(L.x*.9,L.z+.5-.4*Math.abs(L.x))/2.6)*.95:0):null});if(k.amount>0 && k.amount<1)foam(k,v,y,0xe6d2b0,.1);},
  cappuccino:k=>{const v=demitasse(k,{r:4,h:6});const y=pour(k,v,.85,0xb98a5e);if(k.level)foam(k,v,y,0xf3e6cc,.5);if(k.level===2)k.sprinkle('fleck',22,{r:2.6,color:[0x6a4028],size:.3,onFood:y,flat:true});},
  matcha:k=>{const v=mug(k,{r:4.3,h:7.6,color:0xd9d2c4});pour(k,v,1,0x9cb85a,{paint:k.level===2?toward(0xf3f1dc,(P,N,L)=>N.y>.5?smooth(.3,.6,1-Math.hypot(L.x,L.z)/2.4)*.9:0):null});},
  'hot-chocolate':k=>{const v=mug(k,{color:0xb23a2a});const y=pour(k,v,1,0x5a3220);if(k.level===2){for(let i=0;i<5;i++){const a=i*1.3;k.add(brick(1.2,.9,1.2,.35,{n:10}),{at:[Math.cos(a)*1.7,y-.3,Math.sin(a)*1.7],rot:[0,a,0],color:0xfbf7f0,gloss:.3,whole:true,cast:false});}}},
  tea:k=>{const v=demitasse(k,{tea:true,r:3.4,h:5.4});pour(k,v,1,0xb5662a,{gloss:.9});if(k.level===2)wheel(k,{r:v.r+.4,top:v.top},0xe9c63a,0xf3e08a);},
  chai:k=>{const v=glassOf(k,[[2.6,0],[2.7,.2],[3.3,8.4]]);const y=pour(k,v,1,0xc69462);if(k.level)foam(k,v,y,0xe9d2ae,.15);},
  'green-tea':k=>pour(k,yunomi(k),1,0xa9b24e,{gloss:.9}),
  'barley-tea':k=>pour(k,yunomi(k,{color:0x7a5a3a}),1,0xa86a2a,{gloss:.9}),
  'iced-coffee':k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0x6e4028,{paint:toward(0xc9a27a,(P,N,L)=>.5*smooth(2,9,L.y)*(.5+.5*sn(L.x*.5,L.y*.3,L.z*.5)))});if(k.level)ice(k,v,y);straw(k,v,{color:0x2f8a4a});},
  soda:k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,cola);if(k.level)ice(k,v,y);straw(k,v,{color:0xf1ece4,stripe:0xc9382c});},
  'soda-can':k=>can(k),
  lemonade:k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0xf0e08a);if(k.level)ice(k,v,y);if(k.level===2)wheel(k,v,0xe9c63a,0xf6eaa0);straw(k,v);},
  'iced-tea':k=>{const v=glassOf(k,SHAPES.highball);const y=pour(k,v,1,0xa8561e);if(k.level)ice(k,v,y,3);if(k.level===2)wheel(k,v,0xe9c63a,0xf6eaa0);straw(k,v);},
  'thai-tea':k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0xe08a3a,{paint:toward(0xf3d9b0,(P,N,L)=>.8*smooth(8,12,L.y))});if(k.level)ice(k,v,y);straw(k,v);},
  horchata:k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0xeadfc4);if(k.level)ice(k,v,y,3);if(k.level===2){k.sprinkle('fleck',18,{r:3,color:[0x8a5a2e],size:.3,onFood:y-.5,flat:true});k.ware(tube([[-1,y-2,.6],[1.6,v.top+3,.2]],.28,{sides:6,curve:false}),{color:0x8a5a2e,gloss:.2});}},
  'morir-sonando':k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0xf6b86a);if(k.level)ice(k,v,y,3);straw(k,v);},
  jamaica:k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0x9a1f3a);if(k.level)ice(k,v,y);straw(k,v);},
  sorrel:k=>{const v=glassOf(k,SHAPES.highball);const y=pour(k,v,1,0x8a1a2e);if(k.level)ice(k,v,y,3);},
  boba:k=>{const v=glassOf(k,SHAPES.tumbler);pour(k,v,1,0xd9b488,{paint:spots(0x2a1a14,.5,.9,3)});
    if(k.level)for(let i=0;i<16;i++){const a=i*2.4,d=2.4*Math.sqrt((i+.5)/16);k.add(blob({r:.5,detail:0,bump:0}),{at:[Math.cos(a)*d,.9+(i%3)*.5,Math.sin(a)*d],color:0x2a1a14,gloss:.7,whole:true,cast:false});}
    straw(k,v,{color:0xe86a8a,r:.55});},
  'orange-juice':k=>pour(k,glassOf(k,SHAPES.highball),1,0xf29a1f,{paint:mottle(.06,1.5)}),
  'carrot-juice':k=>pour(k,glassOf(k,SHAPES.highball),1,0xe86a1a),
  'green-juice':k=>pour(k,glassOf(k,SHAPES.highball),1,0x6e9a3a,{paint:mottle(.1,1.2)}),
  wheatgrass:k=>pour(k,glassOf(k,SHAPES.shot),1,0x3f8a2a),
  smoothie:k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0xd96a8a,{gloss:.5,paint:mottle(.06,1)});if(k.level===2)k.add(blob({r:[1.1,1.2,1.1],bump:.1,detail:1}),{at:[1,y+.7,-.6],color:0xc92a3a,gloss:.5,whole:true,paint:spots(0xf3e08a,.2,5,1)});straw(k,v,{r:.42});},
  lassi:k=>{const v=glassOf(k,SHAPES.highball);const y=pour(k,v,1,0xf3b03a,{gloss:.5});if(k.level===2)k.sprinkle('fleck',10,{r:2.2,color:[0x6e9a3a,0xd96a2a],size:.36,onFood:y-.3,flat:true});straw(k,v,{r:.4});},
  'protein-shake':k=>{const v=glassOf(k,SHAPES.tumbler);const y=pour(k,v,1,0xd9c4a0,{gloss:.5});if(k.level)foam(k,v,y,0xefe2c8,.3);straw(k,v,{r:.42,color:0x2a2a2a});},
  shake:k=>{const v=glassOf(k,SHAPES.shake);const y=pour(k,v,1,0xf0d9b8,{gloss:.5});
    if(k.level===2){const pts=[];for(let i=0;i<=30;i++){const t=i/30,a=t*2.6*TAU,r=3.6*(1-t*.9);pts.push([Math.cos(a)*r,y+.5+t*3.2,Math.sin(a)*r]);}
      k.add(tube(pts,1,{sides:8,curve:false,taper:t=>1-.6*t,section:a=>1+.15*Math.cos(a*TAU*4)}),{color:0xfbf7ee,gloss:.4,whole:true,cast:false});
      k.add(blob({r:.85,detail:1,bump:0}),{at:[0,y+4.6,0],color:0xb01f2c,gloss:.8,whole:true});}
    straw(k,v,{stripe:0xc9382c,r:.36});},
  'egg-cream':k=>{const v=glassOf(k,SHAPES.pint);const y=pour(k,v,.86,0x8a5a3a,{paint:toward(0xd9c2a0,(P,N,L)=>.7*smooth(4,11,L.y))});if(k.level)foam(k,v,y,0xfaf5ea,1.3);straw(k,v);},
  beer:k=>{const v=glassOf(k,SHAPES.pint);const y=pour(k,v,.9,beer,{gloss:.9});if(k.level)foam(k,v,y,0xfbf3dc,k.level===2?1.3:.5);},
  stout:k=>{const v=glassOf(k,SHAPES.pint);const y=pour(k,v,.9,0x1c100c,{gloss:.9});if(k.level)foam(k,v,y,0xe6d2a8,k.level===2?1.2:.5);},
  'ginger-beer':k=>bottle(k,{r:2.9,h:19,color:0x6e4a22,opacity:.75,label:0xe6c13a,cap:0xb9382c,liquid:0xc99a4a}),
  'soda-bottle':k=>bottle(k,{r:2.8,h:20,color:GLASS,opacity:.25,label:0xd9382c,cap:0xc9c9c9,liquid:cola,shoulder:.55}),
  water:k=>bottle(k,{r:3.1,h:21,color:0xcfe6f0,opacity:.3,label:0x3a7ab8,cap:0x3a7ab8,liquid:0xbfe0ea,shoulder:.68,neck:.42}),
  wine:k=>bottle(k,{r:3.7,h:30,color:0x1f3a22,opacity:.9,label:0xf1ead2,cap:0x7a1f2a,liquid:0x2e0a14,shoulder:.6,neck:.38}),
  soju:k=>bottle(k,{r:3.2,h:21.5,color:0x4f9a5a,opacity:.6,label:0xf1ead2,cap:0x3a8a4a,liquid:0xdcecd8,shoulder:.6}),
  sake:k=>{const flask=vessel(k,[[2.6,0],[2.9,.4],[3.2,4],[2.6,7.5],[1.5,9.5],[1.4,11],[2,12.4]],{wall:.25,floor:.6,color:0xe9e4d8,gloss:.6,paint:toward(0x3a5a8a,(P,N,L)=>N.y<.6?smooth(.28,.31,L.y/12)*smooth(.4,.37,L.y/12):0)});
    k.at(6.2,1.6,0,()=>{const cup=vessel(k,[[1.6,0],[1.8,.3],[2.6,3.6]],{wall:.2,floor:.5,color:0xe9e4d8,gloss:.6});pour(k,cup,1,0xf1f0e2,{gloss:.95});});void flask;},
  cocktail:k=>{stem(k);const v=glassOf(k,SHAPES.coupe,{floor:.3});const y=pour(k,v,1,0xe8845a,{gloss:.9});if(k.level===2){k.add(lathe([[0,0],[1.4,0],[0,.06]],12),{at:[.6,y+.03,.3],color:0xf29a3a,gloss:.6,whole:true,cast:false});}},
  martini:k=>{stem(k);const v=glassOf(k,SHAPES.martini,{floor:.25});const y=pour(k,v,1,0xe9ecd8,{gloss:.95});
    if(k.level){k.ware(tube([[-3.4,y+.6,-.4],[3.6,y+2.2,.5]],.07,{sides:4,curve:false}),{color:0xd9c08a,gloss:.4});for(const t of [.42,.56])k.add(blob({r:[.62,.52,.52],detail:1,bump:0}),{at:[-3.4+7*t,y+.6+1.6*t,-.4+.9*t],color:0x7a8a3a,gloss:.6,whole:true});}},
  margarita:k=>{stem(k,{h:8});const v=glassOf(k,SHAPES.margarita,{floor:.25});const y=pour(k,v,1,0xd9e08a,{gloss:.7});
    k.ware(lathe([[6,12.9],[6.12,13.2],[6,13.32],[5.84,13.2]],32,{bump:.01,freq:6}),{color:0xfbfbf6,gloss:.2,cast:false});if(k.level)ice(k,v,y,3);if(k.level===2)wheel(k,v,0x6f9f2e,0xcfe08a);},
  'old-fashioned':k=>{const v=glassOf(k,SHAPES.rocks,{floor:.9});const y=pour(k,v,.7,0xb9641f,{gloss:.95});
    if(k.level)k.add(brick(3.4,3.4,3.4,.4,{n:12}),{at:[0,Math.max(v.floor,y-2.9),0],rot:[0,.5,0],color:0xe9f1f1,gloss:.95,whole:true,cast:false});
    if(k.level===2)k.add(sheet((u,w)=>[(u-.5)*4.6,.4*Math.sin(u*3.1),(w-.5)*1.1],6,2),{at:[1.6,y+.8,-1.2],rot:[.3,.6,.4],color:0xf08a1f,gloss:.5,whole:true,cast:false});},
  whiskey:k=>pour(k,glassOf(k,SHAPES.rocks,{floor:.9}),.42,0xc0701f,{gloss:.95}),
  'vodka-soda':k=>{const v=glassOf(k,SHAPES.highball);const y=pour(k,v,1,0xdfeceb,{gloss:.95});if(k.level)ice(k,v,y,3);if(k.level===2)wheel(k,v,0x6f9f2e,0xcfe08a);straw(k,v,{color:0x2a2a2a,r:.2});},
  mojito:k=>{const v=glassOf(k,SHAPES.highball);const y=pour(k,v,1,0xdcecc4,{gloss:.9,paint:spots(0x4f9a3a,.3,1.1,2)});if(k.level)ice(k,v,y,3);if(k.level===2){mint(k,0,y+.4,0,5);wheel(k,v,0x6f9f2e,0xcfe08a);}straw(k,v,{color:0x2a2a2a,r:.2});},
  'red-wine':k=>{stem(k,{h:8});pour(k,glassOf(k,SHAPES.wine,{floor:.3}),.5,0x5a1220,{gloss:.95});},
  'white-wine':k=>{stem(k,{h:8});pour(k,glassOf(k,SHAPES.wine,{floor:.3}),.5,0xe9dc9a,{gloss:.95});},
  champagne:k=>{stem(k,{h:8,foot:3});const v=glassOf(k,SHAPES.flute,{floor:.3});const y=pour(k,v,.85,0xf0dc9a,{gloss:.95,paint:spots(0xfbf3d0,.2,3,1)});if(k.level===2)foam(k,v,y,0xfbf6e4,.2);},
  shot:k=>{pour(k,glassOf(k,SHAPES.shot,{floor:.9}),1,0xe9c46a,{gloss:.95});if(k.level===2)k.at(4.2,1,.7,()=>k.add(lathe([[0,-.3],[1.7,-.3],[1.7,.3],[0,.3]],16),{at:[0,1.4,0],rot:[0,0,1.2],color:0xcfe08a,gloss:.6,paint:toward(0x6f9f2e,(P,N,L)=>smooth(1.4,1.6,Math.hypot(L.x,L.z))),whole:true}));},
};
recipes.cup=recipes.coffee;
recipes.mug=k=>pour(k,mug(k),1,coffee);
export const drinkIds=Object.freeze(Object.keys(recipes).filter(id=>id!=='cup'&&id!=='mug'));
/** Build a drink on the bench: an id from `drinkIds`, or the house `cup` or `mug` of coffee. */
export function drink(k,id){
  const make=recipes[id];if(!make)throw Error('Missing drink: '+id);
  k.cut=false;make(k);
}
