import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createBuses, createBusStops } from '../dist/bus.js';

const data = JSON.parse(readFileSync(new URL('../dist/bus-stops.json', import.meta.url), 'utf8'));

test('the bundled stops cover the city, each with a name and the routes that call there', () => {
  assert.ok(data.stops.length > 12000 && data.stops.length < 17000, `${data.stops.length} stops`);
  for (const [x, z, name, routes] of data.stops) assert.ok(Math.abs(x) < 40000 && Math.abs(z) < 40000 && name && /^[A-Za-z0-9+-]+( [A-Za-z0-9+-]+)*$/.test(routes), `${name} [${routes}]`);
  assert.match(data.source.url, /^https:\/\/data\.ny\.gov\/d\//);
  const prince = data.stops.find(stop => stop[2] === 'BROADWAY/PRINCE ST');
  assert.equal(prince[3], 'M1 M55');
});

test('a ride is to another stop a route from here calls at, nearest first, and not to the one across the street', () => {
  const buses = createBuses({ stops: [[0, 0, 'A', 'M1 M2'], [20, 0, 'A ACROSS', 'M1'], [400, 0, 'B', 'M1'], [900, 0, 'C', 'M2 M1'], [300, 300, 'D', 'M3']] });
  const [a, , , c] = buses.stops;
  assert.deepEqual(buses.stopsNear(5, 0, 50).map(stop => stop.name), ['A', 'A ACROSS']);
  assert.deepEqual(buses.stopsNear(5000, 0, 50), []);
  assert.deepEqual(buses.ridesFrom(a).map(ride => [ride.stop.name, ride.lines.join(' '), ride.distance]), [['B', 'M1', 400], ['C', 'M1 M2', 900]]);
  assert.deepEqual(buses.ridesFrom(c).map(ride => ride.stop.name), ['B', 'A ACROSS', 'A']);
  assert.deepEqual(buses.ridesFrom(buses.stops[4]), [], 'nothing else is on the M3');
  assert.deepEqual(createBuses(null).stopsNear(0, 0, 500), []);
  // The real city: from Broadway and Prince the M1 and M55 go on down and up Broadway.
  const real = createBuses(data), prince = real.stops.find(stop => stop.name === 'BROADWAY/PRINCE ST'), rides = real.ridesFrom(prince);
  assert.ok(rides.length > 40 && rides[0].stop.name === 'BROADWAY/SPRING ST' && rides.every(ride => ride.distance >= 150 && ride.lines.every(line => ['M1', 'M55'].includes(line))));
});

test('a pole stands half a metre in from the kerb at each stop, its sign across the sidewalk', () => {
  const scene = new THREE.Scene(), buses = createBuses({ stops: [[0, 0, 'A', 'M1'], [60, 1, 'B', 'M1'], [900, 0, 'C', 'M1']] });
  // A kerb along x at z = 2, its roadway to the south.
  const stops = createBusStops({ scene, heightAt: () => 3, kerb: x => x < 30 ? { x, z: 2, nx: 0, nz: 1, tx: 1, tz: 0 } : null });
  assert.equal(stops.update(buses, { x: 10, z: 0 }), true);
  assert.deepEqual(stops.stops.map(shown => [shown.stop.name, shown.x, shown.z]), [['A', 0, 1.45], ['B', 60, 1]], 'with no kerb in reach a stop stays where the list puts it');
  const poles = scene.getObjectByName('Bus stop poles'), signs = scene.getObjectByName('Bus stop signs'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), face = new THREE.Vector3(0, 0, 1);
  assert.deepEqual([poles.count, signs.count], [2, 2]);
  signs.getMatrixAt(0, matrix); at.setFromMatrixPosition(matrix); face.transformDirection(matrix);
  assert.ok(at.x === 0 && at.y === 3 && Math.abs(at.z - 1.45) < 1e-6); assert.ok(Math.abs(face.x - 1) < 1e-6, 'it faces along the kerb');
  assert.equal(stops.update(buses, { x: 20, z: 0 }), false, 'nothing is redone for a few steps');
  assert.equal(stops.update(buses, { x: 20, z: 0 }, new Map()), true, 'but it is when the kerbs change');
  stops.dispose(); assert.equal(scene.children.length, 0);
});
