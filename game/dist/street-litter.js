import * as THREE from './vendor/three.module.min.js';
import { snapToKerb } from './street-props.js';

// What collects in a gutter: scraps of paper, a flattened cup, a bag, leaves. A few to each stretch of kerb, lying
// against it on the road side, the same ones in the same places every time a street is walked. A car going by at any
// speed sends the ones beside it skittering along after it, and they settle again a little further on.

const PIECES = 260, CELL = 7, REACH = 70;
// [width, length, colour]: a sheet of newspaper, a receipt, a coffee cup lid, a carrier bag, a dry leaf, another.
const KINDS = [[.15, .21, 0xa9a69c], [.05, .13, 0xbdb9ae], [.08, .08, 0x8f8a80], [.19, .22, 0x767d80], [.06, .09, 0x6a4e26], [.05, .08, 0x7a5a1e], [.07, .11, 0x7d3028], [.06, .09, 0x5e4a2a]];
const hash = (x, z, k) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(k + 1, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * @returns the litter. `update(dt, focus, kerbs, heightAt, cars, shown)` lays it out round `focus` along `kerbs`
 *   (street-props.js's index) at `heightAt(x, z)`, and lets `cars` (`{x, z, angle, speed}`) blow it about.
 */
export function createStreetLitter({ scene = null } = {}) {
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, PIECES);
  mesh.name = 'Street litter'; mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  scene?.add(mesh);
  const pieces = [], matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(), position = new THREE.Vector3(), scale = new THREE.Vector3(), colour = new THREE.Color();
  let laidAt = null, laidWith = null;
  function lay(focus, kerbs, heightAt) {
    pieces.length = 0;
    const cx = Math.round(focus.x / CELL), cz = Math.round(focus.z / CELL), span = Math.ceil(REACH / CELL);
    for (let i = -span; i <= span && pieces.length < PIECES; i++) for (let j = -span; j <= span && pieces.length < PIECES; j++) {
      const gx = cx + i, gz = cz + j;
      // Most stretches of kerb are clean; a few have something lying at them.
      if (hash(gx, gz, 0) > .34) continue;
      const edge = snapToKerb(kerbs, (gx + hash(gx, gz, 1)) * CELL, (gz + hash(gx, gz, 2)) * CELL, 6);
      if (!edge) continue;
      const count = 1 + Math.floor(hash(gx, gz, 3) * 3);
      for (let k = 0; k < count && pieces.length < PIECES; k++) {
        const along = (hash(gx, gz, 10 + k) - .5) * 3, out = .02 + hash(gx, gz, 20 + k) * .16, kind = KINDS[Math.floor(hash(gx, gz, 30 + k) * KINDS.length)];
        const x = edge.x + edge.nx * out + edge.tx * along, z = edge.z + edge.nz * out + edge.tz * along;
        pieces.push({ x, z, y: (heightAt(x, z) || 0) + .012, turn: hash(gx, gz, 40 + k) * 6.283, kind, vx: 0, vz: 0, spin: 0, lift: 0, tx: edge.tx, tz: edge.tz });
      }
    }
    laidAt = { x: focus.x, z: focus.z }; laidWith = kerbs;
  }
  return {
    mesh,
    update(dt, focus, kerbs, heightAt, cars = [], shown = true) {
      mesh.visible = Boolean(shown && kerbs);
      if (!mesh.visible) return;
      if (!laidAt || laidWith !== kerbs || Math.hypot(focus.x - laidAt.x, focus.z - laidAt.z) > 22) lay(focus, kerbs, heightAt);
      for (const car of cars) {
        const speed = Math.abs(car.speed || 0);
        if (speed < 4 || Math.hypot(car.x - focus.x, car.z - focus.z) > REACH) continue;
        const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
        for (const piece of pieces) {
          const dx = piece.x - car.x, dz = piece.z - car.z, along = dx * sin + dz * cos, across = dx * cos - dz * sin;
          // Just behind and beside it, where the air it drags along is.
          if (along > 1 || along < -5 || Math.abs(across) > 2.4) continue;
          const pull = Math.min(1, speed / 14) * dt * 5;
          piece.vx += sin * speed * .25 * pull; piece.vz += cos * speed * .25 * pull; piece.spin += (across > 0 ? 1 : -1) * pull * 6; piece.lift = Math.min(.18, piece.lift + pull * .2);
        }
      }
      let at = 0;
      for (const piece of pieces) {
        if (piece.vx || piece.vz) {
          // It is carried along the gutter, not out across the road or up onto the sidewalk.
          const run = piece.vx * piece.tx + piece.vz * piece.tz;
          piece.x += piece.tx * run * dt; piece.z += piece.tz * run * dt; piece.turn += piece.spin * dt;
          const drag = Math.exp(-dt * 2.2); piece.vx *= drag; piece.vz *= drag; piece.spin *= drag; piece.lift *= Math.exp(-dt * 3);
          if (Math.abs(run) < .03) { piece.vx = piece.vz = piece.spin = piece.lift = 0; piece.y = (heightAt(piece.x, piece.z) || 0) + .012; }
        }
        const [wide, long, hex] = piece.kind;
        euler.set(piece.lift * 2.2, piece.turn, piece.lift * 1.4); quaternion.setFromEuler(euler);
        matrix.compose(position.set(piece.x, piece.y + piece.lift, piece.z), quaternion, scale.set(wide, 1, long));
        mesh.setMatrixAt(at, matrix); mesh.setColorAt(at++, colour.setHex(hex));
      }
      mesh.count = at; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    },
    dispose() { scene?.remove(mesh); geometry.dispose(); material.dispose(); mesh.dispose(); },
  };
}
