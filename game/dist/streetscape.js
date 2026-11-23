import * as THREE from './vendor/three.module.min.js';
import { CITY_ORIGIN, worldToGeographic } from './city-ground.js';
import { propInstance } from './prop-instance.js';
import { bindCitySurface, CITY_SURFACE_GLSL } from './city-materials.js';
import { redStepHeight, redStepWalk } from './times-square.js';
import { isBroadwayPlaza } from './times-square-crowd.js';
import { laneLayout } from './lanes.js';

// Street surfaces from New York's planimetric survey: every roadbed and
// sidewalk outline in the city, as mapped from the air. The outlines are
// real; what fills them is drawn here. Roadbeds become asphalt, sidewalks
// become concrete flags raised a kerb's height, and lane lines and crossings
// are laid out from the street centrelines.
//
// A handful of neighbourhoods ship with the game. Everywhere else the same
// outlines are requested from NYC Open Data for the 500 m cell around the
// player, and kept in the browser's cache.

export const ROAD_LIFT = .05;      // Clears the terrain photograph beneath.
export const KERB_HEIGHT = .15;
export const SIDEWALK_LIFT = ROAD_LIFT + KERB_HEIGHT;
// Kerbside parking: one car every PARKING_PITCH metres, its centre PARKING_OFFSET from the kerb.
const PARKING_PITCH = 5.9, PARKING_END = 3.4, PARKING_OFFSET = 1.28;
const hash2 = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
export const STREET_SERVICE = 'https://data.cityofnewyork.us/resource';
export const DATASETS = {
  roadbed: { id: 'i36f-5ih7', subtypes: { 350000: 'roadbed', 350010: 'intersection', 350020: 'shoulder', 350030: 'driveway' } },
  sidewalk: { id: '52n9-sdep', subtypes: { 380000: 'right-of-way sidewalk', 380010: 'interior sidewalk' } },
};
/**
 * The 2022 planimetric layers the open-data portal does not carry, from NYC
 * OTI's own map service: raised medians and traffic islands, plazas, and
 * parking lots. Painted medians are road paint, not ground, and are left out.
 */
export const PLANIMETRIC_SERVICE = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services';
export const LAYERS = {
  median: { path: 'Median_2022/FeatureServer/9', subtypes: { 360000: 'median', 360020: 'kerbed median', 360030: 'railed median', 360040: 'fenced median',
    360050: 'grass median', 360060: 'barrier median', 360070: 'median', 360080: 'traffic island' } },
  plaza: { path: 'Plaza_2022/FeatureServer/16', subtypes: { 600000: 'plaza', 600010: 'raised plaza' } },
  parking: { path: 'Parking_Lot_2022/FeatureServer/13', subtypes: { 500000: 'parking lot' } },
};
/** The 2015 street tree census: every street tree, counted and measured by volunteers. */
export const TREE_DATASET = 'uvpi-gqnh';
const CURRENT = new Set(['New', 'Updated', 'Unchanged']);
const R = 6371008.8, RAD = Math.PI / 180;
const finite = Number.isFinite;

export function projectPoint(lon, lat, origin = CITY_ORIGIN) {
  // Adding zero turns a negative zero into a plain one.
  return [Math.round(R * (lon - origin.lon) * RAD * Math.cos(origin.lat * RAD) * 1000) / 1000 + 0, Math.round(-R * (lat - origin.lat) * RAD * 1000) / 1000 + 0];
}

function projectRing(coordinates, origin) {
  const ring = [];
  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || !finite(coordinate[0]) || !finite(coordinate[1])) return null;
    const point = projectPoint(coordinate[0], coordinate[1], origin), last = ring.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) ring.push(point);
  }
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  return ring.length >= 3 && Math.abs(signedArea(ring)) > 1e-4 ? ring : null;
}

/** NYC Open Data rows to the game's surface records. Unusable rows are dropped. */
export function convertRows(kind, rows, origin = CITY_ORIGIN) {
  const spec = DATASETS[kind], surfaces = [];
  if (!spec || !Array.isArray(rows)) return surfaces;
  for (const row of rows) {
    const subtype = spec.subtypes[Math.round(Number(row?.sub_code))], geometry = row?.the_geom;
    if (!subtype || !row.row_id || (row.status && !CURRENT.has(row.status)) || !Array.isArray(geometry?.coordinates)) continue;
    const parts = geometry.type === 'MultiPolygon' ? geometry.coordinates : geometry.type === 'Polygon' ? [geometry.coordinates] : [];
    parts.forEach((part, index) => {
      if (!Array.isArray(part) || !part.length) return;
      const polygon = projectRing(part[0], origin);
      if (!polygon) return;
      surfaces.push({ id: `${kind}:${row.row_id}:${index}`, kind, subtype, polygon, holes: part.slice(1).map(ring => projectRing(ring, origin)).filter(Boolean) });
    });
  }
  return surfaces;
}

/** Street tree census rows to { x, z, girth (trunk diameter, metres), species }. */
export function convertTrees(rows, origin = CITY_ORIGIN) {
  const trees = [];
  if (!Array.isArray(rows)) return trees;
  for (const row of rows) {
    const lon = Number(row?.longitude), lat = Number(row?.latitude), inches = Number(row?.tree_dbh);
    if (!finite(lon) || !finite(lat) || row.status !== 'Alive') continue;
    const [x, z] = projectPoint(lon, lat, origin);
    trees.push({ x, z, girth: Math.max(.08, Math.min(1.4, (finite(inches) ? inches : 8) * .0254)), species: String(row.spc_common || '').toLowerCase() });
  }
  return trees;
}

export function treeQuery(bounds, origin = CITY_ORIGIN) {
  const sw = worldToGeographic(bounds.minX, bounds.maxZ, origin), ne = worldToGeographic(bounds.maxX, bounds.minZ, origin);
  const f = value => value.toFixed(6);
  const query = new URLSearchParams({ $select: 'tree_dbh,spc_common,status,latitude,longitude',
    $where: `latitude between ${f(sw.lat)} and ${f(ne.lat)} and longitude between ${f(sw.lon)} and ${f(ne.lon)}`, $limit: '4000' });
  return `${STREET_SERVICE}/${TREE_DATASET}.json?${query}`;
}

const inRing = (x, z, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

/**
 * Features from the planimetric map service to the game's surface records.
 * A feature's rings arrive in no particular order: the largest is an outline,
 * and a ring that lies inside an outline and runs the other way is a hole in it.
 */
export function convertFeatures(kind, features, origin = CITY_ORIGIN) {
  const spec = LAYERS[kind], surfaces = [];
  if (!spec || !Array.isArray(features)) return surfaces;
  for (const feature of features) {
    const attributes = feature?.attributes || {}, subtype = spec.subtypes[Math.round(Number(attributes.SUB_FEATURE_CODE))], rings = feature?.geometry?.rings;
    if (!subtype || attributes.OBJECTID == null || (attributes.STATUS && !CURRENT.has(attributes.STATUS)) || !Array.isArray(rings)) continue;
    const projected = rings.map(ring => Array.isArray(ring) ? projectRing(ring, origin) : null).filter(Boolean)
      .map(ring => ({ ring, area: signedArea(ring) })).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const parts = [];
    for (const { ring, area } of projected) {
      const parent = parts.find(part => Math.sign(part.area) !== Math.sign(area) && inRing(ring[0][0], ring[0][1], part.polygon));
      if (parent) parent.holes.push(ring); else parts.push({ polygon: ring, holes: [], area });
    }
    parts.forEach((part, index) => surfaces.push({ id: `${kind}:${attributes.OBJECTID}:${index}`, kind, subtype, polygon: part.polygon, holes: part.holes }));
  }
  return surfaces;
}

export function cellBounds(key, size) {
  const [x, z] = key.split(',').map(Number);
  return { minX: x * size, maxX: (x + 1) * size, minZ: z * size, maxZ: (z + 1) * size };
}

/** The NYC Open Data request for every outline of one kind that touches a cell. */
export function cellQuery(kind, bounds, origin = CITY_ORIGIN) {
  const sw = worldToGeographic(bounds.minX, bounds.maxZ, origin), ne = worldToGeographic(bounds.maxX, bounds.minZ, origin);
  const f = value => value.toFixed(6);
  const box = `POLYGON((${f(sw.lon)} ${f(sw.lat)},${f(ne.lon)} ${f(sw.lat)},${f(ne.lon)} ${f(ne.lat)},${f(sw.lon)} ${f(ne.lat)},${f(sw.lon)} ${f(sw.lat)}))`;
  const query = new URLSearchParams({ $select: ':id AS row_id,the_geom,sub_code,status', $where: `intersects(the_geom,'${box}')`, $limit: '8000' });
  return `${STREET_SERVICE}/${DATASETS[kind].id}.json?${query}`;
}

/** The planimetric map service request for every feature of one layer that touches a cell. */
export function layerQuery(kind, bounds, origin = CITY_ORIGIN) {
  const sw = worldToGeographic(bounds.minX, bounds.maxZ, origin), ne = worldToGeographic(bounds.maxX, bounds.minZ, origin);
  const f = value => value.toFixed(6);
  const query = new URLSearchParams({ where: '1=1', geometry: [sw.lon, sw.lat, ne.lon, ne.lat].map(f).join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID,SUB_FEATURE_CODE,STATUS', outSR: '4326', geometryPrecision: '7', f: 'json' });
  return `${PLANIMETRIC_SERVICE}/${LAYERS[kind].path}/query?${query}`;
}

/** Loads a cell's outlines: from the bundled survey if present, else the live service. */
export function createStreetSource({ index = null, origin = CITY_ORIGIN, fetcher = globalThis.fetch?.bind(globalThis), cacheStorage = globalThis.caches, live = true, size = 500 } = {}) {
  let store = null;
  const districtFiles = new Map();
  const inSquare = key => size === 500 && origin.lat === CITY_ORIGIN.lat && origin.lon === CITY_ORIGIN.lon
    && (key === '2,-8' || key === '2,-9');
  function squareFile(key,signal) {
    if (!districtFiles.has(key)) {
      const url = './times-square/' + key.replace(',', '_') + '.json';
      const loaded = fetcher(url,{signal}).then(async response => {
        if (!response.ok) throw new Error('Times Square street file unavailable.');
        const data = await response.json();
        if (!Array.isArray(data.surfaces) || !Array.isArray(data.trees)) throw new Error('Incomplete Times Square streets.');
        return data;
      }).catch(error => { districtFiles.delete(key); throw error; });
      districtFiles.set(key,loaded);
    }
    return districtFiles.get(key);
  }
  const cached = async url => {
    if (!cacheStorage) return null;
    try { store ||= await cacheStorage.open('nyc-streets-v1'); return await store.match(url) || null; } catch { return null; }
  };
  async function rows(kind, bounds, signal) {
    const url = kind === 'trees' ? treeQuery(bounds, origin) : LAYERS[kind] ? layerQuery(kind, bounds, origin) : cellQuery(kind, bounds, origin);
    const hit = await cached(url);
    if (hit) return hit.json();
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error(`Street outlines unavailable (${response.status}).`);
    // Keep a copy: these outlines change every few years, not between visits.
    if (store && typeof response.clone === 'function') store.put(url, response.clone()).catch(() => {});
    return response.json();
  }
  // Is this cell wholly inside a region the bundled survey covers?
  const regions = Array.isArray(index?.coverageRegions) ? index.coverageRegions.map(region => region.bounds).filter(Boolean) : null;
  const surveyed = bounds => !regions || regions.some(region => bounds.minX >= region.minX - .01 && bounds.maxX <= region.maxX + .01 && bounds.minZ >= region.minZ - .01 && bounds.maxZ <= region.maxZ + .01);
  return {
    size,
    has: key => inSquare(key) || Boolean(index?.cells?.[key]) || live,
    /** Census trees for a cell, or null when only invented placement is possible. */
    async trees(key, signal) {
      if (inSquare(key)) {
        try { return (await squareFile(key,signal)).trees; } catch (error) { if (signal?.aborted) throw error; }
      }
      if (!live) return null;
      try { return convertTrees(await rows('trees', cellBounds(key, size), signal), origin); } catch { return null; }
    },
    async load(key, signal) {
      if (inSquare(key)) {
        try { return {surfaces:(await squareFile(key,signal)).surfaces,source:'bundled'}; }
        catch (error) { if (signal?.aborted || !live) throw error; }
      }
      const bundled = index?.cells?.[key], bounds = cellBounds(key, size);
      const shipped = async () => {
        const response = await fetcher(bundled.url, { signal });
        if (!response.ok) throw new Error('Street outlines unavailable.');
        const data = await response.json();
        if (!Array.isArray(data.surfaces)) throw new Error('Incomplete street outlines.');
        return { surfaces: data.surfaces.filter(surface => surface.kind === 'roadbed' || surface.kind === 'sidewalk' || surface.kind === 'parking'), source: 'bundled' };
      };
      // Medians, plazas and parking lots are a nicety: a failure, or an
      // error the service reports in its answer, must not cost the street.
      const extras = async kinds => !live ? [] : (await Promise.all(kinds.map(kind => rows(kind, bounds, signal)
        .then(answer => convertFeatures(kind, answer?.features, origin)).catch(() => [])))).flat();
      // A cell on the edge of a surveyed region ships only the part inside it:
      // the city service has the whole cell, so it is asked first.
      if (bundled && (!live || surveyed(bounds))) {
        // The bundle carries parking lots; medians and plazas were never in it.
        const [data, more] = await Promise.all([shipped(), extras(['median', 'plaza'])]);
        return { surfaces: [...data.surfaces, ...more], source: data.source };
      }
      if (!live) return { surfaces: [], source: 'none' };
      try {
        const [roadbeds, sidewalks, more] = await Promise.all([rows('roadbed', bounds, signal), rows('sidewalk', bounds, signal), extras(['median', 'plaza', 'parking'])]);
        return { surfaces: [...convertRows('roadbed', roadbeds, origin), ...convertRows('sidewalk', sidewalks, origin), ...more], source: 'live' };
      } catch (error) {
        if (!bundled || signal?.aborted) throw error;
        return shipped();
      }
    },
  };
}

// --- Plan geometry --------------------------------------------------------------
export function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  return area / 2;
}

/**
 * A polygon prepared for fast point tests: its edges are bucketed into
 * horizontal slabs, so a test only visits the few edges at that latitude.
 * Holes need no special case under the even-odd rule.
 */
export function indexPolygon(polygon, holes = [], slab = 4) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  const count = Math.max(1, Math.ceil((maxZ - minZ) / slab)), buckets = Array.from({ length: count }, () => []);
  for (const ring of [polygon, ...holes]) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (a[1] === b[1]) continue; // Horizontal edges never cross a horizontal ray.
    const first = Math.max(0, Math.floor((Math.min(a[1], b[1]) - minZ) / slab)), last = Math.min(count - 1, Math.floor((Math.max(a[1], b[1]) - minZ) / slab));
    for (let s = first; s <= last; s++) buckets[s].push(a[0], a[1], b[0], b[1]);
  }
  return { minX, maxX, minZ, maxZ, slab, buckets };
}

export function insideIndexed(index, x, z) {
  if (x < index.minX || x > index.maxX || z < index.minZ || z > index.maxZ) return false;
  const bucket = index.buckets[Math.min(index.buckets.length - 1, Math.floor((z - index.minZ) / index.slab))];
  let inside = false;
  for (let i = 0; i < bucket.length; i += 4) {
    const az = bucket[i + 1], bz = bucket[i + 3];
    if ((az > z) !== (bz > z) && x < (bucket[i + 2] - bucket[i]) * (z - az) / (bz - az) + bucket[i]) inside = !inside;
  }
  return inside;
}

/** Match a painted street mouth to one approaching arm inside its own intersection outline. */
export function matchPaintedCrossings(junctions, crossings) {
  const grid = new Map(), matches = new Map(), scores = new Map();
  for (const j of junctions) {
    const key = Math.floor(j.x / 64) + ',' + Math.floor(j.z / 64);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(j);
  }
  for (const crossing of crossings) {
    const { a, b, nx, nz, outline } = crossing;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    let best = null;
    for (let gx = Math.floor(outline.minX / 64); gx <= Math.floor(outline.maxX / 64); gx++)
      for (let gz = Math.floor(outline.minZ / 64); gz <= Math.floor(outline.maxZ / 64); gz++)
        for (const j of grid.get(gx + ',' + gz) || []) {
          if (!insideIndexed(outline, j.x, j.z)) continue;
          const dx = mx - j.x, dz = mz - j.z;
          j.arms.forEach((arm, index) => {
            const ux = Math.sin(arm.angle), uz = Math.cos(arm.angle), alignment = ux * nx + uz * nz;
            const lateral = Math.abs(dx * uz - dz * ux), along = dx * ux + dz * uz;
            if (alignment < .6 || along <= 0 || lateral > arm.width / 2 + 2) return;
            const score = lateral + along * .12 + (1 - alignment) * 10;
            if (!best || score < best.score) best = { j, index, score };
          });
        }
    if (!best) continue;
    const { j, index, score } = best;
    if (!matches.has(j.plan)) { matches.set(j.plan, []); scores.set(j.plan, []); }
    if (score >= (scores.get(j.plan)[index] ?? Infinity)) continue;
    matches.get(j.plan)[index] = crossing; scores.get(j.plan)[index] = score;
  }
  return matches;
}

/** A coarse grid over indexed polygons, for "which outline is this point in". */
class SurfaceGrid {
  constructor(size = 16) { this.size = size; this.cells = new Map(); }
  add(entry) {
    const { minX, maxX, minZ, maxZ } = entry.index, size = this.size;
    for (let gx = Math.floor(minX / size); gx <= Math.floor(maxX / size); gx++) for (let gz = Math.floor(minZ / size); gz <= Math.floor(maxZ / size); gz++) {
      const key = gx * 73856093 ^ gz * 19349663;
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = []);
      cell.push(entry);
    }
  }
  /** First entry containing the point for which `accept` is true. */
  find(x, z, accept = null) {
    const cell = this.cells.get(Math.floor(x / this.size) * 73856093 ^ Math.floor(z / this.size) * 19349663);
    if (!cell) return null;
    for (const entry of cell) if ((!accept || accept(entry)) && insideIndexed(entry.index, x, z)) return entry;
    return null;
  }
}

/** What a walked-on surface is paved with; the shader reads these from each vertex. */
const PAVING = { flags: 0, face: 1, kerbstone: 2, interior: 3, plaza: 4, turf: 5, broadway: 6 };
// Tile the pedestrian interior with walking strips parallel to Broadway. A
// strip ends at the kerb, a hole, or the steps. Each has room to walk both ways.
function plazaWalks(surface, index) {
  const stair = redStepWalk(), [nx, nz] = stair.normals[0], tx = -nz, tz = nx;
  const offsets = surface.polygon.map(([x, z]) => x * nx + z * nz);
  const along = surface.polygon.map(([x, z]) => x * tx + z * tz);
  const start = Math.floor(Math.min(...along)), end = Math.ceil(Math.max(...along));
  const depth = 3.2, routes = [];
  const point = (s, t) => [s * tx + t * nx, s * tz + t * nz];
  const fits = (s, t) => {
    const [x, z] = point(s, t);
    return insideIndexed(index, x, z) && redStepHeight(x, z) === null;
  };
  for (let t = Math.min(...offsets) + .35 + depth; t < Math.max(...offsets); t += depth) {
    let first = null;
    for (let s = start; s <= end + 1; s++) {
      if (s <= end && [t + .25, t - depth * .5, t - depth - .25].every((d) => fits(s, d))) {
        first ??= s;
      } else if (first !== null) {
        const length = s - 1 - first;
        if (length >= 4) routes.push({ points: [point(first, t), point(s - 1, t)], normals: [[nx, nz]], depth, length });
        first = null;
      }
    }
  }
  if (surface.id === 'duffy-paving') routes.push(stair);
  const covered = routes.reduce((sum, r) => sum + r.depth * r.length, 0);
  const area = Math.abs(signedArea(surface.polygon)) -
    (surface.holes || []).reduce((sum, h) => sum + Math.abs(signedArea(h)), 0);
  for (const r of routes) {
    r.plaza = surface.id;
    r.plazaArea = area * r.depth * r.length / covered;
  }
  return routes;
}

const isRoad = entry => entry.road, isCarriageway = entry => entry.road && !entry.junction, isJunction = entry => entry.junction, isRaised = entry => entry.raised;

/** Cut a triangle until it follows the ground: flat streets cost nothing. */
function drapeTriangles(points, heights, triangles, heightAt, tolerance = .025) {
  const out = [], pending = [], midpoints = new Map();
  for (let i = 0; i < triangles.length; i += 3) pending.push(triangles[i], triangles[i + 1], triangles[i + 2], 0);
  while (pending.length) {
    const depth = pending.pop(), c = pending.pop(), b = pending.pop(), a = pending.pop();
    const ax = points[a * 2], az = points[a * 2 + 1], bx = points[b * 2], bz = points[b * 2 + 1], cx = points[c * 2], cz = points[c * 2 + 1];
    const ab = (ax - bx) ** 2 + (az - bz) ** 2, bc = (bx - cx) ** 2 + (bz - cz) ** 2, ca = (cx - ax) ** 2 + (cz - az) ** 2;
    const longest = Math.max(ab, bc, ca);
    let split = false;
    // The citywide terrain is planar over tens of metres; short edges cannot stray from it.
    if (longest > 49 && depth < 9) {
      const error = (u, v) => Math.abs(heightAt((points[u * 2] + points[v * 2]) / 2, (points[u * 2 + 1] + points[v * 2 + 1]) / 2) - (heights[u] + heights[v]) / 2);
      split = error(a, b) > tolerance || error(b, c) > tolerance || error(c, a) > tolerance
        || Math.abs(heightAt((ax + bx + cx) / 3, (az + bz + cz) / 3) - (heights[a] + heights[b] + heights[c]) / 3) > tolerance;
    }
    if (!split) { out.push(a, b, c); continue; }
    const [u, v, w] = longest === ab ? [a, b, c] : longest === bc ? [b, c, a] : [c, a, b];
    const key = u < v ? u * 4194304 + v : v * 4194304 + u;
    let m = midpoints.get(key);
    if (m === undefined) {
      m = heights.length;
      const mx = (points[u * 2] + points[v * 2]) / 2, mz = (points[u * 2 + 1] + points[v * 2 + 1]) / 2;
      points.push(mx, mz); heights.push(heightAt(mx, mz)); midpoints.set(key, m);
    }
    pending.push(u, m, w, depth + 1, m, v, w, depth + 1);
  }
  return out;
}

/** The direction most of an outline's boundary runs in, folded to a quarter turn. */
function dominantDirection(polygon) {
  // Summing edge vectors with their angle multiplied by four makes edges at
  // right angles reinforce each other, as paving joints do.
  let sx = 0, sz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .5) continue;
    const angle = Math.atan2(dz, dx) * 4;
    sx += Math.cos(angle) * length; sz += Math.sin(angle) * length;
  }
  const angle = Math.atan2(sz, sx) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

class MeshWriter {
  constructor(extra = 0) { this.position = []; this.normal = []; this.extra = extra ? [] : null; this.width = extra; }
  get count() { return this.position.length / 3; }
  push(x, y, z, nx, ny, nz, ...extra) { this.position.push(x, y, z); this.normal.push(nx, ny, nz); if (this.extra) this.extra.push(...extra); }
  geometry(name) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    if (this.extra) geometry.setAttribute(name, new THREE.Float32BufferAttribute(this.extra, this.width));
    geometry.computeBoundingSphere();
    // Nothing reads these again once they are on the GPU; a cell is rebuilt
    // from its outlines if it is ever needed anew.
    for (const attribute of Object.values(geometry.attributes)) attribute.onUpload(releaseArray);
    return geometry;
  }
}

function releaseArray() { this.array = null; }

const WHITE = [.78, .78, .74], YELLOW = [.72, .52, .07];

/** A flat painted quad from a to b, `width` wide, resting on the road. */
function paint(writer, heightAt, ax, az, bx, bz, width, color) {
  const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
  if (length < .05) return;
  const nx = -dz / length * width / 2, nz = dx / length * width / 2;
  const corners = [[ax - nx, az - nz], [ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz]];
  const y = corners.map(([x, z]) => heightAt(x, z) + ROAD_LIFT + .012);
  for (const i of [0, 1, 2, 0, 2, 3]) writer.push(corners[i][0], y[i], corners[i][1], 0, 1, 0, ...color);
}

/**
 * Build everything drawn for one cell.
 * @param {object[]} surfaces roadbed and sidewalk outlines
 * @param {object[]} roads street centrelines near the cell
 * @param {object} options ground sampler, the cell's bounds, and a time-slicing hook
 */
export async function buildCell(surfaces, roads, { heightAt = () => 0, bounds = null, pause = async () => {}, excluded = null, census = null, slice = () => 5 } = {}) {
  const road = new MeshWriter(), walk = new MeshWriter(3), marks = new MeshWriter(3);
  const grid = new SurfaceGrid(), lamps = [], entries = [], trees = [], planted = [], kerbs = [], parking = [], walks = [], crossings = [];
  const sample = (x, z) => { const value = heightAt(x, z); return finite(value) ? value : 0; };
  const owned = surface => {
    if (!bounds) return true;
    // An outline belongs to the one cell that holds its centre, so neighbours never draw it twice.
    let x = 0, z = 0;
    for (const point of surface.polygon) { x += point[0]; z += point[1]; }
    x /= surface.polygon.length; z /= surface.polygon.length;
    return x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ;
  };
  for (const surface of surfaces) {
    if (!Array.isArray(surface.polygon) || surface.polygon.length < 3) continue;
    const isRoadbed = surface.kind === 'roadbed', isWalk = surface.kind === 'sidewalk', isMedian = surface.kind === 'median', isPlaza = surface.kind === 'plaza', isLot = surface.kind === 'parking';
    if (!isRoadbed && !isWalk && !isMedian && !isPlaza && !isLot) continue;
    // `road` is a street's own carriageway. A parking lot is asphalt too, but
    // nothing parks beside it, crosses it or meets it at a kerb.
    const entry = { surface, index: indexPolygon(surface.polygon, surface.holes || []), road: isRoadbed, junction: isRoadbed && surface.subtype === 'intersection',
      asphalt: isRoadbed || isLot, street: isWalk, raised: (isWalk && surface.subtype !== 'interior sidewalk') || isMedian || isPlaza,
      // Where outlines overlap, the island stands above the plaza and the plaza above the sidewalk.
      lift: isRoadbed || isLot ? ROAD_LIFT : isMedian ? SIDEWALK_LIFT + .006 : isPlaza ? SIDEWALK_LIFT + .003 : isWalk && surface.subtype !== 'interior sidewalk' ? SIDEWALK_LIFT : ROAD_LIFT,
      paving: isMedian ? (surface.subtype === 'grass median' ? PAVING.turf : PAVING.flags) : isPlaza ? (isBroadwayPlaza(surface.id) ? PAVING.broadway : PAVING.plaza) : isWalk && surface.subtype === 'interior sidewalk' ? PAVING.interior : PAVING.flags,
      owned: owned(surface), elevated: false };
    entries.push(entry);
  }
  // A roadbed carried on a bridge or viaduct has no place on the ground below it.
  const lifted = [], grounded = [];
  for (const line of roads) {
    const high = line.kind === 'bridge' || line.roadwayType === 3 || line.fromLevel > 13 || line.toLevel > 13;
    if (line.kind === 'tunnel' || line.roadwayType === 4) continue;
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
      for (let s = 0; s <= steps; s++) (high ? lifted : grounded).push(a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps);
    }
  }
  if (lifted.length) for (const entry of entries) {
    if (!entry.road) continue;
    let over = false, under = false;
    for (let i = 0; i < lifted.length && !over; i += 2) over = insideIndexed(entry.index, lifted[i], lifted[i + 1]);
    if (!over) continue;
    for (let i = 0; i < grounded.length && !under; i += 2) under = insideIndexed(entry.index, grounded[i], grounded[i + 1]);
    entry.elevated = !under;
  }
  for (const entry of entries) if (!entry.elevated && !(excluded && excluded(entry.surface))) grid.add(entry);

  const fences = [];
  let budget = performance.now(), drawn = 0;
  // `slice` is how many milliseconds of this work may be done before the page is given a turn.
  const breathe = async () => { if (performance.now() - budget > slice()) { await pause(); budget = performance.now(); } };

  for (const entry of entries) {
    if (!entry.owned || entry.elevated || (excluded && excluded(entry.surface))) continue;
    await breathe();
    const { surface } = entry, rings = [surface.polygon, ...(surface.holes || [])];
    const contour = surface.polygon.map(([x, z]) => new THREE.Vector2(x, z)), holes = (surface.holes || []).map(ring => ring.map(([x, z]) => new THREE.Vector2(x, z)));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { continue; }
    const points = [], heights = [], lift = entry.lift;
    for (const ring of rings) for (const [x, z] of ring) { points.push(x, z); heights.push(sample(x, z)); }
    const triangles = [];
    for (const [a, b, c] of faces) {
      // Wind every face to look up, whichever way the outline was drawn.
      const cross = (points[b * 2] - points[a * 2]) * (points[c * 2 + 1] - points[a * 2 + 1]) - (points[b * 2 + 1] - points[a * 2 + 1]) * (points[c * 2] - points[a * 2]);
      if (cross > 0) triangles.push(a, c, b); else triangles.push(a, b, c);
    }
    const draped = drapeTriangles(points, heights, triangles, sample);
    drawn++;
    if (surface.subtype === 'fenced median' || surface.subtype === 'railed median') {
      const ring = surface.polygon;
      for (let i=0; i<ring.length; i++) {
        const a=ring[i], b=ring[(i+1)%ring.length], dx=b[0]-a[0], dz=b[1]-a[1];
        const length=Math.hypot(dx,dz), count=Math.ceil(length/2.5);
        if (length<.1) continue;
        for (let j=0; j<count; j++) {
          const x=a[0]+dx*(j+.5)/count, z=a[1]+dz*(j+.5)/count;
          fences.push({ kind:'rail', id:surface.id+'/'+i+'/'+j, x, z, y:sample(x,z)+lift,
            height:1, radius:.035, half:length/count/2, tx:dx/length, tz:dz/length });
        }
      }
    }
    if (entry.asphalt) {
      for (const i of draped) road.push(points[i * 2], heights[i] + lift, points[i * 2 + 1], 0, 1, 0);
      continue;
    }
    // Paving joints follow the street, not the compass.
    const [gx, gz] = dominantDirection(surface.polygon), kind = entry.paving;
    for (const i of draped) walk.push(points[i * 2], heights[i] + lift, points[i * 2 + 1], 0, 1, 0, gx, gz, kind);
    if (kind === PAVING.broadway) walks.push(...plazaWalks(surface,entry.index));
    if (!entry.raised) continue;
    for (const ring of rings) {
      let sinceLamp = 18 + (ring.length * 7.3) % 20, run = null;
      // The survey puts a vertex every twenty feet, so a kerb is a run of
      // short edges: it lasts until the kerb ends or turns a corner.
      const endRun = () => {
        if (run && run.length >= 2 * PARKING_END) kerbs.push(run);
        // People walk every stretch of kerb, down to the turn of a corner.
        if (run && run.length >= 2) walks.push(run);
        run = null;
      };
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        if (length < .02) continue;
        // The side of this edge that lies outside the sidewalk.
        let nx = dz / length, nz = -dx / length;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (insideIndexed(entry.index, mx + nx * .05, mz + nz * .05)) { nx = -nx; nz = -nz; }
        const ya = sample(a[0], a[1]), yb = sample(b[0], b[1]);
        // The kerb face, down to the terrain so no gap shows on a slope.
        const top = lift, foot = -.03;
        walk.push(a[0], ya + foot, a[1], nx, 0, nz, gx, gz, 1); walk.push(b[0], yb + top, b[1], nx, 0, nz, gx, gz, 1); walk.push(b[0], yb + foot, b[1], nx, 0, nz, gx, gz, 1);
        walk.push(a[0], ya + foot, a[1], nx, 0, nz, gx, gz, 1); walk.push(a[0], ya + top, a[1], nx, 0, nz, gx, gz, 1); walk.push(b[0], yb + top, b[1], nx, 0, nz, gx, gz, 1);
        // Where the edge meets a carriageway it is a kerb: cap it in stone.
        const kerb = Boolean(grid.find(mx + nx * .45, mz + nz * .45, isRoad));
        if (!kerb) { endRun(); sinceLamp += length * .2; continue; }
        const ix = -nx * .19, iz = -nz * .19, cap = lift + .004;
        walk.push(a[0], ya + cap, a[1], 0, 1, 0, gx, gz, 2); walk.push(b[0], yb + cap, b[1], 0, 1, 0, gx, gz, 2); walk.push(b[0] + ix, yb + cap, b[1] + iz, 0, 1, 0, gx, gz, 2);
        walk.push(a[0], ya + cap, a[1], 0, 1, 0, gx, gz, 2); walk.push(b[0] + ix, yb + cap, b[1] + iz, 0, 1, 0, gx, gz, 2); walk.push(a[0] + ix, ya + cap, a[1] + iz, 0, 1, 0, gx, gz, 2);
        // Parking, street trees and lamps belong to the sidewalk's kerb, not to an island's.
        if (!entry.street) continue;
        const ux = dx / length, uz = dz / length;
        if (run && run.ux * ux + run.uz * uz < .985) endRun();
        run ||= { points: [a], normals: [], length: 0, ux, uz };
        run.points.push(b); run.normals.push([nx, nz]); run.length += length; run.ux = ux; run.uz = uz;
        // Without a census, trees are assumed at a typical spacing along the kerb.
        if (!census) for (let s = ((a[0] * 3.7 + a[1] * 1.9) % 11 + 11) % 11; s < length; s += 11) {
          const x = a[0] + dx * s / length, z = a[1] + dz * s / length, chance = ((x * 12.9898 + z * 78.233) % 1 + 1) % 1;
          if (chance < .46) planted.push({ x: x - nx * 1.05, z: z - nz * 1.05, girth: .12 + chance * .9, species: '' });
        }
        // Street lamps stand just inside the kerb and reach out over the road.
        sinceLamp += length;
        while (sinceLamp > 58) {
          sinceLamp -= 58;
          const t = Math.max(0, Math.min(1, 1 - sinceLamp / length)), x = a[0] + dx * t, z = a[1] + dz * t;
          lamps.push({ x: x - nx * .55, z: z - nz * .55, y: sample(x, z) + SIDEWALK_LIFT, nx, nz });
        }
      }
      endRun();
    }
  }

  // --- Paint: lane lines from the centrelines, crossings at junction mouths ------
  const carriageway = (x, z) => Boolean(grid.find(x, z, isCarriageway)), junction = (x, z) => Boolean(grid.find(x, z, isJunction));
  // Which way traffic runs on the street nearest a point: toward the junction
  // that lies against `(nx, nz)`, away from it, or both.
  const flowAt = (x, z, nx, nz) => {
    let best = null, gap = 14;
    for (const line of roads) {
      if (line.roadwayType !== 1) continue;
      for (let i = 1; i < line.points.length; i++) {
        const a = line.points[i - 1], b = line.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
        if (!length2) continue;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
        // Only a street that actually runs into the junction counts.
        const along = (dx * nx + dz * nz) / Math.sqrt(length2);
        if (d < gap && Math.abs(along) > .6) { gap = d; best = { line, along }; }
      }
    }
    if (!best) return 'away';
    if (!best.line.oneway) return 'both';
    // The outline normal points away from the junction; arriving traffic runs against it.
    const forward = best.line.oneway === '-1' ? -best.along : best.along;
    return forward < 0 ? 'toward' : 'away';
  };
  const inCell = (x, z) => !bounds || (x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ);
  for (const line of roads) {
    if (line.kind === 'tunnel' || line.kind === 'bridge' || line.roadwayType !== 1 || line.fromLevel !== 13 || line.toLevel !== 13 || !(line.width >= 7.5)) continue;
    await breathe();
    const twoWay = !line.oneway, offsets = [];
    // Kerbside parking takes a lane on each side of all but the narrowest
    // streets; the rest is divided as traffic will use it (lanes.js).
    const { count: lanes, width: laneWidth } = laneLayout(line.width, !twoWay);
    if (twoWay) {
      offsets.push({ at: -.11, color: YELLOW, dash: 0 }, { at: .11, color: YELLOW, dash: 0 });
      for (let k = 1; k < lanes; k++) offsets.push({ at: k * laneWidth, color: WHITE, dash: 1 }, { at: -k * laneWidth, color: WHITE, dash: 1 });
    } else {
      for (let k = 1; k < lanes; k++) offsets.push({ at: (k - lanes / 2) * laneWidth, color: WHITE, dash: 1 });
    }
    if (!offsets.length) continue;
    let travelledLength = 0;
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < .5) continue;
      const tx = dx / length, tz = dz / length, px = -tz, pz = tx;
      for (const { at, color, dash } of offsets) {
        // Dashes are three metres on, nine off; solid lines are laid in six-metre runs.
        const period = dash ? 12 : 6, run = dash ? 3 : 6;
        for (let s = dash ? (period - travelledLength % period) % period : 0; s < length; s += period) {
          const e = Math.min(length, s + run);
          const ax = a[0] + tx * s + px * at, az = a[1] + tz * s + pz * at, bx = a[0] + tx * e + px * at, bz = a[1] + tz * e + pz * at;
          if (!inCell((ax + bx) / 2, (az + bz) / 2)) continue;
          // Paint stops short of every junction, and never leaves the roadbed.
          if (!carriageway(ax, az) || !carriageway(bx, bz) || junction(ax + tx * -4.5, az + tz * -4.5) || junction(bx + tx * 4.5, bz + tz * 4.5)) continue;
          paint(marks, sample, ax, az, bx, bz, .12, color);
        }
      }
      travelledLength += length;
    }
  }
  for (const entry of entries) {
    if (!entry.junction || !entry.owned || entry.elevated) continue;
    await breathe();
    const ring = entry.surface.polygon, clockwise = signedArea(ring) < 0;
    // A junction's outline crosses each street that enters it. Find those mouths.
    const mouths = [];
    let current = null;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < .3) continue;
      let nx = dz / length, nz = -dx / length;
      if (clockwise) { nx = -nx; nz = -nz; }
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const open = carriageway(mx + nx * 1.2, mz + nz * 1.2);
      if (open && current && current.nx * nx + current.nz * nz > .9 && Math.hypot(a[0] - current.b[0], a[1] - current.b[1]) < .5) { current.b = b; continue; }
      current = open ? { a, b, nx, nz } : null;
      if (current) mouths.push(current);
    }
    for (const { a, b, nx, nz } of mouths) {
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 5 || length > 45) continue;
      const tx = dx / length, tz = dz / length;
      // Ladder crossing: bars along the direction of travel, a pace apart.
      const bars = Math.floor((length - .8) / 1.1), start = (length - (bars - 1) * 1.1) / 2;
      let firstBar, lastBar;
      for (let k = 0; k < bars; k++) {
        const s = start + k * 1.1, x = a[0] + tx * s, z = a[1] + tz * s;
        if (!carriageway(x + nx * 3.6, z + nz * 3.6)) continue;
        const centre = { x: x + nx * 2.2, z: z + nz * 2.2 };
        firstBar ??= centre; lastBar = centre;
        paint(marks, sample, x + nx * .7, z + nz * .7, x + nx * 3.7, z + nz * 3.7, .55, WHITE);
      }
      if (!firstBar || firstBar === lastBar) continue;
      const crossing = { a: firstBar, b: lastBar, nx, nz, outline: entry.index, stopLine: null };
      crossings.push(crossing);
      // The stop line sits a car's length back, across the lanes that arrive here.
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, flow = flowAt(mx + nx * 6, mz + nz * 6, nx, nz);
      if (flow === 'away') continue;
      const ox = nx * 5.2, oz = nz * 5.2;
      if (!carriageway(mx + ox, mz + oz)) continue;
      // Traffic keeps right: arriving lanes are on the right of the way in.
      const rightward = nz * tx - nx * tz > 0;
      const from = flow === 'both' ? (rightward ? length / 2 + .2 : .5) : .5, to = flow === 'both' ? (rightward ? length - .5 : length / 2 - .2) : length - .5;
      const line = { ax: a[0] + tx * from + ox, az: a[1] + tz * from + oz, bx: a[0] + tx * to + ox, bz: a[1] + tz * to + oz };
      crossing.stopLine = line;
      paint(marks, sample, line.ax, line.az, line.bx, line.bz, .4, WHITE);
    }
  }
  // --- Kerbside parking ---------------------------------------------------------
  // A space is offered only where a parked car stays clear of the lane that
  // traffic drives in: beside wide streets, and on the far side of one-way ones.
  // The street a kerb belongs to is the nearest centreline of any kind; only
  // an ordinary street at grade, wide enough to pass a parked car, qualifies.
  const lines = roads.filter(line => line.kind !== 'tunnel' && Array.isArray(line.points));
  const parkable = line => line.roadwayType === 1 && line.kind !== 'bridge' && line.fromLevel === 13 && line.toLevel === 13 && line.width >= 7;
  const lineAt = (x, z) => {
    let best = null;
    for (const line of lines) for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2)), px = a[0] + dx * t, pz = a[1] + dz * t, gap = Math.hypot(px - x, pz - z);
      if (gap < 16 && (!best || gap < best.gap)) {
        const heading = Math.atan2(dx, dz);
        // The simulation's lane lies toward (-cos, sin) of a car's heading.
        best = { line, gap, heading, side: (x - px) * -Math.cos(heading) + (z - pz) * Math.sin(heading) };
      }
    }
    return best;
  };
  // Outlines can share a kerb, and a kerb can double back on itself: a space
  // is given up if another already lies within a car's length of it.
  const taken = new Map(), bucket = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  const crowded = (x, z) => {
    for (let dx = -6; dx <= 6; dx += 6) for (let dz = -6; dz <= 6; dz += 6) for (const other of taken.get(bucket(x + dx, z + dz)) || []) if (Math.hypot(other.x - x, other.z - z) < 5) return true;
    return false;
  };
  for (const run of kerbs) {
    await breathe();
    let edge = 0, passed = 0;
    for (let s = PARKING_END; s <= run.length - PARKING_END; s += PARKING_PITCH) {
      let a = run.points[edge], b = run.points[edge + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (s > passed + length && edge < run.normals.length - 1) { passed += length; edge++; a = run.points[edge]; b = run.points[edge + 1]; length = Math.hypot(b[0] - a[0], b[1] - a[1]); }
      const tx = (b[0] - a[0]) / length, tz = (b[1] - a[1]) / length, [nx, nz] = run.normals[edge];
      const x = a[0] + tx * (s - passed) + nx * PARKING_OFFSET, z = a[1] + tz * (s - passed) + nz * PARKING_OFFSET;
      if (!inCell(x, z) || !carriageway(x, z) || !carriageway(x + nx * 1.6, z + nz * 1.6)) continue;
      // Corners and crossings are kept clear.
      if (junction(x + tx * 9, z + tz * 9) || junction(x - tx * 9, z - tz * 9) || junction(x + nx * 7, z + nz * 7)) continue;
      const near = lineAt(x, z);
      if (!near || !parkable(near.line)) continue;
      const lane = Math.max(.65, Math.min(2.5, near.line.width * .19)), oneWay = near.line.oneway, travel = oneWay === '-1' ? -1 : 1;
      const layout = near.line.width >= 7.5 ? laneLayout(near.line.width, Boolean(oneWay)) : null;
      if (layout?.driven) {
        // Traffic runs in every painted lane, so the lane beside either kerb
        // is a moving one. A parked car must stand clear of it by a hand's
        // width more than traffic looks for on either side of itself (1.95 m
        // between centres), or it would hold the lane up.
        if (near.gap < Math.abs(layout.first + (oneWay ? 0 : layout.step * (layout.count - 1))) + 2.1) continue;
      } else {
        // Traffic keeps to a single file, on one side of the centreline of a one-way street.
        const beside = !oneWay || Math.sign(near.side) === travel;
        // Beside that file a car needs its half width, its own, and room to
        // pass; across the centreline from it, only to stay out of its reach.
        if (near.gap < (beside ? lane + 2.45 : Math.max(.95, 2.6 - lane))) continue;
      }
      // Hydrants, driveways and bus stops keep a few spaces empty for good.
      if (hash2(x, z) < .1 || crowded(x, z)) continue;
      // Parked with the flow on a one-way street; otherwise with the kerb on the right.
      const angle = oneWay ? near.heading + (travel < 0 ? Math.PI : 0) : Math.atan2(-nz, nx);
      // `fill` orders the spaces: a street that is 70% parked uses those below .7.
      const space = { id: `kerb:${Math.round(x * 2)}:${Math.round(z * 2)}`, x, z, angle, fill: hash2(z, x) }, key = bucket(x, z);
      parking.push(space);
      if (!taken.has(key)) taken.set(key, []);
      taken.get(key).push(space);
    }
  }
  // Trees stand where the census found them, on whatever surface is there.
  for (const tree of census || planted) {
    if (bounds && !(tree.x >= bounds.minX && tree.x < bounds.maxX && tree.z >= bounds.minZ && tree.z < bounds.maxZ)) continue;
    const under = grid.find(tree.x, tree.z);
    // A census point that lands in the carriageway is a rounding error; skip it.
    if (under?.road || (!census && lamps.some(lamp => Math.hypot(lamp.x - tree.x, lamp.z - tree.z) < 3.5))) continue;
    trees.push({ ...tree, y: sample(tree.x, tree.z) + (under?.raised ? SIDEWALK_LIFT : under ? ROAD_LIFT : 0) });
  }
  // --- Where people walk ----------------------------------------------------------
  // Each stretch of sidewalk kerb, with how far in from the kerb the sidewalk
  // reaches at its middle and the distance along it to each of its points.
  for (const run of walks) {
    run.lengths = [0];
    for (let i = 1; i < run.points.length; i++) run.lengths.push(run.lengths[i - 1] + Math.hypot(run.points[i][0] - run.points[i - 1][0], run.points[i][1] - run.points[i - 1][1]));
    const middle = Math.min(run.normals.length - 1, run.points.length >> 1), [mx, mz] = run.points[middle], [nx, nz] = run.normals[Math.max(0, middle - 1)];
    if (!run.plaza) {
      run.depth = .6;
      for (const reach of [1, 2, 3.2, 4.5]) { if (!grid.find(mx - nx * reach, mz - nz * reach, isRaised)) break; run.depth = reach; }
    }
    const first = run.points[0], last = run.points.at(-1);
    run.id = `walk:${Math.round(first[0] * 2)}:${Math.round(first[1] * 2)}:${Math.round(last[0] * 2)}:${Math.round(last[1] * 2)}`;
  }
  return { road, walk, marks, grid, lamps, trees, fences, parking, walks, crossings, surfaces: drawn };
}

// --- Materials ------------------------------------------------------------------
const STREET_VERTEX = /* glsl */`
varying vec2 vStreetXZ;
`;
const pulseGLSL = /* glsl */`
float streetPulseArea( float x, float duty ) { return floor( x ) * duty + min( fract( x ), duty ); }
float streetPulse( float x, float duty, float width ) {
	width = max( width, 1e-4 );
	return ( streetPulseArea( x + 0.5 * width, duty ) - streetPulseArea( x - 0.5 * width, duty ) ) / width;
}`;

export function asphaltMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: 0 });
  material.name = 'Asphalt';
  material.onBeforeCompile = (shader, renderer) => {
    bindCitySurface(shader, renderer, 'asphalt');
    shader.vertexShader = STREET_VERTEX + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetXZ = position.xz;');
    shader.fragmentShader = `${CITY_SURFACE_GLSL}\nvarying vec2 vStreetXZ;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	{
		vec2 w = vStreetXZ;
		float size = max( fwidth( w.x ), fwidth( w.y ) );
		float close = 1.0 - smoothstep( 0.01, 0.06, size );
		// Decades of patching: broad tone, then the hard-edged rectangles of repairs.
		float drift = texture2D( uNycNoise, w * 0.009 ).r;
		float mottle = texture2D( uNycNoise, w * 0.17 ).g;
		vec3 asphalt = vec3( 0.06, 0.061, 0.064 ) * ( 0.7 + 0.62 * drift ) * ( 0.84 + 0.32 * mottle );
		vec2 patchCell = floor( w / vec2( 3.7, 9.0 ) + texture2D( uNycNoise, w * 0.004 ).g * 6.0 );
		float repair = step( 0.83, nycHash12( patchCell ) );
		asphalt *= mix( 1.0, 0.66 + 0.5 * nycHash12( patchCell + 7.0 ), repair );
		// Sealed cracks wander across the surface.
		float seam = abs( texture2D( uNycNoise, w * 0.19 + 0.37 ).g - 0.5 );
		float cracked = smoothstep( 0.5, 0.62, texture2D( uNycNoise, w * 0.017 + 0.83 ).r );
		float crack = ( 1.0 - smoothstep( 0.0, 0.0035 + size * 0.03, seam ) ) * cracked * ( 1.0 - smoothstep( 0.015, 0.12, size ) );
		asphalt *= 1.0 - 0.42 * crack;
		// Aggregate: the grit that catches low sun.
		float wet = uNycWet * ( 0.55 + 0.45 * smoothstep( 0.42, 0.62, texture2D( uNycNoise, w * 0.031 + 0.11 ).r ) );
		vec2 slope;
		float dryRoughness;
		if ( uCitySurfaceReady ) {
			// The scan covers four metres. Broad repair patches stay visible after
			// the aggregate has filtered down to its average.
			vec4 scan = texture2D( uCitySurface, vec2( w.x, -w.y ) * 0.25 );
			asphalt *= exp2( 3.7 * ( scan.r - 0.5 ) );
			slope = ( scan.gb * 2.0 - 1.0 ) * vec2( 0.85, -0.85 );
			dryRoughness = mix( 0.60, 0.98, scan.a );
		} else {
			float grit = texture2D( uNycNoise, w * 2.3 ).b, fine = texture2D( uNycNoise, w * 7.7 ).a;
			asphalt *= 1.0 + close * ( 0.5 * ( grit - 0.5 ) + 0.3 * ( fine - 0.5 ) );
			slope = vec2( texture2D( uNycNoise, w * 2.3 + vec2( 0.004, 0.0 ) ).b - grit,
				texture2D( uNycNoise, w * 2.3 + vec2( 0.0, 0.004 ) ).b - grit ) * ( 2.2 * close );
			dryRoughness = 0.94 - 0.16 * close * grit;
		}
		diffuseColor.rgb = asphalt * mix( 1.0, 0.55, wet );
		roughnessFactor = mix( dryRoughness, 0.1, wet );
		normal = normalize( normal + ( viewMatrix * vec4( slope.x, 0.0, slope.y, 0.0 ) ).xyz * ( 1.0 - wet ) );
	}`);
  };
  return material;
}

function pavementMaterial() {
  // Sidewalks, plazas and lots overlap in the survey. A constant depth bias
  // lets the walked-on surface win wherever two lie in the same plane.
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3 });
  material.name = 'Sidewalk and kerb';
  material.onBeforeCompile = (shader, renderer) => {
    bindCitySurface(shader, renderer, 'concrete');
    shader.vertexShader = `${STREET_VERTEX}attribute vec3 aPaving;\nvarying vec3 vPaving;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetXZ = position.xz; vPaving = aPaving;');
    shader.fragmentShader = `${CITY_SURFACE_GLSL}\nvarying vec2 vStreetXZ;\nvarying vec3 vPaving;\n${pulseGLSL}\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	{
		vec2 w = vStreetXZ;
		float size = max( fwidth( w.x ), fwidth( w.y ) );
		float close = 1.0 - smoothstep( 0.012, 0.07, size );
		float kind = vPaving.z;
		float tone = texture2D( uNycNoise, w * 0.05 ).r, speck = texture2D( uNycNoise, w * 3.1 ).b;
		if ( kind > 5.5 ) {
            vec2 axis = normalize(vPaving.xy);
            vec2 stone = vec2(dot(w,axis)/1.22, dot(w,vec2(-axis.y,axis.x))/.61);
            stone.x += .5*mod(floor(stone.y),2.0);
            float value = nycHash12(floor(stone));
            vec2 joints = min(fract(stone),1.0-fract(stone));
            float mortar = 1.0-smoothstep(.001,.009+size,min(joints.x,joints.y));
            vec3 granite = mix(vec3(.10,.104,.115),vec3(.19,.194,.204),value) * (.85+.30*speck);
            vec2 pin = fract(stone*vec2(4.0,2.0))-.5;
            float disc=(1.0-smoothstep(.026,.045+size*2.0,length(pin)))*close;
            diffuseColor.rgb=mix(granite*(1.0-.48*mortar),vec3(.52),disc)*mix(1.0,.65,uNycWet);
            roughnessFactor=mix(mix(.76,.18,uNycWet),.28,disc);
            metalnessFactor=.72*disc;
        } else if ( kind > 4.5 ) {
			// A planted median: mown turf between its kerbs.
			float clump = texture2D( uNycNoise, w * 0.41 ).r, field = texture2D( uNycNoise, w * 0.023 ).b, blade = texture2D( uNycNoise, w * vec2( 3.1, 5.3 ) ).g;
			diffuseColor.rgb = mix( vec3( 0.058, 0.1, 0.028 ), vec3( 0.13, 0.185, 0.055 ), 0.4 * field + 0.6 * clump ) * ( 1.0 + close * 0.6 * ( blade - 0.5 ) );
			roughnessFactor = 0.96;
		} else if ( kind < 0.5 || kind > 2.5 ) {
			// Concrete flags, five feet square, laid square to the street. A plaza
			// is paved in smaller, darker stone.
			float module = kind > 3.5 ? 0.61 : 1.52;
			vec2 axis = normalize( vPaving.xy + vec2( 1e-5, 0.0 ) );
			vec2 flag = vec2( dot( w, axis ), dot( w, vec2( - axis.y, axis.x ) ) ) / module;
			vec2 pixel = vec2( size ) / module;
			float joint = 1.0 - streetPulse( flag.x, 0.984, pixel.x ) * streetPulse( flag.y, 0.984, pixel.y );
			// Replaced flags are paler than their neighbours.
			float slab = nycHash12( floor( flag ) );
			vec3 concrete = vec3( 0.34, 0.33, 0.31 ) * ( 0.8 + 0.3 * tone ) * ( 0.9 + 0.22 * slab * slab );
			concrete *= 1.0 - 0.5 * joint * ( 1.0 - smoothstep( 0.03, 0.25, size ) );
			concrete *= 1.0 + close * 0.3 * ( speck - 0.5 );
			// Gum and old stains, as anywhere people walk.
			float gum = step( 0.93, texture2D( uNycNoise, w * 0.9 + 0.5 ).b ) * step( 0.6, texture2D( uNycNoise, w * 2.9 ).g );
			concrete *= 1.0 - 0.45 * gum * close;
			if ( kind > 3.5 ) concrete *= vec3( 0.62, 0.63, 0.66 ) * ( 0.86 + 0.28 * nycHash12( floor( flag ) + 3.0 ) );
			else if ( kind > 2.5 ) concrete *= vec3( 0.72, 0.72, 0.74 );
			roughnessFactor = 0.9;
			if ( uCitySurfaceReady ) {
				// Start each poured flag at a different point in the scan. Take the
				// derivatives before the offset so a joint stays sharp on both sides.
				vec2 uv = flag * ( module * 0.5 );
				vec2 shift = nycHash22( floor( flag ) );
				vec4 scan = textureGrad( uCitySurface, uv + shift, dFdx( uv ), dFdy( uv ) );
				concrete *= exp2( ( scan.r - 0.5 ) * 2.65 );
				vec2 slope = ( scan.g * 2.0 - 1.0 ) * axis + ( scan.b * 2.0 - 1.0 ) * vec2( -axis.y, axis.x );
				normal = normalize( normal + ( viewMatrix * vec4( slope.x, 0.0, slope.y, 0.0 ) ).xyz * 0.75 );
				roughnessFactor = mix( 0.65, 0.97, scan.a );
			}
			diffuseColor.rgb = concrete;
		} else {
			// Kerbstone: bluestone and granite, worn smooth at the top.
			vec3 stone = vec3( 0.2, 0.205, 0.215 ) * ( 0.8 + 0.4 * tone ) * ( 1.0 + close * 0.5 * ( speck - 0.5 ) );
			diffuseColor.rgb = stone;
			roughnessFactor = 0.72;
		}
	}`);
  };
  return material;
}

export function paintMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  material.name = 'Road paint';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `${STREET_VERTEX}attribute vec3 aPaint;\nvarying vec3 vPaint;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetXZ = position.xz; vPaint = aPaint;');
    shader.fragmentShader = `varying vec2 vStreetXZ;\nvarying vec3 vPaint;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	{
		// Thermoplastic wears through where tyres run.
		float wear = texture2D( uNycNoise, vStreetXZ * 0.23 ).g * 0.55 + texture2D( uNycNoise, vStreetXZ * 1.9 ).b * 0.45;
		float worn = smoothstep( 0.36, 0.5, wear );
		diffuseColor.rgb = mix( vec3( 0.075 ), vPaint, 0.35 + 0.65 * worn ) * ( 0.85 + 0.3 * texture2D( uNycNoise, vStreetXZ * 0.07 ).r );
	}`);
  };
  return material;
}

/**
 * Streams street cells around a focus point and keeps their meshes current.
 */
export function createStreetscape({ scene, index = null, origin = CITY_ORIGIN, heightAt = () => 0, roadsFor = async () => [], fetcher, cacheStorage, live = true, stairOpenings = null,
  onChange = () => {}, onStatus = () => {}, now = () => Date.now(), radius = 420, maxCells = 14, physics = null } = {}) {
  const source = createStreetSource({ index, origin, fetcher, cacheStorage, live }), size = source.size;
  const group = new THREE.Group(); group.name = 'Street surfaces'; scene?.add(group);
  const materials = { road: asphaltMaterial(), walk: pavementMaterial(), marks: paintMaterial() };
  if (stairOpenings) for (const material of Object.values(materials)) stairOpenings.clip(material);
  const cells = new Map();
  let wanted = new Set(), disposed = false, serial = 0, terrainRevision = 0, selection = '', active = 0, replacement = null, urgent = 0;
  let crossingCache;
  let lampList = [], treeList = [], parkingList = [], walkList = [], lampsStale = true, treesStale = true, parkingStale = true, walksStale = true;
  const excluded = surface => replacement && surface.polygon.some(([x, z]) => x >= replacement.minX && x <= replacement.maxX && z >= replacement.minZ && z <= replacement.maxZ);
  // Counts describe the cells in use around the player, not everything cached.
  const status = () => {
    const inUse = [...wanted].map(key => cells.get(key)).filter(Boolean), ready = inUse.filter(cell => cell.ready);
    return { cells: ready.length, cachedCells: cells.size, loading: [...cells.values()].filter(cell => cell.loading).length,
      failures: inUse.filter(cell => cell.failed).length, surfaces: ready.reduce((sum, cell) => sum + (cell.surfaces || 0), 0),
      lamps: ready.reduce((sum, cell) => sum + (cell.lamps?.length || 0), 0), trees: ready.reduce((sum, cell) => sum + (cell.trees?.length || 0), 0),
      censusTrees: ready.some(cell => cell.census), live };
  };
  const report = () => { if (!disposed) onStatus(status()); };

  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x424b48, roughness: .7 });
  let fenceGeometry;
  function installFence(cell, panels) {
    if (!fenceGeometry) {
      // A unit panel along local Z, stretched to fit each surveyed edge.
      const writer = new MeshWriter();
      const box = (width, height, depth, y, z) => {
        const part = new THREE.BoxGeometry(width, height, depth).translate(0, y, z);
        const { position, normal } = part.attributes;
        for (const i of part.index.array) writer.push(position.getX(i), position.getY(i), position.getZ(i),
          normal.getX(i), normal.getY(i), normal.getZ(i));
        part.dispose();
      };
      box(.05, .05, 1, .9, 0);
      box(.05, .04, 1, .25, 0);
      for (let i = 0; i < 7; i++) box(.045, 1, .016, .5, i / 7 - .49);
      fenceGeometry = writer.geometry();
    }
    const mesh = new THREE.InstancedMesh(fenceGeometry, fenceMaterial, panels.length);
    mesh.name = 'Median fence panels'; mesh.castShadow = true; mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    panels.forEach((body, i) => {
      matrix.makeRotationY(Math.atan2(body.tx, body.tz)).scale(scale.set(1, 1, 2 * body.half)).setPosition(body.x, body.y, body.z);
      mesh.setMatrixAt(i, matrix);
      if (physics) body.draw = propInstance(mesh, i, body, matrix);
    });
    group.add(mesh);
    cell.meshes.push(mesh);
    cell.fence = mesh;
    cell.panels = panels;
    physics?.replace(cell.key, panels);
  }
  function release(cell) {
    for (const mesh of cell.meshes || []) {
      group.remove(mesh);
      if (mesh === cell.fence) {
        physics?.replace(cell.key, []);
        mesh.dispose();
      } else mesh.geometry.dispose();
    }
    cell.fence = null; cell.panels = null;
    cell.meshes = null; cell.grid = null; cell.lamps = null; cell.trees = null; cell.parking = null; cell.walks = null; cell.crossings = null; cell.ready = false; lampsStale = treesStale = parkingStale = walksStale = true;
  }
  function install(cell, built) {
    release(cell);
    cell.meshes = [];
    for (const [name, order] of [['road', 0], ['walk', 0], ['marks', 1]]) {
      if (!built.geometries[name]) continue;
      const mesh = new THREE.Mesh(built.geometries[name], materials[name]);
      // Nothing here casts a shadow: a sidewalk is fifteen centimetres of kerb, and sending four hundred thousand
      // triangles of it through every shadow pass bought nothing that could be seen.
      mesh.name = `Street ${name} ${cell.key}`; mesh.receiveShadow = true; mesh.castShadow = false; mesh.renderOrder = order;
      group.add(mesh); cell.meshes.push(mesh);
    }
    if (built.fences.length) installFence(cell,built.fences);
    cell.grid = built.grid; cell.lamps = built.lamps; cell.trees = built.trees; cell.parking = built.parking; cell.walks = built.walks; cell.crossings = built.crossings; cell.surfaces = built.surfaces; cell.ready = true; cell.revision = terrainRevision;
    lampsStale = treesStale = parkingStale = walksStale = true;
  }
  // The ground at eighty-one points under a cell and a little way round it: what the cell was draped on. Finer terrain
  // arrives a region at a time, and most of it is under some other part of the city: a cell whose ground reads the same
  // afterwards is left as it was built. A change narrower than the sixty metres between two points can be missed.
  const probe = bounds => {
    const heights = new Float32Array(81), x0 = bounds.minX - 60, z0 = bounds.minZ - 60, dx = (bounds.maxX - bounds.minX + 120) / 8, dz = (bounds.maxZ - bounds.minZ + 120) / 8;
    for (let i = 0; i < 9; i++) for (let k = 0; k < 9; k++) heights[i * 9 + k] = heightAt(x0 + dx * i, z0 + dz * k) || 0;
    return heights;
  };
  const sameGround = (a, b) => Boolean(a && b) && a.every((height, i) => Math.abs(height - b[i]) < .01);
  async function load(cell) {
    cell.loading = true; cell.failed = false; active++;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    cell.controller = controller;
    try {
      const bounds = cellBounds(cell.key, size);
      // The tree census is a nicety: its failure must not cost the street.
      if (!cell.data) {
        const [data, census] = await Promise.all([source.load(cell.key, controller.signal), source.trees(cell.key, controller.signal)]);
        cell.data = data; cell.census = census;
      }
      if (disposed || cell.controller !== controller) return;
      const roads = await roadsFor(bounds).catch(() => []);
      if (disposed || cell.controller !== controller) return;
      const revision = terrainRevision, ground = probe(bounds);
      const pause = () => new Promise(resolve => setTimeout(resolve, 0));
      const built = await buildCell(cell.data.surfaces, roads, { heightAt, bounds, excluded, census: cell.census, pause, slice: () => [5, 20, 80][urgent] });
      // Packing each batch for the GPU is its own piece of work; spread them over frames.
      built.geometries = {};
      for (const [name, attribute] of [['road', null], ['walk', 'aPaving'], ['marks', 'aPaint']]) {
        if (disposed || cell.controller !== controller || !cells.has(cell.key)) break;
        if (built[name].count) { built.geometries[name] = built[name].geometry(attribute); await pause(); }
      }
      if (disposed || cell.controller !== controller || !cells.has(cell.key)) { for (const geometry of Object.values(built.geometries)) geometry.dispose(); return; }
      install(cell, built); cell.ground = ground;
      // Terrain that changed elsewhere while this was being built has not made it stale.
      cell.revision = revision === terrainRevision || sameGround(ground, probe(bounds)) ? terrainRevision : revision;
      onChange();
    } catch (error) {
      if (!disposed && cell.controller === controller) { cell.failed = true; cell.retryAt = now() + 5000; cell.error = error.message; }
    } finally {
      clearTimeout(timer); active--;
      if (cell.controller === controller) { cell.loading = false; cell.controller = null; }
      if (!disposed) { report(); pump(); }
    }
  }
  function pump() {
    if (disposed) return;
    const queue = [...wanted].map(key => cells.get(key)).filter(cell => cell && !cell.loading && (!cell.ready || cell.revision !== terrainRevision) && !(cell.failed && cell.retryAt > now()))
      .sort((a, b) => a.distance - b.distance);
    for (const cell of queue) { if (active >= (urgent ? 6 : 3)) break; load(cell); }
  }
  function trim() {
    for (const cell of [...cells.values()].sort((a, b) => a.used - b.used)) {
      if (cells.size <= maxCells) break;
      if (wanted.has(cell.key)) continue;
      cell.controller?.abort(); cell.controller = null; release(cell); cells.delete(cell.key);
    }
  }
  function select(focus, reach) {
    const next = new Set();
    for (let x = Math.floor((focus.x - reach) / size); x <= Math.floor((focus.x + reach) / size); x++) for (let z = Math.floor((focus.z - reach) / size); z <= Math.floor((focus.z + reach) / size); z++) {
      const key = `${x},${z}`;
      if (!source.has(key)) continue;
      next.add(key);
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = { key, used: 0, ready: false, loading: false, failed: false });
      cell.used = ++serial;
      cell.distance = Math.hypot((x + .5) * size - focus.x, (z + .5) * size - focus.z);
    }
    return next;
  }
  return {
    group, materials,
    update(focus, { overview = false } = {}) {
      if (disposed || !finite(focus?.x) || !finite(focus?.z)) return;
      group.visible = !overview;
      const key = `${Math.floor(focus.x / 60)},${Math.floor(focus.z / 60)},${overview}`;
      if (key !== selection) {
        selection = key;
        // Keep what is loaded while the city overview is up; ask for nothing new.
        if (!overview) wanted = select(focus, radius);
        for (const cell of cells.values()) {
          const keep = wanted.has(cell.key);
          if (cell.fence && cell.fence.visible!==keep) physics?.replace(cell.key,keep?cell.panels:[]);
          for (const mesh of cell.meshes || []) mesh.visible = keep;
          if (!keep && cell.loading) { cell.controller?.abort(); cell.controller = null; cell.loading = false; }
        }
        lampsStale = treesStale = parkingStale = walksStale = true;
        trim(); report();
      }
      if (!overview) pump();
    },
    /**
     * Say how much the streets are being waited for: 0 while someone is playing, when a cell is built in pieces of a few
     * milliseconds so that driving into it does not cost a frame; 2 while an arrival is held until they are built, when
     * more cells are fetched at once and each is built in long pieces; 1, between the two, for a place that may be asked for.
     */
    setUrgent(level) { const next = Math.max(0, Math.min(2, Number(level) || 0)); if (urgent === next) return; urgent = next; if (urgent) pump(); },
    /** Wait, briefly, for the streets around a destination. Never rejects. */
    async prepareAt(point, timeout = 2500) {
      if (disposed) return false;
      selection = ''; wanted = select(point, radius); pump();
      const ids = [...wanted];
      for (let waited = 0; !disposed && waited < timeout && ids.some(id => { const cell = cells.get(id); return cell && !cell.ready && !cell.failed; }); waited += 60) await new Promise(resolve => setTimeout(resolve, 60));
      return ids.every(id => cells.get(id)?.ready);
    },
    /** How far the street surface stands above the bare terrain here. */
    offsetAt(x, z) {
      // A cell's lookup holds every outline that touches it, so one cell answers.
      const grid = cells.get(`${Math.floor(x / size)},${Math.floor(z / size)}`)?.grid;
      if (!grid) return 0;
      if (grid.find(x, z, isRaised)) return SIDEWALK_LIFT;
      return grid.find(x, z) ? ROAD_LIFT : 0;
    },
    /** 'sidewalk', 'road' or null: what the survey says is underfoot. */
    surfaceAt(x, z) {
      const entry = cells.get(`${Math.floor(x / size)},${Math.floor(z / size)}`)?.grid?.find(x, z);
      return entry ? (entry.road ? 'road' : 'sidewalk') : null;
    },
    /** Lamp positions for the cells in use. The same array is returned until they change. */
    lamps() {
      if (lampsStale) {
        lampList = []; lampsStale = false;
        for (const key of wanted) { const cell = cells.get(key); if (cell?.lamps) lampList.push(...cell.lamps); }
      }
      return lampList;
    },
    /** Kerbside parking spaces ({ id, x, z, angle, fill }) for the cells in use; the same array until they change. */
    /** Stretches of sidewalk kerb to walk along, for the cells in use; the same array until they change. */
    walks() {
      if (walksStale) {
        walkList = []; walksStale = false;
        for (const key of wanted) { const cell = cells.get(key); if (cell?.walks) walkList.push(...cell.walks); }
      }
      return walkList;
    },
    paintedCrossings(junctions) {
      const walks = this.walks();
      if (walks !== crossingCache?.walks || junctions !== crossingCache?.junctions) {
        const crossings = [];
        for (const key of wanted) crossings.push(...(cells.get(key)?.crossings || []));
        crossingCache = { walks, junctions, matches: matchPaintedCrossings(junctions, crossings) };
      }
      return crossingCache.matches;
    },
    parking() {
      if (parkingStale) {
        parkingList = []; parkingStale = false;
        for (const key of wanted) { const cell = cells.get(key); if (cell?.parking) parkingList.push(...cell.parking); }
      }
      return parkingList;
    },
    /** Street trees for the cells in use; the same array until they change. */
    trees() {
      if (treesStale) {
        treeList = []; treesStale = false;
        for (const key of wanted) { const cell = cells.get(key); if (cell?.trees) treeList.push(...cell.trees); }
      }
      return treeList;
    },
    setTerrainSampler(sampler, revision = terrainRevision + 1) {
      if (disposed || (heightAt === sampler && terrainRevision === revision)) return;
      const previous = terrainRevision;
      heightAt = typeof sampler === 'function' ? sampler : () => 0; terrainRevision = revision;
      for (const cell of cells.values()) if (cell.ready && cell.revision === previous && sameGround(cell.ground, probe(cellBounds(cell.key, size)))) cell.revision = revision;
      pump();
    },
    /** Leave a rectangle to another renderer, such as the reconstructed road pilot. */
    setGroundReplacementBounds(bounds) {
      replacement = bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(finite) ? bounds : null;
      terrainRevision++; pump();
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cell of cells.values()) { cell.controller?.abort(); release(cell); }
      cells.clear(); wanted.clear();
      fenceGeometry?.dispose(); fenceMaterial.dispose();
      for (const material of Object.values(materials)) material.dispose();
      scene?.remove(group);
    },
  };
}
