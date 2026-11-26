import type { RealtimeFeed } from '../../domain/realtime/model.js';

/** Origen de un feed GTFS-Realtime (TripUpdates, VehiclePositions, Alerts o uno combinado). */
export interface RealtimeFeedSource {
  /** Nombre para logs y estado (nunca la URL: puede contener claves). */
  readonly name: string;
  /** Descarga y decodifica el feed. null = no ha cambiado desde la última descarga. */
  fetch(): Promise<RealtimeFeed | null>;
}
