import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { PANEL, impactVehicle, repairVehicle, stepVehicleFire } from '../dist/vehicle-damage.js';
import { createDoorDebris } from '../dist/vehicle-detail.js';
import { createDriverCabin } from '../dist/driver-cabin.js';
import { createCar, updateCarVisuals } from '../dist/world.js';
import { designFor } from '../dist/vehicle-designs.js';
import { generateVehicle } from '../dist/vehicle-generator.js';
import { Simulation } from '../dist/simulation.js';
import { beginEntry, stepMove, lockedAt } from '../dist/player-moves.js';

const fresh = () => ({ id: 'test', x: 0, y: 0, z: 0, speed: 0, angle: 0, parked: true });
const town = () => new Simulation({ bounds: { minX:-500, maxX:500, minZ:-500, maxZ:500 },
  roads: [], buildings: [], missionPoints: [], spawn: { x:0, z:0, angle:0 } });

test('the driver sees glass from pillar to pillar through damage, repair and vehicle changes', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const cabin = createDriverCabin(scene);
  const pane = cabin.group.getObjectByName('Cabin windshield');
  const pillars = ['Left', 'Right'].map(side => cabin.group.getObjectByName(side + ' windshield pillar'));
  const van = generateVehicle(designFor('Toyota','Sienna',2015,'minivan'));
  for (const mesh of [createCar({type:'taxi'}), createCar({model:van})]) {
    const car = fresh();
    function update() {
      updateCarVisuals(mesh, car, 0);
      cabin.placeCamera(camera, mesh, .3, 0);
      cabin.group.updateMatrixWorld(true);
    }
    update();
    const clear = pane.material;
    assert.ok(clear.opacity < mesh.userData.detail.pieces.windshield.material.opacity);
    for (const height of [-.45, 0, .45]) {
      const [left, right] = pillars.map(pillar => pillar.localToWorld(new THREE.Vector3(0, height, 0)));
      for (const across of [-.04, .04, .5, .96, 1.04]) {
        const target = left.clone().lerp(right, across);
        const ray = new THREE.Raycaster(camera.position, target.sub(camera.position).normalize());
        assert.equal(ray.intersectObject(pane).length > 0, across > 0 && across < 1);
      }
    }
    impactVehicle(car, 16, 0, -1, 2);
    update();
    assert.ok(pane.visible);
    assert.notEqual(pane.material.onBeforeCompile, clear.onBeforeCompile);
    car.brokenGlass = PANEL.front;
    update();
    assert.equal(pane.visible, false);
    repairVehicle(car);
    update();
    assert.ok(pane.visible);
    assert.equal(pane.material, clear);
  }
});

test('local impacts bend only the hit car, break glass, tear open doors and repair back to the shared mesh', () => {
  const model = generateVehicle(designFor('Toyota','Sienna',2015,'minivan'));
  const car = fresh(), mesh = createCar({ model }), twin = createCar({ model });
  const detail = mesh.userData.detail, original = twin.getObjectByName('Car body').geometry;
  car.doorOpen = .9; car.doorSide = 1;
  impactVehicle(car, 18, -1, 0, 1);
  updateCarVisuals(mesh,car,0);
  assert.equal(car.missingDoors, PANEL.left); assert.equal(detail.doors[0].visible,false);
  assert.ok(car.brokenGlass & PANEL.left); assert.ok(detail.doors[1].visible);
  impactVehicle(car, 16, 0, -1, 2);
  updateCarVisuals(mesh,car,0);
  assert.ok(detail.hood.rotation.x < 0 && detail.pieces.windshield.visible);
  assert.notEqual(detail.pieces.windshield.material,twin.userData.detail.pieces.windshield.material);
  impactVehicle(car, 21, 0, 1, 3);
  updateCarVisuals(mesh,car,0);
  const changed = detail.pieces.body.geometry.attributes.position, intact = original.attributes.position;
  assert.notEqual(changed, intact);
  const { min, max } = original.boundingBox;
  for (const [end, correction] of [[min.z, 1], [max.z, -1]]) {
    let i = 0;
    while (i < intact.count && Math.abs(intact.getZ(i)-end) > .01) i++;
    assert.ok(i < intact.count && (changed.getZ(i) - intact.getZ(i)) * correction > .05);
  }
  repairVehicle(car); updateCarVisuals(mesh,car,0);
  assert.equal(detail.pieces.body.geometry, original); assert.ok(detail.doors.every(door => door.visible));
  assert.equal(detail.pieces.windshield.material,twin.userData.detail.pieces.windshield.material);
});

test('entry opens the door, breaks the locked pane or ejects an occupied driver at the animation cue', () => {
  for (const occupied of [false,true]) {
    const sim = town(), car = sim.cars.find(c => c.id === 'player-taxi');
    car.id = 'kerb-1'; while (!lockedAt(car)) car.id += 'a';
    car._edge = occupied ? {} : null; car.parked = !occupied;
    sim.cars = [car]; sim.moves = true;
    Object.assign(sim.player, { x:car.x+1.6, z:car.z, y:car.y });
    const mesh = createCar();
    assert.ok(beginEntry(sim,car));
    updateCarVisuals(mesh,car,0);
    assert.equal(Boolean(mesh.userData.detail.driver.visible), occupied);
    assert.equal(sim.player.move.kind, occupied ? 'carjack' : 'breakIn');
    for (let i=0; i<90; i++) stepMove(sim,1/120);
    updateCarVisuals(mesh,car,0);
    assert.ok(car.doorOpen > .9 && !mesh.userData.detail.driver.visible);
    assert.ok(sim.moveEvents.some(e=>e.kind === (occupied ? 'thrown' : 'glass')));
    if (!occupied) assert.ok(car.brokenGlass & PANEL.left);
    for (let i=0; i<120; i++) stepMove(sim,1/120);
    assert.equal(sim.vehicle,car);
    updateCarVisuals(mesh,car,0); assert.ok(mesh.userData.detail.driver.visible);
  }
});

test('a burning car loses propulsion, allows escape, explodes once and can be recovered by the mechanic', () => {
  const sim = town(); sim.interact();
  const cab = sim.vehicle;
  impactVehicle(cab,37,0,-1,sim.elapsed); assert.equal(cab.burningSince,0);
  sim.step({ forward:1 },1/60); assert.equal(cab.speed,0);
  assert.ok(sim.interact()); assert.equal(sim.getNearbyCar(),null);
  sim.player.x += 18;
  for (let i=0;i<10*60;i++) sim.step({},1/60);
  assert.ok(cab.destroyed && cab.explodedAt >= 9); assert.equal(sim.health,100);
  assert.equal(stepVehicleFire(cab,20),false); assert.equal(sim.getNearbyCar(),null);
  sim.cash=500; assert.ok(sim.callMechanic()); assert.equal(cab.damage,0); assert.equal(cab.destroyed,false);
  sim.player.x=cab.x+2; sim.player.z=cab.z; assert.ok(sim.interact()); assert.equal(sim.vehicle,cab);
});

test('a detached panel inherits motion, settles at road height and expires', () => {
  const car = fresh(), scene = new THREE.Scene(), debris = createDoorDebris(scene), mesh = createCar();
  car.doorSide=1; car.doorOpen=1; car.velocityZ=5;
  updateCarVisuals(mesh,car,0); debris.detach(mesh.userData.detail.doors[0],car,1);
  const panel=scene.children[0], z=panel.position.z;
  for (let i=0;i<240;i++) debris.update(1/120);
  assert.ok(panel.position.z>z+1 && panel.position.y>=0 && panel.position.y<.2);
  for (let i=0;i<800;i++) debris.update(1/120);
  assert.equal(scene.children.length,0);
});

test('traffic occupants escape a fire and parked wrecks are skipped when choosing a car', () => {
  const sim = town();
  const car = sim._makeCar('traffic-fire','sedan',{x:20,z:18},0);
  Object.assign(car,{_edge:{road:{}},parked:false});
  sim.cars.push(car);
  impactVehicle(car,40,0,-1,0);
  for (let i=0;i<3*60;i++) sim.step({},1/60);
  assert.equal(car.driverEjected,true);
  assert.equal(sim.moveEvents.filter(e=>e.kind==='escapeFire').length,1);
  assert.ok(car.doorOpen>0 || car.doorSide===1);
  const spare = sim._makeCar('spare','sedan',{x:car.x+3,z:car.z},0);
  sim.cars.push(spare); Object.assign(sim.player,{x:car.x+.6,z:car.z});
  assert.equal(sim.getNearbyCar(),spare);
});

test('an open door can snag a passing vehicle while the car body stays clear', () => {
  const sim=town(); sim.interact(); const car=sim.vehicle;
  Object.assign(car,{doorSide:1,doorOpen:1,doorHold:2});
  const other=sim._makeCar('passing','sedan',{x:car.x+2.5,z:car.z},0);
  other.speed=12; sim.cars.push(other);
  sim.step({},1/60);
  assert.equal(car.missingDoors,PANEL.left);
  assert.equal(car.damage,.08);
});
