import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseTrustProxy } from '../../../src/infrastructure/config/env-config.js';

const CWD = path.resolve('/app');
const MB = 1024 * 1024;

describe('loadConfig', () => {
  it('valores por defecto', () => {
    const c = loadConfig({}, CWD);
    expect(c.port).toBe(3000);
    expect(c.host).toBeUndefined();
    expect(c.logLevel).toBe('info');
    expect(c.timezone).toBeUndefined();
    expect(c.gtfs).toEqual({
      source: 'local',
      localPath: path.resolve(CWD, './data/gtfs'),
      url: '',
      refreshMinutes: 1440,
      cacheDir: path.resolve(CWD, './data/cache'),
      downloadTimeoutMs: 120_000,
      maxDownloadBytes: 200 * MB,
      zipLimits: { maxEntries: 200, maxEntryBytes: 1024 * MB, maxTotalBytes: 2048 * MB },
    });
    expect(c.routing).toEqual({
      maxWalkMeters: 800,
      maxTransferMeters: 300,
      maxDirectWalkMeters: 2000,
      walkSpeedMps: 1.25,
      walkDistanceFactor: 1.25,
      minTransferSeconds: 60,
      maxItineraries: 3,
      maxSearchHours: 6,
      ignoreServiceCalendar: false,
    });
    expect(c.geocoding).toEqual({
      provider: 'photon',
      url: 'https://photon.komoot.io',
      userAgent: 'route-calculator/0.1 (desarrollo)',
      language: 'es',
      restrictToGtfsBounds: true,
      boundsMarginMeters: 5000,
      nominatimMinIntervalMs: 1000,
    });
    expect(c.security).toEqual({
      corsOrigins: [],
      adminToken: '',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 120,
      trustProxy: false,
    });
  });

  it('lee y recorta las variables', () => {
    const c = loadConfig(
      {
        PORT: ' 8080 ',
        HOST: '127.0.0.1',
        LOG_LEVEL: 'DEBUG',
        TIMEZONE: 'Europe/Madrid',
        GTFS_SOURCE: 'url',
        GTFS_URL: 'https://example.com/gtfs.zip?key=1',
        GTFS_LOCAL_PATH: './feed',
        GTFS_MAX_DOWNLOAD_MB: '5',
        MAX_WALK_METERS: '500',
        DEBUG_IGNORE_CALENDAR: 'Sí',
        GEOCODER_PROVIDER: 'nominatim',
        GEOCODER_RESTRICT_TO_GTFS: 'no',
        CORS_ORIGINS: 'http://a.com, http://b.com ,',
        ADMIN_TOKEN: 'x'.repeat(32),
        RATE_LIMIT_MAX: '0',
        TRUST_PROXY: '1',
      },
      CWD,
    );
    expect(c.port).toBe(8080);
    expect(c.host).toBe('127.0.0.1');
    expect(c.logLevel).toBe('debug');
    expect(c.timezone).toBe('Europe/Madrid');
    expect(c.gtfs.source).toBe('url');
    expect(c.gtfs.url).toBe('https://example.com/gtfs.zip?key=1');
    expect(c.gtfs.localPath).toBe(path.resolve(CWD, 'feed'));
    expect(c.gtfs.maxDownloadBytes).toBe(5 * MB);
    expect(c.routing.maxWalkMeters).toBe(500);
    expect(c.routing.ignoreServiceCalendar).toBe(true);
    expect(c.geocoding.provider).toBe('nominatim');
    expect(c.geocoding.url).toBe('https://nominatim.openstreetmap.org');
    expect(c.geocoding.restrictToGtfsBounds).toBe(false);
    expect(c.security.corsOrigins).toEqual(['http://a.com', 'http://b.com']);
    expect(c.security.adminToken).toBe('x'.repeat(32));
    expect(c.security.rateLimitMax).toBe(0);
    expect(c.security.trustProxy).toBe(1);
  });

  it('las variables vacías usan el valor por defecto', () => {
    expect(loadConfig({ PORT: '  ', TIMEZONE: '' }, CWD).port).toBe(3000);
  });

  it.each([
    [{ PORT: 'abc' }, /PORT debe ser numérica/],
    [{ PORT: 'Infinity' }, /PORT debe ser numérica/],
    [{ PORT: '-1' }, /PORT debe ser >= 0/],
    [{ WALK_SPEED_MPS: '0' }, /WALK_SPEED_MPS/],
    [{ WALK_DISTANCE_FACTOR: '0.5' }, /WALK_DISTANCE_FACTOR/],
    [{ GTFS_SOURCE: 'ftp' }, /GTFS_SOURCE/],
    [{ GTFS_SOURCE: 'url' }, /GTFS_URL no es una URL válida/],
    [{ GTFS_SOURCE: 'url', GTFS_URL: 'file:///etc/passwd' }, /GTFS_URL debe usar http o https/],
    [{ GEOCODER_URL: 'javascript:alert(1)' }, /GEOCODER_URL debe usar http o https/],
    [{ ADMIN_TOKEN: 'corto' }, /ADMIN_TOKEN debe tener al menos 16/],
  ])('rechaza configuraciones inválidas %o', (env, message) => {
    expect(() => loadConfig(env, CWD)).toThrow(ConfigError);
    expect(() => loadConfig(env, CWD)).toThrow(message);
  });

  it('GTFS_URL no se valida si el origen es local', () => {
    expect(() => loadConfig({ GTFS_SOURCE: 'local', GTFS_URL: 'basura' }, CWD)).not.toThrow();
  });

  it('niveles de log desconocidos pasan a info', () => {
    expect(loadConfig({ LOG_LEVEL: 'verbose' }, CWD).logLevel).toBe('info');
  });
});

describe('parseTrustProxy', () => {
  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['2', 2],
    ['loopback', 'loopback'],
    ['10.0.0.0/8, 127.0.0.1', '10.0.0.0/8, 127.0.0.1'],
  ])('%s -> %o', (value, expected) => {
    expect(parseTrustProxy(value)).toEqual(expected);
  });
});
