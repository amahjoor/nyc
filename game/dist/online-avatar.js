import { createHumanMesh } from './human-mesh.js';
import { tidyPerson } from './human-designs.js';

// Transmit the final local skeleton, after clothing fit, locomotion and IK. Every
// client builds its own mesh using the same design and installed garment assets.
export function capturePose(body, player) {
  if (!body) return null;
  const packed = [];
  for (const bone of body.bones) {
    for (const q of bone.quaternion.toArray()) packed.push(128+Math.round(Math.max(-1,Math.min(1,q))*127));
  }
  const hip=body.bones[body.rig.index.get('pelvis')].position;
  const pos=body.mesh.position;
  const offset=(a,b)=>Math.max(-4,Math.min(4,a-b));
  return [offset(pos.x,player.x),offset(pos.y,player.y||0),offset(pos.z,player.z),
    Math.atan2(Math.sin(body.mesh.rotation.y-player.angle), Math.cos(body.mesh.rotation.y-player.angle)),hip.x,hip.y,hip.z,btoa(String.fromCharCode(...packed))];
}

export function remoteCharacter(group, layers, getShop) {
  let desired=tidyPerson(null), seen=null, body=null, pending=false, disposed=false, retry=0;
  let previousPose='', bytes='', target=null;
  function load(now) {
    const shop=getShop();
    if(!shop || !desired || desired===seen || pending || now<retry)return;
    const design=desired;pending=true;
    shop(design,'near').then(built=>{
      if(disposed || desired!==design)return;
      const next=createHumanMesh(built,built.look);
      next.mesh.name='Player character';
      next.mesh.traverse(part=>layers.forEach(layer=>part.layers.enable(layer)));
      if(body){group.remove(body.mesh);body.dispose();}
      body=next;target=next.mesh.quaternion.clone();group.add(body.mesh);seen=design;
    }).catch(()=>{retry=performance.now()+3000;}).finally(()=>{pending=false;});
  }
  return {
    dress(design){desired=tidyPerson(design);},
    frame(pose,heading,f,now){
      load(now);
      if(!body)return;
      body.mesh.rotation.y=heading+(pose?.[3]||0);
      if(!pose)return;
      body.mesh.position.set(pose[0],pose[1],pose[2]);
      if(previousPose!==pose[7]){bytes=atob(pose[7]);previousPose=pose[7];}
      if(bytes.length!==body.bones.length*4)return;
      body.bones[body.rig.index.get('pelvis')].position.set(pose[4],pose[5],pose[6]);
      for(let i=0;i<body.bones.length;i++){
        const k=i*4;
        target.set((bytes.charCodeAt(k)-128)/127,(bytes.charCodeAt(k+1)-128)/127,
          (bytes.charCodeAt(k+2)-128)/127,(bytes.charCodeAt(k+3)-128)/127).normalize();
        body.bones[i].quaternion.slerp(target,f);
      }
    },
    dispose(){disposed=true;if(body){group.remove(body.mesh);body.dispose();}}
  };
}
