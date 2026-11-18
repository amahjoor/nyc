// What is where, on the street map: the bundled places drawn by kind.
//
// Zoomed out, the map shows where a kind of place gathers: one disc for each
// square of ground, as big as the number of such places in it. Zoomed in,
// each place is a dot in its kind's colour, and closer still, named. The
// places are those of place-names.json (scripts/build-place-search.mjs):
// every named place in the registers and from OpenStreetMap.
import { KINDS } from './places.js';

/** The kinds of place the map can show, each a set of kinds or groups from places.js and a colour. */
export const MAP_CATEGORIES = [
  { id: 'eat', label: 'RESTAURANTS', colour: '#ff794f', groups: ['food', 'dining'] },
  { id: 'coffee', label: 'COFFEE & BAKERIES', colour: '#c89b6a', groups: ['cafe'] },
  { id: 'grocery', label: 'DELIS & GROCERIES', colour: '#f2c230', groups: ['bodega', 'market'] },
  { id: 'drinks', label: 'BARS & LIQUOR', colour: '#b070ff', groups: ['bar', 'liquor'] },
  { id: 'barber', label: 'BARBERS', colour: '#4fd0ff', kinds: ['barber'] },
  { id: 'beauty', label: 'HAIR & NAILS', colour: '#ff6fb5', groups: ['beauty'] },
  { id: 'clothes', label: 'CLOTHES & SHOES', colour: '#e8e2d0', kinds: ['clothes', 'shoes', 'department', 'bags', 'jewelry', 'tailor', 'cosmetics', 'sports'] },
  { id: 'bank', label: 'BANKS', colour: '#5fa8ff', kinds: ['bank'] },
  { id: 'laundry', label: 'LAUNDRY', colour: '#9fe0e0', kinds: ['laundromat', 'cleaners'] },
  { id: 'health', label: 'PHARMACY & HEALTH', colour: '#6fd68a', kinds: ['pharmacy', 'clinic', 'dentist', 'vet', 'optician', 'hospital'] },
  { id: 'cars', label: 'GARAGES & PARKING', colour: '#a2a4a0', groups: ['auto'] },
  { id: 'stay', label: 'HOTELS & SHOWS', colour: '#ffd27a', groups: ['hotel'] },
  { id: 'public', label: 'SCHOOLS & PUBLIC', colour: '#8fa0ff', groups: ['public'] },
  { id: 'shops', label: 'OTHER SHOPS', colour: '#d0d9d5', groups: ['shop', 'stand'] },
];
// Each kind of place belongs to the first category that names it, or its group.
const CATEGORY_OF = KINDS.map(kind => { const found = MAP_CATEGORIES.findIndex(category => category.kinds?.includes(kind.id)); return found >= 0 ? found : MAP_CATEGORIES.findIndex(category => category.groups?.includes(kind.group)); });
/** The category a kind of place is shown under, by the kind's id. */
export const categoryOf = kind => { const index = KINDS.findIndex(entry => entry.id === kind); return index >= 0 && CATEGORY_OF[index] >= 0 ? MAP_CATEGORIES[CATEGORY_OF[index]].id : null; };

const CELL = 250;
/** `data` is place-names.json: { kinds, places: [[name, x, z, kind, borough]] }. */
export function createPlaceLayer(data = null) {
  const grid = new Map(), totals = new Array(MAP_CATEGORIES.length).fill(0), places = [];
  for (const [name, x, z, kind] of data?.places || []) {
    const category = CATEGORY_OF[kind];
    if (category === undefined || category < 0) continue;
    const place = { name, x, z, kind: data.kinds[kind] || '', category };
    places.push(place); totals[category]++;
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(place);
  }
  const wanted = categories => { const list = categories ? [...categories] : MAP_CATEGORIES.map(category => category.id); return MAP_CATEGORIES.map(category => list.includes(category.id)); };
  const each = (bounds, visit) => {
    for (let gx = Math.floor(bounds.minX / CELL); gx <= Math.floor(bounds.maxX / CELL); gx++) for (let gz = Math.floor(bounds.minZ / CELL); gz <= Math.floor(bounds.maxZ / CELL); gz++) {
      for (const place of grid.get(`${gx},${gz}`) || []) if (place.x >= bounds.minX && place.x <= bounds.maxX && place.z >= bounds.minZ && place.z <= bounds.maxZ) visit(place);
    }
  };
  return {
    count: places.length,
    /** How many places of each category there are in the whole city, by category id. */
    get totals() { return Object.fromEntries(MAP_CATEGORIES.map((category, i) => [category.id, totals[i]])); },
    /** How many of each category lie within `bounds` ({ minX, maxX, minZ, maxZ }). */
    counts(bounds) { const counted = new Array(MAP_CATEGORIES.length).fill(0); each(bounds, place => { counted[place.category]++; }); return Object.fromEntries(MAP_CATEGORIES.map((category, i) => [category.id, counted[i]])); },
    /** The places of the chosen categories within `bounds`, at most `limit`, as { name, x, z, kind, category }. */
    within(bounds, categories = null, limit = 4000) {
      const show = wanted(categories), found = [];
      each(bounds, place => { if (show[place.category] && found.length < limit) found.push({ ...place, category: MAP_CATEGORIES[place.category].id }); });
      return found;
    },
    /**
     * The same places gathered into squares `size` metres across: one
     * { x, z, count, category } per square that holds any, placed at the
     * middle of its places and coloured by the commonest category in it.
     */
    gathered(bounds, size, categories = null) {
      const show = wanted(categories), squares = new Map();
      each(bounds, place => {
        if (!show[place.category]) return;
        const key = `${Math.floor(place.x / size)},${Math.floor(place.z / size)}`;
        let square = squares.get(key);
        if (!square) squares.set(key, square = { x: 0, z: 0, count: 0, by: new Array(MAP_CATEGORIES.length).fill(0) });
        square.x += place.x; square.z += place.z; square.count++; square.by[place.category]++;
      });
      return [...squares.values()].map(square => ({ x: square.x / square.count, z: square.z / square.count, count: square.count, category: MAP_CATEGORIES[square.by.indexOf(Math.max(...square.by))].id }));
    },
    /** The place of the chosen categories nearest `point`, within `radius` metres, or null. */
    nearest(point, radius = 40, categories = null) {
      const show = wanted(categories);
      let best = null, distance = radius;
      each({ minX: point.x - radius, maxX: point.x + radius, minZ: point.z - radius, maxZ: point.z + radius }, place => { const d = Math.hypot(place.x - point.x, place.z - point.z); if (show[place.category] && d <= distance) { distance = d; best = place; } });
      return best ? { ...best, category: MAP_CATEGORIES[best.category].id, distance } : null;
    },
  };
}

const COLOUR = Object.fromEntries(MAP_CATEGORIES.map(category => [category.id, category.colour]));
/**
 * What to draw for a view of the map: `view` is the street map's
 * { x, z, span, width, height } (span is the metres across its width).
 * Wide views get discs for squares of ground; close views get each place,
 * and the closest get names.
 * @returns {{mode: 'gathered' | 'places', marks: {px, py, radius, colour, label, count}[]}}
 */
export function placeMarks(layer, view, categories = null) {
  const scale = view.width / view.span, halfZ = view.span * view.height / view.width / 2;
  const bounds = { minX: view.x - view.span / 2, maxX: view.x + view.span / 2, minZ: view.z - halfZ, maxZ: view.z + halfZ };
  const at = place => ({ px: (place.x - view.x) * scale + view.width / 2, py: (place.z - view.z) * scale + view.height / 2 });
  if (view.span > 1400) {
    // About forty squares across the map, never finer than the grid the places are kept in.
    const size = Math.max(CELL, Math.ceil(view.span / 40 / CELL) * CELL), squares = layer.gathered(bounds, size, categories), most = squares.reduce((max, square) => Math.max(max, square.count), 1);
    return { mode: 'gathered', marks: squares.map(square => ({ ...at(square), radius: Math.max(2, Math.sqrt(square.count / most) * size * scale * .55), colour: COLOUR[square.category], label: '', count: square.count })) };
  }
  const named = view.span <= 450;
  return { mode: 'places', marks: layer.within(bounds, categories, 2500).map(place => ({ ...at(place), radius: named ? 4 : 3, colour: COLOUR[place.category], label: named ? place.name : '', count: 1 })) };
}

/** Draw placeMarks() on a 2D canvas context. */
export function drawPlaceMarks(context, { mode, marks }) {
  context.save();
  for (const mark of marks) {
    context.globalAlpha = mode === 'gathered' ? .55 : .95; context.fillStyle = mark.colour;
    context.beginPath(); context.arc(mark.px, mark.py, mark.radius, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1; context.font = '600 10px "Barlow Condensed", Arial, sans-serif'; context.textBaseline = 'middle';
  // Names are written where there is room: one that would run over another already written is left out.
  const written = [];
  for (const mark of marks) {
    if (!mark.label) continue;
    const width = context.measureText(mark.label).width, box = { x: mark.px + 7, y: mark.py - 6, w: width, h: 12 };
    if (written.some(other => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y)) continue;
    written.push(box); context.fillStyle = '#0d1113cc'; context.fillRect(box.x - 2, box.y, box.w + 4, box.h); context.fillStyle = mark.colour; context.fillText(mark.label, box.x, mark.py);
  }
  context.restore();
}
