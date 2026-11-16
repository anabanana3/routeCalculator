import { createReadStream, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';

export type Row = Record<string, string | undefined>;

/** Acceso a los ficheros .txt de un feed GTFS ya descomprimido en una carpeta. */
export class GtfsDirectory {
  constructor(readonly dir: string) {}

  private file(name: string): string {
    return path.join(this.dir, `${name}.txt`);
  }

  has(name: string): boolean {
    return existsSync(this.file(name));
  }

  /** Recorre un fichero fila a fila en streaming (apto para stop_times grandes). */
  async forEach(name: string, cb: (row: Row) => void): Promise<number> {
    if (!this.has(name)) return 0;
    const parser = createReadStream(this.file(name)).pipe(
      parse({
        columns: (header: string[]) => header.map((h) => h.trim()),
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      }),
    );
    let count = 0;
    for await (const row of parser as AsyncIterable<Row>) {
      cb(row);
      count++;
    }
    return count;
  }

  async readAll(name: string): Promise<Row[]> {
    const rows: Row[] = [];
    await this.forEach(name, (r) => rows.push(r));
    return rows;
  }
}

/**
 * Busca la carpeta que contiene stops.txt (algunos zips incluyen una subcarpeta).
 */
export async function findGtfsRoot(dir: string, depth = 3): Promise<string | null> {
  if (existsSync(path.join(dir, 'stops.txt'))) return dir;
  if (depth <= 0) return null;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findGtfsRoot(path.join(dir, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}
