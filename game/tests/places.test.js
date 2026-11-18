import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KINDS, KIND, cuisineKind, storeKind, tradeName, placeName, mergePlaces, packPlace, unpackPlace, placeCellKey, PLACE_CELL, createPlaceSource, indexFootprints, solveFrontages, frontWidth, isOpen, signFor, joinPlaceSources, osmKind, brandOf } from '../dist/places.js';

const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8'));

test('every kind of place has a plain name, and the registers\' own categories are gathered into them', () => {
  assert.equal(new Set(KINDS.map(kind => kind.id)).size, KINDS.length);
  assert.ok(KINDS.every((kind, i) => kind.index === i && kind.label && kind.group && KIND[kind.id] === kind));
  // The health department's cuisines.
  assert.deepEqual(['Pizza', 'Tex-Mex', 'Chinese/Cuban', 'Coffee/Tea', 'Bagels/Pretzels', 'Irish', 'Jewish/Kosher', 'Bangladeshi', 'Frozen Desserts', 'American', '', undefined, 'Not Listed/Not Applicable'].map(cuisineKind),
    ['pizza', 'mexican', 'chinese', 'coffee', 'bagels', 'pub', 'kosher', 'indian', 'icecream', 'american', 'american', 'american', 'american']);
  // A food store is what its name says it is; failing that, what its floor area says.
  assert.deepEqual([storeKind('CVS PHARMACY #2811', 9000), storeKind('FAMILY DOLLAR 4532', 8000), storeKind('BP', 1200), storeKind('LA CARNICERIA MEAT MARKET', 900), storeKind('KEY FOOD', 0)],
    ['pharmacy', 'variety', 'gas', 'butcher', 'supermarket']);
  assert.deepEqual([storeKind('JILI MINI MARKET', 1000), storeKind('GOLDEN FARM', 0), storeKind('NEIGHBOURS', 4000), storeKind('NEIGHBOURS', 14000), storeKind('NEIGHBOURS', 0)], ['bodega', 'produce', 'grocery', 'supermarket', 'bodega']);
});

test('a sign carries a trade name, never the name of whoever holds the licence', () => {
  // A register of trade names is taken at its word, tidied for a sign.
  assert.equal(tradeName('  fanelli   cafe ', { trading: true }), 'FANELLI CAFE');
  assert.equal(tradeName('7 ELEVEN STORE #37539A', { trading: true }), '7 ELEVEN STORE');
  assert.equal(tradeName('MARRIOTT MARQUIS - MAIN KITCHEN AND BANQUET ROOMS', { trading: true }), 'MARRIOTT MARQUIS - MAIN KITCHEN');
  // A company name loses its legal form; what follows D/B/A is the trade name.
  assert.equal(tradeName('SMITH DELI CORP.'), 'SMITH DELI');
  assert.equal(tradeName('MEDUSA SALON INC', { owner: 'FRASCA KYM' }), 'MEDUSA SALON');
  assert.equal(tradeName('ABC HOLDINGS LLC D/B/A THE CORNER SPOT'), 'THE CORNER SPOT');
  // A licence held in a person's own name gives no sign.
  assert.equal(tradeName('KYM FRASCA', { owner: 'Frasca, Kym' }), '');
  assert.equal(tradeName('SINGH HARPREET'), '');
  assert.equal(tradeName('O\'BRIEN, MARY T'), '');
  assert.equal(tradeName(''), ''); assert.equal(tradeName(null), ''); assert.equal(tradeName('X', { trading: true }), '');
  // Such a place is known by what it is.
  assert.equal(placeName({ kind: 'barber', name: '' }), 'BARBER SHOP');
  assert.equal(placeName({ kind: 'barber', name: 'ABOVE CUT' }), 'ABOVE CUT');
  for (const kind of KINDS) assert.ok(/^[A-Z ]+$/.test(placeName({ kind: kind.id, name: '' })));
});

test('the same business in two registers is one place, and a place survives being stored', () => {
  const at = (kind, name, x, z, extra = {}) => ({ kind, name, x, z, ...extra });
  const merged = mergePlaces([
    at('bar', 'FANELLIS', 12, 3, { rank: 5 }), at('american', 'FANELLI CAFE', 10, 0, { rank: 1, grade: 'A', bin: 1007622 }),   // a restaurant and its liquor licence
    at('bar', 'THE EAR INN', 300, 0, { rank: 5 }), at('pizza', 'RAYS', 304, 2, { rank: 1 }),                                   // a bar beside a pizzeria
    at('hotel', 'HOTEL EDISON', 500, 0, { rank: 5 }), at('hotel', 'EDISON HOTEL', 520, 4, { rank: 4, bin: 1024787 }),          // one hotel, two licences
    at('bodega', 'A DELI', 700, 0, { rank: 2 }), at('bodega', 'A DELI', 704, 1, { rank: 2 }), at('bodega', 'B DELI', 706, 1, { rank: 2 }),
    at('nowhere', 'X', 0, 0), at('bar', 'LOST', NaN, 0),
  ]);
  assert.deepEqual(merged.map(place => place.name).sort(), ['A DELI', 'B DELI', 'EDISON HOTEL', 'FANELLI CAFE', 'RAYS', 'THE EAR INN']);
  const cafe = merged.find(place => place.name === 'FANELLI CAFE'), row = packPlace({ ...cafe, area: 812.4 });
  assert.deepEqual(row, [10, 0, KIND.american.index, 'FANELLI CAFE', 1007622, 812, 'A']);
  assert.deepEqual(unpackPlace(row, '0,0:7'), { id: '0,0:7', x: 10, z: 0, kind: 'american', group: 'dining', name: 'FANELLI CAFE', bin: 1007622, area: 812, grade: 'A' });
  assert.equal(unpackPlace([0, 0, 999, 'X', 0, 0, ''], 'x'), null);
  assert.equal(placeCellKey(-1, 2500), '-1,2');
});

test('the bundled places cover the city, keyed as the index says', () => {
  const index = read('places-index.json');
  // Rows name a kind by its place in the list, and kinds are only ever added at its end: an older bundle's list is the start of today's.
  assert.deepEqual(index.kinds, KINDS.map(kind => kind.id).slice(0, index.kinds.length), 'the bundle was built with the kinds the game knows');
  assert.equal(index.cellSize, PLACE_CELL);
  assert.ok(index.total > 50000 && Object.keys(index.cells).length > 600, `${index.total} places in ${Object.keys(index.cells).length} cells`);
  assert.ok(Object.keys(index.counts).length > 50 && index.counts.bodega > 4000 && index.counts.nails > 1000 && index.counts.repair > 1500 && index.counts.pizza > 800);
  for (const source of Object.values(index.sources)) assert.ok(/^https:\/\/data\.(cityofnewyork\.us|ny\.gov)\/d\/[a-z0-9]{4}-[a-z0-9]{4}$/.test(source.url) && source.read > 0 && source.agency);
  let total = 0, graded = 0, restaurants = 0;
  for (const [key, cell] of Object.entries(index.cells)) {
    const [cx, cz] = key.split(',').map(Number), data = read(cell.url.replace('./', ''));
    assert.equal(data.places.length, cell.count);
    data.places.forEach((row, i) => {
      const place = unpackPlace(row, `${key}:${i}`);
      assert.ok(place, `${key} row ${i} is a kind the game knows`);
      assert.ok(Math.floor(place.x / PLACE_CELL) === cx && Math.floor(place.z / PLACE_CELL) === cz, `${place.name} lies in its cell`);
      assert.ok(typeof place.name === 'string' && place.name.length <= 34 && place.name === place.name.toUpperCase() && !/\b(INC|LLC|CORP)\b/.test(place.name), place.name);
      assert.ok(['', 'A', 'B', 'C'].includes(place.grade) && Number.isInteger(place.bin) && place.area >= 0);
      if (['food', 'cafe', 'dining'].includes(place.group)) { restaurants++; if (place.grade) graded++; }
    });
    total += data.places.length;
  }
  assert.equal(total, index.total);
  assert.ok(graded / restaurants > .5, `${graded} of ${restaurants} places to eat carry an inspection grade`);
});

test('places load a square kilometre at a time around the player', async () => {
  const files = { './places/0_0.json': { places: [[100, 100, KIND.pizza.index, 'RAYS', 0, 0, 'A'], [900, 900, KIND.bodega.index, '', 0, 800, '']] }, './places/1_0.json': { places: [[1100, 100, KIND.nails.index, 'LUCKY NAILS', 0, 0, '']] } };
  const asked = [], source = createPlaceSource({ load: async url => { asked.push(url); if (!files[url]) throw new Error('missing'); return files[url]; } });
  assert.equal(source.ready, false); source.request(100, 100, 300);
  assert.deepEqual(asked, [], 'nothing is asked for before the index is known');
  source.setIndex({ cells: { '0,0': { url: './places/0_0.json' }, '1,0': { url: './places/1_0.json' }, '5,5': { url: './places/5_5.json' } } });
  const before = source.version;
  source.request(950, 100, 300); source.request(950, 100, 300);
  assert.deepEqual(asked.sort(), ['./places/0_0.json', './places/1_0.json'], 'each cell in reach is asked for once');
  assert.deepEqual(source.near(950, 100, 300), [], 'nothing until it arrives');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(source.version > before);
  assert.deepEqual(source.near(950, 100, 300).map(place => `${place.id} ${place.name} ${place.kind}`), ['1,0:0 LUCKY NAILS nails'], 'nearest first, within reach');
  assert.deepEqual(source.near(100, 100, 2000).map(place => place.name), ['RAYS', 'LUCKY NAILS', '']);
  // A cell that fails to load is asked for again later; one left far behind is let go.
  source.request(5500, 5500, 300); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(asked.filter(url => url === './places/5_5.json').length, 1);
  source.request(5500, 5500, 300);
  assert.equal(asked.filter(url => url === './places/5_5.json').length, 2);
  assert.deepEqual(source.near(100, 100, 2000), [], 'the cells by the origin were let go');
});

// A block: two buildings side by side on the north side of a street that runs along z = 0 to 12, with a yard behind.
const block = () => [
  { id: 'a', polygon: [[0, -20], [20, -20], [20, 0], [0, 0]], holes: [] },
  { id: 'b', polygon: [[20, -20], [50, -20], [50, 0], [20, 0]], holes: [] },
  { id: 'yard', polygon: [[0, -60], [50, -60], [50, -40], [0, -40]], holes: [] },
];
const street = (x, z) => z > 0 && z < 12;
const place = (id, kind, x, z, extra = {}) => ({ id, kind, group: KIND[kind].group, name: id.toUpperCase(), x, z, bin: 0, area: 0, grade: '', ...extra });

test('a place takes the stretch of its building\'s street wall nearest where the register puts it', () => {
  const footprints = indexFootprints(block());
  assert.equal(footprints.at(10, -10).id, 'a'); assert.equal(footprints.at(10, -30), null); assert.equal(footprints.count, 3);
  const fronts = solveFrontages([place('deli', 'bodega', 6, -12), place('nails', 'nails', 40, -3), place('alley', 'coffee', 25, -50), place('stand', 'fruitstand', 10, -5), place('far', 'pizza', 300, 300), place('kerb', 'pizza', 30, 4)], footprints, street);
  const by = Object.fromEntries(fronts.map(front => [front.place.id, front]));
  assert.deepEqual(Object.keys(by).sort(), ['deli', 'kerb', 'nails'], 'no front for a place with no street wall, no building, or a stand on the sidewalk');
  // On the wall line, facing the street, as far along as the register's point.
  assert.deepEqual([by.deli.z, by.deli.nx, by.deli.nz, by.deli.building.id], [0, 0, 1, 'a']);
  assert.ok(Math.abs(Math.abs(by.deli.tx) - 1) < 1e-9 && Math.abs(by.deli.tz) < 1e-9);
  assert.ok(Math.abs(by.deli.x - 6) < 1e-9 && by.deli.width === 7);
  assert.ok(Math.abs(by.nails.x - 40) < 1e-9 && by.nails.building.id === 'b');
  // A point the register puts just outside, on the sidewalk, belongs to the nearest building.
  assert.ok(by.kerb.building.id === 'b' && by.kerb.z === 0);
  // A front never hangs off the end of its wall when the wall has room for it.
  const edge = solveFrontages([place('corner', 'bodega', 0.5, -5)], footprints, street)[0];
  assert.ok(Math.abs(edge.x - 3.5) < 1e-9, 'half its width in from the corner');
});

test('neighbours share a wall, the passing trade gets it first, and big shops take more of it', () => {
  const footprints = indexFootprints(block());
  // Three places the register puts at one spot in the 30 m building, and more than its wall has room for.
  const crowd = ['salon', 'bodega', 'pizza', 'nails', 'barber', 'coffee', 'liquor'].map((kind, i) => place(`p${i}-${kind}`, kind, 35, -8));
  const fronts = solveFrontages(crowd, footprints, street);
  assert.equal(fronts.length, 5, '30 m of street wall has room for five');
  assert.deepEqual(fronts.map(front => front.place.kind).sort(), ['barber', 'bodega', 'coffee', 'liquor', 'pizza'], 'salons, most often upstairs, give way');
  const xs = fronts.map(front => front.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 4.5, `fronts ${(xs[i] - xs[i - 1]).toFixed(1)} m apart`);
  // Width: a shop front at least; a food store by its floor area; a hotel or a theatre more.
  assert.deepEqual([frontWidth(place('x', 'barber', 0, 0)), frontWidth(place('x', 'hotel', 0, 0)), frontWidth(place('x', 'school', 0, 0))], [7, 12, 10]);
  assert.equal(frontWidth(place('x', 'bodega', 0, 0, { area: 900 })), 7);
  assert.ok(Math.abs(frontWidth(place('x', 'supermarket', 0, 0, { area: 12000 })) - Math.sqrt(12000 * .0929) * .7) < 1e-9);
  assert.equal(frontWidth(place('x', 'supermarket', 0, 0, { area: 200000 })), 26); assert.equal(frontWidth(place('x', 'supermarket', 0, 0)), 16);
});

test('opening hours and signs follow the kind of place', () => {
  const open = (kind, hours) => isOpen(kind, hours);
  assert.ok(open('bodega', 3.5) && open('hotel', 4) && open('firehouse', 2), 'some never close');
  assert.ok(open('bar', 23) && open('bar', 1.5) && !open('bar', 9) && open('club', 2) && !open('club', 18));
  assert.ok(open('coffee', 6.5) && !open('coffee', 22) && open('pizza', 0.5) && !open('pizza', 4));
  assert.ok(open('nails', 12) && !open('nails', 21) && open('repair', 9) && !open('repair', 20) && open('library', 10) && !open('library', 19));
  for (const kind of KINDS) for (let hours = 0; hours < 24; hours += .5) assert.equal(typeof isOpen(kind.id, hours), 'boolean');
  // A sign: the trade name, what else it says, and colours the kind is seen in. Always the same for the same place.
  const deli = signFor(place('rays super deli', 'bodega', 5, 5));
  assert.equal(deli.name, 'RAYS SUPER DELI'); assert.equal(deli.tagline, 'GROCERY  ATM  LOTTO  COLD CUTS', 'the sign does not say DELI twice');
  assert.deepEqual(signFor(place('rays super deli', 'bodega', 5, 5)), deli);
  assert.equal(signFor({ ...place('x', 'bodega', 5, 5), name: '' }).name, 'DELI GROCERY');
  assert.equal(signFor({ ...place('x', 'bodega', 5, 5), name: '' }).tagline, 'ATM  LOTTO  COLD CUTS');
  assert.equal(signFor(place('lucky nails & spa', 'nails', 1, 1)).tagline, 'WAXING');
  for (const kind of KINDS) { const sign = signFor({ ...place('x', kind.id, 1, 2), name: '' }); assert.ok(/^#[0-9a-f]{6}$/.test(sign.background) && /^#[0-9a-f]{6}$/.test(sign.lettering) && sign.background !== sign.lettering && sign.name); }
  const seen = new Set(Array.from({ length: 40 }, (_, i) => signFor(place(`deli ${i}`, 'bodega', i, 0)).background));
  assert.ok(seen.size >= 3, 'bodegas do not all have the same awning');
});

test('the shops no register lists come from OpenStreetMap, bundled apart and under its licence', () => {
  const index = JSON.parse(readFileSync(new URL('../dist/shops-index.json', import.meta.url), 'utf8'));
  assert.deepEqual(index.kinds, KINDS.map(kind => kind.id).slice(0, index.kinds.length));
  assert.ok(index.total > 8000 && index.total < 40000 && Object.keys(index.cells).length > 300, `${index.total} shops`);
  assert.match(index.licence.attribution, /OpenStreetMap contributors/); assert.match(index.licence.url, /odbl/);
  // None is of a kind a register already lists, so nothing is counted twice.
  const registers = JSON.parse(readFileSync(new URL('../dist/places-index.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(index.counts).filter(kind => registers.counts[kind]), []);
  assert.ok(index.counts.clothes > 1000 && index.counts.bank > 500 && index.counts.laundromat > 500);
  const key = placeCellKey(126, -80), cell = JSON.parse(readFileSync(new URL(`../dist/${index.cells[key].url.slice(2)}`, import.meta.url), 'utf8'));
  assert.equal(cell.places.length, index.cells[key].count);
  const soho = cell.places.map((row, i) => unpackPlace(row, `o${key}:${i}`));
  assert.ok(soho.every(place => place && place.group && Math.abs(place.x) < 40000) && soho.filter(place => place.kind === 'clothes').length > 30, 'SoHo is clothes shops');
  assert.deepEqual([osmKind({ shop: 'laundry' }), osmKind({ amenity: 'bank' }), osmKind({ leisure: 'fitness_centre' }), osmKind({ shop: 'convenience' }), osmKind({}), osmKind(null)], ['laundromat', 'bank', 'gym', null, null, null]);
  assert.deepEqual([isOpen('bank', 12), isOpen('bank', 19), isOpen('laundromat', 22), isOpen('gym', 5.5)], [true, false, true, true]);
  assert.deepEqual(signFor({ kind: 'cleaners', name: '', x: 1, z: 1 }).name, 'DRY CLEANERS');
});

test('two sources of places read as one, nearest first, each keeping its own ids', () => {
  const index = { cells: { '0,0': { url: 'a' } } }, row = (x, kind) => [x, 0, KINDS.findIndex(k => k.id === kind), kind.toUpperCase(), 0, 0, ''];
  const first = createPlaceSource({ index, load: async () => ({ places: [row(10, 'pizza'), row(300, 'bar')] }) }), second = createPlaceSource({ index, prefix: 'o', load: async () => ({ places: [row(50, 'bank')] }) });
  const both = joinPlaceSources(first, second);
  assert.equal(both.ready, true); both.request(0, 0, 100);
  return new Promise(resolve => setTimeout(resolve, 5)).then(() => {
    assert.equal(both.version, 2);
    assert.deepEqual(both.near(0, 0, 500).map(place => [place.id, place.kind]), [['0,0:0', 'pizza'], ['o0,0:0', 'bank'], ['0,0:1', 'bar']]);
    assert.deepEqual(both.near(0, 0, 20).map(place => place.kind), ['pizza']);
  });
});

test('a chain is signed in its own colours with its name alone; a name that only begins like one is not', () => {
  const sign = (name, kind = 'coffee') => signFor({ kind, name, x: 3, z: 4 });
  assert.deepEqual(sign('STARBUCKS'), { name: 'STARBUCKS', tagline: '', background: '#00704a', lettering: '#ffffff' });
  assert.deepEqual([sign('STARBUCKS COFFEE').background, sign("MCDONALD'S", 'burgers').background, sign('CHASE', 'bank').lettering, sign('CHASE BANK', 'bank').lettering, sign("DUNKIN'", 'donuts').lettering, sign('T-MOBILE', 'phones').background],
    ['#00704a', '#da291c', '#117aca', '#117aca', '#f5821f', '#e20074']);
  // The same on every block, and with a second language nothing is added to it.
  assert.deepEqual(signFor({ kind: 'coffee', name: 'STARBUCKS', x: 900, z: -70 }, 'spanish'), sign('STARBUCKS'));
  for (const name of ['CHASE MANHATTAN PLAZA DELI', 'SUBWAY INN', 'TARGET MARGIN THEATER', 'CITIZEN PIZZA', "JOE'S PIZZA", 'FANELLI CAFE', '']) assert.equal(brandOf(name), null, name);
  assert.notEqual(sign('SUBWAY INN', 'bar').tagline === '' && sign('SUBWAY INN', 'bar').background === '#008c15', true);
  for (const name of ['SUBWAY', 'TARGET', 'NIKE', 'WHOLE FOODS MARKET', "TRADER JOE'S", 'CVS PHARMACY', 'DUANE READE', 'BANK OF AMERICA']) { const brand = brandOf(name); assert.ok(brand && brand.every(colour => /^#[0-9a-f]{6}$/.test(colour)) && brand[0] !== brand[1], name); }
});
