import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type {
  RealtimeFeed,
  RtAlert,
  RtInformedEntity,
  RtStopTimeEvent,
  RtStopTimeUpdate,
  RtTripDescriptor,
  RtTripUpdate,
  RtVehiclePosition,
  StopScheduleRelationship,
  TripScheduleRelationship,
  VehicleStopStatus,
} from '../../domain/realtime/model.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

// Forma del mensaje tras FeedMessage.toObject({ longs: Number, enums: String }).
interface PlainTranslated {
  translation?: { text?: string; language?: string }[];
}
interface PlainTrip {
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
  scheduleRelationship?: string;
}
interface PlainEvent {
  delay?: number;
  time?: number;
}
interface PlainStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: PlainEvent;
  departure?: PlainEvent;
  scheduleRelationship?: string;
}
interface PlainEntity {
  id?: string;
  isDeleted?: boolean;
  tripUpdate?: {
    trip?: PlainTrip;
    vehicle?: { id?: string; label?: string };
    stopTimeUpdate?: PlainStopTimeUpdate[];
    timestamp?: number;
    delay?: number;
  };
  vehicle?: {
    trip?: PlainTrip;
    vehicle?: { id?: string; label?: string };
    position?: { latitude?: number; longitude?: number; bearing?: number; speed?: number };
    currentStopSequence?: number;
    stopId?: string;
    currentStatus?: string;
    timestamp?: number;
  };
  alert?: {
    activePeriod?: { start?: number; end?: number }[];
    informedEntity?: {
      agencyId?: string;
      routeId?: string;
      routeType?: number;
      directionId?: number;
      trip?: PlainTrip;
      stopId?: string;
    }[];
    cause?: string;
    effect?: string;
    severityLevel?: string;
    url?: PlainTranslated;
    headerText?: PlainTranslated;
    descriptionText?: PlainTranslated;
  };
}
interface PlainFeed {
  header?: { timestamp?: number; incrementality?: string };
  entity?: PlainEntity[];
}

/** Longitud máxima de los textos de los avisos (vienen de un tercero y acaban en la interfaz). */
export const MAX_TEXT_LENGTH = 2000;

const TRIP_RELATIONSHIPS = new Set<TripScheduleRelationship>([
  'SCHEDULED',
  'ADDED',
  'UNSCHEDULED',
  'CANCELED',
  'REPLACEMENT',
  'DUPLICATED',
  'DELETED',
  'NEW',
]);
const STOP_RELATIONSHIPS = new Set<StopScheduleRelationship>(['SCHEDULED', 'SKIPPED', 'NO_DATA', 'UNSCHEDULED']);
const VEHICLE_STATUSES = new Set<VehicleStopStatus>(['INCOMING_AT', 'STOPPED_AT', 'IN_TRANSIT_TO']);

const finite = (n: number | undefined): number | undefined => (n !== undefined && Number.isFinite(n) ? n : undefined);
const nonEmpty = (s: string | undefined): string | undefined => (s && s.trim() !== '' ? s.trim() : undefined);

/** Texto en el idioma preferido; si no existe, el que no indica idioma o el primero. */
export function pickTranslation(ts: PlainTranslated | undefined, language: string): string {
  const list = (ts?.translation ?? []).filter((t) => t.text);
  if (list.length === 0) return '';
  const lang = language.toLowerCase();
  const chosen =
    list.find((t) => t.language?.toLowerCase() === lang) ??
    list.find((t) => t.language?.toLowerCase().startsWith(`${lang}-`)) ??
    list.find((t) => !t.language) ??
    list[0];
  return chosen.text!.trim().slice(0, MAX_TEXT_LENGTH);
}

/** Solo enlaces http(s): el valor acaba en un href del cliente. */
export function safeUrl(value: string): string {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

function toTrip(t: PlainTrip | undefined): RtTripDescriptor {
  const rel = t?.scheduleRelationship as TripScheduleRelationship | undefined;
  return {
    tripId: nonEmpty(t?.tripId),
    routeId: nonEmpty(t?.routeId),
    directionId: finite(t?.directionId),
    startTime: nonEmpty(t?.startTime),
    startDate: nonEmpty(t?.startDate),
    scheduleRelationship: rel && TRIP_RELATIONSHIPS.has(rel) ? rel : 'SCHEDULED',
  };
}

function toEvent(e: PlainEvent | undefined): RtStopTimeEvent | undefined {
  if (!e) return undefined;
  const ev: RtStopTimeEvent = {};
  const delay = finite(e.delay);
  const time = finite(e.time);
  if (delay !== undefined) ev.delay = delay;
  if (time !== undefined && time > 0) ev.time = time;
  return ev.delay === undefined && ev.time === undefined ? undefined : ev;
}

function toStopTimeUpdate(u: PlainStopTimeUpdate): RtStopTimeUpdate {
  const rel = u.scheduleRelationship as StopScheduleRelationship | undefined;
  return {
    stopSequence: finite(u.stopSequence),
    stopId: nonEmpty(u.stopId),
    arrival: toEvent(u.arrival),
    departure: toEvent(u.departure),
    scheduleRelationship: rel && STOP_RELATIONSHIPS.has(rel) ? rel : 'SCHEDULED',
  };
}

function toTripUpdate(e: NonNullable<PlainEntity['tripUpdate']>): RtTripUpdate {
  return {
    trip: toTrip(e.trip),
    vehicleId: nonEmpty(e.vehicle?.id),
    delay: finite(e.delay),
    timestamp: finite(e.timestamp),
    stopTimeUpdates: (e.stopTimeUpdate ?? []).map(toStopTimeUpdate),
  };
}

function toVehicle(id: string, v: NonNullable<PlainEntity['vehicle']>): RtVehiclePosition | null {
  const lat = finite(v.position?.latitude);
  const lon = finite(v.position?.longitude);
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const status = v.currentStatus as VehicleStopStatus | undefined;
  return {
    id,
    vehicleId: nonEmpty(v.vehicle?.id),
    label: nonEmpty(v.vehicle?.label)?.slice(0, 100),
    trip: v.trip ? toTrip(v.trip) : undefined,
    lat,
    lon,
    bearing: finite(v.position?.bearing),
    speed: finite(v.position?.speed),
    timestamp: finite(v.timestamp),
    stopId: nonEmpty(v.stopId),
    currentStopSequence: finite(v.currentStopSequence),
    currentStatus: status && VEHICLE_STATUSES.has(status) ? status : undefined,
  };
}

function toAlert(id: string, a: NonNullable<PlainEntity['alert']>, language: string): RtAlert {
  const informedEntities: RtInformedEntity[] = (a.informedEntity ?? []).map((e) => ({
    agencyId: nonEmpty(e.agencyId),
    routeId: nonEmpty(e.routeId),
    routeType: finite(e.routeType),
    directionId: finite(e.directionId),
    tripId: nonEmpty(e.trip?.tripId),
    stopId: nonEmpty(e.stopId),
  }));
  return {
    id,
    activePeriods: (a.activePeriod ?? []).map((p) => ({
      start: finite(p.start) || undefined,
      end: finite(p.end) || undefined,
    })),
    informedEntities,
    cause: a.cause ?? 'UNKNOWN_CAUSE',
    effect: a.effect ?? 'UNKNOWN_EFFECT',
    severity: a.severityLevel ?? 'UNKNOWN_SEVERITY',
    header: pickTranslation(a.headerText, language),
    description: pickTranslation(a.descriptionText, language),
    url: safeUrl(pickTranslation(a.url, language)),
  };
}

/** Decodifica un FeedMessage GTFS-Realtime (protobuf) al modelo del dominio. */
export function decodeRealtimeFeed(buffer: Uint8Array, language = 'es'): RealtimeFeed {
  const message = FeedMessage.decode(buffer);
  const plain = FeedMessage.toObject(message, { longs: Number, enums: String }) as PlainFeed;
  const feed: RealtimeFeed = { timestamp: finite(plain.header?.timestamp) || undefined, tripUpdates: [], vehicles: [], alerts: [] };
  (plain.entity ?? []).forEach((e, i) => {
    if (e.isDeleted) return;
    const id = nonEmpty(e.id) ?? String(i);
    if (e.tripUpdate) feed.tripUpdates.push(toTripUpdate(e.tripUpdate));
    if (e.vehicle) {
      const v = toVehicle(id, e.vehicle);
      if (v) feed.vehicles.push(v);
    }
    if (e.alert) feed.alerts.push(toAlert(id, e.alert, language));
  });
  return feed;
}
