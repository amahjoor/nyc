// The archive collection as parts of the figure: each piece of data/archive-collection.json cut
// (garment-shells.mjs), painted (garment-paint.mjs) and written where human.js reads what is worn.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createTailor, cutOf } from './garment-shells.mjs';
import { paintGarment } from './garment-paint.mjs';

// The collection is kept a chapter to a file under data/archive-collection/, in the order of the list it follows.
const FOLDER = new URL('../data/archive-collection/', import.meta.url);
// ARCHIVE_ONLY=footwear,01-grails builds just those chapters, to look at them without the rest.
const WANTED = process.env.ARCHIVE_ONLY?.split(',');
export const archivePieces = () => readdirSync(FOLDER).filter(name => name.endsWith('.json') && (!WANTED || WANTED.includes(name.slice(0, -5)))).sort().flatMap(name => JSON.parse(readFileSync(new URL(name, FOLDER), 'utf8'))).sort((a, b) => a.n - b.n);
const linear = hex => hex.slice(1).match(/../g).map(v => { const c = parseInt(v, 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
const index = values => { let most = 0; for (const v of values) if (v > most) most = v; return most < 65536 ? Uint16Array.from(values) : Uint32Array.from(values); };

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v)), smooth = (a, b, v) => { const t = clamp((v - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
/**
 * Reshape a pair of shoes from the wardrobe. `rest` is every point as modelled, in metres; the feet stand apart, one each side
 * of the middle, toes toward +Z. A shape step works on both feet alike:
 *   platform { height, from }     lift everything above `from` (metres above the ground) by `height`, thickening the sole
 *   shaft    { add, from }        draw the leg of a boot up by `add` above `from`
 *   wide     { by, below }        broaden the shoe by a share, below a height if given
 *   toe      { square | point | bulb, from }  reshape the toe forward of `from` (metres ahead of the ankle)
 *   tongue   { up, out }          stand the tongue of a high top up above its collar
 *   arch     { from, to, depth }  cut the sole away under the instep, between a heel and a platform (after `platform`)
 */
export function shapeStock(design, rest, offsets) {
  let floor = Infinity, toe = -Infinity, heel = Infinity, far = 0, top = -Infinity;
  for (const p of rest) { floor = Math.min(floor, p[1]); toe = Math.max(toe, p[2]); heel = Math.min(heel, p[2]); far += Math.abs(p[0]); top = Math.max(top, p[1]); }
  const middle = far / rest.length, long = toe - heel;
  for (const step of design.shape || []) for (let i = 0; i < rest.length; i++) {
    const p = rest[i], h = p[1] - floor, side = Math.sign(p[0]) || 1, fx = Math.abs(p[0]) - middle, fz = (p[2] - heel) / long; let dx = 0, dy = 0, dz = 0;
    if (step.op === 'platform') { const from = step.from ?? .012; dy = step.height * smooth(from * .4, from, h) * (step.heelOnly ? smooth(.45, .25, fz) : 1); if (step.spread) { const k = step.spread * (1 - smooth(from, from + .03, h)); dx = fx * k; dz = (fz - .5) * long * k * .5; } }
    else if (step.op === 'shaft') { const from = step.from ?? .1; dy = step.add * smooth(from, top - floor, h) ; if (step.flare) { const k = step.flare * smooth(from, top - floor, h); dx = fx * k; dz = (p[2] - (heel + long * .28)) * k; } }
    else if (step.op === 'wide') { const k = step.by * (step.below ? 1 - smooth(step.below, step.below + .03, h) : 1); dx = fx * k; dz = (fz - .5) * long * k * (step.long ?? .3); }
    else if (step.op === 'toe') {
      const from = step.from ?? .72, k = smooth(from, 1, fz) * (1 - smooth(.06, .1, h));
      if (step.square) { dx = (Math.sign(fx) * Math.min(Math.abs(fx) + .012, .042) - fx) * k * step.square; dz = -(fz - from) * long * .18 * k * step.square; }
      if (step.point) { dx = -fx * .55 * k * step.point; dz = long * .16 * k * step.point; }
      if (step.bulb) { dx = fx * .3 * k * step.bulb; dy = h * .5 * k * step.bulb; dz = long * .04 * k * step.bulb; }
      if (step.split) { dx += Math.sign(fx + .012) * step.split * k * Math.exp(-(((fx + .012) / .008) ** 2)); }
    }
    // The sole cut away under the instep, leaving a heel behind it and a platform in front: lifts what touches the ground there.
    else if (step.op === 'arch') { const a = step.from ?? .3, b = step.to ?? .62, k = smooth(a - .05, a + .03, fz) * (1 - smooth(b - .03, b + .05, fz)) * (1 - smooth(.004, step.depth * .9, h)); dy = step.depth * k; }
    else if (step.op === 'tongue') { const k = smooth(.1, top - floor, h) * smooth(.45, .62, fz); dy = step.up * k; dz = (step.out || 0) * k; }
    else if (step.op === 'heel') { const k = smooth(.55, .1, fz); dy = step.height * k * smooth(.004, .02, h) + step.height * .5 * smooth(.3, .1, fz) * 0; if (h < .02 && fz < .3 && step.thin) { dx = -fx * step.thin; dz = (.12 - fz) * long * step.thin * .5; } }
    else throw new Error(design.id + ': no such shape: ' + step.op);
    dx *= side;
    p[0] += dx; p[1] += dy; p[2] += dz; offsets[3 * i] += dx; offsets[3 * i + 1] += dy; offsets[3 * i + 2] += dz;
  }
}

/**
 * @param body { positions, faces, skinIndex, skinWeight, bones, places } as build-human.mjs has them
 * @param put  appends a typed array to parts.bin and returns [offset, count]
 * @returns the entries for human.json's `parts`
 */
export function cutArchive({ positions, faces, skinIndex, skinWeight, bones, places, put, out, textures = true, only = null, pieces = archivePieces() }) {
  const tailor = createTailor({ positions, faces, skinIndex, skinWeight, bones, places }), made = [];
  // How far a point stands off the body grows with the body, measured across, up and through the head as MakeHuman's own clothes are.
  const span = (a, b, axis) => [a, b, Math.abs(positions[a * 3 + axis] - positions[b * 3 + axis])];
  const scale = { x: span(5399, 11998, 0), y: span(791, 881, 1), z: span(962, 5320, 2) };
  const write = (piece, id, slot) => {
    const shape = cutOf(piece.cut), cut = tailor.make(piece.cut), map = 'archive/' + id + '.webp', normal = 'archive/' + id + '-n.webp';
    if (textures && (!only || only.includes(id.replace(/2$/, '')))) paintGarment({ ...piece, id }, cut, join(out, 'tex', map), join(out, 'tex', normal));
    const c = linear(piece.colour), sheer = Boolean(piece.sheer);
    made.push({ kind: 'garment', id, slot, points: cut.points, ties: cut.ties, shade: .2126 * c[0] + .7152 * c[1] + .0722 * c[2],
      tie: put(cut.tie), share: put(cut.share), off: put(cut.off), skinBone: put(cut.bone), skinPull: put(cut.pull), corners: put(index(cut.corners)), uv: put(cut.uv), triangles: put(index(cut.triangles)),
      hidden: cut.hidden.length ? put(Uint16Array.from(cut.hidden)) : null, scale, depth: slot === 'top' ? 60 : 40, map, normal, clear: Boolean(piece.clear), twoSided: true, tags: ['archive'], dyeBase: piece.colour, ownColour: true,
      ...(piece.finish ? { finish: piece.finish } : {}), ...(sheer ? { sheer: true } : {}), ...(shape.overBoot ? { overBoot: true } : {}), ...(slot === 'top' ? (shape.overWaist !== false ? { overWaist: true } : { tucked: true }) : {}), ...(slot === 'bottom' ? { liftsHem: true } : {}) });
  };
  for (const piece of pieces) {
    if (!piece.cut) continue;
    try {
    write(piece.under ? { ...piece, cut: { lift: .007, ...piece.cut } } : piece, piece.id, piece.slot);
    // What is worn under it and goes with it: the shirt in a jacket, the lining that shows. human-looks.js puts on `id2` with `id`.
    if (piece.under) write({ ...piece.under, sheer: false }, piece.id + '2', piece.slot);
    } catch (error) { throw new Error(piece.id + ': ' + error.message, { cause: error }); }
  }
  return made;
}

/**
 * What the game needs to know of the collection without its meshes: who made each piece, what it is called,
 * when it is from and what it costs. Written to dist/archive-collection.js, which the shops and the wardrobe read.
 */
export function writeCatalog(file = fileURLToPath(new URL('../dist/archive-collection.js', import.meta.url))) {
  const rows = archivePieces().map(piece => {
    const row = { n: piece.n, id: piece.id, designer: piece.designer, name: piece.name, season: piece.season, price: piece.price, slot: piece.slot, colour: piece.colour };
    for (const key of ['with', 'part', 'bag']) if (piece[key]) row[key] = piece[key];
    return row;
  });
  const ids = new Set();
  for (const row of rows) {
    if (!/^[a-z][a-z0-9-]{1,46}[a-z]$/.test(row.id) || ids.has(row.id)) throw new Error('bad or repeated id: ' + row.id);
    ids.add(row.id);
    if (!row.part && !(row.price > 0)) throw new Error(row.id + ' has no price');
  }
  writeFileSync(file, '// Written by scripts/archive-wardrobe.mjs from data/archive-collection/. Change the recipes, not this file.\n' +
    '// n: the place on the list; price: US dollars, what an original sells for now.\nexport const ARCHIVE = [\n' + rows.map(row => ' ' + JSON.stringify(row)).join(',\n') + '\n];\n');
  return rows.length;
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'catalog') console.log(writeCatalog() + ' pieces in the catalog');
