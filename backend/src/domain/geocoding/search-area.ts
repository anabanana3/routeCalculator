import { type Bounds, boundsCenter, boundsDiagonalMeters, expandBounds, type LatLon } from '../geo/geo.js';

/** Zonas mayores que esto (feeds nacionales) no se restringen en el buscador. */
export const MAX_RESTRICTED_AREA_METERS = 300_000;

/** Límites a los que se restringe el buscador de direcciones, o undefined si no se restringe. */
export function searchBounds(networkBounds: Bounds | null, restrict: boolean, marginMeters: number): Bounds | undefined {
  if (!networkBounds || !restrict) return undefined;
  if (boundsDiagonalMeters(networkBounds) > MAX_RESTRICTED_AREA_METERS) return undefined;
  return expandBounds(networkBounds, marginMeters);
}

/** Punto hacia el que se priorizan los resultados: el indicado o el centro de la red. */
export function searchFocus(focus: LatLon | undefined, networkBounds: Bounds | null): LatLon | undefined {
  return focus ?? (networkBounds ? boundsCenter(networkBounds) : undefined);
}
