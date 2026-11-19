// Local +X is the driver's side and +Z is the nose.
export const PANEL = { left: 1, right: 2, front: 4, rear: 8 };
export const doorPanel = side => side > 0 ? PANEL.left : PANEL.right;
export const carCondition = car => car.damage > 0 ? Math.min(99, Math.round(100 * (1 - car.damage))) : 100;

export function hasDriver(car) {
  return !car.destroyed && Boolean(car.controlled || car.errand?.phase === 'boarded' || (!car._crewOut && !car._abandoned && !car._driven && !car.driverEjected &&
    (car.hired || car.evacuating || car._jacked || (!car._kerb && !car.parked && car._edge))));
}

// For two moving bodies the normal change in velocity is proportional to
// the other body's share of the combined mass. Equal masses retain the
// reference impact calibration; a wall uses the full closing speed directly.
export function collisionLoad(car, other) {
  const kg = car.identity?.performance?.kg || 1650, otherKg = other.identity?.performance?.kg || 1650;
  return 2*otherKg/(kg+otherKg);
}

export function repairVehicle(car) {
  Object.assign(car, { damage: 0, dents: null, brokenGlass: 0, missingDoors: 0, doorOpen: 0,
    doorHold: 0, evacuating: false, burningSince: null, destroyed: false, _wrecked: false, struckAt: null, explodedAt: null });
}

export function impactVehicle(car, speed, nx, nz, time) {
  // The contact normal points out of the obstacle and back into this car.
  if (car.destroyed || speed < 3.5 || time - (car.struckAt ?? -Infinity) < .24) return;
  const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  const across = -(nx * cos - nz * sin), along = -(nx * sin + nz * cos);
  const panel = Math.abs(across) > Math.abs(along) ? doorPanel(across) : along >= 0 ? PANEL.front : PANEL.rear;
  // Closing speed normal to the surface determines the crush. A glancing
  // scrape at highway speed can do less damage than a head-on city crash.
  const crush = Math.min(1, ((speed - 3) / 32) ** 1.65);
  car.damage = Math.min(1, (car.damage || 0) + crush);
  car.dents ||= {};
  car.dents[panel] = Math.min(1, (car.dents[panel] || 0) + crush * 1.6);
  car.struckAt = time;
  if (car.dents[panel] > (panel === PANEL.front ? .78 : .3)) car.brokenGlass = (car.brokenGlass || 0) | panel;
  if (car.doorOpen > .3 && doorPanel(car.doorSide) === panel && speed > 5) tearDoor(car);
  const criticalHit = (panel === PANEL.front && car.dents[panel] > .65) ||
    (panel === PANEL.rear && crush > .8) || (car.identity?.performance?.fuel === 'E' && crush > .82);
  if (car.burningSince == null && car.damage >= .88 && criticalHit) {
    car.evacuating = !car.controlled && hasDriver(car);
    car.burningSince = time;
  }
}

export function tearDoor(car) {
  const panel = doorPanel(car.doorSide);
  car.missingDoors = (car.missingDoors || 0) | panel;
  car.brokenGlass = (car.brokenGlass || 0) | panel;
  car.damage = Math.min(1, (car.damage || 0) + .08);
  car.doorOpen = car.doorHold = 0;
}

/** Advance an unattended fire too. Returns true once when it consumes the vehicle. */
export function stepVehicleFire(car, time) {
  if (car.destroyed || car.burningSince == null || time - car.burningSince < 9) return false;
  car.destroyed = car._wrecked = true;
  car.damage = 1; car.brokenGlass = 15; car.burningSince = null;
  car.parked = true; car._shoved = false; car._loose = 0; car._route = []; car._edge = null;
  car.siren = false;
  return true;
}
