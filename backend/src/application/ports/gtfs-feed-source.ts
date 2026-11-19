import type { GtfsTableSource } from '../../domain/network/gtfs-table-source.js';

export type FeedSourceKind = 'local' | 'url';

export interface FeedFetchOptions {
  /** Descargar/leer aunque no haya cambios. */
  force: boolean;
  /** Ya hay una red cargada (permite omitir la descarga si no ha cambiado o usar la caché si falla). */
  hasCurrent: boolean;
}

/** Origen de los datos GTFS (carpeta local, zip, URL...). */
export interface GtfsFeedSource {
  readonly kind: FeedSourceKind;
  /** Devuelve las tablas listas para leer, o null si el feed no ha cambiado. */
  fetch(opts: FeedFetchOptions): Promise<GtfsTableSource | null>;
}
