// Finding a street corner or a business by name, from data the game already
// has: the city's street centrelines (the route planner's roads) and the
// places bundled for shop fronts. The city's address search knows building
// addresses only, and wants a street spelled its own way.
//
// A street can be written many ways: "53rd St", "West 53 Street", "W. 53rd",
// "Fifty-third Street"; "6th Ave", "Sixth Avenue", "Avenue of the Americas".
// Each is reduced to the same three parts: a compass direction if it leads
// the name, the name itself with numbers as digits, and the kind of street.

import { facilityIndex } from './places.js';

const UNITS = { ZERO: 0, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19,
  FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10, ELEVENTH: 11, TWELFTH: 12, THIRTEENTH: 13, FOURTEENTH: 14, FIFTEENTH: 15, SIXTEENTH: 16, SEVENTEENTH: 17, EIGHTEENTH: 18, NINETEENTH: 19 };
const TENS = { TWENTY: 20, THIRTY: 30, FORTY: 40, FIFTY: 50, SIXTY: 60, SEVENTY: 70, EIGHTY: 80, NINETY: 90, TWENTIETH: 20, THIRTIETH: 30, FORTIETH: 40, FIFTIETH: 50, SIXTIETH: 60, SEVENTIETH: 70, EIGHTIETH: 80, NINETIETH: 90 };
const SUFFIX = { ST: 'ST', STR: 'ST', STREET: 'ST', AVE: 'AVE', AV: 'AVE', AVENUE: 'AVE', AVEN: 'AVE', BLVD: 'BLVD', BL: 'BLVD', BOULEVARD: 'BLVD', BVD: 'BLVD', RD: 'RD', ROAD: 'RD', PL: 'PL', PLACE: 'PL', DR: 'DR', DRIVE: 'DR',
  PKWY: 'PKWY', PKY: 'PKWY', PY: 'PKWY', PARKWAY: 'PKWY', LN: 'LN', LANE: 'LN', CT: 'CT', COURT: 'CT', TER: 'TER', TERRACE: 'TER', SQ: 'SQ', SQUARE: 'SQ', EXPY: 'EXPY', EXPWY: 'EXPY', EXPRESSWAY: 'EXPY', BRG: 'BRG', BRIDGE: 'BRG',
  HWY: 'HWY', HIGHWAY: 'HWY', PLZ: 'PLZ', PLAZA: 'PLZ', CIR: 'CIR', CIRCLE: 'CIR', TPKE: 'TPKE', TURNPIKE: 'TPKE', ALY: 'ALY', ALLEY: 'ALY', CRES: 'CRES', CRESCENT: 'CRES', WAY: 'WAY', LOOP: 'LOOP', SLIP: 'SLIP', WALK: 'WALK', ROW: 'ROW' };
const COMPASS = { N: 'N', NORTH: 'N', S: 'S', SOUTH: 'S', E: 'E', EAST: 'E', W: 'W', WEST: 'W' };
const WORDS = { SAINT: 'ST', BEACH: 'BCH', MOUNT: 'MT', FORT: 'FT', JUNIOR: 'JR', DOCTOR: 'DR', AVENUE: 'AVE', AV: 'AVE' };
// Streets with two names, as [what people say, what it is filed under].
const ALSO = [['AVE OF THE AMERICAS', '6 AVE'], ['AVE OF AMERICAS', '6 AVE'], ['LENOX AVE', 'MALCOLM X BLVD'], ['THE BOWERY', 'BOWERY'], ['CPW', 'CENTRAL PARK W'], ['QUEENSBORO BRG', 'ED KOCH QUEENSBORO BRG'], ['59 ST BRG', 'ED KOCH QUEENSBORO BRG'], ['FDR', 'FDR DR'], ['WEST SIDE HWY', 'WEST ST'], ['HOUSTON', 'HOUSTON ST']];
export const BOROUGH_NAMES = ['', 'Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island'];
const BOROUGH_WORDS = [[/\b(MANHATTAN|NEW YORK CITY|NEW YORK|NYC|NY)\s*$/, 1], [/\b(THE BRONX|BRONX|BX)\s*$/, 2], [/\b(BROOKLYN|BKLYN|BK)\s*$/, 3], [/\b(QUEENS|QNS)\s*$/, 4], [/\b(STATEN ISLAND|SI)\s*$/, 5]];

const TRADE_QUERIES = new Map(Object.entries({
  'Basketball Court': ['BASKETBALL', 'BASKETBALL COURT', 'BASKETBALL COURTS'],
  'Soccer Field': ['SOCCER', 'SOCCER FIELD', 'SOCCER FIELDS', 'SOCCER PITCH'],
  Club: ['CLUB', 'CLUBS', 'NIGHTCLUB', 'NIGHTCLUBS'], Pub: ['PUB', 'PUBS'], Bar: ['BAR', 'BARS'],
  'Copies and Shipping': ['COPY SHOP', 'PRINT SHOP'], Tailor: ['TAILOR', 'TAILORS'],
  'Auto Repair': ['AUTO REPAIR', 'REPAIR SHOP'], 'Auto Body': ['AUTO BODY', 'BODY SHOP'],
}).flatMap(([kind, queries]) => queries.map(query => [query, kind])));

const plain = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/['’`]/g, '').replace(/[^A-Z0-9&@/+]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Match the city's named arrival points, preserving their coordinates and travel options. */
export function matchPresets(query, presets, { exact = false } = {}) {
  const name = plain(query);
  if (!name) return [];
  const words = name.split(' ');
  return presets.filter(place => {
    if (exact) return plain(place.name) === name;
    const label = plain([place.name, place.borough, place.keywords].filter(Boolean).join(' '));
    return words.every(word => label.includes(word));
  }).sort((a,b) => Number(plain(b.name).startsWith(name)) - Number(plain(a.name).startsWith(name)));
}

/** Words as written to tokens with numbers as digits: "FIFTY THIRD" and "53RD" are both "53". */
function tokens(text) {
  const out = [];
  let number = null;
  const flush = () => { if (number !== null) { out.push(String(number)); number = null; } };
  for (const word of plain(text).split(' ').filter(Boolean)) {
    const ordinal = /^(\d+)(ST|ND|RD|TH)?$/.exec(word);
    if (ordinal) { flush(); out.push(String(Number(ordinal[1]))); continue; }
    if (word in TENS) { flush(); number = TENS[word]; continue; }
    if (word in UNITS) {
      // "TWENTY THIRD" is one number; "ONE HUNDRED TENTH" another.
      if (number !== null && number % 10 === 0 && number >= 20 && UNITS[word] < 10) { number += UNITS[word]; flush(); } else { flush(); number = UNITS[word]; flush(); }
      continue;
    }
    if (word === 'HUNDRED' || word === 'HUNDREDTH') { const last = out.pop(); out.push(String((Number(last) || 1) * 100)); continue; }
    flush();
    // "One hundred and twenty-fifth": the and is part of the number.
    if (word === 'AND' && /^\d00$/.test(out.at(-1) || '')) continue;
    out.push(WORDS[word] || word);
  }
  flush();
  // "100 10" from "one hundred tenth" is 110.
  for (let i = 0; i + 1 < out.length; i++) if (/^\d00$/.test(out[i]) && /^\d{1,2}$/.test(out[i + 1])) { out.splice(i, 2, String(Number(out[i]) + Number(out[i + 1]))); }
  return out;
}

/**
 * A street name in parts: { dir, core, suffix, key }. "West 53rd Street" is
 * { dir: 'W', core: '53', suffix: 'ST' }; "Avenue A" is { core: 'AVE A' }.
 */
export function parseStreet(text) {
  let words = tokens(text).filter(word => word !== 'AND');
  let joined = words.join(' ');
  for (const [said, filed] of ALSO) if (joined === said || joined === said.replace(/ (ST|AVE)$/, '')) { joined = filed; break; }
  words = joined.split(' ').filter(Boolean);
  let dir = '', suffix = '';
  // A leading compass point is a direction unless it is the whole name ("West St", "North Ave").
  if (words.length > 1 && COMPASS[words[0]] && !(words.length === 2 && SUFFIX[words[1]])) dir = COMPASS[words.shift()];
  if (words.length > 1 && SUFFIX[words.at(-1)] && words[0] !== 'AVE') suffix = SUFFIX[words.pop()];
  // "Avenue A", "Avenue of the Finest": the kind of street leads the name.
  const core = words.map((word, i) => i > 0 && COMPASS[word] ? COMPASS[word] : word).join(' ');
  return { dir, core, suffix, key: [dir, core, suffix].filter(Boolean).join(' ') };
}

const typo = (a, b) => {
  // One letter wrong, missing or extra, in names long enough for that to mean something.
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5 || /\d/.test(a + b)) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++edits > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** `roads` are the route planner's: each { name, borough, points }. */
export function createStreetIndex(roads = []) {
  const byCore = new Map(), names = new Map();
  roads.forEach((road, index) => {
    if (!road?.name || !Array.isArray(road.points) || road.points.length < 2) return;
    if (!names.has(road.name)) { const parsed = parseStreet(road.name); names.set(road.name, { ...parsed, name: road.name, roads: [] }); if (!byCore.has(parsed.core)) byCore.set(parsed.core, []); byCore.get(parsed.core).push(names.get(road.name)); }
    names.get(road.name).roads.push(index);
  });
  /** The streets a written name could mean, best first: [{ name, dir, core, suffix, roads, score }]. */
  function streets(text) {
    const asked = parseStreet(text);
    if (!asked.core) return [];
    const fits = entry => (!asked.dir || asked.dir === entry.dir) && (!asked.suffix || asked.suffix === entry.suffix);
    let found = (byCore.get(asked.core) || []).filter(fits).map(entry => ({ ...entry, score: 4 }));
    // A name begun but not finished ("malcolm" for Malcolm X Blvd), then one misspelt by a letter.
    if (!found.length && asked.core.length >= 4) for (const [core, list] of byCore) if (core.startsWith(`${asked.core} `) || core.endsWith(` ${asked.core}`)) found.push(...list.filter(fits).map(entry => ({ ...entry, score: 2 })));
    if (!found.length) for (const [core, list] of byCore) if (typo(core, asked.core)) found.push(...list.filter(fits).map(entry => ({ ...entry, score: 1 })));
    // With no kind given, "53rd" is the street or the avenue before it is the place or the drive.
    for (const entry of found) if (!asked.suffix && (entry.suffix === 'ST' || entry.suffix === 'AVE' || !entry.suffix)) entry.score += .5;
    return found.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  }
  const at = point => `${Math.round(point[0])},${Math.round(point[1])}`;
  /**
   * Where two streets meet: [{ x, z, name, borough, kind: 'corner' }], best
   * first. `borough` (1 to 5) keeps to one borough.
   */
  function corners(first, second, { borough = 0, limit = 6 } = {}) {
    const a = streets(first), b = streets(second), found = [];
    if (!a.length || !b.length) return found;
    const where = new Map();
    for (const entry of a) for (const index of entry.roads) { const road = roads[index]; if (borough && road.borough !== borough) continue; for (const point of road.points) { const key = at(point); if (!where.has(key)) where.set(key, { entry, road, point }); } }
    for (const entry of b) for (const index of entry.roads) {
      const road = roads[index];
      if (borough && road.borough !== borough) continue;
      for (const point of road.points) {
        const met = where.get(at(point));
        if (!met || met.entry.name === entry.name || met.road.borough !== road.borough) continue;
        // A divided avenue meets a street twice a few yards apart: once is enough.
        if (found.some(other => other.borough === BOROUGH_NAMES[road.borough] && Math.hypot(other.x - point[0], other.z - point[1]) < 90)) continue;
        found.push({ kind: 'corner', x: point[0], z: point[1], name: `${shown(met.entry.name)} & ${shown(entry.name)}`, borough: BOROUGH_NAMES[road.borough], order: road.borough, score: met.entry.score + entry.score });
      }
    }
    // Streets that cross without sharing a point on the map: one passing under the other, or a concourse with service roads.
    if (!found.length) {
      const size = 120, grid = new Map();
      for (const entry of a) for (const index of entry.roads) { const road = roads[index]; if (borough && road.borough !== borough) continue; for (let i = 1; i < road.points.length; i++) { const p = road.points[i - 1], q = road.points[i]; for (let gx = Math.floor(Math.min(p[0], q[0]) / size); gx <= Math.floor(Math.max(p[0], q[0]) / size); gx++) for (let gz = Math.floor(Math.min(p[1], q[1]) / size); gz <= Math.floor(Math.max(p[1], q[1]) / size); gz++) { const key = `${gx},${gz}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push({ entry, road, p, q }); } } }
      for (const entry of b) for (const index of entry.roads) {
        const road = roads[index];
        if (borough && road.borough !== borough) continue;
        for (let i = 1; i < road.points.length; i++) {
          const r = road.points[i - 1], t = road.points[i];
          for (let gx = Math.floor(Math.min(r[0], t[0]) / size); gx <= Math.floor(Math.max(r[0], t[0]) / size); gx++) for (let gz = Math.floor(Math.min(r[1], t[1]) / size); gz <= Math.floor(Math.max(r[1], t[1]) / size); gz++) for (const other of grid.get(`${gx},${gz}`) || []) {
            if (other.entry.name === entry.name || other.road.borough !== road.borough) continue;
            const { p, q } = other, d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
            if (Math.abs(d) < 1e-9) continue;
            const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d, v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            const x = p[0] + (q[0] - p[0]) * u, z = p[1] + (q[1] - p[1]) * u;
            if (found.some(seen => seen.borough === BOROUGH_NAMES[road.borough] && Math.hypot(seen.x - x, seen.z - z) < 90)) continue;
            found.push({ kind: 'corner', x, z, name: `${shown(other.entry.name)} & ${shown(entry.name)}`, borough: BOROUGH_NAMES[road.borough], order: road.borough, score: other.entry.score + entry.score });
          }
        }
      }
    }
    return found.sort((p, q) => q.score - p.score || p.order - q.order).slice(0, limit).map(({ order, score, ...corner }) => corner);
  }
  /** A street on its own: the middle of it in each borough it runs through. */
  function along(text, { borough = 0, limit = 3 } = {}) {
    const found = [];
    for (const entry of streets(text).filter(entry => entry.score >= 4)) {
      const groups = new Map();
      for (const index of entry.roads) { const road = roads[index]; if (borough && road.borough !== borough) continue; if (!groups.has(road.borough)) groups.set(road.borough, []); groups.get(road.borough).push(road); }
      for (const [which, list] of groups) {
        const middle = list.map(road => road.points[Math.floor(road.points.length / 2)]), cx = middle.reduce((sum, point) => sum + point[0], 0) / middle.length, cz = middle.reduce((sum, point) => sum + point[1], 0) / middle.length;
        const point = middle.reduce((best, candidate) => Math.hypot(candidate[0] - cx, candidate[1] - cz) < Math.hypot(best[0] - cx, best[1] - cz) ? candidate : best);
        found.push({ kind: 'street', x: point[0], z: point[1], name: shown(entry.name), borough: BOROUGH_NAMES[which], order: which, score: entry.score });
      }
    }
    return found.sort((p, q) => q.score - p.score || p.order - q.order).slice(0, limit).map(({ order, score, ...street }) => street);
  }
  return { streets, corners, along, count: names.size };
}

const LOWER = new Set(['OF', 'THE', 'AND']);
/** "W  53 ST" as it is read: "W 53 St". */
export const title = name => String(name).replace(/\s+/g, ' ').trim().split(' ').map((word, i) => /^\d/.test(word) || /^(N|S|E|W|FDR|BQE|LIE|JFK|NB|SB|EB|WB)$/.test(word) ? word : i > 0 && LOWER.has(word) ? word.toLowerCase() : word[0] + word.slice(1).toLowerCase()).join(' ');

// Sixth Avenue is filed under its official name in Manhattan; nobody calls it that.
const shown = name => title(name === 'AVE OF THE AMERICAS' ? '6 AVE' : name);

/**
 * What was typed, taken apart: the borough named at the end if any, and the
 * two streets if it reads as a corner ("53rd & 6th", "Broadway at Canal",
 * "5th ave / 42nd st").
 */
export function parseQuery(text) {
  let rest = plain(text), borough = 0;
  for (const [pattern, which] of BOROUGH_WORDS) { const cut = rest.replace(pattern, '').trim(); if (cut !== rest && cut) { rest = cut; borough = which; break; } }
  rest = rest.replace(/^(CORNER OF|THE CORNER OF|INTERSECTION OF)\s+/, '');
  const parts = rest.split(/\s+(?:AND|AT|&|@|\/|\+|X|BETWEEN|BTWN|BET)\s+|\s*[&@/+]\s*/).map(part => part.trim()).filter(Boolean);
  // "350 5th Ave" is a building; "5th Ave" is not.
  const numbered = /^\d+[A-Z]?(-\d+)?\s+\S/.test(rest) && !/^\d+(ST|ND|RD|TH)?\s+(ST|STREET|AVE|AV|AVENUE|RD|ROAD|PL|PLACE|DR|DRIVE|CT|LN)\b/.test(rest);
  return { text: rest, borough, corner: parts.length >= 2 ? [parts[0], parts[1]] : null, numbered };
}

/**
 * The names of the bundled places, for searching the whole city at once.
 * `data` is place-names.json: { kinds, places: [[name, x, z, kind, borough]] }.
 */
export function createPlaceIndex(data = null) {
  const places = (data?.places || []).map(([name, x, z, kind, borough]) => ({ name, x, z, kind: data.kinds[facilityIndex(kind, name, data.kinds)] || '', borough: BOROUGH_NAMES[borough] || '', order: borough, words: plain(name).split(' ') }));
  const facilities = {
    hospital: places.filter(place => place.kind === 'Hospital'),
    courthouse: places.filter(place => place.kind === 'Courthouse' && /\b(?:CRIM(?:INAL)?|DETENTION)\b/i.test(place.name)),
  };
  return {
    count: places.length,
    nearestRecovery(facility, point) {
      let nearest = null, distance = Infinity;
      for (const place of facilities[facility]) {
        const gap = Math.hypot(place.x - point.x, place.z - point.z);
        if (gap < distance) { nearest = place; distance = gap; }
      }
      return nearest;
    },
    /**
     * Places whose name holds every word typed (a word may be unfinished),
     * best first; among equals the nearest to `near` first.
     */
    search(text, { borough = 0, near = null, limit = 6 } = {}) {
      const asked = plain(text).split(' ').filter(word => word && !/^[&@/+]$/.test(word)), whole = asked.join(' ');
      if (!whole || whole.length < 2) return [];
      const kindQuery = TRADE_QUERIES.get(whole);
      const lifeTime = /^LIFE ?TIME(?: FITNESS)?$/.test(whole);
      const found = [];
      for (const place of places) {
        if (borough && place.order !== borough) continue;
        const name = place.words.join(' ');
        let score = 0;
        // The mapped clubs use both spellings, and some share a name with their café.
        if (kindQuery === place.kind) score = 5;
        else if (lifeTime && place.kind === 'Gym' && /^LIFE ?TIME(?: FITNESS)?$/.test(name)) score = 6;
        else if (name === whole) score = 5;
        else if (name.startsWith(`${whole} `)) score = 4;
        else if (asked.every((word, i) => place.words.some(own => own === word || (word.length >= (i === asked.length - 1 ? 2 : 3) && own.startsWith(word))))) score = name.startsWith(asked[0]) ? 3 : 2;
        else if (asked.length === 1 && place.words.some(own => typo(own, whole))) score = 1;
        if (score) found.push({ place, score, distance: near ? Math.hypot(place.x - near.x, place.z - near.z) : 0 });
      }
      found.sort((a, b) => b.score - a.score || a.distance - b.distance || a.place.name.length - b.place.name.length);
      return found.slice(0, limit).map(({ place }) => ({ kind: 'place', x: place.x, z: place.z, name: place.name, what: place.kind, borough: place.borough }));
    },
  };
}

/**
 * Everything the game itself can find for what was typed: corners first,
 * then, unless it reads as a building's address, businesses and whole streets.
 */
export function searchLocal(text, { streets = null, places = null, near = null, limit = 6 } = {}) {
  const query = parseQuery(text), found = [];
  if (query.corner && streets) found.push(...streets.corners(query.corner[0], query.corner[1], { borough: query.borough, limit }));
  if (!found.length && places) found.push(...places.search(query.text, { borough: query.borough, near, limit: query.numbered ? 3 : limit }));
  if (!query.corner && !query.numbered && streets) found.push(...streets.along(query.text, { borough: query.borough }));
  return found.slice(0, limit);
}
