import { Vector3, Quaternion } from './vendor/three.module.min.js';
import { qmul, qinv, qrot } from './body.js';

// A two-link chain with a prescribed bend direction and end orientation.
export function limbFit(rig,pose){
  const {bones}=rig,pelvis=rig.index.get('pelvis');
  function frame(i){
    const bone=bones[i],t=i===pelvis?pose.pelvis:bone.t;
    if(bone.parent<0)return {p:new Vector3(...t),q:pose.q[i]};
    const parent=frame(bone.parent);
    return {p:parent.p.add(new Vector3(...qrot(parent.q,t))),q:qmul(parent.q,pose.q[i])};
  }
  function solve(upper,lower,end,goal,endQ,bend){
    const a=frame(upper),b=frame(lower),c=frame(end);
    const ab=b.p.clone().sub(a.p),bc=c.p.clone().sub(b.p);
    const axis=goal.clone().sub(a.p),d=Math.max(Math.abs(ab.length()-bc.length())+.00001,Math.min(axis.length(),ab.length()+bc.length()-.00001));
    axis.normalize();bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const along=(ab.lengthSq()-bc.lengthSq()+d*d)/(2*d);
    const middle=a.p.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,ab.lengthSq()-along*along)));
    const align=(from,to)=>new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).toArray();
    const first=align(ab,middle.clone().sub(a.p)),upperQ=qmul(first,a.q);
    const second=align(new Vector3(...qrot(first,bc.toArray())),a.p.clone().addScaledVector(axis,d).sub(middle));
    const lowerQ=qmul(second,qmul(first,b.q));
    pose.q[upper]=qmul(qinv(frame(bones[upper].parent).q),upperQ);
    pose.q[lower]=qmul(qinv(upperQ),lowerQ);pose.q[end]=qmul(qinv(lowerQ),endQ);
  }

  return {frame,solve};
}
