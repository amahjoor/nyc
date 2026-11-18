// The people of the street, drawn.
//
// Each of the cast (body-designs.js) is grown once as a body (body.js) and
// drawn as many times as there are people who look like that, each in their
// own colours and each in their own pose. A pose is not sent per person: every
// frame of every movement is worked out once for each build of skeleton and
// kept in a texture, and a person says only which two frames they are between.
import * as THREE from './vendor/three.module.min.js';
import { qmul, qinv, qrot, PAINT, createBodyShop } from './body.js';
import { FURNITURE_CLIPS, sheetSeats } from './seating.js';
import { fitPose } from './body-motion.js';
import { CAST } from './body-designs.js';

/** The movements people on the street may be seen in. */
export const STREET_CLIPS = ['idle', 'walk', 'jog', 'sprint', 'sit', ...FURNITURE_CLIPS, 'sitTalk', 'talk', 'hitChest', 'hitHead', 'death', 'guard', 'jab', 'cross', 'kick', 'flinch', 'knocked', 'lying', 'getUp', 'stumble', 'handsUp', 'cower', 'kneel', 'cuffed', 'cuffing', 'aim', 'shoot', 'thrown', 'drive', 'reach', 'pickUp', 'crouch'];
const FPS = 30, PAINTS = 18, SHEETS = 16, NEAR = 26;
const hexToBytes = (hex, out, at) => { const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16) || 0; out[at] = n >> 16 & 255; out[at + 1] = n >> 8 & 255; out[at + 2] = n & 255; out[at + 3] = 255; };

/** What a look is painted, as bytes for each kind of paint. `look` has skin, hair, top, bottom and may have coat, shoe, sole, hat, trim, sock, eyes. */
export function paletteOf(look) {
  if (look._paints) return look._paints;
  const out = new Uint8Array(PAINTS * 4), set = (paint, hex) => hexToBytes(hex, out, paint * 4), mixHex = (a, b, t) => { const p = new Uint8Array(8); hexToBytes(a, p, 0); hexToBytes(b, p, 4); return (Math.round(p[0] + (p[4] - p[0]) * t) << 16) | (Math.round(p[1] + (p[5] - p[1]) * t) << 8) | Math.round(p[2] + (p[6] - p[2]) * t); };
  set(PAINT.skin, look.skin ?? 0xb98563); set(PAINT.top, look.top ?? 0xd7d4cc); set(PAINT.bottom, look.bottom ?? 0x27364f); set(PAINT.hair, look.hair ?? 0x1c1512);
  set(PAINT.shoe, look.shoe ?? 0x2a2a2e); set(PAINT.coat, look.coat ?? look.top ?? 0x2b2d31); set(PAINT.hat, look.hat ?? look.coat ?? 0x1d2a44); set(PAINT.sole, look.sole ?? 0xdedcd6);
  set(PAINT.lip, mixHex(look.skin ?? 0xb98563, 0x8a2f35, .45)); set(PAINT.white, 0xe9e6e1); set(PAINT.iris, look.eyes ?? 0x3a2a1c); set(PAINT.pupil, 0x050505); set(PAINT.brow, look.hair ?? 0x1c1512);
  set(PAINT.trim, look.trim ?? 0x1c1d21); set(PAINT.sock, look.sock ?? 0xe6e4de); set(PAINT.nail, look.skin ?? 0xb98563); set(PAINT.frame, 0x111113);
  Object.defineProperty(look, '_paints', { value: out, enumerable: false });
  return out;
}

const SKIN_GLSL = /* glsl */`
attribute vec4 aBone;
attribute vec4 aAnim;
uniform sampler2D uNycPoses;
mat4 nycSkin;
mat4 nycBone( float bone, float row ) {
	int x = int( bone + 0.5 ) * 3, y = int( row + 0.5 );
	vec4 a = texelFetch( uNycPoses, ivec2( x, y ), 0 ), b = texelFetch( uNycPoses, ivec2( x + 1, y ), 0 ), c = texelFetch( uNycPoses, ivec2( x + 2, y ), 0 );
	return mat4( a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0 );
}
void nycPose() {
	// aBone: two bones (already moved along to this build's sheet) and the first one's share. aAnim: the two frames this person is between, and how far.
	float other = 1.0 - aBone.z;
	mat4 from = nycBone( aBone.x, aAnim.x ) * aBone.z + nycBone( aBone.y, aAnim.x ) * other;
	mat4 to = nycBone( aBone.x, aAnim.y ) * aBone.z + nycBone( aBone.y, aAnim.y ) * other;
	nycSkin = from + ( to - from ) * aAnim.z;
}`;
function skinned(material, uniforms, coloured) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${SKIN_GLSL}\n${coloured ? 'attribute vec3 aPaint;\nuniform sampler2D uNycPalette;\nvarying vec3 vPerson;\n' : ''}${shader.vertexShader}`
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tnycPose();\n\tobjectNormal = mat3( nycSkin ) * objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n\t${coloured ? '' : 'nycPose();\n\t'}transformed = ( nycSkin * vec4( transformed, 1.0 ) ).xyz;${coloured ? '\n\t{ int row = int( aAnim.w + 0.5 ); vPerson = mix( texelFetch( uNycPalette, ivec2( int( aPaint.x + 0.5 ), row ), 0 ).rgb, texelFetch( uNycPalette, ivec2( int( aPaint.y + 0.5 ), row ), 0 ).rgb, aPaint.z ); }' : ''}`);
    if (coloured) shader.fragmentShader = `varying vec3 vPerson;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= vPerson;');
  };
  return material;
}

/**
 * `motion` is body-motion's library with the written movements in it; `meta` motion.json.
 * Returns the figures: ask(member) for one of the cast to be grown, ready(member), and
 * begin() / add(...) / end() each frame to say who is where.
 */
export function createFigures({ motion, meta, capacity = 320, scene = null, clips = STREET_CLIPS, cast = CAST, worker = true } = {}) {
  // The bones a body seen from the street bends at: fingers are left to the hand.
  const kept = [], compact = new Int16Array(motion.count).fill(-1);
  motion.bones.forEach((bone, i) => { if (!/^(index|middle|ring|pinky|thumb)_/.test(bone.name)) { compact[i] = kept.length; kept.push(i); } });
  motion.bones.forEach((bone, i) => { if (compact[i] < 0) { let up = bone.parent; while (compact[up] < 0) up = motion.bones[up].parent; compact[i] = compact[up]; } });
  // Where each movement's frames are in a sheet.
  const rows = new Map(); let frames = 0;
  for (const id of clips) { const clip = motion.clip(id), count = Math.max(1, Math.round(clip.seconds * FPS) + (clip.loop ? 0 : 1)); rows.set(id, { first: frames, count, loop: clip.loop, seconds: clip.seconds }); frames += count; }
  const sheetWide = kept.length * 3, poses = new Float32Array(sheetWide * SHEETS * frames * 4);
  const poseTexture = new THREE.DataTexture(poses, sheetWide * SHEETS, frames, THREE.RGBAFormat, THREE.FloatType);
  poseTexture.name = 'Every frame of every movement, for each build of skeleton'; poseTexture.magFilter = poseTexture.minFilter = THREE.NearestFilter; poseTexture.generateMipmaps = false;
  const paints = new Uint8Array(PAINTS * capacity * 4), paletteTexture = new THREE.DataTexture(paints, PAINTS, capacity, THREE.RGBAFormat, THREE.UnsignedByteType);
  paletteTexture.name = 'What each person is wearing'; paletteTexture.magFilter = paletteTexture.minFilter = THREE.NearestFilter; paletteTexture.generateMipmaps = false; paletteTexture.colorSpace = THREE.SRGBColorSpace;
  const uniforms = { uNycPoses: { value: poseTexture }, uNycPalette: { value: paletteTexture } };
  const material = skinned(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .82, metalness: 0 }), uniforms, true); material.name = 'People';
  const depth = skinned(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms, false);
  const group = new THREE.Group(); group.name = 'People'; scene?.add(group);

  // A sheet of poses for each build of skeleton: bodies that differ only in size share one.
  const sheets = new Map(), pose = motion.newPose(), fitted = { q: [], pelvis: [0, 0, 0] };
  const palms=[], hand=motion.index.get('hand_l');
  function sheetFor(rig) {
    const key = JSON.stringify([Object.values(rig.factor).map(value => Math.round(value * 200)), Math.round(rig.spread * 100)]);
    if (sheets.has(key)) return sheets.get(key);
    const sheet = Math.min(sheets.size, SHEETS - 1); sheets.set(key, sheet);
    const scale = rig.scale, rest = rig.world, world = [];
    const grips=palms[sheet]=new Float32Array(frames*3);
    for (const [id, row] of rows) for (let f = 0; f < row.count; f++) {
      motion.sample(id, f / FPS, pose); fitPose(motion, rig, pose, fitted, sheetSeats[id]);
      rig.bones.forEach((bone, i) => {
        const t = i === motion.pelvis ? fitted.pelvis : bone.t;
        if (bone.parent < 0) { world[i] = { p: t, q: fitted.q[i] }; return; }
        const parent = world[bone.parent], r = qrot(parent.q, t);
        world[i] = { p: [parent.p[0] + r[0], parent.p[1] + r[1], parent.p[2] + r[2]], q: qmul(parent.q, fitted.q[i]) };
      });
      if (id==='pickUp' || id==='reach') {
        const wrist=world[hand], fingers=qrot(wrist.q,[0,.075,0]);
        grips.set(wrist.p.map((v,i)=>(v+fingers[i])/scale),(row.first+f)*3);
      }
      kept.forEach((bone, k) => {
        // From where the bone rests to where it is: a turn, and then a move. Kept as the three rows of a matrix, for a body one unit of scale tall.
        const q = qmul(world[bone].q, qinv(rest[bone].q)), moved = qrot(q, rest[bone].p), [x, y, z, w] = q;
        const m = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), (world[bone].p[0] - moved[0]) / scale, 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), (world[bone].p[1] - moved[1]) / scale, 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), (world[bone].p[2] - moved[2]) / scale];
        poses.set(m, ((row.first + f) * sheetWide * SHEETS + sheet * sheetWide + k * 3) * 4);
      });
    }
    poseTexture.needsUpdate = true;
    return sheet;
  }

  const grow = createBodyShop(meta, { worker }), types = new Map();
  function geometryOf(built, sheet) {
    const count = built.position.length / 3, scale = built.rig.scale, position = new Float32Array(count * 3), bone = new Float32Array(count * 4), paint = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) position[i] = built.position[i] / scale;
    for (let i = 0; i < count; i++) {
      // The two bones with most say, their shares made to add to one.
      let a = 0, b = 1; const w = built.skinWeight, o = i * 4;
      for (let k = 1; k < 4; k++) if (w[o + k] > w[o + a]) a = k;
      b = a === 0 ? 1 : 0; for (let k = 0; k < 4; k++) if (k !== a && w[o + k] > w[o + b]) b = k;
      const total = w[o + a] + w[o + b] || 1;
      bone[o] = compact[built.skinIndex[o + a]] + sheet * kept.length; bone[o + 1] = compact[built.skinIndex[o + b]] + sheet * kept.length; bone[o + 2] = w[o + a] / total;
      paint[i * 3] = built.paint[i]; paint[i * 3 + 1] = built.blend[i * 2]; paint[i * 3 + 2] = built.blend[i * 2 + 1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(built.normal, 3));
    geometry.setAttribute('aBone', new THREE.BufferAttribute(bone, 4)); geometry.setAttribute('aPaint', new THREE.BufferAttribute(paint, 3)); geometry.setIndex(new THREE.BufferAttribute(built.index, 1));
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); anim.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('aAnim', anim);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = depth; group.add(mesh);
    return { mesh, anim, count: 0 };
  }
  /** Ask for one of the cast (its place in the list) to be grown. Returns whether it is ready to be drawn. */
  function ask(member) {
    const had = types.get(member);
    if (had) return had.ready;
    const entry = { ready: false, woman: cast[member].woman, child: cast[member].child, near: null, far: null, scale: 1, height: 1.7 }; types.set(member, entry);
    Promise.all([grow(cast[member].design, 'crowd'), grow(cast[member].design, 'distant')]).then(([near, far]) => {
      if (disposed) return;
      const sheet = sheetFor(near.rig);
      entry.near = geometryOf(near, sheet); entry.far = geometryOf(far, sheet); entry.near.mesh.name = `Person ${member}`; entry.far.mesh.name = `Person ${member}, far off`;
      entry.scale = near.rig.scale; entry.height = near.height; entry.sheet=sheet; entry.ready = true;
    }).catch(error => { console.warn('A body could not be grown:', error); });
    return false;
  }
  /** Someone of the cast who can be drawn now in place of one who cannot yet: the same sex and size where there is one. */
  function standIn(member) {
    const want = cast[member]; let fallback = -1;
    for (const [id, entry] of types) { if (!entry.ready) continue; if (entry.woman === want.woman && entry.child === want.child) return id; if (fallback < 0 && entry.child === want.child) fallback = id; }
    return fallback;
  }
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let drawn = 0, disposed = false, tilt = new THREE.Quaternion();
  /** The frame of a movement at a time, as a row of the pose texture. */
  const rowAt = (clip, time) => {
    const row = rows.get(clip) || rows.get('idle'), f = Math.floor(time * FPS);
    return row.first + (row.loop ? ((f % row.count) + row.count) % row.count : Math.max(0, Math.min(row.count - 1, f)));
  };
  return {
    group, material, rows, poseTexture, paletteTexture, types, ask, cast,
    ready: member => Boolean(types.get(member)?.ready),
    get anyReady() { for (const entry of types.values()) if (entry.ready) return true; return false; },
    seconds: clip => (rows.get(clip) || rows.get('idle')).seconds,
    // Use the same two pose frames, body scale and stand-in as the instance drawn below.
    palm(member, actor) {
      const entry=types.get(member)?.ready ? types.get(member) : types.get(standIn(member));
      const row=rows.get(actor.clip);
      if (!entry || !row) return null;
      const frame=Math.min(row.count-1,Math.max(0,actor.time*FPS)), a=(row.first+Math.floor(frame))*3;
      const b=(row.first+Math.min(row.count-1,Math.ceil(frame)))*3, t=frame%1;
      const points=palms[entry.sheet], scale=entry.scale*(actor.look.height||entry.height)/entry.height;
      const fade=actor.from ? actor.fade||0 : 0;
      const previous=fade ? rowAt(actor.from,actor.fromTime)*3 : a;
      const axis=i=>(fade ? points[a+i]*(1-fade)+points[previous+i]*fade : points[a+i]*(1-t)+points[b+i]*t)*scale;
      const x=axis(0), z=axis(2), sin=Math.sin(actor.heading), cos=Math.cos(actor.heading);
      return {x:actor.x+cos*x+sin*z,y:axis(1),z:actor.z-sin*x+cos*z};
    },
    begin() { drawn = 0; for (const entry of types.values()) if (entry.ready) entry.near.count = entry.far.count = 0; },
    /**
     * Draw one person: which of the cast, where, facing where, how tall, in what (`look`), `distance` from the eye,
     * and in what pose: movement `clip` at `time`, and while changing from another, `from` at `fromTime` with `fade` of it left (1 to 0).
     */
    add(member, x, y, z, heading, height, look, distance, clip, time, from = null, fromTime = 0, fade = 0, lean = 0) {
      if (drawn >= capacity) return false;
      if (!ask(member)) { member = standIn(member); if (member < 0) return false; }
      const entry = types.get(member), to = distance > NEAR ? entry.far : entry.near, at = to.count++, scale = entry.scale * (height || entry.height) / entry.height;
      place.set(x, y, z); turn.setFromAxisAngle(up, heading); if (lean) turn.multiply(tilt.setFromAxisAngle(place.set(1, 0, 0), lean)), place.set(x, y, z);
      size.set(scale, scale, scale); matrix.compose(place, turn, size); to.mesh.setMatrixAt(at, matrix);
      const a = rowAt(clip, time);
      if (from && fade > 0) to.anim.setXYZW(at, a, rowAt(from, fromTime), fade, drawn);
      else { const row = rows.get(clip) || rows.get('idle'), f = time * FPS, next = row.loop ? row.first + (((Math.floor(f) + 1) % row.count) + row.count) % row.count : Math.min(row.first + row.count - 1, a + 1); to.anim.setXYZW(at, a, next, f - Math.floor(f), drawn); }
      paints.set(paletteOf(look), drawn * PAINTS * 4); drawn++;
      return true;
    },
    end() {
      for (const entry of types.values()) if (entry.ready) for (const to of [entry.near, entry.far]) { to.mesh.count = to.count; if (to.count) { to.mesh.instanceMatrix.needsUpdate = true; to.anim.needsUpdate = true; } }
      paletteTexture.needsUpdate = true;
    },
    get drawn() { return drawn; },
    dispose() { disposed = true; grow.dispose(); for (const entry of types.values()) if (entry.ready) for (const to of [entry.near, entry.far]) { to.mesh.geometry.dispose(); to.mesh.dispose(); } material.dispose(); depth.dispose(); poseTexture.dispose(); paletteTexture.dispose(); group.removeFromParent(); },
  };
}
