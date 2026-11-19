import type { LatLon } from '../geo/geo.js';
import type { Stop, TransitNetwork } from '../network/model.js';
import type { GeocodeResult } from './place.js';
import { normalizeText } from './text.js';

function stopResult(stop: Stop, at: LatLon): GeocodeResult {
  return {
    label: stop.name,
    secondary: stop.code ? `Parada ${stop.code}` : 'Parada',
    lat: at.lat,
    lon: at.lon,
    kind: 'stop',
  };
}

/** Búsqueda de paradas de la red por nombre/código y por proximidad. */
export class StopSearchIndex {
  private readonly names: { idx: number; norm: string }[];

  constructor(private readonly network: TransitNetwork) {
    // Solo paradas con salidas: las que realmente se pueden usar en el cálculo.
    this.names = network.stops
      .map((s, idx) => ({ idx, norm: normalizeText(`${s.name} ${s.code}`) }))
      .filter(({ idx }) => network.stopDepartures[idx].length > 0);
  }

  /** Paradas que contienen todas las palabras de la consulta. */
  search(query: string, limit: number): GeocodeResult[] {
    const tokens = normalizeText(query).split(' ').filter(Boolean);
    if (tokens.length === 0 || limit <= 0) return [];
    const found: GeocodeResult[] = [];
    for (const { idx, norm } of this.names) {
      if (!tokens.every((t) => norm.includes(t))) continue;
      const s = this.network.stops[idx];
      found.push(stopResult(s, s));
      if (found.length >= limit) break;
    }
    return found;
  }

  /** Parada más cercana al punto (a menos de maxMeters), con las coordenadas del propio punto. */
  nearest(point: LatLon, maxMeters: number): GeocodeResult | null {
    const near = this.network.spatial.within(point.lat, point.lon, maxMeters)[0];
    return near ? stopResult(this.network.stops[near.idx], point) : null;
  }
}
