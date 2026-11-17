import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFigures, createCrowd, KIT } from '../dist/crowd.js';

const meta = JSON.parse(readFileSync(new URL('../dist/people.json', import.meta.url), 'utf8'));
const file = readFileSync(new URL('../dist/people.bin', import.meta.url)), poses = new Int16Array(file.buffer, file.byteOffset, file.byteLength / 2);

test('the baked figures are a man and a woman who stand on the ground and stride on the spot', () => {
  assert.deepEqual(meta.figures.map(figure => figure.id), ['man', 'woman']);
  assert.equal(meta.source.licence, 'CC0 1.0'); assert.equal(meta.frames, meta.walkFrames + 1);
  assert.equal(poses.length, meta.figures.reduce((sum, figure) => sum + figure.vertices, 0) * meta.frames * 3);
  let offset = 0;
  for (const figure of meta.figures) {
    assert.ok(figure.vertices > 800 && figure.vertices < 3000 && figure.faces.length % 3 === 0 && figure.faces.every(i => i >= 0 && i < figure.vertices), `${figure.id}: ${figure.vertices} vertices`);
    assert.ok(figure.paint.length === figure.vertices && [0, 1, 2, 3, 4].every(paint => figure.paint.includes(paint)), 'skin, top, bottom, hair and shoes are all there');
    assert.ok(figure.bare.includes(1) && figure.bare.includes(2), 'forearms and shins can go bare');
    for (let f = 0; f < meta.frames; f++) {
      let low = Infinity, high = -Infinity, back = Infinity, front = -Infinity, side = 0;
      for (let i = 0; i < figure.vertices; i++) { const o = offset + (f * figure.vertices + i) * 3, x = poses[o] / 16000, y = poses[o + 1] / 16000, z = poses[o + 2] / 16000; low = Math.min(low, y); high = Math.max(high, y); back = Math.min(back, z); front = Math.max(front, z); side = Math.max(side, Math.abs(x)); }
      assert.ok(low > -.03 && low < .12 && Math.abs(high - figure.height) < .08, `${figure.id} frame ${f}: feet at ${low.toFixed(2)}, head at ${high.toFixed(2)}`);
      assert.ok(side < .6 && back > -.7 && front < .8, 'it stays over its own feet');
    }
    offset += figure.vertices * meta.frames * 3;
  }
});

test('the crowd takes the modelled figures in place of the blocked-out ones', () => {
  const figures = createFigures(meta, poses), total = meta.figures.reduce((sum, figure) => sum + figure.vertices, 0);
  assert.equal(figures.geometry.getAttribute('position').count, total); assert.equal(figures.geometry.getAttribute('aVertex').getX(total - 1), total - 1);
  assert.deepEqual([figures.texture.image.width, figures.texture.image.height], [total, meta.frames]);
  const body = figures.geometry.getAttribute('aBody');
  assert.deepEqual([body.getZ(0), body.getZ(total - 1)], [1, 2], 'each vertex says whose body it is');
  assert.equal(figures.material.flatShading, true);
  figures.geometry.dispose(); figures.material.dispose(); figures.texture.dispose();
  const crowd = createCrowd({ life: { crowding: () => 0, wardrobe: () => ({}) }, capacity: 8 });
  assert.equal(crowd.modelled, false);
  const gait = crowd.mesh.geometry.getAttribute('aGait');
  crowd.setFigures(meta, poses);
  assert.equal(crowd.modelled, true); assert.equal(crowd.mesh.geometry.getAttribute('aGait'), gait, 'each person keeps their colours and stride');
  assert.equal(crowd.mesh.material.name, 'People, modelled'); assert.equal(KIT.woman, 64);
  // Each person is drawn with one body, not both: the man's in one draw, the woman's in another.
  const [men, women] = [crowd.mesh, crowd.mesh.children[0]], faces = meta.figures.map(figure => figure.faces.length);
  assert.deepEqual([men.geometry.index.count, women.geometry.index.count], faces);
  assert.equal(men.geometry.getAttribute('position'), women.geometry.getAttribute('position'), 'over the same vertices');
  assert.notEqual(men.geometry.getAttribute('aGait'), women.geometry.getAttribute('aGait'));
  const look = { top: 1, bottom: 2, skin: 3, hair: 4, height: 1.72 };
  crowd.setExtras([{ x: 0, y: 0, z: 0, look: { ...look, kit: 0 } }, { x: 1, y: 0, z: 0, look: { ...look, kit: KIT.woman } }, { x: 2, y: 0, z: 0, look: { ...look, kit: KIT.woman | KIT.longHair } }]);
  crowd.update(.016, { walks: [], focus: { x: 0, z: 0 }, hours: 12, time: 0, junctions: [], cars: [] });
  assert.deepEqual([men.count, women.count], [1, 2]);
  assert.equal(women.geometry.getAttribute('aGait').getW(1), KIT.woman | KIT.longHair);
  crowd.dispose();
});
