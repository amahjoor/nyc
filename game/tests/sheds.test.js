import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { indexFootprints } from '../dist/places.js';
import { createSheds, planSheds, createShedMesh, SHED } from '../dist/sheds.js';
import { StreetObjects } from '../dist/street-objects.js';

const data = JSON.parse(readFileSync(new URL('../dist/sheds.json', import.meta.url), 'utf8'));

test('a streamed scaffold has solid uprights and a walkable passage under its deck', () => {
  const physics=new StreetObjects(), shed=createShedMesh({physics});
  const run={ax:0,az:0,bx:8,bz:0,length:8,nx:0,nz:1};
  shed.update([run]);
  const post=physics.contact(0,SHED.depth,.3,0);
  assert.equal(post.body.kind,'shedPost');
  assert.equal(physics.strike(post,{id:'car'},-18,0,true,0),null);
  assert.equal(physics.contact(0,SHED.depth,.3,SHED.deck+1),null);
  for(let x=0;x<=8;x+=.25)assert.equal(physics.contact(x,SHED.depth/2,.33,0),null);
  shed.update([]);
  assert.equal(physics.contact(0,SHED.depth,.3,0),null);
  shed.update([run]);shed.dispose();
  assert.equal(physics.contact(0,SHED.depth,.3,0),null);
});

test('the bundled permits are thousands of buildings across the city, and nothing but where they are', () => {
  assert.ok(data.sheds.length > 3000 && data.sheds.length < 15000, `${data.sheds.length} sheds`);
  for (const shed of data.sheds) assert.ok(shed.length === 3 && shed.every(Number.isFinite) && Math.abs(shed[0]) < 40000 && Math.abs(shed[1]) < 40000);
  assert.deepEqual(data.row, ['x', 'z', 'bin']);
  assert.match(data.source.url, /^https:\/\/data\.cityofnewyork\.us\/d\//);
  const sheds = createSheds(data);
  assert.equal(sheds.count, data.sheds.length);
  assert.ok(sheds.near(126, -80, 400).length > 5 && sheds.near(126, -80, 400).every(shed => Math.hypot(shed.x - 126, shed.z + 80) <= 400), 'SoHo has its share');
  assert.deepEqual(createSheds(null).near(0, 0, 500), []);
});

test('a shed runs along each wall of its building that faces a street, and no other', () => {
  // Two buildings side by side on the north of a street; the street is everything south of z = 0.
  const west = { polygon: [[0, -20], [10, -20], [10, 0], [0, 0]] }, east = { polygon: [[10, -20], [30, -20], [30, 0], [10, 0]] };
  const footprints = indexFootprints([west, east]), isStreet = (x, z) => z > 0;
  const runs = planSheds([{ x: 20, z: -10 }], footprints, isStreet);
  assert.equal(runs.length, 1, 'only the wall on the street, and only of the building permitted');
  const [run] = runs;
  assert.deepEqual([Math.min(run.ax, run.bx), Math.max(run.ax, run.bx), run.az, run.bz, run.nx, run.nz, run.length], [10, 30, 0, 0, 0, 1, 20]);
  // An address point on the sidewalk just outside finds its building; one far from any does not; a building is shedded once.
  assert.equal(planSheds([{ x: 5, z: 3 }, { x: 4, z: -4 }], footprints, isStreet).length, 1);
  assert.deepEqual(planSheds([{ x: 5, z: 60 }], footprints, isStreet), []);
  assert.deepEqual(planSheds([{ x: 20, z: -10 }], footprints, () => false), [], 'no street, no shed');
});

test('a shed is a level deck with a green parapet on posts that reach the ground', () => {
  const scene = new THREE.Scene(), shed = createShedMesh({ scene, heightAt: x => x * .05 });
  const run = { ax: 10, az: 0, bx: 30, bz: 0, nx: 0, nz: 1, length: 20 };
  assert.equal(shed.update([run]), 1);
  const mesh = scene.getObjectByName('Sidewalk sheds'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), colour = new THREE.Color();
  const parts = Array.from({ length: mesh.count }, (_, i) => { mesh.getMatrixAt(i, matrix); matrix.decompose(at, turn, size); mesh.getColorAt(i, colour); return { x: at.x, y: at.y, z: at.z, w: size.x, h: size.y, d: size.z, tone: colour.getHex() }; });
  const bays = Math.round(20 / SHED.bay), posts = parts.filter(part => part.w < .08 && part.d < .08);
  assert.equal(posts.length, (bays + 1) * 2); assert.equal(mesh.count, posts.length + 6);
  // The ground climbs a metre and a half along the wall: the deck is level over its highest end.
  const top = 30 * .05 + SHED.deck, deck = parts[0];
  assert.ok(Math.abs(deck.y - top - .06) < 1e-5 && Math.abs(deck.d - 20) < 1e-5 && Math.abs(deck.z - SHED.depth / 2) < 1e-5 && Math.abs(deck.x - 20) < 1e-5);
  for (const post of posts) assert.ok(Math.abs(post.y - post.h / 2 - post.x * .05) < 1e-4 && Math.abs(post.y + post.h / 2 - top) < 1e-4, 'each post stands on the ground and meets the deck');
  assert.ok(posts.every(post => post.z > 0 && post.z <= SHED.depth + 1e-6), 'all of it is over the sidewalk');
  assert.equal(parts.filter(part => part.tone === 0x1d4a34).length, 3, 'a parapet along the kerb side and across each end');
  // More stretches than there is room for: those that fit are drawn whole.
  const small = createShedMesh({ capacity: 40 });
  assert.equal(small.update([run, run, run]), 1); assert.ok(small.parts <= 40);
  assert.equal(shed.update([]), 0); assert.equal(mesh.count, 0);
  shed.dispose(); small.dispose(); assert.equal(scene.children.length, 0);
});
