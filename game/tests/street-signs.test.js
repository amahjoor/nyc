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
  assert.equal(signText('A VERY LONG STREET NAME THAT GOES ON AND ON'), 'A Very Long St Name That Goes On And On');
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
  assert.ok(north.reach > 5 && north.reach <= 12); assert.equal(north.group, 0);
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

test('a T-junction aims each overhead head at incoming traffic even from the opposite kerb', () => {
  const j = junction([arm(N, 12, 'MAIN'), arm(S, 12, 'MAIN'), arm(E, 9, 'SIDE')]);
  const { signals, corners } = layoutJunction(j);
  assert.deepEqual(layoutJunction(j, { raised: () => null }).corners, corners);
  assert.equal(signals.length, 3);
  for (const signal of signals) {
    const width = j.arms.find(a => Math.cos(a.angle - signal.heading) > .99).width;
    assert.equal(signal.heads.length, 1);
    const along = signal.heads[0];
    const dx = signal.x - j.x + along * signal.across[0], dz = signal.z - j.z + along * signal.across[1];
    assert.ok(Math.abs(dx * Math.cos(signal.heading) - dz * Math.sin(signal.heading) - width * .19) < 1e-6);
  }
});

test('a skewed T keeps a roadside head when its incoming lane is beyond mast reach', () => {
  const j = junction([arm(.635, 17.68, 'CLOVE RD'), arm(2.284, 10.36, 'ALLEN CT', 'in'), arm(3.700, 18.29, 'CLOVE RD')]);
  const layout = layoutJunction(j);
  assert.ok(layout.signals.some(signal => signal.reach === 0));
  const signs = createStreetSigns({ createCanvas: canvas }), nearby = [j];
  signs.update(nearby, j);
  const { arms, heads, lamps } = signs.meshes;
  assert.equal(arms.count, layout.signals.filter(signal => signal.reach > 0).length);
  assert.equal(heads.count, layout.signals.reduce((n, signal) => n + (signal.heads.length || 1), 0));
  const lampCount = lamps.count, positions = lamps.instanceMatrix.array.slice(0, lampCount * 16);
  signs.update(nearby, { x: j.x + 500, z: j.z });
  assert.equal(lamps.count, lampCount);
  assert.deepEqual(lamps.instanceMatrix.array.slice(0, lampCount * 16), positions);
  signs.dispose();
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

test('both faces share one blade and every blade clears the signal heads', () => {
  const j = junction(arms().map(a => ({ ...a, angle: a.angle + .37, oneway: true, inbound: true, outbound: false })));
  const signs = createStreetSigns({ createCanvas: canvas });
  signs.update([j], j, 0);
  const { faces, heads } = signs.meshes, matrix = new THREE.Matrix4();
  assert.ok(heads.count > 0 && faces.count > 0);
  for (let i = 0; i < faces.count; i += 2) {
    faces.getMatrixAt(i, matrix);
    const y = matrix.elements[13], halfHeight = matrix.elements[5] / 2;
    assert.ok(y - halfHeight > PEDESTRIAN_HEAD.height + PEDESTRIAN_HEAD.size / 2);
    const head = new THREE.Matrix4();
    for (let k = 0; k < heads.count; k++) {
      heads.getMatrixAt(k, head);
      assert.ok(Math.abs(y - head.elements[13]) > halfHeight + HEAD.height / 2);
    }
    const front = new THREE.Vector3().setFromMatrixPosition(matrix);
    faces.getMatrixAt(i + 1, matrix);
    assert.ok(front.distanceTo(new THREE.Vector3().setFromMatrixPosition(matrix)) < .011);
  }
  signs.dispose();
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
  const j = junction(), nearby = [j];
  signs.update(nearby, { x: 100, z: -50 }, 0);
  assert.equal(signs.junctions, 1);
  const { meshes } = signs;
  // Three approaches, four lane-aligned heads, three lamps a head; one switchable symbol per pedestrian head.
  assert.deepEqual([meshes.poles.count, meshes.arms.count, meshes.heads.count, meshes.lamps.count, meshes.walkers.count, meshes.figures.count, meshes.stops.count], [4, 3, 4, 12, 8, 8, 0]);
  assert.ok(meshes.faces.count >= 6);
  const lit = () => { const colours = meshes.lamps.instanceColor, out = []; for (let i = 0; i < meshes.lamps.count; i++) out.push(colours.getX(i) > 1 ? (colours.getY(i) > 1 ? 'yellow' : 'red') : colours.getY(i) > 4 ? 'green' : 'off'); return out; };
  const crossings = layoutJunction(j).crossings, displayed = new Set();
  for (let time = 0; time < j.plan.cycle; time += .5) {
    signs.update(nearby, { x: 100, z: -50 }, j.plan.offset + time);
    const lamps = lit(), now = [vehicleAspect(j.plan, 0, j.plan.offset + time).aspect, vehicleAspect(j.plan, 1, j.plan.offset + time).aspect];
    // Every head shows one lamp, and it is its own street's colour.
    for (let head = 0; head < meshes.heads.count; head++) assert.equal(lamps.slice(head * 3, head * 3 + 3).filter(state => state !== 'off').length, 1);
    assert.equal(lamps.filter(state => state === now[0]).length, now[0] === now[1] ? 4 : 2);
    assert.ok(lamps.includes(now[0]) && lamps.includes(now[1]), `${now} at ${time}`);
    const cells = meshes.figures.geometry.getAttribute('aCell');
    crossings.forEach(({ group }, i) => {
      const clock = j.plan.offset + time, aspect = crossingAspect(j.plan, group, clock).aspect;
      if (aspect === 'flash' && Math.floor(clock * 2) % 2 !== 0) {
        displayed.add('blank');
        assert.equal(cells.getZ(i), 0);
        assert.equal(cells.getW(i), 0);
      } else {
        displayed.add(aspect);
        assert.equal(Math.round(cells.getX(i) * 4), aspect === 'walk' ? 2 : 1);
        assert.ok(Math.abs(cells.getZ(i) - .25) < 1e-6);
      }
    });
  }
  assert.deepEqual(displayed, new Set(['walk', 'dont', 'flash', 'blank']));
  // Lamps sit on the face of their head, twelve inches across, a head's height apart at most.
  assert.ok(Math.abs(HEAD.lens * 2 - .3) < .01 && HEAD.lamps[0] > HEAD.lamps[1] && HEAD.lamps[1] > HEAD.lamps[2] && HEAD.lamps[0] < HEAD.height, 'red on top');
  const matrix = new THREE.Matrix4(), at = new THREE.Vector3();
  for (let i = 0; i < meshes.lamps.count; i++) { meshes.lamps.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix); assert.ok(at.y > 3 + 2.9 && at.y < 3 + 7.2, `lamp ${i} hangs at ${(at.y - 3).toFixed(1)} m`); }
  // Unchanged aspects upload nothing.
  const version = meshes.lamps.instanceColor.version;
  signs.update(nearby, { x: 100, z: -50 }, j.plan.offset + j.plan.cycle - .5);
  assert.equal(meshes.lamps.instanceColor.version, version);
  // Out of range the hardware goes, though the lamps of a distant signal remain.
  signs.update(nearby, { x: 600, z: -50 }, 0);
  assert.equal(signs.junctions, 0); assert.equal(meshes.poles.count, 0); assert.equal(meshes.lamps.count, 12, 'the same lane-aligned lamps at a distance');
  signs.update(nearby, { x: 5000, z: -50 }, 0);
  assert.equal(meshes.lamps.count, 0);
  signs.dispose();
  assert.equal(scene.children.length, 0);
});

test('new sidewalk coverage and revised roads refresh the hardware at the same position', () => {
  let surface = null;
  const signs = createStreetSigns({ createCanvas: canvas, raised: () => surface });
  const j = junction(), nearby = [j];
  signs.update(nearby, j, 0, 1);
  assert.equal(signs.meshes.poles.count, 4);
  surface = false;
  signs.update(nearby, j, 0, 2);
  assert.equal(signs.meshes.poles.count, 0);
  surface = true;
  signs.update(nearby, j, 0, 3);
  assert.equal(signs.meshes.arms.count, 3);
  const quiet = junction(arms().map(arm => ({ ...arm, width: 9 })));
  signs.update([quiet], j, 0, 3);
  assert.equal(signs.meshes.arms.count, 0);
  assert.ok(signs.meshes.stops.count > 0);
  signs.dispose();
});

test('entry restrictions face the junction at the mouth of each inbound-only street', () => {
  const list = arms().map(a => ({ ...a, angle: a.angle + .37 }));
  for (const streets of [list, list.filter(a => a.name === '7 AVE' || a.angle > 0)]) {
    const j = junction(streets), layout = layoutJunction(j);
    const inbound = streets.find(a => a.oneway && a.inbound);
    assert.equal(layout.noEntry.length, 1);
    const [sign] = layout.noEntry;
    assert.ok(Math.cos(sign.heading - inbound.angle) < -.9999);
    assert.ok(layout.corners.some(c => c.x === sign.x && c.z === sign.z && c.between.includes(streets.indexOf(inbound))));
    assert.ok(layout.poles.some(p => p.x === sign.x && p.z === sign.z));
  }
  assert.deepEqual(layoutJunction(junction(list.map(a => ({ ...a, oneway: false, outbound: true })))).noEntry, []);
});

test('street blades extend from the same mount as their names get longer', () => {
  const label = name => layoutJunction(junction(arms().map(a => ({ ...a, name })))).names[0];
  const short = label('A ST'), long = label('DR MARTIN LUTHER KING JR BOULEVARD');
  assert.equal(long.text, 'Dr Martin Luther King Jr Blvd');
  assert.ok(long.width > short.width * 2);
  assert.ok(Math.abs((Math.hypot(long.dx, long.dz) - Math.hypot(short.dx, short.dz)) - (long.width - short.width) / 2) < 1e-6);
});

test('signal faces point back to the opposite painted end, including the flat bank of a T', () => {
  const j = junction([arm(N, 12, 'MAIN'), arm(S, 12, 'MAIN'), arm(E, 9, 'SIDE')]);
  const stripe = {a:{x:j.x-6,z:j.z+9},b:{x:j.x+7,z:j.z+7}};
  const layout = layoutJunction(j,{crossings:[,stripe]});
  for (const [near,far] of [[stripe.a,stripe.b],[stripe.b,stripe.a]]) {
    const head = layout.crossings.find(h => Math.hypot(h.x-near.x,h.z-near.z)<5 &&
      Math.cos(h.heading-Math.atan2(far.x-h.x,far.z-h.z))>.9999);
    assert.ok(head);
    assert.equal(head.group,j.plan.groups[1]);
    assert.ok(layout.poles.some(p=>p.x===head.x && p.z===head.z));
  }
});

test('each drawn signal pole stops contact on its own level and streams out with the junction',async()=>{
  const {StreetObjects}=await import('../dist/street-objects.js');
  const physics=new StreetObjects(),j=junction();
  const signs=createStreetSigns({physics,heightAt:()=>12,createCanvas:canvas});
  signs.update([j],j);
  assert.ok(signs.poles.length>0);
  for(const {x,z} of signs.poles){
    assert.ok(physics.contact(x,z,.38,12));
    assert.equal(physics.contact(x,z,.38,0),null);
  }
  signs.update([],{x:5000,z:5000});
  assert.equal(physics.grid.size,0);
  signs.dispose();
});
