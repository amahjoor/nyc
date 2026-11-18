import * as THREE from './vendor/three.module.min.js';

export const HALF_WIDTH = .76, HALF_LENGTH = 2.15;
const CELL = 16;

// Ground layers stream independently. A small spatial index gives each ground
// fragment just the openings in its 16 m cell, including across tile borders.
// Its first rows hold (offset, count), followed by the oriented rectangles.
export function createStairwellOpenings(range, capacity) {
  const width = Math.ceil((range + HALF_LENGTH + HALF_WIDTH) * 2 / CELL) + 2;
  const cells = width * width;
  // A rotated stairwell is narrower than one cell on either axis, so it
  // touches at most four cells. Several wells can share the same cell.
  const height = width + Math.ceil(4 * capacity / width);
  const data = new Float32Array(width * height * 4);
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.name = 'Subway stair openings';
  texture.needsUpdate = true;
  const bounds = new THREE.Vector4();
  const enabled = { value: false };
  const uniforms = { stairGrid: { value: texture }, stairBounds: { value: bounds }, stairOpen: enabled };
  let count = 0;

  const fragment = /* glsl */`
    uniform sampler2D stairGrid;
    uniform vec4 stairBounds;
    uniform bool stairOpen;
    bool insideStairwell(vec3 world) {
      if (!stairOpen || any(lessThan(world.xz, stairBounds.xy)) || any(greaterThanEqual(world.xz, stairBounds.zw))) return false;
      ivec2 cell = ivec2(floor((world.xz - stairBounds.xy) / ${CELL}.0));
      vec2 bucket = texelFetch(stairGrid, cell, 0).rg;
      for (int i = 0; i < int(bucket.y); ++i) {
        int index = int(bucket.x) + i;
        vec4 well = texelFetch(stairGrid, ivec2(index % ${width}, index / ${width}), 0);
        // An elevated surface or another level beneath the station keeps its surface.
        if (world.y < well.z - 2.9 || world.y > well.z + 1.0) continue;
        vec2 d = world.xz - well.xy;
        vec2 along = vec2(sin(well.w), cos(well.w));
        if (abs(dot(d, vec2(along.y, -along.x))) < ${HALF_WIDTH} && abs(dot(d, along)) < ${HALF_LENGTH}) return true;
      }
      return false;
    }
  `;

  return {
    update(frames) {
      count = frames.length;
      enabled.value = count > 0;
      if (!count) return;
      const pad = Math.hypot(HALF_WIDTH, HALF_LENGTH);
      const startX = Math.floor((Math.min(...frames.map(f => f.x)) - pad) / CELL) * CELL;
      const startZ = Math.floor((Math.min(...frames.map(f => f.z)) - pad) / CELL) * CELL;
      const bins = new Map();
      let endX = 0, endZ = 0;
      for (const f of frames) {
        const left = Math.floor((f.x - pad - startX) / CELL), right = Math.floor((f.x + pad - startX) / CELL);
        const top = Math.floor((f.z - pad - startZ) / CELL), bottom = Math.floor((f.z + pad - startZ) / CELL);
        endX = Math.max(endX, right + 1); endZ = Math.max(endZ, bottom + 1);
        for (let z = top; z <= bottom; z++) for (let x = left; x <= right; x++) {
          const cell = z * width + x;
          if (!bins.has(cell)) bins.set(cell, []);
          bins.get(cell).push(f);
        }
      }
      bounds.set(startX, startZ, startX + endX * CELL, startZ + endZ * CELL);
      data.fill(0, 0, cells * 4);
      let index = cells;
      for (const [cell, entries] of bins) {
        data[cell * 4] = index; data[cell * 4 + 1] = entries.length;
        for (const f of entries) data.set([f.x, f.z, f.y, f.angle], index++ * 4);
      }
      texture.needsUpdate = true;
    },
    setVisible(visible) { enabled.value = visible && count > 0; },
    // Use world coordinates for both translated imagery tiles and city meshes.
    // The harbor shader already supplies its world-space position.
    clip(material, positionVarying = null) {
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        if (!positionVarying) {
          shader.vertexShader = 'varying vec3 vStairWorld;\n' + shader.vertexShader.replace('#include <project_vertex>',
            '#include <project_vertex>\nvStairWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          shader.fragmentShader = 'varying vec3 vStairWorld;\n' + shader.fragmentShader;
        }
        shader.fragmentShader = fragment + shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, match =>
          match + '\nif (insideStairwell(' + (positionVarying || 'vStairWorld') + ')) discard;');
      };
      material.customProgramCacheKey = () => key + '|stairwells:' + width + ':' + (positionVarying || 'world');
      material.needsUpdate = true;
    },
    dispose() { enabled.value = false; texture.dispose(); },
  };
}
