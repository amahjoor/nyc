import test from 'node:test';
import assert from 'node:assert/strict';
import { laneLayout, PARKING_LANE, PARKED_FROM, DRIVEN_LANE } from '../dist/lanes.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;
const centres = layout => Array.from({ length: layout.count }, (_, i) => layout.first + i * layout.step);

test('a roadway divides into a parking lane at each kerb and travel lanes of about 3.3 m', () => {
  // Seventh Avenue: 60 ft from kerb to kerb, one way.
  const avenue = laneLayout(18.29, true);
  assert.equal(avenue.count, 4); assert.ok(close(avenue.width, (18.29 - 4.6) / 4)); assert.equal(avenue.driven, true);
  // Lane 0 is the right-hand one; the rest lie to its left, and the four sit evenly about the centreline.
  assert.ok(centres(avenue).every((centre, i, all) => close(centre, -all[all.length - 1 - i])) && avenue.first > 0 && avenue.step < 0);
  // The same width carrying traffic both ways: two lanes each side, the first beside the centreline.
  const both = laneLayout(18.29, false);
  assert.equal(both.count, 2); assert.ok(close(both.first, both.width / 2) && close(both.step, both.width)); assert.equal(both.driven, true);
  assert.ok(close(centres(both)[1] + both.width / 2, 18.29 / 2 - PARKING_LANE), 'the outer lane ends where the parking lane begins');
  // A side street: one file each way, or one in all.
  assert.deepEqual([laneLayout(9.14, false).count, laneLayout(9.14, false).driven, laneLayout(9.14, true).count, laneLayout(9.14, true).driven], [1, false, 1, false]);
  // Under nine metres there is no room to set parking lanes aside: whatever is painted, traffic keeps to one file.
  const narrow = laneLayout(7.92, true);
  assert.ok(close(narrow.count * narrow.width, 7.92) && narrow.driven === false);
  // Fifty feet both ways paints two lanes a side too narrow to drive abreast in.
  const tight = laneLayout(15.24, false);
  assert.ok(tight.count === 2 && tight.width < DRIVEN_LANE && tight.driven === false);
});

test('whatever the width, the lanes fit between the parking lanes and moving files stay clear of each other and of the kerb', () => {
  for (let width = 5; width <= 45; width += .07) for (const oneWay of [true, false]) {
    const layout = laneLayout(width, oneWay), half = width / 2, kept = width >= PARKED_FROM ? PARKING_LANE : 0;
    assert.ok(layout.count >= 1 && layout.width > 1.6, `${width.toFixed(2)} m: ${layout.count} lanes of ${layout.width.toFixed(2)} m`);
    assert.ok(close(layout.count * layout.width * (oneWay ? 1 : 2), width - 2 * kept), 'the lanes account for the whole roadway');
    const at = centres(layout);
    for (const centre of at) {
      assert.ok(centre - layout.width / 2 > (oneWay ? -half + kept : 0) - 1e-9 && centre + layout.width / 2 < half - kept + 1e-9, 'each lane lies within the travelled way');
    }
    if (!layout.driven) continue;
    assert.ok(layout.count > 1 && layout.width >= DRIVEN_LANE && width >= PARKED_FROM);
    // Traffic looks 1.95 m to either side of itself for a car to follow: files this far apart never hold each other up.
    for (let i = 1; i < at.length; i++) assert.ok(Math.abs(at[i] - at[i - 1]) >= DRIVEN_LANE - 1e-9);
    // A car parked 1.28 m out from the kerb stands at least 2.1 m, centre to centre, from the file beside it.
    for (const edge of [Math.max(...at), -Math.min(...at)]) if (edge > 0) assert.ok(half - 1.28 - edge >= 2.1, `${width.toFixed(2)} m ${oneWay ? 'one way' : 'two way'}: ${(half - 1.28 - edge).toFixed(2)} m`);
  }
});
