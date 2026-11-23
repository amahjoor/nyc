import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group } from '../dist/vendor/three.module.min.js';
import { createTimesSquare, redStepHeight } from '../dist/times-square.js';
import { createCityLife, WALKING_PACE } from '../dist/citylife.js';
import { createCrowd, createWalkNetwork } from '../dist/crowd.js';
import { StreetObjects } from '../dist/street-objects.js';
import { countedSidewalkDensity, plazaVisitorsPerMetre } from '../dist/times-square-crowd.js';
import { buildCell, cellBounds, createStreetSource, indexPolygon, insideIndexed } from '../dist/streetscape.js';

const foot = { x: 1392.34, z: -3954.54 };
const ground = () => 10;

test('TKTS treads and rail collisions follow the same staircase and streamed elevation', () => {
  const scene = new Group(), district = createTimesSquare(scene), registered = new Map();
  const along = Math.hypot(7, -17.45);
  const at = (distance) => [foot.x + distance * 7 / along, foot.z - distance * 17.45 / along];
  assert.equal(district.stepAt(...at(1)), null);
  district.update(foot, ground, { replace: (key, rows) => registered.set(key, rows) }, true, 1, 0);
  assert.equal(scene.getObjectByName('Laminated ruby glass treads').count, 27);
  for (let i = 0; i < 27; i++) {
    const pt = at((i + .5) * 18.8 / 27);
    assert.ok(Math.abs(district.stepAt(...pt) - (10 + (i + 1) * 4.88 / 27)) < 1e-8);
  }
  assert.equal(redStepHeight(...at(-1)), null);
  assert.equal(redStepHeight(...at(20)), null);
  assert.equal(registered.get('tkts-rail').length, 3);
  assert.ok(registered.get('broadway-furniture').length > 10);
  district.update({ x: 0, z: 0 }, ground, null, true, 1, 1);
  assert.equal(district.stepAt(...at(1)), null);
  assert.equal(registered.get('tkts-rail').length, 0);
  district.dispose();
  assert.equal(scene.children.length, 0);
});

test('display banks follow survey elevation, visibility and eviction', () => {
  const scene = new Group(), tile = new Group(), district = createTimesSquare(scene);
  scene.add(tile);
  const anchor = { featureId: 469404, elevation: 12 };
  const bank = district.attach(tile, [anchor]);
  const group = tile.getObjectByName('Times Square sign bank');
  assert.equal(group.position.y, 12);
  assert.ok(group.getObjectByName('LED campaign faces').geometry.hasAttribute('aSign'));
  anchor.elevation = 13;
  bank.update();
  assert.equal(group.position.y, 13);
  const lighting = (night) => district.update(foot, ground, null, true, night, 1);
  assert.ok(lighting(1).some((spot) => spot.glow.some((channel) => channel > 0)));
  assert.equal(lighting(0).length, 0);
  tile.visible = false;
  assert.equal(lighting(1).length, 0);
  tile.visible = true;
  bank.dispose();
  assert.equal(lighting(1).length, 0);
  assert.equal(tile.children.length, 0);
  district.dispose();
});

test('the red steps stand on bundled Duffy Square pavement with census trees available offline', async () => {
  let requests = 0;
  const fetcher = async (url) => {
    requests++;
    const data = JSON.parse(await readFile(new URL('../dist/' + url, import.meta.url)));
    return { ok: true, json: async () => data };
  };
  const source = createStreetSource({ fetcher, live: false });
  const [cell, trees] = await Promise.all([source.load('2,-8'), source.trees('2,-8')]);
  assert.equal(requests, 1);
  assert.equal(cell.source, 'bundled');
  assert.ok(trees.length);
  const plaza = cell.surfaces.find((surface) => surface.id === 'duffy-paving');
  assert.ok(insideIndexed(indexPolygon(plaza.polygon, plaza.holes), foot.x, foot.z));
});

test('Seventh Avenue preserves the measured hourly counts and July block totals', () => {
  const between44and45 = { x: 1315, z: -3803, tx: .48, tz: -.877 };
  const hourly = (hour, day) => countedSidewalkDensity(between44and45, hour, day, WALKING_PACE) * 3600 * WALKING_PACE;
  assert.ok(Math.abs(hourly(19.5, 2) - 5994) < 1e-8);
  assert.ok(Math.abs(hourly(16.5, 5) - 4478) < 1e-8);
  assert.ok(Math.abs(hourly(19.5, 5) - 5671) < 1e-8);
  for (const day of [2, 5, 6]) {
    const total = Array.from({ length: 24 }, (_, h) => hourly(h + .5, day)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 35842) < 1e-8);
    assert.equal(hourly(0, day), hourly(24, day));
  }
  assert.equal(countedSidewalkDensity({ ...between44and45, tx: .877, tz: .48 }, 19.5, 2, WALKING_PACE), null);
});

test('the local crowd occupies the Broadway plazas and peaks in the sampled daytime hours', async () => {
  const json = async (file) => JSON.parse(await readFile(new URL('../dist/' + file, import.meta.url)));
  const [cell, roads, survey] = await Promise.all(
    ['times-square/2_-8.json', 'roads/1_-4.json', 'street-life.json'].map(json),
  );
  const { walks } = await buildCell(cell.surfaces, roads.roads, { bounds: cellBounds('2,-8', 500), census: cell.trees });
  const polygons = new Map(
    cell.surfaces.filter((s) => s.kind === 'plaza').map((s) => [s.id, indexPolygon(s.polygon, s.holes)]),
  );
  const reference = walks.filter((r) => r.plaza === 'plaza:355:0');
  const staying = reference.reduce((n, r) => n + plazaVisitorsPerMetre(r, 15.5, 1) * r.length * .75, 0);
  assert.ok(Math.abs(staying - 125) < .1);
  const stair = walks.find((r) => r.stair);
  assert.deepEqual(createWalkNetwork(walks).linksFrom(stair, 1), []);
  const focus = { x: 1381, z: -3930 }, district = createTimesSquare(new Group()), bodies = new StreetObjects();
  district.update(focus, ground, bodies, true, 0, 0);
  const crowd = createCrowd({
    life: createCityLife(survey),
    heightAt: (x, z) => district.stepAt(x, z) ?? ground(),
    blocked: (x, z, y, r) => Boolean(bodies.contact(x, z, r, y)),
  });
  const tick = (hours, time) => crowd.update(.05, { hours, time, weekday: 1, walks, focus });
  const onPlaza = () => crowd.people.filter((p) => p.run?.plaza);
  tick(4.5, 0);
  const dawn = onPlaza().length;
  for (let i = 1; i <= 90; i++) tick(13.5, i * .05);
  const lunch = onPlaza();
  assert.ok(dawn > 0 && lunch.length > dawn * 3);
  assert.ok(lunch.filter((p) => p.state === 'rest').length > 20);
  assert.ok(lunch.some((p) => p.run.stair && p.y > ground() + 1));
  // A crossing keeps its departure run until the pedestrian reaches the far kerb.
  for (const p of lunch.filter((p) => p.state !== 'cross')) assert.ok(insideIndexed(polygons.get(p.run.plaza), p.x, p.z));
  crowd.dispose();
  district.dispose();
});
