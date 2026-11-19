import { type Coord, fastDistanceSq } from '../geo/geo.js';
import type { Shape, TransitNetwork, Trip } from '../network/model.js';

export function nearestIndex(shape: Shape, lat: number, lon: number, from: number): number {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i < shape.lat.length; i++) {
    const d = fastDistanceSq(lat, lon, shape.lat[i], shape.lon[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Geometría de un tramo en vehículo entre las posiciones fromPos y toPos del viaje.
 * Usa shapes.txt si existe (por shape_dist_traveled o por proximidad);
 * si no, une las paradas en línea recta.
 */
export function tripLegGeometry(data: TransitNetwork, trip: Trip, fromPos: number, toPos: number): Coord[] {
  const times = data.tripTimes[trip.timesIdx];
  const stopCoords: Coord[] = [];
  for (let i = fromPos; i <= toPos; i++) {
    const s = data.stops[times.stops[i]];
    stopCoords.push([s.lat, s.lon]);
  }

  const shape = trip.shapeId ? data.shapes.get(trip.shapeId) : undefined;
  if (!shape || shape.lat.length < 2) return stopCoords;

  const first = stopCoords[0];
  const last = stopCoords[stopCoords.length - 1];
  const out: Coord[] = [first];

  const d0 = times.dist?.[fromPos];
  const d1 = times.dist?.[toPos];
  if (shape.dist && d0 !== undefined && d1 !== undefined && !Number.isNaN(d0) && !Number.isNaN(d1)) {
    for (let i = 0; i < shape.lat.length; i++) {
      const d = shape.dist[i];
      if (d > d0 && d < d1) out.push([shape.lat[i], shape.lon[i]]);
    }
  } else {
    // Avanza parada a parada desde el inicio del viaje para respetar el orden en rutas circulares.
    let idx = 0;
    let startIdx = 0;
    for (let i = 0; i <= toPos; i++) {
      const s = data.stops[times.stops[i]];
      idx = nearestIndex(shape, s.lat, s.lon, idx);
      if (i === fromPos) startIdx = idx;
    }
    for (let i = startIdx; i <= idx; i++) out.push([shape.lat[i], shape.lon[i]]);
  }

  out.push(last);
  return out;
}
