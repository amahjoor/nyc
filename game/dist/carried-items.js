// Prop origins are the cup's centre and the tray's underside, in metres.
import * as THREE from './vendor/three.module.min.js';

import { prepTool } from './prep-tools.js';
import { viewHand } from './view-hand.js';
import { gripForItem } from './hand-poses.js';
import { groceries } from './grocery-stock.js';
import { packageGeometry,packageMaterial } from './grocery-models.js';
import { servingMaterial } from './food-surface.js';
import { isServing,servingGeometry } from './serving-models.js';
import { portionBase,portionLevel } from './food-catalog.js';
import { fittingStock } from './shop-stock.js';
import { inspectionMesh } from './room-props.js';

const box=(w,h,d,x,y,z,color)=>[new THREE.BoxGeometry(w,h,d).translate(x,y,z),color];
function model(model,color,configure,more) {
  const sample=inspectionMesh({model,color,more});configure?.(sample.geometry);sample.material.dispose();
  return [[sample.geometry,0xffffff]];
}

const cylinder=(r1,r2,h,x,y,z,colour)=>[new THREE.CylinderGeometry(r1,r2,h,20).translate(x,y,z),colour];
const ring=(r,t,x,y,z,colour)=>[new THREE.TorusGeometry(r,t,8,20).translate(x,y,z),colour];
function pieces(foodOnly){
  const food={
    dishes:[cylinder(.14,.125,.018,0,.009,0,0xe5ddcc)],
    tray:[cylinder(.157,.146,.018,0,.009,0,0x915d40),cylinder(.106,.089,.018,0,.026,0,0xf0e9dc),
      cylinder(.054,.058,.033,0,.049,0,0xcb854b)],
    fork:[box(.007,.124,.004,0,.035,0,0xbac0bf),box(.022,.015,.004,0,.099,0,0xbac0bf),
      ...[-1,0,1].map(i=>box(.003,.022,.003,i*.009,.116,0,0xbac0bf))],
    morsel:[[new THREE.IcosahedronGeometry(.012,0).scale(1.18,.80,.93).translate(0,.119,0),0xffffff]],
    takeout:[box(.161,.149,.108,0,.073,0,0xb99c74),box(.166,.012,.114,0,.148,0,0xe6d0ab)],
  };
  if(foodOnly)return food;
  const handle=(radius,length,x,color)=>[new THREE.CylinderGeometry(radius,radius,length,16).rotateZ(Math.PI/2).translate(x,0,0),color];
  // A shear half pivots at the screw, with a bow behind and a blade ahead.
  const bladeProfile=new THREE.Shape();
  bladeProfile.moveTo(-.0035,-.005);bladeProfile.lineTo(.0065,-.002);
  bladeProfile.quadraticCurveTo(.009,.035,.001,.080);
  bladeProfile.lineTo(-.0035,.015);bladeProfile.closePath();
  const blade=new THREE.ExtrudeGeometry(bladeProfile,{depth:.002,bevelEnabled:false}).rotateX(Math.PI/2);
  const shear=[
    [new THREE.TorusGeometry(.013,.0026,8,24).rotateX(Math.PI/2).translate(.006,0,-.056),0x4e5d65],
    box(.005,.003,.054,.003,0,-.028,0xa2adb4),
    [blade,0xc5cfd2],
    cylinder(.004,.004,.005,0,0,0,0xa48c64),
  ];
  return {...food,
    card:[box(.086,.001,.054,.026,0,-.014,0x23486d),
      box(.014,.0005,.011,.044,.0008,-.019,0xc4aa6e),box(.046,.0005,.002,.026,.0008,-.001,0xb5d5df)],
    cash:[box(.151,.0015,.065,.044,0,-.017,0x94a886),
      box(.132,.0004,.047,.044,.001,-.017,0xcbd1aa),
      cylinder(.013,.013,.0005,.044,.0014,-.017,0x72846d)],
    shearA:shear,shearB:shear.map(([geometry,color])=>[geometry.clone().rotateZ(Math.PI),color]),
    dumbbell:[handle(.013,.16,0,0xbfc4c6),...[-.098,.098].map(x=>handle(.056,.052,x,0x383b40))],
    jewel:model('ringSample','#e6c681',g=>g.translate(0,.012,0)).concat([box(.079,.016,.071,0,.008,0,0x364942)]),
    shoebox:[box(.27,.13,.18,0,.062,0,0x9b6b4b),box(.276,.023,.186,0,.137,0,0xe7ddc9),
      box(.075,.046,.002,.06,.064,.091,0xf4ede2)],
    ...Object.fromEntries(fittingStock('phones').map((item,i)=>[i?item.sku:'phone',
      model('phone',item.color,g=>g.rotateY(Math.PI).translate(0,-.05,0))])),
    ...Object.fromEntries(fittingStock('music').map((item,i)=>[i?item.sku:'guitar',
      model('guitar',item.color,g=>g.translate(0,-.65,0).rotateZ(-.99).translate(0,.02,.07))])),
    jewelBag:[[new THREE.BoxGeometry(.11,.105,.05).translate(0,-.089,0),0x305756],ring(.027,.003,0,-.026,0,0xc7b587)],
  };
}

// The same parts are drawn once on the player or instanced for the crowd.
export function carriedItems(capacity,foodOnly=false) {
  const group = new THREE.Group(), batches = {};
  for (const [kind, parts] of Object.entries(pieces(foodOnly))) {
    batches[kind] = parts.map(([geometry,color])=>{
      const mesh = new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color,vertexColors:!!geometry.attributes.color,roughness:.64}),capacity);
      mesh.count = 0; mesh.name = kind; mesh.castShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh);
      return mesh;
    });
  }
  // Each held product uses exactly the same shape and print as its shelf facing.
  const printed=packageMaterial(),bottle=packageMaterial(false,'grocery-water'),handMatrix=new THREE.Matrix4();
  const crockery=servingMaterial();
  function ensure(key){
    if(batches[key])return true;
    if(key.startsWith('prep')){
      const parts=prepTool(key);
      if(!parts)return false;
      batches[key]=parts.map(([geometry,color])=>{
        const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.46}),capacity);
        mesh.name=key;mesh.count=0;mesh.layers.mask=group.layers.mask;mesh.frustumCulled=false;
        group.add(mesh);return mesh;
      });
      return true;
    }
    const base=portionBase(key),item=groceries[base];
    if(!item && !isServing(base))return false;
    const geometry=item?packageGeometry(base,false,portionLevel(key)):servingGeometry(key);
    const material=item?(item.shape==='bottle'?bottle:printed):crockery;
    const mesh=new THREE.InstancedMesh(geometry,material,capacity);
    mesh.count=0;mesh.name=key;mesh.frustumCulled=false;mesh.layers.mask=group.layers.mask;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batches[key]=[mesh];group.add(mesh);return true;
  }
  const tint=new THREE.Color(),matrix = new THREE.Matrix4(),offset=new THREE.Matrix4().makeTranslation(0,-.055,0);
  return {
    group,ensure,
    begin() { for (const meshes of Object.values(batches)) for (const mesh of meshes) mesh.count = 0; },
    add(kind, point, heading, rotation=null, color=null, size=null) {
      if(!ensure(kind))return;
      if(rotation)matrix.makeRotationFromQuaternion(rotation);
      else matrix.makeRotationY(heading);
      if(size)matrix.scale(size);
      matrix.setPosition(point);
      for (const mesh of batches[kind]||[]) if (mesh.count < capacity) {
        const held=groceries[portionBase(kind)]?handMatrix.copy(matrix).multiply(offset):matrix;
        if(color!==null){mesh.setColorAt(mesh.count,tint.setHex(color));mesh.instanceColor.needsUpdate=true;}
        mesh.setMatrixAt(mesh.count++,held); mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for (const mesh of Object.values(batches).flat()) {mesh.dispose(); if(mesh.material!==printed && mesh.material!==bottle && mesh.material!==crockery){mesh.geometry.dispose();mesh.material.dispose();}} printed.dispose();bottle.dispose();crockery.dispose();group.removeFromParent(); },
  };
}

export function createFoodHand(camera,scene,layer){
  const food=carriedItems(1),group=food.group,hand=viewHand(),origin=new THREE.Vector3();
  const fork=new THREE.Group(),eatingHand=viewHand(),bite=new THREE.Group();
  for(const part of group.children.filter(node=>node.name==='fork'))fork.add(new THREE.Mesh(part.geometry,part.material));
  const portion=group.getObjectByName('morsel');
  const morsel=new THREE.Mesh(portion.geometry,portion.material);
  morsel.visible=false;fork.add(morsel);
  const prongs=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  eatingHand.group.scale.z=-1;
  eatingHand.group.rotation.set(-1.3,.66,.16,'YXZ');
  bite.add(fork,eatingHand.group);bite.visible=false;
  group.add(hand.group,bite);group.traverse(p=>p.layers.set(layer));group.visible=false;
  if(!camera.parent)scene.add(camera);
  camera.add(group);
  let previous;
  return (id,tone,lift=0,eating=false,payment=0)=>{
    group.visible=Boolean(id && food.ensure(id));
    if(!group.visible)return;
    camera.layers.enable(layer);
    const style=gripForItem(id);
    hand.pose(style,style==='pinch'?'index_03_l':'middle_01_l');
    if(previous!==id){
      food.begin();food.add(id,origin,0);previous=id;
      const support=style==='support',thin=style==='pinch';
      // Palm normal (+X) faces the load. Under a plate +X points up,
      // while around a mug the knuckles travel past its far side.
      hand.group.rotation.set(0,-.52,support?Math.PI/2:-.14,'YXZ');
      hand.group.rotateX(support?-1.43:-1.26);
      const bottom=id.startsWith('grocery-')?-.055:0;
      if(support)hand.group.position.set(-.075,bottom-.018,.086);
      else if(thin)hand.group.position.set(-.007,.006,.004);
      else hand.group.position.set(-.040,-.004,-.014);
    }
    bite.visible=Boolean(eating && id.startsWith('plate-'));
    morsel.visible=Boolean(eating?.loaded && (bite.visible || id==='fork'));
    if(morsel.visible){
      const parent=bite.visible?fork:group;
      if(morsel.parent!==parent)parent.add(morsel);
      morsel.material.color.setHex(eating.color);
    }
    if(bite.visible){
      eatingHand.pose('pinch','index_03_l');
      // Touch the serving, lift the fork toward the mouth, then return it
      // to the same spot while the support hand holds the dish level.
      prongs.set(.008+.085*lift,.047+.055*Math.sin(Math.PI*lift)-.025*lift,.006+.34*lift);
      direction.set(-.66+.18*lift,-.48+1.05*lift,-.63+1.23*lift).normalize();
      fork.quaternion.setFromUnitVectors(up,direction);
      bite.position.copy(prongs).addScaledVector(direction,-.126);
      eatingHand.group.position.set(.006,-.004,.001);
      lift=0;
    }
    group.position.set(-.102+.08*lift,-.12+.085*lift,-.42+.20*lift);
    if(id==='cash' || id==='card'){
      group.position.z-=.18*payment;group.position.y+=.06*payment;
    }
    group.rotation.set(.02+(style==='support'?0:.46)*lift,.14,-.045);
  };
}
