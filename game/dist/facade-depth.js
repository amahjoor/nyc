import * as THREE from './vendor/three.module.min.js';
import { FLAG, HEIGHT_UNIT, MATERIAL, STYLES } from './facade.js';

// Each entry identifies two survey triangles that form one vertical rectangle.
// Keep only the information that would otherwise be released after GPU upload.
const STRIDE = 5;
export function collectFacadeWalls(positions, facade, style, start, end) {
  const walls = [];
  for (let i = start; i + 5 < end; i += 3) {
    const a = i * 4, length = facade[a + 2], top = facade[a + 3], type = style[a + 1], flags = style[a + 3];
    if (!length || length === 65535 || top === 65535 || top < 560 || (flags & (FLAG.BLANK | FLAG.SCREENS)) || STYLES[type]?.material === MATERIAL.GLASS) continue;
    let left = i, right = i, low = Infinity;
    for (let j = i; j < i + 6; j++) {
      if (facade[j*4] < facade[left*4]) left = j;
      if (facade[j*4] > facade[right*4]) right = j;
      low = Math.min(low, facade[j*4+1]);
    }
    const from = facade[left*4], to = facade[right*4];
    if (to - from < 130 || top - low < 300 || to - from > 10000) continue;
    let first = 0, second = 0;
    for (let j = i; j < i + 6; j++) {
      const o = j*4, u = facade[o], v = facade[o+1], edge = u === from ? left : right;
      if ((u !== from && u !== to) || (v !== low && v !== top) || facade[o+2] !== length || facade[o+3] !== top ||
          style[o+3] !== flags || positions[j*3] !== positions[edge*3] || positions[j*3+2] !== positions[edge*3+2]) break;
      const corner = 1 << (Number(u === to) + 2 * Number(v === top));
      if (j < i+3) first |= corner; else second |= corner;
    }
    // Complementary triangles must share the diagonal, not a side.
    if ((first | second) !== 15 || ![6,9].includes(first & second) ||
        ![7,11,13,14].includes(first) || ![7,11,13,14].includes(second)) continue;
    walls.push(i, left-i + (right-i)*8, from + to*65536, length, style[a] + type*256 + style[a+2]*65536 + flags*16777216);
    i += 3;
  }
  return walls.length ? Uint32Array.from(walls) : null;
}

function describe(p, anchor, at) {
  const w = anchor.fronts, first = w[at], ends = w[at+1], packed = w[at+4];
  const a = (first + (ends & 7))*3, b = (first + (ends >> 3))*3;
  const dx = p[b]-p[a], dz = p[b+2]-p[a+2], length = Math.hypot(dx,dz);
  let bottom = Infinity, top = -Infinity;
  for (let i = first; i < first+6; i++) {
    const y = p[i*3+1] - anchor.elevation;
    bottom = Math.min(bottom,y); top = Math.max(top,y);
  }
  return {first, x:p[a], z:p[a+2], tx:dx/length, tz:dz/length, length, bottom, top,
    from:(w[at+2] & 65535)/100, to:(w[at+2] >>> 16)/100, wallLength:w[at+3]/100,
    seed:packed & 255, type:(packed >>> 8) & 255, height:(packed >>> 16) & 255, flags:packed >>> 24};
}

// Cut the existing bay pattern out of the wall, then close each opening with
// glazing at its actual setback. The front and the glass share the city's material.
export function buildFacadeDepth(wall, facadeMaterial, depthMaterial, cube, fittingsMaterial) {
  const {from,to,bottom,top,wallLength,tx,tz,seed,type,height,flags} = wall, style = STYLES[type];
  const bays = Math.max(1,Math.round(wallLength/style.bay)), bay = wallLength/bays, storey = style.floor;
  const ground = height * HEIGHT_UNIT < style.ground*1.7 ? 0 : style.ground;
  const [widthFraction,heightFraction,sillFraction,recess] = style.window;
  const windows = [];
  for (let k = Math.max(0,Math.floor(from/bay)); k < Math.ceil(to/bay); k++) {
    const l = (k + (1-widthFraction)/2)*bay, r = l + widthFraction*bay;
    if (l >= from+.09 && r <= to-.09) windows.push([l,r]);
  }
  const floors = [];
  for (let f = Math.max(ground ? 0 : 1,Math.floor((bottom-ground)/storey)); ; f++) {
    const base = ground + f*storey, sill = base + sillFraction*storey, head = sill + heightFraction*storey;
    if (base + style.cornice + .78*storey > top || head > 42 || head >= top-.15) break;
    if (sill > bottom+.14 && sill >= 3.7) floors.push({base,sill,head,f});
  }
  if (!windows.length || !floors.length) return null;

  const spans = [], span = Math.min(2,bays)*bay*.94;
  if ((flags & FLAG.ESCAPE) && wallLength > 4.5 && height*HEIGHT_UNIT > 9 && bottom < .1 && top < 42) {
    const repeat = Math.max(span+2*bay,Math.floor(bays/Math.max(1,Math.floor(bays/6)))*bay);
    const origin = (wallLength-span)*.5;
    let partial = false;
    for (let l = origin + Math.floor((from-origin)/repeat)*repeat; l < to; l += repeat) {
      if (l+span <= from) continue;
      if (l < from-.015 || l+span > to+.015) partial = true;
      else spans.push(l);
    }
    if (partial) spans.length = 0;
  }
  const wallFlags = spans.length ? flags & ~FLAG.ESCAPE : flags;
  const pos = [], norm = [], coords = [], styles = [], indices = [];
  const fittings = [], paints = [];
  const trim = new THREE.Color(style.palettes[flags & FLAG.PALETTE][1]).multiplyScalar(.82);
  const jamb = new THREE.Color(style.palettes[flags & FLAG.PALETTE][0]).multiplyScalar(.73);
  const iron = new THREE.Color(0x434343), sash = new THREE.Color(0x514d47);
  const frame = new THREE.Group();
  frame.name = 'Modeled facade';
  // Local +X points towards decreasing facade U, local +Z is out into the street.
  frame.rotation.y = Math.atan2(tz,-tx);
  frame.position.set(wall.x,0,wall.z);
  const scaleU = wall.length/(to-from);
  const localX = u => (from-u)*scaleU;
  function panel(l,r,b,t,d=0,pane=false) {
    if (r <= l || t <= b) return;
    const start = pos.length/3;
    for (const [u,y] of [[l,b],[l,t],[r,t],[r,b]]) {
      pos.push(localX(u),y,d); norm.push(0,0,127,0);
      coords.push(Math.round(u*100),Math.round(y*100),Math.round(wallLength*100),Math.round(top*100));
      styles.push(seed,type,height,wallFlags | (pane ? FLAG.INSET : 0));
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  const pose = new THREE.Object3D(), up = new THREE.Vector3(0,1,0);
  function box(l,r,b,t,back,front,color) {
    pose.position.set((localX(l)+localX(r))/2,(b+t)/2,(back+front)/2);
    pose.scale.set((r-l)*scaleU,t-b,front-back); pose.quaternion.identity();
    pose.updateMatrix(); fittings.push(pose.matrix.clone()); paints.push(color);
  }
  function beam(l,b,d,r,t,e,width,color) {
    const dir = new THREE.Vector3(localX(r)-localX(l),t-b,e-d);
    pose.position.set((localX(l)+localX(r))/2,(b+t)/2,(d+e)/2);
    pose.scale.set(width,dir.length(),width); pose.quaternion.setFromUnitVectors(up,dir.normalize());
    pose.updateMatrix(); fittings.push(pose.matrix.clone()); paints.push(color);
  }
  let lastY = bottom;
  for (const {sill,head} of floors) {
    panel(from,to,lastY,sill);
    let lastU = from;
    for (const [l,r] of windows) {
      panel(lastU,l,sill,head);
      panel(l,r,sill,head,-recess,true);
      // The inner cheeks and head return from the masonry face to the sash.
      box(l-.035,l,sill,head,-recess,.012,jamb);
      box(r,r+.035,sill,head,-recess,.012,jamb);
      box(l-.075,r+.075,head,head+.1,-recess,.048,trim);
      box(l-.085,r+.085,sill-.115,sill,-recess,.14,trim);
      box(l,r,(head+sill)/2-.023,(head+sill)/2+.023,-recess,-recess+.046,sash);
      if (r-l > 1.55) box((l+r)/2-.022,(l+r)/2+.022,sill,head,-recess,-recess+.055,sash);
      lastU = r;
    }
    panel(lastU,to,sill,head); lastY = head;
  }
  panel(from,to,lastY,top);
  if (top < 42 && style.cornice >= .5) {
    const band = style.cornice;
    box(from,to,top-band*.32,top-band*.15,0,band*.19,trim);
    box(from,to,top-band*.15,top,0,band*.32,trim);
    if (style.material === MATERIAL.IRON || style.material === MATERIAL.BROWNSTONE) {
      for (let u = Math.ceil((from+.13)/.52)*.52; u < to-.13; u+=.52) {
        box(u-.075,u+.075,top-band*.52,top-band*.32,0,band*.15,trim);
      }
    }
  }
  // A landing has a grated outside walkway, short returns at each end and an
  // open stairwell between them. Flights reverse on alternate floors.
  for (const l of spans) {
    const r = l+span, depth = 1.05;
    const levels = floors.map(row => row.base + (sillFraction-.09)*storey);
    for (let i = 0; i < levels.length; i++) {
      const y = levels[i];
      for (let k = 0; k < 7; k++) {
        const z = .68+k*.055;
        box(l,r,y-.07,y,z,z+.033,iron);
      }
      for (const edge of [l,r-.58]) box(edge,edge+.58,y-.07,y,.02,.68,iron);
      box(l,r,y-.12,y-.018,depth-.045,depth+.025,iron);
      for (const h of [.48,.98]) box(l,r,y+h,y+h+.035,depth-.018,depth+.018,iron);
      const posts = Math.ceil(span/.18);
      for (let k = 0; k <= posts; k++) {
        const u = l+span*k/posts;
        box(u-.012,u+.012,y,y+.98,depth-.012,depth+.012,iron);
      }
      for (const u of [l,r]) {
        box(u-.026,u+.026,y+.96,y+1.015,.015,depth+.02,iron);
        for (let k = 1; k <= 5; k++) box(u-.014,u+.014,y,y+.98,k*.17-.014,k*.17+.014,iron);
        beam(u,y-.72,0,u,y-.1,depth,.054,iron);
      }
      if (i+1 === levels.length) continue;
      const a = i%2 ? r-.3 : l+.3, b = i%2 ? l+.3 : r-.3, next = levels[i+1];
      for (const z of [.12,.63]) beam(a,y,z,b,next,z,.057,iron);
      beam(a,y+.77,.63,b,next+.77,.63,.04,iron);
      const steps = Math.ceil((next-y)/.22);
      for (let k=1; k<steps; k++) {
        const u = a+(b-a)*k/steps, h = y+(next-y)*k/steps, half = Math.abs(b-a)/steps*.55;
        box(u-half,u+half,h-.04,h,.1,.65,iron);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Int8BufferAttribute(norm,4,true));
  g.setAttribute('aFacade',new THREE.Uint16BufferAttribute(coords,4));
  g.setAttribute('aStyle',new THREE.Uint8BufferAttribute(styles,4,true));
  g.setIndex(indices);
  const shell = new THREE.Mesh(g,facadeMaterial);
  shell.name = 'Recessed window openings'; shell.customDepthMaterial = depthMaterial;
  const parts = new THREE.InstancedMesh(cube,fittingsMaterial,fittings.length);
  parts.name = 'Sills, frames and ironwork';
  fittings.forEach((m,i) => { parts.setMatrixAt(i,m); parts.setColorAt(i,paints[i]); });
  shell.castShadow = shell.receiveShadow = parts.castShadow = parts.receiveShadow = true;
  frame.add(shell,parts);
  return {frame, dispose() { frame.removeFromParent(); g.dispose(); parts.dispose(); }};
}

// Replace only the selected survey triangles. Both the colour and the shadow
// pass see the same holes. The original triangles return as the camera leaves.
function showOriginal(record, first, visible) {
  const g = record.mesh.geometry;
  if (!g.index) {
    const count = g.attributes.position.count;
    const array = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i=0; i<count; i++) array[i]=i;
    g.setIndex(new THREE.BufferAttribute(array,1).setUsage(THREE.DynamicDrawUsage));
    record.bytes += array.byteLength;
  }
  for (let j = first; j < first+6; j++) g.index.array[j] = visible ? j : first;
  g.index.addUpdateRange(first,6);
  g.index.needsUpdate = true;
}

export function createFacadeDepth(facadeMaterial,depthMaterial) {
  const cube = new THREE.BoxGeometry(), fittings = new THREE.MeshStandardMaterial({roughness:.73,metalness:.17});
  const active = new Map();
  let pending = [], dirty = true, lastX = Infinity, lastZ = Infinity, enabled = false;
  function release(entry) {
    showOriginal(entry.record,entry.wall.first,true);
    entry.detail.dispose();
    active.delete(entry.key);
  }
  return {
    invalidate() { dirty = true; },
    update(records,eye,on) {
      if (!on && !enabled) return;
      if (dirty || enabled !== on || Math.hypot(lastX-eye.x,lastZ-eye.z) > 4) {
        const near = [];
        if (on) for (const record of records.values()) {
          const {node,mesh} = record;
          if (!mesh.visible || node.children.length || Math.hypot(node.x-eye.x,node.z-eye.z) > node.radius+48) continue;
          const p = mesh.geometry.attributes.position.array;
          for (const anchor of record.anchors) {
            if (!anchor.fronts) continue;
            for (let at=0; at<anchor.fronts.length; at+=STRIDE) {
              const first = anchor.fronts[at], ends = anchor.fronts[at+1];
              const a = (first+(ends & 7))*3, b = (first+(ends >> 3))*3;
              const dx=p[b]-p[a], dz=p[b+2]-p[a+2], x=eye.x-p[a], z=eye.z-p[a+2];
              const t = Math.max(0,Math.min(1,(x*dx+z*dz)/(dx*dx+dz*dz)));
              const distance = Math.hypot(x-t*dx,z-t*dz);
              if (distance > 48 || x*dz-z*dx < -Math.hypot(dx,dz)*.45 || record.emptyFronts?.has(first)) continue;
              const key = node.id+'/'+first;
              near.push({key,distance:distance-(active.has(key)?3:0),record,anchor,at});
            }
          }
        }
        near.sort((a,b)=>a.distance-b.distance);
        const chosen = near.slice(0,16), keep = new Set(chosen.map(item=>item.key));
        for (const entry of active.values()) if (!keep.has(entry.key)) release(entry);
        pending = chosen.filter(item=>!active.has(item.key));
        lastX=eye.x; lastZ=eye.z; enabled=on; dirty=false;
      }
      // Bound construction work per frame while rounding a corner or arriving.
      const next = pending.shift();
      if (!next) return;
      const {key,record,anchor,at} = next;
      const wall = describe(record.mesh.geometry.attributes.position.array,anchor,at);
      const detail = buildFacadeDepth(wall,facadeMaterial,depthMaterial,cube,fittings);
      if (!detail) {
        (record.emptyFronts ||= new Set()).add(wall.first);
        dirty = true;
        return;
      }
      showOriginal(record,wall.first,false);
      detail.frame.position.y = anchor.elevation;
      record.mesh.add(detail.frame);
      active.set(key,{key,record,wall,anchor,detail});
    },
    reanchor() { for (const {detail,anchor} of active.values()) detail.frame.position.y=anchor.elevation; },
    forget(record) {
      for (const entry of active.values()) if (entry.record===record) release(entry);
      pending=pending.filter(item=>item.record!==record);
      dirty=true;
    },
    dispose() {
      for (const entry of active.values()) release(entry);
      pending=[]; cube.dispose(); fittings.dispose();
    },
  };
}
