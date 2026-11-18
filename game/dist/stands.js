// Newsstands and fruit stands: the two kinds of place that stand on the
// sidewalk itself. Where each is licensed is in the city's business licences,
// already bundled with the other places. A stand is put at the kerb nearest
// its licensed address, its counter to the sidewalk. What a kiosk or a cart
// looks like is the common kind, not surveyed.
import * as THREE from './vendor/three.module.min.js';

/** The kinds drawn, and how far in from the kerb the middle of each stands. */
export const STANDS = { newsstand: { setback: 1.0, length: 3.0 }, fruitstand: { setback: .85, length: 2.4 } };

/**
 * Where the stands among `places` go: { kind, x, z, tx, tz, nx, nz, place },
 * at (x, z), running along the kerb (tx, tz), with (nx, nz) toward the
 * roadway. `kerb(x, z)` gives the nearest kerb as street-props' snapToKerb()
 * does, or null. Two stands are not put within four metres of each other.
 */
export function planStands(places, kerb) {
  const stands = [];
  for (const place of places) {
    const kind = STANDS[place.kind];
    if (!kind) continue;
    const edge = kerb(place.x, place.z);
    if (!edge) continue;
    const x = edge.x - edge.nx * kind.setback, z = edge.z - edge.nz * kind.setback;
    if (stands.some(other => Math.hypot(other.x - x, other.z - z) < 4)) continue;
    stands.push({ kind: place.kind, x, z, tx: edge.tx, tz: edge.tz, nx: edge.nx, nz: edge.nz, place });
  }
  return stands;
}

/** Where whoever minds a stand is, and the way they face: behind a fruit cart, inside a kiosk, looking at the sidewalk. */
export function vendorOf(stand) {
  const back = stand.kind === 'newsstand' ? .15 : .75;
  return { x: stand.x + stand.nx * back, z: stand.z + stand.nz * back, heading: Math.atan2(-stand.nx, -stand.nz) };
}

/** Draw the stands of planStands(): every part a box. */
export function createStandMesh({ scene = null, heightAt = () => 0, capacity = 1500 } = {}) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75, metalness: .1 }); material.name = 'Street stands';
  const mesh = new THREE.InstancedMesh(box, material, capacity); mesh.name = 'Street stands'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  scene?.add(mesh);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  const STEEL = 0x5d6468, GLASS = 0x26313a, PAPER = [0xe8e2d0, 0xc9402f, 0x2f6fb0, 0xe2b93a, 0x3f8f58, 0xd9d4c8], FRUIT = [0xd23a2a, 0xf0b428, 0x4f9a3a, 0xee7a22, 0xd9cf3a, 0x8a2f5a, 0xc6d24a, 0xb5281e];
  let drawn = 0;
  return {
    mesh,
    get parts() { return drawn; },
    /** Returns how many stands were drawn whole. */
    update(stands) {
      let n = 0, whole = 0;
      for (const stand of stands) {
        if (n + 40 > capacity) break;
        const angle = Math.atan2(stand.tx, stand.tz), ground = heightAt(stand.x, stand.z), seed = Math.abs(Math.round(stand.x * 5 + stand.z * 11));
        // (along the kerb, toward the roadway, up from the sidewalk): boxes are w toward the roadway, d along the kerb.
        const put = (along, out, y, w, h, d, hex) => {
          place.set(stand.x + stand.tx * along + stand.nx * out, ground + y, stand.z + stand.tz * along + stand.nz * out); turn.setFromAxisAngle(up, angle); size.set(w, h, d); matrix.compose(place, turn, size);
          mesh.setMatrixAt(n, matrix); mesh.setColorAt(n, colour.setHex(hex)); n++;
        };
        if (stand.kind === 'newsstand') {
          // A steel and glass kiosk: back and end walls, a roof that overhangs the counter, and the counter with its papers.
          put(0, .72, 1.25, .06, 2.5, 3.0, STEEL); put(-1.47, 0, 1.25, 1.5, 2.5, .06, GLASS); put(1.47, 0, 1.25, 1.5, 2.5, .06, GLASS);
          put(0, -.15, 2.56, 2.0, .12, 3.3, STEEL); put(0, -.6, .45, .3, .9, 2.9, STEEL); put(0, -.62, .92, .5, .05, 2.9, 0x2a2c30);
          for (let i = 0; i < 7; i++) put(-1.2 + i * .4, -.66, .97, .34, .05, .3, PAPER[(seed + i * 5) % PAPER.length]);
          // Snacks and drinks racked on the back wall.
          for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) put(-1.2 + i * .48, .62, 1.25 + row * .4, .1, .3, .4, PAPER[(seed + i + row * 2) % PAPER.length]);
          put(0, -.72, 2.3, .04, .32, 2.6, 0x1f5a3a);
        } else {
          // A cart: a table of crates under an umbrella.
          put(0, 0, .45, .95, .9, 2.4, 0x7a6a50);
          for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) put(-1 + i * .4, -.22 + j * .44, .96, .4, .14, .36, FRUIT[(seed + i * 3 + j * 5) % FRUIT.length]);
          put(0, .3, 1.2, .05, 2.4, .05, STEEL);
          // The umbrella, in two colours.
          for (let i = 0; i < 4; i++) put(-.9 + i * .6, .1, 2.42, 2.2, .06, .6, i % 2 ? 0xf2efe6 : [0xc9402f, 0x2f6fb0, 0x3f8f58, 0xe2b93a][seed % 4]);
        }
        whole++;
      }
      drawn = mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return whole;
    },
    dispose() { box.dispose(); material.dispose(); mesh.dispose(); mesh.removeFromParent(); },
  };
}
