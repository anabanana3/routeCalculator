import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GtfsFeedSource } from '../../../src/application/ports/gtfs-feed-source.js';
import { TransitNetworkStore } from '../../../src/application/services/transit-network-store.js';
import type { GtfsTableSource } from '../../../src/domain/network/gtfs-table-source.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { BUILD_OPTIONS, buildTestNetwork, MemoryTableSource, TABLES } from '../../fixtures/network.js';
import { fakeLogger } from '../../fixtures/fakes.js';

const tables = new MemoryTableSource(TABLES);

function source(result: () => Promise<GtfsTableSource | null>): GtfsFeedSource & { fetch: ReturnType<typeof vi.fn> } {
  return { kind: 'local', fetch: vi.fn(result) };
}

function store(src: GtfsFeedSource, extra: Partial<ConstructorParameters<typeof TransitNetworkStore>[0]> = {}) {
  return new TransitNetworkStore({
    source: src,
    buildOptions: BUILD_OPTIONS,
    refreshMinutes: 0,
    logger: fakeLogger(),
    now: () => new Date('2026-03-01T10:00:00Z'),
    ...extra,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TransitNetworkStore', () => {
  it('empieza sin red', () => {
    const s = store(source(async () => tables));
    expect(s.current).toBeNull();
    expect(s.status()).toEqual({
      loaded: false,
      loading: false,
      source: 'local',
      refreshMinutes: 0,
      lastLoadedAt: undefined,
      lastCheckedAt: undefined,
      lastError: undefined,
    });
  });

  it('carga la red y avisa a los suscriptores', async () => {
    const s = store(source(async () => tables));
    const listener = vi.fn();
    s.onLoad(listener);
    await s.reload();
    expect(s.current).not.toBeNull();
    expect(s.current!.stops.length).toBe(8);
    expect(listener).toHaveBeenCalledWith(s.current);
    expect(s.status()).toMatchObject({ loaded: true, loading: false, lastCheckedAt: new Date('2026-03-01T10:00:00Z') });
  });

  it('pasa force y hasCurrent al origen', async () => {
    const src = source(async () => tables);
    const s = store(src);
    await s.reload();
    await s.reload(true);
    expect(src.fetch).toHaveBeenNthCalledWith(1, { force: false, hasCurrent: false });
    expect(src.fetch).toHaveBeenNthCalledWith(2, { force: true, hasCurrent: true });
  });

  it('mantiene la red actual si el origen no ha cambiado', async () => {
    let first = true;
    const src = source(async () => {
      if (first) {
        first = false;
        return tables;
      }
      return null;
    });
    const logger = fakeLogger();
    const s = store(src, { logger });
    await s.reload();
    const before = s.current;
    await s.reload();
    expect(s.current).toBe(before);
    expect(logger.info).toHaveBeenCalledWith('El feed GTFS no ha cambiado, se mantiene el actual');
  });

  it('registra el error y conserva la red anterior', async () => {
    let fail = false;
    const src = source(async () => {
      if (fail) throw new Error('No existe la ruta GTFS local: /secreto');
      return tables;
    });
    const logger = fakeLogger();
    const s = store(src, { logger });
    await s.reload();
    const before = s.current;
    fail = true;
    await s.reload();
    expect(s.current).toBe(before);
    expect(s.status().lastError).toBe('No existe la ruta GTFS local: /secreto');
    expect(logger.error).toHaveBeenCalled();
    fail = false;
    await s.reload();
    expect(s.status().lastError).toBeUndefined();
  });

  it('no lanza dos recargas a la vez', async () => {
    let release!: () => void;
    const src = source(() => new Promise((r) => (release = () => r(tables))));
    const s = store(src);
    const first = s.reload();
    expect(s.status().loading).toBe(true);
    expect(await s.reload()).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(src.fetch).toHaveBeenCalledTimes(1);
  });

  it('un suscriptor que falla no impide avisar a los demás', async () => {
    const logger = fakeLogger();
    const s = store(source(async () => tables), { logger });
    const ok = vi.fn();
    s.onLoad(() => {
      throw new Error('boom');
    });
    s.onLoad(ok);
    await s.reload();
    expect(ok).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Error en un suscriptor de carga del GTFS', expect.any(Error));
  });

  it('usa el constructor de red inyectado', async () => {
    const network = (await buildTestNetwork()) as TransitNetwork;
    const build = vi.fn(async () => network);
    const s = store(source(async () => tables), { build });
    await s.reload();
    expect(s.current).toBe(network);
    expect(build).toHaveBeenCalledWith(tables, expect.objectContaining({ maxTransferMeters: 300, log: expect.any(Function) }));
  });

  it('start carga y programa recargas periódicas; stop las cancela', async () => {
    vi.useFakeTimers();
    const src = source(async () => tables);
    const s = store(src, { refreshMinutes: 10 });
    await s.start();
    expect(src.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(src.fetch).toHaveBeenCalledTimes(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(src.fetch).toHaveBeenCalledTimes(2);
  });

  it('sin refresco no programa recargas', async () => {
    vi.useFakeTimers();
    const src = source(async () => tables);
    const s = store(src, { refreshMinutes: 0 });
    await s.start();
    await vi.advanceTimersByTimeAsync(24 * 3600_000);
    expect(src.fetch).toHaveBeenCalledTimes(1);
    s.stop();
  });
});
