// Somebody made by human.js as something three.js can draw and bend: the
// body and everything worn over it, each a skinned mesh of its own with its
// own picture, all hung from one skeleton.
import * as THREE from './vendor/three.module.min.js';

const loader = new THREE.TextureLoader(), pictures = new Map();
/** A picture from dist/human/tex, loaded once however many people wear it. */
export function picture(name, { colour = true, base = './human/tex/' } = {}) {
  if (!name) return null;
  const key = base + name;
  if (!pictures.has(key)) {
    const texture = loader.load(key);
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace; texture.anisotropy = 8;
    pictures.set(key, texture);
  }
  return pictures.get(key);
}

// A picture's own colour set aside, and its light and shade kept: hair of any colour from one head of hair,
// a shirt of any colour from one shirt. `amount` is how much of the picture's own colour is given up.
function tinted(material, mean = .2, amount = 1) {
  material.userData.tint = { value: new THREE.Vector2(amount, 1 / Math.max(.02, mean)) };
  material.onBeforeCompile = shader => {
    shader.uniforms.tint = material.userData.tint;
    shader.fragmentShader = 'uniform vec2 tint;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        float shade = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * tint.y;
        // Where the picture is as light as it is on average, the colour asked for; lighter and darker about that.
        vec3 keyed = diffuse * min( pow( shade, 0.8 ), 2.6 );
        diffuseColor.rgb = mix( sampledDiffuseColor.rgb * diffuse, keyed, tint.x );
        diffuseColor.a *= sampledDiffuseColor.a;
      #endif`);
  };
  material.customProgramCacheKey = () => 'tinted';
  return material;
}

const hex = value => new THREE.Color(typeof value === 'number' ? value : value || '#ffffff');
/**
 * What each piece is made of. `look` carries the colours and pictures a design
 * chooses: { skin: picture name, tone: colour the skin is brought toward and how far,
 * hair, brows: colours, iris: picture name, colours: { 'kind/id': colour } }.
 */
export function materialFor(piece, look = {}) {
  const kind = piece.kind;
  if (kind === 'skin') {
    const material = new THREE.MeshStandardMaterial({ map: picture(look.skin), roughness: .52, metalness: 0 });
    // The picture is multiplied toward the tone asked for: [r, g, b] in linear light.
    if (look.tone) material.color.setRGB(look.tone[0], look.tone[1], look.tone[2]);
    return material;
  }
  if (kind === 'eyes') return new THREE.MeshStandardMaterial({ map: picture(look.iris || 'brown_eye.webp'), roughness: .12, metalness: 0, envMapIntensity: 1.4 });
  if (kind === 'teeth') return new THREE.MeshStandardMaterial({ map: picture(piece.map), roughness: .35 });
  if (kind === 'hair') return tinted(new THREE.MeshStandardMaterial({ map: picture(piece.map), color: hex(look.hair || '#2a211c'), roughness: .5, alphaTest: .32, side: THREE.DoubleSide, transparent: false }), piece.shade);
  if (kind === 'brows' || kind === 'lashes') {
    const material = tinted(new THREE.MeshStandardMaterial({ map: picture(piece.map), color: hex(kind === 'brows' ? look.brows || look.hair || '#2a211c' : '#120d0b'), roughness: .8, transparent: true, alphaTest: .04, depthWrite: false, side: THREE.DoubleSide }), piece.shade);
    material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2;
    return material;
  }
  // Cloth and leather.
  const colour = look.colours?.[kind + '/' + piece.id];
  const material = new THREE.MeshStandardMaterial({ map: picture(piece.map), normalMap: picture(piece.normalMap, { colour: false }), roughness: kind === 'shoes' ? .5 : .85, metalness: 0, side: piece.twoSided ? THREE.DoubleSide : THREE.FrontSide, alphaTest: piece.clear ? .5 : 0 });
  if (colour) { material.color.copy(hex(colour)); tinted(material, piece.shade); }
  return material;
}

/**
 * Returns { mesh, bones, rig, pose(local), dispose }: a group standing at the
 * origin facing +Z. `pose` takes what body-motion.js gives: each bone's turn
 * in its parent's space, and where the pelvis is.
 */
export function createHumanMesh(built, look = {}) {
  const rig = built.rig, group = new THREE.Group(); group.name = 'Person';
  const bones = rig.bones.map(bone => { const made = new THREE.Bone(); made.name = bone.name; made.position.fromArray(bone.t); made.quaternion.fromArray(bone.q); return made; });
  rig.bones.forEach((bone, i) => { if (bone.parent >= 0) bones[bone.parent].add(bones[i]); });
  group.add(bones[0]);
  // The skin hangs from the pose the body was modelled in, not from the skeleton's own rest.
  const one = new THREE.Vector3(1, 1, 1), inverses = rig.bind.map(bind => new THREE.Matrix4().compose(new THREE.Vector3(...bind.p), new THREE.Quaternion(...bind.q), one).invert());
  const skeleton = new THREE.Skeleton(bones, inverses), meshes = [];
  for (const piece of built.pieces) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(piece.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(piece.normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(piece.uv, 2));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(piece.skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(piece.skinWeight, 4));
    geometry.setIndex(new THREE.BufferAttribute(piece.index, 1));
    if (piece.normalMap) geometry.computeTangents?.();
    const mesh = new THREE.SkinnedMesh(geometry, materialFor(piece, look));
    mesh.name = piece.kind + '/' + piece.id; mesh.frustumCulled = false; const fine = piece.kind === 'lashes' || piece.kind === 'brows' || piece.kind === 'eyes' || piece.kind === 'teeth';
    // What sits in the face is too small for the shadow map: it would only be speckled by it.
    mesh.castShadow = !fine; mesh.receiveShadow = !fine;
    // Brows and lashes lie on the skin: they are drawn after it.
    mesh.renderOrder = piece.kind === 'brows' || piece.kind === 'lashes' ? 2 : piece.kind === 'hair' ? 1 : 0;
    group.add(mesh); mesh.bind(skeleton, new THREE.Matrix4()); meshes.push(mesh);
  }
  const pelvis = rig.index.get('pelvis');
  return {
    mesh: group, meshes, bones, rig,
    pose(local) {
      for (let i = 0; i < bones.length; i++) { const q = local.q[i]; bones[i].quaternion.set(q[0], q[1], q[2], q[3]); }
      if (local.pelvis) bones[pelvis].position.fromArray(local.pelvis);
    },
    /** Stand as modelled: every bone where the skin was hung from. */
    modelled() {
      const q = bind => new THREE.Quaternion(...bind.q), p = bind => new THREE.Vector3(...bind.p);
      rig.bind.forEach((bind, i) => {
        const parent = rig.bones[i].parent;
        if (parent < 0) { bones[i].quaternion.copy(q(bind)); bones[i].position.copy(p(bind)); return; }
        const inverse = q(rig.bind[parent]).invert();
        bones[i].quaternion.copy(inverse.clone().multiply(q(bind))); bones[i].position.copy(p(bind).sub(p(rig.bind[parent])).applyQuaternion(inverse));
      });
    },
    /** Stand as the movements' skeleton stands before anything moves it: arms straight out. */
    rest() { rig.bones.forEach((bone, i) => { bones[i].quaternion.fromArray(bone.q); bones[i].position.fromArray(bone.t); }); },
    dispose() { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } skeleton.dispose(); },
  };
}
