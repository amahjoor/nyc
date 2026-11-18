// How high a street runs. The city codes each end of a centreline with a
// level: 13 is the ground, and each step of four is one level up or down.
export const GRADE = 13;

/** Distance along a road's centreline to each of its points. */
export function measure(road) {
  const at = [0];
  for (let i = 1; i < road.points.length; i++) at.push(at[i - 1] + Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1]));
  return at;
}

/** How high a road runs at a point along it, in the city's level code (13 is the ground). */
export function roadLevelAt(road, x, z) {
  const from = Number.isFinite(road?.fromLevel) ? road.fromLevel : GRADE, to = Number.isFinite(road?.toLevel) ? road.toLevel : GRADE;
  if (from === to || !Array.isArray(road.points) || road.points.length < 2) return from;
  const at = road._measure ||= measure(road), total = at.at(-1);
  if (!(total > 0)) return from;
  let best = Infinity, along = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2)) : 0;
    const d = (a[0] + dx * t - x) ** 2 + (a[1] + dz * t - z) ** 2;
    if (d < best) { best = d; along = at[i - 1] + (at[i] - at[i - 1]) * t; }
  }
  return from + (to - from) * along / total;
}

/** Compare street actors at a crossing or collision. Flat street callers may omit height. */
export function trafficAtHeight(actor, height) {
  // A newly streamed traffic car has a route but no wheel heights until its first ground sample.
  if (actor._edge && !Number.isFinite(actor.y)) return false;
  return Math.abs((actor.y ?? 0) - (height ?? 0)) <= 2.5;
}
