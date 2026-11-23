import * as THREE from './vendor/three.module.min.js';

const R = 6371008.8;
const LOCAL_ZOOM = 19, LOCAL_RADIUS = 4, LOCAL_GRID = LOCAL_RADIUS * 2 + 1;
export const AERIAL_SERVICE = 'https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/NYC_Orthos_2024/MapServer';
export const NYC_BBOX = [-74.26, 40.49, -73.69, 40.92];
export const CITY_ORIGIN = { lat: 40.7235, lon: -74.0015 };

export function geographicToWorld(lon, lat, origin = CITY_ORIGIN) {
  return { x: R * (lon - origin.lon) * Math.PI / 180 * Math.cos(origin.lat * Math.PI / 180), z: -R * (lat - origin.lat) * Math.PI / 180 };
}
export function worldToGeographic(x, z, origin = CITY_ORIGIN) {
  return { lon: origin.lon + x / (R * Math.cos(origin.lat * Math.PI / 180)) * 180 / Math.PI, lat: origin.lat - z / R * 180 / Math.PI };
}
export function tileForPoint(lon, lat, zoom) {
  const n = 2 ** zoom;
  return { column: Math.floor((lon + 180) / 360 * n), row: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n), zoom };
}
export function tileBounds(column, row, zoom, origin = CITY_ORIGIN) {
  const corner = (x, y) => geographicToWorld(x / 2 ** zoom * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** zoom))) * 180 / Math.PI, origin);
  const nw = corner(column, row), se = corner(column + 1, row + 1);
  return { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z };
}
/**
 * Which zoom of the aerial survey the close atlas should be painted from for a camera `height` metres up:
 * the sharpest whose nine tiles across still cover what is on screen from there. On the street that is
 * the finest there is, six centimetres a pixel over a few blocks; from three kilometres, a borough's
 * width at a few metres a pixel.
 */
export function atlasZoomFor(height, origin = CITY_ORIGIN) {
  const across = 1.8 * Math.max(0, Number.isFinite(height) ? height : 0) + 120;
  const finest = 2 * Math.PI * R * Math.cos(origin.lat * Math.PI / 180) * LOCAL_GRID / across;
  return Math.min(LOCAL_ZOOM, Math.max(13, Math.floor(Math.log2(finest))));
}
export function overviewTiles(bbox = NYC_BBOX, zoom = 12) {
  const nw = tileForPoint(bbox[0], bbox[3], zoom), se = tileForPoint(bbox[2], bbox[1], zoom);
  const tiles = [];
  for (let row = nw.row; row <= se.row; row++) for (let column = nw.column; column <= se.column; column++) tiles.push({ column, row, zoom });
  return tiles;
}

function plane(bounds, y, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    bounds.minX, y, bounds.maxZ, bounds.maxX, y, bounds.maxZ,
    bounds.maxX, y, bounds.minZ, bounds.minX, y, bounds.minZ,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/**
 * Paints the close atlas on the GPU, one quad a tile, from each tile's own
 * texture. Sending the whole 2304-pixel canvas to the GPU again for every
 * tile that arrived cost a frame each time; a street's worth cost a second.
 */
function createAtlasPainter(renderer, grid) {
  const size = grid * 256;
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: 4 });
  target.texture.name = 'Close aerial imagery';
  // One unit a tile, north at the top, as the canvas atlas is laid out.
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, grid, grid, 0, -1, 1);
  const geometry = new THREE.PlaneGeometry(1, 1);geometry.translate(.5, .5, 0);
  const pool = [], clearColor = new THREE.Color();
  return {
    texture: target.texture,
    /** Draw `tiles` ({ x, y, map } in atlas cells from the north-west), after emptying the atlas if `clear`. */
    paint(tiles, clear) {
      while (pool.length < tiles.length) {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false, fog: false }));
        mesh.frustumCulled = false;scene.add(mesh);pool.push(mesh);
      }
      pool.forEach((mesh, i) => {
        const tile = tiles[i];mesh.visible = Boolean(tile);
        if (tile) { mesh.material.map = tile.map;mesh.position.set(tile.x, grid - 1 - tile.y, 0); }
      });
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      renderer.setRenderTarget(target);renderer.autoClear = false;
      // Transparency says "no imagery here"; it must never be a guessed colour.
      if (clear) { renderer.setClearColor(0x000000, 0);renderer.clear(true, false, false); }
      // Rendering, even nothing, is what refreshes the atlas's smaller copies.
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);renderer.setClearColor(clearColor, alpha);renderer.autoClear = autoClear;
    },
    dispose() { target.dispose();geometry.dispose();for (const mesh of pool) mesh.material.dispose(); },
  };
}
const canPaintOnGPU = renderer => Boolean(renderer?.capabilities?.isWebGL2 && typeof renderer.getContext === 'function' && typeof renderer.setRenderTarget === 'function');

export function createCityGround({ scene, renderer = null, origin = CITY_ORIGIN, stairOpenings = null, onStatus = () => {}, createImage = () => new Image(), now = () => performance.now() }) {
  const group = new THREE.Group();group.name = 'NYC 2024 aerial imagery';scene.add(group);
  const coarse = overviewTiles(), first = coarse[0], last = coarse.at(-1);
  const columns = last.column - first.column + 1, rows = last.row - first.row + 1;
  const nw = tileBounds(first.column, first.row, 12, origin), se = tileBounds(last.column, last.row, 12, origin);
  const bounds = { minX: nw.minX, maxX: se.maxX, minZ: nw.minZ, maxZ: se.maxZ };
  const canvas = document.createElement('canvas');canvas.width = columns * 256;canvas.height = rows * 256;
  const context = canvas.getContext('2d');context.fillStyle = '#536e7b';context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;
  // Mercator rows have different ground lengths. Give each source tile its own
  // exact geographic corners instead of stretching a single citywide rectangle.
  const positions = [], uvs = [], indices = [];
  for (const tile of coarse) {
    const b = tileBounds(tile.column, tile.row, 12, origin), i = positions.length / 3;
    const u = (tile.column-first.column)/columns, v = 1-(tile.row-first.row)/rows;
    positions.push(b.minX,-.06,b.maxZ,b.maxX,-.06,b.maxZ,b.maxX,-.06,b.minZ,b.minX,-.06,b.minZ);
    uvs.push(u,v-1/rows,u+1/columns,v-1/rows,u+1/columns,v,u,v);indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  const atlas = new THREE.BufferGeometry();atlas.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));atlas.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));atlas.setIndex(indices);
  // At aerial distances these nearly coplanar layers can occupy the same depth
  // value. Paint imagery in order without writing depth, before normal objects.
  const overviewMesh = new THREE.Mesh(atlas,new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, depthWrite: false }));
  stairOpenings?.clip(overviewMesh.material);
  overviewMesh.renderOrder = -20;group.add(overviewMesh);
  // With a GPU the close atlas is painted there; without one (tests, a
  // software renderer) it is a canvas sent whole whenever it changes.
  const painter = canPaintOnGPU(renderer) ? createAtlasPainter(renderer, LOCAL_GRID) : null;
  const localCanvas = painter ? null : document.createElement('canvas');
  if (localCanvas) localCanvas.width = localCanvas.height = LOCAL_GRID * 256;
  const localContext = localCanvas?.getContext('2d');
  const localTexture = painter ? painter.texture : new THREE.CanvasTexture(localCanvas);
  if (!painter) { localTexture.colorSpace = THREE.SRGBColorSpace;localTexture.anisotropy = 4; }
  const localOrthophoto = { texture: localTexture, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, mercator: {
    north: 0, south: 0, originLat: origin.lat*Math.PI/180, radius: R,
  } };
  let localColumn = 0, localRow = 0, localZoom = LOCAL_ZOOM;
  // `held` are tiles fetched ahead for a view that is on its way (prepare): kept whether or not they are on show.
  const cache = new Map(), queue = [], desired = new Set(), requests = new Set(), held = new Set(), waiters = new Set();
  const tileKey = (zoom, column, row) => `${zoom}/${column},${row}`;
  const keep = key => desired.has(key) || held.has(key);
  let disposed = false, generation = 0, coarseLoaded = 0, failures = 0, currentCell = '', overview = false;
  const status = () => ({ loading: requests.size + queue.length,
    loaded: coarseLoaded + [...cache.values()].filter(entry => entry.mesh).length,
    cached: cache.size, active: requests.size, failures });
  const report = () => {
    if (disposed) return;
    for (const waiter of [...waiters]) if (waiter.entries.every(entry => entry.mesh || entry.failed)) waiter.finish();
    onStatus(status());
  };
  const wanted = job => !job.key || (keep(job.key) && cache.get(job.key) === job.entry);
  function pump() {
    // Reorder only local slots. Coarse coverage keeps its existing queue order,
    // while both newly queued and retried detail requests follow today's focus.
    // (A tile of another zoom is measured in the atlas's own tiles.)
    const distance = job => { const scale = 2 ** (localZoom - job.zoom); return ((job.column + .5) * scale - localColumn - LOCAL_RADIUS - .5) ** 2 + ((job.row + .5) * scale - localRow - LOCAL_RADIUS - .5) ** 2; };
    const localJobs = queue.filter(job => job.key).sort((a, b) => distance(a) - distance(b));
    let localIndex = 0;
    for (let i = 0; i < queue.length; i++) if (queue[i].key) queue[i] = localJobs[localIndex++];
    while (!disposed && requests.size < 6 && queue.length) {
      const job = queue.shift();
      if (!wanted(job)) continue;
      const image = createImage();image.crossOrigin = 'anonymous';
      let finished = false;
      const request = { job, cancel: () => {
        if (finished) return;
        finished = true;clearTimeout(timer);requests.delete(request);
        image.onload = null;image.onerror = null;image.src = '';
      } };
      const timer = setTimeout(() => finish(false, true), 12000);
      requests.add(request);
      function finish(ok, timedOut = false) {
        if (finished) return;finished = true;clearTimeout(timer);requests.delete(request);
        image.onload = null;image.onerror = null;
        // A timed-out Image may still own a network connection. Abort it
        // before starting its replacement to preserve the concurrency limit.
        if (timedOut) image.src = '';
        if (!disposed) {
          if (wanted(job)) {
            if (ok) job.complete(job.source || image);
            else {
              failures++;
              // One immediate retry covers transient tile errors. Further
              // local retries wait for update(), so an outage cannot spin.
              job.attempt = (job.attempt || 0) + 1;
              if (job.attempt < 2) queue.push(job);
              else if (job.entry) { job.entry.failed = true;job.entry.retryAt = now() + 5000; }
            }
          }
          report();pump();
        }
      }
      // A close tile is unpacked off the page's own thread before it is handed over: left to the moment it is first
      // drawn, a street's worth of photographs cost the frames of a second or two.
      image.onload = () => {
        if (!job.key || typeof image.decode !== 'function' || typeof globalThis.createImageBitmap !== 'function') { finish(true);return; }
        image.decode().then(() => globalThis.createImageBitmap(image, { imageOrientation: 'flipY' })).then(bitmap => {
          if (finished) bitmap.close();else { job.source = bitmap;finish(true); }
        }, () => finish(true));
      };
      image.onerror = () => finish(false);
      image.src = `${AERIAL_SERVICE}/tile/${job.zoom}/${job.row}/${job.column}`;
    }
    report();
  }
  for (const tile of coarse) queue.push({ ...tile, complete(image) {
    context.drawImage(image, (tile.column - first.column) * 256, (tile.row - first.row) * 256, 256, 256);
    texture.needsUpdate = true;coarseLoaded++;
  } });
  pump();
  function release(entry) {
    if (!entry.mesh) return;
    group.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh.material.map.image?.close?.();entry.mesh.material.map.dispose();entry.mesh.material.dispose();
  }
  function paintLocal(zoom, column, row, map) {
    // A surviving request can finish after the atlas moves by one tile. Its
    // source coordinates, not its old canvas offset, determine where it belongs.
    if (disposed || zoom !== localZoom || !desired.has(tileKey(zoom, column, row))) return;
    const x = column - localColumn, y = row - localRow;
    if (x < 0 || x >= LOCAL_GRID || y < 0 || y >= LOCAL_GRID) return;
    if (painter) painter.paint([{ x, y, map }], false);
    else { localContext.drawImage(map.image, x * 256, y * 256, 256, 256);localTexture.needsUpdate = true; }
  }
  function recenterLocal(tile) {
    localColumn = tile.column - LOCAL_RADIUS;localRow = tile.row - LOCAL_RADIUS;localZoom = tile.zoom;
    const nw = tileBounds(localColumn, localRow, localZoom, origin);
    const se = tileBounds(localColumn + LOCAL_GRID - 1, localRow + LOCAL_GRID - 1, localZoom, origin);
    Object.assign(localOrthophoto.bounds, { minX: nw.minX, maxX: se.maxX, minZ: nw.minZ, maxZ: se.maxZ });
    localOrthophoto.mercator.north = Math.PI * (1 - 2 * localRow / 2 ** localZoom);
    localOrthophoto.mercator.south = Math.PI * (1 - 2 * (localRow + LOCAL_GRID) / 2 ** localZoom);
    // Transparency is coverage metadata for roof/street sampling. Never fill
    // missing cells with a guessed color or imagery from the previous location.
    if (painter) {
      // Every resident tile, redrawn in its new cell in one pass.
      const tiles = [];
      for (const key of desired) {
        const entry = cache.get(key);
        if (!entry?.mesh) continue;
        tiles.push({ x: entry.column - localColumn, y: entry.row - localRow, map: entry.mesh.material.map });
      }
      painter.paint(tiles, true);
      return;
    }
    localContext.clearRect(0, 0, localCanvas.width, localCanvas.height);
    for (const key of desired) {
      const entry = cache.get(key);
      if (entry?.mesh) paintLocal(entry.zoom, entry.column, entry.row, entry.mesh.material.map);
    }
    localTexture.needsUpdate = true;
  }
  function enqueue(key, entry) {
    const { zoom, column, row } = entry;
    entry.failed = false;
    queue.push({ key, entry, column, row, zoom, complete(image) {
      // Ownership matters after a rapid departure and return to the same key:
      // an older request must not attach a mesh to its replacement cache entry.
      if (cache.get(key) !== entry) return;
      const map = new THREE.Texture(image);map.colorSpace = THREE.SRGBColorSpace;map.anisotropy = 4;map.needsUpdate = true;
      // An unpacked picture arrives already turned the way the graphics card wants it.
      if (typeof image.close === 'function') map.flipY = false;
      entry.mesh = plane(tileBounds(column, row, zoom, origin), -.035,
        new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
      stairOpenings?.clip(entry.mesh.material);
      entry.mesh.renderOrder = -10;entry.mesh.receiveShadow = true;
      entry.mesh.visible = desired.has(key);group.add(entry.mesh);
      paintLocal(zoom, column, row, map);
    } });
  }
  // The nine-by-nine block of tiles around a point at one zoom, each fetched if it is not already here.
  function block(point, zoom, each) {
    const geo = worldToGeographic(point.x, point.z, origin), tile = tileForPoint(geo.lon, geo.lat, zoom);
    for (let row = tile.row - LOCAL_RADIUS; row <= tile.row + LOCAL_RADIUS; row++) for (let column = tile.column - LOCAL_RADIUS; column <= tile.column + LOCAL_RADIUS; column++) {
      const key = tileKey(zoom, column, row);
      let entry = cache.get(key);
      if (!entry) { entry = { last: generation, mesh: null, zoom, column, row };cache.set(key, entry);enqueue(key, entry); }
      else if (entry.failed && entry.retryAt <= now()) enqueue(key, entry);
      each(key, entry);
    }
    return tile;
  }
  // Drop what nothing wants: pending work first, then the least recently shown imagery beyond what backtracking needs.
  function trim() {
    // Cancel obsolete pending work before trimming resident imagery. Pending
    // entries count toward the limit too, even if the network is stalled.
    for (const [key, entry] of cache) if (!keep(key) && !entry.mesh) cache.delete(key);
    for (let i = queue.length - 1; i >= 0; i--) if (!wanted(queue[i])) queue.splice(i, 1);
    for (const request of [...requests]) if (!wanted(request.job)) request.cancel();
    // Bound memory while preserving recently visited imagery for backtracking.
    for (const [key, entry] of cache) if (entry.mesh) entry.mesh.visible = desired.has(key);
    for (const [key, entry] of [...cache].sort((a, b) => a[1].last - b[1].last)) {
      if (cache.size <= 128 + held.size) break;
      if (keep(key)) continue;
      release(entry);cache.delete(key);
    }
  }
  return {
    get localOrthophoto() { return localOrthophoto; },
    group, orthophoto: { texture, bounds, mercator: {
      north: Math.PI*(1-2*first.row/4096), south: Math.PI*(1-2*(last.row+1)/4096),
      originLat: origin.lat*Math.PI/180, radius: R,
    } },
    /**
     * `zoom` is the survey zoom the close atlas is painted from: the finest on the street, coarser and wider
     * for a camera high above the place (atlasZoomFor).
     */
    update(focus, { overview: wide = false, zoom = LOCAL_ZOOM } = {}) {
      if (disposed) return;
      const geo = worldToGeographic(focus.x, focus.z, origin), tile = tileForPoint(geo.lon, geo.lat, zoom);
      const key = tileKey(zoom, tile.column, tile.row);
      const retryDue = [...desired].some(key => cache.get(key)?.failed && cache.get(key).retryAt <= now());
      if (key === currentCell && overview === wide && !retryDue) return;
      currentCell = key;overview = wide;generation++;desired.clear();
      if (!overview) block(focus, zoom, (key, entry) => { desired.add(key);entry.last = generation; });
      trim();
      recenterLocal(tile);
      pump();
    },
    /**
     * Fetch ahead of time the imagery around `point` at each of `zooms`, without showing it: what the atlas will
     * be painted from as a camera comes down on, or climbs away from, the place. Kept until release().
     * Resolves, with `ready` true if all of it is here, once every tile has arrived or failed, or after `timeout` ms.
     */
    prepare(point, zooms, timeout = 8000) {
      if (disposed) return Promise.resolve({ ready: false, tiles: 0, loaded: 0 });
      const entries = [];
      for (const zoom of zooms) block(point, zoom, (key, entry) => { held.add(key);entries.push(entry); });
      return new Promise(resolve => {
        const waiter = { entries, finish() {
          clearTimeout(timer);waiters.delete(waiter);
          const loaded = entries.filter(entry => entry.mesh).length;
          resolve({ ready: loaded === entries.length, tiles: entries.length, loaded });
        } };
        const timer = setTimeout(waiter.finish, timeout);
        waiters.add(waiter);pump();
      });
    },
    /** Whether the imagery around `point` at `zoom` is all here (or known to be unavailable): the atlas can change to it without a blank. */
    has(point, zoom) {
      const geo = worldToGeographic(point.x, point.z, origin), tile = tileForPoint(geo.lon, geo.lat, zoom);
      for (let row = tile.row - LOCAL_RADIUS; row <= tile.row + LOCAL_RADIUS; row++) for (let column = tile.column - LOCAL_RADIUS; column <= tile.column + LOCAL_RADIUS; column++) {
        const entry = cache.get(tileKey(zoom, column, row));
        if (!entry || !(entry.mesh || entry.failed)) return false;
      }
      return true;
    },
    /** Let go of what prepare() kept. */
    release() {
      if (disposed || !held.size) return;
      held.clear();trim();pump();
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;queue.length = 0;desired.clear();held.clear();
      for (const waiter of [...waiters]) waiter.finish();
      for (const request of [...requests]) request.cancel();
      for (const entry of cache.values()) release(entry);
      cache.clear();texture.dispose();
      if (painter) painter.dispose();else { localTexture.dispose();localCanvas.width = localCanvas.height = 0; }
      group.children[0].geometry.dispose();group.children[0].material.dispose();scene.remove(group);
    },
  };
}
