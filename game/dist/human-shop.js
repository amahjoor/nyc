// Where people are made to order: in a worker where there is one, here otherwise.
import { loadHuman } from './human.js';
import { lookOf } from './human-looks.js';
import { designOf } from './human-cast.js';

/** A rig sent from the worker, made whole again. */
export function reviveRig(plain) {
  const index = new Map(plain.bones.map((bone, i) => [bone.name, i]));
  return { ...plain, index, at: name => plain.world[index.get(name)].p };
}
/**
 * Returns grow(design, detail) giving a promise of { pieces, rig, height, marks, look }:
 * what human.js builds for the design dressed as human-looks.js dresses it, and the colours
 * and pictures human-mesh.js needs to draw it. `motion` is dist/motion.json.
 */
export function createHumanShop(motion, { worker = true, base = new URL('./human/', import.meta.url).href } = {}) {
  let thread = null, next = 1, here = null; const waiting = new Map();
  const local = async (design, detail, member) => {
    const human = await (here ||= loadHuman(motion, base)), who = design || designOf(member, human), dressed = lookOf(who, human);
    // A street figure needs pictures cut and painted, which is the worker's work: without one there are none.
    if (detail === 'street') throw new Error('street figures are made in a worker');
    return { ...human.build({ ...who, wear: dressed.wear }, { detail }), look: dressed.look };
  };
  if (worker && typeof Worker !== 'undefined') {
    try {
      thread = new Worker(new URL('./human-worker.js', import.meta.url), { type: 'module' });
      thread.onmessage = ({ data }) => { const job = waiting.get(data.id); if (!job) return; waiting.delete(data.id); if (data.error) job.reject(new Error(data.error)); else job.resolve(data.rig ? { ...data, rig: reviveRig(data.rig) } : data); };
      thread.onerror = () => { for (const job of waiting.values()) local(job.design, job.detail, job.member).then(job.resolve, job.reject); waiting.clear(); thread = null; };
    } catch { thread = null; }
  }
  const ask = (design, member, detail) => {
    if (!thread) return local(design, detail, member);
    return new Promise((resolve, reject) => { const id = next++; waiting.set(id, { resolve, reject, design, member, detail }); thread.postMessage({ id, design, member, detail }); });
  };
  const grow = (design, detail = 'close') => ask(design, null, detail);
  /** One of the cast (human-cast.js), by number: 'close' as grow gives, or 'street' as human-crowd.js makes them. */
  grow.member = (member, detail = 'street') => ask(null, member, detail);
  grow.threaded = () => Boolean(thread);
  /** The figure itself (its dials, parts and skins), for whoever lists them. */
  grow.human = () => (here ||= loadHuman(motion, base));
  grow.dispose = () => { thread?.terminate(); thread = null; waiting.clear(); };
  return grow;
}
