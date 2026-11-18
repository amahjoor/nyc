// A grown body (body.js) as something three.js can draw and bend.
import * as THREE from './vendor/three.module.min.js';

/**
 * Returns { mesh, bones, rig, pose(local) }: a skinned mesh standing at the
 * origin facing +Z. `pose` takes what body-motion.js gives: each bone's turn
 * in its parent's space, and where the pelvis is.
 */
export function createBodyMesh(built, { material = null } = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(built.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(built.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(built.colour, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(built.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(built.skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(built.index, 1));
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const bones = built.rig.bones.map(bone => { const made = new THREE.Bone(); made.name = bone.name; made.position.fromArray(bone.t); made.quaternion.fromArray(bone.q); return made; });
  built.rig.bones.forEach((bone, i) => { if (bone.parent >= 0) bones[bone.parent].add(bones[i]); });
  const mesh = new THREE.SkinnedMesh(geometry, material || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0 }));
  mesh.name = 'Person'; mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // A body bends well outside the box it was modelled in.
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  const pelvis = built.rig.index.get('pelvis');
  return {
    mesh, bones, rig: built.rig,
    pose(local) {
      for (let i = 0; i < bones.length; i++) { const q = local.q[i]; bones[i].quaternion.set(q[0], q[1], q[2], q[3]); }
      if (local.pelvis) bones[pelvis].position.fromArray(local.pelvis);
    },
    dispose() { geometry.dispose(); mesh.skeleton.dispose(); if (!material) mesh.material.dispose(); },
  };
}
