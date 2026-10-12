import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { AERIAL_SERVICE, CITY_ORIGIN, NYC_BBOX, geographicToWorld, worldToGeographic, tileForPoint, tileBounds, overviewTiles, createCityGround } from '../dist/city-ground.js';

const boroughs = [
  ['Manhattan', -74.0015, 40.7235], ['Brooklyn', -73.9779, 40.6842],
  ['Queens', -73.7949, 40.7282], ['Bronx', -73.8648, 40.8448],
  ['Staten Island', -74.154, 40.5795],
];
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);

function fixture(t) {
  const previousDocument = globalThis.document, images = [], draws = [], reports = [], contexts = [];
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    const context = { cells: new Map(), fills: [], clears: [], draws: [],
      fillRect(...args) { this.fills.push(args); },
      clearRect(...args) { this.clears.push(args);this.cells.clear(); },
      drawImage(...args) {
        draws.push(args);this.draws.push(args);
        this.cells.set(`${args[1] / 256},${args[2] / 256}`, args[0].src);
      },
    };
    contexts.push(context);
    return { width: 0, height: 0, getContext: () => context };
  } };
  let milliseconds = 0, maxActive = 0;
  const pending = () => images.filter(image => !image.finished && !image.cancelled);
  const createImage = () => {
    const image = {
      finished: false, cancelled: false,
      set src(url) {
        this.url = url;
        if (!url) this.cancelled = true;
        else {
          assert.equal(this.crossOrigin, 'anonymous', 'CORS must be set before starting the tile request');
          maxActive = Math.max(maxActive, pending().length);
        }
      },
      get src() { return this.url; },
      succeed() { this.finished = true;this.onload?.(); },
      fail() { this.finished = true;this.onerror?.(); },
    };
    images.push(image);return image;
  };
  const scene = new THREE.Scene();
  const ground = createCityGround({ scene, createImage, now: () => milliseconds, onStatus: value => reports.push(value) });
  t.after(() => { ground.dispose();globalThis.document = previousDocument; });
  return { ground, scene, images, draws, reports, contexts, pending, get maxActive() { return maxActive; },
    advance(ms) { milliseconds += ms; },
    drain(outcome = image => image.succeed()) {
      let guard = 0;
      while (pending().length) {
        assert.ok(guard++ < 2000, 'the request queue must eventually drain');
        outcome(pending()[0]);
      }
    },
  };
}

test('all five boroughs round-trip geographic coordinates and share adjacent aerial tile corners', () => {
  for (const [name, lon, lat] of boroughs) {
    const point = geographicToWorld(lon, lat), inverse = worldToGeographic(point.x, point.z);
    close(inverse.lon, lon);close(inverse.lat, lat);
    for (const zoom of [12, 19]) {
      const tile = tileForPoint(lon, lat, zoom), b = tileBounds(tile.column, tile.row, zoom);
      assert.ok(point.x >= b.minX && point.x <= b.maxX && point.z >= b.minZ && point.z <= b.maxZ, name);
      close(b.maxX, tileBounds(tile.column + 1, tile.row, zoom).minX);
      close(b.maxZ, tileBounds(tile.column, tile.row + 1, zoom).minZ);
      const center = worldToGeographic((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
      assert.deepEqual(tileForPoint(center.lon, center.lat, zoom), tile);
    }
  }
  const alternateOrigin = { lon: -73.95, lat: 40.78 };
  const point = geographicToWorld(-74.12, 40.6, alternateOrigin);
  const inverse = worldToGeographic(point.x, point.z, alternateOrigin);
  close(inverse.lon, -74.12);close(inverse.lat, 40.6);
});

test('coarse atlas covers full NYC north-up and exports exact Mercator coordinates for roofs', t => {
  const f = fixture(t), tiles = overviewTiles();f.drain();
  assert.equal(f.draws.length, tiles.length);
  const { bounds, mercator, texture } = f.ground.orthophoto;
  for (const lon of [NYC_BBOX[0], NYC_BBOX[2]]) for (const lat of [NYC_BBOX[1], NYC_BBOX[3]]) {
    const point = geographicToWorld(lon, lat);
    assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ);
  }
  const first = tiles[0], last = tiles.at(-1), columns = last.column - first.column + 1, rows = last.row - first.row + 1;
  const geometry = f.ground.group.children[0].geometry, positions = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index], b = tileBounds(tile.column, tile.row, tile.zoom);
    const draw = f.draws.find(([image]) => image.src.endsWith(`/12/${tile.row}/${tile.column}`));
    assert.ok(draw);assert.deepEqual(draw.slice(1), [(tile.column - first.column) * 256, (tile.row - first.row) * 256, 256, 256]);
    close(positions.getZ(index * 4), b.maxZ, 0.005);
    close(positions.getZ(index * 4 + 2), b.minZ, 0.005);
    assert.ok(uv.getY(index * 4 + 2) > uv.getY(index * 4), 'north vertices sample the top of their image');
    for (const [z, expected] of [[b.minZ, 1 - (tile.row - first.row) / rows], [b.maxZ, 1 - (tile.row - first.row + 1) / rows]]) {
      const latitude = mercator.originLat - z / mercator.radius;
      const v = (Math.asinh(Math.tan(latitude)) - mercator.south) / (mercator.north - mercator.south);
      close(v, expected);
    }
    // Each ground quad approximates Mercator only within its own tile. At
    // zoom 12 that approximation stays below one metre across this NYC atlas.
    const middleLatitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.row + 0.5) / 2 ** tile.zoom))) * 180 / Math.PI;
    assert.ok(Math.abs(geographicToWorld(CITY_ORIGIN.lon, middleLatitude).z - (b.minZ + b.maxZ) / 2) < 1);
  }
  assert.equal(texture.image.width, columns * 256);assert.equal(texture.image.height, rows * 256);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(mercator.originLat, CITY_ORIGIN.lat * Math.PI / 180);
});

test('local imagery has exactly 81 visible tiles and bounded LRU resources across borough visits', t => {
  const f = fixture(t), coarseCount = overviewTiles().length;
  for (const [, lon, lat] of boroughs) {
    f.ground.update(geographicToWorld(lon, lat));f.drain();
    assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 81);
    assert.ok(f.ground.getStatus().cached <= 128);
    assert.ok(f.ground.group.children.length <= 129);
    assert.equal(f.ground.getStatus().loaded, coarseCount + f.ground.group.children.length - 1);
    for (const mesh of f.ground.group.children.slice(1)) {
      assert.equal(mesh.material.map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(mesh.material.map.image.crossOrigin, 'anonymous');
      assert.ok(mesh.material.map.image.src.startsWith(`${AERIAL_SERVICE}/tile/19/`));
      assert.equal(mesh.material.map.anisotropy, 4);
    }
  }
  assert.ok(f.maxActive <= 6, `observed ${f.maxActive} concurrent requests`);
  f.ground.update({ x: 0, z: 0 }, { overview: true });
  assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 0);
  assert.equal(f.ground.group.children[0].visible, true, 'coarse city coverage remains visible');
});

test('imagery layers paint before ordinary geometry without competing for depth', t => {
  const f = fixture(t);f.ground.update({ x: 0, z: 0 });f.drain();
  const coarse = f.ground.group.children[0], detail = f.ground.group.children.slice(1);
  const building = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 10), new THREE.MeshStandardMaterial());
  t.after(() => { building.geometry.dispose();building.material.dispose(); });
  assert.ok(detail.length > 0, 'exercise loaded sharp imagery as well as the coarse atlas');
  for (const mesh of [coarse, ...detail]) {
    assert.equal(mesh.material.transparent, false, 'imagery stays in the opaque render queue');
    assert.equal(mesh.material.depthWrite, false, 'nearly coplanar imagery cannot hide the other layer through depth rounding');
    assert.equal(mesh.material.depthTest, true, 'existing foreground depth remains respected');
    assert.ok(mesh.renderOrder < building.renderOrder, 'ordinary building meshes render after all imagery');
  }
  for (const mesh of detail) assert.ok(coarse.renderOrder < mesh.renderOrder, 'sharp tiles always paint over coarse coverage');
  assert.equal(coarse.material.isMeshBasicMaterial, true, 'full-city coverage remains unlit');
  for (const mesh of detail) {
    assert.equal(mesh.material.isMeshStandardMaterial, true);
    assert.equal(mesh.material.roughness, 1);
    assert.equal(mesh.material.color.getHex(), 0xffffff);
    assert.equal(mesh.receiveShadow, true, 'existing sunlight can ground the nearby surveyed geometry');
  }
  assert.equal(building.material.depthWrite, true, 'ordinary scene geometry still writes its own occlusion depth');
});

test('rapid travel bounds queued entries even before any network response completes', t => {
  const f = fixture(t), coarseCount = overviewTiles().length;
  for (let visit = 0; visit < 30; visit++) {
    f.ground.update({ x: -18000 + visit * 1500, z: -12000 + visit * 1200 });
    assert.ok(f.ground.getStatus().cached <= 128);
    assert.ok(f.ground.getStatus().loading <= coarseCount + 81);
    assert.ok(f.pending().length <= 6);
  }
  f.drain();
  assert.equal(f.ground.group.children.length, 82, 'obsolete pending visits never attach meshes');
  assert.equal(f.ground.getStatus().cached, 81);
  assert.equal(f.ground.getStatus().loading, 0);
});

test('local requests start at the player while queued overview jobs retain their source order', t => {
  const f = fixture(t), coarse = overviewTiles();
  f.ground.update({ x: 0, z: 0 });f.drain();
  assert.deepEqual(f.images.slice(0, coarse.length).map(image => image.src),
    coarse.map(tile => `${AERIAL_SERVICE}/tile/${tile.zoom}/${tile.row}/${tile.column}`));
  const tile = tileForPoint(CITY_ORIGIN.lon, CITY_ORIGIN.lat, 19);
  assert.equal(f.images[coarse.length].src, `${AERIAL_SERVICE}/tile/19/${tile.row}/${tile.column}`,
    'the tile underneath the player is requested before outer-ring imagery');
  const local = f.images.slice(coarse.length).map(image => {
    const [, row, column] = image.src.match(/\/19\/(\d+)\/(\d+)$/);
    return (Number(column) - tile.column) ** 2 + (Number(row) - tile.row) ** 2;
  });
  assert.deepEqual(local, [...local].sort((a, b) => a - b), 'remaining local requests expand outward from the player');
  assert.ok(f.maxActive <= 6);
});

test('moving focus reprioritizes already queued imagery without restarting useful in-flight tiles', t => {
  const f = fixture(t);f.drain();f.ground.update({ x: 0, z: 0 });
  const tile = tileForPoint(CITY_ORIGIN.lon, CITY_ORIGIN.lat, 19), pending = [...f.pending()];
  assert.equal(pending[0].src, `${AERIAL_SERVICE}/tile/19/${tile.row}/${tile.column}`);
  const target = tileBounds(tile.column + 2, tile.row, 19), requested = f.images.length;
  const centerUrl = `${AERIAL_SERVICE}/tile/19/${tile.row}/${tile.column + 2}`;
  assert.ok(!pending.some(image => image.src === centerUrl), 'the future center is initially waiting in the queue');
  f.ground.update({ x: (target.minX + target.maxX) / 2, z: (target.minZ + target.maxZ) / 2 });
  assert.ok(pending.every(image => !image.cancelled));
  assert.equal(f.images.length, requested, 'a focus change keeps the six useful existing requests');
  pending[0].succeed();
  assert.equal(f.images.at(-1).src, centerUrl, 'the next available network slot goes to the new center');
  assert.ok(f.maxActive <= 6);f.drain();
  assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 81);
});

test('in-flight requests lose ownership after travel and cannot attach late meshes', t => {
  const f = fixture(t);f.drain();
  f.ground.update({ x: 0, z: 0 });
  const old = f.pending().map(image => ({ image, lateLoad: image.onload }));
  f.ground.update({ x: 10000, z: 15000 });
  assert.ok(old.every(({ image }) => image.cancelled));
  for (const { lateLoad } of old) lateLoad();
  assert.equal(f.ground.group.children.length, 1);
  f.drain();
  assert.equal(f.ground.group.children.length, 82);
  assert.equal(f.ground.getStatus().cached, 81);
  assert.ok(f.maxActive <= 6);
});

test('disposal releases resident GPU objects and cancels pending work without late callbacks', t => {
  const f = fixture(t);f.ground.update({ x: 0, z: 0 });f.drain();
  let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0;
  const meshCount = f.ground.group.children.length;
  for (const mesh of f.ground.group.children) {
    mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
    mesh.material.addEventListener('dispose', () => materialDisposals++);
    mesh.material.map.addEventListener('dispose', () => textureDisposals++);
  }
  const localTexture = f.ground.localOrthophoto.texture;
  localTexture.addEventListener('dispose', () => textureDisposals++);
  f.ground.update({ x: 500, z: 0 });
  const late = f.pending().map(image => image.onload);
  const reports = f.reports.length, atlasDraws = f.contexts[1].draws.length;
  f.ground.dispose();
  for (const callback of late) callback();
  f.ground.update({ x: 10000, z: 10000 });
  f.ground.dispose();
  assert.equal(f.scene.children.length, 0);
  assert.equal(f.pending().length, 0);
  assert.equal(f.ground.getStatus().loading, 0);
  assert.equal(f.ground.getStatus().cached, 0);
  assert.equal(f.reports.length, reports, 'disposed stream must not call its owner');
  assert.equal(geometryDisposals, meshCount);
  assert.equal(materialDisposals, meshCount);
  assert.equal(textureDisposals, meshCount + 1, 'the extra shared roof atlas is also released exactly once');
  assert.equal(localTexture.image.width, 0);assert.equal(localTexture.image.height, 0);
  assert.equal(f.contexts[1].draws.length, atlasDraws, 'late requests cannot paint a disposed atlas');
});

test('tile failure reports missing imagery, limits immediate retries, then retries the stationary view', t => {
  const f = fixture(t);f.drain();
  f.ground.update({ x: 0, z: 0 });
  const failedUrl = f.pending()[0].src;
  f.drain(image => image.src === failedUrl ? image.fail() : image.succeed());
  assert.equal(f.images.filter(image => image.src === failedUrl).length, 2);
  assert.equal(f.ground.getStatus().failures, 2);
  assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 80);
  assert.equal(f.ground.getStatus().loading, 0);
  const imagesBefore = f.images.length;
  f.ground.update({ x: 0, z: 0 });
  assert.equal(f.images.length, imagesBefore, 'an outage does not trigger a retry each frame');
  f.advance(5001);f.ground.update({ x: 0, z: 0 });f.drain();
  assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 81);
  assert.equal(f.ground.getStatus().loading, 0);
});

test('coarse imagery errors leave a usable city plane and do not prevent local tile loading', t => {
  const f = fixture(t), coarseCount = overviewTiles().length;
  f.drain(image => image.fail());
  assert.equal(f.ground.getStatus().failures, coarseCount * 2);
  assert.equal(f.ground.getStatus().loaded, 0);
  assert.equal(f.ground.group.children.length, 1);
  f.ground.update({ x: 0, z: 0 });f.drain();
  assert.equal(f.ground.getStatus().loaded, 81);
  assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 81);
});

test('the shared close atlas stays north-up and matches zoom-19 source geography in every borough', t => {
  const f = fixture(t), descriptor = f.ground.localOrthophoto, texture = descriptor.texture;
  const bounds = descriptor.bounds, mercator = descriptor.mercator, context = f.contexts[1];
  assert.equal(texture.image.width, 2304);assert.equal(texture.image.height, 2304);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);assert.equal(texture.anisotropy, 4);
  for (const [, lon, lat] of boroughs) {
    const point = geographicToWorld(lon, lat), tile = tileForPoint(lon, lat, 19);
    f.ground.update(point);f.drain();
    assert.equal(f.ground.localOrthophoto, descriptor);
    assert.equal(descriptor.texture, texture);assert.equal(descriptor.bounds, bounds);assert.equal(descriptor.mercator, mercator);
    assert.equal(context.cells.size, 81);
    assert.ok(context.cells.get('0,0').endsWith(`/19/${tile.row - 4}/${tile.column - 4}`));
    assert.ok(context.cells.get('8,8').endsWith(`/19/${tile.row + 4}/${tile.column + 4}`));
    for (let row = 0; row < 9; row++) for (let column = 0; column < 9; column++) {
      const b = tileBounds(tile.column - 4 + column, tile.row - 4 + row, 19);
      close((b.minX - bounds.minX) / (bounds.maxX - bounds.minX), column / 9);
      close((b.maxX - bounds.minX) / (bounds.maxX - bounds.minX), (column + 1) / 9);
      for (const [z, expected] of [[b.minZ, 1 - row / 9], [b.maxZ, 1 - (row + 1) / 9]]) {
        const latitude = mercator.originLat - z / mercator.radius;
        close((Math.asinh(Math.tan(latitude)) - mercator.south) / (mercator.north - mercator.south), expected);
      }
    }
    assert.ok((bounds.maxX - bounds.minX) / texture.image.width < .25, 'nearby roofs receive sub-25cm image pixels');
    const version = texture.version, clears = context.clears.length;
    f.ground.update(point);
    assert.equal(texture.version, version, 'a stationary complete atlas is not uploaded every frame');
    assert.equal(context.clears.length, clears);
  }
});

test('unloaded and failed close atlas cells remain transparent until their actual source tile arrives', t => {
  const f = fixture(t), context = f.contexts[1];f.drain();
  f.ground.update({ x: 0, z: 0 });
  assert.deepEqual(context.clears.at(-1), [0, 0, 2304, 2304]);
  assert.equal(context.cells.size, 0);assert.equal(context.fills.length, 0, 'unavailable source pixels are never painted with a placeholder');
  const failedUrl = f.pending()[0].src;
  const center = tileForPoint(CITY_ORIGIN.lon, CITY_ORIGIN.lat, 19);
  const [, row, column] = failedUrl.match(/\/19\/(\d+)\/(\d+)$/);
  const failedSlot = `${Number(column) - center.column + 4},${Number(row) - center.row + 4}`;
  f.drain(image => image.src === failedUrl ? image.fail() : image.succeed());
  assert.equal(context.cells.size, 80);
  assert.equal(context.cells.has(failedSlot), false, 'failed imagery leaves no opaque coverage at its geographic slot');
  assert.ok(![...context.cells.values()].includes(failedUrl));
  f.advance(5001);f.ground.update({ x: 0, z: 0 });f.drain();
  assert.equal(context.cells.size, 81);assert.equal(context.cells.get(failedSlot), failedUrl);
});

test('moving the atlas remaps surviving requests and cached images without accepting departed tiles', t => {
  const f = fixture(t), context = f.contexts[1];f.drain();
  const tile = tileForPoint(CITY_ORIGIN.lon, CITY_ORIGIN.lat, 19);
  f.ground.update({ x: 0, z: 0 });
  const previous = f.pending().map(image => ({ image, load: image.onload }));
  const next = tileBounds(tile.column + 1, tile.row, 19);
  f.ground.update({ x: (next.minX + next.maxX) / 2, z: (next.minZ + next.maxZ) / 2 });
  const departed = previous.filter(({ image }) => image.cancelled);
  const surviving = previous.find(({ image }) => !image.cancelled);
  assert.ok(surviving);
  const before = context.draws.length;
  for (const { load } of departed) load();
  assert.equal(context.draws.length, before);
  surviving.image.succeed();
  const match = surviving.image.src.match(/\/19\/(\d+)\/(\d+)$/);
  const expectedX = (Number(match[2]) - (tile.column + 1 - 4)) * 256;
  const expectedY = (Number(match[1]) - (tile.row - 4)) * 256;
  assert.deepEqual(context.draws.at(-1).slice(1), [expectedX, expectedY, 256, 256],
    'an overlapping in-flight tile paints its current geographic slot');
  f.drain();
  const imageCount = f.images.length;
  f.ground.update({ x: 0, z: 0 });
  assert.ok(context.cells.size >= 72, 'overlapping resident imagery repaints immediately before new requests finish');
  f.drain();assert.equal(context.cells.size, 81);
  assert.ok(f.images.length - imageCount <= 9, 'a single-column move reuses its neighboring resident tiles');
  f.ground.update({ x: 10000, z: 15000 });
  assert.equal(context.cells.size, 0, 'teleporting clears every previous atlas cell');
  const old = f.pending().map(image => image.onload);
  f.ground.update({ x: -10000, z: -15000 });
  for (const load of old) load();
  assert.equal(context.cells.size, 0, 'canceled results cannot contaminate the new borough');
  f.drain();assert.equal(context.cells.size, 81);
});

test('overview clears local coverage and a return to its cached street restores it without downloading', t => {
  const f = fixture(t), context = f.contexts[1];f.ground.update({ x: 0, z: 0 });f.drain();
  assert.equal(context.cells.size, 81);
  const imageCount = f.images.length, texture = f.ground.localOrthophoto.texture;
  f.ground.update({ x: 0, z: 0 }, { overview: true });
  assert.equal(context.cells.size, 0, 'overview roofs use coarse imagery instead of a stale local overlay');
  assert.equal(f.ground.localOrthophoto.texture, texture);
  f.ground.update({ x: 0, z: 0 });
  assert.equal(context.cells.size, 81);assert.equal(f.images.length, imageCount);
});

test('timed-out image requests are aborted before replacement requests start', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t), stalled = [...f.pending()];
  t.mock.timers.tick(12001);
  assert.ok(stalled.every(image => image.cancelled));
  assert.equal(f.ground.getStatus().failures, 6);
  assert.ok(f.pending().length <= 6);
  assert.ok(f.maxActive <= 6);
  f.drain();
  assert.equal(f.ground.getStatus().loading, 0);
});
