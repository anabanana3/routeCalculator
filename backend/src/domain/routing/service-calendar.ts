import type { Service } from '../network/model.js';
import { weekdayMonday0 } from '../time/service-time.js';

const MAX_CACHED_DATES = 30;

/** ¿Circula el servicio en la fecha de servicio (YYYYMMDD) indicada? */
export function isServiceActive(service: Service, date: string): boolean {
  if (service.removed.has(date)) return false;
  if (service.added.has(date)) return true;
  return (
    service.start !== '' &&
    service.start <= date &&
    date <= service.end &&
    (service.days & (1 << weekdayMonday0(date))) !== 0
  );
}

/** Calcula (y cachea) qué servicios circulan cada día. */
export class ServiceCalendar {
  private readonly cache = new Map<string, Uint8Array>();

  constructor(
    private readonly services: Service[],
    private readonly ignoreCalendar = false,
  ) {}

  /** Máscara con 1 en la posición de cada servicio activo en la fecha. */
  activeOn(date: string): Uint8Array {
    let active = this.cache.get(date);
    if (active) return active;
    active = new Uint8Array(this.services.length);
    if (this.ignoreCalendar) active.fill(1);
    else this.services.forEach((s, i) => (active![i] = isServiceActive(s, date) ? 1 : 0));
    if (this.cache.size >= MAX_CACHED_DATES) this.cache.clear();
    this.cache.set(date, active);
    return active;
  }
}
