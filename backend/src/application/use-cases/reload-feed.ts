import type { TransitNetworkStore } from '../services/transit-network-store.js';

export type ReloadOutcome = 'started' | 'already-running';

/** Caso de uso: forzar la recarga del feed GTFS (en segundo plano). */
export class ReloadFeedUseCase {
  constructor(private readonly store: Pick<TransitNetworkStore, 'reload' | 'status'>) {}

  execute(): ReloadOutcome {
    if (this.store.status().loading) return 'already-running';
    void this.store.reload(true);
    return 'started';
  }
}
