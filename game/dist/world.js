import * as THREE from './vendor/three.module.min.js';

// Original procedural artwork. Coordinates are metres: east +X, south +Z.
// Material batches keep the real OSM footprint count affordable on laptops.
const TAU = Math.PI * 2;
const dummy = new THREE.Object3D();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const color = new THREE.Color();
const sidewalkY = 0.13;
const palette = [0xc9bda6, 0xb88969, 0x866455, 0xddd6bb, 0xa2a59c, 0xb4afa1, 0xa46d53, 0xd7d0bf];

function random(seed) {
  let state = Math.abs(Number(seed) || 1729) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function texture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  draw(context, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

function facadeTexture(iron = false) {
  return texture(256, (c, s) => {
    c.fillStyle = iron ? '#d2d0c7' : '#b6aaa0';
    c.fillRect(0, 0, s, s);
    const rng = random(iron ? 97 : 16);
    if (!iron) {
      for (let row = 0; row < 32; row++) {
        for (let col = -1; col < 8; col++) {
          const x = col * 38 + (row % 2) * 19;
          c.fillStyle = `rgba(${rng() > 0.6 ? '255,244,222' : '34,26,20'},${0.035 + rng() * 0.16})`;
          c.fillRect(x + 1, row * 8 + 1, 36, 6);
        }
      }
    }
    // Each texture repeat is one architectural bay and one floor.
    c.fillStyle = iron ? '#e6e3d7' : '#d5cdbf';
    c.fillRect(0, 0, s, 9);
    c.fillStyle = '#756c61';
    c.fillRect(0, 9, s, 3);
    const columns = iron ? [10, 122, 236] : [];
    for (const x of columns) {
      c.fillStyle = '#8d8e87'; c.fillRect(x - 2, 12, 11, 235);
      c.fillStyle = '#f0ecdf'; c.fillRect(x, 12, 7, 235);
      c.fillRect(x - 6, 17, 19, 7);
      c.fillRect(x - 5, 230, 17, 10);
    }
    for (const x of [32, 145]) {
      c.fillStyle = '#595854'; c.fillRect(x - 6, 33, 85, 187);
      c.fillStyle = '#e0d9c9'; c.fillRect(x - 3, 31, 79, 184);
      c.fillStyle = '#223540'; c.fillRect(x + 3, 38, 67, 171);
      const gradient = c.createLinearGradient(x, 40, x + 65, 210);
      gradient.addColorStop(0, '#65777b');
      gradient.addColorStop(0.47, '#35474e');
      gradient.addColorStop(0.5, '#2b3940');
      gradient.addColorStop(1, '#18292f');
      c.fillStyle = gradient; c.fillRect(x + 6, 41, 61, 165);
      c.fillStyle = '#afb3a6';
      c.fillRect(x + 32, 40, 3, 169);
      c.fillRect(x + 3, 113, 67, 4);
      c.fillRect(x + 3, 159, 67, 2);
      c.fillStyle = '#eae0c9'; c.fillRect(x - 8, 218, 89, 8);
      c.fillStyle = '#6c665d'; c.fillRect(x - 8, 227, 89, 3);
    }
    c.fillStyle = '#8b8274'; c.fillRect(0, 249, s, 7);
  });
}

function roadTexture(cobble = false) {
  return texture(256, (c, s) => {
    const rng = random(cobble ? 813 : 261);
    c.fillStyle = cobble ? '#55534d' : '#515454'; c.fillRect(0, 0, s, s);
    if (cobble) {
      for (let r = -1; r < 16; r++) for (let col = -1; col < 9; col++) {
        const x = col * 34 + (r % 2) * 17;
        const shade = 85 + Math.floor(rng() * 31);
        c.fillStyle = `rgb(${shade + 3},${shade + 2},${shade})`;
        c.beginPath(); c.roundRect(x + 1.6, r * 18 + 1.5, 31, 15, 3); c.fill();
        c.fillStyle = 'rgba(220,206,180,.13)'; c.fillRect(x + 4, r * 18 + 3, 25, 1);
      }
    } else {
      for (let i = 0; i < 13000; i++) {
        c.fillStyle = rng() > 0.5 ? 'rgba(220,214,199,.075)' : 'rgba(0,0,0,.09)';
        c.fillRect(rng() * s, rng() * s, 1 + rng(), 1 + rng());
      }
    }
  });
}

const shopNames = ['MERCER & CO.', 'CANAL COFFEE', 'LOFT RECORDS', 'SPRING ST. DELI', 'NO. 48 STUDIO', 'BRICK & BEAM', 'WESTSIDE BOOKS', 'GOOD COMPANY', 'SOHO CYCLE', 'NIGHT OWL', 'GREENE MARKET', 'LOCAL GOODS', 'THE CORNER', 'MADE IN NYC', 'BOWERY SUPPLY', 'AFTER HOURS'];

function signAtlas(names, street = false) {
  const rows = Math.max(1, names.length);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = rows * 64;
  const c = canvas.getContext('2d');
  names.forEach((name, i) => {
    c.fillStyle = street ? '#183f38' : ['#243831', '#272e31', '#742f24', '#ddd1b4'][i % 4];
    c.fillRect(0, i * 64, 1024, 64);
    c.strokeStyle = '#e9ddbb'; c.lineWidth = 2; c.strokeRect(10, i * 64 + 6, 1004, 52);
    c.fillStyle = street || i % 4 !== 3 ? '#f2e8d0' : '#293831';
    c.font = `${street ? '500' : '600'} ${street ? 39 : 35}px ${street ? 'Arial' : 'Georgia'}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(name, 512, i * 64 + 34, 930);
  });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return { map, rows };
}

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
  geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
  return geometry;
}

function topPolygon(polygon, height) {
  const shape = new THREE.Shape();
  // ShapeGeometry is XY. Negating the second coordinate before rotating -90°
  // preserves geographic X/Z winding and gives roofs upward-facing normals.
  polygon.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); g.translate(0, height, 0);
  return g;
}

function cylinder(batch, material, x, y, z, rt, rb, height, tint, segments = 8) {
  const geometry = new THREE.CylinderGeometry(rt, rb, height, segments);
  geometry.translate(x, y, z); batch.add(geometry, material, null, tint);
}

function span(batch, material, a, b, width, height, y, tint) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  batch.box(material, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, width, height, Math.hypot(dx, dz), tint, Math.atan2(dx, dz));
}

function streetRibbon(batch, material, a, b, width, y, scale = 4, tint = 0xffffff) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.1) return;
  const nx = -dz / len * width / 2, nz = dx / len * width / 2;
  batch.add(quad([[a[0] - nx, y, a[1] - nz], [a[0] + nx, y, a[1] + nz], [b[0] + nx, y, b[1] + nz], [b[0] - nx, y, b[1] - nz]], [0, 0, width / scale, 0, width / scale, len / scale, 0, len / scale]), material, null, tint);
}

function signFace(batch, material, x, y, z, tx, tz, nx, nz, width, height, row, rows, offset = 0.1) {
  // Keep text readable from the facade's outward side for either OSM winding.
  if (-tz * nx + tx * nz < 0) { tx = -tx; tz = -tz; }
  const u0 = (rows - row - 1) / rows, u1 = (rows - row) / rows;
  const cx = x + nx * offset, cz = z + nz * offset;
  batch.add(quad([[cx - tx * width / 2, y - height / 2, cz - tz * width / 2], [cx + tx * width / 2, y - height / 2, cz + tz * width / 2], [cx + tx * width / 2, y + height / 2, cz + tz * width / 2], [cx - tx * width / 2, y + height / 2, cz - tz * width / 2]], [0, u0, 1, u0, 1, u1, 0, u1]), material);
}

function area(polygon) {
  return polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
}

function closestStreet(x, z, segments) {
  let result = { distance: Infinity, x, z };
  for (const [a, b] of segments) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const px = a[0] + t * dx, pz = a[1] + t * dz, distance = Math.hypot(x - px, z - pz);
    if (distance < result.distance) result = { x: px, z: pz, distance };
  }
  return result;
}

export function createWorld(city) {
  const group = new THREE.Group(); group.name = 'SoHo / geographic street scene';
  const batch = new Batches(110);
  const matte = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.25 });
  const asphalt = new THREE.MeshStandardMaterial({ map: roadTexture(), vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const cobble = new THREE.MeshStandardMaterial({ map: roadTexture(true), vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const facade = [false, true].map(iron => new THREE.MeshStandardMaterial({ map: facadeTexture(iron), vertexColors: true, roughness: 0.89, side: THREE.DoubleSide }));
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.28, metalness: 0.38, side: THREE.DoubleSide });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffbf63, emissiveIntensity: 1.0, vertexColors: true });
  const atlas = signAtlas(shopNames);
  const shopMaterial = new THREE.MeshStandardMaterial({ map: atlas.map, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const roadNames = [...new Set(city.roads.map(r => r.name || 'SoHo'))];
  const streetAtlas = signAtlas(roadNames, true);
  const streetMaterial = new THREE.MeshStandardMaterial({ map: streetAtlas.map, vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  const segments = city.roads.flatMap(road => road.points.slice(1).map((p, i) => [road.points[i], p]));
  const bounds = city.bounds;
  const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
  batch.box(matte, centerX, -0.17, centerZ, bounds.maxX - bounds.minX + 1800, 0.2, bounds.maxZ - bounds.minZ + 1800, 0x66645c);

  // Wide concrete ribbons form sidewalks; the narrow road is layered above
  // them. Footprints sit on top, so irregular lots retain their real shapes.
  const junctions = new Map();
  const nodeCounts = new Map();
  const nodeKey = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  for (const road of city.roads) for (let i = 1; i < road.points.length; i++) {
    for (const p of [road.points[i - 1], road.points[i]]) nodeCounts.set(nodeKey(p), (nodeCounts.get(nodeKey(p)) || 0) + 1);
  }
  city.roads.forEach((road, index) => {
    const rng = random(index + 903), width = road.width || 11;
    const stone = /cobble|sett|paving_stones/i.test(road.surface || '') || /Greene|Wooster/i.test(road.name || '');
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      streetRibbon(batch, matte, a, b, width + 7, 0.025, 5, 0x9e9e91);
      streetRibbon(batch, stone ? cobble : asphalt, a, b, width, 0.045, stone ? 3.5 : 7);
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 0.5) continue;
      const tx = dx / length, tz = dz / length, nx = -tz, nz = tx;
      // A narrow curb lip catches warm low-angle light.
      for (const side of [-1, 1]) {
        const off = side * (width / 2 + 0.12);
        const insetA = nodeCounts.get(nodeKey(a)) >= 3 ? Math.min(9, length / 2) : 0;
        const insetB = nodeCounts.get(nodeKey(b)) >= 3 ? Math.min(9, length / 2) : 0;
        if (insetA + insetB < length) span(batch, matte, [a[0] + tx * insetA + nx * off, a[1] + tz * insetA + nz * off], [b[0] - tx * insetB + nx * off, b[1] - tz * insetB + nz * off], 0.22, 0.13, 0.1, 0xaaa69a);
      }
      if (width > 10.5 && !stone) {
        for (let d = 9; d < length - 6; d += 12) {
          span(batch, matte, [a[0] + tx * d, a[1] + tz * d], [a[0] + tx * Math.min(d + 5, length - 3), a[1] + tz * Math.min(d + 5, length - 3)], 0.16, 0.01, 0.058, 0xc4af70);
        }
      }
      for (let d = 17; d < length - 8; d += 43) {
        const side = (index + Math.floor(d / 43)) % 2 ? 1 : -1;
        const x = a[0] + tx * d + nx * side * (width / 2 + 1.35);
        const z = a[1] + tz * d + nz * side * (width / 2 + 1.35);
        cylinder(batch, metal, x, 3.55, z, 0.065, 0.105, 7.0, 0x36413e);
        cylinder(batch, metal, x, 0.4, z, 0.21, 0.28, 0.72, 0x35403c);
        batch.box(metal, x - nx * side * 0.65, 7.02, z - nz * side * 0.65, 0.12, 0.12, 1.5, 0x3b4541, Math.atan2(nx, nz));
        batch.box(metal, x - nx * side * 1.28, 6.94, z - nz * side * 1.28, 0.42, 0.18, 0.7, 0x343c3a, Math.atan2(nx, nz));
        batch.box(glow, x - nx * side * 1.28, 6.84, z - nz * side * 1.28, 0.3, 0.04, 0.54, 0xffffff, Math.atan2(nx, nz));
        if (rng() > 0.62) addTree(batch, matte, x + tx * 7, z + tz * 7, rng);
        if (rng() > 0.48) {
          const hx = x - tx * 5, hz = z - tz * 5;
          cylinder(batch, metal, hx, 0.4, hz, 0.16, 0.2, 0.75, 0x913c2c);
          cylinder(batch, metal, hx, 0.83, hz, 0.04, 0.21, 0.17, 0xb84b32);
          batch.box(metal, hx, 0.54, hz, 0.58, 0.17, 0.18, 0x99452d, Math.atan2(tx, tz));
        }
      }
      for (const [point, direction] of [[a, 1], [b, -1]]) {
        const key = `${Math.round(point[0])},${Math.round(point[1])}`;
        if (!junctions.has(key)) junctions.set(key, []);
        junctions.get(key).push({ x: point[0], z: point[1], tx: tx * direction, tz: tz * direction, width, road });
      }
    }
  });
  for (const entries of junctions.values()) {
    if (entries.length < 3) continue;
    const seen = [];
    for (const e of entries) {
      if (seen.some(s => s.tx * e.tx + s.tz * e.tz > 0.92)) continue;
      seen.push(e);
      const nx = -e.tz, nz = e.tx, distance = 8.5;
      for (let j = -e.width / 2 + 0.7; j < e.width / 2 - 0.4; j += 1.25) {
        const x = e.x + e.tx * distance + nx * j, z = e.z + e.tz * distance + nz * j;
        batch.box(matte, x, 0.072, z, 0.68, 0.013, 3.3, 0xd7d4bd, Math.atan2(e.tx, e.tz));
      }
    }
    const e = entries[0], nx = -e.tz, nz = e.tx;
    const x = e.x + e.tx * 9.5 + nx * (e.width / 2 + 1.1), z = e.z + e.tz * 9.5 + nz * (e.width / 2 + 1.1);
    cylinder(batch, metal, x, 2.0, z, 0.052, 0.065, 4, 0x4a5148);
    const row = roadNames.indexOf(e.road.name || 'SoHo');
    signFace(batch, streetMaterial, x, 3.68, z, e.tx, e.tz, nx, nz, 2.5, 0.38, row, streetAtlas.rows);
    const other = entries.find(other => other.road.name !== e.road.name);
    if (other) signFace(batch, streetMaterial, x, 3.25, z, nx, nz, e.tx, e.tz, 2.5, 0.38, roadNames.indexOf(other.road.name || 'SoHo'), streetAtlas.rows);
    // Compact traffic heads at intersections, with lit amber lenses.
    batch.box(metal, x + nx * 0.23, 2.8, z + nz * 0.23, 0.34, 0.84, 0.26, 0xd39b32, Math.atan2(nx, nz));
    for (let i = 0; i < 3; i++) {
      const lens = new THREE.SphereGeometry(0.089, 6, 4);
      lens.translate(x + nx * 0.4, 2.54 + i * 0.25, z + nz * 0.4);
      batch.add(lens, i === 0 ? glow : matte, null, i === 0 ? 0x83ceaa : 0x263332);
    }
  }

  // The map has a deliberate playable boundary. Construction barriers make
  // the simulation's invisible coordinate clamp readable from the street.
  const boundaryEnds = new Set();
  for (const road of city.roads) {
    if (road.points.length < 2) continue;
    for (const [p, inside] of [[road.points[0], road.points[1]], [road.points.at(-1), road.points.at(-2)]]) {
      const edgeDistance = Math.min(Math.abs(p[0] - bounds.minX), Math.abs(p[0] - bounds.maxX), Math.abs(p[1] - bounds.minZ), Math.abs(p[1] - bounds.maxZ));
      if (edgeDistance > 0.3 || boundaryEnds.has(nodeKey(p))) continue;
      boundaryEnds.add(nodeKey(p));
      const dx = inside[0] - p[0], dz = inside[1] - p[1], len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len, width = road.width || 11;
      for (let d = -width / 2 + 1.25; d < width / 2; d += 2.6) {
        const x = p[0] + nx * d, z = p[1] + nz * d;
        const a = [x - nx * 1.05, z - nz * 1.05], b = [x + nx * 1.05, z + nz * 1.05];
        span(batch, matte, a, b, 0.16, 0.27, 0.94, 0xe8ddbe);
        for (let k = -0.84; k < 1; k += 0.5) {
          span(batch, matte, [x + nx * k, z + nz * k], [x + nx * (k + 0.24), z + nz * (k + 0.24)], 0.18, 0.275, 0.945, 0xcd783d);
        }
        for (const side of [-0.78, 0.78]) {
          batch.box(metal, x + nx * side, 0.47, z + nz * side, 0.12, 0.92, 0.12, 0x5c6257);
          batch.box(metal, x + nx * side, 0.12, z + nz * side, 0.20, 0.13, 0.85, 0x494f47, Math.atan2(dx, dz));
        }
      }
    }
  }

  city.buildings.forEach((building, index) => {
    const rng = random(Number(building.id) || index * 517 + 12);
    let polygon = building.polygon;
    if (!polygon || polygon.length < 3) return;
    if (polygon[0][0] === polygon.at(-1)[0] && polygon[0][1] === polygon.at(-1)[1]) polygon = polygon.slice(0, -1);
    const h = Math.max(4, Math.min(130, building.height || 19));
    const iron = index % 5 < 3;
    const tint = palette[Math.floor(rng() * palette.length)];
    const winding = area(polygon) >= 0 ? 1 : -1;
    const minX = Math.min(...polygon.map(p => p[0])), maxX = Math.max(...polygon.map(p => p[0]));
    const minZ = Math.min(...polygon.map(p => p[1])), maxZ = Math.max(...polygon.map(p => p[1]));
    const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
    const cz = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
    batch.add(topPolygon(polygon, h), matte, null, 0x6d706b);
    let decorated = false;
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.2) return;
      const tx = dx / len, tz = dz / len, nx = tz * winding, nz = -tx * winding;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const nearest = closestStreet(mx, mz, segments);
      const streetFront = nearest.distance < 31 && (nearest.x - mx) * nx + (nearest.z - mz) * nz > 0;
      const floor = Math.min(4.2, h * 0.38);
      // Count an integer number of bays/floors so windows never split at cornices.
      const bays = Math.max(1, Math.round(len / 5.5));
      const floors = Math.max(1, Math.round((h - floor) / 3.65));
      batch.add(quad([[a[0], floor, a[1]], [b[0], floor, b[1]], [b[0], h, b[1]], [a[0], h, a[1]]], [0, 0, bays, 0, bays, floors, 0, floors]), facade[iron ? 1 : 0], null, tint);
      batch.add(quad([[a[0], sidewalkY, a[1]], [b[0], sidewalkY, b[1]], [b[0], floor, b[1]], [a[0], floor, a[1]]]), matte, null, iron ? 0x7c8378 : tint);
      span(batch, matte, a, b, 0.43, 0.34, h + 0.07, 0xc2b7a1);
      span(batch, matte, a, b, 0.62, 0.17, h - 0.48, tint);
      if (!streetFront || len < 4) return;
      span(batch, matte, a, b, 0.27, 0.22, floor, tint);
      const storefronts = Math.max(1, Math.floor(len / 5));
      const bayWidth = len / storefronts;
      for (let s = 0; s < storefronts; s++) {
        const x = a[0] + tx * bayWidth * (s + 0.5), z = a[1] + tz * bayWidth * (s + 0.5);
        const w = Math.max(0.5, bayWidth - 0.62);
        batch.add(quad([[x - tx * w / 2 + nx * 0.06, 0.47, z - tz * w / 2 + nz * 0.06], [x + tx * w / 2 + nx * 0.06, 0.47, z + tz * w / 2 + nz * 0.06], [x + tx * w / 2 + nx * 0.06, floor - 1.05, z + tz * w / 2 + nz * 0.06], [x - tx * w / 2 + nx * 0.06, floor - 1.05, z - tz * w / 2 + nz * 0.06]]), glass, null, 0x314646);
        const doorX = x + tx * w * 0.24, doorZ = z + tz * w * 0.24;
        batch.box(metal, doorX + nx * 0.09, 1.65, doorZ + nz * 0.09, 0.045, 2.4, 0.06, 0xa5a99b);
      }
      const row = index % shopNames.length;
      signFace(batch, shopMaterial, mx, floor - 0.54, mz, tx, tz, nx, nz, Math.min(len - 0.7, 12), 0.69, row, atlas.rows, 0.18);
      if (rng() > 0.25 && len > 6 && len < 35) {
        const awningWidth = Math.min(len - 0.6, 13);
        const awningColor = [0x354e42, 0x7e4939, 0x364951, 0xb4a382][index % 4];
        // A genuinely sloped fabric canopy provides a useful shadow at eye level.
        const lx = mx - tx * awningWidth / 2, lz = mz - tz * awningWidth / 2;
        const rx = mx + tx * awningWidth / 2, rz = mz + tz * awningWidth / 2;
        batch.add(quad([[lx + nx * 0.15, floor - 1.0, lz + nz * 0.15], [rx + nx * 0.15, floor - 1.0, rz + nz * 0.15], [rx + nx * 1.55, floor - 1.48, rz + nz * 1.55], [lx + nx * 1.55, floor - 1.48, lz + nz * 1.55]]), matte, null, awningColor);
        span(batch, matte, [lx + nx * 1.55, lz + nz * 1.55], [rx + nx * 1.55, rz + nz * 1.55], 0.13, 0.29, floor - 1.55, awningColor);
      }
      if (!decorated && index % 4 === 0 && len > 8 && len < 35 && h > 11 && rng() > 0.2) {
        addFireEscape(batch, metal, mx, mz, tx, tz, nx, nz, floor, h);
        decorated = true;
      }
      // Shallow cast-iron columns give the texture physical relief.
      if (iron) for (let d = 0.1; d <= len; d += len / bays) {
        const x = a[0] + tx * d + nx * 0.08, z = a[1] + tz * d + nz * 0.08;
        batch.box(matte, x, (h + floor) / 2, z, 0.15, h - floor, 0.15, tint);
      }
    });
    if (maxX - minX > 8 && maxZ - minZ > 8 && h > 10) {
      batch.box(metal, cx + 1, h + 0.47, cz - 1, 2.3, 0.94, 1.4, 0x8e9590);
      batch.box(metal, cx + 1, h + 1.0, cz - 1, 1.95, 0.12, 1.1, 0x56635e);
      if (index % 7 === 0 && Math.abs(area(polygon)) > 120) addWaterTower(batch, matte, metal, cx, h, cz, rng);
      if (index % 4 === 1) batch.box(matte, cx - 3, h + 1, cz + 2, 1.0, 2.0, 1.0, 0x8d6c57);
    }
  });

  addSkyline(batch, matte, facade[0], bounds);
  batch.finish(group);
  return {
    group,
    update(time, focus) {
      if (!focus) return;
      // Fog hides the tile transition; the extra bounding radius keeps long
      // streets and the large base plane from disappearing near their edges.
      for (const mesh of group.children) {
        const sphere = mesh.geometry.boundingSphere;
        mesh.visible = Math.hypot(sphere.center.x - focus.x, sphere.center.z - focus.z) < 440 + sphere.radius;
      }
    },
  };
}

function addFireEscape(batch, material, x, z, tx, tz, nx, nz, floor, height) {
  const width = 3.5, depth = 1.2, tone = 0x343b37;
  for (let y = floor + 0.35; y < height - 2.2; y += 3.6) {
    const a = [x - tx * width / 2 + nx * 0.65, z - tz * width / 2 + nz * 0.65];
    const b = [x + tx * width / 2 + nx * 0.65, z + tz * width / 2 + nz * 0.65];
    span(batch, material, a, b, depth, 0.08, y, tone);
    const outerA = [a[0] + nx * 0.55, a[1] + nz * 0.55], outerB = [b[0] + nx * 0.55, b[1] + nz * 0.55];
    span(batch, material, outerA, outerB, 0.06, 0.07, y + 0.85, tone);
    for (let d = -width / 2; d < width / 2 + 0.1; d += 0.5) {
      batch.box(material, x + tx * d + nx * 1.2, y + 0.45, z + tz * d + nz * 1.2, 0.045, 0.9, 0.045, tone);
    }
    // The ladder is modelled as two diagonal rails and visible stair treads.
    for (const side of [-0.32, 0.32]) {
      const from = new THREE.Vector3(x - tx * 1.25 + nx * (0.68 + side), y, z - tz * 1.25 + nz * (0.68 + side));
      const to = new THREE.Vector3(x + tx * 1.25 + nx * (0.68 + side), y + 3.6, z + tz * 1.25 + nz * (0.68 + side));
      const direction = to.clone().sub(from);
      const g = new THREE.BoxGeometry(0.045, direction.length(), 0.06);
      dummy.position.copy(from).add(to).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      dummy.scale.set(1, 1, 1); dummy.updateMatrix(); batch.add(g, material, dummy.matrix, tone);
    }
    for (let k = 1; k < 11; k++) {
      const t = k / 11;
      span(batch, material, [x + tx * (-1.25 + t * 2.5) + nx * 0.34, z + tz * (-1.25 + t * 2.5) + nz * 0.34], [x + tx * (-1.25 + t * 2.5) + nx * 1.0, z + tz * (-1.25 + t * 2.5) + nz * 1.0], 0.08, 0.04, y + t * 3.6, tone);
    }
  }
}

function addWaterTower(batch, matte, metal, x, y, z, rng) {
  const radius = 1.5 + rng() * 0.5, tone = 0x927451;
  for (const dx of [-1.0, 1.0]) for (const dz of [-1.0, 1.0]) batch.box(metal, x + dx, y + 1.2, z + dz, 0.13, 2.4, 0.13, 0x464b43);
  cylinder(batch, matte, x, y + 3.5, z, radius, radius, 3.0, tone, 12);
  cylinder(batch, metal, x, y + 2.25, z, radius + 0.045, radius + 0.045, 0.12, 0x4d5148, 12);
  cylinder(batch, metal, x, y + 4.6, z, radius + 0.045, radius + 0.045, 0.12, 0x4d5148, 12);
  cylinder(batch, metal, x, y + 5.45, z, 0, radius + 0.14, 0.9, 0x62685d, 12);
}

function addTree(batch, matte, x, z, rng) {
  const h = 4.4 + rng() * 1.5;
  batch.box(matte, x, 0.13, z, 1.9, 0.15, 1.9, 0x474b3c);
  cylinder(batch, matte, x, h / 2, z, 0.10, 0.18, h, 0x625746, 7);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(1.4 + rng() * 0.6, 1);
    g.scale(1.0, 1.3, 1.0); g.translate(x + (rng() - 0.5) * 1.2, h + i * 0.3, z + (rng() - 0.5) * 1.2);
    batch.add(g, matte, null, [0x58694c, 0x6d7851, 0x887d4c][i]);
  }
}

function addSkyline(batch, matte, facade, bounds) {
  const rng = random(8263), cx = (bounds.minX + bounds.maxX) / 2;
  for (let i = 0; i < 52; i++) {
    const angle = i / 52 * TAU;
    const radius = 570 + rng() * 260;
    const x = cx + Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const h = 35 + Math.pow(rng(), 2) * 125;
    const w = 20 + rng() * 26, d = 20 + rng() * 35;
    batch.box(matte, x, h / 2 - 2, z, w, h, d, [0x8f948e, 0x95988c, 0x777f7c][i % 3]);
    if (i % 3 === 0) batch.box(matte, x, h + 5, z, w * 0.66, 14, d * 0.66, 0x7d8681);
  }
  // A stylized distant Lower Manhattan silhouette, not a traversable landmark.
  const x = bounds.minX - 110, z = bounds.maxZ + 520;
  const tower = new THREE.CylinderGeometry(15, 32, 245, 4); tower.rotateY(Math.PI / 4); tower.translate(x, 122, z);
  batch.add(tower, matte, null, 0x899da2);
  cylinder(batch, matte, x, 275, z, 0.2, 1.15, 62, 0xb9c0b7, 6);
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
  batch.finish(group);
  group.userData.lights = [];
  if (police) {
    for (const [x, tone] of [[-0.38, 0x3379fa], [0.38, 0xfa493d]]) {
      // Each light owns its material so one police car can flash independently.
      const material = new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: 1.5, roughness: 0.22 });
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.24), material);
      light.position.set(x, 1.83, -0.2); group.add(light); group.userData.lights.push(light);
    }
  }
  group.userData.wheels = [];
  for (const x of [-0.90, 0.90]) for (const z of [-1.37, 1.30]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.36, z);
    const tire = new THREE.Mesh(wheelGeometry, tireMaterial); tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    wheel.add(tire, hub); wheel.userData.front = z > 0; group.add(wheel); group.userData.wheels.push(wheel);
  }
  return group;
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
