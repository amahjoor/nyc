import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { DESIGNS, GLYPHS, MARK, SHEET, CELL, COLUMNS, PLATE, ACROSS, plateFor, paintGlyphs, paintPlates } from '../dist/license-plates.js';
import { PLATE_SIZE, packPlate, plateAnchors, createPlateMesh, createPlateBatch, plateMaterial, setPlateGlow } from '../dist/vehicle-plates.js';
import { generateVehicle } from '../dist/vehicle-generator.js';
import { designFor } from '../dist/vehicle-designs.js';
import { buildCar } from '../dist/vehicle-model.js';

const design = plate => DESIGNS[plate.design].id;

test('a car has one plate, of the kind a car like it carries in the city', () => {
  const car = { id: 'traffic-41', type: 'sedan', identity: { year: 2023 } };
  assert.equal(plateFor(car), plateFor(car), 'the same plate each time it is asked for');
  assert.deepEqual(plateFor({ ...car }), plateFor(car), 'and the same for the same car drawn elsewhere');
  // A car sold since 2020 was registered on the Excelsior plate: K or L, two letters, four digits.
  assert.equal(design(plateFor(car)), 'excelsior'); assert.match(plateFor(car).text, /^[KL][A-HJ-NPR-Z]{2}-\d{4}$/);
  assert.deepEqual(plateFor(car).codes.map(code => code === MARK.newYork ? '-' : GLYPHS[code]).join(''), plateFor(car).text);
  // A yellow cab's number is its medallion or a T&LC number; a green cab's is a T&LC number; a trade van's is commercial.
  const yellow = Array.from({ length: 300 }, (_, i) => plateFor({ id: 'cab-' + i, type: 'taxi', color: '#f3ba31' }));
  assert.ok(yellow.every(p => design(p) === 'gold-taxi' ? /^[1-9][A-Z]\d\d[HJ]$/.test(p.text) : design(p) === 'excelsior-hire' && /^Y\d{6}C$/.test(p.text)));
  const medallions = yellow.filter(p => design(p) === 'gold-taxi').length;
  assert.ok(medallions > 170 && medallions < 250, `${medallions} of 300 yellow cabs carry a medallion number`);
  const green = plateFor({ id: 'boro-1', type: 'taxi', color: '#74b541' });
  assert.equal(design(green), 'excelsior-hire'); assert.match(green.text, /^T\d{6}C$/);
  for (const trade of [{ id: 'van-1', type: 'sedan', identity: { year: 2022, asset: { livery: 'cargo' } } }, { id: 'van-2', type: 'sedan', working: true, identity: { year: 2014 } }]) {
    assert.match(design(plateFor(trade)), /commercial$/); assert.match(plateFor(trade).text, /^\d{5}-[J-NP][A-Z]$/);
  }
  assert.equal(design(plateFor(trade2022())), 'excelsior-commercial');
  function trade2022() { return { id: 'van-3', type: 'sedan', identity: { year: 2022, asset: { livery: 'cargo' } } }; }
});

test('the plates of a street are New York\'s, with the neighbours\' among them, and no two alike', () => {
  const plates = Array.from({ length: 4000 }, (_, i) => plateFor({ id: 'parked-' + i, type: 'sedan', identity: { year: 2004 + i % 22 } }));
  const count = id => plates.filter(p => design(p) === id).length, share = id => count(id) / plates.length;
  assert.ok(new Set(plates.map(p => p.text)).size > 3990, 'numbers do not repeat along a street');
  const away = plates.filter(p => DESIGNS[p.design].state !== 'NY').length / plates.length;
  assert.ok(away > .1 && away < .16, `${(away * 100).toFixed(1)}% are from out of state`);
  assert.ok(share('new-jersey') > share('pennsylvania') && share('pennsylvania') > 0 && share('connecticut') > 0 && share('florida') > 0);
  assert.ok(share('excelsior') > .35 && share('gold') > .25 && share('empire') > 0 && share('empire') < .03, 'mostly Excelsior and gold, a few of the old blue and white');
  for (const p of plates) {
    const id = design(p);
    assert.ok(p.codes.length <= 8 && p.codes.every(code => Number.isInteger(code) && code >= 0 && code < 48), p.text);
    // Pennsylvania and Florida issue one plate, for the back of the car.
    assert.equal(p.front, id !== 'pennsylvania' && id !== 'florida');
    if (id === 'excelsior') assert.match(p.text, /^[KL][A-HJ-NPR-Z]{2}-\d{4}$/);
    if (id === 'gold') assert.match(p.text, /^[FGHJ][A-HJ-NPR-Z]{2}-\d{4}$/);
    if (id === 'empire') assert.match(p.text, /^[DE][A-HJ-NPR-Z]{2}-\d{4}$/);
    if (id === 'new-jersey') assert.match(p.text, /^[A-Z]\d\d-[A-Z]{3}$/);
    if (id === 'pennsylvania') assert.match(p.text, /^[KLM][A-Z]{2}-\d{4}$/);
    if (id === 'connecticut') assert.match(p.text, /^[AB][A-Z]·\d{5}$/);
    if (id === 'florida') assert.match(p.text, /^[A-Z]{3} [A-Z]\d\d$/);
  }
  // The blue and white plate was last issued in 2010, and nothing newer wears one.
  assert.ok(plates.every((p, i) => design(p) !== 'empire' || 2004 + i % 22 <= 2010));
  // A patrol car is the city's own: always a New York plate.
  assert.ok(Array.from({ length: 200 }, (_, i) => plateFor({ id: 'rmp-' + i, type: 'police' })).every(p => DESIGNS[p.design].state === 'NY'));
  // A new set from a body shop is a new number.
  const car = { id: 'player-taxi', type: 'sedan' }, first = plateFor(car).text; car.plates = 1;
  assert.notEqual(plateFor(car).text, first);
});

test('the artwork and the characters are painted inside their own cells of their sheets', () => {
  class Path { constructor(d) { this.d = d; this.parts = []; } addPath(path, matrix) { this.parts.push([path.d, matrix.m]); } }
  class Matrix { constructor(m) { this.m = m; } }
  const strokes = [], fills = [], context = { fillRect() {}, stroke(path) { strokes.push(path.parts[0]); }, fill(path) { fills.push(path.parts[0]); } };
  paintGlyphs(context, Path, Matrix);
  assert.equal(strokes.length, 36, 'ten digits and twenty-six letters'); assert.equal(fills.length, 5, 'and the marks between a number\'s groups');
  assert.ok(COLUMNS * CELL[0] <= SHEET && Math.ceil(42 / COLUMNS) * CELL[1] <= SHEET, 'every character has a cell on the sheet');
  strokes.forEach(([d, m], code) => {
    const x = (code % COLUMNS) * CELL[0], y = Math.floor(code / COLUMNS) * CELL[1];
    // Each stroke's box, 40 by 70, lands inside the cell with room for the weight of the line.
    assert.ok(m[4] - 10.5 >= x && m[4] + 40 * m[0] + 10.5 <= x + CELL[0] && m[5] - 10.5 >= y && m[5] + 70 * m[3] + 10.5 <= y + CELL[1], GLYPHS[code]);
    for (const n of d.match(/-?\d+(\.\d+)?/g).map(Number)) assert.ok(n >= 0 && n <= 70, `${GLYPHS[code]}: ${n}`);
  });
  // Every design is drawn, each in its own plate of the sheet, with its state's name on it.
  const origins = [], words = [], art = new Proxy({}, { get: (_, key) => key === 'translate' ? (x, y) => origins.push([x, y]) : key === 'fillText' ? text => words.push(text)
    : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  paintPlates(art);
  assert.deepEqual(origins, DESIGNS.map((_, i) => [(i % ACROSS) * PLATE[0], Math.floor(i / ACROSS) * PLATE[1]]));
  for (const legend of ['NEW YORK', 'EXCELSIOR', 'EMPIRE STATE', 'COMMERCIAL', 'T&LC', 'NEW JERSEY', 'Garden State', 'PENNSYLVANIA', 'Connecticut', 'FLORIDA']) assert.ok(words.includes(legend), legend);
  assert.equal(words.filter(word => word === 'NEW YORK').length, 7);
});

test('plates hang on the nose and the tail of a car, facing out, with its number in their vertices', () => {
  const plate = plateFor({ id: 'traffic-41', type: 'sedan', identity: { year: 2023 } });
  const [packed, look] = packPlate(plate);
  const unpacked = packed.flatMap(pair => [pair % 64, Math.floor(pair / 64)]).slice(0, look[1]);
  assert.deepEqual(unpacked, plate.codes); assert.deepEqual(look, [plate.design, plate.codes.length]);
  for (const built of [generateVehicle(designFor('Toyota', 'Camry', 2019, 'sedan')), generateVehicle(designFor('Ford', 'F-150', 2018, 'pickup')), generateVehicle(designFor('Honda', 'CR-V', 2018, 'suv')), buildCar({ shape: 'hatch' })]) {
    const { front, rear } = plateAnchors(built), at = new THREE.Vector3(), out = new THREE.Vector3();
    built.body.computeBoundingBox();
    const { min, max } = built.body.boundingBox;
    for (const [anchor, facing, end] of [[front, 1, max.z], [rear, -1, min.z]]) {
      at.setFromMatrixPosition(anchor); out.set(0, 0, 1).transformDirection(anchor);
      assert.ok(Math.abs(at.x) < 1e-6 && at.y > .3 && at.y < 1.1, `${at.y} m up, on the middle of the car`);
      assert.ok(Math.abs(at.z - end) < .32 && out.z * facing > .9 && Math.abs(out.x) < 1e-6, 'at the end of the car and facing out of it');
      // Readable from outside: the plate's own left is the reader's left.
      assert.ok(new THREE.Vector3(1, 0, 0).transformDirection(anchor).x * facing > .99);
    }
    const mesh = createPlateMesh(built, plate), position = mesh.geometry.attributes.position;
    assert.equal(position.count, 8); assert.equal(mesh.geometry.index.count, 12); assert.equal(mesh.userData.plate, plate.text);
    assert.deepEqual([...mesh.geometry.attributes.aPlate.array.slice(0, 4)], packed);
    const wide = Math.hypot(position.getX(1) - position.getX(0), position.getY(1) - position.getY(0), position.getZ(1) - position.getZ(0));
    assert.ok(Math.abs(wide - PLATE_SIZE[0]) < 1e-5, 'twelve inches across');
    assert.equal(createPlateMesh(built, { ...plate, front: false }).geometry.attributes.position.count, 4, 'a one-plate state leaves the nose bare');
  }
  // One material for every plate: the artwork sheet, and a shader that stamps the number over it.
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <emissivemap_fragment>' };
  plateMaterial().onBeforeCompile(shader);
  assert.equal(plateMaterial(), plateMaterial()); assert.equal(shader.uniforms.nycInk.value.length, DESIGNS.length);
  assert.match(shader.fragmentShader, /textureGrad\( nycGlyphs/); assert.match(shader.vertexShader, /vPlate = aPlate;/);
  setPlateGlow(1); assert.ok(shader.uniforms.nycPlateGlow.value > .2); setPlateGlow(0); assert.equal(shader.uniforms.nycPlateGlow.value, 0);
});
