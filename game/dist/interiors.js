// Going inside.
//
// No register holds the inside of a shop. A place's room is laid out by the
// game: as wide as its street front, as deep as its building allows, and
// furnished for the kind of place it is: a counter, aisles and coolers for a
// bodega; tables for somewhere to eat; chairs and mirrors for a salon.
// The room is a closed box built behind the place's front wall. From inside,
// the street is not seen: the front is a wall with a lit door.
import * as THREE from './vendor/three.module.min.js';
import { KIND, placeName } from './places.js';
import { roomPoint, DOOR } from './room.js';

/** Kinds of place with a room to walk into, by group. */
const ROOMS = { bodega: 'shop', market: 'shop', liquor: 'shop', shop: 'shop', food: 'eat', cafe: 'eat', dining: 'eat', bar: 'bar', beauty: 'chairs', barber: 'chairs', hotel: 'lobby', public: 'lobby' };
export const roomKind = place => ['gas', 'parking', 'storage', 'ferry'].includes(place.kind) ? null : ROOMS[KIND[place.kind]?.group] || null;

export const CEILING = 3.1;
const hashOf = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h ^ (h >>> 15)) >>> 0; };

/**
 * Lay out a place's room. `front` is its street front (places.js);
 * `inside(x, z)` says whether a point is within its building.
 *
 * Room coordinates: `a` runs along the front wall from its middle, `b` runs
 * in from the wall. Things in the room are boxes { a, b, w, d, h, y, color,
 * solid }: centred at (a, b), w along the wall and d deep, from y up to y + h.
 * @returns {null | {name, kind, x, z, tx, tz, nx, nz, width, depth, things, staff:{a,b,facing}[], wall, floor}}
 */
export function planRoom(front, inside = () => true) {
  const place = front.place, kind = roomKind(place);
  if (!kind) return null;
  // As deep as the building goes behind the door, within reason.
  let depth = 0;
  while (depth < 13 && inside(front.x - front.nx * (depth + 1), front.z - front.nz * (depth + 1))) depth++;
  if (depth < 4) return null;
  depth = Math.min(12, depth - .4);
  const width = Math.max(5, Math.min(9, front.width)), half = width / 2, seed = hashOf(`${placeName(place)}|${place.x}|${place.z}`), things = [], staff = [];
  const add = (a, b, w, d, h, color, y = 0, solid = true) => things.push({ a, b, w, d, h, y, color, solid });
  const WOOD = '#6b4a32', STEEL = '#8d9498', DARK = '#23272b', WHITE = '#e6e3da';
  let wall = '#d8d2c4', floor = '#8a8378';
  if (kind === 'shop') {
    floor = '#9a968c';
    // The counter by the door, with the till; whoever minds the shop stands behind it.
    add(-half + 1.3, 1.9, 2.2, .7, 1.0, WOOD); add(-half + 1.3, 1.9, .5, .4, .35, DARK, 1.0, false); staff.push({ a: -half + 1.3, b: 1.15, facing: 1 });
    // Aisles of shelving, their stock in rows of colour; coolers across the back.
    const stock = ['#c8452e', '#e0b23a', '#3f7d4e', '#2f5f9e', '#d9d4c2', '#8a4b9e'];
    for (let a = -half + 3.4, i = 0; a < half - .6; a += 2.1, i++) {
      add(a, (4 + depth - 1.4) / 2, .55, depth - 5.4, 1.7, STEEL);
      for (let shelf = 0; shelf < 4; shelf++) add(a, (4 + depth - 1.4) / 2, .62, depth - 5.6, .22, stock[(seed + i * 3 + shelf) % stock.length], .25 + shelf * .4, false);
    }
    add(0, depth - .45, width - .6, .7, 2.1, '#cfd6da'); add(0, depth - .82, width - .8, .04, 1.5, '#7fb0c9', .4, false);
  } else if (kind === 'eat' || kind === 'bar') {
    wall = kind === 'bar' ? '#3a2a24' : '#e2d6bf'; floor = kind === 'bar' ? '#3b2f2a' : '#7a6a58';
    if (kind === 'bar') {
      // The bar down one side, stools along it, bottles behind.
      add(-half + 1.1, depth / 2 + .6, .7, depth - 3.2, 1.1, '#2b1a12'); add(-half + .25, depth / 2 + .6, .3, depth - 3.2, 1.6, '#1a1210', .9, false);
      for (let b = 2.6; b < depth - 1.2; b += 1.1) add(-half + 1.9, b, .38, .38, .75, DARK);
      staff.push({ a: -half + .62, b: depth / 2, facing: 0 });
    } else {
      // The counter across the back, the kitchen behind it.
      add(0, depth - 1.7, width - 1.6, .7, 1.05, STEEL); add(0, depth - .3, width - .4, .5, 2.0, '#b9bec2'); staff.push({ a: (seed % 3 - 1) * 1.2, b: depth - 1.0, facing: 2 });
    }
    // Tables, each with its chairs.
    for (let b = 2.4; b < depth - 3.4; b += 2.2) for (let a = kind === 'bar' ? -half + 3.6 : -half + 1.4; a < half - .9; a += 2.3) {
      add(a, b, .8, .8, .74, WOOD); add(a - .65, b, .4, .4, .45, DARK); add(a + .65, b, .4, .4, .45, DARK);
    }
  } else if (kind === 'chairs') {
    wall = place.kind === 'barber' ? '#e8e4da' : '#f1dfe6'; floor = '#b8b2a8';
    add(half - 1.2, 1.6, 1.6, .6, 1.05, WHITE); staff.push({ a: half - 1.2, b: .95, facing: 1 });
    // Stations down each side: a chair, and a mirror on the wall behind it.
    for (let b = 3.2; b < depth - 1.2; b += 1.9) for (const side of [-1, 1]) {
      add(side * (half - 1.1), b, .65, .65, .55, place.kind === 'barber' ? '#7a1f1f' : '#2b2b30'); add(side * (half - 1.1), b + .28, .6, .12, .6, '#2b2b30', .55, false);
      add(side * (half - .12), b, .06, 1.0, 1.1, '#bcd3da', 1.0, false);
    }
    staff.push({ a: -half + 1.9, b: 3.2, facing: 3 });
  } else {
    wall = '#ddd6c6'; floor = '#6f685e';
    // A lobby: the desk at the back, somewhere to sit by the door.
    add(0, depth - 1.6, Math.min(4, width - 2), .8, 1.1, WOOD); staff.push({ a: 0, b: depth - .9, facing: 2 });
    add(-half + .9, 2.6, .9, 2.0, .45, '#3f4a5a'); add(half - .9, 2.6, .9, 2.0, .45, '#3f4a5a');
  }
  return { name: placeName(place), kind, place, x: front.x, z: front.z, tx: front.tx, tz: front.tz, nx: front.nx, nz: front.nz, width, depth, things, staff, wall, floor };
}

/** Build a room as it stands in the world, its floor at height `y`. Returns a group; dispose() frees it. */
export function buildRoom(room, y = 0) {
  const group = new THREE.Group(); group.name = `Inside ${room.name}`;
  const position = [], color = [], tone = new THREE.Color();
  // Boxes are shaded by which way each face looks: there is no sun indoors.
  const box = (a, b, w, d, h, y0, hex, inward = false) => {
    const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed(), p = geometry.attributes.position, n = geometry.attributes.normal;
    tone.set(hex);
    const order = inward ? [0, 2, 1] : [0, 1, 2];
    for (let i = 0; i < p.count; i += 3) for (const k of order) {
      const la = a + p.getX(i + k), lb = b + p.getZ(i + k), [x, z] = roomPoint(room, la, lb), ny = n.getY(i + k) * (inward ? -1 : 1), shade = ny > .5 ? 1.08 : ny < -.5 ? .7 : Math.abs(n.getX(i + k)) > .5 ? .86 : .96;
      position.push(x, y + y0 + h / 2 + p.getY(i + k), z); color.push(tone.r * shade, tone.g * shade, tone.b * shade);
    }
    geometry.dispose();
  };
  // The shell, seen from inside: floor, ceiling and four walls; then a lit doorway in the front one.
  box(0, room.depth / 2, room.width, room.depth, CEILING, 0, room.wall, true);
  box(0, room.depth / 2, room.width - .02, room.depth - .02, .03, 0, room.floor); box(0, room.depth / 2, room.width - .02, room.depth - .02, .03, CEILING - .04, '#f2efe6');
  box(0, .03, DOOR, .04, 2.15, 0, '#cfe3ee'); box(-room.width / 4 - .4, .03, room.width / 2 - 1.6, .04, 1.5, .8, '#bcd6e4'); box(room.width / 4 + .4, .03, room.width / 2 - 1.6, .04, 1.5, .8, '#bcd6e4');
  for (let b = 1.5; b < room.depth; b += 3) box(0, b, room.width * .5, .5, .05, CEILING - .1, '#fffbe8');
  for (const thing of room.things) box(thing.a, thing.b, thing.w, thing.d, thing.h, thing.y, thing.color);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }); material.name = 'Room';
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; group.add(mesh);
  const lamp = new THREE.PointLight(0xfff1dc, 60, room.depth * 2.5, 1.6), [lx, lz] = roomPoint(room, 0, room.depth / 2);
  lamp.position.set(lx, y + CEILING - .5, lz); group.add(lamp);
  group.userData.dispose = () => { geometry.dispose(); material.dispose(); group.removeFromParent(); };
  return group;
}
