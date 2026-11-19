// These fixtures use metres in their own frame, with +v toward the customer.
import {brandKey, placeName} from './places.js';
import {menuFor} from './menu.js';

const porcelain='#e8e7df', metal='#a2a6a2', black='#303332', oak='#ac8663';
const pharmacyBrands={
  'cvs-pharmacy':{name:'CVS pharmacy',ink:'#b82633',trim:'#a22836',wall:'#f4efe5',floor:'#d4caba',bay:'Beauty',coldSide:-1},
  'duane-reade':{name:'Duane Reade',ink:'#174f77',trim:'#886b53',wall:'#efe8dc',floor:'#b9b0a1',bay:'Beauty boutique',coldSide:1},
  walgreens:{name:'Walgreens',ink:'#aa2940',trim:'#267b86',wall:'#f3eee2',floor:'#d3c9b8',bay:'Beauty',coldSide:1},
};

export const careProducts=[
  ['Daily care','Cleanser','#e9d6bf','#64567b'],['HYDRATE','Face cream','#c8d7d1','#32645d'],
  ['STUDIO','Lip color','#e0b7ac','#834856'],['Botanical','Shampoo','#d1d5ad','#4c6748'],
  ['Everyday','Toothpaste','#b4d6db','#365d78'],['Fresh','Oral care','#e1ebe7','#3d7d77'],
  ['ESSENTIALS','First aid','#eae3d0','#b95b4b'],['SOFT','Tissues','#cbd4e7','#536597'],
  ['DAILY','Body lotion','#e8d2b9','#946940'],['Pure','Hand wash','#d0dfe4','#537b88'],
];

// The same package dimensions position its solid and its printed face.
export function shelfFacings(w,d,h,section,draw){
  const tiers=shelfTiers(h), count=Math.max(3,Math.min(11,Math.floor((w-.10)/.136))), step=(w-.10)/count;
  for(let row=0;row<tiers;row++)for(let i=0;i<count;i++){
    const index=(section*3+row+Math.floor(i/3))%careProducts.length;
    const up=.235+row*(h-.40)/tiers, tall=Math.min((h-.40)/tiers-.04,.193+.044*(index%3));
    const u=(i-(count-1)/2)*step, v=d/2-.073;
    draw(u,v,up,step*.83,tall,index);
  }
}
const shelfTiers=h=>h>1.5?4:h>1.12?3:2;

export const CARE_FIXTURES={
  careShelves(t,w,d,h,frame,{section=0,accent}){
    t.box(0,-d/2+.035,w,.065,h,.01,frame);
    t.box(0,0,w-.02,d,.13,.035,'#9a9b95');
    const tiers=shelfTiers(h);
    for(let row=0;row<tiers;row++){
      const up=.235+row*(h-.40)/tiers;
      t.box(0,0,w,d,.038,up-.038,porcelain);
      t.box(0,d/2-.008,w,.021,.036,up-.041,'#bebbb2');
    }
    t.box(0,-d/2+.047,w,.06,.18,h-.18,accent);
    shelfFacings(w,d,h,section,(u,v,up,wide,tall,index)=>{
      t.carton(u,v,wide,.107,tall,up,careProducts[index][2]);
      if((index===0 || index===9 || index===3) && Math.round((u+w/2)/wide)%2===0){
        t.carton(u,v,wide*.40,.045,.033,up+tall,'#555d55');
        t.carton(u+.012,v,.050,.027,.011,up+tall+.033,'#e3dbca');
      }
    });
  },
  rxCabinet(t,w,d,h){
    t.box(0,-d*.39,w,.07,h,0,'#c7c7bc');
    t.box(0,0,w,d,.80,0,'#ddddd1');
    const bays=Math.max(2,Math.floor(w/.52)), step=(w-.06)/bays;
    for(let i=0;i<=bays;i++)t.box(-w/2+.03+i*step,0,.024,d,h-.77,.77,porcelain);
    for(let j=0;j<3;j++){
      const up=.84+j*.31;
      t.box(0,.015,w,d,.033,up-.033,porcelain);
      for(let i=0;i<bays;i++)for(let k=0;k<3;k++){
        const u=-w/2+.03+(i+(k+1)/4)*step;
        const tall=.13+.035*((i+j+k)%3);
        t.box(u,.014,step*.17,.125,tall,up,'#d9c8a7');
        t.plate(u,.078,step*.135,.052,up+.034,'#f5f2e7');
      }
    }
  },
  cuttingChair(t,w,d,h,leather,{barber}){
    const hardware=barber?'#b7b5aa':'#99988e';
    t.disc(0,0,w*.39,.040,.036,hardware);
    t.disc(0,0,.083,.080,.076,black);t.post(0,0,.053,h-.24,.153,hardware);
    t.box(0,-.015,w-.085,d-.12,.084,h-.127,leather);
    t.ball(0,.005,w*.447,.065,d*.426,h-.058,leather);
    t.slope(0,-d*.31,h+.04,-d*.46,h+(barber?.51:.41),w-.13,.095,leather);
    if(barber){
      t.post(0,-d*.43,.025,.15,h+.43,hardware);
      t.box(0,-d*.455,.23,.104,.105,h+.55,leather);
      t.slope(0,d*.32,h-.09,d*.63,.22,w*.42,.04,hardware);
      t.box(0,d*.64,w*.65,.14,.032,.20,black);
    }
    for(const side of [-1,1]){
      t.slope(side*w*.443,-d*.22,h+.03,d*.14,h+.16,.044,.045,hardware);
      t.box(side*w*.446,-.018,.062,d*.66,.052,h+.16,barber?leather:oak);
    }
  },
  stylingStation(t,w,d,h,wood,{barber}){
    const border=barber?'#4d4941':'#b5a27b', v=d*.39;
    t.box(0,-d/2+.05,w-.03,.094,h-.15,.13,wood);
    for(const u of [-w/2+.045,w/2-.045])t.box(u,-d/2+.109,.052,.060,1.25,1.06,border);
    for(const up of [1.055,2.29])t.box(0,-d/2+.108,w-.05,.058,.044,up,border);
    t.box(0,-d/2+.11,w-.134,.036,1.19,1.103,'#9faaa5');
    t.box(0,-d*.05,w,d,.057,.916,barber?'#c7b9a4':'#d2c4ae');
    t.box(-w*.30,-.025,w*.29,d*.79,.65,.23,wood);
    for(const up of [.40,.61,.81])t.box(-w*.30,d*.34,w*.14,.028,.018,up,metal);
    t.can(w*.23,-.01,.047,.15,.973,'#504f48');
    for(let i=0;i<4;i++)t.post(w*.23+(i-1.5)*.018,-.01,.007,.12,1.08,i%2?oak:black);
    t.box(-w*.16,v*.5,.15,.087,.023,.973,black);
    t.box(-w*.16,v*.5,.14,.04,.01,.996,metal);
    for(let k=0;k<3;k++){
      const u=(k-1)*.103+w*.02, up=.973;
      t.can(u,-d*.21,.032,.11+(k%2)*.04,up,k===1?'#ab8060':'#d8cdb3');
      t.can(u,-d*.21,.020,.027,up+.11+(k%2)*.04,black);
    }
    if(!barber)for(const side of [-1,1])t.box(side*(w/2-.083),-d/2+.15,.021,.028,1.09,1.15,'#fff1cc',true);
  },
  salonBackbar(t,w,d,h,wood){
    t.box(0,0,w-.09,d-.07,.095,.03,'#59564f');
    t.box(0,0,w-.03,d-.03,h-.15,.12,wood);
    t.box(0,0,w,d,.045,h-.045,'#cfc8b7');
    for(let i=0;i<3;i++){
      const u=(i-1)*w*.32;
      t.plate(u,d/2-.013,w*.31,h-.24,.16,'#b1a28b');
      t.box(u,d/2+.008,.10,.03,.014,h-.19,metal);
    }
    for(let i=0;i<4;i++){
      t.box(w*.22,0,.31,.21,.041,h+i*.041,i%2?'#d5d0bf':'#e4dfce');
      const u=-w*.33+i*.091;
      t.can(u,-.01,.037,.135+.04*(i%2),h,i%2?'#8a9c82':'#aa7c54');
      t.can(u,-.01,.022,.025,h+.135+.04*(i%2),black);
    }
  },
  salonRetail(t,w,d,h,wood,{barber}){
    for(const up of [0,h*.52]){
      t.box(0,0,w,d,.032,up,wood);
      for(const side of [-1,1])t.box(side*w*.36,-d*.25,.033,d*.48,.08,up-.07,metal);
      for(let i=0;i<8;i++){
        const u=(i-3.5)*w*.112, jar=barber || i>4;
        const radius=jar?.053:.037, tall=jar?.064:.14+.015*(i%2);
        t.can(u,0,radius,tall,up+.033,['#d2bd91','#909d86','#b58b74'][Math.floor(i/3)]);
        t.can(u,0,radius*(jar?1.02:.54),.025,up+.033+tall,black);
        t.plate(u,radius,.048,tall*.45,up+.046,'#f0e5cd');
      }
    }
  },
  shampooBasin(t,w,d,h){
    t.box(0,-.015,w*.58,d*.68,h-.20,.05,'#494a44');
    t.basin(0,0,w*.93,d*.93,.255,h-.25,'#e4e5dd');
    t.disc(0,.004,.033,.006,h-.197,metal);
    t.post(w*.28,-d*.25,.017,.16,h-.055,metal);
    t.rodV(w*.28,-d*.15,.13,.017,h+.089,metal);
  },
};

export function furnishPharmacy(r,prop){
  const name=placeName(r.place), brand=pharmacyBrands[brandKey(name)] ||
    {name,ink:'#365b4b',trim:'#70826a',wall:'#ede9dc',floor:'#c6bdac',bay:'Personal care',coldSide:-1};
  const {ink,trim,coldSide}=brand, compact=r.depth<5.5;
  r.floor=brand.floor;r.wall=brand.wall;r.light={color:0xfff7eb,power:84,ceiling:'#eeeee5',strip:'#fff9e5'};
  r.finish={floor:'vinyl',feature:brand.wall,accent:trim,ink,title:brand.name,line:'Prescription pickup',zones:[],pharmacy:true};
  const deskB=r.depth-(compact?1.30:1.58), deskW=Math.min(r.width-1.85,3.32);
  const deskA=compact?0:-coldSide*.20;
  prop('serviceDesk',deskA,deskB,deskW,.68,1.0,'#b6a283',{trim,top:'#e8e7dc'});
  prop('register',deskA+deskW*.22,deskB-.12,.38,.3,.33,black,{y:1,solid:false});
  r.staff(deskA+.08,deskB+.73,0,-1);
  if(r.width>=6.2 && !compact)prop('deskMonitor',deskA-deskW*.31,deskB+.1,.4,.17,.36,black,{y:1,solid:false,face:[0,1]});
  prop('rxCabinet',0,r.depth-.155,Math.min(r.width-.75,4.25),.27,1.81,porcelain);
  // A stepped soffit and the visible rear cabinets give the dispensary
  // its own space under the ceiling. The public side opens into the aisle.
  const canopy=Math.min(1.46,r.depth*.26);
  r.add(0,r.depth-canopy/2,r.width-.04,canopy,.13,'#deddd3',2.90,false);
  r.add(0,r.depth-canopy+.027,r.width-.12,.042,.016,'#fff3d8',2.889,false);
  const side=-coldSide;
  prop('cooler',coldSide*(r.half-.274),.86,.48,1.04,1.73,'#d5d8d3',{face:[-coldSide,0]});
  const rack=(sign,b,length,section,label,h=1.77)=>prop('careShelves',sign*(r.half-.265),b,.45,length,h,'#c9c7bc',{face:[-sign,0],section,label,accent:section===0?trim:ink});
  rack(side,1.21,1.43,0,brand.bay);
  // Taking wall runs from the fitted depth keeps a deep branch stocked
  // all the way to pickup and leaves the same service passage in small ones.
  const runEnd=deskB-.92;
  for(const wallSide of [side,coldSide]){
    const start=wallSide===side?1.98:1.43, span=runEnd-start;
    if(span<.92)continue;
    const bays=Math.max(1,Math.ceil(span/2.1)), length=span/bays;
    for(let i=0;i<bays;i++){
      const beauty=wallSide===side, label=beauty?['Skin care','Hair care','Bath & body'][i%3]:['Everyday health','First aid','Dental care'][i%3];
      rack(wallSide,start+(i+.5)*length,length-.042,beauty?i%2:(i%3)+1,label);
    }
  }
  if(r.width>=6.5 && deskB>=5.9){
    const b=(deskB+1.6)/2, length=Math.min(2.38,deskB-3.7), a=coldSide*r.width*.17;
    for(const da of [-1,1])prop('careShelves',a+.186*da,b,.37,length,1.34,'#d2cdc0',
      {face:[da,0],section:da<0?1:2,label:da<0?'Dental care':'First aid',accent:trim});
    if(r.width>=6.9 && deskB>=7.5){
      for(const da of [-1,1])prop('careShelves',-a+.166*da,b-1.18,.33,1.42,1.06,'#d2cdc0',
        {face:[da,0],section:da<0?0:2,label:da<0?'Skin care':'Travel sizes',accent:trim});
    }
  }
}

export function furnishSalon(r,prop){
  const barber=r.place.kind==='barber', wood=barber?'#805c45':'#b18f6c';
  const leather=barber?'#74453b':'#4e5550', compact=r.depth<5.25;
  r.wall=barber?'#c4b7a0':'#e6dfd2';r.floor=barber?'#89857c':'#b3a18e';
  r.light={color:barber?0xffe5c5:0xffefdb,power:70,ceiling:'#e8e1d5',recessed:true};
  r.finish={floor:barber?'tile':'wood',feature:barber?'#384740':'#8f7969',accent:barber?'#b69b6a':'#bba27f',
    ink:'#fff1d9',title:placeName(r.place),line:'',zones:[],portrait:true,slats:!barber,specials:menuFor(r.place)};
  const deskW=Math.min(1.48,r.width*.29), deskA=r.half-.19-deskW/2;
  const deskB=compact?r.depth-1.21:1.74;
  prop('serviceDesk',deskA,deskB,deskW,.64,.99,wood,{trim:'#9d947f',top:'#dcd3c1'});
  prop('register',deskA,deskB-.1,.36,.3,.32,black,{y:.99,solid:false});
  r.staff(deskA,deskB+(compact?.67:-.71),0,compact?-1:1);
  r.people.at(-1).role='cashier';
  const first=compact?1.94:2.20, last=r.depth-(barber?.86:1.55);
  for(let b=first;b<=last;b+=2.04){
    const stationW=barber?1.43:1.18;
    prop('stylingStation',-r.half+.23,b,.42,stationW,2.35,wood,{barber,face:[1,0]});
    const a=-r.half+1.22;
    r.seat(a,b,-1,0,.10,leather,.74,.70,.54,'lounge');
    Object.assign(r.things.at(-1),{shape:'cuttingChair',more:{barber}});
    if(b===first){
      r.staff(a+.18,b+.86,0,-1);
      r.people.at(-1).role='barber';
    }
  }
  if(!barber && r.depth>=5.5){
    prop('shampooBasin',-r.half+.61,r.depth-.55,.70,.70,.92,porcelain);
    if(r.width>=5.3)prop('shampooBasin',-r.half+1.70,r.depth-.55,.70,.70,.92,porcelain);
  }
  if(!compact)prop('salonBackbar',r.width*.18,r.depth-.245,Math.min(r.width*.42,2.25),.41,.78,wood);
  if(r.depth>=6.5)prop('salonRetail',r.half-.12,r.depth-1.53,.22,1.37,.51,wood,{barber,face:[-1,0],y:1.22,solid:false});
  if(!compact)for(let b=3.24;b<r.depth-.76;b+=1.15){
    if(b>5.65)break;
    r.seat(r.half-.49,b,-1,0,0,barber?'#494740':'#7d7766',.55,.58,.46,'chair');
  }
}
