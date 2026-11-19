import type { GtfsTableSource, Row } from '../../src/domain/network/gtfs-table-source.js';
import type { TransitNetwork } from '../../src/domain/network/model.js';
import { buildTransitNetwork, type BuildOptions } from '../../src/domain/network/network-builder.js';
import type { RoutingOptions } from '../../src/domain/routing/routing-options.js';

/** Tablas GTFS en memoria. */
export class MemoryTableSource implements GtfsTableSource {
  constructor(private readonly tables: Record<string, Row[]>) {}

  async forEach(table: string, cb: (row: Row) => void): Promise<number> {
    const rows = this.tables[table] ?? [];
    rows.forEach(cb);
    return rows.length;
  }
}

/** Convierte un CSV sencillo (sin comillas) en filas. */
export function csv(text: string): Row[] {
  const [header, ...lines] = text.trim().split('\n').map((l) => l.trim());
  const cols = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, values[i] ?? '']));
  });
}

/*
 * Red de prueba (Europe/Madrid). El 2 de marzo de 2026 es lunes (CET, UTC+1).
 *
 *   A ---R1(bus)--- B ---R1--- C ---R3--- F ... G
 *                              |
 *                              R2 (tranvía)
 *                              |
 *                              D
 *                              |
 *                              E
 */
export const STOPS = {
  A: { lat: 40.4, lon: -3.7 },
  B: { lat: 40.4, lon: -3.695 },
  C: { lat: 40.4, lon: -3.69 },
  D: { lat: 40.405, lon: -3.69 },
  E: { lat: 40.41, lon: -3.69 },
  F: { lat: 40.4, lon: -3.6888 },
  G: { lat: 40.4, lon: -3.68 },
};

export const TABLES: Record<string, Row[]> = {
  agency: csv(`
    agency_id,agency_name,agency_url,agency_timezone
    AG,Agencia Test,https://example.com,Europe/Madrid
  `),
  stops: csv(`
    stop_id,stop_code,stop_name,stop_lat,stop_lon,parent_station
    A,101,Plaza Mayor,40.4,-3.7,
    B,102,Calle Real,40.4,-3.695,
    C,103,Estación Central,40.4,-3.69,
    D,104,Hospital,40.405,-3.69,
    E,105,Universidad,40.41,-3.69,
    F,,Mercado,40.4,-3.6888,
    G,107,Puerto,40.4,-3.68,
    X,999,Parada sin servicio,40.5,-3.5,
    BAD,998,Coordenadas rotas,abc,-3.5,
  `),
  routes: csv(`
    route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color
    R1,AG,1,Plaza Mayor - Estación,3,ff0000,
    R2,AG,T2,Estación - Universidad,0,zzz,000000
    R3,AG,3,Estación - Puerto,3,#00ff00,FFFFFF
  `),
  calendar: csv(`
    service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
    WK,1,1,1,1,1,0,0,20260101,20261231
  `),
  calendar_dates: csv(`
    service_id,date,exception_type
    WK,20260303,2
    WE,20260307,1
  `),
  trips: csv(`
    route_id,service_id,trip_id,trip_headsign,direction_id,shape_id
    R1,WK,T1,Estación,0,S1
    R1,WK,T1b,Estación,0,S1
    R2,WK,T2,Universidad,0,
    R2,WK,T2b,Universidad,0,
    R1,WK,T3,Estación,0,
    R1,WK,T4,Estación (nocturno),0,
    R3,WK,T5,Puerto,1,
    NOPE,WK,TX,Fantasma,0,
  `),
  stop_times: csv(`
    trip_id,arrival_time,departure_time,stop_id,stop_sequence,shape_dist_traveled
    T1,08:00:00,08:00:00,A,1,0
    T1,08:05:00,08:05:00,B,2,424
    T1,08:10:00,08:10:00,C,3,848
    T1b,08:30:00,08:30:00,A,1,
    T1b,,,B,2,
    T1b,08:40:00,08:40:00,C,3,
    T2,08:25:00,08:25:00,E,3,
    T2,08:20:00,08:20:00,D,2,
    T2,08:15:00,08:15:00,C,1,
    T2b,08:45:00,08:45:00,C,1,
    T2b,08:50:00,08:50:00,D,2,
    T2b,08:55:00,08:55:00,E,3,
    T3,09:00:00,09:00:00,A,1,
    T3,09:05:00,09:05:00,B,2,
    T3,09:10:00,09:10:00,C,3,
    T4,24:30:00,24:30:00,A,1,
    T4,24:35:00,24:35:00,B,2,
    T4,24:40:00,24:40:00,C,3,
    T5,08:12:00,08:12:00,F,1,
    T5,08:20:00,08:20:00,G,2,
    TX,08:00:00,08:00:00,A,1,
    TX,08:10:00,08:10:00,C,2,
    T1,08:00:00,08:00:00,UNKNOWN,4,
  `),
  frequencies: csv(`
    trip_id,start_time,end_time,headway_secs
    T3,09:00:00,10:00:00,1200
    T3,10:00:00,11:00:00,0.5
    UNKNOWN,09:00:00,10:00:00,600
  `),
  shapes: csv(`
    shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled
    S1,40.4,-3.7,1,0
    S1,40.4,-3.695,3,424
    S1,40.4005,-3.6975,2,212
    S1,40.4005,-3.6925,4,636
    S1,40.4,-3.69,5,848
  `),
};

export const BUILD_OPTIONS: BuildOptions = {
  maxTransferMeters: 300,
  walkSpeedMps: 1.25,
  walkDistanceFactor: 1.25,
  now: () => Date.parse('2026-03-01T00:00:00Z'),
};

export const ROUTING_OPTIONS: RoutingOptions = {
  maxWalkMeters: 400,
  maxTransferMeters: 300,
  maxDirectWalkMeters: 1000,
  walkSpeedMps: 1.25,
  walkDistanceFactor: 1.25,
  minTransferSeconds: 60,
  maxItineraries: 3,
  maxSearchHours: 6,
  ignoreServiceCalendar: false,
};

export function buildTestNetwork(overrides: Partial<BuildOptions> = {}, tables = TABLES): Promise<TransitNetwork> {
  return buildTransitNetwork(new MemoryTableSource(tables), { ...BUILD_OPTIONS, ...overrides });
}

export function stopIdx(network: TransitNetwork, id: string): number {
  const idx = network.stopIndex.get(id);
  if (idx === undefined) throw new Error(`Parada ${id} no encontrada`);
  return idx;
}

export function tripIdx(network: TransitNetwork, id: string): number {
  const idx = network.trips.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error(`Viaje ${id} no encontrado`);
  return idx;
}

/** Cerca de una parada, desplazado unos metros hacia el oeste. */
export function near(p: { lat: number; lon: number }, metersWest = 20) {
  return { lat: p.lat, lon: p.lon - metersWest / 84_800 };
}
