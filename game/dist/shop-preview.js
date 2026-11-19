import * as THREE from './vendor/three.module.min.js';
import { createHumanMesh } from './human-mesh.js';
import { showroomModel,disposeSample } from './showroom-models.js';
import { fittedLook, purchaseStock, ownsWearable } from './shop-stock.js';
import { fitPose } from './body-motion.js';

import { servingMaterial } from './food-surface.js';
import { servingGeometry } from './serving-models.js';
import { portionBase,portionLevel } from './food-catalog.js';
import { packageGeometry,packageMaterial } from './grocery-models.js';

let mirror=null;
export const sharedShopPreview=canvas=>mirror??=createShopPreview(canvas);

// One fitting mirror shared by all shops. The live avatar and saved design are
// touched only by checkout. Closing/changing the mirror invalidates slow builds.
export function createShopPreview(canvas) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0xc9c3b9);
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(29,1,.003,18);
  scene.add(new THREE.HemisphereLight(0xfff8ea,0x9c9492,1.6));
  const key=new THREE.DirectionalLight(0xffefde,2.1), rim=new THREE.DirectionalLight(0xe1efff,1.2);
  key.position.set(-2,3,2); rim.position.set(2,2,-1); scene.add(key,rim);
  // Softbox reflections make polished metal, glass and frets readable at any angle.
  const softboxes=document.createElement('canvas');softboxes.width=512;softboxes.height=256;
  const ctx=softboxes.getContext('2d');ctx.fillStyle='#8b8b86';ctx.fillRect(0,0,512,256);
  ctx.fillStyle='#272a2d';ctx.fillRect(0,115,512,85);ctx.fillStyle='#fbfaf5';
  for(const [x,y,w,h] of [[42,49,86,98],[285,58,28,102],[360,0,130,80]])ctx.fillRect(x,y,w,h);
  const studio=new THREE.CanvasTexture(softboxes);studio.mapping=THREE.EquirectangularReflectionMapping;
  studio.colorSpace=THREE.SRGBColorSpace;scene.environment=studio;
  let magnification=1;
  const target=new THREE.Vector3();
  let version=0, subject=null, dispose=null, frame=0, turn=.26, distance=1, tilt=.08, drag=null;
  function draw() {
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if (!width || !height || !subject) return;
    renderer.setSize(width,height,false); camera.aspect=width/height; camera.updateProjectionMatrix();
    const radius=distance/magnification;
    camera.position.set(radius*Math.sin(turn)*Math.cos(tilt),radius*Math.sin(tilt),radius*Math.cos(turn)*Math.cos(tilt)).add(target);
    camera.lookAt(target); renderer.render(scene,camera);
  }
  function tick() { draw(); frame=requestAnimationFrame(tick); }
  function close() {
    version++; cancelAnimationFrame(frame); drag=null;
    if(subject) scene.remove(subject);
    dispose?.(); dispose=null; subject=null;
    renderer.clear();
  }
  canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY}; canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(drag===null)return; turn+=(drag.x-event.clientX)*.012;tilt=THREE.MathUtils.clamp(tilt+(event.clientY-drag.y)*.009,-1.2,1.2);drag={x:event.clientX,y:event.clientY};
  });
  const zoom=factor=>{magnification=THREE.MathUtils.clamp(magnification*factor,.8,2.7);};
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-Math.sign(event.deltaY)*.1));},{passive:false});
  for(const end of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(end,()=>{drag=null;});
  return {close,zoom,rotate:amount=>{turn+=amount;},async show(item,design,grow,moves) {
    close(); const current=version;
    magnification=1;turn=item.slot==='shoes'?.62:.22;
    if(design) {
      if(!grow || !moves)throw new Error('The character is still loading. Reopen the mirror in a moment.');
      const built=await grow(design,'close');
      if(current!==version)return false;
      const body=createHumanMesh(built,built.look);
      body.pose(fitPose(moves,body.rig,moves.sample('idle',.35),{q:[],pelvis:[0,0,0]}));
      subject=body.mesh; dispose=()=>body.dispose();
      const height=body.rig.height;
      const framing={hair:[.905,.43,.05],top:[.64,.98,.06],bottom:[.31,1.24,.05],shoes:[.08,.54,.17]}[item.slot];
      target.set(0,height*framing[0],0);distance=height*framing[1];tilt=framing[2];
      if(item.slot==='shoes'){
        // The idle pose and the customer's leg length put the shoes on either side
        // of the rig origin. Orbit their actual position, including the forward step.
        const shoes=body.meshes.find(mesh=>mesh.name.startsWith('shoes/'));
        if(shoes){
          subject.updateMatrixWorld(true);
          shoes.computeBoundingBox();
          const bounds=shoes.boundingBox,size=bounds.getSize(new THREE.Vector3());
          bounds.getCenter(target);target.y+=.025;
          distance=Math.max(.58,Math.hypot(size.x,size.z)*1.9,size.y*3.2);
        }
      }
    } else {
      if(item.model==='serving'){
        const id=portionBase(item.carry);
        subject=id.startsWith('grocery-')?new THREE.Mesh(packageGeometry(id,false,portionLevel(item.carry)),packageMaterial(false,id)):
          new THREE.Mesh(servingGeometry(item.carry),servingMaterial());
      }else subject=showroomModel(item);
      const box=new THREE.Box3().setFromObject(subject), size=box.getSize(new THREE.Vector3());
      box.getCenter(target);
      distance=item.model==='serving'?Math.max(size.y*2.65,size.x*1.97,size.z*1.97):Math.max(size.y,size.x/.90,size.z)*2.5;
      tilt=item.model==='serving'?(item.carry.startsWith('plate-')?.60:.34):item.model==='ringSample'?.30:.13;
      dispose=item.model==='serving'?()=>subject.material.dispose():()=>disposeSample(subject);
    }
    scene.add(subject);tick();return true;
  }};
}

// The catalog stays available while browsing the sales floor. Services and
// accessories without a preview still use the ordinary counter transaction.
export function browseShop({$,sim,interaction,title,menu,available,order,getLook,applyLook,grow,moves,sale,save}) {
  const shop=sim.room.place, samples=menu.filter(item=>item.sku);
  const catalog=(selected=0)=>{
    const rows=menu.map(item=>({name:item.name,note:ownsWearable(sim,item)?'Owned':'$'+item.price.toFixed(2),item}));
    interaction.openList(title,rows,({item})=>{
      if (item.sku) inspect(item);
      else order(item);
    },{cash:sim.cash,index:selected,available});
  };
  const inspect=item=>{
    const matching=fittedLook(getLook(),item), owned=ownsWearable(sim,item);
    const affordable=owned || sim.cash>=item.price;
    const options=[
      {name:owned?'Wear again':matching?(item.slot==='hair'?'Get this cut':'Buy and wear'):'Buy item',note:owned?'Owned':'$'+item.price.toFixed(2),disabled:true,action:'buy'},
      {name:'Next '+(item.slot==='hair'?'style':'item'),action:'next'},
      {name:'Back to selection',action:'back'},
    ];
    const count=sim.purchases?.[item.sku] || 0;
    const message=!affordable?'You need $'+(item.price-sim.cash).toFixed(2)+' more.':count && !matching?'In your collection · '+count:'';
    let open=true;
    const panel=$('shop-preview'), status=$('mirror-status');
    const controls=interaction.openList(item.name,options,row=>{
      if(row.action==='back')return catalog(menu.indexOf(item));
      if(row.action==='next')return inspect(samples[(samples.indexOf(item)+1)%samples.length]);
      if(!available())return;
      const result=purchaseStock(sim,shop,item);
      if(!result)return;
      if(matching)applyLook(item);
      if(result.paid)sale(shop,result.paid);
      save();
    },{cash:sim.cash,message,available,onRotate:delta=>mirror?.rotate(delta),onClose:()=>{
      open=false;mirror?.close();panel.hidden=true;
    }});
    if(!controls)return;
    panel.hidden=false; status.textContent='Loading preview…';
    try {
      mirror ??= createShopPreview($('shop-mirror'));
      $('mirror-left').onclick=()=>mirror.rotate(-.32);
      $('mirror-right').onclick=()=>mirror.rotate(.32);
      const closer=$('mirror-closer'),farther=$('mirror-farther');
      if(closer)closer.onclick=()=>mirror.zoom(1.18);
      if(farther)farther.onclick=()=>mirror.zoom(1/1.18);
      mirror.show(item,matching,grow,moves).then(ready=>{
        if(!open || !ready)return;
        status.textContent='Drag or use ← → to rotate';
        if(affordable)controls.enable(0);
      }).catch(()=>{if(open)status.textContent='Preview unavailable. Choose another item or reopen the shop.';});
    } catch {
      status.textContent='3D preview unavailable on this device.';
    }
  };
  catalog();
}
