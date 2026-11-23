import { bindParkGround, loadParkTextures, setParkTreeFade, createParkGroundMaterial } from './park-ground.js';
import { createParkTrees, TREE_RANGE } from './park-trees.js';

// Parks drawn from maps of what is in them, not from the aerial photograph:
// the ground as path, lawn, rock and wood, and a tree wherever the lidar
// found a crown. Each park's terrain and water come through the landscape
// like any other surveyed region; this module adds what only a mapped park
// has. `parks.json` lists them, and scripts/build-park.py builds each one.
//
// Detailed terrain uses each park’s own maps. The coarse citywide terrain
// uses the nearest park at street level and the largest park in the overview.

const distanceTo = (bounds, point) => Math.hypot(Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX), Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ));

/**
 * One park.
 * @param {object} options
 * @param {string} options.base the folder its files are in, with a trailing slash
 * @param {import('./landscape.js').Landscape} options.landscape draws the ground and says when the park's terrain is in place
 * @param {object} [options.physics] street objects: tree trunks near the player are given to it
 * @param {function} [options.streetDetail] returns what draws the bridge decks, once there is one: the park's bridges are handed to it
 * @param {boolean} [options.bind] give the terrain this park's ground as soon as it loads; false when something else decides which park has it
 */
export function createMappedPark({ scene = null, landscape, physics = null, streetDetail = () => null, fetcher = globalThis.fetch?.bind(globalThis),
  base = './central-park/', loadTextures = loadParkTextures, onStatus = () => {}, treeReach = 3200, bind = true } = {}) {
  let manifest = null, trees = null, treesLoading = null, textures = null, disposed = false, error = null, painted = null, bound = bind;
  let regionGround = null;
  let footing = null, retryFooting = 0;
  const materials = [null, 'hard', 'rock', 'dirt', 'grass', 'woodland'];
  async function loadFooting() {
    retryFooting = Infinity;
    try {
      const response = await fetcher(base + 'footing.bin');
      if (!response.ok) throw new Error('Park footing unavailable');
      const bytes = new DataView(await response.arrayBuffer());
      const width = bytes.getUint16(0, true), height = bytes.getUint16(2, true);
      if (!width || !height || width * height > 4000000) throw new Error('Invalid park footing dimensions');
      const cells = new Uint8Array(width * height);
      let offset = 0;
      for (let i = 4; i < bytes.byteLength; i += 3) {
        const material = bytes.getUint8(i), end = offset + bytes.getUint16(i + 1, true);
        if (material >= materials.length || end > cells.length) throw new Error('Invalid park footing run');
        cells.fill(material, offset, end);
        offset = end;
      }
      if (offset !== cells.length) throw new Error('Incomplete park footing');
      if (!disposed) footing = { width, height, cells };
    } catch { retryFooting = Date.now() + 30000; }
  }
  let structures = null, structuresLoading = null, decks = null, lidMaterial = null;
  const status = () => ({ id: manifest?.id || null, ready: Boolean(manifest), ground: Boolean(textures), trees: trees?.count || 0, treeCells: trees?.drawn || null, sourceTrees: manifest?.trees.count || 0, error });
  const report = () => { if (!disposed) onStatus(status()); };
  const ground = () => manifest && textures ? { frame: manifest.frame, size: manifest.size, surface: textures.surface, canopy: textures.canopy, reach: manifest.surface.reach } : null;
  const ready = (async () => {
    const response = await fetcher(base + 'park.json');
    if (!response.ok) throw new Error(`Park data unavailable (${response.status}): ${base}`);
    const data = await response.json();
    if (data?.version !== 1 || !data.frame || !data.size || !data.trees) throw new Error(`Invalid park data: ${base}`);
    if (disposed) return null;
    manifest = data; report();
    try {
      textures = await loadTextures(data, base);
      if (disposed) { textures.surface.dispose(); textures.canopy.dispose(); return null; }
      regionGround = landscape?.regionParkGround?.get(data.region || data.id);
      if (regionGround) bindParkGround(regionGround, ground());
      if (bind) landscape?.setParkGround(ground());
    } catch (failure) { error = failure.message; }
    report();
    return data;
  })().catch(failure => { error = failure.message; report(); return null; });

  async function loadTrees() {
    const response = await fetcher(base + manifest.trees.url.replace(/^\.\//, ''));
    if (!response.ok) throw new Error(`${manifest.name} trees unavailable (${response.status}).`);
    const records = new Uint16Array(await response.arrayBuffer());
    if (disposed) return;
    if (records.length !== manifest.trees.count * 6) throw new Error(`${manifest.name} tree records do not match their count.`);
    const built = await createParkTrees({ scene, records, scale: manifest.trees.scale, offset: manifest.trees.offset, frame: manifest.frame, physics,
      name: manifest.id === 'central-park' ? 'park-trees' : `park-trees:${manifest.id}`, pause: () => new Promise(resolve => setTimeout(resolve, 0)) });
    if (disposed) { built.dispose(); return; }
    built.group.visible = false;
    trees = built; report();
  }
  async function loadStructures() {
    const response = await fetcher(base + manifest.structures.url.replace(/^\.\//, ''));
    if (!response.ok) throw new Error(`${manifest.name} bridges unavailable (${response.status}).`);
    const data = await response.json();
    if (data?.version !== 1 || !Array.isArray(data.structures)) throw new Error(`Invalid ${manifest.name} bridges.`);
    if (!disposed) structures = data.structures;
  }

  return {
    ready,
    get manifest() { return manifest; },
    footingAt(point) {
      if (!manifest || distanceTo(manifest.bounds, point) > 0) return null;
      const { frame, size } = manifest, dx = point.x - frame.x, dz = point.z - frame.z;
      const u = (dx * frame.cos + dz * frame.sin) / size.width, v = (dz * frame.cos - dx * frame.sin) / size.depth;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
      if (!footing) {
        if (Date.now() >= retryFooting) loadFooting();
        return null;
      }
      return materials[footing.cells[Math.floor(v * footing.height) * footing.width + Math.floor(u * footing.width)]];
    },
    get trees() { return trees; },
    /** What the terrain needs to draw this park's ground, once its maps have loaded. */
    get ground() { return ground(); },
    /** How far a point is from the park, in metres; Infinity until the park is known. */
    distance(point) { return manifest ? distanceTo(manifest.bounds, point) : Infinity; },
    /**
     * @param {{x:number,z:number}} focus the player
     * @param {object} view overview: the city map is up; eye: where the camera is; bound: whether the terrain has this park's ground
     */
    update(focus, { overview = false, eye = null, bound: has = bind } = {}) {
      if (disposed || !manifest) return;
      if (has !== bound) { bound = has; painted = null; }
      if (!trees && !treesLoading && !overview && manifest.trees.count > 0 && distanceTo(manifest.bounds, focus) < treeReach) {
        treesLoading = loadTrees().catch(failure => { error = failure.message; report(); });
      }
      // The park's bridges, and the lids over its sunken roads, join the city's decks while the park is near.
      const near = distanceTo(manifest.bounds, focus) < 2200;
      if (near && manifest.structures && !structures && !structuresLoading) structuresLoading = loadStructures().catch(failure => { error = failure.message; report(); });
      const target = near && structures ? streetDetail() : null;
      if (target !== decks) {
        decks?.clearExtraStructures(structures);
        if (target) { lidMaterial ||= createParkGroundMaterial(regionGround || landscape.parkGround); target.setExtraStructures(structures, lidMaterial); }
        decks = target;
      }
      // Trees stand on the park's own terrain, so they wait for it.
      const standing = Boolean(trees) && !overview && Boolean(landscape?.getStatus().activeRegions.includes(manifest.region || manifest.id));
      trees?.update(eye || focus, focus, standing);
      if (painted !== standing && landscape) {
        painted = standing;
        // Where no tree is drawn, the crowns are painted on the ground instead.
        const near = standing ? TREE_RANGE.far - 350 : 0, far = standing ? TREE_RANGE.far : 1;
        if (regionGround) setParkTreeFade(regionGround, near, far);
        if (bound) setParkTreeFade(landscape.parkGround, near, far);
      }
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (regionGround) bindParkGround(regionGround, null);
      if (bind) landscape?.setParkGround(null);
      decks?.clearExtraStructures(structures); lidMaterial?.dispose();
      trees?.dispose(); textures?.surface.dispose(); textures?.canopy.dispose();
    },
  };
}

/**
 * Every park in `parks.json`. Takes the same options as one park, less `base`.
 * @param {object} options
 * @param {string} [options.list] where the list of parks is
 */
export function createMappedParks({ landscape, fetcher = globalThis.fetch?.bind(globalThis), list = './parks.json', onStatus = () => {}, ...options } = {}) {
  let parks = [], disposed = false, holder = null, held = null, error = null;
  const status = () => ({ parks: parks.map(park => park.getStatus()), ground: holder?.manifest?.id || null, error });
  const ready = (async () => {
    const response = await fetcher(list);
    if (!response.ok) throw new Error(`The list of mapped parks is unavailable (${response.status}).`);
    const data = await response.json();
    if (data?.version !== 1 || !Array.isArray(data.parks)) throw new Error('Invalid list of mapped parks.');
    if (disposed) return [];
    parks = data.parks.map(entry => createMappedPark({ ...options, landscape, fetcher, base: entry.base, bind: false, onStatus: () => onStatus(status()) }));
    return Promise.all(parks.map(park => park.ready));
  })().catch(failure => { error = failure.message; onStatus(status()); return []; });
  const area = park => { const b = park.manifest?.bounds; return b ? (b.maxX - b.minX) * (b.maxZ - b.minZ) : 0; };
  return {
    ready,
    get parks() { return parks; },
    /** The park of that name, once the list has loaded. */
    park(id) { return parks.find(park => park.manifest?.id === id) || null; },
    /** Central Park's trees, which is what there was before there were other parks. */
    get trees() { return this.park('central-park')?.trees || null; },
    update(focus, view = {}) {
      if (disposed) return;
      // Choose the fallback for the coarse city terrain.
      const drawn = parks.filter(park => park.ground);
      const next = drawn.sort((a, b) => view.overview ? area(b) - area(a) : a.distance(focus) - b.distance(focus))[0] || null;
      if (next !== holder || next?.ground?.surface !== held) { holder = next; held = next?.ground?.surface || null; landscape?.setParkGround(next?.ground || null); onStatus(status()); }
      for (const park of parks) park.update(focus, { ...view, bound: park === holder });
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const park of parks) park.dispose();
      landscape?.setParkGround(null);
    },
  };
}
