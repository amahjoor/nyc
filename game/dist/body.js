// People, modelled here.
//
// A body is not downloaded: it is grown from a design (body-designs.js), the
// way a car is from its row. The design sets the skeleton's proportions; flesh
// is laid on the bones as a field of distances (rounded shapes that melt into
// one another), clothes and hair are further layers of the same field, and the
// surface where the field is nought is turned into triangles. Every vertex
// then learns which bones move it. Nothing here needs a browser.
//
// The skeleton, and the pose it is modelled in (arms straight out), are the
// mannequin's of Quaternius's Universal Animation Library (motion.json), so
// the movements recorded for that mannequin move these bodies.

// --- Turns and places ------------------------------------------------------------------
export const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qinv = q => [-q[0], -q[1], -q[2], q[3]];
export const qrot = (q, v) => {
  const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
};
export const qaxis = (axis, angle) => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]; };
export function qslerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const sign = dot < 0 ? -1 : 1; dot = Math.abs(dot);
  let wa = 1 - t, wb = t;
  if (dot < .9995) { const angle = Math.acos(dot), s = Math.sin(angle); wa = Math.sin((1 - t) * angle) / s; wb = Math.sin(t * angle) / s; }
  const q = [a[0] * wa + b[0] * wb * sign, a[1] * wa + b[1] * wb * sign, a[2] * wa + b[2] * wb * sign, a[3] * wa + b[3] * wb * sign], n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- The skeleton, to this person's measure ---------------------------------------------
/** Where the top of the skull is above the joint the head turns on, for a head of ordinary size. */
const CROWN = .231, ANKLE = .104;

/**
 * The mannequin's bones with their lengths changed to the design's.
 * Returns { bones: [{ name, parent, t, q }], world: [{ p, q }] at rest, at(name),
 * scale (of the whole against the mannequin), stride (how far the pelvis's
 * recorded travel is to be scaled), height }.
 */
export function createRig(motion, design = {}) {
  const d = key => Number.isFinite(design[key]) ? clamp(design[key], -1, 1) : 0;
  const age = ageOf(design);
  // A child's legs and arms are short for its trunk and its head is large; these come back to nought by eighteen.
  const young = age.young;
  const factor = {
    legs: 1 + d('legs') * .07 - young * .1, torso: 1 + d('torso') * .06, arms: 1 + d('arms') * .06 - young * .06,
    shoulders: (1 + d('shoulders') * .1) * mix(1, .9, d01(design.sex)) * (1 + muscleOf(design) * .04 - young * .1), hips: (1 + d('hips') * .08) * mix(1, 1.06, d01(design.sex)),
    head: (1 + d('head') * .06) * (1 + young * .24), neck: 1 + d('neck') * .12 - young * .15, hands: (1 + d('hands') * .1) * mix(1, .92, d01(design.sex)), feet: (1 + d('feet') * .1) * mix(1, .92, d01(design.sex)),
  };
  const scaleOf = name => /^(calf|foot)_/.test(name) ? factor.legs : /^(spine_0[123])$/.test(name) ? factor.torso : /^(neck_01|Head)$/.test(name) ? factor.torso * factor.neck
    : /^upperarm_/.test(name) ? factor.shoulders : /^(lowerarm|hand)_/.test(name) ? factor.arms : /^(index|middle|ring|pinky|thumb)_/.test(name) ? factor.hands : /^ball_/.test(name) ? factor.feet : 1;
  const build = scale => {
    const bones = motion.bones.map(bone => {
      const k = scaleOf(bone.name) * scale, t = bone.t.map(value => value * k);
      if (/^thigh_/.test(bone.name)) t[0] = bone.t[0] * scale * factor.hips;
      if (/^clavicle_/.test(bone.name)) t[0] = bone.t[0] * scale;
      return { name: bone.name, parent: bone.parent, t, q: bone.q.slice() };
    });
    return { bones, world: restWorld(bones) };
  };
  // Stand it on its soles, then measure it and bring it to the height asked for.
  const index = new Map(motion.bones.map((bone, i) => [bone.name, i]));
  const settle = scale => {
    const made = build(scale), pelvis = made.bones[index.get('pelvis')], root = made.world[index.get('root')];
    const lift = ANKLE * scale * factor.feet - made.world[index.get('foot_l')].p[1], moved = qrot(qinv(root.q), [0, lift, 0]);
    pelvis.t = pelvis.t.map((value, k) => value + moved[k]); made.world = restWorld(made.bones);
    return made;
  };
  const tall = heightOf(design), first = settle(1), top = first.world[index.get('Head')].p[1] + CROWN * factor.head;
  const scale = tall / top, made = settle(scale);
  const reference = restWorld(motion.bones)[index.get('pelvis')].p[1];
  return {
    bones: made.bones, world: made.world, index, scale, factor, height: tall,
    stride: made.world[index.get('pelvis')].p[1] / reference,
    spread: Math.max(0, weightOf(design)) * .3 + Math.max(0, muscleOf(design)) * .1 + (Number.isFinite(design.hips) ? Math.max(0, design.hips) * .05 : 0),
    at: name => made.world[index.get(name)].p,
  };
}
/** Where every bone is, and how it is turned, with each at its `q` and `t`. */
export function restWorld(bones) {
  const world = [];
  bones.forEach((bone, i) => {
    if (bone.parent < 0) { world[i] = { p: bone.t.slice(), q: bone.q.slice() }; return; }
    const parent = world[bone.parent], r = qrot(parent.q, bone.t);
    world[i] = { p: [parent.p[0] + r[0], parent.p[1] + r[1], parent.p[2] + r[2]], q: qmul(parent.q, bone.q) };
  });
  return world;
}
const d01 = value => Number.isFinite(value) ? clamp(value, 0, 1) : 0;
/** Years lived, and what they do: `young` is 1 at six and 0 from eighteen, `old` 0 until fifty and 1 at ninety. */
export function ageOf(design) {
  const years = Number.isFinite(design.age) ? clamp(design.age, 6, 95) : 30;
  return { years, young: 1 - smoothstep(6, 18, years), old: smoothstep(50, 90, years), grey: smoothstep(38, 72, years) };
}
/** How tall the design stands: its own height, less what a child has yet to grow and what the old have lost. */
export function heightOf(design) {
  const age = ageOf(design), grown = Number.isFinite(design.height) ? clamp(design.height, 1.4, 2.1) : mix(1.76, 1.63, d01(design.sex));
  return grown * (1 - age.young * .33) * (1 - age.old * .035);
}
const weightOf = design => Number.isFinite(design.weight) ? clamp(design.weight, -1, 1) : 0;
const muscleOf = design => (Number.isFinite(design.muscle) ? clamp(design.muscle, -1, 1) : 0) * (1 - ageOf(design).young * .8);

// --- The field ---------------------------------------------------------------------------
// A block of space cut into cells: how far each corner is from the surface (less than nought inside), and what it would be painted.
function createGrid(min, max, cell) {
  const n = [0, 1, 2].map(axis => Math.max(2, Math.ceil((max[axis] - min[axis]) / cell) + 1)), size = n[0] * n[1] * n[2];
  return { min, cell, n, field: new Float32Array(size).fill(1e3), paint: new Uint8Array(size), under: new Uint8Array(size) };
}
/** Melt a shape into the grid (`k` is how far the melting reaches), or with `cut` carve it out. Where the shape is outermost the surface takes its paint. */
function stamp(grid, shape, { k = 0, id = 0, cut = false, source = null } = {}) {
  const { min, cell, n, field } = grid, pad = k + cell * 2, lo = [0, 0, 0], hi = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    lo[axis] = Math.max(0, Math.floor((shape.min[axis] - pad - min[axis]) / cell)); hi[axis] = Math.min(n[axis] - 1, Math.ceil((shape.max[axis] + pad - min[axis]) / cell));
    if (lo[axis] > hi[axis]) return;
  }
  const distance = shape.d, marks = grid.paint, under = grid.under;
  for (let kz = lo[2]; kz <= hi[2]; kz++) for (let jy = lo[1]; jy <= hi[1]; jy++) {
    let i = (kz * n[1] + jy) * n[0] + lo[0];
    const y = min[1] + jy * cell, z = min[2] + kz * cell;
    for (let ix = lo[0]; ix <= hi[0]; ix++, i++) {
      const had = field[i], dist = distance(min[0] + ix * cell, y, z, source ? source[i] : 0, had);
      if (cut) { const a = -dist; if (a > had - k) { const h = k > 0 ? Math.max(k - Math.abs(a - had), 0) / k : 0; field[i] = Math.max(a, had) + h * h * k * .25; } continue; }
      if (dist < had + k) {
        const h = k > 0 ? Math.max(k - Math.abs(dist - had), 0) / k : 0;
        field[i] = Math.min(dist, had) - h * h * k * .25;
        if (dist <= had && marks[i] !== id) { under[i] = marks[i]; marks[i] = id; }
      }
    }
  }
}

// --- Shapes ------------------------------------------------------------------------------
// Each is { min, max, d(x, y, z) }: a box it lies within, and how far a point is from its surface.
function ball(c, r) {
  return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r], d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r };
}
/** An egg: radii along x, y and z, optionally tipped about the x axis (`pitch`) and turned about y (`yaw`). */
function egg(c, r, pitch = 0, yaw = 0) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), reach = Math.max(r[0], r[1], r[2]);
  const ix = 1 / r[0], iy = 1 / r[1], iz = 1 / r[2];
  const half = pitch || yaw ? [reach, reach, reach] : r;
  return {
    min: [c[0] - half[0], c[1] - half[1], c[2] - half[2]], max: [c[0] + half[0], c[1] + half[1], c[2] + half[2]],
    d: (x, y, z) => {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (yaw) { const tx = px * cy - pz * sy; pz = px * sy + pz * cy; px = tx; }
      if (pitch) { const ty = py * cp + pz * sp; pz = -py * sp + pz * cp; py = ty; }
      const ax = px * ix, ay = py * iy, az = pz * iz, k0 = Math.hypot(ax, ay, az);
      if (k0 < 1e-5) return -Math.min(r[0], r[1], r[2]);
      return k0 * (k0 - 1) / Math.hypot(ax * ix, ay * iy, az * iz);
    },
  };
}
/** A rod from a to b, round at both ends, ra thick at a and rb at b. */
function rod(a, b, ra, rb = ra) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz || 1e-9, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2, reach = Math.max(ra, rb);
  return {
    min: [Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.min(a[2], b[2]) - reach], max: [Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach, Math.max(a[2], b[2]) + reach],
    d: (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2], yy = px * bx + py * by + pz * bz, zz = yy - l2;
      const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2, k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
    },
  };
}
/**
 * A limb or a trunk: a run from a to b whose cross-section, an oval, changes
 * along the way. `u` and `v` are the oval's two directions; each station is
 * [how far along (0 to 1), half-width along u, half-width along v, shift along u, shift along v].
 */
function loft(a, b, u, v, stations, square = 2) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], length = Math.hypot(ax, ay, az) || 1e-9, dx = ax / length, dy = ay / length, dz = az / length;
  const N = 48, table = new Float32Array((N + 1) * 4);
  for (let i = 0; i <= N; i++) {
    const t = i / N; let s = 0; while (s + 2 < stations.length && stations[s + 1][0] < t) s++;
    const p = stations[s], q = stations[s + 1], f = smoothstep(p[0], q[0], t);
    for (let k = 0; k < 4; k++) table[i * 4 + k] = mix(p[k + 1] || 0, q[k + 1] || 0, f);
  }
  let reach = 0; for (const s of stations) reach = Math.max(reach, Math.max(s[1], s[2]) + Math.hypot(s[3] || 0, s[4] || 0));
  const lo = [0, 1, 2].map(k => Math.min(a[k], b[k]) - reach), hi = [0, 1, 2].map(k => Math.max(a[k], b[k]) + reach);
  return {
    min: lo, max: hi,
    d: (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2], along = px * dx + py * dy + pz * dz, f = clamp(along / length, 0, 1) * N, i = Math.min(N - 1, f | 0), w = f - i, o = i * 4;
      const ru = table[o] + (table[o + 4] - table[o]) * w, rv = table[o + 1] + (table[o + 5] - table[o + 1]) * w;
      const pu = px * u[0] + py * u[1] + pz * u[2] - (table[o + 2] + (table[o + 6] - table[o + 2]) * w), pv = px * v[0] + py * v[1] + pz * v[2] - (table[o + 3] + (table[o + 7] - table[o + 3]) * w);
      let dist;
      if (square === 2) { const cu = pu / ru, cv = pv / rv, k0 = Math.hypot(cu, cv); dist = k0 < 1e-5 ? -Math.min(ru, rv) : k0 * (k0 - 1) / Math.hypot(cu / ru, cv / rv); }
      else { const k0 = Math.pow(Math.pow(Math.abs(pu / ru), square) + Math.pow(Math.abs(pv / rv), square), 1 / square); dist = (k0 - 1) * Math.min(ru, rv); }
      const over = along < 0 ? -along : along > length ? along - length : 0;
      return over > 0 ? (dist > 0 ? Math.hypot(dist, over) : over) : dist;
    },
  };
}
/** A shape kept only where `keep(x, y, z)` is less than nought. */
const within = (shape, keep, box = null, fade = 0) => ({
  min: box ? box.min : shape.min, max: box ? box.max : shape.max, edge: keep, hull: hullOf(shape),
  d: (x, y, z, s, had) => {
    const edge = keep(x, y, z), dist = shape.d(x, y, z, s, had);
    if (edge > 0 || !fade) return Math.max(dist, edge);
    // Toward its edge a garment thins down onto what is under it, so that a hem is not a ragged step.
    return edge < -fade || dist > had ? dist : had + (dist - had) * smoothstep(0, fade, -edge);
  },
});
/** The skin, let out by `thick`, as a shape: cloth that lies on the body. `box` is the part of space the garment is in. */
const shell = (thick, box) => ({ min: box.min, max: box.max, hull: null, d: (x, y, z, skin) => skin - thick });
/** Cloth that lies on whatever is already there: the skin, or what was put on before. */
const over = (thick, box) => ({ min: box.min, max: box.max, hull: null, d: (x, y, z, skin, had) => had - thick });
/** The box a shape's own substance lies in: nothing for cloth that only follows the skin. */
const hullOf = shape => shape.hull !== undefined ? shape.hull : { min: shape.min, max: shape.max };
const joinHulls = (a, b) => !a ? b : !b ? a : { min: [0, 1, 2].map(k => Math.min(a.min[k], b.min[k])), max: [0, 1, 2].map(k => Math.max(a.max[k], b.max[k])) };
const either = (a, b) => ({ hull: joinHulls(hullOf(a), hullOf(b)), min: [0, 1, 2].map(k => Math.min(a.min[k], b.min[k])), max: [0, 1, 2].map(k => Math.max(a.max[k], b.max[k])), d: (x, y, z, s, had) => Math.min(a.d(x, y, z, s, had), b.d(x, y, z, s, had)) });
/** A leg kept to its own side of the body below the fork, so that the two do not grow together. */
const apart = (shape, side, fork, gap) => ({ min: shape.min, max: shape.max, d: (x, y, z, s, had) => { const dist = shape.d(x, y, z, s, had); return y > fork ? dist : Math.max(dist, Math.min(gap, (fork - y) * .5) - side * x); } });
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

// --- What is painted what -----------------------------------------------------------------
export const PAINT = { skin: 0, top: 1, bottom: 2, hair: 3, shoe: 4, coat: 5, hat: 6, sole: 7, lip: 8, white: 9, iris: 10, pupil: 11, brow: 12, trim: 13, sock: 14, nail: 15, frame: 16 };

// --- The body ------------------------------------------------------------------------------
/**
 * Everything a body is made of, as stamps on the field in the order they are laid: flesh first, then what is worn.
 * Returns { flesh: [...], worn: [...] }, each entry [shape, options].
 */
function anatomy(design, rig) {
  const s = rig.scale, at = rig.at, d = key => Number.isFinite(design[key]) ? clamp(design[key], -1, 1) : 0;
  const sex = d01(design.sex), age = ageOf(design), weight = weightOf(design), heavy = Math.max(0, weight), thin = Math.max(0, -weight), muscle = muscleOf(design), strong = Math.max(0, muscle);
  const flesh = [], add = (shape, k = .02) => flesh.push([shape, { k: k * s }]), cut = (shape, k = .01) => flesh.push([shape, { k: k * s, cut: true }]);
  const hip = at('thigh_l'), knee = at('calf_l'), ankle = at('foot_l'), toe = at('ball_l'), shoulder = at('upperarm_l'), elbow = at('lowerarm_l'), wrist = at('hand_l');
  const neck = at('neck_01'), head = at('Head'), s1 = at('spine_01'), s2 = at('spine_02'), s3 = at('spine_03');
  // Girths: everything soft grows with weight, limbs with muscle too, and all of it with the frame.
  const soft = 1 + heavy * .5 - thin * .16, lean = 1 - thin * .14;
  const limb = (1 + heavy * .3 - thin * .15 + strong * .12 - Math.max(0, -muscle) * .06) * mix(1, .9, sex) * (1 - age.old * .06);
  const armGirth = limb * (1 + d('armGirth') * .18 + strong * .1), legGirth = limb * (1 + d('legGirth') * .16) * mix(1, 1.07, sex);

  // The trunk, from the fork to the root of the neck. Half-widths and half-depths at heights given between the joints.
  const fork = hip[1] - .1 * s * rig.factor.torso, base = fork - .03 * s, top = neck[1] + .012 * s, span = top - base, zBack = -.022 * s;
  const yAt = y => (y - base) / span;
  const waist = (1 + d('waist') * .14) * (1 + heavy * .42 - thin * .1), chest = (1 + d('chest') * .1 + strong * .09) * (1 + heavy * .2 - thin * .08), seat = (1 + d('hips') * .08) * (1 + heavy * .26 - thin * .07);
  const shoulderHalf = shoulder[0];
  const wide = shoulderHalf / (.192 * s);
  const belly = heavy * .075 + d('belly') * .03 + age.old * .012 + Math.max(0, d('belly')) * heavy * .03;
  const T = (y, a, b, c = 0) => [yAt(y), a * s, b * s, 0, c * s + zBack];
  const trunk = [
    T(base, .07, .07, .0),
    [yAt(fork + .015 * s), mix(.118, .124, sex) * s * seat, .092 * s * seat, 0, zBack],
    [yAt(hip[1]), mix(.166, .178, sex) * s * seat, mix(.102, .104, sex) * s * seat, 0, zBack + .004 * s],
    [yAt(mix(hip[1], s1[1], .62)), mix(.158, .164, sex) * s * mix(seat, waist, .4), mix(.1, .096, sex) * s * mix(seat, waist, .5), 0, zBack + (.006 + belly * .5) * s],
    [yAt(mix(s1[1], s2[1], .45)), mix(.142, .121, sex) * s * waist, mix(.096, .084, sex) * s * waist, 0, zBack + (.008 + belly * .8) * s],
    [yAt(mix(s2[1], s3[1], .3)), mix(.149, .127, sex) * s * mix(waist, chest, .6), mix(.102, .09, sex) * s * mix(waist, chest, .6), 0, zBack + (.01 + belly * .45) * s],
    [yAt(mix(s2[1], s3[1], .95)), mix(.164, .14, sex) * s * chest * mix(1, wide, .6), mix(.111, .098, sex) * s * chest, 0, zBack + .012 * s],
    [yAt(mix(s3[1], shoulder[1], .62)), mix(.166, .143, sex) * s * chest * wide, mix(.105, .094, sex) * s * chest, 0, zBack + .008 * s],
    [yAt(shoulder[1] - .004 * s), mix(.15, .13, sex) * s * wide * (1 + heavy * .1), mix(.088, .08, sex) * s * (1 + heavy * .2 + strong * .06), 0, zBack],
    [yAt(mix(shoulder[1], top, .55)), mix(.1, .086, sex) * s * (1 + strong * .12 + heavy * .1), mix(.072, .064, sex) * s * (1 + heavy * .2), 0, zBack - .004 * s],
    [1, .056 * s, .056 * s, 0, zBack],
  ];
  add(loft([0, base, 0], [0, top, 0], X, Z, trunk, 2.25), 0);
  // The belly a heavy body carries in front, and the small of an old back.
  if (belly > .004) add(egg([0, mix(s1[1], s2[1], .25), zBack + (.05 + belly * .7) * s], [(.11 + belly * .55) * s, (.105 + belly * .6) * s, (.07 + belly * .75) * s]), .06);
  // Seat.
  const rump = (1 + d('seat') * .22 + heavy * .14 - thin * .12) * mix(1, 1.08, sex);
  for (const side of [-1, 1]) add(egg([side * .078 * s * rig.factor.hips, hip[1] - .012 * s, zBack - .052 * s * rump], [.086 * s * rump, .092 * s * rump, .078 * s * rump], .2), .045);
  // Chest: a man's is flat plates that muscle or weight fills out; a woman's breasts.
  const bust = sex * (1 + d('bust') * .45 + heavy * .3) * (1 - age.young), plate = (1 - sex) * (.2 + strong * .8 + heavy * .5);
  const chestY = mix(s3[1], shoulder[1], .2);
  for (const side of [-1, 1]) {
    if (plate > .05) add(egg([side * .078 * s * wide, chestY, zBack + (.052 + heavy * .02) * s], [.082 * s, (.058 + heavy * .02) * s, (.03 + plate * .024) * s], -.15), .04);
    if (bust > .05) add(egg([side * .072 * s, chestY - (.03 + age.old * .02) * s, zBack + (.058 + bust * .012) * s], [.062 * s * (.75 + bust * .28), .064 * s * (.75 + bust * .28), .05 * s * (.6 + bust * .42)], .2), .04);
  }
  // Shoulders: the round of each, and the slope up to the neck.
  for (const side of [-1, 1]) {
    add(egg([side * (shoulder[0] + .004 * s), shoulder[1] + .004 * s, shoulder[2] + .004 * s], [.056 * s * armGirth, .054 * s * armGirth, .058 * s * armGirth]), .04);
    add(rod([side * .05 * s, neck[1] + .01 * s, zBack - .02 * s], [side * (shoulder[0] - .03 * s), shoulder[1] + .022 * s, shoulder[2] + .008 * s], (.036 + strong * .012 + heavy * .008) * s, .03 * s), .045);
  }
  // Neck.
  const neckGirth = (1 + d('neck') * .14 + heavy * .28 + strong * .14 - thin * .08) * mix(1, .84, sex) * (1 - age.young * .1);
  add(rod([0, neck[1] - .03 * s, zBack - .008 * s], [0, head[1] + .035 * s, head[2] - .012 * s], .06 * s * neckGirth, .055 * s * neckGirth), .03);

  // Arms, straight out. Each station: along, half-height, half-depth.
  for (const side of [-1, 1]) {
    const from = [side * shoulder[0], shoulder[1], shoulder[2]], to = [side * wrist[0], wrist[1], wrist[2]], length = wrist[0] - shoulder[0], e = (elbow[0] - shoulder[0]) / length, g = armGirth;
    const bicep = 1 + strong * .14, fore = 1 + strong * .08;
    add(loft(from, to, Y, Z, [
      [0, .05 * s * g, .054 * s * g], [e * .3, .047 * s * g * bicep, .051 * s * g * bicep, .002 * s], [e * .62, .044 * s * g * bicep, .047 * s * g * bicep, .002 * s], [e * .93, .037 * s * g, .039 * s * g],
      [e, .036 * s * g, .038 * s * g], [mix(e, 1, .22), .037 * s * g * fore, .043 * s * g * fore], [mix(e, 1, .55), .031 * s * g, .036 * s * g], [mix(e, 1, .9), .021 * s * mix(g, 1, .5), .028 * s * mix(g, 1, .5)], [1, .02 * s * mix(g, 1, .6), .028 * s * mix(g, 1, .6)],
    ]), .02);
    hand(add, rig, side, mix(1 + heavy * .12, 1, .3) * mix(1, .92, sex));
  }
  // Legs. Each station: along, half-width, half-depth, shift sideways, shift fore and aft.
  for (const side of [-1, 1]) {
    const from = [side * hip[0], hip[1] + .02 * s, hip[2]], to = [side * ankle[0], ankle[1], ankle[2]], length = from[1] - to[1], k = (from[1] - knee[1]) / length, g = legGirth, thigh = g * (1 + heavy * .12 + strong * .06), calf = g * (1 + strong * .08);
    add(apart(loft(from, to, X, Z, [
      [0, .09 * s * thigh, .094 * s * thigh, side * .008 * s, -.004 * s], [k * .22, .086 * s * thigh, .092 * s * thigh, side * .006 * s, 0], [k * .55, .074 * s * thigh, .08 * s * thigh, side * .002 * s, .004 * s], [k * .86, .057 * s * mix(thigh, 1, .3), .061 * s * mix(thigh, 1, .3), 0, .002 * s],
      [k, .052 * s * mix(g, 1, .4), .056 * s * mix(g, 1, .4), 0, .004 * s], [mix(k, 1, .14), .049 * s * mix(g, 1, .3), .052 * s * mix(g, 1, .3), 0, -.002 * s], [mix(k, 1, .34), .053 * s * calf, .058 * s * calf, side * .002 * s, -.012 * s], [mix(k, 1, .7), .04 * s * mix(g, 1, .5), .043 * s * mix(g, 1, .5), 0, -.006 * s], [mix(k, 1, .93), .033 * s, .037 * s, 0, 0], [1, .034 * s, .04 * s, 0, 0],
    ]), side, fork, .005 * s), .028);
    // The bare foot: heel, arch and toes.
    const f = rig.factor.feet * s, x = side * ankle[0];
    add(ball([x, .04 * f, ankle[2] - .012 * f], .039 * f), .02);
    add(rod([x, .05 * f, ankle[2] + .01 * f], [x + side * .004 * f, .03 * f, toe[2] - .005 * f], .04 * f, .033 * f), .02);
    add(egg([x + side * .006 * f, .021 * f, toe[2] + .03 * f], [.046 * f, .021 * f, .05 * f]), .014);
  }
  face(add, cut, design, rig);
  return { flesh, worn: wardrobe(design, rig) };
}

/** A hand: the palm as a web between wrist and knuckles, and each finger a chain of rods along its own bones. */
function hand(add, rig, side, girth) {
  if (rig.mitten) { const sfx = side > 0 ? '_l' : '_r', w = rig.at('hand' + sfx), a = rig.at('middle_01' + sfx), c = rig.at('middle_03' + sfx), g = rig.scale * girth * rig.factor.hands, t = rig.at('thumb_03' + sfx); add(rod(w, a, .026 * g, .03 * g), .012); add(rod(a, [c[0] + (c[0] - a[0]) * .25, c[1], c[2]], .029 * g, .022 * g), .01); add(rod(w, t, .02 * g, .014 * g), .01); return; }
  const s = rig.scale * rig.factor.hands / Math.max(rig.factor.hands, 1e-6) * rig.scale / rig.scale, h = rig.scale * girth * rig.factor.hands, suffix = side > 0 ? '_l' : '_r';
  const at = name => rig.at(name + suffix), wrist = at('hand');
  const thick = { index: .0088, middle: .0092, ring: .0086, pinky: .0076, thumb: .0108 };
  for (const finger of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const a = at(finger + '_01'), b = at(finger + '_02'), c = at(finger + '_03'), r = thick[finger] * h, reach = finger === 'thumb' ? .85 : .8;
    const tip = [c[0] + (c[0] - b[0]) * reach, c[1] + (c[1] - b[1]) * reach, c[2] + (c[2] - b[2]) * reach];
    add(rod(a, b, r * 1.04, r), .004); add(rod(b, c, r, r * .94), .003); add(rod(c, tip, r * .94, r * .8), .003);
    // The palm reaches each knuckle; the ball of the thumb is the thickest of it.
    if (finger === 'thumb') add(rod([mix(wrist[0], a[0], .15), wrist[1] - .004 * h, mix(wrist[2], a[2], .4)], a, .0155 * h, .0125 * h), .01);
    else add(rod([mix(wrist[0], a[0], .12), wrist[1], mix(wrist[2], a[2], .55)], a, .0128 * h, .0108 * h), .011);
  }
  void s;
}

/**
 * A head. Measures are a grown man's in metres, about the point between the
 * eyes and halfway back: the crown is .116 above it and the chin .116 below.
 */
function face(add, cut, design, rig) {
  const d = key => Number.isFinite(design[key]) ? clamp(design[key], -1, 1) : 0, sex = d01(design.sex), age = ageOf(design), weight = weightOf(design), heavy = Math.max(0, weight), thin = Math.max(0, -weight);
  const frame = headFrame(design, rig), { P, R, hs } = frame;
  const k = value => value * hs / rig.scale;
  const young = age.young;
  // The skull, the mask of the face, and the jaw.
  const jaw = (1 + d('jawWidth') * .16 + heavy * .1 - thin * .05) * mix(1, .93, sex) * (1 - young * .06), chinLong = d('chinLength') * .012 - young * .012, chinOut = d('chinProjection') * .01;
  add(egg(P(0, .026 + d('forehead') * .004, -.012), R(.0765, .0905 + d('forehead') * .004, .094)), 0);
  add(egg(P(0, -.002, .01), R(.064 * (1 + d('cheekbones') * .03), .062, .078)), k(.04));
  add(egg(P(0, -.05 + chinLong * .3, .018), R(.0555 * jaw, .066 + chinLong, .068), .08), k(.04));
  // Jaw corners, chin, cheekbones and cheeks.
  for (const side of [-1, 1]) {
    add(ball(P(side * .043 * jaw, -.07 + d('jawline') * .008, -.004), hs * (.017 + d('jawline') * .004 + heavy * .005)), k(.03));
    add(egg(P(side * (.05 + d('cheekbones') * .005), -.022 + d('cheekbones') * .003, .05), R(.022, .016, .022)), k(.028));
    add(egg(P(side * .048 * mix(jaw, 1, .5), -.04, .008), R(.02, .036, .032)), k(.03));
    const cheek = d('cheeks') * .5 + heavy * .8 + young * .5 - thin * .5 - age.old * .25;
    if (cheek > 0) add(egg(P(side * .04, -.052, .046), R(.022 + cheek * .01, .024 + cheek * .008, .02 + cheek * .008)), k(.03));
    else if (cheek < 0) cut(egg(P(side * .05, -.052, .07), R(.016, .022, .014 - cheek * .004)), k(.03));
  }
  add(egg(P(0, -.097 - chinLong, .064 + chinOut), R(.024 * (1 + d('chinWidth') * .3) * mix(1, .88, sex), .019, .02)), k(.022));
  // What weight hangs under the chin.
  if (heavy > .15) add(egg(P(0, -.108, .02), R(.05 * jaw, .022 + heavy * .02, .05)), k(.035));
  // Brow: the ridge over the eyes, heavier on a man.
  const ridge = mix(.0085, .005, sex) * (1 + d('browRidge') * .5) * (1 - young * .5), browY = .019 + d('browHeight') * .004;
  for (const side of [-1, 1]) add(rod(P(side * .012, browY - .001, .083), P(side * .047, browY + .001, .068), hs * ridge, hs * ridge * .8), k(.02));
  // Eyes: a socket each, the lids, and the eye in it.
  const open = (1 - age.old * .15) * (1 + d('eyeOpen') * .3), eyeX = .0315 * (1 + d('eyeSpacing') * .1), eyeY = d('eyeHeight') * .004, eyeSize = 1 + d('eyeSize') * .14 + young * .1, tilt = d('eyeTilt') * .22;
  for (const side of [-1, 1]) {
    // The hollow under the brow, then the slit between the lids, through which the eye shows.
    cut(egg(P(side * (eyeX + .002), eyeY - .001, .098), R(.021, .0135, .0125)), k(.014));
    cut(egg(P(side * eyeX, eyeY, .086), R(.0156 * eyeSize, .0068 * eyeSize * open, .013), 0, side * .12), k(.003));
  }
  frame.eyes = [-1, 1].map(side => ({ c: P(side * eyeX, eyeY + .0014, .0698), r: hs * .0126, side, tilt, open: (1 - age.old * .12) * (.84 + d('eyeSize') * .08), size: eyeSize }));
  // Nose: the bridge, the tip, the wings, and under them the nostrils.
  const noseLong = 1 + d('noseLength') * .16 - young * .16, noseWide = (1 + d('noseWidth') * .28) * mix(1, .9, sex), noseOut = 1 + d('noseProjection') * .25 - young * .2, bridge = d('noseBridge') * .004, tipY = -.036 * noseLong + d('noseTip') * .005;
  add(rod(P(0, .012, .085 + bridge * .5), P(0, tipY + .012, .094 + .014 * noseOut + bridge), hs * .0075, hs * .009), k(.014));
  add(egg(P(0, tipY, .096 + .014 * noseOut), R(.0092 * mix(noseWide, 1, .5), .0088, .0098)), k(.01));
  for (const side of [-1, 1]) {
    add(egg(P(side * .0135 * noseWide, tipY - .003, .091 + .004 * noseOut), R(.0066 * noseWide, .0064, .008)), k(.008));
    cut(egg(P(side * .0075 * noseWide, tipY - .0105, .094 + .005 * noseOut), R(.0038, .0032, .005)), k(.003));
  }
  // Mouth: the swell it sits on, two lips and the line between them.
  const mouthY = -.066 + d('mouthHeight') * .004 - young * .004 + (noseLong - 1) * -.01, mouthWide = .0265 * (1 + d('lipWidth') * .16), full = (1 + d('lipFullness') * .5) * mix(.82, 1.08, sex) * (1 - age.old * .25);
  add(egg(P(0, mouthY - .001, .066), R(.034, .022, .021)), k(.024));
  frame.mouth = { y: mouthY, wide: mouthWide, full };
  add(egg(P(0, mouthY + .0058 * full, .081), R(mouthWide * .8, .0046 * full, .0085)), k(.006));
  add(egg(P(0, mouthY - .0066 * full, .0795), R(mouthWide * .68, .0052 * full, .0085)), k(.0025));
  // Ears.
  const ear = 1 + d('ears') * .22 + age.old * .1;
  for (const side of [-1, 1]) {
    add(egg(P(side * .0775, -.008, -.008), R(.0065, .031 * ear, .0175 * ear), 0, side * (.42 + d('ears') * .16)), k(.006));
    cut(egg(P(side * .0835, -.004, -.004), R(.006, .019 * ear, .009 * ear), 0, side * .42), k(.004));
  }
  // Eyebrows and the red of the lips are painted on the skin where they belong.
  const browThick = (1 + d('brows') * .45) * mix(1, .72, sex) * (1 - age.old * .15), arch = d('browArch') * .003 + sex * .0015;
  // Each gives how far a point of the face is outside its patch (less than nought inside), in a grown head's metres.
  frame.marks = [
    [PAINT.brow, (x, y, z) => {
      const side = Math.abs(x); if (z < .055) return 1;
      const t = clamp((side - .008) / .045, 0, 1), line = browY + .0035 + Math.sin(Math.min(1, t * 1.25) * Math.PI) * (.0028 + arch) - t * t * .004 - (1 - t) * .001;
      return Math.max(Math.abs(y - line) - .0043 * browThick * (1 - t * t * .6), .008 - side, side - .053);
    }],
    [PAINT.lip, (x, y, z) => {
      const side = Math.abs(x) / mouthWide; if (z < .066) return 1;
      const line = mouthY + .0006 + side * side * (.001 + d('smile') * .003), bow = 1 - Math.pow(Math.min(1, side), 1.7);
      const dip = .0014 * Math.max(0, 1 - side * 5);
      return Math.max(y > line ? y - line - (.0076 * bow - dip) * full : line - y - .0102 * Math.pow(bow, .75) * full, (side - 1) * mouthWide);
    }],
  ];
  rig.head = frame;
}
/** The head's own frame: P places a point given in a grown head's metres, R sizes radii. */
export function headFrame(design, rig) {
  const d = key => Number.isFinite(design[key]) ? clamp(design[key], -1, 1) : 0, sex = d01(design.sex);
  const hs = rig.scale * rig.factor.head * mix(1, .955, sex), joint = rig.at('Head');
  const wx = 1 + d('headWidth') * .07, wz = 1 + d('headDepth') * .06;
  const c = [0, joint[1] + .115 * hs, joint[2] + .012 * hs];
  return { c, hs, wx, wz, P: (x, y, z) => [c[0] + x * hs * wx, c[1] + y * hs, c[2] + z * hs * wz], R: (x, y, z) => [x * hs * wx, y * hs, z * hs * wz] };
}

// --- What is worn ----------------------------------------------------------------------------
export const TOPS = ['tee', 'longsleeve', 'tank', 'shirt', 'polo', 'sweater', 'hoodie', 'bare'];
export const COATS = ['none', 'jacket', 'bomber', 'puffer', 'blazer', 'overcoat', 'parka', 'vest', 'open shirt'];
export const BOTTOMS = ['jeans', 'slim', 'baggy', 'slacks', 'sweats', 'shorts', 'long shorts', 'skirt', 'long skirt', 'leggings'];
export const SHOES = ['sneakers', 'boots', 'dress', 'sandals', 'high tops', 'heels', 'bare'];
export const HAIR = ['bald', 'buzz', 'short', 'crop', 'side part', 'curls', 'afro', 'bob', 'long', 'ponytail', 'bun', 'locs', 'mohawk', 'receding', 'top knot', 'braids'];
export const BEARDS = ['none', 'stubble', 'moustache', 'goatee', 'beard', 'long beard', 'chinstrap'];
export const HATS = ['none', 'cap', 'backwards cap', 'beanie', 'bucket', 'brim', 'hood', 'headscarf', 'hard hat'];
export const GLASSES = ['none', 'glasses', 'round', 'shades', 'aviators'];
export const BAGS = ['none', 'backpack', 'tote', 'crossbody'];

function wardrobe(design, rig) {
  const s = rig.scale, at = rig.at, worn = [], sex = d01(design.sex), weight = weightOf(design), heavy = Math.max(0, weight);
  const put = (shape, paint, k = 0) => worn.push([shape, { k: k * s, paint, source: 'skin' }]);
  const hip = at('thigh_l'), knee = at('calf_l'), ankle = at('foot_l'), toe = at('ball_l'), shoulder = at('upperarm_l'), elbow = at('lowerarm_l'), wrist = at('hand_l'), neck = at('neck_01'), s1 = at('spine_01'), s2 = at('spine_02'), s3 = at('spine_03'), head = at('Head');
  const far = 2 * s, zBack = -.022 * s, fit = clamp(Number.isFinite(design.fit) ? design.fit : 0, -1, 1), loose = 1 + fit * .5;
  const waistY = mix(hip[1], s1[1], .9), fork = hip[1] - .1 * s * rig.factor.torso;
  const girth = 1 + heavy * .42 - Math.max(0, -weight) * .1;

  // --- Legs and seat.
  const bottom = BOTTOMS.includes(design.bottom) ? design.bottom : 'jeans';
  const cutOf = { jeans: [.012, 1, .105, .088], slim: [.007, .3, .09, .07], baggy: [.02, 1.7, .125, .12], slacks: [.012, 1.1, .1, .09], sweats: [.016, 1.3, .112, .078], shorts: [.012, 1, .1, .094], 'long shorts': [.018, 1.5, .12, .12], leggings: [.003, 0, 0, 0], skirt: [.01, 0, 0, 0], 'long skirt': [.01, 0, 0, 0] }[bottom];
  const hemY = { shorts: mix(hip[1], knee[1], .55), 'long shorts': knee[1] - .03 * s, skirt: mix(hip[1], knee[1], .68), 'long skirt': mix(knee[1], ankle[1], .78), sweats: ankle[1] + .03 * s, leggings: ankle[1] + .04 * s }[bottom] ?? ankle[1] - .012 * s;
  const skirted = /skirt/.test(bottom), legBox = { min: [-.5 * s, hemY - .02 * s, -.4 * s], max: [.5 * s, waistY + .03 * s, .4 * s] };
  const legKeep = (x, y) => Math.max(hemY - y, y - waistY);
  {
    const [thick, ease, thighHalf, hemHalf] = cutOf;
    let shape = shell(thick * s, legBox);
    if (ease > 0) for (const side of [-1, 1]) {
      // The leg of the trousers hangs from the thigh instead of following the knee and calf.
      const from = [side * hip[0], hip[1] - .02 * s, hip[2]], to = [side * ankle[0], Math.min(hemY, knee[1]), ankle[2] + .006 * s], length = from[1] - to[1], k = clamp((from[1] - knee[1]) / length, .05, .95), g = (1 + heavy * .3) * mix(1, 1.04, sex), w = thighHalf * s * g * mix(1, loose, .5), e = hemHalf * s * mix(1, loose, .7) * (bottom === 'sweats' ? 1 : mix(1, g, .4));
      shape = either(shape, apart(loft(from, to, X, Z, [[0, w, w * 1.04, side * .006 * s, 0], [k * .5, mix(w, e, .35), mix(w, e, .35) * 1.04, side * .003 * s, 0], [k, mix(w, e, .7), mix(w, e, .7), 0, .002 * s], [1, e, e, 0, 0]]), side, fork, .005 * s));
    }
    if (skirted) {
      const length = waistY - hemY, flare = bottom === 'skirt' ? .22 : .3, hipHalf = mix(.172, .186, sex) * s * (1 + heavy * .28);
      shape = either(shape, loft([0, waistY, zBack], [0, hemY, zBack + .01 * s], X, Z, [[0, hipHalf * .8, hipHalf * .62], [.25 * (.3 * s / length), hipHalf * 1.02, hipHalf * .72], [1, hipHalf * (1.02 + flare), hipHalf * (.72 + flare)]]));
    }
    put(within(shape, legKeep, legBox, .014 * s), PAINT.bottom);
    // A waistband or a belt.
    put(within(shell((thick + .004) * s, legBox), (x, y) => Math.max(waistY - .035 * s - y, y - waistY), legBox), design.belt ? PAINT.trim : PAINT.bottom);
  }

  // --- The trunk and arms.
  const top = TOPS.includes(design.top) ? design.top : 'tee';
  const coat = COATS.includes(design.coat) ? design.coat : 'none';
  const collar = (x, y, z, r) => Math.max(r * s - Math.hypot(x, Math.min(0, y - (neck[1] + .012 * s)) * 1.15, z - zBack + .004 * s), y - (neck[1] + .034 * s));
  // How a shirt hangs: straight down from the chest and the shoulder blades instead of into the waist.
  const drape = (lowY, halfTop, depthTop, halfLow, depthLow, belly = 0) => loft([0, mix(s3[1], shoulder[1], .5), zBack + .004 * s], [0, lowY, zBack + (.006 + belly) * s], X, Z, [[0, halfTop, depthTop], [.45, mix(halfTop, halfLow, .6), mix(depthTop, depthLow, .7)], [1, halfLow, depthLow]], 2.3);
  const sleeveTube = (side, toX, r0, r1) => rod([side * (shoulder[0] - .02 * s), shoulder[1], shoulder[2]], [side * toX, wrist[1], wrist[2]], r0, r1);
  const chestHalf = mix(.168, .146, sex) * s * (shoulder[0] / (.192 * s)) * (1 + heavy * .2), chestDeep = mix(.112, .104, sex) * s * (1 + heavy * .26) + sex * .012 * s, bellyOut = heavy * .06;
  const armR = .05 * s * (1 + heavy * .28) * mix(1, .9, sex);
  if (top !== 'bare') {
    const spec = { tee: [.006, .3, .0, .1, .062], longsleeve: [.006, 1.02, .0, .1, .062], tank: [.004, -1, .02, .13, .09], shirt: [.007, 1.02, -.03, .074, .058], polo: [.007, .34, -.02, .08, .06], sweater: [.012, 1.02, -.02, .082, .06], hoodie: [.016, 1.02, -.04, .09, .066] }[top];
    const [thick, sleeve, hemDrop, , neckR] = spec, hemY = hip[1] - (.035 + hemDrop) * s, t = thick * s * (1 + Math.max(0, fit) * .6);
    const sleeveX = sleeve < 0 ? shoulder[0] - .035 * s : sleeve > 1 ? wrist[0] - .008 * s : mix(shoulder[0], elbow[0], sleeve * 2.2);
    const box = { min: [-sleeveX - .06 * s, hemY - .03 * s, -.4 * s], max: [sleeveX + .06 * s, neck[1] + .09 * s, .4 * s] };
    let shape = over(t, box);
    const ease = top === 'tank' ? .98 : (top === 'hoodie' || top === 'sweater' ? 1.07 : 1.03) * mix(1, loose, .45);
    shape = either(shape, drape(hemY, chestHalf * ease, chestDeep * ease, chestHalf * ease * mix(.94, 1.02, heavy), chestDeep * ease * mix(.9, 1.1, heavy), bellyOut));
    if (sleeve > 0) for (const side of [-1, 1]) shape = either(shape, sleeveTube(side, sleeveX, armR * ease * 1.1, sleeve > 1 ? .034 * s * ease : armR * ease));
    const keep = (x, y, z) => Math.max(hemY - y, sleeve < 0 ? (y > shoulder[1] - .13 * s ? Math.abs(x) - mix(shoulder[0] - .03 * s, .085 * s, smoothstep(shoulder[1] - .13 * s, shoulder[1] - .02 * s, y)) : -1) : Math.abs(x) - sleeveX, collar(x, y, z, neckR));
    put(within(shape, keep, box, .022 * s), PAINT.top);
    if (top === 'shirt' || top === 'polo') put(within(over(t + .005 * s, box), (x, y, z) => Math.max(collar(x, y, z, neckR), -collar(x, y, z, neckR + .024), neck[1] - .03 * s - y), box), PAINT.top);
    if (top === 'hoodie') {
      // The hood, down on the shoulders, and the pocket across the front.
      put(egg([0, neck[1] + .01 * s, zBack - .085 * s], [.105 * s, .07 * s, .06 * s], -.5), PAINT.top, .02);
      put(within(over(t + .006 * s, box), (x, y, z) => Math.max(Math.abs(x) - .105 * s, Math.abs(y - (hemY + .11 * s)) - .055 * s, -z), box), PAINT.top);
      put(within(over(t + .006 * s, box), (x, y) => Math.max(hemY + .03 * s - y > 0 ? -1 : 1, hemY - y), box), PAINT.top);
    }
  }
  if (coat !== 'none') {
    const spec = { jacket: [.016, 1.02, .0, 1.1, 0], bomber: [.022, 1.02, .02, 1.16, 0], puffer: [.036, 1.02, -.02, 1.22, 1], blazer: [.014, 1.02, -.1, 1.1, 0], overcoat: [.018, 1.02, -.52, 1.14, 0], parka: [.03, 1.02, -.26, 1.2, 0], vest: [.026, -1, .0, 1.14, 1], 'open shirt': [.01, .34, -.05, 1.07, 0] }[coat];
    const [thick, sleeve, hemDrop, ease0, quilted] = spec, hemY = hip[1] - (.03 + hemDrop) * s, t = thick * s, ease = ease0 * mix(1, loose, .4);
    const sleeveX = sleeve < 0 ? shoulder[0] - .03 * s : sleeve > 1 ? wrist[0] - .004 * s : mix(shoulder[0], elbow[0], sleeve * 2.2);
    const box = { min: [-sleeveX - .08 * s, hemY - .03 * s, -.45 * s], max: [sleeveX + .08 * s, neck[1] + .1 * s, .45 * s] };
    let shape = over(t, box);
    shape = either(shape, drape(hemY, chestHalf * ease, chestDeep * ease, chestHalf * ease * (1 + (hemDrop < -.2 ? .1 : 0)), chestDeep * ease * (1 + (hemDrop < -.2 ? .12 : 0)), bellyOut));
    if (sleeve > 0) for (const side of [-1, 1]) shape = either(shape, sleeveTube(side, sleeveX, armR * ease * 1.14, sleeve > 1 ? .038 * s * ease : armR * ease));
    // Worn open: a strip down the front shows what is under it, wider at the neck.
    const open = /blazer|overcoat|open shirt/.test(coat) ? .034 : coat === 'vest' || coat === 'puffer' ? 0 : .012;
    const front = (x, y, z) => z > zBack ? (open + Math.max(0, y - s2[1]) * (open > .02 ? .34 : .1) / s * s) * s - Math.abs(x) : -1;
    const ribs = quilted ? (x, y) => Math.cos((y - hemY) / (.062 * s) * Math.PI * 2) * .006 * s : null;
    const base = shape, quilt = ribs ? { min: base.min, max: base.max, d: (x, y, z, k, had) => base.d(x, y, z, k, had) + (Math.abs(x) < shoulder[0] + .01 * s ? ribs(x, y) : Math.cos((Math.abs(x) - shoulder[0]) / (.062 * s) * Math.PI * 2) * .006 * s) } : base;
    put(within(quilt, (x, y, z) => Math.max(hemY - y, sleeve < 0 ? (y > shoulder[1] - .14 * s ? Math.abs(x) - sleeveX : -1) : Math.abs(x) - sleeveX, collar(x, y, z, .072), front(x, y, z)), box, .02 * s), PAINT.coat);
    if (/jacket|blazer|overcoat|parka|open shirt/.test(coat)) put(within(over(t + .007 * s, box), (x, y, z) => Math.max(collar(x, y, z, .07), -collar(x, y, z, .104), neck[1] - .05 * s - y, front(x, y, z)), box), PAINT.coat);
    if (coat === 'parka') put(egg([0, neck[1] + .012 * s, zBack - .095 * s], [.12 * s, .075 * s, .065 * s], -.5), PAINT.coat, .02);
  }

  // --- Feet.
  const shoes = SHOES.includes(design.shoes) ? design.shoes : 'sneakers', f = rig.factor.feet * s;
  if (shoes !== 'bare') for (const side of [-1, 1]) {
    const x = side * ankle[0], heel = shoes === 'heels' ? .0 : 0;
    const topY = { boots: ankle[1] + .1 * s, 'high tops': ankle[1] + .045 * s, sandals: .03 * f, heels: .05 * f }[shoes] ?? ankle[1] - .012 * s;
    const box = { min: [x - .08 * f, -.01, ankle[2] - .1 * f], max: [x + .08 * f, topY + .02 * s, toe[2] + .12 * f] };
    const thick = shoes === 'sandals' ? .004 : shoes === 'dress' || shoes === 'heels' ? .006 : .011;
    let shape = shell(thick * f, box);
    // The toe box and the heel counter, so that a shoe is not a sock.
    if (shoes !== 'sandals') { shape = either(shape, egg([x + side * .006 * f, .034 * f, toe[2] + .028 * f], [.05 * f, shoes === 'boots' ? .04 * f : .033 * f, .064 * f])); shape = either(shape, egg([x, .045 * f, ankle[2] - .014 * f], [.042 * f, .046 * f, .05 * f])); }
    put(within(shape, (px, y) => y - topY, box, .012 * s), PAINT.shoe);
    // The sole, wider than the upper and flat to the ground.
    const sole = shoes === 'sneakers' || shoes === 'high tops' ? .03 : shoes === 'boots' ? .032 : .016;
    put(within(egg([x + side * .004 * f, .012 * f, mix(ankle[2], toe[2], .62)], [.054 * f, .05 * f, .152 * f]), (px, y) => Math.max(y - sole * f, -y - .002), box), shoes === 'sandals' ? PAINT.shoe : PAINT.sole);
    if (shoes === 'sneakers' || shoes === 'high tops' || shoes === 'boots') put(within(shell(.004 * s, { min: [x - .08 * f, topY, -1], max: [x + .08 * f, topY + .07 * s, 1] }), (px, y) => Math.max(topY - .01 * s - y, y - (topY + .05 * s)), { min: [x - .08 * f, topY - .02 * s, ankle[2] - .1 * f], max: [x + .08 * f, topY + .07 * s, ankle[2] + .1 * f] }), PAINT.sock);
    void heel;
  }
  hairAndHats(put, design, rig);
  // --- What is carried.
  const bag = BAGS.includes(design.bag) ? design.bag : 'none', back = zBack - (.1 + heavy * .03) * s - (coat !== 'none' ? .02 * s : 0);
  const slab = (c, r, round) => ({ min: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], max: [c[0] + r[0], c[1] + r[1], c[2] + r[2]], d: (x, y, z) => { const qx = Math.abs(x - c[0]) - r[0] + round, qy = Math.abs(y - c[1]) - r[1] + round, qz = Math.abs(z - c[2]) - r[2] + round; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round; } });
  const strapBox = { min: [-.3 * s, s1[1] - .1 * s, -.4 * s], max: [.3 * s, neck[1] + .06 * s, .4 * s] };
  if (bag === 'backpack') {
    put(slab([0, mix(s2[1], s3[1], .55), back - .055 * s], [.13 * s, .19 * s, .065 * s], .04 * s), PAINT.trim);
    put(within(over(.03 * s, strapBox), (x, y, z) => Math.max(Math.abs(Math.abs(x) - .105 * s) - .019 * s, s2[1] - y, z - .2 * s, -(z - back)), strapBox), PAINT.trim);
  } else if (bag === 'crossbody' || bag === 'tote') {
    const side = bag === 'tote' ? 1 : -1;
    if (bag === 'crossbody') {
      put(slab([-.19 * s * girth, hip[1] + .02 * s, zBack + .03 * s], [.035 * s, .075 * s, .1 * s], .02 * s), PAINT.trim);
      const n = Math.hypot(1, 1.05), box = { min: [-.3 * s, hip[1] - .05 * s, -.4 * s], max: [.3 * s, neck[1] + .07 * s, .4 * s] };
      put(within(over(.028 * s, box), (x, y) => Math.abs((x - .11 * s) * 1.05 + (y - (shoulder[1] + .02 * s))) / n - .015 * s, box), PAINT.trim);
    } else {
      put(slab([side * .215 * s * girth, hip[1] + .1 * s, zBack], [.03 * s, .15 * s, .16 * s], .012 * s), PAINT.trim);
      const box = { min: [0, hip[1], -.3 * s], max: [.3 * s, shoulder[1] + .08 * s, .3 * s] };
      put(within(over(.026 * s, box), (x, y, z) => Math.max(Math.abs(x - (shoulder[0] - .055 * s)) - .014 * s, s2[1] - y), box), PAINT.trim);
    }
  }
  void far; void head;
  return worn;
}

/** Where hair grows on a head: less than nought on the scalp. `back` moves the hairline at the front. */
function scalp(frame, recede = 0) {
  const { c, hs, wx, wz } = frame;
  return (x, y, z) => {
    const px = (x - c[0]) / (hs * wx), py = (y - c[1]) / hs, pz = (z - c[2]) / (hs * wz);
    // The line runs from the nape, over the ear and up round the temple to the forehead.
    const side = Math.abs(px);
    const nape = -.082, overEar = .022 + smoothstep(.05, .0, side) * 0, forehead = .071 + recede * .02 - smoothstep(.02, .06, side) * (.014 - recede * .03);
    let line = mix(nape, overEar, smoothstep(-.07, -.028, pz));
    line = mix(line, forehead, smoothstep(.012, .05, pz));
    // Sideburns come down a little in front of the ear.
    line -= .03 * smoothstep(-.02, -.006, pz) * (1 - smoothstep(.006, .02, pz)) * smoothstep(.05, .064, side);
    return (line - py) * hs;
  };
}
function hairAndHats(put, design, rig) {
  const frame = rig.head, { P, R, hs, c } = frame, s = rig.scale, age = ageOf(design), sex = d01(design.sex);
  const style = HAIR.includes(design.hairStyle) ? design.hairStyle : 'short', hat = HATS.includes(design.hat) ? design.hat : 'none';
  const box = { min: [c[0] - .12 * hs, c[1] - .16 * hs, c[2] - .14 * hs], max: [c[0] + .12 * hs, c[1] + .16 * hs, c[2] + .14 * hs] };
  const recede = (style === 'receding' ? 1 : 0) + (1 - sex) * age.old * .5, grows = scalp(frame, recede);
  const lump = (x, y, z, f, a) => (Math.sin(x * f) * Math.sin(y * f * 1.13 + 1.7) * Math.sin(z * f * .91 + .6)) * a;
  // Hair grows on skin, not on a collar; a hat sits on whatever is there.
  const cover = (thick, rough = 0, grain = 0, onSkin = true) => ({ min: box.min, max: box.max, hull: null, d: (x, y, z, skin, had) => (onSkin && skin - had > .0015 * hs ? 1 : 0) + (onSkin ? skin : had) - thick * hs + (rough ? lump(x / hs, y / hs, z / hs, grain, rough * hs) : 0) });
  const hatted = hat !== 'none' && hat !== 'hood';
  // A hat presses down what is under it.
  const crush = hatted ? .45 : 1;
  const mass = (shape, keep = null, k = .012, hard = false) => { const made = keep ? within(shape, keep, shape.hull === null ? box : null, hard ? 0 : .014 * hs) : shape; if (hard) delete made.edge; put(made, PAINT.hair, k * hs / s); };
  if (style !== 'bald') {
    const crown = (x, y, z) => grows(x, y, z);
    if (style === 'buzz') mass(cover(.0035), crown, 0);
    else if (style === 'short' || style === 'receding') { mass(cover(.009 * crush), crown, 0); mass(egg(P(0, .07, -.004), R(.074, .058 * crush, .09)), crown); }
    else if (style === 'crop') { mass(cover(.005), crown, 0); mass(egg(P(0, .082, .012), R(.066, .05 * crush, .082)), (x, y, z) => Math.max(crown(x, y, z), (c[1] + .055 * hs) - y)); }
    else if (style === 'side part') { mass(cover(.009 * crush), crown, 0); mass(egg(P(.012, .078, .008), R(.076, .052 * crush, .092), .08), crown); mass(egg(P(.03, .088, .05), R(.05, .03 * crush, .04), -.3), crown); }
    else if (style === 'curls') { mass(cover(.02 * crush, .006, 95), crown, 0); mass({ ...egg(P(0, .07, -.002), R(.086, .07 * crush, .1)), d: (x, y, z) => egg(P(0, .07, -.002), R(.086, .07 * crush, .1)).d(x, y, z) + lump(x / hs, y / hs, z / hs, 95, .006 * hs) }, crown); }
    else if (style === 'afro') { const big = egg(P(0, .05, -.012), R(.125, .12 * mix(1, crush, .6), .13)); mass({ min: big.min, max: big.max, d: (x, y, z) => big.d(x, y, z) + lump(x / hs, y / hs, z / hs, 120, .004 * hs) }, (x, y, z) => Math.max(crown(x, y, z) - .012 * hs, (c[2] + .04 * hs - z) > 0 ? -1 : (c[1] + .058 * hs) - y), .012, true); }
    else if (style === 'mohawk') { mass(cover(.003), crown, 0); mass(egg(P(0, .085, -.01), R(.02, .075, .105)), crown, .006); }
    else if (style === 'bob' || style === 'long' || style === 'braids' || style === 'locs') {
      const low = style === 'bob' ? -.1 : style === 'long' ? -.3 : -.27, strands = style === 'braids' || style === 'locs';
      mass(cover(.012 * crush), crown, 0); mass(egg(P(0, .066, -.006), R(.082, .062 * crush, .096)), crown);
      // The fall of it: a curtain round the back and sides of the head, open at the face.
      const fall = loft(P(0, .06, -.02), P(0, low, style === 'bob' ? -.015 : -.045), X, Z, [[0, .085 * hs, .092 * hs], [.3, .094 * hs, .098 * hs], [.62, (style === 'bob' ? .098 : .1) * hs, .085 * hs], [1, (style === 'bob' ? .09 : .105) * hs, (style === 'bob' ? .08 : .05) * hs]]);
      const rope = strands ? (x, y, z) => Math.abs(Math.sin(Math.atan2(x - c[0], z - c[2] + .02 * hs) * (style === 'locs' ? 11 : 16))) * .007 * hs : () => 0;
      const hollow = loft(P(0, .06, -.02), P(0, low - .05, style === 'bob' ? -.015 : -.045), X, Z, [[0, .06 * hs, .066 * hs], [.3, .068 * hs, .072 * hs], [1, .074 * hs, .03 * hs]]);
      mass({ min: fall.min, max: fall.max, d: (x, y, z) => fall.d(x, y, z) + rope(x, y, z) }, (x, y, z) => {
        const py = (y - c[1]) / hs, pz = (z - c[2]) / hs, px = Math.abs(x - c[0]) / hs;
        // Open at the face: nothing forward of the ears below the brow, and hollow where the head and neck are.
        if (py > .035) return crown(x, y, z);
        return Math.max((pz - mix(-.005, .012, smoothstep(.06, .09, px))) * hs, -hollow.d(x, y, z));
      }, .01);
    } else if (style === 'ponytail' || style === 'bun' || style === 'top knot') {
      mass(cover(.008 * crush), crown, 0); mass(egg(P(0, .07, -.008), R(.076, .05 * crush, .09)), crown);
      if (style === 'bun') mass(ball(P(0, .055, -.112), .04 * hs), null, .015);
      else if (style === 'top knot') mass(ball(P(0, .135, -.03), .033 * hs), null, .012);
      else { mass(rod(P(0, .05, -.1), P(0, -.02, -.14), .028 * hs, .03 * hs), null, .012); mass(rod(P(0, -.02, -.14), P(0, -.2, -.105), .03 * hs, .012 * hs), null, .012); }
    }
  }
  // Hair on the face.
  const beard = BEARDS.includes(design.beard) ? design.beard : 'none';
  if (beard !== 'none' && ageOf(design).years >= 15) {
    const mouth = frame.mouth, local = (x, y, z) => [(x - c[0]) / (hs * frame.wx), (y - c[1]) / hs, (z - c[2]) / (hs * frame.wz)];
    const jawline = (x, y, z) => { const [px, py, pz] = local(x, y, z), side = Math.abs(px); return Math.max(py - mix(-.05, .0, smoothstep(.028, .072, side)), -(pz - mix(-.03, .02, smoothstep(.07, .03, side))), -.135 - py) * hs; };
    const lipGap = (x, y, z) => { const [px, py] = local(x, y, z); return (.0085 - Math.hypot(px * .34, py - mouth.y + .001)) * hs; };
    const lower = (x, y, z) => Math.max(jawline(x, y, z), lipGap(x, y, z), (y - (c[1] + (mouth.y + .034) * hs)));
    const tash = () => { for (const side of [-1, 1]) put(rod(P(side * .003, mouth.y + .0125, .092), P(side * (mouth.wide + .004), mouth.y + .004, .079), .0052 * hs, .003 * hs), PAINT.hair, .003 * hs / s); };
    if (beard === 'stubble') put(within(cover(.0012), lower, box), PAINT.brow);
    if (beard === 'beard') { put(within(cover(.007, .0008, 150), lower, box, .01 * hs), PAINT.hair); tash(); }
    if (beard === 'long beard') { put(within(cover(.01, .0008, 150), lower, box, .01 * hs), PAINT.hair); put(egg(P(0, -.15, .05), R(.05, .07, .034), .25), PAINT.hair, .02 * hs / s); tash(); }
    if (beard === 'chinstrap') put(within(cover(.005), (x, y, z) => Math.max(lower(x, y, z), (y - (c[1] - .07 * hs)) - Math.max(0, Math.abs(x - c[0]) - .045 * hs) * 2), box), PAINT.hair);
    if (beard === 'goatee') { put(within(cover(.008), (x, y, z) => Math.max(lower(x, y, z), Math.abs(x - c[0]) - .026 * hs), box), PAINT.hair); tash(); }
    if (beard === 'moustache') tash();
  }
  // Hats.
  const dome = (thick, lowFront, lowBack) => within(cover(thick, 0, 0, false), (x, y, z) => { const pz = (z - c[2]) / hs; return (c[1] + mix(lowBack, lowFront, smoothstep(-.09, .08, pz)) * hs) - y; }, box);
  const disc = (centre, rx, rz, thick) => ({ min: [centre[0] - rx, centre[1] - thick, centre[2] - rz], max: [centre[0] + rx, centre[1] + thick, centre[2] + rz], d: (x, y, z) => { const k0 = Math.hypot((x - centre[0]) / rx, (z - centre[2]) / rz), flat = (k0 - 1) * Math.min(rx, rz), up = Math.abs(y - centre[1]) - thick; return Math.max(flat, up); } });
  if (hat === 'cap' || hat === 'backwards cap') {
    const turn = hat === 'cap' ? 1 : -1;
    put(dome(.012, .05, .03), PAINT.hat); put(egg(P(0, .075, -.004), R(.083, .052, .1)), PAINT.hat, .01 * hs / s);
    put(within(disc(P(0, .05, turn * .1), .07 * hs, .075 * hs, .0035 * hs), (x, y, z) => turn > 0 ? (c[2] + .075 * hs) - z : z - (c[2] - .08 * hs), null), PAINT.hat, .004 * hs / s);
  } else if (hat === 'beanie') { put(dome(.016, .052, .0), PAINT.hat); put(egg(P(0, .085, -.012), R(.08, .058, .094)), PAINT.hat, .012 * hs / s); put(within(cover(.021, 0, 0, false), (x, y, z) => Math.max((c[1] + mix(.0, .052, smoothstep(-.09, .08, (z - c[2]) / hs)) * hs) - y, y - (c[1] + mix(.03, .08, smoothstep(-.09, .08, (z - c[2]) / hs)) * hs)), box), PAINT.hat); }
  else if (hat === 'bucket' || hat === 'brim' || hat === 'hard hat') {
    put(dome(hat === 'hard hat' ? .02 : .012, .055, .035), PAINT.hat); put(egg(P(0, hat === 'brim' ? .09 : .08, -.006), R(.084, hat === 'brim' ? .062 : .055, .1)), PAINT.hat, .008 * hs / s);
    const wide = hat === 'bucket' ? .118 : hat === 'brim' ? .135 : .105;
    put(disc(P(0, .05, hat === 'hard hat' ? .012 : -.004), wide * hs, (wide + .015) * hs, .0035 * hs), PAINT.hat, (hat === 'bucket' ? .02 : .006) * hs / s);
  } else if (hat === 'headscarf') {
    put(dome(.011, .058, -.12), PAINT.hat);
    put(within(loft(P(0, .08, -.012), P(0, -.2, -.02), X, Z, [[0, .084 * hs, .1 * hs], [.4, .09 * hs, .1 * hs], [.75, .085 * hs, .088 * hs], [1, .11 * hs, .075 * hs]]), (x, y, z) => { const py = (y - c[1]) / hs, pz = (z - c[2]) / hs, px = Math.abs(x - c[0]) / hs; return py > -.105 && py < .06 ? (pz - mix(.02, .058, smoothstep(.066, .03, px)) - Math.max(0, -.07 - py) * .9) * hs : py >= .06 ? ((c[1] + .058 * hs) - y > 0 && pz > .03 ? 1 : -1) : -1; }, null), PAINT.hat, .008 * hs / s);
  } else if (hat === 'hood') {
    put(within(loft(P(0, .13, -.02), P(0, -.17, -.03), X, Z, [[0, .06 * hs, .08 * hs], [.2, .096 * hs, .112 * hs], [.6, .1 * hs, .108 * hs], [1, .1 * hs, .08 * hs]]), (x, y, z) => { const py = (y - c[1]) / hs, pz = (z - c[2]) / hs; return (pz - (.066 - Math.max(0, py - .06) * .5 - Math.max(0, -.05 - py) * .25)) * hs; }, null), design.coat === 'parka' ? PAINT.coat : PAINT.top, .01 * hs / s);
  }
}

// --- From the field to a surface -----------------------------------------------------------
/** Triangles where the grid's field crosses nought: one vertex in each cell the surface passes through. */
function surface(grid, out, sample) {
  const { min, cell, n, field, paint } = grid, [nx, ny, nz] = n, plane = nx * ny, cells = new Int32Array(nx * ny * nz).fill(-1);
  const corner = [0, 1, nx, nx + 1, plane, plane + 1, plane + nx, plane + nx + 1], offset = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const value = new Float32Array(8), first = out.position.length / 3;
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const at = (k * ny + j) * nx + i; let inside = 0;
    for (let c = 0; c < 8; c++) { value[c] = field[at + corner[c]]; if (value[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, count = 0;
    for (const [a, b] of edges) {
      if ((value[a] < 0) === (value[b] < 0)) continue;
      const t = value[a] / (value[a] - value[b]);
      sx += offset[a][0] + (offset[b][0] - offset[a][0]) * t; sy += offset[a][1] + (offset[b][1] - offset[a][1]) * t; sz += offset[a][2] + (offset[b][2] - offset[a][2]) * t; count++;
    }
    sx /= count; sy /= count; sz /= count;
    // Painted as the nearest corner that is inside.
    let best = -1, near = 1e9;
    for (let c = 0; c < 8; c++) if (value[c] < 0) { const dist = Math.abs(offset[c][0] - sx) + Math.abs(offset[c][1] - sy) + Math.abs(offset[c][2] - sz); if (dist < near) { near = dist; best = c; } }
    cells[at] = out.position.length / 3;
    const x = min[0] + (i + sx) * cell, y = min[1] + (j + sy) * cell, z = min[2] + (k + sz) * cell;
    out.position.push(x, y, z); out.paint.push(paint[at + corner[best]]); out.under.push(grid.under[at + corner[best]]);
    // The way the surface faces is the way the field rises.
    const g = sample(x, y, z); out.normal.push(g[0], g[1], g[2]);
  }
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) out.index.push(a, c, b, a, d, c); else out.index.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const at = (k * ny + j) * nx + i, here = field[at] < 0;
    if (here !== (field[at + 1] < 0)) quad(cells[at - nx - plane], cells[at - plane], cells[at], cells[at - nx], !here);
    if (here !== (field[at + nx] < 0)) quad(cells[at - 1 - plane], cells[at - 1], cells[at], cells[at - plane], !here);
    if (here !== (field[at + plane] < 0)) quad(cells[at - 1 - nx], cells[at - nx], cells[at], cells[at - 1], !here);
  }
  return first;
}
/** The slope of a grid's field at a point, as a unit vector pointing out of the surface. */
function slopeOf(grid) {
  const { min, cell, n, field } = grid, [nx, ny, nz] = n, plane = nx * ny;
  const read = (x, y, z) => {
    const fx = clamp((x - min[0]) / cell, 0, nx - 1.001), fy = clamp((y - min[1]) / cell, 0, ny - 1.001), fz = clamp((z - min[2]) / cell, 0, nz - 1.001), i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, at = (k * ny + j) * nx + i;
    const a = field[at] + (field[at + 1] - field[at]) * u, b = field[at + nx] + (field[at + nx + 1] - field[at + nx]) * u, c = field[at + plane] + (field[at + plane + 1] - field[at + plane]) * u, e = field[at + plane + nx] + (field[at + plane + nx + 1] - field[at + plane + nx]) * u;
    return (a + (b - a) * v) + ((c + (e - c) * v) - (a + (b - a) * v)) * w;
  };
  const h = cell * .9;
  return (x, y, z) => { const gx = read(x + h, y, z) - read(x - h, y, z), gy = read(x, y + h, z) - read(x, y - h, z), gz = read(x, y, z + h) - read(x, y, z - h), length = Math.hypot(gx, gy, gz) || 1; return [gx / length, gy / length, gz / length]; };
}

// --- Which bones move a point --------------------------------------------------------------
/** Returns a function of a place and its paint giving up to four [bone, share] pairs. */
function binding(rig, design) {
  const s = rig.scale, at = rig.at, id = name => rig.index.get(name);
  const hip = at('thigh_l'), knee = at('calf_l'), ankle = at('foot_l'), toe = at('ball_l'), shoulder = at('upperarm_l'), elbow = at('lowerarm_l'), wrist = at('hand_l');
  const spine = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'].map(name => ({ bone: id(name), y: at(name)[1] }));
  spine[0].y = -1e3;
  const skirted = /skirt/.test(design.bottom || ''), hs = rig.factor.hands * s;
  const fingers = side => ['index', 'middle', 'ring', 'pinky', 'thumb'].map(finger => { const suffix = side > 0 ? '_l' : '_r', joints = [1, 2, 3].map(n => at(`${finger}_0${n}${suffix}`)), b = joints[1], c = joints[2]; joints.push([c[0] + (c[0] - b[0]) * .85, c[1] + (c[1] - b[1]) * .85, c[2] + (c[2] - b[2]) * .85]); return { joints, bones: [1, 2, 3].map(n => id(`${finger}_0${n}${suffix}`)), thumb: finger === 'thumb' }; });
  const hands = { 1: fingers(1), [-1]: fingers(-1) };
  const segment = (p, a, b) => { const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], t = clamp(((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (bx * bx + by * by + bz * bz || 1e-9), 0, 1); return [Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - by * t, p[2] - a[2] - bz * t), t]; };
  return (x, y, z, paint) => {
    const side = x >= 0 ? 1 : -1, ax = Math.abs(x), suffix = side > 0 ? '_l' : '_r', shares = new Map(), give = (bone, share) => { if (share > 1e-4) shares.set(bone, (shares.get(bone) || 0) + share); };
    // How much of this point is arm, how much leg; the rest is trunk, neck and head.
    let arm = (ax > shoulder[0] + .04 * s ? 1 : smoothstep(shoulder[0] - .07 * s, shoulder[0] + .04 * s, ax) * smoothstep(shoulder[1] - .13 * s, shoulder[1] - .06 * s, y)) * smoothstep(shoulder[1] - .24 * s, shoulder[1] - .15 * s, y);
    if (y > shoulder[1] + .1 * s && ax < shoulder[0] + .1 * s) arm *= 1 - smoothstep(shoulder[1] + .1 * s, shoulder[1] + .16 * s, y);
    let leg = (1 - arm) * (1 - smoothstep(hip[1] - .1 * s, hip[1] + .035 * s, y));
    // A skirt hangs from the hips and is only nudged by the thighs.
    if (skirted && paint === PAINT.bottom) leg *= .42;
    if (arm > 0) {
      const lower = smoothstep(elbow[0] - .045 * s, elbow[0] + .045 * s, ax), palm = smoothstep(wrist[0] - .02 * s, wrist[0] + .022 * s, ax);
      if (palm > 0 && rig.mitten) give(id('hand' + suffix), arm * palm);
      else if (palm > 0) {
        // In the hand: the finger whose bones are nearest, if any is near.
        let best = null, near = 1e9, where = 0, which = 0;
        const p = [x, y, z];
        for (const finger of hands[side]) for (let j = 0; j < 3; j++) { const [dist, t] = segment(p, finger.joints[j], finger.joints[j + 1]), scaled = dist / (finger.thumb ? 1.15 : 1); if (scaled < near) { near = scaled; best = finger; where = t; which = j; } }
        const knuckle = best.joints[0], inFinger = best.thumb ? 1 - smoothstep(.014 * hs, .022 * hs, near) : smoothstep(-.012 * hs, .006 * hs, ax - Math.abs(knuckle[0])) * (1 - smoothstep(.016 * hs, .024 * hs, near));
        const fingerShare = arm * palm * inFinger;
        if (fingerShare > 0) {
          // Along a finger each joint hands over to the next across a short reach.
          const next = which < 2 ? smoothstep(.72, 1, where) * .5 : 0, last = which > 0 ? (1 - smoothstep(0, .28, where)) * .5 : 0;
          give(best.bones[which], fingerShare * (1 - next - last)); if (next) give(best.bones[which + 1], fingerShare * next); if (last) give(best.bones[which - 1], fingerShare * last);
        }
        give(id('hand' + suffix), arm * palm * (1 - inFinger));
      }
      give(id('lowerarm' + suffix), arm * lower * (1 - palm)); give(id('upperarm' + suffix), arm * (1 - lower));
    }
    if (leg > 0) {
      // Between the legs both thighs have a say.
      const own = skirted && paint === PAINT.bottom ? smoothstep(-.1 * s, .1 * s, ax) * .5 + .5 : smoothstep(-.012 * s, .012 * s, ax) * .5 + .5;
      const shin = smoothstep(knee[1] + .05 * s, knee[1] - .05 * s, y), foot = smoothstep(ankle[1] + .035 * s, ankle[1] - .03 * s, y), toes = foot * smoothstep(toe[2] - .02 * s, toe[2] + .025 * s, z);
      for (const [sfx, share] of [[suffix, own], [side > 0 ? '_r' : '_l', 1 - own]]) {
        if (share <= 0) continue;
        give(id('thigh' + sfx), leg * share * (1 - shin)); give(id('calf' + sfx), leg * share * shin * (1 - foot)); give(id('foot' + sfx), leg * share * (foot - toes)); give(id('ball' + sfx), leg * share * toes);
      }
    }
    const trunk = 1 - arm - leg;
    if (trunk > 0) {
      // Up the spine each joint hands over to the next; the collarbones carry the tops of the shoulders.
      let i = 0; while (i + 1 < spine.length && spine[i + 1].y < y) i++;
      const lowBlend = i > 0 ? 1 - smoothstep(spine[i].y, spine[i].y + .05 * s, y) : 0, highBlend = i + 1 < spine.length ? smoothstep(spine[i + 1].y - .05 * s, spine[i + 1].y, y) : 0;
      const collar = smoothstep(.035 * s, .13 * s, ax) * smoothstep(shoulder[1] - .1 * s, shoulder[1] - .02 * s, y) * (1 - smoothstep(shoulder[1] + .12 * s, shoulder[1] + .2 * s, y)) * .75;
      give(id('clavicle' + suffix), trunk * collar);
      const rest = trunk * (1 - collar);
      give(spine[i].bone, rest * (1 - lowBlend * .5 - highBlend * .5)); if (lowBlend) give(spine[i - 1].bone, rest * lowBlend * .5); if (highBlend) give(spine[i + 1].bone, rest * highBlend * .5);
    }
    const list = [...shares].sort((a, b) => b[1] - a[1]).slice(0, 4), total = list.reduce((sum, item) => sum + item[1], 0) || 1;
    return list.map(([bone, share]) => [bone, share / total]);
  };
}

// --- Colours -----------------------------------------------------------------------------------
const hex = value => { if (Array.isArray(value)) return value; const n = typeof value === 'number' ? value : parseInt(String(value).replace('#', ''), 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(c => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4)); };
/** The colour of each kind of paint for a design, in linear light. */
export function palette(design) {
  const age = ageOf(design), skin = hex(design.skin ?? '#b98563'), hair0 = hex(design.hair ?? '#1c1512'), grey = hex('#b9b6b0'), hair = hair0.map((c, i) => mix(c, grey[i], design.dyed ? 0 : age.grey * .9));
  const lip = design.lips ? hex(design.lips) : skin.map((c, i) => mix(c, [.36, .07, .08][i], .5) * .85), colours = [];
  colours[PAINT.skin] = skin; colours[PAINT.top] = hex(design.topColour ?? '#d7d4cc'); colours[PAINT.bottom] = hex(design.bottomColour ?? '#27364f'); colours[PAINT.hair] = hair;
  colours[PAINT.shoe] = hex(design.shoeColour ?? '#e8e6e0'); colours[PAINT.coat] = hex(design.coatColour ?? '#2b2d31'); colours[PAINT.hat] = hex(design.hatColour ?? '#1d2a44'); colours[PAINT.sole] = hex(design.soleColour ?? (/sneakers|high tops/.test(design.shoes ?? 'sneakers') ? '#e9e7e1' : '#17171a'));
  colours[PAINT.lip] = lip; colours[PAINT.white] = hex('#e9e6e1'); colours[PAINT.iris] = hex(design.eyes ?? '#4a3323'); colours[PAINT.pupil] = hex('#050505'); colours[PAINT.brow] = hair.map((c, i) => mix(c, skin[i], .12));
  colours[PAINT.trim] = hex(design.trimColour ?? '#191a1d'); colours[PAINT.sock] = hex(design.sockColour ?? '#e6e4de'); colours[PAINT.nail] = skin; colours[PAINT.frame] = hex(design.glassesColour ?? '#111113');
  return colours;
}

// --- Eyes and glasses: small enough to be made of triangles directly -------------------------
function eyes(out, rig, design) {
  const head = rig.index.get('Head');
  for (const eye of rig.head.eyes) {
    // Rings about the line of sight: the pupil, the iris, then the white.
    const bands = [[0, .2, PAINT.pupil], [.2, .5, PAINT.iris], [.5, 1.25, PAINT.white], [1.25, 2.3, PAINT.white]], sides = 14;
    for (const [from, to, paint] of bands) {
      const base = out.position.length / 3;
      for (const angle of [from, to]) for (let k = 0; k < sides; k++) {
        const turn = k / sides * Math.PI * 2, n = [Math.sin(angle) * Math.cos(turn), Math.sin(angle) * Math.sin(turn), Math.cos(angle)];
        out.position.push(eye.c[0] + n[0] * eye.r, eye.c[1] + n[1] * eye.r, eye.c[2] + n[2] * eye.r); out.normal.push(n[0], n[1], n[2]); out.paint.push(paint); out.blend.push(paint, 0); out.bones.push([[head, 1]]);
      }
      for (let k = 0; k < sides; k++) { const a = base + k, b = base + (k + 1) % sides, c = a + sides, e = b + sides; if (from > 0) out.index.push(a, e, b); out.index.push(a, c, e); }
    }
  }
  const kind = GLASSES.includes(design.glasses) ? design.glasses : 'none';
  if (kind === 'none') return;
  const { P, hs } = rig.head, dark = kind === 'shades' || kind === 'aviators', wire = hs * (kind === 'aviators' || kind === 'round' ? .0011 : .0019);
  const tube = (a, b, r, paint = PAINT.frame) => {
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], length = Math.hypot(...dir) || 1, w = dir.map(v => v / length), u0 = Math.abs(w[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = [u0[1] * w[2] - u0[2] * w[1], u0[2] * w[0] - u0[0] * w[2], u0[0] * w[1] - u0[1] * w[0]], ul = Math.hypot(...u), un = u.map(v => v / ul), vn = [w[1] * un[2] - w[2] * un[1], w[2] * un[0] - w[0] * un[2], w[0] * un[1] - w[1] * un[0]];
    const base = out.position.length / 3, sides = 5;
    for (const end of [a, b]) for (let k = 0; k < sides; k++) { const t = k / sides * Math.PI * 2, n = [0, 1, 2].map(i => un[i] * Math.cos(t) + vn[i] * Math.sin(t)); out.position.push(end[0] + n[0] * r, end[1] + n[1] * r, end[2] + n[2] * r); out.normal.push(...n); out.paint.push(paint); out.blend.push(paint, 0); out.bones.push([[head, 1]]); }
    for (let k = 0; k < sides; k++) { const p = base + k, q = base + (k + 1) % sides; out.index.push(p, q, q + sides, p, q + sides, p + sides); }
  };
  const eyeY = rig.head.eyes[0].c[1], z = rig.head.c[2] + .0925 * hs * rig.head.wz, rx = (kind === 'round' ? .0205 : kind === 'aviators' ? .026 : .0245) * hs, ry = (kind === 'round' ? .0205 : kind === 'aviators' ? .023 : .0175) * hs, power = kind === 'round' ? 2 : kind === 'aviators' ? 2.4 : 4;
  for (const eye of rig.head.eyes) {
    const cx = eye.c[0] * 1.04, ring = [], steps = 20;
    for (let k = 0; k < steps; k++) { const t = k / steps * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), r = Math.pow(Math.pow(Math.abs(c), power) + Math.pow(Math.abs(sn), power), -1 / power); ring.push([cx + c * r * rx, eyeY - .002 * hs + sn * r * ry, z - Math.abs(c * r * rx + (cx - eye.c[0])) * .12]); }
    for (let k = 0; k < steps; k++) tube(ring[k], ring[(k + 1) % steps], wire);
    if (dark) { const base = out.position.length / 3; out.position.push(cx, eyeY - .002 * hs, z); out.normal.push(0, 0, 1); out.paint.push(PAINT.pupil); out.blend.push(PAINT.pupil, 0); out.bones.push([[head, 1]]); for (const p of ring) { out.position.push(p[0], p[1], p[2]); out.normal.push(0, 0, 1); out.paint.push(PAINT.pupil); out.blend.push(PAINT.pupil, 0); out.bones.push([[head, 1]]); } for (let k = 0; k < steps; k++) out.index.push(base, base + 1 + k, base + 1 + (k + 1) % steps); }
    // The arm back to the ear.
    tube([cx + eye.side * rx, eyeY + .002 * hs, z - .004 * hs], [eye.side * .0795 * hs * rig.head.wx, eyeY + .004 * hs, rig.head.c[2] - .005 * hs], wire);
  }
  tube([rig.head.eyes[0].c[0] * 1.04 + rx, eyeY + .003 * hs, z], [rig.head.eyes[1].c[0] * 1.04 - rx, eyeY + .003 * hs, z], wire);
}

// --- Putting a body together ----------------------------------------------------------------
/** How fine the surface is cut: the size of a cell, in metres at full height, for the body, the head and the hands. */
export const DETAIL = { close: { body: .0105, head: .0031, hand: .0044 }, near: { body: .014, head: .0048, hand: .0065 }, far: { body: .024, head: .0085, hand: .012 }, crowd: { body: .03, head: .0115, hand: .022, mitten: true }, distant: { body: .048, head: .021, hand: .034, mitten: true } };

/**
 * Grow a body from a design.
 * `motion` is motion.json (for the skeleton). Returns { position, normal,
 * colour (linear), paint, skinIndex, skinWeight, index, rig, height, palette }
 * as typed arrays, standing in the pose the skeleton rests in: arms out,
 * feet at the origin, facing +Z.
 */
export function buildBody(design, motion, { detail = 'close' } = {}) {
  const rig = createRig(motion, design), s = rig.scale, cells = typeof detail === 'string' ? DETAIL[detail] : detail;
  rig.mitten = Boolean(cells.mitten);
  const { flesh, worn } = anatomy(design, rig), bind = binding(rig, design);
  const out = { position: [], normal: [], paint: [], under: [], blend: [], index: [], bones: [] };
  const wrist = rig.at('hand_l')[0], neckY = mix(rig.at('neck_01')[1], rig.at('Head')[1], .55), head = rig.head;
  // Three kinds of block, cut finer where there is more to see: the body, the head above the middle of the neck, and each hand.
  const zones = [
    { cell: cells.body * s, min: [-wrist, -.02 * s, -.42 * s], max: [wrist, neckY, .42 * s], open: [[0, -1], [0, 1], [1, 1]] },
    { cell: cells.head * s, min: [-.3 * head.hs, neckY, head.c[2] - .32 * head.hs], max: [.3 * head.hs, head.c[1] + .34 * head.hs, head.c[2] + .34 * head.hs], open: [[1, -1]] },
    { cell: cells.hand * s, min: [wrist, rig.at('hand_l')[1] - .09 * s, -.2 * s], max: [wrist + .26 * s, rig.at('hand_l')[1] + .06 * s, .1 * s], open: [[0, -1]] },
    { cell: cells.hand * s, min: [-wrist - .26 * s, rig.at('hand_l')[1] - .09 * s, -.2 * s], max: [-wrist, rig.at('hand_l')[1] + .06 * s, .1 * s], open: [[0, 1]] },
  ];
  for (const zone of zones) {
    // Blocks overlap a little where they meet, so that no gap shows between them.
    const min = zone.min.slice(), max = zone.max.slice(), lap = zone.cell * 2.5;
    for (const [axis, way] of zone.open) { if (way < 0) min[axis] -= lap; else max[axis] += lap; }
    // No more of the block than there is something in.
    let hull = null;
    for (const [shape, options] of [...flesh, ...worn]) { const h = options.cut ? null : hullOf(shape); if (h && [0, 1, 2].every(k => h.min[k] < max[k] && h.max[k] > min[k])) hull = joinHulls(hull, h); }
    if (!hull) continue;
    for (let k = 0; k < 3; k++) { min[k] = Math.max(min[k], hull.min[k] - .05 * s); max[k] = Math.min(max[k], hull.max[k] + .05 * s); }
    if (zone === zones[0]) min[0] = -Math.ceil(-min[0] / zone.cell) * zone.cell;
    const grid = createGrid(min, max, zone.cell);
    for (const [shape, options] of flesh) stamp(grid, shape, options);
    const skin = grid.field.slice();
    worn.forEach(([shape, options], i) => stamp(grid, shape, { k: options.k, id: i + 1, source: skin }));
    const from = out.position.length / 3;
    surface(grid, out, slopeOf(grid));
    // What each vertex is painted: the garment that is outermost there, thinning to what is under it at the garment's edge.
    const soft = Math.min(zone.cell * 1.1, .012 * s), face = zone === zones[1];
    if (zone === zones[0]) for (let i = from; i < out.position.length / 3; i++) {
      // Where the body's block laps the head's or a hand's, the coarser surface is drawn a hair inside the finer.
      if (out.position[i * 3 + 1] > zone.max[1] - lap || Math.abs(out.position[i * 3]) > zone.max[0] - lap) for (let k = 0; k < 3; k++) out.position[i * 3 + k] -= out.normal[i * 3 + k] * .0014 * s;
    }
    for (let i = from; i < out.position.length / 3; i++) {
      const x = out.position[i * 3], y = out.position[i * 3 + 1], z = out.position[i * 3 + 2], id = out.paint[i], item = id ? worn[id - 1] : null, below = out.under[i] ? worn[out.under[i] - 1][1].paint : PAINT.skin;
      let paint = item ? item[1].paint : PAINT.skin, other = below, share = 1;
      if (item?.[0].edge) share = smoothstep(0, soft, -item[0].edge(x, y, z));
      if (face && (paint === PAINT.skin || (share < 1 && other === PAINT.skin))) {
        const hx = (x - head.c[0]) / (head.hs * head.wx), hy = (y - head.c[1]) / head.hs, hz = (z - head.c[2]) / (head.hs * head.wz), blur = soft / head.hs * .6;
        for (const [mark, far] of head.marks) { const cover = 1 - smoothstep(-blur, blur, far(hx, hy, hz)); if (cover > 0) { if (paint === PAINT.skin) { paint = mark; other = PAINT.skin; share = cover; } break; } }
      }
      out.paint[i] = share >= .5 ? paint : other; out.blend.push(share >= .5 ? other : paint, share >= .5 ? 1 - share : share);
      out.bones.push(bind(x, y, z, out.paint[i]));
    }
  }
  eyes(out, rig, design);
  const count = out.position.length / 3, colours = palette(design), colour = new Float32Array(count * 3), skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const c = colours[out.paint[i]] || colours[0], o = colours[out.blend[i * 2]] || c, t = out.blend[i * 2 + 1] || 0; colour[i * 3] = mix(c[0], o[0], t); colour[i * 3 + 1] = mix(c[1], o[1], t); colour[i * 3 + 2] = mix(c[2], o[2], t);
    out.bones[i].forEach(([bone, share], k) => { skinIndex[i * 4 + k] = bone; skinWeight[i * 4 + k] = share; });
  }
  return {
    position: new Float32Array(out.position), normal: new Float32Array(out.normal), colour, paint: new Uint8Array(out.paint), blend: new Float32Array(out.blend), skinIndex, skinWeight,
    index: count > 65535 ? new Uint32Array(out.index) : new Uint16Array(out.index), rig, height: rig.height, palette: colours,
  };
}

/** A rig that came from another thread as plain values, made whole again. */
export function reviveRig(plain) {
  const index = new Map(plain.bones.map((bone, i) => [bone.name, i]));
  return { ...plain, index, at: name => plain.world[index.get(name)].p };
}
/**
 * Grow bodies without stopping whatever else is going on: in a worker where there is one, here otherwise.
 * Returns grow(design, detail) giving a promise of what buildBody returns.
 */
export function createBodyShop(motion, { worker = true } = {}) {
  let thread = null, next = 1; const waiting = new Map();
  if (worker && typeof Worker !== 'undefined') {
    try {
      thread = new Worker(new URL('./body-worker.js', import.meta.url), { type: 'module' });
      thread.onmessage = ({ data }) => { const job = waiting.get(data.id); if (!job) return; waiting.delete(data.id); if (data.error) job.reject(new Error(data.error)); else job.resolve({ ...data, rig: reviveRig(data.rig), palette: palette(job.design) }); };
      thread.onerror = () => { for (const job of waiting.values()) job.resolve(buildBody(job.design, motion, { detail: job.detail })); waiting.clear(); thread = null; };
    } catch { thread = null; }
  }
  const grow = (design, detail = 'close') => {
    if (!thread) return Promise.resolve().then(() => buildBody(design, motion, { detail }));
    return new Promise((resolve, reject) => { const id = next++; waiting.set(id, { resolve, reject, design, detail }); thread.postMessage({ id, design, detail }); });
  };
  grow.dispose = () => { thread?.terminate(); thread = null; waiting.clear(); };
  return grow;
}
