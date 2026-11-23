import {blob,lathe,tube,sheet,TAU,mottle,toward,spots,smooth} from './food-kit.js';

const bananaPath=[[-7.6,1.5,-1.7],[-5.8,1.85,1.3],[-2.7,1.84,2.83],[.8,1.78,3.12],[4.1,1.77,2.25],[6.5,2.05,.48],[7.82,2.65,-1.78]];
const crown=[[7.4,2.4,-1.28],[8,2.72,-2.22],[8.37,3.44,-3.23],[8.33,3.92,-3.86]];
const rind=toward(0x91a13b,(P,N,L)=>.55*smooth(5.5,8,L.x)+.25*smooth(-6.4,-8,L.x));

export function banana(k){
  k.cut=false;
  if(k.level===2){
    k.add(tube(bananaPath,1.88,{sides:18,ry:1.73,steps:32,section:a=>1+.046*Math.cos(a*TAU*5)+.027*Math.cos(a*TAU*2),
      taper:t=>.28+.72*Math.sin(Math.PI*t)**.50}),{color:0xf4d54a,gloss:.37,whole:true,
      paint:[rind,toward(0xe7af29,(P,N)=>.55*smooth(.4,-.72,N.y)),spots(0x874f28,.08,4,7),mottle(.065,2.1)]});
    k.add(tube(crown,.48,{sides:12,ry:.34,steps:12,taper:t=>1-.13*t}),{color:0x9c9b40,gloss:.26,
      paint:[toward(0x694d28,(P,N,L)=>smooth(-3,-3.8,L.z)*.84),mottle(.14,3)],whole:true});
    k.add(blob({r:[.28,.3,.33],bump:.12,detail:1}),{at:[-7.67,1.53,-1.9],color:0x694323,gloss:.29,whole:true});
    return;
  }
  const base=[-3.9,1.45,2.45];
  if(k.level===1){
    const fruit=bananaPath.slice(0,5);
    k.add(tube(fruit,1.55,{sides:16,ry:1.43,steps:20,taper:t=>.49+.51*smooth(0,.35,t)*(1-.06*t)}),{
      at:[0,-.02,-.18],color:0xf4e3b4,gloss:.34,paint:[mottle(.06,2.9),toward(0xe3c884,(P,N,L)=>.48*smooth(.6,.95,L.y/2.6))],whole:true});
  }
  for(let i=0;i<3;i++){
    const turn=i*TAU/3+.35,length=6.7+i*.55;
    const shape=(u,v,inside)=>{
      const width=2.7*Math.sin(Math.PI*(v*.85+.13))**.66,lateral=(u-.5)*width;
      const x=base[0]+Math.cos(turn)*v*length-Math.sin(turn)*lateral;
      const z=base[2]+Math.sin(turn)*v*length+Math.cos(turn)*lateral;
      const y=.31+(base[1]-.28)*(1-v)**2+1.18*v**5+.38*(2*u-1)**2*Math.sin(Math.PI*v);
      return [x,y+(inside?.06:0),z];
    };
    k.ware(sheet((u,v)=>shape(u,v,false),8,18),{color:0xeec548,gloss:.37,paint:[mottle(.10,2.5),spots(0x7d4825,.11,3,i)]});
    k.ware(sheet((u,v)=>shape(u,v,true),8,18),{color:0xead5a0,gloss:.23,paint:[mottle(.065,2.2),toward(0xc3954e,(P,N,L)=>smooth(1.8,2.4,L.y)*.68)],cast:false});
  }
  k.ware(tube([[-3.72,.48,2.32],[-2.95,.66,2.02],[-2.06,.89,1.64]],.44,{sides:8,curve:false}),{color:0x867636,gloss:.33});
}

export function orangeBag(k){
  k.cut=false;
  const fruit=k.level===2?[[-3.05,3.25,-3.05],[3.05,3.25,-3.05],[-3.05,3.25,3.05],[3.05,3.25,3.05],[0,7.55,0]]:
    k.level===1?[[-3.06,3.18,0],[3.06,3.18,0]]:[];
  const radius=3.02;
  for(const [i,at] of fruit.entries()){
    k.add(blob({r:radius,bump:.017,freq:2.2,seed:i,detail:3}),{at,color:i%2?0xf28e24:0xeb821a,gloss:.38,
      paint:[mottle(.105,5.2),spots(0xd57819,.27,6.2,i)],whole:true});
    k.add(blob({r:[.21,.09,.2],bump:.08,detail:1}),{at:[at[0]-.08,at[1]+radius-.015,at[2]],color:0x67803b,gloss:.25,whole:true,cast:false});
  }
  const end=k.level===2?12.4:k.level===1?8.4:2.5;
  const envelope=(a,y)=>{
    const cs=Math.cos(a),sn=Math.sin(a);
    if(!fruit.length)return (.25+4.15*Math.sin(Math.PI*(y/end)**.8)**1.55)*(1+.22*Math.cos(a*2+.4));
    const above=Math.max(0,y-(end-2));
    let stretch=.26+3.15*Math.max(0,1-above/2)**1.2;
    for(const [x,up,z] of fruit){
      const dy=Math.max(0,Math.abs(y-up)-.29),padded=radius+.23;
      if(dy>padded)continue;
      stretch=Math.max(stretch,x*cs+z*sn+Math.sqrt(padded*padded-dy*dy));
    }
    return stretch+.13;
  };
  const point=(a,y)=>{const r=envelope(a,y);return [Math.cos(a)*r,y,Math.sin(a)*r];};
  // The opposing helices form a diamond mesh and share one envelope.
  const strands=20,steps=Math.ceil(end/.23);
  for(const twist of [-1,1])for(let i=0;i<strands;i++){
    const path=Array.from({length:steps+1},(_,j)=>{
      const t=j/steps,a=(i/strands+twist*t*.43)*TAU;
      return point(a,.055+(end-.055)*t);
    });
    k.ware(tube(path,.048,{sides:4,curve:false,caps:false}),{color:i%4?0xc03324:0xe25239,gloss:.37,cast:false});
  }
  // Close the heel with threads under the fruit instead of leaving an open ring.
  for(let i=0;i<strands;i++){
    const a=i/strands*TAU;
    const path=[[0,.04,0],point(a+.32,.047).map((v,j)=>j===1?v:v*.54),point(a,.055)];
    k.ware(tube(path,.048,{sides:4,curve:false,caps:false}),{color:0xc03324,gloss:.37,cast:false});
  }
  for(const y of [.065,end]){
    const path=Array.from({length:41},(_,i)=>point(i/40*TAU,y));
    k.ware(tube(path,.08,{sides:5,curve:false,caps:false}),{color:0xbb3828,gloss:.4,cast:false});
  }
  k.ware(lathe([[0,end-.13],[.52,end-.13],[.55,end+.22],[.42,end+.37],[0,end+.37]],14),{color:0xe6dfca,gloss:.35});
  if(fruit.length)k.ware(sheet((u,v)=>{
    const y=end+.1-v*2.9;
    return [(u-.5)*2.2,y,envelope(Math.PI/2,y)+.19];
  },5,10),{color:0xecc65a,gloss:.23,paint:toward(0x8a442c,(P,N,L)=>.8*smooth(.48,.54,(end-L.y)/2.9)*smooth(.63,.58,(end-L.y)/2.9)),cast:false});
}
