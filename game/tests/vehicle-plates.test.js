import test from 'node:test';
import assert from 'node:assert/strict';
import { plateFor } from '../dist/license-plates.js';
import { packPlate } from '../dist/vehicle-plates.js';
import { createCar, createParkedCars, updateCarVisuals, RIMS } from '../dist/world.js';

test('cars at the kerb and a car on its own show the same number and the same wheels', () => {
  const parked = createParkedCars({ capacity: 6 }), plates = parked.group.getObjectByName('Parked number plates');
  const kerb = (id, x, extra = {}) => ({ id, type: 'sedan', color: '#7a1f1f', x, y: 0, z: 5, angle: 0, pitch: 0, roll: 0, wheelHeights: [0, 0, 0, 0], _kerb: true, ...extra });
  const cars = [kerb('k1', 0), kerb('k2', 6), kerb('k3', 12, { rims: 'black' })];
  parked.update(cars);
  const expected = cars.reduce((n, car) => n + (plateFor(car).front ? 2 : 1), 0);
  assert.equal(plates.count, expected);
  assert.deepEqual([...plates.geometry.attributes.aPlate.array.slice(0, 4)], packPlate(plateFor(cars[0]))[0]);
  const wheels = pattern => parked.group.getObjectByName(`Parked car wheels, ${pattern}`).count;
  assert.equal(wheels('black'), 4, 'the wheels a body shop fitted'); assert.equal(Object.keys(RIMS).reduce((n, pattern) => n + wheels(pattern), 0), 12);
  // Nothing is uploaded again until a plate or a wheel changes.
  assert.equal(parked.update(cars), false);
  cars[0].plates = 1; assert.equal(parked.update(cars), true);
  cars[1].rims = 'dark'; assert.equal(parked.update(cars), true); assert.equal(wheels('dark'), 4);
  // The same car drawn on its own.
  const alone = createCar({ type: 'sedan', color: '#7a1f1f', seed: 'k1', plate: plateFor(cars[0]), rims: 'black' });
  assert.equal(alone.userData.plate, plateFor(cars[0]).text); assert.equal(alone.userData.rims, 'black');
  assert.equal(alone.userData.wheels[0].userData.roll.children[1].geometry, RIMS.black);
  updateCarVisuals(alone, { ...cars[0], destroyed: true }, 0); assert.equal(alone.userData.detail.plates.visible, false, 'a burnt-out car has lost its plates');
});
