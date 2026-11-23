import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestShotActor, shotObstruction, traceShopShot } from '../dist/weapon-aim.js';
import { roomRayDistance } from '../dist/room.js';
import { Simulation } from '../dist/simulation.js';

test('a 3D shot hits the closest actor on the ray across different elevations', () => {
  const origin = { x: 0, y: 1.5, z: 0 };
  const direction = { x: 2 / 3, y: 1 / 3, z: 2 / 3 };
  const below = { x: 4, y: 0, z: 4 };
  const person = { x: 6, y: 3.5, z: 6 };
  const officer = { x: 8, y: 4.5, z: 8 };
  const hit = nearestShotActor(origin, direction, 30, [below, person], [officer]);
  assert.equal(hit.actor, person);
  assert.equal(hit.officer, false);
  assert.ok(hit.distance > 8.5 && hit.distance < 9);
  assert.equal(nearestShotActor(origin, { x: 0, y: -1, z: 0 }, 30, [below], []), null);
  assert.equal(nearestShotActor({ x: 8, y: 10, z: 8 }, { x: 0, y: -1, z: 0 }, 20, [], [officer]).actor, officer);
});

test('terrain stops a downward shot at the correct height', () => {
  const origin = { x: 0, y: 1.4, z: 0 };
  const ground = (_x, y) => y <= 0;
  assert.ok(Math.abs(shotObstruction(origin, { x: .6, y: -.8, z: 0 }, 10, ground) - 1.75) < .01);
  assert.equal(shotObstruction(origin, { x: .6, y: .8, z: 0 }, 10, ground), 10);
});

test('indoor shots stop at thin cover, walls and the floor at the room elevation', () => {
  const room={x:0,z:0,nx:0,nz:-1,tx:1,tz:0,width:8,depth:6,floor:4,
    things:[{a:0,b:3,w:3,d:.08,h:1.55,y:0,solid:true}]};
  const forward={x:0,y:0,z:1};
  assert.ok(Math.abs(roomRayDistance(room,{x:0,y:5.4,z:1},forward,15)-1.96)<1e-8);
  assert.equal(roomRayDistance(room,{x:0,y:6,z:1},forward,15),5);
  assert.equal(roomRayDistance(room,{x:0,y:5.5,z:1},{x:0,y:-1,z:0},15),1.5);
  assert.equal(roomRayDistance(room,{x:0,y:5.5,z:1},forward,.4),.4);
});

test('shots cross shop windows in either direction while the frames and cover stop them', () => {
  const building = {id:'shop',polygon:[[-4,0],[4,0],[4,6],[-4,6]],height:10};
  const sim = new Simulation({bounds:{minX:-30,minZ:-30,maxX:30,maxZ:30},spawn:{x:0,z:-8},buildings:[building]});
  const plan = {x:0,z:0,nx:0,nz:-1,tx:1,tz:0,width:8,depth:6,returns:[{side:1,length:4}],things:[]};
  const inside = {x:2.8,z:3,y:4}, outside = {x:2.8,z:-3,y:4};
  const view = {plan,floor:4,front:{building},actors:[inside],door:{angle:0}};
  const forward = {x:0,y:0,z:1}, back = {x:0,y:0,z:-1};
  const streetBlocked = (x,y,z,apertureBuildings)=>sim.isBlocked(x,z,.04,{baseHeight:y,height:0,apertureBuildings});
  const fire = (x,y,z,ray=forward)=>traceShopShot({x,y,z},ray,15,{views:[view],people:[outside],officers:[],streetBlocked});
  const entering = fire(2.8,5.5,-2);
  assert.equal(entering.actor,inside);
  assert.deepEqual(entering.panes.map(pane=>pane.id),['front:1']);
  const leaving = fire(2.8,5.5,2,back);
  assert.equal(leaving.actor,outside);
  assert.deepEqual(leaving.panes.map(pane=>pane.id),['front:1']);
  assert.deepEqual(fire(6,5.5,1,{x:-1,y:0,z:0}).panes.map(pane=>pane.id),['side:1']);
  assert.equal(fire(2.24,5.5,-2).panes.length,0,'mullion');
  assert.equal(fire(2.8,4.3,-2).panes.length,0,'sill');
  assert.equal(fire(1.5,5.5,3,forward).distance,3,'back wall');
  plan.things.push({a:2.8,b:1.5,w:.6,d:.1,h:1.7,solid:true});
  assert.equal(fire(2.8,5.5,-2).actor,undefined);
  assert.equal(fire(2.8,5.5,2,back).panes.length,0,'cover before pane');
  assert.deepEqual(fire(0,5.5,-2).panes.map(pane=>pane.id),['door']);
  assert.equal(fire(.52,5.5,-2).panes.length,0,'door jamb');
  view.door.angle=Math.PI/2;
  assert.equal(fire(0,5.5,-2).panes.length,0,'open doorway');
  assert.equal(fire(0,5.5,-2).distance,8);
});

test('glass guards and display cases pass shots through their panes and retain solid bases', () => {
  const showcase = {a:0,b:3,w:2,d:.8,h:1.5,y:0,solid:true,shape:'showcase',face:[0,-1]};
  const guard = {a:0,b:2,w:2,d:.02,h:.5,y:1,solid:false,glass:true};
  const plan = {x:0,z:0,nx:0,nz:-1,tx:1,tz:0,width:8,depth:6,things:[showcase,guard]};
  const actor = {x:0,y:0,z:4}, view = {plan,floor:0,actors:[actor]};
  const fire = (x,y)=>traceShopShot({x,y,z:1},{x:0,y:0,z:1},8,
    {views:[view],people:[],officers:[],streetBlocked:()=>false});
  const through = fire(0,1.3);
  assert.equal(through.actor,actor);
  assert.deepEqual(through.panes.map(pane=>pane.id),['fixture:1:0','fixture:0:0','fixture:0:2']);
  const base = fire(0,.85);
  assert.equal(base.actor,undefined);
  assert.equal(base.panes.length,0);
  assert.equal(base.distance,1.6);
  assert.equal(fire(.988,1.3).panes.length,1,'the case post stops the shot after the guard');
});
