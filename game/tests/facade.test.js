import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { STYLES, STYLE_INDEX, FLAG, HEIGHT_UNIT, MATERIAL, chooseStyle, featureRandom, writeFacade, createFacadeScratch, businessDistrict, loftDistrict,
  applyFacadeShader, FACADE_FRAGMENT_PARS, FOUNDATION_DEPTH } from '../dist/facade.js';
import { decodeI3S } from '../dist/city-stream.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url), 'utf8'));
function fixture(name, resource) {
  const bytes = gunzipSync(readFileSync(new URL(`./fixtures/i3s-${name}.bin.gz`, import.meta.url)));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return decodeI3S(buffer, index.nodes.find(node => node.resource === resource), index.origin, { collisions: true });
}

/** A box building as a triangle soup: x, height above base, z per vertex. */
function box(width, depth, height, x = 0, z = 0) {
  const corners = [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]], out = [];
  const tri = (...points) => { for (const point of points) out.push(...point); };
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    // Wound so each wall faces away from the middle, as the survey's are.
    tri([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], height, a[1]]); tri([b[0], 0, b[1]], [a[0], height, a[1]], [b[0], height, b[1]]);
  }
  tri([corners[0][0], height, corners[0][1]], [corners[3][0], height, corners[3][1]], [corners[2][0], height, corners[2][1]]);
  tri([corners[0][0], height, corners[0][1]], [corners[2][0], height, corners[2][1]], [corners[1][0], height, corners[1][1]]);
  return new Float32Array(out);
}
function dress(positions, options = {}) {
  const count = positions.length / 3, normals = new Int8Array(count * 4), facade = new Uint16Array(count * 4), style = new Uint8Array(count * 4);
  const result = writeFacade(positions, 0, count, { normals, facade, style, heightByte: 9, seedByte: 77, scratch: createFacadeScratch(),
    choose: area => ({ style: STYLE_INDEX.tenement, flags: 2, area }), ...options });
  return { ...result, normals, facade, style, count };
}

test('every building type is fully specified and reaches the shader tables', () => {
  assert.ok(STYLES.length >= 12);
  assert.equal(new Set(STYLES.map(style => style.id)).size, STYLES.length);
  for (const style of STYLES) {
    assert.ok(style.bay > 1 && style.bay < 8 && style.floor > 2.5 && style.floor < 6, style.id);
    assert.ok(style.ground === 0 || style.ground > style.floor * .9, `${style.id} street storey`);
    assert.equal(style.window.length, 4);
    assert.ok(style.window[0] > 0 && style.window[0] < 1 && style.window[1] > 0 && style.window[2] + style.window[1] <= 1.0001, `${style.id} window fits its storey`);
    assert.ok(Object.values(MATERIAL).includes(style.material));
    assert.equal(style.palettes.length, 4);
    for (const palette of style.palettes) assert.ok(palette.length === 3 && palette.every(color => /^#[0-9a-f]{6}$/.test(color)));
    assert.ok(style.lit >= 0 && style.lit <= 1 && style.shops >= 0 && style.shops <= 1 && style.escapes >= 0 && style.escapes <= 1);
  }
  assert.match(FACADE_FRAGMENT_PARS, new RegExp(`#define NYC_STYLE_COUNT ${STYLES.length}\\b`));
  assert.match(FACADE_FRAGMENT_PARS, new RegExp(`const vec3 NYC_WALL\\[${STYLES.length * 4}\\]`));
  assert.match(FACADE_FRAGMENT_PARS, new RegExp(`const vec4 NYC_STYLE_A\\[${STYLES.length}\\]`));
});

test('a building type follows its height, footprint and neighbourhood', () => {
  const tally = (volume, runs = 600) => {
    const counts = {};
    for (let i = 0; i < runs; i++) { const [random, random2] = featureRandom(`feature-${i}`); const id = STYLES[chooseStyle({ ...volume, random, random2 }).style].id; counts[id] = (counts[id] || 0) + 1; }
    return counts;
  };
  const midtown = { x: 1400, z: -3900 }, soho = { x: 130, z: -100 }, queens = { x: 12000, z: -2000 };
  assert.ok(businessDistrict(midtown.x, midtown.z) > .8 && businessDistrict(queens.x, queens.z) === 0);
  assert.ok(loftDistrict(soho.x, soho.z) && !loftDistrict(queens.x, queens.z));
  const supertall = tally({ height: 300, area: 2500, ...midtown });
  assert.ok((supertall.supertall || 0) > 300 && !supertall.house && !supertall.tenement, 'the tallest towers are glass or stone');
  const lofts = tally({ height: 22, area: 500, ...soho });
  assert.ok(lofts.loft > 300, 'SoHo is mostly lofts');
  const houses = tally({ height: 7, area: 110, ...queens });
  assert.deepEqual(Object.keys(houses), ['house'], 'low outer-borough volumes are houses');
  const walkups = tally({ height: 20, area: 300, x: 2800, z: -6500 });
  assert.ok(walkups.tenement > 250 && !walkups.supertall && !walkups.curtain);
  assert.ok((tally({ height: 6, area: 2000, ...queens }).industrial || 0) === 600, 'broad low sheds are industrial');
  // Shop fronts and fire escapes are per-building flags within their type's odds.
  let shops = 0, escapes = 0;
  for (let i = 0; i < 2000; i++) {
    const [random, random2] = featureRandom(`t-${i}`), { style, flags } = chooseStyle({ height: 20, area: 300, x: 2800, z: -6500, random, random2 });
    assert.ok((flags & FLAG.PALETTE) < 4 && !(flags & FLAG.BLANK));
    if (STYLES[style].id !== 'tenement') continue;
    shops += Boolean(flags & FLAG.SHOP); escapes += Boolean(flags & FLAG.ESCAPE);
  }
  assert.ok(shops > 100 && escapes > shops, 'tenements often have shops and more often have fire escapes');
});

test('feature identifiers give stable, well-spread random pairs', () => {
  assert.deepEqual(featureRandom('1234567'), featureRandom(1234567));
  assert.notDeepEqual(featureRandom('1234567'), featureRandom('1234568'));
  let sum = 0, sum2 = 0;
  for (let i = 0; i < 4000; i++) { const [a, b] = featureRandom(900000 + i); assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1); sum += a; sum2 += b; }
  assert.ok(Math.abs(sum / 4000 - .5) < .03 && Math.abs(sum2 / 4000 - .5) < .03);
});

test('walls get a coordinate along their length, shared by parallel faces; roofs do not', () => {
  const { facade, normals, style, count, area } = dress(box(12, 8, 30, 100, 200));
  assert.ok(Math.abs(area - 96) < 1e-6, 'plan area comes from the upward surfaces');
  const walls = new Map();
  for (let i = 0; i < count; i++) {
    const length = facade[i * 4 + 2], ny = normals[i * 4 + 1];
    assert.equal(facade[i * 4 + 1], Math.round(new Float32Array(box(12, 8, 30, 100, 200))[i * 3 + 1] * 100), 'height above the base, in centimetres');
    if (Math.abs(ny) > 60) { assert.equal(length, 0, 'a roof has no wall length'); assert.equal(facade[i * 4 + 3], 0); continue; }
    assert.ok(length === 1200 || length === 800, `wall length ${length}`);
    assert.ok(facade[i * 4] >= 0 && facade[i * 4] <= length);
    assert.equal(facade[i * 4 + 3], 3000, 'the top of the wall is known at every vertex');
    const key = `${normals[i * 4]},${normals[i * 4 + 2]}`;
    if (!walls.has(key)) walls.set(key, new Set());
    walls.get(key).add(facade[i * 4]);
    assert.deepEqual([...style.subarray(i * 4, i * 4 + 4)], [77, STYLE_INDEX.tenement, 9, 2]);
  }
  assert.equal(walls.size, 4, 'four facings');
  for (const [key, along] of walls) {
    const length = key.startsWith('0,') ? 1200 : 800;
    assert.deepEqual([...along].sort((a, b) => a - b), [0, length], `each wall runs from 0 to its length (${key})`);
  }
  // Normals are unit length within a byte's precision and match Three's winding.
  for (let i = 0; i < count; i++) assert.ok(Math.abs(Math.hypot(normals[i * 4], normals[i * 4 + 1], normals[i * 4 + 2]) - 127) <= 1);
  assert.equal(normals[1], 0); assert.ok(Math.abs(normals[0]) + Math.abs(normals[2]) === 127, 'walls face outward horizontally');
});

test('a wall against a neighbour is flagged blank; the rest keep their windows', () => {
  // Only the wall whose outside lies beyond x = 12 touches a neighbour.
  const { facade, normals, style, count } = dress(box(12, 8, 30), { isBlank: x => x > 12 });
  let blank = 0, open = 0;
  for (let i = 0; i < count; i++) {
    if (!facade[i * 4 + 2]) { assert.equal(style[i * 4 + 3] & FLAG.BLANK, 0, 'roofs are never flagged'); continue; }
    if (style[i * 4 + 3] & FLAG.BLANK) { blank++; assert.equal(normals[i * 4], 127, 'the blank wall is the one facing the neighbour'); }
    else open++;
  }
  assert.equal(blank, 6); assert.equal(open, 18);
});

test('real survey tiles decode with facade attributes for every vertex', () => {
  for (const [name, resource, expected] of [['soho', 4341, 'loft'], ['brooklyn', 4, 'rowhouse'], ['staten-island', 2737, 'house']]) {
    const data = fixture(name, resource), count = data.triangles * 3;
    assert.equal(data.normals.length, count * 4); assert.equal(data.facade.length, count * 4); assert.equal(data.style.length, count * 4);
    const tally = {};
    let walls = 0, blank = 0;
    for (const anchor of data.anchors) {
      const id = STYLES[data.style[anchor.start * 4 + 1]].id; tally[id] = (tally[id] || 0) + 1;
      // One type and one seed per building, across all its triangles.
      for (let i = anchor.start; i < anchor.end; i++) { assert.equal(data.style[i * 4 + 1], data.style[anchor.start * 4 + 1]); assert.equal(data.style[i * 4], data.style[anchor.start * 4]); }
    }
    for (let i = 0; i < count; i += 3) {
      const length = data.facade[i * 4 + 2];
      assert.equal(data.facade[(i + 1) * 4 + 2], length); assert.equal(data.facade[(i + 2) * 4 + 2], length, 'a triangle lies on one wall');
      if (!length) continue;
      walls++; blank += Boolean(data.style[i * 4 + 3] & FLAG.BLANK);
      for (let k = 0; k < 3; k++) assert.ok(data.facade[(i + k) * 4] <= length && data.facade[(i + k) * 4 + 1] <= data.facade[(i + k) * 4 + 3], 'vertices lie within their wall');
    }
    const commonest = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(commonest, expected, `${name} is mostly ${expected}: ${JSON.stringify(tally)}`);
    assert.ok(blank / walls > .05 && blank / walls < .5, `${name}: ${(100 * blank / walls).toFixed(0)}% lot-line walls`);
    assert.ok(Math.max(...data.style.filter((_, i) => i % 4 === 2)) * HEIGHT_UNIT < 400);
    // Nearly every building has walls that start at its base: those are the ones given a foundation.
    let grounded = 0;
    for (const anchor of data.anchors) {
      let foot = false;
      for (let i = anchor.start; i < anchor.end && !foot; i++) foot = data.facade[i * 4 + 2] > 0 && data.facade[i * 4 + 1] === 0;
      grounded += foot;
    }
    assert.ok(grounded / data.anchors.length > .97, `${name}: ${grounded} of ${data.anchors.length} buildings reach the ground with a wall`);
  }
});

test('the shader hook adds facade inputs without disturbing the stock material', () => {
  const shader = { vertexShader: 'void main() {\n#include <begin_vertex>\n}', fragmentShader: '#include <clipping_planes_pars_fragment>\nvoid main() {\n#include <emissivemap_fragment>\n#include <lights_physical_fragment>\n}' };
  applyFacadeShader(shader);
  assert.match(shader.vertexShader, /vFacade = aFacade\.xy \* 0\.01;/);
  assert.match(shader.vertexShader, /flat varying vec4 vStyle;/);
  const call = shader.fragmentShader.indexOf('nycFacade( vec4( vFacade.x, max( vFacade.y, 0.0 ), vFacadeWall )');
  assert.ok(call > 0 && call < shader.fragmentShader.indexOf('#include <lights_physical_fragment>'), 'the wall is dressed before it is lit');
  // Each wall's foot is carried below its measured base and finished as a foundation.
  assert.ok(FOUNDATION_DEPTH >= 8);
  assert.ok(shader.vertexShader.includes(`if ( aFacade.z > 0.5 && aFacade.y < 0.5 ) { transformed.y -= ${FOUNDATION_DEPTH}.0; vFacade.y = - ${FOUNDATION_DEPTH}.0; }`));
  assert.ok(shader.vertexShader.indexOf('transformed.y -=') > shader.vertexShader.indexOf('#include <begin_vertex>'), 'the vertex is moved after Three has read its position');
  assert.match(shader.fragmentShader, /if \( vFacade\.y < 0\.0 \) \{/);
  // Words reserved by GLSL ES 3.0 must not be used as names: they fail only on a GPU.
  for (const word of ['flat', 'cast', 'patch', 'sample', 'filter', 'input', 'output', 'common', 'active', 'half'])
    assert.ok(!new RegExp(`\\b(?:float|vec[234]|int|bool)\\s+${word}\\b`).test(FACADE_FRAGMENT_PARS), `"${word}" is reserved`);
});
