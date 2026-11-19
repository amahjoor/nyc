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
    // Children are among them now: the shortest of the cast is a nine-year-old.
    assert.ok(look.height >= 1.1 && look.height <= 1.95 && look.build >= .9 && look.build <= 1.15 && look.pace > .9 && look.pace < 2.7);
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
  assert.deepEqual([...parts].sort(), [0, 1, 2, 3, 4, 5, 6]); assert.deepEqual([...limbs].sort(), [0, 1, 2, 3, 4]); assert.deepEqual([...kits].sort(), [0, 1, 2, 3, 4, 8]);
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
  const cases = [[[car(9)], false, 'a car coming'], [[car(0)], true, 'a car standing down the block'], [[{ ...car(9), _kerb: true }], true, 'a car at the kerb'], [[car(9, 400)], true, 'a car far away'], [[{ ...car(9), y: 6 }], true, 'traffic on the bridge above the crossing'], [[], true, 'an empty street'],
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
  const crowd=start(), lead=waiting(crowd), queuePoint={x:10,z:-5.35};
  Object.assign(lead,{...queuePoint,queuePoint,bold:false,look:{...lead.look,build:1,height:1.72,pace:1.5}});
  for(let i=1;i<=2;i++)crowd.people.push({...lead,z:lead.z-i*.85,s:lead.s-i*.85,shove:[0,0]});
  const crossed=new Set();
  for(let i=0;i<480;i++){
    const held=i<60;
    crowd.update(.05,{walks,focus:{x:0,z:0},hours:13,time:red,junctions:held?[j]:[],cars:[]});
    for(const [index,p] of crowd.people.entries()){
      if(held)assert.equal(p.state,'wait');
      if(p.run===hop.run)crossed.add(p);
      for(const q of crowd.people.slice(index+1))assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=.64,'space at a shared crossing');
    }
  }
  assert.equal(crossed.size,3,'the entire queue makes it across when the street clears');
  crowd.dispose();
});

test('cars only strike, startle or nudge pedestrians on the same road level', () => {
  for (const [floor, road] of [[0, 6], [6, 0], [6, 6]]) {
    for (const [speed, offset, response] of [[12, 0, 'hit'], [8, 6, 'flinch'], [4, 0, 'step back']]) {
      const walks = corner(), crowd = createCrowd({ life: life(.1), range: 150, heightAt: () => floor, random: seeded(9) });
      const frame = { walks, junctions: [], cars: [], hours: 13, time: 1, focus: { x: 0, z: 0 } };
      crowd.update(0, frame);
      const person = crowd.people.find(p => p.s > 10 && p.s < p.run.length - 10);
      crowd.people.splice(0, crowd.people.length, person);
      // Exercise a newly placed person's first frame before their height sample.
      person.y = null;
      const car = { x: person.x - (response === 'step back' ? 2 : 0), y: road, z: person.z - offset,
        angle: 0, speed, velocityZ: speed, mode: 'drive', controlled: true };
      crowd.update(1/60, { ...frame, cars: [car], player: car });
      const together = floor === road;
      assert.equal(crowd.struck.length, Number(together && response === 'hit'), response);
      assert.equal(crowd.scares, Number(together && response === 'flinch'), response);
      assert.equal(person.state === 'down', together && response === 'hit', response);
      if (response === 'step back') assert.equal(Math.hypot(...person.shove) > .1, together);
      if (!together) {
        assert.equal(crowd.alarm(person.x, person.z, 14, .9, { y: road }), 0, 'a collision on another deck does not scatter the crowd');
        assert.equal(Math.hypot(...person.shove), 0);
      }
      crowd.dispose();
    }
  }
});

test('people leave with the streets they were on, and step back from a passing car', () => {
  const walks = corner(), crowd = createCrowd({ scene: new THREE.Scene(), life: life(.1), capacity: 200, range: 150, random: seeded(9) });
  crowd.update(.016, { walks, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] });
  assert.ok(crowd.count > 30);
  // A car creeping along the kerb: those within reach are pushed aside, the rest untouched.
  const victim = crowd.people.find(p => p.run.id === 'ne-ave' && p.state === 'walk');
  crowd.update(.016, { walks, focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [], player: { mode: 'drive', x: victim.x - 1.5, z: victim.z, velocityX: 0, velocityZ: 4 } });
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

test('the player and shop staff are drawn after the crowd, with their own stride', () => {
  const crowd = createCrowd({ life: life(.2), capacity: 400, range: 150, random: seeded(3) });
  const context = { walks: corner(), focus: { x: 0, z: 0 }, hours: 13, time: 0, junctions: [], cars: [] };
  const look = { top: 0xff0000, bottom: 0x0000ff, skin: 0x00ff00, hair: 0x000000, kit: 64, height: 1.72 };
  crowd.setExtras([{ x: 7, y: 2, z: -3, heading: Math.PI / 2, phase: 1.5, stride: .5, look }, { x: 9, y: 2, z: -3, look }]);
  crowd.update(.016, context);
  const n = crowd.count, mesh = crowd.mesh, matrix = new THREE.Matrix4(), at = new THREE.Vector3();
  assert.equal(mesh.count, n + 2);
  mesh.getMatrixAt(n, matrix); at.setFromMatrixPosition(matrix);
  assert.deepEqual([at.x, at.y, at.z], [7, 2, -3]);
  const gait = mesh.geometry.getAttribute('aGait'), top = mesh.geometry.getAttribute('aTop');
  assert.deepEqual([gait.getX(n), gait.getY(n), gait.getZ(n), gait.getW(n)], [1.5, .5, 0, 64], 'the shader clock does not move them');
  assert.deepEqual([top.getX(n), top.getY(n), top.getZ(n)], [1, 0, 0]);
  assert.deepEqual([gait.getX(n + 1), gait.getY(n + 1)], [0, 0], 'standing');
  crowd.setExtras([{x:7,y:2,z:-3,look},{x:7,y:-8,z:-3,look,subway:true}]);
  crowd.update(.016,{...context,enclosedSubway:true});
  assert.ok(crowd.count>0,'street pedestrians continue to simulate above the train');
  assert.equal(mesh.count,1);
  mesh.getMatrixAt(0,matrix);assert.equal(at.setFromMatrixPosition(matrix).y,-8);
  crowd.setExtras(null); crowd.update(.016, context);
  assert.equal(mesh.count, crowd.count);
  crowd.dispose();
});

test('a punch staggers the person in front, and they swing back', () => {
  const crowd = createCrowd({ life: life(0), capacity: 8, range: 40, random: seeded(4) });
  const walks = corner();
  crowd.people.push({ run: walks[0], s: 10, way: 1, lane: 1, look: dress('casual', seeded(3)), state: 'walk', hop: null, wait: 0, bold: true, fights: true, phase: 0, y: 0, sample: 1, age: 5, shove: [0, 0], x: 0.2, z: 1.2, heading: 0 });
  const hit = crowd.strike(0, 0, 0);
  assert.equal(hit, crowd.people[0]);
  assert.equal(hit.state, 'fight');
  assert.equal(hit.hp, 2);
  assert.ok(hit.reaction.vz>2 && hit.reaction.vx>0);
  const player = { x: 0, z: 0, mode: 'walk' };
  crowd.update(0.2, { walks, focus: { x: 0, z: 0 }, hours: 12, time: 0, junctions: [], cars: [], player });
  assert.ok(hit.z>1.45,'the target moves away as the impulse dissipates');
  assert.equal(crowd.threats.length, 1);
  assert.equal(crowd.threats[0].kind, 'fight');
  for (let i = 0; i < 8 && crowd.damage === 0; i++) crowd.update(0.2, { walks, focus: { x: 0, z: 0 }, hours: 12, time: i, junctions: [], cars: [], player });
  assert.ok(crowd.damage >= 12, 'they hit back when they reach you');
  hit.hp = 1;
  crowd.strike(hit.x - 0.4, hit.z, Math.atan2(hit.x, hit.z));
  assert.equal(hit.state, 'down');
  crowd.update(0.05, { walks, focus: { x: 0, z: 0 }, hours: 12, time: 3, junctions: [], cars: [], player });
  assert.equal(crowd.threats[0].kind, 'down');
  crowd.dispose();
});

test('a shop witness gets up after a sprint collision and keeps fleeing through a sidewalk reload', () => {
  const walks = [run('front',[0,0],[120,0],[0,-1])];
  let blocked = false, obstacleX = Infinity;
  const crowd = createCrowd({life:life(0),blocked:(x,z)=>blocked ||
    x>obstacleX && x<obstacleX+2 && Math.abs(z-1.2)<2});
  const frame = {walks,focus:{x:5,z:1},junctions:[],cars:[],time:0};
  const tick = (n,player) => {
    for (let i=0;i<n;i++) {
      frame.time+=1/30;
      crowd.update(1/30,{...frame,player});
    }
  };
  try {
    tick(1);
    const robbery={x:5,z:3,heading:Math.PI/2};
    crowd.fleeOntoStreet({x:5,z:1,y:0,heading:Math.PI,look:dress('casual',seeded(7)),robbery});
    const [person]=crowd.people;
    tick(45);
    assert.ok(person.x>10 && Math.abs(person.z-1)<.3);
    tick(1,{x:person.x-.3,z:person.z,y:0,mode:'walk',velocityX:7});
    assert.equal(crowd.bumps[0].hard,true);
    assert.equal(person.state,'down');
    frame.walks=[];
    tick(110);
    assert.equal(person.state,'flee');
    assert.strictEqual(crowd.people[0],person);
    const where = [person.x,person.z];
    blocked=true; tick(240);
    assert.deepEqual([person.x,person.z],where);
    blocked=false; obstacleX=where[0]+2; frame.walks=[...walks]; tick(240);
    assert.strictEqual(person.robbery,robbery);
    assert.equal(person.state,'flee');
    assert.ok(person.x>where[0]+20);
    frame.focus={x:-140,z:0}; tick(300);
    assert.ok(!crowd.people.includes(person),'witness leaves the simulation beyond the local crowd range');
  } finally { crowd.dispose(); }
});

function sidewalk(depth, population=0, blocked, length=60) {
  const path = run('block',[0,0],[0,length],[-1,0],depth);
  const crowd = createCrowd({life:life(population/path.length),random:seeded(8),blocked});
  const frame = {walks:[path],focus:{x:1,z:30},hours:12,junctions:[],cars:[],time:0};
  crowd.update(0,frame);
  crowd.people.length=0;
  const walker = (z,way,pace,lane=depth/2) => {
    const look = {...dress('casual',seeded(4)),height:1.72,build:1,pace};
    const p = {run:path,s:z,way,lane,x:lane,z,y:0,look,state:'walk',age:2,sample:1,shove:[0,0],phase:0,heading:way>0?0:Math.PI};
    crowd.people.push(p); return p;
  };
  return {crowd,walker,step(dt){frame.time+=dt;crowd.update(dt,frame);}};
}

test('oncoming walkers pass on a wide sidewalk and yield in a narrow queue', () => {
  for (const hz of [12,60]) {
    const {crowd,walker,step}=sidewalk(3.4);
    const a=walker(25,1,1.5), b=walker(35,-1,1.65);
    for(let i=0;i<hz*8;i++){
      const old=[a.x,a.z,b.x,b.z];step(1/hz);
      assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.64,'shoulders stay apart on every step');
      for(const [j,p] of [a,b].entries()){
        assert.ok(p.x>=.3 && p.x<3.15,'stays inside the kerb');
        assert.ok(Math.hypot(p.x-old[2*j],p.z-old[2*j+1])<=p.look.pace/hz+1e-6,'no teleport');
      }
    }
    assert.ok(a.z>b.z+6,'both finish the pass and continue');
    crowd.dispose();
  }
  const {crowd,walker,step}=sidewalk(.95);
  const rear=walker(20,1,2), front=walker(21.5,1,.8);
  for(let i=0;i<150;i++){step(.05);assert.ok(front.z>rear.z && Math.hypot(rear.x-front.x,rear.z-front.z)>=.64);}
  assert.ok(front.z>26 && rear.z>24,'the queue moves at the leader’s pace');
  crowd.dispose();

  const alley=sidewalk(.95);
  const north=alley.walker(20,1,1.4), south=alley.walker(24,-1,1.4);
  for(let i=0;i<160;i++){
    alley.step(.05);
    assert.ok(south.z>north.z && Math.hypot(north.x-south.x,north.z-south.z)>=.64);
  }
  assert.ok(south.z>26 && north.z>25,'one gives way when a head-on pass is impossible');
  alley.crowd.dispose();

  const overlap=sidewalk(3.4);
  const first=overlap.walker(20,1,1.2), second=overlap.walker(20,-1,1.2);
  overlap.step(.05);
  assert.ok(Math.hypot(first.x-second.x,first.z-second.z)>=.64,'walkers placed on the same spot separate');
  overlap.crowd.dispose();
});

test('a packed sidewalk keeps pace through a slowdown without weaving or overlapping', () => {
  for(const hz of [15,60]){
    const {crowd,walker,step}=sidewalk(4,40);
    try {
      const rows=[];
      for(let i=0;i<10;i++)rows.push(Array.from({length:4},(_,j)=>walker(18+.87*i,1,i===9?1.05:1.6,.5+j)));
      if(hz===60)crowd.people.reverse();
      const tail=rows[0][1], leaders=rows.at(-1);
      for(let i=0;i<hz*16;i++){
        if(i===hz*5)for(const leader of leaders)leader.look.pace=0;
        if(i===hz*9)for(const leader of leaders)leader.look.pace=1.25;
        step(1/hz);
        assert.equal(crowd.people.length,40);
        for(let r=0;r<rows.length;r++)for(const p of rows[r]){
          assert.ok(Math.abs(p.x-p.lane)<.03,'a moving file holds its line');
          if(r)for(const q of rows[r-1])assert.ok(Math.hypot(q.x-p.x,q.z-p.z)>=.64);
        }
        if(i===hz*4)assert.ok(Math.abs(tail.walkSpeed-1.05)<.12,'the rear keeps pace with the front');
      }
      assert.ok(tail.z>30 && Math.abs(tail.walkSpeed-1.25)<.12,'the entire queue gets moving again');
    } finally { crowd.dispose(); }
  }
});

test('a faster follower commits to an open passing lane', () => {
  const {crowd,walker,step}=sidewalk(2.2,2);
  try {
    const follower=walker(20,1,1.65), leader=walker(20.97,1,1.03);
    let side=0, reversals=0;
    for(let i=0;i<360;i++){
      const x=follower.x;
      step(1/30);
      const lateral=(follower.x-x)*30;
      if(Math.abs(lateral)>.08){
        if(side && side!==Math.sign(lateral))reversals++;
        side=Math.sign(lateral);
      }
      assert.ok(Math.hypot(follower.x-leader.x,follower.z-leader.z)>=.64);
    }
    assert.ok(follower.z>leader.z+3 && Math.abs(follower.x-follower.lane)<.1);
    assert.ok(reversals<=2,'a pass and merge back should not weave every frame');
  } finally { crowd.dispose(); }
});

test('a queue uses the opening in a blocked sidewalk or turns back at a closure', () => {
  for(const depth of [2.6,3.6])for(const closed of [false,true]){
    const blocked=(x,z)=>z>=48 && z<=50 && (closed || x<=depth-1);
    const {crowd,walker,step}=sidewalk(depth,10,blocked,110);
    try {
      const file=Array.from({length:10},(_,i)=>walker(46-i*1.1,1,1.45,.72));
      for(let frame=0;frame<900;frame++){
        step(1/30);
        for(const [i,p] of file.entries()){
          assert.ok(!blocked(p.x,p.z) && p.x>=.31 && p.x<=depth-.27);
          for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-file[j].x,p.z-file[j].z)>=.64);
        }
      }
      assert.ok(file.every(p=>closed ? p.z<32 && p.way===-1 : p.z>54 && p.way===1));
    } finally { crowd.dispose(); }
  }
});

test('arrivals spread along a newly loaded sidewalk', () => {
  const block=run('frontage',[0,0],[0,80],[-1,0],3.2);
  const crowd=createCrowd({life:life(.25),capacity:100,random:seeded(40)});
  try {
    crowd.update(0,{walks:[block],focus:{x:1,z:40},time:0});
    assert.equal(crowd.count,20);
    assert.equal(new Set(crowd.people.map(p=>Math.floor(p.s/4))).size,20);
  } finally { crowd.dispose(); }
});

test('opposing files take turns through a one-person opening and clear the waiting line', () => {
  for(const [depth,hz] of [[2.6,15],[3.6,60]]){
    const blocked=(x,z)=>z>=48 && z<=50 && x<=depth-1;
    const {crowd,walker,step}=sidewalk(depth,10,blocked,110);
    try {
      const north=Array.from({length:5},(_,i)=>walker(46-i*1.1,1,1.45,.72));
      const south=Array.from({length:5},(_,i)=>walker(52+i*1.1,-1,1.45,.72));
      const all=[...north,...south];
      if(hz===60)crowd.people.reverse();
      for(let frame=0;frame<hz*32;frame++){
        step(1/hz);
        for(const p of all){
          assert.ok(!blocked(p.x,p.z) && p.x>=.31 && p.x<=depth-.27);
          for(const q of crowd.nearbyPeople(p))assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=.64);
        }
      }
      assert.ok(north.every(p=>p.z>54) && south.every(p=>p.z<43));
    } finally { crowd.dispose(); }
  }
});

test('opposing groups form streams and get through a crowded block', () => {
  const {crowd,walker,step}=sidewalk(4.5,48), start=[];
  try {
    for(let row=0;row<16;row++)for(let file=0;file<3;file++){
      const way=row<8?1:-1, z=20+row*.97+(way<0?3:0);
      start.push({person:walker(z,way,1.5+file*.05,.75+file*1.5),z,way});
    }
    for(let i=0;i<420;i++){
      step(1/30);
      for(const {person} of start)for(const other of crowd.nearbyPeople(person)){
        assert.ok(Math.hypot(person.x-other.x,person.z-other.z)>=.64);
      }
    }
    assert.equal(crowd.count,48);
    for(const {person,z,way} of start)assert.ok(way*(person.z-z)>13,'everyone gets through in their original direction');
  } finally { crowd.dispose(); }
});

test('new arrivals have standing room and walkers can pass beneath people on another level', () => {
  const walks=corner(), crowd=createCrowd({life:life(.35),capacity:150,random:seeded(24)});
  const frame={walks,focus:{x:0,z:0},time:0,hours:12,junctions:[],cars:[]};
  crowd.update(0,frame);
  for(const [i,p] of crowd.people.entries())for(const q of crowd.people.slice(i+1))
    assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=.32*(p.look.build*p.look.height+q.look.build*q.look.height)/1.72);
  const p=crowd.people.find(p=>p.s>15 && p.s<p.run.length-15);
  crowd.people.splice(0,crowd.people.length,p);
  const at=along(p.run,p.s), sx=p.x,sz=p.z;
  crowd.setExtras([{x:p.x+at.tx*p.way,y:5,z:p.z+at.tz*p.way,look:p.look}]);
  for(let i=0;i<20;i++) crowd.update(.03,{...frame,time:i*.03});
  assert.ok(Math.abs(Math.hypot(p.x-sx,p.z-sz)-p.look.pace*.6)<.001);
  crowd.dispose();
});
