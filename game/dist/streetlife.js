import * as THREE from './vendor/three.module.min.js';
import { shared, supportsFloatTargets } from './gfx-common.js';
import { createLeafMaterial } from './foliage.js';
import { VehicleLights } from './vehicle-lights.js';

// Street furniture and the light it gives. Lamp posts stand where the
// streetscape places them along surveyed kerbs. After dark their pools of light
// share a top-down texture. Vehicle lights also use their road elevation.

export const LIGHT_MAP_SIZE = 512;
export const LIGHT_MAP_SPAN = 384;   // metres covered, centred on the action
const MAX_LAMPS = 2048, MAX_SPLATS = 1024, MAX_TREES = 1400;
/** Trees are drawn within this many metres of the action; the set is refreshed as it moves. */
export const TREE_RANGE = 300;

// The commonest New York street trees: [name fragment, leaf colour, crown width, crown height].
export const SPECIES = [
  ['planetree', [.27, .39, .15], 1.25, 1], ['honeylocust', [.37, .47, .18], 1.15, .8], ['pear', [.19, .32, .13], .8, 1.25],
  ['oak', [.2, .35, .12], 1.2, 1], ['ginkgo', [.34, .46, .16], .7, 1.3], ['maple', [.19, .33, .13], 1.05, 1],
  ['linden', [.23, .38, .14], .9, 1.15], ['zelkova', [.25, .4, .15], 1.1, 1.05], ['cherry', [.28, .35, .19], 1, .8],
  ['elm', [.22, .38, .14], 1.2, 1.1], ['', [.24, .38, .14], 1, 1],
];
/** Size and colour of a street tree from its species and trunk diameter. */
export function treeForm(tree) {
  const [, leaf, wide, tall] = SPECIES.find(([name]) => tree.species.includes(name));
  const girth = tree.girth, height = Math.max(4, Math.min(21, 3.6 + girth * 22));
  // A street tree's crown is usually deeper than it is wide, and starts above head height.
  const radius = Math.max(1.3, Math.min(6.5, 1.1 + girth * 6.5)) * wide, crown = Math.max(2.4, Math.min(height - 2.3, radius * 2 * tall));
  return { leaf, height, radius, crown, girth };
}

/** A lumpy sphere: one leafy mass of a tree's crown. */
function crownGeometry(detail, seed) {
  const geometry = new THREE.IcosahedronGeometry(1, detail), position = geometry.attributes.position, normal = geometry.attributes.normal;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Overlapping waves stand in for boughs; flatter underneath than on top.
    const lump = 1 + .2 * Math.sin(x * 5.1 + seed) * Math.sin(y * 4.3 + seed * 2) + .17 * Math.sin(z * 6.7 + seed * 3) * Math.cos(x * 3.9)
      + .1 * Math.sin((x + y + z) * 9 + seed) + .07 * Math.sin(x * 13 + seed * 5) * Math.sin(z * 11 + y * 7);
    const squash = y < 0 ? .86 : 1;
    position.setXYZ(i, x * lump, y * lump * squash, z * lump);
    normal.setXYZ(i, x, y, z);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Concatenate simple geometries, each already transformed into place. */
function merge(parts) {
  const position = [], normal = [];
  for (const part of parts) {
    const geometry = part.index ? part.toNonIndexed() : part;
    position.push(...geometry.attributes.position.array); normal.push(...geometry.attributes.normal.array);
    if (geometry !== part) geometry.dispose();
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** A New York cobra-head lamp: tapered pole, upswept arm reaching along +X. */
function lampGeometry() {
  const pole = new THREE.CylinderGeometry(.075, .13, 8.2, 8); pole.translate(0, 4.1, 0);
  const base = new THREE.CylinderGeometry(.15, .21, .85, 8); base.translate(0, .425, 0);
  const arm = [];
  // Three straight pieces approximate the arm's upward sweep.
  const points = [[0, 7.9], [.9, 8.45], [1.8, 8.72], [2.55, 8.8]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], length = Math.hypot(bx - ax, by - ay);
    const piece = new THREE.CylinderGeometry(.045, .05, length, 6);
    piece.rotateZ(-Math.atan2(bx - ax, by - ay)); piece.translate((ax + bx) / 2, (ay + by) / 2, 0);
    arm.push(piece);
  }
  const head = new THREE.BoxGeometry(.78, .13, .3); head.translate(2.75, 8.78, 0);
  return merge([pole, base, ...arm, head]);
}
function lensGeometry() {
  const lens = new THREE.BoxGeometry(.5, .05, .22); lens.translate(2.8, 8.69, 0);
  return lens;
}

const SPLAT_VERTEX = /* glsl */`
attribute vec4 aPlace;   // centre x, centre z, radius, ground height
attribute vec3 aGlow;
uniform vec4 uRect;      // min x, min z, 1 / span
varying vec2 vLocal;
varying vec3 vGlow;
varying float vHeight;
void main() {
	vLocal = position.xy;
	vGlow = aGlow;
	vHeight = ( aPlace.w + 16.0 ) / 256.0;
	vec2 world = aPlace.xy + position.xy * aPlace.z;
	gl_Position = vec4( ( world - uRect.xy ) * uRect.z * 2.0 - 1.0, 0.0, 1.0 );
}`;
const SPLAT_FRAGMENT = /* glsl */`
varying vec2 vLocal;
varying vec3 vGlow;
varying float vHeight;
void main() {
	float amount = pow( max( 1.0 - dot( vLocal, vLocal ), 0.0 ), 2.2 );
	if ( amount <= 0.0 ) discard;
	gl_FragColor = vec4( vGlow * amount, vHeight );
}`;

/**
 * @param {object} options scene to add furniture to; renderer for the light map; getLamps returns lamp records.
 */
export function createStreetLife({ scene, renderer = null, getLamps = () => [], getTrees = () => [] } = {}) {
  const accelerated = supportsFloatTargets(renderer);
  const group = new THREE.Group(); group.name = 'Street furniture'; scene?.add(group);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4d4b, roughness: .55, metalness: .7 }); poleMaterial.name = 'Lamp post';
  const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: true }); lensMaterial.name = 'Lamp lens';
  const posts = new THREE.InstancedMesh(lampGeometry(), poleMaterial, MAX_LAMPS);
  posts.name = 'Street lamps'; posts.castShadow = true; posts.receiveShadow = true; posts.count = 0; posts.frustumCulled = false;
  const lenses = new THREE.InstancedMesh(lensGeometry(), lensMaterial, MAX_LAMPS);
  lenses.name = 'Street lamp lenses'; lenses.count = 0; lenses.frustumCulled = false;
  group.add(posts, lenses);
  // Trees: a trunk and two leafy masses each.
  const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x3a312a, roughness: .95 }); barkMaterial.name = 'Tree bark';
  const leafMaterial = createLeafMaterial();
  const trunkGeometry = new THREE.CylinderGeometry(.36, .5, 1, 7); trunkGeometry.translate(0, .5, 0);
  const instanced = (geometry, material, name) => {
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_TREES);
    mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  const trunks = instanced(trunkGeometry, barkMaterial, 'Street tree trunks');
  const crowns = instanced(crownGeometry(2, 1.7), leafMaterial, 'Street tree crowns');
  // Two smaller masses to either side keep a crown from reading as one ball.
  const boughs = new THREE.InstancedMesh(crownGeometry(1, 4.1), leafMaterial, MAX_TREES * 2);
  boughs.name = 'Street tree boughs'; boughs.count = 0; boughs.frustumCulled = false; boughs.castShadow = true; boughs.receiveShadow = true; group.add(boughs);

  // --- Light map -----------------------------------------------------------------
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  const place = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS * 4), 4);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS * 3), 3);
  for (const attribute of [place, glow]) attribute.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('aPlace', place); quad.setAttribute('aGlow', glow); quad.instanceCount = 0;
  const rect = new THREE.Vector4();
  const splatMaterial = new THREE.ShaderMaterial({ vertexShader: SPLAT_VERTEX, fragmentShader: SPLAT_FRAGMENT, uniforms: { uRect: { value: rect } },
    depthTest: false, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide, transparent: true,
    // Light adds up; the stored ground height takes the highest splat.
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  const splats = new THREE.Mesh(quad, splatMaterial); splats.frustumCulled = false;
  const mapScene = new THREE.Scene(); mapScene.add(splats);
  const mapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const vehicleLights = accelerated ? new VehicleLights() : null;
  const target = accelerated ? new THREE.WebGLRenderTarget(LIGHT_MAP_SIZE, LIGHT_MAP_SIZE, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }) : null;
  if (target) { target.texture.name = 'City light map'; shared.uNycLightMap.value = target.texture; }

  const dummy = new THREE.Object3D(), clearColor = new THREE.Color(), tint = new THREE.Color();
  let lamps = [], lampSource = null, treeSource = null, treeCount = 0, treeFocus = null, disposed = false;
  function placeTrees(list, focus) {
    treeSource = list; treeFocus = { x: focus.x, z: focus.z };
    // Nearest first, so a crowded district thins from the edge and not at random.
    const near = [];
    for (const tree of list) { const distance = Math.hypot(tree.x - focus.x, tree.z - focus.z); if (distance < TREE_RANGE) near.push([distance, tree]); }
    if (near.length > MAX_TREES) near.sort((a, b) => a[0] - b[0]);
    treeCount = Math.min(near.length, MAX_TREES);
    for (let i = 0; i < treeCount; i++) {
      const tree = near[i][1], form = treeForm(tree);
      // A stable number per tree varies its lean, turn and shade of green.
      const r = ((tree.x * 12.9898 + tree.z * 78.233) % 1 + 1) % 1, r2 = (r * 57.31) % 1;
      const top = form.height - form.crown * .5, turn = r * Math.PI * 2;
      dummy.position.set(tree.x, tree.y, tree.z); dummy.rotation.set(0, turn, 0); dummy.scale.set(form.girth, top, form.girth); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(tree.x, tree.y + top, tree.z); dummy.scale.set(form.radius, form.crown * .6, form.radius * (.86 + .28 * r2)); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      tint.setRGB(form.leaf[0], form.leaf[1], form.leaf[2]).multiplyScalar(.8 + .45 * r2);
      crowns.setColorAt(i, tint); tint.multiplyScalar(.9);
      for (let k = 0; k < 2; k++) {
        const angle = turn + k * 2.4 + r2, reach = form.radius * (.42 + .12 * k), size = .72 - .14 * k;
        dummy.position.set(tree.x + Math.cos(angle) * reach, tree.y + top + form.crown * (k ? .2 : -.18), tree.z + Math.sin(angle) * reach);
        dummy.rotation.set(0, angle * 1.7, 0); dummy.scale.set(form.radius * size, form.crown * .56 * size, form.radius * size); dummy.updateMatrix();
        boughs.setMatrixAt(i * 2 + k, dummy.matrix); boughs.setColorAt(i * 2 + k, tint);
      }
    }
    for (const mesh of [trunks, crowns, boughs]) { mesh.count = mesh === boughs ? treeCount * 2 : treeCount; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  function placeLamps(list) {
    lamps = list.slice(0, MAX_LAMPS); lampSource = list;
    lamps.forEach((lamp, i) => {
      dummy.position.set(lamp.x, lamp.y, lamp.z);
      // The arm reaches along local +X, out over the carriageway.
      dummy.rotation.set(0, Math.atan2(-lamp.nz, lamp.nx), 0); dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix); lenses.setMatrixAt(i, dummy.matrix);
    });
    posts.count = lenses.count = lamps.length;
    posts.instanceMatrix.needsUpdate = lenses.instanceMatrix.needsUpdate = true;
  }
  return {
    group,
    get lampCount() { return lamps.length; },
    get treeCount() { return treeCount; },
    /**
     * @param {{x:number,z:number}} focus centre of the light map
     * @param {object} frame lights 0..1 (lamps on), cars with x, z, y, angle and parked, spots for any other light from above
     */
    update(focus, { lights = 0, cars = [], overview = false, spots = [] } = {}) {
      if (disposed) return;
      group.visible = !overview;
      const list = getLamps();
      if (list !== lampSource) placeLamps(list);
      const trees = getTrees();
      if (trees !== treeSource || !treeFocus || Math.hypot(focus.x - treeFocus.x, focus.z - treeFocus.z) > 45) placeTrees(trees, focus);
      // A lens is far brighter than the wall beside it; let it bloom.
      lensMaterial.color.setRGB(1, .86, .62).multiplyScalar(5.5 * lights);
      if (!target) return;
      if (overview || (lights < .01 && !spots.length)) { shared.uNycLightRect.value.w = 0; return; }
      const texel = LIGHT_MAP_SPAN / LIGHT_MAP_SIZE;
      // Snap to whole texels so pools of light do not crawl as the player moves.
      const minX = Math.round((focus.x - LIGHT_MAP_SPAN / 2) / texel) * texel, minZ = Math.round((focus.z - LIGHT_MAP_SPAN / 2) / texel) * texel;
      rect.set(minX, minZ, 1 / LIGHT_MAP_SPAN, 0);
      shared.uNycLightRect.value.set(minX, minZ, 1 / LIGHT_MAP_SPAN, 1);
      let count = 0;
      const add = (x, z, radius, height, r, g, b) => {
        if (count >= MAX_SPLATS) return;
        place.setXYZW(count, x, z, radius, height); glow.setXYZ(count, r, g, b); count++;
      };
      const reach = LIGHT_MAP_SPAN / 2 + 18;
      for (const lamp of lamps) {
        if (Math.abs(lamp.x - focus.x) > reach || Math.abs(lamp.z - focus.z) > reach) continue;
        // Most lamps are warm LED; a few old sodium heads remain.
        const sodium = ((lamp.x * 13.7 + lamp.z * 7.3) % 1 + 1) % 1 < .14, k = lights * (sodium ? 2.5 : 3.1);
        add(lamp.x + lamp.nx * 2.3, lamp.z + lamp.nz * 2.3, 21, lamp.y - .2, k, k * (sodium ? .6 : .82), k * (sodium ? .25 : .58));
      }
      shared.uNycCarLights.value = vehicleLights.update(cars, minX, minZ, LIGHT_MAP_SPAN);
      // Anything else that throws light on the ground from above: { x, z, y, radius, glow: [r, g, b] }.
      for (const spot of spots) add(spot.x, spot.z, spot.radius, spot.y, spot.glow[0], spot.glow[1], spot.glow[2]);
      quad.instanceCount = count;
      place.needsUpdate = glow.needsUpdate = true;
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
      renderer.render(mapScene, mapCamera);
      renderer.setRenderTarget(previous); renderer.setClearColor(clearColor, alpha); renderer.autoClear = autoClear;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      posts.geometry.dispose(); lenses.geometry.dispose(); poleMaterial.dispose(); lensMaterial.dispose(); quad.dispose(); splatMaterial.dispose(); target?.dispose();
      for (const mesh of [trunks, crowns, boughs]) mesh.geometry.dispose();
      barkMaterial.dispose(); leafMaterial.dispose();
      if (vehicleLights) {
        if (shared.uNycCarLights.value === vehicleLights.texture) shared.uNycCarLights.value = null;
        vehicleLights.dispose();
      }
      if (target && shared.uNycLightMap.value === target.texture) { shared.uNycLightMap.value = null; shared.uNycLightRect.value.w = 0; }
      scene?.remove(group);
    },
  };
}
