// Rotate an instanced prop around its base and retain its original street heading.
import * as THREE from './vendor/three.module.min.js';

const matrix = new THREE.Matrix4(), axis = new THREE.Vector3();

export function propInstance(mesh, slot, base, rest = null, lens = null) {
  const original = new THREE.Matrix4();
  if (rest) original.copy(rest);
  else mesh.getMatrixAt(slot, original);
  const e = original.elements;
  original.setPosition(e[12] - base.x, e[13] - base.y, e[14] - base.z);
  return pose => {
    matrix.makeRotationAxis(axis.set(pose.nz, 0, -pose.nx), pose.tilt);
    matrix.setPosition(base.x + pose.dx, base.y + pose.lift, base.z + pose.dz);
    matrix.multiply(original);
    mesh.setMatrixAt(slot, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    if (lens) {
      matrix.makeScale(0, 0, 0);
      lens.setMatrixAt(slot, matrix);
      lens.instanceMatrix.needsUpdate = true;
    }
  };
}
