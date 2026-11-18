// Seeing the city from the air.
//
// On the ground the game draws what is within a couple of kilometres and
// builds, around the player, everything a street needs: kerbs and lamps,
// people, shop fronts, the walls to walk into. From an aircraft that is the
// wrong way round. The eye reaches twenty kilometres, so the far city must be
// there, in the coarse form the survey already keeps for the all-boroughs
// view; nothing smaller than a building can be seen, so the street's own
// furniture need not be made; and the ground is covered so fast that what is
// built must be built ahead of the aircraft, not under it.
//
// The functions here say, for a height above the ground, what the rest of the
// game should do. Heights and distances are in metres.

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** How far the view has left the street: 0 at sixty metres up or less, 1 at three hundred or more. */
export const aloftness = height => clamp(((Number.isFinite(height) ? height : 0) - 60) / 240, 0, 1);

/**
 * What the building stream should hold for a view `height` above the ground:
 * `cut`, the distance beyond which a coarse tile is not drawn at all;
 * `refine`, the distance within which tiles are drawn in full detail;
 * `physics`, the distance within which the walls are made solid.
 */
export function streamRanges(height) {
  const up = aloftness(height);
  return {
    // On the street the far towers are hidden by the near ones and by haze. From the air the whole city is in view.
    cut: 2100 + up * up * 48000,
    // Full detail is for what is near enough to tell from the coarse form: under a high aircraft, less and less of it,
    // and from a kilometre up none, so that a jet does not ask for tiles it has passed before they arrive.
    refine: 850 * clamp((1000 - height) / 500, 0, 1),
    // Nothing is flown into above the tallest roof, and near the roofs only what is close by.
    physics: height > 650 ? 0 : height > 150 ? 350 : 850,
  };
}

/**
 * Where to build ahead of something moving: the point `seconds` further on
 * at its present velocity, no further than `reach`. Slower than a car on a
 * highway, it is where it is.
 */
export function leadPoint(position, velocity, { seconds = 3.5, reach = 700, slowest = 34 } = {}) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (!(speed > slowest)) return { x: position.x, z: position.z };
  const ahead = Math.min(reach, speed * seconds) / speed;
  return { x: position.x + velocity.x * ahead, z: position.z + velocity.z * ahead };
}

/**
 * Whether the view is high enough that the street's own furniture is not
 * made or drawn. It turns on at 250 metres and off again at 190, so that a
 * view hovering at the line does not flicker. `was` is the answer last time.
 */
export const aboveTheStreet = (height, was = false) => (Number.isFinite(height) ? height : 0) > (was ? 190 : 250);
