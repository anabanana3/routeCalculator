import type { LatLon } from '../../domain/geo/geo.js';
import type { TransitNetwork } from '../../domain/network/model.js';
import type { TripPlan } from '../../domain/routing/itinerary.js';
import { Planner } from '../../domain/routing/planner.js';
import type { RoutingOptions } from '../../domain/routing/routing-options.js';
import { NetworkNotLoadedError } from '../errors.js';
import { type Logger, silentLogger } from '../ports/logger.js';
import type { NetworkProvider } from '../ports/network-provider.js';
import { noRealtime, type RealtimeProvider } from '../ports/realtime-provider.js';
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

/** Solo se espera a los datos en tiempo real si la salida es cercana: para otros días no aportan nada. */
export const REALTIME_WAIT_WINDOW_MS = 2 * 3600_000;

const fmtPoint = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/** Caso de uso: calcular itinerarios entre dos puntos. */
export class PlanTripUseCase {
  private readonly plannerFor: (network: TransitNetwork) => Planner;

  constructor(
    private readonly networks: NetworkProvider,
    options: RoutingOptions,
    private readonly logger: Logger = silentLogger,
    private readonly now: () => number = Date.now,
    private readonly realtime: RealtimeProvider = noRealtime,
  ) {
    this.plannerFor = memoizeLast((network) => new Planner(network, options));
  }

  async execute(cmd: PlanTripCommand): Promise<PlanTripResult> {
    if (!this.networks.current) throw new NetworkNotLoadedError();

    const requested = cmd.dateTime ? Date.parse(cmd.dateTime) : this.now();
    const departureTime = Number.isNaN(requested) ? this.now() : requested;
    if (this.realtime.enabled) {
      if (Math.abs(departureTime - this.now()) <= REALTIME_WAIT_WINDOW_MS) await this.realtime.awaitFresh();
      else this.realtime.touch();
    }

    // Se vuelve a leer: la red ha podido recargarse durante la espera.
    const network = this.networks.current;
    if (!network) throw new NetworkNotLoadedError();
    const started = this.now();
    const plan = this.plannerFor(network).plan(
      { from: cmd.from, to: cmd.to, departureTime, maxItineraries: cmd.maxItineraries },
      this.realtime.enabled ? this.realtime.indexFor(network) : null,
    );
    const computeMs = this.now() - started;

    // Las coordenadas del usuario son datos personales: solo se registran en nivel debug.
    this.logger.info(
      `${plan.itineraries.length} itinerarios (${computeMs}ms)` +
        `${plan.realtimeUpdatedAt !== undefined ? ' con tiempo real' : ''}` +
        `${plan.noRouteReason ? ` - ${plan.noRouteReason}` : ''}`,
    );
    this.logger.debug(`${fmtPoint(cmd.from)} -> ${fmtPoint(cmd.to)} @ ${new Date(plan.requestedAt).toISOString()}`);
    for (const it of plan.itineraries) {
      const legs = it.legs
        .map((l) => {
          if (l.mode === 'WALK') return `pie ${Math.round(l.durationSeconds / 60)}min`;
          const delay = l.realtime ? ` (${l.realtime.departureDelaySeconds >= 0 ? '+' : ''}${l.realtime.departureDelaySeconds}s)` : '';
          return `${l.route?.shortName} ${l.from.name}>${l.to.name}${delay}`;
        })
        .join(' | ');
      this.logger.debug(`  ${new Date(it.startTime).toISOString()} -> ${new Date(it.endTime).toISOString()}: ${legs}`);
    }
    return { plan, computeMs };
  }
}
