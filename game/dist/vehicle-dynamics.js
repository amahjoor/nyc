import { roadFigures, STANDARD_GRAVITY, MPS_PER_MPH, SIXTY_MPS } from './vehicle-performance.js';

// Road handling in metres and seconds, integrated at 120 Hz.
// Heading zero faces +Z; local +X is (cos(angle), -sin(angle)). Consequently
// D/right has a negative wheel angle and negative forward yaw rate.
const WHEELBASE = 2.65;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const towardZero = (value, amount) => Math.sign(value) * Math.max(0, Math.abs(value) - amount);
const blend = (rate, dt) => 1 - Math.exp(-rate * dt);
const smoothstep = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

export function commitVelocity(car) {
  const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  car.speed = car.velocityX * sin + car.velocityZ * cos;
  if (Math.abs(car.speed) < 1e-7) {
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
  car.tireScrub = 0;
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
  if (!(dt > 0)) return;
  const beforeX = car.velocityX, beforeZ = car.velocityZ;
  const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  let along = car.velocityX * sin + car.velocityZ * cos;
  const initialAlong = along;
  const across = car.velocityX * cos - car.velocityZ * sin;
  // A car may carry its own figures (garage.js); one that does not is a plain sedan.
  const figures = roadFigures(car.handling);
  const top = figures.topSpeed * MPS_PER_MPH;
  const brakeForce = figures.braking * STANDARD_GRAVITY;
  const gripForce = figures.grip * STANDARD_GRAVITY;
  // At corner entry, the contact patches already carrying side load have
  // less braking force available. Straight-line stops retain the road figure.
  const cornerLoad = Math.max(Math.abs(car.lateralAcceleration), Math.abs(along * car.yawRate));
  const lateralUse = clamp(cornerLoad / gripForce, 0, 1);
  const availableBrake = brakeForce * Math.sqrt(1 - .48 * lateralUse ** 2);
  // The measured chassis pitch is negative when its front axle is uphill.
  const grade = STANDARD_GRAVITY * Math.sin(car.pitch || 0);
  car._shiftHold = Math.max(0, car._shiftHold - dt);
  if (input.brake || input.handbrake) {
    // The handbrake locks the rear axle. Both brakes override throttle.
    along = towardZero(along + grade*dt, (input.brake ? availableBrake : 6.5) * dt);
    car._shiftHold = 0;
  } else if (along * input.forward < 0) {
    along = towardZero(along + grade*dt, availableBrake * Math.abs(input.forward) * dt);
    if (Math.abs(along) < .015) { along = 0; car._shiftHold = .12; }
  } else if (car._shiftHold) {
    along = 0;
  } else {
    // Net pull fades linearly with road speed. Integrating dv / pull from
    // zero to 60 fixes launch acceleration for this particular car's time.
    const fade = .97 / top;
    const launch = -Math.log1p(-fade * SIXTY_MPS) / (fade * figures.zeroToSixty);
    const pull = input.forward < 0 ? 5 : launch * (1 - fade * Math.max(0, along));
    const drag = .24 + .00048 * along * along;
    along += (input.forward * pull + grade) * dt;
    along = towardZero(along, (1 - Math.abs(input.forward)) * drag * dt);
  }
  along = clamp(along, -9, top);
  car.velocityX = sin * along + cos * across;
  car.velocityZ = cos * along - sin * across;

  const speed = Math.hypot(car.velocityX, car.velocityZ);
  const steeringLimit = .54 / (1 + Math.pow(speed / 12, 1.5));
  const targetSteering = -input.turn * steeringLimit;
  car._steering += (targetSteering - car._steering) * blend(input.turn ? 10 : 16, dt);
  car._handbrakeBlend += ((input.handbrake && !input.brake ? 1 : 0) - car._handbrakeBlend) * blend(input.handbrake ? 10 : 8, dt);
  const slide = car._handbrakeBlend * smoothstep((speed - 2) / 4);
  const axle = car.identity?.asset?.wheels;
  const wheelbase = axle && axle.front > axle.rear ? axle.front - axle.rear : WHEELBASE;
  const drive = car.identity?.performance?.drive;
  const frontWeight = drive === 'F' ? .60 : drive === 'R' ? .51 : .55;
  const frontArm = wheelbase * (1 - frontWeight), rearArm = wheelbase * frontWeight;
  // The contact patches move sideways at different speeds as the car yaws.
  // Resolve each axle's slip against its own grip and lever arm about the CG.
  const denominator = Math.max(3, Math.abs(along));
  const frontSlip = Math.atan2(across + frontArm * car.yawRate, denominator) - Math.sign(along) * car._steering;
  const rearSlip = Math.atan2(across - rearArm * car.yawRate, denominator);
  const traction = (along - initialAlong) / dt - grade;
  const frontLoad = clamp(frontWeight - traction * .48 / (STANDARD_GRAVITY * wheelbase), .28, .75);
  const braking = input.brake || input.forward * initialAlong < 0;
  const powerFront = drive === 'F' ? 1 : drive === 'R' ? 0 : .50;
  const frontShare = input.handbrake && !input.brake ? 0 : braking ? .65 : powerFront;
  const combinedGrip = (load, share) => {
    const use = Math.min(.96, Math.abs(traction) * share / (load * (braking ? brakeForce : gripForce)));
    return gripForce * load * Math.sqrt(1 - use * use);
  };
  const frontGrip = combinedGrip(frontLoad, frontShare);
  const rearGrip = combinedGrip(1 - frontLoad, 1 - frontShare) * (1 - .72 * slide);
  const frontForce = -frontGrip * Math.tanh(12 * frontSlip);
  const rearForce = -rearGrip * Math.tanh(15 * rearSlip);
  const roadSpeed = smoothstep((speed - 3) / 4);
  // Near walking pace and in reverse, blend in the parking-radius constraint.
  // A car sliding broadside still sheds lateral speed through its tires.
  const dynamic = smoothstep((along - 3) / 4);
  const parkingYaw = along * Math.tan(car._steering) / wheelbase;
  const parkingAccel = (parkingYaw - car.yawRate) * 9;
  const yawDamping = (1.2 + 2 * smoothstep((speed - 18) / 14)) * (1 - .8 * slide);
  const yawAccel = (frontArm * frontForce - rearArm * rearForce) / (.27 * wheelbase ** 2) - car.yawRate * yawDamping;
  car.yawRate += clamp(parkingAccel + dynamic * (yawAccel - parkingAccel), -5.5, 5.5) * dt;
  if (speed < .05) car.yawRate = 0;
  car.angle = (car.angle + car.yawRate * dt) % TAU;

  const nextSin = Math.sin(car.angle), nextCos = Math.cos(car.angle);
  const lateral = car.velocityX * nextCos - car.velocityZ * nextSin;
  const sideImpulse = (1 - roadSpeed) * -lateral + roadSpeed * (frontForce * Math.cos(car._steering) + rearForce) * dt;
  // A steered front tire pushes perpendicular to its wheel plane. The
  // backward component scrubs road speed in a hard corner.
  const scrubDrag = -Math.sin(car._steering) * frontForce * dynamic * dt;
  car.velocityX += nextCos * sideImpulse + nextSin * scrubDrag;
  car.velocityZ += -nextSin * sideImpulse + nextCos * scrubDrag;
  // Audible scrub starts around the shoulder of either axle's force curve.
  car.tireScrub = dynamic * smoothstep((Math.max(Math.abs(frontSlip), Math.abs(rearSlip)) - .065) / .21);
  commitVelocity(car);
  car.lateralAcceleration = ((car.velocityX - beforeX) * nextCos - (car.velocityZ - beforeZ) * nextSin) / dt;
  car.longitudinalAcceleration = ((car.velocityX - beforeX) * nextSin + (car.velocityZ - beforeZ) * nextCos) / dt;
}
