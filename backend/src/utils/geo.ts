const EARTH_RADIUS_M = 6371008.8;

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

export interface SpatialPoint {
  idx: number;
  lat: number;
  lon: number;
}

export interface NearbyResult {
  idx: number;
  meters: number;
}

/** Índice espacial por rejilla para búsquedas de puntos cercanos. */
export class SpatialIndex {
  private readonly cells = new Map<string, SpatialPoint[]>();

  constructor(
    points: Iterable<SpatialPoint>,
    private readonly cellDeg = 0.01,
  ) {
    for (const p of points) {
      const key = this.key(Math.floor(p.lat / cellDeg), Math.floor(p.lon / cellDeg));
      const cell = this.cells.get(key);
      if (cell) cell.push(p);
      else this.cells.set(key, [p]);
    }
  }

  private key(i: number, j: number): string {
    return `${i}:${j}`;
  }

  within(lat: number, lon: number, meters: number): NearbyResult[] {
    const dLat = meters / 111320;
    const dLon = meters / (111320 * Math.max(0.01, Math.cos(lat * (Math.PI / 180))));
    const i0 = Math.floor((lat - dLat) / this.cellDeg);
    const i1 = Math.floor((lat + dLat) / this.cellDeg);
    const j0 = Math.floor((lon - dLon) / this.cellDeg);
    const j1 = Math.floor((lon + dLon) / this.cellDeg);
    const result: NearbyResult[] = [];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cell = this.cells.get(this.key(i, j));
        if (!cell) continue;
        for (const p of cell) {
          const d = haversineMeters(lat, lon, p.lat, p.lon);
          if (d <= meters) result.push({ idx: p.idx, meters: d });
        }
      }
    }
    return result.sort((a, b) => a.meters - b.meters);
  }
}
