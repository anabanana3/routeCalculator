import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkNotLoadedError } from '../../../src/application/errors.js';
import type { FeedInfo } from '../../../src/application/use-cases/get-feed-info.js';
import type { TripPlan } from '../../../src/domain/routing/itinerary.js';
import type { AppConfig } from '../../../src/infrastructure/config/env-config.js';
import { corsOptions, createApp, type HttpDependencies } from '../../../src/interfaces/http/app.js';
import { listen } from '../../fixtures/http.js';
import { place } from '../../fixtures/fakes.js';

const SECURITY: AppConfig['security'] = {
  corsOrigins: [],
  adminToken: 'token-de-administracion-123',
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1000,
  trustProxy: false,
};

const FEED_INFO: FeedInfo = {
  status: { loaded: true, loading: false, source: 'local', refreshMinutes: 0 },
  timezone: 'Europe/Madrid',
  agencies: ['A'],
  ignoreServiceCalendar: false,
};

const PLAN: TripPlan = {
  requestedAt: Date.parse('2026-03-02T07:00:00Z'),
  timezone: 'Europe/Madrid',
  itineraries: [],
  noRouteReason: 'NO_ROUTE_FOUND',
};

function deps(overrides: Partial<HttpDependencies> = {}) {
  return {
    planTrip: { execute: vi.fn(() => ({ plan: PLAN, computeMs: 7 })) },
    getFeedInfo: { execute: vi.fn(() => FEED_INFO) },
    reloadFeed: { execute: vi.fn(() => 'started' as const) },
    searchPlaces: { execute: vi.fn(async () => ({ results: [place('Sol', { secondary: 'Madrid' })] })) },
    reverseGeocode: { execute: vi.fn(async () => place('Gran Vía')) },
    security: SECURITY,
    ...overrides,
  };
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function start(d = deps()) {
  const s = await listen(createApp(d));
  close = s.close;
  return { url: s.url, d };
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const p = { lat: 40.4, lon: -3.7 };

describe('GET /api/health y /api/gtfs', () => {
  it('health indica si la red está cargada', async () => {
    const { url } = await start();
    expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ status: 'ok', gtfsLoaded: true });
  });

  it('gtfs devuelve el DTO público', async () => {
    const { url } = await start();
    const body = await (await fetch(`${url}/api/gtfs`)).json();
    expect(body).toMatchObject({ loaded: true, source: 'local', timezone: 'Europe/Madrid', agencies: ['A'] });
  });
});

describe('POST /api/gtfs/reload', () => {
  it('exige token de administración', async () => {
    const { url, d } = await start();
    expect((await fetch(`${url}/api/gtfs/reload`, { method: 'POST' })).status).toBe(401);
    expect(d.reloadFeed.execute).not.toHaveBeenCalled();
  });

  it('con token lanza la recarga', async () => {
    const { url, d } = await start();
    const res = await fetch(`${url}/api/gtfs/reload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECURITY.adminToken}` },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'reloading' });
    expect(d.reloadFeed.execute).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/plan', () => {
  it('valida y llama al caso de uso', async () => {
    const { url, d } = await start();
    const res = await fetch(`${url}/api/plan`, json({ from: p, to: p, dateTime: '2026-03-02T08:00:00+01:00' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-compute-time-ms')).toBe('7');
    expect(await res.json()).toEqual({
      requestedDateTime: '2026-03-02T07:00:00.000Z',
      timezone: 'Europe/Madrid',
      itineraries: [],
      message: 'No se ha encontrado ninguna ruta en transporte público',
    });
    expect(d.planTrip.execute).toHaveBeenCalledWith({ from: p, to: p, dateTime: '2026-03-02T08:00:00+01:00' });
  });

  it('400 con peticiones inválidas', async () => {
    const { url, d } = await start();
    const res = await fetch(`${url}/api/plan`, json({ from: p }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Petición no válida');
    expect(body.issues[0]).toEqual({ path: 'to', message: expect.any(String) });
    expect(d.planTrip.execute).not.toHaveBeenCalled();
  });

  it('503 si la red no está cargada', async () => {
    const { url } = await start(
      deps({
        planTrip: {
          execute: () => {
            throw new NetworkNotLoadedError();
          },
        },
      }),
    );
    expect((await fetch(`${url}/api/plan`, json({ from: p, to: p }))).status).toBe(503);
  });

  it('413 con cuerpos mayores de 10 KB', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/api/plan`, json({ from: p, to: p, pad: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
  });

  it('ignora cuerpos que no son JSON', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/api/plan`, { method: 'POST', body: 'from=1', headers: { 'Content-Type': 'text/plain' } });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/geocode/*', () => {
  it('search valida y devuelve resultados', async () => {
    const { url, d } = await start();
    const res = await fetch(`${url}/api/geocode/search?q=sol&lat=40.4&lon=-3.7&limit=3`);
    expect(await res.json()).toEqual({ results: [{ label: 'Sol', secondary: 'Madrid', lat: 1, lon: 2, kind: 'address' }] });
    expect(d.searchPlaces.execute).toHaveBeenCalledWith({ q: 'sol', limit: 3, focus: p });
  });

  it('search sin foco completo no envía foco', async () => {
    const { url, d } = await start();
    await fetch(`${url}/api/geocode/search?q=sol&lat=40.4`);
    expect(d.searchPlaces.execute).toHaveBeenCalledWith({ q: 'sol', limit: 6, focus: undefined });
  });

  it('search incluye el aviso del caso de uso', async () => {
    const { url } = await start(deps({ searchPlaces: { execute: async () => ({ results: [], warning: 'aviso' }) } }));
    expect(await (await fetch(`${url}/api/geocode/search?q=sol`)).json()).toEqual({ results: [], warning: 'aviso' });
  });

  it('search 400 con parámetros inválidos', async () => {
    const { url } = await start();
    expect((await fetch(`${url}/api/geocode/search?q=a`)).status).toBe(400);
    expect((await fetch(`${url}/api/geocode/search?q=sol&q=mayor`)).status).toBe(400);
  });

  it('reverse devuelve el resultado o null', async () => {
    const { url, d } = await start();
    expect(await (await fetch(`${url}/api/geocode/reverse?lat=40.4&lon=-3.7`)).json()).toEqual({
      result: { label: 'Gran Vía', lat: 1, lon: 2, kind: 'address' },
    });
    expect(d.reverseGeocode.execute).toHaveBeenCalledWith(p);
    const { url: url2 } = await (async () => {
      await close!();
      return start(deps({ reverseGeocode: { execute: async () => null } }));
    })();
    expect(await (await fetch(`${url2}/api/geocode/reverse?lat=0&lon=0`)).json()).toEqual({ result: null });
  });

  it('reverse 400 con parámetros inválidos', async () => {
    const { url } = await start();
    expect((await fetch(`${url}/api/geocode/reverse?lat=abc&lon=0`)).status).toBe(400);
  });

  it('errores inesperados del caso de uso -> 500', async () => {
    const { url } = await start(deps({ searchPlaces: { execute: async () => Promise.reject(new Error('boom')) } }));
    expect((await fetch(`${url}/api/geocode/search?q=sol`)).status).toBe(500);
  });
});

describe('seguridad de la app', () => {
  it('no anuncia Express y añade cabeceras de seguridad', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/api/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sin CORS_ORIGINS no permite peticiones de otros orígenes', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/api/health`, { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('con CORS_ORIGINS solo permite los orígenes configurados', async () => {
    const { url } = await start(deps({ security: { ...SECURITY, corsOrigins: ['https://app.example'] } }));
    const ok = await fetch(`${url}/api/health`, { headers: { Origin: 'https://app.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const ko = await fetch(`${url}/api/health`, { headers: { Origin: 'https://evil.example' } });
    expect(ko.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('aplica el límite de peticiones salvo a /api/health', async () => {
    const { url } = await start(deps({ security: { ...SECURITY, rateLimitMax: 1 } }));
    expect((await fetch(`${url}/api/gtfs`)).status).toBe(200);
    expect((await fetch(`${url}/api/gtfs`)).status).toBe(429);
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
  });

  it('rutas desconocidas -> 404', async () => {
    const { url } = await start();
    expect((await fetch(`${url}/api/nada`)).status).toBe(404);
    expect((await fetch(`${url}/`)).status).toBe(404);
  });
});

describe('corsOptions', () => {
  it('traduce la lista de orígenes', () => {
    expect(corsOptions([]).origin).toBe(false);
    expect(corsOptions(['*']).origin).toBe(true);
    expect(corsOptions(['https://a.com']).origin).toEqual(['https://a.com']);
  });
});
