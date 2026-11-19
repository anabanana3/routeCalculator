import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { Box, List, ListItemButton, Typography } from '@mui/material';
import { Fragment } from 'react';
import { useNow } from '../../application/hooks/useNow';
import { formatDistance, formatDuration, formatRelative, formatTime, formatTransfers } from '../../domain/format';
import { compactMinutes, firstTransitLeg, isWalk } from '../../domain/itinerary';
import type { ItineraryDto } from '../../domain/types/api';
import { useTimeZone } from '../time-zone';
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
          {isWalk(leg) || !leg.route ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', color: 'text.secondary' }}>
              <DirectionsWalkIcon fontSize="small" />
              {itinerary.legs.length > 1 && (
                <Typography variant="caption" sx={{ ml: -0.25 }}>
                  {compactMinutes(leg.durationSeconds)}
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
  const tz = useTimeZone();
  return (
    <List disablePadding>
      {itineraries.map((it, i) => {
        const firstTransit = firstTransitLeg(it);
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
                {formatTime(it.startTime, tz)} – {formatTime(it.endTime, tz)}
              </Typography>
              <Typography variant="h6" component="span">
                {formatDuration(it.durationSeconds)}
              </Typography>
            </Box>
            <Summary itinerary={it} />
            <Typography variant="body2" color="text.secondary">
              {firstTransit
                ? `Sale ${formatRelative(firstTransit.startTime, now, tz)} de ${firstTransit.from.name}`
                : 'Solo a pie'}
              {' · '}
              {formatDistance(it.walkingDistanceMeters)} a pie
              {it.transfers > 0 && ` · ${formatTransfers(it.transfers)}`}
            </Typography>
          </ListItemButton>
        );
      })}
    </List>
  );
}
