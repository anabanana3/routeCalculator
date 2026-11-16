import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import DirectionsRailwayIcon from '@mui/icons-material/DirectionsRailway';
import DirectionsSubwayIcon from '@mui/icons-material/DirectionsSubway';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import TramIcon from '@mui/icons-material/Tram';
import { Box, type SvgIconProps } from '@mui/material';
import type { LegMode, RouteDto } from '../types/api';

export function ModeIcon({ mode, ...props }: { mode: LegMode } & SvgIconProps) {
  switch (mode) {
    case 'WALK':
      return <DirectionsWalkIcon {...props} />;
    case 'TRAM':
      return <TramIcon {...props} />;
    case 'SUBWAY':
    case 'MONORAIL':
      return <DirectionsSubwayIcon {...props} />;
    case 'RAIL':
    case 'FUNICULAR':
      return <DirectionsRailwayIcon {...props} />;
    case 'FERRY':
      return <DirectionsBoatIcon {...props} />;
    default:
      return <DirectionsBusIcon {...props} />;
  }
}

/** Distintivo de línea con su color, al estilo de Google/Apple Maps. */
export function RouteBadge({ route, mode, size = 'medium' }: { route: RouteDto; mode: LegMode; size?: 'small' | 'medium' }) {
  const small = size === 'small';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        bgcolor: route.color,
        color: route.textColor,
        borderRadius: 1,
        px: small ? 0.5 : 0.75,
        py: small ? 0.125 : 0.25,
        fontWeight: 700,
        fontSize: small ? 12 : 14,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <ModeIcon mode={mode} sx={{ fontSize: small ? 14 : 18 }} />
      {route.shortName || route.longName}
    </Box>
  );
}
