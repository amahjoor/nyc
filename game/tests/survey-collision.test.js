import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../dist/simulation.js';
import { applySurvey } from '../dist/survey-city.js';

const sourceCity = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url)));
const survey = JSON.parse(readFileSync(new URL('../dist/survey.json', import.meta.url)));

test('survey adaptation replaces every collision footprint with a measured ground surface', () => {
  const city = applySurvey(sourceCity, survey);
  assert.equal(city.roads, sourceCity.roads);
  assert.equal(city.spawn, sourceCity.spawn);
  assert.equal(city.missionPoints, sourceCity.missionPoints);
  assert.equal(city.bounds, sourceCity.bounds);
  const expected = survey.buildings.filter(building => building.inPlayableArea).flatMap(building => building.footprints);
  assert.equal(city.buildings.length, expected.length);
  for (let index = 0; index < expected.length; index++) {
    assert.equal(city.buildings[index].polygon, expected[index].outer);
    assert.equal(city.buildings[index].holes, expected[index].holes);
    assert.equal(city.buildings[index].heightEstimated, false);
  }
  assert.notEqual(city.buildings, sourceCity.buildings);
});

test('missing survey or projection mismatch fails instead of showing invented geometry', () => {
  assert.throws(() => applySurvey(sourceCity, null), /missing/);
  assert.throws(() => applySurvey(sourceCity, { ...survey, origin: {lat: 0, lon: 0} }), /origin/);
});

test('courtyards remain empty and their walls push the player toward free space', () => {
  const outer = [[10, 10], [40, 10], [40, 40], [10, 40]];
  const hole = [[20, 20], [30, 20], [30, 30], [20, 30]];
  for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) {
    const sim = new Simulation({
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      roads: [], spawn: { x: 0, z: 0, angle: 0 }, missionPoints: [],
      buildings: [{ polygon: reverseOuter ? [...outer].reverse() : outer, holes: [reverseHole ? [...hole].reverse() : hole] }],
    });
    assert.equal(sim.isBlocked(25, 25, 0.4), false);
    assert.equal(sim.isBlocked(15, 25, 0.4), true);
    assert.equal(sim.isBlocked(20.2, 25, 0.4), true);
    for (const x of [19.9, 20, 20.2]) {
      const resolved = sim._resolvePosition(x, 25, 0.4);
      assert.ok(resolved.x >= 20.3999, 'inner wall pushes into the courtyard');
      assert.equal(sim.isBlocked(resolved.x, resolved.z, 0.4), false);
    }
    const exterior = sim._resolvePosition(10, 25, 0.4);
    assert.ok(exterior.x <= 9.6001, 'outer wall pushes onto the street');
  }
});

test('real survey leaves the original spawn and every delivery destination clear', () => {
  const city = applySurvey(sourceCity, survey);
  const sim = new Simulation(city);
  assert.equal(sim.isBlocked(city.spawn.x, city.spawn.z, 0.4), false);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
  assert.equal(sim.cars.includes(sim.ownedCab),false);
  assert.ok(city.missionPoints.length >= 6);
  for (const point of city.missionPoints) assert.equal(sim.isBlocked(point.x, point.z, 1), false, point.name);
});

test('all delivery destinations are connected to spawn through surveyed free space', () => {
  const city = applySurvey(sourceCity, survey);
  const sim = new Simulation(city);
  const step = 2;
  const nx = Math.ceil((city.bounds.maxX - city.bounds.minX) / step);
  const nz = Math.ceil((city.bounds.maxZ - city.bounds.minZ) / step);
  const toCell = point => [Math.round((point.x - city.bounds.minX) / step), Math.round((point.z - city.bounds.minZ) / step)];
  const world = (x, z) => [city.bounds.minX + x * step, city.bounds.minZ + z * step];
  const open = new Map();
  const free = (x, z) => {
    if (x < 0 || z < 0 || x >= nx || z >= nz) return false;
    const key = z * nx + x;
    if (!open.has(key)) open.set(key, !sim.isBlocked(...world(x, z), 1.1));
    return open.get(key);
  };
  const start = toCell(city.spawn);
  assert.ok(free(...start));
  const queue = [start], reached = new Set([start[1] * nx + start[0]]);
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index];
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nextX = x + dx, nextZ = z + dz, key = nextZ * nx + nextX;
      if (!reached.has(key) && free(nextX, nextZ)) {
        reached.add(key);
        queue.push([nextX, nextZ]);
      }
    }
  }
  for (const point of city.missionPoints) {
    const [x, z] = toCell(point);
    assert.ok(reached.has(z * nx + x), `No collision-free route to ${point.name}`);
  }
});
