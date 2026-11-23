import * as THREE from './vendor/three.module.min.js';

const CELL = 100;
const key = (x, z) => x + ',' + z;

/** Index the 2022 OTI water tank footprints in the same metre grid as the 3D survey. */
export function indexRoofTanks(buffer) {
  const cells = new Map();
  if (!buffer || buffer.byteLength % 14) return cells;
  const view = new DataView(buffer);
  for (let i = 0; i < buffer.byteLength; i += 14) {
    const x = view.getInt32(i, true) / 100, z = view.getInt32(i + 4, true) / 100;
    const id = key(Math.floor(x / CELL), Math.floor(z / CELL));
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push({x, z, radius:view.getUint16(i + 8, true) / 100,
      base:view.getInt16(i + 10, true) / 10, height:view.getUint16(i + 12, true) / 100});
  }
  return cells;
}

// Highest nearly horizontal triangle under the point on this building. The
// barycentric test leaves courtyards, setbacks and missing roofs empty.
function roofAt(positions, normals, start, end, x, z) {
  let highest = -Infinity;
  for (let i = start; i < end; i += 3) {
    if (Math.abs(normals[i * 4 + 1]) < 125) continue;
    const a = i * 3, ax = positions[a], az = positions[a + 2];
    const bx = positions[a+3]-ax, bz = positions[a+5]-az, cx = positions[a+6]-ax, cz = positions[a+8]-az;
    const area = bx*cz-bz*cx;
    if (Math.abs(area) < .001) continue;
    const u = ((x-ax)*cz-(z-az)*cx)/area, v = (bx*(z-az)-bz*(x-ax))/area;
    if (u < -.00001 || v < -.00001 || u+v > 1.00001) continue;
    highest = Math.max(highest, positions[a+1] + u*(positions[a+4]-positions[a+1]) + v*(positions[a+7]-positions[a+1]));
  }
  return highest;
}

export function matchRoofTanks(index, feature, positions, normals) {
  const {minX, maxX, minZ, maxZ, start, end} = feature;
  const matches = [];
  for (let gx = Math.floor(minX/CELL); gx <= Math.floor(maxX/CELL); gx++) {
    for (let gz = Math.floor(minZ/CELL); gz <= Math.floor(maxZ/CELL); gz++) {
      for (const tank of index.get(key(gx,gz)) || []) {
        const {x,z,radius} = tank;
        if (x-radius < minX || x+radius > maxX || z-radius < minZ || z+radius > maxZ) continue;
        const roof = roofAt(positions,normals,start,end,x,z);
        if (roof < 2) continue;
        // Probe just outside the barrel too. An existing surveyed tank cap or a
        // narrow ledge must not acquire a second tower balanced on top of it.
        let supported = true;
        for (let i = 0; i < 8 && supported; i++) {
          const a = i * Math.PI / 4, reach = radius + .22;
          supported = Math.abs(roofAt(positions,normals,start,end,x+reach*Math.cos(a),z+reach*Math.sin(a))-roof) < .45;
        }
        if (supported) matches.push({...tank, roof});
      }
    }
  }
  return matches;
}

function tankGeometry(stand) {
  const points = [], normals = [], colors = [], timber = [], color = new THREE.Color();
  function add(geometry, tint, wood = false) {
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    const indices = geometry.index?.array;
    for (let i = 0; i < (indices?.length ?? p.count); i++) {
      const j = indices ? indices[i] : i;
      points.push(p.getX(j),p.getY(j),p.getZ(j));
      normals.push(n.getX(j),n.getY(j),n.getZ(j));
      color.set(tint);
      if (wood) {
        // Each stave has two triangles and keeps its shade along the grain.
        const stave = Math.floor(i / 6);
        color.multiplyScalar(.81 + .31 * Math.sin(stave * 8.7) ** 2 + .12 * Math.cos(stave * 3.1));
      }
      colors.push(color.r,color.g,color.b);
      timber.push(wood && Math.abs(n.getY(j)) < .01 ? 1 : 0);
    }
    geometry.dispose();
  }
  function beam(from, to, width, tint) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start), center = start.add(end).multiplyScalar(.5);
    const geometry = new THREE.BoxGeometry(width, direction.length(), width);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    add(geometry.translate(center.x,center.y,center.z),tint);
  }
  const iron = 0x474446;
  if (stand) {
    const corners = [[-.66,-.66],[.66,-.66],[.66,.66],[-.66,.66]];
    for (let i = 0; i < 4; i++) {
      const [x,z] = corners[i], [nx,nz] = corners[(i+1)%4];
      beam([x,0,z],[x,1,z],.09,iron);
      beam([x,.08,z],[nx,.93,nz],.045,iron);
      beam([nx,.08,nz],[x,.93,z],.045,iron);
      beam([x,1,z],[nx,1,nz],.13,iron);
    }
  } else {
    add(new THREE.CylinderGeometry(1,1,.84,48).translate(0,.42,0),0x88705a,true);
    for (const y of [.05,.16,.30,.47,.67,.82])
      add(new THREE.CylinderGeometry(1.012,1.012,.012,32,1,true).translate(0,y,0),iron);
    add(new THREE.ConeGeometry(1.085,.17,24).translate(0,.915,0),0x666963);
    add(new THREE.CylinderGeometry(1.084,1.084,.014,24,1,true).translate(0,.83,0),0x575951);
    // A service ladder rises from the frame to the lip of the conical lid.
    for (const x of [-.125,.125]) beam([x,0,1.065],[x,.89,1.065],.025,iron);
    for (let i = 1; i <= 10; i++) beam([-.125,i*.081,1.065],[.125,i*.081,1.065],.018,iron);
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name,array] of [['position',points],['normal',normals],['color',colors]])
    geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,3));
  geometry.setAttribute('aTimber',new THREE.Uint8BufferAttribute(timber,1));
  return geometry;
}

/** Two shared forms across all loaded tiles. Each batch follows its survey mesh's visibility. */
export function createRoofTankModels() {
  const material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85});
  // Grain follows the upright boards. Fade the fine lines as they fall below a pixel.
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float aTimber; varying float vTimber; varying vec3 vTankLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvTimber = aTimber; vTankLocal = position;');
    shader.fragmentShader = 'varying float vTimber; varying vec3 vTankLocal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vTimber > 0.5) {
        float board = atan(vTankLocal.x, vTankLocal.z) * (48.0 / 6.2831853);
        float width = max(fwidth(board), 0.001);
        float seam = 1.0 - smoothstep(0.018, 0.018 + width, abs(fract(board + 0.5) - 0.5));
        float phase = board * 43.0 + 1.9 * sin(board * 2.0 + vTankLocal.y * 8.0);
        float grain = sin(phase) * (1.0 - smoothstep(0.6, 3.0, fwidth(phase)));
        float damp = (1.0 - smoothstep(0.02, 0.24, vTankLocal.y)) * (0.6 + 0.4 * sin(board * 4.0));
        diffuseColor.rgb *= (1.0 - 0.36 * seam * (1.0 - smoothstep(0.09, 0.5, width)) + 0.085 * grain - 0.2 * damp);
      }`);
  };
  const pose = new THREE.Object3D();
  let vessel, frame;
  return {
    batch(parent, anchors) {
      const sites = [];
      for (const anchor of anchors) {
        if (anchor.tanks) for (const tank of anchor.tanks) sites.push({anchor, tank});
      }
      if (!sites.length) return null;
      vessel ||= tankGeometry(false);
      frame ||= tankGeometry(true);
      const make = (geometry, name) => {
        const mesh = new THREE.InstancedMesh(geometry,material,sites.length);
        mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
        return mesh;
      };
      const barrels = make(vessel,'Surveyed rooftop water tanks'), stands = make(frame,'Water tank frames');
      function update() {
        let count = 0;
        for (const {anchor,tank} of sites) {
          const y = anchor.elevation + tank.roof, gap = tank.base - y;
          // Reject incompatible elevations between the 2022 fixtures and 2014 roofs.
          // A later terrain refinement can bring the two surveys into agreement.
          if (gap < -1.5 || gap > 8) continue;
          const rise = Math.max(.08,gap);
          pose.rotation.y = tank.x*.31 + tank.z*.17;
          pose.position.set(tank.x,y,tank.z); pose.scale.set(tank.radius,rise,tank.radius);
          pose.updateMatrix(); stands.setMatrixAt(count,pose.matrix);
          pose.position.y += rise; pose.scale.y = tank.height;
          pose.updateMatrix(); barrels.setMatrixAt(count++,pose.matrix);
        }
        for (const mesh of [barrels,stands]) {
          mesh.count=count; mesh.instanceMatrix.needsUpdate=true; mesh.computeBoundingSphere();
        }
      }
      update();
      return {update, bytes:sites.length*2*64, dispose() {
        parent.remove(barrels,stands); barrels.dispose(); stands.dispose();
      }};
    },
    dispose() { vessel?.dispose(); frame?.dispose(); material.dispose(); },
  };
}
