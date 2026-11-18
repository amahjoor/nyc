import * as THREE from './vendor/three.module.min.js';
import { buildDeckStructure } from './deck-structure.js';
import { buildApproaches } from './deck-approaches.js';

const DECK_TYPES = new Set(['bridge', 'overpass', 'pedestrian bridge']);
const CELL_SIZE = 32;
const MAX_LEVEL_CHANGE = 1.5;
const MAX_ENTRY_CHANGE = .30;
// The survey measures a deck only along its outline. Its inside is meshed this
// finely and given the smoothest surface that meets those measured edges.
const MAX_GRADE = .15, MAX_EDGE = 10, MAX_VERTICES = 120000, GRADE_LEVEL = 13, LEVEL_STEP = 4;

const edgeKey = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;

/** One to three outline heights far from the agreeing heights on either side are a survey slip, not a step in the road. */
function despike(ring, heights) {
  const n = heights.length, out = heights.slice();
  if (n < 5) return out;
  const along = (i, j) => { let d = 0; for (let k = i; k !== j; k = (k + 1) % n) d += Math.hypot(ring[(k + 1) % n][0] - ring[k][0], ring[(k + 1) % n][1] - ring[k][1]); return d; };
  for (let i = 0; i < n; i++) {
    for (let run = 1; run <= 3; run++) {
      const p = (i + n - 1) % n, q = (i + run) % n;
      if (Math.abs(out[p] - out[q]) > 3) continue;
      let slip = true;
      for (let k = 0; k < run && slip; k++) {
        const h = out[(i + k) % n];
        slip = Math.abs(h - out[p]) > 4 && Math.abs(h - out[q]) > 4 && (h - out[p]) * (h - out[q]) > 0;
      }
      if (!slip) continue;
      const total = along(p, q);
      for (let k = 0; k < run; k++) out[(i + k) % n] = total > 0 ? out[p] + (out[q] - out[p]) * along(p, (i + k) % n) / total : out[p];
      break;
    }
  }
  return out;
}

/**
 * The survey often records a rising deck as steps: one height held for a
 * stretch, then another several metres up. A road does not do that. Where
 * the outline climbs faster than MAX_GRADE, the step is spread into a slope.
 */
function regrade(ring, heights) {
  const n = heights.length, out = heights.slice(), spans = ring.map((point, i) => Math.hypot(ring[(i + 1) % n][0] - point[0], ring[(i + 1) % n][1] - point[1]));
  for (let sweep = 0; sweep < 2000; sweep++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, rise = out[j] - out[i], over = Math.abs(rise) - (spans[i] * MAX_GRADE + .02);
      if (over <= 0) continue;
      const shift = Math.sign(rise) * over / 2;
      out[i] += shift;out[j] -= shift;moved = Math.max(moved, over);
    }
    if (moved < .01) break;
  }
  return out;
}

/**
 * Heights for the vertices inside a deck: each becomes the mean-value average
 * of its neighbours, so a deck whose edges lie in a plane is that plane, and
 * one whose edges rise along a span rises with them from side to side.
 */
function relax(X, Z, Y, triangles) {
  const inside = [];
  for (let i = 0; i < Y.length; i++) if (Number.isNaN(Y[i])) inside.push(i);
  if (!inside.length) return;
  // Start from the nearest measured height.
  const size = 24, grid = new Map();
  for (let i = 0; i < Y.length; i++) {
    if (Number.isNaN(Y[i])) continue;
    const key = `${Math.floor(X[i] / size)},${Math.floor(Z[i] / size)}`;
    let list = grid.get(key);
    if (!list) grid.set(key, list = []);
    list.push(i);
  }
  const start = new Float64Array(Y.length);
  for (const v of inside) {
    const cx = Math.floor(X[v] / size), cz = Math.floor(Z[v] / size);
    let best = -1, nearest = Infinity;
    for (let ring = 0; ring < 64 && (best < 0 || (ring - 1) * size < Math.sqrt(nearest)); ring++) {
      for (let x = cx - ring; x <= cx + ring; x++) for (let z = cz - ring; z <= cz + ring; z++) {
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) !== ring) continue;
        for (const i of grid.get(`${x},${z}`) || []) {
          const d = (X[i] - X[v]) ** 2 + (Z[i] - Z[v]) ** 2;
          if (d < nearest) { nearest = d; best = i; }
        }
      }
    }
    start[v] = best < 0 ? 0 : Y[best];
  }
  for (const v of inside) Y[v] = start[v];
  const slot = new Map(inside.map((v, i) => [v, i])), neighbours = inside.map(() => new Map());
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const v = triangles[t + k], at = slot.get(v);
      if (at === undefined) continue;
      const a = triangles[t + (k + 1) % 3], b = triangles[t + (k + 2) % 3];
      const ax = X[a] - X[v], az = Z[a] - Z[v], bx = X[b] - X[v], bz = Z[b] - Z[v];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) continue;
      const half = Math.min(1000, Math.tan(Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))) / 2));
      const weights = neighbours[at];
      weights.set(a, (weights.get(a) || 0) + half / la);
      weights.set(b, (weights.get(b) || 0) + half / lb);
    }
  }
  const lists = neighbours.map(weights => { let total = 0; for (const w of weights.values()) total += w; return { entries: [...weights], total }; });
  for (let sweep = 0; sweep < 600; sweep++) {
    let moved = 0;
    for (let i = 0; i < inside.length; i++) {
      const { entries, total } = lists[i];
      if (!(total > 0)) continue;
      let sum = 0;
      for (const [n, w] of entries) sum += Y[n] * w;
      const next = sum / total, change = Math.abs(next - Y[inside[i]]);
      if (change > moved) moved = change;
      Y[inside[i]] = next;
    }
    if (moved < 1e-6) break;
  }
}

/**
 * Earcut fills an outline with whatever triangles come first, many of them
 * slivers running the length of a span. Flip each shared edge that has a
 * better diagonal (Delaunay's rule) so the triangles reach across the deck.
 * Outline edges belong to one triangle only, so the outline is never changed.
 */
function improve(X, Z, faces) {
  const area = (a, b, c) => (X[b] - X[a]) * (Z[c] - Z[a]) - (Z[b] - Z[a]) * (X[c] - X[a]);
  const triangles = faces.map(([a, b, c]) => area(a, b, c) < 0 ? [a, c, b] : [a, b, c]), sides = new Map();
  const attach = (u, v, t) => { const key = edgeKey(u, v); let list = sides.get(key); if (!list) sides.set(key, list = []); list.push(t); };
  const detach = (u, v, t) => { const list = sides.get(edgeKey(u, v)); if (list) { const at = list.indexOf(t); if (at >= 0) list.splice(at, 1); } };
  triangles.forEach((triangle, t) => { for (let k = 0; k < 3; k++) attach(triangle[k], triangle[(k + 1) % 3], t); });
  const stack = [];
  for (const triangle of triangles) for (let k = 0; k < 3; k++) stack.push([triangle[k], triangle[(k + 1) % 3]]);
  for (let budget = stack.length * 30; stack.length && budget > 0; budget--) {
    const [u, v] = stack.pop(), pair = sides.get(edgeKey(u, v));
    if (!pair || pair.length !== 2) continue;
    const [s, t] = pair, p = triangles[s].find(i => i !== u && i !== v), q = triangles[t].find(i => i !== u && i !== v);
    if (p === undefined || q === undefined || p === q) continue;
    // Order the shared edge so that p lies to its left.
    const [a, b] = area(u, v, p) >= 0 ? [u, v] : [v, u];
    const left = area(a, q, p), right = area(q, b, p);
    if (!(left > 1e-9 && right > 1e-9)) continue;
    const flat = Math.abs(area(a, b, p)) < 1e-9 || Math.abs(area(a, b, q)) < 1e-9;
    if (!flat) {
      const ax = X[a] - X[q], az = Z[a] - Z[q], bx = X[b] - X[q], bz = Z[b] - Z[q], px = X[p] - X[q], pz = Z[p] - Z[q];
      const inside = (ax * ax + az * az) * (bx * pz - px * bz) - (bx * bx + bz * bz) * (ax * pz - px * az) + (px * px + pz * pz) * (ax * bz - bx * az);
      if (!(inside > 1e-9)) continue;
    }
    for (const [i, j, owner] of [[a, b, s], [b, p, s], [p, a, s], [a, b, t], [b, q, t], [q, a, t]]) detach(i, j, owner);
    triangles[s] = [a, q, p];triangles[t] = [q, b, p];
    attach(a, q, s);attach(q, p, s);attach(p, a, s);attach(q, b, t);attach(b, p, t);attach(p, q, t);
    stack.push([a, q], [q, b], [b, p], [p, a]);
  }
  return triangles;
}

function prepareFeature(feature) {
  if (!feature || feature.kind !== 'transport' || !DECK_TYPES.has(feature.subtype)
    || feature.elevationStatus !== 'surveyed' || feature.elevationUnits !== 'meters'
    || feature.verticalDatum !== 'NAVD88' || typeof feature.id !== 'string' || !feature.id
    || typeof feature.sourceId !== 'string' || !feature.sourceId || !Array.isArray(feature.holes)
    || !Array.isArray(feature.elevations?.holes) || feature.holes.length !== feature.elevations.holes.length) return null;
  const rings = [feature.polygon, ...feature.holes], heights = [feature.elevations.polygon, ...feature.elevations.holes];
  const X = [], Z = [], Y = [], contours = [], boundary = new Set();
  for (let r = 0; r < rings.length; r++) {
    let ring = rings[r], elevations = heights[r];
    if (!Array.isArray(ring) || ring.length < 3 || !Array.isArray(elevations) || ring.length !== elevations.length) return null;
    for (let i = 0; i < ring.length; i++) {
      const point = ring[i], elevation = elevations[i];
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || !Number.isFinite(elevation)) return null;
      if (![Math.fround(point[0]), Math.fround(point[1]), Math.fround(elevation)].every(Number.isFinite)) return null;
    }
    // Earcut removes a repeated closing coordinate. Remove its aligned height
    // too, so every index still selects the corresponding surveyed Z value.
    const first = ring[0], last = ring.at(-1);
    if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) {
      if (Math.fround(elevations.at(-1)) !== Math.fround(elevations[0])) return null;
      ring = ring.slice(0, -1);elevations = elevations.slice(0, -1);
    }
    if (ring.length < 3) return null;
    // A lid's heights are read off a continuous model of the ground: there are no survey slips or steps in them to mend.
    if (feature.cover !== 'ground') elevations = regrade(ring, despike(ring, elevations));
    // Long outline edges are divided before the inside is filled, each new
    // point on the line between two measured heights: the fill then spans
    // the deck from side to side and not from one end of a span to the other.
    const offset = X.length, contour = [];
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length, pieces = Math.max(1, Math.ceil(Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]) / MAX_EDGE));
      for (let k = 0; k < pieces; k++) {
        const t = k / pieces, x = ring[i][0] + (ring[j][0] - ring[i][0]) * t, z = ring[i][1] + (ring[j][1] - ring[i][1]) * t;
        X.push(x);Z.push(z);Y.push(elevations[i] + (elevations[j] - elevations[i]) * t);contour.push(new THREE.Vector2(x, z));
      }
    }
    for (let i = 0; i < contour.length; i++) boundary.add(edgeKey(offset + i, offset + (i + 1) % contour.length));
    contours.push(contour);
  }
  // Halve every edge longer than MAX_EDGE. A new vertex on the outline lies
  // on the line between two measured heights; one inside is settled below.
  const pending = improve(X, Z, THREE.ShapeUtils.triangulateShape(contours[0], contours.slice(1))), midpoints = new Map(), triangles = [];
  while (pending.length) {
    const [a, b, c] = pending.pop();
    let split = null, longest = MAX_EDGE * MAX_EDGE;
    for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const length = (X[u] - X[v]) ** 2 + (Z[u] - Z[v]) ** 2;
      if (length > longest) { longest = length; split = [u, v, w]; }
    }
    if (!split || X.length >= MAX_VERTICES) { triangles.push(a, b, c); continue; }
    const [u, v, w] = split, key = edgeKey(u, v);
    let m = midpoints.get(key);
    if (m === undefined) {
      m = X.length;midpoints.set(key, m);
      X.push((X[u] + X[v]) / 2);Z.push((Z[u] + Z[v]) / 2);
      if (boundary.has(key)) { Y.push((Y[u] + Y[v]) / 2);boundary.add(edgeKey(u, m));boundary.add(edgeKey(m, v)); }
      else Y.push(NaN);
    }
    pending.push([u, m, w], [m, v, w]);
  }
  relax(X, Z, Y, triangles);
  const part = finishPart({ id: feature.id, sourceId: feature.sourceId, subtype: feature.subtype, name: feature.name || '', X, Z, Y, triangles, boundary });
  // A lid over a cutting carries the ground across it, and is drawn as that ground.
  if (feature.cover === 'ground') part.cover = 'ground';
  return part;
}

/** A deck ready to draw and to stand on, from the vertices and triangles of its surface and the edges of its rim. */
function finishPart({ id, sourceId, subtype, name = '', X, Z, Y, triangles, boundary }) {
  // Match the actual GPU vertices when sampling.
  const vertices = X.map((x, i) => ({ x: Math.fround(x), y: Math.fround(Y[i]), z: Math.fround(Z[i]) }));
  const records = [], indices = [], edges = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const face = [triangles[t], triangles[t + 1], triangles[t + 2]];
    let [a, b, c] = face.map(index => vertices[index]);
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) < .000001) continue;
    const order = cross > 0 ? [face[0], face[2], face[1]] : face;
    [a, b, c] = order.map(index => vertices[index]);
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
    indices.push(...order);
    records.push({ a, b, c, normal: { x: nx / length, y: ny / length, z: nz / length },
      bounds: { minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z) } });
    // The deck's rim, each edge with the direction that leaves the deck.
    for (let k = 0; k < 3; k++) {
      const i = order[k], j = order[(k + 1) % 3], other = vertices[order[(k + 2) % 3]];
      if (!boundary.has(edgeKey(i, j))) continue;
      const p = vertices[i], q = vertices[j], dx = q.x - p.x, dz = q.z - p.z, span = Math.hypot(dx, dz);
      if (span < 1e-4) continue;
      let ox = dz / span, oz = -dx / span;
      if ((other.x - p.x) * ox + (other.z - p.z) * oz > 0) { ox = -ox; oz = -oz; }
      edges.push({ i, j, ox, oz });
    }
  }
  if (!records.length) return null;
  return { id, sourceId, subtype, name, vertices, indices, triangles: records, edges };
}

/** Surveyed outline elevations provide the deck; what holds it up is drawn
 * by deck-structure.js. Queries use the same triangles as the visible mesh. */
export class TransportSurfaces {
  constructor({ scene, material, structureMaterial, paintMaterial, groundMaterial = null, groundAt = null, waterAt = null } = {}) {
    this.scene = scene;this.disposed = false;this.ownsMaterial = !material;
    this.material = material || new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 1 });
    this.structureMaterial = structureMaterial || new THREE.MeshStandardMaterial({ color: 0x8f8d86, roughness: .95, side: THREE.DoubleSide });
    this.paintMaterial = paintMaterial || new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: .7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.ownsStructureMaterial = !structureMaterial;this.ownsPaintMaterial = !paintMaterial;
    this.group = new THREE.Group();this.group.name = 'NYC measured transport decks';
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = 'Surveyed bridge outlines with interpolated deck heights';
    this.mesh.castShadow = true;this.mesh.receiveShadow = true;this.group.add(this.mesh);
    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), groundMaterial || this.material);
    this.ground.name = 'Decks that carry the ground across a cutting';
    this.ground.castShadow = true;this.ground.receiveShadow = true;this.group.add(this.ground);
    this.structure = new THREE.Mesh(new THREE.BufferGeometry(), this.structureMaterial);
    this.structure.name = 'Deck slabs, parapets and piers';
    this.structure.castShadow = true;this.structure.receiveShadow = true;this.group.add(this.structure);
    this.paint = new THREE.Mesh(new THREE.BufferGeometry(), this.paintMaterial);
    this.paint.name = 'Deck lane lines';this.paint.receiveShadow = true;this.group.add(this.paint);
    scene?.add(this.group);
    this.groundAt = groundAt;this.waterAt = waterAt;this.roads = [];this.parts = [];this.prepared = new WeakMap();
    this.cells = new Map();this.largeTriangles = [];this.features = [];
    this.status = { surfaces: 0, triangles: 0, rejectedFeatures: 0, approaches: 0, piers: 0, parapetMetres: 0 };
  }

  setFeatures(features = []) {
    if (this.disposed) return;
    const unique = new Map();
    for (const feature of features) if (!unique.has(feature?.id)) unique.set(feature?.id, feature);
    const source = [...unique.values()];
    if (source.length === this.features.length && source.every((feature, i) => feature === this.features[i])) return;
    this.features = source;this._rebuild();
  }

  /** Lay out every deck, and the approaches that lead up to them, for drawing and for queries. */
  _rebuild() {
    const accepted = [];
    for (const feature of this.features) {
      let part = null;
      if (feature && typeof feature === 'object') {
        if (!this.prepared.has(feature)) this.prepared.set(feature, prepareFeature(feature));
        part = this.prepared.get(feature);
      }
      if (part) accepted.push(part);
    }
    this._index(accepted);
    const approaches = buildApproaches({ roads: this.roads, groundAt: this.groundAt, surfacesAt: (x, z, mode) => this.surfacesAt(x, z, mode),
      finish: ({ faces, rim, ...rest }) => finishPart({ ...rest, triangles: faces.flat(), boundary: new Set(rim.map(([a, b]) => edgeKey(a, b))) }) });
    if (approaches.length) this._index([...accepted, ...approaches]);
    this.status = { ...this.status, surfaces: accepted.length, approaches: approaches.length, rejectedFeatures: this.features.length - accepted.length };
    this.buildStructure();
  }

  _index(parts) {
    const paved = { positions: [], indices: [] }, turfed = { positions: [], indices: [] }, cells = new Map(), largeTriangles = [];
    for (const part of parts) {
      const { positions, indices } = part.cover === 'ground' ? turfed : paved, offset = positions.length / 3;
      for (const point of part.vertices) positions.push(point.x, point.y, point.z);
      for (const index of part.indices) indices.push(index + offset);
      for (const triangle of part.triangles) {
        const record = { ...triangle, id: part.id, sourceId: part.sourceId, subtype: part.subtype }, b = triangle.bounds;
        const minX = Math.floor(b.minX / CELL_SIZE), maxX = Math.floor(b.maxX / CELL_SIZE);
        const minZ = Math.floor(b.minZ / CELL_SIZE), maxZ = Math.floor(b.maxZ / CELL_SIZE);
        // Avoid unbounded grid allocation for a malformed or unusually long
        // triangle; the query still checks its exact bounds and barycentrics.
        if ((maxX - minX + 1) * (maxZ - minZ + 1) > 4096) { largeTriangles.push(record);continue; }
        for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(record);
        }
      }
    }
    const mesh = ({ positions, indices }) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      if (positions.length) geometry.computeBoundingSphere();
      return geometry;
    };
    const geometry = mesh(paved), lids = mesh(turfed), { indices } = paved;
    const surveyed = parts.filter(part => !part.approach);
    geometry.userData.sourceIds = surveyed.map(part => part.sourceId);
    geometry.userData.transportIds = surveyed.map(part => part.id);
    const previous = this.mesh.geometry;this.mesh.geometry = geometry;previous.dispose();
    const former = this.ground.geometry;this.ground.geometry = lids;former.dispose();
    this.cells = cells;this.largeTriangles = largeTriangles;this.parts = parts;
    this.partById = new Map(parts.map(part => [part.id, part]));
    this.status = { ...this.status, triangles: (indices.length + turfed.indices.length) / 3 };
  }

  /** The street centrelines near the decks: they say where lanes run and where piers may stand. */
  setRoads(roads = []) {
    if (this.disposed) return;
    this.roads = roads;this.structureDirty = true;
  }

  /** What the lids over cuttings are drawn with: the ground they carry. */
  setGroundMaterial(material) { if (!this.disposed) this.ground.material = material || this.material; }

  /** The ground beneath, for where a deck lands and how tall its piers are. */
  setGround(groundAt, waterAt = this.waterAt) {
    if (this.disposed) return;
    this.groundAt = groundAt;this.waterAt = waterAt;this.structureDirty = true;
  }

  /** Rebuild what stands around the decks if the roads or the ground have changed since. */
  refresh() { if (this.structureDirty) this._rebuild(); }

  buildStructure() {
    if (this.disposed) return;
    this.structureDirty = false;
    const built = buildDeckStructure(this.parts, {
      roads: this.roads, groundAt: this.groundAt, waterAt: this.waterAt,
      surfacesAt: (x, z, mode) => this.surfacesAt(x, z, mode), deckFor: (x, z, level) => this.deckFor(x, z, level), partOf: id => this.partById?.get(id),
    });
    const swap = (mesh, geometry) => { const previous = mesh.geometry;mesh.geometry = geometry;previous.dispose(); };
    swap(this.structure, built.structure);swap(this.paint, built.paint);
    this.status = { ...this.status, piers: built.piers, parapetMetres: Math.round(built.parapetMetres) };
  }

  /** Every deck over a point, lowest first: one surface for each structure. */
  surfacesAt(x, z, mode = 'walk') {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(z)) return [];
    const found = new Map();
    const candidates = this.cells.get(`${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`) || [];
    for (const list of [candidates, this.largeTriangles]) for (const triangle of list) {
      if (mode === 'drive' && triangle.subtype === 'pedestrian bridge') continue;
      const { a, b, c, bounds } = triangle;
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || found.has(triangle.id)) continue;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
      const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator, wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) < -1e-7) continue;
      found.set(triangle.id, { elevation: wa * a.y + wb * b.y + wc * c.y, triangle });
    }
    return [...found.values()].sort((p, q) => p.elevation - q.elevation);
  }

  /**
   * The deck that carries a road at `level`, the city's code for how high a
   * street runs: 13 is the ground and each step of four is one level up.
   */
  deckFor(x, z, level) {
    const decks = this.surfacesAt(x, z, 'drive');
    if (!decks.length) return null;
    const rank = Math.round(((Number.isFinite(level) ? level : GRADE_LEVEL) - GRADE_LEVEL) / LEVEL_STEP) - 1;
    return decks[Math.max(0, Math.min(decks.length - 1, rank))];
  }

  _result({ elevation, triangle }) {
    return { elevation, normal: { ...triangle.normal }, sourceId: triangle.sourceId,
      transportId: triangle.id, verticalDatum: 'NAVD88', units: 'meters',
      elevationMeaning: 'Interpolated from surveyed transport outline heights' };
  }

  sampleSurface(x, z, { referenceHeight, mode = 'walk', transportId = null, level } = {}) {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    // Traffic knows which road it is on, and the road knows its level.
    if (mode === 'drive' && level > GRADE_LEVEL + .5) {
      // A car already on the ground does not leap to a deck far above it.
      const deck = this.deckFor(x, z, level);
      if (deck && !(Number.isFinite(referenceHeight) && !transportId && deck.elevation - referenceHeight > 2.5)) return this._result(deck);
    }
    if (!Number.isFinite(referenceHeight)) return null;
    let best = null, distance = Infinity;
    for (const found of this.surfacesAt(x, z, mode)) {
      const delta = Math.abs(found.elevation - referenceHeight);
      // Enter only a nearly continuous measured approach. Once an actor is
      // already on a deck, retain that level through ordinary slope changes.
      // Prefer its current deck over another overlapping span to avoid level
      // changes caused only by which triangle happens to be closest this tick.
      const current = found.triangle.id === transportId, retaining = best?.triangle.id === transportId;
      if (delta > (current ? MAX_LEVEL_CHANGE : MAX_ENTRY_CHANGE)
        || best && (retaining && !current || retaining === current && delta >= distance)) continue;
      distance = delta;best = found;
    }
    return best && this._result(best);
  }

  getStatus() { return { ...this.status }; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;this.mesh.geometry.dispose();this.ground.geometry.dispose();this.structure.geometry.dispose();this.paint.geometry.dispose();
    if (this.ownsMaterial) this.material.dispose();
    if (this.ownsStructureMaterial) this.structureMaterial.dispose();
    if (this.ownsPaintMaterial) this.paintMaterial.dispose();
    this.scene?.remove(this.group);this.group.clear();this.cells.clear();this.largeTriangles = [];this.features = [];this.parts = [];
  }
}
