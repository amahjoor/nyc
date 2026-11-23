// How people move.
//
// A pose is each bone's turn in its parent's space and where the pelvis is.
// Most movements here were recorded (scripts/build-motion.mjs bakes them from
// Quaternius's Universal Animation Library, CC0): thirty poses a second. The
// ones nobody recorded are written out below as a few poses each, in plain
// angles, and the frames between are worked out. An animator then decides,
// from what a person is doing, which movements to show and how much of each.
import { qmul, qinv, qrot, qaxis, qslerp, restWorld } from './body.js';
import { fingerPose, gripForItem, pinchOffset } from './hand-poses.js';
import { seatHeight, footHeight } from './seating.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = t => t * t * (3 - 2 * t);
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

// One cycle is two steps. During stance the ankle travels back at the same
// speed as the character travels forward. Both feet share weight at heel strike.
export const WALK_CLIP_SPEED=1.16;
export const WALK_STYLES=['natural','relaxed','purposeful'];
export const walkClip=style=>style==='relaxed'?'walkRelaxed':style==='purposeful'?'walkPurposeful':'walk';
export const strideFactor=style=>style==='relaxed'?.93:style==='purposeful'?1.08:1;
function plantWalkingFeet(motion,style){
  const walk=motion.clip('walk'), baked=[], stance=.55, travel=WALK_CLIP_SPEED*strideFactor(style)*walk.seconds;
  const energy=style==='relaxed'?-1:style==='purposeful'?1:0;
  const pitchOf=(a,b)=>Math.atan2(b[2]-a[2],a[1]-b[1]);
  for(let frame=0;frame<walk.frames;frame++){
    const phase=frame/walk.frames, pose=motion.sample('walk',phase*walk.seconds);
    const local=motion.bones.map((bone,i)=>({...bone,t:i===motion.pelvis ? pose.pelvis : bone.t,q:Array.from(pose.q.subarray(i*4,i*4+4))}));
    const world=restWorld(local);
    for(const [side,offset] of [['l',0],['r',.5]]){
      const thigh=motion.index.get('thigh_'+side),calf=motion.index.get('calf_'+side),foot=motion.index.get('foot_'+side);
      const hip=world[thigh].p,knee=world[calf].p,ankle=world[foot].p;
      const t=(phase+offset)%1, swing=clamp((t-stance)/(1-stance),0,1);
      const heel=clamp(1-t/.11,0,1), toe=smooth(clamp((t-.38)/(stance-.38),0,1));
      const pitch=t<=stance ? -.19*heel+.52*toe : .52-.71*smooth(swing);
      const clearance=(.085+.012*energy)*Math.sin(Math.PI*swing);
      const y=.104+Math.max(-.035*Math.sin(pitch),.149*Math.sin(pitch)+.089*(Math.cos(pitch)-1))+clearance;
      const step=t<=stance ? stance/2-t : -stance/2+smooth(swing)-(1-stance)*swing;
      const z=motion.rest[foot].p[2]+travel*step;
      const len=(a,b)=>Math.hypot(a[1]-b[1],a[2]-b[2]);
      const upper=len(hip,knee),lower=len(knee,ankle),d=clamp(Math.hypot(y-hip[1],z-hip[2]),Math.abs(upper-lower)+.001,upper+lower-.001);
      const toFoot=Math.atan2(z-hip[2],hip[1]-y);
      const jointAngle=(a,b)=>Math.acos(clamp((d*d+a*a-b*b)/(2*d*a),-1,1));
      const orient=(i,delta)=>qmul(qaxis(AXES.x,delta),world[i].q);
      const thighQ=orient(thigh,pitchOf(hip,knee)-toFoot-jointAngle(upper,lower));
      const calfQ=orient(calf,pitchOf(knee,ankle)-toFoot+jointAngle(lower,upper));
      const footQ=qmul(qaxis(AXES.x,pitch),motion.rest[foot].q);
      pose.q.set(qmul(qinv(world[local[thigh].parent].q),thighQ),thigh*4);
      pose.q.set(qmul(qinv(thighQ),calfQ),calf*4);
      pose.q.set(qmul(qinv(calfQ),footQ),foot*4);
    }
    if(energy){
      const turn=(bone,axis,angle)=>{
        const i=motion.index.get(bone), q=pose.q.subarray(i*4,i*4+4);
        const parent=motion.rest[motion.bones[i].parent].q;
        q.set(qmul(qmul(qmul(qinv(parent),qaxis(AXES[axis],angle)),parent),q));
      };
      const swing=Math.cos(phase*2*Math.PI);
      turn('spine_02','x',energy*.05);
      turn('spine_03','y',energy*.055*swing);
      turn('upperarm_l','x',energy*.16*swing);
      turn('upperarm_r','x',-energy*.16*swing);
    }
    baked.push(pose);
  }
  const variant={...walk,id:walkClip(style)};
  motion.clips.set(variant.id,variant);
  variant.sample=(time,out)=>{
    const frame=((time/walk.seconds%1)+1)%1*baked.length, i=Math.floor(frame);
    return motion.blend(baked[i],baked[(i+1)%baked.length],frame-i,out);
  };
}

/** The recorded movements, ready to be sampled, and room for the written ones. `words` is motion.bin as an Int16Array. */
export function createMotion(meta, words) {
  const bones = meta.bones, count = bones.length, stride = 3 + count * 4, pelvis = bones.findIndex(bone => bone.name === 'pelvis');
  const index = new Map(bones.map((bone, i) => [bone.name, i])), rest = restWorld(bones), clips = new Map();
  const newPose = () => ({ q: new Float32Array(count * 4), pelvis: [0, 0, 0] });
  const frame = (first, f, pose) => {
    const at = first + f * stride;
    pose.pelvis[0] = words[at] / 16000; pose.pelvis[1] = words[at + 1] / 16000; pose.pelvis[2] = words[at + 2] / 16000;
    for (let i = 0; i < count * 4; i++) pose.q[i] = words[at + 3 + i] / 32767;
  };
  const a = newPose(), b = newPose();
  /** Blend two poses: `t` of the second. With `mask`, each bone takes `t` times its own share. */
  const blend = (from, to, t, out, mask = null) => {
    for (let i = 0; i < count; i++) {
      const w = mask ? t * mask[i] : t, o = i * 4;
      if (w <= 0) { if (out !== from) for (let k = 0; k < 4; k++) out.q[o + k] = from.q[o + k]; continue; }
      const dot = from.q[o] * to.q[o] + from.q[o + 1] * to.q[o + 1] + from.q[o + 2] * to.q[o + 2] + from.q[o + 3] * to.q[o + 3], sign = dot < 0 ? -1 : 1;
      let x = from.q[o] + (to.q[o] * sign - from.q[o]) * w, y = from.q[o + 1] + (to.q[o + 1] * sign - from.q[o + 1]) * w, z = from.q[o + 2] + (to.q[o + 2] * sign - from.q[o + 2]) * w, s = from.q[o + 3] + (to.q[o + 3] * sign - from.q[o + 3]) * w;
      const n = Math.hypot(x, y, z, s) || 1; out.q[o] = x / n; out.q[o + 1] = y / n; out.q[o + 2] = z / n; out.q[o + 3] = s / n;
    }
    const w = mask ? t * mask[pelvis] : t;
    for (let k = 0; k < 3; k++) out.pelvis[k] = from.pelvis[k] + (to.pelvis[k] - from.pelvis[k]) * w;
    return out;
  };
  for (const clip of meta.clips) {
    clips.set(clip.id, {
      id: clip.id, seconds: clip.seconds, loop: clip.loop, frames: clip.frames,
      sample(time, pose) {
        const span = clip.loop ? clip.frames : clip.frames - 1;
        let f = span > 0 ? time * meta.fps : 0;
        f = clip.loop ? ((f % span) + span) % span : clamp(f, 0, span);
        const i = Math.floor(f), next = clip.loop ? (i + 1) % clip.frames : Math.min(clip.frames - 1, i + 1);
        frame(clip.first, i, a); if (next === i || f === i) return blend(a, a, 0, pose);
        frame(clip.first, next, b); return blend(a, b, f - i, pose);
      },
    });
  }
  const motion = {
    bones, count, index, pelvis, rest, clips, newPose, blend,
    clip(id) { const clip = clips.get(id); if (!clip) throw new Error(`no movement called ${id}`); return clip; },
    sample(id, time, pose = newPose()) { return motion.clip(id).sample(time, pose); },
    /** The turn a bone has, in its parent's space, when it is turned from the way it rests by `turns`: ['z', -70, 'x', 20] is 70 degrees back about the axis that points forward, then 20 about the one that points left, as the person stands with arms out. */
    turned(bone, turns) {
      const i = index.get(bone), parent = bones[i].parent, frameOf = parent < 0 ? [0, 0, 0, 1] : rest[parent].q;
      let delta = [0, 0, 0, 1];
      for (let k = 0; k < turns.length; k += 2) delta = qmul(qaxis(AXES[turns[k]], turns[k + 1] * Math.PI / 180), delta);
      return qmul(qmul(qmul(qinv(frameOf), delta), frameOf), bones[i].q);
    },
    /**
     * Write a movement. `keys` are [seconds, { bone: turns, ... }]. A bone a key does not name is as it is in `base`
     * (a movement, sampled at `baseTime`); '+bone' turns it further from there instead of from rest; `hips` is the
     * pelvis's turn and `pelvis` where it is, [left, up, forward] in metres from where `base` has it. Left and right are the person's own.
     */
    define(id, { seconds, loop = false, base = 'idle', baseTime = 0, keys }) {
      const under = motion.sample(base, baseTime), root = rest[bones[pelvis].parent].q;
      const poses = keys.map(([time, spec]) => {
        const pose = newPose(); blend(under, under, 0, pose);
        for (const [key, turns] of Object.entries(spec)) {
          if (key === 'pelvis') { const moved = qrot(qinv(root), turns); for (let k = 0; k < 3; k++) pose.pelvis[k] = under.pelvis[k] + moved[k]; continue; }
          const further = key[0] === '+', name = (further ? key.slice(1) : key).replace(/^hips$/, 'pelvis'), i = index.get(name);
          if (i === undefined) throw new Error(`${id}: no bone called ${name}`);
          if (!further) { pose.q.set(motion.turned(name, turns), i * 4); continue; }
          const parent = bones[i].parent, frameOf = parent < 0 ? [0, 0, 0, 1] : rest[parent].q; let delta = [0, 0, 0, 1];
          for (let k = 0; k < turns.length; k += 2) delta = qmul(qaxis(AXES[turns[k]], turns[k + 1] * Math.PI / 180), delta);
          pose.q.set(qmul(qmul(qmul(qinv(frameOf), delta), frameOf), Array.from(under.q.subarray(i * 4, i * 4 + 4))), i * 4);
        }
        return [time, pose];
      });
      clips.set(id, {
        id, seconds, loop, written: true,
        sample(time, pose) {
          const t = loop ? ((time % seconds) + seconds) % seconds : clamp(time, 0, seconds);
          let k = 0; while (k + 1 < poses.length && poses[k + 1][0] <= t) k++;
          const from = poses[k], to = poses[k + 1] || (loop ? [seconds + poses[0][0], poses[0][1]] : from);
          return blend(from[1], to[1], to === from ? 0 : smooth(clamp((t - from[0]) / (to[0] - from[0] || 1), 0, 1)), pose);
        },
      });
      return motion;
    },
  };
  for(const style of ['relaxed','purposeful','natural'])plantWalkingFeet(motion,style);
  return motion;
}

/** A pose fitted to one body: the pelvis's travel scaled to the length of its legs. Returns { q: [[x, y, z, w], ...], pelvis }. */
export function fitPose(motion, rig, pose, out = { q: [], pelvis: [0, 0, 0] }, seat = null, carry = null, liftDrink = 0) {
  for (let i = 0; i < motion.count; i++) { const q = out.q[i] || (out.q[i] = [0, 0, 0, 1]), o = i * 4; q[0] = pose.q[o]; q[1] = pose.q[o + 1]; q[2] = pose.q[o + 2]; q[3] = pose.q[o + 3]; }
  // A broad body carries its arms out from its sides.
  if (rig.spread) for (const [name, way] of [['upperarm_l', 1], ['upperarm_r', -1]]) {
    const i = motion.index.get(name), frameOf = motion.rest[motion.bones[i].parent].q, turned = qmul(qmul(qmul(qinv(frameOf), qaxis([0, 0, 1], way * rig.spread * hanging(motion, out, i, way))), frameOf), out.q[i]);
    for (let k = 0; k < 4; k++) out.q[i][k] = turned[k];
  }
  // The recorded movements carry the head well forward, which nobody notices on a mannequin and which on a face
  // looks like staring at the pavement: a body that says so has its neck and head brought part of the way back up.
  if (rig.lift) for (const [name, share] of [['neck_01', .4], ['Head', .6]]) {
    const i = motion.index.get(name), frameOf = motion.rest[i].q, turned = qmul(out.q[i], qmul(qmul(qinv(frameOf), qaxis([1, 0, 0], -rig.lift * share)), frameOf));
    for (let k = 0; k < 4; k++) out.q[i][k] = turned[k];
  }
  const rested = rig.bones[motion.pelvis].t, reference = motion.bones[motion.pelvis].t;
  for (let k = 0; k < 3; k++) out.pelvis[k] = rested[k] + (pose.pelvis[k] - reference[k]) * rig.stride;
  if (seat && seat.weight !== 0) {
    // Keep the cushion fixed in metres as leg length and rest hip position
    // change. A crowd pose sheet uses zero and places the instance on top.
    const weight = seat.weight ?? 1;
    const up = qrot(qinv(motion.rest[motion.bones[motion.pelvis].parent].q), [0, seatHeight(seat) - .45 * rig.stride, 0]);
    for (let k = 0; k < 3; k++) out.pelvis[k] += weight * (reference[k] * rig.stride - rested[k] + up[k]);
    // The soles take weight before the hips reach the cushion.
    supportFeet(motion, rig, out, footHeight(seat) * weight, smooth(Math.min(1, weight * 8)));
  }
  if (carry) fitCarryingArm(rig,out,carry,liftDrink);
  return out;
}

export function carryPose(kind){
  kind=kind?.split('@')[0];
  if(kind?.startsWith('drink-'))return 'cup';
  if(kind==='fork')return 'fork';
  if(kind?.startsWith('grocery-'))return gripForItem(kind)==='support'?'tray':'cup';
  if(kind?.startsWith('plate-') || ['tray','jewel','shoebox','guitar','guitar-mahogany','takeout','dishes'].includes(kind)) return 'tray';
  if(['cup','mug','jewelBag','phone','phone-rose'].includes(kind)) return 'cup';
  return null;
}

// The elbow stays beside the ribs and the forearm supports the load in front.
// Retain the torso's movement and level the wrist in the character's frame.
const elbowTurn = qmul(qaxis(AXES.y, -.6), qaxis(AXES.z, -1.31));
const forearmTurn = qmul(qaxis(AXES.y, -1.77), qaxis(AXES.z, .20));
const palmUp = [.5,.5,.5,.5], palmIn = [0,Math.SQRT1_2,Math.SQRT1_2,0];
function fitCarryingArm(rig, pose, item, liftDrink) {
  const style=gripForItem(item), kind=style==='support'?'tray':carryPose(item);
  const upper = rig.index.get('upperarm_l'), lower = rig.index.get('lowerarm_l'), hand = rig.index.get('hand_l');
  const clavicle = rig.bones[upper].parent;
  let parent = pose.q[clavicle];
  for (let i = rig.bones[clavicle].parent; i >= 0; i = rig.bones[i].parent) parent = qmul(pose.q[i],parent);
  const sway = qmul(parent,qinv(rig.world[clavicle].q));
  const elbow = qmul(sway,qmul(elbowTurn,rig.world[upper].q));
  // Seated diners lift the cup or utensil toward their face and lower it.
  const raise = liftDrink ? qmul(qaxis(AXES.x,-.97*liftDrink),qaxis(AXES.y,-.34*liftDrink)) : [0,0,0,1];
  const forearm = qmul(sway,qmul(raise,qmul(forearmTurn,rig.world[lower].q)));
  pose.q[upper] = qmul(qinv(parent),elbow);
  pose.q[lower] = qmul(qinv(elbow),forearm);
  pose.q[hand] = qmul(qinv(forearm),kind === 'tray' ? palmUp : palmIn);
  for(const [i,q] of fingerPose(rig,style))pose.q[i]=q.slice();
}

// The grip lies between wrist and knuckles. The cup centre sits one radius
// inside the curled fingers, while the underside of the tray rests on the palm.
export function gripOffsetFor(rig, kind) {
  if(kind==='fork'||kind==='cash')return pinchOffset(rig);
  const knuckle = rig.bones[rig.index.get('middle_01_l')].t;
  kind=carryPose(kind);
  return [kind === 'cup' ? .046 : kind === 'tray' ? .014 : 0, knuckle[1]*.74, knuckle[2]*.74];
}

// Flex the thighs to put reachable feet on the support. Counter-rotate at
// the knee to preserve the posture of the shin, then level the shoe. Short
// legs may hang free instead of tipping down through the front of a cushion.
function supportFeet(motion, rig, pose, support, weight) {
  const root = pose.q[rig.bones[motion.pelvis].parent], hips = qmul(root, pose.q[motion.pelvis]);
  const pelvisY = qrot(root, pose.pelvis)[1], rest = rig.bind || rig.world;
  for (const side of ['l', 'r']) {
    const thigh = motion.index.get('thigh_' + side), calf = motion.index.get('calf_' + side);
    const foot = motion.index.get('foot_' + side), ball = motion.index.get('ball_' + side);
    const upper = qmul(hips, pose.q[thigh]), lower = qmul(upper, pose.q[calf]);
    const knee = qrot(upper, rig.bones[calf].t), shin = qrot(lower, rig.bones[foot].t);
    const ankleY = pelvisY + qrot(hips, rig.bones[thigh].t)[1] + knee[1] + shin[1];
    const reach = Math.hypot(knee[1], knee[2]);
    const target = clamp((knee[1] + support + rest[foot].p[1] - ankleY) / reach, -1, 1);
    const bend = clamp(Math.atan2(knee[1], knee[2]) - Math.asin(target), -.65, .14) * weight;
    const bent = qmul(qaxis(AXES.x, bend), upper);
    pose.q[thigh] = qmul(qinv(hips), bent);
    pose.q[calf] = qmul(qinv(bent), lower);
    const shoe = qmul(lower, pose.q[foot]), toe = qrot(shoe, rig.bones[ball].t);
    const pitch = Math.atan2(toe[1], toe[2]);
    const level = Math.atan2(rest[ball].p[1] - rest[foot].p[1], rest[ball].p[2] - rest[foot].p[2]);
    pose.q[foot] = qmul(qinv(lower), qmul(qaxis(AXES.x, (pitch - level) * weight), shoe));
  }
}
/** How much an arm hangs at the side in a pose: 1 straight down, 0 once it is level or raised. */
function hanging(motion, fitted, i, way) {
  let q = fitted.q[i], bone = motion.bones[i].parent;
  while (bone >= 0) { q = qmul(fitted.q[bone], q); bone = motion.bones[bone].parent; }
  // The arm's own length lies along its bone's second axis, as the mannequin was built.
  const along = qrot(q, [0, 1, 0]);
  return clamp(-along[1] * 1.6 - .5, 0, 1) * clamp(1 - Math.abs(along[2]) * 1.5, 0, 1);
}

// --- Deciding what to show ---------------------------------------------------------------
const UPPER = /^(spine_02|spine_03|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|ring_|pinky_|thumb_)/;
/**
 * One person's animator. Each frame, tell it what the person is doing and it
 * gives the pose: standing, walking, jogging and sprinting run into one another
 * by speed and keep step; being in the air, squared up to fight, aiming, sitting
 * and so on take over from those; and a movement asked for with play() (a punch,
 * a kick, a vault) runs over the top once and then lets go.
 */
export function createAnimator(motion) {
  const pose = motion.newPose(), a = motion.newPose(), b = motion.newPose(), c = motion.newPose();
  const upper = new Float32Array(motion.count), whole = new Float32Array(motion.count).fill(1);
  motion.bones.forEach((bone, i) => { upper[i] = UPPER.test(bone.name) ? 1 : bone.name === 'spine_01' ? .4 : 0; });
  let stride = 0, clock = 0, air = 0, airTime = 0, stance = 0, stanceClip = 'guard', held = 0, heldClip = 'drive', wasGrounded = true, punches = 0;
  let act = null, last = null, lastWeight = 0;
  let bank = 0, pitch = 0, gaze = 0;
  const waist = motion.index.get('spine_01'), neck = motion.index.get('neck_01');
  const turnJoint = (joint, delta) => {
    const parent = motion.rest[motion.bones[joint].parent].q;
    const q = pose.q.subarray(joint * 4, joint * 4 + 4);
    q.set(qmul(qmul(qmul(qinv(parent), delta), parent), q));
  };
  const toward = (value, goal, rate, dt) => value + (goal - value) * (1 - Math.exp(-rate * dt));
  const gaits = [['walk', 2.05], ['jog', 3.5], ['sprint', 7]];
  const animator = {
    get strideCycle() { return stride; },
    /** Run a movement over the top once. `rate` is how fast, `from` where in it to start, `upperOnly` leaves the legs to walk, `hold` keeps its last pose until stop(). */
    play(clip, { rate = 1, from = 0, upperOnly = false, hold = false, fadeIn = .1, fadeOut = .16 } = {}) {
      if (act) { last = act; lastWeight = act.weight; }
      act = { clip, time: from, rate, mask: upperOnly ? upper : whole, hold, fadeIn, fadeOut, weight: 0, seconds: motion.clip(clip).seconds, done: false };
      return animator;
    },
    stop() { if (act) act.hold = false, act.done = true; },
    get playing() { return act && !act.done ? act.clip : null; },
    /** One of two punches, turn about. */
    punch(moving, clip = punches++ % 2 ? 'cross' : 'jab') {
      const recorded=clip==='jab' || clip==='cross';
      return animator.play(clip, { rate: recorded?2:1, from: recorded ? (clip==='jab'?.12:.16) : 0, upperOnly: moving, fadeIn: .05, fadeOut: .2 }); },
    /**
     * `s`: speed (m/s over the ground), grounded, falling (m/s downward), guard (squared up), aim, held (a movement to stay in: 'drive', 'sit', 'kneel', 'cuffed', 'handsUp', 'lying', 'death'...), sliding.
     * `heldTime` overrides the animation clock for a held pose tied to a sequence.
     * Returns the pose, for fitPose.
     */
    update(dt, s = {}) {
      clock += dt;
      const speed = Math.abs(s.speed || 0);
      // Standing and the three gaits, by speed; the stride keeps its place as one gives way to the next.
      let low = gaits[0], high = gaits[0], t = 0;
      if (speed > gaits[2][1]) low = high = gaits[2];
      else for (let i = 0; i + 1 < gaits.length; i++) if (speed > gaits[i][1]) { low = gaits[i]; high = gaits[i + 1]; t = (speed - gaits[i][1]) / (gaits[i + 1][1] - gaits[i][1]); }
      const lowLength = motion.clip(low[0]).seconds, highLength = motion.clip(high[0]).seconds, length = lowLength + (highLength - lowLength) * t, pace = low[1] + (high[1] - low[1]) * t;
      const cadenceSpeed=low[0]==='walk' ? WALK_CLIP_SPEED*strideFactor(s.walkStyle)*(1-t)+high[1]*t : pace;
      const cadence=clamp(speed/(cadenceSpeed*(s.strideScale||1)),0,2);
      stride += dt * cadence / length;
      const phase = stride % 1;
      motion.sample(low[0]==='walk'?walkClip(s.walkStyle):low[0], phase * lowLength, a);
      if (high !== low) { motion.sample(high[0], phase * highLength, b); motion.blend(a, b, t, a); }
      const moving = Math.min(1, speed / .9);
      // Squared up, or aiming: the whole body when standing, from the waist up when moving.
      const wantStance = s.aim ? 'aim' : s.guard ? 'guard' : null;
      if (wantStance) stanceClip = wantStance;
      stance = toward(stance, wantStance ? 1 : 0, 9, dt);
      motion.sample('idle', clock, b);
      if (stance > .01) { motion.sample(stanceClip, clock, c); motion.blend(b, c, stance, b); motion.blend(a, c, stance, a, upper); }
      motion.blend(b, a, moving, pose);
      // Bank over the loaded leg, brace on a stop, and let the gaze lead
      // the shoulders around a bend. The legs retain their sampled contacts.
      const effort = s.strideEffort;
      bank = toward(bank, clamp(-(effort?.strideSide || 0) * .022, -.30, .30), 10, dt);
      pitch = toward(pitch, clamp((effort?.strideForward || 0) * .014, -.18, .20), 12, dt);
      gaze = toward(gaze, (effort?.strideTurn || 0) * .55, 12, dt);
      if (Math.abs(bank) + Math.abs(pitch) + Math.abs(gaze) > .001) {
        turnJoint(waist, qmul(qaxis(AXES.y, gaze * .45), qmul(qaxis(AXES.z, bank), qaxis(AXES.x, pitch))));
        turnJoint(neck, qmul(qaxis(AXES.y, gaze * .55), qmul(qaxis(AXES.z, -.45 * bank), qaxis(AXES.x, -.40 * pitch))));
      }
      // In the air: a jump's hang, and past a second of it, a fall.
      const grounded = s.grounded !== false;
      airTime = grounded ? 0 : airTime + dt;
      air = toward(air, grounded ? 0 : 1, grounded ? 14 : 10, dt);
      if (air > .01) { motion.sample('air', airTime, b);
        if (s.vy>0 && airTime<.22) {
          motion.sample('jumpStart',airTime*.8,c);
          motion.blend(c,b,Math.min(1,airTime/.22),b);
        }
        if (airTime > .85) { motion.sample('fall', clock, c); motion.blend(b, c, Math.min(1, (airTime - .85) * 3), b); } motion.blend(pose, b, air, pose); }
      if (grounded && !wasGrounded && !act?.hold) {
        // Coming down: a hard landing or a dive out of a car is rolled out of, an ordinary one is absorbed.
        if (s.sliding || (s.impact || 0) > 9) animator.play('roll', { rate: 1.45, from: .12, fadeIn: .06, fadeOut: .25 });
        else if ((s.impact || 0) > 3.5) animator.play('land', { rate: 1.6, from: .08, fadeIn: .04, fadeOut: .3 });
      }
      wasGrounded = grounded;
      // Something to stay in.
      if (s.held) heldClip = s.held;
      held = toward(held, s.held ? 1 : 0, 8, dt);
      if (held > .01) { motion.sample(heldClip, s.heldTime ?? clock, b); motion.blend(pose, b, held, pose); }
      // The movement asked for, over the top; the one it took over from dies away under it.
      if (last) { lastWeight = toward(lastWeight, 0, 14, dt); if (lastWeight < .02) last = null; else { motion.sample(last.clip, last.time, b); motion.blend(pose, b, lastWeight, pose, last.mask); } }
      if (act) {
        act.time += dt * act.rate;
        const left = act.seconds - act.time;
        if (left <= 0 && !act.hold) act.done = true;
        const goal = act.done ? 0 : act.hold ? 1 : Math.min(1, Math.max(0, left / (act.fadeOut * act.rate)));
        act.weight = goal >= act.weight ? Math.min(goal, act.weight + dt / act.fadeIn) : toward(act.weight, goal, act.done ? 10 : 30, dt);
        if (act.done && act.weight < .02) act = null;
        else { motion.sample(act.clip, Math.min(act.time, act.seconds), b); motion.blend(pose, b, act.weight, pose, act.mask); }
      }
      if (s.seat && s.seat.weight > 0) {
        const w = s.seat.weight;
        motion.sample('seatBrace', 0, b);
        motion.blend(pose, b, Math.sin(Math.PI * w), pose);
        motion.sample(s.seat.clip, clock, b);
        motion.blend(pose, b, w, pose);
      }
      return pose;
    },
  };
  return animator;
}
