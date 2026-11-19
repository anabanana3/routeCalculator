import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FeedFetchOptions, GtfsFeedSource } from '../../application/ports/gtfs-feed-source.js';
import type { GtfsTableSource } from '../../domain/network/gtfs-table-source.js';
import { CsvGtfsTableSource, findGtfsRoot } from './csv-table-source.js';
import { DEFAULT_ZIP_LIMITS, extractGtfsZip, type ZipLimits } from './zip-extractor.js';

/** Feed GTFS en una carpeta local (con los .txt) o en un fichero .zip local. */
export class LocalGtfsFeedSource implements GtfsFeedSource {
  readonly kind = 'local' as const;

  constructor(
    private readonly localPath: string,
    private readonly cacheDir: string,
    private readonly zipLimits: ZipLimits = DEFAULT_ZIP_LIMITS,
  ) {}

  async fetch(_opts: FeedFetchOptions): Promise<GtfsTableSource> {
    if (!existsSync(this.localPath)) throw new Error(`No existe la ruta GTFS local: ${this.localPath}`);
    if (statSync(this.localPath).isDirectory()) {
      const root = await findGtfsRoot(this.localPath);
      if (!root) throw new Error(`No se encontró stops.txt en ${this.localPath}`);
      return new CsvGtfsTableSource(root);
    }
    const dir = await extractGtfsZip(await readFile(this.localPath), path.join(this.cacheDir, 'local'), this.zipLimits);
    return new CsvGtfsTableSource(dir);
  }
}
