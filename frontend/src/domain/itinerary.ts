import type { ItineraryDto, LegDto } from './types/api';

export const WALK_COLOR = '#9aa0a6';
export const MAP_WALK_COLOR = '#5f6368';
export const DEFAULT_ROUTE_COLOR = '#1a73e8';
export const ORIGIN_COLOR = '#1a73e8';
export const DESTINATION_COLOR = '#ea4335';

export const isWalk = (leg: LegDto) => leg.mode === 'WALK';

export function legColor(leg: LegDto): string {
  return isWalk(leg) ? WALK_COLOR : (leg.route?.color ?? DEFAULT_ROUTE_COLOR);
}

export function routeColor(leg: LegDto): string {
  return leg.route?.color ?? DEFAULT_ROUTE_COLOR;
}

export function firstTransitLeg(it: ItineraryDto): LegDto | undefined {
  return it.legs.find((l) => !isWalk(l));
}

/** Próximas salidas sin incluir la del propio tramo. */
export function otherDepartures(leg: LegDto): string[] {
  return (leg.nextDepartures ?? []).filter((t) => t !== leg.startTime);
}

/**
 * ¿Se muestra la fila de inicio del tramo i? Si el anterior era en vehículo
 * ya se mostró su llegada, y un tramo a pie empieza justo ahí.
 */
export function showLegStart(legs: LegDto[], i: number): boolean {
  return i === 0 || isWalk(legs[i - 1]) || !isWalk(legs[i]);
}

/** Minutos redondeados (mínimo 1) para el resumen compacto. */
export function compactMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** "3 paradas", "1 parada": paradas recorridas en el vehículo (intermedias + la de bajada). */
export function rideStopsLabel(leg: LegDto): string {
  const n = (leg.intermediateStops?.length ?? 0) + 1;
  return `${n} parada${n > 1 ? 's' : ''}`;
}
