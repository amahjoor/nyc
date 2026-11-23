// Original playable exteriors, in metres. +Z is the bow or nose; y=0 is
// the tyre contact, skids, waterline or cabin floor, as appropriate.
import * as THREE from './vendor/three.module.min.js';
import { TRANSPORT, tramPosition, railPosition } from './transport-catalog.js';

const WHITE = 0xf0ede2, NAVY = 0x183c52, BLUE = 0x168eb4, SKY = 0x62c9d5, RED = 0xc84539,
  GOLD = 0xffb82c, BLACK = 0x242d32, RUBBER = 0x202127, STEEL = 0x9cabb0, GLASS = 0x3b6578;
const materials = {
  paint: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .16, roughness: .43 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .48, roughness: .18 }),
  lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
const up = new THREE.Vector3(0,1,0);
const circle = Array.from({length:24}, (_,i) => [Math.cos(i*Math.PI/12), .5+.5*Math.sin(i*Math.PI/12)]);
const hull = [[1,.87],[1,1],[-1,1],[-1,.87],[-.86,.32],[0,0],[.86,.32]];
const cabin = [[1,.16],[.94,.88],[.79,1],[-.79,1],[-.94,.88],[-1,.16],[-.95,0],[.95,0]];
const v = xyz => new THREE.Vector3(...xyz);

// Join static surfaces by finish. Windows and hundreds of rail posts cost the
// same few draw calls as a small craft. Articulated parts have their own pivot.
export class Parts {
  constructor(root = new THREE.Group()) { this.root = root; this.batches = new Map(); }
  add(geometry, color, xyz, rotation = null, scale = null, finish = 'paint') {
    if (rotation) geometry.applyQuaternion(rotation.isQuaternion ? rotation : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)));
    if (scale) geometry.scale(...scale);
    geometry.translate(...xyz);
    if (!this.batches.has(finish)) this.batches.set(finish,{position:[], normal:[], color:[]});
    const batch = this.batches.get(finish), tint = new THREE.Color(color);
    const p = geometry.attributes.position, n = geometry.attributes.normal, index = geometry.index;
    for (let k = 0; k < (index?.count ?? p.count); k++) {
      const i = index ? index.getX(k) : k;
      batch.position.push(p.getX(i),p.getY(i),p.getZ(i)); batch.normal.push(n.getX(i),n.getY(i),n.getZ(i));
      batch.color.push(tint.r,tint.g,tint.b);
    }
    geometry.dispose();
  }
  box(xyz, size, color, rotation = null, finish) { this.add(new THREE.BoxGeometry(...size),color,xyz,rotation,null,finish); }
  oval(xyz, size, color, finish) { this.add(new THREE.SphereGeometry(1,20,12),color,xyz,null,size,finish); }
  rod(a, b, radius, color, top = radius) {
    const axis = v(b).sub(v(a));
    this.add(new THREE.CylinderGeometry(top,radius,axis.length(),8),color,v(a).lerp(v(b),.5).toArray(),new THREE.Quaternion().setFromUnitVectors(up,axis.normalize()));
  }
  // Sections run from stern to bow as [z, half beam, bottom, top].
  loft(rows, profile, color, x = 0, finish) {
    const pos = [], indices = [], n = profile.length;
    for (const [z, width, low, high] of rows) for (const [u,h] of profile) pos.push(x+u*width,low+(high-low)*h,z);
    for (let j = 0; j < rows.length-1; j++) for (let i = 0; i < n; i++) {
      const a = j*n+i, b = j*n+(i+1)%n; indices.push(a,b,a+n,b,b+n,a+n);
    }
    const last = (rows.length-1)*n;
    for (let i=1;i<n-1;i++) indices.push(0,i+1,i,last,last+i,last+i+1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(indices); g.computeVertexNormals();
    this.add(g,color,[0,0,0],null,null,finish);
  }
  // Glazing follows the actual facets of the fuselage, including the narrowing
  // nose. Split at its section and angular boundaries to keep the panes flush.
  wrap(rows, z0, z1, a0, a1, color, finish = 'glass') {
    const step = 2*Math.PI/circle.length, pos = [], triangles = [];
    const zs = [z0,...rows.map(row=>row[0]).filter(z=>z>z0&&z<z1),z1], angles = [a0];
    for(let a=(Math.floor(a0/step)+1)*step;a<a1-.001;a+=step) angles.push(a);
    angles.push(a1);
    for(const z of zs){
      const k=rows.findIndex((r,i)=>i && r[0]>=z), a=rows[k-1], b=rows[k], t=(z-a[0])/(b[0]-a[0]);
      const width=THREE.MathUtils.lerp(a[1],b[1],t)+.019;
      const bottom=THREE.MathUtils.lerp(a[2],b[2],t)-.019, top=THREE.MathUtils.lerp(a[3],b[3],t)+.019;
      for(const angle of angles){
        const n=angle/step, i=Math.floor(n), lo=circle[(i%24+24)%24], hi=circle[((i+1)%24+24)%24];
        pos.push(width*THREE.MathUtils.lerp(lo[0],hi[0],n-i),bottom+(top-bottom)*THREE.MathUtils.lerp(lo[1],hi[1],n-i),z);
      }
    }
    const count=angles.length;
    for(let j=0;j<zs.length-1;j++)for(let i=0;i<count-1;i++){const k=j*count+i;triangles.push(k,k+1,k+count,k+1,k+count+1,k+count);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(triangles);g.computeVertexNormals();
    this.add(g,color,[0,0,0],null,null,finish);
  }
  // An extruded side or plan outline gives wings, fins and stripes a clean silhouette.
  plate(points, depth, color, xyz, horizontal = false) {
    const shape = new THREE.Shape(points.map(([a,b]) => new THREE.Vector2(a,b)));
    const g = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});
    if (horizontal) g.rotateX(Math.PI/2);
    else g.rotateY(-Math.PI/2);
    this.add(g,color,xyz);
  }
  pivot(name, xyz, build) {
    const child = new Parts(); build(child); const part = child.finish();
    part.name = name; part.position.set(...xyz); this.root.add(part);
  }
  lettering(words, xyz, width, height, yaw, background, ink) {
    if (typeof document==='undefined') return;
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=background;ctx.fillRect(0,0,512,96);
    ctx.fillStyle=ink;ctx.font='bold 68px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(words,256,52,486);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map,roughness:.6}));
    sign.position.set(...xyz);sign.rotation.y=yaw;this.root.add(sign);
  }
  finish() {
    for (const [name,attrs] of this.batches) {
      const g = new THREE.BufferGeometry();
      for (const [key,data] of Object.entries(attrs)) g.setAttribute(key,new THREE.Float32BufferAttribute(data,3));
      const mesh = new THREE.Mesh(g,materials[name]); mesh.castShadow = mesh.receiveShadow = true; this.root.add(mesh);
    }
    return this.root;
  }
}

function blades(p, radius, count, axis = 'z') {
  for (let i=0;i<count;i++) {
    const a = i*2*Math.PI/count, c = Math.cos(a), s = Math.sin(a);
    const blade = (reach,width,length,color) => {
      if (axis === 'y') p.box([c*reach,0,-s*reach],[length,.043,width],color,[0,a,0]);
      else p.box([c*reach,s*reach,0],[length,width,.05],color,[0,0,a]);
    };
    blade(radius*.505,radius*.075,radius*.99,BLACK);
    blade(radius*.945,radius*.076,radius*.09,GOLD);
  }
  p.oval([0,0,0],[.14,.14,.15],STEEL);
}
function wheel(p,x,y,z,r,width) {
  const ax = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  p.add(new THREE.TorusGeometry(r*.77,r*.23,8,24),RUBBER,[x,y,z],[0,Math.PI/2,0]);
  p.add(new THREE.CylinderGeometry(r*.6,r*.6,width,16),STEEL,[x,y,z],ax);
  p.rod([x-width*.55,y,z],[x+width*.55,y,z],r*.22,BLACK);
}
function helicopter(p, trim=0xdf6742) {
  const body=[[-2.35,.34,1.06,1.92],[-1.35,.94,.74,2.45],[.55,1.08,.69,2.56],[1.63,.93,.77,2.27],[2.43,.36,1,1.65],[2.53,.06,1.17,1.44]];
  p.loft(body,circle,WHITE);
  for(const [a,b] of [[-.17,1.54],[1.60,Math.PI+.17]])p.wrap(body,.55,2.45,a,b,GLASS);
  for(const [a,b] of [[-.14,.84],[Math.PI-.84,Math.PI+.14]]){
    p.wrap(body,-1.28,-.50,a,b,GLASS);p.wrap(body,-.39,.44,a,b,GLASS);
  }
  p.wrap(body,-2.30,2.45,Math.PI+.37,2*Math.PI-.37,trim,'paint');
  for (const sign of [-1,1]) {
    p.rod([sign*.99,.17,-1.68],[sign*.99,.17,1.47],.085,BLACK);
    p.rod([sign*.99,.17,1.47],[sign*.99,.37,1.79],.08,BLACK);
    for (const z of [-.95,.86]) p.rod([sign*.66,.94,z],[sign*.99,.18,z-.12],.062,STEEL);
  }
  p.loft([[-6.1,.12,1.61,1.92],[-3.65,.23,1.43,1.95],[-1.3,.53,1.16,2.13]],circle,trim);
  p.plate([[-6.23,1.54],[-6.43,2.98],[-6.07,3.0],[-5.53,1.68]],.11,NAVY,[.055,0,0]);
  p.box([0,1.66,-4.68],[2.05,.1,.46],WHITE);
  p.oval([0,2.43,-.67],[.58,.38,1.02],NAVY);
  p.rod([0,2.55,-.07],[0,3.09,-.07],.097,STEEL);
  p.pivot('mainRotor',[0,3.1,-.07],b => blades(b,4.85,3,'y'));
  p.pivot('tailRotor',[.18,2.12,-6.05],b => { for (const a of [0,Math.PI/2]) b.box([0,0,0],[.048,1.46,.10],BLACK,[a,0,0]); });
}

function fixedWing(p,type) {
  const jet = type === 'jet', floats = type === 'seaplane';
  const L = jet ? 29 : floats ? 9.7 : 16, R = jet ? 1.58 : floats ? .71 : 1.04;
  const span = jet ? 27 : floats ? 13 : 18, y = jet ? 3.55 : floats ? 1.92 : 2.15;
  const trim = jet ? BLUE : floats ? RED : NAVY;
  const sections = [[-.52,.06,.23],[-.405,.57,.12],[-.25,.98,0],[.24,1,0],[.355,.89,-.05],[.43,.62,-.19],[.486,.08,-.38]];
  const body=sections.map(([z,w,dy])=>[z*L,w*R,y+(dy-w)*R,y+(dy+w)*R]);
  p.loft(body,circle,WHITE);
  for(const [a,b] of [[.08,1.52],[1.62,Math.PI-.08]])p.wrap(body,L*.33,L*.414,a,b,GLASS);
  for (const side of [-1,1]) {
    const n = jet ? 19 : floats ? 3 : 8;
    for (let i=0;i<n;i++) {
      const z = L*(.222-i*(.451/(n-1)));
      p.oval([side*R*.985,y+.12*R,z],[.038*R,(jet ? .16 : .26)*R,(jet ? .13 : .24)*R],GLASS,'glass');
    }
    p.box([side*R*.979,y-.18*R,-L*.006],[.032*R,.13*R,L*.47],trim);
    const h = y+(jet ? -.48 : .78)*R, tip = side*span*.5;
    const wing = [[side*.7*R,L*.15],[tip,(jet ? -.12 : .006)*L],[tip,-L*.18],[side*.68*R,-L*.105]];
    p.plate(wing,R*.17,WHITE,[0,h,0],true);
    if (jet) p.plate([[tip*.96,-L*.175],[tip*1.015,-L*.18],[tip*1.015,-L*.126],[tip*.96,-L*.124]],.85,trim,[0,h+.79,0],true);
    p.plate([[side*.15,-L*.338],[side*span*.21,-L*.426],[side*span*.21,-L*.474],[side*.15,-L*.437]],R*.1,WHITE,[0,y+R*.2,0],true);
    if (!floats) {
      const x = side*span*(jet ? .19 : .20), ey = h-R*(jet ? .87 : .58);
      p.rod([x,h,-.18],[x,ey,.15],R*.21,STEEL);
      p.loft([[-L*.1,R*.19,ey-R*.26,ey+R*.26],[0,R*.51,ey-R*.52,ey+R*.52],[L*.103,R*.48,ey-R*.47,ey+R*.47]],circle,trim,x);
      p.oval([x,ey,L*.104],[R*.39,R*.39,.07],BLACK);
      p.oval([x,ey,L*.108],[R*.15,R*.15,.1],STEEL);
      if (!jet) p.pivot('prop'+side,[x,ey,L*.11],b=>blades(b,R*1.40,4));
    }
    if (floats) {
      const x=side*1.14;
      p.loft([[-2.6,.10,.04,.32],[-1.5,.34,-.20,.42],[1.55,.37,-.20,.44],[2.64,.15,.03,.48],[2.85,.03,.34,.45]],hull,WHITE,x);
      for (const z of [-1.1,1.1]) p.rod([side*.48,1.45,z],[x,.38,z-.2],.07,STEEL);
      p.rod([side*.58,1.44,-.45],[side*3.8,h,.18],.064,WHITE);
    } else {
      const x = side*R*1.18, z = -L*.084, r = R*.34;
      p.rod([side*R*.8,y-.5*R,z],[x,r,z],r*.22,STEEL);
      wheel(p,x,r,z,r,R*.16);
    }
    p.oval([tip,h+.015,-L*.15],[.095,.075,.13],side>0?0xff4540:0x55e6a5,'lamp');
  }
  p.plate([[-L*.462,0],[-L*.48,L*.168],[-L*.436,L*.169],[-L*.299,R*.14]],R*.14,trim,[R*.07,y,0]);
  p.plate([[-L*.468,L*.126],[-L*.476,L*.159],[-L*.435,L*.16],[-L*.405,L*.126]],R*.15,floats ? GOLD : SKY,[R*.075,y,0]);
  if (floats) p.pivot('propNose',[0,y-.19*R,L*.48],b => blades(b,R*1.86,3));
  else {
    const r=R*.27,z=L*.31;
    p.rod([0,y-.6*R,z],[0,r,z],r*.25,STEEL);wheel(p,0,r,z,r,R*.15);
  }
}

function railing(p, x, y, start, end, color, step = 1.3) {
  p.rod([x,y+.83,start],[x,y+.83,end],.046,color);
  p.rod([x,y+.42,start],[x,y+.42,end],.03,color);
  const n=Math.ceil((end-start)/step);
  for(let i=0;i<=n;i++) { const z=start+(end-start)*i/n; p.rod([x,y,z],[x,y+.84,z],.04,color); }
}
function lifering(p,x,y,z) {
  p.add(new THREE.TorusGeometry(.25,.068,8,24),0xf26a36,[x,y,z],[0,Math.PI/2,0]);
  for (const side of [-1,1]) p.box([x,y+side*.25,z],[.11,.087,.12],WHITE);
}
function poweredBoat(p, ferry) {
  const L = ferry ? 26 : 10, W = ferry ? 8 : 3.55, deck = ferry ? 1.18 : .76;
  const paint = ferry ? WHITE : GOLD;
  for (const x of ferry ? [-2.33,2.33] : [0]) {
    const w = ferry ? 1.06 : W*.5;
    p.loft([[-L*.49,w*.83,-.64,deck],[-L*.38,w,-.96,deck],[L*.21,w,-.92,deck],[L*.39,w*.75,-.54,deck+.12],[L*.51,w*.045,.03,deck+.32]],hull,ferry ? NAVY : BLACK,x);
    p.loft([[-L*.488,w*.84,deck-.28,deck],[-L*.38,w*1.01,deck-.28,deck],[L*.21,w*1.01,deck-.28,deck],[L*.39,w*.76,deck-.1,deck+.12],[L*.51,w*.052,deck+.10,deck+.32]],hull,ferry ? SKY : GOLD,x);
  }
  if (ferry) p.box([0,deck-.14,-.5],[W,.38,L*.92],WHITE);
  const half=W*.423, start=-L*.335, end=L*.31, h=ferry?2.32:1.48;
  p.loft([[start,half,deck,deck+h],[end-.5,half,deck,deck+h],[end+.65,half*.86,deck,deck+h*.73]],cabin,paint);
  for(const side of [-1,1]){
    const count=ferry?10:5;
    for(let i=0;i<count;i++){
      const z=start+(i+.5)*(end-start)/count;
      p.box([side*half*.978,deck+h*.62,z],[.075,h*.52,(end-start)/count*.86],GLASS,[0,0,side*.066],'glass');
    }
    p.box([side*half*.996,deck+.23,(end+start)/2],[.05,.16,end-start],ferry ? BLUE : BLACK);
    railing(p,side*(W*.49),deck+.03,-L*.45,start-.08,STEEL);
    lifering(p,side*(half+.09),deck+h*.5,start+.44);
  }
  for (const side of [-1,1]) p.box([side*half*.39,deck+h*.47,end+.663],[half*.71,h*.34,.025],GLASS,null,'glass');
  p.box([0,deck+h+.04,(end+start)/2],[W*.92,.15,end-start+.24],WHITE);
  if (ferry) {
    const top=deck+h+.13;
    for (const side of [-1,1]) {
      railing(p,side*half,top,start+.3,2,NAVY);
      for (let i=0;i<5;i++) {
        p.box([side*1.68,top+.4,start+i*1.48+.65],[1.65,.11,.47],BLUE);
        p.box([side*1.68,top+.61,start+i*1.48+.43],[1.65,.44,.08],NAVY);
      }
    }
    p.loft([[1.9,2.45,top,top+1.52],[5.35,2.32,top,top+1.60],[6.05,1.98,top,top+1.22]],cabin,WHITE);
    for (const side of [-1,1]) p.box([side*.92,top+.78,6.067],[1.63,.65,.03],GLASS,null,'glass');
    for(const side of [-1,1]) p.box([side*2.3,top+1,3.8],[.1,.62,2.7],GLASS,[0,side*.035,side*.07],'glass');
    p.box([0,top+1.64,3.75],[5,.14,3.84],NAVY);
    p.rod([0,top+1.72,3.1],[0,top+3.0,3.1],.09,STEEL);p.box([0,top+2.8,3.1],[1.3,.11,.13],WHITE);
    for(const side of [-1,1])p.lettering('HARBOR LINE',[side*(W*.5+.01),deck-.1,-3],3.2,.28,side*Math.PI/2,'#f0ede2','#22526b');
  } else {
    for (const side of [-1,1]) for(let i=0;i<7;i++) p.box([side*(half+.035),deck+.35,start+.48+i*.72],[.06,.16,.34],BLACK);
    p.box([0,deck+h+.18,.32],[1.24,.19,.58],BLACK);
    p.lettering('WATER TAXI',[0,deck+h+.185,.615],1.19,.17,0,'#202a32','#ffc037');
    p.rod([0,deck+h+.14,-1.3],[0,deck+h+1.03,-1.3],.043,STEEL);
    p.box([0,.24,-4.98],[.64,1.08,.5],BLACK);
  }
}

function motorYacht(p) {
  const teak=0xb28a62;
  // A flared bow, stepped bathing platform and two set-back decks leave an open aft lounge.
  p.loft([[-19.5,2.7,-.1,.55],[-17,3.65,-1.25,1.7],[-11,4.2,-1.7,2.35],[6.5,4.15,-1.7,2.5],[13,3.4,-1.25,2.8],[19.5,.09,.2,3.35]],hull,NAVY);
  p.loft([[-17.2,3.65,1.7,1.95],[-11,4.2,2.32,2.56],[6.5,4.15,2.47,2.71],[13,3.4,2.77,3.01],[19.5,.09,3.32,3.56]],hull,WHITE);
  p.box([0,2.35,-11.2],[6.9,.26,8.6],teak);
  for(let i=0;i<5;i++) {
    const y=.65+i*.34,z=-18.7+i*.72;
    p.box([0,y,z],[5.3+i*.16,.25,.9],WHITE);
    p.box([0,y+.14,z],[5.2+i*.16,.06,.85],teak);
  }
  for(const side of [-1,1]) {
    for(let i=0;i<6;i++)p.oval([side*4.07,1.65,-7.5+i*2.35],[.13,.22,.52],GLASS,'glass');
    p.rod([side*2.73,1.56,-18.8],[side*3.05,3.1,-15.1],.055,STEEL);
  }
  for(const [z,y,w,l] of [[.2,2.5,6.65,18.5],[1.6,5.06,5.65,13.4]]){
    p.loft([[z-l*.51,w*.41,y,y+1.66],[z-l*.43,w*.48,y,y+2],[z+l*.29,w*.49,y,y+2],[z+l*.48,w*.44,y,y+1.26],[z+l*.53,w*.34,y,y+.53]],cabin,WHITE);
    p.loft([[z-l*.49,w*.43,y+.77,y+1.55],[z-l*.42,w*.487,y+.78,y+1.76],[z+l*.30,w*.49,y+.79,y+1.77],[z+l*.49,w*.425,y+.64,y+1.12]],cabin,GLASS,0,'glass');
    for(const s of [-1,1]) {
      for(let i=0;i<5;i++)p.rod([s*w*.49,y+.75,z-l*.34+i*l*.14],[s*w*.46,y+1.81,z-l*.37+i*l*.14],.047,STEEL);
      railing(p,s*(w*.5+.35),y,z-l*.55,z+l*.52,STEEL,2);
    }
    p.loft([[z-l*.59,w*.41,y+1.89,y+2.07],[z-l*.50,w*.54,y+1.90,y+2.22],[z+l*.27,w*.54,y+1.91,y+2.22],[z+l*.38,w*.44,y+1.84,y+2.08]],cabin,WHITE);
  }
  for(const s of [-1,1]){
    railing(p,s*3.36,2.48,-14.8,-8.9,STEEL);
    p.box([s*2.8,2.8,-12.6],[.8,.55,3.1],WHITE);
    p.box([s*2.8,3.13,-12.6],[.8,.16,3.15],0xc0bdab);
    p.oval([s*1.34,8.11,1.25],[.55,.54,.55],WHITE);
  }
  p.rod([0,7.25,1],[0,9.25,.4],.09,STEEL);
  p.box([0,8.7,.55],[2.12,.16,.22],WHITE);
  p.oval([0,2.97,-12],[.78,.1,.55],teak);
}

function kayak(p) {
  p.loft([[-2.12,.018,.05,.17],[-1.58,.22,-.09,.19],[-.58,.34,-.16,.25],[.58,.34,-.16,.25],[1.56,.19,-.04,.21],[2.12,.018,.12,.21]],hull,0xeb6a2b);
  p.oval([0,.245,-.13],[.28,.047,.6],BLACK);p.oval([0,.28,-.26],[.21,.062,.28],0x716152);
  for (const z of [-1.24,1.12]) {
    p.oval([0,.22,z],[.14,.037,.24],BLACK);
    for(const side of [-1,1]) p.rod([side*.20,.24,z-.24],[-side*.19,.244,z+.23],.015,STEEL);
  }
  p.pivot('paddle',[0,.65,-.02],b=>{
    b.rod([-1.05,0,0],[1.05,0,0],.021,BLACK);
    for(const s of [-1,1]) b.oval([s*.94,0,0],[.29,.035,.103],GOLD);
  });
}
function twoWheeler(p, moto, paint=0x1b8282) {
  const r=moto ? .327 : .116, front=moto ? .72 : .47, rear=moto ? -.73 : -.43;
  wheel(p,0,r,front,r,moto ? .16 : .06);wheel(p,0,r,rear,r,moto ? .16 : .06);
  if(moto){
    p.rod([0,.39,rear],[0,.59,.06],.073,STEEL);
    p.oval([0,.52,-.08],[.244,.255,.295],BLACK);
    for(let i=0;i<5;i++)p.box([0,.47+i*.041,.005],[.46,.019,.32],STEEL);
    p.loft([[-.34,.15,.67,.81],[-.12,.24,.62,.96],[.20,.23,.65,1.01],[.4,.13,.73,.87]],circle,paint);
    p.oval([0,.793,-.47],[.196,.087,.31],BLACK);
    p.box([0,.7,-.70],[.27,.13,.32],paint,[-.17,0,0]);
    p.rod([-.21,.36,-.8],[-.21,.35,-.16],.075,STEEL);
    for(const s of [-1,1]) {
      p.rod([s*.1,r,front],[s*.1,1.04,.43],.033,STEEL);
      p.rod([s*.09,1.04,.43],[s*.34,1.06,.33],.026,BLACK);
      p.rod([s*.29,1.07,.37],[s*.36,1.25,.46],.013,STEEL);
      p.oval([s*.36,1.25,.46],[.069,.045,.026],BLACK);
    }
    p.oval([0,.965,.57],[.133,.123,.11],STEEL);p.oval([0,.965,.651],[.108,.096,.045],0xffe8af,'lamp');
    p.box([0,.752,-.865],[.16,.064,.055],RED);
  }else{
    p.box([0,.164,-.02],[.18,.072,.73],0x4abfa6);p.box([0,.205,-.04],[.143,.018,.55],BLACK);
    p.rod([0,.107,-.44],[0,.15,-.31],.027,BLACK);
    p.rod([0,.12,.47],[0,1.13,.29],.035,0x4abfa6);
    p.rod([-.237,1.14,.29],[.237,1.14,.29],.025,BLACK);
    p.box([0,1.1,.319],[.062,.065,.045],WHITE,null,'lamp');
  }
}
function tram(p) {
  p.loft([[-3.02,1.1,.23,2.36],[-2.60,1.43,.06,2.65],[2.6,1.43,.06,2.65],[3.02,1.1,.23,2.36]],cabin,RED);
  for (const side of [-1,1]) {
    for(let i=0;i<6;i++)p.box([side*1.404,1.58,-2.22+i*.89],[.07,1.20,.78],GLASS,[0,0,side*.045],'glass');
    p.box([side*1.43,.65,0],[.06,.075,5.30],WHITE);
    p.box([0,1.58,side*2.985],[1.91,1.19,.095],GLASS,null,'glass');
    p.lettering('ROOSEVELT ISLAND',[0,.65,side*3.03],1.74,.21,side===1?0:Math.PI,'#c84539','#fff2d7');
  }
  p.box([0,2.63,0],[2.74,.17,5.25],WHITE);
  p.rod([.94,2.68,-1.5],[.94,4.55,0],.1,STEEL);p.rod([.94,2.68,1.5],[.94,4.55,0],.1,STEEL);
  p.rod([.94,4.55,0],[0,5.24,0],.12,STEEL);p.box([0,5.2,0],[.3,.23,1.5],BLACK);
}

function busModel(p) {
  const body=[[-5.98,1.17,.43,2.97],[-5.64,1.27,.41,3.11],[5.34,1.27,.41,3.11],[5.97,1.16,.47,2.96]];
  p.loft(body,cabin,WHITE);p.box([0,.56,-.02],[2.49,.31,11.4],NAVY);
  for(const side of [-1,1]){
    p.box([side*1.265,1.22,-.15],[.04,.26,11.28],BLUE);
    p.box([side*1.269,1.40,-.15],[.04,.06,11.25],GOLD);
    for(let i=0;i<8;i++){
      const z=-4.8+i*1.35,door=side===-1 && (i===7||i===3);
      p.box([side*1.253,door?1.64:2.13,z],[.06,door?2.14:1.17,1.23],door?BLACK:GLASS,null,door?'paint':'glass');
      if(door)for(const s of [-1,1])p.box([side*1.287,1.93,z+s*.29],[.035,1.43,.49],GLASS,null,'glass');
    }
    p.rod([side*1.14,2.55,5.35],[side*1.5,2.55,5.88],.034,STEEL);p.box([side*1.5,2.39,5.88],[.12,.32,.19],BLACK);
    for(const z of [-3.57,3.38])wheel(p,side*1.18,.52,z,.52,.22);
    p.box([side*.82,1.05,5.96],[.41,.12,.05],WHITE,null,'lamp');
    p.box([side*.96,1.07,-5.987],[.19,.36,.06],RED);
  }
  p.box([0,1.99,5.985],[2.15,1.13,.04],GLASS,null,'glass');
  p.rod([0,1.44,6.012],[0,2.55,6.012],.021,BLACK);
  p.box([0,2.75,5.982],[2.04,.36,.05],BLACK);
  p.lettering('Bx1   GRAND CONCOURSE',[0,2.75,6.014],2.01,.33,0,'#172323','#ffc451');
  p.box([0,3.25,-1.8],[1.64,.32,5.45],WHITE);
  for(let i=0;i<6;i++)p.box([0,3.416,-3.7+i*.63],[1.18,.025,.23],STEEL);
  p.box([0,2.12,-6.0],[1.92,1.04,.04],GLASS,null,'glass');
}

function trainModel(p) {
  const silver=0xb9c2c4;
  p.loft([[-11,1.38,1.09,3.9],[-10.55,1.59,1.05,4.12],[10.22,1.59,1.05,4.12],[11,1.38,1.09,3.91]],cabin,silver);
  p.box([0,.95,0],[2.74,.32,21.6],BLACK);
  for(const side of [-1,1]){
    for(let i=0;i<12;i++){
      const z=-9.46+i*1.72,door=i===2||i===9;
      p.box([side*1.57,door?2.26:2.82,z],[.08,door?2.12:.96,1.49],door?NAVY:GLASS,null,door?'paint':'glass');
      if(door)for(const half of [-1,1])p.box([side*1.616,2.78,z+half*.36],[.024,.80,.61],GLASS,null,'glass');
    }
    for(let i=0;i<5;i++)p.box([side*1.585,1.41+i*.092,0],[.064,.037,20.7],STEEL);
    for(const z of [-8.25,-6.35,6.35,8.25])wheel(p,side*.80,.46,z,.46,.17);
    for(const z of [-7.30,7.30])p.box([side*.99,.62,z],[.20,.27,2.56],BLACK);
    const z=side*11.014, yaw=side===1?0:Math.PI;
    p.box([0,2.65,z],[2.54,1.85,.045],NAVY);p.box([0,1.39,z],[2.33,.42,.06],GOLD);
    for(const s of [-1,1]){
      p.box([s*.64,2.88,z+side*.05],[.93,.85,.055],GLASS,null,'glass');
      p.oval([s*.94,1.53,z+side*.09],[.084,.082,.035],WHITE,'lamp');
    }
    p.lettering('PORT WASHINGTON',[0,3.46,z+side*.04],1.53,.23,yaw,'#18212a','#ffbd53');
  }
  for(const z of [-7.9,7.9])p.box([0,4.17,z],[1.82,.19,3.1],STEEL);
  for(const z of [-3.3,0,3.4])p.box([0,.65,z],[1.70,.57,2.50],BLACK);
}

const templates = new Map();
export function createTransportModel(type, {paint}={}) {
  const key=paint===undefined?type:type+'-'+paint;
  if (!templates.has(key)) {
    const p = new Parts(), spec = TRANSPORT[type];
    switch (spec.kind) {
      case 'rotor': helicopter(p,paint); break;
      case 'plane': fixedWing(p,type); break;
      case 'boat': if (type==='kayak') kayak(p); else if(type==='yacht') motorYacht(p); else poweredBoat(p,type==='ferry'); break;
      case 'street': if(type==='bus')busModel(p);else twoWheeler(p,type==='motorcycle',paint); break;
      case 'cable': tram(p); break;
      case 'rail': trainModel(p); break;
    }
    const model = p.finish(); model.name = spec.name; templates.set(key,model);
  }
  return templates.get(key).clone();
}

function railway(heightAt) {
  const p=new Parts();
  for(const track of [-1,1]){
    const segments=56;
    for(let i=0;i<segments;i++){
      const a=railPosition(i/segments,track,heightAt), b=railPosition((i+1)/segments,track,heightAt);
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz), center=v([a.x,a.y,a.z]).lerp(v([b.x,b.y,b.z]),.5);
      const tilt=[-Math.atan2(b.y-a.y,len),a.angle,0,'YXZ'];
      for(const side of [-1,1]){
        p.box([center.x+side*.72*dz/len,center.y-.06,center.z-side*.72*dx/len],[.08,.12,len+.02],STEEL,tilt);
      }
      p.box([center.x,center.y-.23,center.z],[3.55,.20,len+.03],0x615d55,tilt);
    }
  }
  const mesh=p.finish();mesh.name='Port Washington Branch tracks';return mesh;
}

export function createTransportScene(scene, fleet, createGuest) {
  const group = new THREE.Group(); group.name = 'City transport'; scene.add(group);
  const models = new Map();
  let cables, rails;
  return {
    update(player, time, shown, firstPerson) {
      group.visible = shown;
      if (!shown) return;
      let nearTram = false, nearRail = false;
      for(const ride of fleet.rides) {
        const id=ride.home.id, active=fleet.active===ride;
        const near=Math.hypot(ride.x-player.x,ride.z-player.z)<1100;
        let mesh=models.get(id);
        if(!near && !active) { if(mesh) mesh.visible=false; continue; }
        if(ride.spec.kind==='cable') nearTram=true;
        if(ride.spec.kind==='rail') nearRail=true;
        if(!mesh) { mesh=createTransportModel(ride.home.type); models.set(id,mesh); group.add(mesh); }
        if(ride.home.type==='yacht' && createGuest){
          if(!mesh.userData.guests){
            mesh.userData.guests=[[1.6,-12.4,0xd87658],[-1.55,-12.1,0x568581],[.6,-14.2,0xd4caaa],[-.8,-14.5,0x697fa4]].map(([x,z,color])=>{
              const guest=createGuest(color);guest.position.set(x,2.49,z);
              guest.rotation.y=Math.atan2(-x,-13-z);mesh.add(guest);return guest;
            });
          }
          mesh.userData.guests.forEach((guest,i)=>{
            const beat=time*2.1+i*1.9;
            guest.rotation.z=.045*Math.sin(beat);guest.userData.arms[i%2].rotation.x=-.65+.38*Math.sin(beat*.6);
          });
        }
        mesh.visible=!(active && firstPerson);
        const boat=ride.spec.kind==='boat';
        const bob=boat ? .037*Math.sin(time*1.6+ride.home.berth.x) : 0;
        mesh.position.set(ride.x,fleet.altitude(ride)+bob,ride.z);
        mesh.rotation.set(ride.pitch || 0,ride.angle,(ride.roll || 0)+bob*.15,'YXZ');
        if(ride.spec.kind==='rotor'){
          mesh.getObjectByName('mainRotor').rotation.y=active ? time*36 : .26;
          mesh.getObjectByName('tailRotor').rotation.x=active ? time*47 : .5;
        }
        if(ride.spec.kind==='plane' && ride.home.type!=='jet'){
          for(const name of ['prop1','prop-1','propNose']){
            const prop=mesh.getObjectByName(name); if(prop)prop.rotation.z=active ? time*(24+Math.abs(ride.speed)*.14) : .45;
          }
        }
        if(ride.home.type==='kayak') {
          const paddle=mesh.getObjectByName('paddle'), stroke=active ? Math.min(1,Math.abs(ride.speed)) : 0;
          paddle.position.y=active ? .72 : .33;
          paddle.rotation.set(0,.21+stroke*.48*Math.cos(time*3),.08+stroke*.43*Math.sin(time*3));
        }
      }
      if(nearTram && !cables) {
        cables=new THREE.Group(); const material=new THREE.LineBasicMaterial({color:0x303638});
        for(const track of [-1,1]){
          const points=[];
          for(let i=0;i<=100;i++){const at=tramPosition(i/100,track);points.push(new THREE.Vector3(at.x,at.y+5.24,at.z));}
          cables.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material));
        }
        // Portal towers carry the ropes above the East River crossing.
        const towers=new Parts();
        for(const t of [.22,.48,.79]){
          const top=tramPosition(t,0), y=fleet.sim.groundHeight(top.x,top.z);
          const side=new THREE.Vector3(Math.cos(top.angle),0,-Math.sin(top.angle));
          const at=(offset,h)=>[top.x+side.x*offset,h,top.z+side.z*offset];
          for(const s of [-1,1])towers.rod(at(s*4.8,y),at(s*2.2,top.y+5.2),.52,STEEL,.34);
          towers.rod(at(-4.4,top.y+5.2),at(4.4,top.y+5.2),.37,STEEL);
        }
        cables.add(towers.finish()); group.add(cables);
      }
      if(cables)cables.visible=nearTram;
      if(nearRail && !rails){rails=railway(fleet.heightAt);group.add(rails);}
      if(rails)rails.visible=nearRail;
    },
  };
}
