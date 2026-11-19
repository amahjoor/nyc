import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createSubway, createSubwayEntrances, FARE } from '../dist/subway.js';
import { Simulation } from '../dist/simulation.js';
import { createSubwayJourney, fareStation, TRAIN_X, RAMP_FRACTION } from '../dist/subway-service.js';
import { platformAt, trainLeg, turnBetween, worldPoint } from '../dist/subway-space.js';

const data = JSON.parse(readFileSync(new URL('../dist/transit.json', import.meta.url), 'utf8'));

test('the bundled subway has every station, its lines and its street entrances', () => {
  assert.ok(data.stations.length > 400 && data.stations.length < 520);
  for (const station of data.stations) {
    assert.ok(station.name && /^[A-Z0-9]+( [A-Z0-9]+)*$/.test(station.routes) && station.entrances.length >= 1, station.name);
    for (const [x, z, kind] of station.entrances) assert.ok(Math.abs(x) < 40000 && Math.abs(z) < 40000 && [0, 1, 2].includes(kind) && Math.hypot(x - station.x, z - station.z) < 900, `${station.name}: an entrance is at the station`);
  }
  const named = name => data.stations.filter(station => station.name === name);
  assert.equal(named('34 St-Herald Sq').length, 1); assert.equal(named('34 St-Herald Sq')[0].routes, 'B D F M N Q R W');
  assert.ok(named('14 St-Union Sq')[0].routes.includes('L') && Math.hypot(named('14 St-Union Sq')[0].x - named('34 St-Herald Sq')[0].x, named('14 St-Union Sq')[0].z - named('34 St-Herald Sq')[0].z) > 1200, 'two stations, a mile apart');
  assert.match(data.source.url, /^https:\/\/data\.ny\.gov\/d\//);
});

test('a ride is to any station on a line that stops here, nearest first', () => {
  const subway = createSubway(data), prince = subway.stations.find(station => station.name === 'Prince St');
  assert.deepEqual(prince.lines, ['R', 'W']);
  const near = subway.entrancesNear(300, -85, 60);
  assert.ok(near.length >= 1 && near[0].station === prince && near.every(entrance => Math.hypot(entrance.x - 300, entrance.z + 85) <= 60));
  assert.deepEqual(subway.entrancesNear(350, -150, 5), []);
  const rides = subway.ridesFrom(prince);
  assert.ok(rides.length > 30 && rides.every(ride => ride.lines.every(line => 'RW'.includes(line)) && ride.station !== prince));
  assert.deepEqual(rides.slice(0, 2).map(ride => ride.station.name), ['Canal St', '8 St-NYU']);
  for (let i = 1; i < rides.length; i++) assert.ok(rides[i].distance >= rides[i - 1].distance);
  assert.ok(!rides.some(ride => ride.station.name === 'Spring St'), 'the 6 and the C do not stop at Prince Street');
  const exit = subway.exitOf(rides[0].station);
  assert.ok(rides[0].station.entrances.some(([x, z]) => x === exit.x && z === exit.z));
  assert.ok(FARE > 2 && FARE < 4);
  assert.deepEqual(createSubway(null).entrancesNear(0, 0, 500), []);
});

test('stairs are drawn where the entrances are, along the kerb', () => {
  const scene = new THREE.Scene(), subway = createSubway(data), stairs = createSubwayEntrances({ scene, heightAt: () => 4, facing: () => [1, 0] });
  assert.equal(stairs.update(subway, { x: 300, z: -85 }), true);
  assert.ok(stairs.entrances.length >= 4 && stairs.entrances.every(entrance => entrance.kind === 0));
  const mesh = scene.getObjectByName('Subway stairs'), matrix = new THREE.Matrix4(), at = new THREE.Vector3(), run = new THREE.Vector3(0, 0, 1);
  assert.equal(mesh.count, stairs.entrances.length); assert.equal(scene.getObjectByName('Subway globes').count, mesh.count * 2);
  mesh.getMatrixAt(0, matrix); at.setFromMatrixPosition(matrix); run.transformDirection(matrix);
  assert.ok(at.x === stairs.entrances[0].x && at.y === 4 && Math.abs(run.x - 1) < 1e-6);
  assert.equal(stairs.update(subway, { x: 310, z: -80 }), false, 'nothing is redone for a few steps');
  stairs.dispose(); assert.equal(scene.children.length, 0);
});

test('all four 45 St entrances have twelve descending treads and a landing at concourse level', () => {
  const subway = createSubway(data), station = subway.stations.find(s => s.name === '45 St');
  const stairs = createSubwayEntrances({ heightAt: () => 18, facing: () => [.6,.8] });
  stairs.update(subway, station);
  assert.equal(stairs.entrances.filter(e => e.station === station).length, 4);
  const mesh = stairs.group.getObjectByName('Subway stairs'), matrix = new THREE.Matrix4();
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0);
  for (const [index, entrance] of stairs.entrances.entries()) {
    if (entrance.station !== station) continue;
    mesh.getMatrixAt(index, matrix);
    const tread = (x,z) => {
      ray.set(new THREE.Vector3(x,.7,z).applyMatrix4(matrix), down);
      return ray.intersectObject(mesh)[0]?.point.y;
    };
    for (const x of [-.5,.5]) {
      let previous = 18;
      for (let i = 0; i < 12; i++) {
        const along = -2.15 + (i + .5) * .32;
        const height = tread(x, along), world = new THREE.Vector3(x,0,along).applyMatrix4(matrix);
        assert.ok(height < previous - .06 && height > previous - .18, 'pavement or a cap must not hide a step');
        assert.ok(Math.abs(height - stairs.surfaceAt(world.x,world.z).elevation) < .001, 'feet rest on the visible tread');
        previous = height;
      }
      assert.ok(Math.abs(tread(x,2) - 16.06) < .01);
    }
  }
  stairs.dispose();
});

test('a survey point at the curb puts the full stairwell on the sidewalk and keeps the surveyed station identity', () => {
  const entrance = {x:4,z:0,kind:0,station:{name:'45 St'}};
  const subway = { entrancesNear: () => [entrance] };
  const edge = { x:0,z:0,tx:0,tz:1,nx:1,nz:0,distance:4 };
  const stairs = createSubwayEntrances({kerbAt:()=>edge});
  stairs.update(subway,entrance);
  const placed = stairs.entrances[0];
  assert.ok(placed.x + .88 < edge.x);
  assert.equal(placed.station,entrance.station); assert.equal(entrance.x,4);
  assert.equal(stairs.surfaceAt(entrance.x,entrance.z),null);
  assert.ok(stairs.surfaceAt(placed.x,placed.z).elevation < -1);
  stairs.dispose();
});

test('a stationary entrance updates its grade, kerb orientation and ground opening as the street streams', () => {
  const subway = { entrancesNear: x => x > 50 ? [] : [{x:3,z:6,kind:0}] };
  let base = 0, heading = [0,1];
  const stairs = createSubwayEntrances({ heightAt: (x,z) => base + .05*x + .1*z, facing: () => heading });
  const here = {x:3,z:6}, mesh = stairs.group.getObjectByName('Subway stairs'), matrix = new THREE.Matrix4();
  const ground = new THREE.MeshStandardMaterial();
  stairs.openings.clip(ground);
  const shader = { ...THREE.ShaderLib.standard, uniforms:{} };
  ground.onBeforeCompile(shader);
  const u = shader.uniforms;
  stairs.update(subway, here, [], 0);
  const kerbs = [];
  base = 14; heading = [1,0];
  assert.ok(stairs.update(subway, here, kerbs, 1));
  mesh.getMatrixAt(0,matrix);
  const corner = new THREE.Vector3(.6,0,1.7).applyMatrix4(matrix);
  assert.ok(Math.abs(corner.y - (base + .05*corner.x + .1*corner.z)) < 1e-5, 'rim follows the slope across the whole footprint');
  const { data: cells, width } = u.stairGrid.value.image;
  const first = width * width * 4;
  assert.deepEqual(Array.from(cells.slice(first,first+2)), [here.x,here.z]);
  assert.ok(Math.abs(cells[first+2] - matrix.elements[13]) < .001);
  assert.ok(Math.abs(cells[first+3] - Math.PI/2) < .001);
  assert.equal(stairs.update(subway, here, kerbs, 1),false);
  stairs.group.visible = false; stairs.update(subway, here, kerbs, 1); assert.equal(u.stairOpen.value,false);
  stairs.group.visible = true; stairs.update(subway, here, kerbs, 1); assert.equal(u.stairOpen.value,true);
  assert.ok(stairs.update(subway, {x:2000,z:1000}, kerbs, 1)); assert.equal(u.stairOpen.value,false);
  ground.dispose(); stairs.dispose();
});

test('a pedestrian can descend, stays inside the retaining walls and can walk back onto the sidewalk', () => {
  const ground = {elevation:5};
  let stairs;
  const sim = new Simulation({ roads:[], buildings:[], bounds:{minX:-80,minZ:-80,maxX:80,maxZ:80},
    spawn:{x:0,z:-3,angle:0}, sampleSurface:(x,z,options) => (options?.mode === 'walk' && stairs?.surfaceAt(x,z)) || ground });
  stairs = createSubwayEntrances({physics:sim.streetObjects,heightAt:()=>ground.elevation});
  stairs.update({entrancesNear:()=>[{x:0,z:0,kind:0}]},sim.player);
  sim.cars = [];
  const walk = (input, seconds) => {
    for (let i = 0; i < 60*seconds; i++) sim.step(input, 1/60);
  };
  // Stop on the landing before its open connection into the fare hall.
  walk({moveZ:1},2.72);
  assert.ok(sim.player.grounded && sim.player.z > 1.5 && sim.player.y < 3.2);
  walk({moveX:1},1.5);
  assert.ok(Math.abs(sim.player.x) < .76 && sim.player.y < 3.2, 'the retaining wall stops a below-grade exit');
  walk({moveZ:-1},4.7);
  assert.ok(sim.player.z < -2.15 && sim.player.grounded);
  assert.equal(sim.player.y,ground.elevation);
  stairs.dispose();
});

test('departures use the scheduled direction, branch and service day, including after midnight', () => {
  const net=createSubway(data), {platforms}=net.table;
  const station=net.stations.find(s=>s.name==='Prince St');
  const noon=2*86400+12*3600, rides=net.table.departures(station,noon);
  const uptown=rides.find(o=>o.route.name==='R' && o.pattern.headsign==='Forest Hills-71 Av');
  assert.ok(uptown.time>=noon);
  assert.deepEqual(uptown.pattern.stops.slice(uptown.index,uptown.index+3).map(id=>platforms[id].name),['Prince St','8 St-NYU','14 St-Union Sq']);
  assert.ok(rides.some(o=>o.route.name==='W'));
  assert.ok(!net.table.departures(station,5*86400+12*3600).some(o=>o.route.name==='W'));
  const a=net.stations.find(s=>s.stops.includes('A55')), branches=net.table.departures(a,noon).filter(o=>o.pattern.route==='A');
  assert.ok(branches.some(o=>o.pattern.stops.includes('A65')) && branches.some(o=>o.pattern.stops.includes('H11')));
  assert.ok(branches.every(o=>!(o.pattern.stops.includes('A65')&&o.pattern.stops.includes('H11'))));
  const overnight=net.table.departures(station,5*86400+65);
  assert.ok(overnight.length && overnight.every(o=>o.time>=5*86400+65));
  assert.ok(overnight.some(o=>o.base<5*86400),'an after-midnight call can originate on the previous service day');
  assert.ok(Object.keys(platforms).every(id=>net.table.stationAt(id)));
});

test('each scheduled leg docks at its two mapped platforms without flipping an occupied car',()=>{
  const checked=new Set();
  for(const pattern of data.patterns){
    assert.ok(pattern.shape);
    assert.equal(pattern.tracks.length,pattern.stops.length-1);
    for(const [i,id] of pattern.tracks.entries()){
      const pair=pattern.stops.slice(i,i+2),key=[id,...pair,pattern.direction].join('/');
      if(checked.has(key))continue;
      checked.add(key);
      const [a,b]=pair.map(stop=>data.platforms[stop]);
      const from=platformAt(a,{},0),to=platformAt(b,{},0);
      const run=trainLeg(data,pattern,i,from,to);
      for(const [time,stop] of [[0,a],[1,b]]){
        const pose=run(time),berth=worldPoint(pose,TRAIN_X,0,12);
        assert.ok(Math.hypot(berth.x-stop.x,berth.z-stop.z)<.001,key);
        assert.ok(Math.abs(turnBetween(pose.angle,stop.angle))<.0001,key);
      }
      let prev=run(0);
      for(let n=1;n<=240;n++){
        const pose=run(n/240);
        assert.ok(pose.distance>prev.distance && Math.abs(turnBetween(prev.angle,pose.angle))<Math.PI/4,key);
        prev=pose;
      }
    }
  }
});

test('both directions of the Q bend under Midtown between Lexington Av/63 St and 57 St-7 Av',()=>{
  for(const [from,to,direction] of [['B08','R14',1],['R14','B08',0]]){
    const pattern=data.patterns.find(p=>p.route==='Q' && p.direction===direction && p.stops[p.stops.indexOf(from)+1]===to && p.stops.includes(from));
    const [a,b]=[from,to].map(s=>data.platforms[s]);
    const i=pattern.stops.indexOf(from),run=trainLeg(data,pattern,i,platformAt(a,{},0),platformAt(b,{},0));
    const mid=worldPoint(run(.5),TRAIN_X,0,12);
    assert.ok(Math.hypot(mid.x-(a.x+b.x)/2,mid.z-(a.z+b.z)/2)>350);
    const track=data.tracks[pattern.tracks[i]];
    let error=Infinity;
    for(let n=2;n<track.length;n+=2){
      const x=track[n-2],z=track[n-1],dx=track[n]-x,dz=track[n+1]-z;
      const f=Math.min(1,Math.max(0,((mid.x-x)*dx+(mid.z-z)*dz)/(dx*dx+dz*dz)));
      error=Math.min(error,Math.hypot(mid.x-x-f*dx,mid.z-z-f*dz));
    }
    assert.ok(error<.01);
    assert.ok(run(.1).distance < run(.2).distance-run(.1).distance);
    const network=createSubway(data),station=network.table.stationAt(from);
    const j=createSubwayJourney(network.table,{station,stop:from},2*86400+12*3600);
    j.enterPaidArea();
    const departure=j.options().find(s=>s.pattern.route==='Q' && s.pattern.direction===direction && s.pattern.stops[s.index+1]===to);
    assert.ok(j.select(departure));
    j.x=-2;j.z=12;j.waitForTrain();j.update(j.remaining);j.update(1);
    assert.ok(j.board());j.update(j.remaining);
    assert.equal(j.phase,'running');
    const metres=network.table.trackLengths[departure.pattern.tracks[departure.index]];
    const speed=metres/(j.duration*(1-RAMP_FRACTION));
    assert.ok(speed<=24.001 && speed/(j.duration*RAMP_FRACTION)<=1.251);
    j.update(j.duration);assert.equal(j.stop,to);
  }
});

test('open-air stairs, station houses and elevators give access without cutting a hole in the street',()=>{
  const net=createSubway(data), views=createSubwayEntrances({facing:()=>[0,1]});
  try{
    for(const example of [
      net.stations.find(station=>station.entrances.some(e=>e[2]===0 && net.table.platforms[e[3]].structure==='Elevated')).entrances.find(e=>e[2]===0),
      ...[1,2].map(kind=>net.stations.flatMap(s=>s.entrances).find(e=>e[2]===kind)),
    ]){
      const [x,z,kind]=example;
      views.update(net,{x,z},[]);
      assert.ok(views.portals.some(p=>p.x===x && p.z===z && p.kind===kind));
      assert.ok(!views.entrances.some(p=>p.x===x&&p.z===z));
      if(kind===0)assert.ok(views.surfaceAt(x,z).elevation>0);
    }
  }finally{views.dispose();}
});

test('an open-cut platform sits below the curb and its street stairs descend into the cutting',()=>{
  const network=createSubway(data),stairs=createSubwayEntrances({heightAt:()=>9});
  try{
    const example=network.stations.flatMap(s=>s.entrances).find(e=>e[2]===0 && network.table.platforms[e[3]].structure==='Open Cut');
    const [x,z,,stop]=example;
    stairs.update(network,{x,z});
    const portal=stairs.entrances.find(e=>e.stop===stop && e.x===x && e.z===z);
    assert.ok(portal && stairs.surfaceAt(x,z).elevation<9);
    const dock=platformAt(network.table.platforms[stop],portal,9);
    assert.ok(dock.open && dock.belowGrade && dock.y<portal.y-4);
    const atGrade=Object.values(network.table.platforms).find(p=>p.structure==='At Grade');
    assert.ok(Math.abs(platformAt(atGrade,{},9).y-9)<1.5);
  }finally{stairs.dispose();}
});


test('missed trains depart, terminal riders alight and SIR fare control is at the two collection stations',()=>{
  const net=createSubway(data), station=net.stations.find(s=>s.stops.includes('902'));
  const entrance=net.entrancesNear(station.x,station.z,800).find(e=>e.station===station);
  const j=createSubwayJourney(net.table,entrance,2*86400+12*3600);
  const until=fn=>{for(let i=0;i<1600&&!fn();i++)j.update(.1);assert.ok(fn());};
  j.enterPaidArea();j.select(j.options().find(o=>o.pattern.route==='GS'));j.waitForTrain();
  assert.equal(j.board(),false);
  until(()=>j.doorsOpen);const missed=j.service;
  until(()=>j.phase==='departing');assert.equal(j.board(),false);
  until(()=>j.phase==='waiting');j.select(j.options().find(o=>o.pattern.route==='GS'));assert.ok(j.service.time>missed.time);
  j.x=-2.5;j.z=12;j.waitForTrain();until(()=>j.doorsOpen);
  assert.ok(j.board());until(()=>j.phase==='running');assert.equal(j.alight(),false);
  until(()=>j.phase==='departing'&&!j.aboard);
  assert.equal(j.platform.name,'Grand Central-42 St');
  assert.equal(j.inside,true);
  for(const name of ['St George','Tompkinsville','Annadale']){
    assert.equal(fareStation(net.stations.find(s=>s.name===name)),name!=='Annadale');
  }
});

test('a station lift carries the same walker down and back up to its street doorway',()=>{
  const subway=createSubway(data), station=subway.stations.find(s=>s.entrances.some(e=>e[2]===1 && subway.table.platforms[e[3]].structure==='Subway'));
  const [x,z,kind,stop]=station.entrances.find(e=>e[2]===1 && subway.table.platforms[e[3]].structure==='Subway');
  const portal={x,y:8,z,kind,stop,station,open:false,angle:Math.PI/2};
  const sim=new Simulation({spawn:{x,z,angle:portal.angle},roads:[],buildings:[],bounds:{minX:x-90,maxX:x+90,minZ:z-90,maxZ:z+90},sampleSurface:()=>({elevation:8})});
  const p=sim.player,element={hidden:true};
  const v=subway.visit(portal,43200,{$:()=>element,sim,interaction:{open:false},chime(){},exit(){sim.subway=null;},
    network:()=>null,turnCamera(){},stairSurface:()=>null});
  sim.subway=v;sim.cars=[];
  for(let i=0;i<45;i++)sim.step({moveX:1},1/60);
  assert.ok(p.y<7 && p.y>5);assert.ok(Math.abs(p.x-x)<.05);
  for(let i=0;i<230;i++)sim.step({moveX:1},1/60);
  assert.ok(p.y<4.8 && p.x>x+1);
  for(let i=0;i<500 && sim.subway;i++)sim.step({moveX:-1},1/60);
  assert.equal(sim.subway,null);assert.equal(p.y,8);assert.ok(Math.abs(p.x-x)<1.3);
});

test('riders step through open doors and retain their cast appearance on the moving train',async()=>{
  const {createSubwayRiders}=await import('../dist/subway-riders.js');
  const net=createSubway(data),station=net.stations.find(s=>s.name==='Prince St'),crowd=createSubwayRiders();
  const entrance=net.entrancesNear(station.x,station.z,200).find(e=>e.station===station);
  const j=createSubwayJourney(net.table,entrance,43200);
  j.enterPaidArea();j.waitForTrain();
  const frame={open:false},group={visible:true,position:{x:20,y:-8,z:40},rotation:{y:0}};
  const view={train:group,station:group};
  crowd.step(j,station,1/60);crowd.draw(view,frame);
  const waiting=crowd.visible.find(a=>!a.aboard && a.localZ===17.4);
  for(let i=0;i<800 && !waiting.aboard;i++){j.update(1/60);crowd.step(j,station,1/60);}
  assert.ok(waiting.aboard);
  view.station={...group,visible:false};
  view.train={...group,position:{x:300,y:-7,z:350}};
  crowd.draw(view,frame);
  assert.ok(crowd.visible.includes(waiting));assert.ok(Math.abs(waiting.x-300)<7);
  assert.ok(!crowd.visible.some(a=>!a.aboard));
});
