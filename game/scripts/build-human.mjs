#!/usr/bin/env node
// Bake the figure people are made from.
//
// The figure is MakeHuman's (makehumancommunity.org): one carefully built
// body of 13,380 points, and a few hundred "targets", each of which says how
// far every point moves for one thing about a person: being a woman of
// twenty-five with an average build, a wider nose, a heavier jaw. A person is
// that body with a weighted sum of targets added. Its clothes, hair, eyes,
// brows and teeth are separate meshes, each point of which is tied to three
// points of the body, so that whatever shape the body takes they still fit
// over it. All of it was released by its authors as CC0.
//
// Reads the body, targets and skeleton from MakeHuman's data folder, the
// system assets from pack/files, and community clothing from fetch-fashion.mjs.
// All sources live under assets-src/makehuman. It writes:
//
//   dist/human/human.json   what is where in the other two, and the names
//   dist/human/body.bin     the body: points, faces, weights, targets
//   dist/human/parts.bin    what is worn: meshes and how they are tied on
//   dist/human/archive/*.bin  the same for each later piece of the archive collection, fetched as it is worn
//   dist/human/tex/*.webp   skins, cloth, hair, eyes
//
// usage: node scripts/build-human.mjs [--no-textures] [--refresh-wardrobe] [--out folder]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, basename, dirname } from 'node:path';
import { fashionPieces, fashionFolder, cutFashion, skinUnderCloth, bakeFashion } from './fashion-materials.mjs';
import { cutArchive, archivePieces, shapeStock, writeCatalog } from './archive-wardrobe.mjs';
import { paintGarment, asPainted } from './garment-paint.mjs';

const ROOT = fileURLToPath(new URL('../assets-src/makehuman/', import.meta.url));
const flag = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
// --out builds somewhere other than the game's own folder, to look at a wardrobe before it ships.
const DATA = join(ROOT, 'repo/makehuman/data'), PACK = join(ROOT, 'pack/files'), OUT = flag('--out') ? join(flag('--out'), '/') : fileURLToPath(new URL('../dist/human/', import.meta.url));
const TEXTURES = !process.argv.includes('--no-textures');
// MakeHuman works in decimetres.
const METRE = .1;
mkdirSync(join(OUT, 'tex'), { recursive: true });

// --- Reading -----------------------------------------------------------------------------
const lines = file => readFileSync(file, 'utf8').split(/\r?\n/);
/** A Wavefront mesh: points, texture coordinates, and faces as lists of [point, coordinate], by group. */
function readObj(file) {
  const v = [], vt = [], faces = []; let group = '';
  for (const line of lines(file)) {
    if (line.startsWith('v ')) v.push(line.slice(2).trim().split(/\s+/).map(Number));
    else if (line.startsWith('vt ')) vt.push(line.slice(3).trim().split(/\s+/).slice(0, 2).map(Number));
    else if (line.startsWith('g ')) group = line.slice(2).trim();
    else if (line.startsWith('f ')) faces.push({ group, corners: line.slice(2).trim().split(/\s+/).map(corner => { const [a, b] = corner.split('/'); return [Number(a) - 1, b ? Number(b) - 1 : -1]; }) });
  }
  return { v, vt, faces };
}
/** key value lines of a .mhmat or the head of a .mhclo. */
function readKeys(file) {
  const out = {};
  for (const line of lines(file)) { const text = line.trim(); if (!text || text.startsWith('#') || text.startsWith('//')) continue; const at = text.indexOf(' '); if (at > 0) (out[text.slice(0, at)] ||= []).push(text.slice(at + 1).trim()); }
  return out;
}

// --- The bin files ---------------------------------------------------------------------------
function createBin() {
  const chunks = []; let length = 0;
  return {
    /** Append a typed array on a four-byte boundary. Returns [byte offset, element count]. */
    put(array) {
      const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
      const at = length; chunks.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength)); length += array.byteLength;
      return [at, array.length];
    },
    write(file) { writeFileSync(file, Buffer.concat(chunks)); return length; },
  };
}

// --- The body ----------------------------------------------------------------------------------
const base = readObj(join(DATA, '3dobjs/base.obj'));
const POINTS = base.v.length;
const body = createBin();
const positions = new Float32Array(POINTS * 3); base.v.forEach((p, i) => positions.set(p.map(value => value * METRE), i * 3));

/** Faces as triangles over "corners": a point together with one of its texture coordinates. */
function corners(mesh, keep = () => true) {
  const index = new Map(), point = [], uv = [], triangles = [];
  const corner = ([p, t]) => { const key = p + '/' + t; let at = index.get(key); if (at === undefined) { at = point.length; index.set(key, at); point.push(p); const c = t >= 0 ? mesh.vt[t] : [0, 0]; uv.push(c[0], c[1]); } return at; };
  for (const face of mesh.faces) {
    if (!keep(face)) continue;
    const at = face.corners.map(corner);
    for (let i = 2; i < at.length; i++) triangles.push(at[0], at[i - 1], at[i]);
  }
  return { point, uv, triangles };
}
const skin = corners(base, face => face.group === 'body');
const pack16 = values => Uint16Array.from(values), packUv = uv => Float32Array.from(uv);
const index = values => { let most = 0; for (const value of values) if (value > most) most = value; return most < 65536 ? Uint16Array.from(values) : Uint32Array.from(values); };

// Which points belong to which named part of the base (the helpers that clothes are tied to are among them).
const ranges = {};
for (const face of base.faces) { if (face.group.startsWith('joint-')) continue; const range = ranges[face.group] ||= [Infinity, -Infinity]; for (const [p] of face.corners) { range[0] = Math.min(range[0], p); range[1] = Math.max(range[1], p); } }

// --- The skeleton --------------------------------------------------------------------------------
// The game's movements are for the skeleton in dist/motion.json. Each of its bones takes the place of
// one or more of MakeHuman's: where the bone's joint is (a small cube of points that moves with the
// body), and whose share of each point it gathers.
const skeleton = JSON.parse(readFileSync(join(DATA, 'rigs/default.mhskel'), 'utf8'));
const motion = JSON.parse(readFileSync(new URL('../dist/motion.json', import.meta.url), 'utf8'));
const FINGER = { thumb: 1, index: 2, middle: 3, ring: 4, pinky: 5 };
function theirs(name) {
  const side = /_([lr])$/.exec(name)?.[1], S = side ? '.' + side.toUpperCase() : '', stem = name.replace(/_[lr]$/, '');
  const finger = /^(thumb|index|middle|ring|pinky)_0([123])$/.exec(stem);
  if (finger) return `finger${FINGER[finger[1]]}-${finger[2]}${S}`;
  return ({ root: 'root', pelvis: 'spine05', spine_01: 'spine04', spine_02: 'spine03', spine_03: 'spine02', neck_01: 'neck01', Head: 'head',
    clavicle: 'clavicle' + S, upperarm: 'upperarm01' + S, lowerarm: 'lowerarm01' + S, hand: 'wrist' + S, thigh: 'upperleg01' + S, calf: 'lowerleg01' + S, foot: 'foot' + S, ball: 'toe1-1' + S })[stem];
}
const boneOf = new Map(motion.bones.map((bone, i) => [theirs(bone.name), i]));
for (const [i, bone] of motion.bones.entries()) if (!skeleton.bones[theirs(bone.name)]) throw new Error(`nothing stands for ${bone.name}`);
/** The game's bone that one of MakeHuman's is gathered into: itself if it stands for one, or the nearest above it that does. */
function gathered(name) {
  // Their root carries the hips; the game's root is a mark on the ground under the figure and carries nothing.
  for (let at = name; at && at !== 'root'; at = skeleton.bones[at].parent) if (boneOf.has(at)) return boneOf.get(at);
  return boneOf.get('spine05');
}
// Where things are, as lists of points whose middle is the place.
const joint = name => skeleton.joints[name];
const places = {};
for (const bone of motion.bones) places[bone.name] = joint(skeleton.bones[theirs(bone.name)].head);
for (const side of ['l', 'r']) {
  const S = '.' + side.toUpperCase();
  for (const [finger, n] of Object.entries(FINGER)) places[`${finger}_tip_${side}`] = joint(skeleton.bones[`finger${n}-3${S}`].tail);
  places[`toe_tip_${side}`] = joint(skeleton.bones['toe1-2' + S].tail);
  places[`eye_${side}`] = joint(skeleton.bones['eye' + S].head);
  // The ball of the foot is under the toes' first joints, all five of them.
  places[`ball_${side}`] = [1, 2, 3, 4, 5].flatMap(toe => joint(skeleton.bones[`toe${toe}-1${S}`].head));
}
places.crown = joint(skeleton.bones.head.tail); places.jaw = joint(skeleton.bones.jaw.head); places.chin = joint(skeleton.bones.jaw.tail);

const weights = JSON.parse(readFileSync(join(DATA, 'rigs', skeleton.weights_file), 'utf8')).weights;
const shares = Array.from({ length: POINTS }, () => new Map());
for (const [name, list] of Object.entries(weights)) { const bone = gathered(name); for (const [point, weight] of list) shares[point].set(bone, (shares[point].get(bone) || 0) + weight); }
const skinIndex = new Uint8Array(POINTS * 4), skinWeight = new Uint8Array(POINTS * 4);
shares.forEach((share, point) => {
  const top = [...share].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((total, [, weight]) => total + weight, 0);
  if (!sum) { skinWeight[point * 4] = 255; return; }
  let left = 255;
  top.forEach(([bone, weight], k) => { const value = k === top.length - 1 ? left : Math.min(left, Math.round(weight / sum * 255)); skinIndex[point * 4 + k] = bone; skinWeight[point * 4 + k] = value; left -= value; });
});

// --- Targets ---------------------------------------------------------------------------------------
// Everything about a person's build (macrodetails) and every dial of the face and the body. Babies are
// left out: nobody under ten walks these streets alone.
const targetFiles = [];
(function walk(folder, under) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(folder, entry.name), under ? under + '/' + entry.name : entry.name);
    else if (entry.name.endsWith('.target')) targetFiles.push([under + '/' + entry.name.slice(0, -7), join(folder, entry.name)]);
  }
})(join(DATA, 'targets'), '');
const WANTED = [
  /^macrodetails\/(universal|african|asian|caucasian)-(female|male)-(child|young|old)/,
  /^macrodetails\/height\/(female|male)-(child|young|old)-averagemuscle-averageweight-(min|max)height$/,
  /^(head|forehead|eyebrows|eyes|nose|mouth|chin|cheek|ears|neck|torso|hip|stomach|buttocks|pelvis)\//,
  /^armslegs\/(l|r)-(upperarm|lowerarm|upperleg|lowerleg|hand|foot|leg)-/, /^armslegs\/(lowerlegs|upperlegs)-/,
  /^breast\/female-young-averagemuscle-averageweight-(min|max)cup-(min|average|max)firmness$/, /^breast\/breast-/, /^breast\/nipple-/,
  /^expression\/units\/(caucasian|african|asian)\//,
];
const targets = [];
for (const [name, file] of targetFiles.sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!WANTED.some(pattern => pattern.test(name)) || /genital|penis|bulge|images/.test(name)) continue;
  const points = [], moves = []; let far = 0;
  for (const line of lines(file)) {
    if (!line || line.startsWith('#')) continue;
    const [i, x, y, z] = line.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(z)) continue;
    points.push(i); moves.push(x * METRE, y * METRE, z * METRE); far = Math.max(far, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  if (!points.length) continue;
  const scale = far * METRE / 32767 || 1;
  const [at, count] = body.put(pack16(points)), [moved] = body.put(Int16Array.from(moves, value => Math.round(value / scale)));
  targets.push({ name, at, count, moved, scale });
}
// The dials: each pair of targets that pull opposite ways is one of them (modeling_modifiers.json).
const dials = [];
for (const group of JSON.parse(readFileSync(join(DATA, 'modifiers/modeling_modifiers.json'), 'utf8'))) {
  for (const modifier of group.modifiers) {
    if (!modifier.target || /genital|penis|bulge/.test(modifier.target)) continue;
    // Some go one way only (a head that is more nearly square), and are a target by themselves.
    const stem = group.group + '/' + modifier.target, low = modifier.min ? stem + '-' + modifier.min : null, high = modifier.max ? stem + '-' + modifier.max : stem;
    const has = name => name && targets.some(target => target.name === name);
    if (!has(high) && !has(low)) continue;
    dials.push({ group: group.group, id: modifier.target + (modifier.max ? '-' + (modifier.min ? modifier.min + '-' : '') + modifier.max : ''), low: has(low) ? low : null, high: has(high) ? high : null });
  }
}

const bodyMeta = {
  points: POINTS, position: body.put(positions),
  skin: { corners: body.put(pack16(skin.point)), uv: body.put(packUv(skin.uv)), triangles: body.put(index(skin.triangles)) },
  skinIndex: body.put(skinIndex), skinWeight: body.put(skinWeight),
  ranges, places, targets, dials,
};

// --- What is worn ------------------------------------------------------------------------------------
// --only a,b paints just those pieces of the collections again; the rest keep the pictures they have.
const ONLY = flag('--only')?.split(',') || null;
let FLOOR_Y = Infinity; for (const corner of skin.point) FLOOR_Y = Math.min(FLOOR_Y, positions[corner * 3 + 1]);
const parts = createBin(), partList = [], textures = new Map();
// Bins beside parts.bin, by name: what nobody needs until it is worn (a later piece of the archive collection).
const bins = new Map(), binPut = (name, array) => { if (!bins.has(name)) bins.set(name, createBin()); return bins.get(name).put(array); };
/** A texture to be converted: returns the name it will have under dist/human/tex. */
function texture(folder, file, { size = 1024, alpha = false, wardrobe = false, prefix = '' } = {}) {
  if (!file) return null;
  const from = join(folder, basename(file));
  if (!existsSync(from)) { console.warn('missing texture', from); return null; }
  const name = prefix + basename(file).replace(/\.[a-z]+$/i, '') + '.webp';
  textures.set(name, { from, size, alpha, wardrobe });
  return name;
}
const small = new Map();
/** The mean lightness (linear, 0 to 1) of a picture where a mesh's texture coordinates fall on it. */
function shadeOver(file, uv) {
  if (!small.has(file)) small.set(file, execFileSync('magick', [file, '-alpha', 'off', '-resize', '128x128!', '-depth', '8', 'rgb:-'], { maxBuffer: 1 << 20 }));
  const pixels = small.get(file), linear = v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  let sum = 0, count = 0;
  for (let i = 0; i < uv.length; i += 2) {
    const x = Math.min(127, Math.max(0, Math.floor((uv[i] % 1 + 1) % 1 * 128))), y = Math.min(127, Math.max(0, Math.floor((1 - (uv[i + 1] % 1 + 1) % 1) * 128))), at = (y * 128 + x) * 3;
    sum += .2126 * linear(pixels[at]) + .7152 * linear(pixels[at + 1]) + .0722 * linear(pixels[at + 2]); count++;
  }
  return count ? Number((sum / count).toFixed(4)) : null;
}
// A suit shares one picture across multiple garments. Find the predominant
// dye on this piece, so recolouring the cloth can spare contrasting trim.
function dyeBaseOver(file, uv, triangles) {
  const pixels=small.get(file), bins=new Map();
  for(let i=0;i<triangles.length;i+=3){
    const [a,b,c]=triangles.slice(i,i+3).map(v=>2*v);
    const area=Math.abs((uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[c]-uv[a])*(uv[b+1]-uv[a+1]));
    const x=Math.min(127,Math.max(0,Math.floor((uv[a]+uv[b]+uv[c])*128/3)));
    const y=Math.min(127,Math.max(0,Math.floor((1-(uv[a+1]+uv[b+1]+uv[c+1])/3)*128)));
    const colour=pixels.subarray((y*128+x)*3,(y*128+x)*3+3);
    const key=(colour[0]>>4)*256+(colour[1]>>4)*16+(colour[2]>>4);
    const bin=bins.get(key) || {area:0,sum:[0,0,0]};
    bin.area+=area;
    for(let k=0;k<3;k++)bin.sum[k]+=colour[k]*area;
    bins.set(key,bin);
  }
  const best=[...bins.values()].sort((a,b)=>b.area-a.area)[0];
  return best?.area ? '#'+best.sum.map(v=>Math.round(v/best.area).toString(16).padStart(2,'0')).join('') : null;
}

/** "12 - 20 31" as a list of points. */
function pointList(text) {
  const out = [], words = text.trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) { if (words[i + 1] === '-') { for (let p = Number(words[i]); p <= Number(words[i + 2]); p++) out.push(p); i += 2; } else if (words[i] !== '') out.push(Number(words[i])); }
  return out;
}
function part(kind, id, folder, clo, design=null) {
  const file = join(folder, clo), keys = readKeys(file), text = lines(file);
  const mesh = readObj(join(folder, keys.obj_file[0]));
  // Each of its points: three points of the body, how much of each, and how far off them it stands.
  const tie = new Uint16Array(mesh.v.length * 3), share = new Float32Array(mesh.v.length * 3), off = new Float32Array(mesh.v.length * 3);
  let at = text.findIndex(line => line.trim().startsWith('verts')) + 1, n = 0;
  for (; at < text.length && n < mesh.v.length; at++) {
    const words = text[at].trim().split(/\s+/).map(Number);
    if (words.length === 1 && Number.isFinite(words[0]) && text[at].trim() !== '') { tie.set([words[0], words[0], words[0]], n * 3); share.set([1, 0, 0], n * 3); n++; }
    else if (words.length >= 9) { tie.set(words.slice(0, 3), n * 3); share.set(words.slice(3, 6), n * 3); off.set(words.slice(6, 9).map(value => value * METRE), n * 3); n++; }
    else if (text[at].trim() === 'delete_verts') break;
  }
  if (n !== mesh.v.length) throw new Error(`${id}: ${n} ties for ${mesh.v.length} points`);
  const gone = text.findIndex(line => line.trim() === 'delete_verts');
  const hidden = gone < 0 ? [] : pointList(text.slice(gone + 1).filter(line => /^[\d\s-]+$/.test(line)).join(' '));
  // How far off: scaled by the body's own size across, up and through (two points and the distance they were apart).
  const scale = axis => { const words = keys[axis + '_scale']?.[0].split(/\s+/).map(Number); return words ? [words[0], words[1], words[2] * METRE] : null; };
  const shape = corners(mesh);
  const material = keys.material ? readKeys(join(folder, keys.material[0])) : {};
  const wardrobe=Boolean(design) || ['suit','hat','shoes'].includes(kind);
  const size = wardrobe ? 1536 : kind === 'skin' ? 2048 : kind === 'eyes' || kind === 'brows' || kind === 'lashes' ? 512 : 1024;
  const clear = material.transparent?.[0] === 'True' || kind === 'hair' || kind === 'brows' || kind === 'lashes';
  const common = {
    scale: { x: scale('x'), y: scale('y'), z: scale('z') }, depth: Number(keys.z_depth?.[0] ?? 50),
    mapFile: material.diffuseTexture?.[0] && existsSync(join(folder, basename(material.diffuseTexture[0]))) ? join(folder, basename(material.diffuseTexture[0])) : null,
    map: design ? (design.paint ? 'archive/' : 'fashion/')+design.id+'.webp' : texture(folder, material.diffuseTexture?.[0], { size, alpha: clear, wardrobe }),
    normal: design?.paint ? 'archive/'+design.id+'-n.webp' : texture(folder, material.normalmapTexture?.[0], { size:wardrobe?1024:size, wardrobe, prefix:design && design.pack!=='system'?'fashion/'+design.source+'-':'' }),
    clear, twoSided: material.backfaceCull?.[0] === 'False' || kind === 'hair',
    tags: (keys.tag || []).map(tag => tag.toLowerCase()).filter(tag => !/makehuman/.test(tag)),
  };
  /** Write out some of the mesh's points (all of them if not told which) as a part of its own. */
  const emit = (kind, id, keep, hidden, extra = {}) => {
    if(design && design.pack==='system' && kind==='garment' && id!==design.source+'-'+design.slot)return;
    const renumber = new Int32Array(mesh.v.length).fill(-1), kept = [];
    for (let i = 0; i < mesh.v.length; i++) if (!keep || keep[i]) { renumber[i] = kept.length; kept.push(i); }
    const pick = (array, width) => { const out = new array.constructor(kept.length * width); kept.forEach((i, n) => { for (let k = 0; k < width; k++) out[n * width + k] = array[i * width + k]; }); return out; };
    const cornerOf = new Int32Array(shape.point.length).fill(-1), point = [], uv = [], triangles = [];
    for (let t = 0; t < shape.triangles.length; t += 3) {
      const three = [shape.triangles[t], shape.triangles[t + 1], shape.triangles[t + 2]];
      if (three.some(corner => renumber[shape.point[corner]] < 0)) continue;
      for (const corner of three) { if (cornerOf[corner] < 0) { cornerOf[corner] = point.length; point.push(renumber[shape.point[corner]]); uv.push(shape.uv[corner * 2], shape.uv[corner * 2 + 1]); } triangles.push(cornerOf[corner]); }
    }
    // How light the picture is over this part, so that it can be given any colour and keep its own light and shade.
    const shade = common.mapFile ? shadeOver(common.mapFile, uv) : null;
    const offsets=pick(off,3);
    if(design){
      const rest=kept.map(i=>[0,1,2].map(k=>off[i*3+k]+[0,1,2].reduce((sum,j)=>sum+positions[tie[i*3+j]*3+k]*share[i*3+j],0)));
      if(design.paint)shapeStock(design,rest,offsets); else cutFashion(design,rest,offsets);
      if(!hidden.length)hidden=skinUnderCloth(rest,point,triangles,positions);
      if(TEXTURES && (!ONLY || ONLY.includes(design.id))){
        if(design.paint)paintGarment(design,asPainted(rest,point,uv,triangles,FLOOR_Y),join(OUT,'tex',common.map),join(OUT,'tex',common.normal));
        else bakeFashion(design,rest,point,uv,triangles,common.mapFile,join(OUT,'tex',common.map));
      }
    }
    const bin = design?.bin, put = array => bin ? binPut(bin, array) : parts.put(array);
    const made = { kind, id:design?.id || id, ...(bin ? { bin } : {}), points: kept.length, shade, tie: put(pick(tie, 3)), share: put(pick(share, 3)), off: put(offsets),
      corners: put(index(point)), uv: put(packUv(uv)), triangles: put(index(triangles)), hidden: hidden.length ? put(pack16(hidden)) : null, ...common, ...extra };
    delete made.mapFile;
    if(design){
      if(design.overWaist)made.overWaist=true;
      if(design.overBoot)made.overBoot=true;
      if(design.finish)made.finish=design.finish;
      if(design.clear)made.clear=true;
      if(design.paint)made.ownColour=true;
      made.dyeBase=design.colour;
      const channels=design.colour.slice(1).match(/../g).map(hex=>{const c=parseInt(hex,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
      made.shade=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
    }else if(wardrobe && common.mapFile)made.dyeBase=dyeBaseOver(common.mapFile,uv,triangles);
    partList.push(made);
    return made;
  };
  if (kind !== 'suit') return emit(kind, id, null, hidden, design ? {slot:design.slot}: {});
  // An outfit is several garments in one mesh: whatever is joined together is one of them. Each is put
  // out by itself, so that the top of one outfit can be worn with the bottom of another.
  const group = Array.from({ length: mesh.v.length }, (_, i) => i), find = i => { while (group[i] !== i) { group[i] = group[group[i]]; i = group[i]; } return i; };
  for (let t = 0; t < shape.triangles.length; t += 3) { const a = find(shape.point[shape.triangles[t]]); group[find(shape.point[shape.triangles[t + 1]])] = a; group[find(shape.point[shape.triangles[t + 2]])] = a; }
  // Where each point is on the body as modelled, to tell a top from a bottom and to say what each covers.
  const where = i => { const p = [off[i * 3], off[i * 3 + 1], off[i * 3 + 2]]; for (let k = 0; k < 3; k++) { const b = tie[i * 3 + k], w = share[i * 3 + k]; p[0] += positions[b * 3] * w; p[1] += positions[b * 3 + 1] * w; p[2] += positions[b * 3 + 2] * w; } return p; };
  const lies = Array.from({ length: mesh.v.length }, (_, i) => where(i)), FLOOR = -.817;
  const islands = new Map();
  for (let i = 0; i < mesh.v.length; i++) { const island = islands.get(find(i)) || { points: [], low: Infinity, high: -Infinity }; island.points.push(i); island.low = Math.min(island.low, lies[i][1] - FLOOR); island.high = Math.max(island.high, lies[i][1] - FLOOR); islands.set(find(i), island); }
  // A garment is something of some size and some height: a belt is not one.
  const isGarment = island => island.points.length >= 200 && island.high - island.low > .1;
  const big = [...islands.values()].filter(isGarment).sort((a, b) => b.points.length - a.points.length);
  if (big.length < 2) return emit('suit', id, null, hidden, { slot: 'whole' });
  // Below the waist, or over the chest; one that is both (a boiler suit) is worn as a bottom, with a top under it.
  const slotOf = island => island.low < .3 || island.high < 1.08 ? 'bottom' : 'top';
  const garments = [];
  for (const island of big) {
    const slot = slotOf(island), same = garments.filter(garment => garment.slot === slot).length;
    garments.push({ slot, id: `${id}-${slot}${same ? same + 1 : ''}`, keep: new Uint8Array(mesh.v.length), hidden: [], island });
    for (const i of island.points) garments.at(-1).keep[i] = 1;
  }
  // Buttons, a collar, a strap: with whichever garment they lie nearest.
  const nearest = p => { let best = 0, near = Infinity; garments.forEach((garment, g) => { for (let n = 0; n < garment.island.points.length; n += 3) { const q = lies[garment.island.points[n]], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < near) { near = d; best = g; } } }); return garments[best]; };
  for (const island of islands.values()) if (!isGarment(island)) { const garment = nearest(lies[island.points[0]]); for (const i of island.points) garment.keep[i] = 1; }
  // Each point of the body that the outfit hides is hidden by the garment lying over it.
  for (const p of hidden) nearest([positions[p * 3], positions[p * 3 + 1], positions[p * 3 + 2]]).hidden.push(p);
  for (const garment of garments) emit('garment', garment.id, garment.keep, garment.hidden, { slot: garment.slot, low: Number(garment.island.low.toFixed(2)), high: Number(garment.island.high.toFixed(2)), sex: /^female/.test(id) ? 'female' : 'male' });
  return null;
}
const folders = kind => readdirSync(join(PACK, kind), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const cloIn = folder => readdirSync(folder).find(name => /\.(mhclo|proxy)$/.test(name));
for (const id of folders('clothes')) part(/^shoes/.test(id) ? 'shoes' : /fedora/.test(id) ? 'hat' : 'suit', id, join(PACK, 'clothes', id), cloIn(join(PACK, 'clothes', id)));
for (const id of folders('hair')) part('hair', id, join(PACK, 'hair', id), cloIn(join(PACK, 'hair', id)));
for (const id of folders('eyebrows')) part('brows', id, join(PACK, 'eyebrows', id), cloIn(join(PACK, 'eyebrows', id)));
for (const id of folders('eyelashes')) part('lashes', id, join(PACK, 'eyelashes', id), cloIn(join(PACK, 'eyelashes', id)));
for (const id of ['low-poly', 'high-poly']) part('eyes', id, join(PACK, 'eyes', id), cloIn(join(PACK, 'eyes', id)));
for (const id of folders('teeth')) part('teeth', id, join(PACK, 'teeth', id), cloIn(join(PACK, 'teeth', id)));
// Lighter bodies for people further off: the same person in fewer points.
for (const id of ['proxy741', 'male1591', 'female1605']) part('body', id, join(PACK, 'proxymeshes', id), cloIn(join(PACK, 'proxymeshes', id)));
// Archive pieces made from a mesh of the wardrobe (shoes) go the same way, shaped and painted by the archive's own steps.
for(const design of [...fashionPieces,...archivePieces().filter(piece=>piece.source)]){
  const folder=fashionFolder(ROOT,design);
  const kind=design.slot==='shoes'?'shoes':design.pack==='system'?'suit':'garment';
  part(kind,design.source,folder,cloIn(folder),design);
}

// The archive collection is cut from the body's own helper meshes and painted (archive-wardrobe.mjs).
partList.push(...cutArchive({ positions, faces: base.faces, skinIndex, skinWeight, bones: motion.bones.map(bone => bone.name), places,
  put: array => parts.put(array), binPut, out: OUT, textures: TEXTURES, only: ONLY }));

// Skins and eyes are pictures only.
const skins = [];
for (const id of folders('skins')) {
  if (/toon|special/.test(id)) continue;
  const folder = join(PACK, 'skins', id), material = readKeys(join(folder, readdirSync(folder).find(name => name.endsWith('.mhmat'))));
  const [, age, race, sex, variant] = /^(young|middleage|old)_(african|asian|caucasian)_(female|male)(\d?)$/.exec(id) || [];
  if (!age) continue;
  // The picture's colour over the face, so that a skin can be brought toward whatever tone is asked for.
  const mean = '#' + execFileSync('magick', [join(folder, basename(material.diffuseTexture[0])), '-gravity', 'North', '-crop', '30%x18%+0+60', '-resize', '1x1!', '-format', '%[hex:p{0,0}]', 'info:']).toString().slice(0, 6).toLowerCase();
  skins.push({ id, age, race, sex, variant: Number(variant || 1), map: texture(folder, material.diffuseTexture[0], { size: 2048 }), mean });
}
const irises = readdirSync(join(PACK, 'eyes/materials')).filter(name => name.endsWith('_eye.png')).map(name => ({ id: name.replace('_eye.png', ''), map: texture(join(PACK, 'eyes/materials'), name, { size: 512 }) }));

// --- Out ---------------------------------------------------------------------------------------------
const bodyBytes = body.write(join(OUT, 'body.bin')), partBytes = parts.write(join(OUT, 'parts.bin'));
let binBytes = 0; for (const [name, bin] of bins) { mkdirSync(dirname(join(OUT, name)), { recursive: true }); binBytes += bin.write(join(OUT, name + '.bin')); }
writeFileSync(join(OUT, 'human.json'), JSON.stringify({
  version: 1, generated: new Date().toISOString().slice(0, 10),
  source: { name: 'MakeHuman', author: 'The MakeHuman team and community', licence: 'CC0 1.0', url: 'http://www.makehumancommunity.org' },
  units: 'metres; +Y up, the figure faces +Z with its left hand toward +X. Every [a, n] is a byte offset and an element count in the bin named for its section.',
  bones: motion.bones.map(bone => bone.name),
  body: bodyMeta, parts: partList, skins, irises,
}));
if (TEXTURES) {
  let done = 0;
  for (const [name, { from, size, alpha, wardrobe }] of textures) {
    const to = join(OUT, 'tex', name);
    if (!existsSync(to) || (wardrobe && process.argv.includes('--refresh-wardrobe'))) execFileSync('magick', [from, '-resize', `${size}x${size}>`, '-quality', wardrobe ? '93' : alpha ? '90' : '86', '-define', 'webp:method=5', to]);
    done++;
  }
  console.log(`${done} textures`);
}
// The shops and the wardrobe read the collection's names and prices from a module of their own; a trial build elsewhere leaves it be.
if (!flag('--out')) writeCatalog();
console.log(`${POINTS} points, ${skin.triangles.length / 3} triangles of skin, ${targets.length} targets (${dials.length} dials), ${partList.length} parts; body.bin ${(bodyBytes / 1048576).toFixed(1)} MB, parts.bin ${(partBytes / 1048576).toFixed(1)} MB, ${bins.size} more bins ${(binBytes / 1048576).toFixed(1)} MB`);
