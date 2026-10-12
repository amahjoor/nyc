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
  assert.deepEqual(shader.uniforms.cityLocalMercator.value.toArray(), [.782, .781, .7108, 6371008.8]);
  const boundsUniform = shader.uniforms.cityLocalOrthoBounds.value;
  local.bounds = { minX: 800, maxX: 1300, minZ: -500, maxZ: 0 };
  local.mercator = { ...local.mercator, north: .783, south: .782 };
  stream.setLocalOrthophoto(local);
  assert.equal(shader.uniforms.cityLocalOrthoBounds.value, boundsUniform);
  assert.deepEqual(boundsUniform.toArray(), [800, 1300, -500, 0]);
  assert.deepEqual(shader.uniforms.cityLocalMercator.value.toArray(), [.783, .782, .7108, 6371008.8]);
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
  // Unverified facades and surveyed vertex coordinates remain unchanged.
  assert.equal(shader.vertexShader, 'varying vec2 vCityXZ; varying float vCityRoof;\n'
    + THREE.ShaderLib.standard.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCityXZ = position.xz; vCityRoof = abs(normal.y);'));
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
