// The flight between two places on the spawn picker's map.
//
// Choosing a place used to cut the map straight to it. Now the view travels:
// it pulls back until both places are in the picture, crosses, and comes in
// on the new one, in a single movement. A nearby place is a short slide; one
// in another borough rises high enough on the way to show where it is going.
//
// The path is the one van Wijk and Nuij worked out for a map that pans and
// zooms at once ("Smooth and efficient zooming and panning", 2003): of all
// the ways from one view to another it is the one that looks shortest to
// somebody watching. A view here is a point on the ground and the width of
// ground it shows, in metres. Nothing in this module knows about a camera.

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
// Away gently and in gently: the flight has no sudden start or stop.
const ease = t => { const c = clamp(t); return c * c * c * (c * (c * 6 - 15) + 10); };
// How readily the path trades distance for height. The square root of two is the paper's own choice.
const RHO = Math.SQRT2, RHO2 = RHO * RHO, RHO4 = RHO2 * RHO2;
/** The shortest and the longest a flight lasts, in seconds. */
export const SECONDS = [.9, 2.8];

/**
 * The way from one view to another. `from` and `to` are `{x, z, width}`.
 * @returns `{seconds, at(t)}`: how long it should take, and the view `{x, z, width}` a share `t` (0 to 1) of the way along.
 */
export function flightPath(from, to) {
  const w0 = Math.max(1, from.width), w1 = Math.max(1, to.width), dx = to.x - from.x, dz = to.z - from.z, d2 = dx * dx + dz * dz;
  let length, at;
  if (d2 < 1e-6) {
    // The same spot: only the width changes.
    length = Math.abs(Math.log(w1 / w0)) / RHO;
    at = t => ({ x: from.x + dx * t, z: from.z + dz * t, width: w0 * Math.pow(w1 / w0, t) });
  } else {
    const d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1), b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    length = (r1 - r0) / RHO;
    const cosh0 = Math.cosh(r0), sinh0 = Math.sinh(r0);
    at = t => {
      if (t >= 1) return { x: to.x, z: to.z, width: w1 };
      const s = t * length, u = w0 / (RHO2 * d1) * (cosh0 * Math.tanh(RHO * s + r0) - sinh0);
      return { x: from.x + u * dx, z: from.z + u * dz, width: w0 * cosh0 / Math.cosh(RHO * s + r0) };
    };
  }
  return { seconds: clamp(length, SECONDS[0], SECONDS[1]), at };
}

/**
 * @returns the picker's flight. `start(from, to)` sets off; `update(dt)` gives the view for this frame,
 *   or null when there is no flight (the last frame of one gives the destination exactly); `cancel()`
 *   leaves the view wherever it has got to.
 */
export function createPickerFlight() {
  let path = null, clock = 0;
  return {
    get active() { return path !== null; },
    start(from, to) { path = flightPath(from, to); clock = 0; },
    cancel() { path = null; },
    update(dt) {
      if (!path) return null;
      clock += Math.max(0, dt);
      const t = clock / path.seconds, view = path.at(ease(t));
      if (t >= 1) path = null;
      return view;
    },
  };
}
