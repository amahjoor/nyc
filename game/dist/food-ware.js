// What food is served on and in: china, paper, foil, wood, and the bits beside it.
import * as T from './vendor/three.module.min.js';
import { lathe,loft,sheet,tube,puck,brick,circle,blob,TAU,fbm,sn,mottle,toward,smooth,volumeHeight } from './food-kit.js';

export const CHINA=0xdfd8ca,PAPER=0xf1eee6,FOIL=0x9aa0a6,KRAFT=0xb4905f,WOOD=0x94633a,STEEL=0xb4b9bd,BLACK=0x2b2a2a,RED=0xb9382c;

/** A rectangle with rounded corners as [x, z] points. */
export function rounded(w,d,r=1,corner=5){
  const out=[];
  for(const [cx,cz,a0] of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI],[w/2-r,-d/2+r,Math.PI*1.5]]){
    for(let i=0;i<=corner;i++){const a=a0+i/corner*Math.PI/2;out.push([cx+Math.cos(a)*r,cz+Math.sin(a)*r]);}
  }
  // Break the long sides so that shading has somewhere to fall.
  const dense=[];
  out.forEach((p,i)=>{const q=out[(i+1)%out.length],steps=Math.max(1,Math.round(Math.hypot(q[0]-p[0],q[1]-p[1])/2.2));for(let s=0;s<steps;s++)dense.push([p[0]+(q[0]-p[0])*s/steps,p[1]+(q[1]-p[1])*s/steps]);});
  return dense;
}
/** A vessel on any outline: the profile is [scale, height], up the outside and down the inside. */
export const basin=(path,profile)=>loft(profile.map(([s,y])=>path.map(([x,z])=>[x*s,y,z*s])));

const rimBand=(hex,r0,r1)=>toward(hex,(P,N,L)=>N.y>.2?smooth(r0-.12,r0,Math.hypot(L.x,L.z))*smooth(r1+.12,r1,Math.hypot(L.x,L.z)):0);
/** A dinner plate of radius `r`: 12 for a main, 9 for a side or a pastry. */
export function plate(k,r=12,{color=CHINA,band=null,gloss=.55}={}){
  const s=r/12,h=Math.sqrt(s);
  const profile=[[0,0],[6.8,0],[7.4,.14],[8.8,.5],[10.9,1.1],[11.9,1.52],[12,1.7],[11.86,1.8],[11.2,1.52],[10,1.1],[8.9,.74],[8.2,.54],[7.3,.45],[6.2,.42],[5,.42],[3.8,.42],[2.6,.42],[1.3,.42],[0,.42]];
  // The turn from the well up to the rim is shaded a little, or a lit plate reads as a white disc.
  const shoulder=(c,P,N,L)=>{if(N.y>.2){const d=Math.hypot(L.x,L.z)/s;c.multiplyScalar(1-.16*smooth(6.6,8.6,d)*smooth(10.6,9,d)-.05*smooth(11.2,12,d));}};
  k.ware(lathe(profile.map(([x,y])=>[x*s,y*h]),48),{color,gloss,paint:band?[shoulder,rimBand(band,10.3*s,11.3*s)]:shoulder});
}
/** An oval platter. */
export function platter(k,w=30,d=20,{color=CHINA,gloss=.74}={}){
  const profile=[[0,0],[.56,0],[.74,.5],[.99,1.5],[1,1.68],[.985,1.78],[.93,1.5],[.76,.72],[.66,.48],[.5,.42],[.36,.42],[.22,.42],[.1,.42],[0,.42]];
  k.ware(loft(profile.map(([sc,y])=>circle(w/2,48,d/2).map(([x,z])=>[x*sc,y,z*sc]))),{color,gloss});
}
const BOWL_OUT=[[0,0],[.38,0],[.42,.04],[.62,.2],[.82,.48],[.95,.78],[1,.985],[.985,1.02]],BOWL_IN=[[.95,1],[.9,.78],[.77,.5],[.58,.25],[.4,.14],[.2,.1],[0,.1]];
/**
 * A bowl. Returns how wide it is inside at a height, for filling it.
 * `inner` glazes the inside another colour; `band` rings the outside.
 */
export function bowl(k,r=8,h=6,{color=CHINA,inner=color,band=null,gloss=.74,x=0,z=0}={}){
  const paint=[toward(inner,(P,N,L)=>Math.hypot(N.x,N.z)*Math.hypot(L.x,L.z)>0 && N.x*L.x+N.z*L.z<0 || N.y>.6 && L.y<h*.5?1:0)];
  if(band)paint.push(toward(band,(P,N,L)=>N.x*L.x+N.z*L.z>0?smooth(.70,.74,L.y/h)*smooth(.92,.88,L.y/h):0));
  k.ware(lathe([...BOWL_OUT,...BOWL_IN].map(([a,b])=>[a*r,b*h]),40),{at:[x,0,z],color,gloss,paint});
  const width=y=>{
    const t=y/h;for(let i=BOWL_IN.length-1;i>0;i--){const [r1,y1]=BOWL_IN[i],[r0,y0]=BOWL_IN[i-1];if(t<=y0)return r*(r1+(r0-r1)*Math.max(0,(t-y1)/(y0-y1)));}
    return r*.95;
  };
  return {r,h,x,z,width,floor:h*.1};
}
/** Fill a bowl to a share of its depth. Returns the height of the surface. */
export function fill(k,dish,share,color,{gloss=.8,paint=null,ware=false,dome=0}={}){
  const full=dish.floor+(dish.h*.86-dish.floor)*share;
  const y=ware?full:volumeHeight(dish.floor,full,dish.width,k.amount),r=dish.width(y)*.985;
  if(!ware)dome*=Math.sqrt(k.amount);
  const rings=[[r,y],[r*.95,y+.03]];for(let i=1;i<=9;i++){const t=1-i/9;rings.push([r*.9*t,y+.04+dome*(1-t*t)]);}
  k.add(lathe(rings,36),{at:[dish.x,0,dish.z],color,gloss,paint,ware,whole:true,proportioned:true});
  return y+.04;
}
/** A white paper plate, as a slice comes on. */
export function paperPlate(k,r=11.5){
  const profile=[[0,0],[7.6,0],[8.6,.25],[11.3,1.05],[11.5,1.2],[11.4,1.26],[8.6,.42],[7.6,.16],[6,.12],[4.5,.12],[3,.12],[1.5,.12],[0,.12]];
  k.ware(lathe(profile.map(([x,y])=>[x*r/11.5,y]),48,{wave:(a,j)=>j>2&&j<7?1+.008*Math.sin(a*24):1}),{color:PAPER,gloss:.12,paint:mottle(.03,.5)});
}
/** The round foil pan a street cart packs a platter in. */
export function foilPan(k,r=9,h=4.2){
  const crinkle=(a,j)=>j>1&&j<4?1+.007*Math.sin(a*16):1;
  k.ware(lathe([[0,0],[.74,0],[.79,.06],[1,.96],[1.07,.98],[1.085,1.03],[1.04,1.07],[.985,1.03],[.965,.94],[.775,.1],[.6,.07],[.4,.07],[.2,.07],[0,.07]].map(([a,b])=>[a*r,b*h]),64,{wave:crinkle}),
    {color:FOIL,gloss:.62,paint:mottle(.10,1.4)});
  return {r:r*.76,h,floor:h*.07,x:0,z:0,width:y=>r*(.775+.19*Math.min(1,y/h))};
}
/** A rectangular tray with flared walls: foil, black plastic, or a paper boat. */
export function tray(k,w=18,d=12,h=3.2,{color=FOIL,gloss=.6,flare=.14,corner=1.6,paint=mottle(.06,1.2),x=0,z=0,yaw=0}={}){
  const a=1-flare,profile=[[0,0],[a*.94,0],[a,.06*h],[1,h],[1.035,h*1.01],[1.035,h*1.04],[.99,h*1.03],[.975,h*.97],[a*.975,.12],[a*.7,.1],[a*.4,.1],[0,.1]];
  k.ware(basin(rounded(w,d,corner),profile),{at:[x,0,z],rot:[0,yaw,0],color,gloss,paint});
}
/** A sheet of deli paper under the food, plain or checked. */
export function deliPaper(k,w=20,d=20,{color=PAPER,check=null,yaw=.2,x=0,z=0,size=1.6,lift=.05,gloss=.25,crinkle=.1}={}){
  if(!k.level)crinkle=Math.max(crinkle,.34);
  const cs=Math.cos(yaw),sn_=Math.sin(yaw),n=check?Math.round(w/size):12,nd=check?Math.round(d/size):12;
  let g=sheet((u,v)=>{
    const lx=(u-.5)*w,lz=(v-.5)*d,px=x+lx*cs+lz*sn_,pz=z-lx*sn_+lz*cs;
    return [px,k.top(px,pz)+lift+crinkle*(1+fbm(px*.5,3,pz*.5))+(crinkle>.2?.12*sn(px*1.7,5,pz*1.7):0),pz];
  },n,nd).toNonIndexed();
  g.computeVertexNormals();
  const second=check&&new T.Color(check);
  k.ware(g,{color,gloss,flat:true,paint:check?(c,P)=>{
    const lx=(P.x-x)*cs-(P.z-z)*sn_,lz=(P.x-x)*sn_+(P.z-z)*cs;
    if((Math.floor((lx/w+.5)*n+.001)+Math.floor((lz/d+.5)*nd+.001))%2)c.copy(second);
  }:mottle(.04,.6)});
}
/** A plank or a slate to serve on. */
export function board(k,w=26,d=14,h=1.4,{color=WOOD,gloss=.3}={}){
  k.ware(brick(w,h,d,.3,{n:40}),{color,gloss,paint:(c,P)=>c.multiplyScalar(1+.10*sn(P.x*.3,P.y,P.z*2.6)+.05*sn(P.x*.9,1,P.z*7))});
}
/** A little pot of sauce. `full` is how much is left in it. */
export function ramekin(k,x,z,color,{r=2.2,h=2,full=1,gloss=.85,cup=CHINA,paint=null}={}){
  k.at(x,z,0,()=>{
    k.ware(lathe([[0,0],[r*.72,0],[r,h],[r*.94,h+.04],[r*.88,h],[r*.66,.3],[0,.3]],20),{color:cup,gloss:.7});
    if(full>0 && k.level)k.ware(lathe([[r*.86,.3+h*.62*full],[r*.5,.34+h*.62*full],[0,.36+h*.62*full]],20),{color,gloss,paint,cast:false});
  });
}
/** A pair of chopsticks laid across the rim. */
export function chopsticks(k,x,z,yaw,{color=0x4a2f24,length=22}={}){
  for(const s of [-1,1])k.at(x,z,yaw+s*.035,()=>{
    let rest=0;for(let i=0;i<=24;i++)rest=Math.max(rest,k.top((i/24-.5)*length,s*.35));
    k.ware(tube([[-length/2,rest+.3,s*.35],[length/2,rest+.3,s*.35]],.3,{sides:6,curve:false,taper:t=>.55+.45*t}),{color,gloss:.5});
  },{y:-k.top(x,z)});
}
/** A wedge of lemon or lime, lying on its side. */
export function citrus(k,x,z,yaw,{rind=0xe8c53a,flesh=0xf3e08a,r=2.3,angle=1.0,lift=0}={}){
  const na=6,np=10,rindRings=[],faces=[];
  for(let j=0;j<=np;j++){
    const phi=j/np*Math.PI,ring=[];
    for(let i=0;i<=na;i++){const th=(i/na-.5)*angle;ring.push([Math.sin(phi)*Math.sin(th)*r,Math.sin(phi)*Math.cos(th)*r,Math.cos(phi)*r*1.25]);}
    rindRings.push(ring);
  }
  const skin=loft(rindRings,{closed:false});
  for(const side of [-1,1]){
    const th=side*angle/2,rim=Array.from({length:np+1},(_,j)=>{const phi=j/np*Math.PI;return [Math.sin(phi)*Math.sin(th)*r,Math.sin(phi)*Math.cos(th)*r,Math.cos(phi)*r*1.25];});
    faces.push(loft([rim,rim.map(([px,py,pz])=>[px*.5,py*.5,pz*.86]),rim.map(([,,pz])=>[0,0,pz*.8])],{closed:false}));
  }
  k.at(x,z,yaw,()=>{
    const rot=[0,0,Math.PI/2-angle/2];
    k.add(skin,{at:[0,r*.38+lift,0],rot,color:rind,gloss:.45,paint:mottle(.08,2),whole:true});
    for(const face of faces)k.add(face,{at:[0,r*.38+lift,0],rot,color:flesh,gloss:.7,paint:toward(0xfff6c8,(P,N,L)=>.5+.5*sn(L.z*4,L.y*4,L.x*4)),whole:true});
  });
}
/** A fork beside the food. */
export function fork(k,x,z,yaw,{color=STEEL,plastic=false}={}){
  const c=plastic?0xf3f1ec:color,gloss=plastic?.4:.85;
  k.at(x,z,yaw,()=>{
    k.ware(tube([[-8,.25,0],[-2,.3,0],[1.5,.42,0],[3,.3,0]],.42,{sides:6,ry:.16,taper:t=>t<.6?1:1+(t-.6)*2.6}),{color:c,gloss,cast:false});
    for(let i=-1.5;i<=1.5;i++)k.ware(tube([[3,.3,i*.36],[5.6,.42,i*.36],[7,.3,i*.36]],.13,{sides:4,ry:.09,taper:t=>1-.5*t}),{color:c,gloss,cast:false});
  });
}
/** What is left of a meal: crumbs and a smear of what it was sauced with. */
export function leavings(k,{crumbs=0xc99c58,smear=null,r=5.5,n=22}={}){
  if(k.level)return;
  k.sprinkle('shard',n,{r,color:[crumbs].flat(),size:.36,ware:true,flat:true,bias:.8});
  if(smear!==null){
    const path=[[-r*.38,-r*.16],[-r*.14,r*.07],[r*.14,.16],[r*.23,-r*.16]].map(([x,z])=>[x,k.top(x,z)+.045,z]);
    k.ware(tube(path,.62,{sides:6,ry:.028,taper:t=>.15+Math.sin(t*Math.PI)*.85}),
      {color:smear,opacity:.48,gloss:.7,cast:false,shade:false,paint:mottle(.28,2.2)});
  }
}
export { blob,puck };
