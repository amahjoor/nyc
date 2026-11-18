import * as THREE from './vendor/three.module.min.js';
import { CEILING } from './room.js';

// The surveyed shell can have a bottom face above the sidewalk on the low side
// of a building. Keep its geometry everywhere outside furnished room volumes.
export function createRoomCutaways() {
  const uniforms = {
    roomCutCount: { value: 0 }, roomCuts: { value: null },
    roomCutMin: { value: new THREE.Vector3() }, roomCutMax: { value: new THREE.Vector3() },
  };
  const previous = [];
  const bounds = new THREE.Box3(), corner = new THREE.Vector3();
  function update(views) {
    let count = 0, dirty = false;
    for (const { plan, floor } of views) {
      if (previous[count]?.plan !== plan || previous[count].floor !== floor) {
        previous[count] = { plan, floor };
        dirty = true;
      }
      count++;
    }
    if (!dirty && count === previous.length) return;
    previous.length = count;
    uniforms.roomCutCount.value = count;
    if (!count) return;
    let texture = uniforms.roomCuts.value;
    if (!texture || texture.image.height < count) {
      texture?.dispose();
      const capacity = THREE.MathUtils.ceilPowerOfTwo(count);
      texture = new THREE.DataTexture(new Float32Array(12 * capacity), 3, capacity, THREE.RGBAFormat, THREE.FloatType);
      texture.name = 'Furnished room cutaways';
      uniforms.roomCuts.value = texture;
    }
    bounds.makeEmpty();
    previous.forEach(({plan, floor}, i) => {
      texture.image.data.set([plan.x, plan.z, floor, floor + CEILING, plan.tx, plan.tz, plan.nx, plan.nz,
        plan.width / 2, plan.depth, plan.skew || 0, 0], 12 * i);
      for (const a of [-plan.width / 2, plan.width / 2]) for (const b of [0, plan.depth]) {
        const along = a + (plan.skew || 0) * b;
        const x = plan.x + plan.tx * along - plan.nx * b;
        const z = plan.z + plan.tz * along - plan.nz * b;
        bounds.expandByPoint(corner.set(x, floor, z));
        bounds.expandByPoint(corner.set(x, floor + CEILING, z));
      }
    });
    uniforms.roomCutMin.value.copy(bounds.min);
    uniforms.roomCutMax.value.copy(bounds.max);
    texture.needsUpdate = true;
  }
  function apply(shader) {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec4 vSurveyPoint;\n' + shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvSurveyPoint = vec4((modelMatrix * vec4(transformed, 1.0)).xyz, abs(normal.y));');
    shader.fragmentShader = `
      varying vec4 vSurveyPoint;
      uniform int roomCutCount;
      uniform highp sampler2D roomCuts;
      uniform vec3 roomCutMin, roomCutMax;
      bool insideFurnishedRoom(vec3 point) {
        if (roomCutCount == 0 || vSurveyPoint.w < 0.65 || any(lessThan(point, roomCutMin)) || any(greaterThan(point, roomCutMax))) return false;
        for (int i = 0; i < roomCutCount; ++i) {
          vec4 anchor = texelFetch(roomCuts, ivec2(0,i), 0);
          if (point.y < anchor.z || point.y > anchor.w) continue;
          vec4 axes = texelFetch(roomCuts, ivec2(1,i), 0);
          vec3 size = texelFetch(roomCuts, ivec2(2,i), 0).xyz;
          vec2 delta = point.xz - anchor.xy;
          float depth = -dot(delta, axes.zw);
          float across = dot(delta, axes.xy) - size.z * depth;
          if (depth >= 0.0 && depth <= size.y && abs(across) <= size.x) return true;
        }
        return false;
      }
    ` + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (insideFurnishedRoom(vSurveyPoint.xyz)) discard;');
  }
  return { update, apply, dispose() { uniforms.roomCuts.value?.dispose(); } };
}
