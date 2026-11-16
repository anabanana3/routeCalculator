import 'dotenv/config';
import path from 'node:path';

function num(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return def;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`La variable de entorno ${name} debe ser numérica`);
  return value;
}

function str(name: string, def = ''): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? def : raw.trim();
}

export type GtfsSourceType = 'local' | 'url';

const source = str('GTFS_SOURCE', 'local') as GtfsSourceType;
if (source !== 'local' && source !== 'url') {
  throw new Error('GTFS_SOURCE debe ser "local" o "url"');
}

export const config = {
  port: num('PORT', 3000),
  timezone: str('TIMEZONE') || undefined,
  gtfs: {
    source,
    localPath: path.resolve(str('GTFS_LOCAL_PATH', './data/gtfs')),
    url: str('GTFS_URL'),
    refreshMinutes: num('GTFS_REFRESH_MINUTES', 1440),
    cacheDir: path.resolve(str('GTFS_CACHE_DIR', './data/cache')),
  },
  routing: {
    maxWalkMeters: num('MAX_WALK_METERS', 800),
    maxTransferMeters: num('MAX_TRANSFER_METERS', 300),
    maxDirectWalkMeters: num('MAX_DIRECT_WALK_METERS', 2000),
    walkSpeedMps: num('WALK_SPEED_MPS', 1.25),
    walkDistanceFactor: num('WALK_DISTANCE_FACTOR', 1.25),
    minTransferSeconds: num('MIN_TRANSFER_SECONDS', 60),
    maxItineraries: num('MAX_ITINERARIES', 3),
    maxSearchHours: num('MAX_SEARCH_HOURS', 6),
  },
};

export type RoutingConfig = typeof config.routing;
