// Sidewalk cafes: tables and chairs outside the restaurants licensed for them.
//
// Which addresses have a sidewalk cafe is the city's Dining Out NYC licences
// (scripts/build-dining.mjs). A licence does not say how many tables there
// are or where along the building they stand, so a short row is set against
// the street wall nearest the licensed address, with a planter at each end.
// Licences for seating in the roadway are bundled but not drawn: a cabin in
// the parking lane would stand where the game parks cars.
import * as THREE from './vendor/three.module.min.js';
import { wallFinder } from './places.js';

const CELL = 256;
/** How far apart tables stand along the wall, how far out from it, and the most in one row. */
export const CAFE = { pitch: 1.9, out: 1.05, most: 5, seatHeight: .47 };

/** The licensed addresses, from dining.json. */
export function createDining(data = null) {
  const grid = new Map();
  for (const [x, z, kind] of data?.dining || []) { const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push({ x, z, roadway: kind === 1 }); }
  return {
    count: data?.dining?.length || 0,
    /** Those within `radius` of (x, z), as { x, z, roadway }. */
    near(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        for (const cafe of grid.get(`${gx},${gz}`) || []) if (Math.hypot(cafe.x - x, cafe.z - z) <= radius) found.push(cafe);
      }
      return found;
    },
  };
}

/**
 * Where each sidewalk cafe's row of tables stands: { x, z, tx, tz, nx, nz, tables },
 * centred at (x, z) on the wall, running along (tx, tz), with (nx, nz) out over
 * the sidewalk. `footprints` is places.js indexFootprints().
 */
export function planDining(points, footprints, isStreet) {
  const walls = wallFinder(footprints, isStreet), rows = [], taken = new Set();
  for (const point of points) {
    if (point.roadway) continue;
    let best = null;
    const candidates = new Set(footprints.near(point.x, point.z, 22)), inside = footprints.at(point.x, point.z);
    if (inside) candidates.add(inside);
    for (const building of candidates) for (const wall of walls(building)) {
      const t = Math.max(0, Math.min(1, ((point.x - wall.a[0]) * wall.tx + (point.z - wall.a[1]) * wall.tz) / wall.length)), x = wall.a[0] + wall.tx * wall.length * t, z = wall.a[1] + wall.tz * wall.length * t, distance = Math.hypot(x - point.x, z - point.z);
      if (distance < 22 && (!best || distance < best.distance)) best = { wall, t, distance };
    }
    if (!best || best.wall.length < CAFE.pitch * 2 || taken.has(best.wall)) continue;
    taken.add(best.wall);
    const { wall } = best, tables = Math.max(2, Math.min(CAFE.most, Math.floor((wall.length - 1.6) / CAFE.pitch))), half = tables * CAFE.pitch / 2 + .5;
    // The row keeps to its wall.
    const along = Math.max(half, Math.min(wall.length - half, best.t * wall.length));
    rows.push({ x: wall.a[0] + wall.tx * along, z: wall.a[1] + wall.tz * along, tx: wall.tx, tz: wall.tz, nx: wall.nx, nz: wall.nz, tables });
  }
  return rows;
}

/**
 * The chairs of a row: where someone sitting on each is, and the way they face,
 * as { x, z, heading }. Two to a table, facing each other across it.
 */
export function seatsOf(row) {
  const seats = [];
  for (let i = 0; i < row.tables; i++) for (const side of [-1, 1]) {
    const along = (i - (row.tables - 1) / 2) * CAFE.pitch + side * .58;
    seats.push({ x: row.x + row.tx * along + row.nx * CAFE.out, z: row.z + row.tz * along + row.nz * CAFE.out, heading: Math.atan2(-row.tx * side, -row.tz * side), seatKind: 'chair', seatHeight: CAFE.seatHeight });
  }
  return seats;
}

/** Draw the rows of planDining(): every part a box. */
export function createDiningMesh({ scene = null, heightAt = () => 0, capacity = 4000 } = {}) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, metalness: .15 }); material.name = 'Sidewalk cafes';
  const mesh = new THREE.InstancedMesh(box, material, capacity); mesh.name = 'Sidewalk cafes'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene?.add(mesh);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  const TOPS = [0xe9e4d8, 0x2a2c30, 0x9a6b3f], CHAIRS = [0x2a2c30, 0xb23a2e, 0x2f5d50, 0xd9c9a3], PLANTER = 0x3a3f44, LEAVES = 0x2f6b34;
  let drawn = 0;
  return {
    mesh,
    get parts() { return drawn; },
    /** Set out each row. Returns how many rows were drawn whole. */
    update(rows) {
      let n = 0, whole = 0;
      for (const row of rows) {
        if (n + row.tables * 10 + 4 > capacity) break;
        const angle = Math.atan2(row.tx, row.tz), tone = Math.abs(Math.round(row.x * 3 + row.z * 7));
        // (along the wall, out from it, up from the ground there)
        const put = (along, out, y, w, h, d, hex) => {
          const x = row.x + row.tx * along + row.nx * out, z = row.z + row.tz * along + row.nz * out;
          place.set(x, heightAt(x, z) + y, z); turn.setFromAxisAngle(up, angle); size.set(w, h, d); matrix.compose(place, turn, size);
          mesh.setMatrixAt(n, matrix); mesh.setColorAt(n, colour.setHex(hex)); n++;
        };
        const top = TOPS[tone % TOPS.length], chair = CHAIRS[tone % CHAIRS.length];
        for (let i = 0; i < row.tables; i++) {
          const along = (i - (row.tables - 1) / 2) * CAFE.pitch;
          put(along, CAFE.out, .74, .62, .04, .62, top); put(along, CAFE.out, .36, .07, .72, .07, 0x2a2c30);
          // A chair to either side along the wall, each facing the table: seat, back and legs.
          for (const side of [-1, 1]) {
            const seat = along + side * .58;
            put(seat, CAFE.out, CAFE.seatHeight - .02, .38, .04, .38, chair); put(seat + side * .19, CAFE.out, .68, .38, .42, .04, chair);
            put(seat - .15, CAFE.out, .22, .34, .44, .04, 0x2a2c30); put(seat + .15, CAFE.out, .22, .34, .44, .04, 0x2a2c30);
          }
        }
        // A planter closes each end of the row.
        for (const end of [-1, 1]) { const along = end * (row.tables * CAFE.pitch / 2 + .25); put(along, CAFE.out, .3, 1.5, .6, .38, PLANTER); put(along, CAFE.out, .78, 1.4, .42, .32, LEAVES); }
        whole++;
      }
      drawn = mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return whole;
    },
    dispose() { box.dispose(); material.dispose(); mesh.dispose(); mesh.removeFromParent(); },
  };
}
