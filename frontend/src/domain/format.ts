import type { LatLon } from './types/api';

/** Valor por defecto (vacío = zona horaria del navegador). */
export type TimeZone = string | undefined;

export function formatTime(iso: string, timeZone?: TimeZone): string {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatCoords(p: LatLon): string {
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

/** Texto relativo "en 5 min", "ahora", "hace 2 min". */
export function formatRelative(iso: string, now: number, timeZone?: TimeZone): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);
  if (minutes === 0) return 'ahora';
  if (minutes > 0) return minutes < 60 ? `en ${minutes} min` : `a las ${formatTime(iso, timeZone)}`;
  return `hace ${-minutes} min`;
}

/** Valor para un <input type="datetime-local"> con la hora local del navegador. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "1 transbordo", "2 transbordos". */
export function formatTransfers(n: number): string {
  return `${n} transbordo${n === 1 ? '' : 's'}`;
}
