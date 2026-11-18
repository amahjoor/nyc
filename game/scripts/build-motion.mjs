#!/usr/bin/env node
// Bake the skeleton people are hung on, and the movements that were recorded for it.
//
// The bodies are the game's own (dist/body.js). The skeleton and the recorded
// movements are Quaternius's Universal Animation Library (CC0), unpacked under
// assets-src/characters: its mannequin's bones, as they stand at rest, and
// each bone's turn at every thirtieth of a second of each movement kept.
// Movements nobody recorded (a kick, a vault, a climb, a fall) are written by
// hand in dist/body-motion.js over the same bones.
//
// usage: node scripts/build-motion.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../assets-src/characters/', import.meta.url)) + 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb';
// What the game calls each movement, the library's name for it, and whether it runs round.
const CLIPS = [
  ['idle', 'Idle_Loop', true], ['walk', 'Walk_Loop', true], ['jog', 'Jog_Fwd_Loop', true], ['sprint', 'Sprint_Loop', true],
  ['jumpStart', 'Jump_Start', false], ['air', 'Jump_Loop', true], ['land', 'Jump_Land', false],
  ['jab', 'Punch_Jab', false], ['cross', 'Punch_Cross', false], ['roll', 'Roll', false],
  ['hitChest', 'Hit_Chest', false], ['hitHead', 'Hit_Head', false], ['death', 'Death01', false],
  ['drive', 'Driving_Loop', true], ['sit', 'Sitting_Idle_Loop', true], ['sitTalk', 'Sitting_Talking_Loop', true], ['talk', 'Idle_Talking_Loop', true],
  ['crouch', 'Crouch_Idle_Loop', true], ['crouchWalk', 'Crouch_Fwd_Loop', true], ['push', 'Push_Loop', true],
  ['reach', 'Interact', false], ['pickUp', 'PickUp_Table', false], ['dance', 'Dance_Loop', true],
  ['aim', 'Pistol_Idle_Loop', true], ['shoot', 'Pistol_Shoot', false], ['reload', 'Pistol_Reload', false],
];
const FPS = 30;

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const data = readFileSync(SOURCE), length = data.readUInt32LE(12), json = JSON.parse(data.subarray(20, 20 + length).toString());
const binary = data.subarray(20 + length + 8, 20 + length + 8 + data.readUInt32LE(20 + length));
function read(index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView], size = SIZE[accessor.type];
  if (accessor.componentType !== 5126) throw new Error('only floats are read here');
  const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || size * 4, out = new Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) { const row = new Array(size); for (let k = 0; k < size; k++) row[k] = binary.readFloatLE(offset + i * stride + k * 4); out[i] = size === 1 ? row[0] : row; }
  return out;
}
const slerp = (a, b, t) => { let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const sign = dot < 0 ? -1 : 1; dot = Math.abs(dot); let wa = 1 - t, wb = t; if (dot < .9995) { const angle = Math.acos(dot); wa = Math.sin((1 - t) * angle) / Math.sin(angle); wb = Math.sin(t * angle) / Math.sin(angle); } const q = a.map((value, i) => value * wa + b[i] * wb * sign), n = Math.hypot(...q); return q.map(value => value / n); };

// --- The bones: the skin's joints without the tips that only mark where a finger or a toe ends.
const parentOf = new Map(); json.nodes.forEach((node, i) => (node.children || []).forEach(child => parentOf.set(child, i)));
const joints = json.skins[0].joints.filter(node => !/_leaf/.test(json.nodes[node].name));
// Parents before children.
const depth = node => parentOf.has(node) ? depth(parentOf.get(node)) + 1 : 0;
joints.sort((a, b) => depth(a) - depth(b) || json.nodes[a].name.localeCompare(json.nodes[b].name));
const indexOf = new Map(joints.map((node, i) => [node, i]));
const round = (values, places) => values.map(value => Number(value.toFixed(places)));
const bones = joints.map(node => {
  const { name, translation = [0, 0, 0], rotation = [0, 0, 0, 1] } = json.nodes[node];
  return { name, parent: indexOf.has(parentOf.get(node)) ? indexOf.get(parentOf.get(node)) : -1, t: round(translation, 5), q: round(rotation, 6) };
});
const pelvis = bones.findIndex(bone => bone.name === 'pelvis');

// --- The movements: each bone's turn, and where the pelvis is, thirty times a second.
const clips = [], words = [];
for (const [id, name, loop] of CLIPS) {
  const animation = json.animations.find(item => item.name === name);
  if (!animation) throw new Error(`the library has no ${name}`);
  const tracks = new Map(); let duration = 0;
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler], times = read(sampler.input), values = read(sampler.output);
    tracks.set(channel.target.node + channel.target.path, { times, values }); duration = Math.max(duration, times.at(-1));
  }
  const at = (track, time, turn) => { const { times, values } = track; let i = 0; while (i + 1 < times.length && times[i + 1] <= time) i++; if (i + 1 >= times.length) return values[i]; const t = (time - times[i]) / (times[i + 1] - times[i] || 1); return turn ? slerp(values[i], values[i + 1], t) : values[i].map((value, k) => value + (values[i + 1][k] - value) * t); };
  // A movement that runs round ends on the frame it began with, which is not stored twice.
  const frames = Math.max(1, Math.round(duration * FPS) + (loop ? 0 : 1));
  clips.push({ id, source: name, loop, frames, seconds: Number((loop ? frames / FPS : (frames - 1) / FPS).toFixed(4)), first: words.length });
  for (let f = 0; f < frames; f++) {
    const time = Math.min(duration, f / FPS), place = tracks.get(joints[pelvis] + 'translation');
    const p = place ? at(place, time, false) : bones[pelvis].t;
    words.push(...p.map(value => Math.round(value * 16000)));
    joints.forEach((node, i) => { const track = tracks.get(node + 'rotation'), q = track ? at(track, time, true) : bones[i].q; words.push(...q.map(value => Math.round(value * 32767))); });
  }
}
const packed = Int16Array.from(words);
writeFileSync(new URL('../dist/motion.bin', import.meta.url), Buffer.from(packed.buffer));
writeFileSync(new URL('../dist/motion.json', import.meta.url), JSON.stringify({
  version: 1, generated: new Date().toISOString().slice(0, 10), fps: FPS,
  units: 'each frame is the pelvis\'s place (x, y, z; 16000 to the metre, in its parent\'s space) and then each bone\'s turn in its parent\'s space (x, y, z, w; 32767 to one), bones in the order listed',
  source: { name: 'Universal Animation Library', author: 'Quaternius', licence: 'CC0 1.0', url: 'https://quaternius.com' },
  bones, clips,
}));
console.log(`${bones.length} bones, ${clips.length} movements, ${clips.reduce((sum, clip) => sum + clip.frames, 0)} frames, ${(packed.byteLength / 1024).toFixed(0)} KB`);
