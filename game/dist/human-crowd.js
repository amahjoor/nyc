// Somebody made for the street: seen from across it, not from arm's length.
//
// Up close a person is a body and half a dozen things worn, each with its own
// picture (human-mesh.js). A street has hundreds of people on it, and that
// many pictures and that many meshes each would stop it. So for the street a
// person is made twice more: once in a few thousand points with everything
// they wear, for the near side of the street, and once as little more than a
// body with its clothes painted on, for the far side; and all their pictures
// are cut down and laid side by side in one small one (an "atlas"), with the
// skin already its tone and the cloth already its colour. One mesh, one
// picture, one draw.
//
// This runs in the worker (it reads pictures with createImageBitmap and
// paints on an OffscreenCanvas); people-figures.js draws what it makes.
import { qmul, qinv, qrot } from './body.js';
import { FURNITURE_CLIPS, sheetSeats } from './seating.js';
import { fitPose } from './body-motion.js';
import { lookOf } from './human-looks.js';

export const ATLAS = 512, SHEET_FPS = 15;
/** The movements people on the street may be seen in. */
export const STREET_CLIPS = ['idle', 'walk', 'jog', 'sprint', 'sit', ...FURNITURE_CLIPS, 'sitTalk', 'talk', 'hitChest', 'hitHead', 'death', 'guard', 'jab', 'cross', 'kick', 'flinch', 'knocked', 'lying', 'getUp', 'stumble', 'handsUp', 'cower', 'kneel', 'cuffed', 'cuffing', 'aim', 'shoot', 'thrown', 'drive', 'reach', 'crouch'];

/** The bones a body seen from the street bends at: fingers are left to the hand. `kept` are those bones; `compact` says where each bone's share goes. */
export function streetBones(bones) {
  const kept = [], compact = new Int16Array(bones.length).fill(-1);
  bones.forEach((bone, i) => { if (!/^(index|middle|ring|pinky|thumb)_/.test(bone.name)) { compact[i] = kept.length; kept.push(i); } });
  bones.forEach((bone, i) => { if (compact[i] < 0) { let up = bone.parent; while (compact[up] < 0) up = bones[up].parent; compact[i] = compact[up]; } });
  return { kept, compact };
}
/** Where each movement's frames are in a sheet of poses: Map of id to { first, count, loop, seconds }, and how many frames in all. */
export function sheetRows(motion, clips = STREET_CLIPS) {
  const rows = new Map(); let frames = 0;
  for (const id of clips) { const clip = motion.clip(id), count = Math.max(2, Math.round(clip.seconds * SHEET_FPS) + (clip.loop ? 0 : 1)); rows.set(id, { first: frames, count, loop: clip.loop, seconds: clip.seconds }); frames += count; }
  return { rows, frames };
}

// A float as the sixteen bits a half-float texture wants.
const floats = new Float32Array(1), bits = new Uint32Array(floats.buffer);
function half(value) {
  floats[0] = value; const x = bits[0], sign = x >>> 16 & 0x8000, exponent = (x >>> 23 & 0xff) - 127 + 15, mantissa = x & 0x7fffff;
  if (exponent <= 0) return exponent < -10 ? sign : sign | (mantissa | 0x800000) >> (1 - exponent + 13);
  if (exponent >= 31) return sign | 0x7c00;
  return sign | exponent << 10 | mantissa >> 13;
}
/**
 * Every frame of every street movement for one skeleton: for each kept bone, the three rows of the matrix
 * that carries a point from where the body was modelled to where that frame has it. Half floats, four to a texel.
 */
export function poseSheet(motion, rig, clips = STREET_CLIPS) {
  const { kept } = streetBones(motion.bones), { rows, frames } = sheetRows(motion, clips), wide = kept.length * 3, out = new Uint16Array(wide * frames * 4);
  const pose = motion.newPose(), fitted = { q: [], pelvis: [0, 0, 0] }, world = [];
  for (const [id, row] of rows) for (let f = 0; f < row.count; f++) {
    motion.sample(id, row.loop ? f / SHEET_FPS : Math.min(row.seconds, f / SHEET_FPS), pose); fitPose(motion, rig, pose, fitted, sheetSeats[id]);
    rig.bones.forEach((bone, i) => {
      const t = i === motion.pelvis ? fitted.pelvis : bone.t;
      if (bone.parent < 0) { world[i] = { p: t, q: fitted.q[i] }; return; }
      const parent = world[bone.parent], r = qrot(parent.q, t);
      world[i] = { p: [parent.p[0] + r[0], parent.p[1] + r[1], parent.p[2] + r[2]], q: qmul(parent.q, fitted.q[i]) };
    });
    kept.forEach((bone, k) => {
      const bind = rig.bind[bone], q = qmul(world[bone].q, qinv(bind.q)), moved = qrot(q, bind.p), [x, y, z, w] = q, at = ((row.first + f) * wide + k * 3) * 4;
      const m = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), world[bone].p[0] - moved[0], 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), world[bone].p[1] - moved[1], 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), world[bone].p[2] - moved[2]];
      for (let j = 0; j < 12; j++) out[at + j] = half(m[j]);
    });
  }
  return { poses: out, wide, frames };
}

// --- The atlas ---------------------------------------------------------------------------------------
// Where each kind of thing goes in it, in pixels: [x, y, width, height]. Skin has most of it; what is left over is shared out.
const CELLS = { skin: [0, 0, 320, 320], top: [320, 0, 192, 192], bottom: [320, 192, 192, 160], hair: [0, 320, 192, 192], shoes: [192, 320, 128, 128], eyes: [192, 448, 64, 64], brows: [256, 448, 64, 64] };
const SPARE = [[320, 352, 96, 96], [416, 352, 96, 96], [320, 448, 64, 64], [384, 448, 64, 64]], SWATCH = [448, 448, 16];
const linear = new Float32Array(256).map((_, v) => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
const encode = c => { const v = Math.max(0, Math.min(1, c)); return Math.round((v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055) * 255); };
const hexLinear = hex => { const n = parseInt(String(hex).replace('#', ''), 16); return [linear[n >> 16 & 255], linear[n >> 8 & 255], linear[n & 255]]; };
const pictures = new Map();
/** A picture from dist/human/tex, no larger than it will be used. */
function pictureAt(base, name) {
  if (!pictures.has(name)) pictures.set(name, fetch(base + 'tex/' + name).then(response => response.blob()).then(blob => createImageBitmap(blob, { resizeWidth: 640, resizeHeight: 640, resizeQuality: 'medium' })));
  return pictures.get(name);
}

/**
 * Lay the pictures of somebody's pieces side by side. Returns { bitmap, place }: `place(piece)` gives
 * { remap(u, v) → [u, v] in the atlas, swatch: [u, v] of a patch of its plain colour }.
 */
async function atlasFor(pieces, look, base) {
  const canvas = new OffscreenCanvas(ATLAS, ATLAS), context = canvas.getContext('2d', { willReadFrequently: true }), placed = new Map();
  context.fillStyle = '#808080'; context.fillRect(0, 0, ATLAS, ATLAS);
  let spare = 0, swatches = 0;
  for (const piece of pieces) {
    const name = piece.kind === 'skin' ? look.skin : piece.kind === 'eyes' ? look.iris : piece.map;
    if (!name) continue;
    const cell = CELLS[piece.kind === 'garment' ? piece.slot : piece.kind];
    const key = piece.kind + '/' + piece.id, taken = [...placed.values()].some(entry => entry.cell === cell);
    const rect = cell && !taken ? cell : SPARE[spare++]; if (!rect) continue;
    // The part of its picture this piece uses.
    let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
    for (let i = 0; i < piece.uv.length; i += 2) { const u = piece.uv[i], v = piece.uv[i + 1]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    u0 = Math.max(0, u0 - .004); v0 = Math.max(0, v0 - .004); u1 = Math.min(1, u1 + .004); v1 = Math.min(1, v1 + .004);
    const image = await pictureAt(base, name), [x, y, w, h] = rect;
    context.clearRect(x, y, w, h);
    context.drawImage(image, u0 * image.width, (1 - v1) * image.height, Math.max(1, (u1 - u0) * image.width), Math.max(1, (v1 - v0) * image.height), x, y, w, h);
    // Skin is brought to its tone, and cloth and hair given their colour, keeping the picture's own light and shade.
    const tone = piece.kind === 'skin' ? look.tone : null, colour = piece.kind === 'hair' ? look.hair : piece.kind === 'brows' ? look.brows : look.colours?.[key], keyed = colour ? hexLinear(colour) : null;
    const data = context.getImageData(x, y, w, h), px = data.data, mean = Math.max(.02, piece.shade || .2), solid = !(piece.clear || piece.kind === 'hair' || piece.kind === 'brows');
    const sum = [0, 0, 0]; let counted = 0;
    for (let i = 0; i < px.length; i += 4) {
      let r = linear[px[i]], g = linear[px[i + 1]], b = linear[px[i + 2]];
      if (tone) { r *= tone[0]; g *= tone[1]; b *= tone[2]; }
      else if (keyed) { const shade = Math.min(2.6, ((.2126 * r + .7152 * g + .0722 * b) / mean) ** .8); r = keyed[0] * shade; g = keyed[1] * shade; b = keyed[2] * shade; }
      px[i] = encode(r); px[i + 1] = encode(g); px[i + 2] = encode(b);
      if (solid) px[i + 3] = 255;
      if (px[i + 3] > 128) { sum[0] += r; sum[1] += g; sum[2] += b; counted++; }
    }
    context.putImageData(data, x, y);
    // A patch of its plain colour, for where it is only painted on.
    const sx = SWATCH[0] + (swatches % 4) * SWATCH[2], sy = SWATCH[1] + Math.floor(swatches / 4) * SWATCH[2]; swatches++;
    context.fillStyle = `rgb(${sum.map(c => encode(c / (counted || 1))).join(',')})`; context.fillRect(sx, sy, SWATCH[2], SWATCH[2]);
    placed.set(key, { cell: rect, remap: (u, v) => [(x + (u - u0) / (u1 - u0) * w) / ATLAS, (y + (v1 - v) / (v1 - v0) * h) / ATLAS], swatch: [(sx + SWATCH[2] / 2) / ATLAS, (sy + SWATCH[2] / 2) / ATLAS] });
  }
  return { bitmap: canvas.transferToImageBitmap(), place: piece => placed.get(piece.kind + '/' + piece.id), swatchOf: key => placed.get(key)?.swatch };
}

/** Pieces as one mesh over the atlas. */
function merged(pieces, atlas) {
  const position = [], normal = [], uv = [], skinIndex = [], skinWeight = [], index = [];
  for (const piece of pieces) {
    const placed = atlas.place(piece); if (!placed && !piece.cover) continue;
    const first = position.length / 3, n = piece.position.length / 3;
    const corner = (i, over) => {
      for (let k = 0; k < 3; k++) { position.push(piece.position[i * 3 + k]); normal.push(piece.normal[i * 3 + k]); }
      for (let k = 0; k < 4; k++) { skinIndex.push(piece.skinIndex[i * 4 + k]); skinWeight.push(piece.skinWeight[i * 4 + k]); }
      const at = over || (placed ? placed.remap(piece.uv[i * 2], piece.uv[i * 2 + 1]) : [.5, .5]); uv.push(at[0], at[1]);
      return position.length / 3 - 1;
    };
    if (!piece.cover) { for (let i = 0; i < n; i++) corner(i, null); for (let i = 0; i < piece.index.length; i++) index.push(piece.index[i] + first); continue; }
    // A body with its clothes painted on: a triangle under something worn is that thing's plain colour, all of it,
    // so its corners are its own and not shared with the skin next to it.
    const swatch = cover => cover ? atlas.swatchOf(piece.worn[cover - 1]) : null, made = new Map();
    const cornerFor = (i, cover) => { const key = i * 16 + cover; if (!made.has(key)) made.set(key, corner(i, swatch(cover))); return made.get(key); };
    for (let t = 0; t < piece.index.length; t += 3) {
      const a = piece.index[t], b = piece.index[t + 1], c = piece.index[t + 2], cover = Math.max(piece.cover[a], piece.cover[b], piece.cover[c]);
      index.push(cornerFor(a, cover), cornerFor(b, cover), cornerFor(c, cover));
    }
  }
  const count = position.length / 3;
  return { position: Float32Array.from(position), normal: Float32Array.from(normal), uv: Float32Array.from(uv), skinIndex: Uint8Array.from(skinIndex), skinWeight: Float32Array.from(skinWeight), index: count > 65535 ? Uint32Array.from(index) : Uint16Array.from(index) };
}

/**
 * Somebody for the street. Returns { near, far, atlas, poses, wide, frames, height, transfer }:
 * two meshes over one picture, and every frame of every street movement for their skeleton.
 */
export async function streetFigure(human, motion, design, base) {
  const dressed = lookOf(design, human), wear = dressed.wear.filter(key => !/^(lashes|teeth)\//.test(key));
  const near = human.build({ ...design, wear }, { detail: 'near' });
  const atlas = await atlasFor(near.pieces, dressed.look, base);
  const far = human.build({ ...design, wear }, { detail: 'far', painted: true });
  const a = merged(near.pieces, atlas), b = merged(far.pieces, atlas), sheet = poseSheet(motion, near.rig);
  return { near: a, far: b, atlas: atlas.bitmap, ...sheet, height: near.height,
    transfer: [atlas.bitmap, sheet.poses.buffer, ...[a, b].flatMap(mesh => [mesh.position.buffer, mesh.normal.buffer, mesh.uv.buffer, mesh.skinIndex.buffer, mesh.skinWeight.buffer, mesh.index.buffer])] };
}
