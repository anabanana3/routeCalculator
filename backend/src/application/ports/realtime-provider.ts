import type { TransitNetwork } from '../../domain/network/model.js';
import type { RealtimeIndex } from '../../domain/realtime/realtime-index.js';

/** Acceso a los datos en tiempo real vigentes. */
export interface RealtimeProvider {
  readonly enabled: boolean;
  /** Registra actividad de los usuarios (reanuda el refresco si estaba en pausa). */
  touch(): void;
  /** Como touch(), pero si no había datos al día espera (como mucho maxWaitMs) a la descarga. */
  awaitFresh(maxWaitMs?: number): Promise<void>;
  /** Datos en tiempo real cruzados con la red indicada (null si no hay datos vigentes). */
  indexFor(network: TransitNetwork): RealtimeIndex | null;
}

export const noRealtime: RealtimeProvider = {
  enabled: false,
  touch: () => {},
  awaitFresh: async () => {},
  indexFor: () => null,
};
