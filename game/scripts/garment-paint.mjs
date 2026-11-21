// Paint a cut garment: its cloth, what is sewn and printed on it, and how its surface catches the light.
//
// A garment's `paint` is a list of steps, laid one over another in order. Each step works in the
// garment's own measures, never in the picture's: a height above the floor, a distance from the
// middle of the chest, how far down a sleeve. So a zip is a line from the hem to the neck, a pocket
// is a rectangle on the front, a print is a drawing so many centimetres wide on the back, and all of
// them land in the right place whatever way the panels were laid out.
//
// Frames, for the steps that draw: 'front' and 'back' are [across, height] (across is the wearer's
// left, as you look at them: the viewer's right from the front); 'sleeves', 'sleeveL', 'sleeveR',
// 'legs', 'legL', 'legR' are [round the limb toward the front, how far along it from 0 to 1].
//
// Steps:
//   fabric   { type, colour, colour2, scale, where }           the cloth itself
//   pattern  { type, colours, scale, amount, where }           camouflage, tartan, flowers, marble, bleach, patchwork…
//   panel    { colour, where }                                 a block of another colour
//   rib      { where, gauge, depth, colour }                   knitted ribbing
//   quilt    { type, size, puff, where, colour }               stitched padding
//   line     { frame, pts, width, style, colour, dash }        a seam, a line of stitches, a tape, a zip
//   rect     { frame, at, size, style, colour, rot, mirror }   a pocket, a flap, a patch, a label
//   dots     { frame, pts | from/to/count, r, style, colour }  buttons, snaps, studs, eyelets
//   print    { frame, art, at, width, opacity, rot, mirror }   a drawing from data/archive-prints
//   distress { type, amount, colour, where }                   fading, whiskers, holes, paint, grime
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SIZE = Number(process.env.GARMENT_TEXTURE || 2048);
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
const rgb = h => { const s = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const run = (cmd, args, input) => execFileSync(cmd, args, { input, maxBuffer: 256 * 1024 * 1024 });

// --- Noise --------------------------------------------------------------------------------------
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); };
const fbm = (x, y, octaves = 4) => { let sum = 0, amp = .5, f = 1; for (let i = 0; i < octaves; i++) { sum += amp * noise(x * f + i * 17.13, y * f - i * 9.37); amp *= .5; f *= 2.03; } return sum / (1 - .5 ** octaves); };
/** The nearest of a scatter of points, one to a cell: how far, which, and where from it. */
function scatter(x, y, jitter = .8, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y); let best = { d: 9, id: 0, dx: 0, dy: 0 };
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, px = cx + .5 + (hash(cx + seed, cy) - .5) * jitter, py = cy + .5 + (hash(cx, cy + 91 + seed) - .5) * jitter, dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
    if (d < best.d) best = { d, id: hash(cx + 7 + seed, cy + 13), dx, dy };
  }
  return best;
}
const band = (v, width) => clamp(1 - Math.abs(v) / width);
const repeat = (v, spacing) => v - Math.round(v / spacing) * spacing;

// --- Drawings -------------------------------------------------------------------------------------
const drawings = new Map();
function drawing(name) {
  if (!drawings.has(name)) {
    const file = fileURLToPath(new URL('../data/archive-prints/' + name + '.svg', import.meta.url));
    if (!existsSync(file)) throw new Error('no drawing ' + name);
    const png = run('rsvg-convert', ['-w', '768', file]), [w, h] = run('magick', ['png:-', '-format', '%w %h', 'info:'], png).toString().split(' ').map(Number);
    drawings.set(name, { w, h, pixels: run('magick', ['png:-', '-depth', '8', 'rgba:-'], png) });
  }
  return drawings.get(name);
}
function sampleDrawing(art, u, v) {
  // u, v from 0 to 1 across and down the drawing; returns [r, g, b, a] with a from 0 to 1, or null outside it.
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  const x = u * art.w - .5, y = v * art.h - .5, x0 = clamp(Math.floor(x), 0, art.w - 1), y0 = clamp(Math.floor(y), 0, art.h - 1), x1 = Math.min(art.w - 1, x0 + 1), y1 = Math.min(art.h - 1, y0 + 1), fx = clamp(x - x0), fy = clamp(y - y0);
  const out = [0, 0, 0, 0], p = art.pixels;
  for (const [px, py, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) { const i = (py * art.w + px) * 4, a = p[i + 3] / 255 * w; out[0] += p[i] * a; out[1] += p[i + 1] * a; out[2] += p[i + 2] * a; out[3] += a; }
  if (out[3] < .003) return null;
  return [out[0] / out[3], out[1] / out[3], out[2] / out[3], out[3]];
}

// --- Where a step applies -------------------------------------------------------------------------
const ZONES = { body: ['front', 'back'], torso: ['front', 'back', 'collar', 'hood'], sleeves: ['sleeveL', 'sleeveR'], legs: ['legL', 'legR'], trim: ['collar', 'hood', 'lining'] };
// Which way a surface faces: for a shoe, `no` is toward the outside of the foot.
const FACES = { outer: c => c.no > .3, inner: c => c.no < -.3, side: c => Math.abs(c.no) > .3, front: c => c.nz > .35, back: c => c.nz < -.35, top: c => c.ny > .45, bottom: c => c.ny < -.5, up: c => c.ny > .2 };
const zonesOf = zone => new Set([zone].flat().flatMap(name => ZONES[name] || [name]));
function where(w, env) {
  if (!w) return () => 1;
  const zones = w.zone ? zonesOf(w.zone) : null, not = w.not ? zonesOf(w.not) : null, feather = w.feather ?? env.texel * 1.2, ranges = [];
  for (const key of ['h', 'x', 'u', 's', 'ang', 'a', 'b', 'z', 't', 'ax', 'fz', 'fx', 'ft', 'afx']) if (w[key]) ranges.push([key, key === 'h' ? w[key].map(env.H) : w[key]]);
  const face = w.face ? FACES[w.face] : null; if (w.face && !face) throw new Error('no such face: ' + w.face);
  return c => {
    if (zones && !zones.has(c.zone)) return 0;
    if (not && not.has(c.zone)) return 0;
    if (w.front !== undefined && c.front !== w.front) return 0;
    if (w.side && c.left !== (w.side === 'l')) return 0;
    if (face && !face(c)) return 0;
    let m = 1;
    for (const [key, [lo, hi]] of ranges) { const v = key === 'ax' ? Math.abs(c.x) : key === 'afx' ? Math.abs(c.fx) : c[key]; m *= smooth(lo - feather, lo + feather, v) * (1 - smooth(hi - feather, hi + feather, v)); if (m <= 0) return 0; }
    return m;
  };
}
/** A pixel in a frame's own two measures, or null if it is not on that part of the garment. */
function frameOf(name, env) {
  const limb = /^(sleeve|leg)/.test(name);
  if (limb) {
    const zones = zonesOf(name === 'sleeves' || name === 'legs' ? name : name), total = name.startsWith('sleeve') ? env.limbs.sleeve : env.limbs.leg;
    // Across is metres round the limb toward the front; along is metres from its root, though a step gives it from 0 to 1.
    return { limb: true, total, at: c => zones.has(c.zone) ? [c.left ? c.a : -c.a, c.s * total] : null, point: ([p, q]) => [p, q * total], up: -1 };
  }
  if (name === 'front' || name === 'back') { const front = name === 'front'; return { at: c => c.front === front && !c.sleeve && c.zone !== 'lining' ? [front ? c.x : -c.x, c.h] : null, point: ([p, q]) => [p, env.H(q)], up: 1 }; }
  if (name === 'sideL' || name === 'sideR') { const left = name === 'sideL'; return { at: c => !c.limb && c.left === left && Math.abs(c.facing) < .75 ? [left ? -c.z : c.z, c.h] : null, point: ([p, q]) => [p, env.H(q)], up: 1 }; }
  // A shoe, seen from a side, from in front, from behind and from above: [how far from the heel, height], [toward the outside, height], [toward the outside, how far from the heel].
  if (name === 'outer' || name === 'inner' || name === 'sides') return { at: c => (name === 'sides' ? Math.abs(c.no) > .25 : name === 'outer' ? c.no > .25 : c.no < -.25) ? [c.fz, c.h] : null, point: p => p, up: 1 };
  if (name === 'toe' || name === 'heel') { const front = name === 'toe'; return { at: c => (front ? c.nz > .3 : c.nz < -.3) ? [front ? c.fx : -c.fx, c.h] : null, point: p => p, up: 1 }; }
  if (name === 'vamp') return { at: c => c.ny > .3 || c.nz > .3 ? [c.fx, c.fz] : null, point: p => p, up: 1 };
  if (name === 'shaft') return { at: c => [c.fz, c.h], point: p => p, up: 1 };
  if (name === 'hood') return { at: c => c.zone === 'hood' ? [-(c.ang >= 0 ? Math.PI - c.ang : -Math.PI - c.ang) * .12, c.h] : null, point: ([p, q]) => [p, env.H(q)], up: 1 };
  const zones = zonesOf(name); return { at: c => zones.has(c.zone) ? [c.a, c.b] : null, point: p => p, up: 1 };
}
const turned = (p, q, rot) => { if (!rot) return [p, q]; const r = rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r); return [p * cs + q * sn, -p * sn + q * cs]; };
function distanceToLine(p, q, pts) {
  let best = Infinity, along = 0, run_ = 0, at = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-12, t = clamp(((p - ax) * ex + (q - ay) * ey) / l2), d = Math.hypot(p - ax - ex * t, q - ay - ey * t), l = Math.sqrt(l2);
    if (d < best) { best = d; at = run_ + t * l; along = ((p - ax) * ey - (q - ay) * ex) / l; }
    run_ += l;
  }
  return [best, at, along];
}

// --- The steps --------------------------------------------------------------------------------------
const mixTo = (o, colour, k) => { o.r += (colour[0] - o.r) * k; o.g += (colour[1] - o.g) * k; o.b += (colour[2] - o.b) * k; };
const scaleBy = (o, k) => { o.r *= k; o.g *= k; o.b *= k; };
const STEPS = {
  fabric(step, env) {
    const mask = where(step.where, env), colour = rgb(step.colour || env.colour), second = step.colour2 ? rgb(step.colour2) : null, type = step.type || 'plain', k = step.scale || 1;
    return (c, o) => {
      const m = mask(c); if (!m) return;
      const a = c.a / k + c.shift, b = c.b / k; let shade = 1, height = 0, tint = 0;
      switch (type) {
        case 'denim': {
          // Diagonal ribs, long uneven streaks down the warp, and the indigo sitting darker in the valleys.
          const twill = Math.sin((a + b) * 2100) * .5 + .5, slub = fbm(a * 380, b * 9, 3), streak = fbm(a * 90, b * 3, 2);
          shade = .9 + .1 * twill + (slub - .5) * .22 + (streak - .5) * .14; height = twill * .00018; tint = (slub - .5) * .5; break;
        }
        case 'leather': {
          // A fine grain, a few soft wrinkles where it has been worn, and broad differences where the hide took the dye unevenly.
          const grain = fbm(a * 620, b * 620, 3), wrinkle = fbm(a * 46 + fbm(a * 9, b * 9, 2) * 3, b * 22, 3), hide = fbm(a * 7 + 4, b * 7, 3);
          shade = .95 + (grain - .5) * .1 + (wrinkle - .5) * .1 + (hide - .5) * .1; height = grain * .00016 + (wrinkle - .5) * .0005; tint = (hide - .5) * .6; break;
        }
        case 'nylon': { const ripple = fbm(a * 14, b * 60, 3), weave = Math.sin(a * 5200) * Math.sin(b * 5200); shade = .97 + (ripple - .5) * .09 + weave * .012; height = (ripple - .5) * .0006; break; }
        case 'ripstop': { const grid = Math.max(band(repeat(a, .006), .0006), band(repeat(b, .006), .0006)), ripple = fbm(a * 14, b * 50, 3); shade = .96 + (ripple - .5) * .08 + grid * .07; height = grid * .00012 + (ripple - .5) * .0005; break; }
        case 'knit': {
          const gauge = step.gauge || .0042, col = repeat(a, gauge) / gauge, rowAt = b / (gauge * .8) + Math.abs(col) * 1.3, stitch = Math.abs(rowAt - Math.round(rowAt)), fuzz = fbm(a * 600, b * 600, 2);
          shade = .84 + .2 * (1 - Math.abs(col) * 2) + stitch * .12 + (fuzz - .5) * .12; height = (1 - Math.abs(col) * 2) * .0006 + stitch * .0002; break;
        }
        case 'jersey': { const fine = fbm(a * 900, b * 900, 2), soft = fbm(a * 30, b * 30, 3); shade = .96 + (fine - .5) * .09 + (soft - .5) * .06; height = (fine - .5) * .0001; break; }
        case 'marl': { const fine = hash(Math.floor(a * 1300), Math.floor(b * 420)), soft = fbm(a * 30, b * 30, 3); shade = .9 + (fine - .5) * .34 + (soft - .5) * .06; height = (fine - .5) * .00012; break; }
        case 'wool': { const fuzz = fbm(a * 700, b * 700, 3), nap = fbm(a * 60, b * 60, 3); shade = .92 + (fuzz - .5) * .22 + (nap - .5) * .1; height = (fuzz - .5) * .0003; break; }
        case 'tweed': { const fleck = hash(Math.floor(a * 900), Math.floor(b * 900)), herring = Math.sin((a + Math.abs(repeat(b, .012)) * (Math.floor(b / .012) % 2 ? 1 : -1)) * 1900); shade = .88 + (fleck - .5) * .4 + herring * .05; tint = fleck > .9 ? 1 : 0; height = (fleck - .5) * .0003; break; }
        case 'velvet': { const nap = fbm(a * 14, b * 9, 3), pile = fbm(a * 900, b * 900, 2); shade = .9 + (nap - .5) * .22 + (pile - .5) * .08; height = (nap - .5) * .0004; break; }
        case 'canvas': { const weave = Math.sin(a * 3000) * Math.sin(b * 3000), slub = fbm(a * 200, b * 14, 2); shade = .94 + weave * .05 + (slub - .5) * .1; height = weave * .00015; break; }
        case 'waxed': { const crease = Math.abs(fbm(a * 26, b * 26, 4) - .5) * 2, bloom = fbm(a * 7, b * 7, 3), twill = Math.sin((a + b) * 2100); shade = .86 + (1 - smooth(0, .12, crease)) * .32 + (bloom - .5) * .22 + twill * .03; height = -(1 - smooth(0, .08, crease)) * .0004 + twill * .00008; break; }
        case 'satin': { const sheen = fbm(a * 5, b * 22, 3); shade = .9 + (sheen - .5) * .3; height = (sheen - .5) * .0004; break; }
        case 'fur': { const tuft = fbm(a * 180, b * 60, 4), lay = fbm(a * 20, b * 20, 2); shade = .7 + tuft * .5 + (lay - .5) * .2; height = tuft * .0015; break; }
        case 'mesh': { const cell = step.cell || .004, hole = Math.max(Math.abs(repeat(a, cell)), Math.abs(repeat(b, cell))) / cell; shade = .9; if (hole < .3) o.alpha = Math.min(o.alpha, 1 - m); height = hole * .0002; break; }
        case 'rubber': { const soft = fbm(a * 12, b * 12, 2); shade = .97 + (soft - .5) * .06; break; }
        case 'wood': { const ring = Math.sin((a * 30 + fbm(a * 6, b * 80, 3) * 5) * 6), grain = fbm(a * 400, b * 20, 2); shade = .88 + ring * .07 + (grain - .5) * .14; height = ring * .00015; break; }
        default: { const weave = fbm(a * 800, b * 800, 2), soft = fbm(a * 25, b * 25, 3); shade = .96 + (weave - .5) * .08 + (soft - .5) * .05; height = (weave - .5) * .0001; }
      }
      const base = second && tint ? [0, 1, 2].map(i => lerp(colour[i], second[i], clamp(tint))) : colour;
      mixTo(o, base.map(v => v * shade), m); o.h += height * m;
    };
  },
  // Cut the cloth away (the piece must be `clear`): everything `where` says, or under an arch `[from, to, height]` along a shoe.
  cut(step, env) { const mask = where(step.where, env), arch = step.arch; return (c, o) => { if (!mask(c)) return; if (arch) { const t = (c.ft - arch[0]) / (arch[1] - arch[0]); if (t <= 0 || t >= 1 || c.h > arch[2] * Math.sin(t * Math.PI) ** (step.round ?? .5)) return; } o.alpha = 0; }; },
  panel(step, env) { const mask = where(step.where, env), colour = rgb(step.colour), keep = step.keepShade ?? 0; return (c, o) => { const m = mask(c); if (!m) return; const light = (o.r + o.g + o.b) / 3 / 128; mixTo(o, keep ? colour.map(v => v * lerp(1, light, keep)) : colour, m * (step.amount ?? 1)); }; },
  pattern(step, env) {
    const mask = where(step.where, env), colours = (step.colours || ['#000000']).map(rgb), k = step.scale || 1, amount = step.amount ?? 1, type = step.type, seed = step.seed || 0;
    // A pattern with a middle (a web, a swirl, rings of dye) is given it as [across from the middle of the panel, height].
    const middle = step.at ? [step.at[0], env.H(step.at[1]) + env.floor] : [0, (env.marks.chest ?? 0) + env.floor];
    return (c, o) => {
      const m = mask(c) * amount; if (!m) return;
      const a = c.a / k + c.shift + seed * 3.7, b = c.b / k + seed * 1.3;
      switch (type) {
        case 'camo': {
          // Woodland: large soft-edged shapes one over another, the darkest smallest.
          for (let i = 0; i < colours.length; i++) { const f = 9 + i * 4, n = fbm(a * f + i * 31, b * f * .8 - i * 17, 3) + .12 * fbm(a * 60 + i, b * 60, 2); if (n > .6 + i * .035) mixTo(o, colours[i], m); }
          break;
        }
        case 'woodland': {
          // The army's woodland: brown shapes and sand shapes on green, and black twigs across them, all with wandering edges.
          const wx = a + (fbm(a * 16, b * 16, 3) - .5) * .045, wy = b + (fbm(a * 16 + 40, b * 16, 3) - .5) * .045, [brown, sand, black] = colours;
          if (fbm(wx * 11 + 3, wy * 8.5 + 11, 3) > .56) mixTo(o, brown, m);
          if (fbm(wx * 12.5 + 71, wy * 10 - 23, 3) > .6) mixTo(o, sand, m);
          if (black && Math.abs(fbm(wx * 8.5 + 17, wy * 14 + 5, 3) - .5) < .022 + .034 * fbm(wx * 22, wy * 22, 2)) mixTo(o, black, m);
          break;
        }
        case 'tiger': { for (let i = 0; i < colours.length; i++) { const n = fbm(a * 5 + i * 9, b * 46 + fbm(a * 12, b * 12, 2) * 6 + i * 20, 3); if (n > .56 + i * .04) mixTo(o, colours[i], m); } break; }
        case 'tartan': {
          // Bands crossing bands: where two of a colour cross it is solid, where one crosses the ground it is half.
          const sett = step.sett || [[.0, .03, 0], [.045, .008, 1], [.07, .004, 2]], period = step.period || .1, twill = (Math.floor((a + b) * 700) % 2 + 2) % 2;
          let ca = -1, cb = -1;
          for (const [at, wide, id] of sett) { if (Math.abs(repeat(a - at, period)) < wide / 2) ca = id; if (Math.abs(repeat(b - at, period)) < wide / 2) cb = id; }
          const pick = ca >= 0 && cb >= 0 ? (twill ? ca : cb) : ca >= 0 ? (twill ? ca : -1) : cb >= 0 ? (twill ? -1 : cb) : -1;
          if (pick >= 0) mixTo(o, colours[pick % colours.length], m * (ca >= 0 && cb >= 0 ? 1 : .86));
          break;
        }
        case 'stripes': { const period = step.period || .04, wide = step.width || period / 2, v = step.dir === 'v' ? a : step.dir === 'd' ? (a + b) * .707 : b, i = Math.floor(v / period + .5), d = Math.abs(repeat(v, period)); if (d < wide / 2) mixTo(o, colours[((i % colours.length) + colours.length) % colours.length], m * smooth(wide / 2, wide / 2 - env.texel, d)); break; }
        case 'check': { const period = step.period || .02, on = (Math.floor(a / period) + Math.floor(b / period)) % 2; if (on) mixTo(o, colours[0], m); break; }
        case 'leopard': {
          // Broken dark rings round a warmer middle.
          const s = scatter(a / .03, b / .03, .9, seed), r = s.d / (.25 + s.id * .2), ang = Math.atan2(s.dy, s.dx), broken = Math.sin(ang * 3 + s.id * 40) > -.35 + s.id * .5;
          if (r < .62) mixTo(o, colours[1] || colours[0], m * .85);
          if (r > .55 && r < 1 + fbm(a * 200, b * 200, 2) * .25 && broken) mixTo(o, colours[0], m);
          break;
        }
        case 'floral': {
          // Flowers of five or six petals scattered with leaves between.
          const size = step.size || .05, s = scatter(a / size, b / size, .7, seed), petals = 5 + Math.floor(s.id * 2.99), ang = Math.atan2(s.dy, s.dx) + s.id * 9, r = s.d / (.28 + s.id * .16), petal = .62 + .38 * Math.cos(ang * petals);
          const leaf = scatter(a / size + 13.3, b / size + 7.1, .9, seed + 5), lr = Math.hypot(leaf.dx * 2.6 * Math.cos(leaf.id * 6) + leaf.dy * 2.6 * Math.sin(leaf.id * 6), (-leaf.dx * Math.sin(leaf.id * 6) + leaf.dy * Math.cos(leaf.id * 6)) * 6);
          if (lr < .9 && colours[3]) mixTo(o, colours[3], m);
          if (r < petal) mixTo(o, colours[Math.floor(s.id * 97) % Math.min(2, colours.length)], m * smooth(petal, petal - .12, r));
          if (r < .2) mixTo(o, colours[2] || colours[0], m);
          break;
        }
        case 'marble': { const warp = fbm(a * 7, b * 7, 4) * 2.2, vein = Math.abs(Math.sin((a * 9 + b * 4 + warp) * Math.PI)), fine = Math.abs(Math.sin((a * 23 - b * 17 + warp * 2.5) * Math.PI)); mixTo(o, colours[0], m * (1 - smooth(0, .1, vein)) * .9); if (colours[1]) mixTo(o, colours[1], m * (1 - smooth(0, .05, fine)) * .5); if (colours[2]) mixTo(o, colours[2], m * smooth(.5, .8, fbm(a * 3 + 9, b * 3, 3)) * .5); break; }
        case 'bleach': { const n = fbm(a * 6, b * 6, 4) + .25 * fbm(a * 40, b * 40, 2), edge = smooth(.56, .7, n); mixTo(o, colours[0], m * edge); if (colours[1]) mixTo(o, colours[1], m * smooth(.74, .86, n)); const s = scatter(a / .018, b / .018, 1, seed); if (s.d < .12 + s.id * .16 && s.id > .55) mixTo(o, colours[0], m * .8); break; }
        case 'splatter': { for (let i = 0; i < colours.length; i++) { const size = (step.size || .02) * (1 + i * .6), s = scatter(a / size + i * 5.5, b / size, 1, seed + i), drip = Math.hypot(s.dx, Math.max(0, s.dy) * .35 + Math.min(0, s.dy)); if (s.id > 1 - (step.density ?? .35) && drip < .1 + s.id * .25 + fbm(a * 300, b * 300, 2) * .1) mixTo(o, colours[i], m); } break; }
        case 'patchwork': case 'boro': {
          // Scraps sewn edge to edge, each its own shade, with a line of stitches round every one.
          const w = step.size || .09, row = Math.floor(b / (w * .8)), offset = hash(row, seed) * w, col = Math.floor((a + offset) / (w * (1 + hash(row, 3 + seed)))), id = hash(col * 7 + seed, row * 13), u = (a + offset) / (w * (1 + hash(row, 3 + seed))) - col, v = b / (w * .8) - row;
          const colour = colours[Math.floor(id * colours.length) % colours.length], weave = type === 'boro' ? .86 + .28 * fbm(a * 300 + id * 50, b * 20 + id * 9, 2) : .92 + .16 * fbm(a * 90 + id * 50, b * 90, 2);
          mixTo(o, colour.map(x => x * weave), m);
          const edge = Math.min(u, 1 - u) * w * (1 + hash(row, 3 + seed)), edge2 = Math.min(v, 1 - v) * w * .8, near = Math.min(edge, edge2);
          if (near < .0012) { scaleBy(o, lerp(1, .55, m)); o.h -= .0003 * m; }
          else if (near > .003 && near < .0044 && (Math.floor((edge < edge2 ? b : a) / .004) % 2 === 0)) mixTo(o, rgb(step.stitch || '#d8d2c0'), m * .8);
          if (type === 'boro' && (Math.floor(b / .009) % 2 === 0) && Math.abs(repeat(b, .009)) < .0006 && (Math.floor(a / .006 + id * 7) % 2 === 0) && id > .35) mixTo(o, rgb(step.stitch || '#e4dfd0'), m * .85);
          break;
        }
        case 'tapestry': {
          const big = scatter(a / .11, b / .11, .7, seed), r = big.d * 2.4, ang = Math.atan2(big.dy, big.dx), bloom = .6 + .4 * Math.cos(ang * 6 + big.id * 9), vine = Math.abs(Math.sin((a * 11 + fbm(a * 5, b * 5, 3) * 3) * Math.PI)), weft = .88 + .12 * Math.sin(b * 2600);
          if (vine < .14) mixTo(o, colours[2] || colours[0], m);
          if (r < bloom) mixTo(o, colours[Math.floor(big.id * 53) % 2], m * .95);
          if (r < .22) mixTo(o, colours[3] || colours[1] || colours[0], m);
          scaleBy(o, lerp(1, weft, m)); o.h += Math.sin(b * 2600) * .00012 * m;
          break;
        }
        case 'herringbone': { const w = step.size || .012, col = Math.floor(a / w), v = b + (col % 2 ? 1 : -1) * repeat(a, w); if ((Math.floor(v / (w * .25)) % 2 + 2) % 2) mixTo(o, colours[0], m * .5); break; }
        case 'dots': { const s = scatter(a / (step.size || .03), b / (step.size || .03), step.jitter ?? 0, seed); if (s.d < (step.r || .3)) mixTo(o, colours[Math.floor(s.id * colours.length) % colours.length], m); break; }
        case 'clouds': { const n = fbm(a * (step.freq || 5), b * (step.freq || 5), 4); for (let i = 0; i < colours.length; i++) mixTo(o, colours[i], m * smooth(.42 + i * .1, .58 + i * .1, n)); break; }
        case 'scales': { const w = step.size || .03, row = Math.floor(b / (w * .5)), u = repeat(a + (row % 2 ? w / 2 : 0), w), v = b - row * w * .5, d = Math.hypot(u, v - w * .5) / (w * .5); if (d > .82 && d < 1) mixTo(o, colours[0], m); break; }
        case 'web': {
          // A spider's web: spokes from a centre and sagging threads strung between them.
          const dx = c.a - middle[0], dy = c.b - middle[1], r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), spokes = step.spokes || 12, sector = ang / (Math.PI * 2) * spokes, near = Math.abs(sector - Math.round(sector)), ring = r / (step.size || .035) + (Math.abs(near) - .5) ** 2 * 1.6;
          const line = Math.min(near * r * Math.PI * 2 / spokes, Math.abs(ring - Math.round(ring)) * (step.size || .035));
          if (line < (step.width || .0025)) { mixTo(o, colours[0], m); o.h += .0008 * m; }
          break;
        }
        case 'feathers': {
          // Overlapping feathers lying downward, each with a spine and barbs.
          const w = step.size || .035, row = Math.floor(b / (w * .8)), u = repeat(a + (row % 2 ? w / 2 : 0), w) / w, v = b / (w * .8) - row, id = hash(Math.floor((a + (row % 2 ? w / 2 : 0)) / w + .5) + seed, row), blade = Math.abs(u) * 2 < Math.sin(Math.min(1, v * 1.15) * Math.PI) ** .7;
          if (blade) { const barb = Math.sin((v + Math.abs(u) * 1.6) * 60); mixTo(o, colours[Math.floor(id * colours.length) % colours.length].map(x => x * (.82 + .18 * barb + .2 * v)), m); o.h += (.0012 * (1 - Math.abs(u) * 2) + barb * .0002) * m; if (Math.abs(u) < .03) scaleBy(o, lerp(1, .6, m)); }
          else scaleBy(o, lerp(1, .55, m));
          break;
        }
        case 'gingham': { const period = step.period || .012, ca = (Math.floor(a / period) % 2 + 2) % 2, cb = (Math.floor(b / period) % 2 + 2) % 2; if (ca + cb) mixTo(o, colours[0], m * (ca + cb) * .5); break; }
        case 'houndstooth': { const period = step.period || .012, u = ((a / period) % 2 + 2) % 2, v = ((b / period) % 2 + 2) % 2, tooth = (u < 1) !== (v < 1) ? ((u % 1) + (v % 1)) % 1 < .5 : u < 1; if (tooth) mixTo(o, colours[0], m); break; }
        case 'argyle': { const w = step.size || .06, u = Math.abs(repeat(a, w)) / w, v = Math.abs(repeat(b, w * 1.6)) / (w * 1.6), id = (Math.floor(a / w + .5) + Math.floor(b / (w * 1.6) + .5)) % colours.length; if (u + v < .5) mixTo(o, colours[(id + colours.length) % colours.length], m); if (Math.abs(u + v - .5) < .012 && colours.length > 2) mixTo(o, colours.at(-1), m); break; }
        case 'swirl': {
          // Rings of colour pulled out of round, one inside another.
          const warp = fbm(a * 5, b * 5, 3) * 3, r = Math.hypot(c.a - middle[0], c.b - middle[1]) * (step.freq || 30) + warp + Math.atan2(c.b - middle[1], c.a - middle[0]) * (step.twist ?? 1), i = Math.floor(r);
          mixTo(o, colours[((i % colours.length) + colours.length) % colours.length], m * smooth(0, .12, r - i) * smooth(1, .88, r - i) * .0 + m); break;
        }
        case 'opart': {
          // Dots that swell and shrink across the cloth, so that it seems to bulge.
          const w = step.size || .018, u = repeat(a, w) / w, v = repeat(b, w) / w, swell = .5 + .5 * Math.sin(a * (step.freq || 18)) * Math.cos(b * (step.freq || 18) * .8), r = .12 + .34 * swell;
          if (Math.hypot(u, v) < r) mixTo(o, colours[Math.floor((swell + hash(Math.floor(a / w + .5), Math.floor(b / w + .5)) * .3) * colours.length) % colours.length], m);
          break;
        }
        case 'snake': { const w = step.size || .014, row = Math.floor(b / (w * .6)), u = repeat(a + (row % 2 ? w / 2 : 0), w) / w, v = b / (w * .6) - row, d = Math.abs(u) + Math.abs(v - .5); if (d > .44) mixTo(o, colours[0], m * .8); const blotch = fbm(a * 18, b * 18, 3); if (blotch > .58 && colours[1]) mixTo(o, colours[1], m * .7); break; }
        case 'tiedye': { const r = Math.hypot(c.a - middle[0], c.b - middle[1]), n = fbm(a * 12, b * 12, 3), ring = Math.sin((r + n * .05) * (step.freq || 60)); for (let i = 0; i < colours.length; i++) mixTo(o, colours[i], m * smooth(.2, .9, Math.sin((r + n * .05) * (step.freq || 60) + i * 2.1)) * .8); if (ring > 2) break; break; }
        case 'lace': { const w = step.size || .02, s = scatter(a / w, b / w, .3, seed), ang = Math.atan2(s.dy, s.dx), petal = .32 + .12 * Math.cos(ang * 6), net = Math.min(Math.abs(repeat(a + b, .005)), Math.abs(repeat(a - b, .005))); if (Math.abs(s.d - petal) < .05 || s.d < .1 || net < .0006) { mixTo(o, colours[0], m); o.h += .0004 * m; } else if (step.open) o.alpha = Math.min(o.alpha, 1 - m); break; }
        case 'drips': {
          // Rubber that a sole was dipped in and that ran before it set: an uneven edge with long tongues, measured round the shoe.
          const u = Math.atan2(c.fx, c.fz - .14) * 5 + (c.left ? 0 : 9), n = fbm(u * 1.3, 2.7, 3), tongue = Math.max(0, Math.sin(u * 2.6 + n * 7)) ** 5, edge = (step.base ?? .02) + (step.height ?? .035) * (.3 * n + .7 * tongue);
          if (c.h < edge) { mixTo(o, colours[0], m); o.h += .0012 * m * smooth(edge, edge - .004, c.h); }
          break;
        }
        case 'pinstripe': { const period = step.period || .014; if (Math.abs(repeat(a, period)) < (step.width || .0009)) mixTo(o, colours[0], m * (.6 + .4 * hash(Math.floor(b * 500), 3))); break; }
        case 'speckle': { const s = hash(Math.floor(a * (step.freq || 700)), Math.floor(b * (step.freq || 700))); if (s > 1 - (step.density ?? .08)) mixTo(o, colours[Math.floor(s * 977) % colours.length], m); break; }
        default: throw new Error('no such pattern: ' + type);
      }
    };
  },
  // One colour running into another between two heights (or two places along a limb with `along: 's'`).
  gradient(step, env) { const mask = where(step.where, env), from = rgb(step.from[1]), to = rgb(step.to[1]), key = step.along || 'h', lo = key === 'h' ? env.H(step.from[0]) : step.from[0], hi = key === 'h' ? env.H(step.to[0]) : step.to[0]; return (c, o) => { const m = mask(c); if (!m) return; const k = smooth(lo, hi, c[key] + (fbm(c.a * 20, c.b * 20, 3) - .5) * (step.rough || 0)), light = step.keepShade ? (o.r + o.g + o.b) / 3 / 128 : 1; mixTo(o, [0, 1, 2].map(i => lerp(from[i], to[i], k) * light), m * (step.amount ?? 1)); }; },
  // Lacing: two rows of eyelets and the lace crossing between them, from one point of a frame to another.
  laces(step, env) {
    const frame = frameOf(step.frame || 'vamp', env), a = frame.point(step.from), b = frame.point(step.to), rows = step.rows || 6, half = (step.width || .03) / 2, colour = rgb(step.colour || '#e8e6df'), metal = rgb(step.eyelets || '#8f8d86'), long = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = [(b[0] - a[0]) / long, (b[1] - a[1]) / long], thick = step.thick || .0028;
    return (c, o) => {
      const at = frame.at(c); if (!at) return;
      const px = at[0] - a[0], py = at[1] - a[1], along = px * dir[0] + py * dir[1], across = px * dir[1] - py * dir[0]; if (along < -.008 || along > long + .008 || Math.abs(across) > half + .008) return;
      const pitch = long / rows, k = along / pitch, row = Math.floor(k), f = k - row;
      // The opening the lace closes: darker, and a little below the leather either side.
      if (Math.abs(across) < half - .003) { scaleBy(o, step.tongue === false ? 1 : .72); o.h -= .0005; }
      if (along >= 0 && along <= long) { const x1 = lerp(-half, half, f), x2 = lerp(half, -half, f); if (Math.min(Math.abs(across - x1), Math.abs(across - x2)) < thick / 2) { mixTo(o, colour, 1); o.h += .001; } }
      for (const r of [row, row + 1]) if (r >= 0 && r <= rows && Math.hypot(Math.abs(across) - half, along - r * pitch) < .0036) { mixTo(o, metal, 1); o.h += .0006; }
    };
  },
  rib(step, env) {
    const mask = where(step.where, env), gauge = step.gauge || .005, depth = step.depth ?? .0007, colour = step.colour ? rgb(step.colour) : null, across = step.dir === 'h';
    return (c, o) => { const m = mask(c); if (!m) return; if (colour) mixTo(o, colour, m); const v = Math.cos((across ? c.b : c.a) / gauge * Math.PI * 2); scaleBy(o, lerp(1, .8 + .2 * (v * .5 + .5), m)); o.h += v * depth * .5 * m; };
  },
  quilt(step, env) {
    const mask = where(step.where, env), size = step.size || .06, puff = step.puff ?? .004, type = step.type || 'h', stitch = step.colour ? rgb(step.colour) : null, size2 = step.size2 || size;
    return (c, o) => {
      const m = mask(c); if (!m) return;
      let d;
      if (type === 'h') d = Math.abs(repeat(c.b, size)) / size * 2;
      else if (type === 'v') d = Math.abs(repeat(c.a, size)) / size * 2;
      else if (type === 'diamond') d = Math.max(Math.abs(repeat(c.a + c.b, size)), Math.abs(repeat(c.a - c.b, size))) / size * 2;
      else d = Math.max(Math.abs(repeat(c.a, size)) / size, Math.abs(repeat(c.b, size2)) / size2) * 2;
      // d runs from 0 at the middle of a pocket of filling to 1 at the stitching that holds it.
      const round = Math.sqrt(Math.max(0, 1 - d * d)), wrinkle = (fbm(c.a * 140, c.b * 30, 2) - .5) * (1 - round) * .0012;
      o.h += (round * puff + wrinkle) * m; scaleBy(o, lerp(1, .78 + .26 * round, m));
      if (stitch && d > .93) mixTo(o, stitch, m * .7);
    };
  },
  line(step, env) {
    const frame = frameOf(step.frame || 'front', env), pts = step.pts.map(frame.point), width = step.width ?? .002, style = step.style || 'seam', colour = step.colour ? rgb(step.colour) : null, colour2 = step.colour2 ? rgb(step.colour2) : null, mirror = step.mirror, mask = where(step.where, env);
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], pad = width + .012;
    for (const [p, q] of pts) { lo[0] = Math.min(lo[0], mirror ? -Math.abs(p) : p); hi[0] = Math.max(hi[0], mirror ? Math.abs(p) : p); lo[1] = Math.min(lo[1], q); hi[1] = Math.max(hi[1], q); }
    return (c, o) => {
      const at = frame.at(c); if (!at) return;
      if (at[0] < lo[0] - pad || at[0] > hi[0] + pad || at[1] < lo[1] - pad || at[1] > hi[1] + pad) return;
      const m = mask(c); if (!m) return;
      const p = mirror && at[0] < 0 ? -at[0] : at[0], [d, along, side] = distanceToLine(p, at[1], pts), t = env.texel;
      if (style === 'seam') {
        // A joined edge: a fine dark valley, and the cloth a little raised either side of it.
        if (d < width * 3) { const k = smooth(width * 3, 0, d); o.h -= .0005 * k * m * (d < width ? 1 : -.25); if (d < width) scaleBy(o, lerp(1, .62, m * smooth(width, width * .3, d))); }
      } else if (style === 'stitch' || style === 'twin') {
        const dash = step.dash || .0034, on = (Math.floor(along / dash) % 3) !== 2, off = style === 'twin' ? Math.abs(d - (step.gap || .005) / 2) : d;
        if (off < width / 2 + t * .5 && on) { mixTo(o, colour || [222, 214, 190], m * smooth(width / 2 + t * .5, width / 2 - t * .5, off)); o.h += .00018 * m; }
        if (style === 'twin' && d < width * .8) { o.h -= .00035 * m; scaleBy(o, lerp(1, .8, m)); }
      } else if (style === 'zip') {
        // Teeth down the middle, a tape either side, and the cloth turned back along it.
        const tape = step.tape ?? width * 2.6;
        if (d < tape) { mixTo(o, colour2 || (colour ? colour.map(v => v * .35) : [22, 22, 24]), m * smooth(tape, tape - t, d)); o.h += .0003 * m; }
        if (d < width) { const tooth = (Math.floor(along / (width * .9)) % 2 === 0) === (side > 0); mixTo(o, (colour || [176, 176, 172]).map(v => v * (tooth ? 1 : .55)), m); o.h += (tooth ? .0009 : .0003) * m; }
      } else if (style === 'tape' || style === 'strap') {
        // A flat band laid on the cloth: webbing, a taped seam, a stripe of leather.
        if (d < width / 2 + t) {
          const k = m * smooth(width / 2 + t * .5, width / 2 - t * .5, d), ribbed = style === 'strap' ? .88 + .12 * Math.sin(along * 2600) : 1;
          mixTo(o, (colour || [20, 20, 22]).map(v => v * ribbed), k); o.h += (step.raise ?? .0009) * k;
          if (step.edge !== false && d > width / 2 - .0022 && d < width / 2 - .0012 && Math.floor(along / .0034) % 3 !== 2) mixTo(o, colour2 || (colour || [20, 20, 22]).map(v => Math.min(255, v * 1.5 + 22)), k * .7);
        } else if (d < width / 2 + .004) scaleBy(o, lerp(1, .78, m * smooth(width / 2 + .004, width / 2, d)));
      } else if (style === 'groove') { if (d < width) { const k = smooth(width, 0, d) * m; o.h -= (step.depth ?? .0008) * k; scaleBy(o, lerp(1, .7, k)); } }
      else if (style === 'ridge') { if (d < width) { const k = smooth(width, 0, d) * m; o.h += (step.depth ?? .0012) * k; if (colour) mixTo(o, colour, k); } }
      else if (style === 'paint') { if (d < width / 2 + t) mixTo(o, colour || [240, 240, 236], m * smooth(width / 2 + t * .5, width / 2 - t * .5, d) * (step.opacity ?? 1) * (step.dry ? .55 + .45 * fbm(c.a * 300, c.b * 300, 2) : 1)); }
      else throw new Error('no such line: ' + style);
    };
  },
  rect(step, env) {
    const frame = frameOf(step.frame || 'front', env), centre = frame.point(step.at), [w, h] = step.size, style = step.style || 'patch', colour = step.colour ? rgb(step.colour) : null, stitch = step.stitch === false ? null : rgb(step.stitch || '#00000000'.slice(0, 7)), mirror = step.mirror, round = step.round ?? .004, rot = step.rot || 0;
    const reach = Math.hypot(w, h) / 2 + .02, hasStitch = step.stitch !== undefined && step.stitch !== false;
    return (c, o) => {
      const at = frame.at(c); if (!at) return;
      let p = at[0], q = at[1], side = 1;
      if (mirror && p < 0) { p = -p; side = -1; }
      p -= centre[0]; q -= centre[1];
      if (Math.abs(p) > reach || Math.abs(q) > reach) return;
      [p, q] = turned(p, q * frame.up, rot * (mirror ? side : 1));
      // How far inside the rounded outline, in metres (negative outside).
      const dx = Math.abs(p) - w / 2 + round, dy = Math.abs(q) - h / 2 + round, inside = -(Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round), t = env.texel;
      if (inside < -.006) return;
      if (inside < 0) { if (style !== 'label' && style !== 'window') scaleBy(o, lerp(1, .8, smooth(-.006, 0, inside))); return; }
      const edge = smooth(0, t, inside), stitched = () => { if (inside > .0026 && inside < .0038 && Math.floor((Math.abs(dx) < Math.abs(dy) ? p : q) / .0034) % 3 !== 2) { mixTo(o, hasStitch ? stitch : [o.r * 1.35 + 18, o.g * 1.35 + 18, o.b * 1.35 + 18], .75); o.h += .00015; } };
      if (style === 'patch' || style === 'label') {
        // Sewn on: its own colour, raised by its thickness, stitched round.
        if (colour) mixTo(o, colour.map(v => v * (.94 + .1 * fbm(c.a * 500, c.b * 500, 2))), edge);
        o.h += (step.raise ?? .0009) * edge; if (style === 'patch') stitched();
      } else if (style === 'flap' || style === 'pocket') {
        if (colour) mixTo(o, colour, edge);
        o.h += (step.raise ?? .0012) * edge; stitched();
        // A flap over the top of a pocket: a lower edge that stands off the cloth beneath it.
        const flap = step.flap ?? (style === 'flap' ? .33 : 0);
        if (flap) { const line = h / 2 - h * flap - q; if (line > 0 && line < .003) { scaleBy(o, .6); o.h -= .0006; } else if (line <= 0) o.h += .0008; if (step.snap !== false && Math.hypot(p, q - (h / 2 - h * flap * .72)) < .0045) { mixTo(o, [150, 150, 146], 1); o.h += .0007; } }
        if (step.pleat && Math.abs(p) < .0012) { scaleBy(o, .72); o.h -= .0005; }
      } else if (style === 'welt') {
        // A slit with a bound lip.
        const lip = Math.abs(q) < h / 2 && Math.abs(p) < w / 2; if (lip) { scaleBy(o, Math.abs(q) < h * .18 ? .35 : .78); o.h += Math.abs(q) < h * .18 ? -.001 : .0006; }
      } else if (style === 'zip') {
        const tooth = Math.floor(p / .0024) % 2 === 0; if (Math.abs(q) < h * .22) { mixTo(o, (colour || [172, 172, 168]).map(v => v * (tooth ? 1 : .5)), 1); o.h += tooth ? .0008 : .0002; } else { mixTo(o, [24, 24, 26], .9); o.h += .0003; }
      } else if (style === 'window') { mixTo(o, colour || [200, 205, 205], edge * (step.opacity ?? .85)); o.h += .0004 * edge; if (inside < .003) { mixTo(o, [30, 30, 32], .9); o.h += .0012; } }
      else if (style === 'buckle') {
        // A frame of metal with a bar across it.
        const frameOn = inside < Math.min(w, h) * .2, bar = Math.abs(p) < Math.min(w, h) * .09;
        if (frameOn || bar) { mixTo(o, (colour || [168, 166, 158]).map(v => v * (.8 + .3 * smooth(0, .003, inside))), 1); o.h += .0016; }
      } else if (style === 'fill') mixTo(o, colour, edge * (step.opacity ?? 1));
      else if (style === 'hole') {
        // Worn through: the cloth gone in the middle, loose threads running across it.
        const ragged = inside - fbm(c.a * 160, c.b * 160, 3) * Math.min(w, h) * .35; if (ragged > 0) { const thread = Math.abs(repeat(q + fbm(p * 60, q * 300, 2) * .004, .0032)) < .0009; mixTo(o, thread ? [226, 222, 208] : colour || [38, 30, 28], thread ? .9 : .92); o.h += thread ? .0004 : -.0012; }
        else if (ragged > -.006) mixTo(o, [212, 208, 196], .5 * smooth(-.006, 0, ragged));
      } else throw new Error('no such rect: ' + style);
    };
  },
  dots(step, env) {
    const frame = frameOf(step.frame || 'front', env), r = step.r ?? .006, style = step.style || 'button', colour = rgb(step.colour || (style === 'button' ? '#1c1c1e' : '#a9a7a0')), mirror = step.mirror;
    let pts = step.pts ? step.pts.map(frame.point) : null;
    if (!pts) { const a = frame.point(step.from), b = frame.point(step.to), n = step.count; pts = Array.from({ length: n }, (_, i) => [lerp(a[0], b[0], n > 1 ? i / (n - 1) : .5), lerp(a[1], b[1], n > 1 ? i / (n - 1) : .5)]); }
    return (c, o) => {
      const at = frame.at(c); if (!at) return;
      const p = mirror && at[0] < 0 ? -at[0] : at[0];
      for (const [x, y] of pts) {
        const d = Math.hypot(p - x, at[1] - y); if (d > r + .002) continue;
        if (d > r) { scaleBy(o, .78); return; }
        const k = d / r;
        if (style === 'button') { mixTo(o, colour.map(v => v * (.8 + .3 * (1 - k))), 1); o.h += .0014 - (k < .55 ? .0004 : 0); if (k < .5 && (Math.hypot(Math.abs(p - x) - r * .2, Math.abs(at[1] - y) - r * .2) < r * .11)) { scaleBy(o, .4); o.h -= .0005; } }
        else if (style === 'eyelet') { if (k < .5) { scaleBy(o, .22); o.h -= .0008; } else { mixTo(o, colour, 1); o.h += .0009; } }
        else { mixTo(o, colour.map(v => v * (.72 + .5 * (1 - k) ** 2)), 1); o.h += .0018 * Math.sqrt(1 - k * k); }
        return;
      }
    };
  },
  print(step, env) {
    const frame = frameOf(step.frame || 'front', env), art = drawing(step.art), centre = frame.point(step.at), width = step.width, tall = width * art.h / art.w, opacity = step.opacity ?? 1, mirror = step.mirror, rot = step.rot || 0, crack = step.crack || 0, tint = step.tint ? rgb(step.tint) : null, raise = step.raise || 0, mask = where(step.where, env), reach = Math.hypot(width, tall) / 2;
    return (c, o) => {
      const at = frame.at(c); if (!at) return;
      let p = at[0], q = at[1];
      if (mirror && p < 0) p = -p;
      p -= centre[0]; q -= centre[1];
      if (Math.abs(p) > reach || Math.abs(q) > reach) return;
      // Seen from outside, the front of a left arm or leg is on the left: a drawing there is laid the other way to read true.
      if (frame.limb && c.left) p = -p;
      [p, q] = turned(p, q * frame.up, rot);
      const texel = sampleDrawing(art, p / width + .5, .5 - q / tall); if (!texel) return;
      let k = texel[3] * opacity * mask(c); if (!k) return;
      // An old screen print: the ink broken along fine cracks and thinned where it has been washed.
      if (crack) { const lines = Math.abs(fbm(c.a * 220, c.b * 220, 3) - .5) * 2, wash = fbm(c.a * 30, c.b * 30, 3); k *= lerp(1, smooth(0, .09, lines) * (.72 + .28 * wash), crack); }
      mixTo(o, tint ? tint : texel, k); o.h += raise * k;
    };
  },
  distress(step, env) {
    const mask = where(step.where, env), amount = step.amount ?? 1, colour = step.colour ? rgb(step.colour) : null, type = step.type, seed = step.seed || 0, frame = step.frame ? frameOf(step.frame, env) : null;
    return (c, o) => {
      const m = mask(c) * amount; if (!m) return;
      const a = c.a + c.shift + seed * 2.1, b = c.b + seed;
      switch (type) {
        case 'fade': {
          // Worn pale where a garment rubs, by a soft spot at `at` of `size`, or all over.
          let k = 1; if (step.at) { const at = frame.at(c); if (!at) return; const centre = frame.point(step.at), p = (step.mirror && at[0] < 0 ? -at[0] : at[0]) - centre[0], q = at[1] - centre[1]; k = Math.exp(-((p / step.size[0]) ** 2 + (q / step.size[1]) ** 2)); }
          k *= .7 + .6 * fbm(a * 40, b * 14, 3); mixTo(o, colour || [o.r * 1.6 + 40, o.g * 1.6 + 40, o.b * 1.6 + 44], clamp(m * k)); break;
        }
        case 'whisker': { const at = frame.at(c); if (!at) return; const centre = frame.point(step.at), p = (step.mirror && at[0] < 0 ? -at[0] : at[0]) - centre[0], q = at[1] - centre[1], fall = Math.exp(-((p / step.size[0]) ** 2 + (q / step.size[1]) ** 2)), ray = Math.abs(Math.sin((q + p * (step.slope ?? .5) + fbm(a * 20, b * 20, 2) * .02) * (step.freq || 230))); mixTo(o, colour || [o.r * 1.7 + 46, o.g * 1.7 + 46, o.b * 1.7 + 50], clamp(m * fall * smooth(.7, 1, ray))); break; }
        case 'grime': { const n = fbm(a * 9, b * 9, 4); mixTo(o, colour || [40, 34, 28], m * smooth(.5, .8, n) * .7); break; }
        case 'edges': { const d = Math.min(c.h - env.hem, env.top - c.h); const k = (1 - smooth(0, step.size || .03, c.h - env.hem)) * (.5 + fbm(a * 120, b * 40, 2)); mixTo(o, colour || [o.r * 1.5 + 30, o.g * 1.5 + 30, o.b * 1.5 + 30], clamp(m * k)); if (d < 0) return; break; }
        case 'crackle': { const lines = Math.abs(fbm(a * 150, b * 150, 3) - .5) * 2; if (lines < .05) { mixTo(o, colour || [o.r * .5, o.g * .5, o.b * .5], m); o.h -= .0004 * m; } break; }
        case 'wash': { const n = fbm(a * 4, b * 4, 4), fine = fbm(a * 70, b * 70, 2); mixTo(o, colour || [o.r * 1.4 + 26, o.g * 1.4 + 26, o.b * 1.4 + 26], clamp(m * (smooth(.35, .75, n) * .8 + (fine - .5) * .3))); break; }
        case 'holes': {
          // Small tears with white threads across them.
          const size = step.size || .05, s = scatter(a / size, b / size, 1, seed); if (s.id < 1 - (step.density ?? .3)) return;
          const r = Math.hypot(s.dx * (1.2 + s.id), s.dy * 2.6) - fbm(a * 200, b * 200, 2) * .12; if (r < .2) { const thread = Math.abs(repeat(b + fbm(a * 90, b * 400, 2) * .003, .003)) < .0008; mixTo(o, thread ? [224, 220, 206] : colour || [30, 26, 26], m * .95); o.h += thread ? .0003 : -.001; } else if (r < .3) mixTo(o, [205, 200, 188], m * .55);
          break;
        }
        case 'pill': { const s = scatter(a / .004, b / .004, 1, seed); if (s.id > .7 && s.d < .3) { scaleBy(o, lerp(1, 1.18, m)); o.h += .0003 * m; } break; }
        case 'shade': {
          // Darker toward the hem, under a collar, in the folds: a little of the light that a real garment loses.
          const k = (1 - smooth(env.hem, env.hem + (step.size || .25), c.h)) * .5 + (fbm(a * 8, b * 3, 3) - .5) * .5; scaleBy(o, 1 - clamp(k) * m * .35); break;
        }
        case 'folds': {
          // Long soft folds running down the cloth.
          const f = fbm(a * (step.freq || 16) + fbm(a * 3, b * 3, 2) * 2, b * 1.6, 3) - .5; o.h += f * (step.depth ?? .004) * m; scaleBy(o, 1 + f * .22 * m); break;
        }
        case 'crumple': {
          // Soft creases lying across the cloth, as at an ankle or the crook of an elbow.
          const f = fbm(a * (step.freq || 22) * .35 + fbm(a * 5, b * 5, 2) * 2, b * (step.freq || 22) * 2.2, 3) - .5; o.h += f * (step.depth ?? .0012) * 1.6 * m; scaleBy(o, 1 + f * .16 * m); break;
        }
        default: throw new Error('no such distress: ' + type);
      }
    };
  },
};

/** What the painter needs of a mesh nobody cut here (a shoe from the wardrobe), in the form a cut garment has. */
export function asPainted(coords, point, uv, triangles, floor) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of coords) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  let middle = 0; for (const p of coords) middle += Math.abs(p[0]); middle /= coords.length;
  return { rest: coords, corners: point, uv, triangles, zones: Array.from(point, () => 'shoe'), flat: Array.from(point, i => [coords[i][2], coords[i][1]]), extra: Array.from(point, () => [0, 0]), metres: Math.max(hi[1] - lo[1], hi[2] - lo[2]) * 2.2, limbs: { sleeve: 1, leg: 1 }, floor, mark: {}, shoe: { lo, hi, middle } };
}

export function paintGarment(piece, made, path, normalPath, { size = made.shoe ? Math.min(SIZE, 1024) : SIZE } = {}) {
  const { uv, triangles, corners, rest, zones, flat, extra, floor, mark } = made, n = size * size;
  const colour = new Float32Array(n * 3), heights = new Float32Array(n), alpha = new Float32Array(n).fill(1), covered = new Uint8Array(n);
  let hem = Infinity, top = -Infinity; for (const p of rest) { hem = Math.min(hem, p[1] - floor); top = Math.max(top, p[1] - floor); }
  const marks = { ...mark, hem, top };
  const env = {
    colour: piece.colour, texel: made.metres / size, limbs: made.limbs, hem, top, floor, marks,
    H(value) {
      if (typeof value === 'number') return value;
      // A landmark and any number of offsets: 'knee', 'hem+0.06', 'chest+0.02-0.05'.
      const [, name, more] = /^([a-z]+)((?:\s*[+-]\s*[\d.]+)*)$/.exec(String(value).trim()) || [];
      if (!(name in marks)) throw new Error(piece.id + ': no such height: ' + value);
      return marks[name] + (more.replace(/\s/g, '').match(/[+-][\d.]+/g) || []).reduce((sum, part) => sum + Number(part), 0);
    },
  };
  const steps = (piece.paint || [{ step: 'fabric' }]).map(step => { if (!STEPS[step.step]) throw new Error(piece.id + ': no such step: ' + step.step); return STEPS[step.step](step, env); });
  const base = rgb(piece.colour), c = {}, o = {}, shoe = made.shoe;
  const shifts = { front: 0, back: .37, sleeveL: .71, sleeveR: 1.13, legL: .19, legR: .53, collar: .9, hood: 1.4, lining: 1.9, shoe: 0 };
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = [triangles[t], triangles[t + 1], triangles[t + 2]], [a, b, d] = ids.map(j => [uv[j * 2] * size, (1 - uv[j * 2 + 1]) * size]);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - a[0], vy = d[1] - a[1], det = ux * vy - uy * vx; if (Math.abs(det) < 1e-9) continue;
    const P = ids.map(j => rest[corners[j]]), F = ids.map(j => flat[j]), E = ids.map(j => extra[j]), zone = zones[ids[0]].split(':')[0], limb = /^(sleeve|leg)/.test(zone), left = limb ? zone.endsWith('L') : null;
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    let N = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nl = Math.hypot(...N) || 1; N = N.map(v => v / nl);
    const x0 = clamp(Math.floor(Math.min(a[0], b[0], d[0])), 0, size - 1), x1 = clamp(Math.ceil(Math.max(a[0], b[0], d[0])), 0, size - 1), y0 = clamp(Math.floor(Math.min(a[1], b[1], d[1])), 0, size - 1), y1 = clamp(Math.ceil(Math.max(a[1], b[1], d[1])), 0, size - 1);
    for (let row = y0; row <= y1; row++) for (let col = x0; col <= x1; col++) {
      const dx = col + .5 - a[0], dy = row + .5 - a[1], s = (dx * vy - dy * vx) / det, w = (ux * dy - uy * dx) / det;
      if (s < -.02 || w < -.02 || s + w > 1.02) continue;
      const at = row * size + col, inside = s >= 0 && w >= 0 && s + w <= 1;
      if (covered[at] === 2 || (covered[at] === 1 && !inside)) continue;
      const r = 1 - s - w, get = (list, k) => list[0][k] * r + list[1][k] * s + list[2][k] * w;
      c.zone = zone; c.limb = limb; c.sleeve = limb && zone.startsWith('sleeve'); c.x = get(P, 0); c.h = get(P, 1) - floor; c.z = get(P, 2); c.a = get(F, 0); c.b = get(F, 1); c.shift = shifts[zone] ?? 0;
      if (limb) { c.s = get(E, 0); c.ang = get(E, 1); c.front = c.ang > 0; c.left = left; c.facing = Math.sin(c.ang); }
      else { const turn = get(E, 1); c.s = 0; c.ang = turn; c.facing = Math.cos(turn); c.front = zone === 'front' ? true : zone === 'back' ? false : c.facing > 0; c.left = c.x > 0; }
      c.nx = N[0]; c.ny = N[1]; c.nz = N[2]; c.no = c.x > 0 ? N[0] : -N[0];
      if (shoe) {
        // A shoe is measured from its own heel and its own middle; height is above the ground it stands on.
        c.h = c.h + floor - shoe.lo[1]; c.t = c.h / (shoe.hi[1] - shoe.lo[1]); c.left = c.x > 0; c.fz = c.z - shoe.lo[2]; c.ft = c.fz / (shoe.hi[2] - shoe.lo[2]); c.fx = Math.abs(c.x) - shoe.middle; c.front = c.ft > .5;
        c.a = c.no > .5 || c.no < -.5 ? c.fz : c.fx + c.fz * .3; c.b = c.h + (c.ny > .5 ? c.fz : 0);
      }
      o.r = base[0]; o.g = base[1]; o.b = base[2]; o.h = 0; o.alpha = 1;
      for (const step of steps) step(c, o);
      colour[at * 3] = o.r; colour[at * 3 + 1] = o.g; colour[at * 3 + 2] = o.b; heights[at] = o.h; alpha[at] = o.alpha; covered[at] = inside ? 2 : 1;
    }
  }
  // Carry each panel's edge outward a few pixels, so that neither filtering nor a smaller copy of the picture shows a seam.
  const mark_ = Uint8Array.from(covered, v => v ? 1 : 0);
  for (let pass = 1; pass <= 6; pass++) for (let i = size + 1; i < n - size - 1; i++) {
    if (mark_[i]) continue;
    const j = [i - 1, i + 1, i - size, i + size].find(j => mark_[j] && mark_[j] <= pass); if (j === undefined) continue;
    colour[i * 3] = colour[j * 3]; colour[i * 3 + 1] = colour[j * 3 + 1]; colour[i * 3 + 2] = colour[j * 3 + 2]; heights[i] = heights[j]; alpha[i] = alpha[j]; mark_[i] = pass + 1;
  }
  const clear = piece.sheer || piece.clear, pixels = Buffer.alloc(n * (clear ? 4 : 3)), normals = Buffer.alloc(n * 3), texel = env.texel, step_ = clear ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const filled = mark_[i];
    for (let k = 0; k < 3; k++) pixels[i * step_ + k] = filled ? clamp(Math.round(colour[i * 3 + k]), 0, 255) : base[k];
    if (clear) pixels[i * 4 + 3] = filled ? Math.round(clamp(alpha[i]) * 255) : 255;
    const x = i % size, y = (i - x) / size, l = x > 0 && mark_[i - 1] ? heights[i - 1] : heights[i], r = x < size - 1 && mark_[i + 1] ? heights[i + 1] : heights[i], u = y > 0 && mark_[i - size] ? heights[i - size] : heights[i], d = y < size - 1 && mark_[i + size] ? heights[i + size] : heights[i];
    // The slope of the surface, in the picture's own directions: red across, green up, blue out.
    let nx = -(r - l) / (2 * texel), ny = (d - u) / (2 * texel); const len = Math.hypot(nx, ny, 1);
    normals[i * 3] = Math.round((nx / len * .5 + .5) * 255); normals[i * 3 + 1] = Math.round((ny / len * .5 + .5) * 255); normals[i * 3 + 2] = Math.round((1 / len * .5 + .5) * 255);
  }
  mkdirSync(dirname(path), { recursive: true });
  run('magick', ['-size', size + 'x' + size, '-depth', '8', (clear ? 'rgba' : 'rgb') + ':-', '-quality', '90', '-define', 'webp:method=4', path], pixels);
  run('magick', ['-size', size + 'x' + size, '-depth', '8', 'rgb:-', '-quality', '88', '-define', 'webp:method=4', normalPath], normals);
}
