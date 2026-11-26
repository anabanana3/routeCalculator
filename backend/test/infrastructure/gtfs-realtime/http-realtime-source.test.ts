import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { describe, expect, it, vi } from 'vitest';
import { HttpRealtimeFeedSource } from '../../../src/infrastructure/gtfs-realtime/http-realtime-source.js';
import { decodeRealtimeFeed, MAX_TEXT_LENGTH, pickTranslation, safeUrl } from '../../../src/infrastructure/gtfs-realtime/protobuf-decoder.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

function encodeFeed(obj: Record<string, unknown>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    FeedMessage.encode(FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0', ...((obj.header as object) ?? {}) }, entity: obj.entity ?? [] })).finish(),
  );
}

const SAMPLE = {
  header: { timestamp: 1772434800 },
  entity: [
    {
      id: 'tu1',
      tripUpdate: {
        trip: { tripId: 'T1', startDate: '20260302', scheduleRelationship: 'SCHEDULED' },
        vehicle: { id: 'BUS-1' },
        timestamp: 1772434790,
        delay: 30,
        stopTimeUpdate: [
          { stopSequence: 1, departure: { delay: 60 } },
          { stopId: 'B', arrival: { time: 1772435200 }, scheduleRelationship: 'SKIPPED' },
          { stopSequence: 3, scheduleRelationship: 'NO_DATA' },
        ],
      },
    },
    { id: 'tu2', tripUpdate: { trip: { tripId: 'T2', scheduleRelationship: 'CANCELED' } } },
    {
      id: 'v1',
      vehicle: {
        trip: { tripId: 'T1' },
        vehicle: { id: 'BUS-1', label: 'Bus 1' },
        position: { latitude: 40.4, longitude: -3.7, bearing: 90, speed: 8.5 },
        currentStatus: 'STOPPED_AT',
        stopId: 'A',
        currentStopSequence: 1,
        timestamp: 1772434795,
      },
    },
    { id: 'v2', vehicle: { vehicle: { id: 'SIN-POS' } } },
    { id: 'v3', vehicle: { position: { latitude: 100, longitude: 0 } } },
    {
      id: 'al1',
      alert: {
        activePeriod: [{ start: 1772430000, end: 1772440000 }, {}],
        informedEntity: [{ routeId: 'R1' }, { stopId: 'A', agencyId: 'AG' }, { trip: { tripId: 'T1' } }],
        cause: 'STRIKE',
        effect: 'REDUCED_SERVICE',
        severityLevel: 'WARNING',
        headerText: { translation: [{ text: 'Strike', language: 'en' }, { text: ' Huelga ', language: 'es' }] },
        descriptionText: { translation: [{ text: 'Servicios mínimos' }] },
        url: { translation: [{ text: 'javascript:alert(1)' }] },
      },
    },
    { id: 'borrado', isDeleted: true, alert: { headerText: { translation: [{ text: 'x' }] } } },
  ],
};

describe('decodeRealtimeFeed', () => {
  it('convierte el protobuf al modelo del dominio', () => {
    const feed = decodeRealtimeFeed(encodeFeed(SAMPLE), 'es');
    expect(feed.timestamp).toBe(1772434800);

    expect(feed.tripUpdates).toEqual([
      {
        trip: { tripId: 'T1', startDate: '20260302', scheduleRelationship: 'SCHEDULED' },
        vehicleId: 'BUS-1',
        delay: 30,
        timestamp: 1772434790,
        stopTimeUpdates: [
          { stopSequence: 1, departure: { delay: 60 }, scheduleRelationship: 'SCHEDULED' },
          { stopId: 'B', arrival: { time: 1772435200 }, scheduleRelationship: 'SKIPPED' },
          { stopSequence: 3, scheduleRelationship: 'NO_DATA' },
        ],
      },
      { trip: { tripId: 'T2', scheduleRelationship: 'CANCELED' }, stopTimeUpdates: [] },
    ]);

    expect(feed.vehicles).toEqual([
      {
        id: 'v1',
        vehicleId: 'BUS-1',
        label: 'Bus 1',
        trip: { tripId: 'T1', scheduleRelationship: 'SCHEDULED' },
        lat: expect.closeTo(40.4, 5),
        lon: expect.closeTo(-3.7, 5),
        bearing: 90,
        speed: 8.5,
        timestamp: 1772434795,
        stopId: 'A',
        currentStopSequence: 1,
        currentStatus: 'STOPPED_AT',
      },
    ]);

    expect(feed.alerts).toEqual([
      {
        id: 'al1',
        activePeriods: [{ start: 1772430000, end: 1772440000 }, {}],
        informedEntities: [{ routeId: 'R1' }, { stopId: 'A', agencyId: 'AG' }, { tripId: 'T1' }],
        cause: 'STRIKE',
        effect: 'REDUCED_SERVICE',
        severity: 'WARNING',
        header: 'Huelga',
        description: 'Servicios mínimos',
        url: '',
      },
    ]);
  });

  it('usa valores por defecto en avisos incompletos', () => {
    const feed = decodeRealtimeFeed(encodeFeed({ entity: [{ id: '', alert: {} }] }));
    expect(feed.timestamp).toBeUndefined();
    expect(feed.alerts[0]).toMatchObject({ id: '0', cause: 'UNKNOWN_CAUSE', effect: 'UNKNOWN_EFFECT', severity: 'UNKNOWN_SEVERITY', header: '' });
  });

  it('falla con datos que no son protobuf', () => {
    expect(() => decodeRealtimeFeed(new TextEncoder().encode('<html>no</html>'))).toThrow();
  });
});

describe('pickTranslation / safeUrl', () => {
  it('elige el idioma preferido, la variante regional, el neutro o el primero', () => {
    const t = (text: string, language?: string) => ({ text, language });
    expect(pickTranslation({ translation: [t('A', 'en'), t('B', 'es-ES')] }, 'es')).toBe('B');
    expect(pickTranslation({ translation: [t('A', 'en'), t('B')] }, 'es')).toBe('B');
    expect(pickTranslation({ translation: [t('A', 'en'), t('C', 'fr')] }, 'es')).toBe('A');
    expect(pickTranslation(undefined, 'es')).toBe('');
    expect(pickTranslation({ translation: [t('x'.repeat(MAX_TEXT_LENGTH + 10))] }, 'es')).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('solo acepta enlaces http(s)', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('no es url')).toBe('');
  });
});

describe('HttpRealtimeFeedSource', () => {
  const body = encodeFeed(SAMPLE);

  function fetchMock(...responses: (() => Response)[]) {
    const fn = vi.fn<typeof fetch>();
    for (const r of responses) fn.mockImplementationOnce(async () => r());
    return fn;
  }

  it('descarga, decodifica y reutiliza ETag/Last-Modified', async () => {
    const fetchFn = fetchMock(
      () => new Response(body, { headers: { etag: '"v1"', 'last-modified': 'Mon, 02 Mar 2026 07:00:00 GMT' } }),
      () => new Response(null, { status: 304 }),
    );
    const src = new HttpRealtimeFeedSource('tu', 'https://rt.example/tu?key=secreto', {
      timeoutMs: 1000,
      maxBytes: 1_000_000,
      headers: { 'x-api-key': 'k' },
      language: 'es',
      fetchFn,
    });
    expect(src.name).toBe('tu');
    const feed = await src.fetch();
    expect(feed?.tripUpdates).toHaveLength(2);
    const firstHeaders = fetchFn.mock.calls[0][1]!.headers as Record<string, string>;
    expect(firstHeaders['x-api-key']).toBe('k');
    expect(firstHeaders['If-None-Match']).toBeUndefined();

    expect(await src.fetch()).toBeNull();
    const secondHeaders = fetchFn.mock.calls[1][1]!.headers as Record<string, string>;
    expect(secondHeaders['If-None-Match']).toBe('"v1"');
    expect(secondHeaders['If-Modified-Since']).toBe('Mon, 02 Mar 2026 07:00:00 GMT');
  });

  it('errores HTTP sin revelar la URL', async () => {
    const src = new HttpRealtimeFeedSource('tu', 'https://rt.example/tu?key=secreto', {
      timeoutMs: 1000,
      maxBytes: 1000,
      fetchFn: fetchMock(() => new Response('x', { status: 403 })),
    });
    await expect(src.fetch()).rejects.toThrow(/^HTTP 403$/);
  });

  it('limita el tamaño y valida el contenido', async () => {
    const big = new HttpRealtimeFeedSource('tu', 'https://rt.example', {
      timeoutMs: 1000,
      maxBytes: 10,
      fetchFn: fetchMock(() => new Response(body)),
    });
    await expect(big.fetch()).rejects.toThrow(/tamaño máximo/);
    const html = new HttpRealtimeFeedSource('tu', 'https://rt.example', {
      timeoutMs: 1000,
      maxBytes: 1000,
      fetchFn: fetchMock(() => new Response('<html>error</html>')),
    });
    await expect(html.fetch()).rejects.toThrow(/no es GTFS-Realtime válido/);
  });
});
