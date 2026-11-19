import { describe, expect, it, vi } from 'vitest';
import type { NetworkStatus } from '../../../src/application/services/transit-network-store.js';
import { GetFeedInfoUseCase } from '../../../src/application/use-cases/get-feed-info.js';
import { ReloadFeedUseCase } from '../../../src/application/use-cases/reload-feed.js';
import { buildTestNetwork } from '../../fixtures/network.js';

const status = (extra: Partial<NetworkStatus> = {}): NetworkStatus => ({
  loaded: false,
  loading: false,
  source: 'local',
  refreshMinutes: 60,
  ...extra,
});

describe('GetFeedInfoUseCase', () => {
  it('sin red devuelve solo el estado', () => {
    const uc = new GetFeedInfoUseCase({ current: null, status: () => status() }, false);
    expect(uc.execute()).toEqual({
      status: status(),
      timezone: undefined,
      agencies: [],
      stats: undefined,
      bounds: undefined,
      ignoreServiceCalendar: false,
    });
  });

  it('con red añade zona horaria, agencias, estadísticas y límites', async () => {
    const network = await buildTestNetwork();
    const uc = new GetFeedInfoUseCase({ current: network, status: () => status({ loaded: true }) }, true);
    expect(uc.execute()).toEqual({
      status: status({ loaded: true }),
      timezone: 'Europe/Madrid',
      agencies: ['Agencia Test'],
      stats: { stops: 8, routes: 3, trips: 10, connections: 17 },
      bounds: { minLat: 40.4, minLon: -3.7, maxLat: 40.41, maxLon: -3.68 },
      ignoreServiceCalendar: true,
    });
  });
});

describe('ReloadFeedUseCase', () => {
  it('lanza una recarga forzada en segundo plano', () => {
    const reload = vi.fn(async () => true);
    const uc = new ReloadFeedUseCase({ reload, status: () => status() });
    expect(uc.execute()).toBe('started');
    expect(reload).toHaveBeenCalledWith(true);
  });

  it('no lanza otra si ya hay una en curso', () => {
    const reload = vi.fn(async () => true);
    const uc = new ReloadFeedUseCase({ reload, status: () => status({ loading: true }) });
    expect(uc.execute()).toBe('already-running');
    expect(reload).not.toHaveBeenCalled();
  });
});
