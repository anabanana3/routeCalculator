import { type LatLon, polylineLength } from '../geo/geo.js';
import type { Stop, TransitNetwork } from '../network/model.js';
import { SECONDS_PER_DAY } from '../time/service-time.js';
import type { RawJourney } from './csa.js';
import { tripLegGeometry } from './geometry.js';
import type { Itinerary, Leg, Place, RouteInfo } from './itinerary.js';
import { routeTypeToMode } from './route-mode.js';

export const NEXT_DEPARTURES = 3;

/** Contexto temporal de una consulta: base del día de servicio y servicios activos (día -1, 0, +1). */
export interface QueryContext {
  /** epoch ms de la base del día de servicio consultado. */
  base: number;
  actives: [Uint8Array, Uint8Array, Uint8Array];
}

interface Draft {
  leg: Leg;
  start: number;
  end: number;
}

/** Convierte los viajes "en bruto" del algoritmo en itinerarios con tramos, horas y geometría. */
export class ItineraryAssembler {
  constructor(private readonly network: TransitNetwork) {}

  fromJourney(j: RawJourney, from: LatLon, to: LatLon, ctx: QueryContext): Itinerary {
    const d = this.network;
    const C = d.connections;
    const at = (seconds: number) => ctx.base + seconds * 1000;
    const originPlace: Place = { name: 'Origen', lat: from.lat, lon: from.lon };
    const destPlace: Place = { name: 'Destino', lat: to.lat, lon: to.lon };

    // Primero se calculan los tiempos de los tramos en vehículo; los tramos a pie se ajustan alrededor.
    const drafts: Draft[] = [];
    let cursor = 0;

    for (const raw of j.legs) {
      if (raw.kind === 'transit') {
        const trip = d.trips[C.trip[raw.board]];
        const times = d.tripTimes[trip.timesIdx];
        const fromPos = C.pos[raw.board];
        const toPos = C.pos[raw.alight] + 1;
        const shift = trip.offset + raw.shift;
        const start = times.dep[fromPos] + shift;
        const end = times.arr[toPos] + shift;
        const geometry = tripLegGeometry(d, trip, fromPos, toPos);
        const intermediateStops: Place[] = [];
        for (let k = fromPos + 1; k < toPos; k++) {
          intermediateStops.push(stopPlace(d.stops[times.stops[k]], at(times.arr[k] + shift)));
        }
        drafts.push({
          start,
          end,
          leg: {
            mode: routeTypeToMode(d.routes[trip.routeIdx].type),
            from: stopPlace(d.stops[times.stops[fromPos]], at(start)),
            to: stopPlace(d.stops[times.stops[toPos]], at(end)),
            startTime: 0,
            endTime: 0,
            durationSeconds: end - start,
            distanceMeters: Math.round(polylineLength(geometry)),
            geometry,
            route: this.routeInfo(trip.routeIdx),
            tripId: trip.id,
            headsign: trip.headsign || undefined,
            intermediateStops,
            nextDepartures: this.nextDepartures(raw.board, start, ctx).map(at),
          },
        });
        cursor = end;
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
    const d = this.network;
    const C = d.connections;
    const stop = C.depStop[connIdx];
    const nextStop = C.arrStop[connIdx];
    const routeIdx = d.trips[C.trip[connIdx]].routeIdx;
    const list = d.stopDepartures[stop];
    const result: number[] = [];

    for (let k = 0; k < 3; k++) {
      const shift = (k - 1) * SECONDS_PER_DAY;
      const active = ctx.actives[k];
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (C.depTime[list[mid]] + shift < fromTime) lo = mid + 1;
        else hi = mid;
      }
      let found = 0;
      for (let i = lo; i < list.length && found < NEXT_DEPARTURES; i++) {
        const c = list[i];
        const trip = d.trips[C.trip[c]];
        if (trip.routeIdx !== routeIdx || C.arrStop[c] !== nextStop) continue;
        if (active[trip.serviceIdx] === 0) continue;
        result.push(C.depTime[c] + shift);
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
