import * as THREE from './vendor/three.module.min.js';
import { GRADE, measure } from './road-level.js';

// What is built around a surveyed deck so that it reads as a structure and
// not a sheet: the slab beneath the roadway, a parapet along every edge that
// is a drop, a wall where the deck runs close above the ground, piers under
// the roads it carries, and their lane lines. The survey gives the deck's
// outline and height only; every dimension here is the usual one, assumed.
export const DECK = {
  slab: 1.1, parapet: .9, parapetWidth: .32,
  footSlab: .4, rail: 1.1, railWidth: .1,
  // An edge with ground or another deck this close in height beyond it is a way on or off.
  land: .75,
  // Lower than this above the ground, the side is walled in down to it.
  skirt: 2.8, embankment: 6.5,
  pierSpacing: 26, clearance: 3.2, column: .6, capDepth: 1.1, capHalf: .75,
};
const WHITE = [.78, .78, .74], YELLOW = [.72, .52, .07];
const elevatedRoad = road => road && road.kind !== 'tunnel' && Array.isArray(road.points) && road.points.length > 1
  && (road.kind === 'bridge' || Math.max(road.fromLevel ?? GRADE, road.toLevel ?? GRADE) > GRADE);

function writer() {
  const positions = [], normals = [];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
    if (!(length > 1e-9)) return;
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) normals.push(nx / length, ny / length, nz / length);
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  /** A box standing on the plan rectangle centred at (cx, cz), `hu` along (ux, uz) and `hv` across, from y0 up to y1. */
  const box = (cx, cz, ux, uz, hu, hv, y0, y1) => {
    const vx = -uz, vz = ux, corner = (su, sv, y) => [cx + ux * hu * su + vx * hv * sv, y, cz + uz * hu * su + vz * hv * sv];
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [au, av] = ring[k], [bu, bv] = ring[(k + 1) % 4];
      quad(corner(au, av, y0), corner(bu, bv, y0), corner(bu, bv, y1), corner(au, av, y1));
    }
    quad(corner(-1, -1, y0), corner(-1, 1, y0), corner(1, 1, y0), corner(1, -1, y0));
  };
  return { positions, normals, tri, quad, box };
}

function rim(out, part, { groundAt, surfacesAt }) {
  const foot = part.subtype === 'pedestrian bridge';
  const slab = foot ? DECK.footSlab : DECK.slab, height = foot ? DECK.rail : DECK.parapet, width = foot ? DECK.railWidth : DECK.parapetWidth;
  // The fill of an approach is held by walls for as long as walls are built.
  const V = part.vertices, skirt = part.approach ? DECK.embankment : DECK.skirt;
  for (const { a, b, c } of part.triangles) out.tri([c.x, c.y - slab, c.z], [b.x, b.y - slab, b.z], [a.x, a.y - slab, a.z]);
  const ground = (x, z) => { const g = groundAt?.(x, z); return Number.isFinite(g) ? g : NaN; };
  const meeting = new Map();
  let metres = 0;
  for (const edge of part.edges) {
    const p = V[edge.i], q = V[edge.j], mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, y = (p.y + q.y) / 2;
    let open = false;
    for (const reach of [.6, 1.6]) {
      const x = mx + edge.ox * reach, z = mz + edge.oz * reach, g = ground(x, z);
      open ||= g > y - DECK.land;
      open ||= surfacesAt(x, z, 'walk').some(found => found.triangle.id !== part.id && Math.abs(found.elevation - y) < DECK.land);
    }
    edge.open = open;
    edge.groundI = ground(p.x, p.z);edge.groundJ = ground(q.x, q.z);
    edge.walled = !open && p.y - edge.groundI < skirt && q.y - edge.groundJ < skirt;
    for (const v of [edge.i, edge.j]) { let list = meeting.get(v); if (!list) meeting.set(v, list = []); list.push(edge); }
  }
  // Where the inner face of the parapet stands at each rim vertex, mitred between its two edges.
  const inner = (v, edge) => {
    const edges = meeting.get(v), p = V[v];
    let nx = -edge.ox, nz = -edge.oz, scale = width;
    if (edges.length === 2) {
      const mx = -edges[0].ox - edges[1].ox, mz = -edges[0].oz - edges[1].oz, length = Math.hypot(mx, mz);
      if (length > .2) { nx = mx / length; nz = mz / length; scale = width / Math.max(.35, nx * -edge.ox + nz * -edge.oz); }
    }
    return [p.x + nx * scale, p.z + nz * scale];
  };
  for (const edge of part.edges) {
    const p = V[edge.i], q = V[edge.j];
    if (edge.open) {
      out.quad([p.x, p.y - slab, p.z], [q.x, q.y - slab, q.z], [q.x, q.y, q.z], [p.x, p.y, p.z]);
      continue;
    }
    metres += Math.hypot(q.x - p.x, q.z - p.z);
    const lowP = edge.walled ? edge.groundI - .4 : p.y - slab, lowQ = edge.walled ? edge.groundJ - .4 : q.y - slab;
    const [pix, piz] = inner(edge.i, edge), [qix, qiz] = inner(edge.j, edge);
    out.quad([p.x, lowP, p.z], [q.x, lowQ, q.z], [q.x, q.y + height, q.z], [p.x, p.y + height, p.z]);
    out.quad([p.x, p.y + height, p.z], [q.x, q.y + height, q.z], [qix, q.y + height, qiz], [pix, p.y + height, piz]);
    out.quad([pix, p.y + height, piz], [qix, q.y + height, qiz], [qix, q.y, qiz], [pix, p.y, piz]);
    // Close the end of a parapet where the next edge is a way off the deck.
    for (const [v, x, z] of [[edge.i, pix, piz], [edge.j, qix, qiz]]) {
      if (meeting.get(v).every(other => !other.open)) continue;
      const end = V[v];
      out.quad([end.x, end.y, end.z], [end.x, end.y + height, end.z], [x, end.y + height, z], [x, end.y, z]);
    }
  }
  return metres;
}

function carriageways(roads) {
  const size = 24, grid = new Map();
  for (const road of roads) {
    if (!road || road.kind === 'tunnel' || road.kind === 'bridge' || !Array.isArray(road.points) || Math.max(road.fromLevel ?? GRADE, road.toLevel ?? GRADE) > GRADE) continue;
    const reach = (road.width || 8) / 2 + .7;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], segment = { ax: a[0], az: a[1], bx: b[0], bz: b[1], reach };
      for (let x = Math.floor((Math.min(a[0], b[0]) - reach) / size); x <= Math.floor((Math.max(a[0], b[0]) + reach) / size); x++) {
        for (let z = Math.floor((Math.min(a[1], b[1]) - reach) / size); z <= Math.floor((Math.max(a[1], b[1]) + reach) / size); z++) {
          const key = `${x},${z}`; let list = grid.get(key); if (!list) grid.set(key, list = []); list.push(segment);
        }
      }
    }
  }
  return (x, z) => {
    for (const s of grid.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) || []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, length2 = dx * dx + dz * dz;
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / length2)) : 0;
      if ((s.ax + dx * t - x) ** 2 + (s.az + dz * t - z) ** 2 < s.reach * s.reach) return true;
    }
    return false;
  };
}

/** Walk a road in pieces: `visit(s0, s1, a, b, tx, tz)` for each piece of each segment, `run` long every `period`. */
function along(road, period, run, visit) {
  let travelled = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .5) { travelled += length; continue; }
    const tx = dx / length, tz = dz / length;
    for (let s = (period - travelled % period) % period; s < length; s += period) {
      const e = Math.min(length, s + run);
      visit(travelled + s, travelled + e, [a[0] + tx * s, a[1] + tz * s], [a[0] + tx * e, a[1] + tz * e], tx, tz);
    }
    travelled += length;
  }
}

/**
 * @param {object[]} parts decks as prepared by transport-surfaces.js
 * @param {object} context street centrelines, the ground and water beneath, and the deck queries
 */
export function buildDeckStructure(parts, { roads = [], groundAt = null, waterAt = null, surfacesAt, deckFor, partOf = () => null }) {
  const out = writer(), marks = { positions: [], normals: [], colors: [] };
  let parapetMetres = 0, piers = 0;
  for (const part of parts) parapetMetres += rim(out, part, { groundAt, surfacesAt });
  const carried = roads.filter(elevatedRoad), inCarriageway = carriageways(roads), columns = [];
  const ground = (x, z) => { const g = groundAt?.(x, z); return Number.isFinite(g) ? g : NaN; };
  for (const road of carried) {
    const at = measure(road), total = at.at(-1);
    if (!(total > 1)) continue;
    const from = road.fromLevel ?? GRADE, to = road.toLevel ?? GRADE, width = road.width || 7, half = width / 2;
    const levelAt = s => from + (to - from) * s / total;
    // The deck this road is on at a point of it, if the survey has one there.
    const carrier = (x, z, s) => {
      const level = levelAt(s), deck = deckFor(x, z, level);
      if (!deck) return null;
      // An approach was built for the streets that climb it, and no others.
      const part = partOf(deck.triangle.id);
      if (part?.approach) return part.roads.has(road.id) ? deck : null;
      if (level <= GRADE + .5 && !(Math.abs(deck.elevation - ground(x, z)) < 1.5)) return null;
      return deck;
    };
    const twoWay = !road.oneway, lines = [{ at: half - .3, color: WHITE, dash: 0 }, { at: .3 - half, color: WHITE, dash: 0 }];
    if (twoWay) {
      const lanes = Math.max(1, Math.round((half - .3) / 3.5)), each = (half - .3) / lanes;
      lines.push({ at: -.11, color: YELLOW, dash: 0 }, { at: .11, color: YELLOW, dash: 0 });
      for (let k = 1; k < lanes; k++) lines.push({ at: k * each, color: WHITE, dash: 1 }, { at: -k * each, color: WHITE, dash: 1 });
    } else {
      const lanes = Math.max(1, Math.round((width - .6) / 3.5)), each = (width - .6) / lanes;
      for (let k = 1; k < lanes; k++) lines.push({ at: .3 - half + k * each, color: WHITE, dash: 1 });
    }
    for (const { at: offset, color, dash } of lines) {
      along(road, dash ? 12 : 4, dash ? 3 : 4, (s0, s1, a, b, tx, tz) => {
        const px = -tz, pz = tx, ax = a[0] + px * offset, az = a[1] + pz * offset, bx = b[0] + px * offset, bz = b[1] + pz * offset;
        const start = carrier(ax, az, s0), end = carrier(bx, bz, s1);
        if (!start || !end || start.triangle.id !== end.triangle.id) return;
        const nx = px * .06, nz = pz * .06, ya = start.elevation + .03, yb = end.elevation + .03;
        const corners = [[ax - nx, ya, az - nz], [ax + nx, ya, az + nz], [bx + nx, yb, bz + nz], [bx - nx, yb, bz - nz]];
        for (const i of [0, 1, 2, 0, 2, 3]) { marks.positions.push(...corners[i]); marks.normals.push(0, 1, 0); marks.colors.push(...color); }
      });
    }
    // Piers: a bent under the road at intervals, wherever there is room to stand one.
    along(road, DECK.pierSpacing, .01, (s, _, a, __, tx, tz) => {
      if (s < 6 || s > total - 6) return;
      const [x, z] = a, deck = carrier(x, z, s), g = ground(x, z);
      if (!deck || !Number.isFinite(g) || waterAt?.(x, z)) return;
      const soffit = deck.elevation - DECK.slab;
      if (soffit - g < DECK.clearance) return;
      const px = -tz, pz = tx, id = deck.triangle.id, stands = [];
      for (const offset of width >= 9 ? [-.3 * width, .3 * width] : [0]) {
        const cx = x + px * offset, cz = z + pz * offset, base = ground(cx, cz);
        if (!Number.isFinite(base) || waterAt?.(cx, cz) || inCarriageway(cx, cz)) continue;
        const over = surfacesAt(cx, cz, 'walk');
        if (!over.some(found => found.triangle.id === id) || over.some(found => found.elevation > base + 1 && found.elevation < soffit - .3)) continue;
        if (columns.some(other => (other.x - cx) ** 2 + (other.z - cz) ** 2 < 49)) continue;
        stands.push({ x: cx, z: cz, base, offset });
      }
      if (!stands.length) return;
      piers++;
      for (const stand of stands) {
        columns.push(stand);
        out.box(stand.x, stand.z, tx, tz, DECK.column, DECK.column, stand.base - .5, soffit - DECK.capDepth);
      }
      const low = Math.min(...stands.map(stand => stand.offset)), high = Math.max(...stands.map(stand => stand.offset));
      const reach = stands.length > 1 ? 1.3 : Math.min(width * .42, 4), mid = (low + high) / 2;
      out.box(x + px * mid, z + pz * mid, px, pz, (high - low) / 2 + reach, DECK.capHalf, soffit - DECK.capDepth, soffit + .05);
    });
  }
  const structure = new THREE.BufferGeometry();
  structure.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
  structure.setAttribute('normal', new THREE.Float32BufferAttribute(out.normals, 3));
  if (out.positions.length) structure.computeBoundingSphere();
  const paint = new THREE.BufferGeometry();
  paint.setAttribute('position', new THREE.Float32BufferAttribute(marks.positions, 3));
  paint.setAttribute('normal', new THREE.Float32BufferAttribute(marks.normals, 3));
  paint.setAttribute('aPaint', new THREE.Float32BufferAttribute(marks.colors, 3));
  if (marks.positions.length) paint.computeBoundingSphere();
  return { structure, paint, piers, parapetMetres };
}

/** Cast concrete: board-marked, weathered, streaked below the joints. */
export function concreteMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .93, metalness: 0, side: THREE.DoubleSide });
  material.name = 'Deck concrete';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vDeckWorld;\nvarying vec3 vDeckNormal;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeckWorld = position; vDeckNormal = normal;');
    shader.fragmentShader = `varying vec3 vDeckWorld;\nvarying vec3 vDeckNormal;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	{
		vec3 w = vDeckWorld;
		float upright = 1.0 - abs( normalize( vDeckNormal ).y );
		float drift = texture2D( uNycNoise, w.xz * 0.013 ).r;
		float mottle = texture2D( uNycNoise, w.xz * 0.21 + w.y * 0.13 ).g;
		vec3 concrete = vec3( 0.33, 0.325, 0.31 ) * ( 0.8 + 0.3 * drift ) * ( 0.93 + 0.13 * mottle );
		// Rain runs down the faces and leaves its marks; the pours show as bands.
		float streak = texture2D( uNycNoise, vec2( ( w.x + w.z ) * 0.35, w.y * 0.035 ) ).b;
		concrete *= 1.0 - 0.26 * upright * smoothstep( 0.55, 0.85, streak );
		concrete *= 1.0 - 0.07 * upright * step( 0.93, fract( w.y / 1.2 ) );
		diffuseColor.rgb = concrete * mix( 1.0, 0.7, uNycWet );
	}`);
  };
  return material;
}
