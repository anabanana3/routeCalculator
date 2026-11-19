/** Parámetros del cálculo de rutas (reglas de negocio configurables). */
export interface RoutingOptions {
  maxWalkMeters: number;
  maxTransferMeters: number;
  maxDirectWalkMeters: number;
  walkSpeedMps: number;
  /** Factor que convierte distancia en línea recta en distancia a pie estimada. */
  walkDistanceFactor: number;
  minTransferSeconds: number;
  maxItineraries: number;
  maxSearchHours: number;
  /** Depuración: considera activos todos los servicios cualquier día (ignora calendar/calendar_dates). */
  ignoreServiceCalendar: boolean;
}

/** Límite absoluto de itinerarios por consulta, independiente de lo que pida el cliente. */
export const MAX_ITINERARIES_LIMIT = 10;
