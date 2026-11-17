// Sidewalk sheds: the green plywood and steel that stands over the sidewalk
// in front of a building being worked on, and often for years after.
//
// Which buildings have one today is the Department of Buildings' record of
// shed permits in force (scripts/build-sheds.mjs). The permit does not say
// which sides of the building the shed is on or how far it runs, so a shed is
// put along every wall of the building that faces a street, for its whole
// length. Its size and colour are the common kind, not surveyed.
import * as THREE from './vendor/three.module.min.js';
import { wallFinder } from './places.js';

const CELL = 256;
/** How far a shed stands out from the wall, how high its deck is, and how far apart its posts are, in metres. */
export const SHED = { depth: 2.3, deck: 2.6, parapet: 1.15, bay: 2.4 };

/** The buildings with a shed, from sheds.json. */
export function createSheds(data = null) {
  const grid = new Map();
  for (const [x, z, bin] of data?.sheds || []) { const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push({ x, z, bin }); }
  return {
    count: data?.sheds?.length || 0,
    /** Those within `radius` of (x, z), as { x, z, bin }. */
    near(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        for (const shed of grid.get(`${gx},${gz}`) || []) if (Math.hypot(shed.x - x, shed.z - z) <= radius) found.push(shed);
      }
      return found;
    },
  };
}

/**
 * Where the sheds of these buildings run: one stretch for each wall that
 * faces a street, as { ax, az, bx, bz, nx, nz, length } with (nx, nz) out
 * over the sidewalk. `footprints` is places.js indexFootprints().
 */
export function planSheds(points, footprints, isStreet) {
  const walls = wallFinder(footprints, isStreet), done = new Set(), runs = [];
  for (const point of points) {
    // The permit's point is the building's address: inside its outline, or just outside it.
    let building = footprints.at(point.x, point.z), nearest = 15;
    if (!building) for (const candidate of footprints.near(point.x, point.z, 15)) for (const [x, z] of candidate.polygon) { const d = Math.hypot(x - point.x, z - point.z); if (d < nearest) { nearest = d; building = candidate; } }
    if (!building || done.has(building)) continue;
    done.add(building);
    for (const wall of walls(building)) if (wall.length >= 3) runs.push({ ax: wall.a[0], az: wall.a[1], bx: wall.b[0], bz: wall.b[1], nx: wall.nx, nz: wall.nz, length: wall.length });
  }
  return runs;
}

/** Draw sheds along the stretches of planSheds(). Every part is a box: the deck, its parapet, and the posts and rails that hold it up. */
export function createShedMesh({ scene = null, heightAt = () => 0, capacity = 6000 } = {}) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8, metalness: .1 }); material.name = 'Sidewalk sheds';
  const mesh = new THREE.InstancedMesh(box, material, capacity); mesh.name = 'Sidewalk sheds'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene?.add(mesh);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  const GREEN = 0x1d4a34, STEEL = 0x8b9094, WOOD = 0x8a7a5c;
  let drawn = 0;
  return {
    mesh,
    get parts() { return drawn; },
    /** Stand a shed along each stretch. Returns how many stretches were drawn whole. */
    update(runs) {
      let n = 0, whole = 0;
      const put = (x, y, z, angle, w, h, d, tone) => {
        if (n >= capacity) return;
        place.set(x, y, z); turn.setFromAxisAngle(up, angle); size.set(w, h, d); matrix.compose(place, turn, size);
        mesh.setMatrixAt(n, matrix); mesh.setColorAt(n, colour.setHex(tone)); n++;
      };
      for (const run of runs) {
        const bays = Math.max(1, Math.round(run.length / SHED.bay)), tx = (run.bx - run.ax) / run.length, tz = (run.bz - run.az) / run.length, angle = Math.atan2(tx, tz);
        if (n + bays * 2 + 8 > capacity) break;
        const mx = (run.ax + run.bx) / 2 + run.nx * SHED.depth / 2, mz = (run.az + run.bz) / 2 + run.nz * SHED.depth / 2;
        // The deck is level: it sits on the highest ground along the stretch, and the posts reach down to the rest.
        const grounds = [];
        for (let i = 0; i <= bays; i++) for (const out of [.15, SHED.depth]) { const along = run.length * i / bays, x = run.ax + tx * along + run.nx * out, z = run.az + tz * along + run.nz * out; grounds.push([x, z, heightAt(x, z)]); }
        const top = Math.max(...grounds.map(ground => ground[2])) + SHED.deck;
        // Boxes are laid with their length along local z, which the turn puts along the wall.
        put(mx, top + .06, mz, angle, SHED.depth + .1, .12, run.length, WOOD);
        put((run.ax + run.bx) / 2 + run.nx * SHED.depth, top + .12 + SHED.parapet / 2, (run.az + run.bz) / 2 + run.nz * SHED.depth, angle, .05, SHED.parapet, run.length, GREEN);
        for (const end of [0, 1]) put(run.ax + tx * run.length * end + run.nx * SHED.depth / 2, top + .12 + SHED.parapet / 2, run.az + tz * run.length * end + run.nz * SHED.depth / 2, angle, SHED.depth, SHED.parapet, .05, GREEN);
        for (const [x, z, y] of grounds) put(x, (y + top) / 2, z, angle, .07, top - y, .07, STEEL);
        // A rail at waist height along the kerb side, and the beam the deck rests on.
        put((run.ax + run.bx) / 2 + run.nx * SHED.depth, top - .08, (run.az + run.bz) / 2 + run.nz * SHED.depth, angle, .08, .16, run.length, STEEL);
        put((run.ax + run.bx) / 2 + run.nx * .15, top - .08, (run.az + run.bz) / 2 + run.nz * .15, angle, .08, .16, run.length, STEEL);
        whole++;
      }
      drawn = mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return whole;
    },
    dispose() { box.dispose(); material.dispose(); mesh.dispose(); mesh.removeFromParent(); },
  };
}
