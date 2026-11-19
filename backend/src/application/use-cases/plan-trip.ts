import type { LatLon } from '../../domain/geo/geo.js';
import type { TransitNetwork } from '../../domain/network/model.js';
import type { TripPlan } from '../../domain/routing/itinerary.js';
import { Planner } from '../../domain/routing/planner.js';
import type { RoutingOptions } from '../../domain/routing/routing-options.js';
import { NetworkNotLoadedError } from '../errors.js';
import { type Logger, silentLogger } from '../ports/logger.js';
import type { NetworkProvider } from '../ports/network-provider.js';
import { memoizeLast } from '../services/memoize-last.js';

export interface PlanTripCommand {
  from: LatLon;
  to: LatLon;
  /** ISO 8601. Si no se indica, se usa la hora actual. */
  dateTime?: string;
  maxItineraries?: number;
}

export interface PlanTripResult {
  plan: TripPlan;
  computeMs: number;
}

const fmtPoint = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/** Caso de uso: calcular itinerarios entre dos puntos. */
export class PlanTripUseCase {
  private readonly plannerFor: (network: TransitNetwork) => Planner;

  constructor(
    private readonly networks: NetworkProvider,
    options: RoutingOptions,
    private readonly logger: Logger = silentLogger,
    private readonly now: () => number = Date.now,
  ) {
    this.plannerFor = memoizeLast((network) => new Planner(network, options));
  }

  execute(cmd: PlanTripCommand): PlanTripResult {
    const network = this.networks.current;
    if (!network) throw new NetworkNotLoadedError();

    const started = this.now();
    const departureTime = cmd.dateTime ? Date.parse(cmd.dateTime) : started;
    const plan = this.plannerFor(network).plan({
      from: cmd.from,
      to: cmd.to,
      departureTime: Number.isNaN(departureTime) ? started : departureTime,
      maxItineraries: cmd.maxItineraries,
    });
    const computeMs = this.now() - started;

    // Las coordenadas del usuario son datos personales: solo se registran en nivel debug.
    this.logger.info(
      `${plan.itineraries.length} itinerarios (${computeMs}ms)${plan.noRouteReason ? ` - ${plan.noRouteReason}` : ''}`,
    );
    this.logger.debug(`${fmtPoint(cmd.from)} -> ${fmtPoint(cmd.to)} @ ${new Date(plan.requestedAt).toISOString()}`);
    for (const it of plan.itineraries) {
      const legs = it.legs
        .map((l) =>
          l.mode === 'WALK' ? `pie ${Math.round(l.durationSeconds / 60)}min` : `${l.route?.shortName} ${l.from.name}>${l.to.name}`,
        )
        .join(' | ');
      this.logger.debug(`  ${new Date(it.startTime).toISOString()} -> ${new Date(it.endTime).toISOString()}: ${legs}`);
    }
    return { plan, computeMs };
  }
}
