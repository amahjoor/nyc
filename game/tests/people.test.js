import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBody, createRig, restWorld, heightOf, palette, PAINT, HAIR, TOPS, BOTTOMS } from '../dist/body.js';
import { createMotion, createAnimator, fitPose } from '../dist/body-motion.js';
import { writeMovements } from '../dist/body-moves.js';
import { createHuman } from '../dist/human.js';
import { footHeight, previewSeats, sheetSeats } from '../dist/seating.js';
import { CAST, castFor, FIELDS, DEFAULT_DESIGN, tidy, randomDesign, loadDesign, saveDesign } from '../dist/body-designs.js';
import { createFigures, STREET_CLIPS, paletteOf } from '../dist/people-figures.js';
import { createCrowd, dress, seeded, KIT } from '../dist/crowd.js';

const meta = JSON.parse(readFileSync(new URL('../dist/motion.json', import.meta.url), 'utf8'));
const file = readFileSync(new URL('../dist/motion.bin', import.meta.url)), words = new Int16Array(file.buffer, file.byteOffset, file.byteLength / 2);
const motion = writeMovements(createMotion(meta, words));

test('every furniture pose fits the cushion and foot support across body sizes', () => {
  const binary = name => Uint8Array.from(readFileSync(new URL('../dist/human/' + name, import.meta.url))).buffer;
  const human = createHuman(JSON.parse(readFileSync(new URL('../dist/human/human.json', import.meta.url))), binary('body.bin'), binary('parts.bin'), meta);
  for (const rig of [createRig(meta), ...[1.2, 1.77, 2.15].map(height => human.build({height}, {detail:'far'}).rig)]) {
    for (const [clip, seat] of Object.entries(previewSeats)) {
      let first;
      for (const t of [0,.6,1.2,2.3999]) {
        const pose = motion.sample(clip, t), fit = fitPose(motion, rig, pose, undefined, seat);
        const world = restWorld(rig.bones.map((b,i)=>({...b,q:fit.q[i],t:i===motion.pelvis?fit.pelvis:b.t})));
        const hips = world[motion.pelvis].p;
        assert.ok(Math.abs(hips[0])<.01 && Math.abs(hips[2])<.13, clip + ' keeps hips over cushion');
        assert.ok(Math.abs(hips[1]-seat.seatHeight-.086*rig.stride)<.005);
        for (const side of ['l','r']) {
          const foot=rig.index.get('foot_'+side), sole=world[foot].p[1]-(rig.bind||rig.world)[foot].p[1];
          assert.ok(sole>=footHeight(seat)-.007, clip + ' clears its support');
          if(rig.height>1.9)assert.ok(Math.abs(sole-footHeight(seat))<.008, clip + ' plants reachable feet');
        }
        if (!first) first=hips;
        assert.ok(hips.every((v,i)=>Math.abs(v-first[i])<.0001),'breathing keeps the pelvis planted');
        const sheet=fitPose(motion, rig, pose, undefined, sheetSeats[clip]);
        const baked=restWorld(rig.bones.map((b,i)=>({...b,q:sheet.q[i],t:i===motion.pelvis?sheet.pelvis:b.t})));
        assert.ok(Math.abs(baked[motion.pelvis].p[1]+seat.seatHeight-hips[1])<.0001);
      }
      const halfway = {...seat,clip,weight:.5};
      const mid = fitPose(motion,rig,createAnimator(motion).update(0,{seat:halfway}),undefined,halfway);
      const legs = restWorld(rig.bones.map((b,i)=>({...b,q:mid.q[i],t:i===motion.pelvis?mid.pelvis:b.t})));
      for (const side of ['l','r']) {
        const ankle = rig.index.get('foot_'+side);
        assert.ok(legs[ankle].p[1]-(rig.bind||rig.world)[ankle].p[1]>=footHeight(seat)*.5-.01,clip+' clears support during descent');
      }
    }
  }
});
const extent = (built, test = () => true) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < built.position.length; i += 3) { if (!test(built.position[i], built.position[i + 1], built.position[i + 2], built.paint[i / 3])) continue; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], built.position[i + k]); hi[k] = Math.max(hi[k], built.position[i + k]); } } return { lo, hi }; };

test('the skeleton and its recorded movements are baked from a public-domain library', () => {
  assert.equal(meta.source.licence, 'CC0 1.0'); assert.equal(meta.bones.length, 53);
  assert.ok(meta.bones.every((bone, i) => bone.parent < i), 'parents come before children');
  for (const id of ['idle', 'walk', 'jog', 'sprint', 'air', 'land', 'jab', 'cross', 'roll', 'death', 'drive', 'sit', 'aim', 'shoot']) assert.ok(meta.clips.some(clip => clip.id === id), id);
  assert.equal(words.length, meta.clips.reduce((sum, clip) => sum + clip.frames, 0) * (3 + 53 * 4));
});

test('a body is grown from a design: it stands on the ground at its height, clothed, and every vertex is held by bones', () => {
  const built = buildBody({ ...DEFAULT_DESIGN }, meta, { detail: 'crowd' }), count = built.position.length / 3, { lo, hi } = extent(built);
  assert.ok(count > 3000 && count < 9000 && built.index.length % 3 === 0, `${count} vertices`);
  assert.ok(lo[1] > -.03 && lo[1] < .03 && Math.abs(hi[1] - 1.76) < .04, `feet at ${lo[1].toFixed(3)}, crown at ${hi[1].toFixed(3)}`);
  // It is modelled with the arms straight out, the way the skeleton rests.
  assert.ok(hi[0] > .8 && lo[0] < -.8 && hi[2] < .3 && lo[2] > -.3);
  for (let i = 0; i < count; i++) { const sum = built.skinWeight[i * 4] + built.skinWeight[i * 4 + 1] + built.skinWeight[i * 4 + 2] + built.skinWeight[i * 4 + 3]; assert.ok(Math.abs(sum - 1) < 1e-3); }
  for (const paint of ['skin', 'top', 'bottom', 'hair', 'shoe', 'iris']) assert.ok(built.paint.includes(PAINT[paint]), paint);
  assert.ok(built.position.every(Number.isFinite) && built.normal.every(Number.isFinite));
  // A hand is moved by the hand, a shin by the calf.
  const bone = name => built.rig.index.get(name), most = i => built.skinIndex[i * 4];
  let hands = 0, shins = 0;
  for (let i = 0; i < count; i++) { const x = built.position[i * 3], y = built.position[i * 3 + 1]; if (x > .8 && most(i) === bone('hand_l')) hands++; if (x > 0 && y > .2 && y < .4 && most(i) === bone('calf_l')) shins++; }
  assert.ok(hands > 10 && shins > 10);
});

test('builds differ: heavy and thin, tall and short, young and old, and nobody is a superhero by default', () => {
  const waist = design => { const built = buildBody({ top: 'bare', ...design }, meta, { detail: 'distant' }), mid = built.height * .62, { lo, hi } = extent(built, (x, y) => Math.abs(y - mid) < .04 && Math.abs(x) < .3); return { wide: hi[0] - lo[0], deep: hi[2] - lo[2], built }; };
  const thin = waist({ weight: -.8 }), plain = waist({}), heavy = waist({ weight: .9 }), strong = waist({ muscle: 1 });
  assert.ok(thin.wide < plain.wide - .015 && heavy.wide > plain.wide + .06 && heavy.deep > plain.deep + .08, `${thin.wide.toFixed(2)} / ${plain.wide.toFixed(2)} / ${heavy.wide.toFixed(2)} wide`);
  // An ordinary man is about 28 cm through the waist and a third of a metre across it, not a wedge.
  assert.ok(plain.wide > .26 && plain.wide < .34 && plain.deep > .17 && plain.deep < .25);
  const shoulders = built => { const y = built.rig.at('upperarm_l')[1], { lo, hi } = extent(built, (x, py, z) => Math.abs(py - y) < .12 && Math.abs(x) < .3); return hi[2] - lo[2]; };
  assert.ok(shoulders(strong.built) > shoulders(plain.built), 'muscle is a dial, and it is not turned up');
  assert.equal(heightOf({ height: 1.9 }), 1.9); assert.ok(heightOf({ age: 8 }) < 1.4 && heightOf({ age: 8 }) > 1.1); assert.ok(heightOf({ age: 85 }) < heightOf({ age: 30 }));
  const child = createRig(meta, { age: 8 }), adult = createRig(meta, {});
  assert.ok(child.factor.head > adult.factor.head && child.factor.legs < adult.factor.legs, 'a child has a large head and short legs for its height');
  const grey = palette({ age: 80, hair: '#101010' })[PAINT.hair], dark = palette({ age: 25, hair: '#101010' })[PAINT.hair];
  assert.ok(grey[0] > dark[0] * 5, 'hair greys');
  assert.ok(createRig(meta, { sex: 1 }).at('upperarm_l')[0] < adult.at('upperarm_l')[0], 'narrower shoulders');
  assert.ok(createRig(meta, { weight: 1 }).spread > .2 && adult.spread === 0, 'a broad body carries its arms wider');
});

test('every hair style and garment the designer offers can be grown', () => {
  for (const hairStyle of HAIR) { const built = buildBody({ hairStyle }, meta, { detail: 'distant' }); assert.equal(built.paint.includes(PAINT.hair), hairStyle !== 'bald', hairStyle); }
  for (const top of TOPS) assert.equal(buildBody({ top }, meta, { detail: 'distant' }).paint.includes(PAINT.top), top !== 'bare', top);
  for (const bottom of BOTTOMS) assert.ok(buildBody({ bottom, sex: 1 }, meta, { detail: 'distant' }).paint.includes(PAINT.bottom), bottom);
  const dressed = buildBody({ coat: 'puffer', hat: 'beanie', bag: 'backpack', glasses: 'shades', beard: 'beard', shoes: 'boots' }, meta, { detail: 'distant' });
  for (const paint of ['coat', 'hat', 'trim', 'frame', 'sole']) assert.ok(dressed.paint.includes(PAINT[paint]), paint);
});

test('designs: the dials are bounded, saved in the browser, and anybody can be drawn at random', () => {
  const keys = FIELDS.flatMap(({ sliders = [], choices = [], colours = [] }) => [...sliders, ...choices, ...colours].map(field => field[0]));
  assert.equal(new Set(keys).size, keys.length); assert.ok(keys.length > 60, `${keys.length} things to set`);
  const wild = tidy({ weight: 9, age: 2, hairStyle: 'wig', skin: 'red', top: 'hoodie' });
  assert.deepEqual([wild.weight, wild.age, wild.hairStyle, wild.skin, wild.top], [1, 6, DEFAULT_DESIGN.hairStyle, DEFAULT_DESIGN.skin, 'hoodie']);
  const kept = new Map(), storage = { getItem: key => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value) };
  assert.deepEqual(loadDesign(storage), tidy(null)); saveDesign({ ...DEFAULT_DESIGN, weight: .5, hat: 'cap' }, storage);
  assert.equal(loadDesign(storage).weight, .5); assert.equal(loadDesign(storage).hat, 'cap');
  const random = seeded(5), drawn = Array.from({ length: 200 }, () => randomDesign(random));
  assert.ok(drawn.some(d => d.weight > .5) && drawn.some(d => d.weight < -.3) && drawn.some(d => d.age < 16) && drawn.some(d => d.age > 65) && drawn.some(d => d.sex > .5) && drawn.some(d => d.sex < .5));
  for (const design of drawn.slice(0, 3)) assert.ok(buildBody(design, meta, { detail: 'distant' }).position.length > 3000);
});

test('the movements nobody recorded are written out, and all of them leave the body in one piece', () => {
  for (const id of ['guard', 'kick', 'fall', 'vault', 'climb', 'door', 'getIn', 'getOut', 'carjack', 'thrown', 'breakIn', 'handsUp', 'cower', 'flinch', 'knocked', 'lying', 'getUp', 'stumble', 'kneel', 'cuffed', 'cuffing']) {
    const clip = motion.clip(id); assert.ok(clip.written && clip.seconds > .3, id);
    for (let t = 0; t <= clip.seconds; t += clip.seconds / 6) { const pose = motion.sample(id, t); assert.ok(pose.q.every(Number.isFinite) && pose.pelvis.every(Number.isFinite)); for (let i = 0; i < motion.count; i++) assert.ok(Math.abs(Math.hypot(...pose.q.subarray(i * 4, i * 4 + 4)) - 1) < 1e-3, `${id}: a turn is a turn`); }
  }
  // Where a bone ends up: follow the turns down from the root.
  const rig = createRig(meta, {}), fitted = { q: [], pelvis: [0, 0, 0] };
  const where = (id, time, name) => {
    fitPose(motion, rig, motion.sample(id, time), fitted); const world = [];
    rig.bones.forEach((bone, i) => { const t = i === motion.pelvis ? fitted.pelvis : bone.t; if (bone.parent < 0) { world[i] = { p: t, q: fitted.q[i] }; return; } const parent = world[bone.parent], [x, y, z, w] = parent.q, tx = 2 * (y * t[2] - z * t[1]), ty = 2 * (z * t[0] - x * t[2]), tz = 2 * (x * t[1] - y * t[0]); const r = [t[0] + w * tx + y * tz - z * ty, t[1] + w * ty + z * tx - x * tz, t[2] + w * tz + x * ty - y * tx]; const a = parent.q, b = fitted.q[i]; world[i] = { p: [parent.p[0] + r[0], parent.p[1] + r[1], parent.p[2] + r[2]], q: [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]] }; });
    return world[rig.index.get(name)].p;
  };
  assert.ok(Math.abs(where('idle', 0, 'foot_l')[1] - .1) < .06 && where('idle', 0, 'Head')[1] > 1.45, 'standing, the feet are on the ground');
  assert.ok(where('kick', .29, 'foot_r')[1] > .8 && where('kick', .29, 'foot_r')[2] > .5, 'a kick puts the foot out in front at waist height');
  assert.ok(where('handsUp', 0, 'hand_l')[1] > 1.6 && where('handsUp', 0, 'hand_r')[1] > 1.6);
  assert.ok(where('lying', 0, 'Head')[1] < .45 && where('kneel', 0, 'pelvis')[1] < .65);
  assert.ok(where('cuffed', 0, 'hand_l')[2] < -.05 && where('cuffed', 0, 'hand_r')[2] < -.05, 'hands behind the back');
  assert.ok(where('climb', .22, 'hand_l')[1] > where('idle', 0, 'Head')[1] + .15, `reaching up for the edge: ${where('climb', .22, 'hand_l')[1].toFixed(2)}`);
  assert.ok(where('vault', .4, 'pelvis')[1] > where('idle', 0, 'pelvis')[1] + .3);
});

test('the animator runs standing into walking into sprinting, and puts a punch, a jump and a fall over them', () => {
  const animator = createAnimator(motion), still = motion.newPose(), dt = 1 / 60;
  for (let i = 0; i < 30; i++) animator.update(dt, { speed: 0 });
  motion.blend(animator.update(dt, { speed: 0 }), animator.update(dt, { speed: 0 }), 0, still);
  const idle = motion.sample('idle', 0), differs = (a, b) => { let d = 0; for (let i = 0; i < a.q.length; i++) d += Math.abs(Math.abs(a.q[i]) - Math.abs(b.q[i])); return d; };
  assert.ok(differs(still, idle) < 2, 'at rest it is the idle');
  let pose; for (let i = 0; i < 60; i++) pose = animator.update(dt, { speed: 7.5 });
  assert.ok(differs(pose, idle) > 4, 'sprinting is not standing');
  animator.punch(false); assert.equal(animator.playing, 'jab'); for (let i = 0; i < 40; i++) animator.update(dt, { speed: 0 });
  assert.equal(animator.playing, null, 'a punch is over in half a second');
  animator.punch(true); assert.equal(animator.playing, 'cross', 'left, then right');
  for (let i = 0; i < 90; i++) pose = animator.update(dt, { speed: 0, grounded: false });
  assert.ok(differs(pose, motion.sample('air', 0)) > 1, 'a long drop becomes a fall');
  animator.update(dt, { speed: 0, grounded: true, impact: 12 }); assert.equal(animator.playing, 'roll', 'a hard landing is rolled out of');
  animator.play('kick'); for (let i = 0; i < 60; i++) pose = animator.update(dt, { speed: 0, guard: true });
  assert.ok(pose.q.every(Number.isFinite));
  for (let i = 0; i < 60; i++) pose = animator.update(dt, { speed: 0, held: 'kneel' });
  assert.ok(differs(pose, motion.sample('kneel', 0)) < 3);
});

test('the cast covers the street, and each is grown once and drawn many times in its own colours', async () => {
  assert.ok(CAST.length >= 40);
  for (const outfit of ['suit', 'office', 'summer', 'athletic', 'evening', 'visitor', 'worker', 'casual']) for (const woman of [true, false]) assert.equal(CAST[castFor(outfit, seeded(3), woman)].woman, woman, `${outfit}`);
  const weights = CAST.map(member => member.design.weight);
  assert.ok(weights.filter(w => w >= .6).length >= 10 && weights.filter(w => w < 0).length >= 8 && CAST.some(member => member.child) && CAST.filter(member => member.old).length >= 3, 'heavy, thin, young and old are all there');
  assert.ok(CAST.every(member => (member.design.muscle || 0) <= .5), 'and no one is built like a superhero');
  const figures = createFigures({ motion, meta, capacity: 8, worker: false, clips: ['idle', 'walk', 'sit', 'knocked'] });
  assert.equal(figures.ready(0), false); figures.ask(0); figures.ask(4);
  for (let i = 0; i < 200 && !(figures.ready(0) && figures.ready(4)); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(figures.ready(0) && figures.ready(4));
  const type = figures.types.get(0);
  assert.ok(type.near.mesh.geometry.getAttribute('position').count > type.far.mesh.geometry.getAttribute('position').count * 1.8, 'a coarser body for far off');
  assert.equal(figures.poseTexture.image.height, [...figures.rows.values()].reduce((sum, row) => sum + row.count, 0));
  figures.begin();
  const look = dress('casual', seeded(2));
  assert.ok(figures.add(0, 1, 0, 2, .5, 1.8, look, 5, 'walk', .4)); assert.ok(figures.add(0, 3, 0, 2, 0, 1.7, look, 80, 'idle', 0)); assert.ok(figures.add(9, 5, 0, 2, 0, 1.6, look, 5, 'sit', 0), 'someone not grown yet is stood in for');
  figures.end();
  assert.equal(type.near.mesh.count + type.far.mesh.count + figures.types.get(4).near.mesh.count, 3); assert.equal(type.far.mesh.count, 1);
  const anim = type.near.anim, walk = figures.rows.get('walk');
  assert.ok(anim.getX(0) >= walk.first && anim.getX(0) < walk.first + walk.count && anim.getY(0) === anim.getX(0) + 1 && anim.getZ(0) >= 0 && anim.getZ(0) < 1);
  const paints = paletteOf(look); assert.equal((paints[PAINT.top * 4] << 16) | (paints[PAINT.top * 4 + 1] << 8) | paints[PAINT.top * 4 + 2], look.under ?? look.top);
  assert.ok(STREET_CLIPS.every(id => motion.clips.has(id)));
  // A shader for it: the pose and the colours are both looked up.
  const shader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  figures.material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uNycPoses && shader.uniforms.uNycPalette && /nycSkin \* vec4\( transformed/.test(shader.vertexShader) && /vPerson/.test(shader.fragmentShader));
  figures.dispose();
});


import { createFigures as bakedFigures } from '../dist/crowd.js';
{
const meta = JSON.parse(readFileSync(new URL('../dist/people.json', import.meta.url), 'utf8'));
const file = readFileSync(new URL('../dist/people.bin', import.meta.url)), poses = new Int16Array(file.buffer, file.byteOffset, file.byteLength / 2);

test('the baked figures are a man and a woman who stand on the ground and stride on the spot', () => {
  assert.deepEqual(meta.figures.map(figure => figure.id), ['man', 'woman']);
  assert.equal(meta.source.licence, 'CC0 1.0'); assert.deepEqual([meta.frames, meta.sitFrame], [meta.walkFrames + 2, meta.walkFrames + 1], 'the stride, then standing, then sitting');
  assert.equal(poses.length, meta.figures.reduce((sum, figure) => sum + figure.vertices, 0) * meta.frames * 3);
  let offset = 0;
  for (const figure of meta.figures) {
    assert.ok(figure.vertices > 800 && figure.vertices < 3000 && figure.faces.length % 3 === 0 && figure.faces.every(i => i >= 0 && i < figure.vertices), `${figure.id}: ${figure.vertices} vertices`);
    assert.ok(figure.paint.length === figure.vertices && [0, 1, 2, 3, 4].every(paint => figure.paint.includes(paint)), 'skin, top, bottom, hair and shoes are all there');
    assert.ok(figure.bare.includes(1) && figure.bare.includes(2), 'forearms and shins can go bare');
    for (let f = 0; f < meta.frames; f++) {
      let low = Infinity, high = -Infinity, back = Infinity, front = -Infinity, side = 0;
      for (let i = 0; i < figure.vertices; i++) { const o = offset + (f * figure.vertices + i) * 3, x = poses[o] / 16000, y = poses[o + 1] / 16000, z = poses[o + 2] / 16000; low = Math.min(low, y); high = Math.max(high, y); back = Math.min(back, z); front = Math.max(front, z); side = Math.max(side, Math.abs(x)); }
      // Sitting, the head is about a foot lower and the feet are still on the ground.
      const tall = f === meta.sitFrame ? figure.height - .34 : figure.height;
      assert.ok(low > -.03 && low < .12 && Math.abs(high - tall) < .08, `${figure.id} frame ${f}: feet at ${low.toFixed(2)}, head at ${high.toFixed(2)}`);
      assert.ok(side < .6 && back > -.7 && front < .8, 'it stays over its own feet');
    }
    offset += figure.vertices * meta.frames * 3;
  }
});

test('the crowd takes the modelled figures in place of the blocked-out ones', () => {
  const figures = bakedFigures(meta, poses), total = meta.figures.reduce((sum, figure) => sum + figure.vertices, 0);
  assert.equal(figures.geometry.getAttribute('position').count, total); assert.equal(figures.geometry.getAttribute('aVertex').getX(total - 1), total - 1);
  assert.deepEqual([figures.texture.image.width, figures.texture.image.height], [total, meta.frames]);
  const body = figures.geometry.getAttribute('aBody');
  assert.deepEqual([body.getZ(0), body.getZ(total - 1)], [1, 2], 'each vertex says whose body it is');
  assert.equal(figures.material.flatShading, true);
  figures.geometry.dispose(); figures.material.dispose(); figures.texture.dispose();
  const crowd = createCrowd({ life: { crowding: () => 0, wardrobe: () => ({}) }, capacity: 8 });
  assert.equal(crowd.modelled, false);
  const gait = crowd.mesh.geometry.getAttribute('aGait');
  crowd.setFigures(meta, poses);
  assert.equal(crowd.modelled, true); assert.equal(crowd.mesh.geometry.getAttribute('aGait'), gait, 'each person keeps their colours and stride');
  assert.equal(crowd.mesh.material.name, 'People, modelled'); assert.equal(KIT.woman, 64);
  // Each person is drawn with one body, not both: the man's in one draw, the woman's in another.
  const [men, women] = [crowd.mesh, crowd.mesh.children[0]], faces = meta.figures.map(figure => figure.faces.length);
  assert.deepEqual([men.geometry.index.count, women.geometry.index.count], faces);
  assert.equal(men.geometry.getAttribute('position'), women.geometry.getAttribute('position'), 'over the same vertices');
  assert.notEqual(men.geometry.getAttribute('aGait'), women.geometry.getAttribute('aGait'));
  const look = { top: 1, bottom: 2, skin: 3, hair: 4, height: 1.72 };
  crowd.setExtras([{ x: 0, y: 0, z: 0, look: { ...look, kit: 0 } }, { x: 1, y: 0, z: 0, look: { ...look, kit: KIT.woman } }, { x: 2, y: 0, z: 0, look: { ...look, kit: KIT.woman | KIT.longHair } }]);
  crowd.update(.016, { walks: [], focus: { x: 0, z: 0 }, hours: 12, time: 0, junctions: [], cars: [] });
  assert.deepEqual([men.count, women.count], [1, 2]);
  // Someone sitting is told to the shader as a stride of less than nothing.
  crowd.setExtras([{ x: 0, y: 0, z: 0, sitting: true, look: { ...look, kit: 0 } }]);
  crowd.update(.016, { walks: [], focus: { x: 0, z: 0 }, hours: 12, time: 0, junctions: [], cars: [] });
  assert.equal(men.geometry.getAttribute('aGait').getY(0), -1);
  crowd.setExtras([{ x: 0, y: 0, z: 0, look: { ...look, kit: 0 } }, { x: 1, y: 0, z: 0, look: { ...look, kit: KIT.woman } }, { x: 2, y: 0, z: 0, look: { ...look, kit: KIT.woman | KIT.longHair } }]);
  crowd.update(.016, { walks: [], focus: { x: 0, z: 0 }, hours: 12, time: 0, junctions: [], cars: [] });
  assert.equal(women.geometry.getAttribute('aGait').getW(1), KIT.woman | KIT.longHair);
  crowd.dispose();
});
}
