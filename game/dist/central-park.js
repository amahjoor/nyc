import * as THREE from './vendor/three.module.min.js';
import { loadParkTextures, setParkTreeFade, createParkGroundMaterial } from './park-ground.js';
import { createParkTrees, TREE_RANGE } from './park-trees.js';

// Central Park as a place of its own: its ground drawn from maps of what is
// there, and a tree wherever the lidar found a crown. The terrain and the
// lakes come through the landscape like any other surveyed region
// (`central-park` in landscape-index.json); this module adds what only this
// park has. Everything is built by scripts/build-central-park.py.

const REGION = 'central-park';

/**
 * @param {object} options
 * @param {import('./landscape.js').Landscape} options.landscape draws the ground and says when the park's terrain is in place
 * @param {object} [options.physics] street objects: tree trunks near the player are given to it
 * @param {function} [options.streetDetail] returns what draws the bridge decks, once there is one: the park's bridges are handed to it
 */
export function createCentralPark({ scene = null, landscape, physics = null, streetDetail = () => null, fetcher = globalThis.fetch?.bind(globalThis),
  base = './central-park/', loadTextures = loadParkTextures, onStatus = () => {}, treeReach = 3200 } = {}) {
  let manifest = null, trees = null, treesLoading = null, textures = null, disposed = false, error = null, painted = null;
  let structures = null, structuresLoading = null, decks = null, lidMaterial = null;
  const status = () => ({ ready: Boolean(manifest), ground: Boolean(textures), trees: trees?.count || 0, treeCells: trees?.drawn || null, sourceTrees: manifest?.trees.count || 0, error });
  const report = () => { if (!disposed) onStatus(status()); };
  const ready = (async () => {
    const response = await fetcher(base + 'park.json');
    if (!response.ok) throw new Error(`Central Park data unavailable (${response.status}).`);
    const data = await response.json();
    if (data?.version !== 1 || !data.frame || !data.size || !data.trees) throw new Error('Invalid Central Park data.');
    if (disposed) return null;
    manifest = data; report();
    try {
      textures = await loadTextures(data, base);
      if (disposed) { textures.surface.dispose(); textures.canopy.dispose(); return null; }
      landscape?.setParkGround({ frame: data.frame, size: data.size, surface: textures.surface, canopy: textures.canopy, reach: data.surface.reach });
    } catch (failure) { error = failure.message; }
    report();
    return data;
  })().catch(failure => { error = failure.message; report(); return null; });

  async function loadTrees() {
    const response = await fetcher(base + manifest.trees.url.replace(/^\.\//, ''));
    if (!response.ok) throw new Error(`Central Park trees unavailable (${response.status}).`);
    const records = new Uint16Array(await response.arrayBuffer());
    if (disposed) return;
    if (records.length !== manifest.trees.count * 6) throw new Error('Central Park tree records do not match their count.');
    const built = await createParkTrees({ scene, records, scale: manifest.trees.scale, offset: manifest.trees.offset, frame: manifest.frame, physics,
      pause: () => new Promise(resolve => setTimeout(resolve, 0)) });
    if (disposed) { built.dispose(); return; }
    built.group.visible = false;
    trees = built; report();
  }
  async function loadStructures() {
    const response = await fetcher(base + manifest.structures.url.replace(/^\.\//, ''));
    if (!response.ok) throw new Error(`Central Park bridges unavailable (${response.status}).`);
    const data = await response.json();
    if (data?.version !== 1 || !Array.isArray(data.structures)) throw new Error('Invalid Central Park bridges.');
    if (!disposed) structures = data.structures;
  }
  const distanceTo = (bounds, point) => Math.hypot(Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX), Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ));

  return {
    ready,
    get manifest() { return manifest; },
    get trees() { return trees; },
    /**
     * @param {{x:number,z:number}} focus the player
     * @param {object} view overview: the city map is up; eye: where the camera is
     */
    update(focus, { overview = false, eye = null } = {}) {
      if (disposed || !manifest) return;
      if (!trees && !treesLoading && !overview && distanceTo(manifest.bounds, focus) < treeReach) {
        treesLoading = loadTrees().catch(failure => { error = failure.message; report(); });
      }
      // The park's bridges, and the lids over its sunken roads, join the city's decks while the park is near.
      const near = distanceTo(manifest.bounds, focus) < 2200;
      if (near && manifest.structures && !structures && !structuresLoading) structuresLoading = loadStructures().catch(failure => { error = failure.message; report(); });
      const target = near && structures ? streetDetail() : null;
      if (target !== decks) {
        decks?.setExtraStructures([]);
        if (target) { lidMaterial ||= createParkGroundMaterial(landscape.parkGround); target.setExtraStructures(structures, lidMaterial); }
        decks = target;
      }
      // Trees stand on the park's own terrain, so they wait for it.
      const standing = Boolean(trees) && !overview && Boolean(landscape?.getStatus().activeRegions.includes(REGION));
      trees?.update(eye || focus, focus, standing);
      if (painted !== standing && landscape) {
        painted = standing;
        // Where no tree is drawn, the crowns are painted on the ground instead.
        setParkTreeFade(landscape.parkGround, standing ? TREE_RANGE.far - 350 : 0, standing ? TREE_RANGE.far : 1);
      }
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;
      landscape?.setParkGround(null);
      decks?.setExtraStructures([]); lidMaterial?.dispose();
      trees?.dispose(); textures?.surface.dispose(); textures?.canopy.dispose();
    },
  };
}
