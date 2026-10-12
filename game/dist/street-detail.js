import * as THREE from './vendor/three.module.min.js';
import { cellsAround } from './road-stream.js';

// Source polygons describe plan positions only. Keep them on the existing
// driving plane, without inventing curb elevations or pavement materials.
export function buildStreetGeometry(surfaces, orthophoto, memo = new Map()) {
  const parts = [], ids = new Set();let vertexCount = 0, indexCount = 0;
  const { bounds, mercator } = orthophoto;
  const layout = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ,
    mercator?.originLat, mercator?.radius, mercator?.north, mercator?.south].join(',');
  for (const surface of surfaces) {
    if (ids.has(surface.id)) continue;
    ids.add(surface.id);
    let part = memo.get(surface.id);
    if (!part) {
      const ring = points => points.map(([x, z]) => new THREE.Vector2(x, z));
      const contour = ring(surface.polygon), holes = (surface.holes || []).map(ring);
      // Keep the exact triangulation for this source identity across cell
      // arrivals and movement. Concavity and mapped holes remain unchanged.
      const triangles = THREE.ShapeUtils.triangulateShape(contour, holes), vertices = [...contour, ...holes.flat()];
      part = { positions: new Float32Array(vertices.length * 3), coordinates: new Float64Array(vertices.length * 2),
        indices: new Uint32Array(triangles.length * 3), uvs: new Float32Array(vertices.length * 2), layout: null };
      for (const [i, { x, y: z }] of vertices.entries()) {
        part.positions[i * 3] = x;part.positions[i * 3 + 2] = z;
        part.coordinates[i * 2] = x;part.coordinates[i * 2 + 1] = z;
      }
      for (const [i, [a, b, c]] of triangles.entries()) {
        const p = vertices[a], q = vertices[b], r = vertices[c];
        // X/Z coordinates reverse 2D winding relative to an upward Y.
        const cross = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        part.indices.set([a, cross > 0 ? c : b, cross > 0 ? b : c], i * 3);
      }
      memo.set(surface.id, part);
    }
    if (part.layout !== layout) {
      for (let i = 0; i < part.coordinates.length; i += 2) {
        const x = part.coordinates[i], z = part.coordinates[i + 1];
        let v = (bounds.maxZ - z) / (bounds.maxZ - bounds.minZ);
        if (mercator) {
          const latitude = mercator.originLat - z / mercator.radius;
          v = (Math.log(Math.tan(Math.PI / 4 + latitude / 2)) - mercator.south) / (mercator.north - mercator.south);
        }
        part.uvs[i] = (x - bounds.minX) / (bounds.maxX - bounds.minX);part.uvs[i + 1] = v;
      }
      part.layout = layout;
    }
    parts.push(part);vertexCount += part.positions.length / 3;indexCount += part.indices.length;
  }
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vertexOffset = 0, indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vertexOffset * 3);uvs.set(part.uvs, vertexOffset * 2);
    for (let i = 0; i < part.indices.length; i++) indices[indexOffset + i] = vertexOffset + part.indices[i];
    vertexOffset += part.positions.length / 3;indexOffset += part.indices.length;
  }
  // Every surveyed surface is explicitly mapped onto y=0; its upward normal
  // is exact and does not require recalculating a quarter-million triangles.
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));geometry.computeBoundingSphere();
  geometry.userData.sourceIds = [...ids];
  return geometry;
}

export function createStreetDetail(index, { scene, orthophoto, fetcher = globalThis.fetch.bind(globalThis), onStatus = () => {}, now = () => Date.now() } = {}) {
  const group = new THREE.Group();group.name = 'NYC mapped street surfaces';scene.add(group);
  const material = new THREE.MeshStandardMaterial({ map: orthophoto.texture, color: 0xffffff, roughness: 1, metalness: 0,
    // Old building bottom caps can overlap newer mapped sidewalks at y=0.
    // Resolve their depth tie without inventing a raised sidewalk elevation.
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'Official aerial imagery on mapped street surfaces';
  const uniforms = { streetLocal: { value: orthophoto.texture }, streetLocalBounds: { value: new THREE.Vector4() },
    streetMercator: { value: new THREE.Vector4() }, streetUseLocal: { value: false } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vStreetXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetXZ = position.xz;');
    shader.fragmentShader = `varying vec2 vStreetXZ; uniform sampler2D streetLocal;
      uniform vec4 streetLocalBounds; uniform vec4 streetMercator; uniform bool streetUseLocal;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      // The underlying imagery planes already provide a per-tile fallback.
      // Never paint a coarse street triangle over a sharper loaded ground tile
      // when filtered atlas alpha includes a missing cell or the atlas border.
      if (!streetUseLocal) discard;
      if (streetUseLocal) {
        float latitude = streetMercator.z - vStreetXZ.y / streetMercator.w;
        vec2 localUV = vec2((vStreetXZ.x - streetLocalBounds.x) / (streetLocalBounds.y - streetLocalBounds.x),
          (log(tan(0.7853981633974483 + latitude * 0.5)) - streetMercator.y) / (streetMercator.x - streetMercator.y));
        if (all(greaterThanEqual(localUV, vec2(0.0))) && all(lessThanEqual(localUV, vec2(1.0)))) {
          vec4 sourcePixel = texture2D(streetLocal, localUV);
          if (sourcePixel.a > 0.99) diffuseColor.rgb = sourcePixel.rgb;
          else discard;
        } else discard;
      }`);
  };
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);mesh.receiveShadow = true;group.add(mesh);
  const cache = new Map(), pending = new Map(), errors = new Map(), triangulations = new Map();
  let wanted = new Map(), serial = 0, disposed = false, dirty = false, selection = '', covered = false;
  const status = () => ({ cachedCells: cache.size, loading: pending.size,
    activeCells: [...wanted.keys()].filter(key => cache.has(key)).length,
    surfaces: mesh.geometry.userData.sourceIds?.length || 0,
    failures: [...errors.keys()].filter(key => wanted.has(key)).length, triangulatedSurfaces: triangulations.size, covered });
  const report = () => { if (!disposed) onStatus(status()); };
  function rebuild() {
    const surfaces = [];
    for (const key of wanted.keys()) if (cache.has(key)) surfaces.push(...cache.get(key).data.surfaces);
    const previous = mesh.geometry;mesh.geometry = buildStreetGeometry(surfaces, orthophoto, triangulations);previous.dispose();dirty = false;
  }
  function pump() {
    if (disposed) return;
    for (const [key, cell] of wanted) {
      if (pending.size >= 4) break;
      if (cache.has(key) || pending.has(key) || errors.get(key) > now()) continue;
      const controller = new AbortController();pending.set(key, controller);
      const timer = setTimeout(() => controller.abort(), 10000);
      (async () => {
        try {
          const response = await fetcher(cell.url, { signal: controller.signal });
          if (!response.ok) throw new Error('Street surfaces unavailable');
          const data = await response.json();
          if (!Array.isArray(data.surfaces)) throw new Error('Incomplete street surfaces');
          // A canceled request may resolve after travel. It never owns the
          // replacement selection, even when the player returns to its cell.
          if (disposed || controller.signal.aborted || !wanted.has(key)) return;
          cache.set(key, { data, used: ++serial });errors.delete(key);dirty = true;
        } catch {
          if (!disposed && wanted.has(key) && !controller.signal.aborted) errors.set(key, now() + 5000);
          else if (!disposed && wanted.has(key) && pending.get(key) === controller) errors.set(key, now() + 5000);
        } finally {
          clearTimeout(timer);
          if (pending.get(key) === controller) pending.delete(key);
          if (!disposed) { trim();report();pump(); }
        }
      })();
    }
  }
  function trim() {
    for (const [key] of [...cache].sort((a, b) => a[1].used - b[1].used)) {
      if (cache.size <= 36) break;
      if (!wanted.has(key)) cache.delete(key);
    }
    const resident = new Set();
    for (const entry of cache.values()) for (const surface of entry.data.surfaces) resident.add(surface.id);
    for (const id of triangulations.keys()) if (!resident.has(id)) triangulations.delete(id);
  }
  return {
    group,
    update(focus, { overview = false } = {}) {
      if (disposed) return;
      const b = index.coverageBounds;
      covered = Boolean(b && focus.x >= b.minX && focus.x <= b.maxX && focus.z >= b.minZ && focus.z <= b.maxZ);
      const key = `${Math.floor(focus.x / index.cellSize)},${Math.floor(focus.z / index.cellSize)},${overview}`;
      group.visible = !overview;
      if (key !== selection) {
        selection = key;
        const next = new Map((overview ? [] : cellsAround(index, focus, 600)).map(cell => [cell.key, cell]));
        // Crossing a player cell need not change the surrounding tile set.
        // Keep the existing GPU batch when its sources have not changed.
        if (next.size !== wanted.size || [...next.keys()].some(id => !wanted.has(id))) dirty = true;
        wanted = next;
        for (const [id, controller] of pending) if (!wanted.has(id)) { controller.abort();pending.delete(id); }
        for (const id of errors.keys()) if (!wanted.has(id)) errors.delete(id);
        for (const id of wanted.keys()) if (cache.has(id)) cache.get(id).used = ++serial;
        trim();report();
      }
      if (dirty) rebuild();
      pump();
    },
    setLocalOrthophoto({ texture, bounds, mercator } = {}) {
      const valid = Boolean(texture && bounds && mercator && bounds.maxX > bounds.minX && mercator.north > mercator.south && mercator.radius > 0);
      uniforms.streetUseLocal.value = valid;
      if (!valid) return;
      uniforms.streetLocal.value = texture;
      uniforms.streetLocalBounds.value.set(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
      uniforms.streetMercator.value.set(mercator.north, mercator.south, mercator.originLat, mercator.radius);
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of pending.values()) controller.abort();
      pending.clear();cache.clear();wanted.clear();errors.clear();triangulations.clear();
      mesh.geometry.dispose();material.dispose();scene.remove(group);
    },
  };
}
