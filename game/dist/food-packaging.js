// Food packaging uses the shelf artwork even when it is part of a plated meal.
import * as T from './vendor/three.module.min.js';
import { lathe,sheet,TAU,clamp,mottle,spots } from './food-kit.js';
import { printUV } from './food-surface.js';
import { groceries } from './grocery-stock.js';

const cola=groceries['grocery-cola'].tile,chips=groceries['grocery-chips'].tile;
const aluminum=0xc5cbd0;

function stamp(outline,holes=[]){
  const shape=new T.Shape();
  shape.absellipse(...outline,0,TAU,false);
  for(const ellipse of holes){
    const hole=new T.Path();
    hole.absellipse(...ellipse,0,TAU,true);
    shape.holes.push(hole);
  }
  return new T.ShapeGeometry(shape,20).rotateX(-Math.PI/2);
}

export function sodaCan(k,tile=cola){
  const open=k.amount<1,top=12.18,r=3.29,sides=48;
  const ring=(profile)=>lathe(profile,sides);
  function metal(g,color=aluminum,gloss=.7){
    k.ware(g,{color,gloss,cast:false});g.dispose();
  }
  metal(ring([[0,.43],[r*.44,.41],[r*.61,.28],[r*.72,.06],[r*.78,.015],[r*.82,.08],[r*.83,.19],[r*.87,.34],[r*.96,.61],[r,.97]]));
  const stops=[.97,2,top-2,top-1.05];
  const wall=ring(stops.map(y=>[r,y])),index=wall.index.array,uv=[];
  for(let i=0;i<index.length;i++){
    const col=index[i]%sides;
    const back=Math.floor(i/6)%sides>=sides/2;
    // The artwork faces +Z, with a second print on the other side of the can.
    const turn=back && col===0?1:col/sides;
    const u=(back?2:1)-turn*2;
    // Map the print to the physical height of the can.
    const height=stops[Math.floor(index[i]/sides)],v=(height-stops[0])/(stops.at(-1)-stops[0]);
    uv.push(...printUV(tile,clamp(u),v));
  }
  const print=wall.toNonIndexed();
  print.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  k.ware(print,{color:0xffffff,gloss:.48,printed:true});print.dispose();wall.dispose();

  metal(ring([[r,top-1.05],[r*.99,top-.89],[r*.94,top-.59],[r*.865,top-.38],[r*.855,top-.25],
    [r*.87,top-.19],[r*.886,top-.115],[r*.887,top-.035],[r*.876,top+.007],[r*.848,top+.033],
    [r*.831,top-.01],[r*.824,top-.10],[r*.828,top-.18],[r*.793,top-.26],[r*.76,top-.25]]),0xc3c9cd,.79);
  const opening=[0,-1.07,.83,.66],lid=top-.24;
  metal(stamp([0,0,r*.777,r*.777],open?[opening]:[]).translate(0,lid,0),0xb1bbc0,.67);
  if(open){
    metal(ring([[0,.58],[r*.94,.58]]),0x423c35,.32);
    if(k.amount>0){
      const height=.6+(lid-1.55)*k.amount;
      const liquid=ring([[0,height],[r*.93,height]]);
      k.add(liquid,{color:tile===cola?0x352019:0xb5c9bd,gloss:.7,proportioned:true,cast:false});liquid.dispose();
    }
  }
  // The score line or beveled edge around the actual opening.
  metal(stamp([0,-1.07,.945,.744],[opening]).translate(0,lid+.017,0),open?0xd4dadd:0x909a9e,.61);
  metal(ring([[r*.68,lid+.007],[r*.7,lid+.028],[r*.715,lid+.007]]),0x909b9e,.62);
  const tab=stamp([0,.53,.75,1.06],[[0,.91,.48,.49],[0,.08,.23,.19]]);
  if(open)tab.rotateX(.17);
  metal(tab.translate(0,lid+.12,0),0xdee2e2,.77);
  metal(ring([[0,lid+.14],[.21,lid+.125],[.25,lid+.086]]),0xc6cbcb,.85);
}

export function chipBag(k){
  const sealed=k.amount===1,w=14.7,h=sealed?20.5:19.3,cols=30,rows=22;
  k.bites=false;
  const surface=(u,v,side)=>{
    const edge=Math.sin(u*Math.PI),seal=Math.sin(Math.PI*v);
    const tear=sealed?0:v**3*(.35*Math.sin(38*u+side)+.44*Math.sin(u*13)+.75*Math.sin(u*4+side*.4));
    const x=(u-.5)*w*(.91+.09*seal)+.12*Math.sin(9*v+u*5);
    const puff=(sealed?3.25:.65+2.65*k.amount)*Math.pow(seal*edge,.62);
    const pinch=sealed?0:Math.pow(v,7)*edge*(side>0?1.35:2.05);
    const wrinkle=(.15*Math.sin(46*u+7*v)+.22*Math.sin(27*v-18*u))*(.9-.5*seal*edge);
    return [x,h*v+tear,side*(.055+puff+pinch+wrinkle*edge)];
  };
  for(const side of [1,-1]){
    const g=sheet((u,v)=>surface(u,v,side),cols,rows);
    const uv=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)uv.push(...(side===1?printUV(chips,i/cols,j/rows):printUV(chips,1-i/cols,j/rows)));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    k.ware(g,{color:side===1?0xffffff:0xe9dfc8,gloss:.49,printed:true});g.dispose();
    const film=sheet((u,v)=>{
      const [x,y,z]=surface(u,1-v*.16,side);
      return [x,y,z-side*.065];
    },cols,5);
    k.ware(film,{color:sealed?0xd5bd8d:0xbdc3bf,gloss:.66,cast:false});film.dispose();
  }
  // A ribbed heat seal closes the bottom and the top of an unopened bag.
  for(const end of sealed?[0,1]:[0]){
    const seal=sheet((u,v)=>[(u-.5)*w*.925,h*end+(v-.5)*.58,.07+.034*Math.cos(u*122)],60,2);
    k.ware(seal,{color:0xc69e65,gloss:.38,cast:false});seal.dispose();
  }
  if(!sealed){
    const count=Math.ceil(9*k.amount);
    for(let i=0;i<count;i++){
      const x=(i%5-2)*1.65,y=2.2+k.amount*(h-4.8)-Math.floor(i/5)*1.12+k.rand(.55),z=k.rand(-.72,.68),a=k.rand(TAU);
      const chip=sheet((u,v)=>{
        const angle=u*TAU,d=v*(1+.1*Math.sin(angle*4+a));
        return [x+Math.cos(angle)*d*1.2,y+Math.sin(angle)*d*1.32,z+.28*d*d*Math.sin(angle*2+a)];
      },12,3);
      k.add(chip,{color:0xe2b76b,gloss:.29,paint:[mottle(.1,3),spots(0xb57935,.25,3,i)],whole:true,cast:false});chip.dispose();
    }
  }
}
