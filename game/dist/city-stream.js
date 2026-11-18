import * as THREE from './vendor/three.module.min.js';
import { mercatorCoefficients, atlasProjectionGLSL } from './imagery-projection.js';
import { chooseStyle, featureRandom, writeFacade, createFacadeScratch, applyFacadeShader, HEIGHT_UNIT, setLots, setLandmarks } from './facade.js';
import { createLots } from './lots.js';
import { createLandmarkBuildings } from './landmarks.js';

/**
 * The tax-lot grid and the landmark record that facades are chosen from, fetched once wherever buildings
 * are decoded: on the page and in each background decoder. Resolves when it
 * is in, or has failed, in which case facades go by size and place alone.
 */
let lotsLoading = null, lotGrid = null;
/** The tax-lot grid once lotsReady() has fetched it, or null. */
export const lots = () => lotGrid;
export function lotsReady() {
  if (typeof fetch !== 'function' || !/^https?:/.test(import.meta.url)) return Promise.resolve(false);
  const bytes = file => fetch(new URL(file, import.meta.url)).then(response => response.ok ? response.arrayBuffer() : null).catch(() => null);
  return lotsLoading ||= Promise.all([bytes('./lots.bin'), bytes('./landmark-buildings.bin')]).then(([lots, landmarks]) => { lotGrid = createLots(lots); setLots(lotGrid); setLandmarks(createLandmarkBuildings(landmarks)); return Boolean(lots || landmarks); });
}

const EARTH_RADIUS = 6371008.8;
const DEG = Math.PI / 180;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function projectCityPoint(lon, lat, origin) {
  return [EARTH_RADIUS * DEG * (lon - origin.lon) * Math.cos(origin.lat * DEG),
    -EARTH_RADIUS * DEG * (lat - origin.lat)];
}

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

/** Cancel shared edges of the actual ground triangles; retain holes and islands. */
export function groundRings(triangles) {
  const points = new Map(), edges = new Map();
  // I3S repeats vertices per face. This tolerance joins only sub-centimeter
  // conversion noise; returned coordinates remain the original measurements.
  const key = point => `${Math.round(point[0] * 200)},${Math.round(point[1] * 200)}`;
  for (const triangle of triangles) {
    for (let i = 0; i < 3; i++) {
      const a = key(triangle[i]), b = key(triangle[(i + 1) % 3]);
      if (a === b) continue;
      points.set(a, triangle[i]); points.set(b, triangle[(i + 1) % 3]);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edges.has(edge)) edges.get(edge).count++;
      else edges.set(edge, { a, b, count: 1 });
    }
  }
  const boundary = [...edges.values()].filter(edge => edge.count === 1);
  const neighbors = new Map();
  boundary.forEach((edge, index) => {
    for (const point of [edge.a, edge.b]) {
      if (!neighbors.has(point)) neighbors.set(point, []);
      neighbors.get(point).push(index);
    }
  });
  const used = new Set(), rings = [];
  for (let first = 0; first < boundary.length; first++) {
    if (used.has(first)) continue;
    const start = boundary[first].a, ring = [points.get(start)];
    let current = start, next = first, closed = false;
    while (next !== undefined && !used.has(next)) {
      used.add(next);
      const edge = boundary[next]; current = edge.a === current ? edge.b : edge.a;
      if (current === start) { closed = true; break; }
      ring.push(points.get(current));
      next = (neighbors.get(current) || []).find(index => !used.has(index));
    }
    if (!closed) return null;
    if (ring.length >= 3 && ringArea(ring) > 0.0001) rings.push(ring);
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  const classified = [], result = [];
  for (const ring of rings) {
    const parents = classified.filter(candidate => inRing(ring[0], candidate.ring));
    const parent = parents.at(-1), depth = (parent?.depth ?? -1) + 1;
    const record = { ring, depth, shape: null };
    if (depth % 2 === 0) {
      record.shape = { polygon: ring, holes: [] }; result.push(record.shape);
    } else {
      const exterior = [...parents].reverse().find(candidate => candidate.shape);
      if (!exterior) return null;
      exterior.shape.holes.push(ring);
    }
    classified.push(record);
  }
  return result;
}

function connectedBaseTriangles(positions, startFace, endFace) {
  const candidates = [], neighbors = new Map(), queue = [];
  // Survey bottoms are not always a single elevation. Follow their original
  // shallow triangles from the lowest vertices, excluding vertical walls and
  // disconnected elevated undersides. Winding alone cannot identify a base:
  // actual source meshes contain both upward and downward bottom triangles.
  const key = point => point.map(value => Math.round(value * 200)).join(',');
  for (let face = startFace; face <= endFace; face++) {
    const points = [0, 1, 2].map(k => {
      const offset = (face * 3 + k) * 3;
      return [positions[offset], positions[offset + 1], positions[offset + 2]];
    });
    const [a, b, c] = points;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 0.0002 || ny * ny < .81 * (nx * nx + ny * ny + nz * nz)) continue;
    const index = candidates.length, keys = points.map(key);
    candidates.push({ points, keys });
    for (const vertex of keys) {
      if (!neighbors.has(vertex)) neighbors.set(vertex, []);
      neighbors.get(vertex).push(index);
    }
    if (Math.min(a[1], b[1], c[1]) <= .025) queue.push(index);
  }
  const visited = new Set(), triangles = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    if (visited.has(index)) continue;
    visited.add(index);
    const { points, keys } = candidates[index];
    triangles.push(points.map(point => [point[0], point[2]]));
    for (const vertex of keys) for (const neighbor of neighbors.get(vertex)) if (!visited.has(neighbor)) queue.push(neighbor);
  }
  return triangles;
}

function wallBackedBaseTriangles(positions, startFace, endFace) {
  const faces = [], triangles = [];
  let capHeight = 0;
  // Some surveyed caps and wall feet disagree by about a meter (for example
  // feature 492527). A small height allowance alone would also accept a shelf.
  // Require the entire cap boundary, including courtyard holes, to be backed
  // by measured vertical walls just above it. Never project a roof or hull.
  for (let face = startFace; face <= endFace; face++) {
    const points = [0, 1, 2].map(k => {
      const offset = (face * 3 + k) * 3;
      return [positions[offset], positions[offset + 1], positions[offset + 2]];
    });
    const [a, b, c] = points;
    const u = b.map((value, i) => value - a[i]), v = c.map((value, i) => value - a[i]);
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const length = Math.hypot(nx, ny, nz);
    if (length < .0002) continue;
    const slope = Math.abs(ny) / length, high = Math.max(...points.map(point => point[1]));
    if (slope >= .9 && high <= 1.25) {
      triangles.push(points.map(point => [point[0], point[2]]));
      capHeight = Math.max(capHeight, high);
    }
    if (slope <= .01) faces.push(points);
  }
  if (!triangles.length) return [];
  const shapes = groundRings(triangles);
  if (!shapes?.length) return [];
  const sections = [], plane = capHeight + .1;
  for (const face of faces) {
    const points = [];
    for (let i = 0; i < 3; i++) {
      const a = face[i], b = face[(i + 1) % 3];
      if ((a[1] < plane && b[1] >= plane) || (b[1] < plane && a[1] >= plane)) {
        const t = (plane - a[1]) / (b[1] - a[1]);
        points.push([a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    if (points.length === 2) sections.push({ points, grounded: face.some(point => point[1] <= .025) });
  }
  for (const shape of shapes) {
    let groundBacked = false;
    for (const ring of [shape.polygon, ...shape.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), intervals = [];
        if (length <= .005) continue;
        for (const { points: [c, d], grounded } of sections) {
          const distance = point => Math.abs((point[0] - a[0]) * dz - (point[1] - a[1]) * dx) / length;
          if (distance(c) > .01 || distance(d) > .01) continue;
          const along = point => ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (length * length);
          const interval = [along(c), along(d)].sort((x, y) => x - y);
          if (interval[1] >= 0 && interval[0] <= 1) {
            intervals.push(interval);
            if (grounded && Math.min(1, interval[1]) - Math.max(0, interval[0]) > .01 / length) groundBacked = true;
          }
        }
        // Split source wall triangles and T-junctions must cover the whole edge,
        // not just its corners. Ten millimeters only tolerates coordinate noise.
        intervals.sort((a, b) => a[0] - b[0]);
        let covered = 0;
        for (const [low, high] of intervals) {
          if (low > covered + .01 / length) break;
          covered = Math.max(covered, high);
        }
        if (covered < 1 - .01 / length) return [];
      }
    }
    if (!groundBacked) return [];
  }
  return triangles;
}

/** Decode the public I3S geometry buffer 0 without proprietary codecs or keys. */
export function decodeI3S(buffer, node, origin, { collisions = true, heightAt = () => 0 } = {}) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error('NYC geometry header is truncated.');
  const vertexCount = view.getUint32(0, true), featureCount = view.getUint32(4, true);
  if (vertexCount % 3 || vertexCount > 5_000_000 || featureCount > vertexCount / 3) throw new Error('Invalid NYC geometry counts.');
  const featureOffset = 8 + vertexCount * 36;
  if (buffer.byteLength !== featureOffset + featureCount * 16) throw new Error('NYC geometry payload length does not match its header.');
  const source = new Float32Array(buffer, 8, vertexCount * 3);
  const positions = new Float32Array(vertexCount * 3), buildings = [], anchors = [];
  // Facade attributes: packed normals, each wall's bay coordinates, and the building type.
  const normals = new Int8Array(vertexCount * 4), facade = new Uint16Array(vertexCount * 4), style = new Uint8Array(vertexCount * 4);
  const features = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const [centerLon, centerLat, centerHeight] = node.center;
  const [centerX, centerZ] = projectCityPoint(centerLon, centerLat, origin);
  const scaleX = EARTH_RADIUS * DEG * Math.cos(origin.lat * DEG), scaleZ = -EARTH_RADIUS * DEG;
  for (let i = 0; i < vertexCount; i++) {
    const x = centerX + source[i * 3] * scaleX, z = centerZ + source[i * 3 + 1] * scaleZ;
    if (![x, z, source[i * 3 + 2]].every(Number.isFinite)) throw new Error('NYC geometry contains invalid coordinates.');
    positions[i * 3] = x; positions[i * 3 + 1] = source[i * 3 + 2]; positions[i * 3 + 2] = z;
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  let expectedFace = 0;
  for (let feature = 0; feature < featureCount; feature++) {
    const rangeOffset = featureOffset + featureCount * 8 + feature * 8;
    const startFace = view.getUint32(rangeOffset, true), endFace = view.getUint32(rangeOffset + 4, true);
    if (startFace !== expectedFace || endFace < startFace || endFace >= vertexCount / 3) throw new Error('NYC feature triangle ranges are invalid.');
    expectedFace = endFace + 1;
    const id = view.getBigUint64(featureOffset + feature * 8, true).toString();
    let low = Infinity, high = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = startFace * 3; i < (endFace + 1) * 3; i++) {
      const y = source[i * 3 + 2]; low = Math.min(low, y); high = Math.max(high, y);
      minX = Math.min(minX, positions[i * 3]);maxX = Math.max(maxX, positions[i * 3]);
      minZ = Math.min(minZ, positions[i * 3 + 2]);maxZ = Math.max(maxZ, positions[i * 3 + 2]);
    }
    const triangles = [];
    for (let face = startFace; face <= endFace; face++) {
      const vertex = face * 3;
      if (collisions && [0, 1, 2].every(k => source[(vertex + k) * 3 + 2] <= low + 0.025)) {
        const triangle = [0, 1, 2].map(k => [positions[(vertex + k) * 3], positions[(vertex + k) * 3 + 2]]);
        if (ringArea(triangle) > 0.0001) triangles.push(triangle);
      }
      for (let k = 0; k < 3; k++) positions[(vertex + k) * 3 + 1] -= low;
    }
    if (collisions) {
      // Preserve the usual exact low-plane extraction, but do not discard an
      // entire city tile when its measured ground has a small slope or step.
      if (!triangles.length) triangles.push(...connectedBaseTriangles(positions, startFace, endFace));
      if (!triangles.length) triangles.push(...wallBackedBaseTriangles(positions, startFace, endFace));
      if (!triangles.length) throw new Error(`NYC building ${id} has no surveyed ground surface.`);
      // Some source triangle soups have T-junctions. Keeping their original
      // ground triangles as separate colliders preserves the exact occupied
      // area without inventing a convex hull or filling a courtyard.
      const shapes = groundRings(triangles) || triangles.map(polygon => ({ polygon, holes: [] }));
      shapes.forEach((shape, part) => buildings.push({ id: `nyc:${id}:${part}`, featureId: id,
        ...shape, height: high - low, baseElevation: low + centerHeight, heightEstimated: false, heightSource: 'nyc-oti-2014-survey' }));
    }
    features.push({ id, start: startFace * 3, end: (endFace + 1) * 3, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, height: high - low });
  }
  if (expectedFace !== vertexCount / 3) throw new Error('NYC geometry includes triangles without a building identifier.');
  // A wall built against a neighbouring footprint is a windowless lot-line wall.
  const neighbours = collisions ? footprintIndex(buildings) : null;
  for (const { id, start, end, x, z, height } of features) {
    const [random, random2] = featureRandom(id);
    // Heights are still relative to each building's own base here.
    writeFacade(positions, start, end, { normals, facade, style, scratch: facadeScratch,
      seedByte: Math.floor(random2 * 256), heightByte: Math.min(255, Math.round(height / HEIGHT_UNIT)),
      choose: area => chooseStyle({ height, area, x, z, random, random2 }),
      isBlank: neighbours && ((px, pz) => neighbours(px, pz, id)) });
    // I3S heights use EGM96 while the terrain uses NAVD88. Preserve each
    // measured building's relative shape and anchor its foundation to the DEM
    // instead of silently combining incompatible absolute vertical datums.
    const measured = heightAt(x, z), elevation = Number.isFinite(measured) ? measured : 0;
    for (let i = start; i < end; i++) positions[i * 3 + 1] += elevation;
    anchors.push({ start, end, x, z, elevation, featureId: id });
  }
  return { positions, normals, facade, style, buildings, anchors, bounds, triangles: vertexCount / 3, featureCount };
}

const facadeScratch = createFacadeScratch();

/** Point-in-footprint lookup over a tile's buildings, excluding one feature. */
function footprintIndex(buildings) {
  const size = 16, grid = new Map(), boxes = [];
  for (const building of buildings) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of building.polygon) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const entry = { building, minX, maxX, minZ, maxZ }; boxes.push(entry);
    for (let gx = Math.floor(minX / size); gx <= Math.floor(maxX / size); gx++) for (let gz = Math.floor(minZ / size); gz <= Math.floor(maxZ / size); gz++) {
      const key = gx * 73856093 ^ gz * 19349663;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(entry);
    }
  }
  return (x, z, featureId) => {
    const candidates = grid.get(Math.floor(x / size) * 73856093 ^ Math.floor(z / size) * 19349663);
    if (!candidates) return false;
    const point = [x, z];
    for (const { building, minX, maxX, minZ, maxZ } of candidates) {
      if (building.featureId === featureId || x < minX || x > maxX || z < minZ || z > maxZ) continue;
      if (inRing(point, building.polygon) && !building.holes.some(hole => inRing(point, hole))) return true;
    }
    return false;
  };
}

function releaseArray() { this.array = null; }

/** Lift each decoded building from zero onto the measured ground beneath it. */
function anchorToTerrain(data, heightAt) {
  for (const anchor of data.anchors) {
    const measured = heightAt(anchor.x, anchor.z), elevation = Number.isFinite(measured) ? measured : 0;
    if (elevation) for (let i = anchor.start; i < anchor.end; i++) data.positions[i * 3 + 1] += elevation;
    anchor.elevation = elevation;
  }
  return data;
}

/**
 * A decoder that works in background threads where the browser has them.
 * Returns null elsewhere (Node, tests), and the stream then decodes inline.
 */
export function createTileDecoder({ workers = 2, WorkerClass = globalThis.Worker } = {}) {
  if (typeof WorkerClass !== 'function' || typeof document === 'undefined') return null;
  const pool = [], pending = new Map();
  let next = 0, serial = 0, broken = false;
  const fail = message => { broken = true; for (const { reject } of pending.values()) reject(new Error(message)); pending.clear(); };
  try {
    for (let i = 0; i < workers; i++) {
      const worker = new WorkerClass(new URL('./city-decode-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const task = pending.get(data.id); if (!task) return;
        pending.delete(data.id);
        if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
      };
      worker.onerror = () => fail('The background decoder stopped.');
      pool.push(worker);
    }
  } catch { return null; }
  return {
    get available() { return !broken; },
    decode(buffer, node, origin, collisions) {
      return new Promise((resolve, reject) => {
        const id = ++serial; pending.set(id, { resolve, reject });
        // The download is handed over, not copied.
        pool[next++ % pool.length].postMessage({ id, buffer, node: { center: node.center }, origin, collisions }, [buffer]);
      });
    },
  };
}
let sharedDecoder;

export function createCityStream(index, options = {}) {
  return new CityStream(index, options);
}

class CityStream {
  // Binding preserves the browser receiver when load() calls this.fetcher().
  constructor(index, { scene, onCollisionChange = () => {}, onStatus = () => {}, fetcher = globalThis.fetch.bind(globalThis),
    concurrency = 5, maxCacheBytes = 210 * 1024 * 1024, heightAt = () => 0, decoder } = {}) {
    // One pool of background decoders serves every stream on the page.
    this.decoder = decoder === undefined ? (sharedDecoder === undefined ? (sharedDecoder = createTileDecoder()) : sharedDecoder) : decoder;
    this.index = index; this.nodes = new Map(index.nodes.map(node => [node.id, node]));
    this.leaves = index.nodes.filter(node => !node.children.length && node.resource !== null);
    this.spatial = new Map();
    for (const node of this.leaves) {
      for (let x = Math.floor((node.x - node.radius) / 1000); x <= Math.floor((node.x + node.radius) / 1000); x++) {
        for (let z = Math.floor((node.z - node.radius) / 1000); z <= Math.floor((node.z + node.radius) / 1000); z++) {
          const key = `${x},${z}`;
          if (!this.spatial.has(key)) this.spatial.set(key, []);
          this.spatial.get(key).push(node);
        }
      }
    }
    this.scene = scene; this.onCollisionChange = onCollisionChange; this.onStatus = onStatus; this.fetcher = fetcher;
    this.concurrency = concurrency; this.maxCacheBytes = maxCacheBytes;
    this.heightAt = heightAt;this.terrainRevision = null;
    this.group = new THREE.Group(); this.group.name = 'Streamed official NYC survey'; scene?.add(this.group);
    this.cache = new Map(); this.requests = new Map(); this.queue = []; this.errors = new Map();
    this.active = 0; this.serial = 0; this.disposed = false; this.desired = new Set(); this.protected = new Set();
    this.collisionDesired = new Set(); this.preparedCollisions = new Set(); this.collisionRecords = new Map();
    this.focus = { x: 0, z: 0 }; this.lastSelection = -Infinity; this.lastOverview = null;
    this.material = new THREE.MeshStandardMaterial({ color: 0xbebfb9, roughness: 0.94, side: THREE.DoubleSide });
    this.material.name = 'Official citywide measured surfaces';
    this.orthoUniforms = { cityOrtho: { value: null }, cityOrthoBounds: { value: new THREE.Vector4() }, cityUseOrtho: { value: false },
      cityMercator: { value: new THREE.Vector4() }, cityUseMercator: { value: false },
      cityLocalOrtho: { value: null }, cityLocalOrthoBounds: { value: new THREE.Vector4() }, cityUseLocalOrtho: { value: false },
      cityLocalMercator: { value: new THREE.Vector4() }, cityUseLocalMercator: { value: false } };
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.orthoUniforms);
      shader.vertexShader = 'varying vec2 vCityXZ; varying float vCityRoof;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityXZ = position.xz; vCityRoof = abs(normal.y);');
      shader.fragmentShader = `${atlasProjectionGLSL}\n uniform sampler2D cityOrtho; uniform vec4 cityOrthoBounds; uniform bool cityUseOrtho;
        uniform vec4 cityMercator; uniform bool cityUseMercator;
        uniform sampler2D cityLocalOrtho; uniform vec4 cityLocalOrthoBounds; uniform bool cityUseLocalOrtho;
        uniform vec4 cityLocalMercator; uniform bool cityUseLocalMercator;
        varying vec2 vCityXZ; varying float vCityRoof;
        vec2 cityAtlasUV(vec4 bounds, vec4 mercator, bool useMercator) {
          vec2 uv = vec2((vCityXZ.x-bounds.x)/(bounds.y-bounds.x), (bounds.w-vCityXZ.y)/(bounds.w-bounds.z));
          if (useMercator) {
            uv.y = atlasNorthUV(vCityXZ.y, bounds, mercator);
          }
          return uv;
        }\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (vCityRoof > 0.65) {
          if (cityUseOrtho) {
            vec2 cityUV = cityAtlasUV(cityOrthoBounds, cityMercator, cityUseMercator);
            if (all(greaterThanEqual(cityUV,vec2(0.0))) && all(lessThanEqual(cityUV,vec2(1.0))))
              diffuseColor.rgb = texture2D(cityOrtho,cityUV).rgb;
          }
          if (cityUseLocalOrtho) {
            vec2 cityLocalUV = cityAtlasUV(cityLocalOrthoBounds, cityLocalMercator, cityUseLocalMercator);
            if (all(greaterThanEqual(cityLocalUV,vec2(0.0))) && all(lessThanEqual(cityLocalUV,vec2(1.0)))) {
              vec4 cityLocalSample = texture2D(cityLocalOrtho,cityLocalUV);
              // Transparent atlas cells have no loaded source image. Keep the
              // coarse roof there, including filtered edges of missing cells.
              if (cityLocalSample.a > 0.99) diffuseColor.rgb = cityLocalSample.rgb;
            }
          }
          // The photograph was taken under its own sun: its shadows are deep blue
          // and would be lit a second time here. Keep what is on the roof, drop
          // most of the baked light and colour cast.
          float cityRoofTone = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 cityRoofFlat = vec3(0.07 + 0.42 * smoothstep(0.02, 0.75, cityRoofTone)) * vec3(1.0, 0.985, 0.95);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.78, cityRoofFlat, 0.6);
        }`);
      // Walls are dressed as New York building types; see facade.js.
      applyFacadeShader(shader);
    };
  }

  setTerrainSampler(heightAt, revision) {
    this.heightAt = heightAt;
    if (this.terrainRevision === revision) return;
    this.terrainRevision = revision;
    for (const record of this.cache.values()) {
      const positions = record.mesh.geometry.attributes.position;
      let changed = false;
      for (const anchor of record.anchors) {
        const sampled = heightAt(anchor.x, anchor.z), elevation = Number.isFinite(sampled) ? sampled : 0;
        const delta = elevation - anchor.elevation;
        if (Math.abs(delta) < .0001) continue;
        for (let i = anchor.start; i < anchor.end; i++) positions.array[i * 3 + 1] += delta;
        anchor.elevation = elevation;changed = true;
      }
      if (changed) { positions.needsUpdate = true;record.mesh.geometry.computeBoundingSphere(); }
    }
  }

  setOrthophoto({ texture, bounds, mercator }) {
    if (!texture || !bounds || !(bounds.maxX > bounds.minX) || !(bounds.maxZ > bounds.minZ)) return;
    this.orthoUniforms.cityOrtho.value = texture;
    this.orthoUniforms.cityOrthoBounds.value.set(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
    this.orthoUniforms.cityUseOrtho.value = true;
    const coefficients = mercatorCoefficients(bounds, mercator);
    this.orthoUniforms.cityUseMercator.value = Boolean(coefficients);
    if (coefficients) this.orthoUniforms.cityMercator.value.set(...coefficients);
  }

  setLocalOrthophoto({ texture, bounds, mercator } = {}) {
    const usable = Boolean(texture && bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
      && bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ
      && (!mercator || [mercator.north, mercator.south, mercator.originLat, mercator.radius].every(Number.isFinite)
        && mercator.north > mercator.south && mercator.radius > 0));
    this.orthoUniforms.cityUseLocalOrtho.value = usable;
    if (!usable) return;
    // Uniforms update in place when the atlas moves. Recompiling the material
    // on every tile crossing would stall driving and is unnecessary.
    this.orthoUniforms.cityLocalOrtho.value = texture;
    this.orthoUniforms.cityLocalOrthoBounds.value.set(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
    const coefficients = mercatorCoefficients(bounds, mercator);
    this.orthoUniforms.cityUseLocalMercator.value = Boolean(coefficients);
    if (coefficients) this.orthoUniforms.cityLocalMercator.value.set(...coefficients);
  }

  nearby(point, radius) {
    const candidates = new Map();
    for (let x = Math.floor((point.x - radius) / 1000); x <= Math.floor((point.x + radius) / 1000); x++) {
      for (let z = Math.floor((point.z - radius) / 1000); z <= Math.floor((point.z + radius) / 1000); z++) {
        for (const node of this.spatial.get(`${x},${z}`) || []) candidates.set(node.id, node);
      }
    }
    return [...candidates.values()].filter(node => Math.hypot(node.x - point.x, node.z - point.z) <= radius + node.radius);
  }

  isReadyAt(x, z, radius = 4) {
    if (this.disposed) return false;
    // A scenery cache hit alone does not mean the simulation has its walls.
    // Publish the region first, then allow movement into its cached geometry.
    return this.nearby({ x, z }, radius).every(node => this.cache.has(node.id) && this.collisionRecords.get(node.id) === this.cache.get(node.id));
  }

  async prepareAt(point, radius = 80) {
    if (this.disposed) throw new Error('NYC city stream has been disposed.');
    const nodes = this.nearby(point, radius);
    nodes.forEach(node => this.protected.add(node.id));
    try {
      await Promise.all(nodes.map(node => this.request(node, -100000)));
      // Keep both the current neighborhood and the prepared destination until
      // update() observes the player's actual arrival (or failed-travel rollback).
      this.preparedCollisions = new Set(nodes.map(node => node.id));
      this.emitCollisions(); this.showSelection();
      return { ready: true, loadedChunks: nodes.length };
    } finally {
      nodes.forEach(node => this.protected.delete(node.id));
      this.emitCollisions();
    }
  }

  update(focus, camera, { overview = false } = {}) {
    if (this.disposed) return;
    this.focus = { x: focus.x, z: focus.z };
    const now = Date.now();
    if (now - this.lastSelection < 350 && overview === this.lastOverview) return;
    this.lastSelection = now; this.lastOverview = overview;
    const selected = [];
    const visit = node => {
      const distance = Math.hypot(node.x - focus.x, node.z - focus.z) - node.radius;
      if (!overview && distance > 2100) return;
      if (!overview && node.children.length && distance < 850) {
        node.children.forEach(id => visit(this.nodes.get(id))); return;
      }
      if (node.resource !== null) selected.push(node);
    };
    indexRoots(this.index).forEach(id => visit(this.nodes.get(id)));
    this.desired = new Set(selected.map(node => node.id));
    const physics = this.nearby(focus, overview ? 140 : 850);
    this.physicsDesired = new Set(physics.map(node => node.id));
    // Reuse already cached local walls in overview without requesting distant
    // scenery as physics. Completed travel preparations hand off here.
    this.collisionDesired = new Set(this.nearby(focus, 850).map(node => node.id));
    this.preparedCollisions.clear();
    for (const node of physics) {
      const priority = Math.hypot(node.x - focus.x, node.z - focus.z) - node.radius - 10000;
      this.request(node, priority).catch(() => {});
    }
    for (const node of selected) this.request(node, Math.hypot(node.x - focus.x, node.z - focus.z)).catch(() => {});
    this.queue = this.queue.filter(task => {
      if (this.desired.has(task.node.id) || this.physicsDesired.has(task.node.id) || this.protected.has(task.node.id)) return true;
      this.requests.delete(task.node.id); task.reject(new Error('NYC tile selection changed.')); return false;
    });
    this.emitCollisions(); this.showSelection(); this.evict(); this.emitStatus(); this.pump();
  }

  request(node, priority) {
    const cached = this.cache.get(node.id);
    if (cached) { cached.used = ++this.serial; return Promise.resolve(cached); }
    if (this.requests.has(node.id)) {
      const pending = this.requests.get(node.id);
      // Travel can require a tile that is already queued as distant scenery.
      // Promote that same request rather than leaving readiness behind it.
      if (priority < pending.priority) { pending.priority = priority; this.queue.sort((a, b) => a.priority - b.priority); }
      return pending.promise;
    }
    const error = this.errors.get(node.id);
    if (error && Date.now() - error.time < 5000) return Promise.reject(error.error);
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const task = { node, priority, promise, resolve, reject, controller: new AbortController() };
    this.requests.set(node.id, task); this.queue.push(task); this.queue.sort((a, b) => a.priority - b.priority);
    this.pump(); return promise;
  }

  pump() {
    while (!this.disposed && this.active < this.concurrency && this.queue.length) {
      const task = this.queue.shift(); this.active++;
      this.load(task).then(task.resolve, task.reject).finally(() => {
        this.active--; this.requests.delete(task.node.id); this.showSelection(); this.evict(); this.emitStatus(); this.pump();
      });
    }
  }

  async load(task) {
    const { node } = task;
    try {
      let data, error;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (this.disposed) throw new Error('NYC city stream has been disposed.');
        const controller = task.controller;
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await this.fetcher(`${this.index.source.service}/nodes/${node.resource}/geometries/0`, { signal: controller.signal });
          if (!response.ok) throw new Error(`NYC geometry service returned ${response.status}.`);
          const buffer = await response.arrayBuffer(), collisions = !node.children.length;
          if (this.decoder?.available) {
            // The copy stays here in case the background thread fails.
            let decoded = null;
            try { decoded = await this.decoder.decode(buffer.slice(0), node, this.index.origin, collisions); } catch (caught) { if (this.decoder.available) throw caught; }
            data = decoded ? anchorToTerrain(decoded, this.heightAt) : decodeI3S(buffer, node, this.index.origin, { collisions, heightAt: this.heightAt });
          } else data = decodeI3S(buffer, node, this.index.origin, { collisions, heightAt: this.heightAt });
          break;
        } catch (caught) {
          // An old attempt's timer must not abort its replacement controller
          // during backoff when a response fails just before the deadline.
          clearTimeout(timeout);
          error = caught; if (attempt === 2 || this.disposed) throw caught;
          task.controller = new AbortController(); await delay(300 * (attempt + 1));
        } finally { clearTimeout(timeout); }
      }
      if (!data) throw error;
      if (this.disposed) throw new Error('NYC city stream has been disposed.');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      // Flat face normals, packed to a byte per axis.
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 4, true));
      geometry.setAttribute('aFacade', new THREE.BufferAttribute(data.facade, 4));
      geometry.setAttribute('aStyle', new THREE.BufferAttribute(data.style, 4, true));
      // Positions stay in memory: foundations are re-anchored when finer
      // terrain arrives. The facade attributes are only ever read by the GPU.
      for (const name of ['normal', 'aFacade', 'aStyle']) geometry.attributes[name].onUpload(releaseArray);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.material); mesh.name = `NYC survey node ${node.resource}`;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
      this.group.add(mesh);
      const record = { node, mesh, buildings: data.buildings, anchors: data.anchors, bytes: data.positions.byteLength + data.normals.byteLength + data.facade.byteLength + data.style.byteLength + data.anchors.length * 64, used: ++this.serial, triangles: data.triangles };
      this.cache.set(node.id, record); this.errors.delete(node.id);
      if (!node.children.length) this.emitCollisions();
      return record;
    } catch (error) {
      if (!this.disposed) this.errors.set(node.id, { error, time: Date.now() });
      throw error;
    }
  }

  showSelection() {
    if (this.disposed) return;
    const wanted = new Set(this.desired);
    for (const id of this.desired) {
      let parent = this.nodes.get(id).parent;
      while (parent !== null && parent !== undefined) { wanted.add(parent); parent = this.nodes.get(parent).parent; }
    }
    // Resolve each branch as a complete set of children OR its cached ancestor.
    // A slow/failed child must never leave coarse and detailed surfaces drawing
    // over each other, and must not remove the branch's existing coverage.
    const resolve = (node, all = false) => {
      if (!all && !wanted.has(node.id)) return { ids: [], complete: true };
      if (this.cache.has(node.id) && (all || this.desired.has(node.id))) return { ids: [node.id], complete: true };
      if (!node.children.length) return { ids: [], complete: false };
      const children = node.children.map(id => resolve(this.nodes.get(id), all || this.desired.has(node.id)));
      const complete = children.every(child => child.complete);
      if (!complete && this.cache.has(node.id)) return { ids: [node.id], complete: true };
      return { ids: children.flatMap(child => child.ids), complete };
    };
    const visible = new Set(indexRoots(this.index).flatMap(id => resolve(this.nodes.get(id)).ids));
    for (const [id, record] of this.cache) record.mesh.visible = visible.has(id);
  }

  emitCollisions() {
    if (this.disposed) return;
    const records = new Map();
    for (const id of new Set([...this.collisionDesired, ...this.protected, ...this.preparedCollisions])) {
      const record = this.cache.get(id);
      if (record && !record.node.children.length) records.set(id, record);
    }
    if (records.size === this.collisionRecords.size && [...records].every(([id, record]) => this.collisionRecords.get(id) === record)) return;
    const unique = new Map();
    for (const record of records.values()) for (const building of record.buildings) unique.set(building.id, building);
    const previous = this.collisionRecords;
    this.collisionRecords = records;
    try {
      this.onCollisionChange([...unique.values()], { readyAtFocus: this.isReadyAt(this.focus.x, this.focus.z, 40), loadedChunks: this.cache.size, collisionChunks: records.size });
      // A callback failure can outlive its successfully downloaded geometry.
      // Once those cached walls publish successfully, that old error no longer
      // describes the current state and must not leave a permanent outage UI.
      for (const id of records.keys()) this.errors.delete(id);
    } catch (error) {
      this.collisionRecords = previous;
      throw error;
    }
  }

  evict() {
    let bytes = [...this.cache.values()].reduce((sum, record) => sum + record.bytes, 0), changed = false;
    const removable = [...this.cache.values()].filter(record => !record.mesh.visible && !this.desired.has(record.node.id)
      && !this.physicsDesired?.has(record.node.id) && !this.collisionDesired.has(record.node.id)
      && !this.protected.has(record.node.id) && !this.preparedCollisions.has(record.node.id)).sort((a, b) => a.used - b.used);
    for (const record of removable) {
      if (bytes <= this.maxCacheBytes && this.cache.size <= 140) break;
      this.cache.delete(record.node.id); this.group.remove(record.mesh); record.mesh.geometry.dispose(); bytes -= record.bytes; changed ||= record.buildings.length > 0;
    }
    if (changed) this.emitCollisions();
  }

  getStatus() {
    let triangles = 0, visibleChunks = 0, bytes = 0;
    for (const record of this.cache.values()) {
      bytes += record.bytes;
      if (record.mesh.visible) { visibleChunks++; triangles += record.triangles; }
    }
    const relevantError = [...this.errors].find(([id]) => this.desired.has(id) || this.physicsDesired?.has(id));
    const readyAtFocus = this.isReadyAt(this.focus.x, this.focus.z, 40);
    return { loading: this.active + this.queue.length, loadedChunks: this.cache.size, cachedChunks: this.cache.size,
      visibleChunks, triangles, cacheBytes: bytes, collisionChunks: this.collisionRecords.size, ready: readyAtFocus, readyAtFocus,
      error: relevantError ? relevantError[1].error.message : null };
  }

  emitStatus() { if (!this.disposed) this.onStatus(this.getStatus()); }

  dispose() {
    this.disposed = true;
    for (const task of this.requests.values()) { task.controller.abort(); task.reject(new Error('NYC city stream has been disposed.')); }
    this.queue.length = 0; this.requests.clear();
    for (const record of this.cache.values()) record.mesh.geometry.dispose();
    this.cache.clear(); this.collisionRecords.clear(); this.preparedCollisions.clear(); this.material.dispose(); this.scene?.remove(this.group); this.group.clear();
  }
}

function indexRoots(index) { return index.roots || index.nodes.find(node => node.id === index.root).children; }
