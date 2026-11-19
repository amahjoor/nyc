import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { shared, NYC_COMMON_GLSL } from '../dist/gfx-common.js';
import { FACADE_FRAGMENT_PARS, FACADE_FRAGMENT, ATLAS_CELL_HEIGHT } from '../dist/facade.js';
import { planRoom } from '../dist/interiors.js';
import { indexFootprints, solveFrontages, KIND } from '../dist/places.js';
import { drawLogo, LOGO_TRIM, createStorefronts, rasterFronts, drawSign, MAP_SPAN, TABLE_ROWS, ATLAS } from '../dist/storefronts.js';

// A canvas that records the lettering drawn on it.
function canvas() {
  const drawn = [], cleared = [];
  const context = new Proxy({ measureText: text => ({ width: text.length * 30 }), fillText: (text, x, y) => drawn.push({ text, x, y, font: context.font }), clearRect: (...rect) => cleared.push(rect) },
    { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
  return { width: 0, height: 0, getContext: () => context, drawn, cleared };
}
const place = (id, kind, extra = {}) => ({ id, kind, group: KIND[kind].group, name: id.toUpperCase(), x: 0, z: 0, bin: 0, area: 0, grade: '', ...extra });
// A front on a wall along z = 0 that faces +z, its middle at x.
const front = (id, kind, x, extra = {}) => ({ place: place(id, kind, extra), x, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, width: 7, ...extra.front });
const rowAt = (data, originX, originZ, x, z) => { const o = (Math.floor(z - originZ) * MAP_SPAN + Math.floor(x - originX)) * 2; return data[o] + 256 * data[o + 1]; };

test('the map gives each front its stretch of wall, and the nearer front wins where two meet', () => {
  const data = new Uint8Array(MAP_SPAN * MAP_SPAN * 2), nearest = new Float32Array(MAP_SPAN * MAP_SPAN), origin = -256;
  const fronts = [front('a', 'bodega', 0), front('b', 'pizza', 5), front('c', 'supermarket', 60, { front: { width: 20 } }), { ...front('d', 'coffee', -40), tx: 0, tz: 1, nx: 1, nz: 0, x: -40, z: 30 }];
  rasterFronts(fronts, origin, origin, data, nearest);
  const at = (x, z) => rowAt(data, origin, origin, x, z);
  // On the wall line and a step either side of it; not out in the street or deep in the building.
  assert.deepEqual([at(-2, 0.4), at(-2, -1.2), at(-2, 1.2), at(-2, 2.6), at(-2, -2.6)], [1, 1, 1, 0, 0]);
  // Each front runs half its width either way: 7 m for a shop, 20 m for the supermarket.
  assert.deepEqual([at(-3.2, 0), at(-4.8, 0), at(51.2, 0), at(69.4, 0), at(71.6, 0)], [1, 0, 3, 3, 0]);
  // Two fronts five metres apart split the wall between them.
  assert.deepEqual([at(1.9, 0), at(3.1, 0), at(8.2, 0)], [1, 2, 2]);
  // A front on a wall that runs the other way.
  assert.deepEqual([at(-40, 28), at(-40, 33.2), at(-40, 34.8), at(-37, 30)], [4, 4, 0, 0]);
  // Rows beyond the table are not written; fronts off the map are ignored.
  rasterFronts([front('far', 'bodega', 5000)], origin, origin, data, nearest);
  assert.ok(data.every(value => value === 0));
  const many = Array.from({ length: TABLE_ROWS + 5 }, (_, i) => front(`m${i}`, 'bodega', -250 + (i % 60) * 8, { front: { z: -250 + Math.floor(i / 60) * 8 } }));
  rasterFronts(many, origin, origin, data, nearest);
  let top = 0; for (let i = 0; i < data.length; i += 2) top = Math.max(top, data[i] + 256 * data[i + 1]);
  assert.equal(top, TABLE_ROWS - 1);
});

test('a sign is lettered with the name, and what else it says underneath', () => {
  const surface = canvas(), context = surface.getContext();
  drawSign(context, { name: 'RAYS SUPER DELI', tagline: 'GROCERY  ATM  LOTTO' }, 640, 80, 640, 80);
  assert.deepEqual(surface.cleared, [[640, 80, 640, 80]]);
  assert.deepEqual(surface.drawn.map(item => item.text), ['RAYS SUPER DELI', 'GROCERY  ATM  LOTTO']);
  assert.ok(surface.drawn.every(item => item.x === 960 && item.y > 80 && item.y < 160), 'centred in its cell');
  assert.ok(surface.drawn[0].y < surface.drawn[1].y && parseInt(surface.drawn[0].font.match(/(\d+)px/)[1]) > parseInt(surface.drawn[1].font.match(/(\d+)px/)[1]));
  // A long name is set smaller until it fits the cell.
  const long = canvas();
  drawSign(long.getContext(), { name: 'THE EXTRAORDINARILY LONG NAME OF A SHOP', tagline: '' }, 0, 0, 640, 80);
  const size = parseInt(long.drawn[0].font.match(/(\d+)px/)[1]);
  assert.ok(size < 68 * .9 && size * 39 * 30 / 68 <= 640, `${size}px`);
});

test('the three textures follow the fronts, the player and the hour', () => {
  const surface = canvas(), store = createStorefronts({ createCanvas: () => surface });
  assert.equal(shared.uNycPlaceMap.value, store.textures.map); assert.equal(shared.uNycPlaceTable.value, store.textures.table); assert.equal(shared.uNycPlaceAtlas.value, store.textures.atlas);
  assert.equal(shared.uNycPlaceRect.value.w, 0, 'nothing is looked up until there is something to find');
  assert.deepEqual(surface.drawn.map(item => item.text), ['A', 'B', 'C', 'OPEN'], 'the first cell holds the grade letters and OPEN');
  assert.deepEqual([surface.width, surface.height, ATLAS.cellHeight, ATLAS.cellWidth], [2048, 4096, ATLAS_CELL_HEIGHT, 8 * ATLAS_CELL_HEIGHT]);
  const fronts = [front('nails', 'nails', 40), front('cafe', 'american', 3, { grade: 'B' }), front('barber', 'barber', -20), front('pub', 'pub', 120), front('beyond', 'bodega', 400)];
  store.update(fronts, { x: 0.4, z: 0 }, 13);
  assert.deepEqual(store.counts, { fronts: 4, lettered: 4 }, 'a front beyond the map is left out');
  assert.deepEqual(store.fronts.map(item => item.place.id), ['cafe', 'barber', 'nails', 'pub'], 'nearest first');
  const rect = shared.uNycPlaceRect.value, table = store.textures.table.image.data, map = store.textures.map.image.data;
  assert.deepEqual([rect.x, rect.y, rect.z, rect.w], [-256, -256, 1 / MAP_SPAN, 1]);
  assert.equal(rowAt(map, rect.x, rect.y, 3, 0.5), 1); assert.equal(rowAt(map, rect.x, rect.y, -20, 0.5), 2); assert.equal(rowAt(map, rect.x, rect.y, 200, 0.5), 0);
  const stride = 4 * store.textures.table.image.width;
  const row = n => Array.from(table.slice(n * stride, (n + 1) * stride));
  // Row 1, the cafe: sign colours, open at lunch, grade B, lettering in a cell of its own, where its middle is and its trim.
  const cafe = row(1);
  assert.ok(cafe.slice(0, 3).every(c => c >= 0 && c <= 1) && cafe.slice(4, 7).every(c => c >= 0 && c <= 1) && cafe.slice(0, 3).join() !== cafe.slice(4, 7).join());
  assert.deepEqual([cafe[3], cafe[7], cafe[12], cafe[13], cafe[14], cafe[15]], [1, 2, 3, 0, 3.5, 0]);
  assert.ok(cafe[10] > 0 && Math.abs(cafe[10] - ATLAS.cellWidth / ATLAS.width) < 1e-6 && Math.abs(cafe[11] - ATLAS.cellHeight / ATLAS.height) < 1e-6);
  assert.deepEqual([row(2)[15], row(4)[15], row(3)[15]], [1, 2, 0], 'a pole for the barber, neon for the pub');
  assert.deepEqual(row(0), new Array(stride).fill(0), 'row 0 is nobody');
  const cells = [1, 2, 3, 4].map(n => row(n).slice(8, 10).join());
  assert.equal(new Set(cells).size, 4, 'every sign has its own lettering');
  assert.ok(surface.drawn.some(item => item.text === 'CAFE') && surface.drawn.some(item => item.text === 'HAIRCUTS  SHAVES  FADES'));
  // Nothing is redone while the player stands still; who is open follows the clock.
  const letters = surface.drawn.length, version = store.textures.map.version;
  store.update(fronts, { x: 3, z: 2 }, 13.1);
  assert.equal(surface.drawn.length, letters); assert.equal(store.textures.map.version, version);
  store.update(fronts, { x: 3, z: 2 }, 22);
  assert.deepEqual([row(1)[3], row(2)[3], row(3)[3], row(4)[3]], [1, 0, 0, 1], 'at ten at night the cafe and the pub are open, the barber and the nail salon shut');
  // Walking on redraws the map about the player; a sign already lettered keeps its cell and is not drawn again.
  store.update(fronts, { x: 30, z: 0 }, 22);
  assert.ok(store.textures.map.version > version); assert.equal(shared.uNycPlaceRect.value.x, -226);
  assert.equal(surface.drawn.length, letters, 'the same four signs');
  assert.deepEqual(store.fronts.map(item => item.place.id), ['nails', 'cafe', 'barber', 'pub']);
  assert.equal([1, 2, 3, 4].map(n => row(n).slice(8, 10).join()).sort().join('|'), [...cells].sort().join('|'));
  // A new list of fronts: new signs are lettered into free cells.
  store.update([...fronts.slice(0, 2), front('deli', 'bodega', 35)], { x: 30, z: 0 }, 22);
  assert.ok(surface.drawn.length > letters && surface.drawn.some(item => item.text === 'DELI'));
  assert.deepEqual(store.counts, { fronts: 3, lettered: 3 });
  store.update([], { x: 30, z: 0 }, 22);
  assert.equal(shared.uNycPlaceRect.value.w, 0);
  store.dispose();
  assert.equal(shared.uNycPlaceMap.value, null);
});

test('only a loaded, open, enterable room opens panes on its own wall', () => {
  const scene = new THREE.Scene();
  let floor = 2;
  const store = createStorefronts({ scene, createCanvas: canvas, roomFor: front => planRoom(front, () => front.place.id !== 'shallow'), floorFor: () => floor });
  const fronts = [front('deli', 'bodega', 0), front('bank', 'bank', 10), front('shallow', 'coffee', 20), front('garage', 'repair', 30), front('far', 'bodega', 130)];
  const tick = (hours, revision = 0, focus = fronts[0]) => store.update(fronts, focus, hours, true, revision);
  const pane = row => Array.from(store.textures.table.image.data.slice(row * 20 + 16, row * 20 + 20));
  tick(12);
  assert.deepEqual(pane(1), [0, 1, 2, 3.5]); assert.equal(pane(2)[3], 0);
  const deli = scene.children[0];
  tick(12);
  assert.deepEqual(pane(2), [0, 1, 2, 3.5]); assert.equal(scene.children.length, 2);
  assert.ok(scene.children.every(group => group.children[0].isMesh && group.userData.door));
  assert.ok([3, 4, 5].every(row => pane(row)[3] === 0));
  floor = 3; tick(23, 1);
  assert.deepEqual(scene.children, [deli]); assert.equal(deli.position.y, 3);
  assert.equal(pane(1)[2], 3); assert.equal(pane(2)[3], 0, 'the bank closes');
  tick(23, 1, fronts[4]);
  assert.equal(deli.parent, null); assert.equal(scene.children[0].name, 'Through the windows of FAR');
  store.dispose(); assert.equal(scene.children.length, 0);
});

test('more fronts than there is lettering for: the nearest are lettered, the rest keep their colours', () => {
  const surface = canvas(), store = createStorefronts({ createCanvas: () => surface });
  const fronts = Array.from({ length: 200 }, (_, i) => front(`shop ${i}`, 'bodega', i * 2 - 200));
  store.update(fronts, { x: 0, z: 0 }, 12);
  const lettering = ATLAS.columns * ATLAS.rows - 1, table = store.textures.table.image.data;
  assert.deepEqual(store.counts, { fronts: 200, lettered: lettering });
  const stride = 4 * store.textures.table.image.width;
  for (let n = 1; n <= 200; n++) { assert.ok(table[n * stride] + table[n * stride + 1] + table[n * stride + 2] > 0, 'every front has its colours'); assert.equal(table[n * stride + 10] > 0, n <= lettering); }
  store.dispose();
});

test('the facade shader asks whose shop front it is drawing', () => {
  for (const name of ['uNycPlaceMap', 'uNycPlaceRect', 'uNycPlaceTable', 'uNycPlaceAtlas', 'uNycPlaceGlyphs']) { assert.ok(name in shared, name); assert.match(NYC_COMMON_GLSL, new RegExp(`uniform (sampler2D|vec4) ${name};`)); }
  assert.match(FACADE_FRAGMENT, /nycFacadeWorld = cameraPosition \+ vNycFogRay;/);
  const start = FACADE_FRAGMENT_PARS.indexOf('// --- Street storey'), end = FACADE_FRAGMENT_PARS.indexOf('// --- Cornice or coping'), storey = FACADE_FRAGMENT_PARS.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(storey, /textureLod\( uNycPlaceMap, placeAt, 0\.0 \)/);
  assert.match(storey, /texelFetch\( uNycPlaceTable, ivec2\( 3, row \), 0 \)/);
  // Inside a branch the GPU has no screen-space derivatives to choose a mip level by: every lookup there names its own.
  assert.ok(!/texture2D\s*\(|texture\s*\(/.test(storey), 'no implicit-level texture lookups in the street storey');
  assert.match(storey, new RegExp(`pixel\\.y \\* ${ATLAS_CELL_HEIGHT}\\.0 / 0\\.36`));
  for (const word of ['flat', 'cast', 'patch', 'sample', 'filter', 'input', 'output', 'common', 'active', 'half', 'smooth', 'layout', 'centroid', 'partition', 'resource', 'precise', 'coherent', 'volatile', 'restrict', 'readonly', 'writeonly', 'shared', 'namespace', 'using', 'external', 'interface', 'long', 'short', 'double', 'fixed', 'unsigned', 'superp', 'template', 'this', 'packed', 'goto', 'union', 'enum', 'typedef', 'class', 'inline', 'noinline', 'public', 'static', 'extern', 'asm', 'sizeof', 'row_major'])
    assert.ok(!new RegExp(`\\b(?:float|vec[234]|int|bool)\\s+(?:[A-Za-z_]+\\s*(?:=[^;,]*)?,\\s*)*${word}\\b`).test(storey), `"${word}" is reserved`);
});

test('a chain whose logo has been fetched is signed with it, in its own colours; without it, by name', () => {
  const surface = canvas(), store = createStorefronts({ createCanvas: () => surface });
  const fronts = [front('STARBUCKS', 'coffee', -10), front('FANELLI CAFE', 'american', 10)];
  store.update(fronts, { x: 0, z: 0 }, 12);
  const table = store.textures.table.image.data, stride = 4 * store.textures.table.image.width;
  const trim = n => table[n * stride + 15], ground = n => [table[n * stride], table[n * stride + 1], table[n * stride + 2]].map(value => Math.round(value * 100) / 100);
  assert.ok(trim(1) < LOGO_TRIM && trim(2) < LOGO_TRIM, 'no logos on this machine: names');
  const greenGround = ground(1);
  // The logo arrives: the sign is drawn again as an image on its own ground, and the table says so.
  const drawn = []; surface.getContext('2d').drawImage = (...args) => drawn.push(args);
  store.setLogos(new Map([['starbucks', { image: { id: 'siren' }, width: 400, height: 400, background: '#ffffff' }]]));
  store.update(fronts, { x: 0, z: 0 }, 12);
  assert.ok(trim(1) >= LOGO_TRIM && trim(2) < LOGO_TRIM); assert.deepEqual(ground(1), [1, 1, 1]); assert.notDeepEqual(greenGround, [1, 1, 1]);
  assert.equal(drawn.length, 1); assert.equal(drawn[0][0].id, 'siren');
  // It keeps its shape, fits its cell and sits in the middle of it.
  const [, x, y, w, h] = drawn[0];
  assert.ok(Math.abs(w - h) < 1e-6 && h <= ATLAS.cellHeight * .84 + 1e-6 && w <= ATLAS.cellWidth * .9 + 1e-6 && x % ATLAS.cellWidth > 100 && Math.abs((x % ATLAS.cellWidth) + w / 2 - ATLAS.cellWidth / 2) < 1e-6);
  store.setLogos(null); store.update(fronts, { x: 0, z: 0 }, 12);
  assert.ok(trim(1) < LOGO_TRIM, 'and without it, the name again');
  store.dispose();
});

test('Bank of America and Chase have full-colour fascia signs before optional logos load', () => {
  const surface=canvas(), store=createStorefronts({createCanvas:()=>surface});
  store.update([front('Bank of America','bank',2),front('Chase Bank','bank',12),front('Neighborhood Bank','bank',22)],{x:0,z:0},12);
  const table=store.textures.table.image.data, stride=4*store.textures.table.image.width;
  assert.deepEqual([1,2,3].map(row=>table[row*stride+15]>=LOGO_TRIM),[true,true,false]);
  assert.ok(surface.drawn.some(item=>item.text==='Bank of America') && surface.drawn.some(item=>item.text==='CHASE'));
  store.dispose();
});

test('a corner carries one tenant and one room around both street faces', () => {
  const building = { id:'corner', polygon:[[0,0],[24,0],[24,18],[0,18]] };
  for (const polygon of [building.polygon, [...building.polygon].reverse(), [[0,0],[24,0],[29,18],[5,18]]]) {
    const footprints = indexFootprints([{...building, polygon}]);
    const [front] = solveFrontages([{kind:'coffee',group:'cafe',name:'Corner Coffee',id:'coffee',x:.2,z:.1}], footprints, (x,z)=>x<(polygon[3][0]===5?5*z/18:0) || z<0);
    assert.equal(front.returns.length, 1);
    const scene = new THREE.Scene(), store = createStorefronts({scene,createCanvas:canvas,roomFor:f=>planRoom(f,(x,z)=>footprints.at(x,z)),floorFor:()=>0});
    store.update([front],front,12);
    const view=store.get('coffee'), data=store.textures.table.image.data;
    assert.equal(scene.children.length,1);assert.ok(data[39]>0 && data[59]<0);
    const rect=shared.uNycPlaceRect.value;
    assert.equal(rowAt(store.textures.map.image.data,rect.x,rect.y,data[52],data[53]),2);
    assert.deepEqual([...data.slice(28,32)],[...data.slice(48,52)],'both signs use the same lettering');
    store.setActive(view);store.update([front],front,23);
    assert.strictEqual(store.get('coffee'),view,'closing time keeps an occupied shop in place');
    store.setActive(null);store.update([front],front,23);
    assert.strictEqual(store.closingDoor,view,'a closing door stays until the player clears the jamb');
    store.update([front],{x:front.x+front.nx*2,z:front.z+front.nz*2},23);
    assert.equal(store.get('coffee'),undefined);
    store.dispose();
  }
});
