import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Button, Collapse, IconButton, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useNow } from '../../application/hooks/useNow';
import { formatDistance, formatDuration, formatRelative, formatTime } from '../../domain/format';
import {
  DESTINATION_COLOR,
  isWalk,
  legColor,
  ORIGIN_COLOR,
  otherDepartures,
  rideStopsLabel,
  showLegStart,
} from '../../domain/itinerary';
import type { ItineraryDto, LegDto } from '../../domain/types/api';
import { useTimeZone } from '../time-zone';
import { ModeIcon, RouteBadge } from './RouteBadge';

interface Props {
  itinerary: ItineraryDto;
  originLabel?: string;
  destinationLabel?: string;
  onBack: () => void;
  onFocusLeg: (index: number) => void;
}

/** Fila de la línea de tiempo: [hora] [punto/línea] [contenido]. */
function Row({ time, marker, children }: { time?: string; marker: ReactNode; children: ReactNode }) {
  const tz = useTimeZone();
  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', minHeight: 32 }}>
      <Box sx={{ width: 48, flexShrink: 0, pt: 0.25 }}>
        {time && (
          <Typography variant="body2" fontWeight={500}>
            {formatTime(time, tz)}
          </Typography>
        )}
      </Box>
      <Box sx={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>{marker}</Box>
      <Box sx={{ flex: 1, minWidth: 0, pl: 1, py: 0.25 }}>{children}</Box>
    </Box>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <Box sx={{ width: 14, height: 14, mt: 0.5, borderRadius: '50%', border: `3px solid ${color}`, bgcolor: 'white', zIndex: 1 }} />
  );
}

function Line({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <Box
      sx={{
        width: 0,
        borderLeft: dashed ? `4px dotted ${color}` : `6px solid ${color}`,
        my: '-4px',
        height: 'calc(100% + 8px)',
      }}
    />
  );
}

function TransitContent({ leg, now }: { leg: LegDto; now: number }) {
  const tz = useTimeZone();
  const [open, setOpen] = useState(false);
  const stops = leg.intermediateStops ?? [];
  const others = otherDepartures(leg);
  return (
    <Stack spacing={0.5} sx={{ py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {leg.route && <RouteBadge route={leg.route} mode={leg.mode} />}
        {leg.headsign && (
          <Typography variant="body2" noWrap>
            dirección <strong>{leg.headsign}</strong>
          </Typography>
        )}
      </Box>
      <Typography variant="body2" color="primary" fontWeight={500}>
        Sale {formatRelative(leg.startTime, now, tz)}
      </Typography>
      {others.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Siguientes: {others.map((t) => formatTime(t, tz)).join(' · ')}
        </Typography>
      )}
      <Button
        size="small"
        color="inherit"
        onClick={() => setOpen((o) => !o)}
        endIcon={stops.length > 0 ? open ? <ExpandLessIcon /> : <ExpandMoreIcon /> : undefined}
        sx={{ alignSelf: 'flex-start', px: 0.5, color: 'text.secondary', fontWeight: 400 }}
        disabled={stops.length === 0}
      >
        {rideStopsLabel(leg)} · {formatDuration(leg.durationSeconds)}
      </Button>
      <Collapse in={open}>
        <Stack spacing={0.25} sx={{ pl: 0.5 }}>
          {stops.map((s, k) => (
            <Typography key={`${s.stopId ?? ''}-${k}`} variant="caption" color="text.secondary">
              {s.time && formatTime(s.time, tz)} · {s.name}
            </Typography>
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}

export function ItineraryDetail({ itinerary, originLabel, destinationLabel, onBack, onFocusLeg }: Props) {
  const now = useNow();
  const tz = useTimeZone();
  const { legs } = itinerary;

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={onBack} aria-label="Volver">
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h6" lineHeight={1.2}>
            {formatDuration(itinerary.durationSeconds)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatTime(itinerary.startTime, tz)} – {formatTime(itinerary.endTime, tz)} ·{' '}
            {formatDistance(itinerary.walkingDistanceMeters)} a pie
          </Typography>
        </Box>
      </Box>

      <Box>
        {legs.map((leg, i) => {
          const color = legColor(leg);
          return (
            <Box key={i} data-testid={`leg-${i}`} onClick={() => onFocusLeg(i)} sx={{ cursor: 'pointer' }}>
              {showLegStart(legs, i) && (
                <Row time={leg.startTime} marker={<Dot color={i === 0 ? ORIGIN_COLOR : color} />}>
                  <Typography variant="body1" fontWeight={500} noWrap>
                    {i === 0 ? (originLabel ?? 'Origen') : leg.from.name}
                  </Typography>
                  {leg.from.stopCode && (
                    <Typography variant="caption" color="text.secondary">
                      Parada {leg.from.stopCode}
                    </Typography>
                  )}
                </Row>
              )}
              <Row marker={<Line color={color} dashed={isWalk(leg)} />}>
                {isWalk(leg) ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 1, color: 'text.secondary' }}>
                    <ModeIcon mode="WALK" fontSize="small" />
                    <Typography variant="body2">
                      Camina {formatDuration(leg.durationSeconds)} ({formatDistance(leg.distanceMeters)})
                    </Typography>
                  </Box>
                ) : (
                  <TransitContent leg={leg} now={now} />
                )}
              </Row>
              {!isWalk(leg) && (
                <Row time={leg.endTime} marker={<Dot color={color} />}>
                  <Typography variant="body1" fontWeight={500} noWrap>
                    {leg.to.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Bájate aquí{leg.to.stopCode ? ` · Parada ${leg.to.stopCode}` : ''}
                  </Typography>
                </Row>
              )}
            </Box>
          );
        })}
        <Row time={itinerary.endTime} marker={<Dot color={DESTINATION_COLOR} />}>
          <Typography variant="body1" fontWeight={500}>
            {destinationLabel ?? 'Destino'}
          </Typography>
        </Row>
      </Box>
    </Stack>
  );
}
