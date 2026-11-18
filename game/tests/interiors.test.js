import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { KIND } from '../dist/places.js';
import { planRoom, buildRoom, roomKind, roomStyle, STYLE_OF, CEILING } from '../dist/interiors.js';
import { KINDS } from '../dist/places.js';
import { walkRoom, roomPoint, DOOR } from '../dist/room.js';
import { Simulation } from '../dist/simulation.js';

const place = (kind, name = 'X') => ({ id: name, kind, group: KIND[kind].group, name, x: 0, z: 0, bin: 0, area: 0, grade: '' });
// A front on a wall along z = 0 facing +z; the building runs back to z = -depth.
const front = (kind, width = 7) => ({ place: place(kind), x: 10, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, width });
const building = depth => (x, z) => z < 0 && z > -depth && x > -20 && x < 40;

test('a room is as deep as its building allows and furnished for the kind of place', () => {
  assert.deepEqual(['bodega', 'pizza', 'coffee', 'bar', 'nails', 'barber', 'hotel', 'library', 'repair', 'gas', 'newsstand'].map(kind => roomKind(place(kind))), ['shop', 'eat', 'eat', 'bar', 'chairs', 'chairs', 'lobby', 'lobby', null, null, null]);
  assert.equal(planRoom(front('repair')), null); assert.equal(planRoom(front('bodega'), building(3)), null, 'no room in a building three metres deep');
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
  assert.equal(sim.enterRoom(room), true);
  assert.ok(sim.room && sim.player.z < 0, 'inside the building, where the city would not let anyone walk');
  for (let i = 0; i < 600; i++) sim.step({ moveX: 0, moveZ: -1 }, 1 / 60);
  assert.ok(sim.room && sim.player.z > -room.depth && sim.player.z < -1, `walked to ${sim.player.z.toFixed(1)} and no further`);
  for (let i = 0; i < 600 && sim.room; i++) sim.step({ moveX: (10 - sim.player.x) * 2, moveZ: 1 }, 1 / 60);
  assert.equal(sim.room, null); assert.ok(sim.player.z > 0 && sim.player.z < 2.5, 'back out through the door');
  sim.enterRoom(room); assert.equal(sim.interact(), true); assert.equal(sim.room, null, 'E leaves too');
});

test('there is somewhere for customers to sit: at tables, at the bar and in the barber chairs, each on a seat and facing what they came for', () => {
  const eat = planRoom(front('pizza')), bar = planRoom(front('bar')), barber = planRoom(front('barber')), shop = planRoom(front('bodega'));
  assert.ok(eat.seats.length >= 4 && eat.seats.length % 2 === 0, `${eat.seats.length} seats at tables`);
  assert.ok(bar.seats.some(seat => seat.lift > 0) && barber.seats.length >= 2);
  assert.deepEqual(shop.seats, [], 'nobody sits in a deli');
  for (const room of [eat, bar, barber]) for (const seat of room.seats) {
    // On a piece of furniture low enough to sit on, inside the room, and facing square along or across it.
    assert.ok(room.things.some(thing => thing.solid && thing.h <= .8 && Math.abs(thing.a - seat.a) < .01 && Math.abs(thing.b - seat.b) < .01), 'on a seat');
    assert.ok(Math.abs(seat.a) < room.width / 2 && seat.b > 0 && seat.b < room.depth && Math.abs(seat.da) + Math.abs(seat.db) === 1);
  }
  // At a table the two face each other.
  const [left, right] = eat.seats;
  assert.ok(left.b === right.b && left.a < right.a && left.da === 1 && right.da === -1);
});

test('each kind of place has its own manner of room, the commonest kinds first', () => {
  assert.deepEqual(['american', 'bodega', 'salon', 'secondhand', 'nails', 'chinese', 'coffee', 'barber', 'latin', 'clothes', 'pizza', 'liquor', 'mexican', 'bar', 'bank', 'laundromat', 'bakery', 'japanese', 'supermarket', 'italian', 'hotel', 'mediterranean', 'club', 'gym', 'school'].map(kind => roomStyle(place(kind))),
    ['diner', 'bodega', 'salon', 'cases', 'nails', 'takeout', 'coffee', 'barber', 'steamtable', 'clothes', 'pizza', 'liquor', 'takeout', 'bar', 'bank', 'laundromat', 'bakery', 'sushi', 'market', 'fine', 'hotel', 'halal', 'club', 'gym', 'lobby']);
  assert.equal(roomStyle(place('repair')), null);
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
