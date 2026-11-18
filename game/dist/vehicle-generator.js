import * as THREE from './vendor/three.module.min.js';

// Car exteriors, generated from a design.
//
// A design is a car's published size (length, width, height, wheelbase) and
// a few dozen styling numbers: where the windscreen stands, how the roof
// falls, what the grille and lamps look like. The body is lofted from rings
// along the car: each ring runs keel, wheel well, sill, door, belt line,
// glass, roof. Lamps, grille and plates are then wrapped onto the nose and
// tail, so their outlines are their own and not the body's facets.
//
// Everything is in metres, faces +Z, sits on y = 0 and is centred on its
// length. The result has the form of an imported exterior (vehicle-assets.js).

const FINISH = { paint: [.34, .22, 1], glass: [.06, .9, 1], gloss: [.1, .35, 1], trim: [.64, .09, 0], chrome: [.22, 1, 0], dark: [.9, 0, 0], plate: [.5, .1, 0],
  lens: [.07, .85, 1], reflector: [.2, .95, 1], redlens: [.14, .25, 1], silver: [.4, .7, 0],
  check: [.3, .1, 1], stripe: [.3, .2, 1], blue: [.15, .2, 1], red: [.15, .2, 1] };
const TONE = { paint: [1, 1, 1], glass: [.1, .135, .155], gloss: [.02, .022, .025], trim: [.04, .042, .046], chrome: [.66, .68, .7], dark: [.012, .012, .014], plate: [.8, .78, .6],
  silver: [.42, .44, .46], lens: [.05, .056, .064], reflector: [.5, .52, .55], redlens: [.2, .014, .012], head: [1, .76, .37], day: [.9, .93, 1], tail: [.46, .053, .03], amber: [1, .35, .03],
  cab: [1, .78, .42], check: [.02, .02, .022], stripe: [.018, .06, .165], blue: [.03, .14, .85], red: [.75, .04, .03] };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;

/** A polyline of [d, y, cut] with each corner cut back by `cut` metres and rounded. */
function rounded(points) {
  const out = [];
  points.forEach(([d, y, cut = 0], k) => {
    const a = points[k - 1], b = points[k + 1];
    if (!cut || !a || !b) { out.push([d, y]); return; }
    const la = Math.hypot(d - a[0], y - a[1]), lb = Math.hypot(b[0] - d, b[1] - y);
    const ca = Math.min(cut, la * .46) / la, cb = Math.min(cut, lb * .46) / lb;
    const p = [lerp(d, a[0], ca), lerp(y, a[1], ca)], q = [lerp(d, b[0], cb), lerp(y, b[1], cb)];
    for (let s = 0; s <= 4; s++) { const t = s / 4, u = 1 - t; out.push([u * u * p[0] + 2 * u * t * d + t * t * q[0], u * u * p[1] + 2 * u * t * y + t * t * q[1]]); }
  });
  return out;
}
function sample(path, d) {
  if (d <= path[0][0]) return path[0][1];
  for (let i = 1; i < path.length; i++) if (d <= path[i][0]) {
    const [d0, y0] = path[i - 1], [d1, y1] = path[i];
    return d1 === d0 ? y1 : lerp(y0, y1, (d - d0) / (d1 - d0));
  }
  return path.at(-1)[1];
}

// What each body style is, before a design says otherwise. Lengths along the
// car are metres back from the nose or forward from the tail; a K is a share
// of the car's height.
const COMMON = { nose: .54, noseLow: .3, faceRun: .08, cowlAft: .5, cowlK: .675, screen: .78, peak: .5, rearDrop: .06, tailRun: .06, rearBumper: .58, rearLow: .33, beltRise: .06,
  tumble: .74, noseW: .76, noseR: .46, tailW: .84, tailR: .3, bow: .07, sternBow: .04, doors: 4, flare: .014, tuck: .06, crown: .035,
  // How far the glass bows across the car: the windscreen forward at its foot, a saloon's rear window back.
  screenBow: .07, rearBow: .05 };
const STYLE = {
  sedan: { clear: .16, hoodK: .525, cowlK: .69, rearHeader: 1.02, deck: .46, deckK: .735 },
  coupe: { clear: .15, hoodK: .53, cowlK: .69, cowlAft: .6, rearHeader: 1.12, rearDrop: .1, deck: .4, deckK: .73, doors: 2, tumble: .7 },
  hatch: { clear: .16, hoodK: .52, cowlK: .68, cowlAft: .42, rearHeader: .44, rearDrop: .08, glassRun: .3 },
  wagon: { clear: .16, hoodK: .52, cowlK: .68, rearHeader: .34, rearDrop: .05, glassRun: .24, rails: true },
  suv: { clear: .21, nose: .64, noseLow: .36, hoodK: .6, cowlK: .7, cowlAft: .46, screen: .64, rearHeader: .3, rearDrop: .05, glassRun: .17, rearBumper: .68, rearLow: .4, tumble: .78, cladding: true, rails: true, flare: .022 },
  minivan: { clear: .18, nose: .56, noseLow: .3, hoodK: .5, cowlAft: .26, cowlK: .63, screen: .95, rearHeader: .26, rearDrop: .04, glassRun: .13, rearBumper: .62, rearLow: .36, tumble: .82 },
  pickup: { screenBow: .04, clear: .25, nose: .7, noseLow: .42, hoodK: .6, faceRun: .05, cowlAft: .5, cowlK: .68, screen: .5, bed: 1.75, rearBumper: .7, rearLow: .46, tumble: .8, noseW: .86, noseR: .3, tailW: .95, tailR: .12, bow: .04, sternBow: .01, flare: .03 },
  van: { clear: .2, nose: .62, noseLow: .34, hoodK: .5, faceRun: .06, cowlAft: .12, cowlK: .57, screen: .62, rearHeader: .07, rearDrop: .02, glassRun: .03, rearBumper: .6, rearLow: .4, tumble: .9, noseW: .84, noseR: .34, tailW: .95, tailR: .1, sternBow: .01, screenBow: .04 },
};
const TWO_BOX = new Set(['hatch', 'wagon', 'suv', 'minivan', 'van']);
export const GENERATED_SHAPES = Object.keys(STYLE);

/** Tyre radius for a car of this kind and size, when the design gives none. */
function tyre(shape, L, H) {
  if (shape === 'pickup') return clamp(.36 + (L - 5.3) * .04, .35, .42);
  if (shape === 'van') return clamp(.33 + (H - 1.9) * .03, .32, .37);
  if (shape === 'suv') return clamp(.345 + (L - 4.6) * .045 + (H - 1.68) * .05, .32, .41);
  if (shape === 'minivan') return .345;
  return clamp(.315 + (L - 4.6) * .03, .28, .345);
}

/** Where a design's wheels are: known from its size alone, before any geometry exists. */
export function designWheels(design) {
  const { L, W, WB, shape } = design, H = design.H;
  const radius = design.wheel ?? tyre(shape, L, H), FO = design.FO ?? frontOverhang(shape, L, WB);
  const front = L / 2 - FO;
  return { x: +(W / 2 - .13 * radius / .35 - .012).toFixed(4), front: +front.toFixed(4), rear: +(front - WB).toFixed(4), radius: +radius.toFixed(4) };
}
// The nose takes a little under half of what the wheelbase leaves, more on a front-driven car.
function frontOverhang(shape, L, WB) {
  const share = shape === 'pickup' ? .4 : shape === 'van' ? .42 : shape === 'coupe' ? .44 : .46;
  return (L - WB) * share;
}

/** Fill in every number the loft needs. */
export function resolveDesign(design) {
  const shape = STYLE[design.shape] ? design.shape : 'sedan';
  const d = { ...COMMON, ...STYLE[shape], ...design, shape };
  const { L, W, H } = d;
  d.FO ??= frontOverhang(shape, L, d.WB);
  d.wheel ??= tyre(shape, L, H);
  d.arch ??= d.wheel + (shape === 'suv' || shape === 'pickup' ? .075 : .055);
  d.hoodF ??= d.hoodK * H;
  d.cowl ??= d.FO + d.cowlAft;
  d.cowlY ??= d.cowlK * H;
  d.header ??= d.cowl + d.screen;
  d.beltF ??= d.cowlY - .035;
  d.beltR ??= d.beltF + d.beltRise;
  d.twoBox = TWO_BOX.has(shape);
  if (shape === 'pickup') {
    d.cabEnd ??= L - d.bed - .06;
    d.rearHeader ??= L - d.cabEnd + .1; d.rearDrop ??= .03;
    d.bedY ??= d.beltR + .06;
  } else if (d.twoBox) {
    d.tailY ??= d.beltR + .03;
  } else d.deckY ??= d.deckK * H;
  d.rearD = L - d.rearHeader;
  d.peakD = clamp(d.peak * L, d.header + .2, d.rearD - .15);
  return d;
}

/** The side view: roof line, underside, belt line. */
function profiles(d) {
  const { L, H } = d;
  const up = [[0, d.nose], [d.faceRun, d.hoodF, .06], [lerp(d.faceRun, d.cowl, .42), lerp(d.hoodF, d.cowlY, .64), .3], [d.cowl, d.cowlY, .05],
    [d.header, H - .04, .16], [d.peakD, H, .5], [d.rearD, H - d.rearDrop, d.shape === 'pickup' ? .06 : .14]];
  if (d.shape === 'pickup') up.push([d.cabEnd, d.bedY, .02], [L - .05, d.bedY - .01, .03], [L, d.rearBumper + .22]);
  else if (d.twoBox) up.push([Math.min(d.rearD + d.glassRun, L - d.tailRun - .02), d.tailY, .06], [L - d.tailRun, lerp(d.rearBumper, d.tailY, .3), .05], [L, d.rearBumper]);
  else up.push([L - d.deck, d.deckY, .1], [L - d.tailRun, d.deckY - .035, .05], [L, d.rearBumper]);
  const low = [[0, d.noseLow], [.1, d.clear + .04, .05], [.26, d.clear, .08], [L - .3, d.clear, .08], [L - .08, d.rearLow - .06, .04], [L, d.rearLow]];
  return { up: rounded(up), low: rounded(low) };
}

/**
 * The loft: a grid of points, `rings[i][j]`, and the stations they stand at.
 * A half ring has 15 points; the full ring mirrors it.
 */
const HALF = 15;
function loft(d) {
  const { L, W, H } = d, { up, low } = profiles(d);
  const hw = W / 2, axles = [d.FO, d.FO + d.WB], yc = d.wheel, Ra = d.arch;
  const top = x => sample(up, x), floor = x => sample(low, x);
  const beltLine = x => lerp(d.beltF, d.beltR, clamp((x - d.cowl) / (d.rearD - d.cowl)));
  const bedZone = x => d.shape === 'pickup' && x > d.cabEnd + .02;
  const belt = x => bedZone(x) ? Math.min(top(x) - .012, d.bedY) : Math.min(top(x) - d.crown * smooth(0, .12, Math.min(x, L - x)), beltLine(x));
  const width = x => {
    const front = x < d.noseR ? lerp(d.noseW, 1, Math.sqrt(1 - (1 - x / d.noseR) ** 2)) : 1, back = L - x < d.tailR ? lerp(d.tailW, 1, Math.sqrt(1 - (1 - (L - x) / d.tailR) ** 2)) : 1;
    return hw * front * back * (1 - .018 * ((x - L * .48) / (L / 2)) ** 2);
  };
  const roofWidth = x => hw * d.tumble * (1 - .05 * smooth(d.peakD, L, x) - .03 * smooth(d.peakD, d.cowl, x));
  const archAt = x => { let y = 0; for (const a of axles) { const dz = Math.abs(x - a); if (dz <= Ra + 1e-6) y = Math.max(y, yc + Math.sqrt(Math.max(0, Ra * Ra - dz * dz))); } return y; };
  const flareAt = (x, y) => { let f = 0; for (const a of axles) { const gap = Math.hypot(x - a, y - yc) - Ra; f = Math.max(f, Math.exp(-((gap / .07) ** 2))); } return d.flare * f; };

  // Stations: every corner of the profile, each wheel arch, each door, and no long gap between.
  const hard = [], soft = [];
  for (const a of axles) {
    hard.push(a - Ra - .008, a + Ra + .008);
    for (const deg of [0, 22, 44, 63, 78, 90, 102, 117, 136, 158, 180]) hard.push(a - Ra * Math.cos(deg * RAD) * .9999);
  }
  const doorA = Math.min(d.FO + Ra + .12, d.cowl + .1), doorC = d.FO + d.WB - Ra - .03;
  const doorB = d.doors === 2 ? null : lerp(doorA, doorC, .53) + .02;
  const cuts = d.doors === 2 ? [doorA, Math.min(doorA + 1.25, doorC)] : [doorA, doorB, doorC];
  if (d.shape === 'pickup' && d.doors === 4) cuts[2] = Math.min(doorC, d.cabEnd - .1), cuts[1] = lerp(cuts[0], cuts[2], .53);
  for (const c of cuts) hard.push(c - .006, c + .006);
  const pillarB = d.doors === 2 ? [cuts[1] - .02, cuts[1] + .06] : [cuts[1] - .05, cuts[1] + .05];
  const glass = { screen: [d.cowl + .03, d.header - .03], dlo: [d.cowl + .02, d.cargo ? cuts.at(-1) - .04 : d.twoBox ? d.rearD - .06 : d.shape === 'pickup' ? d.cabEnd - .2 : d.rearD + (L - d.deck - d.rearD) * .42] };
  // Where the rear window meets the body, and how high that is.
  const foot = d.shape === 'pickup' ? d.cabEnd : d.twoBox ? Math.min(d.rearD + d.glassRun, L - d.tailRun - .02) : L - d.deck, footY = d.shape === 'pickup' ? d.bedY : d.twoBox ? d.tailY : d.deckY;
  glass.rear = d.shape === 'pickup' ? [d.rearD + .02, d.cabEnd - .01] : d.twoBox ? [d.rearD + .04, foot - .02] : [d.rearD + .05, foot - .04];
  // An upright tail has no length to give a window: there it is wrapped on, like the lamps (rearFace).
  const upright = d.twoBox && glass.rear[1] - glass.rear[0] < .08;
  if (upright) glass.rear = [9, 9];
  const pillars = [pillarB];
  if (d.doors === 4 && d.twoBox && !d.cargo) pillars.push([cuts[2] - .01, cuts[2] + .08]);
  if (d.doors === 4 && !d.twoBox && d.shape !== 'pickup') pillars.push([cuts[2] - .1, cuts[2] - .04]);
  hard.push(...glass.screen, ...glass.dlo, ...glass.rear.filter(x => x < L), ...pillars.flat(), d.cowl - .03, foot - .03, foot + .03);
  if (d.shape === 'pickup') hard.push(d.cabEnd + .02, d.cabEnd + .1, L - .09, L - .05);
  if (d.sunroof) hard.push(d.header + .12, d.header + .12 + d.sunroof);
  for (const [x] of up) soft.push(x);
  for (const [x] of low) soft.push(x);
  for (let x = 0; x <= L; x += .15) soft.push(x);
  soft.push(0, L, .03, .16, .3, L - .03, L - .14);
  const stations = hard.filter(x => x > .001 && x < L - .001).sort((a, b) => a - b).filter((x, i, all) => !i || x - all[i - 1] > .0015);
  for (const x of soft.sort((a, b) => a - b)) if (x >= 0 && x <= L && stations.every(s => Math.abs(s - x) > .045)) stations.push(x);
  stations.sort((a, b) => a - b);

  // How far out the flank stands at each height, `x` metres from the nose: widest at the shoulder, tucked under at the sill.
  const flank = x => {
    const w = width(x), y0 = floor(x), yBelt = Math.max(belt(x), y0 + .06), line = Math.max(beltLine(x), yBelt), shoulder = y0 + .6 * (line - y0);
    const flared = Math.min(Math.max(y0, archAt(x)), yBelt - .07) > y0 + .01 || archAt(x + .08) || archAt(x - .08) ? 1 : .6;
    return y => (y < shoulder ? w * (1 - d.tuck * ((shoulder - y) / (shoulder - y0)) ** 2) : w * (1 - .035 * ((y - shoulder) / Math.max(.05, line - shoulder)) ** 2)) + flareAt(x, y) * flared;
  };
  const rings = stations.map(x => {
    const w = width(x), y0 = floor(x), yTop = top(x), yBelt = Math.max(belt(x), y0 + .06);
    const yLow = Math.min(Math.max(y0, archAt(x)), yBelt - .07), span = yBelt - yLow, cabin = yTop - yBelt, side = flank(x);
    const ys = [yLow, yLow + Math.min(.05, span * .1), yLow + Math.min(.15, span * .25), yLow + span * .46, yLow + span * .72, yBelt - Math.min(.035, span * .08), yBelt];
    const half = [[0, y0], [w * .52, y0], [w * .52, yLow], [side(ys[0]) - .012, ys[0]]];
    for (let k = 1; k < 7; k++) half.push([side(ys[k]), ys[k]]);
    const xb = half.at(-1)[0];
    if (bedZone(x)) {
      // An open bed: the rail, then down the inside to the floor. The tailgate closes it.
      const closed = x > L - .07, floorY = closed ? yBelt : Math.min(yBelt - .02, d.bedFloor ?? d.clear + .62);
      half.push([xb - .02, yBelt + .012], [xb - .075, yBelt + .012], [xb - .09, floorY], [xb * .45, floorY], [0, floorY]);
    } else {
      // The cabin stands on the body from the windscreen's foot to the rear window's. Its pillars lean
      // in from the belt to the roof, so each window is widest at its foot.
      const g = smooth(d.cowl - .03, d.cowl + .03, x) * (1 - smooth(foot - .03, foot + .03, x));
      const rise = clamp(x < d.peakD ? (yTop - d.cowlY) / Math.max(.1, H - .04 - d.cowlY) : (yTop - footY) / Math.max(.1, H - d.rearDrop - footY));
      const n = lerp(xb * .98, roofWidth(x), rise ** .7), fit = Math.min(1, cabin / .22), rail = Math.min(.105, cabin * .3);
      const hood = [[w * .9, yBelt + cabin * .5], [w * .76, yBelt + cabin * .84], [w * .52, yTop - cabin * .05], [w * .26, yTop], [0, yTop]];
      const roof = [[lerp(xb, n, .86), yTop - rail], [n * .985, yTop - .046 * fit], [n * .87, yTop - .014 * fit], [n * .45, yTop - .003 * fit], [0, yTop]];
      for (let k = 0; k < 5; k++) half.push([lerp(hood[k][0], roof[k][0], g), lerp(hood[k][1], roof[k][1], g)]);
    }
    const bow = d.bow * (1 - smooth(0, .5, x)) - d.sternBow * (1 - smooth(0, .4, L - x));
    // Glass is curved across the car. Everything above the belt bows with it, the hood ahead of the
    // windscreen and the deck behind the rear window included, so the panels stay in one sheet.
    const sweep = bedZone(x) ? 0 : d.screenBow * smooth(d.cowl - .5, d.cowl, x) * (1 - smooth(d.cowl, d.header + .15, x))
      - (d.twoBox || d.shape === 'pickup' ? 0 : d.rearBow * smooth(d.rearD - .15, foot, x) * (1 - smooth(foot, foot + .3, x)));
    const edge = half[11][0] || 1;
    const z = L / 2 - x, point = ([px, py], s, j) => [s * px, py, z - bow * (px / hw) ** 2 + (j > 10 ? sweep * Math.max(0, 1 - (px / edge) ** 2) : 0)];
    return [...half.map((p, j) => point(p, 1, j)), ...half.slice(1, -1).map((p, j) => point(p, -1, j + 1)).reverse()];
  });
  return { stations, rings, glass, pillars, cuts, top, belt, beltLine, width, roofWidth, floor, axles, upright, sideAt: (x, y) => flank(x)(y) };
}

/** Which surface the panel between ring points `j` and `j + 1` is, at `x` metres from the nose. */
function panel(d, shell, x, j) {
  const { glass, pillars, cuts } = shell, within = ([a, b]) => x > a && x < b;
  const arch = shell.axles.some(a => Math.abs(x - a) < d.arch), cut = cuts.some(c => Math.abs(x - c) < .006);
  const bed = d.shape === 'pickup' && x > d.cabEnd + .02;
  if (j === 0) return 'trim';
  if (j === 1 || j === 2) return arch ? 'dark' : 'trim';
  if (j === 3) return d.cladding ? 'trim' : 'paint';
  if (j === 4) return d.cladding || (arch && d.archTrim) ? 'trim' : cut ? 'dark' : 'paint';
  if (j < 9) return cut && (j < 8 || !bed) ? 'dark' : j === 8 && within(glass.dlo) && !bed ? 'gloss' : 'paint';
  if (bed) return j >= 11 ? 'trim' : j === 9 ? 'gloss' : 'paint';
  if (j === 9) return within(glass.dlo) ? pillars.some(within) ? 'gloss' : 'glass' : 'paint';
  if (j === 10) return d.blackRoof && x > d.cowl ? 'gloss' : 'paint';
  if (j === 11) return within(glass.rear) && d.twoBox ? 'gloss' : d.blackRoof && x > d.header ? 'gloss' : 'paint';
  if (within(glass.screen) || within(glass.rear)) return 'glass';
  if (d.sunroof && x > d.header + .12 && x < d.header + .12 + d.sunroof) return 'glass';
  return d.blackRoof && x > d.header ? 'gloss' : 'paint';
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** A list of triangles that welds itself into an indexed geometry. */
function mesh(fields) {
  const data = Object.fromEntries(fields.map(f => [f, []])), index = [], seen = new Map(), looks = new Map();
  const sizes = { position: 3, normal: 3, color: 3, aFinish: 3, aPaintWeight: 1 };
  let count = 0;
  return {
    data, index,
    vertex(p, n, tone, surface, weight) {
      // Two corners are one vertex when they agree to half a millimetre, in direction and in finish.
      const where = ((Math.round((p[0] + 8) * 2000) * 32768) + Math.round((p[1] + 8) * 2000)) * 32768 + Math.round((p[2] + 8) * 2000);
      let look = looks.get(tone); if (look === undefined) looks.set(tone, look = looks.size);
      const facing = ((Math.round((n[0] + 1) * 255) * 512 + Math.round((n[1] + 1) * 255)) * 512 + Math.round((n[2] + 1) * 255)) * 64 + look;
      let here = seen.get(where);
      if (!here) seen.set(where, here = []);
      for (let i = 0; i < here.length; i += 2) if (here[i] === facing) { index.push(here[i + 1]); return; }
      here.push(facing, count); index.push(count++);
      data.position.push(p[0], p[1], p[2]); data.normal.push(n[0], n[1], n[2]); data.color.push(tone[0], tone[1], tone[2]);
      if (data.aFinish) { data.aFinish.push(surface[0], surface[1], surface[2]); data.aPaintWeight.push(weight); }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      for (const f of fields) g.setAttribute(f, new THREE.Float32BufferAttribute(data[f], sizes[f]));
      g.setIndex(index); g.computeBoundingSphere();
      return g;
    },
  };
}

// One byte per generated triangle preserves the door seams and hood perimeter
// through welding. Imported bodies use their surface metadata and geometry.
export const EXTERIOR_PARTS = ['body','hood','left','right','leftGlass','rightGlass','windshield','rearGlass','leftQuarterGlass','rightQuarterGlass','roofGlass'];

/** Skin the loft: smooth where panels meet gently, creased where they do not. */
function skin(d, shell, body) {
  const { rings, stations } = shell, count = rings[0].length, last = rings.length - 1;
  const at = (i, j) => rings[i][(j + count) % count];
  const faces = rings.slice(0, -1).map((_, i) => rings[0].map((__, j) => {
    const n = cross(sub(at(i + 1, j + 1), at(i, j)), sub(at(i, j + 1), at(i + 1, j)));
    const area = Math.hypot(...n);
    return { n: area > 1e-9 ? n.map(v => v / area) : null, area };
  }));
  const triangles = [];
  for (let i = 0; i < last; i++) {
    const x = (stations[i] + stations[i + 1]) / 2;
    for (let j = 0; j < count; j++) {
      const face = faces[i][j];
      if (!face.n) continue;
      const section = j < HALF - 1 ? j : count - 1 - j;
      const kind = panel(d, shell, x, section), tone = TONE[kind], surface = FINISH[kind], weight = kind === 'paint' ? 1 : 0;
      const corner = (ci, cj) => {
        // Average the faces around this corner that lie within a crease angle of this one.
        const sum = [0, 0, 0];
        for (const fi of [ci - 1, ci]) for (const fj of [cj - 1, cj]) {
          if (fi < 0 || fi >= last) continue;
          const other = faces[fi][(fj + count) % count];
          if (other.n && dot(other.n, face.n) > .72) for (let c = 0; c < 3; c++) sum[c] += other.n[c] * other.area;
        }
        return unit(sum);
      };
      const quad = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => ({ p: at(a, b), n: corner(a, b) }));
      const side = quad[0].p[0] > 0 ? 'left' : 'right';
      const door = x >= shell.cuts[0] && x <= shell.cuts[1] && section >= 5 && section <= 10;
      let part = 'body';
      if (kind === 'glass') {
        if (section === 9) part = side + (door ? 'Glass' : 'QuarterGlass');
        else part = x <= d.header ? 'windshield' : x >= d.rearD ? 'rearGlass' : 'roofGlass';
      } else if (door) part = side;
      else if (x > d.faceRun && x < d.cowl-.03 && section >= 10) part = 'hood';
      body.panels.push(EXTERIOR_PARTS.indexOf(part), EXTERIOR_PARTS.indexOf(part));
      for (const k of [0, 1, 2, 0, 2, 3]) body.vertex(quad[k].p, quad[k].n, tone, surface, weight);
      triangles.push([quad[0].p, quad[1].p, quad[2].p, face.n], [quad[0].p, quad[2].p, quad[3].p, face.n]);
    }
  }
  // Close the nose and the tail.
  for (const [i, facing] of [[0, 1], [last, -1]]) {
    const ring = rings[i], centre = [0, (ring[0][1] + ring[HALF - 1][1]) / 2, ring[0][2] + facing * .012];
    for (let j = 0; j < count; j++) {
      const a = at(i, j), b = at(i, j + 1), tri = facing > 0 ? [centre, a, b] : [centre, b, a];
      const n = unit(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
      if (!Number.isFinite(n[0]) || Math.hypot(...sub(a, b)) < 1e-6) continue;
      for (const p of tri) body.vertex(p, n, TONE.paint, FINISH.paint, 1);
      triangles.push([...tri, n]);
    }
  }
  return triangles;
}

/**
 * Wraps shapes onto one end of the car. A shape is drawn on a cylinder that
 * stands inside the body: an angle round it (0 is dead ahead, 90 is the
 * flank) and a height. Each point is thrown outward onto the skin.
 */
function wrapper(d, triangles, end, body, lamps) {
  const L = d.L, sign = end === 'front' ? 1 : -1, zAxis = sign * (L / 2 - d.W / 2);
  // The skin near this end, sorted into wedges round the axis so a throw tests only what it could hit.
  const WEDGE = 5, wedges = Array.from({ length: Math.ceil(240 / WEDGE) }, () => []), flat = [];
  for (const [a, b, c, n] of triangles) {
    const bearing = v => Math.atan2(v[0], sign * (v[2] - zAxis)) / RAD, turns = [bearing(a), bearing(b), bearing(c)];
    const from = Math.min(...turns), to = Math.max(...turns);
    if (to - from > 180 || to < -118 || from > 118) continue;
    const id = flat.length / 14;
    flat.push(a[0], a[1], a[2], b[0] - a[0], b[1] - a[1], b[2] - a[2], c[0] - a[0], c[1] - a[1], c[2] - a[2], n[0], n[1], n[2], Math.min(a[1], b[1], c[1]) - 1e-4, Math.max(a[1], b[1], c[1]) + 1e-4);
    for (let w = Math.max(0, Math.floor((from + 119) / WEDGE)); w <= Math.min(wedges.length - 1, Math.floor((to + 121) / WEDGE)); w++) wedges[w].push(id);
  }
  const T = new Float64Array(flat);
  /** Where a level throw from the axis at height `y` last leaves the shell: the outer skin. */
  const cast = (deg, y) => {
    const a = deg * RAD, dx = Math.sin(a), dz = sign * Math.cos(a), list = wedges[Math.floor((deg + 120) / WEDGE)];
    if (!list) return null;
    let best = 0, hit = -1;
    for (const id of list) {
      const o = id * 14;
      if (y < T[o + 12] || y > T[o + 13]) continue;
      const e1x = T[o + 3], e1y = T[o + 4], e1z = T[o + 5], e2x = T[o + 6], e2y = T[o + 7], e2z = T[o + 8];
      // Möller–Trumbore with a level ray: its direction has no y.
      const hx = -dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y, det = e1x * hx + e1y * hy + e1z * hz;
      if (det > -1e-10 && det < 1e-10) continue;
      const sx = -T[o], sy = y - T[o + 1], sz = zAxis - T[o + 2], u = (sx * hx + sy * hy + sz * hz) / det;
      if (u < -1e-4 || u > 1.0001) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dz * qz) / det;
      if (v < -1e-4 || u + v > 1.0001) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (t > best) { best = t; hit = o; }
    }
    return hit < 0 ? null : { t: best, p: [dx * best, y, zAxis + dz * best], n: [T[hit + 9], T[hit + 10], T[hit + 11]] };
  };
  const reach = new Map();
  // How far out the skin is at bumper height: a point that lands well short of it has flown over the hood.
  const limit = deg => { const k = Math.round(Math.abs(deg) / 3); if (!reach.has(k)) reach.set(k, cast(k * 3, (end === 'front' ? d.nose : d.rearBumper) - .04)?.t ?? 1); return reach.get(k) - (d.wrapDepth ?? .42); };
  /**
   * @param {object} s  a0..a1 degrees and y0..y1 metres at the inner end. `rise` lifts the outer end,
   *   `grow` scales its height, `round` rounds the ends (0..1), `wide` is the width at the bottom
   *   and at the top as shares of the whole, `lean` shifts the top edge outward in degrees.
   */
  return function wrap(s) {
    const { a0, a1, y0, y1, kind = 'trim', off = .006, rise = 0, grow = 1, round = 0, lean = 0, both = true, wide = null } = s;
    const cols = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (s.step ?? 4.5))), rows = s.rows ?? Math.max(wide || lean ? 2 : 1, Math.min(4, Math.ceil(Math.abs(y1 - y0) / .09)));
    const target = FINISH[kind] ? body : lamps, color = TONE[kind], surface = FINISH[kind], centre = (a0 + a1) / 2;
    for (const mirror of both && (a0 !== -a1) ? [1, -1] : [1]) {
      const grid = [], us = Array.from({ length: cols + 1 }, (_, c) => c / cols);
      // A rounded end needs columns of its own, however narrow the shape.
      if (round) for (const k of [.12, .4, 1]) { const e = round / 2 * k; if (us.every(u => Math.abs(u - e) > .03)) us.push(e, 1 - e); }
      us.sort((a, b) => a - b);
      for (const u of us) {
        const mid = (y0 + y1) / 2 + rise * u;
        // Rounded ends: the outline closes in like the end of a pill.
        const e = round ? Math.min(u, 1 - u) * 2 / round : 1, r = e < 1 ? Math.sqrt(1 - (1 - e) ** 2) : 1;
        const halfHeight = (y1 - y0) / 2 * lerp(1, grow, u) * Math.max(r, .04);
        const column = [];
        for (let r2 = 0; r2 <= rows; r2++) {
          const v = r2 / rows, y = mid + halfHeight * (v * 2 - 1);
          const deg = (centre + (lerp(a0, a1, u) - centre) * (wide ? lerp(wide[0], wide[1], v) : 1) + lean * (v - .5)) * mirror;
          const hit = cast(deg, y), a = deg * RAD;
          // Stand off along the throw, so a shape that crosses a crease stays in one sheet.
          column.push(hit && hit.t > limit(deg) ? { p: [hit.p[0] + Math.sin(a) * off, y, hit.p[2] + sign * Math.cos(a) * off], n: hit.n } : null);
        }
        grid.push(column);
      }
      for (let c = 0; c < us.length - 1; c++) for (let r2 = 0; r2 < rows; r2++) {
        const q = [grid[c][r2], grid[c + 1][r2], grid[c + 1][r2 + 1], grid[c][r2 + 1]];
        if (q.some(v => !v)) continue;
        for (const k of mirror * sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) target === body ? body.vertex(q[k].p, q[k].n, color, surface, kind === 'paint' ? 1 : 0) : lamps.vertex(q[k].p, q[k].n, color);
      }
    }
  };
}

/** A box, or a low ball, of one finish: mirrors, handles, rails, a roof light. */
function solid(target, geometry, kind, matrix) {
  const g = geometry.toNonIndexed().applyMatrix4(matrix), p = g.attributes.position.array, n = g.attributes.normal.array;
  // A finish makes it part of the body; without one it is lit, and goes with the lamps.
  for (let i = 0; i < p.length; i += 3) target.vertex([p[i], p[i + 1], p[i + 2]], [n[i], n[i + 1], n[i + 2]], TONE[kind], FINISH[kind], kind === 'paint' ? 1 : 0);
  g.dispose(); geometry.dispose();
}
const place = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// The nose. Shapes stack outward from the skin: a frame, what fills it, and
// what stands on that. Heights `at(v)` run from the chin (0) to just under the
// hood's leading edge (1); angles are degrees round the nose.
function frontFace(d, wrap) {
  const f = { lamp: 'slim', grille: 'trap', ...d.face }, chin = d.clear + .03, crest = d.hoodF - .065, at = v => lerp(chin, crest, v);
  const tall = crest - chin, big = clamp(tall / .62, .85, 1.6);
  const inner = f.lampIn ?? 24, outer = f.lampOut ?? 63, top = crest - (f.lampDrop ?? .0);
  const layer = (s, kind, off, pad = 0, more = {}) => wrap({ ...s, ...more, y0: s.y0 - pad, y1: s.y1 + pad, a0: s.a0 - pad * 60, a1: s.a1 + pad * 60, kind, off });
  // A lamp unit: a lens, and inside it the lit parts as shares of the lens [u0, u1, v0, v1].
  const unit = (s, lens, parts) => {
    layer(s, lens, .005);
    for (const [kind, u0, u1, v0, v1] of parts) {
      const h = s.y1 - s.y0, g = s.grow ?? 1, scale = u => lerp(1, g, u), mid = u => (s.y0 + s.y1) / 2 + (s.rise ?? 0) * u;
      const ya = mid(u0) + h * scale(u0) * (v0 - .5), yb = mid(u0) + h * scale(u0) * (v1 - .5), span = u1 - u0;
      wrap({ a0: lerp(s.a0, s.a1, u0), a1: lerp(s.a0, s.a1, u1), y0: ya, y1: yb, rise: (s.rise ?? 0) * span + (mid(u1) + h * scale(u1) * ((v0 + v1) / 2 - .5) - (mid(u0) + h * scale(u0) * ((v0 + v1) / 2 - .5)) - (s.rise ?? 0) * span),
        grow: scale(u1) / scale(u0), round: kind === 'head' ? .5 : .2, kind, off: .011, lean: s.lean, rows: 1 });
    }
  };
  const h = (f.lampH ?? { slim: .085, wedge: .15, block: .17, split: .04, stack: .3 }[f.lamp] ?? .1) * big;
  switch (f.lamp) {
    case 'round': {
      const r = (f.lampR ?? .085) * big, a = f.lampAt ?? 34, y = at(f.lampY ?? .8), turn = r / (d.W / 2) / RAD;
      for (const [kind, k, off] of [[f.chrome === false ? 'gloss' : 'chrome', 1.2, .005], ['reflector', 1, .009], ['head', .62, .013]]) wrap({ a0: a - turn * k, a1: a + turn * k, y0: y - r * k, y1: y + r * k, round: 1, kind, off, step: 2.2, rows: 4 });
      if (f.lampTurn !== false) wrap({ a0: a + turn * 1.5, a1: a + turn * 2.2, y0: y - r * .5, y1: y - r * .1, round: 1, kind: 'amber', off: .009, step: 2, rows: 2 });
      break;
    }
    case 'split':
      // A thin running light under the hood, and the main lamp set lower in the bumper.
      unit({ a0: inner, a1: outer, y0: top - h, y1: top, rise: .03, round: .3 }, 'lens', [['day', .04, .9, .25, .75]]);
      unit({ a0: inner + 12, a1: inner + 27, y0: at(.5), y1: at(.5) + .14 * big, round: .35 }, 'lens', [['head', .2, .8, .2, .8]]);
      break;
    case 'stack':
      unit({ a0: outer - 17, a1: outer - 7, y0: top - h, y1: top, round: .2, rows: 4 }, 'lens', [['day', .25, .75, .55, .95], ['head', .2, .8, .1, .5]]);
      break;
    case 'block':
      unit({ a0: inner, a1: outer, y0: top - h, y1: top, round: f.lampRound ?? .1, rise: f.lampRise ?? 0 }, 'reflector', [['head', .08, .6, .14, .86], ['amber', .68, .95, .14, .86]]);
      break;
    case 'wedge':
      // Swept back: low by the grille, tall at the corner.
      unit({ a0: inner, a1: outer, y0: top - h * .55, y1: top, grow: 1.8, rise: f.lampRise ?? .04, round: .3 }, 'reflector', [['head', .12, .55, .15, .85], ['amber', .66, .9, .2, .7]]);
      break;
    default:
      unit({ a0: inner, a1: outer, y0: top - h, y1: top, rise: f.lampRise ?? .028, grow: f.lampGrow ?? .85, round: .3 }, 'lens', [['head', .1, .5, .12, .62], ['day', .06, .94, .72, .92]]);
  }
  // The grille.
  const low = f.grilleLow ?? .6, high = f.grilleTop ?? .98, g0 = at(low), g1 = at(high), half = f.grilleHalf ?? inner - 3.5;
  const frame = f.chrome === false ? 'gloss' : 'chrome', border = f.frame ?? .014;
  const opening = s => { if (border) layer(s, frame, .004, border); wrap({ ...s, kind: f.grilleKind ?? 'gloss', off: .008 }); };
  const bars = (n, y0, y1, a, wide) => { for (let k = 1; k <= n; k++) { const t = k / (n + 1), y = lerp(y0, y1, t), w = wide ? lerp(wide[0], wide[1], t) : 1; wrap({ a0: -a * w + .6, a1: a * w - .6, y0: y - .006, y1: y + .006, kind: f.barKind ?? (f.chrome === false ? 'trim' : 'chrome'), off: .012, rows: 1 }); } };
  switch (f.grille) {
    case 'none': break;
    case 'bar':
      // A band between the lamps, the same height as they are.
      opening({ a0: -half - 3, a1: half + 3, y0: top - h * 1.05, y1: top, wide: [.92, 1] });
      if (f.wing !== false) wrap({ a0: -half - 2, a1: half + 2, y0: top - h * .36, y1: top - h * .08, kind: frame, off: .012, rows: 1 });
      break;
    case 'hex': {
      // A single frame from the hood to the bumper, widest part way down.
      const mid = lerp(g0, g1, f.hexMid ?? .5), w = f.hexWide ?? [.66, 1, .84];
      opening({ a0: -half, a1: half, y0: g0, y1: mid, wide: [w[0], w[1]], rows: 2 }); opening({ a0: -half, a1: half, y0: mid, y1: g1, wide: [w[1], w[2]], rows: 2 });
      wrap({ a0: -half * w[1], a1: half * w[1], y0: mid - .016, y1: mid + .016, kind: f.grilleKind ?? 'gloss', off: .009, rows: 1 });
      bars(f.bars ?? 4, g0, g1, half * w[0]);
      break;
    }
    case 'spindle': {
      // An hourglass: pinched under the hood, flared to the bumper.
      const pinch = lerp(g0, g1, .64);
      opening({ a0: -half, a1: half, y0: g0, y1: pinch, wide: [1.3, .5], rows: 3 }); opening({ a0: -half, a1: half, y0: pinch, y1: g1, wide: [.5, .9], rows: 2 });
      wrap({ a0: -half * .5, a1: half * .5, y0: pinch - .016, y1: pinch + .016, kind: 'gloss', off: .009, rows: 1 });
      break;
    }
    case 'kidney': for (const side of [-1, 1]) {
      const a = [f.kidneyGap ?? 1.2, half].map(v => v * side).sort((p, q) => p - q), s = { a0: a[0], a1: a[1], y0: g0, y1: g1, round: f.kidneyRound ?? .45, both: false, step: 2.2, rows: 3 };
      layer(s, frame, .004, .012); wrap({ ...s, kind: 'gloss', off: .008 });
    } break;
    case 'slots': {
      // Upright slots across the nose.
      const n = f.slots ?? 7, pitch = half * 2 / n;
      for (let k = 0; k < n; k++) { const a = -half + pitch * (k + .5); wrap({ a0: a - pitch * .31, a1: a + pitch * .31, y0: g0, y1: g1, round: .25, kind: 'gloss', off: .008, both: false, step: 1.6, rows: 2 }); }
      break;
    }
    case 'split': {
      // Two openings with a body-coloured bar between them.
      const mid = lerp(g0, g1, f.splitAt ?? .6);
      opening({ a0: -half, a1: half, y0: mid + .028, y1: g1 }); opening({ a0: -half, a1: half, y0: g0, y1: mid - .028, wide: [.86, 1] });
      break;
    }
    case 'mouth':
      // A slot under the hood and a wide opening through the bumper.
      opening({ a0: -half - 3, a1: half + 3, y0: top - h * .8, y1: top - h * .15 });
      opening({ a0: -(f.mouthHalf ?? 36), a1: f.mouthHalf ?? 36, y0: at(f.mouthLow ?? .1), y1: at(f.mouthTop ?? .62), wide: [1, .56], rows: 3 });
      bars(f.bars ?? 4, at(f.mouthLow ?? .1), at(f.mouthTop ?? .62), f.mouthHalf ?? 36, [1, .56]);
      break;
    default:
      opening({ a0: -half, a1: half, y0: g0, y1: g1, wide: f.grilleWide ?? [.72, 1], rows: 3 });
      bars(f.bars ?? 3, g0, g1, half, f.grilleWide ?? [.72, 1]);
  }
  const ey = f.emblemY != null ? at(f.emblemY) : f.grille === 'none' ? crest - .02 : f.grille === 'bar' || f.grille === 'mouth' ? top - h * .45 : f.grille === 'kidney' ? g1 + .05 : lerp(g0, g1, .66), er = (f.emblemR ?? .036) * big;
  if (f.emblem !== false) wrap({ a0: -er * 66, a1: er * 66, y0: ey - er, y1: ey + er, round: 1, kind: 'chrome', off: .016, step: 1.2, rows: 3 });
  // The lower intake, fog lamps and the plate.
  const i0 = at(f.intakeLow ?? .08), i1 = at(f.intakeTop ?? .3), iw = f.intakeHalf ?? 30;
  if (f.intake !== false && f.grille !== 'mouth') wrap({ a0: -iw, a1: iw, y0: i0, y1: i1, wide: f.intakeWide ?? [1, .8], kind: 'gloss', off: .006 });
  if (f.fog) for (const kind of ['gloss', 'day']) wrap({ a0: 41 - (kind === 'gloss' ? 1.5 : 0), a1: 49 + (kind === 'gloss' ? 1.5 : 0), y0: at(.2) - (kind === 'gloss' ? .015 : 0), y1: at(.2) + .05 + (kind === 'gloss' ? .015 : 0), round: .8, kind, off: kind === 'gloss' ? .005 : .009, step: 2 });
  if (f.skid) wrap({ a0: -34, a1: 34, y0: chin - .01, y1: chin + .07, wide: [.8, 1], kind: 'silver', off: .008 });
  const py = at(f.plateY ?? (f.grille === 'mouth' || f.grille === 'hex' || f.grille === 'spindle' ? .36 : .42));
  wrap({ a0: -8.2, a1: 8.2, y0: py - .075, y1: py + .075, kind: 'plate', off: .018, rows: 1, step: 5.5 });
}

// The tail: lamps under the deck or up the pillars, the plate, a dark valance.
function rearFace(d, wrap, shell) {
  const r = { lamp: d.twoBox ? 'tall' : 'wrap', ...d.rear };
  if (shell.upright) {
    // The window of an upright tail, narrower toward the roof; a cargo van has a pane in each door.
    const y0 = d.tailY + .05, y1 = d.H - d.rearDrop - .12, half = r.glassHalf ?? 38;
    if (y1 - y0 > .12) for (const [a0, a1] of d.cargo ? [[3, half - 6]] : [[-half, half]]) {
      const pane = { a0, a1, y0: d.cargo ? lerp(y0, y1, .3) : y0, y1, wide: d.cargo ? null : [1, .9], rows: 3 };
      wrap({ ...pane, a0: a0 - 1.2, a1: a1 + 1.2, y0: pane.y0 - .016, y1: y1 + .016, kind: 'gloss', off: .004 });
      wrap({ ...pane, kind: 'glass', off: .008 });
    }
  }
  const pickup = d.shape === 'pickup', deck = pickup ? d.bedY : d.twoBox ? d.tailY : d.deckY - .035, low = d.rearLow + .04;
  // A red lens with the lit part inside it.
  const unit = (s, lit = [.12, .88, .25, .75]) => {
    wrap({ ...s, kind: 'redlens', off: .005 });
    const hgt = s.y1 - s.y0, inset = (s.a1 - s.a0);
    wrap({ ...s, a0: s.a0 + inset * lit[0], a1: s.a0 + inset * lit[1], y0: s.y0 + hgt * lit[2], y1: s.y0 + hgt * lit[3], rise: (s.rise ?? 0) * (lit[1] - lit[0]), kind: 'tail', off: .01, round: .3 });
  };
  const y1 = deck - (r.lampDrop ?? (d.twoBox ? .07 : .05)), h = r.lampH ?? .14;
  const inner = r.lampIn ?? 30, outer = r.lampOut ?? 72;
  switch (r.lamp) {
    case 'tall': unit({ a0: r.lampIn ?? 49, a1: r.lampOut ?? 64, y0: y1 - (r.lampH ?? .16), y1: y1 + (r.lampUp ?? .34), round: .15, rows: 4, lean: r.lean ?? 3, wide: [1, .7] }, [.25, .75, .12, .88]); break;
    case 'block': unit({ a0: r.lampIn ?? 46, a1: r.lampOut ?? 58, y0: y1 - (r.lampH ?? .4), y1, round: .08, rows: 3 }, [.2, .8, .1, .9]); break;
    case 'bar':
      wrap({ a0: -outer, a1: outer, y0: y1 - h * .42, y1: y1 - h * .08, kind: 'redlens', off: .005 }); wrap({ a0: -outer + 3, a1: outer - 3, y0: y1 - h * .32, y1: y1 - h * .18, kind: 'tail', off: .01, rows: 1 });
      unit({ a0: inner + 8, a1: outer, y0: y1 - h, y1, round: .25, rise: r.rise ?? .01 }); break;
    default: unit({ a0: inner, a1: outer, y0: y1 - h, y1, round: .28, grow: r.grow ?? 1.3, rise: r.rise ?? .02 });
  }
  if (r.strip) wrap({ a0: -inner + 1, a1: inner - 1, y0: y1 - h * .62, y1: y1 - h * .38, kind: r.strip === 'chrome' ? 'chrome' : 'gloss', off: .009, rows: 1 });
  const py = r.plateY ?? (pickup ? d.rearBumper + .04 : lerp(d.rearBumper, deck, d.twoBox ? .5 : .42));
  if (!pickup) wrap({ a0: -9.5, a1: 9.5, y0: py - .1, y1: py + .1, kind: 'gloss', off: .005, rows: 1, round: .08 });
  wrap({ a0: -7.6, a1: 7.6, y0: py - .075, y1: py + .075, kind: 'plate', off: .012, rows: 1, step: 5.5 });
  if (r.emblem !== false && !pickup) wrap({ a0: -2.4, a1: 2.4, y0: py + .15, y1: py + .222, round: 1, kind: 'chrome', off: .012, step: 1.2, rows: 3 });
  // The lower valance, dark, with a reflector at each corner.
  if (r.valance !== false && !pickup) wrap({ a0: -50, a1: 50, y0: low, y1: low + (r.valanceH ?? .1), wide: [1, .86], kind: 'trim', off: .006 });
  if (pickup) wrap({ a0: -60, a1: 60, y0: d.rearBumper - .1, y1: d.rearBumper + .1, kind: r.bumper ?? 'chrome', off: .01 });
  else wrap({ a0: 55, a1: 64, y0: low + .07, y1: low + .1, kind: 'redlens', off: .008, rows: 1 });
}

/** Triangles for a design: the painted shell with its glass and trim, and the lamps. */
export function buildVehicle(design) {
  const d = resolveDesign(design), shell = loft(d);
  const body = mesh(['position', 'normal', 'color', 'aFinish', 'aPaintWeight']), lamps = mesh(['position', 'normal', 'color']);
  body.panels = [];
  const triangles = skin(d, shell, body);
  frontFace(d, wrapper(d, triangles, 'front', body, lamps));
  rearFace(d, wrapper(d, triangles, 'rear', body, lamps), shell);
  const z = x => d.L / 2 - x, { width, belt, top, roofWidth } = shell;
  for (const side of [-1, 1]) {
    // Door mirrors, on a short arm from the corner of the glass.
    const mx = d.cowl + .2, my = belt(mx) + .09;
    const mirrorStart = body.index.length/3, door = EXTERIOR_PARTS.indexOf(side > 0 ? 'left' : 'right');
    solid(body, new THREE.SphereGeometry(1, 8, 6), d.mirrorKind ?? 'paint', place(side * (width(mx) + .085), my, z(mx), .1, .062, .055));
    solid(body, new THREE.BoxGeometry(.1, .025, .05), 'gloss', place(side * (width(mx) + .0), my - .03, z(mx), 1, 1, 1));
    for (let i=mirrorStart; i<body.index.length/3; i++) body.panels[i] = door;
    // A handle on each door, just under the belt line.
    const doors = d.doors === 2 ? [shell.cuts[1]] : [shell.cuts[1], shell.cuts[2]];
    for (const c of doors) {
      const hx = c - .17, hy = lerp(shell.floor(hx), belt(hx), .76), start = body.index.length/3;
      solid(body, new THREE.BoxGeometry(.022, .03, .17), d.handles ?? 'paint', place(side * (width(hx) * .985 + .004), hy, z(hx), 1, 1, 1));
      if (c === doors[0]) for (let i=start; i<body.index.length/3; i++) body.panels[i] = door;
    }
    if (d.rails && !d.cargo) {
      const from = d.header + .12, to = d.rearD - .12;
      for (let k = 0; k < 3; k++) {
        const a = lerp(from, to, k / 3), b = lerp(from, to, (k + 1) / 3), m = (a + b) / 2;
        solid(body, new THREE.BoxGeometry(.035, .028, b - a + .01), d.railKind ?? 'trim', place(side * roofWidth(m) * .9, top(m) + .012, z(m), 1, 1, 1));
      }
    }
  }
  // Where a patrol car's light bar sits, and anything else that stands on the roof amidships.
  const barAt = d.L / 2 + .2, roof = top(barAt);
  if (d.livery === 'taxi') {
    // The roof light over the front seats, and the band of squares along the doors.
    const at = Math.min(d.header + .32, d.rearD - .2), y = top(at);
    solid(body, new THREE.BoxGeometry(.66, .05, .32), 'check', place(0, y + .018, z(at), 1, 1, 1));
    solid(lamps, new THREE.BoxGeometry(.58, .11, .26), 'cab', place(0, y + .095, z(at), 1, 1, 1));
    const from = shell.cuts[0] + .1, to = shell.cuts.at(-1) - .06, squares = Math.max(4, Math.round((to - from) / .13));
    for (const side of [-1, 1]) for (let k = 0; k < squares; k += 2) {
      const at2 = lerp(from, to, (k + .5) / squares), y2 = lerp(shell.floor(at2), belt(at2), .55);
      solid(body, new THREE.BoxGeometry(.012, .1, (to - from) / squares), 'check', place(side * (shell.sideAt(at2, y2) + .002), y2, z(at2), 1, 1, 1));
    }
  }
  if (d.livery === 'police') {
    // Two blue stripes from wheel to wheel, and the bar the beacons stand on.
    const from = d.FO + d.arch + .06, to = d.FO + d.WB - d.arch - .06, pieces = Math.ceil((to - from) / .3);
    for (const side of [-1, 1]) for (let k = 0; k < pieces; k++) for (const [drop, tall] of [[.2, .055], [.29, .03]]) {
      const at = lerp(from, to, (k + .5) / pieces), y = belt(at) - drop;
      solid(body, new THREE.BoxGeometry(.01, tall, (to - from) / pieces + .004), 'stripe', place(side * (shell.sideAt(at, y) + .002), y, z(at), 1, 1, 1));
    }
    solid(body, new THREE.BoxGeometry(1.16, .05, .27), 'check', place(0, roof + .035, z(barAt), 1, 1, 1));
    // Unlit lenses: a car near enough to flash carries its own lights over these (world.js).
    for (const [side, kind] of [[-1, 'blue'], [1, 'red']]) solid(body, new THREE.BoxGeometry(.4, .12, .22), kind, place(side * .38, roof + .13, z(barAt), 1, 1, 1));
  }
  return { design: d, shell, body, lamps, roof };
}

/** A design as the game draws it: the same form as a decoded exterior file. */
export function generateVehicle(spec) {
  const built = buildVehicle(spec.design);
  const geometry = built.body.geometry();
  const panels = new Uint8Array(geometry.index.count/3);
  panels.set(built.body.panels);
  geometry.userData.panels = panels;
  return { id: spec.id, body: geometry, lamps: built.lamps.geometry(), wheels: spec.wheels || designWheels(built.design), roof: built.roof,
    layout: { width: built.design.W/2, height: built.design.H, hinge: built.design.L/2-built.shell.cuts[0],
      latch: built.design.L/2-built.shell.cuts[1], cowl: built.design.L/2-built.design.cowl } };
}
