// The marks for doors on the map.
//
// A place the player can walk into shows on the radar and the street map as a
// small badge with a picture of its trade: a slice for a pizzeria, scissors
// for a barber, a bed for a hotel. The badge takes the colour its kind of
// place has among the map's chips (map-places.js), and goes dim while the
// place is shut. Where doors stand closer than badges can, the rarer trade is
// the one shown, so a street of restaurants does not hide its one locksmith.
//
// This module is the pictures, which trade gets which, and the drawing. Which
// fronts have a room behind them is the caller's to say (interiors.js).
import { KIND, isOpen, placeName } from './places.js';
import { MAP_CATEGORIES, categoryOf } from './map-places.js';

const dot = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
/**
 * Each picture is drawn in a box 24 across, in steps: a plain step is a path
 * filled, '-' in front cuts it out of what is there, '~' draws it as a line
 * two wide and '-~' cuts such a line. They are listed with the trades worth
 * showing first: where two badges would overlap, the earlier one stays.
 */
export const BLIPS = [
  ['subway', 'Subway', ['M5 2.5h14q2.5 0 2.5 2.5v10.5q0 2.5-2.5 2.5h-14q-2.5 0-2.5-2.5v-10.5q0-2.5 2.5-2.5Z', '-M5.5 5.5h13v6h-13Z', '-' + dot(7.5, 14.8, 1.3), '-' + dot(16.5, 14.8, 1.3), 'M6.5 18.5h3l-2 3.5h-3ZM17.5 18.5h-3l2 3.5h3Z']],
  ['police', 'Police', ['M12 2l8.5 3v6.5q0 6.5-8.5 10.5q-8.5-4-8.5-10.5v-6.5Z', '-M12 6l1.5 3.4l3.7.4l-2.8 2.5l.8 3.7l-3.2-1.9l-3.2 1.9l.8-3.7l-2.8-2.5l3.7-.4Z']],
  ['fire', 'Firehouse', ['M12.5 2q1 4.5 4.3 7.5q3 3 3 6.3a7.6 7.6 0 0 1-15.2 0q0-3 2.5-5.6q.5 2.5 2 3q-1-6 3.4-11.2Z', '-M12 13.5q3 2.6 3 4.7a3 3 0 0 1-6 0q0-2.2 3-4.7Z']],
  ['clinic', 'Doctor', ['M5 3h14q2 0 2 2v14q0 2-2 2h-14q-2 0-2-2v-14q0-2 2-2Z', '-M10 6.5h4v3.5h3.5v4h-3.5v3.5h-4v-3.5h-3.5v-4h3.5Z']],
  ['bank', 'Bank', ['M2 6h20v12h-20Z', '-' + dot(12, 12, 3.2), '-' + dot(5.5, 12, 1.2), '-' + dot(18.5, 12, 1.2)]],
  ['bed', 'Hotel', ['M2 5h2.6v8h17.4v8h-2.6v-3h-14.8v3h-2.6Z', dot(7.6, 9.6, 2.3), 'M11.2 8h7.3q3.5 0 3.5 3.5v.7h-10.8Z']],
  ['ticket', 'Cinema & theatre', ['M2 6.5h20v3.7a1.8 1.8 0 0 0 0 3.6v3.7h-20v-3.7a1.8 1.8 0 0 0 0-3.6Z', '-M15 8h1.3v2h-1.3ZM15 11h1.3v2h-1.3ZM15 14h1.3v2h-1.3Z']],
  ['civic', 'Museum & court', ['M12 2.5l10 5.5v2h-20v-2Z', 'M4.5 11.5h3v6.5h-3ZM10.5 11.5h3v6.5h-3ZM16.5 11.5h3v6.5h-3Z', 'M2.5 19h19v2.5h-19Z']],
  ['school', 'School', ['M12 4l11 5.5l-11 5.5l-11-5.5Z', 'M6 13.6v4.2q6 4 12 0v-4.2l-6 3Z', 'M20.4 10.6h1.4v6h-1.4Z']],
  ['mail', 'Post & copies', ['M2.5 5h19v14h-19Z', '-~M3.5 6.5l8.5 6.5l8.5-6.5']],
  ['gym', 'Gym & sport', ['M6 10.8h12v2.4h-12Z', 'M3.6 6.5h3.2v11h-3.2ZM17.2 6.5h3.2v11h-3.2Z', 'M1.4 9.5h2.2v5h-2.2ZM20.4 9.5h2.2v5h-2.2Z']],
  ['pharmacy', 'Pharmacy', ['M9 3h6v6h6v6h-6v6h-6v-6h-6v-6h6Z']],
  ['gem', 'Jeweller', ['M7.2 4h9.6l3.7 4.5h-17Z', 'M3.2 10.3h17.6l-8.8 10.9Z']],
  ['pawn', 'Pawnbroker', [dot(12, 6.2, 3.4), dot(6.3, 15.8, 3.4), dot(17.7, 15.8, 3.4), '~M6.3 12.4q5.7-9 11.4 0']],
  ['glasses', 'Optician', ['~' + dot(6.8, 13.5, 3.7), '~' + dot(17.2, 13.5, 3.7), '~M10.5 13q1.5-1.6 3 0', '~M3.2 12l-1.2-4.5M20.8 12l1.2-4.5']],
  ['tattoo', 'Tattoo', ['M12 21.5l-8-8.7q-3-4.2.5-7.5q3.6-2.6 7.5 1.4q3.9-4 7.5-1.4q3.5 3.3.5 7.5Z', '-M2 14.5l20-5v2.6l-20 5Z']],
  ['bike', 'Bicycles', ['~' + dot(5.8, 16, 3.8), '~' + dot(18.2, 16, 3.8), '~M5.8 16l3.7-7.5h6l2.7 7.5M9.5 8.5l3 7.5l3-7.5M7.8 6h3.4M15.5 8.5l-.8-2.7h2.6']],
  ['note', 'Music', ['M9 5l11.5-2.2v12.8h-2.2v-8.1l-7.1 1.4v9.3h-2.2Z', dot(7.3, 18.2, 2.9), dot(16.6, 15.8, 2.9)]],
  ['flower', 'Florist', [dot(12, 5.2, 3.1), dot(16.6, 8.5, 3.1), dot(14.8, 13.8, 3.1), dot(9.2, 13.8, 3.1), dot(7.4, 8.5, 3.1), '-' + dot(12, 9.9, 2), 'M11 16h2v6.5h-2Z']],
  ['paw', 'Pets & vet', ['M12 11.8q4.6 0 6 4.2q1 3.6-2 4.1q-2 .3-4-.7q-2 1-4 .7q-3-.5-2-4.1q1.4-4.2 6-4.2Z', dot(5.6, 10.6, 2), dot(9.4, 5.9, 2.1), dot(14.6, 5.9, 2.1), dot(18.4, 10.6, 2)]],
  ['hammer', 'Hardware', ['M3.6 18.4l8.6-8.6l2 2l-8.6 8.6Z', 'M9.3 6.9l3.4-3.4l7.8 7.8l-3.4 3.4Z']],
  ['tv', 'Electronics', ['M2.5 4h19v12.5h-19Z', '-M4.7 6.2h14.6v8.1h-14.6Z', 'M9.8 7.4l5.2 2.85l-5.2 2.85Z', 'M11 16.5h2v2.5h-2ZM7.5 19h9v2h-9Z']],
  ['phone', 'Phones', ['M7.5 2h9q1.6 0 1.6 1.6v16.8q0 1.6-1.6 1.6h-9q-1.6 0-1.6-1.6v-16.8q0-1.6 1.6-1.6Z', '-M8.1 5h7.8v11.8h-7.8Z', '-' + dot(12, 19.3, 1)]],
  ['book', 'Books', ['M2.5 5q5-1.6 8.6 1v14q-3.6-2.6-8.6-1ZM21.5 5q-5-1.6-8.6 1v14q3.6-2.6 8.6-1Z']],
  ['pencil', 'Paper & art', ['M4 20.5l1.3-5.4l11.2-11.2q1-1 2 0l1.9 1.9q1 1 0 2l-11.2 11.2Z', '-M14.4 6.4l3.4 3.4l-.9.9l-3.4-3.4Z']],
  ['gift', 'Toys & gifts', ['M3 8h18v4h-18ZM4.5 13h15v8.5h-15Z', '-M11 8h2v13.5h-2Z', '~M12 7.6q-5-6-6.2-2.2q0 2.2 6.2 2.2q6.2 0 6.2-2.2q-1.2-3.8-6.2 2.2']],
  ['chair', 'Furniture', ['M6.5 4.5h11q2 0 2 2v6h-15v-6q0-2 2-2Z', 'M1.8 11.2q0-1.7 1.7-1.7q1.7 0 1.7 1.7v2.6h13.6v-2.6q0-1.7 1.7-1.7q1.7 0 1.7 1.7v7.3h-20.4Z', 'M3.8 18.5h2.6v2.5h-2.6ZM17.6 18.5h2.6v2.5h-2.6Z', '-M6 12.6h12v.9h-12Z']],
  ['case', 'Luggage & travel', ['M3 8h18v12.5h-18Z', '~M9 8v-3.2h6v3.2', '-M3 13h18v1.4h-18Z']],
  ['shoes', 'Shoes', ['M2.5 7.5h5.5l3 4.3q5 1.6 8.2 2.6q2.3.9 2.3 3.2v1.9h-19Z', '-M2.5 16.6h19v1.1h-19Z']],
  ['clothes', 'Clothes', ['M8 3q4 3.2 8 0l5.6 3l-2.6 4.6l-2.5-1.2v11.6h-9v-11.6l-2.5 1.2l-2.6-4.6Z']],
  ['bag', 'Department store', ['M4.6 8h14.8l1.3 13.5h-17.4Z', '~M8.6 10.5v-3.5a3.4 3.4 0 0 1 6.8 0v3.5']],
  ['hanger', 'Tailor & cleaners', ['~M12 9.5v-1.8a2.3 2.3 0 1 0-2.3-2.3', '~M12 9.5l9 7q1 1.8-1 1.8h-16q-2 0-1-1.8Z']],
  ['laundry', 'Laundromat', ['M4 2.5h16q1.5 0 1.5 1.5v16q0 1.5-1.5 1.5h-16q-1.5 0-1.5-1.5v-16q0-1.5 1.5-1.5Z', '-' + dot(12, 13.6, 5.2), dot(12, 13.6, 3), '-' + dot(6.3, 5.5, 1) + dot(9.6, 5.5, 1)]],
  ['tag', 'Discount & second hand', ['M3 3h8.6l10.4 10.4l-8.6 8.6l-10.4-10.4Z', '-' + dot(7.4, 7.4, 1.8)]],
  ['leaf', 'Dispensary', ['M12 2.5q7.2 6 4.2 13q-1.5 3-4.2 3.6q-2.7-.6-4.2-3.6q-3-7 4.2-13Z', 'M11.1 18h1.8v4h-1.8Z', '-M11.6 7h.8v11.5h-.8Z']],
  ['smoke', 'Smoke shop', ['M2 14h14v3.6h-14ZM17.4 14h1.7v3.6h-1.7ZM20.4 14h1.7v3.6h-1.7Z', '~M19.4 11q0-2-2-2.5q-2.6-.6-2.6-3.6']],
  ['comb', 'Hair salon', ['M2.5 5h19v5h-19Z', 'M3.4 10h1.5v9h-1.5ZM6.1 10h1.5v9h-1.5ZM8.8 10h1.5v9h-1.5ZM11.5 10h1.5v9h-1.5ZM14.2 10h1.5v9h-1.5ZM16.9 10h1.5v9h-1.5ZM19.6 10h1.5v9h-1.5Z']],
  ['scissors', 'Barber', ['M7.4 14.4l7.8-12q1.7 1.6 1 3.7l-6 9.9ZM16.6 14.4l-7.8-12q-1.7 1.6-1 3.7l6 9.9Z', dot(7, 17.8, 3.4), dot(17, 17.8, 3.4), '-' + dot(7, 17.8, 1.5) + dot(17, 17.8, 1.5)]],
  ['nails', 'Nails & beauty', ['M9.6 2h4.8v8h-4.8Z', 'M7 11h10q2 0 2 2v7q0 2-2 2h-10q-2 0-2-2v-7q0-2 2-2Z', '-M8 14h8v5h-8Z']],
  ['liquor', 'Wine & liquor', ['M10 2h4v5q3.2 1.6 3.2 5.2v8.3q0 1.5-1.5 1.5h-7.4q-1.5 0-1.5-1.5v-8.3q0-3.6 3.2-5.2Z', '-M8.6 13h6.8v5h-6.8Z']],
  ['bar', 'Bar', ['M3.4 4h17.2l-7.4 8.6v6.4h3.4v2.2h-9.2v-2.2h3.4v-6.4Z']],
  ['butcher', 'Butcher', [dot(9.6, 9.6, 6.6), 'M12.6 14.8l2.2-2.2l4.6 4.6l-2.2 2.2Z', dot(19.6, 17.4, 1.9), dot(17.4, 19.6, 1.9)]],
  ['fish', 'Fish', ['M2.5 12q5.2-7 12.4-4.2q2.2 1 3.4 2.8l3.7-3.6v10l-3.7-3.6q-1.2 1.8-3.4 2.8q-7.2 2.8-12.4-4.2Z', '-' + dot(7.4, 11, 1.1)]],
  ['market', 'Grocery', ['M2 4h3.6l.7 2.6h14.9l-2.5 8.6h-10.7l-2.6-9h-3.4Z', dot(9, 19, 1.8), dot(17, 19, 1.8)]],
  ['bodega', 'Deli grocery', ['M2.5 9.5h19l-2.2 11.5h-14.6Z', '~M7.5 9.5l3-6M16.5 9.5l-3-6', '-M8.2 12.5h1.5v5.5h-1.5ZM11.25 12.5h1.5v5.5h-1.5ZM14.3 12.5h1.5v5.5h-1.5Z']],
  ['coffee', 'Coffee', ['M4 9h13v6q0 5.5-5 5.5h-3q-5 0-5-5.5Z', '~M17.5 10.5h1q2.6 0 2.6 2.6q0 2.6-2.6 2.6h-1', 'M7.2 3h1.7q1.2 2-.2 4.5h-1.7q1.4-2.5.2-4.5ZM11.4 3h1.7q1.2 2-.2 4.5h-1.7q1.4-2.5.2-4.5Z']],
  ['bakery', 'Bakery', ['M4 10q0-5.2 4.2-5.2h7.6q4.2 0 4.2 5.2q0 1.6-1.6 2v7.5h-12.8v-7.5q-1.6-.4-1.6-2Z', '-M8 7.2l1.3.6l-1.6 3.4l-1.3-.6ZM11.6 7.2l1.3.6l-1.6 3.4l-1.3-.6ZM15.2 7.2l1.3.6l-1.6 3.4l-1.3-.6Z']],
  ['icecream', 'Ice cream', ['M6.3 9.5a5.7 5.7 0 0 1 11.4 0Z', 'M7 11h10l-5 11.5Z']],
  ['pizza', 'Pizza', ['M2.8 6.2q9.2-5.4 18.4 0l-9.2 16.3Z', '-M4.6 7.6q7.4-3.8 14.8 0l-.5.9q-6.9-3.4-13.8 0Z', '-' + dot(12, 11.3, 1.5) + dot(9.6, 14.2, 1.1) + dot(13.3, 16.2, 1.2)]],
  ['burger', 'Burgers & chicken', ['M3.6 10.6q0-6.8 8.4-6.8q8.4 0 8.4 6.8Z', 'M2.8 12.2h18.4v3h-18.4Z', 'M3.6 16.8h16.8v1.4q0 2.6-2.6 2.6h-11.6q-2.6 0-2.6-2.6Z']],
  ['noodles', 'Noodles & sushi', ['M2.8 11h18.4q0 7.2-6 9.4h-6.4q-6-2.2-6-9.4Z', 'M8.6 9.4l10.2-7.2l.9 1.3l-8.4 5.9ZM13.2 9.4l7.9-4.6l.8 1.4l-5.6 3.2Z']],
  ['eat', 'Restaurant', ['M5 3h1.5v6h1v-6h1.5v6h1v-6h1.5v7.5q0 2-2.1 2.4v8.1h-2.8v-8.1q-2.1-.4-2.1-2.4Z', 'M15 3q4.4 1 4.4 9h-1.6v9h-2.8Z']],
  ['car', 'Garage', ['M4.8 10l1.9-5q.4-1 1.5-1h7.6q1.1 0 1.5 1l1.9 5q2 .5 2 2.6v5.4h-2.6v-2h-13.2v2h-2.6v-5.4q0-2.1 2-2.6Z', '-M7.3 9.6l1.2-3.4h7l1.2 3.4Z', '-' + dot(6.6, 13.3, 1.2) + dot(17.4, 13.3, 1.2)]],
  ['shop', 'Shop', ['M4 3h16l2 6.5h-20Z', 'M4 11h16v10.5h-16Z', '-M13.2 14h4v7.5h-4ZM6.4 14h4.6v4h-4.6Z']],
].map(([id, label, steps], rank) => ({ id, label, steps, rank }));
/** A badge by its id. */
export const BLIP = Object.fromEntries(BLIPS.map(blip => [blip.id, blip]));

// Which picture each kind of place takes (places.js); a kind not named here is a shop.
const PICTURE = {
  pizza: 'pizza', chinese: 'noodles', japanese: 'noodles', korean: 'noodles', thai: 'noodles', asian: 'noodles', coffee: 'coffee', juice: 'coffee', bakery: 'bakery', donuts: 'bakery', bagels: 'bakery', icecream: 'icecream',
  burgers: 'burger', chicken: 'burger', sandwiches: 'burger', bbq: 'burger', seafood: 'fish', pub: 'bar', bar: 'bar', club: 'bar',
  mexican: 'eat', latin: 'eat', caribbean: 'eat', italian: 'eat', american: 'eat', kosher: 'eat', indian: 'eat', mediterranean: 'eat', french: 'eat', steakhouse: 'eat', european: 'eat', african: 'eat',
  bodega: 'bodega', grocery: 'market', supermarket: 'market', produce: 'market', butcher: 'butcher', fishmarket: 'fish', liquor: 'liquor',
  pharmacy: 'pharmacy', clinic: 'clinic', dentist: 'clinic', hospital: 'clinic', vet: 'paw', pets: 'paw', variety: 'tag', secondhand: 'tag', pawn: 'pawn', electronics: 'tv', phones: 'phone',
  nails: 'nails', cosmetics: 'nails', salon: 'comb', barber: 'scissors', tattoo: 'tattoo', hotel: 'bed', theatre: 'ticket', cinema: 'ticket',
  school: 'school', college: 'school', library: 'book', firehouse: 'fire', police: 'police', museum: 'civic', courthouse: 'civic', postoffice: 'mail', copyshop: 'mail',
  clothes: 'clothes', tailor: 'hanger', cleaners: 'hanger', laundromat: 'laundry', shoes: 'shoes', bags: 'case', travel: 'case', department: 'bag', sports: 'gym', gym: 'gym', bank: 'bank',
  books: 'book', stationery: 'pencil', art: 'pencil', hardware: 'hammer', housewares: 'hammer', florist: 'flower', optician: 'glasses', jewelry: 'gem', bikes: 'bike', furniture: 'chair',
  smoke: 'smoke', dispensary: 'leaf', toys: 'gift', gifts: 'gift', music: 'note', repair: 'car', bodyshop: 'car', dealer: 'car', carwash: 'car', tow: 'car', parking: 'car', gas: 'car',
};
/** The badge a kind of place wears, by the kind's id; 'subway' is a station's stairs. */
export const blipOf = kind => PICTURE[kind] || (kind === 'subway' ? 'subway' : 'shop');
const CATEGORY_COLOUR = Object.fromEntries(MAP_CATEGORIES.map(category => [category.id, category.colour]));
/** The colour a kind of place is marked in: that of its chip on the street map. */
export const blipColour = kind => kind === 'subway' ? '#ffffff' : CATEGORY_COLOUR[categoryOf(kind)] || '#d0d9d5';

/**
 * The badges for a set of doors.
 * @param fronts street fronts with a room behind them, as solveFrontages() gives them
 * @param stairs subway stairs: { x, z, station: { name } }
 * @returns {{id, x, z, name, kind, what, icon, colour}[]} `what` is the kind of place in words
 */
export function doorBlips(fronts = [], stairs = []) {
  const blips = [];
  for (const front of fronts) {
    const place = front.place, kind = place.kind;
    blips.push({ id: String(place.id ?? `${kind}|${Math.round(front.x)}|${Math.round(front.z)}`), x: front.x, z: front.z, name: placeName(place), kind, what: KIND[kind]?.label || 'Place', icon: blipOf(kind), colour: blipColour(kind) });
  }
  // One badge for a station however many stairs it has on the corner: the first of each cluster.
  const seen = [];
  for (const stair of stairs) {
    const name = stair.station?.name || 'Subway';
    if (seen.some(other => other.name === name && Math.hypot(other.x - stair.x, other.z - stair.z) < 60)) continue;
    seen.push({ name, x: stair.x, z: stair.z });
    blips.push({ id: `subway|${name}|${Math.round(stair.x)}|${Math.round(stair.z)}`, x: stair.x, z: stair.z, name, kind: 'subway', what: 'Subway', icon: 'subway', colour: blipColour('subway') });
  }
  return blips;
}

/** Whether the door behind a badge is open at `hours`: the subway never shuts. */
export const blipOpen = (blip, hours) => blip.kind === 'subway' || (!blip.closed && isOpen(blip.kind, hours));

/**
 * Those of `blips` that can be drawn `spacing` metres apart without one
 * covering another. Which stay does not depend on where the map is looking:
 * open doors before shut ones, then the rarer trade (BLIPS is in that order),
 * then the same door every time.
 */
export function thinBlips(blips, spacing, hours = 12) {
  if (!(spacing > 0)) return blips.slice();
  const order = blips.map(blip => ({ blip, shut: blipOpen(blip, hours) ? 0 : 1, rank: BLIP[blip.icon]?.rank ?? BLIPS.length }))
    .sort((a, b) => a.shut - b.shut || a.rank - b.rank || (a.blip.id < b.blip.id ? -1 : a.blip.id > b.blip.id ? 1 : 0));
  const grid = new Map(), kept = [];
  for (const { blip } of order) {
    const gx = Math.floor(blip.x / spacing), gz = Math.floor(blip.z / spacing);
    let clear = true;
    for (let x = gx - 1; clear && x <= gx + 1; x++) for (let z = gz - 1; clear && z <= gz + 1; z++) for (const other of grid.get(`${x},${z}`) || []) if (Math.hypot(other.x - blip.x, other.z - blip.z) < spacing) { clear = false; break; }
    if (!clear) continue;
    kept.push(blip);
    const key = `${gx},${gz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(blip);
  }
  return kept;
}

/** How many of each picture there are among `blips`, most first: [{ id, label, colour, count }] for a legend. A picture worn in two colours is shown in the commoner. */
export function blipLegend(blips) {
  const found = new Map();
  for (const blip of blips) {
    if (!found.has(blip.icon)) found.set(blip.icon, { id: blip.icon, label: BLIP[blip.icon]?.label || 'Shop', count: 0, colours: new Map() });
    const row = found.get(blip.icon);
    row.count++; row.colours.set(blip.colour, (row.colours.get(blip.colour) || 0) + 1);
  }
  return [...found.values()].map(({ colours, ...row }) => ({ ...row, colour: [...colours].sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.count - a.count || BLIP[a.id].rank - BLIP[b.id].rank);
}

const INK = '#0c1215';
/** A badge as an SVG picture `size` across, for a legend outside the canvas. */
export function blipSvg(icon, colour, size = 18) {
  const steps = (BLIP[icon] || BLIP.shop).steps.map(step => {
    const cut = step[0] === '-', line = step[cut ? 1 : 0] === '~', d = step.slice((cut ? 1 : 0) + (line ? 1 : 0)), paint = cut ? INK : colour;
    return line ? `<path d="${d}" fill="none" stroke="${paint}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${d}" fill="${paint}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-6 -6 36 36" aria-hidden="true"><circle cx="12" cy="12" r="17" fill="${INK}" stroke="${colour}" stroke-width="1.6"/>${steps}</svg>`;
}

// Badges are drawn once each, at the size and colour asked for, and copied from there.
const sprites = new Map(), paths = new Map();
const pathOf = d => { let path = paths.get(d); if (!path) paths.set(d, path = new Path2D(d)); return path; };
function sprite(document, icon, colour, size, ratio) {
  const key = `${icon}|${colour}|${size}|${ratio}`;
  let canvas = sprites.get(key);
  if (canvas) return canvas;
  const pixels = Math.ceil((size + 4) * ratio);
  canvas = document.createElement('canvas'); canvas.width = canvas.height = pixels;
  const context = canvas.getContext('2d'), half = pixels / 2, radius = size / 2 * ratio;
  context.fillStyle = INK; context.strokeStyle = colour; context.lineWidth = Math.max(1, size * .07 * ratio);
  context.beginPath(); context.arc(half, half, radius - context.lineWidth / 2, 0, Math.PI * 2); context.fill(); context.stroke();
  // The picture fills a little over half the badge: 24 units across the square that fits inside its ring.
  const scale = size * ratio * .64 / 24;
  context.translate(half - 12 * scale, half - 12 * scale); context.scale(scale, scale);
  context.lineWidth = 2; context.lineCap = 'round'; context.lineJoin = 'round';
  for (const step of (BLIP[icon] || BLIP.shop).steps) {
    const cut = step[0] === '-', line = step[cut ? 1 : 0] === '~', path = pathOf(step.slice((cut ? 1 : 0) + (line ? 1 : 0)));
    context.fillStyle = context.strokeStyle = cut ? INK : colour;
    if (line) context.stroke(path); else context.fill(path);
  }
  sprites.set(key, canvas);
  return canvas;
}

/**
 * Draw badges on a 2D canvas.
 * @param context the canvas context, in the map's own pixels
 * @param marks [{ px, py, icon, colour, open, label }] where each is on the canvas
 * @param options `size` the badge's width in those pixels, `ratio` the canvas pixels to each of them, `document` to make canvases with
 */
export function drawBlips(context, marks, { size = 22, ratio = 1, document = globalThis.document } = {}) {
  const pictured = typeof Path2D === 'function' && document?.createElement;
  context.save();
  for (const mark of marks) {
    context.globalAlpha = mark.open === false ? .42 : 1;
    if (pictured) { const image = sprite(document, mark.icon, mark.colour, size, ratio), across = image.width / ratio; context.drawImage(image, mark.px - across / 2, mark.py - across / 2, across, across); }
    else { context.fillStyle = mark.colour; context.beginPath(); context.arc(mark.px, mark.py, size / 2, 0, Math.PI * 2); context.fill(); }
  }
  context.globalAlpha = 1; context.font = '600 10px "Chalet Menu", Jost, Arial, sans-serif'; context.textBaseline = 'middle'; context.textAlign = 'left';
  // Names go where there is room: one that would run over a badge or a name already written is left out.
  const taken = marks.map(mark => ({ x: mark.px - size / 2, y: mark.py - size / 2, w: size, h: size }));
  for (const mark of marks) {
    if (!mark.label) continue;
    const width = context.measureText(mark.label).width, box = { x: mark.px + size / 2 + 3, y: mark.py - 6, w: (Number.isFinite(width) ? width : mark.label.length * 6) + 4, h: 12 };
    if (taken.some(other => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y)) continue;
    taken.push(box); context.fillStyle = '#0d1113cc'; context.fillRect(box.x, box.y, box.w, box.h);
    context.fillStyle = mark.open === false ? '#9aa39f' : mark.colour; context.fillText(mark.label, box.x + 2, mark.py);
  }
  context.restore();
}
