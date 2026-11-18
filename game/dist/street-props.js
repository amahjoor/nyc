// Litter baskets and bus stop shelters, where the city's inventories put them.
//
// Both lists give a point near the kerb, good to a few metres. Each is moved
// onto the nearest surveyed kerb and set just inside it, facing the roadway;
// one with no kerb within reach is left out rather than stood in the road.
// What they look like is drawn: the green wire basket found on most corners,
// and the glass shelter with a lit advertising panel at one end.
import * as THREE from './vendor/three.module.min.js';
import { propId } from './street-objects.js';
import { propInstance } from './prop-instance.js';

const CELL = 32;
const keyOf = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

/** Index a flat [x, z, x, z, ...] list for range queries. */
export function indexPoints(flat = []) {
  const grid = new Map();
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const key = keyOf(flat[i], flat[i + 1]);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(flat[i], flat[i + 1]);
  }
  return {
    /** Points within `radius` of (x, z), as [x, z] pairs. */
    near(x, z, radius) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        const points = grid.get(`${gx},${gz}`);
        if (points) for (let i = 0; i < points.length; i += 2) if (Math.hypot(points[i] - x, points[i + 1] - z) <= radius) found.push([points[i], points[i + 1]]);
      }
      return found;
    },
  };
}

/** Index the kerb runs of a streetscape (see streetscape.js walks()) by segment. */
export function indexKerbs(walks = []) {
  const grid = new Map();
  for (const run of walks) for (let i = 0, before = 0; i + 1 < run.points.length; i++) {
    const a = run.points[i], b = run.points[i + 1], span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // `before` and `after`: how much of the same kerb lies either side of this piece.
    const total = run.lengths ? run.lengths.at(-1) : run.points.slice(1).reduce((sum, point, n) => sum + Math.hypot(point[0] - run.points[n][0], point[1] - run.points[n][1]), 0);
    const segment = { ax: a[0], az: a[1], bx: b[0], bz: b[1], nx: run.normals[i][0], nz: run.normals[i][1], before, after: total - before - span };
    before += span;
    for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++) for (let gz = Math.floor(Math.min(a[1], b[1]) / CELL); gz <= Math.floor(Math.max(a[1], b[1]) / CELL); gz++) {
      const key = `${gx},${gz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(segment);
    }
  }
  return grid;
}

/**
 * The nearest point of any kerb within `reach` of (x, z): where it is, which
 * way the roadway lies (`nx`, `nz`) and which way the kerb runs. Null if none.
 */
export function snapToKerb(kerbs, x, z, reach = 9) {
  let best = null;
  for (let gx = Math.floor((x - reach) / CELL); gx <= Math.floor((x + reach) / CELL); gx++) for (let gz = Math.floor((z - reach) / CELL); gz <= Math.floor((z + reach) / CELL); gz++) {
    for (const s of kerbs.get(`${gx},${gz}`) || []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, length2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / length2)), px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d <= reach && (!best || d < best.distance)) { const length = Math.sqrt(length2); best = { x: px, z: pz, nx: s.nx, nz: s.nz, tx: dx / length, tz: dz / length, distance: d, room: Math.min(s.before + t * length, s.after + (1 - t) * length) }; }
    }
  }
  return best;
}

function basketGeometry() {
  // Open wire basket: a tapered wall seen from both sides, a rim, and what is in it.
  const wall = new THREE.CylinderGeometry(.3, .25, .86, 14, 1, true); wall.translate(0, .45, 0);
  const rim = new THREE.TorusGeometry(.3, .022, 5, 14); rim.rotateX(Math.PI / 2); rim.translate(0, .88, 0);
  const fill = new THREE.CircleGeometry(.27, 12); fill.rotateX(-Math.PI / 2); fill.translate(0, .62, 0);
  return merge([[wall, [.07, .2, .13]], [rim, [.05, .14, .09]], [fill, [.035, .034, .032]]]);
}
const BENCH_TOP = .495;
function shelterGeometry() {
  // Steel: roof, four posts and a bench. Faces +Z, toward the roadway.
  const parts = [], steel = [.11, .115, .12], seat = [.2, .2, .21];
  const box = (w, h, d, x, y, z, tone) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push([g, tone]); };
  box(4.4, .07, 1.5, 0, 2.5, 0, steel);
  for (const x of [-2.1, 2.1]) for (const z of [-.68, .68]) box(.07, 2.5, .07, x, 1.25, z, steel);
  box(1.9, .05, .38, -.6, BENCH_TOP - .025, -.42, seat); box(.05, .47, .34, -1.45, .235, -.42, steel); box(.05, .47, .34, .25, .235, -.42, steel);
  return merge(parts);
}
function merge(parts) {
  const position = [], normal = [], color = [];
  for (const [source, tone] of parts) {
    const g = source.index ? source.toNonIndexed() : source, p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i)); color.push(tone[0], tone[1], tone[2]); }
    source.dispose(); if (g !== source) g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** How far in from the kerb each stands, in metres. */
export const SETBACK = { basket: .6, shelter: 1.25 };

/**
 * Draw the baskets and shelters around the player. `data` is
 * street-life.json; it may arrive later through setData().
 */
export function createStreetProps({ scene = null, heightAt = () => 0, data = null, range = 170, capacity = 220, physics = null } = {}) {
  const group = new THREE.Group(); group.name = 'Litter baskets and bus shelters'; scene?.add(group);
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .35, side: THREE.DoubleSide }); paint.name = 'Street furniture';
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfd3d8, roughness: .08, metalness: .1, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide }); glass.name = 'Shelter glass';
  // The advertising panel is lit from inside, day and night.
  const advert = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }); advert.name = 'Shelter advertising panel';
  const make = (name, geometry, material, count) => { const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); return mesh; };
  const back = new THREE.PlaneGeometry(4.1, 1.95); back.translate(0, 1.33, -.7);
  const panel = new THREE.BoxGeometry(.12, 1.75, 1.2); panel.translate(2.12, 1.28, 0);
  const meshes = { baskets: make('Litter baskets', basketGeometry(), paint, capacity), shelters: make('Bus shelters', shelterGeometry(), paint, 40),
    glazing: make('Bus shelter glass', back, glass, 40), adverts: make('Bus shelter advertising', panel, advert, 40) };
  meshes.baskets.castShadow = meshes.shelters.castShadow = true;
  meshes.adverts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3);
  let points = { baskets: indexPoints(data?.baskets), shelters: indexPoints(data?.shelters) };
  const seats = [];
  let source = null, kerbs = null, at = null, stale = true, standing = null;
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  // A few poster colours; which a shelter shows depends only on where it stands.
  const POSTERS = [[2.6, 2.5, 2.3], [2.4, .9, .5], [.6, 1.6, 2.6], [2.5, 2.0, .6], [.7, 2.2, 1.4], [2.2, .7, 1.6]];
  return {
    group, meshes, seats,
    setData(next) { points = { baskets: indexPoints(next?.baskets), shelters: indexPoints(next?.shelters) }; stale = true; },
    get counts() { return { baskets: meshes.baskets.count, shelters: meshes.shelters.count }; },
    /**
     * `walks` is the streetscape's kerb list; props move onto it. `poles` are
     * the signal and sign poles already standing ({ x, z }): a basket that
     * would share a pole's spot is slid a pace along the kerb.
     */
    update(walks = [], focus = { x: 0, z: 0 }, poles = null) {
      if (walks !== source) { source = walks; kerbs = indexKerbs(walks); stale = true; }
      if (poles !== standing) { standing = poles; stale = true; }
      if (!stale && at && Math.hypot(focus.x - at.x, focus.z - at.z) < 30) return false;
      stale = false; at = { x: focus.x, z: focus.z };
      let baskets = 0, shelters = 0;
      seats.length = 0;
      const bodies = [];
      for (const [x, z] of points.baskets.near(focus.x, focus.z, range)) {
        if (baskets >= capacity) break;
        const kerb = snapToKerb(kerbs, x, z, 9);
        if (!kerb) continue;
        let px = kerb.x - kerb.nx * SETBACK.basket, pz = kerb.z - kerb.nz * SETBACK.basket;
        for (const pole of poles || []) {
          const dx = px - pole.x, dz = pz - pole.z;
          if (Math.hypot(dx, dz) > 1) continue;
          // Away from the pole, along the kerb.
          const way = dx * kerb.tx + dz * kerb.tz >= 0 ? 1 : -1;
          px += kerb.tx * way * 1.3; pz += kerb.tz * way * 1.3;
          break;
        }
        place.set(px, heightAt(px, pz), pz); turn.identity(); matrix.compose(place, turn, one);
        if (physics) {
          const body = { id:propId('basket',x,z), x:px, y:place.y, z:pz, radius:.30, height:.88 };
          body.draw = propInstance(meshes.baskets,baskets,body,matrix);
          bodies.push(body);
        }
        meshes.baskets.setMatrixAt(baskets++, matrix);
      }
      for (const [x, z] of points.shelters.near(focus.x, focus.z, range)) {
        if (shelters >= 40) break;
        // A shelter needs two metres of straight kerb either side of it.
        const kerb = snapToKerb(kerbs, x, z, 12);
        if (!kerb || kerb.room < 2.2) continue;
        const px = kerb.x - kerb.nx * SETBACK.shelter, pz = kerb.z - kerb.nz * SETBACK.shelter;
        place.set(px, heightAt(px, pz), pz); turn.setFromAxisAngle(up, Math.atan2(kerb.nx, kerb.nz)); matrix.compose(place, turn, one);
        for (const along of [-1.1, -.1]) {
          seats.push({ y:place.y, x:px + kerb.nz*along - kerb.nx*.42, z:pz - kerb.nx*along - kerb.nz*.42, heading:Math.atan2(kerb.nx,kerb.nz), shelter:true, seatKind:'bench', seatHeight:BENCH_TOP, seatDepth:.38 });
        }
        for (const name of ['shelters', 'glazing', 'adverts']) meshes[name].setMatrixAt(shelters, matrix);
        const poster = POSTERS[Math.abs(Math.round(x * 7 + z * 13)) % POSTERS.length];
        meshes.adverts.instanceColor.setXYZ(shelters++, poster[0], poster[1], poster[2]);
      }
      meshes.baskets.count = baskets; meshes.shelters.count = meshes.glazing.count = meshes.adverts.count = shelters;
      for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
      meshes.adverts.instanceColor.needsUpdate = true;
      physics?.replace('basket', bodies);
      return true;
    },
    dispose() {
      physics?.replace('basket', []);
      for (const mesh of Object.values(meshes)) { mesh.geometry.dispose(); mesh.dispose(); }
      paint.dispose(); glass.dispose(); advert.dispose(); group.removeFromParent();
    },
  };
}
