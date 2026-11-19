import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GtfsFeedSource } from '../src/application/ports/gtfs-feed-source.js';
import { loadConfig } from '../src/infrastructure/config/env-config.js';
import { NominatimProvider } from '../src/infrastructure/geocoding/nominatim-provider.js';
import { PhotonProvider } from '../src/infrastructure/geocoding/photon-provider.js';
import { HttpGtfsFeedSource } from '../src/infrastructure/gtfs/http-feed-source.js';
import { LocalGtfsFeedSource } from '../src/infrastructure/gtfs/local-feed-source.js';
import { compose, createFeedSource, createGeocoder, type RunningServer, startServer } from '../src/main.js';
import { fakeGeocoder, fakeLogger, place } from './fixtures/fakes.js';
import { MemoryTableSource, near, STOPS, TABLES } from './fixtures/network.js';

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
