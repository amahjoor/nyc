import * as THREE from './vendor/three.module.min.js';
import { atlasProjectionGLSL, mercatorCoefficients } from './imagery-projection.js';

const CELL_SIZE = 32;
const SURFACE_KINDS = new Set(['roadbed', 'parking', 'bridge']);
const MODES = new Set(['aerial', 'reconstructed']);

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)])));
  return value;
}

function heightOn(triangle, x, z, inside = true) {
  const { a, b, c } = triangle;
  const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
  const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
  const wc = 1 - wa - wb;
  return inside && Math.min(wa, wb, wc) < -1e-7 ? null : wa * a.y + wb * b.y + wc * c.y;
}

function prepareSurface(feature, data) {
  const positions = feature?.geometry?.positions, sourceIndices = feature?.geometry?.indices;
  if (!feature?.id || !feature.sourceId || !SURFACE_KINDS.has(feature.kind)
    || (feature.verticalDatum || data.verticalDatum) !== 'NAVD88'
    || (feature.elevationUnits || data.elevationUnits || data.units) !== 'meters'
    || !Array.isArray(positions) || positions.length < 9 || positions.length % 3
    || !positions.every(Number.isFinite) || !Array.isArray(sourceIndices) || !sourceIndices.length || sourceIndices.length % 3
    || !sourceIndices.every(index => Number.isInteger(index) && index >= 0 && index < positions.length / 3)) return null;
  // Physics samples exactly the float32 triangles sent to the GPU, including
  // the measured slope within each triangle. A separate smoothed height field
  // would leave tires above or underneath the visible pavement.
  const values = new Float32Array(positions);
  if (![...values].every(Number.isFinite)) return null;
  const point = index => ({ x: values[index * 3], y: values[index * 3 + 1], z: values[index * 3 + 2] });
  const triangles = [], indices = [];
  for (let i = 0; i < sourceIndices.length; i += 3) {
    let order = sourceIndices.slice(i, i + 3), [a, b, c] = order.map(point);
    if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-7) continue;
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z)).normalize();
    if (normal.y < 0) { order = [order[0], order[2], order[1]];[a, b, c] = order.map(point);normal.negate(); }
    indices.push(...order);
    triangles.push({ a, b, c, normal: { x: normal.x, y: normal.y, z: normal.z },
      bounds: { minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z) } });
  }
  if (!triangles.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(values, 3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return { id: feature.id, sourceFeatureId: feature.sourceFeatureId || feature.id, sourceId: feature.sourceId, kind: feature.kind,
    transportId: feature.kind === 'bridge' ? feature.transportId || feature.id : null,
    sourceUrl: feature.sourceUrl || null, elevationSource: frozenCopy(feature.elevationSource || data.terrain || {}),
    geometry, triangles };
}

function surfaceMaterial(appearance = {}, origin = { x: 0, z: 0 }) {
  const color = /^#[0-9a-f]{6}$/i.test(appearance.color || '') ? appearance.color : '#777773';
  const material = new THREE.MeshStandardMaterial({ color, roughness: Math.max(.7, Math.min(1, appearance.roughness ?? .94)), metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  material.name = 'Source-sampled pavement with declared fine material approximation';
  const variation = Math.max(0, Math.min(.025, Number(appearance.colorVariation) || 0));
  if (variation) {
    material.onBeforeCompile = shader => {
      shader.uniforms.pilotVariation = { value: variation };
      shader.uniforms.pilotMaterialOrigin = { value: new THREE.Vector2(origin.x, origin.z) };
      shader.vertexShader = 'varying vec2 vPilotMaterialXZ; uniform vec2 pilotMaterialOrigin;\n' + shader.vertexShader;
      // Keep the high-frequency phase near this surface. Multiplying absolute
      // NYC coordinates by the grain frequency loses detail in GPU float32.
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPilotMaterialXZ = position.xz - pilotMaterialOrigin;');
      shader.fragmentShader = 'varying vec2 vPilotMaterialXZ; uniform float pilotVariation;\n' + shader.fragmentShader;
      // Tiny, zero-mean aggregate is a material approximation, not a claim
      // about individual cracks, painted lines, or surveyed road geometry.
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float grain = sin(vPilotMaterialXZ.x * 163.7) * sin(vPilotMaterialXZ.y * 141.3);
        float grainFade = 1.0 - smoothstep(0.01, 0.04, max(length(dFdx(vPilotMaterialXZ)), length(dFdy(vPilotMaterialXZ))));
        diffuseColor.rgb *= 1.0 + grain * grainFade * pilotVariation;`);
    };
    material.customProgramCacheKey = () => 'nyc-road-pilot-aggregate-v2';
  }
  return material;
}

function configureAtlas(prefix, uniforms, atlas) {
  const b = atlas?.bounds, valid = Boolean(atlas?.texture && b && [b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite) && b.maxX > b.minX && b.maxZ > b.minZ);
  uniforms[`${prefix}Enabled`].value = valid;
  if (!valid) return;
  const coefficients = mercatorCoefficients(b, atlas.mercator);
  uniforms[prefix].value = atlas.texture;
  uniforms[`${prefix}Bounds`].value.set(b.minX, b.maxX, b.minZ, b.maxZ);
  uniforms[`${prefix}Mercator`].value.set(...(coefficients || [0, 0, 0, 0]));
  uniforms[`${prefix}IsMercator`].value = Boolean(coefficients);
}

function aerialMaterial(orthophoto) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  material.name = 'Unedited source aerial on the same reconstructed road triangles';
  const uniforms = {};
  for (const prefix of ['pilotBase', 'pilotLocal']) {
    uniforms[prefix] = { value: null };uniforms[`${prefix}Bounds`] = { value: new THREE.Vector4() };
    uniforms[`${prefix}Mercator`] = { value: new THREE.Vector4() };uniforms[`${prefix}IsMercator`] = { value: false };uniforms[`${prefix}Enabled`] = { value: false };
  }
  configureAtlas('pilotBase', uniforms, orthophoto);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vPilotXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPilotXZ = position.xz;');
    shader.fragmentShader = `${atlasProjectionGLSL}
      varying vec2 vPilotXZ;
      uniform sampler2D pilotBase; uniform vec4 pilotBaseBounds; uniform vec4 pilotBaseMercator;
      uniform bool pilotBaseEnabled; uniform bool pilotBaseIsMercator;
      uniform sampler2D pilotLocal; uniform vec4 pilotLocalBounds; uniform vec4 pilotLocalMercator;
      uniform bool pilotLocalEnabled; uniform bool pilotLocalIsMercator;
      vec2 pilotUV(vec4 bounds, vec4 coefficients, bool mercator) {
        return vec2((vPilotXZ.x - bounds.x) / (bounds.y - bounds.x), mercator
          ? atlasNorthUV(vPilotXZ.y, bounds, coefficients) : (bounds.w - vPilotXZ.y) / (bounds.w - bounds.z));
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (pilotBaseEnabled) {
        vec2 sourceUV = pilotUV(pilotBaseBounds, pilotBaseMercator, pilotBaseIsMercator);
        diffuseColor.rgb = texture2D(pilotBase, clamp(sourceUV, 0.0, 1.0)).rgb;
      }
      if (pilotLocalEnabled) {
        vec2 sourceUV = pilotUV(pilotLocalBounds, pilotLocalMercator, pilotLocalIsMercator);
        if (all(greaterThanEqual(sourceUV, vec2(0.0))) && all(lessThanEqual(sourceUV, vec2(1.0)))) {
          vec4 localPixel = texture2D(pilotLocal, sourceUV);
          if (localPixel.a > 0.99) diffuseColor.rgb = localPixel.rgb;
        }
      }`);
  };
  material.customProgramCacheKey = () => 'nyc-road-pilot-aerial-v1';
  return { material, uniforms };
}

function insertTriangle(cells, large, triangle) {
  const b = triangle.bounds, x0 = Math.floor(b.minX / CELL_SIZE), x1 = Math.floor(b.maxX / CELL_SIZE), z0 = Math.floor(b.minZ / CELL_SIZE), z1 = Math.floor(b.maxZ / CELL_SIZE);
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) { large.push(triangle);return; }
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const key = `${x},${z}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(triangle);
  }
}

function clipTriangle(points, support) {
  let polygon = points;
  const ring = [support.a, support.c, support.b]; // CCW in the X/Z projection.
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = ring[edge], b = ring[(edge + 1) % 3], output = [];
    const side = p => (b.x - a.x) * (p[1] - a.z) - (b.z - a.z) * (p[0] - a.x);
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = side(p), dq = side(q);
      if (dp >= -1e-8) output.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    polygon = output;
  }
  return polygon;
}

function markingGeometry(marking, surfaces) {
  const positions = [], indices = [];
  for (const polygon of marking.polygons || []) {
    const rings = [polygon.outer, ...(polygon.holes || [])];
    if (!rings.every(ring => Array.isArray(ring) && ring.length >= 3 && ring.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) continue;
    const contours = rings.map(ring => ring.map(p => new THREE.Vector2(...p)));
    const faces = THREE.ShapeUtils.triangulateShape(contours[0], contours.slice(1)), vertices = contours.flat();
    for (const face of faces) {
      const points = face.map(i => [vertices[i].x, vertices[i].y]);
      const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0])), minZ = Math.min(...points.map(p => p[1])), maxZ = Math.max(...points.map(p => p[1]));
      for (const surface of surfaces) for (const triangle of surface.triangles) {
        const b = triangle.bounds;
        if (b.minX > maxX || b.maxX < minX || b.minZ > maxZ || b.maxZ < minZ) continue;
        const clipped = clipTriangle(points, triangle);
        // Clip every observed paint triangle to every supporting road triangle.
        // This prevents paint from bridging mapped holes or cutting through a
        // sloping road where its terrain triangulation changes underneath it.
        for (let i = 1; i + 1 < clipped.length; i++) {
          const [a, b, c] = [clipped[0], clipped[i], clipped[i + 1]];
          const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (Math.abs(cross) < 1e-8) continue;
          const offset = positions.length / 3;
          for (const p of cross > 0 ? [a, c, b] : [a, b, c]) positions.push(p[0], heightOn(triangle, ...p, false), p[1]);
          indices.push(offset, offset + 1, offset + 2);
        }
      }
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

/** Small, inspectable reconstruction pilot. AI supplies reviewed appearance;
 * surveyed triangles remain the authority for both rendering and collision. */
export class RoadPilot {
  constructor({ scene, data = {}, appearance = {}, orthophoto, mode = 'reconstructed', stairOpenings = null } = {}) {
    if (appearance.origin && (!data.origin || !Number.isFinite(appearance.origin.lat) || !Number.isFinite(appearance.origin.lon)
      || appearance.origin.lat !== data.origin.lat || appearance.origin.lon !== data.origin.lon)) {
      throw new Error('Road appearance and surveyed geometry use different coordinate origins.');
    }
    this.scene = scene;this.disposed = false;this.mode = 'reconstructed';this.cells = new Map();this.largeTriangles = [];
    this.group = new THREE.Group();this.group.name = 'Meadow Lake source road reconstruction';
    this.markingsGroup = new THREE.Group();this.markingsGroup.name = 'Observed and accepted source paint';this.group.add(this.markingsGroup);scene?.add(this.group);
    this.aerial = aerialMaterial(orthophoto);this.surfaces = [];this.materials = new Set([this.aerial.material]);
    const source = frozenCopy({ version: data.version, origin: data.origin, bounds: data.bounds, terrain: data.terrain,
      sources: data.sources, imagery: appearance.imagery, method: appearance.method, model: appearance.model,
      geometryMethod: data.method, verticalDatum: 'NAVD88', elevationUnits: 'meters' });
    Object.defineProperty(this, 'source', { value: source, enumerable: true });
    const styles = new Map((appearance.surfaces || []).map(entry => [String(entry.sourceFeatureId), entry]));
    const ids = new Set();let rejectedFeatures = 0;
    for (const feature of data.features || []) {
      if (ids.has(feature?.id)) continue;
      ids.add(feature?.id);
      const part = prepareSurface(feature, data);
      if (!part) { rejectedFeatures++;continue; }
      const style = styles.get(part.sourceFeatureId) || styles.get(part.id) || styles.get(String(part.sourceId));
      // An uncovered or rejected appearance sample keeps the actual aerial.
      // Missing evidence must not silently turn into an invented pavement.
      const vertex = part.geometry.attributes.position;
      part.material = style?.reviewStatus === 'accepted' && /^#[0-9a-f]{6}$/i.test(style.color || '')
        ? surfaceMaterial(style, { x: Math.floor(vertex.getX(0) / CELL_SIZE) * CELL_SIZE, z: Math.floor(vertex.getZ(0) / CELL_SIZE) * CELL_SIZE }) : this.aerial.material;
      this.materials.add(part.material);part.mesh = new THREE.Mesh(part.geometry, part.material);
      part.mesh.name = `${part.kind}: ${part.id}`;part.mesh.receiveShadow = true;part.mesh.castShadow = part.kind === 'bridge';
      part.mesh.userData.sourceId = part.sourceId;part.mesh.userData.sourceFeatureId = part.sourceFeatureId;
      this.group.add(part.mesh);this.surfaces.push(part);
      for (const triangle of part.triangles) insertTriangle(this.cells, this.largeTriangles, { ...triangle, surface: part });
    }
    Object.defineProperty(this, 'sourceFeatureIds', { value: Object.freeze([...new Set(this.surfaces.map(part => part.sourceFeatureId))]), enumerable: true });
    let acceptedMarkings = 0, rejectedMarkings = 0, markingTriangles = 0;
    for (const marking of appearance.markings || []) {
      const supporting = this.surfaces.filter(part => part.sourceFeatureId === marking.sourceFeatureId || part.id === marking.sourceFeatureId || String(part.sourceId) === String(marking.sourceFeatureId));
      if ((marking.reviewStatus ?? marking.evidence?.reviewStatus) !== 'accepted' || !supporting.length || !/^#[0-9a-f]{6}$/i.test(marking.color || '')) { rejectedMarkings++;continue; }
      const geometry = markingGeometry(marking, supporting);
      if (!geometry) { rejectedMarkings++;continue; }
      const material = new THREE.MeshStandardMaterial({ color: marking.color, roughness: .95, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      this.materials.add(material);
      const mesh = new THREE.Mesh(geometry, material);mesh.name = `Observed marking: ${marking.id}`;mesh.receiveShadow = true;
      mesh.userData.evidence = frozenCopy(marking.evidence);this.markingsGroup.add(mesh);acceptedMarkings++;markingTriangles += geometry.index.count / 3;
    }
    this.status = { surfaces: this.surfaces.length, reconstructedSurfaces: this.surfaces.filter(part => part.material !== this.aerial.material).length,
      aerialFallbackSurfaces: this.surfaces.filter(part => part.material === this.aerial.material).length,
      bridgeSurfaces: this.surfaces.filter(part => part.kind === 'bridge').length,
      triangles: this.surfaces.reduce((sum, part) => sum + part.triangles.length, 0),
      rejectedFeatures, acceptedMarkings, rejectedMarkings, markingTriangles };
    if (stairOpenings) for (const material of this.materials) stairOpenings.clip(material);
    this.setMode(mode);
  }

  setMode(mode) {
    if (!MODES.has(mode)) throw new RangeError('Road appearance must be aerial or reconstructed.');
    if (this.disposed) return;
    this.mode = mode;
    for (const part of this.surfaces) part.mesh.material = mode === 'aerial' ? this.aerial.material : part.material;
    this.markingsGroup.visible = mode === 'reconstructed';
  }

  setVisible(visible) { if (!this.disposed) this.group.visible = Boolean(visible); }
  setLocalOrthophoto(atlas = {}) { if (!this.disposed) configureAtlas('pilotLocal', this.aerial.uniforms, atlas); }

  sampleSurface(x, z, { referenceHeight, transportId = null, kind = 'any' } = {}) {
    if (this.disposed || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (kind === 'bridge' && !this.status.bridgeSurfaces) return null;
    const cell = this.cells.get(`${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`) || [];
    const candidates = this.largeTriangles.length ? [...cell, ...this.largeTriangles] : cell;
    let best = null, distance = Infinity;
    for (const triangle of candidates) {
      const { surface, bounds: b } = triangle;
      if (kind === 'bridge' && surface.kind !== 'bridge' || kind === 'ground' && surface.kind === 'bridge') continue;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const elevation = heightOn(triangle, x, z);
      if (elevation === null) continue;
      const current = Boolean(transportId && surface.transportId === transportId), retaining = Boolean(transportId && best?.transportId === transportId);
      const delta = Number.isFinite(referenceHeight) ? Math.abs(elevation - referenceHeight) : 0;
      // A photograph cannot establish which of two overlapping travel levels
      // the actor occupies. Elevated capture requires a continuous approach;
      // wheel queries retain the center's chosen deck through its stable ID.
      if (surface.kind === 'bridge' && (!Number.isFinite(referenceHeight) || delta > (current ? 1.5 : .30))) continue;
      if (best && (retaining && !current || retaining === current && delta >= distance)) continue;
      best = { elevation, normal: { ...triangle.normal }, sourceId: surface.sourceId,
        roadPilotId: surface.id, kind: surface.kind, transportId: surface.transportId,
        units: 'meters', verticalDatum: 'NAVD88', elevationMeaning: 'Interpolated within the visible surveyed road triangle' };
      distance = delta;
    }
    return best;
  }

  getHeight(x, z, options) { return this.sampleSurface(x, z, options)?.elevation ?? null; }
  isCovered(x, z, options) { return this.sampleSurface(x, z, options) !== null; }
  getStatus() { return { ...this.status, mode: this.mode, visible: !this.disposed && this.group.visible, disposed: this.disposed }; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;this.scene?.remove(this.group);
    for (const part of this.surfaces) part.geometry.dispose();
    for (const mesh of this.markingsGroup.children) mesh.geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.group.clear();this.markingsGroup.clear();this.cells.clear();this.largeTriangles = [];this.surfaces = [];this.materials.clear();
  }
}
