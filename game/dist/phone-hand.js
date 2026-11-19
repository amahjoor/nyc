import * as THREE from './vendor/three.module.min.js';

import { viewHand } from './view-hand.js';

// One handset follows the posed palm in the world. In first person the
// interactive display supplies its face and the grip follows the screen edge.
export function createPhoneHand(roomLayer, viewLayer, handset) {
  const group=new THREE.Group(), phone=new THREE.Group(), hand=viewHand('r'), grip=hand.group;
  group.name='Handheld phone'; group.visible=false; group.add(phone,grip);
  const overlayHand=viewHand('r'), stage=new THREE.Scene();
  stage.add(overlayHand.group);
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
  let amount=0, bend=0, tapHold=0, tapX=0, tapY=0;
  const parentOrientation=new THREE.Quaternion(),bodyOrientation=new THREE.Quaternion();
  const point=new THREE.Vector3(),upScreen=new THREE.Vector3(0,0,1);
  const orientation=new THREE.Quaternion(.5,-.5,-.5,-.5).premultiply(
    new THREE.Quaternion().setFromAxisAngle(upScreen,-.65));
  function holdEdges(){
    hand.pose('phone');
    grip.quaternion.copy(orientation);grip.position.set(-.023,-.043,-.025);
  }
  const overlayMaterials=[];
  function prepareOverlaySkin(root){
    for(const material of overlayMaterials)material.dispose();
    overlayMaterials.length=0;
    root.traverse(part=>{
      if(!part.isSkinnedMesh)return;
      const geometry=part.geometry,ids=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
      const thumbBones=part.skeleton.bones.map(b=>b.name.startsWith('thumb_'));
      const influence=new Float32Array(ids.count);
      for(let i=0;i<ids.count;i++)for(let j=0;j<4;j++){
        if(thumbBones[ids.getComponent(i,j)])influence[i]+=weights.getComponent(i,j);
      }
      geometry.setAttribute('phoneThumb',new THREE.BufferAttribute(influence,1));
      const original=part.material,material=original.clone();
      const declarations='varying vec3 phonePosition; varying float thumbInfluence;\n';
      material.onBeforeCompile=(shader,renderer)=>{
        original.onBeforeCompile(shader,renderer);
        shader.vertexShader='attribute float phoneThumb;\n'+declarations+shader.vertexShader.replace(
          '#include <project_vertex>','#include <project_vertex>\nphonePosition=mvPosition.xyz; thumbInfluence=phoneThumb;');
        // The case covers the support fingers. Only the opposing thumb
        // can cross its front face, including at the rounded corners.
        shader.fragmentShader=declarations+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
          #include <clipping_planes_fragment>
          vec2 corner=abs(phonePosition.xy)-vec2(.029,.063);
          float rim=length(max(corner,vec2(0.)))+min(max(corner.x,corner.y),0.)-.009;
          if(rim<0. && (thumbInfluence<.10 || phonePosition.z<-.494))discard;`);
      };
      material.customProgramCacheKey=()=>original.customProgramCacheKey()+'-phone-thumb';
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
    const state=[w,h,bend,shownX,shownY,Boolean(mesh.material.map?.image?.width)].join('/');
    if(mesh!==drawnMesh)prepareOverlaySkin(mesh);
    if(state===drawn && mesh===drawnMesh)return true;
    drawn=state;drawnMesh=mesh;
    if(overlay.domElement.width!==w || overlay.domElement.height!==h)overlay.setSize(w,h,false);
    const palm=overlayHand.group;
    palm.quaternion.copy(orientation);
    const weight=bend*bend*(3-2*bend);
    const x=THREE.MathUtils.lerp(.032,shownX*.076,weight);
    const y=THREE.MathUtils.lerp(-.035,shownY*.144,weight);
    palm.position.set(-.023+.25*(x-.032),-.043+.75*(y+.035),-.025);
    // Lead distant buttons with the wrist. The pad descends onto the
    // glass while the four supporting fingers keep their grip.
    overlayHand.reachThumb(point.set(x,y,.011+.009*(1-weight)));
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
    contactPoint(out){return phone.localToWorld(out.set(tapX*.076,tapY*.144,.006));},
    advance(dt,open,pressing=false,firstPerson=false){
      handset?.classList?.toggle('held-in-view',firstPerson && open);
      if(bend===0){shownX=tapX;shownY=tapY;}
      else{const step=Math.min(1,dt*24);shownX+=(tapX-shownX)*step;shownY+=(tapY-shownY)*step;}
      amount=THREE.MathUtils.clamp(amount+(open?1:-1)*dt*3.8,0,1);
      bend=THREE.MathUtils.clamp(bend+dt*(open && (pressing || tapHold>0)?12:-8),0,1);
      tapHold=Math.max(0,tapHold-dt);group.visible=false;
    },
    tap(x=.5,y=.5,instant=false){
      tapX=THREE.MathUtils.clamp(x,0,1)-.5;tapY=.5-THREE.MathUtils.clamp(y,0,1);tapHold=.12;
      if(instant){bend=1;shownX=tapX;shownY=tapY;}
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
