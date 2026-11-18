import { mercatorCoefficients } from '../dist/imagery-projection.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCityStream } from '../dist/city-stream.js';

const index = { nodes: [], roots: [] };
const atlas = (offset = 0) => ({
  texture: new THREE.Texture(),
  bounds: { minX: offset - 250, maxX: offset + 250, minZ: -250, maxZ: 250 },
  mercator: { north: .782, south: .781, originLat: .7108, radius: 6371008.8 },
});
function compileHook(stream) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  stream.material.onBeforeCompile(shader);
  return shader;
}

test('moving local imagery updates existing roof uniforms without a new shader or texture allocation', () => {
  const stream = createCityStream(index), local = atlas(), coarse = atlas(5000);
  stream.setOrthophoto(coarse);
  const shader = compileHook(stream), version = stream.material.version;
  assert.equal(shader.uniforms.cityUseLocalOrtho.value, false);
  stream.setLocalOrthophoto(local);
  assert.equal(shader.uniforms.cityUseLocalOrtho.value, true);
  assert.equal(shader.uniforms.cityLocalOrtho.value, local.texture);
  assert.deepEqual(shader.uniforms.cityLocalOrthoBounds.value.toArray(), [-250, 250, -250, 250]);
  assert.deepEqual(shader.uniforms.cityLocalMercator.value.toArray(), mercatorCoefficients(local.bounds,local.mercator));
  const boundsUniform = shader.uniforms.cityLocalOrthoBounds.value;
  local.bounds = { minX: 800, maxX: 1300, minZ: -500, maxZ: 0 };
  local.mercator = { ...local.mercator, north: .783, south: .782 };
  stream.setLocalOrthophoto(local);
  assert.equal(shader.uniforms.cityLocalOrthoBounds.value, boundsUniform);
  assert.deepEqual(boundsUniform.toArray(), [800, 1300, -500, 0]);
  assert.deepEqual(shader.uniforms.cityLocalMercator.value.toArray(), mercatorCoefficients(local.bounds,local.mercator));
  assert.equal(shader.uniforms.cityOrtho.value, coarse.texture, 'local streaming keeps its coarse fallback');
  assert.equal(stream.material.version, version, 'tile crossings must not trigger program recompilation');
  stream.dispose();local.texture.dispose();coarse.texture.dispose();
});

test('invalid or unavailable local atlases disable close imagery while preserving the coarse roof', () => {
  const stream = createCityStream(index), local = atlas(), coarse = atlas(5000);
  stream.setOrthophoto(coarse);
  const invalid = [undefined, {}, { ...local, texture: null },
    { ...local, bounds: { ...local.bounds, minX: NaN } },
    { ...local, bounds: { ...local.bounds, maxX: local.bounds.minX } },
    { ...local, mercator: { ...local.mercator, north: local.mercator.south } },
    { ...local, mercator: { ...local.mercator, radius: 0 } }];
  for (const value of invalid) {
    stream.setLocalOrthophoto(local);
    assert.equal(stream.orthoUniforms.cityUseLocalOrtho.value, true);
    stream.setLocalOrthophoto(value);
    assert.equal(stream.orthoUniforms.cityUseLocalOrtho.value, false);
    assert.equal(stream.orthoUniforms.cityUseOrtho.value, true);
    assert.equal(stream.orthoUniforms.cityOrtho.value, coarse.texture);
  }
  stream.setLocalOrthophoto({ texture: local.texture, bounds: local.bounds });
  assert.equal(stream.orthoUniforms.cityUseLocalOrtho.value, true);
  assert.equal(stream.orthoUniforms.cityUseLocalMercator.value, false, 'local linear imagery remains supported');
  stream.dispose();local.texture.dispose();coarse.texture.dispose();
});

test('the standard-material shader keeps imagery on roofs and falls back for missing local tiles', () => {
  const stream = createCityStream(index), shader = compileHook(stream);
  // These assert the material hook's integration contract, not GPU compilation.
  // Surveyed vertex coordinates pass through untouched: the hook only adds varyings.
  assert.ok(shader.vertexShader.includes('varying vec2 vCityXZ; varying float vCityRoof;'));
  assert.ok(shader.vertexShader.includes('vCityXZ = position.xz; vCityRoof = abs(normal.y);'));
  assert.equal(shader.vertexShader.match(/#include <begin_vertex>/g).length, 1);
  assert.ok(!/transformed\s*[+\-*]?=/.test(shader.vertexShader.replace(THREE.ShaderLib.standard.vertexShader, '')), 'no vertex is displaced');
  const colorStart = shader.fragmentShader.indexOf('#include <color_fragment>');
  const alphaStart = shader.fragmentShader.indexOf('#include <alphamap_fragment>');
  const surface = shader.fragmentShader.slice(colorStart, alphaStart);
  assert.match(surface, /if \(vCityRoof > 0\.65\)/);
  assert.ok(surface.indexOf('texture2D(cityOrtho,cityUV)') < surface.indexOf('texture2D(cityLocalOrtho,cityLocalUV)'),
    'source overview imagery provides the initial roof color');
  assert.match(surface, /all\(greaterThanEqual\(cityLocalUV,vec2\(0\.0\)\)\) && all\(lessThanEqual\(cityLocalUV,vec2\(1\.0\)\)\)/,
    'roofs outside the close atlas must not smear its border pixels');
  assert.match(surface, /if \(cityLocalSample\.a > 0\.99\) diffuseColor\.rgb = cityLocalSample\.rgb;/,
    'transparent, missing or partially filtered tiles retain the coarse roof');
  assert.match(shader.fragmentShader, /cityAtlasUV\(cityLocalOrthoBounds, cityLocalMercator, cityUseLocalMercator\)/);
  assert.match(shader.fragmentShader, /#include <lights_physical_fragment>/, 'normal PBR lighting is retained');
  assert.equal(stream.material.name, 'Official citywide measured surfaces');
  stream.dispose();
});

test('walls are dressed in the fragment stage, after roof imagery and before lighting', () => {
  const stream = createCityStream(index), shader = compileHook(stream);
  assert.match(shader.vertexShader, /attribute vec4 aFacade;[\s\S]*attribute vec4 aStyle;/);
  assert.match(shader.vertexShader, /flat varying vec2 vFacadeWall;/, 'per-wall constants are not interpolated');
  const roof = shader.fragmentShader.indexOf('if (vCityRoof > 0.65)'), walls = shader.fragmentShader.indexOf('if ( vFacadeWall.x > 0.004 )');
  const lighting = shader.fragmentShader.indexOf('#include <lights_physical_fragment>');
  assert.ok(roof > 0 && walls > roof && lighting > walls);
  // A roof has zero wall length, so the facade branch never touches it.
  assert.match(shader.fragmentShader, /NycFacade nycFacade\(/);
  stream.dispose();
});

test('survey cutaways follow furnished rooms, streamed floor elevations and room removal', () => {
  const stream = createCityStream(index);
  try {
    const color = compileHook(stream);
    const depth = { ...THREE.ShaderLib.depth, uniforms: {} };
    stream.depthMaterial.onBeforeCompile(depth);
    const { roomCutCount, roomCuts, roomCutMin, roomCutMax } = color.uniforms;
    assert.equal(depth.uniforms.roomCuts, roomCuts);
    assert.equal(roomCutCount.value, 0);
    // A skewed Adams Street room on a slope. The survey bottom is at 21.16 m.
    const plan = { x: 1045, z: 3106, nx: 1, nz: 0, tx: 0, tz: 1, width: 9, depth: 12, skew: .25 };
    const view = { plan, floor: 20 };
    stream.roomCutaways.update([view]);
    assert.equal(roomCutCount.value, 1);
    assert.deepEqual(roomCutMin.value.toArray(), [1033,20,3101.5]);
    assert.deepEqual(roomCutMax.value.toArray(), [1045,23.1,3113.5]);
    assert.deepEqual(Array.from(roomCuts.value.image.data.slice(4,11)), [0,1,1,0,4.5,12,.25]);
    const version = roomCuts.value.version;
    stream.roomCutaways.update([view]);
    assert.equal(roomCuts.value.version, version, 'standing still does not upload room data');
    view.floor += 2;
    stream.roomCutaways.update([view]);
    assert.equal(roomCutMin.value.y, 22);
    assert.equal(roomCuts.value.image.data[2], 22);
    const adjacent = { plan: {...plan, x: 1058, skew: 0}, floor: 18 };
    stream.roomCutaways.update([view, adjacent]);
    assert.equal(roomCutCount.value, 2);
    assert.equal(roomCutMax.value.x, 1058);
    stream.roomCutaways.update([adjacent]);
    assert.equal(roomCutCount.value, 1);
    assert.equal(roomCuts.value.image.data[0], 1058);
    stream.roomCutaways.update([]);
    assert.equal(roomCutCount.value, 0);
  } finally { stream.dispose(); }
});
