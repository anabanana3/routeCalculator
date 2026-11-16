import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { config as appConfig } from '../config.js';
import { buildGtfsData } from './builder.js';
import type { GtfsData } from './model.js';
import { GtfsDirectory, findGtfsRoot } from './reader.js';

type AppConfig = typeof appConfig;

interface DownloadMeta {
  etag?: string;
  lastModified?: string;
}

export interface GtfsStatus {
  loaded: boolean;
  loading: boolean;
  source: 'local' | 'url';
  location: string;
  refreshMinutes: number;
  lastLoadedAt?: string;
  lastCheckedAt?: string;
  lastError?: string;
}

/**
 * Mantiene en memoria el feed GTFS y lo recarga periódicamente
 * desde una carpeta/zip local o desde una URL.
 */
export class GtfsService {
  private data: GtfsData | null = null;
  private loading = false;
  private lastError?: string;
  private lastCheckedAt?: Date;
  private timer?: NodeJS.Timeout;
  private readonly listeners: ((data: GtfsData) => void)[] = [];

  constructor(private readonly cfg: AppConfig) {}

  get current(): GtfsData | null {
    return this.data;
  }

  onLoad(listener: (data: GtfsData) => void): void {
    this.listeners.push(listener);
  }

  async start(): Promise<void> {
    await this.reload();
    const minutes = this.cfg.gtfs.refreshMinutes;
    if (minutes > 0) {
      this.timer = setInterval(() => void this.reload(), minutes * 60_000);
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  status(): GtfsStatus {
    const { source, localPath, url, refreshMinutes } = this.cfg.gtfs;
    return {
      loaded: this.data !== null,
      loading: this.loading,
      source,
      location: source === 'url' ? url : localPath,
      refreshMinutes,
      lastLoadedAt: this.data?.loadedAt.toISOString(),
      lastCheckedAt: this.lastCheckedAt?.toISOString(),
      lastError: this.lastError,
    };
  }

  /** Recarga el feed. Si force=false y la URL no ha cambiado (ETag/Last-Modified) no hace nada. */
  async reload(force = false): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.lastCheckedAt = new Date();
    try {
      const dir = await this.prepareSource(force);
      if (!dir) {
        log('El feed GTFS no ha cambiado, se mantiene el actual');
        return;
      }
      log(`Cargando GTFS desde ${dir}`);
      const started = Date.now();
      const data = await buildGtfsData(new GtfsDirectory(dir), {
        timezone: this.cfg.timezone,
        maxTransferMeters: this.cfg.routing.maxTransferMeters,
        walkSpeedMps: this.cfg.routing.walkSpeedMps,
        walkDistanceFactor: this.cfg.routing.walkDistanceFactor,
        log,
      });
      this.data = data;
      this.lastError = undefined;
      log(
        `GTFS cargado en ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
          `${data.stops.length} paradas, ${data.routes.length} líneas, ${data.trips.length} viajes`,
      );
      for (const l of this.listeners) l(data);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      log(`Error cargando GTFS: ${this.lastError}`);
    } finally {
      this.loading = false;
    }
  }

  /** Devuelve la carpeta con los .txt listos para leer, o null si no hay cambios. */
  private async prepareSource(force: boolean): Promise<string | null> {
    const { source, localPath, url, cacheDir } = this.cfg.gtfs;
    await mkdir(cacheDir, { recursive: true });

    if (source === 'local') {
      if (!existsSync(localPath)) throw new Error(`No existe la ruta GTFS local: ${localPath}`);
      if (statSync(localPath).isDirectory()) {
        const root = await findGtfsRoot(localPath);
        if (!root) throw new Error(`No se encontró stops.txt en ${localPath}`);
        return root;
      }
      return this.extractZip(await readFile(localPath), path.join(cacheDir, 'local'));
    }

    if (!url) throw new Error('GTFS_SOURCE=url pero GTFS_URL está vacío');
    const zipPath = path.join(cacheDir, 'gtfs.zip');
    const metaPath = path.join(cacheDir, 'gtfs.meta.json');
    const meta: DownloadMeta = existsSync(metaPath) ? JSON.parse(await readFile(metaPath, 'utf8')) : {};
    const canSkip = !force && this.data !== null && existsSync(zipPath);

    const headers: Record<string, string> = {};
    if (canSkip && meta.etag) headers['If-None-Match'] = meta.etag;
    if (canSkip && meta.lastModified) headers['If-Modified-Since'] = meta.lastModified;

    let buffer: Buffer;
    try {
      log(`Descargando GTFS de ${url}`);
      const res = await fetch(url, { headers });
      if (res.status === 304) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
      buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(zipPath, buffer);
      await writeFile(
        metaPath,
        JSON.stringify({
          etag: res.headers.get('etag') ?? undefined,
          lastModified: res.headers.get('last-modified') ?? undefined,
        } satisfies DownloadMeta),
      );
    } catch (err) {
      // Si falla la descarga pero hay una copia previa, la usamos en el arranque.
      if (this.data === null && existsSync(zipPath)) {
        log(`Fallo en la descarga (${(err as Error).message}); usando la copia en caché`);
        buffer = await readFile(zipPath);
      } else {
        throw err;
      }
    }
    return this.extractZip(buffer, path.join(cacheDir, 'remote'));
  }

  private async extractZip(buffer: Buffer, baseDir: string): Promise<string> {
    await mkdir(baseDir, { recursive: true });
    // Se extrae en una carpeta nueva y se borran las anteriores para no pisar datos en uso.
    const target = path.join(baseDir, `extract-${Date.now()}`);
    new AdmZip(buffer).extractAllTo(target, true);
    for (const entry of await readdir(baseDir)) {
      const full = path.join(baseDir, entry);
      if (full !== target) await rm(full, { recursive: true, force: true });
    }
    const root = await findGtfsRoot(target);
    if (!root) throw new Error('El zip GTFS no contiene stops.txt');
    return root;
  }
}

function log(msg: string): void {
  console.log(`[gtfs] ${new Date().toISOString()} ${msg}`);
}
