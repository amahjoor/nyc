// A person, made from a design.
//
// The figure is MakeHuman's (scripts/build-human.mjs bakes it): one body of
// 13,380 points that every person starts as, and several hundred "targets",
// each saying how far every point moves for one thing about somebody: a woman
// of twenty-five of average build, a broader nose, a heavier jaw. A design is
// how much of each. What a person wears is not part of the body: each garment,
// each head of hair, the eyes, the brows and the teeth are meshes of their
// own, every point of which is tied to three points of the body, so that
// whatever shape the body has taken they still lie over it.
//
// The skeleton is the one the game's movements were recorded for
// (dist/motion.json). Its joints are put where this body's are, and because
// the body was modelled standing with its arms down and its feet apart while
// the movements start from arms straight out, each bone also keeps the turn
// between the two (`rig.bind`): the body is skinned from the pose it was
// modelled in, which is the pose it is nearest to most of the time.
//
// No DOM and no three.js here: this runs in a worker (body-worker.js).
import { qmul, qinv, qrot, restWorld } from './body.js';
import { fitPatrolUniform } from './patrol-uniform.js';
import { easeOverWaist, coveredShaft } from './garment-fit.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
/** The turn that carries the axes X, Y, Z onto three unit vectors at right angles. */
function qbasis(x, y, z) {
  const trace = x[0] + y[1] + z[2]; let q;
  if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  else if (x[0] > y[1] && x[0] > z[2]) { const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2; q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  else if (y[1] > z[2]) { const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2; q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  else { const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2; q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]; }
  const n = Math.hypot(...q); return q.map(value => value / n);
}
/** A frame from the way something points and something roughly square to that. */
function frame(along, toward) {
  const x = unit(along), z = unit(cross(x, toward)), y = cross(z, x);
  return qbasis(x, y, z);
}

/** A frame from the way a limb runs and the axis its joint turns about. */
function hinged(along, axis) {
  const x = unit(along), y = unit(cross(axis, x)), z = cross(x, y);
  return qbasis(x, y, z);
}

/** Years to MakeHuman's four ages, each from 0 to 1. Nobody here is younger than ten. */
export function agesOf(years) {
  const y = clamp(Number.isFinite(years) ? years : 30, 10, 90), a = y < 25 ? (y - 1) / 48 : .5 + (y - 25) / 130;
  if (a >= .5) { const old = Math.max(0, a * 2 - 1); return { child: 0, young: 1 - old, old }; }
  const young = Math.max(0, (a - .1875) * 3.2);
  return { child: Math.max(0, Math.min(1, 5.333 * a) - young), young, old: 0 };
}
/** A dial from -1 to 1 as how much of "less", "average" and "more". */
const thirds = value => { const v = clamp(Number.isFinite(value) ? value : 0, -1, 1); return { min: Math.max(0, -v), average: 1 - Math.abs(v), max: Math.max(0, v) }; };
/** Where somebody's forebears came from, as three shares that sum to one. */
export function ancestryOf(design) {
  const a = Math.max(0, design.african ?? 0), s = Math.max(0, design.asian ?? 0), e = Math.max(0, design.european ?? 0), sum = a + s + e;
  return sum > 0 ? { african: a / sum, asian: s / sum, caucasian: e / sum } : { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };
}
/** How tall, in metres, if the design does not say: by age and sex. */
export function statureOf(design) {
  if (Number.isFinite(design.height)) return clamp(design.height, 1.1, 2.15);
  const woman = clamp(design.sex ?? 0, 0, 1), grown = 1.77 - woman * .13, years = clamp(design.age ?? 30, 10, 90);
  return years >= 19 ? grown - Math.max(0, years - 60) * .0012 : grown * (.78 + .22 * (years - 10) / 9);
}

/**
 * @param {object} meta dist/human/human.json
 * @param {ArrayBuffer} bodyBin dist/human/body.bin
 * @param {ArrayBuffer} partsBin dist/human/parts.bin
 * @param {object} motion dist/motion.json (the skeleton the movements are for)
 */
export function createHuman(meta, bodyBin, partsBin, motion) {
  const B = meta.body, N = B.points;
  const from = (buffer, [at, count], Type) => new Type(buffer, at, count);
  const basePosition = from(bodyBin, B.position, Float32Array), baseIndex = from(bodyBin, B.skinIndex, Uint8Array), baseWeight = from(bodyBin, B.skinWeight, Uint8Array);
  const skin = { corners: from(bodyBin, B.skin.corners, Uint16Array), uv: from(bodyBin, B.skin.uv, Float32Array), triangles: from(bodyBin, B.skin.triangles, B.skin.corners[1] > 65536 ? Uint32Array : Uint16Array) };
  const targets = new Map(B.targets.map(target => [target.name, { ...target, points: from(bodyBin, [target.at, target.count], Uint16Array), moves: from(bodyBin, [target.moved, target.count * 3], Int16Array) }]));
  const dials = new Map(B.dials.map(dial => [dial.id, dial]));
  const parts = new Map(meta.parts.map(part => {
    return [part.kind + '/' + part.id, { ...part,
      // (A cut garment's shares are bytes, out of 255; a stock garment's are floats.)
      tie: from(partsBin, part.tie, Uint16Array), share: from(partsBin, part.share, part.ties ? Uint8Array : Float32Array), off: from(partsBin, part.off, Float32Array),
      corners: from(partsBin, part.corners, part.points > 65536 ? Uint32Array : Uint16Array), uv: from(partsBin, part.uv, Float32Array), triangles: from(partsBin, part.triangles, part.corners[1] > 65536 ? Uint32Array : Uint16Array),
      hidden: part.hidden ? from(partsBin, part.hidden, Uint16Array) : null,
      // A cut garment says for itself which bones move each of its points (scripts/garment-shells.mjs).
      skinBone: part.skinBone ? from(partsBin, part.skinBone, Uint8Array) : null, skinPull: part.skinPull ? from(partsBin, part.skinPull, Uint8Array) : null }];
  }));
  const boneIndex = new Map(motion.bones.map((bone, i) => [bone.name, i]));
  // The movements' own skeleton at rest: which way each bone lies before anything moves it.
  const rest = restWorld(motion.bones);
  const restAt = name => rest[boneIndex.get(name)].p;

  /** Every point of the body for this design, in the pose it was modelled in, before it is stood on the ground. */
  function shape(design) {
    const P = new Float32Array(basePosition);
    const add = (name, weight) => {
      if (!(Math.abs(weight) > 1e-4)) return;
      const target = targets.get(name); if (!target) return;
      const { points, moves } = target, k = weight * target.scale;
      for (let j = 0, m = 0; j < points.length; j++, m += 3) { const i = points[j] * 3; P[i] += moves[m] * k; P[i + 1] += moves[m + 1] * k; P[i + 2] += moves[m + 2] * k; }
    };
    const woman = clamp(design.sex ?? 0, 0, 1), sexes = { female: woman, male: 1 - woman }, ages = agesOf(design.age), muscle = thirds(design.muscle), weight = thirds(design.weight), ancestry = ancestryOf(design);
    for (const [sex, s] of Object.entries(sexes)) for (const [age, a] of Object.entries(ages)) {
      if (!(s * a > 0)) continue;
      for (const [m, mv] of Object.entries(muscle)) for (const [w, wv] of Object.entries(weight)) add(`macrodetails/universal-${sex}-${age}-${m}muscle-${w}weight`, s * a * mv * wv);
      for (const [race, r] of Object.entries(ancestry)) add(`macrodetails/${race}-${sex}-${age}`, s * a * r);
    }
    // The bust is a woman's, by cup and by how it sits.
    if (woman > 0 && Number.isFinite(design.chest)) {
      const cup = thirds(design.chest), firm = thirds(design.firm ?? 0), grown = 1 - ages.child;
      for (const size of ['min', 'max']) for (const [f, fv] of Object.entries(firm)) add(`breast/female-young-averagemuscle-averageweight-${size}cup-${f}firmness`, woman * grown * cup[size] * fv);
    }
    for (const [id, value] of Object.entries(design.dials || {})) {
      const dial = dials.get(id); if (!dial || !Number.isFinite(value)) continue;
      const v = clamp(value, -1, 1);
      if (v > 0 && dial.high) add(dial.high, v); else if (v < 0 && dial.low) add(dial.low, -v);
    }
    // A face that is doing something: 'eye-left-closure', 'mouth-open' and the rest, each from 0 to 1.
    for (const [id, value] of Object.entries(design.expression || {})) for (const [race, r] of Object.entries(ancestry)) add(`expression/units/${race}/${id}`, value * r);
    return P;
  }

  /** The middle of a named place (a joint, a fingertip, the crown) for a body. */
  const place = (P, name) => { const list = B.places[name], p = [0, 0, 0]; for (const i of list) { p[0] += P[i * 3]; p[1] += P[i * 3 + 1]; p[2] += P[i * 3 + 2]; } return p.map(value => value / list.length); };

  /**
   * The skeleton for a body: the movements' bones with their joints where the
   * body's are. `bones` and `world` are it at rest, as the movements know it
   * (arms straight out); `bind` is where each bone is and how it is turned in
   * the pose the body was modelled in, which is what the skin is hung from.
   */
  function rigFor(P, design) {
    const J = name => place(P, name), at = new Map(motion.bones.map(bone => [bone.name, J(bone.name)]));
    // For each limb bone: its frame as it lies in the movements' rest, and as it lies in this body.
    const turn = new Map();
    const set = (name, restFrame, bodyFrame) => turn.set(name, qmul(bodyFrame, qinv(restFrame)));
    for (const s of ['l', 'r']) {
      const n = stem => stem + '_' + s, r = stem => restAt(n(stem)), b = stem => at.get(n(stem));
      // An arm bends at the elbow in a plane: in the body as modelled the elbow is bent, and shows it; at rest it would bend forward.
      const upper = sub(b('lowerarm'), b('upperarm')), lower = sub(b('hand'), b('lowerarm')), hinge = cross(upper, lower);
      const restUpper = sub(r('lowerarm'), r('upperarm')), restHinge = cross(restUpper, [0, 0, 1]);
      set(n('upperarm'), hinged(restUpper, restHinge), hinged(upper, hinge));
      set(n('lowerarm'), hinged(sub(r('hand'), r('lowerarm')), restHinge), hinged(lower, hinge));
      // A hand by the way its fingers run and the line across its knuckles.
      const across = sub(b('index_01'), b('pinky_01')), restAcross = sub(r('index_01'), r('pinky_01'));
      set(n('hand'), frame(sub(r('middle_01'), r('hand')), restAcross), frame(sub(b('middle_01'), b('hand')), across));
      for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
        const tip = J(`${finger}_tip_${s}`), joints = [b(finger + '_01'), b(finger + '_02'), b(finger + '_03'), tip], rests = [r(finger + '_01'), r(finger + '_02'), r(finger + '_03')];
        for (let k = 0; k < 3; k++) {
          // The last joint of a finger has nothing after it at rest: it lies the way the one before it does.
          const restAlong = k < 2 ? sub(rests[k + 1], rests[k]) : sub(rests[2], rests[1]);
          set(n(`${finger}_0${k + 1}`), frame(restAlong, restAcross), frame(sub(joints[k + 1], joints[k]), across));
        }
      }
      // A leg by the way it runs and the way its foot points.
      const toes = sub(b('ball'), b('foot')), restToes = sub(r('ball'), r('foot'));
      set(n('thigh'), frame(sub(r('calf'), r('thigh')), restToes), frame(sub(b('calf'), b('thigh')), toes));
      set(n('calf'), frame(sub(r('foot'), r('calf')), restToes), frame(sub(b('foot'), b('calf')), toes));
      const foot = [frame(restToes, sub(r('calf'), r('foot'))), frame(toes, sub(b('calf'), b('foot')))];
      set(n('foot'), ...foot); set(n('ball'), ...foot);
    }
    // The trunk and the head stand in both as they stand at rest.
    const bind = motion.bones.map((bone, i) => ({ p: at.get(bone.name), q: turn.has(bone.name) ? qmul(turn.get(bone.name), rest[i].q) : rest[i].q.slice() }));
    const bones = motion.bones.map((bone, i) => {
      const parent = bone.parent < 0 ? null : bind[bone.parent];
      return { name: bone.name, parent: bone.parent, q: bone.q.slice(), t: parent ? qrot(qinv(parent.q), sub(bind[i].p, parent.p)) : [0, 0, 0] };
    });
    // At rest the legs are under the hips: the pelvis is as high as that makes it, with the ankles where they were above the ground.
    const pelvis = boneIndex.get('pelvis'), root = boneIndex.get('root');
    bones[root].t = [0, 0, 0]; bones[pelvis].t = [0, 0, 0];
    const first = restWorld(bones), ankle = Math.min(first[boneIndex.get('foot_l')].p[1], first[boneIndex.get('foot_r')].p[1]);
    const lift = (at.get('foot_l')[1] + at.get('foot_r')[1]) / 2 - ankle;
    bones[pelvis].t = qrot(qinv(first[root].q), [0, lift, at.get('pelvis')[2]]);
    const world = restWorld(bones), reference = rest[pelvis].p[1];
    const heavy = Math.max(0, design.weight ?? 0), strong = Math.max(0, design.muscle ?? 0);
    return {
      bones, world, bind, index: boneIndex, scale: world[pelvis].p[1] / reference, stride: world[pelvis].p[1] / reference,
      spread: heavy * .26 + strong * .1, factor: {}, lift: .2,
      at: name => world[boneIndex.get(name)].p,
    };
  }

  /** Smooth normals for a mesh of corners over points: a seam in the picture is not a crease in the skin. */
  function normalsOf(position, corners, triangles, points) {
    const sum = new Float32Array(points * 3);
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
      const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2], vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const corner of [triangles[t], triangles[t + 1], triangles[t + 2]]) { const p = corners[corner] * 3; sum[p] += nx; sum[p + 1] += ny; sum[p + 2] += nz; }
    }
    const normal = new Float32Array(corners.length * 3);
    for (let i = 0; i < corners.length; i++) { const p = corners[i] * 3, n = Math.hypot(sum[p], sum[p + 1], sum[p + 2]) || 1; normal[i * 3] = sum[p] / n; normal[i * 3 + 1] = sum[p + 1] / n; normal[i * 3 + 2] = sum[p + 2] / n; }
    return normal;
  }

  /** A worn thing laid over a body: where each of its points is, and which bones move it. */
  function fit(part, P) {
    const { tie, share, off } = part, n = part.points, at = new Float32Array(n * 3), bone = new Uint8Array(n * 4), pull = new Float32Array(n * 4);
    // How far a point stands off the body grows and shrinks with the body, each way separately.
    const size = axis => { const s = part.scale[axis]; return s ? Math.abs(P[s[0] * 3 + 'xyz'.indexOf(axis)] - P[s[1] * 3 + 'xyz'.indexOf(axis)]) / s[2] : 1; };
    const sx = size('x'), sy = size('y'), sz = size('z'), mix = new Map();
    // A stock garment's point is tied to three points of the body; a cut one to `ties` of them, spread about, so that it follows the build of the body and not each muscle.
    const K = part.ties || 3, unit = part.ties ? 1 / 255 : 1;
    for (let i = 0; i < n; i++) {
      const o = i * 3, q = i * K; let x = off[o] * sx, y = off[o + 1] * sy, z = off[o + 2] * sz; mix.clear();
      for (let k = 0; k < K; k++) {
        const w = share[q + k] * unit; if (!w) continue;
        const p = tie[q + k]; x += P[p * 3] * w; y += P[p * 3 + 1] * w; z += P[p * 3 + 2] * w;
        if (w > 0 && !part.skinBone) for (let j = 0; j < 4; j++) { const weight = baseWeight[p * 4 + j]; if (weight) mix.set(baseIndex[p * 4 + j], (mix.get(baseIndex[p * 4 + j]) || 0) + weight * w); }
      }
      at[o] = x; at[o + 1] = y; at[o + 2] = z;
      if (part.skinBone) { for (let j = 0; j < 4; j++) { bone[i * 4 + j] = part.skinBone[i * 4 + j]; pull[i * 4 + j] = part.skinPull[i * 4 + j] / 255; } continue; }
      const top = [...mix].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((total, entry) => total + entry[1], 0) || 1;
      top.forEach(([b, w], k) => { bone[i * 4 + k] = b; pull[i * 4 + k] = w / sum; });
      if (!top.length) pull[i * 4] = 1;
    }
    return { at, bone, pull };
  }

  /**
   * Make somebody. Returns { pieces, rig, height }: each piece is one mesh
   * with one material ({ kind, id, position, normal, uv, skinIndex,
   * skinWeight, index, map, normalMap, clear, twoSided }), all of them in
   * the pose the body was modelled in, standing on y = 0.
   *
   * `design.wear` is the list of parts worn, by 'kind/id'; `detail` is
   * 'close', or 'near' and 'far' for the same person in fewer points.
   */
  function build(design, { detail = 'close', painted = false, skinOnly = false } = {}) {
    const P = shape(design);
    // Stood on the ground and brought to the height asked for, about the point under the hips.
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < skin.corners.length; i++) { const y = P[skin.corners[i] * 3 + 1]; if (y < low) low = y; if (y > high) high = y; }
    const tall = statureOf(design), k = tall / (high - low);
    for (let i = 0; i < N * 3; i += 3) { P[i] *= k; P[i + 1] = (P[i + 1] - low) * k; P[i + 2] *= k; }
    const rig = rigFor(P, design); rig.height = tall;
    const worn = (design.wear || []).map(key => parts.get(key)).filter(Boolean);
    // What a garment covers is not drawn under it, so that it cannot show through.
    // (`painted`: nothing worn is built but hair and hats; the body is whole, and `cover` says, corner by corner,
    // which of `wear` lies over it, counting from one, so that it can be coloured as if dressed. For somebody far off.)
    const hidden = new Uint8Array(N), cover = painted ? new Uint8Array(N) : null;
    worn.forEach((part, order) => { if (part.hidden && part.kind !== 'hair' && part.kind !== 'hat') for (const p of part.hidden) { if (cover) { if (!cover[p]) cover[p] = order + 1; } else hidden[p] = 1; } });
    const pieces = [];
    // The body itself, or the lighter stand-in for it further off.
    const lighter = detail === 'close' ? null : parts.get('body/' + (detail === 'far' ? 'proxy741' : (design.sex ?? 0) > .5 ? 'female1605' : 'male1591'));
    if (lighter) {
      const laid = fit(lighter, P);
      // A stand-in's point is hidden when the body points it is tied to are.
      const gone = new Uint8Array(lighter.points); for (let i = 0; i < lighter.points; i++) gone[i] = hidden[lighter.tie[i * 3]] && hidden[lighter.tie[i * 3 + 1]] && hidden[lighter.tie[i * 3 + 2]] ? 1 : 0;
      pieces.push(piece('skin', 'body', lighter.corners, lighter.uv, lighter.triangles, laid.at, lighter.points, i => laid.bone.subarray(i * 4, i * 4 + 4), i => laid.pull.subarray(i * 4, i * 4 + 4), gone));
      if (cover) { const over = pieces[0].cover = new Uint8Array(lighter.corners.length); for (let c = 0; c < over.length; c++) { const p = lighter.corners[c] * 3, a = cover[lighter.tie[p]]; over[c] = a && a === cover[lighter.tie[p + 1]] && a === cover[lighter.tie[p + 2]] ? a : 0; } pieces[0].worn = worn.map(part => part.kind + '/' + part.id); }
    } else {
      const weight = new Float32Array(4);
      pieces.push(piece('skin', 'body', skin.corners, skin.uv, skin.triangles, P, N, i => baseIndex.subarray(i * 4, i * 4 + 4), i => { for (let j = 0; j < 4; j++) weight[j] = baseWeight[i * 4 + j] / 255; return weight; }, hidden));
    }
    // The crowd shares its fitted clothes across both draw distances. When
    // it asks for the detailed skin, applying the masks above is sufficient.
    const visible=skinOnly && !design.uniform ? [] : worn;
    const under=!painted && visible.find(p=>p.slot==='bottom');
    const fittedUnder=under ? fit(under,P) : null;
    for (const part of visible) {
      if (painted && part.kind !== 'hair' && part.kind !== 'hat') continue;
      const laid = part===under ? fittedUnder : fit(part, P);
      // A top that hangs over the waist is eased out over what is under it; cut trousers ask that of any top.
      if((part.overWaist || (under?.liftsHem && part.slot==='top' && !part.tucked && part!==under)) && fittedUnder)easeOverWaist(laid,fittedUnder,under,rig);
      const shaft=part.kind==='shoes' && under?.overBoot ? coveredShaft(laid,fittedUnder,tall) : null;
      const made = piece(part.kind, part.id, part.corners, part.uv, part.triangles, laid.at, part.points, i => laid.bone.subarray(i * 4, i * 4 + 4), i => laid.pull.subarray(i * 4, i * 4 + 4), shaft);
      Object.assign(made, { map: part.map, normalMap: part.normal, clear: part.clear, twoSided: part.twoSided, depth: part.depth, shade: part.shade, dyeBase:part.dyeBase, slot: part.slot, finish: part.finish, sheer: part.sheer });
      pieces.push(made);
    }
    // Where the face is, for whoever frames it or hangs something on it.
    const marks = {}; for (const name of ['eye_l', 'eye_r', 'crown', 'chin', 'jaw']) marks[name] = place(P, name);
    if (design.uniform) fitPatrolUniform(pieces, rig, marks, design.uniform);
    return { pieces, rig, height: tall, marks };
  }

  function piece(kind, id, corners, uvs, triangles, at, points, boneOf, pullOf, gone) {
    const n = corners.length, position = new Float32Array(n * 3), skinIndex = new Uint8Array(n * 4), skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = corners[i]; position[i * 3] = at[p * 3]; position[i * 3 + 1] = at[p * 3 + 1]; position[i * 3 + 2] = at[p * 3 + 2];
      skinIndex.set(boneOf(p), i * 4); skinWeight.set(pullOf(p), i * 4);
    }
    let index = triangles;
    if (gone) {
      const kept = [];
      for (let t = 0; t < triangles.length; t += 3) { const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]; if (!(gone[corners[a]] && gone[corners[b]] && gone[corners[c]])) kept.push(a, b, c); }
      index = n > 65535 ? Uint32Array.from(kept) : Uint16Array.from(kept);
    }
    const uv = new Float32Array(uvs);
    return { kind, id, position, normal: normalsOf(position, corners, index, points), uv, skinIndex, skinWeight, index: index.slice ? index.slice() : index };
  }

  return {
    meta, shape, build, rigFor, place,
    dials: B.dials, parts: meta.parts, skins: meta.skins, irises: meta.irises,
    has: key => parts.has(key),
  };
}

/** Fetch the figure. `base` is where dist/human/ is served. */
export async function loadHuman(motion, base = './human/') {
  const [meta, body, parts] = await Promise.all([fetch(base + 'human.json').then(r => r.json()), fetch(base + 'body.bin').then(r => r.arrayBuffer()), fetch(base + 'parts.bin').then(r => r.arrayBuffer())]);
  return createHuman(meta, body, parts, motion);
}
