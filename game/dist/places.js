// What is at each address: the restaurants, shops, salons, garages and public
// buildings the city and the state license, inspect or run.
//
// Every place comes from a public register (see scripts/build-places.mjs) and
// carries the kind of place it is, where it is, and the name it trades under.
// A register entry that is a person's name, not a trade name, is given the
// plain name of its kind instead: the game shows shop signs, not who owns what.

/**
 * Kinds of place. `label` is the plain name of the kind, used on a sign when
 * the register gives no trade name. `group` gathers kinds that look alike
 * from the street.
 */
export const KINDS = [
  // Food and drink, from the health department's restaurant inspections.
  ['pizza', 'Pizza', 'food'], ['chinese', 'Chinese Restaurant', 'food'], ['coffee', 'Coffee', 'cafe'], ['bakery', 'Bakery', 'cafe'], ['donuts', 'Donuts', 'cafe'],
  ['juice', 'Juice Bar', 'cafe'], ['mexican', 'Mexican Restaurant', 'food'], ['latin', 'Restaurant', 'food'], ['caribbean', 'Caribbean Restaurant', 'food'], ['bbq', 'Barbecue', 'food'],
  ['japanese', 'Sushi', 'food'], ['italian', 'Italian Restaurant', 'dining'], ['american', 'Restaurant', 'dining'], ['chicken', 'Chicken', 'food'], ['burgers', 'Burgers', 'food'],
  ['sandwiches', 'Sandwiches', 'food'], ['bagels', 'Bagels', 'cafe'], ['kosher', 'Kosher Restaurant', 'food'], ['korean', 'Korean Restaurant', 'food'], ['thai', 'Thai Restaurant', 'food'],
  ['indian', 'Indian Restaurant', 'food'], ['asian', 'Asian Restaurant', 'food'], ['mediterranean', 'Mediterranean Grill', 'food'], ['french', 'Bistro', 'dining'], ['seafood', 'Seafood', 'dining'],
  ['steakhouse', 'Steakhouse', 'dining'], ['pub', 'Pub', 'bar'], ['european', 'Restaurant', 'dining'], ['african', 'African Restaurant', 'food'], ['icecream', 'Ice Cream', 'cafe'], ['bar', 'Bar', 'bar'],
  // Shops, from the state's food store, liquor and the city's business licences.
  ['bodega', 'Deli Grocery', 'bodega'], ['grocery', 'Grocery', 'market'], ['supermarket', 'Supermarket', 'market'], ['pharmacy', 'Pharmacy', 'shop'], ['variety', 'Discount Store', 'shop'],
  ['gas', 'Gas Station', 'auto'], ['butcher', 'Meat Market', 'market'], ['fishmarket', 'Fish Market', 'market'], ['produce', 'Fruit and Vegetables', 'market'], ['liquor', 'Wine and Liquor', 'liquor'],
  ['electronics', 'Electronics', 'shop'], ['pawn', 'Pawnbroker', 'shop'], ['secondhand', 'Buy and Sell', 'shop'], ['newsstand', 'Newsstand', 'stand'], ['fruitstand', 'Fruit Stand', 'stand'], ['storage', 'Self Storage', 'shop'],
  // Hair and nails, from the state's appearance and barber licences.
  ['nails', 'Nail Salon', 'beauty'], ['salon', 'Hair Salon', 'beauty'], ['barber', 'Barber Shop', 'barber'],
  // Cars, from the motor vehicle department and the city's licences.
  ['repair', 'Auto Repair', 'auto'], ['bodyshop', 'Auto Body', 'auto'], ['dealer', 'Auto Sales', 'auto'], ['carwash', 'Car Wash', 'auto'], ['tow', 'Towing', 'auto'], ['parking', 'Parking', 'auto'],
  // Somewhere to stay or go out.
  ['hotel', 'Hotel', 'hotel'], ['club', 'Club', 'bar'], ['theatre', 'Theatre', 'hotel'],
  // Public buildings, from the city's facilities database.
  ['school', 'School', 'public'], ['college', 'College', 'public'], ['library', 'Public Library', 'public'], ['firehouse', 'Firehouse', 'public'], ['police', 'Police Precinct', 'public'],
  ['hospital', 'Hospital', 'public'], ['museum', 'Museum', 'public'], ['courthouse', 'Courthouse', 'public'], ['ferry', 'Ferry Landing', 'public'],
  // Shops no register lists, from OpenStreetMap. New kinds go at the end: the bundled files name kinds by their place in this list.
  ['clothes', 'Clothing', 'shop'], ['shoes', 'Shoes', 'shop'], ['bank', 'Bank', 'shop'], ['laundromat', 'Laundromat', 'shop'], ['cleaners', 'Dry Cleaners', 'shop'], ['books', 'Books', 'shop'],
  ['hardware', 'Hardware', 'shop'], ['florist', 'Florist', 'shop'], ['optician', 'Optical', 'shop'], ['phones', 'Wireless', 'shop'], ['jewelry', 'Jewelry', 'shop'], ['gym', 'Gym', 'shop'],
  ['bikes', 'Bicycles', 'shop'], ['pets', 'Pet Supplies', 'shop'], ['furniture', 'Furniture', 'shop'], ['tattoo', 'Tattoo', 'shop'], ['smoke', 'Smoke Shop', 'shop'], ['dispensary', 'Dispensary', 'shop'],
  ['cosmetics', 'Beauty Supply', 'shop'], ['toys', 'Toys', 'shop'], ['gifts', 'Gifts', 'shop'], ['department', 'Department Store', 'shop'], ['sports', 'Sporting Goods', 'shop'], ['stationery', 'Stationery', 'shop'],
  ['music', 'Music', 'shop'], ['art', 'Art Supplies', 'shop'], ['bags', 'Luggage', 'shop'], ['copyshop', 'Copies and Shipping', 'shop'], ['tailor', 'Tailor', 'shop'], ['travel', 'Travel Agency', 'shop'],
  ['massage', 'Massage', 'shop'], ['housewares', 'Housewares', 'shop'], ['postoffice', 'Post Office', 'public'], ['cinema', 'Cinema', 'hotel'], ['vet', 'Veterinarian', 'shop'], ['dentist', 'Dentist', 'shop'], ['clinic', 'Medical Office', 'shop'],
].map(([id, label, group], index) => ({ id, label, group, index }));

export const KIND = Object.fromEntries(KINDS.map(kind => [kind.id, kind]));

// The health department's cuisine descriptions, gathered into kinds.
const CUISINES = [
  [/^pizza/, 'pizza'], [/^chinese/, 'chinese'], [/^coffee/, 'coffee'], [/^bakery/, 'bakery'], [/^donuts/, 'donuts'], [/^(juice|fruits)/, 'juice'],
  [/^(mexican|tex-mex|southwestern)/, 'mexican'], [/^(latin|peruvian|brazilian|chilean|chimichurri|spanish|tapas|portuguese|basque)/, 'latin'], [/^caribbean/, 'caribbean'],
  [/^(barbecue|soul food|creole|cajun)/, 'bbq'], [/^japanese/, 'japanese'], [/^italian/, 'italian'], [/^chicken/, 'chicken'], [/^(hamburgers|hotdogs)/, 'burgers'],
  [/^(sandwiches|salads|soups|vegan|vegetarian)/, 'sandwiches'], [/^bagels/, 'bagels'], [/^jewish/, 'kosher'], [/^korean/, 'korean'], [/^thai/, 'thai'],
  [/^(indian|bangladeshi|pakistani)/, 'indian'], [/^(asian|southeast asian|fusion|filipino|indonesian|hawaiian|polynesian)/, 'asian'],
  [/^(mediterranean|middle eastern|greek|turkish|lebanese|egyptian|moroccan|afghan|iranian|armenian)/, 'mediterranean'], [/^(french|new french|haute)/, 'french'],
  [/^seafood/, 'seafood'], [/^steakhouse/, 'steakhouse'], [/^irish/, 'pub'], [/^(german|eastern european|russian|polish|czech|scandinavian)/, 'european'],
  [/^(african|ethiopian)/, 'african'], [/^(frozen desserts|nuts)/, 'icecream'], [/^bottled beverages/, 'bar'],
];

/** The kind of place a restaurant is, from the cuisine the inspectors recorded. */
export function cuisineKind(description) {
  const text = String(description || '').trim().toLowerCase();
  for (const [pattern, kind] of CUISINES) if (pattern.test(text)) return kind;
  return 'american';
}

// What a retail food store is, as far as its name and floor area say.
const STORE_NAMES = [
  [/\b(CVS|WALGREENS?|DUANE READE|RITE AID|PHARMACY|DRUGS?)\b/, 'pharmacy'], [/\b(DOLLAR|99 ?C(ENTS?)?|FAMILY DOLLAR|DISCOUNT)\b/, 'variety'],
  [/\b(MOBIL|EXXON|SHELL|SUNOCO|GULF|SPEEDWAY|CITGO|GETTY|VALERO|CONOCO|LUKOIL|GAS|FUEL|PETROLEUM|SERVICE STATION)\b|\bBP\b/, 'gas'],
  [/\b(MEATS?|BUTCHER|CARNICERIA|POULTRY|LIVE POULTRY)\b/, 'butcher'], [/\b(FISH|SEAFOOD|PESCADERIA)\b/, 'fishmarket'], [/\b(FRUITS?|PRODUCE|VEGETABLES?|FARM)\b/, 'produce'],
  [/\b(BAKERY|PANADERIA|PASTRY|PATISSERIE)\b/, 'bakery'], [/\b(SUPERMARKET|SUPERMERCADO|FOOD ?TOWN|KEY FOOD|C ?TOWN|ASSOCIATED|PIONEER|STOP ?& ?SHOP|TRADER JOE|WHOLE FOODS|WESTSIDE MARKET|FAIRWAY|GRISTEDES|MORTON WILLIAMS|FOOD BAZAAR|BRAVO|SHOP ?RITE|ALDI|LIDL|COSTCO|TARGET|H ?MART)\b/, 'supermarket'],
];

/** The kind of shop a licensed food store is. `area` is its floor area in square feet, if known. */
export function storeKind(name, area) {
  const text = String(name || '').toUpperCase();
  for (const [pattern, kind] of STORE_NAMES) if (pattern.test(text)) return kind;
  if (area >= 10000) return 'supermarket';
  if (area >= 2500) return 'grocery';
  return 'bodega';
}

const COMPANY = /\b(INC|INCORPORATED|CORP|CORPORATION|LLC|L\.L\.C|LTD|LIMITED|CO|COMPANY|LP|LLP|PLLC|PC|ENTERPRISES?|ASSOCIATES?|GROUP|HOLDINGS?)\b\.?/;
const TRADE = /\b(DELI|GROCER(Y|IES)|MARKET|MART|FOODS?|STORE|SHOP|SHOPPE|SALON|NAILS?|SPA|BARBERS?|BARBERSHOP|HAIR|BEAUTY|CUTS?|STUDIO|AUTO|MOTORS?|TIRES?|COLLISION|REPAIRS?|BODY|GARAGE|PARKING|SERVICE|CAFE|COFFEE|PIZZA|PIZZERIA|RESTAURANT|BAR|GRILL|KITCHEN|LOUNGE|TAVERN|PUB|WINES?|LIQUORS?|SPIRITS|HOTEL|INN|SUITES|CLUB|THEAT(ER|RE)|PHARMACY|CLEANERS?|LAUNDRY|LAUNDROMAT|ELECTRONICS|WIRELESS|JEWELRY|PAWN|EXCHANGE|TRADING|WASH|TOWING|NEWS|CANDY|BODEGA|SUPERMARKET|BAKERY|GOURMET|CONVENIENCE|EXPRESS|DISCOUNT|CENTER|CENTRE|PLAZA|WORLD|HOUSE|PALACE|CITY|NEW YORK|NYC|BROTHERS|BROS|SONS|\d+(ST|ND|RD|TH)?)\b|[&#]|'S\b/;

/**
 * The name to put on the sign. `raw` is the register's name for the business;
 * `owner` is the name of whoever holds the licence, where the register gives
 * one. Returns '' when what the register holds is a person's name, or
 * nothing: the sign then carries the plain name of the kind of place.
 */
export function tradeName(raw, { owner = '', trading = false } = {}) {
  let name = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!name) return '';
  // "SOMEONE INC D/B/A THE CORNER DELI": what follows is the trade name.
  const alias = name.match(/\b(?:D\/?B\/?A|DOING BUSINESS AS|T\/A)\b[:.]?\s*(.+)$/);
  if (alias) { name = alias[1].trim(); trading = true; }
  const company = COMPANY.test(name);
  const same = text => String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
  // A register of trade names is taken at its word. Elsewhere a name with no
  // company form and no word of trade in it is most likely the licensee.
  if (owner && same(owner) === same(name)) return '';
  if (!trading && !company && !TRADE.test(name)) return '';
  name = name.replace(/\s*[,.]?\s*\b(INC|INCORPORATED|CORP|CORPORATION|LLC|L\.L\.C|LTD|LIMITED|LP|LLP|PLLC)\b\.?/g, '').replace(/\s*#\s*[A-Z0-9\-]+/g, '').replace(/\s+[A-Z]?-?\d{3,}[A-Z]?$/, '').replace(/\s+(CO|COMPANY)\.?$/, '');
  name = name.replace(/[^A-Z0-9 &'\-./!+]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '');
  if (name.length < 2) return '';
  // A sign has room for a few words.
  if (name.length > 34) { const cut = name.slice(0, 34); name = cut.slice(0, Math.max(cut.lastIndexOf(' '), 18)); }
  return name.replace(/[\s,.\-&/+]+$/, '');
}

/** What a place is called: its trade name, or the plain name of its kind. */
export const placeName = place => place.name || KIND[place.kind]?.label.toUpperCase() || 'SHOP';

/** Places are bundled by the square kilometre. */
export const PLACE_CELL = 1000;
export const placeCellKey = (x, z) => `${Math.floor(x / PLACE_CELL)},${Math.floor(z / PLACE_CELL)}`;

const WORDS = name => String(name || '').toUpperCase().replace(/'/g, '').split(/[^A-Z0-9]+/).filter(word => word.length > 2 && !/^(THE|AND|INC|CORP|LLC|NYC|NEW|YORK|BAR|GRILL|RESTAURANT|CAFE)$/.test(word));
// Two names share a word if one has a word the other has, or begins with: FANELLI CAFE and FANELLIS.
const shares = (a, b) => { const words = WORDS(a); return WORDS(b).some(word => words.some(other => other === word || (Math.min(other.length, word.length) >= 5 && (other.startsWith(word) || word.startsWith(other))))); };
const EATING = new Set(KINDS.filter(kind => ['food', 'cafe', 'dining', 'bar'].includes(kind.group)).map(kind => kind.id));

/**
 * One list from several registers. The same business is often in two of them:
 * a restaurant with a liquor licence, a hotel with a bar, a chemist that
 * sells beer. Entries are { kind, name, x, z, bin, area, grade, rank }; where
 * two describe one business, the one from the register that knows it best
 * (the lower `rank`) is kept.
 */
export function mergePlaces(entries) {
  const kept = [], grid = new Map(), cell = 40;
  const near = (x, z) => { const found = []; for (let gx = Math.floor(x / cell) - 1; gx <= Math.floor(x / cell) + 1; gx++) for (let gz = Math.floor(z / cell) - 1; gz <= Math.floor(z / cell) + 1; gz++) found.push(...(grid.get(`${gx},${gz}`) || [])); return found; };
  const same = (a, b) => {
    const gap = Math.hypot(a.x - b.x, a.z - b.z), together = (a.bin && a.bin === b.bin) || gap < 25;
    if (!together) return false;
    // The very same entry twice.
    if (a.kind === b.kind && a.name === b.name && gap < 15) return true;
    // A bar licence at a restaurant's address, in a name they share, is the restaurant's.
    if ((a.kind === 'bar' || a.kind === 'club') && EATING.has(b.kind) && b.kind !== 'bar' && shares(a.name, b.name)) return true;
    if (a.kind === b.kind && ['hotel', 'pharmacy', 'liquor', 'parking', 'repair', 'bodyshop', 'dealer', 'theatre', 'club', 'bar'].includes(a.kind) && (shares(a.name, b.name) || !a.name || !b.name)) return true;
    return false;
  };
  for (const entry of [...entries].sort((a, b) => (a.rank || 0) - (b.rank || 0))) {
    if (!Number.isFinite(entry.x) || !Number.isFinite(entry.z) || !KIND[entry.kind]) continue;
    if (near(entry.x, entry.z).some(other => same(entry, other))) continue;
    kept.push(entry);
    const key = `${Math.floor(entry.x / cell)},${Math.floor(entry.z / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(entry);
  }
  return kept;
}

/** A place as it is stored: [x, z, kind index, name, building number, floor area in square feet, inspection grade]. */
export const packPlace = place => [Math.round(place.x), Math.round(place.z), KIND[place.kind].index, place.name || '', place.bin || 0, Math.round(place.area || 0), place.grade || ''];
export function unpackPlace(row, id) {
  const kind = KINDS[row[2]];
  return kind ? { id, x: row[0], z: row[1], kind: kind.id, group: kind.group, name: row[3] || '', bin: row[4] || 0, area: row[5] || 0, grade: row[6] || '' } : null;
}

// ---------------------------------------------------------------------------
// Around the player

/**
 * Loads the places around the player, a square kilometre at a time.
 * `load(url)` resolves to the parsed file; `index` is places-index.json.
 */
export function createPlaceSource({ load, index = null, prefix = '' } = {}) {
  const cells = new Map();
  let version = 0;
  const want = key => {
    if (!index?.cells?.[key] || cells.has(key)) return;
    const cell = { places: null };
    cells.set(key, cell);
    Promise.resolve(load(index.cells[key].url)).then(data => {
      cell.places = (data?.places || []).map((row, i) => unpackPlace(row, `${prefix}${key}:${i}`)).filter(Boolean);
      version++;
    }).catch(() => { cells.delete(key); });
  };
  return {
    setIndex(next) { index = next; cells.clear(); version++; },
    get ready() { return Boolean(index); },
    /** Counts up whenever a cell of places arrives. */
    get version() { return version; },
    /** Ask for whatever lies within `radius` of (x, z). */
    request(x, z, radius = 400) {
      for (let gx = Math.floor((x - radius) / PLACE_CELL); gx <= Math.floor((x + radius) / PLACE_CELL); gx++) for (let gz = Math.floor((z - radius) / PLACE_CELL); gz <= Math.floor((z + radius) / PLACE_CELL); gz++) want(`${gx},${gz}`);
      // Cells well behind the player are let go.
      for (const key of [...cells.keys()]) { const [gx, gz] = key.split(',').map(Number); if (Math.abs((gx + .5) * PLACE_CELL - x) > radius + 2.5 * PLACE_CELL || Math.abs((gz + .5) * PLACE_CELL - z) > radius + 2.5 * PLACE_CELL) cells.delete(key); }
    },
    /** The loaded places within `radius` of (x, z), nearest first. */
    near(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / PLACE_CELL); gx <= Math.floor((x + radius) / PLACE_CELL); gx++) for (let gz = Math.floor((z - radius) / PLACE_CELL); gz <= Math.floor((z + radius) / PLACE_CELL); gz++) {
        for (const place of cells.get(`${gx},${gz}`)?.places || []) { const distance = Math.hypot(place.x - x, place.z - z); if (distance <= radius) found.push({ place, distance }); }
      }
      return found.sort((a, b) => a.distance - b.distance).map(entry => entry.place);
    },
  };
}

/** Several sources read as one: asked together, and their places given together, nearest first. */
export function joinPlaceSources(...sources) {
  return {
    get ready() { return sources.some(source => source.ready); },
    get version() { return sources.reduce((sum, source) => sum + source.version, 0); },
    request(x, z, radius) { for (const source of sources) source.request(x, z, radius); },
    near(x, z, radius) { return sources.flatMap(source => source.near(x, z, radius)).map(place => ({ place, distance: Math.hypot(place.x - x, place.z - z) })).sort((a, b) => a.distance - b.distance).map(entry => entry.place); },
  };
}

/** What OpenStreetMap calls a shop, an amenity or a place of leisure, as a kind of place here; null for those not taken. */
const OSM_KINDS = { clothes: 'clothes', shoes: 'shoes', bank: 'bank', laundry: 'laundromat', dry_cleaning: 'cleaners', books: 'books', hardware: 'hardware', florist: 'florist', optician: 'optician', mobile_phone: 'phones',
  jewelry: 'jewelry', fitness_centre: 'gym', bicycle: 'bikes', pet: 'pets', furniture: 'furniture', tattoo: 'tattoo', tobacco: 'smoke', 'e-cigarette': 'smoke', cannabis: 'dispensary', cosmetics: 'cosmetics', toys: 'toys', gift: 'gifts',
  department_store: 'department', sports: 'sports', stationery: 'stationery', music: 'music', art: 'art', bag: 'bags', copyshop: 'copyshop', tailor: 'tailor', travel_agency: 'travel', massage: 'massage', houseware: 'housewares',
  post_office: 'postoffice', cinema: 'cinema', veterinary: 'vet', dentist: 'dentist', clinic: 'clinic' };
export const osmKind = tags => OSM_KINDS[tags?.shop] || OSM_KINDS[tags?.amenity] || OSM_KINDS[tags?.leisure] || null;

// ---------------------------------------------------------------------------
// Where on its building a place has its front

const SQUARE_FOOT = .0929;
/** How much street front a place takes, in metres. Never less than a shop front the facade draws, so each has one. */
export function frontWidth(place) {
  if (place.area > 0 && ['bodega', 'grocery', 'supermarket', 'pharmacy', 'variety', 'butcher', 'fishmarket', 'produce', 'bakery'].includes(place.kind)) return Math.max(7, Math.min(26, Math.sqrt(place.area * SQUARE_FOOT) * .7));
  if (place.kind === 'supermarket') return 16;
  if (['hotel', 'theatre', 'museum', 'hospital', 'courthouse', 'college', 'department', 'cinema'].includes(place.kind)) return 12;
  if (place.group === 'public') return 10;
  return 7;
}
/** Places that stand on the sidewalk or the water's edge, not behind a shop front. */
const NO_FRONT = new Set(['fruitstand', 'newsstand', 'ferry', 'tow']);
// Which places get the street front when a building has more than fit: those that live on passing trade first.
const PRIORITY = { food: 0, cafe: 0, bodega: 0, market: 0, liquor: 1, dining: 1, bar: 1, shop: 2, hotel: 2, public: 2, auto: 2, barber: 3, beauty: 4 };

const inRing = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const inFootprint = (building, x, z) => inRing(building.polygon, x, z) && !(building.holes || []).some(hole => inRing(hole, x, z));

/** Index building outlines ({ id, polygon, holes }) for queries by point. */
export function indexFootprints(buildings = [], size = 48) {
  const grid = new Map();
  for (const building of buildings) {
    if (!Array.isArray(building.polygon) || building.polygon.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of building.polygon) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    for (let gx = Math.floor(minX / size); gx <= Math.floor(maxX / size); gx++) for (let gz = Math.floor(minZ / size); gz <= Math.floor(maxZ / size); gz++) {
      const key = `${gx},${gz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(building);
    }
  }
  const near = (x, z, radius) => {
    const found = new Set();
    for (let gx = Math.floor((x - radius) / size); gx <= Math.floor((x + radius) / size); gx++) for (let gz = Math.floor((z - radius) / size); gz <= Math.floor((z + radius) / size); gz++) for (const building of grid.get(`${gx},${gz}`) || []) found.add(building);
    return found;
  };
  return {
    count: buildings.length,
    near,
    /** The building whose outline holds the point, if any. */
    at(x, z) { for (const building of grid.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) || []) if (inFootprint(building, x, z)) return building; return null; },
  };
}

const toSegment = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2));
  return { t, distance: Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) };
};

/**
 * Finds the walls of a building that face a street, once per building: each
 * { a, b, length, tx, tz, nx, nz } with (nx, nz) pointing out over the sidewalk.
 */
export function wallFinder(footprints, isStreet) {
  const walls = new Map();
  return building => {
    if (walls.has(building)) return walls.get(building);
    const list = [], ring = building.polygon;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 2.2) continue;
      const tx = (b[0] - a[0]) / length, tz = (b[1] - a[1]) / length, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      // Out is the side of the wall that is not the building.
      let nx = tz, nz = -tx;
      if (inFootprint(building, mx + nx * .8, mz + nz * .8)) { nx = -nx; nz = -nz; }
      const open = d => { const x = mx + nx * d, z = mz + nz * d; return isStreet(x, z) && !footprints.at(x, z); };
      if (open(2.2) || open(4.5)) list.push({ a, b, length, tx, tz, nx, nz });
    }
    walls.set(building, list);
    return list;
  };
}

/**
 * Give each place its street front: the stretch of its building's wall,
 * facing a street, that lies nearest the point the register puts it at.
 *
 * `footprints` is indexFootprints() of the buildings around; `isStreet(x, z)`
 * says whether a point is roadway or sidewalk. A place whose building is not
 * among them, or has no wall on a street, gets none; so do those beyond what
 * its building's street walls have room for.
 *
 * @returns {{place:object, building:object, x:number, z:number, tx:number, tz:number, nx:number, nz:number, width:number}[]}
 *   (x, z) the middle of the front on the wall line, (tx, tz) along the wall, (nx, nz) out toward the street
 */
export function solveFrontages(places, footprints, isStreet, { reach = 28 } = {}) {
  const claims = new Map(), streetWalls = wallFinder(footprints, isStreet);
  for (const place of places) {
    if (NO_FRONT.has(place.kind)) continue;
    let building = footprints.at(place.x, place.z), nearest = reach;
    if (!building) for (const candidate of footprints.near(place.x, place.z, reach)) {
      const ring = candidate.polygon;
      for (let i = 0; i < ring.length; i++) { const { distance } = toSegment(place.x, place.z, ring[i], ring[(i + 1) % ring.length]); if (distance < nearest) { nearest = distance; building = candidate; } }
    }
    if (!building) continue;
    let best = null;
    for (const wall of streetWalls(building)) {
      const { t, distance } = toSegment(place.x, place.z, wall.a, wall.b);
      if (!best || distance < best.distance - .5 || (distance < best.distance + .5 && wall.length > best.wall.length)) best = { wall, t, distance };
    }
    if (!best) continue;
    const width = frontWidth(place), { wall } = best, half = Math.min(width, wall.length) / 2;
    // Keep the front on its wall where the wall is long enough to hold it.
    const along = Math.max(half, Math.min(wall.length - half, best.t * wall.length));
    const front = { place, building, x: wall.a[0] + wall.tx * along, z: wall.a[1] + wall.tz * along, tx: wall.tx, tz: wall.tz, nx: wall.nx, nz: wall.nz, width };
    if (!claims.has(building)) claims.set(building, []);
    claims.get(building).push(front);
  }
  const fronts = [];
  for (const [building, list] of claims) {
    // No more fronts than the building's street walls have room for.
    const room = Math.max(1, Math.floor(streetWalls(building).reduce((sum, wall) => sum + wall.length, 0) / 5.5));
    list.sort((a, b) => (PRIORITY[a.place.group] ?? 3) - (PRIORITY[b.place.group] ?? 3) || a.place.id.localeCompare(b.place.id));
    const kept = list.slice(0, room);
    // Neighbours on one wall are moved apart until each has its own stretch of it.
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i], b = kept[j];
      if (Math.abs(a.tx * b.tx + a.tz * b.tz) < .9 || Math.abs((b.x - a.x) * a.nx + (b.z - a.z) * a.nz) > 2) continue;
      const gap = (b.x - a.x) * a.tx + (b.z - a.z) * a.tz, need = (Math.min(a.width, 9) + Math.min(b.width, 9)) / 2 * .8;
      if (Math.abs(gap) >= need) continue;
      const push = (need - Math.abs(gap)) / 2, way = gap >= 0 ? 1 : -1;
      a.x -= a.tx * push * way; a.z -= a.tz * push * way; b.x += a.tx * push * way; b.z += a.tz * push * way;
    }
    fronts.push(...kept);
  }
  return fronts;
}

// ---------------------------------------------------------------------------
// What a place looks like from the street

/** Whether a place of this kind is open at `hours` (0 to 24). */
export function isOpen(kind, hours) {
  const group = KIND[kind]?.group, between = (from, to) => from <= to ? hours >= from && hours < to : hours >= from || hours < to;
  if (kind === 'laundromat') return between(6, 23);
  if (kind === 'gym') return between(5, 23);
  if (kind === 'bank' || kind === 'postoffice' || kind === 'dentist' || kind === 'clinic' || kind === 'vet') return between(9, 17);
  if (kind === 'cinema') return between(11, 24);
  if (kind === 'bodega' || kind === 'hotel' || kind === 'police' || kind === 'firehouse' || kind === 'hospital' || kind === 'gas' || kind === 'parking') return true;
  if (kind === 'club') return between(21, 4);
  if (group === 'bar') return between(15, 3.5);
  if (kind === 'coffee' || kind === 'bagels' || kind === 'donuts' || kind === 'bakery') return between(6, 20);
  if (group === 'cafe') return between(8, 22);
  if (kind === 'pizza' || kind === 'chicken' || kind === 'burgers' || kind === 'chinese') return between(10.5, 1);
  if (group === 'food') return between(11, 23);
  if (group === 'dining') return between(11.5, 23.5);
  if (group === 'liquor') return between(10, 22);
  if (group === 'market') return between(7, 22);
  if (group === 'beauty' || group === 'barber') return between(9.5, 19.5);
  if (kind === 'pharmacy') return between(8, 22);
  if (kind === 'theatre') return between(11, 23);
  if (group === 'auto') return between(8, 18);
  if (group === 'public') return between(8, 17);
  return between(9.5, 20);
}

// Sign colours as painted: [background, lettering]. Each kind of place has a few it is usually seen in.
const SCHEMES = {
  bodega: [['#f2c400', '#b01515'], ['#c81e1e', '#ffffff'], ['#0b5d2a', '#ffe36a'], ['#1a3fa0', '#ffffff'], ['#f2c400', '#111111'], ['#c81e1e', '#ffe36a']],
  market: [['#0b6b2f', '#ffffff'], ['#c81e1e', '#fff3c4'], ['#f4f1e6', '#b01515'], ['#f2c400', '#0b5d2a']],
  food: [['#c81e1e', '#ffd84a'], ['#141414', '#ffffff'], ['#f4f1e6', '#b01515'], ['#e07b12', '#ffffff'], ['#0b5d2a', '#ffffff'], ['#5a1a1a', '#f1d9a0']],
  cafe: [['#2b1d16', '#f1e3c8'], ['#f4f1e6', '#2b1d16'], ['#1f3b34', '#ffffff'], ['#d9b38c', '#2b1d16']],
  dining: [['#141414', '#e8d9b0'], ['#1c2a3a', '#ffffff'], ['#3a1414', '#f1d9a0'], ['#f4f1e6', '#141414']],
  bar: [['#141414', '#f2b33d'], ['#0f2a1c', '#f1d9a0'], ['#2a0f14', '#ff6a5a']],
  liquor: [['#7a0c0c', '#ffd84a'], ['#141414', '#ff4b3b'], ['#f4f1e6', '#7a0c0c']],
  beauty: [['#d6337a', '#ffffff'], ['#f7d6e6', '#7a1450'], ['#141414', '#f7b6d2'], ['#7b3fb0', '#ffffff'], ['#f4f1e6', '#d6337a']],
  barber: [['#f4f1e6', '#1a3fa0'], ['#141414', '#ffffff'], ['#1a3fa0', '#ffffff'], ['#b01515', '#ffffff']],
  auto: [['#1a3fa0', '#ffd84a'], ['#f2c400', '#111111'], ['#b01515', '#ffffff'], ['#f4f1e6', '#1a3fa0']],
  shop: [['#1a3fa0', '#ffffff'], ['#f4f1e6', '#141414'], ['#0d7a7a', '#ffffff'], ['#f2c400', '#111111']],
  hotel: [['#141414', '#d9c08a'], ['#1c2a3a', '#e8e0c8']],
  public: [['#2a2f36', '#e8e8e8']],
  stand: [['#0b5d2a', '#ffffff']],
};
const KIND_SCHEMES = { bank: [['#0f2d5c', '#ffffff'], ['#0b5d2a', '#ffffff'], ['#f4f1e6', '#b01515'], ['#141414', '#ffffff']], laundromat: [['#1a6fb0', '#ffffff'], ['#f4f1e6', '#1a3fa0'], ['#f2c400', '#1a3fa0']],
  postoffice: [['#1a3fa0', '#ffffff']], dispensary: [['#0b5d2a', '#ffffff'], ['#141414', '#7be08a']], smoke: [['#141414', '#f2c400'], ['#5a1a8a', '#ffffff'], ['#0b5d2a', '#ffe36a']], gym: [['#141414', '#f2c400'], ['#5a1a8a', '#ffe36a'], ['#c81e1e', '#ffffff']],
  clothes: [['#141414', '#ffffff'], ['#f4f1e6', '#141414'], ['#c81e1e', '#ffffff'], ['#1c2a3a', '#ffffff']], cleaners: [['#f4f1e6', '#1a3fa0'], ['#1a6fb0', '#ffffff'], ['#c81e1e', '#ffffff']], chinese: [['#b01515', '#ffd84a'], ['#c81e1e', '#ffe9a8'], ['#f2c400', '#b01515']], pizza: [['#c81e1e', '#ffffff'], ['#f4f1e6', '#0b6b2f'], ['#0b6b2f', '#ffffff']],
  pharmacy: [['#f4f1e6', '#c81e1e'], ['#0b5d2a', '#ffffff'], ['#1a3fa0', '#ffffff']], supermarket: [['#c81e1e', '#ffffff'], ['#0b6b2f', '#ffffff'], ['#f2c400', '#c81e1e']] };
// What else the sign says, under the name.
const TAGLINES = { bodega: 'DELI  GROCERY  ATM  LOTTO  COLD CUTS', grocery: 'FRESH PRODUCE  MEAT  DAIRY', supermarket: '', pizza: 'PIZZA  PASTA  HEROS', chinese: 'CHINESE RESTAURANT  TAKE OUT',
  nails: 'NAILS  WAXING  SPA', salon: 'HAIR  COLOR  STYLE', barber: 'HAIRCUTS  SHAVES  FADES', liquor: 'WINES & LIQUORS', repair: 'BRAKES  TIRES  OIL CHANGE  INSPECTION', bodyshop: 'COLLISION  PAINT  FRAME',
  dealer: 'CARS BOUGHT & SOLD', carwash: 'HAND WASH  DETAILING', coffee: 'COFFEE  ESPRESSO', bagels: 'HOT BAGELS', donuts: 'DONUTS  COFFEE', juice: 'JUICES  SMOOTHIES', chicken: 'FRIED CHICKEN',
  burgers: 'BURGERS  FRIES  SHAKES', mexican: 'TACOS  BURRITOS', japanese: 'SUSHI  RAMEN', pharmacy: 'PHARMACY  PRESCRIPTIONS', pawn: 'WE BUY GOLD  LOANS', secondhand: 'BUY  SELL  TRADE', electronics: 'PHONES  REPAIRS  ACCESSORIES',
  parking: 'PARK  24 HOURS', butcher: 'MEAT  POULTRY', fishmarket: 'FRESH FISH', produce: 'FRUITS & VEGETABLES', bakery: 'BREAD  CAKES  PASTRY', icecream: 'ICE CREAM', mediterranean: 'GYRO  FALAFEL  KEBAB', indian: 'CURRY  TANDOORI',
  clothes: '', bank: '', laundromat: 'WASH  DRY  FOLD  DROP OFF SERVICE', cleaners: 'DRY CLEANING  ALTERATIONS  SAME DAY', hardware: 'KEYS  PAINT  TOOLS  PLUMBING', florist: 'FLOWERS  PLANTS  WE DELIVER', optician: 'EYE EXAMS  GLASSES  CONTACTS',
  phones: 'PHONES  PLANS  REPAIRS', jewelry: 'GOLD  DIAMONDS  WATCHES  REPAIRS', gym: 'FITNESS  24 HOURS', bikes: 'SALES  SERVICE  RENTALS', pets: 'FOOD  SUPPLIES  GROOMING', tattoo: 'TATTOO  PIERCING', smoke: 'CIGARS  VAPE  HOOKAH  CBD',
  cosmetics: 'WIGS  HAIR  COSMETICS', copyshop: 'COPIES  PRINTING  SHIPPING  NOTARY', tailor: 'ALTERATIONS  HEMMING', travel: 'TICKETS  TOURS  MONEY TRANSFER', massage: 'BODY WORK  FOOT RUB', housewares: 'KITCHEN  BATH  HOME',
  shoes: 'SNEAKERS  BOOTS  REPAIRS', books: 'NEW  USED  RARE', vet: 'ANIMAL HOSPITAL', dentist: 'FAMILY DENTISTRY', clinic: 'WALK-INS WELCOME', furniture: 'SOFAS  BEDS  FINANCING', gifts: 'SOUVENIRS  CARDS  GIFTS',
  thai: 'THAI KITCHEN', korean: 'KOREAN BBQ', caribbean: 'JERK  ROTI  PATTIES', latin: 'COMIDA LATINA', sandwiches: 'SANDWICHES  SALADS  SOUPS', variety: 'EVERYTHING MUST GO', gas: 'GAS  DIESEL  MART' };

// What a kind of place is called in the languages most spoken at home in New York after English: the word a sign
// adds where many of the neighbours speak it. Keyed by the survey's language groups (demographics.js); 'germanic'
// in this city is mostly Yiddish, 'slavic' mostly Russian, 'french' mostly Haitian Creole and French.
const WORDS_OF = { food: 0, dining: 0, cafe: 1, bodega: 2, market: 2, beauty: 3, barber: 4, liquor: 5, shop: 6 };
const LOCAL = {
  spanish: ['RESTAURANTE', 'CAFÉ', 'ABARROTES', 'SALÓN DE BELLEZA', 'BARBERÍA', 'LICORES', 'TIENDA'],
  chinese: ['餐館', '咖啡', '雜貨', '美容', '理髮', '酒', '商店'],
  slavic: ['РЕСТОРАН', 'КАФЕ', 'ПРОДУКТЫ', 'САЛОН КРАСОТЫ', 'ПАРИКМАХЕРСКАЯ', 'ВИНО', 'МАГАЗИН'],
  korean: ['식당', '카페', '식품', '미용실', '이발소', '주류', '상점'],
  arabic: ['مطعم', 'مقهى', 'بقالة', 'صالون', 'حلاق', '', 'متجر'],
  french: ['RESTAURANT', 'CAFÉ', 'ÉPICERIE', 'SALON DE BEAUTÉ', 'COIFFEUR', 'VINS', 'BOUTIQUE'],
  germanic: ['רעסטאראן', 'קאווע', 'גראסערי', 'סאלאן', 'שערער', '', 'געשעפט'],
};
/** The word for a place's kind in a language of the survey's, or '' where there is none. */
export const localWord = (place, language) => LOCAL[language]?.[WORDS_OF[KIND[place.kind]?.group]] || '';

const hashText = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h ^ (h >>> 15)) >>> 0; };

/**
 * What a place's sign looks like: { name, tagline, background, lettering }
 * with colours as '#rrggbb'. The same place always gets the same sign.
 */
// Chains with many branches in the city are signed in their own colours: [name as the sign has it, background, lettering].
// Only the colours and the name are theirs; the lettering is the game's plain face and no logo is drawn.
const BRANDS = [
  [/^DUNKIN/, '#ffffff', '#f5821f'], [/^CHASE( BANK)?$|^JPMORGAN CHASE/, '#ffffff', '#117aca'], [/^MCDONALD/, '#da291c', '#ffc72c'], [/T-?MOBILE/, '#e20074', '#ffffff'], [/^STARBUCKS/, '#00704a', '#ffffff'],
  [/^SUBWAY( RESTAURANTS?| SANDWICH(ES)?)?$/, '#008c15', '#ffc600'], [/^CHIPOTLE/, '#441500', '#ffffff'], [/^POPEYES/, '#f15c22', '#ffffff'], [/^BANK OF AMERICA/, '#ffffff', '#012169'], [/^TD BANK/, '#34a853', '#ffffff'], [/^CITIBANK|^CITI$/, '#ffffff', '#003b70'],
  [/^CVS/, '#cc0000', '#ffffff'], [/^WALGREENS/, '#ffffff', '#e31837'], [/^DUANE READE/, '#ffffff', '#00539b'], [/^DOMINO/, '#006491', '#ffffff'], [/^TACO BELL/, '#702082', '#ffffff'], [/KENNEDY FRIED CHICKEN/, '#c8102e', '#ffffff'],
  [/^VERIZON|BY VERIZON/, '#000000', '#ffffff'], [/^DOLLAR TREE/, '#ffffff', '#00843d'], [/^KEY FOOD/, '#e31837', '#ffffff'], [/^AT ?& ?T\b/, '#ffffff', '#00a8e0'], [/^BURGER KING/, '#f5ebdc', '#d62300'], [/^WENDY/, '#ffffff', '#e2203d'],
  [/^CITYMD/, '#ffffff', '#00467f'], [/^BOOST MOBILE/, '#f7901e', '#000000'], [/^CARVEL/, '#ffffff', '#0033a0'], [/^SANTANDER/, '#ec0000', '#ffffff'], [/^WINGSTOP/, '#006a4e', '#ffffff'], [/^CAPITAL ONE/, '#ffffff', '#004977'],
  [/^CITIZENS( BANK)?$/, '#008555', '#ffffff'], [/UPS STORE/, '#351c15', '#ffb500'], [/^7[- ]?ELEVEN/, '#ffffff', '#008061'], [/^JUST SALAD/, '#f37021', '#ffffff'], [/^PARIS BAGUETTE/, '#003b7d', '#ffffff'], [/^SWEETGREEN/, '#0e150e', '#e6ff55'],
  [/^TARGET( STORE)?$/, '#cc0000', '#ffffff'], [/POST OFFICE|^USPS/, '#ffffff', '#004b87'], [/^PRET A MANGER/, '#8b1a2b', '#ffffff'], [/^FAMILY DOLLAR/, '#ffffff', '#e2231a'], [/^PLANET FITNESS/, '#5c2d91', '#fff200'], [/^C[- ]?TOWN/, '#e31837', '#fff200'],
  [/^SPECTRUM/, '#ffffff', '#0099d8'], [/^VAN LEEUWEN/, '#f6e27a', '#1a1a1a'], [/CROWN FRIED CHICKEN/, '#c8102e', '#ffd100'], [/^FEDEX/, '#ffffff', '#4d148c'], [/^SHAKE SHACK/, '#1f1f1f', '#6cb33f'], [/^WELLS FARGO/, '#d71e28', '#ffcd41'],
  [/^GOLDEN KRUST/, '#ffc20e', '#007a33'], [/^GONG CHA/, '#b5121b', '#ffffff'], [/^KFC\b/, '#ffffff', '#e4002b'], [/^PAPA JOHN/, '#00704a', '#ffffff'], [/^JOE (&|AND|THE) THE JUICE|^JOE & THE JUICE|^JOE THE JUICE/, '#f8c8d0', '#1a1a1a'],
  [/^LITTLE CAESARS/, '#ffffff', '#ff6b00'], [/^APPLE BANK/, '#ffffff', '#c8102e'], [/^EUROPEAN WAX/, '#ffffff', '#e4002b'], [/^FINE FARE/, '#e31837', '#ffffff'], [/^CHICK-?FIL-?A/, '#ffffff', '#e51636'], [/^FLAGSTAR/, '#ffffff', '#c8102e'],
  [/^LE PAIN QUOTIDIEN/, '#f3ead6', '#3a2a1e'], [/^IHOP\b/, '#ffffff', '#1b5fa7'], [/^PIZZA HUT/, '#ee3124', '#ffffff'], [/^BLINK FITNESS/, '#00aeef', '#ffffff'], [/^CHOPT/, '#ffffff', '#ee3524'], [/^PLAYA BOWLS/, '#ffffff', '#ec008c'],
  [/^KUNG FU TEA/, '#c8102e', '#ffffff'], [/^LUCKIN/, '#1a3a8a', '#ffffff'], [/^PANERA/, '#5b6f2a', '#ffffff'], [/^STAPLES\b/, '#cc0000', '#ffffff'], [/^BLANK STREET/, '#cfe3c8', '#1a1a1a'], [/^DOLLAR GENERAL/, '#fff200', '#000000'],
  [/^SEPHORA/, '#000000', '#ffffff'], [/^XI'?AN FAMOUS/, '#000000', '#ffffff'], [/^BRAVO SUPERMARKET/, '#e31837', '#fff200'], [/^CRICKET/, '#6cc04a', '#ffffff'], [/^MARSHALLS/, '#ffffff', '#00338d'], [/^WHITE CASTLE/, '#ffffff', '#003f87'],
  [/^INSOMNIA COOKIES/, '#4b2e83', '#ffffff'], [/^ORANGETHEORY/, '#f58220', '#ffffff'], [/^PANDA EXPRESS/, '#ffffff', '#d02b2e'], [/^BLUE BOTTLE/, '#ffffff', '#00a3e0'], [/^EQUINOX/, '#000000', '#ffffff'], [/^GREGORYS/, '#000000', '#f5821f'],
  [/^JUICE GENERATION/, '#ffffff', '#6cb33f'], [/^PETCO/, '#ffffff', '#00467f'], [/^WHOLE FOODS/, '#00674b', '#ffffff'], [/^TRADER JOE/, '#ba0c2f', '#ffffff'], [/^NIKE\b/, '#000000', '#ffffff'], [/^APPLE (STORE|FIFTH|SOHO|GRAND)|^APPLE$/, '#f5f5f7', '#1d1d1f'],
  [/^H ?& ?M\b/, '#ffffff', '#e50010'], [/^ZARA\b/, '#ffffff', '#000000'], [/^UNIQLO/, '#ff0000', '#ffffff'], [/^BEST BUY/, '#0046be', '#fff200'], [/^HOME DEPOT|^THE HOME DEPOT/, '#f96302', '#ffffff'], [/^RITE AID/, '#ffffff', '#00539b'],
  [/^FIVE GUYS/, '#ffffff', '#d21033'], [/^BASKIN/, '#ffffff', '#e6007e'], [/^TIM HORTONS/, '#c8102e', '#ffffff'], [/^HSBC/, '#ffffff', '#db0011'], [/^WHITE CASTLE/, '#ffffff', '#003f87'], [/^FOOT LOCKER/, '#000000', '#ffffff'], [/^GAP\b/, '#002868', '#ffffff'],
];
/** The chain a name belongs to, as [background, lettering], or null. */
export const brandOf = name => { const found = BRANDS.find(([pattern]) => pattern.test(name)); return found ? [found[1], found[2]] : null; };

export function signFor(place, language = null) {
  const name = placeName(place), brand = brandOf(name), schemes = KIND_SCHEMES[place.kind] || SCHEMES[KIND[place.kind]?.group] || SCHEMES.shop;
  const [background, lettering] = brand || schemes[hashText(`${name}|${place.x}|${place.z}`) % schemes.length];
  // A chain's sign is its name and nothing more.
  if (brand) return { name, tagline: '', background, lettering };
  // A sign does not say the same thing twice: words already in the name are left out of the line under it.
  const said = new Set(name.split(/[^A-Z]+/)), tagline = (TAGLINES[place.kind] || '').split(/ {2,}/).filter(item => item && !item.split(' ').some(word => said.has(word) || said.has(`${word}S`) || said.has(word.replace(/S$/, '')))).join('  ');
  // Where many of the neighbours speak another language at home, the sign says what the place is in it too.
  const word = language ? localWord(place, language) : '';
  return { name, tagline: word ? (tagline ? `${word}  ${tagline}` : word) : tagline, background, lettering };
}
