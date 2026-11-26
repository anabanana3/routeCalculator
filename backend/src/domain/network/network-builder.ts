import { computeBounds } from '../geo/geo.js';
import { SpatialIndex } from '../geo/spatial-index.js';
import { formatGtfsTime, parseGtfsTime } from '../time/service-time.js';
import { type GtfsTableSource, readAll, type Row } from './gtfs-table-source.js';
import type {
  Agency,
  Connections,
  Footpath,
  Route,
  Service,
  Shape,
  Stop,
  TransitNetwork,
  Trip,
  TripTimes,
} from './model.js';

export interface BuildOptions {
  /** Zona horaria forzada; si no se indica se usa la de agency.txt. */
  timezone?: string;
  maxTransferMeters: number;
  walkSpeedMps: number;
  walkDistanceFactor: number;
  log?: (msg: string) => void;
  now?: () => number;
}

const DAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function v(row: Row, key: string): string {
  return row[key] ?? '';
}

/** Normaliza un color GTFS a "#RRGGBB" (evita valores arbitrarios que acaben en estilos del cliente). */
export function normalizeColor(value: string, fallback: string): string {
  const c = value.replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(c) ? `#${c.toUpperCase()}` : fallback;
}

export async function buildTransitNetwork(dir: GtfsTableSource, opts: BuildOptions): Promise<TransitNetwork> {
  const log = opts.log ?? (() => {});
  const started = (opts.now ?? Date.now)();

  // --- agency ---
  const agencies: Agency[] = (await readAll(dir, 'agency')).map((r) => ({
    id: v(r, 'agency_id'),
    name: v(r, 'agency_name'),
    url: v(r, 'agency_url'),
    timezone: v(r, 'agency_timezone'),
  }));
  const timezone = opts.timezone || agencies.find((a) => a.timezone)?.timezone || 'UTC';

  // --- stops ---
  const stops: Stop[] = [];
  const stopIndex = new Map<string, number>();
  await dir.forEach('stops', (r) => {
    const lat = Number(v(r, 'stop_lat'));
    const lon = Number(v(r, 'stop_lon'));
    const id = v(r, 'stop_id');
    if (!id || Number.isNaN(lat) || Number.isNaN(lon)) return;
    stopIndex.set(id, stops.length);
    stops.push({
      id,
      code: v(r, 'stop_code'),
      name: v(r, 'stop_name') || id,
      lat,
      lon,
      parentStation: v(r, 'parent_station'),
    });
  });

  // --- routes ---
  const routes: Route[] = [];
  const routeIndex = new Map<string, number>();
  await dir.forEach('routes', (r) => {
    const id = v(r, 'route_id');
    routeIndex.set(id, routes.length);
    routes.push({
      id,
      agencyId: v(r, 'agency_id'),
      shortName: v(r, 'route_short_name'),
      longName: v(r, 'route_long_name'),
      type: Number(v(r, 'route_type') || 3),
      color: normalizeColor(v(r, 'route_color'), '#1976D2'),
      textColor: normalizeColor(v(r, 'route_text_color'), '#FFFFFF'),
    });
  });

  // --- calendar / calendar_dates ---
  const services: Service[] = [];
  const serviceIndex = new Map<string, number>();
  const getService = (id: string): Service => {
    let idx = serviceIndex.get(id);
    if (idx === undefined) {
      idx = services.length;
      serviceIndex.set(id, idx);
      services.push({ id, days: 0, start: '', end: '', added: new Set(), removed: new Set() });
    }
    return services[idx];
  };
  await dir.forEach('calendar', (r) => {
    const s = getService(v(r, 'service_id'));
    s.days = DAY_COLUMNS.reduce((mask, col, i) => (v(r, col) === '1' ? mask | (1 << i) : mask), 0);
    s.start = v(r, 'start_date');
    s.end = v(r, 'end_date');
  });
  await dir.forEach('calendar_dates', (r) => {
    const s = getService(v(r, 'service_id'));
    const date = v(r, 'date');
    if (v(r, 'exception_type') === '1') s.added.add(date);
    else if (v(r, 'exception_type') === '2') s.removed.add(date);
  });

  // --- trips ---
  const trips: Trip[] = [];
  const tripIndex = new Map<string, number>();
  await dir.forEach('trips', (r) => {
    const routeIdx = routeIndex.get(v(r, 'route_id'));
    if (routeIdx === undefined) return;
    const id = v(r, 'trip_id');
    tripIndex.set(id, trips.length);
    const serviceId = v(r, 'service_id');
    getService(serviceId);
    trips.push({
      id,
      routeIdx,
      serviceIdx: serviceIndex.get(serviceId)!,
      headsign: v(r, 'trip_headsign'),
      shapeId: v(r, 'shape_id'),
      directionId: Number(v(r, 'direction_id') || 0),
      timesIdx: -1,
      offset: 0,
    });
  });

  // --- stop_times (streaming) ---
  interface Tmp {
    seq: number[];
    stop: number[];
    arr: number[];
    dep: number[];
    dist: number[];
  }
  const tmp = new Map<number, Tmp>();
  const stopTimesCount = await dir.forEach('stop_times', (r) => {
    const tripIdx = tripIndex.get(v(r, 'trip_id') as string);
    const stopIdx = stopIndex.get(v(r, 'stop_id') as string);
    if (tripIdx === undefined || stopIdx === undefined) return;
    let t = tmp.get(tripIdx);
    if (!t) {
      t = { seq: [], stop: [], arr: [], dep: [], dist: [] };
      tmp.set(tripIdx, t);
    }
    const distRaw = v(r, 'shape_dist_traveled');
    t.seq.push(Number(v(r, 'stop_sequence')));
    t.stop.push(stopIdx);
    t.arr.push(parseGtfsTime(v(r, 'arrival_time')));
    t.dep.push(parseGtfsTime(v(r, 'departure_time')));
    t.dist.push(distRaw === '' ? Number.NaN : Number(distRaw));
  });
  log(`stop_times leídos: ${stopTimesCount}`);

  const tripTimes: TripTimes[] = [];
  for (const [tripIdx, t] of tmp) {
    const n = t.seq.length;
    if (n < 2) continue;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => t.seq[a] - t.seq[b]);
    const stopsArr = new Int32Array(n);
    const seqArr = new Int32Array(n);
    const arr = new Int32Array(n);
    const dep = new Int32Array(n);
    const dist = new Float64Array(n);
    let hasDist = false;
    for (let k = 0; k < n; k++) {
      const i = order[k];
      stopsArr[k] = t.stop[i];
      seqArr[k] = t.seq[i];
      let a = t.arr[i];
      let d = t.dep[i];
      if (a < 0) a = d;
      if (d < 0) d = a;
      arr[k] = a;
      dep[k] = d;
      dist[k] = t.dist[i];
      if (!Number.isNaN(t.dist[i])) hasDist = true;
    }
    interpolateMissingTimes(arr, dep);
    if (arr[0] < 0 || dep[n - 1] < 0) continue;
    trips[tripIdx].timesIdx = tripTimes.length;
    tripTimes.push({ stops: stopsArr, seq: seqArr, arr, dep, dist: hasDist ? dist : null });
  }
  tmp.clear();

  // --- frequencies: expande los viajes plantilla ---
  const templateTrips = new Set<number>();
  await dir.forEach('frequencies', (r) => {
    const tripIdx = tripIndex.get(v(r, 'trip_id'));
    if (tripIdx === undefined) return;
    const template = trips[tripIdx];
    if (template.timesIdx < 0) return;
    const start = parseGtfsTime(v(r, 'start_time'));
    const end = parseGtfsTime(v(r, 'end_time'));
    const headway = Number(v(r, 'headway_secs'));
    // headway_secs es un entero positivo según la especificación; valores fraccionarios dispararían el número de viajes.
    if (start < 0 || end < 0 || !Number.isInteger(headway) || headway < 1) return;
    templateTrips.add(tripIdx);
    const base = tripTimes[template.timesIdx].dep[0];
    for (let t = start; t < end; t += headway) {
      trips.push({ ...template, id: `${template.id}@${formatGtfsTime(t)}`, offset: t - base });
    }
  });

  // --- shapes ---
  const shapeTmp = new Map<string, { seq: number[]; lat: number[]; lon: number[]; dist: number[] }>();
  await dir.forEach('shapes', (r) => {
    const id = v(r, 'shape_id');
    let s = shapeTmp.get(id);
    if (!s) {
      s = { seq: [], lat: [], lon: [], dist: [] };
      shapeTmp.set(id, s);
    }
    const distRaw = v(r, 'shape_dist_traveled');
    s.seq.push(Number(v(r, 'shape_pt_sequence')));
    s.lat.push(Number(v(r, 'shape_pt_lat')));
    s.lon.push(Number(v(r, 'shape_pt_lon')));
    s.dist.push(distRaw === '' ? Number.NaN : Number(distRaw));
  });
  const shapes = new Map<string, Shape>();
  for (const [id, s] of shapeTmp) {
    const n = s.seq.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => s.seq[a] - s.seq[b]);
    const lat = new Float64Array(n);
    const lon = new Float64Array(n);
    const dist = new Float64Array(n);
    let hasDist = true;
    order.forEach((i, k) => {
      lat[k] = s.lat[i];
      lon[k] = s.lon[i];
      dist[k] = s.dist[i];
      if (Number.isNaN(s.dist[i])) hasDist = false;
    });
    shapes.set(id, { lat, lon, dist: hasDist ? dist : null });
  }
  shapeTmp.clear();

  // --- connections ---
  const connections = buildConnections(trips, tripTimes, templateTrips);
  const tripService = Int32Array.from(trips, (t) => t.serviceIdx);
  log(`Conexiones generadas: ${connections.count}`);

  // --- salidas por parada ---
  const stopDepartures = buildStopDepartures(stops.length, connections);

  // --- paradas en uso, índice espacial y transbordos a pie ---
  const used = new Uint8Array(stops.length);
  for (let c = 0; c < connections.count; c++) {
    used[connections.depStop[c]] = 1;
    used[connections.arrStop[c]] = 1;
  }
  const usedPoints = stops
    .map((s, idx) => ({ idx, lat: s.lat, lon: s.lon }))
    .filter((p) => used[p.idx] === 1);
  const spatial = new SpatialIndex(usedPoints);
  const footpaths = buildFootpaths(stops, usedPoints, spatial, opts);

  return {
    timezone,
    agencies,
    stops,
    stopIndex,
    routes,
    trips,
    tripTimes,
    services,
    shapes,
    connections,
    tripService,
    stopDepartures,
    footpaths,
    spatial,
    bounds: computeBounds(usedPoints),
    loadedAt: new Date(started),
  };
}

/** Rellena por interpolación lineal las horas que faltan (paradas que no son "timepoint"). */
export function interpolateMissingTimes(arr: Int32Array, dep: Int32Array): void {
  const n = arr.length;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (dep[i] >= 0) {
      if (prev >= 0 && i - prev > 1) {
        const t0 = dep[prev];
        const t1 = arr[i];
        for (let k = prev + 1; k < i; k++) {
          const t = Math.round(t0 + ((t1 - t0) * (k - prev)) / (i - prev));
          arr[k] = t;
          dep[k] = t;
        }
      }
      prev = i;
    }
  }
}

function buildConnections(trips: Trip[], tripTimes: TripTimes[], templates: Set<number>): Connections {
  let count = 0;
  trips.forEach((trip, idx) => {
    if (trip.timesIdx >= 0 && !templates.has(idx)) {
      count += tripTimes[trip.timesIdx].stops.length - 1;
    }
  });

  const depStop = new Int32Array(count);
  const arrStop = new Int32Array(count);
  const depTime = new Int32Array(count);
  const arrTime = new Int32Array(count);
  const trip = new Int32Array(count);
  const pos = new Int32Array(count);

  let c = 0;
  trips.forEach((t, idx) => {
    if (t.timesIdx < 0 || templates.has(idx)) return;
    const tt = tripTimes[t.timesIdx];
    for (let i = 0; i < tt.stops.length - 1; i++) {
      depStop[c] = tt.stops[i];
      arrStop[c] = tt.stops[i + 1];
      depTime[c] = tt.dep[i] + t.offset;
      arrTime[c] = tt.arr[i + 1] + t.offset;
      trip[c] = idx;
      pos[c] = i;
      c++;
    }
  });

  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((a, b) => depTime[a] - depTime[b] || arrTime[a] - arrTime[b] || trip[a] - trip[b] || pos[a] - pos[b]);

  const permute = (src: Int32Array) => {
    const out = new Int32Array(count);
    for (let i = 0; i < count; i++) out[i] = src[order[i]];
    return out;
  };

  return {
    count,
    depStop: permute(depStop),
    arrStop: permute(arrStop),
    depTime: permute(depTime),
    arrTime: permute(arrTime),
    trip: permute(trip),
    pos: permute(pos),
  };
}

function buildStopDepartures(stopCount: number, conn: Connections): Int32Array[] {
  const counts = new Int32Array(stopCount);
  for (let c = 0; c < conn.count; c++) counts[conn.depStop[c]]++;
  const result = Array.from({ length: stopCount }, (_, i) => new Int32Array(counts[i]));
  const fill = new Int32Array(stopCount);
  for (let c = 0; c < conn.count; c++) {
    const s = conn.depStop[c];
    result[s][fill[s]++] = c;
  }
  return result;
}

function buildFootpaths(
  stops: Stop[],
  usedPoints: { idx: number }[],
  spatial: SpatialIndex,
  opts: BuildOptions,
): Footpath[][] {
  const footpaths: Footpath[][] = Array.from({ length: stops.length }, () => []);
  for (const { idx } of usedPoints) {
    const s = stops[idx];
    for (const near of spatial.within(s.lat, s.lon, opts.maxTransferMeters)) {
      if (near.idx === idx) continue;
      const meters = near.meters * opts.walkDistanceFactor;
      footpaths[idx].push({
        to: near.idx,
        meters: Math.round(meters),
        seconds: Math.max(1, Math.round(meters / opts.walkSpeedMps)),
      });
    }
  }
  return footpaths;
}
