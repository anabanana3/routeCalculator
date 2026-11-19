import { GeolocationError, type GeolocationService } from '../../application/ports/geolocation';

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 };

/** Geolocalización del navegador (solo funciona en localhost o con HTTPS). */
export function createBrowserGeolocation(geo: Geolocation | undefined = globalThis.navigator?.geolocation): GeolocationService {
  return {
    getCurrentPosition: () =>
      new Promise((resolve, reject) => {
        if (!geo) {
          reject(new GeolocationError('unsupported'));
          return;
        }
        geo.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          (err) => reject(new GeolocationError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
          OPTIONS,
        );
      }),
  };
}
