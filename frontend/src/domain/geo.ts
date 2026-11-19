import type { ItineraryDto, LatLon } from './types/api';

export type Coord = [number, number];
export type BoundsTuple = [Coord, Coord];

/** Petición de encuadre del mapa; la clave cambia para forzar un nuevo encuadre aunque los límites sean iguales. */
export interface MapFocus {
  bounds: BoundsTuple;
  key: string;
}

export function boundsOf(points: Coord[]): BoundsTuple {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}

export function pointBounds(p: LatLon): BoundsTuple {
  return [
    [p.lat, p.lon],
    [p.lat, p.lon],
  ];
}

/** Todos los puntos de las geometrías de los itinerarios. */
export function itinerariesGeometry(itineraries: ItineraryDto[]): Coord[] {
  return itineraries.flatMap((it) => it.legs.flatMap((l) => l.geometry));
}

export function sameLocation(a: LatLon | null | undefined, b: LatLon): boolean {
  return !!a && a.lat === b.lat && a.lon === b.lon;
}
