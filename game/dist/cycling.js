// All contact points are in bicycle coordinates, with the front wheel toward +Z.
import { Vector3, Quaternion } from './vendor/three.module.min.js';
import { qmul, qinv, qrot } from './body.js';

export const PEDAL_PERIOD=.92;
export function pedalPoint(side,phase){
  return [side*.15,.395+side*.15*Math.cos(phase),-.03+side*.15*Math.sin(phase)];
}

// Fit both hands and the balls of the feet to one full-size bicycle even
// when the rider has different limb lengths. Used by the live skeleton and
// the crowd's baked frames, so the same crank phase drives both renderers.
export function fitCyclist(rig,pose,phase,footDown=false){
  const pelvis=rig.index.get('pelvis'), bones=rig.bones,scale=(rig.height||1.76)/1.76;
  function frame(i){
    const bone=bones[i],t=i===pelvis?pose.pelvis:bone.t;
    if(bone.parent<0)return {p:new Vector3(...t),q:pose.q[i]};
    const parent=frame(bone.parent);
    return {p:parent.p.add(new Vector3(...qrot(parent.q,t))),q:qmul(parent.q,pose.q[i])};
  }
  const seat=new Vector3(footDown ? .07 : 0,footDown ? .90 : 1.082,footDown ? -.10 : -.21).multiplyScalar(scale);
  const shift=qrot(qinv(frame(bones[pelvis].parent).q),seat.sub(frame(pelvis).p).toArray());
  for(let axis=0;axis<3;axis++)pose.pelvis[axis]+=shift[axis];

  function solve(upper,lower,end,goal,endQ,bend){
    const a=frame(upper),b=frame(lower),c=frame(end);
    const ab=b.p.clone().sub(a.p),bc=c.p.clone().sub(b.p);
    const axis=goal.clone().sub(a.p),d=Math.max(.0001,Math.min(axis.length(),ab.length()+bc.length()-.00001));
    axis.normalize();bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const along=(ab.lengthSq()-bc.lengthSq()+d*d)/(2*d);
    const middle=a.p.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,ab.lengthSq()-along*along)));
    const align=(from,to)=>new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).toArray();
    const first=align(ab,middle.clone().sub(a.p)),upperQ=qmul(first,a.q);
    const second=align(new Vector3(...qrot(first,bc.toArray())),goal.clone().sub(middle));
    const lowerQ=qmul(second,qmul(first,b.q));
    pose.q[upper]=qmul(qinv(frame(bones[upper].parent).q),upperQ);
    pose.q[lower]=qmul(qinv(upperQ),lowerQ);pose.q[end]=qmul(qinv(lowerQ),endQ);
  }

  for(const suffix of ['l','r']){
    const id=name=>rig.index.get(name+'_'+suffix);
    const foot=id('foot'),hand=id('hand'),side=Math.sign(rig.world[foot].p[0])||1;
    const shoe=new Vector3(...pedalPoint(side,phase));
    if(footDown && suffix==='l')shoe.set(side*.25,.013,-.18);
    // The ankle sits above and behind the ball of the foot on the platform.
    shoe.multiplyScalar(scale);shoe.y+=rig.world[foot].p[1];shoe.z-=.075*scale;
    solve(id('thigh'),id('calf'),foot,shoe,rig.world[foot].q,new Vector3(side*.15,.05,1));
    const grip=new Vector3(side*.232,1.08,.36).multiplyScalar(scale),rest=frame(hand).q;
    const knuckle=bones[id('middle_01')].t;
    const curled=new Vector3(...qrot(rest,knuckle)).normalize();
    const wrist=qmul(new Quaternion().setFromUnitVectors(curled,new Vector3(side*.15,-.64,.75).normalize()).toArray(),rest);
    grip.sub(new Vector3(...qrot(wrist,knuckle.map(v=>v*.7))));
    solve(id('upperarm'),id('lowerarm'),hand,grip,wrist,new Vector3(side*.6,-1,-.45));
  }
  return pose;
}
