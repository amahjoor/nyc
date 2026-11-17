import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemographics, drawTone, SKIN_TONES, HAIR_TONES } from '../dist/demographics.js';
import { dress, seeded } from '../dist/crowd.js';

const data = JSON.parse(readFileSync(new URL('../dist/demographics.json', import.meta.url), 'utf8'));

test('the bundled survey covers the city tract by tract', () => {
  assert.deepEqual(data.groups, ['white', 'black', 'asian', 'hispanic', 'other']); assert.equal(data.languages.length, 13);
  assert.ok(data.tracts.length > 2000 && data.tracts.length < 2400);
  let residents = 0;
  for (const [x, z, people, groups, languages] of data.tracts) {
    assert.ok(Math.abs(x) < 40000 && Math.abs(z) < 40000 && people >= 50);
    assert.ok(groups.length === 5 && Math.abs(groups.reduce((a, b) => a + b, 0) - 1000) <= 4 && languages.length === 13 && Math.abs(languages.reduce((a, b) => a + b, 0) - 1000) <= 8);
    residents += people;
  }
  assert.ok(residents > 8e6 && residents < 9e6, `${residents} residents`);
  assert.ok(Math.abs(data.city.reduce((a, b) => a + b, 0) - 1000) <= 3 && data.city.every(share => share > 30 && share < 400), 'no group is most of the city');
});

test('a block takes its mix from who lives there, and from the whole city where most people are visitors', () => {
  const only = i => [0, 1, 2, 3, 4].map(k => k === i ? 1000 : 0);
  const made = createDemographics({ groups: data.groups, languages: ['english', 'spanish', 'chinese'], city: [200, 200, 200, 200, 200], tracts: [[0, 0, 4000, only(0), [100, 0, 900]], [3000, 0, 4000, only(1), [300, 700, 0]]] });
  assert.equal(made.tractAt(100, 50).x, 0); assert.equal(made.tractAt(2500, 0).x, 3000); assert.equal(made.tractAt(50000, 50000), null);
  const mean = tones => { let sum = 0, before = 0; tones.skin.forEach((total, i) => { sum += i * (total - before); before = total; }); return sum; };
  const west = made.tonesAt(0, 0), east = made.tonesAt(3000, 0), busy = made.tonesAt(0, 0, 1), nowhere = made.tonesAt(50000, 50000);
  assert.ok(mean(east) - mean(west) > 2, 'the two blocks differ');
  assert.ok(mean(busy) > mean(west) + .5 && mean(busy) < mean(east) - .5, 'a street of visitors is the city');
  assert.deepEqual(nowhere.skin, busy.skin, 'and so is anywhere the survey does not reach');
  // Every group's range is wide: on either block all but the extremes are seen.
  for (const tones of [west, east]) { const seen = new Set(Array.from({ length: 400 }, (_, i) => drawTone(tones.skins, tones.skin, (i + .5) / 400))); assert.ok(seen.size >= 5, `${seen.size} tones on one block`); }
  assert.ok(west.skin.at(-1) > .999 && west.hair.at(-1) > .999 && west.skins === SKIN_TONES && west.hairs === HAIR_TONES);
  assert.deepEqual(made.languagesAt(0, 0).slice(0, 2), [['chinese', .9], ['english', .1]]); assert.deepEqual(made.languagesAt(9e5, 0), [['english', 1]]);
  assert.equal(createDemographics(null).tracts, 0);
});

test('the real city: the figures of the survey come through, and people are dressed as before', () => {
  const real = createDemographics(data), share = (x, z, group) => real.tonesAt(x, z).shares[data.groups.indexOf(group)];
  assert.ok(real.tracts > 2000);
  // Tracts differ a great deal from one end of the city to the other.
  const spread = data.groups.map((_, i) => { const values = data.tracts.map(tract => tract[3][i]); return Math.max(...values) - Math.min(...values); });
  assert.ok(spread.slice(0, 4).every(range => range > 800));
  assert.ok(Math.abs(real.tonesAt(126, -80).shares.reduce((a, b) => a + b, 0) - 1) < .02);
  // Skin and hair come from the mix when there is one; everything else about a person is unchanged.
  const tones = real.tonesAt(126, -80), plain = dress('casual', seeded(5)), mixed = dress('casual', seeded(5), tones);
  assert.ok(SKIN_TONES.includes(mixed.skin) && HAIR_TONES.includes(mixed.hair));
  assert.equal(plain.outfit, mixed.outfit); assert.equal(typeof mixed.top, 'number');
  assert.deepEqual(dress('casual', seeded(5)), plain, 'without a mix nothing has changed');
});
