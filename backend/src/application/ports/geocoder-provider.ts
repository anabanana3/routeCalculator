import type { Bounds, LatLon } from '../../domain/geo/geo.js';
import type { GeocodeResult } from '../../domain/geocoding/place.js';

export interface SearchOptions {
  limit: number;
  /** Punto hacia el que se priorizan los resultados. */
  focus?: LatLon;
  /** Si se indica, solo se devuelven resultados dentro de estos límites. */
  bounds?: Bounds;
  language: string;
}

/** Proveedor de geocodificación intercambiable (Photon, Nominatim...). */
export interface GeocoderProvider {
  readonly name: string;
  search(query: string, opts: SearchOptions): Promise<GeocodeResult[]>;
  reverse(point: LatLon, language: string): Promise<GeocodeResult | null>;
}
