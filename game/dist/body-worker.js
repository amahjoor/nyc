// Grows bodies off the main thread, so that the street does not stop while somebody is being made.
import { buildBody } from './body.js';

let motion = null;
self.onmessage = async ({ data: { id, design, detail } }) => {
  try {
    motion ||= await (await fetch(new URL('./motion.json', import.meta.url))).json();
    const built = buildBody(design, motion, { detail }), rig = plainRig(built.rig);
    const out = { id, position: built.position, normal: built.normal, colour: built.colour, paint: built.paint, blend: built.blend, skinIndex: built.skinIndex, skinWeight: built.skinWeight, index: built.index, rig, height: built.height };
    self.postMessage(out, [built.position.buffer, built.normal.buffer, built.colour.buffer, built.paint.buffer, built.blend.buffer, built.skinIndex.buffer, built.skinWeight.buffer, built.index.buffer]);
  } catch (error) { self.postMessage({ id, error: String(error?.message || error) }); }
};
/** A rig as plain values, which is all that can be sent between threads. */
function plainRig(rig) { return { bones: rig.bones, world: rig.world, scale: rig.scale, stride: rig.stride, spread: rig.spread, factor: rig.factor, height: rig.height }; }
