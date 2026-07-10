import type { BlockFeature } from '../types/api';

export type LngLat = [number, number];

/**
 * Ray-casting point-in-polygon test. `point` and the ring vertices are both
 * [lon, lat]. Handles a single ring (the block's outer boundary). Written by
 * hand rather than pulled from a geometry library — it is small and the only
 * spatial op Field Mode needs.
 */
export function pointInRing(point: LngLat, ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True when the point falls inside a block's outer polygon ring. */
export function pointInBlock(point: LngLat, feature: BlockFeature): boolean {
  const outer = feature.geometry.coordinates[0];
  return !!outer && pointInRing(point, outer);
}

/** First block (if any) that contains the point. */
export function findBlockAt(
  point: LngLat,
  features: BlockFeature[],
): BlockFeature | null {
  return features.find((f) => pointInBlock(point, f)) ?? null;
}

/** Simple centroid of a polygon's outer ring (average of vertices). */
export function ringCentroid(ring: number[][]): LngLat {
  let sx = 0;
  let sy = 0;
  const n = ring.length;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

export function blockCentroid(feature: BlockFeature): LngLat {
  return ringCentroid(feature.geometry.coordinates[0]);
}

/** Bounding box [[minLat,minLon],[maxLat,maxLon]] over all features (Leaflet order). */
export function collectionBounds(
  features: BlockFeature[],
): [[number, number], [number, number]] {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const f of features) {
    for (const [lon, lat] of f.geometry.coordinates[0]) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

/** Leaflet expects [lat, lon]; GeoJSON stores [lon, lat]. Convert a ring. */
export function ringToLatLng(ring: number[][]): [number, number][] {
  return ring.map(([lon, lat]) => [lat, lon]);
}
