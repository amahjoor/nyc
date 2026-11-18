import { qrot } from './body.js';
// The movements nobody recorded, written out pose by pose (body-motion.js says how a pose is written).
//
// Angles are in degrees from the way a bone rests, with the arms straight out:
// about x (the axis out of the person's left side) a positive turn tips what
// points up toward the front; about y (up) it swings what faces front toward
// the left; about z (forward) it lifts what points left. So a left arm hangs
// at ['z', -80] and a right one at ['z', 80]; a thigh lifts to the front with
// ['x', -90], and a knee bends with ['x', 90].
const fist = side => { const way = side === 'l' ? -1 : 1, made = {}; for (const finger of ['index', 'middle', 'ring', 'pinky']) for (const joint of [1, 2, 3]) made[`${finger}_0${joint}_${side}`] = ['z', way * (joint === 1 ? 70 : 85)]; made[`thumb_01_${side}`] = ['y', way * -30, 'z', way * 25]; made[`thumb_02_${side}`] = ['y', way * -40]; return made; };
/** The same pose with left and right changed over. */
const mirror = spec => { const made = {}; for (const [key, turns] of Object.entries(spec)) { const name = key.replace(/_([lr])$/, (_, side) => '_' + (side === 'l' ? 'r' : 'l')); made[name] = key === 'pelvis' ? [-turns[0], turns[1], turns[2]] : turns.map((value, i) => i % 2 && turns[i - 1] !== 'x' ? -value : value); } return made; };

export function writeMovements(motion) {
  // The recorded sit is rooted between the feet, 33 cm ahead of the hips.
  // Centre the hips over a reference cushion, then fit that cushion to the
  // actual furniture and the sitter's proportions in fitPose().
  const root = motion.rest[motion.bones[motion.pelvis].parent];
  const recorded = qrot(root.q, motion.sample('sit', 0).pelvis);
  const cushion = depth => [-recorded[0], .45 + .086 - recorded[1], depth - recorded[2]];
  const furniture = (id, posture) => {
    const rest = { pelvis: cushion(0), ...posture };
    motion.define(id, { seconds: 2.4, loop: true, base: 'sit', keys: [
      [0, rest], [1.2, { ...rest, '+spine_03': ['x', -1.2], '+neck_01': ['x', .6] }],
    ] });
  };
  furniture('seatChair', { '+spine_01': ['x', -5], '+lowerarm_l': ['x', -12], '+lowerarm_r': ['x', -12] });
  furniture('seatBench', { '+spine_01': ['x', 5], '+spine_02': ['z', -4], '+thigh_l': ['y', 7], '+thigh_r': ['y', -7],
    '+calf_l': ['x', -17], '+foot_l': ['x', 17], '+upperarm_l': ['x', -16] });
  furniture('seatBooth', { '+spine_01': ['x', 3], '+calf_l': ['x', 11], '+calf_r': ['x', 8],
    '+foot_l': ['x', -11], '+foot_r': ['x', -8], '+upperarm_l': ['x', -17], '+upperarm_r': ['x', -17] });
  furniture('seatLounge', { pelvis: cushion(-.086), '+spine_01': ['x', -24], '+Head': ['x', 12], '+calf_l': ['x', -19],
    '+calf_r': ['x', -12], '+foot_l': ['x', 19], '+foot_r': ['x', 12],
    '+upperarm_l': ['x', -12], '+upperarm_r': ['x', -12], '+lowerarm_l': ['x', 16, 'y', 36], '+lowerarm_r': ['x', 16, 'y', -36] });
  furniture('seatStool', { '+spine_01': ['x', -7], '+thigh_l': ['x', 15], '+thigh_r': ['x', 10],
    '+calf_l': ['x', 24], '+calf_r': ['x', 24], '+foot_l': ['x', -16], '+foot_r': ['x', -13],
    '+upperarm_l': ['x', -6], '+upperarm_r': ['x', -9], '+lowerarm_l': ['x', 16], '+lowerarm_r': ['x', 18] });
  motion.define('seatBrace', { seconds: .5, keys: [[0, { pelvis: [0, -.09, -.035], '+spine_01': ['x', 21],
    '+thigh_l': ['x', -30], '+thigh_r': ['x', -30], '+calf_l': ['x', 42], '+calf_r': ['x', 42],
    '+foot_l': ['x', -12], '+foot_r': ['x', -12], '+upperarm_l': ['x', -18], '+upperarm_r': ['x', -18] }]] });
  // Squared up to fight: the stance a jab starts from, breathing.
  motion.define('guard', { seconds: 1.1, loop: true, base: 'jab', keys: [[0, {}], [.55, { pelvis: [0, -.012, 0], '+spine_02': ['x', 1.5] }]] });
  // A kick with the back leg, straight out to the front.
  const chamber = { '+hips': ['x', -6], thigh_r: ['x', -92, 'z', -4], calf_r: ['x', 112], foot_r: ['x', 20], '+spine_01': ['x', -4], '+thigh_l': ['x', 4], '+upperarm_r': ['z', -12] };
  motion.define('kick', { seconds: .72, base: 'jab', keys: [
    [0, {}], [.17, chamber],
    [.29, { '+hips': ['x', -15], pelvis: [0, .01, .07], thigh_r: ['x', -98, 'z', -4], calf_r: ['x', 6], foot_r: ['x', -12], '+spine_01': ['x', -10], '+thigh_l': ['x', 14], '+upperarm_r': ['z', -25], '+upperarm_l': ['z', 12] }],
    [.39, { '+hips': ['x', -14], pelvis: [0, .01, .06], thigh_r: ['x', -96, 'z', -4], calf_r: ['x', 10], foot_r: ['x', -10], '+spine_01': ['x', -9], '+thigh_l': ['x', 13], '+upperarm_r': ['z', -22], '+upperarm_l': ['z', 10] }],
    [.52, chamber], [.72, {}],
  ] });
  // Falling a long way: arms and legs going.
  const flail = { upperarm_l: ['z', 38, 'y', -25], lowerarm_l: ['y', -45], upperarm_r: ['z', 12, 'y', 40], lowerarm_r: ['y', 70], thigh_l: ['x', -48, 'z', 8], calf_l: ['x', 75], thigh_r: ['x', 8, 'z', -10], calf_r: ['x', 48], '+spine_02': ['x', -10], '+Head': ['x', 12] };
  motion.define('fall', { seconds: .7, loop: true, base: 'air', keys: [[0, flail], [.35, mirror(flail)]] });
  // Over something waist high: a hand down on it and both legs swung across to one side.
  motion.define('vault', { seconds: .8, base: 'idle', keys: [
    [0, { '+spine_01': ['x', 14], thigh_r: ['x', -40], calf_r: ['x', 60], thigh_l: ['x', 22], calf_l: ['x', 30], upperarm_l: ['z', -40, 'y', -50], lowerarm_l: ['y', -25], pelvis: [0, -.04, 0] }],
    [.2, { '+spine_01': ['x', 26], hips: ['z', -18], thigh_r: ['x', -80, 'z', -20], calf_r: ['x', 85], thigh_l: ['x', -30, 'z', 10], calf_l: ['x', 70], upperarm_l: ['z', -62, 'y', -38], lowerarm_l: ['y', -8], upperarm_r: ['z', 30, 'y', 30], lowerarm_r: ['y', 60], pelvis: [.05, .3, 0] }],
    [.4, { '+spine_01': ['x', 22], hips: ['z', -42, 'x', -12], thigh_r: ['x', -95, 'z', -8], calf_r: ['x', 55], thigh_l: ['x', -88, 'z', -6], calf_l: ['x', 62], upperarm_l: ['z', -78, 'y', -8], lowerarm_l: ['y', -4], upperarm_r: ['z', 20, 'y', 20], lowerarm_r: ['y', 50], pelvis: [.1, .47, 0] }],
    [.6, { '+spine_01': ['x', 16], hips: ['z', -14], thigh_r: ['x', -58], calf_r: ['x', 30], thigh_l: ['x', -46], calf_l: ['x', 42], upperarm_l: ['z', -55, 'y', 40], lowerarm_l: ['y', -30], pelvis: [.03, .2, 0] }],
    [.8, { '+spine_01': ['x', 10], thigh_r: ['x', -32], calf_r: ['x', 48], thigh_l: ['x', -26], calf_l: ['x', 46], pelvis: [0, -.09, 0] }],
  ] });
  // Up onto something head high: reach, haul, a knee over the edge, stand. Whoever moves the person lifts them through the middle of it.
  const reach = { upperarm_l: ['z', 72, 'y', -12], lowerarm_l: ['z', 10], upperarm_r: ['z', -72, 'y', 12], lowerarm_r: ['z', -10], '+spine_02': ['x', -8], '+Head': ['x', -22] };
  motion.define('climb', { seconds: 1.3, base: 'idle', keys: [
    [0, { '+thigh_l': ['x', -20], '+calf_l': ['x', 40], '+thigh_r': ['x', -20], '+calf_r': ['x', 40], pelvis: [0, -.1, 0] }],
    [.22, reach],
    [.55, { upperarm_l: ['z', 12, 'y', -40], lowerarm_l: ['y', -118], upperarm_r: ['z', -12, 'y', 40], lowerarm_r: ['y', 118], '+spine_02': ['x', 6], thigh_l: ['x', -24], calf_l: ['x', 50], thigh_r: ['x', -8], calf_r: ['x', 36] }],
    [.82, { upperarm_l: ['z', -66, 'y', 12], lowerarm_l: ['y', -18], upperarm_r: ['z', 66, 'y', -12], lowerarm_r: ['y', 18], '+spine_01': ['x', 32], thigh_r: ['x', -108, 'z', -16], calf_r: ['x', 118], thigh_l: ['x', -6], calf_l: ['x', 22] }],
    [1.06, { '+spine_01': ['x', 34], thigh_r: ['x', -92], calf_r: ['x', 104], thigh_l: ['x', -70], calf_l: ['x', 100], upperarm_l: ['z', -58, 'y', -30], lowerarm_l: ['y', -30], upperarm_r: ['z', 58, 'y', 30], lowerarm_r: ['y', 30], pelvis: [0, -.36, 0] }],
    [1.3, {}],
  ] });
  // A hand to a car door, and the pull that opens it.
  motion.define('door', { seconds: .5, base: 'idle', keys: [
    [0, {}], [.22, { upperarm_r: ['z', 52, 'y', 58], lowerarm_r: ['y', 22], '+spine_01': ['x', 10, 'y', -8] }],
    [.5, { upperarm_r: ['z', 62, 'y', 20], lowerarm_r: ['y', 78], '+spine_01': ['x', 4, 'y', -16], pelvis: [0, 0, -.04] }],
  ] });
  // Ducking in under the roof and onto the seat; and the same backwards for getting out.
  const duck = { '+spine_01': ['x', 38], '+Head': ['x', 14], thigh_r: ['x', -78, 'z', -14], calf_r: ['x', 82], thigh_l: ['x', -30], calf_l: ['x', 62], upperarm_r: ['z', 50, 'y', 55], lowerarm_r: ['y', 40], pelvis: [-.08, -.3, .05] };
  motion.define('getIn', { seconds: .7, base: 'idle', keys: [[0, {}], [.32, duck], [.7, { ...duck, pelvis: [-.3, -.42, .1], thigh_l: ['x', -80], calf_l: ['x', 80] }]] });
  motion.define('getOut', { seconds: .6, base: 'idle', keys: [[0, { ...duck, pelvis: [-.2, -.4, .05], thigh_l: ['x', -80], calf_l: ['x', 80] }], [.3, duck], [.6, {}]] });
  // Taking a car from the person driving it: both hands in, then hauled out and thrown down behind.
  motion.define('carjack', { seconds: 1.15, base: 'idle', keys: [
    [0, {}],
    [.24, { upperarm_r: ['z', 30, 'y', 72], lowerarm_r: ['y', 30], upperarm_l: ['z', -30, 'y', -72], lowerarm_l: ['y', -30], '+spine_01': ['x', 22], '+thigh_l': ['x', -24], '+calf_l': ['x', 30], pelvis: [0, -.06, .1], ...fist('l'), ...fist('r') }],
    [.5, { upperarm_r: ['z', 50, 'y', 30], lowerarm_r: ['y', 105], upperarm_l: ['z', -50, 'y', -30], lowerarm_l: ['y', -105], '+spine_01': ['x', -4, 'y', 28], '+thigh_r': ['x', 22], '+calf_r': ['x', 30], pelvis: [0, -.08, -.14], ...fist('l'), ...fist('r') }],
    [.78, { upperarm_r: ['z', 40, 'y', 62], lowerarm_r: ['y', 25], upperarm_l: ['z', -22, 'y', 10], lowerarm_l: ['y', -30], '+spine_01': ['x', 12, 'y', 62], '+hips': ['y', 22], '+thigh_r': ['x', 20], '+calf_r': ['x', 26], pelvis: [.06, -.1, -.1] }],
    [1.15, {}],
  ] });
  // Being hauled out of a seat and thrown down.
  motion.define('thrown', { seconds: .9, base: 'hitChest', baseTime: .15, keys: [
    [0, { thigh_l: ['x', -80], calf_l: ['x', 80], thigh_r: ['x', -80], calf_r: ['x', 80], pelvis: [0, -.4, 0], upperarm_l: ['z', -20, 'y', -40], upperarm_r: ['z', 20, 'y', 40] }],
    [.35, { '+spine_01': ['x', 30], thigh_l: ['x', -40], calf_l: ['x', 50], thigh_r: ['x', -10], calf_r: ['x', 40], upperarm_l: ['z', 20, 'y', -60], upperarm_r: ['z', -20, 'y', 60], pelvis: [0, -.2, .1] }],
    [.9, { hips: ['x', 80], '+spine_01': ['x', 6], thigh_l: ['x', -10], calf_l: ['x', 20], thigh_r: ['x', 6], calf_r: ['x', 30], upperarm_l: ['z', 40, 'y', -30], lowerarm_l: ['y', -60], upperarm_r: ['z', -40, 'y', 30], lowerarm_r: ['y', 60], '+Head': ['x', -30], pelvis: [0, -.78, .1] }],
  ] });
  // Breaking into a locked car: an elbow through the glass, then a reach inside for the latch.
  motion.define('breakIn', { seconds: 1.25, base: 'idle', keys: [
    [0, {}],
    [.3, { '+spine_02': ['y', -38], '+hips': ['y', -14], upperarm_r: ['z', 14, 'y', -30], lowerarm_r: ['y', 142], ...fist('r'), '+Head': ['y', 30] }],
    [.43, { '+spine_02': ['y', 34], '+hips': ['y', 14], upperarm_r: ['z', 6, 'y', 72], lowerarm_r: ['y', 142], ...fist('r'), '+spine_01': ['x', 10], pelvis: [0, -.03, .08] }],
    [.6, { '+spine_02': ['y', 26], upperarm_r: ['z', 10, 'y', 55], lowerarm_r: ['y', 130], ...fist('r'), '+spine_01': ['x', 8], pelvis: [0, -.03, .06] }],
    [.9, { '+spine_01': ['x', 24], upperarm_r: ['z', 58, 'y', 78], lowerarm_r: ['y', 18], pelvis: [0, -.06, .1] }],
    [1.25, {}],
  ] });
  // Hands up.
  const up = { upperarm_l: ['z', 8, 'y', -12], lowerarm_l: ['z', 82], upperarm_r: ['z', -8, 'y', 12], lowerarm_r: ['z', -82], '+spine_02': ['x', -4] };
  motion.define('handsUp', { seconds: 1.6, loop: true, base: 'idle', keys: [[0, up], [.8, { ...up, '+spine_02': ['x', -2], pelvis: [0, -.01, 0] }]] });
  // Shrinking from something: crouched, arms over the head.
  motion.define('cower', { seconds: 1.2, loop: true, base: 'crouch', keys: [[0, { upperarm_l: ['z', 40, 'y', -50], lowerarm_l: ['y', -125], upperarm_r: ['z', -40, 'y', 50], lowerarm_r: ['y', 125], '+Head': ['x', 25] }], [.6, { upperarm_l: ['z', 44, 'y', -50], lowerarm_l: ['y', -128], upperarm_r: ['z', -44, 'y', 50], lowerarm_r: ['y', 128], '+Head': ['x', 28], pelvis: [0, -.01, 0] }]] });
  // Startled: a step back with the hands thrown up, as when a car comes too close.
  motion.define('flinch', { seconds: .7, base: 'idle', keys: [
    [0, {}],
    [.14, { '+spine_01': ['x', -14], '+Head': ['x', -8], upperarm_l: ['z', -28, 'y', -52], lowerarm_l: ['y', -100], upperarm_r: ['z', 28, 'y', 52], lowerarm_r: ['y', 100], thigh_l: ['x', 16], calf_l: ['x', 24], thigh_r: ['x', -18], calf_r: ['x', 30], pelvis: [0, -.05, -.1] }],
    [.4, { '+spine_01': ['x', -8], upperarm_l: ['z', -40, 'y', -44], lowerarm_l: ['y', -92], upperarm_r: ['z', 40, 'y', 44], lowerarm_r: ['y', 92], thigh_l: ['x', 8], calf_l: ['x', 20], thigh_r: ['x', -8], calf_r: ['x', 20], pelvis: [0, -.04, -.06] }],
    [.7, {}],
  ] });
  // Knocked off the feet, as by a car: thrown onto the back, where `lying` keeps them, and `getUp` brings them back.
  const flat = { hips: ['x', -86], '+spine_01': ['x', 4], '+Head': ['x', 8], thigh_l: ['x', -6, 'z', 12], calf_l: ['x', 14], thigh_r: ['x', -2, 'z', -9], calf_r: ['x', 6], upperarm_l: ['z', -34, 'y', 6], lowerarm_l: ['y', -24], upperarm_r: ['z', 52, 'y', -4], lowerarm_r: ['y', 40], pelvis: [0, -.8, -.25] };
  motion.define('knocked', { seconds: .85, base: 'idle', keys: [
    [0, { '+spine_01': ['x', -10] }],
    [.2, { hips: ['x', -30], '+spine_01': ['x', 24], thigh_l: ['x', -52], calf_l: ['x', 40], thigh_r: ['x', -34], calf_r: ['x', 52], upperarm_l: ['z', 10, 'y', -50], lowerarm_l: ['y', -30], upperarm_r: ['z', -10, 'y', 50], lowerarm_r: ['y', 30], pelvis: [0, .22, -.2] }],
    [.5, { hips: ['x', -70], '+spine_01': ['x', 18], thigh_l: ['x', -60], calf_l: ['x', 30], thigh_r: ['x', -40], calf_r: ['x', 50], upperarm_l: ['z', 20, 'y', -30], upperarm_r: ['z', -20, 'y', 30], pelvis: [0, -.45, -.5] }],
    [.85, flat],
  ] });
  motion.define('lying', { seconds: 2, loop: true, base: 'idle', keys: [[0, flat], [1, { ...flat, '+spine_02': ['x', 2] }]] });
  motion.define('getUp', { seconds: 1.5, base: 'idle', keys: [
    [0, flat],
    [.45, { hips: ['x', -30], '+spine_01': ['x', 40], thigh_l: ['x', -100], calf_l: ['x', 110], thigh_r: ['x', -84], calf_r: ['x', 96], upperarm_l: ['z', -70, 'y', 30], lowerarm_l: ['y', -10], upperarm_r: ['z', 70, 'y', -30], lowerarm_r: ['y', 10], pelvis: [0, -.66, -.12] }],
    [.95, { '+spine_01': ['x', 36], thigh_l: ['x', -92], calf_l: ['x', 104], thigh_r: ['x', -70], calf_r: ['x', 100], upperarm_l: ['z', -62, 'y', -24], lowerarm_l: ['y', -30], upperarm_r: ['z', 62, 'y', 24], lowerarm_r: ['y', 30], pelvis: [0, -.4, 0] }],
    [1.5, {}],
  ] });
  // Pushed: a stagger back onto the heels, caught.
  motion.define('stumble', { seconds: .8, base: 'idle', keys: [
    [0, {}],
    [.16, { '+spine_01': ['x', -18], '+Head': ['x', 10], thigh_l: ['x', -30], calf_l: ['x', 20], thigh_r: ['x', 14], calf_r: ['x', 26], upperarm_l: ['z', -30, 'y', -40], lowerarm_l: ['y', -40], upperarm_r: ['z', 16, 'y', 30], lowerarm_r: ['y', 50], pelvis: [0, -.05, -.12] }],
    [.42, { '+spine_01': ['x', 10], thigh_l: ['x', 10], calf_l: ['x', 26], thigh_r: ['x', -32], calf_r: ['x', 44], upperarm_l: ['z', -52, 'y', 20], upperarm_r: ['z', 48, 'y', 40], pelvis: [0, -.09, -.04] }],
    [.8, {}],
  ] });
  // Arrested: down on the knees with the hands behind the head, and then stood with them held behind the back.
  motion.define('kneel', { seconds: 1.8, loop: true, base: 'idle', keys: [[0, { thigh_l: ['x', -6], calf_l: ['x', 96], thigh_r: ['x', -6], calf_r: ['x', 96], foot_l: ['x', 40], foot_r: ['x', 40], upperarm_l: ['z', 24, 'y', 18], lowerarm_l: ['y', -138], upperarm_r: ['z', -24, 'y', -18], lowerarm_r: ['y', 138], '+Head': ['x', 14], pelvis: [0, -.42, -.05] }], [.9, { thigh_l: ['x', -6], calf_l: ['x', 96], thigh_r: ['x', -6], calf_r: ['x', 96], foot_l: ['x', 40], foot_r: ['x', 40], upperarm_l: ['z', 24, 'y', 18], lowerarm_l: ['y', -138], upperarm_r: ['z', -24, 'y', -18], lowerarm_r: ['y', 138], '+Head': ['x', 17], pelvis: [0, -.425, -.05] }]] });
  const held = { upperarm_l: ['z', -74, 'y', 26], lowerarm_l: ['y', 62, 'z', -30], upperarm_r: ['z', 74, 'y', -26], lowerarm_r: ['y', -62, 'z', 30], '+spine_02': ['x', 8], '+Head': ['x', 16], ...fist('l'), ...fist('r') };
  motion.define('cuffed', { seconds: 2, loop: true, base: 'idle', keys: [[0, held], [1, { ...held, pelvis: [0, -.008, 0] }]] });
  // An officer putting the cuffs on someone in front of them.
  motion.define('cuffing', { seconds: 1.2, loop: true, base: 'idle', keys: [[0, { upperarm_l: ['z', -44, 'y', -58], lowerarm_l: ['y', -48], upperarm_r: ['z', 44, 'y', 58], lowerarm_r: ['y', 48], '+spine_01': ['x', 12] }], [.6, { upperarm_l: ['z', -50, 'y', -50], lowerarm_l: ['y', -62], upperarm_r: ['z', 40, 'y', 64], lowerarm_r: ['y', 40], '+spine_01': ['x', 15] }]] });
  return motion;
}
