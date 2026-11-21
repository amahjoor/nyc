import { meleeMoves } from './melee-moves.js';
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
  const skater = {pelvis:[0,-.082,0], '+spine_01':['x',9,'y',18], '+spine_03':['y',14], '+Head':['y',45],
    thigh_l:['x',-28,'z',7], calf_l:['x',45], foot_l:['x',-17], thigh_r:['x',-33,'z',-10], calf_r:['x',51], foot_r:['x',-18],
    upperarm_l:['z',-53,'x',-12], upperarm_r:['z',49,'x',6], lowerarm_l:['x',16], lowerarm_r:['x',21]};
  motion.define('skateRoll',{seconds:1.2,loop:true,base:'idle',keys:[[0,skater],[.6,{...skater,pelvis:[0,-.094,0]}]]});
  motion.define('skateBalance',{seconds:1.25,loop:true,base:'skateRoll',keys:[
    [0,{pelvis:[0,-.15,0],'+upperarm_l':['z',31,'x',-13],'+upperarm_r':['z',-29,'x',12]}],
    [.62,{pelvis:[.01,-.145,0],'+upperarm_l':['z',36,'x',-9],'+upperarm_r':['z',-32,'x',15]}]]});
  motion.define('skatePush',{seconds:1,loop:true,base:'skateRoll',keys:[
    [0,{}],[.22,{pelvis:[.04,-.13,.02],'+spine_01':['x',10],'+thigh_r':['z',14],'+upperarm_r':['x',-16]}],
    [.51,{pelvis:[.06,-.098,0],'+thigh_r':['z',-15],'+upperarm_l':['x',-14]}],
    [.77,{'+calf_r':['x',24],'+thigh_r':['z',-12]}]]});
  motion.define('skateOllie',{seconds:.6,base:'skateRoll',keys:[
    [0,{pelvis:[0,-.12,0]}],[.25,{pelvis:[0,-.20,0],'+upperarm_l':['z',25],'+upperarm_r':['z',-28]}],
    [.6,{pelvis:[0,-.10,0]}]]});
  const cycling={ '+spine_01':['x',31], upperarm_l:['z',-62,'y',-40],upperarm_r:['z',62,'y',40] };
  const crank={thigh_l:['x',-84],calf_l:['x',107],foot_l:['x',-12],
    thigh_r:['x',-31],calf_r:['x',43],foot_r:['x',-8]};
  motion.define('cycle',{seconds:.92,loop:true,base:'idle',keys:[
    [0,{...cycling,...crank}], [.46,{...cycling,...mirror(crank)}]]});
  motion.define('cycleStop',{seconds:.92,loop:true,base:'cycle',keys:[[0,{}]]});
  // Centre the hips above the mount. Spread the knees outside the saddle,
  // leave the boots in the stirrups, and bring both hands up to the reins.
  const reins={hips:[],spine_01:['x',4],spine_02:[],spine_03:[],Head:[],
    thigh_l:['x',-36,'z',32],thigh_r:['x',-36,'z',-32],calf_l:['x',55,'z',-24],calf_r:['x',55,'z',24],
    foot_l:['x',-17],foot_r:['x',-17],upperarm_l:['z',-69,'x',-23],upperarm_r:['z',69,'x',-23],
    lowerarm_l:['x',-52,'y',-20],lowerarm_r:['x',-52,'y',20]};
  motion.define('horseRide',{seconds:.8,loop:true,keys:[[0,reins],[.4,{...reins,pelvis:[0,.012,0]}]]});
  const bars={...reins,spine_01:['x',11],thigh_l:['x',-65,'z',25],thigh_r:['x',-65,'z',-25],
    calf_l:['x',83],calf_r:['x',83],upperarm_l:['z',-65,'x',-49],upperarm_r:['z',65,'x',-49],
    lowerarm_l:['x',-22],lowerarm_r:['x',-22]};
  motion.define('motorRide',{seconds:.5,loop:true,keys:[[0,bars],[.25,bars]]});
  motion.define('stretch',{seconds:4.6,loop:true,base:'idle',keys:[
    [0,{upperarm_l:['z',-62],upperarm_r:['z',62]}],
    [2.3,{upperarm_l:['z',69],upperarm_r:['z',-69],'+spine_02':['z',8],'+Head':['x',-9]}]]});
  motion.define('rowCable',{seconds:1.9,loop:true,base:'idle',keys:[
    [0,{upperarm_l:['z',-51,'y',-69],upperarm_r:['z',51,'y',69]}],
    [.95,{upperarm_l:['z',-73,'y',-23],upperarm_r:['z',73,'y',23],lowerarm_l:['y',-74],lowerarm_r:['y',74]}]]});
  const cutting={upperarm_l:['z',-24,'y',-65],lowerarm_l:['z',36,'y',-28],
    upperarm_r:['z',31,'y',61],lowerarm_r:['z',-29,'y',39]};
  motion.define('cutHair',{seconds:.68,loop:true,keys:[[0,cutting],[.34,{...cutting,
    lowerarm_l:['z',39,'y',-31],hand_l:['y',-8],'+Head':['x',5]}]]});
  motion.define('curlWeight',{seconds:2.4,loop:true,keys:[
    [0,{upperarm_l:['z',-77],lowerarm_l:['y',-22]}],
    [1.2,{upperarm_l:['z',-70,'y',-14],lowerarm_l:['y',-111]}]]});
  // At the line. Both hands work at counter height in front of the body, the head down over them.
  const atCounter={'+spine_01':['x',7],'+Head':['x',11]};
  const leftRest={upperarm_l:['z',-64,'y',-34],lowerarm_l:['y',-58]};
  // A spoon going round a pot, the other hand on its handle.
  const spoon=(y,z,bend,roll)=>({...atCounter,...leftRest,upperarm_r:['z',z,'y',y],lowerarm_r:['y',bend,'x',roll]});
  motion.define('stir',{seconds:1.3,loop:true,base:'idle',keys:[
    [0,spoon(30,62,62,-10)],[.33,spoon(40,56,54,6)],[.65,spoon(48,62,62,14)],[.98,spoon(40,68,70,0)]]});
  // A knife coming down on a board, the other hand holding what is cut.
  const knife=(bend,lift)=>({...atCounter,'+Head':['x',15],upperarm_l:['z',-60,'y',-44],lowerarm_l:['y',-56],
    upperarm_r:['z',60-lift,'y',38],lowerarm_r:['y',bend]});
  motion.define('chop',{seconds:.44,loop:true,base:'idle',keys:[[0,knife(84,5)],[.22,knife(56,0)]]});
  // A wok pulled back and flicked forward by its handle while a ladle keeps the food moving.
  const wok=(pull,bend,ladle)=>({...atCounter,upperarm_l:['z',-58,'y',pull],lowerarm_l:['y',bend],
    upperarm_r:['z',58,'y',44+ladle],lowerarm_r:['y',60-ladle,'x',ladle]});
  motion.define('toss',{seconds:.84,loop:true,base:'idle',keys:[
    [0,wok(-48,-66,0)],[.2,wok(-38,-88,8)],[.4,wok(-58,-50,-6)],[.62,wok(-50,-62,6)]]});
  // A turner slid under what is on the griddle and turned over.
  const turner=(y,bend,roll)=>({...atCounter,upperarm_l:['z',-72,'y',-12],lowerarm_l:['y',-28],
    upperarm_r:['z',58,'y',y],lowerarm_r:['y',bend,'x',roll]});
  motion.define('flip',{seconds:1.5,loop:true,base:'idle',keys:[
    [0,turner(42,58,0)],[.45,turner(56,40,0)],[.7,turner(52,56,-38)],[.95,turner(46,66,24)],[1.2,turner(42,58,0)]]});
  // The handoff keeps the timing of the original reach; its contact point
  // on the crowd pose sheet is between the opposed fingertips.
  const reachCash=motion.clip('reach');
  motion.clips.set('giveCash',{...reachCash,id:'giveCash'});
  motion.define('strum',{seconds:.66,loop:true,base:'idle',keys:[
    [0,{upperarm_r:['z',64,'y',38],lowerarm_r:['y',58,'x',-13]}],
    [.33,{upperarm_r:['z',68,'y',27],lowerarm_r:['y',66,'x',12]}]]});
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
  motion.define('lowKick', { seconds: .72, base: 'jab', keys: [
    [0, {}], [.17, { thigh_r:['x',-52], calf_r:['x',90], '+spine_01':['x',9] }],
    [.29, { pelvis:[0,-.09,.06], thigh_r:['x',-38], calf_r:['x',12], foot_r:['x',8], '+spine_01':['x',13], '+thigh_l':['x',-9], '+calf_l':['x',18] }],
    [.49, { thigh_r:['x',-42], calf_r:['x',76] }], [.72, {}],
  ] });
  function strike(id, windup, contact, follow, change = pose => pose) {
    const timing=meleeMoves[id];
    motion.define(id,{seconds:timing.seconds,base:'guard',keys:[
      [0,{}],[timing.contact*.55,change(windup)],[timing.contact,change(contact)],
      [timing.contact+.08,change(follow)],[timing.seconds,{}],
    ]});
  }
  const hookLoad={'+spine_02':['y',-22],upperarm_r:['z',16,'y',-12],lowerarm_r:['y',83],...fist('r')};
  const hookHit={'+spine_02':['y',22],upperarm_r:['z',6,'y',62],lowerarm_r:['y',75],...fist('r')};
  const hookFinish={...hookHit,'+spine_02':['y',31],upperarm_r:['z',12,'y',80]};
  strike('hookRight',hookLoad,hookHit,hookFinish);
  strike('hookLeft',hookLoad,hookHit,hookFinish,mirror);
  strike('uppercut',{...hookLoad,pelvis:[0,-.10,0],upperarm_r:['z',64,'y',20]},
    {...hookHit,pelvis:[0,.035,.05],upperarm_r:['y',75,'x',-28],lowerarm_r:['y',80,'x',-72]},
    {...hookFinish,upperarm_r:['y',78,'x',-40],lowerarm_r:['y',87,'x',-75]});

  // Straighten each finger from the clenched guard throughout the palm swing.
  const palm=Object.fromEntries(Object.keys(fist('r')).map(joint=>[joint,[]]));
  const open={...palm,upperarm_r:['z',6,'y',-18],lowerarm_r:['y',20],hand_r:['x',60],'+spine_02':['y',-14]};
  const across={...palm,upperarm_r:['z',4,'y',76],lowerarm_r:['y',22],hand_r:['x',65],'+spine_02':['y',15]};
  const past={...across,upperarm_r:['z',6,'y',102],'+spine_02':['y',24]};
  strike('slap',open,across,past);
  strike('backhand',past,{...across,upperarm_r:['z',4,'y',55],hand_r:['x',-55]},open);

  strike('leadKick',mirror(chamber),{thigh_l:['x',-74],calf_l:['x',8],foot_l:['x',-10],'+spine_01':['x',-5]},mirror(chamber));
  strike('sideKick',{...chamber,'+hips':['y',-23]}, {thigh_r:['x',-81,'z',-27],calf_r:['x',8],
    foot_r:['z',-22],'+hips':['y',-30],'+spine_01':['z',15]},chamber);
  strike('lowSweep',{thigh_l:['x',-36,'z',22],calf_l:['x',65]},
    {thigh_l:['x',-35,'z',5],calf_l:['x',8],'+hips':['y',-15]},
    {thigh_l:['x',-30,'z',-12],calf_l:['x',21],'+hips':['y',-21]});
  const raised={pelvis:[.035,0,0],thigh_r:['x',-71],calf_r:['x',104],foot_r:['x',-14],'+upperarm_l':['z',15]};
  const planted={pelvis:[0,-.045,0],thigh_r:['x',-14],calf_r:['x',21],foot_r:['x',-7],'+spine_01':['x',10]};
  strike('stompRight',raised,planted,planted);
  strike('stompLeft',raised,planted,planted,mirror);
  const crouch={...hookLoad,pelvis:[.025,-.08,0],'+thigh_l':['x',-12],'+calf_l':['x',19]};
  const bodyHit={...hookHit,pelvis:[.04,-.095,.05],upperarm_r:['z',40,'y',72],lowerarm_r:['y',58],'+spine_01':['x',13]};
  strike('bodyHook',crouch,bodyHit,{...bodyHit,'+spine_02':['y',33]});
  strike('shovelLeft',crouch,{...bodyHit,upperarm_r:['z',19,'y',83],lowerarm_r:['x',-40,'y',70]},hookFinish,mirror);
  const elbow={...hookHit,upperarm_r:['z',4,'y',86],lowerarm_r:['y',144],'+hips':['y',18]};
  strike('elbowTurn',{...hookLoad,lowerarm_r:['y',140]},elbow,{...elbow,'+spine_02':['y',34]});
  const push={...across,...mirror(across),pelvis:[0,-.045,.09],upperarm_r:['z',23,'y',83],upperarm_l:['z',-23,'y',-83],
    lowerarm_r:['y',11],lowerarm_l:['y',-11],hand_r:['z',-45],hand_l:['z',45]};
  strike('palmPush',{...push,pelvis:[0,-.04,-.02],lowerarm_r:['y',85],lowerarm_l:['y',-85]},push,
    {...push,pelvis:[0,-.025,.05],lowerarm_r:['y',31],lowerarm_l:['y',-31]});
  const extended={...hookHit,upperarm_r:['z',4,'y',88],lowerarm_r:['y',5],pelvis:[0,-.015,.09]};
  strike('stepJab',{'+hips':['y',-8]},extended,{...extended,lowerarm_r:['y',45]},mirror);
  strike('longCross',{...hookLoad,'+hips':['y',-18]}, {...extended,'+hips':['y',22],'+spine_01':['x',13]},
    {...extended,upperarm_r:['z',9,'y',102],'+spine_02':['y',28]});
  const swingLeg={...chamber,'+hips':['y',-32],thigh_r:['x',-66,'z',-45]};
  strike('roundKick',swingLeg,{...swingLeg,'+hips':['y',28],thigh_r:['x',-86,'z',-16],calf_r:['x',13]},
    {...swingLeg,'+hips':['y',38],thigh_r:['x',-58,'z',12],calf_r:['x',38]});
  const pushLeg={pelvis:[0,0,.06],thigh_l:['x',-66],calf_l:['x',5],foot_l:['x',-21],'+spine_01':['x',-13]};
  strike('pushKick',mirror(chamber),pushLeg,{...pushLeg,calf_l:['x',40]});
  const recoil={'+Head':['y',28,'z',-16],'+spine_03':['y',14,'z',-7],'+upperarm_l':['z',13]};
  for(const [id,pose] of [['reelLeft',recoil],['reelRight',mirror(recoil)],
      ['foldBack',{pelvis:[0,-.075,-.04],'+spine_01':['x',23],'+Head':['x',-10],'+thigh_r':['x',-14],'+calf_r':['x',27]}]]) {
    motion.define(id,{seconds:.38,base:'guard',keys:[[0,{}],[.09,pose],[.17,pose],[.38,{}]]});
  }
  // Falling a long way: arms and legs going.
  const flail = { upperarm_l: ['z', 38, 'y', -25], lowerarm_l: ['y', -45], upperarm_r: ['z', 12, 'y', 40], lowerarm_r: ['y', 70], thigh_l: ['x', -48, 'z', 8], calf_l: ['x', 75], thigh_r: ['x', 8, 'z', -10], calf_r: ['x', 48], '+spine_02': ['x', -10], '+Head': ['x', 12] };
  motion.define('fall', { seconds: .7, loop: true, base: 'air', keys: [[0, flail], [.35, mirror(flail)]] });
  // Over something waist high: a hand down on it and both legs swung across to one side.
  motion.define('vault', { seconds: .8, base: 'idle', keys: [
    [0, { '+spine_01': ['x', 14], thigh_r: ['x', -40], calf_r: ['x', 60], thigh_l: ['x', 22], calf_l: ['x', 30], upperarm_l: ['z', -40, 'y', -50], lowerarm_l: ['y', -25], pelvis: [0, -.04, 0] }],
    [.2, { '+spine_01': ['x', 26], hips: ['z', -18], thigh_r: ['x', -80, 'z', -20], calf_r: ['x', 85], thigh_l: ['x', -30, 'z', 10], calf_l: ['x', 70], upperarm_l: ['z', -62, 'y', -38], lowerarm_l: ['y', -8], upperarm_r: ['z', 30, 'y', 30], lowerarm_r: ['y', 60], pelvis: [.05, 0, 0] }],
    [.4, { '+spine_01': ['x', 22], hips: ['z', -42, 'x', -12], thigh_r: ['x', -95, 'z', -8], calf_r: ['x', 55], thigh_l: ['x', -88, 'z', -6], calf_l: ['x', 62], upperarm_l: ['z', -78, 'y', -8], lowerarm_l: ['y', -4], upperarm_r: ['z', 20, 'y', 20], lowerarm_r: ['y', 50], pelvis: [.1, 0, 0] }],
    [.6, { '+spine_01': ['x', 16], hips: ['z', -14], thigh_r: ['x', -58], calf_r: ['x', 30], thigh_l: ['x', -46], calf_l: ['x', 42], upperarm_l: ['z', -55, 'y', 40], lowerarm_l: ['y', -30], pelvis: [.03, 0, 0] }],
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
