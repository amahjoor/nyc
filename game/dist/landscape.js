import * as THREE from './vendor/three.module.min.js';
import { mercatorCoefficients, atlasProjectionGLSL } from './imagery-projection.js';

const finite = Number.isFinite;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const contains = (bounds, x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
const validBounds = bounds => bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(finite)
  && bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ;

/** Sample nodes run west to east, then north to south, in the game's metre grid. */
export function prepareTerrain(data, { base = null, blendMargin = 20 } = {}) {
  if (data?.version !== 1 || !validBounds(data.bounds) || !Number.isInteger(data.width) || !Number.isInteger(data.height)
    || data.width < 2 || data.height < 2 || data.width * data.height > 4_000_000 || data.units !== 'meters'
    || !['NAVD88', 'NAVD88 Geoid 12B'].includes(data.verticalDatum) || !data.sourceId || data.heights?.length !== data.width * data.height
    || !data.heights.every(value => value === null || finite(value))) throw new Error('Invalid measured NYC terrain grid.');
  const terrain = { ...data, dx: (data.bounds.maxX - data.bounds.minX) / (data.width - 1),
    dz: (data.bounds.maxZ - data.bounds.minZ) / (data.height - 1), renderedHeights: Float64Array.from(data.heights, value => value === null ? NaN : value) };
  if (base && blendMargin > 0) {
    // Both sides of this LOD seam come from measured DEM samples. Blend node
    // heights, not just graphics, so vehicles follow precisely the same mesh.
    for (let row = 0; row < data.height; row++) for (let column = 0; column < data.width; column++) {
      const i = row * data.width + column, x = data.bounds.minX + column * terrain.dx, z = data.bounds.minZ + row * terrain.dz;
      const distance = Math.min(x - data.bounds.minX, data.bounds.maxX - x, z - data.bounds.minZ, data.bounds.maxZ - z);
      const reference = sampleTerrain(base, x, z), weight = clamp(distance / blendMargin, 0, 1);
      if (reference && finite(terrain.renderedHeights[i])) terrain.renderedHeights[i] = reference.elevation * (1 - weight) + terrain.renderedHeights[i] * weight;
    }
  }
  return terrain;
}

export function sampleTerrain(terrain, x, z) {
  if (!terrain || !finite(x) || !finite(z) || !contains(terrain.bounds, x, z)) return null;
  const gx = (x - terrain.bounds.minX) / terrain.dx, gz = (z - terrain.bounds.minZ) / terrain.dz;
  const column = Math.min(terrain.width - 2, Math.floor(gx)), row = Math.min(terrain.height - 2, Math.floor(gz));
  const u = gx - column, v = gz - row, a = row * terrain.width + column, b = a + 1, c = a + terrain.width, d = c + 1;
  const indices = u + v <= 1 ? [a, b, c] : [d, c, b];
  const values = indices.map(i => terrain.renderedHeights[i]);
  if (!values.every(finite)) return null;
  // Use the mesh's two triangles, rather than bilinear interpolation, which
  // otherwise makes actors float above or sink through a nonplanar DEM cell.
  const first = u + v <= 1, U = first ? u : 1 - u, V = first ? v : 1 - v;
  const [h0, hx, hz] = values;
  const elevation = h0 + (hx - h0) * U + (hz - h0) * V;
  const sign = first ? 1 : -1, nx = -(hx - h0) / terrain.dx * sign, nz = -(hz - h0) / terrain.dz * sign;
  const length = Math.hypot(nx, 1, nz), measured = indices.map(i => terrain.heights[i]);
  return { elevation, measuredElevation: measured[0] + (measured[1] - measured[0]) * U + (measured[2] - measured[0]) * V,
    normal: { x: nx / length, y: 1 / length, z: nz / length }, sourceId: terrain.sourceId,
    verticalDatum: terrain.verticalDatum, resolution: Math.max(terrain.dx, terrain.dz) };
}

export function buildTerrainGeometry(terrain) {
  const positions = new Float32Array(terrain.width * terrain.height * 3), indices = [];
  for (let row = 0; row < terrain.height; row++) for (let column = 0; column < terrain.width; column++) {
    const i = row * terrain.width + column;
    positions.set([terrain.bounds.minX + column * terrain.dx, finite(terrain.renderedHeights[i]) ? terrain.renderedHeights[i] : 0,
      terrain.bounds.minZ + row * terrain.dz], i * 3);
    if (row === terrain.height - 1 || column === terrain.width - 1) continue;
    const a = i, b = i + 1, c = i + terrain.width, d = c + 1;
    for (const triangle of [[a, c, b], [b, c, d]]) if (triangle.every(index => finite(terrain.renderedHeights[index]))) indices.push(...triangle);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));geometry.setIndex(indices);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.userData.sourceId = terrain.sourceId;
  return geometry;
}

function polygonParts(feature) {
  const ring = input => {
    if (!Array.isArray(input) || input.length < 3 || input.some(point => !Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(finite))) return null;
    const result = input.map(([x, z]) => new THREE.Vector2(x, z));
    if (result[0].equals(result.at(-1))) result.pop();
    return result.length >= 3 ? result : null;
  };
  const contour = ring(feature.polygon), holes = (feature.holes || []).map(ring);
  if (!contour || holes.some(hole => !hole)) return null;
  const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
  return { rings: [contour, ...holes], vertices: [...contour, ...holes.flat()], triangles };
}

function geometryFrom(positions, sourceIds, colors = null) {
  const geometry = new THREE.BufferGeometry();geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.userData.sourceIds = sourceIds;return geometry;
}

/** Exact source shorelines and islands; the level is a measured DEM statistic. */
export function buildWaterGeometry(features) {
  const positions = [], sourceIds = [];
  for (const feature of features) {
    if (!feature.sourceId || !finite(feature.elevation)) continue;
    const parts = polygonParts(feature);if (!parts) continue;
    for (const triangle of parts.triangles) {
      const [a, b, c] = triangle.map(i => parts.vertices[i]);
      const points = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 ? [a, c, b] : [a, b, c];
      for (const point of points) positions.push(point.x, feature.elevation + .025, point.y);
    }
    sourceIds.push(feature.id);
  }
  return geometryFrom(positions, sourceIds);
}

function boundaryDistance(point, rings) {
  let squared = Infinity;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dz = b.y - a.y;
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    squared = Math.min(squared, (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dz * t) ** 2);
  }
  return Math.sqrt(squared);
}

/** Crown envelopes retain measured footprints. Branches and trunks are unknown. */
export function buildCanopyGeometry(features, { maxFeatures = 20_000, maxVertices = 1_200_000, focus = null, detailRadius = 120 } = {}) {
  const positions = [], colors = [], sourceIds = [];let truncated = false, approximateTrunks = 0;
  for (const feature of features) {
    if (sourceIds.length >= maxFeatures) { truncated = true;break; }
    const height = feature.maxHeight ?? feature.height;
    if (!feature.sourceId || !finite(feature.baseElevation) || !finite(height) || height <= 1 || height > 100) continue;
    const parts = polygonParts(feature);if (!parts) continue;
    const centerX = feature.x ?? parts.rings[0][0].x, centerZ = feature.z ?? parts.rings[0][0].y;
    const detailed = !focus || Math.hypot(centerX - focus.x, centerZ - focus.z) <= detailRadius;
    if (positions.length / 3 + parts.triangles.length * (detailed ? 39 : 12) + (feature.individualTree ? 72 : 0) > maxVertices) { truncated = true;break; }
    const refined = [];
    for (const triangle of parts.triangles) {
      let [a, b, c] = triangle.map(i => parts.vertices[i]);
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0) [b, c] = [c, b];
      const ab = a.clone().add(b).multiplyScalar(.5), bc = b.clone().add(c).multiplyScalar(.5), ca = c.clone().add(a).multiplyScalar(.5);
      for (const points of detailed ? [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] : [[a, b, c]]) {
        // Interior centroids ensure even a three-point crown has measured
        // height. Every refined face stays inside its original source triangle.
        const center = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
        for (let i = 0; i < 3; i++) refined.push([points[i], points[(i + 1) % 3], center]);
      }
    }
    let maxDistance = .001, interior = null;
    for (const point of refined.flat()) { const distance = boundaryDistance(point, parts.rings);if (distance > maxDistance) { maxDistance = distance;interior = point; } }
    // p10 is a percentile of canopy TOP returns, not a measured crown base.
    // It shapes this visual envelope; its underside remains an approximation.
    // Short segmented vegetation is not verified as an individual tree. Its
    // envelope reaches ground instead of leaving a floating canopy plate.
    const lower = feature.individualTree === false ? .15 : clamp(finite(feature.p10Height) ? feature.p10Height : height * .35, .2, height * .65);
    const color = new THREE.Color(feature.color || '#626b4a');
    const add = (point, y) => { positions.push(point.x, feature.baseElevation + y, point.y);colors.push(color.r, color.g, color.b); };
    for (const points of refined) {
      for (const point of points) add(point, lower + (height - lower) * Math.sqrt(clamp(boundaryDistance(point, parts.rings) / maxDistance, 0, 1)));
    }
    // Close the underside without inventing a trunk position beneath an
    // algorithm-delineated crown. This is an envelope, not an exact tree scan.
    for (const triangle of parts.triangles) for (const i of [...triangle].reverse()) add(parts.vertices[i], lower);
    if (feature.individualTree === true && interior) {
      // Individual crown detection establishes a real tree, not its exact
      // stem. This narrow visual proxy is disclosed and has no collider.
      const supplied = feature.treePoint;
      const center = Array.isArray(supplied) && supplied.length >= 2 && supplied.every(finite)
        && inWater(feature, supplied[0], supplied[1]) ? new THREE.Vector2(...supplied) : interior;
      const radius = Math.min(clamp(Math.sqrt(Math.abs(THREE.ShapeUtils.area(parts.rings[0]))) * .035, .1, .5), boundaryDistance(center, parts.rings) * .35);
      const trunkColor = new THREE.Color('#63584a'), top = lower + (height - lower) * .15;
      const stem = (x, y, z) => { positions.push(x, feature.baseElevation + y, z);colors.push(trunkColor.r, trunkColor.g, trunkColor.b); };
      for (let side = 0; side < 8; side++) {
        const a = side * Math.PI / 4, b = (side + 1) * Math.PI / 4;
        const ax = center.x + Math.cos(a) * radius, az = center.y + Math.sin(a) * radius, bx = center.x + Math.cos(b) * radius, bz = center.y + Math.sin(b) * radius;
        for (const vertex of [[ax, 0, az], [ax, top, az], [bx, top, bz], [ax, 0, az], [bx, top, bz], [bx, 0, bz], [ax, top, az], [center.x, top, center.y], [bx, top, bz]]) stem(...vertex);
      }
      approximateTrunks++;
    }
    sourceIds.push(feature.id);
  }
  const geometry = geometryFrom(positions, sourceIds, colors);
  geometry.userData.approximation = 'Crown envelopes from measured footprints and canopy-top heights. Crown undersides, branch shapes and stem diameters are not measured; individual-tree stems are visual approximations.';
  geometry.userData.approximateTrunks = approximateTrunks;geometry.userData.truncated = truncated;return geometry;
}

function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  const uniforms = { landscapeOrtho: { value: null }, landscapeLocal: { value: null }, landscapeUseOrtho: { value: false },
    landscapeUseLocal: { value: false }, landscapeBounds: { value: new THREE.Vector4() }, landscapeLocalBounds: { value: new THREE.Vector4() },
    landscapeMercator: { value: new THREE.Vector4() }, landscapeLocalMercator: { value: new THREE.Vector4() },
    landscapeUseMercator: { value: false }, landscapeUseLocalMercator: { value: false }, landscapeCoverageCount: { value: 0 },
    landscapeCoverage: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vLandscapeXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLandscapeXZ = position.xz;');
    shader.fragmentShader = `${atlasProjectionGLSL}\n varying vec2 vLandscapeXZ;
      uniform sampler2D landscapeOrtho; uniform sampler2D landscapeLocal;
      uniform bool landscapeUseOrtho; uniform bool landscapeUseLocal; uniform bool landscapeUseMercator; uniform bool landscapeUseLocalMercator;
      uniform vec4 landscapeBounds; uniform vec4 landscapeLocalBounds; uniform vec4 landscapeMercator; uniform vec4 landscapeLocalMercator;
      uniform int landscapeCoverageCount; uniform vec4 landscapeCoverage[16];
      vec2 landscapeUV(vec4 b, vec4 m, bool mercator) {
        vec2 uv = vec2((vLandscapeXZ.x-b.x)/(b.y-b.x), (b.w-vLandscapeXZ.y)/(b.w-b.z));
        if (mercator) uv.y = atlasNorthUV(vLandscapeXZ.y,b,m);
        return uv;
      }
      bool landscapeInside(vec2 uv) { return all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0))); }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      for (int i=0; i<16; i++) {
        if (i>=landscapeCoverageCount) break;
        vec4 b = landscapeCoverage[i];
        if (vLandscapeXZ.x>=b.x && vLandscapeXZ.x<=b.y && vLandscapeXZ.y>=b.z && vLandscapeXZ.y<=b.w) discard;
      }
      if (landscapeUseOrtho) { vec2 uv = landscapeUV(landscapeBounds,landscapeMercator,landscapeUseMercator); if (landscapeInside(uv)) diffuseColor.rgb = texture2D(landscapeOrtho,uv).rgb; }
      if (landscapeUseLocal) { vec2 uv = landscapeUV(landscapeLocalBounds,landscapeLocalMercator,landscapeUseLocalMercator); if (landscapeInside(uv)) { vec4 pixel = texture2D(landscapeLocal,uv); if (pixel.a>0.99) diffuseColor.rgb = pixel.rgb; } }
      `);
  };
  material.userData.uniforms = uniforms;material.name = 'Measured NYC terrain with official aerial imagery';return material;
}

function bindAtlas(material, atlas, local = false) {
  const u = material.userData.uniforms, prefix = local ? 'landscapeLocal' : 'landscape';
  const valid = Boolean(atlas?.texture && validBounds(atlas.bounds));
  u[local ? 'landscapeUseLocal' : 'landscapeUseOrtho'].value = valid;if (!valid) return;
  u[local ? 'landscapeLocal' : 'landscapeOrtho'].value = atlas.texture;
  u[`${prefix}Bounds`].value.set(atlas.bounds.minX, atlas.bounds.maxX, atlas.bounds.minZ, atlas.bounds.maxZ);
  const coefficients = mercatorCoefficients(atlas.bounds, atlas.mercator), mercator = Boolean(coefficients);
  u[local ? 'landscapeUseLocalMercator' : 'landscapeUseMercator'].value = mercator;
  if (mercator) u[`${prefix}Mercator`].value.set(...coefficients);
}

function clipWaterCoverage(material) {
  const uniforms = { landscapeWaterCoverageCount: { value: 0 }, landscapeWaterCoverage: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) } };
  material.userData.coverage = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vLandscapeWaterXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLandscapeWaterXZ=position.xz;');
    shader.fragmentShader = 'varying vec2 vLandscapeWaterXZ; uniform int landscapeWaterCoverageCount; uniform vec4 landscapeWaterCoverage[8];\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      for (int i=0;i<8;i++) { if(i>=landscapeWaterCoverageCount)break; vec4 b=landscapeWaterCoverage[i];
        if(vLandscapeWaterXZ.x>=b.x&&vLandscapeWaterXZ.x<=b.y&&vLandscapeWaterXZ.y>=b.z&&vLandscapeWaterXZ.y<=b.w)discard;
      }`);
  };
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

const inWater = (feature, x, z) => inRing(x, z, feature.polygon) && !(feature.holes || []).some(ring => inRing(x, z, ring));

/** Collision uses official polygons, never the approximated crown mesh or AI masks. */
export function waterContact(feature, x, z, radius = 0) {
  if (!finite(x) || !finite(z) || !finite(radius) || radius < 0) return null;
  const inside = inWater(feature, x, z);let closest = null;
  for (const ring of [feature.polygon, ...(feature.holes || [])]) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const px = a[0] + t * dx, pz = a[1] + t * dz, distance = Math.hypot(x - px, z - pz);
    if (!closest || distance < closest.distance) closest = { x: px, z: pz, distance, dx, dz };
  }
  if (!closest || (!inside && closest.distance >= radius)) return null;
  let nx, nz;
  if (closest.distance > .000001) {
    const sign = inside ? -1 : 1;nx = sign * (x - closest.x) / closest.distance;nz = sign * (z - closest.z) / closest.distance;
  } else {
    const length = Math.hypot(closest.dx, closest.dz) || 1;nx = -closest.dz / length;nz = closest.dx / length;
    if (inWater(feature, x + nx * .01, z + nz * .01)) { nx = -nx;nz = -nz; }
  }
  return { kind: 'water', id: feature.id, sourceId: feature.sourceId, nx, nz, depth: radius + (inside ? closest.distance : -closest.distance),
    elevation: feature.elevation, inside };
}

export function reviewedWaterFeatures(report, official, origin) {
  if (report?.version !== 1 || !Array.isArray(report.features) || !origin || report.origin?.lat !== origin.lat || report.origin?.lon !== origin.lon) return [];
  const id = value => String(value ?? '').replace(/\.0$/, ''), result = [];
  for (const mask of report.features) {
    if (mask.kind !== 'water' || mask.accepted !== true) continue;
    const source = official.find(feature => id(feature.sourceFeatureId ?? feature.id) === id(mask.sourceId));
    if (!source || !finite(source.elevation)) continue;
    const geometry = mask.localGeometry, polygons = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
    for (const [part, rings] of polygons.entries()) {
      if (!Array.isArray(rings) || !rings.length) continue;
      const feature = { id: `sam:${mask.id}:${part}`, sourceId: source.sourceId, sourceFeatureId: source.id,
        polygon: rings[0], holes: rings.slice(1), elevation: source.elevation + .02 };
      if (polygonParts(feature)) result.push(feature);
    }
  }
  return result;
}

/** A small bounded set of surveyed regions overlays the citywide measured DEM. */
export class Landscape {
  constructor({ scene, index, orthophoto, localOrthophoto, fetcher = globalThis.fetch.bind(globalThis), onStatus = () => {}, onChange = () => {},
    now = () => Date.now(), maxCache = 4, concurrency = 2, radius = 1800 } = {}) {
    if (index?.version !== 1 || !Array.isArray(index.regions)) throw new Error('Invalid NYC landscape index.');
    this.index = index;this.scene = scene;this.fetcher = fetcher;this.onStatus = onStatus;this.onChange = onChange;this.now = now;
    this.maxCache = clamp(maxCache, 1, 8);this.concurrency = clamp(concurrency, 1, 4);this.radius = radius;
    this.orthophoto = orthophoto;this.localOrthophoto = localOrthophoto;
    this.group = new THREE.Group();this.group.name = 'Measured NYC landscape reconstruction';scene?.add(this.group);
    this.cache = new Map();this.pending = new Map();this.errors = new Map();this.wanted = new Map();this.preparing = new Map();this.serial = 0;this.disposed = false;
    this.layers = { terrain: true, water: true, vegetation: true };this.base = null;this.basePromise = null;this.baseWaterReady = false;this.review = null;this.focus = { x: 0, z: 0 };
    this.terrainOverlays = new Map();this.retainedTerrainRegions = new Map();
  }

  async _json(url, signal) {
    const response = await this.fetcher(url, { signal });if (!response.ok) throw new Error(`NYC landscape source unavailable (${response.status}).`);return response.json();
  }

  loadBase() {
    if (this.disposed) return Promise.resolve(null);
    if (this.basePromise) return this.basePromise;
    // A failed hydrography request stays retryable without rebuilding measured
    // terrain. Only a loaded water list makes an exact ground pin verifiable.
    if (this.base && (this.baseWaterReady || !this.index.baseFeaturesUrl)) return Promise.resolve(this.base);
    if (!this.index.baseTerrain?.url) return Promise.resolve(null);
    const controller = new AbortController();this.baseController = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    this.basePromise = (async () => {
      try {
        if (!this.base) {
          const data = await this._json(this.index.baseTerrain.url, controller.signal);
          if (this.disposed || controller.signal.aborted) return null;
          this.base = this._build(prepareTerrain(data), { water: [], canopies: [] });this.base.group.visible = true;
          this.onChange();this._report();
        }
        if (this.index.baseFeaturesUrl) {
          try {
            const features = await this._json(this.index.baseFeaturesUrl, controller.signal);
            if (this.disposed || controller.signal.aborted) return null;
            if (features?.version !== 1 || !Array.isArray(features.water)) throw new Error('Invalid measured NYC water coverage.');
            this._features(this.base, features);this.baseWaterReady = true;this.errors.delete('base-features');this.onChange();
          }
          catch (error) { if (!this.disposed) this.errors.set('base-features', { error: error.message, retryAt: Infinity }); }
        }
        this._report();return this.base;
      } finally { clearTimeout(timer);this.basePromise = null; }
    })();
    return this.basePromise;
  }

  _build(terrain, features, regionId = null) {
    const group = new THREE.Group(), material = createTerrainMaterial(), mesh = new THREE.Mesh(buildTerrainGeometry(terrain), material);
    mesh.receiveShadow = true;mesh.name = 'Surveyed terrain';group.add(mesh);this.group.add(group);
    bindAtlas(material, this.orthophoto);bindAtlas(material, this.localOrthophoto, true);
    const entry = { terrain, group, mesh, material, regionId, used: ++this.serial, water: null, vegetation: null };
    this._features(entry, features);return entry;
  }

  _features(entry, features) {
    const water = Array.isArray(features?.water) ? features.water : [], canopies = Array.isArray(features?.canopies) ? features.canopies : [];
    entry.waterFeatures = water.filter(feature => feature.sourceId && polygonParts(feature))
      .map(feature => ({ ...feature, bounds: { minX: Math.min(...feature.polygon.map(point => point[0])), maxX: Math.max(...feature.polygon.map(point => point[0])),
        minZ: Math.min(...feature.polygon.map(point => point[1])), maxZ: Math.max(...feature.polygon.map(point => point[1])) } }));
    entry.allWaterFeatures = entry.waterFeatures;
    entry.waterById = new Map(entry.waterFeatures.map(feature => [feature.id, feature]));entry.waterSpatial = new Map();
    for (const feature of entry.waterFeatures) {
      const b = feature.bounds;
      for (let x = Math.floor(b.minX / 500); x <= Math.floor(b.maxX / 500); x++) for (let z = Math.floor(b.minZ / 500); z <= Math.floor(b.maxZ / 500); z++) {
        const key = `${x},${z}`;if (!entry.waterSpatial.has(key)) entry.waterSpatial.set(key, []);entry.waterSpatial.get(key).push(feature);
      }
    }
    if (water.length) {
      const geometry = buildWaterGeometry(water), material = new THREE.MeshStandardMaterial({ color: 0x647773, roughness: .3, metalness: .08, side: THREE.DoubleSide });
      clipWaterCoverage(material);
      // Shoreline and elevation are surveyed; optical water appearance is a
      // visualization, not a claim about water color or a new physical feature.
      entry.water = new THREE.Mesh(geometry, material);entry.water.name = 'Mapped NYC water';entry.water.receiveShadow = true;entry.group.add(entry.water);
    }
    if (canopies.length) {
      entry.canopyFeatures = canopies;entry.vegetationSelection = null;
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
      entry.vegetation = new THREE.Mesh(new THREE.BufferGeometry(), material);entry.vegetation.name = 'Measured crown envelopes';entry.vegetation.castShadow = true;
      entry.vegetation.receiveShadow = true;entry.group.add(entry.vegetation);
      this._updateVegetation(entry);
    }
    this._reviewedWater(entry);
    this._applyLayers(entry);
  }

  _reviewedWater(entry) {
    if (entry.reviewedWater) {
      entry.group.remove(entry.reviewedWater);entry.reviewedWater.geometry.dispose();entry.reviewedWater.material.dispose();entry.reviewedWater = null;
    }
    const features = reviewedWaterFeatures(this.review, entry.waterFeatures, this.index.origin);if (!features.length) return;
    const material = new THREE.MeshStandardMaterial({ color: 0x648081, roughness: .18, metalness: .05, transparent: true, opacity: .32,
      depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    clipWaterCoverage(material);
    entry.reviewedWater = new THREE.Mesh(buildWaterGeometry(features), material);entry.reviewedWater.name = 'AI-reviewed visible water surface';
    entry.reviewedWater.receiveShadow = true;entry.reviewedWater.visible = this.layers.water;entry.group.add(entry.reviewedWater);
    // Masks refine visible optical appearance only. Official polygons remain
    // authoritative for all water queries, collision and measured elevation.
  }

  _updateVegetation(entry) {
    if (!entry.vegetation) return;
    entry.vegetation.visible = this.layers.vegetation && !this.overview;
    if ((this.overview && !this.preparing.has(entry.regionId)) || !this.layers.vegetation) return;
    const focus = this.preparing.get(entry.regionId)?.point || this.focus;
    const x = Math.floor(focus.x / 150), z = Math.floor(focus.z / 150), selection = `${x},${z}`;
    if (entry.vegetationSelection === selection) return;
    // Build only when crossing a 150 m cell. The extra cell margin prevents
    // trees disappearing within the 350 m view radius before the next rebuild.
    const center = { x: (x + .5) * 150, z: (z + .5) * 150 };
    const distance = feature => Math.hypot((feature.x ?? feature.polygon[0][0]) - center.x, (feature.z ?? feature.polygon[0][1]) - center.z);
    const selected = entry.canopyFeatures.filter(feature => distance(feature) <= 460).sort((a, b) => distance(a) - distance(b));
    entry.vegetationSelection = selection;const generation = (entry.vegetationGeneration || 0) + 1;entry.vegetationGeneration = generation;
    entry.vegetationLoading = true;
    entry.vegetationTask = (async () => {
      const parts = [], sourceIds = [];let count = 0, approximateTrunks = 0, truncated = false;
      // A 12,000-crown region must not block steering on the main thread.
      // Build nearby features in small cooperative batches while retaining
      // the previous GPU mesh until its complete replacement is ready.
      for (let offset = 0; offset < selected.length; offset += 96) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (this.disposed || entry.vegetationGeneration !== generation || !entry.group.parent) return;
        const geometry = buildCanopyGeometry(selected.slice(offset, offset + 96), { focus: center, maxFeatures: 6000 - sourceIds.length, maxVertices: 1_200_000 - count });
        const p = geometry.attributes.position.array, n = geometry.attributes.normal.array, c = geometry.attributes.color.array;
        parts.push({ p, n, c });count += p.length / 3;sourceIds.push(...geometry.userData.sourceIds);
        approximateTrunks += geometry.userData.approximateTrunks;truncated ||= geometry.userData.truncated;geometry.dispose();
        if (truncated) break;
      }
      if (this.disposed || entry.vegetationGeneration !== generation || !entry.group.parent) return;
      const geometry = new THREE.BufferGeometry(), positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
      let offset = 0;for (const part of parts) { positions.set(part.p, offset);normals.set(part.n, offset);colors.set(part.c, offset);offset += part.p.length; }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));geometry.computeBoundingSphere();
      Object.assign(geometry.userData, { sourceIds, approximateTrunks, truncated,
        approximation: 'Measured crown footprints and canopy-top heights; crown volume, underside and stems approximated.' });
      const previous = entry.vegetation.geometry;entry.vegetation.geometry = geometry;previous.dispose();entry.vegetationLoading = false;this._report();
    })().catch(error => { if (!this.disposed && entry.vegetationGeneration === generation) { entry.vegetationLoading = false;entry.vegetationError = error.message;this._report(); } });
  }

  _applyLayers(entry) {
    entry.mesh.visible = this.layers.terrain;
    if (entry.water) entry.water.visible = this.layers.water;
    if (entry.reviewedWater) entry.reviewedWater.visible = this.layers.water;
    if (entry.vegetation) entry.vegetation.visible = this.layers.vegetation && !this.overview;
  }

  _release(entry) {
    entry.vegetationGeneration = (entry.vegetationGeneration || 0) + 1;
    this.group.remove(entry.group);
    entry.group.traverse(object => { object.geometry?.dispose();object.material?.dispose(); });
  }

  _coverage() {
    if (!this.base) return;
    const u = this.base.material.userData.uniforms, entries = [...this.cache.entries()].filter(([id]) => this.wanted.has(id));
    const overlays = [...this.terrainOverlays.values()];
    const cover = (uniforms, replacements) => {
      uniforms.landscapeCoverageCount.value = this.layers.terrain ? replacements.length : 0;
      replacements.forEach((entry, i) => { const b = entry.terrain.bounds;uniforms.landscapeCoverage.value[i].set(b.minX, b.maxX, b.minZ, b.maxZ); });
    };
    cover(u, [...entries.map(([, entry]) => entry), ...overlays]);
    // A baked road patch replaces every older terrain LOD, including an
    // overlapping park. Hiding only the base would leave two competing meshes.
    for (const entry of this.cache.values()) cover(entry.material.userData.uniforms, overlays);
    for (const mesh of [this.base.water, this.base.reviewedWater]) {
      const coverage = mesh?.material.userData.coverage;if (!coverage) continue;
      // Mask only the refined rectangle, not the entire source lake. A lake
      // can cross a detail boundary and must remain visible on its other side.
      coverage.landscapeWaterCoverageCount.value = entries.length;
      entries.forEach(([, entry], i) => { const b = entry.terrain.bounds;coverage.landscapeWaterCoverage.value[i].set(b.minX, b.maxX, b.minZ, b.maxZ); });
    }
  }

  _report() { if (!this.disposed) this.onStatus(this.getStatus()); }

  _pump() {
    if (this.disposed) return;
    for (const [id, region] of this.wanted) {
      if (this.pending.size >= this.concurrency) break;
      if (this.cache.has(id) || this.pending.has(id) || (this.errors.get(id)?.retryAt || 0) > this.now()) continue;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);this.pending.set(id, controller);
      controller.task = (async () => {
        try {
          await this.loadBase();
          const [data, features] = await Promise.all([this._json(region.terrainUrl, controller.signal),
            region.featuresUrl ? this._json(region.featuresUrl, controller.signal) : { water: [], canopies: [] }]);
          if (this.disposed || controller.signal.aborted || !this.wanted.has(id) || this.pending.get(id) !== controller) return;
          // Rectangle coverage can replace coarse triangles only when fine
          // nodes have complete coverage. Missing measurements retain the base.
          if (data.heights?.some(value => value === null)) throw new Error('Detail terrain contains missing elevation samples.');
          const entry = this._build(prepareTerrain(data, { base: this.base?.terrain, blendMargin: region.blendMargin ?? 20 }), features, id);
          this.cache.set(id, entry);this.errors.delete(id);this._coverage();this.onChange();
        } catch (error) {
          if (!this.disposed && this.wanted.has(id) && this.pending.get(id) === controller) this.errors.set(id, { error: error.message, retryAt: this.now() + 5000 });
        } finally {
          clearTimeout(timer);if (this.pending.get(id) === controller) this.pending.delete(id);
          if (!this.disposed) { this._trim();this._report();this._pump(); }
        }
      })();
    }
  }

  _trim() {
    for (const [id, entry] of [...this.cache].sort((a, b) => a[1].used - b[1].used)) {
      if (this.cache.size <= this.maxCache) break;
      if (!this.wanted.has(id)) { this._release(entry);this.cache.delete(id); }
    }
  }

  update(focus, { overview = false } = {}) {
    if (this.disposed || !finite(focus?.x) || !finite(focus?.z)) return;
    const previous = [...this.wanted.keys()].join(','), previousOverview = this.overview;
    this.focus = { x: focus.x, z: focus.z };this.overview = overview;
    const distance = b => Math.hypot(Math.max(b.minX - focus.x, 0, focus.x - b.maxX), Math.max(b.minZ - focus.z, 0, focus.z - b.maxZ));
    const nearby = this.index.regions.filter(region => validBounds(region.bounds) && distance(region.bounds) <= this.radius)
      .sort((a, b) => distance(a.bounds) - distance(b.bounds));
    // Animation continues around the old player while travel awaits its new
    // destination. Keep those awaited regions owned until prepareAt settles.
    const selected = [...this.preparing.values()].map(value => value.region);
    for (const id of this.retainedTerrainRegions.keys()) {
      const region = this.index.regions.find(candidate => candidate.id === id);
      if (region && !selected.some(candidate => candidate.id === id)) selected.push(region);
    }
    for (const region of nearby) if (!selected.some(candidate => candidate.id === region.id)) selected.push(region);
    selected.length = Math.min(selected.length, this.maxCache);
    this.wanted = new Map(selected.map(region => [region.id, region]));
    for (const [id, controller] of this.pending) if (!this.wanted.has(id)) { controller.abort();this.pending.delete(id); }
    for (const [id, entry] of this.cache) { entry.group.visible = this.wanted.has(id);if (entry.group.visible) { entry.used = ++this.serial;this._updateVegetation(entry); } }
    for (const id of this.errors.keys()) if (id !== 'base-features' && !this.wanted.has(id)) this.errors.delete(id);
    this._coverage();this._trim();this._pump();
    if (previous !== [...this.wanted.keys()].join(',')) { this.onChange();this._report(); }
    else if (previousOverview !== overview) this._report();
  }

  sampleSurface(x, z) {
    for (const entry of this.terrainOverlays.values()) {
      const sample = sampleTerrain(entry.terrain, x, z);if (sample) return sample;
    }
    let result = this.base ? sampleTerrain(this.base.terrain, x, z) : null;
    for (const [id, entry] of this.cache) {
      if (!this.wanted.has(id)) continue;
      const sample = sampleTerrain(entry.terrain, x, z);if (sample && (!result || sample.resolution < result.resolution)) result = sample;
    }
    return result;
  }

  sampleHeight(x, z) { return this.sampleSurface(x, z)?.elevation ?? 0; }
  async retainTerrainRegion(id) {
    const region = this.index.regions.find(candidate => candidate.id === id);
    if (!region || this.disposed) throw new Error('Road pilot background terrain is unavailable.');
    this.retainedTerrainRegions.set(id, (this.retainedTerrainRegions.get(id) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;released = true;
      const count = this.retainedTerrainRegions.get(id) || 0;
      if (count > 1) this.retainedTerrainRegions.set(id, count - 1);else this.retainedTerrainRegions.delete(id);
      if (!this.disposed) this.update(this.focus, { overview: this.overview });
    };
    try {
      // A baked patch can meet an older detailed park at its boundary. Keep
      // that prerequisite resident even after travel or overview changes.
      const b = region.bounds;
      await this.prepareAt({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });
      if (!this.cache.has(id)) throw new Error('Road pilot background terrain did not load.');
      return release;
    } catch (error) { release();throw error; }
  }
  async prepareAt(point) {
    const regions = this.index.regions.filter(region => validBounds(region.bounds) && contains(region.bounds, point.x, point.z));
    for (const region of regions) {
      const existing = this.preparing.get(region.id);
      this.preparing.set(region.id, { region, point: { x: point.x, z: point.z }, count: (existing?.count || 0) + 1 });
    }
    try {
      await this.loadBase();if (this.disposed) return null;this.update(point);
      const ids = regions.map(region => region.id);
      while (ids.some(id => !this.cache.has(id))) {
        const error = ids.map(id => this.errors.get(id)).find(Boolean);if (error) throw new Error(error.error);
        const tasks = [...this.pending.values()].map(controller => controller.task).filter(Boolean);
        if (!tasks.length) break;await Promise.all(tasks);if (this.disposed) return null;
      }
      await Promise.all(ids.map(id => this.cache.get(id)?.vegetationTask));
      if (this.disposed) return null;return this.sampleSurface(point.x, point.z);
    } finally {
      for (const region of regions) {
        const value = this.preparing.get(region.id);if (!value) continue;
        if (value.count > 1) value.count--;else this.preparing.delete(region.id);
      }
    }
  }
  *_waterFeatures(x, z, radius = 0) {
    const fine = [...this.cache.entries()].filter(([id]) => this.wanted.has(id)).map(([, entry]) => entry);
    const candidates = entry => {
      const result = new Set();
      for (let column = Math.floor((x - radius) / 500); column <= Math.floor((x + radius) / 500); column++) {
        for (let row = Math.floor((z - radius) / 500); row <= Math.floor((z + radius) / 500); row++) {
          for (const feature of entry?.waterSpatial.get(`${column},${row}`) || []) result.add(feature);
        }
      }
      return result;
    };
    for (const feature of candidates(this.base)) {
      let level = null;
      for (const entry of fine) if (contains(entry.terrain.bounds, x, z)) {
        const candidate = entry.waterById.get(feature.id);if (candidate && finite(candidate.elevation)) { level = candidate;break; }
      }
      // Fine assets contain clipped polygons. Their artificial tile edges
      // are not shorelines: retain the full official outline for collision.
      yield level ? { ...feature, elevation: level.elevation } : feature;
    }
    for (const entry of fine) for (const feature of candidates(entry)) if (!this.base?.waterById.has(feature.id)) yield feature;
  }
  waterAt(x, z) {
    for (const feature of this._waterFeatures(x, z)) if (contains(feature.bounds, x, z) && inWater(feature, x, z)) return feature;
    return null;
  }
  contactAt(x, z, radius = 0) {
    if (!finite(x) || !finite(z) || !finite(radius) || radius < 0) return null;
    let contact = null;
    for (const feature of this._waterFeatures(x, z, radius)) {
      const b = feature.bounds;
      if (x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue;
      const next = waterContact(feature, x, z, radius);if (next && (!contact || next.depth > contact.depth)) contact = next;
    }
    return contact;
  }
  addTerrainOverlay(id, data) {
    if (this.disposed) throw new Error('Landscape is disposed.');
    if (!id || this.terrainOverlays.has(id) || this.terrainOverlays.size >= 8) throw new Error('Invalid terrain overlay identity.');
    const terrain = prepareTerrain(data);
    if (data.heights.some(value => value === null)) throw new Error('Road detail contains missing elevation samples.');
    for (const entry of this.terrainOverlays.values()) {
      const a = entry.terrain.bounds, b = terrain.bounds;
      if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ) throw new Error('Terrain overlays must not overlap.');
    }
    // The offline build already blends the patch boundary to the published
    // background terrain. Reblending here would desynchronize road triangles.
    const entry = this._build(terrain, { water: [], canopies: [] }, id);
    this.terrainOverlays.set(id, entry);this._coverage();this.onChange();return terrain;
  }
  removeTerrainOverlay(id) {
    const entry = this.terrainOverlays.get(id);if (!entry) return;
    this._release(entry);this.terrainOverlays.delete(id);this._coverage();this.onChange();
  }
  setOrthophoto(atlas) { this.orthophoto = atlas;for (const entry of [this.base, ...this.cache.values(), ...this.terrainOverlays.values()]) if (entry) bindAtlas(entry.material, atlas); }
  setLocalOrthophoto(atlas) { this.localOrthophoto = atlas;for (const entry of [this.base, ...this.cache.values(), ...this.terrainOverlays.values()]) if (entry) bindAtlas(entry.material, atlas, true); }
  setReconstructionReview(report) {
    this.review = report;for (const entry of [this.base, ...this.cache.values()]) if (entry) this._reviewedWater(entry);this._coverage();this._report();
  }
  setLayers(layers) {
    for (const name of Object.keys(this.layers)) if (typeof layers?.[name] === 'boolean') this.layers[name] = layers[name];
    for (const entry of [this.base, ...this.cache.values(), ...this.terrainOverlays.values()]) if (entry) { this._applyLayers(entry);this._updateVegetation(entry); }this._coverage();
  }
  getStatus() {
    return { baseReady: Boolean(this.base), baseWaterReady: this.baseWaterReady, cachedRegions: this.cache.size, activeRegions: [...this.cache.keys()].filter(id => this.wanted.has(id)),
      loading: this.pending.size + [...this.cache.values()].filter(entry => entry.vegetationLoading).length,
      failures: this.errors.size + [...this.cache.values()].filter(entry => entry.vegetationError).length,
      error: [...this.errors.values()].at(-1)?.error || [...this.cache.values()].find(entry => entry.vegetationError)?.vegetationError || null,
      canopies: [...this.cache.entries()].filter(([id, entry]) => this.wanted.has(id) && entry.vegetation?.visible).reduce((sum, [, entry]) => sum + (entry.vegetation.geometry.userData.sourceIds?.length || 0), 0),
      sourceCanopies: [...this.cache.entries()].filter(([id]) => this.wanted.has(id)).reduce((sum, [, entry]) => sum + (entry.canopyFeatures?.length || 0), 0),
      canopyBudgetLimited: [...this.cache.entries()].some(([id, entry]) => this.wanted.has(id) && entry.vegetation?.geometry.userData.truncated),
      reviewedWaterParts: [this.base, ...this.cache.values()].reduce((sum, entry) => sum + (entry?.reviewedWater?.geometry.userData.sourceIds.length || 0), 0),
      terrainOverlays: [...this.terrainOverlays.keys()], verticalDatum: 'NAVD88', layers: { ...this.layers } };
  }
  dispose() {
    if (this.disposed) return;this.disposed = true;this.baseController?.abort();
    for (const controller of this.pending.values()) controller.abort();this.pending.clear();
    if (this.base) this._release(this.base);for (const entry of this.cache.values()) this._release(entry);
    for (const entry of this.terrainOverlays.values()) this._release(entry);this.terrainOverlays.clear();
    this.cache.clear();this.wanted.clear();this.preparing.clear();this.retainedTerrainRegions.clear();this.errors.clear();this.scene?.remove(this.group);
  }
}
