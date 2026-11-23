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
//
// It does not come down on a place that is still being built. The caller says
// each frame whether the new place is `settled`: everything the descent will
// show has loaded and frames are running freely. Until then the shot idles
// where it is, barely moving, and only then crosses and descends, so the way
// down is a clean run through a finished picture.

/** Metres above the ground at each step: a block, a neighbourhood, a borough's width. */
export const LEVELS = [150, 650, 2800];
const MOVE = .32, DWELL = .46, LAND = .75, JOIN = .5, FOV = 46;
/** The shot's field of view while it looks straight down, in degrees, and how far it drifts as it hangs, as a share of its height. */
export const SHOT_FOV = FOV;
// How long it will idle for a place that is not settled before it goes anyway, in seconds: first where it
// waits for the place to arrive, then again over the place itself. A place that never settles is not a trap.
const PATIENCE = 14, LINGER = 5;
// How long a climb hangs on a step for the picture of the next one up to arrive, in seconds.
const CLIMB_WAIT = 2.5;
// How far the camera drifts while it pauses, as a share of its height: the picture never quite stands still.
export const DRIFT = .05;

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
/** How high the camera hangs at the top of a shot that climbs `levels` of them, in metres. */
export const ceilingFor = levels => LEVELS[Math.min(LEVELS.length, Math.max(1, levels)) - 1] * (1 + DRIFT);
/**
 * How far from the point below it a camera looking straight down from `height` can see, in metres,
 * to the corners of a picture `aspect` times as wide as it is tall: the ground to have ready under it.
 */
export const groundReach = (height, aspect = 16 / 9) => Math.max(0, height) * Math.tan(FOV * Math.PI / 360) * Math.hypot(1, aspect);
// A held picture creeping forward: `view.creep` metres in all, most of it in the first few seconds.
function creeping(view, waited) {
  if (!view?.creep) return view;
  const way = unit([view.target[0] - view.position[0], view.target[1] - view.position[1], view.target[2] - view.position[2]]), d = view.creep * (1 - Math.exp(-waited / 4));
  return { ...view, position: view.position.map((v, i) => v + way[i] * d), target: view.target.map((v, i) => v + way[i] * d) };
}

/**
 * @returns the shot. `depart(from, view, toward)` starts the climb from a place `{x, y, z, angle}` the player
 *   is leaving, or with `from` null waits where the camera is (`view` is its `{position, target, up, fov, near, far}`,
 *   and `view.creep` a number of metres for the held picture to ease forward while it waits). `toward`, if the
 *   destination is already known, is `{x, z}`: the climb then stops at the height that journey needs.
 *   `arrive(to)` says where the player now stands; `update(dt, settled, climb)` advances it and gives the camera for
 *   this frame, or null once the game's own camera should take over (`settled` false makes it idle rather than
 *   cross to, or come down on, a place that is still being built; `climb` false makes a climb hang on its step
 *   a little longer, for a higher picture that has not arrived); `cancel()` drops it.
 */
export function createSwitchShot() {
  let stage = null, clock = 0, from = null, to = null, view = null, step = 0, top = 0, waited = 0, pending = null, cross = 0, last = null, arrived = 0;
  // `view` is the pose the current stage started from; `last` the pose most recently given.
  const next = name => { stage = name; clock = 0; };
  const shot = {
    get active() { return stage !== null; },
    /** Which stage it is in: 'rise', 'hold', 'cross', 'fall', 'land', or null. */
    get stage() { return stage; },
    /** How many steps up it is, 0 at street level. */
    get level() { return stage === 'rise' ? step + 1 : stage === 'hold' || stage === 'cross' ? top + 1 : stage === 'fall' ? step + 1 : 0; },
    /** The height of the step a climb will pull back to next, in metres: 0 when it is not climbing, or is on its last step. */
    get climbingTo() { return stage === 'rise' && step < top ? LEVELS[step + 1] * (1 + DRIFT) : 0; },
    /** How high it hangs at the top of this journey, in metres: all the way up until the destination is known. */
    get ceiling() { return LEVELS[top] * (1 + DRIFT); },
    /** The place on the ground the picture is of, `{x, z}`: where to show the ground at its best. Null when unknown. */
    get over() { const place = stage === 'rise' || stage === 'hold' ? from || pending : to; return place ? { x: place.x, z: place.z } : null; },
    /** The places, `{x, z}`, that should stand in full detail for it: the one it is leaving while that is in the picture, and the one it is coming to. */
    get places() {
      const list = stage === 'rise' ? [from] : stage === 'hold' ? [from, pending] : stage === 'cross' ? [from, to] : stage === null ? [] : [to];
      return list.filter(Boolean).map(place => ({ x: place.x, z: place.z }));
    },
    depart(place, camera = null, toward = null) {
      from = place ? { ...place } : null; view = camera && { near: .3, far: 9000, ...camera }; to = null; pending = null; waited = 0; step = 0; arrived = 0;
      // Until the destination is known, a departure climbs all the way: it may be anywhere.
      top = from && toward ? levelsFor(Math.hypot(toward.x - from.x, toward.z - from.z)) - 1 : LEVELS.length - 1;
      next(from ? 'rise' : 'hold');
    },
    arrive(place) {
      if (stage === null) return;
      pending = { ...place }; arrived = 0;
      if (from) top = Math.max(stage === 'rise' ? step : 0, levelsFor(Math.hypot(place.x - from.x, place.z - from.z)) - 1);
    },
    cancel() { stage = null; pending = null; },
    update(dt, settled = true, climb = true) {
      if (stage === null) return null;
      clock += Math.max(0, dt);
      if (stage === 'rise') {
        // Each step: pull back fast, then hang there a moment, still drifting outward.
        const lower = step ? above(from, LEVELS[step - 1] * (1 + DRIFT)) : view || above(from, 12), span = (step ? MOVE : JOIN) + DWELL;
        const move = snap(clock / (step ? MOVE : JOIN)), drift = 1 + DRIFT * clamp((clock - (step ? MOVE : JOIN)) / DWELL);
        last = blend(lower, above(from, LEVELS[step] * drift), move);
        // It does not pull back onto a picture that has not arrived (`climb` false), though it will not hang there long.
        if (clock >= span) { if (step >= top) next('hold'); else if (climb || clock >= span + CLIMB_WAIT) { step++; clock = 0; } }
      } else if (stage === 'hold') {
        // Waiting on the place to load: over where we left, or wherever the camera already was.
        waited += dt;
        if (from) last = above(from, LEVELS[top] * (1 + DRIFT) * (1 + .01 * Math.min(waited, 8)));
        else last = creeping(view, waited) || last;
        // The player has been put down, and the new place is being built around them: idle here until it is done.
        if (pending) arrived += dt;
        if (pending && (settled || arrived >= PATIENCE)) {
          to = pending; pending = null;
          // With no street left behind, the crossing is only the swing from wherever the camera was to over the new place.
          if (!from) { from = { ...to }; top = LEVELS.length - 1; cross = JOIN + .25; }
          else cross = clamp(Math.hypot(to.x - from.x, to.z - from.z) / 6000, .35, 1.3);
          view = last; next('cross');
        }
      } else if (stage === 'cross') {
        // Over to the new place at the top of the climb, turning to its heading on the way.
        const t = ease(clock / cross), place = { x: lerp(from.x, to.x, t), z: lerp(from.z, to.z, t), y: lerp(from.y || 0, to.y || 0, t), angle: turn(from.angle || 0, to.angle || 0, t) };
        // Once over the place it sinks a very little while it hangs there: an idle picture, not a frozen one.
        const hang = LEVELS[top] * (1 + DRIFT) * (1 - .004 * clamp(clock - cross, 0, LINGER + DWELL));
        last = view ? blend(view, above(place, hang), ease(clock / Math.min(cross, JOIN + .25))) : above(place, hang);
        // It does not come down onto a place that is still arriving, though it will not wait for ever.
        if (clock >= cross + DWELL * .6 && (settled || clock >= cross + DWELL * .6 + LINGER)) { step = top; view = last; next(top ? 'fall' : 'land'); }
      } else if (stage === 'fall') {
        // Down by the same steps, drifting inward as it hangs.
        const move = snap(clock / MOVE), drift = 1 - DRIFT * clamp((clock - MOVE) / DWELL);
        // The first step leaves from wherever the wait over the place left the camera.
        last = blend(step === top ? view : above(to, LEVELS[step] * (1 - DRIFT)), above(to, LEVELS[step - 1] * drift), move);
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
