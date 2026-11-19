import { landPolygons, shorelineQuery } from './water.js';

// NYC DHS HOPE, March 10, 2026, slide 6. These are estimates for surface
// areas. The city reports the 1,431 people in subway areas separately.
// https://www.nyc.gov/assets/dhs/downloads/pdf/hope/hope-2026-results.pdf
export const SURFACE_ESTIMATES = Object.freeze({
  Manhattan: 2104, Brooklyn: 559, Queens: 457, Bronx: 430, 'Staten Island': 10,
});

// Each fictional resident starts at a reproducible point on borough land.
// The local simulation can bring them onto a nearby accessible sidewalk.
export function createStreetPopulation(boroughs, random) {
  const cells = new Map(), size = 128;
  let total = 0;
  for (const borough of boroughs) {
    const count = SURFACE_ESTIMATES[borough.name];
    if (!count) continue;
    const polygons = landPolygons([borough]);
    if (!polygons.length) continue;
    const contains = shorelineQuery(polygons);
    const minX = Math.min(...polygons.map(p => p.bounds.minX)), maxX = Math.max(...polygons.map(p => p.bounds.maxX));
    const minZ = Math.min(...polygons.map(p => p.bounds.minZ)), maxZ = Math.max(...polygons.map(p => p.bounds.maxZ));
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 128; tries++) {
      const x = minX + random() * (maxX - minX), z = minZ + random() * (maxZ - minZ);
      if (!contains(x, z)) continue;
      const key = Math.floor(x / size) + ',' + Math.floor(z / size);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ id: total++, borough: borough.name, x, z, contains });
      placed++;
    }
  }
  return {
    total,
    near(x, z, radius) {
      const found = [];
      for (let i = Math.floor((x - radius) / size); i <= Math.floor((x + radius) / size); i++) {
        for (let j = Math.floor((z - radius) / size); j <= Math.floor((z + radius) / size); j++) {
          for (const resident of cells.get(i + ',' + j) || []) {
            if (Math.hypot(resident.x - x, resident.z - z) <= radius) found.push(resident);
          }
        }
      }
      return found;
    },
  };
}
