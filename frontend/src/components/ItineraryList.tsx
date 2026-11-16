import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { Box, List, ListItemButton, Typography } from '@mui/material';
import { Fragment } from 'react';
import { useNow } from '../hooks/useNow';
import type { ItineraryDto } from '../types/api';
import { formatDistance, formatDuration, formatRelative, formatTime } from '../utils/format';
import { RouteBadge } from './RouteBadge';

interface Props {
  itineraries: ItineraryDto[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onSelect: (index: number) => void;
}

function Summary({ itinerary }: { itinerary: ItineraryDto }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      {itinerary.legs.map((leg, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
          {leg.mode === 'WALK' || !leg.route ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', color: 'text.secondary' }}>
              <DirectionsWalkIcon fontSize="small" />
              {itinerary.legs.length > 1 && (
                <Typography variant="caption" sx={{ ml: -0.25 }}>
                  {Math.max(1, Math.round(leg.durationSeconds / 60))}
                </Typography>
              )}
            </Box>
          ) : (
            <RouteBadge route={leg.route} mode={leg.mode} size="small" />
          )}
        </Fragment>
      ))}
    </Box>
  );
}

export function ItineraryList({ itineraries, highlighted, onHighlight, onSelect }: Props) {
  const now = useNow();
  return (
    <List disablePadding>
      {itineraries.map((it, i) => {
        const firstTransit = it.legs.find((l) => l.mode !== 'WALK');
        return (
          <ListItemButton
            key={i}
            selected={i === highlighted}
            onMouseEnter={() => onHighlight(i)}
            onClick={() => onSelect(i)}
            sx={{ borderRadius: 2, mb: 0.5, alignItems: 'flex-start', flexDirection: 'column', gap: 0.75 }}
          >
            <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography variant="body1" fontWeight={500}>
                {formatTime(it.startTime)} – {formatTime(it.endTime)}
              </Typography>
              <Typography variant="h6" component="span">
                {formatDuration(it.durationSeconds)}
              </Typography>
            </Box>
            <Summary itinerary={it} />
            <Typography variant="body2" color="text.secondary">
              {firstTransit
                ? `Sale ${formatRelative(firstTransit.startTime, now)} de ${firstTransit.from.name}`
                : 'Solo a pie'}
              {' · '}
              {formatDistance(it.walkingDistanceMeters)} a pie
              {it.transfers > 0 && ` · ${it.transfers} transbordo${it.transfers > 1 ? 's' : ''}`}
            </Typography>
          </ListItemButton>
        );
      })}
    </List>
  );
}
