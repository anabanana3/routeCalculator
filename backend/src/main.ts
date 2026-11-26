import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GtfsFeedSource } from './application/ports/gtfs-feed-source.js';
import type { GeocoderProvider } from './application/ports/geocoder-provider.js';
import type { Logger } from './application/ports/logger.js';
import type { RealtimeFeedSource } from './application/ports/realtime-feed-source.js';
import { RealtimeStore } from './application/services/realtime-store.js';
import { TransitNetworkStore } from './application/services/transit-network-store.js';
import { GetFeedInfoUseCase } from './application/use-cases/get-feed-info.js';
import { GetVehiclesUseCase } from './application/use-cases/get-vehicles.js';
import { PlanTripUseCase } from './application/use-cases/plan-trip.js';
import { ReloadFeedUseCase } from './application/use-cases/reload-feed.js';
import { ReverseGeocodeUseCase } from './application/use-cases/reverse-geocode.js';
import { SearchPlacesUseCase } from './application/use-cases/search-places.js';
import type { GeocodeResult } from './domain/geocoding/place.js';
import { TtlCache } from './infrastructure/cache/ttl-cache.js';
import type { AppConfig } from './infrastructure/config/env-config.js';
import { NominatimProvider } from './infrastructure/geocoding/nominatim-provider.js';
import { PhotonProvider } from './infrastructure/geocoding/photon-provider.js';
import { HttpGtfsFeedSource } from './infrastructure/gtfs/http-feed-source.js';
import { LocalGtfsFeedSource } from './infrastructure/gtfs/local-feed-source.js';
import { HttpRealtimeFeedSource } from './infrastructure/gtfs-realtime/http-realtime-source.js';
import { createLogger } from './infrastructure/logging/console-logger.js';
import { redactUrl } from './infrastructure/http/http-utils.js';
import { createApp } from './interfaces/http/app.js';

const GEOCODE_CACHE_MAX = 1000;
const GEOCODE_CACHE_TTL_MS = 24 * 3600 * 1000;

export type LoggerFactory = (scope: string) => Logger;

export function createFeedSource(cfg: AppConfig, logger: Logger): GtfsFeedSource {
  const { gtfs } = cfg;
  return gtfs.source === 'url'
    ? new HttpGtfsFeedSource(gtfs.url, gtfs.cacheDir, {
        timeoutMs: gtfs.downloadTimeoutMs,
        maxBytes: gtfs.maxDownloadBytes,
        zipLimits: gtfs.zipLimits,
        logger,
      })
    : new LocalGtfsFeedSource(gtfs.localPath, gtfs.cacheDir, gtfs.zipLimits);
}

export function createGeocoder(cfg: AppConfig['geocoding']): GeocoderProvider {
  return cfg.provider === 'nominatim'
    ? new NominatimProvider(cfg.url, cfg.userAgent, { minIntervalMs: cfg.nominatimMinIntervalMs })
    : new PhotonProvider(cfg.url, cfg.userAgent);
}

/** Un origen por URL distinta: si el proveedor da un único feed para todo, se descarga una sola vez. */
export function createRealtimeSources(cfg: AppConfig['realtime']): RealtimeFeedSource[] {
  const byUrl = new Map<string, string[]>();
  const feeds: [string, string][] = [
    ['tripUpdates', cfg.tripUpdatesUrl],
    ['vehiclePositions', cfg.vehiclePositionsUrl],
    ['alerts', cfg.alertsUrl],
  ];
  for (const [name, url] of feeds) {
    if (url) byUrl.set(url, [...(byUrl.get(url) ?? []), name]);
  }
  return [...byUrl].map(
    ([url, names]) =>
      new HttpRealtimeFeedSource(names.join('+'), url, {
        timeoutMs: cfg.timeoutMs,
        maxBytes: cfg.maxDownloadBytes,
        headers: cfg.headers,
        language: cfg.language,
      }),
  );
}

export interface Overrides {
  feedSource?: GtfsFeedSource;
  geocoder?: GeocoderProvider;
  realtimeSources?: RealtimeFeedSource[];
  loggerFactory?: LoggerFactory;
}

/** Construye el grafo de dependencias de la aplicación. */
export function compose(cfg: AppConfig, overrides: Overrides = {}) {
  const log = overrides.loggerFactory ?? createLogger;
  const store = new TransitNetworkStore({
    source: overrides.feedSource ?? createFeedSource(cfg, log('gtfs')),
    buildOptions: {
      timezone: cfg.timezone,
      maxTransferMeters: cfg.routing.maxTransferMeters,
      walkSpeedMps: cfg.routing.walkSpeedMps,
      walkDistanceFactor: cfg.routing.walkDistanceFactor,
    },
    refreshMinutes: cfg.gtfs.refreshMinutes,
    logger: log('gtfs'),
  });
  const realtime = new RealtimeStore({
    sources: overrides.realtimeSources ?? createRealtimeSources(cfg.realtime),
    refreshSeconds: cfg.realtime.refreshSeconds,
    idleMinutes: cfg.realtime.idleMinutes,
    maxAgeSeconds: cfg.realtime.maxAgeSeconds,
    logger: log('realtime'),
  });

  const geocoder = overrides.geocoder ?? createGeocoder(cfg.geocoding);
  const searchCache = new TtlCache<GeocodeResult[]>(GEOCODE_CACHE_MAX, GEOCODE_CACHE_TTL_MS);
  const reverseCache = new TtlCache<GeocodeResult | null>(GEOCODE_CACHE_MAX, GEOCODE_CACHE_TTL_MS);
  // Los resultados dependen de la zona del GTFS: al cargar uno nuevo se invalidan.
  store.onLoad(() => {
    searchCache.clear();
    reverseCache.clear();
  });
  const geoLog = log('geocode');
  geoLog.info(`Proveedor de geocodificación: ${geocoder.name} (${redactUrl(cfg.geocoding.url)})`);

  const app = createApp({
    planTrip: new PlanTripUseCase(store, cfg.routing, log('plan'), Date.now, realtime),
    getFeedInfo: new GetFeedInfoUseCase(store, cfg.routing.ignoreServiceCalendar, realtime),
    reloadFeed: new ReloadFeedUseCase(store),
    searchPlaces: new SearchPlacesUseCase(geocoder, searchCache, store, cfg.geocoding, geoLog),
    reverseGeocode: new ReverseGeocodeUseCase(geocoder, reverseCache, store, cfg.geocoding.language, geoLog),
    getVehicles: new GetVehiclesUseCase(store, realtime),
    security: cfg.security,
    logger: log('http'),
  });
  return { app, store, realtime };
}

export interface RunningServer {
  server: Server;
  port: number;
  store: TransitNetworkStore;
  realtime: RealtimeStore;
  close(): Promise<void>;
}

/** Arranca el servidor HTTP. La carga del GTFS no bloquea: mientras tanto /api/plan responde 503. */
export async function startServer(cfg: AppConfig, overrides: Overrides = {}): Promise<RunningServer> {
  const log = (overrides.loggerFactory ?? createLogger)('server');
  const { app, store, realtime } = compose(cfg, overrides);
  const server = await new Promise<Server>((resolve, reject) => {
    // En Express 5 el callback de listen recibe el error (p. ej. EADDRINUSE).
    const done = (err?: Error) => (err ? reject(err) : resolve(s));
    const s = cfg.host ? app.listen(cfg.port, cfg.host, done) : app.listen(cfg.port, done);
  });
  const port = (server.address() as AddressInfo).port;
  log.info(`API escuchando en http://localhost:${port} (LOG_LEVEL=${cfg.logLevel})`);
  if (cfg.routing.ignoreServiceCalendar) {
    log.warn('DEBUG_IGNORE_CALENDAR activo: se ignoran calendar.txt y calendar_dates.txt (todos los servicios circulan todos los días)');
  }
  if (cfg.security.corsOrigins.includes('*')) log.warn('CORS_ORIGINS=*: la API acepta peticiones de cualquier origen');
  if (!cfg.security.adminToken) log.info('ADMIN_TOKEN vacío: POST /api/gtfs/reload deshabilitado');
  const rt = realtime.status();
  if (rt.enabled) {
    const idle = cfg.realtime.idleMinutes > 0 ? `, pausa tras ${cfg.realtime.idleMinutes} min sin uso` : '';
    log.info(`GTFS-Realtime activo (${rt.feeds.map((f) => f.name).join(', ')}): cada ${rt.refreshSeconds}s${idle}`);
  } else {
    log.info('GTFS-Realtime no configurado: se usan solo los horarios programados');
  }

  void store.start();
  realtime.start();

  return {
    server,
    port,
    store,
    realtime,
    close: () =>
      new Promise<void>((resolve) => {
        store.stop();
        realtime.stop();
        server.close(() => resolve());
      }),
  };
}
