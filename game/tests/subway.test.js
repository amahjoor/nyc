import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createSubway, createSubwayEntrances, FARE } from '../dist/subway.js';

const data = JSON.parse(readFileSync(new URL('../dist/transit.json', import.meta.url), 'utf8'));

test('the bundled subway has every station, its lines and its street entrances', () => {
  assert.ok(data.stations.length > 400 && data.stations.length < 520);
  for (const station of data.stations) {
    assert.ok(station.name && /^[A-Z0-9]+( [A-Z0-9]+)*$/.test(station.routes) && station.entrances.length >= 1, station.name);
    for (const [x, z, kind] of station.entrances) assert.ok(Math.abs(x) < 40000 && Math.abs(z) < 40000 && [0, 1, 2].includes(kind) && Math.hypot(x - station.x, z - station.z) < 900, `${station.name}: an entrance is at the station`);
  }
  const named = name => data.stations.filter(station => station.name === name);
  assert.equal(named('34 St-Herald Sq').length, 1); assert.equal(named('34 St-Herald Sq')[0].routes, 'B D F M N Q R W');
  assert.ok(named('14 St-Union Sq')[0].routes.includes('L') && Math.hypot(named('14 St-Union Sq')[0].x - named('34 St-Herald Sq')[0].x, named('14 St-Union Sq')[0].z - named('34 St-Herald Sq')[0].z) > 1200, 'two stations, a mile apart');
  assert.match(data.source.url, /^https:\/\/data\.ny\.gov\/d\//);
});

test('a ride is to any station on a line that stops here, nearest first', () => {
  const subway = createSubway(data), prince = subway.stations.find(station => station.name === 'Prince St');
  assert.deepEqual(prince.lines, ['R', 'W']);
  const near = subway.entrancesNear(300, -85, 60);
  assert.ok(near.length >= 1 && near[0].station === prince && near.every(entrance => Math.hypot(entrance.x - 300, entrance.z + 85) <= 60));
  assert.deepEqual(subway.entrancesNear(350, -150, 5), []);
  const rides = subway.ridesFrom(prince);
  assert.ok(rides.length > 30 && rides.every(ride => ride.lines.every(line => 'RW'.includes(line)) && ride.station !== prince));
  assert.deepEqual(rides.slice(0, 2).map(ride => ride.station.name), ['Canal St', '8 St-NYU']);
  for (let i = 1; i < rides.length; i++) assert.ok(rides[i].distance >= rides[i - 1].distance);
  assert.ok(!rides.some(ride => ride.station.name === 'Spring St'), 'the 6 and the C do not stop at Prince Street');
  const exit = subway.exitOf(rides[0].station);
  assert.ok(rides[0].station.entrances.some(([x, z]) => x === exit.x && z === exit.z));
  assert.ok(FARE > 2 && FARE < 4);
  assert.deepEqual(createSubway(null).entrancesNear(0, 0, 500), []);
});

test('stairs are drawn where the entrances are, along the kerb', () => {
  const scene = new THREE.Scene(), subway = createSubway(data), stairs = createSubwayEntrances({ scene, heightAt: () => 4, facing: () => [1, 0] });
  assert.equal(stairs.update(subway, { x: 300, z: -85 }), true);
  assert.ok(stairs.entrances.length >= 4 && stairs.entrances.every(entrance => entrance.kind === 0));
  const mesh = scene.getObjectByName('Subway stairs'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), run = new THREE.Vector3(0, 0, 1);
  assert.equal(mesh.count, stairs.entrances.length); assert.equal(scene.getObjectByName('Subway globes').count, mesh.count * 2);
  mesh.getMatrixAt(0, matrix); at.setFromMatrixPosition(matrix); run.transformDirection(matrix);
  assert.ok(at.x === stairs.entrances[0].x && at.y === 4 && Math.abs(run.x - 1) < 1e-6);
  assert.equal(stairs.update(subway, { x: 310, z: -80 }), false, 'nothing is redone for a few steps');
  stairs.dispose(); assert.equal(scene.children.length, 0);
});
