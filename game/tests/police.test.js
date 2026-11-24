import { drivingCity } from './fixtures/parked-cab.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../dist/simulation.js';
import { MAX_STARS, evadeTime, SIGHT, HELICOPTER, OFFENCES, hitChance } from '../dist/police.js';
import { roomLocal, roomPoint, ShopDoor } from '../dist/room.js';

const street = (id, points, width = 10) => ({ id, name: id.toUpperCase(), points, width, oneway: false, kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13 });
const box = (x, z, w = 20, d = 20) => ({ polygon: [[x, z], [x + w, z], [x + w, z + d], [x, z + d]] });
/** A grid of two-way streets every hundred metres, the player on foot in the middle of a block face. */
function grid(overrides = {}) {
  const roads = [];
  for (let i = -3; i <= 3; i++) {
    roads.push(street(`ns${i}`, [[i * 100, -300], [i * 100, 300]]), street(`ew${i}`, [[-300, i * 100], [300, i * 100]]));
  }
  return { bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 }, roads, buildings: [], spawn: { x: 6, z: 50, angle: 0 }, missionPoints: [{ x: 0, z: 140, name: 'A' }, { x: 110, z: 0, name: 'B' }], ...overrides };
}
function advance(sim, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(input, 1 / 60);
}
/** Run until `done`, at most `seconds`. Returns the seconds it took, or -1. */
function until(sim, seconds, done, input = {}) {
  for (let i = 0; i < seconds * 60; i++) { sim.step(input, 1 / 60); if (done()) return i / 60; }
  return -1;
}
const patrols = sim => sim.cars.filter(car => car.type === 'police');
/** No police at all, so that a test can place its own. */
const alone = sim => { sim.cars = sim.cars.filter(car => car.type !== 'police'); return sim; };
function patrolAt(sim, x, z, angle = 0) {
  const car = sim._makeCar(`patrol-${sim.cars.length}`, 'police', { x, z }, angle);
  sim.cars.push(car);
  return car;
}

function shopFixture(things = []) {
  const sim = alone(new Simulation(grid({roads:[],buildings:[box(6,45,10,10)]})));
  const plan = {place:{id:'shop',kind:'bodega'},name:'Shop',x:6,z:50,nx:-1,nz:0,tx:0,tz:1,width:10,depth:10,things};
  const view = {plan,floor:0,door:new ShopDoor(),actors:[]};
  const stand = (a,b) => {
    const [x,z] = roomPoint(plan,a,b);
    Object.assign(sim.player,{x,z,y:0,speed:0,velocityX:0,velocityZ:0});
    if (sim.room) Object.assign(sim.room,{a,b});
  };
  const enter = () => {
    sim.doorway=view;
    stand(0,.1);
    assert.ok(sim.enterRoom(plan));
  };
  const post = (a,b) => {
    const [x,z] = roomPoint(plan,a,b);
    const at = {x,z,y:0};
    sim.police.fieldOfficers.push({id:'door-patrol',...at,heading:Math.PI/2,post:{...at,unit:{activity:'patrol'}}});
  };
  return {sim,police:sim.police,view,stand,enter,post};
}

test('officers find an open spot when someone is standing beside the patrol car', () => {
  const sim=alone(new Simulation(grid({roads:[]})));
  const car=patrolAt(sim,0,25), walker={x:1.7,z:25,y:0};
  sim.setWalkers([],[walker]);
  assert.ok(sim.police._dismount(car));
  assert.equal(sim.police.officers.length,2);
  for(const officer of sim.police.officers)assert.ok(Math.hypot(officer.x-walker.x,officer.z-walker.z)>=.64);
});

test('one officer cuffs a stopped suspect while the partner covers the arrest', () => {
  const sim = alone(new Simulation(grid({ roads: [] }))), police = sim.police, p = sim.player;
  sim.heat = 1;
  assert.ok(police._dismount(patrolAt(sim, 2, 47)));
  const [near, partner] = police.officers;
  Object.assign(near, { x: p.x + 1.5, z: p.z, sees: true });
  Object.assign(partner, { x: p.x - 3, z: p.z, sees: true });
  police.report(); police.state = 'chase'; police.arrest = .6;
  police._officers(1 / 60);
  assert.ok(near.cuffing && !near.aiming);
  assert.ok(partner.aiming && !partner.cuffing);
  assert.equal(police.shots.length, 0);
});

test('an officer backs out of a dead end and approaches a suspect around the obstruction', () => {
  const buildings=[box(3,46,6,1),box(3,40,1,6),box(8,40,1,6)];
  const sim=alone(new Simulation(grid({roads:[],buildings}))), police=sim.police;
  const at={x:6,y:0,z:44};
  const officer=police._respondFromPost({id:'detour',...at,heading:0,post:{...at,unit:{activity:'patrol'}}});
  sim.heat=1;police.report();police.state='chase';
  let backedOut=false;
  for(let i=0;i<600;i++){
    police._officers(1/60);
    backedOut ||= officer.z<39.6;
    assert.equal(sim.isBlocked(officer.x,officer.z,.39),false);
  }
  assert.ok(backedOut,'the route first retreats to the opening');
  assert.ok(Math.hypot(officer.x-sim.player.x,officer.z-sim.player.z)<2,'the officer reaches the suspect');
});

test('crimes add up to five stars and no further', () => {
  const sim = alone(new Simulation(grid({ roads: [] })));
  assert.equal(sim.stars, 0);
  sim.crime(0.4); assert.equal(sim.stars, 1);
  sim.crime(1); assert.equal(sim.stars, 2);
  for (let i = 0; i < 9; i++) sim.crime(1);
  assert.equal(sim.heat, MAX_STARS); assert.equal(sim.stars, 5);
  assert.deepEqual(sim.police.lastKnown, { x: sim.player.x, z: sim.player.z }, 'a report says where the player is');
  assert.equal(sim.police.state, 'search');
});

test('out of sight, the stars hold until the search is given up, then all go at once', () => {
  const sim = alone(new Simulation(grid({ roads: [] })));
  sim.heat = 2;
  advance(sim, evadeTime(2) - 2);
  assert.equal(sim.heat, 2); assert.equal(sim.police.state, 'search'); assert.equal(sim.spotted, false);
  assert.ok(sim.police.evade > 0 && sim.police.evade < 3);
  advance(sim, 3);
  assert.equal(sim.heat, 0); assert.equal(sim.police.state, 'clear');
  assert.match(sim.notice, /lost the police/i);
  assert.ok(evadeTime(5) > evadeTime(1), 'more stars take longer to shake');
});

test('a patrol that sees the player starts a chase, and a wall between them ends it', () => {
  const sim = alone(new Simulation(grid({ roads: [], buildings: [box(-10, 70, 40, 10)] })));
  const patrol = patrolAt(sim, 6, 20);
  sim.heat = 1;
  advance(sim, 0.5);
  assert.equal(sim.police.state, 'chase'); assert.equal(sim.spotted, true); assert.equal(patrol._sees, true);
  // Behind the building.
  patrol.z = 100;
  sim.police.arrest = 0;
  advance(sim, 1);
  assert.equal(sim.police.state, 'chase', 'a moment out of sight is not yet an escape');
  advance(sim, 2);
  assert.equal(sim.police.state, 'search'); assert.equal(sim.spotted, false);
  const left = sim.police.evade;
  advance(sim, 4);
  assert.ok(sim.police.evade < left - 3, 'the clock runs while they search');
  // Seen again: the clock starts over.
  patrol.z = 20;
  advance(sim, 0.5);
  assert.equal(sim.police.state, 'chase');
  assert.equal(sim.police.evade, sim.police.evadeTotal);
});

test('searching units see only what is in front of them, unless it is close', () => {
  const sim = alone(new Simulation(grid({ roads: [] })));
  const patrol = patrolAt(sim, 6, 10, Math.PI);
  sim.heat = 1; sim.police.report();
  assert.equal(sim.police._look(), false, 'forty metres behind a searching patrol is unseen');
  patrol.angle = 0;
  assert.equal(sim.police._look(), true, 'in front of it is seen');
  patrol.angle = Math.PI; patrol.z = sim.player.z - SIGHT.close + 2;
  assert.equal(sim.police._look(), true, 'right behind it is noticed all the same');
  patrol.z = sim.player.z - SIGHT.search - 5; patrol.angle = 0;
  assert.equal(sim.police._look(), false, 'and too far off is not');
});

test('indoors nobody on the street can see the player', () => {
  const sim = alone(new Simulation(grid({ roads: [] })));
  patrolAt(sim, 6, 30);
  sim.heat = 1; sim.police.report();
  assert.equal(sim.police._look(), true);
  sim.room = {};
  assert.equal(sim.police._look(), false);
});

test('a visible suspect entering a shop is arrested only after an officer walks through the door', () => {
  const {sim,police,view,stand,enter,post} = shopFixture();
  sim.endingSeconds=4;
  stand(0,-1);post(0,-3);
  sim.crime(1);
  advance(sim,.12);
  assert.equal(police.state,'chase');
  enter();stand(0,5);
  assert.equal(police.searchRoom,view);
  advance(sim,.3);
  assert.equal(police.arrest,0);
  assert.ok(!sim.ending);
  assert.ok(until(sim,12,()=>Boolean(sim.ending))>=0,'an officer reaches the player and makes the arrest');
  assert.ok(police.officers.some(officer=>officer.room===view && roomLocal(view.plan,officer.x,officer.z).b>2));
  assert.equal(sim.ending.kind,'busted');
  assert.notEqual(view.door.angle,0,'the officer pushes the shop door');
});

test('existing patrols search an alarmed shop anonymously and leave when the search expires', () => {
  const {sim,police,view,stand,enter} = shopFixture();
  const car=patrolAt(sim,-2,49,0), distant=patrolAt(sim,-85,51,0);
  enter();stand(3,6);
  sim.offence('robbery',{seen:true,identified:false});
  // Ambient units that stream into the area after the report keep their rounds.
  const late=patrolAt(sim,-1,57,0);distant.x=-4;
  assert.ok(until(sim,12,()=>police.officers.some(officer=>officer.room===view && roomLocal(view.plan,officer.x,officer.z).b>3))>=0);
  assert.ok(car._crewOut);
  assert.ok(!late._crewOut && !distant._crewOut);
  assert.equal(patrols(sim).length,3);
  assert.equal(police.state,'search');
  assert.equal(police.arrest,0);
  assert.ok(until(sim,45,()=>!police.officers.length)>=0,'the officers leave through the door and return to their car');
  assert.equal(police.state,'clear');
});

test('an officer searches around shelves before opening fire at a suspect indoors', () => {
  const shelf = {a:0,b:3,w:5,d:1,y:0,h:2.1,solid:true};
  const {sim,police,view,stand,enter,post} = shopFixture([shelf]);
  post(0,-2.5);enter();stand(0,6);
  sim.heat=3;police.report(view.plan,true,true,'walk',view);
  advance(sim,1.5);
  assert.ok(police.officers.some(officer=>officer.room===view));
  assert.equal(police.shotsFired,0,'the shelf blocks the shot');
  assert.equal(sim.health,100);
  police._random=()=>0;
  assert.ok(until(sim,16,()=>sim.health<100)>=0,'the officer clears the aisle and gets a shot');
  assert.equal(view.gunfireAt,police.shots.at(-1).at);
  const officer=police.officers[0];
  assert.equal(officer.room,view);
  const local=roomLocal(view.plan,officer.x,officer.z);
  assert.ok(Math.abs(local.a)>2.5 || local.b>3.5,'the officer goes around the shelf');
});

test('more stars bring more patrol cars, and they go home when it is over', () => {
  const sim = new Simulation(grid());
  const before = patrols(sim).length;
  sim.heat = 5;
  sim.room = {};
  // Hidden indoors, so that nothing ends the chase early; walking is the room's business.
  sim._walk = () => {};
  advance(sim, 12);
  assert.ok(patrols(sim).length >= 8, `eight cars answer five stars: ${patrols(sim).length}`);
  assert.ok(patrols(sim).length > before);
  assert.ok(patrols(sim).every(car => car.siren || car.parked));
  sim.heat = 0;
  advance(sim, 3);
  assert.equal(sim.police.state, 'clear');
  assert.ok(patrols(sim).filter(car => car._dispatched).length < 8, 'cars sent for the chase leave once out of view');
  assert.ok(patrols(sim).every(car => !car.siren));
});

test('patrols drive to the player, the crew get out, and standing still is an arrest', () => {
  const sim = new Simulation(grid());
  sim.cash = 500;
  sim.crime(1);
  const start = { x: sim.player.x, z: sim.player.z };
  let officers = 0, nearest = Infinity;
  const took = until(sim, 90, () => {
    officers = Math.max(officers, sim.police.officers.length);
    for (const car of patrols(sim)) nearest = Math.min(nearest, Math.hypot(car.x - start.x, car.z - start.z));
    return /Busted/.test(sim.notice);
  });
  assert.ok(nearest < 25, `a patrol came to the player: ${nearest.toFixed(0)} m`);
  assert.ok(officers >= 2, 'its crew got out');
  assert.ok(took > 0, 'and made the arrest');
  assert.equal(sim.heat, 0); assert.equal(sim.police.state, 'clear'); assert.equal(sim.police.officers.length, 0);
  assert.equal(sim.cash, 0, 'arrest takes all carried cash');
});

test('at three stars the officers open fire and a helicopter comes', () => {
  const sim = new Simulation(grid());
  sim.heat = 3;
  let shots = 0, hurt = false, helicopter = false, seenFromAbove = false;
  until(sim, 80, () => {
    shots = sim.police.shotsFired; hurt ||= sim.health < 100;
    helicopter ||= Boolean(sim.police.helicopter); seenFromAbove ||= Boolean(sim.police.helicopter?.sees);
    return /Shot by the police/.test(sim.notice);
  });
  assert.ok(helicopter, 'a helicopter was sent');
  assert.ok(seenFromAbove, 'and found the player in the open');
  assert.ok(shots > 3, `shots fired: ${shots}`);
  assert.ok(hurt, 'some of them hit');
  assert.match(sim.notice, /Shot by the police/);
  assert.equal(sim.heat, 0); assert.equal(sim.health, 100);
});

test('no helicopter below three stars', () => {
  const sim = new Simulation(grid());
  sim.heat = HELICOPTER.stars - 1; sim.room = {}; sim._walk = () => {};
  advance(sim, 6);
  assert.equal(sim.police.helicopter, null);
  sim.heat = HELICOPTER.stars;
  advance(sim, 1);
  assert.ok(sim.police.helicopter);
  sim.heat = 0;
  advance(sim, 30);
  assert.equal(sim.police.helicopter, null, 'it leaves when the search is over');
});

test('from two stars a patrol rams the car it is chasing', () => {
  const sim = alone(drivingCity(grid()));
  sim.interact();
  assert.equal(sim.player.mode, 'drive');
  const car = sim.vehicle, edge = sim._nearestEdge(car.x, car.z + 60).edge;
  const patrol = sim._makeCar('patrol-ram', 'police', { x: car.x, z: car.z - 45 }, 0, edge);
  sim.cars.push(patrol);
  sim.heat = 2;
  let closest = Infinity, health = 100;
  until(sim, 12, () => { closest = Math.min(closest, Math.hypot(patrol.x - car.x, patrol.z - car.z)); health = Math.min(health, sim.health); return health < 100 || /Busted/.test(sim.notice); }, { forward: 0.25 });
  assert.ok(closest < 5, `the patrol closed to ${closest.toFixed(1)} m`);
  assert.ok(health < 100, 'and hit the car');
});

test('punching an officer is a crime, and enough of it puts them down', () => {
  const sim = alone(new Simulation(grid({ roads: [] })));
  const patrol = patrolAt(sim, 6, 60);
  sim.heat = 1; sim.police.report();
  assert.equal(sim.police._dismount(patrol), true);
  const officer = sim.police.officers[0];
  Object.assign(officer, { x: sim.player.x, z: sim.player.z + 1.2 });
  const heat = sim.heat;
  assert.equal(sim.police.strike(sim.player.x, sim.player.z, Math.PI), false, 'a swing the other way misses');
  assert.equal(sim.police.strike(sim.player.x, sim.player.z, 0), true);
  assert.ok(sim.heat > heat);
  sim.police.strike(sim.player.x, sim.player.z, 0); sim.police.strike(sim.player.x, sim.player.z, 0);
  assert.equal(sim.police.officers.length, 1, 'three punches and the officer is down');
  assert.ok(sim.stars >= 3);
});

test('when the chase is over the officers walk back to their car and it drives on', () => {
  const sim = alone(new Simulation(grid()));
  const edge = sim._nearestEdge(0, 150).edge;
  const patrol = sim._makeCar('patrol-0', 'police', sim._lanePoint(edge, 0.5), edge.angle, edge);
  sim.cars.push(patrol);
  sim.heat = 1; sim.police.report();
  assert.equal(sim.police._dismount(patrol), true);
  assert.equal(patrol._crewOut, true);
  const where = { x: patrol.x, z: patrol.z };
  advance(sim, 1);
  assert.deepEqual({ x: patrol.x, z: patrol.z }, where, 'the car stands while its crew are out');
  sim.heat = 0;
  advance(sim, 6);
  assert.equal(sim.police.officers.length, 0);
  assert.equal(patrol._crewOut, false);
  advance(sim, 4);
  assert.ok(Math.hypot(patrol.x - where.x, patrol.z - where.z) > 5, 'and then moves off');
});

test('a pedestrian collision is only reported by witnesses on that road level', () => {
  const sim = alone(new Simulation(grid()));
  const event = { x: 5, y: 8, z: 50 };
  const patrol = sim._makeCar('witness', 'police', { x: 6, z: 50 }, 0);
  patrol.y = 1;
  sim.cars = [patrol];
  const pedestrian = { x: 7, y: 1, z: 50, state: 'walk' };
  sim.setWalkers([], [pedestrian]);
  sim.police._random = () => 0;
  assert.equal(sim.offence('runDown', event), null);
  pedestrian.y = 8;
  assert.equal(sim.offence('runDown', event), 'called');
  patrol.y = 8;
  assert.equal(sim.offence('runDown', event), 'seen');
});

test('a crime nobody saw never happened, and one somebody saw counts when their call gets through', () => {
  const sim = alone(new Simulation(grid())); sim.cars = [];
  assert.equal(sim.offence('assault'), null); assert.equal(sim.heat, 0); assert.equal(sim.police.state, 'clear');
  // Somebody across the street, who always calls.
  sim.setWalkers([], [{ x: 16, z: 50, state: 'walk' }]); sim.police._random = () => 0;
  assert.equal(sim.witnesses(6, 50, 26), 1); assert.equal(sim.witnesses(6, 50, 8), 0);
  assert.equal(sim.offence('assault', { x: 6, z: 50 }), 'called');
  assert.equal(sim.heat, 0, 'not yet'); assert.equal(sim.police.calls.length, 1);
  advance(sim, 5); assert.equal(sim.stars, 1); assert.equal(sim.police.state, 'search');
  assert.deepEqual(sim.police.lastKnown, { x: 6, z: 50 }, 'they are sent to where it happened');
  // Someone lying in the street tells nobody.
  sim.heat = 0; sim.police.clear(); sim.setWalkers([], [{ x: 16, z: 50, state: 'down' }]);
  assert.equal(sim.offence('assault', { x: 6, z: 50 }), null);
});

test('a nearby witness behind a wall cannot see theft but can report hearing shots',()=>{
  const sim=alone(new Simulation(grid({roads:[],buildings:[box(9,46,1,8)]})));
  sim.cars=[];sim.police._random=()=>0;
  const p=sim.player, witness={x:p.x+6,y:p.y,z:p.z,state:'walk'};
  sim.setWalkers([],[witness]);
  assert.equal(sim.offence('theft'),null);
  assert.equal(sim.offence('gunfire'),'called');
  assert.equal(sim.offence('gunfire'),'called');assert.equal(sim.police.calls.length,1);
  const patrol=patrolAt(sim,p.x,p.z-6,0);
  // The report was anonymous and the patrol later arrived near an unarmed player.
  advance(sim,5);
  assert.equal(sim.stars,1);assert.equal(sim.police.state,'search');assert.equal(sim.police.known,null);
  assert.equal(patrol._sees,false);
  p.armed=true;advance(sim,.3);assert.equal(sim.police.state,'chase');
});

test('a delayed report remembers the vehicle at the scene instead of the player’s current ride',()=>{
  const sim=alone(new Simulation(grid({roads:[]})));
  sim.police._random=()=>0;
  Object.assign(sim.player,{mode:'drive',vehicleId:'witnessed-car'});
  assert.equal(sim.offence('theft',{x:11,z:72,witnessReport:true}),'called');
  Object.assign(sim.player,{mode:'walk',vehicleId:null,x:40});
  advance(sim,5);
  assert.equal(sim.police.known,'witnessed-car');
  assert.deepEqual(sim.police.lastKnown,{x:11,z:72});
});

test('crash severity, fault and repeated warnings determine whether a traffic incident earns a star',()=>{
  const sim=alone(new Simulation(grid({roads:[]}))), p=sim.player;
  sim.cars=[];patrolAt(sim,p.x,p.z-5,0);
  function impact(speed,kind,atFault=true){sim._impactCooldown=0;sim._impact(speed,kind,p,atFault);}
  impact(6,'police'); impact(24,'vehicle',false);assert.equal(sim.stars,0);
  impact(11,'vehicle');assert.equal(sim.stars,0);assert.ok(sim.police.warningHeat>0);
  advance(sim,17);impact(11,'vehicle');assert.equal(sim.stars,0,'an old warning expires');
  impact(11,'vehicle');assert.equal(sim.stars,1);
  sim.heat=0;sim.police.clear();impact(21,'vehicle');assert.equal(sim.stars,1,'a single reported hard collision counts');
});

test('a brief run during a one-star chase does not immediately add a second star',()=>{
  const sim=alone(new Simulation(grid({roads:[]})));
  sim.crime(1);sim.police._look=()=>true;
  let speed=6;sim.police._playerSpeed=()=>speed;
  advance(sim,4);assert.equal(sim.stars,1);
  speed=0;advance(sim,1);
  speed=6;advance(sim,7);assert.equal(sim.stars,1);
  advance(sim,1.1);assert.equal(sim.stars,2);
});

test('a clerk’s delayed theft report sends existing patrols to the shop',()=>{
  const sim=alone(new Simulation(grid()));sim.cars=[];sim.police._random=()=>0;
  assert.equal(sim.offence('theft',{x:56,z:62,witnessReport:true,localResponse:true}),'called');
  assert.equal(sim.stars,0);advance(sim,5);
  assert.equal(sim.stars,1);assert.deepEqual(sim.police.lastKnown,{x:56,z:62});
  advance(sim,7);
  assert.equal(patrols(sim).length,0);
  assert.equal(sim.police.officers.length,0);
});

test('a store alarm can alert a posted officer without spawning reinforcements after exit',()=>{
  const sim=alone(new Simulation(grid())), p=sim.player, police=sim.police;
  const door={x:p.x,z:p.z}, post={x:door.x,z:door.z+12,unit:{activity:'patrol'}};
  const actor={id:'existing-patrol',unit:'patrol',post,x:post.x,y:p.y,z:post.z,heading:Math.PI};
  police.fieldOfficers.push(actor);
  sim.room=door;
  assert.equal(sim.offence('robbery',{seen:true}),'seen');
  assert.deepEqual(police.lastKnown,door);
  assert.equal(police.officers[0]?.fieldActor,actor);
  police._dispatch();assert.equal(patrols(sim).length,0);
  sim.room=null;
  sim.offence('brandish',{seen:true});
  advance(sim,8);
  assert.equal(patrols(sim).length,0);
  assert.ok(police.officers.every(officer=>officer.id===actor.id));
  sim.offence('gunfire',{seen:true});
  advance(sim,3);
  assert.ok(patrols(sim).some(car=>car._dispatched),'a separate street crime can call for reinforcements');
});

test('each kind of crime brings only so many stars however often it is done', () => {
  const sim = alone(new Simulation(grid())); sim.cars = [];
  const charge = (kind, times) => { for (let i = 0; i < times; i++) sim.offence(kind, { seen: true }); return sim.stars; };
  assert.equal(charge('redLight', 12), 1); assert.equal(charge('collision', 12), 1);
  assert.equal(charge('assault', 12), 2); assert.equal(charge('carjack', 12), 2);
  assert.equal(charge('gunfire', 12), 3);
  assert.equal(charge('killing', 3), 3, 'three dead is three stars');
  assert.equal(charge('killing', 1), 4, 'a fourth brings a fourth'); assert.equal(charge('killing', 3), 4);
  assert.equal(charge('killing', 1), 5, 'and it takes eight for five');
  sim.heat = 0; sim.police.clear();
  assert.equal(charge('officerDown', 2), 4); assert.equal(charge('officerDown', 1), 5);
  for (const [kind, spec] of Object.entries(OFFENCES)) assert.ok(spec.heat > 0 && spec.cap >= 1 && spec.cap <= 4 && (spec.certain || kind === 'redLight' || (spec.reach > 0 && spec.call > 0 && spec.call < 1)), kind);
});

test('a patrol that can see it needs nobody to call', () => {
  const sim = alone(new Simulation(grid()));
  const patrol=patrolAt(sim,6,80);
  assert.equal(sim.offence('glass',{x:6,z:50}),null,'a patrol facing away misses it');
  patrol.angle=Math.PI;
  assert.equal(sim.offence('glass', { x: 6, z: 50 }), 'seen'); assert.equal(sim.stars, 1);
  const far = alone(new Simulation(grid())); patrolAt(far, 6, 250);
  assert.equal(far.offence('glass', { x: 6, z: 50 }), null); assert.equal(far.heat, 0);
});

test('the police are slow to know somebody who has changed what they are in', () => {
  const sim = alone(new Simulation(grid()));
  const patrol = patrolAt(sim, 6, 10, 0);
  sim.heat = 1; sim.police.report(); sim.police.known = 'car-they-saw';
  assert.equal(sim.police._look(), false, 'forty metres off, on foot, they were looking for a car');
  sim.police.known = sim.police._ride();
  assert.equal(sim.police._look(), true);
  sim.police.known = 'car-they-saw'; patrol.z = 50 - SIGHT.changed + 4;
  assert.equal(sim.police._look(), true, 'close enough, they know the face');
});

test('an officer\'s shot is a short-range thing, and worse at anything moving', () => {
  assert.ok(hitChance(9, 0, false) > .45 && hitChance(9, 0, false) < .55);
  assert.ok(hitChance(30, 0, false) < .2); assert.ok(hitChance(45, 0, false) < .13);
  assert.ok(hitChance(15, 8, false) < hitChance(15, 0, false) * .4, 'running');
  assert.ok(hitChance(15, 15, true) < .1, 'driving');
  assert.ok(hitChance(9, 0, false, 1) < hitChance(9, 0, false) * .5, 'a hurried shot');
  for (let away = 0; away < 60; away += 3) assert.ok(hitChance(away + 3, 0, false) < hitChance(away, 0, false));
  // Nobody fires the moment they see somebody: the gun has to come up first.
  const sim = alone(new Simulation(grid())); sim.cars = [];
  sim.heat = 3; sim.police.report(); sim.police.state = 'chase';
  sim.police.officers.push({ id: 'o', carId: null, x: 6, z: 58, y: 0, angle: Math.PI, speed: 0, health: 100, phase: 0, stride: 0, fire: 0, sees: true, aiming: false, returning: false, goal: null, side: 1, dodge: 0 });
  sim.police._seen = true;
  for (let i = 0; i < 30; i++) sim.police._officers(1 / 60);
  assert.equal(sim.police.shotsFired, 0, 'half a second in');
  for (let i = 0; i < 240; i++) sim.police._officers(1 / 60);
  assert.ok(sim.police.shotsFired > 0, 'and then they do');
});

test('a death or an arrest is watched before what follows it', () => {
  const sim = alone(new Simulation(grid())); sim.cars = []; sim.endingSeconds = 1; sim.cash = 500;
  sim.hurt(500, 'police');
  advance(sim, .1);
  assert.equal(sim.ending.kind, 'wasted'); assert.equal(sim.health, 0); assert.equal(sim.cash, 0); assert.match(sim.ending.line, /Lost \$500 in cash/);
  const at = { x: sim.player.x, z: sim.player.z };
  advance(sim, .5, { moveX: 1, moveZ: 1, run: true });
  assert.ok(Math.hypot(sim.player.x - at.x, sim.player.z - at.z) < .2, 'nobody is at the controls');
  assert.equal(sim.fight(), false); assert.equal(sim.interact(), false);
  advance(sim, .6);
  assert.equal(sim.ending, null); assert.equal(sim.health, 100); assert.equal(sim.cash, 0);
  // Arrested.
  sim.cash = 127.45;
  sim.heat = 1; sim.police.report(); sim.police.arrest = .99;
  sim.police.officers.push({ id: 'o', carId: null, x: sim.player.x + 1, z: sim.player.z, y: 0, angle: 0, speed: 0, health: 100, phase: 0, stride: 0, fire: 9, sees: true, aiming: false, returning: false, goal: null, side: 1, dodge: 0 });
  advance(sim, .2);
  assert.equal(sim.ending?.kind, 'busted'); assert.equal(sim.cash, 0); assert.match(sim.ending.line, /seized \$127.45 in cash/);
  advance(sim, 1.1);
  assert.equal(sim.ending, null); assert.equal(sim.heat, 0); assert.equal(sim.cash, 0);
});

test('a car driven into is dented and shoved off its line, and its driver goes on after a while', () => {
  const sim = alone(drivingCity(grid())); sim.interact();
  const car = sim.cars.find(item => item.controlled);
  assert.ok(car, 'driving');
  sim.cars = [car];
  Object.assign(car, { x: 0, z: 0, angle: 0 }); car.speed = 16; car.velocityX = 0; car.velocityZ = 16; Object.assign(sim.player, { x: 0, z: 0 });
  const other = sim._makeCar('struck', 'sedan', { x: .5, z: 6 }, Math.PI / 2); other.parked = false; other._edge = sim._graph.edges[0]; other.speed = 0;
  sim.cars.push(other);
  const at = { x: other.x, z: other.z };
  until(sim, 2, () => other.damage > 0, { forward: 1 });
  assert.ok(other.damage > .2 && other._loose > 0, `dented ${other.damage}`);
  advance(sim, 1.5);
  assert.ok(Math.hypot(other.x - at.x, other.z - at.z) > 1.5, 'it was moved');
  assert.ok(other._shoved);
});

test('a specialist crew joins a high wanted level and keeps its assignment when leaving its car',()=>{
  const sim=alone(new Simulation(grid()));
  sim.heat=4;
  for(let i=0;i<8;i++)sim.police._dispatch();
  const units=patrols(sim).filter(car=>car.unit==='esu');
  assert.equal(units.length,1);
  const car=units[0];
  assert.equal(car.shape,'van');
  Object.assign(car,{x:2,z:47,speed:0});
  assert.ok(sim.police._dismount(car));
  assert.deepEqual(sim.police.officers.map(officer=>officer.unit),['esu','esu']);
});

test('a street-post officer personally responds to a witnessed offence or a punch',()=>{
  for(const direct of [false,true]){
    const sim=alone(new Simulation(grid({roads:[]}))), p=sim.player, police=sim.police;
    const post={x:p.x,z:p.z+(direct?1.2:12),unit:{activity:'patrol'}};
    const actor={id:'neighborhood-patrol',unit:'patrol',post,x:post.x,y:p.y,z:post.z,heading:Math.PI};
    police.fieldOfficers.push(actor);
    if(direct){
      const passerby={...actor,id:'other-officer',z:p.z+.9};police.fieldOfficers.push(passerby);
      assert.ok(police.strike(p.x,p.z,0,1,p.y,false,actor,'reelLeft'));
      assert.equal(police.officers[0].fieldActor,actor);
      const witness=police.officers.find(other=>other.fieldActor===passerby);
      assert.ok(witness && !witness.reaction,'the nearer officer witnesses the hit');
    }
    else assert.equal(sim.offence('assault',{x:p.x,y:p.y,z:p.z}),'seen');
    sim.step({},1/30);
    const officer=police.officers.find(o=>o.id===actor.id);
    assert.ok(officer && sim.heat>0);
    assert.equal(police.fieldOfficers.length,0);
    if(direct)assert.equal(officer.reaction.clip,'reelLeft');
    else {advance(sim,.5);assert.ok(officer.z<post.z-.5);}
  }
});

test('a harbor crew keeps the player in sight from aboard its launch',()=>{
  const sim=alone(new Simulation(grid({roads:[]}))), p=sim.player, police=sim.police;
  const crew={id:'harbor-watch',unit:'harbor',post:{unit:{activity:'boat'}},heading:Math.PI,x:p.x,y:p.y+1,z:p.z+6};
  police.fieldOfficers.push(crew);
  assert.equal(sim.offence('theft',p),'seen');
  sim.step({},1/30);
  assert.equal(police.state,'chase');
  assert.ok(police.fieldOfficers.includes(crew));
  assert.ok(!police.officers.some(o=>o.id===crew.id));
});
