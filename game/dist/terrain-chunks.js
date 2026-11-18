import * as THREE from './vendor/three.module.min.js';

// A large terrain grid cut into square pieces, each built twice: every node,
// and every fourth. One piece of half a million nodes is always drawn whole;
// cut up, what is behind the camera is skipped and what is far off is drawn
// with a sixteenth of the triangles. Each piece carries a skirt hanging from
// its rim, so no sky shows where a coarse piece meets a fine one.

const SKIRT = 2.5;

/**
 * @param {object} terrain from prepareTerrain: renderedHeights, width, height, dx, dz, bounds, optional frame
 * @returns {{ fine: THREE.BufferGeometry, coarse: THREE.BufferGeometry, x: number, z: number, radius: number }[]} pieces, with their centres in world metres
 */
export function buildTerrainChunks(terrain, { cells = 64, stride = 4 } = {}) {
  const { width, height, dx, dz, bounds, frame } = terrain, heights = terrain.renderedHeights;
  const cos = frame ? frame.cos : 1, sin = frame ? frame.sin : 0, ox = frame ? frame.x : 0, oz = frame ? frame.z : 0;
  const at = (column, row) => heights[Math.max(0, Math.min(height - 1, row)) * width + Math.max(0, Math.min(width - 1, column))];
  const build = (c0, r0, c1, r1, step) => {
    const columns = [], rows = [];
    for (let c = c0; c < c1; c += step) columns.push(c);
    columns.push(c1);
    for (let r = r0; r < r1; r += step) rows.push(r);
    rows.push(r1);
    const nx = columns.length, nz = rows.length, rim = 2 * (nx + nz), count = nx * nz + rim;
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), index = [];
    const put = (i, column, row, drop) => {
      const lx = bounds.minX + column * dx, lz = bounds.minZ + row * dz;
      position[i * 3] = ox + lx * cos - lz * sin; position[i * 3 + 1] = at(column, row) - drop; position[i * 3 + 2] = oz + lx * sin + lz * cos;
      // The slope from the neighbouring nodes, whichever piece they are in, so shading runs unbroken across pieces.
      const gx = (at(column + 1, row) - at(column - 1, row)) / (2 * dx), gz = (at(column, row + 1) - at(column, row - 1)) / (2 * dz), length = Math.hypot(gx, 1, gz);
      normal[i * 3] = (-gx * cos + gz * sin) / length; normal[i * 3 + 1] = 1 / length; normal[i * 3 + 2] = (-gx * sin - gz * cos) / length;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) put(j * nx + i, columns[i], rows[j], 0);
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    // The skirt: the rim again, lower, joined to it by a wall facing outward.
    let next = nx * nz;
    const wall = (points, outward) => {
      const first = next;
      for (const [column, row] of points) put(next++, column, row, SKIRT);
      for (let k = 0; k < points.length - 1; k++) {
        const top = points[k][2], along = points[k + 1][2], low = first + k;
        if (outward) index.push(top, low, along, along, low, low + 1);
        else index.push(top, along, low, along, low + 1, low);
      }
    };
    wall(columns.map((column, i) => [column, r0, i]), false);
    wall(columns.map((column, i) => [column, r1, (nz - 1) * nx + i]), true);
    wall(rows.map((row, j) => [c0, row, j * nx]), true);
    wall(rows.map((row, j) => [c1, row, j * nx + nx - 1]), false);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setIndex(count > 65535 ? new THREE.BufferAttribute(new Uint32Array(index), 1) : new THREE.BufferAttribute(new Uint16Array(index), 1));
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    geometry.userData.sourceId = terrain.sourceId;
    return geometry;
  };
  const chunks = [];
  for (let r0 = 0; r0 < height - 1; r0 += cells) for (let c0 = 0; c0 < width - 1; c0 += cells) {
    const c1 = Math.min(width - 1, c0 + cells), r1 = Math.min(height - 1, r0 + cells);
    const fine = build(c0, r0, c1, r1, 1), coarse = build(c0, r0, c1, r1, stride);
    const centre = fine.boundingSphere.center;
    chunks.push({ fine, coarse, x: centre.x, z: centre.z, radius: fine.boundingSphere.radius });
  }
  return chunks;
}
