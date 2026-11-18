// Decodes surveyed building tiles off the main thread, so streaming the city
// while driving does not cost frames. Heights come back relative to each
// building's own base; the page anchors them to its terrain.
import { decodeI3S, lotsReady } from './city-stream.js';

const ready = lotsReady();
self.onmessage = async ({ data: { id, buffer, node, origin, collisions } }) => {
  // A tile is not dressed until the decoder knows what stands where, so the same building looks the same every time.
  await ready;
  try {
    const result = decodeI3S(buffer, node, origin, { collisions });
    self.postMessage({ id, result }, [result.positions.buffer, result.normals.buffer, result.facade.buffer, result.style.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'NYC geometry could not be decoded.' });
  }
};
