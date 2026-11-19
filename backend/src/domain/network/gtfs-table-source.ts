export type Row = Record<string, string | undefined>;

/**
 * Acceso fila a fila a las tablas de un feed GTFS (agency, stops, stop_times...).
 * El dominio no sabe si vienen de CSV, de un zip o de memoria.
 */
export interface GtfsTableSource {
  /** Recorre la tabla indicada (sin extensión) y devuelve el número de filas. 0 si no existe. */
  forEach(table: string, cb: (row: Row) => void): Promise<number>;
}

export async function readAll(source: GtfsTableSource, table: string): Promise<Row[]> {
  const rows: Row[] = [];
  await source.forEach(table, (r) => rows.push(r));
  return rows;
}
