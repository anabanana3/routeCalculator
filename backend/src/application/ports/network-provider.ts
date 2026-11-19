import type { TransitNetwork } from '../../domain/network/model.js';

/** Acceso de solo lectura a la red de transporte cargada en este momento. */
export interface NetworkProvider {
  readonly current: TransitNetwork | null;
}
