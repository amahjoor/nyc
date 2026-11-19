import * as THREE from './vendor/three.module.min.js';

export function createSkateboard() {
  const board = new THREE.Group();
  board.name = 'Skateboard';
  const shape = new THREE.Shape();
  shape.moveTo(-.107, -.31);
  shape.bezierCurveTo(-.107,-.465,.107,-.465,.107,-.31);
  shape.lineTo(.107,.31);
  shape.bezierCurveTo(.107,.465,-.107,.465,-.107,.31);
  shape.closePath();
  const deck = new THREE.ExtrudeGeometry(shape,{depth:.012, bevelEnabled:false, curveSegments:8});
  deck.rotateX(-Math.PI/2);
  const pos = deck.attributes.position;
  for (let i=0; i<pos.count; i++) {
    const tip = Math.max(0,(Math.abs(pos.getZ(i))-.26)/.16);
    pos.setY(i,pos.getY(i)+.084+.041*tip*tip);
  }
  deck.computeVertexNormals();
  const mat = color => new THREE.MeshStandardMaterial({color,roughness:.85});
  const grip = mat(0x25282a), wood = mat(0xbb8b55), metal = mat(0x8c9b9d), urethane = mat(0xe7d8b0);
  const gripTone=new THREE.Color(0x25282a), underside=new THREE.Color(0xd1874f),colors=[];
  for(let i=0;i<pos.count;i++){
    const tone=deck.attributes.normal.getY(i)<-.5?underside:gripTone;
    colors.push(tone.r,tone.g,tone.b);
  }
  deck.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  grip.color.setHex(0xffffff);grip.vertexColors=true;
  const deckMesh = new THREE.Mesh(deck,[grip,wood]);
  deckMesh.castShadow = true;
  board.add(deckMesh);
  const stamp=new THREE.Mesh(new THREE.PlaneGeometry(.16,.06),mat(0x325a65));
  stamp.rotation.set(Math.PI/2,0,-.30);stamp.position.set(0,.083,-.08);board.add(stamp);
  const bolts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.006,.006,.002,6),metal,8);
  let i=0;
  for(const axle of [-.246,.246])for(const dz of [-.027,.027])for(const x of [-.025,.025])
    bolts.setMatrixAt(i++,new THREE.Matrix4().makeTranslation(x,.097,axle+dz));
  board.add(bolts);
  const axle = new THREE.CylinderGeometry(.012,.012,.18,8).rotateZ(Math.PI/2);
  const wheel = new THREE.CylinderGeometry(.031,.031,.026,12).rotateZ(Math.PI/2);
  const block = new THREE.BoxGeometry(.062,.045,.055);
  for (const z of [-.246,.246]) {
    for (const [geometry,paint,x,y] of [[axle,metal,0,.031],[block,metal,0,.06],[wheel,urethane,-.091,.031],[wheel,urethane,.091,.031]]) {
      const part = new THREE.Mesh(geometry,paint);
      part.position.set(x,y,z); board.add(part);
    }
  }
  // Tricks rotate the deck about its centre while the rider's stance stays upright.
  const deckPivot=new THREE.Group();
  deckPivot.position.y=.096;
  for(const part of [...board.children]){part.position.y-=.096;deckPivot.add(part);}
  deckPivot.rotation.order='YXZ';board.add(deckPivot);
  board.userData.deck=deckPivot;
  board.rotation.order='YXZ';
  board.visible=false;
  return board;
}
