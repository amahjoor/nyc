// Citi Bike: the docking stations, where the system's own feed puts them.
//
// The feed gives each station's position and how many docks it has
// (scripts/build-bikes.mjs). A station is drawn as a row of docks along the
// nearest kerb with a pay kiosk at one end and bikes in about six docks of
// ten. Real stations mostly stand in the parking lane; here they are on the
// sidewalk side of the kerb, because the game parks cars in that lane, and a
// long station is cut to the docks that fit.
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
function bikeGeometry() {
  const parts = [], BLUE = [.03, .16, .5], BLACK = [.03, .03, .035], GREY = [.45, .47, .5];
  const add = (geometry, tone) => { const g = geometry.index ? geometry.toNonIndexed() : geometry; parts.push([g, tone]); };
  const box = (w, h, d, x, y, z, tone, tilt = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (tilt) g.rotateX(tilt); g.translate(x, y, z); add(g, tone); };
  for (const z of [-.52, .52]) {
    const tyre = new THREE.TorusGeometry(.31, .035, 6, 16); tyre.rotateY(Math.PI / 2); tyre.translate(0, .345, z); add(tyre, BLACK);
    const guard = new THREE.TorusGeometry(.36, .02, 4, 10, Math.PI * .9); guard.rotateY(Math.PI / 2); guard.rotateX(z > 0 ? -.2 : .2); guard.translate(0, .345, z); add(guard, BLUE);
  }
  box(.07, .09, .95, 0, .5, 0, BLUE, .32); box(.06, .62, .06, 0, .68, -.22, BLUE, -.2); box(.06, .7, .06, 0, .72, .44, BLUE, .28);
  box(.2, .06, .28, 0, 1.0, -.28, BLACK); box(.52, .04, .05, 0, 1.08, .36, GREY); box(.3, .2, .22, 0, .92, .62, GREY);
  box(.04, .3, .04, 0, .2, -.1, GREY, .5);
  const position = [], normal = [], color = [];
  for (const [g, tone] of parts) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i)); color.push(...tone); } g.dispose(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

/** Draw the rows of planBikeDocks(). */
export function createBikeDocks({ scene = null, heightAt = () => 0, capacity = 240 } = {}) {
  const group = new THREE.Group(); group.name = 'Citi Bike stations'; scene?.add(group);
  const bike = bikeGeometry(), paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .3 }); paint.name = 'Citi Bike';
  const rental = new THREE.Mesh(bike, paint); rental.name = 'Borrowed Citi Bike';
  rental.visible = false; rental.castShadow = true; scene?.add(rental);
  const available = [];
  const bikes = new THREE.InstancedMesh(bike, paint, capacity); bikes.name = 'Citi Bikes'; bikes.count = 0; bikes.frustumCulled = false; bikes.castShadow = true;
  const box = new THREE.BoxGeometry(1, 1, 1), steel = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6, metalness: .4 }); steel.name = 'Citi Bike docks';
  const posts = new THREE.InstancedMesh(box, steel, capacity * 2 + 64); posts.name = 'Citi Bike docks'; posts.count = 0; posts.frustumCulled = false; posts.castShadow = true;
  group.add(bikes, posts);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  return {
    group, rental, available,
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
