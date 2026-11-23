// Keep the pattern and tuning attached to the unit when it leaves hearing range.
export function sirenProfile(id) {
  let hash = 2166136261;
  for (const ch of String(id)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  return {
    tuning: .976 + .048 * (hash & 255) / 255,
    cycle: 18 + ((hash >>> 8) & 15),
    phase: (hash >>> 16) / 65536,
    yelpSeconds: 4 + ((hash >>> 12) & 3),
  };
}

// Estimate solid metres on the direct path. A nearby side facade can also
// return a quieter copy along a longer path. All positions are world metres.
export function sirenPath(sim, ear, horn) {
  const path = { solid: 0, bounce: null };
  if (!sim.soundInsideBuilding) return path;
  const dx = horn.x - ear.x, dz = horn.z - ear.z, dy = horn.y - ear.y;
  const length = Math.hypot(dx, dz, dy), horizontal = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(length / 4));
  for (let i = 0; i < steps; i++) {
    const t = (i + .5) / steps;
    if (sim.soundInsideBuilding(ear.x + t * dx, ear.y + t * dy, ear.z + t * dz)) {
      path.solid += length / steps;
      if (path.solid > 32) break;
    }
  }
  if (path.solid || horizontal < 3) return path;
  const x = ear.x + dx / 2, z = ear.z + dz / 2, y = ear.y + dy / 2;
  for (let offset = 3; offset <= 30; offset += 3) {
    for (const side of [-1, 1]) {
      const wx = x + side * offset * dz / horizontal, wz = z - side * offset * dx / horizontal;
      if (!sim.soundInsideBuilding(wx, y, wz)) continue;
      const extra = Math.hypot(length, 2 * offset) - length;
      path.bounce = { x: wx, y, z: wz, delay: Math.max(.002, extra / 343), level: .26 * length / (length + extra) };
      return path;
    }
  }
  return path;
}
