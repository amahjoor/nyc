import { drivingCity } from './fixtures/parked-cab.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { PANEL, carCondition, impactVehicle, repairVehicle, stepVehicleFire, strikeVehicleGlass } from '../dist/vehicle-damage.js';
import { createDoorDebris, hasAlteredGlazing, vehicleShotContacts } from '../dist/vehicle-detail.js';
import { placeDriverCamera } from '../dist/driver-cabin.js';
import { createCar, updateCarVisuals } from '../dist/world.js';
import { designFor } from '../dist/vehicle-designs.js';
import { generateVehicle } from '../dist/vehicle-generator.js';
import { beginEntry, stepMove, lockedAt } from '../dist/player-moves.js';

const fresh = () => ({ id: 'test', x: 0, y: 0, z: 0, speed: 0, angle: 0, parked: true });
const town = () => drivingCity({ bounds: { minX:-500, maxX:500, minZ:-500, maxZ:500 },
  roads: [], buildings: [], missionPoints: [], spawn: { x:0, z:0, angle:0 } });

test('shots pass through modeled car panes and stop at metal in either detail level', () => {
  const car = fresh(), model = generateVehicle(designFor('Toyota','RAV4',2021,'suv'));
  const mesh = createCar({model}), {pieces} = mesh.userData.detail;
  updateCarVisuals(mesh,car,0);
  const side = new THREE.Vector3(-1,0,0), front = new THREE.Vector3(0,0,-1);
  const cast = (drawn,x,y,z,ray) => vehicleShotContacts(car,drawn,model,new THREE.Vector3(x,y,z),ray,12);
  for (const drawn of [null,mesh]) {
    const {panes,distance} = cast(drawn,4,1.4,.23,side);
    assert.deepEqual(panes.map(hit=>hit.panel),[PANEL.left,PANEL.right]);
    assert.equal(distance,Infinity);
    const low = cast(drawn,4,.7,.23,side);
    assert.equal(low.panes.length,0);
    assert.ok(Number.isFinite(low.distance));
  }
  const frontHit = cast(mesh,.15,1.4,4,front).panes.find(hit=>hit.panel===PANEL.front);
  assert.ok(frontHit.offset>.5 && strikeVehicleGlass(car,frontHit.panel,frontHit.offset));
  assert.ok(strikeVehicleGlass(car,PANEL.left,.5));
  assert.equal(strikeVehicleGlass(car,PANEL.left,.5),false);
  assert.ok(hasAlteredGlazing(car) && carCondition(car)<100);
  updateCarVisuals(mesh,car,0);
  assert.equal(pieces.windshield.material.name,'Fractured car glass');
  assert.ok(pieces.windshield.visible && pieces.leftQuarterGlass.visible && pieces.rightGlass.visible);
  assert.equal(pieces.leftGlass.visible,false);
  assert.deepEqual(cast(mesh,4,1.4,.23,side).panes.map(hit=>hit.panel),[PANEL.right]);
  repairVehicle(car);
  updateCarVisuals(mesh,car,0);
  assert.ok(pieces.leftGlass.visible && !hasAlteredGlazing(car));
  assert.equal(carCondition(car),100);
});

test('the seat camera looks through the fitted windshield through damage, repair and vehicle changes', () => {
  const camera = new THREE.PerspectiveCamera();
  const van = generateVehicle(designFor('Toyota','Sienna',2015,'minivan'));
  for (const mesh of [createCar({type:'taxi'}), createCar({model:van})]) {
    const car = fresh(), pane = mesh.userData.detail.pieces.windshield;
    function update() {
      updateCarVisuals(mesh, car, 0);
      placeDriverCamera(camera, mesh, 0, 0);
      mesh.updateMatrixWorld(true);
    }
    update();
    const clear = pane.material;
    const ray = new THREE.Raycaster(camera.position, camera.getWorldDirection(new THREE.Vector3()));
    assert.ok(ray.intersectObject(pane).length, 'the driver looks through the actual windshield');
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

test('upright rear windows have a clear sightline through the tailgate from either side', () => {
  for (const spec of [designFor('Ford','Transit',2019,'van','cargo'), designFor('Toyota','Sienna',2015,'minivan')]) {
    const car = createCar({model:generateVehicle(spec)});
    car.updateMatrixWorld(true);
    const {pieces} = car.userData.detail, pane = pieces.rearGlass.geometry;
    const point = new THREE.Vector3(), corner = new THREE.Vector3();
    for (let i=0; i<3; i++) point.add(corner.fromBufferAttribute(pane.attributes.position,pane.index.getX(i)));
    point.divideScalar(3);
    for (const sign of [-1,1]) {
      const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0,0,.3*sign)),new THREE.Vector3(0,0,-sign),0,.6);
      assert.ok(ray.intersectObject(pieces.rearGlass).length);
      assert.equal(ray.intersectObject(pieces.body).length,0,spec.id);
    }
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

test('a corner pole strike folds that fender and spreads cracks across its own windshield on subsequent hits', () => {
  const model=generateVehicle(designFor('Toyota','Sienna',2015,'minivan'));
  const mesh=createCar({model}), twin=createCar({model}), car=fresh();
  const {pieces}=mesh.userData.detail;
  const rest=pieces.body.geometry.attributes.position;
  const corner={x:.72,z:1.96,body:{kind:'tree'}};
  impactVehicle(car,16,0,-1,1,corner);
  updateCarVisuals(mesh,car,0);
  const pos=pieces.body.geometry.attributes.position, depths=[0,0];
  for(let i=0;i<rest.count;i++){
    if(rest.getZ(i)>1.4 && Math.abs(rest.getX(i))>.45) {
      const side=Number(rest.getX(i)>0);
      depths[side]=Math.max(depths[side],rest.getZ(i)-pos.getZ(i));
    }
  }
  assert.ok(depths[1]>.05 && depths[0]<.001, 'the opposite fender stays straight');
  const initial=car.dents[PANEL.front], origin=car.fractureOrigin[PANEL.front];
  assert.ok(origin>.7);
  assert.equal(car.lastImpact.x,.72);
  const cracked=pieces.windshield.material;
  impactVehicle(car,26,0,-1,2,{...corner,x:-.75});
  updateCarVisuals(mesh,car,0);
  assert.equal(car.fractureOrigin[PANEL.front],origin);
  assert.ok(car.secondFracture.origin<.3 && car.secondFracture.depth>0);
  assert.ok(car.dents[PANEL.front]>initial && pieces.windshield.visible);
  assert.equal(pieces.windshield.material,cracked);
  assert.notEqual(cracked,twin.userData.detail.pieces.windshield.material);
  impactVehicle(car,12,-1,0,3,{x:.92,z:.3});
  updateCarVisuals(mesh,car,0);
  assert.ok(pieces.leftGlass.visible && pieces.leftGlass.material!==pieces.rightGlass.material);
  impactVehicle(car,19,-1,0,4,{x:.92,z:.3});
  updateCarVisuals(mesh,car,0);
  assert.ok(!pieces.leftGlass.visible && pieces.rightGlass.visible && car.lastImpact.shattered);
  repairVehicle(car); updateCarVisuals(mesh,car,0);
  assert.equal(pieces.body.geometry.attributes.position,rest);
  assert.equal(pieces.leftGlass.material,pieces.windshield.material);
  assert.ok(pieces.leftGlass.visible && !car.lastImpact);
});
