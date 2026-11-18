import { landmarkBridges } from './landmark-bridges.js';
import * as THREE from './vendor/three.module.min.js';
import { mercatorCoefficients, atlasProjectionGLSL } from './imagery-projection.js';
import { cellsAround } from './road-stream.js';
import { TransportSurfaces } from './transport-surfaces.js';
import { concreteMaterial } from './deck-structure.js';
import { asphaltMaterial, paintMaterial } from './streetscape.js';

// Source polygons supply plan positions, while the measured terrain supplies
// elevation. There is still no invented curb step or pavement material.
function drapeStreetPart(part, heightAt, revision) {
  if (part.heightAt === heightAt && part.terrainRevision === revision) return;
  const coordinates = [...part.baseCoordinates], indices = [], midpoints = new Map(), midpointHeights = new Map();
  const sample = (x,z) => {const value=heightAt?.(x,z);return Number.isFinite(value)?value:0;};
  const heights = Array.from({length:coordinates.length/2},(_,i)=>sample(coordinates[i*2],coordinates[i*2+1]));
  const pending = [];
  for (let i = 0; i < part.baseIndices.length; i += 3) pending.push([...part.baseIndices.slice(i, i + 3), 0]);
  const originalCount = coordinates.length / 2;
  while (pending.length) {
    const [a, b, c, depth] = pending.pop();
    let edge = [a, b, c], longest = -1;
    for (const candidate of [[a,b,c], [b,c,a], [c,a,b]]) {
      const [u,v] = candidate, length = (coordinates[u*2]-coordinates[v*2])**2 + (coordinates[u*2+1]-coordinates[v*2+1])**2;
      if (length > longest) { longest = length;edge = candidate; }
    }
    let curved = false;
    if(heightAt && longest > 12*12){
      for(const [u,v] of [[a,b],[b,c],[c,a]]){
        const key=u<v?`${u},${v}`:`${v},${u}`;
        if(!midpointHeights.has(key))midpointHeights.set(key,sample((coordinates[u*2]+coordinates[v*2])/2,(coordinates[u*2+1]+coordinates[v*2+1])/2));
        curved ||= Math.abs(midpointHeights.get(key)-(heights[u]+heights[v])/2)>.08;
      }
      curved ||= Math.abs(sample((coordinates[a*2]+coordinates[b*2]+coordinates[c*2])/3,
        (coordinates[a*2+1]+coordinates[b*2+1]+coordinates[c*2+1])/3)-(heights[a]+heights[b]+heights[c])/3)>.08;
    }
    // Refine only where measured terrain bends away from the source triangle.
    // Flat ground and constant slopes need no extra vertices. Curved patches
    // refine toward 12 m edges with a strict per-feature work/vertex limit.
    if (curved && depth < 12 && coordinates.length/2-originalCount < 2048) {
      const [u,v,w] = edge, key = u < v ? `${u},${v}` : `${v},${u}`;
      let midpoint = midpoints.get(key);
      if (midpoint === undefined) {
        midpoint = coordinates.length/2;
        coordinates.push((coordinates[u*2]+coordinates[v*2])/2, (coordinates[u*2+1]+coordinates[v*2+1])/2);
        heights.push(midpointHeights.get(key));
        midpoints.set(key, midpoint);
      }
      pending.push([u,midpoint,w,depth+1], [midpoint,v,w,depth+1]);
    } else indices.push(a,b,c);
  }
  part.coordinates = new Float64Array(coordinates);part.indices = new Uint32Array(indices);
  part.positions = new Float32Array(coordinates.length/2*3);part.uvs = new Float32Array(coordinates.length);
  for (let i = 0; i < coordinates.length; i += 2) {
    const x = coordinates[i], z = coordinates[i+1];
    part.positions[i/2*3] = x;part.positions[i/2*3+1] = heights[i/2];part.positions[i/2*3+2] = z;
  }
  part.heightAt = heightAt;part.terrainRevision = revision;part.layout = null;
}

export function buildStreetGeometry(surfaces, orthophoto, memo = new Map(), heightAt = null, terrainRevision = 0) {
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
      part.baseCoordinates = part.coordinates;part.baseIndices = part.indices;
      part.heightAt = null;part.terrainRevision = 0;
      memo.set(surface.id, part);
    }
    drapeStreetPart(part, heightAt, terrainRevision);
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
  // Flat callers retain exact upward normals; terrain callers need normals
  // from the draped mesh so sunlight follows the actual ground slope.
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (heightAt) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.sourceIds = [...ids];
  return geometry;
}

export function createStreetDetail(index, { scene, orthophoto, heightAt = null, fetcher = globalThis.fetch.bind(globalThis), onStatus = () => {}, onChange = () => {}, now = () => Date.now(), drape = true, roadsFor = null, waterAt = null } = {}) {
  const group = new THREE.Group();group.name = 'NYC mapped street surfaces';scene.add(group);
  const material = new THREE.MeshStandardMaterial({ map: orthophoto.texture, color: 0xffffff, roughness: 1, metalness: 0,
    // Old building bottom caps can overlap newer mapped sidewalks at y=0.
    // Resolve their depth tie without inventing a raised sidewalk elevation.
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'Official aerial imagery on mapped street surfaces';
  const uniforms = { streetLocal: { value: orthophoto.texture }, streetLocalBounds: { value: new THREE.Vector4() },
    streetMercator: { value: new THREE.Vector4() }, streetUseLocal: { value: false },
    streetBase: { value: orthophoto.texture }, streetBaseBounds: { value: new THREE.Vector4(
      orthophoto.bounds.minX, orthophoto.bounds.maxX, orthophoto.bounds.minZ, orthophoto.bounds.maxZ) },
    streetBaseMercator: { value: new THREE.Vector4(...(mercatorCoefficients(orthophoto.bounds, orthophoto.mercator) || [0,0,0,0])) },
    streetBaseIsMercator: { value: Boolean(mercatorCoefficients(orthophoto.bounds, orthophoto.mercator)) },
    streetGroundReplacement: { value: false }, streetGroundReplacementBounds: { value: new THREE.Vector4() } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { streetElevated: { value: false } });
    shader.vertexShader = 'varying vec2 vStreetXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetXZ = position.xz;');
    shader.fragmentShader = `${atlasProjectionGLSL}\n varying vec2 vStreetXZ; uniform sampler2D streetLocal;
      uniform vec4 streetLocalBounds; uniform vec4 streetMercator; uniform bool streetUseLocal;
      uniform sampler2D streetBase; uniform vec4 streetBaseBounds; uniform vec4 streetBaseMercator;
      uniform bool streetBaseIsMercator; uniform bool streetElevated;
      uniform bool streetGroundReplacement; uniform vec4 streetGroundReplacementBounds;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (!streetElevated && streetGroundReplacement && vStreetXZ.x>=streetGroundReplacementBounds.x && vStreetXZ.x<=streetGroundReplacementBounds.y
        && vStreetXZ.y>=streetGroundReplacementBounds.z && vStreetXZ.y<=streetGroundReplacementBounds.w) discard;
      // The underlying imagery planes already provide a per-tile fallback.
      // Never paint a coarse street triangle over a sharper loaded ground tile
      // when filtered atlas alpha includes a missing cell or the atlas border.
      // Elevated decks need their own coarse fallback: the terrain photo is
      // below them. Keep the real deck visible while sharper imagery loads.
      if (streetElevated) {
        vec2 baseUV = vec2((vStreetXZ.x-streetBaseBounds.x)/(streetBaseBounds.y-streetBaseBounds.x),
          (streetBaseBounds.w-vStreetXZ.y)/(streetBaseBounds.w-streetBaseBounds.z));
        if (streetBaseIsMercator) baseUV.y = atlasNorthUV(vStreetXZ.y, streetBaseBounds, streetBaseMercator);
        diffuseColor.rgb = texture2D(streetBase, clamp(baseUV, 0.0, 1.0)).rgb;
      }
      if (!streetUseLocal && !streetElevated) discard;
      if (streetUseLocal) {
        vec2 localUV = vec2((vStreetXZ.x - streetLocalBounds.x) / (streetLocalBounds.y - streetLocalBounds.x),
          atlasNorthUV(vStreetXZ.y, streetLocalBounds, streetMercator));
        if (all(greaterThanEqual(localUV, vec2(0.0))) && all(lessThanEqual(localUV, vec2(1.0)))) {
          vec4 sourcePixel = texture2D(streetLocal, localUV);
          if (sourcePixel.a > 0.99) diffuseColor.rgb = sourcePixel.rgb;
          else if (!streetElevated) discard;
        } else if (!streetElevated) discard;
      }`);
  };
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);mesh.receiveShadow = true;mesh.visible = drape;group.add(mesh);
  // Decks are structures of their own: asphalt above, concrete around and beneath.
  const deckMaterials = [asphaltMaterial(), concreteMaterial(), paintMaterial()];
  const transport = new TransportSurfaces({ material: deckMaterials[0], structureMaterial: deckMaterials[1], paintMaterial: deckMaterials[2], groundAt: heightAt, waterAt });group.add(transport.group);
  const cache = new Map(), pending = new Map(), errors = new Map(), triangulations = new Map();
  let wanted = new Map(), serial = 0, disposed = false, dirty = false, selection = '', covered = false, overviewMode = false;
  let terrainRevision = 0, roadsKey = '', structureBuilt = -Infinity, extra = [];
  const status = () => ({ cachedCells: cache.size, loading: pending.size,
    activeCells: [...wanted.keys()].filter(key => cache.has(key)).length,
    surfaces: mesh.geometry.userData.sourceIds?.length || 0, transport: transport.getStatus(),
    failures: [...errors.keys()].filter(key => wanted.has(key)).length, triangulatedSurfaces: triangulations.size, covered });
  const report = () => { if (!disposed) onStatus(status()); };
  function rebuild() {
    const surfaces = [], structures = [];
    for (const key of wanted.keys()) if (cache.has(key)) {
      const { data } = cache.get(key);surfaces.push(...data.surfaces);structures.push(...(data.structures || []));
    }
    // With drape off another renderer owns the street surfaces (streetscape.js);
    // this module then supplies only the measured bridge decks.
    const previous = mesh.geometry;mesh.geometry = buildStreetGeometry(drape ? surfaces : [], orthophoto, triangulations, heightAt, terrainRevision);previous.dispose();
    // Opening the city map hides local rendering, but an actor may still be
    // supported by a deck. Retain those collision surfaces until local play
    // chooses its next cells, or returning from the map would drop the actor.
    // Where both hold the same deck, the one handed over says more about it, and comes first.
    if (!overviewMode) transport.setFeatures(extra.length ? [...extra, ...structures] : structures);
    dirty = false;onChange();report();
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
      // Disjoint surveyed areas do not imply coverage in the gaps between them.
      const regions = index.coverageRegions || [{ bounds: index.coverageBounds }];
      covered = regions.some(({bounds:b}) => b && focus.x >= b.minX && focus.x <= b.maxX && focus.z >= b.minZ && focus.z <= b.maxZ);
      const key = `${Math.floor(focus.x / index.cellSize)},${Math.floor(focus.z / index.cellSize)},${overview}`;
      group.visible = !overview;overviewMode = overview;
      if (key !== selection) {
        selection = key;
        const next = new Map((overview ? [] : cellsAround(index, focus, 600)).map(cell => [cell.key, cell]));
        if (!overview) {
          const west = Math.floor(focus.x / index.cellSize) * index.cellSize;
          const north = Math.floor(focus.z / index.cellSize) * index.cellSize;
          for (const bridge of landmarkBridges) {
            const b = bridge.bounds;
            if (b.maxX >= west - 600 && b.minX <= west + index.cellSize + 600 &&
                b.maxZ >= north - 600 && b.minZ <= north + index.cellSize + 600) next.set(bridge.key, bridge);
          }
        }
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
      // The streets the decks carry say where their lanes and piers go.
      if (roadsFor && !overview && roadsKey !== key) {
        const asked = roadsKey = key;
        Promise.resolve(roadsFor(focus)).then(roads => { if (!disposed && asked === roadsKey) transport.setRoads(roads || []); }).catch(() => { if (asked === roadsKey) roadsKey = ''; });
      }
      if (!overview && now() - structureBuilt > 500 && transport.structureDirty) { structureBuilt = now();transport.refresh();onChange(); }
      pump();
    },
    setLocalOrthophoto({ texture, bounds, mercator } = {}) {
      const coefficients = mercatorCoefficients(bounds, mercator);
      const valid = Boolean(texture && coefficients && bounds.maxX > bounds.minX);
      uniforms.streetUseLocal.value = valid;
      if (!valid) return;
      uniforms.streetLocal.value = texture;
      uniforms.streetLocalBounds.value.set(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
      uniforms.streetMercator.value.set(...coefficients);
    },
    setTerrainSampler(sampler, revision = terrainRevision + 1) {
      if (disposed || (heightAt === sampler && terrainRevision === revision)) return;
      heightAt = typeof sampler === 'function' ? sampler : null;terrainRevision = revision;dirty = true;transport.setGround(heightAt);
    },
    setGroundReplacementBounds(bounds) {
      // Ordinary street meshes are aerial drapes. The finer terrain replaces
      // those drapes inside this rectangle, while raised decks stay visible.
      uniforms.streetGroundReplacement.value = Boolean(bounds && [bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)
        && bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ);
      if (uniforms.streetGroundReplacement.value) uniforms.streetGroundReplacementBounds.value.set(bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ);
    },
    /**
     * Decks from elsewhere than the bundled cells, such as a park's own bridges. One a cell already holds is not
     * added twice. `groundMaterial` draws the tops of those that carry ground and not a roadway.
     */
    setExtraStructures(features = [], groundMaterial = null) {
      if (disposed) return;
      extra = Array.isArray(features) ? features : [];transport.setGroundMaterial(groundMaterial);rebuild();
    },
    sampleSurface: (x, z, options) => transport.sampleSurface(x, z, options),
    surfacesAt: (x, z, mode) => transport.surfacesAt(x, z, mode),
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of pending.values()) controller.abort();
      pending.clear();cache.clear();wanted.clear();errors.clear();triangulations.clear();
      transport.dispose();for (const deckMaterial of deckMaterials) deckMaterial.dispose();mesh.geometry.dispose();material.dispose();scene.remove(group);
    },
  };
}
