import test from 'node:test';
import assert from 'node:assert/strict';
import { roomProps, PROP_SHAPES } from '../dist/room-props.js';
import { KITCHEN_FIXTURES, KITCHEN_SIZES, COOKWARE } from '../dist/kitchen-fixtures.js';

const NAMES = ['gasRange', 'flatTop', 'fryer', 'prepTable', 'reachIn', 'dishSink', 'passShelf', 'exhaustHood', 'doughBench', 'stockBurner', 'tandoor', 'smoker', 'sandwichUnit', 'donutFryer', 'rackOven', 'mixer', 'dipCabinet', 'softServe',
  'riceCooker', 'sodaFountain', 'coffeeBrewer', 'slicer', 'sushiStation', 'shakeMixer', 'toaster', 'cookware'];
const WARES = ['pan', 'pot', 'wok', 'basket', 'tray', 'pie', 'board', 'bowl', 'plate', 'ladle', 'cup', 'griddle'];
// Options a kitchen may ask for, each drawn as well as the plain piece.
const OPTIONS = { gasRange: [{ pots: true }], flatTop: [{ char: true }], stockBurner: [{ kettle: true }], cookware: WARES.map(ware => ({ ware })).concat(WARES.map(ware => ({ ware, tone: '#7da455' })), [{ ware: 'no such thing' }, { ware: 'constructor' }]) };
const frame = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: -1 };

/** Draw one prop where a room would, and measure what came out. */
function drawn(shape, { w, d, h }, more = {}, color, face = [0, -1], room = frame) {
  const position = [], colour = [];
  assert.equal(roomProps(room, 0, position, colour).draw({ shape, a: 0, b: 0, w: face[1] ? w : d, d: face[1] ? d : w, h, y: 0, color, face, more }), true, `${shape} is a prop`);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i++) { min[i % 3] = Math.min(min[i % 3], position[i]); max[i % 3] = Math.max(max[i % 3], position[i]); }
  return { position, colour, min, max, across: Math.max(-min[0], max[0]), deep: Math.max(-min[2], max[2]), triangles: position.length / 9 };
}
/** Everything stays over its own footprint and under its own height. */
function fits(name, size, more, color) {
  const label = `${name} ${JSON.stringify(more)} at ${size.w} x ${size.d} x ${size.h}`, got = drawn(name, size, more, color), rise = KITCHEN_SIZES[name].rise ?? .05;
  assert.ok(got.triangles >= 12 && Number.isInteger(got.triangles), `${label} draws triangles`);
  assert.equal(got.colour.length, got.position.length, `${label} colours every corner`);
  assert.ok(got.position.every(Number.isFinite) && got.colour.every(value => value >= 0 && value <= 1.2), `${label} is finite`);
  assert.ok(got.across <= size.w / 2 + .03 + 1e-9, `${label} is ${got.across.toFixed(3)} from its middle across`);
  assert.ok(got.deep <= size.d / 2 + .05 + 1e-9, `${label} is ${got.deep.toFixed(3)} from its middle front to back`);
  assert.ok(got.min[1] >= -1e-9, `${label} reaches ${got.min[1].toFixed(3)} under its foot`);
  assert.ok(got.max[1] <= size.h + rise + 1e-9, `${label} stands ${got.max[1].toFixed(3)} tall`);
  return got;
}

test('the kitchen has every piece of equipment and every ware a cook uses', () => {
  assert.deepEqual(Object.keys(KITCHEN_FIXTURES).sort(), [...NAMES].sort());
  assert.deepEqual(Object.keys(KITCHEN_SIZES).sort(), [...NAMES].sort());
  assert.deepEqual([...COOKWARE].sort(), [...WARES].sort());
  for (const name of NAMES) assert.ok(PROP_SHAPES.includes(name), `${name} is in the prop table`);
});

test('each piece is drawn for the size the kitchen plans it at', () => {
  const plan = { gasRange: [.9, .75, .92], flatTop: [.9, .75, .92], fryer: [.8, .75, .92], prepTable: [1.5, .7, .9], reachIn: [.75, .8, 2], dishSink: [1.5, .65, .9], passShelf: [1.8, .6, 1.45], exhaustHood: [2, .9, .5],
    doughBench: [1.8, .7, .92], stockBurner: [.6, .6, .5], tandoor: [.7, .7, .95], smoker: [.9, .8, 1.9], sandwichUnit: [1.5, .75, 1.1], donutFryer: [1, .7, .92], rackOven: [.95, 1, 2], mixer: [.55, .6, 1.3],
    dipCabinet: [1.5, .7, 1.05], softServe: [.55, .7, 1.5], riceCooker: [.4, .4, .35], sodaFountain: [.6, .6, .75], coffeeBrewer: [.5, .4, .5], slicer: [.5, .5, .45], sushiStation: [.9, .5, .25], shakeMixer: [.3, .3, .55],
    toaster: [.45, .4, .4], cookware: [.34, .34, .2] };
  for (const name of NAMES) { const { w, d, h } = KITCHEN_SIZES[name]; assert.deepEqual([w, d, h], plan[name], name); }
  // Only what the brief lets stand over its height does: a riser, a splash and sprayer, a pot, a peel, skewers, a flue, a duct, steam.
  const tall = NAMES.filter(name => (KITCHEN_SIZES[name].rise ?? .05) > .05).sort();
  assert.deepEqual(tall, ['cookware', 'dishSink', 'donutFryer', 'doughBench', 'exhaustHood', 'flatTop', 'fryer', 'gasRange', 'stockBurner', 'tandoor']);
});

test('every piece at its nominal size draws inside its footprint and height', () => {
  for (const name of NAMES) for (const more of [{}, ...(OPTIONS[name] || [])]) {
    const got = fits(name, KITCHEN_SIZES[name], more);
    assert.ok(got.triangles <= 1700, `${name} ${JSON.stringify(more)} is ${got.triangles} triangles`);
  }
});

test('a cook finds the working surface at the height the piece is given', () => {
  // The front third of these is the surface a pan or a board is set down on (the prop's front is toward -z here).
  for (const name of ['gasRange', 'flatTop', 'prepTable', 'doughBench']) {
    const { w, d, h } = KITCHEN_SIZES[name], got = drawn(name, { w, d, h });
    let top = 0;
    for (let i = 0; i < got.position.length; i += 3) if (got.position[i + 2] < -d / 6) top = Math.max(top, got.position[i + 1]);
    assert.ok(top >= h - .01 && top <= h + .04, `${name} is worked at ${top.toFixed(3)}, given ${h}`);
  }
  // The pass stays open between its counter and its lamps.
  const { w, d, h } = KITCHEN_SIZES.passShelf, pass = drawn('passShelf', { w, d, h });
  for (let i = 0; i < pass.position.length; i += 3) {
    const [x, y, z] = pass.position.slice(i, i + 3);
    if (Math.abs(x) < w / 2 - .45 && Math.abs(z) < .15) assert.ok(y <= .951 || y >= 1.28, `the pass is blocked at ${y.toFixed(3)}`);
  }
});

test('pieces keep to their footprint when a kitchen makes them wider, narrower, deeper or shallower', () => {
  for (const name of NAMES) {
    if (name === 'cookware') continue;
    const { w, d, h } = KITCHEN_SIZES[name];
    for (const [sw, sd] of [[.6, 1], [.8, 1], [1.2, 1], [1.4, 1], [1, .7], [1, 1.3], [.7, .8], [1.4, 1.2]]) for (const more of [{}, ...(OPTIONS[name] || [])]) fits(name, { w: +(w * sw).toFixed(3), d: +(d * sd).toFixed(3), h }, more);
  }
});

test('equipment stands the same whichever way its room is laid out', () => {
  const turned = { x: 12, z: -7, tx: 0, tz: 1, nx: 1, nz: 0 }, mirrored = { x: 0, z: 0, tx: -1, tz: 0, nx: 0, nz: -1 };
  for (const name of NAMES) {
    const size = KITCHEN_SIZES[name], plain = drawn(name, size, {}, '#8a8f92');
    for (const [room, face] of [[turned, [0, -1]], [mirrored, [0, 1]], [frame, [1, 0]], [frame, [-1, 0]]]) {
      const other = drawn(name, size, {}, '#8a8f92', face, room);
      assert.equal(other.triangles, plain.triangles, name);
      assert.ok(other.position.every(Number.isFinite), name);
      assert.ok(Math.abs(other.max[1] - plain.max[1]) < 1e-9 && Math.abs(other.min[1] - plain.min[1]) < 1e-9, `${name} keeps its height`);
    }
    // Facing along the room, its width and depth change places on the floor.
    const side = drawn(name, size, {}, '#8a8f92', [1, 0]);
    assert.ok(side.deep <= size.w / 2 + .03 + 1e-9 && side.across <= size.d / 2 + .05 + 1e-9, `${name} turned keeps its footprint`);
  }
});

test('cookware is small, sits on its spot and takes the colour of the food', () => {
  for (const ware of WARES) {
    const got = fits('cookware', KITCHEN_SIZES.cookware, { ware });
    assert.ok(got.max[1] >= .02 && got.across >= .03, ware);
    if (!['pot'].includes(ware)) assert.ok(got.max[1] <= .25, `${ware} is ${got.max[1].toFixed(3)} tall`);
    if (!['basket', 'cup'].includes(ware)) {
      const other = drawn('cookware', KITCHEN_SIZES.cookware, { ware, tone: '#3f7d57' });
      assert.equal(other.triangles, got.triangles, ware);
      assert.notDeepEqual(other.colour, got.colour, `${ware} shows its food`);
    }
  }
  const pan = drawn('cookware', KITCHEN_SIZES.cookware, { ware: 'pan' });
  for (const ware of [undefined, 'no such thing', 'toString']) assert.deepEqual(drawn('cookware', KITCHEN_SIZES.cookware, { ware }).position, pan.position, 'an unknown ware is a pan');
});
