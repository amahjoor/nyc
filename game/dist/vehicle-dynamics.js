// Flat-road arcade handling in metres and seconds, integrated at 120 Hz.
// Heading zero faces +Z; local +X is (cos(angle), -sin(angle)). Consequently
// D/right has a negative wheel angle and negative forward yaw rate.
const WHEELBASE = 2.65;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const towardZero = (value, amount) => Math.sign(value) * Math.max(0, Math.abs(value) - amount);
const blend = (rate, dt) => 1 - Math.exp(-rate * dt);
const smoothstep = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

function commitVelocity(car) {
  const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  car.speed = car.velocityX * sin + car.velocityZ * cos;
  if (Math.abs(car.speed) < .015) {
    car.velocityX -= sin * car.speed;
    car.velocityZ -= cos * car.speed;
    car.speed = 0;
  }
  const lateral = car.velocityX * cos - car.velocityZ * sin;
  car.slipAngle = Math.atan2(lateral, Math.max(.1, Math.abs(car.speed)));
  car._dynamicsSpeed = car.speed;
  car._dynamicsAngle = car.angle;
}

export function resetVehicleDynamics(car, speed = 0) {
  car.velocityX = Math.sin(car.angle) * speed;
  car.velocityZ = Math.cos(car.angle) * speed;
  car.yawRate = 0;
  car.lateralAcceleration = 0;
  car.longitudinalAcceleration = 0;
  car.slipAngle = 0;
  car._steering = 0;
  car._shiftHold = 0;
  car._handbrakeBlend = 0;
  commitVelocity(car);
}

// The public signed speed remains an authoritative setter for recovery, tests
// and kinematic traffic. Independent velocity changes remain valid when that
// scalar and the heading have not changed since our last completed step.
export function vehicleTravelSpeed(car) {
  if (car.speed !== car._dynamicsSpeed || car.angle !== car._dynamicsAngle) return Math.abs(car.speed);
  return Math.hypot(car.velocityX, car.velocityZ);
}

export function stopVehicleRotation(car, velocityX = 0, velocityZ = 0) {
  resetVehicleDynamics(car);
  car.velocityX = velocityX;
  car.velocityZ = velocityZ;
  commitVelocity(car);
}

export function stepVehicleDynamics(car, input, dt) {
  if (car.speed !== car._dynamicsSpeed || car.angle !== car._dynamicsAngle ||
      !Number.isFinite(car.velocityX) || !Number.isFinite(car.velocityZ)) resetVehicleDynamics(car, car.speed);
  const beforeX = car.velocityX, beforeZ = car.velocityZ;
  const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  let along = car.velocityX * sin + car.velocityZ * cos;
  const across = car.velocityX * cos - car.velocityZ * sin;
  car._shiftHold = Math.max(0, car._shiftHold - dt);
  if (input.brake || input.handbrake) {
    // Both brakes override throttle. Only the handbrake releases lateral grip.
    along = towardZero(along, (input.brake ? 25 : 6.5) * dt);
    car._shiftHold = 0;
  } else if (along * input.forward < 0) {
    along = towardZero(along, 22 * Math.abs(input.forward) * dt);
    if (Math.abs(along) < .015) { along = 0; car._shiftHold = .12; }
  } else if (car._shiftHold) {
    along = 0;
  } else {
    along += input.forward * (input.forward < 0 ? 8 : 11.5) * dt;
    // Rolling resistance plus mild speed-dependent drag allows the driver to
    // coast into a corner without the old abrupt off-throttle speed loss.
    along = towardZero(along, (.55 + .015 * Math.abs(along) + .002 * along * along) * dt);
  }
  along = clamp(along, -9, 30);
  if (Math.abs(along) < .015) along = 0;
  car.velocityX = sin * along + cos * across;
  car.velocityZ = cos * along - sin * across;

  const speed = Math.hypot(car.velocityX, car.velocityZ);
  const steeringLimit = .54 / (1 + Math.pow(speed / 12, 1.5));
  const targetSteering = -input.turn * steeringLimit;
  car._steering += (targetSteering - car._steering) * blend(input.turn ? 10 : 16, dt);
  car._handbrakeBlend += ((input.handbrake && !input.brake ? 1 : 0) - car._handbrakeBlend) * blend(input.handbrake ? 10 : 8, dt);
  const slide = car._handbrakeBlend * smoothstep((speed - 2) / 4);
  const yawLimit = Math.min(1.65, 12 / Math.max(1, speed));
  const targetYaw = clamp(along / WHEELBASE * Math.tan(car._steering) * (1 + .4 * slide), -yawLimit, yawLimit);
  // Steering sets a desired turn, not an instantaneous heading change. This
  // bounded yaw response carries a little momentum through countersteering.
  car.yawRate += clamp((targetYaw - car.yawRate) * blend(7, dt), -5.5 * dt, 5.5 * dt);
  if (speed < .05) car.yawRate = 0;
  car.angle = (car.angle + car.yawRate * dt) % TAU;

  const nextSin = Math.sin(car.angle), nextCos = Math.cos(car.angle);
  const lateral = car.velocityX * nextCos - car.velocityZ * nextSin;
  const lowSpeed = 1 - smoothstep((speed - 1.5) / 3.5);
  const gripResponse = 14 + (2 - 14) * slide;
  const gripAcceleration = 12.5 + (3.8 - 12.5) * slide;
  const tireCorrection = clamp(-lateral * blend(gripResponse, dt), -gripAcceleration * dt, gripAcceleration * dt);
  // Near a standstill, blend into the stable bicycle constraint. At road speed
  // the bounded grip correction preserves actual sideways momentum instead.
  const correction = tireCorrection + (-lateral - tireCorrection) * lowSpeed;
  car.velocityX += nextCos * correction;
  car.velocityZ -= nextSin * correction;
  commitVelocity(car);
  car.lateralAcceleration = ((car.velocityX - beforeX) * nextCos - (car.velocityZ - beforeZ) * nextSin) / dt;
  car.longitudinalAcceleration = ((car.velocityX - beforeX) * nextSin + (car.velocityZ - beforeZ) * nextCos) / dt;
}
