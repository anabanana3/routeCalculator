import { describe, expect, it, vi } from 'vitest';
import { haversineMeters } from '../../../src/domain/geo/geo.js';
import { readAll } from '../../../src/domain/network/gtfs-table-source.js';
import {
  buildTransitNetwork,
  interpolateMissingTimes,
  normalizeColor,
} from '../../../src/domain/network/network-builder.js';
import { parseGtfsTime } from '../../../src/domain/time/service-time.js';
import { BUILD_OPTIONS, buildTestNetwork, csv, MemoryTableSource, stopIdx, STOPS, TABLES, tripIdx } from '../../fixtures/network.js';

describe('readAll', () => {
  it('devuelve todas las filas de una tabla', async () => {
    const rows = await readAll(new MemoryTableSource({ agency: [{ a: '1' }, { a: '2' }] }), 'agency');
    expect(rows).toEqual([{ a: '1' }, { a: '2' }]);
  });

  it('devuelve [] si la tabla no existe', async () => {
    expect(await readAll(new MemoryTableSource({}), 'agency')).toEqual([]);
  });
});

describe('normalizeColor', () => {
  it('normaliza colores hexadecimales válidos', () => {
    expect(normalizeColor('ff0000', '#000')).toBe('#FF0000');
    expect(normalizeColor('#00ff00', '#000')).toBe('#00FF00');
    expect(normalizeColor(' 0000ff ', '#000')).toBe('#0000FF');
  });

  it('usa el valor por defecto con colores inválidos (evita inyectar estilos)', () => {
    expect(normalizeColor('', '#123456')).toBe('#123456');
    expect(normalizeColor('red', '#123456')).toBe('#123456');
    expect(normalizeColor('fff', '#123456')).toBe('#123456');
    expect(normalizeColor('ff0000;background:url(x)', '#123456')).toBe('#123456');
  });
});

describe('interpolateMissingTimes', () => {
  it('interpola linealmente entre horas conocidas', () => {
    const arr = Int32Array.from([0, -1, -1, 300]);
    const dep = Int32Array.from([0, -1, -1, 300]);
    interpolateMissingTimes(arr, dep);
    expect([...arr]).toEqual([0, 100, 200, 300]);
    expect([...dep]).toEqual([0, 100, 200, 300]);
  });

  it('no toca nada si no faltan horas', () => {
    const arr = Int32Array.from([0, 60, 120]);
    const dep = Int32Array.from([10, 70, 130]);
    interpolateMissingTimes(arr, dep);
    expect([...arr]).toEqual([0, 60, 120]);
    expect([...dep]).toEqual([10, 70, 130]);
  });

  it('deja sin rellenar los huecos finales', () => {
    const arr = Int32Array.from([0, -1]);
    const dep = Int32Array.from([0, -1]);
    interpolateMissingTimes(arr, dep);
    expect([...dep]).toEqual([0, -1]);
  });
});

describe('buildTransitNetwork', () => {
  it('carga agencias y zona horaria', async () => {
    const n = await buildTestNetwork();
    expect(n.agencies).toEqual([{ id: 'AG', name: 'Agencia Test', url: 'https://example.com', timezone: 'Europe/Madrid' }]);
    expect(n.timezone).toBe('Europe/Madrid');
    expect(n.loadedAt).toEqual(new Date('2026-03-01T00:00:00Z'));
  });

  it('respeta la zona horaria forzada y usa UTC si no hay ninguna', async () => {
    expect((await buildTestNetwork({ timezone: 'America/New_York' })).timezone).toBe('America/New_York');
    expect((await buildTestNetwork({}, { ...TABLES, agency: [] })).timezone).toBe('UTC');
  });

  it('carga paradas descartando las de coordenadas inválidas', async () => {
    const n = await buildTestNetwork();
    expect(n.stops.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X']);
    expect(n.stopIndex.has('BAD')).toBe(false);
    expect(n.stops[stopIdx(n, 'C')]).toEqual({
      id: 'C',
      code: '103',
      name: 'Estación Central',
      lat: 40.4,
      lon: -3.69,
      parentStation: '',
    });
  });

  it('usa el id como nombre si falta stop_name', async () => {
    const n = await buildTestNetwork({}, { ...TABLES, stops: csv('stop_id,stop_name,stop_lat,stop_lon\nZ,,1,1') });
    expect(n.stops[0].name).toBe('Z');
  });

  it('carga líneas con colores normalizados', async () => {
    const n = await buildTestNetwork();
    expect(n.routes.map((r) => [r.id, r.type, r.color, r.textColor])).toEqual([
      ['R1', 3, '#FF0000', '#FFFFFF'],
      ['R2', 0, '#1976D2', '#000000'],
      ['R3', 3, '#00FF00', '#FFFFFF'],
    ]);
  });

  it('carga calendarios y excepciones', async () => {
    const n = await buildTestNetwork();
    const wk = n.services.find((s) => s.id === 'WK')!;
    expect(wk.days).toBe(0b0011111);
    expect(wk.start).toBe('20260101');
    expect(wk.end).toBe('20261231');
    expect([...wk.removed]).toEqual(['20260303']);
    const we = n.services.find((s) => s.id === 'WE')!;
    expect(we.days).toBe(0);
    expect([...we.added]).toEqual(['20260307']);
  });

  it('descarta viajes de líneas inexistentes y expande frequencies.txt', async () => {
    const n = await buildTestNetwork();
    expect(n.trips.map((t) => t.id)).toEqual([
      'T1',
      'T1b',
      'T2',
      'T2b',
      'T3',
      'T4',
      'T5',
      'T3@09:00:00',
      'T3@09:20:00',
      'T3@09:40:00',
    ]);
    const generated = n.trips.filter((t) => t.id.startsWith('T3@'));
    expect(generated.map((t) => t.offset)).toEqual([0, 1200, 2400]);
    expect(new Set(generated.map((t) => t.timesIdx)).size).toBe(1);
  });

  it('ignora frequencies con headway_secs no entero (evita generar millones de viajes)', async () => {
    const n = await buildTestNetwork({}, {
      ...TABLES,
      frequencies: csv('trip_id,start_time,end_time,headway_secs\nT3,09:00:00,10:00:00,0.001\nT3,09:00:00,10:00:00,-5\nT3,,10:00:00,60'),
    });
    expect(n.trips.some((t) => t.id.startsWith('T3@'))).toBe(false);
  });

  it('ordena stop_times por secuencia e interpola horas que faltan', async () => {
    const n = await buildTestNetwork();
    const t2 = n.tripTimes[n.trips[tripIdx(n, 'T2')].timesIdx];
    expect([...t2.stops].map((i) => n.stops[i].id)).toEqual(['C', 'D', 'E']);
    const t1b = n.tripTimes[n.trips[tripIdx(n, 'T1b')].timesIdx];
    expect(t1b.arr[1]).toBe(parseGtfsTime('08:35:00'));
    expect(t1b.dist).toBeNull();
    const t1 = n.tripTimes[n.trips[tripIdx(n, 'T1')].timesIdx];
    expect(t1.stops.length).toBe(3); // la parada desconocida se ignora
    expect([...t1.dist!]).toEqual([0, 424, 848]);
  });

  it('descarta viajes con menos de dos paradas', async () => {
    const n = await buildTestNetwork({}, {
      ...TABLES,
      stop_times: csv('trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,A,1'),
      frequencies: [],
    });
    expect(n.tripTimes).toHaveLength(0);
    expect(n.trips.every((t) => t.timesIdx === -1)).toBe(true);
    expect(n.connections.count).toBe(0);
    expect(n.bounds).toBeNull();
  });

  it('ordena los puntos de las shapes', async () => {
    const n = await buildTestNetwork();
    const s1 = n.shapes.get('S1')!;
    expect([...s1.lat]).toEqual([40.4, 40.4005, 40.4, 40.4005, 40.4]);
    expect([...s1.dist!]).toEqual([0, 212, 424, 636, 848]);
  });

  it('no guarda distancias de shape si falta alguna', async () => {
    const n = await buildTestNetwork({}, {
      ...TABLES,
      shapes: csv('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled\nS9,1,1,1,0\nS9,1,2,2,'),
    });
    expect(n.shapes.get('S9')!.dist).toBeNull();
  });

  it('genera las conexiones ordenadas por hora de salida', async () => {
    const n = await buildTestNetwork();
    const C = n.connections;
    // T1 2 + T1b 2 + T2 2 + T2b 2 + 3x T3 generados 2 + T4 2 + T5 1 (la plantilla T3 no cuenta)
    expect(C.count).toBe(17);
    for (let i = 1; i < C.count; i++) expect(C.depTime[i]).toBeGreaterThanOrEqual(C.depTime[i - 1]);
    const first = 0;
    expect(n.stops[C.depStop[first]].id).toBe('A');
    expect(C.depTime[first]).toBe(parseGtfsTime('08:00:00'));
    expect(n.trips[C.trip[first]].id).toBe('T1');
    // Los viajes de frecuencias llevan su desplazamiento aplicado.
    const genIdx = tripIdx(n, 'T3@09:40:00');
    const genConn = [...C.trip].indexOf(genIdx);
    expect(C.depTime[genConn]).toBe(parseGtfsTime('09:40:00'));
    expect([...n.tripService]).toEqual(n.trips.map((t) => t.serviceIdx));
  });

  it('indexa las salidas de cada parada en orden', async () => {
    const n = await buildTestNetwork();
    const fromA = n.stopDepartures[stopIdx(n, 'A')];
    expect(fromA.length).toBe(6);
    const times = [...fromA].map((c) => n.connections.depTime[c]);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(n.stopDepartures[stopIdx(n, 'X')].length).toBe(0);
  });

  it('crea transbordos a pie entre paradas cercanas', async () => {
    const n = await buildTestNetwork();
    const c = stopIdx(n, 'C');
    const f = stopIdx(n, 'F');
    const meters = haversineMeters(STOPS.C.lat, STOPS.C.lon, STOPS.F.lat, STOPS.F.lon) * BUILD_OPTIONS.walkDistanceFactor;
    expect(n.footpaths[c]).toEqual([{ to: f, meters: Math.round(meters), seconds: Math.round(meters / 1.25) }]);
    expect(n.footpaths[f].map((fp) => fp.to)).toEqual([c]);
    expect(n.footpaths[stopIdx(n, 'A')]).toEqual([]);
  });

  it('solo indexa espacialmente las paradas con servicio', async () => {
    const n = await buildTestNetwork();
    expect(n.spatial.within(40.5, -3.5, 100)).toEqual([]);
    expect(n.spatial.within(STOPS.A.lat, STOPS.A.lon, 10).map((r) => r.idx)).toEqual([stopIdx(n, 'A')]);
    expect(n.bounds).toEqual({ minLat: 40.4, minLon: -3.7, maxLat: 40.41, maxLon: -3.68 });
  });

  it('informa del progreso por el callback de log', async () => {
    const log = vi.fn();
    await buildTransitNetwork(new MemoryTableSource(TABLES), { ...BUILD_OPTIONS, log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('stop_times leídos'));
    expect(log).toHaveBeenCalledWith('Conexiones generadas: 17');
  });
});
