// Structures the building survey measures that are not buildings.
//
// The survey gives every mass a footprint and a height, and the facade
// shader dresses every mass as a New York building: brick, bays of windows,
// a shop on the ground floor. Fort Wood and the pedestal of the Statue of
// Liberty are one such mass, forty-three metres of granite, and were drawn
// as an apartment house. A mass listed here is faced in plain stone instead.
//
// This module is read by the tile decoder's workers as well as the page, so
// it holds nothing but the list.

export const MONUMENTS = [
  // The middle of the fort and pedestal's surveyed outline (feature 339279), and how far the test reaches from it.
  // The survey's own mass for the statue (339282) is a 47 m prism; liberty.js draws her instead.
  { id: 'statue-of-liberty', name: 'Statue of Liberty', x: -3627.21, z: 3809.21, reach: 30, replaces: ['339282'] },
];
const REPLACED = new Set(MONUMENTS.flatMap(monument => monument.replaces || []));

/** Whether a surveyed mass is drawn by a monument's own model and so is left out of the buildings. */
export const replacedByMonument = featureId => REPLACED.has(String(featureId));

/** The monument whose surveyed mass is centred at (x, z), if any. */
export function monumentAt(x, z) {
  for (const monument of MONUMENTS) if (Math.hypot(x - monument.x, z - monument.z) < monument.reach) return monument;
  return null;
}
