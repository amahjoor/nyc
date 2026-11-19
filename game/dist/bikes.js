// Citi Bike: the docking stations, where the system's own feed puts them.
//
// The feed gives each station's position and how many docks it has
// (scripts/build-bikes.mjs). A station is drawn as a row of docks along the
// nearest kerb with a pay kiosk at one end and bikes in about six docks of
// ten. Real stations mostly stand in the parking lane; here they are on the
// sidewalk side of the kerb, because the game parks cars in that lane, and a
// long station is cut to the docks that fit.
import { pedalPoint } from './cycling.js';
import * as THREE from './vendor/three.module.min.js';

const CELL = 256;
/** How far apart docks stand, how far in from the kerb the row is, and the most docks drawn at one station. */
export const DOCKS = { pitch: .78, setback: 1.15, most: 15 };

/** The stations, from bikes.json. */
export function createBikeShare(data = null) {
  const grid = new Map(), stations = (data?.stations || []).map(([x, z, docks, name]) => ({ x, z, docks, name }));
  for (const station of stations) { const key = `${Math.floor(station.x / CELL)},${Math.floor(station.z / CELL)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(station); }
  return {
    count: stations.length,
    /** Stations within `radius` of (x, z), nearest first. */
    near(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        for (const station of grid.get(`${gx},${gz}`) || []) if (Math.hypot(station.x - x, station.z - z) <= radius) found.push(station);
      }
      return found.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    },
  };
}

/**
 * Where each station's row of docks stands: { x, z, tx, tz, nx, nz, docks, bikes, station },
 * centred at (x, z), running along the kerb (tx, tz), with (nx, nz) toward the
 * roadway; `bikes` says which docks hold one. `kerb(x, z)` is as
 * street-props' snapToKerb() gives it, or null.
 */
export function planBikeDocks(stations, kerb) {
  const rows = [];
  for (const station of stations) {
    const edge = kerb(station.x, station.z);
    if (!edge) continue;
    const docks = Math.min(DOCKS.most, station.docks);
    // The same docks are full every time: which, comes from where the station is.
    let state = (Math.imul(station.x | 0, 73856093) ^ Math.imul(station.z | 0, 19349663)) >>> 0 || 1;
    const bikes = Array.from({ length: docks }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 < .6; });
    rows.push({ x: edge.x - edge.nx * DOCKS.setback, z: edge.z - edge.nz * DOCKS.setback, tx: edge.tx, tz: edge.tz, nx: edge.nx, nz: edge.nz, docks, bikes, station });
  }
  return rows;
}

// One bike, its front wheel toward +z: two wheels, a heavy step-through frame, mudguards, saddle, bars and the rack in front.
export function bikeGeometry(personal = false, moving = false) {
  const parts = [], BLUE = personal ? [.49, .105, .055] : [.03, .16, .5], BLACK = [.03, .03, .035], GREY = [.45, .47, .5];
  const add = (geometry, tone) => { const g = geometry.index ? geometry.toNonIndexed() : geometry; parts.push([g, tone]); };
  const box = (w, h, d, x, y, z, tone, tilt = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (tilt) g.rotateX(tilt); g.translate(x, y, z); add(g, tone); };
  for (const z of [-.52, .52]) {
    const tyre = new THREE.TorusGeometry(.31, .035, 6, 16); tyre.rotateY(Math.PI / 2); tyre.translate(0, .345, z); add(tyre, BLACK);
    if (personal) continue;
    const guard = new THREE.TorusGeometry(.36, .02, 4, 10, Math.PI * .9); guard.rotateY(Math.PI / 2); guard.rotateX(z > 0 ? -.2 : .2); guard.translate(0, .345, z); add(guard, BLUE);
  }
  function tube(a,b,r,tone,topRadius=r){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start);
    const g=new THREE.CylinderGeometry(topRadius,r,dir.length(),6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));
    g.translate((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);add(g,tone);
  }
  const crank=[0,.395,-.03],seat=[0,.90,-.25],head=[0,.89,.38];
  tube(crank,head,personal ? .023 : .054,BLUE);
  tube(crank,seat,.029,BLUE);tube(seat,[0,.995,-.28],.02,GREY);
  if(personal)tube(seat,head,.022,BLUE);
  else tube([0,.59,-.12],[0,.75,.34],.031,BLUE);
  tube([0,.72,.43],head,.037,BLUE);tube(head,[0,1.08,.36],.018,GREY);
  for(const side of [-1,1]){
    const back=[side*.06,.345,-.52],front=[side*.055,.345,.52];
    tube(back,[side*.064,.395,-.03],.016,BLUE);tube(back,seat,.017,BLUE);
    tube(front,[side*.035,.75,.43],.022,BLUE,.028);
    tube([side*.17,1.08,.36],[side*.264,1.08,.36],.019,BLACK);
  }
  const chainWheel=new THREE.CylinderGeometry(.086,.086,.016,12);
  chainWheel.rotateZ(Math.PI/2);chainWheel.translate(-.084,.395,-.03);add(chainWheel,GREY);
  tube([-.085,.472,-.03],[-.085,.39,-.52],.007,BLACK);
  tube([-.085,.318,-.03],[-.085,.31,-.52],.007,BLACK);
  box(.2,.06,.28,0,1.0,-.28,BLACK);box(.51,.028,.035,0,1.08,.36,GREY);
  if(!personal){
    const rack=[0,.80,.62];
    tube([0,.82,.405],rack,.016,GREY);
    box(.33,.023,.27,0,.805,.60,GREY);
    for(const side of [-1,1]){
      tube([side*.055,.345,.52],[side*.15,.80,.68],.012,GREY);
      tube([side*.15,.81,.49],[side*.15,.94,.57],.013,GREY);
      tube([side*.15,.94,.57],[side*.15,.94,.71],.013,GREY);
    }
    tube([-.15,.94,.71],[.15,.94,.71],.013,GREY);
    if(!moving)box(.04,.3,.04,0,.2,-.1,GREY,.5);
  }
  if(!moving){
    for (const z of [-.52,.52]) for(let i=0;i<4;i++)box(.013,.59,.012,0,.345,z,GREY,i*Math.PI/4);
    for(const side of [-1,1]){const [x,y,z]=pedalPoint(side,0);box(.1,.032,.085,x,y,z,BLACK);}
  }
  const position = [], normal = [], color = [];
  for (const [g, tone] of parts) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i)); color.push(...tone); } g.dispose(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

// Spokes, crank arms and flat pedal platforms share three draws for all riders.
export function createBikeParts(parent,capacity){
  const group=new THREE.Group();parent?.add(group);
  const steel=new THREE.MeshStandardMaterial({color:0x9dabad,roughness:.49,metalness:.5});
  function batch(w,h,d,paint,multiplier){
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(w,h,d),paint,capacity*multiplier);
    mesh.frustumCulled=false;mesh.count=0;group.add(mesh);return mesh;
  }
  const spokes=batch(.014,.60,.012,steel,8),arms=batch(.025,.15,.026,steel,2);
  const pedals=batch(.10,.030,.09,new THREE.MeshStandardMaterial({color:0x323436}),2);
  const local=new THREE.Object3D(),base=new THREE.Object3D(),matrix=new THREE.Matrix4();
  function place(mesh,x,y,z,roll=0){
    local.position.set(x,y,z);local.rotation.x=roll;local.updateMatrix();
    matrix.multiplyMatrices(base.matrix,local.matrix);mesh.setMatrixAt(mesh.count++,matrix);
  }
  return {
    reset(){for(const mesh of group.children)mesh.count=0;},
    draw(x,y,z,heading,wheel,phase,scale=1,lean=0){
      base.position.set(x,y,z);base.scale.setScalar(scale);base.rotation.set(0,heading,lean,'YXZ');base.updateMatrix();
      for(const axle of [-.52,.52])for(let i=0;i<4;i++)place(spokes,0,.345,axle,wheel+i*Math.PI/4);
      for(const side of [-1,1]){
        const [px,py,pz]=pedalPoint(side,phase);
        place(pedals,px,py,pz);place(arms,px*.77,(py+.395)/2,(pz-.03)/2,phase);
      }
      for(const mesh of group.children)mesh.instanceMatrix.needsUpdate=true;
    }
  };
}

/** Draw the rows of planBikeDocks(). */
export function createBikeDocks({ scene = null, heightAt = () => 0, capacity = 240 } = {}) {
  const group = new THREE.Group(); group.name = 'Citi Bike stations'; scene?.add(group);
  const bike = bikeGeometry(), paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .3 }); paint.name = 'Citi Bike';
  const rental = new THREE.Mesh(bikeGeometry(false,true), paint); rental.name = 'Borrowed Citi Bike';
  rental.visible = false; rental.castShadow = true; scene?.add(rental);
  const parts=createBikeParts(rental,1);
  const available = [];
  const bikes = new THREE.InstancedMesh(bike, paint, capacity); bikes.name = 'Citi Bikes'; bikes.count = 0; bikes.frustumCulled = false; bikes.castShadow = true;
  const box = new THREE.BoxGeometry(1, 1, 1), steel = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6, metalness: .4 }); steel.name = 'Citi Bike docks';
  const posts = new THREE.InstancedMesh(box, steel, capacity * 2 + 64); posts.name = 'Citi Bike docks'; posts.count = 0; posts.frustumCulled = false; posts.castShadow = true;
  group.add(bikes, posts);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  return {
    group, rental, available,
    pedal(wheel,phase){parts.reset();parts.draw(0,0,0,0,wheel,phase);},
    get counts() { return { bikes: bikes.count, parts: posts.count }; },
    /** Returns how many stations were drawn whole. */
    update(rows, borrowedId = null) {
      let b = 0, p = 0, whole = 0;
      available.length = 0;
      for (const row of rows) {
        if (b + row.docks > capacity) break;
        // A bike's front wheel, and its dock, are toward the roadway.
        const facing = Math.atan2(row.nx, row.nz);
        const part = (along, out, y, w, h, d, hex) => {
          const x = row.x + row.tx * along + row.nx * out, z = row.z + row.tz * along + row.nz * out;
          place.set(x, heightAt(x, z) + y, z); turn.setFromAxisAngle(up, facing); size.set(w, h, d); matrix.compose(place, turn, size);
          posts.setMatrixAt(p, matrix); posts.setColorAt(p, colour.setHex(hex)); p++;
        };
        for (let i = 0; i < row.docks; i++) {
          const along = (i - (row.docks - 1) / 2) * DOCKS.pitch;
          part(along, .78, .4, .16, .8, .22, 0x9da3a8); part(along, .78, .83, .2, .06, .26, 0x2a2c30);
          if (!row.bikes[i]) continue;
          const id = `${row.station.x},${row.station.z}/${i}`;
          if (id === borrowedId) continue;
          const x = row.x + row.tx * along, z = row.z + row.tz * along;
          const y = heightAt(x, z);
          available.push({ id, x, y, z, angle: facing });
          place.set(x, y, z); turn.setFromAxisAngle(up, facing); matrix.compose(place, turn, one); bikes.setMatrixAt(b++, matrix);
        }
        // The plate the docks stand on, and the pay kiosk at one end.
        part(0, .55, .03, row.docks * DOCKS.pitch + .3, .06, .7, 0x4a4e52);
        const end = -(row.docks / 2) * DOCKS.pitch - .45;
        part(end, .6, 1.05, .34, 2.1, .2, 0x2a2c30); part(end, .6, 1.5, .36, .7, .22, 0x1c4f9c);
        whole++;
      }
      bikes.count = b; posts.count = p; bikes.instanceMatrix.needsUpdate = posts.instanceMatrix.needsUpdate = true; if (posts.instanceColor) posts.instanceColor.needsUpdate = true;
      return whole;
    },
    dispose() { bike.dispose(); box.dispose(); paint.dispose(); steel.dispose(); bikes.dispose(); posts.dispose(); group.removeFromParent(); rental.removeFromParent(); },
  };
}
