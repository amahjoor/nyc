import test from 'node:test';
import assert from 'node:assert/strict';
import { cellsAround, createRoadStream, nearestStreet, localDestinations } from '../dist/road-stream.js';

test('road selection handles negative cell coordinates and omits sea cells',()=>{
  const index={cellSize:1000,cells:{'-1,-1':{url:'west'},'0,0':{url:'east'}}};
  assert.deepEqual(cellsAround(index,{x:-10,z:-10},20).map(c=>c.key),['-1,-1','0,0']);
  assert.deepEqual(cellsAround(index,{x:9000,z:9000}),[]);
});

test('neighboring roads deduplicate and simultaneous requests share one fetch',async()=>{
  const index={cellSize:1000,cells:{'0,0':{url:'a'},'1,0':{url:'b'}}};
  const requests=[];
  const stream=createRoadStream(index,{fetcher:async url=>{requests.push(url);return{ok:true,json:async()=>({roads:[{id:1},{id:url}]})};}});
  const [a,b]=await Promise.all([stream.loadAround({x:1000,z:500},100),stream.loadAround({x:1000,z:500},100)]);
  assert.equal(a.length,3);assert.deepEqual(a,b);assert.deepEqual(requests.sort(),['a','b']);
  assert.equal(stream.getStatus().pendingCells,0);
});

test('failed street loads can be retried and do not enter the cache',async()=>{
  let ok=false;
  const stream=createRoadStream({cellSize:1000,cells:{'0,0':{url:'a'}}},{fetcher:async()=>({ok,json:async()=>({roads:[]})})});
  await assert.rejects(stream.loadAround({x:500,z:500},1),/could not load/);
  assert.equal(stream.getStatus().cachedCells,0);
  ok=true;assert.deepEqual(await stream.loadAround({x:500,z:500},1),[]);
});

test('travel snaps to an actual nearby surface street with its legal heading',()=>{
  const roads=[{id:1,name:'Tunnel',kind:'tunnel',points:[[0,0],[100,0]]},{id:2,name:'Actual Street',oneway:'-1',points:[[0,20],[100,20]]}];
  const point=nearestStreet(roads,{x:50,z:1});
  assert.equal(point.name,'Actual Street');assert.equal(point.x,50);assert.equal(point.z,20);
  assert.equal(point.angle,Math.PI*1.5);
  assert.equal(nearestStreet(roads,{x:5000,z:0},600),null);
});

test('local delivery targets move to the current neighborhood',()=>{
  const points=localDestinations([{name:'New Street',points:[[10000,10000],[10200,10000]]}],{x:10000,z:10000});
  assert.deepEqual(points,[{name:'New Street',x:10100,z:10000}]);
  assert.equal(localDestinations([{name:'Old Street',points:[[0,0],[100,0]]}],{x:10000,z:10000}).length,0);
});

test('driving across many neighborhoods evicts old road data',async()=>{
  const cells={};for(let i=0;i<60;i++)cells[`${i},0`]={url:String(i)};
  const stream=createRoadStream({cellSize:1000,cells},{fetcher:async()=>({ok:true,json:async()=>({roads:[]})})});
  for(let i=0;i<60;i++)await stream.loadAround({x:i*1000+500,z:500},1);
  assert.equal(stream.getStatus().cachedCells,36);
});

test('curved streets keep delivery destinations on their mapped geometry',()=>{
  const points=localDestinations([{name:'Curved Street',points:[[0,0],[0,200],[200,200]]}],{x:0,z:0});
  assert.deepEqual(points,[{name:'Curved Street',x:0,z:100}]);
  assert.deepEqual(localDestinations([{name:'Incomplete Street',points:[[100,100]]}],{x:0,z:0}),[]);
});
