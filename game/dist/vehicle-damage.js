// Local +X is the driver's side and +Z is the nose.
export const PANEL = { left: 1, right: 2, front: 4, rear: 8, roof: 16, leftQuarter:32, rightQuarter:64 };
export const doorPanel = side => side > 0 ? PANEL.left : PANEL.right;
export function carCondition(car) {
  const body = car.damage > 0 ? Math.min(99,Math.round(100*(1-car.damage))) : 100;
  return car.glassDamage || car.shotGlass || car.brokenGlass ? Math.min(body,98) : body;
}

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
  Object.assign(car, { damage: 0, dents: null, crushZones: null, crushRevision: 0, fractureOrigin: null, glassDamage: 0, shotGlass: 0, secondFracture:null, bodyRock:null, lastImpact:null, brokenGlass: 0, missingDoors: 0, doorOpen: 0,
    doorHold: 0, evacuating: false, burningSince: null, destroyed: false, _wrecked: false, struckAt: null, explodedAt: null });
}

export function vehiclePaneBroken(car,panel) {
  const group = panel===PANEL.leftQuarter ? PANEL.left : panel===PANEL.rightQuarter ? PANEL.right : panel;
  return Boolean((car.brokenGlass & group) || (car.shotGlass & panel));
}

export function strikeVehicleGlass(car, panel, origin) {
  if (vehiclePaneBroken(car,panel)) return false;
  if (panel===PANEL.front) {
    if (car.glassDamage>=.95) return false;
    car.glassDamage = Math.min(.95,(car.glassDamage || 0)+.37);
    car.fractureOrigin ??= {};
    car.fractureOrigin[panel] ??= origin;
    if (Math.abs(origin-car.fractureOrigin[panel])>.22) car.secondFracture = {origin,depth:car.glassDamage};
    return true;
  }
  car.shotGlass = (car.shotGlass || 0) | panel;
  return true;
}

export function impactVehicle(car, speed, nx, nz, time, contact) {
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
  const end = panel === PANEL.front || panel === PANEL.rear;
  let offset = 0;
  if (Number.isFinite(contact?.x) && Number.isFinite(contact?.z)) {
    const dx = contact.x-car.x, dz = contact.z-car.z;
    offset = Math.max(-1,Math.min(1,end ? (dx*cos-dz*sin)/.92 : (dx*sin+dz*cos)/2.04));
    car.crushZones ||= {};
    const zones = car.crushZones[panel] ||= [];
    const slot = Math.round((offset+1)*2);
    const narrow = ['lamp','tree','sapling'].includes(contact.body?.kind);
    const zone = zones[slot] ||= {offset, width:0, depth:0};
    zone.width = Math.max(zone.width, narrow ? .34 : contact.flat ? 2.2 : .72);
    zone.depth = Math.min(1, zone.depth + crush*1.6);
    car.crushRevision = (car.crushRevision || 0) + 1;
  }
  if (car.dents[panel] > .055) {
    car.fractureOrigin ||= {};
    const origin = .5 + offset*.35;
    car.fractureOrigin[panel] ??= origin;
    if (panel === PANEL.front && crush > .055 && Math.abs(origin-car.fractureOrigin[panel]) > .28) {
      car.secondFracture ||= {origin,depth:0};
      car.secondFracture.depth = Math.min(1,car.secondFracture.depth+crush);
    }
  }
  const wasBroken = car.brokenGlass || 0;
  const jolt = Math.min(25,speed);
  car.bodyRock = {at:time, weight:0, pitch:along*jolt*.006, roll:-across*jolt*.008, heave:-jolt*.002};
  car.struckAt = time;
  // The bonded windshield stays in its frame. Tempered side and rear panes can fall out.
  if (panel !== PANEL.front && car.dents[panel] > .36) car.brokenGlass = (car.brokenGlass || 0) | panel;
  car.lastImpact = { x:contact?.x ?? car.x, z:contact?.z ?? car.z, speed, nx, nz,
    shattered: Boolean((car.brokenGlass || 0) & ~wasBroken), dusty:contact?.kind === 'building' };
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
