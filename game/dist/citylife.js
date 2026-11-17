// How busy a place is at a given hour, who is on its sidewalks, and what the
// city's own lists say about its corners.
//
// Three things here are data: the sidewalk counts DOT takes at 114 places
// every spring and autumn, the signals that give pedestrians a head start,
// and the signals where every direction of traffic stops for them (all three
// in street-life.json). The rest is a model, and a plain one: a handful of
// named districts, a daily rhythm for each kind of place, and proportions of
// dress and vehicles that follow from them. It is meant to be read and argued
// with, not mistaken for a survey.
import { businessDistrict, loftDistrict, timesSquare } from './facade.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const fall = (x, z, cx, cz, radius) => Math.max(0, 1 - Math.hypot(x - cx, z - cz) / radius);
const bump = (hours, centre, spread) => { const d = Math.abs(((hours - centre + 36) % 24) - 12); return Math.exp(-.5 * (d / spread) ** 2); };

/**
 * Manhattan from the Battery to 110th Street, as a box along the avenues
 * (which run 29 degrees east of north). Nearly every corner in it has a
 * signal, yellow cabs cruise it, and green cabs may not pick up there.
 */
export function manhattanCore(x, z) {
  const along = x * .485 - z * .875, across = x * .875 + z * .485;
  return along > -2700 && along < 9300 && across > -2300 && across < 1500;
}

// Places people go to rather than through, each [x, z, radius in metres, strength]:
// Times Square, Rockefeller Center, Wall Street, the DUMBO waterfront, Central Park South, the High Line.
const VISITED = [[1362, -3862, 520, 1], [1920, -3910, 420, .7], [-660, 1900, 520, .55], [850, 2250, 520, .6], [2000, -4750, 450, .5], [-450, -2050, 420, .5]];
// Evenings out: the East Village and Lower East Side, the Meatpacking District, Hell's Kitchen, Williamsburg.
const EVENINGS = [[1150, -100, 900, 1], [-540, -1930, 520, .8], [880, -4210, 620, .6], [3690, 630, 800, .8]];
// Shopping streets beyond the office districts: 34th Street, Fulton Mall, Flushing, Fordham Road, 125th Street, Jamaica.
const SHOPPING = [[1160, -2910, 420, 1], [1300, 3620, 420, .8], [14450, -4020, 520, .9], [8890, -15430, 480, .8], [4730, -9390, 520, .7], [17320, 2100, 520, .6]];
const strongest = (x, z, places) => places.reduce((best, [cx, cz, radius, strength]) => Math.max(best, fall(x, z, cx, cz, radius) * strength * 1.4), 0);

/**
 * What kind of place a point is, each from 0 to 1: `business` (offices),
 * `visited` (sightseeing), `evenings` (bars and restaurants), `shopping`,
 * and `homes` for whatever is left. `core` is the Manhattan core.
 */
export function characterAt(x, z) {
  const business = businessDistrict(x, z);
  const visited = Math.min(1, Math.max(timesSquare(x, z) ? 1 : 0, strongest(x, z, VISITED)));
  const evenings = Math.min(1, strongest(x, z, EVENINGS));
  const shopping = Math.min(1, Math.max(loftDistrict(x, z) ? .7 : 0, strongest(x, z, SHOPPING)));
  const homes = clamp(1 - Math.max(business, visited, shopping, evenings), 0, 1);
  return { business, visited, evenings, shopping, homes, core: manhattanCore(x, z) };
}

/**
 * The shape of a weekday on a sidewalk: its busiest hour is 1. Offices fill
 * the street at nine, one and half past five and empty it by nine at night;
 * sights and shops build through the afternoon; bars keep a street alive
 * past midnight; a residential block has a school run and a walk home.
 */
export function rhythm(character, hours) {
  const { business, visited, evenings, shopping } = character;
  const offices = Math.max(.92 * bump(hours, 8.5, 1), .95 * bump(hours, 12.8, 1.2), bump(hours, 17.6, 1.3), .1 * bump(hours, 21, 2));
  // Only the brightest sights keep their crowds past ten at night.
  const sights = Math.max(.25 * bump(hours, 9.5, 1.6), .8 * bump(hours, 14, 2.6), bump(hours, 19.5, 2.6), visited ** 2 * Math.max(.75 * bump(hours, 22.5, 1.8), .35 * bump(hours, .5, 1.2)));
  const shops = Math.max(.3 * bump(hours, 9.5, 1.4), .9 * bump(hours, 13.5, 2.2), bump(hours, 17.5, 2), .25 * bump(hours, 21, 1.6));
  const nights = Math.max(.3 * bump(hours, 13, 2.5), .85 * bump(hours, 19, 1.8), bump(hours, 22.5, 2), .6 * bump(hours, 1.5, 1.4));
  const blocks = Math.max(.75 * bump(hours, 8.1, 1.1), .5 * bump(hours, 13, 2.6), bump(hours, 17.8, 1.9), .3 * bump(hours, 21, 1.8));
  // Where people come to look, shop or eat, they outnumber the people who work there.
  const weights = [business, visited * (1 + visited), 1.2 * shopping, 1.2 * evenings, character.homes + .15];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shape = (weights[0] * offices + weights[1] * sights + weights[2] * shops + weights[3] * nights + weights[4] * blocks) / total;
  // Nowhere in New York is ever quite empty.
  return Math.max(.035, shape);
}

/** People an hour at a place's busiest, both sidewalks together, where nothing was counted. */
export function assumedPeak(character) {
  return Math.round(240 + 3400 * character.business ** 1.3 + 5200 * character.visited + 2300 * character.shopping + 1300 * character.evenings);
}

/**
 * Build the lookups from street-life.json. Without data everything still
 * answers, from the model alone.
 */
export function createCityLife(data = null) {
  const cell = 64, grids = { lpi: new Map(), exclusive: new Map() };
  for (const name of Object.keys(grids)) {
    const flat = Array.isArray(data?.[name]) ? data[name] : [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const key = `${Math.floor(flat[i] / cell)},${Math.floor(flat[i + 1] / cell)}`;
      if (!grids[name].has(key)) grids[name].set(key, []);
      grids[name].get(key).push(flat[i], flat[i + 1]);
    }
  }
  const near = (grid, x, z, radius) => {
    for (let gx = Math.floor((x - radius) / cell); gx <= Math.floor((x + radius) / cell); gx++) for (let gz = Math.floor((z - radius) / cell); gz <= Math.floor((z + radius) / cell); gz++) {
      const points = grid.get(`${gx},${gz}`);
      if (points) for (let i = 0; i < points.length; i += 2) if (Math.hypot(points[i] - x, points[i + 1] - z) <= radius) return true;
    }
    return false;
  };
  const counts = (Array.isArray(data?.counts) ? data.counts : []).filter(count => Number.isFinite(count?.x) && Number.isFinite(count?.z) && (count.am > 0 || count.pm > 0));

  /** People an hour on both sidewalks at a counted place, at any hour of a weekday. */
  function counted(count, hours) {
    const am = count.am || count.pm * .55, pm = count.pm || count.am * 1.3, character = characterAt(count.x, count.z);
    // The count fixes the two rush hours; the place's rhythm fills in the rest of the day.
    const shape = rhythm(character, hours), morning = rhythm(character, 8), evening = rhythm(character, 17.5);
    const blend = clamp((hours - 8) / 9.5, 0, 1);
    return shape * ((1 - blend) * am / morning + blend * pm / evening);
  }

  return {
    counts,
    /** What the city's lists show at a corner: a head start for pedestrians, an all-walk phase. */
    hintsAt(x, z, radius = 30) { return { lpi: near(grids.lpi, x, z, radius), exclusive: near(grids.exclusive, x, z, radius) }; },
    /**
     * People an hour passing a point, both sidewalks together. Near a counted
     * place the count leads; a kilometre away the model has taken over.
     */
    footfall(x, z, hours) {
      const character = characterAt(x, z);
      let value = assumedPeak(character) * rhythm(character, hours), weight = 1;
      for (const count of counts) {
        const d = Math.hypot(count.x - x, count.z - z);
        if (d > 1000) continue;
        // A count describes its own block and, more weakly, the blocks beside it.
        const pull = 60 * (1 - d / 1000) ** 4 / (1 + (d / 60) ** 2);
        value += counted(count, hours) * pull; weight += pull;
      }
      return value / weight;
    },
    /** People standing on a metre of one sidewalk: flow over walking speed, halved for the two sides. */
    crowding(x, z, hours) { return this.footfall(x, z, hours) / 2 / 3600 / WALKING_PACE; },
    wardrobe: (x, z, hours) => wardrobe(characterAt(x, z), hours),
    traffic: (x, z, hours) => traffic(characterAt(x, z), hours),
  };
}

/** New Yorkers walk at about four and a half feet a second. */
export const WALKING_PACE = 1.4;

/** What people wear, as shares that sum to 1. The season is July. */
export const OUTFITS = ['suit', 'office', 'casual', 'summer', 'athletic', 'evening', 'visitor', 'worker'];
export function wardrobe(character, hours) {
  const working = bump(hours, 13, 4.2), late = Math.max(bump(hours, 23, 2.2), bump(hours, 1, 2));
  const office = character.business * working;
  const share = {
    // Even in July a third of the people around offices keep a jacket on.
    suit: .2 * office, office: .36 * office,
    visitor: .5 * character.visited * (1 - .5 * late),
    evening: .55 * late * Math.max(character.evenings, .35 * character.visited, .12),
    athletic: .05 + .06 * Math.max(bump(hours, 7, 1.2), bump(hours, 18.8, 1.3)) * (1 - character.business),
    worker: .05 + .04 * bump(hours, 10, 3),
    summer: .2, casual: 0,
  };
  const taken = Object.values(share).reduce((sum, value) => sum + value, 0);
  if (taken > .9) for (const key of Object.keys(share)) share[key] *= .9 / taken;
  share.casual = 1 - Object.values(share).reduce((sum, value) => sum + value, 0);
  return share;
}

/**
 * Traffic near a place: `level` from about .15 in the small hours to 1 in
 * the rush, `taxis` the share of cars that are cabs, and `green` whether
 * those cabs are the apple-green ones that serve everywhere outside the
 * Manhattan core.
 */
export function traffic(character, hours) {
  const rush = Math.max(bump(hours, 8.5, 1.5), .85 * bump(hours, 13, 2.5), bump(hours, 17.3, 1.8));
  const evening = .6 * bump(hours, 21, 2.2) * (.5 + .5 * Math.max(character.evenings, character.visited));
  const level = clamp(.14 + .86 * Math.max(rush, evening), .14, 1) * (.55 + .45 * Math.max(character.business, character.visited, character.shopping, .35));
  // By day a third of what moves in Midtown is a cab; after midnight, most of it.
  const small = Math.max(bump(hours, 2, 2.2), bump(hours, 23.5, 1.5));
  const taxis = character.core ? clamp(.3 + .25 * small + .08 * character.business, 0, .6) : .07 + .05 * small;
  return { level, taxis, green: !character.core };
}
