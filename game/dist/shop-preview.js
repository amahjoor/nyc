import { purchaseLimit } from './money.js';
import * as THREE from './vendor/three.module.min.js';
import { createHumanMesh } from './human-mesh.js';
import { showroomModel,disposeSample } from './showroom-models.js';
import { fittedLook, purchaseStock, ownsWearable, ownedWearables, wearing } from './shop-stock.js';
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

// A clothes shop is browsed by section: tops, bottoms, shoes, hair. Inside a section nothing is looked at in a window of
// its own: the piece the list is resting on is put on the customer where they stand (`tryOn`), and the game's own camera
// comes round in front of them and frames that part of them (`fitting`). Buying keeps it on; moving on, or leaving, puts
// back what they came in wearing. What cannot be worn (a ring, a guitar) is still turned over in the mirror, as before.
const SECTIONS=[['top','Tops'],['bottom','Bottoms'],['shoes','Shoes'],['bag','Bags'],['hair','Hair']];
/**
 * The changing room: what the customer already owns, by section, tried on and put on the same way as on the shop floor,
 * for nothing. `base()` gives the clothes they were first made with, by slot (`{top: {top, topColour}, ...}`), which no
 * shop sold them and which they can always go back to. `wear(item)` puts a piece on for good.
 */
export function changeClothes({sim,interaction,available,getLook,wear,tryOn=()=>{},fitting=()=>{},base=()=>({})}) {
  const owned=ownedWearables(sim), first=base();
  const shelves=SECTIONS.filter(([slot])=>slot!=='hair').map(([slot,name])=>({slot,name,
    items:[...(first[slot]?[{sku:'first:'+slot,name:'What you came with',slot,design:first[slot]}]:[]),...owned.filter(item=>item.slot===slot)]}))
    .filter(section=>section.items.length);
  if(!shelves.length){
    interaction.openList('Changing room',[{name:'Close'}],()=>{},{available,message:'Nothing to change into yet. What you buy is kept for you here.'});
    return;
  }
  let leaving=0;
  const stay=()=>clearTimeout(leaving);
  const leave=()=>{stay();leaving=setTimeout(()=>{tryOn(null);fitting(null);},0);};
  const directory=(selected=0)=>{
    stay();tryOn(null);fitting(null);
    interaction.openList('Changing room',shelves.map(section=>({name:section.name,note:section.items.length+(section.items.length===1?' piece':' pieces'),section})),
      row=>rack(row.section),{index:selected,available,message:'Your own clothes. What you look at, you try on.'});
  };
  const rack=(section,selected=0,note='')=>{
    stay();fitting(section.slot);
    const look=getLook(),rows=section.items.map(item=>({name:item.name,note:wearing(look,item)?'On':'',item}));
    rows.push({name:'Back to sections',back:true});
    let shown=null,timer=0;
    const show=row=>{
      if(row===shown)return;
      shown=row;clearTimeout(timer);
      timer=setTimeout(()=>{if(shown===row)tryOn(row.item?fittedLook(getLook(),row.item):null);},row.item?140:0);
    };
    interaction.openList(section.name+' · Changing room',rows,row=>{
      clearTimeout(timer);
      if(row.back)return directory(shelves.indexOf(section));
      if(!available())return;
      wear(row.item);tryOn(null);
      rack(section,section.items.indexOf(row.item),'Changed.');
    },{index:selected,available,onFocus:show,onRotate:delta=>fitting(section.slot,delta),onClose:()=>{clearTimeout(timer);leave();},
      message:note||'↑ ↓ to try on · Enter to wear · ← → to turn'});
    show(rows[selected]);
  };
  if(shelves.length===1)rack(shelves[0]);else directory();
}

// `start`, if given, is the number of a piece the customer is standing at: the list opens on its section, on that piece.
export function browseShop({$,sim,interaction,title,menu,available,order,getLook,applyLook,tryOn=()=>{},fitting=()=>{},grow,moves,sale,save,start=null}) {
  const shop=sim.room.place;
  const worn=menu.filter(item=>item.sku && item.design), samples=menu.filter(item=>item.sku && !item.design);
  const others=menu.filter(item=>!(item.sku && item.design));
  const sections=SECTIONS.map(([slot,name])=>({slot,name,items:worn.filter(item=>item.slot===slot)}));
  const known=new Set(SECTIONS.map(([slot])=>slot)), odd=worn.filter(item=>!known.has(item.slot));
  if(odd.length)sections.push({slot:'top',name:'More to wear',items:odd});
  const shelves=sections.filter(section=>section.items.length);
  // Going from one list to the next closes the first: what was being tried on is only put back if nothing takes its place.
  let leaving=0;
  const stay=()=>clearTimeout(leaving);
  const leave=()=>{stay();leaving=setTimeout(()=>{tryOn(null);fitting(null);},0);};
  const price=item=>ownsWearable(sim,item)?'Owned':'$'+item.price.toFixed(2);
  const checkout=back=>{
    const due=sim.shopping.charges(shop),room=sim.room,reg=room?.register;
    if(!due)return [];
    const near=!reg || Math.hypot(room.a-reg.a,room.b-reg.b)<1.65;
    return [{name:'Pay outstanding bill',note:'$'+due.toFixed(2)+(near?'':' · At the register'),disabled:!near,checkout:()=>{
      if(sim.shopping.payCharges(shop))save();
      back();
    }}];
  };
  const directory=(selected=0)=>{
    stay();tryOn(null);fitting(null);
    const rows=shelves.map(section=>({name:section.name,note:section.items.length+(section.items.length===1?' piece':' pieces'),section}));
    if(others.length)rows.push({name:shelves.length?'Everything else':'Browse',note:others.length+(others.length===1?' item':' items'),rest:true});
    rows.push(...checkout(()=>directory(selected)));
    interaction.openList(title,rows,row=>row.checkout?row.checkout():row.rest?catalog():rack(row.section),{cash:sim.cash,index:selected,available,message:'Choose a section. What you look at, you try on.'});
  };
  const rack=(section,selected=0,note='')=>{
    stay();fitting(section.slot);
    const rows=section.items.map(item=>({name:item.name,note:price(item),item}));
    rows.push(...checkout(()=>rack(section,selected)));
    rows.push({name:'Back to sections',back:true});
    let shown=null,timer=0;
    // Resting on a piece puts it on, after a moment: running down the list does not dress and undress for every row passed.
    const show=row=>{
      if(row===shown)return;
      shown=row;clearTimeout(timer);
      timer=setTimeout(()=>{if(shown===row)tryOn(row.item?fittedLook(getLook(),row.item):null);},row.item?140:0);
    };
    interaction.openList(section.name+' · '+title,rows,row=>{
      clearTimeout(timer);
      if(row.checkout)return row.checkout();
      if(row.back)return directory(shelves.indexOf(section));
      const item=row.item,at=section.items.indexOf(item);
      if(!available())return;
      const acquire=unpaid=>{
        const result=purchaseStock(sim,shop,item,{unpaid,sale});
        if(!result)return rack(section,at);
        applyLook(item);tryOn(null);
        save();
        rack(section,at,unpaid?'Payment due at the register.':item.slot==='hair'?'Done.':result.paid?'Bought, and on.':'Back on.');
      };
      if(ownsWearable(sim,item))return acquire(false);
      stay();tryOn(fittedLook(getLook(),item));
      interaction.openList(item.name,[
        {name:item.slot==='hair'?'Pay for the cut':'Buy and wear',note:price(item),disabled:purchaseLimit(sim)<item.price,unpaid:false},
        {name:item.slot==='hair'?'Get the cut and pay later':'Wear it and pay at checkout',note:price(item)+' due',unpaid:true},
        {name:'Back to selection',back:true},
      ],choice=>choice.back?rack(section,at):acquire(choice.unpaid),{cash:sim.cash,available,onRotate:delta=>fitting(section.slot,delta),onClose:leave});
    },{cash:sim.cash,index:selected,available,onFocus:show,onRotate:delta=>fitting(section.slot,delta),onClose:()=>{clearTimeout(timer);leave();},
      message:note||'↑ ↓ to try on · Enter to select · ← → to turn'});
    show(rows[selected]);
  };
  const catalog=(selected=0)=>{
    stay();tryOn(null);fitting(null);
    const rows=others.map(item=>({name:item.name,note:price(item),item}));
    rows.push(...checkout(()=>catalog(selected)));
    if(shelves.length)rows.push({name:'Back to sections',back:true});
    interaction.openList(title,rows,row=>{
      if(row.checkout)return row.checkout();
      if(row.back)return directory(shelves.length);
      if (row.item.sku) inspect(row.item);
      else order(row.item);
    },{cash:sim.cash,index:selected,available});
  };
  const inspect=item=>{
    const matching=fittedLook(getLook(),item), owned=ownsWearable(sim,item);
    const affordable=owned || purchaseLimit(sim)>=item.price;
    const options=[
      {name:owned?'Wear again':matching?(item.slot==='hair'?'Get this cut':'Buy and wear'):'Buy item',note:owned?'Owned':'$'+item.price.toFixed(2),disabled:true,action:'buy'},
      {name:'Next '+(item.slot==='hair'?'style':'item'),action:'next'},
      {name:'Back to selection',action:'back'},
    ];
    if(!owned)options.push({name:'Take item and pay at checkout',note:price(item)+' due',action:'unpaid'});
    const count=sim.purchases?.[item.sku] || 0;
    const message=!affordable?'You need $'+(item.price-purchaseLimit(sim)).toFixed(2)+' more.':count && !matching?'In your collection · '+count:'';
    let open=true;
    const panel=$('shop-preview'), status=$('mirror-status');
    const controls=interaction.openList(item.name,options,row=>{
      if(row.action==='back')return catalog(others.indexOf(item));
      if(row.action==='next')return inspect(samples[(samples.indexOf(item)+1)%samples.length]);
      if(!available())return;
      const result=purchaseStock(sim,shop,item,{unpaid:row.action==='unpaid',sale});
      if(!result)return;
      if(matching)applyLook(item);
      save();
      catalog(others.indexOf(item));
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
  const at=start && shelves.find(section=>section.items.some(item=>item.sku===start));
  if(at)rack(at,at.items.findIndex(item=>item.sku===start));
  else if(shelves.length)directory();else catalog();
}
