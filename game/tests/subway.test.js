import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createSubway, createSubwayEntrances, FARE } from '../dist/subway.js';
import { Simulation } from '../dist/simulation.js';

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

test('all four 45 St entrances have twelve descending treads and an enclosed landing', () => {
  const subway = createSubway(data), station = subway.stations.find(s => s.name === '45 St');
  const stairs = createSubwayEntrances({ heightAt: () => 18, facing: () => [.6,.8] });
  stairs.update(subway, station);
  assert.equal(stairs.entrances.filter(e => e.station === station).length, 4);
  const mesh = stairs.group.getObjectByName('Subway stairs'), matrix = new THREE.Matrix4();
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0);
  for (const [index, entrance] of stairs.entrances.entries()) {
    if (entrance.station !== station) continue;
    mesh.getMatrixAt(index, matrix);
    const tread = (x,z) => {
      ray.set(new THREE.Vector3(x,.7,z).applyMatrix4(matrix), down);
      return ray.intersectObject(mesh)[0]?.point.y;
    };
    for (const x of [-.5,.5]) {
      let previous = 18;
      for (let i = 0; i < 12; i++) {
        const along = -2.15 + (i + .5) * .32;
        const height = tread(x, along), world = new THREE.Vector3(x,0,along).applyMatrix4(matrix);
        assert.ok(height < previous - .06 && height > previous - .18, 'pavement or a cap must not hide a step');
        assert.ok(Math.abs(height - stairs.surfaceAt(world.x,world.z).elevation) < .001, 'feet rest on the visible tread');
        previous = height;
      }
      assert.ok(Math.abs(tread(x,2) - 16.06) < .01);
    }
  }
  stairs.dispose();
});

test('a survey point at the curb puts the full stairwell on the sidewalk and keeps the surveyed station identity', () => {
  const entrance = {x:.2,z:0,kind:0,station:{name:'45 St'}};
  const subway = { entrancesNear: () => [entrance] };
  const edge = { x:0,z:0,tx:0,tz:1,nx:1,nz:0,distance:.2 };
  const stairs = createSubwayEntrances({kerbAt:()=>edge});
  stairs.update(subway,entrance);
  const placed = stairs.entrances[0];
  assert.ok(placed.x + .88 < edge.x);
  assert.equal(placed.station,entrance.station); assert.equal(entrance.x,.2);
  assert.equal(stairs.surfaceAt(entrance.x,entrance.z),null);
  assert.ok(stairs.surfaceAt(placed.x,placed.z).elevation < -1);
  stairs.dispose();
});

test('a stationary entrance updates its grade, kerb orientation and ground opening as the street streams', () => {
  const subway = { entrancesNear: x => x > 50 ? [] : [{x:3,z:6,kind:0}] };
  let base = 0, heading = [0,1];
  const stairs = createSubwayEntrances({ heightAt: (x,z) => base + .05*x + .1*z, facing: () => heading });
  const here = {x:3,z:6}, mesh = stairs.group.getObjectByName('Subway stairs'), matrix = new THREE.Matrix4();
  const ground = new THREE.MeshStandardMaterial();
  stairs.openings.clip(ground);
  const shader = { ...THREE.ShaderLib.standard, uniforms:{} };
  ground.onBeforeCompile(shader);
  const u = shader.uniforms;
  stairs.update(subway, here, [], 0);
  const kerbs = [];
  base = 14; heading = [1,0];
  assert.ok(stairs.update(subway, here, kerbs, 1));
  mesh.getMatrixAt(0,matrix);
  const corner = new THREE.Vector3(.6,0,1.7).applyMatrix4(matrix);
  assert.ok(Math.abs(corner.y - (base + .05*corner.x + .1*corner.z)) < 1e-5, 'rim follows the slope across the whole footprint');
  const { data: cells, width } = u.stairGrid.value.image;
  const first = width * width * 4;
  assert.deepEqual(Array.from(cells.slice(first,first+2)), [here.x,here.z]);
  assert.ok(Math.abs(cells[first+2] - matrix.elements[13]) < .001);
  assert.ok(Math.abs(cells[first+3] - Math.PI/2) < .001);
  assert.equal(stairs.update(subway, here, kerbs, 1),false);
  stairs.group.visible = false; stairs.update(subway, here, kerbs, 1); assert.equal(u.stairOpen.value,false);
  stairs.group.visible = true; stairs.update(subway, here, kerbs, 1); assert.equal(u.stairOpen.value,true);
  assert.ok(stairs.update(subway, {x:2000,z:1000}, kerbs, 1)); assert.equal(u.stairOpen.value,false);
  ground.dispose(); stairs.dispose();
});

test('a pedestrian can descend, stays inside the retaining walls and can walk back onto the sidewalk', () => {
  const ground = {elevation:5};
  let stairs;
  const sim = new Simulation({ roads:[], buildings:[], bounds:{minX:-80,minZ:-80,maxX:80,maxZ:80},
    spawn:{x:0,z:-3,angle:0}, sampleSurface:(x,z,options) => (options?.mode === 'walk' && stairs?.surfaceAt(x,z)) || ground });
  stairs = createSubwayEntrances({physics:sim.streetObjects,heightAt:()=>ground.elevation});
  stairs.update({entrancesNear:()=>[{x:0,z:0,kind:0}]},sim.player);
  sim.cars = [];
  const walk = (input, seconds) => {
    for (let i = 0; i < 60*seconds; i++) sim.step(input, 1/60);
  };
  walk({moveZ:1},1.6);
  assert.ok(sim.player.grounded && sim.player.z > 1.5 && sim.player.y < 3.2);
  walk({moveX:1},.5);
  assert.ok(Math.abs(sim.player.x) < .76 && sim.player.y < 3.2, 'the retaining wall stops a below-grade exit');
  walk({moveZ:-1},1.6);
  assert.ok(sim.player.z < -2.15 && sim.player.grounded);
  assert.equal(sim.player.y,ground.elevation);
  stairs.dispose();
});
