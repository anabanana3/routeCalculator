import type { AlertDto, ItineraryDto, LegDto, VehicleDto } from './types/api';

export type DelayStatus = 'on-time' | 'late' | 'early';
export type AlertLevel = 'error' | 'warning' | 'info';

/** Menos de un minuto de diferencia con el horario se considera puntual. */
export const ON_TIME_THRESHOLD_SECONDS = 60;
export const ON_TIME_COLOR = '#188038';
export const LATE_COLOR = '#d93025';
export const EARLY_COLOR = '#e37400';

export function delayStatus(seconds: number): DelayStatus {
  if (seconds >= ON_TIME_THRESHOLD_SECONDS) return 'late';
  if (seconds <= -ON_TIME_THRESHOLD_SECONDS) return 'early';
  return 'on-time';
}

export function delayColor(status: DelayStatus): string {
  return status === 'late' ? LATE_COLOR : status === 'early' ? EARLY_COLOR : ON_TIME_COLOR;
}

/** "Puntual", "3 min de retraso", "2 min antes de hora". */
export function formatDelay(seconds: number): string {
  const status = delayStatus(seconds);
  if (status === 'on-time') return 'Puntual';
  const minutes = Math.max(1, Math.round(Math.abs(seconds) / 60));
  return status === 'late' ? `${minutes} min de retraso` : `${minutes} min antes de hora`;
}

export const hasRealtime = (leg: LegDto) => leg.realtime !== undefined;

/** Avisos de todos los tramos, sin repetir. */
export function itineraryAlerts(it: ItineraryDto): AlertDto[] {
  const seen = new Map<string, AlertDto>();
  for (const leg of it.legs) for (const a of leg.alerts ?? []) if (!seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()];
}

const EFFECT_LABELS: Record<string, string> = {
  NO_SERVICE: 'Sin servicio',
  REDUCED_SERVICE: 'Servicio reducido',
  SIGNIFICANT_DELAYS: 'Retrasos importantes',
  DETOUR: 'Desvío',
  ADDITIONAL_SERVICE: 'Servicio adicional',
  MODIFIED_SERVICE: 'Servicio modificado',
  STOP_MOVED: 'Parada trasladada',
  ACCESSIBILITY_ISSUE: 'Problema de accesibilidad',
};

/** Título del aviso: su cabecera o, si no tiene, una descripción del efecto. */
export function alertTitle(a: AlertDto): string {
  return a.header || EFFECT_LABELS[a.effect] || 'Aviso';
}

export function alertLevel(a: AlertDto): AlertLevel {
  if (a.severity === 'SEVERE' || a.effect === 'NO_SERVICE') return 'error';
  if (a.severity === 'WARNING' || ['SIGNIFICANT_DELAYS', 'DETOUR', 'REDUCED_SERVICE', 'STOP_MOVED'].includes(a.effect)) {
    return 'warning';
  }
  return 'info';
}

/** "1 aviso", "2 avisos". */
export function formatAlertCount(n: number): string {
  return `${n} aviso${n === 1 ? '' : 's'}`;
}

/** Viajes de los tramos en vehículo (para pedir la posición de los vehículos). */
export function transitTripIds(it: ItineraryDto | null): string[] {
  if (!it) return [];
  return [...new Set(it.legs.map((l) => l.tripId).filter((id): id is string => !!id))];
}

/** Solo tiene sentido seguir los vehículos de un itinerario que está en curso o empieza pronto. */
export const VEHICLE_TRACKING_WINDOW_MS = 2 * 3600_000;

export function isTrackable(it: ItineraryDto | null, now: number): boolean {
  if (!it) return false;
  return Date.parse(it.startTime) - now <= VEHICLE_TRACKING_WINDOW_MS && Date.parse(it.endTime) >= now;
}

const STATUS_LABELS: Record<NonNullable<VehicleDto['status']>, string> = {
  STOPPED_AT: 'en',
  INCOMING_AT: 'llegando a',
  IN_TRANSIT_TO: 'hacia',
};

/** "llegando a Sol", "hacia Atocha" o "" si no se sabe. */
export function vehicleWhere(v: VehicleDto): string {
  if (!v.stopName) return '';
  return `${STATUS_LABELS[v.status ?? 'IN_TRANSIT_TO']} ${v.stopName}`;
}

/** "hace 20 s", "hace 3 min" (antigüedad de la posición). */
export function formatAge(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return seconds < 60 ? `hace ${seconds} s` : `hace ${Math.round(seconds / 60)} min`;
}
