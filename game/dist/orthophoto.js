import * as THREE from './vendor/three.module.min.js';

export function atlasLayout(manifest, maxTextureSize = 4096) {
  const tiles = manifest.tiles;
  if (!tiles?.length) throw new Error('The NYC aerial map contains no tiles.');
  const minColumn = Math.min(...tiles.map(tile => tile.column));
  const maxColumn = Math.max(...tiles.map(tile => tile.column));
  const minRow = Math.min(...tiles.map(tile => tile.row));
  const maxRow = Math.max(...tiles.map(tile => tile.row));
  if (![minColumn, maxColumn, minRow, maxRow].every(Number.isInteger)) throw new Error('Invalid aerial tile coordinates.');
  const columns = maxColumn - minColumn + 1, rows = maxRow - minRow + 1;
  if (new Set(tiles.map(tile => `${tile.column},${tile.row}`)).size !== columns * rows || tiles.length !== columns * rows) {
    throw new Error('The NYC aerial map has missing or duplicate tiles.');
  }
  const tileSize = Math.min(256, Math.floor(maxTextureSize / Math.max(columns, rows)));
  if (tileSize < 1) throw new Error('The aerial map exceeds this device’s texture limit.');
  return { minColumn, minRow, tileSize, width: columns * tileSize, height: rows * tileSize,
    bounds: {
      minX: Math.min(...tiles.map(tile => tile.bounds.minX)), maxX: Math.max(...tiles.map(tile => tile.bounds.maxX)),
      minZ: Math.min(...tiles.map(tile => tile.bounds.minZ)), maxZ: Math.max(...tiles.map(tile => tile.bounds.maxZ)),
    },
  };
}

export async function loadOrthophoto(manifest, maxTextureSize = 4096) {
  const layout = atlasLayout(manifest, maxTextureSize);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width; canvas.height = layout.height;
  const context = canvas.getContext('2d');
  let nextTile = 0;
  // Bound parallel decoding and combine georeferenced map tiles in the browser.
  // North is image-top; the renderer maps decreasing V to increasing world Z.
  const worker = async () => {
    while (nextTile < manifest.tiles.length) {
      const tile = manifest.tiles[nextTile++];
      const image = new Image();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('NYC aerial imagery timed out.')), 15000);
        image.onload = () => { clearTimeout(timeout); resolve(); };
        image.onerror = () => { clearTimeout(timeout); reject(new Error('NYC aerial imagery could not load.')); };
        image.src = tile.url;
      });
      context.drawImage(image, (tile.column - layout.minColumn) * layout.tileSize,
        (tile.row - layout.minRow) * layout.tileSize, layout.tileSize, layout.tileSize);
    }
  };
  await Promise.all(Array.from({ length: Math.min(12, manifest.tiles.length) }, worker));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { orthoTexture: texture, orthoBounds: layout.bounds };
}
