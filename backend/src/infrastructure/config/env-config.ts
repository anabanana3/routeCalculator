import path from 'node:path';
import type { FeedSourceKind } from '../../application/ports/gtfs-feed-source.js';
import type { RoutingOptions } from '../../domain/routing/routing-options.js';
import type { ZipLimits } from '../gtfs/zip-extractor.js';
import { type LogLevel, parseLogLevel } from '../logging/console-logger.js';

export type Env = Record<string, string | undefined>;
export type GeocoderKind = 'photon' | 'nominatim';
/** Valor de "trust proxy" de Express. */
export type TrustProxy = boolean | number | string;

export interface AppConfig {
  port: number;
  /** Interfaz de escucha; undefined = todas (IPv4 e IPv6), como hace Node por defecto. */
  host?: string;
  logLevel: LogLevel;
  timezone?: string;
  gtfs: {
    source: FeedSourceKind;
    localPath: string;
    url: string;
    refreshMinutes: number;
    cacheDir: string;
    downloadTimeoutMs: number;
    maxDownloadBytes: number;
    zipLimits: ZipLimits;
  };
  routing: RoutingOptions;
  realtime: {
    /** URLs de los feeds GTFS-Realtime (vacías = no se usan). Pueden coincidir si el proveedor da un único feed. */
    tripUpdatesUrl: string;
    vehiclePositionsUrl: string;
    alertsUrl: string;
    refreshSeconds: number;
    /** Minutos sin peticiones tras los que se pausa la descarga (0 = nunca). */
    idleMinutes: number;
    /** Antigüedad máxima de los datos para usarlos (0 = sin límite). */
    maxAgeSeconds: number;
    timeoutMs: number;
    maxDownloadBytes: number;
    headers: Record<string, string>;
    language: string;
  };
  geocoding: {
    provider: GeocoderKind;
    url: string;
    userAgent: string;
    language: string;
    restrictToGtfsBounds: boolean;
    boundsMarginMeters: number;
    nominatimMinIntervalMs: number;
  };
  security: {
    /** Orígenes permitidos por CORS. Vacío = solo mismo origen; ["*"] = cualquiera. */
    corsOrigins: string[];
    /** Token para endpoints de administración (vacío = deshabilitados). */
    adminToken: string;
    rateLimitWindowMs: number;
    /** Peticiones por IP y ventana (0 = sin límite). */
    rateLimitMax: number;
    trustProxy: TrustProxy;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const MB = 1024 * 1024;
const MIN_ADMIN_TOKEN_LENGTH = 16;
/** Mínimo entre descargas de GTFS-Realtime, para no saturar al proveedor. */
export const MIN_RT_REFRESH_SECONDS = 5;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function loadConfig(env: Env, cwd: string = process.cwd()): AppConfig {
  const str = (name: string, def = ''): string => {
    const raw = env[name];
    return raw === undefined || raw.trim() === '' ? def : raw.trim();
  };
  const num = (name: string, def: number, min = -Infinity): number => {
    const raw = str(name);
    if (raw === '') return def;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new ConfigError(`La variable de entorno ${name} debe ser numérica`);
    if (value < min) throw new ConfigError(`La variable de entorno ${name} debe ser >= ${min}`);
    return value;
  };
  const bool = (name: string, def = false): boolean => {
    const raw = str(name).toLowerCase();
    if (raw === '') return def;
    return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
  };
  const list = (name: string): string[] =>
    str(name)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const resolve = (p: string) => path.resolve(cwd, p);

  const source = str('GTFS_SOURCE', 'local');
  if (source !== 'local' && source !== 'url') throw new ConfigError('GTFS_SOURCE debe ser "local" o "url"');
  const gtfsUrl = str('GTFS_URL');
  if (source === 'url') assertHttpUrl('GTFS_URL', gtfsUrl);

  const provider: GeocoderKind = str('GEOCODER_PROVIDER', 'photon') === 'nominatim' ? 'nominatim' : 'photon';
  const geocoderUrl = str(
    'GEOCODER_URL',
    provider === 'nominatim' ? 'https://nominatim.openstreetmap.org' : 'https://photon.komoot.io',
  );
  assertHttpUrl('GEOCODER_URL', geocoderUrl);

  const adminToken = str('ADMIN_TOKEN');
  if (adminToken && adminToken.length < MIN_ADMIN_TOKEN_LENGTH) {
    throw new ConfigError(`ADMIN_TOKEN debe tener al menos ${MIN_ADMIN_TOKEN_LENGTH} caracteres`);
  }

  const rtUrl = (name: string): string => {
    const value = str(name);
    if (value) assertHttpUrl(name, value);
    return value;
  };

  return {
    port: num('PORT', 3000, 0),
    host: str('HOST') || undefined,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    timezone: str('TIMEZONE') || undefined,
    gtfs: {
      source,
      localPath: resolve(str('GTFS_LOCAL_PATH', './data/gtfs')),
      url: gtfsUrl,
      refreshMinutes: num('GTFS_REFRESH_MINUTES', 1440, 0),
      cacheDir: resolve(str('GTFS_CACHE_DIR', './data/cache')),
      downloadTimeoutMs: num('GTFS_DOWNLOAD_TIMEOUT_MS', 120_000, 1),
      maxDownloadBytes: num('GTFS_MAX_DOWNLOAD_MB', 200, 1) * MB,
      zipLimits: {
        maxEntries: num('GTFS_ZIP_MAX_ENTRIES', 200, 1),
        maxEntryBytes: num('GTFS_ZIP_MAX_FILE_MB', 1024, 1) * MB,
        maxTotalBytes: num('GTFS_ZIP_MAX_TOTAL_MB', 2048, 1) * MB,
      },
    },
    routing: {
      maxWalkMeters: num('MAX_WALK_METERS', 800, 0),
      maxTransferMeters: num('MAX_TRANSFER_METERS', 300, 0),
      maxDirectWalkMeters: num('MAX_DIRECT_WALK_METERS', 2000, 0),
      walkSpeedMps: num('WALK_SPEED_MPS', 1.25, 0.1),
      walkDistanceFactor: num('WALK_DISTANCE_FACTOR', 1.25, 1),
      minTransferSeconds: num('MIN_TRANSFER_SECONDS', 60, 0),
      maxItineraries: num('MAX_ITINERARIES', 3, 1),
      maxSearchHours: num('MAX_SEARCH_HOURS', 6, 0),
      ignoreServiceCalendar: bool('DEBUG_IGNORE_CALENDAR'),
    },
    realtime: {
      tripUpdatesUrl: rtUrl('GTFS_RT_TRIP_UPDATES_URL'),
      vehiclePositionsUrl: rtUrl('GTFS_RT_VEHICLE_POSITIONS_URL'),
      alertsUrl: rtUrl('GTFS_RT_ALERTS_URL'),
      refreshSeconds: num('GTFS_RT_REFRESH_SECONDS', 30, MIN_RT_REFRESH_SECONDS),
      idleMinutes: num('GTFS_RT_IDLE_MINUTES', 10, 0),
      maxAgeSeconds: num('GTFS_RT_MAX_AGE_SECONDS', 300, 0),
      timeoutMs: num('GTFS_RT_TIMEOUT_MS', 10_000, 1),
      maxDownloadBytes: num('GTFS_RT_MAX_DOWNLOAD_MB', 20, 1) * MB,
      headers: parseHeaders('GTFS_RT_HEADERS', str('GTFS_RT_HEADERS')),
      language: str('GTFS_RT_LANGUAGE', 'es'),
    },
    geocoding: {
      provider,
      url: geocoderUrl,
      userAgent: str('GEOCODER_USER_AGENT', 'route-calculator/0.1 (desarrollo)'),
      language: str('GEOCODER_LANGUAGE', 'es'),
      restrictToGtfsBounds: bool('GEOCODER_RESTRICT_TO_GTFS', true),
      boundsMarginMeters: num('GEOCODER_BOUNDS_MARGIN_METERS', 5000, 0),
      nominatimMinIntervalMs: num('GEOCODER_MIN_INTERVAL_MS', 1000, 0),
    },
    security: {
      corsOrigins: list('CORS_ORIGINS'),
      adminToken,
      rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 60_000, 1),
      rateLimitMax: num('RATE_LIMIT_MAX', 120, 0),
      trustProxy: parseTrustProxy(str('TRUST_PROXY')),
    },
  };
}

function assertHttpUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} no es una URL válida`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${name} debe usar http o https`);
  }
}

/** Cabeceras HTTP en JSON: {"x-api-key": "..."}. */
export function parseHeaders(name: string, value: string): Record<string, string> {
  if (value === '') return {};
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new ConfigError(`${name} debe ser un objeto JSON, p. ej. {"x-api-key":"..."}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError(`${name} debe ser un objeto JSON, p. ej. {"x-api-key":"..."}`);
  }
  const headers: Record<string, string> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!HEADER_NAME.test(key) || typeof v !== 'string' || /[\r\n]/.test(v)) {
      throw new ConfigError(`${name} contiene una cabecera no válida: ${key}`);
    }
    headers[key] = v;
  }
  return headers;
}

/** "" / false -> no se confía en proxies; número -> saltos; otro texto -> lista de IPs/subredes de Express. */
export function parseTrustProxy(value: string): TrustProxy {
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return value.trim();
}
