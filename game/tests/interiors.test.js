import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { KIND } from '../dist/places.js';
import { planRoom, buildRoom, roomKind, roomStyle, STYLE_OF, CEILING } from '../dist/interiors.js';
import { KINDS } from '../dist/places.js';
import { walkRoom, roomPoint, DOOR, ShopDoor } from '../dist/room.js';
import { fleeShop, inviteCustomer, populateShop, stepEscape } from '../dist/shop-life.js';
import { Simulation } from '../dist/simulation.js';

const place = (kind, name = 'X') => ({ id: name, kind, group: KIND[kind].group, name, x: 0, z: 0, bin: 0, area: 0, grade: '' });
// A front on a wall along z = 0 facing +z; the building runs back to z = -depth.
const front = (kind, width = 7) => ({ place: place(kind), x: 10, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, width });
const building = depth => (x, z) => z < 0 && z > -depth && x > -20 && x < 40;

test('a room is as deep as its building allows and furnished for the kind of place', () => {
  assert.deepEqual(['bodega', 'pizza', 'coffee', 'bar', 'nails', 'barber', 'hotel', 'library', 'repair', 'gas', 'newsstand'].map(kind => roomKind(place(kind))), ['shop', 'eat', 'eat', 'bar', 'chairs', 'chairs', 'lobby', 'lobby', 'shop', null, null]);
  assert.equal(planRoom(front('bodyshop')).style, 'workshop'); assert.equal(planRoom(front('bodega'), building(3)), null, 'no room in a building three metres deep');
  const deli = planRoom(front('bodega', 9), building(30)), small = planRoom(front('bodega', 20), building(8));
  assert.deepEqual([deli.kind, deli.width, deli.depth, deli.x, deli.z], ['shop', 9, 12, 10, 0]);
  assert.deepEqual([small.width, small.depth], [9, 6.6], 'no wider than nine metres, no deeper than the building');
  for (const kind of ['bodega', 'pizza', 'bar', 'nails', 'barber', 'hotel', 'school']) {
    const room = planRoom(front(kind), building(30));
    assert.ok(room.things.length >= 3 && room.staff.length >= 1 && /^#[0-9a-f]{6}$/.test(room.wall) && /^#[0-9a-f]{6}$/.test(room.floor), kind);
    for (const thing of room.things) assert.ok(Math.abs(thing.a) + thing.w / 2 <= room.width / 2 + .01 && thing.b - thing.d / 2 >= -.01 && thing.b + thing.d / 2 <= room.depth + .01 && thing.y + thing.h <= CEILING, `${kind}: everything is inside the room`);
    // The way in is clear, and whoever works there is not standing in the furniture.
    assert.ok(!room.things.some(thing => thing.solid && Math.abs(thing.a) < thing.w / 2 + .4 && thing.b - thing.d / 2 < 1.4), `${kind}: nothing in the doorway`);
    for (const spot of room.staff) assert.ok(!room.things.some(thing => thing.solid && Math.abs(spot.a - thing.a) < thing.w / 2 && Math.abs(spot.b - thing.b) < thing.d / 2), `${kind}: staff stand clear`);
  }
  assert.deepEqual(planRoom(front('pizza'), building(30)), planRoom(front('pizza'), building(30)), 'the same place has the same room');
  const built = buildRoom(deli, 5), mesh = built.children.find(child => child.isMesh);
  mesh.geometry.computeBoundingBox();
  assert.ok(Math.abs(mesh.geometry.boundingBox.min.y - 5) < .01 && Math.abs(mesh.geometry.boundingBox.max.y - 5 - CEILING) < .01 && mesh.geometry.boundingBox.max.z < .01, 'the room is behind the wall, on its floor');
  built.userData.dispose();
});

test('both storefront windings show the inside of the walls and the tops of furniture', () => {
  for (const nz of [-1, 1]) {
    const room = planRoom({ ...front('bar'), nz });
    room.things = [
      { a: -1, b: 3, w: 1, d: 1, h: 1, y: 0, color: '#888888' },
      { a: 1, b: 3, w: .5, d: .5, h: .75, y: 0, color: '#888888', shape: 'stool' },
    ];
    const group = buildRoom(room), mesh = group.children[0];
    const hit = (a, b, y, direction) => {
      const [x, z] = roomPoint(room, a, b);
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(...direction));
      return ray.intersectObject(mesh)[0]?.distance ?? Infinity;
    };
    for (const sign of [-1, 1]) {
      assert.ok(Math.abs(hit(0, 6, 2.8, [sign, 0, 0]) - room.width / 2) < .001);
      // The back wall is where the room ends; the front one, with its doorway and windows, stands just inside the building's own.
      assert.ok(Math.abs(hit(0, 6, 2.8, [0, 0, sign]) - 6) < .09);
    }
    assert.ok(Math.abs(hit(-1, 3, 2, [0, -1, 0]) - 1) < .001);
    assert.ok(Math.abs(hit(1, 3, 2, [0, -1, 0]) - 1.25) < .001);
    // The street is seen through the doorway and the windows: nothing of the room is in the way there.
    const out = [0, 0, room.nz];
    assert.equal(hit(0, 6, 1.5, out), Infinity, 'the doorway'); assert.equal(hit(room.width / 4 + .2, 6, 1.5, out), Infinity, 'a window'); assert.ok(hit(room.width / 4 + .2, 6, .4, out) < 6.1, 'the wall under it');
    group.userData.dispose();
  }
});

test('the door, display windows and corner windows use the same single sheet of tinted glass', () => {
  const plan = planRoom({ ...front('coffee'), returns: [{ side: 1, length: 4 }] });
  const group = buildRoom(plan, 0, { streetView: true });
  const windows = group.getObjectByName('Storefront window glass');
  const door = group.getObjectByName('Storefront door glass');
  assert.equal(door.material, windows.material);
  assert.ok(windows.material.transparent && !windows.material.depthWrite && windows.material.forceSinglePass);
  group.updateMatrixWorld(true);
  const hits = (origin, direction, mesh) => new THREE.Raycaster(new THREE.Vector3(...origin),
    new THREE.Vector3(...direction)).intersectObject(mesh).length;
  assert.equal(hits([10.25,1.5,2], [0,0,-1], door), 1);
  assert.equal(hits([8,1.5,2], [0,0,-1], windows), 1);
  assert.equal(hits([12,1.5,2], [0,0,-1], windows), 1);
  assert.equal(hits([15,1.5,-1], [-1,0,0], windows), 1);
  group.userData.door.angle = Math.PI / 2;
  group.userData.updateDoor();
  group.updateMatrixWorld(true);
  assert.equal(hits([10.25,1.5,2], [0,0,-1], door), 0);
  group.userData.dispose();
});

test('walking about a room: walls and furniture stop you, the door lets you out', () => {
  const room = planRoom(front('bodega', 9), building(30));
  assert.deepEqual(roomPoint(room, 2, 3), [12, -3]);
  let at = { a: 0, b: 1 };
  for (let i = 0; i < 400; i++) at = walkRoom(room, at.a, at.b, .05, 0);
  assert.ok(Math.abs(at.a - (4.5 - .35)) < 1e-9, 'the side wall');
  for (let i = 0; i < 400; i++) at = walkRoom(room, at.a, at.b, 0, .05);
  assert.ok(at.b <= room.depth - .35 && !at.out);
  // Into the counter by the door: stopped at its edge.
  const counter = room.things[0]; at = { a: counter.a, b: counter.b + 2 };
  for (let i = 0; i < 100; i++) at = walkRoom(room, at.a, at.b, 0, -.05);
  assert.ok(Math.abs(at.b - (counter.b + counter.d / 2 + .35)) < 1e-6);
  // Out: only through the door.
  assert.equal(walkRoom(room, 0, .3, 0, -.3).out, true); assert.equal(walkRoom(room, DOOR, .4, 0, -.4).out, false);
});

test('the player goes in on foot, is kept in the room, and comes out on the sidewalk', () => {
  const sim = new Simulation({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, roads: [], buildings: [{ id: 'b', polygon: [[-20, -30], [40, -30], [40, 0], [-20, 0]], holes: [] }], spawn: { x: 10, z: 2, angle: 0 }, missionPoints: [] });
  const room = planRoom(front('pizza'), building(30));
  assert.equal(sim.enterRoom(null), false);
  assert.equal(sim.enterRoom(room), false, 'cannot enter from a distance');
  const door = new ShopDoor(); sim.doorway = { plan: room, door, floor: 0 };
  Object.assign(sim.player, { x: 10, y: 0, z: 1.5, angle: Math.PI });
  let maximumStep = 0;
  for (let i = 0; i < 120 && !sim.room; i++) {
    const z = sim.player.z;
    door.step(1/60); sim.step({moveZ:-1},1/60);
    maximumStep = Math.max(maximumStep, Math.abs(z-sim.player.z));
  }
  assert.ok(door.angle > .55 && maximumStep < .075, 'the body pushes the door and crosses in ordinary walking steps');
  assert.ok(sim.room && sim.player.z < 0, 'inside the building, where the city would not let anyone walk');
  for (let i = 0; i < 600; i++) sim.step({ moveX: 0, moveZ: -1 }, 1 / 60);
  assert.ok(sim.room && sim.player.z > -room.depth && sim.player.z < -1, `walked to ${sim.player.z.toFixed(1)} and no further`);
  for (let i = 0; i < 600 && sim.room; i++) sim.step({ moveX: (10 - sim.player.x) * 2, moveZ: 1 }, 1 / 60);
  assert.equal(sim.room, null); assert.ok(sim.player.z > 0 && sim.player.z < 2.5, 'back out through the door');
  for(let i=0;i<50&&!sim.room;i++)sim.step({moveZ:-1},1/60);
  assert.ok(sim.room,'can turn straight back without a cooldown');
});

test('there is somewhere for customers to sit: at tables, at the bar and in the barber chairs, each on a seat and facing what they came for', () => {
  const eat = planRoom(front('pizza')), bar = planRoom(front('bar')), barber = planRoom(front('barber')), shop = planRoom(front('bodega'));
  assert.ok(eat.seats.length >= 4 && eat.seats.length % 2 === 0, `${eat.seats.length} seats at tables`);
  assert.ok(bar.seats.some(seat => seat.lift > 0) && barber.seats.length >= 2);
  assert.ok(eat.seats.some(s => s.seatKind === 'chair') && bar.seats.some(s => s.seatKind === 'stool'));
  assert.ok(barber.seats.some(s => s.seatKind === 'lounge'));
  assert.ok(planRoom(front('american')).seats.some(s => s.seatKind === 'booth'));
  assert.deepEqual(shop.seats, [], 'nobody sits in a deli');
  for (const room of [eat, bar, barber]) for (const seat of room.seats) {
    // On a piece of furniture low enough to sit on, inside the room, and facing square along or across it.
    assert.ok(room.things.some(thing => thing.solid && thing.h === seat.seatHeight && Math.abs(thing.a - seat.a) < .01 && Math.abs(thing.b - seat.b) < .01), 'on the seat surface');
    assert.ok(Math.abs(seat.a) < room.width / 2 && seat.b > 0 && seat.b < room.depth && Math.abs(seat.da) + Math.abs(seat.db) === 1);
  }
  // At a table the two face each other.
  const [left, right] = eat.seats;
  assert.ok(left.b === right.b && left.a < right.a && left.da === 1 && right.da === -1);
});

test('each kind of place has its own manner of room, the commonest kinds first', () => {
  assert.deepEqual(['american', 'bodega', 'salon', 'secondhand', 'nails', 'chinese', 'coffee', 'barber', 'latin', 'clothes', 'pizza', 'liquor', 'mexican', 'bar', 'bank', 'laundromat', 'bakery', 'japanese', 'supermarket', 'italian', 'hotel', 'mediterranean', 'club', 'gym', 'school'].map(kind => roomStyle(place(kind))),
    ['diner', 'bodega', 'salon', 'cases', 'nails', 'takeout', 'coffee', 'barber', 'steamtable', 'clothes', 'pizza', 'liquor', 'takeout', 'bar', 'bank', 'laundromat', 'bakery', 'sushi', 'market', 'fine', 'hotel', 'halal', 'club', 'gym', 'lobby']);
  assert.equal(roomStyle(place('repair')), 'workshop');
  for (const kind of Object.keys(STYLE_OF)) assert.ok(KIND[kind], `${kind} is a kind of place`);
  // Nine places in ten that can be walked into have a manner of room made for their kind.
  const index = name => JSON.parse(readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8')).counts, counts = { ...index('places-index.json') };
  for (const [kind, n] of Object.entries(index('shops-index.json'))) counts[kind] = (counts[kind] || 0) + n;
  let rooms = 0, made = 0;
  for (const [kind, n] of Object.entries(counts)) if (roomKind(place(kind))) { rooms += n; if (STYLE_OF[kind]) made += n; }
  assert.ok(made / rooms > .9, `${(100 * made / rooms).toFixed(0)}% of places with a room have one made for their kind`);
  // Two manners of room are not the same room in other colours.
  const shape = kind => JSON.stringify(planRoom(front(kind), building(30)).things.map(thing => [thing.a, thing.b, thing.w, thing.d]));
  assert.equal(new Set(['american', 'italian', 'chinese', 'pizza', 'coffee', 'japanese', 'mediterranean', 'latin', 'bakery', 'bar', 'club', 'bodega', 'supermarket', 'liquor', 'clothes', 'secondhand', 'bank', 'laundromat', 'gym', 'salon', 'nails', 'barber', 'hotel', 'cinema'].map(shape)).size, 24);
});

test('whatever the size of the room, it can be walked into and whoever serves can be reached', () => {
  for (const kind of KINDS.map(entry => entry.id).filter(id => roomKind(place(id)))) for (const width of [5, 7, 9]) for (const deep of [5, 7, 10, 30]) {
    const room = planRoom(front(kind, width), building(deep)), label = `${kind} ${width} x ${room.depth}`;
    assert.ok(room.style && room.things.length >= 3 && room.staff.length >= 1 && /^#[0-9a-f]{6}$/.test(room.wall) && /^#[0-9a-f]{6}$/.test(room.floor) && room.light.power > 10, label);
    for (const thing of room.things) assert.ok(/^#[0-9a-f]{6}$/.test(thing.color) && Math.abs(thing.a) + thing.w / 2 <= room.width / 2 + .01 && thing.b - thing.d / 2 >= -.01 && thing.b + thing.d / 2 <= room.depth + .01 && thing.y >= 0 && thing.y + thing.h <= CEILING, `${label}: everything is inside the room`);
    assert.ok(!room.things.some(thing => thing.solid && Math.abs(thing.a) < thing.w / 2 + .4 && thing.b - thing.d / 2 < 1.4), `${label}: nothing in the doorway`);
    for (const spot of room.staff) assert.ok(Math.abs(spot.da) + Math.abs(spot.db) === 1 && !room.things.some(thing => thing.solid && Math.abs(spot.a - thing.a) < thing.w / 2 && Math.abs(spot.b - thing.b) < thing.d / 2), `${label}: staff stand clear`);
    for (const seat of room.seats) assert.ok(room.things.some(thing => thing.solid && thing.h <= .8 && thing.a === seat.a && thing.b === seat.b), `${label}: a seat is something to sit on`);
    // Walk everywhere that can be walked from the door, a quarter of a metre at a time.
    const step = .25, seen = new Set(), queue = [[0, .5]], key = (a, b) => `${Math.round(a / step)},${Math.round(b / step)}`;
    const free = (a, b) => Math.abs(a) <= room.width / 2 - .35 && b >= .35 && b <= room.depth - .35 && !room.things.some(thing => thing.solid && Math.abs(a - thing.a) < thing.w / 2 + .3 && Math.abs(b - thing.b) < thing.d / 2 + .3);
    seen.add(key(0, .5));
    while (queue.length) { const [a, b] = queue.pop(); for (const [da, db] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const na = a + da, nb = b + db; if (!seen.has(key(na, nb)) && free(na, nb)) { seen.add(key(na, nb)); queue.push([na, nb]); } } }
    const reached = [...seen].map(text => text.split(',').map(n => Number(n) * step));
    assert.ok(reached.length > 30, `${label}: there is room to walk`);
    assert.ok(room.staff.some(spot => reached.some(([a, b]) => Math.hypot(a - spot.a, b - spot.b) < 2.4)), `${label}: someone serving can be reached`);
  }
});

test('a two-way closer responds on contact, clears the body, then settles', () => {
  for (const side of [1,-1]) {
    const door = new ShopDoor(), dt=1/60;
    let b=-side*.6, contact=false;
    for(let i=0;i<40;i++){
      const next=b+side*.045;
      door.step(dt);door.push(0,b,0,next,.4,dt);b=next;
      if(!contact && Math.abs(b)<.4){assert.ok(door.angle*side>0);contact=true;}
      if(Math.abs(b)<.02)assert.ok(door.angle*side>.7);
    }
    assert.ok(contact);
    for(let i=0;i<360;i++)door.step(dt);
    assert.ok(Math.abs(door.angle)<.002);assert.ok(Math.abs(door.velocity)<.002);
  }
});

test('a diner keeps their seat occupied until they have risen into the aisle', () => {
  const plan=planRoom(front('pizza')), spot=plan.seats[0], [x,z]=roomPoint(plan,spot.a,spot.b);
  const view={plan,floor:0,occupied:new Set([spot])}, actor={x,z,heading:0,sitting:true,spot,seat:spot};
  fleeShop(view,actor,.4);
  stepEscape(view,actor,.3);
  assert.deepEqual([actor.x,actor.z],[x,z]);
  stepEscape(view,actor,.11);
  assert.ok(actor.seat.leaving);
  stepEscape(view,actor,.2);
  assert.ok(actor.sitting && actor.seat.weight<1 && view.occupied.has(spot));
  stepEscape(view,actor,.5);
  assert.ok(!actor.sitting && !view.occupied.has(spot));
  assert.equal(actor.clip,'jog');
});

test('a sidewalk customer walks through the door, orders once and resumes their route', () => {
  const plan=planRoom(front('coffee')), view={plan,floor:3,door:new ShopDoor(),actors:[],occupied:new Set()};
  populateShop(view);
  const person={state:'walk',run:{},age:4,look:{pace:1.5},x:plan.x+1,z:plan.z+2};
  const sales=[];
  inviteCustomer(view,[person],20,(shop,price)=>sales.push([shop,price]));
  assert.strictEqual(view.visitor,person);
  const menuItem=person.visit.item;
  let waited=false,inside=false,opened=false;
  for(let i=0;i<5000&&person.visit;i++){
    const before={x:person.x,z:person.z};
    view.door.step(1/60);person.visit.step(person,1/60,20+i/60);
    assert.ok(Math.hypot(before.x-person.x,before.z-person.z)<=1.5/60+.0001);
    if(person.visit?.wait>0)waited=true;
    if(person.z<plan.z){inside=true;assert.equal(person.y,3);}
    if(view.door.angle>.2)opened=true;
  }
  assert.ok(inside&&waited&&opened);assert.deepEqual(sales,[[plan.place,menuItem.price]]);
  assert.equal(person.state,'walk');assert.equal(view.visitor,null);
  assert.ok(Math.hypot(person.x-plan.x-1,person.z-plan.z-2)<.001);
});

test('a treadmill runner steps down, waits for a blocked doorway and pushes through when it clears', () => {
  const plan = planRoom(front('gym')), view = {plan,floor:4,actors:[],occupied:new Set(),door:new ShopDoor()};
  populateShop(view);
  const runner = view.actors.find(actor => actor.spot.treadmill);
  const [startX,startZ] = [runner.x,runner.z];
  const barrier = {a:0,b:.25,w:plan.width,d:.12,solid:true};
  plan.things.push(barrier);
  fleeShop(view,runner,.2);
  stepEscape(view,runner,.1);
  assert.deepEqual([runner.x,runner.z,runner.lift], [startX,startZ,.265]);
  stepEscape(view,runner,.25);
  assert.ok(runner.lift > 0 && runner.lift < .265);
  const memory = runner.robbery;
  for (let i=0;i<150;i++) assert.equal(stepEscape(view,runner,.05),false);
  assert.equal(runner.lift,0);
  assert.equal(runner.y,view.floor);
  assert.equal(runner.clip,'cower');
  plan.things.splice(plan.things.indexOf(barrier),1);
  let outside=false, opened=false;
  for (let i=0;i<250 && !outside;i++) {
    view.door.step(.05);
    outside=stepEscape(view,runner,.05);
    opened ||= view.door.angle < -.4;
  }
  assert.ok(opened && outside);
  assert.strictEqual(runner.robbery,memory);
});

test('an escaping employee reroutes around a player who stays in the aisle', () => {
  const plan={width:5,depth:7,x:0,z:0,tx:1,tz:0,nx:0,nz:1,things:[]};
  const view={plan,floor:0,door:new ShopDoor()}, actor={x:0,z:-6,y:0};
  const player={x:0,z:-3,y:0,mode:'walk'};
  const street=[];
  fleeShop(view,actor,0);
  for(let i=0;i<200&&!actor.gone;i++) {
    stepEscape(view,actor,.05,person=>street.push(person),player);
    assert.ok(Math.hypot(actor.x-player.x,actor.z-player.z)>.36);
  }
  assert.deepEqual(street,[actor]);
  assert.ok(actor.z>1);
  stepEscape(view,actor,.05,person=>street.push(person),player);
  assert.equal(street.length,1);
});

test('staff and waiting customers can share the exit of a bank or reception room', () => {
  for (const kind of ['bank', 'clinic']) {
    const plan = planRoom({...front(kind, 6), x:0}, building(6.1));
    const view = {plan, floor:0, door:new ShopDoor(), actors:[], occupied:new Set()};
    populateShop(view);
    assert.ok(view.actors.some(a => a.sitting), kind);
    const street = new Set();
    view.actors.forEach((actor, i) => fleeShop(view, actor, i * .3));
    for (let i = 0; i < 400 && street.size < view.actors.length; i++) {
      view.door.step(.05);
      for (const actor of view.actors) stepEscape(view, actor, .05, escaped => street.add(escaped));
    }
    assert.equal(street.size, view.actors.length, kind);
    for (const actor of street) assert.ok(actor.z > 1 && actor.robbery, kind);
  }
});
