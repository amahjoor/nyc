#!/usr/bin/env node
// Bake the figures the crowd is drawn with.
//
// The bodies and their walk are Quaternius's Universal Base Characters and
// Universal Animation Library (CC0), unpacked under assets-src/characters.
// A crowd of hundreds cannot each carry a 65-bone skeleton, so this script
// poses each body at every frame of the walk here, thins it by merging
// vertices that share a small cell, and writes where every vertex is at
// every frame. The game then moves vertices by looking them up.
//
// usage: node scripts/build-people.mjs [--cell 0.03] [--frames 24]
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('../assets-src/characters/', import.meta.url).pathname;
const BODIES = [
  { id: 'man', file: 'Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf', height: 1.76 },
  { id: 'woman', file: 'Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf', height: 1.64 },
];
const LIBRARY = 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb';
const argument = (name, fallback) => process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : fallback;
const CELL = argument('--cell', .03), FRAMES = argument('--frames', 24);

// --- glTF, as much of it as is needed ------------------------------------------
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, TYPE = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
function open(path) {
  const data = readFileSync(SOURCE + path);
  if (data.readUInt32LE(0) === 0x46546c67) {
    const length = data.readUInt32LE(12), json = JSON.parse(data.subarray(20, 20 + length).toString()), start = 20 + length + 8;
    return { json, buffers: [data.subarray(start, start + data.readUInt32LE(20 + length))] };
  }
  const json = JSON.parse(data.toString()), folder = path.slice(0, path.lastIndexOf('/') + 1);
  return { json, buffers: json.buffers.map(buffer => readFileSync(SOURCE + folder + decodeURIComponent(buffer.uri))) };
}
function read({ json, buffers }, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView], size = SIZE[accessor.type], Type = TYPE[accessor.componentType];
  const buffer = buffers[view.buffer], offset = buffer.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || size * Type.BYTES_PER_ELEMENT;
  const out = new Array(accessor.count), dataView = new DataView(buffer.buffer, offset);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[accessor.componentType];
  const norm = accessor.normalized ? { 5121: 255, 5123: 65535 }[accessor.componentType] : 0;
  for (let i = 0; i < accessor.count; i++) { const row = new Array(size); for (let k = 0; k < size; k++) { const value = dataView[get](i * stride + k * Type.BYTES_PER_ELEMENT, true); row[k] = norm ? value / norm : value; } out[i] = size === 1 ? row[0] : row; }
  return out;
}

// --- Matrices, column-major as glTF writes them -----------------------------------
const multiply = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const compose = (t, q, s) => { const [x, y, z, w] = q; return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
  2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; };
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const slerp = (a, b, t) => { let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const sign = dot < 0 ? -1 : 1; dot = Math.abs(dot); let wa = 1 - t, wb = t; if (dot < .9995) { const angle = Math.acos(dot); wa = Math.sin((1 - t) * angle) / Math.sin(angle); wb = Math.sin(t * angle) / Math.sin(angle); } const q = a.map((value, i) => value * wa + b[i] * wb * sign), length = Math.hypot(...q); return q.map(value => value / length); };

// --- The walk, and standing ----------------------------------------------------------
const library = open(LIBRARY);
function clip(name) {
  const animation = library.json.animations.find(item => item.name === name), tracks = new Map(); let duration = 0;
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler], times = read(library, sampler.input), values = read(library, sampler.output), bone = library.json.nodes[channel.target.node].name;
    if (!tracks.has(bone)) tracks.set(bone, {});
    tracks.get(bone)[channel.target.path] = { times, values }; duration = Math.max(duration, times.at(-1));
  }
  const at = (track, time, rotation) => { const { times, values } = track; let i = 0; while (i + 1 < times.length && times[i + 1] <= time) i++; if (i + 1 >= times.length) return values[i]; const t = (time - times[i]) / (times[i + 1] - times[i] || 1); return rotation ? slerp(values[i], values[i + 1], t) : values[i].map((value, k) => value + (values[i + 1][k] - value) * t); };
  return { duration, pose: (bone, path, time) => { const track = tracks.get(bone)?.[path]; return track ? at(track, time, path === 'rotation') : null; } };
}
const walk = clip('Walk_Loop'), idle = clip('Idle_Loop'), sitting = clip('Sitting_Idle_Loop');

// What each bone's skin is painted as: 0 skin, 1 top, 2 bottom, 3 hair, 4 shoe; and which part goes bare in short sleeves (1) or shorts (2).
const paintOf = bone => /^(foot|ball)/.test(bone) ? [4, 0] : /^calf/.test(bone) ? [2, 2] : /^(pelvis|thigh)/.test(bone) ? [2, 0] : /^lowerarm/.test(bone) ? [1, 1] : /^(spine|clavicle|upperarm|root)/.test(bone) ? [1, 0] : [0, 0];

const figures = [], poses = [];
for (const body of BODIES) {
  const model = open(body.file), { json } = model, skin = json.skins[0], bones = skin.joints.map(node => json.nodes[node].name), inverse = read(model, skin.inverseBindMatrices);
  const parent = new Map(); json.nodes.forEach((node, i) => (node.children || []).forEach(child => parent.set(child, i)));
  // Every skinned part but the eyes and brows, which are a few pixels at any distance a crowd is seen from.
  const vertices = [], triangles = [];
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    if (/^Face/.test(mesh.name)) continue;
    const base = vertices.length, position = read(model, primitive.attributes.POSITION), joints = read(model, primitive.attributes.JOINTS_0), weights = read(model, primitive.attributes.WEIGHTS_0), index = read(model, primitive.indices);
    position.forEach((p, i) => vertices.push({ p, joints: joints[i], weights: weights[i] }));
    for (let i = 0; i < index.length; i += 3) triangles.push([base + index[i], base + index[i + 1], base + index[i + 2]]);
  }
  // Thin it: vertices that share a cell of the bind pose become the first of them.
  const cells = new Map(), kept = [], remap = vertices.map(vertex => { const key = vertex.p.map(value => Math.round(value / CELL)).join(','); if (!cells.has(key)) { cells.set(key, kept.length); kept.push(vertex); } return cells.get(key); });
  const faces = triangles.map(face => face.map(i => remap[i])).filter(([a, b, c]) => a !== b && b !== c && a !== c);
  const skinned = (time, still = idle) => {
    const world = new Map(), matrix = node => {
      if (world.has(node)) return world.get(node);
      const { name, translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1] } = json.nodes[node], motion = time === null ? still : walk, at = time === null ? 0 : time;
      // The walk is on the spot: the root stays where it is.
      const t = name === 'root' ? translation : motion.pose(name, 'translation', at) || translation, local = compose(t, motion.pose(name, 'rotation', at) || rotation, motion.pose(name, 'scale', at) || scale);
      const result = parent.has(node) ? multiply(matrix(parent.get(node)), local) : local; world.set(node, result); return result;
    };
    const palette = skin.joints.map((node, i) => multiply(matrix(node), inverse[i]));
    return kept.map(({ p, joints, weights }) => { const out = [0, 0, 0]; let total = 0; for (let k = 0; k < 4; k++) if (weights[k] > 0) { const moved = apply(palette[joints[k]], p); out[0] += moved[0] * weights[k]; out[1] += moved[1] * weights[k]; out[2] += moved[2] * weights[k]; total += weights[k]; } return out.map(value => value / (total || 1)); });
  };
  // The stride, then standing, then sitting on a chair.
  const frames = [...Array.from({ length: FRAMES }, (_, i) => skinned(walk.duration * i / FRAMES)), skinned(null), skinned(null, sitting)];
  // Stand it on the ground at its height, facing +Z.
  const standing = frames[FRAMES], low = Math.min(...standing.map(p => p[1])), high = Math.max(...standing.map(p => p[1])), scale = body.height / (high - low);
  const middle = [0, 2].map(axis => standing.reduce((sum, p) => sum + p[axis], 0) / standing.length);
  for (const frame of frames) { const floor = Math.min(...frame.map(p => p[1])); for (const p of frame) { p[0] = (p[0] - middle[0]) * scale; p[1] = (p[1] - Math.min(floor, low)) * scale; p[2] = (p[2] - middle[1]) * scale; } }
  // Paint by the bone that moves each vertex most; the crown and back of the head is hair.
  const headTop = body.height, tags = kept.map(({ joints, weights }, i) => {
    const bone = bones[joints[weights.indexOf(Math.max(...weights))]], [paint, bare] = paintOf(bone), [, y, z] = frames[FRAMES][i];
    const hair = paint === 0 && /^(Head|neck)/.test(bone) && y > headTop - .2 && (y > headTop - .075 || z < -.005 * (headTop - y) * 40);
    return [hair ? 3 : paint, bare];
  });
  figures.push({ id: body.id, height: body.height, vertices: kept.length, faces: faces.flat(), paint: tags.map(tag => tag[0]), bare: tags.map(tag => tag[1]), first: poses.length / 3 / (FRAMES + 2) });
  for (const frame of frames) for (const p of frame) poses.push(...p);
  console.log(`${body.id}: ${vertices.length} vertices thinned to ${kept.length}, ${faces.length} triangles, ${(high - low).toFixed(2)} m tall as modelled`);
}
// Poses are written frame by frame for each figure in turn, in sixteenths of a millimetre.
const packed = new Int16Array(poses.length);
for (let i = 0; i < poses.length; i++) packed[i] = Math.max(-32767, Math.min(32767, Math.round(poses[i] * 16000)));
writeFileSync(new URL('../dist/people.bin', import.meta.url), Buffer.from(packed.buffer));
writeFileSync(new URL('../dist/people.json', import.meta.url), JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), units: 'poses are x, y, z per vertex per frame, 16000 to the metre; the frame after the stride of each figure is standing',
  source: { name: 'Universal Base Characters and Universal Animation Library', author: 'Quaternius', licence: 'CC0 1.0', url: 'https://quaternius.com' }, walkFrames: FRAMES, sitFrame: FRAMES + 1, frames: FRAMES + 2, strideSeconds: walk.duration, figures }));
console.log(`walk ${walk.duration.toFixed(2)} s in ${FRAMES} frames; ${(packed.byteLength / 1024).toFixed(0)} KB of poses`);
