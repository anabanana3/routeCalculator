import type { Bounds } from '../../domain/geo/geo.js';
import type { NetworkStatus, TransitNetworkStore } from '../services/transit-network-store.js';

export interface FeedInfo {
  status: NetworkStatus;
  timezone?: string;
  agencies: string[];
  stats?: { stops: number; routes: number; trips: number; connections: number };
  bounds?: Bounds;
  ignoreServiceCalendar: boolean;
}

/** Caso de uso: estado y estadísticas del feed GTFS cargado. */
export class GetFeedInfoUseCase {
  constructor(
    private readonly store: Pick<TransitNetworkStore, 'current' | 'status'>,
    private readonly ignoreServiceCalendar: boolean,
  ) {}

  execute(): FeedInfo {
    const network = this.store.current;
    return {
      status: this.store.status(),
      timezone: network?.timezone,
      agencies: network?.agencies.map((a) => a.name) ?? [],
      stats: network
        ? {
            stops: network.stops.length,
            routes: network.routes.length,
            trips: network.trips.length,
            connections: network.connections.count,
          }
        : undefined,
      bounds: network?.bounds ?? undefined,
      ignoreServiceCalendar: this.ignoreServiceCalendar,
    };
  }
}
