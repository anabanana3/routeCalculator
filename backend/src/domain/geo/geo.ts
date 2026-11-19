export const EARTH_RADIUS_M = 6371008.8;
/** Metros aproximados por grado de latitud. */
export const METERS_PER_DEGREE = 111320;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Bounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export type Coord = [number, number];

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Aproximación rápida (equirectangular) para comparar distancias cortas. */
export function fastDistanceSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const y = lat2 - lat1;
  return x * x + y * y;
}

export function polylineLength(coords: Coord[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

export function computeBounds(points: Iterable<LatLon>): Bounds | null {
  let b: Bounds | null = null;
  for (const p of points) {
    if (!b) b = { minLat: p.lat, minLon: p.lon, maxLat: p.lat, maxLon: p.lon };
    b.minLat = Math.min(b.minLat, p.lat);
    b.maxLat = Math.max(b.maxLat, p.lat);
    b.minLon = Math.min(b.minLon, p.lon);
    b.maxLon = Math.max(b.maxLon, p.lon);
  }
  return b;
}

export function boundsCenter(b: Bounds): LatLon {
  return { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 };
}

/** Amplía unos límites con un margen en metros. */
export function expandBounds(b: Bounds, marginMeters: number): Bounds {
  const dLat = marginMeters / METERS_PER_DEGREE;
  const midLat = (b.minLat + b.maxLat) / 2;
  const dLon = marginMeters / (METERS_PER_DEGREE * Math.cos((midLat * Math.PI) / 180));
  return { minLat: b.minLat - dLat, maxLat: b.maxLat + dLat, minLon: b.minLon - dLon, maxLon: b.maxLon + dLon };
}

export function boundsDiagonalMeters(b: Bounds): number {
  return haversineMeters(b.minLat, b.minLon, b.maxLat, b.maxLon);
}
