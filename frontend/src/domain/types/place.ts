import type { GeocodeKind, LatLon } from './api';

/** Origen o destino elegido por el usuario (desde el buscador, el mapa o su ubicación). */
export interface SelectedPlace extends LatLon {
  label: string;
  secondary?: string;
  kind: GeocodeKind | 'map' | 'current';
}

export type PointField = 'origin' | 'destination';
export type DepartMode = 'now' | 'at';
