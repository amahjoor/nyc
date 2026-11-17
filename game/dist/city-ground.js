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

export function createCityGround({ scene, renderer = null, origin = CITY_ORIGIN, onStatus = () => {}, createImage = () => new Image(), now = () => performance.now() }) {
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
  let localColumn = 0, localRow = 0;
  const cache = new Map(), queue = [], desired = new Set(), requests = new Set();
  let disposed = false, generation = 0, coarseLoaded = 0, failures = 0, currentCell = '', overview = false;
  const status = () => ({ loading: requests.size + queue.length,
    loaded: coarseLoaded + [...cache.values()].filter(entry => entry.mesh).length,
    cached: cache.size, active: requests.size, failures });
  const report = () => { if (!disposed) onStatus(status()); };
  const wanted = job => !job.key || (desired.has(job.key) && cache.get(job.key) === job.entry);
  function pump() {
    // Reorder only local slots. Coarse coverage keeps its existing queue order,
    // while both newly queued and retried detail requests follow today's focus.
    const distance = job => (job.column - localColumn - LOCAL_RADIUS) ** 2 + (job.row - localRow - LOCAL_RADIUS) ** 2;
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
            if (ok) job.complete(image);
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
      image.onload = () => finish(true);image.onerror = () => finish(false);
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
    group.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh.material.map.dispose();entry.mesh.material.dispose();
  }
  function paintLocal(column, row, map) {
    // A surviving request can finish after the atlas moves by one tile. Its
    // source coordinates, not its old canvas offset, determine where it belongs.
    if (disposed || !desired.has(`${column},${row}`)) return;
    const x = column - localColumn, y = row - localRow;
    if (x < 0 || x >= LOCAL_GRID || y < 0 || y >= LOCAL_GRID) return;
    if (painter) painter.paint([{ x, y, map }], false);
    else { localContext.drawImage(map.image, x * 256, y * 256, 256, 256);localTexture.needsUpdate = true; }
  }
  function recenterLocal(tile) {
    localColumn = tile.column - LOCAL_RADIUS;localRow = tile.row - LOCAL_RADIUS;
    const nw = tileBounds(localColumn, localRow, LOCAL_ZOOM, origin);
    const se = tileBounds(localColumn + LOCAL_GRID - 1, localRow + LOCAL_GRID - 1, LOCAL_ZOOM, origin);
    Object.assign(localOrthophoto.bounds, { minX: nw.minX, maxX: se.maxX, minZ: nw.minZ, maxZ: se.maxZ });
    localOrthophoto.mercator.north = Math.PI * (1 - 2 * localRow / 2 ** LOCAL_ZOOM);
    localOrthophoto.mercator.south = Math.PI * (1 - 2 * (localRow + LOCAL_GRID) / 2 ** LOCAL_ZOOM);
    // Transparency is coverage metadata for roof/street sampling. Never fill
    // missing cells with a guessed color or imagery from the previous location.
    if (painter) {
      // Every resident tile, redrawn in its new cell in one pass.
      const tiles = [];
      for (const key of desired) {
        const entry = cache.get(key);
        if (!entry?.mesh) continue;
        const [column, row] = key.split(',').map(Number);
        tiles.push({ x: column - localColumn, y: row - localRow, map: entry.mesh.material.map });
      }
      painter.paint(tiles, true);
      return;
    }
    localContext.clearRect(0, 0, localCanvas.width, localCanvas.height);
    for (const key of desired) {
      const entry = cache.get(key);
      if (entry?.mesh) {
        const [column, row] = key.split(',').map(Number);
        paintLocal(column, row, entry.mesh.material.map);
      }
    }
    localTexture.needsUpdate = true;
  }
  function enqueue(column, row, tileKey, entry) {
    entry.failed = false;
    queue.push({ key: tileKey, entry, column, row, zoom: LOCAL_ZOOM, complete(image) {
      // Ownership matters after a rapid departure and return to the same key:
      // an older request must not attach a mesh to its replacement cache entry.
      if (cache.get(tileKey) !== entry) return;
      const map = new THREE.Texture(image);map.colorSpace = THREE.SRGBColorSpace;map.anisotropy = 4;map.needsUpdate = true;
      entry.mesh = plane(tileBounds(column, row, LOCAL_ZOOM, origin), -.035,
        new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
      entry.mesh.renderOrder = -10;entry.mesh.receiveShadow = true;
      entry.mesh.visible = desired.has(tileKey);group.add(entry.mesh);
      paintLocal(column, row, map);
    } });
  }
  return {
    get localOrthophoto() { return localOrthophoto; },
    group, orthophoto: { texture, bounds, mercator: {
      north: Math.PI*(1-2*first.row/4096), south: Math.PI*(1-2*(last.row+1)/4096),
      originLat: origin.lat*Math.PI/180, radius: R,
    } },
    update(focus, { overview: wide = false } = {}) {
      if (disposed) return;
      const geo = worldToGeographic(focus.x, focus.z, origin), tile = tileForPoint(geo.lon, geo.lat, LOCAL_ZOOM);
      const key = `${tile.column},${tile.row}`;
      const retryDue = [...desired].some(tileKey => cache.get(tileKey)?.failed && cache.get(tileKey).retryAt <= now());
      if (key === currentCell && overview === wide && !retryDue) return;
      currentCell = key;overview = wide;generation++;desired.clear();
      if (!overview) for (let row = tile.row - LOCAL_RADIUS; row <= tile.row + LOCAL_RADIUS; row++) for (let column = tile.column - LOCAL_RADIUS; column <= tile.column + LOCAL_RADIUS; column++) {
        const tileKey = `${column},${row}`;desired.add(tileKey);
        if (cache.has(tileKey)) {
          const entry = cache.get(tileKey);entry.last = generation;
          if (entry.failed && entry.retryAt <= now()) enqueue(column, row, tileKey, entry);
          continue;
        }
        const entry = { last: generation, mesh: null };cache.set(tileKey, entry);
        enqueue(column, row, tileKey, entry);
      }
      // Cancel obsolete pending work before trimming resident imagery. Pending
      // entries count toward the limit too, even if the network is stalled.
      for (const [tileKey, entry] of cache) if (!desired.has(tileKey) && !entry.mesh) cache.delete(tileKey);
      for (let i = queue.length - 1; i >= 0; i--) if (!wanted(queue[i])) queue.splice(i, 1);
      for (const request of [...requests]) if (!wanted(request.job)) request.cancel();
      // Bound memory while preserving recently visited imagery for backtracking.
      for (const [tileKey, entry] of cache) if (entry.mesh) entry.mesh.visible = desired.has(tileKey);
      for (const [tileKey, entry] of [...cache].sort((a, b) => a[1].last - b[1].last)) {
        if (cache.size <= 128) break;
        if (desired.has(tileKey)) continue;
        release(entry);cache.delete(tileKey);
      }
      recenterLocal(tile);
      pump();
    },
    getStatus: status,
    dispose() {
      if (disposed) return;
      disposed = true;queue.length = 0;desired.clear();
      for (const request of [...requests]) request.cancel();
      for (const entry of cache.values()) release(entry);
      cache.clear();texture.dispose();
      if (painter) painter.dispose();else { localTexture.dispose();localCanvas.width = localCanvas.height = 0; }
      group.children[0].geometry.dispose();group.children[0].material.dispose();scene.remove(group);
    },
  };
}
