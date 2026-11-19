import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStreetPopulation } from '../dist/street-population.js';
import { createCrowd, seeded } from '../dist/crowd.js';

const {boroughs}=JSON.parse(readFileSync(new URL('../dist/boroughs.json',import.meta.url),'utf8'));
const population=()=>createStreetPopulation(boroughs,seeded(20260310));

test('the five boroughs have the HOPE surface estimates on reproducible land sites', () => {
  const residents=population(), people=residents.near(0,0,50000);
  assert.equal(residents.total,3560);
  const counts={};
  for(const p of people){
    assert.ok(p.contains(p.x,p.z));
    counts[p.borough]=(counts[p.borough]||0)+1;
  }
  assert.deepEqual(counts,{Manhattan:2104,Brooklyn:559,Queens:457,Bronx:430,'Staten Island':10});
  assert.equal(new Set(people.map(p=>p.id)).size,3560);
  const sample=model=>model.near(0,0,400).map(({id,x,z})=>[id,x,z]);
  assert.ok(sample(residents).length>0);
  assert.deepEqual(sample(residents),sample(population()));
});

test('a resident near a usable sidewalk can pause, greet a passerby, and resume walking', () => {
  const site=population().near(0,0,600).find(p=>p.id%3===0 && p.contains(p.x+4,p.z));
  const {x,z}=site, length=60, depth=3.2;
  const makeWalk=()=>({points:[[x,z-30],[x,z+30]],normals:[[-1,0]],lengths:[0,length],length,depth});
  const crowd=createCrowd({boroughs,life:{crowding:()=>0,wardrobe:()=>({casual:1})},range:40,capacity:12});
  const frame={focus:{x,z},time:0,walks:[makeWalk()]};
  try {
    crowd.update(0,frame);
    const p=crowd.people.find(p=>p.resident?.id===site.id);
    assert.ok(p && p.resident.contains(p.x,p.z));
    assert.equal(p.state,'rest');
    assert.ok(Math.abs(p.x-x-depth+.45)<.01);
    assert.strictEqual(crowd.closest(p.x,p.z,1,true),p);
    const start=[p.x,p.z], pause=p.wait;
    for(let i=0;i<(pause+2)*20;i++){
      frame.time+=.05;crowd.update(.05,frame);
      assert.equal(crowd.people.filter(actor=>actor.resident?.id===site.id).length,1);
    }
    assert.equal(p.state,'walk');
    assert.ok(Math.hypot(p.x-start[0],p.z-start[1])>.5);
    frame.walks=[];crowd.update(0,frame);
    assert.equal(crowd.count,0);
    frame.walks=[makeWalk()];frame.time+=.4;crowd.update(.4,frame);
    assert.equal(crowd.people.filter(actor=>actor.resident?.id===site.id).length,1);
  } finally { crowd.dispose(); }
});
