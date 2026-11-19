import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.min.js';
import { shared } from './gfx-common.js';

export const STATUE = {
  x: -3627.36, z: 3807.3,
  pedestal: { x: -3627.21, z: 3809.21, height: 43.218 },
  height: 46.657,
  facing: .576,
  arrival: { x: -3693.7, z: 3708.5, angle: .588 },
};

const loader = new GLTFLoader();
async function loadModel(detail) {
  const response = await fetch(`./liberty-island/statue-${detail}.glb`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
  const { scene } = await loader.parseAsync(await response.arrayBuffer(), '');
  return scene;
}

function disposeModel(model) {
  const materials = new Set(), textures = new Set();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    materials.add(mesh.material);
  });
  for (const material of materials) {
    for (const texture of [material.map, material.normalMap]) if (texture) textures.add(texture);
    material.dispose();
  }
  const images = new Set();
  for (const texture of textures) { images.add(texture.source.data); texture.dispose(); }
  for (const image of images) image?.close?.();
}

// Light the textured metal and masonry from below when the harbor lights come on.
function finish(mesh) {
  if (!mesh.isMesh) return;
  mesh.castShadow = mesh.receiveShadow = true;
  const material = mesh.material;
  if (material.map) material.map.anisotropy = 4;
  const flood = { Granite: .18, Copper: .38, Gold: 1.65 }[material.name];
  material.onBeforeCompile = shader => {
    shader.uniforms.uLibertyLights = shared.uNycLights;
    shader.fragmentShader = 'uniform float uLibertyLights;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, .95, .82) * ${flood} * uLibertyLights;`
    );
  };
  material.customProgramCacheKey = () => 'liberty-flood-' + material.name;
}

export function createStatueOfLiberty({ scene = null, heightAt = () => 0, load = loadModel } = {}) {
  const group = new THREE.Group();
  group.name = 'Statue of Liberty';
  group.rotation.y = STATUE.facing;
  const harbor = { name: 'harbor', retryAt: 0 }, island = { name: 'island', retryAt: 0 };
  let nearby = false, disposed = false;

  function seat() {
    const ground = heightAt(STATUE.pedestal.x, STATUE.pedestal.z);
    group.position.set(STATUE.x, Number.isFinite(ground) ? ground : 0, STATUE.z);
  }

  function select() {
    const visible = nearby ? island.model || harbor.model : harbor.model || island.model;
    for (const level of [harbor, island]) if (level.model) level.model.visible = level.model === visible;
  }

  function request(level) {
    if (level.model || level.pending || Date.now() < level.retryAt) return;
    level.pending = true;
    load(level.name).then(model => {
      if (disposed) { disposeModel(model); return; }
      model.name = `Statue of Liberty (${level.name})`;
      model.traverse(finish);
      level.model = model;
      group.add(model);
      select();
    }).catch(error => {
      if (disposed) return;
      console.warn(`Statue of Liberty ${level.name} model could not load`, error);
      level.retryAt = Date.now() + 30000;
    }).finally(() => { level.pending = false; });
  }

  seat();
  scene?.add(group);
  return {
    group,
    get base() { return group.position.y + STATUE.pedestal.height; },
    update(eye) {
      if (disposed) return;
      seat();
      if (eye) {
        const distance = Math.hypot(eye.x - STATUE.x, eye.y - group.position.y - STATUE.pedestal.height, eye.z - STATUE.z);
        nearby = distance < (nearby ? 750 : 650);
      }
      request(harbor);
      if (nearby) request(island);
      select();
    },
    setTerrainSampler(sampler) { heightAt = typeof sampler === 'function' ? sampler : () => 0; seat(); },
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const level of [harbor, island]) if (level.model) disposeModel(level.model);
      group.clear();
    },
  };
}
