const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const approach = (value, target, rate, dt) => value + (target - value) * -Math.expm1(-rate * dt);

/** Visual suspension only. Measured contact heights and driving physics stay intact. */
export function updateRide(previous, car, dt) {
  const target = { x: finite(car.x), z: finite(car.z), height: finite(car.y), pitch: finite(car.pitch), roll: finite(car.roll) };
  const reset = !previous || Math.hypot(target.x-previous.x,target.z-previous.z)>20 || Math.abs(target.height-previous.height)>4;
  if (reset) return {...target, leanPitch:0, leanRoll:0};
  const seconds=clamp(finite(dt),0,.25);
  if (!seconds) return previous;
  // Short, bounded travel absorbs sharp DEM facet changes without letting the
  // body float far above the tires or cut deeply into a rising road surface.
  previous.height=clamp(approach(previous.height,target.height,14,seconds),target.height-.18,target.height+.18);
  previous.pitch=clamp(approach(previous.pitch,target.pitch,10,seconds),target.pitch-.14,target.pitch+.14);
  previous.roll=clamp(approach(previous.roll,target.roll,10,seconds),target.roll-.14,target.roll+.14);
  previous.x=target.x;previous.z=target.z;
  return previous;
}

/** One vertical anchor for the camera eye and aim prevents terrain-induced nodding. */
export function updateChaseHeight(previous, point, dt, key) {
  const target=finite(point.y), x=finite(point.x), z=finite(point.z);
  if (!previous || previous.key!==key || Math.hypot(x-previous.x,z-previous.z)>20 || Math.abs(target-previous.height)>4)
    return {x,z,height:target,key};
  const seconds=clamp(finite(dt),0,.25);
  previous.height=approach(previous.height,target,10,seconds);previous.x=x;previous.z=z;
  return previous;
}
