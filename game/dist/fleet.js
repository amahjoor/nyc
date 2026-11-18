// Which cars are on the block.
//
// Passenger registrations supply joint make, model, year and body counts
// for each ZIP. The earlier fleet bundle supplies centroids and paint.

import { carPerformance } from './vehicle-performance.js';

/** The bodies the game draws (vehicle-model.js), in the order the bundle stores their shares. */
export const BODIES = ['sedan', 'suv', 'hatch', 'wagon', 'minivan', 'coupe', 'pickup', 'van'];
export const WHEEL = { radius: .35, x: .9, front: 1.3, rear: -1.37 };

/**
 * How the registration body types fall into those bodies. "Suburban" is the
 * motor vehicle department's word for everything with a tailgate: the split
 * between sport utilities, hatchbacks, estate cars and minivans is the game's.
 */
export const BODY_OF = { '4DSD': { sedan: 1 }, SEDN: { sedan: 1 }, SUBN: { suv: .58, hatch: .17, wagon: .1, minivan: .15 }, '2DSD': { coupe: 1 }, CONV: { coupe: 1 }, PICK: { pickup: 1 }, VAN: { van: 1 } };

/** Paint for each of the registration colour codes, in the order the bundle stores their shares. */
export const PAINTS = [['BK', '#15181b'], ['WH', '#e8e9e6'], ['GY', '#5b6166'], ['SL', '#b4b9bd'], ['BL', '#1f3a6a'], ['RD', '#8a1f1f'], ['GR', '#27402f'], ['BR', '#4a3524'], ['TN', '#b8a47e'], ['GL', '#b59a4a'],
  ['MR', '#5a1a22'], ['OR', '#c4601a'], ['YW', '#d9b21c'], ['PR', '#4a2a5a']];
const PAINT_INDEX = Object.fromEntries(PAINTS.map(([code], index) => [code, index]));

/**
 * Which entry of PAINTS a registration colour is: "DK BL" and "LT BL" are
 * both blue, and a two-tone "WH/BL" is its first colour. -1 if it is none of
 * them. The register has no code for silver: see SILVER_SHARE.
 */
export function paintIndex(code) {
  const base = String(code || '').toUpperCase().split('/')[0].trim().replace(/^(LT|DK)\s+/, '').trim();
  return PAINT_INDEX[base] ?? -1;
}
/** The register calls silver cars grey, a third of all it lists. This share of them is painted silver; the split is the game's. */
export const SILVER_SHARE = .5;

/** Running totals of a list of shares, scaled to end at 1: the form drawFrom() takes. */
export function cumulative(shares) {
  const total = shares.reduce((sum, share) => sum + Math.max(0, share), 0) || 1;
  let running = 0;
  return shares.map(share => (running += Math.max(0, share) / total));
}
/** The entry of `values` that a number from 0 to 1 falls on, given running totals of their shares. */
export function drawFrom(values, totals, r) {
  for (let i = 0; i < totals.length; i++) if (r < totals[i]) return values[i];
  return values[values.length - 1];
}

// A ZIP code with fewer cars than this leans on the whole city's mix.
const ENOUGH = 400;
// Of what drives past, this share is not a neighbour's car but a van or a pickup at work.
const AT_WORK = .14;

// Each pair is a catalog index and a registration count. A negative index
// keeps the weight of an unnamed car in its DMV/vPIC body class.
function registrationPicker(pairs, catalog) {
  const ends = new Uint32Array(pairs.length / 2);
  let total = 0;
  for (let i = 0; i < ends.length; i++) ends[i] = total += pairs[i * 2 + 1];
  return { total, draw(r) {
    const spot = Math.min(Math.floor(r * total), total - 1);
    let lo = 0, hi = ends.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (spot < ends[mid]) hi = mid; else lo = mid + 1;
    }
    const id = pairs[lo * 2], identity = id >= 0 ? catalog.variants[id] : null;
    let shape = identity?.shape ?? catalog.fallbacks[-id - 1];
    if (shape === 'suburban') {
      const start = ends[lo - 1] || 0;
      shape = drawFrom(suburbanBodies, suburbanTotals, (r * total - start) / (ends[lo] - start));
    }
    return { identity, shape };
  } };
}
const suburbanBodies = Object.keys(BODY_OF.SUBN), suburbanTotals = cumulative(Object.values(BODY_OF.SUBN));

/**
 * Attach an exterior to each registration variant in catalog order: an imported
 * one where its years and body match, otherwise the one `design` draws for that
 * make, model, year and body (vehicle-designs.js), if a designer is given. With
 * `performance` (vehicle-performance.json) each also carries how it goes.
 */
export function catalogVehicles(data, assets = [], design = null, performance = null) {
  const byModel = new Map();
  for (const asset of assets || []) {
    const key = asset.make + '/' + asset.model;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key).push(asset);
  }
  return data.variants.map(([make, model, year, shape], i) => {
    const asset = byModel.get(make + '/' + model)?.find(a => a.shape === shape && year >= a.years[0] && year <= a.years[1]);
    const car = { make, model, year, shape, asset: asset || design?.(make, model, year, shape) || null };
    // How it goes, from the power and weight on file for that model year (vehicle-performance.js).
    if (performance) car.performance = carPerformance(car, performance.variants[i], design?.(make, model, year, shape)?.design);
    return car;
  });
}

/**
 * The city's cabs and its trades' vans and pickups (working-vehicles.json):
 * which model years carry the medallions and boro permits, and which are
 * registered commercially. These are citywide: a cab works wherever the fare
 * goes. A cab's identity keeps the same car out of livery as `plain`.
 */
function workingFleet(data, design, paints, performance) {
  if (data?.version !== 1) return null;
  const measured = (name, i, car) => performance ? { performance: carPerformance(car, performance[name]?.[i], design?.(car.make, car.model, car.year, car.shape)?.design) } : null;
  const roster = (name, livery = null) => {
    const entry = data[name];
    const rows = entry?.variants || [], ends = new Uint32Array(rows.length);
    let named = 0;
    const cars = rows.map(([make, model, year, shape, count], i) => {
      ends[i] = named += count;
      // A van registered commercially is a cargo van: panelled in behind the cab.
      const plain = { make, model, year, shape, asset: design?.(make, model, year, shape, !livery && shape === 'van' ? 'cargo' : null) || null, ...measured(name, i, { make, model, year, shape }) };
      return livery ? { ...plain, asset: design?.(make, model, year, shape, livery) || null, plain } : plain;
    });
    const all = Math.max(named, entry?.vehicles || 0);
    // The car a number from 0 to 1 falls on, or null for one of those the source could not name.
    return { rows, named, all, pick(r) {
      const spot = Math.min(Math.floor(r * all), all - 1);
      if (spot >= named) return null;
      let lo = 0, hi = ends.length - 1;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (spot < ends[mid]) hi = mid; else lo = mid + 1; }
      return cars[lo];
    } };
  };
  const yellow = roster('taxis', 'taxi'), green = roster('boroTaxis', 'taxi'), work = roster('work');
  // Of the vans and pickups nobody could name, how many are vans.
  const count = shape => work.rows.reduce((sum, row) => sum + (row[3] === shape ? row[4] : 0), 0);
  const spare = { van: Math.max(0, (data.work?.bodies?.van || 0) - count('van')), pickup: Math.max(0, (data.work?.bodies?.pickup || 0) - count('pickup')) };
  const vans = spare.van + spare.pickup ? spare.van / (spare.van + spare.pickup) : .6;
  // Their paint, in the register's codes: the grey it lists is half silver, as for any car.
  const shares = paints.map(() => 0);
  for (const [code, n] of Object.entries(data.work?.colors || {})) {
    const index = paintIndex(code);
    if (index < 0 || index >= shares.length) continue;
    if (PAINTS[index][0] === 'GY' && PAINT_INDEX.SL < shares.length) { shares[index] += n * (1 - SILVER_SHARE); shares[PAINT_INDEX.SL] += n * SILVER_SHARE; }
    else shares[index] += n;
  }
  return {
    taxi: yellow.all || green.all ? (r, boro = false) => ({ identity: (boro && green.all ? green : yellow.all ? yellow : green).pick(r), shape: undefined }) : null,
    work: work.all ? r => {
      const identity = work.pick(r);
      if (identity) return { identity, shape: identity.shape, working: true };
      const left = (r * work.all - work.named) / Math.max(1, work.all - work.named);
      return { identity: null, shape: left < vans ? 'van' : 'pickup', working: true };
    } : null,
    paint: paints.length === PAINTS.length && shares.some(Boolean) ? cumulative(shares) : null,
    // The hybrid Interceptor's combined 318 hp and 2,250 kg are Ford's published figures.
    patrol: design ? { make: 'Ford', model: 'Police Interceptor Utility', year: 2021, shape: 'suv', asset: design('Ford', 'Police Interceptor Utility', 2021, 'suv', 'police'),
      ...(performance ? { performance: carPerformance({ make: 'Ford', year: 2021, shape: 'suv' }, [318, 2250, 'A', 'G'], design('Ford', 'Police Interceptor Utility', 2021, 'suv').design) } : null) } : null,
  };
}

function registrationCatalog(data, assets, design, performance) {
  if (data?.version !== 1 || !data.city?.length || !Array.isArray(data.variants)) return null;
  const catalog = { variants: catalogVehicles(data, assets, design, performance), fallbacks: data.fallbacks };
  const city = registrationPicker(data.city, catalog);
  return zip => {
    const pairs = data.zips?.[zip];
    if (!pairs?.length) return city.draw;
    const local = registrationPicker(pairs, catalog), weight = Math.min(1, local.total / ENOUGH);
    if (weight === 1) return local.draw;
    return r => r < weight ? local.draw(r / weight) : city.draw((r - weight) / (1 - weight));
  };
}

/**
 * The fleet for the whole city. `data` is fleet.json; without it every
 * place has the same plain mix.
 */
export function createFleet(data = null, registrations = null, assets = [], design = null, working = null, performance = null) {
  // Figures for a different catalog would be another car's: use them only for the snapshot they were built from.
  if (performance?.version !== 1 || performance.variants?.length !== registrations?.variants?.length) performance = null;
  const catalog = registrationCatalog(registrations, assets, design, performance);
  const bodies = data?.bodies || BODIES, paints = data?.paints || PAINTS.map(([, hex]) => hex);
  const atWork = workingFleet(working, design, paints, performance);
  const normal = shares => { const total = shares.reduce((sum, share) => sum + share, 0) || 1; return shares.map(share => share / total); };
  const cityBodies = normal(data?.city?.bodies || [26, 39, 12, 7, 10, 3, 2, 1]), cityPaints = normal(data?.city?.paints || [26, 22, 20, 14, 8, 5, 2, 1, 1, 1, 0, 0, 0, 0]);
  // Colours are counted for the city as a whole; a ZIP code may carry its own.
  const zips = (data?.zips || []).map(([zip, x, z, cars, bodyShares, paintShares = null]) => ({ zip, x, z, cars, bodyShares, paintShares }));
  const mixes = new Map();
  const mix = entry => {
    if (mixes.has(entry)) return mixes.get(entry);
    // Few cars say little: a small ZIP code leans on the whole city's mix.
    const weight = entry ? Math.min(1, entry.cars / ENOUGH) : 0;
    const blend = (own, city) => own ? normal(own).map((share, i) => share * weight + city[i] * (1 - weight)) : city;
    const bodyShares = blend(entry?.bodyShares, cityBodies), paintShares = blend(entry?.paintShares, cityPaints);
    const working = bodies.map(body => body === 'van' ? .6 : body === 'pickup' ? .4 : 0);
    const result = { zip: entry?.zip || null, cars: entry?.cars || 0, bodies, paints, bodyShares, paintShares,
      parked: cumulative(bodyShares), moving: cumulative(bodyShares.map((share, i) => share * (1 - AT_WORK) + working[i] * AT_WORK)), paint: cumulative(paintShares) };
    if (catalog) result.registration = catalog(result.zip);
    if (atWork) Object.assign(result, { taxi: atWork.taxi, work: atWork.work, workPaint: atWork.paint });
    mixes.set(entry, result);
    return result;
  };
  return {
    zips: zips.length,
    /** The patrol car the police drive, or null when no designer draws it. */
    patrol: atWork?.patrol || null,
    /** The mix for the ZIP code whose middle is nearest (x, z). */
    at(x, z) {
      let nearest = null, best = Infinity;
      for (const entry of zips) { const d = (entry.x - x) ** 2 + (entry.z - z) ** 2; if (d < best) { best = d; nearest = entry; } }
      return mix(nearest);
    },
  };
}

/** A body for a parked car (`moving` false) or one in traffic, from a mix and a number from 0 to 1. */
export const drawBody = (mix, r, moving = false) => drawFrom(mix.bodies, moving ? mix.moving : mix.parked, r);
/** Paint from a mix and a number from 0 to 1: a working van's or pickup's own colours if `working`. */
export const drawPaint = (mix, r, working = false) => drawFrom(mix.paints, (working && mix.workPaint) || mix.paint, r);

/** One registration supplies the make, model, year and body together. */
export function drawVehicle(mix, r, moving = false) {
  if (!mix.registration) return { identity: null, shape: drawBody(mix, r, moving) };
  if (moving && r < AT_WORK) return mix.work ? mix.work(r / AT_WORK) : { identity: null, shape: r < AT_WORK * .6 ? 'van' : 'pickup' };
  return mix.registration(moving ? (r - AT_WORK) / (1 - AT_WORK) : r);
}

/** Which cab this is: one of the medallion fleet, or with `boro` one of the green cabs. Its identity is null where the fleet is not known. */
export const drawTaxi = (mix, r, boro = false) => mix?.taxi?.(r, boro) || { identity: null, shape: undefined };

export const vehicleName = identity => identity ? `${identity.year} ${identity.make} ${identity.model}` : '';

// Before the counts are known, or for a car the simulation has given no body, one is picked by the car's identity.
const UNCOUNTED = ['sedan', 'sedan', 'suv', 'suv', 'van'];
/** The body a car has: the one it was given, or one its identity picks. Cabs and patrol cars are sedans. */
export function bodyShape(type, seed, shape = null) {
  if (type === 'taxi' || type === 'police') return 'sedan';
  if (shape && BODIES.includes(shape)) return shape;
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return UNCOUNTED[hash % UNCOUNTED.length];
}
