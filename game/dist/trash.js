// Trash night.
//
// New York has few alleys: household refuse goes out in bags on the sidewalk
// at the kerb the evening before the Department of Sanitation collects it,
// and is gone the next morning. Which days each block is collected is the
// Department's own (scripts/build-collection.mjs). Bags are put out after
// eight in the evening before a collection day and stand until the truck has
// been, taken here as eight the next morning. How many bags a building puts
// out, and where along its front, is the game's: more for an apartment house
// than a row house, in a heap at the kerb. Recycling, bins and the trucks
// themselves are not modelled.
import * as THREE from './vendor/three.module.min.js';
import { propId } from './street-objects.js';
import { wallFinder } from './places.js';

/** Metres to a cell of the collection grid. */
export const COLLECTION_CELL = 100;
/** The days of the week, Monday first, as the bits of a cell: Monday is 1, Tuesday 2, Wednesday 4 and so on. */
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** "Mon, Thu" as bits. */
export const daysOf = text => String(text || '').split(/[^A-Za-z]+/).reduce((bits, word) => { const day = DAYS.findIndex(name => name.toLowerCase() === word.slice(0, 3).toLowerCase()); return day >= 0 ? bits | (1 << day) : bits; }, 0);
/** When bags go out and when they have gone, by the clock. */
export const SET_OUT = 20, COLLECTED = 8;

/**
 * Whether the bags of a block collected on `days` (bits) are at the kerb on
 * weekday `day` (0 is Monday) at `hours`: out the evening before a collection
 * day, and still there the morning of it.
 */
export function bagsOut(days, day, hours) {
  if (hours >= SET_OUT) return Boolean(days >> ((day + 1) % 7) & 1);
  return hours < COLLECTED && Boolean(days >> (((day % 7) + 7) % 7) & 1);
}

/** `buffer` is collection.bin. Without it there is no collection anywhere. */
export function createCollection(buffer = null) {
  if (!buffer || buffer.byteLength < 20) return { cells: 0, daysAt: () => 0 };
  const [minX, minZ, cell, cols, rows] = new Int32Array(buffer.slice(0, 20)), cells = new Uint8Array(buffer, 20);
  if (cell <= 0 || cols <= 0 || rows <= 0 || cells.length < cols * rows) return { cells: 0, daysAt: () => 0 };
  return {
    cells: cols * rows,
    /** The collection days at (x, z), as bits; 0 where there is none. */
    daysAt(x, z) { const gx = Math.floor((x - minX) / cell), gz = Math.floor((z - minZ) / cell); return gx < 0 || gz < 0 || gx >= cols || gz >= rows ? 0 : cells[gz * cols + gx]; },
  };
}

const hash = (x, z, salt) => { let h = Math.imul(Math.round(x * 4) | 0, 73856093) ^ Math.imul(Math.round(z * 4) | 0, 19349663) ^ Math.imul(salt, 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Where the heaps of bags go: one for each building people live in, at the
 * kerb before its longest street wall. `buildings` are surveyed footprints
 * ({ polygon }), `footprints` is places.js indexFootprints(), `kerb(x, z)`
 * gives the nearest kerb as street-props' snapToKerb() does, `useAt(x, z)`
 * the use of what stands there as lots.js numbers them (1 house, 2 walk-up,
 * 3 elevator apartments), and `daysAt(x, z)` its collection days.
 * @returns {{x:number, z:number, tx:number, tz:number, bags:number, days:number}[]}
 */
export function planTrash(buildings, footprints, isStreet, { kerb, useAt = () => 2, daysAt = () => 0 } = {}) {
  const walls = wallFinder(footprints, isStreet), heaps = [];
  for (const building of buildings) {
    const ring = building.polygon;
    if (!ring?.length) continue;
    const cx = ring.reduce((sum, point) => sum + point[0], 0) / ring.length, cz = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    const use = useAt(cx, cz), days = daysAt(cx, cz);
    if (!days || use < 1 || use > 3) continue;
    const wall = walls(building).reduce((best, candidate) => !best || candidate.length > best.length ? candidate : best, null);
    if (!wall || wall.length < 4) continue;
    // Somewhere along the front, the same place every week, and out to the kerb from there.
    const along = wall.length * (.25 + .5 * hash(cx, cz, 1)), px = wall.a[0] + wall.tx * along, pz = wall.a[1] + wall.tz * along;
    const edge = kerb?.(px + wall.nx * 2.5, pz + wall.nz * 2.5);
    if (!edge) continue;
    const x = edge.x - edge.nx * .5, z = edge.z - edge.nz * .5;
    if (heaps.some(other => Math.hypot(other.x - x, other.z - z) < 2.2)) continue;
    // A house puts out two or three bags, a walk-up a handful, an apartment house a heap, more the longer it is.
    const bags = use === 1 ? 2 + Math.floor(hash(cx, cz, 2) * 2) : use === 2 ? 3 + Math.floor(hash(cx, cz, 2) * 4) : Math.min(14, 7 + Math.floor(wall.length / 6 + hash(cx, cz, 2) * 4));
    heaps.push({ x, z, tx: edge.tx, tz: edge.tz, bags, days });
  }
  return heaps;
}

/** Where each bag of a heap lies, as { x, z, y, size, turn }: a row along the kerb, the bigger heaps two deep and piled. */
export function bagsOf(heap) {
  const bags = [], perRow = Math.max(2, Math.ceil(heap.bags / (heap.bags > 12 ? 3 : heap.bags > 5 ? 2 : 1)));
  for (let i = 0; i < heap.bags; i++) {
    const layer = Math.floor(i / perRow), slot = i % perRow, jitter = hash(heap.x + i, heap.z - i, 3), size = .26 + .1 * hash(heap.x - i, heap.z + i, 4);
    // The second lot sits behind the first, the third on top of both.
    const along = (slot - (perRow - 1) / 2) * .52 + (jitter - .5) * .16, back = layer === 1 ? .46 : layer >= 2 ? .23 : 0, up = layer >= 2 ? .36 : 0;
    bags.push({ x: heap.x + heap.tx * along - heap.tz * back, z: heap.z + heap.tz * along + heap.tx * back, y: up, size, turn: jitter * 6.283 });
  }
  return bags;
}

/** Draw the bags of planTrash()'s heaps. */
export function createTrashMesh({ scene = null, heightAt = () => 0, physics = null, capacity = 2600 } = {}) {
  // A bag: a slumped ball, drawn in and tied at the top.
  const body = new THREE.IcosahedronGeometry(1, 1); body.scale(1, .78, 1); body.translate(0, .74, 0);
  const position = body.attributes.position;
  for (let i = 0; i < position.count; i++) { const y = position.getY(i); if (y > 1.1) { const pinch = 1 - (y - 1.1) * 1.5; position.setX(i, position.getX(i) * pinch); position.setZ(i, position.getZ(i) * pinch); position.setY(i, y + (y - 1.1) * .5); } }
  body.computeVertexNormals();
  const plastic = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .32, metalness: 0, flatShading: true }); plastic.name = 'Refuse bags';
  const mesh = new THREE.InstancedMesh(body, plastic, capacity); mesh.name = 'Refuse bags'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
  scene?.add(mesh);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  const litter = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1),
    new THREE.MeshStandardMaterial({roughness:.95}),capacity*4);
  litter.count=0; litter.frustumCulled=false; mesh.add(litter);
  let heaps = [], shown = '', collectionNight = null;
  function clearBags() {
    physics?.replace('bag',[]);
    if (physics) for (const id of physics.damage.keys()) if (id.startsWith('bag:')) {
      physics.damage.delete(id); physics.moving.delete(id);
    }
  }
  function bagMotion(bag,slot,baseY) {
    let firstScrap=-1;
    const scaleY=size.y;
    return pose=>{
      const radius=bag.size, flatten=pose.torn ? .38 : 1;
      const center=scaleY*.74*flatten;
      turn.setFromAxisAngle(up.set(pose.nz,0,-pose.nx),pose.tilt);
      size.set(radius,scaleY*flatten,radius);
      place.set(0,-center,0).applyQuaternion(turn);
      place.x+=bag.x+pose.dx; place.y+=baseY+pose.lift+center; place.z+=bag.z+pose.dz;
      mesh.setMatrixAt(slot,matrix.compose(place,turn,size));mesh.instanceMatrix.needsUpdate=true;
      up.set(0,1,0);
      if (!pose.torn) return;
      const {x,z,nx,nz,speed,age}=pose.torn;
      if (firstScrap<0) { firstScrap=litter.count; litter.count+=4; }
      for (let j=0;j<4;j++) {
        const spread=(j-1.5)*.36, t=Math.min(age,1.1), travel=speed*(1-Math.exp(-3*t))/3;
        const px=x+(nx+nz*spread)*travel, pz=z+(nz-nx*spread)*travel;
        place.set(px,heightAt(px,pz)+.034+Math.max(0,.15+(1.4+j*.28)*t-4.905*t*t),pz);
        turn.setFromAxisAngle(up,bag.turn+j*2+t*5); size.set(.06+j*.014,.034,.085);
        litter.setMatrixAt(firstScrap+j,matrix.compose(place,turn,size));
        litter.setColorAt(firstScrap+j,colour.setHex([0xb9a187,0xc5c6bc,0x768665,0x876846][j]));
      }
      litter.instanceMatrix.needsUpdate=litter.instanceColor.needsUpdate=true;
    };
  }
  return {
    mesh,
    get heaps() { return heaps; },
    /** Give the heaps near the player. Nothing is drawn until show() says which are out. */
    setHeaps(next) { heaps = next || []; shown = ''; },
    /** Draw the heaps whose bags are out on weekday `day` at `hours`. Returns how many bags are out. */
    show(day, hours) {
      // Which heaps are out changes only at set-out time and at collection, and when the heaps do.
      const key = `${day}:${hours >= SET_OUT ? 2 : hours < COLLECTED ? 1 : 0}:${heaps.length}:${heaps[0]?.x ?? 0}`;
      if (key === shown) { mesh.visible = mesh.count > 0; return mesh.count; }
      shown = key;
      const night=hours>=SET_OUT ? (day+1)%7 : hours<COLLECTED ? day : null;
      if (collectionNight!==night) clearBags();
      collectionNight=night;
      const bodies=[]; litter.count=0;
      let n = 0;
      for (const heap of heaps) {
        if (!bagsOut(heap.days, day, hours)) continue;
        for (const bag of bagsOf(heap)) {
          if (n >= capacity) break;
          place.set(bag.x, heightAt(bag.x, bag.z) + bag.y, bag.z); turn.setFromAxisAngle(up, bag.turn); size.set(bag.size, bag.size * (.85 + .3 * ((bag.turn * 7) % 1)), bag.size); matrix.compose(place, turn, size);
          // Black, most of them; now and then one of the clear ones.
          if (physics) bodies.push({id:propId('bag',bag.x,bag.z)+':'+bag.y,x:bag.x,y:place.y,z:bag.z,
            stackHeight:bag.y,radius:bag.size,height:size.y*1.3,draw:bagMotion(bag,n,place.y)});
          mesh.setMatrixAt(n, matrix); mesh.setColorAt(n, colour.setHex((bag.turn * 13) % 1 < .12 ? 0x9fb3bd : 0x121416)); n++;
        }
      }
      physics?.replace('bag',bodies);
      mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return n;
    },
    dispose() { clearBags(); litter.geometry.dispose(); litter.material.dispose(); litter.dispose(); body.dispose(); plastic.dispose(); mesh.dispose(); mesh.removeFromParent(); },
  };
}
