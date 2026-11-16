import type { RoutingConfig } from '../config.js';
import type { GtfsData, Stop } from '../gtfs/model.js';
import type {
  ItineraryDto,
  LatLon,
  LegDto,
  LegMode,
  PlaceDto,
  PlanRequest,
  PlanResponse,
  RouteDto,
} from '../types/api.js';
import { haversineMeters } from '../utils/geo.js';
import { addDays, epochToServiceDate, serviceDayBaseEpoch, SECONDS_PER_DAY, weekdayMonday0 } from '../utils/time.js';
import { type Access, type RawJourney, scanEarliestArrival } from './csa.js';
import { tripLegGeometry } from './geometry.js';

const NEXT_DEPARTURES = 3;

export function routeTypeToMode(type: number): LegMode {
  switch (type) {
    case 0: return 'TRAM';
    case 1: return 'SUBWAY';
    case 2: return 'RAIL';
    case 3: return 'BUS';
    case 4: return 'FERRY';
    case 5: return 'CABLE_CAR';
    case 6: return 'GONDOLA';
    case 7: return 'FUNICULAR';
    case 11: return 'TROLLEYBUS';
    case 12: return 'MONORAIL';
  }
  // Tipos extendidos (https://developers.google.com/transit/gtfs/reference/extended-route-types)
  if (type >= 100 && type < 200) return 'RAIL';
  if (type >= 400 && type < 500) return 'SUBWAY';
  if (type === 800) return 'TROLLEYBUS';
  if (type >= 900 && type < 1000) return 'TRAM';
  if (type === 1000 || type === 1200) return 'FERRY';
  if (type === 1300) return 'GONDOLA';
  if (type === 1400) return 'FUNICULAR';
  return 'BUS';
}

interface QueryContext {
  base: number;
  actives: [Uint8Array, Uint8Array, Uint8Array];
}

export class Planner {
  private readonly activeCache = new Map<string, Uint8Array>();

  constructor(
    private readonly data: GtfsData,
    private readonly cfg: RoutingConfig,
  ) {}

  plan(req: PlanRequest): PlanResponse {
    const d = this.data;
    const when = req.dateTime ? new Date(req.dateTime) : new Date();
    const date = epochToServiceDate(when.getTime(), d.timezone);
    const base = serviceDayBaseEpoch(date, d.timezone);
    const ctx: QueryContext = {
      base,
      actives: [this.activeServices(addDays(date, -1)), this.activeServices(date), this.activeServices(addDays(date, 1))],
    };
    const t0 = Math.floor((when.getTime() - base) / 1000);
    const maxItineraries = Math.min(Math.max(req.maxItineraries ?? this.cfg.maxItineraries, 1), 10);

    const response: PlanResponse = { requestedDateTime: when.toISOString(), timezone: d.timezone, itineraries: [] };

    const access = this.nearbyStops(req.from);
    const egressList = this.nearbyStops(req.to);
    const egress = new Map(egressList.map((a) => [a.stop, a]));

    const journeys: RawJourney[] = [];
    if (access.length > 0 && egress.size > 0) {
      let departure = t0;
      // Se buscan más candidatos de los pedidos para luego descartar los dominados.
      for (let i = 0; i < maxItineraries * 2; i++) {
        const j = scanEarliestArrival(d, {
          departure,
          access,
          egress,
          activeByDayOffset: ctx.actives,
          minTransferSeconds: this.cfg.minTransferSeconds,
          maxSearchSeconds: this.cfg.maxSearchHours * 3600,
        });
        if (!j) break;
        journeys.push(j);
        departure = this.journeyDeparture(j) + 60;
      }
    }

    let itineraries = journeys.map((j) => this.toItinerary(j, req, ctx));
    itineraries = removeDominated(itineraries).slice(0, maxItineraries);

    const directMeters = haversineMeters(req.from.lat, req.from.lon, req.to.lat, req.to.lon) * this.cfg.walkDistanceFactor;
    if (directMeters <= this.cfg.maxDirectWalkMeters) {
      itineraries.push(this.walkOnlyItinerary(req, when.getTime(), directMeters));
    }
    itineraries.sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime));

    if (itineraries.length === 0) {
      response.message =
        access.length === 0
          ? 'No hay paradas cerca del origen'
          : egress.size === 0
            ? 'No hay paradas cerca del destino'
            : 'No se ha encontrado ninguna ruta en transporte público';
    }
    response.itineraries = itineraries;
    return response;
  }

  // ---------------------------------------------------------------------------

  private activeServices(date: string): Uint8Array {
    let active = this.activeCache.get(date);
    if (active) return active;
    const weekday = weekdayMonday0(date);
    active = new Uint8Array(this.data.services.length);
    this.data.services.forEach((s, i) => {
      if (s.removed.has(date)) return;
      if (s.added.has(date)) active![i] = 1;
      else if (s.start && s.start <= date && date <= s.end && (s.days & (1 << weekday)) !== 0) active![i] = 1;
    });
    if (this.activeCache.size > 30) this.activeCache.clear();
    this.activeCache.set(date, active);
    return active;
  }

  private nearbyStops(point: LatLon): Access[] {
    const { maxWalkMeters, walkDistanceFactor, walkSpeedMps } = this.cfg;
    let found = this.data.spatial.within(point.lat, point.lon, maxWalkMeters);
    if (found.length === 0) found = this.data.spatial.within(point.lat, point.lon, maxWalkMeters * 2);
    return found.map((n) => {
      const meters = n.meters * walkDistanceFactor;
      return { stop: n.idx, meters: Math.round(meters), seconds: Math.round(meters / walkSpeedMps) };
    });
  }

  private journeyDeparture(j: RawJourney): number {
    const C = this.data.connections;
    const firstTransit = j.legs.find((l) => l.kind === 'transit');
    const first = j.legs[0];
    if (!firstTransit || firstTransit.kind !== 'transit') return j.arrival;
    const accessSeconds = first.kind === 'access' ? first.seconds : 0;
    return C.depTime[firstTransit.board] + firstTransit.shift - accessSeconds;
  }

  private iso(ctx: QueryContext, seconds: number): string {
    return new Date(ctx.base + seconds * 1000).toISOString();
  }

  private stopPlace(stop: Stop, time?: string): PlaceDto {
    return { name: stop.name, lat: stop.lat, lon: stop.lon, stopId: stop.id, stopCode: stop.code || undefined, time };
  }

  private routeDto(routeIdx: number): RouteDto {
    const r = this.data.routes[routeIdx];
    const agency = this.data.agencies.find((a) => a.id === r.agencyId) ?? this.data.agencies[0];
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

  private toItinerary(j: RawJourney, req: PlanRequest, ctx: QueryContext): ItineraryDto {
    const d = this.data;
    const C = d.connections;
    const originPlace: PlaceDto = { name: 'Origen', lat: req.from.lat, lon: req.from.lon };
    const destPlace: PlaceDto = { name: 'Destino', lat: req.to.lat, lon: req.to.lon };

    // Primero se calculan los tiempos de los tramos en vehículo; los tramos a pie se ajustan alrededor.
    interface Draft {
      leg: LegDto;
      start: number;
      end: number;
    }
    const drafts: Draft[] = [];
    let cursor = 0;

    j.legs.forEach((raw) => {
      if (raw.kind === 'transit') {
        const trip = d.trips[C.trip[raw.board]];
        const times = d.tripTimes[trip.timesIdx];
        const fromPos = C.pos[raw.board];
        const toPos = C.pos[raw.alight] + 1;
        const shift = trip.offset + raw.shift;
        const start = times.dep[fromPos] + shift;
        const end = times.arr[toPos] + shift;
        const geometry = tripLegGeometry(d, trip, fromPos, toPos);
        const intermediateStops: PlaceDto[] = [];
        for (let k = fromPos + 1; k < toPos; k++) {
          intermediateStops.push(this.stopPlace(d.stops[times.stops[k]], this.iso(ctx, times.arr[k] + shift)));
        }
        drafts.push({
          start,
          end,
          leg: {
            mode: routeTypeToMode(d.routes[trip.routeIdx].type),
            from: this.stopPlace(d.stops[times.stops[fromPos]], this.iso(ctx, start)),
            to: this.stopPlace(d.stops[times.stops[toPos]], this.iso(ctx, end)),
            startTime: '',
            endTime: '',
            durationSeconds: end - start,
            distanceMeters: Math.round(polylineLength(geometry)),
            geometry,
            route: this.routeDto(trip.routeIdx),
            tripId: trip.id,
            headsign: trip.headsign || undefined,
            intermediateStops,
            nextDepartures: this.nextDepartures(raw.board, start, ctx).map((t) => this.iso(ctx, t)),
          },
        });
        cursor = end;
        return;
      }

      const from = raw.kind === 'access' ? originPlace : this.stopPlace(d.stops[raw.fromStop]);
      const to = raw.kind === 'egress' ? destPlace : this.stopPlace(d.stops[raw.toStop]);
      const start = cursor;
      const end = start + raw.seconds;
      drafts.push({
        start,
        end,
        leg: {
          mode: 'WALK',
          from,
          to,
          startTime: '',
          endTime: '',
          durationSeconds: raw.seconds,
          distanceMeters: raw.meters,
          geometry: [
            [from.lat, from.lon],
            [to.lat, to.lon],
          ],
        },
      });
      cursor = end;
    });

    // Une tramos a pie consecutivos (p. ej. acceso + transbordo a pie).
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
    // Descarta tramos a pie vacíos (punto pulsado justo sobre la parada).
    for (let k = merged.length - 1; k >= 0 && merged.length > 1; k--) {
      if (merged[k].leg.mode === 'WALK' && merged[k].leg.durationSeconds === 0) merged.splice(k, 1);
    }
    // El primer tramo a pie se ajusta para salir "justo a tiempo" de coger el primer vehículo.
    if (merged.length > 1 && merged[0].leg.mode === 'WALK') {
      merged[0].end = merged[1].start;
      merged[0].start = merged[0].end - merged[0].leg.durationSeconds;
    }

    const legs = merged.map((m) => {
      m.leg.startTime = this.iso(ctx, m.start);
      m.leg.endTime = this.iso(ctx, m.end);
      return m.leg;
    });

    const start = merged[0].start;
    const end = merged[merged.length - 1].end;
    const walking = legs.filter((l) => l.mode === 'WALK');
    const walkingSeconds = walking.reduce((acc, l) => acc + l.durationSeconds, 0);
    const transitSeconds = legs.filter((l) => l.mode !== 'WALK').reduce((acc, l) => acc + l.durationSeconds, 0);
    const transitCount = legs.length - walking.length;

    return {
      startTime: this.iso(ctx, start),
      endTime: this.iso(ctx, end),
      durationSeconds: end - start,
      walkingSeconds,
      walkingDistanceMeters: walking.reduce((acc, l) => acc + l.distanceMeters, 0),
      waitingSeconds: Math.max(0, end - start - walkingSeconds - transitSeconds),
      transfers: Math.max(0, transitCount - 1),
      legs,
    };
  }

  /** Próximas salidas de la misma línea y sentido desde la parada de la conexión dada. */
  private nextDepartures(connIdx: number, fromTime: number, ctx: QueryContext): number[] {
    const d = this.data;
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

  private walkOnlyItinerary(req: PlanRequest, startEpoch: number, meters: number): ItineraryDto {
    const seconds = Math.round(meters / this.cfg.walkSpeedMps);
    const startTime = new Date(startEpoch).toISOString();
    const endTime = new Date(startEpoch + seconds * 1000).toISOString();
    return {
      startTime,
      endTime,
      durationSeconds: seconds,
      walkingSeconds: seconds,
      walkingDistanceMeters: Math.round(meters),
      waitingSeconds: 0,
      transfers: 0,
      legs: [
        {
          mode: 'WALK',
          from: { name: 'Origen', ...req.from },
          to: { name: 'Destino', ...req.to },
          startTime,
          endTime,
          durationSeconds: seconds,
          distanceMeters: Math.round(meters),
          geometry: [
            [req.from.lat, req.from.lon],
            [req.to.lat, req.to.lon],
          ],
        },
      ],
    };
  }
}

function polylineLength(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

/** Elimina itinerarios que salen antes y llegan igual o más tarde que otro (y los duplicados). */
function removeDominated(list: ItineraryDto[]): ItineraryDto[] {
  const key = (it: ItineraryDto) => it.legs.map((l) => `${l.tripId ?? 'walk'}:${l.from.stopId ?? ''}`).join('|');
  const unique = new Map<string, ItineraryDto>();
  for (const it of list) if (!unique.has(key(it))) unique.set(key(it), it);
  const items = [...unique.values()];
  return items.filter((a) => {
    const aStart = Date.parse(a.startTime);
    const aEnd = Date.parse(a.endTime);
    return !items.some((b) => {
      if (b === a) return false;
      const bStart = Date.parse(b.startTime);
      const bEnd = Date.parse(b.endTime);
      const better = bStart >= aStart && bEnd <= aEnd && (bStart > aStart || bEnd < aEnd || b.transfers < a.transfers);
      return better && b.transfers <= a.transfers;
    });
  });
}
