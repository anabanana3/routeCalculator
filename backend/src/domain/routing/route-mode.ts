import type { LegMode } from './itinerary.js';

/** Traduce route_type de GTFS (básico y extendido) al modo de transporte. */
export function routeTypeToMode(type: number): LegMode {
  switch (type) {
    case 0: return 'TRAM';
    case 1: return 'SUBWAY';
    case 2: return 'RAIL';
    case 3: return 'BUS';
    case 4: return 'FERRY';
    case 5: return 'CABLE_CAR';
    case 6: return 'GONDOLA';
    case 7: return 'FUNICULAR';
    case 11: return 'TROLLEYBUS';
    case 12: return 'MONORAIL';
  }
  // Tipos extendidos (https://developers.google.com/transit/gtfs/reference/extended-route-types)
  if (type >= 100 && type < 200) return 'RAIL';
  if (type >= 400 && type < 500) return 'SUBWAY';
  if (type === 800) return 'TROLLEYBUS';
  if (type >= 900 && type < 1000) return 'TRAM';
  if (type === 1000 || type === 1200) return 'FERRY';
  if (type === 1300) return 'GONDOLA';
  if (type === 1400) return 'FUNICULAR';
  return 'BUS';
}
