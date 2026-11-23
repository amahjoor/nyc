import * as THREE from './vendor/three.module.min.js';

// R is diffuse luminance centred on 0.5, GB are the OpenGL tangent normal's
// X/Y components and A is roughness. Each surface needs one texture unit.
export const CITY_SURFACE_GLSL = `
uniform sampler2D uCitySurface;
uniform bool uCitySurfaceReady;
`;

const surfaces = new Map();

export function bindCitySurface(shader, renderer, name) {
  let uniforms = surfaces.get(name);
  if (!uniforms) {
    uniforms = {uCitySurface: {value: null}, uCitySurfaceReady: {value: false}};
    surfaces.set(name, uniforms);
  }
  Object.assign(shader.uniforms, uniforms);
  if (!renderer?.isWebGLRenderer || uniforms.uCitySurface.value) return;

  const url = new URL('./assets/materials/' + name + '.webp', import.meta.url);
  const texture = new THREE.TextureLoader().load(url.href, () => {
    uniforms.uCitySurfaceReady.value = true;
  }, undefined, () => {
    // The procedural material stays available if this optional image fails.
    uniforms.uCitySurface.value = null;
    texture.dispose();
  });
  texture.name = name + ' surface scan';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.colorSpace = THREE.NoColorSpace;
  uniforms.uCitySurface.value = texture;
}
