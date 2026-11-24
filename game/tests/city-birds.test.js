import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCityBirds } from '../dist/city-birds.js';

test('pigeons flush and settle along the loaded sidewalk, gulls stay by water', () => {
  const scene = new THREE.Scene();
  const heard = [];
  const birds = createCityBirds({scene, heightAt:() => 2, openWater:x => x > 200, onTakeoff:at => heard.push(at)});
  const walk = {points:[[0, 0], [0, 80]], lengths:[0, 80], normals:[[1, 0]], length:80, depth:1};
  const frame = {focus:{x:-1, y:2, z:22}, forward:{x:0, z:1}, walks:[walk], visible:true};
  const bodies = scene.getObjectByName('Rock pigeon body'), gulls = scene.getObjectByName('Harbor gull body');
  function position() {
    const matrix = new THREE.Matrix4();
    bodies.getMatrixAt(2, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  }
  birds.update(.1, frame);
  const perch = position();
  assert.equal(bodies.visible, true); assert.equal(gulls.visible, false);
  assert.ok(Math.abs(perch.y - 2.1) < .001 && perch.x < 0 && perch.x >= -1 && perch.z > frame.focus.z + 10);
  frame.focus.z = perch.z - 1;
  birds.update(.1, frame); birds.update(.8, frame);
  const flight = position();
  assert.equal(heard.length, 1);
  assert.ok(flight.y > 3 && flight.z > perch.z);
  birds.update(0, frame); assert.deepEqual(position(), flight);
  birds.update(5, frame);
  assert.ok(Math.abs(position().y - perch.y) < .001);
  frame.focus.x = 300; frame.walks = [];
  birds.update(.1, frame);
  assert.equal(bodies.visible, false); assert.equal(gulls.visible, true);
  birds.update(.1, {...frame, visible:false}); assert.equal(birds.group.visible, false);
  birds.dispose(); assert.equal(scene.children.length, 0);
});

test('stationary listeners hear grounded pigeons and offshore gulls at their own positions', () => {
  const calls=[];
  const birds=createCityBirds({scene:new THREE.Scene(),heightAt:()=>2,openWater:x=>x>200,
    onCall:(family,at)=>calls.push({family,at})});
  const walk={points:[[0,0],[0,80]],lengths:[0,80],normals:[[1,0]],length:80,depth:1};
  const frame={focus:{x:-1,y:2,z:22},forward:{x:0,z:1},walks:[walk],visible:true};
  birds.update(4,frame);
  assert.deepEqual(calls.map(c=>c.family),['pigeon']);assert.ok(calls[0].at.z>30);
  birds.update(35,{...frame,visible:false});birds.update(0,frame);assert.equal(calls.length,1);
  birds.update(8,{...frame,walks:[],focus:{x:300,y:0,z:22}});
  assert.equal(calls.at(-1).family,'gull');assert.ok(calls.at(-1).at.y>8);
  birds.dispose();
});
