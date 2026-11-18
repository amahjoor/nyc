import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { shared, CASCADES, installShaderChunks, shareUniforms, shareSceneUniforms, replaceChunk, noisePixels, NYC_COMMON_GLSL } from '../dist/gfx-common.js';
import { createGraphics, CASCADE_EXTENTS, QUALITY, TIME_PRESETS } from '../dist/gfx.js';
import { skyState } from '../dist/atmosphere.js';
import { Sky } from '../dist/sky.js';

// A renderer with no GL context: the graphics layer must still run its logic.
function stubRenderer() { return { shadowMap: { enabled: false }, info: { render: {} }, rendered: 0, render() { this.rendered++; }, setPixelRatio() {}, setSize() {} }; }
function setup(options = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 9000), renderer = stubRenderer();
  camera.position.set(0, 2, 0); camera.lookAt(0, 2, -10); camera.updateMatrixWorld();
  return { scene, camera, renderer, graphics: createGraphics({ renderer, scene, camera, ...options }) };
}

test('Three\'s stock shader chunks gain haze, cascaded sun shadows and city light, once', () => {
  installShaderChunks();
  const chunk = THREE.ShaderChunk, lights = chunk.lights_fragment_begin;
  installShaderChunks();
  assert.equal(chunk.lights_fragment_begin, lights, 'installing twice changes nothing');
  assert.ok(chunk.common.includes(NYC_COMMON_GLSL));
  assert.match(chunk.common, new RegExp(`#define NYC_CSM ${CASCADES}\\b`));
  assert.match(chunk.fog_fragment, /nycHaze\( vNycFogRay, cameraPosition\.y, fogColor, fogDensity \)/);
  assert.match(chunk.fog_vertex, /vNycFogRay = mvPosition\.xyz \* mat3\( viewMatrix \)/);
  assert.match(lights, /nycSunShadow\(\)/); assert.match(lights, /directLight\.color \*= nycSunMask;/);
  // Only the first cascade lights the surface; later sun cascades are skipped, other lights are kept.
  assert.match(lights, /#if UNROLLED_LOOP_INDEX == 0[\s\S]+#elif UNROLLED_LOOP_INDEX >= NYC_CSM[\s\S]+RE_Direct/);
  assert.match(chunk.shadowmap_pars_fragment, /float nycSunShadow\(\)/);
  assert.match(chunk.lights_pars_begin, /uniform highp sampler2D uNycCarLights;/);
  assert.match(chunk.lights_fragment_end, /nycVehicleLight\( nycWorld, nycLightUV, .*uNycLights \)/, 'the lit surface supplies its own position to each vehicle light');
  assert.match(chunk.lights_fragment_end, /uNycLightMap[\s\S]+RE_IndirectDiffuse/, 'city light joins the indirect term before it is applied');
  // Stock materials still assemble: every include resolves to a chunk.
  for (const name of ['standard', 'basic', 'lambert', 'physical']) for (const include of THREE.ShaderLib[name].fragmentShader.match(/#include <(\w+)>/g))
    assert.ok(include.slice(10, -1) in chunk, include);
  assert.throws(() => replaceChunk('void main() {}', 'no such snippet', '', 'probe'), /no longer matches: probe/);
  assert.equal(replaceChunk('a  b\n\tc', 'a b c', 'x', 'spacing'), 'x', 'matching ignores how whitespace was collapsed');
});

test('stock materials receive the shared uniforms without losing their own hooks', () => {
  const calls = [], material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = shader => { calls.push('own'); shader.uniforms.mine = { value: 1 }; };
  const twin = new THREE.MeshStandardMaterial(), version = material.version;
  assert.equal(shareUniforms(material), true); assert.equal(shareUniforms(material), false, 'a material is only wrapped once');
  shareUniforms(twin);
  assert.ok(material.version > version, 'the material recompiles with the new uniforms');
  const shader = { uniforms: {} };
  material.onBeforeCompile(shader, null);
  assert.deepEqual(calls, ['own']); assert.equal(shader.uniforms.mine.value, 1);
  for (const key of Object.keys(shared)) assert.equal(shader.uniforms[key], shared[key], `${key} is shared by identity`);
  assert.notEqual(material.customProgramCacheKey(), twin.customProgramCacheKey(), 'differently hooked materials never share a program');
  const custom = new THREE.ShaderMaterial();
  assert.equal(shareUniforms(custom), false); assert.equal(shareUniforms(null), false);
  const scene = new THREE.Scene(), late = new THREE.MeshLambertMaterial(), original = late.onBeforeCompile;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [late, material]));
  shareSceneUniforms(scene);
  assert.notEqual(late.onBeforeCompile, original, 'materials added later are picked up by the scene pass');
});

test('the shared noise tile is deterministic and usable as a texture', () => {
  const a = noisePixels(64), b = noisePixels(64);
  assert.equal(a.length, 64 * 64 * 4); assert.deepEqual(a, b);
  assert.notDeepEqual(noisePixels(64, 7), a);
  for (let channel = 0; channel < 3; channel++) {
    let low = 255, high = 0, sum = 0;
    for (let i = channel; i < a.length; i += 4) { low = Math.min(low, a[i]); high = Math.max(high, a[i]); sum += a[i]; }
    assert.ok(high - low > 90 && Math.abs(sum / (64 * 64) - 128) < 30, `channel ${channel} has contrast around mid-grey`);
  }
  // Tileable: the last column continues into the first as smoothly as any neighbours.
  let seam = 0, inner = 0;
  for (let y = 0; y < 64; y++) { seam += Math.abs(a[(y * 64 + 63) * 4] - a[(y * 64) * 4]); inner += Math.abs(a[(y * 64 + 31) * 4] - a[(y * 64 + 32) * 4]); }
  assert.ok(seam < inner * 3 + 64, `seam ${seam} against interior ${inner}`);
});

test('the graphics layer works without a GPU: it keeps time, lights the scene and draws', () => {
  const { scene, renderer, graphics } = setup({ hours: 13.5 });
  assert.equal(graphics.accelerated, false);
  const cascades = scene.children.filter(child => child.isDirectionalLight);
  assert.equal(cascades.length, CASCADES);
  assert.deepEqual(cascades.map(light => light.castShadow), [true, true, true]);
  assert.ok(cascades[0].intensity > 0 && cascades[1].intensity === 0 && cascades[2].intensity === 0, 'only the first cascade carries light');
  assert.ok(scene.fog?.isFogExp2 && scene.getObjectByName('Sky'));
  assert.equal(graphics.clock, '1:30 PM'); assert.equal(graphics.period.id, 'midday');
  assert.ok(shared.uNycSunDir.value.y > .9 && shared.uNycNight.value === 0 && shared.uNycLights.value === 0);
  graphics.update(1 / 60, { focus: { x: 10, y: 0, z: 20 } }); graphics.render();
  assert.equal(renderer.rendered, 1, 'without a GL context the frame is drawn directly');
  assert.equal(shared.uNycTime.value, 1 / 60);
  // Skipping ahead walks the named times of day and wraps.
  assert.deepEqual([1, 2, 3, 4].map(() => graphics.nextPreset().id), ['golden', 'dusk', 'night', 'morning']);
  graphics.setHours(23.25);
  assert.ok(shared.uNycNight.value === 1 && shared.uNycLights.value === 1 && shared.uNycSunDir.value.y > 0, 'at night the key light is the moon, above the horizon');
  assert.deepEqual(shared.uNycKeyColor.value.toArray().map(v => +v.toFixed(4)), skyState(23.25).keyColor.map(v => +v.toFixed(4)));
  assert.equal(shared.uNycFog.value.w, .15, 'the haze glow belongs to the sun');
  // The clock runs unless stopped or paused.
  const before = graphics.hours;
  graphics.update(10, { paused: true }); assert.equal(graphics.hours, before);
  graphics.update(10); assert.ok(graphics.hours > before);
  graphics.setClockRunning(false); const held = graphics.hours; graphics.update(10); assert.equal(graphics.hours, held);
  graphics.setHours(-1); assert.equal(graphics.hours, 23);
  graphics.dispose();
  assert.equal(scene.children.filter(child => child.isLight).length, 0); assert.equal(scene.fog, null);
});

test('shadows switch with the view and each cascade is snapped to its own texels', () => {
  const { scene, camera, renderer, graphics } = setup({ hours: 16 });
  const material = new THREE.MeshStandardMaterial(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); scene.add(mesh);
  const version = material.version;
  assert.equal(graphics.setShadows(true, true), true); assert.equal(renderer.shadowMap.enabled, true);
  assert.ok(material.version > version, 'materials pick up the shadow variant');
  assert.equal(graphics.setShadows(true, true), false, 'no change, no recompile');
  graphics.setShadows(false, true); assert.equal(graphics.shadowsActive, false);
  graphics.setShadows(true, false); assert.equal(graphics.shadowsActive, false, 'shadows need both the preference and a street-scale view');
  graphics.setShadows(true, true);
  graphics.setQuality('high');
  assert.deepEqual(scene.children.filter(child => child.isDirectionalLight).map(light => light.shadow.mapSize.x), QUALITY.high.shadowSizes);
  graphics.setQuality('nonsense'); assert.equal(graphics.quality, 'high');
  const lights = scene.children.filter(child => child.isDirectionalLight), sun = new THREE.Vector3().fromArray(skyState(16).keyDirection);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sun).normalize(), up = new THREE.Vector3().crossVectors(sun, right).normalize();
  for (const focus of [{ x: 0, y: 0, z: 0 }, { x: 3.37, y: 0, z: -1.91 }, { x: 812.4, y: 12, z: 455.2 }]) {
    graphics.update(1 / 60, { focus });
    lights.forEach((light, i) => {
      const extent = CASCADE_EXTENTS[i], texel = extent * 2 / QUALITY.high.shadowSizes[i], center = light.target.position;
      for (const axis of [right, up]) { const steps = center.dot(axis) / texel; assert.ok(Math.abs(steps - Math.round(steps)) < 1e-3, `cascade ${i} sits on its texel grid`); }
      assert.ok(light.position.clone().sub(center).normalize().distanceTo(sun) < 1e-6, 'every cascade shares the sun\'s direction');
      assert.equal(light.shadow.camera.right, extent);
      assert.ok(center.distanceTo(new THREE.Vector3(focus.x, focus.y, focus.z)) < extent * 1.2, 'the cascade covers the action');
    });
  }
  assert.equal(lights[0].shadow.autoUpdate, true); assert.equal(lights[1].shadow.autoUpdate, false, 'outer cascades redraw on alternate frames');
  graphics.dispose();
});

test('the sky copies one lighting state into its dome and marks what must be redrawn', () => {
  const sky = new Sky(), day = skyState(13.5), night = skyState(23.25);
  sky.update(day);
  assert.equal(sky.panoramaDirty, true);
  assert.ok(sky.uniforms.uSunDisc.value.r > 10 && sky.uniforms.uMoonDisc.value.b === 0 && sky.uniforms.uStars.value === 0);
  assert.equal(sky.mesh.material.uniforms.uNycTime, shared.uNycTime, 'the dome reads the shared clock');
  assert.equal(sky.mesh.renderOrder, 1000, 'the dome is drawn after the city, where sky still shows');
  assert.notEqual(sky.mesh.material.uniforms.uReflection, sky.reflectionMesh.material.uniforms.uReflection);
  sky.panoramaDirty = false; sky.update(day);
  assert.equal(sky.panoramaDirty, false, 'an unmoved sun needs no new panorama');
  sky.update(night);
  assert.equal(sky.panoramaDirty, true);
  assert.ok(sky.uniforms.uSunDisc.value.r === 0 && sky.uniforms.uMoonDisc.value.b > .5 && sky.uniforms.uStars.value === 1);
  assert.ok(sky.uniforms.uCloudGlow.value.r > sky.uniforms.uCloudGlow.value.b, 'clouds over the city are lit orange from below');
  sky.dispose();
});

test('named times of day are ordered and the quality tiers are complete', () => {
  assert.ok(TIME_PRESETS.length >= 5);
  for (const tier of Object.values(QUALITY)) { assert.equal(tier.shadowSizes.length, CASCADES); assert.ok(tier.pixelRatio >= 1 && tier.samples >= 0 && tier.bloomLevels > 0); }
  assert.deepEqual([...CASCADE_EXTENTS].sort((a, b) => a - b), CASCADE_EXTENTS, 'cascades widen outward');
});

test('no shader calls smoothstep with its edges reversed, which GLSL leaves undefined', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const directory = new URL('../dist/', import.meta.url), offenders = [];
  for (const name of readdirSync(directory).filter(file => file.endsWith('.js'))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    // Only shader text: a GLSL call has a space or bracket style no JS helper here uses, and sits in a template.
    for (const match of source.matchAll(/smoothstep\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,([^;\n]*)/g)) {
      const line = source.slice(source.lastIndexOf('\n', match.index) + 1, source.indexOf('\n', match.index));
      const javascript = /=>|\bconst\b|\blet\b|MathUtils|state\./.test(line) && !/\b(float|vec[234])\b/.test(line);
      if (!javascript && Number(match[1]) >= Number(match[2])) offenders.push(`${name}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});
