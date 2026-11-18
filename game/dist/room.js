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

// Segment against the footprint of a room fixture, optionally widened for a walking body.
export function crossesFixture(at, to, fixture, padding = 0) {
  let low = 0, high = 1;
  for (const [axis, size] of [['a', 'w'], ['b', 'd']]) {
    const delta = to[axis] - at[axis], offset = fixture[axis] - at[axis], half = fixture[size] / 2 + padding;
    if (Math.abs(delta) < .00001) {
      if (Math.abs(offset) > half) return false;
    } else {
      const u = (offset - half) / delta, v = (offset + half) / delta;
      low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v));
    }
  }
  return low <= high;
}

// A two-way hinge with a damped closer. Resolve disk contact against the
// swinging leaf by turning it around the hinge, preserving the walker's step.
export class ShopDoor {
  angle = 0;
  velocity = 0;
  step(dt) {
    for (let remaining = Math.min(dt, .12); remaining > 0; remaining -= 1 / 120) {
      const h = Math.min(remaining, 1 / 120);
      this.velocity += (-8 * this.angle - 3.8 * this.velocity) * h;
      this.angle += this.velocity * h;
      if (Math.abs(this.angle) > 1.65) {
        this.angle = Math.sign(this.angle) * 1.65;
        this.velocity *= -.18;
      }
    }
  }
  push(a, b, nextA, nextB, radius, dt) {
    const x = nextA + DOOR / 2, r = Math.hypot(x, nextB);
    if (r > DOOR + radius || x <= 0 || !dt) return;
    const sin = Math.sin(this.angle), cos = Math.cos(this.angle);
    const along = x * cos + nextB * sin;
    if (along < 0 || along > DOOR + radius) return;
    const before = b * cos - (a + DOOR / 2) * sin;
    const side = Math.sign(before) || -Math.sign(nextB - b) || 1;
    const clearance = side * (nextB * cos - x * sin);
    if (clearance >= radius) return;
    const contact = Math.atan2(nextB, x) - side * Math.asin(Math.min(.99, radius / Math.max(radius, r)));
    const angle = Math.max(-1.65, Math.min(1.65, contact));
    const change = angle - this.angle;
    if (change * side >= 0) return;
    this.angle = angle;
    const impulse = Math.min(4, Math.abs(change) / dt);
    this.velocity = -side * Math.max(-side * this.velocity, impulse);
  }
}
