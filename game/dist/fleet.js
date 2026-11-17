// Which cars are on the block.
//
// The state publishes every vehicle registration with its body type, its
// colour and the ZIP code it is registered in. scripts/build-fleet.mjs
// counts the passenger cars of the five boroughs by ZIP code; this module
// turns the counts for wherever the player is into the mix of bodies and
// paint that the cars parked and driving there are drawn from. SoHo's
// registrations are seven in ten SUVs and wagons; Staten Island has more
// pickups.

/** The bodies the game draws (vehicle-model.js), in the order the bundle stores their shares. */
export const BODIES = ['sedan', 'suv', 'hatch', 'wagon', 'minivan', 'coupe', 'pickup', 'van'];

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

/**
 * The fleet for the whole city. `data` is fleet.json; without it every
 * place has the same plain mix.
 */
export function createFleet(data = null) {
  const bodies = data?.bodies || BODIES, paints = data?.paints || PAINTS.map(([, hex]) => hex);
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
    mixes.set(entry, result);
    return result;
  };
  return {
    zips: zips.length,
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
/** Paint from a mix and a number from 0 to 1. */
export const drawPaint = (mix, r) => drawFrom(mix.paints, mix.paint, r);

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
