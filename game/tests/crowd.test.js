import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCrowd, createWalkNetwork, along, dress, chooseOutfit, personGeometry, createPersonMaterial, seeded, KIT } from '../dist/crowd.js';
import { OUTFITS } from '../dist/citylife.js';
import { planJunction, crossingAspect } from '../dist/signal-plan.js';

// A stretch of kerb from a to b with the roadway on the side `normal` points to.
function run(id, a, b, normal, depth = 3.2) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { id, points: [a, b], normals: [normal], lengths: [0, length], length, depth };
}
// A block corner at the origin: an avenue (18 m, along Z) west of x = -9 .. 9, a street (10 m, along X) across z = -5 .. 5.
// Four sidewalks meet the junction; each kerb run ends at its corner.
const corner = () => [
  run('ne-ave', [9, -100], [9, -5], [-1, 0]), run('ne-st', [9, -5], [100, -5], [0, 1]),
  run('se-ave', [9, 100], [9, 5], [-1, 0]), run('se-st', [9, 5], [100, 5], [0, -1]),
  run('nw-ave', [-9, -100], [-9, -5], [1, 0]), run('sw-ave', [-9, 100], [-9, 5], [1, 0]),
];
const isRoad = (x, z) => Math.abs(x) < 9 || Math.abs(z) < 5;
const life = (perMetre = .2, shares = { casual: 1 }) => ({ crowding: () => perMetre, wardrobe: () => shares });
const arm = (angle, width, flow = 'both') => ({ angle, width, inbound: flow !== 'out', outbound: flow !== 'in' });
const junction = () => { const arms = [arm(Math.PI, 18), arm(0, 18), arm(Math.PI / 2, 10), arm(-Math.PI / 2, 10)]; return { id: 'j', x: 0, z: 0, arms, plan: planJunction({ arms }) }; };

test('people are dressed for the outfit they are given, from one wide range of skin and hair', () => {
  const random = seeded(7), looks = {};
  for (const outfit of OUTFITS) looks[outfit] = Array.from({ length: 300 }, () => dress(outfit, random));
  for (const [outfit, list] of Object.entries(looks)) for (const look of list) {
    assert.equal(look.outfit, outfit);
    assert.ok(look.height >= 1.5 && look.height <= 1.95 && look.build >= .9 && look.build <= 1.15 && look.pace > .9 && look.pace < 2.7);
    for (const key of ['top', 'bottom', 'skin', 'hair']) assert.ok(Number.isInteger(look[key]) && look[key] >= 0 && look[key] <= 0xffffff, key);
  }
  const luminance = hex => { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
  const mean = (list, f) => list.reduce((sum, item) => sum + f(item), 0) / list.length;
  // Suits are dark and long-sleeved; office shirts are pale; evening clothes are dark; visitors are bright and carry backpacks.
  assert.ok(mean(looks.suit, l => luminance(l.top)) < .05 && looks.suit.every(l => !(l.kit & KIT.shortSleeves) && !(l.kit & KIT.shorts)));
  assert.ok(mean(looks.office, l => luminance(l.top)) > .5);
  assert.ok(mean(looks.evening, l => luminance(l.top)) < .03);
  assert.ok(mean(looks.visitor, l => l.kit & KIT.backpack ? 1 : 0) > .4 && mean(looks.casual, l => l.kit & KIT.backpack ? 1 : 0) < .3);
  assert.ok(looks.summer.every(l => l.kit & KIT.shorts) && mean(looks.athletic, l => l.pace) > mean(looks.casual, l => l.pace) + .5, 'runners run');
  // The same range of skin and hair whatever the outfit, and so whatever the neighbourhood.
  for (const list of Object.values(looks)) {
    assert.ok(new Set(list.map(l => l.skin)).size >= 9 && new Set(list.map(l => l.hair)).size >= 9);
    const tones = list.map(l => luminance(l.skin)).sort((a, b) => a - b);
    assert.ok(tones[30] < .08 && tones[270] > .35, 'from deep brown to pale, in every group');
  }
  // Outfits are drawn in the proportions asked for.
  const drawn = {}; for (let i = 0; i < 4000; i++) { const o = chooseOutfit({ suit: .2, office: .3, casual: .5 }, random); drawn[o] = (drawn[o] || 0) + 1; }
  assert.ok(Math.abs(drawn.suit / 4000 - .2) < .03 && Math.abs(drawn.office / 4000 - .3) < .03 && Math.abs(drawn.casual / 4000 - .5) < .03);
  assert.equal(chooseOutfit({}, random), 'casual');
});

test('the figure is one closed, tagged mesh a person\'s height', () => {
  const geometry = personGeometry(), position = geometry.getAttribute('position'), body = geometry.getAttribute('aBody'), count = position.count;
  assert.equal(count % 3, 0); assert.ok(count / 3 > 250 && count / 3 < 900, `${count / 3} triangles`);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  assert.ok(box.min.y >= 0 && box.min.y < .02 && box.max.y > 1.7 && box.max.y < 1.78, `stands ${box.max.y.toFixed(2)} m tall`);
  assert.ok(box.max.x - box.min.x < .62 && box.max.z - box.min.z < .5);
  const parts = new Set(), limbs = new Set(), kits = new Set();
  for (let i = 0; i < count; i++) {
    parts.add(body.getX(i)); limbs.add(body.getY(i)); kits.add(body.getZ(i));
    // Legs hang below the hip and arms below the shoulder, so swinging them never tears the body.
    if (body.getY(i) === 1 || body.getY(i) === 2) assert.ok(position.getY(i) <= .935);
    if (body.getY(i) >= 3) assert.ok(position.getY(i) <= 1.425 && Math.abs(position.getX(i)) > .15);
    // Left limbs are on the left.
    if (body.getY(i) === 1 || body.getY(i) === 3) assert.ok(position.getX(i) < 0);
  }
  assert.deepEqual([...parts].sort(), [0, 1, 2, 3, 4, 5]); assert.deepEqual([...limbs].sort(), [0, 1, 2, 3, 4]); assert.deepEqual([...kits].sort(), [0, 1, 2, 3, 4]);
  // Every triangle faces the way its normals say, so the figure is solid from outside.
  const normal = geometry.getAttribute('normal'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let inward = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    const face = b.clone().sub(a).cross(c.clone().sub(a));
    n.fromBufferAttribute(normal, i).add(new THREE.Vector3().fromBufferAttribute(normal, i + 1)).add(new THREE.Vector3().fromBufferAttribute(normal, i + 2));
    if (face.lengthSq() > 1e-14 && face.dot(n) < 0) inward++;
  }
  assert.equal(inward, 0);
  // The shader paints by part and swings limbs; it leaves the stock material otherwise alone.
  const shader = { vertexShader: 'void main() {\n#include <begin_vertex>\n}', fragmentShader: 'void main() {\n#include <color_fragment>\n}' };
  createPersonMaterial().onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec4 aGait;/); assert.match(shader.vertexShader, /uNycTime \* aGait\.z/);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= vPerson;/);
  for (const word of ['flat', 'cast', 'patch', 'sample', 'filter', 'input', 'output', 'common', 'active', 'half']) assert.ok(!new RegExp(`\\b(?:float|vec[234]|int|bool)\\s+${word}\\b`).test(shader.vertexShader), `"${word}" is reserved in GLSL`);
});

test('sidewalks join at corners and across the roadway, and nowhere else', () => {
  const walks = corner(), network = createWalkNetwork(walks, { isRoad }), by = id => walks.find(w => w.id === id);
  assert.deepEqual(along(by('ne-ave'), 47.5), { x: 9, z: -52.5, nx: -1, nz: 0, tx: 0, tz: 1 });
  // Walking south down the avenue's east sidewalk to the corner: turn east along the street,
  // cross the street to the sidewalk beyond, or cross the avenue.
  const links = network.linksFrom(by('ne-ave'), 1), kinds = Object.fromEntries(links.map(link => [link.run.id, link.kind]));
  assert.deepEqual(kinds, { 'ne-st': 'turn', 'se-ave': 'cross', 'se-st': 'cross', 'nw-ave': 'cross' });
  const over = links.find(link => link.run.id === 'se-ave');
  assert.deepEqual([over.from, over.to, over.distance, over.end], [[9, -5], [9, 5], 10, 1], 'ten metres, kerb to kerb, arriving at that run\'s corner end');
  assert.equal(links.find(link => link.run.id === 'nw-ave').distance, 18);
  // At the far end of the block the only way on is over the avenue to the sidewalk opposite.
  assert.deepEqual(network.linksFrom(by('ne-ave'), 0).map(link => [link.run.id, link.kind, link.distance]), [['nw-ave', 'cross', 18]]);
  // A stretch with nothing near either end offers nothing, and its walkers turn back.
  const lonely = [run('alone', [500, 500], [560, 500], [0, 1])];
  assert.deepEqual(createWalkNetwork(lonely, { isRoad }).linksFrom(lonely[0], 1), []);
  // With buildings where the roadway should be, nobody crosses.
  assert.deepEqual(createWalkNetwork(walks, { isRoad: () => false }).linksFrom(by('ne-ave'), 1).map(link => link.kind), ['turn']);
  assert.equal(network.linksFrom(by('ne-ave'), 1), links, 'links are worked out once');
});

test('a street fills to the density the city model asks for, and empties when it asks for less', () => {
  const crowd = createCrowd({ life: life(.2), capacity: 400, range: 150, random: seeded(3) }), walks = corner();
  const context = { walks, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] };
  crowd.update(.016, context);
  // Six stretches of 95 m at one person every five metres.
  const expected = walks.reduce((sum, w) => sum + w.length, 0) * .2;
  assert.ok(Math.abs(crowd.count - expected) < expected * .08, `${crowd.count} people for ${expected.toFixed(0)} expected`);
  assert.equal(crowd.mesh.count, crowd.count);
  for (const person of crowd.people) {
    // On the sidewalk: inside the kerb line, never in the roadway.
    assert.ok(!isRoad(person.x, person.z), `someone stands in the road at ${person.x.toFixed(1)}, ${person.z.toFixed(1)}`);
    assert.ok(person.lane >= .5 && person.lane <= person.run.depth);
  }
  // Half of them go each way.
  const north = crowd.people.filter(p => p.way > 0).length / crowd.count;
  assert.ok(north > .35 && north < .65);
  // The hour changes: a tenth of the people.
  const quiet = createCrowd({ life: { crowding: (x, z, hours) => hours > 20 ? .02 : .2, wardrobe: () => ({ casual: 1 }) }, capacity: 400, range: 150, random: seeded(3) });
  quiet.update(.016, context);
  const before = quiet.count;
  for (let i = 0; i < 60 * 40; i++) quiet.update(1 / 60, { ...context, hours: 22, time: i / 60 });
  assert.ok(quiet.count < before * .35, `${before} thinned to ${quiet.count}`);
  // More asked for than can be drawn: the cap holds and every stretch keeps its share.
  const packed = createCrowd({ life: life(3), capacity: 120, range: 150, random: seeded(5) });
  packed.update(.016, context);
  assert.ok(packed.count <= 120 && packed.count > 100);
  assert.equal(new Set(packed.people.map(p => p.run.id)).size, walks.length);
});

test('walkers keep to the sidewalk, turn corners, and wait for the walk signal before crossing', () => {
  const walks = corner(), j = junction();
  // Timid walkers only: nobody crosses against the hand.
  const crowd = createCrowd({ life: life(.12), capacity: 300, range: 150, random: seeded(11) });
  const context = time => ({ walks, focus: { x: 0, z: 0 }, hours: 13, time, junctions: [j], cars: [] });
  crowd.update(.016, context(0));
  for (const person of crowd.people) person.bold = false;
  let crossed = 0, turned = 0, waited = 0;
  const runOf = new Map(crowd.people.map(p => [p, p.run]));
  for (let i = 0; i < 60 * 240; i++) {
    const time = i / 60;
    crowd.update(1 / 60, context(time));
    for (const person of crowd.people) {
      if (person.bold) person.bold = false;
      if (person.state === 'cross') {
        // The far ends of these blocks have no signal; there people cross in a gap, as anywhere mid-block.
        const atJunction = Math.hypot((person.hop.from[0] + person.hop.to[0]) / 2, (person.hop.from[1] + person.hop.to[1]) / 2) < 30;
        if (!atJunction) continue;
        // Whoever is in the roadway started on a walk signal: by now it shows walk or the flashing hand.
        const heading = Math.atan2(person.hop.to[0] - person.hop.from[0], person.hop.to[1] - person.hop.from[1]);
        const group = Math.abs(Math.sin(heading)) > .5 ? 0 : 1; // walking east-west crosses the avenue
        const aspect = crossingAspect(j.plan, group, time).aspect;
        if (person.progress < .1) assert.notEqual(aspect, 'dont', `stepped off against the hand at ${time.toFixed(1)}`);
        assert.ok(isRoad(person.x, person.z) || person.progress < .08 || person.progress > .92);
      } else assert.ok(!isRoad(person.x, person.z), `${person.state} in the road at ${person.x.toFixed(1)}, ${person.z.toFixed(1)}`);
      if (person.state === 'wait') waited++;
      // Someone now on a different stretch without having crossed has turned a corner.
      if (runOf.has(person) && runOf.get(person) !== person.run && person.state === 'walk' && !person.justCrossed) turned++;
      person.justCrossed = person.state === 'cross';
      runOf.set(person, person.run);
    }
    crossed += crowd.crossing.length ? 1 : 0;
  }
  assert.ok(crossed > 200, 'people did cross'); assert.ok(waited > 500, 'and stood at the kerb for the signal');
  assert.ok(crowd.crossing.every(person => person.state === 'cross'));
  assert.ok(turned > 5, `${turned} corners turned`);
});

test('with no signal, or a bold New Yorker, the gap in traffic decides', () => {
  const walks = corner();
  const start = () => { const crowd = createCrowd({ life: life(0), capacity: 10, range: 150, random: seeded(2) }); crowd.update(.016, { walks, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] }); return crowd; };
  const waiting = crowd => {
    // Put one person at the corner, wanting to cross the street.
    const network = createWalkNetwork(walks, { isRoad }), hop = network.linksFrom(walks[0], 1).find(link => link.run.id === 'se-ave');
    crowd.people.length = 0;
    crowd.people.push({ run: walks[0], s: walks[0].length, way: 1, lane: 1, look: dress('casual', seeded(1)), state: 'wait', hop, wait: 0, bold: true, phase: 0, y: 0, sample: 0, age: 5, shove: [0, 0], x: 9, z: -5, heading: 0 });
    return crowd.people[0];
  };
  const car = (speed, z = 0, x = 30) => ({ x, z, speed, _kerb: false });
  const hop = createWalkNetwork(walks, { isRoad }).linksFrom(walks[0], 1).find(link => link.run.id === 'se-ave'), middle = [(hop.from[0] + hop.to[0]) / 2, (hop.from[1] + hop.to[1]) / 2];
  const from = item => Math.hypot(item.x - middle[0], item.z - middle[1]);
  assert.ok(from(car(0)) > 14 && from(car(0)) < 24 && from(car(0, middle[1], middle[0] + 8)) < 14);
  // A car bearing down: wait. The same car standing down the block at the light, or parked: go.
  // A car standing at the crossing itself is waiting to go: nobody steps out in front of it, unless it has been left there.
  const cases = [[[car(9)], false, 'a car coming'], [[car(0)], true, 'a car standing down the block'], [[{ ...car(9), _kerb: true }], true, 'a car at the kerb'], [[car(9, 400)], true, 'a car far away'], [[], true, 'an empty street'],
    [[car(0, middle[1], middle[0] + 8)], false, 'a car standing at the crossing'], [[{ ...car(0, middle[1], middle[0] + 8), parked: true }], true, 'a car left standing at the crossing']];
  for (const [cars, goes, what] of cases) {
    const crowd = start(), person = waiting(crowd);
    for (let i = 0; i < 90; i++) crowd.update(1 / 60, { walks, focus: { x: 0, z: 0 }, hours: 13, time: i / 60, junctions: [], cars });
    assert.equal(person.state !== 'wait', goes, what);
  }
  // At a signal showing the hand, the bold cross in a gap and the timid do not.
  const j = junction(), red = j.plan.offset + j.plan.lead[0] + j.plan.green[0] + 6;
  assert.equal(crossingAspect(j.plan, 1, red).aspect, 'dont');
  for (const bold of [true, false]) {
    const crowd = start(), person = waiting(crowd); person.bold = bold;
    for (let i = 0; i < 60; i++) crowd.update(1 / 60, { walks, focus: { x: 0, z: 0 }, hours: 13, time: red + i / 60, junctions: [j], cars: [] });
    assert.equal(person.state !== 'wait', bold);
  }
});

test('people leave with the streets they were on, and step back from a passing car', () => {
  const walks = corner(), crowd = createCrowd({ scene: new THREE.Scene(), life: life(.1), capacity: 200, range: 150, random: seeded(9) });
  crowd.update(.016, { walks, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] });
  assert.ok(crowd.count > 30);
  // A car driven along the kerb: those within reach are pushed aside, the rest untouched.
  const victim = crowd.people.find(p => p.run.id === 'ne-ave' && p.state === 'walk');
  crowd.update(.016, { walks, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [], player: { mode: 'drive', x: victim.x - 1.5, z: victim.z, velocityX: 0, velocityZ: 8 } });
  assert.ok(victim.shove[0] > .5, 'pushed away from the car');
  assert.ok(crowd.people.filter(p => Math.hypot(p.shove[0], p.shove[1]) > .01).length < 6);
  // Half the streets unload.
  const fewer = walks.slice(0, 3);
  crowd.update(.016, { walks: fewer, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] });
  assert.ok(crowd.people.every(p => fewer.includes(p.run)));
  // A journey across the city starts a fresh crowd.
  crowd.update(.016, { walks: fewer, focus: { x: 5000, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] });
  assert.equal(crowd.count, 0);
  crowd.dispose();
});
