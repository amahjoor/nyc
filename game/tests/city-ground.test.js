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
  const previousDocument = globalThis.document, images = [], draws = [], reports = [];
  const context = { fillRect() {}, drawImage(...args) { draws.push(args); } };
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
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
  return { ground, scene, images, draws, reports, pending, get maxActive() { return maxActive; },
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
    for (const zoom of [12, 18]) {
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
      assert.ok(mesh.material.map.image.src.startsWith(`${AERIAL_SERVICE}/tile/18/`));
    }
  }
  assert.ok(f.maxActive <= 6, `observed ${f.maxActive} concurrent requests`);
  f.ground.update({ x: 0, z: 0 }, { overview: true });
  assert.equal(f.ground.group.children.slice(1).filter(mesh => mesh.visible).length, 0);
  assert.equal(f.ground.group.children[0].visible, true, 'coarse city coverage remains visible');
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
  f.ground.update({ x: 500, z: 0 });
  const late = f.pending().map(image => image.onload);
  const reports = f.reports.length;
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
  assert.equal(textureDisposals, meshCount);
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
