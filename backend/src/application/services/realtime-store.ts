import type { TransitNetwork } from '../../domain/network/model.js';
import type { RealtimeFeed } from '../../domain/realtime/model.js';
import { buildRealtimeIndex, type RealtimeIndex } from '../../domain/realtime/realtime-index.js';
import { type Logger, silentLogger } from '../ports/logger.js';
import type { RealtimeFeedSource } from '../ports/realtime-feed-source.js';
import type { RealtimeProvider } from '../ports/realtime-provider.js';

export interface RealtimeFeedStatus {
  name: string;
  /** Última descarga correcta (aunque no trajera cambios). */
  lastCheckedAt?: Date;
  /** Última vez que llegaron datos nuevos. */
  lastUpdatedAt?: Date;
  /** header.timestamp del feed. */
  feedTimestamp?: Date;
  entities: number;
  /** Sin datos o con datos más antiguos que maxAgeSeconds (no se usan). */
  stale: boolean;
  failures: number;
  /** Detalle del último error (solo para uso interno/logs). */
  lastError?: string;
}

export interface RealtimeStatus {
  enabled: boolean;
  refreshSeconds: number;
  /** Refresco en pausa por falta de actividad. */
  paused: boolean;
  feeds: RealtimeFeedStatus[];
}

export interface RealtimeStoreDeps {
  sources: RealtimeFeedSource[];
  refreshSeconds: number;
  /** Minutos sin peticiones tras los que se deja de descargar (0 = nunca). */
  idleMinutes: number;
  /** Antigüedad máxima de los datos para usarlos (0 = sin límite). */
  maxAgeSeconds: number;
  logger?: Logger;
  /** Inyectables para tests. */
  now?: () => number;
  build?: (network: TransitNetwork, feeds: RealtimeFeed[], nowMs: number) => RealtimeIndex;
}

interface FeedState {
  source: RealtimeFeedSource;
  data: RealtimeFeed | null;
  receivedAt?: number;
  lastCheckedAt?: number;
  failures: number;
  nextAttemptAt: number;
  lastError?: string;
}

export const MAX_BACKOFF_MS = 10 * 60_000;
export const DEFAULT_WAKE_WAIT_MS = 3000;

/**
 * Descarga periódicamente los feeds GTFS-Realtime y los mantiene en memoria.
 * - Se pausa si nadie usa la API durante `idleMinutes` y se reanuda con la siguiente petición.
 * - Ante errores espera cada vez más (backoff exponencial) antes de reintentar ese feed.
 * - Ignora los feeds cuyo header.timestamp no avanza y descarta los datos demasiado antiguos.
 */
export class RealtimeStore implements RealtimeProvider {
  private readonly feeds: FeedState[];
  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly build: NonNullable<RealtimeStoreDeps['build']>;
  private lastActivity: number;
  private paused = false;
  private timer?: ReturnType<typeof setInterval>;
  private inflight: Promise<void> | null = null;
  private version = 0;
  private cached?: { network: TransitNetwork; key: string; index: RealtimeIndex };

  constructor(private readonly deps: RealtimeStoreDeps) {
    this.feeds = deps.sources.map((source) => ({ source, data: null, failures: 0, nextAttemptAt: 0 }));
    this.logger = deps.logger ?? silentLogger;
    this.now = deps.now ?? Date.now;
    this.build = deps.build ?? buildRealtimeIndex;
    this.lastActivity = this.now();
  }

  get enabled(): boolean {
    return this.feeds.length > 0;
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.tick(), this.deps.refreshSeconds * 1000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Un ciclo del refresco periódico. */
  tick(): Promise<void> {
    if (this.isIdle()) {
      if (!this.paused) {
        this.paused = true;
        this.logger.info(`Sin actividad en ${this.deps.idleMinutes} min: se pausa la descarga de GTFS-Realtime`);
      }
      return Promise.resolve();
    }
    return this.refresh();
  }

  /** Registra actividad. Devuelve true si el refresco estaba en pausa y se ha reanudado. */
  touch(): boolean {
    this.lastActivity = this.now();
    if (!this.enabled || !this.paused) return false;
    this.paused = false;
    this.logger.info('Hay actividad de nuevo: se reanuda la descarga de GTFS-Realtime');
    void this.refresh();
    return true;
  }

  async awaitFresh(maxWaitMs = DEFAULT_WAKE_WAIT_MS): Promise<void> {
    const woke = this.touch();
    const noData = this.feeds.every((f) => !this.isFresh(f));
    const pending = this.inflight;
    if (!pending || !(woke || noData)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      pending,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, maxWaitMs);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
  }

  /** Descarga todos los feeds (si ya hay una descarga en curso, devuelve esa). */
  refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = Promise.all(this.feeds.map((f) => this.refreshFeed(f)))
        .then(() => undefined)
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  indexFor(network: TransitNetwork): RealtimeIndex | null {
    const fresh = this.feeds.filter((f) => this.isFresh(f));
    if (fresh.length === 0) return null;
    const key = `${this.version}|${fresh.map((f) => this.feeds.indexOf(f)).join(',')}`;
    if (this.cached && this.cached.network === network && this.cached.key === key) return this.cached.index;
    const started = this.now();
    const index = this.build(network, fresh.map((f) => f.data!), started);
    this.cached = { network, key, index };
    this.logger.debug(
      `Tiempo real cruzado con la red en ${this.now() - started}ms: ${index.instances.length} viajes, ` +
        `${index.vehicles.size} vehículos, ${index.alerts.length} avisos`,
    );
    return index;
  }

  status(): RealtimeStatus {
    return {
      enabled: this.enabled,
      refreshSeconds: this.deps.refreshSeconds,
      paused: this.paused,
      feeds: this.feeds.map((f) => ({
        name: f.source.name,
        lastCheckedAt: f.lastCheckedAt !== undefined ? new Date(f.lastCheckedAt) : undefined,
        lastUpdatedAt: f.receivedAt !== undefined ? new Date(f.receivedAt) : undefined,
        feedTimestamp: f.data?.timestamp !== undefined ? new Date(f.data.timestamp * 1000) : undefined,
        entities: f.data ? f.data.tripUpdates.length + f.data.vehicles.length + f.data.alerts.length : 0,
        stale: !this.isFresh(f),
        failures: f.failures,
        lastError: f.lastError,
      })),
    };
  }

  private isIdle(): boolean {
    const { idleMinutes } = this.deps;
    return idleMinutes > 0 && this.now() - this.lastActivity > idleMinutes * 60_000;
  }

  private isFresh(f: FeedState): boolean {
    if (!f.data) return false;
    if (this.deps.maxAgeSeconds <= 0) return true;
    const generatedAt = f.data.timestamp !== undefined ? f.data.timestamp * 1000 : f.receivedAt!;
    return this.now() - generatedAt <= this.deps.maxAgeSeconds * 1000;
  }

  private async refreshFeed(f: FeedState): Promise<void> {
    if (this.now() < f.nextAttemptAt) return;
    const { name } = f.source;
    try {
      const data = await f.source.fetch();
      f.lastCheckedAt = this.now();
      f.failures = 0;
      f.nextAttemptAt = 0;
      f.lastError = undefined;
      if (!data) return;
      const prevTs = f.data?.timestamp;
      if (prevTs !== undefined && data.timestamp !== undefined && data.timestamp <= prevTs) return;
      f.data = data;
      f.receivedAt = this.now();
      this.version++;
      this.logger.debug(
        `GTFS-Realtime ${name}: ${data.tripUpdates.length} actualizaciones, ${data.vehicles.length} vehículos, ${data.alerts.length} avisos`,
      );
    } catch (err) {
      f.failures++;
      f.lastError = err instanceof Error ? err.message : String(err);
      const wait = Math.min(this.deps.refreshSeconds * 1000 * 2 ** f.failures, MAX_BACKOFF_MS);
      f.nextAttemptAt = this.now() + wait;
      this.logger.warn(`Error descargando GTFS-Realtime ${name}: ${f.lastError} (siguiente intento en ${Math.round(wait / 1000)}s)`);
    }
  }
}
