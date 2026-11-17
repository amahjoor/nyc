import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { layoutJunction, signText, createStreetSigns, HEAD, PEDESTRIAN_HEAD } from '../dist/street-signs.js';
import { planJunction, vehicleAspect, crossingAspect } from '../dist/signal-plan.js';

const N = Math.PI, E = Math.PI / 2, S = 0, W = -Math.PI / 2;
const arm = (angle, width, name, flow = 'both') => ({ angle, width, name, inbound: flow !== 'out', outbound: flow !== 'in', oneway: flow !== 'both' });
// 7 Av runs one way north (toward -Z) and is 18 m wide; W 42 St is two-way and 12 m wide.
const arms = () => [arm(N, 18, '7 AVE', 'out'), arm(S, 18, '7 AVE', 'in'), arm(E, 12, 'W 42 ST'), arm(W, 12, 'W 42 ST')];
const junction = (list = arms(), extra = {}) => ({ id: 'j', x: 100, z: -50, arms: list, plan: planJunction({ x: 100, z: -50, arms: list, ...extra }) });
const facing = heading => [Math.sin(heading), Math.cos(heading)];

function canvas() {
  const context = new Proxy({ measureText: text => ({ width: text.length * 10 }) }, { get: (target, key) => key in target ? target[key] : () => {}, set: () => true });
  return { width: 0, height: 0, getContext: () => context };
}

test('names are set as the city sets them', () => {
  assert.equal(signText('W 42 ST'), 'W 42 St'); assert.equal(signText('7 AVE'), '7 Av'); assert.equal(signText('BROADWAY'), 'Broadway');
  assert.equal(signText('AVE OF THE AMERICAS'), 'Ave Of The Americas'); assert.equal(signText('GRAND CONC'), 'Grand Concourse');
  assert.equal(signText('ST MARKS PL'), 'St Marks Pl', 'a leading ST is a saint'); assert.equal(signText('E  161 ST'), 'E 161 St');
  assert.equal(signText('QUEENS BLVD'), 'Queens Blvd'); assert.equal(signText('FDR DR'), 'Fdr Dr'); assert.equal(signText('42ND ST'), '42 St');
  assert.equal(signText(''), ''); assert.equal(signText(null), '');
  assert.ok(signText('A VERY LONG STREET NAME THAT GOES ON AND ON').length <= 22);
});

test('a four-way junction has a corner between each pair of streets, on the sidewalk side of both kerbs', () => {
  const j = junction(), layout = layoutJunction(j);
  assert.equal(layout.corners.length, 4);
  for (const corner of layout.corners) {
    const dx = Math.abs(corner.x - j.x), dz = Math.abs(corner.z - j.z);
    // Beyond the avenue's kerb (9 m from its centreline) and the street's (6 m).
    assert.ok(dx > 9 && dx < 12 && dz > 6 && dz < 9, `corner at ${dx.toFixed(1)}, ${dz.toFixed(1)}`);
  }
  assert.equal(new Set(layout.corners.map(c => `${Math.sign(c.x - j.x)},${Math.sign(c.z - j.z)}`)).size, 4, 'one in each quadrant');
  // Where the sidewalk is known to start further back, the pole stands back with it.
  const set = layoutJunction(j, { raised: (x, z) => Math.abs(x - j.x) > 11.5 && Math.abs(z - j.z) > 8.5 });
  for (const corner of set.corners) assert.ok(Math.abs(corner.x - j.x) > 11.5 && Math.abs(corner.z - j.z) > 8.5);
});

test('each approach has a mast on the far side to its right, reaching over the roadway and facing it', () => {
  const j = junction(), layout = layoutJunction(j);
  // Three approaches: north on the avenue, and both ways on the street.
  assert.equal(layout.signals.length, 3);
  const by = heading => layout.signals.find(signal => Math.abs(Math.atan2(Math.sin(signal.heading - heading), Math.cos(signal.heading - heading))) < .01);
  // Northbound traffic arrives from the south (+Z): its mast is at the north-east corner.
  const north = by(S);
  assert.ok(north.x > j.x && north.z < j.z, 'far side, driver\'s right');
  const whole = v => Math.round(v) + 0;
  assert.deepEqual(north.across.map(whole), [-1, 0], 'the arm reaches west over the avenue');
  assert.ok(north.reach > 8 && north.reach <= 9); assert.equal(north.group, 0);
  assert.deepEqual(facing(north.heading).map(whole), [0, 1], 'the lamps face south, toward the traffic');
  // Westbound traffic arrives from the east: far side is west, its right is north.
  const west = by(E);
  assert.ok(west.x < j.x && west.z < j.z); assert.equal(west.group, 1);
  assert.deepEqual(west.across.map(whole), [0, 1]);
  // Nobody arrives from the north on a northbound avenue, so nothing faces that way.
  assert.equal(by(N), undefined);
  assert.equal(layout.stops.length, 0);
  assert.ok(layout.poles.length === 4 && layout.poles.filter(pole => pole.mast).length === 3);
});

test('every corner shows a walker to each crossing that ends there', () => {
  const j = junction(), layout = layoutJunction(j);
  assert.equal(layout.crossings.length, 8);
  for (const corner of layout.corners) {
    const heads = layout.crossings.filter(c => c.x === corner.x && c.z === corner.z);
    assert.equal(heads.length, 2);
    assert.deepEqual(heads.map(head => head.group).sort(), [0, 1], 'one for crossing the avenue, one for crossing the street');
    for (const head of heads) {
      // A head faces along the crossing it serves, toward the opposite kerb.
      const [fx, fz] = facing(head.heading), acrossAvenue = head.group === 0;
      assert.ok(acrossAvenue ? Math.abs(fx) > .99 : Math.abs(fz) > .99);
      assert.ok(acrossAvenue ? Math.sign(fx) === -Math.sign(corner.x - j.x) : Math.sign(fz) === -Math.sign(corner.z - j.z), 'it looks back across the roadway');
    }
  }
  assert.ok(PEDESTRIAN_HEAD.height > 2.4 && PEDESTRIAN_HEAD.height < 3.2);
});

test('street names run along their own street; ONE WAY arrows point the way the traffic goes', () => {
  const j = junction(), layout = layoutJunction(j);
  const texts = new Set(layout.names.map(name => name.text));
  assert.deepEqual([...texts].sort(), ['7 Av', 'W 42 St']);
  for (const name of layout.names) {
    const [fx, fz] = facing(name.heading);
    // A sign naming the north-south avenue is read from the east or west.
    assert.ok(name.text === '7 Av' ? Math.abs(fx) > .99 : Math.abs(fz) > .99, `${name.text} faces ${fx.toFixed(1)}, ${fz.toFixed(1)}`);
  }
  // Each sign is double-faced.
  for (const text of texts) { const set = layout.names.filter(name => name.text === text); assert.equal(set.length % 2, 0); }
  // Only the avenue is one-way. Read from the east (facing +X), north is to the reader's right.
  assert.ok(layout.arrows.length >= 2);
  for (const arrow of layout.arrows) {
    const [fx] = facing(arrow.heading);
    assert.ok(Math.abs(fx) > .99, 'the arrow sign is parallel to the avenue');
    assert.equal(arrow.right, fx > 0, 'north is on the right of someone looking west at it, the left of someone looking east');
  }
});

test('lesser streets get stop signs on the near side; a T has two corners', () => {
  const quiet = [arm(N, 9, 'A ST'), arm(S, 9, 'A ST'), arm(E, 9, 'B ST'), arm(W, 9, 'B ST')];
  const all = layoutJunction(junction(quiet));
  assert.equal(all.stops.length, 4); assert.equal(all.signals.length, 0); assert.equal(all.crossings.length, 0);
  for (const stop of all.stops) {
    // A driver arriving from the south meets the sign at the south-east corner, facing them.
    const [fx, fz] = facing(stop.heading), right = [Math.cos(stop.heading), -Math.sin(stop.heading)];
    assert.ok((stop.x - 100) * fx + (stop.z + 50) * fz > 0, 'before the junction');
    assert.ok((stop.x - 100) * right[0] + (stop.z + 50) * right[1] > 0, 'on the driver\'s right');
  }
  const lane = [arm(N, 10, 'MAIN ST'), arm(S, 10, 'MAIN ST'), arm(E, 6, 'MEWS')];
  const tee = layoutJunction(junction(lane));
  assert.equal(tee.corners.length, 2, 'the far side of a T is one unbroken kerb');
  assert.equal(tee.stops.length, 1); assert.ok(Math.abs(facing(tee.stops[0].heading)[0] - 1) < 1e-9, 'only the mews stops');
  assert.deepEqual(layoutJunction({ x: 0, z: 0, plan: null, arms: lane }).corners, []);
});

test('the drawn lamps show exactly what the plan says, and only change when it does', () => {
  const scene = new THREE.Scene(), signs = createStreetSigns({ scene, heightAt: () => 3, createCanvas: canvas });
  const j = junction();
  signs.update([j], { x: 100, z: -50 }, 0);
  assert.equal(signs.junctions, 1);
  const { meshes } = signs;
  // Three approaches, three heads each, three lamps a head; eight walkers with a hand and a figure each.
  assert.deepEqual([meshes.poles.count, meshes.arms.count, meshes.heads.count, meshes.lamps.count, meshes.walkers.count, meshes.figures.count, meshes.stops.count], [4, 3, 9, 27, 8, 16, 0]);
  assert.ok(meshes.faces.count >= 6);
  const lit = () => { const colours = meshes.lamps.instanceColor, out = []; for (let i = 0; i < meshes.lamps.count; i++) out.push(colours.getX(i) > 1 ? (colours.getY(i) > 1 ? 'yellow' : 'red') : colours.getY(i) > 4 ? 'green' : 'off'); return out; };
  for (const time of [1, j.plan.green[0] - 1, j.plan.green[0] + 1, j.plan.green[0] + 4, j.plan.green[0] + 10, 80]) {
    signs.update([j], { x: 100, z: -50 }, j.plan.offset + time);
    const lamps = lit(), now = [vehicleAspect(j.plan, 0, j.plan.offset + time).aspect, vehicleAspect(j.plan, 1, j.plan.offset + time).aspect];
    // Every head shows one lamp, and it is its own street's colour.
    for (let head = 0; head < 9; head++) assert.equal(lamps.slice(head * 3, head * 3 + 3).filter(state => state !== 'off').length, 1);
    assert.equal(lamps.filter(state => state === now[0]).length % 3, 0);
    assert.ok(lamps.includes(now[0]) && lamps.includes(now[1]), `${now} at ${time}`);
    // Hands and figures: never both on one head.
    const glow = meshes.figures.instanceColor;
    for (let i = 0; i < meshes.figures.count; i += 2) assert.ok(!(glow.getX(i) > 1 && glow.getX(i + 1) > 1));
  }
  // Lamps sit on the face of their head, twelve inches across, a head's height apart at most.
  assert.ok(Math.abs(HEAD.lens * 2 - .3) < .01 && HEAD.lamps[0] > HEAD.lamps[1] && HEAD.lamps[1] > HEAD.lamps[2] && HEAD.lamps[0] < HEAD.height, 'red on top');
  const matrix = new THREE.Matrix4(), at = new THREE.Vector3();
  for (let i = 0; i < meshes.lamps.count; i++) { meshes.lamps.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix); assert.ok(at.y > 3 + 2.9 && at.y < 3 + 7.2, `lamp ${i} hangs at ${(at.y - 3).toFixed(1)} m`); }
  // Unchanged aspects upload nothing.
  const version = meshes.lamps.instanceColor.version;
  signs.update([j], { x: 100, z: -50 }, j.plan.offset + 80.2);
  assert.equal(meshes.lamps.instanceColor.version, version);
  // Out of range the hardware goes, though the lamps of a distant signal remain.
  signs.update([j], { x: 600, z: -50 }, 0);
  assert.equal(signs.junctions, 0); assert.equal(meshes.poles.count, 0); assert.equal(meshes.lamps.count, 18, 'two heads over the road for each approach');
  signs.update([j], { x: 5000, z: -50 }, 0);
  assert.equal(meshes.lamps.count, 0);
  signs.dispose();
  assert.equal(scene.children.length, 0);
});
