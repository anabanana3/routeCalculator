import DirectionsTransitIcon from '@mui/icons-material/DirectionsTransit';
import { Alert, Box, Divider, LinearProgress, Paper, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client';
import { ItineraryDetail } from './components/ItineraryDetail';
import { ItineraryList } from './components/ItineraryList';
import { MapView, type MapFocus } from './components/map/MapView';
import { SearchPanel, type DepartMode, type PointField } from './components/SearchPanel';
import type { LatLon, PlanResponse } from './types/api';
import { setDisplayTimeZone, toDateTimeLocalValue } from './utils/format';

const PANEL_WIDTH = 400;

function boundsOf(points: [number, number][]): [[number, number], [number, number]] {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}

export default function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [origin, setOrigin] = useState<LatLon | null>(null);
  const [destination, setDestination] = useState<LatLon | null>(null);
  const [activeField, setActiveField] = useState<PointField>('origin');
  const [departMode, setDepartMode] = useState<DepartMode>('now');
  const [departAt, setDepartAt] = useState(() => toDateTimeLocalValue(new Date()));
  const [locating, setLocating] = useState(false);

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  // Encuadre inicial con la zona cubierta por el GTFS.
  useEffect(() => {
    api
      .gtfsInfo()
      .then((info) => {
        setDisplayTimeZone(info.timezone);
        if (info.bounds) {
          const b = info.bounds;
          setFocus({ key: 'gtfs', bounds: [[b.minLat, b.minLon], [b.maxLat, b.maxLon]] });
        }
      })
      .catch(() => setError('No se puede conectar con el servidor'));
  }, []);

  // Búsqueda automática cuando cambian origen, destino u hora.
  useEffect(() => {
    if (!origin || !destination) {
      setPlan(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .plan(
        { from: origin, to: destination, dateTime: departMode === 'at' ? new Date(departAt).toISOString() : undefined },
        controller.signal,
      )
      .then((res) => {
        setDisplayTimeZone(res.timezone);
        setPlan(res);
        setHighlighted(0);
        setSelected(null);
        const all = res.itineraries.flatMap((it) => it.legs.flatMap((l) => l.geometry));
        if (all.length > 0) setFocus({ key: `plan-${Date.now()}`, bounds: boundsOf(all) });
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [origin, destination, departMode, departAt]);

  const handleMapClick = useCallback(
    (p: LatLon) => {
      if (activeField === 'origin') {
        setOrigin(p);
        if (!destination) setActiveField('destination');
      } else {
        setDestination(p);
        if (!origin) setActiveField('origin');
      }
    },
    [activeField, origin, destination],
  );

  const handleLocate = () => {
    if (!navigator.geolocation) return setError('El navegador no permite obtener la ubicación');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setActiveField('destination');
      },
      () => {
        setLocating(false);
        setError('No se ha podido obtener tu ubicación');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const itineraries = plan?.itineraries ?? [];
  const shown = itineraries[selected ?? highlighted] ?? null;

  const padding = useMemo(
    () =>
      isMobile
        ? { topLeft: [20, 20] as [number, number], bottomRight: [20, window.innerHeight * 0.5] as [number, number] }
        : { topLeft: [PANEL_WIDTH + 40, 20] as [number, number], bottomRight: [20, 20] as [number, number] },
    [isMobile],
  );

  return (
    <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapView
        origin={origin}
        destination={destination}
        itinerary={shown}
        focus={focus}
        paddingTopLeft={padding.topLeft}
        paddingBottomRight={padding.bottomRight}
        onMapClick={handleMapClick}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
      />

      <Paper
        elevation={4}
        sx={{
          position: 'absolute',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...(isMobile
            ? { left: 0, right: 0, bottom: 0, maxHeight: '55%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
            : { top: 16, left: 16, width: PANEL_WIDTH, maxHeight: 'calc(100% - 32px)' }),
        }}
      >
        <Box sx={{ p: 2, pb: 1.5, overflowY: selected !== null ? 'auto' : undefined }}>
          {selected === null && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <DirectionsTransitIcon color="primary" />
                <Typography variant="h6">Transporte público</Typography>
              </Box>
              <SearchPanel
                origin={origin}
                destination={destination}
                activeField={activeField}
                departMode={departMode}
                departAt={departAt}
                locating={locating}
                onActiveFieldChange={setActiveField}
                onClear={(f) => {
                  if (f === 'origin') setOrigin(null);
                  else setDestination(null);
                  setActiveField(f);
                }}
                onSwap={() => {
                  setOrigin(destination);
                  setDestination(origin);
                }}
                onLocate={handleLocate}
                onDepartModeChange={setDepartMode}
                onDepartAtChange={setDepartAt}
              />
            </>
          )}
          {selected !== null && shown && (
            <ItineraryDetail
              itinerary={shown}
              onBack={() => setSelected(null)}
              onFocusLeg={(i) => setFocus({ key: `leg-${selected}-${i}-${Date.now()}`, bounds: boundsOf(shown.legs[i].geometry) })}
            />
          )}
        </Box>

        {loading && <LinearProgress />}

        {selected === null && (error || plan) && (
          <>
            <Divider />
            <Box sx={{ overflowY: 'auto', p: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              {!error && plan && itineraries.length === 0 && (
                <Alert severity="info">{plan.message ?? 'No se han encontrado rutas'}</Alert>
              )}
              {!error && itineraries.length > 0 && (
                <ItineraryList
                  itineraries={itineraries}
                  highlighted={highlighted}
                  onHighlight={setHighlighted}
                  onSelect={(i) => {
                    setSelected(i);
                    const geom = itineraries[i].legs.flatMap((l) => l.geometry);
                    setFocus({ key: `sel-${i}-${Date.now()}`, bounds: boundsOf(geom) });
                  }}
                />
              )}
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}
