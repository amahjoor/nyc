// Evaluate the Mercator curve relative to the atlas, not an absolute latitude.
// Subtracting two ~0.78 Mercator values in a float32 fragment shader loses
// metre-scale detail in a 500 m atlas, creating horizontal bands in the image.
// CPU doubles produce a cubic centered on this atlas. Across NYC its error is
// below a centimetre, while shader operations stay on normalized coordinates.
export function mercatorCoefficients(bounds, mercator) {
  if (!bounds || !mercator || ![bounds.minZ, bounds.maxZ, mercator.north, mercator.south,
    mercator.originLat, mercator.radius].every(Number.isFinite) || bounds.maxZ <= bounds.minZ
    || mercator.north <= mercator.south || mercator.radius <= 0) return null;
  const span = (bounds.maxZ - bounds.minZ) / mercator.radius;
  if (span > .02) return null; // This approximation is bounded to city-sized atlases.
  const latitude = mercator.originLat - (bounds.minZ + bounds.maxZ) / (2 * mercator.radius);
  const sec = 1 / Math.cos(latitude), tan = Math.tan(latitude), range = mercator.north - mercator.south;
  return [(Math.asinh(tan) - mercator.south) / range,
    sec * span / range, sec * tan * span ** 2 / (2 * range),
    sec * (tan * tan + sec * sec) * span ** 3 / (6 * range)];
}

export const atlasProjectionGLSL = `
  float atlasNorthUV(float z, vec4 bounds, vec4 coefficients) {
    float t = (bounds.w - z) / (bounds.w - bounds.z) - 0.5;
    return coefficients.x + t * (coefficients.y + t * (coefficients.z + t * coefficients.w));
  }
`;
