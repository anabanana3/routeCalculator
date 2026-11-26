// Datos GTFS-Realtime ya decodificados, independientes del formato protobuf.
// Las horas son epoch en segundos, como en la especificación.

export type TripScheduleRelationship =
  | 'SCHEDULED'
  | 'ADDED'
  | 'UNSCHEDULED'
  | 'CANCELED'
  | 'REPLACEMENT'
  | 'DUPLICATED'
  | 'DELETED'
  | 'NEW';

export type StopScheduleRelationship = 'SCHEDULED' | 'SKIPPED' | 'NO_DATA' | 'UNSCHEDULED';

export interface RtTripDescriptor {
  tripId?: string;
  routeId?: string;
  directionId?: number;
  /** HH:MM:SS (viajes de frequencies.txt). */
  startTime?: string;
  /** YYYYMMDD */
  startDate?: string;
  scheduleRelationship: TripScheduleRelationship;
}

export interface RtStopTimeEvent {
  delay?: number;
  time?: number;
}

export interface RtStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: RtStopTimeEvent;
  departure?: RtStopTimeEvent;
  scheduleRelationship: StopScheduleRelationship;
}

export interface RtTripUpdate {
  trip: RtTripDescriptor;
  vehicleId?: string;
  delay?: number;
  timestamp?: number;
  stopTimeUpdates: RtStopTimeUpdate[];
}

export type VehicleStopStatus = 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';

export interface RtVehiclePosition {
  /** Identificador de la entidad del feed. */
  id: string;
  vehicleId?: string;
  label?: string;
  trip?: RtTripDescriptor;
  lat: number;
  lon: number;
  bearing?: number;
  /** m/s */
  speed?: number;
  timestamp?: number;
  stopId?: string;
  currentStopSequence?: number;
  currentStatus?: VehicleStopStatus;
}

/** Selector de a qué afecta un aviso: todos los campos indicados deben coincidir. */
export interface RtInformedEntity {
  agencyId?: string;
  routeId?: string;
  routeType?: number;
  directionId?: number;
  tripId?: string;
  stopId?: string;
}

export interface RtTimeRange {
  start?: number;
  end?: number;
}

export interface RtAlert {
  id: string;
  activePeriods: RtTimeRange[];
  informedEntities: RtInformedEntity[];
  cause: string;
  effect: string;
  severity: string;
  header: string;
  description: string;
  url: string;
}

export interface RealtimeFeed {
  /** Momento en que se generó el feed (header.timestamp). */
  timestamp?: number;
  tripUpdates: RtTripUpdate[];
  vehicles: RtVehiclePosition[];
  alerts: RtAlert[];
}
