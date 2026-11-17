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
import { crossingAspect } from './signal-plan.js';
import { OUTFITS } from './citylife.js';
import { drawTone } from './demographics.js';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

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

/** Kit an instance may carry or wear, as bits. */
export const KIT = { backpack: 1, bag: 2, cap: 4, longHair: 8, shortSleeves: 16, shorts: 32, woman: 64 };

/**
 * One person: colours, kit, height and pace, for an outfit named in
 * citylife.js. `random` is a generator of numbers from 0 to 1.
 */
export function dress(outfit, random = Math.random, tones = null) {
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
  return look;
}

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
		// Kit this person does not carry is folded away inside the body.
		if ( aBody.z > 0.5 && mod( floor( nycKit / exp2( aBody.z - 1.0 ) ), 2.0 ) < 0.5 ) transformed = vec3( 0.0, 1.2, 0.0 );
		// Legs swing from the hip and arms from the shoulder, opposite arm to leg.
		if ( aBody.y > 0.5 ) {
			bool nycArm = aBody.y > 2.5;
			float nycSide = ( aBody.y < 1.5 || ( aBody.y > 3.5 ) ) ? 1.0 : -1.0, nycPivot = nycArm ? ${SHOULDER.toFixed(2)} : ${HIP.toFixed(2)};
			float nycTurn = nycSwing * nycSide * ( nycArm ? 0.5 : 0.62 ), nycCos = cos( nycTurn ), nycSin = sin( nycTurn );
			vec2 nycArmYZ = vec2( transformed.y - nycPivot, transformed.z );
			transformed.y = nycPivot + nycArmYZ.x * nycCos - nycArmYZ.y * nycSin;
			transformed.z = nycArmYZ.x * nycSin + nycArmYZ.y * nycCos;
		}
		// The body rises a little at each footfall.
		transformed.y += ( 1.0 - cos( 2.0 * nycStride ) ) * 0.011 * aGait.y;
	}`);
    shader.fragmentShader = `varying vec3 vPerson;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPerson;');
  };
  return material;
}

/**
 * The modelled figures (scripts/build-people.mjs): a man and a woman, each a
 * few thousand triangles, with where every vertex is at every frame of a
 * walk. `meta` is people.json and `poses` the Int16Array of people.bin.
 * Both bodies are in the one geometry; each person shows theirs and folds
 * the other away. Returns { geometry, material, texture }.
 */
export function createFigures(meta, poses) {
  const total = meta.figures.reduce((sum, figure) => sum + figure.vertices, 0), frames = meta.frames;
  const data = new Float32Array(total * frames * 4), position = [], body = [], vertex = [], index = [];
  let column = 0, offset = 0;
  meta.figures.forEach((figure, which) => {
    for (let f = 0; f < frames; f++) for (let i = 0; i < figure.vertices; i++) {
      const from = offset + (f * figure.vertices + i) * 3, to = (f * total + column + i) * 4;
      data[to] = poses[from] / 16000; data[to + 1] = poses[from + 1] / 16000; data[to + 2] = poses[from + 2] / 16000; data[to + 3] = 1;
    }
    for (let i = 0; i < figure.vertices; i++) {
      const standing = ((frames - 1) * total + column + i) * 4;
      position.push(data[standing], data[standing + 1], data[standing + 2]); body.push(figure.paint[i], 0, which + 1, figure.bare[i]); vertex.push(column + i);
    }
    for (const i of figure.faces) index.push(column + i);
    column += figure.vertices; offset += figure.vertices * frames * 3;
  });
  const texture = new THREE.DataTexture(data, total, frames, THREE.RGBAFormat, THREE.FloatType);
  texture.name = 'Where each vertex of the figures is through a stride'; texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 4)); geometry.setAttribute('aVertex', new THREE.Float32BufferAttribute(vertex, 1));
  geometry.setIndex(index); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  // Faceted shading from the surface as it is posed: the stored normals are the standing figure's.
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86, metalness: 0, flatShading: true });
  material.name = 'People, modelled';
  material.onBeforeCompile = shader => {
    shader.uniforms.uPeoplePose = { value: texture };
    shader.vertexShader = `attribute vec4 aBody;\nattribute float aVertex;\nattribute vec3 aTop;\nattribute vec3 aBottom;\nattribute vec3 aSkin;\nattribute vec3 aHair;\nattribute vec4 aGait;\nuniform sampler2D uPeoplePose;\nvarying vec3 vPerson;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	{
		// aGait: where in its stride this person is, how much it is striding, how fast, and its kit.
		float nycKit = aGait.w, nycLoop = fract( ( aGait.x + uNycTime * aGait.z ) / 6.2831853 ) * ${meta.walkFrames}.0;
		int nycColumn = int( aVertex + 0.5 ), nycFrame = int( nycLoop );
		vec3 nycStep = mix( texelFetch( uPeoplePose, ivec2( nycColumn, nycFrame ), 0 ).xyz, texelFetch( uPeoplePose, ivec2( nycColumn, ( nycFrame + 1 ) % ${meta.walkFrames} ), 0 ).xyz, fract( nycLoop ) );
		transformed = mix( texelFetch( uPeoplePose, ivec2( nycColumn, ${meta.walkFrames} ), 0 ).xyz, nycStep, clamp( aGait.y, 0.0, 1.0 ) );
		bool nycBareArm = mod( floor( nycKit / 16.0 ), 2.0 ) > 0.5, nycBareLeg = mod( floor( nycKit / 32.0 ), 2.0 ) > 0.5, nycWoman = mod( floor( nycKit / 64.0 ), 2.0 ) > 0.5;
		vPerson = aBody.x < 0.5 ? aSkin : aBody.x < 1.5 ? aTop : aBody.x < 2.5 ? aBottom : aBody.x < 3.5 ? aHair : vec3( 0.03, 0.03, 0.032 );
		if ( ( aBody.w > 0.5 && aBody.w < 1.5 && nycBareArm ) || ( aBody.w > 1.5 && nycBareLeg ) ) vPerson = aSkin;
		// The body this person is not is folded away inside the one they are.
		if ( ( aBody.z < 1.5 ) == nycWoman ) transformed = vec3( 0.0, 1.0, 0.0 );
	}`);
    shader.fragmentShader = `varying vec3 vPerson;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPerson;');
  };
  return { geometry, material, texture };
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
    const key = `${run.id}|${end}`;
    if (links.has(key)) return links.get(key);
    const here = along(run, end ? run.length : 0), found = new Map();
    // The way a walker is going on arriving at this end.
    const dx = end ? here.tx : -here.tx, dz = end ? here.tz : -here.tz;
    for (let gx = Math.floor((here.x - 32) / cell); gx <= Math.floor((here.x + 32) / cell); gx++) for (let gz = Math.floor((here.z - 32) / cell); gz <= Math.floor((here.z + 32) / cell); gz++) {
      for (const other of grid.get(`${gx},${gz}`) || []) {
        if (other.run === run) continue;
        const vx = other.x - here.x, vz = other.z - here.z, d = Math.hypot(vx, vz);
        if (d > 32) continue;
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
export function createCrowd({ scene = null, life, heightAt = () => 0, isRoad = () => true, capacity = 240, range = 120, random = seeded(20260712) } = {}) {
  let geometry = personGeometry(), material = createPersonMaterial(), figures = null;
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'People'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  const attribute = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size); a.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(name, a); return a; };
  const tops = attribute('aTop', 3), bottoms = attribute('aBottom', 3), skins = attribute('aSkin', 3), hairs = attribute('aHair', 3), gaits = attribute('aGait', 4);
  scene?.add(mesh);
  const people = [], crossing = [];
  // Figures that are not of the crowd but are drawn with it: the player, and whoever serves in a shop.
  let extras = [];
  let network = null, source = null, balanceTimer = 0, filled = false, lastFocus = null;
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();

  function spawn(run, hours, s = random() * run.length) {
    const at = along(run, s), look = dress(chooseOutfit(life.wardrobe(at.x, at.z, hours), random), random, life.tones?.(at.x, at.z, hours) || null);
    const person = { run, s, way: random() < .5 ? 1 : -1, lane: clamp(.55 + random() * Math.max(.2, run.depth - .9), .5, Math.max(.55, run.depth - .25)), look,
      state: 'walk', hop: null, wait: 0, bold: random() < .6, phase: random() * TAU, y: null, sample: random() * .25, age: 0, shove: [0, 0], x: at.x, z: at.z, heading: 0 };
    people.push(person);
    return person;
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

  function step(person, dt, context) {
    const { junctions, cars, time } = context;
    person.age += dt;
    if (person.state === 'walk') {
      person.s += person.way * person.look.pace * dt;
      if (person.s > 0 && person.s < person.run.length) return;
      // The end of the block: turn the corner, cross, or go back the way they came.
      const end = person.s >= person.run.length ? 1 : 0;
      person.s = clamp(person.s, 0, person.run.length);
      const options = network.linksFrom(person.run, end);
      let total = .12; for (const option of options) total += option.kind === 'turn' ? 1.3 : 1;
      let roll = random() * total, choice = null;
      for (const option of options) { roll -= option.kind === 'turn' ? 1.3 : 1; if (roll <= 0) { choice = option; break; } }
      if (!choice) { person.way = -person.way; return; }
      if (choice.kind === 'turn') { person.run = choice.run; person.s = choice.end ? choice.run.length : 0; person.way = choice.end ? -1 : 1; person.lane = clamp(person.lane, .5, Math.max(.55, choice.run.depth - .25)); return; }
      person.state = 'wait'; person.hop = choice; person.wait = random() * .4;
      return;
    }
    if (person.state === 'wait') {
      person.wait -= dt;
      if (person.wait > 0) return;
      person.wait = .3;
      const hop = person.hop, aspect = signalFor(hop.from, hop.to, junctions, time);
      if (aspect !== 'walk') {
        // Against the hand, or with no signal at all: only if nothing is coming.
        if (aspect !== null && !person.bold) return;
        const mx = (hop.from[0] + hop.to[0]) / 2, mz = (hop.from[1] + hop.to[1]) / 2;
        for (const car of cars) {
          if (car._kerb || car.parked) continue;
          // Nobody steps out in front of a moving car, or of one standing at
          // the crossing: it is waiting to go, and would wait for ever if
          // people kept taking its standing still for a gap.
          const away = Math.hypot(car.x - mx, car.z - mz);
          if (away < 14 || (away < 24 && Math.abs(car.speed) > 1.2)) return;
        }
      }
      person.state = 'cross'; person.progress = 0;
      return;
    }
    if (person.state === 'cross') {
      const hop = person.hop;
      // A little quicker than on the sidewalk, as people are with traffic waiting.
      person.progress += person.look.pace * 1.15 * dt / hop.distance;
      if (person.progress < 1) return;
      person.run = hop.run; person.s = hop.end ? hop.run.length : 0; person.way = hop.end ? -1 : 1; person.state = 'walk'; person.hop = null;
      person.lane = clamp(person.lane, .5, Math.max(.55, hop.run.depth - .25));
    }
  }

  function locate(person) {
    if (person.state === 'cross') {
      const { from, to } = person.hop, t = person.progress;
      person.x = from[0] + (to[0] - from[0]) * t; person.z = from[1] + (to[1] - from[1]) * t;
      person.heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
      return;
    }
    const at = along(person.run, person.s), lane = person.state === 'wait' ? .45 : person.lane;
    person.x = at.x - at.nx * lane; person.z = at.z - at.nz * lane;
    if (person.state === 'wait') person.heading = Math.atan2(person.hop.to[0] - person.hop.from[0], person.hop.to[1] - person.hop.from[1]);
    else person.heading = Math.atan2(at.tx * person.way, at.tz * person.way);
  }

  return {
    mesh, people, crossing,
    get count() { return people.length; },
    /**
     * `context`: walks (the streetscape's list), focus { x, z }, forward [x, z]
     * (the way the camera looks, so that nobody appears in front of it),
     * hours, time (the simulation's clock), junctions, cars, and the player.
     */
    update(dt, context) {
      const { walks = [], focus = { x: 0, z: 0 }, forward = null, hours = 12, player = null } = context;
      if (walks !== source) {
        source = walks; network = createWalkNetwork(walks, { isRoad });
        // People on stretches that are no longer loaded go with them.
        const kept = new Set(walks);
        for (let i = people.length - 1; i >= 0; i--) if (!kept.has(people[i].run) || (people[i].hop && !kept.has(people[i].hop.run))) people.splice(i, 1);
      }
      // A jump across the city starts a new crowd rather than marching the old one over.
      if (lastFocus && Math.hypot(focus.x - lastFocus.x, focus.z - lastFocus.z) > 150) { people.length = 0; filled = false; }
      lastFocus = { x: focus.x, z: focus.z };
      balanceTimer -= dt;
      if (balanceTimer <= 0 && walks.length) {
        balanceTimer = filled ? .35 : 0;
        // How many people each stretch should hold, scaled down together if the city asks for more than can be drawn.
        const near = []; let wanted = 0;
        for (const run of walks) {
          const middle = along(run, run.length / 2), d = Math.hypot(middle.x - focus.x, middle.z - focus.z);
          if (d > range) continue;
          // The model is asked afresh every few seconds; the hour does not turn faster than that.
          if (!(run.crowdedAt >= 0) || Math.abs(context.time - run.crowdedAt) > 4) { run.crowded = life.crowding(middle.x, middle.z, hours); run.crowdedAt = context.time || 0; }
          const want = run.crowded * run.length;
          near.push({ run, want, middle, d }); wanted += want;
        }
        const scale = Math.min(1, capacity * .96 / Math.max(wanted, 1e-6)), have = new Map();
        for (const person of people) have.set(person.run, (have.get(person.run) || 0) + 1);
        // What the camera can see close up; with no camera given, nothing is watching.
        const visible = point => Boolean(forward) && (point.x - focus.x) * forward[0] + (point.z - focus.z) * forward[1] > 0 && Math.hypot(point.x - focus.x, point.z - focus.z) < 70;
        let added = 0;
        for (const { run, want, middle } of near) {
          const lack = want * scale - (have.get(run) || 0);
          if (lack <= 0 || people.length >= capacity) continue;
          // A stretch that has just been loaded is filled at once. After that,
          // people arrive where the camera is not looking.
          const fresh = !filled || !run.peopled;
          if (!fresh && visible(middle) && run.length < 90) continue;
          const arrivals = fresh ? Math.floor(lack + random()) : (random() < lack ? 1 : 0);
          for (let n = 0; n < arrivals && people.length < capacity; n++) {
            const person = spawn(run, hours);
            if (!fresh) { const at = along(run, person.s); if (visible(at)) { people.pop(); continue; } }
            added++;
          }
        }
        for (const { run } of near) run.peopled = true;
        // Those who have walked out of range, and those a quieter hour no longer calls for, leave.
        for (let i = people.length - 1; i >= 0; i--) {
          const person = people[i], d = Math.hypot(person.x - focus.x, person.z - focus.z);
          if (person.age > 1 && d > range + 25) people.splice(i, 1);
        }
        if (people.length > wanted * scale + 6) {
          for (let i = people.length - 1, drop = Math.ceil((people.length - wanted * scale) * .1); i >= 0 && drop > 0; i--) {
            const person = people[i];
            if (person.state === 'walk' && !visible(person)) { people.splice(i, 1); drop--; }
          }
        }
        filled = true;
      }
      crossing.length = 0;
      const driving = player && player.mode === 'drive' && Math.hypot(player.velocityX || 0, player.velocityZ || 0) > 2;
      for (let i = 0; i < people.length; i++) {
        const person = people[i];
        if (network) step(person, dt, context);
        locate(person);
        if (person.state === 'cross') crossing.push(person);
        // Step back from a car that is about to brush past.
        if (driving) {
          const dx = person.x - player.x, dz = person.z - player.z, d = Math.hypot(dx, dz);
          if (d < 3.6 && d > .01) { person.shove[0] = dx / d * (3.6 - d) * .7; person.shove[1] = dz / d * (3.6 - d) * .7; }
        }
        person.shove[0] *= Math.exp(-dt * 2.2); person.shove[1] *= Math.exp(-dt * 2.2);
        // The ground is read a few times a second; a sidewalk does not change underfoot.
        person.sample -= dt;
        if (person.y === null || person.sample <= 0) { const y = heightAt(person.x, person.z); person.y = person.y === null ? y : person.y + (y - person.y) * .6; person.sample = .22; }
        const look = person.look, moving = person.state === 'wait' ? 0 : 1, grow = Math.min(1, person.age * 3);
        place.set(person.x + person.shove[0], person.y, person.z + person.shove[1]);
        turn.setFromAxisAngle(up, person.heading);
        size.set(look.build * look.height / 1.72 * grow, look.height / 1.72 * grow, look.build * look.height / 1.72 * grow);
        matrix.compose(place, turn, size); mesh.setMatrixAt(i, matrix);
        if (person.drawn !== i) {
          // Colours travel with the person when the list is reshuffled.
          person.drawn = i;
          colour.setHex(look.top); tops.setXYZ(i, colour.r, colour.g, colour.b);
          colour.setHex(look.bottom); bottoms.setXYZ(i, colour.r, colour.g, colour.b);
          colour.setHex(look.skin); skins.setXYZ(i, colour.r, colour.g, colour.b);
          colour.setHex(look.hair); hairs.setXYZ(i, colour.r, colour.g, colour.b);
          tops.needsUpdate = bottoms.needsUpdate = skins.needsUpdate = hairs.needsUpdate = true;
        }
        // Stride rate follows pace: about two steps a second at a brisk walk.
        // Half are drawn with the woman's figure: which, is fixed by where in their stride they began.
        gaits.setXYZW(i, person.phase, moving, look.pace * 4.6, look.kit | (Math.floor(person.phase * 997) % 2 ? KIT.woman : 0));
      }
      let drawn = people.length;
      for (const extra of extras) {
        if (drawn >= capacity) break;
        const look = extra.look, scale = (look.height || 1.72) / 1.72, i = drawn++;
        place.set(extra.x, extra.y, extra.z); turn.setFromAxisAngle(up, extra.heading || 0); size.set(scale, scale, scale);
        matrix.compose(place, turn, size); mesh.setMatrixAt(i, matrix);
        colour.setHex(look.top); tops.setXYZ(i, colour.r, colour.g, colour.b);
        colour.setHex(look.bottom); bottoms.setXYZ(i, colour.r, colour.g, colour.b);
        colour.setHex(look.skin); skins.setXYZ(i, colour.r, colour.g, colour.b);
        colour.setHex(look.hair); hairs.setXYZ(i, colour.r, colour.g, colour.b);
        // They keep their own stride: the shader's clock does not move them.
        gaits.setXYZW(i, extra.phase || 0, extra.stride || 0, 0, look.kit || 0);
      }
      if (extras.length) tops.needsUpdate = bottoms.needsUpdate = skins.needsUpdate = hairs.needsUpdate = true;
      mesh.count = drawn;
      mesh.instanceMatrix.needsUpdate = true; gaits.needsUpdate = true;
    },
    /**
     * Draw these with the crowd, after it: each { x, y, z, heading, phase, stride, look }, where `look` is
     * { top, bottom, skin, hair, kit, height }, `phase` is where in its stride the figure is, in radians,
     * and `stride` how much it is striding, from 0 standing to 1.
     */
    setExtras(list) { extras = list || []; },
    /** Draw the crowd with the modelled figures in place of the blocked-out ones. */
    setFigures(meta, poses) {
      const next = createFigures(meta, poses);
      for (const name of ['aTop', 'aBottom', 'aSkin', 'aHair', 'aGait']) next.geometry.setAttribute(name, geometry.getAttribute(name));
      geometry.dispose(); material.dispose(); figures?.texture.dispose();
      geometry = mesh.geometry = next.geometry; material = mesh.material = next.material; figures = next;
    },
    get modelled() { return Boolean(figures); },
    dispose() { geometry.dispose(); material.dispose(); figures?.texture.dispose(); mesh.dispose(); mesh.removeFromParent(); people.length = 0; },
  };
}
