import type { PlanRequest } from './types/api';
import type { DepartMode, PointField, SelectedPlace } from './types/place';

export const CURRENT_LOCATION_LABEL = 'Tu ubicación';

export function otherField(field: PointField): PointField {
  return field === 'origin' ? 'destination' : 'origin';
}

/** Petición de cálculo, o null si falta el origen o el destino. */
export function buildPlanRequest(
  origin: SelectedPlace | null,
  destination: SelectedPlace | null,
  departMode: DepartMode,
  departAt: string,
): PlanRequest | null {
  if (!origin || !destination) return null;
  const req: PlanRequest = {
    from: { lat: origin.lat, lon: origin.lon },
    to: { lat: destination.lat, lon: destination.lon },
  };
  if (departMode === 'at') {
    const date = new Date(departAt);
    if (!Number.isNaN(date.getTime())) req.dateTime = date.toISOString();
  }
  return req;
}

/** Tras pulsar en el mapa, qué campo queda activo para el siguiente clic. */
export function nextActiveFieldAfterMapClick(
  active: PointField,
  origin: SelectedPlace | null,
  destination: SelectedPlace | null,
): PointField {
  if (active === 'origin' && !destination) return 'destination';
  if (active === 'destination' && !origin) return 'origin';
  return active;
}

export type GeolocationFailure = 'unsupported' | 'denied' | 'unavailable';

export const GEOLOCATION_MESSAGES: Record<GeolocationFailure, string> = {
  unsupported: 'El navegador no permite obtener la ubicación',
  denied: 'Permiso de ubicación denegado en el navegador',
  unavailable: 'No se ha podido obtener tu ubicación',
};
