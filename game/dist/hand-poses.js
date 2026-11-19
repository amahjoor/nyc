// Flexion at the knuckle, middle joint and tip, in degrees. The thumb
// opposes the fingers across the palm on a different axis.
import { qaxis, qmul, qinv, qrot } from './body.js';
import { groceries } from './grocery-stock.js';

const digits=['index','middle','ring','pinky','thumb'];
const poses={
  wrap:[[38,61,32],[47,67,38],[53,73,40],[58,78,43],[14,25,15]],
  phone:[[12,83,55],[15,88,52],[20,85,49],[35,74,43],[8,23,17]],
  support:[[3,8,5],[4,10,7],[7,14,9],[12,17,12],[4,9,6]],
  pinch:[[61,79,37],[45,63,32],[56,71,41],[63,78,43],[26,38,23]],
  shears:[[14,17,9],[37,44,19],[47,63,32],[24,31,14],[22,33,16]],
  point:[[3,6,4],[43,71,36],[52,77,46],[63,80,44],[20,31,19]],
  ball:[[24,48,24],[31,53,28],[40,59,34],[48,63,36],[11,21,16]],
};
export function gripForItem(id){
  id=id?.split('@')[0];
  const shape=groceries[id]?.shape;
  if(shape==='apple'||shape==='orange')return 'ball';
  if(id==='phone'||id?.startsWith('phone-'))return 'phone';
  if(['fork','jewelBag','cash'].includes(id))return 'pinch';
  if(id?.startsWith('plate-')||['box','pouch'].includes(shape)||['tray','takeout','dishes','shoebox','jewel','guitar','guitar-mahogany'].includes(id))return 'support';
  return 'wrap';
}
const cache=new WeakMap();
export function fingerPose(rig,style,side='l'){
  if(!cache.has(rig))cache.set(rig,new Map());
  const saved=cache.get(rig), key=side+style;
  if(saved.has(key))return saved.get(key);
  const wrist=rig.world[rig.index.get('hand_'+side)].q, result=[];
  for(const [digit,name] of digits.entries())for(let joint=0;joint<3;joint++){
    const i=rig.index.get(name+'_0'+(joint+1)+'_'+side);
    const local=qmul(qinv(rig.world[i].q),wrist);
    // The long fingers sweep toward the palm normal. The thumb flexes
    // across the knuckles as well as inward.
    const axis=name==='thumb'?[side==='l'?-.90:.90,0,-.436]:[0,0,-1];
    let bend=qaxis(axis,poses[style][digit][joint]*Math.PI/180*(side==='l'?1:-1));
    if(style==='phone' && name==='thumb' && joint===0)
      bend=qmul(qaxis([0,0,side==='l'?-1:1],.46),bend);
    result.push([i,qmul(rig.bones[i].q,qmul(qmul(local,bend),qinv(local)))]);
  }
  if(style==='pinch')opposeThumb(rig,result,side);
  saved.set(key,result);return result;
}

// Bring the thumb pad against the index pad. Work in wrist space so that
// hand size and the arm's current pose do not affect the pinch.
function opposeThumb(rig,rotations,side){
  const target=digitChain(rig,rotations,side,'index').tip;
  target[1]-=.008;
  for(let pass=0;pass<16;pass++)for(const j of [2,1,0]){
    const {joints,tip}=digitChain(rig,rotations,side,'thumb'),{p,parent,entry}=joints[j];
    const a=tip.map((v,i)=>v-p[i]),b=target.map((v,i)=>v-p[i]);
    const axis=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...axis);
    if(length<1e-8)continue;
    const angle=Math.min(.16,Math.atan2(length,a.reduce((sum,v,k)=>sum+v*b[k],0)));
    entry[1]=qmul(qaxis(qrot(qinv(parent),axis.map(v=>v/length)),angle),entry[1]);
  }
}

function digitChain(rig,rotations,side,name){
  let q=[0,0,0,1],p=[0,0,0];const joints=[];
  for(let n=1;n<=3;n++){
    const i=rig.index.get(name+'_0'+n+'_'+side),entry=rotations.find(e=>e[0]===i),t=rig.bones[i].t;
    const delta=qrot(q,t);p=p.map((v,j)=>v+delta[j]);
    joints.push({p,parent:q,entry});q=qmul(q,entry[1]);
  }
  const last=rig.bones[joints[2].entry[0]],tip=qrot(q,qrot(qinv(last.q),last.t));
  return {joints,tip:p.map((v,j)=>v+.74*tip[j])};
}

export function pinchOffset(rig,side='l'){
  const rotations=fingerPose(rig,'pinch',side),saved=cache.get(rig),key='contact_'+side;
  if(!saved.has(key)){
    const index=digitChain(rig,rotations,side,'index').tip,thumb=digitChain(rig,rotations,side,'thumb').tip;
    saved.set(key,index.map((v,i)=>(v+thumb[i])*.5));
  }
  return saved.get(key);
}
