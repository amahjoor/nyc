// Makes people off the main thread, so that the street does not stop while somebody is being made.
import { loadHuman } from './human.js';
import { lookOf } from './human-looks.js';
import { designOf } from './human-cast.js';
import { streetFigure } from './human-crowd.js';
import { createMotion } from './body-motion.js';
import { writeMovements } from './body-moves.js';

const BASE = new URL('./human/', import.meta.url).href;
let ready = null;
async function load() {
  const meta = await (await fetch(new URL('./motion.json', import.meta.url))).json();
  const [human, words] = await Promise.all([loadHuman(meta, BASE), fetch(new URL('./motion.bin', import.meta.url)).then(response => response.arrayBuffer())]);
  return { human, motion: writeMovements(createMotion(meta, new Int16Array(words))) };
}
/** A rig as plain values, which is all that can be sent between threads. */
const plain = rig => ({ bones: rig.bones, world: rig.world, bind: rig.bind, scale: rig.scale, stride: rig.stride, spread: rig.spread, factor: rig.factor, lift: rig.lift, height: rig.height });

// { id, design | member, detail }: 'close' is somebody at arm's length; 'street' is the same person for across the street (human-crowd.js).
self.onmessage = async ({ data: { id, design, member, detail } }) => {
  try {
    const { human, motion } = await (ready ||= load());
    const who = design || designOf(member, human);
    if (detail === 'street') { const { transfer, ...figure } = await streetFigure(human, motion, who, BASE); self.postMessage({ id, ...figure }, transfer); return; }
    const dressed = lookOf(who, human), built = human.build({ ...who, wear: dressed.wear }, { detail });
    const buffers = built.pieces.flatMap(piece => [piece.position.buffer, piece.normal.buffer, piece.uv.buffer, piece.skinIndex.buffer, piece.skinWeight.buffer, piece.index.buffer]);
    self.postMessage({ id, pieces: built.pieces, rig: plain(built.rig), height: built.height, marks: built.marks, look: dressed.look }, buffers);
  } catch (error) { self.postMessage({ id, error: String(error?.stack || error?.message || error) }); }
};
