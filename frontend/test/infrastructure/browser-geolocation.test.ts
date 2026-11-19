import { describe, expect, it, vi } from 'vitest';
import { GeolocationError } from '../../src/application/ports/geolocation';
import { createBrowserGeolocation } from '../../src/infrastructure/geolocation/browser-geolocation';

function fakeGeo(impl: (ok: PositionCallback, ko: PositionErrorCallback) => void): Geolocation {
  return {
    getCurrentPosition: vi.fn((ok: PositionCallback, ko?: PositionErrorCallback | null) => impl(ok, ko!)),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
}

const positionError = (code: number) =>
  ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' }) as GeolocationPositionError;

describe('createBrowserGeolocation', () => {
  it('devuelve la posición actual', async () => {
    const geo = fakeGeo((ok) => ok({ coords: { latitude: 40.4, longitude: -3.7 } } as GeolocationPosition));
    expect(await createBrowserGeolocation(geo).getCurrentPosition()).toEqual({ lat: 40.4, lon: -3.7 });
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 30_000,
    });
  });

  it('permiso denegado', async () => {
    const geo = fakeGeo((_ok, ko) => ko(positionError(1)));
    await expect(createBrowserGeolocation(geo).getCurrentPosition()).rejects.toEqual(new GeolocationError('denied'));
  });

  it('posición no disponible o tiempo agotado', async () => {
    for (const code of [2, 3]) {
      const geo = fakeGeo((_ok, ko) => ko(positionError(code)));
      const err = await createBrowserGeolocation(geo).getCurrentPosition().catch((e: GeolocationError) => e);
      expect(err).toBeInstanceOf(GeolocationError);
      expect((err as GeolocationError).reason).toBe('unavailable');
    }
  });

  it('navegador sin geolocalización', async () => {
    const err = await createBrowserGeolocation(undefined).getCurrentPosition().catch((e: GeolocationError) => e);
    expect((err as GeolocationError).reason).toBe('unsupported');
  });

  it('por defecto usa navigator.geolocation', async () => {
    const geo = fakeGeo((ok) => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: geo });
    try {
      expect(await createBrowserGeolocation().getCurrentPosition()).toEqual({ lat: 1, lon: 2 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('GeolocationError', () => {
  it('guarda el motivo', () => {
    const e = new GeolocationError('denied');
    expect(e.name).toBe('GeolocationError');
    expect(e.reason).toBe('denied');
    expect(e).toBeInstanceOf(Error);
  });
});
