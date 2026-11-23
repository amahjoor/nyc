import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Group, Matrix4 } from '../dist/vendor/three.module.min.js';
import { decodeI3S } from '../dist/city-stream.js';
import { createRoofTankModels, indexRoofTanks, matchRoofTanks } from '../dist/roof-tanks.js';

const read = path => readFileSync(new URL(path, import.meta.url));
const bufferOf = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('a SoHo leaf matches the city tank survey while coarser building meshes omit it', () => {
  const { nodes, origin } = JSON.parse(read('../dist/city-index.json'));
  const node = nodes.find(node => node.resource === 4341);
  const bytes = bufferOf(gunzipSync(read('./fixtures/i3s-soho.bin.gz')));
  const tankIndex = indexRoofTanks(bufferOf(read('../dist/roof-tanks.bin')));
  const leaf = decodeI3S(bytes, node, origin, { tankIndex });
  const tanks = leaf.anchors.flatMap(anchor => anchor.tanks || []);
  assert.ok(tanks.length > 0);
  assert.equal(new Set(tanks.map(tank => [tank.x,tank.z].join(','))).size, tanks.length);
  assert.ok(tanks.every(tank => tank.radius > 0 && tank.height > 0 && tank.roof > 0));
  const coarse = decodeI3S(bytes, node, origin, { collisions:false, tankIndex });
  assert.ok(coarse.anchors.every(anchor => !anchor.tanks));
});

test('a mapped tank needs roof support under the barrel and around its rim', () => {
  const tank = {x:5,z:5,radius:1.5,base:13,height:4};
  const index = new Map([['0,0',[tank]]]);
  const rectangle = (x1,z1,x2,z2,y) => [x1,y,z1, x2,y,z1, x1,y,z2, x1,y,z2, x2,y,z1, x2,y,z2];
  const match = positions => {
    const end = positions.length/3;
    const normals = new Int8Array(end*4);
    for (let i = 0; i < end; i++) normals[i*4+1] = 127;
    return matchRoofTanks(index,{minX:0,maxX:10,minZ:0,maxZ:10,start:0,end},positions,normals);
  };
  const deck = rectangle(0,0,10,10,10);
  assert.deepEqual(match(deck),[{...tank,roof:10}]);
  assert.deepEqual(match(rectangle(0,0,6,10,10)),[]);
  assert.deepEqual(match([...deck,...rectangle(3.5,3.5,6.5,6.5,15)]),[]);
});

test('terrain changes resize the frame and hide tanks on incompatible roofs', () => {
  const parent = new Group(), models = createRoofTankModels();
  const anchor = {elevation:3,tanks:[{x:5,z:6,radius:1.5,base:15,height:4,roof:10}]};
  const batch = models.batch(parent,[anchor]);
  const [barrel,frame] = parent.children, matrix = new Matrix4();
  function check(mesh, base, height) {
    mesh.getMatrixAt(0,matrix);
    assert.equal(mesh.count,1);
    assert.equal(matrix.elements[13],base);
    assert.equal(matrix.elements[5],height);
  }
  check(frame,13,2);
  check(barrel,15,4);
  anchor.elevation = 20;
  batch.update();
  assert.equal(barrel.count,0);
  assert.equal(frame.count,0);
  anchor.elevation = 4;
  batch.update();
  check(frame,14,1);
  check(barrel,15,4);
  batch.dispose();
  assert.equal(parent.children.length,0);
  models.dispose();
});
