import type { RtAlert, RtInformedEntity } from './model.js';

/** Datos de un tramo en vehículo con los que se comparan los avisos. */
export interface AlertTarget {
  agencyId: string;
  routeId: string;
  routeType: number;
  directionId: number;
  /** trip_id del GTFS (sin el sufijo de los viajes generados desde frequencies.txt). */
  tripId: string;
  /** Paradas de subida y bajada (y sus estaciones padre). */
  stopIds: Set<string>;
}

/** ¿Está vigente el aviso en algún momento del intervalo [fromSec, toSec]? */
export function isAlertActive(alert: RtAlert, fromSec: number, toSec: number): boolean {
  if (alert.activePeriods.length === 0) return true;
  return alert.activePeriods.some((p) => (p.start ?? -Infinity) <= toSec && fromSec <= (p.end ?? Infinity));
}

/** Un selector coincide si todos los campos que indica coinciden (uno vacío no afecta a nada). */
export function entityMatches(e: RtInformedEntity, t: AlertTarget): boolean {
  let any = false;
  if (e.agencyId !== undefined) {
    if (e.agencyId !== t.agencyId) return false;
    any = true;
  }
  if (e.routeId !== undefined) {
    if (e.routeId !== t.routeId) return false;
    any = true;
  }
  if (e.routeType !== undefined) {
    if (e.routeType !== t.routeType) return false;
    any = true;
  }
  if (e.directionId !== undefined) {
    if (e.directionId !== t.directionId) return false;
    any = true;
  }
  if (e.tripId !== undefined) {
    if (e.tripId !== t.tripId) return false;
    any = true;
  }
  if (e.stopId !== undefined) {
    if (!t.stopIds.has(e.stopId)) return false;
    any = true;
  }
  return any;
}

export function alertApplies(alert: RtAlert, target: AlertTarget, fromSec: number, toSec: number): boolean {
  return isAlertActive(alert, fromSec, toSec) && alert.informedEntities.some((e) => entityMatches(e, target));
}
