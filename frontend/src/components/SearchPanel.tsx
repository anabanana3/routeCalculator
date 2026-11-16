import ClearIcon from '@mui/icons-material/Clear';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PlaceIcon from '@mui/icons-material/Place';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import TripOriginIcon from '@mui/icons-material/TripOrigin';
import {
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import type { LatLon } from '../types/api';
import { formatCoords } from '../utils/format';

export type PointField = 'origin' | 'destination';
export type DepartMode = 'now' | 'at';

interface Props {
  origin: LatLon | null;
  destination: LatLon | null;
  activeField: PointField;
  departMode: DepartMode;
  departAt: string;
  locating: boolean;
  onActiveFieldChange: (f: PointField) => void;
  onClear: (f: PointField) => void;
  onSwap: () => void;
  onLocate: () => void;
  onDepartModeChange: (m: DepartMode) => void;
  onDepartAtChange: (v: string) => void;
}

function PointInput({
  value,
  active,
  placeholder,
  icon,
  onFocus,
  onClear,
  endAction,
}: {
  value: LatLon | null;
  active: boolean;
  placeholder: string;
  icon: React.ReactNode;
  onFocus: () => void;
  onClear: () => void;
  endAction?: React.ReactNode;
}) {
  return (
    <TextField
      size="small"
      fullWidth
      value={value ? formatCoords(value) : ''}
      placeholder={placeholder}
      onClick={onFocus}
      focused={active}
      slotProps={{
        input: {
          readOnly: true,
          startAdornment: <InputAdornment position="start">{icon}</InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              {value ? (
                <IconButton size="small" onClick={(e) => (e.stopPropagation(), onClear())} aria-label="Borrar">
                  <ClearIcon fontSize="small" />
                </IconButton>
              ) : (
                endAction
              )}
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

export function SearchPanel(props: Props) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Stack spacing={1} sx={{ flex: 1 }}>
          <PointInput
            value={props.origin}
            active={props.activeField === 'origin'}
            placeholder="Origen: pulsa en el mapa"
            icon={<TripOriginIcon fontSize="small" color="primary" />}
            onFocus={() => props.onActiveFieldChange('origin')}
            onClear={() => props.onClear('origin')}
            endAction={
              <Tooltip title="Usar mi ubicación">
                <span>
                  <IconButton size="small" onClick={props.onLocate} disabled={props.locating} aria-label="Mi ubicación">
                    <MyLocationIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            }
          />
          <PointInput
            value={props.destination}
            active={props.activeField === 'destination'}
            placeholder="Destino: pulsa en el mapa"
            icon={<PlaceIcon fontSize="small" sx={{ color: '#ea4335' }} />}
            onFocus={() => props.onActiveFieldChange('destination')}
            onClear={() => props.onClear('destination')}
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
            sx={{ flex: 1, minWidth: 190 }}
          />
        )}
      </Box>
    </Stack>
  );
}
