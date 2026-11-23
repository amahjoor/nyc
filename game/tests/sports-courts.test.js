import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from '../dist/vendor/three.module.min.js';
import { createSportsCourts, addCourtPlaces } from '../dist/sports-courts.js';
import { createPlaceLayer } from '../dist/map-places.js';
import { createPlaceIndex } from '../dist/local-search.js';
import { StreetObjects } from '../dist/street-objects.js';

const { courts } = JSON.parse(readFileSync(new URL('../dist/courts.json', import.meta.url)));
test('the map and search take players to the same courts that are drawn on the ground', () => {
  const places = { kinds: [], places: [] };
  addCourtPlaces(places, courts);
  const map = createPlaceLayer(places), search = createPlaceIndex(places);
  assert.equal(map.totals.courts, courts.length);
  for (const sport of ['basketball', 'soccer']) {
    const facilities = courts.filter(court => court.sport === sport);
    for (const borough of [1, 2, 3, 4, 5]) {
      const near = facilities.find(court => court.borough === borough);
      const result = search.search(sport, { near, borough })[0];
      assert.deepEqual([result.x, result.z], [near.x, near.z]);
      assert.equal(map.nearest(near, 1, ['courts']).name, result.name);
    }
  }
});

test('court furniture and collision follow terrain revisions, travel and the overview together', t => {
  const brush = new Proxy({}, { get: () => () => {} });
  const old = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => brush }) };
  t.after(() => { if (old) globalThis.document = old; else delete globalThis.document; });
  const scene = new Scene(), physics = new StreetObjects();
  const hoop = courts.find(c => c.sport === 'basketball');
  const pitch = courts.find(c => c.sport === 'soccer' && Math.hypot(c.x - hoop.x, c.z - hoop.z) > 1000);
  let elevation = 12;
  const view = createSportsCourts([hoop, pitch], { scene, physics, heightAt: () => elevation });
  const posts = () => [...physics.groups.values()].flat();
  view.update(hoop, true, 0);
  const original = scene.children[0];
  assert.equal(posts().length, 2);
  view.update(hoop, true, 0);
  assert.equal(scene.children[0], original);
  elevation += 3;
  view.update(hoop, true, 1);
  assert.ok(posts().every(p => Math.abs(p.y - elevation) < .1));
  view.update(pitch, true, 1);
  assert.equal(scene.children.length, 1);
  assert.equal(posts().length, 4);
  assert.ok(posts().every(p => physics.contact(p.x, p.z, .3, elevation, null, 0)?.body.fixed));
  view.update(pitch, false, 1);
  assert.equal(physics.groups.size, 0);
  assert.equal(scene.children.length, 0);
  view.update(pitch, true, 1);
  assert.equal(scene.children.length, 1);
  view.dispose();
  assert.equal(physics.groups.size, 0);
  assert.equal(scene.children.length, 0);
});
