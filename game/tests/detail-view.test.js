import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groundPicture, detailView, viewFromAbove, looksCoarse, inPicture, TOLERANCE } from '../dist/detail-view.js';
import { groundReach, SHOT_FOV } from '../dist/switch-shot.js';

const index = JSON.parse(readFileSync(new URL('../dist/city-index.json', import.meta.url)));
const nodes = new Map(index.nodes.map(node => [node.id, node]));
const depth = node => { let levels = 0; while (node.parent !== null && node.parent !== undefined) { node = nodes.get(node.parent); levels++; } return levels; };
const soho = { x: 138, z: -100 };
// The camera's world matrix for an eye at `eye` looking at `target`, as three.js lays it out.
function lookAt(eye, target) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], unit = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const back = unit(sub(eye, target)), right = unit(cross([0, 1, 0], back)), up = cross(back, right);
  return [...right, 0, ...up, 0, ...back, 0, ...eye, 1];
}
// The levels of the tiles a view would draw around a place, as the stream chooses them: refine while a tile looks too coarse.
function levelsDrawn(view, place, radius) {
  const drawn = [];
  const visit = node => {
    if (node.children.length && (node.resource === null || looksCoarse(node, view))) { node.children.forEach(id => visit(nodes.get(id))); return; }
    if (node.resource !== null && Math.hypot(node.x - place.x, node.z - place.z) < node.radius + radius) drawn.push(depth(node));
  };
  visit(nodes.get(index.root ?? 0));
  return drawn;
}

test('a camera looking straight down sees a rectangle of ground as wide as its height and field of view make it', () => {
  const picture = groundPicture(viewFromAboveMatrix(soho, 2940), SHOT_FOV, 16 / 9, 0);
  assert.deepEqual([Math.round(picture.over.x), Math.round(picture.over.z), picture.eye.height], [soho.x, soho.z, 2940]);
  assert.ok(Math.abs(picture.reach - groundReach(2940, 16 / 9)) < 1, 'the corners fall where the shot says its picture ends');
  // Over raised ground the eye is that much lower, and the picture that much smaller.
  const raised = groundPicture(viewFromAboveMatrix(soho, 2940), SHOT_FOV, 16 / 9, 940);
  assert.equal(raised.eye.height, 2000); assert.ok(Math.abs(raised.reach - groundReach(2000, 16 / 9)) < 1);
});
function viewFromAboveMatrix(place, height) { return [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, place.x, height, place.z, 1]; }

test('a tilted picture is centred where the camera looks, and one with sky in it has no edge', () => {
  const tilted = groundPicture(lookAt([0, 7000, 5000], [0, 0, 0]), 52, 16 / 9, 0);
  assert.ok(Math.hypot(tilted.over.x, tilted.over.z) < 1 && Number.isFinite(tilted.reach) && tilted.reach > 5000);
  const horizon = groundPicture(lookAt([0, 300, 0], [0, 250, -4000]), 55, 16 / 9, 0);
  assert.equal(horizon.reach, Infinity); assert.deepEqual(horizon.over, { x: 0, z: 0 });
});

test('on the street distance decides, and the picture takes over as the view climbs', () => {
  assert.equal(detailView(lookAt([0, 8, 0], [0, 2, -30]), 57, 16 / 9, 0, 900), null);
  assert.equal(detailView(lookAt([0, 60, 0], [0, 2, -30]), 57, 16 / 9, 0, 900), null);
  const roof = detailView(lookAt([0, 180, 0], [0, 2, -30]), 57, 16 / 9, 0, 900), high = viewFromAbove(soho, 2940, SHOT_FOV, 16 / 9, 900);
  assert.ok(roof.tolerance > high.tolerance * 1.9, 'just above the roofs it is half as strict');
  assert.equal(high.tolerance, TOLERANCE); assert.equal(high.only, true);
  // A window is taken for no shorter than 720 pixels and no taller than 1200.
  assert.equal(viewFromAbove(soho, 2940, SHOT_FOV, 16 / 9, 200).focal, viewFromAbove(soho, 2940, SHOT_FOV, 16 / 9, 720).focal);
  assert.equal(viewFromAbove(soho, 2940, SHOT_FOV, 16 / 9, 4000).focal, viewFromAbove(soho, 2940, SHOT_FOV, 16 / 9, 1200).focal);
  // A camera that can turn is never told that only its picture matters.
  assert.equal(detailView(lookAt([0, 300, 0], [0, 250, -4000]), 55, 16 / 9, 0, 900, true).only, false);
});

test('the lower the camera hangs over a place, the finer the level it is drawn in', () => {
  const finest = height => Math.max(...levelsDrawn(viewFromAbove(soho, height, SHOT_FOV, 16 / 9, 900), soho, 0));
  const coarsest = height => Math.min(...levelsDrawn(viewFromAbove(soho, height, SHOT_FOV, 16 / 9, 900), soho, 0));
  // The map of the whole city: the coarsest level only.
  assert.equal(finest(40000), 1);
  // The top of the shot: past the two levels that look like shards from there.
  assert.ok(coarsest(2940) >= 3, `level ${coarsest(2940)} from 2940 m`);
  // A neighbourhood's width up: the survey in full under the camera.
  const leaves = index.nodes.filter(node => !node.children.length && Math.hypot(node.x - soho.x, node.z - soho.z) < node.radius).map(depth);
  assert.ok(coarsest(650) >= Math.min(...leaves), `level ${coarsest(650)} from 650 m`);
  for (const [lower, higher] of [[650, 2940], [2940, 9000], [9000, 40000]]) assert.ok(coarsest(lower) >= coarsest(higher));
});

test('only what is in the picture is refined, and the far side of a tilted map less than the near', () => {
  const view = viewFromAbove(soho, 650, SHOT_FOV, 16 / 9, 900), far = index.nodes.find(node => node.children.length && node.resource !== null && Math.hypot(node.x - soho.x, node.z - soho.z) - node.radius > 3000);
  assert.equal(inPicture(far, view), false); assert.equal(looksCoarse(far, view), false);
  assert.equal(looksCoarse({ ...far, lodThreshold: 0, x: soho.x, z: soho.z }, view), false, 'a tile without a limit stands as it is');
  // The picker's camera: seven kilometres up, looking at a place five and a half away on the ground.
  const picker = detailView(lookAt([0, 7270, 5500], [0, 0, 0]), 52, 16 / 9, 0, 900);
  const tile = { x: 0, z: 0, radius: 3344, lodThreshold: 237957, children: [1] };
  assert.equal(looksCoarse(tile, picker), true, 'the place being looked at');
  assert.equal(looksCoarse({ ...tile, z: -16000 }, picker), false, 'the same tile near the horizon');
});
