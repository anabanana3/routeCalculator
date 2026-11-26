import type { Bounds } from '../geo/geo.js';
import type { SpatialIndex } from '../geo/spatial-index.js';

export type { Bounds } from '../geo/geo.js';

export interface Agency {
  id: string;
  name: string;
  url: string;
  timezone: string;
}

export interface Stop {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  parentStation: string;
}

export interface Route {
  id: string;
  agencyId: string;
  shortName: string;
  longName: string;
  type: number;
  color: string;
  textColor: string;
}

export interface Trip {
  id: string;
  routeIdx: number;
  serviceIdx: number;
  headsign: string;
  shapeId: string;
  directionId: number;
  /** Índice en TransitNetwork.tripTimes (-1 si el viaje no tiene horarios). */
  timesIdx: number;
  /** Desplazamiento en segundos respecto a tripTimes (viajes generados desde frequencies.txt). */
  offset: number;
}

/** Horarios de un viaje, con las paradas en orden de secuencia. */
export interface TripTimes {
  stops: Int32Array;
  /** stop_sequence original de cada parada (para casar los datos en tiempo real). */
  seq: Int32Array;
  arr: Int32Array;
  dep: Int32Array;
  /** shape_dist_traveled por parada (NaN si falta) o null si no hay datos. */
  dist: Float64Array | null;
}

export interface Service {
  id: string;
  /** Máscara de días: bit 0 = lunes ... bit 6 = domingo. */
  days: number;
  start: string;
  end: string;
  added: Set<string>;
  removed: Set<string>;
}

export interface Shape {
  lat: Float64Array;
  lon: Float64Array;
  dist: Float64Array | null;
}

export interface Footpath {
  to: number;
  seconds: number;
  meters: number;
}

/** Conexiones elementales (tramo parada -> parada siguiente) ordenadas por hora de salida. */
export interface Connections {
  count: number;
  depStop: Int32Array;
  arrStop: Int32Array;
  depTime: Int32Array;
  arrTime: Int32Array;
  trip: Int32Array;
  /** Posición de la parada de salida dentro de TripTimes. */
  pos: Int32Array;
}

/** Red de transporte construida a partir de un feed GTFS, lista para calcular rutas. */
export interface TransitNetwork {
  timezone: string;
  agencies: Agency[];
  stops: Stop[];
  stopIndex: Map<string, number>;
  routes: Route[];
  trips: Trip[];
  tripTimes: TripTimes[];
  services: Service[];
  shapes: Map<string, Shape>;
  connections: Connections;
  /** serviceIdx de cada viaje (acceso rápido durante el escaneo). */
  tripService: Int32Array;
  /** Índices de conexiones que salen de cada parada, ordenados por hora. */
  stopDepartures: Int32Array[];
  footpaths: Footpath[][];
  spatial: SpatialIndex;
  bounds: Bounds | null;
  loadedAt: Date;
}
