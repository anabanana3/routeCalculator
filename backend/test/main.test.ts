import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GtfsFeedSource } from '../src/application/ports/gtfs-feed-source.js';
import type { RealtimeFeedSource } from '../src/application/ports/realtime-feed-source.js';
import { loadConfig } from '../src/infrastructure/config/env-config.js';
import { NominatimProvider } from '../src/infrastructure/geocoding/nominatim-provider.js';
import { PhotonProvider } from '../src/infrastructure/geocoding/photon-provider.js';
import { HttpGtfsFeedSource } from '../src/infrastructure/gtfs/http-feed-source.js';
import { LocalGtfsFeedSource } from '../src/infrastructure/gtfs/local-feed-source.js';
import { HttpRealtimeFeedSource } from '../src/infrastructure/gtfs-realtime/http-realtime-source.js';
import { compose, createFeedSource, createGeocoder, createRealtimeSources, type RunningServer, startServer } from '../src/main.js';
import { fakeGeocoder, fakeLogger, place } from './fixtures/fakes.js';
import { MemoryTableSource, near, STOPS, TABLES } from './fixtures/network.js';
import { feed, tripUpdate, vehicle } from './fixtures/realtime.js';

const SAMPLE_GTFS = path.resolve(import.meta.dirname, '../data/gtfs-sample');

function memorySource(): GtfsFeedSource {
  return { kind: 'local', fetch: async () => new MemoryTableSource(TABLES) };
}

const quietLogs = () => fakeLogger();

let running: RunningServer | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function waitLoaded(r: RunningServer) {
  await vi.waitFor(() => expect(r.store.current).not.toBeNull(), { timeout: 10_000 });
}

describe('createFeedSource / createGeocoder', () => {
  it('elige el origen GTFS según la configuración', () => {
    expect(createFeedSource(loadConfig({}), fakeLogger())).toBeInstanceOf(LocalGtfsFeedSource);
    expect(
      createFeedSource(loadConfig({ GTFS_SOURCE: 'url', GTFS_URL: 'https://example.com/gtfs.zip' }), fakeLogger()),
    ).toBeInstanceOf(HttpGtfsFeedSource);
  });

  it('elige el geocodificador según la configuración', () => {
    expect(createGeocoder(loadConfig({}).geocoding)).toBeInstanceOf(PhotonProvider);
    expect(createGeocoder(loadConfig({ GEOCODER_PROVIDER: 'nominatim' }).geocoding)).toBeInstanceOf(NominatimProvider);
  });

  it('crea un origen GTFS-Realtime por URL distinta', () => {
    expect(createRealtimeSources(loadConfig({}).realtime)).toEqual([]);
    const sources = createRealtimeSources(
      loadConfig({
        GTFS_RT_TRIP_UPDATES_URL: 'https://rt.example/all',
        GTFS_RT_VEHICLE_POSITIONS_URL: 'https://rt.example/vp',
        GTFS_RT_ALERTS_URL: 'https://rt.example/all',
      }).realtime,
    );
    expect(sources.map((s) => s.name)).toEqual(['tripUpdates+alerts', 'vehiclePositions']);
    expect(sources[0]).toBeInstanceOf(HttpRealtimeFeedSource);
  });
});

describe('startServer con GTFS-Realtime', () => {
  it('aplica los retrasos y sirve las posiciones de los vehículos', async () => {
    const logs = fakeLogger();
    const rt: RealtimeFeedSource = {
      name: 'tripUpdates+vehiclePositions',
      fetch: async () =>
        feed([tripUpdate('T1', { delay: 120 })], {
          vehicles: [vehicle('v1', { trip: { tripId: 'T1', scheduleRelationship: 'SCHEDULED' } })],
        }),
    };
    running = await startServer(
      loadConfig({ PORT: '0', HOST: '127.0.0.1', GTFS_REFRESH_MINUTES: '0', GTFS_RT_MAX_AGE_SECONDS: '0' }),
      { feedSource: memorySource(), geocoder: fakeGeocoder(), realtimeSources: [rt], loggerFactory: () => logs },
    );
    expect(logs.info).toHaveBeenCalledWith(expect.stringContaining('GTFS-Realtime activo (tripUpdates+vehiclePositions)'));
    await waitLoaded(running);
    await running.realtime.refresh();
    const base = `http://127.0.0.1:${running.port}`;

    const res = await fetch(`${base}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: near(STOPS.A), to: near(STOPS.E), dateTime: '2026-03-02T07:55:00+01:00' }),
    });
    const plan = await res.json();
    expect(plan.realtimeUpdatedAt).toBeDefined();
    const bus = plan.itineraries.flatMap((it: { legs: { tripId?: string }[] }) => it.legs).find((l: { tripId?: string }) => l.tripId === 'T1');
    expect(bus.realtime).toMatchObject({ departureDelaySeconds: 120 });

    const vehicles = await (await fetch(`${base}/api/realtime/vehicles?tripIds=T1`)).json();
    expect(vehicles).toEqual({ vehicles: [{ tripId: 'T1', lat: 40.4, lon: -3.697 }] });

    const info = await (await fetch(`${base}/api/gtfs`)).json();
    expect(info.realtime).toMatchObject({ enabled: true, feeds: [{ name: 'tripUpdates+vehiclePositions', stale: false }] });
  });

  it('avisa si no está configurado', async () => {
    const logs = fakeLogger();
    running = await startServer(loadConfig({ PORT: '0', HOST: '127.0.0.1', GTFS_REFRESH_MINUTES: '0' }), {
      feedSource: memorySource(),
      geocoder: fakeGeocoder(),
      loggerFactory: () => logs,
    });
    expect(logs.info).toHaveBeenCalledWith(expect.stringContaining('GTFS-Realtime no configurado'));
  });
});

describe('compose', () => {
  it('conecta los casos de uso con la red cargada y vacía cachés al recargar', async () => {
    const geocoder = fakeGeocoder([], place('Calle'));
    const { store } = compose(loadConfig({}), { feedSource: memorySource(), geocoder, loggerFactory: quietLogs });
    await store.reload();
    expect(store.current?.stops.length).toBe(8);
  });
});

describe('startServer', () => {
  it('sirve la API completa sobre el GTFS de ejemplo del repositorio', async () => {
    const cache = mkdtempSync(path.join(tmpdir(), 'gtfs-main-'));
    try {
      const cfg = loadConfig({
        PORT: '0',
        HOST: '127.0.0.1',
        GTFS_LOCAL_PATH: SAMPLE_GTFS,
        GTFS_CACHE_DIR: cache,
        GTFS_REFRESH_MINUTES: '0',
      });
      running = await startServer(cfg, { geocoder: fakeGeocoder(), loggerFactory: quietLogs });
      await waitLoaded(running);
      const base = `http://127.0.0.1:${running.port}`;
      const info = await (await fetch(`${base}/api/gtfs`)).json();
      expect(info).toMatchObject({ loaded: true, timezone: 'Europe/Madrid', agencies: ['Transportes Demo'] });

      // Príncipe Pío -> Retiro un lunes por la mañana.
      const res = await fetch(`${base}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { lat: 40.421, lon: -3.7203 },
          to: { lat: 40.42, lon: -3.6833 },
          dateTime: '2026-03-02T10:00:00+01:00',
        }),
      });
      expect(res.status).toBe(200);
      const plan = await res.json();
      expect(plan.itineraries.length).toBeGreaterThan(0);
      expect(plan.itineraries[0].legs.some((l: { route?: { shortName: string } }) => l.route?.shortName === '1')).toBe(true);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

  it('responde 503 mientras el GTFS no está cargado', async () => {
    let release!: () => void;
    const slow: GtfsFeedSource = {
      kind: 'local',
      fetch: () => new Promise((r) => (release = () => r(new MemoryTableSource(TABLES)))),
    };
    running = await startServer(loadConfig({ PORT: '0', HOST: '127.0.0.1', GTFS_REFRESH_MINUTES: '0' }), {
      feedSource: slow,
      geocoder: fakeGeocoder(),
      loggerFactory: quietLogs,
    });
    const base = `http://127.0.0.1:${running.port}`;
    const body = JSON.stringify({ from: near(STOPS.A), to: near(STOPS.E) });
    const headers = { 'Content-Type': 'application/json' };
    expect((await fetch(`${base}/api/plan`, { method: 'POST', body, headers })).status).toBe(503);
    release();
    await waitLoaded(running);
    expect((await fetch(`${base}/api/plan`, { method: 'POST', body, headers })).status).toBe(200);
  });

  it('avisa en el log de configuraciones delicadas', async () => {
    const logs = fakeLogger();
    running = await startServer(
      loadConfig({ PORT: '0', HOST: '127.0.0.1', DEBUG_IGNORE_CALENDAR: 'true', CORS_ORIGINS: '*', GTFS_REFRESH_MINUTES: '0' }),
      { feedSource: memorySource(), geocoder: fakeGeocoder(), loggerFactory: () => logs },
    );
    const warnings = logs.warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warnings).toContain('DEBUG_IGNORE_CALENDAR');
    expect(warnings).toContain('CORS_ORIGINS=*');
    expect(logs.info).toHaveBeenCalledWith(expect.stringContaining('ADMIN_TOKEN vacío'));
  });

  it('falla si el puerto está ocupado', async () => {
    running = await startServer(loadConfig({ PORT: '0', HOST: '127.0.0.1', GTFS_REFRESH_MINUTES: '0' }), {
      feedSource: memorySource(),
      geocoder: fakeGeocoder(),
      loggerFactory: quietLogs,
    });
    await expect(
      startServer(loadConfig({ PORT: String(running.port), HOST: '127.0.0.1', GTFS_REFRESH_MINUTES: '0' }), {
        feedSource: memorySource(),
        geocoder: fakeGeocoder(),
        loggerFactory: quietLogs,
      }),
    ).rejects.toThrow(/EADDRINUSE/);
  });
});
