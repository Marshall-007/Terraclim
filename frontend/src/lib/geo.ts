/**
 * Hand-rolled geometry helpers for block boundaries: point-in-polygon
 * containment, centroids, bounding boxes, and area calculations for the
 * Field Mode "trace a block" flow. Deliberately dependency-free.
 */
import type { BlockFeature } from '../types/api';

export type LngLat = [number, number];

/**
 * Ray-casting point-in-polygon test. `point` and the ring vertices are both
 * [lon, lat]. Handles a single ring (the block's outer boundary). Written by
 * hand rather than pulled from a geometry library: it is small and the only
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

// ---------------------------------------------------------------------------
// Trace-a-block geometry: vertex list → closed ring → area.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/**
 * Close an open vertex list into a GeoJSON linear ring: the first vertex is
 * appended at the end (unless already closed). Returns a new array; the input
 * is never mutated. Fewer than 3 distinct vertices is not a polygon → null.
 */
export function closeRing(vertices: LngLat[]): number[][] | null {
  if (vertices.length < 3) return null;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  const alreadyClosed = first[0] === last[0] && first[1] === last[1];
  const open = alreadyClosed ? vertices.slice(0, -1) : vertices;
  if (open.length < 3) return null;
  return [...open.map(([lon, lat]) => [lon, lat]), [first[0], first[1]]];
}

/**
 * Planar shoelace area of a closed lon/lat ring, projected to metres with an
 * equirectangular approximation about the ring's mean latitude. Coordinates
 * are translated to the ring's mean point first so the shoelace sum does not
 * cancel catastrophically on large absolute lon/lat values. Accurate to well
 * under 1% at field scale, which is all the tracing tool needs. Returns
 * square metres, always positive (winding-independent).
 */
export function ringAreaM2(ring: number[][]): number {
  if (ring.length < 4) return 0; // closed ring needs 3 vertices + repeat
  // Mean over the open ring: the duplicated closing vertex would otherwise
  // bias the projection point differently depending on winding direction.
  const open = ring.slice(0, -1);
  const lonMean = open.reduce((s, [lon]) => s + lon, 0) / open.length;
  const latMean = open.reduce((s, [, lat]) => s + lat, 0) / open.length;
  const kx = EARTH_RADIUS_M * Math.cos(latMean * DEG) * DEG; // m per degree lon
  const ky = EARTH_RADIUS_M * DEG; // m per degree lat
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = (ring[i][0] - lonMean) * kx;
    const y1 = (ring[i][1] - latMean) * ky;
    const x2 = (ring[i + 1][0] - lonMean) * kx;
    const y2 = (ring[i + 1][1] - latMean) * ky;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Area of a closed ring in hectares, rounded to 0.01 ha. */
export function ringAreaHa(ring: number[][]): number {
  return Math.round((ringAreaM2(ring) / 10_000) * 100) / 100;
}
