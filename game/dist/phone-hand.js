import * as THREE from './vendor/three.module.min.js';

import { viewHand } from './view-hand.js';

const glassDepth=.006;
const screenNormal=new THREE.Vector3(0,0,1), screenUp=new THREE.Vector3(0,1,0);
const gripRotation=new THREE.Quaternion(.5,-.5,-.5,-.5).premultiply(
  new THREE.Quaternion().setFromAxisAngle(screenNormal,-.65));

// Pose the camera hand in handset coordinates. The knuckle stays at the edge
// for easy taps and slides along the case once the thumb runs out of reach.
export function createScreenGrip(hand){
  const palm=hand.group, base=new THREE.Vector3(), knuckle=new THREE.Vector3(), joint=new THREE.Vector3();
  const axis=new THREE.Vector3(), arch=new THREE.Vector3(), from=new THREE.Vector3(), to=new THREE.Vector3();
  const turn=new THREE.Quaternion(), tip=new THREE.Vector3(), vertex=new THREE.Vector3();
  let mesh,root,middle,end,rest,proximal,distal,padVertices,padPoints;
  function aim(bone,offset,goal){
    from.copy(offset).normalize();
    bone.worldToLocal(to.copy(goal)).normalize();
    bone.quaternion.multiply(turn.setFromUnitVectors(from,to));
  }
  return function place(x,y,hover=0){
    if(!hand.pose('phone'))return false;
    if(mesh!==palm.children[0]){
      mesh=palm.children[0];
      [root,middle,end]=['thumb_01_r','thumb_02_r','thumb_03_r'].map(name=>mesh.getObjectByName(name));
      rest=[root,middle,end].map(bone=>bone.quaternion.clone());
      proximal=end.position.length();
      const id=mesh.skeleton.bones.indexOf(end), inverse=mesh.skeleton.boneInverses[id];
      const {position,skinIndex}=mesh.geometry.attributes;
      padVertices=[];
      for(let i=0;i<position.count;i++){
        if(skinIndex.getX(i)!==id)continue;
        vertex.fromBufferAttribute(position,i).applyMatrix4(inverse);
        if(vertex.y>proximal*.38)padVertices.push(i);
      }
      padPoints=padVertices.map(()=>new THREE.Vector3());
      distal=proximal*.74;
    }
    // Roll the case against the fingers as the thumb crosses the display.
    const across=THREE.MathUtils.smoothstep(.032-x,0,.070);
    palm.quaternion.copy(gripRotation).premultiply(turn.setFromAxisAngle(screenUp,-.52-.52*across));
    palm.quaternion.premultiply(turn.setFromAxisAngle(screenNormal,.53*THREE.MathUtils.smoothstep(y,-.030,.065)));
    palm.position.set(0,0,0);
    root.quaternion.copy(rest[0]);middle.quaternion.copy(rest[1]);end.quaternion.copy(rest[2]);
    tip.set(x,y,glassDepth+.007+hover);
    // Slide up the long edge first, leaving the thumb free to cross the width.
    knuckle.set(.051,THREE.MathUtils.clamp(-.044,y-.030,y+.030),tip.z);
    // Keep a little bend in reserve. Moving the wrist only by the excess
    // distance also lets the support fingers settle during a held touch.
    axis.subVectors(knuckle,tip);
    const reach=(proximal+distal)*.88, rise=proximal*.62;
    knuckle.copy(tip).add(axis.clampLength(.024,Math.sqrt(reach*reach-rise*rise)));
    knuckle.z+=rise;
    const length=middle.position.length();
    const dx=THREE.MathUtils.clamp(.046-knuckle.x,.003,length*.85), dy=-length*.23;
    base.set(knuckle.x+dx,knuckle.y+dy,knuckle.z-Math.sqrt(length*length-dx*dx-dy*dy));
    root.getWorldPosition(from);
    palm.position.subVectors(base,from);
    aim(root,middle.position,knuckle);

    // Solve the last two links with the joint arched toward the viewer.
    axis.subVectors(tip,knuckle);
    const distance=axis.length();
    axis.divideScalar(distance);
    const along=(proximal*proximal-distal*distal+distance*distance)/(2*distance);
    arch.set(0,.5,1);
    arch.addScaledVector(axis,-arch.dot(axis)).normalize();
    joint.copy(knuckle).addScaledVector(axis,along)
      .addScaledVector(arch,Math.sqrt(Math.max(0,proximal*proximal-along*along)));
    aim(middle,end.position,joint);
    aim(end,end.up,tip);

    // Register the actual skinned pad against the glass. A joint endpoint
    // alone misses the contact patch, especially when the thumb rolls sideways.
    palm.updateMatrixWorld(true);
    let lowest=Infinity;
    for(const [i,index] of padVertices.entries()){
      const p=mesh.getVertexPosition(index,padPoints[i]).applyMatrix4(mesh.matrixWorld);
      lowest=Math.min(lowest,p.z);
    }
    let sum=0,cx=0,cy=0;
    for(const p of padPoints){
      const weight=Math.max(0,1-(p.z-lowest)/.002);
      sum+=weight;cx+=weight*p.x;cy+=weight*p.y;
    }
    if(sum)palm.position.add(vertex.set(x-cx/sum,y-cy/sum,glassDepth+hover-lowest));
    return true;
  };
}

// One handset follows the posed palm in the world. In first person the
// interactive display supplies its face and the grip follows the screen edge.
export function createPhoneHand(roomLayer, viewLayer, handset) {
  const group=new THREE.Group(), phone=new THREE.Group(), hand=viewHand('r'), grip=hand.group;
  group.name='Handheld phone'; group.visible=false; group.add(phone,grip);
  const overlayHand=viewHand('r'), stage=new THREE.Scene();
  stage.add(overlayHand.group);
  const placeGrip=createScreenGrip(overlayHand);
  const lens=new THREE.OrthographicCamera(-.084,.144,.100,-.200,.01,1);
  lens.position.z=.5;
  let overlay,drawn='',drawnMesh=null,shownX=0,shownY=0;
  const rim=new THREE.MeshStandardMaterial({color:0x898e93,metalness:.65,roughness:.32});
  const face=new THREE.MeshStandardMaterial({color:0x101215,metalness:.18,roughness:.28});
  const display=new THREE.MeshBasicMaterial({color:0x5885a0});
  const shell=new THREE.Mesh(new THREE.BoxGeometry(.076,.144,.009),rim);
  const bezel=new THREE.Mesh(new THREE.BoxGeometry(.074,.142,.0095),face);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(.067,.102),display);glass.position.z=.005;
  const home=new THREE.Mesh(new THREE.RingGeometry(.005,.0057,20),rim);home.position.set(0,-.06,.005);
  const speaker=new THREE.Mesh(new THREE.PlaneGeometry(.015,.0014),rim);speaker.position.set(0,.06,.005);
  phone.add(shell,bezel,glass,home,speaker);
  let amount=0, bend=0, tapHold=0, tapX=0, tapY=0, reachSeconds=.085, shift=0;
  const parentOrientation=new THREE.Quaternion(),bodyOrientation=new THREE.Quaternion();
  const point=new THREE.Vector3();
  function holdEdges(){
    hand.pose('phone');
    grip.quaternion.copy(gripRotation);grip.position.set(-.023,-.043,-.025);
  }
  const caseSize={value:new THREE.Vector2()},pixelsPerMeter={value:new THREE.Vector2()},cornerRadius={value:0};
  const glassInView={value:glassDepth-lens.position.z-.0001}; // Allow contact at the surface.
  const overlayMaterials=[];
  function maskHand(root){
    for(const material of overlayMaterials)material.dispose();
    overlayMaterials.length=0;
    root.traverse(part=>{
      if(!part.isSkinnedMesh)return;
      const source=part.material,material=source.clone();
      // Only skin influenced by the opposing thumb can reach around the rim.
      // The sleeve shares the skeleton but always belongs behind the handset.
      const joints=part===root?part.skeleton.bones.flatMap((bone,i)=>bone.name.startsWith('thumb_')?[i]:[]):[];
      const weights=joints.map(i=>`dot(skinWeight,vec4(equal(skinIndex,vec4(${i}.0))))`).join('+') || '0.0';
      const varying='varying vec3 phonePosition; varying float phoneThumb;\n';
      material.onBeforeCompile=(shader,renderer)=>{
        source.onBeforeCompile(shader,renderer);
        Object.assign(shader.uniforms,{caseSize,pixelsPerMeter,cornerRadius,glassInView});
        shader.vertexShader=varying+shader.vertexShader.replace('#include <project_vertex>',
          `#include <project_vertex>\nphonePosition=mvPosition.xyz;phoneThumb=${weights};`);
        shader.fragmentShader=varying+'uniform vec2 caseSize,pixelsPerMeter; uniform float cornerRadius,glassInView;\n'+
          shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
            #include <clipping_planes_fragment>
            vec2 corner=abs(phonePosition.xy)*pixelsPerMeter-caseSize*.5+cornerRadius;
            float edge=length(max(corner,vec2(0.)))+min(max(corner.x,corner.y),0.)-cornerRadius;
            if(edge<=0. && (phoneThumb<.5 || phonePosition.z<glassInView))discard;
          `);
      };
      material.customProgramCacheKey=()=>source.customProgramCacheKey()+'/phone-case/'+joints.join(',');
      overlayMaterials.push(material);part.material=material;
    });
  }
  function drawContact(renderer,rect){
    if(!renderer?.isWebGLRenderer || !overlayHand.pose('phone'))return false;
    if(!overlay){
      const canvas=handset.ownerDocument.getElementById('phone-thumb');
      if(!canvas?.getContext)return false;
      overlay=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
      overlay.setClearColor(0,0);
      stage.add(new THREE.HemisphereLight(0xfff4e8,0xa19791,1.65));
      const light=new THREE.DirectionalLight(0xfff1e2,2);
      light.position.set(-2,3,4);stage.add(light);
    }
    const mesh=overlayHand.group.children[0],w=Math.round(rect.width*3),h=Math.round(rect.height*.30/.144);
    // The absolutely positioned canvas is sized against the padding box. The
    // case also includes the border; resolve its rounded outline in CSS pixels.
    const width=handset.clientWidth,height=handset.clientHeight;
    const state=[w,h,width,height,bend,shownX,shownY,Boolean(mesh.material.map?.image?.width)].join('/');
    if(mesh!==drawnMesh)maskHand(mesh);
    if(state===drawn && mesh===drawnMesh)return true;
    if(caseSize.value.x!==handset.offsetWidth || caseSize.value.y!==handset.offsetHeight){
      caseSize.value.set(handset.offsetWidth,handset.offsetHeight);
      pixelsPerMeter.value.set(width/.076,height/.144);
      const css=handset.ownerDocument.defaultView.getComputedStyle(handset);
      cornerRadius.value=Math.min(parseFloat(css.borderTopLeftRadius),caseSize.value.x/2,caseSize.value.y/2);
    }
    drawn=state;drawnMesh=mesh;
    if(overlay.domElement.width!==w || overlay.domElement.height!==h)overlay.setSize(w,h,false);
    const weight=bend*bend*(3-2*bend);
    const x=THREE.MathUtils.lerp(.032,shownX*.076,weight);
    const y=THREE.MathUtils.lerp(-.035,shownY*.144,weight);
    placeGrip(x,y,.009*(1-weight));
    overlay.render(stage,lens);
    return true;
  }
  function attach(parent,layer) {
    if(group.parent!==parent){
      parent.add(group);
      group.traverse(m=>{m.layers.set(layer);if(layer!==viewLayer)m.layers.enable(roomLayer);});
    }
    group.visible=true;
  }
  return {
    group, get amount(){return amount;}, get tapBend(){return bend;},
    contactPoint(out){return phone.localToWorld(out.set(tapX*.076,tapY*.144,glassDepth));},
    advance(dt,open,pressing=false,firstPerson=false){
      handset?.classList?.toggle('held-in-view',firstPerson && open);
      if(bend===0){shownX=tapX;shownY=tapY;}
      else{
        const step=-Math.expm1(-dt*30);
        shownX=THREE.MathUtils.lerp(shownX,tapX,step);
        shownY=THREE.MathUtils.lerp(shownY,tapY,step);
        if(Math.abs(shownX-tapX)+Math.abs(shownY-tapY)<.0003){shownX=tapX;shownY=tapY;}
      }
      amount=THREE.MathUtils.clamp(amount+(open?1:-1)*dt*3.8,0,1);
      bend=THREE.MathUtils.clamp(bend+dt*(open && (pressing || tapHold>0)?1/reachSeconds:-7),0,1);
      // Let the case settle slightly lower in the hand for the high rows.
      const settle=firstPerson && open ? THREE.MathUtils.smoothstep(shownY,-.08,.42)*THREE.MathUtils.smoothstep(bend,0,1) : 0;
      const pixels=Math.round(settle*4*100)/100;
      if(pixels!==shift){
        shift=pixels;handset?.style?.setProperty?.('--phone-grip-drop',pixels+'px');
      }
      tapHold=Math.max(0,tapHold-dt);group.visible=false;
    },
    tap(x=.5,y=.5,instant=false){
      tapX=THREE.MathUtils.clamp(x,0,1)-.5;tapY=.5-THREE.MathUtils.clamp(y,0,1);
      const weight=THREE.MathUtils.smoothstep(bend,0,1);
      const travel=Math.hypot(tapX*.076-THREE.MathUtils.lerp(.032,shownX*.076,weight),
        tapY*.144-THREE.MathUtils.lerp(-.035,shownY*.144,weight));
      reachSeconds=.085+.095*THREE.MathUtils.smoothstep(travel,.028,.11);
      tapHold=reachSeconds+.04;
      if(instant){bend=1;shownX=tapX;shownY=tapY;}
      return instant?0:reachSeconds*1000;
    },
    tone(color){if(color){handset?.style?.setProperty?.('--phone-skin',color);}},
    hold(parent,x,y,z,withHand=true){
      if(!amount)return;
      attach(parent,0);phone.visible=true;grip.visible=withHand;group.scale.setScalar(1);
      group.position.set(x,y,z);group.rotation.set(-.27+.24*(1-amount),Math.PI,-.08);
      holdEdges();
    },
    inPalm(palm,knuckle,body){
      if(!amount)return;
      attach(palm,0);phone.visible=true;grip.visible=false;holdEdges();
      // Orient the wrist behind the display, then put the display at the
      // inverse of the same knuckle registration used in the close-up.
      const rotation=group.quaternion.setFromEuler(group.rotation.set(-.27,Math.PI,-.08));
      palm.parent.getWorldQuaternion(parentOrientation).invert();
      body.getWorldQuaternion(bodyOrientation);
      palm.quaternion.copy(parentOrientation).multiply(bodyOrientation).multiply(rotation).multiply(grip.quaternion);
      group.quaternion.copy(grip.quaternion).invert();
      group.scale.setScalar(1);
      group.position.copy(grip.position).applyQuaternion(group.quaternion).negate().add(point.fromArray(knuckle));
    },
    cameraGrip(camera,scene,rect,width,height,renderer){
      if(!amount || !rect.width || !rect.height)return;
      if(!camera.parent)scene.add(camera);
      camera.layers.enable(viewLayer);attach(camera,viewLayer);phone.visible=false;grip.visible=true;
      const depth=.37,unit=2*Math.tan(camera.fov*Math.PI/360)*depth/height;
      // Match the actual handset's width at this depth, including portrait layouts.
      group.scale.setScalar(rect.width*unit/.076);
      point.set((rect.left+rect.width*.5-width*.5)*unit,(height*.5-rect.top-rect.height*.54)*unit,-depth);
      group.position.copy(point);group.rotation.set(0,0,0);
      holdEdges();grip.visible=!drawContact(renderer,rect);
    }
  };
}
