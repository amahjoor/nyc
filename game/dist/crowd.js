import { handGroup, handStrikes, meleeMoves, nextStrike } from './melee-moves.js';
import { WALK_CLIP_SPEED, strideFactor } from './body-motion.js';
import { followFloor, receiveImpulse, stepImpulse } from './character-physics.js';
// People on the sidewalks.
//
// How many there are follows the place and the hour (citylife.js): forty to a
// hundred metres of Times Square sidewalk at half past five, two or three on a
// residential block. What they wear follows the same model: jackets and
// shirts round the offices at lunch, shorts and bright colours where the
// visitors are, dark clothes on a street of bars at night. Skin and hair are
// drawn from the same wide range everywhere, because that is what a New York
// sidewalk looks like in any neighbourhood.
//
// They walk the kerb-side of the surveyed sidewalks, turn corners, wait for
// the walk signal the simulation's traffic is also obeying, and, being New
// Yorkers, cross against it when nothing is coming. They are drawn as one
// instanced mesh whose walk cycle runs in the vertex shader.
import * as THREE from './vendor/three.module.min.js';
import { seatClip, seatHeight } from './seating.js';
import { crossingAspect } from './signal-plan.js';
import { trafficAtHeight } from './road-level.js';
import { PedestrianGrid, clearTravel, hasStandingRoom, limitPedestrianStep, localWalkRoute, pedestrianRadius, recoverStandingRoom, walkTowards } from './pedestrian-motion.js';
import { createStreetPopulation } from './street-population.js';
import { roomLocal } from './room.js';
import { countedSidewalkDensity, plazaVisitorsPerMetre } from './times-square-crowd.js';
import { OUTFITS, WALKING_PACE } from './citylife.js';
import { drawTone } from './demographics.js';
import { castWalkStyle, chooseVariant, clothesFor, memberFor, memberInfo, roughHeight, MEMBERS, KINDS, KIT, VARIANT_STEP } from './human-cast.js';
export { KIT };

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const CROSSING_RECHECK = .3;
const CURB_OFFSETS = [0,-.7,.7,-1.4,1.4,-2.1,2.1];

// Test a walk against a vehicle's footprint in the moving vehicle's frame.
function meetsVehicle(x, z, dx, dz, width, length) {
  if ((!dx && Math.abs(x)>width) || (!dz && Math.abs(z)>length)) return false;
  const x1 = dx ? (-width-x)/dx : -Infinity, x2 = dx ? (width-x)/dx : Infinity;
  const z1 = dz ? (-length-z)/dz : -Infinity, z2 = dz ? (length-z)/dz : Infinity;
  return Math.max(0,Math.min(x1,x2),Math.min(z1,z2)) <= Math.min(1,Math.max(x1,x2),Math.max(z1,z2));
}

function crossingObstructed(person, x, z, cars) {
  const dx=x-person.x, dz=z-person.z;
  const duration=Math.hypot(dx,dz)/Math.max(.8,person.look.pace*1.15);
  for (const car of cars) {
    if (!trafficAtHeight(car,person.y)) continue;
    const sin=Math.sin(car.angle||0), cos=Math.cos(car.angle||0);
    const stationary=(car._kerb || car.parked) && !car.controlled && !(car._loose>0);
    const speed=stationary?0:car.speed||0;
    const physical=car.controlled || car._loose>0;
    const vx=physical?(car.velocityX??sin*speed):sin*speed;
    const vz=physical?(car.velocityZ??cos*speed):cos*speed;
    const fromX=person.x-car.x, fromZ=person.z-car.z;
    const stepX=dx-vx*duration, stepZ=dz-vz*duration;
    const width=(car.identity?.asset?.design?.W??1.9)/2+.55;
    const length=(car.identity?.asset?.design?.L??4.6)/2+.65+Math.min(3,Math.hypot(vx,vz)*.35);
    if (meetsVehicle(fromX*cos-fromZ*sin,fromX*sin+fromZ*cos,
      stepX*cos-stepZ*sin,stepX*sin+stepZ*cos,width,length)) return true;
  }
  return false;
}

/** A small deterministic generator, so a crowd can be replayed in tests. */
export function seeded(seed = 1) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// --- What people look like -----------------------------------------------------------
// Skin and hair cover the range seen on any New York sidewalk; the weights are
// even on purpose and do not vary by neighbourhood.
const SKIN = [0x3b2417, 0x4f311f, 0x6b4630, 0x8d5b3f, 0xa8734f, 0xb98563, 0xc79a7b, 0xd9ae8c, 0xe0b99a, 0xecc9ad];
const HAIR = [0x0e0c0b, 0x14110f, 0x1c1512, 0x2a211c, 0x3b2a1e, 0x5a3b25, 0x7a5533, 0x8a6a45, 0xb89b6a, 0x9a9a98, 0xd8d6d0, 0x6e2a1c];
const CLOTH = {
  suitTop: [0x161a26, 0x1b1d22, 0x23262b, 0x2c3140, 0x3a3d45, 0x4a4f58],
  shirt: [0xe9ebee, 0xdfe7f2, 0xc9d8ea, 0xf0e4e4, 0xdce8dc, 0xe8e2d2, 0x9fb7d2],
  trousers: [0x16181d, 0x1e2230, 0x2b2f38, 0x3d4047, 0x6e6552, 0x8a7d62],
  jeans: [0x1c2a44, 0x243656, 0x30486e, 0x47607f, 0x15171b, 0x3a3f36],
  tee: [0xe6e6e2, 0x1b1c1f, 0x7d8a92, 0x9b3b34, 0x2f5d8a, 0x4d7a56, 0xc9a23f, 0x7a4f86, 0xd0d4d6, 0x5b6f7e, 0xb86a4a, 0x2d6a6a],
  bright: [0xe24a3b, 0x2f8fd0, 0xf2c230, 0x34a36a, 0xf07a2c, 0xe0559a, 0x24b3b0, 0xf4f4f0, 0x8a55c8],
  shorts: [0x8a7d62, 0x30486e, 0x16181d, 0x5e6b52, 0xb9ac8e, 0x2b2f38],
  dark: [0x101114, 0x17181c, 0x1f1c22, 0x2a1418, 0x14202a, 0x1c241c, 0x3a0f1c],
  vest: [0xe6e21f, 0xf28a1c, 0xe6e21f], scrubs: [0x2e8c8c, 0x2f6fb0, 0x4a7fa0],
};
const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];

/**
 * One person: colours, kit, height and pace, for an outfit named in
 * citylife.js. `random` is a generator of numbers from 0 to 1.
 */
export function dress(outfit, random = Math.random, tones = null, style = .3, fixedMember = null) {
  const look = { outfit, skin: pick(SKIN, random), hair: pick(HAIR, random), kit: 0, top: 0, bottom: 0,
    height: clamp(1.69 + (random() + random() + random() - 1.5) * .16, 1.5, 1.95), build: .9 + random() * .25, pace: 1.25 + random() * .4 };
  // Where the mix of people round here is known (demographics.js), skin and hair are drawn from it.
  if (tones) { look.skin = drawTone(tones.skins, tones.skin, random()); look.hair = drawTone(tones.hairs, tones.hair, random()); }
  const chance = p => random() < p, wear = (...bits) => { for (const bit of bits) look.kit |= bit; };
  if (chance(.42)) wear(KIT.longHair);
  switch (outfit) {
    case 'suit': look.top = pick(CLOTH.suitTop, random); look.bottom = chance(.75) ? look.top : pick(CLOTH.trousers, random); if (chance(.3)) wear(KIT.bag); break;
    case 'office': look.top = pick(CLOTH.shirt, random); look.bottom = pick(CLOTH.trousers, random); if (chance(.45)) wear(KIT.shortSleeves); if (chance(.35)) wear(KIT.bag); if (chance(.12)) wear(KIT.backpack); break;
    case 'summer': look.top = pick(chance(.5) ? CLOTH.tee : CLOTH.bright, random); look.bottom = pick(CLOTH.shorts, random); wear(KIT.shortSleeves, KIT.shorts); if (chance(.15)) wear(KIT.cap); if (chance(.2)) wear(KIT.bag); break;
    case 'athletic': look.top = pick(CLOTH.bright, random); look.bottom = pick(CLOTH.dark, random); wear(KIT.shortSleeves); if (chance(.7)) wear(KIT.shorts); if (chance(.3)) wear(KIT.cap); look.pace += .9; break;
    case 'evening': look.top = pick(CLOTH.dark, random); look.bottom = pick(chance(.7) ? CLOTH.dark : CLOTH.jeans, random); if (chance(.5)) wear(KIT.shortSleeves); if (chance(.3)) wear(KIT.shorts); if (chance(.25)) wear(KIT.bag); break;
    case 'visitor': { const shorts = chance(.6); look.top = pick(CLOTH.bright, random); look.bottom = pick(shorts ? CLOTH.shorts : CLOTH.jeans, random); wear(KIT.shortSleeves); if (shorts) wear(KIT.shorts); if (chance(.55)) wear(KIT.backpack); if (chance(.35)) wear(KIT.cap); look.pace -= .25; break; }
    case 'worker': if (chance(.6)) { look.top = pick(CLOTH.vest, random); look.bottom = pick(CLOTH.jeans, random); wear(KIT.cap); } else { look.top = pick(CLOTH.scrubs, random); look.bottom = look.top; wear(KIT.shortSleeves); } break;
    default: look.top = pick(CLOTH.tee, random); look.bottom = pick(CLOTH.jeans, random); if (chance(.7)) wear(KIT.shortSleeves); if (chance(.18)) wear(KIT.backpack); if (chance(.15)) wear(KIT.bag); if (chance(.1)) wear(KIT.cap);
  }
  const woman = fixedMember == null ? chance(.5) : memberInfo(fixedMember).woman;
  if (woman) wear(KIT.woman);
  look.member = fixedMember ?? memberFor(random, tones, outfit, woman);
  look.height = roughHeight(look.member, random);
  look.voiceKey = look.member + '/' + Math.round(look.height * 1e9);
  // Which of their outfits they are in today follows the street (human-cast.js).
  look.variant = chooseVariant(look.member, random, style);
  const clothes=clothesFor(look.member, look.variant);
  if(clothes?.topColour && ['casual','visitor','athletic','summer'].includes(outfit)){
    look.top=parseInt(clothes.topColour.slice(1),16);
    if(clothes.bottomColour)look.bottom=parseInt(clothes.bottomColour.slice(1),16);
  }
  return look;
}
/** Which of the cast a look is drawn as: its own, or for a look made elsewhere one that suits it, the same each time. */
export function memberOf(look) {
  if (Number.isInteger(look.member) && look.member >= 0 && look.member < MEMBERS) return look.member;
  const random = seeded(look.top ^ (look.bottom * 7) ^ (look.hair * 13));
  const member = memberFor(random,null,look.outfit,Boolean(look.kit & KIT.woman));
  return look.member = member % KINDS < 3 ? member - member % KINDS + 3 : member;
}

/** The figure a look is drawn from: who they are, and which of their outfits they have on. */
export const figureOf = look => memberOf(look) + (look.variant || 0) * VARIANT_STEP;
/** Draw an outfit from shares such as citylife's wardrobe(). */
export function chooseOutfit(shares, random = Math.random) {
  let roll = random();
  for (const outfit of OUTFITS) { roll -= shares[outfit] || 0; if (roll <= 0) return outfit; }
  return 'casual';
}

// --- The figure -----------------------------------------------------------------------
const HIP = .93, SHOULDER = 1.42;
/**
 * One low figure, facing +Z with its feet at the origin, about 1.72 m tall.
 * `aBody` says for each vertex what it is painted as, which limb swings it,
 * which piece of kit it belongs to, and whether it is bare below a short
 * sleeve or the hem of a pair of shorts.
 */
export function personGeometry() {
  const position = [], normal = [], body = [];
  const emit = (p, n, tag) => { position.push(p[0], p[1], p[2]); normal.push(n[0], n[1], n[2]); body.push(tag[0], tag[1], tag[2], tag[3]); };
  // A tube round the Y axis through rings of [radius, y], flattened front to back.
  const tube = (rings, sides, cx, cz, depth, tag, tags = null) => {
    for (let r = 0; r + 1 < rings.length; r++) for (let s = 0; s < sides; s++) {
      const corner = (ring, side) => { const a = side / sides * TAU, [radius, y] = rings[ring]; return { p: [cx + Math.sin(a) * radius, y, cz + Math.cos(a) * radius * depth], n: [Math.sin(a), 0, Math.cos(a)] }; };
      const a = corner(r, s), b = corner(r + 1, s), c = corner(r + 1, s + 1), d = corner(r, s + 1), use = tags ? tags[r] : tag;
      for (const v of [a, d, c, a, c, b]) emit(v.p, v.n, use);
    }
    // Close the top so nothing is seen down a collar or a cuff.
    const [radius, y] = rings.at(-1);
    for (let s = 0; s < sides; s++) {
      const a0 = s / sides * TAU, a1 = (s + 1) / sides * TAU;
      for (const p of [[cx, y, cz], [cx + Math.sin(a0) * radius, y, cz + Math.cos(a0) * radius * depth], [cx + Math.sin(a1) * radius, y, cz + Math.cos(a1) * radius * depth]]) emit(p, [0, 1, 0], tags ? tags.at(-1) : tag);
    }
  };
  const ball = (radius, cx, cy, cz, sx, sy, sz, tag, from = 0, to = 1) => {
    const rows = 5, sides = 8;
    for (let r = 0; r < rows; r++) for (let s = 0; s < sides; s++) {
      const corner = (row, side) => { const v = (from + (to - from) * row / rows) * Math.PI, a = side / sides * TAU, n = [Math.sin(v) * Math.sin(a), Math.cos(v), Math.sin(v) * Math.cos(a)]; return { p: [cx + n[0] * radius * sx, cy + n[1] * radius * sy, cz + n[2] * radius * sz], n }; };
      const a = corner(r, s), b = corner(r + 1, s), c = corner(r + 1, s + 1), d = corner(r, s + 1);
      for (const v of [a, b, c, a, c, d]) emit(v.p, v.n, tag);
    }
  };
  const block = (x, y, z, w, h, d, tag) => {
    const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    for (const [n, u, v] of faces) {
      const corner = (a, b) => [x + (n[0] + u[0] * a + v[0] * b) * w / 2, y + (n[1] + u[1] * a + v[1] * b) * h / 2, z + (n[2] + u[2] * a + v[2] * b) * d / 2];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) emit(corner(a, b), n, tag);
    }
  };
  const SKIN_ = 0, TOP = 1, BOTTOM = 2, HAIR_ = 3, SHOE = 4, KITS = 5;
  // Torso, neck, head and hair.
  tube([[.115, HIP - .03], [.15, 1.08], [.172, 1.36], [.13, 1.47]], 8, 0, 0, .62, [TOP, 0, 0, 0]);
  tube([[.05, 1.46], [.046, 1.55]], 6, 0, 0, 1, [SKIN_, 0, 0, 0]);
  ball(.105, 0, 1.635, .005, .92, 1.08, 1, [SKIN_, 0, 0, 0]);
  ball(.112, 0, 1.652, -.012, .95, 1.04, 1.02, [HAIR_, 0, 0, 0], 0, .52);
  // Long hair falls to the shoulders behind.
  tube([[.085, 1.42], [.105, 1.6]], 6, 0, -.05, .55, [HAIR_, 0, 4, 0]);
  // Cap: a brim over the eyes.
  block(0, 1.7, .1, .15, .016, .13, [KITS, 0, 3, 0]);
  // Keep the uniform readable while the dressed figure is being built.
  tube([[.10,1.689],[.119,1.741],[.104,1.764]], 10, 0, 0, 1.04, [TOP,0,8,0]);
  tube([[.145,1.013],[.148,1.052]], 10, 0, 0, .70, [KITS,0,8,0]);
  block(.079,1.366,.091,.036,.044,.012,[6,0,8,0]);
  block(-.143,1.026,.034,.044,.085,.047,[KITS,0,8,0]);
  // Backpack on the back; a bag at the hip on a strap.
  block(0, 1.2, -.14, .25, .34, .11, [KITS, 0, 1, 0]);
  block(.19, .98, .02, .07, .2, .26, [KITS, 0, 2, 0]);
  for (const side of [-1, 1]) {
    const leg = side < 0 ? 1 : 2, arm = side < 0 ? 3 : 4, x = side * .085;
    // Thigh and shin, a shoe, and the hem between them that shorts stop at.
    tube([[.058, .5], [.078, HIP]], 6, x, 0, 1, [BOTTOM, leg, 0, 0]);
    tube([[.043, .09], [.058, .5]], 6, x, 0, 1, [BOTTOM, leg, 0, 2]);
    block(x, .045, .035, .085, .09, .24, [SHOE, leg, 0, 0]);
    // Upper arm, forearm and hand.
    tube([[.043, 1.13], [.055, SHOULDER]], 6, side * .215, 0, 1, [TOP, arm, 0, 0]);
    tube([[.034, .87], [.043, 1.13]], 6, side * .215, 0, 1, [TOP, arm, 0, 1]);
    ball(.04, side * .215, .83, .005, .85, 1.15, 1, [SKIN_, arm, 0, 0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 4));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The material: paint by part from each instance's colours, and a walk cycle run on the GPU. */
export function createPersonMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86, metalness: 0 });
  material.name = 'People';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec4 aBody;\nattribute vec3 aTop;\nattribute vec3 aBottom;\nattribute vec3 aSkin;\nattribute vec3 aHair;\nattribute vec4 aGait;\nvarying vec3 vPerson;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	{
		// aGait: where in its stride this person is, how much it is striding, how fast, and its kit.
		float nycStride = aGait.x + uNycTime * aGait.z, nycSwing = sin( nycStride ) * aGait.y;
		float nycKit = aGait.w;
		bool nycBareArm = mod( floor( nycKit / 16.0 ), 2.0 ) > 0.5, nycBareLeg = mod( floor( nycKit / 32.0 ), 2.0 ) > 0.5;
		vPerson = aBody.x < 0.5 ? aSkin : aBody.x < 1.5 ? aTop : aBody.x < 2.5 ? aBottom : aBody.x < 3.5 ? aHair : aBody.x < 4.5 ? vec3( 0.03, 0.03, 0.032 ) : vec3( 0.06, 0.062, 0.07 );
		if ( ( aBody.w > 0.5 && aBody.w < 1.5 && nycBareArm ) || ( aBody.w > 1.5 && nycBareLeg ) ) vPerson = aSkin;
		if ( aBody.x > 5.5 ) vPerson = vec3( .61, .63, .60 );
		// Kit this person does not carry is folded away inside the body.
		if ( aBody.z > 0.5 && mod( floor( nycKit / exp2( aBody.z - 1.0 ) ), 2.0 ) < 0.5 ) transformed = vec3( 0.0, 1.2, 0.0 );
		if ( aGait.y < -0.5 && aGait.y > -1.5 ) {
			vec3 standing = transformed;
			float thigh = ${HIP.toFixed(2)} - 0.50;
			if ( aBody.y > 0.5 && aBody.y < 2.5 ) {
				if ( aBody.w > 1.5 || aBody.x > 3.5 ) transformed.z += thigh;
				else transformed.yz = vec2( 0.50 + transformed.z, ${HIP.toFixed(2)} - transformed.y );
			} else transformed.y -= thigh;
			transformed = mix( standing, transformed, aGait.z );
		}
		// Legs swing from the hip and arms from the shoulder, opposite arm to leg.
		else if ( aBody.y > 0.5 ) {
			bool nycArm = aBody.y > 2.5;
			float nycSide = ( aBody.y < 1.5 || ( aBody.y > 3.5 ) ) ? 1.0 : -1.0, nycPivot = nycArm ? ${SHOULDER.toFixed(2)} : ${HIP.toFixed(2)};
			float nycTurn = nycSwing * nycSide * ( nycArm ? 0.5 : 0.62 ), nycCos, nycSin;
			if (nycArm && aGait.y < -2.5) nycTurn = aGait.y < -3.5 ? -1.35 : -2.8;
			nycCos = cos(nycTurn); nycSin = sin(nycTurn);
			vec2 nycArmYZ = vec2( transformed.y - nycPivot, transformed.z );
			transformed.y = nycPivot + nycArmYZ.x * nycCos - nycArmYZ.y * nycSin;
			transformed.z = nycArmYZ.x * nycSin + nycArmYZ.y * nycCos;
		}
		// The body rises a little at each footfall.
		transformed.y += ( 1.0 - cos( 2.0 * nycStride ) ) * 0.011 * max( aGait.y, 0.0 );
	}`);
    shader.fragmentShader = `varying vec3 vPerson;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPerson;');
  };
  return material;
}

// --- Where they walk ------------------------------------------------------------------
/** The point `s` metres along a run, and the kerb's outward normal there. */
export function along(run, s) {
  const lengths = run.lengths, distance = clamp(s, 0, run.length);
  let i = 0;
  while (i < lengths.length - 2 && lengths[i + 1] < distance) i++;
  const a = run.points[i], b = run.points[i + 1], span = lengths[i + 1] - lengths[i] || 1, t = (distance - lengths[i]) / span;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx: run.normals[i][0], nz: run.normals[i][1], tx: (b[0] - a[0]) / span, tz: (b[1] - a[1]) / span };
}

/**
 * Join stretches of sidewalk into a network. From either end of a run a
 * walker may turn onto a run that starts within a few metres, or cross to one
 * whose end faces it over a roadway, if `isRoad(x, z)` says the middle of the
 * way between is carriageway. Links are found when first asked for.
 */
export function createWalkNetwork(walks, { isRoad = () => true } = {}) {
  const cell = 16, grid = new Map(), ends = [];
  for (const run of walks) for (const end of [0, 1]) {
    const point = run.points[end ? run.points.length - 1 : 0], entry = { run, end, x: point[0], z: point[1] };
    ends.push(entry);
    const key = `${Math.floor(entry.x / cell)},${Math.floor(entry.z / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(entry);
  }
  const links = new Map();
  function linksFrom(run, end) {
    if (run.stair && end) return []; // Rail across the top landing.
    const key = `${run.id}|${end}`;
    if (links.has(key)) return links.get(key);
    const here = along(run, end ? run.length : 0), found = new Map();
    // The way a walker is going on arriving at this end.
    const dx = end ? here.tx : -here.tx, dz = end ? here.tz : -here.tz;
    for (let gx = Math.floor((here.x - 32) / cell); gx <= Math.floor((here.x + 32) / cell); gx++) for (let gz = Math.floor((here.z - 32) / cell); gz <= Math.floor((here.z + 32) / cell); gz++) {
      for (const other of grid.get(`${gx},${gz}`) || []) {
        if (other.run === run || (other.run.stair && other.end)) continue;
        const vx = other.x - here.x, vz = other.z - here.z, d = Math.hypot(vx, vz);
        if (d > 32 || ((run.stair || other.run.stair) && (d>5 || !run.plaza || !other.run.plaza))) continue;
        let kind = null;
        if (d < 7.5) kind = 'turn';
        else {
          // Straight on over the cross street, or square across one's own.
          const ahead = (vx * dx + vz * dz) / d, across = (vx * here.nx + vz * here.nz) / d;
          // Not corner to opposite corner: that is only walked where every light is red.
          if ((ahead > .93 || across > .93) && isRoad(here.x + vx * .5, here.z + vz * .5)) kind = 'cross';
        }
        if (!kind) continue;
        const known = found.get(other.run);
        if (!known || d < known.distance) found.set(other.run, { kind, run: other.run, end: other.end, distance: d, from: [here.x, here.z], to: [other.x, other.z] });
      }
    }
    const list = [...found.values()];
    links.set(key, list);
    return list;
  }
  return { walks, ends, linksFrom };
}

// --- The crowd ---------------------------------------------------------------------------
/**
 * People on the sidewalks around `focus`.
 *
 * `life` is citylife's lookup (crowding and wardrobe); `heightAt(x, z)` the
 * surface a person stands on; `isRoad(x, z)` whether a point is carriageway.
 */
export function createCrowd({ scene = null, life, boroughs = [], heightAt = () => 0, isRoad = () => true, blocked = () => false, capacity = 240, range = 120, random = seeded(20260712) } = {}) {
  let geometry = personGeometry(), material = createPersonMaterial(), figures = null;
  // Two draws: the modelled figures have a man's body and a woman's, and each person is drawn with their own.
  // Until the figures arrive everyone is in the first.
  const INSTANCED = [['aTop', 3], ['aBottom', 3], ['aSkin', 3], ['aHair', 3], ['aGait', 4]];
  const sink = (shape, name) => {
    const mesh = new THREE.InstancedMesh(shape, material, capacity + 160);
    mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    const made = {};
    for (const [attribute, size] of INSTANCED) { const a = new THREE.InstancedBufferAttribute(new Float32Array((capacity + 160) * size), size); a.setUsage(THREE.DynamicDrawUsage); shape.setAttribute(attribute, a); made[attribute] = a; }
    return { mesh, tops: made.aTop, bottoms: made.aBottom, skins: made.aSkin, hairs: made.aHair, gaits: made.aGait, count: 0 };
  };
  let other = geometry.clone();
  const sinks = [sink(geometry, 'People'), sink(other, 'People, the other body')], mesh = sinks[0].mesh;
  mesh.add(sinks[1].mesh);
  scene?.add(mesh);
  const people = [], crossing = [], threats = [], struck = [], bumps = [];
  const neighbours = new PedestrianGrid();
  const residents = createStreetPopulation(boroughs,seeded(20260310)), encountered = new Set(), localRuns = new Map();
  let damage = 0, scares = 0, counterblow = null;
  // Figures that are not of the crowd but are drawn with it: the player, and whoever serves in a shop.
  let extras = [], extraBodies = [];
  let network = null, source = null, balanceTimer = 0, filled = false, lastFocus = null;
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  const fallenPose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  const fallAxis=new THREE.Vector3(),fallTurn=new THREE.Quaternion();
  function tiltFallingFigure(r,height){
    if(!r?.fall || r.forward==null){turn.multiply(fallenPose);place.y+=.24;return;}
    const angle=(r.angle+r.rock)*(1-Math.min(1,r.recover/1.5));
    fallAxis.set(r.forward,0,-r.side).normalize();
    turn.multiply(fallTurn.setFromAxisAngle(fallAxis,angle));
    place.y+=height*.13*Math.sin(angle);
  }

  const bodyBlocked = (person, x, z) => blocked(x, z, person.y, pedestrianRadius(person));
  function pauseOnPlaza(person) {
    person.state='rest';
    person.wait=18+random()*36;
    person.walkSpeed=0;
    const at=along(person.run,person.s);
    // On the red steps, the view is south down Broadway.
    person.heading=person.run.stair ? Math.atan2(-at.tx,-at.tz)+(random()-.5)*.9 : random()*TAU;
  }

  function spawn(run, hours, start = 0, end = run.length, resident = null, refill = false) {
    const draw = resident ? seeded(resident.id+9001) : random;
    const s = start+draw()*(end-start);
    const at = along(run, s);
    // Returning residents keep their cast member across wardrobe and time-of-day changes.
    const fixedMember = resident
      ? memberFor(seeded(resident.id + 9001), life.tones?.(resident.x, resident.z, 12), 'casual')
      : null;
    const look = dress(chooseOutfit(life.wardrobe(at.x, at.z, hours), draw), draw,
      life.tones?.(at.x, at.z, hours), life.style?.(at.x, at.z, hours) ?? .3, fixedMember);
    const person = { run, s, way: random() < .5 ? 1 : -1, lane: clamp(.55 + random() * Math.max(.2, run.depth - .9), .5, Math.max(.55, run.depth - .25)), look,
      state: 'walk', hop: null, wait: 0, bold: random() < .6, phase: random() * TAU, clip: null, time: random() * 3, fade: 0, once: false, y: null, sample: random() * .25, age: 0, shove: [0, 0], x: at.x, z: at.z, heading: 0 };
    const prefersBreak=resident && resident.id%3===0 && run.depth>=2.4;
    for (let attempt = 0; attempt < 12; attempt++) {
      const takingBreak=prefersBreak && attempt<4;
      if(takingBreak)person.lane=run.depth-.45;
      locate(person);
      person.y = heightAt(person.x,person.z);
      const nearby=neighbours.around(person);
      const crowded=refill && nearby.filter(other=>other.state==='wait' || other.state==='rest' ||
        (other.walkSpeed ?? other.speed ?? 0)<.18).length>=4;
      if ((!resident || (Math.hypot(resident.x-person.x,resident.z-person.z)<=60 && resident.contains(person.x,person.z))) &&
          !crowded && hasStandingRoom(person,nearby) && !bodyBlocked(person,person.x,person.z)) {
        if(resident)person.resident=resident;
        if(takingBreak){
          person.state='rest';person.wait=8+draw()*18;person.walkSpeed=0;
          const kerb=along(run,person.s);
          person.heading=Math.atan2(kerb.nx,kerb.nz);
        }
        if(run.plaza && !resident && draw()<.75)pauseOnPlaza(person);
        person.tickX=person.x;person.tickZ=person.z;
        return person;
      }
      person.s = start+draw()*(end-start);
      const inset=Math.min(.5,run.depth/2);
      person.lane=inset+draw()*Math.max(0,run.depth-.35-inset);
    }
    return null;
  }

  function bringInResidents(walks,focus,hours,visible) {
    if(!residents.total)return;
    const nearby=residents.near(focus.x,focus.z,range);
    const here=new Set(nearby.map(p=>p.id));
    for(const id of encountered)if(!here.has(id))encountered.delete(id);
    for(const id of localRuns.keys())if(!here.has(id))localRuns.delete(id);
    for(const person of people)if(person.resident && here.has(person.resident.id))encountered.add(person.resident.id);
    for(const resident of nearby){
      if(people.length>=capacity)break;
      if(encountered.has(resident.id))continue;
      if(!localRuns.has(resident.id)){
        let best=null, distance=60;
        for(const run of walks){
          if(run.length<6)continue;
          const at=projectRun(run,resident.x,resident.z);
          if(at.distance>=distance)continue;
          const point=along(run,at.s);
          if(!resident.contains(point.x-point.nx*.6,point.z-point.nz*.6))continue;
          best={run,s:at.s,point};distance=at.distance;
        }
        localRuns.set(resident.id,best);
      }
      const entry=localRuns.get(resident.id);
      if(!entry || (filled && entry.run.peopled && visible(entry.point)))continue;
      const {run,s}=entry;
      const person=spawn(run,hours,clamp(s-2,1,run.length-1),clamp(s+2,1,run.length-1),resident);
      if(!person || Math.hypot(person.x-focus.x,person.z-focus.z)>range || (filled && run.peopled && visible(person)))continue;
      encountered.add(resident.id);people.push(person);neighbours.put(person);
    }
  }

  /** Signal shown to someone crossing from `from` to `to`, and the junction it belongs to. */
  function signalFor(from, to, junctions, time) {
    const mx = (from[0] + to[0]) / 2, mz = (from[1] + to[1]) / 2, heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
    let nearest = null, best = 30;
    for (const junction of junctions) { const d = Math.hypot(junction.x - mx, junction.z - mz); if (d < best) { best = d; nearest = junction; } }
    if (!nearest || nearest.plan.control !== 'signal') return null;
    // The street being crossed is the one the crossing runs square to.
    let arm = -1, square = 0;
    nearest.arms.forEach((candidate, i) => { const value = Math.abs(Math.sin(candidate.angle - heading)); if (value > square && nearest.plan.groups[i] >= 0) { square = value; arm = i; } });
    return arm < 0 ? null : crossingAspect(nearest.plan, nearest.plan.groups[arm], time).aspect;
  }

  function sidewalkBounds(person,at) {
    const laneAt = (x,z) => (at.x-x)*at.nx + (at.z-z)*at.nz;
    const lane = laneAt(person.x,person.z), run = person.run;
    const min = Math.min(.32,lane), max = Math.max(run.depth-.28,lane);
    const startS = person.s + (person.x-at.x)*at.tx + (person.z-at.z)*at.tz;
    return (x,z) => {
      const depth = laneAt(x,z), s = at.tx*(x-at.x)+at.tz*(z-at.z)+person.s;
      return depth >= min-.001 && depth <= max+.001 && s >= Math.min(0,startS) && s <= Math.max(run.length,startS) && !bodyBlocked(person,x,z);
    };
  }

  const obstacles = [];
  const passages = new WeakMap();
  let walkingTime = 0;
  // Lane depth increases away from the curb. Its sign on the walker's right
  // depends on both the surveyed normal and the direction of travel.
  const rightAcrossSidewalk = (person,at) => Math.sign((at.tz*at.nx-at.tx*at.nz)*person.way);
  function streamLane(person,at) {
    const half = person.run.depth/2;
    const files = Math.max(1,Math.floor(half/.72));
    const index = clamp(Math.floor(person.lane*files/person.run.depth),0,files-1);
    const offset = rightAcrossSidewalk(person,at)>0 ? half : 0;
    return offset+(index+.5)*half/files;
  }
  function passingLane(person,lead,at,others,onWalk) {
    const leadLane=(at.x-lead.x)*at.nx+(at.z-lead.z)*at.nz;
    const width=pedestrianRadius(person)+pedestrianRadius(lead)+.16;
    const right=rightAcrossSidewalk(person,at);
    for(const side of [right,-right]){
      const lane=leadLane+side*width;
      if(lane<.32 || lane>person.run.depth-.28)continue;
      const x=lead.x-at.nx*(lane-leadLane),z=lead.z-at.nz*(lane-leadLane);
      // Leave space alongside the leader and for merging back ahead of them.
      const occupied=others.some(p=>p!==lead &&
        Math.abs((p.x-x)*at.nx+(p.z-z)*at.nz)<pedestrianRadius(person)+pedestrianRadius(p)+.15 &&
        Math.abs((p.x-x)*at.tx+(p.z-z)*at.tz)<2.6);
      if(!occupied && onWalk(x,z))return lane;
    }
    return null;
  }

  // A gap just one body wide needs space for people coming out as well as
  // those going in. Register the obstructed stretch only when two files meet.
  function registerPassage(person, sectionS, wallLane, firstLane, lastLane, others) {
    const run=person.run;
    if(lastLane-firstLane>=2*pedestrianRadius(person)+.12 ||
        !others.some(p=>p.run===run && p.state==='walk' && p.way!==person.way))return;
    let gates=passages.get(run);
    if(!gates)passages.set(run,gates=[]);
    const gate=gates.find(g=>sectionS>=g.start-.5 && sectionS<=g.end+.5);
    if(gate){gate.probed=walkingTime;return;}
    const edge=way=>{
      let s=sectionS;
      for(let n=0;n<20;n++){
        const next=clamp(s+way*.4,0,run.length), p=along(run,next);
        if(next===s || !bodyBlocked(person,p.x-p.nx*wallLane,p.z-p.nz*wallLane))break;
        s=next;
      }
      return s;
    };
    gates.push({start:edge(-1),end:edge(1),lane:(firstLane+lastLane)/2,firstLane,lastLane,
      way:person.way,users:new Set(),probed:walkingTime,waitingSince:null,lastWait:-Infinity});
  }

  function passageFor(person,depth) {
    const gates=passages.get(person.run);
    if(!gates)return null;
    for(let i=gates.length-1;i>=0;i--){
      const gate=gates[i];
      if(walkingTime-gate.probed>6 && !gate.users.size){gates.splice(i,1);continue;}
      const exit=p=>p.way===1 ? gate.end : gate.start;
      if(gate.updatedAt!==walkingTime){
        gate.updatedAt=walkingTime;
        for(const traveller of gate.users){
          const beyond=traveller.way*(traveller.s-exit(traveller));
          // The last traveller must clear the waiting line before it can
          // reverse into the opening. Otherwise both files meet at its outlet.
          const left=traveller.state!=='walk' || traveller.run!==person.run || traveller.way!==gate.way || !people.includes(traveller);
          if(left || beyond>11){gate.users.delete(traveller);continue;}
          if(beyond<=1.5)continue;
          const waitingLine=people.some(other=>{
            const ahead=(other.s-traveller.s)*traveller.way;
            return other.state==='walk' && other.run===traveller.run && other.way!==traveller.way && ahead>-.8 && ahead<4.5;
          });
          if(!waitingLine)gate.users.delete(traveller);
        }
      }
      const throughLane=depth>=gate.firstLane-.01 && depth<=gate.lastLane+.01 ? depth : gate.lane;
      if(gate.users.has(person))return {lane:throughLane};
      const entry=person.way===1 ? gate.start : gate.end;
      if(person.way*(entry-person.s)>7 || person.way*(person.s-exit(person))>0)continue;
      if(!gate.users.size && (gate.waitingSince!==null || walkingTime-gate.lastWait>.6)){
        gate.way=gate.waitingSince!==null ? -gate.way : person.way;
        gate.waitingSince=null;gate.lastWait=walkingTime;
      }
      if(person.way===gate.way && (gate.waitingSince===null || walkingTime-gate.waitingSince<2)){
        gate.users.add(person);return {lane:throughLane};
      }
      if(person.way!==gate.way){gate.waitingSince??=walkingTime;gate.lastWait=walkingTime;}
      // Stand on the obstructed side of the pavement, before its entrance.
      // A person already in the throat backs out before changing lanes.
      const stop=clamp(entry-person.way*1.25,0,person.run.length);
      const waitingS=person.way*(person.s-stop)>0 ? stop : person.s;
      const side=gate.lane>person.run.depth/2 ? -1 : 1;
      const clearLane=clamp(gate.lane+side*1.05,.32,person.run.depth-.28);
      const waitingLane=side<0 ? Math.min(clearLane,depth) : Math.max(clearLane,depth);
      return {lane:person.way*(person.s-entry)>.1 ? gate.lane : waitingLane,waitingS};
    }
    return null;
  }

  // Probe the walking line ahead, then search the sidewalk width at an obstruction.
  // Hold the detour past the obstruction so the rest of the file can follow.
  function routePastObstacle(person,preferred,at,others) {
    const {run,s,way}=person;
    let detour=person.detour;
    if(detour && (detour.run!==run || detour.way!==way))detour=person.detour=null;
    if(detour && way*(detour.end-s)>0)return detour;
    if(person.age<(person.probeAt ?? (person.phase||0)*.45/TAU))return detour;
    person.probeAt=person.age+.45;
    const occupied=(p,lane)=>bodyBlocked(person,p.x-p.nx*lane,p.z-p.nz*lane);
    const depth=(at.x-person.x)*at.nx+(at.z-person.z)*at.nz;
    const slowing=person.forwardPace<person.look.pace*.75;
    for(const advance of detour || slowing ? [0,.35,.7,1.05,1.4] : [1.4]){
      const ahead=clamp(s+way*advance,0,run.length);
      const section=along(run,ahead);
      if(!occupied(section,preferred) && (detour || !occupied(section,depth)))continue;
      const min=Math.min(.32,run.depth/2), max=Math.max(min,run.depth-.28);
      const slots=Math.max(1,Math.ceil((max-min)/.3));
      let best=null, distance=Infinity, firstLane=Infinity,lastLane=-Infinity;
      for(let n=0;n<=slots;n++){
        const lane=min+n*(max-min)/slots;
        if(occupied(section,lane))continue;
        firstLane=Math.min(firstLane,lane);lastLane=lane;
        if(occupied(at,lane))continue;
        const d=Math.abs(depth-lane);
        if(d<distance){best=lane;distance=d;}
      }
      if(best!==null){
        registerPassage(person,ahead,occupied(section,preferred) ? preferred : depth,firstLane,lastLane,others);
        return person.detour={run,way,lane:best,end:ahead+way*.9};
      }
      if(firstLane===Infinity && advance>0){
        person.way=-way;person.pass=null;person.detour=null;
        person.steerX=person.steerZ=0;
        return null;
      }
    }
    person.detour=null;
    return null;
  }

  function walkSidewalk(person,at,others,onWalk,dt) {
    const {run,way,look}=person, fx=at.tx*way,fz=at.tz*way, radius=pedestrianRadius(person);
    if(run.depth>=1.5 && others.some(p=>p.run===run && p.state==='walk' && p.way!==way &&
        (p.x-person.x)*fx+(p.z-person.z)*fz>-.8)){
      person.keepRightUntil=person.age+3;
    }
    const keepRight=person.age<person.keepRightUntil;
    const laneDepth=(at.x-person.x)*at.nx+(at.z-person.z)*at.nz;
    const preferred=keepRight ? streamLane(person,at) : person.lane;
    let pass=person.pass;
    if(pass && (keepRight || pass.lead.state!=='walk' || pass.lead.run!==run || pass.lead.way!==way || !others.includes(pass.lead) ||
        (pass.lead.x-person.x)*fx+(pass.lead.z-person.z)*fz < -1.1))pass=person.pass=null;
    let pace=look.pace, lead=null, nearest=Infinity;
    obstacles.length=0;
    for(const p of others){
      if(p.run!==run || p.way!==way || (p.state!=='walk' && p.state!=='wait')){
        obstacles.push(p);
        continue;
      }
      const dx=(p.tickX??p.x)-person.x,dz=(p.tickZ??p.z)-person.z, ahead=dx*fx+dz*fz;
      const side=Math.abs(dx*fz-dz*fx), gap=radius+pedestrianRadius(p)+.025;
      // When two files merge, the walker already in the destination file has
      // priority. The other drops in behind instead of pushing sideways.
      const otherLane=laneDepth-dx*at.nx-dz*at.nz;
      // At a bottleneck the walker already in the opening can go first,
      // even if someone waiting beside them is a few centimetres ahead.
      if(person.detour && p.detour && side>gap*.55 &&
          Math.abs(otherLane-person.detour.lane)>Math.abs(laneDepth-person.detour.lane)+.15)continue;
      const merging=keepRight && side<1.8 && streamLane(p,at)===preferred;
      if(ahead>2.5 || (!merging && side>=gap+.06))continue;
      if(Math.abs(ahead)<.1 && merging){
        if(Math.abs(otherLane-preferred)>=Math.abs(laneDepth-preferred))continue;
      }else if(ahead<=0)continue;
      const space=ahead-(merging ? gap : Math.sqrt(Math.max(0,gap*gap-side*side)));
      const speed=p.state==='wait' ? 0 : p.tickPace ?? p.look.pace;
      // Match the moving leader at a short headway. Extra room lets the
      // follower close the gap, including when the front of a queue restarts.
      if(p!==pass?.lead)pace=Math.min(pace,Math.max(0,.7*speed+2.2*(space-.05)));
      if(ahead<nearest){lead=p;nearest=ahead;}
    }
    if(!keepRight && !pass && lead?.state==='walk' && look.pace>lead.look.pace+.38 && nearest<1.9 &&
        Math.min(person.s,run.length-person.s)>4 && person.age>=(person.checkPassAt||0)){
      const lane=passingLane(person,lead,at,others,onWalk);
      if(lane!==null)pass=person.pass={lead,lane};
      person.checkPassAt=person.age+.5;
    }
    if(pass)obstacles.push(pass.lead);
    const detour=routePastObstacle(person,pass?.lane ?? preferred,at,others);
    if(person.way!==way)return false;
    const passage=passageFor(person,laneDepth);
    if(passage){
      const forward=Math.abs(passage.lane-laneDepth)>.12 ? .06 : 1.55;
      const target=along(run,passage.waitingS ?? person.s+way*forward);
      walkTowards(person,target.x-target.nx*passage.lane,target.z-target.nz*passage.lane,look.pace*dt,others,onWalk,others,dt);
      person.forwardPace=clamp(((person.x-person.tickX)*fx+(person.z-person.tickZ)*fz)/dt,0,look.pace);
      return passage.waitingS!==undefined;
    }
    const lane=detour?.lane ?? pass?.lane ?? preferred;
    // Even a stopped file can ease sideways into a gap. Limit longitudinal
    // speed independently so a merge does not require walking into the leader.
    const merging=(keepRight || detour) && Math.abs(lane-laneDepth)>.06;
    const wanted=(merging ? Math.min(look.pace,Math.hypot(pace,lane-laneDepth)) : pace)*dt;
    const sight=detour && merging ? .04 : merging ? Math.max(.015,pace) : 1.55;
    const goal=along(run,person.s+way*Math.max(sight,wanted));
    const hazards=obstacles.length===others.length ? others : obstacles;
    walkTowards(person,goal.x-goal.nx*lane,goal.z-goal.nz*lane,wanted,others,onWalk,hazards,dt);
    person.forwardPace=clamp(((person.x-person.tickX)*fx+(person.z-person.tickZ)*fz)/dt,0,look.pace);
    return Boolean(lead && pace<.12 && !detour);
  }

  function onSidewalk(person,x,z) {
    const run=person.run, {s}=projectRun(run,x,z), at=along(run,s);
    const depth=(at.x-x)*at.nx+(at.z-z)*at.nz;
    const alongRun=(x-at.x)*at.tx+(z-at.z)*at.tz+s;
    return alongRun>=.015 && alongRun<=run.length-.015 && depth>=Math.min(.32,run.depth/2) &&
      depth<=Math.max(run.depth/2,run.depth-.28) && !bodyBlocked(person,x,z);
  }

  function watchSidewalkProgress(person,others,yielding) {
    const check=person.walkCheck;
    if(yielding || person.look.pace<.2){person.walkCheck=null;return;}
    // Count distance from a fixed point, so quick shuffles do not reset it.
    if(!check || Math.hypot(person.x-check.x,person.z-check.z)>.65){
      person.walkCheck={x:person.x,z:person.z,until:person.age+1.7+(person.phase||0)% .35};
      return;
    }
    if(person.age<check.until)return;
    const {run,s,way}=person, lane=clamp(person.lane,.32,Math.max(.32,run.depth-.28));
    const stationary=others.filter(p=>(p.walkSpeed ?? p.speed ?? 0)<.18);
    const probe={x:0,y:person.y,z:0,look:person.look};
    const blocked=(x,z)=>{
      probe.x=x;probe.z=z;
      return !onSidewalk(person,x,z) || !hasStandingRoom(probe,stationary);
    };
    const routeTo=offset=>{
      const at=along(run,s+way*offset);
      return localWalkRoute(person,{x:at.x-at.nx*lane,z:at.z-at.nz*lane},blocked,.55,16);
    };
    const forward=Math.min(6,way>0?run.length-s:s);
    let path=routeTo(forward), last=path.at(-1);
    if(!last || (projectRun(run,last.x,last.z).s-s)*way<Math.min(1.75,forward*.7)){
      path=routeTo(-3);
      if(path.length)person.way=-way;
    }
    person.detour=null;person.pass=null;person.walkCheck=null;
    person.steerX=person.steerZ=0;
    person.walkRecovery={run,path,until:person.age+(path.length?1.25:.9)};
  }

  function followSidewalkRecovery(person,others,dt) {
    const route=person.walkRecovery;
    if(!route)return false;
    if(route.run!==person.run || person.age>=route.until){person.walkRecovery=null;return false;}
    const next=route.path[0];
    if(!next)return true;
    const before=Math.hypot(next.x-person.x,next.z-person.z);
    walkTowards(person,next.x,next.z,person.look.pace*dt,others,(x,z)=>onSidewalk(person,x,z),others,dt);
    const gap=Math.hypot(next.x-person.x,next.z-person.z);
    if(before-gap>.12*dt)route.until=person.age+1.25;
    if(gap<.14){
      route.path.shift();
      if(!route.path.length)person.walkRecovery=null;
    }
    const previousS=person.s;
    person.s=projectRun(person.run,person.x,person.z).s;
    person.forwardPace=Math.max(0,(person.s-previousS)*person.way/dt);
    return true;
  }

  function followCorner(person, turn) {
    person.run=turn.run;
    person.s=turn.end?turn.run.length:0;
    person.way=turn.end?-1:1;
    person.lane=clamp(person.lane,.5,Math.max(.55,turn.run.depth-.25));
  }

  function crossingLanding(person, hop, offset=0) {
    const inset=Math.min(.8+offset,hop.run.length*.3), s=hop.end?hop.run.length-inset:inset;
    const lane=clamp(person.lane,.5,Math.max(.55,hop.run.depth-.25)), end=along(hop.run,s);
    return {s,lane,x:end.x-end.nx*lane,z:end.z-end.nz*lane};
  }

  function freeCurbSpot(person, stop, others, onWalk) {
    const run=person.run, s=projectRun(run,stop.x,stop.z).s, at=along(run,s);
    const depth=(at.x-stop.x)*at.nx+(at.z-stop.z)*at.nz;
    const goal=crossingLanding(person,person.hop);
    const open=(x,z)=>{
      const gap=Math.max(.001,Math.hypot(goal.x-x,goal.z-z)), dx=(goal.x-x)/gap, dz=(goal.z-z)/gap;
      return onWalk(x,z) && hasStandingRoom({x,y:person.y,z,look:person.look},others) &&
        clearTravel(person,dx,dz,.55,others,x,z)>=.53 && !bodyBlocked(person,x+.55*dx,z+.55*dz);
    };
    for(const shift of [0,.85,-.85,1.7])for(const offset of CURB_OFFSETS){
      const curb=along(run,s+offset), lane=clamp(depth+shift,.32,Math.max(.32,run.depth-.28));
      const x=curb.x-curb.nx*lane, z=curb.z-curb.nz*lane;
      if(open(x,z))return {x,z};
    }
    return null;
  }

  function usableLanding(person, others, cars, avoid=null) {
    for(const offset of [0,.85,1.7,2.55]){
      const landing=crossingLanding(person,person.hop,offset), {x,z}=landing;
      if(avoid && Math.hypot(x-avoid.x,z-avoid.z)<.15)continue;
      const gap=Math.max(.001,Math.hypot(x-person.x,z-person.z));
      const dx=(x-person.x)/gap, dz=(z-person.z)/gap, reach=Math.min(.55,gap);
      if(clearTravel(person,dx,dz,reach,others)<reach-.02 ||
          bodyBlocked(person,person.x+dx*reach,person.z+dz*reach) || bodyBlocked(person,x,z) ||
          !hasStandingRoom({x,y:person.y,z,look:person.look},others) || crossingObstructed(person,x,z,cars))continue;
      return landing;
    }
    return null;
  }

  function crossingSideStep(person, others, cars) {
    const {from,to,distance}=person.hop;
    const dx=(from[1]-to[1])/distance, dz=(to[0]-from[0])/distance;
    for(const side of [1,-1]){
      const x=person.x+dx*side, z=person.z+dz*side;
      if(clearTravel(person,dx*side,dz*side,1,others)<.96 || bodyBlocked(person,x,z) ||
          bodyBlocked(person,(person.x+x)*.5,(person.z+z)*.5) || crossingObstructed(person,x,z,cars))continue;
      return {x,z};
    }
    return null;
  }

  function reconsiderCrossing(person) {
    // Give the crossing several seconds of usable opportunities before leaving.
    person.crossingPatience ??= 8+random()*3;
    person.crossingPatience-=CROSSING_RECHECK;
    if(person.crossingPatience>0)return;
    const run=person.run;
    const turn=network.linksFrom(run,person.way>0?1:0).find(link=>{
      if(link.kind!=='turn')return false;
      const {x,z}=crossingLanding(person,link);
      return Math.hypot(x-person.x,z-person.z)<5 && !bodyBlocked(person,x,z) &&
        !bodyBlocked(person,(x+person.x)*.5,(z+person.z)*.5);
    });
    if(turn)followCorner(person,turn);
    else person.way=-person.way;
    person.s=projectRun(person.run,person.x,person.z).s;
    person.state='walk';person.hop=null;person.queuePoint=null;person.curbSpot=null;person.crossingPatience=null;
  }

  function chooseCornerLink(person, end) {
    const options=network.linksFrom(person.run,end).map(link=>{
      const [x,z]=link.to;
      const nearby=neighbours.around({x,z,y:person.y},4.5,[]);
      let arrivals=0;
      for(const other of people){
        if(other!==person && other.hop?.run===link.run && other.hop.end===link.end &&
            (other.state==='wait' || other.state==='cross'))arrivals++;
      }
      for(const other of nearby){
        if(other===person || other.hop?.run===link.run && other.hop.end===link.end)continue;
        if(other.run===link.run || (other.walkSpeed ?? other.speed ?? 0)<.18)arrivals+=other.state==='walk'?.4:1;
      }
      const load=arrivals/Math.max(2,Math.floor(link.run.depth/.9)+1);
      return {link,load,weight:(link.kind==='turn'?1.3:1)/(1+load*load*2)};
    });
    const open=options.filter(option=>option.load<1.15);
    const available=open.length?open:options;
    const returnWeight=open.length || !options.length ? .12 : 1.25;
    let total=returnWeight;
    for(const option of available)total+=option.weight;
    let roll=random()*total;
    for(const option of available){roll-=option.weight;if(roll<=0)return option.link;}
    return null;
  }

  function step(person, dt, context, others) {
    const { junctions = [], cars = [], time } = context;
    if (!dt) return;
    person.age += dt;
    const run = person.run, at = along(run,person.s);
    const onWalk = sidewalkBounds(person,at);
    recoverStandingRoom(person,others,person.state==='cross' ? (x,z)=>!bodyBlocked(person,x,z) : onWalk);
    if(person.state==='rest'){
      person.wait-=dt;
      if(person.wait<=0)person.state='walk';
      return;
    }
    if (person.state === 'walk') {
      if(run.plaza){
        person.untilPlazaStop=(person.untilPlazaStop ?? (6+random()*12))-dt;
        if(person.untilPlazaStop<=0){person.untilPlazaStop=null;pauseOnPlaza(person);return;}
      }
      const previousS=person.s;
      if(followSidewalkRecovery(person,others,dt))return;
      const yielding=walkSidewalk(person,at,others,onWalk,dt);
      person.s = projectRun(run,person.x,person.z).s;
      // If the pavement is too narrow for an oncoming pair, one gives way.
      // Use their direction along the same curb so they don't both turn back.
      if(run.depth<1.5 && person.way<0 && (previousS-person.s)<person.look.pace*dt*.15 &&
          others.some(p=>p.run===run && p.state==='walk' && p.way>0 && p.s<person.s &&
            Math.hypot(p.x-person.x,p.z-person.z)<1.15)){
        person.yieldTime=(person.yieldTime||0)+dt;
        if(person.yieldTime>1.4){person.way=1;person.yieldTime=0;return;}
      }else person.yieldTime=0;
      if ((person.way > 0 ? run.length-person.s : person.s) > .035) {
        watchSidewalkProgress(person,others,yielding);
        return;
      }
      person.walkCheck=null;
      // The end of the block: turn the corner, cross, or go back the way they came.
      const end = person.way > 0 ? 1 : 0;
      person.s = clamp(person.s, 0, person.run.length);
      const choice=chooseCornerLink(person,end);
      if (!choice) { person.way = -person.way; return; }
      if (choice.kind === 'turn') { followCorner(person,choice); return; }
      person.state = 'wait'; person.hop = choice; person.wait = random() * .4;
      person.crossingPatience=null;person.curbSpot=null;person.landing=null;
      person.heading = Math.atan2(choice.to[0]-choice.from[0], choice.to[1]-choice.from[1]);
      const across = Math.abs(at.nx*Math.sin(person.heading)+at.nz*Math.cos(person.heading)) > .7;
      const inset = Math.min(run.length*.3,across ? .55 + person.lane*.6 : .35);
      const kerb = along(run,end ? run.length-inset : inset), depth = across ? .35 : person.lane;
      person.queuePoint = {x:kerb.x-kerb.nx*depth,z:kerb.z-kerb.nz*depth};
      return;
    }
    if (person.state === 'wait') {
      const stop = person.queuePoint;
      person.wait -= dt;
      const recheck=person.wait<=0;
      if(recheck)person.wait+=CROSSING_RECHECK;
      let atKerb=true;
      if (stop) {
        const close=Math.hypot(stop.x-person.x,stop.z-person.z)<3;
        if(recheck && close)person.curbSpot=freeCurbSpot(person,stop,others,onWalk);
        const spot=person.curbSpot || stop;
        atKerb=Math.hypot(spot.x-person.x,spot.z-person.z)<.42;
        if(!atKerb && walkTowards(person,spot.x,spot.z,person.look.pace*dt,others,onWalk,others,dt)>0)
          person.s=projectRun(run,person.x,person.z).s;
      }
      if(atKerb)person.steerX=person.steerZ=0;
      if(!recheck)return;
      const hop = person.hop, aspect = signalFor(hop.from, hop.to, junctions, time);
      if (aspect!==null && aspect!=='walk' && !person.bold) return;
      const landing=atKerb && usableLanding(person,others,cars);
      if (!landing) {
        if (aspect===null || aspect==='walk') reconsiderCrossing(person);
        return;
      }
      person.landing=landing;person.crossStall=0;person.crossStep=null;
      person.heading=Math.atan2(landing.x-person.x,landing.z-person.z);
      person.queuePoint=null;person.curbSpot=null;
      person.state = 'cross'; person.progress = 0; person.crossingPatience=null;
      return;
    }
    if (person.state === 'cross') {
      const hop = person.hop;
      // A little quicker than on the sidewalk, as people are with traffic waiting.
      const {s,lane,x,z}=person.landing || crossingLanding(person,hop);
      const goal=person.crossStep || {x,z}, before=Math.hypot(goal.x-person.x,goal.z-person.z);
      walkTowards(person,goal.x,goal.z,person.look.pace*1.15*dt,others,(x,z)=>!bodyBlocked(person,x,z),others,dt);
      const dx = hop.to[0]-hop.from[0], dz = hop.to[1]-hop.from[1];
      person.progress = clamp(((person.x-hop.from[0])*dx+(person.z-hop.from[1])*dz)/(hop.distance*hop.distance),0,1);
      const remaining=Math.hypot(x-person.x,z-person.z);
      // Rejoin as soon as there is pavement underfoot. Opposing walkers can
      // reach the same landing side by side without squeezing onto one point.
      let landedS=remaining<=.06?s:null;
      if(landedS===null && remaining<1.4 && person.progress>=.92){
        const projected=projectRun(hop.run,person.x,person.z), at=along(hop.run,projected.s);
        const depth=(at.x-person.x)*at.nx+(at.z-person.z)*at.nz;
        const inset=hop.end?hop.run.length-projected.s:projected.s;
        if(inset>=.25 && depth>=.32 && depth<=hop.run.depth-.25)landedS=projected.s;
      }
      if (landedS===null) {
        const gap=person.crossStep?Math.hypot(goal.x-person.x,goal.z-person.z):remaining;
        if(person.crossStep && gap<.14)person.crossStep=null;
        person.crossStall=before-gap>.12*dt?0:(person.crossStall||0)+dt;
        if(person.crossStall>.7){
          const alternate=usableLanding(person,others,cars,{x,z});
          if(alternate)person.landing=alternate;
          person.crossStep=alternate?null:crossingSideStep(person,others,cars);
          person.crossStall=0;
        }
        return;
      }
      person.run = hop.run; person.s = landedS; person.way = hop.end ? -1 : 1; person.state = 'walk'; person.hop = null;
      person.lane=lane;person.landing=null;person.crossStep=null;
    }
  }

  function locate(person) {
    const at = along(person.run, person.s);
    person.x = at.x - at.nx * person.lane; person.z = at.z - at.nz * person.lane;
    person.heading = Math.atan2(at.tx * person.way, at.tz * person.way);
  }

  function projectRun(run, x, z) {
    let distance = Infinity, s = 0;
    for (let i = 0; i + 1 < run.points.length; i++) {
      const a = run.points[i], b = run.points[i+1], dx = b[0]-a[0], dz = b[1]-a[1];
      const t = clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz || 1),0,1);
      const d = Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
      if (d < distance) { distance = d; s = run.lengths[i]+(run.lengths[i+1]-run.lengths[i])*t; }
    }
    return {distance,s};
  }

  // Aim a few metres ahead on the sidewalk, measured from the runner's
  // actual position so a shove never snaps them back onto the kerb.
  function sidewalkHeading(person) {
    const flight = person.robbery;
    if (!person.run) {
      let nearest = 12;
      for (const run of source || []) {
        const {distance,s} = projectRun(run,person.x,person.z);
        if (distance >= nearest) continue;
        const at = along(run,s);
        const way = at.tx*Math.sin(flight.heading)+at.tz*Math.cos(flight.heading) >= 0 ? 1 : -1;
        if ((way > 0 ? run.length-s : s) < .4) continue;
        nearest = distance; person.run = run; person.way = way;
      }
    }
    if (!person.run) return flight.heading;
    const run = person.run, {s} = projectRun(run,person.x,person.z), end = person.way > 0 ? 1 : 0;
    if ((end ? run.length-s : s) < .6) {
      // Take the continuation leading furthest from the original door.
      let onward, best = -Infinity;
      for (const link of network.linksFrom(run,end)) {
        const p = along(link.run,link.end ? link.run.length-4 : 4);
        const score = Math.hypot(p.x-flight.x,p.z-flight.z);
        if (score > best) { best = score; onward = link; }
      }
      person.run = onward?.run || null;
      if (onward) person.way = onward.end ? -1 : 1;
      else return flight.heading;
    }
    const next = person.run === run ? s+person.way*3 : person.way > 0 ? 3 : person.run.length-3;
    const at = along(person.run,next), lane = Math.min(1.2,person.run.depth*.5);
    flight.heading = Math.atan2(at.tx*person.way,at.tz*person.way);
    return Math.atan2(at.x-at.nx*lane-person.x,at.z-at.nz*lane-person.z);
  }

  function runFromShop(person, dt, player, others) {
    if (!dt) return;
    const flight = person.robbery;
    flight.steerIn = (flight.steerIn || 0)-dt;
    if (flight.steerIn <= 0) {
      flight.course = sidewalkHeading(person);
      flight.steerIn = .35;
    }
    const step = 3.8*dt;
    const nearPlayer = player?.mode === 'walk' && trafficAtHeight(player,person.y)
      ? Math.min(.52,Math.hypot(person.x-player.x,person.z-player.z)) : 0;
    const move = angle => {
      const x = person.x+Math.sin(angle)*step, z = person.z+Math.cos(angle)*step;
      if (bodyBlocked(person,x,z) || (nearPlayer && Math.hypot(x-player.x,z-player.z) < nearPlayer) ||
          clearTravel(person,Math.sin(angle),Math.cos(angle),step,others) < step) return false;
      person.x = x; person.z = z; person.heading = angle;
      flight.blocked = false;
      return true;
    };
    // Finish a sidestep before steering back towards the sidewalk centre.
    // Otherwise an obstacle in the middle of the lane can pin a runner to its face.
    flight.detourTime = (flight.detourTime || 0)-dt;
    if (flight.detourTime > 0 && move(flight.detour)) return;
    flight.detourTime = 0;
    if (move(flight.course)) return;
    const side = flight.side || 1;
    for (const offset of [side*.72,-side*.72,side*Math.PI/2,-side*Math.PI/2]) {
      const angle = flight.heading+offset;
      if (!move(angle)) continue;
      flight.detour = angle; flight.detourTime = .55; flight.side = Math.sign(offset);
      return;
    }
    flight.blocked = true;
  }

  function combat(person, dt, player, others) {
    person.stun = Math.max(0, (person.stun || 0) - dt);
    if (!person.shove) person.shove = [0, 0];
    if (person.state === 'down' && !person.reaction) {
      receiveImpulse(person,person.vx||0,person.vz||0,{fall:true,lift:person.liftOff||0,
        rest:person.out ? Infinity : Math.max(.1,(person.down||3)-2.2)});
    }
    if (person.reaction) {
      const r=person.reaction;
      // The blow arrived after the simulation advanced this frame. Show the
      // first recoil at the contact location before carrying momentum forward.
      if (r.justStruck) { dt=0; r.justStruck=false; }
      stepImpulse(person,dt,(actor,x,z)=>{
        if (!bodyBlocked(actor,x,z)) return {x,z};
        if (!bodyBlocked(actor,actor.x,z)) return {x:actor.x,z,hit:{nx:-Math.sign(r.vx),nz:0}};
        if (!bodyBlocked(actor,x,actor.z)) return {x,z:actor.z,hit:{nx:0,nz:-Math.sign(r.vz)}};
        r.vx=r.vz=0;
        return {x:actor.x,z:actor.z};
      },actor=>actor.visit?.view.floor ?? heightAt(actor.x,actor.z,actor.y));
      person.vx=r.vx; person.vz=r.vz;
      person.clip=r.clip; person.time=r.time; person.fade=0; person.once=false;
      if (!person.reaction) {
        if (r.fall) {
          if (person.calm || person.robbery) rejoin(person);
          else { person.state='flee'; person.mad=3; }
          person.hp=3; person.calm=false; person.liftOff=0;
        } else if (person.state==='walk' || person.state==='wait') rejoin(person);
      }
      return;
    }
    if (person.state === 'cower') {
      if (person.held && player && !player.armed) {
        person.state='flee'; person.held=false; person.mad=4; return;
      }
      person.mad = (person.mad || 0) - dt;
      if (player && person.held) person.heading = Math.atan2(player.x-person.x,player.z-person.z);
      if (person.mad <= 0) { person.held=false; rejoin(person); }
      return;
    }
    if (person.state === 'flee' && person.robbery) { runFromShop(person,dt,player,others); return; }
    const threat = person.fireOrigin || player;
    const away = threat ? { x: person.x - threat.x, z: person.z - threat.z } : { x: Math.sin(person.heading || 0), z: Math.cos(person.heading || 0) };
    if (person.state === 'flee') {
      person.mad = (person.mad || 0) - dt;
      const awayAngle=Math.hypot(away.x,away.z)>.01?Math.atan2(away.x,away.z):person.heading;
      // Somebody who has been shot gets away at little more than a walk.
      walkTowards(person,person.x+4*Math.sin(awayAngle),person.z+4*Math.cos(awayAngle),(person.wounded?2.1:3.8)*dt,others,(x,z)=>!bodyBlocked(person,x,z));
      if (person.mad <= 0) { person.fireOrigin = null; rejoin(person); }
      return;
    }
    person.mad = (person.mad || 0) - dt;
    if (!player || person.stun > 0) {
      if (person.mad <= 0) rejoin(person);
      return;
    }
    const dx = player.x - person.x, dz = player.z - person.z, gap = Math.hypot(dx, dz) || 1;
    person.heading = Math.atan2(dx, dz);
    if (person.strikeDue!=null) {
      person.strikeDue-=dt;
      if (person.strikeDue<=0 || person.clip!==person.attackClip) {
        const dodge=player.move?.kind==='dodge' && player.move.t>=.04 && player.move.t<=.28;
        const guarded=player.meleeBlock && dx*Math.sin(player.angle)+dz*Math.cos(player.angle)<-.35*gap;
        if (!dodge && !guarded && person.clip===person.attackClip && gap<=1.2 && player.mode==='walk') {
          damage+=12; counterblow={vx:dx/gap*3.2,vz:dz/gap*3.2,clip:meleeMoves[person.attackClip].reaction};
        }
        person.strikeDue=null;
      }
    }
    if (gap > 1.05) {
      const step = Math.min(gap - 0.9, 3.5 * dt);
      walkTowards(person,player.x,player.z,step,others,(x,z)=>!bodyBlocked(person,x,z));
    } else if (dt > 0 && player.mode === 'walk' && (person.attack || 0) <= 0) {
      person.attack = 0.9;
      person.strikeCounts ??= {hand:Math.floor(random()*handStrikes.length)};
      const clip=nextStrike(person,random()<.25?'kick':handGroup(person.walkSpeed,gap));
      person.attackClip=clip;
      person.strikeDue=clip==='jab'?.38:clip==='cross'?.42:meleeMoves[clip].contact;
      show(person,clip,true);
    } else person.attack = Math.max(0, (person.attack || 0) - dt);
    if (person.mad <= 0) rejoin(person);
  }

  // --- What they are seen doing ---------------------------------------------------------
  /** Change the movement a person is shown in; `once` plays it through before anything else is shown. */
  function show(person, clip, once = false) {
    if (person.clip === clip && !once) return;
    person.from = person.clip; person.fromTime = person.time; person.fade = person.clip ? 1 : 0;
    person.clip = clip; person.time = 0; person.once = once;
  }
  const lengthOf = clip => figures ? figures.seconds(clip) : 1;
  function animate(person, dt) {
    if(person.reaction || person.visit?.task && !person.escape) return;
    person.fade = Math.max(0, (person.fade || 0) - dt * 5.5);
    if (person.once) { person.time += dt; if (person.time < lengthOf(person.clip) - .02) return; person.once = false; }
    const speed = person.gaitSpeed ?? person.walkSpeed ?? person.look.pace;
    let clip = 'walk', rate = speed / (WALK_CLIP_SPEED * strideFactor(castWalkStyle(memberOf(person.look))) * ((person.look.height || 1.76)/1.76));
    if(person.grappled){clip='guard';rate=1;}
    else if (person.airborne) {clip='fall';rate=1;}
    else if (person.state === 'down') { clip = 'lying'; rate = 1; }
    else if (person.robbery?.blocked || (person.escape && !person.escape.path)) { clip = 'cower'; rate = 1; }
    else if (person.state === 'fight') { clip = 'guard'; rate = 1; }
    else if (person.state === 'cower') { clip = person.held ? 'handsUp' : 'cower'; rate = 1; }
    else if (speed < (person.clip==='idle' ? .14 : .07) || person.visit?.wait > 0) { clip = 'idle'; rate = 1; }
    else if (speed > .85 && (person.state === 'flee' || person.visit?.interrupted || person.escape)) { clip = 'jog'; rate = speed / 3; }
    else if (speed > (person.clip==='jog' ? 2.0 : 2.2)) { clip = 'jog'; rate = speed / 3; }
    const keep = person.clip === clip ? person.time : person.clip === 'walk' || person.clip === 'jog' || !person.clip ? person.time : 0;
    if (person.clip !== clip) { show(person, clip); person.time = keep; }
    person.time = (person.time || 0) + dt * rate;
  }
  /** Back to walking where they were going, from wherever they have ended up: they drift back to their side of the sidewalk. */
  function rejoin(person) {
    if (person.robbery) {
      person.state = person.visit ? 'shopping' : 'flee';
      if (person.escape) person.escape.path = null;
      person.robbery.steerIn = 0;
      return;
    }
    const run = person.run || nearestRun(person.x, person.z);
    person.run = run;
    if (!run) { person.gone = true; return; }
    person.s = projectRun(run,person.x,person.z).s; person.state = 'walk'; person.hop = null;
  }

  const nearestRun = (x, z) => { let best = null, near = 60; for (const run of source || []) { const a = run.points[0], d = Math.hypot(a[0] - x, a[1] - z); if (d < near) { near = d; best = run; } } return best; };

  // --- Cars, and people in a hurry ---------------------------------------------------------
  /**
   * What a moving car does to someone: hit at speed they are thrown down, nudged
   * they stagger, and when one bears down on them they start back from it.
   */
  const underWay = [];
  function traffic(person, dt, cars, player) {
    person.scare = Math.max(0, (person.scare || 0) - dt);
    if (person.state === 'down') return;
    for (const car of cars) {
      // Distance first: it is the cheapest question and rules out nearly every car.
      const dx = person.x + person.shove[0] - car.x, dz = person.z + person.shove[1] - car.z;
      if (dx > 30 || dx < -30 || dz > 30 || dz < -30) continue;
      // A car somebody is driving, or one that has got loose, counts whatever it was doing before.
      if (!car.controlled && !(car._loose > 0) && (car._kerb || car.parked)) continue;
      const vx = car.velocityX || Math.sin(car.angle || 0) * (car.speed || 0), vz = car.velocityZ || Math.cos(car.angle || 0) * (car.speed || 0), v = Math.hypot(vx, vz);
      if (v < 1 || !trafficAtHeight(car, person.y)) continue;
      const fx = Math.sin(car.angle || 0), fz = Math.cos(car.angle || 0), along = dx * fx + dz * fz, across = dx * fz - dz * fx, ux = vx / v, uz = vz / v;
      if (Math.abs(along) < 2.55 && Math.abs(across) < 1.2) {
        if ((person.struck || 0) > 0) continue;
        person.struck = 1;
        // Above about thirty miles an hour nobody gets up; below twenty nearly everybody does.
        const dead = v > 3.5 && random() < clamp((v - 8) / 6, 0, 1);
        struck.push({ car, speed: v, player: Boolean(car.controlled), x: person.x, z: person.z, dead, person });
        if (v > 3.5) {
          // Thrown the way the car was going and a little aside; hard enough, and they do not get up.
          person.x += person.shove[0]; person.z += person.shove[1]; person.shove[0] = person.shove[1] = 0;
          person.reaction=null; person.liftOff=Math.min(4.5,v*.21);
          person.state = 'down'; person.hop = null; person.out = dead; person.dead = dead; person.down = 5 + v * .35; person.calm = false; person.mad = 0;
          person.vx = ux * v * .7 + (across > 0 ? fz : -fz) * 1.2; person.vz = uz * v * .7 - (across > 0 ? fx : -fx) * 1.2;
          show(person, 'knocked', true);
        } else {
          receiveImpulse(person,vx*.7+(across>0 ? fz : -fz),vz*.7-(across>0 ? fx : -fx));
          show(person, 'stumble', true);
        }
        continue;
      }
      // Bearing down on them: only a car somebody is driving badly, or one that has got loose, or any car for someone in the roadway.
      if (person.scare > 0 || !(car.controlled || car._loose > 0 || person.state === 'cross')) continue;
      const ahead = dx * ux + dz * uz, aside = dx * uz - dz * ux;
      if (ahead > 0 && ahead < 3 + v * .85 && Math.abs(aside) < (person.state === 'cross' ? 2.2 : 1.5) && v > 3) {
        person.scare = 3;
        person.shove[0] += (aside > 0 ? uz : -uz) * 1.3; person.shove[1] += (aside > 0 ? -ux : ux) * 1.3;
        if (person.state === 'fight') continue;
        show(person, 'flinch', true); scares++;
        if (v > 9 && car.controlled && person.state !== 'cross') { person.x += 0; person.state = 'flee'; person.mad = 2.2; person.hop = null; }
      }
    }
    person.struck = Math.max(0, (person.struck || 0) - dt);
    // Somebody on foot barging into them.
    if (player && player.mode === 'walk' && (person.bumped || 0) <= 0 && person.state !== 'fight' && person.state !== 'down') {
      const dx = person.x + person.shove[0] - player.x, dz = person.z + person.shove[1] - player.z, d = Math.hypot(dx, dz), pace = Math.hypot(player.velocityX || 0, player.velocityZ || 0);
      if (trafficAtHeight(player,person.y) && d < .62 && d > .001 && pace > 1.2 && (dx * (player.velocityX || 0) + dz * (player.velocityZ || 0)) / (d * pace) > .3) {
        person.bumped = 1.4;
        bumps.push({person, pace, hard:pace>6.5});
        if (pace > 6.5) {
          person.calm = person.state !== 'flee' && person.state !== 'cower';
          person.x += person.shove[0]; person.z += person.shove[1]; person.shove[0] = person.shove[1] = 0;
          person.reaction=null; person.liftOff=.65; person.state = 'down'; person.hop = null; person.out = false; person.down = 3;
          person.vx = (player.velocityX || 0) * .45; person.vz = (player.velocityZ || 0) * .45;
          show(person, 'knocked', true);
        }
        else { receiveImpulse(person,dx/d*pace*.65,dz/d*pace*.65); if (pace > 3) show(person, 'stumble', true); }
      }
    }
    person.bumped = Math.max(0, (person.bumped || 0) - dt);
  }

  /** The nearest person still on their feet, within arm's reach of a punch. */
  function closest(x, z, reach = 2.2, available = false) {
    let best = null, bestD = reach;
    for (const person of people) {
      if (person.state === 'down' || (available && !['walk','wait','rest'].includes(person.state))) continue;
      const dist = Math.hypot(person.x - x, person.z - z);
      if (dist < bestD) { best = person; bestD = dist; }
    }
    return best;
  }

  /**
   * Swing from (x, z) facing `angle`. Someone in front takes the hit, stumbles,
   * and swings back. A third clean punch puts them down.
   */
  function strike(x, z, angle, {reach=1.85,power=1,momentum=0,y,bystanders=[],time=0,low=false,clip,target:locked}={}) {
    const waiting=bystanders.filter(actor=>!(actor.absentUntil>time || actor.downUntil>time));
    const candidates=waiting.length ? people.concat(waiting) : people;
    let target=locked===undefined ? inFront(x,z,angle,reach,.2,y,candidates,low)
      : candidates.includes(locked) && !locked.gone && !locked.dead && (low || locked.state!=='down') ? locked : null;
    if(low && target?.state!=='down' && !target?.reaction?.fall) return null;
    if(target && waiting.includes(target)){
      target.leaveBike?.();
      target.absentUntil=time+60;
      target=streetWitness(target);
    }
    return land(target,x,z,power,momentum,clip);
  }
  /** Find the nearest eligible person in reach and in front of the attacker. */
  function inFront(x, z, angle, reach, cone, y, candidates=people, includeDown=false) {
    const fx = Math.sin(angle), fz = Math.cos(angle);
    let best = null, bestD = reach;
    for (const person of candidates) {
      if (person.gone || person.dead || (person.state === 'down' && !includeDown) || Math.abs(y-person.y)>1.3) continue;
      const dx = person.x - x, dz = person.z - z, dist = Math.hypot(dx, dz);
      if (dist > bestD || dist < 0.01 || (person.state==='down' && dist>1.25)) continue;
      if ((dist > .75 || person.state==='down' || includeDown) && (dx * fx + dz * fz) / dist < cone) continue;
      best = person; bestD = dist;
    }
    return best;
  }
  /**
   * A blow lands. Hurt, most people get away from whoever did it and a few
   * square up; out of strength they go down, and a beating that goes on can
   * be the end of them (`person.dead`).
   */
  function land(best, x, z, power, momentum, strikeClip) {
    if (!best) return null;
    if (!best.shove) best.shove = [0, 0];
    best.hp = (best.hp ?? 3) - power;
    best.stun = 0.45;
    best.strikeDue=null;
    best.x+=best.shove[0]; best.z+=best.shove[1]; best.shove=[0,0];
    const dx = best.x - x, dz = best.z - z, dist = Math.hypot(dx, dz) || 1;
    best.sitting=false;
    const force=3.4*power+.65*momentum;
    if (best.state === 'down' || best.reaction?.fall) {
      const lying=!best.reaction || best.reaction.angle>=Math.PI/2;
      const reaction=receiveImpulse(best,dx/dist*2,dz/dist*2,{fall:true,rest:Math.max(1,best.reaction?.rest || 0)});
      if (lying) {reaction.angle=Math.PI/2; reaction.clip='lying';}
      best.calm=false;
    } else if (best.hp <= 0 || momentum>5.5) {
      const dead = best.hp<=0 && random() < (power > 1 ? .22 : .08) - best.hp * .12;
      best.state = 'down'; best.down = 9; best.mad = 0; best.out = dead; best.dead = dead; best.calm = false; best.reaction=null; best.liftOff=.65; best.vx=dx/dist*force; best.vz=dz/dist*force; show(best, 'knocked', true);
    } else {
      // Who stands their ground is settled the first time they are hit: the bold, and not the old or the small.
      if (best.fights === undefined) best.fights = best.bold && (best.look.height || 1.7) > 1.5 && random() < .55;
      if (best.robbery && best.visit) rejoin(best);
      else if (best.fights && !best.robbery) { best.state = 'fight'; best.mad = 8; } else { best.state = 'flee'; best.mad = 5; best.hop = null; }
      const across=(dx*Math.cos(best.heading||0)-dz*Math.sin(best.heading||0))/dist;
      const directional=strikeClip && Math.abs(across)>.38 ? (across>0?'reelRight':'reelLeft') : null;
      const clip=directional ?? meleeMoves[strikeClip]?.reaction ?? (power>1 ? 'stumble' : best.hp===1 ? 'hitChest' : 'hitHead');
      receiveImpulse(best,dx/dist*force,dz/dist*force,{clip}); show(best,clip,true);
    }
    if (strikeClip && best.reaction && !best.reaction.fall) {
      best.reaction.justStruck=true;
      best.reaction.time=best.reaction.poseLead=.045;
    }
    return best;
  }

  /**
   * A bullet lands on somebody. `zone` is where: 'head', 'torso' or 'legs'. One to the head kills. One to the body puts
   * most people down, many of them for good; the rest reel, run hurt and slow, and go down to the next. One to the leg
   * drops them without killing them. Nobody is thrown by a bullet: they fold where they stood. Returns whether they died.
   */
  function hitByShot(person, direction, zone = 'torso') {
    if (!person.shove) person.shove = [0, 0];
    person.x += person.shove[0]; person.z += person.shove[1]; person.shove[0] = person.shove[1] = 0;
    person.wounds = (person.wounds || 0) + 1; person.wounded = true;
    person.hop = null; person.calm = false;
    const down = zone !== 'torso' || person.wounds > 1 || random() < .62;
    if (!down) {
      person.hp = Math.min(person.hp ?? 3, 1); person.stun = .7;
      if (person.robbery && person.visit) rejoin(person);
      else { person.state = 'flee'; person.mad = 14; }
      receiveImpulse(person, direction.x * 1.1, direction.z * 1.1, { clip: 'hitChest' }); show(person, 'hitChest', true);
      return false;
    }
    const dead = zone === 'head' || (zone === 'torso' && random() < .7);
    person.state = 'down'; person.down = dead ? 12 : zone === 'legs' ? 14 : 30; person.mad = 0; person.out = dead; person.dead = dead; person.hp = 0;
    person.reaction = null; person.liftOff = 0;
    const push = zone === 'head' ? .35 : .7;
    person.vx = direction.x * push; person.vz = direction.z * push; show(person, 'knocked', true);
    return dead;
  }

  function walkShoppingDriver(person,dt,time,others) {
    const car=person.driverCar,trip=car.errand;
    if (trip?.person!==person || car.controlled || car.destroyed || !car.parked) {
      person.driverCar=null;rejoin(person);return;
    }
    if (trip.phase==='visiting' || trip.closed || time-trip.leftAt>90) {
      if (trip.phase!=='returning') {
        trip.phase='returning';
        person.driverWaypoint=Math.max(0,person.driverWaypoint-1);
      }
    }
    if (trip.phase==='waiting') return;
    const path=person.driverPath,point=path[person.driverWaypoint];
    walkTowards(person,point.x,point.z,dt*person.look.pace,others,(x,z)=>!blocked(x,z,person.y));
    if (Math.hypot(person.x-point.x,person.z-point.z)>.22) return;
    if (trip.phase==='returning') {
      if (person.driverWaypoint>0) person.driverWaypoint--;
      else {
        trip.phase='boarded';trip.person=null;person.gone=true;
        car.doorOpen=1;car.doorHold=.5;car.doorSide=1;car._wait=1;
      }
    } else if (person.driverWaypoint+1<path.length) person.driverWaypoint++;
    else trip.phase='waiting';
  }

  function streetWitness(actor) {
    const person={x:actor.x,z:actor.z,y:actor.y,heading:actor.heading,look:actor.look,state:'flee',mad:5,
        robbery:actor.robbery,run:actor.robbery ? null : nearestRun(actor.x,actor.z),way:1,lane:.65,s:0,shove:[0,0],age:1,
        phase:actor.phase||0,clip:actor.robbery ? 'jog' : null,time:actor.time||0,sample:0};
    people.push(person);return person;
  }

  return {
    mesh, people, crossing,
    nearbyPeople: person => neighbours.around(person,3,[]),
    get count() { return people.length; },
    /**
     * `context`: walks (the streetscape's list), focus { x, z }, forward [x, z]
     * (the way the camera looks, so that nobody appears in front of it),
     * hours, time (the simulation's clock), junctions, cars, and the player.
     */
    update(dt, context) {
      walkingTime+=dt;
      const { walks = [], focus = { x: 0, z: 0 }, forward = null, hours = 12, player = null } = context;
      if (walks !== source) {
        source = walks; network = createWalkNetwork(walks, { isRoad });
        localRuns.clear();
        // People on stretches that are no longer loaded go with them.
        const kept = new Set(walks);
        for (let i = people.length - 1; i >= 0; i--) if ((people[i].run && !kept.has(people[i].run)) || (people[i].hop && !kept.has(people[i].hop.run))) {
          if (people[i].visit || people[i].robbery) people[i].run = null;
          else {
            if(people[i].resident)encountered.delete(people[i].resident.id);
            people.splice(i, 1);
          }
        }
      }
      // A jump across the city starts a new crowd rather than marching the old one over.
      if (lastFocus && Math.hypot(focus.x - lastFocus.x, focus.z - lastFocus.z) > 150) { people.length = 0; filled = false; encountered.clear();balanceTimer=0; }
      lastFocus = { x: focus.x, z: focus.z };
      neighbours.clear();
      // Read one frame's pace and spacing for the whole file, even if its
      // leader updates last. Each collision sweep still sees the live bodies.
      for (const person of people) if (!person.gone) {
        person.tickX=person.x;person.tickZ=person.z;person.tickPace=person.forwardPace;
        neighbours.put(person);
      }
      for (const body of extraBodies) neighbours.put(body);
      for (const officer of context.officers || []) neighbours.put(officer);
      if (player?.mode === 'walk') neighbours.put(player);
      balanceTimer -= dt;
      if (balanceTimer <= 0 && walks.length) {
        balanceTimer = .35;
        // How many people each stretch should hold, scaled down together if the city asks for more than can be drawn.
        const near = []; let wanted = 0, plazaHeadroom = 0;
        for (const run of walks) {
          const middle = along(run, run.length / 2), d = Math.hypot(middle.x - focus.x, middle.z - focus.z);
          if (d > range) continue;
          // The model is asked afresh every few seconds; the hour does not turn faster than that.
          const weekday=context.weekday ?? 0;
          if (!(run.crowdedAt >= 0) || Math.abs(context.time-run.crowdedAt)>4 ||
              Math.abs(hours-run.crowdedHour)>.25 || weekday!==run.crowdedDay) {
            run.crowded=run.plaza ? plazaVisitorsPerMetre(run,hours,weekday) :
              countedSidewalkDensity(middle,hours,weekday,WALKING_PACE) ?? life.crowding(middle.x,middle.z,hours);
            run.crowdedAt=context.time || 0;run.crowdedHour=hours;run.crowdedDay=weekday;
          }
          const want = run.crowded * run.length;
          // Reserve spare capacity in proportion to how far the plaza is from
          // its peak. Moderately busy hours should still look different.
          if(run.plaza){
            run.peakCrowded ??= plazaVisitorsPerMetre(run,null,weekday);
            plazaHeadroom+=(run.peakCrowded-run.crowded)*run.length;
          }
          near.push({ run, want, middle, d }); wanted += want;
        }
        // What the camera can see close up; with no camera given, nothing is watching.
        const visible = point => Boolean(forward) && (point.x - focus.x) * forward[0] + (point.z - focus.z) * forward[1] > 0 && Math.hypot(point.x - focus.x, point.z - focus.z) < 70;
        bringInResidents(walks,focus,hours,visible);
        const demand = plazaHeadroom>0 ? Math.sqrt(wanted*(wanted+plazaHeadroom)) : wanted;
        const scale = Math.min(1, capacity * .96 / Math.max(demand, 1e-6)), have = new Map();
        for (const person of people) {
          const run=person.state==='cross'?person.hop?.run:person.run;
          have.set(run,(have.get(run)||0)+1);
        }
        for (const { run, want, middle } of near) {
          const lack = want * scale - (have.get(run) || 0);
          if (lack <= 0 || people.length >= capacity) continue;
          // A stretch that has just been loaded is filled at once. After that,
          // people arrive where the camera is not looking.
          const fresh = !filled || !run.peopled;
          if (!fresh && visible(middle) && run.length < 90) continue;
          const arrivals = fresh ? Math.floor(lack + random()) : (random() < lack ? 1 : 0);
          for (let n = 0; n < arrivals && people.length < capacity; n++) {
            const person = fresh ? spawn(run,hours,run.length*n/arrivals,run.length*(n+1)/arrivals) : spawn(run,hours,0,run.length,null,true);
            if (!person || (!fresh && visible(person))) continue;
            people.push(person); neighbours.put(person);
          }
        }
        for (const { run } of near) run.peopled = true;
        // Those who have walked out of range, and those a quieter hour no longer calls for, leave.
        for (let i = people.length - 1; i >= 0; i--) {
          const person = people[i], d = Math.hypot(person.x - focus.x, person.z - focus.z);
          if (person.age > 1 && d > range + 25 && person.state !== 'fight' && person.state !== 'flee' && (person.state !== 'down' || d > range + 70)) { neighbours.remove(person); people.splice(i, 1); }
        }
        if (people.length > wanted * scale + 6) {
          for (let i = people.length - 1, drop = Math.ceil((people.length - wanted * scale) * .1); i >= 0 && drop > 0; i--) {
            const person = people[i];
            if ((person.state === 'walk' || (person.state==='rest' && person.run?.plaza)) && !person.resident && !person.driverCar && !visible(person)) { neighbours.remove(person); people.splice(i, 1); drop--; }
          }
        }
        filled = true;
      }
      crossing.length = 0; sinks[0].count = sinks[1].count = 0;
      damage = 0; counterblow=null; threats.length = 0; struck.length = 0; bumps.length = 0; scares = 0; figures?.begin();
      const gaitEase=1-Math.exp(-dt*12);
      // A car creeping past is stepped back from. One coming fast is another matter: there is no time, and they are hit or they jump (traffic()).
      const pace = player ? Math.hypot(player.velocityX || 0, player.velocityZ || 0) : 0, driving = player && player.mode === 'drive' && pace > 2 && pace < 5.5;
      for (let i = people.length - 1; i >= 0; i--) if (people[i].gone || (people[i].robbery && Math.hypot(people[i].x-focus.x,people[i].z-focus.z) > range+70)) people.splice(i, 1);
      // Cars under way, found once: on a busy street most cars are at the kerb, and every person would look at every one.
      underWay.length = 0;
      for (const car of context.cars || []) {
        if (!car.controlled && !(car._loose > 0) && (car._kerb || car.parked)) continue;
        if (Math.hypot(car.velocityX || Math.sin(car.angle || 0) * (car.speed || 0), car.velocityZ || Math.cos(car.angle || 0) * (car.speed || 0)) >= 1) underWay.push(car);
      }
      for (let i = 0; i < people.length; i++) {
        const person = people[i];
        if (person.y == null) person.y = heightAt(person.x, person.z);
        person.shove ??= [0,0];
        const startX = person.x, startZ = person.z;
        const fromX = startX+person.shove[0], fromZ = startZ+person.shove[1];
        const others = neighbours.around(person,Math.max(person.state==='walk'?4.8:3,dt*(Math.hypot(person.vx||0,person.vz||0)+4)+1));
        if (dt > 0 && !person.visit) traffic(person, dt, underWay, player);
        if (person.visit && !person.robbery && person.state !== 'shopping') { if(person.visit.detach) person.visit.detach();
          else {person.visit.view.occupied?.delete(person.visit.spot);person.visit.view.visitor=null;}
          person.sitting=false; person.seat=null; person.visit=null; }
        const fighting = person.reaction || person.state === 'fight' || person.state === 'down' || person.state === 'flee' || person.state === 'cower';
        if(person.grappled && !person.reaction && person.state!=='down'){
          person.strikeDue=null;
        }else if (person.visit && !fighting) {
          if (person.driverCar?.errand) person.driverCar.errand.phase='visiting';
          person.visit.step(person, dt, context.time, player);
          if (!person.visit && !person.run && !person.robbery && !person.driverCar) { if (nearestRun(person.x, person.z)) rejoin(person); else person.gone = true; }
        }
        else if (fighting) {
          combat(person, dt, player, others);
          if (person.state === 'fight' || person.state === 'down') threats.push({ x: person.x, z: person.z, kind: person.state === 'down' ? 'down' : 'fight' });
        } else {
          if (person.talkingTo && ['walk','rest','wait'].includes(person.state)) {
            const target=person.talkingTo;
            const angle=Math.atan2(target.x-person.x,target.z-person.z);
            person.heading+=Math.atan2(Math.sin(angle-person.heading),Math.cos(angle-person.heading))*(1-Math.exp(-dt*8));
            person.age+=dt;
          } else if (person.driverCar) walkShoppingDriver(person,dt,context.time,others);
          else if (network) step(person, dt, context, others);
          if (person.gone) continue;
        }
        if (person.state === 'cross') crossing.push(person);
        // Step back from a car that is about to brush past.
        if (driving && trafficAtHeight(player, person.y) && !(person.trafficHitUntil > context.time) && person.state !== 'down') {
          const dx = person.x - player.x, dz = person.z - player.z, d = Math.hypot(dx, dz);
          if (d < 3.6 && d > .01) { person.shove[0] = dx / d * (3.6 - d) * .7; person.shove[1] = dz / d * (3.6 - d) * .7; }
        }
        if (person.robbery && !person.visit && (person.shove[0] || person.shove[1]) &&
            bodyBlocked(person,person.x+person.shove[0],person.z+person.shove[1])) person.shove = [0,0];
        person.shove[0] *= Math.exp(-dt * 2.2); person.shove[1] *= Math.exp(-dt * 2.2);
        if (dt && !person.visit && (fighting || fromX !== startX || fromZ !== startZ || person.shove[0] || person.shove[1]))
          limitPedestrianStep(person,fromX,fromZ,others);
        // The ground is read a few times a second; a sidewalk does not change underfoot.
        person.sample -= dt;
        if (!person.reaction && (!person.visit || !person.escape && !person.visit.mode && person.visit.path[person.visit.at]?.b<0)) {
          if (person.sample<=0 || person.supportY==null) {
            person.supportY=heightAt(person.x,person.z,person.y); person.sample=.22;
          }
          const impact=followFloor(person,person.supportY,dt);
          if(impact>9.5 || person.vy < -7){
            person.state='down';person.down=2.8;person.out=false;person.calm=true;
            receiveImpulse(person,(person.x-startX)/Math.max(dt,.001),(person.z-startZ)/Math.max(dt,.001),{fall:true,rest:.2,impact:impact||-person.vy});
          }
        }
        neighbours.put(person);
        if (dt > 0) {
          const vx=(person.x-startX)/dt, vz=(person.z-startZ)/dt;
          person.walkSpeed=Math.hypot(vx,vz);
          person.gaitX=THREE.MathUtils.lerp(person.gaitX??vx,vx,gaitEase);
          person.gaitZ=THREE.MathUtils.lerp(person.gaitZ??vz,vz,gaitEase);
          person.gaitSpeed=Math.hypot(person.gaitX,person.gaitZ);
        }
        if(context.enclosedSubway){person.drawn=-1;continue;}
        const look = person.look, grow = Math.min(1, person.age * 3);
        const moving = person.state === 'down' || person.visit?.wait > 0 || person.robbery?.blocked || (person.escape && !person.escape.path)
          ? 0 : Math.min(1,(person.gaitSpeed ?? look.pace)/.6);
        const seat = person.sitting && person.seat, weight = seat?.weight ?? 1;
        const approaching = seat?.stepSpeed > .05;
        const px = person.x + (seat ? 0 : person.shove[0]), pz = person.z + (seat ? 0 : person.shove[1]);
        if (figures) {
          animate(person, dt);
          const clip = approaching ? 'walk' : seat ? seatClip(seat) : person.clip;
          if (figures.add(figureOf(look), px, person.y + (seat ? seatHeight(seat)*weight : 0), pz, person.heading,
            look.height * grow, look, Math.hypot(px-focus.x,pz-focus.z), clip, approaching ? seat.stepTime : person.time,
            seat ? 'idle' : person.from, person.fromTime, approaching ? 0 : seat ? 1-weight : person.fade, person.carry,person.reaction,person)) continue;
        }
        const woman = Boolean(look.kit & KIT.woman), to = sinks[figures && woman ? 1 : 0];
        if (to.count >= to.mesh.instanceMatrix.count) continue;
        const at = to.count++, slot = (to === sinks[1] ? capacity : 0) + at;
        place.set(px, person.y + (seat ? (seatHeight(seat)-.45*look.height/1.72)*weight : 0), pz);
        turn.setFromAxisAngle(up, person.heading);
        if (person.state === 'down') {
          tiltFallingFigure(person.reaction,look.height);
        } else if (person.reaction) {
          const {vx,vz,age}=person.reaction;
          fallAxis.set(vz,0,-vx).normalize();
          const lean=Math.min(.30,Math.hypot(vx,vz)*.085)*Math.min(1,age/.055);
          if (lean>0) turn.premultiply(fallTurn.setFromAxisAngle(fallAxis,lean));
        }
        size.set(look.build * look.height / 1.72 * grow, look.height / 1.72 * grow, look.build * look.height / 1.72 * grow);
        matrix.compose(place, turn, size); to.mesh.setMatrixAt(at, matrix);
        if (person.drawn !== slot) {
          // Colours travel with the person when the list is reshuffled.
          person.drawn = slot;
          colour.setHex(look.top); to.tops.setXYZ(at, colour.r, colour.g, colour.b);
          colour.setHex(look.bottom); to.bottoms.setXYZ(at, colour.r, colour.g, colour.b);
          colour.setHex(look.skin); to.skins.setXYZ(at, colour.r, colour.g, colour.b);
          colour.setHex(look.hair); to.hairs.setXYZ(at, colour.r, colour.g, colour.b);
          to.tops.needsUpdate = to.bottoms.needsUpdate = to.skins.needsUpdate = to.hairs.needsUpdate = true;
        }
        // Stride rate follows pace: about two steps a second at a brisk walk.
        if (!person.visit) person.phase += Math.min(4,person.gaitSpeed || 0)*dt*4.6;
        to.gaits.setXYZW(at, person.phase, seat && !approaching ? -1 : moving, seat ? weight : 0, look.kit | (woman ? KIT.woman : 0));
      }
      // Whoever else is drawn with the crowd: sitting, standing, walking at their own pace, or in a movement they name.
      for (const extra of extras) {
        if(context.enclosedSubway && !extra.subway)continue;
        if (figures) {
          const walk = figures.seconds('walk');
          const seat = extra.sitting && !extra.clip && extra.seat, weight = seat?.weight ?? 1;
          const look = extra.look, clip = extra.clip || (seat ? seatClip(seat) : extra.sitting ? 'sit' : (extra.stride || 0) > .05 ? 'walk' : 'idle');
          const time = extra.clip ? extra.time || 0 : extra.sitting ? (extra.x * 7.3 + extra.z * 3.1) % 1.6 + context.time : clip === 'walk' ? (extra.phase || 0) / TAU * walk : context.time + (extra.x + extra.z) % 2;
          const height = seat ? extra.y + seatHeight(seat) * weight : extra.y;
          if (figures.add(extra.member ?? figureOf(look), extra.x, height, extra.z, extra.heading || 0, look.height || 0, look, Math.hypot(extra.x - focus.x, extra.z - focus.z), clip, time, seat && weight < 1 ? 'idle' : extra.from || null, extra.fromTime || 0, seat ? 1 - weight : extra.fade || 0, extra.escape || extra.suspendCarry ? null : extra.carry,extra.reaction,extra.contactActor || extra)) continue;
        }
        const look = extra.look, scale = (look.height || 1.72) / 1.72, to = sinks[figures && (look.kit & KIT.woman) ? 1 : 0];
        if (to.count >= to.mesh.instanceMatrix.count) continue;
        const at = to.count++;
        place.set(extra.x, extra.y, extra.z);
        if(extra.cycling){place.x-=.24*Math.sin(extra.heading||0);place.z-=.24*Math.cos(extra.heading||0);place.y+=.15;}
        turn.setFromAxisAngle(up, extra.heading || 0); size.set(scale, scale, scale);
        const seat = extra.sitting && extra.seat, weight = seat?.weight ?? 1;
        if (seat) place.y += (seatHeight(seat) - .45 * scale) * weight;
        if (extra.reaction?.fall || extra.downUntil > context.time) tiltFallingFigure(extra.reaction,look.height||1.72);
        matrix.compose(place, turn, size); to.mesh.setMatrixAt(at, matrix);
        colour.setHex(look.top); to.tops.setXYZ(at, colour.r, colour.g, colour.b);
        colour.setHex(look.bottom); to.bottoms.setXYZ(at, colour.r, colour.g, colour.b);
        colour.setHex(look.skin); to.skins.setXYZ(at, colour.r, colour.g, colour.b);
        colour.setHex(look.hair); to.hairs.setXYZ(at, colour.r, colour.g, colour.b);
        to.tops.needsUpdate = to.bottoms.needsUpdate = to.skins.needsUpdate = to.hairs.needsUpdate = true;
        // They keep their own stride: the shader's clock does not move them.
        to.gaits.setXYZW(at, extra.phase || 0, extra.clip === 'handsUp' || extra.clip === 'cower' ? -3 : extra.clip === 'reach' || extra.clip === 'pickUp' ? -4 : extra.cycling ? -2 : extra.sitting ? -1 : extra.stride || 0, extra.sitting ? weight : 0, look.kit || 0);
      }
      figures?.end();
      for (const to of sinks) { to.mesh.count = to.count; to.mesh.instanceMatrix.needsUpdate = true; to.gaits.needsUpdate = true; }
    },
    /**
     * Draw these with the crowd, after it: each { x, y, z, heading, phase, stride, look }, where `look` is
     * { top, bottom, skin, hair, kit, height }, `phase` is where in its stride the figure is, in radians,
     * and `stride` how much it is striding, from 0 standing to 1; `sitting` seats the figure instead.
     */
    setExtras(list, bodies = list) { extras = list || []; extraBodies = bodies || []; },
    palm(actor) { return figures?.palm?.(figureOf(actor.look),actor); },
    updateShoppingDrivers(sim,spaces,stores,appearance) {
      sim.planShopStops(spaces,stores);
      for (const car of sim.cars) {
        const trip=car.errand;
        if (!trip) continue;
        trip.closed=!stores.some(shop=>shop.id===trip.shop.id);
        if (trip.phase==='approach' && trip.closed) { car.errand=null; continue; }
        if (trip.phase==='parked') {
          const cos=Math.cos(car.angle),sin=Math.sin(car.angle);
          const door={x:car.x+1.55*cos,z:car.z-1.55*sin};
          const path=[door];
          // Walk around the rear bumper when the shop is on the passenger side.
          if (trip.side<0) {
            const rear=(car.identity?.asset?.design?.L ?? 4.6)/2+.7;
            path.push({x:door.x-sin*rear,z:door.z-cos*rear},
              {x:car.x-1.6*cos-sin*rear,z:car.z+1.6*sin-cos*rear});
          }
          path.push({x:trip.shop.x+trip.shop.nx*1.4,z:trip.shop.z+trip.shop.nz*1.4});
          const person=streetWitness({...door,y:car.y,heading:car.angle,look:appearance(car)});
          Object.assign(person,{state:'walk',mad:0,driverCar:car,driverPath:path,driverWaypoint:1});
          trip.phase='walking'; trip.person=person; trip.leftAt=sim.elapsed;
          car.doorOpen=1; car.doorHold=.6; car.doorSide=1;
        } else if (trip.person && (trip.person.gone || !people.includes(trip.person))) {
          if (Math.hypot(car.x-sim.player.x,car.z-sim.player.z)>120) trip.phase='boarded';
          else if (trip.phase!=='boarded') { car.errand=null; car._edge=null; }
        }
      }
    },
    fleeOntoStreet:streetWitness,
    strike, closest, hitByShot,
    meleeTarget(player,bystanders=[],time=0) {
      const waiting=bystanders.filter(actor=>!(actor.absentUntil>time || actor.downUntil>time));
      return inFront(player.x,player.z,player.angle,1.85,.2,player.y,people.concat(waiting),true);
    },
    get damage() { return damage; },
    get counterblow() { return counterblow; },
    get threats() { return threats; },
    /** People a car hit in this update ({ speed, player, x, z }), people the player barged into, and how many started back from a car. */
    get struck() { return struck; },
    get bumps() { return bumps; },
    get scares() { return scares; },
    /** Make everyone near a point shrink from it or run: a shot, a fight, a gun pointed their way. */
    alarm(x, z, reach = 9, run = .6, { angle = null, near = 5, calm = false, y, sight, bystanders = [], time = 0 } = {}) {
      let count = 0;
      const notices = (person,dx,dz,d) => d<=reach && (!Number.isFinite(y) || trafficAtHeight(person,y)) &&
        (angle===null || d<=near || dx*Math.sin(person.heading)+dz*Math.cos(person.heading)>=-.2*d) &&
        (!sight || sight(person));
      for (const person of people) {
        if (person.state === 'down' || (person.state === 'fight' && !calm)) continue;
        const dx=x-person.x, dz=z-person.z, d=Math.hypot(dx,dz);
        if (!notices(person,dx,dz,d) || person.robbery) continue;
        const aimed=angle!==null && -dx*Math.sin(angle)-dz*Math.cos(angle)>.55*d;
        if (person.visit) {
          if (angle!==null && roomLocal(person.visit.room,person.x,person.z).b>0) continue;
          if (!person.visit.scared) count++;
          person.visit.scared=true; continue;
        }
        // Somebody already running or with their hands up stays as they are, a little longer.
        if (calm && (person.state === 'flee' || person.state === 'cower')) {
          if (person.state==='cower' && !aimed) { person.state='flee'; person.held=false; }
          person.mad = Math.max(person.mad || 0, 2.5); continue;
        }
        person.x += person.shove[0]; person.z += person.shove[1]; person.shove[0] = person.shove[1] = 0; person.hop = null; count++;
        // Close to it they freeze, hands up if it is held on them; further off they run.
        if ((angle!==null && !aimed) || random() < run || d > reach * .6) { person.state = 'flee'; person.mad = 3 + random() * 2; person.held = false; } else { person.state = 'cower'; person.mad = 4 + random() * 3; person.held = aimed; }
      }
      for (const person of bystanders) {
        const dx=x-person.x, dz=z-person.z;
        if (person.absentUntil>time || person.downUntil>time || !notices(person,dx,dz,Math.hypot(dx,dz))) continue;
        person.leaveBike?.();
        person.absentUntil=time+60;
        this.fleeOntoStreet(person); count++;
      }
      return count;
    },
    /** Somebody hauled out of a car and thrown down at (x, z): they lie there a few seconds, get up and run. */
    throwOut(x, z, heading, hours = 12, appearance = null) {
      const look = appearance || dress(chooseOutfit(life.wardrobe(x, z, hours), random), random, life.tones?.(x, z, hours) || null, life.style?.(x, z, hours) ?? .3);
      const person = { run: null, s: 0, way: 1, lane: .6, look, state: 'down', hop: null, wait: 0, bold: true, phase: 0, clip: null, time: 0, fade: 0, once: false, y: null, sample: 0, age: 1, shove: [0, 0], x, z, heading, down: 4.5, out: false, calm: false, hp: 3 };
      people.push(person); show(person, 'thrown', true);
      return person;
    },
    /** Draw the crowd with grown figures (people-figures.js) in place of the blocked-out ones. */
    setFigures(set) { figures = set; if (set && !set.group.parent) mesh.parent?.add(set.group); },
    get figures() { return figures; },
    get modelled() { return Boolean(figures?.anyReady); },
    dispose() { geometry.dispose(); other.dispose(); material.dispose(); figures?.dispose(); for (const to of sinks) to.mesh.dispose(); mesh.removeFromParent(); people.length = 0; },
  };
}
