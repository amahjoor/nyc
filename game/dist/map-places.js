// What is where, on the street map: the bundled places drawn by kind.
//
// Each enabled place keeps its geographic position at every zoom level.
import { punMode } from './business-puns.js';
import { aliasForPlace, KIND, KINDS, facilityIndex, isOpen } from './places.js';

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
  { id: 'courts', label: 'COURTS & FIELDS', colour: '#72c69c', labels: ['Basketball Court', 'Soccer Field'] },
  { id: 'subway', label: 'SUBWAY STATIONS', colour: '#f49aad', labels: ['Subway Station'] },
  // Not a kind of business: the city's individual landmarks, by name (landmarks.json).
  { id: 'landmark', label: 'LANDMARKS', colour: '#ffffff', labels: ['Landmark'] },
];
// Each kind of place belongs to the first category that names it, or its group.
const CATEGORY_OF = KINDS.map(kind => { const found = MAP_CATEGORIES.findIndex(category => category.kinds?.includes(kind.id)); return found >= 0 ? found : MAP_CATEGORIES.findIndex(category => category.groups?.includes(kind.group)); });
/** The category a kind of place is shown under, by the kind's id. */
export const categoryOf = kind => { const index = KINDS.findIndex(entry => entry.id === kind); return index >= 0 && CATEGORY_OF[index] >= 0 ? MAP_CATEGORIES[CATEGORY_OF[index]].id : null; };

const CATEGORY_BY_LABEL = new Map(MAP_CATEGORIES.flatMap((category, i) => (category.labels || []).map(label => [label, i])));
const CELL = 250;
const cellAt = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
/** `data` is place-names.json: { kinds, places: [[name, x, z, kind, borough]] }. */
export function createPlaceLayer(data = null) {
  const members = new Map(MAP_CATEGORIES.map(category => [category.id, []]));
  const grid = new Map();
  let doors = null, linked = [], localOnly = [], merged = new Map();
  let count = 0;
  for (const [raw, x, z, recorded] of data?.places || []) {
    const kind = facilityIndex(recorded, raw, data.kinds);
    const label = data.kinds[kind];
    const category = CATEGORY_BY_LABEL.get(label) ?? CATEGORY_OF[kind];
    if (category === undefined || category < 0) continue;
    const kindId = CATEGORY_BY_LABEL.has(label) ? MAP_CATEGORIES[category].id : KINDS[kind]?.id;
    const name = punMode && KINDS[kind]?.label === label ? aliasForPlace(raw,KINDS[kind],x,z) : raw;
    const place = { name, x, z, kind: label || '', kindId, category };
    count++;
    members.get(MAP_CATEGORIES[category].id).push(place);
    const key = cellAt(x, z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(place);
  }
  const wanted = categories => { const list = categories ? [...categories] : MAP_CATEGORIES.map(category => category.id); return MAP_CATEGORIES.map(category => list.includes(category.id)); };
  const each = (bounds, visit) => {
    const visible = place => place.x >= bounds.minX && place.x <= bounds.maxX && place.z >= bounds.minZ && place.z <= bounds.maxZ;
    for (let gx = Math.floor(bounds.minX / CELL); gx <= Math.floor(bounds.maxX / CELL); gx++) for (let gz = Math.floor(bounds.minZ / CELL); gz <= Math.floor(bounds.maxZ / CELL); gz++) {
      for (const place of grid.get(`${gx},${gz}`) || []) if (visible(place)) visit(place);
    }
    for (const place of localOnly) if (visible(place)) visit(place);
  };
  const forEachWithin = (bounds, categories, visit) => {
    const show = wanted(categories);
    each(bounds, place => { if (show[place.category]) visit(place, MAP_CATEGORIES[place.category].id); });
  };
  return {
    get count() { return count + localOnly.length; },
    members(id) { return merged.get(id) || members.get(id) || []; },
    /** Attach real entrances to catalog locations and retain doors absent from the catalog. */
    setDoors(blips) {
      if (blips === doors) return false;
      doors = blips;
      for (const place of linked) delete place.door;
      linked = [];localOnly = [];merged = new Map();
      for (const door of blips) {
        // Subway stations already use mapped entrances from the citywide station list.
        const category = CATEGORY_OF[KIND[door.kind]?.index];
        if (category == null || category < 0) continue;
        // Both datasets carry the same original survey coordinates, even when
        // the walk-in entrance itself is on a different side of the building.
        const catalogPlace = grid.get(cellAt(door.sourceX, door.sourceZ))?.find(place =>
          place.x === door.sourceX && place.z === door.sourceZ && place.name === door.name && place.kind === door.what);
        if (catalogPlace) {
          catalogPlace.door = door;
          linked.push(catalogPlace);
        } else {
          const place = { x: door.x, z: door.z, name: door.name, kind: door.what, kindId: door.kind, category, door };
          const id = MAP_CATEGORIES[category].id;
          if (!merged.has(id)) merged.set(id, [...members.get(id)]);
          merged.get(id).push(place);
          localOnly.push(place);
        }
      }
      return true;
    },
    /** How many places of each category there are in the whole city, by category id. */
    get totals() { return Object.fromEntries([...members].map(([id, places]) => [id, (merged.get(id) || places).length])); },
    /** How many of each category lie within `bounds` ({ minX, maxX, minZ, maxZ }). */
    counts(bounds) { const counted = new Array(MAP_CATEGORIES.length).fill(0); each(bounds, place => { counted[place.category]++; }); return Object.fromEntries(MAP_CATEGORIES.map((category, i) => [category.id, counted[i]])); },
    /** The places of the chosen categories within `bounds`, at most `limit`, as { name, x, z, kind, category }. */
    within(bounds, categories = null, limit = 4000) {
      const found = [];
      forEachWithin(bounds, categories, (place, category) => { if (found.length < limit) found.push({ ...place, category }); });
      return found;
    },
    forEachWithin,
    /**
     * The same places gathered into squares `size` metres across: one
     * { x, z, count, category } for each category in each square that holds
     * any of it, placed at the middle of those places.
     */
    gathered(bounds, size, categories = null) {
      const show = wanted(categories), squares = new Map();
      each(bounds, place => {
        if (!show[place.category]) return;
        const key = `${Math.floor(place.x / size)},${Math.floor(place.z / size)},${place.category}`;
        let square = squares.get(key);
        if (!square) squares.set(key, square = { x: 0, z: 0, count: 0, category: place.category });
        square.x += place.x; square.z += place.z; square.count++;
      });
      return [...squares.values()].map(square => ({ x: square.x / square.count, z: square.z / square.count, count: square.count, category: MAP_CATEGORIES[square.category].id }));
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
export const markerScale = span => Math.min(1, Math.sqrt(1400 / span));
export const PLACE_BADGE_SPAN = 1000;
/** Individual locations in the visible bounds, with smaller dots beyond street zoom. */
export function placeMarks(layer, view, categories = null, hours = 12) {
  const scale = view.width / view.span, halfZ = view.span * view.height / view.width / 2;
  const bounds = { minX: view.x - view.span / 2, maxX: view.x + view.span / 2, minZ: view.z - halfZ, maxZ: view.z + halfZ };
  const named = view.span <= 700;
  const detailed = view.span <= PLACE_BADGE_SPAN;
  const radius = named ? 4 : Math.max(1, 3 * markerScale(view.span));
  const marks = [];
  layer.forEachWithin(bounds, categories, (place, category) => {
    const shut = place.door && (place.door.closed || !isOpen(place.door.kind, hours));
    const mark = {
      px: (place.x - view.x) * scale + view.width / 2,
      py: (place.z - view.z) * scale + view.height / 2,
      radius, colour: COLOUR[category], open: !shut, label: named ? place.name : '', count: 1,
    };
    if (detailed) mark.place = place;
    marks.push(mark);
  });
  return { mode: 'places', marks };
}

/** Draw placeMarks() on a 2D canvas context. */
export function drawPlaceMarks(context, { marks }) {
  if (!marks.length) return;
  context.save();
  const batches = new Map();
  for (const mark of marks) {
    const key = mark.colour + '/' + mark.open;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mark);
  }
  for (const batch of batches.values()) {
    context.globalAlpha = batch[0].open ? .95 : .42;context.fillStyle = batch[0].colour;
    context.beginPath();
    for (const mark of batch) {
      context.moveTo(mark.px + mark.radius, mark.py);
      context.arc(mark.px, mark.py, mark.radius, 0, Math.PI * 2);
    }
    context.fill();
  }
  context.globalAlpha = 1; context.font = '600 10px "Chalet Menu", Jost, Arial, sans-serif'; context.textBaseline = 'middle'; context.textAlign = 'left';
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
