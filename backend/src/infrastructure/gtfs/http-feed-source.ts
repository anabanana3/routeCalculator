import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FeedFetchOptions, GtfsFeedSource } from '../../application/ports/gtfs-feed-source.js';
import { type Logger, silentLogger } from '../../application/ports/logger.js';
import type { GtfsTableSource } from '../../domain/network/gtfs-table-source.js';
import { type FetchFn, readBodyWithLimit, redactUrl } from '../http/http-utils.js';
import { CsvGtfsTableSource } from './csv-table-source.js';
import { DEFAULT_ZIP_LIMITS, extractGtfsZip, type ZipLimits } from './zip-extractor.js';

interface DownloadMeta {
  etag?: string;
  lastModified?: string;
}

export interface HttpFeedOptions {
  timeoutMs: number;
  maxBytes: number;
  zipLimits?: ZipLimits;
  fetchFn?: FetchFn;
  logger?: Logger;
}

async function readMeta(metaPath: string): Promise<DownloadMeta> {
  if (!existsSync(metaPath)) return {};
  try {
    const raw = JSON.parse(await readFile(metaPath, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return {};
    const { etag, lastModified } = raw as Record<string, unknown>;
    return {
      etag: typeof etag === 'string' ? etag : undefined,
      lastModified: typeof lastModified === 'string' ? lastModified : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Feed GTFS descargado de una URL. Usa ETag/Last-Modified para no descargar
 * de nuevo si no ha cambiado, y limita tiempo y tamaño de la descarga.
 */
export class HttpGtfsFeedSource implements GtfsFeedSource {
  readonly kind = 'url' as const;
  private readonly logger: Logger;

  constructor(
    private readonly url: string,
    private readonly cacheDir: string,
    private readonly opts: HttpFeedOptions,
  ) {
    this.logger = opts.logger ?? silentLogger;
  }

  async fetch({ force, hasCurrent }: FeedFetchOptions): Promise<GtfsTableSource | null> {
    if (!this.url) throw new Error('GTFS_SOURCE=url pero GTFS_URL está vacío');
    await mkdir(this.cacheDir, { recursive: true });
    const zipPath = path.join(this.cacheDir, 'gtfs.zip');
    const metaPath = path.join(this.cacheDir, 'gtfs.meta.json');
    const canSkip = !force && hasCurrent && existsSync(zipPath);
    const meta = canSkip ? await readMeta(metaPath) : {};

    const headers: Record<string, string> = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.lastModified) headers['If-Modified-Since'] = meta.lastModified;

    let buffer: Buffer;
    try {
      this.logger.info(`Descargando GTFS de ${redactUrl(this.url)}`);
      const res = await (this.opts.fetchFn ?? fetch)(this.url, {
        headers,
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
      if (res.status === 304) return null;
      // El mensaje no incluye la URL: puede contener claves de acceso.
      if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el GTFS`);
      buffer = await readBodyWithLimit(res, this.opts.maxBytes);
      await writeFile(zipPath, buffer);
      await writeFile(
        metaPath,
        JSON.stringify({
          etag: res.headers.get('etag') ?? undefined,
          lastModified: res.headers.get('last-modified') ?? undefined,
        } satisfies DownloadMeta),
      );
    } catch (err) {
      // Si falla la descarga en el arranque pero hay una copia previa, se usa.
      if (!hasCurrent && existsSync(zipPath)) {
        this.logger.warn(`Fallo en la descarga (${(err as Error).message}); usando la copia en caché`);
        buffer = await readFile(zipPath);
      } else {
        throw err;
      }
    }
    const dir = await extractGtfsZip(buffer, path.join(this.cacheDir, 'remote'), this.opts.zipLimits ?? DEFAULT_ZIP_LIMITS);
    return new CsvGtfsTableSource(dir);
  }
}
