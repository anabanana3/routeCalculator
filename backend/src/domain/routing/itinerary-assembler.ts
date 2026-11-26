import { type LatLon, polylineLength } from '../geo/geo.js';
import type { Stop, TransitNetwork } from '../network/model.js';
import type { AlertTarget } from '../realtime/alerts.js';
import type { RtAlert } from '../realtime/model.js';
import { gtfsTripId, type RealtimeIndex } from '../realtime/realtime-index.js';
import { SECONDS_PER_DAY } from '../time/service-time.js';
import type { RawJourney, RawLeg } from './csa.js';
import { tripLegGeometry } from './geometry.js';
import type { AlertInfo, Itinerary, Leg, Place, RouteInfo } from './itinerary.js';
import { routeTypeToMode } from './route-mode.js';

export const NEXT_DEPARTURES = 3;
/** Con datos en tiempo real, cuánto antes de la hora buscada se miran salidas programadas que puedan ir con retraso. */
export const REALTIME_LOOKBACK_SECONDS = 3600;

/** Datos en tiempo real de una consulta. */
export interface QueryRealtime {
  index: RealtimeIndex;
  /** Fechas de servicio (YYYYMMDD) del día anterior, el consultado y el siguiente. */
  dates: [string, string, string];
}

/** Contexto temporal de una consulta: base del día de servicio y servicios activos (día -1, 0, +1). */
export interface QueryContext {
  /** epoch ms de la base del día de servicio consultado. */
  base: number;
  actives: [Uint8Array, Uint8Array, Uint8Array];
  realtime?: QueryRealtime;
}

interface Draft {
  leg: Leg;
  start: number;
  end: number;
}

type TransitRaw = Extract<RawLeg, { kind: 'transit' }>;

/** Convierte los viajes "en bruto" del algoritmo en itinerarios con tramos, horas y geometría. */
export class ItineraryAssembler {
  constructor(private readonly network: TransitNetwork) {}

  fromJourney(j: RawJourney, from: LatLon, to: LatLon, ctx: QueryContext): Itinerary {
    const d = this.network;
    const at = (seconds: number) => ctx.base + seconds * 1000;
    const originPlace: Place = { name: 'Origen', lat: from.lat, lon: from.lon };
    const destPlace: Place = { name: 'Destino', lat: to.lat, lon: to.lon };

    // Primero se calculan los tiempos de los tramos en vehículo; los tramos a pie se ajustan alrededor.
    const drafts: Draft[] = [];
    let cursor = 0;

    for (const raw of j.legs) {
      if (raw.kind === 'transit') {
        const draft = raw.realtime ? this.realtimeTransit(raw, ctx) : this.scheduledTransit(raw, ctx);
        drafts.push(draft);
        cursor = draft.end;
        continue;
      }

      const fromPlace = raw.kind === 'access' ? originPlace : stopPlace(d.stops[raw.fromStop]);
      const toPlace = raw.kind === 'egress' ? destPlace : stopPlace(d.stops[raw.toStop]);
      const start = cursor;
      const end = start + raw.seconds;
      drafts.push({
        start,
        end,
        leg: {
          mode: 'WALK',
          from: fromPlace,
          to: toPlace,
          startTime: 0,
          endTime: 0,
          durationSeconds: raw.seconds,
          distanceMeters: raw.meters,
          geometry: [
            [fromPlace.lat, fromPlace.lon],
            [toPlace.lat, toPlace.lon],
          ],
        },
      });
      cursor = end;
    }

    const merged = adjustWalkLegs(drafts);
    const legs = merged.map((m) => {
      m.leg.startTime = at(m.start);
      m.leg.endTime = at(m.end);
      return m.leg;
    });
    return summarize(legs, at(merged[0].start), at(merged[merged.length - 1].end));
  }

  /** Tramo con las horas del horario programado. */
  private scheduledTransit(raw: TransitRaw, ctx: QueryContext): Draft {
    const d = this.network;
    const C = d.connections;
    const at = (seconds: number) => ctx.base + seconds * 1000;
    const tripIdx = C.trip[raw.board];
    const trip = d.trips[tripIdx];
    const times = d.tripTimes[trip.timesIdx];
    const fromPos = C.pos[raw.board];
    const toPos = C.pos[raw.alight] + 1;
    const shift = trip.offset + raw.shift;
    const start = times.dep[fromPos] + shift;
    const end = times.arr[toPos] + shift;
    const intermediateStops: Place[] = [];
    for (let k = fromPos + 1; k < toPos; k++) {
      intermediateStops.push(stopPlace(d.stops[times.stops[k]], at(times.arr[k] + shift)));
    }
    const leg = this.transitLeg(tripIdx, fromPos, toPos, at(start), at(end), intermediateStops);
    leg.nextDepartures = this.departuresFrom(C.depStop[raw.board], C.arrStop[raw.board], trip.routeIdx, start, ctx).map(at);
    this.attachAlerts(leg, tripIdx, ctx);
    return { start, end, leg };
  }

  /** Tramo con las horas previstas por GTFS-Realtime. */
  private realtimeTransit(raw: TransitRaw, ctx: QueryContext): Draft {
    const d = this.network;
    const rt = ctx.realtime!.index;
    const R = rt.connections;
    const baseSec = ctx.base / 1000;
    const inst = rt.instances[R.instance[raw.board]];
    const trip = d.trips[inst.tripIdx];
    const times = d.tripTimes[trip.timesIdx];
    const fromPos = R.fromPos[raw.board];
    const toPos = R.toPos[raw.alight];
    const start = inst.dep[fromPos] - baseSec;
    const end = inst.arr[toPos] - baseSec;
    const intermediateStops: Place[] = [];
    for (let k = fromPos + 1; k < toPos; k++) {
      if (!inst.skipped[k]) intermediateStops.push(stopPlace(d.stops[times.stops[k]], inst.arr[k] * 1000));
    }
    const leg = this.transitLeg(inst.tripIdx, fromPos, toPos, inst.dep[fromPos] * 1000, inst.arr[toPos] * 1000, intermediateStops);
    if (inst.predicted[fromPos] || inst.predicted[toPos]) {
      const scheduledStart = inst.baseSec + times.dep[fromPos];
      const scheduledEnd = inst.baseSec + times.arr[toPos];
      leg.realtime = {
        scheduledStartTime: scheduledStart * 1000,
        scheduledEndTime: scheduledEnd * 1000,
        departureDelaySeconds: Math.round(inst.dep[fromPos] - scheduledStart),
        arrivalDelaySeconds: Math.round(inst.arr[toPos] - scheduledEnd),
      };
      if (inst.vehicleId) leg.realtime.vehicleId = inst.vehicleId;
    }
    leg.nextDepartures = this.departuresFrom(times.stops[fromPos], times.stops[fromPos + 1], trip.routeIdx, start, ctx).map(
      (s) => ctx.base + s * 1000,
    );
    this.attachAlerts(leg, inst.tripIdx, ctx);
    return { start, end, leg };
  }

  private transitLeg(tripIdx: number, fromPos: number, toPos: number, startMs: number, endMs: number, intermediateStops: Place[]): Leg {
    const d = this.network;
    const trip = d.trips[tripIdx];
    const times = d.tripTimes[trip.timesIdx];
    const geometry = tripLegGeometry(d, trip, fromPos, toPos);
    return {
      mode: routeTypeToMode(d.routes[trip.routeIdx].type),
      from: stopPlace(d.stops[times.stops[fromPos]], startMs),
      to: stopPlace(d.stops[times.stops[toPos]], endMs),
      startTime: 0,
      endTime: 0,
      durationSeconds: Math.round((endMs - startMs) / 1000),
      distanceMeters: Math.round(polylineLength(geometry)),
      geometry,
      route: this.routeInfo(trip.routeIdx),
      tripId: trip.id,
      headsign: trip.headsign || undefined,
      intermediateStops,
    };
  }

  /** Avisos vigentes durante el tramo que afectan a su línea, viaje o paradas de subida y bajada. */
  private attachAlerts(leg: Leg, tripIdx: number, ctx: QueryContext): void {
    const rt = ctx.realtime?.index;
    if (!rt || rt.alerts.length === 0) return;
    const d = this.network;
    const trip = d.trips[tripIdx];
    const route = d.routes[trip.routeIdx];
    const stopIds = new Set<string>();
    for (const p of [leg.from, leg.to]) {
      if (!p.stopId) continue;
      stopIds.add(p.stopId);
      const idx = d.stopIndex.get(p.stopId);
      const parent = idx === undefined ? '' : d.stops[idx].parentStation;
      if (parent) stopIds.add(parent);
    }
    const target: AlertTarget = {
      agencyId: route.agencyId || d.agencies[0]?.id || '',
      routeId: route.id,
      routeType: route.type,
      directionId: trip.directionId,
      tripId: gtfsTripId(d, tripIdx),
      stopIds,
    };
    const alerts = rt.alertsFor(target, leg.from.time! / 1000, leg.to.time! / 1000);
    if (alerts.length > 0) leg.alerts = alerts.map(toAlertInfo);
  }

  /** Itinerario solo a pie en línea recta (ya corregida con el factor de distancia). */
  walkOnly(from: LatLon, to: LatLon, startEpoch: number, meters: number, walkSpeedMps: number): Itinerary {
    const seconds = Math.round(meters / walkSpeedMps);
    const endEpoch = startEpoch + seconds * 1000;
    const leg: Leg = {
      mode: 'WALK',
      from: { name: 'Origen', lat: from.lat, lon: from.lon },
      to: { name: 'Destino', lat: to.lat, lon: to.lon },
      startTime: startEpoch,
      endTime: endEpoch,
      durationSeconds: seconds,
      distanceMeters: Math.round(meters),
      geometry: [
        [from.lat, from.lon],
        [to.lat, to.lon],
      ],
    };
    return summarize([leg], startEpoch, endEpoch);
  }

  /** Próximas salidas (segundos desde la base) de la misma línea y sentido desde la parada de la conexión. */
  nextDepartures(connIdx: number, fromTime: number, ctx: QueryContext): number[] {
    const C = this.network.connections;
    return this.departuresFrom(C.depStop[connIdx], C.arrStop[connIdx], this.network.trips[C.trip[connIdx]].routeIdx, fromTime, ctx);
  }

  /**
   * Próximas salidas (segundos desde la base) desde `stop` hacia `nextStop` de la línea indicada.
   * Con datos en tiempo real se usan las horas previstas y se omiten los viajes cancelados
   * o que no paran; por eso se miran también salidas programadas algo anteriores.
   */
  departuresFrom(stop: number, nextStop: number, routeIdx: number, fromTime: number, ctx: QueryContext): number[] {
    const d = this.network;
    const C = d.connections;
    const list = d.stopDepartures[stop];
    const rt = ctx.realtime;
    const baseSec = ctx.base / 1000;
    const searchFrom = rt ? fromTime - REALTIME_LOOKBACK_SECONDS : fromTime;
    const result: number[] = [];

    for (let k = 0; k < 3; k++) {
      const shift = (k - 1) * SECONDS_PER_DAY;
      const active = ctx.actives[k];
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (C.depTime[list[mid]] + shift < searchFrom) lo = mid + 1;
        else hi = mid;
      }
      let found = 0;
      for (let i = lo; i < list.length && found < NEXT_DEPARTURES; i++) {
        const c = list[i];
        const tripIdx = C.trip[c];
        const trip = d.trips[tripIdx];
        if (trip.routeIdx !== routeIdx || C.arrStop[c] !== nextStop) continue;
        if (active[trip.serviceIdx] === 0) continue;
        let t = C.depTime[c] + shift;
        const inst = rt?.index.instance(tripIdx, rt.dates[k]);
        if (inst) {
          if (inst.canceled || inst.skipped[C.pos[c]]) continue;
          t = Math.round(inst.dep[C.pos[c]] - baseSec);
        }
        if (t < fromTime) continue;
        result.push(t);
        found++;
      }
    }
    return [...new Set(result)].sort((a, b) => a - b).slice(0, NEXT_DEPARTURES);
  }

  routeInfo(routeIdx: number): RouteInfo {
    const r = this.network.routes[routeIdx];
    const agency = this.network.agencies.find((a) => a.id === r.agencyId) ?? this.network.agencies[0];
    return {
      id: r.id,
      shortName: r.shortName,
      longName: r.longName,
      type: r.type,
      color: r.color,
      textColor: r.textColor,
      agencyName: agency?.name,
    };
  }
}

export function stopPlace(stop: Stop, time?: number): Place {
  return { name: stop.name, lat: stop.lat, lon: stop.lon, stopId: stop.id, stopCode: stop.code || undefined, time };
}

export function toAlertInfo(a: RtAlert): AlertInfo {
  return {
    id: a.id,
    header: a.header,
    description: a.description,
    url: a.url,
    cause: a.cause,
    effect: a.effect,
    severity: a.severity,
  };
}

/**
 * Une tramos a pie consecutivos, descarta los vacíos y ajusta el primero
 * para salir "justo a tiempo" de coger el primer vehículo.
 */
function adjustWalkLegs(drafts: Draft[]): Draft[] {
  const merged: Draft[] = [];
  for (const dr of drafts) {
    const prev = merged[merged.length - 1];
    if (prev && prev.leg.mode === 'WALK' && dr.leg.mode === 'WALK') {
      prev.end = dr.end;
      prev.leg.to = dr.leg.to;
      prev.leg.distanceMeters += dr.leg.distanceMeters;
      prev.leg.durationSeconds += dr.leg.durationSeconds;
      prev.leg.geometry.push(...dr.leg.geometry.slice(1));
      continue;
    }
    merged.push(dr);
  }
  // Tramos a pie vacíos: punto pulsado justo sobre la parada.
  for (let k = merged.length - 1; k >= 0 && merged.length > 1; k--) {
    if (merged[k].leg.mode === 'WALK' && merged[k].leg.durationSeconds === 0) merged.splice(k, 1);
  }
  if (merged.length > 1 && merged[0].leg.mode === 'WALK') {
    merged[0].end = merged[1].start;
    merged[0].start = merged[0].end - merged[0].leg.durationSeconds;
  }
  return merged;
}

function summarize(legs: Leg[], startEpoch: number, endEpoch: number): Itinerary {
  const durationSeconds = Math.round((endEpoch - startEpoch) / 1000);
  const walking = legs.filter((l) => l.mode === 'WALK');
  const walkingSeconds = walking.reduce((acc, l) => acc + l.durationSeconds, 0);
  const transitSeconds = legs.filter((l) => l.mode !== 'WALK').reduce((acc, l) => acc + l.durationSeconds, 0);
  const transitCount = legs.length - walking.length;
  return {
    startTime: startEpoch,
    endTime: endEpoch,
    durationSeconds,
    walkingSeconds,
    walkingDistanceMeters: walking.reduce((acc, l) => acc + l.distanceMeters, 0),
    waitingSeconds: Math.max(0, durationSeconds - walkingSeconds - transitSeconds),
    transfers: Math.max(0, transitCount - 1),
    legs,
  };
}
