// Calibration and denominators are documented in docs/vehicles.md.
export function motorist(car) {
  if (car.motorist?.id === car.id) return car.motorist;
  let seed = 2166136261;
  for (const c of String(car.id)) seed = Math.imul(seed ^ c.charCodeAt(0),16777619);
  function draw() {
    seed += 0x6d2b79f5;
    let t = Math.imul(seed ^ seed>>>15,1|seed);
    t ^= t + Math.imul(t ^ t>>>7,61|t);
    return ((t ^ t>>>14)>>>0)/4294967296;
  }
  return car.motorist = {id:car.id, honks:draw()<.445, confronts:draw()<.037,
    shops:draw()<.17, patience:5+8*draw(), phoneOffset:draw()*100, period:43+14*draw(), usesPhone:draw()<.5};
}

export function phoneGlance(car,time) {
  const driver = motorist(car);
  if (!driver.usesPhone) return -1;
  const phase = (time+driver.phoneOffset) % driver.period;
  return phase < driver.period*.06 ? phase : -1;
}
