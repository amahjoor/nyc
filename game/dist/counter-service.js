// Front-of-house and kitchen fittings for walk-in takeaway and hot lunch counters.
import {menuFor} from './menu.js';
import {placeName} from './places.js';

const steel='#a6aeaa', dark='#394340', paper='#eee8d8';
const palettes={
  chinese:['#953d35','#c5a25a'], asian:['#536b5d','#bea479'], thai:['#536b5d','#b29a66'],
  mexican:['#47765e','#ce9a55'], latin:['#527866','#c49a60'], caribbean:['#417572','#caad68'],
  chicken:['#a64e39','#c6a05d'], burgers:['#994b3d','#aca599'],
};
export const COUNTER_FIXTURES={
  checkoutCounter(t,w,d,h,wood,{trim}){
    t.box(0,0,w-.07,d-.07,.11,.025,'#515950');
    t.box(0,0,w-.025,d-.025,h-.18,.13,wood);
    for(let x=-w/2+.30;x<w/2-.12;x+=.51)t.box(x,d/2-.008,.010,.012,h-.24,.16,'#645e50');
    t.box(0,d/2-.005,w-.07,.014,.014,h-.085,trim);
    t.box(0,0,w,d,.052,h-.052,'#d2d2c5');
    t.box(0,d/2-.008,w-.01,.017,.016,h-.066,steel);
  },
  kitchenRange(t,w,d,h,metal,{wok}){
    t.box(0,0,w-.07,d-.08,.12,.045,dark);t.box(0,0,w,d,.65,.16,metal);
    t.box(0,0,w+.012,d,.04,.81,steel);
    const bays=Math.max(2,Math.floor(w/.53)), pitch=(w-.08)/bays;
    for(let i=0;i<bays;i++){
      const u=(i-(bays-1)/2)*pitch;
      t.plate(u,d/2+.002,pitch-.02,.43,.18,'#626b66');t.rodU(u,d/2+.023,pitch*.67,.013,.57,'#c3c6b9');
      t.box(u,d/2+.018,.067,.044,.039,.70,dark);
      if(wok && i<2){
        t.disc(u,-.015,.156,.021,.85,dark);t.basin(u,-.015,.275,.275,.081,.856,'#535956');
        t.rodV(u,.175,.16,.012,.913,dark);
      }else{
        t.box(u,-.02,pitch-.035,d-.135,.025,.85,'#41453f');
        for(let k=-2;k<=2;k++)t.box(u+k*pitch*.14,-.02,.012,d-.17,.012,.875,'#717972');
      }
    }
    t.box(0,-d/2+.027,w,.045,1.12,.85,'#c4c9c2');
    t.box(0,-.04,w,d*.80,.14,h-.14,metal);
    t.slope(0,-d*.18,h-.26,d*.33,h-.14,w-.05,.018,'#46534e');
    for(let u=-w/2+.07;u<w/2-.04;u+=.07)t.slope(u,-d*.18,h-.27,d*.33,h-.15,.025,.008,'#abb5ae');
    t.box(0,d*.34,w,.028,.022,h-.16,'#fff1cf',true);
    t.rodU(0,-d*.41,w-.15,.014,1.45,steel);
    for(let i=0;i<3;i++){
      const u=(i-1)*.12;
      t.box(u,-d*.39,.015,.018,.17,1.28,'#818d85');
      t.disc(u,-d*.34,.036,.013,1.27,i%2?dark:steel);
    }
  },
  packingBench(t,w,d,h,metal){
    for(const x of [-w/2+.045,w/2-.045])for(const z of [-d/2+.04,d/2-.04])t.box(x,z,.038,.038,.86,.036,metal);
    t.box(0,0,w-.08,d-.05,.025,.25,metal);t.box(0,0,w,d,.045,.88,'#cbd0c7');
    for(let k=0;k<4;k++){
      t.box(-w*.24,.01,.27,.18,.031,.925+k*.03,'#dfd4b6');
      t.box(-w*.24,.01,.28,.19,.009,.955+k*.03,paper);
    }
    for(let k=0;k<3;k++){
      const u=w*.17+k*.095;
      t.tub(u,.012,.036,.14,.925,['#b45539','#cca64e','#dde0d1'][k]);
      t.cone(u,.012,.031,.045,1.065,'#e9ddbf');
    }
    t.box(0,-d*.41,w-.08,.049,.042,h-.11,metal);
    for(let k=0;k<3;k++){
      const u=(k-1)*.13;
      t.plate(u,-d*.41+.028,.105,.16,h-.25,paper);
      for(let j=0;j<3;j++)t.plate(u,-d*.41+.030,.064,.004,h-.20+j*.017,'#9a998b');
    }
    t.box(w*.25,0,.33,.26,.28,.277,'#ac8861');
  },
  tableSupplies(t){
    t.box(0,0,.12,.075,.085,0,'#89938f');
    t.box(0,0,.09,.025,.023,.085,paper);
    for(const x of [-.094,.094]){
      t.can(x,0,.025,.071,0,x<0?'#aaa598':'#e2e1d1');t.can(x,0,.026,.016,.071,steel);
    }
  },
  hotServery(t,w,d,h,metal,{toppings,countertop}){
    const deck=countertop?.043:.88;
    if(!countertop){
      t.box(0,0,w-.08,d-.10,.10,.03,dark);t.box(0,0,w,d,deck-.14,.13,metal);
    }
    t.box(0,0,w,d,.037,deck-.037,'#d9dcd0');
    const n=Math.max(2,Math.floor(w/.36)), pitch=(w-.06)/n;
    for(let i=0;i<n;i++)for(let row=0;row<2;row++){
      const u=(i-(n-1)/2)*pitch, v=(row-.5)*d*.43, color=toppings[(i+row*3)%toppings.length];
      t.box(u,v,pitch-.016,d*.403,.027,deck,'#777f77');
      t.box(u,v,pitch-.036,d*.36,.027,deck+.018,color);
      for(let k=0;k<3;k++)t.bud(u+(k-1)*pitch*.20,v+.019*(k%2),.025,deck+.05,color);
      if(!row)t.slope(u+.04,v+.01,deck+.052,v-.105,deck+.09,.012,.008,steel);
    }
    for(const side of [-1,1])t.box(side*(w/2-.02),d*.43,.028,.035,h-deck,deck,'#707b75');
    t.box(0,d*.43,w,.034,.029,h-.029,steel);
    t.box(0,-d*.12,w,.022,.018,h-.025,'#fff4d6',true);
  },
  pickupSupplies(t,w,d,h,wood){
    t.box(0,0,w,d,.021,0,wood);
    for(let i=0;i<2;i++){
      const x=(i-.42)*w*.36;
      t.box(x,0,.165,.108,.175,.021,i?'#b99362':'#c8a674');
      t.box(x,0,.163,.114,.014,.186,'#ad875d');
      for(const side of [-1,1])t.box(x+side*.038,0,.009,.012,.043,.195,'#826745');
      t.box(x,0,.085,.012,.008,.233,'#826745');
    }
  },
};

export function furnishCounterService(r,prop,steam){
  const {kind}=r.place, [trim,brass]=palettes[kind]||['#52675c','#bc9971'];
  const compact=r.depth<5.7, sideLine=steam && !compact && r.width>=4.4;
  r.wall='#e9e2d2';r.floor=steam?'#b2a58d':'#b0aba0';
  r.light={color:0xffeed6,power:69,ceiling:'#e7e4d9',recessed:true};
  r.finish={floor:'tile',feature:trim,accent:brass,ink:'#fff4d9',title:placeName(r.place),line:'',zones:[],counterService:true};
  const deskB=sideLine?2.08:Math.max(1.92,r.depth-(compact?1.56:2.52));
  const width=sideLine?1.10:Math.min(4.05,r.width-1.23), deskA=sideLine?-r.half+1.31:r.half-.17-width/2;
  const facing=sideLine?[1,0]:[0,-1];
  prop('checkoutCounter',deskA,deskB,sideLine?.63:width,sideLine?width:.66,1.01,trim,{trim:brass,face:facing});
  const tillA=sideLine?deskA:deskA+width*.22;
  prop('register',tillA,deskB,.42,.35,.40,'#434a47',{y:1.01,solid:false});
  const lineWidth=Math.min(r.width-.46,compact?1.44:2.42), cookA=sideLine?-r.half+.17+lineWidth/2:-r.half+.20+lineWidth/2;
  prop('kitchenRange',cookA,r.depth-.29,lineWidth,.53,2.01,steel,{wok:['chinese','asian','thai'].includes(kind)});
  const benchW=Math.min(2.08,r.width-lineWidth-.54);
  if(benchW>=.95 && !compact)prop('packingBench',r.half-.18-benchW/2,r.depth-.27,benchW,.48,1.70,steel);
  const clerkA=sideLine?deskA-.73:tillA, clerkB=sideLine?deskB:deskB+.65;
  if(!compact){
    r.staff(cookA,r.depth-1.04,0,1);r.people.at(-1).role='cook';
  }
  r.staff(clerkA,clerkB,...facing);r.people.at(-1).checkout=true;
  if(!compact)r.people.at(-1).role='server';
  if(sideLine || !steam){
    const packsA=sideLine?deskA:deskA-width*.32;
    prop('pickupSupplies',packsA,sideLine?deskB+.32:deskB-.10,.37,.19,.25,'#b29470',{y:1.01,solid:false});
    if(!sideLine && width>=2.4)prop('plates',deskA-width*.11,deskB+.09,.26,.25,.12,paper,{y:1.01,solid:false});
  }
  const toppings=kind==='caribbean'?['#b87940','#d6b977','#7f7645','#995e36']:['#af7947','#dfcd96','#94724e','#80975f','#ae6543'];
  if(sideLine){
    const start=deskB+width/2+.03,end=r.depth-1.38;
    if(end-start>=.75)prop('hotServery',deskA,(start+end)/2,.63,end-start,1.41,steel,{face:[1,0],toppings});
  }else if(steam){
    const caseW=Math.min(1.48,width*.42);
    prop('hotServery',deskA-width/2+.07+caseW/2,deskB,caseW,.57,.47,steel,{toppings,countertop:true,y:1.01,solid:false});
  }
  const boardW=Math.min(3.4,r.width-1.4);
  prop('menuboard',0,r.depth-.044,boardW+.045,.064,.84,'#39423d',{y:2.09,solid:false,lines:menuFor(r.place).length});
  r.boardAt=r.depth-.044;
  if(!steam && !compact && r.width>5.5)prop('cooler',r.half-.32,Math.min(2.25,deskB-1.42),.54,1.06,1.85,steel,{face:[-1,0]});
  if(!sideLine && r.width>=6.15 && deskB>5.65){
    const from=3.13, end=deskB-.99, a=r.half-.25;
    r.add(a,(from+end)/2,.45,end-from,.047,'#aa8e6c',.99);
    for(const edge of [from+.19,end-.19])r.add(a+.12,edge,.16,.037,.21,'#64726c',.78,false);
    for(let b=from+.40;b<end-.17;b+=.91)r.seat(a-.63,b,1,0,.26,'#765f4d',.37,.37,.72,'stool');
  }
  const side=sideLine?1:-1, tableA=side*(r.half-.75);
  for(let b=2.18;b<(sideLine?r.depth-2.0:deskB-1.08);b+=2.02){
    r.add(tableA,b,.77,.69,.75,'#c6b69c',0,true,'table');
    prop('tableSupplies',tableA+side*.17,b,.27,.10,.12,paper,{solid:false,y:.75});
    for(const sign of [-1,1])r.seat(tableA,b+sign*.59,0,-sign,0,trim,.43,.43,.45);
  }
}

export function kitchenWall(ctx,room,span,side=0) {
  const f=room.finish;
  ctx.fillStyle='#eee7d8';ctx.fillRect(0,0,span,3.1);
  // The grouted splashback continues into the dining room at chair-rail height.
  const start=side===0?.18:1.53;
  ctx.fillStyle='#bcb8a9';ctx.fillRect(0,start,span,3.1-start);
  for(let y=start,row=0;y<3.1;y+=.139,row++)for(let x=-(row%2)*.14;x<span;x+=.282){
    ctx.fillStyle=['#dadbd0','#e0e0d5','#e5e4d8'][(row+Math.round((x+.15)*7))%3];
    ctx.fillRect(x+.006,y+.004,.274,.131);
  }
  ctx.fillStyle=f.feature;ctx.fillRect(0,side?1.51:.14,span,.048);
  ctx.fillStyle='#68665a';ctx.fillRect(0,2.98,span,.12);
  if(!side || span<1.9)return;
  const width=Math.min(2.5,span-.4), x=(span-width)/2;
  ctx.fillStyle=f.feature;ctx.fillRect(x,.48,width,.57);
  ctx.strokeStyle=f.accent;ctx.lineWidth=.012;ctx.strokeRect(x+.037,.515,width-.074,.50);
  ctx.save();ctx.scale(.01,.01);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#faf3e1';
  ctx.font='bold 18px Georgia';ctx.fillText(side<0?f.title:'Order pickup',(x+width/2)*100,78,(width-.22)*100);ctx.restore();
}
