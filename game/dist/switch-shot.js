// The shot between two places.
//
// Whenever the player is put down somewhere new, the camera leaves the street
// the way a satellite picture would: straight up in three steps, each a fast
// pull back and a moment's pause, until the district is a pattern of blocks.
// It crosses to the new place at that height, then comes down by the same
// three steps and swings in behind the player. A short hop climbs only as far
// as it needs to see both ends.
//
// This module is only the camera: where it is, what it looks at and which way
// is up, as plain numbers. Nothing here loads or hides anything; the caller
// keeps the player still while `active` is true.

/** Metres above the ground at each step: a block, a neighbourhood, a borough's width. */
export const LEVELS = [150, 650, 2800];
const MOVE = .32, DWELL = .46, LAND = .75, JOIN = .5, FOV = 46, PATIENCE = 4;
// How far the camera drifts while it pauses, as a share of its height: the picture never quite stands still.
const DRIFT = .05;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
// Fast away, slow to settle: the pull of each step.
const snap = t => 1 - Math.pow(1 - clamp(t), 4);
const ease = t => { const c = clamp(t); return c * c * (3 - 2 * c); };
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const turn = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/** Looking straight down on a place from `height`, with its heading at the top of the picture. */
function above(place, height) {
  const y = place.y || 0;
  return { position: [place.x, y + height, place.z], target: [place.x, y, place.z], up: [Math.sin(place.angle || 0), 0, Math.cos(place.angle || 0)], fov: FOV, ...depth(height) };
}
// How near and how far the camera must see from a height: the ground below, and the horizon past it.
const depth = height => ({ near: Math.max(.3, height * .02), far: height * 5 + 7000 });
/** The view the game takes up behind a player who has just arrived. */
function behind(place) {
  const y = place.y || 0, a = place.angle || 0;
  return { position: [place.x - Math.sin(a) * 11, y + 6.5, place.z - Math.cos(a) * 11], target: [place.x, y + 1.3, place.z], up: [0, 1, 0], fov: 55, near: .3, far: 6500 };
}
function blend(a, b, t) {
  return { position: mix(a.position, b.position, t), target: mix(a.target, b.target, t), up: unit(mix(a.up, b.up, t)), fov: lerp(a.fov, b.fov, t), near: lerp(a.near, b.near, t), far: lerp(a.far, b.far, t) };
}

/** How many of the levels a journey of `distance` metres climbs: enough to see both ends at once. */
export const levelsFor = distance => distance < 300 ? 1 : distance < 2500 ? 2 : 3;

/**
 * @returns the shot. `depart(from, view)` starts the climb from a place `{x, y, z, angle}` the player
 *   is leaving, or with `from` null waits where the camera is (`view` is its `{position, target, up, fov, near, far}`);
 *   `arrive(to)` says where the player now stands; `update(dt, settled)` advances it and gives the camera for
 *   this frame, or null once the game's own camera should take over (`settled` false holds it over a place
 *   that is still loading); `cancel()` drops it.
 */
export function createSwitchShot() {
  let stage = null, clock = 0, from = null, to = null, view = null, step = 0, top = 0, waited = 0, pending = null, cross = 0, last = null;
  // `view` is the pose the current stage started from; `last` the pose most recently given.
  const next = name => { stage = name; clock = 0; };
  const shot = {
    get active() { return stage !== null; },
    /** Which stage it is in: 'rise', 'hold', 'cross', 'fall', 'land', or null. */
    get stage() { return stage; },
    /** How many steps up it is, 0 at street level. */
    get level() { return stage === 'rise' ? step + 1 : stage === 'hold' || stage === 'cross' ? top + 1 : stage === 'fall' ? step + 1 : 0; },
    depart(place, camera = null) {
      from = place ? { ...place } : null; view = camera && { near: .3, far: 9000, ...camera }; to = null; pending = null; waited = 0; step = 0;
      // Until the destination is known, a departure climbs all the way: it may be anywhere.
      top = LEVELS.length - 1;
      next(from ? 'rise' : 'hold');
    },
    arrive(place) {
      if (stage === null) return;
      pending = { ...place };
      if (from) top = Math.max(stage === 'rise' ? step : 0, levelsFor(Math.hypot(place.x - from.x, place.z - from.z)) - 1);
    },
    cancel() { stage = null; pending = null; },
    update(dt, settled = true) {
      if (stage === null) return null;
      clock += Math.max(0, dt);
      if (stage === 'rise') {
        // Each step: pull back fast, then hang there a moment, still drifting outward.
        const lower = step ? above(from, LEVELS[step - 1] * (1 + DRIFT)) : view || above(from, 12), span = (step ? MOVE : JOIN) + DWELL;
        const move = snap(clock / (step ? MOVE : JOIN)), drift = 1 + DRIFT * clamp((clock - (step ? MOVE : JOIN)) / DWELL);
        last = blend(lower, above(from, LEVELS[step] * drift), move);
        if (clock >= span) { if (step >= top) next('hold'); else { step++; clock = 0; } }
      } else if (stage === 'hold') {
        // Waiting on the place to load: over where we left, or wherever the camera already was.
        waited += dt;
        if (from) last = above(from, LEVELS[top] * (1 + DRIFT) * (1 + .01 * Math.min(waited, 8)));
        else last = view || last;
        if (pending) {
          to = pending; pending = null;
          // With no street left behind, the crossing is only the swing from wherever the camera was to over the new place.
          if (!from) { from = { ...to }; top = LEVELS.length - 1; cross = JOIN + .25; }
          else cross = clamp(Math.hypot(to.x - from.x, to.z - from.z) / 6000, .35, 1.3);
          view = last; next('cross');
        }
      } else if (stage === 'cross') {
        // Over to the new place at the top of the climb, turning to its heading on the way.
        const t = ease(clock / cross), place = { x: lerp(from.x, to.x, t), z: lerp(from.z, to.z, t), y: lerp(from.y || 0, to.y || 0, t), angle: turn(from.angle || 0, to.angle || 0, t) };
        last = view ? blend(view, above(place, LEVELS[top] * (1 + DRIFT)), ease(clock / Math.min(cross, JOIN + .25))) : above(place, LEVELS[top] * (1 + DRIFT));
        // It does not come down onto a place that is still arriving, though it will not wait for ever.
        if (clock >= cross + DWELL * .6 && (settled || clock >= cross + PATIENCE)) { step = top; view = last; next(top ? 'fall' : 'land'); }
      } else if (stage === 'fall') {
        // Down by the same steps, drifting inward as it hangs.
        const move = snap(clock / MOVE), drift = 1 - DRIFT * clamp((clock - MOVE) / DWELL);
        last = blend(above(to, LEVELS[step] * (1 + (step === top ? DRIFT : -DRIFT))), above(to, LEVELS[step - 1] * drift), move);
        if (clock >= MOVE + DWELL) { if (step === 1) { view = last; next('land'); } else { step--; clock = 0; } }
      } else if (stage === 'land') {
        // The last drop: from over the player's head round to the view behind them.
        last = blend(view, behind(to), ease(clock / LAND));
        if (clock >= LAND) { stage = null; return null; }
      }
      return last;
    },
  };
  return shot;
}
