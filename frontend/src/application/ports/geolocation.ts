import type { LatLon } from '../../domain/types/api';
import type { GeolocationFailure } from '../../domain/trip-search';

export class GeolocationError extends Error {
  constructor(readonly reason: GeolocationFailure) {
    super(reason);
    this.name = 'GeolocationError';
  }
}

/** Ubicación actual del usuario. Rechaza con GeolocationError. */
export interface GeolocationService {
  getCurrentPosition(): Promise<LatLon>;
}
