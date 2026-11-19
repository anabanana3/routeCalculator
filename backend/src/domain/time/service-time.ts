export const SECONDS_PER_DAY = 86400;

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(epochMs: number, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of getFormatter(timeZone).formatToParts(new Date(epochMs))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Desfase (ms) de la zona horaria respecto a UTC en un instante dado. */
function tzOffsetMs(epochMs: number, timeZone: string): number {
  const p = zonedParts(epochMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Convierte una hora local de la zona horaria a epoch (ms). */
export function zonedToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = tzOffsetMs(guess, timeZone);
  let epoch = guess - offset;
  const offset2 = tzOffsetMs(epoch, timeZone);
  if (offset2 !== offset) epoch = guess - offset2;
  return epoch;
}

/** Fecha de servicio (YYYYMMDD) en la zona horaria indicada. */
export function epochToServiceDate(epochMs: number, timeZone: string): string {
  const p = zonedParts(epochMs, timeZone);
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

function splitDate(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8))];
}

/**
 * Instante de referencia de un día de servicio GTFS: "mediodía menos 12h",
 * tal y como define la especificación (correcto en cambios de horario).
 */
export function serviceDayBaseEpoch(date: string, timeZone: string): number {
  const [y, m, d] = splitDate(date);
  return zonedToEpoch(y, m, d, 12, 0, 0, timeZone) - 12 * 3600 * 1000;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Día de la semana con lunes = 0 ... domingo = 6. */
export function weekdayMonday0(date: string): number {
  const [y, m, d] = splitDate(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Parsea "HH:MM:SS" (HH puede ser >= 24). Devuelve -1 si está vacío o es inválido. */
export function parseGtfsTime(value: string | undefined): number {
  if (!value) return -1;
  const parts = value.trim().split(':');
  if (parts.length < 2) return -1;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = parts.length > 2 ? Number(parts[2]) : 0;
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return -1;
  return h * 3600 + m * 60 + s;
}

export function formatGtfsTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
