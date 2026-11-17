// Decodes surveyed building tiles off the main thread, so streaming the city
// while driving does not cost frames. Heights come back relative to each
// building's own base; the page anchors them to its terrain.
import { decodeI3S } from './city-stream.js';

self.onmessage = ({ data: { id, buffer, node, origin, collisions } }) => {
  try {
    const result = decodeI3S(buffer, node, origin, { collisions });
    self.postMessage({ id, result }, [result.positions.buffer, result.normals.buffer, result.facade.buffer, result.style.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'NYC geometry could not be decoded.' });
  }
};
