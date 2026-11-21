// Garments cut from the body itself.
//
// MakeHuman's body carries two meshes nobody sees: a pair of tights that
// covers it from the neck to the toes, and a long skirt. Every point of them
// moves with the body and bends with its bones, which is what a garment
// needs. A garment here is a piece of those meshes: cut along a neckline, a
// hem and a cuff, stood off the body by however much room the cloth has, hung
// straight where cloth hangs, and gathered where it is ribbed. What is added
// to it (a collar, a hood, a pocket, a strap) is tied to the same points.
//
// A cut is plain data (data/archive-collection.json). Heights are metres
// above the floor on the body as modelled, or a landmark and an offset:
// 'hip-0.04', 'knee', 'ankle+0.02'.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), unit = a => { const n = len(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
/** How many points of the body one point of a garment may be tied to. */
export const TIES = 8;

/** The outline of some points on a plane, anticlockwise. */
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length > 1 && turn(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length > 1 && turn(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** How far an outline reaches from a point inside it, along a direction. */
function reach(outline, origin, dir) {
  let far = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], ex = b[0] - a[0], ey = b[1] - a[1], det = dir[0] * ey - dir[1] * ex;
    if (Math.abs(det) < 1e-12) continue;
    const ax = a[0] - origin[0], ay = a[1] - origin[1], t = (ax * ey - ay * ex) / det, s = (ax * dir[1] - ay * dir[0]) / det;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) far = Math.max(far, t);
  }
  return far;
}

/**
 * Cuts that have been looked at and fit: a garment says which it is `like` and changes what differs.
 * `ease` is how far the cloth stands off the body, in metres, at each place; `hang` is how straight it
 * falls from the chest (0 follows the body, 1 a plumb line); `cinch` is how much a ribbed hem gathers it.
 */
export const FITS = {
  tee: { block: 'top', hem: 'hip-0.03', sleeve: .3, hang: .5, neck: { depth: .035 }, ease: { shoulder: .006, chest: .018, waist: .03, hip: .03, sleeve: .014, cuff: .016 }, add: [{ type: 'collar', height: .008, flare: .001 }] },
  longsleeve: { block: 'top', hem: 'hip-0.03', sleeve: 1, hang: .5, neck: { depth: .035 }, ease: { shoulder: .006, chest: .018, waist: .03, hip: .03, sleeve: .012, cuff: .008 }, add: [{ type: 'collar', height: .008, flare: .001 }] },
  tight: { block: 'top', hem: 'hip-0.02', sleeve: 1, hang: 0, hug: 1, chest: 0, neck: { depth: .03 }, ease: { shoulder: .004, chest: .005, waist: .005, hip: .006, sleeve: .004, cuff: .004 }, tube: 0, smooth: 2 },
  tank: { block: 'top', hem: 'hip-0.02', sleeve: 0, armhole: .2, hang: .3, neck: { depth: .09, round: .1 }, ease: { shoulder: .004, chest: .012, waist: .02, hip: .02 } },
  sweatshirt: { block: 'top', hem: 'hip-0.01', sleeve: 1, hang: .9, cinch: .12, rib: .055, cuffCinch: .22, shoulderDrop: .008, neck: { depth: .03 }, ease: { shoulder: .01, chest: .035, waist: .055, hip: .055, sleeve: .018, cuff: .014 }, add: [{ type: 'collar', height: .016, flare: .002 }] },
  hoodie: { block: 'top', hem: 'hip-0.01', sleeve: 1, hang: .9, cinch: .12, rib: .055, cuffCinch: .22, shoulderDrop: .008, neck: { depth: .06 }, ease: { shoulder: .01, chest: .035, waist: .055, hip: .055, sleeve: .018, cuff: .014 }, add: [{ type: 'hood' }] },
  knit: { block: 'top', hem: 'hip-0.02', sleeve: 1, hang: .7, cinch: .08, rib: .05, cuffCinch: .15, neck: { depth: .03 }, ease: { shoulder: .008, chest: .025, waist: .04, hip: .04, sleeve: .015, cuff: .011 }, add: [{ type: 'collar', height: .014, flare: .002 }] },
  shirt: { block: 'top', hem: 'hip-0.08', hemCurve: .04, sleeve: 1, hang: .8, neck: { y: .012, depth: .022, round: .07 }, ease: { shoulder: .006, chest: .02, waist: .035, hip: .035, sleeve: .013, cuff: .009 }, add: [{ type: 'collar', style: 'fold', height: .04, gap: .012 }] },
  blazer: { block: 'top', hem: 'hip-0.1', sleeve: 1, hang: .9, waist: .04, neck: { v: .22, width: .075, depth: .03 }, ease: { shoulder: .01, chest: .022, waist: .03, hip: .035, sleeve: .012, cuff: .011 }, add: [{ type: 'lip' }] },
  bomber: { block: 'top', hem: 'hip+0.05', sleeve: 1, hang: 1, cinch: .2, cuffCinch: .25, ease: { shoulder: .012, chest: .035, waist: .07, hip: .07, sleeve: .022, cuff: .018 }, add: [{ type: 'collar', height: .035, flare: .006 }, { type: 'lip' }] },
  biker: { block: 'top', hem: 'hip+0.03', sleeve: 1, hang: .7, waist: .02, ease: { shoulder: .008, chest: .018, waist: .022, hip: .022, sleeve: .009, cuff: .007 }, add: [{ type: 'collar', style: 'fold', height: .05, gap: .02 }, { type: 'lip' }] },
  trucker: { block: 'top', hem: 'hip+0.02', sleeve: 1, hang: .9, ease: { shoulder: .008, chest: .022, waist: .03, hip: .03, sleeve: .012, cuff: .01 }, add: [{ type: 'collar', style: 'fold', height: .045, gap: .015 }, { type: 'lip' }] },
  parka: { block: 'top', hem: 'thigh+0.04', hemBack: .1, sleeve: 1, hang: 1, ease: { shoulder: .012, chest: .04, waist: .06, hip: .06, hem: .05, sleeve: .022, cuff: .022 }, add: [{ type: 'hood' }, { type: 'lip' }] },
  coat: { block: 'top', hem: 'knee+0.03', sleeve: 1, hang: 1, flare: .06, ease: { shoulder: .008, chest: .025, waist: .035, hip: .035, hem: .04, sleeve: .014, cuff: .014 }, add: [{ type: 'collar', style: 'fold', height: .06, gap: .02 }, { type: 'lip' }] },
  vest: { block: 'top', hem: 'hip+0.02', sleeve: 0, hang: 1, ease: { shoulder: .02, chest: .035, waist: .045, hip: .045 }, add: [{ type: 'lip' }] },
  dress: { block: 'top', hem: 'knee-0.05', sleeve: 0, hang: .6, armhole: .3, ease: { shoulder: .006, chest: .012, waist: .02, hip: .025, hem: .04 } },
  slim: { block: 'bottom', rise: 'waist-0.09', hem: 'ankle-0.01', straight: .2, overBoot: true, ease: { waist: .002, seat: .008, thigh: .008, knee: .008, hem: .012 } },
  straight: { block: 'bottom', rise: 'waist-0.09', hem: 'ankle-0.02', straight: .7, overBoot: true, ease: { waist: .002, seat: .014, thigh: .02, knee: .022, hem: .03 } },
  wide: { block: 'bottom', rise: 'waist-0.07', hem: 'ankle-0.03', straight: 1, flare: .2, overBoot: true, ease: { waist: .002, seat: .03, thigh: .05, knee: .06, hem: .07 } },
  cargo: { block: 'bottom', rise: 'waist-0.09', hem: 'ankle-0.02', straight: .8, overBoot: true, ease: { waist: .002, seat: .025, thigh: .035, knee: .035, hem: .03 } },
  dropcrotch: { block: 'bottom', rise: 'waist-0.1', hem: 'ankle+0.02', straight: .8, dropCrotch: .12, taper: .25, overBoot: true, ease: { waist: .002, seat: .035, thigh: .045, knee: .035, hem: .018 } },
  shorts: { block: 'bottom', rise: 'waist-0.09', hem: 'knee+0.02', straight: .9, ease: { waist: .002, seat: .025, thigh: .04, knee: .045, hem: .045 } },
  skirt: { block: 'skirt', rise: 'waist-0.06', hem: 'knee', flare: .4, ease: { waist: .002, hip: .02, hem: .03 } },
};
/** A cut with what it leaves unsaid taken from the fit it is like. */
export function cutOf(cut) {
  const like = cut.like ? FITS[cut.like] : null;
  if (cut.like && !like) throw new Error('no such fit: ' + cut.like + ' (' + Object.keys(FITS).join(', ') + ')');
  if (!like) return cut;
  const made = { ...like, ...cut };
  for (const key of ['ease', 'neck']) if (like[key] || cut[key]) made[key] = { ...like[key], ...cut[key] };
  // What a garment adds is added to what its fit has, unless it says `only: true` on one of its own.
  if (cut.add && like.add) made.add = cut.add.some(item => item.only) ? cut.add : [...like.add.filter(item => !cut.add.some(mine => mine.type === item.type)), ...cut.add];
  return made;
}

export function createTailor({ positions: modelled, faces, skinIndex, skinWeight, bones, places }) {
  // --- The pose a garment is cut in ---------------------------------------------------------------
  // The body was modelled with its arms held out and its feet apart, and nobody stands like that. Cloth cut to
  // that shape bunches at the shoulder as soon as the arms come down. So the body is first stood as people
  // stand, arms by its sides and feet under its hips, the garment is cut on that, and each of its points is
  // then carried back to where it must be on the modelled body to arrive there when the bones turn.
  const rest = name => { const list = places[name], p = [0, 0, 0]; for (const i of list) { p[0] += modelled[i * 3]; p[1] += modelled[i * 3 + 1]; p[2] += modelled[i * 3 + 2]; } return mul(p, 1 / list.length); };
  // Which way each part of a limb lies when somebody stands or walks: the mean over the game's own idle and walk, both
  // sides taken as one (the left as given, the right its mirror). Measured from dist/motion.bin.
  const STANDING = { upperarm: unit([.283, -.925, -.25]), lowerarm: unit([.17, -.92, .36]), thigh: unit([.07, -.99, .08]), calf: unit([.03, -.99, -.12]) };
  const mat = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
  const apply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  const transposed = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  /** The least turn that carries one direction onto another. */
  function turnOnto(from, to) {
    const axis = cross(from, to), sin = len(axis), cos = dot(from, to); if (sin < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y, z] = mul(axis, 1 / sin), k = 1 - cos;
    return [cos + x * x * k, x * y * k - z * sin, x * z * k + y * sin, y * x * k + z * sin, cos + y * y * k, y * z * k - x * sin, z * x * k - y * sin, z * y * k + x * sin, cos + z * z * k];
  }
  // For each bone, the turn and the shift that carry a point of the modelled body to where it is when the body stands.
  const stand = new Map(), carried = new Map();
  for (const side of ['l', 'r']) for (const [upper, lower, end] of [['upperarm', 'lowerarm', 'hand'], ['thigh', 'calf', 'foot']]) {
    const mirror = v => side === 'l' ? v : [-v[0], v[1], v[2]], a = rest(upper + '_' + side), b = rest(lower + '_' + side), c = rest(end + '_' + side);
    const first = turnOnto(unit(sub(b, a)), mirror(STANDING[upper])), second = turnOnto(unit(sub(c, b)), apply(transposed(first), mirror(STANDING[lower]))), both = mat(first, second);
    const one = { m: first, t: sub(a, apply(first, a)) }, two = { m: both, t: sub(add(a, apply(first, sub(b, a))), apply(both, b)) };
    for (const name of bones) {
      if (!name.endsWith('_' + side)) continue;
      const stem = name.slice(0, -2);
      if (stem === upper) stand.set(name, one);
      else if (upper === 'upperarm' ? /^(lowerarm|hand|thumb|index|middle|ring|pinky)/.test(stem) : /^(calf|foot|ball)$/.test(stem)) stand.set(name, two);
    }
    // A joint is carried by the bone above it: an elbow turns with the upper arm, a wrist with the forearm.
    carried.set(lower + '_' + side, one); carried.set(end + '_' + side, two); if (upper === 'thigh') carried.set('ball_' + side, two);
  }
  const turns = bones.map(name => stand.get(name) || null);
  const moved = (turn, p) => turn ? add(apply(turn.m, p), turn.t) : p;
  const positions = new Float32Array(modelled.length);
  for (let i = 0; i < modelled.length / 3; i++) {
    const p = [modelled[i * 3], modelled[i * 3 + 1], modelled[i * 3 + 2]], out = [0, 0, 0]; let total = 0;
    for (let k = 0; k < 4; k++) { const w = skinWeight[i * 4 + k]; if (!w) continue; const q = moved(turns[skinIndex[i * 4 + k]], p); out[0] += q[0] * w; out[1] += q[1] * w; out[2] += q[2] * w; total += w; }
    positions.set(total ? mul(out, 1 / total) : p, i * 3);
  }
  /** Where a point cut on the standing body must lie on the modelled one, given the bones that move it: [[bone, share], ...]. */
  function unposed(p, held) {
    // The bones' turns and shifts, blended by their shares as the skin blends them, and undone.
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0], t = [0, 0, 0];
    for (const [bone, w] of held) { const turn = turns[bone]; if (turn) { for (let k = 0; k < 9; k++) m[k] += turn.m[k] * w; for (let k = 0; k < 3; k++) t[k] += turn.t[k] * w; } else { m[0] += w; m[4] += w; m[8] += w; } }
    const [a, b, c, d, e, f, g, h, i] = m, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g), q = sub(p, t);
    const inv = [(e * i - f * h), (c * h - b * i), (b * f - c * e), (f * g - d * i), (a * i - c * g), (c * d - a * f), (d * h - e * g), (b * g - a * h), (a * e - b * d)].map(v => v / det);
    return apply(inv, q);
  }
  /**
   * Which bones move each point of a garment. A point starts with the bones of the body beneath it, and the body's are
   * drawn fine: this muscle to the collarbone, that to the arm. Skin takes that; cloth standing off the skin does not, and
   * shows every boundary as a lump when the arm comes down. So each point also takes some of what its neighbours have,
   * `soften` times over: the thicker the garment, the further a bone's pull spreads through it.
   */
  function bonesOf(mesh, soften) {
    let held = mesh.verts.map(v => { const mixed = new Map(); for (const [point, share] of v.src) for (let k = 0; k < 4; k++) { const w = skinWeight[point * 4 + k]; if (w) mixed.set(skinIndex[point * 4 + k], (mixed.get(skinIndex[point * 4 + k]) || 0) + w * share / 255); } return mixed; });
    const near = neighbours(mesh);
    for (let pass = 0; pass < soften; pass++) held = held.map((mine, i) => {
      if (!near[i].length || mesh.verts[i].added === 'strap') return mine;
      const next = new Map(); for (const [bone, w] of mine) next.set(bone, w * .5);
      for (const j of near[i]) for (const [bone, w] of held[j]) next.set(bone, (next.get(bone) || 0) + w * .5 / near[i].length);
      return next;
    });
    return held.map(mixed => { const top = [...mixed].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((total, entry) => total + entry[1], 0) || 1; return top.map(([bone, w]) => [bone, w / sum]); });
  }
  const P = i => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const J = name => moved(carried.get(name) || null, rest(name));
  const groupOf = name => faces.filter(face => face.group === name).map(face => face.corners.map(corner => corner[0]));
  const tights = groupOf('helper-tights'), skirt = groupOf('helper-skirt'), bodyFaces = groupOf('body');
  let floor = Infinity; for (const face of bodyFaces) for (const p of face) floor = Math.min(floor, positions[p * 3 + 1]);

  // --- What each point of the body belongs to -----------------------------------------------------
  const share = (point, test) => { let sum = 0; for (let k = 0; k < 4; k++) if (skinWeight[point * 4 + k] && test.test(bones[skinIndex[point * 4 + k]])) sum += skinWeight[point * 4 + k]; return sum / 255; };
  const ARM = { l: /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky).*_l$/, r: /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky).*_r$/ };
  const LEG = { l: /^(thigh|calf|foot|ball)_l$/, r: /^(thigh|calf|foot|ball)_r$/ };
  /** A limb as a bent line: where along it a point is (0 at its root, 1 at its end), how far off, and which way round. */
  function limb(names) {
    const joints = names.map(J), spans = joints.slice(1).map((joint, i) => len(sub(joint, joints[i]))), total = spans.reduce((a, b) => a + b, 0);
    const axes = joints.slice(1).map((joint, i) => unit(sub(joint, joints[i])));
    // One reference direction carried down the limb, so that "the front of the sleeve" is the same line all the way.
    const refs = []; let ref = [0, 0, 1];
    for (const axis of axes) { ref = unit(sub(ref, mul(axis, dot(ref, axis)))); refs.push(ref); }
    return {
      joints, total, axes, refs,
      at(p) {
        let best = null, run = 0;
        for (let i = 0; i < axes.length; i++) {
          const along = dot(sub(p, joints[i]), axes[i]), last = i === axes.length - 1, first = i === 0;
          const t = clamp(along, first ? -Infinity : 0, last ? Infinity : spans[i]), foot = add(joints[i], mul(axes[i], t)), off = sub(p, foot), far = len(off);
          if (!best || far < best.far) { const side = cross(axes[i], refs[i]); best = { far, s: (run + t) / total, angle: Math.atan2(dot(off, side), dot(off, refs[i])), segment: i, foot }; }
          run += spans[i];
        }
        return best;
      },
      /** The point at s along the limb, and the frame there. */
      frame(s) {
        let run = s * total;
        for (let i = 0; i < axes.length; i++) { if (run <= spans[i] || i === axes.length - 1) return { p: add(joints[i], mul(axes[i], run)), axis: axes[i], ref: refs[i], side: cross(axes[i], refs[i]) }; run -= spans[i]; }
      },
    };
  }
  const arms = { l: limb(['upperarm_l', 'lowerarm_l', 'hand_l']), r: limb(['upperarm_r', 'lowerarm_r', 'hand_r']) };
  const legs = { l: limb(['thigh_l', 'calf_l', 'foot_l']), r: limb(['thigh_r', 'calf_r', 'foot_r']) };

  // --- Landmarks ------------------------------------------------------------------------------------
  let crotch = Infinity, top = -Infinity;
  for (const face of tights) for (const p of face) { const y = positions[p * 3 + 1]; top = Math.max(top, y); if (Math.abs(positions[p * 3]) < .012 && y < .3) crotch = Math.min(crotch, y); }
  const mark = {
    floor: 0, ankle: J('foot_l')[1] - floor, calf: (J('calf_l')[1] + J('foot_l')[1]) / 2 - floor, knee: J('calf_l')[1] - floor, thigh: (J('thigh_l')[1] + J('calf_l')[1]) / 2 - floor,
    crotch: crotch - floor, hip: J('thigh_l')[1] - floor, waist: J('spine_02')[1] - floor, chest: J('spine_03')[1] + .11 - floor, armpit: J('upperarm_l')[1] - .085 - floor,
    shoulder: J('upperarm_l')[1] - floor, neck: J('neck_01')[1] - floor, collar: top - floor, wrist: J('hand_l')[1] - floor,
  };
  /** 'knee+0.05' or a number, as a height in the body's own space. */
  const height = value => {
    if (typeof value === 'number') return value + floor;
    const [, name, more] = /^([a-z]+)((?:\s*[+-]\s*[\d.]+)*)$/.exec(String(value).trim()) || [];
    if (!(name in mark)) throw new Error('no such height: ' + value);
    return mark[name] + floor + (more.replace(/\s/g, '').match(/[+-][\d.]+/g) || []).reduce((sum, part) => sum + Number(part), 0);
  };

  // --- A mesh in the making -----------------------------------------------------------------------
  // A vertex is some body points and how much of each ("src"), and from them where it lies on the body
  // (p0), which way the body faces there (n0), and what it belongs to.
  const normals = new Map();
  for (const quads of [tights, skirt]) {
    for (const face of quads) {
      const n = cross(sub(P(face[1]), P(face[0])), sub(P(face[face.length - 1]), P(face[0])));
      for (const p of face) { const sum = normals.get(p) || [0, 0, 0]; normals.set(p, add(sum, n)); }
    }
  }
  for (const [p, n] of normals) normals.set(p, unit(n));
  // Each point of the helper meshes and the points round it, for garments that follow the body's build but not its muscles.
  const around_ = new Map();
  for (const quads of [tights, skirt]) for (const face of quads) for (let i = 0; i < face.length; i++) { const a = face[i], b = face[(i + 1) % face.length]; if (!around_.has(a)) around_.set(a, new Set()); if (!around_.has(b)) around_.set(b, new Set()); around_.get(a).add(b); around_.get(b).add(a); }
  const spreadOf = new Map();
  /**
   * The body points a garment point is hung from, when it stands `wide` metres clear of fine detail: the point under it and
   * a ring of others about that far away that face the same way. What the body does over that whole patch moves the cloth;
   * what one muscle does within it hardly does. Returns [[point, share], ...], at most `TIES` of them.
   */
  function spread(point, wide) {
    const key = point + '/' + wide.toFixed(3);
    if (spreadOf.has(key)) return spreadOf.get(key);
    const here = P(point), normal = normals.get(point), seen = new Map([[point, 0]]); let edge = [point];
    for (let ring = 0; ring < 6 && edge.length; ring++) { const next = []; for (const a of edge) for (const b of around_.get(a) || []) { if (seen.has(b)) continue; const d = len(sub(P(b), here)); if (d > wide * 1.5) continue; seen.set(b, d); next.push(b); } edge = next; }
    // Of those found, the ones nearest `wide` away, one from each direction round the point.
    const side = unit(cross(normal, Math.abs(normal[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), up = cross(normal, side), best = new Map();
    for (const [other, d] of seen) {
      if (other === point || dot(normals.get(other), normal) < .45) continue;
      const off = sub(P(other), here), sector = Math.floor((Math.atan2(dot(off, up), dot(off, side)) / TAU + .5) * (TIES - 1)) % (TIES - 1), miss = Math.abs(d - wide);
      if (!best.has(sector) || miss < best.get(sector)[1]) best.set(sector, [other, miss]);
    }
    const ring = [...best.values()].map(entry => entry[0]), made = ring.length ? [[point, .25], ...ring.map(other => [other, .75 / ring.length])] : [[point, 1]];
    spreadOf.set(key, made); return made;
  }
  const info = new Map();
  function pointInfo(point, kind) {
    if (!info.has(point)) {
      const p = P(point), a = { l: share(point, ARM.l), r: share(point, ARM.r) }, g = { l: share(point, LEG.l), r: share(point, LEG.r) };
      const side = p[0] >= 0 ? 'l' : 'r', arm = arms[side].at(p), leg = legs[side].at(p);
      info.set(point, { armW: Math.max(a.l, a.r), legW: Math.max(g.l, g.r), armS: arm.s, kind });
    }
    return info.get(point);
  }
  const vertexOf = (point, kind) => ({ src: [[point, 1]], p0: P(point), n0: normals.get(point), ...pointInfo(point, kind), kind });
  function between(a, b, t) {
    const src = new Map();
    for (const [p, w] of a.src) src.set(p, (src.get(p) || 0) + w * (1 - t));
    for (const [p, w] of b.src) src.set(p, (src.get(p) || 0) + w * t);
    return { src: [...src], p0: mix(a.p0, b.p0, t), n0: unit(mix(a.n0, b.n0, t)), armW: lerp(a.armW, b.armW, t), legW: lerp(a.legW, b.legW, t), armS: lerp(a.armS, b.armS, t), kind: a.kind, p: a.p && b.p ? mix(a.p, b.p, t) : undefined };
  }
  function meshOf(quads, kind) {
    const local = new Map(), verts = [], tris = [];
    const at = point => { if (!local.has(point)) { local.set(point, verts.length); verts.push(vertexOf(point, kind)); } return local.get(point); };
    for (const face of quads) {
      const q = face.map(at);
      // Split each four-sided face along its shorter diagonal.
      if (q.length === 4 && len(sub(verts[q[0]].p0, verts[q[2]].p0)) > len(sub(verts[q[1]].p0, verts[q[3]].p0))) tris.push([q[0], q[1], q[3]], [q[1], q[2], q[3]]);
      else for (let i = 2; i < q.length; i++) tris.push([q[0], q[i - 1], q[i]]);
    }
    return { verts, tris };
  }
  /** Keep what lies where the field is positive, cutting cleanly through the faces that straddle it. */
  function clip(mesh, field) {
    const f = mesh.verts.map(field), verts = mesh.verts.slice(), tris = [], cuts = new Map();
    const cut = (i, o) => {
      const key = i < o ? i + '/' + o : o + '/' + i;
      if (!cuts.has(key)) { cuts.set(key, verts.length); verts.push(between(mesh.verts[i], mesh.verts[o], f[i] / (f[i] - f[o]))); }
      return cuts.get(key);
    };
    for (const tri of mesh.tris) {
      const inside = tri.map(v => f[v] > 0), count = inside.filter(Boolean).length;
      if (count === 3) tris.push(tri);
      else if (count === 1) { const k = inside.indexOf(true), a = tri[k], b = tri[(k + 1) % 3], c = tri[(k + 2) % 3]; tris.push([a, cut(a, b), cut(a, c)]); }
      else if (count === 2) { const k = inside.indexOf(false), c = tri[k], a = tri[(k + 1) % 3], b = tri[(k + 2) % 3], bc = cut(b, c), ac = cut(a, c); tris.push([a, b, bc], [a, bc, ac]); }
    }
    return tidy({ verts, tris });
  }
  /** Drop what no face uses, and faces with no size. */
  function tidy(mesh) {
    const tris = mesh.tris.filter(t => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
    const used = new Int32Array(mesh.verts.length).fill(-1), verts = [];
    // Each garment has its own copy of every point: what one cut does to a point is not seen by the next.
    for (const tri of tris) for (const v of tri) if (used[v] < 0) { used[v] = verts.length; verts.push({ ...mesh.verts[v] }); }
    return { verts, tris: tris.map(t => { const made = t.map(v => used[v]); if (t.zone) made.zone = t.zone; return made; }) };
  }
  /** Each face as four. */
  function subdivide(mesh) {
    const verts = mesh.verts.slice(), tris = [], mids = new Map();
    const mid = (a, b) => { const key = a < b ? a + '/' + b : b + '/' + a; if (!mids.has(key)) { mids.set(key, verts.length); verts.push(between(mesh.verts[a], mesh.verts[b], .5)); } return mids.get(key); };
    for (const [a, b, c] of mesh.tris) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); tris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    return { verts, tris };
  }
  /** The open edges of a mesh as loops of vertices, each in the order its faces run. */
  function loops(mesh) {
    const count = new Map(), next = new Map();
    for (const [a, b, c] of mesh.tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) { const key = u < v ? u + '/' + v : v + '/' + u; count.set(key, (count.get(key) || 0) + 1); }
    for (const [a, b, c] of mesh.tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) if (count.get(u < v ? u + '/' + v : v + '/' + u) === 1) next.set(u, v);
    const out = [], seen = new Set();
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const loop = []; let at = start;
      while (at !== undefined && !seen.has(at)) { seen.add(at); loop.push(at); at = next.get(at); }
      if (loop.length > 2) out.push(loop);
    }
    return out;
  }
  function neighbours(mesh) {
    const near = mesh.verts.map(() => new Set());
    for (const [a, b, c] of mesh.tris) { near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b); }
    return near.map(set => [...set]);
  }

  // --- The trunk as rings -------------------------------------------------------------------------
  // At each height, the outline that a cloth wrapped round the trunk (or both legs) would take.
  const STEP = .01, SECTORS = 72;
  const trunk = meshOf(tights, 'tights');
  const rings = (() => {
    const lowest = mark.calf * .5 + floor, rows = Math.ceil((top - lowest) / STEP) + 1, table = [];
    const cuts = Array.from({ length: rows }, () => []);
    for (const tri of trunk.tris) {
      const v = tri.map(i => trunk.verts[i]);
      if (v.some(a => a.armW > .5)) continue;
      const ys = v.map(a => a.p0[1]), first = Math.max(0, Math.ceil((Math.min(...ys) - lowest) / STEP)), last = Math.min(rows - 1, Math.floor((Math.max(...ys) - lowest) / STEP));
      for (let row = first; row <= last; row++) {
        const y = lowest + row * STEP;
        for (let k = 0; k < 3; k++) { const a = v[k].p0, b = v[(k + 1) % 3].p0; if ((a[1] > y) !== (b[1] > y)) { const t = (y - a[1]) / (b[1] - a[1]); cuts[row].push([a[0] + t * (b[0] - a[0]), a[2] + t * (b[2] - a[2])]); } }
      }
    }
    for (let row = 0; row < rows; row++) {
      const outline = hull(cuts[row]);
      if (outline.length < 3) { table.push(null); continue; }
      let lo = Infinity, hi = -Infinity; for (const [, z] of outline) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
      table.push({ outline, z: (lo + hi) / 2 });
    }
    // The line the rings are measured from: the middle of the body front to back, moving gently with height.
    const zs = table.map(ring => ring?.z ?? 0);
    for (let pass = 0; pass < 12; pass++) for (let i = 1; i < rows - 1; i++) if (table[i]) zs[i] = (zs[i - 1] + 2 * zs[i] + zs[i + 1]) / 4;
    const radius = table.map((ring, row) => ring ? Float32Array.from({ length: SECTORS }, (_, k) => reach(ring.outline, [0, zs[row]], [Math.sin(k * TAU / SECTORS), Math.cos(k * TAU / SECTORS)])) : null);
    const rowOf = y => clamp((y - lowest) / STEP, 0, rows - 1.001);
    return {
      lowest, rows, radius, rowOf,
      axisZ(y) { const r = rowOf(y), i = Math.floor(r); return lerp(zs[i], zs[i + 1], r - i); },
      /** A copy of the radii to be shaped into a garment. */
      copy() { return radius.map(row => row ? Float32Array.from(row) : new Float32Array(SECTORS)); },
    };
  })();
  /** Read a table of rings at an angle and a height. */
  function sample(table, angle, y) {
    const r = rings.rowOf(y), i = Math.floor(r), fr = r - i, s = ((angle / TAU) % 1 + 1) % 1 * SECTORS, k = Math.floor(s) % SECTORS, fs = s - Math.floor(s), k1 = (k + 1) % SECTORS;
    return lerp(lerp(table[i][k], table[i][k1], fs), lerp(table[i + 1][k], table[i + 1][k1], fs), fr);
  }
  const around = p => Math.atan2(p[0], p[2] - rings.axisZ(p[1]));

  // --- Laying cloth over the body -------------------------------------------------------------------
  /** A value given at some heights, read at any height between. `stops` is [[y, value], ...] from the top down. */
  const profile = stops => y => {
    if (y >= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (y >= stops[i][0]) return lerp(stops[i][1], stops[i - 1][1], smooth(stops[i][0], stops[i - 1][0], y));
    return stops.at(-1)[1];
  };
  /** Stand every point off the body by its ease, then let the cloth pull itself smooth without going back in. */
  function drape(mesh, easeOf, passes, lift = 0) {
    const near = neighbours(mesh), edge = new Map();
    for (const loop of loops(mesh)) loop.forEach((v, i) => edge.set(v, [loop[(i + loop.length - 1) % loop.length], loop[(i + 1) % loop.length]]));
    // Cloth rests on whatever faces up (the shoulders, the top of a sleeve) and stands away from what faces sideways or down.
    const ease = mesh.verts.map(v => { const room = easeOf(v); return v.kind === 'skirt' ? room : Math.max(Math.min(room, .005), room * lerp(1, .22, smooth(.25, .8, v.n0[1]))) + lift; });
    for (const [i, v] of mesh.verts.entries()) v.p ||= add(v.p0, mul(v.n0, ease[i]));
    for (let pass = 0; pass < passes; pass++) {
      const moved = mesh.verts.map((v, i) => {
        if (v.fixed) return v.p;
        const list = edge.get(i) || near[i], mean = [0, 0, 0];
        for (const j of list) { mean[0] += mesh.verts[j].p[0]; mean[1] += mesh.verts[j].p[1]; mean[2] += mesh.verts[j].p[2]; }
        const p = mix(v.p, mul(mean, 1 / list.length), .5), out = dot(sub(p, v.p0), v.n0);
        return out < ease[i] ? add(p, mul(v.n0, ease[i] - out)) : p;
      });
      mesh.verts.forEach((v, i) => { v.p = moved[i]; });
    }
  }

  /**
   * Make a tube of the cloth round a limb. The middle of the tube is the middle of the limb itself (not the line of its bones,
   * which lies to one side of the flesh), and its width at each place is what `widthOf(s, natural)` makes of the limb's own.
   */
  function tubeLimb(verts, limb_, isLimb, widthOf, blendOf, { bins = 28, last = 1, spread = .055 } = {}) {
    // The middle of the limb at each place along it is the middle of the cloth near that place: a smooth line that turns
    // with the elbow or the knee, where the bones make a corner.
    for (const v of verts) v.at = limb_.at(v.p);
    const flesh = verts.filter(v => isLimb(v) && v.at.s > .04 && v.at.s <= last + .04);
    const weigh = (s, read) => { const sum = [0, 0, 0]; let total = 0; for (const v of flesh) { const w = Math.exp(-(((v.at.s - s) / spread) ** 2)); if (w < 1e-4) continue; const value = read(v); sum[0] += value[0] * w; sum[1] += value[1] * w; sum[2] += value[2] * w; total += w; } return total ? mul(sum, 1 / total) : null; };
    const middle = Array.from({ length: bins + 1 }, (_, b) => weigh(Math.min(last, b / bins), v => v.p) || limb_.frame(b / bins).p);
    const along = middle.map((p, b) => unit(sub(middle[Math.min(bins, b + 1)], middle[Math.max(0, b - 1)])));
    const at = (list, s) => { const b = clamp(s * bins, 0, bins - .001), i = Math.floor(b); return mix(list[i], list[i + 1], b - i); };
    const radial = v => { const axis = unit(at(along, v.at.s)), d = sub(v.p, at(middle, v.at.s)); return sub(d, mul(axis, dot(d, axis))); };
    for (const v of verts) v.radial = radial(v);
    const far = Float32Array.from({ length: bins + 1 }, (_, b) => (weigh(Math.min(last, b / bins), v => [len(v.radial), 0, 0]) || [0])[0] * 1.05);
    const wide = widthOf(far, bins);
    for (const v of verts) {
      const blend = blendOf(v); if (blend <= 0) continue;
      const d = v.radial, r = len(d); if (r < 1e-5) continue;
      const b = clamp(v.at.s * bins, 0, bins - .001), i = Math.floor(b), want = lerp(wide[i], wide[i + 1], b - i);
      v.p = add(v.p, mul(d, (lerp(r, want, blend) - r) / r));
    }
  }

  /** Let the finished shape settle: each point toward the middle of those round it, the edges held, and nothing back into the body. */
  function relax(mesh, passes) {
    if (!passes) return;
    const near = neighbours(mesh), held = new Set(loops(mesh).flat());
    for (let pass = 0; pass < passes; pass++) {
      const next = mesh.verts.map((v, i) => {
        if (held.has(i) || v.added) return v.p;
        const mean = [0, 0, 0]; for (const j of near[i]) { mean[0] += mesh.verts[j].p[0]; mean[1] += mesh.verts[j].p[1]; mean[2] += mesh.verts[j].p[2]; }
        const p = mix(v.p, mul(mean, 1 / near[i].length), .5);
        if (v.kind === 'skirt') return p;
        const out = dot(sub(p, v.p0), v.n0); return out < .004 ? add(p, mul(v.n0, .004 - out)) : p;
      });
      mesh.verts.forEach((v, i) => { v.p = next[i]; });
    }
  }

  // --- Tops ------------------------------------------------------------------------------------------
  // The middle of the neck, front to back: the middle of the tights' top edge. (The neck's joint lies behind it.)
  const neckMiddle = (() => { let lo = Infinity, hi = -Infinity; for (const face of tights) for (const p of face) if (positions[p * 3 + 1] > top - .012) { lo = Math.min(lo, positions[p * 3 + 2]); hi = Math.max(hi, positions[p * 3 + 2]); } return (lo + hi) / 2; })();
  const JOIN = mark.hip + .035 + floor;
  function top_(cut) {
    const hemY = height(cut.hem ?? 'hip'), long = hemY < mark.crotch + floor + .02, sleeve = cut.sleeve ?? 1, neck = { y: 0, depth: .03, v: 0, width: .07, ...cut.neck };
    const neckY = mark.neck + floor + neck.y, zNeck = neckMiddle;
    const hemAt = p => {
      const angle = around(p), back = smooth(.2, -.6, Math.cos(angle)), centre = Math.abs(Math.cos(angle));
      return hemY - (cut.hemBack || 0) * back - (cut.hemCurve || 0) * centre * centre + (cut.hemSlant || 0) * p[0] / .2;
    };
    // A neckline is what a level cut leaves of the cloth round the neck: lower in front, lower still down the middle of a V,
    // and no wider than `round`, so that it does not run out over the shoulders.
    const neckAt = p => {
      const level = neckY - neck.depth * smooth(zNeck - .03, zNeck + .06, p[2]) - (p[2] > zNeck ? neck.v * Math.max(0, 1 - Math.abs(p[0]) / neck.width) : 0);
      return Math.max(level - p[1], Math.hypot(p[0], p[2] - zNeck) - (neck.round ?? .082));
    };
    let mesh = clip(trunk, v => {
      if (v.armW > .5) return sleeve > 0 ? (sleeve - v.armS) * .45 : -1;
      const p = v.p0, body = Math.min(neckAt(p), p[1] - (long ? JOIN : hemAt(p)));
      return sleeve > 0 ? body : Math.min(body, ((cut.armhole ?? .32) - v.armW) * .2);
    });
    for (const tri of mesh.tris) tri.zone = 'body';
    if (long) mesh = withSkirt(mesh, hemAt, cut);
    for (let i = 0; i < (cut.subdivide || 0); i++) mesh = keepZones(mesh, subdivide);
    shapeTop(mesh, cut, hemAt, hemY);
    return mesh;
  }
  function keepZones(mesh, change) {
    // Zones are per face; a change that makes four faces of one gives each the zone of the one it came from.
    const zones = mesh.tris.map(t => t.zone), made = change(mesh);
    made.tris.forEach((t, i) => { t.zone = zones[Math.floor(i / 4)]; });
    return made;
  }
  /** The skirt of a coat: the long skirt cut between the hips and the hem, sewn to the trunk above it. */
  function withSkirt(mesh, hemAt, cut) {
    const lower = clip(meshOf(skirt, 'skirt'), v => Math.min(JOIN - v.p0[1], v.p0[1] - hemAt(v.p0)));
    const upperLoop = loops(mesh).filter(loop => loop.every(v => Math.abs(mesh.verts[v].p0[1] - JOIN) < 1e-4))[0];
    const lowerLoop = loops(lower).filter(loop => loop.every(v => Math.abs(lower.verts[v].p0[1] - JOIN) < 1e-4))[0];
    if (!upperLoop || !lowerLoop) throw new Error('a coat with nothing to hang its skirt from');
    const base = mesh.verts.length, verts = mesh.verts.concat(lower.verts), tris = mesh.tris.slice();
    for (const t of lower.tris) { const made = t.map(v => v + base); made.zone = 'body'; tris.push(made); }
    // The skirt's top edge is the trunk's bottom edge: its points are moved onto the nearest of the trunk's.
    const ring = upperLoop.map(v => ({ v, angle: around(verts[v].p0) }));
    const weld = new Map();
    for (const v of lowerLoop) {
      const angle = around(lower.verts[v].p0); let best = null, least = Infinity;
      for (const r of ring) { const d = Math.abs(((r.angle - angle + Math.PI) % TAU + TAU) % TAU - Math.PI); if (d < least) { least = d; best = r.v; } }
      weld.set(v + base, best);
    }
    const welded = tris.map(t => { const made = t.map(v => weld.get(v) ?? v); made.zone = t.zone; return made; });
    // Trunk points that no skirt point landed on are joined in with a fan to the skirt points either side.
    const used = new Set(weld.values()), order = ring.slice().sort((a, b) => a.angle - b.angle), n = order.length;
    for (let i = 0; i < n; i++) {
      if (used.has(order[i].v)) continue;
      let before = i, after = i;
      while (!used.has(order[(before + n) % n].v)) before--;
      while (!used.has(order[after % n].v)) after++;
      const a = order[(before + n) % n].v, b = order[after % n].v;
      // The skirt face below the edge a–b now has a notch above it; each unused point between fills its part.
      for (let k = before + 1; k < after; k++) {
        const here = order[(k + n) % n].v, prev = order[(k - 1 + n) % n].v;
        const made = [prev, here, b]; made.zone = 'body'; welded.push(made);
      }
      i = after - 1;
    }
    const out = tidy({ verts, tris: welded });
    orient(out);
    return out;
  }
  /** Turn every face of a closed tube to face outward from the body's middle. */
  function orient(mesh) {
    for (const tri of mesh.tris) {
      const [a, b, c] = tri.map(v => mesh.verts[v].p0), n = cross(sub(b, a), sub(c, a)), mid = mul(add(add(a, b), c), 1 / 3);
      const out = mesh.verts[tri[0]].kind === 'skirt' || mesh.verts[tri[1]].kind === 'skirt' || mesh.verts[tri[2]].kind === 'skirt' ? [mid[0], 0, mid[2] - rings.axisZ(mid[1])] : mesh.verts[tri[0]].n0;
      if (dot(n, out) < 0) { const keep = tri[1]; tri[1] = tri[2]; tri[2] = keep; }
    }
  }

  function shapeTop(mesh, cut, hemAt, hemY) {
    const e = { shoulder: .012, chest: .03, waist: .04, hip: .04, hem: null, sleeve: .025, cuff: .015, ...cut.ease }, f = floor;
    e.hem ??= e.hip;
    const armpit = mark.armpit + f, bodyEase = profile([[mark.shoulder + f, e.shoulder], [mark.chest + f, e.chest], [mark.waist + f, e.waist], [Math.min(JOIN, mark.hip + f), e.hip], [Math.min(hemY, mark.crotch + f - .05), e.hem]]);
    const armEase = s => lerp(e.sleeve, e.cuff, smooth(.25, .95, s));
    // `lift`: clear of whatever is worn under it.
    drape(mesh, v => v.kind === 'skirt' ? 0 : lerp(bodyEase(v.p0[1]), armEase(v.armS), smooth(.25, .6, v.armW)), cut.smooth ?? 8, cut.lift || 0);
    // Below the arms the cloth takes the outline of the trunk and hangs from it.
    const table = rings.copy(), hang = cut.hang ?? .6, start = Math.floor(rings.rowOf(armpit + .05));
    for (let row = rings.rows - 1; row >= 0; row--) {
      const y = rings.lowest + row * STEP, ease = bodyEase(y);
      for (let k = 0; k < SECTORS; k++) {
        let r = table[row][k] + ease;
        if (row < start) r = Math.max(r, table[row + 1][k] * (y < JOIN ? Math.max(hang, .97) : .9 + .1 * hang) - (1 - hang) * .004);
        table[row][k] = r;
      }
    }
    // Gathered at a ribbed hem, taken in at a waist, let out toward a hem.
    const rib = cut.rib ?? .06, shape = y => {
      let k = 1;
      if (cut.cinch) k *= 1 - cut.cinch * smooth(hemY + rib + .09, hemY + rib, y);
      if (cut.waist) k *= 1 - cut.waist * Math.exp(-(((y - mark.waist - f) / .1) ** 2));
      if (cut.flare) k *= 1 + cut.flare * smooth(mark.waist + f, hemY, y);
      return k;
    };
    for (let row = 0; row <= start; row++) { const k = shape(rings.lowest + row * STEP); for (let s = 0; s < SECTORS; s++) table[row][s] *= k; }
    // Soften the rings round and down, so that no one height or direction shows.
    for (let pass = 0; pass < 3; pass++) for (let row = 1; row < rings.rows - 1; row++) {
      const next = new Float32Array(SECTORS);
      for (let k = 0; k < SECTORS; k++) next[k] = (table[row][(k + SECTORS - 1) % SECTORS] + 2 * table[row][k] + table[row][(k + 1) % SECTORS]) / 4;
      table[row] = next;
    }
    const hug = cut.hug ?? 0;
    for (const v of mesh.verts) {
      if (v.armW > .5) continue;
      const y = v.p[1], z = rings.axisZ(y), angle = Math.atan2(v.p[0], v.p[2] - z), r = Math.hypot(v.p[0], v.p[2] - z), want = sample(table, angle, y);
      // Below the arms all the way round; above them only across the chest and the back, where there is no arm to hang over.
      const flat = smooth(.8, .5, Math.abs(Math.sin(angle))) * (1 - smooth(mark.shoulder + f - .09, mark.shoulder + f - .02, y)) * (cut.chest ?? .85);
      const blend = Math.max(1 - smooth(armpit - .03, armpit + .05, y), flat) * (1 - smooth(.2, .5, v.armW)) * (v.kind === 'skirt' ? 1 : 1 - hug);
      if (blend <= 0 && v.kind !== 'skirt') continue;
      const to = v.kind === 'skirt' ? want : lerp(r, want, blend);
      v.p = [Math.sin(angle) * to, y, z + Math.cos(angle) * to];
    }
    // Sleeves: a tube about the arm that hangs straight from the shoulder and gathers at a ribbed cuff.
    const tube = cut.tube ?? .8, cuff = cut.cuffCinch || 0, sleeve = cut.sleeve ?? 1;
    for (const side of ['l', 'r']) {
      const mine = mesh.verts.filter(v => v.armW > .2 && (v.p0[0] >= 0) === (side === 'l') && !v.added);
      if (!mine.length) continue;
      tubeLimb(mine, arms[side], v => v.armW > .5, (far, bins) => {
        const hung = Float32Array.from(far);
        // From the upper arm down the cloth keeps its width, however the arm beneath narrows, by as much as `tube` says.
        // (Measured from the middle of the upper arm: nearer the shoulder the cloth is the armhole's, not the sleeve's.)
        const from = Math.round(bins * .36);
        for (let b = from + 1; b <= bins; b++) hung[b] = Math.max(hung[b], hung[b - 1] * (.9 + .1 * tube));
        for (let b = 0; b < from; b++) hung[b] = Math.min(hung[b], hung[from] * (1 + (from - b) / bins * 1.6));
        for (let b = 0; b <= bins; b++) { const at = b / bins; hung[b] *= (1 + (cut.sleeveFlare || 0) * smooth(.3, 1, at)) * (1 - cuff * smooth(sleeve - .2, sleeve - .07, at)); }
        for (let pass = 0; pass < 2; pass++) for (let b = 1; b < bins; b++) hung[b] = (hung[b - 1] + 2 * hung[b] + hung[b + 1]) / 4;
        return hung;
      }, v => tube * smooth(.1, .26, v.at.s) * smooth(.3, .6, v.armW));
    }
    if (cut.shoulderDrop) for (const v of mesh.verts) {
      // Cloth that runs past the shoulder and falls off it.
      const w = smooth(mark.shoulder + f - .12, mark.shoulder + f + .02, v.p0[1]) * smooth(.08, .2, Math.abs(v.p0[0])) * (1 - smooth(.25, .5, v.armS) * (v.armW > .5 ? 1 : 0));
      v.p = add(v.p, [Math.sign(v.p0[0]) * cut.shoulderDrop * w, -cut.shoulderDrop * .35 * w, 0]);
    }
    relax(mesh, cut.relax ?? 3);
    for (const bump of cut.bumps || []) {
      // A padded swelling under the cloth: [x, height, front (1) or back (-1), how far across, how far out].
      const [x, y, face, wide, out] = bump, yy = height(y);
      for (const v of mesh.verts) {
        if (v.armW > .5) continue;
        const angle = around(v.p), facing = face > 0 ? Math.cos(angle) : face < 0 ? -Math.cos(angle) : 1; if (facing < -.2) continue;
        const d = Math.hypot(v.p[0] - x, v.p[1] - yy) / wide, k = Math.exp(-d * d) * clamp(facing + .6);
        if (k > .01) { const dir = unit([Math.sin(angle), 0, Math.cos(angle)]); v.p = add(v.p, mul(dir, out * k)); }
      }
    }
  }

  // --- Bottoms ---------------------------------------------------------------------------------------
  function bottom_(cut) {
    const riseY = height(cut.rise ?? 'waist-0.04'), hemY = height(cut.hem ?? 'ankle+0.01');
    let mesh = clip(trunk, v => v.armW > .3 ? -1 : Math.min(riseY + (cut.riseBack || 0) * smooth(.2, -.6, Math.cos(around(v.p0))) - v.p0[1], v.p0[1] - hemY));
    for (const tri of mesh.tris) tri.zone = mesh.verts[tri[0]].p0[0] + mesh.verts[tri[1]].p0[0] + mesh.verts[tri[2]].p0[0] >= 0 ? 'legL' : 'legR';
    for (let i = 0; i < (cut.subdivide || 0); i++) mesh = keepZones(mesh, subdivide);
    const e = { waist: .008, seat: .02, thigh: .02, knee: .02, hem: .02, ...cut.ease }, f = floor;
    const ease = profile([[riseY, e.waist], [mark.hip + f, e.seat], [mark.thigh + f, e.thigh], [mark.knee + f, e.knee], [Math.min(hemY, mark.calf + f), e.hem]]);
    drape(mesh, v => ease(v.p0[1]), cut.smooth ?? 6);
    const straight = cut.straight ?? .5, drop = cut.dropCrotch || 0;
    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? 1 : -1, mine = mesh.verts.filter(v => (v.p0[0] >= 0) === (side === 'l'));
      tubeLimb(mine, legs[side], v => v.legW > .5, (far, bins) => {
        const hung = Float32Array.from(far);
        // A trouser leg does not follow the calf in and out: from the thigh down it keeps its width by as much as `straight` says.
        for (let b = 7; b <= bins; b++) hung[b] = Math.max(hung[b], hung[b - 1] * (.9 + .1 * straight));
        for (let b = 0; b <= bins; b++) { const at = b / bins; hung[b] *= (1 + (cut.flare || 0) * smooth(.45, 1, at)) * (1 - (cut.taper || 0) * smooth(.5, 1, at)); }
        for (let pass = 0; pass < 2; pass++) for (let b = 1; b < bins; b++) hung[b] = (hung[b - 1] + 2 * hung[b] + hung[b + 1]) / 4;
        return hung;
      }, v => smooth(.12, .3, v.at.s) * smooth(.3, .6, v.legW) * (cut.tube ?? .9), { last: .93 });
      // One leg does not pass through the other.
      for (const v of mine) if (v.p[0] * sign < .004 && v.legW > .5) v.p = [.004 * sign, v.p[1], v.p[2]];
    }
    relax(mesh, cut.relax ?? 2);
    if (drop) for (const v of mesh.verts) {
      // The seam between the legs let down: the cloth hangs between the thighs.
      const k = Math.exp(-((v.p0[0] / .09) ** 2)) * smooth(mark.hip + f + .06, mark.crotch + f, v.p0[1]) * smooth(mark.crotch + f - drop - .12, mark.crotch + f - .02, v.p0[1]);
      v.p = add(v.p, [0, -drop * k, 0]);
    }
    return mesh;
  }
  /** A skirt, cut from the long one. `radius` is how far its hem stands out, as a share of where the hips put it. */
  function skirt_(cut) {
    const riseY = height(cut.rise ?? 'waist'), hemY = height(cut.hem ?? 'knee');
    const mesh = clip(meshOf(skirt, 'skirt'), v => Math.min(riseY - v.p0[1], v.p0[1] - hemY));
    orient(mesh);
    for (const tri of mesh.tris) tri.zone = 'body';
    const table = rings.copy(), top = Math.floor(rings.rowOf(riseY)), e = { waist: .01, hip: .02, hem: .03, ...cut.ease };
    const ease = profile([[riseY, e.waist], [mark.hip + floor, e.hip], [hemY, e.hem]]);
    for (let row = top; row >= 0; row--) {
      const y = rings.lowest + row * STEP;
      for (let k = 0; k < SECTORS; k++) {
        let r = table[row][k] + ease(y);
        if (row < top && y < mark.hip + floor + .04) r = Math.max(r, table[row + 1][k] * (1 + (cut.flare || 0) * STEP / Math.max(.05, mark.hip + floor - hemY)));
        table[row][k] = r;
      }
    }
    for (const step of cut.tiers || []) {
      // A hard step outward at a height: [height, how far].
      const y = height(step[0]);
      for (let row = 0; row <= top; row++) if (rings.lowest + row * STEP < y) for (let k = 0; k < SECTORS; k++) table[row][k] += step[1];
    }
    if (cut.round) for (let row = 0; row <= top; row++) { const mean = table[row].reduce((a, b) => a + b, 0) / SECTORS; for (let k = 0; k < SECTORS; k++) table[row][k] = lerp(table[row][k], mean, cut.round); }
    for (const v of mesh.verts) {
      const y = v.p0[1], z = rings.axisZ(y), angle = Math.atan2(v.p0[0], v.p0[2] - z), r = sample(table, angle, y);
      v.p = [Math.sin(angle) * r, y, z + Math.cos(angle) * r];
    }
    return mesh;
  }

  // --- What is added ---------------------------------------------------------------------------------
  /**
   * A band standing on an open edge: a collar on a neckline, a rib on a hem, a turned edge, a longer cuff.
   * rows: [[along `axis`, outward from the edge, how much each row leans forward], ...] from the edge.
   * `scaleOf(vertex, i)` scales a point's share of the band: nothing at the throat of a collar that parts there.
   */
  function band(mesh, loop, rows, zone, { axis = [0, 1, 0], scaleOf = null, surface = false } = {}) {
    const centre = mul(loop.reduce((sum, v) => add(sum, mesh.verts[v].p), [0, 0, 0]), 1 / loop.length);
    let last = loop.slice();
    // `surface`: the band climbs the body itself (up a neck that leans and narrows), each point by the lie of the body under it.
    const outOf = loop.map(v => { if (surface) return mesh.verts[v].n0; const d = sub(mesh.verts[v].p, centre); return unit(sub(d, mul(axis, dot(d, axis)))); });
    const alongOf = loop.map((v, i) => surface ? unit(sub(axis, mul(outOf[i], dot(axis, outOf[i])))) : axis);
    const k = loop.map((v, i) => scaleOf ? scaleOf(mesh.verts[v], i) : 1);
    rows.forEach(([up, out, lean = 0]) => {
      const ring = loop.map((v, i) => {
        const from = mesh.verts[v], made = { ...from, src: from.src.slice(), added: zone };
        made.p = add(from.p, add(mul(outOf[i], out * (surface ? 1 : k[i])), add(mul(alongOf[i], up * k[i]), [0, 0, lean * up * k[i]])));
        mesh.verts.push(made); return mesh.verts.length - 1;
      });
      for (let i = 0; i < loop.length; i++) {
        const j = (i + 1) % loop.length;
        const a = [last[i], ring[i], last[j]], b = [last[j], ring[i], ring[j]]; a.zone = b.zone = zone; mesh.tris.push(a, b);
      }
      last = ring;
    });
    return last;
  }
  /** Which open edge is which: the neck, the hem, a cuff. */
  function edges(mesh) {
    const found = { cuffs: [] };
    for (const loop of loops(mesh)) {
      const arm = loop.reduce((sum, v) => sum + mesh.verts[v].armW, 0) / loop.length, y = loop.reduce((sum, v) => sum + mesh.verts[v].p0[1], 0) / loop.length;
      const x = loop.reduce((sum, v) => sum + mesh.verts[v].p0[0], 0) / loop.length;
      if (arm > .5 || Math.abs(x) > .12) found.cuffs.push(loop);
      else if (!found.high || y > found.highY) { if (found.high) { found.low = found.high; found.lowY = found.highY; } found.high = loop; found.highY = y; }
      else if (!found.low || y < found.lowY) { found.low = loop; found.lowY = y; }
    }
    return found;
  }
  function addOns(mesh, cut, block) {
    const open = edges(mesh), neck = block === 'top' ? open.high : null, hem = block === 'top' ? open.low : null;
    let straps = 0;
    for (const item of cut.add || []) {
      if (item.type === 'collar' && neck) {
        const h = item.height ?? .04, out = item.flare ?? .004, lean = item.lean ?? 0, gap = item.gap ?? 0;
        const centre = mul(neck.reduce((sum, v) => add(sum, mesh.verts[v].p), [0, 0, 0]), 1 / neck.length);
        // A collar that parts at the throat comes down to nothing there; `points` lengthens it toward the front instead.
        const scaleOf = v => { const d = sub(v.p, centre), frontness = d[2] / (Math.hypot(d[0], d[2]) || 1), side = Math.abs(d[0]); return (gap ? smooth(gap * .4, gap * 1.6, side + (frontness < 0 ? 1 : 0)) : 1) * (1 + (item.points || 0) * smooth(.3, .95, frontness)); };
        // A collar that stands a little, turns over and lies down close to the neck.
        if (item.style === 'fold') band(mesh, neck, [[h * .45, .003, lean], [h * .56, .009, lean], [h * .34, .014, lean], [h * .02, .015, lean], [-h * .32, .017, lean]], 'collar', { scaleOf, surface: true });
        else if (item.style === 'funnel') band(mesh, neck, [[h * .35, out * .5 + .004, lean], [h * .7, out + .006, lean], [h, out + .004, lean], [h * 1.01, out - .004, lean]], 'collar', { scaleOf, surface: true });
        else band(mesh, neck, [[h * .5, out * .6 + .001, lean], [h, out + .001, lean], [h * 1.02, out - .004, lean]], 'collar', { scaleOf, surface: true });
      } else if (item.type === 'hood' && neck) hood(mesh, neck, item);
      else if (item.type === 'lip') {
        for (const loop of [hem, ...open.cuffs].filter(Boolean)) band(mesh, loop, [[.002, -.006], [.014, -.008]], 'lining');
      } else if (item.type === 'cuff') {
        // The sleeve carried on past the wrist, over the hand.
        for (const loop of open.cuffs) { const side = mesh.verts[loop[0]].p0[0] >= 0 ? 'l' : 'r', axis = arms[side].axes.at(-1), n = Math.max(1, Math.round((item.length ?? .04) / .02)); band(mesh, loop, Array.from({ length: n }, (_, i) => [(i + 1) / n * (item.length ?? .04), (item.flare || 0) * (i + 1) / n]), 'body', { axis }); }
      } else if (item.type === 'hem' && hem) {
        // A band hung from the hem: a second layer showing below the first, a frill, a peplum.
        const n = Math.max(1, Math.round((item.length ?? .04) / .02)); band(mesh, hem, Array.from({ length: n }, (_, i) => [-(i + 1) / n * (item.length ?? .04), (item.flare || 0) * (i + 1) / n + (item.out || 0)]), item.zone || 'body');
      } else if (item.type === 'strap' || item.type === 'tail') strap(mesh, item, straps++);
    }
  }
  /** The point of the garment nearest a place given on its front, back or one side: { on, x, h }. */
  function anchor(mesh, { on = 'front', x = 0, h }) {
    const y = height(h); let best = -1, least = Infinity;
    mesh.verts.forEach((v, i) => {
      if (v.added) return;
      const facing = Math.cos(around(v.p));
      if (on === 'front' ? facing < .1 : on === 'back' ? facing > -.1 : false) return;
      if ((on === 'front' || on === 'back') && v.armW > .5) return;
      if (on === 'sleeveL' || on === 'sleeveR') { if (v.armW < .5 || (v.p0[0] > 0) !== (on === 'sleeveL')) return; }
      const d = on.startsWith('sleeve') ? Math.abs(v.armS - x) * 2 + Math.abs(v.p[2] - (h ?? 0)) * 0 : Math.hypot(v.p[0] - x, v.p[1] - y);
      if (d < least) { least = d; best = i; }
    });
    if (best < 0) throw new Error('nowhere to fix a strap at ' + JSON.stringify({ on, x, h }));
    return mesh.verts[best];
  }
  /**
   * A strap from one place on the garment to another, hanging between them: { from, to, width, sag, out }.
   * Or a tail hanging from one place: { from, length, width, swing: how far it leans out as it falls }.
   * Each point along a strap is held by both its ends, by how near it is to each: when the legs part, it stretches.
   */
  function strap(mesh, item, id) {
    const a = anchor(mesh, item.from), tail = item.type === 'tail', b = tail ? a : anchor(mesh, item.to), wide = item.width ?? .03, lift = item.out ?? .012;
    const start = add(a.p, mul(a.n0, lift)), end = tail ? add(start, [(item.lean || 0), -(item.length ?? .2), 0]) : add(b.p, mul(b.n0, lift));
    const long = len(sub(end, start)), n = Math.max(2, Math.round(long / .035)), dir = unit(sub(end, start)), zone = 'strap:' + id;
    let last = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, out = unit(mix(a.n0, b.n0, t)), centre = add(mix(start, end, t), add([0, -(item.sag || 0) * 4 * t * (1 - t), 0], mul(out, (item.swing || 0) * t * (tail ? 1 : 1 - t) * 4 * (tail ? .25 : 1))));
      const across = unit(cross(dir, out)), pair = [-1, 1].map(side => {
        const made = { ...between(a, b, tail ? 0 : t), added: 'strap', flat: [t * long, side * wide / 2] };
        made.p = add(centre, mul(across, side * wide / 2)); mesh.verts.push(made); return mesh.verts.length - 1;
      });
      if (last) { const one = [last[0], pair[0], last[1]], two = [last[1], pair[0], pair[1]]; one.zone = two.zone = zone; mesh.tris.push(one, two); }
      last = pair;
    }
  }
  /** A hood lying down the back: a pouch hung from the back of the neck that comes round to nothing at the throat. */
  function hood(mesh, neck, { size = 1, drop = .2 } = {}) {
    const centre = mul(neck.reduce((sum, v) => add(sum, mesh.verts[v].p), [0, 0, 0]), 1 / neck.length);
    // How far round to the back each point of the neck is: 1 at the nape, 0 from the collarbones forward.
    const back = neck.map(v => { const d = sub(mesh.verts[v].p, centre); return smooth(-.55, .75, -d[2] / (Math.hypot(d[0], d[2]) || 1)); });
    const section = [[.022, .012], [.03, .034], [.012, .058], [-.3, .074], [-.72, .07], [-1, .045], [-1.02, .012]];
    let last = neck.slice();
    section.forEach(([down, out], row) => {
      const ring = neck.map((v, i) => {
        const from = mesh.verts[v], d = sub(from.p, centre), dir = unit([d[0], 0, d[2]]), k = back[i], made = { ...from, src: from.src.slice(), added: 'hood' };
        // At the throat the hood is only a rolled edge; at the nape it is the whole pouch.
        const y = down > 0 ? down * (.3 + .7 * k) : down * drop * size * k - .003 * row * (1 - k), far = out * size * (.22 + .78 * k);
        made.p = add(from.p, add(mul(dir, far), [0, y, 0]));
        mesh.verts.push(made); return mesh.verts.length - 1;
      });
      for (let i = 0; i < neck.length; i++) { const j = (i + 1) % neck.length, a = [last[i], ring[i], last[j]], b = [last[j], ring[i], ring[j]]; a.zone = b.zone = 'hood'; mesh.tris.push(a, b); }
      last = ring;
    });
  }

  // --- Out ------------------------------------------------------------------------------------------
  // Which points of the skin a garment covers: those nearest a part of the tights that the garment kept.
  const skinPoints = [...new Set(bodyFaces.flat())], tightsPoints = [...new Set(tights.flat())];
  const nearestTights = (() => {
    const cell = .04, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
    for (const t of tightsPoints) { const p = P(t), k = key(...p.map(v => Math.floor(v / cell))); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); }
    const out = new Map();
    for (const s of skinPoints) {
      const p = P(s), c = p.map(v => Math.floor(v / cell)); let best = -1, least = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const t of grid.get(key(c[0] + dx, c[1] + dy, c[2] + dz)) || []) { const d = len(sub(P(t), p)); if (d < least) { least = d; best = t; } }
      if (best >= 0 && least < .05) out.set(s, best);
    }
    return out;
  })();

  /**
   * Cut a garment. Returns what build-human.mjs writes for a part ({ tie, share, off, corners, uv, triangles,
   * hidden }) and what the painter needs to know of every corner ({ rest, zone, panel }).
   */
  function make(recipe) {
    const cut = cutOf(recipe), block = cut.block || 'top', mesh = block === 'top' ? top_(cut) : block === 'bottom' ? bottom_(cut) : skirt_(cut);
    for (const v of mesh.verts) v.p ||= v.p0;
    // What is added may be placed by the garment's own hem and top, as well as by the body's heights.
    mark.hem = Infinity; mark.top = -Infinity; for (const v of mesh.verts) { mark.hem = Math.min(mark.hem, v.p[1] - floor); mark.top = Math.max(mark.top, v.p[1] - floor); }
    addOns(mesh, cut, block);
    const made = tidy(mesh), n = made.verts.length, held = bonesOf(made, cut.soften ?? (block === 'skirt' ? 2 : 8));
    const bone = new Uint8Array(n * 4), pull = new Uint8Array(n * 4);
    const tie = new Uint16Array(n * TIES), share_ = new Uint8Array(n * TIES), off = new Float32Array(n * 3), rest = [];  // `rest`: each point as cut, on the standing body, which is what the painter measures
    // How far a garment looks past the detail of the body: by default as far as it stands off it, and never less than a hand's breadth for anything loose.
    const loose = cut.follow ?? (block === 'bottom' ? .035 : cut.hug ? 0 : .06);
    made.verts.forEach((v, i) => {
      const mixed = new Map();
      for (const [point, w] of v.src) for (const [other, share] of (loose > 0 ? spread(point, loose) : [[point, 1]])) mixed.set(other, (mixed.get(other) || 0) + w * share);
      const top = [...mixed].sort((a, b) => b[1] - a[1]).slice(0, TIES), sum = top.reduce((s, e) => s + e[1], 0), at = [0, 0, 0];
      // Shares are kept as bytes that sum to 255: the first takes up whatever rounding leaves.
      const bytes = top.map(([, w]) => Math.round(w / sum * 255)); bytes[0] += 255 - bytes.reduce((total, value) => total + value, 0);
      for (let k = 0; k < TIES; k++) {
        const point = (top[k] || top[0])[0], w = (bytes[k] || 0) / 255;
        tie[i * TIES + k] = point; share_[i * TIES + k] = bytes[k] || 0;
        for (let a = 0; a < 3; a++) at[a] += modelled[point * 3 + a] * w;
      }
      off.set(sub(unposed(v.p, held[i]), at), i * 3); rest.push(v.p);
      // As bytes that sum to 255, the strongest first.
      let left = 255; held[i].forEach(([b, w], k) => { const value = k === held[i].length - 1 ? left : Math.min(left, Math.round(w * 255)); bone[i * 4 + k] = b; pull[i * 4 + k] = value; left -= value; });
    });
    // What it covers. A point of the skin is hidden when the tights over it are well inside the garment.
    const kept = new Map();
    for (const v of made.verts) if (v.kind === 'tights' && !v.added && v.src.length === 1) kept.set(v.src[0][0], true);
    const edge = new Set(); for (const loop of loops(made)) for (const v of loop) for (const [p] of made.verts[v].src) edge.add(p);
    const hidden = cut.sheer ? [] : skinPoints.filter(s => { const t = nearestTights.get(s); return t !== undefined && kept.has(t) && !edge.has(t); });
    return { ...unwrap(made, block), points: n, ties: TIES, tie, share: share_, off, bone, pull, rest, hidden, floor, mark: { ...mark } };
  }

  /** Lay the faces out flat: a front and a back, each sleeve and each leg opened along its seam. */
  function unwrap(mesh, block) {
    // Each face belongs to a panel; each panel has two measures in metres, across and up.
    const panels = new Map(), cornerOf = new Map(), point = [], flat = [], zones = [], triangles = [];
    const panelOf = (tri, verts) => {
      const zone = tri.zone || 'body', mid = mul(add(add(verts[0].p, verts[1].p), verts[2].p), 1 / 3), arm = (verts[0].armW + verts[1].armW + verts[2].armW) / 3;
      if (zone === 'collar' || zone === 'hood' || zone === 'lining' || zone.startsWith('strap')) return zone;
      if (zone === 'body' && arm > .5) return mid[0] >= 0 ? 'sleeveL' : 'sleeveR';
      if (zone === 'body') return Math.cos(around(mid)) >= 0 ? 'front' : 'back';
      return zone;
    };
    // For every corner: across and up its panel in metres, and where it is on the garment: how far along a limb (0 to 1) and
    // which way round it (0 on the outside, positive toward the front), or which way round the trunk it faces.
    const measure = (name, v) => {
      const p = v.p;
      if (v.flat) return [v.flat[0], v.flat[1], 0, 0];
      if (!/^(sleeve|leg)/.test(name)) {
        const z = rings.axisZ(p[1]), r = Math.hypot(p[0], p[2] - z), turn = Math.atan2(p[0], p[2] - z); let angle = turn;
        if (name === 'back') angle = angle >= 0 ? Math.PI - angle : -Math.PI - angle;
        if (name !== 'front' && name !== 'back') return [angle * Math.max(.06, r), p[1] + (v.added ? r * .6 : 0), 0, turn];
        return [angle * Math.max(.1, r), p[1], 0, turn];
      }
      const side = name.endsWith('L') ? 'l' : 'r', limb_ = (name.startsWith('sleeve') ? arms : legs)[side], at = limb_.at(p);
      // Opened along the inside: the angle is measured from the outside of the limb.
      let angle = at.angle + (side === 'l' ? Math.PI / 2 : -Math.PI / 2); angle = ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
      return [angle * Math.max(.04, at.far), -at.s * limb_.total, at.s, side === 'l' ? angle : -angle];
    };
    const extra = [];
    for (const tri of mesh.tris) {
      const verts = tri.map(v => mesh.verts[v]), name = panelOf(tri, verts);
      if (!panels.has(name)) panels.set(name, { name, lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] });
      const panel = panels.get(name), uv = verts.map(v => measure(name, v));
      // A face that straddles the line a panel is opened along is laid on one side of it.
      if (name !== 'front' && name !== 'back' && !name.startsWith('strap')) {
        const xs = uv.map(c => c[0]), wide = Math.max(...xs) - Math.min(...xs);
        if (wide > .2) { const r = wide / TAU * 1.02, limbed = /^(sleeve|leg)/.test(name), flip = limbed && name.endsWith('R') ? -1 : 1; for (const c of uv) if (c[0] < 0) { c[0] += TAU * r; c[3] += TAU * flip; } }
      }
      tri.forEach((v, k) => {
        const key = v + '/' + name + '/' + Math.round(uv[k][0] * 2000);
        if (!cornerOf.has(key)) { cornerOf.set(key, point.length); point.push(v); flat.push(uv[k].slice(0, 2)); extra.push(uv[k].slice(2)); zones.push(name); for (let a = 0; a < 2; a++) { panel.lo[a] = Math.min(panel.lo[a], uv[k][a]); panel.hi[a] = Math.max(panel.hi[a], uv[k][a]); } }
        triangles.push(cornerOf.get(key));
      });
    }
    // Pack the panels onto one square, all to the same scale, tallest first along shelves.
    const list = [...panels.values()].map(p => ({ ...p, w: p.hi[0] - p.lo[0], h: p.hi[1] - p.lo[1] })).sort((a, b) => b.h - a.h), gap = .012;
    let scale = 0;
    for (let size = 4; size > .3; size *= .97) {
      let x = gap, y = gap, shelf = 0, fits = true;
      for (const p of list) {
        if (p.w + 2 * gap > size) { fits = false; break; }
        if (x + p.w + gap > size) { x = gap; y += shelf + gap; shelf = 0; }
        p.x = x; p.y = y; x += p.w + gap; shelf = Math.max(shelf, p.h);
      }
      if (!fits || y + shelf + gap > size) break;
      scale = size; for (const p of list) { p.fx = p.x; p.fy = p.y; }
    }
    if (!scale) throw new Error('the panels do not fit');
    const place = new Map(list.map(p => [p.name, p])), uv = new Float32Array(point.length * 2);
    for (let i = 0; i < point.length; i++) { const p = place.get(zones[i]); uv[i * 2] = (p.fx + flat[i][0] - p.lo[0]) / scale; uv[i * 2 + 1] = 1 - (p.fy + p.hi[1] - flat[i][1]) / scale; }
    return { corners: point, uv, triangles, zones, flat, extra, metres: scale, limbs: { sleeve: arms.l.total, leg: legs.l.total } };
  }

  return { make, mark, floor, arms, legs, around, height };
}
