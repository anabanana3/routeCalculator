import { haversineMeters, METERS_PER_DEGREE } from './geo.js';

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

  /** Puntos a menos de `meters` metros, ordenados por distancia. */
  within(lat: number, lon: number, meters: number): NearbyResult[] {
    const dLat = meters / METERS_PER_DEGREE;
    const dLon = meters / (METERS_PER_DEGREE * Math.max(0.01, Math.cos(lat * (Math.PI / 180))));
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
