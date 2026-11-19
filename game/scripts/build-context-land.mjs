// Build the land silhouette for everything around the five boroughs.
//
// The city's own survey stops at the city line, which would leave New York
// floating in open sea. This script samples public elevation tiles for the
// surrounding region (New Jersey, Long Island, Westchester) and writes one
// small greyscale image: 0 is water, anything else is land, brighter with
// height. Standard library only.
//
//   node scripts/build-context-land.mjs [--cache /tmp/nyc-context-land]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cacheIndex = process.argv.indexOf('--cache');
const cache = resolve(cacheIndex > 0 ? process.argv[cacheIndex + 1] : '/tmp/nyc-context-land');
const SERVICE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium', ZOOM = 10, TILE = 256;
const ORIGIN = { lat: 40.7235, lon: -74.0015 }, R = 6371008.8, RAD = Math.PI / 180;
// Local metres, the game's frame: x east, z south.
const BOUNDS = { minX: -62000, maxX: 72000, minZ: -64000, maxZ: 62000 }, CELL = 100;
const HEIGHT_SCALE = .6;       // stored value = 1 + metres * scale
// Within GUARD metres of the surveyed shoreline, ground on either side of it
// only counts as land if no water lies within CLEAR metres of it.
const SHORE_GUARD = 450, SHORE_CLEAR = 250;

/** Decode an 8-bit RGB or RGBA PNG into { width, height, channels, data }. */
function decodePng(bytes) {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file.');
  let offset = 8, width = 0, height = 0, channels = 0;
  const parts = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8), body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      if (body[8] !== 8 || ![2, 6].includes(body[9]) || body[12] !== 0) throw new Error('Unsupported PNG layout.');
      channels = body[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') parts.push(body);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * channels, data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = data.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? out[i - channels] : 0, up = y ? data[(y - 1) * stride + i] : 0, corner = y && i >= channels ? data[(y - 1) * stride + i - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) { const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner); predicted = a <= b && a <= c ? left : b <= c ? up : corner; }
      out[i] = (line[i] + predicted) & 255;
    }
  }
  return { width, height, channels, data };
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buffer) { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, body) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}
/** Encode 8-bit greyscale pixels as a PNG. */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 0;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const tiles = new Map();
async function tile(x, y) {
  const key = `${x}/${y}`;
  if (tiles.has(key)) return tiles.get(key);
  const path = resolve(cache, `${ZOOM}-${x}-${y}.png`);
  let bytes;
  try { bytes = await readFile(path); } catch {
    const response = await fetch(`${SERVICE}/${ZOOM}/${x}/${y}.png`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Elevation tile ${key} unavailable (${response.status}).`);
    bytes = Buffer.from(await response.arrayBuffer()); await writeFile(path, bytes);
  }
  const image = decodePng(bytes);
  if (image.width !== TILE || image.height !== TILE) throw new Error(`Unexpected elevation tile size: ${key}`);
  tiles.set(key, image);
  return image;
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

await mkdir(cache, { recursive: true });
const boroughs = JSON.parse(await readFile(resolve(root, 'dist/boroughs.json'), 'utf8')).boroughs;
const shores = boroughs.flatMap(borough => borough.polygons.map(polygon => {
  const xs = polygon.outer.map(point => point[0]), zs = polygon.outer.map(point => point[1]);
  return { ...polygon, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}));
// Buckets of shoreline segments, to test "is this cell close to the city's shore" quickly.
const bucket = 500, segments = new Map();
for (const { outer, holes = [] } of shores) for (const ring of [outer, ...holes]) for (let i = 0; i < ring.length; i++) {
  const a = ring[i], b = ring[(i + 1) % ring.length];
  for (let gx = Math.floor((Math.min(a[0], b[0]) - SHORE_GUARD) / bucket); gx <= Math.floor((Math.max(a[0], b[0]) + SHORE_GUARD) / bucket); gx++)
    for (let gz = Math.floor((Math.min(a[1], b[1]) - SHORE_GUARD) / bucket); gz <= Math.floor((Math.max(a[1], b[1]) + SHORE_GUARD) / bucket); gz++) {
      const key = `${gx},${gz}`; if (!segments.has(key)) segments.set(key, []); segments.get(key).push(a, b);
    }
}
const nearShore = (x, z) => {
  const list = segments.get(`${Math.floor(x / bucket)},${Math.floor(z / bucket)}`);
  if (!list) return false;
  for (let i = 0; i < list.length; i += 2) {
    const a = list[i], b = list[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < SHORE_GUARD) return true;
  }
  return false;
};
const inCity = (x, z) => shores.some(shore => x >= shore.minX && x <= shore.maxX && z >= shore.minZ && z <= shore.maxZ && inRing(x, z, shore.outer) && !(shore.holes || []).some(hole => inRing(x, z, hole)));

const width = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL), height = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / CELL), pixels = Buffer.alloc(width * height);
const scale = 2 ** ZOOM * TILE;
let land = 0, guarded = 0;
const guard = [];
for (let row = 0; row < height; row++) {
  const z = BOUNDS.minZ + (row + .5) * CELL, lat = ORIGIN.lat - z / R / RAD;
  const py = (1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2 * scale;
  for (let column = 0; column < width; column++) {
    const x = BOUNDS.minX + (column + .5) * CELL, lon = ORIGIN.lon + x / (R * Math.cos(ORIGIN.lat * RAD)) / RAD;
    const px = (lon + 180) / 360 * scale, image = await tile(Math.floor(px / TILE), Math.floor(py / TILE));
    const i = ((Math.floor(py) % TILE) * TILE + (Math.floor(px) % TILE)) * image.channels;
    const metres = image.data[i] * 256 + image.data[i + 1] + image.data[i + 2] / 256 - 32768;
    const city = inCity(x, z);
    // The city is dry wherever its own shoreline says so, whatever these tiles think.
    if (metres > .5 || city) pixels[row * width + column] = Math.max(1, Math.min(255, Math.round(1 + Math.max(0, metres) * HEIGHT_SCALE)));
    if (nearShore(x, z)) guard.push(row * width + column);
  }
}
// The city draws its own shore far more exactly than these tiles can. Beside
// it, ground only stays if it is clear of water: a land border with the next
// county survives, while the false fringe the coarse tiles leave around every
// pier and island does not. That goes for the city's own cells as well: the
// picture is smoothed between cells when it is drawn, so a cell of city land
// at the water's edge would spread a shelf of "country" a hundred metres out
// into the bay, all round Liberty Island and along every waterfront. The
// city's terrain is what shows there; only cells well inland are needed, to
// join it to the next county without a gap.
const reach = Math.ceil(SHORE_CLEAR / CELL), drop = [];
for (const index of guard) {
  if (!pixels[index]) continue;
  const row = Math.floor(index / width), column = index % width;
  let wet = false;
  for (let dz = -reach; dz <= reach && !wet; dz++) for (let dx = -reach; dx <= reach && !wet; dx++) {
    const r = row + dz, c = column + dx;
    if (r >= 0 && r < height && c >= 0 && c < width && Math.hypot(dx, dz) * CELL <= SHORE_CLEAR) wet = pixels[r * width + c] === 0;
  }
  if (wet) drop.push(index);
}
for (const index of drop) pixels[index] = 0;
guarded = drop.length;
for (const value of pixels) if (value) land++;
const png = encodePng(width, height, pixels);
await mkdir(resolve(root, 'dist/assets/context'), { recursive: true });
await writeFile(resolve(root, 'dist/assets/context/land.png'), png);
const manifest = { version: 1, origin: ORIGIN, bounds: BOUNDS, width, height, cellMeters: CELL, url: './assets/context/land.png',
  encoding: { water: 0, land: 'value = 1 + metres above sea level * heightScale, clamped to 255', heightScale: HEIGHT_SCALE },
  sha256: createHash('sha256').update(png).digest('hex'),
  source: { title: 'Terrain Tiles (Terrarium), Mapzen / AWS Open Data', url: 'https://registry.opendata.aws/terrain-tiles/', service: SERVICE, zoom: ZOOM,
    attribution: 'Elevation data from Mapzen Terrain Tiles: USGS 3DEP, SRTM, ETOPO1 and other public sources.',
    modifications: `Sampled to a ${CELL} m grid in the game's local frame and reduced to a land silhouette with coarse height. Within ${SHORE_GUARD} m of the city's surveyed shoreline, on either side of it, ground within ${SHORE_CLEAR} m of water is left out.`,
    limitations: 'A silhouette for distant context only: no buildings, roads or imagery, and no claim to shoreline accuracy.' } };
await writeFile(resolve(root, 'dist/context-land.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`Context land: ${width} x ${height} cells, ${(100 * land / pixels.length).toFixed(1)}% land, ${guarded} cells cleared beside the city shore, ${png.length} bytes, ${tiles.size} source tiles.`);
