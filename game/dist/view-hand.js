// Use the player's close-detail skin, UVs, inverse bind matrices and joint
// placements. A view hand has its own skeleton so camera animation and the
// world body can pose independently. Local +Y runs from wrist to fingertips.
import * as T from './vendor/three.module.min.js';
import { fingerPose } from './hand-poses.js';
let sources={};
const unit=new T.Vector3(1,1,1);
const matrix=frame=>new T.Matrix4().compose(new T.Vector3(...frame.p),new T.Quaternion(...frame.q),unit);

export function setHandSource(built,meshes){
  for(const source of Object.values(sources))for(const part of source.parts)part.geometry.dispose();
  sources={};
  for(const side of ['l','r'])sources[side]=buildHand(built,meshes,side);
}
function buildHand(built,meshes,side){
  const {rig}=built,wrist=rig.index.get('hand_'+side),forearm=rig.index.get('lowerarm_'+side);
  const inv=matrix(rig.bind[wrist]).invert();
  const ids=[forearm,wrist,...fingerPose(rig,'support',side).map(([i])=>i)];
  const remap=new Map(ids.map((id,i)=>[id,i])),parts=[];
  for(const piece of built.pieces){
    if(piece.kind!=='skin' && piece.slot!=='top')continue;
    const geometry=forearmGeometry(piece,inv,remap);
    if(geometry)parts.push({geometry,material:meshes.find(m=>m.name===piece.kind+'/'+piece.id).material});
  }
  return {parts,rig,ids,remap,wrist,inverses:ids.map(i=>matrix(rig.bind[i]).invert().multiply(matrix(rig.bind[wrist])))};
}

function forearmGeometry(piece,inv,remap){
  const point=new T.Vector3();
  const vertices=new Map(),position=[],normal=[],uv=[],skinIndex=[],skinWeight=[],indices=[];
  function keep(v){
    if(!remap.has(piece.skinIndex[v*4]))return false;
    return point.fromArray(piece.position,v*3).applyMatrix4(inv).y>-.22;
  }
  function vertex(v){
    if(vertices.has(v))return vertices.get(v);
    const index=vertices.size;vertices.set(v,index);
    position.push(...point.fromArray(piece.position,v*3).applyMatrix4(inv).toArray());
    normal.push(...point.fromArray(piece.normal,v*3).transformDirection(inv).toArray());
    uv.push(piece.uv[v*2],piece.uv[v*2+1]);
    for(let k=0;k<4;k++){skinIndex.push(remap.get(piece.skinIndex[v*4+k])??0);skinWeight.push(piece.skinWeight[v*4+k]);}
    return index;
  }
  for(let i=0;i<piece.index.length;i+=3){
    const a=piece.index[i],b=piece.index[i+1],c=piece.index[i+2];
    if(keep(a)&&keep(b)&&keep(c))indices.push(vertex(a),vertex(b),vertex(c));
  }
  if(!indices.length)return null;
  const geometry=new T.BufferGeometry();
  for(const [name,values,size] of [['position',position,3],['normal',normal,3],['uv',uv,2],['skinWeight',skinWeight,4]])
    geometry.setAttribute(name,new T.Float32BufferAttribute(values,size));
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndex,4));geometry.setIndex(indices);
  return geometry;
}

// The group origin is an anatomical landmark, allowing a prop or button
// to stay registered even when the character's hand proportions change.
export function viewHand(side='l'){
  const group=new T.Group(),point=new T.Vector3();
  let current,mesh,bones,style,anchor;
  function pose(next,landmark='middle_01_'+side){
    const source=sources[side];
    if(!source)return false;
    if(current!==source){
      if(mesh){group.remove(mesh);mesh.skeleton.dispose();}
      current=source;style=null;
      const {parts,ids,rig,remap,inverses,wrist}=source;
      const {geometry,material}=parts[0];
      mesh=new T.SkinnedMesh(geometry,material);mesh.frustumCulled=false;
      bones=ids.map(i=>{const bone=new T.Bone();bone.name=rig.bones[i].name;bone.position.fromArray(rig.bones[i].t);bone.quaternion.fromArray(rig.bones[i].q);return bone;});
      ids.forEach((id,k)=>{if(k)bones[remap.get(rig.bones[id].parent)].add(bones[k]);});
      matrix(rig.world[wrist]).invert().multiply(matrix(rig.world[ids[0]])).decompose(bones[0].position,bones[0].quaternion,bones[0].scale);
      mesh.add(bones[0]);mesh.bind(new T.Skeleton(bones,inverses),new T.Matrix4());
      mesh.layers.mask=group.layers.mask;group.add(mesh);
      for(const part of parts.slice(1)){
        const sleeve=new T.SkinnedMesh(part.geometry,part.material);
        sleeve.bind(mesh.skeleton,new T.Matrix4());sleeve.frustumCulled=false;
        sleeve.layers.mask=group.layers.mask;mesh.add(sleeve);
      }
    }
    if(style!==next||anchor!==landmark){
      style=next;anchor=landmark;
      const {rig,remap}=current;
      for(const [i,q] of fingerPose(rig,style,side))bones[remap.get(i)].quaternion.fromArray(q);
      mesh.position.set(0,0,0);
      const tip=bones[remap.get(rig.index.get(anchor))];
      point.set(0,0,0);
      if(anchor.includes('_03'))point.copy(tip.position).applyQuaternion(tip.quaternion.clone().invert()).multiplyScalar(.74);
      mesh.worldToLocal(tip.localToWorld(point));mesh.position.copy(point).negate();
    }
    return true;
  }
  // A distant touch can fully extend the thumb while the grip stays anchored.
  const tipOffset=new T.Vector3(),tip=new T.Vector3(),aim=new T.Vector3();
  const turn=new T.Quaternion(),identity=new T.Quaternion();
  function reachThumb(target){
    const {rig,remap}=current,chain=[];
    for(const [i,q] of fingerPose(rig,'phone',side)){
      if(!rig.bones[i].name.startsWith('thumb_'))continue;
      const bone=bones[remap.get(i)];bone.quaternion.fromArray(q);chain.push(bone);
    }
    const end=chain[2],rest=rig.bones[rig.index.get('thumb_03_'+side)];
    tipOffset.copy(end.position).applyQuaternion(turn.fromArray(rest.q).invert()).multiplyScalar(.74);
    for(let pass=0;pass<8;pass++)for(const joint of chain){
      joint.worldToLocal(end.localToWorld(tip.copy(tipOffset))).normalize();
      joint.worldToLocal(aim.copy(target)).normalize();
      turn.setFromUnitVectors(tip,aim);
      const angle=identity.angleTo(turn);
      if(angle>.17)turn.slerp(identity,1-.17/angle);
      joint.quaternion.multiply(turn);
    }
  }
  return {group,pose,reachThumb,dispose(){mesh?.skeleton.dispose();}};
}
