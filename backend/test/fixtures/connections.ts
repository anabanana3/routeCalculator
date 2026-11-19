import type { TransitNetwork } from '../../src/domain/network/model.js';
import { tripIdx } from './network.js';

/** Índice de la conexión del viaje `tripId` que sale de la posición `pos`. */
export function connOf(n: TransitNetwork, tripId: string, pos: number): number {
  const t = tripIdx(n, tripId);
  for (let c = 0; c < n.connections.count; c++) {
    if (n.connections.trip[c] === t && n.connections.pos[c] === pos) return c;
  }
  throw new Error(`Conexión ${tripId}#${pos} no encontrada`);
}

export const at = (iso: string) => Date.parse(iso);
