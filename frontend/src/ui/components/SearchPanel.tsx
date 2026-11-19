import PlaceIcon from '@mui/icons-material/Place';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import TripOriginIcon from '@mui/icons-material/TripOrigin';
import { Box, IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { DESTINATION_COLOR } from '../../domain/itinerary';
import type { LatLon } from '../../domain/types/api';
import type { DepartMode, PointField, SelectedPlace } from '../../domain/types/place';
import { PlaceSearchField } from './PlaceSearchField';

export type { DepartMode, PointField } from '../../domain/types/place';

interface Props {
  origin: SelectedPlace | null;
  destination: SelectedPlace | null;
  activeField: PointField;
  departMode: DepartMode;
  departAt: string;
  locating: PointField | null;
  searchFocus?: LatLon;
  onActiveFieldChange: (f: PointField) => void;
  onPlaceChange: (f: PointField, place: SelectedPlace | null) => void;
  onSwap: () => void;
  onLocate: (f: PointField) => void;
  onDepartModeChange: (m: DepartMode) => void;
  onDepartAtChange: (v: string) => void;
}

export function SearchPanel(props: Props) {
  const field = (f: PointField) => ({
    value: f === 'origin' ? props.origin : props.destination,
    active: props.activeField === f,
    locating: props.locating === f,
    searchFocus: props.searchFocus,
    onFocus: () => props.onActiveFieldChange(f),
    onChange: (p: SelectedPlace | null) => props.onPlaceChange(f, p),
    onLocate: () => props.onLocate(f),
  });

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <PlaceSearchField
            {...field('origin')}
            placeholder="Origen: busca o pulsa en el mapa"
            icon={<TripOriginIcon fontSize="small" color="primary" />}
          />
          <PlaceSearchField
            {...field('destination')}
            placeholder="Destino: busca o pulsa en el mapa"
            icon={<PlaceIcon fontSize="small" sx={{ color: DESTINATION_COLOR }} />}
          />
        </Stack>
        <Tooltip title="Intercambiar origen y destino">
          <IconButton onClick={props.onSwap} aria-label="Intercambiar">
            <SwapVertIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={props.departMode}
          onChange={(_, v: DepartMode | null) => v && props.onDepartModeChange(v)}
        >
          <ToggleButton value="now">Salir ahora</ToggleButton>
          <ToggleButton value="at">Salir a las</ToggleButton>
        </ToggleButtonGroup>
        {props.departMode === 'at' && (
          <TextField
            size="small"
            type="datetime-local"
            value={props.departAt}
            onChange={(e) => props.onDepartAtChange(e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': 'Fecha y hora de salida' } }}
            sx={{ flex: 1, minWidth: 190 }}
          />
        )}
      </Box>
    </Stack>
  );
}
