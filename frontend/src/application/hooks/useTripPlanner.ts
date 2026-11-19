import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCoords, toDateTimeLocalValue } from '../../domain/format';
import { boundsOf, itinerariesGeometry, type MapFocus, pointBounds, sameLocation } from '../../domain/geo';
import {
  buildPlanRequest,
  CURRENT_LOCATION_LABEL,
  GEOLOCATION_MESSAGES,
  nextActiveFieldAfterMapClick,
  otherField,
} from '../../domain/trip-search';
import type { ItineraryDto, LatLon, PlanResponse } from '../../domain/types/api';
import type { DepartMode, PointField, SelectedPlace } from '../../domain/types/place';
import { GeolocationError } from '../ports/geolocation';
import { useServices } from '../services';

export const SERVER_UNREACHABLE = 'No se puede conectar con el servidor';

let focusCounter = 0;
const focusKey = (prefix: string) => `${prefix}-${++focusCounter}`;

/** Estado y acciones de la pantalla de búsqueda de rutas (independiente de cómo se pinte). */
export function useTripPlanner(now: () => Date = () => new Date()) {
  const { api, geolocation } = useServices();

  const [origin, setOrigin] = useState<SelectedPlace | null>(null);
  const [destination, setDestination] = useState<SelectedPlace | null>(null);
  const [activeField, setActiveField] = useState<PointField>('origin');
  const [departMode, setDepartMode] = useState<DepartMode>('now');
  const [departAt, setDepartAt] = useState(() => toDateTimeLocalValue(now()));
  const [locating, setLocating] = useState<PointField | null>(null);

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [ignoreCalendar, setIgnoreCalendar] = useState(false);
  const [timeZone, setTimeZone] = useState<string | undefined>();

  // Para comprobar, al volver la geocodificación inversa, que el punto no ha cambiado.
  const placesRef = useRef({ origin, destination });
  placesRef.current = { origin, destination };

  // Encuadre inicial con la zona cubierta por el GTFS.
  useEffect(() => {
    const controller = new AbortController();
    api
      .gtfsInfo(controller.signal)
      .then((info) => {
        setTimeZone(info.timezone);
        setIgnoreCalendar(info.ignoreServiceCalendar === true);
        if (info.bounds) {
          const b = info.bounds;
          setFocus({ key: 'gtfs', bounds: [[b.minLat, b.minLon], [b.maxLat, b.maxLon]] });
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(SERVER_UNREACHABLE);
      });
    return () => controller.abort();
  }, [api]);

  // Cálculo automático cuando cambian las coordenadas o la hora (no cuando solo cambia el nombre mostrado).
  useEffect(() => {
    const request = buildPlanRequest(origin, destination, departMode, departAt);
    if (!request) {
      setPlan(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .plan(request, controller.signal)
      .then((res) => {
        setTimeZone(res.timezone);
        setPlan(res);
        setHighlighted(0);
        setSelected(null);
        const all = itinerariesGeometry(res.itineraries);
        if (all.length > 0) setFocus({ key: focusKey('plan'), bounds: boundsOf(all) });
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, origin?.lat, origin?.lon, destination?.lat, destination?.lon, departMode, departAt]);

  const setPlace = useCallback((field: PointField, place: SelectedPlace | null) => {
    if (field === 'origin') setOrigin(place);
    else setDestination(place);
  }, []);

  /** Coloca un punto con sus coordenadas y después le pone nombre con la geocodificación inversa. */
  const setPointFromMap = useCallback(
    (field: PointField, p: LatLon) => {
      setPlace(field, { ...p, kind: 'map', label: formatCoords(p) });
      api
        .geocodeReverse(p)
        .then(({ result }) => {
          if (!result || !sameLocation(placesRef.current[field], p)) return;
          setPlace(field, { ...p, kind: 'map', label: result.label, secondary: result.secondary });
        })
        .catch(() => undefined);
    },
    [api, setPlace],
  );

  const choosePlace = useCallback(
    (field: PointField, place: SelectedPlace | null) => {
      setPlace(field, place);
      if (!place) return;
      const other = field === 'origin' ? placesRef.current.destination : placesRef.current.origin;
      if (!other) {
        setActiveField(otherField(field));
        setFocus({ key: focusKey('place'), bounds: pointBounds(place) });
      }
    },
    [setPlace],
  );

  const clickMap = useCallback(
    (p: LatLon) => {
      setPointFromMap(activeField, p);
      setActiveField(nextActiveFieldAfterMapClick(activeField, origin, destination));
    },
    [activeField, origin, destination, setPointFromMap],
  );

  const locate = useCallback(
    (field: PointField) => {
      setLocating(field);
      geolocation
        .getCurrentPosition()
        .then((p) => choosePlace(field, { ...p, kind: 'current', label: CURRENT_LOCATION_LABEL }))
        .catch((err: unknown) => {
          setError(GEOLOCATION_MESSAGES[err instanceof GeolocationError ? err.reason : 'unavailable']);
        })
        .finally(() => setLocating(null));
    },
    [geolocation, choosePlace],
  );

  const swap = useCallback(() => {
    const { origin: o, destination: d } = placesRef.current;
    setOrigin(d);
    setDestination(o);
  }, []);

  const itineraries: ItineraryDto[] = plan?.itineraries ?? [];
  const shown = itineraries[selected ?? highlighted] ?? null;

  const selectItinerary = useCallback(
    (i: number) => {
      setSelected(i);
      const it = itineraries[i];
      if (it) setFocus({ key: focusKey('sel'), bounds: boundsOf(itinerariesGeometry([it])) });
    },
    [itineraries],
  );

  const focusLeg = useCallback(
    (i: number) => {
      const leg = shown?.legs[i];
      if (leg && leg.geometry.length > 0) setFocus({ key: focusKey('leg'), bounds: boundsOf(leg.geometry) });
    },
    [shown],
  );

  // Se priorizan resultados de búsqueda cerca del otro punto ya elegido.
  const searchFocus = useMemo(() => {
    const p = activeField === 'origin' ? destination : origin;
    return p ? { lat: p.lat, lon: p.lon } : undefined;
  }, [activeField, origin?.lat, origin?.lon, destination?.lat, destination?.lon]);

  return {
    origin,
    destination,
    activeField,
    departMode,
    departAt,
    locating,
    plan,
    loading,
    error,
    highlighted,
    selected,
    focus,
    ignoreCalendar,
    timeZone,
    itineraries,
    shown,
    searchFocus,
    setActiveField,
    setDepartMode,
    setDepartAt,
    setHighlighted,
    choosePlace,
    setPointFromMap,
    clickMap,
    locate,
    swap,
    selectItinerary,
    back: () => setSelected(null),
    focusLeg,
  };
}

export type TripPlanner = ReturnType<typeof useTripPlanner>;
