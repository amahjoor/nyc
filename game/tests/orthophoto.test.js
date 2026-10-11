import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { atlasLayout } from '../dist/orthophoto.js';

const manifest = JSON.parse(readFileSync(new URL('../dist/ortho.json', import.meta.url), 'utf8'));
const city = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url), 'utf8'));

test('NYC tile atlas covers the entire playable city and obeys GPU texture limits', () => {
  for (const limit of [2048,4096,8192]) {
    const layout=atlasLayout(manifest,limit);
    assert.ok(layout.width<=limit&&layout.height<=limit);
    assert.ok(layout.bounds.minX<city.bounds.minX&&layout.bounds.maxX>city.bounds.maxX);
    assert.ok(layout.bounds.minZ<city.bounds.minZ&&layout.bounds.maxZ>city.bounds.maxZ);
  }
});

test('map tile orientation is north-up and adjacent tiles meet without gaps', () => {
  const first=manifest.tiles[0];
  const east=manifest.tiles.find(tile=>tile.row===first.row&&tile.column===first.column+1);
  const south=manifest.tiles.find(tile=>tile.row===first.row+1&&tile.column===first.column);
  assert.ok(east&&south);
  assert.ok(Math.abs(first.bounds.maxX-east.bounds.minX)<.01);
  assert.ok(Math.abs(first.bounds.maxZ-south.bounds.minZ)<.01);
  assert.ok(east.bounds.minX>first.bounds.minX);
  assert.ok(south.bounds.minZ>first.bounds.minZ);
});

test('atlas refuses missing or duplicated geography instead of silently showing blank blocks', () => {
  assert.throws(()=>atlasLayout({...manifest,tiles:manifest.tiles.slice(1)}),/missing or duplicate/);
  assert.throws(()=>atlasLayout({...manifest,tiles:[...manifest.tiles,manifest.tiles[0]]}),/missing or duplicate/);
  assert.throws(()=>atlasLayout({tiles:[]}),/no tiles/);
});
