import { createContext, useContext } from 'react';
import type { TimeZone } from '../domain/format';

/** Zona horaria del feed GTFS, para mostrar las horas como en las paradas. */
export const TimeZoneContext = createContext<TimeZone>(undefined);

export function useTimeZone(): TimeZone {
  return useContext(TimeZoneContext);
}
