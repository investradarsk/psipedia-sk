/** Shared grid for server clustering and the map-free area picker. */
/** @param {number} zoom */
export function mapClusterGridSize(zoom) {
  if (zoom <= 6) return 1;
  if (zoom <= 8) return 0.5;
  if (zoom <= 10) return 0.2;
  return 0.1;
}
