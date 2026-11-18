import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStreet, parseQuery, createStreetIndex, createPlaceIndex, searchLocal, title } from '../dist/local-search.js';
import { createRoutePlanner } from '../dist/route-planner.js';

const read = path => JSON.parse(readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8'));
const streets = createStreetIndex(createRoutePlanner(read('navigation-roads.json')).roads), names = read('place-names.json'), places = createPlaceIndex(names);
const labels = found => found.map(place => `${place.name} · ${place.borough}`);

test('however a street is written it comes to the same name', () => {
  const same = (key, ...ways) => { for (const way of ways) assert.equal(parseStreet(way).key, key, way); };
  same('W 53 ST', 'West 53rd Street', 'W. 53rd St.', 'w 53 st', 'WEST FIFTY-THIRD STREET', 'west fifty third str');
  same('6 AVE', '6th Ave', 'Sixth Avenue', '6 av', 'Avenue of the Americas', 'ave of the americas');
  same('125 ST', '125th Street', 'one hundred twenty-fifth st', 'One Hundred and Twenty Fifth Street');
  same('AVE A', 'Avenue A', 'ave a'); same('ST MARKS PL', "St. Mark's Place", 'Saint Marks Pl');
  same('WEST ST', 'West Street', 'west st'); same('CENTRAL PARK W', 'Central Park West', 'CPW');
  assert.deepEqual(parseStreet('53rd'), { dir: '', core: '53', suffix: '', key: '53' });
  assert.deepEqual(parseStreet('East Broadway'), { dir: 'E', core: 'BROADWAY', suffix: '', key: 'E BROADWAY' });
  assert.equal(title('W  53 ST'), 'W 53 St'); assert.equal(title('AVE OF THE AMERICAS'), 'Ave of the Americas'); assert.equal(title('FDR DR'), 'FDR Dr');
});

test('what is typed is read as a corner, a numbered address or a name, with its borough if it ends in one', () => {
  for (const text of ['53rd st and 6th ave', '53rd St & 6th Ave', '53rd st at 6th ave', '53rd st @ 6th ave', '53rd st/6th ave', '53rd st + 6th ave', '53rd st x 6th ave', 'corner of 53rd st and 6th ave'])
    assert.deepEqual(parseQuery(text).corner, ['53RD ST', '6TH AVE'], text);
  assert.deepEqual([parseQuery('Bedford Ave & N 7th, Brooklyn').borough, parseQuery('canal and bowery nyc').borough, parseQuery('fordham rd & jerome ave bx').borough, parseQuery('queens blvd & 63 dr queens').borough, parseQuery('bay st and victory blvd, staten island').borough], [3, 1, 2, 4, 5]);
  assert.equal(parseQuery('Brooklyn').text, 'BROOKLYN', 'a borough alone is not cut away to nothing');
  assert.deepEqual([parseQuery('350 5th Ave').numbered, parseQuery('120-55 Queens Blvd').numbered, parseQuery('5th Ave').numbered, parseQuery('53rd st').numbered, parseQuery('Katz').numbered], [true, true, false, false, false]);
  assert.equal(parseQuery('Broadway').corner, null);
});

test('53rd and 6th is found however it is spelled, in each borough that has one', () => {
  const midtown = streets.corners('53rd st', '6th ave')[0];
  // The Museum of Modern Art is on 53rd Street between Fifth and Sixth.
  const moma = places.search('museum of modern art')[0];
  assert.ok(Math.hypot(midtown.x - moma.x, midtown.z - moma.z) < 350, `near 53rd and 6th: ${midtown.x.toFixed(0)}, ${midtown.z.toFixed(0)}`);
  for (const text of ['53rd st and 6th ave', '53 & 6', 'W 53rd St & Avenue of the Americas', 'fifty third street at sixth avenue', '6th ave / 53rd', 'West 53 Street and 6 Av', 'sixth ave x w. 53rd']) {
    const found = searchLocal(text, { streets, places });
    assert.ok(found.length >= 1 && found[0].kind === 'corner' && found[0].borough === 'Manhattan' && Math.hypot(found[0].x - midtown.x, found[0].z - midtown.z) < 1, text);
    assert.match(found[0].name, /53 St/); assert.match(found[0].name, /6 Ave/);
  }
  assert.deepEqual(labels(searchLocal('53rd st and 6th ave', { streets })), ['W 53 St & 6 Ave · Manhattan', '53 St & 6 Ave · Brooklyn']);
  assert.deepEqual(labels(searchLocal('53rd st and 6th ave brooklyn', { streets })), ['53 St & 6 Ave · Brooklyn']);
  assert.deepEqual(labels(searchLocal('fifty third street at sixth avenue, manhattan', { streets })), ['W 53 St & 6 Ave · Manhattan']);
});

test('other corners: a name without its kind, a direction left off, one letter wrong, and streets that never meet', () => {
  assert.equal(labels(searchLocal('broadway and canal', { streets }))[0], 'Broadway & Canal St · Manhattan');
  assert.equal(labels(searchLocal('brodway & canal st', { streets }))[0], 'Broadway & Canal St · Manhattan');
  assert.deepEqual(labels(searchLocal('houston and lafayette', { streets })), ['E Houston St & Lafayette St · Manhattan']);
  assert.deepEqual(labels(searchLocal('bedford ave & n 7th st', { streets })), ['Bedford Ave & N 7 St · Brooklyn']);
  assert.deepEqual(labels(searchLocal('125th and lenox', { streets })), ['W 125 St & Lenox Ave · Manhattan']);
  assert.deepEqual(searchLocal('w 53rd st and canal st', { streets }), []);
  assert.deepEqual(searchLocal('nosuchstreet and 6th ave', { streets }), []);
  // A street alone is its middle, in each borough it runs through.
  assert.equal(labels(searchLocal('Broadway', { streets }))[0], 'Broadway · Manhattan');
  assert.deepEqual(searchLocal('350 Fifth Avenue', { streets }), [], 'a numbered address is left to the address search');
});

test('a business is found by its name anywhere in the city', () => {
  assert.ok(names.places.length > 60000 && names.places.every(row => row.length === 5 && row[0] && row[4] >= 1 && row[4] <= 5 && names.kinds[row[3]]));
  const first = text => searchLocal(text, { streets, places, near: { x: 126, z: -80 } })[0];
  assert.deepEqual([first('fanelli').name, first('fanelli').what, first('fanelli').borough, first('fanelli').kind], ['FANELLI CAFE', 'Restaurant', 'Manhattan', 'place']);
  assert.equal(first("Katz's").name, "KATZ'S DELICATESSEN"); assert.equal(first('katz deli').name, "KATZ'S DELICATESSEN"); assert.equal(first('strand book').name, 'STRAND BOOKSTORE');
  assert.equal(first('museum of modern art').what, 'Museum');
  // A chain: the nearest branches first, and a borough narrows it.
  const near = places.search('starbucks', { near: { x: 126, z: -80 } }), far = places.search('starbucks', { near: { x: 9000, z: -9000 } });
  assert.equal(near.length, 6); assert.ok(Math.hypot(near[0].x - 126, near[0].z + 80) < 800 && Math.hypot(far[0].x - 9000, far[0].z + 9000) < Math.hypot(near[0].x - 9000, near[0].z + 9000));
  assert.ok(searchLocal('chase bank brooklyn', { places }).every(place => place.borough === 'Brooklyn'));
  assert.deepEqual(searchLocal('zzqx nothing here', { streets, places }), []); assert.deepEqual(places.search('a'), []);
  assert.deepEqual(createPlaceIndex(null).search('fanelli'), []); assert.deepEqual(searchLocal('fanelli'), []);
});
