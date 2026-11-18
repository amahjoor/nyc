// The survey outlines a bridge from where its structure begins, which is
// usually some metres above the ground: the embankment or filled ramp that
// leads a road up to it is in neither the outline nor the terrain. Where a
// street runs onto the end of a deck that hangs in the air, an approach is
// built back along that street, falling to the ground at an easy grade.
// Its line is the street's; its length, grade and width are assumed.
import { GRADE } from './road-level.js';

export const APPROACH = { grade: .07, steepest: .2, shortest: 15, longest: 150, highest: 12, step: 3, lift: .04 };
const nodeKey = point => `${Math.round(point[0] * 2)},${Math.round(point[1] * 2)}`;
const usable = road => road && road.kind !== 'tunnel' && Array.isArray(road.points) && road.points.length > 1;
const raised = road => road.kind === 'bridge' || Math.max(road.fromLevel ?? GRADE, road.toLevel ?? GRADE) > GRADE;

/**
 * The line a driver follows from a point of a road, on along that road and
 * then whichever street continues straightest from its end.
 * @returns {{points: number[][], roads: Set<string>}} at most `reach` metres of it
 */
function trace(road, index, start, direction, reach, nodes) {
  const points = [start], roads = new Set([road.id]);
  let length = 0, current = road, ahead = direction > 0 ? road.points.slice(index + 1) : road.points.slice(0, index + 1).reverse();
  for (;;) {
    for (const point of ahead) {
      const last = points.at(-1), span = Math.hypot(point[0] - last[0], point[1] - last[1]);
      if (span < .01) continue;
      if (length + span >= reach) {
        const t = (reach - length) / span;
        points.push([last[0] + (point[0] - last[0]) * t, last[1] + (point[1] - last[1]) * t]);
        return { points, roads };
      }
      points.push(point);length += span;
    }
    if (points.length < 2) return { points, roads };
    const end = points.at(-1), before = points.at(-2), hx = end[0] - before[0], hz = end[1] - before[1], heading = Math.hypot(hx, hz) || 1;
    let best = null, straightest = .5;
    for (const { road: other, last } of nodes.get(nodeKey(end)) || []) {
      if (other === current || roads.has(other.id)) continue;
      const next = last ? other.points.at(-2) : other.points[1], dx = next[0] - end[0], dz = next[1] - end[1], span = Math.hypot(dx, dz);
      if (span < .01) continue;
      const turn = (dx * hx + dz * hz) / (span * heading);
      if (turn > straightest) { straightest = turn; best = { other, last }; }
    }
    if (!best) return { points, roads };
    current = best.other;roads.add(current.id);
    ahead = best.last ? current.points.slice(0, -1).reverse() : current.points.slice(1);
  }
}

/** Points every `step` metres along a line, with the distance to each. */
function resample(points, step) {
  const out = [{ x: points[0][0], z: points[0][1], d: 0 }];
  let travelled = 0, due = step;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (due <= travelled + span) {
      const t = (due - travelled) / span;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, d: due });due += step;
    }
    travelled += span;
  }
  const end = points.at(-1);
  if (travelled - out.at(-1).d > step * .3) out.push({ x: end[0], z: end[1], d: travelled });
  return out;
}

/**
 * @param {object} context streets, the ground sampler, the surveyed decks over a point, and `finish` to make a deck of a mesh
 * @returns {object[]} decks in the form transport-surfaces.js prepares
 */
export function buildApproaches({ roads = [], groundAt = null, surfacesAt, finish }) {
  if (!groundAt || !roads.length) return [];
  const ground = (x, z) => { const g = groundAt(x, z); return Number.isFinite(g) ? g : NaN; };
  const nodes = new Map();
  for (const road of roads) {
    if (!usable(road)) continue;
    for (const last of [false, true]) {
      const key = nodeKey(last ? road.points.at(-1) : road.points[0]);
      let list = nodes.get(key); if (!list) nodes.set(key, list = []);
      list.push({ road, last });
    }
  }
  const built = [], portals = [];
  for (const road of roads) {
    if (!usable(road) || !raised(road)) continue;
    let before = null;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s <= span; s += 1) {
        const point = [a[0] + (b[0] - a[0]) * s / (span || 1), a[1] + (b[1] - a[1]) * s / (span || 1)];
        const here = { point, index: i - 1, decks: surfacesAt(point[0], point[1], 'drive') };
        if (before) {
          for (const deck of here.decks) if (!before.decks.some(other => other.triangle.id === deck.triangle.id)) portal(road, deck, here, before, -1);
          for (const deck of before.decks) if (!here.decks.some(other => other.triangle.id === deck.triangle.id)) portal(road, deck, before, here, 1);
        }
        before = here;
      }
    }
  }
  /** `inside` is on the deck and `outside` is the next point of the road, off it; `direction` leads off the deck along the road. */
  function portal(road, deck, inside, outside, direction) {
    const id = deck.triangle.id, top = deck.elevation, [ox, oz] = outside.point;
    if (outside.decks.some(other => Math.abs(other.elevation - top) < 1)) return;
    const drop = top - ground(ox, oz);
    if (!(drop > .3 && drop < APPROACH.highest)) return;
    if (portals.some(other => other.id === id && (other.x - ox) ** 2 + (other.z - oz) ** 2 < 16)) return;
    // A street that only passes beneath comes out the other side into the air
    // within the width of the deck. One that is carried by it stays over it,
    // give or take a centreline that strays past the surveyed edge.
    let height = top, over = 0, seen = 0;
    for (const p of resample(trace(road, inside.index, inside.point, -direction, 70, nodes).points, 1.5)) {
      const decks = surfacesAt(p.x, p.z, 'drive'), same = decks.find(found => found.triangle.id === id);
      seen++;
      if (same) { height = same.elevation; over++; continue; }
      if (decks.some(found => Math.abs(found.elevation - height) < 1.5)) { over = Infinity; break; }
    }
    if (over * 1.5 < Math.min(38, seen * 1.5 * .7)) return;
    const wanted = Math.max(APPROACH.shortest, Math.min(APPROACH.longest, drop / APPROACH.grade));
    const way = trace(road, outside.index, inside.point, direction, wanted, nodes), stations = resample(way.points, APPROACH.step), length = stations.at(-1).d;
    if (stations.length < 3 || drop / length > APPROACH.steepest) return;
    portals.push({ id, x: ox, z: oz });
    const half = Math.max(4, Math.min(14, road.width || 7)) / 2, base = ground(stations[0].x, stations[0].z), rise = top - (Number.isFinite(base) ? base : top - drop) - APPROACH.lift;
    const X = [], Z = [], Y = [], faces = [], rim = [];
    for (let k = 0; k < stations.length; k++) {
      const p = stations[k], from = stations[Math.max(0, k - 1)], to = stations[Math.min(stations.length - 1, k + 1)];
      const tx = to.x - from.x, tz = to.z - from.z, span = Math.hypot(tx, tz) || 1, t = p.d / length, ease = 1 - t * t * (3 - 2 * t);
      const g = ground(p.x, p.z), y = (Number.isFinite(g) ? g : top - drop) + APPROACH.lift + rise * ease;
      X.push(p.x - tz / span * half, p.x + tz / span * half);Z.push(p.z + tx / span * half, p.z - tx / span * half);Y.push(y, y);
      if (k) {
        const l = k * 2, r = l + 1;
        faces.push([l - 2, r - 2, r], [l - 2, r, l]);rim.push([l - 2, l], [r - 2, r]);
      }
    }
    rim.push([0, 1], [stations.length * 2 - 2, stations.length * 2 - 1]);
    const part = finish({ id: `approach:${id}:${road.id}`, sourceId: deck.triangle.sourceId, subtype: 'bridge', name: road.name || '', X, Z, Y, faces, rim });
    if (part) { part.approach = true;part.roads = way.roads;built.push(part); }
  }
  return built;
}
