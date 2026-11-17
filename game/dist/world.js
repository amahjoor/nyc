import { updateRide } from './vehicle-presentation.js';
import { buildCar, createCarMaterial, createLampMaterial, wheelGeometry, WHEEL } from './vehicle-model.js';
import * as THREE from './vendor/three.module.min.js';

// The city mesh comes from NYC's measured 2014 CityGML survey. Only the
// documented vertical flattening is applied; no buildings are synthesized.
const TAU = Math.PI * 2;
const dummy = new THREE.Object3D();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const color = new THREE.Color();

// Every static primitive is transformed and merged once, grouped by material.
// Unlike independent meshes per window this remains a few dozen draw calls.
class Batches {
  constructor(tileSize = 0) { this.items = new Map(); this.tileSize = tileSize; }
  add(geometry, material, matrix = null, tint = 0xffffff) {
    let key = material;
    if (this.tileSize) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const center = geometry.boundingSphere.center.clone();
      if (matrix) center.applyMatrix4(matrix);
      key = `${material.uuid}:${Math.floor(center.x / this.tileSize)}:${Math.floor(center.z / this.tileSize)}`;
    }
    if (!this.items.has(key)) this.items.set(key, { material, chunks: [] });
    this.items.get(key).chunks.push({ geometry, matrix: matrix?.clone(), tint });
  }
  box(material, x, y, z, sx, sy, sz, tint = 0xffffff, angle = 0) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, angle, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    this.add(unitBox, material, dummy.matrix, tint);
  }
  finish(group, castShadow = true) {
    const p = new THREE.Vector3(), n = new THREE.Vector3(), normal = new THREE.Matrix3();
    for (const { material, chunks } of this.items.values()) {
      const count = chunks.reduce((sum, chunk) => sum + chunk.geometry.attributes.position.count, 0);
      const indexCount = chunks.reduce((sum, chunk) => sum + (chunk.geometry.index?.count ?? chunk.geometry.attributes.position.count), 0);
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3), uvs = material.map ? new Float32Array(count * 2) : null;
      const indices = new Uint32Array(indexCount);
      let offset = 0, indexOffset = 0;
      for (const { geometry, matrix, tint } of chunks) {
        color.set(tint);
        if (matrix) normal.getNormalMatrix(matrix);
        const gPos = geometry.attributes.position, gNormal = geometry.attributes.normal, uv = geometry.attributes.uv;
        const gCount = gPos.count;
        const gIndices = geometry.index?.count ?? gCount;
        for (let j = 0; j < gIndices; j++) indices[indexOffset++] = offset + (geometry.index ? geometry.index.getX(j) : j);
        for (let k = 0; k < gCount; k++) {
          p.fromBufferAttribute(gPos, k);
          n.set(0, 1, 0); if (gNormal) n.fromBufferAttribute(gNormal, k);
          if (matrix) { p.applyMatrix4(matrix); n.applyMatrix3(normal).normalize(); }
          p.toArray(positions, offset * 3); n.toArray(normals, offset * 3);
          color.toArray(colors, offset * 3);
          if (uv && uvs) { uvs[offset * 2] = uv.getX(k); uvs[offset * 2 + 1] = uv.getY(k); }
          offset++;
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow; mesh.receiveShadow = true;
      mesh.userData.worldTile = this.tileSize > 0;
      group.add(mesh);
    }
    this.items.clear();
  }
}



function quad(points, uv = [0, 0, 1, 0, 1, 1, 0, 1]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function surveyGeometry(building, indices, orthoBounds) {
  // Flat triangle normals preserve surveyed roof ridges and wall corners.
  // CityGML contains both upward and downward roof polygons, so the material
  // is double-sided rather than silently rewriting authoritative indices.
  const positions = new Float32Array(indices.length * 3);
  const uv = orthoBounds ? new Float32Array(indices.length * 2) : null;
  for (let i = 0; i < indices.length; i++) {
    const offset = indices[i] * 3;
    const x = building.vertices[offset], z = building.vertices[offset + 2];
    positions[i * 3] = x;
    positions[i * 3 + 1] = building.vertices[offset + 1] - building.baseElevation;
    positions[i * 3 + 2] = z;
    if (uv) {
      // Aerial image top is north (-Z); texture V increases toward the top.
      uv[i * 2] = (x - orthoBounds.minX) / (orthoBounds.maxX - orthoBounds.minX);
      uv[i * 2 + 1] = (orthoBounds.maxZ - z) / (orthoBounds.maxZ - orthoBounds.minZ);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function nearestNamedStreet(city, name, x, z) {
  let best;
  for (const road of city.roads) {
    if (road.name !== name) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2));
      const px = a[0] + t * dx, pz = a[1] + t * dz;
      const distance = Math.hypot(px - x, pz - z);
      if (!best || distance < best.distance) best = { x: px, z: pz, tx: dx / Math.sqrt(length2), tz: dz / Math.sqrt(length2), distance };
    }
  }
  return best;
}

function facadePlanes(city, building, profile) {
  const points = [];
  for (let i = 0; i < building.vertices.length; i += 3) points.push([building.vertices[i], building.vertices[i + 2]]);
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const z = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const planes = [];
  for (const [street, bays] of Object.entries(profile.bays || {})) {
    const road = nearestNamedStreet(city, street, x, z);
    if (!road || road.distance > 80) continue;
    let nx = -road.tz, nz = road.tx;
    if ((road.x - x) * nx + (road.z - z) * nz < 0) { nx = -nx; nz = -nz; }
    const tx = -nz, tz = nx;
    const projections = points.map(p => p[0] * tx + p[1] * tz);
    const fronts = points.map(p => p[0] * nx + p[1] * nz);
    planes.push({ street, bays, nx, nz, tx, tz, front: Math.max(...fronts), min: Math.min(...projections), max: Math.max(...projections) });
  }
  return planes;
}

function principalWallHeight(building) {
  // A water tank or roof enclosure must not stretch five floors of windows
  // to its height. Weight observed wall-top levels by actual triangle area.
  const heights = new Map(), v = building.vertices, indices = building.surfaces.wall || [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ax = v[b] - v[a], ay = v[b + 1] - v[a + 1], az = v[b + 2] - v[a + 2];
    const bx = v[c] - v[a], by = v[c + 1] - v[a + 1], bz = v[c + 2] - v[a + 2];
    const weight = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    const h = Math.max(v[a + 1], v[b + 1], v[c + 1]) - building.baseElevation;
    const level = Math.round(h * 10) / 10;
    if (level > 3) heights.set(level, (heights.get(level) || 0) + weight);
  }
  return [...heights].sort((a, b) => b[1] - a[1])[0]?.[0] || building.maxElevation - building.baseElevation;
}

const observedStyles = {
  haughwout: { wall: '#cbc9bb', trim: '#e5e1d2', shade: '#868981', glass: '#303c3e', arch: 'round', columns: 'paired', balustrade: true },
  'king-greene': { wall: '#d5d0b9', trim: '#e7e1cb', shade: '#939489', glass: '#354042', arch: 'shallow', columns: 'paired' },
  'judd-spring': { wall: '#909793', trim: '#b2b7b0', shade: '#646e6d', glass: '#344349', arch: 'shallow', columns: 'slim', broad: true },
  gunther: { wall: '#d3cebc', trim: '#e4deca', shade: '#909185', glass: '#303937', arch: 'shallow', columns: 'slim', balustrade: true },
  'queen-greene': { wall: '#939994', trim: '#b7bbb0', shade: '#606965', glass: '#344343', arch: 'shallow', columns: 'paired' },
};

function observedFacadeTexture(profile) {
  // This is an interpretation of the cited photos, not a photographic facade
  // capture. It uses the documented floor/bay counts only on the matched BIN.
  const style = observedStyles[profile.id];
  const stories = profile.id === 'queen-greene' ? 5 : profile.stories;
  const canvas = document.createElement('canvas');
  const w = 192, floorHeight = 192;
  canvas.width = w; canvas.height = stories * floorHeight;
  const c = canvas.getContext('2d');
  c.fillStyle = style.wall; c.fillRect(0, 0, w, canvas.height);
  for (let floor = 0; floor < stories; floor++) {
    const y = (stories - floor - 1) * floorHeight;
    const ground = floor === 0;
    const margin = style.broad ? 16 : 32;
    const left = ground ? 22 : margin, right = w - left;
    const top = y + (ground ? 19 : 26), bottom = y + floorHeight - (ground ? 12 : 36);
    const arch = !ground && style.arch === 'round' ? (right - left) / 2 : 7;
    c.fillStyle = style.shade; c.fillRect(left - 6, top - 5, right - left + 12, bottom - top + 11);
    c.fillStyle = style.trim; c.fillRect(left - 4, top - 7, right - left + 8, bottom - top + 8);
    c.beginPath(); c.moveTo(left, bottom); c.lineTo(left, top + arch);
    if (!ground && style.arch === 'round') c.arc(w / 2, top + arch, arch, Math.PI, 0);
    else { c.quadraticCurveTo(left, top, left + 7, top); c.lineTo(right - 7, top); c.quadraticCurveTo(right, top, right, top + arch); }
    c.lineTo(right, bottom); c.closePath(); c.fillStyle = style.glass; c.fill();
    c.fillStyle = style.trim;
    c.fillRect(w / 2 - 1.4, top + arch + 2, 2.8, bottom - top - arch - 2);
    c.fillRect(left, top + (bottom - top) * 0.58, right - left, 2.7);
    c.fillStyle = style.shade; c.fillRect(0, y + floorHeight - 10, w, 10);
    c.fillStyle = style.trim; c.fillRect(0, y + floorHeight - 15, w, 7);
    for (const x of [5, w - 10]) {
      c.fillStyle = style.shade; c.fillRect(x - 2, y + 10, 7, floorHeight - 24);
      c.fillStyle = style.trim; c.fillRect(x, y + 10, style.columns === 'paired' ? 6 : 3, floorHeight - 24);
      c.fillRect(x - 3, y + 12, 12, 5);
      if (style.columns === 'paired') c.fillRect(x + 9, y + 16, 4, floorHeight - 33);
    }
    if (style.balustrade && floor > 0 && (profile.id !== 'gunther' || floor === 1)) {
      c.fillStyle = style.trim;
      c.fillRect(left - 3, bottom + 9, right - left + 6, 4);
      for (let x = left; x < right; x += 11) c.fillRect(x, bottom + 11, 3, 12);
    }
  }
  c.fillStyle = style.trim; c.fillRect(0, 0, w, 11);
  c.fillStyle = style.shade; c.fillRect(0, 11, w, 4);
  for (let x = 10; x < w; x += 24) { c.fillStyle = style.trim; c.fillRect(x, 13, 9, 11); }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 8;
  return map;
}

function addObservedWalls(batch, building, profile, city, neutral, interpreted, report) {
  const planes = facadePlanes(city, building, profile);
  const eave = principalWallHeight(building);
  const indices = building.surfaces.wall || [], v = building.vertices;
  const plain = [], dressed = [], uv = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = indices.slice(i, i + 3);
    const p = tri.map(index => [v[index * 3], v[index * 3 + 1] - building.baseElevation, v[index * 3 + 2]]);
    const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const nx = ay * bz - az * by, nz = ax * by - ay * bx, magnitude = Math.hypot(nx, nz) || 1;
    const height = Math.min(...p.map(q => q[1]));
    const candidates = planes.filter(plane => plane.front - (cx * plane.nx + cz * plane.nz) < 2.6 && Math.abs((nx * plane.nx + nz * plane.nz) / magnitude) > 0.72 && height < eave - 0.3);
    candidates.sort((a, b) => Math.abs(nx * b.nx + nz * b.nz) - Math.abs(nx * a.nx + nz * a.nz));
    const plane = candidates[0];
    if (!plane) { plain.push(...tri); continue; }
    dressed.push(...tri);
    for (const point of p) uv.push((point[0] * plane.tx + point[2] * plane.tz - plane.min) / (plane.max - plane.min) * plane.bays, point[1] / eave);
  }
  if (plain.length) batch.add(surveyGeometry(building, plain), neutral, null, 0xffffff);
  if (dressed.length) {
    const geometry = surveyGeometry(building, dressed);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    batch.add(geometry, interpreted, null, 0xffffff);
    report.push({ bin: building.bin, surveyId: building.id, profileId: profile.id, triangles: dressed.length / 3, streets: planes.map(p => p.street), reference: profile.countSource, interpretation: 'Observed colors and documented window counts; not a photographic capture.' });
  }
}

export function createWorld(city, survey, { orthoTexture, orthoBounds, profiles = [] } = {}) {
  if (!survey?.buildings?.length) throw new Error('Official NYC survey geometry is required. No generated city fallback is provided.');
  if (city.origin && survey.origin && (Math.abs(city.origin.lat - survey.origin.lat) > 0.000001 || Math.abs(city.origin.lon - survey.origin.lon) > 0.000001)) throw new Error('City and survey coordinate origins do not match.');
  if (orthoTexture && (!orthoBounds || !(orthoBounds.maxX > orthoBounds.minX) || !(orthoBounds.maxZ > orthoBounds.minZ))) throw new Error('Orthophoto texture requires valid local meter bounds.');
  const profileList = Array.isArray(profiles) ? profiles : profiles.profiles || [];
  const group = new THREE.Group(); group.name = 'NYC OTI surveyed SoHo / 2014';
  const batch = new Batches(110);
  const wall = new THREE.MeshStandardMaterial({ color: 0xbebfb9, vertexColors: true, roughness: 0.91, side: THREE.DoubleSide });
  wall.name = 'Untextured survey wall';
  const roof = new THREE.MeshStandardMaterial({ color: orthoTexture ? 0xffffff : 0x858e89, map: orthoTexture || null, vertexColors: true, roughness: 0.94, side: THREE.DoubleSide });
  roof.name = orthoTexture ? 'Survey roof / official orthophoto' : 'Untextured survey roof';
  const uncoveredRoof = new THREE.MeshStandardMaterial({ color: 0x858e89, vertexColors: true, roughness: 0.94, side: THREE.DoubleSide });
  uncoveredRoof.name = 'Survey roof / outside imagery coverage';
  const ground = new THREE.MeshStandardMaterial({ color: orthoTexture ? 0xffffff : 0x858881, map: orthoTexture || null, roughness: 1, side: THREE.DoubleSide });
  ground.name = orthoTexture ? 'Official NYC orthophoto ground' : 'Neutral ground / imagery unavailable';
  const reports = [];
  const materials = new Map();
  const stats = { surveyBuildings: survey.buildings.length, playableBuildings: 0, surveyTriangles: 0, facadeProfiles: reports, source: survey.source, orthophoto: Boolean(orthoTexture), imageryUncoveredBuildings: 0 };
  for (const building of survey.buildings) {
    if (building.inPlayableArea) stats.playableBuildings++;
    const profile = profileList.find(p => observedStyles[p.id] && ((p.surveyId && p.surveyId === building.id) || (p.bin && String(p.bin) === String(building.bin))));
    if (profile && building.surfaces.wall?.length) {
      if (!materials.has(profile.id)) {
        const material = new THREE.MeshStandardMaterial({ map: observedFacadeTexture(profile), vertexColors: true, color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
        material.name = `${profile.address} / referenced facade interpretation`;
        materials.set(profile.id, material);
      }
      addObservedWalls(batch, building, profile, city, wall, materials.get(profile.id), reports);
    } else if (building.surfaces.wall?.length) batch.add(surveyGeometry(building, building.surfaces.wall), wall);
    let covered = Boolean(orthoTexture);
    if (covered) for (let i = 0; i < building.vertices.length; i += 3) {
      const x = building.vertices[i], z = building.vertices[i + 2];
      if (x < orthoBounds.minX || x > orthoBounds.maxX || z < orthoBounds.minZ || z > orthoBounds.maxZ) { covered = false; break; }
    }
    // Clamping would smear unrelated border pixels onto an uncovered roof.
    // A neutral surface explicitly preserves the absence of image evidence.
    if (orthoTexture && !covered) stats.imageryUncoveredBuildings++;
    for (const kind of ['roof', 'ground']) {
      const indices = building.surfaces[kind];
      if (indices?.length) batch.add(surveyGeometry(building, indices, covered ? orthoBounds : null), orthoTexture && !covered ? uncoveredRoof : roof);
    }
    stats.surveyTriangles += Object.values(building.surfaces).reduce((sum, indices) => sum + indices.length / 3, 0);
  }
  batch.finish(group);
  const bounds = orthoBounds || {
    minX: survey.bounds.minX - (survey.contextMarginMeters || 0), maxX: survey.bounds.maxX + (survey.contextMarginMeters || 0),
    minZ: survey.bounds.minZ - (survey.contextMarginMeters || 0), maxZ: survey.bounds.maxZ + (survey.contextMarginMeters || 0),
  };
  const groundGeometry = quad([[bounds.minX, -0.025, bounds.maxZ], [bounds.maxX, -0.025, bounds.maxZ], [bounds.maxX, -0.025, bounds.minZ], [bounds.minX, -0.025, bounds.minZ]]);
  const groundMesh = new THREE.Mesh(groundGeometry, ground);
  groundMesh.name = 'Georeferenced aerial image'; groundMesh.receiveShadow = true;
  groundGeometry.computeBoundingSphere(); group.add(groundMesh);
  group.userData.survey = stats;
  return {
    group,
    stats,
    update(time, focus) {
      if (!focus) return;
      for (const mesh of group.children) {
        const sphere = mesh.geometry.boundingSphere;
        mesh.visible = !mesh.userData.worldTile || Math.hypot(sphere.center.x - focus.x, sphere.center.z - focus.z) < 650 + sphere.radius;
      }
    },
  };
}

// Vehicles share materials; only wheels remain separate for steering/spin
// animation. All models face +Z and sit on the ground at y=0.
const carPaint = createCarMaterial(), carGlow = createLampMaterial();
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: .9 });
const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xa9afb0, metalness: .85, roughness: .32 });
const { tyre: wheelTyre, rim: wheelRim } = wheelGeometry();
const bodies = new Map();
const SHAPES = ['sedan', 'sedan', 'suv', 'suv', 'van'];
/** The colour of a boro taxi, as the simulation names it. */
export const GREEN_CAB = 0x74b541;

/** Lamps brighten after dark; 0 is daylight, 1 is night. Shared by every car. */
export function setVehicleLamps(night) { carGlow.emissiveIntensity = .55 + 2.6 * Math.max(0, Math.min(1, night)); }

/** Traffic varies in body style; a car keeps the one its identity picks, however it is drawn. */
export function carShape(type, seed) {
  if (type === 'taxi' || type === 'police') return 'sedan';
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return SHAPES[hash % SHAPES.length];
}

/**
 * Cars drawn together. However many there are, they are a handful of
 * instanced meshes: a body and lamps for each body style, tyres and wheels.
 * Each stands as the simulation has it, its wheels on their own patches of
 * road, but nothing turns: this is for cars at rest, and for cars too far off
 * for a turning wheel to be seen.
 */
function createCarSet({ name, label, capacity, lit, select }) {
  const group = new THREE.Group(); group.name = name;
  const paint = createCarMaterial({ instancedPaint: true }); paint.name = `${label} car paint, glass and trim`;
  // Traffic shows the lamps every moving car shows. Nobody leaves their lights on at the kerb.
  const lens = lit ? carGlow : createLampMaterial();
  if (!lit) { lens.name = `${label} car lamps`; lens.emissiveIntensity = .02; }
  const styles = new Map();
  const style = (key, type, shape, tone) => {
    const built = buildCar({ type, shape, paint: tone }), tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    built.body.setAttribute('aPaint', tint);
    const body = new THREE.InstancedMesh(built.body, paint, capacity); body.name = `${label} ${key} bodies`; body.castShadow = true; body.receiveShadow = true;
    const lamps = new THREE.InstancedMesh(built.lamps, lens, capacity); lamps.name = `${label} ${key} lamps`;
    styles.set(key, { body, lamps, tint, used: 0, painted: tone !== 0xffffff });
  };
  for (const shape of new Set(SHAPES)) style(shape, 'sedan', shape, 0xffffff);
  // A cab has a roof light and a band along its doors, so it is built in its own colour.
  if (lit) { style('cab', 'taxi', 'sedan', 0xf3ba31); style('boro cab', 'taxi', 'sedan', GREEN_CAB); }
  const tyres = new THREE.InstancedMesh(wheelTyre, tireMaterial, capacity * 4); tyres.name = `${label} car tyres`; tyres.castShadow = true;
  const rims = new THREE.InstancedMesh(wheelRim, hubMaterial, capacity * 4); rims.name = `${label} car wheels`;
  const meshes = [...[...styles.values()].flatMap(item => [item.body, item.lamps]), tyres, rims];
  // The cars surround the player, so the set as a whole is always in view.
  for (const mesh of meshes) { mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); }
  const FIELDS = 11, seen = new Float64Array(capacity * FIELDS), pose = new Float64Array(FIELDS);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, 'YXZ'), one = new THREE.Vector3(1, 1, 1), color = new THREE.Color();
  const ids = [];
  let count = -1;
  const styleOf = car => {
    if (lit && car.type === 'taxi') return styles.get(color.set(car.color || '#f3ba31').getHex() === GREEN_CAB ? 'boro cab' : 'cab');
    return styles.get(carShape(car.type, car.id));
  };
  return {
    group,
    get count() { return Math.max(0, count); },
    /** Redraws only when a car has come, gone, moved or been re-seated on the ground. */
    update(cars = []) {
      let n = 0, changed = false;
      for (const car of cars) {
        if (!select(car) || n >= capacity) continue;
        const wheels = car.wheelHeights || [];
        pose[0] = car.x; pose[1] = car.y || 0; pose[2] = car.z; pose[3] = car.angle || 0; pose[4] = car.pitch || 0; pose[5] = car.roll || 0;
        for (let i = 0; i < 4; i++) pose[6 + i] = Number.isFinite(wheels[i]) ? wheels[i] : pose[1];
        pose[10] = ids[n] === car.id ? 0 : 1;
        for (let i = 0; i < FIELDS; i++) if (seen[n * FIELDS + i] !== pose[i]) { changed = true; seen[n * FIELDS + i] = pose[i]; }
        seen[n * FIELDS + 10] = 0; ids[n] = car.id; n++;
      }
      if (n !== count) changed = true;
      if (!changed) return false;
      count = n; ids.length = n;
      for (const item of styles.values()) item.used = 0;
      let wheel = 0, slot = 0;
      for (const car of cars) {
        if (!select(car) || slot >= n) continue;
        const o = slot++ * FIELDS, x = seen[o], y = seen[o + 1], z = seen[o + 2], angle = seen[o + 3];
        const item = styleOf(car), i = item.used++;
        // The same pose a driven car takes at rest: yaw at the root, tilt on the chassis.
        position.set(x, y + .025, z); euler.set(seen[o + 4], angle, seen[o + 5], 'YXZ'); quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, one); item.body.setMatrixAt(i, matrix); item.lamps.setMatrixAt(i, matrix);
        if (item.painted) item.tint.setXYZ(i, 1, 1, 1);
        else { color.set(car.color || '#8f969b'); item.tint.setXYZ(i, color.r, color.g, color.b); }
        const sin = Math.sin(angle), cos = Math.cos(angle);
        euler.set(0, angle, 0, 'YXZ'); quaternion.setFromEuler(euler);
        let k = 0;
        for (const side of [-WHEEL.x, WHEEL.x]) for (const reach of [WHEEL.rear, WHEEL.front]) {
          // Each tyre stands on its own measured patch of road.
          position.set(x + cos * side + sin * reach, seen[o + 6 + k++] + .385, z - sin * side + cos * reach);
          matrix.compose(position, quaternion, one); tyres.setMatrixAt(wheel, matrix); rims.setMatrixAt(wheel, matrix); wheel++;
        }
      }
      for (const item of styles.values()) {
        item.body.count = item.lamps.count = item.used;
        // A style nobody is using costs nothing.
        item.body.visible = item.lamps.visible = item.used > 0;
        item.body.instanceMatrix.needsUpdate = item.lamps.instanceMatrix.needsUpdate = item.tint.needsUpdate = true;
      }
      tyres.count = rims.count = wheel; tyres.visible = rims.visible = wheel > 0; tyres.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() {
      for (const item of styles.values()) { item.body.geometry.dispose(); item.lamps.geometry.dispose(); }
      for (const mesh of meshes) mesh.dispose();
      paint.dispose(); if (!lit) lens.dispose(); group.removeFromParent();
    },
  };
}

/** Cars standing at the kerb. A car leaves this set when the player drives it away. */
export function createParkedCars({ capacity = 160 } = {}) {
  return createCarSet({ name: 'Parked cars', label: 'Parked', capacity, lit: false, select: car => car._kerb && !car.controlled });
}

/**
 * Moving traffic beyond a few car lengths, where a model of its own for every
 * car would cost fifteen draws apiece to show wheels nobody can see turning.
 * Give update() the cars to draw; those close by keep models of their own.
 */
export function createDistantTraffic({ capacity = 96 } = {}) {
  return createCarSet({ name: 'Distant traffic', label: 'Distant', capacity, lit: true, select: () => true });
}

export function createCar({ type = 'sedan', color: tint = 0xbcc5bd, seed = '' } = {}) {
  const group = new THREE.Group(); group.name = type;
  const taxi = type === 'taxi', police = type === 'police';
  // Yellow in the Manhattan core; apple green for the cabs that serve everywhere else.
  if (taxi) tint = new THREE.Color(tint).getHex() === GREEN_CAB ? GREEN_CAB : 0xf3ba31;
  if (police) tint = 0xe4e9e4;
  const shape = carShape(type, seed);
  const key = `${type}:${shape}:${new THREE.Color(tint).getHexString()}`;
  // Identical cars share one set of geometry.
  if (!bodies.has(key)) bodies.set(key, buildCar({ type, shape, paint: tint }));
  const built = bodies.get(key);
  // The body rides above independent wheel pivots. Each tire can follow a
  // different measured height while the chassis absorbs terrain changes.
  const chassis = new THREE.Group();
  const body = new THREE.Mesh(built.body, carPaint); body.castShadow = true; body.receiveShadow = true; body.name = 'Car body';
  const lamps = new THREE.Mesh(built.lamps, carGlow); lamps.name = 'Car lamps';
  chassis.add(body, lamps); group.add(chassis); group.userData.chassis = chassis; group.userData.shape = shape;
  group.userData.lights = [];
  if (police) {
    for (const [x, tone] of [[-0.38, 0x3379fa], [0.38, 0xfa493d]]) {
      // Each light owns its material so one police car can flash independently.
      const material = new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: 1.5, roughness: 0.22 });
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.24), material);
      light.position.set(x, built.roof + .15, -0.2); chassis.add(light); group.userData.lights.push(light);
    }
  }
  group.userData.wheels = [];
  for (const x of [-WHEEL.x, WHEEL.x]) for (const z of [WHEEL.rear, WHEEL.front]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.36, z);
    const roll = new THREE.Group();
    const tire = new THREE.Mesh(wheelTyre, tireMaterial); tire.castShadow = true;
    const hub = new THREE.Mesh(wheelRim, hubMaterial);
    // Steering turns the axle around Y; the child spins around that axle's X.
    // Mixing both rotations on one default Euler pivot would wobble the axle.
    roll.add(tire, hub); wheel.add(roll);
    wheel.userData.front = z > 0; wheel.userData.roll = roll; wheel.userData.radius = WHEEL.radius;
    group.add(wheel); group.userData.wheels.push(wheel);
  }
  return group;
}

/** Pose a +Z-facing car using its physical heading, steering yaw and signed speed. */
export function updateCarVisuals(mesh, car, dt) {
  const steering = Number.isFinite(car._steering) ? car._steering : 0;
  const speed = Number.isFinite(car.speed) ? car.speed : 0;
  const seconds = Math.max(0, dt);
  const previous=mesh.userData.ride;
  const ride=mesh.userData.ride=updateRide(previous,car,dt);
  mesh.position.set(car.x,ride.height+0.025,car.z);
  // A yaw-only root lets each tire follow its own measured contact. Terrain
  // tilt is damped on the chassis instead of shaking the complete vehicle.
  mesh.rotation.set(0,car.angle,0,'YXZ');
  // Positive lateral acceleration points along local +X. The body leans
  // outward, even when countersteering against a slide. Route-following NPCs
  // have no tire dynamics, so retain their wheel-angle approximation.
  const lateral = Number.isFinite(car.lateralAcceleration) ? car.lateralAcceleration : steering * speed * speed / 6;
  const longitudinal = Number.isFinite(car.longitudinalAcceleration) ? car.longitudinalAcceleration : 0;
  const chassis = mesh.userData.chassis;
  if (chassis) {
    ride.leanRoll = THREE.MathUtils.damp(ride.leanRoll, THREE.MathUtils.clamp(lateral * .0045, -.055, .055), 7, seconds);
    ride.leanPitch = THREE.MathUtils.damp(ride.leanPitch, THREE.MathUtils.clamp(-longitudinal * .002, -.035, .035), 8, seconds);
    chassis.rotation.set(ride.pitch+ride.leanPitch,0,ride.roll+ride.leanRoll,'YXZ');
  }
  for (const [i,wheel] of (mesh.userData.wheels || []).entries()) {
    const measured=car.wheelHeights?.[i];
    const height=Number.isFinite(measured)?measured:(Number.isFinite(car.y)?car.y:0)
      +wheel.position.x*Math.tan(car.roll||0)-wheel.position.z*Math.tan(car.pitch||0);
    // Counter the body's filtered heave so tires stay at their source height.
    wheel.position.y=.36+height-ride.height;
    wheel.rotation.y = wheel.userData.front ? steering : 0;
    const roll = wheel.userData.roll;
    if (roll) {
      // At the bottom of a +X-spinning wheel, tangential velocity points -Z,
      // canceling forward +Z travel at contact with the road.
      roll.rotation.x = (roll.rotation.x + speed * seconds / wheel.userData.radius) % TAU;
    }
  }
}

const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
const SKIN = [0xc79a7b, 0x8d5b3f, 0xe0b99a, 0x6b4630, 0xb98563], HAIR = [0x2a211c, 0x14110f, 0x5a3b25, 0x8a6a45, 0x3a3a3c], TROUSERS = [0x2b3440, 0x1f2226, 0x4a4e57, 0x3b4a5e, 0x5d5648];

/** A limb or torso: a tube of the given radii at the given heights, rounded off at both ends. */
function limb(profile, segments = 10) {
  const points = [new THREE.Vector2(0, profile[0][1] - profile[0][0] * .6)];
  for (const [radius, y] of profile) points.push(new THREE.Vector2(radius, y));
  points.push(new THREE.Vector2(0, profile.at(-1)[1] + profile.at(-1)[0] * .6));
  // Lathe profiles run bottom to top, which winds the surface outward.
  return new THREE.LatheGeometry(points, segments);
}

/**
 * A walking figure about 1.78 m tall, facing +Z, feet at y = 0. Legs and arms
 * hang from their own pivots so a walk cycle can swing them.
 * @param {number} tint jacket colour; hair, skin and trousers follow from it
 * @param {{courier?: boolean}} options a courier carries a messenger bag
 */
export function createPerson(tint = 0x576e65, { courier = false } = {}) {
  const group = new THREE.Group();
  const batch = new Batches(), place = new THREE.Matrix4();
  const pick = (list, salt) => list[(Math.imul(tint ^ salt, 2654435761) >>> 0) % list.length];
  const skin = pick(SKIN, 0x51), hair = pick(HAIR, 0x9e), trousers = pick(TROUSERS, 0x37);
  const at = (x, y, z, sx = 1, sy = 1, sz = 1) => place.makeScale(sx, sy, sz).setPosition(x, y, z);
  // Hips to shoulders, flattened front to back.
  batch.add(limb([[.15, .9], [.165, .98], [.15, 1.12], [.185, 1.3], [.2, 1.42], [.12, 1.49]], 12), personMaterial, at(0, 0, 0, 1, 1, .62), tint);
  batch.add(limb([[.052, 1.47], [.05, 1.56]], 8), personMaterial, at(0, 0, 0), skin);
  batch.add(new THREE.SphereGeometry(.108, 14, 10), personMaterial, at(0, 1.645, .008, .9, 1.1, 1), skin);
  // Hair covers the crown and the back of the head.
  batch.add(new THREE.SphereGeometry(.114, 14, 8, 0, TAU, 0, Math.PI * .56), personMaterial, at(0, 1.662, -.012, .93, 1.06, 1.02), hair);
  if (courier) {
    // The bag rides on the back, its strap across the chest.
    batch.box(personMaterial, 0, 1.2, -.165, .3, .24, .11, 0x23272b);
    batch.box(personMaterial, 0, 1.3, -.225, .31, .05, .012, 0xf05a28);
    place.makeRotationZ(.72).setPosition(0, 1.27, .118); batch.add(new THREE.BoxGeometry(.045, .62, .012), personMaterial, place, 0x23272b);
  }
  batch.finish(group);
  group.userData.legs = []; group.userData.arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .088, .92, 0);
    const legBatch = new Batches();
    legBatch.add(limb([[.05, -.84], [.058, -.5], [.072, -.42], [.082, -.06]], 9), personMaterial, at(0, 0, 0), trousers);
    // The shoe points forward, its sole on the ground.
    legBatch.add(new THREE.SphereGeometry(.07, 10, 8), personMaterial, at(0, -.868, .045, .78, .72, 1.85), 0xe9e4d8);
    legBatch.finish(leg); group.add(leg); group.userData.legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * .222, 1.41, 0);
    const armBatch = new Batches();
    armBatch.add(limb([[.04, -.56], [.048, -.3], [.06, -.04]], 8), personMaterial, at(0, 0, 0), tint);
    armBatch.add(new THREE.SphereGeometry(.044, 8, 6), personMaterial, at(0, -.62, .008, .9, 1.15, 1), skin);
    armBatch.finish(arm); arm.rotation.z = side * .07;
    group.add(arm); group.userData.arms.push(arm);
  }
  return group;
}
