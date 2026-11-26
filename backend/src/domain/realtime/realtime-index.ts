import type { TransitNetwork } from '../network/model.js';
import { addDays, epochToServiceDate, formatGtfsTime, parseGtfsTime, serviceDayBaseEpoch } from '../time/service-time.js';
import { type AlertTarget, alertApplies } from './alerts.js';
import type { RealtimeFeed, RtAlert, RtStopTimeEvent, RtStopTimeUpdate, RtTripDescriptor, RtTripUpdate, RtVehiclePosition } from './model.js';

/** Horas en tiempo real de un viaje concreto (viaje + día de servicio). */
export interface TripRealtime {
  tripIdx: number;
  /** YYYYMMDD */
  serviceDate: string;
  /** epoch s de la base del día de servicio + desplazamiento del viaje: hora programada = baseSec + tripTimes.arr/dep. */
  baseSec: number;
  canceled: boolean;
  /** Llegada y salida previstas por parada (epoch s). */
  arr: Float64Array;
  dep: Float64Array;
  /** 1 si el vehículo no para en esa parada. */
  skipped: Uint8Array;
  /** 1 si la hora viene de una predicción (0 = horario programado). */
  predicted: Uint8Array;
  vehicleId?: string;
}

/** Conexiones de los viajes con datos en tiempo real, en horas reales (epoch s) y ordenadas por salida. */
export interface RealtimeConnections {
  count: number;
  depStop: Int32Array;
  arrStop: Int32Array;
  depTime: Float64Array;
  arrTime: Float64Array;
  /** Índice en RealtimeIndex.instances. */
  instance: Int32Array;
  /** Posiciones de salida y llegada dentro de TripTimes (no consecutivas si hay paradas suprimidas). */
  fromPos: Int32Array;
  toPos: Int32Array;
}

/** Tipos de viaje de GTFS-Realtime que no están en el GTFS estático: no se pueden aplicar. */
const UNSUPPORTED_TRIPS = new Set(['ADDED', 'NEW', 'UNSCHEDULED', 'DUPLICATED']);
const CANCELED_TRIPS = new Set(['CANCELED', 'DELETED']);
const MAX_CACHED_DATES = 8;

interface TripLookup {
  byId: Map<string, number>;
  /** Viajes plantilla de frequencies.txt: no circulan ellos, sino sus copias "id@HH:MM:SS". */
  templates: Set<number>;
}

const lookups = new WeakMap<TransitNetwork, TripLookup>();

function tripLookup(network: TransitNetwork): TripLookup {
  let l = lookups.get(network);
  if (l) return l;
  const byId = new Map<string, number>();
  network.trips.forEach((t, i) => byId.set(t.id, i));
  const templates = new Set<number>();
  network.trips.forEach((t) => {
    const at = t.id.lastIndexOf('@');
    if (at <= 0) return;
    const parent = byId.get(t.id.slice(0, at));
    if (parent !== undefined && network.trips[parent].timesIdx === t.timesIdx) templates.add(parent);
  });
  l = { byId, templates };
  lookups.set(network, l);
  return l;
}

/** Índice del viaje del GTFS estático al que se refiere un descriptor (undefined si no se encuentra). */
export function resolveTrip(network: TransitNetwork, desc: RtTripDescriptor | undefined): number | undefined {
  if (!desc?.tripId) return undefined;
  const { byId, templates } = tripLookup(network);
  if (desc.startTime) {
    const t = parseGtfsTime(desc.startTime);
    if (t >= 0) {
      const idx = byId.get(`${desc.tripId}@${formatGtfsTime(t)}`);
      if (idx !== undefined) return idx;
    }
  }
  const idx = byId.get(desc.tripId);
  if (idx === undefined || templates.has(idx) || network.trips[idx].timesIdx < 0) return undefined;
  return idx;
}

/** trip_id original del GTFS (sin el sufijo "@HH:MM:SS" de los viajes generados desde frequencies.txt). */
export function gtfsTripId(network: TransitNetwork, tripIdx: number): string {
  const id = network.trips[tripIdx].id;
  const at = id.lastIndexOf('@');
  if (at > 0 && tripLookup(network).byId.has(id.slice(0, at))) return id.slice(0, at);
  return id;
}

function tripBaseSec(network: TransitNetwork, tripIdx: number, date: string): number {
  return Math.round(serviceDayBaseEpoch(date, network.timezone) / 1000) + network.trips[tripIdx].offset;
}

/**
 * Día de servicio de un viaje sin start_date: el de ayer, hoy o mañana cuyo
 * horario programado queda más cerca del instante actual.
 */
export function guessServiceDate(network: TransitNetwork, tripIdx: number, nowMs: number): string {
  const today = epochToServiceDate(nowMs, network.timezone);
  const tt = network.tripTimes[network.trips[tripIdx].timesIdx];
  const nowSec = nowMs / 1000;
  let best = today;
  let bestDist = Infinity;
  for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
    const base = tripBaseSec(network, tripIdx, date);
    const start = base + tt.dep[0];
    const end = base + tt.arr[tt.arr.length - 1];
    const dist = nowSec < start ? start - nowSec : nowSec > end ? nowSec - end : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = date;
    }
  }
  return best;
}

/** Asigna cada actualización a una posición del viaje, por stop_sequence o, si falta, por stop_id. */
function matchPositions(network: TransitNetwork, tripIdx: number, updates: RtStopTimeUpdate[]): (RtStopTimeUpdate | undefined)[] {
  const tt = network.tripTimes[network.trips[tripIdx].timesIdx];
  const n = tt.stops.length;
  const byPos: (RtStopTimeUpdate | undefined)[] = new Array(n);
  let from = 0;
  for (const u of updates) {
    let k = -1;
    if (u.stopSequence !== undefined) {
      for (let i = 0; i < n; i++) {
        if (tt.seq[i] === u.stopSequence) {
          k = i;
          break;
        }
      }
    } else if (u.stopId) {
      for (let i = from; i < n; i++) {
        if (network.stops[tt.stops[i]].id === u.stopId) {
          k = i;
          break;
        }
      }
    }
    if (k < 0) continue;
    byPos[k] = u;
    from = k + 1;
  }
  return byPos;
}

function eventTime(ev: RtStopTimeEvent | undefined, scheduled: number): number | null {
  if (!ev) return null;
  if (ev.time !== undefined && ev.time > 0) return ev.time;
  if (ev.delay !== undefined) return scheduled + ev.delay;
  return null;
}

/**
 * Aplica un TripUpdate a un viaje: horas previstas por parada siguiendo las reglas de propagación
 * de GTFS-Realtime (el retraso se arrastra hacia delante hasta la siguiente actualización y NO_DATA lo corta).
 */
export function applyTripUpdate(network: TransitNetwork, tripIdx: number, date: string, tu: RtTripUpdate): TripRealtime {
  const tt = network.tripTimes[network.trips[tripIdx].timesIdx];
  const n = tt.stops.length;
  const baseSec = tripBaseSec(network, tripIdx, date);
  const arr = new Float64Array(n);
  const dep = new Float64Array(n);
  const skipped = new Uint8Array(n);
  const predicted = new Uint8Array(n);
  const byPos = matchPositions(network, tripIdx, tu.stopTimeUpdates);

  let delay: number | null = tu.delay ?? null;
  let prevDep = -Infinity;
  for (let k = 0; k < n; k++) {
    const sa = baseSec + tt.arr[k];
    const sd = baseSec + tt.dep[k];
    const u = byPos[k];
    let a: number | null = null;
    let d: number | null = null;
    if (u?.scheduleRelationship === 'NO_DATA') {
      delay = null;
    } else if (u) {
      a = eventTime(u.arrival, sa);
      d = eventTime(u.departure, sd);
      // Si falta una de las dos se conserva el tiempo de parada programado.
      if (a === null && d !== null) a = d - (sd - sa);
      if (d === null && a !== null) d = a + (sd - sa);
      if (d !== null) delay = d - sd;
      if (u.scheduleRelationship === 'SKIPPED') skipped[k] = 1;
    }
    if (a === null || d === null) {
      a = delay === null ? sa : sa + delay;
      d = delay === null ? sd : sd + delay;
      predicted[k] = delay === null ? 0 : 1;
    } else {
      predicted[k] = 1;
    }
    if (!skipped[k]) {
      a = Math.max(a, prevDep);
      d = Math.max(d, a);
      prevDep = d;
    }
    arr[k] = a;
    dep[k] = d;
  }

  const allSkipped = skipped.every((s) => s === 1);
  return {
    tripIdx,
    serviceDate: date,
    baseSec,
    canceled: CANCELED_TRIPS.has(tu.trip.scheduleRelationship) || allSkipped,
    arr,
    dep,
    skipped,
    predicted,
    vehicleId: tu.vehicleId,
  };
}

export function buildRealtimeConnections(network: TransitNetwork, instances: TripRealtime[]): RealtimeConnections {
  const depStop: number[] = [];
  const arrStop: number[] = [];
  const depTime: number[] = [];
  const arrTime: number[] = [];
  const instance: number[] = [];
  const fromPos: number[] = [];
  const toPos: number[] = [];
  instances.forEach((inst, i) => {
    if (inst.canceled) return;
    const tt = network.tripTimes[network.trips[inst.tripIdx].timesIdx];
    let prev = -1;
    for (let k = 0; k < tt.stops.length; k++) {
      if (inst.skipped[k]) continue;
      if (prev >= 0) {
        depStop.push(tt.stops[prev]);
        arrStop.push(tt.stops[k]);
        depTime.push(inst.dep[prev]);
        arrTime.push(inst.arr[k]);
        instance.push(i);
        fromPos.push(prev);
        toPos.push(k);
      }
      prev = k;
    }
  });

  const count = depStop.length;
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => depTime[a] - depTime[b] || arrTime[a] - arrTime[b] || instance[a] - instance[b] || fromPos[a] - fromPos[b],
  );
  const pick = <T extends Int32Array | Float64Array>(Ctor: new (n: number) => T, src: number[]): T => {
    const out = new Ctor(count);
    for (let i = 0; i < count; i++) out[i] = src[order[i]];
    return out;
  };
  return {
    count,
    depStop: pick(Int32Array, depStop),
    arrStop: pick(Int32Array, arrStop),
    depTime: pick(Float64Array, depTime),
    arrTime: pick(Float64Array, arrTime),
    instance: pick(Int32Array, instance),
    fromPos: pick(Int32Array, fromPos),
    toPos: pick(Int32Array, toPos),
  };
}

/** Datos en tiempo real cruzados con una red concreta, listos para usar en el cálculo de rutas. */
export class RealtimeIndex {
  private readonly byInstance = new Map<string, number>();
  private readonly replacedCache = new Map<string, Uint8Array>();

  constructor(
    readonly network: TransitNetwork,
    readonly instances: TripRealtime[],
    readonly connections: RealtimeConnections,
    /** Posición de los vehículos por id de viaje (el de TransitNetwork.trips). */
    readonly vehicles: Map<string, RtVehiclePosition>,
    readonly alerts: RtAlert[],
    /** epoch ms de los datos más recientes. */
    readonly updatedAt: number,
  ) {
    instances.forEach((inst, i) => this.byInstance.set(`${inst.tripIdx}|${inst.serviceDate}`, i));
  }

  instance(tripIdx: number, date: string): TripRealtime | undefined {
    const i = this.byInstance.get(`${tripIdx}|${date}`);
    return i === undefined ? undefined : this.instances[i];
  }

  /** Máscara (por viaje) de los que tienen datos en tiempo real ese día: sustituyen a su horario programado. */
  replacedOn(date: string): Uint8Array {
    let mask = this.replacedCache.get(date);
    if (mask) return mask;
    mask = new Uint8Array(this.network.trips.length);
    for (const inst of this.instances) if (inst.serviceDate === date) mask[inst.tripIdx] = 1;
    if (this.replacedCache.size >= MAX_CACHED_DATES) this.replacedCache.clear();
    this.replacedCache.set(date, mask);
    return mask;
  }

  alertsFor(target: AlertTarget, fromSec: number, toSec: number): RtAlert[] {
    return this.alerts.filter((a) => alertApplies(a, target, fromSec, toSec));
  }
}

/** Cruza los feeds en tiempo real con la red: horas previstas, conexiones, vehículos y avisos. */
export function buildRealtimeIndex(network: TransitNetwork, feeds: RealtimeFeed[], nowMs: number): RealtimeIndex {
  // Un viaje puede venir repetido (varios feeds): se queda la actualización más reciente.
  const chosen = new Map<string, { tripIdx: number; date: string; tu: RtTripUpdate }>();
  for (const feed of feeds) {
    for (const tu of feed.tripUpdates) {
      if (UNSUPPORTED_TRIPS.has(tu.trip.scheduleRelationship)) continue;
      const tripIdx = resolveTrip(network, tu.trip);
      if (tripIdx === undefined) continue;
      const date = tu.trip.startDate && /^\d{8}$/.test(tu.trip.startDate) ? tu.trip.startDate : guessServiceDate(network, tripIdx, nowMs);
      const key = `${tripIdx}|${date}`;
      const prev = chosen.get(key);
      if (!prev || (tu.timestamp ?? 0) >= (prev.tu.timestamp ?? 0)) chosen.set(key, { tripIdx, date, tu });
    }
  }
  const instances = [...chosen.values()].map((c) => applyTripUpdate(network, c.tripIdx, c.date, c.tu));

  // Vehículos: por su viaje o, si no lo indican, por el viaje que les asigna un TripUpdate.
  const tripOfVehicle = new Map<string, string>();
  for (const inst of instances) if (inst.vehicleId) tripOfVehicle.set(inst.vehicleId, network.trips[inst.tripIdx].id);
  const vehicles = new Map<string, RtVehiclePosition>();
  for (const feed of feeds) {
    for (const v of feed.vehicles) {
      const idx = resolveTrip(network, v.trip);
      const tripId = idx !== undefined ? network.trips[idx].id : v.vehicleId ? tripOfVehicle.get(v.vehicleId) : undefined;
      if (!tripId) continue;
      const prev = vehicles.get(tripId);
      if (!prev || (v.timestamp ?? 0) >= (prev.timestamp ?? 0)) vehicles.set(tripId, v);
    }
  }

  const alerts = new Map<string, RtAlert>();
  for (const feed of feeds) for (const a of feed.alerts) alerts.set(a.id, a);

  const stamps = feeds.map((f) => f.timestamp).filter((t): t is number => t !== undefined);
  const updatedAt = stamps.length > 0 ? Math.max(...stamps) * 1000 : nowMs;
  return new RealtimeIndex(network, instances, buildRealtimeConnections(network, instances), vehicles, [...alerts.values()], updatedAt);
}
