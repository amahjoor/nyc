import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.min.js';
import { KIND } from './places.js';
import { snapToKerb } from './street-props.js';

// Real things on the sidewalk.
//
// Most of what stands in this city is drawn from rules. These are not: each is a photographed object, measured and
// modelled by Poly Haven (polyhaven.com) and given away without conditions (CC0). A bag of rubbish at the kerb, a
// chalkboard outside a café, a planter by a shop door, crates stacked beside a grocer's, a plant in a pot. They are set
// out by the shop fronts near the player, the same things at the same doors every time.

const SCANS = ['trashbag', 'standing_chalkboard_01', 'planter_box_01', 'planter_box_02', 'planter_box_03', 'plastic_crate_02', 'wooden_crate_01', 'wooden_crate_02', 'cardboard_box_01',
  'potted_plant_04', 'metal_trash_can', 'painted_wooden_bench', 'outdoor_table_chair_set_01', 'hand_truck', 'street_rat'];
const EACH = 96, REACH = 95;
const roll = (id, k) => { let h = 2166136261 ^ k; for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

/**
 * @returns the set. `update(fronts, focus, kerbs, heightAt, shown)` sets the things out by `fronts` (places.js) within
 *   reach of `focus`; it does nothing until the models have arrived, and nothing again until the fronts or the place change.
 */
export function createStreetScans({ scene = null, base = new URL('./assets/scans/', import.meta.url).href } = {}) {
  const group = new THREE.Group(); group.name = 'Scanned street things'; scene?.add(group);
  const models = new Map();
  if (typeof document !== 'undefined') {
    const loader = new GLTFLoader();
    for (const name of SCANS) loader.load(`${base}${name}/${name}.gltf`, gltf => {
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(node => {
        if (!node.isMesh) return;
        // Each part keeps its own place in the object: its position is baked into its points.
        const geometry = node.geometry.clone(); geometry.applyMatrix4(node.matrixWorld);
        const mesh = new THREE.InstancedMesh(geometry, node.material, EACH);
        mesh.name = 'Scanned ' + name; mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        group.add(mesh); parts.push(mesh);
      });
      const box = new THREE.Box3().setFromObject(gltf.scene);
      models.set(name, { parts, floor: box.min.y, count: 0 });
      stale = true;
    }, undefined, () => { /* without it the door is as bare as it was */ });
  }
  let stale = true, laidFronts = null, laidAt = null;
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), scale = new THREE.Vector3();
  function put(name, x, y, z, turn, size = 1) {
    const model = models.get(name);
    if (!model || model.count >= EACH) return;
    quaternion.setFromAxisAngle(up, turn);
    matrix.compose(position.set(x, y - model.floor * size, z), quaternion, scale.setScalar(size));
    for (const part of model.parts) part.setMatrixAt(model.count, matrix);
    model.count++;
  }
  return {
    group,
    update(fronts, focus, kerbs, heightAt, shown = true) {
      group.visible = Boolean(shown);
      if (!shown || !models.size || !fronts?.length) return;
      if (!stale && laidFronts === fronts && laidAt && Math.hypot(focus.x - laidAt.x, focus.z - laidAt.z) < 25) return;
      stale = false; laidFronts = fronts; laidAt = { x: focus.x, z: focus.z };
      for (const model of models.values()) model.count = 0;
      for (const front of fronts) {
        if (Math.hypot(front.x - focus.x, front.z - focus.z) > REACH) continue;
        const { place, x, z, tx, tz, nx, nz } = front, id = place.id ?? place.name, kind = place.kind, set = KIND[kind]?.group;
        const face = Math.atan2(nx, nz), side = roll(id, 1) < .5 ? -1 : 1, aside = side * (1.1 + roll(id, 2) * .7);
        const at = (out, along) => [x + nx * out + tx * along, z + nz * out + tz * along];
        const ground = (px, pz) => heightAt(px, pz) || 0;
        // Somewhere that serves coffee or a drink puts a board out.
        if ((set === 'cafe' || set === 'bar' || set === 'food' || set === 'dining') && roll(id, 3) < .45) {
          const [px, pz] = at(1.15, aside); put('standing_chalkboard_01', px, ground(px, pz), pz, face + (roll(id, 4) - .5) * .5);
        }
        // A planter or a plant by the door of the places that mind how they look.
        if (['clothes', 'salon', 'hotel', 'cosmetics', 'jewelry', 'florist', 'books'].includes(kind) || set === 'dining' || set === 'cafe') {
          const pick = roll(id, 5);
          if (pick < .22) { const [px, pz] = at(.42, -aside); put(['planter_box_01', 'planter_box_02', 'planter_box_03'][Math.floor(roll(id, 16) * 3)], px, ground(px, pz), pz, face + Math.PI / 2); }
          else if (pick < .42) { const [px, pz] = at(.38, -aside); put('potted_plant_04', px, ground(px, pz), pz, roll(id, 6) * 6.28); }
        }
        // Crates outside a grocer's, stacked two or three high.
        const grocer = set === 'bodega' || set === 'market' || set === 'liquor' || set === 'stand';
        if (grocer && roll(id, 7) < .7) {
          const [px, pz] = at(.34, aside), high = 1 + Math.floor(roll(id, 8) * 3);
          for (let i = 0; i < high; i++) put('plastic_crate_02', px, ground(px, pz) + i * .285, pz, face + (roll(id, 9 + i) - .5) * .25);
          // A wooden crate beside them, and the truck they came in on.
          if (roll(id, 50) < .6) { const [qx, qz] = at(.4, aside + side * .75); put(roll(id, 51) < .5 ? 'wooden_crate_01' : 'wooden_crate_02', qx, ground(qx, qz), qz, face + roll(id, 52)); }
          if (roll(id, 53) < .3) { const [qx, qz] = at(.45, -aside); put('hand_truck', qx, ground(qx, qz), qz, face + Math.PI); }
        }
        // A delivery left at the door of any shop, now and then.
        if (set === 'shop' && roll(id, 54) < .09) { const [qx, qz] = at(.4, aside); put('cardboard_box_01', qx, ground(qx, qz), qz, face + roll(id, 55) * 1.5); }
        // A dustbin against the wall of one front in eight.
        if (roll(id, 56) < .12) { const [qx, qz] = at(.4, -aside - side * .9); put('metal_trash_can', qx, ground(qx, qz), qz, roll(id, 57) * 6.28); }
        // Somewhere to sit outside the places that sell something to eat on the way: a bench, or a table and chairs.
        if (set === 'cafe' || set === 'dining') {
          const pick = roll(id, 58);
          if (pick < .2) { const [qx, qz] = at(.5, -aside - side * 1.6); put('painted_wooden_bench', qx, ground(qx, qz), qz, face); }
          else if (pick < .42) { const [qx, qz] = at(1.0, -aside - side * 1.8); put('outdoor_table_chair_set_01', qx, ground(qx, qz), qz, face + (roll(id, 59) - .5) * .4); }
        }
        // Bags at the kerb, as there are outside one door in five on any evening.
        if (kerbs && roll(id, 12) < .2) {
          const edge = snapToKerb(kerbs, x + nx * 3, z + nz * 3, 7);
          if (edge) for (let i = 0, n = 2 + Math.floor(roll(id, 13) * 4); i < n; i++) {
            const px = edge.x - edge.nx * (.45 + roll(id, 20 + i) * .35) + edge.tx * (i * .52 - n * .26), pz = edge.z - edge.nz * (.45 + roll(id, 20 + i) * .35) + edge.tz * (i * .52 - n * .26);
            put('trashbag', px, ground(px, pz), pz, roll(id, 30 + i) * 6.28, .85 + roll(id, 40 + i) * .35);
            // And what the bags bring.
            if (i === 0 && roll(id, 60) < .3) put('street_rat', px + edge.tx * .5 - edge.nx * .3, ground(px, pz), pz + edge.tz * .5 - edge.nz * .3, roll(id, 61) * 6.28);
          }
        }
      }
      for (const model of models.values()) for (const part of model.parts) { part.count = model.count; part.instanceMatrix.needsUpdate = true; }
    },
    dispose() { scene?.remove(group); for (const model of models.values()) for (const part of model.parts) { part.geometry.dispose(); part.dispose(); } },
  };
}
