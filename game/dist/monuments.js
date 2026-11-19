// Surveyed structures with local landmark meshes. The tile decoder keeps their
// footprint colliders and suppresses the corresponding building triangles.
export const MONUMENTS = [
  { id: 'statue-of-liberty', name: 'Statue of Liberty', x: -3627.21, z: 3809.21, reach: 30, replaces: ['339279', '339282'] },
];
const REPLACED = new Set(MONUMENTS.flatMap(monument => monument.replaces || []));

/** Whether a surveyed mass is drawn by a monument's own model and so is left out of the buildings. */
export const replacedByMonument = featureId => REPLACED.has(String(featureId));

/** The monument whose surveyed mass is centred at (x, z), if any. */
export function monumentAt(x, z) {
  for (const monument of MONUMENTS) if (Math.hypot(x - monument.x, z - monument.z) < monument.reach) return monument;
  return null;
}
