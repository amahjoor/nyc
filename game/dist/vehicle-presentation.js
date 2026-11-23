const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const bodyHeights = {coupe:1.34, suv:1.76, minivan:1.78, pickup:1.84, van:2.12};
const approach = (value, target, rate, dt) => value + (target - value) * -Math.expm1(-rate * dt);

/** Visual suspension only. Measured contact heights and driving physics stay intact. */
export function updateRide(previous, car, dt) {
  const target = { x: finite(car.x), z: finite(car.z), height: finite(car.y), pitch: finite(car.pitch), roll: finite(car.roll) };
  const reset = !previous || Math.hypot(target.x-previous.x,target.z-previous.z)>20 || Math.abs(target.height-previous.height)>4;
  if (reset) return {...target, leanPitch:0, leanRoll:0, pitchRate:0, rollRate:0};
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

// Damped suspension about the sprung body's equilibrium under the current
// load. Carry angular velocity through an S-bend or a brake release.
export function updateBodyLean(ride, car, dt) {
  const seconds = clamp(finite(dt), 0, .25);
  if (!seconds) return;
  const height = car.identity?.asset?.design?.H ?? bodyHeights[car.shape || car.identity?.shape || car.type] ?? 1.48;
  const leverage = clamp((height / 1.48) ** 2, .72, 1.8);
  const frequency = 13 / Math.sqrt(leverage), decay = frequency * .68;
  const oscillation = Math.sqrt(frequency ** 2 - decay ** 2);
  const envelope = Math.exp(-decay * seconds), cosine = Math.cos(oscillation * seconds);
  const sine = Math.sin(oscillation * seconds) / oscillation;
  function spring(angle, rate, target) {
    const displacement = ride[angle] - target, velocity = ride[rate];
    ride[angle] = target + envelope * (displacement * cosine + (velocity + decay * displacement) * sine);
    ride[rate] = envelope * (velocity * cosine - (decay * velocity + frequency ** 2 * displacement) * sine);
  }
  const speed = finite(car.speed);
  const lateral = finite(car.lateralAcceleration, finite(car._steering) * speed ** 2 / 6);
  spring('leanRoll', 'rollRate', clamp(lateral * .0058 * leverage, -.105, .105));
  spring('leanPitch', 'pitchRate', clamp(-finite(car.longitudinalAcceleration) * .005 * leverage, -.08, .08));
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
