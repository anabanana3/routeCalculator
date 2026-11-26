import type {
  RealtimeFeed,
  RtAlert,
  RtStopTimeUpdate,
  RtTripUpdate,
  RtVehiclePosition,
  TripScheduleRelationship,
} from '../../src/domain/realtime/model.js';

/** Lunes de la red de prueba. */
export const RT_DATE = '20260302';

interface TripUpdateOptions {
  delay?: number;
  startDate?: string | null;
  startTime?: string;
  relationship?: TripScheduleRelationship;
  updates?: RtStopTimeUpdate[];
  vehicleId?: string;
  timestamp?: number;
}

export function tripUpdate(tripId: string, o: TripUpdateOptions = {}): RtTripUpdate {
  return {
    trip: {
      tripId,
      startDate: o.startDate === null ? undefined : (o.startDate ?? RT_DATE),
      startTime: o.startTime,
      scheduleRelationship: o.relationship ?? 'SCHEDULED',
    },
    delay: o.delay,
    vehicleId: o.vehicleId,
    timestamp: o.timestamp,
    stopTimeUpdates: o.updates ?? [],
  };
}

export function stu(stopSequence: number, extra: Partial<RtStopTimeUpdate> = {}): RtStopTimeUpdate {
  return { stopSequence, scheduleRelationship: 'SCHEDULED', ...extra };
}

export function vehicle(id: string, extra: Partial<RtVehiclePosition> = {}): RtVehiclePosition {
  return { id, lat: 40.4, lon: -3.697, ...extra };
}

export function alert(id: string, extra: Partial<RtAlert> = {}): RtAlert {
  return {
    id,
    activePeriods: [],
    informedEntities: [],
    cause: 'UNKNOWN_CAUSE',
    effect: 'UNKNOWN_EFFECT',
    severity: 'UNKNOWN_SEVERITY',
    header: `Aviso ${id}`,
    description: '',
    url: '',
    ...extra,
  };
}

export function feed(tripUpdates: RtTripUpdate[] = [], extra: Partial<RealtimeFeed> = {}): RealtimeFeed {
  return { tripUpdates, vehicles: [], alerts: [], ...extra };
}
