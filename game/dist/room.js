// Moving about a room laid out by interiors.js: no drawing here, so the simulation can use it.

/** The width of a room's door, in metres. */
export const DOOR = 1.1;
export const CEILING = 3.1;

/** Where a point of the room is in the world: (a, b) to [x, z]. */
export const roomPoint = (room, a, b) => [room.x + room.tx * (a + (room.skew || 0) * b) - room.nx * b, room.z + room.tz * (a + (room.skew || 0) * b) - room.nz * b];

/**
 * Move someone of `radius` about the room: from (a, b) by (da, db), kept
 * within the walls and out of the furniture. `out` is true when they have
 * walked out through the door.
 */
export function walkRoom(room, a, b, da, db, radius = .35) {
  let na = a + da, nb = b + db;
  if (nb < radius && Math.abs(na) < DOOR / 2 && db < 0) return { a: na, b: nb, out: nb < .05 };
  const half = room.width / 2 - radius;
  na = Math.max(-half, Math.min(half, na)); nb = Math.max(radius, Math.min(room.depth - radius, nb));
  for (let pass = 0; pass < 2; pass++) for (const thing of room.things) {
    if (!thing.solid) continue;
    const pa = thing.w / 2 + radius - Math.abs(na - thing.a), pb = thing.d / 2 + radius - Math.abs(nb - thing.b);
    if (pa <= 0 || pb <= 0) continue;
    // Out by the shorter way.
    if (pa < pb) na += Math.sign(na - thing.a || 1) * pa; else nb += Math.sign(nb - thing.b || 1) * pb;
  }
  return { a: na, b: nb, out: false };
}

export function roomLocal(room, x, z) {
  const dx = x - room.x, dz = z - room.z;
  const b = -dx * room.nx - dz * room.nz;
  return { a: dx * room.tx + dz * room.tz - (room.skew || 0) * b, b };
}
