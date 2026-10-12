import * as THREE from './vendor/three.module.min.js';

const DECK_TYPES = new Set(['bridge', 'overpass', 'pedestrian bridge']);
const CELL_SIZE = 64;
const MAX_LEVEL_CHANGE = 1.5;

function prepareFeature(feature) {
  if (!feature || feature.kind !== 'transport' || !DECK_TYPES.has(feature.subtype)
    || feature.elevationStatus !== 'surveyed' || feature.elevationUnits !== 'meters'
    || feature.verticalDatum !== 'NAVD88' || typeof feature.id !== 'string' || !feature.id
    || typeof feature.sourceId !== 'string' || !feature.sourceId || !Array.isArray(feature.holes)
    || !Array.isArray(feature.elevations?.holes) || feature.holes.length !== feature.elevations.holes.length) return null;
  const rings = [feature.polygon, ...feature.holes], heights = [feature.elevations.polygon, ...feature.elevations.holes];
  const vertices = [], contours = [];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r], elevations = heights[r];
    if (!Array.isArray(ring) || ring.length < 3 || !Array.isArray(elevations) || ring.length !== elevations.length) return null;
    const contour = [];
    for (let i = 0; i < ring.length; i++) {
      const point = ring[i], elevation = elevations[i];
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || !Number.isFinite(elevation)) return null;
      // Match the actual GPU vertices when sampling. The source outline is
      // unmodified apart from the same float conversion needed by WebGL.
      const vertex = { x: Math.fround(point[0]), y: Math.fround(elevation), z: Math.fround(point[1]) };
      if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) return null;
      contour.push(new THREE.Vector2(vertex.x, vertex.z));vertices.push(vertex);
    }
    // Earcut removes a repeated closing coordinate. Remove its aligned height
    // too, so every index still selects the corresponding surveyed Z value.
    if (contour.length > 1 && contour[0].equals(contour.at(-1))) {
      if (vertices.at(-1).y !== vertices[vertices.length - contour.length].y) return null;
      contour.pop();vertices.pop();
    }
    if (contour.length < 3) return null;
    contours.push(contour);
  }
  const faces = THREE.ShapeUtils.triangulateShape(contours[0], contours.slice(1)), triangles = [], indices = [];
  for (const face of faces) {
    let [a, b, c] = face.map(index => vertices[index]);
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) < .000001) continue;
    const order = cross > 0 ? [face[0], face[2], face[1]] : face;
    [a, b, c] = order.map(index => vertices[index]);
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
    indices.push(...order);
    triangles.push({ a, b, c, normal: { x: nx / length, y: ny / length, z: nz / length },
      bounds: { minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z) } });
  }
  if (!triangles.length) return null;
  return { id: feature.id, sourceId: feature.sourceId, subtype: feature.subtype, vertices, indices, triangles };
}

/** Surveyed outline elevations provide an interpolated deck, not its underside
 * or structural thickness. Queries use the same triangles as the visible mesh. */
export class TransportSurfaces {
  constructor({ scene, material } = {}) {
    this.scene = scene;this.disposed = false;this.ownsMaterial = !material;
    this.material = material || new THREE.MeshStandardMaterial({ color: 0x8a8982, roughness: 1, side: THREE.DoubleSide });
    this.group = new THREE.Group();this.group.name = 'NYC measured transport decks';
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = 'Surveyed bridge outlines with interpolated deck heights';
    this.mesh.castShadow = true;this.mesh.receiveShadow = true;this.group.add(this.mesh);scene?.add(this.group);
    this.cells = new Map();this.largeTriangles = [];this.features = [];this.status = { surfaces: 0, triangles: 0, rejectedFeatures: 0 };
  }

  setFeatures(features = []) {
    if (this.disposed) return;
    const unique = new Map();
    for (const feature of features) if (!unique.has(feature?.id)) unique.set(feature?.id, feature);
    const source = [...unique.values()];
    if (source.length === this.features.length && source.every((feature, i) => feature === this.features[i])) return;
    const accepted = [], positions = [], indices = [], cells = new Map(), largeTriangles = [];
    for (const feature of source) {
      const part = prepareFeature(feature);
      if (!part) continue;
      accepted.push(part);
      const offset = positions.length / 3;
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Shared street materials require a UV attribute, but their imagery shader
    // samples exact world coordinates, so no fabricated deck texture is baked.
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    if (positions.length) geometry.computeBoundingSphere();
    geometry.userData.sourceIds = accepted.map(feature => feature.sourceId);
    geometry.userData.transportIds = accepted.map(feature => feature.id);
    const previous = this.mesh.geometry;this.mesh.geometry = geometry;previous.dispose();
    this.cells = cells;this.largeTriangles = largeTriangles;this.features = source;
    this.status = { surfaces: accepted.length, triangles: indices.length / 3, rejectedFeatures: source.length - accepted.length };
  }

  sampleSurface(x, z, { referenceHeight, mode = 'walk' } = {}) {
    if (this.disposed || ![x, z, referenceHeight].every(Number.isFinite)) return null;
    const candidates = [...(this.cells.get(`${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`) || []), ...this.largeTriangles];
    let best = null, distance = Infinity;
    for (const triangle of candidates) {
      if (mode === 'drive' && triangle.subtype === 'pedestrian bridge') continue;
      const { a, b, c, bounds } = triangle;
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
      const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator, wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) < -1e-7) continue;
      const elevation = wa * a.y + wb * b.y + wc * c.y, delta = Math.abs(elevation - referenceHeight);
      // An overhead bridge is not a teleport target. The previous actor height
      // admits a nearby ramp/deck level while retaining the road below it.
      if (delta > MAX_LEVEL_CHANGE || delta >= distance) continue;
      distance = delta;
      best = { elevation, normal: { ...triangle.normal }, sourceId: triangle.sourceId,
        transportId: triangle.id, verticalDatum: 'NAVD88', units: 'meters',
        elevationMeaning: 'Interpolated from surveyed transport outline heights' };
    }
    return best;
  }

  getStatus() { return { ...this.status }; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;this.mesh.geometry.dispose();
    if (this.ownsMaterial) this.material.dispose();
    this.scene?.remove(this.group);this.group.clear();this.cells.clear();this.largeTriangles = [];this.features = [];
  }
}
