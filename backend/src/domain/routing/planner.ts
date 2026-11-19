import { haversineMeters, type LatLon } from '../geo/geo.js';
import type { TransitNetwork } from '../network/model.js';
import { addDays, epochToServiceDate, serviceDayBaseEpoch } from '../time/service-time.js';
import { type Access, type RawJourney, scanEarliestArrival } from './csa.js';
import { removeDominated } from './dominance.js';
import { ItineraryAssembler, type QueryContext } from './itinerary-assembler.js';
import type { Itinerary, NoRouteReason, TripPlan, TripQuery } from './itinerary.js';
import { MAX_ITINERARIES_LIMIT, type RoutingOptions } from './routing-options.js';
import { ServiceCalendar } from './service-calendar.js';

/** Calcula itinerarios en transporte público sobre una red ya cargada. */
export class Planner {
  private readonly calendar: ServiceCalendar;
  private readonly assembler: ItineraryAssembler;

  constructor(
    private readonly network: TransitNetwork,
    private readonly opts: RoutingOptions,
  ) {
    this.calendar = new ServiceCalendar(network.services, opts.ignoreServiceCalendar);
    this.assembler = new ItineraryAssembler(network);
  }

  plan(query: TripQuery): TripPlan {
    const { timezone } = this.network;
    const when = query.departureTime;
    const date = epochToServiceDate(when, timezone);
    const ctx: QueryContext = {
      base: serviceDayBaseEpoch(date, timezone),
      actives: [this.calendar.activeOn(addDays(date, -1)), this.calendar.activeOn(date), this.calendar.activeOn(addDays(date, 1))],
    };
    const maxItineraries = clampItineraries(query.maxItineraries ?? this.opts.maxItineraries);

    const access = this.nearbyStops(query.from);
    const egressList = this.nearbyStops(query.to);
    const egress = new Map(egressList.map((a) => [a.stop, a]));

    const journeys = access.length > 0 && egress.size > 0
      ? this.searchJourneys(Math.floor((when - ctx.base) / 1000), access, egress, ctx, maxItineraries)
      : [];

    const itineraries: Itinerary[] = removeDominated(
      journeys.map((j) => this.assembler.fromJourney(j, query.from, query.to, ctx)),
    ).slice(0, maxItineraries);

    const directMeters =
      haversineMeters(query.from.lat, query.from.lon, query.to.lat, query.to.lon) * this.opts.walkDistanceFactor;
    if (directMeters <= this.opts.maxDirectWalkMeters) {
      itineraries.push(this.assembler.walkOnly(query.from, query.to, when, directMeters, this.opts.walkSpeedMps));
    }
    itineraries.sort((a, b) => a.endTime - b.endTime);

    const plan: TripPlan = { requestedAt: when, timezone, itineraries };
    if (itineraries.length === 0) plan.noRouteReason = noRouteReason(access.length, egress.size);
    return plan;
  }

  /** Repite la búsqueda con salidas posteriores para obtener alternativas. */
  private searchJourneys(
    t0: number,
    access: Access[],
    egress: Map<number, Access>,
    ctx: QueryContext,
    maxItineraries: number,
  ): RawJourney[] {
    const journeys: RawJourney[] = [];
    let departure = t0;
    // Se buscan más candidatos de los pedidos para luego descartar los dominados.
    for (let i = 0; i < maxItineraries * 2; i++) {
      const j = scanEarliestArrival(this.network, {
        departure,
        access,
        egress,
        activeByDayOffset: ctx.actives,
        minTransferSeconds: this.opts.minTransferSeconds,
        maxSearchSeconds: this.opts.maxSearchHours * 3600,
      });
      if (!j) break;
      journeys.push(j);
      departure = this.journeyDeparture(j) + 60;
    }
    return journeys;
  }

  /** Paradas alcanzables a pie desde un punto (si no hay ninguna, se amplía el radio al doble). */
  nearbyStops(point: LatLon): Access[] {
    const { maxWalkMeters, walkDistanceFactor, walkSpeedMps } = this.opts;
    let found = this.network.spatial.within(point.lat, point.lon, maxWalkMeters);
    if (found.length === 0) found = this.network.spatial.within(point.lat, point.lon, maxWalkMeters * 2);
    return found.map((n) => {
      const meters = n.meters * walkDistanceFactor;
      return { stop: n.idx, meters: Math.round(meters), seconds: Math.round(meters / walkSpeedMps) };
    });
  }

  private journeyDeparture(j: RawJourney): number {
    const C = this.network.connections;
    const firstTransit = j.legs.find((l) => l.kind === 'transit');
    const first = j.legs[0];
    if (!firstTransit || firstTransit.kind !== 'transit') return j.arrival;
    const accessSeconds = first.kind === 'access' ? first.seconds : 0;
    return C.depTime[firstTransit.board] + firstTransit.shift - accessSeconds;
  }
}

export function clampItineraries(n: number): number {
  return Math.min(Math.max(Math.trunc(n) || 1, 1), MAX_ITINERARIES_LIMIT);
}

export function noRouteReason(accessCount: number, egressCount: number): NoRouteReason {
  if (accessCount === 0) return 'NO_STOPS_NEAR_ORIGIN';
  if (egressCount === 0) return 'NO_STOPS_NEAR_DESTINATION';
  return 'NO_ROUTE_FOUND';
}
