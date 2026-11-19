import {placeName} from './places.js';
import {menuFor} from './menu.js';
import {stockProduceCrate} from './grocery-stock.js';

// Dress the public counter after the grocer has placed its shelves, products
// and tickets. The same stock locations still serve the shopping interaction.
export function dressCornerStore(r,prop){
  const name=placeName(r.place), till=r.things.find(t=>t.shape==='register');
  if(!till)return;
  const market=/\b(MARKET|GROCERY|PRODUCE|FRUIT)\b/i.test(name) && !/\b(DELI|SANDWICH|GRILL)\b/i.test(name);
  if(market){
    r.finish.corner='produce';
    const b=r.depth>6.5?.75:Math.min(r.depth-1.02,3.42), a=(r.depth>6.5?1:-1)*(r.half-.59);
    const w=.86,d=.69;
    if(Math.abs(a)>w/2+.50 && !r.things.some(t=>t.solid && Math.abs(a-t.a)<(t.w+w)/2+.10 && Math.abs(b-t.b)<(t.d+d)/2+.10)){
      prop('produceCrate',a,b,w,d,.76,'#98764e');
      stockProduceCrate(r,r.things.at(-1));
    }
    return;
  }
  r.finish.corner='deli';
  r.finish.specials=menuFor(r.place).filter(item=>!item.product && ['meal','pep'].includes(item.effect));
  const grill=r.things.find(t=>t.shape==='grill');
  if(r.width>=5.2 && r.depth>=5.6 && grill){
    const length=Math.min(1.85,r.depth*.24), a=till.a+.48, b=till.b+.37+length/2;
    prop('showcase',a,b,.55,length,1.20,'#a9aaa1',{items:'deliRolls',deck:.44,felt:'#d9d8cc',face:[1,0]});
    r.people[0].role='cashier';
    r.staff(grill.a+.69,grill.b,-1,0);r.people.at(-1).role='deliCook';
  } else {
    prop('showcase',till.a-.39,till.b,.44,.43,.31,'#969c99',{y:1,solid:false,items:'deliRolls',felt:'#e0d8c8'});
  }
  prop('deliCups',till.a+.40,till.b,.32,.20,.30,'#e8ddbe',{y:1,solid:false});
}

export function sandwich(t,u,v,up,k){
  t.box(u,v,.20,.132,.011,up,'#f1ebda');
  t.ball(u,v,.085,.025,.053,up+.031,'#bf884e');
  t.box(u,v,.16,.098,.021,up+.047,k%2?'#c48b83':'#e0ab56');
  t.box(u,v,.151,.107,.010,up+.068,'#839057');
  t.ball(u,v,.087,.035,.054,up+.089,'#cc9657');
}

export function coldCaseDeck(t,w,d,base){
  t.box(0,0,w-.045,d-.042,.037,base+.32,'#d8d7cb');
  t.box(0,d/2-.024,w-.055,.018,.028,base+.34,'#fff4ce',true);
  const count=Math.max(2,Math.floor(w/.28)),pitch=(w-.075)/count;
  for(let i=0;i<count;i++){
    const u=(i-(count-1)/2)*pitch;
    t.box(u,0,pitch-.018,d-.12,.054,base+.02,'#b5b9b2');
    t.box(u,0,pitch-.04,d-.145,.038,base+.074,['#a6aa68','#b67e64','#e6cb93','#9aad79'][i%4]);
    t.plate(u,d/2-.013,.091,.051,base+.298,'#fff5d3');
  }
  for(const side of [-1,1]){
    t.plate(side*w*.26,d/2+.002,w*.35,.14,.11,'#7b807a');
    for(let j=0;j<4;j++)t.plate(side*w*.26,d/2+.004,w*.32,.012,.127+j*.031,'#474d49');
  }
}

export const CORNER_FIXTURES={
  deliCups(t){
    for(let i=0;i<2;i++){
      const u=i*.108-.055;
      t.tub(u,0,.042,.145,0,'#a0815b');
      for(let k=0;k<5;k++)t.can(u,0,.043,.009,.13+k*.013,'#eee7d4');
    }
    t.box(.104,.046,.063,.073,.095,0,'#c3c4b9');
    t.box(.104,.046,.049,.05,.025,.096,'#f1eee4');
  },
  produceCrate(t,w,d,h,wood,{looseStock}){
    for(const u of [-w*.42,w*.42])for(const v of [-d*.34,d*.34])t.box(u,v,.048,.048,h-.31,.035,wood);
    t.box(0,0,w-.035,d-.04,.072,h-.28,wood);
    for(let k=0;k<3;k++){
      for(const u of [-w/2+.019,w/2-.019])t.box(u,0,.038,d,.046,h-.23+k*.062,wood);
      for(const v of [-d/2+.019,d/2-.019])t.box(0,v,w,.038,.046,h-.23+k*.062,wood);
    }
    t.box(0,0,.024,d-.04,.17,h-.22,wood);
    if(looseStock)return;
    for(let row=0;row<3;row++)for(let i=0;i<6;i++){
      const x=(i-2.5)*w*.143,z=(row-1)*d*.24, pile=.019*((i+row)%2);
      t.ball(x,z,.054,.056,.054,h-.103+pile,i>=3?'#d78c38':(i+row)%2?'#a34b39':'#ab5141');
    }
  },
};
