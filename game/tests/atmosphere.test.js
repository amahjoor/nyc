import test from 'node:test';
import assert from 'node:assert/strict';
import { sunDirection, moonDirection, elevationOf, azimuthOf, skyState, scatter, directTransmittance, twilightRadiance, formatClock,
  TIME_PRESETS, SKY_GLSL, ATMOSPHERE, SOLAR_NOON } from '../dist/atmosphere.js';

const DEG = Math.PI / 180;
const luminance = rgb => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
const length = v => Math.hypot(...v);

test('the sun follows New York\'s summer path and sets along the Manhattan street grid', () => {
  for (let hour = 0; hour < 24; hour += .5) assert.ok(Math.abs(length(sunDirection(hour)) - 1) < 1e-12);
  const noon = sunDirection(SOLAR_NOON);
  assert.ok(Math.abs(elevationOf(noon) / DEG - 71.2) < .3, 'midsummer noon is about 71 degrees up');
  assert.ok(Math.abs(azimuthOf(noon) - 180) < 1e-6, 'and due south');
  assert.ok(noon[2] > 0, 'south is +Z in the game frame');
  // Find sunset by bisection.
  let low = 19, high = 21;
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (elevationOf(sunDirection(mid)) > 0) low = mid; else high = mid; }
  const sunset = azimuthOf(sunDirection(low));
  // Manhattan's cross streets run 29 degrees off the compass: 299 degrees at the western end.
  assert.ok(Math.abs(sunset - 299) < 1.5, `sunset bearing ${sunset.toFixed(1)} lines up with the cross streets`);
  assert.ok(low > 20.2 && low < 20.5, 'sunset falls a little after eight in the evening');
  assert.ok(sunDirection(8)[0] > 0 && sunDirection(18)[0] < 0, 'the sun rises in the east and sets in the west');
});

test('the full moon rides opposite the sun on a low arc', () => {
  const midnight = moonDirection(SOLAR_NOON + 12);
  assert.ok(elevationOf(midnight) > 20 * DEG && elevationOf(midnight) < 35 * DEG);
  assert.ok(elevationOf(moonDirection(SOLAR_NOON)) < 0, 'it is below the horizon at midday');
  assert.ok(elevationOf(sunDirection(SOLAR_NOON + 12)) < -20 * DEG);
});

test('scattered light makes a blue zenith, a pale horizon and a red low sun', () => {
  const high = sunDirection(SOLAR_NOON), zenith = scatter([0, 1, 0], high).radiance;
  assert.ok(zenith[2] > zenith[1] && zenith[1] > zenith[0], 'the midday zenith is blue');
  const horizon = scatter([Math.SQRT1_2, .03, Math.SQRT1_2].map(v => v / Math.hypot(Math.SQRT1_2, .03, Math.SQRT1_2)), high).radiance;
  assert.ok(luminance(horizon) > luminance(zenith) * 2, 'the horizon is brighter than the zenith');
  assert.ok(horizon[2] / horizon[0] < zenith[2] / zenith[0], 'and less saturated');
  const overhead = directTransmittance(high), grazing = directTransmittance(sunDirection(20.2));
  assert.ok(overhead.every(value => value > .7 && value < 1));
  assert.ok(grazing[0] > grazing[1] * 2 && grazing[1] > grazing[2] * 3, 'a setting sun is reddened');
  assert.deepEqual(directTransmittance([0, -1, 0]), [0, 0, 0], 'the planet blocks a sun under the horizon');
  for (const value of [...zenith, ...horizon]) assert.ok(Number.isFinite(value) && value >= 0);
});

test('one clock time yields a complete, finite lighting state', () => {
  for (let hour = 0; hour < 24; hour += .25) {
    const state = skyState(hour);
    for (const key of ['sunColor', 'moonColor', 'keyColor', 'ambientSky', 'ambientGround', 'bounce', 'fogColor', 'fogSunColor', 'zenithColor', 'horizonColor', 'groundRadiance']) {
      assert.equal(state[key].length, 3, key);
      assert.ok(state[key].every(value => Number.isFinite(value) && value >= 0), `${key} at ${hour}`);
    }
    for (const key of ['night', 'lightsOn', 'late', 'starVisibility']) assert.ok(state[key] >= 0 && state[key] <= 1, `${key} at ${hour}`);
    assert.ok(state.exposure > .5 && state.exposure < 8 && state.fogDensity > 0);
    assert.ok(Math.abs(length(state.keyDirection) - 1) < 1e-9 && state.keyDirection[1] > -.05, 'the key light is never well below the horizon');
  }
  assert.deepEqual(skyState(25.5).sunDirection, skyState(1.5).sunDirection, 'hours wrap');
});

test('day, dusk and night differ the way a camera operator would expect', () => {
  const day = skyState(13.5), golden = skyState(19.55), dusk = skyState(20.72), night = skyState(23.25);
  assert.equal(day.night, 0); assert.equal(day.lightsOn, 0); assert.equal(day.keyIsMoon, false);
  assert.equal(night.night, 1); assert.equal(night.lightsOn, 1); assert.equal(night.keyIsMoon, true);
  assert.ok(dusk.lightsOn > .8 && dusk.night < night.night, 'lamps are on before full dark');
  assert.ok(luminance(day.keyColor) > 20 * luminance(night.keyColor), 'sunlight dwarfs moonlight');
  assert.ok(golden.keyColor[0] / golden.keyColor[2] > day.keyColor[0] / day.keyColor[2] * 2, 'golden hour light is warm');
  assert.ok(night.exposure > dusk.exposure && dusk.exposure > golden.exposure && golden.exposure > day.exposure, 'exposure opens as light fails');
  // Open shade should sit near a fifth of direct sun, as outdoors.
  const shade = luminance(day.ambientSky) / (luminance(day.keyColor) * day.keyDirection[1]);
  assert.ok(shade > .05 && shade < .4, `sky fill is ${shade.toFixed(2)} of direct sun`);
  assert.ok(night.moonColor[2] > night.moonColor[0], 'moonlight reads cool');
  // Sunlight returned by the city fills shade with a warmer, weaker light than the sky's.
  const afternoon = skyState(16.5);
  const lift = luminance(afternoon.bounce) / luminance(afternoon.ambientSky);
  assert.ok(lift > .25 && lift < .8, `bounced sunlight adds ${lift.toFixed(2)} of the sky's light to shade`);
  assert.ok(afternoon.bounce[0] / afternoon.bounce[2] > afternoon.ambientSky[0] / afternoon.ambientSky[2] * 3, 'and it is far less blue');
  assert.ok(luminance(afternoon.bounce) < luminance(afternoon.keyColor) * .08, 'it never competes with the sun itself');
  assert.ok(golden.bounce[0] > golden.bounce[2] * 2.5, 'at golden hour the returned light is amber');
  assert.deepEqual(night.bounce, [0, 0, 0], 'the moon returns none');
  assert.ok(skyState(2).late > .9 && skyState(21).late === 0, 'the small hours are flagged');
  assert.ok(night.starVisibility === 1 && day.starVisibility === 0);
});

test('twilight colours appear only around sunset and favour the sunward horizon', () => {
  const sun = sunDirection(20.72), elevation = elevationOf(sun) / DEG;
  const toward = [sun[0], 0, sun[2]].map(v => v / Math.hypot(sun[0], sun[2])), away = toward.map(v => -v);
  const glow = twilightRadiance([toward[0] * .999, .04, toward[2] * .999], sun, elevation), back = twilightRadiance([away[0] * .999, .04, away[2] * .999], sun, elevation);
  assert.ok(glow[0] > back[0] * 2 && glow[0] > glow[2], 'the afterglow is orange where the sun went down');
  const zenith = twilightRadiance([0, 1, 0], sun, elevation);
  assert.ok(zenith[2] > zenith[0], 'overhead is blue');
  assert.deepEqual(twilightRadiance([0, 1, 0], sunDirection(13), 70), [0, 0, 0]);
  assert.ok(luminance(twilightRadiance([0, 1, 0], sunDirection(1), -26)) < luminance(zenith) * .02, 'and it is gone by deep night');
});

test('presets, clock text and the GPU copy of the atmosphere stay consistent', () => {
  assert.deepEqual(TIME_PRESETS.map(preset => preset.id), ['morning', 'midday', 'golden', 'dusk', 'night']);
  assert.ok(TIME_PRESETS.every((preset, i) => i === 0 || preset.hours > TIME_PRESETS[i - 1].hours));
  assert.equal(formatClock(0), '12:00 AM'); assert.equal(formatClock(13.5), '1:30 PM'); assert.equal(formatClock(23.999), '12:00 AM'); assert.equal(formatClock(-1), '11:00 PM');
  // The shader text is generated from the same constants the CPU model uses.
  assert.match(SKY_GLSL, new RegExp(`ATMO_RG = ${ATMOSPHERE.groundRadius.toExponential(6).replace('+', '\\+')}`));
  assert.match(SKY_GLSL, new RegExp(`ATMO_VIEW_STEPS = ${ATMOSPHERE.viewSteps};`));
  for (const name of ['atmoScatter', 'atmoCityGlow', 'atmoTwilight']) assert.ok(SKY_GLSL.includes(`vec3 ${name}(`), name);
});
