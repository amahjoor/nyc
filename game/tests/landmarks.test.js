import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLandmarkBuildings, landmarkStyle, paletteFor, typeOf, materialOf, BUILDING_TYPES, FACINGS, FACING_COLOURS } from '../dist/landmarks.js';
import { chooseStyle, setLandmarks, setLots, STYLES, STYLE_INDEX, FLAG } from '../dist/facade.js';

const file = readFileSync(new URL('../dist/landmark-buildings.bin', import.meta.url)), record = createLandmarkBuildings(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const names = JSON.parse(readFileSync(new URL('../dist/landmarks.json', import.meta.url), 'utf8'));

test('the Commission’s words for types and materials fall into the game’s', () => {
  assert.deepEqual(['Row House', 'Town House', 'Free-standing House', 'Tenement', 'Flats Building', 'Apartment Building', 'Store and Lofts', 'Warehouse', 'Church', 'Store', 'Garage', 'Not determined', undefined].map(typeOf).map(type => BUILDING_TYPES[type]),
    ['row house', 'row house', 'house', 'tenement', 'tenement', 'apartments', 'lofts', 'lofts', 'civic', 'store', 'unknown', 'unknown', 'unknown']);
  assert.deepEqual(['Brownstone', 'Red Brick', 'Brick', 'Buff Brick', 'Limestone', 'Rusticated Limestone', 'Granite', 'Cast Iron', 'Wood Frame', 'Stucco', 'Terra Cotta', 'Not determined'].map(materialOf).map(facing => FACINGS[facing]),
    ['brownstone', 'red brick', 'red brick', 'buff brick', 'pale stone', 'pale stone', 'grey stone', 'cast iron', 'wood or stucco', 'wood or stucco', 'pale stone', 'unknown']);
  assert.equal(FACINGS.length, FACING_COLOURS.length);
});

test('the bundled record has the protected city: cast iron in SoHo, brownstone in Park Slope', () => {
  assert.ok(record.count > 25000 && record.count < 60000, `${record.count} buildings`);
  const tally = (cx, cz, radius) => { const counts = { type: new Array(8).fill(0), facing: new Array(8).fill(0), n: 0 }; for (let x = cx - radius; x <= cx + radius; x += 12) for (let z = cz - radius; z <= cz + radius; z += 12) { const found = record.at(x, z, 8); if (found) { counts.type[found.type]++; counts.facing[found.facing]++; counts.n++; } } return counts; };
  const soho = tally(180, -100, 220);
  assert.ok(soho.n > 80 && (soho.type[5] + soho.type[7]) / soho.n > .6 && soho.facing[6] > 40, JSON.stringify(soho));
  // Park Slope, by Seventh Avenue and Third Street.
  const slope = tally(2300, 5750, 300);
  assert.ok(slope.n > 150 && slope.type[1] / slope.n > .6 && slope.facing[2] / slope.n > .4, JSON.stringify(slope));
  assert.equal(record.at(-25000, 20000), null); assert.equal(createLandmarkBuildings(null).at(0, 0), null);
  // The individual landmarks are named, and nothing else about them is kept.
  assert.ok(names.landmarks.length > 1200 && names.landmarks.every(row => row.length === 3 && row[0] && Math.abs(row[1]) < 40000));
  for (const name of ['Empire State Building', 'Chrysler Building', 'Flatiron Building', 'Grand Central Terminal', 'Apollo Theater']) assert.ok(names.landmarks.some(row => row[0] === name), name);
});

test('a recorded building is the type the record gives, in the colour of what it is faced with', () => {
  assert.deepEqual([landmarkStyle({ type: 1, facing: 2 }, { height: 14 }), landmarkStyle({ type: 3, facing: 1 }, { height: 20 }), landmarkStyle({ type: 5, facing: 6 }, { height: 25 }), landmarkStyle({ type: 4, facing: 3 }, { height: 40 }), landmarkStyle({ type: 6, facing: 4 }, { height: 20 }), landmarkStyle({ type: 7, facing: 6 }, { height: 12 })],
    ['rowhouse', 'tenement', 'loft', 'prewar', 'civic', 'loft']);
  assert.deepEqual([landmarkStyle({ type: 1, facing: 2 }, { height: 90 }), landmarkStyle({ type: 2, facing: 1 }, { height: 30 }), landmarkStyle(null, { height: 10 }), landmarkStyle({ type: 0, facing: 1 }, { height: 10 })], [null, null, null, null]);
  for (const style of STYLES) for (let facing = 1; facing < 8; facing++) { const index = paletteFor(style.palettes, facing); assert.ok(index >= 0 && index < 4, style.id); }
  assert.equal(paletteFor(STYLES[STYLE_INDEX.rowhouse].palettes, 0), -1);
  const wall = (id, facing) => STYLES[STYLE_INDEX[id]].palettes[paletteFor(STYLES[STYLE_INDEX[id]].palettes, facing)][0];
  assert.deepEqual([wall('rowhouse', 2), wall('rowhouse', 1), wall('rowhouse', 3), wall('tenement', 1), wall('tenement', 5)], ['#6a4a3c', '#8f4a3a', '#c8bca4', '#8a4b3a', '#b79a78']);
  // Through the chooser: every draw of the same brownstone row house is one, in brownstone.
  const volume = random => ({ height: 14, area: 110, x: 500, z: 500, random, random2: (random * 7.3) % 1 });
  setLandmarks({ count: 1, at: () => ({ type: 1, facing: 2 }) });
  for (let i = 0; i < 20; i++) { const chosen = chooseStyle(volume((i + .5) / 20)); assert.equal(STYLES[chosen.style].id, 'rowhouse'); assert.equal(STYLES[chosen.style].palettes[chosen.flags & FLAG.PALETTE][0], '#6a4a3c'); }
  setLandmarks(null); setLots(null);
  assert.ok(new Set(Array.from({ length: 20 }, (_, i) => chooseStyle(volume((i + .5) / 20)).flags & FLAG.PALETTE)).size > 1, 'unrecorded, the colours vary again');
});
