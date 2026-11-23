import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCityStream } from '../dist/city-stream.js';
import { buildFacadeDepth, collectFacadeWalls } from '../dist/facade-depth.js';
import { FLAG, STYLE_INDEX } from '../dist/facade.js';

test('near loft openings have set-back glass, projecting sills and open fire escapes', () => {
  const wall = {from:0,to:15,bottom:0,top:23,wallLength:15,tx:1,tz:0,seed:65,type:STYLE_INDEX.loft,
    height:10,flags:FLAG.ESCAPE|FLAG.SHOP,x:5,z:9,length:15};
  const material = new THREE.MeshStandardMaterial(), depth = new THREE.MeshDepthMaterial(), cube = new THREE.BoxGeometry();
  const detail = buildFacadeDepth(wall,material,depth,cube,material);
  const [shell,iron] = detail.frame.children, g = shell.geometry;
  const {position,aStyle,aFacade} = g.attributes;
  const openings = [];
  for (let i = 0; i < position.count; i++) {
    const flags = aStyle.array[i*4+3];
    assert.ok(flags & FLAG.SHOP);
    assert.equal(flags & FLAG.ESCAPE,0);
    if (flags & FLAG.INSET) {
      assert.ok(Math.abs(position.getZ(i)+.27) < 1e-5);
      assert.ok(aFacade.array[i*4+1] > 490);
      openings.push(i);
    } else assert.equal(position.getZ(i),0);
  }
  assert.ok(openings.length >= 12);
  const matrix = new THREE.Matrix4();
  let outerRail=false;
  for (let i=0; i<iron.count; i++) {
    iron.getMatrixAt(i,matrix);
    if (matrix.elements[14] > 1 && matrix.elements[13] > 4) outerRail=true;
  }
  assert.ok(outerRail);
  assert.equal(shell.customDepthMaterial,depth);
  detail.dispose(); cube.dispose(); material.dispose(); depth.dispose();
});

test('survey rectangles exclude blank walls, curtain walls and mismatched triangle pairs', () => {
  const corners = [[0,0],[0,20],[12,20],[0,0],[12,20],[12,0]];
  const pos = Float32Array.from(corners.flatMap(([u,v]) => [u,v,5]));
  const fac = Uint16Array.from(corners.flatMap(([u,v]) => [100*u,100*v,1200,2000]));
  const classify = (type,flags) => Uint8Array.from(corners.flatMap(() => [65,type,9,flags]));
  const masonry = classify(STYLE_INDEX.tenement,FLAG.ESCAPE);
  assert.ok(collectFacadeWalls(pos,fac,masonry,0,6));
  assert.equal(collectFacadeWalls(pos,fac,classify(STYLE_INDEX.tenement,FLAG.BLANK),0,6),null);
  assert.equal(collectFacadeWalls(pos,fac,classify(STYLE_INDEX.curtain,0),0,6),null);
  pos[11] += .5;
  assert.equal(collectFacadeWalls(pos,fac,masonry,0,6),null);
});

test('street view swaps the actual SoHo triangles, follows the ground and restores the overview', async t => {
  const read = file => readFileSync(new URL(file,import.meta.url));
  const idx = JSON.parse(read('../dist/city-index.json')), bytes = gunzipSync(read('./fixtures/i3s-soho.bin.gz'));
  const node = {...idx.nodes.find(n=>n.resource===4341), parent:null}, scene = new THREE.Scene();
  const world = createCityStream({...idx,nodes:[node],roots:[node.id]}, {scene,decoder:null,fetcher:async()=>new Response(bytes)});
  t.after(()=>world.dispose());
  const focus={x:40,z:-82}, camera={position:focus};
  world.update(focus,camera);
  const record=await world.request(node,0);
  // The stream publishes the visible LOD in its request completion callback.
  await new Promise(resolve=>setImmediate(resolve));
  for(let frame=0; frame<40; frame++) world.update(focus,camera);
  const group=record.mesh.getObjectByName('Modeled facade');
  assert.ok(group);
  const index=record.mesh.geometry.index.array;
  assert.ok(index.some((v,i)=>v!==i));
  world.setTerrainSampler(()=>7,2);
  assert.equal(group.position.y,7);
  world.update(focus,camera,{overview:true});
  assert.equal(record.mesh.getObjectByName('Modeled facade'),undefined);
  assert.ok(index.every((v,i)=>v===i));
});
