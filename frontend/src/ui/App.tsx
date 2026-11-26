import DirectionsTransitIcon from "@mui/icons-material/DirectionsTransit";
import {
  Alert,
  Box,
  Divider,
  LinearProgress,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useMemo } from "react";
import { useTripPlanner } from "../application/hooks/useTripPlanner";
import { useVehicles } from "../application/hooks/useVehicles";
import type { AppConfig } from "../infrastructure/config";
import { ItineraryDetail } from "./components/ItineraryDetail";
import { ItineraryList } from "./components/ItineraryList";
import { MapView } from "./components/map/MapView";
import { SearchPanel } from "./components/SearchPanel";
import { TimeZoneContext } from "./time-zone";

const PANEL_WIDTH = 400;

export default function App({ mapConfig }: { mapConfig: AppConfig["map"] }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const t = useTripPlanner();
  const vehicles = useVehicles(t.shown, t.realtimeRefreshSeconds);

  const padding = useMemo(
    () =>
      isMobile
        ? {
            topLeft: [20, 20] as [number, number],
            bottomRight: [20, window.innerHeight * 0.5] as [number, number],
          }
        : {
            topLeft: [PANEL_WIDTH + 40, 20] as [number, number],
            bottomRight: [20, 20] as [number, number],
          },
    [isMobile],
  );

  return (
    <TimeZoneContext.Provider value={t.timeZone}>
      <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
        <MapView
          config={mapConfig}
          origin={t.origin}
          destination={t.destination}
          itinerary={t.shown}
          vehicles={vehicles}
          focus={t.focus}
          paddingTopLeft={padding.topLeft}
          paddingBottomRight={padding.bottomRight}
          onMapClick={t.clickMap}
          onOriginChange={(p) => t.setPointFromMap("origin", p)}
          onDestinationChange={(p) => t.setPointFromMap("destination", p)}
        />

        <Paper
          elevation={4}
          sx={{
            position: "absolute",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            ...(isMobile
              ? {
                  left: 0,
                  right: 0,
                  bottom: 0,
                  maxHeight: "55%",
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                }
              : {
                  top: 16,
                  left: 16,
                  width: PANEL_WIDTH,
                  maxHeight: "calc(100% - 32px)",
                }),
          }}
        >
          <Box
            sx={{
              p: 2,
              pb: 1.5,
              overflowY: t.selected !== null ? "auto" : undefined,
            }}
          >
            {t.selected === null && (
              <>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <DirectionsTransitIcon color="primary" />
                  <Typography variant="h6">Transporte público</Typography>
                </Box>
                {t.ignoreCalendar && (
                  <Alert severity="warning" sx={{ mb: 1.5, py: 0 }}>
                    Modo depuración: se ignora el calendario de servicios
                  </Alert>
                )}
                <SearchPanel
                  origin={t.origin}
                  destination={t.destination}
                  activeField={t.activeField}
                  departMode={t.departMode}
                  departAt={t.departAt}
                  locating={t.locating}
                  searchFocus={t.searchFocus}
                  onActiveFieldChange={t.setActiveField}
                  onPlaceChange={t.choosePlace}
                  onSwap={t.swap}
                  onLocate={t.locate}
                  onDepartModeChange={t.setDepartMode}
                  onDepartAtChange={t.setDepartAt}
                />
              </>
            )}
            {t.selected !== null && t.shown && (
              <ItineraryDetail
                itinerary={t.shown}
                originLabel={t.origin?.label}
                destinationLabel={t.destination?.label}
                vehicles={vehicles}
                onBack={t.back}
                onFocusLeg={t.focusLeg}
              />
            )}
          </Box>

          {t.loading && <LinearProgress />}

          {t.selected === null && (t.error || t.plan) && (
            <>
              <Divider />
              <Box sx={{ overflowY: "auto", p: 1 }}>
                {t.error && <Alert severity="error">{t.error}</Alert>}
                {!t.error && t.plan && t.itineraries.length === 0 && (
                  <Alert severity="info">
                    {t.plan.message ?? "No se han encontrado rutas"}
                  </Alert>
                )}
                {!t.error && t.itineraries.length > 0 && (
                  <ItineraryList
                    itineraries={t.itineraries}
                    highlighted={t.highlighted}
                    onHighlight={t.setHighlighted}
                    onSelect={t.selectItinerary}
                  />
                )}
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </TimeZoneContext.Provider>
  );
}
