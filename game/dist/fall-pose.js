// Passive limbs follow a falling torso. Integrate the elbow, wrist, knee and
// ankle in metres, then fit each two-bone chain without changing its length.
import {Vector3,Quaternion} from './vendor/three.module.min.js';

const states=new WeakMap(), up=new Vector3(0,1,0), across=new Vector3(1,0,0);
const axis=new Vector3(),delta=new Vector3(),bend=new Vector3(),target=new Vector3();
const vertical=new Vector3(),tangent=new Vector3(),velocity=new Vector3(),impulse=new Vector3();
const turn=new Quaternion(),parentTurn=new Quaternion(),rotation=new Quaternion();
function joint(){return {p:new Vector3(),q:new Quaternion()};}
function updateJoint(rig,pose,world,i){
  const bone=rig.bones[i], at=world[i], parent=world[bone.parent];
  at.p.fromArray(bone.name==='pelvis'?pose.pelvis:bone.t);
  at.q.fromArray(pose.q[i]);
  if(parent){at.p.applyQuaternion(parent.q).add(parent.p);at.q.premultiply(parent.q);}
}
function rotateBone(rig,pose,world,i,worldRotation){
  const parent=world[rig.bones[i].parent];
  turn.copy(parent.q).invert().multiply(worldRotation).multiply(parent.q).multiply(world[i].local);
  turn.normalize().toArray(pose.q[i]);
  updateJoint(rig,pose,world,i);
}
function particle(){return {p:new Vector3(),v:new Vector3()};}
function makeState(rig){
  const limbs=[];
  for(const side of ['l','r'])for(const leg of [false,true]){
    const ids=(leg?['thigh','calf','foot']:['upperarm','lowerarm','hand']).map(n=>rig.index.get(n+'_'+side));
    limbs.push({ids,leg,joints:[particle(),particle()]});
  }
  return {rig,age:null,world:rig.bones.map(()=>({...joint(),local:new Quaternion()})),limbs,velocity:new Vector3()};
}
function integrate(node,goal,h,floor,radius,stiffness,damping){
  node.v.addScaledVector(delta.subVectors(goal,node.p),stiffness*h);
  node.v.y-=9.81*h;
  node.v.multiplyScalar(Math.exp(-damping*h));
  node.p.addScaledVector(node.v,h);
  if(node.p.y<floor+radius){
    node.p.y=floor+radius;
    if(node.v.y<0)node.v.y*=-.14;
    const friction=Math.exp(-12*h);node.v.x*=friction;node.v.z*=friction;
  }
}
function aim(rig,pose,world,i,next,goal){
  const start=world[i].p;
  const toward=axis.subVectors(goal,start);
  if(toward.lengthSq()<1e-9)return;
  rotation.setFromUnitVectors(delta.subVectors(world[next].p,start).normalize(),toward.normalize());
  rotateBone(rig,pose,world,i,rotation);
  updateJoint(rig,pose,world,next);
}

/** Modify a fitted pose, in actor space, for the current simulated impact. */
export function fitFallPose(rig,pose,r,heading=0){
  if(!r?.fall || r.forward==null)return;
  let s=states.get(r);
  if(!s || s.rig!==rig){s=makeState(rig);states.set(r,s);}
  const {world}=s;
  const elapsed=s.age==null?0:r.age-s.age;
  const reset=s.age==null || elapsed>.15 || elapsed<0;
  s.age=r.age;
  const recover=Math.min(1,(r.recover||0)/.9),weight=1-recover*recover*(3-2*recover);
  if(weight<=0)return;
  const pelvis=rig.index.get('pelvis'),hipParent=rig.bones[pelvis].parent;
  const head=rig.index.get('Head');
  for(let i=0;i<world.length;i++){
    world[i].local.fromArray(pose.q[i]);
    updateJoint(rig,pose,world,i);
  }
  // Redirect the backward pitch of the knockdown into the actual fall plane.
  // Preserve the character's facing, including when they land on their side.
  const angle=Math.min(r.angle,1.50)*weight;
  // The stock fall moves its pelvis backward. Carry that displacement in
  // the impact direction as well as rotating the torso.
  const restHip=rig.world[pelvis].p;
  const forwardTravel=(world[pelvis].p.z-restHip[2])*weight;
  delta.set(-forwardTravel*r.side,0,-forwardTravel*(1+r.forward))
    .applyQuaternion(parentTurn.copy(world[hipParent].q).invert());
  for(let k=0;k<3;k++)pose.pelvis[k]+=delta.getComponent(k);
  axis.set(r.forward,0,-r.side).normalize();
  rotation.setFromAxisAngle(axis,angle+r.rock*weight).multiply(turn.setFromAxisAngle(across,angle));
  rotateBone(rig,pose,world,pelvis,rotation);
  const floor=-r.clearance;
  for(let i=pelvis+1;i<world.length;i++)updateJoint(rig,pose,world,i);
  // Keep the cranium and the lower shoulder clear as the torso rolls over.
  const shoulders=s.limbs.filter(limb=>!limb.leg);
  const lowest=Math.min(world[head].p.y-.135*rig.scale,world[pelvis].p.y-.13*rig.scale,
    ...shoulders.map(limb=>world[limb.ids[0]].p.y-.085*rig.scale));
  if(lowest<floor){
    delta.copy(up).multiplyScalar((floor-lowest)*weight).applyQuaternion(parentTurn.copy(world[hipParent].q).invert());
    for(let i=0;i<3;i++)pose.pelvis[i]+=delta.getComponent(i);
    for(let i=pelvis;i<world.length;i++)updateJoint(rig,pose,world,i);
  }
  const sx=Math.sin(heading),sz=Math.cos(heading);
  velocity.set(r.vx*sz-r.vz*sx,r.vy,r.vx*sx+r.vz*sz);
  impulse.copy(s.velocity).sub(velocity);
  s.velocity.copy(velocity);
  for(const limb of s.limbs){
    const [a,b,c]=limb.ids,root=world[a].p,knee=world[b].p,tip=world[c].p;
    const upper=root.distanceTo(knee),lower=knee.distanceTo(tip);
    for(const [i,goal] of [knee,tip].entries()){
      const node=limb.joints[i];
      if(reset){node.p.copy(goal);node.v.copy(velocity).multiplyScalar(-(i+1)*(limb.leg?.14:.23));}
      else node.v.addScaledVector(impulse,(i+1)*(limb.leg?.23:.36));
    }
    const [mid,end]=limb.joints;
    const radius=rig.scale*(limb.leg?.085:.045);
    for(let left=reset?0:elapsed;left>1e-7;){
      const h=Math.min(left,1/90);left-=h;
      integrate(mid,knee,h,floor,radius,limb.leg?52:32,4.5);
      integrate(end,tip,h,floor,radius,limb.leg?34:18,3.8);
      // The anchors transmit tension to the next link, even while airborne.
      delta.subVectors(mid.p,root).clampLength(upper,upper);mid.p.copy(root).add(delta);
      delta.subVectors(end.p,mid.p).clampLength(lower,lower);end.p.copy(mid.p).add(delta);
    }
    target.copy(tip).lerp(end.p,weight);
    target.y=Math.max(target.y,floor+radius);
    axis.subVectors(target,root);
    const gap=Math.max(.0001,axis.length());axis.divideScalar(gap);
    const length=Math.max(Math.abs(upper-lower)+.001,Math.min(upper+lower-.001,gap));
    target.copy(root).addScaledVector(axis,length);
    bend.copy(knee).lerp(mid.p,weight).sub(root);
    bend.addScaledVector(axis,-bend.dot(axis));
    if(bend.lengthSq()<1e-8)continue;
    const along=(upper*upper-lower*lower+length*length)/(2*length);
    bend.normalize();
    const arc=Math.sqrt(Math.max(0,upper*upper-along*along));
    // On the circle of possible elbow/knee positions, choose the nearest
    // point on the permitted side of the ground plane.
    vertical.copy(up).addScaledVector(axis,-axis.y);
    const rise=vertical.length();
    const minimum=(floor+radius-root.y-axis.y*along)/Math.max(.0001,arc*rise);
    if(rise>.0001 && bend.y<minimum*rise){
      vertical.divideScalar(rise);
      tangent.copy(bend).addScaledVector(vertical,-bend.dot(vertical));
      if(tangent.lengthSq()<1e-8)tangent.crossVectors(axis,vertical);
      const t=Math.min(1,minimum);
      bend.copy(vertical).multiplyScalar(t).addScaledVector(tangent.normalize(),Math.sqrt(1-t*t));
    }
    const midGoal=bend.multiplyScalar(arc)
      .add(root).addScaledVector(axis,along);
    aim(rig,pose,world,a,b,midGoal);
    updateJoint(rig,pose,world,c);
    aim(rig,pose,world,b,c,target);
  }
}
