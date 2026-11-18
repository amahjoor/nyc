// How a car goes.
//
// vehicle-performance.json gives each registered model year the engine power,
// curb weight, driven wheels and fuel that NHTSA vPIC decodes from its VINs,
// averaged over the cars registered. From those follow what a road test would
// measure: the time to 60 mph, the top speed, cornering grip and braking. The
// published reference trims and estimates are described in docs/vehicles.md.
// Where vPIC is silent the power or the weight is estimated from
// the car's size, kind and period, and the result says so.
//
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const PREMIUM = new Set(['BMW', 'Mercedes-Benz', 'Audi', 'Porsche', 'Tesla', 'Jaguar', 'Maserati', 'Alfa Romeo', 'Lucid', 'Polestar', 'Rivian']);
const NEAR_PREMIUM = new Set(['Lexus', 'Acura', 'Infiniti', 'Volvo', 'Cadillac', 'Lincoln', 'Genesis', 'Land Rover', 'MINI']);
// A car of each kind when nothing is known of it: metres long, wide and high.
const SIZE = { sedan: [4.75, 1.82, 1.455], coupe: [4.6, 1.85, 1.38], hatch: [4.25, 1.77, 1.48], wagon: [4.75, 1.82, 1.5], suv: [4.65, 1.87, 1.68], minivan: [5.12, 1.98, 1.75], pickup: [5.65, 2, 1.9], van: [5.45, 2.02, 2.1] };
// Curb weight for each cubic metre of length x width x height, drag coefficient, and cornering grip in g.
const KIND = {
  sedan: { density: 115, cd: .29, grip: .86 }, coupe: { density: 120, cd: .31, grip: .93 }, hatch: { density: 115, cd: .31, grip: .86 }, wagon: { density: 112, cd: .31, grip: .85 },
  suv: { density: 110, cd: .35, grip: .8 }, minivan: { density: 115, cd: .33, grip: .78 }, pickup: { density: 92, cd: .42, grip: .74 }, van: { density: 95, cd: .38, grip: .7 },
};
// Where a maker stops the car, in mph, whatever the engine could do.
const LIMITER = { pickup: 108, van: 98, suv: 118, minivan: 118 };
/** The family sedan every car is read against: seconds to 60 mph, mph, g cornering and g braking. */
export const REFERENCE = { zeroToSixty: 8, topSpeed: 130, grip: .86, braking: .93 };

export const MPS_PER_MPH = .44704, STANDARD_GRAVITY = 9.80665;
export const SIXTY_MPS = 60 * MPS_PER_MPH;

// Representative stock configurations for registration groups spanning several trims.
// Model-year ranges and road-test sources are documented in docs/vehicles.md.
const STOCK = [
  { make: 'Honda', model: 'CR-V', from: 2017, to: 2022, shape: 'suv', fuel: 'G', reference: 'Touring AWD', topSpeed: 124, grip: .82, stop70Feet: 176 },
  { make: 'Toyota', model: 'RAV4', from: 2019, to: 2025, shape: 'suv', fuel: 'G', reference: 'Adventure AWD', topSpeed: 122, zeroToSixty: 8.0, grip: .83, stop70Feet: 166 },
  { make: 'Toyota', model: 'Sienna', from: 2021, to: 2026, shape: 'minivan', reference: 'Hybrid Platinum AWD', topSpeed: 116, zeroToSixty: 7.7, grip: .79, stop70Feet: 188 },
  { make: 'Nissan', model: 'Rogue', from: 2022, to: 2025, shape: 'suv', reference: 'Platinum AWD', topSpeed: 120, zeroToSixty: 7.8, grip: .84, stop70Feet: 169 },
  { make: 'Tesla', model: 'Model Y', from: 2020, to: 2024, shape: 'suv', reference: 'Long Range AWD', topSpeed: 135, zeroToSixty: 4.8 },
  { make: 'Honda', model: 'CR-V', from: 2023, to: 2026, shape: 'suv', fuel: 'H', reference: 'Sport Touring Hybrid', topSpeed: 115, zeroToSixty: 7.9 },
  { make: 'Tesla', model: 'Model Y', from: 2026, to: 2026, shape: 'suv', reference: 'Standard model', topSpeed: 125 },
  { make: 'Tesla', model: 'Model 3', from: 2024, to: 2026, shape: 'sedan', reference: 'Long Range AWD', topSpeed: 125, zeroToSixty: 4.2 },
  { make: 'BMW', model: 'i4', from: 2022, to: 2026, shape: 'sedan', reference: 'eDrive40', topSpeed: 118 },
  { make: 'BMW', model: '750i', from: 2016, to: 2022, shape: 'sedan', reference: 'Standard tires', topSpeed: 130 },
  { make: 'Lucid', model: 'Air', from: 2023, to: 2026, shape: 'sedan', reference: 'Touring AWD', topSpeed: 140, zeroToSixty: 3.4 },
  { make: 'Lucid', model: 'Gravity', from: 2025, to: 2026, shape: 'suv', reference: 'Grand Touring AWD', topSpeed: 155 },
  { make: 'Rivian', model: 'R1S', from: 2022, to: 2024, shape: 'suv', reference: 'Launch Edition', topSpeed: 111, zeroToSixty: 3.1, grip: .85, stop70Feet: 173 },
  { make: 'Rivian', model: 'R1S', from: 2025, to: 2026, shape: 'suv', reference: 'Tri-Motor Max', topSpeed: 130, zeroToSixty: 2.8, grip: .80 },
  { make: 'Rivian', model: 'R2', from: 2027, to: 2027, shape: 'suv', reference: 'Performance AWD Launch Edition', topSpeed: 130 },
  { make: 'Toyota', model: 'PRIUS', from: 2016, to: 2022, shape: 'hatch', reference: 'Fourth-generation Prius', topSpeed: 112 },
  { make: 'Porsche', model: '911', from: 2017, to: 2019, shape: 'coupe', reference: 'Carrera PDK', topSpeed: 182 },
  { make: 'BMW', model: 'M3', from: 2015, to: 2026, shape: 'sedan', reference: 'Standard limiter', topSpeed: 155 },
  { make: 'BMW', model: 'M4', from: 2015, to: 2026, shape: 'coupe', reference: 'Standard limiter', topSpeed: 155 },
  { make: 'Chevrolet', model: 'Corvette', from: 2014, to: 2019, shape: 'coupe', reference: 'Stingray Z51', topSpeed: 180, hp: 460 },
  { make: 'Chevrolet', model: 'Corvette', from: 2020, to: 2026, shape: 'coupe', reference: 'Stingray 1LT', topSpeed: 194, zeroToSixty: 3.3, hp: 490, grip: .95, braking: 1.16 },
  { make: 'Ford', model: 'Police Interceptor Utility', from: 2021, to: 2021, shape: 'suv', reference: 'Hybrid AWD', hp: 318, topSpeed: 136, zeroToSixty: 7.19 },
];

/** Convert the stock or modified handling ratios to flat-road test figures. */
export function roadFigures(handling) {
  const braking = REFERENCE.braking * (handling?.brakes ?? 1);
  return {
    topSpeed: REFERENCE.topSpeed * (handling?.top ?? 1),
    zeroToSixty: REFERENCE.zeroToSixty / (handling?.power ?? 1),
    grip: REFERENCE.grip * (handling?.grip ?? 1), braking,
    stoppingFeet: SIXTY_MPS ** 2 / (2 * braking * STANDARD_GRAVITY * .3048),
  };
}

/** Kilograms carried by each horsepower in a car of this kind and period, when its power is not on file. */
function loading(make, year, shape, fuel, length) {
  if (fuel === 'E') return make === 'Tesla' ? 5.4 : make === 'Lucid' || make === 'Rivian' ? 3.8 : make === 'Porsche' ? 4.5 : 8.5;
  if (shape === 'van') return fuel === 'D' ? 13 : 10.5;
  if (shape === 'pickup') return 6.8;
  if (PREMIUM.has(make)) return 6.3;
  const period = year >= 2012 ? 8.2 : year >= 2004 ? 8.8 : 9.8;
  // A long two-door is a sporting car; a very short car of any kind is a city runabout with an engine to match.
  return (length < 4 ? 1.25 : shape === 'coupe' ? .78 : shape === 'minivan' ? .92 : 1) * (NEAR_PREMIUM.has(make) ? .88 : 1) * period;
}

/**
 * What a car does, from what is on file for it.
 * @param {{make?: string, year?: number, shape?: string}} car
 * @param {Array|null} specs `[hp, kg, drive, fuel]` from vehicle-performance.json, any of them null
 * @param {{L: number, W: number, H: number}|null} size its dimensions in metres, if a design has them
 * @returns hp and kg; `drive` F, R or A; `fuel` G, D, H, P or E; `zeroToSixty` in seconds; `topSpeed` in mph;
 *   `grip` and `braking` in g; `measured` says which of hp and kg are on file; `handling` is what the game drives with.
 */
export function carPerformance({ make = '', model = '', year = 2015, shape = 'sedan' } = {}, specs = null, size = null) {
  const kind = KIND[shape] || KIND.sedan, [length, width, height] = size ? [size.L, size.W, size.H] : SIZE[shape] || SIZE.sedan;
  const [filedPower, filedWeight, drive = null, fuel = 'G'] = [specs?.[0] || null, specs?.[1] || null, specs?.[2] || undefined, specs?.[3] || undefined];
  const stock = STOCK.find(row => row.make === make && row.model === model && row.shape === shape && year >= row.from && year <= row.to && (!row.fuel || row.fuel === fuel));
  const volvoLimit = make === 'Volvo' && year >= 2021;
  const premium = PREMIUM.has(make), electric = fuel === 'E';
  const kg = filedWeight || Math.round(length * width * height * kind.density * (electric ? 1.22 : fuel === 'P' ? 1.1 : 1) * (premium ? 1.06 : 1) / 5) * 5;
  // A hybrid's filing gives its engine alone: the motor adds about a third when both pull.
  const hp = Math.round(filedPower ? filedPower * (fuel === 'H' ? 1.3 : fuel === 'P' ? 1.4 : 1) : stock?.hp ?? kg / loading(make, year, shape, fuel, length));
  const burden = kg * 2.20462 / hp;
  // Pounds per horsepower to the three-quarters, by which wheels put it down; an electric car has all its pull at once.
  const launch = { F: .92, R: .88, A: .84 }[drive] ?? (electric ? .86 : .9);
  const zeroToSixty = stock?.zeroToSixty ?? +clamp(launch * (electric ? .82 : 1) * burden ** .75, 2.3, 17).toFixed(1);
  // Flat out, the engine's power at the wheels goes into pushing air aside: power = half x density x drag area x speed cubed.
  const area = (shape === 'pickup' || shape === 'van' ? .86 : .81) * width * height, wheel = hp * 745.7 * (electric ? .9 : .85);
  const unlimited = Math.cbrt(2 * wheel / (1.2 * kind.cd * area)) * .9 * 2.23694;
  const quick = burden <= 11.5 && shape !== 'pickup' && shape !== 'van';
  let limiter = premium ? 155 : NEAR_PREMIUM.has(make) ? 140 : 130;
  if (LIMITER[shape]) limiter = LIMITER[shape] + (premium ? 37 : NEAR_PREMIUM.has(make) ? 12 : 0);
  if (quick && (shape === 'coupe' || make === 'Porsche' || model === 'Charger')) limiter = 205;
  if (['BMW', 'Mercedes-Benz', 'Audi'].includes(make)) limiter = Math.min(limiter,155);
  if (make === 'Tesla') limiter = 140;
  const topSpeed = stock?.topSpeed ?? Math.round(Math.min(unlimited, volvoLimit ? 112 : limiter));
  // Grip is the kind of car, and better where the maker expected it to be driven hard.
  const grip = stock?.grip ?? +clamp(kind.grip + (burden < 9 ? .1 : burden < 12 ? .05 : 0) + (premium ? .02 : 0) + (electric ? .02 : 0), .65, 1.1).toFixed(2);
  const measuredBrake = stock?.stop70Feet ? (70*MPS_PER_MPH)**2 / (2*STANDARD_GRAVITY*stock.stop70Feet*.3048) : stock?.braking;
  const braking = measuredBrake ?? +clamp(grip * 1.08 - (kg > 2400 ? .04 : 0), .7, 1.2).toFixed(2);
  const handling = {
    power: REFERENCE.zeroToSixty / zeroToSixty, top: topSpeed / REFERENCE.topSpeed,
    brakes: braking / REFERENCE.braking, grip: grip / REFERENCE.grip,
  };
  return { reference: stock?.reference ?? (volvoLimit ? '180 km/h factory limiter' : null), hp, kg, drive, fuel, zeroToSixty, topSpeed, grip, braking, measured: { hp: Boolean(filedPower || stock?.hp), kg: Boolean(filedWeight) }, handling };
}

const FUEL = { G: 'petrol', D: 'diesel', H: 'hybrid', P: 'plug-in hybrid', E: 'electric' }, DRIVE = { F: 'front-wheel drive', R: 'rear-wheel drive', A: 'all-wheel drive' };
/** One line for a catalog or a sign: "204 hp · 1,620 kg · front-wheel drive · 0-60 in 7.9 s · 130 mph". */
export function describePowertrain(p) {
  const about = (text, sure) => sure ? text : '~' + text;
  return [about(p.hp + ' hp', p.measured.hp), about(p.kg.toLocaleString('en-US') + ' kg', p.measured.kg), FUEL[p.fuel] !== 'petrol' && FUEL[p.fuel], DRIVE[p.drive]].filter(Boolean).join(' · ');
}

export function describePerformance(p) {
  return describePowertrain(p) + ' · 0–60 mph in ' + p.zeroToSixty + ' s · ' + p.topSpeed + ' mph';
}
