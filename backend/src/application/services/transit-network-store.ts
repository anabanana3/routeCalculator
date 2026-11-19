import { type BuildOptions, buildTransitNetwork } from '../../domain/network/network-builder.js';
import type { TransitNetwork } from '../../domain/network/model.js';
import type { GtfsTableSource } from '../../domain/network/gtfs-table-source.js';
import type { FeedSourceKind, GtfsFeedSource } from '../ports/gtfs-feed-source.js';
import { type Logger, silentLogger } from '../ports/logger.js';

export interface NetworkStatus {
  loaded: boolean;
  loading: boolean;
  source: FeedSourceKind;
  refreshMinutes: number;
  lastLoadedAt?: Date;
  lastCheckedAt?: Date;
  /** Detalle del último error (solo para uso interno/logs: puede contener rutas o URLs). */
  lastError?: string;
}

export interface TransitNetworkStoreDeps {
  source: GtfsFeedSource;
  buildOptions: Omit<BuildOptions, 'log'>;
  refreshMinutes: number;
  logger?: Logger;
  /** Inyectable para tests. */
  build?: (tables: GtfsTableSource, opts: BuildOptions) => Promise<TransitNetwork>;
  now?: () => Date;
}

type Listener = (network: TransitNetwork) => void;

/** Mantiene en memoria la red de transporte y la recarga periódicamente desde su origen. */
export class TransitNetworkStore {
  private network: TransitNetwork | null = null;
  private loading = false;
  private lastError?: string;
  private lastCheckedAt?: Date;
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners: Listener[] = [];
  private readonly logger: Logger;
  private readonly build: NonNullable<TransitNetworkStoreDeps['build']>;
  private readonly now: () => Date;

  constructor(private readonly deps: TransitNetworkStoreDeps) {
    this.logger = deps.logger ?? silentLogger;
    this.build = deps.build ?? buildTransitNetwork;
    this.now = deps.now ?? (() => new Date());
  }

  get current(): TransitNetwork | null {
    return this.network;
  }

  onLoad(listener: Listener): void {
    this.listeners.push(listener);
  }

  async start(): Promise<void> {
    await this.reload();
    const minutes = this.deps.refreshMinutes;
    if (minutes > 0) {
      this.timer = setInterval(() => void this.reload(), minutes * 60_000);
      this.timer.unref?.();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  status(): NetworkStatus {
    return {
      loaded: this.network !== null,
      loading: this.loading,
      source: this.deps.source.kind,
      refreshMinutes: this.deps.refreshMinutes,
      lastLoadedAt: this.network?.loadedAt,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError,
    };
  }

  /**
   * Recarga la red. Si force=false y el origen indica que no hay cambios, mantiene la actual.
   * Devuelve false si ya había una recarga en curso.
   */
  async reload(force = false): Promise<boolean> {
    if (this.loading) return false;
    this.loading = true;
    this.lastCheckedAt = this.now();
    try {
      const tables = await this.deps.source.fetch({ force, hasCurrent: this.network !== null });
      if (!tables) {
        this.logger.info('El feed GTFS no ha cambiado, se mantiene el actual');
        return true;
      }
      const started = this.now().getTime();
      const network = await this.build(tables, { ...this.deps.buildOptions, log: (msg) => this.logger.debug(msg) });
      this.network = network;
      this.lastError = undefined;
      this.logger.info(
        `GTFS cargado en ${((this.now().getTime() - started) / 1000).toFixed(1)}s: ` +
          `${network.stops.length} paradas, ${network.routes.length} líneas, ${network.trips.length} viajes`,
      );
      for (const l of this.listeners) {
        try {
          l(network);
        } catch (err) {
          this.logger.error('Error en un suscriptor de carga del GTFS', err);
        }
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error cargando GTFS: ${this.lastError}`);
    } finally {
      this.loading = false;
    }
    return true;
  }
}
