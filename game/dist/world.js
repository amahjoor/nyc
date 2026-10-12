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

// Vehicles share materials and geometries; only wheels remain separate for
// steering/spin animation. All models face +Z and sit on the ground at y=0.
const carPaint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.26 });
const carGlass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.45 });
const carGlow = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.25 });
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x222728, roughness: 0.92 });
const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 16); wheelGeometry.rotateZ(Math.PI / 2);
const hubGeometry = new THREE.CylinderGeometry(0.195, 0.195, 0.252, 12); hubGeometry.rotateZ(Math.PI / 2);
const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xabb3b1, metalness: 0.6, roughness: 0.38 });

function carBodyGeometry(width, yBottom, yTop, rearBottom, frontBottom, rearTop, frontTop) {
  const x = width / 2;
  const points = [[-x, yBottom, rearBottom], [x, yBottom, rearBottom], [x, yBottom, frontBottom], [-x, yBottom, frontBottom], [-x * 0.85, yTop, rearTop], [x * 0.85, yTop, rearTop], [x * 0.85, yTop, frontTop], [-x * 0.85, yTop, frontTop]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  // Counterclockwise faces are outward in Three.js. These corner indices
  // are reversed from the profile order so the single-sided body is visible.
  const indices = [0, 3, 2, 0, 2, 1, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 4, 5, 6, 4, 6, 7];
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  g.setIndex(indices);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

export function createCar({ type = 'sedan', color: tint = 0xbcc5bd } = {}) {
  const group = new THREE.Group(); group.name = type;
  const batch = new Batches();
  const taxi = type === 'taxi', police = type === 'police';
  if (taxi) tint = 0xf3ba31;
  if (police) tint = 0xe4e9e4;
  batch.add(carBodyGeometry(1.85, 0.4, 1.01, -2.2, 2.2, -2.05, 1.95), carPaint, null, tint);
  batch.add(carBodyGeometry(1.67, 1.0, 1.61, -1.35, 0.97, -0.89, 0.49), carGlass, null, 0x29434c);
  batch.box(carPaint, 0, 1.63, -0.2, 1.48, 0.085, 1.42, tint);
  batch.box(carPaint, 0, 1.27, -0.22, 1.71, 0.61, 0.095, tint);
  batch.box(carPaint, 0, 0.67, 2.14, 1.76, 0.22, 0.15, 0x313c3e);
  batch.box(carPaint, 0, 0.59, -2.2, 1.79, 0.18, 0.14, 0x354041);
  batch.box(carPaint, 0, 0.91, 2.10, 0.65, 0.20, 0.08, 0x374449);
  batch.box(carPaint, 0, 0.71, 2.24, 0.42, 0.13, 0.025, 0xd6cdaa);
  for (const side of [-1, 1]) {
    batch.box(carGlow, side * 0.62, 0.94, 2.075, 0.43, 0.17, 0.09, 0xffe2a4);
    batch.box(carGlow, side * 0.63, 0.88, -2.17, 0.44, 0.14, 0.075, 0xb54130);
    batch.box(carPaint, side * 0.965, 1.17, 0.62, 0.22, 0.13, 0.29, tint);
    for (const z of [-0.78, 0.37]) batch.box(carPaint, side * 0.942, 0.99, z, 0.03, 0.045, 0.23, 0xd6d4c6);
    if (taxi) for (let i = 0; i < 14; i++) batch.box(carPaint, side * 0.934, 0.77, -1.65 + i * 0.25, 0.013, 0.12, 0.125, i % 2 ? 0xd9a72a : 0x242b28);
    if (police) batch.box(carPaint, side * 0.94, 0.8, -0.1, 0.015, 0.26, 2.8, 0x254571);
  }
  if (taxi) {
    batch.box(carPaint, 0, 1.77, -0.25, 0.75, 0.23, 0.35, 0x353b31);
    batch.box(carGlow, 0, 1.78, -0.064, 0.64, 0.15, 0.024, 0xffe5ad);
    batch.box(carGlow, 0, 1.78, -0.436, 0.64, 0.15, 0.024, 0xffe5ad);
  }
  if (police) {
    batch.box(carPaint, 0, 1.73, -0.2, 1.18, 0.09, 0.27, 0x313a3d);
  }
  // Suspension tilts the body independently so all four tire contacts stay
  // on the flat driving surface while cornering, accelerating or braking.
  const chassis = new THREE.Group();
  batch.finish(chassis);group.add(chassis);group.userData.chassis = chassis;
  group.userData.lights = [];
  if (police) {
    for (const [x, tone] of [[-0.38, 0x3379fa], [0.38, 0xfa493d]]) {
      // Each light owns its material so one police car can flash independently.
      const material = new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: 1.5, roughness: 0.22 });
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.24), material);
      light.position.set(x, 1.83, -0.2); chassis.add(light); group.userData.lights.push(light);
    }
  }
  group.userData.wheels = [];
  for (const x of [-0.90, 0.90]) for (const z of [-1.37, 1.30]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.36, z);
    const roll = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeometry, tireMaterial); tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    // Steering turns the axle around Y; the child spins around that axle's X.
    // Mixing both rotations on one default Euler pivot would wobble the axle.
    roll.add(tire, hub); wheel.add(roll);
    wheel.userData.front = z > 0; wheel.userData.roll = roll; wheel.userData.radius = 0.35;
    group.add(wheel); group.userData.wheels.push(wheel);
  }
  return group;
}

/** Pose a +Z-facing car using its physical heading, steering yaw and signed speed. */
export function updateCarVisuals(mesh, car, dt) {
  const steering = Number.isFinite(car._steering) ? car._steering : 0;
  const speed = Number.isFinite(car.speed) ? car.speed : 0;
  const seconds = Math.max(0, dt);
  mesh.position.set(car.x, 0.025, car.z);
  mesh.rotation.y = car.angle;
  // Positive lateral acceleration points along local +X. The body leans
  // outward, even when countersteering against a slide. Route-following NPCs
  // have no tire dynamics, so retain their wheel-angle approximation.
  const lateral = Number.isFinite(car.lateralAcceleration) ? car.lateralAcceleration : steering * speed * speed / 6;
  const longitudinal = Number.isFinite(car.longitudinalAcceleration) ? car.longitudinalAcceleration : 0;
  const chassis = mesh.userData.chassis;
  if (chassis) {
    chassis.rotation.z = THREE.MathUtils.damp(chassis.rotation.z, THREE.MathUtils.clamp(lateral * .0045, -.055, .055), 7, seconds);
    chassis.rotation.x = THREE.MathUtils.damp(chassis.rotation.x, THREE.MathUtils.clamp(-longitudinal * .002, -.035, .035), 8, seconds);
  }
  for (const wheel of mesh.userData.wheels || []) {
    wheel.rotation.y = wheel.userData.front ? steering : 0;
    const roll = wheel.userData.roll;
    if (roll) {
      // At the bottom of a +X-spinning wheel, tangential velocity points -Z,
      // canceling forward +Z travel at contact with the road.
      roll.rotation.x = (roll.rotation.x + speed * seconds / wheel.userData.radius) % TAU;
    }
  }
}

const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });

export function createPerson(tint = 0x576e65) {
  const group = new THREE.Group();
  const batch = new Batches();
  batch.box(personMaterial, 0, 1.18, 0, 0.43, 0.60, 0.26, tint);
  batch.box(personMaterial, 0, 0.89, 0, 0.35, 0.13, 0.24, 0x2c363c);
  const head = new THREE.SphereGeometry(0.175, 9, 7); head.scale(0.85, 1.13, 0.88); head.translate(0, 1.65, 0.02);
  batch.add(head, personMaterial, null, 0xbd9370);
  const hair = new THREE.SphereGeometry(0.177, 9, 5, 0, TAU, 0, Math.PI * 0.46); hair.scale(0.88, 1.05, 0.9); hair.translate(0, 1.69, 0.01);
  batch.add(hair, personMaterial, null, 0x3c302b);
  batch.finish(group);
  group.userData.legs = []; group.userData.arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.115, 0.87, 0);
    const legBatch = new Batches();
    legBatch.box(personMaterial, 0, -0.37, 0, 0.16, 0.72, 0.18, 0x344249);
    legBatch.box(personMaterial, 0, -0.79, 0.06, 0.19, 0.12, 0.30, 0xd2cbb9);
    legBatch.finish(leg); group.add(leg); group.userData.legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * 0.265, 1.4, 0);
    const armBatch = new Batches();
    armBatch.box(personMaterial, 0, -0.21, 0, 0.145, 0.43, 0.17, tint);
    armBatch.box(personMaterial, 0, -0.46, 0.015, 0.11, 0.12, 0.12, 0xbd9370);
    armBatch.finish(arm); arm.rotation.z = side * 0.08;
    group.add(arm); group.userData.arms.push(arm);
  }
  return group;
}
