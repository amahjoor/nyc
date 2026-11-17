import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCityLife, characterAt, rhythm, assumedPeak, wardrobe, traffic, manhattanCore, OUTFITS, WALKING_PACE } from '../dist/citylife.js';
import { projectPoint } from '../dist/streetscape.js';

const data = JSON.parse(readFileSync(new URL('../dist/street-life.json', import.meta.url), 'utf8'));
const life = createCityLife(data);
const at = (lat, lon) => projectPoint(lon, lat);
const TIMES_SQUARE = at(40.7580, -73.9855), WALL_STREET = at(40.7069, -74.0113), EAST_VILLAGE = at(40.7285, -73.9875);
const PARK_SLOPE = at(40.6710, -73.9814), TOTTENVILLE = at(40.5120, -74.2510), FLUSHING = at(40.7597, -73.8300);

test('the bundled lists are what the city publishes, in game metres', () => {
  assert.equal(data.version, 1);
  for (const name of ['lpi', 'exclusive', 'shelters', 'baskets']) {
    const flat = data[name];
    assert.ok(Array.isArray(flat) && flat.length % 2 === 0 && flat.every(Number.isInteger), name);
    for (let i = 0; i < flat.length; i += 2) assert.ok(Math.abs(flat[i]) < 40000 && Math.abs(flat[i + 1]) < 40000, `${name} lies within the city`);
    assert.match(data.sources[name].url, /^https:\/\/data\.cityofnewyork\.us\/d\/[a-z0-9]{4}-[a-z0-9]{4}$/);
  }
  assert.ok(data.lpi.length / 2 > 5000, 'thousands of signals give pedestrians a head start');
  assert.ok(data.exclusive.length / 2 > 500 && data.exclusive.length < data.lpi.length);
  assert.ok(data.shelters.length / 2 > 3000 && data.baskets.length / 2 > 15000);
  assert.ok(data.counts.length >= 100);
  for (const count of data.counts) {
    assert.ok(Number.isInteger(count.x) && Number.isInteger(count.z) && count.at.length > 3);
    for (const period of ['am', 'pm', 'saturday']) assert.ok(count[period] === null || (count[period] > 0 && count[period] < 30000), `${count.at} ${period}`);
  }
  // The busiest counted sidewalks in the city are in Midtown.
  const busiest = [...data.counts].sort((a, b) => (b.pm || 0) - (a.pm || 0))[0];
  assert.ok(manhattanCore(busiest.x, busiest.z) && busiest.pm > 4000, `${busiest.at}: ${busiest.pm} an hour`);
});

test('places have a character, and the Manhattan core is where it should be', () => {
  for (const [x, z] of [TIMES_SQUARE, WALL_STREET, EAST_VILLAGE, at(40.7968, -73.9500)]) assert.ok(manhattanCore(x, z));
  for (const [x, z] of [PARK_SLOPE, TOTTENVILLE, FLUSHING, at(40.8200, -73.9450), at(40.7440, -73.9560), at(40.7450, -74.0320)]) assert.ok(!manhattanCore(x, z), 'Harlem, Long Island City, Hoboken and the outer boroughs are outside it');
  const square = characterAt(...TIMES_SQUARE), wall = characterAt(...WALL_STREET), village = characterAt(...EAST_VILLAGE), slope = characterAt(...PARK_SLOPE);
  assert.equal(square.visited, 1); assert.ok(square.business > .8);
  assert.ok(wall.business > .8 && wall.evenings < .2);
  assert.ok(village.evenings > .6 && village.business < .3);
  assert.ok(slope.homes > .9 && slope.business === 0 && slope.visited === 0);
  for (const character of [square, wall, village, slope]) for (const key of ['business', 'visited', 'evenings', 'shopping', 'homes']) assert.ok(character[key] >= 0 && character[key] <= 1, key);
});

test('each kind of place keeps its own hours', () => {
  const wall = characterAt(...WALL_STREET), village = characterAt(...EAST_VILLAGE), square = characterAt(...TIMES_SQUARE), slope = characterAt(...PARK_SLOPE);
  const peak = character => { let best = 0; for (let h = 0; h < 24; h += .25) if (rhythm(character, h) > rhythm(character, best)) best = h; return best; };
  // Offices: busy at nine, one and half past five, deserted at night.
  assert.ok(rhythm(wall, 8.5) > .6 && rhythm(wall, 12.8) > .7 && rhythm(wall, 17.6) > .8);
  assert.ok(rhythm(wall, 22.5) < .35 && rhythm(wall, 3) < .08);
  // Bars: the street is as full at half past ten as on the walk home, and still alive at one in the morning.
  assert.ok(rhythm(village, 22.5) > rhythm(village, 17.6) * .85, `${rhythm(village, 22.5).toFixed(2)} late against ${rhythm(village, 17.6).toFixed(2)} early`);
  assert.ok(rhythm(village, 1) > rhythm(wall, 1) * 2);
  // Times Square is busier at ten at night than a residential block ever is.
  assert.ok(rhythm(square, 22) > .45);
  assert.ok(peak(slope) > 16 && peak(slope) < 19.5);
  for (const character of [wall, village, square, slope]) for (let h = 0; h < 24; h += .5) {
    const value = rhythm(character, h);
    assert.ok(value >= .035 && value <= 1.0001, `${value} at ${h}`);
    assert.ok(Math.abs(rhythm(character, h + 24) - value) < 1e-9, 'the day wraps');
  }
  assert.ok(assumedPeak(square) > assumedPeak(wall) && assumedPeak(wall) > assumedPeak(slope) * 5);
});

test('footfall follows the counts where there are counts and the model elsewhere', () => {
  // At a counted corner the evening figure is close to what was counted.
  for (const count of data.counts.filter(c => c.am && c.pm).slice(0, 40)) {
    const modelled = life.footfall(count.x, count.z, 17.5);
    assert.ok(modelled > count.pm * .45 && modelled < count.pm * 2.2, `${count.at}: counted ${count.pm}, modelled ${Math.round(modelled)}`);
  }
  const square = life.footfall(...TIMES_SQUARE, 17.5), slope = life.footfall(...PARK_SLOPE, 17.5), far = life.footfall(...TOTTENVILLE, 17.5);
  assert.ok(square > 3000 && square < 12000, `Times Square: ${Math.round(square)} an hour`);
  assert.ok(slope < square / 4 && far < 400);
  // Three in the morning is quiet everywhere, and quietest where nobody lives.
  assert.ok(life.footfall(...TIMES_SQUARE, 3) < square * .12);
  assert.ok(life.footfall(...WALL_STREET, 3) < life.footfall(...WALL_STREET, 13) * .1);
  // Crowding is flow over pace: forty-odd people on a hundred metres of Times Square sidewalk.
  const crowd = life.crowding(...TIMES_SQUARE, 17.5) * 100;
  assert.ok(Math.abs(crowd - square / 2 / 3600 / WALKING_PACE * 100) < 1e-9 && crowd > 25 && crowd < 120, `${crowd.toFixed(0)} people per 100 m`);
  // Without the bundle the model still answers.
  const bare = createCityLife(null);
  assert.ok(bare.footfall(...TIMES_SQUARE, 17.5) > 2000); assert.deepEqual(bare.hintsAt(0, 0), { lpi: false, exclusive: false });
});

test('the city\'s signal lists are found at their corners and nowhere else', () => {
  const [x, z] = [data.lpi[0], data.lpi[1]];
  assert.equal(life.hintsAt(x, z).lpi, true); assert.equal(life.hintsAt(x + 20, z - 15).lpi, true, 'a corner is found from anywhere in the junction');
  assert.equal(life.hintsAt(...TOTTENVILLE.map(v => v + 3000)).lpi, false);
  const [ex, ez] = [data.exclusive[0], data.exclusive[1]];
  assert.equal(life.hintsAt(ex, ez).exclusive, true);
  // Most of the head-start signals are outside Manhattan: it is a citywide programme.
  let core = 0; for (let i = 0; i < data.lpi.length; i += 2) core += manhattanCore(data.lpi[i], data.lpi[i + 1]);
  assert.ok(core / (data.lpi.length / 2) < .5);
});

test('dress and traffic follow the place and the hour', () => {
  const wall = characterAt(...WALL_STREET), village = characterAt(...EAST_VILLAGE), slope = characterAt(...PARK_SLOPE);
  for (const [character, hours] of [[wall, 13], [wall, 23], [village, 23], [slope, 8], [slope, 15]]) {
    const share = wardrobe(character, hours);
    assert.deepEqual(Object.keys(share).sort(), [...OUTFITS].sort());
    assert.ok(Math.abs(Object.values(share).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    assert.ok(Object.values(share).every(value => value >= 0 && value <= 1));
  }
  const lunch = wardrobe(wall, 13), night = wardrobe(wall, 23), home = wardrobe(slope, 13), bars = wardrobe(village, 23);
  assert.ok(lunch.suit + lunch.office > .3, 'office clothes fill Wall Street at lunch');
  assert.ok(lunch.suit < lunch.office, 'but in July more shirts than jackets');
  assert.ok(night.suit + night.office < .08 && home.suit + home.office < .02);
  assert.ok(bars.evening > .3 && bars.evening > wardrobe(slope, 23).evening * 2);
  // Traffic: rush hours are the peak, the small hours a sixth of it; cabs rule the core, and more so at night.
  const day = traffic(wall, 17.3), small = traffic(wall, 3.5), outer = traffic(slope, 17.3);
  assert.ok(day.level > .9 && small.level < .25 && outer.level < day.level);
  assert.ok(day.taxis > .3 && small.taxis > day.taxis && outer.taxis < .15);
  assert.equal(day.green, false); assert.equal(outer.green, true, 'green cabs serve everywhere outside the core');
});
