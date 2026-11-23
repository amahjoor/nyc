// How much of the survey's detail a picture needs.
//
// The city's buildings come in six levels. The finest is the survey itself;
// each one above it covers more ground in fewer triangles by collapsing
// buildings together, so that a block seen from close by in a coarse level is
// a heap of shards. The survey says, for every tile, how large it may be
// drawn before it should give way to the finer tiles beneath it.
//
// On the street that question is settled by distance (aloft.js): what is near
// is fine, the far skyline is coarse and half hidden. Looking down from above
// nothing is hidden, so there the picture decides: a tile that is in the
// picture and drawn larger than its level allows is replaced by its children,
// whatever the height. The map of the whole city then needs only the coarsest
// level, a neighbourhood from a few kilometres up a middle one, and only what
// is close under the camera the survey in full.
//
// Nothing here knows about a renderer. Distances are in metres, sizes on the
// screen in pixels.

import { aloftness } from './aloft.js';

/**
 * How much larger than the survey's own limit a tile may be drawn before it gives way, from high above.
 * Below one because the survey's limit is where a tile starts to look wrong, and a held picture is looked at.
 */
export const TOLERANCE = .7;
// The picture is taken to be this tall at least and at most, so that a small window does not coarsen the city nor a large one flood it.
const SHORTEST = 720, TALLEST = 1200;
// How far past the edge of the picture counts as in it: the camera drifts while it hangs.
const MARGIN = 1.15;

/**
 * What a camera sees of the ground. `elements` are the sixteen numbers of its world matrix (column by column,
 * as three.js keeps them), `fov` its vertical field of view in degrees and `aspect` its width over its height;
 * `ground` is the height of the ground under it.
 * @returns `{eye: {x, z, height}, over: {x, z}, reach}`: where the camera is and how high above the ground,
 *   the point on the ground at the centre of the picture, and how far from that point the picture's corners
 *   fall. `reach` is Infinity, and `over` the point below the camera, when any of the picture is sky.
 */
export function groundPicture(elements, fov, aspect, ground = 0) {
  const e = elements, eye = { x: e[12], z: e[14], height: Math.max(0, e[13] - ground) };
  const tan = Math.tan(fov * Math.PI / 360);
  // A ray through the picture at (u, v), each from -1 to 1, followed down to the ground.
  const hit = (u, v) => {
    const x = u * tan * aspect, y = v * tan;
    const dy = e[1] * x + e[5] * y - e[9];
    if (!(dy < -1e-4) || !eye.height) return null;
    const t = eye.height / -dy;
    return { x: eye.x + (e[0] * x + e[4] * y - e[8]) * t, z: eye.z + (e[2] * x + e[6] * y - e[10]) * t };
  };
  const centre = hit(0, 0), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => hit(u, v));
  if (!centre || corners.some(corner => !corner)) return { eye, over: { x: eye.x, z: eye.z }, reach: Infinity };
  return { eye, over: centre, reach: Math.max(...corners.map(corner => Math.hypot(corner.x - centre.x, corner.z - centre.z))) };
}

/**
 * The view to choose the survey's levels for: `groundPicture` and what goes with it.
 * `viewport` is the height of the picture in pixels. `only`, when true, says that nothing outside the
 * picture matters at all (a camera that will not turn): tiles out there are then not drawn.
 * @returns the view for looksCoarse, or null on the street, where distance decides.
 */
export function detailView(elements, fov, aspect, ground = 0, viewport = 900, only = false) {
  const picture = groundPicture(elements, fov, aspect, ground), up = aloftness(picture.eye.height);
  if (!(up > 0)) return null;
  const pixels = Math.min(TALLEST, Math.max(SHORTEST, viewport || 0));
  return { ...picture, reach: picture.reach * MARGIN, focal: pixels / (2 * Math.tan(fov * Math.PI / 360)),
    // Just above the roofs the street's own rule still does most of the work; from three hundred metres the picture rules.
    tolerance: TOLERANCE / up, only: Boolean(only) && Number.isFinite(picture.reach) };
}

/** A view straight down on `place` (`{x, z}`) from `height` metres, as detailView gives it: the picture a descending camera will have. */
export function viewFromAbove(place, height, fov, aspect, viewport = 900, only = true) {
  // Looking down the y axis with the top of the picture to the north.
  return detailView([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, place.x, height, place.z, 1], fov, aspect, 0, viewport, only);
}

/** Whether a tile of the survey `{x, z, radius}` is in the picture at all. */
export const inPicture = (node, view) => Math.hypot(node.x - view.over.x, node.z - view.over.z) - node.radius < view.reach;

/**
 * Whether a tile is drawn too large in this view for the level it is: it is in the picture, and the ground it
 * covers on the screen is larger than its `lodThreshold` (an area in square pixels, the survey's own) allows.
 * A tile without a limit is never too coarse.
 */
export function looksCoarse(node, view) {
  if (!(node.lodThreshold > 0) || !inPicture(node, view)) return false;
  const distance = Math.max(1, Math.hypot(node.x - view.eye.x, node.z - view.eye.z, view.eye.height)), diameter = 2 * node.radius * view.focal / distance;
  // Ground seen at a slant is squeezed in the picture by as much as it is off the vertical: the far side of a tilted
  // map shows a tile in a fraction of the pixels the same tile takes straight below.
  const slant = Math.min(1, view.eye.height / distance);
  return Math.PI / 4 * diameter * diameter * slant > node.lodThreshold * view.tolerance * view.tolerance;
}
