import { handStrikes, closeStrikes, movingStrikes, standingKicks } from './melee-moves.js';
// Somebody made for the street: seen from across it, not from arm's length.
//
// Up close a person is a body and half a dozen things worn, each with its own
// picture (human-mesh.js). A street has hundreds of people on it, and that
// many pictures and that many meshes each would stop it. So for the street a
// person is made twice more: once in a few thousand points with everything
// they wear, for the near side of the street, and once with coarser versions of the same
// garments and hair for the far side. Personal textures fit in one small atlas.
// Clothes sample their shared original pictures, so prints, stitching and
// uniform badges keep their detail in the same instanced draw.
//
// This runs in the worker (it reads pictures with createImageBitmap and
// paints on an OffscreenCanvas); people-figures.js draws what it makes.
import { fitCyclist } from './cycling.js';
import { Matrix4, Quaternion, Vector3 } from './vendor/three.module.min.js';
import { qmul, qinv, qrot } from './body.js';
import { FURNITURE_CLIPS, sheetSeats } from './seating.js';
import { fitPose, gripOffsetFor, walkClip } from './body-motion.js';
import { fingerPose } from './hand-poses.js';
import { lookOf, sharesGarmentDye } from './human-looks.js';

export const ATLAS = 512, SHEET_FPS = 15;
/** The movements people on the street may be seen in. */
export const STREET_CLIPS = ['idle', 'walk', 'jog', 'sprint', 'sit', ...FURNITURE_CLIPS, 'sitTalk', 'talk', 'hitChest', 'hitHead', 'death', 'guard', ...new Set([...handStrikes,...closeStrikes,...movingStrikes]), ...standingKicks, 'foldBack','reelLeft','reelRight', 'fall', 'flinch', 'knocked', 'lying', 'getUp', 'stumble', 'handsUp', 'cower', 'kneel', 'cuffed', 'cuffing', 'cycle', 'cycleStop', 'horseRide', 'motorRide', 'stretch', 'rowCable', 'cutHair', 'curlWeight', 'giveCash', 'strum', 'aim', 'shoot', 'thrown', 'drive', 'reach', 'pickUp', 'crouch'];

/** Keep body columns first and append the three joints of every digit. */
export function streetBones(bones) {
  const body=[],fingers=[];
  bones.forEach((bone,i)=>{
    if(/^(index|middle|ring|pinky|thumb)_/.test(bone.name))fingers.push(i);
    else body.push(i);
  });
  const kept=[...body,...fingers],compact=new Int16Array(bones.length);
  kept.forEach((id,column)=>{compact[id]=column;});
  return {kept,compact};
}
/** Where each movement's frames are in a sheet of poses: Map of id to { first, count, loop, seconds }, and how many frames in all. */
export function sheetRows(motion, clips = STREET_CLIPS) {
  const rows = new Map(); let frames = 0;
  const carried = new Set(['strum','crouch','reach','talk','pickUp','idle','walk','jog','sprint',...FURNITURE_CLIPS]);
  for (const id of clips) {
    const clip=motion.clip(id), kinds=carried.has(id)?[null,'cup','tray']:id==='drive'?[null,'cup']:[null];
    if(sheetSeats[id])kinds.push('fork');
    for(const carry of kinds){
      const fps=carry==='fork'?8:SHEET_FPS;
      const count=Math.max(2,Math.round(clip.seconds*fps)+(clip.loop?0:1));
      rows.set(carry ? carry+'/'+id : id, { id, carry, first:frames, count, loop:clip.loop, seconds:clip.seconds });
      frames += count;
    }
  }
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
export function poseSheet(motion, rig, clips = STREET_CLIPS, walkStyle) {
  const { kept } = streetBones(motion.bones), { rows, frames } = sheetRows(motion, clips), wide = kept.length * 3, out = new Uint16Array(wide * frames * 4);
  const pose = motion.newPose(), fitted = { q: [], pelvis: [0, 0, 0] }, world = [];
  const palms = new Float32Array(frames*3), hand = rig.index.get('hand_l');
  const shears=new Float32Array((rows.get('cutHair')?.count||0)*5);
  const across=new Vector3(),forward=new Vector3(),normal=new Vector3(),ring=new Vector3(),thumb=new Vector3();
  const basis=new Matrix4(),turn=new Quaternion();
  const offsets = new Map([null,'cup','tray','fork'].map(kind=>[kind,gripOffsetFor(rig,kind)]));
  for (const row of rows.values()) for (let f = 0; f < row.count; f++) {
    motion.sample(row.id==='walk'?walkClip(walkStyle):row.id, f * row.seconds / (row.loop ? row.count : row.count-1), pose);
    const sip=sheetSeats[row.id] && (row.carry==='cup'||row.carry==='fork') ? Math.max(0,Math.sin(f/row.count*Math.PI*2-.8)) : 0;
    fitPose(motion, rig, pose, fitted, sheetSeats[row.id], row.carry,sip);
    if(row.id==='cycle' || row.id==='cycleStop')fitCyclist(rig,fitted,2*Math.PI*f/row.count,row.id==='cycleStop');
    const style={cutHair:'shears',giveCash:'pinch',curlWeight:'wrap',rowCable:'wrap',cycle:'wrap',cycleStop:'wrap'}[row.id];
    if(style){
      for(const side of ['l','r']){
        const grip=row.id==='cutHair' && side==='r'?'point':style;
        for(const [i,q] of fingerPose(rig,grip,side))fitted.q[i]=q.slice();
      }
      if(row.id==='cutHair'){
        const i=rig.index.get('thumb_02_l'),angle=.27*(1-Math.cos(2*Math.PI*f/row.count));
        fitted.q[i]=qmul(fitted.q[i],[Math.sin(angle/2),0,0,Math.cos(angle/2)]);
      }
    }
    rig.bones.forEach((bone, i) => {
      const t = i === motion.pelvis ? fitted.pelvis : bone.t;
      if (bone.parent < 0) { world[i] = { p: t, q: fitted.q[i] }; return; }
      const parent = world[bone.parent], r = qrot(parent.q, t);
      world[i] = { p: [parent.p[0] + r[0], parent.p[1] + r[1], parent.p[2] + r[2]], q: qmul(parent.q, fitted.q[i]) };
    });
    const wrist = world[hand], offset = qrot(wrist.q,offsets.get(row.carry));
    for (let axis=0; axis<3; axis++) palms[(row.first+f)*3+axis] = wrist.p[axis]+offset[axis];
    if(['giveCash','curlWeight'].includes(row.id)){
      const index=world[rig.index.get('index_03_l')],thumb=world[rig.index.get('thumb_03_l')];
      for(let axis=0;axis<3;axis++)palms[(row.first+f)*3+axis]=(index.p[axis]+thumb.p[axis])*.5;
    }
    if(row.id==='cutHair'){
      // The two bows receive the thumb and ring finger. Recover the hinge
      // and each blade angle from their current separation and index direction.
      ring.fromArray(world[rig.index.get('ring_03_l')].p);
      thumb.fromArray(world[rig.index.get('thumb_03_l')].p);
      across.subVectors(thumb,ring);
      const spread=Math.asin(Math.min(.91,across.length()/(2*Math.hypot(.056,.006))))-Math.atan2(.006,.056);
      across.normalize();
      forward.fromArray(world[rig.index.get('index_03_l')].p).sub(new Vector3(...wrist.p));
      normal.crossVectors(forward,across).normalize();
      forward.crossVectors(across,normal).normalize();
      turn.setFromRotationMatrix(basis.makeBasis(across,normal,forward)).toArray(shears,f*5);
      shears[f*5+4]=spread;
      ring.lerp(thumb,.5).addScaledVector(forward,.056*Math.cos(spread)-.006*Math.sin(spread)).toArray(palms,(row.first+f)*3);
    }
    kept.forEach((bone, k) => {
      const bind = rig.bind[bone], q = qmul(world[bone].q, qinv(bind.q)), moved = qrot(q, bind.p), [x, y, z, w] = q, at = ((row.first + f) * wide + k * 3) * 4;
      const m = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), world[bone].p[0] - moved[0], 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), world[bone].p[1] - moved[1], 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), world[bone].p[2] - moved[2]];
      for (let j = 0; j < 12; j++) out[at + j] = half(m[j]);
    });
  }
  return { poses: out, palms, shears, wide, frames };
}

// --- The atlas ---------------------------------------------------------------------------------------
// Where each kind of thing goes in it, in pixels: [x, y, width, height]. Skin has most of it; what is left over is shared out.
const CELLS = { skin: [0, 0, 320, 320], top: [320, 0, 192, 192], bottom: [320, 192, 192, 160], hair: [0, 320, 192, 192], shoes: [192, 320, 128, 128], eyes: [192, 448, 64, 64], brows: [256, 448, 64, 64] };
const SPARE = [[320, 352, 96, 96], [416, 352, 96, 96], [320, 448, 64, 64], [384, 448, 64, 64]];
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
 * { remap(u, v) → [u, v] in the atlas }.
 */
async function atlasFor(pieces, look, base) {
  const canvas = new OffscreenCanvas(ATLAS, ATLAS), context = canvas.getContext('2d', { willReadFrequently: true }), placed = new Map();
  context.fillStyle = '#808080'; context.fillRect(0, 0, ATLAS, ATLAS);
  let spare = 0;
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
    for (let i = 0; i < px.length; i += 4) {
      let r = linear[px[i]], g = linear[px[i + 1]], b = linear[px[i + 2]];
      if (tone) { r *= tone[0]; g *= tone[1]; b *= tone[2]; }
      else if (keyed) { const shade = Math.min(2.6, ((.2126 * r + .7152 * g + .0722 * b) / mean) ** .8); r = keyed[0] * shade; g = keyed[1] * shade; b = keyed[2] * shade; }
      px[i] = encode(r); px[i + 1] = encode(g); px[i + 2] = encode(b);
      if (solid) px[i + 3] = 255;
    }
    context.putImageData(data, x, y);
    placed.set(key, { cell:rect, remap:(u,v)=>[(x+(u-u0)/(u1-u0)*w)/ATLAS, (y+(v1-v)/(v1-v0)*h)/ATLAS] });
  }
  return { bitmap: canvas.transferToImageBitmap(), place: piece => placed.get(piece.kind + '/' + piece.id) };
}

/** Pack the dressed mesh, collapsing nearby corners on the far LOD. Keep a
 * separate grid per piece, UV neighbourhood and dominant bone so a jacket
 * retains its hem, the shoes retain their soles and joints still articulate. */
function merged(pieces, atlas, clothing, fittedBelt, distant=false, rig=null) {
  const position=[], normal=[], uv=[], cloth=[], skinIndex=[], skinWeight=[], index=[];
  const handBones=new Set(rig?.bones.flatMap((b,i)=>/^(lowerarm|hand|thumb|index|middle|ring|pinky)_/.test(b.name)?[i]:[]));
  for (const piece of pieces) {
    const placed=atlas.place(piece);
    const layer=clothing.get(piece) || 0;
    if (!placed && !layer) continue;
    const cells=new Map(), remap=new Int32Array(piece.position.length/3).fill(-1);
    // A jacket closing over a separate equipment belt needs a closer fit at the waist.
    // Keep the close skin continuous across the wrist. Cluster its other
    // surfaces more finely than the distant mesh, preserving UV seams.
    const closeSkin=rig && piece.kind==='skin';
    const cellSize=closeSkin ? .014 : (piece.kind==='garment' ? .048 : .027) * (fittedBelt ? .55 : 1);
    const uvGrid=closeSkin?48:piece.kind==='uniform'?128:8;
    function corner(i) {
      if (remap[i]>=0) return remap[i];
      const p=i*3, u=i*2, b=i*4;
      const [x,y,z]=piece.position.subarray(p,p+3);
      let key;
      const cluster=distant || (closeSkin && !handBones.has(piece.skinIndex[b]));
      if (cluster) {
        key=[Math.round(x/cellSize),Math.round(y/cellSize),Math.round(z/cellSize),
          Math.floor(piece.uv[u]*uvGrid),Math.floor(piece.uv[u+1]*uvGrid),piece.skinIndex[b]].join(',');
        const existing=cells.get(key);
        if (existing!==undefined) return remap[i]=existing;
      }
      const vertex=position.length/3;
      position.push(x,y,z); normal.push(...piece.normal.subarray(p,p+3));
      skinIndex.push(...piece.skinIndex.subarray(b,b+4)); skinWeight.push(...piece.skinWeight.subarray(b,b+4));
      if (layer) uv.push(piece.uv[u],piece.uv[u+1]);
      else uv.push(...placed.remap(piece.uv[u],piece.uv[u+1]));
      cloth.push(layer);
      if (cluster) cells.set(key,vertex);
      return remap[i]=vertex;
    }
    for (let t=0;t<piece.index.length;t+=3) {
      const a=corner(piece.index[t]), b=corner(piece.index[t+1]), c=corner(piece.index[t+2]);
      if (a!==b && b!==c && a!==c) index.push(a,b,c);
    }
  }
  return {position:Float32Array.from(position), normal:Float32Array.from(normal), uv:Float32Array.from(uv), cloth:Uint8Array.from(cloth),
    skinIndex:Uint8Array.from(skinIndex), skinWeight:Float32Array.from(skinWeight), index:position.length/3>65535 ? Uint32Array.from(index) : Uint16Array.from(index)};
}

// Layer zero belongs to the personal atlas. Positive layer IDs index the
// wardrobe in the same order in each LOD and in its material.
export function streetWardrobe(pieces, design, look, base) {
  const textureUrl=name=>name && new URL('tex/'+name,new URL(base,import.meta.url)).href;
  const wardrobe=[], clothing=new Map();
  const top=pieces.find(p=>p.id===(design.top || 'male_casualsuit04-top'));
  const bottom=pieces.find(p=>p.id===(design.bottom || 'male_casualsuit04-bottom'));
  for(const piece of pieces){
    if(!piece.map || piece.clear || !['garment','suit','uniform','shoes','hat'].includes(piece.kind))continue;
    const colour=look.colours[piece.kind+'/'+piece.id];
    const slot=sharesGarmentDye(piece,top)?'top':sharesGarmentDye(piece,bottom)?'bottom':null;
    const tint=piece.fixedColour ? null : slot || (colour?'fixed':null);
    wardrobe.push({map:textureUrl(piece.map),normalMap:textureUrl(piece.normalMap),
      tint,colour,shade:piece.shade,dyeBase:piece.dyeBase,roughness:piece.kind==='shoes' ? .5 : .85});
    clothing.set(piece,wardrobe.length);
  }
  return {wardrobe,clothing};
}

/**
 * Somebody for the street. Returns { near, far, atlas, poses, wide, frames, height, transfer }:
 * two meshes, their textures, and every frame of every street movement for their skeleton.
 */
export async function streetFigure(human, motion, design, base) {
  const dressed = lookOf(design, human), wear = dressed.wear.filter(key => !/^(lashes|teeth)\//.test(key));
  const near = human.build({ ...design, wear }, { detail: 'near' });
  const {wardrobe,clothing}=streetWardrobe(near.pieces,design,dressed.look,base);
  const atlas = await atlasFor(near.pieces.filter(p=>!clothing.has(p)), dressed.look, base);
  const close=human.build({...design,wear},{detail:'close',skinOnly:true}).pieces.find(p=>p.kind==='skin');
  const nearParts=near.pieces.map(p=>p.kind==='skin'?close:p);
  const fittedBelt=near.pieces.some(p=>p.kind==='uniform');
  const a = merged(nearParts, atlas, clothing, fittedBelt,false,near.rig), b = merged(near.pieces, atlas, clothing, fittedBelt,true), sheet = poseSheet(motion, near.rig, STREET_CLIPS, design.walkStyle);
  return { near: a, far: b, atlas: atlas.bitmap, ...sheet, wardrobe, height: near.height,
    transfer: [atlas.bitmap, sheet.poses.buffer, sheet.palms.buffer, sheet.shears.buffer, ...[a, b].flatMap(mesh => [mesh.position.buffer, mesh.normal.buffer, mesh.uv.buffer, mesh.cloth.buffer, mesh.skinIndex.buffer, mesh.skinWeight.buffer, mesh.index.buffer])] };
}
