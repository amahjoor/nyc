import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coastalHeight,createWaterfront} from '../dist/waterfront.js';
import {Simulation} from '../dist/simulation.js';
import {landPolygons, shorelineQuery, WATER_LEVEL} from '../dist/water.js';
import {harborLimits} from '../dist/harbor-limits.js';
import {BOARDINGS} from '../dist/transport-catalog.js';
import {Scene} from '../dist/vendor/three.module.min.js';

const read=name=>JSON.parse(readFileSync(new URL('../dist/'+name+'.json',import.meta.url)));

test('harbor depths retain measured elevations, interpolate missing neighbours and preserve unknown coverage',()=>{
  const small={cols:2,rows:2,x:0,z:0,step:1,scale:.1,noData:-32768,values:[-20,-40,-60,-32768]};
  assert.equal(coastalHeight(small,.5,.5),-4);
  assert.equal(coastalHeight(small,-1,0),null);
  const grid=read('landscape/coastal-depths');
  const bytes=readFileSync(new URL('../dist/landscape/coastal-depths.bin',import.meta.url));
  grid.values=new Int16Array(bytes.buffer,bytes.byteOffset,bytes.length/2);
  assert.equal(grid.values.length,grid.cols*grid.rows);
  assert.ok(coastalHeight(grid,-3080,2900)<-3,'the harbor off Ellis has measurable depth');
});

test('island ferry piers and the Chelsea marina are dry and open onto connected surveyed harbor waters',()=>{
  const boroughs=read('boroughs').boroughs, dry=shorelineQuery(landPolygons(boroughs)), tidal=shorelineQuery(harborLimits);
  const shore=createWaterfront(new Scene(),[],WATER_LEVEL);
  shore.setPiers(read('landscape/piers').piers);
  for(const id of ['ellis-ferry','liberty-ferry','governors-ferry','chelsea-yacht']){
    const {board,berth}=BOARDINGS.find(stop=>stop.id===id);
    assert.ok(shore.deckAt(board.x,board.z)?.y>WATER_LEVEL,id);
    assert.equal(shore.deckAt(berth.x,berth.z),null,id);
    assert.ok(tidal(berth.x,berth.z)&&!dry(berth.x,berth.z),id);
  }
  for(const [x,z] of [[-3490,3400],[-3000,3100],[-2700,3450]])assert.ok(tidal(x,z)&&!dry(x,z),'the state line is open water');
  // Both source boundaries follow the shipping channel. Their different
  // vintages once left a 50 m dead strip on the crossing to Governors Island.
  for(let x=-2750;x<=-1750;x+=2)assert.ok(tidal(x,3200)&&!dry(x,3200)&&!shore.deckAt(x,3200));
  shore.dispose();
});

test('a walker falls off a bank, floats, dives to the bed, resurfaces and regains dry footing',()=>{
  const sampleSurface=(x,z)=>({elevation:x<0?1.8:0});
  const waterColumn=(x,z)=>x>=0?{level:-.12,bed:-6}:null;
  const sim=new Simulation({roads:[],buildings:[],spawn:{x:-2,z:0},bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},sampleSurface,waterColumn});
  sim.cars=[];const p=sim.player;
  const run=(input,seconds)=>{for(let i=0;i<seconds*60;i++)sim.step(input,1/60);};
  run({moveX:1},2.5);run({},2);
  assert.ok(p.x>0 && p.water && !p.grounded);
  assert.ok(Math.abs(p.y+1.54)<.015);
  run({lift:-1},8);assert.equal(p.y,-6);
  sim.updateGrounding();assert.equal(p.y,-6);
  run({lift:1},5);assert.ok(Math.abs(p.y+1.54)<.015);
  run({moveX:-1},5);assert.ok(p.x<0 && p.grounded && !p.water);assert.equal(p.y,1.8);
});
