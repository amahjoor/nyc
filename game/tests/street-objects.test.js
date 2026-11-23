import { drivingCity } from './fixtures/parked-cab.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { buildCell } from '../dist/streetscape.js';
import { createStreetLife } from '../dist/streetlife.js';
import { createStreetProps, SETBACK } from '../dist/street-props.js';
import { createSubwayEntrances } from '../dist/subway.js';
import { StreetObjects } from '../dist/street-objects.js';

function game(roads = []) {
  return drivingCity({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
    roads, buildings: [], spawn: { x: 0, z: 0, angle: 0 } });
}

const step = (sim, ticks, input = {}) => {
  for (let i = 0; i < ticks; i++) sim.step(input, 1/120);
};

function driving(speed) {
  const sim = game();
  assert.ok(sim.interact());
  const car = sim.cars.find(c => c.controlled);
  sim.cars = [car];
  Object.assign(car, { x: 0, z: 0, angle: 0, speed });
  step(sim, 1);
  return { sim, car };
}

test('a slow bump leaves a lamp standing and a fast car stops at the visible trunk', () => {
  for (const [kind, speed] of [['lamp', 4], ['tree', 16]]) {
    const { sim, car } = driving(speed);
    const tree = { x: 0, y: 0, z: 4, girth: .65, species: 'oak' };
    const lamp = { x: 0, y: 0, z: 4, nx: 1, nz: 0 };
    const life = createStreetLife({ physics: sim.streetObjects,
      getLamps: () => kind === 'lamp' ? [lamp] : [], getTrees: () => kind === 'tree' ? [tree] : [] });
    life.update(car);
    assert.equal(sim.isBlocked(0, 4, .1), true);
    step(sim, 120, { forward: .3 });
    assert.ok(car.z > .4 && car.z < 2.4 && Math.abs(car.speed) < .1, kind);
    assert.equal(sim.streetObjects.damage.size, 0);
    if (kind === 'tree') {
      assert.ok(sim.isBlocked(.32, 4, .01));
      assert.ok(!sim.isBlocked(.8, 4, .1), 'the canopy leaves walking space beside the trunk');
    }
    life.dispose();
    assert.equal(sim.streetObjects.grid.size, 0);
  }
});

test('a coasting empty car topples a lamp, darkens its lens, and leaves a fallen obstacle on return', () => {
  const { sim, car } = driving(18);
  Object.assign(sim.player, { x: 30, z: 0, mode: 'walk', vehicleId: null });
  Object.assign(car, { controlled: false, parked: false, _loose: 2 });
  const lamp = { x: 0, y: 0, z: 5, nx: -1, nz: 0 };
  let lamps = [lamp];
  const life = createStreetLife({ physics: sim.streetObjects, getLamps: () => lamps });
  life.update(car);
  const mesh = life.group.getObjectByName('Street lamps'), lens = life.group.getObjectByName('Street lamp lenses');
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 60 && !sim.streetObjects.damage.size; i++) step(sim, 1);
  assert.equal(sim.streetObjects.damage.size, 1);
  assert.ok(car.speed < 12, 'the pole absorbs some of the car momentum');
  lens.getMatrixAt(0, matrix); assert.equal(matrix.determinant(), 0);
  lamps = []; life.update(car);
  assert.equal(sim.streetObjects.grid.size, 0);
  step(sim, 240);
  assert.equal(sim.streetObjects.moving.size, 0, 'the fall finishes while its mesh is unloaded');
  lamps = [lamp]; life.update(car);
  mesh.getMatrixAt(0, matrix);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
  assert.ok(axis.z > .99);
  assert.ok(sim.isBlocked(0, 11, .2, { baseHeight: 0 }));
  assert.ok(!sim.isBlocked(0, 11, .2, { baseHeight: 4 }));
  assert.ok(!sim.isBlocked(0, 4, .2));
  life.dispose();
});

test('a walker moves the visible litter basket, which settles against a solid obstruction', () => {
  const sim = game();
  sim.cars = [];
  const kerb = { points: [[-10, 0], [10, 0]], normals: [[0, 1]] };
  const props = createStreetProps({ physics: sim.streetObjects, data: { baskets: [0, 0] } });
  props.update([kerb], sim.player);
  const z = -SETBACK.basket;
  Object.assign(sim.player, { x: 0, z: z - 2, y: 0 });
  sim.streetObjects.replace('tree', [{ x: 0, z: z + 2.3, y: 0, radius: .3, height: 4 }]);
  step(sim, 150, { moveZ: 1 });
  Object.assign(sim.player, { x: 5, z: 4, velocityZ: 0 });
  step(sim, 300);
  const [pose] = sim.streetObjects.damage.values();
  assert.ok(pose?.settled && pose.dz > .3 && pose.dz + .88 * Math.sin(pose.tilt) < 1.71);
  assert.ok(!sim.isBlocked(0, z - .28, .04));
  assert.ok(sim.isBlocked(0, z + pose.dz, .04));
  const matrix = new THREE.Matrix4();
  props.meshes.baskets.getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[14] - (z + pose.dz)) < .001 && Math.abs(matrix.elements[5] - Math.cos(pose.tilt)) < .001);
  props.dispose();
});

test('a car folds one subway rail broadside and the fallen panel can be crossed', () => {
  const { sim, car } = driving(17);
  const scene = new THREE.Scene(), stairs = createSubwayEntrances({ scene, physics: sim.streetObjects, facing: () => [1, 0] });
  stairs.update({ entrancesNear: () => [{ x: 0, z: 5, kind: 0 }] }, car);
  assert.ok(sim.isBlocked(-1.75, 4.22, .1));
  assert.ok(!sim.isBlocked(-1.9, 5, .1), 'the mouth of the stair stays open');
  const [first, second] = sim.streetObjects.groups.get('rail');
  for (let i = 0; i < 60 && !sim.streetObjects.damage.size; i++) step(sim, 1);
  assert.equal([first, second].filter(b => b.pose).length, 1);
  // Freeze the car midway through the first impact to isolate the struck panel.
  sim.cars = []; sim.player.mode = 'walk'; sim.player.x = 20;
  step(sim, 240);
  const folded = [first, second].find(b => b.pose), upright = folded === first ? second : first;
  assert.ok(folded.pose.settled && !sim.isBlocked(folded.x, folded.z, .05));
  assert.ok(sim.isBlocked(upright.x, upright.z, .05));
  const mesh = scene.getObjectByName('Subway railing panels'), matrix = new THREE.Matrix4();
  mesh.getMatrixAt(folded === first ? 0 : 1, matrix); assert.ok(Math.abs(matrix.elements[5]) < .001);
  stairs.dispose();
});

test('mapped median panels have independent stable identities and a glancing strike leaves the section standing', async () => {
  const surface = { id: 'median/7', kind: 'median', subtype: 'fenced median', polygon: [[0,0],[10,0],[10,2],[0,2]] };
  const { fences } = await buildCell([surface], []);
  assert.equal(fences.length, 10);
  assert.equal(new Set(fences.map(body => body.id)).size, 10);
  const physics = new StreetObjects();
  physics.replace('0,0', fences);
  const hit = physics.contact(1.25, -.2, .3, 0);
  assert.equal(hit.body, fences[0]);
  assert.equal(physics.strike(hit, { id: 'cab' }, 18, 1, true, 0), null);
  assert.equal(physics.damage.size, 0);
});

test('a thin street tree tips as one piece and keeps its crown attached when streamed back in', () => {
  const { sim, car } = driving(15);
  const tree = { x: 0, y: 0, z: 4, girth: .1, species: 'ginkgo' };
  let trees = [tree];
  const life = createStreetLife({ physics: sim.streetObjects, getTrees: () => trees });
  life.update(car);
  step(sim, 200);
  const [stem] = sim.streetObjects.groups.get('tree');
  assert.ok(stem.pose?.settled);
  trees = []; life.update(car);
  trees = [tree]; life.update(car);
  const getMatrix = name => {
    const matrix = new THREE.Matrix4();
    life.group.getObjectByName(name).getMatrixAt(0, matrix);
    return matrix;
  };
  const tip = new THREE.Vector3(0, 1, 0).applyMatrix4(getMatrix('Street tree trunks'));
  const crown = new THREE.Vector3().setFromMatrixPosition(getMatrix('Street tree crowns'));
  assert.ok(tip.z > tree.z + 2 && tip.distanceTo(crown) < .001);
  life.dispose();
});

test('ordinary traffic knocks a basket aside and slows to scrape around a mature tree', () => {
  const sim = game([{ id: 'street', name: 'Street', points: [[0, -80], [0, 80]], width: 12 }]);
  const edge = sim._graph.edges.find(e => Math.cos(e.angle) > .9);
  const lane = sim._lanePoint(edge, .5);
  Object.assign(sim.player, { x: 25, z: 0 });
  const car = sim._makeCar('traffic-test', 'sedan', lane, edge.angle, edge);
  car._cruise = car.speed = 12;
  sim.cars = [car];
  sim.streetObjects.replace('basket', [{ id: 'bin', x: lane.x, z: lane.z + 6, y: 0, radius: .3, height: .88 }]);
  sim.streetObjects.replace('tree', [{ x: lane.x, z: lane.z + 18, y: 0, radius: .35, height: 5 }]);
  let slowest = Infinity, clearance = Infinity;
  for (let i = 0; i < 1200; i++) {
    step(sim, 1);
    if (Math.abs(car.z - lane.z - 16) < 1) slowest = Math.min(slowest, car.speed);
    clearance = Math.min(clearance, Math.hypot(car.x - lane.x, car.z - lane.z - 18));
  }
  assert.ok(sim.streetObjects.damage.get('bin')?.settled);
  assert.ok(slowest < 4 && clearance > 1.1);
  assert.ok(car.z > lane.z + 20, 'the AI can get moving again once clear of the tree');
});

test('a mounted Citi Bike stops against a streetlamp and leaves it standing', () => {
  const sim = game();
  sim.cars = [];
  sim.dockedBikes = [{ id: 'rental', x: 0, y: 0, z: 0, angle: 0 }];
  assert.ok(sim.interact());
  assert.equal(sim.player.mode, 'bike');
  sim.streetObjects.replace('lamp', [{ id: 'post', x: 0, y: 0, z: 5, nx: 1, nz: 0, height: 8.2, radius: .13 }]);
  step(sim, 550, { forward: 1 });
  assert.ok(sim.player.z > 4 && sim.player.z < 4.4);
  assert.equal(sim.streetObjects.damage.size, 0);
});

test('a bumper rolls a soft bag and tears it at speed; collection clears the collision and scraps',async()=>{
  const {createTrashMesh}=await import('../dist/trash.js');
  for(const speed of [3,14]){
    const {sim,car}=driving(speed);
    const trash=createTrashMesh({physics:sim.streetObjects}), heaps=[{x:0,z:3,tx:1,tz:0,bags:1,days:1}];
    trash.setHeaps(heaps);trash.show(6,21);
    step(sim,150,{forward:speed<7?0:.4});
    const [pose]=sim.streetObjects.damage.values();
    assert.ok(pose && Math.hypot(pose.dx,pose.dz)>.1 && pose.tilt>0);
    assert.equal(Boolean(pose.torn),speed>7);
    trash.setHeaps(heaps);trash.show(0,4);
    assert.equal(trash.mesh.children[0].count,speed>7?4:0);
    assert.ok(car.z>1);
    trash.show(0,9);
    assert.equal(sim.streetObjects.grid.size,0);
    assert.equal(sim.streetObjects.damage.size,0);
    assert.equal(trash.mesh.children[0].count,0);
    trash.dispose();
  }
});

test('a head-on sprint into a fixed post recoils, while walking into it just stops',()=>{
  for(const run of [false,true]){
    const sim=game();sim.cars=[];
    sim.streetObjects.replace('signalPole',[{fixed:true,x:0,y:0,z:5,radius:.15,height:7}]);
    const p=sim.player; Object.assign(p,{x:0,y:0,z:0,angle:0});
    for(let i=0;i<420 && !p.reaction;i++)step(sim,1,{moveZ:1,run});
    assert.equal(Boolean(p.reaction),run);
    assert.ok(p.z<4.6);
    if(run)assert.ok(p.reaction.vz<0);
  }
});
