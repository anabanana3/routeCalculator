import { describe, expect, it, vi } from 'vitest';
import type { RealtimeFeedSource } from '../../../src/application/ports/realtime-feed-source.js';
import { MAX_BACKOFF_MS, RealtimeStore, type RealtimeStoreDeps } from '../../../src/application/services/realtime-store.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import type { RealtimeFeed } from '../../../src/domain/realtime/model.js';
import type { RealtimeIndex } from '../../../src/domain/realtime/realtime-index.js';
import { fakeLogger } from '../../fixtures/fakes.js';
import { feed, tripUpdate } from '../../fixtures/realtime.js';

const T0 = Date.parse('2026-03-02T08:00:00Z');
const network = {} as TransitNetwork;

function source(name: string, impl: () => Promise<RealtimeFeed | null>) {
  return { name, fetch: vi.fn(impl) } satisfies RealtimeFeedSource;
}

function setup(sources: RealtimeFeedSource[], extra: Partial<RealtimeStoreDeps> = {}) {
  const clock = { now: T0 };
  const logger = fakeLogger();
  const build = vi.fn(
    (_n: TransitNetwork, feeds: RealtimeFeed[]) => ({ feeds, instances: [], vehicles: new Map(), alerts: [] }) as unknown as RealtimeIndex,
  );
  const store = new RealtimeStore({
    sources,
    refreshSeconds: 30,
    idleMinutes: 10,
    maxAgeSeconds: 300,
    logger,
    now: () => clock.now,
    build,
    ...extra,
  });
  return { store, clock, logger, build };
}

const fresh = (ts = T0 / 1000) => feed([tripUpdate('T1')], { timestamp: ts });

describe('RealtimeStore', () => {
  it('sin orígenes está deshabilitado y no hace nada', async () => {
    const { store } = setup([]);
    expect(store.enabled).toBe(false);
    store.start();
    await store.awaitFresh();
    expect(store.indexFor(network)).toBeNull();
    expect(store.status()).toEqual({ enabled: false, refreshSeconds: 30, paused: false, feeds: [] });
    store.stop();
  });

  it('descarga los feeds y cruza los vigentes con la red (cacheando el resultado)', async () => {
    const a = source('tripUpdates', async () => fresh());
    const b = source('alerts', async () => feed([], { timestamp: T0 / 1000 - 10 }));
    const { store, build } = setup([a, b]);
    expect(store.indexFor(network)).toBeNull();
    await store.refresh();
    const index = store.indexFor(network);
    expect(index).not.toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][1]).toHaveLength(2);
    expect(store.indexFor(network)).toBe(index);
    // Otra red: se vuelve a cruzar.
    store.indexFor({} as TransitNetwork);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('comparte la descarga en curso', async () => {
    const a = source('tu', async () => fresh());
    const { store } = setup([a]);
    const p1 = store.refresh();
    const p2 = store.refresh();
    expect(p1).toBe(p2);
    await p1;
    expect(a.fetch).toHaveBeenCalledTimes(1);
  });

  it('mantiene los datos si el feed no cambia (304 o mismo timestamp)', async () => {
    let next: RealtimeFeed | null = fresh(1000);
    const a = source('tu', async () => next);
    const { store, build, clock } = setup([a], { maxAgeSeconds: 0 });
    await store.refresh();
    store.indexFor(network);
    next = null;
    await store.refresh();
    next = feed([], { timestamp: 1000 });
    await store.refresh();
    store.indexFor(network);
    expect(build).toHaveBeenCalledTimes(1);
    next = feed([], { timestamp: 1001 });
    clock.now += 1000;
    await store.refresh();
    store.indexFor(network);
    expect(build).toHaveBeenCalledTimes(2);
    expect(store.status().feeds[0]).toMatchObject({ entities: 0, stale: false, lastUpdatedAt: new Date(T0 + 1000) });
  });

  it('descarta los datos más antiguos que maxAgeSeconds', async () => {
    const a = source('tu', async () => fresh());
    const b = source('sin-ts', async () => feed([tripUpdate('T2')]));
    const { store, clock, build } = setup([a, b]);
    await store.refresh();
    clock.now += 200_000;
    store.indexFor(network);
    expect(build.mock.calls.at(-1)![1]).toHaveLength(2);
    clock.now += 101_000;
    expect(store.indexFor(network)).toBeNull();
    expect(store.status().feeds.map((f) => f.stale)).toEqual([true, true]);
  });

  it('ante errores reintenta con espera exponencial', async () => {
    let fail = true;
    const a = source('tu', async () => {
      if (fail) throw new Error('HTTP 500');
      return fresh();
    });
    const { store, clock, logger } = setup([a]);
    await store.refresh();
    expect(store.status().feeds[0]).toMatchObject({ failures: 1, lastError: 'HTTP 500', stale: true });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('siguiente intento en 60s'));
    clock.now += 30_000;
    await store.refresh();
    expect(a.fetch).toHaveBeenCalledTimes(1);
    clock.now += 30_000;
    await store.refresh();
    expect(a.fetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenLastCalledWith(expect.stringContaining('siguiente intento en 120s'));
    fail = false;
    clock.now += MAX_BACKOFF_MS;
    await store.refresh();
    expect(store.status().feeds[0]).toMatchObject({ failures: 0, lastError: undefined });
  });

  it('limita la espera entre reintentos', async () => {
    const a = source('tu', async () => Promise.reject('caído'));
    const { store, clock, logger } = setup([a]);
    for (let i = 0; i < 8; i++) {
      await store.refresh();
      clock.now += MAX_BACKOFF_MS;
    }
    expect(logger.warn).toHaveBeenLastCalledWith(expect.stringContaining(`${MAX_BACKOFF_MS / 1000}s`));
    expect(store.status().feeds[0].lastError).toBe('caído');
  });

  it('se pausa sin actividad y se reanuda con la siguiente petición', async () => {
    const a = source('tu', async () => fresh(Math.floor(clock.now / 1000)));
    const { store, clock, logger } = setup([a]);
    await store.tick();
    expect(a.fetch).toHaveBeenCalledTimes(1);
    clock.now += 11 * 60_000;
    await store.tick();
    await store.tick();
    expect(a.fetch).toHaveBeenCalledTimes(1);
    expect(store.status().paused).toBe(true);
    expect(logger.info).toHaveBeenCalledTimes(1);

    // La petición que despierta espera a la descarga.
    await store.awaitFresh();
    expect(a.fetch).toHaveBeenCalledTimes(2);
    expect(store.status().paused).toBe(false);
    expect(store.indexFor(network)).not.toBeNull();
    await store.tick();
    expect(a.fetch).toHaveBeenCalledTimes(3);
  });

  it('touch sin pausa no descarga', () => {
    const a = source('tu', async () => fresh());
    const { store } = setup([a]);
    expect(store.touch()).toBe(false);
    expect(a.fetch).not.toHaveBeenCalled();
  });

  it('awaitFresh no espera si ya hay datos vigentes', async () => {
    let release!: (f: RealtimeFeed) => void;
    const a = source('tu', () => new Promise((r) => (release = r)));
    const { store } = setup([a]);
    const first = store.refresh();
    release(fresh());
    await first;
    const second = store.refresh();
    await store.awaitFresh(); // no se queda esperando a "second"
    release(fresh());
    await second;
  });

  it('awaitFresh espera como mucho maxWaitMs', async () => {
    const a = source('tu', () => new Promise<RealtimeFeed>(() => {}));
    const { store } = setup([a]);
    void store.refresh();
    const started = Date.now();
    await store.awaitFresh(20);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('con idleMinutes=0 nunca se pausa', async () => {
    const a = source('tu', async () => fresh());
    const { store, clock } = setup([a], { idleMinutes: 0 });
    clock.now += 24 * 3600_000;
    await store.tick();
    expect(a.fetch).toHaveBeenCalledTimes(1);
  });

  it('start programa el refresco periódico y stop lo detiene', async () => {
    vi.useFakeTimers();
    try {
      const a = source('tu', async () => fresh());
      const { store } = setup([a], { idleMinutes: 0 });
      store.start();
      store.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(a.fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(a.fetch).toHaveBeenCalledTimes(2);
      store.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(a.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('status describe cada feed', async () => {
    const a = source('tripUpdates+alerts', async () => fresh());
    const { store } = setup([a]);
    await store.refresh();
    expect(store.status()).toEqual({
      enabled: true,
      refreshSeconds: 30,
      paused: false,
      feeds: [
        {
          name: 'tripUpdates+alerts',
          lastCheckedAt: new Date(T0),
          lastUpdatedAt: new Date(T0),
          feedTimestamp: new Date(T0),
          entities: 1,
          stale: false,
          failures: 0,
          lastError: undefined,
        },
      ],
    });
  });
});
