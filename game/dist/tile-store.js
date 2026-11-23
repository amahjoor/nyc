// Building tiles kept on this machine between visits.
//
// The surveyed buildings are fetched from the city's server a tile at a time,
// and the server lets a browser keep each for an hour. The survey is from
// 2014 and does not change, so a tile that has been fetched once is kept
// here for good: the next launch, and the next arrival in a neighbourhood
// already visited, read it from disk instead of asking for it again.
//
// A tile is stored compressed (as it came over the wire, it is a fifth of its
// size in memory), under the address it was fetched from. The store keeps the
// most recently added `limit` tiles and drops the oldest beyond that.
// Everything here is best effort: a browser without the storage, a full disk
// or a damaged entry is a miss, never an error.

/**
 * @returns the store, or null where the browser cannot keep one. `get(url)` resolves to the tile's bytes
 *   (an ArrayBuffer) or null; `put(url, buffer)` keeps a copy; `remove(url)` forgets one that proved unusable.
 */
export function createTileStore({ cacheStorage = globalThis.caches, name = 'nyc-buildings-v1', limit = 900 } = {}) {
  if (!cacheStorage || typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function' || typeof Response !== 'function') return null;
  let opening = null, added = 0;
  const open = () => opening ||= cacheStorage.open(name);
  const squeeze = (data, stream) => new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
  return {
    async get(url) {
      try {
        const hit = await (await open()).match(url);
        return hit ? await squeeze(await hit.arrayBuffer(), new DecompressionStream('gzip')) : null;
      } catch { return null; }
    },
    async put(url, buffer) {
      try {
        const packed = await squeeze(buffer, new CompressionStream('gzip')), cache = await open();
        await cache.put(url, new Response(packed, { headers: { 'Content-Type': 'application/octet-stream' } }));
        // Now and then, drop the oldest beyond the limit: keys come back in the order they were added.
        if (++added % 40 === 0) { const keys = await cache.keys(); for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key); }
        return true;
      } catch { return false; }
    },
    async remove(url) { try { return await (await open()).delete(url); } catch { return false; } },
  };
}
