import { batchExterior, fitExterior, poseExterior, releaseCrumple } from './vehicle-detail.js';
import { hasDriver } from './vehicle-damage.js';
import { Parts } from './transport-models.js';
import { OFFICERS, patrolAppearance, patrolLookForMember } from './human-cast.js';
import { updateRide } from './vehicle-presentation.js';
import { bodyShape } from './fleet.js';
import { buildCar, createCarMaterial, createLampMaterial, wheelGeometry, WHEEL, BODY_SHAPES } from './vehicle-model.js';
import * as THREE from './vendor/three.module.min.js';
import { plateFor } from './license-plates.js';
import { createPlateBatch, createPlateMesh, setPlateGlow } from './vehicle-plates.js';

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
const carPaint = createCarMaterial({ doubleSided: true }), carGlow = createLampMaterial();
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: .9 });
const { tyre: wheelTyre } = wheelGeometry();
// Close-up wheels have a recessed brake rotor, machined spokes and lug bolts.
const wheelFinish = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .72, roughness: .31 });
function roadWheel({ spokes = 5, aero = false, thin = false, face = 0xb1bac1, barrel = 0xc4cbd0, steel = null } = {}) {
  const batch = new Batches(), group = new THREE.Group(), radius = WHEEL.radius;
  const lathe = profile => new THREE.LatheGeometry(profile.map(([r,x]) => new THREE.Vector2(r*radius,x)),30).rotateZ(Math.PI/2);
  const rotor = lathe([[.24,-.085],[.50,-.085],[.50,.085],[.24,.085]]);
  batch.add(rotor,wheelFinish,null,0x777a7b);
  batch.add(lathe([[.55,-.12],[.61,-.131],[.65,-.122],[.65,.122],[.61,.131],[.55,.12]]),wheelFinish,null,barrel);
  const hub = new THREE.CylinderGeometry(.049,.049,.246,16).rotateZ(Math.PI/2);
  batch.add(hub,wheelFinish,null,0x888e93);
  if (steel !== null) {
    // A pressed steel wheel: a dished disc with a ring of vents and a cap over the hub, the same on both faces.
    batch.add(lathe([[.12,-.127],[.3,-.121],[.47,-.104],[.56,-.121],[.56,.121],[.47,.104],[.3,.121],[.12,.127]]),wheelFinish,null,steel);
    const vent = new THREE.CylinderGeometry(.024,.024,.008,10).rotateZ(Math.PI/2), cap = new THREE.CylinderGeometry(.058,.066,.268,18).rotateZ(Math.PI/2);
    batch.add(cap,wheelFinish,null,0xcfd4d8);
    for (const side of [-1,1]) for (let i=0;i<10;i++) {
      batch.add(vent,wheelFinish,new THREE.Matrix4().makeRotationX(i*TAU/10).multiply(new THREE.Matrix4().makeTranslation(side*.113,.137,0)),0x0c0d0e);
    }
  } else {
    const spoke = new THREE.BoxGeometry(.024,.154,aero ? .058 : thin ? .013 : .020);
    for (const side of [-1,1]) for (let i=0;i<spokes;i++) {
      const angle = i*TAU/spokes, rotorMatrix = new THREE.Matrix4().makeRotationX(angle);
      for (const fork of thin ? [0] : [-1,1]) {
        const local = new THREE.Matrix4().makeRotationX(fork*.19).setPosition(side*.114,.121,fork*.023);
        batch.add(spoke,wheelFinish,new THREE.Matrix4().multiplyMatrices(rotorMatrix,local),face);
      }
    }
    const lug = new THREE.CylinderGeometry(.008,.009,.012,6).rotateZ(Math.PI/2);
    for (const side of [-1,1]) for (let i=0;i<5;i++) {
      const m = new THREE.Matrix4().makeRotationX(i*TAU/5).multiply(new THREE.Matrix4().makeTranslation(side*.124,.032,0));
      batch.add(lug,wheelFinish,m,0x4f555b);
    }
  }
  batch.finish(group);
  return group.children[0].geometry;
}
// A wheel seen from down the street: a dark ring round a disc the colour of its face, a hundred and forty triangles
// where the one drawn close by has two and a half thousand. Past FAR_WHEELS metres a spoke is narrower than a pixel.
const FAR_WHEELS = 45;
const farTyre = new THREE.LatheGeometry([[.6,-.125],[.96,-.125],[1,-.06],[1,.06],[.96,.125],[.6,.125]].map(([r,x]) => new THREE.Vector2(r*WHEEL.radius,x)),12).rotateZ(Math.PI/2);
const farRim = (() => {
  const position = [], normal = [], color = [], R = WHEEL.radius*.6;
  for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
    const a = i*Math.PI/6, b = (i+1)*Math.PI/6, x = side*.127;
    // Wound so that each disc faces away from the car.
    const rim = side > 0 ? [a, b] : [b, a];
    position.push(x,0,0, x,Math.cos(rim[0])*R,Math.sin(rim[0])*R, x,Math.cos(rim[1])*R,Math.sin(rim[1])*R);
    for (let k = 0; k < 3; k++) { normal.push(side,0,0); color.push(1,1,1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3)); geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  return geometry;
})();
const RIM_FACES = { alloy: 0xb1bac1, sport: 0xb1bac1, aero: 0xb1bac1, multi: 0xc6cdd2, dark: 0x2c2f33, steel: 0x9aa0a5, black: 0x15171a };
/** The wheels there are: alloys in five patterns, and pressed steel in silver and in black. */
export const RIMS = {
  alloy: roadWheel(), sport: roadWheel({ spokes: 8 }), aero: roadWheel({ aero: true }), multi: roadWheel({ spokes: 14, thin: true, face: 0xc6cdd2 }),
  dark: roadWheel({ face: 0x2c2f33, barrel: 0x3a3d42 }), steel: roadWheel({ steel: 0x9aa0a5 }), black: roadWheel({ steel: 0x15171a, barrel: 0x1c1e21 }),
};
const FINE = /bmw|mercedes|audi|lexus|porsche|infiniti|acura|genesis|jaguar|land-rover|cadillac|lincoln|volvo|maserati|alfa/;
/**
 * The wheel a car wears, whether it is drawn alone or in a batch. A patrol car runs on black steel, a cab or
 * a trade van on steel under a cap; otherwise it is the model's: every car of one model has the same.
 */
function rimOf(id = '', shape = 'sedan') {
  if (/-police$|-emergency/.test(id)) return RIMS.black;
  if (/-taxi$|-cargo$/.test(id) || shape === 'van') return RIMS.steel;
  if (/tesla|ioniq|polestar|lucid/.test(id)) return RIMS.aero;
  if (shape === 'coupe') return RIMS.sport;
  let sum = 0; for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  if (FINE.test(id)) return sum % 2 ? RIMS.multi : RIMS.dark;
  return id && sum % 6 === 0 ? RIMS.dark : id && sum % 6 === 1 ? RIMS.multi : RIMS.alloy;
}
const leftIndicator = createLampMaterial(1), rightIndicator = createLampMaterial(-1);
const flashingSide = car => hasDriver(car) && !car.controlled ? car.indicator || 0 : 0;
const parkedLamps = createLampMaterial();
parkedLamps.name = 'Parked car lamps';
parkedLamps.emissiveIntensity = .02;
const bodies = new Map();
const modelPaints = new Map();
/** The colour of a boro taxi, as the simulation names it. */
export const GREEN_CAB = 0x74b541;

/** Lamps brighten after dark; 0 is daylight, 1 is night. Shared by every car. */
export function setVehicleLamps(night) { leftIndicator.emissiveIntensity = rightIndicator.emissiveIntensity = carGlow.emissiveIntensity = .55 + 2.6 * Math.max(0, Math.min(1, night)); setPlateGlow(night); }

/** The body a car has (fleet.js): however it is drawn, it is the same one. */
export const carShape = bodyShape;

/**
 * Cars of each style share instanced bodywork, glazing and lamps. The whole
 * set shares wheels and low-detail interiors.
 * Each stands as the simulation has it, its wheels on their own patches of
 * road, but nothing turns: this is for cars at rest, and for cars too far off
 * for a turning wheel to be seen.
 */
function createCarSet({ name, label, capacity, lit, select, library }) {
  const group = new THREE.Group(); group.name = name;
  const paint = createCarMaterial({ instancedPaint: true }); paint.name = `${label} car paint and trim`;
  const exteriorPaint = createCarMaterial({ instancedPaint: true, doubleSided: true });
  // Traffic shows the lamps every moving car shows. Nobody leaves their lights on at the kerb.
  const lens = lit ? carGlow : parkedLamps;
  const styles = new Map();
  const add = mesh => { mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); };
  const style = (key, type, shape, tone, model = null) => {
    // Instance tint belongs to this set. Near cars and the other set can
    // share the source without overwriting each other's paint attributes.
    const built = model || buildCar({ type, shape, paint: tone });
    const exterior = batchExterior(built);
    const tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    exterior.body.setAttribute('aPaint', tint);
    const body = new THREE.InstancedMesh(exterior.body, model ? exteriorPaint : paint, capacity); body.name = `${label} ${key} bodies`; body.castShadow = true; body.receiveShadow = true;
    const lampGeometry = new THREE.BufferGeometry();
    for (const [key,attr] of Object.entries(built.lamps.attributes)) lampGeometry.setAttribute(key,attr);
    lampGeometry.setIndex(built.lamps.index);
    const indicators = new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
    lampGeometry.setAttribute('aIndicator',indicators);
    const lamps = new THREE.InstancedMesh(lampGeometry, lens, capacity); lamps.name = `${label} ${key} lamps`;
    const meshes = [body, lamps];
    for (const [geometry, material] of exterior.windows) {
      if (!geometry) continue;
      const windows = new THREE.InstancedMesh(geometry, material, capacity);
      windows.name = `${label} ${key} ${material.name}`;
      meshes.push(windows);
    }
    for (const mesh of meshes) { mesh.instanceMatrix = body.instanceMatrix; add(mesh); }
    styles.set(key, { body, lamps, indicators, meshes, tint, used: 0, idle: 0, built, model, painted: tone !== 0xffffff, wheels: model?.wheels || WHEEL, rim: rimOf(model?.id, shape),
      cabin: cabinTransform(exterior.layout), driver: cabinTransform(exterior.layout, true) });
  };
  const removeStyle = item => {
    for (const mesh of item.meshes) {
      // The batch owns its panel indices and paint instances. Its vertices and lamps belong to the source.
      if (mesh === item.lamps) {
        mesh.geometry.setIndex(null);
        for (const name of Object.keys(item.built.lamps.attributes)) mesh.geometry.deleteAttribute(name);
        mesh.geometry.dispose();
      } else {
        if (item.model) for (const name of Object.keys(item.model.body.attributes)) mesh.geometry.deleteAttribute(name);
        mesh.geometry.dispose();
      }
      mesh.removeFromParent(); mesh.dispose();
    }
    if (!item.model) { item.built.body.dispose(); item.built.lamps.dispose(); }
  };
  for (const shape of BODY_SHAPES) style(shape, 'sedan', shape, 0xffffff);
  // A cab has a roof light and a band along its doors, so it is built in its own colour.
  if (lit) { style('cab', 'taxi', 'sedan', 0xf3ba31); style('boro cab', 'taxi', 'sedan', GREEN_CAB); }
  const tyres = new THREE.InstancedMesh(wheelTyre, tireMaterial, capacity * 4); tyres.name = `${label} car tyres`; tyres.castShadow = true;
  // The alloys a car shows close by are the ones it shows from down the street.
  const rims = new Map(Object.entries(RIMS).map(([pattern, geometry]) => {
    const mesh = new THREE.InstancedMesh(geometry, wheelFinish, capacity * 4); mesh.name = `${label} car wheels, ${pattern}`; add(mesh);
    return [geometry, mesh];
  }));
  // Each car's own number, front and back.
  const plates = createPlateBatch(capacity, `${label} number plates`); group.add(plates.mesh);
  add(tyres);
  // The wheels of the cars down the street, all in two draws, and the colour each pattern's face shows from there.
  const farTyres = new THREE.InstancedMesh(farTyre, tireMaterial, capacity * 4); farTyres.name = `${label} car tyres, far`; add(farTyres);
  const farRims = new THREE.InstancedMesh(farRim, wheelFinish, capacity * 4); farRims.name = `${label} car wheels, far`; add(farRims);
  farRims.setColorAt(0, new THREE.Color(1, 1, 1));
  const faces = new Map(Object.entries(RIMS).map(([pattern, geometry]) => [geometry, new THREE.Color(RIM_FACES[pattern] ?? 0xb1bac1)]));
  const wasFar = new WeakMap();
  const interiorBatch = occupant => {
    const template = cabinMesh(occupant, true), mesh = new THREE.InstancedMesh(template.geometry, template.material, capacity);
    mesh.name = `${label} ${template.name}`;
    mesh.receiveShadow = true; add(mesh); return mesh;
  };
  const cabins = interiorBatch(-1), drivers = new Map();
  const FIELDS = 13, seen = new Float64Array(capacity * FIELDS), pose = new Float64Array(FIELDS);
  const matrix = new THREE.Matrix4(), interiorMatrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, 'YXZ'), one = new THREE.Vector3(1, 1, 1), color = new THREE.Color();
  const ids = [], looks = [], colors = [], worn = [], shod = [], wheelScale = new THREE.Vector3();
  let count = -1;
  const styleOf = car => {
    // A cab or a patrol car wears its own model once that is drawn: its livery is part of the exterior.
    const model = (car.type === 'sedan' || car.identity?.asset?.livery) && library?.get(car.identity?.asset);
    if (!model && lit && car.type === 'taxi') return styles.get(color.set(car.color || '#f3ba31').getHex() === GREEN_CAB ? 'boro cab' : 'cab');
    if (model) {
      if (!styles.has(model.id)) style(model.id, car.type, car.shape, 0xffffff, model);
      return styles.get(model.id);
    }
    return styles.get(carShape(car.type, car.id, car.shape));
  };
  return {
    group,
    get count() { return Math.max(0, count); },
    /**
     * A stationary row needs no new uploads until its appearance or occupancy changes. `eye` (`{x, z}`) is where the
     * cars are seen from: those more than FAR_WHEELS metres off are given plain wheels and no upholstery. Without
     * it every car is drawn as if it were close.
     */
    update(cars = [], drawDriver = null, eye = null) {
      let n = 0, changed = false;
      for (const car of cars) {
        if (!select(car) || n >= capacity) continue;
        const wheels = car.wheelHeights || [];
        pose[0] = car.x; pose[1] = car.y || 0; pose[2] = car.z; pose[3] = car.angle || 0; pose[4] = car.pitch || 0; pose[5] = car.roll || 0;
        for (let i = 0; i < 4; i++) pose[6 + i] = Number.isFinite(wheels[i]) ? wheels[i] : pose[1];
        pose[10] = hasDriver(car) ? driverLook(car.id,car.type,car.unit) : -1;
        pose[11] = flashingSide(car);
        // A car at the line does not flicker between its two sets of wheels: it changes four metres past it either way.
        const far = eye ? Math.hypot(car.x - eye.x, car.z - eye.z) > FAR_WHEELS + (wasFar.get(car) ? -4 : 4) : false;
        wasFar.set(car, far); pose[12] = far ? 1 : 0;
        const look = styleOf(car);
        if (drawDriver && pose[10] >= 0) {
          quaternion.setFromEuler(euler.set(pose[4], pose[3], pose[5], 'YXZ'));
          matrix.compose(position.set(car.x, pose[1]+.025, car.z), quaternion, one);
          position.set(0,.56,0).applyMatrix4(look.driver).applyMatrix4(matrix);
          if (drawDriver(car, position)) pose[10] = -1;
        }
        const plate = plateFor(car);
        if (ids[n] !== car.id || looks[n] !== look || colors[n] !== car.color || worn[n] !== plate || shod[n] !== car.rims) changed = true;
        worn[n] = plate; shod[n] = car.rims;
        ids[n] = car.id; looks[n] = look; colors[n] = car.color;
        for (let i = 0; i < FIELDS; i++) if (seen[n * FIELDS + i] !== pose[i]) { changed = true; seen[n * FIELDS + i] = pose[i]; }
        n++;
      }
      if (n !== count) changed = true;
      if (!changed) return false;
      count = n; ids.length = looks.length = colors.length = n;
      for (const item of styles.values()) item.used = 0;
      for (const driver of drivers.values()) driver.count = 0;
      for (const mesh of rims.values()) mesh.count = 0;
      plates.begin();
      let wheel = 0, slot = 0, farWheel = 0, cabin = 0;
      for (const car of cars) {
        if (!select(car) || slot >= n) continue;
        const item = looks[slot], i = item.used++, axle = item.wheels;
        const o = slot++ * FIELDS, x = seen[o], y = seen[o + 1], z = seen[o + 2], angle = seen[o + 3];
        // The same pose a driven car takes at rest: yaw at the root, tilt on the chassis.
        position.set(x, y + .025, z); euler.set(seen[o + 4], angle, seen[o + 5], 'YXZ'); quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, one); item.body.setMatrixAt(i, matrix);
        plates.add(matrix, item.built, plateFor(car));
        const far = seen[o + 12] === 1;
        if (!far) cabins.setMatrixAt(cabin++, interiorMatrix.multiplyMatrices(matrix, item.cabin));
        item.indicators.setX(i,seen[o + 11]);
        const occupant = seen[o + 10];
        if (occupant >= 0) {
          if (!drivers.has(occupant)) drivers.set(occupant, interiorBatch(occupant));
          const driver = drivers.get(occupant);
          driver.setMatrixAt(driver.count++, interiorMatrix.multiplyMatrices(matrix, item.driver));
        }
        if (item.painted) item.tint.setXYZ(i, 1, 1, 1);
        else { color.set(car.color || '#8f969b'); item.tint.setXYZ(i, color.r, color.g, color.b); }
        const sin = Math.sin(angle), cos = Math.cos(angle);
        euler.set(0, angle, 0, 'YXZ'); quaternion.setFromEuler(euler);
        let k = 0;
        wheelScale.setScalar(axle.radius / WHEEL.radius);
        for (const side of [-axle.x, axle.x]) for (const reach of [axle.rear, axle.front]) {
          // Each tyre stands on its own measured patch of road.
          position.set(x + cos * side + sin * reach, seen[o + 6 + k++] + axle.radius + .035, z - sin * side + cos * reach);
          // The wheels a body shop has fitted, or the model's own.
          const pattern = RIMS[car.rims] || item.rim, rim = rims.get(pattern);
          matrix.compose(position, quaternion, wheelScale);
          if (far) { farTyres.setMatrixAt(farWheel, matrix); farRims.setMatrixAt(farWheel, matrix); farRims.setColorAt(farWheel++, faces.get(pattern)); }
          else { tyres.setMatrixAt(wheel++, matrix); rim.setMatrixAt(rim.count++, matrix); }
        }
      }
      for (const [key, item] of styles) {
        for (const mesh of item.meshes) { mesh.count = item.used; mesh.visible = item.used > 0; }
        // A style's cars are few and stand apart: the sphere round them says whether any is in the picture, or in a
        // shadow map's reach, and its glass and lamps go by the same sphere as its bodywork.
        if (item.used) {
          item.body.computeBoundingSphere();
          for (const mesh of item.meshes) { mesh.boundingSphere = item.body.boundingSphere; mesh.frustumCulled = true; }
        }
        if (item.used) { item.idle = 0; item.indicators.needsUpdate = item.body.instanceMatrix.needsUpdate = item.tint.needsUpdate = true; }
        else if (item.model && ++item.idle > 900) {
          styles.delete(key); removeStyle(item);
        }
      }
      cabins.count = cabin; cabins.visible = cabin > 0; cabins.instanceMatrix.needsUpdate = true;
      for (const mesh of [farTyres, farRims]) { mesh.count = farWheel; mesh.visible = farWheel > 0; mesh.instanceMatrix.needsUpdate = true; }
      farRims.instanceColor.needsUpdate = true;
      for (const driver of drivers.values()) { driver.visible = driver.count > 0; driver.instanceMatrix.needsUpdate = true; }
      tyres.count = wheel; tyres.visible = wheel > 0; tyres.instanceMatrix.needsUpdate = true;
      for (const mesh of rims.values()) { mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true; }
      plates.end();
      return true;
    },
    dispose() {
      for (const item of styles.values()) removeStyle(item);
      for (const mesh of group.children) mesh.dispose();
      paint.dispose(); exteriorPaint.dispose(); group.removeFromParent();
    },
  };
}

/** Cars standing at the kerb. A car leaves this set when the player drives it away. */
export function createParkedCars({ capacity = 160, library = null } = {}) {
  return createCarSet({ name: 'Parked cars', label: 'Parked', capacity, library, lit: false, select: car => car._kerb && !car.controlled });
}

/**
 * Moving traffic beyond a few car lengths, where a model of its own for every
 * car would cost fifteen draws apiece to show wheels nobody can see turning.
 * Give update() the cars to draw; those close by keep models of their own.
 */
export function createDistantTraffic({ capacity = 96, library = null } = {}) {
  return createCarSet({ name: 'Distant traffic', label: 'Distant', capacity, library, lit: true, select: () => true });
}

// Upholstery and occupants are baked once in seat coordinates. Each is one
// draw call in a nearby car, regardless of how many cushions or limbs it has.
const upholstery = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .76 });
const interiors = new Map();
// One reversible moulding for both door cards, in hinge-local coordinates.
const doorCard = new Batches(), doorTemplate = new THREE.Group();
doorCard.box(upholstery,-.055,.405,-.49,.065,.32,.89,0x2b2b2d);
doorCard.box(upholstery,-.096,.43,-.45,.058,.055,.51,0x4d4c4d);
doorCard.box(upholstery,-.101,.51,-.32,.023,.020,.16,0xa6abae);
doorCard.finish(doorTemplate);
const motor = new Batches(), engineBay = new THREE.Group();
motor.box(upholstery,0,0,0,1.44,.08,1,0x191c20);
motor.box(upholstery,.08,.06,0,.70,.12,.51,0x383b40);
for (let i=0; i<5; i++) motor.box(upholstery,.08,.128,-.15+i*.066,.52,.017,.021,0x56595b);
motor.box(upholstery,-.48,.04,.17,.21,.11,.32,0x26292a);
motor.finish(engineBay);
function driverLook(seed = '', type, unit) {
  if (type === 'police') return patrolAppearance(seed,0,unit).member;
  const id = String(seed);
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum % 4;
}

function cabinTransform({ width, height, hinge, latch }, driver = false) {
  const span = hinge - latch, scaleX = width / .93;
  return new THREE.Matrix4().makeScale(scaleX, height / 1.44, Math.min(1.25, span / 1.2))
    .setPosition(driver ? .39 * scaleX : 0, 0, latch + .36 * span);
}

function addSteeringWheel(batch,x,y,z,distant) {
  const ring = new THREE.TorusGeometry(.16,.018,6,24);
  batch.add(ring,upholstery,new THREE.Matrix4().setPosition(x,y,z),0x18191b);
  batch.box(upholstery,x,y,z,.27,.036,.038,0x383b40);
  batch.box(upholstery,x,y,z-.02,.11,.074,.04,0x28292c);
}
const steeringTemplate = new THREE.Group(), wheelBatch = new Batches();
addSteeringWheel(wheelBatch,0,0,0,false);
wheelBatch.finish(steeringTemplate,false);

function cabinMesh(occupant = -1, distant = false) {
  const key = `${occupant}:${distant}`;
  if (interiors.has(key)) return interiors.get(key).clone();
  const batch = new Batches(), group = new THREE.Group(), matrix = new THREE.Matrix4();
  // The same upholstery near and far: a seat does not change its shape as the car drives off.
  const cushion = new THREE.SphereGeometry(1, 12, 7);
  const pad = (x,y,z,w,h,d,color,tilt=0) => {
    matrix.makeRotationX(tilt).scale(new THREE.Vector3(w,h,d)).setPosition(x,y,z);
    batch.add(cushion,upholstery,matrix,color);
  };
  if (occupant < 0) {
    // The dashboard underside, parcel shelf and door liners keep daylight
    // from showing through below the belt line when a window is missing.
    batch.box(upholstery,0,.68,-.99,1.42,.15,.55,0x2b2c30);
    batch.box(upholstery,0,.65,.67,1.55,.35,.27,0x22262a);
    for (const x of [-.39,.39]) {
      pad(x,.49,0,.27,.105,.3,0x49484a);
      pad(x,.72,-.19,.255,.32,.087,0x3a3a3c,-.14);
      pad(x,.74,-.13,.19,.25,.05,0x545256,-.14);
      pad(x,1.04,-.22,.133,.102,.067,0x424246);
      pad(x,.81,-.92,.13,.10,.07,0x36383b);
    }
    pad(0,.65,-.92,.73,.23,.12,0x38393c);
    pad(0,.57,-.90,.78,.24,.12,0x37373b,-.12);
    batch.box(upholstery,0,.27,-.14,1.58,.14,1.98,0x252326);
    pad(0,.86,.59,.82,.14,.24,0x282a2c);
    batch.box(upholstery,0,.83,.47,1.47,.021,.052,0x747778);
    batch.box(upholstery,0,.93,.48,.27,.16,.045,0x171d22);
    batch.box(upholstery,0,.93,.451,.24,.132,.008,0x354652);
    if (distant) addSteeringWheel(batch, .39,.86,.28, true);
  } else {
    const patrol = occupant >= OFFICERS[0] ? patrolLookForMember(occupant) : null;
    const skin = patrol?.skin ?? [0xaa7452,0xd2a381,0x8e5e42,0xc99574][occupant];
    const coat = patrol?.top ?? [0x32444f,0x845b4b,0x354638,0x4b485a][occupant];
    pad(0,.72,0,.19,.24,.11,coat,-.12);
    pad(0,.94,-.005,.061,.084,.057,skin);
    pad(0,1.063,-.015,.095,.131,.099,skin);
    pad(0,1.13,-.035,.099,.084,.099,0x312a27);
    if (patrol) {
      pad(0,1.15,-.019,.114,.059,.117,0x263951);
      pad(0,1.134,.065,.100,.009,.09,0x181e25,.09);
      pad(.065,.829,.095,.019,.022,.006,0xbabdb7);
    }
    pad(0,1.055,.08,.029,.035,.028,skin);
    for (const side of [-1,1]) {
      pad(side*.042,1.082,.071,.015,.008,.009,0x423832);
      pad(side*.18,.77,.045,.063,.166,.058,coat,-.36);
      pad(side*.17,.72,.17,.045,.133,.048,coat,-1.08);
      pad(side*.15,.78,.273,.044,.052,.046,skin);
      pad(side*.10,.52,.13,.088,.088,.22,0x30323a);
    }
  }
  batch.finish(group,false);
  const mesh = group.children[0]; mesh.removeFromParent();
  mesh.name = occupant < 0 ? 'Cabin upholstery' : 'Seated driver';
  interiors.set(key,mesh); return mesh.clone();
}

export function createCar({ unit = 'patrol', type = 'sedan', color: tint = 0xbcc5bd, seed = '', shape: given = null, model = null, plate = null, rims = null } = {}) {
  const group = new THREE.Group(); group.name = type;
  Object.assign(group.userData, { model, tint, given, unit });
  const taxi = type === 'taxi', police = type === 'police';
  // Yellow in the Manhattan core; apple green for the cabs that serve everywhere else.
  if (taxi) tint = new THREE.Color(tint).getHex() === GREEN_CAB ? GREEN_CAB : 0xf3ba31;
  if (police) tint = 0xe4e9e4;
  const shape = police && unit==='esu' ? 'van' : carShape(type, seed, given);
  const key = `${type}:${shape}:${new THREE.Color(tint).getHexString()}`;
  // Identical cars share one set of geometry.
  if (!model && !bodies.has(key)) bodies.set(key, buildCar({ type, shape, paint: tint }));
  const built = model || bodies.get(key), axle = model?.wheels || WHEEL;
  if (model && !modelPaints.has(tint)) modelPaints.set(tint, createCarMaterial({ bodyPaint: tint, doubleSided: true }));
  // The body rides above independent wheel pivots. Each tire can follow a
  // different measured height while the chassis absorbs terrain changes.
  group.userData.contactShell=built.body;
  const chassis = new THREE.Group();
  const detail = group.userData.detail = fitExterior(chassis, built, model ? modelPaints.get(tint) : carPaint);
  group.addEventListener('removed', () => releaseCrumple(detail));
  // Its own number, front and back, unless it is from a state that issues one plate.
  const plates = detail.plates = createPlateMesh(built, plate || plateFor({ id: seed, type, color: '#' + new THREE.Color(tint).getHexString() }));
  chassis.add(plates); group.userData.plate = plates.userData.plate; group.userData.rims = rims;
  // A scanned exterior does not say where its doors are, and a card set by guesswork stands out through its skin.
  if (!model || model.layout) for (const [i,side] of [1,-1].entries()) {
    const card = doorTemplate.children[0].clone();
    card.scale.set(side,detail.height,detail.hinge-detail.latch);
    detail.doors[i].add(card);
  }
  detail.bay = engineBay.children[0].clone();
  detail.bay.scale.set(detail.width*.70,1,(detail.bounds.max.z-detail.hood.position.z)*.59);
  detail.bay.position.set(0,detail.height*.40,detail.hood.position.z+detail.bay.scale.z*.40);
  detail.bay.visible = false; chassis.add(detail.bay);
  const cabin = cabinMesh(), driver = detail.driver = cabinMesh(driverLook(seed,type,unit));
  detail.steeringWheel = steeringTemplate.children[0].clone();
  detail.steeringWheel.position.set(.39,.86,.28);
  detail.steeringWheel.rotation.x = .38;
  cabin.add(detail.steeringWheel);
  cabin.applyMatrix4(cabinTransform(detail)); driver.applyMatrix4(cabinTransform(detail, true));
  driver.visible = false;
  chassis.add(cabin,driver);
  const lamps = detail.lamps = new THREE.Mesh(built.lamps, carGlow); lamps.name = 'Car lamps';
  chassis.add(lamps); group.add(chassis); group.userData.chassis = chassis; group.userData.shape = shape;
  group.userData.lights = [];
  if (police) {
    if(unit==='esu'){
      const rack=new Parts();
      for(const side of [-1,1]){
        rack.box([side*.48,built.roof+.09,-.89],[.07,.12,1.15],0x65717a);
        rack.lettering('EMERGENCY SERVICE',[side*(detail.width+.003),built.roof*.65,-.72],1.20,.15,side*Math.PI/2,'#254571','#f1f0e6');
      }
      rack.box([0,built.roof+.18,-.89],[.99,.13,1.22],0x56616a);
      const equipment=rack.finish();equipment.name='Emergency Service utility equipment';chassis.add(equipment);
    }
    for (const [x, tone] of [[-0.38, 0x3379fa], [0.38, 0xfa493d]]) {
      // Each light owns its material so one police car can flash independently.
      const material = new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: 1.5, roughness: 0.22 });
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.24), material);
      light.position.set(x, built.roof + .15, -0.2); chassis.add(light); group.userData.lights.push(light);
    }
  }
  group.userData.wheels = [];
  const rim = RIMS[rims] || rimOf(model?.id, shape);
  for (const x of [-axle.x, axle.x]) for (const z of [axle.rear, axle.front]) {
    const wheel = new THREE.Group(); wheel.position.set(x, axle.radius + .01, z);
    const roll = new THREE.Group();
    roll.scale.setScalar(axle.radius / WHEEL.radius);
    const tire = new THREE.Mesh(wheelTyre, tireMaterial); tire.castShadow = true;
    const hub = new THREE.Mesh(rim, wheelFinish);
    // Steering turns the axle around Y; the child spins around that axle's X.
    // Mixing both rotations on one default Euler pivot would wobble the axle.
    roll.add(tire, hub); wheel.add(roll);
    wheel.userData.front = z > 0; wheel.userData.roll = roll; wheel.userData.radius = axle.radius;
    group.add(wheel); group.userData.wheels.push(wheel);
  }
  return group;
}

/** Pose a +Z-facing car using its physical heading, steering yaw and signed speed. */
export function updateCarVisuals(mesh, car, dt) {
  poseExterior(mesh.userData.detail, car);
  mesh.userData.detail.lamps.visible = mesh.userData.detail.plates.visible = !car.destroyed;
  const signal = flashingSide(car);
  mesh.userData.detail.lamps.material = signal > 0 ? leftIndicator : signal < 0 ? rightIndicator
    : car.parked && !car.controlled ? parkedLamps : carGlow;
  const steering = Number.isFinite(car._steering) ? car._steering : 0;
  mesh.userData.detail.steeringWheel.rotation.z = -3 * steering;
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
    const rock=car.bodyRock, weight=rock?.weight||0;
    chassis.position.y=(rock?.heave||0)*weight;
    chassis.rotation.set(ride.pitch+ride.leanPitch+(rock?.pitch||0)*weight,0,ride.roll+ride.leanRoll+(rock?.roll||0)*weight,'YXZ');
  }
  for (const [i,wheel] of (mesh.userData.wheels || []).entries()) {
    const measured=car.wheelHeights?.[i];
    const height=Number.isFinite(measured)?measured:(Number.isFinite(car.y)?car.y:0)
      +wheel.position.x*Math.tan(car.roll||0)-wheel.position.z*Math.tan(car.pitch||0);
    // Counter the body's filtered heave so tires stay at their source height.
    wheel.position.y=wheel.userData.radius+.01+height-ride.height;
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
